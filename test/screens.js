/* Each screen on its own (UX-REVIEW.md, 3; build 146).

   The review walked every screen at phone size and wrote a paragraph on
   each. Sections 1 and 2 (the way around, a family's own Home, a game as its
   own mode, one Settings, the words) shipped in builds 141 to 145; this is
   the rest, pinned:

   - Club home: the club's name once (the title row is the switcher; the
     crest row says it large), and every card that opens something is a
     button with a chevron, while the crest-and-count row is not a button.
   - Season, for the coach: short. What is on, the last result, the record,
     the games, and a row each into Stats, Minutes and Attendance, which are
     screens of their own (#/team/{id}/stats, /minutes, /attendance), Back
     going to Season. The charts wait for five finished games. A family sent
     to any of them lands on her own Season; Attendance is only for whoever
     takes the register.
   - Players: no "no profile yet" under every name, and the rating dots are
     explained by an info button, not left to be guessed.
   - Calendar: the calendars picker is a button that says Calendars, not an
     unlabelled icon; what has already happened is "Earlier (n)".
   - A coach with no name on record is "the coach" mid-sentence, never "A
     coach" with a capital where a name should be.
   - Subs: orange only for a player behind the pace of the game, not on
     every row from kick-off; a spot button says the spot alone.
   - Lineup: the lineup leads, and a game with no shape is one line and a
     button, with the detail behind an info button.
   - Sessions, for a family: what she can book first, under one heading, her
     places, what she owes; nothing to book and nothing booked is one line.
   - People: the table carries the class the phone-width layout hangs off.
   - The welcome and lock screens say what to do in a parent's words. */

const H = require('./harness');
const { check } = H;
const { makeFakebase } = require('./fakebase');

const CONFIG = { apiKey: 'k', databaseURL: 'https://x.test' };
const at = (d, hhmm) => { const [y, m, dd] = d.split('-').map(Number); const [h, mi] = hhmm.split(':').map(Number); return new Date(y, m - 1, dd, h, mi).getTime(); };
const NOW = at('2026-09-12', '10:00');
H.clock.set(NOW);

const ROSA = 'Rosa Delgado', ELLA = 'Ella Fitzgerald', MIA = 'Mia Kowalski';
const played = (id, opp, date, goals) => ({
  id, teamId: 't1', opponent: opp, date, kickoff: '09:00', periodCount: 2, periodMinutes: 40, onFieldCount: 2,
  currentHalf: 3, ended: at(date, '10:30'),
  periods: { 0: { half: 1, start: at(date, '09:00'), end: at(date, '09:40') }, 1: { half: 2, start: at(date, '09:50'), end: at(date, '10:30') } },
  stints: { s1: { pid: 'p1', on: 0, off: 2400, role: 'Midfield' }, s3: { pid: 'p3', on: 0, off: 4800 } },
  planned: { p1: 80, p3: 40 },
  goals: Object.fromEntries(goals.map((g, i) => ['g' + i, g])),
  shots: { x: { t: 280, side: 'us', pid: 'p1', onTarget: true }, y: { t: 600, side: 'them', onTarget: false } }
});
const club = () => ({
  teams: {
    t1: {
      id: 't1', name: 'G14 Flight',
      players: {
        p1: { id: 'p1', name: ROSA, number: '7', guardians: { mum: true }, rating: 4 },
        p2: { id: 'p2', name: ELLA, number: '9', gk: true },
        p3: { id: 'p3', name: MIA, number: '4' }
      },
      events: { e1: { id: 'e1', kind: 'practice', title: 'Practice', date: '2026-09-15', start: '18:00', end: '19:00', coaches: { jaz: true, nn: true } } },
      attend: { e0: { p1: true, p3: false } }
    }
  },
  matches: {
    g1: played('g1', 'Riverside', '2026-09-05', [{ t: 300, side: 'us', pid: 'p1', assist: 'p3' }, { t: 900, side: 'them' }]),
    g2: { id: 'g2', teamId: 't1', opponent: 'Northgate', date: '2026-09-19', kickoff: '09:30', periodCount: 2, periodMinutes: 40, currentHalf: 1, periods: {}, stints: {}, planned: { p1: 40, p2: 40, p3: 40 } }
  },
  access: {
    org: { name: 'Lakeside SC' },
    admins: { boss: true },
    teams: { t1: { coaches: { jaz: true, nn: true }, trackers: { trk: true } } },
    index: { boss: true, jaz: true, trk: true, mum: true, nn: true },
    members: { boss: { name: 'Ada' }, jaz: { name: 'Jaz' }, mum: { name: 'Mo' } }
  }
});

(async () => {
  const A = H.loadApp({ firebase: makeFakebase(), storage: { 'sm.workspace': 'CLUB' }, config: CONFIG });
  A.fb = { db: {}, ref: (db, p) => p, set: () => Promise.resolve(), remove: () => Promise.resolve() };
  function as(uid, view, s = club(), more = () => { }) {
    A.state = s;
    A.me = uid ? { uid, name: uid, email: uid + '@x.test' } : null;
    A.appOwners = {};
    A.ui.teamId = 't1'; A.ui.matchId = null; A.ui.view = view; A.ui.gameFrom = null; A.ui.thread = null; A.ui.calSel = null;
    A.toasts.length = 0;
    A.closeSheet();
    more();
    A.render();
    return A.rendered();
  }
  const title = () => A.rendered('#titlebar');
  const sheet = () => A.rendered('#sheet');
  const count = (h, re) => (h.match(re) || []).length;

  console.log('--- Club home: the club once, and a chevron on what opens ---');
  {
    const h = as('boss', 'club');
    check('the club\'s name is on the crest row and nowhere else on the screen', count(h, /Lakeside SC/g), 1);
    check('— the title row carries it, as the switcher', /data-act="clubswitch"[^>]*>[\s\S]*?Lakeside SC/.test(title()), true);
    check('no heading repeating it', /<h2>Lakeside SC<\/h2>/.test(h), false);
    check('the crest row is not a button', /<button[^>]*class="clubhead"/.test(h), false);
    check('every card that opens something has a chevron', count(h, /<button class="card (tapcard|teamcard)"/g), count(h, /class="setgo"/g));
    check('— the Calendar card among them', /<button class="card tapcard" type="button" data-act="schedule">[\s\S]*?<b>Calendar<\/b>[\s\S]*?class="setgo"/.test(h), true);
    check('— and each team\'s', /<button class="card teamcard" data-act="goteam" data-id="t1">[\s\S]*?class="setgo"/.test(h), true);
  }

  console.log('\n--- Season: short, with Stats, Minutes and Attendance behind it ---');
  {
    let h = as('jaz', 'season');
    const sections = ['Shooting', 'Possession', 'Set pieces and fouls', 'What needs work', 'Game by game', '<h2>Minutes</h2>', '<h2>Attendance</h2>', 'Ask an AI'];
    check('none of the stats sections are on it', sections.filter(x => h.includes(x)).join(), '');
    check('the last result is', /Last game[\s\S]*?Riverside[\s\S]*?1<small>–1/.test(h), true);
    check('— naming no child', /Rosa|Mia|Ella/.test(h.slice(h.indexOf('Last game'), h.indexOf('Season so far'))), false);
    check('the record', /<h2>0W 1D 0L<\/h2>/.test(h), true);
    check('the games', /<h2>Games<\/h2>/.test(h) && /data-act="openmatch" data-id="g2"/.test(h), true);
    check('one row each into Stats, Minutes and Attendance', ['teamstats', 'minutes', 'attend'].every(v => new RegExp(`class="prow setrow" type="button" data-act="goview" data-v="${v}"`).test(h)), true);
    check('— the Minutes row says who is short, over and on plan', /data-v="minutes">[\s\S]*?<span class="psub">[^<]*short/.test(h), true);
    check('— the Attendance row what the register says', /data-v="attend">[\s\S]*?<span class="psub">(Practices: \d+ of \d+ came|No register taken yet)/.test(h), true);
    check('the calendar card stays, once', count(h, /In your own calendar/g), 1);

    A.click({ act: 'goview', v: 'teamstats' });
    h = A.rendered();
    check('Stats: the record, shooting and the AI prompt', A.ui.view === 'teamstats' && /<h2>Stats<\/h2>/.test(h) && /Shooting/.test(h) && /Ask an AI/.test(h), true);
    check('— with one finished game, no chart and no promise of one yet', /Game by game/.test(h), false);
    check('— the team over the club on the title row, with a back arrow', /G14 Flight/.test(title()) && /data-act="navback"/.test(title()), true);
    check('— at its own address', A.uiToHash(), '#/team/t1/stats');
    A.click({ act: 'navback' });
    check('Back is Season', A.ui.view, 'season');
    for (let i = 3; i <= 6; i++) A.state.matches['g' + i] = played('g' + i, 'Side ' + i, '2026-08-0' + i, [{ t: 100, side: 'us', pid: 'p3' }]);
    A.ui.view = 'teamstats'; A.render();
    check('five finished games: the charts', /Game by game/.test(A.rendered()) && /class="lcbox"/.test(A.rendered()), true);
    for (let i = 3; i <= 6; i++) delete A.state.matches['g' + i];

    h = as('jaz', 'minutes');
    check('Minutes: every player against her plan, the furthest behind first', /<h2>Minutes<\/h2>/.test(h) && h.indexOf(ROSA) < h.indexOf(MIA), true);
    check('— at its own address', A.uiToHash(), '#/team/t1/minutes');
    h = as('jaz', 'attend');
    check('Attendance: the register', /<h2>Attendance<\/h2>/.test(h) && /data-act="navback"/.test(title()), true);
    check('— at its own address', A.uiToHash(), '#/team/t1/attendance');
    check('a tracker reads Stats and Minutes', (as('trk', 'teamstats'), A.ui.view) + ' ' + (as('trk', 'minutes'), A.ui.view), 'teamstats minutes');
    check('— never the register, which she does not take', (as('trk', 'attend'), A.ui.view), 'season');
    check('a family sent to Minutes lands on her own Season', (as('mum', 'minutes'), A.ui.view) + ' ' + /Rosa’s season/.test(A.rendered()), 'season true');
    check('— and has no row into any of them', /data-v="teamstats"|data-v="minutes"|data-v="attend"/.test(as('mum', 'season')), false);
    for (const [hash, view] of [['#/team/t1/stats', 'teamstats'], ['#/team/t1/minutes', 'minutes'], ['#/team/t1/attendance', 'attend']]) {
      as('jaz', 'season'); global.location.hash = hash;
      check(`${hash} opens it`, A.hashToUi() && A.ui.view, view);
    }
    global.location.hash = '';
  }

  console.log('\n--- Players: nothing said for nothing, and the dots explained ---');
  {
    const h = as('jaz', 'roster');
    check('no "no profile yet"', /no profile yet/.test(h), false);
    check('a player with nothing to say has no line under her name', /<span class="pname">Mia Kowalski<\/span><\/span>/.test(h), true);
    check('one with something does', /<span class="pname">Ella Fitzgerald<\/span><span class="psub">keeper<\/span>/.test(h), true);
    check('the dots are explained by an info button', /dots: the coach’s rating <button class="infobtn" type="button" data-act="info" data-k="rating"/.test(h), true);
    A.click({ act: 'info', k: 'rating' });
    check('— which opens the words', /The dots beside each player/.test(sheet()) && /1 to 5/.test(sheet()), true);
    check('— and each row says its rating', /class="stars" aria-label="rated 4 of 5" title="Rating 4 of 5"/.test(h), true);
  }

  console.log('\n--- Calendar: a labelled picker, and "Earlier" ---');
  {
    const h = as('jaz', 'calendar', club(), () => { A.state.teams.t1.events.old = { id: 'old', kind: 'practice', title: 'Practice', date: '2026-09-08', start: '18:00', end: '19:00' }; });
    check('the calendars picker says Calendars', /<button type="button" class="calmenu" data-act="caltree"[^>]*>Calendars <span aria-hidden="true">▾<\/span><\/button>/.test(h), true);
    check('— no bare icon', /calmenu"[^>]*>\s*<svg/.test(h), false);
    check('what has happened is Earlier (n)', /data-act="calpast">Earlier \(\d+\)<\/button>/.test(h), true);
    A.click({ act: 'calpast' });
    check('— then Hide earlier', /data-act="calpast">Hide earlier \(\d+\)<\/button>/.test(A.rendered()), true);
    check('the + is there for a coach', /class="calfab"/.test(h), true);
  }

  console.log('\n--- a coach with no name is "the coach", mid-sentence ---');
  {
    as('boss', 'calendar');
    A.click({ act: 'calitem', k: 'practice', tid: 't1', id: 'e1' });
    check('a coach on record by name', />Call Jaz off</.test(sheet()), true);
    check('one with no name: the coach, not A coach', />Call the coach off</.test(sheet()) && !/Call A coach off/.test(sheet()), true);
    A.click({ act: 'awayout', u: 'nn', k: 'e:e1', tid: 't1', d: '2026-09-15' });
    check('— asked the same way', /Call the coach off\?/.test(sheet()), true);
  }

  console.log('\n--- Subs: orange for behind the pace, not for everyone ---');
  {
    const live = () => { const s = club(); s.matches.g2.periods = { 0: { half: 1, start: NOW - 20 * 60000 } }; s.matches.g2.stints = { a: { pid: 'p1', on: 0 }, b: { pid: 'p2', on: 0 } }; return s; };
    let h = as('jaz', 'game', live(), () => { A.ui.matchId = 'g2'; A.ui.gameView = 'subs'; });
    check('twenty minutes in, a player on since kick-off is on pace: plain', /data-pid="p1"[\s\S]*?<span class="diff even">20 short<\/span>/.test(h), true);
    check('one on the bench the whole time is behind: orange', /data-pid="p3"[\s\S]*?<span class="diff owed">40 short<\/span>/.test(h), true);
    check('the spot button says the spot alone', /class="lrspot" type="button" data-act="switchpos" data-pid="p1" aria-label="Set her spot">\s*<span>Spot<\/span><\/button>/.test(h), true);
    check('— no word stacked under it', /lrspot-hint/.test(h), false);
    h = as('jaz', 'game', club(), () => { A.ui.matchId = 'g2'; A.ui.gameView = 'subs'; });
    check('before kick-off nobody is orange', /diff owed/.test(h), false);
    check('— though everyone is short of a plan not started', count(h, /diff even">40 short/g), 3);
  }

  console.log('\n--- Lineup: the lineup leads ---');
  {
    let h = as('jaz', 'game', club(), () => { A.ui.matchId = 'g2'; A.ui.gameView = 'plan'; });
    check('no shape: one line and the button', /<h2[^>]*>Lineup<\/h2>\s*<p class="muted"[^>]*>Pick a shape \(4-3-3, 2-3-1, or one you saved\)/.test(h) && /data-act="editmatch" data-id="g2">Pick a shape/.test(h), true);
    check('— the detail behind an info button, not a paragraph', /data-act="info" data-k="snapshots"/.test(h) && !/This game has no shape/.test(h), true);
    check('— ahead of the game\'s details', h.indexOf('>Lineup<') < h.indexOf('<h2>Northgate</h2>'), true);
    check('Snapshots is not a heading any more', /<h2[^>]*>Snapshots<\/h2>/.test(h), false);
    A.click({ act: 'info', k: 'snapshots' });
    check('the info sheet explains a plan', /How a lineup is planned/.test(sheet()), true);
  }

  console.log('\n--- Sessions, for a family: what she can book, first ---');
  {
    const withSess = () => { const s = club(); s.sessions = { s1: { id: 's1', kind: 'group', title: 'Shooting', date: '2026-09-20', start: '17:00', end: '18:00', coach: 'jaz', coachName: 'Jaz', cap: 6, open: true, by: 'jaz' } }; return s; };
    let h = as('mum', 'sessions', withSess(), () => { A.sess.sessions = A.state.sessions; });
    check('a family gets no staff tabs', /data-act="sesstab"/.test(h), false);
    check('Book a session leads, with the open session under it', /<h2 class="sechead">Book a session<\/h2>/.test(h) && /Open to ask for[\s\S]*?Shooting/.test(h), true);
    check('— and no empty "Booked" card above it', /Booked and asked for/.test(h), false);
    h = as('mum', 'sessions', club(), () => { A.sess.sessions = {}; });
    check('nothing to book and nothing booked: one line, not five empty cards', /<strong>Nothing to book right now<\/strong>/.test(h) && !/Open to ask for|Booked and asked for|To pay/.test(h), true);
    check('— naming her own child', /Rosa’s age/.test(h), true);
  }

  console.log('\n--- People: a card per person on a phone ---');
  {
    const h = as('boss', 'people');
    check('the table carries the class the phone layout hangs off', /<div class="tablewrap people"><table class="grid">/.test(h), true);
    check('— one row per person, the buttons in the last cell', /<tr data-act="personrow" data-uid="jaz">[\s\S]*?<td class="right">[\s\S]*?data-act="personedit" data-uid="jaz"/.test(h), true);
  }

  console.log('\n--- welcome and lock: what to do, in a parent\'s words ---');
  {
    A.state = { teams: {}, matches: {}, access: {} }; A.me = null; A.denied = false; A.ui.view = 'club'; A.render();
    let h = A.rendered();
    check('signed out, no club: Sign in to see your team', /Sign in to see your team/.test(h) && !/open your club/.test(h), true);
    // the club refused the read: she is signed in, and nobody has given her a role
    as('nobody', 'club', club(), () => { A.denied = true; });
    h = A.rendered();
    check('signed in with no role: told nobody has added her yet', /Nobody has added you to a team yet/.test(h), true);
    check('— and what to do: the team link, or the invite', /Ask your coach for the team link, or open the invite you were sent/.test(h), true);
    check('— nothing about roles being granted', /role has been granted|Waiting for access|invite link/.test(h), false);
    A.me = null; A.render();
    check('signed out on a locked club: Sign in to see this club', /Sign in to see this club/.test(A.rendered()), true);
    A.denied = false;
  }

  H.summary('each screen on its own');
})();
