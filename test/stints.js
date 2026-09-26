/* Who is on the pitch, and what the sub actions do to the record of it.

   CLAUDE.md's first invariant: "Stints are the only truth for who's on the
   pitch. onField(m, pid) = !!openStint(m, pid). `positions` holds nothing but
   x/y coordinates — never make it authoritative again, and never gate a feature
   on it." It says "again" because it was authoritative once, and two taps on
   two phones could disagree about who was playing.

   The strongest way to check that is to delete `positions` outright in the
   middle of a game and require that nothing about who is on, or for how long,
   changes. A test that only reads onField() would pass even if the two were
   wired back together.

   The rest exercises the action layer against real state — the writes land in
   `state` because `fb` is null, which is also what a coach with no signal gets. */

const H = require('./harness');
const { check, deepEq } = H;

const A = H.loadApp({});
const T0 = Date.UTC(2026, 8, 12, 10, 0, 0);
const MIN = 60000;

/* A game twenty minutes in, four of seven on the pitch. */
function setup(opts = {}) {
  H.clock.set(T0);
  A.state = {
    teams: {
      t1: {
        id: 't1', name: 'G14 Flight', players: {
          p1: { id: 'p1', name: 'Ella', number: '7' },
          p2: { id: 'p2', name: 'Mia', number: '8' },
          p3: { id: 'p3', name: 'Rosa', number: '4' },
          p4: { id: 'p4', name: 'Jo', number: '9' },
          p5: { id: 'p5', name: 'Sam', number: '1', gk: true }
        }
      }
    },
    matches: {
      g1: {
        id: 'g1', teamId: 't1', opponent: 'Riverside', date: '2026-09-12',
        periodCount: 2, periodMinutes: 40, onFieldCount: 4, currentHalf: 1,
        periods: { 0: { half: 1, start: T0 - 20 * MIN } },
        formation: {
          name: '1-2-1', size: 4, slots: [
            { id: 'sGK', label: 'GK', role: 'GK', x: 50, y: 92 },
            { id: 'sLB', label: 'LB', role: 'Back', x: 25, y: 70 },
            { id: 'sRB', label: 'RB', role: 'Back', x: 75, y: 70 },
            { id: 'sST', label: 'ST', role: 'Forward', x: 50, y: 22 }
          ]
        },
        positions: {
          p1: { x: 25, y: 70, slot: 'sLB' }, p2: { x: 75, y: 70, slot: 'sRB' },
          p3: { x: 50, y: 22, slot: 'sST' }, p5: { x: 50, y: 92, slot: 'sGK' }
        },
        stints: {
          s1: { pid: 'p1', on: 0, slot: 'sLB', role: 'Back' },
          s2: { pid: 'p2', on: 0, slot: 'sRB', role: 'Back' },
          s3: { pid: 'p3', on: 0, slot: 'sST', role: 'Forward' },
          s5: { pid: 'p5', on: 0, slot: 'sGK', role: 'GK' }
        },
        planned: { p1: 40, p2: 40, p3: 40, p4: 40, p5: 80 },
        ...opts
      }
    },
    access: {}
  };
  A.ui.teamId = 't1'; A.ui.matchId = 'g1';
  A.ui.view = 'game'; A.ui.gameView = 'live'; A.ui.plan = null; A.ui.picked = null;
  return A.state.matches.g1;
}

const ids = m => A.fieldIds(m).slice().sort();
/* onField must never be able to disagree with the stints. */
const agrees = m => Object.keys(A.state.teams.t1.players)
  .every(pid => A.onField(m, pid) === !!A.openStint(m, pid));

console.log('--- stints are the truth, positions are decoration ---');
{
  const m = setup();
  deepEq('four on at kickoff', ids(m), ['p1', 'p2', 'p3', 'p5']);
  check('onField agrees with the stints', agrees(m), true);
  check('the sub is not on', A.onField(m, 'p4'), false);

  const before = { on: ids(m), mins: A.playedSec(m, 'p1'), n: A.fieldIds(m).length };
  delete m.positions;                       // the whole coordinate map, gone
  deepEq('with positions deleted, the same four are on', ids(m), before.on);
  check('and the same minutes', A.playedSec(m, 'p1'), before.mins);
  check('fieldIds is unchanged', A.fieldIds(m).length, before.n);
  check('onField still agrees', agrees(m), true);
  const p = A.posOf(m, 'p1');
  check('posOf falls back to the slot, not to being on/off', p.slot, 'sLB');

  // and the reverse: a coordinate for somebody who is not playing means nothing
  m.positions = { p4: { x: 50, y: 50, slot: null } };
  check('a stray position does not put a sub on', A.onField(m, 'p4'), false);
  deepEq('still the same four', ids(m), before.on);
}

console.log('\n--- a sub closes one spell and opens another ---');
{
  const m = setup();
  H.clock.advance(0);
  A.swap(m, 'p1', 'p4');
  check('the one coming off is off', A.onField(m, 'p1'), false);
  check('the one coming on is on', A.onField(m, 'p4'), true);
  check('onField agrees with the stints', agrees(m), true);
  check('still four on the pitch', A.fieldIds(m).length, 4);
  check('she keeps her twenty minutes', A.playedSec(m, 'p1'), 1200);
  check('the sub starts on zero', A.playedSec(m, 'p4'), 0);
  check('the sub inherited the spot', A.openStint(m, 'p4')[1].slot, 'sLB');
  H.clock.advance(10 * MIN);
  check('ten minutes later the one who came off has not moved', A.playedSec(m, 'p1'), 1200);
  check('and the one who came on has ten', A.playedSec(m, 'p4'), 600);
}

console.log('\n--- taking someone off and putting her back ---');
{
  const m = setup();
  A.takeOffField(m, 'p3');
  check('off the pitch', A.onField(m, 'p3'), false);
  check('the position went with her', (m.positions || {}).p3, undefined);
  H.clock.advance(5 * MIN);
  A.putOnField(m, 'p3', 50, 22, 'sST');
  check('back on', A.onField(m, 'p3'), true);
  check('two spells now', A.stintsOf(m, 'p3').length, 2);
  check('the gap is not counted', A.playedSec(m, 'p3'), 1200);
  check('onField agrees with the stints', agrees(m), true);
  // putting an already-on player on again must not open a second spell
  A.putOnField(m, 'p3', 50, 22, 'sST');
  check('putting her on twice does not double her up', A.stintsOf(m, 'p3').length, 2);
  deepEq('and raises no anomaly', A.anomalies(m), []);
}

console.log('\n--- endGame freezes the clock and every spell ---');
{
  const m = setup();
  const elapsed = A.elapsedSec(m);
  check('twenty minutes on the clock', elapsed, 1200);
  check('four spells are open', Object.values(m.stints).filter(s => s.off == null).length, 4);

  A.endGame(m);

  check('the open period was closed', A.openSeg(m), null);
  check('every spell was closed', Object.values(m.stints).filter(s => s.off == null).length, 0);
  check('the game is marked ended', !!m.ended, true);
  check('nobody is on the pitch', A.fieldIds(m).length, 0);
  check('onField agrees with the stints', agrees(m), true);

  const frozen = {
    elapsed: A.elapsedSec(m),
    p1: A.playedSec(m, 'p1'), p3: A.playedSec(m, 'p3'), p5: A.playedSec(m, 'p5')
  };
  H.clock.advance(60 * MIN);
  check('an hour later, elapsed has not drifted', A.elapsedSec(m), frozen.elapsed);
  check('nor have her minutes', A.playedSec(m, 'p1'), frozen.p1);
  check('nor the keeper\'s', A.playedSec(m, 'p5'), frozen.p5);
  H.clock.advance(24 * 60 * MIN);
  check('nor a day later', A.playedSec(m, 'p3'), frozen.p3);
  check('and nobody outplayed the clock', A.playedSec(m, 'p3') <= A.elapsedSec(m), true);
}

console.log('\n--- ending a game that is already paused ---');
{
  const m = setup();
  m.periods[0].end = T0 - 5 * MIN;          // clock stopped five minutes ago
  const before = A.elapsedSec(m);
  A.endGame(m);
  check('the closed period was left alone', A.elapsedSec(m), before);
  check('but the spells were still closed', Object.values(m.stints).filter(s => s.off == null).length, 0);
}

console.log('\n--- a sub recorded late is clamped to the game ---');
{
  const m = setup();                        // elapsed 1200
  A.subAt(m, 'p1', 'p4', 99999);
  check('a time past now clamps to now', A.openStint(m, 'p4')[1].on, 1200);
  check('and she is on', A.onField(m, 'p4'), true);

  const m2 = setup();
  m2.stints.s1.on = 300;                    // she only came on at five minutes
  A.subAt(m2, 'p1', 'p4', 0);
  check('a time before her spell began clamps up to it', A.openStint(m2, 'p4')[1].on, 300);
  check('so her spell is not negative', A.playedSec(m2, 'p1') >= 0, true);

  const m3 = setup();
  A.subAt(m3, 'p1', 'p4', 600);
  check('a time inside the game is kept', A.openStint(m3, 'p4')[1].on, 600);
  check('and splits the minutes at it', A.playedSec(m3, 'p1'), 600);
  check('onField agrees with the stints', agrees(m3), true);
}

console.log('\n--- dragging a sub to another minute moves both sides ---');
{
  const m = setup();
  A.subAt(m, 'p1', 'p4', 600);
  const row = A.subEvents(m).find(r => r.on === 'p4' && r.off === 'p1');
  check('the sub reads as one row, not two', !!row, true);
  A.moveSub(m, row, 300);
  check('the one coming off now has five minutes', A.playedSec(m, 'p1'), 300);
  check('and the one coming on has fifteen', A.playedSec(m, 'p4'), 900);
  check('the two still add to one player-game', A.playedSec(m, 'p1') + A.playedSec(m, 'p4'), 1200);
  A.moveSub(m, row, -500);
  check('dragging before kickoff clamps to zero', A.playedSec(m, 'p1'), 0);
  A.moveSub(m, row, 99999);
  check('dragging past now clamps to now', A.playedSec(m, 'p1'), 1200);
}

console.log('\n--- a position change keeps the total, splits the roles ---');
{
  const m = setup();
  const before = A.playedSec(m, 'p1');
  A.movePos(m, 'p1', 'sST', null, 600);
  check('total minutes are untouched', A.playedSec(m, 'p1'), before);
  check('two spells now', A.stintsOf(m, 'p1').length, 2);
  check('she is still on', A.onField(m, 'p1'), true);
  check('in the new spot', A.openStint(m, 'p1')[1].slot, 'sST');
  check('with the new role', A.openStint(m, 'p1')[1].role, 'Forward');
  check('onField agrees with the stints', agrees(m), true);
  deepEq('and no anomaly', A.anomalies(m), []);

  // moving at or before the moment the spell began edits it rather than splitting
  const m2 = setup();
  A.movePos(m2, 'p2', 'sST', null, 0);
  check('moving at the start of the spell does not split it', A.stintsOf(m2, 'p2').length, 1);
  check('it just changes the spot', A.openStint(m2, 'p2')[1].slot, 'sST');
}

console.log('\n--- a batch all lands on the same second ---');
{
  const m = setup();
  A.ui.plan = { matchId: 'g1', items: [] };
  A.stage({ k: 'sub', out: 'p1', in: 'p4' });
  A.stage({ k: 'move', pid: 'p2', sid: 'sST', role: null, label: 'ST' });
  const at = A.elapsedSec(m);
  A.applyStaged(m);

  check('the batch was cleared', A.ui.plan, null);
  check('the sub went on', A.onField(m, 'p4'), true);
  check('the one replaced came off', A.onField(m, 'p1'), false);
  const ons = Object.values(m.stints).filter(s => s.off == null).map(s => s.on);
  check('every new spell starts at the same second', new Set(ons.filter(x => x === at)).size <= 1, true);
  check('the moved player is in her new spot', A.openStint(m, 'p2')[1].slot, 'sST');
  check('still four on the pitch', A.fieldIds(m).length, 4);
  check('onField agrees with the stints', agrees(m), true);
  deepEq('and no anomaly', A.anomalies(m), []);
}

console.log('\n--- restarting wipes the clock but keeps who is on ---');
{
  const m0 = setup();
  m0.goals = { g: { t: 300, side: 'us', pid: 'p3' } };
  A.restartMatch(m0);
  const m = A.state.matches.g1;
  check('the clock is back to zero', A.elapsedSec(m), 0);
  check('and not running', A.running(m), false);
  check('the same four are on', A.fieldIds(m).length, 4);
  check('each on a fresh spell at zero', Object.values(m.stints).every(s => s.on === 0), true);
  check('everyone is on zero minutes', A.playedSec(m, 'p1'), 0);
  check('goals measured on the old clock are gone', m.goals, null);
  check('onField agrees with the stints', agrees(m), true);
}

console.log('\n--- anomalies: things that should never be true ---');
{
  const m = setup();
  deepEq('a clean game has none', A.anomalies(m), []);

  m.stints.dup = { pid: 'p1', on: 600 };    // a second open spell for p1
  const a = A.anomalies(m);
  check('a double spell is caught', a.length, 1);
  check('and named', a[0].kind, 'double');
  check('for the right player', a[0].pid, 'p1');
  check('naming both spells', a[0].sids.length, 2);
  check('but she is still, unambiguously, on', A.onField(m, 'p1'), true);

  const m2 = setup();
  m2.stints.x = { pid: 'p4', on: 600 };     // a fifth player on a four-a-side
  const b = A.anomalies(m2);
  check('too many on the pitch is caught', b.some(x => x.kind === 'toomany'), true);
  check('with the count', b.find(x => x.kind === 'toomany').n, 5);
  check('and the cap', b.find(x => x.kind === 'toomany').cap, 4);

  const m3 = setup();
  delete m3.onFieldCount;
  m3.stints.x = { pid: 'p4', on: 600 };
  deepEq('under the default cap of eleven, five is fine', A.anomalies(m3), []);
}

console.log('\n--- the repair action, through the click handler it lives in ---');
{
  /* There is no repair() function — it is an inline branch in the one listener
     app.js puts on document, which is why it has never been testable. */
  const m = setup();
  m.stints.dupA = { pid: 'p1', on: 900 };
  m.stints.dupB = { pid: 'p1', on: 300 };
  check('three open spells for one player', A.stintsOf(m, 'p1').filter(([, s]) => s.off == null).length, 3);
  check('two anomalies would be two players; here it is one', A.anomalies(m).length, 1);

  A.click({ act: 'repair' });

  const after = A.state.matches.g1;
  deepEq('the anomaly is gone', A.anomalies(after), []);
  check('one spell survives', A.stintsOf(after, 'p1').length, 1);
  check('and it is the earliest one', A.openStint(after, 'p1')[1].on, 0);
  check('she is still on the pitch', A.onField(after, 'p1'), true);
  check('the others were untouched', A.fieldIds(after).length, 4);
  check('and it said what it did', A.lastToast(), '2 duplicate spells removed');

  // repairing a clean game is a no-op, not a crash
  A.click({ act: 'repair' });
  check('repairing a clean game removes nothing', A.lastToast(), '0 duplicate spells removed');
  check('and leaves the game alone', A.fieldIds(A.state.matches.g1).length, 4);
}

console.log('\n--- the sub log reads as subs, not as loose events ---');
{
  const m = setup();
  A.subAt(m, 'p1', 'p4', 600);
  const rows = A.subEvents(m);
  const sub = rows.find(r => r.off === 'p1');
  check('the pair became one row', sub.on, 'p4');
  check('at the right minute', sub.t, 600);
  check('and is not flagged as a move', sub.move, false);
  check('newest first', rows[0].t >= rows[rows.length - 1].t, true);

  // a position change is a close+open at the same second, and must read as a move
  const m2 = setup();
  A.movePos(m2, 'p2', 'sST', null, 600);
  const move = A.subEvents(m2).find(r => r.move);
  check('a position change reads as a move', !!move, true);
  check('with the same player on both sides', move.on === move.off, true);
}

console.log('\n--- a game can carry, and edit, a shape of its own ---');
{
  const p = A.presetsFor(9)['2-5-1'];
  check('2-5-1 is a 9v9 preset', p && p.length, 9);
  check('with exactly one keeper', p.filter(x => x.role === 'GK').length, 1);
  check('two backs, five across the middle, one up top',
    [p.filter(x => x.role === 'Back').length, p.filter(x => x.role === 'Mid' || x.role === 'Wing').length, p.filter(x => x.role === 'Forward').length].join('-'), '2-5-1');

  const m = setup();
  A.state.teams.t1.formations = { f1: { id: 'f1', name: 'Saved', size: 4, slots: [{ id: 'sGK', label: 'GK', role: 'GK', x: 50, y: 92 }] } };
  const before = ids(m), played = A.playedSec(m, 'p1');
  A.click({ act: 'editgameshape' });
  check('the editor opens on the game copy', A.ui.view + ':' + A.ui.editFid, 'formation:@game');
  A.click({ act: 'addslot' });
  check('a spot added to the game shape lands on the game', A.state.matches.g1.formation.slots.length, 5);
  A.click({ act: 'delslot', sid: 'sLB' });
  const g = A.state.matches.g1;
  check('removing an occupied spot removes it from the shape', g.formation.slots.some(x => x.id === 'sLB'), false);
  deepEq('and nobody leaves the pitch', ids(g), before);
  check('nor loses a second', A.playedSec(g, 'p1'), played);
  check('stints still agree with onField', agrees(g), true);
  check('the team shape is untouched', A.state.teams.t1.formations.f1.slots.length, 1);
  A.click({ act: 'saveshapeteam' });
  check('a copy can be saved back to the team', Object.keys(A.state.teams.t1.formations).length, 2);
  A.click({ act: 'backsetup' });
  check('back returns to the game, not club settings', A.ui.view + ':' + A.ui.gameView, 'game:pitch');
}

H.summary('stints and the sub actions');
