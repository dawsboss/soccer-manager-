/* Realtime Database rules, evaluated offline against a mock club.

   Why this exists: every other part of this app can be tested by tapping around.
   Rules cannot — the only way to try them is to publish them over the live club,
   and README's own warning is "Do this in order. Out of order locks you out."
   The failure it describes is silent: reads keep working through the bootstrap
   clause while every write is refused, so the club goes read-only and nobody
   finds out until someone tries to make a sub at a game.

   So this reads the rules from the file you actually paste, database.rules.json,
   rather than keeping a copy. They used to live as code blocks inside
   README.md, and this test parsed them out of the prose; a file is what you
   copy from and what a commit diff shows, so the file is the artifact now and
   README only explains it.

   There is one ruleset, for every club in the database. This is a site any
   club can come to, and the rules belong to the database, not to a club, so a
   starter set for new clubs and a stricter one for established ones cannot
   both be live: whichever is published applies to every club at once. So the
   one set has to let a brand-new club be made at any time — the bootstrap
   clauses do that, and "a brand-new club" below walks it through — while
   holding every established club to its roles.

   Exits non-zero when an expectation fails. */

const fs = require('fs');
const path = require('path');

const README = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');

/* ---------------- the rules files, and README's excerpts of them ---------------- */

const ROOT = path.join(__dirname, '..');
const readJson = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));

function jsonBlocks() {
  return [...README.matchAll(/```json\n([\s\S]*?)```/g)].map(m => m[1]);
}

/* Four things can go wrong with one ruleset and a README, and each one is
   silent until a club is refused something: a full ruleset copied back into
   README and edited there instead of in the file; an excerpt in README that
   explains a block which no longer looks like that; firebase.json pointing
   the CLI at some other file; and a second ruleset coming back, which is a
   choice about which clubs the database protects that nobody should have to
   make. Each is a hard failure. */
function loadRules() {
  const locked = readJson('database.rules.json').rules;
  for (const f of fs.readdirSync(ROOT))
    if (/\.rules\b.*\.json$/.test(f) && f !== 'database.rules.json')
      throw new Error(f + ' is a second ruleset. There is one, database.rules.json, for every club: a database can only run one at a time.');
  for (const raw of jsonBlocks()) {
    let doc = null;
    try { doc = JSON.parse(raw); } catch (e) { }
    if (doc && doc.rules) throw new Error('README.md carries a whole ruleset again. The rules live in database.rules.json; change them there and point README at the file.');
    // a fragment is a bare "key": { ... } pair, valid JSON once wrapped
    let frag = null;
    try { frag = JSON.parse('{' + raw + '}'); } catch (e) { }
    // only excerpts of rules: README also shows the appOwners *data* you add by hand
    const isRule = v => v && typeof v === 'object' && Object.keys(v).some(x => x[0] === '.' || x[0] === '$');
    for (const k of ['retired', 'appOwners'])
      if (frag && isRule(frag[k]) && JSON.stringify(frag[k]) !== JSON.stringify(locked[k]))
        throw new Error('README\'s "' + k + '" example no longer matches database.rules.json');
  }
  const firebase = readJson('firebase.json');
  if (((firebase.database || {}).rules) !== 'database.rules.json')
    throw new Error('firebase.json no longer points at database.rules.json, so `firebase deploy --only database` would publish something else');
  return locked;
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
/* The rules' string methods that JavaScript spells differently. Only the ones
   database.rules.json uses: a drill's link has to begin with https://. */
if (!String.prototype.beginsWith) String.prototype.beginsWith = String.prototype.startsWith;

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
    // an array is stored as an object keyed 0, 1, 2…, and validated that way
    if (v && typeof v === 'object')
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
        /* "Is this uid a coach of ANY team?", for the training bridge. The
           value is a team she coaches, because that is what her own write of
           it is checked against. */
        coachIndex: { coach: 't1', other: 't2' },
        org: { name: 'Lakeside SC' },
        log: { e1: { at: 1, act: 'made coach', by: 'adm', target: 'coach' } }
      },
      teams: {
        t1: { id: 't1', name: 'Flight', players: { p1: { id: 'p1', name: 'Ella', guardians: { mum: true } }, p2: { id: 'p2', name: 'Rosa' } } },
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
  /* Practice plans, outside the workspace so the connect-time read never
     carries them to a parent's phone. The plan is coaches' and admins'; when
     and where is the whole club's. */
  training: {
    CLUB: {
      practices: {
        t1: { pr1: { id: 'pr1', teamId: 't1', date: '2026-09-22', blocks: [{ drill: { shelf: 'builtin', id: 'rondo-4v1' }, minutes: 12 }] } },
        t2: { pr2: { id: 'pr2', teamId: 't2', date: '2026-09-23' } }
      },
      schedule: { t1: { pr1: { date: '2026-09-22', start: '17:30', place: 'Lakeside Park' } } }
    }
  },
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
writes('not even an admin of another club', ADM, 'workspaces/FRESH/teams/t9/name', 'Renamed', false);
console.log('  ^ the read-only trap: a club whose data went in under the old open rules,');
console.log('    before anyone held a role, opens fine and refuses every change until');
console.log('    somebody claims admin. A club made under these rules claims admin first');
console.log('    (see "a brand-new club" below), so only a database moving off the open');
console.log('    rules can be caught by it.');

console.log('\n--- the squad: coaches of that team, and admins ---');
writes('admin edits any team', ADM, 'workspaces/CLUB/teams/t1/name', 'Flight B', true);
writes('its own coach edits it', COACH, 'workspaces/CLUB/teams/t1/name', 'Flight B', true);
writes('a coach of another team does not', OTHER, 'workspaces/CLUB/teams/t1/name', 'Flight B', false);
writes('a tracker does not', TRK, 'workspaces/CLUB/teams/t1/name', 'Flight B', false);
writes('a parent does not', MUM, 'workspaces/CLUB/teams/t1/name', 'Flight B', false);
writes('nor delete the whole team', MUM, 'workspaces/CLUB/teams/t1', null, false);
writes('registered but unroled', NEWB, 'workspaces/CLUB/teams/t1/name', 'Flight B', false);
writes('signed out', OUT, 'workspaces/CLUB/teams/t1/name', 'Flight B', false);

console.log('\n--- the calendar: under the team, so the team rule decides ---');
{
  /* Practices and other entries live at teams/{tid}/events/{eid}, below the
     rule on $tid, so the calendar needed no rule of its own. These pin that:
     the same people who may change the squad may change the calendar, one
     entry at a time, and nobody else. */
  const ev = { id: 'e1', kind: 'practice', title: 'Practice', date: '2026-09-15', start: '18:00', public: false };
  writes('its coach adds a practice', COACH, 'workspaces/CLUB/teams/t1/events/e1', ev, true);
  writes('an admin adds one to any team', ADM, 'workspaces/CLUB/teams/t2/events/e1', ev, true);
  writes('its coach calls one off', COACH, 'workspaces/CLUB/teams/t1/events/e1/called', 'cancelled', true);
  writes('a tracker cannot', TRK, 'workspaces/CLUB/teams/t1/events/e1', ev, false);
  writes('a parent cannot', MUM, 'workspaces/CLUB/teams/t1/events/e1', ev, false);
  writes('nor call one off', MUM, 'workspaces/CLUB/teams/t1/events/e1/called', 'cancelled', false);
  writes('another team\'s coach cannot', OTHER, 'workspaces/CLUB/teams/t1/events/e1', ev, false);
  writes('signed out cannot', OUT, 'workspaces/CLUB/teams/t1/events/e1', ev, false);
  writes('the whole calendar at once is a team write, still the coach\'s', COACH, 'workspaces/CLUB/teams/t1/events', { e1: ev }, true);
  // the register sits beside the entries, under the same team rule
  writes('its coach takes the register', COACH, 'workspaces/CLUB/teams/t1/attend/e1', { p1: true }, true);
  writes('a parent cannot', MUM, 'workspaces/CLUB/teams/t1/attend/e1', { p1: true }, false);
  writes('nor a tracker', TRK, 'workspaces/CLUB/teams/t1/attend/e1', { p1: true }, false);
  writes('nor another team\'s coach', OTHER, 'workspaces/CLUB/teams/t1/attend/e1', { p1: true }, false);
  reads('a parent reads it with the rest of the club', MUM, 'workspaces/CLUB/teams/t1/events/e1', true);
  writes('and the published copy takes a calendar', COACH, 'public/sh1/events', { e2: { kind: 'event', title: 'Team photo', date: '2026-09-20' } }, true);
  writes('with the whole mirror in one write too', COACH, 'public/sh1', { team: { name: 'Flight' }, games: { g1: { status: 'upcoming', called: 'cancelled', home: 'away' } }, events: { e2: { kind: 'event', date: '2026-09-20' } }, record: { w: 0 }, updated: 1 }, true);
}

console.log('\n--- who is coming: a parent for her own child, a coach for anyone ---');
{
  /* The first thing a parent writes. The rule hands her one node — her own
     child's answer — and the node sits outside the game and the team, so it
     cannot be stretched into a write of either. */
  const R = 'workspaces/CLUB/rsvp/t1/g_g1/';
  const ans = by => ({ v: 'yes', by, at: NOW });
  writes('a parent answers for her own child', MUM, R + 'p1', ans('mum'), true);
  writes('with a note', MUM, R + 'p1', { ...ans('mum'), v: 'no', note: 'Away that weekend' }, true);
  writes('and takes the answer back', MUM, R + 'p1', null, true);
  writes('not for another child', MUM, R + 'p2', ans('mum'), false);
  writes('not stamped as somebody else', MUM, R + 'p1', ans('coach'), false);
  writes('not an answer that is not one', MUM, R + 'p1', { ...ans('mum'), v: 'definitely' }, false);
  writes('not a note longer than a text', MUM, R + 'p1', { ...ans('mum'), note: 'x'.repeat(141) }, false);
  writes('not anything else tucked inside it', MUM, R + 'p1', { ...ans('mum'), photo: 'data:...' }, false);
  writes('not the whole team\'s answers at once', MUM, 'workspaces/CLUB/rsvp/t1', { g_g1: { p1: ans('mum') } }, false);
  writes('and it gives her nothing on the game itself', MUM, 'workspaces/CLUB/matches/g1/out/p2', true, false);
  writes('the team\'s coach answers for anyone on it', COACH, R + 'p2', ans('coach'), true);
  writes('an admin for anyone', ADM, 'workspaces/CLUB/rsvp/t2/e_x/k9', ans('adm'), true);
  writes('a tracker cannot', TRK, R + 'p2', ans('trk'), false);
  writes('nor another team\'s coach', OTHER, R + 'p2', ans('other'), false);
  writes('nor a registered account with no role', NEWB, R + 'p1', ans('newbie'), false);
  writes('nor anyone signed out', OUT, R + 'p1', { v: 'yes', at: NOW }, false);
  reads('the coach reads the answers with the rest of the club', COACH, R + 'p1', true);
  const saved = DB.workspaces.CLUB.access.teamIndex;
  delete DB.workspaces.CLUB.access.teamIndex;
  writes('before the team index: any indexed account, as elsewhere', TRK, R + 'p2', ans('trk'), true);
  DB.workspaces.CLUB.access.teamIndex = saved;
}

console.log('\n--- a game: whoever works that team, tracker included ---');
writes('its coach edits the game', COACH, 'workspaces/CLUB/matches/g1/opponent', 'Athletic', true);
writes('its tracker logs a goal', TRK, 'workspaces/CLUB/matches/g1/goals/x', { t: 60, side: 'us' }, true);
// the sideline card: a tracker makes the coach's locked-in subs, and marks them done
writes('its tracker makes the planned subs', TRK, 'workspaces/CLUB/matches/g1/stints/s9', { pid: 'a', on: 600, slot: 'sRB' }, true);
writes('and marks the change done', TRK, 'workspaces/CLUB/matches/g1/planDone/s600', { t: 600, at: 1, by: 'trk' }, true);
writes('another team\'s coach cannot', OTHER, 'workspaces/CLUB/matches/g1/planDone/s600', { t: 600 }, false);
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

/* ---------------- practices ---------------- */

/* TRAINING.md: drills and plans are the club's and the coach's own work, so a
   parent and a tracker are refused first, before anything is allowed. There is
   no .read on training/$code itself, because a read granted there could not be
   taken back lower down and would hand every plan to whoever it reached. */
{
  const T = 'training/CLUB/';
  const plan = (id, tid, extra = {}) => ({ id, teamId: tid, date: '2026-10-06', start: '17:30', minutes: 60, blocks: [], ...extra });

  console.log('\n--- a team\'s practice plans: refused first ---');
  reads('a parent cannot read them', MUM, T + 'practices/t1', false);
  reads('a tracker cannot either', TRK, T + 'practices/t1', false);
  reads('nor one plan by its id', MUM, T + 'practices/t1/pr1', false);
  reads('registered, no role yet', NEWB, T + 'practices/t1', false);
  reads('signed in, unknown to this club', RANDO, T + 'practices/t1', false);
  reads('signed out', OUT, T + 'practices/t1', false);
  reads('the app owner, holding no role here', OWNER, T + 'practices/t1', false);
  reads('a coach of ANOTHER team', OTHER, T + 'practices/t1', false);
  writes('a parent cannot add one', MUM, T + 'practices/t1/x', plan('x', 't1'), false);
  writes('a tracker cannot either', TRK, T + 'practices/t1/x', plan('x', 't1'), false);
  writes('nor delete one', TRK, T + 'practices/t1/pr1', null, false);
  writes('a coach of another team cannot', OTHER, T + 'practices/t1/x', plan('x', 't1'), false);

  console.log('\n--- and allowed to that team\'s coaches and the admins ---');
  reads('its coach reads them', COACH, T + 'practices/t1', true);
  reads('an admin reads any team\'s', ADM, T + 'practices/t2', true);
  writes('its coach plans one', COACH, T + 'practices/t1/x', plan('x', 't1'), true);
  writes('and deletes one', COACH, T + 'practices/t1/pr1', null, true);
  writes('an admin plans for any team', ADM, T + 'practices/t2/x', plan('x', 't2'), true);
  writes('filed under the wrong team', COACH, T + 'practices/t1/x', plan('x', 't2'), false);
  writes('under an id that is not its own', COACH, T + 'practices/t1/x', plan('y', 't1'), false);
  writes('with no date', COACH, T + 'practices/t1/x', { id: 'x', teamId: 't1' }, false);
  writes('the team\'s whole collection at once', COACH, T + 'practices/t1', { x: plan('x', 't1') }, false);
  reads('nobody lists every team\'s plans', ADM, T + 'practices', false);
  reads('nor the whole training node', ADM, 'training/CLUB', false);
  console.log('  ^ which is why the app reads one team at a time and writes one plan');
  console.log('    at a time, the depth the rules sit at.');

  console.log('\n--- the bridge fails closed ---');
  {
    /* Every other bridge falls back to the old club-wide behaviour while its
       table is missing, because that behaviour existed and removing it would
       lock people out. Practices have no old behaviour, and failing open
       would show parents the plans. So the fallback is "a coach of some team",
       read from coachIndex, and with no coachIndex it is admins only. */
    const ti = DB.workspaces.CLUB.access.teamIndex;
    delete DB.workspaces.CLUB.access.teamIndex;
    reads('no team index: a coach still reads them', COACH, T + 'practices/t1', true);
    writes('and plans one', COACH, T + 'practices/t1/x', plan('x', 't1'), true);
    reads('a parent still cannot', MUM, T + 'practices/t1', false);
    reads('nor a tracker', TRK, T + 'practices/t1', false);
    writes('nor write one', TRK, T + 'practices/t1/x', plan('x', 't1'), false);
    reads('another team\'s coach can, until it appears', OTHER, T + 'practices/t1', true);
    const ci = DB.workspaces.CLUB.access.coachIndex;
    delete DB.workspaces.CLUB.access.coachIndex;
    reads('no coach index either: a coach cannot', COACH, T + 'practices/t1', false);
    reads('but an admin can', ADM, T + 'practices/t1', true);
    reads('and a parent still cannot', MUM, T + 'practices/t1', false);
    DB.workspaces.CLUB.access.coachIndex = ci;
    DB.workspaces.CLUB.access.teamIndex = ti;
    reads('the team index appearing narrows it again', OTHER, T + 'practices/t1', false);
  }

  console.log('\n--- when and where: the whole club reads it ---');
  reads('a parent reads the time and place', MUM, T + 'schedule/t1', true);
  reads('a tracker does', TRK, T + 'schedule/t1', true);
  DB.workspaces.CLUB.access.index.other = true;     // the mock leaves her out of the index elsewhere
  reads('a coach of another team does', OTHER, T + 'schedule/t1', true);
  delete DB.workspaces.CLUB.access.index.other;
  reads('registered, no role yet, does not', NEWB, T + 'schedule/t1', false);
  reads('an unknown account does not', RANDO, T + 'schedule/t1', false);
  reads('signed out does not', OUT, T + 'schedule/t1', false);
  const when = { date: '2026-10-06', start: '17:30', end: '18:30', place: 'Lakeside Park' };
  writes('its coach sets it', COACH, T + 'schedule/t1/x', when, true);
  writes('an admin sets any team\'s', ADM, T + 'schedule/t2/x', when, true);
  writes('a parent cannot', MUM, T + 'schedule/t1/x', when, false);
  writes('a tracker cannot', TRK, T + 'schedule/t1/x', when, false);
  writes('another team\'s coach cannot', OTHER, T + 'schedule/t1/x', when, false);
  writes('one with no date is refused', COACH, T + 'schedule/t1/x', { start: '17:30' }, false);

  console.log('\n--- the coach index ---');
  const W = 'workspaces/CLUB/access/coachIndex/';
  writes('an admin writes anyone\'s entry', ADM, W + 'newbie', 't1', true);
  writes('a coach writes her own', COACH, W + 'coach', 't1', true);
  writes('naming a team she coaches, not another', COACH, W + 'coach', 't2', false);
  writes('not somebody else\'s', COACH, W + 'other', 't1', false);
  writes('a tracker cannot add herself', TRK, W + 'trk', 't1', false);
  writes('nor a parent', MUM, W + 'mum', 't1', false);
  writes('anyone may take themselves out', COACH, W + 'coach', null, true);
  writes('a coach cannot rewrite the table', COACH, 'workspaces/CLUB/access/coachIndex', { coach: 't1' }, false);
  {
    const ci = DB.workspaces.CLUB.access.coachIndex;
    delete DB.workspaces.CLUB.access.coachIndex;
    writes('her own entry, into a missing table', COACH, W + 'coach', 't1', true);
    console.log('  ^ allowed, unlike teamIndex: with no fallback to close, her first');
    console.log('    write takes nothing away from anyone else.');
    DB.workspaces.CLUB.access.coachIndex = ci;
  }
}

/* ---------------- the club's drills, and a coach's own ---------------- */

/* TRAINING.md's shelves. Club drills are the club's secret sauce: admins and
   coaches, never trackers or parents. Mine is one person's, across every club:
   she reads and writes it, the app owner may read it for support, and no club
   admin gets any clause at all. Refusals first, as with practices. */
{
  const T = 'training/CLUB/';
  const drill = (id, by, team, extra = {}) => ({ id, name: 'Rondo 4v1', type: 'technical', by, byName: by, team, at: NOW, v: 1, ...extra });
  DB.training.CLUB.drills = {
    d1: drill('d1', 'coach', 't1'),
    d2: drill('d2', 'other', 't2'),
    d3: drill('d3', 'coach', 't2')            // shared while she coached t2, which she no longer does
  };
  DB.training.CLUB.templates = { s1: { id: 's1', name: 'Tuesday', by: 'coach', team: 't1', at: NOW, blocks: [] } };
  DB.userLibrary = { coach: { drills: { m1: { id: 'm1', name: 'My rondo', at: NOW } } }, other: { drills: { m2: { id: 'm2', name: 'Hers', at: NOW } } } };

  console.log('\n--- club drills: refused first ---');
  reads('a parent cannot read them', MUM, T + 'drills', false);
  reads('nor one by its id', MUM, T + 'drills/d1', false);
  reads('a tracker cannot either', TRK, T + 'drills', false);
  reads('registered, no role yet', NEWB, T + 'drills', false);
  reads('a stranger', RANDO, T + 'drills', false);
  reads('signed out', OUT, T + 'drills', false);
  writes('a parent cannot share one', MUM, T + 'drills/x', drill('x', 'mum', 't1'), false);
  writes('a tracker cannot', TRK, T + 'drills/x', drill('x', 'trk', 't1'), false);
  writes('a stranger cannot', RANDO, T + 'drills/x', drill('x', 'rando', 't1'), false);
  writes('a coach cannot edit another coach\'s', COACH, T + 'drills/d2', drill('d2', 'coach', 't1'), false);
  writes('nor delete it', COACH, T + 'drills/d2', null, false);
  writes('nor her own, once she stops coaching its team', COACH, T + 'drills/d3', drill('d3', 'coach', 't2', { name: 'Edited' }), false);
  writes('nor share one stamped as someone else', COACH, T + 'drills/x', drill('x', 'other', 't1'), false);
  writes('nor for a team she does not coach', COACH, T + 'drills/x', drill('x', 'coach', 't2'), false);
  writes('nor hand her drill to another coach', COACH, T + 'drills/d1', drill('d1', 'other', 't1'), false);
  writes('nor move it to a team she does not coach', COACH, T + 'drills/d1', drill('d1', 'coach', 't2'), false);
  writes('the whole shelf at once', ADM, T + 'drills', { x: drill('x', 'adm', 't1') }, false);

  console.log('\n--- club drills: coaches and admins ---');
  reads('a coach reads them', COACH, T + 'drills', true);
  reads('a coach of another team does too', OTHER, T + 'drills', true);
  reads('an admin does', ADM, T + 'drills', true);
  writes('a coach shares one, as herself, for her team', COACH, T + 'drills/x', drill('x', 'coach', 't1'), true);
  writes('and edits what she shared', COACH, T + 'drills/d1', drill('d1', 'coach', 't1', { name: 'Rondo 5v2', v: 2 }), true);
  writes('and removes it', COACH, T + 'drills/d1', null, true);
  writes('an admin edits anyone\'s', ADM, T + 'drills/d2', drill('d2', 'other', 't2', { name: 'Tidied' }), true);
  writes('and removes anyone\'s', ADM, T + 'drills/d3', null, true);
  writes('with no name it is refused', COACH, T + 'drills/x', drill('x', 'coach', 't1', { name: '' }), false);
  writes('nor a name of 81 characters', COACH, T + 'drills/x', drill('x', 'coach', 't1', { name: 'x'.repeat(81) }), false);
  writes('nor under an id that is not its own', COACH, T + 'drills/x', drill('y', 'coach', 't1'), false);
  writes('nor without the team it is for', COACH, T + 'drills/x', { id: 'x', name: 'n', by: 'coach', at: NOW }, false);
  writes('a link that is https', COACH, T + 'drills/x', drill('x', 'coach', 't1', { media: [{ kind: 'link', url: 'https://youtu.be/abc', title: 'Clip' }] }), true);
  writes('a link that is not', COACH, T + 'drills/x', drill('x', 'coach', 't1', { media: [{ kind: 'link', url: 'javascript:alert(1)' }] }), false);
  writes('nor plain http', COACH, T + 'drills/x', drill('x', 'coach', 't1', { media: [{ kind: 'link', url: 'http://example.com/a.gif' }] }), false);
  writes('nor a link with no url', COACH, T + 'drills/x', drill('x', 'coach', 't1', { media: [{ kind: 'link', title: 'Clip' }] }), false);
  writes('templates: a coach saves one for her team', COACH, T + 'templates/s2', { id: 's2', name: 'Thursday', by: 'coach', team: 't1', at: NOW }, true);
  writes('templates: another coach cannot change it', OTHER, T + 'templates/s1', null, false);
  reads('templates: a parent cannot read them', MUM, T + 'templates', false);

  console.log('\n--- club drills: the bridge fails closed ---');
  {
    /* There was never a time when anyone but admins and coaches read club
       drills, so there is nothing to fall back to: with no coach index, only
       admins read them. Sharing checks the team's own coach list, which every
       club has, so it needs no bridge at all. */
    const ci = DB.workspaces.CLUB.access.coachIndex;
    const ti = DB.workspaces.CLUB.access.teamIndex;
    delete DB.workspaces.CLUB.access.coachIndex;
    delete DB.workspaces.CLUB.access.teamIndex;
    reads('no coach index: a coach cannot read them', COACH, T + 'drills', false);
    reads('an admin still can', ADM, T + 'drills', true);
    reads('a parent still cannot', MUM, T + 'drills', false);
    writes('no team index: a coach still shares one', COACH, T + 'drills/x', drill('x', 'coach', 't1'), true);
    DB.workspaces.CLUB.access.coachIndex = ci;
    DB.workspaces.CLUB.access.teamIndex = ti;
  }

  console.log('\n--- a coach\'s own drills: hers alone ---');
  const U = 'userLibrary/';
  const mine = (id, extra = {}) => ({ id, name: 'Box rondo', at: NOW, v: 1, ...extra });
  reads('she reads her own', COACH, U + 'coach', true);
  writes('and writes one', COACH, U + 'coach/drills/m9', mine('m9'), true);
  writes('and a template', COACH, U + 'coach/templates/s9', mine('s9'), true);
  writes('and deletes one', COACH, U + 'coach/drills/m1', null, true);
  writes('nothing but drills and templates', COACH, U + 'coach/notes/n1', mine('n1'), false);
  writes('nor her whole library at once', COACH, U + 'coach/drills', { m9: mine('m9') }, false);
  writes('nor an unnamed one', COACH, U + 'coach/drills/m9', mine('m9', { name: '' }), false);
  writes('nor a link that is not https', COACH, U + 'coach/drills/m9', mine('m9', { media: [{ kind: 'link', url: 'ftp://x' }] }), false);
  reads('another coach cannot read hers', OTHER, U + 'coach', false);
  writes('nor write to it', OTHER, U + 'coach/drills/m9', mine('m9'), false);
  reads('an admin of her club cannot read it', ADM, U + 'coach', false);
  reads('nor one drill of it', ADM, U + 'coach/drills/m1', false);
  writes('nor write to it', ADM, U + 'coach/drills/m1', null, false);
  reads('a parent cannot', MUM, U + 'coach', false);
  reads('a stranger cannot', RANDO, U + 'coach', false);
  reads('signed out cannot', OUT, U + 'coach', false);
  reads('the app owner can, for support', OWNER, U + 'coach', true);
  writes('but cannot change it', OWNER, U + 'coach/drills/m1', mine('m1', { name: 'Owner was here' }), false);
  writes('nor delete it', OWNER, U + 'coach/drills/m1', null, false);
  reads('nobody lists every person\'s library', OWNER, 'userLibrary', false);

  delete DB.training.CLUB.drills; delete DB.training.CLUB.templates; delete DB.userLibrary;
}

/* ---------------- messages ---------------- */

/* Notices and family conversations live at the root, outside the workspace,
   because everybody indexed reads all of a workspace and a parent's message
   about her daughter is not every other parent's business. */
{
  const AT = NOW - 1000;
  DB.board = { CLUB: {
    t1: { n1: { by: 'coach', byName: 'Jaz', at: AT, text: 'Training at 6' } },
    t2: { n2: { by: 'other', byName: 'Kim', at: AT, text: 'Storm news' } }
  } };
  DB.dm = { CLUB: { t1: {
    mum: { m: { d1: { by: 'mum', byName: 'Mum', at: AT, text: 'Ella is ill' } } },
    dad: { m: { d2: { by: 'dad', byName: 'Dad', at: AT, text: 'Private' } } }
  } } };
  const post = (by, extra) => ({ by, byName: by, at: NOW, text: 'Kick-off moved to 10', ...(extra || {}) });

  /* The parent list, which is what narrows all of this to one team's own
     families. Each value is a player the uid is a guardian of, because that
     is what the rule can check. Mum is on t1; Dad is indexed but his child
     is on t2, so t1's notices and coaches are none of his business. */
  const A = DB.workspaces.CLUB.access;
  A.index.dad = true;
  DB.workspaces.CLUB.teams.t2.players = { q1: { id: 'q1', name: 'Gia', guardians: { dad: true } } };
  A.teamParents = { t1: { mum: 'p1' }, t2: { dad: 'q1' } };
  const DAD = { uid: 'dad' };

  console.log('\n--- team notices: reading ---');
  reads('a parent reads her team\'s notices', MUM, 'board/CLUB/t1', true);
  reads('not another team\'s', MUM, 'board/CLUB/t2', false);
  reads('a parent on another team cannot read these', DAD, 'board/CLUB/t1', false);
  reads('the tracker does', TRK, 'board/CLUB/t1', true);
  reads('but not another team\'s', TRK, 'board/CLUB/t2', false);
  reads('its coach does', COACH, 'board/CLUB/t1', true);
  reads('a coach of another team does not', OTHER, 'board/CLUB/t1', false);
  reads('an admin reads every team\'s', ADM, 'board/CLUB/t2', true);
  reads('registered but unroled does not', NEWB, 'board/CLUB/t1', false);
  reads('an unknown account does not', RANDO, 'board/CLUB/t1', false);
  reads('signed out does not', OUT, 'board/CLUB/t1', false);
  reads('nobody lists every club\'s boards', ADM, 'board', false);

  console.log('\n--- team notices: posting ---');
  writes('its coach posts', COACH, 'board/CLUB/t1/n9', post('coach'), true);
  writes('an admin posts to any team', ADM, 'board/CLUB/t2/n9', post('adm'), true);
  writes('not in somebody else\'s name', COACH, 'board/CLUB/t1/n9', post('adm'), false);
  writes('a coach of another team cannot', OTHER, 'board/CLUB/t1/n9', post('other'), false);
  writes('the tracker cannot', TRK, 'board/CLUB/t1/n9', post('trk'), false);
  writes('a parent cannot', MUM, 'board/CLUB/t1/n9', post('mum'), false);
  writes('an empty notice is refused', COACH, 'board/CLUB/t1/n9', post('coach', { text: '' }), false);
  writes('nor one past 4000 characters', COACH, 'board/CLUB/t1/n9', post('coach', { text: 'x'.repeat(4001) }), false);
  writes('nor one with no time', COACH, 'board/CLUB/t1/n9', { by: 'coach', text: 'hi' }, false);
  writes('its author edits it', COACH, 'board/CLUB/t1/n1/text', 'Training at 7', true);
  writes('and deletes it', COACH, 'board/CLUB/t1/n1', null, true);
  writes('an admin deletes anybody\'s', ADM, 'board/CLUB/t2/n2', null, true);
  writes('another coach does not delete Jaz\'s', OTHER, 'board/CLUB/t1/n1', null, false);
  writes('a parent cannot delete one', MUM, 'board/CLUB/t1/n1', null, false);
  writes('the whole board cannot be written', ADM, 'board/CLUB/t1', {}, false);

  console.log('\n--- team notices: who has seen it ---');
  writes('a parent ticks it seen', MUM, 'board/CLUB/t1/n1/seen/mum', NOW, true);
  writes('not for somebody else', MUM, 'board/CLUB/t1/n1/seen/dad', NOW, false);
  writes('not on a notice that is not there', MUM, 'board/CLUB/t1/nope/seen/mum', NOW, false);
  writes('only a time', MUM, 'board/CLUB/t1/n1/seen/mum', 'yes', false);
  writes('the coach ticks her own', OTHER, 'board/CLUB/t2/n2/seen/other', NOW, true);
  writes('a parent of another team cannot tick one', DAD, 'board/CLUB/t1/n1/seen/dad', NOW, false);
  writes('an unroled account cannot', NEWB, 'board/CLUB/t1/n1/seen/newbie', NOW, false);

  console.log('\n--- a family and its team\'s coaches ---');
  reads('a parent reads her own conversation', MUM, 'dm/CLUB/t1/mum', true);
  reads('not another family\'s', MUM, 'dm/CLUB/t1/dad', false);
  reads('nor the list of them', MUM, 'dm/CLUB/t1', false);
  reads('the team\'s coach reads every family\'s', COACH, 'dm/CLUB/t1', true);
  reads('an admin does', ADM, 'dm/CLUB/t1', true);
  reads('a coach of another team does not', OTHER, 'dm/CLUB/t1', false);
  reads('nor one family\'s', OTHER, 'dm/CLUB/t1/mum', false);
  reads('the tracker does not', TRK, 'dm/CLUB/t1/mum', false);
  const msg = by => ({ by, byName: by, at: NOW, text: 'See you Saturday' });
  writes('a parent writes to the coaches', MUM, 'dm/CLUB/t1/mum/m/x1', msg('mum'), true);
  writes('the coach replies', COACH, 'dm/CLUB/t1/mum/m/x1', msg('coach'), true);
  writes('an admin replies', ADM, 'dm/CLUB/t1/mum/m/x1', msg('adm'), true);
  writes('a parent cannot write in another family\'s', MUM, 'dm/CLUB/t1/dad/m/x1', msg('mum'), false);
  writes('nor sign as the coach', MUM, 'dm/CLUB/t1/mum/m/x1', msg('coach'), false);
  writes('a coach of another team cannot', OTHER, 'dm/CLUB/t1/mum/m/x1', msg('other'), false);
  writes('an unroled account cannot start one', NEWB, 'dm/CLUB/t1/newbie/m/x1', msg('newbie'), false);
  writes('nor a parent from another team', DAD, 'dm/CLUB/t1/dad/m/x1', msg('dad'), false);
  writes('who can with his own team\'s coaches', DAD, 'dm/CLUB/t2/dad/m/x1', msg('dad'), true);
  writes('nor the tracker as a "family"', TRK, 'dm/CLUB/t1/trk/m/x1', msg('trk'), false);
  writes('nobody edits a message', COACH, 'dm/CLUB/t1/mum/m/d1/text', 'changed', false);
  writes('nor deletes one, the parent', MUM, 'dm/CLUB/t1/mum/m/d1', null, false);
  writes('nor an admin', ADM, 'dm/CLUB/t1/mum/m/d1', null, false);
  writes('nor the whole conversation', ADM, 'dm/CLUB/t1/mum', null, false);
  writes('an empty message is refused', MUM, 'dm/CLUB/t1/mum/m/x1', { ...msg('mum'), text: '' }, false);
  writes('the parent marks it read', MUM, 'dm/CLUB/t1/mum/seen/mum', NOW, true);
  writes('the coach marks it read', COACH, 'dm/CLUB/t1/mum/seen/coach', NOW, true);
  writes('not as somebody else', COACH, 'dm/CLUB/t1/mum/seen/mum', NOW, false);
  writes('another family cannot', MUM, 'dm/CLUB/t1/dad/seen/mum', NOW, false);

  console.log('\n--- the parent list itself ---');
  const TP = 'workspaces/CLUB/access/teamParents/';
  writes('a parent puts herself on it, naming her child', MUM, TP + 't1/mum', 'p1', true);
  writes('not naming a child she is not guardian of', MUM, TP + 't1/mum', 'p3', false);
  writes('not on a team her child is not on', MUM, TP + 't2/mum', 'q1', false);
  writes('not somebody else', MUM, TP + 't1/dad', 'p1', false);
  writes('the team\'s coach writes it', COACH, TP + 't1/mum', 'p1', true);
  writes('but only true entries', COACH, TP + 't1/rando', 'p1', false);
  writes('and takes one off', COACH, TP + 't1/mum', null, true);
  writes('a coach of another team cannot', OTHER, TP + 't1/mum', null, false);
  writes('an admin writes it', ADM, TP + 't1/mum', 'p1', true);
  writes('even an admin only true entries', ADM, TP + 't1/rando', 'p1', false);
  writes('a parent takes herself off', MUM, TP + 't1/mum', null, true);
  writes('nobody else\'s', MUM, TP + 't2/dad', null, false);
  {
    const saved = A.teamParents;
    delete A.teamParents;
    writes('with no table, a parent cannot start it', MUM, TP + 't1/mum', 'p1', false);
    writes('nor a coach', COACH, TP + 't1/mum', 'p1', false);
    writes('only an admin', ADM, TP + 't1/mum', 'p1', true);
    console.log('  ^ the first entry closes the bridge below on every team at once,');
    console.log('    so only an admin may make it — and her device writes them all.');

    console.log('\n--- the bridge, for a club with no parent list yet ---');
    reads('with no table, an indexed parent reads any team\'s notices', DAD, 'board/CLUB/t1', true);
    writes('and may write to its coaches', DAD, 'dm/CLUB/t1/dad/m/x1', msg('dad'), true);
    reads('but never another family\'s conversation', DAD, 'dm/CLUB/t1/mum', false);
    reads('and signed out still nothing', OUT, 'board/CLUB/t1', false);
    console.log('  ^ the same width as before the table existed, so pasting these rules');
    console.log('    locks nobody out; an admin\'s next connect closes it.');
    A.teamParents = saved;
  }

  console.log('\n--- before teamIndex exists, coaches wait; nobody else gets in ---');
  {
    const saved = DB.workspaces.CLUB.access.teamIndex;
    delete DB.workspaces.CLUB.access.teamIndex;
    writes('a coach cannot post yet', COACH, 'board/CLUB/t1/n9', post('coach'), false);
    reads('nor read the families\' messages', COACH, 'dm/CLUB/t1', false);
    writes('the admin still can', ADM, 'board/CLUB/t1/n9', post('adm'), true);
    reads('and still reads them', ADM, 'dm/CLUB/t1/mum', true);
    reads('no indexed account reads them through a bridge', TRK, 'dm/CLUB/t1/mum', false);
    console.log('  ^ no bridge on purpose: these are new nodes, so failing closed locks');
    console.log('    nobody out of anything they had, and a private message has no');
    console.log('    club-wide fallback to fall back to. An admin\'s next connect');
    console.log('    writes teamIndex, which is what Check readiness looks for.');
    DB.workspaces.CLUB.access.teamIndex = saved;
  }
  delete DB.board; delete DB.dm;
  delete A.teamParents; delete A.index.dad; DB.workspaces.CLUB.teams.t2.players = {};
}

/* ---------------- team links ---------------- */

/* One link per team; a parent asks with a shirt number and a coach lets her
   in. The link grants nothing. What has to hold is that nobody but a coach of
   that team (or an admin) approves, and that approving is the only new way
   into access/index — for the person who asked, on that coach's team. */
{
  const A = DB.workspaces.CLUB.access;
  DB.joinCodes = {
    jc1: { ws: 'CLUB', team: 't1', teamName: 'Flight', by: 'coach', at: NOW },
    jc2: { ws: 'CLUB', team: 't2', teamName: 'Storm', by: 'other', at: NOW }
  };
  DB.claims = { CLUB: { t1: {
    asker: { code: 'jc1', shirt: '7', at: NOW },
    ok: { code: 'jc1', shirt: '9', at: NOW, approved: { by: 'coach', at: NOW } }
  } } };
  const ASKER = { uid: 'asker' }, OK = { uid: 'ok' };
  const link = (by, ws, team) => ({ ws, team, by, at: NOW });
  const ask = (code, extra) => ({ code, shirt: '7', at: NOW, ...(extra || {}) });

  console.log('\n--- making a team link ---');
  writes('its coach makes one', COACH, 'joinCodes/new', link('coach', 'CLUB', 't1'), true);
  writes('an admin makes one for any team', ADM, 'joinCodes/new', link('adm', 'CLUB', 't2'), true);
  writes('a coach not for another team', COACH, 'joinCodes/new', link('coach', 'CLUB', 't2'), false);
  writes('nor stamped as someone else', COACH, 'joinCodes/new', link('adm', 'CLUB', 't1'), false);
  writes('a parent cannot', MUM, 'joinCodes/new', link('mum', 'CLUB', 't1'), false);
  writes('an unknown account cannot', RANDO, 'joinCodes/new', link('rando', 'CLUB', 't1'), false);
  writes('nobody edits one in place', COACH, 'joinCodes/jc1/team', 't2', false);
  writes('its coach retires it', COACH, 'joinCodes/jc1', null, true);
  writes('another team\'s coach cannot', OTHER, 'joinCodes/jc1', null, false);
  reads('whoever holds the link reads it', RANDO, 'joinCodes/jc1', true);
  reads('signed out cannot', OUT, 'joinCodes/jc1', false);
  reads('and nobody lists them', ADM, 'joinCodes', false);

  console.log('\n--- asking to join ---');
  writes('anyone signed in asks, with a live link', RANDO, 'claims/CLUB/t1/rando', ask('jc1'), true);
  writes('not with a link that does not exist', RANDO, 'claims/CLUB/t1/rando', ask('nope'), false);
  writes('not with another team\'s link', RANDO, 'claims/CLUB/t1/rando', ask('jc2'), false);
  writes('not in somebody else\'s name', RANDO, 'claims/CLUB/t1/newbie', ask('jc1'), false);
  writes('not approved by herself', RANDO, 'claims/CLUB/t1/rando', ask('jc1', { approved: { by: 'rando' } }), false);
  writes('nor approve an existing one', ASKER, 'claims/CLUB/t1/asker/approved', { by: 'asker', at: NOW }, false);
  writes('a shirt number is needed', RANDO, 'claims/CLUB/t1/rando', ask('jc1', { shirt: '' }), false);
  writes('she withdraws her own', ASKER, 'claims/CLUB/t1/asker', null, true);
  writes('and tidies it away once approved', OK, 'claims/CLUB/t1/ok', null, true);
  writes('but cannot rewrite it once approved', OK, 'claims/CLUB/t1/ok/shirt', '12', false);
  reads('she reads her own', ASKER, 'claims/CLUB/t1/asker', true);
  reads('not anybody else\'s', ASKER, 'claims/CLUB/t1/ok', false);
  reads('nor the list', ASKER, 'claims/CLUB/t1', false);
  reads('the team\'s coach reads the list', COACH, 'claims/CLUB/t1', true);
  reads('an admin does', ADM, 'claims/CLUB/t1', true);
  reads('a coach of another team does not', OTHER, 'claims/CLUB/t1', false);
  reads('a parent does not', MUM, 'claims/CLUB/t1', false);

  console.log('\n--- approving ---');
  const yes = by => ({ by, at: NOW, players: { p1: true } });
  writes('its coach approves', COACH, 'claims/CLUB/t1/asker/approved', yes('coach'), true);
  writes('an admin approves', ADM, 'claims/CLUB/t1/asker/approved', yes('adm'), true);
  writes('not stamped as someone else', COACH, 'claims/CLUB/t1/asker/approved', yes('adm'), false);
  writes('another team\'s coach cannot', OTHER, 'claims/CLUB/t1/asker/approved', yes('other'), false);
  writes('the tracker cannot', TRK, 'claims/CLUB/t1/asker/approved', yes('trk'), false);
  writes('nor a parent', MUM, 'claims/CLUB/t1/asker/approved', yes('mum'), false);
  writes('nobody approves a request nobody made', COACH, 'claims/CLUB/t1/ghost/approved', yes('coach'), false);
  writes('a coach cannot make a request up', COACH, 'claims/CLUB/t1/ghost', ask('jc1'), false);
  writes('she turns one down', COACH, 'claims/CLUB/t1/asker', null, true);
  writes('another team\'s coach cannot', OTHER, 'claims/CLUB/t1/asker', null, false);

  console.log('\n--- what approving lets a coach write ---');
  writes('index for the parent she approved', COACH, 'workspaces/CLUB/access/index/ok', 't1', true);
  writes('not for one still waiting', COACH, 'workspaces/CLUB/access/index/asker', 't1', false);
  writes('not for anybody else', COACH, 'workspaces/CLUB/access/index/rando', 't1', false);
  writes('not naming another team', COACH, 'workspaces/CLUB/access/index/ok', 't2', false);
  writes('another team\'s coach cannot use her approval', OTHER, 'workspaces/CLUB/access/index/ok', 't1', false);
  writes('nor can the parent index herself with it', OK, 'workspaces/CLUB/access/index/ok', 't1', false);
  writes('she links the guardian, as before', COACH, 'workspaces/CLUB/teams/t1/players/p1/guardians/ok', true, true);
  console.log('  ^ the one new way into the index: a request to her own team that she');
  console.log('    approved. A coach still cannot let in anyone who did not ask.');

  delete DB.joinCodes; delete DB.claims;
}

/* ---------------- training sessions ---------------- */

/* SESSIONS.md: 1-1s and small groups that belong to no team. The session is
   the club's to read; a coach makes and runs her own, an admin any. A family
   asks for a spot for her own child and never gives one, because a rule
   cannot count spots and the coach can. Fees are money, so the rules narrow
   those themselves: admins, the coach who ran it, and that child's family. */
{
  const T = 'training/CLUB/';
  const sess = (id, extra = {}) => ({ id, kind: 'group', coach: 'coach', date: '2026-10-07', start: '17:00', end: '18:00', cap: 6, price: 20, open: true, ...extra });
  DB.training.CLUB.sessions = {
    s1: sess('s1'),
    s2: sess('s2', { kind: 'one', coach: 'other', cap: 1, open: false })
  };
  DB.training.CLUB.booked = { s1: { p1: { tid: 't1', st: 'in', by: 'coach', at: 1 } } };
  DB.training.CLUB.came = { s1: { p1: true } };
  DB.training.CLUB.fees = { s1: { p1: { paid: 20, how: 'cash', at: 1, by: 'coach' } } };
  DB.training.CLUB.pay = { coach: { rate: 30, per: 'hour' } };
  DB.training.CLUB.splans = { s1: { blocks: [{ drill: { shelf: 'builtin', id: 'rondo-4v1' }, minutes: 12 }] } };
  const ask = (st, extra = {}) => ({ tid: 't1', st, by: 'mum', at: NOW, ...extra });

  console.log('\n--- sessions: the club reads them ---');
  reads('a parent reads every session', MUM, T + 'sessions', true);
  reads('a tracker does', TRK, T + 'sessions', true);
  reads('a coach does', COACH, T + 'sessions', true);
  reads('registered, no role yet, does not', NEWB, T + 'sessions', false);
  reads('an unknown account does not', RANDO, T + 'sessions', false);
  reads('signed out does not', OUT, T + 'sessions', false);
  reads('the app owner, holding no role here, does not', OWNER, T + 'sessions', false);

  console.log('\n--- sessions: a coach makes and runs her own ---');
  writes('a coach offers one, as herself', COACH, T + 'sessions/x', sess('x'), true);
  writes('not in another coach\'s name', COACH, T + 'sessions/x', sess('x', { coach: 'other' }), false);
  writes('she changes her own', COACH, T + 'sessions/s1', sess('s1', { start: '17:30' }), true);
  writes('but cannot give it away', COACH, T + 'sessions/s1', sess('s1', { coach: 'other' }), false);
  writes('nor change another coach\'s', COACH, T + 'sessions/s2', sess('s2', { coach: 'other', start: '09:00' }), false);
  writes('nor take another coach\'s over', COACH, T + 'sessions/s2', sess('s2', { coach: 'coach' }), false);
  writes('she calls off her own by deleting it', COACH, T + 'sessions/s1', null, true);
  writes('not another coach\'s', COACH, T + 'sessions/s2', null, false);
  writes('an admin makes one for any coach', ADM, T + 'sessions/x', sess('x', { coach: 'other' }), true);
  writes('and moves one to another coach', ADM, T + 'sessions/s1', sess('s1', { coach: 'other' }), true);
  writes('a parent cannot offer one', MUM, T + 'sessions/x', sess('x', { coach: 'mum' }), false);
  writes('a tracker cannot either', TRK, T + 'sessions/x', sess('x', { coach: 'trk' }), false);
  writes('nor a stranger', RANDO, T + 'sessions/x', sess('x', { coach: 'rando' }), false);
  writes('a kind that is neither one nor group', COACH, T + 'sessions/x', sess('x', { kind: 'clinic' }), false);
  writes('under an id that is not its own', COACH, T + 'sessions/x', sess('y'), false);
  writes('with no date', COACH, T + 'sessions/x', { id: 'x', kind: 'group', coach: 'coach' }, false);
  writes('with a price below nothing', COACH, T + 'sessions/x', sess('x', { price: -5 }), false);
  writes('with no spots at all', COACH, T + 'sessions/x', sess('x', { cap: 0 }), false);
  writes('the whole collection at once', COACH, T + 'sessions', { x: sess('x') }, false);
  {
    const ci = DB.workspaces.CLUB.access.coachIndex;
    delete DB.workspaces.CLUB.access.coachIndex;
    writes('no coach index: a coach cannot make one', COACH, T + 'sessions/x', sess('x'), false);
    writes('nor change her own', COACH, T + 'sessions/s1', sess('s1', { start: '18:00' }), false);
    writes('an admin still can', ADM, T + 'sessions/x', sess('x'), true);
    DB.workspaces.CLUB.access.coachIndex = ci;
    console.log('  ^ the bridge fails closed, as practices\' does: no older behaviour to fall back to.');
  }

  console.log('\n--- bookings: a family asks, the coach decides ---');
  reads('the club reads bookings', MUM, T + 'booked', true);
  reads('a stranger does not', RANDO, T + 'booked', false);
  delete DB.training.CLUB.booked.s1.p1;
  writes('a parent asks for her own child', MUM, T + 'booked/s1/p1', ask('asked', { want: 'Weak foot, crossing' }), true);
  writes('not for somebody else\'s child', MUM, T + 'booked/s1/p2', { ...ask('asked'), tid: 't1' }, false);
  writes('not claiming another team', MUM, T + 'booked/s1/p1', ask('asked', { tid: 't2' }), false);
  writes('not in somebody else\'s name', MUM, T + 'booked/s1/p1', ask('asked', { by: 'coach' }), false);
  writes('and never gives herself the spot', MUM, T + 'booked/s1/p1', ask('in'), false);
  writes('nor a place on the waiting list', MUM, T + 'booked/s1/p1', ask('wait'), false);
  writes('not for a session closed to asking', MUM, T + 'booked/s2/p1', ask('asked'), false);
  writes('not for a session that does not exist', MUM, T + 'booked/nope/p1', ask('asked'), false);
  writes('with more than 280 characters of wants', MUM, T + 'booked/s1/p1', ask('asked', { want: 'x'.repeat(281) }), false);
  writes('with something the booking does not carry', MUM, T + 'booked/s1/p1', ask('asked', { paid: true }), false);
  writes('a tracker cannot ask for anybody', TRK, T + 'booked/s1/p1', { ...ask('asked'), by: 'trk' }, false);
  DB.training.CLUB.booked.s1.p1 = { tid: 't1', st: 'in', by: 'coach', at: 1 };
  writes('once the coach has said yes, asking again is refused', MUM, T + 'booked/s1/p1', ask('asked'), false);
  writes('but she can always withdraw', MUM, T + 'booked/s1/p1', ask('out'), true);
  writes('even from a session closed to asking', MUM, T + 'booked/s2/p1', ask('out'), true);
  writes('and cannot delete the booking outright', MUM, T + 'booked/s1/p1', null, false);
  DB.training.CLUB.booked.s1.p1 = { tid: 't1', st: 'no', by: 'coach', at: 1 };
  writes('after a "not this time", no asking again', MUM, T + 'booked/s1/p1', ask('asked'), false);
  DB.training.CLUB.booked.s1.p1 = { tid: 't1', st: 'out', by: 'mum', at: 1 };
  writes('after withdrawing, she can ask again', MUM, T + 'booked/s1/p1', ask('asked'), true);
  DB.training.CLUB.booked.s1.p1 = { tid: 't1', st: 'in', by: 'coach', at: 1 };
  const coachSays = (st, pid = 'p2') => ({ tid: 't1', st, by: 'coach', at: NOW });
  writes('the session\'s coach books a player', COACH, T + 'booked/s1/p2', coachSays('in'), true);
  writes('and waitlists one', COACH, T + 'booked/s1/p2', coachSays('wait'), true);
  writes('and turns one down', COACH, T + 'booked/s1/p1', coachSays('no'), true);
  writes('and takes a booking off', COACH, T + 'booked/s1/p1', null, true);
  writes('and clears every booking on it', COACH, T + 'booked/s1', null, true);
  writes('not on another coach\'s session', COACH, T + 'booked/s2/p2', coachSays('in'), false);
  writes('another coach cannot book onto hers', OTHER, T + 'booked/s1/p2', { ...coachSays('in'), by: 'other' }, false);
  writes('an admin books onto any', ADM, T + 'booked/s2/p2', { ...coachSays('in'), by: 'adm' }, true);
  writes('a status that is not one', COACH, T + 'booked/s1/p2', coachSays('maybe'), false);
  {
    const ci = DB.workspaces.CLUB.access.coachIndex;
    DB.workspaces.CLUB.access.coachIndex = { other: 't2' };
    writes('a coach who stops being one stops running it', COACH, T + 'booked/s1/p2', coachSays('in'), false);
    DB.workspaces.CLUB.access.coachIndex = ci;
  }

  console.log('\n--- the register ---');
  reads('the club reads it, like a team register', MUM, T + 'came/s1', true);
  writes('the session\'s coach takes it', COACH, T + 'came/s1', { p1: true, p2: false }, true);
  writes('an admin does', ADM, T + 'came/s2', { p1: true }, true);
  writes('another coach does not', OTHER, T + 'came/s1', { p1: false }, false);
  writes('a parent does not', MUM, T + 'came/s1', { p1: true }, false);
  writes('each mark is came or missed', COACH, T + 'came/s1', { p1: 'yes' }, false);

  console.log('\n--- fees: money, narrowed by the rules themselves ---');
  const fee = (extra = {}) => ({ paid: 20, how: 'cash', at: NOW, by: 'coach', ...extra });
  reads('an admin reads every fee', ADM, T + 'fees', true);
  reads('a coach does not read them all', COACH, T + 'fees', false);
  reads('she reads her own session\'s', COACH, T + 'fees/s1', true);
  reads('not another coach\'s', COACH, T + 'fees/s2', false);
  reads('a family reads her own child\'s', MUM, T + 'fees/s1/p1', true);
  reads('not the whole session\'s', MUM, T + 'fees/s1', false);
  reads('nor another child\'s', MUM, T + 'fees/s1/p2', false);
  reads('a tracker reads none', TRK, T + 'fees/s1/p1', false);
  reads('nor a coach of another team', OTHER, T + 'fees/s1', false);
  writes('the session\'s coach marks one paid', COACH, T + 'fees/s1/p2', fee(), true);
  writes('and waived', COACH, T + 'fees/s1/p2', fee({ paid: 0, how: 'waived' }), true);
  writes('an admin marks any', ADM, T + 'fees/s2/p1', fee({ by: 'adm' }), true);
  writes('a family cannot mark her own paid', MUM, T + 'fees/s1/p1', fee({ by: 'mum' }), false);
  writes('another coach cannot', OTHER, T + 'fees/s1/p1', fee({ by: 'other' }), false);
  writes('a way of paying it does not know', COACH, T + 'fees/s1/p2', fee({ how: 'iou' }), false);
  writes('a negative payment', COACH, T + 'fees/s1/p2', fee({ paid: -20 }), false);

  console.log('\n--- pay rates ---');
  reads('an admin reads them', ADM, T + 'pay', true);
  reads('a coach reads her own', COACH, T + 'pay/coach', true);
  reads('not anyone else\'s', COACH, T + 'pay/other', false);
  reads('nor the list', COACH, T + 'pay', false);
  reads('a parent reads none', MUM, T + 'pay/coach', false);
  writes('an admin sets one', ADM, T + 'pay/other', { rate: 25, per: 'session' }, true);
  writes('a coach cannot set her own', COACH, T + 'pay/coach', { rate: 300, per: 'hour' }, false);
  writes('per something else', ADM, T + 'pay/other', { rate: 25, per: 'week' }, false);

  console.log('\n--- a session\'s drills ---');
  reads('its coach reads the plan', COACH, T + 'splans/s1', true);
  reads('an admin does', ADM, T + 'splans/s1', true);
  reads('a parent does not', MUM, T + 'splans/s1', false);
  reads('another coach does not', OTHER, T + 'splans/s1', false);
  writes('its coach writes it', COACH, T + 'splans/s1', { blocks: [] , at: NOW }, true);
  writes('not another coach\'s', COACH, T + 'splans/s2', { blocks: [], at: NOW }, false);
  reads('nobody reads every plan at once', ADM, T + 'splans', false);

  for (const k of ['sessions', 'booked', 'came', 'fees', 'pay', 'splans']) delete DB.training.CLUB[k];
}

/* ---------------- bookable times, and a family booking one ---------------- */

/* AVAILABILITY.md: a coach's window, cut into slots families book
   themselves, one child each for a 1-1 or up to its spots for a group. A
   booked slot is an ordinary session, made by the first family, whose id is
   the coach, the day and the start, so two families making the same time
   write one key. A rule cannot count, so a place is a numbered seat, and a
   seat that exists cannot be taken twice. The window carries the slots it
   still offers, each with its start as a timestamp, so the rule can hold a
   booking to the grid and to the clock: not in the past, and not cancelled
   inside the coach's notice. */
{
  const T = 'training/CLUB/';
  const H = 3600000;
  const D = '2026-10-07', AT17 = NOW + 48 * H, AT18 = AT17 + H;
  const block = (id, extra = {}) => ({
    id, coach: 'coach', date: D, start: '17:00', end: '19:00', len: 60, kind: 'one', cap: 1, price: 30, notice: 24,
    slots: { t1700: { end: '18:00', at: AT17 }, t1800: { end: '19:00', at: AT18 } }, seats: { s1: true }, ...extra
  });
  const group = (id, extra = {}) => block(id, { kind: 'group', cap: 2, seats: { s1: true, s2: true }, ...extra });
  DB.training.CLUB.avail = {
    b1: block('b1'), b2: block('b2', { coach: 'other' }), b3: block('b3', { off: true, date: '2026-10-14' }),
    g1: group('g1', { date: '2026-10-08' }),
    bp: block('bp', { date: '2025-09-01', slots: { t1700: { end: '18:00', at: NOW - H } } })
  };
  DB.training.CLUB.sessions = {};
  DB.training.CLUB.booked = {};
  DB.training.CLUB.seats = {};
  const sid = (start = '18:00', coach = 'coach', date = D) => 'k_' + coach + '_' + date + '_' + start.replace(':', '');
  const slot = (extra = {}) => {
    const v = { kind: 'one', coach: 'coach', date: D, start: '18:00', end: '19:00', t0: AT18, price: 30, notice: 24, open: false, cap: 1,
      slot: 'b1', pid: 'p1', tid: 't1', by: 'mum', ...extra };
    v.id = extra.id || sid(v.start, v.coach, v.date);
    return v;
  };
  const gslot = (extra = {}) => slot({ kind: 'group', cap: 2, slot: 'g1', date: '2026-10-08', ...extra });
  const seat = (extra = {}) => ({ pid: 'p1', tid: 't1', by: 'mum', at: NOW, ...extra });
  const book = (extra = {}) => ({ tid: 't1', st: 'in', by: 'mum', at: NOW, seat: 's1', ...extra });
  const GRAN = { uid: 'gran' };
  DB.workspaces.CLUB.teams.t1.players.p2.guardians = { gran: true };

  console.log('\n--- bookable times: the club reads them ---');
  reads('a parent reads every coach\'s times', MUM, T + 'avail', true);
  reads('a coach does', COACH, T + 'avail', true);
  reads('a stranger does not', RANDO, T + 'avail', false);
  reads('signed out does not', OUT, T + 'avail', false);
  reads('the club reads who holds which seat', MUM, T + 'seats', true);
  reads('a stranger does not', RANDO, T + 'seats', false);

  console.log('\n--- bookable times: a coach sets her own, an admin anyone\'s ---');
  writes('a coach offers her own 1-1s', COACH, T + 'avail/x', block('x'), true);
  writes('and a small group', COACH, T + 'avail/x', group('x'), true);
  writes('not in another coach\'s name', COACH, T + 'avail/x', block('x', { coach: 'other' }), false);
  writes('she changes her own', COACH, T + 'avail/b1', block('b1', { end: '20:00' }), true);
  writes('and takes one week off', COACH, T + 'avail/b1', block('b1', { off: true }), true);
  writes('but cannot give it away', COACH, T + 'avail/b1', block('b1', { coach: 'other' }), false);
  writes('nor touch another coach\'s', COACH, T + 'avail/b2', block('b2', { coach: 'other', end: '18:00' }), false);
  writes('she deletes her own', COACH, T + 'avail/b1', null, true);
  writes('not another coach\'s', COACH, T + 'avail/b2', null, false);
  writes('an admin sets any coach\'s', ADM, T + 'avail/x', block('x', { coach: 'other' }), true);
  writes('and changes any', ADM, T + 'avail/b2', block('b2', { coach: 'other', start: '16:00' }), true);
  writes('a parent cannot', MUM, T + 'avail/x', block('x', { coach: 'mum' }), false);
  writes('nor a tracker', TRK, T + 'avail/x', block('x', { coach: 'trk' }), false);
  writes('under an id that is not its own', COACH, T + 'avail/x', block('y'), false);
  writes('with no end', COACH, T + 'avail/x', { id: 'x', coach: 'coach', date: D, start: '17:00', kind: 'one', cap: 1 }, false);
  writes('a time that is not HH:MM', COACH, T + 'avail/x', block('x', { start: '5pm' }), false);
  writes('slots of no length', COACH, T + 'avail/x', block('x', { len: 0 }), false);
  writes('a kind that is neither 1-1 nor group', COACH, T + 'avail/x', block('x', { kind: 'clinic' }), false);
  writes('a 1-1 with room for two', COACH, T + 'avail/x', block('x', { cap: 2 }), false);
  writes('a group of none', COACH, T + 'avail/x', group('x', { cap: 0 }), false);
  writes('a price below nothing', COACH, T + 'avail/x', block('x', { price: -1 }), false);
  writes('a slot with no start time', COACH, T + 'avail/x', block('x', { slots: { t1700: { end: '18:00' } } }), false);
  writes('the whole collection at once', COACH, T + 'avail', { x: block('x') }, false);
  {
    const ci = DB.workspaces.CLUB.access.coachIndex;
    delete DB.workspaces.CLUB.access.coachIndex;
    writes('no coach index: a coach cannot offer times', COACH, T + 'avail/x', block('x'), false);
    writes('an admin still can', ADM, T + 'avail/x', block('x'), true);
    DB.workspaces.CLUB.access.coachIndex = ci;
  }

  console.log('\n--- a family makes a slot, only one the window offers ---');
  writes('a parent makes 6pm for her own child', MUM, T + 'sessions/' + sid(), slot(), true);
  writes('or 5pm', MUM, T + 'sessions/' + sid('17:00'), slot({ start: '17:00', end: '18:00', t0: AT17 }), true);
  writes('not for somebody else\'s child', MUM, T + 'sessions/' + sid(), slot({ pid: 'p2' }), false);
  writes('not claiming another team', MUM, T + 'sessions/' + sid(), slot({ tid: 't2' }), false);
  writes('not in somebody else\'s name', MUM, T + 'sessions/' + sid(), slot({ by: 'coach' }), false);
  writes('not off the grid: 5:30 is no slot of the window', MUM, T + 'sessions/' + sid('17:30'), slot({ start: '17:30', end: '18:30' }), false);
  writes('not longer than the slot', MUM, T + 'sessions/' + sid(), slot({ end: '19:30' }), false);
  writes('not shorter either', MUM, T + 'sessions/' + sid(), slot({ end: '18:30' }), false);
  writes('not a start time of her own', MUM, T + 'sessions/' + sid(), slot({ t0: AT18 + 1 }), false);
  writes('not on another day', MUM, T + 'sessions/' + sid('18:00', 'coach', '2026-10-09'), slot({ date: '2026-10-09' }), false);
  writes('not with another coach than the window\'s', MUM, T + 'sessions/' + sid('18:00', 'other'), slot({ coach: 'other' }), false);
  writes('not in a window that does not exist', MUM, T + 'sessions/' + sid(), slot({ slot: 'nope' }), false);
  writes('not in a week taken off', MUM, T + 'sessions/' + sid('18:00', 'coach', '2026-10-14'), slot({ slot: 'b3', date: '2026-10-14' }), false);
  writes('not in the past', MUM, T + 'sessions/' + sid('17:00', 'coach', '2025-09-01'), slot({ slot: 'bp', date: '2025-09-01', start: '17:00', end: '18:00', t0: NOW - H }), false);
  writes('not at a price of her own', MUM, T + 'sessions/' + sid(), slot({ price: 0 }), false);
  writes('not with a notice of her own', MUM, T + 'sessions/' + sid(), slot({ notice: 0 }), false);
  writes('not with more room than the window', MUM, T + 'sessions/' + sid(), slot({ cap: 6 }), false);
  writes('not as a group when the window is 1-1s', MUM, T + 'sessions/' + sid(), slot({ kind: 'group', cap: 1 }), false);
  writes('not open to other families\' asks', MUM, T + 'sessions/' + sid(), slot({ open: true }), false);
  writes('not under an id of her choosing', MUM, T + 'sessions/mine', slot({ id: 'mine' }), false);
  writes('not under another time\'s id', MUM, T + 'sessions/' + sid('17:00'), slot({ id: sid('17:00') }), false);
  writes('a tracker cannot', TRK, T + 'sessions/' + sid(), slot({ by: 'trk' }), false);
  writes('nor a stranger', RANDO, T + 'sessions/' + sid(), slot({ by: 'rando' }), false);
  {
    const keep = DB.training.CLUB.avail.b1.slots;
    DB.training.CLUB.avail.b1.slots = { t1700: keep.t1700 };
    writes('not a slot the window no longer offers (the coach is busy then)', MUM, T + 'sessions/' + sid(), slot(), false);
    DB.training.CLUB.avail.b1.slots = keep;
  }
  DB.training.CLUB.sessions[sid()] = slot({ by: 'gran', pid: 'p2' });
  writes('a time somebody already made is not made again', MUM, T + 'sessions/' + sid(), slot(), false);
  console.log('  ^ the slot\'s id is its time, so two families making 6pm write one key and one gets it.');
  delete DB.training.CLUB.sessions[sid()];

  console.log('\n--- then a seat, then the booking ---');
  DB.training.CLUB.sessions[sid()] = slot();
  writes('she takes the 1-1\'s one seat', MUM, T + 'seats/' + sid() + '/s1', seat(), true);
  writes('not a seat the window does not have', MUM, T + 'seats/' + sid() + '/s2', seat(), false);
  writes('not for another child', MUM, T + 'seats/' + sid() + '/s1', seat({ pid: 'p2' }), false);
  writes('not in another\'s name', MUM, T + 'seats/' + sid() + '/s1', seat({ by: 'gran' }), false);
  DB.training.CLUB.seats[sid()] = { s1: seat() };
  writes('a seat that is taken is not taken twice', GRAN, T + 'seats/' + sid() + '/s1', seat({ pid: 'p2', by: 'gran' }), false);
  console.log('  ^ a rule cannot count places; it can refuse a seat that exists.');
  writes('then books her child into it', MUM, T + 'booked/' + sid() + '/p1', book(), true);
  writes('not on a seat that is not hers', GRAN, T + 'booked/' + sid() + '/p2', book({ by: 'gran' }), false);
  writes('not naming a seat she does not hold', MUM, T + 'booked/' + sid() + '/p1', book({ seat: 's2' }), false);
  writes('not another child', MUM, T + 'booked/' + sid() + '/p2', book(), false);
  writes('not on a session a coach made', MUM, T + 'booked/s9/p1', book(), false);
  DB.training.CLUB.booked[sid()] = { p1: { tid: 't1', st: 'no', by: 'coach', at: 1, seat: 's1' } };
  writes('once the coach has had her say, not "in" again', MUM, T + 'booked/' + sid() + '/p1', book(), false);
  DB.training.CLUB.booked[sid()] = { p1: book() };

  console.log('\n--- a group: anyone may join, up to its seats ---');
  const G = sid('18:00', 'coach', '2026-10-08');
  writes('the first family makes the group slot', MUM, T + 'sessions/' + G, gslot(), true);
  DB.training.CLUB.sessions[G] = gslot();
  DB.training.CLUB.seats[G] = {};
  writes('and takes a seat', MUM, T + 'seats/' + G + '/s1', seat(), true);
  DB.training.CLUB.seats[G] = { s1: seat() };
  writes('another family joins, on the next seat', GRAN, T + 'seats/' + G + '/s2', seat({ pid: 'p2', by: 'gran' }), true);
  DB.training.CLUB.seats[G].s2 = seat({ pid: 'p2', by: 'gran' });
  writes('and books into it', GRAN, T + 'booked/' + G + '/p2', book({ by: 'gran', seat: 's2' }), true);
  writes('past the last seat, nobody gets in', MUM, T + 'seats/' + G + '/s3', seat(), false);
  writes('the coach can still add a player herself', COACH, T + 'booked/' + G + '/p0', { tid: 't1', st: 'in', by: 'coach', at: NOW }, true);
  delete DB.training.CLUB.seats[G].s2;
  {
    const keep = DB.training.CLUB.avail.g1.slots;
    DB.training.CLUB.avail.g1.slots = {};
    writes('a slot the window has stopped offering takes nobody new', GRAN, T + 'seats/' + G + '/s2', seat({ pid: 'p2', by: 'gran' }), false);
    DB.training.CLUB.avail.g1.slots = keep;
  }
  DB.training.CLUB.sessions[G].called = 'cancelled';
  writes('nor one the coach has called off', GRAN, T + 'seats/' + G + '/s2', seat({ pid: 'p2', by: 'gran' }), false);
  delete DB.training.CLUB.sessions[G];
  delete DB.training.CLUB.seats[G];

  console.log('\n--- cancelling, held to the coach\'s notice ---');
  writes('she takes her booking off, a day and more ahead', MUM, T + 'booked/' + sid() + '/p1', null, true);
  writes('another family cannot take it off', GRAN, T + 'booked/' + sid() + '/p1', null, false);
  writes('nor withdraw it', GRAN, T + 'booked/' + sid() + '/p1', book({ st: 'out', by: 'gran' }), false);
  writes('her seat cannot go while her booking is on it', MUM, T + 'seats/' + sid() + '/s1', null, false);
  {
    DB.training.CLUB.sessions[sid()] = slot({ t0: NOW + 3 * H });
    writes('inside the notice, she cannot take it off', MUM, T + 'booked/' + sid() + '/p1', null, false);
    writes('nor mark it withdrawn', MUM, T + 'booked/' + sid() + '/p1', book({ st: 'out' }), false);
    writes('the coach still can', COACH, T + 'booked/' + sid() + '/p1', { ...book(), st: 'out', by: 'coach' }, true);
    DB.training.CLUB.sessions[sid()] = slot({ t0: NOW + 3 * H, notice: 0 });
    writes('with no notice set, she can until it starts', MUM, T + 'booked/' + sid() + '/p1', null, true);
    DB.training.CLUB.sessions[sid()] = slot({ t0: NOW - H, notice: 0 });
    writes('but not once it has started', MUM, T + 'booked/' + sid() + '/p1', null, false);
    DB.training.CLUB.sessions[sid()] = slot();
  }
  writes('a session with a booking on it stays', MUM, T + 'sessions/' + sid(), null, false);
  delete DB.training.CLUB.booked[sid()];
  writes('then her seat goes', MUM, T + 'seats/' + sid() + '/s1', null, true);
  writes('a session with a seat held stays', MUM, T + 'sessions/' + sid(), null, false);
  delete DB.training.CLUB.seats[sid()];
  writes('then the slot itself, and the time is free', MUM, T + 'sessions/' + sid(), null, true);
  writes('another family cannot delete it', GRAN, T + 'sessions/' + sid(), null, false);
  DB.training.CLUB.came = { [sid()]: { p1: true } };
  writes('not once the register has been taken', MUM, T + 'sessions/' + sid(), null, false);
  delete DB.training.CLUB.came;
  DB.training.CLUB.fees = { [sid()]: { p1: { paid: 30, how: 'cash', at: 1, by: 'coach' } } };
  writes('nor once it has been paid for', MUM, T + 'sessions/' + sid(), null, false);
  delete DB.training.CLUB.fees;
  writes('nor can she delete a session a coach made', MUM, T + 'sessions/s1', null, false);
  DB.training.CLUB.seats[sid()] = { s1: seat() };
  writes('the coach clears any seat on her own slot', COACH, T + 'seats/' + sid(), null, true);
  writes('another coach cannot', OTHER, T + 'seats/' + sid(), null, false);
  writes('the coach deletes the slot, as any session of hers', COACH, T + 'sessions/' + sid(), null, true);

  delete DB.workspaces.CLUB.teams.t1.players.p2.guardians;
  for (const k of ['avail', 'sessions', 'booked', 'seats']) delete DB.training.CLUB[k];
}

/* ---------------- a brand-new club, under the same rules ---------------- */

/* Clubs arrive whenever they like, into the database every other club is
   already in, so making one has to work under the rules the established clubs
   run on. These are the writes pushAll() makes for a club nobody has written
   yet, in its order, each applied before the next is tried — exactly as the
   database applies one client's writes in sequence. */
{
  const put = (p, v) => {
    const segs = p.split('/');
    let cur = DB;
    for (const k of segs.slice(0, -1)) cur = cur[k] = cur[k] && typeof cur[k] === 'object' ? cur[k] : {};
    if (v === null) delete cur[segs[segs.length - 1]]; else cur[segs[segs.length - 1]] = JSON.parse(JSON.stringify(v));
  };
  const step = (label, who, p, v) => { const ok = canWrite(p, v, who); check(label, ok, true); if (ok) put(p, v); };
  const FOUNDER = { uid: 'founder' };
  const W = 'workspaces/NEWCLUB/';
  console.log('\n--- a brand-new club, made today alongside the others ---');
  writes('signed out, nobody can start one', OUT, W + 'access/admins/x', true, false);
  reads('a signed-in founder can read the empty code', FOUNDER, 'workspaces/NEWCLUB', true);
  step('she claims admin of it', FOUNDER, W + 'access/admins/founder', true);
  step('puts herself in its index', FOUNDER, W + 'access/index/founder', true);
  step('registers herself', FOUNDER, W + 'access/members/founder', { name: 'Fran', at: NOW });
  step('names the club', FOUNDER, W + 'access/org/name', 'Hillside FC');
  step('adds a team', FOUNDER, W + 'teams/tA', { id: 'tA', name: 'U9 Hawks', players: { a1: { id: 'a1', name: 'Ada' } } });
  step('and a game', FOUNDER, W + 'matches/gA', { id: 'gA', teamId: 'tA', opponent: 'Riverside' });
  step('and plans a practice', FOUNDER, 'training/NEWCLUB/practices/tA/pA', { id: 'pA', teamId: 'tA', date: '2026-10-06' });
  step('and offers a training session', FOUNDER, 'training/NEWCLUB/sessions/sA', { id: 'sA', kind: 'group', coach: 'founder', date: '2026-10-07', cap: 6, open: true });
  step('and offers times families can book', FOUNDER, 'training/NEWCLUB/avail/bA', { id: 'bA', coach: 'founder', date: '2026-10-08', start: '17:00', end: '19:00', len: 60, kind: 'group', cap: 4 });
  step('and adds a drill to the club\'s shelf', FOUNDER, 'training/NEWCLUB/drills/dA', { id: 'dA', name: 'Rondo', by: 'founder', team: 'tA', at: NOW });
  reads('and reads the shelf', FOUNDER, 'training/NEWCLUB/drills', true);
  reads('and reads the club back', FOUNDER, 'workspaces/NEWCLUB', true);
  console.log('  ^ from nothing to a working club, under the rules every other club runs on.');
  reads('from then on a stranger cannot read it', RANDO, 'workspaces/NEWCLUB', false);
  writes('nor claim it too', RANDO, W + 'access/admins/rando', true, false);
  writes('nor write a team into it', RANDO, W + 'teams/tA/name', 'Mine now', false);
  reads('nor read its practices', RANDO, 'training/NEWCLUB/practices/tA', false);
  reads('nor its drills', RANDO, 'training/NEWCLUB/drills', false);
  reads('and its founder still cannot read anyone else\'s club', FOUNDER, 'workspaces/CLUB', false);
  writes('nor write to one', FOUNDER, 'workspaces/CLUB/teams/t1/name', 'Mine now', false);
  delete DB.workspaces.NEWCLUB; delete DB.training.NEWCLUB;
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
     invite is made.

  5. The parent list is only as fresh as the last device that synced it. Its
     entries can only ever name a real guardian at the moment they are
     written, but a parent unlinked by an older copy of the app keeps reading
     that team's notices until an admin's or the coach's next connect takes
     her off. While the list does not exist at all, notices fall back to
     club-wide, as they were.

  6. A parent can answer for her child under an item key that names no game
     or entry. The rule checks whose child it is, not that the thing exists,
     because Realtime Database rules have no substring to pull a game id back
     out of the key. It costs nothing but a stray answer under her own child,
     and keeping the rule short enough to read in one go is worth more.

  7. A training session's bookings and register are readable by the whole
     club, as rsvp and the team registers are; the screen shows a family her
     own child and counts. Narrowing it in the rules would mean a listener per
     session per child on every parent's phone. Fees are narrowed by the rules.

  8. A rule cannot count, so it cannot refuse the seventh place in a group of
     six. It refuses anyone but the session's coach or an admin giving a place;
     the coach's phone keeps the count.

  9. A family books only a slot its coach's window still lists, on its grid,
     at its start time, price, size and notice, under the id its time gives
     it, and only into a seat the window has; she cancels only before the
     coach's notice. Which slots a window lists, though, is written by its
     coach's and the admins' phones, which leave out anything she is busy
     with: a team practice added from another phone is bookable until one of
     theirs next opens the app. The app checks the clash itself as well.

 10. A family can hold a second seat for the same child by hand-made writes.
     Her own booking names one seat; the coach's phone clears a seat with no
     booking on it after ten minutes.`);

console.log(`\n${failures ? failures + ' EXPECTATION(S) FAILED' : 'all expectations hold'}`);
process.exit(failures ? 1 : 0);
