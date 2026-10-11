/* The URL and the screen have to mean the same thing, both ways.

   A shared link is how a coach sends a parent to one game, and how the app
   survives a refresh mid-match. Both directions matter: uiToHash has to produce
   something a person can read, and hashToUi has to put the app back exactly
   where the link points — or reject the link, if it names a team or a game this
   device has never heard of, rather than rendering an empty screen.

   This file used to compute `ok` and then throw it away, printing "all
   round-trips: FAIL" on its way to exit 0. */

const H = require('./harness');
const { check } = H;

const A = H.loadApp({});
A.state = {
  teams: { t7: { id: 't7', name: 'Flight', players: {} }, t8: { id: 't8', name: 'Storm', players: {} } },
  matches: { g3: { id: 'g3', teamId: 't7' } },
  access: {}
};

const reset = () => Object.assign(A.ui,
  { view: 'calendar', gameView: 'subs', teamId: null, matchId: null, editFid: null, calSel: null });

const cases = [
  // the Calendar is the person's: no team and no club in its address
  [{ view: 'calendar' }, '#/calendar'],
  [{ view: 'roster', teamId: 't7' }, '#/team/t7/squad'],
  [{ view: 'season', teamId: 't7' }, '#/team/t7/season'],
  [{ view: 'game', teamId: 't7', matchId: 'g3', gameView: 'stats' }, '#/team/t7/game/g3/stats'],
  [{ view: 'game', teamId: 't7', matchId: 'g3', gameView: 'live' }, '#/team/t7/game/g3/live'],
  [{ view: 'game', teamId: 't7', matchId: 'g3', gameView: 'subs' }, '#/team/t7/game/g3/subs'],
  [{ view: 'club' }, '#/club'],
  [{ view: 'admin' }, '#/club/settings'],
  [{ view: 'mine' }, '#/my-players'],
  [{ view: 'setup' }, '#/settings'],
  [{ view: 'sessions' }, '#/training'],
  // build 106: messages and notifications are two screens
  [{ view: 'inbox' }, '#/messages'],
  [{ view: 'notes' }, '#/notifications']
];

console.log('--- the screen turns into a readable path ---');
for (const [st, want] of cases) {
  reset(); Object.assign(A.ui, st);
  check(want, A.uiToHash(), want);
}

console.log('\n--- and the path puts the screen back ---');
for (const [st, path] of cases) {
  reset(); A.ui.view = 'nowhere';
  global.location.hash = path;
  const accepted = A.hashToUi();
  const same = Object.entries(st).every(([k, v]) => A.ui[k] === v);
  check(path.padEnd(26) + ' accepted', accepted, true);
  check(path.padEnd(26) + ' restored exactly', same, true);
}

console.log('\n--- the Calendar says which calendars it shows ---');
{
  // nobody signed in has no My calendar: All teams is the only one, and the plain address
  reset(); A.ui.calSel = 'club';
  check('All teams on its own is just the Calendar', A.uiToHash(), '#/calendar');
  A.me = { uid: 'u1' }; A.state.access = { teams: { t7: { coaches: { u1: true } } } };
  reset(); A.ui.calSel = 'club';
  check('beside My calendar, All teams says so', A.uiToHash(), '#/calendar/all');
  const back = hash => { reset(); A.ui.view = 'nowhere'; global.location.hash = hash; A.hashToUi(); return A.ui.view + ' ' + A.calSel(); };
  check('— and comes back as All teams', back('#/calendar/all'), 'calendar club');
  check('the plain address is hers', back('#/calendar'), 'calendar mine');
  A.me = null; A.state.access = {};
}

console.log('\n--- a conversation between two colleagues names the other one ---');
{
  A.me = { uid: 'u1' };
  reset(); A.ui.view = 'thread'; A.ui.thread = { cid: 'u1~u9' };
  check('the address names who it is with', A.uiToHash(), '#/messages/with/u9');
  reset(); A.ui.view = 'nowhere'; global.location.hash = '#/messages/with/u9'; A.hashToUi();
  check('and comes back as the same pair, sorted', A.ui.view + ' ' + A.ui.thread.cid, 'thread u1~u9');
  A.me = { uid: 'z1' };
  reset(); A.ui.view = 'nowhere'; global.location.hash = '#/messages/with/u9'; A.hashToUi();
  check('from the other side too', A.ui.thread.cid, 'u9~z1');
  A.me = null;
}

console.log('\n--- the screens that moved still answer their old addresses ---');
{
  /* Build 102 put the games on the Calendar, the team's set-up on Squad, and
     Club schedule and My calendar into the one Calendar; build 103 made that
     Calendar the person's, at an address with no team or club in it, and a
     team's games its Season's. Links to the old screens are in texts,
     calendar files and bookmarks; each lands where what it showed went. */
  const lands = hash => { reset(); A.ui.view = 'nowhere'; global.location.hash = hash; A.hashToUi(); return [A.ui.view, A.ui.calSel, A.ui.teamId].filter(Boolean).join(' '); };
  check('#/team/t7/games is the team\'s Season, which lists its games', lands('#/team/t7/games'), 'season t7');
  check('#/team/t7/calendar is the Calendar, with that team on it', lands('#/team/t7/calendar'), 'calendar club t7');
  check('#/team/t7/planning is Squad', lands('#/team/t7/planning'), 'roster t7');
  check('#/club/calendar is All teams', lands('#/club/calendar'), 'calendar club');
  check('#/club/schedule is All teams', lands('#/club/schedule'), 'calendar club');
  check('#/my-calendar is My calendar', lands('#/my-calendar'), 'calendar mine');
  for (const [old, now] of [['matches', 'season'], ['teamset', 'roster'], ['schedule', 'calendar'], ['mycal', 'calendar']]) {
    reset(); A.ui.view = old; A.normView();
    check(`a screen saved as ${old} opens ${now}`, A.ui.view, now);
  }
}

console.log('\n--- a link to something this device does not have is refused ---');
{
  /* Refused rather than followed: half-applying it would leave the app on a
     game screen with no game, which is worse than staying put. */
  reset();
  global.location.hash = '#/team/nope/games';
  check('an unknown team', A.hashToUi(), false);
  check('and the screen did not move', A.ui.teamId, null);

  global.location.hash = '#/team/t7/game/nope/live';
  check('an unknown game', A.hashToUi(), false);
  check('and the screen still did not move', A.ui.matchId, null);

  global.location.hash = '';
  check('an empty hash', A.hashToUi(), false);
  global.location.hash = '#/nonsense/here';
  check('a path that means nothing', A.hashToUi(), false);
}

console.log('\n--- training sessions: a tab, or one session ---');
{
  reset(); A.ui.view = 'nowhere'; A.ui.sess = null;
  global.location.hash = '#/training/fields';
  check('#/training/fields opens the Fields tab', A.hashToUi() && A.ui.view + ' ' + A.ui.sess.tab, 'sessions fields');
  check('and goes back out as itself', A.uiToHash(), '#/training/fields');
  reset(); A.ui.sess = null;
  global.location.hash = '#/training/s123';
  check('#/training/{id} opens the list, to open that session', A.hashToUi() && A.ui.sess.tab + ' ' + A.ui.sess.go, 'list s123');
}

console.log('\n--- a link survives the round trip it came from ---');
{
  reset();
  Object.assign(A.ui, { view: 'game', teamId: 't7', matchId: 'g3', gameView: 'track' });
  const link = A.uiToHash();
  reset(); A.ui.view = 'nowhere';
  global.location.hash = link;
  A.hashToUi();
  check('the tab came back too', A.ui.gameView, 'track');
  check('on the right game', A.ui.matchId, 'g3');
  check('and it produces the same link again', A.uiToHash(), link);
}

/* Back has to walk back through the screens she visited and no further, in a
   real browser's history: a fake one here, with entries, pushState,
   replaceState and a back() that fires popstate the way Chromium does. */
console.log('\n--- the back button walks back through the app ---');
{
  const pops = [];
  const B = H.loadApp({ hash: '#/calendar', window: { addEventListener(type, fn) { if (type === 'popstate') pops.push(fn); } } });
  B.state = A.state;
  const hist = {
    entries: [{ url: '/#/calendar', state: null }], i: 0, pushes: 0,
    get state() { return this.entries[this.i].state; },
    pushState(st, t, url) { this.entries.splice(this.i + 1); this.entries.push({ url, state: st }); this.i++; this.pushes++; global.location.hash = url.replace(/^[^#]*/, ''); },
    replaceState(st, t, url) { this.entries[this.i] = { url, state: st }; global.location.hash = url.replace(/^[^#]*/, ''); },
    back() { if (!this.i) return; this.i--; global.location.hash = this.entries[this.i].url.replace(/^[^#]*/, ''); for (const f of pops) f({ type: 'popstate' }); }
  };
  global.history = hist;
  const sheet = () => !global.document.querySelector('#sheet').hidden;
  Object.assign(B.ui, { view: 'calendar', teamId: 't7' }); B.render(); B.timers.run();
  check('opened on the address it already had: nothing added', hist.entries.length, 1);

  // a tap is a move: it gets its own entry, the first one after a load included
  B.click({ act: 'pickteam', id: 't8' }); B.timers.run();
  check('the first tap after opening a link adds an entry (it used to replace it)', hist.entries.length + ' ' + global.location.hash, '2 #/team/t8/season');

  // the app moving her by itself replaces, so Back never lands on it to be moved again
  B.ui.view = 'roster'; B.render(); B.timers.run();
  check('a screen the app changed without a tap replaces', hist.entries.length + ' ' + global.location.hash, '2 #/team/t8/squad');
  B.ui.view = 'season'; B.render(); B.timers.run();

  hist.back(); B.timers.run();
  check('Back goes to the screen before', B.ui.view + ' ' + global.location.hash, 'calendar #/calendar');
  check('and adds nothing on the way', hist.entries.length, 2);

  // a sheet: Back closes it and leaves the screen where it is
  B.openSheet('<p>a sheet</p>');
  check('a sheet gets an entry of its own, at the same address', hist.entries.length + ' ' + JSON.stringify(hist.state) + ' ' + global.location.hash, '2 {"sheet":1} #/calendar');
  hist.back(); B.timers.run();
  check('Back closes the sheet', sheet(), false);
  check('and the screen behind stays put', B.ui.view + ' ' + global.location.hash + ' ' + hist.i, 'calendar #/calendar 0');

  // closed any other way, its entry is taken off, and that Back is not a move
  B.openSheet('<p>a sheet</p>'); B.closeSheet(); B.timers.run();
  check('a sheet closed by a tap takes its entry back off', hist.i + ' ' + B.ui.view, '0 calendar');
  B.openSheet('<p>a sheet</p>');
  check('one reopened gets a fresh entry', hist.i + ' ' + JSON.stringify(hist.state), '1 {"sheet":1}');

  // closed by a tap that goes on to another screen: that screen takes the sheet's entry, so it is one Back
  B.click({ act: 'pickteam', id: 't7' }); B.timers.run();
  check('a sheet left for another screen: the screen takes its entry', hist.i + ' ' + global.location.hash + ' ' + hist.state, '1 #/team/t7/season null');
  hist.back(); B.timers.run();
  check('and one Back from there is the screen the sheet was opened on', B.ui.view + ' ' + global.location.hash + ' ' + sheet(), 'calendar #/calendar false');

  // one sheet closed for the next is still the one entry
  B.openSheet('<p>one</p>'); const at = hist.entries.length;
  B.closeSheet(); B.openSheet('<p>two</p>'); B.timers.run();
  check('a sheet swapped for another keeps the one entry', hist.entries.length + ' ' + hist.i + ' ' + sheet(), at + ' 1 true');
  hist.back(); B.timers.run();
  check('and one Back closes it', sheet() + ' ' + hist.i, 'false 0');
}

H.summary('routing');
