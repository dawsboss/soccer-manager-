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
  await fbk.serveClub('CLUB', ws, D.flush); await D.flush();
  fbk.deliver('userOrgs/' + who, orgs); await D.flush();
  return { D, fbk };
}
async function hillAnswers(D, fbk, { matches = {}, events = {} } = {}) {
  await fbk.serveClub('HILL', { access: hill.access, teams: hill.teams({ events }), matches }, D.flush);
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
    check('Messages keeps it, under her other clubs', (D.ui.view = 'inbox', D.render(), /From your other clubs[\s\S]*Pitch is waterlogged/.test(D.rendered())), true);
    // UX-REVIEW-3.md, 17.1: a family has no What's new; its old address is Messages, whose Changes card is calendar changes only
    D.ui.view = 'notes'; D.render();
    check('her old What\'s new address is Messages now', D.ui.view, 'inbox');
    check('and a message is not a change', /<h2[^>]*>Changes<\/h2>/.test(D.rendered()), false);
  }

  console.log('\n--- a family\'s changes are on Messages (UX-REVIEW-3.md, 17.1) ---');
  {
    const ev = (extra = {}) => club({ events: { e1: { id: 'e1', kind: 'practice', title: 'Practice', date: day(3), start: '17:00', end: '18:00', ...extra } } });
    const { D, fbk } = await boot('mum', { CLUB: { name: 'Lakeside SC', at: 1 } }, ev());
    D.render();
    check('a parent has changes in Messages, not in What\'s new', D.changesInMessages(), true);
    check('nothing yet, so no card', /<h2[^>]*>Changes<\/h2>/.test((D.ui.view = 'inbox', D.render(), D.rendered())), false);
    arrive(D, ev({ called: 'cancelled' }));
    const a = D.alertsList().find(x => x.kind === 'cal');
    check('a practice called off is a change', a && a.title, 'Cancelled: Practice (G11 Flight)');
    D.ui.view = 'season'; D.render();
    check('counted on the Messages tab', D.dom.node('#tabMsgN').textContent, '1');
    check('and not on More', D.dom.node('#tabMoreN').textContent, '');
    check('the total is the same: one thing new', D.unreadCount(), 1);
    D.sheetMore();
    check('More has no What\'s new for her', /What's new/.test(String(D.dom.node('#sheet').innerHTML)), false);
    D.closeSheet();
    D.ui.view = 'inbox'; D.render();
    const html = D.rendered();
    check('Messages leads with a Changes card', /<h2[^>]*>Changes<\/h2>[\s\S]*Cancelled: Practice \(G11 Flight\)/.test(html) && html.indexOf('>Changes<') < html.indexOf('>Conversations<'), true);
    check('one row, unread until she looked', /• Cancelled: Practice/.test(html), true);
    check('opening Messages reads it', D.alertsList().find(x => x.kind === 'cal').read, true);
    check('and the tab clears on that same draw', D.dom.node('#tabMsgN').textContent, '');
    check('a message is not a change, nor a change a message', /Pitch is waterlogged/.test(D.rendered()), false);
    D.ui.view = 'notes'; D.render();
    check('the old What\'s new address lands on Messages', D.ui.view, 'inbox');
    D.click({ act: 'alertgo', id: a.id });
    check('a row opens where it happened, with no reload', D.ui.view + ' ' + D.ui.teamId, 'calendar t1');
    const rows = () => { const h = D.rendered(), a = h.indexOf('>Changes<'); return a < 0 ? 0 : (h.slice(a, h.indexOf('>Conversations<')).match(/data-act="alertgo"/g) || []).length; };
    for (let i = 0; i < 5; i++) D.pushAlert({ id: 'c:CLUB:e' + i, code: 'CLUB', kind: 'cal', hash: '#/team/t1/calendar', title: 'Moved: Practice ' + i, body: 'Now' });
    D.ui.view = 'inbox'; D.ui.changesAll = false; D.render();
    check('every unread change is drawn, so the count is never more than she can see', rows(), 5);
    D.render();
    check('once read, three at most', rows() + ' ' + /Show 3 older/.test(D.rendered()), '3 true');
    D.click({ act: 'changesall' });
    check('Show older draws them all', rows(), 6);
  }
  {
    // a coach keeps What's new: club activity has no other home, and her team's changes are in it
    const { D } = await boot('jaz', { CLUB: { name: 'Lakeside SC', at: 1 } });
    D.render();
    check('a coach\'s changes are not moved', D.changesInMessages(), false);
    D.sheetMore();
    check('her More keeps What\'s new', /What's new/.test(String(D.dom.node('#sheet').innerHTML)), true);
    D.closeSheet();
  }

  console.log('\n--- her calendar, in every club ---');
  {
    const { D, fbk } = await boot('jaz', ORGS, club({ events: { e1: { id: 'e1', kind: 'practice', title: 'Practice', date: day(3), start: '17:00', end: '18:00' } } }));
    await hillAnswers(D, fbk, { matches: game() });
    check('the first look at each club is not news', D.alertsList().length, 0);
    D.ui.view = 'game'; D.render();
    fbk.deliver('orgs/HILL/matches', game({ called: 'cancelled' })); await D.flush(); D.render();
    const a = D.alertsList()[0];
    check('a game called off in the other club is', a && a.title, 'Cancelled: v Storm (Hill U12)');
    check('urgent, over the game she is looking at', a.urgent && /Cancelled: v Storm/.test(bar(D)), true);
    check('on the bell', D.unreadCount() >= 1, true);
    check('once', (D.render(), D.alertsList().length), 1);
    fbk.deliver('orgs/HILL/matches', game()); await D.flush(); D.render();
    check('back on', D.alertsList()[0].title, 'Back on: v Storm (Hill U12)');
    fbk.deliver('orgs/HILL/matches', game({ date: day(4) })); await D.flush(); D.render();
    check('moved', D.alertsList()[0].title + ' ' + D.alertsList()[0].body.startsWith('Now '), 'Moved: v Storm (Hill U12) true');
    const wk = {};
    for (const n of [5, 12, 19]) wk['w' + n] = { id: 'w' + n, kind: 'practice', title: 'Practice', date: day(n), start: '18:00', series: 'S1' };
    fbk.deliver('orgs/HILL/teams', hill.teams({ events: wk })); await D.flush(); D.render();
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

  console.log('\n--- an admin of the club that isn\'t open ---');
  {
    // her club activity is worked out from the open club alone, so a game on a team that isn't hers in another club was heard by nobody until she opened it
    const two = (g = {}) => ({ ...hill.teams(g), h2: { id: 'h2', name: 'Hill U9', events: g.h2 || {}, players: {} } });
    const ws = club(); ws.access.index.hadm = true; ws.access.index.pat = true;
    const hillTwo = async (D, fbk, matches) => {
      await fbk.serveClub('HILL', { access: hill.access, teams: two(), matches }, D.flush);
      for (const p of ['sessions', 'booked', 'avail']) fbk.deliver('training/HILL/' + p, {});
      await D.flush(); D.render(); await D.flush();
    };
    const g2 = { g2: { id: 'g2', teamId: 'h2', opponent: 'Rivers', date: day(6), kickoff: '09:00', periodCount: 2, periodMinutes: 25 } };
    const { D, fbk } = await boot('hadm', ORGS, ws);
    await hillTwo(D, fbk, game());
    check('the first look at the club is not news', D.alertsList().length, 0);
    fbk.deliver('orgs/HILL/matches', { ...game(), ...g2 }); await D.flush(); D.render();
    const a = D.alertsList()[0];
    check('a game added to any team there is', a && a.title, 'New game: v Rivers (Hill U9)');
    check('said as club activity, so the club activity switch quiets it', a && a.topic, 'news');
    check('over the screen she is on, naming the club', /Open in Hillside FC/.test(bar(D)), true);
    check('once', (D.render(), D.alertsList().length), 1);
    fbk.deliver('orgs/HILL/matches', { ...game(), g2: { ...g2.g2, called: 'cancelled' } }); await D.flush(); D.render();
    check('and called off', D.alertsList()[0].title, 'Cancelled: v Rivers (Hill U9)');
    const wk = {};
    for (const n of [5, 12]) wk['x' + n] = { id: 'x' + n, kind: 'practice', title: 'Practice', date: day(n), start: '18:00', series: 'S2' };
    fbk.deliver('orgs/HILL/teams', two({ h2: wk })); await D.flush(); D.render();
    check('a weekly practice is one', D.alertsList()[0].title, 'New practices: Practice (Hill U9)');

    const fam = await boot('pat', ORGS, ws);
    await hillTwo(fam.D, fam.fbk, game());
    fam.fbk.deliver('orgs/HILL/matches', { ...game(), ...g2 }); await fam.D.flush(); fam.D.render();
    check('a family there hears nothing of a team that isn\'t her child\'s', fam.D.alertsList().some(x => /Hill U9/.test(x.title)), false);
  }

  console.log('\n--- her inbox: everything the server told her, from every club ---');
  {
    const { D, fbk } = await boot('jaz', ORGS);
    await hillAnswers(D, fbk, { matches: game() });
    check('one listener for the whole account', fbk.watching('people/jaz/inbox'), true);
    const box = {
      'HILL~old': { title: 'Old news', body: 'Before', code: 'HILL', hash: '#/messages', topic: 'msg', at: 100 }
    };
    fbk.deliver('people/jaz/inbox', box); await D.flush(); D.render();
    check('the first look is not news', D.alertsList().length, 0);
    D.ui.view = 'game'; D.render(); D.toasts.length = 0;
    box['HILL~s1'] = { title: 'Ada', body: 'Can you cover Saturday?', code: 'HILL', hash: '#/messages/with/hadm', topic: 'msg', at: 200 };
    box['CLUB~n9'] = { title: 'G11 Flight · Ada', body: 'Here', code: 'CLUB', hash: '#/messages', topic: 'notice', at: 201 };
    box['GONE~x'] = { title: 'Not hers', code: 'GONE', hash: '#/messages', topic: 'msg', at: 202 };
    fbk.deliver('people/jaz/inbox', box); await D.flush(); D.render();
    const a = D.alertsList()[0];
    check('a colleague\'s message in the club that isn\'t open reaches her', a && a.title + ' · ' + a.body, 'Ada · Can you cover Saturday?');
    check('it pops up, naming the club', /Hillside FC · Ada/.test(D.toasts.join('|')), true);
    check('over whatever is on screen, with Open in that club', /Open in Hillside FC/.test(bar(D)), true);
    check('what is about the open club is left to the page, which hears it itself', D.alertsList().some(x => /Here/.test(x.body)), false);
    check('and a club she is not in says nothing', D.alertsList().some(x => /Not hers/.test(x.title)), false);
    fbk.deliver('people/jaz/inbox', { ...box }); await D.flush(); D.render();
    check('once', D.alertsList().length, 1);
    D.click({ act: 'alertgo', id: a.id });
    check('Open switches club and lands on the conversation', D.storage.getItem('sm.workspace') + ' ' + D.dom.replaced, 'HILL /#/messages/with/hadm');
    D.storage.setItem('sm.workspace', 'CLUB');
    box['HILL~bad'] = { title: 'Odd', code: 'HILL', hash: 'https://evil.test/', topic: 'news', at: 300 };
    fbk.deliver('people/jaz/inbox', box); await D.flush(); D.render();
    check('a link out of the app is never followed', D.alertsList()[0].hash, '#/messages');
    check('club activity is said under its own switch', D.alertsList()[0].topic + ' ' + D.alertsList()[0].kind, 'news cal');
    const n = D.alertsList().length;
    fbk.deliver('orgs/HILL/matches', game({ called: 'cancelled' })); await D.flush(); D.render();
    check('while it answers, the page\'s own guess about that club says nothing (the server says it)', D.alertsList().length, n);
  }
  {
    // a phone that was signed in before keeps its place: what came while it was closed is said
    const { D, fbk } = await boot('jaz', ORGS);
    await hillAnswers(D, fbk);
    fbk.deliver('people/jaz/inbox', { 'HILL~a': { title: 'A', code: 'HILL', hash: '#/messages', topic: 'msg', at: 100 } }); await D.flush();
    const kept = D.storage.getItem('sm.alerts.v1:jaz');
    check('where she had read up to is kept on the phone', JSON.parse(kept).inboxAt, 100);
  }

  H.summary('alerts from every club');
})();
