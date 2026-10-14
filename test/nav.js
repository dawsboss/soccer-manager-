/* The way around (UX-REVIEW.md, 1.1; build 141).

   A phone app is learned through its tab bar, and this one had none: the
   crumbs (Club › Team › Game) were a model of the data, and the rest was three
   overlapping menus and four unlabelled icons up top. What replaced them, and
   what is easy to get quietly wrong, is pinned here:

   - One bar at the bottom for everyone (UX-REVIEW-2.md, 9.1; build 153):
     Home · Calendar · Game · Messages · More, Messages drawn only once the
     club has it. Until build 153 staff (an admin, a coach, a tracker, a
     helper, a club viewer, and anybody before the club is somebody's) had
     Team · Calendar · Game · Messages · More and a family (a parent, a
     player with her own sign-in, a fan) Home (My players) · Calendar ·
     Messages · More, so "tap Game" said by the coach meant nothing on a
     parent's phone. What the person is here as still decides what Home
     holds, never per team: a coach whose daughter plays in another age
     group is staff, and finds My players under More; a parent's Home is her
     child's team (test/home.js), and My players is no screen of hers.
   - Which tab is lit for each screen: a team's screens Home, a game Game
     wherever it was opened from, and the screens that are not a tab's own
     More.
   - The Game tab opens the game being played, else the next, on the one team
     of hers that has one, and each role lands where it works (a coach on
     Subs, a tracker on Track, a family on Live); with none anywhere, the
     team on screen's last game; a team with no games lands on Season, where
     Add a game is for whoever may. When two or more of her teams have a
     game on or coming it is a picker naming each team, the live one first,
     and the red dot means being played on any team of hers (UX-REVIEW-2.md,
     6.1; build 150). Hers are the teams she coaches, tracks or helps, every
     team for an admin or a club viewer, her children's for a family: a
     coach reads the whole club, and hers is still one team.
   - The Home tab is her team, or, when she works on several, the list of
     them (Club home), each team one level down with a back arrow up to the
     list; Club home then has no back arrow of its own, and is not offered
     again under More (UX-REVIEW-2.md, 6.3; build 150). A family with
     children on several teams switches from the title, as a coach does.
   - The title row says whose a screen is, with a back arrow where there is
     somewhere up to go (a tab's own screen has none); the club's name on it
     is the club switcher; the team's name is the team switcher when she can
     see more than one team.
   - The game header names both teams, ours first, with the date and kick-off
     under them, and no score before kick-off (UX-REVIEW-2.md, 6.1). Its
     screens are shared from the right (9.3; build 153): Stats and Live (Log
     once it is over, Recap beside it) in the same place with the same word
     for every role, Subs, Track and Lineup added before them for whoever
     works the game; no Stats / Live feed toggle for anyone.
   - More holds what is not a tab, by role: one Settings for everyone (People
     and the club's screens are in it since build 143, test/settings.js), My
     players for staff with a child, Training sessions for whoever may book
     or run one, Clubs for whoever is in more than one and for staff, who may
     start one (9.4; a family in one club is not offered Start a new club).
   - The avatar's sheet is the account alone, and its Settings line is the
     More sheet's (9.4). A locked device draws no title and no bar, and no
     child's name is ever in either. */

const fs = require('fs');
const path = require('path');
const H = require('./harness');
const { check } = H;

// a config, so gated() is true and the role checks bite (visibility.js says why)
const A = H.loadApp({ storage: { 'sm.workspace': 'CLUB' }, config: { apiKey: 'k', databaseURL: 'https://x.test' } });
const MIN = 60000;
const DAY = 24 * 60 * MIN;
const at = (d, hhmm) => { const [y, m, dd] = d.split('-').map(Number); const [h, mi] = hhmm.split(':').map(Number); return new Date(y, m - 1, dd, h, mi).getTime(); };
H.clock.set(at('2026-09-12', '10:00'));

const ROSA = 'Rosa Delgado', ELLA = 'Ella Fitzgerald', MIA = 'Mia Kowalski';
const club = () => ({
  teams: {
    t1: {
      id: 't1', name: 'G14 Flight',
      players: {
        p1: { id: 'p1', name: ROSA, number: '7', guardians: { mum: true } },
        p2: { id: 'p2', name: ELLA, number: '9', fans: { nan: true }, self: { kid: true } }
      },
      events: { e1: { id: 'e1', kind: 'practice', title: 'Practice', date: '2026-09-15', start: '18:00', end: '19:00' } }
    },
    // the coach of t1 has a daughter here, so she is staff and a family both
    t2: { id: 't2', name: 'G12 Storm', players: { k1: { id: 'k1', name: MIA, number: '4', guardians: { jaz: true } } } }
  },
  matches: {
    g1: { id: 'g1', teamId: 't1', opponent: 'Riverside', date: '2026-09-05', kickoff: '09:00', periodCount: 2, periodMinutes: 40, currentHalf: 3, ended: at('2026-09-05', '10:30'), periods: { 0: { half: 1, start: at('2026-09-05', '09:00'), end: at('2026-09-05', '09:40') }, 1: { half: 2, start: at('2026-09-05', '09:50'), end: at('2026-09-05', '10:30') } }, stints: {} },
    g2: { id: 'g2', teamId: 't1', opponent: 'Northgate', date: '2026-09-19', kickoff: '09:30', periodCount: 2, periodMinutes: 40, currentHalf: 1, periods: {}, stints: {} },
    g3: { id: 'g3', teamId: 't1', opponent: 'Hill End', date: '2026-09-26', kickoff: '10:00', called: 'cancelled', periodCount: 2, periodMinutes: 40, currentHalf: 1, periods: {}, stints: {} }
  },
  access: {
    org: { name: 'Lakeside SC' },
    admins: { boss: true }, viewers: { vee: true },
    teams: { t1: { coaches: { jaz: true }, trackers: { trk: true }, helpers: { hel: true } }, t2: { coaches: { other: true } } },
    index: { boss: true, jaz: true, trk: true, hel: true, mum: true, nan: true, kid: true, vee: true, other: true },
    members: { boss: { name: 'Ada' }, jaz: { name: 'Jaz' }, mum: { name: 'Mo' } }
  }
});
// a database, so the club has messages (msgTeams() wants one, and an admin)
A.fb = { db: {}, ref: (db, p) => p, set: () => Promise.resolve(), remove: () => Promise.resolve() };

function as(uid, view = 'season', tid = 't1') {
  A.state = club();
  A.me = uid ? { uid, name: uid, email: uid + '@x.test' } : null;
  A.appOwners = {};
  A.ui.teamId = tid; A.ui.matchId = null; A.ui.view = view; A.ui.gameFrom = null; A.ui.editFid = null; A.ui.thread = null;
  A.toasts.length = 0;
  A.closeSheet();
  A.render();
}
const bar = () => A.rendered('#tabbar');
const tabs = () => [...bar().matchAll(/data-tab="(\w+)"/g)].map(m => m[1]).join(' ');
const lit = () => (bar().match(/data-tab="(\w+)" aria-current="true"/) || [])[1] || null;
const title = () => A.rendered('#titlebar');
const titled = name => title().includes(`<span>${name}</span>`);
const sheet = () => String(A.dom.node('#sheet').innerHTML || '');
const more = () => { A.click({ act: 'tab', tab: 'more' }); return sheet(); };
const BAR = 'home calendar game messages more';

console.log('--- one bar, for everyone ---');
{
  for (const [who, uid] of [['an admin', 'boss'], ['a coach', 'jaz'], ['a tracker', 'trk'], ['a helper', 'hel'], ['a coach of another team, reading this one', 'other'], ['a parent', 'mum'], ['a fan', 'nan'], ['a player with her own sign-in', 'kid']]) {
    as(uid);
    check(`${who}: ${BAR}`, tabs(), BAR);
  }
  as('vee');
  check('a club viewer: the same bar, less Messages, which she has none of', tabs(), 'home calendar game more');
  check('— the same ids, so one tap sequence is true on every phone', A.navTabs().map(t => t.id + ':' + t.label).join(' '), 'home:Home calendar:Calendar game:Game more:More');
  as('jaz');
  check('a coach with a daughter in another age group is staff: My players under More', /data-v="mine"/.test(more()), true);
  A.closeSheet();
  as('mum', 'mine');
  check('a parent is not offered My players: it is her Home', /data-v="mine"/.test(more()) + ' ' + A.ui.view, 'false season');
  A.closeSheet();
  as('mum', 'season');
  check('— and the Home tab is lit on it', lit(), 'home');

  as(null);
  check('signed out of a club with an admin: no bar at all', bar(), '');
  check('— and no title', title(), '');
  const s = club(); s.access.admins = {}; s.access.index = {};
  A.state = s; A.me = null; A.render();
  check('a club nobody owns yet, nobody signed in: the same bar, and no Messages to tap', tabs(), 'home calendar game more');
}

console.log('\n--- which tab is lit ---');
{
  const litOn = (uid, view, extra) => { as(uid, view); if (extra) extra(); A.render(); return lit(); };
  for (const [v, want] of [['season', 'home'], ['roster', 'home'], ['practice', 'home'], ['calendar', 'calendar'], ['inbox', 'messages'], ['club', 'more'], ['people', 'more'], ['setup', 'more'], ['notes', 'more'], ['mine', 'more'], ['sessions', 'more']])
    check(`a coach on ${v}: ${want}`, litOn('jaz', v), want);
  check('a coach on a game: Game', litOn('jaz', 'game', () => { A.ui.matchId = 'g2'; }), 'game');
  check("a coach on a game's shape: Game", litOn('jaz', 'formation', () => { A.ui.matchId = 'g2'; A.ui.editFid = '@game'; }), 'game');
  check('a tracker on Track: Game', litOn('trk', 'game', () => { A.ui.matchId = 'g2'; A.ui.gameView = 'track'; }), 'game');
  for (const [v, want] of [['mine', 'home'], ['calendar', 'calendar'], ['inbox', 'messages'], ['club', 'more'], ['sessions', 'more'], ['setup', 'more'], ['season', 'home']])
    check(`a parent on ${v}: ${want}`, litOn('mum', v), want);
  // a game lights Game for everyone, wherever it was opened from (until build 153 a family's lit where she came from)
  check('a parent on a game opened from the calendar: Game', litOn('mum', 'game', () => { A.ui.matchId = 'g2'; A.ui.gameFrom = 'calendar'; }), 'game');
  check('— opened from Home: Game', litOn('mum', 'game', () => { A.ui.matchId = 'g2'; }), 'game');
  check('an admin on Club home: Home, since it is her list of teams', litOn('boss', 'club'), 'home');
  check('— a coach of one team reads the club, and her Club home is under More', litOn('jaz', 'club'), 'more');
  check('— a parent\'s too', litOn('mum', 'club'), 'more');
}

console.log('\n--- the tabs are places ---');
{
  as('jaz', 'people');
  A.click({ act: 'tab', tab: 'home' });
  check('Home opens the team\'s Season', A.ui.view, 'season');
  A.ui.view = 'roster'; A.render();
  A.click({ act: 'tab', tab: 'home' });
  check('— and leaves her on Squad when she is already on the team', A.ui.view, 'roster');
  A.click({ act: 'tab', tab: 'calendar' });
  check('Calendar', A.ui.view, 'calendar');
  A.click({ act: 'tab', tab: 'messages' });
  check('Messages', A.ui.view + ' ' + A.ui.thread, 'inbox null');
  A.click({ act: 'tab', tab: 'more' });
  check('More is a sheet, over the screen she is on', /<h3>More<\/h3>/.test(sheet()) && A.ui.view, 'inbox');
  A.click({ act: 'goview', v: 'setup' });
  check('— and an item on it goes there and closes it', A.ui.view + ' ' + A.dom.node('#sheet').hidden, 'setup true');
  as('mum', 'calendar');
  A.click({ act: 'tab', tab: 'home' });
  check('a parent\'s Home is her child\'s team', A.ui.view + ' ' + A.ui.teamId, 'season t1');
  as('mum', 'club');
  A.click({ act: 'tab', tab: 'home' });
  check('— from Club home too', A.ui.view, 'season');
  as('jaz', 'season', 't2');
  check('a coach with a daughter on another team keeps the coach\'s Season there, and the team switcher', /data-v="teamstats"/.test(A.rendered()) && /data-act="teammenu"/.test(title()), true);
  // several teams to work on: Home is the list of them, and a team is one level down
  as('boss', 'people');
  A.click({ act: 'tab', tab: 'home' });
  check('an admin\'s Home is Club home, the list of teams', A.ui.view, 'club');
  A.click({ act: 'goteam', id: 't2' });
  check('— a team opens from it', A.ui.view + ' ' + A.ui.teamId, 'season t2');
  A.ui.view = 'roster'; A.render();
  A.click({ act: 'tab', tab: 'home' });
  check('— and Home from inside a team goes back up to the list', A.ui.view, 'club');
  check('— which is up from Season, Players and Training', ['season', 'roster', 'practice'].map(v => A.upView(v)).join(' '), 'club club club');
  check('— and from nowhere itself', A.upView('club'), null);
  as('vee', 'season');
  A.click({ act: 'tab', tab: 'home' });
  check('a club viewer has no team of her own: the list', A.ui.view, 'club');
  as('other', 'season', 't1');
  A.click({ act: 'tab', tab: 'home' });
  check('a coach of one team, reading another: her Home tab is the team on screen, as before', A.ui.view + ' ' + A.ui.teamId, 'season t1');
  check('— and her list is one team', A.navTeams().map(t => t.id).join(' '), 't2');
}

console.log('\n--- the Game tab ---');
/* Game is a screen, not a guess (UX-REVIEW-3.md, 11.1; build 154): her
   games by day, the same for everyone, and the game itself only when exactly
   one of hers is being played. The club's week for an admin, never a row per
   team (the owner, 2026-10-14: twelve teams was too many). Today is Saturday
   12 September; g2 is a week off, g4 tomorrow. */
{
  const page = () => A.rendered();
  // the rows of one card on the Games screen, by game id, in order
  const cardOf = h => page().split('<div class="card">').find(x => x.startsWith(`<h2>${h}</h2>`)) || '';
  const rows = h => [...cardOf(h).matchAll(/data-act="navgame" data-id="(\w+)"/g)].map(m => m[1]).join(' ');
  const days = h => [...cardOf(h).matchAll(/<p class="lbl gday">([^<]*)<\/p>/g)].map(m => m[1]).join(' | ');
  as('jaz');
  check('the next game, with none being played', A.navGames().map(g => g.id).join(' '), 'g2');
  check('— and no live dot', /tablive/.test(bar()), false);
  A.click({ act: 'tab', tab: 'game' });
  check('a coach on a quiet week lands on Games, not on Subs of Saturday\'s game', [A.ui.view, lit()].join(' '), 'games game');
  check('— titled Games, over the club, with no back arrow: it is the tab\'s own screen', titled('Games') && !/data-act="navback"/.test(title()), true);
  check('— Coming up: her team\'s next game, a week off, never one called off', rows('Coming up'), 'g2');
  check('— under its day, one line: the kick-off, then the teams', days('Coming up') + ' | ' + /<span class="gtime">9:30am<\/span><span><span class="pname">G14 Flight v Northgate<\/span><\/span>/.test(page()), 'Sat 19 Sep | true');
  check('— Results: her team\'s last game, though it is more than a week ago, with its score', rows('Results') + ' ' + /data-r="W"[\s\S]*?0<small>–0<\/small>|data-r="D"[\s\S]*?0<small>–0<\/small>/.test(cardOf('Results')), 'g1 true');
  check('— nothing being played, so no card for it', /<h2>Being played<\/h2>/.test(page()), false);
  check('— nothing more on the calendar, so no row to it', /data-act="gameslater"/.test(page()), false);
  check('— and no sheet asking which', A.dom.node('#sheet').hidden, true);
  A.click({ act: 'navgame', id: 'g2' });
  check('a row opens that game where she works, on Subs', [A.ui.view, A.ui.matchId, A.ui.gameView, lit()].join(' '), 'game g2 subs game');
  check('— its back arrow says it goes to the games', /data-act="backgames" aria-label="Back to the games"/.test(title()), true);
  A.click({ act: 'backgames' });
  check('— and does', A.ui.view, 'games');
  A.state.matches.g2.periods = { 0: { half: 1, start: H.clock.t - 5 * MIN } }; A.render();
  check('being played: the dot on the tab', /data-tab="game"[^>]*>[\s\S]*?class="tablive"/.test(bar()), true);
  check('— and a card of its own at the top of Games, the clock leading the row', rows('Being played') + ' | ' + rows('Coming up') + ' | ' + /<h2>Being played<\/h2>[\s\S]*<h2>Coming up<\/h2>/.test(page()) + ' ' + /<span class="gtime" data-live="clock" data-mid="g2">[\d:]+<\/span>/.test(page()), 'g2 |  | true true');
  as('jaz'); A.state.matches.g2.periods = { 0: { half: 1, start: H.clock.t - 5 * MIN } }; A.render();
  A.click({ act: 'tab', tab: 'game' });
  check('one game of hers being played: the tab opens it, as the dot promises', [A.ui.view, A.ui.matchId, A.ui.gameView].join(' '), 'game g2 subs');
  A.click({ act: 'tab', tab: 'game' });
  check('— tapped again on that game, the list', A.ui.view, 'games');
  for (const [uid, want, who] of [['trk', 'track', 'a tracker on Track'], ['hel', 'live', 'a helper on Live'], ['vee', 'live', 'a club viewer on Live, read-only']]) {
    as(uid); A.state.matches.g2.periods = { 0: { half: 1, start: H.clock.t - 5 * MIN } }; A.render();
    A.click({ act: 'tab', tab: 'game' });
    check(who, A.ui.view + ' ' + A.ui.gameView, 'game ' + want);
  }
  as('jaz');
  A.state.matches.g2.ended = H.clock.t; A.state.matches.g2.currentHalf = 3; A.render();
  A.click({ act: 'tab', tab: 'game' });
  check('nothing to come: the list, with nothing coming up and her team\'s last result', [A.ui.view, rows('Coming up') || '-', rows('Results')].join(' | '), 'games | - | g2');
  check('— the one before it more than a week ago, behind Earlier', /data-act="gamesearlier">Earlier \(1\)</.test(page()), true);
  check('— said in words', /Nothing on the calendar yet\./.test(page()), true);
  as('other', 'season', 't2');
  A.click({ act: 'tab', tab: 'game' });
  check('a team with no games: Games, told, with Add a game for her own team', A.ui.view + ' ' + /No games yet/.test(page()) + ' ' + /data-act="newmatch"/.test(page()), 'games true true');

  // the same list for a family: her child's team's games, and she lands on Live from it
  as('mum', 'season'); A.click({ act: 'tab', tab: 'game' });
  check('a parent\'s Game tab is the same list: her child\'s team', [A.ui.view, rows('Coming up'), rows('Results')].join(' | '), 'games | g2 | g1');
  check('— and her list of teams is her child\'s', A.navTeams().map(t => t.id).join(' '), 't1');
  check('— her rows never say Your team: they all are', /Your team/.test(page()), false);
  A.click({ act: 'navgame', id: 'g2' });
  check('— a row opens it on Live', [A.ui.view, A.ui.teamId, A.ui.matchId, A.ui.gameView].join(' '), 'game t1 g2 live');
  for (const uid of ['nan', 'kid']) {
    as(uid, 'season'); A.click({ act: 'tab', tab: 'game' });
    check(`${uid === 'nan' ? 'a fan' : 'a player with her own sign-in'} the same`, A.ui.view + ' ' + rows('Coming up'), 'games g2');
  }
  as('mum', 'season'); A.state.matches.g2.periods = { 0: { half: 1, start: H.clock.t - 5 * MIN } }; A.render();
  check('— the dot while it is being played', /data-tab="game"[^>]*>[\s\S]*?class="tablive"/.test(bar()), true);
  A.click({ act: 'tab', tab: 'game' });
  check('— and Game opens it, on Live', [A.ui.view, A.ui.matchId, A.ui.gameView].join(' '), 'game g2 live');
  const g4 = { id: 'g4', teamId: 't2', opponent: 'Lakeside', date: '2026-09-13', kickoff: '11:00', venue: 'Lakeside Park', periodCount: 2, periodMinutes: 30, currentHalf: 1, periods: {}, stints: {} };
  as('mum', 'season'); A.state.teams.t2.players.k1.guardians = { mum: true }; A.state.matches.g4 = { ...g4 }; A.render();
  A.click({ act: 'tab', tab: 'game' });
  check('a parent with children on two teams: both next games, by day, and no sheet', [A.ui.view, rows('Coming up'), days('Coming up'), A.dom.node('#sheet').hidden].join(' | '), 'games | g4 g2 | Tomorrow · Sun 13 Sep | Sat 19 Sep | true');
  check('— her own teams\' rows say where', /G12 Storm v Lakeside<\/span><span class="psub">Lakeside Park<\/span>/.test(page()), true);
  as('mum', 'season'); A.state.matches = {}; A.render(); A.click({ act: 'tab', tab: 'game' });
  check('no games at all: told, without Add, which is not hers', A.ui.view + ' ' + /They show up here once the coach adds them\./.test(page()) + ' ' + /data-act="newmatch"/.test(page()), 'games true false');

  // an admin: the club's week, one line a game, and the rest on the calendar
  as('boss'); A.state.matches.g4 = { ...g4 }; A.render();
  check('an admin with two teams\' games coming: both, by date', A.navGames().map(g => g.id).join(' '), 'g4 g2');
  A.click({ act: 'tab', tab: 'game' });
  check('— the list, not a sheet over where she was', A.ui.view + ' ' + A.dom.node('#sheet').hidden, 'games true');
  check('— the club\'s coming week: tomorrow\'s game, and a team\'s game a week off left to the calendar', rows('Coming up') + ' | ' + days('Coming up'), 'g4 | Tomorrow · Sun 13 Sep');
  check('— one line a game, no venue: not her team', /<span class="gtime">11am<\/span><span><span class="pname">G12 Storm v Lakeside<\/span><\/span>/.test(page()), true);
  check('— and a row saying how many more, into the calendar', /data-act="gameslater"[^>]*><span><span class="pname">1 more game after this week<\/span><span class="psub">On the calendar<\/span>/.test(page()), true);
  check('— results: the last week\'s, which is none, so Earlier', rows('Results') + '|' + /data-act="gamesearlier">Earlier \(1\)</.test(page()), '|true');
  A.click({ act: 'gameslater' });
  check('the row opens All teams on the Calendar, every team ticked', [A.ui.view, A.calSel(), Object.keys(A.ui.calOff || {}).length].join(' '), 'calendar club 0');
  as('boss'); A.state.matches.g4 = { ...g4 }; A.render(); A.click({ act: 'tab', tab: 'game' });
  A.click({ act: 'navgame', id: 'g4' });
  check('a row opens that game, on its team', [A.ui.view, A.ui.teamId, A.ui.matchId, A.ui.gameView].join(' '), 'game t2 g4 subs');
  // twelve teams: the week is what she sees, never a row per team
  as('boss');
  for (let i = 0; i < 12; i++) {
    A.state.teams['x' + i] = { id: 'x' + i, name: 'Team ' + i, players: {} };
    A.state.matches['n' + i] = { id: 'n' + i, teamId: 'x' + i, opponent: 'Far ' + i, date: '2026-10-03', kickoff: '10:00', periodCount: 2, periodMinutes: 30, currentHalf: 1, periods: {}, stints: {} };
    A.state.matches['w' + i] = { id: 'w' + i, teamId: 'x' + i, opponent: 'Near ' + i, date: i % 2 ? '2026-09-13' : '2026-09-12', kickoff: String(9 + (i % 4)).padStart(2, '0') + ':00', periodCount: 2, periodMinutes: 30, currentHalf: 1, periods: {}, stints: {} };
  }
  A.render(); A.click({ act: 'tab', tab: 'game' });
  check('twelve teams: this weekend\'s twelve games under two days, the next round left to the calendar', [rows('Coming up').split(' ').filter(Boolean).length, days('Coming up'), /<span class="pname">13 more games after this week</.test(page())].join(' | '), '12 | Today · Sat 12 Sep | Tomorrow · Sun 13 Sep | true');
  check('— in kick-off order within a day, the teams in their order at one time', rows('Coming up').split(' ').slice(0, 6).join(' '), 'w0 w4 w8 w10 w2 w6');
  // an admin who coaches one team: hers always shows, and says so
  as('boss'); A.state.access.teams.t1.coaches.boss = true; A.state.matches.g4 = { ...g4 }; A.render();
  A.click({ act: 'tab', tab: 'game' });
  check('an admin who coaches a team: its next game shows however far off, with the club\'s week', rows('Coming up'), 'g4 g2');
  check('— marked as hers among the club\'s', /G14 Flight v Northgate<\/span><span class="psub">Your team<\/span>/.test(page()) && !/G12 Storm v Lakeside<\/span><span class="psub">/.test(page()), true);
  check('— and its last result, with no Earlier left', rows('Results') + ' ' + /data-act="gamesearlier"/.test(page()), 'g1 false');
  as('boss'); A.state.matches.g4 = { ...g4 }; A.render(); A.click({ act: 'tab', tab: 'game' });
  A.state.matches.g2.periods = { 0: { half: 1, start: H.clock.t - 5 * MIN } }; A.render();
  check('the other team kicks off: it goes first, and the dot is on', A.navGames()[0].id + ' ' + /tablive/.test(bar()), 'g2 true');
  A.click({ act: 'tab', tab: 'game' });
  check('— one game being played: the tab opens it, on its own team', [A.ui.view, A.ui.teamId, A.ui.matchId].join(' '), 'game t1 g2');
  A.state.matches.g4.periods = { 0: { half: 1, start: H.clock.t - 5 * MIN } }; A.render();
  A.click({ act: 'tab', tab: 'game' });
  check('two being played: the list, both in Being played, with the score', [A.ui.view, rows('Being played')].join(' ') + ' ' + /G14 Flight v Northgate<\/span><\/span><span class="pmins">0<small>–0<\/small> <span class="pill live">live<\/span>/.test(page()), 'games g4 g2 true');

  // whose games: a coach's own team's, wherever she is reading
  as('jaz'); A.state.matches.g4 = { ...g4, periods: { 0: { half: 1, start: H.clock.t - 5 * MIN } } }; A.render();
  check('a coach of one team reads the other: its game being played is no dot of hers', A.navGames().map(g => g.id).join(' ') + ' ' + /tablive/.test(bar()), 'g2 false');
  A.click({ act: 'tab', tab: 'game' });
  check('— and not on her list', A.ui.view + ' ' + rows('Being played') + '|' + rows('Coming up'), 'games |g2');
  as('other', 'season', 't1'); A.state.matches.g4 = { ...g4 }; A.render();
  A.click({ act: 'tab', tab: 'game' });
  check('a coach reading another team: Games is her own team\'s', rows('Coming up'), 'g4');

  // postponed: still on the list, said so, with the game after it
  as('jaz'); A.state.matches.g2.called = 'postponed';
  A.state.matches.g5 = { id: 'g5', teamId: 't1', opponent: 'Eastfield', date: '2026-10-03', kickoff: '10:00', periodCount: 2, periodMinutes: 40, currentHalf: 1, periods: {}, stints: {} };
  A.render(); A.click({ act: 'tab', tab: 'game' });
  check('a postponed game says Postponed, and the next one to be played follows it', rows('Coming up') + ' ' + /G14 Flight v Northgate<\/span><\/span><span class="pmins"><span class="tag called">Postponed<\/span>/.test(page()), 'g2 g5 true');
  A.click({ act: 'navgame', id: 'g2' }); A.click({ act: 'pickgame' });
  check('— and the game\'s own picker says Postponed, never upcoming', /data-id="g2"[\s\S]*?<span class="tag called">Postponed<\/span>/.test(sheet()), true);
  // its rows say the day, and before it is played the kick-off and the ground; never a raw date or minutes played (UX-REVIEW-3.md, 16.7)
  check('— every row the day, never a raw date, "min played" or "upcoming"', /class="rowsub">Sat 3 Oct · 10am</.test(sheet()) + ' ' + /\d{4}-\d\d-\d\d|min played|upcoming/.test(sheet()), 'true false');
  A.closeSheet();
  // a family's later games: the calendar row opens her own calendar
  as('jaz'); A.state.matches.g5 = { id: 'g5', teamId: 't1', opponent: 'Eastfield', date: '2026-10-03', kickoff: '10:00', periodCount: 2, periodMinutes: 40, currentHalf: 1, periods: {}, stints: {} };
  A.render(); A.click({ act: 'tab', tab: 'game' });
  check('her team\'s game after its next: not listed, a row to the calendar', rows('Coming up') + ' ' + /1 more game after this week/.test(page()), 'g2 true');
  A.click({ act: 'gameslater' });
  check('— which opens her own calendar, not the club\'s', A.ui.view + ' ' + A.calSel(), 'calendar mine');

  // a season of results: Earlier goes back a week at a time, from the newest left out
  as('jaz');
  for (let i = 0; i < 8; i++) A.state.matches['r' + i] = { id: 'r' + i, teamId: 't1', opponent: 'Old ' + i, date: `2026-08-${String(10 + i).padStart(2, '0')}`, kickoff: '09:00', periodCount: 2, periodMinutes: 40, currentHalf: 3, ended: H.clock.t - DAY, periods: {}, stints: {} };
  A.render(); A.click({ act: 'tab', tab: 'game' });
  check('a season of results: her team\'s last, the rest behind Earlier', rows('Results') + ' ' + /data-act="gamesearlier">Earlier \(8\)</.test(page()), 'g1 true');
  A.click({ act: 'gamesearlier' });
  check('— Earlier: the week of the newest left out, though three weeks with none come between', rows('Results') + ' ' + /Earlier \(1\)/.test(page()), 'g1 r7 r6 r5 r4 r3 r2 r1 true');
  A.click({ act: 'gamesearlier' });
  check('— and again, to the last of them', rows('Results').split(' ').length + ' ' + /data-act="gamesearlier"/.test(page()), '9 false');
  A.click({ act: 'tab', tab: 'calendar' }); A.click({ act: 'tab', tab: 'game' });
  check('— back from another tab, the week again', rows('Results'), 'g1');
  check('Games has an address of its own', A.uiToHash(), '#/games');
}

console.log('\n--- the title row ---');
{
  as('jaz');
  check('a team\'s screen: the team, and the club under it', /class="tbtitle pick" data-act="teammenu"[^>]*><span>G14 Flight<\/span>/.test(title()) && /class="tbsub" data-act="clubswitch"[^>]*>[\s\S]*?<span>Lakeside SC<\/span>/.test(title()), true);
  check('— the team is the team switcher, since she can see two', (A.click({ act: 'teammenu' }), /<h3>Switch team<\/h3>/.test(sheet())), true);
  A.closeSheet();
  check('— and the club is the club switcher', (A.click({ act: 'clubswitch' }), /<h3>Clubs<\/h3>/.test(sheet())), true);
  A.closeSheet();
  check('— no back arrow: Team is a tab\'s own screen', /tbback/.test(title()), false);
  as('boss');
  check('an admin\'s Season: a back arrow, up to the list of teams', /data-act="navback"/.test(title()) && (A.click({ act: 'navback' }), A.ui.view), 'club');
  check('— and Club home, the Team tab\'s own screen, has none', /tbback/.test(title()), false);
  as('boss', 'setup'); A.click({ act: 'navback' });
  check('— Settings\' back is the list too', A.ui.view, 'club');
  as('trk');
  check('one team to see: the team\'s name, not a switcher', /class="tbtitle"><span>G14 Flight<\/span>/.test(title()) && !/teammenu/.test(title()), true);
  as('jaz', 'people');
  check('People: the screen, over the club, with a back arrow', titled('People') && /Lakeside SC/.test(title()) && /data-act="navback" aria-label="Back"/.test(title()), true);
  A.click({ act: 'navback' });
  check('— back is Settings, whose Club section it is (build 143)', A.ui.view, 'setup');
  check('— titled Settings, over the club', titled('Settings') && /data-act="clubswitch"/.test(title()), true);
  A.click({ act: 'navback' });
  check('— and back from there is the team', A.ui.view, 'season');
  for (const v of ['admin', 'planner', 'regs', 'comply']) { as('boss', v); A.click({ act: 'navback' }); check(`${v}: back is Settings`, A.ui.view, 'setup'); }
  as('boss', 'sessions'); A.click({ act: 'navback' }); check('sessions: back is Club home, where its card is', A.ui.view, 'club');
  // fields, fees and hours are Settings' screens since build 148 (UX-REVIEW-2.md, 7.3)
  for (const [k, name] of [['fields', 'Fields'], ['fees', 'Session fees'], ['hours', 'Coach hours']]) {
    as('boss', 'setup'); A.click({ act: 'sesstab', k });
    check(`${k}: a screen titled ${name}, from Settings`, A.ui.view + ' ' + titled(name) + ' ' + /data-act="navback"/.test(title()), 'sessions true true');
    A.click({ act: 'navback' }); check(`— and back is Settings`, A.ui.view, 'setup');
  }
  as('jaz', 'club');
  check('Club home: titled with the club alone, as the switcher', /class="tbtitle pick" data-act="clubswitch"/.test(title()) && titled('Club home'), true);
  as('jaz'); A.ui.view = 'thread'; A.ui.thread = { tid: 't1', fam: 'mum' }; A.render();
  check('a conversation is titled Messages, with a back arrow', titled('Messages') && /data-act="navback"/.test(title()), true);
  A.click({ act: 'navback' });
  check('a conversation: back is Messages', A.ui.view + ' ' + A.ui.thread, 'inbox null');
  as('jaz', 'setup'); A.click({ act: 'navback' });
  check('Settings: back is the team', A.ui.view, 'season');
  as('mum', 'club'); A.click({ act: 'navback' });
  check('a parent\'s Club home: back is Home, her child\'s team', A.ui.view, 'season');
  as('mum', 'season');
  check('— which is the tab\'s own screen: the team over the club, no back arrow', /class="tbtitle"><span>G14 Flight<\/span>/.test(title()) && !/tbback/.test(title()), true);
  as('mum', 'season'); A.state.teams.t2.players.k1.guardians = { mum: true }; A.render();
  check('— a parent with children on two teams gets the team switcher a coach of two gets', /class="tbtitle pick" data-act="teammenu"/.test(title()), true);
  as('mum', 'season'); A.state.teams = {}; A.state.matches = {}; A.render();
  check('— and with no team here yet, Home', titled('Home'), true);
  for (const [uid, v] of [['jaz', 'calendar'], ['jaz', 'inbox'], ['mum', 'season'], ['mum', 'calendar']]) { as(uid, v); check(`${uid} on ${v}: no back arrow`, /tbback/.test(title()), false); }
  as('jaz', 'game'); A.ui.matchId = 'g2'; A.render();
  check('a game: Back to the team', /data-act="backgames" aria-label="Back to the team"/.test(title()), true);
  check('— and the game bar no longer carries one', /data-act="backgames"/.test(A.rendered()), false);
  A.ui.gameFrom = 'calendar'; A.render();
  check('— opened from the calendar: Back to the calendar', /aria-label="Back to the calendar"/.test(title()), true);
  as('jaz', 'calendar');
  // her own name under it said nothing to her (UX-REVIEW-2.md, 7.3): the club switcher, saying which calendar, since build 148
  check('the Calendar: hers, saying My calendar over the club as the switcher', titled('Calendar') && /data-act="clubswitch"[^>]*>[\s\S]*?<span>My calendar · Lakeside SC<\/span>/.test(title()) && !/G14 Flight|<span>jaz<\/span>/.test(title()), true);
  as('boss', 'calendar'); A.ui.calSel = 'club'; A.render();
  check('— All teams (an admin with no team of her own): the club, as the switcher', /data-act="clubswitch"[^>]*>[\s\S]*?<span>All teams · Lakeside SC<\/span>/.test(title()), true);
}

console.log('\n--- More, by role ---');
{
  const has = (re, s) => re.test(s);
  as('boss'); let m = more();
  check('an admin: What\'s new, Training sessions, Settings, Sign out',
    ['data-v="notes"', 'data-v="sessions"', 'data-v="setup"', 'data-act="signout"'].every(x => m.includes(x)), true);
  check('— and not Club home, which is her Team tab', has(/data-v="club"/, m), false);
  check('— one Settings, never People or Club details beside it (build 143)', /data-v="people"|data-v="admin"/.test(m) + ' ' + (m.match(/data-v="setup"/g) || []).length, 'false 1');
  check('— which says it has the club in it', /<b>Settings<\/b>[\s\S]*?the club: people, registrations, fields/.test(m), true);
  check('— no My players: she has nobody', has(/data-v="mine"/, m), false);
  as('jaz'); m = more();
  check('a coach: Settings, which names People, and no Club details', has(/data-v="setup"/, m) + ' ' + has(/<b>Settings<\/b>[\s\S]*?people/, m) + ' ' + has(/data-v="admin"/, m), 'true true false');
  check('— and the club, since her Team tab is her team', has(/data-v="club"/, m), true);
  as('trk'); m = more();
  check('a tracker: neither, nor sessions', /data-v="people"|data-v="admin"|data-v="sessions"|data-v="mine"/.test(m), false);
  check('— the club, settings and sign out', ['data-v="club"', 'data-v="setup"', 'data-act="signout"'].every(x => m.includes(x)), true);
  as('mum', 'mine'); m = more();
  check('a parent: no People, no Club settings', /data-v="people"|data-v="admin"/.test(m), false);
  check('— the club, Training sessions, settings, sign out', ['data-v="club"', 'data-v="sessions"', 'data-v="setup"', 'data-act="signout"'].every(x => m.includes(x)), true);
  // staff and owners start clubs (UX-REVIEW-2.md, 9.4); a family sees Clubs only when she is in more than one
  check('— and no Clubs row in her one club: a family does not start clubs', /<b>Clubs<\/b>/.test(m), false);
  A.click({ act: 'clubswitch' });
  check('— nor Start a new club in the switcher', /data-act="newclub"/.test(sheet()), false);
  A.closeSheet();
  as('jaz'); m = more();
  check('a coach is offered Clubs, to start one', /<b>Clubs<\/b>[\s\S]*?Start a new club/.test(m), true);
  A.click({ act: 'clubswitch' });
  check('— and Start a new club in the switcher', /data-act="newclub"/.test(sheet()), true);
  A.closeSheet();
  as('nan', 'mine'); m = more();
  check('a fan books no sessions', has(/data-v="sessions"/, m), false);
  as(null); const s = club(); s.access.admins = {}; s.access.index = {}; A.state = s; A.render(); m = more();
  check('nobody signed in: Sign in, not Sign out', has(/signinsheet/, m) + ' ' + has(/data-act="signout"/, m), 'true false');
  A.closeSheet();
}

console.log('\n--- the account sheet, and the old menus ---');
{
  as('jaz');
  A.click({ act: 'accountsheet' });
  check('the avatar: settings, sign out, delete', /data-v="setup"/.test(sheet()) && /data-act="signout"/.test(sheet()) && /forgetsheet/.test(sheet()), true);
  check('— and nothing that is a tab or under More', /data-v="mycal"|data-v="club"|data-v="mine"/.test(sheet()), false);
  A.closeSheet();
  // the Settings line is the More sheet's, for everyone (UX-REVIEW-2.md, 9.4): it said "You, this team and the club" to a parent with no team or club rows
  const setLine = h => (h.match(/data-v="setup"><b>Settings<\/b>\s*<span class="rowsub">([^<]*)<\/span>/) || [])[1];
  for (const [who, uid] of [['a parent', 'mum'], ['a tracker', 'trk'], ['a coach', 'jaz'], ['an admin', 'boss']]) {
    as(uid, 'season'); const fromMore = setLine(more()); A.closeSheet();
    A.click({ act: 'accountsheet' }); const fromAcct = setLine(sheet()); A.closeSheet();
    check(`${who}: the account sheet's Settings line is the More sheet's`, fromAcct + ' = ' + fromMore, fromMore + ' = ' + fromMore);
  }
  as('mum', 'season'); A.click({ act: 'accountsheet' });
  check('— a parent\'s says You, nothing about a team or the club', setLine(sheet()), 'You');
  A.closeSheet();
  as('trk', 'season'); A.click({ act: 'accountsheet' });
  check('— a tracker\'s too', setLine(sheet()), 'You');
  A.closeSheet();
  const page = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  check('the top bar keeps the brand, the badge and the account', /id="syncBadge"/.test(page) && /id="avatar"/.test(page) && !/id="calBtn"|id="msgBtn"|id="bellBtn"|id="clubSwitch"|id="crumbs"/.test(page), true);
  check('the title row is in the header, the bar after the page', page.indexOf('id="titlebar"') < page.indexOf('<main') && page.indexOf('id="tabbar"') > page.indexOf('</main>'), true);
}

console.log('\n--- game mode (UX-REVIEW.md, 1.3) ---');
{
  const mode = () => String((global.document.body.dataset || {}).mode || '');
  const segs = (uid, extra) => { as(uid, 'game'); A.ui.matchId = 'g2'; if (extra) extra(); A.render(); return [A.ui.gameView, A.gameSegOf(A.ui.gameView)]; };
  as('jaz', 'game'); A.ui.matchId = 'g2'; A.render();
  check('a game is its own mode: the brand row steps aside', mode(), 'game');
  check('one slim header: back, the two teams, ours first, and the date under them', /data-act="backgames" aria-label="Back to the team"/.test(title()) && /class="ghname">G14 Flight v Northgate<\/span><span class="ghwhen">Sat 19 Sep · 9:30am<\/span>/.test(title()), true);
  check('— no 0–0 before kick-off, which reads as a result (UX-REVIEW-2.md, 7.1), and no clock', /0–0|ghclock/.test(title()), false);
  A.sheetGameMenu();
  const menu = String(A.dom.node('#sheet').innerHTML);
  check('— nor in its ⋯ menu', /<h3>Northgate<\/h3>/.test(menu), true);
  check('— where a game played 0–0 keeps its score, and one called off says so, never upcoming (UX-REVIEW-3.md, 11.1)', /Riverside[\s\S]*?0<small>–0<\/small>/.test(menu) && /Hill End[\s\S]*?<span class="tag called">Cancelled<\/span>/.test(menu), true);
  A.closeSheet();
  check('— and the ⋯ menu', /data-act="gamemenu"/.test(title()), true);
  check('no game bar on the screen any more', /barrow|data-act="sharesheet"|data-act="editmatch"/.test(A.rendered()), false);
  A.state.matches.g2.periods = { 0: { half: 1, start: H.clock.t - 5 * MIN } }; A.render();
  check('being played: the clock, ticking in place', /class="ghclock" data-live="clock" data-mid="g2">5:00</.test(title()), true);
  check('— and the score between the teams, 0–0 included, once it has kicked off', /class="ghname">G14 Flight 0–0 Northgate</.test(title()), true);
  A.state.matches.g2.goals = { a: { t: 60, side: 'them' } }; A.render();
  check('— us–them, ours first', /class="ghname">G14 Flight 0–1 Northgate</.test(title()), true);
  A.state.matches.g2.ended = H.clock.t; A.state.matches.g2.currentHalf = 3; A.render();
  check('over: full time, the score kept', /class="ghclock ghft"/.test(title()) && /G14 Flight 0–1 Northgate/.test(title()), true);
  A.state.matches.g2.date = '2026-09-12'; A.render();
  check('a game today says so', /class="ghwhen">Today · 9:30am</.test(title()), true);
  as('jaz', 'season');
  check('off the game, the brand row is back', mode(), '');
  as(null, 'game'); A.ui.matchId = 'g2'; A.render();
  check('a locked device is not in game mode', mode() + title(), '');

  // the ⋯ menu: what the game bar held, by role
  as('jaz', 'game'); A.ui.matchId = 'g2'; A.render();
  A.click({ act: 'gamemenu' });
  check('the menu: the games either side, Edit and Share', /Older game[\s\S]*Riverside/.test(sheet()) && /data-act="editmatch" data-id="g2"/.test(sheet()) && /data-act="sharesheet"/.test(sheet()), true);
  check('— and no second picker: the title is Which game (UX-REVIEW-2.md, 7.3)', /data-act="pickgame"/.test(sheet()) + ' ' + /data-act="pickgame" aria-label="Which game"/.test(title()), 'false true');
  check('— and the game\'s number in the season (the called-off one counts)', /gb-hint">2\/3</.test(sheet()), true);
  A.closeSheet();
  as('trk', 'game'); A.ui.matchId = 'g2'; A.render(); A.click({ act: 'gamemenu' });
  // Share only where there is a link to share (UX-REVIEW-3.md, 16.6): the coach makes it, so anyone else waits for one
  check('a tracker gets no Edit, and no Share while the team has no link', /data-act="editmatch"/.test(sheet()) + ' ' + /data-act="sharesheet"/.test(sheet()), 'false false');
  A.closeSheet();
  A.state.teams.t1.share = 'shareT1'; A.render(); A.click({ act: 'gamemenu' });
  check('— Share once it has one', /data-act="sharesheet"/.test(sheet()), true);
  A.closeSheet(); delete A.state.teams.t1.share;

  // the screens, shared from the right (UX-REVIEW-2.md, 9.3; build 153): … · Stats · Live for everyone, Recap once it is over
  const allowed = (uid) => { as(uid, 'game'); A.ui.matchId = 'g2'; A.render(); return A.gameSegments(['live', 'subs', 'track', 'stats', 'recap', 'pitch', 'plan'].filter(v => { A.ui.gameView = v; A.render(); return A.ui.gameView === v; })).join(' '); };
  check('a coach: Subs · Track · Lineup · Stats · Live', allowed('jaz'), 'subs track plan stats live');
  check('a tracker: Track · Stats · Live', allowed('trk'), 'track stats live');
  check('a helper: Lineup · Stats · Live', allowed('hel'), 'plan stats live');
  check('a parent: Stats · Live', allowed('mum'), 'stats live');
  check('a club viewer: Stats · Live', allowed('vee'), 'stats live');
  check('the pitch is a look at Subs', segs('jaz', () => { A.ui.gameView = 'pitch'; }).join(' '), 'pitch subs');
  check('Live is a screen of its own for a coach, as for a parent', segs('jaz', () => { A.ui.gameView = 'live'; }).join(' ') + ' | ' + segs('mum', () => { A.ui.gameView = 'live'; }).join(' '), 'live live | live live');
  const page = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  check('— in that order on the page', [...page.matchAll(/data-gview="(\w+)"/g)].map(m => m[1]).join(' '), 'subs track plan stats live recap');
  as('jaz', 'game'); A.ui.matchId = 'g2'; A.ui.gameView = 'subs'; A.state.matches.g2.ended = H.clock.t; A.state.matches.g2.currentHalf = 3; A.render();
  check('over: Stats · Log · Recap for a coach', A.gameSegments(['live', 'stats', 'recap']).join(' ') + ' ' + A.ui.gameView, 'stats live recap recap');
  as('mum', 'game'); A.ui.matchId = 'g2'; A.ui.gameView = 'stats'; A.state.matches.g2.ended = H.clock.t; A.state.matches.g2.currentHalf = 3; A.render();
  check('— and for a parent', A.gameSegments(['live', 'stats', 'recap']).join(' '), 'stats live recap');
  as('jaz', 'game'); A.ui.matchId = 'g2'; A.ui.gameView = 'subs'; A.render();
  check('Subs offers the list and the pitch', /data-act="opengview" data-v="subs" aria-pressed="true"/.test(A.rendered()) && /data-act="opengview" data-v="pitch" aria-pressed="false"/.test(A.rendered()), true);
  A.click({ act: 'opengview', v: 'pitch' });
  check('— the pitch, pressed', A.ui.gameView + ' ' + /data-v="pitch" aria-pressed="true"/.test(A.rendered()), 'pitch true');
  A.ui.gameView = 'track'; A.render(); A.openGameScreen('subs'); A.render();
  check('— and Subs remembers the look she used last', A.ui.gameView, 'pitch');
  A.ui.gameView = 'stats'; A.render();
  check('Stats offers no Stats / Live feed pair any more: Live is a screen', /class="chips looks"|Live feed/.test(A.rendered()), false);
  A.ui.gameView = 'live'; A.render();
  check('— the play-by-play on Live, for a coach', /What's happened/.test(A.rendered()), true);
  A.state.matches.g2.ended = H.clock.t; A.state.matches.g2.currentHalf = 3; A.render();
  check('— the log, once it is over', /<h2[^>]*>Match log<\/h2>/.test(A.rendered()), true);
  as('mum', 'game'); A.ui.matchId = 'g2'; A.ui.gameView = 'stats'; A.render();
  check('a parent: no pair on Stats either', /class="chips looks"/.test(A.rendered()), false);
}

console.log('\n--- no child\'s name in the chrome ---');
{
  const names = new RegExp([ROSA, ELLA, MIA].join('|'));
  const leaked = [];
  for (const uid of ['boss', 'jaz', 'trk', 'hel', 'vee', 'other', 'mum', 'nan', 'kid']) {
    for (const v of ['season', 'roster', 'calendar', 'mine', 'inbox', 'club', 'people', 'setup', 'game']) {
      as(uid, v); if (v === 'game') { A.ui.matchId = 'g2'; A.render(); }
      if (names.test(title() + bar())) leaked.push(uid + '/' + v);
    }
    // More names her own children (jaz's Mia) and nobody else's
    as(uid, 'season'); const m = more(); A.closeSheet();
    if (new RegExp([ROSA, ELLA].join('|')).test(m) || (uid !== 'jaz' && m.includes(MIA))) leaked.push(uid + '/more');
  }
  check('never, for any role on any screen', leaked.join(',') || 'none', 'none');
  as('jaz'); 
  check('a coach\'s More names her own child', more().includes(MIA), true);
  A.closeSheet();
}

H.summary('the way around');
