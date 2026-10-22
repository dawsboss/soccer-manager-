/* A locked-in plan at the sideline.

   The coach locks the plan in from the Lineup tab; at the game the bench, the
   coach on Subs and her team's helper on Lineup, is told when each change is
   due and taps once when the referee lets the subs on (until build 175 that
   was the tracker's card, on Track, told when and never who; the owner,
   2026-10-18, moved it so the tracker stays on the ball). Three things are worth pinning, because each one
   going wrong costs something real at a game:

   - Timing is asked in the half the change belongs to. A first half that runs
     short must not make a "10 minutes into the second half" change come due
     early, and a change set for half-time comes due when the half is ended.
   - The tap writes the same stints a coach's subs would, at the minute it was
     pressed — so minutes, spots and the match log all agree — and can be taken
     back for a short while without leaving a hole in anyone's minutes.
   - The card is staff's, with names: the coach's and the helper's. The click
     handler, not the button being hidden, is what stops a parent, a tracker or
     a stranger making subs.

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
      teams: { t1: { coaches: { jaz: true }, trackers: { trk: true }, helpers: { hal: true } }, t2: { trackers: { trk2: true } } },
      index: { boss: true, jaz: true, trk: true, trk2: true, hal: true, mum: true }
    }
  };
  as('hal');   // the helper, on her Lineup: the sideline card is hers since build 175
  A.ui.teamId = 't1'; A.ui.matchId = 'g1'; A.ui.view = 'game'; A.ui.gameView = 'plan';
  A.ui.plan = null; A.ui.picked = null; A.ui.snapAt = null; A.ui.snapSid = null;
  return () => A.state.matches.g1;
}
function as(uid) { A.me = uid ? { uid, name: uid === 'jaz' ? 'Jaz' : uid === 'trk' ? 'Tess' : uid === 'hal' ? 'Hal' : uid } : null; A.appOwners = {}; }
// the match log is on Track: read it as the coach, then come back to whoever was tapping
const trackLog = () => { const was = A.me, gv = A.ui.gameView; as('jaz'); A.ui.gameView = 'track'; const h = html(); A.me = was; A.ui.gameView = gv; return h.slice(h.indexOf('id="matchlog"')); };
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
  check('and says what locking does: Subs and the helper\'s Lineup count down (build 175)', /Subs and your helper\u2019s Lineup count down to each change/.test(h), true);

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

  A.click({ act: 'makeplan' });
  check('there is no redraft over a locked plan', !!g().plan.locked, true);
  A.click({ act: 'snapwipe' });
  check('nor a clear: unlock first', !!g().plan.locked, true);
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
    check('the helper is asked for the starters', /Starters are on/.test(c), true);
    check('and told who: she is staff, and it is her tap', named(c).length > 0, true);

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
    check('and the names already', named(c).length > 0, true);

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
    check('the helper is told how many', /1 sub/.test(c), true);
    check('and who', /Jo/.test(c) && /Mia/.test(c), true);
    as('jaz');
    const cc = card();
    check('the coach the same', /Jo/.test(cc) && /Mia/.test(cc), true);
    as('trk');
    check('the tracker has no card at all (build 175)', card(), '');
    as('hal');

    H.clock.advance(40 * 1000);
    check('how late it is shows on the card', /1:10 ago/.test(card()), true);
    A.click({ act: 'subsgo', start: '600' });
    check('the tap makes the planned sub', on(g), ['p1', 'p3', 'p4', 'p5']);
    check('at the minute it was tapped, not the plan\'s', openIn(g, 'p4').on, 670);
    check('into the planned spot', openIn(g, 'p4').slot, 'sRB');
    check('Mia\'s minutes stop there', A.playedSec(g(), 'p2'), 670);
    check('and it says what it did', A.lastToast(), '1 sub made at 11:10');
    check('who tapped is kept', g().planDone.s600.byName, 'Hal');
    check('the match log has it', A.subEvents(g()).some(r => r.on === 'p4' && r.off === 'p2' && r.t === 670), true);
    const log = trackLog;
    check('and the tap itself, as the planned change it was', /<b>Planned subs made<\/b> <span class="muted">\(10:00 · 1st half\)/.test(log()), true);
    check('with who tapped it', /1st half\)<\/span> <span class="muted">· Hal/.test(log()), true);
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
    const skipLog = trackLog;
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
    as('trk');
    A.click({ act: 'subsgo', start: '0' });
    check('nor the team\'s own tracker, since build 175: she is on the ball', on(g), []);
    check('and has no card', card(), '');
    as('nobody');
    A.click({ act: 'subsgo', start: '0' });
    check('nor a signed-in stranger', on(g), []);

    as('jaz');
    A.click({ act: 'planunlock' });
    as('hal');
    check('an unlocked plan is not followed', A.subsDue(g()), null);
    A.click({ act: 'subsgo', start: '0' });
    check('and the helper cannot act on it', on(g), []);
    check('her Lineup has no card for it (its Lock in card says what to do)', card(), '');
    as('jaz'); A.ui.gameView = 'subs';
    check('the coach is told to lock it in, on Subs', /Lock in your plan/.test(card()), true);
    A.ui.gameView = 'track';
    check('— and nothing on Track', card(), '');
  }

  console.log('\n--- the clock on the Track tab ---');
  {
    /* Track is where the clock is run (the owner, 2026-10-18: Track runs the
       clock, not the coach): the coach from Track, and the tracker she hands it
       to as well, since build 175. A parent sees it run and neither the button
       nor the click reaches startClock(). Starting over at 0:00 and Ended by
       mistake? stay the coach's. */
    const g = setup();
    as('jaz'); A.ui.gameView = 'track';
    let h = html();
    check('the coach can start the clock from Track', /data-act="start"/.test(h), true);
    A.click({ act: 'start' });
    check('and it starts', A.running(g()), true);
    H.clock.advance(MIN);
    h = html();
    check('then pause it', /data-act="pause"/.test(h), true);
    check('or end the half', /data-act="endhalf"/.test(h), true);
    A.click({ act: 'pause' });
    check('and pausing stops it', A.running(g()), false);
    as('trk'); A.ui.gameView = 'track';
    h = html();
    check('a tracker has the clock buttons too (build 175)', /data-act="start"/.test(h) && /data-act="endhalf"/.test(h) && /data-act="endgame"/.test(h) && /data-act="fixclock"/.test(h), true);
    A.click({ act: 'start' });
    check('and starts it', A.running(g()), true);
    A.click({ act: 'pause' });
    check('and pauses it', A.running(g()), false);
    A.click({ act: 'fixclock' });
    check('her Clock reading wrong? nudges, and never starts the game over', /data-act="nudgeclock"/.test(String(A.dom.node('#sheet').innerHTML)) && !/data-act="restartgame"/.test(String(A.dom.node('#sheet').innerHTML)), true);
    A.closeSheet();
    as('mum'); A.ui.gameView = 'track';
    h = html();
    check('a parent sees no clock buttons', /data-act="(start|pause|endhalf|endgame)"/.test(h), false);
    A.click({ act: 'start' });
    check('and cannot start it by force', A.running(g()), false);
    as('trk');
    A.click({ act: 'endgame' });
    check('the tracker ends the game', !!g().ended, true);
    A.click({ act: 'reopengame' });
    check('— and cannot reopen it: that stays the coach\'s', !!g().ended, true);
    as('jaz');
    A.click({ act: 'reopengame' });
    check('the coach reopens it', !!g().ended, false);
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
    as('hal');
    check('the helper\'s card carries the same calls', /for Mia \(8\)/.test(card()) && /Tell the bench/.test(card()), true);
    as('trk');
    check('the tracker has no card', card(), '');

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
    as('hal');
    A.click({ act: 'bench', start: '600' });
    check('the helper can (build 175)', /Tell the bench/.test(sheet()) && /Jo \(9\)/.test(sheet()), true);
    A.click({ act: 'benchcopy' });
    check('— and copies it', copied && copied.split('\n')[0], 'Subs at 10:00 of the 1st half — v Riverside');
    copied = null;
    A.dom.node('#sheet').innerHTML = '';

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
    check('the helper\'s Lineup shows the card, names and all (build 175)', /id="subsdue"/.test(h) && /Sam/.test(h), true);
    as('trk'); A.ui.gameView = 'track'; h = html();
    check('Track shows no card: the tracker is on the ball', /id="subsdue"/.test(h), false);
    // the role card is Home's alone since build 148 (UX-REVIEW-2.md, 7.3): a tracker's Home is her team's Season
    A.ui.view = 'season';
    check('the tracker\'s role card, on Season, says the ball and the clock, not the subs', /log what happens and run the clock/.test(html()) && !/planned subs/.test(html()), true);
    A.ui.view = 'game';
    as('jaz'); A.ui.gameView = 'track';
    check('the coach\'s Track has no card either', /id="subsdue"/.test(html()), false);
    A.ui.gameView = 'subs';
    h = html();
    check('the Subs tab shows it to the coach', /id="subsdue"/.test(h) && /Sam/.test(h), true);
    A.ui.gameView = 'plan';
    check('the Plan tab draws locked', /Plan locked in/.test(html()), true);
    A.click({ act: 'subsgo', start: '0' });
    startHalf(g, 1);
    H.clock.advance(10.5 * MIN);
    check('and mid-game says the same thing is due as Subs', /Subs due now/.test(html()), true);
    as('hal');
    check('— and the helper\'s Lineup', /Subs due now/.test(html()), true);
    A.click({ act: 'subsgo', start: '600' });
    check('her tap makes the sub', on(g), ['p1', 'p3', 'p4', 'p5']);
    A.click({ act: 'subsundo', key: 's600' });
    check('and takes it back', on(g), ['p1', 'p2', 'p3', 'p5']);
    as('jaz'); A.ui.gameView = 'plan';
    g().plan.blocks = [{ start: 0, ids: ['p5', 'p1', 'p2', 'p3'] }];   // the auto planner with no shape
    g().formation = null; g().periods = {}; g().stints = {}; g().positions = {}; delete g().planDone;
    A.click({ act: 'subsgo', start: '0' });
    check('a plan with no spots still puts the players on', on(g), ['p1', 'p2', 'p3', 'p5']);
    check('each somewhere on the pitch', A.fieldIds(g()).every(p => g().positions[p] && g().positions[p].x != null), true);
  }

  console.log('\n--- a lineup put on and changed before kick-off is not a sub ---');
  {
    const g = setup();
    delete g().plan.locked;
    as('jaz'); A.ui.gameView = 'plan';
    A.ui.snapAt = 0;
    /* Build 180 (the owner, 2026-10-20): before kick-off the snapshot has no
       button onto the pitch at all. Locking in is the step, and Lock in leads
       the screen; the starters go on from the card's one button. */
    let h = html();
    check('before kick-off the snapshot offers no way onto the pitch: lock in is the step, said first', /data-act="applyblock"/.test(h) + ' ' + /Use as the starting lineup/.test(h) + ' ' + (h.indexOf('class="card lockask"') < h.indexOf('<h2>Lineup</h2>')) + ' ' + /At kick-off, Subs puts the starters on with one tap/.test(h), 'false false true true');
    check('— and the Lineup card says where the starters go on from', /Lock the plan in and the starters go on from the Subs card at kick-off/.test(h), true);
    A.click({ act: 'applyblock', start: '0' });
    A.click({ act: 'applyblock', start: '600' });         // then the 10:00 lineup, still at 0:00
    check('the second lineup is the one on', on(g), ['p1', 'p3', 'p4', 'p5']);
    check('Mia was never on, so she has no spell at all', A.stintsOf(g(), 'p2').length, 0);
    check('and the match log has no subs in it', A.subEvents(g()).length, 0);
    A.click({ act: 'applyblock', start: '0' });
    check('back again: still none', A.subEvents(g()).length + ':' + A.stintsOf(g(), 'p4').length, '0:0');
  }

  console.log('\n--- Subs leads with the subbing: no clock controls, the clock in the header, one row of goals, the other side in a sheet (build 175) ---');
  {
    /* The owner, 2026-10-18: Subs is the subbing page and Track runs the clock,
       so Subs has no clock controls at all; the one clock is the header's, top
       right on every game screen, saying Not started or counting down to
       kick-off before it runs. Measured before on the rig's live club with
       eleven on: the clock card was 238px, the bench began 1,650px down a
       2,269px screen. */
    const sheet = () => String(A.dom.node('#sheet').innerHTML || '');
    const sheetOpen = () => !A.dom.node('#sheet').hidden;
    const g = setup();
    g().plan = null;
    as('jaz'); A.ui.gameView = 'subs';
    let h = html();
    check('Subs has no clock card and no clock button of any kind', /clockwrap|clockstrip|data-act="(start|pause|endhalf|endgame|fixclock)"/.test(h), false);
    /* The owner, 2026-10-18, later the same day: the Goal taps off Subs too.
       The score is in the header and a goal is Track's to log; Subs is the
       subbing page and nothing else. */
    check('Subs has no Goal tap and no score card: the score is in the header, a goal is logged on Track', (h.match(/data-act="goal"/g) || []).length + ' ' + /scorecard|goalrow/.test(h), '0 false');
    check('with no plan, the coach is told where the subs heads-up will come from', /id="subsdue"/.test(h) && /Plan the game on Lineup and lock it in/.test(h) && /data-act="opengview" data-v="plan">Open Lineup</.test(h), true);
    A.ui.gameView = 'pitch'; h = html();
    check('the pitch, a look at Subs, has no clock controls either', /clockwrap|clockstrip|data-act="(start|pause|endhalf)"/.test(h), false);
    check('— and the same heads-up', /id="subsdue"/.test(h), true);
    A.ui.gameView = 'track'; h = html();
    check('Track keeps the whole clock card', /class="clockwrap"/.test(h) && /data-act="start"/.test(h) && /data-act="fixclock"/.test(h), true);
    check('— and the score card with its two Goal taps', /class="card scorecard"/.test(h) && (h.match(/data-act="goal"/g) || []).length === 2, true);

    // the header's clock, on every screen of the game
    const T = () => String(A.dom.node('#titlebar').innerHTML || '');
    A.ui.gameView = 'subs'; html();
    check('the header says Not started before kick-off', /class="ghclock" data-live="ghead"[^>]*><small>Not started<\/small><\/span>/.test(T()), true);
    g().kickoff = '10:30';
    H.clock.set(A.slotAt('2026-09-12', '10:30') - 20 * MIN); html();
    check('— and counts the last hour down to kick-off', /<small>Kick-off in<\/small> 20:00</.test(T()), true);
    check('— the reading tickLive() draws every second', A.headClock(g(), A.slotAt('2026-09-12', '10:30') - 65000), '<small>Kick-off in</small> 1:05');
    H.clock.set(A.slotAt('2026-09-12', '10:30') - 2 * 3600e3); html();
    check('— two hours out it says Not started: the line under the names has the time', /<small>Not started<\/small>/.test(T()), true);
    H.clock.set(T0);
    as('trk'); A.ui.gameView = 'track'; A.click({ act: 'start' }); H.clock.advance(5 * MIN);
    as('jaz'); A.ui.gameView = 'subs'; html();
    check('being played, the same pill ticks on the coach\'s Subs', /class="ghclock" data-live="ghead" data-mid="g1">5:00</.test(T()), true);
    A.ui.gameView = 'stats'; html();
    check('and on Stats', /data-live="ghead" data-mid="g1">5:00</.test(T()), true);
    A.ui.gameView = 'subs';
    as('trk'); A.ui.gameView = 'track'; A.click({ act: 'pause' }); as('jaz'); A.ui.gameView = 'subs';
    g().currentHalf = 1; g().periods = {};   // back to before kick-off, for the subs below

    /* The sub sheet: the other side, one tap away, and the one way to pair two
       players (the owner, 2026-10-18: no picking one on the page and then
       another; the sheet of names, or nothing). Each row in it carries both
       ids, so the second tap is the sub wherever the sheet was dismissed from,
       and dismissing it leaves nothing picked: no pick bar, no half-made sub. */
    // the mock pitch alone: up to the first button under it (Put on, or Move her) or the list
    const mock = () => { const h = sheet(), i = h.indexOf('<p class="muted mockcap">What the pitch will look like</p>'); if (i < 0) return ''; const ends = [h.indexOf('<button class="btn', i), h.indexOf('<div class="plist">', i)].filter(x => x > -1); return h.slice(i, Math.min(...ends)); };
    for (const pid of ['p5', 'p1', 'p2', 'p3']) A.click({ act: 'puton', pid });
    check('four on, 4v4', on(g), ['p1', 'p2', 'p3', 'p5']);
    A.click({ act: 'taplive', pid: 'p1' });
    check('a tap on a player on the pitch opens who could take her place', sheetOpen() && /Ella coming off/.test(sheet()) && /Tap who takes her place/.test(sheet()), true);
    check('— the bench and nobody on the pitch', /data-pid="p4"/.test(sheet()) && /data-pid="p6"/.test(sheet()) && !/data-pid="p2"/.test(sheet()), true);
    check('— the same rows, with no spot chip to move her by', /class="liverow"/.test(sheet()) && !/lrspot/.test(sheet()), true);
    check('— each row carrying whom it pairs with', /data-act="taplive" data-pid="p4" data-with="p1"/.test(sheet()), true);
    check('— and no mock pitch on the list look', mock(), '');
    check('nothing is picked on the page behind it: no pick bar', /pickbar|data-picked/.test(html()), false);
    A.click({ act: 'taplive', pid: 'p4', with: 'p1' });
    check('the second tap makes the sub', on(g), ['p2', 'p3', 'p4', 'p5']);
    check('— and closes the sheet', sheetOpen(), false);
    A.click({ act: 'taplive', pid: 'p1' });
    check('a tap on the bench with no room opens who she could replace', sheetOpen() && /Ella going on/.test(sheet()) && /Tap who she replaces/.test(sheet()), true);
    check('— the pitch, each with her spot in words, and nobody on the bench', /data-pid="p5"/.test(sheet()) && /GK · /.test(sheet()) && !/data-pid="p6"/.test(sheet()), true);
    check('— and no Put on while there is no room', /data-act="puton"/.test(sheet()), false);
    A.click({ act: 'taplive', pid: 'p2', with: 'p1' });
    check('and the second tap makes that sub too', on(g), ['p1', 'p3', 'p4', 'p5']);
    A.click({ act: 'taplive', pid: 'p3' });
    A.closeSheet();
    check('dismissing the sheet leaves nothing picked and no pick bar: the sheet was the whole of it', /pickbar|coming off/.test(html()), false);
    A.click({ act: 'taplive', pid: 'p6' });
    A.click({ act: 'taplive', pid: 'p2' });
    check('a tap on a name on the page is never the second tap: it opens her own sheet', sheetOpen() + ' ' + /Mia going on/.test(sheet()) + ' ' + on(g).join(), 'true true p1,p3,p4,p5');
    A.click({ act: 'clearpick' });
    check('Cancel closes the sheet', sheetOpen(), false);
    A.click({ act: 'taplive', pid: 'p1', with: 'p3' });
    check('a stale pair (both on the same side by the time of the tap) opens her sheet again instead of a sub', sheetOpen() + ' ' + /Ella coming off/.test(sheet()) + ' ' + on(g).join(), 'true true p1,p3,p4,p5');
    A.closeSheet();
    g().onFieldCount = 5;
    A.click({ act: 'taplive', pid: 'p2' });
    check('with room on the pitch a bench tap opens the sheet with Put on above who she could replace', sheetOpen() && /Put her on, or tap who she replaces/.test(sheet()) && /data-act="puton" data-pid="p2"/.test(sheet()) && /data-pid="p5" data-with="p2"/.test(sheet()), true);
    A.click({ act: 'puton', pid: 'p2' });
    check('— Put on puts her on and closes the sheet', on(g).join() + ' ' + sheetOpen(), 'p1,p2,p3,p4,p5 false');
    A.takeOffField(g(), 'p2'); g().onFieldCount = 4;

    // several at once: the same sheet stages instead
    A.click({ act: 'startplan' });
    A.click({ act: 'taplive', pid: 'p3' });
    check('staging, the sheet says nothing happens yet', sheetOpen() && /Nothing happens until you send the batch/.test(sheet()), true);
    A.click({ act: 'taplive', pid: 'p6', with: 'p3' });
    check('the second tap stages the pair and closes the sheet', A.ui.plan.items.length + ' ' + sheetOpen() + ' ' + on(g).join(), '1 false p1,p3,p4,p5');
    A.click({ act: 'taplive', pid: 'p1' });
    check('whoever is in the batch is left out of the next sheet', /data-pid="p2"/.test(sheet()) && !/data-pid="p6"/.test(sheet()), true);
    A.click({ act: 'clearpick' }); A.click({ act: 'cancelplan' });

    as('trk');
    A.click({ act: 'taplive', pid: 'p2' });
    check('a tracker gets no sub sheet', sheetOpen(), false);

    /* The Pitch look acts as the list does (the owner, 2026-10-18): a token
       or a bench row opens the same sheet, which leads with a mock of what
       the pitch will look like. */
    as('jaz'); A.ui.gameView = 'pitch'; h = html();
    check('the pitch look: every bench row is the same tap as the list\'s', /data-act="tap"/.test(h) + ' ' + (h.match(/class="prow" type="button" data-act="taplive"/g) || []).length, 'false 6');
    check('— nothing picked on it, and the hint says what a tap does', /data-picked/.test(h) + ' ' + /Tap a player to sub/.test(h), 'false true');
    /* Build 178 (the owner, 2026-10-20): the pitch on Subs does not move
       anyone. A token is a button that is the first tap of a sub, the same
       as her row in the list, never a handle; the hint says nothing about
       dragging, the pitch carries no id for a drag to hang off, and the only
       drag left in the app is the shape editor's. A spot is changed from the
       sheet, which writes a slot. */
    check('— every token on the pitch is the same tap, a button and never a handle', (h.match(/<button type="button" class="token" data-act="taplive" data-pid="p[1345]" data-owed="[01]" style="left:[\d.]+%;top:[\d.]+%">/g) || []).length + ' ' + /<div class="token"/.test(h) + ' ' + /id="pitch"/.test(h), '4 false false');
    check('— and nothing on it says drag', /[Dd]rag/.test(h), false);
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'app.js'), 'utf8');
    {
      const calls = (src.match(/\bdraggable\(/g) || []).length - 1;   // the definition itself
      check('— the shape editor is the one place that drags: no wireDrag, one draggable() call', /function wireDrag\b/.test(src) + ' ' + calls + ' ' + /\bpositions\/\$\{pid\}`, \{ \.\.\./.test(src), 'false 1 false');
    }
    /* Build 179 (the owner, 2026-10-20): even the shape editor's spot pans
       with the page until it has been held. A finger that lands on a spot and
       moves is a scroll (the browser takes it, pointercancel), never a drag
       and never a tap; one that stays HOLD_MS lifts the spot and is then a
       drag wherever it goes, with the page held still; a quick tap renames;
       a mouse drags at once. Driven on a fake spot that records its
       listeners, since the rig's elements swallow addEventListener. */
    {
      const css = require('fs').readFileSync(require('path').join(__dirname, '..', 'styles.css'), 'utf8');
      const slot = css.slice(css.indexOf('.slotok{'), css.indexOf('}', css.indexOf('.slotok{')));
      check('a formation spot lets the page pan: touch-action pan-y, no touch-action:none left in the file', /touch-action:pan-y/.test(slot) + ' ' + /touch-action:none\b/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')), 'true false');
      const fake = () => {
        const ls = {}, el = {
          style: {}, captured: 0, classes: new Set(),
          addEventListener(t, fn) { (ls[t] = ls[t] || []).push(fn); },
          removeEventListener(t, fn) { ls[t] = (ls[t] || []).filter(f => f !== fn); },
          setPointerCapture() { el.captured++; },
          fire(t, ev) { for (const f of [...(ls[t] || [])]) f({ pointerId: 1, pointerType: 'touch', preventDefault() { ev.prevented = true; }, ...ev }); return ev; },
          has: t => (ls[t] || []).length
        };
        el.classList = { add: c => el.classes.add(c), remove: c => el.classes.delete(c) };
        return el;
      };
      const pitch = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 400 }) };
      const run = () => {
        const el = fake(), got = { drops: [], taps: 0 };
        A.draggable(pitch, el, p => got.drops.push(p), () => got.taps++);
        return { el, got };
      };
      const pend = () => [...A.timers.pending.values()].filter(t => t.ms === A.HOLD_MS);
      const hold = () => { for (const t of pend()) t.fn(); A.timers.pending.clear(); };
      let { el, got } = run();
      check('— a finger on a spot takes nothing: no capture, a hold timer armed', (el.fire('pointerdown', { clientX: 50, clientY: 100 }), el.captured + ' ' + pend().length + ' ' + A.ui.dragging), '0 1 false');
      el.fire('pointermove', { clientX: 50, clientY: 140 });
      check('— moved before the hold is a scroll: the hold is off, the spot stays, the page is not held', pend().length + ' ' + el.style.left + ' ' + el.fire('touchmove', {}).prevented, '0 undefined undefined');
      el.fire('pointercancel', {}); el.fire('pointerup', { clientX: 50, clientY: 140 });
      check('— and neither a drop nor a tap', got.drops.length + ' ' + got.taps + ' ' + el.has('pointermove'), '0 0 0');
      A.timers.pending.clear();
      ({ el, got } = run());
      el.fire('pointerdown', { clientX: 50, clientY: 100 }); hold();
      check('a finger that stays put lifts the spot: captured, marked, the page held still', el.captured + ' ' + el.classes.has('dragging') + ' ' + A.ui.dragging + ' ' + el.fire('touchmove', {}).prevented, '1 true true true');
      el.fire('pointermove', { clientX: 100, clientY: 300 });
      check('— and follows the finger wherever it goes', el.style.left + ' ' + el.style.top, '50% 75%');
      el.fire('pointerup', { clientX: 100, clientY: 300 });
      check('— let go, it is dropped there and the page is hers again', JSON.stringify(got.drops) + ' ' + got.taps + ' ' + A.ui.dragging + ' ' + el.classes.has('dragging') + ' ' + el.fire('touchmove', {}).prevented, '[{"x":50,"y":75}] 0 false false undefined');
      ({ el, got } = run());
      el.fire('pointerdown', { clientX: 50, clientY: 100 }); el.fire('pointerup', { clientX: 51, clientY: 100 });
      check('a quick tap is a tap: rename, nothing dropped, the hold forgotten', got.taps + ' ' + got.drops.length + ' ' + pend().length, '1 0 0');
      ({ el, got } = run());
      el.fire('pointerdown', { clientX: 50, clientY: 100 }); hold(); el.fire('pointerup', { clientX: 50, clientY: 100 });
      check('— held and let go without moving is a tap too', got.taps + ' ' + got.drops.length + ' ' + A.ui.dragging, '1 0 false');
      ({ el, got } = run());
      el.fire('pointerdown', { clientX: 50, clientY: 100, pointerType: 'mouse' });
      check('a mouse has no page to scroll with a finger: it drags at once', el.captured + ' ' + pend().length, '1 0');
      el.fire('pointermove', { clientX: 150, clientY: 100, pointerType: 'mouse' }); el.fire('pointerup', { clientX: 150, clientY: 100, pointerType: 'mouse' });
      check('— and drops where it let go', JSON.stringify(got.drops), '[{"x":75,"y":25}]');
      check('the shape editor says hold, not drag', /Hold a spot to move it/.test(src) + ' ' + /Drag a spot/.test(src), 'true false');
      /* And none of it reaches Subs: the drag is wired by render() for the
         shape editor's screen alone, wireFormationDrag() refuses any other,
         and the game's pitch (every look, and the sheet's mock) carries no
         spot a drag could hang off. */
      check('the drag is wired for the shape editor alone, and refuses any other screen', (src.match(/wireFormationDrag\(\)/g) || []).length + ' ' + /if \(v === 'formation'\) wireFormationDrag\(\);/.test(src) + ' ' + /function wireFormationDrag\(\) \{[^}]*if \(ui\.view !== 'formation'\) return;/.test(src), '2 true true');   // the definition and the one call
      A.ui.view = 'game'; A.ui.gameView = 'pitch'; A.render();
      const subsH = A.rendered();
      check('— the Subs pitch has no spot to drag, no editor pitch, and tokens that are buttons', /slotok|fpitch/.test(subsH) + ' ' + /<div class="token"/.test(subsH) + ' ' + (subsH.match(/<button type="button" class="token"/g) || []).length, 'false false 4');
      A.click({ act: 'taplive', pid: 'p1' });
      check('— nor does the sub sheet\'s mock pitch', /slotok|fpitch|[Dd]rag|[Hh]old a spot/.test(sheet()), false);
      A.closeSheet();
    }
    A.click({ act: 'taplive', pid: 'p1' });
    check('a tap on a player on the pitch opens the same sheet', sheetOpen() && /Ella coming off/.test(sheet()) && /data-pid="p6" data-with="p1"/.test(sheet()), true);
    check('— led by the mock pitch, captioned', /^<p class="muted mockcap">What the pitch will look like<\/p>\s*<div class="pitch mockpitch">/.test(mock()) && sheet().indexOf('mockpitch') < sheet().indexOf('class="liverow"'), true);
    check('— her spot a dashed ? waiting for whoever is tapped, the rest as they stand', /<div class="token" data-pid="p1" data-mock="out" style="left:[\d.]+%;top:[\d.]+%"><span class="role">RB<\/span><span class="num">\?<\/span>\s*<span class="nm">for Ella<\/span>/.test(mock()) && /<div class="token" data-pid="p5" style=/.test(mock()) && !/<button/.test(mock()), true);
    check('— with her spot\'s move offered, since a token has no spot chip', /data-act="switchpos" data-pid="p1"/.test(sheet()), true);
    A.click({ act: 'taplive', pid: 'p6', with: 'p1' });
    check('a bench name under it makes the sub', on(g).join() + ' ' + sheetOpen(), 'p3,p4,p5,p6 false');
    A.click({ act: 'taplive', pid: 'p1' });
    check('a bench player with no room: the sheet with the mock, every token a button that is her replacing that player', sheetOpen() && /Ella going on/.test(sheet()) && (mock().match(/<button type="button" class="token" data-act="taplive" data-pid="p\d" data-with="p1"/g) || []).length === 4 && !/data-mock/.test(mock()), true);
    A.click({ act: 'taplive', pid: 'p6', with: 'p1' });
    check('— a token tapped is the sub', on(g).join() + ' ' + sheetOpen(), 'p1,p3,p4,p5 false');
    A.takeOffField(g(), 'p4');   // room, and a free spot (LB)
    A.click({ act: 'taplive', pid: 'p4' });
    check('with room, the free spot is a dashed token carrying her number, a tap putting her there', /<button type="button" class="token" data-mock="in" data-act="fillslot" data-sid="sLB" data-pid="p4"[^>]*>\s*<span class="role">LB<\/span><span class="num">9<\/span><span class="nm">Jo<\/span>/.test(mock()) && /data-act="puton" data-pid="p4"/.test(sheet()), true);
    check('— the three on, each a button that is her replacing that player', (mock().match(/data-act="taplive" data-pid="p\d" data-with="p4"/g) || []).length, 3);
    A.click({ act: 'fillslot', sid: 'sLB', pid: 'p4' });
    check('— and it does', on(g).join() + ' ' + A.slotIdOf(g(), 'p4') + ' ' + sheetOpen(), 'p1,p3,p4,p5 sLB false');
    A.takeOffField(g(), 'p4');
    A.click({ act: 'fillslot', sid: 'sLB' });
    check('a free spot on the real pitch, with nobody to put there, only says so', A.toasts[A.toasts.length - 1] + ' ' + on(g).join(), 'Tap a player on the bench to put her here p1,p3,p5');
    A.click({ act: 'taplive', pid: 'p4' }); A.click({ act: 'puton', pid: 'p4' });
    as('trk'); A.ui.gameView = 'pitch';
    A.click({ act: 'taplive', pid: 'p2' });
    check('a tracker gets nothing on the pitch look either', sheetOpen(), false);
    as('jaz'); A.ui.gameView = 'subs';

    // the heads-up once there is a plan to lock in
    as('jaz'); A.ui.gameView = 'subs';
    g().plan = { manual: true, blocks: [blk(0, { sGK: 'p5', sLB: 'p1', sRB: 'p2', sST: 'p3' })] };
    h = html();
    check('a plan not locked in: the coach is told to lock it in, on Subs', /id="subsdue"/.test(h) && /Lock in your plan and this card counts down/.test(h) && /data-act="opengview" data-v="plan">Open the plan</.test(h), true);
  }

  console.log('\n--- subs made together are one line in the log, fixed with one tap (build 180) ---');
  {
    /* The owner, 2026-10-20: when executing the planned subs, the sub should
       show up on one line, so changing the time later is one tap instead of
       one per sub. */
    const g = setup();
    as('jaz'); A.ui.gameView = 'subs';
    A.click({ act: 'subsgo', start: '0' });
    startHalf(g, 1);
    H.clock.advance(11 * MIN);
    A.click({ act: 'subsgo', start: '600' });              // Jo on for Mia, alone
    H.clock.advance(27 * MIN);
    A.endHalf(g());
    A.click({ act: 'subsgo', start: '2400' });             // two at half-time, one tap
    const groups = A.subGroups(g());
    check('the two changes made together are one group, the one before its own', groups.map(x => x.rows.length), [2, 1]);
    let h = html();
    const line = (h.match(/<button type="button" data-act="fixsubs" data-is="([^"]+)">[^]*?<\/button>/) || [])[0] || '';
    check('Subs draws them as one line, naming both, with one fix', /<span class="t">38:00<\/span>/.test(line) && /<b>2 subs together<\/b>/.test(line) && /Mia on<\/span> for <span class="off">Ella off/.test(line) && /Lou on<\/span> for <span class="off">Rosa off/.test(line) && (h.match(/data-act="fixsubs"/g) || []).length === 1, true);
    check('— the single one stays a line of its own', /data-act="fixsub" data-i="\d+">\s*<span class="t">11:00<\/span>/.test(h), true);
    const is = (line.match(/data-is="([^"]+)"/) || [])[1];
    A.click({ act: 'fixsubs', is });
    const sheet = () => String(A.dom.node('#sheet').innerHTML || '');
    check('fix opens the two as one sheet, the time nudged once for both', /<h3>2 changes at 38:00<\/h3>/.test(sheet()) && /data-act="nudgesubs" data-sids="[^"]+" data-d="-60"/.test(sheet()) && /data-act="setsubstime"/.test(sheet()), true);
    check('— each with a way to fix it alone', (sheet().match(/data-act="fixsub" data-i="\d+"[^>]*>This one</g) || []).length, 2);
    const sids = (sheet().match(/data-sids="([^"]+)"/) || [])[1];
    A.click({ act: 'nudgesubs', sids, d: '-60' });
    check('a nudge moves every spell of both subs together', [A.openStint(g(), 'p2')[1].on, A.openStint(g(), 'p6')[1].on, A.stintsOf(g(), 'p1').find(([, s]) => s.off != null)[1].off, A.stintsOf(g(), 'p3').find(([, s]) => s.off != null)[1].off], [2220, 2220, 2220, 2220]);
    check('— the sheet stays open on them at the new time', /<h3>2 changes at 37:00<\/h3>/.test(sheet()), true);
    check('— and the one before is untouched', A.openStint(g(), 'p4')[1].on, 660);
    A.dom.node('#subT').value = '36:30';
    A.click({ act: 'setsubstime', sids });
    check('an exact time moves them all, and closes', [A.openStint(g(), 'p2')[1].on, A.openStint(g(), 'p6')[1].on, A.dom.node('#sheet').hidden], [2190, 2190, true]);
    check('Track\'s match log has the same one line', /data-act="fixsubs" data-id="\d+,\d+"[^>]*>\s*<span class="t">36:30<\/span><span><b>2 subs together<\/b>/.test(trackLog()), true);
    as('mum');
    A.click({ act: 'nudgesubs', sids, d: '60' });
    check('a parent\'s tap moves nothing', A.openStint(g(), 'p2')[1].on, 2190);
  }

  console.log('\n--- moving or swapping a player on the pitch look is a button, with a picture (build 180) ---');
  {
    /* The owner, 2026-10-20: swapping players in pitch mode should be easier
       to see and find than a little text link. */
    const g = setup();
    g().plan = null;
    as('jaz'); A.ui.gameView = 'pitch';
    const sheet = () => String(A.dom.node('#sheet').innerHTML || '');
    A.click({ act: 'subsgo', start: '0' });
    A.putOnField(g(), 'p5', 50, 92, 'sGK'); A.putOnField(g(), 'p1', 25, 70, 'sLB'); A.putOnField(g(), 'p2', 75, 70, 'sRB');
    startHalf(g, 1);
    H.clock.advance(5 * MIN);
    html();
    A.click({ act: 'taplive', pid: 'p1' });
    check('the sub sheet offers her move as a button, not a text link', /<button class="btn quiet wide" data-act="switchpos" data-pid="p1"[^>]*>Move her to another spot, or swap with a teammate</.test(sheet()) && !/class="textbtn"/.test(sheet()), true);
    check('— and the pitch\'s hint says a tap moves her too', /Tap a player to sub or move her/.test(html()), true);
    A.click({ act: 'switchpos', pid: 'p1' });
    check('the move sheet says what a tap does', /<h3>Move Ella to another spot<\/h3>/.test(sheet()) && /Tap a free spot, or a teammate to swap spots with her/.test(sheet()), true);
    check('— led by a picture: her token dashed, a teammate\'s a button that swaps them, the free spot a dashed token with her number', /<div class="token" data-pid="p1" data-mock="out"/.test(sheet()) && /<button type="button" class="token" data-act="doswitch" data-pid="p1" data-sid="sRB" aria-label="Swap with Mia"/.test(sheet()) && /<button type="button" class="token" data-mock="in" data-act="doswitch" data-pid="p1" data-sid="sST"[^>]*>\s*<span class="role">ST<\/span><span class="num">7<\/span>/.test(sheet()), true);
    A.click({ act: 'doswitch', pid: 'p1', sid: 'sRB' });
    check('a teammate\'s token swaps the two', A.slotIdOf(g(), 'p1') + ' ' + A.slotIdOf(g(), 'p2') + ' ' + A.dom.node('#sheet').hidden, 'sRB sLB true');
    A.click({ act: 'taplive', pid: 'p1' });
    A.ui.gameView = 'subs'; html();
    A.click({ act: 'taplive', pid: 'p1' });
    check('the list look offers the same button', /data-act="switchpos" data-pid="p1"[^>]*>Move her to another spot/.test(sheet()), true);
    A.closeSheet();
  }

  H.summary('planned subs at the sideline');
}
