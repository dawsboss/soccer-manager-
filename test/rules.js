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
  /* database.rules.json is built from tools/rules-source.json while clubs move
     to orgs/ (tools/rules-build.js says why). The built file is what gets
     published and what this walks; it has to be the build of the source, or
     an edit made to one is not in the other. README explains the source. */
  const built = require('../tools/rules-build.js');
  if (built.build() !== fs.readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8'))
    throw new Error('database.rules.json is not the build of tools/rules-source.json: edit the source, then run node tools/rules-build.js');
  const source = readJson('tools/rules-source.json').rules;
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
      if (frag && isRule(frag[k]) && JSON.stringify(frag[k]) !== JSON.stringify(source[k]))
        throw new Error('README\'s "' + k + '" example no longer matches tools/rules-source.json');
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
function granted(op, p, auth, after, base = DB) {
  for (const link of chain(p)) {
    const expr = link.node['.' + op];
    if (expr === undefined) continue;
    const ctx = {
      auth, now: NOW,
      root: snap(base, ''),
      data: snap(base, link.at),
      newData: snap(after || base, link.at),
      ...link.vars
    };
    if (evalExpr(expr, ctx)) return true;
  }
  return false;
}

/* .validate does not cascade: it has to hold at the written node and at every
   node under it that carries data. Deletes skip it entirely. */
function validated(p, value, after, auth = null, base = DB) {
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
    // .validate sees the writer's auth, as the database gives it; the stamp rules lean on that
    const ctx = { auth, now: NOW, root: snap(base, ''), data: snap(base, pp), newData: snap(after, pp), ...link.vars };
    if (!evalExpr(expr, ctx)) return false;
  }
  return true;
}

/* The whole walk runs twice: once as written, against clubs on
   workspaces/{code}, and once (`node test/run.js rules-orgs`, RULES_TREE=orgs) against the same clubs
   moved to orgs/{code} (AUTH.md, *The move to `orgs/{orgId}`*). The checks
   below say what they always said, in the old tree's paths; in orgs mode
   each club in the mock is moved the way moveClub moves it before every
   check, and each path goes where it moved to. So every expectation the
   rules held a club to before the move holds it after, and the few that
   are meant to differ say so with orgsOnly(). */
const ORGS = process.env.RULES_TREE === 'orgs';
function moved(tree) {
  const out = JSON.parse(JSON.stringify(tree));
  out.orgs = out.orgs || {};
  for (const [code, w] of Object.entries(out.workspaces || {})) {
    if (!w || typeof w !== 'object' || w.moved) continue;
    const { members, org, log, ...access } = w.access || {};
    const teams = {}, squad = {};
    for (const [tid, t] of Object.entries(w.teams || {})) {
      const { players, ...rest } = t || {};
      teams[tid] = rest;
      if (players) squad[tid] = players;
    }
    out.orgs[code] = { access, org, members, log, teams, squad, matches: w.matches, rsvp: w.rsvp };
    delete out.workspaces[code];
  }
  return out;
}
function orgsPath(p) {
  const m = /^workspaces\/([^/]+)(?:\/(.*))?$/.exec(p);
  if (!m) return p;
  const rest = (m[2] || 'teams')            // the club itself: its club-wide part
    .replace(/^teams\/([^/]+)\/players(?=\/|$)/, 'squad/$1')
    .replace(/^access\/(members|org|log)(?=\/|$)/, '$1');
  return 'orgs/' + m[1] + '/' + rest;
}
const canRead = (p, auth) => ORGS ? granted('read', orgsPath(p), auth, null, moved(DB)) : granted('read', p, auth);
function canWriteOn(base, p, value, auth) {
  const after = withWrite(base, p, value);
  return granted('write', p, auth, after, base) && validated(p, value, after, auth, base);
}
function canWrite(p, value, auth) {
  if (!ORGS) return canWriteOn(DB, p, value, auth);
  const base = moved(DB), q = orgsPath(p);
  /* A whole team carries its squad today; on orgs/ the app writes the two
     apart (the team, then squad/{tid}), and both have to be allowed. */
  const whole = /^orgs\/([^/]+)\/teams\/([^/]+)$/.exec(q);
  if (whole && (value === null || (value && value.players))) {
    const { players, ...team } = value || {};
    return canWriteOn(base, q, value === null ? null : team, auth) && canWriteOn(base, `orgs/${whole[1]}/squad/${whole[2]}`, players || null, auth);
  }
  return canWriteOn(base, q, value, auth);
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
  /* Who used to be allowed to publish a team's mirror, still in the database
     from before only the server wrote public/ (SECURITY.md, SEC-10). No rule
     reads it, and nobody may read or write it. */
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
  // the published copy is the server's to write (functions/mirror.js), never a phone's
  writes('the coach\'s phone cannot write the published copy\'s calendar', COACH, 'public/sh1/events', { e2: { kind: 'event', title: 'Team photo', date: '2026-09-20' } }, false);
  writes('nor the whole mirror in one write', COACH, 'public/sh1', { team: { name: 'Flight' }, games: { g1: { status: 'upcoming', called: 'cancelled', home: 'away' } }, events: { e2: { kind: 'event', date: '2026-09-20' } }, record: { w: 0 }, updated: 1 }, false);
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

/* The calendar is the coaches' (the owner, 2026-10-07): a tracker works a
   game, she does not reschedule it. And the club can say who changed it:
   every calendar write carries `edit: { by, at }`, which the rules hold to
   the writer's own uid. Sent back unchanged inside a bigger write (a whole
   team saved) it passes, or saving a team would be refused for every entry
   another coach last touched. */
{
  console.log('\n--- the calendar: the coaches\', and who changed it ---');
  const G = 'workspaces/CLUB/matches/g1/';
  writes('a tracker cannot move a game', TRK, G + 'date', '2026-10-11', false);
  writes('nor change its kick-off', TRK, G + 'kickoff', '11:00', false);
  writes('nor call it off', TRK, G + 'called', 'cancelled', false);
  writes('nor where, nor who against', TRK, G + 'venue', 'Pitch 9', false);
  writes('its coach can', COACH, G + 'called', 'cancelled', true);
  writes('and an admin', ADM, G + 'date', '2026-10-11', true);
  writes('another team\'s coach cannot', OTHER, G + 'kickoff', '11:00', false);
  writes('a tracker still saves the whole game, its when untouched', TRK, 'workspaces/CLUB/matches/g1', { ...DB.workspaces.CLUB.matches.g1, goals: { x: { t: 1 } } }, true);
  writes('but not with a new date in it', TRK, 'workspaces/CLUB/matches/g1', { ...DB.workspaces.CLUB.matches.g1, date: '2026-10-11' }, false);
  writes('the coach stamps her change as hers', COACH, G + 'edit', { by: 'coach', at: NOW }, true);
  writes('never as someone else\'s', COACH, G + 'edit', { by: 'adm', at: NOW }, false);
  writes('a stamp is who and when, nothing more', COACH, G + 'edit', { by: 'coach', at: NOW, why: 'rain' }, false);
  writes('a whole game carries hers', COACH, 'workspaces/CLUB/matches/g1', { ...DB.workspaces.CLUB.matches.g1, edit: { by: 'coach', at: NOW } }, true);
  writes('not someone else\'s', COACH, 'workspaces/CLUB/matches/g1', { ...DB.workspaces.CLUB.matches.g1, edit: { by: 'adm', at: NOW } }, false);
  const E = 'workspaces/CLUB/teams/t1/events/e1/';
  DB.workspaces.CLUB.teams.t1.events = { e1: { id: 'e1', kind: 'practice', date: '2026-10-08', start: '18:00', edit: { by: 'adm', at: 5 } } };
  writes('a practice called off, stamped by its coach', COACH, E + 'edit', { by: 'coach', at: NOW }, true);
  writes('not in the admin\'s name', COACH, E + 'edit', { by: 'adm', at: NOW }, false);
  writes('the team saved whole, the admin\'s old stamp sent back as it was', COACH, 'workspaces/CLUB/teams/t1', { ...DB.workspaces.CLUB.teams.t1 }, true);
  writes('but not altered', COACH, 'workspaces/CLUB/teams/t1', { ...DB.workspaces.CLUB.teams.t1, events: { e1: { ...DB.workspaces.CLUB.teams.t1.events.e1, edit: { by: 'adm', at: NOW } } } }, false);
  writes('a tracker still cannot touch the practice', TRK, E + 'called', 'cancelled', false);
  writes('nor a parent', MUM, E + 'called', 'cancelled', false);
  delete DB.workspaces.CLUB.teams.t1.events;
  const saved = DB.workspaces.CLUB.access.teamIndex;
  delete DB.workspaces.CLUB.access.teamIndex;
  writes('before the team index: any indexed account, as elsewhere', TRK, G + 'date', '2026-10-11', true);
  DB.workspaces.CLUB.access.teamIndex = saved;
}

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
/* SEC-2. Names on sessions, People and bookable times come from here
   (personName()), so a parent renaming the admin or a coach was a parent
   speaking in their name. Her own entry, an admin, or a coach filling in
   somebody who is not there yet (approveClaim(), a family let in through the
   team link before she ever opened the app) — nothing else. */
writes('a parent does not rename the admin', MUM, 'workspaces/CLUB/access/members/adm', { name: 'Not Ada' }, false);
writes('nor a coach', MUM, 'workspaces/CLUB/access/members/coach', { name: 'Not Jaz' }, false);
writes('nor delete one', MUM, 'workspaces/CLUB/access/members/coach', null, false);
writes('a tracker does not change someone else\'s', TRK, 'workspaces/CLUB/access/members/newbie', { name: 'Sam T' }, false);
writes('a coach does not change one already there', COACH, 'workspaces/CLUB/access/members/newbie', { name: 'Sam T' }, false);
writes('— nor delete it', COACH, 'workspaces/CLUB/access/members/newbie', null, false);
writes('a coach fills in a family not there yet', COACH, 'workspaces/CLUB/access/members/asker', { name: 'Asha', email: '', at: NOW }, true);
writes('a parent does not fill one in', MUM, 'workspaces/CLUB/access/members/asker', { name: 'Asha' }, false);
writes('nor a tracker', TRK, 'workspaces/CLUB/access/members/asker', { name: 'Asha' }, false);
writes('an admin changes anyone\'s', ADM, 'workspaces/CLUB/access/members/newbie', { name: 'Sam T' }, true);
writes('— and takes one away', ADM, 'workspaces/CLUB/access/members/newbie', null, true);
writes('everyone changes her own', MUM, 'workspaces/CLUB/access/members/mum', { name: 'Mia', email: 'mia@example.com', at: NOW }, true);
writes('— and a coach hers', COACH, 'workspaces/CLUB/access/members/coach', { name: 'Jaz B', at: 2 }, true);
{
  /* The bridge: a club whose coachIndex was never built cannot tell a coach
     from a parent, so anyone in the club may fill in a missing entry, as
     approving a family always needed; changing one already there is still
     hers or an admin's. The table appearing closes it. */
  const ci = DB.workspaces.CLUB.access.coachIndex;
  delete DB.workspaces.CLUB.access.coachIndex;
  writes('no coachIndex: a coach still fills in a family', COACH, 'workspaces/CLUB/access/members/asker', { name: 'Asha' }, true);
  writes('— as anyone in the club may', MUM, 'workspaces/CLUB/access/members/asker', { name: 'Asha' }, true);
  writes('— but nobody changes one already there', MUM, 'workspaces/CLUB/access/members/adm', { name: 'Not Ada' }, false);
  writes('— and a stranger fills in nobody', RANDO, 'workspaces/CLUB/access/members/asker', { name: 'Asha' }, false);
  DB.workspaces.CLUB.access.coachIndex = ci;
  writes('the table appearing closes it', MUM, 'workspaces/CLUB/access/members/asker', { name: 'Asha' }, false);
}

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

/* SECURITY.md, SEC-D8. Any admin could rewrite the whole admin list, and so
   remove every other admin, or take another admin's index entry and shut her
   out of reading the club. A club owner is the one the rules can tell apart:
   always an admin too, the only one who takes an admin away. A club with no
   owner keeps the old rules (the bridge), so a club that predates this works
   the moment the rules are pasted. */
{
  const A = DB.workspaces.CLUB.access;
  const keep = JSON.stringify({ admins: A.admins, index: A.index });
  const ADM2 = { uid: 'adm2' };
  A.admins = { adm: true, adm2: true, adm3: true };
  A.index = { ...A.index, adm2: true, adm3: true };
  const W = 'workspaces/CLUB/access/';
  console.log('\n--- a club with no owner yet: the old rules, and a claim ---');
  writes('an admin still removes another', ADM2, W + 'admins/adm3', null, true);
  writes('an admin claims owner', ADM2, W + 'owners/adm2', true, true);
  writes('a coach cannot', COACH, W + 'owners/coach', true, false);
  writes('nor an admin for somebody else', ADM2, W + 'owners/adm', true, false);
  writes('nor with anything but true', ADM2, W + 'owners/adm2', 'yes', false);
  writes('nor the app owner, who holds no role here', OWNER, W + 'owners/own', true, false);
  writes('an admin of the club may retire it', ADM2, 'retired/CLUB', { at: NOW, by: 'adm2' }, true);

  A.owners = { adm: true };
  console.log('\n--- once it has one: admins cannot remove one another ---');
  writes('an admin removes another admin', ADM2, W + 'admins/adm3', null, false);
  writes('nor the owner', ADM2, W + 'admins/adm', null, false);
  writes('nor rewrites the whole list', ADM2, W + 'admins', { adm2: true }, false);
  writes('nor changes another\'s entry', ADM2, W + 'admins/adm3', 'x', false);
  writes('nor takes another admin\'s index entry', ADM2, W + 'index/adm3', null, false);
  writes('nor the owner\'s', ADM2, W + 'index/adm', null, false);
  writes('but still takes a coach\'s', ADM2, W + 'index/coach', null, true);
  writes('and still indexes somebody', ADM2, W + 'index/newbie', true, true);
  writes('an admin still appoints one', ADM2, W + 'admins/coach', true, true);
  writes('only as true', ADM2, W + 'admins/coach', 'inv1', false);
  writes('a coach still cannot', COACH, W + 'admins/coach', true, false);
  writes('an admin steps down herself', ADM2, W + 'admins/adm2', null, true);
  writes('nobody claims owner once there is one', ADM2, W + 'owners/adm2', true, false);
  writes('an admin cannot retire the club', ADM2, 'retired/CLUB', { at: NOW, by: 'adm2' }, false);
  console.log('\n--- what the owner may do ---');
  writes('the owner removes an admin', ADM, W + 'admins/adm3', null, true);
  writes('and takes her index entry', ADM, W + 'index/adm3', null, true);
  writes('but not her own admin entry while owner', ADM, W + 'admins/adm', null, false);
  writes('makes another admin an owner', ADM, W + 'owners/adm2', true, true);
  writes('not someone who is not an admin', ADM, W + 'owners/coach', true, false);
  writes('the owner retires the club', ADM, 'retired/CLUB', { at: NOW, by: 'adm' }, true);
  A.owners = { adm: true, adm2: true };
  writes('two owners: one cannot remove the other', ADM, W + 'owners/adm2', null, false);
  writes('nor take her admin away', ADM, W + 'admins/adm2', null, false);
  writes('nor her index entry', ADM, W + 'index/adm2', null, false);
  writes('an owner steps down herself', ADM2, W + 'owners/adm2', null, true);
  writes('and a coach cannot touch owners', COACH, W + 'owners/adm2', null, false);

  console.log('\n--- what happened, kept where no phone writes ---');
  DB.clubAudit = { CLUB: { x1: { at: NOW, act: 'removed admin', target: 'adm3', by: 'adm' } } };
  reads('an admin reads the club\'s record', ADM, 'clubAudit/CLUB', true);
  reads('a coach does not', COACH, 'clubAudit/CLUB', false);
  reads('nor a stranger', RANDO, 'clubAudit/CLUB', false);
  writes('nobody writes it, an admin included', ADM, 'clubAudit/CLUB/x2', { at: NOW, act: 'x' }, false);
  writes('nor deletes it', ADM, 'clubAudit/CLUB/x1', null, false);
  delete DB.clubAudit;

  delete A.owners;
  Object.assign(A, JSON.parse(keep));
}

console.log('\n--- appOwners is console-only ---');
reads('readable once signed in', RANDO, 'appOwners', true);
reads('not readable signed out', OUT, 'appOwners', false);
writes('nobody can write it, owner included', OWNER, 'appOwners/rando', true, false);

console.log('\n--- the published mirror: the server writes it, nobody else ---');
reads('anyone at all can read it', OUT, 'public/sh1', true);
/* SECURITY.md, SEC-10: a phone could publish under any id nobody had claimed,
   so anyone signed in could put a made-up fixture under the club's address.
   Now only the server writes public/ (functions/mirror.js and mycal.js, with
   admin credentials), and the rule refuses every account, whatever it is. */
for (const [who, a] of [['signed out', OUT], ['a passing account', RANDO], ['an account with no role', NEWB], ['a parent', MUM],
  ['a tracker', TRK], ['the team\'s coach', COACH], ['another team\'s coach', OTHER], ['the club\'s admin', ADM], ['the app owner', OWNER]]) {
  writes(`${who} cannot write a page`, a, 'public/sh1/games/g1/status', 'done', false);
  writes(`— nor make one under an id nobody has`, a, 'public/brandnew', { team: { name: 'Saturday is cancelled' }, games: { g1: { status: 'upcoming' } } }, false);
  writes(`— nor take one down`, a, 'public/sh1', null, false);
}
console.log('  ^ the write hole AUTH.md names, closed for good: nothing to claim, nothing to label.');

console.log('\n--- shareOwners is gone ---');
writes('an unclaimed share can no longer be claimed', RANDO, 'shareOwners/brandnew', { rando: true }, false);
writes('nor a claimed one added to', COACH, 'shareOwners/sh1/newbie', true, false);
reads('nor read', COACH, 'shareOwners/sh1', false);

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

  console.log('\n--- a player\'s own account: the coach gives it ---');
  {
    const pbase = { ...base, by: 'coach', role: 'player', player: 'p1' };
    writes('the team\'s coach makes one for a player on it', COACH, 'invites/pl1', pbase, true);
    writes('an admin makes one', ADM, 'invites/pl1', { ...pbase, by: 'adm' }, true);
    writes('a player invite must name a player', COACH, 'invites/pl1', { ...pbase, player: undefined }, false);
    writes('not for a player who is not on the team', COACH, 'invites/pl1', { ...pbase, player: 'nope' }, false);
    writes('a coach of another team cannot', OTHER, 'invites/pl1', { ...pbase, by: 'other' }, false);
    writes('a parent cannot, not even for her own child', MUM, 'invites/pl1', { ...pbase, by: 'mum' }, false);
    writes('the tracker cannot', TRK, 'invites/pl1', { ...pbase, by: 'trk' }, false);
    writes('and a coach still cannot make any other kind', COACH, 'invites/pl1', { ...pbase, role: 'parent' }, false);
    DB.invites.pl1 = pbase;
    DB.invites.spl = { ...pbase, used: { by: 'newbie', at: NOW } };
    writes('she lists it for the admins', COACH, 'clubInvites/CLUB/pl1', { role: 'player', team: 't1' }, true);
    writes('not as another team\'s', COACH, 'clubInvites/CLUB/pl1', { role: 'player', team: 't2' }, false);
    writes('not as another kind of invite', COACH, 'clubInvites/CLUB/pl1', { role: 'coach', team: 't1' }, false);
    writes('not an invite she did not make', COACH, 'clubInvites/CLUB/sc', { role: 'player', team: 't1' }, false);
    DB.clubInvites.CLUB.pl1 = { role: 'player', team: 't1' };
    writes('and takes it off the list', COACH, 'clubInvites/CLUB/pl1', null, true);
    writes('another team\'s coach cannot', OTHER, 'clubInvites/CLUB/pl1', null, false);
    writes('nor a coach take a coach invite off it', COACH, 'clubInvites/CLUB/sc', null, false);
    writes('the coach withdraws the invite itself', COACH, 'invites/pl1', null, true);
    console.log('  spending one:');
    writes('the player\'s own account on that player', SAM, W + 'teams/t1/players/p1/self/newbie', 'spl', true);
    writes('not on another player', SAM, W + 'teams/t1/players/p2/self/newbie', 'spl', false);
    writes('a player invite does not make a parent', SAM, W + 'teams/t1/players/p1/guardians/newbie', 'spl', false);
    writes('nor a parent invite a player', SAM, W + 'teams/t1/players/p1/self/newbie', 'sp', false);
    writes('nor somebody else onto the player', SAM, W + 'teams/t1/players/p1/self/rando', 'spl', false);
    writes('it indexes her account in the club', SAM, W + 'access/index/newbie', 'spl', true);
    writes('and nothing more of the team', SAM, W + 'teams/t1/players/p1/name', 'spl', false);
    delete DB.invites.pl1; delete DB.invites.spl;
  }

  delete DB.invites; delete DB.clubInvites;
}

/* ---------------- a calendar of your own ---------------- */

/* AVAILABILITY.md, "My calendar is yours, not a club's". Her phone reads her
   other clubs itself, so nothing about a club is stored under her; her busy
   times are readable by anyone signed in, carry nothing but times, and
   cannot be written at all until she says so. */
{
  console.log('\n--- my calendar, across clubs ---');
  const P = 'people/coach/';
  writes('no summary of a club is kept for her anywhere', COACH, P + 'cal/CLUB', { name: 'Lakeside SC', at: NOW }, false);
  writes('nor anything else under her name', COACH, P + 'notes', { x: 1 }, false);
  reads('nobody lists everyone', OWNER, 'people', false);
  DB.people = { coach: {} };
  const busy = { at: NOW, b: { i1: { d: '2026-10-05', s: '17:00', e: '18:30' } } };
  writes('private by default: no busy times while sharing is off', COACH, P + 'busy/abc123', busy, false);
  writes('I say whether to share', COACH, P + 'set', { share: true, at: NOW }, true);
  writes('it is a yes or a no', COACH, P + 'set', { share: 'everyone', at: NOW }, false);
  writes('nobody says it for me', ADM, P + 'set', { share: true, at: NOW }, false);
  reads('nobody else reads it', ADM, P + 'set', false);
  writes('my calendar feed\'s address is kept with it, for my other phones', COACH, P + 'set', { share: false, at: NOW, feed: 'mAbc123Def456' }, true);
  writes('an address, not a document', COACH, P + 'set', { share: false, at: NOW, feed: { items: {} } }, false);
  writes('nor anything else beside it', COACH, P + 'set', { share: false, at: NOW, feed: 'mAbc123Def456', clubs: 'CLUB' }, false);
  DB.people.coach.set = { share: true, at: NOW };
  writes('shared: my busy times go up', COACH, P + 'busy/abc123', busy, true);
  writes('times only: no title', COACH, P + 'busy/abc123', { at: NOW, b: { i1: { ...busy.b.i1, t: 'Practice' } } }, false);
  writes('and no place, or which club', COACH, P + 'busy/abc123', { at: NOW, club: 'CLUB', b: busy.b }, false);
  writes('not in somebody else\'s name', ADM, P + 'busy/abc123', busy, false);
  DB.people.coach.busy = { abc123: busy };
  reads('anyone signed in reads them', RANDO, P + 'busy', true);
  reads('not signed out', null, P + 'busy', false);
  DB.people.coach.set = { share: false, at: NOW };
  writes('turned private, nothing more goes up', COACH, P + 'busy/abc123', busy, false);
  writes('and what was there comes down', COACH, P + 'busy', null, true);
  writes('only by me', ADM, P + 'busy', null, false);
  // what notifies her: a yes-or-no per kind, hers alone, which the server reads before it pushes
  writes('she turns a kind of notification off', COACH, P + 'mute/cal', true, true);
  writes('and back on', COACH, P + 'mute/cal', false, true);
  writes('each of the four kinds', COACH, P + 'mute/msg', true, true);
  writes('only those four', COACH, P + 'mute/goals', true, false);
  writes('only a yes or a no', COACH, P + 'mute/notice', 'quiet', false);
  writes('nobody does it for her', ADM, P + 'mute/news', true, false);
  writes('not all at once as a blob', COACH, P + 'mute', { msg: true }, false);
  reads('she reads her own', COACH, P + 'mute', true);
  reads('nobody else does, an admin included', ADM, P + 'mute', false);
  console.log('  ^ shared means readable by anyone signed in who knows her uid;');
  console.log('    a uid is only shown inside a club she is in, but it is no secret.');
  delete DB.people;
}

/* ---------------- a phone's notifications ---------------- */

/* GOTSPORT.md, Push notifications. Each phone that turns notifications on
   leaves its Cloud Messaging token under its own account, for the server to
   send to. A token is the address of one person's phone, so it is hers alone:
   nobody lists them, nobody else adds one under her name (which would send
   her conversations to their phone), and the server, which writes with admin
   credentials, is the only other thing that ever touches them. */
{
  console.log('\n--- a phone\'s notifications ---');
  const TOK = 'fA1b2C3d4E5:APA91bHxYz_abc-DEF123456789';
  const P = 'pushTokens/mum/';
  writes('I leave my phone\'s address for the server', MUM, P + TOK, { at: NOW, ua: 'iPhone' }, true);
  writes('nobody leaves one under my name', COACH, P + TOK, { at: NOW }, false);
  writes('not even an admin', ADM, P + TOK, { at: NOW }, false);
  writes('nor signed out', OUT, P + TOK, { at: NOW }, false);
  writes('when it was left, and nothing else', MUM, P + TOK, { at: NOW, uid: 'coach' }, false);
  writes('a time is a number', MUM, P + TOK, { at: 'today' }, false);
  writes('and the phone\'s name is short', MUM, P + TOK, { at: NOW, ua: 'x'.repeat(61) }, false);
  writes('a token, not a word', MUM, P + 'abc', { at: NOW }, false);
  DB.pushTokens = { mum: { [TOK]: { at: NOW } } };
  reads('I read my own', MUM, P, true);
  reads('nobody else reads them', ADM, P, false);
  reads('the app owner neither', OWNER, P, false);
  reads('nobody lists everyone\'s', ADM, 'pushTokens', false);
  writes('I take mine away', MUM, P + TOK, null, true);
  writes('nobody else does', COACH, P + TOK, null, false);
  delete DB.pushTokens;
  // the server's own notes (which calendar change it last told), kept with admin credentials
  DB.serverState = { calSent: { CLUB: { e_e1: { sig: '2026-10-08|18:00|cancelled', at: NOW } } } };
  reads('the server\'s notes: no admin reads them', ADM, 'serverState', false);
  reads('nor a coach', COACH, 'serverState/calSent/CLUB', false);
  writes('nobody writes them', ADM, 'serverState/calSent/CLUB/e_e1', { sig: 'x', at: NOW }, false);
  writes('nor clears them', COACH, 'serverState/calSent/CLUB/e_e1', null, false);
  delete DB.serverState;
}

/* ---------------- following a game ---------------- */

/* The Live tab's *Notify me*, kept where the server can find it, so a goal
   reaches a phone with Minutes closed (functions/push.js, onFollowed). Every
   role may follow a game, because every role reads it; what is stored is
   that she follows it and when, under her own uid, and the server is the
   only other thing that reads or clears it. */
{
  console.log('\n--- following a game ---');
  const F = 'follow/CLUB/g1/';
  writes('a parent follows her team\'s game', MUM, F + 'mum', { at: NOW }, true);
  writes('so does a tracker', TRK, F + 'trk', { at: NOW }, true);
  writes('and an admin', ADM, F + 'adm', { at: NOW }, true);
  writes('and its coach', COACH, F + 'coach', { at: NOW }, true);
  writes('nobody follows it in someone else\'s name', COACH, F + 'mum', { at: NOW }, false);
  writes('not someone the club does not know', RANDO, F + 'rando', { at: NOW }, false);
  writes('nor signed out', OUT, F + 'mum', { at: NOW }, false);
  writes('a game that does not exist', MUM, 'follow/CLUB/g9/mum', { at: NOW }, false);
  writes('another club\'s game, by its code', MUM, 'follow/FRESH/g1/mum', { at: NOW }, false);
  writes('when, and nothing else', MUM, F + 'mum', { at: NOW, name: 'Ella' }, false);
  writes('a time is a number', MUM, F + 'mum', { at: 'now' }, false);
  DB.follow = { CLUB: { g1: { mum: { at: NOW } } } };
  reads('she reads her own', MUM, F + 'mum', true);
  reads('nobody lists who follows a game', ADM, F, false);
  reads('nor reads hers', COACH, F + 'mum', false);
  writes('she stops', MUM, F + 'mum', null, true);
  writes('nobody stops it for her', ADM, F + 'mum', null, false);
  DB.workspaces.CLUB.matches.g1.ended = NOW;
  writes('a game that has ended is not followed', TRK, F + 'trk', { at: NOW }, false);
  writes('but she can still stop', MUM, F + 'mum', null, true);
  delete DB.workspaces.CLUB.matches.g1.ended;
  delete DB.follow;
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
  /* A plan hangs off its calendar entry and takes its day from there, so it
     carries no date; an older app still sends one, and that is fine too. */
  writes('with no date: the calendar entry has it', COACH, T + 'practices/t1/x', { id: 'x', teamId: 't1', eid: 'x', blocks: [] }, true);
  writes('and an older app\'s, with its own date', COACH, T + 'practices/t1/x', plan('x', 't1'), true);
  writes('with no team named', COACH, T + 'practices/t1/x', { id: 'x' }, false);
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
  // "delivered": each reader's phone says it has the conversation, beside its read marker and under the same rule
  writes('the parent\'s phone says it got it', MUM, 'dm/CLUB/t1/mum/got/mum', NOW, true);
  writes('the coach\'s phone says it got it', COACH, 'dm/CLUB/t1/mum/got/coach', NOW, true);
  writes('not as somebody else', COACH, 'dm/CLUB/t1/mum/got/mum', NOW, false);
  writes('not another family\'s', MUM, 'dm/CLUB/t1/dad/got/mum', NOW, false);
  writes('not a coach of another team', OTHER, 'dm/CLUB/t1/mum/got/other', NOW, false);
  writes('only a time', MUM, 'dm/CLUB/t1/mum/got/mum', 'yes', false);
  // a coach or admin may be the one to start a family's conversation
  writes('the coach writes first to a family', COACH, 'dm/CLUB/t1/mum/m/x2', msg('coach'), true);

  console.log('\n--- coaches and admins talking to each other ---');
  // staffdm/{code}/{a}~{b}: two people, both a coach or an admin, and nobody else, admins included
  const SD = 'staffdm/CLUB/coach~other';
  reads('a coach reads her conversation with another coach', COACH, SD, true);
  reads('and so does the other coach', OTHER, SD, true);
  reads('an admin who is not in it does not', ADM, SD, false);
  reads('nor a parent', MUM, SD, false);
  reads('nor the tracker', TRK, SD, false);
  reads('nobody reads the list of them', ADM, 'staffdm/CLUB', false);
  reads('an admin reads her own with a coach', ADM, 'staffdm/CLUB/adm~coach', true);
  reads('signed out does not', OUT, SD, false);
  writes('a coach writes to a coach', COACH, SD + '/m/s1', msg('coach'), true);
  writes('the other answers', OTHER, SD + '/m/s1', msg('other'), true);
  writes('not in the other\'s name', COACH, SD + '/m/s1', msg('other'), false);
  writes('an admin writes to a coach', ADM, 'staffdm/CLUB/adm~coach/m/s1', msg('adm'), true);
  writes('nobody writes into a conversation that is not hers', ADM, SD + '/m/s1', msg('adm'), false);
  writes('a parent cannot start one, even naming herself', MUM, 'staffdm/CLUB/coach~mum/m/s1', msg('mum'), false);
  writes('nor the tracker', TRK, 'staffdm/CLUB/coach~trk/m/s1', msg('trk'), false);
  writes('nor somebody unknown', RANDO, 'staffdm/CLUB/coach~rando/m/s1', msg('rando'), false);
  writes('a name merely containing hers is not hers', COACH, 'staffdm/CLUB/xcoach~other/m/s1', msg('coach'), false);
  writes('nobody edits a message', COACH, SD + '/m/d1/text', 'changed', false);
  writes('an empty one is refused', COACH, SD + '/m/s1', { ...msg('coach'), text: '' }, false);
  writes('the whole conversation cannot be written', COACH, SD, { m: {} }, false);
  writes('she marks it read', OTHER, SD + '/seen/other', NOW, true);
  writes('and her phone says it got it', OTHER, SD + '/got/other', NOW, true);
  writes('not for the other', OTHER, SD + '/seen/coach', NOW, false);
  writes('not on somebody else\'s', ADM, SD + '/got/adm', NOW, false);
  {
    // a coach who has left (off coachIndex) neither reads nor writes there any more
    const ci = DB.workspaces.CLUB.access.coachIndex;
    DB.workspaces.CLUB.access.coachIndex = { coach: 't1' };
    reads('a coach no longer coaching cannot read it', OTHER, SD, false);
    writes('nor write in it', OTHER, SD + '/m/s1', msg('other'), false);
    DB.workspaces.CLUB.access.coachIndex = ci;
  }

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

  console.log('\n--- a player with her own account ---');
  {
    /* Ella has her own sign-in, given by her coach. She reads what her parents
       read and writes in her family's conversations, where her parents and
       every coach and admin see each word, and never has one of her own. */
    const ELLA = { uid: 'ella' };
    DB.workspaces.CLUB.teams.t1.players.p1.self = { ella: 'spl' };
    DB.workspaces.CLUB.teams.t1.players.p1.guardians = { mum: true, dad2: true };
    A.index.ella = true;
    const TPL = 'workspaces/CLUB/access/teamPlayers/';
    writes('she puts herself on the team\'s player list, naming herself', ELLA, TPL + 't1/ella', 'p1', true);
    writes('not naming another player', ELLA, TPL + 't1/ella', 'p2', false);
    writes('a parent cannot put herself on it', MUM, TPL + 't1/mum', 'p1', false);
    writes('the coach can put her on it', COACH, TPL + 't1/ella', 'p1', true);
    writes('another team\'s coach cannot', OTHER, TPL + 't1/ella', 'p1', false);
    A.teamPlayers = { t1: { ella: 'p1' } };
    reads('she reads her team\'s notices', ELLA, 'board/CLUB/t1', true);
    reads('not another team\'s', ELLA, 'board/CLUB/t2', false);
    writes('and ticks one seen', ELLA, 'board/CLUB/t1/n1/seen/ella', NOW, true);
    writes('but cannot post one', ELLA, 'board/CLUB/t1/n9', post('ella'), false);
    reads('she reads her mum\'s conversation with the coaches', ELLA, 'dm/CLUB/t1/mum', true);
    reads('and her other parent\'s', ELLA, 'dm/CLUB/t1/dad2', true);
    reads('never another family\'s', ELLA, 'dm/CLUB/t1/dad', false);
    reads('nor the list of them', ELLA, 'dm/CLUB/t1', false);
    writes('she writes in her family\'s conversation', ELLA, 'dm/CLUB/t1/mum/m/x1', msg('ella'), true);
    writes('not signed as her mum', ELLA, 'dm/CLUB/t1/mum/m/x1', msg('mum'), false);
    writes('not in another family\'s', ELLA, 'dm/CLUB/t1/dad/m/x1', msg('ella'), false);
    writes('and never starts one of her own with the coaches', ELLA, 'dm/CLUB/t1/ella/m/x1', msg('ella'), false);
    writes('she marks her family\'s read', ELLA, 'dm/CLUB/t1/mum/seen/ella', NOW, true);
    writes('the coach still reads it all', COACH, 'dm/CLUB/t1/mum/m/x2', msg('coach'), true);
    const R = 'workspaces/CLUB/rsvp/t1/g_g1/';
    writes('she says whether she is going', ELLA, R + 'p1', { v: 'yes', by: 'ella', at: NOW }, true);
    writes('not for a teammate', ELLA, R + 'p2', { v: 'yes', by: 'ella', at: NOW }, false);
    writes('and her mum can still change it', MUM, R + 'p1', { v: 'no', by: 'mum', at: NOW }, true);
    writes('she writes nothing of the team', ELLA, 'workspaces/CLUB/teams/t1/players/p1/name', 'Ellie', false);
    writes('nor gives herself a parent', ELLA, 'workspaces/CLUB/teams/t1/players/p1/guardians/ella', true, false);
    delete DB.workspaces.CLUB.teams.t1.players.p1.self;
    reads('taken off the player, she reads no conversation', ELLA, 'dm/CLUB/t1/mum', false);
    writes('nor answers for her', ELLA, R + 'p1', { v: 'yes', by: 'ella', at: NOW }, false);
    DB.workspaces.CLUB.teams.t1.players.p1.guardians = { mum: true };
    delete A.teamPlayers; delete A.index.ella;
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

  console.log('\n--- packages: a fee covering several places ---');
  const pack = (extra = {}) => ({ id: 'k1', n: 10, price: 180, kind: 'any', paid: 180, how: 'transfer', at: NOW, by: 'adm', ...extra });
  writes('an admin sells one', ADM, T + 'packs/t1/p1/k1', pack(), true);
  writes('a coach does not', COACH, T + 'packs/t1/p1/k1', pack({ by: 'coach' }), false);
  writes('nor a family, for her own child', MUM, T + 'packs/t1/p1/k1', pack({ by: 'mum' }), false);
  writes('ten places, not ten thousand', ADM, T + 'packs/t1/p1/k1', pack({ n: 10000 }), false);
  writes('a kind of session it knows', ADM, T + 'packs/t1/p1/k1', pack({ kind: 'everything' }), false);
  writes('nothing tucked inside it', ADM, T + 'packs/t1/p1/k1', pack({ owner: 'mum' }), false);
  DB.training.CLUB.packs = { t1: { p1: { k1: pack() } } };
  reads('an admin reads them all', ADM, T + 'packs', true);
  reads('a coach reads them, to use one on a place she runs', COACH, T + 'packs', true);
  reads('a family reads her own child\'s', MUM, T + 'packs/t1/p1', true);
  reads('not another child\'s', MUM, T + 'packs/t1/p2', false);
  reads('nor the list', MUM, T + 'packs', false);
  reads('a tracker reads none', TRK, T + 'packs/t1/p1', false);
  const use = { by: 'coach', at: NOW };
  writes('the session\'s coach uses a place of it', COACH, T + 'packuse/t1/p1/k1/s1', use, true);
  writes('not on another coach\'s session', COACH, T + 'packuse/t1/p1/k1/s2', use, false);
  writes('an admin on any', ADM, T + 'packuse/t1/p1/k1/s2', { by: 'adm', at: NOW }, true);
  writes('not a package that does not exist', COACH, T + 'packuse/t1/p1/nope/s1', use, false);
  writes('nor a family', MUM, T + 'packuse/t1/p1/k1/s1', { by: 'mum', at: NOW }, false);
  DB.training.CLUB.packuse = { t1: { p1: { k1: { s1: use } } } };
  reads('a family reads how much of it is used', MUM, T + 'packuse/t1/p1', true);
  writes('and the coach gives a place back', COACH, T + 'packuse/t1/p1/k1/s1', null, true);
  writes('the place\'s fee says it is on the package', COACH, T + 'fees/s1/p1', fee({ paid: 0, how: 'package', pack: 'k1' }), true);
  writes('naming the package', COACH, T + 'fees/s1/p1', fee({ paid: 0, how: 'package' }), false);
  writes('one that exists, for that child', COACH, T + 'fees/s1/p1', fee({ paid: 0, how: 'package', pack: 'k9' }), false);
  console.log('  ^ a rule cannot count, so it cannot stop an eleventh place on a ten-place package;');
  console.log('    the app counts, as it counts a group\'s spots. Coaches read every package, to use one.');
  delete DB.training.CLUB.packs; delete DB.training.CLUB.packuse;

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
   themselves, one child each for a 1-1 or up to its places for a group. A
   rule cannot count, search or do dates, so a family's phone no longer books
   by writing (it did, in three writes held to a list of slots and a numbered
   seat each): it asks the server at bookAsks/{code}/{uid}/{id}, which counts
   the places inside a transaction and writes the session and the booking
   with admin credentials (functions/book.js, test/book.js). What is left for
   the rules: who may ask, and that nobody but the server answers. */
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
    g1: group('g1', { date: '2026-10-08' })
  };
  DB.training.CLUB.sessions = {};
  DB.training.CLUB.booked = {};
  const sid = (start = '18:00', coach = 'coach', date = D) => 'k_' + coach + '_' + date + '_' + start.replace(':', '');
  const slot = (extra = {}) => {
    const v = { kind: 'one', coach: 'coach', date: D, start: '18:00', end: '19:00', t0: AT18, price: 30, notice: 24, open: false, cap: 1,
      slot: 'b1', pid: 'p1', tid: 't1', by: 'mum', ...extra };
    v.id = extra.id || sid(v.start, v.coach, v.date);
    return v;
  };
  const book = (extra = {}) => ({ tid: 't1', st: 'in', by: 'mum', at: NOW, ...extra });
  const GRAN = { uid: 'gran' };
  DB.workspaces.CLUB.teams.t1.players.p2.guardians = { gran: true };

  console.log('\n--- bookable times: the club reads them ---');
  reads('a parent reads every coach\'s times', MUM, T + 'avail', true);
  reads('a coach does', COACH, T + 'avail', true);
  reads('a stranger does not', RANDO, T + 'avail', false);
  reads('signed out does not', OUT, T + 'avail', false);
  reads('nobody reads seats any more: there are none', MUM, T + 'seats', false);

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
  writes('with her own midnight, for the server to time the slots by', COACH, T + 'avail/x', block('x', { day0: AT17 - 17 * H }), true);
  writes('which is a number', COACH, T + 'avail/x', block('x', { day0: 'today' }), false);
  writes('the whole collection at once', COACH, T + 'avail', { x: block('x') }, false);
  {
    const ci = DB.workspaces.CLUB.access.coachIndex;
    delete DB.workspaces.CLUB.access.coachIndex;
    writes('no coach index: a coach cannot offer times', COACH, T + 'avail/x', block('x'), false);
    writes('an admin still can', ADM, T + 'avail/x', block('x'), true);
    DB.workspaces.CLUB.access.coachIndex = ci;
  }

  console.log('\n--- a family no longer books by writing ---');
  writes('she cannot make a slot herself', MUM, T + 'sessions/' + sid(), slot(), false);
  writes('nor a group slot', MUM, T + 'sessions/' + sid('18:00', 'coach', '2026-10-08'), slot({ kind: 'group', cap: 2, slot: 'g1', date: '2026-10-08' }), false);
  writes('nor take a seat', MUM, T + 'seats/' + sid() + '/s1', { pid: 'p1', tid: 't1', by: 'mum', at: NOW }, false);
  DB.training.CLUB.sessions[sid()] = slot();
  writes('nor book her child into a slot', MUM, T + 'booked/' + sid() + '/p1', book(), false);
  writes('nor put her child on its waiting list', MUM, T + 'booked/' + sid() + '/p1', book({ st: 'wait' }), false);
  DB.training.CLUB.booked[sid()] = { p1: book() };
  writes('nor take her booking off: the server checks the notice', MUM, T + 'booked/' + sid() + '/p1', null, false);
  writes('nor mark it withdrawn', MUM, T + 'booked/' + sid() + '/p1', book({ st: 'out' }), false);
  writes('nor delete the slot', MUM, T + 'sessions/' + sid(), null, false);
  console.log('  ^ booking, the waiting list and cancelling a slot go through the server (bookAsks below).');
  writes('the coach still takes a child off her own slot', COACH, T + 'booked/' + sid() + '/p1', { ...book(), st: 'out', by: 'coach' }, true);
  writes('and adds one herself', COACH, T + 'booked/' + sid() + '/p0', { tid: 't1', st: 'in', by: 'coach', at: NOW }, true);
  writes('another coach cannot', OTHER, T + 'booked/' + sid() + '/p0', { tid: 't1', st: 'in', by: 'other', at: NOW }, false);
  writes('the coach deletes the slot, as any session of hers', COACH, T + 'sessions/' + sid(), null, true);
  writes('an admin does', ADM, T + 'sessions/' + sid(), null, true);
  {
    // an ordinary session a coach opened to asks: a family still asks and withdraws there herself
    DB.training.CLUB.sessions.s5 = { id: 's5', kind: 'group', coach: 'coach', date: D, start: '18:00', cap: 6, open: true };
    writes('on an ordinary open session she still asks', MUM, T + 'booked/s5/p1', book({ st: 'asked' }), true);
    DB.training.CLUB.booked.s5 = { p1: book({ st: 'in', by: 'coach' }) };
    writes('and withdraws, at any time', MUM, T + 'booked/s5/p1', book({ st: 'out' }), true);
    writes('but never books herself in', MUM, T + 'booked/s5/p1', book({ st: 'in' }), false);
    delete DB.training.CLUB.sessions.s5; delete DB.training.CLUB.booked.s5;
  }

  console.log('\n--- asking the server: bookAsks ---');
  const A = 'bookAsks/CLUB/';
  const ask = (extra = {}) => ({ op: 'book', block: 'b1', start: '18:00', tid: 't1', pid: 'p1', at: NOW, ...extra });
  writes('a family asks, in her own name', MUM, A + 'mum/a1', ask(), true);
  writes('with what her child wants, and for the waiting list', MUM, A + 'mum/a1', ask({ want: 'Weak foot', wait: true }), true);
  writes('or to cancel', MUM, A + 'mum/a1', { op: 'cancel', sid: sid(), pid: 'p1', at: NOW }, true);
  writes('not in somebody else\'s name', MUM, A + 'gran/a1', ask(), false);
  writes('not with the answer already written', MUM, A + 'mum/a1', { ...ask(), answer: { ok: true, st: 'in' } }, false);
  writes('not something else', MUM, A + 'mum/a1', ask({ op: 'steal' }), false);
  writes('stamped by a phone whose clock is a few minutes out', MUM, A + 'mum/a1', ask({ at: NOW + 4 * 60000 }), true);
  writes('not stamped an hour ago, or ahead', MUM, A + 'mum/a1', ask({ at: NOW - H }), false);
  writes('nor an hour ahead', MUM, A + 'mum/a1', ask({ at: NOW + H }), false);
  writes('nor without a child', MUM, A + 'mum/a1', { op: 'book', at: NOW }, false);
  writes('not to a club she is not in', RANDO, A + 'rando/a1', ask(), false);
  writes('signed out, not at all', OUT, A + 'x/a1', ask(), false);
  reads('she reads her own asks and their answers', MUM, A + 'mum', true);
  reads('not another family\'s', GRAN, A + 'mum', false);
  reads('not an admin either', ADM, A + 'mum', false);
  DB.bookAsks = { CLUB: { mum: { a1: { ...ask(), answer: { ok: true, st: 'in', at: NOW } } } } };
  writes('the answer is never hers to write', MUM, A + 'mum/a1/answer', { ok: true, st: 'in', at: NOW }, false);
  writes('nor is an ask changed once made', MUM, A + 'mum/a1', ask({ pid: 'p2' }), false);
  writes('she clears it away when she has read it', MUM, A + 'mum/a1', null, true);
  writes('nobody else does', GRAN, A + 'mum/a1', null, false);
  delete DB.bookAsks;

  delete DB.workspaces.CLUB.teams.t1.players.p2.guardians;
  for (const k of ['avail', 'sessions', 'booked']) delete DB.training.CLUB[k];
}

/* ---------------- coaches' time off ---------------- */
{
  const T = 'training/CLUB/away/';
  const rec = (id, by, extra = {}) => ({ id, kind: 'weekly', days: [0], by, at: 1, ...extra });
  console.log('\n--- coaches\' time off: refused first ---');
  reads('a parent cannot read it', MUM, 'training/CLUB/away', false);
  reads('nor one coach\'s', MUM, T + 'coach', false);
  reads('a tracker cannot', TRK, 'training/CLUB/away', false);
  reads('registered, no role yet', NEWB, 'training/CLUB/away', false);
  reads('signed out', OUT, 'training/CLUB/away', false);
  writes('a parent cannot write a coach\'s', MUM, T + 'coach/x', rec('x', 'mum'), false);
  writes('another coach cannot write hers', OTHER, T + 'coach/x', rec('x', 'other'), false);
  writes('nor delete it', OTHER, T + 'coach/x', null, false);
  console.log('\n--- and allowed to coaches and admins ---');
  reads('a coach reads every coach\'s', COACH, 'training/CLUB/away', true);
  reads('an admin does', ADM, 'training/CLUB/away', true);
  reads('anyone reads her own', NEWB, T + 'newbie', true);
  writes('a coach writes her own', COACH, T + 'coach/x', rec('x', 'coach'), true);
  writes('dates away', COACH, T + 'coach/x', { id: 'x', kind: 'dates', from: '2026-10-12', to: '2026-10-19', by: 'coach', at: 1 }, true);
  writes('a call-out', COACH, T + 'coach/x', { id: 'x', kind: 'callout', item: 'e:e1', tid: 't1', by: 'coach', at: 1 }, true);
  writes('and deletes it', COACH, T + 'coach/x', null, true);
  writes('an admin writes anyone\'s', ADM, T + 'coach/y', rec('y', 'adm'), true);
  writes('but not in someone else\'s name', COACH, T + 'coach/x', rec('x', 'other'), false);
  writes('nor a kind there isn\'t', COACH, T + 'coach/x', rec('x', 'coach', { kind: 'forever' }), false);
  writes('nor under an id that is not its own', COACH, T + 'coach/x', rec('y', 'coach'), false);
  writes('nor a note longer than 80', COACH, T + 'coach/x', rec('x', 'coach', { note: 'x'.repeat(81) }), false);
  writes('nor everyone\'s at once', ADM, 'training/CLUB/away', { coach: { x: rec('x', 'adm') } }, false);
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
  step('and owner of it, before anyone else is in it', FOUNDER, W + 'access/owners/founder', true);
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

/* ---------------- a club on orgs/ ---------------- */

/* What the move is for (SECURITY.md, SEC-1): on orgs/{code} each part of a
   club has its own audience, so a parent's phone is sent her own child and
   numbers, not the squad. Written straight against orgs/, so it runs the same
   in both passes; the old-tree clubs above are what the two passes differ in. */
{
  const ORGC = {
    access: {
      admins: { oa: true },
      index: { oa: true, oc: true, oc2: true, ot: true, om: true, oself: true },
      teams: { t1: { coaches: { oc: true }, trackers: { ot: true } }, t2: { coaches: { oc2: true } } },
      teamIndex: { t1: { oc: 'coach', ot: 'tracker' }, t2: { oc2: 'coach' } },
      coachIndex: { oc: 't1', oc2: 't2' },
      teamParents: { t1: { om: 'p1' } },
      teamPlayers: { t1: { oself: 'p3' } }
    },
    org: { name: 'Hillside FC' },
    members: { oa: { name: 'Ann', email: 'ann@example.com' }, om: { name: 'Mo', email: 'mo@example.com' } },
    names: { oa: { name: 'Ann' }, oc: { name: 'Cal' } },
    log: { l1: { at: 1, act: 'linked guardian', by: 'oa', target: 'om', player: 'Ella Fitz' } },
    teams: { t1: { id: 't1', name: 'Hawks', events: { e1: { id: 'e1', date: '2026-10-10' } } }, t2: { id: 't2', name: 'Owls' } },
    squad: {
      t1: {
        p1: { id: 'p1', name: 'Ella Fitz', number: '7', note: 'shy in goal', rating: 4, guardians: { om: true } },
        p2: { id: 'p2', name: 'Rosa Lind', number: '9', avoid: { p1: true } },
        p3: { id: 'p3', name: 'Ida Moss', number: '4', self: { oself: true } }
      },
      t2: { q1: { id: 'q1', name: 'Bea Quill', number: '3' } }
    },
    roster: { t1: { p1: { number: '7', active: true }, p2: { number: '9', active: true }, p3: { number: '4', active: true } } },
    matches: { g1: { id: 'g1', teamId: 't1', opponent: 'Riverside' } }
  };
  DB.orgs = DB.orgs || {};
  DB.orgs.ORGC = ORGC;
  const O = 'orgs/ORGC/';
  const OA = { uid: 'oa' }, OC = { uid: 'oc' }, OC2 = { uid: 'oc2' }, OT = { uid: 'ot' }, OM = { uid: 'om' }, OSELF = { uid: 'oself' };
  // straight at orgs/: these paths are not the old tree's, so neither pass moves them
  const r = (label, who, p, want) => check(label, granted('read', p, who, null, ORGS ? moved(DB) : DB), want);
  const w = (label, who, p, v, want) => check(label, canWriteOn(ORGS ? moved(DB) : DB, p, v, who), want);

  console.log('\n--- a club on orgs/: who reads what ---');
  r('nobody reads the club whole, not even its admin', OA, 'orgs/ORGC', false);
  for (const part of ['teams', 'matches', 'roster', 'names', 'org', 'access', 'rsvp'])
    r('a parent reads ' + part, OM, O + part, true);
  r('a parent reads her own child\'s record', OM, O + 'squad/t1/p1', true);
  r('not another child\'s', OM, O + 'squad/t1/p2', false);
  r('nor the squad', OM, O + 'squad/t1', false);
  r('nor the members and their emails', OM, O + 'members', false);
  r('— but her own entry', OM, O + 'members/om', true);
  r('nor the access log, which names children', OM, O + 'log', false);
  r('a player reads her own record', OSELF, O + 'squad/t1/p3', true);
  r('— not a teammate\'s', OSELF, O + 'squad/t1/p1', false);
  r('the team\'s coach reads its squad', OC, O + 'squad/t1', true);
  r('a coach of another team reads it too (decided 2026-10-08)', OC2, O + 'squad/t1', true);
  r('the team\'s tracker reads its squad', OT, O + 'squad/t1', true);
  r('— not another team\'s (decided 2026-10-08)', OT, O + 'squad/t2', false);
  r('the admin reads every squad', OA, O + 'squad/t2', true);
  r('coaches read the members, emails and all', OC, O + 'members', true);
  r('a tracker does not', OT, O + 'members', false);
  r('the admin reads the access log', OA, O + 'log', true);
  r('a coach does not', OC, O + 'log', false);
  r('a stranger reads nothing: teams', RANDO, O + 'teams', false);
  r('— the roster', RANDO, O + 'roster', false);
  r('— a child', RANDO, O + 'squad/t1/p1', false);
  r('signed out, nothing', OUT, O + 'roster', false);

  console.log('\n--- a club on orgs/: the squad stays out of the club-wide parts ---');
  w('no player record under a team, even from the admin', OA, O + 'teams/t1/players/p1', { name: 'Ella' }, false);
  w('— nor one field of one', OA, O + 'teams/t1/players/p1/name', 'Ella', false);
  w('— nor a team carrying its squad', OA, O + 'teams/t1', { id: 't1', name: 'Hawks', players: { p1: { name: 'Ella' } } }, false);
  w('the team without one is fine', OC, O + 'teams/t1/name', 'Hawks B', true);
  w('the coach changes her squad', OC, O + 'squad/t1/p4', { id: 'p4', name: 'Nia', number: '11' }, true);
  w('not another team\'s coach', OC2, O + 'squad/t1/p4', { id: 'p4', name: 'Nia' }, false);
  w('nor a tracker', OT, O + 'squad/t1/p4', { id: 'p4', name: 'Nia' }, false);
  w('nor a parent, her own child included', OM, O + 'squad/t1/p1/name', 'Ellie', false);
  w('the admin does', OA, O + 'squad/t2/q2', { id: 'q2', name: 'Kit' }, true);

  /* SECURITY.md, SEC-12 (the owner, 2026-10-09): a coach's note, rating and
     who to pair or keep apart are coaches' and admins' only. They come off
     the child's record, which her family and she read, into coachNotes. */
  console.log('\n--- a club on orgs/: the coach\'s notes ---');
  ORGC.coachNotes = { t1: { p1: { note: 'shy in goal', rating: 4 }, p2: { avoid: { p1: true } } } };
  r('the team\'s coach reads them', OC, O + 'coachNotes', true);
  r('a coach of another team too, as she reads the squad', OC2, O + 'coachNotes', true);
  r('the admin reads them', OA, O + 'coachNotes', true);
  r('not the team\'s tracker', OT, O + 'coachNotes/t1', false);
  r('not a parent, her own child\'s included', OM, O + 'coachNotes/t1/p1', false);
  r('not the player herself', OSELF, O + 'coachNotes/t1/p3', false);
  r('not a stranger', RANDO, O + 'coachNotes/t1/p1', false);
  w('the coach writes a note', OC, O + 'coachNotes/t1/p1/note', 'Quick off the mark', true);
  w('— a rating', OC, O + 'coachNotes/t1/p1/rating', 5, true);
  w('— who to keep apart', OC, O + 'coachNotes/t1/p2/avoid', { p1: true }, true);
  w('— or all of them for a player at once', OC, O + 'coachNotes/t1/p3', { note: 'x', rating: 3, pairs: { p1: true } }, true);
  w('nothing else is kept there', OC, O + 'coachNotes/t1/p1', { note: 'x', name: 'Ella' }, false);
  w('a rating is a number', OC, O + 'coachNotes/t1/p1/rating', 'great', false);
  w('not another team\'s coach', OC2, O + 'coachNotes/t1/p1/note', 'x', false);
  w('nor a tracker', OT, O + 'coachNotes/t1/p1/note', 'x', false);
  w('nor a parent', OM, O + 'coachNotes/t1/p1/note', 'x', false);
  w('the admin does', OA, O + 'coachNotes/t2/q1/note', 'x', true);
  w('the child\'s record takes no note any more', OC, O + 'squad/t1/p1/note', 'x', false);
  w('— nor a rating', OC, O + 'squad/t1/p1/rating', 3, false);
  w('— nor who to pair or keep apart', OC, O + 'squad/t1/p2/avoid', { p1: true }, false);
  w('— nor a whole record carrying one', OC, O + 'squad/t1/p4', { id: 'p4', name: 'Nia', note: 'x' }, false);
  w('a note left on a record from before can be taken off it', OC, O + 'squad/t1/p1/note', null, true);
  delete ORGC.coachNotes;
  w('the roster: a number and whether she plays', OC, O + 'roster/t1/p4', { number: '11', active: true }, true);
  w('— no name while the roster is closed', OC, O + 'roster/t1/p4', { number: '11', name: 'Nia' }, false);
  w('— nor anything else', OC, O + 'roster/t1/p4', { number: '11', note: 'quick' }, false);
  ORGC.org.rosterOpen = true;
  w('— a name once the club opens it', OC, O + 'roster/t1/p4', { number: '11', name: 'Nia' }, true);
  delete ORGC.org.rosterOpen;
  w('a parent writes no roster', OM, O + 'roster/t1/p1/number', '8', false);
  w('a coach writes her own name for families', OC, O + 'names/oc', { name: 'Cal B' }, true);
  w('— nobody else\'s', OC, O + 'names/oa', { name: 'Not Ann' }, false);
  w('— and no email there', OC, O + 'names/oc', { name: 'Cal', email: 'cal@example.com' }, false);
  w('a parent puts no name there', OM, O + 'names/om', { name: 'Mo' }, false);
  w('the admin writes anyone\'s', OA, O + 'names/ot', { name: 'Tam' }, true);
  w('the log is still append-only, in her own name', OC, O + 'log/l2', { at: 2, act: 'x', by: 'oc' }, true);
  w('— never edited', OA, O + 'log/l1', { at: 1, act: 'nothing happened', by: 'oa' }, false);

  /* AUTH.md, *More kinds of people*, 1 (the owner, 2026-10-09): a player's
     fans. Anyone who can see her asks with a link (an invite of role
     `fan`); the team's coach approves, and a coach or admin making the
     link has approved already. On orgs/ only: squad/{tid}/{pid}/fans/
     {uid} on her record, and the sixth lookup table, teamFans. */
  console.log('\n--- a club on orgs/: fans, reading ---');
  const savedInv = DB.invites, savedClaims = DB.claims, savedBoard = DB.board, savedDm = DB.dm;
  ORGC.squad.t1.p1.fans = { osup: 'isup0' };
  ORGC.access.teamFans = { t1: { osup: 'p1' } };
  ORGC.access.index.osup = 'isup0';
  DB.board = { ORGC: { t1: { n1: { by: 'oc', at: 1, text: 'Kit on Saturday' } }, t2: { n2: { by: 'oc2', at: 1, text: 'Owls only' } } } };
  DB.dm = { ORGC: { t1: { om: { m: { x: { by: 'om', at: 1, text: 'Ella is ill' } } } } } };
  const OSUP = { uid: 'osup' }, GRAN = { uid: 'gran' };
  for (const part of ['teams', 'matches', 'roster', 'names', 'org', 'rsvp'])
    r('a fan reads ' + part, OSUP, O + part, true);
  r('— her player\'s record', OSUP, O + 'squad/t1/p1', true);
  r('— not a teammate\'s', OSUP, O + 'squad/t1/p2', false);
  r('— nor the squad', OSUP, O + 'squad/t1', false);
  r('— nor the coach\'s notes', OSUP, O + 'coachNotes/t1/p1', false);
  r('— nor the members and their emails', OSUP, O + 'members', false);
  r('— nor the access log', OSUP, O + 'log', false);
  r('— her team\'s notices', OSUP, 'board/ORGC/t1', true);
  r('— not another team\'s', OSUP, 'board/ORGC/t2', false);
  r('— not the family\'s conversation with the coaches', OSUP, 'dm/ORGC/t1/om', false);
  w('she ticks a notice as seen', OSUP, 'board/ORGC/t1/n1/seen/osup', NOW, true);

  console.log('\n--- a club on orgs/: fans do less than a parent ---');
  w('she says nobody is going', OSUP, O + 'rsvp/t1/g_g1/p1', { v: 'yes', by: 'osup', at: NOW }, false);
  w('she writes in no family\'s conversation', OSUP, 'dm/ORGC/t1/om/m/y', { by: 'osup', at: NOW, text: 'hi' }, false);
  w('— nor starts her own', OSUP, 'dm/ORGC/t1/osup/m/y', { by: 'osup', at: NOW, text: 'hi' }, false);
  w('she changes nothing on her player', OSUP, O + 'squad/t1/p1/name', 'Ellie', false);
  w('she follows a game, as anyone in the club', OSUP, 'follow/ORGC/g1/osup', { at: NOW }, true);
  w('she can step down herself', OSUP, O + 'squad/t1/p1/fans/osup', null, true);
  w('— but put nobody else there', OSUP, O + 'squad/t1/p1/fans/gran', 'isup0', false);

  console.log('\n--- a club on orgs/: asking for a fan ---');
  DB.invites = {};
  const sup = (by, x) => ({ ws: 'ORGC', team: 't1', role: 'fan', player: 'p1', by, at: NOW, expiresAt: NOW + 864e5, ...(x || {}) });
  w('her parent makes a fan link', OM, 'invites/s1', sup('om'), true);
  w('— not one that says it is approved', OM, 'invites/s1', sup('om', { approved: true }), false);
  w('— not for another child', OM, 'invites/s1', sup('om', { player: 'p2' }), false);
  w('— not a parent link', OM, 'invites/s1', sup('om', { role: 'parent' }), false);
  w('— not in someone else\'s name', OM, 'invites/s1', sup('oc'), false);
  w('the player makes one for herself', OSELF, 'invites/s1', sup('oself', { player: 'p3' }), true);
  w('her coach makes one, approved', OC, 'invites/s1', sup('oc', { approved: true }), true);
  w('the admin too', OA, 'invites/s1', sup('oa', { approved: true }), true);
  w('not another team\'s coach', OC2, 'invites/s1', sup('oc2', { approved: true }), false);
  w('— nor unapproved', OC2, 'invites/s1', sup('oc2'), false);
  w('not the tracker', OT, 'invites/s1', sup('ot'), false);
  w('not a fan, for another fan', OSUP, 'invites/s1', sup('osup'), false);
  w('not for a player who is not there', OC, 'invites/s1', sup('oc', { player: 'p9', approved: true }), false);
  w('a fan link must name a player', OA, 'invites/s1', { ...sup('oa'), player: null }, false);
  DB.invites = { s1: sup('om'), s2: sup('om', { player: 'p2' }) };
  w('her parent withdraws the link she made', OM, 'invites/s1', null, true);
  w('— not one somebody else made', OSELF, 'invites/s1', null, false);

  console.log('\n--- a club on orgs/: a fan her family asked for ---');
  DB.invites = { sf: sup('om', { used: { by: 'gran', at: NOW } }), sold: sup('om', { expiresAt: NOW - 1, used: { by: 'gran', at: NOW - 2 } }) };
  w('she does not let herself in', GRAN, O + 'squad/t1/p1/fans/gran', 'sf', false);
  w('— nor index herself', GRAN, O + 'access/index/gran', 'sf', false);
  const ask = x => ({ invite: 'sf', player: 'p1', name: 'Gran', email: 'gran@example.com', at: NOW, ...(x || {}) });
  w('she asks the coach, with the link she spent', GRAN, 'claims/ORGC/t1/gran', ask(), true);
  w('— not naming another child', GRAN, 'claims/ORGC/t1/gran', ask({ player: 'p2' }), false);
  w('— not on another team', GRAN, 'claims/ORGC/t2/gran', ask(), false);
  w('— not approved already', GRAN, 'claims/ORGC/t1/gran', ask({ approved: { by: 'gran', at: NOW } }), false);
  w('— not with a link somebody else spent', RANDO, 'claims/ORGC/t1/rando', ask(), false);
  w('— nor one that names no link', GRAN, 'claims/ORGC/t1/gran', ask({ invite: null }), false);
  DB.claims = { ORGC: { t1: { gran: ask() } } };
  r('the team\'s coach sees the ask', OC, 'claims/ORGC/t1', true);
  r('her parent does not', OM, 'claims/ORGC/t1', false);
  w('the coach approves it', OC, 'claims/ORGC/t1/gran/approved', { by: 'oc', at: NOW, fan: 'p1' }, true);
  w('her parent does not', OM, 'claims/ORGC/t1/gran/approved', { by: 'om', at: NOW }, false);
  w('the coach puts her on the child\'s record', OC, O + 'squad/t1/p1/fans/gran', true, true);
  w('not the tracker', OT, O + 'squad/t1/p1/fans/gran', true, false);
  w('— before approving, the coach cannot index her', OC, O + 'access/index/gran', 't1', false);
  DB.claims.ORGC.t1.gran.approved = { by: 'oc', at: NOW, fan: 'p1' };
  ORGC.squad.t1.p1.fans.gran = true;
  w('— after, she can', OC, O + 'access/index/gran', 't1', true);
  w('the coach puts her in the table', OC, O + 'access/teamFans/t1/gran', 'p1', true);
  w('— naming the child she is a fan of, no other', OC, O + 'access/teamFans/t1/gran', 'p2', false);
  delete ORGC.squad.t1.p1.fans.gran;

  console.log('\n--- a club on orgs/: a fan the coach asked for ---');
  DB.invites = { sc: sup('oc', { approved: true, used: { by: 'gran', at: NOW } }), sold: sup('oc', { approved: true, expiresAt: NOW - 1, used: { by: 'gran', at: NOW - 2 } }),
    sx: sup('oc', { approved: true, player: 'p2', used: { by: 'gran', at: NOW } }) };
  w('she lets herself in with it', GRAN, O + 'squad/t1/p1/fans/gran', 'sc', true);
  w('— not on another child', GRAN, O + 'squad/t1/p2/fans/gran', 'sc', false);
  w('— not once it has expired', GRAN, O + 'squad/t1/p1/fans/gran', 'sold', false);
  w('— not with somebody else\'s', RANDO, O + 'squad/t1/p1/fans/rando', 'sc', false);
  w('— not as a parent', GRAN, O + 'squad/t1/p1/guardians/gran', 'sc', false);
  w('— not as the player', GRAN, O + 'squad/t1/p1/self/gran', 'sc', false);
  w('she indexes herself only once she is on the record', GRAN, O + 'access/index/gran', 'sc', false);
  ORGC.squad.t1.p1.fans.gran = 'sc';
  w('— then she can', GRAN, O + 'access/index/gran', 'sc', true);
  w('— and put herself in the table', GRAN, O + 'access/teamFans/t1/gran', 'p1', true);
  w('— not as another child\'s', GRAN, O + 'access/teamFans/t1/gran', 'p2', false);
  w('— nor as a parent', GRAN, O + 'access/teamParents/t1/gran', 'p1', false);
  w('— nor anyone else in it', GRAN, O + 'access/teamFans/t1/osup', 'p1', false);
  w('a parent cannot put herself in it', OM, O + 'access/teamFans/t1/om', 'p1', false);
  w('the tracker cannot put anyone in it', OT, O + 'access/teamFans/t1/gran', 'p1', false);
  delete ORGC.squad.t1.p1.fans.gran;
  // the old tree has no fans (AUTH.md: orgs/ only), so a link to a club still there lets nobody in
  DB.invites.sw = { ...sup('adm', { approved: true, used: { by: 'gran', at: NOW } }), ws: 'CLUB' };
  w('a fan link never indexes anyone on the old tree', GRAN, 'workspaces/CLUB/access/index/gran', 'sw', false);
  w('— nor puts anyone on a record there', GRAN, 'workspaces/CLUB/teams/t1/players/p1/fans/gran', 'sw', false);

  delete ORGC.squad.t1.p1.fans; delete ORGC.access.teamFans; delete ORGC.access.index.osup;
  DB.invites = savedInv; DB.claims = savedClaims; DB.board = savedBoard; DB.dm = savedDm;
  if (savedInv === undefined) delete DB.invites;
  if (savedClaims === undefined) delete DB.claims;
  if (savedBoard === undefined) delete DB.board;
  if (savedDm === undefined) delete DB.dm;

  /* A fan's name on her player's record, and her family taking her off it
     (the owner, 2026-10-09): the family sees who follows their child, and
     decides; a fan can leave on her own. */
  console.log('\n--- a club on orgs/: fans, named and taken away ---');
  {
    const saved = { inv: DB.invites };
    ORGC.squad.t1.p1.fans = { ofan: true }; ORGC.squad.t1.p1.fanNames = { ofan: 'Gran Fitz' };
    ORGC.access.teamFans = { t1: { ofan: 'p1' } }; ORGC.access.index.ofan = 't1';
    const OFAN = { uid: 'ofan' };
    r('her family reads who follows their child, by name', OM, O + 'squad/t1/p1/fanNames', true);
    w('a fan writes her own name there', OFAN, O + 'squad/t1/p1/fanNames/ofan', 'Granny', true);
    w('— nobody else\'s', OFAN, O + 'squad/t1/p1/fanNames/om', 'Mo', false);
    w('— and none on a child she is not a fan of', OFAN, O + 'squad/t1/p2/fanNames/ofan', 'Gran', false);
    w('— a name, not a story', OFAN, O + 'squad/t1/p1/fanNames/ofan', 'x'.repeat(81), false);
    w('her family takes a fan off their child', OM, O + 'squad/t1/p1/fans/ofan', null, true);
    w('— and her name', OM, O + 'squad/t1/p1/fanNames/ofan', null, true);
    w('— but puts nobody on', OM, O + 'squad/t1/p1/fans/rando', true, false);
    w('the player herself takes one off too', OSELF, O + 'squad/t1/p3/fans/x', null, true);
    w('another family does not', OSELF, O + 'squad/t1/p1/fans/ofan', null, false);
    w('nor a tracker', OT, O + 'squad/t1/p1/fans/ofan', null, false);
    w('while the record still names her, nobody else clears her from the table', OM, O + 'access/teamFans/t1/ofan', null, false);
    delete ORGC.squad.t1.p1.fans.ofan;
    w('once it does not, anyone in the club clears the stale entry', OM, O + 'access/teamFans/t1/ofan', null, true);
    w('— never someone outside it', RANDO, O + 'access/teamFans/t1/ofan', null, false);
    ORGC.squad.t1.p1.fans.ofan = true;
    w('a fan leaves: off the record', OFAN, O + 'squad/t1/p1/fans/ofan', null, true);
    w('— her name', OFAN, O + 'squad/t1/p1/fanNames/ofan', null, true);
    w('— the table', OFAN, O + 'access/teamFans/t1/ofan', null, true);
    w('— and the club', OFAN, O + 'access/index/ofan', null, true);
    delete ORGC.squad.t1.p1.fans; delete ORGC.squad.t1.p1.fanNames; delete ORGC.access.teamFans; delete ORGC.access.index.ofan;
    DB.invites = saved.inv; if (saved.inv === undefined) delete DB.invites;
  }

  /* Links with limits (the owner, 2026-10-09): how many people may use one,
     and until when. A rule cannot count, so a link for several carries one
     seat per person, each taken once; a page anyone may open carries an end
     date the read rule checks against the clock. */
  console.log('\n--- a link for several people: one seat each ---');
  {
    const savedInv = DB.invites, savedJc = DB.joinCodes, savedCl = DB.claims, savedPub = DB.public;
    const many = { ws: 'ORGC', team: 't1', role: 'parent', player: 'p2', by: 'oa', at: NOW, expiresAt: NOW + 864e5, max: 2, seats: { s1: true, s2: true } };
    DB.invites = { im: JSON.parse(JSON.stringify(many)), ip: { ...JSON.parse(JSON.stringify(many)), expiresAt: NOW - 1 } };
    const A1 = { uid: 'mo2' }, A2 = { uid: 'da2' }, A3 = { uid: 'xx3' };
    w('an admin makes one for two people', OA, 'invites/inew', { ...many }, true);
    w('— not with someone already on a seat', OA, 'invites/inew', { ...many, seat: { s1: { by: 'mo2', at: NOW } }, took: { mo2: 's1' } }, false);
    w('— not for more than fifty', OA, 'invites/inew', { ...many, max: 51 }, false);
    w('the first takes a seat', A1, 'invites/im/seat/s1', { by: 'mo2', at: NOW }, true);
    w('— not in someone else\'s name', A1, 'invites/im/seat/s1', { by: 'da2', at: NOW }, false);
    w('— not a seat the link does not have', A1, 'invites/im/seat/s9', { by: 'mo2', at: NOW }, false);
    w('— not once it has expired', A1, 'invites/ip/seat/s1', { by: 'mo2', at: NOW }, false);
    w('nor the single-use way, on a link with seats', A1, 'invites/im/used', { by: 'mo2', at: NOW }, false);
    DB.invites.im.seat = { s1: { by: 'mo2', at: NOW } };
    w('then says it is hers', A1, 'invites/im/took/mo2', 's1', true);
    w('— not a seat somebody else holds', A2, 'invites/im/took/da2', 's1', false);
    w('a taken seat is not taken again', A2, 'invites/im/seat/s1', { by: 'da2', at: NOW }, false);
    w('the second takes the other', A2, 'invites/im/seat/s2', { by: 'da2', at: NOW }, true);
    DB.invites.im.took = { mo2: 's1' };
    w('nobody holds two', A1, 'invites/im/seat/s2', { by: 'mo2', at: NOW }, false);
    w('a seat lets her in, as a spent invite does', A1, O + 'squad/t1/p2/guardians/mo2', 'im', true);
    w('— and into the index', A1, O + 'access/index/mo2', 'im', true);
    const savedCi = DB.clubInvites;
    DB.clubInvites = { ...(DB.clubInvites || {}), ORGC: { im: { role: 'parent', team: 't1' } } };
    w('— and ticks herself off on the admins\' list', A1, 'clubInvites/ORGC/im/took/mo2', { at: NOW }, true);
    w('— not someone else', A1, 'clubInvites/ORGC/im/took/da2', { at: NOW }, false);
    DB.clubInvites = savedCi; if (savedCi === undefined) delete DB.clubInvites;
    DB.invites.im.seat.s2 = { by: 'da2', at: NOW };
    w('full: a third has no seat to take', A3, 'invites/im/seat/s3', { by: 'xx3', at: NOW }, false);
    w('— and is not let in', A3, O + 'squad/t1/p2/guardians/xx3', 'im', false);
    w('nor is someone who took a seat but never said so', A2, O + 'squad/t1/p2/guardians/da2', 'im', false);
    w('a seat holder does not delete the link for everyone', A1, 'invites/im', null, false);
    w('its maker does', OA, 'invites/im', null, true);

    console.log('\n--- a team link: until when, and for how many ---');
    DB.joinCodes = {
      jt: { ws: 'ORGC', team: 't1', by: 'oc', at: NOW, expiresAt: NOW + 864e5, max: 1, seats: { s1: true } },
      jo: { ws: 'ORGC', team: 't1', by: 'oc', at: NOW, expiresAt: NOW - 1 },
      jf: { ws: 'ORGC', team: 't1', by: 'oc', at: NOW }
    };
    const ask = code => ({ code, shirt: '9', at: NOW });
    w('the coach makes one with an end date and seats', OC, 'joinCodes/jn', { ws: 'ORGC', team: 't1', by: 'oc', at: NOW, expiresAt: NOW + 864e5, max: 2, seats: { s1: true, s2: true } }, true);
    w('a link with no limits still works as it did', A3, 'claims/ORGC/t1/xx3', ask('jf'), true);
    w('an expired link takes no asks', A3, 'claims/ORGC/t1/xx3', ask('jo'), false);
    w('— nor seats', A3, 'joinCodes/jo/seat/s1', { by: 'xx3', at: NOW }, false);
    w('a link with seats: no ask without one', A3, 'claims/ORGC/t1/xx3', ask('jt'), false);
    w('— she takes one', A3, 'joinCodes/jt/seat/s1', { by: 'xx3', at: NOW }, true);
    DB.joinCodes.jt.seat = { s1: { by: 'xx3', at: NOW } };
    w('— says it is hers', A3, 'joinCodes/jt/took/xx3', 's1', true);
    DB.joinCodes.jt.took = { xx3: 's1' };
    w('— then asks', A3, 'claims/ORGC/t1/xx3', ask('jt'), true);
    w('the next has no seat left', A2, 'joinCodes/jt/seat/s2', { by: 'da2', at: NOW }, false);
    w('— and no ask', A2, 'claims/ORGC/t1/da2', ask('jt'), false);

    console.log('\n--- a share page or feed: until when ---');
    DB.public = { pg: { team: { name: 'Hawks' }, until: NOW + 864e5 }, px: { team: { name: 'Hawks' }, until: NOW - 1 }, pn: { team: { name: 'Hawks' } } };
    r('a page before its end date opens, signed out too', OUT, 'public/pg', true);
    r('a page past it does not', OUT, 'public/px', false);
    r('— not even for its coach', OC, 'public/px', false);
    r('a page with no end date opens as it did', OUT, 'public/pn', true);
    // the end date is set on the team or game, and the server puts it on the page (SEC-10: no phone writes public/)
    w('not even its coach writes it onto the page', OC, 'public/px/until', NOW + 864e5, false);
    w('My calendar\'s feed takes an end date', OM, 'people/om/set', { share: false, feed: 'abcdefgh', feedUntil: NOW + 864e5 }, true);
    w('— a time, nothing else', OM, 'people/om/set', { share: false, feedUntil: 'never' }, false);
    DB.invites = savedInv; DB.joinCodes = savedJc; DB.claims = savedCl; DB.public = savedPub;
    for (const k of ['invites', 'joinCodes', 'claims']) if (DB[k] === undefined) delete DB[k];
  }

  /* AUTH.md, *More kinds of people*, 3 (the owner, 2026-10-09). A club-wide
     viewer (a director) is in the index like everyone else in the club, so
     she reads what the index reads; beyond it, every team's squad, for the
     names. No write rule names her, so she changes nothing. */
  console.log('\n--- a club on orgs/: club-wide viewers ---');
  ORGC.access.viewers = { ov: 'inv-v' };
  ORGC.access.index.ov = 'inv-v';
  ORGC.coachNotes = { t1: { p1: { note: 'shy in goal' } } };
  const OV = { uid: 'ov' };
  for (const part of ['teams', 'matches', 'org', 'names', 'access', 'roster'])
    r('a viewer reads ' + part, OV, O + part, true);
  r('— every team\'s squad, so every child by name', OV, O + 'squad/t1', true);
  r('— another team\'s too', OV, O + 'squad/t2', true);
  r('not the members and their emails', OV, O + 'members', false);
  r('— but her own entry', OV, O + 'members/ov', true);
  r('not the access log', OV, O + 'log', false);
  r('not the coach\'s notes', OV, O + 'coachNotes/t1/p1', false);
  r('not a family\'s conversation', OV, 'dm/ORGC/t1/om', false);
  r('not the team\'s notices', OV, 'board/ORGC/t1', false);
  r('— practice plans', OV, 'training/ORGC/practices/t1', false);
  r('— the club\'s drills', OV, 'training/ORGC/drills', false);
  w('she answers for nobody', OV, O + 'rsvp/t1/g_g1/p1', { v: 'no', by: 'ov', at: NOW }, false);
  w('she changes no game', OV, O + 'matches/g1/opponent', 'Elsewhere', false);
  w('— adds no goal', OV, O + 'matches/g1/goals/x', { t: 1 }, false);
  w('— writes no share page: only the server does (SECURITY.md, SEC-D11)', OV, 'public/sh1/games/g1/status', 'done', false);
  w('— changes no team', OV, O + 'teams/t1/name', 'Viewers FC', false);
  w('— nor a squad', OV, O + 'squad/t1/p1/name', 'Ellie', false);
  w('— nor the coach\'s notes', OV, O + 'coachNotes/t1/p1/note', 'x', false);
  w('— posts no notice', OV, 'board/ORGC/t1/n1', { by: 'ov', at: NOW, text: 'hi' }, false);
  w('— writes in no family\'s conversation', OV, 'dm/ORGC/t1/om/m/x', { by: 'ov', at: NOW, text: 'hi' }, false);
  w('— and makes herself nothing more', OV, O + 'access/admins/ov', true, false);
  w('— nor a coach', OV, O + 'access/teams/t1/coaches/ov', true, false);
  w('the admin makes someone a viewer', OA, O + 'access/viewers/nv', true, true);
  w('— and indexes her', OA, O + 'access/index/nv', true, true);
  w('— and takes it away', OA, O + 'access/viewers/ov', null, true);
  w('a coach does not', OC, O + 'access/viewers/nv', true, false);
  w('nor a parent', OM, O + 'access/viewers/om', true, false);
  w('a stranger cannot make herself one', RANDO, O + 'access/viewers/rando', true, false);
  w('she steps down herself', OV, O + 'access/viewers/ov', null, true);
  DB.invites = { 'inv-nv': { ws: 'ORGC', role: 'viewer', by: 'oa', expiresAt: NOW + 1e6, used: { by: 'nv', at: NOW } } };
  w('an invite to be a viewer, spent by her, makes her one', { uid: 'nv' }, O + 'access/viewers/nv', 'inv-nv', true);
  w('— and indexes her', { uid: 'nv' }, O + 'access/index/nv', 'inv-nv', true);
  w('— not anyone else', RANDO, O + 'access/viewers/rando', 'inv-nv', false);
  DB.invites['inv-nv'].role = 'coach';
  w('— nor an invite to something else', { uid: 'nv' }, O + 'access/viewers/nv', 'inv-nv', false);
  delete DB.invites;
  w('only an admin makes a viewer\'s invite, with no team', OA, 'invites/inv8', { ws: 'ORGC', by: 'oa', role: 'viewer', at: NOW, expiresAt: NOW + 1e9 }, true);
  w('— not a coach', OC, 'invites/inv8', { ws: 'ORGC', by: 'oc', role: 'viewer', at: NOW, expiresAt: NOW + 1e9 }, false);
  w('every other role still names its team', OA, 'invites/inv8', { ws: 'ORGC', by: 'oa', role: 'coach', at: NOW, expiresAt: NOW + 1e9 }, false);
  delete ORGC.access.viewers; delete ORGC.access.index.ov; delete ORGC.coachNotes;

  console.log('\n--- a club on orgs/: one tree each ---');
  /* A club is on exactly one tree, which is what lets every root rule ask
     "orgs/{code}/access exists" to know which tree to read. So nobody may
     start orgs/{code} under a code the old tree still holds (it would turn
     every training, message and invite rule for that club over to her), nor
     start the old tree again under a code that has moved. */
  DB.workspaces.OLDC = { access: { admins: { oldadm: true }, index: { oldadm: true } }, teams: { t1: { id: 't1', name: 'Old' } } };
  DB.workspaces.GONE = { moved: { to: 'orgs', at: 1, by: 'ga' } };
  const keepOld = ORGS ? (() => { const v = moved(DB); v.workspaces.OLDC = DB.workspaces.OLDC; delete v.orgs.OLDC; return v; })() : DB;
  const wk = (label, who, p, v, want) => check(label, canWriteOn(keepOld, p, v, who), want);
  wk('nobody starts orgs/ under a code the old tree holds', RANDO, 'orgs/OLDC/access/admins/rando', true, false);
  wk('— nor its index', RANDO, 'orgs/OLDC/access/index/rando', true, false);
  wk('nobody starts the old tree again under a moved code', RANDO, 'workspaces/GONE/access/admins/rando', true, false);
  wk('— nor its index', RANDO, 'workspaces/GONE/access/index/rando', true, false);
  wk('nor under a code orgs/ holds', RANDO, 'workspaces/ORGC/access/admins/rando', true, false);
  wk('nobody writes the moved marker but the server', OA, 'workspaces/GONE/moved', null, false);
  /* Not even her own entry: the old tree's one write a stranger could make.
     A phone that has not heard of the move writes it on signing in, and it
     would put access back under the old tree, which is how every phone tells
     a club still there from one that has moved. */
  wk('nobody writes her own name on the old tree of a moved club', RANDO, 'workspaces/GONE/access/members/rando', { name: 'R' }, false);
  wk('— nor of a club on orgs/', OM, 'workspaces/ORGC/access/members/om', { name: 'Mo' }, false);
  wk('a brand-new code starts on orgs/', RANDO, 'orgs/BRANDNEW/access/admins/rando', true, true);
  delete DB.workspaces.OLDC; delete DB.workspaces.GONE;

  console.log('\n--- asking for a club to be moved ---');
  /* moveRequests/{code}: an admin of the club asks, as herself; the server
     (functions/move.js) checks her again before it moves anything. */
  writes('its admin asks', ADM, 'moveRequests/CLUB', { by: 'adm', at: NOW }, true);
  writes('not in someone else\'s name', ADM, 'moveRequests/CLUB', { by: 'coach', at: NOW }, false);
  writes('a coach does not', COACH, 'moveRequests/CLUB', { by: 'coach', at: NOW }, false);
  writes('nor a parent', MUM, 'moveRequests/CLUB', { by: 'mum', at: NOW }, false);
  writes('nor a stranger', RANDO, 'moveRequests/CLUB', { by: 'rando', at: NOW }, false);
  writes('nor an answer written by a phone', ADM, 'moveRequests/CLUB', { by: 'adm', at: NOW, result: { ok: true } }, false);
  // why the app looks before it clears: deleting a request that is not there is a write the rule refuses
  writes('clearing one that is not there is refused', ADM, 'moveRequests/CLUB', null, false);
  DB.moveRequests = { CLUB: { by: 'adm', at: 1, result: { ok: false, why: 'A game is being played.' } } };
  reads('she reads the answer', ADM, 'moveRequests/CLUB', true);
  reads('a coach does not', COACH, 'moveRequests/CLUB', false);
  writes('she clears it to ask again', ADM, 'moveRequests/CLUB', null, true);
  writes('a coach cannot', COACH, 'moveRequests/CLUB', null, false);
  writes('nor ask over the top of one', ADM, 'moveRequests/CLUB', { by: 'adm', at: 2 }, false);
  delete DB.moveRequests;

  console.log('\n--- a club on orgs/: the root rules follow it there ---');
  w('its coach plans a practice', OC, 'training/ORGC/practices/t1/pr9', { id: 'pr9', teamId: 't1', date: '2026-10-12' }, true);
  w('a parent does not', OM, 'training/ORGC/practices/t1/pr9', { id: 'pr9', teamId: 't1' }, false);
  r('a parent reads her family\'s conversation', OM, 'dm/ORGC/t1/om', true);
  r('— not another family\'s', OM, 'dm/ORGC/t1/someone', false);
  r('the team\'s coach reads it', OC, 'dm/ORGC/t1/om', true);
  w('her answer, at orgs/', OM, O + 'rsvp/t1/g_g1/p1', { v: 'yes', by: 'om', at: NOW }, true);
  w('— not for another child', OM, O + 'rsvp/t1/g_g1/p2', { v: 'yes', by: 'om', at: NOW }, false);
  /* AUTH.md, *More kinds of people*, 2: a team helper (a manager, a volunteer)
     helps the coach prepare and does nothing on the day. Three rules asked
     only whether a uid is in teamIndex for a team, and would have let her in
     exactly as they let a tracker in; each is decided again here. */
  console.log('\n--- a club on orgs/: a team helper ---');
  {
    const A = ORGC.access, OH = { uid: 'oh' };
    A.index.oh = true; A.teams.t1.helpers = { oh: 'inv-h' }; A.teamIndex.t1.oh = 'helper'; A.helperIndex = { oh: 't1' };
    ORGC.coachNotes = { t1: { p1: { note: 'shy in goal' } } };
    const ev = { id: 'e2', kind: 'practice', date: '2026-10-14', start: '18:00', edit: { by: 'oh', at: NOW } };
    r('she reads her team\'s squad, names and all', OH, O + 'squad/t1', true);
    r('— not another team\'s', OH, O + 'squad/t2', false);
    r('not the coach\'s notes', OH, O + 'coachNotes', false);
    r('— nor one child\'s', OH, O + 'coachNotes/t1/p1', false);
    r('not the members and their emails', OH, O + 'members', false);
    r('not the access log', OH, O + 'log', false);
    w('she does not change the squad', OH, O + 'squad/t1/p4', { id: 'p4', name: 'Nia' }, false);
    w('— nor the roster', OH, O + 'roster/t1/p1/number', '8', false);
    w('— nor the team itself', OH, O + 'teams/t1/name', 'Hawks B', false);
    // nor a share page: only the server writes public/ (SECURITY.md, SEC-D11)
    w('— nor a share page', OH, 'public/sh1/games/g1/status', 'done', false);
    w('— nor one under an id nobody has', OH, 'public/helperpage', { team: { name: 'Hawks' } }, false);
    w('she adds a practice to her team\'s calendar', OH, O + 'teams/t1/events/e2', ev, true);
    w('— calls one off', OH, O + 'teams/t1/events/e1/called', 'cancelled', true);
    w('— stamped in nobody\'s name but hers', OH, O + 'teams/t1/events/e2', { ...ev, edit: { by: 'oc', at: NOW } }, false);
    w('— not the whole calendar at once', OH, O + 'teams/t1/events', { e2: ev }, false);
    w('— not another team\'s', OH, O + 'teams/t2/events/e2', ev, false);
    w('she takes the register', OH, O + 'teams/t1/attend/e1', { p1: true }, true);
    w('— not another team\'s', OH, O + 'teams/t2/attend/e1', { q1: true }, false);
    w('she adds a game', OH, O + 'matches/g7', { id: 'g7', teamId: 't1', opponent: 'Rovers', date: '2026-10-18' }, true);
    w('— not for another team', OH, O + 'matches/g7', { id: 'g7', teamId: 't2', opponent: 'Rovers' }, false);
    w('she plans a game before kick-off', OH, O + 'matches/g1/plan', { blocks: { b1: { at: 0 } } }, true);
    w('— moves it', OH, O + 'matches/g1/date', '2026-10-19', true);
    w('— calls it off', OH, O + 'matches/g1/called', 'cancelled', true);
    w('— marks a player out of it', OH, O + 'matches/g1/out/p1', true, true);
    w('— or deletes it, while it is not played', OH, O + 'matches/g1', null, true);
    w('she does not start the clock', OH, O + 'matches/g1/periods/0', { start: NOW }, false);
    ORGC.matches.g1.periods = { 0: { start: NOW - 60000 } };
    w('once it kicks off, not the plan', OH, O + 'matches/g1/plan', { blocks: {} }, false);
    w('— nor a goal', OH, O + 'matches/g1/goals/x', { at: NOW }, false);
    w('— nor deleting it', OH, O + 'matches/g1', null, false);
    w('the tracker still logs it', OT, O + 'matches/g1/goals/x', { at: NOW }, true);
    delete ORGC.matches.g1.periods;
    ORGC.matches.g1.ended = true;
    w('nor once it is over', OH, O + 'matches/g1/plan', { blocks: {} }, false);
    delete ORGC.matches.g1.ended;
    w('a tracker still cannot move a game', OT, O + 'matches/g1/date', '2026-10-19', false);
    r('she reads her team\'s notices', OH, 'board/ORGC/t1', true);
    w('— and posts one in her own name', OH, 'board/ORGC/t1/n1', { by: 'oh', at: NOW, text: 'Bring water' }, true);
    w('— not in the coach\'s', OH, 'board/ORGC/t1/n1', { by: 'oc', at: NOW, text: 'Bring water' }, false);
    w('— not to another team', OH, 'board/ORGC/t2/n1', { by: 'oh', at: NOW, text: 'Bring water' }, false);
    w('a tracker still posts none', OT, 'board/ORGC/t1/n1', { by: 'ot', at: NOW, text: 'x' }, false);
    r('she reads no family\'s conversation', OH, 'dm/ORGC/t1', false);
    r('— not one family\'s', OH, 'dm/ORGC/t1/om', false);
    w('— nor writes in one', OH, 'dm/ORGC/t1/om/m/x', { by: 'oh', at: NOW, text: 'hi' }, false);
    r('she reads her team\'s practice plans', OH, 'training/ORGC/practices/t1', true);
    w('— and plans one', OH, 'training/ORGC/practices/t1/pr9', { id: 'pr9', teamId: 't1', date: '2026-10-12' }, true);
    r('— not another team\'s', OH, 'training/ORGC/practices/t2', false);
    w('— nor plans one for it', OH, 'training/ORGC/practices/t2/pr9', { id: 'pr9', teamId: 't2' }, false);
    r('she reads the club\'s drills', OH, 'training/ORGC/drills', true);
    r('— and its templates', OH, 'training/ORGC/templates', true);
    w('— shares a drill, in her own name for her team', OH, 'training/ORGC/drills/dh', { id: 'dh', name: 'Rondo', by: 'oh', team: 't1', at: NOW }, true);
    w('— not for another team', OH, 'training/ORGC/drills/dh', { id: 'dh', name: 'Rondo', by: 'oh', team: 't2', at: NOW }, false);
    w('— and a template', OH, 'training/ORGC/templates/th', { id: 'th', name: 'Tuesday', by: 'oh', team: 't1', at: NOW }, true);
    r('a tracker reads no drills', OT, 'training/ORGC/drills', false);
    w('her own drills shelf is hers, as anyone\'s is', OH, 'userLibrary/oh/drills/d1', { id: 'd1', name: 'Mine', at: NOW }, true);
    w('she writes her own name for families', OH, O + 'names/oh', { name: 'Hal' }, true);
    r('she is not a coach anywhere a coach is asked for: coaches\' time off', OH, 'training/ORGC/away', false);
    w('— nor offers bookable times', OH, 'training/ORGC/avail/b1', { id: 'b1', coach: 'oh', date: '2026-10-20', start: '17:00', end: '18:00', kind: 'one', cap: 1 }, false);
    r('— nor talks to colleagues as staff', OH, 'staffdm/ORGC/oc~oh', false);
    // how she gets the role: an admin's invite, accepted the way a coach's is
    DB.invites = { 'inv-h2': { ws: 'ORGC', team: 't1', role: 'helper', by: 'oa', expiresAt: NOW + 1e9, used: { by: 'nh', at: NOW } } };
    const NH = { uid: 'nh' };
    w('an admin makes a helper\'s invite', OA, 'invites/inv-h3', { ws: 'ORGC', team: 't1', role: 'helper', by: 'oa', at: NOW, expiresAt: NOW + 1e9 }, true);
    w('a coach does not', OC, 'invites/inv-h3', { ws: 'ORGC', team: 't1', role: 'helper', by: 'oc', at: NOW, expiresAt: NOW + 1e9 }, false);
    w('the invitee takes the role it names', NH, O + 'access/teams/t1/helpers/nh', 'inv-h2', true);
    w('— not a coach\'s with it', NH, O + 'access/teams/t1/coaches/nh', 'inv-h2', false);
    w('— not on another team', NH, O + 'access/teams/t2/helpers/nh', 'inv-h2', false);
    w('her own teamIndex entry says helper', OH, O + 'access/teamIndex/t1/oh', 'helper', true);
    w('— never coach', OH, O + 'access/teamIndex/t1/oh', 'coach', false);
    w('— nor tracker', OH, O + 'access/teamIndex/t1/oh', 'tracker', false);
    w('a coach cannot call herself a helper there', OC, O + 'access/teamIndex/t1/oc', 'helper', false);
    w('her helperIndex entry names a team she helps', OH, O + 'access/helperIndex/oh', 't1', true);
    w('— not one she does not', OH, O + 'access/helperIndex/oh', 't2', false);
    w('— nobody writes hers for her but an admin', OC, O + 'access/helperIndex/oh', 't1', false);
    w('she takes herself off it', OH, O + 'access/helperIndex/oh', null, true);
    w('nobody makes herself one of the coaches\' index', OH, O + 'access/coachIndex/oh', 't1', false);
    delete DB.invites; delete ORGC.coachNotes;
    delete A.index.oh; delete A.teams.t1.helpers; delete A.teamIndex.t1.oh; delete A.helperIndex;
  }

  w('an admin of the club makes an invite to it', OA, 'invites/inv9', { ws: 'ORGC', by: 'oa', role: 'coach', team: 't1', at: NOW, expiresAt: NOW + 1e9 }, true);
  w('a coach of another club does not', ADM, 'invites/inv9', { ws: 'ORGC', by: 'adm', role: 'coach', team: 't1', at: NOW, expiresAt: NOW + 1e9 }, false);
  delete DB.orgs.ORGC;
}

/* ---------------- which version is published ---------------- */

/* rulesVersion accepts one number, the version these rules are, from anyone:
   the app's admin banner and `node tools/live-rules.js` both find out what is
   published by trying to write it, and the second runs with no account. The
   only write that can succeed stores the number already there in any club
   running these rules, so there is nothing to protect by asking for one. */
console.log('\n--- which version of the rules is published ---');
const VERSION = (() => {
  const m = /^newData\.isNumber\(\) && newData\.val\(\) === (\d+)$/.exec(((RULES.rulesVersion || {})['.write']) || '');
  return m ? Number(m[1]) : null;
})();
check('rulesVersion names its version as a whole number', VERSION !== null, true);
reads('anyone reads it, signed out too', OUT, 'rulesVersion', true);
writes('signed out, writing this version', OUT, 'rulesVersion', VERSION, true);
writes('admin, writing this version', ADM, 'rulesVersion', VERSION, true);
writes('the version before', OUT, 'rulesVersion', VERSION - 1, false);
writes('the version after', ADM, 'rulesVersion', VERSION + 1, false);
writes('this version, as text', OUT, 'rulesVersion', String(VERSION), false);
writes('deleting it', ADM, 'rulesVersion', null, false);

/* The number only means something if it goes up every time the rules change,
   so the last version's fingerprint is kept, and a change without a bump
   fails here — locally and in CI — rather than on a club. The app has to ask
   for the same number, or every admin is told her rules are out of date. */
{
  const crypto = require('crypto');
  const STAMP = path.join(__dirname, 'rules-stamp.json');
  const raw = fs.readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8');
  // the number itself is left out, so bumping it is not a change to stamp
  const print = crypto.createHash('sha256').update(raw.replace(/newData\.val\(\) === \d+"/, 'newData.val() === N"')).digest('hex').slice(0, 16);
  const app = /const RULES_VERSION = (\d+);/.exec(fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8'));
  check('app.js asks for the version the rules are', !!app && Number(app[1]) === VERSION, true);
  let stamp = {};
  try { stamp = JSON.parse(fs.readFileSync(STAMP, 'utf8')); } catch (e) { }
  const same = stamp.version === VERSION && stamp.print === print;
  if (process.argv.includes('--stamp') && !same) {
    if (stamp.print !== print && !(VERSION > (stamp.version || 0))) {
      check(`the rules changed: raise rulesVersion past ${stamp.version} before stamping`, false, true);
    } else {
      fs.writeFileSync(STAMP, JSON.stringify({ version: VERSION, print }, null, 2) + '\n');
      console.log(`  stamped version ${VERSION} (${print})`);
    }
  } else if (!same) {
    console.log(stamp.print !== print && VERSION === stamp.version
      ? `  database.rules.json changed but is still version ${VERSION}. Raise it in rulesVersion's .write and RULES_VERSION in app.js, then run node test/rules.js --stamp`
      : `  version ${VERSION} is not stamped yet: run node test/rules.js --stamp`);
    check('the rules are stamped with their version', false, true);
  } else check('the rules are stamped with their version', true, true);
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
  - The public write hole. Nobody writes public/{share} but the server
    (SECURITY.md, SEC-10): \`.write: false\` for every account, admins
    included, so a page cannot be made under an id no club has, and
    shareOwners is gone. Anonymous auth was never an option and AUTH.md says
    why.

  Still open, deliberately:

  1. A tracker can write more of a match than the interface offers her. The
     rules can say "may touch this team's games" but not "may add a goal and
     nothing else" without a rule per field. AUTH.md's table already scopes a
     tracker to the Track tab as an interface promise; this is the limit of
     what the database can hold her to. When and whether a game is played
     (date, kick-off, called off, place, opponent) is held: since version 8
     those are the team's coaches' and the admins'.

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

  5. The parent list is only as fresh as the last thing that synced it. Its
     entries can only ever name a real guardian at the moment they are
     written. Where the functions are deployed, the server takes an unlinked
     parent off the moment it happens (functions/access.js, test/access.js);
     without them, a parent unlinked by an older copy of the app keeps reading
     that team's notices until an admin's or the coach's next connect takes
     her off. While the list does not exist at all, notices fall back to
     club-wide, as they were, and the server does not start it.

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

  9. A booked slot is not counted by the rules at all: a family cannot write
     one. Her phone asks the server (bookAsks), which checks her child, the
     coach's calendar as it stands, and the places inside a transaction
     (functions/book.js, test/book.js). Where the functions are not
     deployed, nobody answers, and a family cannot book a time.

 10. Somebody's shared busy times are readable by anyone signed in who knows
     her uid. A uid is only shown inside a club she is in, and the times
     carry nothing but a date and two times; private is the default, and the
     rules refuse any busy time while she has not said to share.`);

console.log(`\n${failures ? failures + ' EXPECTATION(S) FAILED' : 'all expectations hold'}`);
process.exit(failures ? 1 : 0);
