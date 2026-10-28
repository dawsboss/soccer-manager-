/* Usage (build 193; the owner, 2026-10-28: *pages loaded, people logging in
   when, and all kinds of fun data*), against the fake Firebase on a club on
   orgs/. What is pinned:

   - Every phone counts its own open, once per page load with the club read:
     when (members/{uid}/seen) and one added to her own count for the day
     (usage/{day}/{uid}), the count read first so her other phone's opens
     that day are kept; her own uid and nobody else's; straight to the
     database, never through the outbox; a refusal (rules older than 39) or
     no signal keeps nothing and says nothing.
   - Only an admin's phone reads `usage`, has the Settings tile and the
     screen; a coach, a tracker and a family are sent to Club home, read
     nothing of it, and a tap that reaches the handler lands the same way.
   - The screen: opens today, this week and over thirty days with the people
     they were; the last fourteen days; every person with when she last
     opened the app, in a reader's words, and who never has; the club in
     numbers; no child's name anywhere on it; Back to Settings. */

const H = require('./harness');
const { check, deepEq } = H;
const { makeFakebase } = require('./fakebase');

const CONFIG = { apiKey: 'k', databaseURL: 'https://prod.example', projectId: 'p' };
const OB = 'orgs/CLUB';
// the harness clock starts at 2026-09-12
const TODAY = '2026-09-12', YEST = '2026-09-11';
const at = (day, h, m) => { const [y, mo, d] = day.split('-').map(Number); return new Date(y, mo - 1, d, h, m).getTime(); };
const writesTo = (fbk, re) => fbk.record.writes.filter(w => re.test(w.path));

const ORG = () => ({
  access: {
    admins: { adm: true },
    index: { adm: true, coachU: true, helpU: true, trk: true, mumU: true },
    teams: { t1: { coaches: { coachU: true }, helpers: { helpU: true }, trackers: { trk: true } }, t2: { coaches: { coachU: true } } },
    teamIndex: { t1: { coachU: 'coach', helpU: 'helper', trk: 'tracker' }, t2: { coachU: 'coach' } },
    coachIndex: { coachU: 't1' },
    helperIndex: { helpU: 't1' },
    teamParents: { t1: { mumU: 'p1' } }
  },
  org: { name: 'Lakeside SC' },
  members: {
    adm: { name: 'Ada', email: 'ada@x.test', at: at('2026-08-01', 9, 0) },
    coachU: { name: 'Cal', email: 'cal@x.test', at: at('2026-08-02', 9, 0), seen: at(YEST, 18, 5) },
    helpU: { name: 'Hal', email: 'hal@x.test', at: at('2026-08-03', 9, 0), seen: at('2026-09-08', 7, 0) },
    trk: { name: 'Tia', email: 'tia@x.test', at: at('2026-09-01', 9, 0) },
    mumU: { name: 'Mo', email: 'mo@x.test', at: at('2026-08-20', 9, 0), seen: at(TODAY, 7, 30) }
  },
  names: { adm: { name: 'Ada' }, coachU: { name: 'Cal' }, helpU: { name: 'Hal' } },
  teams: {
    t1: { id: 't1', name: 'Flight', events: { e1: { id: 'e1', kind: 'practice', date: '2026-09-15', start: '18:00', end: '19:00' }, e2: { id: 'e2', kind: 'event', date: '2026-09-20', start: '10:00', end: '11:00' } }, attend: { e0: { p1: true } } },
    t2: { id: 't2', name: 'Storm' }
  },
  squad: {
    t1: { p1: { id: 'p1', name: 'Ella Fitz', number: '7', active: true, guardians: { mumU: true } }, p2: { id: 'p2', name: 'Rosa Lind', number: '9', active: true } },
    t2: { q1: { id: 'q1', name: 'Bea Quill', number: '3', active: true } }
  },
  roster: { t1: { p1: { number: '7', active: true }, p2: { number: '9', active: true } }, t2: { q1: { number: '3', active: true } } },
  matches: {
    g0: { id: 'g0', teamId: 't1', opponent: 'Hill End', date: '2026-09-05', ended: true, periodCount: 2, periodMinutes: 30, onFieldCount: 7 },
    g1: { id: 'g1', teamId: 't1', opponent: 'Riverside', date: '2026-09-19', periodCount: 2, periodMinutes: 30, onFieldCount: 7 },
    g2: { id: 'g2', teamId: 't2', opponent: 'Mill', date: '2026-09-26', called: 'cancelled', periodCount: 2, periodMinutes: 30, onFieldCount: 7 }
  },
  rsvp: { t1: { g_g1: { p1: { v: 'yes', by: 'mumU', at: 1 } } } },
  usage: { '2026-09-10': { adm: 1 }, [YEST]: { adm: 3, coachU: 1 }, [TODAY]: { mumU: 2 } }
});
// what the rules refuse: usage to anyone but an admin, except her own day's count
function rulesFor(uid, org) {
  const a = org.access, admin = !!a.admins[uid], coach = !!(a.coachIndex || {})[uid];
  return p => {
    const rel = p.slice(OB.length + 1);
    if (!a.index[uid]) return true;
    if (rel === 'members') return !(admin || coach);
    if (rel === 'log') return !admin;
    if (/^(coachNotes|children)$/.test(rel) || rel.startsWith('coachNotes/')) return !(admin || coach);
    if (rel === 'comply') return !admin;
    if (rel === 'usage') return !admin;
    const m = /^usage\/[^/]+\/([^/]+)$/.exec(rel);
    if (m) return m[1] !== uid;
    if (/^squad\/[^/]+$/.test(rel)) return !(admin || coach || ((a.teamIndex || {})[rel.split('/')[1]] || {})[uid]);
    if (/^teamCare\//.test(rel)) return !admin;
    return false;
  };
}
async function boot(who, org = ORG(), before = () => { }) {
  const fbk = makeFakebase();
  before(fbk);
  const A = H.loadApp({ firebase: fbk, config: CONFIG, storage: { 'sm.workspace': 'CLUB', 'sm.tree.v1:CLUB': 'orgs' } });
  await A.flush();
  A.dom.node('#sheet').hidden = true; A.dom.node('#scrim').hidden = true;
  fbk.signIn(who, { name: who, email: who + '@x.test' }); await A.flush();
  fbk.deliver('.info/connected', true);
  for (let i = 0; i < 3; i++) { await fbk.serve(OB, org, () => A.flush(), rulesFor(who, org)); await A.flush(10); }
  return { A, fbk };
}
const page = A => [A.rendered(), A.rendered('#titlebar')].join('\n');

(async () => {
  console.log('--- the admin ---');
  {
    const { A, fbk } = await boot('adm');
    check('today, for these checks', new Date(A.nowMs()).toISOString().slice(0, 10), TODAY);
    check('her phone reads the club\'s usage', fbk.readPaths().includes(OB + '/usage'), true);
    check('— and listens to it', fbk.watching(OB + '/usage'), true);
    A.ui.view = 'setup'; A.render();
    check('Settings has the tile, under Club', /data-act="goview" data-v="usage"/.test(A.rendered()) && /Usage/.test(A.rendered()), true);
    check('— saying this week\'s opens, her own open counted', /8 opens this week by 3 people/.test(A.rendered()), true);
    A.click({ act: 'goview', v: 'usage' });
    check('the screen, titled Usage', A.ui.view === 'usage' && A.rendered('#titlebar').includes('<span>Usage</span>'), true);
    const h = page(A);
    check('today: the family\'s two and her own one', /3 opens<\/b><span class="setsub">Today · 2 people/.test(h), true);
    check('this week: eight opens by three people', /8 opens<\/b><span class="setsub">This week · 3 people/.test(h), true);
    check('thirty days the same, here', /8 opens<\/b><span class="setsub">Last 30 days · 3 people/.test(h), true);
    check('the days, newest first, in words', h.indexOf('Today') < h.indexOf('Yesterday') && h.indexOf('Yesterday') < h.indexOf('Wed 9 Sep'), true);
    check('— yesterday\'s four opens by two people', /Yesterday<\/span><div class="bar"><i style="width:100%"><\/i><\/div><\/span>\s*<span class="muted">4 opens · 2 people/.test(h), true);
    check('— a quiet day says none', /Thu 10 Sep<\/span>[\s\S]*?<span class="muted">1 open · 1 person/.test(h) && /none</.test(h), true);
    check('counting started on the first day there is', /Counting started on 10 Sep/.test(h), true);
    const people = h.slice(h.indexOf('<h2>People</h2>'), h.indexOf('<h2>The club in numbers</h2>'));
    check('people: how many came in thirty days, and who never has', /3 people of 5 opened the app in the last 30 days; 1 has never opened it since joining/.test(people), true);
    const order = ['Ada', 'Mo', 'Cal', 'Hal', 'Tia'].map(n => people.indexOf(n));
    check('— the latest open first, never-opened last', order.every((x, i) => x >= 0 && (i === 0 || x > order[i - 1])), true);
    check('— her own open is Today, at once', /Ada<\/span>[\s\S]*?Today, /.test(people), true);
    check('— the coach yesterday with the time', /Cal<\/span><span class="rowsub">Head coach · joined 2 Aug<\/span><\/span>\s*<span class="muted" style="text-align:right">Yesterday, 6:05pm<br>1 open in 30 days/.test(people), true);
    check('— the assistant coach by the day of the week', /Hal<\/span><span class="rowsub">Assistant coach[\s\S]*?Tue, 7am/.test(people), true);
    check('— a tracker who never opened it says so', /Tia<\/span><span class="rowsub">Tracker · joined 1 Sep<\/span><\/span>\s*<span class="muted" style="text-align:right">Never opened<\/span>/.test(people), true);
    const nums = h.slice(h.indexOf('<h2>The club in numbers</h2>'));
    for (const [k, v] of [['Teams', '2 teams'], ['Players', '3 players, 1 with a parent signed in'], ['People', '5 people: 1 admin, 1 head, 1 assistant, 1 tracker, 1 parent'], ['Games', '1 game played, 1 to come, 1 called off'], ['Practices', '1 practice, 1 other entry'], ['Who is coming', '1 answer'], ['Attendance', '1 register'], ['Sessions', '0 sessions, 0 places booked'], ['Training', '0 practice plans, 0 club drills']])
      check(`the club in numbers: ${k}`, new RegExp(`<dt>${k}</dt><dd>${v}</dd>`).test(nums), true);
    check('no child\'s name anywhere on it', /Ella|Fitz|Rosa|Lind|Bea|Quill/.test(h), false);
    A.click({ act: 'navback' });
    check('Back goes to Settings', A.ui.view, 'setup');
    A.ui.view = 'usage';
    check('its address', A.uiToHash(), '#/club/usage');
    A.hashToUi('#/club/usage');
    check('— and the address opens it', A.ui.view, 'usage');
  }

  console.log('\n--- counting an open ---');
  {
    const { A, fbk } = await boot('mumU');
    const seen = writesTo(fbk, /^orgs\/CLUB\/members\/mumU\/seen$/), day = writesTo(fbk, new RegExp(`^orgs/CLUB/usage/${TODAY}/mumU$`));
    check('a family\'s phone stamps when she opened it, as a number', seen.length === 1 && typeof seen[0].value === 'number' && seen[0].value === A.nowMs(), true);
    check('— and adds one to her own count for the day, her other opens kept', day.length === 1 && day[0].value, 3);
    check('— her own and nobody else\'s', fbk.record.writes.some(w => /usage|seen/.test(w.path) && !/mumU/.test(w.path)), false);
    check('— once per page load', (A.render(), fbk.deliver('.info/connected', true), writesTo(fbk, /usage|seen/).length), 2);
    check('— never through the outbox', A.pendingList().length, 0);
    check('— nothing of usage read but her own day\'s count', fbk.readPaths().filter(p => /usage/.test(p)).join(), `orgs/CLUB/usage/${TODAY}/mumU`);
    check('— and her phone holds no usage', A.state.usage, undefined);
  }
  {
    const { A, fbk } = await boot('adm');
    const day = writesTo(fbk, new RegExp(`^orgs/CLUB/usage/${TODAY}/adm$`));
    check('an admin\'s first open of the day is one', day.length === 1 && day[0].value, 1);
    check('— and on her own screen already', (A.state.usage[TODAY] || {}).adm, 1);
  }
  {
    const { A, fbk } = await boot('coachU', ORG(), f => f.refuseWrites(p => /usage|seen/.test(p)));
    check('refused (rules before version 39): nothing kept', A.pendingList().length === 0 && !A.refusedCount(), true);
    check('— and nothing said', A.toasts.some(t => /didn.t save|refused/i.test(String(t))), false);
    check('— the club still drawn', /Flight/.test((A.ui.view = 'season', A.render(), A.rendered())), true);
  }
  {
    const { A, fbk } = await boot('coachU', ORG(), f => f.holdWrites(p => /usage|seen/.test(p)));
    check('no signal: nothing waits to be sent', A.pendingList().length, 0);
  }
  {
    const o = ORG(); o.access.index = { adm: true, coachU: true, helpU: true, trk: true };
    delete o.access.teamParents;
    const { fbk } = await boot('mumU', o);
    check('somebody the club has not let in counts nothing', writesTo(fbk, /usage|seen/).length, 0);
  }

  console.log('\n--- everyone else ---');
  for (const [who, what] of [['coachU', 'a coach'], ['helpU', 'an assistant coach'], ['trk', 'a tracker'], ['mumU', 'a family']]) {
    const { A, fbk } = await boot(who);
    check(`${what} reads none of the club's usage`, fbk.readPaths().some(p => p === OB + '/usage' || (/\/usage\//.test(p) && !p.endsWith('/' + who))), false);
    A.ui.view = 'setup'; A.render();
    check('— no tile', /data-v="usage"/.test(A.rendered()), false);
    A.ui.view = 'usage'; A.render();
    check('— the screen is Club home for her', A.ui.view, 'club');
    A.click({ act: 'goview', v: 'usage' });
    check('— a tap that reaches the handler too', A.ui.view, 'club');
    check('— and nothing of usage on the page', /Opens by day|opened the app/.test(A.rendered()), false);
  }

  console.log('\n--- the words and the sums ---');
  {
    const { A } = await boot('adm');
    const now = at(TODAY, 20, 0);
    check('never', A.openedWords(0, now), 'Never opened');
    check('today', A.openedWords(at(TODAY, 7, 30), now), 'Today, 7:30am');
    check('yesterday', A.openedWords(at(YEST, 18, 5), now), 'Yesterday, 6:05pm');
    check('this week: the day', A.openedWords(at('2026-09-08', 12, 0), now), 'Tue, 12pm');
    check('a week ago: the date', A.openedWords(at('2026-09-05', 12, 0), now), 'Sat 5 Sep');
    check('last year: the year too', A.openedWords(at('2025-12-24', 12, 0), now), 'Wed 24 Dec 2025');
    const s = A.usageStats(TODAY);
    check('twenty-eight days, ending today', s.days.length === 28 && s.days[27].day === TODAY && s.days[0].day === '2026-08-16', true);
    deepEq('each day summed over its people', s.days.slice(-3).map(d => [d.opens, d.people]), [[1, 1], [4, 2], [3, 2]]);
    deepEq('a person\'s thirty days', s.per, { adm: 5, coachU: 1, mumU: 2 });
    A.state.usage = { tomorrow: { adm: 1 }, '2026-09-13': { adm: 9 }, [TODAY]: { adm: 'lots', mumU: -2, trk: 2 } };
    const t = A.usageStats(TODAY);
    check('a day that is not one, a day to come, words and a minus count for nothing', t.today.opens + ' ' + t.today.people + ' ' + t.first, '2 1 ' + TODAY);
  }
  H.summary('usage');
})().catch(e => { console.error(e); process.exit(1); });
