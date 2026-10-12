/* A family's own Home and Season (UX-REVIEW.md, 1.2; build 142).

   A parent opens the app for three things: when the next game or practice
   is, whether her child is going, and how the last game went and how much
   her child played. She used to land on the coach's app: Club home with
   every team on it, then the coach's Season (charts, possession, "what needs
   work", a squad table of minutes owed against a plan), and to say "going"
   she went Calendar → the entry → its sheet. What is pinned here:

   - My players is her Home: the next thing has Going / Not going / Maybe on
     it, and so does the next game when the next thing is a practice; her own
     child or herself only, checked again in the handler; a fan answers
     nothing. Her child's season is said as "Played in 1 game", never "owed",
     and "at Unassigned" (a spot with no position) is not a position.
   - A family's Season: next up (with the answer), the next game, the last
     result with her child's minutes, her child's season, the games. No
     charts, no squad table, no "owed", no register, no calendar-sync card,
     and no other child at all, by name or number. Decided for the person, as
     the tab bar is: a coach whose daughter plays elsewhere keeps the coach's
     Season on her daughter's team too.
   - Club home, for a family, lists her children's teams alone, even before
     the club has an admin (when nothing is gated).
   - The app opened with no address of its own lands a family on Home: at
     once from the phone's copy, or once the club has been read on a new
     phone, unless she tapped somewhere first. A link or a reload keeps its
     screen, and staff keep what was open. */

const H = require('./harness');
const { check } = H;
const { makeFakebase } = require('./fakebase');

const CONFIG = { apiKey: 'k', databaseURL: 'https://x.test' };
const at = (d, hhmm) => { const [y, m, dd] = d.split('-').map(Number); const [h, mi] = hhmm.split(':').map(Number); return new Date(y, m - 1, dd, h, mi).getTime(); };
const NOW = at('2026-09-12', '10:00');
H.clock.set(NOW);

const ROSA = 'Rosa Delgado', ELLA = 'Ella Fitzgerald', MIA = 'Mia Kowalski', BEA = 'Bea Quill';
const club = () => ({
  teams: {
    t1: {
      id: 't1', name: 'G14 Flight',
      players: {
        p1: { id: 'p1', name: ROSA, number: '7', guardians: { mum: true } },
        p2: { id: 'p2', name: ELLA, number: '9', fans: { nan: true }, self: { kid: true } },
        p3: { id: 'p3', name: MIA, number: '4' }
      },
      events: { e1: { id: 'e1', kind: 'practice', title: 'Practice', date: '2026-09-15', start: '18:00', end: '19:00' } }
    },
    // Jaz coaches t1, and her daughter Bea plays here
    t2: { id: 't2', name: 'G12 Storm', players: { k1: { id: 'k1', name: BEA, number: '3', guardians: { jaz: true } } } }
  },
  matches: {
    g1: {
      id: 'g1', teamId: 't1', opponent: 'Riverside', date: '2026-09-05', kickoff: '09:00', periodCount: 2, periodMinutes: 40, onFieldCount: 2,
      currentHalf: 3, ended: at('2026-09-05', '10:30'),
      periods: { 0: { half: 1, start: at('2026-09-05', '09:00'), end: at('2026-09-05', '09:40') }, 1: { half: 2, start: at('2026-09-05', '09:50'), end: at('2026-09-05', '10:30') } },
      // Rosa: 20 minutes at a position, 20 in a spot with none (Unassigned); Mia the whole game
      stints: { s1: { pid: 'p1', on: 0, off: 1200, role: 'Midfield' }, s2: { pid: 'p1', on: 1200, off: 2400 }, s3: { pid: 'p3', on: 0, off: 4800 } },
      planned: { p1: 80, p3: 40 },
      goals: { a: { t: 300, side: 'us', pid: 'p1', assist: 'p3' }, b: { t: 900, side: 'them' } },
      shots: { x: { t: 280, side: 'us', pid: 'p1', onTarget: true }, y: { t: 600, side: 'them', onTarget: false } }
    },
    g2: { id: 'g2', teamId: 't1', opponent: 'Northgate', date: '2026-09-19', kickoff: '09:30', periodCount: 2, periodMinutes: 40, currentHalf: 1, periods: {}, stints: {} },
    g3: { id: 'g3', teamId: 't1', opponent: 'Hill End', date: '2026-09-26', kickoff: '10:00', called: 'cancelled', periodCount: 2, periodMinutes: 40, currentHalf: 1, periods: {}, stints: {} }
  },
  access: {
    org: { name: 'Lakeside SC' },
    admins: { boss: true },
    teams: { t1: { coaches: { jaz: true }, trackers: { trk: true } }, t2: { coaches: { other: true } } },
    index: { boss: true, jaz: true, trk: true, mum: true, nan: true, kid: true, other: true },
    members: { boss: { name: 'Ada' }, jaz: { name: 'Jaz' }, mum: { name: 'Mo' } }
  }
});

(async () => {
  const A = H.loadApp({ firebase: makeFakebase(), storage: { 'sm.workspace': 'CLUB' }, config: CONFIG });
  let writes = [];
  A.fb = { db: {}, ref: (db, p) => p, set: (p, v) => { writes.push(p); return Promise.resolve(); }, remove: p => { writes.push(p); return Promise.resolve(); } };
  function as(uid, view, tid = 't1', s = club()) {
    A.state = s;
    A.me = uid ? { uid, name: uid, email: uid + '@x.test' } : null;
    A.appOwners = {};
    A.ui.teamId = tid; A.ui.matchId = null; A.ui.view = view; A.ui.gameFrom = null; A.ui.thread = null;
    A.toasts.length = 0; writes = [];
    A.closeSheet();
    A.render();
    return A.rendered();
  }
  const chipsFor = (h, k, pid) => new RegExp(`data-act="rsvp"[^>]*data-k="${k}" data-pid="${pid}"`).test(h);
  const anyChips = h => /data-act="rsvp"/.test(h);

  console.log('--- My players: her Home, with the answer on it ---');
  {
    let h = as('mum', 'mine');
    check('the next thing is the practice', /Next — Practice/.test(h), true);
    check('Going / Not going / Maybe on it, for her child', chipsFor(h, 'e_e1', 'p1'), true);
    check('the next game too, the next thing being a practice', /Next game — /.test(h) && /Northgate/.test(h), true);
    check('— with its own answer', chipsFor(h, 'g_g2', 'p1'), true);
    check('never for anybody else\'s child', /data-act="rsvp"[^>]*data-pid="p[23]"/.test(h), false);
    check('no "Not answered yet" in words: the chips say it', /Not answered yet/.test(h), false);
    check('her season said as a parent says it', /Played in 1 game · 1 goal/.test(h), true);
    check('no minutes "owed" against the coach\'s plan', /owed|on plan/.test(h), false);
    check('"at Unassigned" is not a position she played', /Unassigned/.test(h), false);
    check('the position she did play is', /20 at Midfield/.test(h), true);
    check('no other child on her Home', /Ella|Mia|Kowalski/.test(h), false);

    A.click({ act: 'rsvp', tid: 't1', k: 'e_e1', pid: 'p1', v: 'yes', from: 'mine', kind: 'practice', id: 'e1' });
    check('one tap answers: one write where the rule sits', writes.join(), 'orgs/CLUB/rsvp/t1/e_e1/p1');
    check('— in her name', A.state.rsvp.t1.e_e1.p1.v + ' ' + A.state.rsvp.t1.e_e1.p1.by, 'yes mum');
    check('— and it shows, on the screen she is on', A.ui.view === 'mine' && /data-k="e_e1" data-pid="p1" data-v="yes" data-from="mine" data-kind="practice" data-id="e1" aria-pressed="true"/.test(A.rendered()), true);
    A.click({ act: 'rsvp', tid: 't1', k: 'e_e1', pid: 'p1', v: 'yes', from: 'mine', kind: 'practice', id: 'e1' });
    check('the same answer again takes it back', A.state.rsvp.t1.e_e1.p1, undefined);

    as('mum', 'mine');
    A.click({ act: 'rsvp', tid: 't1', k: 'e_e1', pid: 'p3', v: 'no', from: 'mine', kind: 'practice', id: 'e1' });
    check('another child\'s answer is refused in the handler', ((A.state.rsvp || {}).t1 || {}).e_e1, undefined);
    check('— with nothing written', writes.length, 0);
    check('— and said', /family or coach/.test(A.lastToast() || ''), true);

    const s = club(); s.events = null; s.teams.t1.events.e1.called = 'cancelled';
    h = as('mum', 'mine', 't1', s);
    check('a practice called off is not next: the game is, answered on its row', /Next — v Northgate|Next — Northgate/.test(h) && chipsFor(h, 'g_g2', 'p1'), true);
    check('— and is not offered twice', /Next game — /.test(h), false);

    h = as('kid', 'mine');
    check('a player with her own sign-in answers for herself', chipsFor(h, 'e_e1', 'p2'), true);
    h = as('nan', 'mine');
    check('a fan sees her player\'s next thing', /Next — Practice/.test(h), true);
    check('— and answers nothing', anyChips(h), false);
  }

  console.log('\n--- a family\'s Season ---');
  {
    const h = as('mum', 'season');
    check('it leads with the next thing', /Next up/.test(h) && h.indexOf('Next up') < h.indexOf('Last game'), true);
    check('with the answer on it', chipsFor(h, 'e_e1', 'p1'), true);
    check('and the next game, with its own', /Next game/.test(h) && chipsFor(h, 'g_g2', 'p1'), true);
    check('the last result', /Last game/.test(h) && /Riverside/.test(h) && /1<small>–1/.test(h), true);
    check('— with her child\'s minutes in it', /Rosa Delgado 40 min/.test(h), true);
    check('— and the season\'s record', /Season so far: 0W 1D 0L/.test(h), true);
    check('her child\'s season', /Rosa’s season/.test(h) && /Played in 1 game · 1 goal/.test(h), true);
    check('the games, played and to come', /data-act="openmatch" data-id="g2"/.test(h) && /data-act="openmatch" data-id="g3"/.test(h), true);
    for (const [what, re] of [['charts', /Game by game/], ['shooting', /<h2[^>]*>Shooting/], ['possession', /Possession|scrappy/], ['set pieces', /Set pieces and fouls/],
      ['what needs work', /What needs work/], ['the squad table', /<h2>Players<\/h2>/], ['"owed"', /owed|planned/], ['the register', /<h2>Attendance<\/h2>/],
      ['the calendar-sync card', /In your own calendar/], ['the AI button', /data-act="ai"/], ['Add a game', /data-act="newmatch"/]])
      check(`no ${what}`, re.test(h), false);
    check('no other child, by name or number', /Ella|Fitzgerald|Mia|Kowalski|#9|#4|A teammate/.test(h), false);
    A.click({ act: 'gotoplayer', tid: 't1', id: 'g1' });
    check('the last result opens that game\'s numbers', A.ui.view + ' ' + A.ui.matchId + ' ' + A.ui.gameView, 'game g1 stats');

    const f = as('nan', 'season');
    check('a fan\'s Season: her player\'s season, by name', /Ella’s season/.test(f) && /Ella Fitzgerald/.test(f), true);
    check('— no answers', anyChips(f), false);
    check('— and nobody else', /Rosa|Mia/.test(f), false);
    const k = as('kid', 'season');
    check('a player\'s own: "Your season"', /Your season/.test(k), true);

    const c = as('jaz', 'season');
    check('the coach keeps the coach\'s Season', /<h2>Players<\/h2>/.test(c) && /owed/.test(c), true);
    const d = as('jaz', 'season', 't2');
    check('— on her daughter\'s team too: she is staff, not a family', /<h2>Players<\/h2>/.test(d), true);
    check('an admin: the coach\'s Season', /<h2>Players<\/h2>/.test(as('boss', 'season')), true);
    check('a tracker: the coach\'s Season', /<h2>Players<\/h2>/.test(as('trk', 'season')), true);
  }

  console.log('\n--- Club home: her teams ---');
  {
    const open = club(); open.access.admins = {}; open.access.index = {};
    let h = as('mum', 'club', 't1', open);
    check('before the club has an admin, a family still sees her child\'s team', /data-act="goteam" data-id="t1"/.test(h), true);
    check('— and not the rest of the club\'s', /data-act="goteam" data-id="t2"/.test(h), false);
    check('— said as hers', /Your team/.test(h), true);
    h = as('jaz', 'club', 't1', club());
    check('staff see every team they can reach', /data-id="t1"/.test(h) && /data-id="t2"/.test(h), true);
    h = as('mum', 'club');
    check('in a club with an admin, only hers, as before', /data-id="t1"/.test(h) && !/data-id="t2"/.test(h), true);
  }

  console.log('\n--- where the app opens ---');
  {
    // what boot decides, before the database has said anything
    const cached = (uid, extra = {}) => H.loadApp({
      firebase: makeFakebase(), config: CONFIG, hash: extra.hash,
      storage: {
        'sm.workspace': 'CLUB', 'sm.me': JSON.stringify({ uid, name: uid }), 'sm.data.v1:CLUB': JSON.stringify(club()),
        'sm.ui.v1': JSON.stringify({ view: extra.view || 'calendar', teamId: 't1', tabs: 2 })
      }
    });
    let B = cached('mum');
    check('a family opening the app lands on Home', B.ui.view, 'mine');
    check('— the Home tab lit', /data-tab="home" aria-current="true"/.test(B.rendered('#tabbar')), true);
    B = cached('mum', { view: 'inbox' });
    check('— whatever was open last', B.ui.view, 'mine');
    B = cached('mum', { hash: '#/calendar' });
    check('a link (or a reload) keeps the screen it names', B.ui.view, 'calendar');
    B = cached('jaz', { view: 'roster' });
    check('staff keep what was open', B.ui.view, 'roster');

    // a new phone: who she is here as is known only once the club has been read
    const fresh = async tapFirst => {
      const fbk = makeFakebase();
      const D = H.loadApp({ firebase: fbk, config: CONFIG, storage: { 'sm.workspace': 'CLUB' } });
      await D.flush(); fbk.signIn('mum', { name: 'Mo' }); await D.flush();
      const before = D.ui.view;
      if (tapFirst) D.click({ act: 'tab', tab: 'calendar' });
      await fbk.serveClub('CLUB', club(), D.flush); await D.flush();
      return { before, after: D.ui.view };
    };
    let r = await fresh(false);
    check('a new phone waits for the club', r.before === 'mine', false);
    check('— then lands her on Home', r.after, 'mine');
    r = await fresh(true);
    check('a tap before the club answers is her choice, and kept', r.after, 'calendar');
  }

  H.summary('a family\'s own Home and Season');
})();
