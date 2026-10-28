/* Two doors, one app (DOORS.md; the owner, 2026-10-20).

   Teams is the season (teams, games, practices, the Scheduler) and Sessions
   the business (1-1s, groups, booking, fees, hours, fields). A door is a
   mode the phone remembers, never a role; the screen decides it where a
   screen names one, and the remembered door decides the shared screens.
   What is easy to get quietly wrong, pinned here:

   - Who has which door: everyone with sessions (an admin, a coach, a
     family) has both; a tracker, a helper, a club viewer, a fan and a
     player with her own sign-in have Teams alone, no switch, and a tap at
     the other door is refused in the handler.
   - Where each starts: a family whose only children are on no team opens
     in Sessions; everyone else in Teams.
   - The same bar for everyone inside a door (UX-REVIEW-2.md, 9.1, amended):
     Home · Calendar · Game · Messages · More in Teams, Home · Calendar ·
     Sessions · Messages · More in Sessions, the same ids for every role.
   - The screen decides the door: a session screen switches to Sessions, a
     team's or a game's to Teams; the Calendar, Messages, Settings and More
     keep the remembered door, through a reload.
   - Calendar and Messages are one screen, the same in both doors.
   - Sessions Home by role: a family's next session and what she can book,
     with no other child's name; a coach's asks, sessions, times and hours;
     an admin's across the club.
   - A locked device draws no door, no switch and no bar. */

const H = require('./harness');
const { check } = H;

const A = H.loadApp({ storage: { 'sm.workspace': 'CLUB' }, config: { apiKey: 'k', databaseURL: 'https://x.test' } });
const at = (d, hhmm) => { const [y, m, dd] = d.split('-').map(Number); const [h, mi] = hhmm.split(':').map(Number); return new Date(y, m - 1, dd, h, mi).getTime(); };
H.clock.set(at('2026-09-12', '10:00'));
const TODAY = A.todayStr();
const day = n => A.addDays(TODAY, n);

const ROSA = 'Rosa Delgado', ELLA = 'Ella Fitzgerald', MIA = 'Mia Kowalski', NELL = 'Nell Okafor', QUINN = 'Quinn Baptiste';
const club = () => ({
  teams: {
    t1: {
      id: 't1', name: 'G14 Flight', birthYear: 2012,
      players: {
        p1: { id: 'p1', name: ROSA, number: '7', guardians: { mum: true } },
        p2: { id: 'p2', name: ELLA, number: '9', fans: { nan: true }, self: { kid: true } },
        p3: { id: 'p3', name: QUINN, number: '4' }
      },
      events: { e1: { id: 'e1', kind: 'practice', title: 'Practice', date: '2026-09-15', start: '18:00', end: '19:00' } }
    },
    t2: { id: 't2', name: 'G12 Storm', birthYear: 2014, players: { k1: { id: 'k1', name: MIA, number: '4', guardians: { jaz: true } } } }
  },
  matches: {
    g2: { id: 'g2', teamId: 't1', opponent: 'Northgate', date: '2026-09-19', kickoff: '09:30', periodCount: 2, periodMinutes: 40, currentHalf: 1, periods: {}, stints: {} }
  },
  // Nell is in the club on no team (placed by a sessions program), and Lou is her family: the person the Sessions door is for
  children: { c1: { id: 'c1', first: 'Nell', last: 'Okafor', club: true, born: '2013-04-02', gender: 'F', confirmed: 1, family: { lou: true } } },
  access: {
    org: { name: 'Lakeside SC' },
    admins: { boss: true }, viewers: { vee: true },
    teams: { t1: { coaches: { jaz: true }, trackers: { trk: true }, helpers: { hel: true } }, t2: { coaches: { other: true } } },
    coachIndex: { jaz: 't1', other: 't2' },
    index: { boss: true, jaz: true, trk: true, hel: true, mum: true, nan: true, kid: true, vee: true, other: true, lou: true },
    members: { boss: { name: 'Ada' }, jaz: { name: 'Jaz' }, mum: { name: 'Mo' }, lou: { name: 'Lou' } }
  }
});
// a database, so the club has messages (msgTeams() wants one, and an admin)
A.fb = { db: {}, ref: (db, p) => p, set: () => Promise.resolve(), remove: () => Promise.resolve() };
const ROLES = { boss: 'an admin', jaz: 'a coach', trk: 'a tracker', hel: 'a helper', vee: 'a club viewer', mum: 'a parent', nan: 'a fan', kid: 'a player with her own sign-in', lou: 'a family with a child on no team' };
const EVERYONE = Object.keys(ROLES);
const BOTH = ['boss', 'jaz', 'mum', 'lou'], TEAMS_ONLY = ['trk', 'hel', 'vee', 'nan', 'kid'];

function sessions() {
  A.sess = { sessions: {}, booked: {}, came: {}, fees: {}, pay: {}, splans: {}, avail: {}, dirty: {} };
  A.sessLoaded.add('fees');   // the club has answered for fees, so what is owed can be counted
  // a group Jaz runs, with Nell booked and Quinn too; another open to ask for; one past this month
  A.sess.sessions.s1 = { id: 's1', kind: 'group', title: 'Finishing', coach: 'jaz', coachName: 'Jaz', date: day(2), start: '17:00', end: '18:00', cap: 6, price: 20, open: true, place: 'Hill End', ages: [11, 14] };
  A.sess.booked.s1 = { c1: { child: true, st: 'in', by: 'jaz', at: 1 }, p3: { tid: 't1', st: 'in', by: 'jaz', at: 1 }, p1: { tid: 't1', st: 'asked', by: 'mum', at: 1, want: 'weak foot' } };
  A.sess.sessions.s2 = { id: 's2', kind: 'one', coach: 'jaz', coachName: 'Jaz', date: day(5), start: '16:00', end: '17:00', cap: 1, price: 0, open: true, place: 'Hill End' };
  A.sess.sessions.s0 = { id: 's0', kind: 'one', coach: 'jaz', coachName: 'Jaz', date: day(-3), start: '16:00', end: '17:00', cap: 1, price: 0, open: false, place: 'Hill End' };
  A.sess.booked.s0 = { p3: { tid: 't1', st: 'in', by: 'jaz', at: 1 } };
}
function as(uid, view = 'season', door = null) {
  A.state = club();
  sessions();
  A.me = uid ? { uid, name: uid, email: uid + '@x.test' } : null;
  A.appOwners = {};
  A.ui.teamId = 't1'; A.ui.matchId = null; A.ui.view = view; A.ui.gameFrom = null; A.ui.editFid = null; A.ui.thread = null; A.ui.sess = null; A.ui.door = door;
  A.toasts.length = 0;
  A.closeSheet();
  A.render();
}
const page = () => A.rendered();
const bar = () => A.rendered('#tabbar');
const tabs = () => [...bar().matchAll(/data-tab="(\w+)"/g)].map(m => m[1]).join(' ');
const lit = () => (bar().match(/data-tab="(\w+)" aria-current="true"/) || [])[1] || null;
const title = () => A.rendered('#titlebar');
const sheet = () => String(A.dom.node('#sheet').innerHTML || '');
const more = () => { A.click({ act: 'tab', tab: 'more' }); const h = sheet(); A.closeSheet(); return h; };
const TEAMS_BAR = 'home calendar game messages more', SESS_BAR = 'home calendar sessions messages more';
const savedDoor = () => (JSON.parse(A.storage.getItem('sm.ui.v1') || '{}') || {}).door || null;

console.log('--- who has which door, and where each starts ---');
{
  for (const uid of EVERYONE) {
    as(uid);
    check(`${ROLES[uid]}: ${BOTH.includes(uid) ? 'both doors' : 'Teams alone'}`, A.hasDoor('teams') + ' ' + A.hasDoor('sessions'), BOTH.includes(uid) ? 'true true' : 'true false');
  }
  check('where each starts: a family whose only child is on no team in Sessions, everyone else in Teams', EVERYONE.map(u => { as(u); return u + ':' + A.defaultDoor(); }).join(' '), 'boss:teams jaz:teams trk:teams hel:teams vee:teams mum:teams nan:teams kid:teams lou:sessions');
  as('lou'); A.ui.door = null; A.landHome = true; A.landNow();
  check('— so the app opened with no address lands her on the Sessions Home', A.ui.view, 'shome');
  as('mum'); A.ui.door = null; A.landHome = true; A.landNow();
  check('— and a parent with a child on a team on her child\'s team', A.ui.view, 'season');
  A.state.teams.t2.players.k1.guardians = { mum: true }; A.state.children.c1.family = { mum: true };
  check('— a child on a team and another on none: Teams, where the team is', A.defaultDoor(), 'teams');
  as(null);
  check('signed out of a club with an admin: no bar, no title, no door', bar() + title(), '');
}

console.log('\n--- the same bar for everyone inside a door ---');
{
  // Lou has Messages too: her child is in Jaz's session, so she may write to Jaz (DOORS.md, Messages: people, not teams)
  for (const uid of EVERYONE) { as(uid); check(`${ROLES[uid]} in Teams: ${TEAMS_BAR}`, tabs(), uid === 'vee' ? TEAMS_BAR.replace(' messages', '') : TEAMS_BAR); }
  for (const uid of BOTH) { as(uid, 'sessions'); check(`${ROLES[uid]} in Sessions: ${SESS_BAR}`, tabs(), SESS_BAR); }
  as('jaz', 'sessions');
  check('— the same ids and labels, so one tap sequence is true on every phone', A.navTabs().map(t => t.id + ':' + t.label).join(' '), 'home:Home calendar:Calendar sessions:Sessions messages:Messages more:More');
  check('— the Sessions tab is lit on the list', lit(), 'sessions');
  A.click({ act: 'tab', tab: 'home' });
  check('— Home in the Sessions door is the Sessions Home', A.ui.view + ' ' + lit(), 'shome home');
  check('— titled Home, over the club, and the club line says which door', /class="tbtitle"><span>Home<\/span>/.test(title()) && /<span>Sessions · Lakeside SC<\/span>/.test(title()), true);
  check('— a tab\'s own screen: no back arrow', /tbback/.test(title()), false);
  A.click({ act: 'tab', tab: 'sessions' });
  check('— the Sessions tab opens the list', A.ui.view + ' ' + A.ui.sess.tab, 'sessions list');
  A.click({ act: 'sesstab', k: 'fees' });
  check('— Session fees is Settings\' screen: More is lit and Back goes to Settings', lit() + ' ' + A.upView(), 'more setup');
  // before the club has been read the screen waits (a link opened cold), told in words, and the bar is Teams: she has no Sessions door
  as('trk', 'sessions');
  check('a tracker sent to the Sessions screen is told it is not hers, in Teams, with the Teams bar', /Sessions are for coaches, admins and families/.test(page()) + ' ' + A.curDoor() + ' ' + tabs(), 'true teams ' + TEAMS_BAR);
  as('trk', 'shome');
  check('— and the Sessions Home the same way', /Sessions are for coaches, admins and families/.test(page()) + ' ' + A.curDoor(), 'true teams');
  as('trk'); A.click({ act: 'tab', tab: 'sessions' });
  check('— a tap at the Sessions tab is refused in the handler', A.lastToast(), 'Sessions are for coaches, admins and families');
}

console.log('\n--- the screen decides the door; the shared screens keep it ---');
{
  as('jaz', 'sessions');
  check('a session screen puts her in the Sessions door', A.curDoor() + ' ' + savedDoor(), 'sessions sessions');
  A.ui.view = 'calendar'; A.render();
  check('the Calendar keeps the door she was in', A.curDoor() + ' ' + tabs(), 'sessions ' + SESS_BAR);
  A.ui.view = 'inbox'; A.render();
  check('— so does Messages', A.curDoor(), 'sessions');
  A.ui.view = 'setup'; A.render();
  check('— and Settings, whose Back goes to the door\'s Home', A.curDoor() + ' ' + A.upView(), 'sessions shome');
  A.ui.view = 'season'; A.render();
  check('a team\'s screen puts her in Teams', A.curDoor() + ' ' + tabs(), 'teams ' + TEAMS_BAR);
  A.ui.view = 'calendar'; A.render();
  check('— and the Calendar now keeps Teams', A.curDoor(), 'teams');
  as('jaz', 'sessions'); A.ui.view = 'game'; A.ui.matchId = 'g2'; A.render();
  check('a game puts her in Teams', A.curDoor(), 'teams');
  as('boss', 'sessions'); A.ui.view = 'scheduler'; A.render();
  check('the Scheduler is Teams', A.curDoor(), 'teams');
  as('boss', 'sessions'); A.ui.view = 'club'; A.render();
  check('Club home is Teams', A.curDoor(), 'teams');
  // a reload: ui comes back from the phone, door included
  as('jaz', 'sessions'); A.ui.view = 'calendar'; A.render();
  const kept = JSON.parse(A.storage.getItem('sm.ui.v1'));
  A.ui.door = null; Object.assign(A.ui, kept); A.render();
  check('the door survives a reload with the rest of the screen', A.curDoor() + ' ' + A.ui.view, 'sessions calendar');
  as('jaz', 'calendar', 'sessions');
  A.state.access.teams.t1.coaches = {}; A.state.access.coachIndex = {}; A.state.teams.t2.players.k1.guardians = {}; A.render();
  check('a door she no longer has is let go: Teams', A.curDoor() + ' ' + tabs(), 'teams home calendar game more');
}

console.log('\n--- the shared screens are the same in both doors ---');
{
  for (const [v, name] of [['calendar', 'the Calendar'], ['inbox', 'Messages']]) {
    as('jaz', v, 'teams'); const inTeams = page();
    as('jaz', v, 'sessions'); const inSess = page();
    check(`${name} is one screen, drawn the same in both doors`, inTeams === inSess && A.curDoor() === 'sessions', true);
  }
  // Settings is one screen too, but its club rows are the door's (the owner, 2026-10-25), and You and About are the same
  as('jaz', 'setup', 'teams'); const setT = page();
  as('jaz', 'setup', 'sessions'); const setS = page();
  check('Settings keeps the door she was in, and draws a different club section in each', A.curDoor() + ' ' + (setT !== setS), 'sessions true');
  const noSwitch = h => h.replace(/<button class="tbdoor"[\s\S]*?<\/button>/, '');
  as('mum', 'calendar', 'teams'); const t = title(); as('mum', 'calendar', 'sessions');
  check('— and titled the same, only the switch naming the other door', noSwitch(title()) === noSwitch(t) && /data-d="teams"/.test(title()) && /data-d="sessions"/.test(t), true);
  // the account sheet is the account alone, the same in both doors
  as('jaz', 'season'); A.click({ act: 'accountsheet' }); const acT = sheet(); A.closeSheet();
  as('jaz', 'sessions'); A.click({ act: 'accountsheet' }); const acS = sheet(); A.closeSheet();
  check('the account sheet is the same in both doors', acT === acS, true);
}

console.log('\n--- Settings, by door (the owner, 2026-10-25) ---');
{
  const acts = h => new Set([...h.matchAll(/data-act="(\w+)"(?: data-(?:v|k|d)="([^"]*)")?/g)].map(m => m[2] ? m[1] + ':' + m[2] : m[1]));
  as('boss', 'setup', 'teams'); let a = acts(page());
  check('an admin in Teams: the season\'s club rows', ['goview:admin', 'goview:people', 'goview:usage', 'scheduler', 'sesstab:fields', 'goview:comply', 'clubdrills', 'tpllist:clubTpl', 'bulkimport'].every(x => a.has(x)), true);
  check('— and no registrations, fees or hours', ['goview:regs', 'sesstab:fees', 'sesstab:hours'].some(x => a.has(x)), false);
  check('— the club section says whose', /<h2 class="sechead">Club · Teams<\/h2>/.test(page()), true);
  check('— one row to the Sessions settings', a.has('door:sessions') && /Sessions settings/.test(page()), true);
  A.click({ act: 'door', d: 'sessions', v: 'setup' });
  a = acts(page());
  check('— which stays on Settings, now in Sessions', A.ui.view + ' ' + A.curDoor(), 'setup sessions');
  check('an admin in Sessions: registrations, fields, fees, hours, people, the club', ['goview:admin', 'goview:people', 'goview:usage', 'goview:regs', 'sesstab:fields', 'sesstab:fees', 'sesstab:hours', 'bulkimport'].every(x => a.has(x)), true);
  check('— and none of the season\'s: no Scheduler, compliance, club drills or a team\'s set-up', ['scheduler', 'goview:comply', 'clubdrills', 'tpllist:clubTpl', 'formations', 'trackcfg', 'sharesheet'].some(x => a.has(x)) || /This team/.test(page()), false);
  check('— and a row back to the Teams settings', a.has('door:teams'), true);
  A.click({ act: 'goview', v: 'regs' });
  check('Registrations are the Sessions door\'s, and Back goes to its Settings', A.curDoor() + ' ' + A.upView(), 'sessions setup');
  as('boss', 'setup', 'teams'); A.click({ act: 'sesstab', k: 'fields' });
  check('Fields from the Teams settings stays in Teams', A.ui.view + ' ' + A.curDoor(), 'sessions teams');
  as('boss', 'setup', 'sessions'); A.click({ act: 'sesstab', k: 'fields' });
  check('— and from the Sessions settings stays in Sessions', A.curDoor(), 'sessions');
  as('trk', 'setup');
  check('a tracker, with one door: a plain Settings, no switch', /data-act="door"/.test(page()), false);
  as('mum', 'setup', 'sessions');
  check('a family in Sessions: nothing of the club to set, no switch row', /Club ·|data-act="door"[^>]*data-v="setup"/.test(page()), false);
}

console.log('\n--- the switch ---');
{
  as('jaz');
  let m = more();
  check('More in Teams offers the Sessions door, with its icon, and no Sessions row of the old kind', /data-act="door" data-d="sessions"[\s\S]*?<span class="dooric"><svg/.test(m) && !/data-v="sessions"/.test(m), true);
  check('— and still the Teams door\'s rows: All teams for an admin, Drills for a coach', /data-act="moredrills"/.test(m) && !/data-d="teams"/.test(m), true);
  A.click({ act: 'door', d: 'sessions' });
  check('tapping it goes to the Sessions Home and remembers the door', A.ui.view + ' ' + A.curDoor() + ' ' + savedDoor(), 'shome sessions sessions');
  m = more();
  check('More in Sessions offers Teams, with the club\'s session screens, and no Drills or All teams', /data-act="door" data-d="teams"/.test(m) && ['fields', 'fees', 'hours'].every(k => m.includes(`data-act="sesstab" data-k="${k}"`)) && !/moredrills|data-act="schedule"/.test(m), true);
  A.click({ act: 'door', d: 'teams' });
  check('— and back to the team\'s Home in Teams', A.ui.view + ' ' + A.curDoor(), 'season teams');
  as('boss'); m = more();
  check('an admin keeps All teams in Teams', /data-act="schedule"/.test(m), true);
  as('boss', 'shome'); m = more();
  check('— and in Sessions gets Fields, Session fees and Coach hours', (m.match(/data-act="sesstab"/g) || []).length, 3);
  as('mum', 'shome'); m = more();
  check('a family in Sessions: Teams, Settings, no club screens', /data-d="teams"/.test(m) && !/sesstab/.test(m), true);
  for (const uid of TEAMS_ONLY) {
    as(uid); m = more();
    const before = A.ui.view;
    A.click({ act: 'door', d: 'sessions' });
    check(`${ROLES[uid]}: no door on More, and a tap at it refused in the handler`, !/data-act="door"/.test(m) && A.lastToast() === 'Sessions are for coaches, admins and families' && A.ui.view === before, true);
  }
  as('lou'); A.ui.door = 'teams'; A.render();
  check('a family of a child on no team, in Teams: Home says so and offers Sessions', /<h2>No team yet<\/h2>/.test(page()) && /Nell is in the club and not on a team/.test(page()) && /data-act="door" data-d="sessions"/.test(page()), true);
  check('— naming no other child', new RegExp([ROSA, ELLA, MIA, QUINN].join('|')).test(page()), false);
  as('boss', 'club');
  check('Club home\'s Sessions card opens the Sessions Home', /data-act="goview" data-v="shome"/.test(page()), true);
}

console.log('\n--- the Sessions Home, by role ---');
{
  as('lou', 'shome');
  check('a family: her child\'s next session as the next-up card, with her child\'s standing', /<span class="muted">Next session<\/span>/.test(page()) && /Finishing/.test(page()) && /Nell: booked/.test(page()), true);
  check('— Directions and Add to your calendar on it, a tap opening the session', /data-act="sessopen" data-id="s1"/.test(page()) && /data-act="sessics" data-id="s1"/.test(page()), true);
  check('— then what she can book, and what she owes', /Book a session|Open to ask for/.test(page()) && /To pay/.test(page()) && /\$20/.test(page()), true);
  check('— and no other child\'s name, nor the coach\'s list', new RegExp([ROSA, ELLA, MIA, QUINN].join('|')).test(page()) || /Asking for a spot|New session/.test(page()), false);
  as('jaz', 'shome');
  check('a coach: her next session, who is asking, what is coming, New session and Offer a time', /<span class="muted">Your next session<\/span>/.test(page()) && /Asking for a spot/.test(page()) && new RegExp(ROSA).test(page()) && /wants: weak foot/.test(page()) && /<h2[^>]*>Coming up<\/h2>/.test(page()) && /data-act="sessnew"/.test(page()) && /data-act="availnew"/.test(page()), true);
  check('— and her month\'s hours, from the session that was run', /September 2026/.test(page()) && /1 session · 1h/.test(page()), true);
  check('— her own child is not drawn as a family\'s card (she is staff with a daughter elsewhere): no To pay', /To pay/.test(page()), false);
  as('boss', 'shome');
  check('an admin: the club\'s next session, and what families still owe', /Next session in the club/.test(page()) && /\$40<\/b> still to be paid/.test(page()), true);
  as('mum', 'shome');
  check('a parent whose child asked: the ask as her next session, said as asked', /<span class="muted">Next session<\/span>/.test(page()) && /Rosa: asked/.test(page()), true);
  check('— and nothing of Nell or Quinn', /Nell|Quinn/.test(page()), false);
  as('jaz', 'shome'); A.sess.sessions = {}; A.sess.booked = {}; A.render();
  check('nothing coming up says so, and still offers New session', /Nothing of yours coming up/.test(page()) && /data-act="sessnew"/.test(page()), true);
}

console.log('\n--- addresses ---');
{
  as('jaz', 'shome');
  check('the Sessions Home is #/sessions', A.uiToHash(), '#/sessions');
  global.location.hash = '#/sessions'; A.ui.view = 'season';
  check('— and #/sessions opens it, in the Sessions door', A.hashToUi() && A.ui.view + ' ' + (A.render(), A.curDoor()), 'shome sessions');
  global.location.hash = '#/training'; A.hashToUi();
  check('#/training stays the list of sessions', A.ui.view + ' ' + A.ui.sess.tab, 'sessions list');
  global.location.hash = '#/team/t1/season'; A.hashToUi(); A.render();
  check('a team\'s address opens in Teams, whatever door she was in', A.curDoor(), 'teams');
  global.location.hash = '';
  as('trk', 'season'); global.location.hash = '#/sessions'; A.hashToUi(); A.render();
  check('a tracker following #/sessions is in Teams, told in words', A.curDoor() + ' ' + /Sessions are for coaches, admins and families/.test(page()), 'teams true');
  global.location.hash = '';
}

H.summary('two doors, Teams and Sessions');
