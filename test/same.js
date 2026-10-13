/* The same app for everyone (UX-REVIEW-2.md, 9 and 9.6; build 153).

   The test this round: a parent asks the coach "how do I…?" and the coach
   answers from her own phone. Does the answer work on the parent's? Until
   build 153 it mostly did not: the parent had Home · Calendar · Messages ·
   More and the coach Team · Calendar · Game · Messages · More ("tap Game"
   went nowhere on the parent's phone); her Season put the next practice
   first with Directions on it while the coach's put the next game first and
   drew the next practice with no buttons; and the play-by-play was a tab
   called Live for her and a toggle called Live feed inside Stats for the
   coach. The rule now: one frame, three depths. Everyone gets the same tabs,
   the same screen names, the same cards in the same order with the same
   buttons; a role adds rows, tabs and buttons to that frame, it never
   renames, reorders or replaces them.

   test/copy.js holds the words; this holds the paths. Each of the things a
   parent asks about is written once, as the coach's tap sequence in the
   coach's words, and walked on every role that may do it through the
   captured click handler. A path that exists for the coach and not for the
   parent fails here, which is what keeps 9.1 to 9.3 from drifting back as
   screens are added. Then the frame itself: the same tab ids for every
   role, the next-up card's buttons in one order for everyone (a role may
   add one, never move one), the game's screens ending in Stats · Live for
   everyone, and a team's title the team over the club on every phone. */

const H = require('./harness');
const { check } = H;

// a config, so gated() is true and every role check bites (visibility.js says why)
const A = H.loadApp({ storage: { 'sm.workspace': 'CLUB' }, config: { apiKey: 'k', databaseURL: 'https://x.test' } });
A.fb = { db: {}, ref: (db, p) => p, set: () => Promise.resolve(), remove: () => Promise.resolve() };
global.window.MinutesIcs = require('../ics.js');     // index.html loads ics.js ahead of app.js (Directions and the calendar links need it); the harness has no page
const at = (d, hhmm) => { const [y, m, dd] = d.split('-').map(Number); const [h, mi] = hhmm.split(':').map(Number); return new Date(y, m - 1, dd, h, mi).getTime(); };
H.clock.set(at('2026-09-12', '10:00'));

const ROSA = 'Rosa Delgado', ELLA = 'Ella Fitzgerald', MIA = 'Mia Kowalski';
const club = () => ({
  teams: {
    t1: {
      id: 't1', name: 'G14 Flight',
      players: {
        p1: { id: 'p1', name: ROSA, number: '7', guardians: { mum: true } },
        p2: { id: 'p2', name: ELLA, number: '9', fans: { nan: true }, self: { kid: true } },
        p3: { id: 'p3', name: MIA, number: '4' }
      },
      events: { e1: { id: 'e1', kind: 'practice', title: 'Practice', date: '2026-09-15', start: '18:00', end: '19:00', venue: 'Lakeside Park' } }
    },
    t2: { id: 't2', name: 'G12 Storm', players: { k1: { id: 'k1', name: 'Bea Quill', number: '3' } } }
  },
  matches: {
    g1: {
      id: 'g1', teamId: 't1', opponent: 'Riverside', date: '2026-09-05', kickoff: '09:00', periodCount: 2, periodMinutes: 40, onFieldCount: 2, currentHalf: 3, ended: at('2026-09-05', '10:30'),
      periods: { 0: { half: 1, start: at('2026-09-05', '09:00'), end: at('2026-09-05', '09:40') }, 1: { half: 2, start: at('2026-09-05', '09:50'), end: at('2026-09-05', '10:30') } },
      stints: { s1: { pid: 'p1', on: 0, off: 2400 }, s2: { pid: 'p3', on: 0, off: 4800 } }, goals: { a: { t: 300, side: 'us', pid: 'p1' }, b: { t: 900, side: 'them' } }
    },
    g2: { id: 'g2', teamId: 't1', opponent: 'Northgate', date: '2026-09-19', kickoff: '09:30', venue: 'Northgate Rec', periodCount: 2, periodMinutes: 40, currentHalf: 1, periods: {}, stints: {} }
  },
  access: {
    org: { name: 'Lakeside SC' },
    admins: { boss: true }, viewers: { vee: true },
    teams: { t1: { coaches: { jaz: true }, trackers: { trk: true }, helpers: { hel: true } }, t2: { coaches: { other: true } } },
    index: { boss: true, jaz: true, trk: true, hel: true, mum: true, nan: true, kid: true, vee: true, other: true },
    members: { boss: { name: 'Ada' }, jaz: { name: 'Jaz' }, mum: { name: 'Mo' } }
  }
});
const ROLES = { boss: 'an admin', jaz: 'a coach', trk: 'a tracker', hel: 'a helper', vee: 'a club viewer', mum: 'a parent', nan: 'a fan', kid: 'a player with her own sign-in' };
const EVERYONE = Object.keys(ROLES);
const STAFF = ['boss', 'jaz', 'trk', 'hel', 'vee'], FAMILY = ['mum', 'nan', 'kid'];
// the child each family answers for; staff answer for anyone on the team from the list
const kidOf = uid => uid === 'kid' ? 'p2' : 'p1';

function as(uid) {
  A.state = club();
  A.me = { uid, name: uid, email: uid + '@x.test' };
  A.appOwners = {};
  A.ui.teamId = 't1'; A.ui.matchId = null; A.ui.view = 'season'; A.ui.gameView = 'subs'; A.ui.gameFrom = null; A.ui.editFid = null; A.ui.thread = null; A.ui.rsvpPick = null;
  A.toasts.length = 0;
  A.closeSheet();
  A.render();
}
const page = () => A.rendered();
const sheet = () => String(A.dom.node('#sheet').innerHTML || '');
const title = () => A.rendered('#titlebar');
const bar = () => A.rendered('#tabbar');
const tab = k => A.click({ act: 'tab', tab: k });
/* Home, as the coach says it. For an admin or a club viewer Home is the list
   of teams (UX-REVIEW-2.md, 6.3), the team one tap down: a level added to
   the frame, not a different frame, so the walk takes it. */
const home = () => { tab('home'); if (A.ui.view === 'club') A.click({ act: 'goteam', id: 't1' }); };
// the next-up card for one thing, and what it offers
const cardFor = (h, label) => h.split('<div class="card').find(x => x.startsWith(` calnext"`) && x.includes(`<span class="muted">${label}</span>`)) || '';
const buttonsOf = card => [...card.matchAll(/<(?:button|a) class="btn [^"]*"[^>]*>([^<]*)</g)].map(m => m[1]);

/* ---------------- the ten things a parent asks about ---------------- */

const PATHS = [
  { ask: 'How do I see the score?', say: 'Game → Stats', who: EVERYONE,
    walk() { tab('game'); A.click({ act: 'opengview', v: 'stats' }); },
    got: () => [A.ui.view, A.ui.matchId, A.ui.gameView].join(' ') + (/feedscore|G14 Flight/.test(page()) ? '' : ' (no score)'), want: 'game g2 stats' },
  { ask: 'What is happening in the game?', say: 'Game → Live', who: EVERYONE,
    walk() { tab('game'); A.click({ act: 'opengview', v: 'live' }); },
    got: () => A.ui.gameView + ' ' + /What's happened/.test(page()), want: 'live true' },
  { ask: 'How did the last game go?', say: 'Home → Last game → Recap', who: EVERYONE,
    walk() { home(); A.click({ act: 'gotoplayer', tid: 't1', id: 'g1' }); A.click({ act: 'opengview', v: 'recap' }); },
    got: () => [A.ui.view, A.ui.matchId, A.ui.gameView].join(' '), want: 'game g1 recap' },
  { ask: 'Where is the match log?', say: 'Home → Last game → Log', who: EVERYONE,
    walk() { home(); A.click({ act: 'gotoplayer', tid: 't1', id: 'g1' }); A.click({ act: 'opengview', v: 'live' }); },
    got: () => A.ui.gameView + ' ' + /<h2[^>]*>Match log<\/h2>/.test(page()), want: 'live true' },
  { ask: 'Where is the next game?', say: 'Home → Next game → Open the game', who: EVERYONE,
    walk() { home(); if (!/data-act="calgame" data-tid="t1" data-id="g2"/.test(cardFor(page(), 'Next game'))) throw new Error('no Open the game on the Next game card'); A.click({ act: 'calgame', tid: 't1', id: 'g2' }); },
    got: () => [A.ui.view, A.ui.matchId].join(' '), want: 'game g2' },
  { ask: 'How do I get to practice?', say: 'Home → Next up → Directions', who: EVERYONE,
    walk() { home(); },
    got: () => /<a class="btn quiet sm" href="[^"]*Lakeside[^"]*"[^>]*>Directions<\/a>/.test(cardFor(page(), 'Next up')), want: true },
  { ask: 'Can I put it in my own calendar?', say: 'Home → Next up → Add to my calendar → Apple or Outlook', who: EVERYONE,
    walk() { home(); if (!/>Add to my calendar</.test(cardFor(page(), 'Next up'))) throw new Error('no Add to my calendar'); A.click({ act: 'calitem', k: 'practice', tid: 't1', id: 'e1' }); if (!/>Google Calendar</.test(sheet())) throw new Error('no Google Calendar'); A.click({ act: 'calics', k: 'practice', tid: 't1', id: 'e1' }); },
    got: () => /data-act="calics"[^>]*>Apple or Outlook</.test(sheet()) && !A.lastToast(), want: true },
  { ask: 'How do I say she is not coming?', say: 'Calendar → the practice → Not going', who: ['boss', 'jaz', 'mum', 'kid'],
    walk(uid) {
      tab('calendar'); A.click({ act: 'calitem', k: 'practice', tid: 't1', id: 'e1' });
      // staff tap the name in the list first; a family has her own child's chips already open
      if (/data-act="rsvpwho"/.test(sheet())) A.click({ act: 'rsvpwho', tid: 't1', k: 'e_e1', pid: kidOf(uid), kind: 'practice', id: 'e1' });
      if (!new RegExp(`data-act="rsvp"[^>]*data-pid="${kidOf(uid)}" data-v="no"`).test(sheet())) throw new Error('no Not going chip');
      A.click({ act: 'rsvp', tid: 't1', k: 'e_e1', pid: kidOf(uid), v: 'no', from: 'sheet', kind: 'practice', id: 'e1' });
    },
    got: uid => (((((A.state.rsvp || {}).t1 || {}).e_e1 || {})[kidOf(uid)]) || {}).v, want: 'no' },
  { ask: 'How do I stop the buzzing?', say: 'More → Settings → Notifications', who: EVERYONE,
    walk() { tab('more'); A.click({ act: 'goview', v: 'setup' }); },
    got: () => A.ui.view + ' ' + /id="setNotify"/.test(page()), want: 'setup true' },
  { ask: 'What changed?', say: "More → What's new", who: EVERYONE,
    walk() { tab('more'); A.click({ act: 'goview', v: 'notes' }); },
    got: () => A.ui.view, want: 'notes' },
  { ask: 'Where is the whole season?', say: 'Home → "G14 Flight on the calendar"', who: EVERYONE,
    walk() { home(); if (!/data-act="teamcal" data-tid="t1"/.test(page())) throw new Error('no link to the calendar'); A.click({ act: 'teamcal', tid: 't1' }); },
    got: () => A.ui.view, want: 'calendar' },
  { ask: 'How do I share the game?', say: 'Game → ⋯ → Share', who: EVERYONE,
    walk() { tab('game'); A.click({ act: 'gamemenu' }); },
    got: () => /data-act="sharesheet"/.test(sheet()), want: true }
];

console.log('--- the coach\'s answer, walked on every phone ---');
{
  for (const p of PATHS) {
    const bad = [];
    for (const uid of p.who) {
      as(uid);
      let got;
      try { p.walk(uid); got = p.got(uid); } catch (e) { got = 'threw: ' + e.message; }
      if (got !== p.want) bad.push(`${ROLES[uid]}: ${JSON.stringify(got)}`);
    }
    check(`"${p.ask}" — ${p.say}`, bad.join('; ') || 'works for ' + p.who.length, 'works for ' + p.who.length);
  }
  check('twelve paths, and every one walked by a parent', PATHS.length + ' ' + PATHS.filter(p => p.who.includes('mum')).length, '12 12');
}

console.log('\n--- who may answer is the app\'s to say, and pinned ---');
{
  const may = EVERYONE.filter(uid => { as(uid); return A.canRsvp('t1', kidOf(uid)); });
  check('an admin, the coach, and a family for her own child', may.join(' '), 'boss jaz mum kid');
  for (const uid of EVERYONE.filter(u => !may.includes(u))) {
    as(uid); tab('calendar'); A.click({ act: 'calitem', k: 'practice', tid: 't1', id: 'e1' });
    const before = JSON.stringify(A.state.rsvp || {});
    A.click({ act: 'rsvp', tid: 't1', k: 'e_e1', pid: 'p1', v: 'no', from: 'sheet', kind: 'practice', id: 'e1' });
    check(`— ${ROLES[uid]} is refused in the handler, with nothing written`, JSON.stringify(A.state.rsvp || {}) === before && /family or coach/.test(A.lastToast() || ''), true);
  }
}

/* ---------------- the frame: the same tabs, cards and buttons ---------------- */

console.log('\n--- one frame ---');
{
  const ids = {};
  for (const uid of EVERYONE) { as(uid); ids[uid] = A.navTabs().map(t => t.id).join(' '); }
  check('the same tab ids for every role (a viewer has no Messages: nobody writes to her)', [...new Set(Object.values(ids))].sort().join(' | '), 'home calendar game messages more | home calendar game more');
  check('— the first tab is Home for everyone, lit on a team\'s Season', EVERYONE.every(uid => { as(uid); return /data-tab="home" aria-current="true"/.test(bar()); }), true);
  check('— and the title a team\'s screen: the team over the club, for everyone', EVERYONE.every(uid => { as(uid); return /<span>G14 Flight<\/span>/.test(title()) && /data-act="clubswitch"[^>]*>[\s\S]*?<span>Lakeside SC<\/span>/.test(title()); }), true);

  // the next-up card: the same buttons in the same order, a role adding one (Plan) and never moving one
  const ORDER = ['Open the game', 'Plan', 'Directions', 'Add to my calendar'];
  const bad = [];
  for (const uid of EVERYONE) {
    as(uid); home();
    for (const label of ['Next up', 'Next game']) {
      const bs = buttonsOf(cardFor(page(), label));
      if (!bs.length) { bad.push(`${uid}/${label}: no card`); continue; }
      const idx = bs.map(b => ORDER.indexOf(b));
      if (idx.some(i => i < 0) || idx.some((v, i) => i && v < idx[i - 1])) bad.push(`${uid}/${label}: ${bs.join(' · ')}`);
    }
  }
  check('the next-up cards\' buttons, in one order, on every phone', bad.join('; ') || 'none out of order', 'none out of order');
  as('mum'); home(); const parent = buttonsOf(cardFor(page(), 'Next up')).join(' · ');
  as('jaz'); home(); const coach = buttonsOf(cardFor(page(), 'Next up')).join(' · ');
  check('— the coach\'s practice card is the parent\'s plus Plan', parent + ' | ' + coach, 'Directions · Add to my calendar | Plan · Directions · Add to my calendar');
  as('trk'); home(); check('— a tracker\'s is the parent\'s', buttonsOf(cardFor(page(), 'Next up')).join(' · '), parent);
  as('mum'); home(); const pg = buttonsOf(cardFor(page(), 'Next game')).join(' · ');
  as('jaz'); home(); check('— and the game card is the same for both', buttonsOf(cardFor(page(), 'Next game')).join(' · ') + ' | ' + pg, 'Open the game · Directions · Add to my calendar | Open the game · Directions · Add to my calendar');
  // the answer row: a family's own child, staff the list; one row, two depths
  const rows = {};
  for (const uid of EVERYONE) { as(uid); home(); const c = cardFor(page(), 'Next up'); rows[uid] = /data-act="rsvp"/.test(c) ? 'chips' : /Who is coming: \d+ of 3/.test(c) ? 'list' : 'none'; }
  check('the answer row: chips for a family, the list for staff, nothing for a fan or a viewer', EVERYONE.map(u => u + ':' + rows[u]).join(' '), 'boss:list jaz:list trk:list hel:list vee:none mum:chips nan:none kid:chips');

  // the game's screens, shared from the right
  const segs = {};
  for (const uid of EVERYONE) { as(uid); tab('game'); const allowed = ['live', 'subs', 'track', 'stats', 'pitch', 'plan'].filter(v => { A.ui.gameView = v; A.render(); return A.ui.gameView === v; }); segs[uid] = A.gameSegments(allowed); }
  check('every role\'s game screens end in Stats · Live', EVERYONE.every(u => segs[u].slice(-2).join(' ') === 'stats live'), true);
  check('— a role adds screens before them, never between or after', EVERYONE.map(u => u + ':' + segs[u].join('·')).join(' '), 'boss:subs·track·plan·stats·live jaz:subs·track·plan·stats·live trk:track·stats·live hel:plan·stats·live vee:stats·live mum:stats·live nan:stats·live kid:stats·live');
  check('— and no Stats / Live feed pair inside Stats for anyone', EVERYONE.some(u => { as(u); tab('game'); A.ui.gameView = 'stats'; A.render(); return /class="chips looks"/.test(page()); }), false);

  // where each lands from the Game tab is the role's working screen, inside the same frame
  const lands = {};
  for (const uid of EVERYONE) { as(uid); tab('game'); lands[uid] = A.ui.gameView; }
  check('Game lands each role where she works: a coach on Subs, a tracker on Track, the rest on Live', EVERYONE.map(u => u + ':' + lands[u]).join(' '), 'boss:subs jaz:subs trk:track hel:live vee:live mum:live nan:live kid:live');
}

console.log('\n--- the same screen names ---');
{
  // Club home: one list of the club's teams for everyone, counted plain, hers first and the rest view only
  const lists = {};
  for (const uid of EVERYONE) { as(uid); A.ui.view = 'club'; A.render(); lists[uid] = [...page().matchAll(/data-act="goteam" data-id="(\w+)"[\s\S]*?(view only)?<\/span><\/span>/g)].map(m => m[1] + (m[2] ? '*' : '')).join(' '); }
  check('Club home lists the teams for everyone, the ones she can change first (then by name) and the rest view only', EVERYONE.map(u => u + ':' + lists[u]).join(' '), 'boss:t2 t1 jaz:t1 t2* trk:t1* hel:t1* vee:t2* t1* mum:t1* nan:t1* kid:t1*');
  check('— counted plain, never "Your team" or "you can reach"', EVERYONE.some(u => { as(u); A.ui.view = 'club'; A.render(); return /Your team|you can reach/.test(page()); }), false);
  check('— and no My players card for a family: Home is her team', FAMILY.some(u => { as(u); A.ui.view = 'club'; A.render(); return /data-v="mine"/.test(page()); }), false);
  check('— while staff with a child find it there and under More', (as('jaz'), A.state.teams.t2.players.k1.guardians = { jaz: true }, A.ui.view = 'club', A.render(), /data-v="mine"/.test(page())) && (tab('more'), /data-v="mine"/.test(sheet())), true);
  A.closeSheet();
  // the account sheet's Settings line is the More sheet's
  const line = h => (h.match(/data-v="setup"><b>Settings<\/b>\s*<span class="rowsub">([^<]*)</) || [])[1];
  check('the account sheet and More describe Settings the same way, for everyone', EVERYONE.every(u => { as(u); tab('more'); const m = line(sheet()); A.closeSheet(); A.click({ act: 'accountsheet' }); const a = line(sheet()); A.closeSheet(); return m && m === a; }), true);
  check('no child\'s name in the frame on any phone', EVERYONE.some(u => { as(u); return new RegExp([ROSA, ELLA, MIA].join('|')).test(title() + bar()); }), false);
}

H.summary('the same app for everyone');
