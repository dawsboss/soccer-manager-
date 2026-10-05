/* Alerts from every club. AVAILABILITY.md, "Alerts from every club", is the
   design. What is easy to get quietly wrong, and so is pinned here:

   - A phone in two clubs hears a family's message in the club that isn't
     open, as well as in the one that is: it pops up, sits in a bar over
     whatever is on screen (a game included), counts on the bell, and Open
     switches to that club and lands on the conversation.
   - A game or practice of hers called off, back on, moved or new, in any
     club, is an alert the same way; a weekly series is one. Open goes to the
     game, or to the team's calendar, here without a reload and in another
     club by switching to it.
   - The first look at a club, or at a conversation, is not news: opening the
     app never fires a week of alerts. A change this phone made itself isn't
     news either, and an admin hears the open club's changes from club
     activity, not twice.
   - Each club is listened to as its own inbox would: a coach every family's
     conversation on her team, a family only her own.
   - Dismiss takes the bar away; the inbox keeps the list and reads them.
   - Signing out forgets them. */

const H = require('./harness');
const { check } = H;
const { makeFakebase } = require('./fakebase');

const CONFIG = { apiKey: 'k', databaseURL: 'https://prod.example', projectId: 'p' };

const club = (extra = {}) => ({
  teams: {
    t1: {
      id: 't1', name: 'G11 Flight', events: extra.events || {},
      players: { p1: { id: 'p1', name: 'Rosa Smith', number: '2', active: true, guardians: { mum: true } } }
    }
  },
  matches: extra.matches || {},
  access: {
    org: { name: 'Lakeside SC' },
    admins: { boss: true },
    index: { boss: true, jaz: true, mum: true },
    members: { boss: { name: 'Ada' }, jaz: { name: 'Jaz' }, mum: { name: 'Mo' } },
    teams: { t1: { coaches: { jaz: true } } },
    coachIndex: { jaz: 't1' }
  }
});
/* Hillside: Jaz coaches h1, and Pat's child Kai is on it. */
const hill = {
  teams: (g = {}) => ({ h1: { id: 'h1', name: 'Hill U12', events: g.events || {}, players: { k: { id: 'k', name: 'Kai Jones', guardians: { pat: true } } } } }),
  access: { org: { name: 'Hillside FC' }, admins: { hadm: true }, teams: { h1: { coaches: { jaz: true } } }, index: { jaz: true, pat: true, hadm: true } }
};

async function boot(who, orgs, ws = club()) {
  const fbk = makeFakebase();
  const D = H.loadApp({ firebase: fbk, config: CONFIG, storage: { 'sm.workspace': 'CLUB' } });
  await D.flush(); fbk.signIn(who, { name: who }); await D.flush();
  fbk.deliver('workspaces/CLUB', ws); await D.flush();
  fbk.deliver('userOrgs/' + who, orgs); await D.flush();
  return { D, fbk };
}
async function hillAnswers(D, fbk, { matches = {}, events = {} } = {}) {
  fbk.deliver('workspaces/HILL/teams', hill.teams({ events }));
  fbk.deliver('workspaces/HILL/matches', matches);
  fbk.deliver('workspaces/HILL/access', hill.access);
  for (const p of ['sessions', 'booked', 'avail']) fbk.deliver('training/HILL/' + p, {});
  await D.flush(); D.render(); await D.flush();
}
const bar = D => D.alertBar();
// what another phone's change looks like once it has reached this one (as test/news.js does it)
const arrive = (D, c) => { D.state.teams = c.teams; D.state.matches = c.matches; D.render(); };
const ORGS = { CLUB: { name: 'Lakeside SC', at: 1 }, HILL: { name: 'Hillside', at: 2 } };

(async () => {
  let day;
  {
    const { D } = await boot('jaz', ORGS);
    day = n => D.addDays(D.todayStr(), n);
  }
  const game = (extra = {}) => ({ g1: { id: 'g1', teamId: 'h1', opponent: 'Storm', date: day(2), kickoff: '10:00', periodCount: 2, periodMinutes: 30, ...extra } });

  console.log('--- a family writes in the club that isn\'t open ---');
  {
    const { D, fbk } = await boot('jaz', ORGS);
    await hillAnswers(D, fbk, { matches: game() });
    check('a coach listens to every family\'s conversation on her team there', fbk.watching('dm/HILL/h1'), true);
    check('and its notices', fbk.watching('board/HILL/h1'), true);
    fbk.deliver('dm/HILL/h1', { pat: { m: { m1: { by: 'pat', byName: 'Pat', text: 'Old news', at: 1 } } } }); await D.flush();
    check('what was already there is not news', D.alertsList().length, 0);
    check('but it counts on the bell, unread', D.elseUnread(), 1);
    D.ui.view = 'game'; D.render();
    D.toasts.length = 0;
    fbk.deliver('dm/HILL/h1', { pat: { m: { m1: { by: 'pat', byName: 'Pat', text: 'Old news', at: 1 }, m2: { by: 'pat', byName: 'Pat', text: 'Kai is sick today', at: 2 } } } }); await D.flush();
    const a = D.alertsList()[0];
    check('a new one is', a && a.title, 'Pat · Hill U12');
    check('it pops up, naming the club', /^Hillside FC · Pat · Hill U12 · Kai is sick today/.test(D.toasts.join('|')), true);
    check('and waits over the screen she is on', /Kai is sick today/.test(bar(D)) && /Open in Hillside FC/.test(bar(D)), true);
    check('drawn on the game screen too', /alertbar/.test(D.rendered()), true);
    check('still one unread conversation, however many are waiting', D.elseUnread(), 1);
    D.click({ act: 'alertgo', id: a.id });
    check('Open switches to that club', D.storage.getItem('sm.workspace'), 'HILL');
    check('and lands on the conversation', String(D.dom.replaced || ''), '/#/messages/h1/pat');
    check('by reloading into it', D.dom.reloads, 1);
    check('read now', D.alertsList()[0].read, true);
  }

  console.log('\n--- a family\'s phone in two clubs ---');
  {
    const { D, fbk } = await boot('pat', ORGS);
    await hillAnswers(D, fbk);
    check('her own conversation only', fbk.watching('dm/HILL/h1/pat') && !fbk.watching('dm/HILL/h1'), true);
    check('and her child\'s team\'s notices', fbk.watching('board/HILL/h1'), true);
    fbk.deliver('board/HILL/h1', {}); await D.flush();
    fbk.deliver('board/HILL/h1', { n1: { by: 'jaz', byName: 'Jaz', text: 'Pitch is waterlogged', urgent: true, at: 3 } }); await D.flush();
    check('a notice reaches her', D.alertsList().map(x => x.title).join(), 'Urgent · Hill U12 · Jaz');
    check('urgent is drawn as such', /rolebar warn alertbar/.test(bar(D)), true);
    D.click({ act: 'alertx', id: D.alertsList()[0].id });
    check('Dismiss takes the bar away', bar(D), '');
    check('the inbox keeps it', (D.ui.view = 'inbox', D.render(), /From all your clubs[\s\S]*Pitch is waterlogged/.test(D.rendered())), true);
  }

  console.log('\n--- her calendar, in every club ---');
  {
    const { D, fbk } = await boot('jaz', ORGS, club({ events: { e1: { id: 'e1', kind: 'practice', title: 'Practice', date: day(3), start: '17:00', end: '18:00' } } }));
    await hillAnswers(D, fbk, { matches: game() });
    check('the first look at each club is not news', D.alertsList().length, 0);
    D.ui.view = 'game'; D.render();
    fbk.deliver('workspaces/HILL/matches', game({ called: 'cancelled' })); await D.flush(); D.render();
    const a = D.alertsList()[0];
    check('a game called off in the other club is', a && a.title, 'Cancelled: v Storm (Hill U12)');
    check('urgent, over the game she is looking at', a.urgent && /Cancelled: v Storm/.test(bar(D)), true);
    check('on the bell', D.unreadCount() >= 1, true);
    check('once', (D.render(), D.alertsList().length), 1);
    fbk.deliver('workspaces/HILL/matches', game()); await D.flush(); D.render();
    check('back on', D.alertsList()[0].title, 'Back on: v Storm (Hill U12)');
    fbk.deliver('workspaces/HILL/matches', game({ date: day(4) })); await D.flush(); D.render();
    check('moved', D.alertsList()[0].title + ' ' + D.alertsList()[0].body.startsWith('Now '), 'Moved: v Storm (Hill U12) true');
    const wk = {};
    for (const n of [5, 12, 19]) wk['w' + n] = { id: 'w' + n, kind: 'practice', title: 'Practice', date: day(n), start: '18:00', series: 'S1' };
    fbk.deliver('workspaces/HILL/teams', hill.teams({ events: wk })); await D.flush(); D.render();
    check('a weekly practice is one alert', D.alertsList()[0].title + ' · ' + D.alertsList()[0].body.split(',')[0], 'New practices: Practice (Hill U12) · 3 of them');
    const g = D.alertsList().find(x => x.title.startsWith('Moved'));
    D.click({ act: 'alertgo', id: g.id });
    check('Open goes to the game, in its club', D.storage.getItem('sm.workspace') + ' ' + D.dom.replaced, 'HILL /#/team/h1/game/g1/live');

    console.log('\n--- in the club that is open ---');
    D.storage.setItem('sm.workspace', 'CLUB');
    const before = D.dom.reloads || 0;
    arrive(D, club({ events: { e1: { id: 'e1', kind: 'practice', title: 'Practice', date: day(3), start: '17:00', end: '18:00', called: 'cancelled' } } }));
    const c = D.alertsList()[0];
    check('a practice of hers called off by another phone', c && c.title, 'Cancelled: Practice (G11 Flight)');
    check('says no club, it is this one', /Open in/.test(bar(D)), false);
    D.click({ act: 'alertgo', id: c.id });
    check('Open goes to the team\'s calendar here, with no reload', D.ui.view + ' ' + D.ui.teamId + ' ' + ((D.dom.reloads || 0) - before), 'calendar t1 0');
    D.noteMine('teams/t1/events/e1');
    arrive(D, club({ events: { e1: { id: 'e1', kind: 'practice', title: 'Practice', date: day(3), start: '17:00', end: '18:00' } } }));
    check('one this phone made itself is not news', D.alertsList()[0].id, c.id);

    console.log('\n--- signing out ---');
    check('kept for the inbox', !!D.storage.getItem('sm.alerts.v1:jaz'), true);
    fbk.signOut(); await D.flush();
    check('forgotten when she signs out', D.storage.getItem('sm.alerts.v1:jaz'), null);
  }

  console.log('\n--- an admin of the open club ---');
  {
    const { D, fbk } = await boot('boss', { CLUB: { name: 'Lakeside SC', at: 1 } }, club({ events: { e1: { id: 'e1', kind: 'practice', title: 'Practice', date: day(3), start: '17:00' } } }));
    D.render();
    arrive(D, club({ events: { e1: { id: 'e1', kind: 'practice', title: 'Practice', date: day(3), start: '17:00', called: 'cancelled' } } }));
    check('hears it once, from club activity, not twice', D.alertsList().length, 0);
  }

  H.summary('alerts from every club');
})();
