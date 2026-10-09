/* SEC-4: every id that is the whole of someone's access comes from the
   browser's secure generator, never Math.random.

   A share link, a game link, a team's calendar feed, My calendar's feed and a
   new club's code are each the only thing between a stranger and what they
   open, and invites and team links already came from crypto.getRandomValues.
   Math.random is a generator built for speed, not for secrets. So each kind
   of id is made here the way the app makes it, with crypto.getRandomValues
   swapped for one that writes known bytes, and the id has to be exactly those
   bytes: an id that came from anywhere else cannot match. Then each one has
   to pass what reads it — the server's id check (functions/calendar.js,
   mirror.js, mycal.js: 6–80 letters, digits, `_`, `-`) and, for My
   calendar's address, the rule on people/{uid}/set/feed (6–40 characters). */

const fs = require('fs');
const path = require('path');
const H = require('./harness');
const { check } = H;

const ROOT = path.join(__dirname, '..');
const FEED_ID = /^[A-Za-z0-9_-]{6,80}$/;
const rules = JSON.parse(fs.readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8'));
const feedRule = rules.rules.people.$uid.set.feed['.validate'];
const [, lo, hi] = /length >= (\d+) && newData\.val\(\)\.length <= (\d+)/.exec(feedRule).map(Number);

/* Known bytes, a different run each call, so an id can be traced to the call
   that made it. */
let calls = 0;
const real = globalThis.crypto;
const spy = {
  getRandomValues(b) { calls++; for (let i = 0; i < b.length; i++) b[i] = (calls * 37 + i * 11) & 255; return b; }
};
const hexOf = (n, k) => Array.from({ length: n }, (_, i) => ((k * 37 + i * 11) & 255).toString(16).padStart(2, '0')).join('');
const fromCall = (id, prefix, k, n = 16) => id === prefix + hexOf(n, k);
const install = () => Object.defineProperty(globalThis, 'crypto', { value: spy, configurable: true, writable: true });

console.log('--- the id itself ---');
{
  const A = H.loadApp({});
  install();
  const id = A.randId('s'); const k = calls;
  check('made from crypto.getRandomValues', fromCall(id, 's', k), true);
  check('128 bits of it', id.length - 1, 32);
  check('passes the feed\'s id check', FEED_ID.test(id), true);
  check(`and the rule on a feed address (${lo}–${hi})`, id.length >= lo && id.length <= hi, true);
  const inv = A.secretId(); const k2 = calls;
  check('an invite still from the same generator, and as long as before', fromCall(inv, 'i', k2, 18) && inv.length === 37, true);
  /* No Math.random fallback: a weak id that looks strong is worse than a
     refusal, and a phone without crypto cannot run Firebase anyway. */
  Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true, writable: true });
  H.throws('with no secure generator, no id at all', () => A.randId('s'));
  install();
  const seen = new Set();
  Object.defineProperty(globalThis, 'crypto', { value: real, configurable: true, writable: true });
  for (let i = 0; i < 1000; i++) seen.add(A.randId('s'));
  check('a thousand real ones, all different', seen.size, 1000);
}

/* A club with no admin yet is not gated, so the team is the device's to
   change: the same paths a coach's phone takes. */
function club() {
  const A = H.loadApp({});
  A.state = {
    teams: { t1: { id: 't1', name: 'G14 Flight', players: { p1: { id: 'p1', name: 'Ella Fitzgerald', number: '7' } } } },
    matches: {
      g1: { id: 'g1', teamId: 't1', opponent: 'Northgate', date: '2026-09-19', kickoff: '9:30', periodCount: 2, periodMinutes: 40, currentHalf: 1, periods: {}, stints: {} },
      g2: { id: 'g2', teamId: 't1', opponent: 'Riverside', date: '2026-09-26', kickoff: '10:00', periodCount: 2, periodMinutes: 40, currentHalf: 1, periods: {}, stints: {} }
    },
    access: {}
  };
  A.ui.teamId = 't1';
  install();
  return A;
}
const madeHere = (id, prefix, from) => {
  for (let k = from + 1; k <= calls; k++) if (fromCall(id, prefix, k)) return true;
  return false;
};
const reads = id => FEED_ID.test(id || '') && id.length >= 33;

console.log('--- a team\'s share link and its games\' links ---');
{
  const A = club();
  let k = calls;
  A.click({ act: 'makeshare' });
  const s = A.state.teams.t1.share;
  check('the season link', madeHere(s, 's', k) && reads(s), true);
  // each game's id is made with it, on the way past (shareIds()), or here if not
  A.ensureFixtureShares(A.state.teams.t1);
  const g1 = A.state.matches.g1.share, g2 = A.state.matches.g2.share;
  check('each game\'s own link', madeHere(g1, 'f', k) && madeHere(g2, 'f', k) && reads(g1) && reads(g2), true);
  check('— two games, two links', g1 !== g2, true);
  k = calls;
  A.click({ act: 'rotateshare' });
  const s2 = A.state.teams.t1.share, r1 = A.state.matches.g1.share;
  check('a new season link', s2 !== s && madeHere(s2, 's', k) && reads(s2), true);
  check('and new game links with it', r1 !== g1 && madeHere(r1, 'f', k) && reads(r1), true);
}

console.log('--- a team\'s calendar feed ---');
{
  const A = club();
  global.window.SOCCER_CALENDAR_FEED = 'https://feed.example.test/calendar';
  let k = calls;
  A.click({ act: 'calsyncon', tid: 't1' });
  const c = A.state.teams.t1.calFeed;
  check('turned on', madeHere(c, 'c', k) && reads(c), true);
  k = calls;
  A.click({ act: 'calsyncnew', tid: 't1' });
  const c2 = A.state.teams.t1.calFeed;
  check('replaced', c2 !== c && madeHere(c2, 'c', k) && reads(c2), true);
}

/* setMyFeed() and createClub() write straight to the database rather than the
   workspace, so they are read in the source: each makes its id with randId and
   nothing else, and nowhere in the app is a share, feed or club id made of
   uid(). */
console.log('--- my calendar\'s address and a new club\'s code ---');
{
  const src = H.appSource();
  const body = name => { const i = src.indexOf('function ' + name + '('); return src.slice(i, src.indexOf('\n}\n', i)); };
  check('My calendar\'s address: randId', /const id = how === 'off' \? '' : randId\('m'\);/.test(body('setMyFeed')), true);
  check('a new club\'s code: randId', /const code = randId\('sm-'\)/.test(body('createClub')), true);
  const A = club();
  const m = A.randId('m'), code = A.randId('sm-');
  check('the address passes the feed and the rule', reads(m) && m.length >= lo && m.length <= hi, true);
  check('the code is a database key', /^[A-Za-z0-9_-]+$/.test(code) && code.length === 35, true);
  const weak = src.split('\n').filter(l => /uid\(\)/.test(l) && /share|calFeed|feed|const code|secret/i.test(l) && !/SANDBOX_PREFIX/.test(l));
  check('no share, feed or club id made of uid() anywhere', weak.join('\n'), '');
}

Object.defineProperty(globalThis, 'crypto', { value: real, configurable: true, writable: true });
H.summary('secret ids come from the secure generator');
