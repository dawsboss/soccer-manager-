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
  for (const raw of jsonBlocks()) {
    let doc = null;
    try { doc = JSON.parse(raw); } catch (e) { }
    if (doc && doc.rules) {
      // the lockdown set is the one that knows about access/index
      if (raw.includes('access/index')) full = doc.rules;
      continue;
    }
    // a fragment is a bare "key": { ... } pair, valid JSON once wrapped
    try {
      const frag = JSON.parse('{' + raw + '}');
      for (const k of Object.keys(frag)) fragments[k] = frag[k];
    } catch (e) { }
  }
  if (!full) throw new Error('could not find the locked-down rules block in README.md');
  // Only the two README tells you to add to the live rules. Named explicitly:
  // the public block also appears as a fragment, as a variant README then warns
  // you off, and merging that would test rules nobody is meant to publish.
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
        teams: { t1: { coaches: { coach: true }, trackers: { trk: true } } },
        org: { name: 'Lakeside SC' },
        log: { e1: { at: 1, act: 'made coach', by: 'adm', target: 'coach' } }
      },
      teams: { t1: { id: 't1', name: 'Flight', players: { p1: { id: 'p1', name: 'Ella', guardians: { mum: true } } } } },
      matches: { g1: { id: 'g1', teamId: 't1', opponent: 'Riverside' } }
    },
    /* A club nobody holds a role in yet. Both halves of the bootstrap live
       here: it is the state a new club starts in, and the state README calls
       the dangerous one if you lock down while still in it. */
    FRESH: { teams: { t9: { id: 't9', name: 'New team' } } }
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

console.log('\n--- changing team and match data ---');
writes('coach edits a team', COACH, 'workspaces/CLUB/teams/t1/name', 'Flight B', true);
writes('tracker edits a team', TRK, 'workspaces/CLUB/teams/t1/name', 'Flight B', true);
writes('parent edits a team', MUM, 'workspaces/CLUB/teams/t1/name', 'Flight B', true);
writes('registered but unroled', NEWB, 'workspaces/CLUB/teams/t1/name', 'Flight B', false);
writes('signed out', OUT, 'workspaces/CLUB/teams/t1/name', 'Flight B', false);
writes('coach edits a match', COACH, 'workspaces/CLUB/matches/g1/opponent', 'Athletic', true);
writes('parent deletes a whole team', MUM, 'workspaces/CLUB/teams/t1', null, true);

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
writes('an indexed parent indexes a stranger', MUM, 'workspaces/CLUB/access/index/rando', true, true);
console.log('  ^ anyone already in the index can put anyone else in it, and the');
console.log('    index is the whole read/write gate. See the notes at the end.');

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
writes('any signed-in account can', RANDO, 'public/sh1/games/g1/status', 'done', true);
writes('a team needs a name', RANDO, 'public/sh1/team', { name: 'Flight' }, true);
writes('a team without one is rejected', RANDO, 'public/sh1/team', { logo: 'x' }, false);
writes('a game needs a status', RANDO, 'public/sh1/games/g2', { status: 'live' }, true);
writes('a game without one is rejected', RANDO, 'public/sh1/games/g2', { score: 1 }, false);

/* ---------------- what the rules and the app disagree about ---------------- */

console.log(`
--- where the interface and these rules disagree ---

  These all pass above, because the tests pin what the rules actually do. They
  are listed here because the app believes something different, and the gap only
  shows up as a refused write at a game.

  1. access/index is club-wide, so every indexed account — tracker and parent
     included — can write every team and every match. The app enforces a
     tracker's limits in the interface only, and a parent's not at all, because
     the interface never offers them the controls. README names the tracker half
     of this under "What is still not enforced"; the parent half is the same
     hole. AUTH.md's teamMembers/{teamId}/{uid} index is the fix.

  2. Anyone in access/index can add anyone else to access/index, which is the
     gate on reading and writing the entire club. The clause exists so a person
     can take themselves out, but it reads as "may write the index" and grants
     the escalation with it. Narrowing it to $uid === auth.uid for the non-admin
     case keeps the intent and closes it.

  3. The app owner has no standing in these rules at all. appOwners is read by
     the app, never by a rule, so isOwner() opens buttons the database then
     refuses. Club settings offers the owner "Open" on a retired club to export
     it, and the retire button is shown on canAdmin(); both fail unless the
     owner also holds a role in that club. Worth deciding deliberately: either
     the rules learn about appOwners, or the interface stops promising it.

  4. public/{share} is writable by any signed-in account, not just the coaches
     of that team. AUTH.md's shareOwners/{shareId}/{uid} is the designed fix and
     is step 4 of its build order.

  5. initSync() subscribes to the whole "retired" node to populate the owner's
     archive list, and the rules only ever grant retired/$code one at a time.
     That read is refused, its error handler is an empty function, so the list
     stays {} and the "Retired clubs" card silently never appears — exactly the
     escape hatch README promises the owner for exporting a closed club. The
     per-code listener beside it is fine, so clubs still let go when retired.
     Either add ".read": true on the retired node itself, or have the owner's
     archive read the codes it already knows from local storage.`);

console.log(`\n${failures ? failures + ' EXPECTATION(S) FAILED' : 'all expectations hold'}`);
process.exit(failures ? 1 : 0);
