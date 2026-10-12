/* The way around (UX-REVIEW.md, 1.1; build 141).

   A phone app is learned through its tab bar, and this one had none: the
   crumbs (Club › Team › Game) were a model of the data, and the rest was three
   overlapping menus and four unlabelled icons up top. What replaced them, and
   what is easy to get quietly wrong, is pinned here:

   - A bar at the bottom, chosen by what the person is here as. Staff (an
     admin, a coach, a tracker, a helper, a club viewer, and anybody before
     the club is somebody's) get Team · Calendar · Game · Messages · More; a
     family (a parent, a player with her own sign-in, a fan) gets Home (My
     players) · Calendar · Messages · More. Decided for the person, never per
     team: a coach whose daughter plays in another age group is staff, and
     finds My players under More. Messages is drawn only once the club has it.
   - Which tab is lit for each screen, and where the screens that are not a
     tab's own go: under More, or (a family's team screens) under where she
     opened them from.
   - The Game tab opens the game being played, else the next, on the one team
     she works on that has one, and each role lands where it works (a tracker
     on Track); with none anywhere, the team on screen's last game; a team
     with no games lands on Season, where Add a game is. When two or more of
     her teams have a game on or coming it is a picker naming each team, the
     live one first, and the red dot means being played on any team of hers
     (UX-REVIEW-2.md, 6.1; build 150). Hers are the teams she coaches, tracks
     or helps, every team for an admin or a club viewer: a coach reads the
     whole club, and hers is still one team.
   - The Team tab is her team, or, when she works on several, the list of
     them (Club home), each team one level down with a back arrow up to the
     list; Club home then has no back arrow of its own, and is not offered
     again under More (UX-REVIEW-2.md, 6.3; build 150).
   - The title row says whose a screen is, with a back arrow where there is
     somewhere up to go (a tab's own screen has none); the club's name on it
     is the club switcher; the team's name is the team switcher when she can
     see more than one team.
   - The game header names both teams, ours first, with the date and kick-off
     under them, and no score before kick-off (UX-REVIEW-2.md, 6.1).
   - More holds what is not a tab, by role: one Settings for everyone (People
     and the club's screens are in it since build 143, test/settings.js), My
     players for staff with a child, Training sessions for whoever may book
     or run one.
   - The avatar's sheet is the account alone. A locked device draws no title
     and no bar, and no child's name is ever in either. */

const fs = require('fs');
const path = require('path');
const H = require('./harness');
const { check } = H;

// a config, so gated() is true and the role checks bite (visibility.js says why)
const A = H.loadApp({ storage: { 'sm.workspace': 'CLUB' }, config: { apiKey: 'k', databaseURL: 'https://x.test' } });
const MIN = 60000;
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
const STAFF = 'team calendar game messages more', FAMILY = 'home calendar messages more';

console.log('--- the bar, by what she is here as ---');
{
  for (const [who, uid] of [['an admin', 'boss'], ['a coach', 'jaz'], ['a tracker', 'trk'], ['a helper', 'hel'], ['a coach of another team, reading this one', 'other']]) {
    as(uid);
    check(`${who}: ${STAFF}`, tabs(), STAFF);
  }
  as('vee');
  check('a club viewer: the staff bar, less Messages, which she has none of', tabs(), 'team calendar game more');
  for (const [who, uid] of [['a parent', 'mum'], ['a fan', 'nan'], ['a player with her own sign-in', 'kid']]) {
    as(uid, 'mine');
    check(`${who}: ${FAMILY}`, tabs(), FAMILY);
  }
  as('jaz');
  check('a coach with a daughter in another age group is staff', tabs(), STAFF);
  check('— and finds My players under More', /data-v="mine"/.test(more()), true);
  A.closeSheet();
  as('mum', 'mine');
  check('a parent is not offered My players twice', /data-v="mine"/.test(more()), false);
  A.closeSheet();

  as(null);
  check('signed out of a club with an admin: no bar at all', bar(), '');
  check('— and no title', title(), '');
  const s = club(); s.access.admins = {}; s.access.index = {};
  A.state = s; A.me = null; A.render();
  check('a club nobody owns yet, nobody signed in: the staff bar, and no Messages to tap', tabs(), 'team calendar game more');
}

console.log('\n--- which tab is lit ---');
{
  const litOn = (uid, view, extra) => { as(uid, view); if (extra) extra(); A.render(); return lit(); };
  for (const [v, want] of [['season', 'team'], ['roster', 'team'], ['practice', 'team'], ['calendar', 'calendar'], ['inbox', 'messages'], ['club', 'more'], ['people', 'more'], ['setup', 'more'], ['notes', 'more'], ['mine', 'more'], ['sessions', 'more']])
    check(`a coach on ${v}: ${want}`, litOn('jaz', v), want);
  check('a coach on a game: Game', litOn('jaz', 'game', () => { A.ui.matchId = 'g2'; }), 'game');
  check("a coach on a game's shape: Game", litOn('jaz', 'formation', () => { A.ui.matchId = 'g2'; A.ui.editFid = '@game'; }), 'game');
  check('a tracker on Track: Game', litOn('trk', 'game', () => { A.ui.matchId = 'g2'; A.ui.gameView = 'track'; }), 'game');
  for (const [v, want] of [['mine', 'home'], ['calendar', 'calendar'], ['inbox', 'messages'], ['club', 'more'], ['sessions', 'more'], ['setup', 'more'], ['season', 'home']])
    check(`a parent on ${v}: ${want}`, litOn('mum', v), want);
  check('a parent on a game opened from the calendar: Calendar', litOn('mum', 'game', () => { A.ui.matchId = 'g2'; A.ui.gameFrom = 'calendar'; }), 'calendar');
  check('— opened from My players: Home', litOn('mum', 'game', () => { A.ui.matchId = 'g2'; }), 'home');
  check('an admin on Club home: Team, since it is her list of teams', litOn('boss', 'club'), 'team');
  check('— a coach of one team reads the club, and her Club home is under More', litOn('jaz', 'club'), 'more');
  check('— a parent\'s too', litOn('mum', 'club'), 'more');
}

console.log('\n--- the tabs are places ---');
{
  as('jaz', 'people');
  A.click({ act: 'tab', tab: 'team' });
  check('Team opens the team\'s Season', A.ui.view, 'season');
  A.ui.view = 'roster'; A.render();
  A.click({ act: 'tab', tab: 'team' });
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
  check('a parent\'s Home is My players', A.ui.view, 'mine');
  // several teams to work on: Team is the list of them, and a team is one level down
  as('boss', 'people');
  A.click({ act: 'tab', tab: 'team' });
  check('an admin\'s Team is Club home, the list of teams', A.ui.view, 'club');
  A.click({ act: 'goteam', id: 't2' });
  check('— a team opens from it', A.ui.view + ' ' + A.ui.teamId, 'season t2');
  A.ui.view = 'roster'; A.render();
  A.click({ act: 'tab', tab: 'team' });
  check('— and Team from inside a team goes back up to the list', A.ui.view, 'club');
  check('— which is up from Season, Players and Training', ['season', 'roster', 'practice'].map(v => A.upView(v)).join(' '), 'club club club');
  check('— and from nowhere itself', A.upView('club'), null);
  as('vee', 'season');
  A.click({ act: 'tab', tab: 'team' });
  check('a club viewer has no team of her own: the list', A.ui.view, 'club');
  as('other', 'season', 't1');
  A.click({ act: 'tab', tab: 'team' });
  check('a coach of one team, reading another: her Team tab is the team on screen, as before', A.ui.view + ' ' + A.ui.teamId, 'season t1');
  check('— and her list is one team', A.navTeams().map(t => t.id).join(' '), 't2');
}

console.log('\n--- the Game tab ---');
{
  as('jaz');
  check('the next game, with none being played', A.navGame().id, 'g2');
  check('— never one called off', A.navGame().id !== 'g3', true);
  check('— and no live dot', /tablive/.test(bar()), false);
  A.click({ act: 'tab', tab: 'game' });
  check('a coach lands on it, on Subs', [A.ui.view, A.ui.matchId, A.ui.gameView].join(' '), 'game g2 subs');
  A.state.matches.g2.periods = { 0: { half: 1, start: H.clock.t - 5 * MIN } }; A.render();
  check('being played: the same game, with the dot', A.navGame().id + ' ' + /data-tab="game"[^>]*>[\s\S]*?class="tablive"/.test(bar()), 'g2 true');
  as('trk'); A.click({ act: 'tab', tab: 'game' });
  check('a tracker lands on Track', A.ui.gameView, 'track');
  as('hel'); A.click({ act: 'tab', tab: 'game' });
  check('a helper on Live', A.ui.gameView, 'live');
  as('vee'); A.click({ act: 'tab', tab: 'game' });
  check('a club viewer on Live, read-only', A.ui.gameView + ' ' + A.restricted(), 'live viewer');
  as('jaz');
  A.state.matches.g2.ended = H.clock.t; A.state.matches.g2.currentHalf = 3; A.render();
  check('nothing to come: the last one played', A.navGame().id, 'g2');
  as('other', 'season', 't2');
  A.click({ act: 'tab', tab: 'game' });
  check('a team with no games: Season, and told', A.ui.view + ' | ' + A.lastToast(), 'season | No games yet. Add one from Season.');
  as('mum', 'mine');
  check('a parent has no Game tab', /data-tab="game"/.test(bar()), false);

  // two teams with a game on or coming: the tab asks which (UX-REVIEW-2.md, 6.1)
  const g4 = { id: 'g4', teamId: 't2', opponent: 'Lakeside', date: '2026-09-13', kickoff: '11:00', periodCount: 2, periodMinutes: 30, currentHalf: 1, periods: {}, stints: {} };
  as('boss'); A.state.matches.g4 = { ...g4 }; A.render();
  check('an admin with two teams\' games coming: both, by date', A.navGames().map(g => g.id).join(' '), 'g4 g2');
  A.click({ act: 'tab', tab: 'game' });
  check('— the tab is a picker, and she stays where she was', /<h3>Which game\?<\/h3>/.test(sheet()) && A.ui.view, 'season');
  check('— naming each team, ours first, with no score before kick-off', /<b>G12 Storm v Lakeside<\/b>/.test(sheet()) && /<b>G14 Flight v Northgate<\/b>/.test(sheet()), true);
  check('— and when', /Tomorrow · 11am/.test(sheet()) && /Sat 19 Sep · 9:30am/.test(sheet()), true);
  check('— no dot: nothing is being played', /tablive/.test(bar()), false);
  A.click({ act: 'navgame', id: 'g4' });
  check('a row opens that game, on its team', [A.ui.view, A.ui.teamId, A.ui.matchId, A.ui.gameView].join(' '), 'game t2 g4 subs');
  A.state.matches.g2.periods = { 0: { half: 1, start: H.clock.t - 5 * MIN } }; A.render();
  check('the other team kicks off: it goes first, and the dot is on while she is on this one', A.navGames()[0].id + ' ' + /tablive/.test(bar()), 'g2 true');
  A.click({ act: 'tab', tab: 'game' });
  check('— the picker says which is live, with the score', /<b>G14 Flight 0–0 Northgate<\/b>[\s\S]*?<span class="pill live">live<\/span>/.test(sheet()), true);
  A.closeSheet();
  as('jaz'); A.state.matches.g4 = { ...g4 }; A.render();
  check('a coach of one team reads the other, and is not asked: hers', A.navGames().map(g => g.id).join(' '), 'g2');
  A.click({ act: 'tab', tab: 'game' });
  check('— opens straight away', A.ui.view + ' ' + A.ui.matchId, 'game g2');
  A.state.matches.g4.periods = { 0: { half: 1, start: H.clock.t - 5 * MIN } }; A.render();
  check('— and the other team being played is no dot of hers', /tablive/.test(bar()), false);
  as('other', 'season', 't1'); A.state.matches.g4 = { ...g4 }; A.render();
  A.click({ act: 'tab', tab: 'game' });
  check('a coach reading another team: Game is her own team\'s game, and switches to it', [A.ui.view, A.ui.teamId, A.ui.matchId].join(' '), 'game t2 g4');
  as('boss'); A.state.matches.g2.ended = H.clock.t; A.state.matches.g2.currentHalf = 3; A.render();
  A.click({ act: 'tab', tab: 'game' });
  check('one team with a game coming, the other\'s over: that one, no picker', A.ui.view + ' ' + A.ui.matchId + ' ' + A.dom.node('#sheet').hidden, 'game g2 true');
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
  as('jaz', 'club');
  check('Club home: titled with the club alone, as the switcher', /class="tbtitle pick" data-act="clubswitch"/.test(title()) && titled('Club home'), true);
  as('jaz'); A.ui.view = 'thread'; A.ui.thread = { tid: 't1', fam: 'mum' }; A.render();
  check('a conversation is titled Messages, with a back arrow', titled('Messages') && /data-act="navback"/.test(title()), true);
  A.click({ act: 'navback' });
  check('a conversation: back is Messages', A.ui.view + ' ' + A.ui.thread, 'inbox null');
  as('jaz', 'setup'); A.click({ act: 'navback' });
  check('Settings: back is the team', A.ui.view, 'season');
  as('mum', 'club'); A.click({ act: 'navback' });
  check('a parent\'s Club home: back is My players', A.ui.view, 'mine');
  as('mum', 'season'); 
  check('— and so is a team\'s Season she opened', /data-act="navback"/.test(title()) && (A.click({ act: 'navback' }), A.ui.view), 'mine');
  for (const [uid, v] of [['jaz', 'calendar'], ['jaz', 'inbox'], ['mum', 'mine'], ['mum', 'calendar']]) { as(uid, v); check(`${uid} on ${v}: no back arrow`, /tbback/.test(title()), false); }
  as('jaz', 'game'); A.ui.matchId = 'g2'; A.render();
  check('a game: Back to the team', /data-act="backgames" aria-label="Back to the team"/.test(title()), true);
  check('— and the game bar no longer carries one', /data-act="backgames"/.test(A.rendered()), false);
  A.ui.gameFrom = 'calendar'; A.render();
  check('— opened from the calendar: Back to the calendar', /aria-label="Back to the calendar"/.test(title()), true);
  as('jaz', 'calendar');
  check('the Calendar: hers, over her own name, no club', titled('Calendar') && titled('jaz') && !/Lakeside SC|G14 Flight/.test(title()), true);
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
  check('— where a game played 0–0 keeps its score, and one not played yet says so', /Riverside[\s\S]*?0<small>–0<\/small>/.test(menu) && /Hill End[\s\S]*?<small>upcoming<\/small>/.test(menu), true);
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
  check('the menu: the games either side, all games, Edit and Share', /Older game[\s\S]*Riverside/.test(sheet()) && /data-act="pickgame"/.test(sheet()) && /data-act="editmatch" data-id="g2"/.test(sheet()) && /data-act="sharesheet"/.test(sheet()), true);
  check('— and the game\'s number in the season (the called-off one counts)', /gb-hint">2\/3</.test(sheet()), true);
  A.closeSheet();
  as('trk', 'game'); A.ui.matchId = 'g2'; A.render(); A.click({ act: 'gamemenu' });
  check('a tracker gets no Edit', /data-act="editmatch"/.test(sheet()) + ' ' + /data-act="sharesheet"/.test(sheet()), 'false true');
  A.closeSheet();

  // four screens, not six
  const allowed = (uid) => { as(uid, 'game'); A.ui.matchId = 'g2'; A.render(); return A.gameSegments(['live', 'subs', 'track', 'stats', 'recap', 'pitch', 'plan'].filter(v => { A.ui.gameView = v; A.render(); return A.ui.gameView === v; })).join(' '); };
  check('a coach: Subs · Track · Stats · Plan', allowed('jaz'), 'subs track stats plan');
  check('a tracker: Track · Stats', allowed('trk'), 'track stats');
  check('a helper: Stats · Plan', allowed('hel'), 'stats plan');
  check('a parent: Live · Stats', allowed('mum'), 'live stats');
  check('a club viewer: Live · Stats', allowed('vee'), 'live stats');
  check('the pitch is a look at Subs', segs('jaz', () => { A.ui.gameView = 'pitch'; }).join(' '), 'pitch subs');
  check('the play-by-play is a look at Stats for a coach', segs('jaz', () => { A.ui.gameView = 'live'; }).join(' '), 'live stats');
  check('— and Live itself for a parent', segs('mum', () => { A.ui.gameView = 'live'; }).join(' '), 'live live');
  as('jaz', 'game'); A.ui.matchId = 'g2'; A.ui.gameView = 'subs'; A.render();
  check('Subs offers the list and the pitch', /data-act="opengview" data-v="subs" aria-pressed="true"/.test(A.rendered()) && /data-act="opengview" data-v="pitch" aria-pressed="false"/.test(A.rendered()), true);
  A.click({ act: 'opengview', v: 'pitch' });
  check('— the pitch, pressed', A.ui.gameView + ' ' + /data-v="pitch" aria-pressed="true"/.test(A.rendered()), 'pitch true');
  A.ui.gameView = 'track'; A.render(); A.openGameScreen('subs'); A.render();
  check('— and Subs remembers the look she used last', A.ui.gameView, 'pitch');
  A.ui.gameView = 'stats'; A.render();
  check('Stats offers the numbers and the feed', /data-v="stats" aria-pressed="true"/.test(A.rendered()) && /data-v="live" aria-pressed="false">Live feed</.test(A.rendered()), true);
  A.state.matches.g2.ended = H.clock.t; A.state.matches.g2.currentHalf = 3; A.render();
  check('— the log, once it is over', /data-v="live" aria-pressed="false">Log</.test(A.rendered()), true);
  as('mum', 'game'); A.ui.matchId = 'g2'; A.ui.gameView = 'stats'; A.render();
  check('a parent has Live as a screen, so no pair on Stats', /class="chips looks"/.test(A.rendered()), false);
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
