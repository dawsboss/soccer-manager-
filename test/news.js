/* Club activity: what an admin hears without going to look.

   Pinned here, because each is easy to get quietly wrong:

   - The first look tells nobody anything, and a source that hasn't loaded
     isn't read as everything deleted.
   - New, moved, called off, back on and deleted practices, games and events
     on any team; a weekly series, or one booking across the club, is one
     piece of news, not ten.
   - A coach calling out, an admin calling one off, time off, and sessions
     families booked or asked for.
   - Nothing this phone did itself is news to it.
   - A coach hears call-outs on her own teams only; a parent hears nothing.
   - Kept to read later, counted on the bell, marked read when the inbox is
     opened, and a tap opens the thing itself. */

const H = require('./harness');
const { check } = H;
const { makeFakebase } = require('./fakebase');

const CONFIG = { apiKey: 'k', databaseURL: 'https://prod.example', projectId: 'p' };
const WS = 'workspaces/CLUB', TR = 'training/CLUB/';
const ev = (id, extra = {}) => ({ id, kind: 'practice', title: 'Practice', date: '2026-09-15', start: '17:30', end: '18:30', venue: 'Lakeside', by: 'jaz', ...extra });
const club = (events1 = {}, events2 = {}, matches = {}) => ({
  teams: {
    t1: { id: 't1', name: 'G11 Flight', players: { p1: { id: 'p1', name: 'Ella', number: '7', active: true, guardians: { mum: true } } }, events: events1 },
    t2: { id: 't2', name: 'G13 Storm', players: {}, events: events2 }
  },
  matches,
  access: {
    admins: { boss: true },
    index: { boss: true, jaz: true, kim: true, mum: true },
    members: { boss: { name: 'Ada', email: 'boss@x.test', at: 1 }, jaz: { name: 'Jaz', email: 'jaz@x.test', at: 1 }, kim: { name: 'Kim', email: 'kim@x.test', at: 1 }, mum: { name: 'Mum', email: 'mum@x.test', at: 1 } },
    teams: { t1: { coaches: { jaz: true } }, t2: { coaches: { kim: true } } },
    coachIndex: { jaz: 't1', kim: 't2' }
  }
});
async function device(uid) {
  const fbk = makeFakebase();
  const D = H.loadApp({ firebase: fbk, config: CONFIG, storage: { 'sm.workspace': 'CLUB' } });
  await D.flush(); fbk.signIn(uid, { name: club().access.members[uid].name }); await D.flush(); await H.flush(20);
  fbk.deliver(WS, club({ e1: ev('e1') })); await D.flush();
  return { D, fbk };
}
/* What the club says now, as the phone's copy of it: after the first read the
   app listens team by team and game by game, and this is what those
   listeners leave behind. */
const set = (D, c) => { D.state.teams = c.teams; D.state.matches = c.matches; D.render(); };
const titles = D => D.newsItems().map(x => x.title);
const has = (D, re) => titles(D).some(t => re.test(t));

(async () => {

  console.log('--- an admin\'s phone ---');
  {
    const { D, fbk } = await device('boss');
    D.render();
    check('the first look is not news', D.newsItems().length, 0);
    for (const k of ['sessions', 'booked', 'came', 'avail', 'seats', 'away', 'fees', 'pay']) fbk.deliver(TR + k, {});
    await D.flush(); D.render();
    check('nor is the first look at sessions and time off', D.newsItems().length, 0);

    set(D, club({ e1: ev('e1'), e2: ev('e2', { date: '2026-09-17', by: 'kim' }) }));
    check('a new practice is news', titles(D)[0], 'New practice: G11 Flight: Practice');
    check('saying when, where and who', D.newsItems()[0].body, 'Thu 17 Sep 5:30pm · Lakeside · by Kim');
    check('and pops up', /New practice: G11 Flight: Practice/.test(D.lastToast() || ''), true);
    check('the bell counts it', D.unreadCount() >= 1, true);

    set(D, club({ e1: ev('e1', { start: '18:00' }), e2: ev('e2', { date: '2026-09-17', called: 'cancelled' }) }));
    check('a moved one', has(D, /^Moved: G11 Flight: Practice$/), true);
    check('a called-off one', has(D, /^Cancelled: G11 Flight: Practice$/), true);
    set(D, club({ e1: ev('e1', { start: '18:00' }) }));
    check('a deleted one', has(D, /^Deleted: G11 Flight: Practice$/), true);

    const series = Object.fromEntries([1, 2, 3, 4].map(i => ['w' + i, ev('w' + i, { date: '2026-09-2' + i, series: 'S1' })]));
    set(D, club({ e1: ev('e1', { start: '18:00' }), ...series }));
    check('a weekly series is one piece of news', titles(D).filter(t => /practice/i.test(t) && /^New/.test(t)).length, 2);
    check('saying how many weeks', D.newsItems()[0].title + ' · ' + D.newsItems()[0].body, 'New weekly practice: G11 Flight: Practice · 4 weeks from Mon 21 Sep 5:30pm · by Jaz');
    const both = { c1: ev('c1', { kind: 'event', title: 'Picture day', club: 'K1', by: 'kim' }) };
    set(D, club({ e1: ev('e1', { start: '18:00' }), ...series, ...both }, { c2: ev('c2', { kind: 'event', title: 'Picture day', club: 'K1', by: 'kim' }) }));
    check('one booking across teams is one piece of news', D.newsItems()[0].title, 'Booked for 2 teams: Picture day');
    set(D, club({ e1: ev('e1', { start: '18:00' }), ...series, ...both }, { c2: ev('c2', { kind: 'event', title: 'Picture day', club: 'K1' }) },
      { m1: { id: 'm1', teamId: 't2', opponent: 'Riverside', date: '2026-09-19', kickoff: '10:00', by: 'kim' } }));
    check('a new game', D.newsItems()[0].title, 'New game: G13 Storm v Riverside');

    // her own doing is not news to her
    const n = D.newsItems().length;
    D.click({ act: 'calnew', tid: 't1' });
    for (const [k, v] of Object.entries({ evTitle: 'Extra', evDate: '2026-09-30', evStart: '17:00', evEnd: '18:00', evVenue: '', evNotes: '' })) D.dom.node('#' + k).value = v;
    D.click({ act: 'calsave', tid: 't1' }); await D.flush(); D.render();
    check('what she adds herself is not news to her', D.newsItems().length, n);

    fbk.deliver(TR + 'away', { jaz: { c: { id: 'c', kind: 'callout', item: 'e:e1', tid: 't1', date: '2026-09-15', start: '18:00', end: '19:00', title: 'G11 Flight: Practice', note: 'Work', by: 'jaz', at: 1 } },
      kim: { w: { id: 'w', kind: 'weekly', days: [0], by: 'kim', at: 1 } } }); await D.flush(); D.render();
    check('a coach calling out', has(D, /^Jaz can't make G11 Flight: Practice$/), true);
    check('with the day and her note', D.newsItems().find(x => /^Jaz can't/.test(x.title)).body, 'Tue 15 Sep 6pm · Work');
    check('and time off', has(D, /^Time off: Kim$/), true);
    fbk.deliver(TR + 'away', { kim: { w: { id: 'w', kind: 'weekly', days: [0], by: 'kim', at: 1 } } }); await D.flush(); D.render();
    check('and when she is back on', has(D, /^Back on: Jaz is back on G11 Flight: Practice$/), true);

    const slot = { id: 'k_jaz_2026-09-20_0900', kind: 'one', coach: 'jaz', coachName: 'Jaz', date: '2026-09-20', start: '09:00', end: '10:00', cap: 1, slot: 'b1', by: 'mum', pid: 'p1', tid: 't1' };
    fbk.deliver(TR + 'sessions', { [slot.id]: slot, g1: { id: 'g1', kind: 'group', title: 'Finishing', coach: 'kim', coachName: 'Kim', date: '2026-09-21', start: '17:00', end: '18:00', cap: 6, open: true } });
    fbk.deliver(TR + 'booked', { [slot.id]: { p1: { st: 'in', tid: 't1', by: 'mum', at: 1 } }, g1: { p1: { st: 'asked', tid: 't1', by: 'mum', at: 1 } } }); await D.flush(); D.render();
    check('a session a family booked', has(D, /^Booked by a family: 1-1 session with Jaz$/), true);
    check('with the child, for the admin', D.newsItems().find(x => /^Booked by a family/.test(x.title)).body, 'Sun 20 Sep 9am · Ella');
    check('said once, not again as a booking', titles(D).filter(t => /Ella/.test(t)).length, 1);
    check('a family asking for a place', has(D, /^Asked for a place: Ella$/), true);
    check('a new session a coach made', has(D, /^New session: Finishing with Kim$/), true);

    D.ui.view = 'inbox'; D.render();
    check('the inbox opens on club activity', /Club activity/.test(D.rendered()), true);
    check('opening it marks it read', D.newsUnread(), 0);
    const it = D.newsItems().find(x => x.title === 'New game: G13 Storm v Riverside');
    D.click({ act: 'newsopen', k: it.go });
    check('a tap opens the game\'s entry', /Riverside/.test(String(D.dom.node('#sheet').innerHTML)), true);
    D.click({ act: 'newsopen', k: 'cal|practice|t1|gone' });
    check('one that has gone says so', D.lastToast(), 'That is not here any more');

    // a reload: what was seen is remembered, so nothing old comes back as news
    const n2 = D.newsItems().length, saved = D.storage._d;
    const fbk2 = makeFakebase();
    const D2 = H.loadApp({ firebase: fbk2, config: CONFIG, storage: { ...saved } });
    await D2.flush(); fbk2.signIn('boss', { name: 'Ada' }); await D2.flush();
    await H.flush(20);
    fbk2.deliver(WS, club({ e1: ev('e1', { start: '18:00' }), ...series, ...both }, { c2: ev('c2', { kind: 'event', title: 'Picture day', club: 'K1' }) },
      { m1: { id: 'm1', teamId: 't2', opponent: 'Riverside', date: '2026-09-19', kickoff: '10:00', by: 'kim' } })); await D2.flush(); D2.render();
    const fresh = D2.newsItems().slice(0, D2.newsItems().length - n2).map(x => x.title);
    check('after a reload, the list is kept', D2.newsItems().length >= n2, true);
    check('and nothing old comes back as news: only the entry the club no longer has', fresh.every(t => t === 'Deleted: G11 Flight: Extra'), true);
    check('sessions and time off, not loaded yet, are not read as all gone', fresh.some(t => /Back on|Withdrew|Time off/.test(t)), false);
  }

  console.log('\n--- a coach\'s phone, and a parent\'s ---');
  {
    const { D, fbk } = await device('jaz');
    for (const k of ['sessions', 'booked', 'came', 'avail', 'seats', 'away']) fbk.deliver(TR + k, {});
    await D.flush(); D.render();
    set(D, club({ e1: ev('e1'), e5: ev('e5', { by: 'boss' }) }));
    check('a coach doesn\'t hear about every practice', D.newsItems().length, 0);
    fbk.deliver(TR + 'away', { jaz: { c: { id: 'c', kind: 'callout', item: 'e:e1', tid: 't1', date: '2026-09-15', title: 'G11 Flight: Practice', by: 'boss', at: 1 } },
      kim: { c2: { id: 'c2', kind: 'callout', item: 'e:e9', tid: 't2', title: 'G13 Storm: Practice', by: 'kim', at: 1 } } }); await D.flush(); D.render();
    check('she hears an admin calling her off', titles(D)[0], 'Ada called you off G11 Flight: Practice');
    check('and not a call-out on a team she doesn\'t coach', has(D, /Kim/), false);

    const p = await device('mum');
    p.D.render();
    set(p.D, club({ e1: ev('e1'), e6: ev('e6') }));
    check('a parent hears none of it', p.D.newsItems().length + (p.D.unreadCount() || 0), 0);
  }

  H.summary('club activity');
})();
