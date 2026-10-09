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
   - A club's whole season is a thousand entries, so nothing draws it whole:
     a day, a week or a month at a time, the Schedule paged, and teams and
     kinds ticked off in a tree, as a calendar app does. Day and Week are the
     hours with each entry where it falls, overlaps side by side and a "+n"
     past what fits; Month is the grid with what's on in each day.
   - It is the one calendar: the open team, My calendar or All teams is a
     choice made on it, offered only when it shows something more.
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
  A.ui.calSel = null; A.ui.calPast = false; A.ui.calMonth = null; A.ui.calMini = false; A.ui.myCal = null;
  A.ui.calView = null; A.ui.calDay = null; A.ui.calOff = {}; A.ui.calKOff = {}; A.ui.calN = {}; A.ui.calTree = false;
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
  check('— with no time to show, it says TBC, not "All day"', /<span class="ev-sub">TBC<\/span>/.test(h), true);

  A.me = { uid: 'mumU', name: 'Mum' };
  h = html();
  check('a parent sees the calendar', /class="agenda"/.test(h), true);
  check('with tonight\'s practice in it', /data-id="e3"/.test(h), true);
  check('and no Add button', /data-act="calnew"/.test(h), false);
  check('what is on the share link is the coach\'s business, not hers', /on the share link/.test(h), false);
  // the Calendar is hers, not the open team's: both children's teams at once, with nothing to choose
  check('two children on two teams: her calendar has both', A.calSel(), 'mine');
  check('— and no All teams, which would show her nothing more', /data-act="calscope"/.test(h), false);
  check('all her teams on one calendar', /data-id="s1"/.test(h) && /data-id="e3"/.test(h), true);
  check('each entry says which team', /G12 Storm/.test(h) && /G14 Flight/.test(h), true);
  check('in its own colour', h.includes('--ev:' + A.teamHue('t1')) && h.includes('--ev:' + A.teamHue('t2')), true);
  A.ui.calSel = null;

  A.ui.view = 'mine';
  h = html();
  check('My players: "next" is tonight\'s practice, not only games', /Next — Practice/.test(h), true);

  A.me = { uid: 'trackU', name: 'Tracker' };
  A.ui.view = 'calendar';
  check('a tracker sees it too', /class="agenda"/.test(html()), true);
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
  check('— two small writes below the entry: who did it, then what', eventWrites().join(), `workspaces/CLUB/teams/t1/events/${second.id}/edit,workspaces/CLUB/teams/t1/events/${second.id}/called`);
  {
    const st = (sets.find(([p]) => p.endsWith('/edit')) || [])[1] || {};
    check('— the stamp is hers, and now', st.by + ' ' + (st.at === A.nowMs()), A.me.uid + ' true');
  }
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
  check('no game page until the game has its own id', /Details and the live score/.test(msg), false);
  m.share = 'f_g2'; A.state.matches.g3.share = 'f_g3';
  check('the game page, for the live score', A.opponentMessage(t, m).includes('game.html?t=f_g2&g=g2'), true);
  check('— never the season link', A.opponentMessage(t, m).includes('sh_flight'), false);
  check('arrive-by is for our families, not theirs', /9:00|9am/.test(msg.replace('9:30am', '')), false);
  m.home = 'home';
  check('at home, ours first', A.opponentMessage(t, m).startsWith('G14 Flight v Northgate'), true);
  check('called off says so plainly', A.opponentMessage(t, A.state.matches.g3), 'G14 Flight v Hill End on Sat 26 Sep is cancelled.\nDetails and the live score: https://x.test/game.html?t=f_g3&g=g3');
  delete t.share;
  check('no share link, no link in it', /game\.html/.test(A.opponentMessage(t, m)), false);
}

console.log('--- links in and out ---');
{
  setup();
  A.ui.view = 'calendar';
  // the person's, so no team in it
  check('the calendar has its own address', A.uiToHash(), '#/calendar');
  A.ui.view = 'matches';
  global.location.hash = '#/team/t2/calendar';
  check('and a team calendar\'s old link opens it, with that team on it', A.hashToUi() && A.ui.view + ' ' + A.ui.teamId + ' ' + A.calTeams().includes('t2'), 'calendar t2 true');
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

console.log('--- a game link reaches that game and nothing else ---');
{
  setup(); lockDown();
  const pubWrites = () => sets.filter(([p]) => p.startsWith('public/')).map(([p]) => p);
  A.me = { uid: 'mumU' };
  check('a parent\'s phone never makes a game\'s id', A.ensureFixtureShares(A.state.teams.t1), false);
  A.me = { uid: 'coachU' };
  check('the coach\'s phone gives every game its own', A.ensureFixtureShares(A.state.teams.t1), true);
  const games = A.teamMatches('t1');
  check('— one each, none the season\'s', games.every(m => m.share && m.share !== 'sh_flight') && new Set(games.map(m => m.share)).size === games.length, true);
  check('— written at the depth the match rule grants', sets.filter(([p]) => /\/matches\/\w+\/share$/.test(p)).length, games.length);
  const g2 = A.state.matches.g2;
  const fx = A.fixtureDoc(A.state.teams.t1, g2);
  deepEq('a game\'s own page holds that game alone', Object.keys(fx.games), ['g2']);
  check('marked as one game, with no season behind it', fx.fixture + ' ' + ('record' in fx) + ' ' + ('events' in fx), 'g2 false false');

  /* Only the server writes the pages (functions/mirror.js; test/mirror.js
     builds them from these same games and holds them to fixtureDoc()). */
  g2.kickoff = '10:15';
  sets = [];
  A.click({ act: 'sharesheet' });
  check('the coach\'s phone writes no page, whatever changed', pubWrites().length, 0);
  const before = games.map(m => m.share);
  removes = [];
  A.ui.matchId = null;
  A.click({ act: 'rotateshare' });
  check('a new season link replaces every game\'s too', A.teamMatches('t1').every((m, i) => m.share && m.share !== before[i]), true);
  check('the old pages are the server\'s to take down: the phone writes nothing to public/', removes.some(p => /^(public|shareOwners)\//.test(p)) || pubWrites().length > 0, false);

  const gone = A.state.matches.g3.share;
  removes = [];
  A.click({ act: 'delmatch', id: 'g3' });
  check('deleting a game: its id goes with it, which is what the server takes its page down on', !!gone && !A.state.matches.g3 && removes.some(p => /\/matches\/g3$/.test(p)), true);
  check('— and the phone itself removes nothing in public/', removes.some(p => /^(public|shareOwners)\//.test(p)), false);
}


console.log('--- a deletion says who made it ---');
{
  // the server tells the admins what was deleted, and leaves out (and names) whoever did it
  setup(); lockDown(); A.me = { uid: 'coachU', name: 'Jaz' };
  A.click({ act: 'caledit', tid: 't1', id: 'e1' });
  A.click({ act: 'caldel', tid: 't1' });
  const stamp = sets.find(([p]) => /teams\/t1\/events\/e1\/edit$/.test(p));
  check('an entry deleted is stamped with who deleted it, just before', !!stamp && stamp[1].by, 'coachU');
  check('then deleted', removes.some(p => /teams\/t1\/events\/e1$/.test(p)), true);
  sets = [];
  A.click({ act: 'delmatch', id: 'g3' });
  const g = sets.find(([p]) => /matches\/g3\/edit$/.test(p));
  check('so is a game, though it is gone from the phone by then', !!g && g[1].by, 'coachU');
  setup(); lockDown(); A.me = { uid: 'trackU' };
  A.click({ act: 'delmatch', id: 'g3' });
  check('a tracker stamps nothing in her name', sets.some(([p]) => /\/edit$/.test(p)), false);
}

console.log('--- a club\'s whole season: views, the tree of calendars, and paging ---');
{
  setup();
  A.me = { uid: 'mumU', name: 'Mum' };
  const rows = h => (h.match(/class="ev"/g) || []).length;
  // a season's worth behind her (and this morning's game, which is over too): sixty practices already over
  for (let i = 1; i <= 60; i++) A.state.teams.t1.events['old' + i] = { id: 'old' + i, kind: 'practice', title: 'Practice', date: A.addDays('2026-09-11', -i), start: '18:00', end: '19:00' };
  A.ui.calPast = true;
  let h = html();
  check('the Schedule is the view nobody has chosen one', A.calView() + ' ' + /class="agenda"/.test(h), 'schedule true');
  const days = [...h.matchAll(/<div class="agdate" aria-label="([^"]+)"/g)].map(x => x[1]);
  check('each day once, the date down the left', days.length > 5 && new Set(days).size === days.length, true);
  check('what has happened says how much there is', /already happened \(61\)/.test(h), true);
  check('but draws one page of it, not all of it', /data-id="old24"/.test(h) && !/data-id="old25"/.test(h), true);
  check('in the order it happened, up to now', h.indexOf('data-id="old2"') < h.indexOf('data-id="old1"') && h.indexOf('data-id="g1"') < h.indexOf('class="agline"') && h.indexOf('class="agline"') < h.lastIndexOf('data-id="e3"'), true);
  check('with a button for the rest', /data-act="calmore" data-k="past"/.test(h), true);
  A.click({ act: 'calmore', k: 'past' });
  h = html();
  check('which draws the next page', /data-id="old49"/.test(h) && !/data-id="old50"/.test(h), true);
  A.click({ act: 'calmore', k: 'past' });
  check('until there is no more', /data-k="past"/.test(html()), false);
  check('an old name for it is still the Schedule', (A.click({ act: 'calview', v: 'list' }), A.calView()), 'schedule');

  A.click({ act: 'calview', v: 'day' });
  h = html();
  check('the day view is today', /data-id="e3"/.test(h) && !/data-id="e1"/.test(h), true);
  check('drawn on the hours, where it falls', /class="tg"[^>]*--cols:1/.test(h) && /data-act="calitem" data-k="practice" data-tid="t1" data-id="e3" class="tg-ev"[^>]*top:calc\(var\(--hr\) \* 11\.000\)/.test(h), true);
  check('the bar says which day', /Sat 12 Sep · Today/.test(h), true);
  A.click({ act: 'calstep', v: 1 });
  check('forward a day is Sunday, her other child\'s game', /data-id="g5"/.test(html()), true);
  A.click({ act: 'calpick', v: '2026-09-16' });
  check('a day with nothing on says so', /Nothing on/.test(html()), true);
  A.click({ act: 'calpick', v: '2026-09-15' });
  check('the week strip picks a day', /data-id="e1"/.test(html()), true);
  A.click({ act: 'calpick', v: 'not a day' });
  check('— and nothing else', A.ui.calDay, '2026-09-15');
  A.click({ act: 'calstep', v: 0 });
  check('back to today', A.ui.calDay, null);

  A.click({ act: 'calview', v: 'week' });
  h = html();
  check('the week is seven days, Monday first', (h.match(/class="tg-day"/g) || []).length === 7 && /data-v="2026-09-07"[^>]*aria-label="Mon 7 Sep"/.test(h), true);
  check('side by side on the hours', /class="tg tg-week"[^>]*--cols:7/.test(h), true);
  check('with this week\'s entries and not next week\'s', /data-id="e3"/.test(h) && /data-id="old1"/.test(h) && !/data-id="e1"/.test(h), true);
  check('what is over is faded', /data-id="old1" class="tg-ev" data-called="0" data-past="1"/.test(h), true);
  A.click({ act: 'calstep', v: 1 });
  check('next week has Tuesday\'s practice', /data-id="e1"/.test(html()), true);
  A.click({ act: 'calgoday', v: '2026-09-15' });
  check('a day\'s heading opens that day', A.calView() + ' ' + A.ui.calDay, 'day 2026-09-15');
  A.click({ act: 'calview', v: 'week' });

  A.click({ act: 'calview', v: 'month' });
  h = html();
  check('the month is the grid', /class="mg-grid"/.test(h) && /data-act="calpick"/.test(h), true);
  check('six weeks or fewer, whole weeks', (h.match(/class="mg-cell"/g) || []).length % 7, 0);
  check('what is on is in the day, by name', /class="mg-ev"[^>]*>(<span class="mg-x">[^<]*<\/span>)*v Northgate</.test(h), true);
  check('under it, the day being looked at', /data-v="2026-09-15"[^>]*data-sel="1"/.test(h) && /data-id="e1"/.test(h) && !/data-id="g2"/.test(h), true);
  A.click({ act: 'calpick', v: '2026-09-19' });
  h = html();
  check('a day tapped is the one listed', /data-v="2026-09-19"[^>]*data-sel="1"/.test(h) && /data-id="g2"/.test(h) && !/data-id="e1"/.test(h), true);
  A.click({ act: 'calstep', v: 1 });
  check('forward a month is October, on its first', A.ui.calDay, '2026-10-01');
  A.click({ act: 'calstep', v: -1 });
  check('and back is this month, on today', A.ui.calDay, null);
  A.click({ act: 'calview', v: 'nonsense' });
  check('an unknown view is refused', A.ui.calView, 'month');

  console.log('  (the small month under the title)');
  A.click({ act: 'calview', v: 'schedule' });
  A.click({ act: 'calmini' });
  h = html();
  check('the title opens a small month', /class="calmini"/.test(h) && /data-act="calpick" data-v="2026-09-24"/.test(h), true);
  A.click({ act: 'calpick', v: '2026-09-24' });
  check('a day picked on the Schedule opens that day', A.calView() + ' ' + A.ui.calDay + ' ' + !!A.ui.calMini, 'day 2026-09-24 false');
  A.click({ act: 'calstep', v: 0 });
  A.click({ act: 'calview', v: 'schedule' });

  console.log('  (the hours)');
  {
    const at = (id, start, end, extra = {}) => ({ key: id, id, kind: 'practice', tid: 't1', date: '2026-09-15', start, end, mins: 0, title: id, ...extra });
    const lay = A.layDay([at('a', '18:00', '19:00'), at('b', '18:30', '19:30'), at('c', '20:00', '21:00')], 3);
    check('two at once share the width', lay.filter(x => x.n === 2).map(x => x.it.id + x.col).join(), 'a0,b1');
    check('one on its own has it all', lay.find(x => x.it && x.it.id === 'c').n, 1);
    const many = A.layDay(['p', 'q', 'r', 's', 't'].map(id => at(id, '18:00', '19:00')), 3);
    check('past three at once, the rest are "+n"', many.filter(x => !x.more).length + ' ' + (many.find(x => x.more) || {}).more, '2 3');
    check('an evening runs to its end', A.gridHours([at('x', '19:00', '22:30')]).join(), '7,23');
    check('an early start opens the morning', A.gridHours([at('x', '06:15', '07:00')]).join(), '6,21');
    check('past midnight stops at the bottom of the day', A.gridHours([at('x', '23:00', '01:00')]).join(), '7,24');
    check('a game runs as long as it is played', A.gridHours([{ ...at('g', '19:00', ''), kind: 'game', mins: 95 }]).join(), '7,21');
    check('a time is written the short way', [A.evWhen(at('a', '18:00', '19:15')), A.evWhen(at('a', '11:30', '13:00')), A.evWhen(at('a', '', '')), A.evWhen({ start: '' })].join(' | '), '6–7:15pm | 11:30am–1pm | All day | TBC');
  }

  console.log('  (the time now)');
  {
    // a red line where now falls in today's list, as the hours have one: under the month, and on the Schedule
    const at = (d, start, id) => ({ key: id, id, kind: 'practice', tid: 't1', date: d, start, end: '', mins: 0, title: id });
    const today = '2026-09-12', lines = x => (x.match(/class="agline"/g) || []).length;     // ten in the morning
    let x = A.calDayList([at(today, '09:00', 'a'), at(today, '18:00', 'b')], today, false, '');
    check('today has a red line at the time now, between what has started and what is to come', lines(x) === 1 && x.indexOf('data-id="a"') < x.indexOf('agline') && x.indexOf('agline') < x.indexOf('data-id="b"'), true);
    x = A.calDayList([at(today, '', 'z'), at(today, '11:00', 'a')], today, false, '');
    check('before the first thing to come, with all day above it', x.indexOf('data-id="z"') < x.indexOf('agline') && x.indexOf('agline') < x.indexOf('data-id="a"'), true);
    x = A.calDayList([at(today, '08:00', 'a'), at(today, '09:30', 'b')], today, false, '');
    check('after the last, once everything has started', x.indexOf('data-id="b"') < x.indexOf('agline') && lines(x) === 1, true);
    x = A.calDayList([], today, false, '');
    check('a today with nothing on still says where now is', lines(x) + ' ' + /Nothing on/.test(x), '1 true');
    check('another day has no line', lines(A.calDayList([at('2026-09-13', '18:00', 'a')], '2026-09-13', false, '')) + lines(A.calDayList([], '2026-09-11', false, '')), 0);
    H.clock.set(new Date(2026, 8, 12, 18, 0).getTime());
    x = A.calDayList([at(today, '18:00', 'a'), at(today, '18:01', 'b')], today, false, '');
    check('at six, a six o\'clock start has started', x.indexOf('data-id="a"') < x.indexOf('agline') && x.indexOf('agline') < x.indexOf('data-id="b"'), true);
    H.clock.set(new Date(2026, 8, 12, 10, 0).getTime());
    x = A.calAgenda([at('2026-09-13', '18:00', 'a')], false, { today: true });
    check('on the Schedule, today with nothing left in it is still there, with the line', /data-today="1"/.test(x) && lines(x) === 1 && x.indexOf('agline') < x.indexOf('data-id="a"') && /Nothing else on today/.test(x), true);
    check('— but not past the end of the list, where nothing is to come', /data-today="1"/.test(A.calAgenda([at('2026-09-11', '18:00', 'a')], false, { today: true })), false);
    A.ui.calView = 'month'; A.ui.calDay = null;
    const h2 = html();
    check('under the month, today\'s list has it', lines(h2.slice(h2.indexOf('class="calhead"'))), 1);
    A.click({ act: 'calpick', v: '2026-09-15' });
    check('a day tapped that isn\'t today has none', lines(html()), 0);
    A.ui.calView = 'schedule'; A.ui.calDay = null;
  }

  console.log('  (the tree)');
  // nobody signed in, before a club has an admin: every team is anybody's to look at
  setup();
  A.click({ act: 'caltree' });
  h = html();
  deepEq('All teams, and no My calendar for nobody', A.calSels(), ['club']);
  check('one calendar on offer is no choice, and is not drawn', /data-act="calscope"/.test(h), false);
  check('the tree lists both teams', /data-act="caltog" data-tid="t1"/.test(h) && /data-act="caltog" data-tid="t2"/.test(h), true);
  check('every team ticked to start, the open one no different', A.calTeams().sort().join(), 't1,t2');
  check('each entry carries its team\'s colour', h.includes('--ev:' + A.teamHue('t1')) && h.includes('--ev:' + A.teamHue('t2')), true);
  check('two teams, two colours', A.teamHue('t1') !== A.teamHue('t2'), true);
  check('and its name', /<b class="ev-team">G12 Storm<\/b>/.test(h), true);
  A.click({ act: 'caltog', tid: 't1' });
  check('a team can be unticked, the open one too', A.calTeams().join(), 't2');
  h = html();
  check('— and the calendar shows only the other', /data-id="s1"/.test(h) && !/data-id="e3"/.test(h), true);
  check('— and says how many are showing', /1 of 2 teams/.test(h), true);
  A.click({ act: 'caltog', tid: 't1' });
  check('ticked again, both', A.calTeams().sort().join() + ' ' + A.ui.calSel, 't1,t2 club');
  A.click({ act: 'caltog', g: 'all' });
  check('the club unticks every team when all are ticked', A.calTeams().length, 0);
  check('nothing ticked is an empty calendar, said', /No calendars ticked/.test(html()), true);
  A.click({ act: 'caltog', g: 'all' });
  check('and ticks them all again', A.calTeams().sort().join(), 't1,t2');
  A.click({ act: 'calscope', v: 'mine' });
  check('a calendar not on offer is refused', A.calSel(), 'club');
  A.ui.calSel = 'team';
  check('the open team\'s calendar is gone: a phone that had it chosen gets what is on offer', A.calSel(), 'club');
  A.click({ act: 'caltog', tid: 'nobodys' });
  check('a team she cannot see is never ticked', A.calTeams().sort().join(), 't1,t2');
  A.click({ act: 'teamcal', tid: 't2' });
  check('a team\'s Season links to the calendar with that team alone on it', A.ui.view + ' ' + A.calTeams().join() + ' ' + A.ui.teamId, 'calendar t2 t2');

  A.state.teams.t1.birthYear = 2013; A.state.teams.t2.birthYear = 2015;
  h = html();
  check('teams with an age sit under it', /U14/.test(h) && /U12/.test(h), true);
  const u14 = A.calGroups(A.myTeams()).find(g => g.label === 'U14').k;
  A.click({ act: 'caltog', g: u14 });
  check('ticking an age group ticks its teams', A.calTeams().sort().join(), 't1,t2');

  A.click({ act: 'calkind', v: 'practice' });
  h = html();
  check('practices can be hidden', /data-id="e3"/.test(h) || /data-id="e1"/.test(h), false);
  check('— games stay', /data-id="g2"/.test(h), true);
  A.click({ act: 'calkind', v: 'practice' });
  check('and brought back', /data-id="e1"/.test(html()), true);
  A.click({ act: 'calkind', v: 'cake' });
  check('a kind that isn\'t one is refused', Object.keys(A.ui.calKOff).length, 0);

  console.log('  (adding)');
  A.me = { uid: 'coachU', name: 'Jaz' }; lockDown();
  A.ui.calSel = 'mine'; A.ui.calView = 'week'; A.ui.calDay = '2026-09-14';
  h = html();
  check('Add, in a week, starts on the day being looked at', /class="calfab" data-act="calnew" data-tid="t1" data-v="2026-09-14"/.test(h), true);
  check('each hour of a day is a place to add', /class="tg-slot"[^>]*data-act="calnew" data-tid="t1" data-v="2026-09-16" data-t="18:00"/.test(h), true);
  A.click({ act: 'calnew', tid: 't1', v: '2026-09-16', t: '17:00' });
  check('— which starts then, as long as practice usually runs', [A.calForm.date, A.calForm.start, A.calForm.end].join(' '), '2026-09-16 17:00 18:15');
  A.ui.calSel = 'club';
  h = html();
  check('with another team on screen she cannot change, the + is still hers alone', /class="calfab" data-act="calnew" data-tid="t1"/.test(h), true);
  A.me = { uid: 'bossU', name: 'Boss' };
  h = html();
  check('an admin with every team on screen is asked which', /class="calfab" data-act="schedadd"/.test(h), true);
  A.me = { uid: 'mumU', name: 'Mum' };
  check('a parent has no +, and no hour to tap', /calfab|tg-slot/.test(html()), false);
}

console.log('--- the games are on the calendar, and on the team\'s Season ---');
{
  /* The Games tab was a list of games, one tap from each. The Calendar took
     it over (build 102), and since build 103 the Calendar is the person's, up
     top beside Messages, and a team's own tabs are Season, Squad and
     Practice. A game being played is on top of both, and opens with one tap;
     Season leads with the next game and the next practice and lists every
     game, with Add. Opening a game lands each role on the screen it works
     from, back goes where she came from, and a game added for later leaves
     her on the calendar. */
  setup(); lockDown();
  const page = require('fs').readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
  const tabs = page.match(/<nav class="tabs" id="tabs">[\s\S]*?<\/nav>/)[0].match(/data-view="[a-z]+"/g).join(' ');
  check('three tabs for a team, and the Calendar not one of them', tabs, 'data-view="season" data-view="roster" data-view="practice"');
  check('the Calendar is up top, by Messages', /<button[^>]*id="calBtn"/.test(page) && page.indexOf('id="calBtn"') < page.indexOf('id="msgBtn"'), true);
  A.me = { uid: 'coachU', name: 'Jaz' };
  const g2 = A.state.matches.g2;
  g2.periods = { 0: { half: 1, start: H.clock.t - 5 * MIN } };
  let h = html();
  check('a game being played is on top', /class="card callive"[^>]*data-act="calgame" data-tid="t1" data-id="g2" data-g="subs"/.test(h), true);
  check('— with its score and minutes', /data-live="gmins" data-mid="g2"/.test(h), true);
  A.click({ act: 'calgame', tid: 't1', id: 'g2', g: 'subs' });
  check('one tap and the coach is on Subs', A.ui.view + ' ' + A.ui.gameView + ' ' + A.ui.matchId, 'game subs g2');
  check('the back arrow says where it goes', /data-act="backgames" aria-label="Back to the calendar"/.test(html()), true);
  A.click({ act: 'backgames' });
  check('the back arrow is the calendar again', A.ui.view, 'calendar');
  A.ui.view = 'season';
  h = html();
  check('the team\'s Season has it on top too', /class="card callive"[^>]*data-act="calgame" data-tid="t1" data-id="g2"/.test(h), true);
  A.click({ act: 'calgame', tid: 't1', id: 'g2', g: 'subs' });
  check('— and from there, back is the team', /aria-label="Back to the team"/.test(html()) && (A.click({ act: 'backgames' }), A.ui.view), 'season');
  A.ui.view = 'calendar';
  A.me = { uid: 'trackU' };
  check('a tracker\'s card opens Track', /data-act="calgame" data-tid="t1" data-id="g2" data-g="track"/.test(html()), true);
  A.me = { uid: 'mumU' };
  check('a parent\'s opens Live', /data-act="calgame" data-tid="t1" data-id="g2" data-g="live"/.test(html()), true);
  g2.periods = {};

  A.me = { uid: 'coachU', name: 'Jaz' };
  const open = (id, extra = {}) => { A.ui.view = 'calendar'; A.click({ act: 'calgame', tid: 't1', id, ...extra }); return A.ui.gameView; };
  check('a game next week opens on its plan', open('g2'), 'plan');
  g2.date = '2026-09-12';
  check('one today opens on Subs, where the clock starts', open('g2'), 'subs');
  check('a game played opens on its log', open('g1'), 'live');
  A.me = { uid: 'mumU' };
  check('a parent opens it Live', open('g2'), 'live');
  g2.date = '2026-09-19';

  A.me = { uid: 'coachU', name: 'Jaz' };
  A.ui.view = 'calendar'; A.render();
  A.click({ act: 'calnew', tid: 't1', v: '2026-09-26' });
  check('the +\'s sheet has a game', /data-act="newmatch" data-from="cal"/.test(sheet()), true);
  check('and a run of games', /data-act="calgames" data-tid="t1"/.test(sheet()), true);
  A.click({ act: 'newmatch', from: 'cal' });
  type({ mOpp: 'Westfield', mDate: '2026-09-26', mKick: '10:00', mVenue: '', mHome: '', mArrive: '', mKit: '', mNotes: '', mCount: '2', mLen: '40', mSide: '9', mShape: 'auto', mVeo: '' });
  A.click({ act: 'savematch', id: '' });
  check('a game added for later leaves her on the calendar', A.ui.view, 'calendar');
  check('— saying so', A.lastToast(), 'Game added: Sat 26 Sep');
  check('— and it is there', A.calItems(['t1']).some(x => x.kind === 'game' && x.title === 'v Westfield'), true);
  A.click({ act: 'calnew', tid: 't1', v: '2026-09-12' });
  A.click({ act: 'newmatch', from: 'cal' });
  type({ mOpp: 'Today FC', mDate: '2026-09-12', mKick: '16:00' });
  A.click({ act: 'savematch', id: '' });
  check('one for today is the game she is about to run: it opens', A.ui.view + ' ' + A.ui.gameView, 'game subs');
  A.ui.view = 'calendar';
  A.click({ act: 'calnew', tid: 't1', v: '2026-10-03' });
  type({ evTitle: '', evDate: '2026-10-03', evStart: '', evEnd: '', evVenue: '', evNotes: '', evUntil: '' });
  A.click({ act: 'calgames', tid: 't1' });
  check('a run of games starts on the day picked, a week apart', A.gamesForm && A.gamesForm.tid + ' ' + A.gamesForm.rows.map(r => r.date).join(), 't1 2026-10-03,2026-10-10,2026-10-17');
  A.me = { uid: 'mumU' };
  A.toasts.length = 0;
  A.click({ act: 'calgames', tid: 't1' });
  check('a parent is refused it', A.lastToast(), "Only this team's coaches can change that");

  console.log('  (the team\'s Season)');
  setup(); lockDown();
  A.me = { uid: 'coachU', name: 'Jaz' };
  A.ui.view = 'season';
  h = html();
  check('it leads with the next game', /Next game[\s\S]*?v Northgate/.test(h) && h.indexOf('Next game') < h.indexOf('class="statgrid"'), true);
  check('— which opens the game', /data-act="calgame" data-tid="t1" data-id="g2"/.test(h), true);
  check('then the next practice, said as the calendar says it', /Next practice<\/span>\s*<b>Today · 6–7:15pm<\/b>/.test(h), true);
  check('a link to the team on the Calendar', /data-act="teamcal" data-tid="t1"/.test(h), true);
  check('every game listed, with Add', /<h2>Games<\/h2>/.test(h) && /data-act="newmatch"/.test(h) && /data-act="openmatch" data-id="g4"/.test(h), true);
  check('one called off says so', /data-act="openmatch" data-id="g3"[\s\S]*?<span class="tag off">Cancelled<\/span>/.test(h), true);
  A.me = { uid: 'mumU' };
  h = html();
  check('a family is asked about the next game, there', /Is Rosa going\?/.test(h), true);
  check('— and adds none', /data-act="newmatch"/.test(h), false);
  A.state.matches.g2.called = 'postponed'; A.state.matches.g3.called = null;
  check('a game called off is never next', /Next game[\s\S]*?v Hill End/.test(html()), true);
}

console.log('--- calendar sync ---');
{
  // one team's subscription is on its Season: the Calendar is the person's, with her own address
  setup(); lockDown();
  A.me = { uid: 'coachU' };
  A.ui.view = 'season';
  global.window.SOCCER_CALENDAR_FEED = '';
  A.click({ act: 'calsyncon', tid: 't1' });
  check('no feed set up for the site: nothing to turn on', A.state.teams.t1.calFeed, undefined);
  check('— and the calendar offers a copy instead', /Add what is coming up/.test(html()) && !/Turn on calendar sync/.test(html()), true);
  global.window.SOCCER_CALENDAR_FEED = 'https://feed.example.workers.dev';
  check('with one, the coach can turn it on', /Turn on calendar sync/.test(html()), true);
  A.me = { uid: 'mumU' };
  check('a parent is not offered the team\'s address: hers is on My calendar', /Your own calendar link is on My calendar/.test(html()) && !/coach has not turned calendar sync on yet/.test(html()), true);
  A.click({ act: 'calsyncon', tid: 't1' });
  check('and cannot turn it on herself', A.state.teams.t1.calFeed, undefined);
  A.me = { uid: 'coachU' };
  A.click({ act: 'calsyncon', tid: 't1' });
  const feed = A.state.teams.t1.calFeed;
  check('on: the team has a feed id', /^c\w+$/.test(feed || ''), true);
  check('the coach subscribes in Apple Calendar', html().includes(`href="webcal://feed.example.workers.dev/${feed}.ics"`), true);
  check('or Google', html().includes('calendar.google.com/calendar/render?cid=' + encodeURIComponent(`webcal://feed.example.workers.dev/${feed}.ics`)), true);
  check('and is told it is the team\'s, to replace when someone leaves', /replace it when someone leaves the team/.test(html()), true);
  A.me = { uid: 'mumU' };
  const h = html();
  /* One address for the whole team cannot be taken back from one family, so a
     family taken off the team would go on receiving it; hers is My calendar's,
     which the server builds from her roles and which leaves the team with her. */
  check('a parent is never shown the team\'s address', h.includes(feed), false);
  check('she is pointed at her own, on My calendar', /Your own calendar link is on My calendar/.test(h), true);
  check('a parent cannot replace the address', /calsyncnew/.test(h), false);
  const doc = A.calendarDoc(A.state.teams.t1);
  check('the feed carries team-only practices', 'e1' in doc.events && 'e3' in doc.events, true);
  check('and nothing about the players', /"players"|Ella|Rosa|"sec"/.test(JSON.stringify(doc)), false);
  A.me = { uid: 'coachU' };
  removes = [];
  A.click({ act: 'calsyncnew', tid: 't1' });
  check('replacing it makes a new address', A.state.teams.t1.calFeed !== feed && /^c\w+$/.test(A.state.teams.t1.calFeed), true);
  check('and the old one is the server\'s to take down, not the phone\'s', removes.some(p => /^(public|shareOwners)\//.test(p)), false);
  check('the team\'s copy is the team\'s, whatever the Calendar shows', /data-act="calicsall" data-tid="t1"/.test(html()), true);
  A.me = { uid: 'mumU' };
  A.click({ act: 'calscope', v: 'mine' });
  check('and My calendar, everything of hers in one, is a tap away', A.ui.view + ' ' + A.calSel(), 'calendar mine');
  global.window.SOCCER_CALENDAR_FEED = '';
}

H.summary('the calendar');
