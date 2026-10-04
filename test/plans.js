/* Practice plans: who makes them, what the builder does, run mode, and how a
   plan gets to the club and back without ever being replaced wholesale.

   TRAINING.md is the design. The parts that are easy to get quietly wrong, and
   so are pinned here:

   - The plan is that team's coaches' and the club's admins'. A coach browsing
     another team's library reads its drills and never touches its plans, and
     a parent's phone never even asks the database for one.
   - A plan hangs off its calendar practice and takes day, time, place and
     length from it. When and where is the calendar's, which the whole team
     reads, so parents get it without the plan and nothing is copied to the
     old schedule node any more. A plan made before that is moved onto an
     entry under its own id, once, and a plan whose entry was deleted is
     kept, not deleted with it.
   - Merge, never replace (CLAUDE.md's invariant for the workspace, which the
     workspace itself still breaks: test/sync.js pins that gap). A plan made
     offline survives the club's answer, and is sent again after a reload.
   - The coach index: derived, written by an admin's device for everyone and
     by a coach's own device for herself, and never by anyone else. */

const H = require('./harness');
const { check, deepEq } = H;
const { makeFakebase } = require('./fakebase');
const L = require('../drills.js');

const CONFIG = { apiKey: 'k', databaseURL: 'https://prod.example', projectId: 'p' };
const CODE = 'CLUB';
const WS = 'workspaces/' + CODE;
const TR = 'training/' + CODE + '/';

/* Twelve players, one marked as a keeper, born 2016: U11 on the harness clock
   (12 September 2026). */
const squad = () => Object.fromEntries(Array.from({ length: 12 }, (_, i) => {
  const id = 'p' + i;
  return [id, { id, name: 'Player ' + i, number: String(i + 1), active: true, ...(i === 0 ? { gk: true } : {}), ...(i === 1 ? { guardians: { mum: true } } : {}) }];
}));
const club = () => ({
  teams: {
    t1: { id: 't1', name: 'G11 Flight', birthYear: 2016, players: squad() },
    t2: { id: 't2', name: 'G13 Storm', birthYear: 2014, players: {} }
  },
  matches: {},
  access: {
    admins: { boss: true },
    index: { boss: true, jaz: true, trk: true, mum: true, other: true },
    members: { boss: { name: 'Ada' }, jaz: { name: 'Jaz' } },
    teams: { t1: { coaches: { jaz: true }, trackers: { trk: true } }, t2: { coaches: { other: true } } }
  }
});

const sheet = A => String(A.dom.node('#sheet').innerHTML || '');
function fill(A, v) { for (const [k, x] of Object.entries(v)) A.dom.node('#' + k).value = x; }

/* ---------- part one: the screens, on a device with no database ---------- */

/* A config, so the club is gated, and a database that never answers, the way
   a phone at the field has one: no workspace code yet means nothing is sent. */
const A = H.loadApp({ config: CONFIG, firebase: makeFakebase() });
function as(uid, tid = 't1') {
  A.state = club();
  A.train = { practices: {}, dirty: {}, drills: {}, drillDirty: {}, tpls: {}, tplDirty: {} };
  A.me = uid ? { uid, name: uid } : null;
  A.appOwners = {};
  A.ui.teamId = tid; A.ui.view = 'practice';
  A.ui.practice = { tab: 'plans' };
  A.toasts.length = 0;
}
/* A practice is added on the calendar, from the Practice tab's Add, which
   makes its plan and opens it; what it's for is the plan's own, set after. */
function plan(extra = {}, X = A) {
  const v = { prDate: '2026-09-15', prStart: '17:30', prLen: '60', prPlace: 'Lakeside Park', prFocus: '', ...extra };
  X.click({ act: 'pracnew', tid: 't1' });
  for (const [k, x] of Object.entries({ evTitle: '', evDate: v.prDate, evStart: v.prStart, evEnd: v.prStart ? X.addMins(v.prStart, Number(v.prLen)) : '', evVenue: v.prPlace, evNotes: '' })) X.dom.node('#' + k).value = x;
  X.click({ act: 'calsave', tid: 't1' });
  const id = X.ui.practice.open;
  if (v.prFocus) { X.click({ act: 'pracedit', id }); X.dom.node('#prFocus').value = v.prFocus; X.click({ act: 'pracsave', id }); }
  return X.practiceById('t1', id);
}

(async () => {

  console.log('--- who plans ---');
  {
    as('jaz');
    A.render();
    check('the coach lands on Plans', A.ui.practice.tab, 'plans');
    check('with a way to plan one', /data-act="pracnew"/.test(A.rendered()), true);
    check('a coach can plan for her team', A.canPlan('t1'), true);
    check('an admin for any team', (as('boss'), A.canPlan('t2')), true);

    as('other', 't1'); A.render();
    check('another team\'s coach cannot plan for this one', A.canPlan('t1'), false);
    check('and is told whose plans these are', /Plans are for this team's coaches/.test(A.rendered()), true);
    A.click({ act: 'pracnew' });
    check('a tap that gets through is refused', A.lastToast(), 'Only this team\'s coaches plan its practices');

    for (const who of ['mum', 'trk']) {
      as(who); A.dom.node('#sheet').innerHTML = '';
      A.click({ act: 'pracnew' });
      check(who + ': refused before anything opens', A.lastToast(), 'Practice is for coaches and admins');
      check(who + ': no planning sheet', /Plan a practice/.test(sheet(A)), false);
    }
    check('every plan action is behind the practice check', [...A.PLAN_ACTS].every(x => A.PRACTICE_ACTS.has(x)), true);
  }

  console.log('\n--- planning one ---');
  {
    as('jaz');
    A.render();
    check('the Add here is the calendar\'s Add', /<button class="btn sm" data-act="pracnew" data-tid="t1">Add a practice<\/button>/.test(A.rendered()), true);
    A.click({ act: 'pracnew' });
    const fromPlans = sheet(A);
    A.click({ act: 'calnew', tid: 't1' });
    check('and opens the very same sheet', fromPlans, sheet(A));
    check('set to a practice', /data-act="calkind" data-v="practice" aria-pressed="true"/.test(fromPlans), true);
    fill(A, { evTitle: '', evDate: 'next tuesday', evStart: '', evEnd: '', evVenue: '', evNotes: '' });
    A.click({ act: 'calsave', tid: 't1' });
    check('a date that is not a date is refused', A.lastToast(), 'Pick a date');
    check('and nothing is made', A.teamPractices('t1').length, 0);

    const pr = plan({ prFocus: 'late-goals' });
    check('a practice is made', !!pr, true);
    check('on the date given', pr.date, '2026-09-15');
    check('on the calendar, under the plan\'s id', A.state.teams.t1.events[pr.id].date, '2026-09-15');
    deepEq('the plan itself carries no day, time or place', ['date', 'start', 'place'].filter(k => k in A.train.practices.t1[pr.id]), []);
    check('filed under its team', pr.teamId, 't1');
    deepEq('with what it is for', pr.focus.signals, ['late-goals']);
    check('and opened', A.ui.practice.open, pr.id);
    A.render();
    check('the plan shows its day', /Tue 15 Sep/.test(A.rendered()), true);
    check('and its time and place', /17:30–18:30 · Lakeside Park/.test(A.rendered()), true);
    check('and offers to suggest a session', /Suggest a session/.test(A.rendered()), true);
    check('with nothing to run yet', /data-act="pracrun"/.test(A.rendered()), false);
  }

  console.log('\n--- one way to add a practice ---');
  {
    as('jaz');
    A.click({ act: 'pracnew', tid: 't1' });
    fill(A, { evTitle: '', evDate: '2026-09-22', evStart: '17:30', evEnd: '18:45', evVenue: 'Hill End', evNotes: '' });
    A.click({ act: 'calsave', tid: 't1' });
    const evs = Object.values(A.state.teams.t1.events || {});
    check('it goes on the calendar', evs.length, 1);
    check('as a practice', evs[0].kind, 'practice');
    const pr = A.practiceById('t1', evs[0].id);
    check('with its plan keyed by the entry', !!pr && pr.eid, evs[0].id);
    check('taking day, time and place from it', [pr.date, pr.start, pr.place].join(' '), '2026-09-22 17:30 Hill End');
    check('and its length from start to end', pr.minutes, 75);
    check('and the plan is opened', A.ui.view + ' ' + A.ui.practice.open, 'practice ' + evs[0].id);

    as('jaz');
    A.ui.view = 'calendar';
    A.click({ act: 'calnew', tid: 't1' });
    fill(A, { evTitle: '', evDate: '2099-09-23', evStart: '18:00', evEnd: '19:00', evVenue: '', evNotes: '' });
    A.click({ act: 'calsave', tid: 't1' });
    const e = Object.values(A.state.teams.t1.events)[0];
    check('one added on the calendar makes no plan of itself', A.practiceById('t1', e.id), null);
    check('and stays on the calendar', A.ui.view, 'calendar');
    A.ui.view = 'practice'; A.render();
    check('but is on the Plans list, ready to plan', new RegExp('data-act="pracfromcal" data-id="' + e.id + '"').test(A.rendered()), true);
    A.click({ act: 'pracfromcal', id: e.id });
    const p2 = A.practiceById('t1', e.id);
    check('tapping it makes its plan', !!p2 && p2.date, '2099-09-23');
    check('and opens it', A.ui.practice.open, e.id);
    A.ui.practice.open = null; A.render();
    check('after which it is listed once, as a plan', (A.rendered().match(new RegExp('data-id="' + e.id + '"', 'g')) || []).length, 1);

    A.ui.view = 'calendar'; A.ui.teamId = 't2';
    A.click({ act: 'calitem', k: 'practice', tid: 't1', id: e.id });
    check('the calendar entry opens its plan', /data-act="pracfromcal" data-tid="t1"[^>]*>Open the plan</.test(sheet(A)), true);
    A.click({ act: 'pracfromcal', tid: 't1', id: e.id });
    check('straight to it, on its own team', [A.ui.view, A.ui.teamId, A.ui.practice.open].join(' '), 'practice t1 ' + e.id);

    as('trk'); A.state.teams.t1.events = { [e.id]: e };
    A.click({ act: 'pracfromcal', id: e.id });
    check('a tracker cannot plan one', A.practiceById('t1', e.id), null);
  }

  console.log('\n--- suggesting a session ---');
  {
    as('jaz');
    const pr = plan({ prFocus: 'late-goals' });
    A.click({ act: 'pracsuggest', id: pr.id });
    const s = A.practiceById('t1', pr.id);
    const ds = s.blocks.map(b => L.DRILLS.find(d => d.id === b.drill.id));
    check('it fills the plan', s.blocks.length >= 4, true);
    check('starting with a warm-up', ds[0].type, 'warmup');
    check('with a game in it', ds.some(d => d.type === 'game'), true);
    check('every drill suits a U11', ds.every(d => d.ages[0] <= 11 && 11 <= d.ages[1]), true);
    check('and twelve players', ds.every(d => d.players.min <= 12), true);
    check('at least one answers what it is for', ds.some(d => d.signals.includes('late-goals')), true);
    check('fitted to the hour', s.blocks.reduce((n, b) => n + b.minutes, 0), 60);
    check('no drill twice', new Set(ds.map(d => d.id)).size, ds.length);
    check('built-in drills stored by reference', s.blocks.every(b => b.drill.shelf === 'builtin' && b.drill.v === L.version && b.name), true);
    A.click({ act: 'pracsuggest', id: pr.id });
    const again = A.practiceById('t1', pr.id).blocks.map(b => b.drill.id).join();
    check('asking again offers something else', again !== s.blocks.map(b => b.drill.id).join(), true);

    const short = A.suggestPlan(L, A.state.teams.t1, { ...pr, minutes: 30, focus: { signals: [] } });
    check('a short practice gets fewer drills', short.length < s.blocks.length, true);
    check('and still adds up', short.reduce((n, b) => n + b.minutes, 0), 30);
    /* The plan it suggests should never trip the warnings the plan then
       shows. Every age, every length, every focus, and a few re-asks. */
    let bad = [], tried = 0;
    for (let born = 2008; born <= 2021; born++)
      for (const minutes of [30, 45, 60, 75, 90, 120])
        for (const sig of ['', ...Object.keys(L.SIGNALS)])
          for (let turn = 0; turn < 3; turn++) {
            const t = { ...A.state.teams.t1, birthYear: born };
            const p = { ...pr, minutes, focus: { signals: sig ? [sig] : [] } };
            const blocks = A.suggestPlan(L, t, p, turn);
            tried++;
            const w = A.planWarnings(L, t, { ...p, blocks });
            if (!blocks.length || w.length || blocks.reduce((n, b) => n + b.minutes, 0) !== minutes) bad.push(`U${2027 - born} ${minutes}m ${sig || '-'} #${turn}: ${blocks.length ? w.join(' / ') || 'adds to ' + blocks.reduce((n, b) => n + b.minutes, 0) : 'nothing'}`);
          }
    if (bad.length) console.log('    ' + [...new Set(bad.map(x => x.replace(/^U\d+ /, '').replace(/ #\d/, '').replace(/[A-Z][\w' -]+ (needs|wants|is for)/, 'X $1')))].slice(0, 30).join('\n    '));
    check(`no suggestion trips its own warnings (${tried} tried)`, bad.length, 0);
    // and a squad of six with nobody marked as keeper, which is what a lot of rosters look like
    const six = Object.fromEntries(Object.entries(squad()).slice(1, 7));
    bad = []; tried = 0;
    for (let born = 2008; born <= 2021; born++)
      for (const minutes of [30, 60, 90])
        for (const sig of ['', 'few-shots', 'possession', 'conceding']) {
          const t = { ...A.state.teams.t1, birthYear: born, players: six };
          const p = { ...pr, minutes, focus: { signals: sig ? [sig] : [] } };
          const blocks = A.suggestPlan(L, t, p, 0);
          tried++;
          const w = A.planWarnings(L, t, { ...p, blocks });
          if (!blocks.length || w.length) bad.push(`U${2027 - born} ${minutes}m ${sig || '-'}: ${w.join(' / ') || 'nothing'}`);
        }
    if (bad.length) console.log('    ' + bad.slice(0, 10).join('\n    '));
    check(`nor for six players and no keeper (${tried} tried)`, bad.length, 0);
    const tiny = A.suggestPlan(L, { ...A.state.teams.t1, birthYear: 2021 }, { ...pr, minutes: 45, focus: { signals: [] } });
    check('a U6 team gets no heading', tiny.some(b => L.DRILLS.find(d => d.id === b.drill.id).skills.includes('heading')), false);
    /* A team that plays a saved 2-5-1 is offered drills written for it, and the
       nudge that does it trips no warning either, whatever the shape. */
    const shaped = name => ({ ...A.state.teams.t1, formations: { f: { id: 'f', name, size: 9, slots: [] } }, defaults: { 9: 'f' } });
    const forShape = (t, name) => [0, 1, 2].some(turn => A.suggestPlan(L, t, { ...pr, minutes: 60, focus: { signals: [] } }, turn)
      .some(b => (L.DRILLS.find(d => d.id === b.drill.id).shapes || []).includes(name)));
    check('a 2-5-1 team is offered a 2-5-1 drill', forShape(shaped('2-5-1'), '2-5-1'), true);
    check('…and a 3-3-2 team a 3-3-2 one', forShape(shaped('3-3-2'), '3-3-2'), true);
    bad = []; tried = 0;
    for (const name of Object.keys(L.SHAPES))
      for (let born = 2008; born <= 2021; born++)
        for (const minutes of [45, 60, 90])
          for (const sig of ['', 'conceding']) {
            const t = { ...shaped(name), birthYear: born };
            const p = { ...pr, minutes, focus: { signals: sig ? [sig] : [] } };
            const blocks = A.suggestPlan(L, t, p, 0);
            tried++;
            const w = A.planWarnings(L, t, { ...p, blocks });
            if (!blocks.length || w.length) bad.push(`${name} U${2027 - born} ${minutes}m ${sig || '-'}: ${w.join(' / ') || 'nothing'}`);
          }
    if (bad.length) console.log('    ' + bad.slice(0, 10).join('\n    '));
    check(`nor for a team with a shape (${tried} tried)`, bad.length, 0);
  }

  console.log('\n--- changing the plan ---');
  {
    as('jaz');
    const pr = plan();
    A.click({ act: 'pracsuggest', id: pr.id });
    const before = A.practiceById('t1', pr.id).blocks;
    A.click({ act: 'pracmin', id: pr.id, i: '1', d: '1' });
    check('a minute more', A.practiceById('t1', pr.id).blocks[1].minutes, before[1].minutes + 1);
    A.click({ act: 'pracmove', id: pr.id, i: '0', d: '1' });
    check('moving one down swaps it with the next', A.practiceById('t1', pr.id).blocks[1].drill.id, before[0].drill.id);
    A.click({ act: 'pracmove', id: pr.id, i: '0', d: '-1' });
    check('the first cannot move up', A.practiceById('t1', pr.id).blocks[0].drill.id, before[1].drill.id);
    A.click({ act: 'pracnote', id: pr.id, i: '0' });
    check('a note for the coaches, not about a child', /not about a child/.test(sheet(A)), true);
    fill(A, { prNote: 'Bibs in the blue bag' });
    A.click({ act: 'pracnotesave', id: pr.id, i: '0' });
    check('is kept on the drill', A.practiceById('t1', pr.id).blocks[0].note, 'Bibs in the blue bag');
    const n = A.practiceById('t1', pr.id).blocks.length;
    A.click({ act: 'pracdel', id: pr.id, i: '0' });
    check('a drill can be taken out', A.practiceById('t1', pr.id).blocks.length, n - 1);
    A.click({ act: 'pracedit', id: pr.id });
    check('editing the plan sends day, time and place to the calendar', new RegExp('data-act="caledit" data-tid="t1" data-id="' + pr.id + '"').test(sheet(A)), true);
    check('and asks no date of its own', /id="prDate"/.test(sheet(A)), false);
    A.click({ act: 'caledit', tid: 't1', id: pr.id });
    fill(A, { evTitle: 'Practice', evDate: '2026-09-16', evStart: '18:00', evEnd: '19:30', evVenue: 'Hill End', evNotes: '' });
    A.click({ act: 'calsave', tid: 't1' });
    const e = A.practiceById('t1', pr.id);
    check('moving the practice on the calendar moves the plan', e.date + ' ' + e.start + ' ' + e.minutes + ' ' + e.place, '2026-09-16 18:00 90 Hill End');
    check('and keeps its drills', e.blocks.length, n - 1);
    check('still one practice, not two', A.teamPractices('t1').length, 1);
    deepEq('and nothing of the move is copied into the plan', ['date', 'start', 'place'].filter(k => k in A.train.practices.t1[pr.id]), []);

    A.click({ act: 'caledit', tid: 't1', id: pr.id }); A.click({ act: 'calcall', tid: 't1' });
    A.ui.practice.open = null; A.render();
    check('called off on the calendar, the plan is still listed', new RegExp('data-act="pracopen" data-id="' + pr.id + '"').test(A.rendered()), true);
    check('struck through and saying so', /<s>Wed 16 Sep[^<]*<\/s>/.test(A.rendered()) && /tag off">Cancelled/.test(A.rendered()), true);
    A.click({ act: 'caledit', tid: 't1', id: pr.id }); A.click({ act: 'calcall', tid: 't1' });

    global.confirm = () => true;
    A.click({ act: 'caledit', tid: 't1', id: pr.id }); A.click({ act: 'caldel', tid: 't1' });
    check('deleting the entry keeps the plan', !!A.practiceById('t1', pr.id), true);
    check('which knows it is orphaned', A.practiceById('t1', pr.id).orphan, true);
    A.ui.practice.open = null; A.render();
    check('and is listed under Earlier, not on any day', A.rendered().indexOf('Earlier') < A.rendered().indexOf('Not on the calendar'), true);
    A.ui.practice.open = pr.id; A.render();
    check('its plan says what happened, and offers a template', /taken off the calendar/.test(A.rendered()) && /data-act="tplsave"/.test(A.rendered()), true);
  }

  console.log('\n--- adding from the library ---');
  {
    as('jaz');
    const pr = plan();
    A.click({ act: 'pracpick', id: pr.id });
    A.render();
    check('the library opens', A.ui.practice.tab, 'drills');
    check('saying where drills will go', /Adding to <b>Tue 15 Sep<\/b>/.test(A.rendered()), true);
    const d = L.DRILLS.find(x => x.id === 'rondo-4v1') || L.DRILLS.find(x => x.type === 'opposed');
    A.click({ act: 'drill', id: d.id });
    check('a drill card offers to add it', /data-act="pracadd"/.test(sheet(A)) && /Add to Tue 15 Sep/.test(sheet(A)), true);
    A.click({ act: 'pracadd', id: pr.id, v: d.id });
    const got = A.practiceById('t1', pr.id).blocks;
    check('it is added', got.length === 1 && got[0].drill.id === d.id, true);
    check('for the middle of its range', got[0].minutes, Math.round((d.minutes[0] + d.minutes[1]) / 2));
    check('and says where that leaves the plan', /^Added\. 1 drill, \d+ of 60 min$/.test(A.lastToast()), true);
    A.click({ act: 'pracpickdone', id: pr.id });
    check('back to the plan', A.ui.practice.tab + ' ' + A.ui.practice.open, 'plans ' + pr.id);
    A.ui.practice.pick = null; A.click({ act: 'drill', id: d.id });
    check('outside the picker a card offers nothing', /data-act="pracadd"/.test(sheet(A)), false);
  }

  console.log('\n--- what to bring, and what would go wrong ---');
  {
    as('jaz');
    const pr = plan();
    const t = A.state.teams.t1;
    const each = L.DRILLS.find(d => d.kit.balls === 'each' && d.ages[0] <= 11 && d.ages[1] >= 11);
    const big = L.DRILLS.find(d => d.players.min > 12);
    const hard = L.DRILLS.filter(d => d.intensity === 3 && d.ages[0] <= 11 && d.ages[1] >= 11 && d.players.min <= 12).slice(0, 3);
    const blk = d => ({ drill: { shelf: 'builtin', id: d.id, v: L.version }, name: d.name, minutes: 25, note: '' });
    const p2 = { ...pr, blocks: [blk(each)] };
    check('a ball each is the squad\'s size', /\b12 balls\b/.test(A.planKit(L, t, p2)), true);
    check('nothing to bring for an empty plan', A.planKit(L, t, pr), '');
    const w = A.planWarnings(L, t, { ...pr, blocks: [...hard.map(blk), blk(big || hard[0])] });
    check('over time is said', w.some(x => /Runs \d+ min over the 60 you have/.test(x)), true);
    check('three hard drills in a row are said', w.some(x => /^Three hard drills in a row/.test(x)), true);
    if (big) check('too few players is said', w.some(x => x.includes(big.name + ' needs at least')), true);
    const gone = A.planWarnings(L, t, { ...pr, blocks: [{ drill: { shelf: 'builtin', id: 'not-a-drill' }, name: 'Old favourite', minutes: 10 }] });
    check('a drill taken out of the library is said, by name', gone.includes('Old favourite is no longer in the library.'), true);
    const kp = L.DRILLS.find(d => d.gk >= 2 && d.ages[0] <= 11 && d.ages[1] >= 11);
    if (kp) check('two keepers wanted, one on the squad', A.planWarnings(L, t, { ...pr, blocks: [blk(kp)] }).some(x => x.includes('keepers; the squad has 1')), true);
  }

  console.log('\n--- running it ---');
  {
    as('jaz');
    const pr = plan();
    A.click({ act: 'pracsuggest', id: pr.id });
    const blocks = A.practiceById('t1', pr.id).blocks;
    A.click({ act: 'pracrun', id: pr.id });
    check('run mode shows the first drill', A.rendered().includes(blocks[0].name), true);
    check('with its full time on the clock', new RegExp(`id="runClock">${blocks[0].minutes}:00<`).test(A.rendered()), true);
    check('and its coaching points', /Coaching points/.test(A.rendered()), true);
    A.click({ act: 'rungo' });
    check('Start runs the clock', !!A.ui.practice.run.endsAt, true);
    A.clock.advance(90 * 1000); A.render();
    check('which counts down off the wall clock', new RegExp(`id="runClock">${blocks[0].minutes - 2}:30<`).test(A.rendered()), true);
    A.click({ act: 'runpause' });
    const left = A.ui.practice.run.left;
    A.clock.advance(60 * 1000); A.render();
    check('Pause holds it', A.ui.practice.run.left, left);
    check('and offers to carry on', /Carry on/.test(A.rendered()), true);
    A.click({ act: 'rungo' });
    A.clock.advance(blocks[0].minutes * 60 * 1000); A.render();
    check('at zero it says so', /Time's up/.test(A.rendered()), true);
    A.click({ act: 'runnext' });
    check('Next moves on, not started', A.ui.practice.run.i + ' ' + !!A.ui.practice.run.endsAt, '1 false');
    A.click({ act: 'runprev' });
    check('Back goes back', A.ui.practice.run.i, 0);
    A.ui.practice.run.i = blocks.length - 1; A.render();
    check('the last drill offers to finish', /data-act="runnext">Finish</.test(A.rendered()), true);
    A.click({ act: 'runnext' });
    check('finishing leaves run mode', A.ui.practice.run, null);
    check('and asks how it went', /How did it go\?/.test(sheet(A)), true);
  }

  console.log('\n--- how it went ---');
  {
    as('jaz');
    const pr = plan();
    A.click({ act: 'pracreview', id: pr.id });
    check('the review warns off notes about children', /not about a child/.test(sheet(A)), true);
    fill(A, { prReview: 'The rondo clicked' });
    A.click({ act: 'pracrate', id: pr.id, v: '4' });
    check('a star rating marks it done', A.practiceById('t1', pr.id).status + ' ' + A.practiceById('t1', pr.id).review.rating, 'done 4');
    check('and keeps what was typed', /value="The rondo clicked"/.test(sheet(A)), true);
    A.click({ act: 'pracreviewsave', id: pr.id });
    check('the line is saved', A.practiceById('t1', pr.id).review.note, 'The rondo clicked');
    check('stamped with who', A.practiceById('t1', pr.id).review.by, 'jaz');

    A.click({ act: 'pracsuggest', id: pr.id });
    A.click({ act: 'pracagain', id: pr.id });
    check('use this plan for… offers nothing when every practice has a plan', /Every coming practice has a plan/.test(sheet(A)), true);
    A.click({ act: 'calnew', tid: 't1' });
    fill(A, { evTitle: '', evDate: '2026-09-22', evStart: '17:30', evEnd: '18:30', evVenue: '', evNotes: '' });
    A.click({ act: 'calsave', tid: 't1' });
    const next = Object.values(A.state.teams.t1.events).find(e => e.date === '2026-09-22');
    A.click({ act: 'pracagain', id: pr.id });
    check('and then offers the coming practice with no plan', new RegExp('data-act="pracusefor" data-id="' + pr.id + '" data-v="' + next.id + '"').test(sheet(A)), true);
    A.click({ act: 'pracusefor', id: pr.id, v: next.id });
    const copy = A.practiceById('t1', A.ui.practice.open);
    check('using it plans that practice', copy.id, next.id);
    check('on its day', copy.date, '2026-09-22');
    check('not yet reviewed', copy.status + ' ' + (copy.review === undefined), 'plan true');
    check('with the same drills', copy.blocks.map(b => b.drill.id).join(), A.practiceById('t1', pr.id).blocks.map(b => b.drill.id).join());
    check('and the first plan is untouched', A.practiceById('t1', pr.id).review.note, 'The rondo clicked');

    A.click({ act: 'pracrm', id: copy.id });
    check('delete takes the plan away', A.practiceById('t1', copy.id), null);
    check('and remembers to tell the club', A.train.dirty['t1/' + copy.id], -1);
    check('but the practice stays on the calendar', !!A.state.teams.t1.events[next.id], true);
  }

  console.log('\n--- the list ---');
  {
    as('jaz');
    plan({ prDate: '2026-09-20' });
    plan({ prDate: '2026-09-14' });
    plan({ prDate: '2026-09-01' });
    A.ui.practice.open = null; A.render();
    const html = A.rendered();
    check('upcoming first, soonest first', html.indexOf('Mon 14 Sep') < html.indexOf('Sun 20 Sep'), true);
    check('past ones under Earlier', html.indexOf('Earlier') < html.indexOf('Tue 1 Sep'), true);
    check('and asks how a past one went', /How did it go\?/.test(html), true);
  }

  console.log('\n--- when and where reaches everyone, and nothing else does ---');
  {
    as('jaz');
    const pr = plan({ prDate: '2026-09-14', prPlace: 'Lakeside Park' });
    A.click({ act: 'pracsuggest', id: pr.id });
    A.ui.view = 'matches'; A.render();
    check('the coach sees the next practice on Games', /Next practice/.test(A.rendered()) && /Mon 14 Sep · 17:30–18:30/.test(A.rendered()), true);
    check('and can open it from there', /data-act="pracopen"/.test(A.rendered()), true);

    const evs = A.state.teams.t1.events;
    as('mum');
    A.state.teams.t1.events = evs;
    A.ui.view = 'matches'; A.render();
    check('a parent sees the time and place, from the calendar', /Next practice/.test(A.rendered()) && /Lakeside Park/.test(A.rendered()), true);
    check('but nothing to open', /data-act="pracopen"/.test(A.rendered()), false);
    evs[pr.id].called = 'cancelled'; A.render();
    check('one called off is not "next"', /Next practice/.test(A.rendered()), false);
    evs[pr.id].called = null; evs[pr.id].date = '2026-09-01'; A.render();
    check('nor one already past', /Next practice/.test(A.rendered()), false);
  }

  /* ---------- part two: against the fake database ---------- */

  async function device(uid, storage = {}) {
    const fbk = makeFakebase();
    const D = H.loadApp({ firebase: fbk, config: CONFIG, storage: { 'sm.workspace': CODE, ...storage } });
    await D.flush();
    fbk.signIn(uid, { name: uid }); await D.flush();
    fbk.deliver(WS, club()); await D.flush();
    return { D, fbk };
  }
  const written = (fbk, p) => { const w = fbk.writtenTo(p); return w.length ? w[w.length - 1].value : undefined; };

  console.log('\n--- the coach index ---');
  {
    const { fbk } = await device('boss');
    check('an admin\'s device writes each coach\'s entry', written(fbk, WS + '/access/coachIndex/jaz'), 't1');
    check('every coach\'s', written(fbk, WS + '/access/coachIndex/other'), 't2');
    check('and nobody else\'s', fbk.record.writes.some(w => /coachIndex\/(trk|mum|boss)$/.test(w.path)), false);
  }
  {
    const { fbk } = await device('jaz');
    check('a coach\'s own device writes her own', written(fbk, WS + '/access/coachIndex/jaz'), 't1');
    check('and nobody else\'s', fbk.record.writes.some(w => /coachIndex\/(?!jaz$)/.test(w.path)), false);
  }
  {
    const { fbk } = await device('mum');
    check('a parent\'s device writes nothing to it', fbk.record.writes.some(w => w.path.includes('coachIndex')), false);
  }
  {
    const c = club(); c.access.coachIndex = { jaz: 't1', other: 't2' };
    const fbk = makeFakebase();
    const D = H.loadApp({ firebase: fbk, config: CONFIG, storage: { 'sm.workspace': CODE } });
    await D.flush(); fbk.signIn('boss'); await D.flush(); fbk.deliver(WS, c); await D.flush();
    check('nothing is rewritten when it already agrees', fbk.record.writes.some(w => w.path.includes('coachIndex')), false);
    D.state.access.teams.t1.coaches = {};
    D.syncCoachIndex('jaz');
    check('a coach removed from her only team is taken out', fbk.record.removes.includes(WS + '/access/coachIndex/jaz'), true);
    const rows = D.readiness().find(r => /coach index/.test(r.label));
    check('readiness reports it', !!rows, true);
  }

  console.log('\n--- a coach\'s phone and the club ---');
  {
    const { D, fbk } = await device('jaz');
    check('nothing is read before Practice opens', fbk.readPaths().some(p => p.startsWith(TR + 'practices')), false);
    D.ui.view = 'practice'; D.ui.practice = { tab: 'plans' }; D.render();
    check('opening Plans reads this team\'s plans', fbk.watching(TR + 'practices/t1'), true);
    check('and no other team\'s', fbk.watching(TR + 'practices/t2'), false);
    D.render(); D.render();
    check('once, however often it redraws', fbk.countReads(TR + 'practices/t1'), 1);

    const remote = { r1: { id: 'r1', teamId: 't1', eid: 'r1', date: '2026-09-17', start: '17:30', minutes: 60, blocks: { 0: { drill: { shelf: 'builtin', id: L.DRILLS[0].id }, name: L.DRILLS[0].name, minutes: 10 } }, status: 'plan', at: 1 } };
    fbk.deliver(TR + 'practices/t1', remote); await D.flush();
    check('the club\'s plans arrive', !!D.practiceById('t1', 'r1'), true);
    check('with their blocks as a list', Array.isArray(D.practiceById('t1', 'r1').blocks), true);
    check('and are kept on the phone', /"r1"/.test(D.storage.getItem('sm.train.v1:' + CODE) || ''), true);

    const id = plan({ prDate: '2026-09-19', prStart: '10:00', prPlace: 'Hill End' }, D).id;
    await D.flush();
    const pw = written(fbk, TR + 'practices/t1/' + id);
    check('a new plan is written, one plan at that depth', pw && pw.id, id);
    check('and the team\'s collection never whole', fbk.record.writes.some(w => w.path === TR + 'practices/t1'), false);
    check('its practice is written to the calendar, one entry', (written(fbk, WS + '/teams/t1/events/' + id) || {}).date, '2026-09-19');
    check('and nothing goes to the old schedule', fbk.record.writes.some(w => w.path.includes('/schedule/')), false);
    check('acknowledged, it is no longer pending', D.train.dirty['t1/' + id], undefined);

    /* The club's answer after that write doesn't include it yet (another
       device's view, say): a plan with nothing pending would be taken as
       deleted, and this one has nothing pending. So a pending one is the
       case that matters: make one, refuse its write, and answer without it. */
    fbk.refuseWrites(p => p.startsWith('training/'));
    const off = plan({ prDate: '2026-09-21' }, D).id;
    await D.flush();
    check('a refused write leaves it on the phone', !!D.practiceById('t1', off), true);
    check('still pending', D.train.dirty['t1/' + off] !== undefined, true);
    check('and the screen says why', /Saved on this phone only/.test(D.rendered()), true);
    fbk.deliver(TR + 'practices/t1', { ...remote, [id]: pw }); await D.flush();
    check('the club\'s answer does not wipe a pending plan', !!D.practiceById('t1', off), true);
    check('and keeps the ones it knows', !!D.practiceById('t1', id) && !!D.practiceById('t1', 'r1'), true);
    fbk.deliver(TR + 'practices/t1', { [id]: pw }); await D.flush();
    check('one gone from the club, with nothing pending here, was deleted there', D.practiceById('t1', 'r1'), null);

    /* Reload the phone with that plan still pending, and let it connect to a
       club that accepts it this time. */
    const saved = D.storage._d;
    const fbk2 = makeFakebase();
    const D2 = H.loadApp({ firebase: fbk2, config: CONFIG, storage: { ...saved } });
    await D2.flush(); fbk2.signIn('jaz'); await D2.flush(); fbk2.deliver(WS, club()); await D2.flush();
    check('after a reload the pending plan is still here', !!D2.practiceById('t1', off), true);
    D2.ui.view = 'practice'; D2.ui.practice = { tab: 'plans' }; D2.render();
    fbk2.deliver(TR + 'practices/t1', { [id]: pw }); await D2.flush();
    check('and the first answer sends it again', !!written(fbk2, TR + 'practices/t1/' + off), true);
    check('and still nothing to the schedule', fbk2.record.writes.some(w => w.path.includes('/schedule/')), false);
    check('then it is no longer pending', D2.train.dirty['t1/' + off], undefined);
  }

  console.log('\n--- plans from before the calendar move onto it ---');
  {
    const old = {
      o1: { id: 'o1', teamId: 't1', date: '2026-09-24', start: '18:00', minutes: 75, place: 'Hill End', blocks: [], status: 'plan', made: 5, by: 'jaz', at: 1 },
      o2: { id: 'o2', teamId: 't1', date: '2026-09-02', start: '17:00', minutes: 60, place: '', blocks: [], status: 'done', at: 1 },
      gone: { id: 'gone', teamId: 't1', eid: 'gone', blocks: [], status: 'plan', at: 1 }
    };
    {
      const { D, fbk } = await device('mum');
      D.ui.view = 'matches'; D.render();
      check('a parent\'s phone moves nothing', fbk.record.writes.some(w => w.path.includes('/events/')), false);
    }
    const { D, fbk } = await device('jaz');
    D.ui.view = 'practice'; D.ui.practice = { tab: 'plans' }; D.render();
    fbk.holdWrites(() => true);                 // no signal: nothing is acknowledged
    fbk.deliver(TR + 'practices/t1', old); await D.flush();
    const e1 = D.state.teams.t1.events.o1;
    check('a plan with its own date gets a calendar entry, under its own id', !!e1 && e1.kind, 'practice');
    check('from its day, time and place', [e1.date, e1.start, e1.end, e1.venue].join(' '), '2026-09-24 18:00 19:15 Hill End');
    check('for the team only, as the calendar does by default', e1.public, false);
    check('a past one too, so its register has somewhere to hang', !!D.state.teams.t1.events.o2, true);
    check('the plan is marked as moved', D.train.practices.t1.o1.eid, 'o1');
    check('a plan whose entry was deleted is not given one back', !!(D.state.teams.t1.events || {}).gone, false);
    check('the entry is in the outbox before anything is acknowledged', /teams\/t1\/events\/o1/.test(Object.entries(D.storage._d).filter(([k]) => k.startsWith('sm.pending.v1')).map(([, v]) => v).join()), true);

    /* Reload before anything reached the club: the entry is in the outbox and
       the plan is still pending, so nothing is moved twice and nothing lost. */
    const saved = D.storage._d;
    const fbk2 = makeFakebase();
    const D2 = H.loadApp({ firebase: fbk2, config: CONFIG, storage: { ...saved } });
    await D2.flush(); fbk2.signIn('jaz'); await D2.flush(); fbk2.deliver(WS, club()); await D2.flush();
    check('after a reload the entry is still owed and sent', (written(fbk2, WS + '/teams/t1/events/o1') || {}).date, '2026-09-24');
    D2.ui.view = 'practice'; D2.ui.practice = { tab: 'plans' }; D2.render();
    fbk2.deliver(TR + 'practices/t1', old); await D2.flush();
    check('and the plan, marked, is sent again', (written(fbk2, TR + 'practices/t1/o1') || {}).eid, 'o1');
    const entryWrites = fbk2.record.writes.filter(w => w.path === WS + '/teams/t1/events/o1').length;
    fbk2.deliver(TR + 'practices/t1', { ...old, o1: { ...old.o1, eid: 'o1' }, o2: { ...old.o2, eid: 'o2' } }); await D2.flush();
    check('once marked, it is never moved again', fbk2.record.writes.filter(w => w.path === WS + '/teams/t1/events/o1').length, entryWrites);
    check('the moved plan reads from its entry', D2.practiceById('t1', 'o1').onCal, true);
    check('nothing is deleted on the way', fbk2.record.removes.some(p => p.includes('/practices/')), false);

    const pend = { ...old.o1, id: 'p9', date: '2026-09-25' };
    const { D: D3, fbk: fbk3 } = await device('jaz', { ['sm.train.v1:' + CODE]: JSON.stringify({ practices: { t1: { p9: pend } }, dirty: { 't1/p9': 9 } }) });
    fbk3.refuseWrites(p => p.startsWith('training/'));
    D3.ui.view = 'practice'; D3.ui.practice = { tab: 'plans' }; D3.render();
    fbk3.deliver(TR + 'practices/t1', {}); await D3.flush();
    check('a plan with something pending stays where it is until it is sent', !!(D3.state.teams.t1.events || {}).p9, false);
  }

  console.log('\n--- a malformed plan cannot break the next coach\'s screen ---');
  {
    /* Any of the team's coaches can write a plan and the rules don't check
       its shape, so whatever arrives has to draw, and draw as text. */
    const { D, fbk } = await device('jaz');
    D.ui.view = 'practice'; D.ui.practice = { tab: 'plans' }; D.render();
    const evil = '<img src=x onerror=alert(1)>';
    fbk.deliver(TR + 'practices/t1', {
      h1: { id: 'h1', teamId: 't1', date: '2026-09-18', start: 1730, minutes: 'lots', place: evil, status: 'done',
        focus: { signals: ['__proto__', evil] }, review: { rating: 9, note: evil },
        blocks: { 0: { drill: { shelf: 'builtin', id: L.DRILLS[0].id }, name: evil, minutes: -4, note: evil }, 3: { drill: { shelf: 'club', id: 'x' }, name: evil, minutes: '7' } } },
      h2: { id: 'h2', teamId: 't1', date: 20260919, review: { rating: '<b>4</b>' }, status: 'done' }
    });
    await D.flush();
    let threw = null;
    try { D.render(); D.ui.practice.open = 'h1'; D.render(); D.click({ act: 'pracrun', id: 'h1' }); D.ui.practice.run = null; D.ui.practice.open = 'h2'; D.render(); D.ui.view = 'matches'; D.render(); }
    catch (e) { threw = e.message; }
    check('it draws without throwing', threw, null);
    const all = D.rendered() + String(D.dom.node('#sheet').innerHTML || '');
    D.ui.view = 'practice'; D.ui.practice.open = 'h1'; D.render();
    check('and nothing in it reaches the page as markup', /<img src=x/.test(D.rendered()) || /<img src=x/.test(all), false);
    check('a rating of 9 reads as 5', D.practiceById('t1', 'h1').review.rating, 5);
    check('a start that isn\'t a time is no start', D.practiceById('t1', 'h1').start, '');
  }

  console.log('\n--- a parent\'s phone never asks for a plan ---');
  {
    const c = club(); c.teams.t1.events = { e1: { id: 'e1', kind: 'practice', date: '2026-09-14', start: '17:30', end: '18:30', venue: 'Lakeside Park' } };
    const fbk = makeFakebase();
    const D = H.loadApp({ firebase: fbk, config: CONFIG, storage: { 'sm.workspace': CODE } });
    await D.flush(); fbk.signIn('mum'); await D.flush(); fbk.deliver(WS, c); await D.flush();
    D.ui.view = 'matches'; D.render();
    check('the next practice comes from the calendar', /Next practice/.test(D.rendered()) && /Lakeside Park/.test(D.rendered()), true);
    check('with no plan or schedule read at all', fbk.readPaths().some(p => /^training\/[^/]+\/(practices|schedule)/.test(p)), false);
    D.ui.view = 'practice'; D.render();
    check('and never the plans', fbk.readPaths().some(p => p.includes('/practices')), false);
  }

  console.log('\n--- a refused read ---');
  {
    const { D, fbk } = await device('jaz');
    D.ui.view = 'practice'; D.ui.practice = { tab: 'plans' }; D.render();
    fbk.refuse(TR + 'practices/t1'); await D.flush();
    check('the first refusal is retried', D.timers.pending.size > 0, true);
    D.timers.run(); await D.flush();
    check('read again', fbk.totalReads(TR + 'practices/t1'), 2);
    fbk.refuse(TR + 'practices/t1'); await D.flush(); D.render();
    check('a second refusal is the rules, and is said', /Saved on this phone only/.test(D.rendered()), true);
    D.render(); D.render(); D.render();
    check('and redrawing does not ask again', fbk.totalReads(TR + 'practices/t1'), 2);
    fbk.signIn('boss'); await D.flush(); D.render();
    check('signing in as someone else asks again', fbk.totalReads(TR + 'practices/t1'), 3);
  }

  H.summary('practice plans');
})();
