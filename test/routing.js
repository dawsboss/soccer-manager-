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
  [{ view: 'sessions' }, '#/training']
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

H.summary('routing');
