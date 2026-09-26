/* Realtime Database rules, evaluated offline against a mock club.

   Why this exists: every other part of this app can be tested by tapping around.
   Rules cannot — the only way to try them is to publish them over the live club,
   and README's own warning is "Do this in order. Out of order locks you out."
   The failure it describes is silent: reads keep working through the bootstrap
   clause while every write is refused, so the club goes read-only and nobody
   finds out until someone tries to make a sub at a game.

   So this reads the rules JSON straight out of README.md rather than keeping a
   copy. What is tested is the artifact you actually paste into the console; a
   copy would drift from it, and a rules test that drifts is worse than none.

   Exits non-zero when an expectation fails. */

const fs = require('fs');
const path = require('path');

const README = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');

/* ---------------- pulling the rules out of README ---------------- */

/* README carries several fenced JSON blocks: the open rules to start with, the
   locked-down set, and two fragments to paste alongside it. Pick them by what
   they contain rather than by position, so reordering the prose cannot silently
   start testing the wrong block. */
function jsonBlocks() {
  return [...README.matchAll(/```json\n([\s\S]*?)```/g)].map(m => m[1]);
}

function loadRules() {
  let full = null;
  const fragments = {};
  let complete = null;
  for (const raw of jsonBlocks()) {
    let doc = null;
    try { doc = JSON.parse(raw); } catch (e) { }
    if (doc && doc.rules) {
      // the block README tells you to paste carries every tier at once
      if (raw.includes('access/index') && raw.includes('appOwners')) complete = doc.rules;
      else if (raw.includes('access/index')) full = doc.rules;
      continue;
    }
    // a fragment is a bare "key": { ... } pair, valid JSON once wrapped
    try {
      const frag = JSON.parse('{' + raw + '}');
      for (const k of Object.keys(frag)) fragments[k] = frag[k];
    } catch (e) { }
  }
  /* Prefer the single complete block README says to paste, so the test and the
     artifact are the same text. The fragments shown elsewhere in README are
     explanation; assert they still match what the complete block says, or the
     prose and the thing you publish can drift apart without anyone noticing. */
  if (complete) {
    for (const k of ['retired', 'appOwners']) {
      if (!fragments[k]) continue;
      if (JSON.stringify(fragments[k]) !== JSON.stringify(complete[k]))
        throw new Error('README\'s "' + k + '" example no longer matches the complete ruleset');
    }
    return complete;
  }
  if (!full) throw new Error('could not find the rules block in README.md');
  for (const k of ['retired', 'appOwners']) {
    if (fragments[k]) full[k] = fragments[k];
    else console.log('  note: no "' + k + '" fragment found in README');
  }
  return full;
}

const RULES = loadRules();

/* ---------------- a database, and snapshots of it ---------------- */

const NOW = 1758240000000;

/* Realtime Database has no empty nodes — a key whose value is {} does not
   exist. README leans on that ("never require `games`"), so model it. */
const isEmpty = v => v === null || v === undefined
  || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);

function at(tree, p) {
  let cur = tree;
  for (const s of String(p || '').split('/').filter(Boolean)) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = cur[s];
  }
  return cur;
}

function snap(tree, p) {
  const v = at(tree, p);
  const child = c => snap(tree, p ? p + '/' + c : c);
  return {
    val: () => (v === undefined ? null : v),
    exists: () => !isEmpty(v),
    child,
    parent: () => snap(tree, String(p || '').split('/').slice(0, -1).join('/')),
    hasChild: k => child(k).exists(),
    hasChildren: ks => ks.every(k => child(k).exists()),
    isString: () => typeof v === 'string',
    isNumber: () => typeof v === 'number',
    isBoolean: () => typeof v === 'boolean',
    getPriority: () => null
  };
}

function withWrite(tree, p, value) {
  const out = JSON.parse(JSON.stringify(tree));
  const segs = String(p).split('/').filter(Boolean);
  let cur = out;
  for (let i = 0; i < segs.length - 1; i++) {
    if (cur[segs[i]] === null || typeof cur[segs[i]] !== 'object') cur[segs[i]] = {};
    cur = cur[segs[i]];
  }
  if (value === null) delete cur[segs[segs.length - 1]];
  else cur[segs[segs.length - 1]] = value;
  return out;
}

/* ---------------- evaluating one rule expression ---------------- */

/* The expressions are a subset of JS, so run them as JS with the snapshot API
   bound in. A throw counts as false, which is what the database does when an
   expression reaches through a null (auth.uid while signed out, say). */
function evalExpr(expr, ctx) {
  if (typeof expr === 'boolean') return expr;
  if (typeof expr !== 'string') return false;
  const names = Object.keys(ctx);
  try {
    return !!new Function(...names, 'return (' + expr.replace(/\s+/g, ' ') + ');')(...names.map(n => ctx[n]));
  } catch (e) {
    return false;
  }
}

/* Every rule node from the root down to `p`, with whatever $variables bound on
   the way. A named child beats a $wildcard at the same level; none of the
   current rules mix the two, so nothing here depends on that. */
function chain(p) {
  const out = [{ node: RULES, at: '', vars: {} }];
  let cur = RULES, vars = {}, acc = '';
  for (const s of String(p || '').split('/').filter(Boolean)) {
    let next = null;
    if (cur && Object.prototype.hasOwnProperty.call(cur, s)) next = cur[s];
    else {
      const wild = cur && Object.keys(cur).find(k => k.startsWith('$'));
      if (wild) { next = cur[wild]; vars = { ...vars, [wild]: s }; }
    }
    if (!next || typeof next !== 'object') break;
    acc = acc ? acc + '/' + s : s;
    cur = next;
    out.push({ node: cur, at: acc, vars: { ...vars } });
  }
  return out;
}

/* Read and write cascade downwards and can only ever be granted: a rule on any
   ancestor of the path is enough, and nothing below can take it back. That is
   the property that stops you carving a stricter sandbox out of an open
   wildcard, so it is worth having pinned by a test. */
function granted(op, p, auth, after) {
  for (const link of chain(p)) {
    const expr = link.node['.' + op];
    if (expr === undefined) continue;
    const ctx = {
      auth, now: NOW,
      root: snap(DB, ''),
      data: snap(DB, link.at),
      newData: snap(after || DB, link.at),
      ...link.vars
    };
    if (evalExpr(expr, ctx)) return true;
  }
  return false;
}

/* .validate does not cascade: it has to hold at the written node and at every
   node under it that carries data. Deletes skip it entirely. */
function validated(p, value, after) {
  if (value === null) return true;
  const paths = [];
  (function walk(pp, v) {
    paths.push(pp);
    if (v && typeof v === 'object' && !Array.isArray(v))
      for (const k of Object.keys(v)) walk(pp + '/' + k, v[k]);
  })(p, value);
  for (const pp of paths) {
    const link = chain(pp).pop();
    if (!link || link.at !== pp) continue;          // no rule reaches this deep
    const expr = link.node['.validate'];
    if (expr === undefined) continue;
    const ctx = { auth: null, now: NOW, root: snap(DB, ''), data: snap(DB, pp), newData: snap(after, pp), ...link.vars };
    if (!evalExpr(expr, ctx)) return false;
  }
  return true;
}

const canRead = (p, auth) => granted('read', p, auth);
function canWrite(p, value, auth) {
  const after = withWrite(DB, p, value);
  return granted('write', p, auth, after) && validated(p, value, after);
}

/* ---------------- the mock club ---------------- */

const DB = {
  appOwners: { own: true },
  retired: { OLD: { at: 1, name: 'Last season' } },
  workspaces: {
    CLUB: {
      access: {
        admins: { adm: true },
        index: { adm: true, coach: true, trk: true, mum: true },
        members: {
          adm: { name: 'Ada', email: 'ada@example.com', at: 1 },
          coach: { name: 'Jaz', email: 'jaz@example.com', at: 2 },
          newbie: { name: 'Sam', email: 'sam@example.com', at: 3 }
        },
        teams: { t1: { coaches: { coach: true }, trackers: { trk: true } }, t2: { coaches: { other: true } } },
        /* The lookup tables the tighter rules read. A rule cannot iterate, so
           "is this uid a coach of THIS team" has to be one direct hop, and the
           value carries the role because coach and tracker are not the same
           permission. */
        teamIndex: { t1: { coach: 'coach', trk: 'tracker' }, t2: { other: 'coach' } },
        org: { name: 'Lakeside SC' },
        log: { e1: { at: 1, act: 'made coach', by: 'adm', target: 'coach' } }
      },
      teams: {
        t1: { id: 't1', name: 'Flight', players: { p1: { id: 'p1', name: 'Ella', guardians: { mum: true } } } },
        t2: { id: 't2', name: 'Storm', players: {} }
      },
      matches: { g1: { id: 'g1', teamId: 't1', opponent: 'Riverside' }, g2: { id: 'g2', teamId: 't2', opponent: 'Athletic' } }
    },
    /* A club nobody holds a role in yet. Both halves of the bootstrap live
       here: it is the state a new club starts in, and the state README calls
       the dangerous one if you lock down while still in it. */
    FRESH: { teams: { t9: { id: 't9', name: 'New team' } } }
  },
  /* Who may publish a team's mirror. public/ is world-readable by design; this
     is what stops anyone holding a link from writing to it. */
  shareOwners: { sh1: { adm: true, coach: true } },
  public: {
    sh1: {
      team: { name: 'Flight' },
      games: { g1: { status: 'live', score: { us: 1, them: 0 } } },
      record: { w: 1 }, updated: 1
    }
  }
};

const OUT = null;                 // signed out
const ADM = { uid: 'adm' };       // club admin
const COACH = { uid: 'coach' };   // coach of t1
const TRK = { uid: 'trk' };       // tracker on t1
const MUM = { uid: 'mum' };       // guardian of a player on t1
const OTHER = { uid: 'other' };   // coach of the OTHER team in the same club
const NEWB = { uid: 'newbie' };   // signed in and registered, no role yet
const RANDO = { uid: 'rando' };   // signed in, unknown to this club
const OWNER = { uid: 'own' };     // the app owner, holding no role in this club

/* ---------------- expectations ---------------- */

let failures = 0;
function check(label, got, want) {
  const ok = got === want;
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(52)} ${got ? 'allowed' : 'denied'}${ok ? '' : ' — expected ' + (want ? 'allowed' : 'denied')}`);
}
const reads = (label, who, p, want) => check(label, canRead(p, who), want);
const writes = (label, who, p, v, want) => check(label, canWrite(p, v, who), want);

console.log('--- reading the club ---');
reads('signed out', OUT, 'workspaces/CLUB', false);
reads('admin', ADM, 'workspaces/CLUB', true);
reads('coach', COACH, 'workspaces/CLUB', true);
reads('tracker', TRK, 'workspaces/CLUB', true);
reads('parent', MUM, 'workspaces/CLUB', true);
reads('signed in, registered, no role yet', NEWB, 'workspaces/CLUB', false);
reads('signed in, unknown to this club', RANDO, 'workspaces/CLUB', false);
reads('app owner holding no role here', OWNER, 'workspaces/CLUB', false);

console.log('\n--- a club with nobody in its index (the bootstrap) ---');
reads('any signed-in account can read it', RANDO, 'workspaces/FRESH', true);
reads('signed out still cannot', OUT, 'workspaces/FRESH', false);
writes('but NOBODY can write to it', RANDO, 'workspaces/FRESH/teams/t9/name', 'Renamed', false);
writes('not even after claiming admin', ADM, 'workspaces/FRESH/teams/t9/name', 'Renamed', false);
console.log('  ^ this is the read-only trap: locking down before a single role is');
console.log('    granted leaves a club that opens fine and refuses every change.');

console.log('\n--- the squad: coaches of that team, and admins ---');
writes('admin edits any team', ADM, 'workspaces/CLUB/teams/t1/name', 'Flight B', true);
writes('its own coach edits it', COACH, 'workspaces/CLUB/teams/t1/name', 'Flight B', true);
writes('a coach of another team does not', OTHER, 'workspaces/CLUB/teams/t1/name', 'Flight B', false);
writes('a tracker does not', TRK, 'workspaces/CLUB/teams/t1/name', 'Flight B', false);
writes('a parent does not', MUM, 'workspaces/CLUB/teams/t1/name', 'Flight B', false);
writes('nor delete the whole team', MUM, 'workspaces/CLUB/teams/t1', null, false);
writes('registered but unroled', NEWB, 'workspaces/CLUB/teams/t1/name', 'Flight B', false);
writes('signed out', OUT, 'workspaces/CLUB/teams/t1/name', 'Flight B', false);

console.log('\n--- a game: whoever works that team, tracker included ---');
writes('its coach edits the game', COACH, 'workspaces/CLUB/matches/g1/opponent', 'Athletic', true);
writes('its tracker logs a goal', TRK, 'workspaces/CLUB/matches/g1/goals/x', { t: 60, side: 'us' }, true);
writes('a coach of another team cannot', OTHER, 'workspaces/CLUB/matches/g1/goals/x', { t: 60, side: 'us' }, false);
writes('a parent cannot', MUM, 'workspaces/CLUB/matches/g1/goals/x', { t: 60, side: 'us' }, false);
writes('a new game carries the team it belongs to', COACH, 'workspaces/CLUB/matches/g9', { id: 'g9', teamId: 't1' }, true);
writes('and cannot be filed under another team', COACH, 'workspaces/CLUB/matches/g9', { id: 'g9', teamId: 't2' }, false);
console.log('  ^ this is the hole README called "still not enforced": the index');
console.log('    is club-wide, so every indexed account could write every team.');

console.log('\n--- the collections themselves are not writable ---');
writes('the whole teams node', ADM, 'workspaces/CLUB/teams', {}, false);
writes('the whole matches node', ADM, 'workspaces/CLUB/matches', {}, false);
writes('the workspace node', ADM, 'workspaces/CLUB', {}, false);
console.log('  ^ which is why pushAll() writes one child at a time.');

console.log('\n--- the bridge, for a club that predates the team index ---');
{
  /* teamIndex does not exist on a club locked down before it was invented, and
     a rule that needs it would refuse every write the moment it is pasted. So
     each per-team rule falls back to the old club-wide index while the table is
     missing, and stops the instant it appears. This is what makes the ruleset
     safe to paste before the app has caught up. */
  const saved = DB.workspaces.CLUB.access.teamIndex;
  delete DB.workspaces.CLUB.access.teamIndex;
  writes('with no table, an indexed tracker writes a team', TRK, 'workspaces/CLUB/teams/t1/name', 'X', true);
  writes('and an indexed parent does too', MUM, 'workspaces/CLUB/teams/t1/name', 'X', true);
  writes('an unindexed account still cannot', RANDO, 'workspaces/CLUB/teams/t1/name', 'X', false);
  writes('signed out still cannot', OUT, 'workspaces/CLUB/teams/t1/name', 'X', false);
  console.log('  ^ exactly today\'s behaviour, so pasting early locks nobody out');
  DB.workspaces.CLUB.access.teamIndex = saved;
  writes('the table appearing closes it again', TRK, 'workspaces/CLUB/teams/t1/name', 'X', false);
}

console.log('\n--- the team index itself is admin-only ---');
writes('admin writes it', ADM, 'workspaces/CLUB/access/teamIndex/t1/newbie', 'coach', true);
writes('a coach cannot promote anyone', COACH, 'workspaces/CLUB/access/teamIndex/t1/newbie', 'coach', false);
writes('nor can a tracker', TRK, 'workspaces/CLUB/access/teamIndex/t1/trk', 'coach', false);

console.log('\n--- knocking on the door: access/members ---');
writes('new account registers itself', NEWB, 'workspaces/CLUB/access/members/newbie', { name: 'Sam' }, true);
writes('unknown account registers itself', RANDO, 'workspaces/CLUB/access/members/rando', { name: 'Rando' }, true);
writes('but not as somebody else', RANDO, 'workspaces/CLUB/access/members/adm', { name: 'Not Ada' }, false);
writes('an indexed person may tidy any entry', COACH, 'workspaces/CLUB/access/members/newbie', { name: 'Sam T' }, true);

console.log('\n--- who may grant a role ---');
writes('admin appoints another admin', ADM, 'workspaces/CLUB/access/admins/coach', true, true);
writes('coach appoints herself admin', COACH, 'workspaces/CLUB/access/admins/coach', true, false);
writes('admin assigns a team role', ADM, 'workspaces/CLUB/access/teams/t1/coaches/newbie', true, true);
writes('coach assigns a team role', COACH, 'workspaces/CLUB/access/teams/t1/coaches/newbie', true, false);
writes('admin renames the club', ADM, 'workspaces/CLUB/access/org/name', 'Lakeside', true);
writes('coach renames the club', COACH, 'workspaces/CLUB/access/org/name', 'Lakeside', false);
writes('anyone claims a club that has no admin', RANDO, 'workspaces/FRESH/access/admins/rando', true, true);

console.log('\n--- the index, which is what the read rule checks ---');
writes('admin indexes somebody', ADM, 'workspaces/CLUB/access/index/newbie', true, true);
writes('unknown account indexes itself', RANDO, 'workspaces/CLUB/access/index/rando', true, false);
writes('an indexed parent indexes a stranger', MUM, 'workspaces/CLUB/access/index/rando', true, false);
writes('a coach cannot either', COACH, 'workspaces/CLUB/access/index/rando', true, false);
writes('but anyone may take themselves out', COACH, 'workspaces/CLUB/access/index/coach', null, true);
writes('and may not put themselves back', NEWB, 'workspaces/CLUB/access/index/newbie', true, false);
writes('the whole index node is not writable', ADM, 'workspaces/CLUB/access/index', {}, false);
console.log('  ^ the escalation is closed: being in the index no longer lets you');
console.log('    put anyone else in it, which was a grant of the entire club.');

console.log('\n--- the audit log is append-only ---');
writes('coach appends, stamped as herself', COACH, 'workspaces/CLUB/access/log/e2', { at: NOW, act: 'x', by: 'coach' }, true);
writes('coach appends, stamped as the admin', COACH, 'workspaces/CLUB/access/log/e3', { at: NOW, act: 'x', by: 'adm' }, false);
writes('admin rewrites an existing entry', ADM, 'workspaces/CLUB/access/log/e1', { at: NOW, act: 'nothing', by: 'adm' }, false);
writes('admin deletes an existing entry', ADM, 'workspaces/CLUB/access/log/e1', null, false);

console.log('\n--- retiring a club ---');
reads('one club\'s marker is public', OUT, 'retired/CLUB', true);
reads('the list of them all is NOT readable', OUT, 'retired', false);
reads('not by the app owner either', OWNER, 'retired', false);
console.log('  ^ .read sits on retired/$code, so it grants each marker on its own');
console.log('    and never the parent. app.js reads the whole node. See note 5.');
writes('an admin of that club may retire it', ADM, 'retired/CLUB', { at: NOW, by: 'adm' }, true);
writes('a coach of that club may not', COACH, 'retired/CLUB', { at: NOW, by: 'coach' }, false);
writes('nor may the app owner', OWNER, 'retired/CLUB', { at: NOW, by: 'own' }, false);

console.log('\n--- appOwners is console-only ---');
reads('readable once signed in', RANDO, 'appOwners', true);
reads('not readable signed out', OUT, 'appOwners', false);
writes('nobody can write it, owner included', OWNER, 'appOwners/rando', true, false);

console.log('\n--- the published mirror ---');
reads('anyone at all can read it', OUT, 'public/sh1', true);
writes('signed out cannot write it', OUT, 'public/sh1/games/g1/status', 'done', false);
writes('nor can any passing account', RANDO, 'public/sh1/games/g1/status', 'done', false);
writes('only an owner of that share', COACH, 'public/sh1/games/g1/status', 'done', true);
console.log('  ^ the write hole AUTH.md names, closed by shareOwners/{shareId}.');
writes('a team needs a name', COACH, 'public/sh1/team', { name: 'Flight' }, true);
writes('a team without one is rejected', COACH, 'public/sh1/team', { logo: 'x' }, false);
writes('a game needs a status', COACH, 'public/sh1/games/g2', { status: 'live' }, true);
writes('a game without one is rejected', COACH, 'public/sh1/games/g2', { score: 1 }, false);

console.log('\n--- claiming a share ---');
writes('an unclaimed share can be claimed', RANDO, 'shareOwners/brandnew', { rando: true }, true);
writes('a claimed one cannot be taken', RANDO, 'shareOwners/sh1', { rando: true }, false);
writes('its owner may add a co-owner', COACH, 'shareOwners/sh1/newbie', true, true);
reads('owners are not world-readable', OUT, 'shareOwners/sh1', false);

/* ---------------- invites ---------------- */

/* An invite is how an account nobody has granted anything gets into a locked
   club without an admin doing it by hand. That makes every rule below a door
   in the wall, so most of these cases are somebody trying the handle. */
{
  const FUTURE = NOW + 7 * 864e5, PAST = NOW - 1;
  const base = { ws: 'CLUB', team: 't1', by: 'adm', at: NOW - 1000, expiresAt: FUTURE };
  DB.invites = {
    ic: { ...base, role: 'coach' },
    it: { ...base, role: 'tracker' },
    ip: { ...base, role: 'parent', player: 'p1' },
    imail: { ...base, role: 'coach', email: 'sam@example.com' },
    iold: { ...base, role: 'coach', expiresAt: PAST },
    itaken: { ...base, role: 'coach', used: { by: 'rando', at: NOW } },
    // spent by the newcomer, which is the state every grant below checks for
    sc: { ...base, role: 'coach', used: { by: 'newbie', at: NOW } },
    st: { ...base, role: 'tracker', used: { by: 'newbie', at: NOW } },
    sp: { ...base, role: 'parent', player: 'p1', used: { by: 'newbie', at: NOW } },
    s2: { ...base, team: 't2', role: 'coach', used: { by: 'newbie', at: NOW } },
    sold: { ...base, role: 'coach', expiresAt: PAST, used: { by: 'newbie', at: NOW - 9e9 } },
    sfresh: { ...base, ws: 'FRESH', team: 't9', role: 'coach', used: { by: 'newbie', at: NOW } }
  };
  DB.clubInvites = { CLUB: { sc: { role: 'coach', team: 't1' } } };
  const SAM = { uid: 'newbie', token: { email: 'Sam@Example.com', email_verified: true } };
  const SAM_UNVERIFIED = { uid: 'newbie', token: { email: 'sam@example.com', email_verified: false } };
  const RANDO_T = { uid: 'rando', token: { email: 'rando@example.com', email_verified: true } };
  const W = 'workspaces/CLUB/';

  console.log('\n--- making an invite ---');
  const fresh = { ...base, role: 'coach' };
  writes('an admin makes one for her club', ADM, 'invites/new1', fresh, true);
  writes('stamped as somebody else', ADM, 'invites/new1', { ...fresh, by: 'coach' }, false);
  writes('a coach cannot', COACH, 'invites/new1', { ...fresh, by: 'coach' }, false);
  writes('nor an unknown account', RANDO, 'invites/new1', { ...fresh, by: 'rando' }, false);
  writes('an admin cannot make one for another club', ADM, 'invites/new1', { ...fresh, ws: 'FRESH' }, false);
  writes('nor overwrite an existing one', ADM, 'invites/ic', fresh, false);
  writes('a role it cannot grant is refused', ADM, 'invites/new1', { ...fresh, role: 'admin' }, false);
  writes('a parent invite must name a player', ADM, 'invites/new1', { ...fresh, role: 'parent' }, false);
  writes('one with no expiry is refused', ADM, 'invites/new1', { ws: 'CLUB', team: 't1', by: 'adm', role: 'coach' }, false);
  reads('whoever holds the link can read it', RANDO, 'invites/ic', true);
  reads('signed out cannot', OUT, 'invites/ic', false);
  reads('and nobody can list them all', ADM, 'invites', false);

  console.log('\n--- spending one ---');
  const use = who => ({ by: who.uid, at: NOW });
  writes('an unknown account spends an open invite', RANDO, 'invites/ic/used', use(RANDO), true);
  writes('but not in somebody else\'s name', RANDO, 'invites/ic/used', use(SAM), false);
  writes('an expired one cannot be spent', RANDO, 'invites/iold/used', use(RANDO), false);
  writes('a spent one cannot be spent again', SAM, 'invites/itaken/used', use(SAM), false);
  writes('nor can a made-up one', RANDO, 'invites/nope/used', use(RANDO), false);
  writes('signed out cannot', OUT, 'invites/ic/used', { by: null, at: NOW }, false);
  writes('an emailed invite: the right address', SAM, 'invites/imail/used', use(SAM), true);
  writes('the right address, unverified', SAM_UNVERIFIED, 'invites/imail/used', use(SAM), false);
  writes('the wrong address', RANDO_T, 'invites/imail/used', use(RANDO_T), false);
  writes('no address at all', RANDO, 'invites/imail/used', use(RANDO), false);

  console.log('\n--- what a spent invite lets you write ---');
  writes('coach invite: coach on that team', SAM, W + 'access/teams/t1/coaches/newbie', 'sc', true);
  writes('coach invite: not coach on another team', SAM, W + 'access/teams/t2/coaches/newbie', 'sc', false);
  writes('tracker invite: not coach', SAM, W + 'access/teams/t1/coaches/newbie', 'st', false);
  writes('tracker invite: tracker', SAM, W + 'access/teams/t1/trackers/newbie', 'st', true);
  writes('coach invite: not admin', SAM, W + 'access/admins/newbie', 'sc', false);
  writes('nor somebody else onto the team', SAM, W + 'access/teams/t1/coaches/rando', 'sc', false);
  writes('an invite somebody else spent', RANDO, W + 'access/teams/t1/coaches/rando', 'sc', false);
  writes('an invite nobody has spent', RANDO, W + 'access/teams/t1/coaches/rando', 'ic', false);
  writes('an expired one, spent long ago', SAM, W + 'access/teams/t1/coaches/newbie', 'sold', false);
  writes('another club\'s invite', SAM, 'workspaces/FRESH/access/teams/t9/coaches/newbie', 'sc', false);
  writes('a plain true is still admin-only', SAM, W + 'access/teams/t1/coaches/newbie', true, false);
  writes('spent invite indexes its own account', SAM, W + 'access/index/newbie', 'sc', true);
  writes('but not anybody else', SAM, W + 'access/index/rando', 'sc', false);
  writes('nor from an invite to another club', SAM, W + 'access/index/newbie', 'sfresh', false);
  writes('nor once it has expired', SAM, W + 'access/index/newbie', 'sold', false);
  writes('parent invite: guardian of that player', SAM, W + 'teams/t1/players/p1/guardians/newbie', 'sp', true);
  writes('parent invite: not another player', SAM, W + 'teams/t1/players/p2/guardians/newbie', 'sp', false);
  writes('coach invite: not a guardian', SAM, W + 'teams/t1/players/p1/guardians/newbie', 'sc', false);
  writes('parent invite: not the rest of the player', SAM, W + 'teams/t1/players/p1/name', 'sp', false);
  writes('parent invite: not a coach', SAM, W + 'access/teams/t1/coaches/newbie', 'sp', false);
  console.log('  ^ an invite grants exactly the role it names, on the team it names,');
  console.log('    to the account that spent it, and only until it expires.');

  console.log('\n--- mirroring yourself into the team index ---');
  {
    const saved = JSON.parse(JSON.stringify(DB.workspaces.CLUB.access.teams));
    DB.workspaces.CLUB.access.teams.t1.coaches.newbie = 'sc';
    writes('a coach on the team mirrors herself', SAM, W + 'access/teamIndex/t1/newbie', 'coach', true);
    writes('not as coach of a team she is not on', SAM, W + 'access/teamIndex/t2/newbie', 'coach', false);
    writes('not somebody else', SAM, W + 'access/teamIndex/t1/rando', 'coach', false);
    writes('a tracker cannot mirror herself as coach', TRK, W + 'access/teamIndex/t1/trk', 'coach', false);
    writes('an unroled account cannot at all', RANDO, W + 'access/teamIndex/t1/rando', 'tracker', false);
    const ti = DB.workspaces.CLUB.access.teamIndex;
    delete DB.workspaces.CLUB.access.teamIndex;
    writes('never the first entry of a missing table', SAM, W + 'access/teamIndex/t1/newbie', 'coach', false);
    console.log('  ^ that would close the bridge on everybody else in one write');
    DB.workspaces.CLUB.access.teamIndex = ti;
    DB.workspaces.CLUB.access.teams = saved;
  }

  console.log('\n--- the club\'s list of invites ---');
  reads('an admin lists them', ADM, 'clubInvites/CLUB', true);
  reads('a coach cannot — the ids are the secret', COACH, 'clubInvites/CLUB', false);
  reads('nor a parent', MUM, 'clubInvites/CLUB', false);
  writes('an admin adds one', ADM, 'clubInvites/CLUB/new1', { role: 'coach' }, true);
  writes('a coach cannot', COACH, 'clubInvites/CLUB/new1', { role: 'coach' }, false);
  writes('whoever spent it marks it used', SAM, 'clubInvites/CLUB/sc/used', { by: 'newbie', at: NOW }, true);
  writes('nobody else can', RANDO, 'clubInvites/CLUB/sc/used', { by: 'rando', at: NOW }, false);
  writes('nor mark one that is not listed', SAM, 'clubInvites/CLUB/st/used', { by: 'newbie', at: NOW }, false);

  console.log('\n--- withdrawing one ---');
  writes('an admin deletes one', ADM, 'invites/ic', null, true);
  writes('its team\'s coach deletes one', COACH, 'invites/ic', null, true);
  writes('another team\'s coach cannot', OTHER, 'invites/ic', null, false);
  writes('whoever spent it consumes it', SAM, 'invites/sc', null, true);
  writes('an unknown account cannot', RANDO, 'invites/ic', null, false);
  writes('nobody may edit one in place', ADM, 'invites/ic/expiresAt', FUTURE * 2, false);

  console.log('\n--- which clubs am I in ---');
  reads('my own list', SAM, 'userOrgs/newbie', true);
  reads('not somebody else\'s', RANDO, 'userOrgs/newbie', false);
  writes('I add a club to it', SAM, 'userOrgs/newbie/CLUB', { name: 'Lakeside SC' }, true);
  writes('not to somebody else\'s', RANDO, 'userOrgs/newbie/CLUB', { name: 'x' }, false);
  writes('an admin of that club tidies it', ADM, 'userOrgs/newbie/CLUB', null, true);
  writes('not for a club she does not run', ADM, 'userOrgs/newbie/FRESH', null, false);
  console.log('  ^ a list of bookmarks, not a grant: reading the club is still');
  console.log('    the index\'s decision.');

  delete DB.invites; delete DB.clubInvites;
}

/* The open rules carry the same three root blocks, so invites work before a
   club is locked down. One copy drifting from the other would mean an invite
   that works today stops working on lockdown day. */
{
  const open = jsonBlocks().map(r => { try { return JSON.parse(r); } catch (e) { return null; } })
    .find(d => d && d.rules && d.rules.workspaces && d.rules.workspaces.$code['.write'] === true);
  console.log('\n--- the open rules ---');
  for (const k of ['invites', 'clubInvites', 'userOrgs'])
    check(k + ' matches the locked-down block', !!open && JSON.stringify(open.rules[k]) === JSON.stringify(RULES[k]), true);
}

/* ---------------- what the rules and the app disagree about ---------------- */

console.log(`
--- what is closed, and what is left ---

  Closed by this ruleset, each pinned by a case above:

  - Per-team writes. access/index says who may READ the club; access/teamIndex
    says who may write a given team, and carries 'coach' or 'tracker' because
    those are not the same permission. A coach of one team can no longer edit
    another, and a parent can no longer edit anything. This was README's "What
    is still not enforced", and AUTH.md's teamMembers index by another name.
  - The index escalation. Being in access/index no longer lets you put anyone
    else in it — which was a grant of the whole club to anyone already holding
    any role. Self-removal survives, because that was the clause's real intent.
  - The public write hole. public/{share} now needs shareOwners/{share}/{uid},
    which is AUTH.md's design and step 4 of its build order. Anonymous auth is
    not an option here and AUTH.md says why.

  Still open, deliberately:

  1. A tracker can write more of a match than the interface offers her. The
     rules can say "may touch this team's games" but not "may add a goal and
     nothing else" without a rule per field. AUTH.md's table already scopes a
     tracker to the Track tab as an interface promise; this is the limit of
     what the database can hold her to.

  2. The app owner has no standing in these rules at all. appOwners is read by
     the app, never by a rule, so isOwner() opens buttons the database then
     refuses — retiring a club the owner does not administer, or opening one
     from the archive. Worth deciding deliberately rather than drifting into:
     either the rules learn about appOwners, or the interface stops promising
     it. Nothing here depends on the answer.

  3. Creating a club is still a bootstrap. access/admins may be written while
     it is empty, so the first person to reach a brand-new workspace code
     becomes its admin. Codes are long and random, and this is what lets a club
     exist at all, but it is a trust-on-first-use and worth knowing about.

  4. An invite with no email on it is a bearer token until it is spent: whoever
     opens the link first gets the role. Single use and a two-week expiry bound
     it, and naming an address closes it; the interface says so where the
     invite is made.`);

console.log(`\n${failures ? failures + ' EXPECTATION(S) FAILED' : 'all expectations hold'}`);
process.exit(failures ? 1 : 0);
