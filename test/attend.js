/* Who came: the register a coach takes for practices and other entries, and
   the season's attendance worked out from it and from the games.

   What matters, in the order it would hurt:

   - Only the team's coach (or an admin) takes the register, checked against
     the team on the button. It is data about children.
   - It is one write at teams/{tid}/attend/{eid}, beside the entry and never
     inside it, so editing a practice cannot write over a register.
   - It starts from what families said — "not going" starts as missed — and
     counts a miss nobody warned about separately, because that is the number
     a coach asks about.
   - Nothing is counted that did not happen: a called-off practice, a future
     one, or a past one with no register yet (which is said, not guessed).
   - A game needs no register: she played, or she was available.
   - A parent sees her own child's record and nobody else's. */

const H = require('./harness');
const { check, deepEq } = H;
const { makeFakebase } = require('./fakebase');

const A = H.loadApp({ firebase: makeFakebase(), storage: { 'sm.workspace': 'CLUB' }, config: { apiKey: 'k', databaseURL: 'https://x.test' } });
const at = (d, hhmm) => { const [y, m, dd] = d.split('-').map(Number); const [h, mi] = hhmm.split(':').map(Number); return new Date(y, m - 1, dd, h, mi).getTime(); };

let sets = [], removes = [];
function setup() {
  H.clock.set(at('2026-09-12', '10:00'));
  const P = (id, start, extra) => ({ id, kind: 'practice', title: 'Practice', date: start, start: '18:00', end: '19:15', ...extra });
  A.state = {
    teams: {
      t1: {
        id: 't1', name: 'G14 Flight',
        players: {
          p1: { id: 'p1', name: 'Ella Fitzgerald', number: '7', guardians: { mumU: true } },
          p2: { id: 'p2', name: 'Rosa Delgado', number: '4', guardians: { dadU: true } },
          p3: { id: 'p3', name: 'Jo Nakamura', number: '9' },
          p4: { id: 'p4', name: 'Sam Okoro', number: '2', active: false }
        },
        events: {
          e1: P('e1', '2026-09-08'),
          e2: P('e2', '2026-09-10', { called: 'cancelled' }),
          e3: P('e3', '2026-09-12'),
          e4: P('e4', '2026-09-15'),
          ev: { id: 'ev', kind: 'event', title: 'Team photo', date: '2026-09-05', start: '09:00' }
        }
      },
      t2: { id: 't2', name: 'G12 Storm', players: { k1: { id: 'k1', name: 'Mia Kowalski', number: '5' } }, events: { s1: P('s1', '2026-09-09') } }
    },
    matches: {
      g0: {
        id: 'g0', teamId: 't1', opponent: 'Riverside', date: '2026-09-06', kickoff: '10:00', periodCount: 2, periodMinutes: 30, onFieldCount: 1,
        currentHalf: 3, ended: at('2026-09-06', '11:10'),
        periods: { 0: { half: 1, start: at('2026-09-06', '10:00'), end: at('2026-09-06', '10:30') } },
        stints: { s1: { pid: 'p1', on: 0, off: 1800 } }
      },
      g1: { id: 'g1', teamId: 't1', opponent: 'Northgate', date: '2026-09-19', kickoff: '09:30', periodCount: 2, periodMinutes: 30, currentHalf: 1, periods: {}, stints: {} }
    },
    access: {
      admins: { bossU: true },
      teams: { t1: { coaches: { coachU: true }, trackers: { trkU: true } }, t2: { coaches: { stormU: true } } },
      index: { bossU: true, coachU: true, trkU: true, mumU: true, dadU: true, stormU: true }
    },
    rsvp: { t1: { e_e1: { p2: { v: 'no', by: 'dadU', at: 1 } }, g_g0: { p2: { v: 'no', by: 'dadU', at: 1 } } } }
  };
  A.ui.teamId = 't1'; A.ui.view = 'calendar'; A.ui.matchId = null; A.ui.calAll = false; A.ui.calPast = true;
  sets = []; removes = []; A.toasts.length = 0;
  A.fb = {
    db: {}, ref: (db, path) => path,
    set: (path, v) => { sets.push([path, v]); return Promise.resolve(); },
    remove: path => { removes.push(path); return Promise.resolve(); }
  };
}
const as = uid => { A.me = uid ? { uid, name: uid } : null; };
const html = () => { A.render(); return A.rendered(); };
const sheet = () => String(A.dom.node('#sheet').innerHTML || '');
const t1 = () => A.state.teams.t1;
const reg = eid => A.attendOf('t1', eid);
const attWrites = () => sets.filter(([p]) => /\/attend\//.test(p));

console.log('--- taking the register ---');
{
  setup(); as('coachU');
  A.click({ act: 'calitem', k: 'practice', tid: 't1', id: 'e1' });
  check('a past practice offers the register', /Take attendance/.test(sheet()), true);
  A.click({ act: 'attend', tid: 't1', id: 'e1' });
  check('it starts from what families said', /Rosa Delgado<span class="rowsub">Family said not going[\s\S]*?missed/.test(sheet()), true);
  check('everyone else starts as came', (sheet().match(/>came</g) || []).length, 2);
  check('a player off the roster is not on it', /Sam Okoro/.test(sheet()), false);
  A.click({ act: 'attmark', pid: 'p3' });
  check('a tap changes it', /Save — 1 of 3 came/.test(sheet()), true);
  check('nothing is written until it is saved', attWrites().length, 0);
  A.click({ act: 'attsave', tid: 't1' });
  deepEq('saved as one register', ['p1', 'p2', 'p3'].map(k => reg('e1')[k]), [true, false, false]);
  deepEq('— one write, beside the entry, at a depth the team rule grants', attWrites().map(([p]) => p), ['orgs/CLUB/teams/t1/attend/e1']);
  check('and the coach is told', A.lastToast(), 'Saved — 1 of 3 came');

  A.click({ act: 'calitem', k: 'practice', tid: 't1', id: 'e1' });
  check('the sheet now says who missed', /Who came — 1 of 3[\s\S]*?Missed:<\/b> Rosa Delgado, Jo Nakamura/.test(sheet()), true);
  A.click({ act: 'attend', tid: 't1', id: 'e1' });
  check('opening it again shows what was saved, not the guess', /Jo Nakamura[\s\S]*?missed/.test(sheet()), true);
  A.click({ act: 'attall' });
  check('"Everyone came" is one tap', /Save — 3 of 3 came/.test(sheet()), true);

  setup(); as('coachU');
  A.click({ act: 'calitem', k: 'practice', tid: 't1', id: 'e3' });
  check('on the day itself it can be taken', /Take attendance/.test(sheet()), true);
  A.click({ act: 'calitem', k: 'practice', tid: 't1', id: 'e4' });
  check('not before', /Take attendance/.test(sheet()), false);
  A.click({ act: 'attend', tid: 't1', id: 'e4' });
  check('— even by a stray tap', A.dom.node('#sheet').innerHTML.includes('Who came — Practice'), false);
  A.click({ act: 'calitem', k: 'practice', tid: 't1', id: 'e2' });
  check('nor for a practice that was called off', /Take attendance/.test(sheet()), false);

  A.ui.calPast = true;
  const h = html();
  check('the calendar says which past practices have no register', /no register yet/.test(h), true);
}

console.log('--- who may take it ---');
{
  for (const [who, label] of [['mumU', 'a parent'], ['trkU', 'a tracker'], ['stormU', 'another team\'s coach']]) {
    setup(); as(who);
    A.click({ act: 'attend', tid: 't1', id: 'e1' });
    A.click({ act: 'attsave', tid: 't1' });
    check(`${label} cannot`, attWrites().length + (reg('e1') ? 1 : 0), 0);
  }
  setup(); as('bossU');
  A.click({ act: 'attend', tid: 't1', id: 'e1' });
  A.click({ act: 'attsave', tid: 't1' });
  check('an admin can', !!reg('e1'), true);
  setup(); as('stormU');
  A.ui.teamId = 't1';
  A.click({ act: 'attend', tid: 't2', id: 's1' });
  A.click({ act: 'attsave', tid: 't2' });
  check('a coach takes her own team\'s, whichever team is open', !!A.attendOf('t2', 's1'), true);
}

console.log('--- the season, counted ---');
{
  setup(); as('coachU');
  t1().attend = { e1: { p1: true, p2: false, p3: false }, e2: { p1: true } };
  const r = pid => A.attendance(t1(), pid);
  deepEq('came to it', r('p1').practice, { came: 1, of: 1, silent: 0 });
  deepEq('missed, and said so', r('p2').practice, { came: 0, of: 1, silent: 0 });
  deepEq('missed without saying', r('p3').practice, { came: 0, of: 1, silent: 1 });
  check('a called-off practice never counts, even with a register', r('p1').practice.of, 1);
  check('a practice with no register is not guessed at', r('p1').practice.of + r('p1').event.of, 1);
  check('the game: played', A.cameToGame(A.state.matches.g0, 'p1'), true);
  check('the game: available, on the bench', A.cameToGame(A.state.matches.g0, 'p3'), true);
  check('the game: out — the family said not going', A.cameToGame(A.state.matches.g0, 'p2'), false);
  deepEq('games come from the minutes, with no register', [r('p1').game, r('p2').game], [{ came: 1, of: 1 }, { came: 0, of: 1 }]);
  check('a game still to come is not counted', r('p1').game.of, 1);
  check('said in words', A.attendLine(r('p3')), 'Practices 0 of 1 · missed 1 (1 without saying) · Games 1 of 1');
  check('what has no register yet is said, not hidden', A.attendUntaken(t1()).map(x => x.id).join(), 'ev');

  A.ui.view = 'season';
  const h = html();
  check('the coach\'s Season tab has attendance', /<h2>Attendance<\/h2>/.test(h), true);
  check('most missed first', h.indexOf('Rosa Delgado', h.indexOf('<h2>Attendance')) < h.indexOf('Ella Fitzgerald', h.indexOf('<h2>Attendance')), true);
  check('and says what is still to record', /1 past practice or event with no register yet/.test(h), true);
  A.click({ act: 'editplayer', pid: 'p3' });
  check('her sheet carries her record', /This season:<\/b> Practices 0 of 1 · missed 1 \(1 without saying\)/.test(sheet()), true);

  as('mumU');
  check('a parent\'s Season tab has no register', /<h2>Attendance<\/h2>/.test(html()), false);
  A.ui.view = 'mine';
  const m = html();
  check('My players: her own child\'s record', /Practices 1 of 1 · Games 1 of 1/.test(m), true);
  check('and nobody else\'s', /Rosa|Nakamura/.test(m), false);
}

console.log('--- kept apart from the entry ---');
{
  setup(); as('coachU');
  t1().attend = { e1: { p1: true, p2: false, p3: true } };
  A.click({ act: 'caledit', tid: 't1', id: 'e1' });
  A.dom.node('#evTitle').value = 'Practice — shooting';
  A.dom.node('#evDate').value = '2026-09-08'; A.dom.node('#evStart').value = '18:00'; A.dom.node('#evEnd').value = '19:15';
  A.dom.node('#evVenue').value = ''; A.dom.node('#evNotes').value = '';
  sets = [];
  A.click({ act: 'calsave', tid: 't1' });
  check('editing the practice writes the entry only', sets.filter(([p]) => p.startsWith('orgs/')).map(([p]) => p).join(), 'orgs/CLUB/teams/t1/events/e1');
  check('and the register is untouched', JSON.stringify(reg('e1')), JSON.stringify({ p1: true, p2: false, p3: true }));
  A.click({ act: 'caledit', tid: 't1', id: 'e1' });
  A.click({ act: 'caldel', tid: 't1' });
  check('deleting the practice takes its register with it', reg('e1') === null && removes.includes('orgs/CLUB/teams/t1/attend/e1'), true);
  const pub = JSON.stringify([A.publicDoc(t1()), A.calendarDoc(t1())]);
  t1().attend = { e3: { p1: false } };
  check('no register reaches the share link or the feed', /attend|"came"/.test(JSON.stringify([A.publicDoc(t1()), A.calendarDoc(t1())])) || /attend/.test(pub), false);
}

H.summary('who came');
