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
  teams: { t7: { id: 't7', name: 'Flight', players: {} } },
  matches: { g3: { id: 'g3', teamId: 't7' } },
  access: {}
};

const reset = () => Object.assign(A.ui,
  { view: 'matches', gameView: 'live', teamId: null, matchId: null, editFid: null });

const cases = [
  [{ view: 'matches', teamId: 't7' }, '#/team/t7/games'],
  [{ view: 'roster', teamId: 't7' }, '#/team/t7/squad'],
  [{ view: 'season', teamId: 't7' }, '#/team/t7/season'],
  [{ view: 'teamset', teamId: 't7' }, '#/team/t7/planning'],
  [{ view: 'game', teamId: 't7', matchId: 'g3', gameView: 'stats' }, '#/team/t7/game/g3/stats'],
  [{ view: 'game', teamId: 't7', matchId: 'g3', gameView: 'live' }, '#/team/t7/game/g3/live'],
  [{ view: 'club' }, '#/club'],
  [{ view: 'admin' }, '#/club/settings'],
  [{ view: 'mine' }, '#/my-players'],
  [{ view: 'setup' }, '#/settings']
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
