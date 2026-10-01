/* The calendar: the season in date order, for everyone who can see the team.

   What matters here, in the order it would hurt:

   - Nothing kept to the team reaches public/, and no child's name does either,
     even when a coach types one into a note. The share link gets forwarded —
     to grandparents, and now to the other team — so a practice's time and
     place, or a name, on that page is published to whoever ends up holding it.
   - Only the team's coach (or an admin) changes the calendar, checked against
     the team the button names, because "All my teams" puts several teams'
     entries on one screen.
   - A weekly practice is one entry per week, each written at the depth the
     rule on teams/$tid grants, so one week can be called off or moved and the
     rest stay put.
   - "Next" is the thing a parent has to get her daughter to: never something
     called off, never something already over, and a game being played beats
     everything.
   - The calendar file is one a phone will actually open: CRLF, folded lines,
     floating times, cancelled entries marked as cancelled. */

const H = require('./harness');
const { check, deepEq } = H;

/* With a Firebase config, as visibility.js boots: gated() is anyAdmins() &&
   fbConfig().apiKey, and without one nothing is gated and every "may not"
   below would pass by default. */
const A = H.loadApp({ config: { apiKey: 'k', databaseURL: 'https://x.test' } });
const I = require('../ics.js');
global.window.MinutesIcs = I;     // index.html loads ics.js ahead of app.js; the harness has no page

const MIN = 60000;
// local time, because the calendar reads the phone's own clock and dates
const at = (d, hhmm) => { const [y, m, dd] = d.split('-').map(Number); const [h, mi] = hhmm.split(':').map(Number); return new Date(y, m - 1, dd, h, mi).getTime(); };

let sets = [], removes = [];
function setup() {
  H.clock.set(at('2026-09-12', '10:00'));      // a Saturday morning
  A.state = {
    teams: {
      t1: {
        id: 't1', name: 'G14 Flight', share: 'sh_flight',
        players: {
          p1: { id: 'p1', name: 'Ella Fitzgerald', number: '7' },
          p2: { id: 'p2', name: 'Rosa Delgado', number: '4', guardians: { mumU: true } }
        },
        events: {
          e1: { id: 'e1', kind: 'practice', title: 'Practice', date: '2026-09-15', start: '18:00', end: '19:15', venue: 'Lakeside Park, field 2' },
          e2: { id: 'e2', kind: 'event', title: 'Team photo', date: '2026-09-20', start: '9:15', venue: 'Pavilion', public: true, notes: 'Full kit' },
          e3: { id: 'e3', kind: 'practice', title: 'Practice', date: '2026-09-12', start: '18:00', end: '19:15' }
        }
      },
      t2: {
        id: 't2', name: 'G12 Storm',
        players: { k1: { id: 'k1', name: 'Mia Kowalski', number: '9', guardians: { mumU: true } } },
        events: { s1: { id: 's1', kind: 'practice', title: 'Practice', date: '2026-09-14', start: '17:30' } }
      }
    },
    matches: {
      g1: { id: 'g1', teamId: 't1', opponent: 'Riverside', date: '2026-09-12', kickoff: '09:00', periodCount: 2, periodMinutes: 40, currentHalf: 3, ended: at('2026-09-12', '09:40'), periods: { 0: { half: 1, start: at('2026-09-12', '09:00'), end: at('2026-09-12', '09:40') } }, stints: {} },
      g2: { id: 'g2', teamId: 't1', opponent: 'Northgate', date: '2026-09-19', kickoff: '9:30', venue: 'Northgate Rec', home: 'away', arrive: '09:00', kit: 'Blue shirts', periodCount: 2, periodMinutes: 40, currentHalf: 1, periods: {}, stints: {} },
      g3: { id: 'g3', teamId: 't1', opponent: 'Hill End', date: '2026-09-26', kickoff: '10:00', called: 'cancelled', periodCount: 2, periodMinutes: 40, currentHalf: 1, periods: {}, stints: {} },
      g4: { id: 'g4', teamId: 't1', opponent: 'Eastfield', date: '', periodCount: 2, periodMinutes: 40, currentHalf: 1, periods: {}, stints: {} },
      g5: { id: 'g5', teamId: 't2', opponent: 'Lakeside B', date: '2026-09-13', kickoff: '11:00', periodCount: 4, periodMinutes: 12, currentHalf: 1, periods: {}, stints: {} }
    },
    access: {}
  };
  A.me = null;
  A.ui.teamId = 't1'; A.ui.matchId = null; A.ui.view = 'calendar';
  A.ui.calAll = false; A.ui.calPast = false; A.ui.calMonth = null;
  sets = []; removes = [];
  A.fb = {
    db: {}, base: 'workspaces/CLUB', ref: (db, path) => path,
    set: (path, v) => { sets.push([path, v]); return Promise.resolve(); },
    remove: path => { removes.push(path); return Promise.resolve(); }
  };
  A.toasts.length = 0;
}
const keys = tids => A.calItems(tids).map(x => x.key);
const html = () => { A.render(); return A.rendered(); };
const sheet = () => String(A.dom.node('#sheet').innerHTML || '');
const eventWrites = () => sets.filter(([p]) => /\/events\//.test(p)).map(([p]) => p);
function type(fields) {
  for (const [k, v] of Object.entries(fields)) A.dom.node('#' + k).value = v;
}
/* An admin and a club with roles, so gated() is true and the role checks bite.
   Without a Firebase config nothing is gated and every refusal would pass
   vacuously — visibility.js says why. */
function lockDown() {
  A.state.access = {
    admins: { bossU: true },
    teams: { t1: { coaches: { coachU: true }, trackers: { trackU: true } }, t2: { coaches: { stormU: true } } },
    index: { bossU: true, coachU: true, trackU: true, mumU: true, stormU: true }
  };
}

console.log('--- games and everything else, in the order they happen ---');
{
  setup();
  deepEq('dated first, by day then time; undated last', keys(['t1']), ['g:g1', 'e:e3', 'e:e1', 'g:g2', 'e:e2', 'g:g3', 'g:g4']);
  check('an imported "9:30" is the same kick-off as "09:30"', A.calItems(['t1']).find(x => x.id === 'g2').start, '09:30');
  check('a game is read, never copied into the calendar', Object.keys(A.state.teams.t1.events).includes('g2'), false);
  check('another team stays on its own calendar', keys(['t1']).some(k => k === 'e:s1' || k === 'g:g5'), false);
  A.state.matches.g2.date = '2026-09-22';
  check('moving a game moves it on the calendar', A.calItems(['t1']).findIndex(x => x.id === 'g2') > A.calItems(['t1']).findIndex(x => x.id === 'e2'), true);
}

console.log('--- over, still to come, and next ---');
{
  setup();
  const it = id => A.calItems(['t1']).find(x => x.id === id);
  check('a finished game is over, though it is today', A.calPast(it('g1')), true);
  check('tonight\'s practice is still to come at ten', A.calPast(it('e3')), false);
  check('so it is next', A.calNext(A.calItems(['t1'])).id, 'e3');
  H.clock.set(at('2026-09-12', '18:30'));
  check('half way through, it is still on', A.calPast(it('e3')), false);
  H.clock.set(at('2026-09-12', '19:15'));
  check('at its end time it is over', A.calPast(it('e3')), true);
  check('and next moves on to Tuesday', A.calNext(A.calItems(['t1'])).id, 'e1');
  A.state.teams.t1.events.late = { id: 'late', kind: 'event', title: 'Night game', date: '2026-09-12', start: '22:00', end: '01:00' };
  H.clock.set(at('2026-09-12', '23:30'));
  check('an end before the start runs past midnight', A.calPast(it('late')), false);

  setup();
  H.clock.set(at('2026-09-25', '12:00'));
  // the cancelled game is the only dated thing left, and the undated one has no day to be next on
  check('called off is never next', A.calNext(A.calItems(['t1'])), null);
  check('but it stays on the list, marked', A.calItems(['t1']).find(x => x.id === 'g3').called, 'cancelled');

  setup();
  A.state.matches.g2.periods = { 0: { half: 1, start: at('2026-09-12', '09:55') } };
  check('a game being played beats anything', A.calNext(A.calItems(['t1'])).id, 'g2');
}

console.log('--- the screen, for each role ---');
{
  setup(); lockDown();
  A.me = { uid: 'coachU', name: 'Jaz' };
  let h = html();
  check('the coach gets Add', /data-act="calnew"/.test(h), true);
  check('she sees which entries are on the share link', /on the share link/.test(h), true);
  check('a called-off game is struck through, not hidden', /data-called="1"/.test(h), true);
  check('undated games have their own place', /Date to be confirmed/.test(h), true);
  check('— with no time to show, it says TBC, not "All day"', /<span class="caltime">TBC<\/span>/.test(h), true);

  A.me = { uid: 'mumU', name: 'Mum' };
  h = html();
  check('a parent sees the calendar', /Coming up/.test(h), true);
  check('with tonight\'s practice in it', /data-id="e3"/.test(h), true);
  check('and no Add button', /data-act="calnew"/.test(h), false);
  check('what is on the share link is the coach\'s business, not hers', /on the share link/.test(h), false);
  check('two children on two teams: she can see both at once', /All my teams/.test(h), true);
  A.ui.calAll = true;
  h = html();
  check('all her teams on one calendar', /data-id="s1"/.test(h) && /data-id="e3"/.test(h), true);
  check('each entry says which team', /G12 Storm/.test(h) && /G14 Flight/.test(h), true);
  A.ui.calAll = false;

  A.ui.view = 'mine';
  h = html();
  check('My players: "next" is tonight\'s practice, not only games', /Next — Practice/.test(h), true);

  A.me = { uid: 'trackU', name: 'Tracker' };
  A.ui.view = 'calendar';
  check('a tracker sees it too', /Coming up/.test(html()), true);
  check('read only', /data-act="calnew"/.test(html()), false);
}

console.log('--- who may change it ---');
{
  setup(); lockDown();
  const tryAdd = (uid, tid) => {
    A.me = uid ? { uid, name: uid } : null;
    sets = []; A.toasts.length = 0;
    A.click({ act: 'calnew', tid });
    type({ evTitle: 'Practice', evDate: '2026-09-17', evStart: '18:00', evEnd: '19:00', evVenue: '', evNotes: '' });
    A.click({ act: 'calsave', tid });
    return eventWrites().length;
  };
  check('the team\'s coach adds a practice', tryAdd('coachU', 't1'), 1);
  check('an admin may too', tryAdd('bossU', 't2'), 1);
  check('a parent may not', tryAdd('mumU', 't1'), 0);
  check('and is told why', A.lastToast(), "Only this team's coaches can change that");
  check('a tracker may not', tryAdd('trackU', 't1'), 0);
  check('another team\'s coach may not, even with her own team open', (() => { A.ui.teamId = 't2'; return tryAdd('stormU', 't1'); })(), 0);
  A.ui.teamId = 't1';
  /* The edit actions answer to the team on the button, not whichever is open. */
  A.me = { uid: 'stormU' };
  check('mayAct reads the team on a calendar button', A.mayAct('caledit', null, { tid: 't1' }), false);
  check('— her own team\'s entry is fine', A.mayAct('caledit', null, { tid: 't2' }), true);
  check('looking needs nobody\'s permission', A.mayAct('calitem', null, { tid: 't1' }), true);
}

console.log('--- a practice every week ---');
{
  deepEq('Tuesdays and Thursdays, first to last inclusive', A.seriesDates('2026-09-01', '2026-09-17', [1, 3]),
    ['2026-09-01', '2026-09-03', '2026-09-08', '2026-09-10', '2026-09-15', '2026-09-17']);
  deepEq('a first day off the pattern starts at the next one', A.seriesDates('2026-09-02', '2026-09-09', [3]), ['2026-09-03']);
  deepEq('a last day before the first is just the one', A.seriesDates('2026-09-10', '2026-09-01', [3]), ['2026-09-10']);
  check('a mistyped year cannot write a decade of them', A.seriesDates('2026-09-01', '2036-09-01', [0, 1, 2, 3, 4]).length, A.SERIES_MAX);
  check('Monday is the first day of the week', A.weekdayOf('2026-09-14'), 0);

  setup(); lockDown();
  A.me = { uid: 'coachU', name: 'Jaz' };
  A.click({ act: 'calnew', tid: 't1' });
  check('a new practice starts from the last one\'s time and place', A.calForm.start + ' ' + A.calForm.venue, '18:00 Lakeside Park, field 2');
  type({ evTitle: '', evDate: '2026-09-22', evStart: '18:00', evEnd: '19:15', evVenue: 'Lakeside Park, field 2', evNotes: 'Bring water', evUntil: '2026-10-15' });
  A.click({ act: 'calrepeat', v: '1' });
  check('every week starts on the first date\'s weekday', JSON.stringify(A.calForm.days), '[1]');
  A.click({ act: 'calwd', v: '3' });
  check('typing survived the chip taps', A.calForm.notes, 'Bring water');
  check('the sheet says how many before saving', /Add 8 practices/.test(sheet()), true);
  A.click({ act: 'calsave', tid: 't1' });
  const made = Object.values(A.state.teams.t1.events).filter(e => e.notes === 'Bring water');
  check('eight entries, one per session', made.length, 8);
  check('sharing one series', new Set(made.map(e => e.series)).size, 1);
  check('each written at teams/{tid}/events/{eid}, the depth the rule grants', eventWrites().every(p => /^workspaces\/CLUB\/teams\/t1\/events\/[\w]+$/.test(p)), true);
  check('one write per entry, nothing at the collection', eventWrites().length, 8);
  check('kept to the team unless the coach says otherwise', made.every(e => !e.public), true);
  check('a blank title reads Practice', made.every(e => e.title === 'Practice'), true);
  check('stamped with who added it', made.every(e => e.by === 'coachU'), true);
  check('the coach is told', A.lastToast(), 'Added 8 practices');

  /* Just this one */
  const byDate = () => Object.values(A.state.teams.t1.events).filter(e => e.series === made[0].series).sort((a, b) => a.date.localeCompare(b.date));
  const third = byDate()[2];
  A.click({ act: 'caledit', tid: 't1', id: third.id });
  type({ evTitle: 'Practice', evDate: third.date, evStart: '17:00', evEnd: '18:00', evVenue: 'Indoor hall', evNotes: 'Bring water' });
  sets = [];
  A.click({ act: 'calsave', tid: 't1' });
  check('just this one: it moves', A.state.teams.t1.events[third.id].venue, 'Indoor hall');
  check('— and nothing else does', byDate().filter(e => e.venue === 'Indoor hall').length, 1);
  check('— one write', eventWrites().length, 1);

  /* This and every later one */
  const fifth = byDate()[4];
  A.click({ act: 'caledit', tid: 't1', id: fifth.id });
  type({ evTitle: 'Practice', evDate: fifth.date, evStart: '18:30', evEnd: '19:45', evVenue: 'Lakeside Park, field 2', evNotes: 'Bring water' });
  A.click({ act: 'calscopeed', v: 'later' });
  sets = [];
  A.click({ act: 'calsave', tid: 't1' });
  deepEq('this and later: from the fifth on, the new time', byDate().map(e => e.start), ['18:00', '18:00', '17:00', '18:00', '18:30', '18:30', '18:30', '18:30']);
  check('— each keeps its own date', new Set(byDate().map(e => e.date)).size, 8);
  check('— four writes', eventWrites().length, 4);

  /* Calling one off */
  const second = byDate()[1];
  A.click({ act: 'caledit', tid: 't1', id: second.id });
  sets = [];
  A.click({ act: 'calcall', tid: 't1' });
  check('called off, not deleted', A.state.teams.t1.events[second.id].called, 'cancelled');
  check('— one small write, below the entry', eventWrites().join(), `workspaces/CLUB/teams/t1/events/${second.id}/called`);
  check('— never next', A.calNext(A.calItems(['t1'])).id !== second.id, true);
  A.click({ act: 'caledit', tid: 't1', id: second.id });
  A.click({ act: 'calcall', tid: 't1' });
  check('and back on again', A.state.teams.t1.events[second.id].called == null, true);

  /* Deleting the rest */
  const sixth = byDate()[5];
  A.click({ act: 'caledit', tid: 't1', id: sixth.id });
  A.click({ act: 'calscopeed', v: 'later' });
  removes = [];
  A.click({ act: 'caldel', tid: 't1' });
  check('delete this and later: three gone', byDate().length, 5);
  check('— each removed at its own path', removes.length === 3 && removes.every(p => /\/events\/\w+$/.test(p)), true);
}

console.log('--- the share link: only what was marked, and never a name ---');
{
  setup();
  const doc = () => A.publicDoc(A.state.teams.t1);
  deepEq('only the entry marked for the share link', Object.keys(doc().events), ['e2']);
  check('a practice kept to the team is nowhere in it', JSON.stringify(doc()).includes('Lakeside Park, field 2'), false);
  deepEq('only what a family needs to turn up', Object.keys(doc().events.e2).sort(), ['called', 'date', 'end', 'kind', 'notes', 'start', 'title', 'venue']);
  const g2 = doc().games.g2;
  check('a game carries home or away', g2.home, 'away');
  check('and when to arrive', g2.arrive, '09:00');
  check('and the kit', g2.kit, 'Blue shirts');
  check('a called-off game says so', doc().games.g3.called, 'cancelled');

  /* The blunt check stats.js makes, against the new free text. */
  const ev = A.state.teams.t1.events.e2;
  ev.title = "Ella Fitzgerald's birthday party";
  ev.notes = 'Rosa brings snacks; ask DELGADO family about lifts';
  ev.venue = 'The Fitzgerald house';
  A.state.matches.g2.notes = 'Ella in goal';
  A.state.matches.g2.kit = 'Rosa will bring the spare bibs';
  const pub = JSON.stringify(doc());
  const leaked = [];
  for (const t of Object.values(A.state.teams)) for (const p of Object.values(t.players || {}))
    for (const w of [p.name, ...p.name.split(' ')]) if (new RegExp('\\b' + w + '\\b', 'i').test(pub)) leaked.push(w);
  check('no roster name in the published document', leaked.join(',') || 'none', 'none');
  check('the title still reads', doc().events.e2.title, "a player's birthday party");
  check('so does the game note', doc().games.g2.notes, 'a player in goal');

  /* And the coach is told, because "a player" on the season page with no
     explanation reads like a bug. */
  lockDown(); A.me = { uid: 'coachU' };
  A.click({ act: 'caledit', tid: 't1', id: 'e2' });
  type({ evTitle: "Ella's party", evDate: '2026-09-20', evStart: '09:15', evEnd: '', evVenue: 'Pavilion', evNotes: '' });
  A.click({ act: 'calsave', tid: 't1' });
  check('saving a public entry with a name in it says so', /left off the share link/.test(A.lastToast()), true);
  A.click({ act: 'caledit', tid: 't1', id: 'e1' });
  type({ evTitle: "Ella's party", evDate: '2026-09-15', evStart: '18:00', evEnd: '19:15', evVenue: '', evNotes: '' });
  A.click({ act: 'calsave', tid: 't1' });
  check('a team-only one does not need to', A.lastToast(), 'Saved');
}

console.log('--- the calendar file ---');
{
  setup();
  const items = A.calItems(['t1']).filter(x => x.date).map(A.icsItem);
  const ics = I.calendar('G14 Flight', items, Date.UTC(2026, 8, 12, 10, 0, 0));
  check('CRLF line ends throughout', ics.split('\r\n').length > 10 && !/[^\r]\n/.test(ics), true);
  check('wrapped in one calendar', ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0') && ics.endsWith('END:VCALENDAR\r\n'), true);
  check('one entry per dated item', (ics.match(/BEGIN:VEVENT/g) || []).length, 6);
  check('kick-off as floating local time, no zone', /DTSTART:20260919T093000\r\n/.test(ics), true);
  check('ends after two halves and the breaks', /DTEND:20260919T110500\r\n/.test(ics), true);
  check('the team is in the title', /SUMMARY:G14 Flight v Northgate/.test(ics), true);
  check('arrive-by and kit in the description', /DESCRIPTION:Away\\nArrive by 9am\\nKit: Blue shirts/.test(ics), true);
  check('cancelled is the calendar\'s own cancelled', /SUMMARY:CANCELLED: G14 Flight v Hill End[\s\S]*?STATUS:CANCELLED/.test(ics), true);
  check('the uid is the entry\'s own id', /UID:g2@minutes/.test(ics), true);
  check('DTSTAMP is UTC', /DTSTAMP:20260912T100000Z/.test(ics), true);

  const allDay = I.calendar('x', [{ uid: 'a', title: 'Tournament', date: '2026-12-31' }], 0);
  check('no time is an all-day entry', /DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101/.test(allDay), true);
  const esc = I.calendar('x', [{ uid: 'b', title: 'Practice; drills, games', date: '2026-09-15', start: '18:00', desc: 'Line one\nLine two \\ done' }], 0);
  check('commas, semicolons and backslashes escaped', /SUMMARY:Practice\\; drills\\, games/.test(esc), true);
  check('a line break is \\n', /DESCRIPTION:Line one\\nLine two \\\\ done/.test(esc), true);
  const long = I.calendar('x', [{ uid: 'c', title: 'Ünïcødé '.repeat(20), date: '2026-09-15' }], 0);
  const octets = long.split('\r\n').map(l => Buffer.byteLength(l, 'utf8'));
  check('no line longer than 75 octets', Math.max(...octets) <= 75, true);
  check('and it unfolds back to what went in', long.replace(/\r\n /g, '').includes('SUMMARY:' + 'Ünïcødé '.repeat(20).replace(/,/g, '\\,')), true);
  const wrap = I.span({ date: '2026-09-12', start: '22:00', end: '01:00' });
  check('an end before the start finishes the next day', wrap.end.date + ' ' + wrap.end.time, '2026-09-13 01:00');

  const gl = I.googleLink(A.icsItem(A.calItems(['t1']).find(x => x.id === 'g2')));
  check('the Google link opens pre-filled', gl.startsWith('https://calendar.google.com/calendar/render?action=TEMPLATE&text=G14%20Flight%20v%20Northgate&dates=20260919T093000/20260919T110500'), true);
  check('with the place in it', /location=Northgate%20Rec/.test(gl), true);
  check('directions are a search for the place as typed', I.mapLink('Lakeside Park, field 3'), 'https://www.google.com/maps/search/?api=1&query=Lakeside%20Park%2C%20field%203');
  check('a file name a phone will take', I.fileName('G14 Flight: Practice'), 'G14-Flight-Practice.ics');
}

console.log('--- for the other team ---');
{
  setup();
  const t = A.state.teams.t1, m = A.state.matches.g2;
  const msg = A.opponentMessage(t, m);
  check('away: their name first, as the fixture reads', msg.startsWith('Northgate v G14 Flight: Sat 19 Sep, kick-off 9:30am.'), true);
  check('where, with directions', /Where: Northgate Rec — https:\/\/www\.google\.com\/maps/.test(msg), true);
  check('what we wear, so the kits do not clash', /We will be in Blue shirts\./.test(msg), true);
  check('the game page, for the live score', msg.includes('game.html?t=sh_flight&g=g2'), true);
  check('arrive-by is for our families, not theirs', /9:00|9am/.test(msg.replace('9:30am', '')), false);
  m.home = 'home';
  check('at home, ours first', A.opponentMessage(t, m).startsWith('G14 Flight v Northgate'), true);
  check('called off says so plainly', A.opponentMessage(t, A.state.matches.g3), 'G14 Flight v Hill End on Sat 26 Sep is cancelled.\nDetails and the live score: https://x.test/game.html?t=sh_flight&g=g3');
  delete t.share;
  check('no share link, no link in it', /game\.html/.test(A.opponentMessage(t, m)), false);
}

console.log('--- links in and out ---');
{
  setup();
  A.ui.view = 'calendar';
  check('the calendar has its own address', A.uiToHash(), '#/team/t1/calendar');
  A.ui.view = 'matches';
  global.location.hash = '#/team/t2/calendar';
  check('and a link to it opens it', A.hashToUi() && A.ui.view + ' ' + A.ui.teamId, 'calendar t2');
  global.location.hash = '';
}

console.log('--- the game sheet carries the schedule ---');
{
  setup(); lockDown();
  A.me = { uid: 'coachU' };
  A.ui.matchId = 'g2';
  A.click({ act: 'editmatch', id: 'g2' });
  type({ mOpp: 'Northgate', mDate: '2026-09-19', mKick: '09:30', mVenue: 'Northgate Rec', mHome: 'home', mArrive: '9:05', mKit: 'Green', mNotes: 'Pitch 4', mCalled: 'postponed', mCount: '2', mLen: '40', mSide: '9', mShape: 'keep', mVeo: '' });
  A.click({ act: 'savematch', id: 'g2' });
  const g = A.state.matches.g2;
  deepEq('home, arrive-by, kit, notes and status saved', [g.home, g.arrive, g.kit, g.notes, g.called], ['home', '09:05', 'Green', 'Pitch 4', 'postponed']);
  check('postponed shows on the calendar', A.calItems(['t1']).find(x => x.id === 'g2').called, 'postponed');
  A.ui.view = 'matches';
  check('and on the games list', /Postponed/.test(html()), true);
  type({ mCalled: '' });
  A.click({ act: 'savematch', id: 'g2' });
  check('and back on', A.state.matches.g2.called, '');
}

H.summary('the calendar');
