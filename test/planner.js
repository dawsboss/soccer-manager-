/* Planning for the club: what collides, when everyone is free, and picture
   day. ROADMAP's *Next: planning for the club* is the design.

   What's pinned here is what would be easy to get quietly wrong:

   - It's the admins'. A coach, a tracker or a parent who reaches an action
     is refused in the handler, and the screen sends them back to Club home.
   - Clashes are a read: two things at one place at once (a field with room
     for two is not a clash), a coach due in two places, a family with
     children due in two places. Nothing is written.
   - Find a time never offers a slot one of the chosen teams is already busy
     in ahead of a free one, says what each slot clashes with, and prefers a
     team's usual practice slot.
   - Booking is one entry per team at teams/{tid}/events/{eid}, sharing a
     `club` id, one write each, and team-only. Picture day the same, laid
     out around what each team has on, siblings' teams next to each other. */

const H = require('./harness');
const { check, deepEq } = H;
const { makeFakebase } = require('./fakebase');

const CONFIG = { apiKey: 'k', databaseURL: 'https://prod.example', projectId: 'p' };
// the harness clock: Saturday 12 September 2026
const SAT = '2026-09-12', TUE = '2026-09-15';

const kid = (id, name, guardians) => ({ id, name, number: id.slice(1), active: true, guardians });
const club = () => ({
  teams: {
    t1: { id: 't1', name: 'G11 Flight', players: { p1: kid('p1', 'Ella', { fam1: true }), p2: kid('p2', 'Mia', { fam2: true }) },
      events: { e1: { id: 'e1', kind: 'practice', date: TUE, start: '17:30', end: '18:30', venue: 'Lakeside Park' },
        w1: { id: 'w1', kind: 'practice', date: '2026-09-08', start: '17:30', end: '18:30', venue: 'Lakeside Park' },
        w0: { id: 'w0', kind: 'practice', date: '2026-09-01', start: '17:30', end: '18:30', venue: 'Lakeside Park' } } },
    t2: { id: 't2', name: 'G13 Storm', players: { p3: kid('p3', 'Sam', { fam1: true }), p4: kid('p4', 'Zoe', { fam4: true }) },
      events: { e2: { id: 'e2', kind: 'practice', date: TUE, start: '18:00', end: '19:00', venue: 'lakeside park' } } },
    t3: { id: 't3', name: 'B9 Comets', players: { p5: kid('p5', 'Leo', { fam5: true }) }, events: {} }
  },
  matches: {},
  access: {
    admins: { boss: true },
    index: { boss: true, jaz: true, kim: true, mum: true, trk: true },
    members: { boss: { name: 'Ada' }, jaz: { name: 'Jaz' }, kim: { name: 'Kim' } },
    teams: { t1: { coaches: { jaz: true }, trackers: { trk: true } }, t2: { coaches: { jaz: true, kim: true } }, t3: { coaches: { kim: true } } }
  }
});
const sheet = A => String(A.dom.node('#sheet').innerHTML || '');
const A = H.loadApp({ config: CONFIG, firebase: makeFakebase() });
function as(uid, c = club()) {
  A.state = c; A.me = uid ? { uid, name: uid } : null; A.appOwners = {};
  A.ui.teamId = 't1'; A.ui.view = 'planner'; A.ui.planner = {}; A.toasts.length = 0;
}

(async () => {

  console.log('--- who plans ---');
  {
    for (const who of ['jaz', 'mum', 'trk']) {
      as(who); A.render();
      check(who + ': the screen sends them back', A.ui.view, 'club');
      const before = JSON.stringify(A.state);
      A.click({ act: 'plbookgo', d: TUE, a: '600' });
      check(who + ': a booking that gets through is refused', A.lastToast(), 'Planning is for club admins');
      check(who + ': and nothing is written', JSON.stringify(A.state), before);
    }
    as('boss'); A.ui.view = 'admin'; A.render();
    check('an admin has it under club settings', /data-act="planner"/.test(A.rendered()), true);
    A.click({ act: 'planner' });
    check('and it opens', A.ui.view, 'planner');
    check('at its own address', A.uiToHash(), '#/club/planner');
  }

  console.log('\n--- clashes ---');
  {
    as('boss');
    const cs = A.clubClashesOn(TUE);
    check('two teams at one place at once, the place typed two ways', cs.some(c => c.kind === 'place' && /G11 Flight: Practice at 5:30pm and G13 Storm: Practice at 6pm/.test(c.text)), true);
    check('a coach due in two places', cs.some(c => c.kind === 'coach' && /^Jaz is due at/.test(c.text)), true);
    check('a family with children on both teams', cs.some(c => c.kind === 'family' && /^1 family has children at/.test(c.text) && /Ella and Sam/.test(c.text)), true);
    check('a family on one team only is not counted', cs.some(c => /Mia|Zoe/.test(c.text)), false);
    A.render();
    check('the screen lists them under the day', /Tue 15 Sep/.test(A.rendered()) && /Same place/.test(A.rendered()), true);

    const c = club();
    c.access.org = { venues: { v1: { id: 'v1', name: 'Lakeside Park', pitches: 2 } } };
    as('boss', c);
    check('a field with two pitches holds two at once', A.clubClashesOn(TUE).some(x => x.kind === 'place'), false);
    c.teams.t2.events.e2.called = 'cancelled';
    check('something called off clashes with nothing', A.clubClashesOn(TUE).length, 0);
    check('nothing was written to look', A.state.teams.t1.events.e1.called === undefined, true);
  }

  console.log('\n--- find a time ---');
  {
    as('boss');
    const f = { tids: ['t1', 't2'], len: 60, from: TUE, days: 1, h0: '17:00', h1: '20:00', field: '', ran: true };
    const res = A.findTimes(f);
    check('every half hour that fits is tried', res.length, 5);
    check('the best is one where nobody is busy', res[0].why.length, 0);
    check('at 7pm, after both practices', res[0].a, 19 * 60);
    const busy = res.find(r => r.a === 17 * 60 + 30);
    check('a slot a chosen team is busy in comes after every free one', res.indexOf(busy) > res.findIndex(r => !r.why.length), true);
    check('and says what it clashes with', busy.why.some(w => /^G11 Flight has Practice at 5:30pm/.test(w)), true);
    check('said once, not again as its own coach and families', busy.why.length, 2);
    const one = A.findTimes({ ...f, tids: ['t1'] }).find(r => r.a === 18 * 60 + 30);
    check('for one team, a coach due at another team\'s practice is said', one.why.some(w => w === 'Jaz is busy'), true);
    check('and a family with a child there', one.why.some(w => w === '1 family has a child somewhere else'), true);

    /* Kim coaches G13 and B9: G13's practice makes her busy for B9, and a
       time with nothing of hers on is free. */
    const t3 = A.findTimes({ ...f, tids: ['t3'], from: TUE, h0: '17:00', h1: '19:00' });
    check('a team\'s coach busy with another team is said', t3.find(r => r.a === 18 * 60).why.join(), 'Kim is busy');
    check('and a time she is free is free', t3.find(r => r.a === 17 * 60).why.length, 0);
    const usual = A.findTimes({ ...f, tids: ['t1'], from: '2026-09-22', days: 1, h0: '17:00', h1: '20:00' });
    check('with nobody busy, a team\'s usual practice slot comes first', usual[0].a + ' ' + usual[0].usual, (17 * 60 + 30) + ' true');
    check('nothing in the past is offered', A.findTimes({ ...f, from: SAT, h0: '06:00', h1: '12:00' }).every(r => r.a > 10 * 60), true);

    A.ui.planner = { tab: 'find', find: f }; A.render();
    check('the screen lists them, best first', /data-act="plbook" data-d="2026-09-15" data-a="1140"/.test(A.rendered()), true);
    A.click({ act: 'plbook', d: TUE, a: '1140' });
    check('booking asks what it is', /id="pbTitle"/.test(sheet(A)), true);
    A.dom.node('#pbTitle').value = ''; A.click({ act: 'plbookgo', d: TUE, a: '1140' });
    check('and needs an answer', A.lastToast(), 'Say what it is');
    A.dom.node('#pbTitle').value = 'Coaches\' meeting'; A.dom.node('#pbVenue').value = 'Clubhouse';
    A.click({ act: 'plbookgo', d: TUE, a: '1140' });
    const made = ['t1', 't2'].map(tid => Object.values(A.state.teams[tid].events).find(e => e.title === 'Coaches\' meeting'));
    check('one entry on each chosen team\'s calendar', made.every(Boolean), true);
    check('none on a team that wasn\'t chosen', Object.values(A.state.teams.t3.events || {}).length, 0);
    check('sharing one club id, with an id each', made[0].club && made[0].club === made[1].club && made[0].id !== made[1].id, true);
    check('at the time picked', [made[0].date, made[0].start, made[0].end, made[0].venue].join(' '), '2026-09-15 19:00 20:00 Clubhouse');
    check('for the teams only, not the share link', made.every(e => e.public === false), true);
    check('and the calendar shows it', A.calItems(['t1']).some(x => x.title === 'Coaches\' meeting'), true);
  }

  console.log('\n--- picture day ---');
  {
    const c = club();
    c.teams.t1.events.sat = { id: 'sat', kind: 'event', date: '2026-09-26', start: '09:00', end: '09:20', venue: 'Away' };
    as('boss', c);
    const order = A.picOrder(['t1', 't2', 't3']).map(x => x.tid);
    check('siblings\' teams side by side', Math.abs(order.indexOf('t1') - order.indexOf('t2')), 1);
    const lay = A.picLayout({ date: '2026-09-26', venue: 'Clubhouse', h0: '09:00', h1: '09:40', slot: 10, tids: ['t1', 't2', 't3'] });
    const at = Object.fromEntries(lay.slots.map(x => [x.tid, x.a]));
    check('a team busy at the start goes in the first slot it is free for', at.t1 >= 9 * 60 + 20, true);
    check('nobody overlaps', lay.slots.every((x, i) => lay.slots.every((y, j) => i === j || x.b <= y.a || y.b <= x.a)), true);
    check('jaz, coach of both, is never due twice at once', !(at.t1 !== undefined && at.t2 !== undefined && Math.abs(at.t1 - at.t2) < 10), true);
    const tight = A.picLayout({ date: '2026-09-26', venue: '', h0: '09:00', h1: '09:20', slot: 10, tids: ['t1', 't2', 't3'] });
    check('a team with no room left is said, not squeezed in', tight.left.length > 0 && tight.slots.length + tight.left.length, 3);

    A.ui.planner = { tab: 'pic', pic: { date: '2026-09-26', venue: 'Clubhouse', h0: '09:00', h1: '10:00', slot: 10, tids: ['t1', 't2', 't3'] } };
    A.render();
    global.confirm = () => true;
    for (const [k, v] of Object.entries({ pcDate: '2026-09-26', pcVenue: 'Clubhouse', pcH0: '09:00', pcH1: '10:00', pcSlot: '10' })) A.dom.node('#' + k).value = v;
    A.click({ act: 'plpicgo' });
    const pics = ['t1', 't2', 't3'].map(tid => Object.values(A.state.teams[tid].events).find(e => e.title === 'Picture day'));
    check('booked on every team\'s calendar', pics.every(Boolean), true);
    check('one club id across them', new Set(pics.map(e => e.club)).size, 1);
    check('each in its own slot, at the place given', pics.every(e => e.venue === 'Clubhouse' && e.end > e.start), true);
  }

  console.log('\n--- a field\'s hours and closures ---');
  {
    const c = club();
    // Tuesday is weekday 1; the lights go off at 6:30, it's shut on Sundays and for a week in October
    c.access.org = { venues: { v1: { id: 'v1', name: 'Lakeside Park', pitches: 2,
      hours: { d1: { from: '16:00', to: '18:30' }, d6: { closed: true } },
      closed: { x1: { id: 'x1', from: '2026-10-05', until: '2026-10-11', note: 'Reseeding' } } } } };
    as('boss', c);
    const f = A.fieldById('v1');
    check('inside its hours is fine', A.fieldShut(f, TUE, 16 * 60 + 30, 17 * 60 + 30), '');
    check('running past them is said', A.fieldShut(f, TUE, 17 * 60 + 30, 19 * 60), 'Lakeside Park is open 4pm–6:30pm on Tuesdays');
    check('a day marked closed', A.fieldShut(f, '2026-09-20', 600, 660), 'Lakeside Park isn\'t open on Sundays');
    check('a day with no hours set is open', A.fieldShut(f, '2026-09-16', 0, 1440), '');
    check('closed dates win over hours', A.fieldShut(f, '2026-10-06', 16 * 60 + 30, 17 * 60), 'Lakeside Park is closed Mon 5 Oct to Sun 11 Oct (Reseeding)');
    const cs = A.clubClashesOn(TUE);
    check('the planner flags G13\'s practice running past the lights', cs.some(x => x.kind === 'field' && /^G13 Storm: Practice at 6pm: Lakeside Park is open 4pm–6:30pm/.test(x.text)), true);
    check('and not G11\'s, which ends in time', cs.some(x => x.kind === 'field' && /G11 Flight/.test(x.text)), false);
    const ft = A.findTimes({ tids: ['t3'], len: 60, from: TUE, days: 1, h0: '16:00', h1: '20:00', field: 'v1', ran: true });
    check('find a time at the field never puts a shut slot first', ft[0].b <= 18 * 60 + 30 && !ft[0].why.length, true);
    check('a slot after the lights go off says why', ft.find(r => r.a === 19 * 60).why[0], 'Lakeside Park is open 4pm–6:30pm on Tuesdays');
    A.state.matches = {};
    A.sess = { ...A.sess, sessions: { s1: { id: 's1', kind: 'one', title: '1-1', coach: 'kim', coachName: 'Kim', date: '2026-10-07', start: '17:00', end: '18:00', field: 'v1', cap: 1 } } };
    check('a session on a closed date is flagged to its coach', A.sessClashes(A.sessById('s1')).some(x => /closed .*Reseeding/.test(x)), true);

    A.ui.view = 'sessions'; A.ui.sess = { tab: 'fields' };
    A.click({ act: 'fieldedit', id: 'v1' });
    check('the field form has the hours, one row a day', (sheet(A).match(/class="fhrow"/g) || []).length, 7);
    check('Sunday shown closed', /data-act="fieldshut" data-v="6" aria-pressed="true"/.test(sheet(A)), true);
    const v = { fdName: 'Lakeside Park', fdAddress: '', fdPitches: '2', fdNotes: '', fhFrom_1: '16:00', fhTo_1: '18:30', fcFrom_0: '2026-10-05', fcUntil_0: '2026-10-11', fcNote_0: 'Reseeding' };
    for (let d = 0; d < 7; d++) if (d !== 1) Object.assign(v, { ['fhFrom_' + d]: '', ['fhTo_' + d]: '' });
    v.fhFrom_3 = '17:00';
    for (const [k, x] of Object.entries(v)) A.dom.node('#' + k).value = x;
    A.click({ act: 'fieldsave' });
    check('a day with only an opening time is refused', A.lastToast(), 'Give each day both an opening and a closing time, or leave it blank');
    A.dom.node('#fhTo_3').value = '20:00';
    A.click({ act: 'fieldclose' });
    for (const [k, x] of Object.entries({ fcFrom_1: '2026-12-24', fcUntil_1: '', fcNote_1: 'Holidays' })) A.dom.node('#' + k).value = x;
    A.click({ act: 'fieldshut', v: '0' });
    A.click({ act: 'fieldsave' });
    const saved = A.state.access.org.venues.v1;
    deepEq('what constrains is saved, and only that', Object.keys(saved.hours).sort(), ['d0', 'd1', 'd3', 'd6']);
    check('Monday closed, Thursday 5 to 8', saved.hours.d0.closed + ' ' + saved.hours.d3.from + '–' + saved.hours.d3.to, 'true 17:00–20:00');
    check('a one-day closure ends the day it starts', Object.values(saved.closed).find(x => x.note === 'Holidays').until, '2026-12-24');

    as('kim', c); A.ui.view = 'sessions'; A.ui.sess = { tab: 'fields' };
    const before = JSON.stringify(A.state.access.org);
    A.click({ act: 'fieldshut', v: '2' }); A.click({ act: 'fieldsave' });
    check('a coach cannot change a field\'s hours', JSON.stringify(A.state.access.org), before);
  }

  console.log('\n--- against the database: one write per team ---');
  {
    const fbk = makeFakebase();
    const D = H.loadApp({ firebase: fbk, config: CONFIG, storage: { 'sm.workspace': 'CLUB' } });
    await D.flush(); fbk.signIn('boss', { name: 'Ada' }); await D.flush(); fbk.deliver('workspaces/CLUB', club()); await D.flush();
    D.ui.view = 'planner'; D.ui.planner = { tab: 'find', find: { tids: [], len: 60, from: TUE, days: 1, h0: '19:00', h1: '20:00', ran: true } };
    D.render();
    for (const [k, v] of Object.entries({ plFrom: TUE, plH0: '19:00', plH1: '20:00', plLen: '60', plDays: '7', plField: '' })) D.dom.node('#' + k).value = v;
    D.click({ act: 'plbook', d: TUE, a: '1140' });
    D.dom.node('#pbTitle').value = 'End-of-season party'; D.dom.node('#pbVenue').value = '';
    D.click({ act: 'plbookgo', d: TUE, a: '1140' });
    await D.flush();
    const ws = fbk.record.writes.filter(w => /\/teams\/t\d\/events\//.test(w.path) && w.value && w.value.title === 'End-of-season party');
    check('the whole club: one write for each team', ws.length, 3);
    check('each at teams/{tid}/events/{eid}', ws.every(w => /^workspaces\/CLUB\/teams\/t\d\/events\/[\w-]+$/.test(w.path)), true);
    check('never a team\'s whole calendar, or a whole team', fbk.record.writes.some(w => /\/teams\/t\d(\/events)?$/.test(w.path)), false);
  }

  H.summary('planning for the club');
})();
