/* Bookable times, and My calendar. AVAILABILITY.md is the design. What is
   easy to get quietly wrong, and so is pinned here:

   - Only a coach (her own times) or an admin (anyone's) offers or changes
     times, checked in the click handler, not only by what the screen draws.
   - A block is 1-1s or a small group; it carries the slots it offers, each
     with its start as a timestamp, and one seat key per place, because those
     are what the rules read.
   - A coach's team calendar is her busy time: a practice for a team she
     coaches, or a session she runs, takes out the slots it overlaps, on the
     screen at once and in the block's list of slots when her phone (or an
     admin's) next draws. Seats nobody is using are let go.
   - A family books a free place for her own child only: the slot's session
     under the id the rule builds (first family only), a seat nobody holds,
     then the booking naming it, each at its own path. It needs a signal; a
     refusal is taken back off the screen. A full group offers nothing.
   - Her child's own team practice is never booked over.
   - She cancels her own child's place (booking, seat, then the slot if
     nobody else is in it), not another child's, not inside the notice.
   - She never sees another child's name. Times never reach public/.
   - My calendar is the person's: her teams, her children's, her sessions and
     her times, and nobody else's. */

const H = require('./harness');
const { check } = H;
const { makeFakebase } = require('./fakebase');

const CONFIG = { apiKey: 'k', databaseURL: 'https://prod.example', projectId: 'p' };
const CODE = 'CLUB';
const WS = 'workspaces/' + CODE;
const TR = 'training/' + CODE + '/';

/* Born 2016 is U11 on the harness clock, born 2014 U13. Mo is Rosa's
   family and Gwen is Ella's (t1, coached by Jaz); Pat is Uma's (t2, Olu's). */
const club = () => ({
  teams: {
    t1: {
      id: 't1', name: 'G11 Flight', birthYear: 2016, events: {},
      players: {
        p0: { id: 'p0', name: 'Ella Smith', number: '1', active: true, guardians: { gran: true } },
        p1: { id: 'p1', name: 'Rosa Smith', number: '2', active: true, guardians: { mum: true } }
      }
    },
    t2: {
      id: 't2', name: 'G13 Storm', birthYear: 2014, events: {},
      players: { q1: { id: 'q1', name: 'Uma Jones', number: '7', active: true, guardians: { mum2: true } } }
    }
  },
  matches: {},
  access: {
    admins: { boss: true },
    index: { boss: true, jaz: true, other: true, trk: true, mum: true, mum2: true, gran: true },
    members: { boss: { name: 'Ada' }, jaz: { name: 'Jaz' }, other: { name: 'Olu' }, mum: { name: 'Mo' }, mum2: { name: 'Pat' }, gran: { name: 'Gwen' } },
    teams: { t1: { coaches: { jaz: true }, trackers: { trk: true } }, t2: { coaches: { other: true } } },
    coachIndex: { jaz: 't1', other: 't2' }
  }
});

const sheet = A => String(A.dom.node('#sheet').innerHTML || '');
const fill = (A, v) => { for (const [k, x] of Object.entries(v)) A.dom.node('#' + k).value = x; };

const A = H.loadApp({ config: CONFIG, firebase: makeFakebase() });
const TODAY = A.todayStr();
const day = n => A.addDays(TODAY, n);
const pad = n => String(n).padStart(2, '0');
/* The two lists the rules read, worked out here independently of the app:
   every slot on the grid, start as a local timestamp, and a seat per place. */
function lists(b) {
  const [y, m, d] = b.date.split('-').map(Number);
  const mins = t => { const [h, mi] = t.split(':').map(Number); return h * 60 + mi; };
  const slots = {};
  for (let a = mins(b.start); a + b.len <= mins(b.end); a += b.len) {
    const st = pad(Math.floor(a / 60)) + ':' + pad(a % 60), en = pad(Math.floor((a + b.len) / 60)) + ':' + pad((a + b.len) % 60);
    slots['t' + st.replace(':', '')] = { end: en, at: new Date(y, m - 1, d).getTime() + a * 60000 };
  }
  const seats = {};
  for (let i = 1; i <= b.cap; i++) seats['s' + i] = true;
  return { ...b, slots, seats };
}
const block = (id, extra = {}) => lists({ id, kind: 'one', cap: 1, coach: 'jaz', coachName: 'Jaz', date: day(3), start: '17:00', end: '19:00', len: 60, price: 30, notice: 24, place: 'Hill End', ...extra });
const group = (id, extra = {}) => block(id, { kind: 'group', cap: 2, title: 'Finishing group', ...extra });

function as(uid) {
  A.state = club();
  A.sess = { sessions: {}, booked: {}, came: {}, fees: {}, pay: {}, splans: {}, avail: {}, seats: {}, dirty: {} };
  A.me = uid ? { uid, name: (club().access.members[uid] || {}).name || uid } : null;
  A.appOwners = {};
  A.ui.view = 'sessions'; A.ui.sess = { tab: 'list' }; A.ui.teamId = 't1'; A.ui.myCal = 'all';
  A.toasts.length = 0;
  A.dom.node('#sheet').innerHTML = '';
}
function putBlock(id, extra) { A.sess.avail[id] = block(id, extra); return id; }
function putGroup(id, extra) { A.sess.avail[id] = group(id, extra); return id; }
const slotSess = (sid, extra = {}) => ({ id: sid, kind: 'one', cap: 1, coach: 'jaz', coachName: 'Jaz', date: day(3), start: '18:00', end: '19:00', slot: 'b1', pid: 'p1', tid: 't1', by: 'mum', open: false, notice: 24, price: 30, ...extra });

(async () => {

  console.log('--- offering times ---');
  {
    as('jaz'); A.ui.sess.tab = 'avail'; A.render();
    check('a coach has the Bookable times tab', /Bookable times<\/button>/.test(A.rendered()) && /data-act="availnew"/.test(A.rendered()), true);
    A.click({ act: 'availnew' });
    fill(A, { avDate: day(3), avStart: '17:00', avEnd: '19:00', avField: '', avPlace: 'Hill End', avPrice: '30', avLo: '', avHi: '', avNote: '', avUntil: day(3 + 21), avCoach: '' });
    A.click({ act: 'availsave' });
    const mine = A.blockAll();
    check('every week, one block per week', mine.length, 4);
    check('sharing one series', new Set(mine.map(b => b.series)).size === 1 && !!mine[0].series, true);
    check('in her name', mine.every(b => b.coach === 'jaz'), true);
    check('1-1s, one place each, by default', mine[0].kind + ' ' + mine[0].cap, 'one 1');
    check('cut into two slots', A.blockSlots(mine[0]).map(x => x.start).join(','), '17:00,18:00');
    check('both free', A.blockSlots(mine[0]).every(x => x.free), true);
    const raw = A.sess.avail[mine[0].id];
    check('the slots the rules read are written with it', Object.keys(raw.slots).join(','), 't1700,t1800');
    check('each with its start as a time on the clock', raw.slots.t1800.at, A.slotAt(day(3), '18:00'));
    check('and one seat', Object.keys(raw.seats).join(','), 's1');
    check('each week one write, at its own path', Object.keys(A.sess.dirty).every(p => /^avail\/[\w]+$/.test(p)), true);

    A.click({ act: 'availnew' });
    A.click({ act: 'availkind', v: 'group' });
    fill(A, { avTitle: 'Finishing group', avCap: '6', avDate: day(4), avStart: '10:00', avEnd: '11:00', avUntil: '' });
    A.click({ act: 'availrepeat', v: '0' });
    fill(A, { avTitle: 'Finishing group', avCap: '6', avDate: day(4), avStart: '10:00', avEnd: '11:00' });
    A.click({ act: 'availsave' });
    const g = A.blockAll().find(b => b.date === day(4));
    check('a small group too', g && g.kind + ' ' + g.cap + ' ' + g.title, 'group 6 Finishing group');
    check('with a seat per place', Object.keys(A.sess.avail[g.id].seats).length, 6);

    A.click({ act: 'availnew' });
    A.click({ act: 'availrepeat', v: '0' });
    fill(A, { avDate: day(5), avStart: '17:00', avEnd: '17:30' });
    A.click({ act: 'availsave' });
    check('a window shorter than one slot is refused', /Shorter than one/.test(A.lastToast()), true);
  }
  {
    as('mum'); A.render();
    A.click({ act: 'availnew' });
    check('a family cannot offer times', A.lastToast(), 'That is for coaches and admins');
    as('trk');
    A.click({ act: 'availnew' });
    check('nor a tracker, who has no training sessions at all', A.lastToast(), 'Training sessions are for coaches, admins and families');
    as('other'); putBlock('b1');
    A.click({ act: 'availedit', id: 'b1' });
    check('another coach cannot change hers', /Only that coach, or an admin/.test(A.lastToast()), true);
    A.click({ act: 'availdel', id: 'b1', v: 'one' });
    check('nor delete them', !!A.blockById('b1'), true);
    A.click({ act: 'availnew' });
    A.click({ act: 'availrepeat', v: '0' });
    fill(A, { avDate: day(3), avStart: '09:00', avEnd: '10:00', avCoach: 'jaz' });
    A.click({ act: 'availsave' });
    check('a coach offers only her own, whatever the form says', A.blockAll().filter(b => b.start === '09:00').map(b => b.coach).join(), 'other');
    as('boss'); putBlock('b1');
    A.click({ act: 'availoff', id: 'b1' });
    check('an admin takes a week off for any coach', A.blockById('b1').off, true);
    check('and nothing in it is free', A.blockSlots(A.blockById('b1')).some(x => x.free), false);
    check('nor listed for the rules', Object.keys(A.sess.avail.b1.slots).length, 0);
  }

  console.log('\n--- synced with the teams\' calendars ---');
  {
    as('jaz'); putBlock('b1');
    A.state.teams.t1.events.e1 = { id: 'e1', kind: 'practice', date: day(3), start: '18:00', end: '19:00', venue: 'Hill End' };
    const sl = A.blockSlots(A.blockById('b1'));
    check('a practice of a team she coaches takes out its slot', sl.find(x => x.start === '18:00').free, false);
    check('and says why', /G11 Flight/.test(sl.find(x => x.start === '18:00').clash[0].label), true);
    check('the rest stays free', sl.find(x => x.start === '17:00').free, true);
    check('her phone takes it off the list the rules read', A.healBlocks(), 1);
    check('so a family cannot book it even by hand', Object.keys(A.sess.avail.b1.slots).join(), 't1700');
    check('and once it is right, nothing more is written', A.healBlocks(), 0);
    delete A.state.teams.t1.events.e1;
    A.healBlocks();
    check('the practice gone, the slot comes back', Object.keys(A.sess.avail.b1.slots).join(), 't1700,t1800');
    A.state.teams.t2.events.e2 = { id: 'e2', kind: 'practice', date: day(3), start: '17:00', end: '18:00' };
    check('another team\'s practice does not take a slot', A.blockSlots(A.blockById('b1')).find(x => x.start === '17:00').free, true);
    A.sess.sessions.s9 = { id: 's9', kind: 'group', coach: 'jaz', date: day(3), start: '17:30', end: '18:30', cap: 4 };
    check('a session she runs does, once it overlaps', A.blockSlots(A.blockById('b1')).find(x => x.start === '17:00').free, false);
    putBlock('b0', { date: day(-1) });
    check('a past day offers nothing', A.blockSlots(A.blockById('b0')).some(x => x.free), false);
    as('other'); putBlock('b1');
    A.state.teams.t1.events.e1 = { id: 'e1', kind: 'practice', date: day(3), start: '18:00', end: '19:00' };
    check('another coach\'s phone leaves her blocks alone', A.healBlocks(), 0);
    as('boss'); putBlock('b1');
    A.state.teams.t1.events.e1 = { id: 'e1', kind: 'practice', date: day(3), start: '18:00', end: '19:00' };
    check('an admin\'s keeps them right', A.healBlocks(), 1);
  }
  {
    as('jaz'); putBlock('b1');
    const sid = A.slotSid('jaz', day(3), '17:00');
    A.sess.sessions[sid] = slotSess(sid, { start: '17:00', end: '18:00' });
    A.sess.seats[sid] = { s1: { pid: 'p1', tid: 't1', by: 'mum', at: A.nowMs() } };
    check('a seat just taken, its booking on the way, is kept', A.healBlocks(), 0);
    A.clock.set(A.nowMs() + 11 * 60000);
    A.healBlocks();
    check('one held ten minutes with no booking is let go', A.seatsOf(sid).length, 0);
    A.sess.seats[sid] = { s1: { pid: 'p1', tid: 't1', by: 'mum', at: A.nowMs() } };
    A.sess.booked[sid] = { p1: { tid: 't1', st: 'in', by: 'mum', at: 1, seat: 's1' } };
    check('one with a booking behind it is kept', A.healBlocks(), 0);
    A.click({ act: 'sessbook', id: sid, pid: 'p1', v: 'out' });
    check('taking the player off gives the seat back', A.seatsOf(sid).length, 0);
  }

  console.log('\n--- a family sees and picks a time ---');
  {
    as('mum'); putBlock('b1'); A.render();
    check('her list offers the coach\'s times', /Book a time with a coach/.test(A.rendered()) && /1-1s with Jaz/.test(A.rendered()), true);
    A.click({ act: 'availopen', id: 'b1' });
    check('the sheet has a Book for each free slot', (sheet(A).match(/data-act="slotpick"/g) || []).length, 2);
    A.click({ act: 'slotpick', id: 'b1', v: '18:00' });
    check('picking one asks what she wants to work on', /slotWant/.test(sheet(A)) && /Book 6pm for Rosa/.test(sheet(A)), true);
    A.click({ act: 'slotbook', id: 'b1', v: '18:00', pid: 'p0' });
    check('never for somebody else\'s child', /your own child/.test(A.lastToast()), true);
    A.click({ act: 'slotbook', id: 'b1', v: '18:00', pid: 'p1' });
    const sid = A.slotSid('jaz', day(3), '18:00');
    check('on a phone with no club database it is kept here', (A.sessById(sid) || {}).pid, 'p1');
    check('on the 1-1\'s seat', A.seatsOf(sid).map(x => x.n + ':' + x.pid).join(), 's1:p1');
    check('and booked, naming it', A.bookOf(sid, 'p1').seat, 's1');
    check('the slot is no longer free', A.blockSlots(A.blockById('b1')).find(x => x.start === '18:00').free, false);

    as('mum'); putBlock('b1');
    const sid2 = A.slotSid('jaz', day(3), '17:00');
    A.sess.sessions[sid2] = slotSess(sid2, { start: '17:00', end: '18:00', pid: 'p0', by: 'gran' });
    A.sess.booked[sid2] = { p0: { tid: 't1', st: 'in', by: 'gran', at: 1, seat: 's1' } };
    A.sess.seats[sid2] = { s1: { pid: 'p0', tid: 't1', by: 'gran', at: 1 } };
    A.render();
    A.click({ act: 'availopen', id: 'b1' });
    check('another family\'s 1-1 says full', /full/.test(sheet(A)), true);
    check('without her child\'s name', /Ella/.test(sheet(A) + A.rendered()), false);
    check('and only the free one can be booked', (sheet(A).match(/data-act="slotpick"/g) || []).length, 1);
    A.ui.view = 'mycal'; A.render();
    check('nor is that child on her calendar', /Ella/.test(A.rendered()), false);
  }
  {
    as('mum'); putGroup('g1');
    const sid = A.slotSid('jaz', day(3), '17:00');
    A.sess.sessions[sid] = slotSess(sid, { kind: 'group', cap: 2, start: '17:00', end: '18:00', slot: 'g1', pid: 'p0', by: 'gran' });
    A.sess.booked[sid] = { p0: { tid: 't1', st: 'in', by: 'gran', at: 1, seat: 's1' } };
    A.sess.seats[sid] = { s1: { pid: 'p0', tid: 't1', by: 'gran', at: 1 } };
    A.click({ act: 'availopen', id: 'g1' });
    check('a group with a place left can be joined', /1 of 2 places left/.test(sheet(A)), true);
    A.click({ act: 'slotbook', id: 'g1', v: '17:00', pid: 'p1' });
    check('joining writes no new session', A.sessById(sid).by, 'gran');
    check('takes the next seat', A.seatsOf(sid).map(x => x.n).sort().join(), 's1,s2');
    check('and books her child on it', A.bookOf(sid, 'p1').seat, 's2');
    check('then the group is full', A.blockSlots(A.blockById('g1')).find(x => x.start === '17:00').free, false);
    A.click({ act: 'slotbook', id: 'g1', v: '17:00', pid: 'p1' });
    check('and booking again says she is in', /already in/.test(A.lastToast()), true);
    A.ui.view = 'mycal'; A.render();
    check('her calendar has it, without the other child', /Rosa/.test(A.rendered()) || /Finishing|session/i.test(A.rendered()), true);
    check('no other child\'s name there', /Ella/.test(A.rendered()), false);
  }
  {
    as('mum2'); putBlock('b1', { ages: [10, 11] }); A.render();
    check('times outside her child\'s age are not offered', /Book a time with a coach/.test(A.rendered()), false);
    as('mum2'); putBlock('b2');
    A.state.teams.t2.events.e2 = { id: 'e2', kind: 'practice', date: day(3), start: '17:00', end: '18:00' };
    const kid = A.blockKids(A.blockById('b2'))[0];
    const sl = A.blockSlots(A.blockById('b2'));
    check('her child\'s own practice is spotted', A.kidBusy(A.blockById('b2'), sl[0], kid).length, 1);
    A.click({ act: 'availopen', id: 'b2' });
    check('and that slot is not offered to her', (sheet(A).match(/data-act="slotpick"/g) || []).length, 1);
    check('saying why', /Uma has G13 Storm/.test(sheet(A)), true);
  }

  console.log('\n--- my calendar ---');
  {
    as('mum');
    A.state.teams.t1.events.e1 = { id: 'e1', kind: 'practice', date: day(2), start: '18:00', end: '19:00', title: 'Practice' };
    A.state.teams.t2.events.e2 = { id: 'e2', kind: 'practice', date: day(2), start: '18:00', title: 'Storm practice' };
    const sid = A.slotSid('jaz', day(3), '18:00');
    A.sess.sessions[sid] = slotSess(sid);
    A.sess.booked[sid] = { p1: { tid: 't1', st: 'in', by: 'mum', at: 1, seat: 's1' } };
    A.sess.sessions.sx = { id: 'sx', kind: 'one', title: 'Another 1-1', coach: 'jaz', date: day(3), start: '09:00', end: '10:00', cap: 1 };
    A.sess.booked.sx = { p0: { tid: 't1', st: 'in', by: 'jaz', at: 1 } };
    const keys = A.myCalItems().map(x => x.key);
    check('her child\'s team practice', keys.includes('e:e1'), true);
    check('and her child\'s 1-1', keys.includes('s:' + sid), true);
    check('not another team\'s', keys.includes('e:e2'), false);
    check('nor another child\'s session', keys.includes('s:sx'), false);
    A.ui.view = 'mycal'; A.render();
    check('it draws', /My calendar/.test(A.rendered()) && /1-1 session with Jaz/.test(A.rendered()), true);
    check('with no other child\'s name', /Ella|Another 1-1/.test(A.rendered()), false);
    check('the club page has the card', (A.ui.view = 'club', A.render(), /<b>My calendar<\/b>/.test(A.rendered())), true);
    check('and it says what is next', /Next: Practice/.test(A.rendered()), true);
  }
  {
    as('jaz'); putBlock('b1');
    A.sess.sessions.s5 = { id: 's5', kind: 'group', title: 'Finishing', coach: 'jaz', date: day(5), start: '17:00', end: '18:00', cap: 4 };
    A.sess.sessions.s6 = { id: 's6', kind: 'group', title: 'Olu’s group', coach: 'other', date: day(5), start: '17:00', end: '18:00', cap: 4 };
    A.state.teams.t1.events.e1 = { id: 'e1', kind: 'practice', date: day(2), start: '18:00', title: 'Practice' };
    A.state.teams.t2.events.e2 = { id: 'e2', kind: 'practice', date: day(2), start: '18:00', title: 'Storm practice' };
    const keys = A.myCalItems().map(x => x.key);
    check('a coach sees her team', keys.includes('e:e1'), true);
    check('not one she does not coach', keys.includes('e:e2'), false);
    check('the sessions she runs', keys.includes('s:s5'), true);
    check('not another coach\'s', keys.includes('s:s6'), false);
    check('and her bookable times', keys.includes('a:b1'), true);
    A.ui.view = 'mycal'; A.render();
    check('drawn with the times', /1-1s until 7pm/.test(A.rendered()), true);
    A.state.teams.t1.players.p1.guardians = { jaz: true };
    check('a coach who is also a parent can narrow it', A.myCalFilters().map(([k]) => k).join(), 'all,p:p1,me');
    A.ui.myCal = 'p:p1';
    check('to her child\'s', A.myCalItems().some(x => x.kind === 'avail'), false);
  }
  {
    as('boss');
    check('an admin who works no team sees the club\'s teams', A.myCalTeams().sort().join(), 't1,t2');
    A.ui.view = 'mycal'; A.render();
    check('and it draws', /My calendar/.test(A.rendered()), true);
  }
  {
    as('jaz');
    A.ui.view = 'mycal';
    check('it has its own address', A.uiToHash(), '#/my-calendar');
  }

  console.log('\n--- never public ---');
  {
    as('jaz'); putBlock('b1', { place: 'Secret Park' });
    A.state.teams.t1.share = 'sh1';
    const pub = JSON.stringify([A.publicDoc(A.state.teams.t1), A.calendarDoc(A.state.teams.t1)]);
    check('the season page and the calendar feed carry no bookable times', /Secret Park|Bookable/.test(pub), false);
  }

  /* ---------- against the fake database ---------- */

  async function device(uid, extra = {}) {
    const fbk = makeFakebase();
    const D = H.loadApp({ firebase: fbk, config: CONFIG, storage: { 'sm.workspace': CODE } });
    await D.flush();
    fbk.signIn(uid, { name: (club().access.members[uid] || {}).name || uid }); await D.flush();
    fbk.deliver('.info/connected', extra.online !== false);
    fbk.deliver(WS, club()); await D.flush();
    D.render();
    return { D, fbk };
  }
  async function load(D, fbk, v = {}) {
    for (const k of ['avail', 'sessions', 'booked', 'seats', 'came']) fbk.deliver(TR + k, v[k] || {});
    await D.flush();
  }
  const written = (fbk, p) => { const w = fbk.writtenTo(p); return w.length ? w[w.length - 1].value : undefined; };
  const remote = { b1: block('b1') };
  const SID = 'k_jaz_' + day(3) + '_1800';

  console.log('\n--- what each phone listens to ---');
  {
    const { fbk } = await device('mum');
    check('a family reads the coaches\' times', fbk.watching(TR + 'avail'), true);
    check('and who holds which seat', fbk.watching(TR + 'seats'), true);
  }
  {
    const { fbk } = await device('trk');
    check('a tracker reads neither', fbk.watching(TR + 'avail') || fbk.watching(TR + 'seats'), false);
  }

  console.log('\n--- booking, against the database ---');
  {
    const { D, fbk } = await device('mum');
    await load(D, fbk, { avail: remote });
    D.click({ act: 'availopen', id: 'b1' });
    D.click({ act: 'slotpick', id: 'b1', v: '18:00' });
    D.dom.node('#slotWant').value = 'Weak foot';
    D.click({ act: 'slotbook', id: 'b1', v: '18:00', pid: 'p1' });
    await D.flush();
    const s = written(fbk, TR + 'sessions/' + SID);
    check('the slot is a session under the id its time gives it', !!s, true);
    check('the same id the rule builds', D.slotSid('jaz', day(3), '18:00'), SID);
    check('a 1-1, closed to asks', s && s.kind === 'one' && s.cap === 1 && s.open === false, true);
    check('naming the block, her child, and her', s && [s.slot, s.pid, s.tid, s.by].join(), 'b1,p1,t1,mum');
    check('at the start the block lists, to the millisecond', s && s.t0, remote.b1.slots.t1800.at);
    check('and the block\'s price and notice, exactly', s && s.price === 30 && s.notice === 24, true);
    check('inside the window', s && s.start === '18:00' && s.end === '19:00', true);
    const seat = written(fbk, TR + 'seats/' + SID + '/s1');
    check('then the seat', seat && seat.pid + seat.by, 'p1mum');
    const b = written(fbk, TR + 'booked/' + SID + '/p1');
    check('then her child is in it, on that seat', b && b.st + b.seat, 'ins1');
    check('with what she wants to work on', b && b.want, 'Weak foot');
    const order = fbk.record.writes.map(w => w.path);
    const at = p => order.indexOf(TR + p);
    check('session, seat, booking: the order the rules need', at('sessions/' + SID) < at('seats/' + SID + '/s1') && at('seats/' + SID + '/s1') < at('booked/' + SID + '/p1'), true);
    check('never a whole collection', fbk.writtenTo(TR + 'sessions').length + fbk.writtenTo(TR + 'booked/' + SID).length + fbk.writtenTo(TR + 'seats/' + SID).length, 0);
    check('the slot is no longer free', D.blockSlots(D.blockById('b1')).find(x => x.start === '18:00').free, false);
    check('and it is on her calendar', D.myCalItems().some(x => x.key === 's:' + SID), true);
    check('nothing is left owed', Object.keys(D.sess.dirty).length, 0);
  }
  {
    const { D, fbk } = await device('mum');
    await load(D, fbk, { avail: remote });
    fbk.record.refuse = p => /\/(sessions|seats|booked)\//.test(p);
    D.click({ act: 'slotbook', id: 'b1', v: '18:00', pid: 'p1' });
    await D.flush();
    check('a time somebody just took is taken back off her screen', D.sessById(SID), null);
    check('her seat and booking too', D.seatsOf(SID).length + (D.bookOf(SID, 'p1') ? 1 : 0), 0);
    check('and she is told to pick another', /Pick another/.test(D.lastToast()), true);
    check('nothing is left owed', Object.keys(D.sess.dirty).length, 0);
  }
  {
    const { D, fbk } = await device('mum', { online: false });
    await load(D, fbk, { avail: remote });
    D.click({ act: 'slotbook', id: 'b1', v: '18:00', pid: 'p1' });
    await D.flush();
    check('offline, nothing is sent', fbk.record.writes.some(w => /\/(sessions|seats|booked)\//.test(w.path)), false);
  }
  {
    const { D, fbk } = await device('mum');
    const g = { g1: group('g1') }, G = 'k_jaz_' + day(3) + '_1700';
    await load(D, fbk, {
      avail: g, sessions: { [G]: slotSess(G, { kind: 'group', cap: 2, slot: 'g1', start: '17:00', end: '18:00', pid: 'p0', by: 'gran' }) },
      booked: { [G]: { p0: { tid: 't1', st: 'in', by: 'gran', at: 1, seat: 's1' } } }, seats: { [G]: { s1: { pid: 'p0', tid: 't1', by: 'gran', at: 1 } } }
    });
    fbk.record.writes.length = 0;
    D.click({ act: 'slotbook', id: 'g1', v: '17:00', pid: 'p1' });
    await D.flush();
    check('joining a group writes no session', fbk.record.writes.some(w => w.path.startsWith(TR + 'sessions/')), false);
    check('just the next seat and the booking', fbk.record.writes.map(w => w.path.slice(TR.length)).join(), `seats/${G}/s2,booked/${G}/p1`);
  }

  console.log('\n--- cancelling, against the database ---');
  const mine = (extra = {}) => ({ [SID]: slotSess(SID, extra) });
  const myBooking = { [SID]: { p1: { tid: 't1', st: 'in', by: 'mum', at: 1, seat: 's1' } } };
  const mySeat = { [SID]: { s1: { pid: 'p1', tid: 't1', by: 'mum', at: 1 } } };
  {
    const { D, fbk } = await device('mum');
    await load(D, fbk, { avail: remote, sessions: mine(), booked: myBooking, seats: mySeat });
    D.sheetSess(SID);
    check('her sheet offers to cancel it', /data-act="slotcancel"/.test(sheet(D)), true);
    fbk.record.writes.length = 0;
    D.click({ act: 'slotcancel', id: SID, pid: 'p1' });
    await D.flush();
    const order = fbk.record.writes.map(w => w.path.slice(TR.length));
    check('booking, seat, then the slot: the order the rules need', order.join(), `booked/${SID}/p1,seats/${SID}/s1,sessions/${SID}`);
    check('all deleted', fbk.record.writes.every(w => w.value === null), true);
    check('free on her screen', D.blockSlots(D.blockById('b1')).find(x => x.start === '18:00').free, true);
  }
  {
    const { D, fbk } = await device('mum');
    const G = SID;
    await load(D, fbk, {
      avail: { g1: group('g1') }, sessions: { [G]: slotSess(G, { kind: 'group', cap: 2, slot: 'g1', pid: 'p0', by: 'gran' }) },
      booked: { [G]: { p0: { tid: 't1', st: 'in', by: 'gran', at: 1, seat: 's1' }, p1: { tid: 't1', st: 'in', by: 'mum', at: 2, seat: 's2' } } },
      seats: { [G]: { s1: { pid: 'p0', tid: 't1', by: 'gran', at: 1 }, s2: { pid: 'p1', tid: 't1', by: 'mum', at: 2 } } }
    });
    fbk.record.writes.length = 0;
    D.click({ act: 'slotcancel', id: G, pid: 'p0' });
    check('another child\'s place is not hers to cancel', fbk.record.writes.length, 0);
    D.click({ act: 'slotcancel', id: G, pid: 'p1' });
    await D.flush();
    check('her own, in a group, leaves the group standing', fbk.record.writes.map(w => w.path.slice(TR.length)).join(), `booked/${G}/p1,seats/${G}/s2`);
  }
  {
    const { D, fbk } = await device('mum');
    await load(D, fbk, { avail: remote, sessions: mine({ date: TODAY, start: '23:00', end: '23:59' }), booked: myBooking, seats: mySeat });
    fbk.record.writes.length = 0;
    D.click({ act: 'slotcancel', id: SID, pid: 'p1' });
    check('inside the notice, she is sent to the coach', /message the coach/.test(D.lastToast()), true);
    check('and nothing is written', fbk.record.writes.length, 0);
  }

  console.log('\n--- the coach hears, and her phone keeps the lists ---');
  {
    const { D, fbk } = await device('jaz');
    await load(D, fbk, { avail: remote });
    fbk.deliver(TR + 'sessions', mine()); fbk.deliver(TR + 'seats', mySeat); fbk.deliver(TR + 'booked', myBooking); await D.flush();
    check('a family booking one of her times', /Booked a time/.test(D.toasts.join('|')), true);
    fbk.deliver(TR + 'booked', {}); fbk.deliver(TR + 'seats', {}); fbk.deliver(TR + 'sessions', {}); await D.flush();
    check('and cancelling it', /Cancelled a time/.test(D.lastToast() || ''), true);
    check('naming the child to her coach', /Rosa/.test(D.lastToast() || ''), true);
  }
  {
    const { D, fbk } = await device('jaz');
    await load(D, fbk, { avail: remote });
    fbk.record.writes.length = 0;
    const ws = club(); ws.teams.t1.events = { e1: { id: 'e1', kind: 'practice', date: day(3), start: '18:00', end: '19:00' } };
    D.state.teams.t1.events = ws.teams.t1.events;
    D.healBlocks(); await D.flush();
    const w = written(fbk, TR + 'avail/b1');
    check('a practice added to her team takes the slot off the list at the club', w && Object.keys(w.slots).join(), 't1700');
  }
  {
    const { D, fbk } = await device('jaz');
    await load(D, fbk, {});
    fbk.record.writes.length = 0;
    D.click({ act: 'availnew' });
    fill(D, { avDate: day(3), avStart: '17:00', avEnd: '19:00', avField: '', avPlace: '', avPrice: '', avLo: '', avHi: '', avNote: '', avUntil: day(10), avCoach: '' });
    D.click({ act: 'availsave' });
    await D.flush();
    const ws = fbk.record.writes.filter(w => w.path.startsWith(TR + 'avail'));
    check('offering times writes each week at its own path', ws.length === 2 && ws.every(w => /^training\/CLUB\/avail\/\w+$/.test(w.path)), true);
    check('each carrying its slots and seats', ws.every(w => w.value.slots && w.value.slots.t1700 && w.value.seats.s1), true);
    check('and they reach the club', Object.keys(D.sess.dirty).length, 0);
  }

  H.summary('bookable times and my calendar');
})();
