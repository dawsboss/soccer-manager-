/* Builds a realistic club for the UI review from the app's own sandbox seeder,
   then shapes it the way each kind of phone would hold it on orgs/ (a family's
   phone: her own child's record, the rest of the squad by number only, staff
   names only, no log). Writes personas.json: one localStorage seed per persona.

   node gen-club.js <quiet|live|details> <out.json>                                */
const fs = require('fs');
const path = require('path');
const H = require(path.join(__dirname, '..', '..', 'test', 'harness'));
const scen = process.argv[2] || 'quiet';
const out = process.argv[3] || 'personas.json';
const at = (d, hhmm) => { const [y, m, dd] = d.split('-').map(Number); const [h, mi] = hhmm.split(':').map(Number); return new Date(y, m - 1, dd, h, mi).getTime(); };
const DAY = 864e5;
// Wednesday 17:10 with a practice at 18:00 (quiet), or Saturday 10:41 with the game 38 minutes in (live)
const NOW = scen === 'live' ? at('2026-10-17', '10:41') : at('2026-10-14', '17:10');
H.clock.set(NOW);
const A = H.loadApp({ config: { apiKey: 'k', databaseURL: 'https://x.test' } });
A.me = { uid: 'boss', name: 'Ada Okafor', email: 'ada@example.com' };
A.appOwners = { boss: true };
A.seedSandbox();
const seededCode = A.storage.getItem('sm.workspace');
const s = JSON.parse(A.storage.getItem('sm.data.v1:' + seededCode));
const CODE = 'lakeside';

/* ---- teams and players ---- */
const tA = s.teams.sbA, tB = s.teams.sbB;
tA.name = 'G12 Flight'; tA.birthYear = 2015;
tB.name = 'B10 Storm'; tB.birthYear = 2017;
tA.players.sbA_p5 = { ...tA.players.sbA_p5, name: 'Rosa Delgado', number: '7', guardians: { mum: true, dad: true }, child: 'sbA_p5' };
tB.players.sbB_p3 = { ...tB.players.sbB_p3, name: 'Theo Delgado', number: '5', guardians: { dad: true }, child: 'sbB_p3' };
// a fan on Rosa, other families on three teammates (for the coach's counts)
tA.players.sbA_p5.fans = { nan: true };
// a player with her own sign-in (Ella, #3)
tA.players.sbA_p2 = { ...tA.players.sbA_p2, name: 'Ella Nwosu', number: '3', self: { kid: true }, guardians: { f2: true }, familyNames: { f2: 'Dee Walsh' } };
tA.players.sbA_p1.guardians = { f1: true }; tA.players.sbA_p2.guardians = { f2: true }; tA.players.sbA_p3.guardians = { f3: true };
// Rosa took 7, which the seeder had given the player after her: move that one to 16 so no two shirts clash
tA.players.sbA_p6.number = '16';
for (const t of [tA, tB]) for (const p of Object.values(t.players)) { p.child = p.child || p.id; }

/* ---- games: Saturdays, closed clocks ---- */
function finish(m, date, kickoff = '10:00') {
  const len = m.periodMinutes * 60000, gap = 5 * 60000, t0 = at(date, kickoff);
  m.date = date; m.kickoff = kickoff;
  const total = m.periodCount * m.periodMinutes * 60;
  m.periods = {};
  for (let i = 0; i < m.periodCount; i++) m.periods[i] = { half: i + 1, start: t0 + i * (len + gap), end: t0 + i * (len + gap) + len };
  for (const st of Object.values(m.stints)) if (st.off == null) st.off = total;
  m.currentHalf = m.periodCount;
  m.ended = t0 + m.periodCount * (len + gap) + 60000;
  delete m.called;
}
finish(s.matches.sbg1, '2026-09-26'); s.matches.sbg1.venue = 'Lakeside Park, pitch 1'; s.matches.sbg1.home = 'home';
finish(s.matches.sbg2, '2026-10-03'); s.matches.sbg2.venue = 'Northgate Rec'; s.matches.sbg2.home = 'away';
finish(s.matches.sbg4, '2026-10-03'); s.matches.sbg4.venue = 'Lakeside Park, pitch 3'; s.matches.sbg4.home = 'home';
if (scen === 'live') {
  // the sandbox made sbg3 live from NOW: keep it, on today's date
  s.matches.sbg3.date = '2026-10-17'; s.matches.sbg3.kickoff = '10:00'; s.matches.sbg3.venue = 'Lakeside Park, pitch 1'; s.matches.sbg3.home = 'home';
  s.matches.sbg5.date = '2026-10-24';
  /* A shape and a spot for everyone on, so the Pitch look (and the sub sheet's
     mock of it, build 176) draws players where they stand, not in one pile. */
  const m = s.matches.sbg3, slots = JSON.parse(JSON.stringify(A.presetsFor(11)['4-3-3']));
  m.formation = { name: '4-3-3', size: 11, slots };
  m.positions = {};
  A.fieldIds(m).forEach((pid, i) => { const sl = slots[i]; if (sl) m.positions[pid] = { x: sl.x, y: sl.y, slot: sl.id }; });
} else {
  finish(s.matches.sbg3, '2026-10-10'); s.matches.sbg3.venue = 'Lakeside Park, pitch 1'; s.matches.sbg3.home = 'home';
  s.matches.sbg5.date = '2026-10-17';
}
// Rosa scored once in the last game and was on for the first half and a bit
{
  const m = s.matches.sbg3;
  const rosaStints = Object.values(m.stints).filter(x => x.pid === 'sbA_p5');
  if (!rosaStints.length) m.stints.rosa1 = { pid: 'sbA_p5', on: 0, off: 2100, role: 'Midfield' };
  else rosaStints[0].role = 'Midfield';
  const g = Object.values(m.goals).find(x => x.side === 'us'); if (g) { g.pid = 'sbA_p5'; g.assist = 'sbA_p1'; }
  m.shots = { s1: { t: 400, side: 'us', pid: 'sbA_p5', onTarget: true }, s2: { t: 900, side: 'them', onTarget: false }, s3: { t: 1500, side: 'us', pid: 'sbA_p2', onTarget: false } };
}
s.matches.sbg5 = { ...s.matches.sbg5, venue: 'Eastfield Rec, pitch 1', arrive: '09:30', kickoff: '10:00', home: 'away', kit: 'Blue shirts, white socks', notes: 'Parking is behind the clubhouse' };
// B10 Storm's next game, and one called off
s.matches.sbg6 = { id: 'sbg6', teamId: 'sbB', opponent: 'Riverside B', date: scen === 'live' ? '2026-10-18' : '2026-10-18', kickoff: '12:30', arrive: '12:00', venue: 'Lakeside Park, pitch 3', home: 'home', periodCount: 4, periodMinutes: 12, onFieldCount: 7, currentHalf: 1, periods: {}, stints: {}, planned: {}, createdAt: NOW - 20 * DAY };
s.matches.sbg7 = { id: 'sbg7', teamId: 'sbA', opponent: 'Hill End', date: '2026-10-31', kickoff: '10:00', venue: 'Hill End Common', home: 'away', called: 'postponed', periodCount: 2, periodMinutes: 30, onFieldCount: 11, currentHalf: 1, periods: {}, stints: {}, planned: {}, createdAt: NOW - 20 * DAY };

/* ---- the calendar ---- */
for (const e of Object.values(tA.events)) { if (e.kind === 'practice') { e.venue = 'Lakeside Park, field 2'; } else if (e.kind === 'event') { e.venue = 'Lakeside Park pavilion'; } }
// one practice carries a note, as a coach's would
const todayS = A.todayStr();
const nextPr = Object.values(tA.events).filter(e => e.kind === 'practice' && e.date >= todayS && !e.called).sort((a, b) => a.date.localeCompare(b.date))[0];
if (nextPr) nextPr.notes = 'Shin pads and a full water bottle. We finish on the far pitch.';
tB.events = {};
A.seriesDates(A.addDays(todayS, -21), A.addDays(todayS, 35), [2, 4]).forEach((date, i) => {
  const id = 'sbB_e' + i;
  tB.events[id] = { id, kind: 'practice', title: 'Practice', date, start: '17:30', end: '18:30', venue: 'Lakeside Park, field 1', series: 'sbs_sbB', createdAt: NOW - 30 * DAY };
});
tB.events.sbB_fun = { id: 'sbB_fun', kind: 'event', title: 'End-of-season fun day', date: A.addDays(todayS, 24), start: '11:00', end: '14:00', venue: 'Lakeside Park', notes: 'Families welcome. Bring a picnic.', public: true, createdAt: NOW - 3 * DAY };

/* ---- who is who ---- */
const NAMES = { boss: 'Ada Okafor', jaz: 'Jaz Aldritt', sam: 'Sam Okoro', wren: 'Wren Bailey', mum: 'Mo Delgado', dad: 'Luis Delgado', nan: 'Pat Delgado', f1: 'Kim Ng', f2: 'Dee Walsh', f3: 'Ana Reyes' };
const EMAILS = { mum: 'mo.delgado@example.com', dad: 'luis.delgado@example.com', nan: 'pat.delgado@example.com' };
const everyone = Object.keys(NAMES).concat(['kid']);
s.access = {
  org: { name: 'Lakeside SC', money: '$' },
  admins: { boss: true }, owners: { boss: true },
  teams: { sbA: { coaches: { jaz: true }, trackers: { sam: true } }, sbB: { coaches: { wren: true } } },
  index: Object.fromEntries(everyone.map(u => [u, true])),
  teamIndex: { sbA: { jaz: 'coach', sam: 'tracker' }, sbB: { wren: 'coach' } },
  teamParents: { sbA: { mum: 'sbA_p5', dad: 'sbA_p5', f1: 'sbA_p1', f2: 'sbA_p2', f3: 'sbA_p3' }, sbB: { dad: 'sbB_p3' } },
  teamPlayers: { sbA: { kid: 'sbA_p2' } },
  teamFans: { sbA: { nan: 'sbA_p5' } },
  coachIndex: { jaz: 'sbA', wren: 'sbB' },
  members: Object.fromEntries(everyone.map(u => [u, { name: NAMES[u], email: EMAILS[u] || u + '@example.com', at: NOW - 60 * DAY }]))
};
/* `fields`: the club's fields with permits, hours and pitches, and each team's
   practice needs, so the Scheduler's board has a supply to paint (build 163). */
if (process.argv[4] === 'fields') {
  s.access.org.venues = {
    v1: { id: 'v1', name: 'Lakeside Park', address: '1 Lake Rd', pitches: 3, surface: 'Grass',
      parts: { a: { id: 'a', name: 'Field 1', surface: 'Grass', o: 1 }, b: { id: 'b', name: 'Field 2', surface: 'Grass', o: 2 }, c: { id: 'c', name: 'Pitch 3', surface: 'Turf', lights: true, o: 3 } },
      permits: { pm1: { id: 'pm1', days: [0, 1, 2, 3], start: '17:00', end: '20:00', ref: 'Council 2026-27' }, pm2: { id: 'pm2', days: [5, 6], start: '09:00', end: '14:00', ref: 'Council 2026-27' } },
      hours: { d4: { closed: true } } },
    v2: { id: 'v2', name: 'Eastfield Rec', address: '40 East St', pitches: 1, surface: 'Turf', lights: true,
      permits: { pm3: { id: 'pm3', days: [1, 3], start: '18:00', end: '21:00' } } }
  };
  s.access.org.sched = { teams: { sbA: { per: 2, len: 75, field: 'v1', not: [], note: '' }, sbB: { per: 2, len: 60, field: 'v1', not: [0], note: 'Wren works late on Mondays' } } };
}

/* ---- answers ---- */
s.rsvp = { sbA: {}, sbB: {} };
if (nextPr) s.rsvp.sbA['e_' + nextPr.id] = { sbA_p1: { v: 'yes', by: 'f1', at: NOW - DAY }, sbA_p2: { v: 'no', by: 'f2', at: NOW - DAY }, sbA_p3: { v: 'maybe', by: 'f3', at: NOW - DAY } };
s.rsvp.sbA.g_sbg5 = { sbA_p5: { v: 'yes', by: 'mum', at: NOW - 2 * DAY }, sbA_p1: { v: 'yes', by: 'f1', at: NOW - 2 * DAY } };

/* ---- the club's record of each child, and care ---- */
s.children = {};
for (const t of [tA, tB]) for (const p of Object.values(t.players)) {
  const [first, ...rest] = String(p.name).split(' ');
  s.children[p.id] = { id: p.id, first, last: rest.join(' '), club: true, by: 'boss', at: NOW - 45 * DAY, teams: { [t.id]: p.id }, guardians: Object.fromEntries(Object.keys(p.guardians || {}).map(u => [u, t.id])), family: Object.fromEntries(Object.keys(p.guardians || {}).map(u => [u, true])) };
}
Object.assign(s.children.sbA_p5, { born: '2015-03-05', gender: 'F', confirmed: scen === 'details' ? undefined : NOW - 30 * DAY });
Object.assign(s.children.sbB_p3, { born: '2017-08-19', gender: 'M', confirmed: NOW - 30 * DAY });
Object.assign(s.children.sbA_p2, { born: '2015-01-20', gender: 'F', confirmed: NOW - 20 * DAY, self: { kid: 'sbA' } });
s.care = scen === 'details' ? {} : {
  sbA_p5: { contacts: { a: { name: 'Mo Delgado', phone: '555-0101', rel: 'Mother' }, b: { name: 'Luis Delgado', phone: '555-0102', rel: 'Father' } }, medical: 'Mild asthma, carries an inhaler', by: 'mum', at: NOW - 30 * DAY },
  sbB_p3: { contacts: { a: { name: 'Luis Delgado', phone: '555-0102', rel: 'Father' } }, by: 'dad', at: NOW - 30 * DAY }
};
s.teamCare = { sbA: { sbA_p5: s.care.sbA_p5 || null }, sbB: { sbB_p3: s.care.sbB_p3 || null } };

/* ---- shaping per phone ---- */
const FAMILY = { mum: ['sbA_p5'], dad: ['sbA_p5', 'sbB_p3'], nan: ['sbA_p5'], kid: ['sbA_p2'] };
function shapeFor(uid) {
  const c = JSON.parse(JSON.stringify(s));
  const mine = FAMILY[uid];
  if (!mine) return c;                       // staff hold the club whole
  for (const t of Object.values(c.teams)) {
    t.players = Object.fromEntries(Object.entries(t.players).map(([pid, p]) =>
      [pid, mine.includes(pid) ? p : { id: pid, name: '', number: p.number, active: p.active !== false }]));
  }
  c.children = Object.fromEntries(Object.entries(c.children).filter(([cid]) => mine.includes(cid) && uid !== 'nan'));
  c.care = Object.fromEntries(Object.entries(c.care).filter(([cid]) => c.children[cid]));
  c.teamCare = {};
  delete c.access.log;
  // names/ for staff, and her own member entry
  c.access.members = Object.fromEntries(Object.entries(c.access.members).filter(([u]) => ['boss', 'jaz', 'sam', 'wren'].includes(u) || u === uid)
    .map(([u, m]) => [u, u === uid ? m : { name: m.name }]));
  return c;
}

/* ---- what the coaches have said ---- */
function msgsFor(uid) {
  const board = {
    sbA: {
      n1: { by: 'jaz', byName: 'Jaz Aldritt', at: NOW - 5 * DAY, text: 'Great effort on Saturday everyone. Practice is on field 2 this week while the main pitch is reseeded.' },
      n2: { by: 'jaz', byName: 'Jaz Aldritt', at: NOW - 20 * 3600e3, urgent: true, text: 'Saturday v Eastfield: please arrive by 9:30. Blue shirts, white socks. Parking is behind the clubhouse.' }
    },
    sbB: { n3: { by: 'wren', byName: 'Wren Bailey', at: NOW - 3 * DAY, text: 'Fun day on the 7th: families welcome, bring a picnic. Sign-up sheet at practice.' } }
  };
  const dm = {
    sbA: {
      [uid === 'dad' ? 'dad' : 'mum']: {
        m: {
          d1: { by: uid === 'dad' ? 'dad' : 'mum', byName: NAMES[uid === 'dad' ? 'dad' : 'mum'], at: NOW - 6 * DAY, text: 'Hi Jaz, Rosa has a cold so she may miss Wednesday. Will let you know.' },
          d2: { by: 'jaz', byName: 'Jaz Aldritt', at: NOW - 6 * DAY + 3600e3, text: 'No problem at all, hope she feels better soon!' }
        },
        seen: { [uid]: NOW - 5 * DAY }
      }
    }
  };
  return { board: uid === 'dad' ? board : { sbA: board.sbA }, dm, sd: {}, outbox: {} };
}

const ME = {
  mum: { uid: 'mum', name: 'Mo Delgado', email: 'mo.delgado@example.com', verified: true },
  dad: { uid: 'dad', name: 'Luis Delgado', email: 'luis.delgado@example.com', verified: true },
  nan: { uid: 'nan', name: 'Pat Delgado', email: 'pat.delgado@example.com', verified: true },
  jaz: { uid: 'jaz', name: 'Jaz Aldritt', email: 'jaz@example.com', verified: true },
  boss: { uid: 'boss', name: 'Ada Okafor', email: 'ada@example.com', verified: true },
  newbie: { uid: 'newbie', name: 'Sam Newby', email: 'sam.newby@example.com', verified: true },
  kid: { uid: 'kid', name: 'Ella Nwosu', email: 'ella.n@example.com', verified: true }
};
function storageFor(uid) {
  const st = { 'sm.workspace': CODE, ['sm.data.v1:' + CODE]: JSON.stringify(shapeFor(uid)), ['sm.synced:' + CODE]: String(NOW - 3600e3), ['sm.tree.v1:' + CODE]: 'orgs', 'sm.me': JSON.stringify(ME[uid]) };
  if (FAMILY[uid] || uid === 'jaz' || uid === 'boss') st['sm.msgs:' + CODE + ':' + uid] = JSON.stringify(msgsFor(uid));
  return st;
}
const personas = {};
for (const u of ['mum', 'dad', 'nan', 'kid', 'jaz', 'boss']) personas[u] = storageFor(u);
// signed out on a phone that has never opened a club, and signed in with nothing yet
personas.anon = {};
personas.newbie = { 'sm.me': JSON.stringify(ME.newbie) };
// signed out, but the phone still holds the club (a shared tablet, a sign-out): the lock screen
personas.signedout = { 'sm.workspace': CODE, ['sm.data.v1:' + CODE]: JSON.stringify(shapeFor('mum')), ['sm.synced:' + CODE]: String(NOW - 3600e3), ['sm.tree.v1:' + CODE]: 'orgs' };
fs.writeFileSync(out, JSON.stringify({ NOW, scen, code: CODE, personas }, null, 1));
console.log('wrote', out, 'NOW', new Date(NOW).toString(), 'next practice', nextPr && nextPr.date, 'events A', Object.keys(tA.events).length, 'B', Object.keys(tB.events).length);
