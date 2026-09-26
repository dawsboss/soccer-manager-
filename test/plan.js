/* The Plan tab: a plan is a few snapshots of the pitch, each one "from this
   minute, these players in these spots".

   The editor rewrites the whole plan on every tap, so the thing worth pinning is
   that what it writes stays the shape the rest of the app reads: blocks sorted
   by start, and `ids` always the players in `assign` — "Make these subs" and the
   live card go by ids, the pitch drawing goes by assign, and if the two drifted
   the plan would say one thing and do another. Minutes are worked out from the
   snapshots, so the arithmetic is checked here too. */

const H = require('./harness');
const { deepEq } = H;
/* check() is ===; lists and spot maps compare by value */
const check = (label, got, want) => want !== null && typeof want === 'object' ? deepEq(label, got, want) : H.check(label, got, want);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const A = H.loadApp({});
const T0 = Date.UTC(2026, 8, 12, 10, 0, 0);

const SLOTS = [
  { id: 'sGK', label: 'GK', role: 'GK', x: 50, y: 92 },
  { id: 'sLB', label: 'LB', role: 'Back', x: 25, y: 70 },
  { id: 'sRB', label: 'RB', role: 'Back', x: 75, y: 70 },
  { id: 'sST', label: 'ST', role: 'Forward', x: 50, y: 22 }
];

/* A game not yet kicked off: 2 × 40, 4v4, five players. */
function setup(opts = {}) {
  H.clock.set(T0);
  A.state = {
    teams: {
      t1: {
        id: 't1', name: 'G14 Flight', players: {
          p1: { id: 'p1', name: 'Ella', number: '7', preferred: 'Back' },
          p2: { id: 'p2', name: 'Mia', number: '8' },
          p3: { id: 'p3', name: 'Rosa', number: '4', preferred: 'Forward' },
          p4: { id: 'p4', name: 'Jo', number: '9' },
          p5: { id: 'p5', name: 'Sam', number: '1', gk: true }
        }
      }
    },
    matches: {
      g1: {
        id: 'g1', teamId: 't1', opponent: 'Riverside', date: '2026-09-12',
        periodCount: 2, periodMinutes: 40, onFieldCount: 4, currentHalf: 1,
        periods: {}, stints: {}, positions: {},
        formation: { name: '1-2-1', size: 4, slots: SLOTS.map(s => ({ ...s })) },
        ...opts
      }
    },
    access: {}
  };
  A.ui.teamId = 't1'; A.ui.matchId = 'g1';
  A.ui.view = 'game'; A.ui.gameView = 'plan'; A.ui.plan = null; A.ui.picked = null;
  A.ui.snapAt = null; A.ui.snapSid = null;
  return () => A.state.matches.g1;
}
const html = () => { A.render(); return A.rendered(); };
/* ids must always be exactly the players placed in assign */
const coherent = m => A.planBlocks(m).every(b =>
  same((b.ids || []).slice().sort(), Object.values(b.assign || {}).sort()));

console.log('--- an empty plan says how to start ---');
{
  setup();
  const h = html();
  check('the tab explains snapshots', /Snapshots/.test(h) && /Plan kick-off/.test(h), true);
  check('and still offers the draft', /Draft a plan/.test(h), true);
}

console.log('\n--- a game with no shape has no positions to plan ---');
{
  setup({ formation: null });
  const h = html();
  check('it asks for a shape', /Pick a shape/.test(h), true);
  check('rather than offering an empty pitch', /Plan kick-off/.test(h), false);
}

console.log('\n--- building kick-off: a spot, then a player ---');
{
  const g = setup();
  A.click({ act: 'snapstart' });
  check('kick-off exists', A.planBlocks(g()).map(b => b.start), [0]);
  check('and the first empty spot is picked for you', A.ui.snapSid, 'sGK');

  A.click({ act: 'snapplayer', pid: 'p5' });
  check('the keeper went in goal', A.planBlocks(g())[0].assign.sGK, 'p5');
  check('and the next empty spot is picked', A.ui.snapSid, 'sLB');
  A.click({ act: 'snapplayer', pid: 'p1' });
  A.click({ act: 'snapplayer', pid: 'p2' });
  A.click({ act: 'snapplayer', pid: 'p3' });
  check('four taps fill a 4v4', A.planBlocks(g())[0].assign, { sGK: 'p5', sLB: 'p1', sRB: 'p2', sST: 'p3' });
  check('with nothing left picked', A.ui.snapSid, null);
  check('ids agree with the spots', coherent(g()), true);
  check('the plan is marked as the coach\'s own', g().plan.manual, true);

  // tapping two spots swaps who is in them
  A.click({ act: 'snapslot', sid: 'sLB' });
  A.click({ act: 'snapslot', sid: 'sST' });
  check('two spots swap', [A.planBlocks(g())[0].assign.sLB, A.planBlocks(g())[0].assign.sST], ['p3', 'p1']);

  // a bench player into a filled spot takes it; the one there goes off
  A.click({ act: 'snapslot', sid: 'sRB' });
  A.click({ act: 'snapplayer', pid: 'p4' });
  check('a bench player replaces whoever was there', A.planBlocks(g())[0].assign.sRB, 'p4');
  check('and she is off the snapshot', A.planBlocks(g())[0].ids.includes('p2'), false);
  check('still coherent', coherent(g()), true);

  // leaving a spot empty
  A.click({ act: 'snapslot', sid: 'sRB' });
  A.click({ act: 'snapclear' });
  check('a spot can be left empty', A.planBlocks(g())[0].assign.sRB, undefined);
  check('and nobody is on for it', A.planBlocks(g())[0].ids.length, 3);
}

console.log('\n--- with no spot picked, a player goes where she fits ---');
{
  const g = setup();
  A.click({ act: 'snapstart' });
  A.ui.snapSid = null;
  A.click({ act: 'snapplayer', pid: 'p3' });
  check('a forward lands up front', A.planBlocks(g())[0].assign.sST, 'p3');
  A.click({ act: 'snapplayer', pid: 'p5' });
  check('the keeper lands in goal', A.planBlocks(g())[0].assign.sGK, 'p5');
  A.click({ act: 'snapplayer', pid: 'p5' });
  check('tapping a placed player picks her spot', A.ui.snapSid, 'sGK');
}

console.log('\n--- later snapshots: copy, time, delete ---');
{
  const g = setup();
  A.click({ act: 'snapstart' });
  for (const pid of ['p5', 'p1', 'p2', 'p3']) A.click({ act: 'snapplayer', pid });

  A.click({ act: 'snapadd' });
  check('a copy lands ten minutes on', A.planBlocks(g()).map(b => b.start), [0, 600]);
  check('with the same lineup', A.planBlocks(g())[1].assign, A.planBlocks(g())[0].assign);
  check('and is the one being edited', A.ui.snapAt, 600);

  A.click({ act: 'snaptime', d: '600' });
  check('it can be moved later', A.planBlocks(g())[1].start, 1200);
  A.click({ act: 'snapadd' });
  A.click({ act: 'snapadd' });
  check('copies stop at half-time, where subs usually happen', A.planBlocks(g()).map(b => b.start), [0, 1200, 1800, 2400]);
  check('which reads as the half', A.snapLabel(g(), 2400), '2nd half');
  check('and a minute reads with its half', A.snapLabel(g(), 3000), '50:00 · 2nd half');

  A.click({ act: 'snaptime', d: '-600' });
  check('a clash with another snapshot is refused', A.planBlocks(g()).map(b => b.start), [0, 1200, 1800, 2400]);
  check('and says why', /already a snapshot/.test(A.lastToast()), true);

  A.ui.snapAt = 0;
  A.click({ act: 'snaptime', d: '300' });
  check('kick-off does not move', A.planBlocks(g())[0].start, 0);
  A.click({ act: 'snapdel' });
  check('kick-off cannot be deleted while others hang off it', A.planBlocks(g()).length, 4);

  A.ui.snapAt = 1800;
  A.click({ act: 'snapdel' });
  check('a later one can', A.planBlocks(g()).map(b => b.start), [0, 1200, 2400]);
  check('and the one before it is picked', A.ui.snapAt, 1200);
  check('still coherent after all that', coherent(g()), true);
}

console.log('\n--- minutes fall out of the snapshots ---');
{
  const g = setup();
  A.click({ act: 'snapstart' });
  for (const pid of ['p5', 'p1', 'p2', 'p3']) A.click({ act: 'snapplayer', pid });
  A.click({ act: 'snapadd' });                    // 10:00
  A.click({ act: 'snaptime', d: '1800' });        // 40:00 — half-time
  A.click({ act: 'snapslot', sid: 'sST' });
  A.click({ act: 'snapplayer', pid: 'p4' });      // Jo on for Rosa
  const s = A.planSeconds(g());
  check('the keeper plays all 80', s.p5, 4800);
  check('Rosa plays the first half', s.p3, 2400);
  check('Jo plays the second', s.p4, 2400);
  check('every filled spot adds up to the game', Object.values(s).reduce((a, b) => a + b, 0), 4 * 4800);
  const h = html();
  check('the diff shows the sub', /on:<\/span> Jo \(ST\)/.test(h) && /off:<\/span> Rosa/.test(h), true);
}

console.log('\n--- blocks as the database hands them back ---');
{
  // a gap in an array comes back from Firebase as an object with numeric keys
  const g = setup({ plan: { manual: true, blocks: { 0: { start: 0, ids: ['p1'], assign: { sLB: 'p1' } }, 2: { start: 1200, assign: {} } } } });
  check('read as a sorted list', A.planBlocks(g()).map(b => b.start), [0, 1200]);
  check('the current block is found', A.planBlockAt(g(), 900).start, 0);
  check('the next one too', A.nextPlanBlock(g(), 900).start, 1200);
  check('a block with no ids is not a crash', A.planSeconds(g()).p1, 1200);
  check('and the tab draws', /Snapshots/.test(html()), true);
}

console.log('\n--- a snapshot puts the right players on ---');
{
  const g = setup();
  A.click({ act: 'snapstart' });
  for (const pid of ['p5', 'p1', 'p2', 'p3']) A.click({ act: 'snapplayer', pid });
  A.click({ act: 'applyblock', start: '0' });
  check('the kick-off lineup is on the pitch', A.fieldIds(g()).slice().sort(), ['p1', 'p2', 'p3', 'p5']);
  check('in their spots', A.slotIdOf(g(), 'p1'), 'sLB');
}

console.log('\n--- the draft does not quietly replace your snapshots ---');
{
  const g = setup();
  A.click({ act: 'snapstart' });
  A.click({ act: 'snapplayer', pid: 'p5' });
  const before = JSON.stringify(g().plan);
  global.confirm = () => false;
  A.click({ act: 'makeplan' });
  check('declining keeps them', JSON.stringify(g().plan), before);
  global.confirm = () => true;
  A.click({ act: 'makeplan' });
  check('accepting drafts a fresh plan', g().plan.manual, undefined);
  check('with a block every ten minutes', A.planBlocks(g()).length, 8);
}

H.summary('the Plan tab\'s snapshots');
