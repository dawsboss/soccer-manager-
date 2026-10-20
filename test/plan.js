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
  /* who is coming has been looked at for this game, so Plan kick-off and Draft
     a plan go straight in; the section on that check clears it */
  A.ui.availOk = { g1: 1 }; A.ui.availThen = null;
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
  check('the tab leads with the lineup and offers kick-off (build 146: Lineup, not Snapshots)', /<h2[^>]*>Lineup<\/h2>/.test(h) && /Plan kick-off/.test(h) && h.indexOf('>Lineup<') < h.indexOf('data-act="planall"'), true);
  check('and still offers the draft', /Draft a plan/.test(h), true);
}

console.log('\n--- before the first player goes in, who is coming ---');
{
  const g = setup();
  A.ui.availOk = {};
  A.state.rsvp = { t1: { g_g1: { p1: { v: 'yes' }, p2: { v: 'no' }, p3: { v: 'maybe' } } } };
  const sheet = () => String(A.dom.node('#sheet').innerHTML);
  const open = () => !A.dom.node('#sheet').hidden;
  A.click({ act: 'snapstart' });
  check('Plan kick-off asks who is coming instead of starting the plan', open() && /Who is coming to Riverside\?/.test(sheet()), true);
  check('and nothing is written to the plan yet', A.planBlocks(g()).length, 0);
  check('it counts who is coming, out, maybe and not answered', /4 coming<\/b> · 1 out · 1 maybe · 2 not answered/.test(sheet()), true);
  check('and its button plans for that many, carrying on the same tap', /data-act="snapstart" data-checked="1">Plan for 4 players</.test(sheet()), true);
  A.click({ act: 'toggleout', pid: 'p4' });
  check('leaving one out keeps the check open and counts again', open() && /Plan for 3 players/.test(sheet()), true);
  check('— written as the coach\'s word on the game', g().out.p4, true);
  A.click({ act: 'snapstart', checked: '1' });
  check('carrying on closes the check and starts the plan', !/Who is coming/.test(sheet()) && A.planBlocks(g()).length === 1, true);
  check('— straight into who plays the first spot (build 180: Lineup edits through a sheet, as Subs does)', open() && /<h3>GK — nobody yet<\/h3>/.test(sheet()) && A.ui.snapSid === 'sGK', true);
  check('with the players left out not on the list to place', A.squad(A.team(), g()).map(p => p.id).sort().join(), 'p1,p3,p5');
  const conf = global.confirm; global.confirm = () => true;
  A.click({ act: 'snapwipe' });
  global.confirm = conf;
  A.click({ act: 'snapstart' });
  check('asked once per game on this phone: a fresh plan starts straight away', !/Who is coming/.test(sheet()) && A.planBlocks(g()).length === 1, true);

  const g2 = setup();
  A.ui.availOk = {};
  A.click({ act: 'makeplan' });
  check('Draft a plan asks first too', open() && /data-act="makeplan" data-checked="1"/.test(sheet()) && !g2().plan, true);
  A.click({ act: 'closesheet' });
  check('Not now leaves the plan empty', !open() && !g2().plan, true);
  A.click({ act: 'makeplan' });
  check('so the next tap asks again', open(), true);
  A.click({ act: 'makeplan', checked: '1' });
  check('and carrying on drafts it', !open() && A.planBlocks(g2()).length > 0, true);

  A.ui.availOk = {};
  A.click({ act: 'availability' });
  check('the Who is coming card\'s Change is the plain list, with no plan button', open() && !/data-checked/.test(sheet()), true);
  A.click({ act: 'closesheet' });

  const g3 = setup({ periods: { 0: { start: T0, end: null } }, currentHalf: 1 });
  A.ui.availOk = {};
  A.click({ act: 'snapstart' });
  check('once kicked off the plan is made from who turned up: nothing asked', !/Who is coming/.test(sheet()) && A.planBlocks(g3()).length === 1, true);
  A.state.rsvp = {};
}

console.log('\n--- a game with no shape has no positions to plan ---');
{
  setup({ formation: null });
  const h = html();
  check('it asks for a shape, in a line, with the detail behind an info button', /Pick a shape/.test(h) && /data-act="info" data-k="snapshots"/.test(h) && !/no shape, so there are no positions/.test(h), true);
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
  A.closeSheet(); A.ui.snapSid = null;
  A.click({ act: 'snapplayer', pid: 'p3', auto: '1' });
  check('a forward lands up front', A.planBlocks(g())[0].assign.sST, 'p3');
  A.click({ act: 'snapplayer', pid: 'p5', auto: '1' });
  check('the keeper lands in goal', A.planBlocks(g())[0].assign.sGK, 'p5');
  A.click({ act: 'snapplayer', pid: 'p5' });
  check('tapping a placed player picks her spot', A.ui.snapSid, 'sGK');
}

console.log('\n--- later snapshots: empty, time, delete ---');
{
  const g = setup();
  A.click({ act: 'snapstart' });
  for (const pid of ['p5', 'p1', 'p2', 'p3']) A.click({ act: 'snapplayer', pid });

  A.click({ act: 'snapadd' });
  check('a new change lands ten minutes on', A.planBlocks(g()).map(b => b.start), [0, 600]);
  check('with an empty pitch, not a copy', A.planBlocks(g())[1].assign, {});
  check('and is the one being edited', A.ui.snapAt, 600);
  check('so nobody is credited past it yet', A.planSeconds(g()).p1, 600);
  check('the players from before are listed first', /Not on<\/h3>\s*<div class="plist">[^]*?was /.test(html()), true);
  A.click({ act: 'snapplayer', pid: 'p1', auto: '1' });
  check('one from before goes back to her old spot', A.planBlocks(g())[1].assign, { sLB: 'p1' });
  A.click({ act: 'snapfill' });
  check('and the rest fill from the one before in a tap', A.planBlocks(g())[1].assign, A.planBlocks(g())[0].assign);

  A.click({ act: 'snaptime', d: '600' });
  check('it can be moved later', A.planBlocks(g())[1].start, 1200);
  A.click({ act: 'snapadd' });
  A.click({ act: 'snapadd' });
  check('new changes stop at half-time, where subs usually happen', A.planBlocks(g()).map(b => b.start), [0, 1200, 1800, 2400]);
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
  A.click({ act: 'snapfill' });
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
  const by = A.planSeconds(g(), 2400);
  check('up to a mark counts only what is played before it', [by.p3, by.p4, by.p5], [2400, 0, 2400]);
  const row = pid => (h.match(new RegExp(`data-pid="${pid}"[^]*?</button>`)) || [''])[0].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
  check('at a change, a player shows what she has had by then and her game total', /40 by 40:00 ?40 in game/.test(row('p3')), true);
  check('and one coming on shows none yet, with her total', / 0 by 40:00 ?40 in game/.test(row('p4')), true);
  A.ui.snapAt = 0;
  check('kick-off shows just the total', /by 0:00|by 00:00/.test(html()), false);
}

console.log('\n--- blocks as the database hands them back ---');
{
  // a gap in an array comes back from Firebase as an object with numeric keys
  const g = setup({ plan: { manual: true, blocks: { 0: { start: 0, ids: ['p1'], assign: { sLB: 'p1' } }, 2: { start: 1200, assign: {} } } } });
  check('read as a sorted list', A.planBlocks(g()).map(b => b.start), [0, 1200]);
  check('the current block is found', A.planBlockAt(g(), 900).start, 0);
  check('the next one too', A.nextPlanBlock(g(), 900).start, 1200);
  check('a block with no ids is not a crash', A.planSeconds(g()).p1, 1200);
  check('and the tab draws', /<h2>Lineup<\/h2>/.test(html()), true);
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
  global.confirm = () => true;
  check('there is no redraft button once there is a plan', /data-act="makeplan"/.test(html()), false);
  A.click({ act: 'makeplan' });
  check('and a tap that reaches the handler changes nothing', JSON.stringify(g().plan), before);
  check('and says to clear first', /clear it first/.test(A.lastToast()), true);
  global.confirm = () => false;
  A.click({ act: 'snapwipe' });
  check('Clear plan asks first, and no keeps it', JSON.stringify(g().plan), before);
  global.confirm = () => true;
  A.click({ act: 'snapwipe' });
  check('yes clears every snapshot', A.planBlocks(g()).length, 0);
  check('and the draft button is back', /data-act="makeplan"/.test(html()), true);
  A.click({ act: 'makeplan' });
  check('an empty plan can be drafted', g().plan.manual, undefined);
  check('with a block every ten minutes', A.planBlocks(g()).length, 8);
}

console.log('\n--- Lineup edits through a sheet, as Subs does (build 180) ---');
{
  /* The owner, 2026-10-20: the Lineup page should let you do the same
     editing as the Subs page. A tap on a spot or a player opens a sheet led
     by a mock of the snapshot; the second tap, in it, makes the change.
     Nothing is picked on the page, and a dismissed sheet leaves nothing
     half done. */
  const g = setup();
  const sheet = () => String(A.dom.node('#sheet').innerHTML || '');
  const open = () => !A.dom.node('#sheet').hidden;
  const plist = () => sheet().slice(sheet().indexOf('class="plist"'));
  A.click({ act: 'snapstart' });
  check('Plan kick-off opens the first spot\'s sheet, led by a mock of the snapshot', open() && /<h3>GK — nobody yet<\/h3>/.test(sheet()) && /class="pitch mockpitch"/.test(sheet()) && sheet().indexOf('mockpitch') < sheet().indexOf('class="plist"'), true);
  check('— the spot asked about a dashed token, every other spot a button', /data-mock="out" data-sid="sGK"/.test(sheet()) && (sheet().match(/class="ghost" data-act="snapslot"/g) || []).length === 3, true);
  check('— and every player not on a row, the keeper first for GK', (plist().match(/data-act="snapplayer" data-pid="p\d"/g) || []).length === 5 && /^[^]*?data-act="snapplayer" data-pid="p5"/.test(plist()) && plist().indexOf('data-pid="p5"') < plist().indexOf('data-pid="p1"'), true);
  A.click({ act: 'snapplayer', pid: 'p5' });
  check('a name tapped in it fills the spot and the sheet moves on to the next empty one', A.planBlocks(g())[0].assign.sGK === 'p5' && open() && /<h3>LB — nobody yet<\/h3>/.test(sheet()), true);
  A.click({ act: 'snapcancel' });
  check('Cancel leaves nothing picked and nothing half done', !open() && A.ui.snapSid === null && A.planBlocks(g())[0].ids.length === 1, true);
  const h = html();
  check('nothing is picked on the page: tokens and rows are taps, and the hint says so', /data-picked/.test(h) + ' ' + /Tap a spot, or a player, to change who plays where/.test(h), 'false true');
  A.click({ act: 'snapplayer', pid: 'p3' });
  check('a player not on opens where she could go: Put on at her best spot above a mock', open() && /<h3>Rosa going on<\/h3>/.test(sheet()) && /data-act="snapplayer" data-pid="p3" data-auto="1"[^>]*>Put on at ST</.test(sheet()), true);
  check('— every free spot a dashed token carrying her number, the keeper a button she would take over from', (sheet().match(/data-mock="in" data-act="snapslot" data-sid="s[A-Z]+" data-pid="p3"/g) || []).length === 3 && /class="token" data-act="snapslot" data-sid="sGK" data-pid="p3"/.test(sheet()), true);
  A.click({ act: 'snapslot', sid: 'sLB', pid: 'p3' });
  check('a spot tapped on her sheet puts her there and closes it', A.planBlocks(g())[0].assign.sLB === 'p3' && !open() && A.ui.snapSid === null, true);
  A.click({ act: 'snapslot', sid: 'sLB' });
  check('a filled spot tapped: who plays it instead, or leave it empty', open() && /<h3>LB · Rosa<\/h3>/.test(sheet()) && /data-act="snapclear"[^>]*>Leave LB empty</.test(sheet()) && /data-mock="out" data-sid="sLB"/.test(sheet()), true);
  A.click({ act: 'snapslot', sid: 'sST' });
  check('another spot tapped on its sheet moves her there, and closes it', A.planBlocks(g())[0].assign.sST === 'p3' && !A.planBlocks(g())[0].assign.sLB && !open(), true);
  A.click({ act: 'snapslot', sid: 'sST' });
  A.click({ act: 'snapslot', sid: 'sGK' });
  check('a teammate\'s spot tapped swaps the two', [A.planBlocks(g())[0].assign.sGK, A.planBlocks(g())[0].assign.sST], ['p3', 'p5']);
  A.click({ act: 'snapplayer', pid: 'p5' });
  check('a placed player\'s row is her token: the sheet of who could take her spot', open() && /<h3>ST · Sam<\/h3>/.test(sheet()), true);
  A.click({ act: 'snapplayer', pid: 'p1' });
  check('— a name under it replaces her, and the sheet closes', A.planBlocks(g())[0].assign.sST === 'p1' && !A.planBlocks(g())[0].ids.includes('p5') && !open(), true);
  A.click({ act: 'snapslot', sid: 'sRB' });
  A.closeSheet();
  A.click({ act: 'snapslot', sid: 'sGK' });
  check('a sheet closed by Back leaves nothing picked: the next spot tapped opens its own sheet, swapping nothing', open() && /<h3>GK · Rosa<\/h3>/.test(sheet()) && A.planBlocks(g())[0].assign.sGK === 'p3' && !A.planBlocks(g())[0].assign.sRB, true);
  A.click({ act: 'snapcancel' });
  check('still coherent', coherent(g()), true);
}

console.log('\n--- a plan copied from another game ---');
{
  /* The owner, 2026-10-20: it should be easy to take a plan from a previous
     game and apply it to a new one. */
  const sheet = () => String(A.dom.node('#sheet').innerHTML || '');
  const open = () => !A.dom.node('#sheet').hidden;
  const other = () => ({
    id: 'g0', teamId: 't1', opponent: 'Lakeside', date: '2026-09-05', periodCount: 2, periodMinutes: 40, onFieldCount: 4, currentHalf: 2,
    periods: {}, stints: {}, positions: {}, ended: T0 - 7 * 86400000,
    formation: { name: '1-2-1', size: 4, slots: SLOTS.map(s => ({ ...s })) },
    plan: {
      manual: true, locked: { at: T0 - 8 * 86400000, by: 'x', byName: 'X' },
      blocks: [
        { start: 0, ids: ['p5', 'p1', 'p2', 'p3'], assign: { sGK: 'p5', sLB: 'p1', sRB: 'p2', sST: 'p3' } },
        { start: 2400, ids: ['p5', 'p4', 'p2', 'p3'], assign: { sGK: 'p5', sLB: 'p4', sRB: 'p2', sST: 'p3' } }
      ]
    },
    planDone: { s0: { t: 0, at: 1 } }
  });
  const g = setup();
  A.state.matches.g0 = other();
  let h = html();
  check('an empty plan offers the plan of another game', /data-act="copyplan"[^>]*>Copy the plan from another game</.test(h), true);
  A.click({ act: 'copyplan' });
  check('the sheet lists this team\'s other games with a plan, with the game and its shape', open() && /data-act="copyplanfrom" data-id="g0"/.test(sheet()) && /v Lakeside/.test(sheet()) && /1-2-1/.test(sheet()) && /2 snapshots/.test(sheet()) && !/data-id="g1"/.test(sheet()), true);
  A.state.matches.g1.out = { p2: true };   // Mia is out for this one
  A.click({ act: 'copyplanfrom', id: 'g0' });
  check('copied: the snapshots and their times', A.planBlocks(g()).map(b => b.start), [0, 2400]);
  check('— with the player who is out left out of every one, her spot empty to fill', A.planBlocks(g())[0].assign, { sGK: 'p5', sLB: 'p1', sST: 'p3' });
  check('— ids agree with the spots', coherent(g()), true);
  check('— this game\'s own: not locked, nothing done, and said', !g().plan.locked && !g().planDone && !open() && A.lastToast(), 'Plan copied from v Lakeside — Mia left out');
  check('— the other game keeps its plan whole', A.planBlocks(A.state.matches.g0)[0].ids.length + ' ' + !!A.state.matches.g0.plan.locked, '4 true');
  check('and the offer is gone once there is a plan', /data-act="copyplan"/.test(html()), false);
  A.planBlocks(g())[0].assign.sRB = 'p4';
  A.click({ act: 'copyplanfrom', id: 'g0' });
  check('a tap that reaches the handler never writes over a plan', A.planBlocks(g())[0].assign.sRB + ' ' + /clear it first/.test(A.lastToast()), 'p4 true');

  const g2 = setup({ formation: null });
  A.state.matches.g0 = other();
  check('a game with no shape offers it too', /data-act="copyplan"/.test(html()), true);
  A.click({ act: 'copyplanfrom', id: 'g0' });
  check('— and takes the plan\'s shape with it', g2().formation && g2().formation.name === '1-2-1' && A.planBlocks(g2()).length === 2 && /with its shape/.test(A.lastToast()), true);
  check('— as a copy of its own', g2().formation !== A.state.matches.g0.formation, true);

  const g3 = setup({ periodMinutes: 15 });
  A.state.matches.g0 = other();
  A.click({ act: 'copyplanfrom', id: 'g0' });
  check('a shorter game drops what falls past its end', A.planBlocks(g3()).map(b => b.start), [0]);

  const g4 = setup();
  A.state.matches.g0 = other();
  A.ui.availOk = {};
  A.click({ act: 'copyplanfrom', id: 'g0' });
  check('before anyone goes into an empty plan, who is coming is asked, carrying the game on its button', open() && /Who is coming/.test(sheet()) && /data-act="copyplanfrom" data-id="g0" data-checked="1"/.test(sheet()) && !A.planBlocks(g4()).length, true);
  A.click({ act: 'copyplanfrom', id: 'g0', checked: '1' });
  check('— and carrying on copies it', A.planBlocks(g4()).length, 2);

  const g5 = setup();
  A.state.matches.g0 = { ...other(), formation: null, plan: { blocks: [{ start: 0, ids: ['p5', 'p1', 'p2', 'p3'] }, { start: 2400, ids: ['p5', 'p4', 'p2', 'p3'] }] } };
  A.click({ act: 'copyplanfrom', id: 'g0' });
  check('a plan drafted with no shape comes over as who, not where', A.planBlocks(g5()).map(b => (b.ids || []).join()), ['p5,p1,p2,p3', 'p5,p4,p2,p3']);
}

H.summary('the Plan tab\'s snapshots');
