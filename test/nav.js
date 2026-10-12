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
   - The Game tab opens the team's game being played, else the next, else the
     last, and each role lands where it works (a tracker on Track); a team
     with no games lands on Season, where Add a game is.
   - The title row says whose a screen is, with a back arrow where there is
     somewhere up to go (a tab's own screen has none); the club's name on it
     is the club switcher; the team's name is the team switcher when she can
     see more than one team.
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
  check('an admin: Notifications, the club, Training sessions, Settings, Sign out',
    ['data-v="notes"', 'data-v="club"', 'data-v="sessions"', 'data-v="setup"', 'data-act="signout"'].every(x => m.includes(x)), true);
  check('— one Settings, never People or Club details beside it (build 143)', /data-v="people"|data-v="admin"/.test(m) + ' ' + (m.match(/data-v="setup"/g) || []).length, 'false 1');
  check('— which says it has the club in it', /<b>Settings<\/b>[\s\S]*?the club: people, registrations, fields/.test(m), true);
  check('— no My players: she has nobody', has(/data-v="mine"/, m), false);
  as('jaz'); m = more();
  check('a coach: Settings, which names People, and no Club details', has(/data-v="setup"/, m) + ' ' + has(/<b>Settings<\/b>[\s\S]*?people/, m) + ' ' + has(/data-v="admin"/, m), 'true true false');
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
