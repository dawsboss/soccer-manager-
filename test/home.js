/* A family's own Home (UX-REVIEW.md, 1.2, build 142; one team screen for
   everyone since UX-REVIEW-2.md, 9.1 and 9.2, build 153).

   A parent opens the app for three things: when the next game or practice
   is, whether her child is going, and how the last game went and how much
   her child played. She used to land on the coach's app: Club home with
   every team on it, then the coach's Season (charts, possession, "what needs
   work", a squad table of minutes owed against a plan), and to say "going"
   she went Calendar → the entry → its sheet. Then, from build 142, she had
   two team screens, My players and Season, both carrying the live card, the
   next practice with its chips and the next game, while the coach had one.
   What is pinned here:

   - Her Home is her child's team's Season with her child's card on top: who
     she is, her minutes and her season said as "Played in 1 game" (never
     "owed"; "at Unassigned", a spot with no position, is not a position),
     the last game with her minutes, her fans. Under it the one next-up
     block everyone gets: the next thing with Going / Not going / Maybe on
     it, and the next game too when the next thing is a practice; her own
     child or herself only, checked again in the handler; a fan answers
     nothing. Then the team on the calendar and the games. No charts, no
     squad table, no "owed", no register, no calendar-sync card, no last-game
     card saying it again, and no other child at all, by name or number.
     My players is no screen of hers (#/my-players lands on Home); staff
     with a child keep it under More. Decided for the person, as the tab bar
     is: a coach whose daughter plays elsewhere keeps the coach's Season on
     her daughter's team too.
   - Children on two teams are both on the one Home (UX-REVIEW-3.md, 19.1;
     build 155): each child's card and then her team's next-up block, named
     for the team, child after child, then each team's calendar link and
     games; the title says Home over the club with no team switcher, and it
     is the same Home whichever team was last open. A fan's card (19.2) says
     in one line what she gets, where the role card sat, and Stop following
     is a text link at its foot.
   - Club home lists her children's teams alone, even before the club has an
     admin (when nothing is gated), counted plain as for everyone.
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
  const txt = h => String(h).replace(/<[^>]+>/g, '');
  const sheetHtml = () => String(A.dom.node('#sheet').innerHTML);

  console.log('--- her child and what is next, one card (the owner, 2026-10-15) ---');
  {
    const h = as('mum', 'mine');
    const merged = (h.match(/<div class="card kidmerge">[\s\S]*?data-act="teamcal"/) || [''])[0];
    check('her child, the next thing and the next game in one card', merged.includes(ROSA) && /Next up<\/span>/.test(merged) && /Next game<\/span>[\s\S]*?v Northgate/.test(merged), true);
    check('— her name first, then what is next', merged.indexOf(ROSA) < merged.indexOf('Next up'), true);
    check('— with her answers in it', chipsFor(merged, 'e_e1', 'p1') && chipsFor(merged, 'g_g2', 'p1'), true);
    check('one card, not a card and the next-up below it', (h.match(/class="card kidmerge"/g) || []).length + ' ' + (h.match(/class="kidpart"/g) || []).length, '1 1');
    const two = club(); two.teams.t1.players.p3.guardians = { mum: true };
    const h2 = as('mum', 'mine', 't1', two);
    check('two children on one team share it, each named, the next thing once', (h2.match(/class="card kidmerge"/g) || []).length + ' ' + (h2.match(/class="kidpart"/g) || []).length + ' ' + (h2.match(/Next up<\/span>/g) || []).length, '1 2 1');
    const s = as('jaz', 'season');
    check('the coach\'s Home has no child card to merge into', /kidmerge|kidpart/.test(s), false);
  }

  console.log('\n--- the coach\'s Coming up (the owner, 2026-10-15) ---');
  {
    let h = as('jaz', 'season');
    check('nothing past the next-up cards: no list', /<h2[^>]*>Coming up<\/h2>/.test(h), false);
    const more = club(), P = (id, date) => ({ id, kind: 'practice', title: 'Practice', date, start: '18:00', end: '19:00' });
    Object.assign(more.teams.t1.events, { e2: P('e2', '2026-09-17'), e3: P('e3', '2026-09-22'), e4: P('e4', '2026-09-24'), e5: P('e5', '2026-09-29'), e6: P('e6', '2026-10-01'), ex: { ...P('ex', '2026-09-20'), called: 'cancelled' } });
    more.matches.g4 = { id: 'g4', teamId: 't1', opponent: 'Westbrook', date: '2026-09-27', kickoff: '11:00', periodCount: 2, periodMinutes: 40, currentHalf: 1, periods: {}, stints: {} };
    h = as('jaz', 'season', 't1', more);
    const list = (h.match(/<h2[^>]*>Coming up<\/h2>[\s\S]*?<\/div><\/div>(?=\s*<button class="textbtn")/) || [''])[0];
    check('the next few after the next-up cards, in order, nothing called off', [...list.matchAll(/data-act="calitem" data-k="\w+" data-tid="t1" data-id="(\w+)"/g)].map(x => x[1]).join(), 'e2,e3,e4,g4');
    check('— never the two the next-up cards already show', /data-id="e1"|data-id="g2"/.test(list), false);
    check('Plan on each practice', (list.match(/data-act="pracfromcal"/g) || []).length, 3);
    check('Lineup on the game', /data-act="calgame" data-tid="t1" data-id="g4" data-g="plan">Lineup</.test(list), true);
    A.click({ act: 'calgame', tid: 't1', id: 'g4', g: 'plan' });
    check('— which opens the game on its Lineup', A.ui.view + ' ' + A.ui.matchId + ' ' + A.ui.gameView, 'game g4 plan');
    for (const who of ['mum', 'trk', 'nan']) check(who + ': no Coming up', /Coming up<\/h2>/.test(as(who, 'season', 't1', more)), false);
  }

  console.log('\n--- Home: her child on top, with the answer on it ---');
  {
    let h = as('mum', 'mine');
    check('My players is her Home, her child\'s team', A.ui.view + ' ' + A.ui.teamId, 'season t1');
    check('her child\'s card first', h.indexOf('<b style="font-size:18px">Rosa Delgado</b>') < h.indexOf('Next up'), true);
    check('the next thing is the practice', /Next up<\/span>[\s\S]*?<span class="tag practice">/.test(h), true);
    check('Going / Not going / Maybe on it, for her child', chipsFor(h, 'e_e1', 'p1'), true);
    check('the next game too, the next thing being a practice', /Next game<\/span>[\s\S]*?v Northgate/.test(h), true);
    check('— with its own answer', chipsFor(h, 'g_g2', 'p1'), true);
    check('— once each: no second next-practice row on her card', (h.match(/data-k="e_e1" data-pid="p1" data-v="yes"/g) || []).length, 1);
    check('never for anybody else\'s child', /data-act="rsvp"[^>]*data-pid="p[23]"/.test(h), false);
    check('no "Not answered yet" in words: the chips say it', /Not answered yet/.test(h), false);
    check('her season said once, as a parent says it (14.2)', /1 game · 40 minutes · 1 goal/.test(txt(h)) && !/Played in|Games \d+ of/.test(h), true);
    check('no minutes "owed" against the coach\'s plan', /owed|on plan/.test(h), false);
    check('"at Unassigned" is not a position she played', /Unassigned/.test(h), false);
    check('— where she played is behind her name, not on the card (14.2)', /Midfield/.test(h), false);
    check('no other child on her Home', /Ella|Mia|Kowalski/.test(h), false);

    A.click({ act: 'rsvp', tid: 't1', k: 'e_e1', pid: 'p1', v: 'yes', from: 'next', kind: 'practice', id: 'e1' });
    check('one tap answers: one write where the rule sits', writes.join(), 'orgs/CLUB/rsvp/t1/e_e1/p1');
    check('— in her name', A.state.rsvp.t1.e_e1.p1.v + ' ' + A.state.rsvp.t1.e_e1.p1.by, 'yes mum');
    check('— and it shows, on the screen she is on', A.ui.view === 'season' && /data-k="e_e1" data-pid="p1" data-v="yes" data-from="next" data-kind="practice" data-id="e1" aria-pressed="true"/.test(A.rendered()), true);
    A.click({ act: 'rsvp', tid: 't1', k: 'e_e1', pid: 'p1', v: 'yes', from: 'next', kind: 'practice', id: 'e1' });
    check('the same answer again takes it back', A.state.rsvp.t1.e_e1.p1, undefined);

    as('mum', 'mine');
    A.click({ act: 'rsvp', tid: 't1', k: 'e_e1', pid: 'p3', v: 'no', from: 'mine', kind: 'practice', id: 'e1' });
    check('another child\'s answer is refused in the handler', ((A.state.rsvp || {}).t1 || {}).e_e1, undefined);
    check('— with nothing written', writes.length, 0);
    check('— and said', /family or coach/.test(A.lastToast() || ''), true);

    const s = club(); s.events = null; s.teams.t1.events.e1.called = 'cancelled';
    h = as('mum', 'mine', 't1', s);
    check('a practice called off is not next: the game is, answered on its card', /Next up<\/span>[\s\S]*?v Northgate/.test(h) && chipsFor(h, 'g_g2', 'p1'), true);
    check('— and is not offered twice', /Next game<\/span>/.test(h), false);

    h = as('kid', 'mine');
    check('a player with her own sign-in answers for herself', chipsFor(h, 'e_e1', 'p2'), true);
    check('— her name opens her own sheet, her fans a row in it (UX-REVIEW-3.md, 14.1)', /data-act="kidsheet" data-tid="t1" data-pid="p2"/.test(h) && !/data-act="fansheet"/.test(h), true);
    A.click({ act: 'kidsheet', tid: 't1', pid: 'p2' });
    check('— which reads as hers', />Family and friends who follow you</.test(String(A.dom.node('#sheet').innerHTML || '')), true);
    A.closeSheet();
    h = as('nan', 'mine');
    check('a fan sees her player\'s next thing', /Next up<\/span>[\s\S]*?<span class="tag practice">/.test(h), true);
    check('— and answers nothing', anyChips(h), false);
    check('— her player by name, as her fan', /Ella Fitzgerald/.test(h) && /you’re her fan/.test(h) && /Stop following Ella/.test(h), true);
    // a fan's card (UX-REVIEW-3.md, 19.2): what she gets said once on the card, where the role card sat, and leaving a text link at its foot
    check('— what she gets, in one line on the card, and no role card over it', /class="muted fanline"[^>]*>You see Ella’s games and the team’s notices\./.test(h) && !/rolecard/.test(h), true);
    check('— Stop following a text link at the foot, not her biggest button', /<button class="textbtn" data-act="fanleave" data-tid="t1" data-pid="p2"[^>]*>Stop following Ella</.test(h) && !/class="btn[^"]*" data-act="fanleave"/.test(h), true);
    check('— a parent\'s card has no such line', /fanline/.test(as('mum', 'mine')), false);
  }

  console.log('\n--- two children on two teams: one Home, nothing to switch (UX-REVIEW-3.md, 19.1) ---');
  {
    // Rosa on G14 Flight and Bea on G12 Storm, both hers; Storm with a practice and a game of its own
    const two = () => {
      const s = club();
      s.teams.t2.players.k1.guardians = { mum: true };
      s.teams.t2.events = { e2: { id: 'e2', kind: 'practice', title: 'Practice', date: '2026-09-14', start: '17:00', end: '18:00' } };
      s.matches.g4 = { id: 'g4', teamId: 't2', opponent: 'Westbrook', date: '2026-09-20', kickoff: '11:00', periodCount: 2, periodMinutes: 30, currentHalf: 1, periods: {}, stints: {} };
      return s;
    };
    const title = () => A.rendered('#titlebar');
    let h = as('mum', 'season', 't1', two());
    const at = re => { const m = re.exec(h); return m ? m.index : -1; };
    check('both children on one Home', /<b style="font-size:18px">Rosa Delgado<\/b>/.test(h) && /<b style="font-size:18px">Bea Quill<\/b>/.test(h), true);
    check('— in the club\'s order, by team: Bea (G12 Storm), then Rosa (G14 Flight)', at(/Bea Quill/) < at(/Rosa Delgado/), true);
    check('each child, then her team\'s next thing, named for the team', at(/Bea Quill/) < at(/Next up · G12 Storm<\/span>/) && at(/Next up · G12 Storm/) < at(/Rosa Delgado/) && at(/Rosa Delgado/) < at(/Next up · G14 Flight<\/span>/), true);
    check('with the answer for the right child on each', chipsFor(h, 'e_e2', 'k1') && chipsFor(h, 'e_e1', 'p1'), true);
    check('— and never a child on the other team\'s card', chipsFor(h, 'e_e2', 'p1') || chipsFor(h, 'e_e1', 'k1'), false);
    check('the next game of each too, with its answer', /Next game · G12 Storm<\/span>[\s\S]*?v Westbrook/.test(h) && chipsFor(h, 'g_g4', 'k1') && /Next game · G14 Flight<\/span>[\s\S]*?v Northgate/.test(h) && chipsFor(h, 'g_g2', 'p1'), true);
    check('both teams on the calendar, after the children', /data-act="teamcal" data-tid="t1"/.test(h) && /data-act="teamcal" data-tid="t2"/.test(h) && at(/data-act="teamcal"/) > at(/Next up · G14 Flight/), true);
    check('each team\'s games, named for the team', /<h2>Games · G12 Storm<\/h2>/.test(h) && /<h2>Games · G14 Flight<\/h2>/.test(h), true);
    check('the title says Home, over the club: no team to switch to, no favourite to pick', /class="tbtitle"><span>Home<\/span>/.test(title()) && /data-act="clubswitch"/.test(title()) && !/teammenu/.test(title()), true);
    check('no other child on it', /Ella|Mia|Kowalski/.test(h), false);
    check('the same Home whichever team was last open', as('mum', 'season', 't2', two()) === h, true);
    A.ui.view = 'club'; A.render(); A.click({ act: 'goteam', id: 't2' });
    check('— and from Club home\'s row for either team', A.ui.view + ' ' + (A.rendered() === h), 'season true');
    A.click({ act: 'rsvp', tid: 't2', k: 'e_e2', pid: 'k1', v: 'yes', from: 'next', kind: 'practice', id: 'e2' });
    check('an answer for the second child is one write at her own entry', writes.join(), 'orgs/CLUB/rsvp/t2/e_e2/k1');
    check('— and shows on the same Home', /data-k="e_e2" data-pid="k1" data-v="yes"[^>]*aria-pressed="true"/.test(A.rendered()), true);
    h = as('mum', 'season');
    check('one child: the screen it was, Games unnamed and the team on the title', /<h2>Games<\/h2>/.test(h) && !/Games · /.test(h) && !/Next up · /.test(h) && /class="tbtitle"><span>G14 Flight<\/span>/.test(title()), true);
    const k = two(); k.teams.t2.players.k1.guardians = {}; k.teams.t2.players.k1.fans = { mum: true };
    h = as('mum', 'season', 't1', k);
    check('her own child here and a player she follows on another team: both, the fan\'s card lighter', /Rosa Delgado/.test(h) && /Bea Quill/.test(h) && /you’re her fan/.test(h) && chipsFor(h, 'e_e1', 'p1') && !chipsFor(h, 'e_e2', 'k1'), true);
  }

  console.log('\n--- a family\'s Season: the coach\'s frame, her child put in ---');
  {
    const h = as('mum', 'season');
    check('it is the same screen as Home', h, as('mum', 'mine'));
    check('her child on top, then the next thing', h.indexOf('Rosa Delgado') < h.indexOf('Next up') && h.indexOf('Next up') < h.indexOf('<h2>Games</h2>'), true);
    check('with the answer on it', chipsFor(h, 'e_e1', 'p1'), true);
    check('and the next game, with its own', /Next game<\/span>/.test(h) && chipsFor(h, 'g_g2', 'p1'), true);
    // one filled button a card (UX-REVIEW-3.md, 12.6): where she is asked, her answer is the thing to do
    const gameCard = x => (x.match(/Next game<\/span>[\s\S]*?<\/div>\s*<\/div>/) || [''])[0];
    check('— so Open the game waits quietly beside it', /<button class="btn quiet sm" data-act="calgame"/.test(gameCard(h)), true);
    check('— while the coach, asked nothing, keeps it filled', /<button class="btn sm" data-act="calgame"/.test(gameCard(as('jaz', 'season'))), true);
    check('the last result, on her child\'s card', /Last game — Riverside/.test(h) && /class="score">1<i>–<\/i>1<\/span>/.test(h), true);
    check('— with her child\'s minutes in it', /5 Sep · 40 min played/.test(h), true);
    check('— and only there: no last-game card saying it again', /Season so far|<span class="muted">Last game<\/span>/.test(h), false);
    check('her child\'s season', /<b style="font-size:18px">Rosa Delgado<\/b>/.test(h) && /1 game · 40 minutes · 1 goal/.test(txt(h)), true);
    check('the team on the calendar, as on the coach\'s', /data-act="teamcal" data-tid="t1"/.test(h), true);
    check('the games, played and to come', /data-act="openmatch" data-id="g2"/.test(h) && /data-act="openmatch" data-id="g3"/.test(h), true);
    for (const [what, re] of [['charts', /Game by game/], ['shooting', /<h2[^>]*>Shooting/], ['possession', /Possession|scrappy/], ['set pieces', /Set pieces and fouls/],
      ['what needs work', /What needs work/], ['the squad table', /<h2>Players<\/h2>/], ['"owed"', /owed|planned/], ['the register', /<h2>Attendance<\/h2>/],
      ['the rows into Stats, Minutes and Attendance', /data-v="teamstats"|data-v="minutes"|data-v="attend"/],
      ['the calendar-sync card', /In your own calendar/], ['the AI button', /data-act="ai"/], ['Add a game', /data-act="newmatch"/], ['a Who is coming line', /Who is coming/]])
      check(`no ${what}`, re.test(h), false);
    check('no other child, by name or number', /Ella|Fitzgerald|Mia|Kowalski|#9|#4|A teammate/.test(h), false);
    A.click({ act: 'gotoplayer', tid: 't1', id: 'g1' });
    check('the last result opens that game\'s recap, where every finished game lands (UX-REVIEW-3.md, 16.9)', A.ui.view + ' ' + A.ui.matchId + ' ' + A.ui.gameView, 'game g1 recap');

    // the same card for the coach, with the same buttons, and her Who is coming where the chips are (UX-REVIEW-2.md, 9.2)
    const c0 = as('jaz', 'season');
    const card = x => (x.match(/<div class="card calnext"[\s\S]*?<div class="row wrap"[\s\S]*?<\/div>/) || [''])[0];
    // Plan is the coach's addition to the frame (a role adds buttons, never renames or reorders them)
    const plan = /<button class="btn sm" data-act="pracfromcal"[^>]*>[^<]*<\/button>\s*/;
    const norm = x => x.replace(/\s+/g, ' ');
    check('the coach\'s next-up card is the parent\'s, button for button, plus Plan', norm(card(c0).replace(plan, '')) === norm(card(h)) && /Next up<\/span>[\s\S]*?>Plan<[\s\S]*?>Add to my calendar</.test(card(c0)), true);
    check('— with Who is coming under it, into the list', /Next up<\/span>[\s\S]*?data-act="calitem"[^>]*>Who is coming: 0 of 3</.test(c0), true);
    A.click({ act: 'rsvp', tid: 't1', k: 'e_e1', pid: 'p1', v: 'yes', from: 'sheet', kind: 'practice', id: 'e1' });
    check('— counting the answers', /Who is coming: 1 of 3</.test(A.rendered()), true);
    A.click({ act: 'rsvp', tid: 't1', k: 'e_e1', pid: 'p3', v: 'no', from: 'sheet', kind: 'practice', id: 'e1' });
    check('— and who is not', /Who is coming: 1 of 3 · 1 not going</.test(A.rendered()), true);
    const own = as('jaz', 'season', 't2');
    check('a coach whose daughter is on her own team gets her chips and the line', chipsFor(own, 'g_g1', 'k1') || /Who is coming/.test(own) || !/calnext/.test(own), true);
    check('a tracker gets the line, never a chip', /Who is coming: 0 of 3</.test(as('trk', 'season')) && !anyChips(A.rendered()), true);

    const f = as('nan', 'season');
    check('a fan\'s Season: her player on top, by name', /<b style="font-size:18px">Ella Fitzgerald<\/b>/.test(f) && /you’re her fan/.test(f), true);
    check('— no answers', anyChips(f), false);
    check('— and nobody else', /Rosa|Mia/.test(f), false);
    const k = as('kid', 'season');
    check('a player\'s own: her card, her name the door to her fans', /data-act="kidsheet"[^>]*>[\s\S]*?<b style="font-size:18px">Ella Fitzgerald<\/b>/.test(k), true);

    // the coach's Season is short since build 146: the record, the games and rows into Stats, Minutes and Attendance
    const coachy = h => /data-v="teamstats"/.test(h) && /data-v="minutes"/.test(h);
    const c = as('jaz', 'season');
    check('the coach keeps the coach\'s Season', coachy(c) && !/’s season/.test(c), true);
    const d = as('jaz', 'season', 't2');
    check('— on her daughter\'s team too: she is staff, not a family', coachy(d), true);
    check('an admin: the coach\'s Season', coachy(as('boss', 'season')), true);
    check('a tracker: the coach\'s Season', coachy(as('trk', 'season')), true);
    check('— the Minutes screen, for the coach', /<h2>Minutes<\/h2>/.test(as('jaz', 'minutes')) && /Ella Fitzgerald/.test(A.rendered()), true);
    check('— and a family sent to it lands on her own Season', (as('mum', 'minutes'), A.ui.view) + ' ' + /<b style="font-size:18px">Rosa Delgado<\/b>/.test(A.rendered()), 'season true');
  }

  console.log('\n--- her child\'s card (UX-REVIEW-3.md, 14.1, 14.2, 14.5, 14.6) ---');
  {
    let h = as('mum', 'mine');
    check('no Fans button on the card: it was the biggest control on it (14.1)', />Fans( \(\d+\))?<|data-act="fansheet"|Your fans/.test(h), false);
    check('her name is the door to what is behind it, with its chevron', /<button class="plainbtn go kidhead" type="button" data-act="kidsheet" data-tid="t1" data-pid="p1">/.test(h), true);
    check('the minutes are not a big number top right: one line says it (14.2)', /class="pmins"><span data-live="smins"/.test(h) && !/data-live="smins"/.test(h), false);
    check('— games, minutes, goals; no position, no second "Games 1 of 1" count', txt(h).includes('1 game · 40 minutes · 1 goal') && !/Midfield|Games 1 of/.test(h), true);
    check('the minutes tick in a live game, and say "minutes" with them', /<span data-live="smint" data-tid="t1" data-pid="p1">40 minutes<\/span>/.test(h), true);
    A.state = club(); A.state.matches.g1.stints = { s1: { pid: 'p1', on: 0, off: 60 } };
    check('— one minute is not "1 minutes"', A.liveReading('smint', { tid: 't1', pid: 'p1' }, NOW) + ', ' + A.liveReading('smint', { tid: 't1', pid: 'p3' }, NOW), '1 minute, 0 minutes');

    // what she came to: a register, said as a parent says it
    let s = club(); s.teams.t1.events.e0 = { id: 'e0', kind: 'practice', title: 'Practice', date: '2026-09-08', start: '18:00', end: '19:00' };
    s.teams.t1.events.e00 = { id: 'e00', kind: 'practice', title: 'Practice', date: '2026-09-09', start: '18:00', end: '19:00' };
    s.teams.t1.attend = { e0: { p1: true }, e00: { p1: false } };
    h = as('mum', 'mine', 't1', s);
    check('she is told what she came to: 1 of 2 practices', txt(h).includes('1 game · 40 minutes · 1 goal · came to 1 of 2 practices'), true);
    s.teams.t1.attend.e00.p1 = true;
    h = as('mum', 'mine', 't1', s);
    check('— all of them', txt(h).includes('came to all 2 practices'), true);
    delete s.teams.t1.events.e00; s.teams.t1.attend = { e0: { p1: true } };
    check('— the one she went to', txt(as('mum', 'mine', 't1', s)).includes('came to the practice'), true);
    s = club(); s.teams.t1.players.p1.guardians = { mum: true }; s.matches.g1.stints = {};
    check('a child with no minutes yet is told so, and no minutes', /No games played yet/.test(as('mum', 'mine', 't1', s)) && !/ minutes</.test(txt(A.rendered())), true);

    // the sheet behind her name
    h = as('mum', 'mine');
    A.click({ act: 'kidsheet', tid: 't1', pid: 'p1' });
    let sh = sheetHtml();
    check('her name opens her sheet', /<h3>Rosa Delgado<\/h3>/.test(sh), true);
    check('— where she has played, said there (and "Unassigned" never)', /20 min at Midfield/.test(sh) && !/Unassigned/.test(sh), true);
    check('— the family and friends who follow her, one row into them', /data-act="fansheet" data-tid="t1" data-pid="p1"[^>]*>[\s\S]*?Family and friends who follow Rosa/.test(sh), true);
    A.click({ act: 'fansheet', tid: 't1', pid: 'p1' });
    sh = sheetHtml();
    check('— which says what a fan is first, then the one button', sh.indexOf("For a grandparent") > -1 && sh.indexOf("For a grandparent") < sh.indexOf('data-act="faninvite"') && />Invite a grandparent or friend</.test(sh), true);
    const withFan = club(); withFan.teams.t1.players.p1.fans = { gran: true }; withFan.teams.t1.players.p1.fanNames = { gran: 'Gran' };
    as('mum', 'mine', 't1', withFan);
    A.click({ act: 'kidsheet', tid: 't1', pid: 'p1' });
    check('the row counts them', /Family and friends who follow Rosa<\/span>\s*<span class="rowsub">1 follows Rosa/.test(sheetHtml()), true);
    as('mum', 'mine');
    A.click({ act: 'kidsheet', tid: 't1', pid: 'p3' });
    check('another child\'s sheet is refused in the handler', A.dom.node('#sheet').hidden + ' ' + /Her family, her coach or an admin/.test(A.lastToast() || ''), 'true true');
    as('nan', 'mine');
    A.click({ act: 'kidsheet', tid: 't1', pid: 'p2' });
    check('— and a fan has none: Stop following stays on her card', A.dom.node('#sheet').hidden + ' ' + /Stop following Ella/.test(A.rendered()), 'true true');

    // a game being played: one LIVE card for everyone, her child's line a line
    const liveClub = off => {
      const c = club(); const g = c.matches.g2;
      Object.assign(g, { date: '2026-09-12', kickoff: '09:22', periods: { 0: { half: 1, start: NOW - 38 * 60000 } }, stints: { s9: { pid: 'p1', on: 0, role: 'Midfield', ...(off ? { off } : {}) } } });
      return c;
    };
    h = as('mum', 'mine', 't1', liveClub());
    check('on game day she is told where her child is, in one line (14.5)', txt(h).includes('Rosa: on the pitch · 38 min'), true);
    check('— the LIVE card is the one door into the game', (h.match(/data-act="calgame"[^>]*data-g="live"/g) || []).length + ' ' + /Playing now|data-act="gotoplayer" data-tid="t1" data-id="g2"/.test(h), '1 false');
    h = as('mum', 'mine', 't1', liveClub(600));
    check('— and off the pitch when she is', txt(h).includes('Rosa: off the pitch · 10 min'), true);
    check('the player herself is told in the second person', (c => { c.matches.g2.stints.s9.pid = 'p2'; return txt(as('kid', 'mine', 't1', c)); })(liveClub()).includes('You: on the pitch'), true);

    // a score is one style: both digits one size
    check('a score is both digits one size, the dash soft (14.6)', /<span class="score">1<i>–<\/i>1<\/span>/.test(as('mum', 'mine')) && !/<small>–/.test(A.rendered()), true);
    check('— on the Games list too', /data-act="openmatch" data-id="g1"[\s\S]*?<span class="score">1<i>–<\/i>1<\/span>/.test(A.rendered()), true);
    check('— the live card', /callive[\s\S]*?<span class="score">\d+<i>–<\/i>\d+<\/span>/.test(as('mum', 'mine', 't1', liveClub())), true);
  }

  console.log('\n--- what is called off today or tomorrow is said on Home (14.3) ---');
  {
    const withCalled = (date, extra = {}) => { const c = club(); Object.assign(c.teams.t1.events.e1, { date, called: 'cancelled', ...extra }); return c; };
    let h = as('mum', 'mine', 't1', withCalled('2026-09-12'));
    check('tonight\'s practice, cancelled that morning: said above the next-up card', txt(h).includes('Tonight’s practice is cancelled') && h.indexOf('callednow') < h.indexOf('Next up'), true);
    check('— with when and where struck through, the next thing under it', /<s>6pm<\/s>/.test(h) && /Next up<\/span>[\s\S]*?v Northgate/.test(h), true);
    check('— a door into that entry', /<button class="card go callednow" type="button" data-act="calitem" data-k="practice" data-tid="t1" data-id="e1">/.test(h), true);
    h = as('mum', 'mine', 't1', withCalled('2026-09-12', { start: '08:00', end: '09:00' }));
    check('a time already gone today is moot, and not said', /callednow/.test(h), false);
    h = as('mum', 'mine', 't1', withCalled('2026-09-12', { start: '10:30', end: '11:30' }));
    check('before five it is today\'s, not tonight\'s', txt(h).includes('Today’s practice is cancelled'), true);
    h = as('mum', 'mine', 't1', withCalled('2026-09-13'));
    check('tomorrow\'s is said too', txt(h).includes('Tomorrow’s practice is cancelled'), true);
    h = as('mum', 'mine', 't1', withCalled('2026-09-14'));
    check('but not the day after: the calendar row says it', /callednow/.test(h), false);
    const g = withCalled('2026-09-20'); Object.assign(g.matches.g2, { date: '2026-09-13', called: 'postponed' });
    h = as('mum', 'mine', 't1', g);
    check('a game postponed for tomorrow is said, in its word', txt(h).includes('Tomorrow’s game v Northgate is postponed'), true);
    check('— and is still not offered as next', /Next game<\/span>/.test(h), false);
    check('the coach\'s Season says it the same (one frame for everyone)', txt(as('jaz', 'season', 't1', withCalled('2026-09-13'))).includes('Tomorrow’s practice is cancelled'), true);
    check('nothing called off: no line', /callednow/.test(as('mum', 'mine')), false);
  }

  console.log('\n--- the next-up title and its tag are not the same word (14.7) ---');
  {
    let h = as('mum', 'mine');
    check('a practice with no title of its own: the team, with the tag beside it', /<b style="font-size:19px">G14 Flight<\/b><span class="tag practice">Practice<\/span>/.test(h), true);
    const c = club(); c.teams.t1.events.e1.title = 'Skills night';
    h = as('mum', 'mine', 't1', c);
    check('one with a title keeps it', /<b style="font-size:19px">Skills night<\/b><span class="tag practice">Practice<\/span>/.test(h), true);
    check('a game is still the opponent', /<b style="font-size:19px">v Northgate<\/b><span class="tag game">/.test(h), true);
  }

  console.log('\n--- Club home: her teams ---');
  {
    const open = club(); open.access.admins = {}; open.access.index = {};
    let h = as('mum', 'club', 't1', open);
    check('before the club has an admin, a family still sees her child\'s team', /data-act="goteam" data-id="t1"/.test(h), true);
    check('— and not the rest of the club\'s', /data-act="goteam" data-id="t2"/.test(h), false);
    check('— counted plain, as for everyone (UX-REVIEW-2.md, 9.4)', /<span class="rowsub">1 team<\/span>/.test(h) && !/Your team/.test(h), true);
    check('— and no My players card: Home is her team', /data-v="mine"/.test(h), false);
    h = as('jaz', 'club', 't1', club());
    check('staff see every team they can reach', /data-id="t1"/.test(h) && /data-id="t2"/.test(h), true);
    h = as('mum', 'club');
    check('in a club with an admin, only hers, as before', /data-id="t1"/.test(h) && !/data-id="t2"/.test(h), true);
    // UX-REVIEW-3.md, 18.3: her child's team is her child's, and the Calendar is its tab
    check('— said as Rosa\'s team, never view only', /Rosa(&#39;|')s team/.test(h) && !/view only/.test(h), true);
    check('— with no Calendar card', /<b>Calendar<\/b>/.test(h), false);
    h = as('jaz', 'club', 't1', club());
    check('a coach with a child on another team: that team is her child\'s', /data-id="t2"[\s\S]*?Bea(&#39;|')s team/.test(h), true);
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
    check('a family opening the app lands on Home, her child\'s team', B.ui.view + ' ' + B.ui.teamId, 'season t1');
    check('— the Home tab lit', /data-tab="home" aria-current="true"/.test(B.rendered('#tabbar')), true);
    B = cached('mum', { view: 'inbox' });
    check('— whatever was open last', B.ui.view, 'season');
    B = cached('mum', { hash: '#/my-players' });
    check('— and the old My players address lands there too', B.ui.view, 'season');
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
    check('a new phone waits for the club', r.before === 'season', false);
    check('— then lands her on Home', r.after, 'season');
    r = await fresh(true);
    check('a tap before the club answers is her choice, and kept', r.after, 'calendar');
  }

  H.summary('a family\'s own Home and Season');
})();
