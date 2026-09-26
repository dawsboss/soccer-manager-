/* A locked-in plan at the sideline.

   The coach locks the plan in from the Plan tab; whoever tracks the game —
   often a parent — is told when each change is due and taps once when the
   referee lets the subs on. Three things are worth pinning, because each one
   going wrong costs something real at a game:

   - Timing is asked in the half the change belongs to. A first half that runs
     short must not make a "10 minutes into the second half" change come due
     early, and a change set for half-time comes due when the half is ended.
   - The tap writes the same stints a coach's subs would, at the minute it was
     pressed — so minutes, spots and the match log all agree — and can be taken
     back for a short while without leaving a hole in anyone's minutes.
   - A tracker is told when, never who. The card a tracker sees carries no names, and
     the click handler, not the button being hidden, is what stops a parent or a
     stranger making subs.

   Booted with a Firebase config for the same reason visibility.js is: without
   one nothing is gated, and every "a parent may not" below would pass without
   testing anything. The modules are fakebase's, so the boot settles cleanly
   when the "saved to the club" case waits on a promise; with no workspace code
   the app never connects, and each case sets who is signed in itself. */

const H = require('./harness');
const { deepEq } = H;
const { makeFakebase } = require('./fakebase');
const check = (label, got, want) => want !== null && typeof want === 'object' ? deepEq(label, got, want) : H.check(label, got, want);

const CFG = { apiKey: 'k', databaseURL: 'https://prod.example' };
const A = H.loadApp({ config: CFG, firebase: makeFakebase() });
const T0 = Date.UTC(2026, 8, 12, 10, 0, 0);
const MIN = 60000;

const SLOTS = [
  { id: 'sGK', label: 'GK', role: 'GK', x: 50, y: 92 },
  { id: 'sLB', label: 'LB', role: 'Back', x: 25, y: 70 },
  { id: 'sRB', label: 'RB', role: 'Back', x: 75, y: 70 },
  { id: 'sST', label: 'ST', role: 'Forward', x: 50, y: 22 }
];
const NAMES = ['Ella', 'Mia', 'Rosa', 'Jo', 'Sam', 'Lou'];
const blk = (start, assign) => ({ start, ids: Object.values(assign), assign });

/* 2 × 40, 4v4. Kick-off, Jo on for Mia at 10:00, two changes at half-time, and
   Ella back on for Jo ten minutes into the second half (50:00 on the plan). */
function setup(opts = {}) {
  H.clock.set(T0);
  A.state = {
    teams: {
      t1: {
        id: 't1', name: 'G14 Flight', players: {
          p1: { id: 'p1', name: 'Ella', number: '7', guardians: { mum: true } },
          p2: { id: 'p2', name: 'Mia', number: '8' },
          p3: { id: 'p3', name: 'Rosa', number: '4' },
          p4: { id: 'p4', name: 'Jo', number: '9' },
          p5: { id: 'p5', name: 'Sam', number: '1', gk: true },
          p6: { id: 'p6', name: 'Lou', number: '11' }
        }
      },
      t2: { id: 't2', name: 'G12 Storm', players: {} }
    },
    matches: {
      g1: {
        id: 'g1', teamId: 't1', opponent: 'Riverside', date: '2026-09-12',
        periodCount: 2, periodMinutes: 40, onFieldCount: 4, currentHalf: 1,
        periods: {}, stints: {}, positions: {},
        formation: { name: '1-2-1', size: 4, slots: SLOTS.map(s => ({ ...s })) },
        plan: {
          manual: true,
          blocks: [
            blk(0, { sGK: 'p5', sLB: 'p1', sRB: 'p2', sST: 'p3' }),
            blk(600, { sGK: 'p5', sLB: 'p1', sRB: 'p4', sST: 'p3' }),
            blk(2400, { sGK: 'p5', sLB: 'p2', sRB: 'p4', sST: 'p6' }),
            blk(3000, { sGK: 'p5', sLB: 'p2', sRB: 'p1', sST: 'p6' })
          ],
          locked: { at: T0 - 3600000, by: 'jaz', byName: 'Jaz' }
        },
        ...opts
      }
    },
    access: {
      admins: { boss: true },
      teams: { t1: { coaches: { jaz: true }, trackers: { trk: true } }, t2: { trackers: { trk2: true } } },
      index: { boss: true, jaz: true, trk: true, trk2: true, mum: true }
    }
  };
  as('trk');
  A.ui.teamId = 't1'; A.ui.matchId = 'g1'; A.ui.view = 'game'; A.ui.gameView = 'track';
  A.ui.plan = null; A.ui.picked = null; A.ui.snapAt = null; A.ui.snapSid = null;
  return () => A.state.matches.g1;
}
function as(uid) { A.me = uid ? { uid, name: uid === 'jaz' ? 'Jaz' : uid === 'trk' ? 'Tess' : uid } : null; A.appOwners = {}; }
const html = () => { A.render(); return A.rendered(); };
const card = () => A.subsCard(A.team(), A.match(), A.nowMs());
const named = s => NAMES.filter(n => s.includes(n));
const startHalf = (g, half) => { const i = Object.keys(g().periods || {}).length; g().periods[i] = { half, start: H.clock.t }; };
const openIn = (g, pid) => { const o = A.openStint(g(), pid); return o ? o[1] : null; };
const on = g => A.fieldIds(g()).slice().sort();

console.log('--- locking the plan in ---');
{
  const g = setup();
  delete g().plan.locked;
  as('jaz'); A.ui.gameView = 'plan';
  let h = html();
  check('an unlocked plan offers to lock it in', /data-act="planlock"/.test(h), true);
  check('and says what locking does', /told when each change is due/.test(h), true);

  A.click({ act: 'planlock' });
  check('locking writes who and when', !!g().plan.locked && g().plan.locked.byName, 'Jaz');
  check('with no database, saved means this phone', A.lockSaved(g()), 'device');
  h = html();
  check('the tab says it is locked in', /Plan locked in/.test(h), true);
  check('and where it is saved', /Saved on this phone\./.test(h), true);
  check('and offers to unlock', /data-act="planunlock"/.test(h), true);
  check('no + Add while locked', /data-act="snapadd"/.test(h), false);
  check('no redraft while locked', /Redraft the plan/.test(h), false);

  const before = JSON.stringify(g().plan.blocks);
  A.ui.snapAt = 0;
  A.click({ act: 'snapslot', sid: 'sLB' });
  A.click({ act: 'snapplayer', pid: 'p6' });
  check('a locked plan refuses an edit', JSON.stringify(g().plan.blocks) === before, true);
  check('and says why', /locked in/.test(A.lastToast()), true);
  A.click({ act: 'snappick', start: '600' });
  check('but can still be looked through', A.ui.snapAt, 600);

  as('trk');
  A.click({ act: 'planunlock' });
  check('a tracker cannot unlock it', !!g().plan.locked, true);
  as('mum');
  A.click({ act: 'planunlock' });
  check('nor can a parent', !!g().plan.locked, true);

  as('jaz');
  A.click({ act: 'planunlock' });
  check('its coach can', g().plan.locked, undefined);
  A.click({ act: 'snapadd' });
  check('and then edit again', A.planBlocks(g()).length, 5);
}

console.log('\n--- a plan worth a second look asks before locking ---');
{
  const g = setup();
  delete g().plan.locked;
  delete g().plan.blocks[1].assign.sRB;
  g().plan.blocks[1].ids = Object.values(g().plan.blocks[1].assign);
  g().out = { p6: true };
  as('jaz');
  deepEq('an empty spot and a player who is out are both named', A.planIssues(A.team(), g()),
    ['10:00: 1 empty spot', '40:00: Lou is not available', '50:00: Lou is not available']);
  global.confirm = () => false;
  A.click({ act: 'planlock' });
  check('declining leaves it unlocked', g().plan.locked, undefined);
  global.confirm = () => true;
  A.click({ act: 'planlock' });
  check('accepting locks it anyway', !!g().plan.locked, true);

  global.confirm = () => false;
  A.click({ act: 'makeplan' });
  check('a redraft asks first when locked', !!g().plan.locked, true);
  global.confirm = () => true;
  A.click({ act: 'makeplan' });
  check('and a redraft is not the plan that was locked in', g().plan.locked, undefined);
}

console.log('\n--- "saved" means the club has it ---');
{
  const g = setup();
  delete g().plan.locked;
  as('jaz'); A.ui.gameView = 'plan';
  let settle;
  A.fb = {
    db: {}, base: 'workspaces/CLUB', ref: (db, path) => ({ path }),
    set: (ref, v) => /plan\/locked$/.test(ref.path) ? new Promise((ok, no) => { settle = { ok, no }; }) : Promise.resolve(),
    remove: () => Promise.resolve()
  };
  A.click({ act: 'planlock' });
  check('until the database answers, it is on its way', A.lockSaved(g()), 'sending');
  check('and the tab does not claim otherwise', /Saved to the club/.test(html()), false);
  settle.ok();
  (async () => {
    await H.flush();
    check('once it answers, it is saved to the club', A.lockSaved(g()), 'saved');
    check('and the tab says so', /Saved to the club/.test(html()), true);

    A.click({ act: 'planunlock' });
    H.clock.advance(1000);
    A.click({ act: 'planlock' });
    settle.no({ code: 'PERMISSION_DENIED' });
    await H.flush();
    check('a refusal is said out loud', A.lockSaved(g()), 'refused');
    check('with what to check', /club refused it/.test(html()), true);
    A.fb = null;

    sideline();
  })();
}

function sideline() {
  console.log('\n--- before kick-off: the starting lineup ---');
  {
    const g = setup();
    let s = A.subsDue(g());
    check('an empty pitch wants the kick-off lineup', s && s.kind + ':' + s.b.start, 'due:0');
    const c = card();
    check('the tracker is asked for the starters', /Starters are on/.test(c), true);
    check('and is told how many, not who', named(c), []);

    A.click({ act: 'subsgo', start: '0' });
    check('one tap puts the plan\'s starters on', on(g), ['p1', 'p2', 'p3', 'p5']);
    check('each in the planned spot', ['p5', 'p1', 'p2', 'p3'].map(p => openIn(g, p).slot), ['sGK', 'sLB', 'sRB', 'sST']);
    check('with its role, for minutes by position', openIn(g, 'p1').role, 'Back');
    check('and it is marked done', !!(g().planDone || {}).s0, true);
    s = A.subsDue(g());
    check('then the card waits for the 10:00 change', s.kind + ':' + s.b.start, 'wait:600');
  }

  console.log('\n--- starters the coach set by hand are kept ---');
  {
    const g = setup();
    A.putOnField(g(), 'p6', 50, 22, 'sST');
    check('anyone on the pitch settles kick-off', A.subsDue(g()).kind, 'wait');
  }

  console.log('\n--- counting down to a change, then calling it ---');
  {
    const g = setup();
    A.click({ act: 'subsgo', start: '0' });
    startHalf(g, 1);
    H.clock.advance(5 * MIN);
    let s = A.subsDue(g());
    check('five minutes in, the next is five minutes off', [s.kind, s.until], ['wait', 300]);
    let c = card();
    check('the card counts down', /in 5:00/.test(c), true);
    check('and says when on the half clock', /at 10:00 of the 1st half/.test(c), true);
    check('with no button yet', /data-act="subsgo"/.test(c), false);
    check('and no names', named(c), []);

    H.clock.advance(2.5 * MIN);
    s = A.subsDue(g());
    check(`inside ${A.SUB_LEAD / 60} minutes it is coming up`, [s.kind, s.until], ['soon', 150]);
    c = card();
    check('and grows its button', /Subs are on/.test(c), true);

    H.clock.advance(3 * MIN);
    s = A.subsDue(g());
    check('past the minute it is due', [s.kind, s.until], ['due', -30]);
    c = card();
    check('loudly', /Subs due now/.test(c) && /data-state="due"/.test(c), true);
    check('the tracker is told how many', /1 sub/.test(c), true);
    check('and never who', named(c), []);
    as('jaz');
    const cc = card();
    check('the coach is told who — it is the coach\'s plan', /Jo/.test(cc) && /Mia/.test(cc), true);
    as('trk');

    H.clock.advance(40 * 1000);
    check('how late it is shows on the card', /1:10 ago/.test(card()), true);
    A.click({ act: 'subsgo', start: '600' });
    check('the tap makes the planned sub', on(g), ['p1', 'p3', 'p4', 'p5']);
    check('at the minute it was tapped, not the plan\'s', openIn(g, 'p4').on, 670);
    check('into the planned spot', openIn(g, 'p4').slot, 'sRB');
    check('Mia\'s minutes stop there', A.playedSec(g(), 'p2'), 670);
    check('and it says what it did', A.lastToast(), '1 sub made at 11:10');
    check('who tapped is kept', g().planDone.s600.byName, 'Tess');
    check('the match log has it', A.subEvents(g()).some(r => r.on === 'p4' && r.off === 'p2' && r.t === 670), true);
    const log = () => { const h = html(); return h.slice(h.indexOf('id="matchlog"')); };
    check('and the tap itself, as the planned change it was', /<b>Planned subs made<\/b> <span class="muted">\(10:00 · 1st half\)/.test(log()), true);
    check('with who tapped it', /1st half\)<\/span> <span class="muted">· Tess/.test(log()), true);
    check('above the sub it made', log().indexOf('Planned subs') < log().indexOf('Jo'), true);
    check('the card waits for half-time', A.subsDue(g()).kind + ':' + A.subsDue(g()).b.start, 'wait:2400');

    const stints = Object.keys(g().stints).length;
    A.click({ act: 'subsgo', start: '600' });
    check('a second tap does nothing', Object.keys(g().stints).length, stints);
    check('and says so', /Already done/.test(A.lastToast()), true);

    console.log('\n--- a mis-tap can be taken back ---');
    check('the card offers to undo', /data-act="subsundo"/.test(card()), true);
    H.clock.advance(30 * 1000);
    A.click({ act: 'subsundo', key: 's600' });
    check('undo puts Mia back on', on(g), ['p1', 'p2', 'p3', 'p5']);
    check('in the spell that was never really closed', openIn(g, 'p2').on, 0);
    check('so Mia\'s minutes carry on', A.playedSec(g(), 'p2'), 700);
    check('Jo never went on', A.stintsOf(g(), 'p4').length, 0);
    check('the change is due again', A.subsDue(g()).kind, 'due');

    A.click({ act: 'subsgo', start: '600' });
    H.clock.advance(3 * MIN);
    A.click({ act: 'subsundo', key: 's600' });
    check('after two minutes it will not undo blind', on(g), ['p1', 'p3', 'p4', 'p5']);
    check('and points to the match log', /match log/.test(A.lastToast()), true);
  }

  console.log('\n--- restarting the clock starts the plan over ---');
  {
    const g = setup();
    A.click({ act: 'subsgo', start: '0' });
    startHalf(g, 1);
    H.clock.advance(11 * MIN);
    A.click({ act: 'subsgo', start: '600' });
    A.restartMatch(g());
    check('what was done belongs to the old clock', !g().planDone, true);
    check('and the 10:00 change is ahead again on the new clock', A.subsDue(g()).kind + ':' + A.subsDue(g()).b.start, 'wait:600');
  }

  console.log('\n--- subs a coach makes by hand count ---');
  {
    const g = setup();
    A.click({ act: 'subsgo', start: '0' });
    startHalf(g, 1);
    H.clock.advance(10.5 * MIN);
    A.swap(g(), 'p2', 'p4');
    check('the pitch matching the plan settles it', A.subsDue(g()).kind, 'wait');
  }

  console.log('\n--- the coach\'s own button marks it done too ---');
  {
    const g = setup();
    A.click({ act: 'subsgo', start: '0' });
    startHalf(g, 1);
    H.clock.advance(10.5 * MIN);
    as('jaz');
    A.click({ act: 'applyblock', start: '600' });
    check('"Make these subs" is the planned change', !!g().planDone.s600, true);
    check('with the new spell in the planned spot', openIn(g, 'p4').slot, 'sRB');
  }

  console.log('\n--- half-time, and a first half that ran short ---');
  {
    const g = setup();
    A.click({ act: 'subsgo', start: '0' });
    startHalf(g, 1);
    H.clock.advance(11 * MIN);
    A.click({ act: 'subsgo', start: '600' });
    H.clock.advance(27 * MIN);                         // 38:00, the referee is about to blow
    let s = A.subsDue(g());
    check('half-time changes are coming up near the end', s.kind + ':' + s.b.start, 'soon:2400');
    check('and read as half-time', A.subsWhen(g(), s.b), 'at half-time');
    check('with no countdown across the break', A.subsClock(g(), s.b, s.until), '');
    A.endHalf(g());
    s = A.subsDue(g());
    check('ending the half makes them due', s.kind + ':' + s.b.start, 'due:2400');
    A.click({ act: 'subsgo', start: '2400' });
    check('two changes in one tap', on(g), ['p2', 'p4', 'p5', 'p6']);
    check('Mia back on at left back', openIn(g, 'p2').slot, 'sLB');
    check('both at the whistle', [openIn(g, 'p2').on, openIn(g, 'p6').on], [2280, 2280]);

    H.clock.advance(4 * MIN);                          // the break
    startHalf(g, 2);
    H.clock.advance(9 * MIN);
    s = A.subsDue(g());
    check('10:00 into the 2nd half counts on the 2nd half\'s clock', [s.kind, s.b.start, s.until], ['soon', 3000, 60]);
    check('even though the running total is only 47:00', A.elapsedSec(g()), 2820);
    H.clock.advance(1 * MIN);
    check('and is due when that clock says so', A.subsDue(g()).kind, 'due');

    console.log('\n--- not every planned change happens ---');
    A.click({ act: 'subsskip', start: '3000' });
    check('skipping moves nobody', on(g), ['p2', 'p4', 'p5', 'p6']);
    check('and says so', /nobody was moved/.test(A.lastToast()), true);
    A.ui.gameView = 'track';
    const skipLog = () => { const h = html(); return h.slice(h.indexOf('id="matchlog"')); };
    check('a skip is in the log, since it made no subs to show', /<b>Planned subs skipped<\/b> <span class="muted">\(50:00 · 2nd half\)/.test(skipLog()), true);
    check('at the minute it was tapped', g().planDone.s3000.t, A.elapsedSec(g()));
    check('that was the last one', A.subsDue(g()).kind, 'over');
    A.click({ act: 'subsundo', key: 's3000' });
    check('a skip can be taken back too', A.subsDue(g()).kind, 'due');
    check('and leaves the log with it', /skipped/.test(skipLog()), false);

    A.endGame(g());
    check('an ended game has nothing due', A.subsDue(g()), null);
    check('and no card', card(), '');
  }

  console.log('\n--- who may call the subs ---');
  {
    const g = setup();
    as('mum');
    A.click({ act: 'subsgo', start: '0' });
    check('a parent cannot', on(g), []);
    check('and is not shown the card', card(), '');
    as('trk2');
    A.click({ act: 'subsgo', start: '0' });
    check('nor can another team\'s tracker', on(g), []);
    as('nobody');
    A.click({ act: 'subsgo', start: '0' });
    check('nor a signed-in stranger', on(g), []);

    as('jaz');
    A.click({ act: 'planunlock' });
    as('trk');
    check('an unlocked plan is not followed', A.subsDue(g()), null);
    A.click({ act: 'subsgo', start: '0' });
    check('and a tracker cannot act on it', on(g), []);
    check('the tracker is told there is no plan yet', /No sub plan is locked in/.test(card()), true);
    as('jaz'); A.ui.gameView = 'track';
    check('the coach is told to lock it in', /Lock in your plan/.test(card()), true);
  }

  console.log('\n--- the clock on the Track tab ---');
  {
    /* Track is where the coach is when she is logging a corner, so the clock is
       there too. It is still the coach's: a tracker sees it run, and neither the
       button nor the click reaches startClock(). */
    const g = setup();
    as('jaz'); A.ui.gameView = 'track';
    let h = html();
    check('the coach can start the clock from Track', /data-act="start"/.test(h), true);
    A.click({ act: 'start' });
    check('and it starts', A.running(g()), true);
    h = html();
    check('then pause it', /data-act="pause"/.test(h), true);
    check('or end the half', /data-act="endhalf"/.test(h), true);
    A.click({ act: 'pause' });
    check('and pausing stops it', A.running(g()), false);
    as('trk'); A.ui.gameView = 'track';
    h = html();
    check('a tracker sees no clock buttons', /data-act="(start|pause|endhalf|endgame)"/.test(h), false);
    check('and is told who runs it', /the coach runs the clock/.test(h), true);
    A.click({ act: 'start' });
    check('a tracker cannot start it by force', A.running(g()), false);
  }

  console.log('\n--- what to tell the bench ---');
  {
    const g = setup();
    as('jaz');
    const bl = () => A.planBlocks(g());
    const text = c => A.benchText(A.team(), g(), c, A.squad(A.team(), g()).map(p => p.id));
    let c = A.benchCalls(g(), null, bl()[0]);
    check('from nothing, the calls are a starting lineup', c.kickoff, true);
    check('read out spot by spot, keeper first', text(c),
      '- GK: Sam (1)\n- LB: Ella (7)\n- RB: Mia (8)\n- ST: Rosa (4)\nBench: Jo (9), Lou (11)');

    A.click({ act: 'subsgo', start: '0' });
    c = A.benchCalls(g(), A.pitchNow(g()), bl()[1]);
    check('a sub says who, where and for whom', text(c), 'Going on:\n- Jo (9) at RB, for Mia (8)\nComing off: Mia (8)');

    // on into a spot a teammate moves out of: still on for somebody
    c = A.benchCalls(g(), A.pitchNow(g()), { start: 900, assign: { sGK: 'p5', sLB: 'p3', sRB: 'p2', sST: 'p6' } });
    check('a chain reads as a sub and a switch', text(c),
      'Going on:\n- Lou (11) at ST, for Ella (7)\nSwitching spots:\n- Rosa (4): ST to LB\nComing off: Ella (7)');

    // the coach subbed by hand before 10:00: the calls start from the real pitch
    startHalf(g, 1);
    H.clock.advance(5 * MIN);
    A.swap(g(), 'p3', 'p6');
    H.clock.advance(5.5 * MIN);
    c = A.benchCalls(g(), A.benchFrom(g(), bl()[1]), bl()[1]);
    check('during a game, from the pitch as it is', text(c),
      'Going on:\n- Jo (9) at RB, for Mia (8)\n- Rosa (4) at ST, for Lou (11)\nComing off: Mia (8), Lou (11)');
    const due = card();
    check('the coach\'s card carries the calls', /for Mia \(8\)/.test(due) && /Tell the bench/.test(due), true);
    as('trk');
    check('the tracker\'s card still names nobody', named(card()), []);

    let copied = null;
    // Node 22 has a navigator of its own that an assignment cannot replace
    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: { writeText: v => { copied = v; return Promise.resolve(); } } }, configurable: true, writable: true
    });
    const sheet = () => String(A.dom.node('#sheet').innerHTML || '');
    A.dom.node('#sheet').innerHTML = '';
    A.click({ act: 'bench', start: '600' });
    check('a tracker cannot open the bench calls', sheet(), '');
    A.click({ act: 'benchall' });
    check('nor the bench sheet', sheet(), '');

    as('jaz');
    A.click({ act: 'bench', start: '600' });
    check('the coach can', /Tell the bench/.test(sheet()) && /Jo \(9\)/.test(sheet()), true);
    check('and is told it is from the pitch now', /from who is on the pitch now/.test(sheet()), true);
    A.click({ act: 'benchcopy' });
    check('copied as a message, headed with when', copied && copied.split('\n')[0], 'Subs at 10:00 of the 1st half — v Riverside');
    as('trk');
    copied = null;
    A.click({ act: 'benchcopy' });
    check('and a tracker cannot copy what the coach opened', copied, null);

    as('jaz');
    A.click({ act: 'benchall' });
    const all = sheet();
    check('the bench sheet has every change', ['Kick-off', '10:00 · 1st half', '2nd half', '50:00 · 2nd half'].every(x => all.includes(x)), true);
    A.click({ act: 'benchcopy' });
    check('snapshot to snapshot, since later pitches are not known yet', /50:00 · 2nd half\nGoing on:\n- Ella \(7\) at RB, for Jo \(9\)\nComing off: Jo \(9\)/.test(copied), true);
    A.ui.gameView = 'plan';
    const h = html();
    check('the Plan tab offers it per snapshot', /data-act="bench"/.test(h), true);
    check('and for the whole game once locked in', /data-act="benchall"/.test(h), true);
  }

  console.log('\n--- the tabs draw ---');
  {
    const g = setup();
    let h = html();
    check('the Track tab shows the card', /id="subsdue"/.test(h), true);
    check('the tracker\'s role bar mentions the planned subs', /planned subs/.test(h), true);
    as('jaz'); A.ui.gameView = 'live';
    h = html();
    check('the Live tab shows it to the coach', /id="subsdue"/.test(h) && /Sam/.test(h), true);
    A.ui.gameView = 'plan';
    check('the Plan tab draws locked', /Plan locked in/.test(html()), true);
    A.click({ act: 'subsgo', start: '0' });
    startHalf(g, 1);
    H.clock.advance(10.5 * MIN);
    check('and mid-game says the same thing is due as Track', /Subs due now/.test(html()), true);
    g().plan.blocks = [{ start: 0, ids: ['p5', 'p1', 'p2', 'p3'] }];   // the auto planner with no shape
    g().formation = null; g().periods = {}; g().stints = {}; g().positions = {}; delete g().planDone;
    A.click({ act: 'subsgo', start: '0' });
    check('a plan with no spots still puts the players on', on(g), ['p1', 'p2', 'p3', 'p5']);
    check('each somewhere on the pitch', A.fieldIds(g()).every(p => g().positions[p] && g().positions[p].x != null), true);
  }

  H.summary('planned subs at the sideline');
}
