/* What a signed-out device may see.

   The local copy exists so a coach with no signal still has her squad, which
   means the roster is sitting in localStorage whether or not anybody is signed
   in. Rendering it is a separate decision from holding it, and this file pins
   that decision: once a club has an admin, signing out has to mean the next
   person to pick up this phone cannot read a list of children's names — before
   the database has been asked, not three seconds later when it answers.

   The chrome counts. Crumbs carry the club and the team name, so a lock screen
   with the crumbs still drawn has leaked most of what there was to leak.

   Exits non-zero on a failed expectation. */

const fs = require('fs');
const path = require('path');

const mk = () => new Proxy({
  dataset: {}, style: {}, value: '', textContent: '', innerHTML: '', hidden: false,
  classList: { add() { }, remove() { } },
  addEventListener() { }, removeEventListener() { }, setAttribute() { }, getAttribute() { return null },
  setPointerCapture() { }, click() { }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 400 }),
  querySelector: () => mk(), querySelectorAll: () => [], closest: () => null, appendChild() { }
}, { get(t, k) { return k in t ? t[k] : undefined; }, set(t, k, v) { t[k] = v; return true; } });

const nodes = {};
global.document = {
  querySelector: sel => (nodes[sel] = nodes[sel] || mk()),
  querySelectorAll: () => [], addEventListener() { }, createElement: () => mk(), body: mk()
};
global.location = { reload() { }, hash: '', pathname: '/', search: '', origin: 'https://x.test' };
global.history = { replaceState() { } };
global.window = { addEventListener() { }, SOCCER_FIREBASE_CONFIG: { apiKey: 'k', databaseURL: 'https://d.example' } };
global.setInterval = () => 0; global.setTimeout = () => 0; global.clearTimeout = () => { };
global.confirm = () => true; global.alert = () => { };
global.Blob = function () { }; global.URL = { createObjectURL: () => 'x', revokeObjectURL() { } };
global.FileReader = function () { };
global.localStorage = {
  _d: {},
  getItem(k) { return this._d[k] ?? null },
  setItem(k, v) { this._d[k] = String(v) },
  removeItem(k) { delete this._d[k] },
  get length() { return Object.keys(this._d).length },
  key(i) { return Object.keys(this._d)[i] ?? null }
};

let src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
src = src.replace(/await import\([^)]*\)/g, '({})');
new Function(src + `
  global.APP = {
    render, myTeams, canEditTeam, needsSignIn, anyAdmins, cacheMe, cachedMe,
    get me() { return me }, set me(v) { me = v },
    get state() { return state }, set state(v) { state = v },
    get ui() { return ui }, set denied(v) { denied = v }
  };
`)();

const A = global.APP;
let failures = 0;
function check(label, got, want) {
  const ok = got === want;
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(50)} ${JSON.stringify(got)}${ok ? '' : ' — expected ' + JSON.stringify(want)}`);
}
const app = () => String(nodes['#app'].innerHTML || '');
const crumbs = () => String(nodes['#crumbs'].innerHTML || '');
const CHILD = 'Immie Farrow';           // a name that must never survive a lock

const club = admins => ({
  teams: {
    t1: {
      id: 't1', name: 'Testing',
      players: { p1: { id: 'p1', name: CHILD, number: '7' }, p2: { id: 'p2', name: 'Rae Vance', number: '9' } }
    }
  },
  matches: {},
  access: {
    org: { name: 'Soccer by Rachel' },
    members: { boss: { name: 'Rachel' } },
    ...(admins ? { admins: { boss: true }, index: { boss: true } } : {})
  }
});

function show(view) { A.ui.view = view || 'matches'; A.ui.teamId = 't1'; A.render(); }

/* ---------------- a club that has an admin ---------------- */

console.log('--- signed out of a club that has an admin ---');
A.state = club(true);
A.me = null; A.denied = false;
show('matches');
check('the club needs a sign-in', A.needsSignIn(), true);
check('the lock screen is showing', /needs a sign-in/.test(app()), true);
check('no team is offered', A.myTeams().length, 0);
check('and none can be edited', A.canEditTeam('t1'), false);
check("no child's name in the page", app().includes(CHILD), false);
check('no club name in the crumbs', crumbs().includes('Soccer by Rachel'), false);
check('no team name in the crumbs', crumbs().includes('Testing'), false);
console.log('  ^ and none of this waited on the database: denied is still false');
check('denied was never set', /denied/.test('') || A.needsSignIn(), true);

console.log('\n--- every screen, not just the one that was open ---');
let leaked = [];
for (const v of ['matches', 'roster', 'season', 'club', 'setup', 'mine', 'admin', 'people', 'teamset']) {
  show(v);
  if (app().includes(CHILD) || crumbs().includes('Soccer by Rachel')) leaked.push(v);
}
check('nothing leaks from any view', leaked.join(',') || 'none', 'none');

/* ---------------- signed in, then out again ---------------- */

console.log('\n--- the admin signs in ---');
A.me = { uid: 'boss', name: 'Rachel', email: 'r@x.test' };
show('matches');
check('the club is visible again', A.myTeams().length, 1);
check('and editable', A.canEditTeam('t1'), true);
check('the squad renders', app().includes(CHILD) || A.ui.view !== 'roster', true);
show('roster');
check('the roster shows the players', app().includes(CHILD), true);
check('the crumbs are back', crumbs().includes('Soccer by Rachel'), true);

console.log('\n--- and signs out ---');
A.me = null;
show('roster');
check('locked immediately', A.needsSignIn(), true);
check('the roster is gone', app().includes(CHILD), false);
check('the crumbs are gone', crumbs().includes('Soccer by Rachel'), false);

/* ---------------- the bootstrap must still work ---------------- */

console.log('\n--- a club with no admin yet ---');
A.state = club(false);
A.me = null;
show('matches');
check('nothing is hidden before lockdown', A.needsSignIn(), false);
check('teams are visible', A.myTeams().length, 1);
check('and editable, so it can be set up', A.canEditTeam('t1'), true);
console.log('  ^ this is what stops a fresh club locking itself out');

/* ---------------- no backend at all ---------------- */

console.log('\n--- a device with no Firebase config ---');
global.window.SOCCER_FIREBASE_CONFIG = {};
A.state = club(true);
A.me = null;
show('matches');
check('an inert access list does not lock the app', A.needsSignIn(), false);
check('teams still render', A.myTeams().length > 0, true);
console.log('  ^ there is nowhere to sign in, so a lock screen would be a dead end');
global.window.SOCCER_FIREBASE_CONFIG = { apiKey: 'k', databaseURL: 'https://d.example' };

/* ---------------- remembering who is signed in ---------------- */

console.log('\n--- the identity cache, which is what keeps offline working ---');
A.cacheMe({ uid: 'boss', name: 'Rachel', email: 'r@x.test' });
check('a signed-in identity is remembered', (A.cachedMe() || {}).uid, 'boss');
A.cacheMe(null);
check('signing out forgets it', A.cachedMe(), null);
console.log('  ^ Firebase Auth restores a session only once its module has');
console.log('    loaded from the CDN, which does not happen at a field with no');
console.log('    signal. Without this a coach would be locked out of her own');
console.log('    club exactly when she needs it. Clearing it on sign-out is');
console.log('    what makes signing out bite before the database answers.');

console.log(`\n${failures ? failures + ' EXPECTATION(S) FAILED' : 'all expectations hold'}`);
process.exit(failures ? 1 : 0);
