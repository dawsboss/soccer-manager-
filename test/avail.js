/* Bookable times, and My calendar. AVAILABILITY.md is the design. What is
   easy to get quietly wrong, and so is pinned here:

   - Only a coach (her own times) or an admin (anyone's) offers or changes
     times, checked in the click handler, not only by what the screen draws.
   - A block is 1-1s or a small group; it carries its own midnight (`day0`),
     which only the coach's phone knows, so the server can time each slot.
     The lists the old rules read (`slots`, `seats`) are written no more.
   - A coach's team calendar is her busy time: a practice for a team she
     coaches, or a session she runs, takes out the slots it overlaps on the
     screen; the server checks the same, and more, when a family asks.
   - A family books a free place for her own child only, by asking the
     server (bookAsks), never by writing a session or a booking herself. It
     needs a signal; the server's no is said in words. A full slot offers
     its waiting list.
   - Her child's own team practice is never booked over.
   - She cancels her own child's place, or her place on the waiting list,
     the same way, not another child's, not inside the notice.
   - She never sees another child's name. Times never reach public/.
   - My calendar is the person's: her teams, her children's, her sessions and
     her times, and nobody else's. */

const H = require('./harness');
const { check } = H;
const { makeFakebase, makeServer } = require('./fakebase');
const book = require('../functions/book');

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
/* The two lists the old rules read, as a window from before the server
   booked carries them: every slot on the grid, and a seat per place. */
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
  A.sess = { sessions: {}, booked: {}, came: {}, fees: {}, pay: {}, splans: {}, avail: {}, dirty: {} };
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
    check('written with this phone\'s midnight that day, for the server to time slots by', raw.day0 + 18 * 3600000, A.slotAt(day(3), '18:00'));
    check('and none of the lists the old rules read', raw.slots === undefined && raw.seats === undefined, true);
    check('each week one write, at its own path', Object.keys(A.sess.dirty).every(p => /^avail\/[\w]+$/.test(p)), true);

    A.click({ act: 'availnew' });
    A.click({ act: 'availkind', v: 'group' });
    fill(A, { avTitle: 'Finishing group', avCap: '6', avDate: day(4), avStart: '10:00', avEnd: '11:00', avUntil: '' });
    A.click({ act: 'availrepeat', v: '0' });
    fill(A, { avTitle: 'Finishing group', avCap: '6', avDate: day(4), avStart: '10:00', avEnd: '11:00' });
    A.click({ act: 'availsave' });
    const g = A.blockAll().find(b => b.date === day(4));
    check('a small group too', g && g.kind + ' ' + g.cap + ' ' + g.title, 'group 6 Finishing group');

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
    check('and the old lists leave the block when it is written', A.sess.avail.b1.slots === undefined && A.sess.avail.b1.seats === undefined, true);
  }

  console.log('\n--- synced with the teams\' calendars ---');
  {
    as('jaz'); putBlock('b1');
    A.state.teams.t1.events.e1 = { id: 'e1', kind: 'practice', date: day(3), start: '18:00', end: '19:00', venue: 'Hill End' };
    const sl = A.blockSlots(A.blockById('b1'));
    check('a practice of a team she coaches takes out its slot', sl.find(x => x.start === '18:00').free, false);
    check('and says why', /G11 Flight/.test(sl.find(x => x.start === '18:00').clash[0].label), true);
    check('the rest stays free', sl.find(x => x.start === '17:00').free, true);
    delete A.state.teams.t1.events.e1;
    check('the practice gone, the slot comes back', A.blockSlots(A.blockById('b1')).find(x => x.start === '18:00').free, true);
    A.state.teams.t2.events.e2 = { id: 'e2', kind: 'practice', date: day(3), start: '17:00', end: '18:00' };
    check('another team\'s practice does not take a slot', A.blockSlots(A.blockById('b1')).find(x => x.start === '17:00').free, true);
    A.sess.sessions.s9 = { id: 's9', kind: 'group', coach: 'jaz', date: day(3), start: '17:30', end: '18:30', cap: 4 };
    check('a session she runs does, once it overlaps', A.blockSlots(A.blockById('b1')).find(x => x.start === '17:00').free, false);
    putBlock('b0', { date: day(-1) });
    check('a past day offers nothing', A.blockSlots(A.blockById('b0')).some(x => x.free), false);
    check('nothing about a block is written for it: the server reads the calendar itself', Object.keys(A.sess.dirty).length, 0);
  }
  {
    as('jaz'); putBlock('b1');
    const sid = A.slotSid('jaz', day(3), '17:00');
    A.sess.sessions[sid] = slotSess(sid, { start: '17:00', end: '18:00' });
    A.sess.booked[sid] = { p1: { tid: 't1', st: 'in', by: 'mum', at: 1 } };
    A.sess.dirty = {};
    A.click({ act: 'sessbook', id: sid, pid: 'p1', v: 'out' });
    check('taking a player off her slot is one write, the booking', Object.keys(A.sess.dirty).join(), 'booked/' + sid + '/p1');
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
    check('and booked', A.bookOf(sid, 'p1').st, 'in');
    check('the slot is no longer free', A.blockSlots(A.blockById('b1')).find(x => x.start === '18:00').free, false);

    as('mum'); putBlock('b1');
    const sid2 = A.slotSid('jaz', day(3), '17:00');
    A.sess.sessions[sid2] = slotSess(sid2, { start: '17:00', end: '18:00', pid: 'p0', by: 'gran' });
    A.sess.booked[sid2] = { p0: { tid: 't1', st: 'in', by: 'gran', at: 1 } };
    A.render();
    A.click({ act: 'availopen', id: 'b1' });
    check('another family\'s 1-1 says taken', /Taken/.test(sheet(A)), true);
    check('without her child\'s name', /Ella/.test(sheet(A) + A.rendered()), false);
    check('the free one can be booked', (sheet(A).match(/data-act="slotpick" data-id="b1" data-v="18:00">/g) || []).length, 1);
    check('and the taken one waited for', /data-act="slotpick" data-id="b1" data-v="17:00" data-wait="1"/.test(sheet(A)), true);
    A.click({ act: 'slotpick', id: 'b1', v: '17:00', wait: '1' });
    check('which says what the waiting list is', /Waiting list for 5pm/.test(sheet(A)) && /data-wait="1"/.test(sheet(A)), true);
    A.ui.view = 'mycal'; A.render();
    check('nor is that child on her calendar', /Ella/.test(A.rendered()), false);
  }
  {
    as('mum'); putGroup('g1');
    const sid = A.slotSid('jaz', day(3), '17:00');
    A.sess.sessions[sid] = slotSess(sid, { kind: 'group', cap: 2, start: '17:00', end: '18:00', slot: 'g1', pid: 'p0', by: 'gran' });
    A.sess.booked[sid] = { p0: { tid: 't1', st: 'in', by: 'gran', at: 1 } };
    A.click({ act: 'availopen', id: 'g1' });
    check('a group with a place left can be joined', /1 of 2 places left/.test(sheet(A)), true);
    A.click({ act: 'slotbook', id: 'g1', v: '17:00', pid: 'p1' });
    check('joining writes no new session', A.sessById(sid).by, 'gran');
    check('and books her child into it', A.bookOf(sid, 'p1').st, 'in');
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
    A.sess.booked[sid] = { p1: { tid: 't1', st: 'in', by: 'mum', at: 1 } };
    A.sess.sessions.sx = { id: 'sx', kind: 'one', title: 'Another 1-1', coach: 'jaz', date: day(3), start: '09:00', end: '10:00', cap: 1 };
    A.sess.booked.sx = { p0: { tid: 't1', st: 'in', by: 'jaz', at: 1 } };
    const keys = A.myCalItems().map(x => x.key);
    check('her child\'s team practice', keys.includes('e:e1'), true);
    check('and her child\'s 1-1', keys.includes('s:' + sid), true);
    check('not another team\'s', keys.includes('e:e2'), false);
    check('nor another child\'s session', keys.includes('s:sx'), false);
    A.ui.view = 'mycal'; A.render();
    // one child on one team: My calendar is her team's calendar, so there is one calendar and no choice to make
    check('it draws, on the one calendar', A.ui.view + ' ' + /1-1 session with Jaz/.test(A.rendered()), 'calendar true');
    check('with no other child\'s name', /Ella|Another 1-1/.test(A.rendered()), false);
    check('the club page has the card', (A.ui.view = 'club', A.render(), /<b>Calendar<\/b>/.test(A.rendered())), true);
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
    check('her own calendar, with All teams beside it', A.calSels().join() + ' ' + A.calSel(), 'mine,club mine');
    A.state.teams.t1.players.p1.guardians = { jaz: true };
    check('a coach who is also a parent can narrow it', A.myCalFilters().map(([k]) => k).join(), 'all,p:p1,me');
    A.ui.myCal = 'p:p1';
    check('to her child\'s', A.myCalItems().some(x => x.kind === 'avail'), false);
  }
  {
    as('boss');
    // the club's whole schedule is All teams'; My calendar is only ever hers
    check('an admin who works no team has none of the club\'s teams on hers', A.myCalTeams().join(), '');
    A.ui.view = 'mycal'; A.render();
    check('and the Calendar draws, as the club\'s', A.ui.view + ' ' + A.calSels().includes('mine'), 'calendar false');
    check('offering her every team', A.calSel() + ' ' + /data-act="caltog" data-g="all"/.test((A.click({ act: 'caltree' }), A.rendered())), 'club true');
  }
  {
    as('jaz'); putBlock('b1');
    A.ui.view = 'mycal';
    check('it has its own address, the Calendar\'s', A.uiToHash(), '#/calendar');
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
    await fbk.serveClub(CODE, club(), D.flush); await D.flush();
    D.render();
    return { D, fbk };
  }
  async function load(D, fbk, v = {}) {
    for (const k of ['avail', 'sessions', 'booked', 'came']) fbk.deliver(TR + k, v[k] || {});
    await D.flush();
  }
  const written = (fbk, p) => { const w = fbk.writtenTo(p); return w.length ? w[w.length - 1].value : undefined; };
  const remote = { b1: block('b1') };
  const SID = 'k_jaz_' + day(3) + '_1800';

  /* The club's server, answering this phone's last ask with functions/book.js
     as deployed, on the harness clock, over what the club holds; what it
     writes then reaches the phone the way the club's copy does. */
  async function answer(D, fbk, training) {
    const asks = fbk.record.writes.filter(w => /^bookAsks\//.test(w.path) && w.value);
    const w = asks[asks.length - 1];
    if (!w) return { ans: null, S: null };
    const S = makeServer({ workspaces: { [CODE]: club() }, training: { [CODE]: JSON.parse(JSON.stringify(training)) } });
    const env = {
      get: p => S.ref(p).get().then(x => x.val()), set: (p, v) => S.ref(p).set(v), remove: p => S.ref(p).remove(),
      claim: (p, fn) => S.ref(p).transaction(fn).then(r => !!r.committed),
      dated: (p, d) => S.ref(p).orderByChild('date').equalTo(d).get().then(x => x.val()),
      now: () => D.nowMs()
    };
    const [, code, uid, id] = w.path.split('/');
    S.put(w.path, w.value);   // the ask as it reached the club
    await book.onAsk(env, { code, uid, id }, w.value);
    for (const k of ['sessions', 'booked']) fbk.deliver(TR + k, S.at(TR + k) || {});
    await D.flush();
    const ans = S.at(w.path + '/answer');
    fbk.deliver(w.path + '/answer', ans);
    await D.flush();
    return { ans, S, ask: w };
  }
  const askOf = fbk => fbk.record.writes.filter(w => /^bookAsks\//.test(w.path)).pop();
  const ownWrites = fbk => fbk.record.writes.filter(w => w.path.startsWith(TR) && !w.path.startsWith(TR + 'avail'));

  console.log('\n--- what each phone listens to ---');
  {
    const { fbk } = await device('mum');
    check('a family reads the coaches\' times', fbk.watching(TR + 'avail'), true);
    check('and asks nothing about seats, which are gone', fbk.watching(TR + 'seats'), false);
  }
  {
    const { fbk } = await device('trk');
    check('a tracker reads none of it', fbk.watching(TR + 'avail'), false);
  }

  console.log('\n--- booking: one ask, the server answers ---');
  {
    const { D, fbk } = await device('mum');
    await load(D, fbk, { avail: remote });
    D.click({ act: 'availopen', id: 'b1' });
    D.click({ act: 'slotpick', id: 'b1', v: '18:00' });
    D.dom.node('#slotWant').value = 'Weak foot';
    D.click({ act: 'slotbook', id: 'b1', v: '18:00', pid: 'p1' });
    await D.flush();
    const ask = askOf(fbk);
    check('she asks the server, under her own account', !!ask && ask.path.startsWith('bookAsks/CLUB/mum/'), true);
    check('for the slot, her child and what she wants', ask && [ask.value.op, ask.value.block, ask.value.start, ask.value.pid, ask.value.tid, ask.value.want].join(), 'book,b1,18:00,p1,t1,Weak foot');
    check('stamped now', ask && ask.value.at, D.nowMs());
    check('and writes no session, booking or seat herself', ownWrites(fbk).length, 0);
    check('while it is asked, the sheet says so', /Booking…/.test(sheet(D)), true);
    check('listening for the answer beneath the ask', fbk.watching(ask.path + '/answer'), true);
    const { ans, S } = await answer(D, fbk, { avail: remote });
    check('the server books her child', ans && ans.ok && ans.st, 'in');
    const s = S.at(TR + 'sessions/' + SID);
    check('the slot is a session under the id its time gives it', !!s, true);
    check('the same id the app gives it', D.slotSid('jaz', day(3), '18:00'), SID);
    check('a 1-1, closed to asks', s && s.kind === 'one' && s.cap === 1 && s.open === false, true);
    check('naming the block, her child, and her', s && [s.slot, s.pid, s.tid, s.by].join(), 'b1,p1,t1,mum');
    check('at the start the block lists, to the millisecond', s && s.t0, remote.b1.slots.t1800.at);
    check('with the block\'s price and notice', s && s.price === 30 && s.notice === 24, true);
    const bk = S.at(TR + 'booked/' + SID + '/p1');
    check('her child in it, with what she wants to work on', bk && bk.st + ' ' + bk.want, 'in Weak foot');
    check('her phone says so', /Booked: Rosa/.test(D.lastToast()), true);
    check('the slot is no longer free on her screen', D.blockSlots(D.blockById('b1')).find(x => x.start === '18:00').free, false);
    check('and it is on her calendar', D.myCalItems().some(x => x.key === 's:' + SID), true);
    check('the ask is cleared away once answered', fbk.record.removes.includes(ask.path), true);
    check('nothing is left owed', Object.keys(D.sess.dirty).length, 0);
  }
  {
    const { D, fbk } = await device('gran');
    const held = { avail: remote, sessions: { [SID]: slotSess(SID, { t0: remote.b1.slots.t1800.at }) }, booked: { [SID]: { p1: { tid: 't1', st: 'in', by: 'mum', at: 1 } } } };
    await load(D, fbk, held);
    D.click({ act: 'availopen', id: 'b1' });
    check('a taken 1-1 offers another family its waiting list', /data-v="18:00" data-wait="1"/.test(sheet(D)), true);
    D.click({ act: 'slotbook', id: 'b1', v: '18:00', pid: 'p0', wait: '1' });
    await D.flush();
    check('asking for the waiting list', askOf(fbk).value.wait, true);
    const { ans } = await answer(D, fbk, held);
    check('the server puts her child on it', ans && ans.st, 'wait');
    check('and her phone says what that means', /waiting list.*place comes free/.test(D.lastToast()), true);
    D.sheetSess(SID);
    check('her sheet offers to leave it', /Leave the waiting list/.test(sheet(D)), true);
    check('and never names the child who has the place', /Rosa/.test(sheet(D) + D.rendered()), false);
  }
  {
    const { D, fbk } = await device('mum');
    await load(D, fbk, { avail: remote });
    D.click({ act: 'slotbook', id: 'b1', v: '18:00', pid: 'p1' });
    await D.flush();
    // the coach's time off is hers and the admins', never on a family's phone: the server knows it
    const { ans } = await answer(D, fbk, { avail: remote, away: { jaz: { d: { id: 'd', kind: 'dates', from: day(3), to: day(3), by: 'jaz', at: 1 } } } });
    check('the server says no when the coach is not free after all', ans && ans.why, 'busy');
    check('and she is told, in words', /not free then/.test(D.lastToast()), true);
    check('nothing booked on her screen', D.sessById(SID), null);
  }
  {
    const { D, fbk } = await device('mum');
    await load(D, fbk, { avail: remote });
    fbk.record.refuse = p => /^bookAsks\//.test(p);
    D.click({ act: 'slotbook', id: 'b1', v: '18:00', pid: 'p1' });
    await D.flush();
    check('a refused ask says the rules may be behind', new RegExp('version ' + D.RULES_VERSION).test(D.lastToast()), true);
    check('and nothing is written to the club', ownWrites(fbk).length, 0);
    check('no answer at all is said as that, not as a no', /No answer from the club yet/.test(D.bookWhy(null)), true);
  }
  {
    const { D, fbk } = await device('mum', { online: false });
    await load(D, fbk, { avail: remote });
    D.click({ act: 'slotbook', id: 'b1', v: '18:00', pid: 'p1' });
    await D.flush();
    check('offline, nothing is asked: first come, first served needs a signal', fbk.record.writes.some(w => /^bookAsks\//.test(w.path)), false);
    check('and she is told why', /needs a signal/.test(D.lastToast()), true);
  }
  {
    const { D, fbk } = await device('mum');
    const g = { g1: group('g1') }, G = 'k_jaz_' + day(3) + '_1700';
    const held = {
      avail: g, sessions: { [G]: slotSess(G, { kind: 'group', cap: 2, slot: 'g1', start: '17:00', end: '18:00', pid: 'p0', by: 'gran', t0: g.g1.slots.t1700.at }) },
      booked: { [G]: { p0: { tid: 't1', st: 'in', by: 'gran', at: 1 } } }
    };
    await load(D, fbk, held);
    D.click({ act: 'slotbook', id: 'g1', v: '17:00', pid: 'p1' });
    await D.flush();
    const { ans, S } = await answer(D, fbk, held);
    check('joining a group: the server books her into the one already there', ans && ans.ok && ans.sid, G);
    check('the session still the first family\'s', S.at(TR + 'sessions/' + G).by, 'gran');
    check('two in it now', Object.values(S.at(TR + 'booked/' + G)).filter(x => x.st === 'in').length, 2);
  }

  console.log('\n--- cancelling: the same way ---');
  const mine = (extra = {}) => ({ [SID]: slotSess(SID, { t0: remote.b1.slots.t1800.at, ...extra }) });
  const myBooking = { [SID]: { p1: { tid: 't1', st: 'in', by: 'mum', at: 1 } } };
  {
    const { D, fbk } = await device('mum');
    const held = { avail: remote, sessions: mine(), booked: myBooking };
    await load(D, fbk, held);
    D.sheetSess(SID);
    check('her sheet offers to cancel it', /data-act="slotcancel"/.test(sheet(D)), true);
    fbk.record.writes.length = 0;
    D.click({ act: 'slotcancel', id: SID, pid: 'p1' });
    await D.flush();
    const ask = askOf(fbk);
    check('she asks the server to cancel', ask && [ask.value.op, ask.value.sid, ask.value.pid].join(), `cancel,${SID},p1`);
    check('writing nothing to the club herself', ownWrites(fbk).length, 0);
    const { ans, S } = await answer(D, fbk, held);
    check('the server takes her place off', ans && ans.ok && S.at(TR + 'booked/' + SID), null);
    check('and the slot, with nobody left in it', S.at(TR + 'sessions/' + SID), null);
    check('free again on her screen', D.blockSlots(D.blockById('b1')).find(x => x.start === '18:00').free, true);
    check('and she is told', /Cancelled/.test(D.lastToast()), true);
  }
  {
    const { D, fbk } = await device('mum');
    const G = SID;
    await load(D, fbk, {
      avail: { g1: group('g1') }, sessions: { [G]: slotSess(G, { kind: 'group', cap: 2, slot: 'g1', pid: 'p0', by: 'gran' }) },
      booked: { [G]: { p0: { tid: 't1', st: 'in', by: 'gran', at: 1 }, p1: { tid: 't1', st: 'in', by: 'mum', at: 2 } } }
    });
    fbk.record.writes.length = 0;
    D.click({ act: 'slotcancel', id: G, pid: 'p0' });
    check('another child\'s place is not hers to cancel: nothing is even asked', fbk.record.writes.length, 0);
  }
  {
    const { D, fbk } = await device('mum');
    await load(D, fbk, { avail: remote, sessions: mine({ date: TODAY, start: '23:00', end: '23:59', t0: undefined }), booked: myBooking });
    fbk.record.writes.length = 0;
    D.click({ act: 'slotcancel', id: SID, pid: 'p1' });
    check('inside the notice, she is sent to the coach', /message the coach/.test(D.lastToast()), true);
    check('and nothing is asked', fbk.record.writes.length, 0);
  }

  console.log('\n--- the coach hears ---');
  {
    const { D, fbk } = await device('jaz');
    await load(D, fbk, { avail: remote });
    fbk.deliver(TR + 'sessions', mine()); fbk.deliver(TR + 'booked', myBooking); await D.flush();
    check('a family booking one of her times', /Booked a time/.test(D.toasts.join('|')), true);
    fbk.deliver(TR + 'booked', {}); fbk.deliver(TR + 'sessions', {}); await D.flush();
    check('and cancelling it', /Cancelled a time/.test(D.lastToast() || ''), true);
    check('naming the child to her coach', /Rosa/.test(D.lastToast() || ''), true);
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
    check('each carrying its midnight, and no lists for the old rules', ws.every(w => typeof w.value.day0 === 'number' && !w.value.slots && !w.value.seats), true);
    check('and they reach the club', Object.keys(D.sess.dirty).length, 0);
  }

  H.summary('bookable times and my calendar');
})();
