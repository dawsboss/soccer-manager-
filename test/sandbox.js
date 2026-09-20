/* The test club and the environment switch.

   Both exist so that auth work has somewhere to happen that is not the club
   with this season's data in it, so the two things worth proving are that the
   seeded club is internally consistent — a rehearsal that drifts from the real
   model teaches the wrong lesson — and that it cannot reach anything real:
   not the published mirror parents read, and not another database's local copy.

   Exits non-zero on a failed expectation. */

/* The stubbed DOM, the storage stub, the way app.js is loaded and the `check`
   format all moved into harness.js, which is the same rig every other test
   boots on now. The expectations below are unchanged. */
const H = require('./harness');
const { check } = H;

const A = H.loadApp({ config: { apiKey: 'k', databaseURL: 'https://prod.example' } });
const LS = A.storage;
const nodes = A.dom.nodes;

/* ---------------- seeding ---------------- */

console.log('--- making one ---');
A.me = { uid: 'own', name: 'Grant', email: 'g@x.test' };
A.appOwners = { own: true };
A.seedSandbox();

const code = LS.getItem('sm.workspace');
check('the code marks it as a rehearsal', String(code).startsWith('test-'), true);
check('it reloaded to pick the new club up', A.dom.reloads, 1);

// what loadLocal() would do on the other side of that reload
const seeded = JSON.parse(LS.getItem('sm.data.v1:' + code));
A.state = seeded;
check('the club knows it is a sandbox', A.isSandbox(), true);
check('teams seeded', Object.keys(seeded.teams).length, 2);
check('games seeded', Object.keys(seeded.matches).length, 4);
check('people are waiting to be given a role', Object.keys(seeded.access.members).length, 4);
check('nobody is an admin yet', seeded.access.admins === undefined, true);
check('and there is no index yet', seeded.access.index === undefined, true);
console.log('  ^ the state a real club is in when README\'s lockdown steps begin');

/* ---------------- the seeded games obey the model ---------------- */

console.log('\n--- the games hold together ---');
let live = 0;
for (const m of Object.values(seeded.matches)) {
  const openPeriods = Object.values(m.periods).filter(s => !s.end).length;
  const openStints = Object.values(m.stints).filter(s => s.off == null).length;
  const el = A.elapsedSec(m);
  const ids = Object.keys(seeded.teams[m.teamId].players);
  const over = ids.filter(pid => A.playedSec(m, pid) > el);
  const mismatch = ids.filter(pid => A.onField(m, pid) !== !!A.openStint(m, pid));
  if (m.ended) {
    check(m.opponent + ': finished, clock closed', openPeriods, 0);
    check(m.opponent + ': finished, every stint closed', openStints, 0);
  } else {
    live++;
    check(m.opponent + ': live, exactly one period open', openPeriods, 1);
    check(m.opponent + ': live, players still on', openStints > 0, true);
  }
  check(m.opponent + ': nobody outplays the clock', over.length, 0);
  check(m.opponent + ': onField agrees with the stints', mismatch.length, 0);
  check(m.opponent + ': the clock has actually run', el > 0, true);
}
check('exactly one game is in progress', live, 1);

/* ---------------- it renders, and says what it is ---------------- */

console.log('\n--- it looks like a club, and admits it is not one ---');
const shown = () => String(nodes['#app'].innerHTML || '');
A.ui.teamId = Object.keys(seeded.teams)[0];
A.ui.matchId = Object.values(seeded.matches).find(m => !m.ended).id;
let renderFail = 0, unbannered = [];
for (const [view, gview] of [['matches', null], ['roster', null], ['season', null],
['club', null], ['setup', null], ['game', 'live'], ['game', 'stats']]) {
  A.ui.view = view; if (gview) A.ui.gameView = gview;
  try { A.render(); } catch (e) { renderFail++; console.log('  THREW on ' + view + ': ' + e.message); continue; }
  if (!/class="rolebar test"/.test(shown())) unbannered.push(view + (gview ? '/' + gview : ''));
}
check('every view rendered', renderFail, 0);
check('and every one carries the test banner', unbannered.join(',') || 'none', 'none');

/* ---------------- it cannot reach anything real ---------------- */

console.log('\n--- it stays off the public tier ---');
const t = Object.values(seeded.teams)[0];
t.share = 'a-real-looking-share-id';
A.ui.teamId = t.id;
A.fb = null;
A.schedulePublish();
check('publishing is refused for a test club', A.pubState.error, 'Test club — nothing is published');

// the same call on an ordinary club gets as far as the connection check
LS.setItem('sm.workspace', 'REALCODE');
delete seeded.access.org.sandbox;
A.schedulePublish();
check('an ordinary club is not blocked here', A.pubState.error, 'Not connected to Firebase');

/* ---------------- environments keep their copies apart ---------------- */

console.log('\n--- one code, two databases ---');
const prodKey = A.dataKey();
LS.setItem('sm.env', 'sandbox');
const sbKey = A.dataKey();
check('the same code stores under two keys', prodKey !== sbKey, true);
check('production keeps the bare key', prodKey, 'sm.data.v1:REALCODE');
check('the other database is namespaced', sbKey, 'sm.data.v1:sandbox~REALCODE');
console.log('  ^ without this, opening the same code in a test database would');
console.log('    overwrite this device\'s copy of the real season.');

// a club in one database must not appear in the other's switcher
LS.setItem('sm.data.v1:sandbox~ONLY-IN-SANDBOX', JSON.stringify({ access: { org: { name: 'Sandbox only' } } }));
LS.setItem('sm.data.v1:ONLY-IN-PROD', JSON.stringify({ access: { org: { name: 'Prod only' } } }));
const inSandbox = A.knownClubs().map(c => c.code);
LS.removeItem('sm.env');
const inProd = A.knownClubs().map(c => c.code);
check('the sandbox switcher shows sandbox clubs', inSandbox.includes('ONLY-IN-SANDBOX'), true);
check('and not production ones', inSandbox.includes('ONLY-IN-PROD'), false);
check('production shows production clubs', inProd.includes('ONLY-IN-PROD'), true);
check('and not sandbox ones', inProd.includes('ONLY-IN-SANDBOX'), false);
check('no key leaks through unstripped', inProd.some(c => c.includes('~')), false);

H.summary();
