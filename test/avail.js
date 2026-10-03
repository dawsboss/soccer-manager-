/* Bookable times, and My calendar. AVAILABILITY.md is the design. What is
   easy to get quietly wrong, and so is pinned here:

   - Only a coach (her own times) or an admin (anyone's) offers or changes
     times, checked in the click handler, not only by what the screen draws.
   - A coach's team calendar is her busy time: a practice for a team she
     coaches, or a session she runs, takes out the slots it overlaps.
   - A family books a free slot for her own child only, under the id the rule
     builds from the coach, the day and the start; the session and then the
     booking, each at its own path. It needs a signal, because it is first
     come, first served, and a refusal is taken back off the screen.
   - Her child's own team practice is never booked over.
   - She cancels her own slot (booking first, then the session, the order the
     rules need), never someone else's, and not inside the block's notice.
   - She never sees another child's name: not on the times, not on her
     calendar. Times never reach public/.
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
   family (t1, coached by Jaz); Pat is Uma's (t2, coached by Olu). */
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
function as(uid) {
  A.state = club();
  A.sess = { sessions: {}, booked: {}, came: {}, fees: {}, pay: {}, splans: {}, avail: {}, dirty: {} };
  A.me = uid ? { uid, name: (club().access.members[uid] || {}).name || uid } : null;
  A.appOwners = {};
  A.ui.view = 'sessions'; A.ui.sess = { tab: 'list' }; A.ui.teamId = 't1'; A.ui.myCal = 'all';
  A.toasts.length = 0;
  A.dom.node('#sheet').innerHTML = '';
}
const block = (id, extra = {}) => ({ id, coach: 'jaz', coachName: 'Jaz', date: day(3), start: '17:00', end: '19:00', len: 60, price: 30, notice: 24, place: 'Hill End', ...extra });
function putBlock(id, extra) { A.sess.avail[id] = block(id, extra); return id; }

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
    check('hour slots by default', mine[0].len, 60);
    check('cut into two slots', A.blockSlots(mine[0]).map(x => x.start).join(','), '17:00,18:00');
    check('both free', A.blockSlots(mine[0]).every(x => x.free), true);
    check('each week one write, at its own path', Object.keys(A.sess.dirty).every(p => /^avail\/[\w]+$/.test(p)), true);

    A.click({ act: 'availnew' });
    fill(A, { avDate: day(4), avStart: '17:00', avEnd: '17:30', avUntil: '' });
    A.click({ act: 'availrepeat', v: '0' });
    fill(A, { avDate: day(4), avStart: '17:00', avEnd: '17:30' });
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
    fill(A, { avDate: day(3), avStart: '09:00', avEnd: '10:00', avUntil: '', avCoach: 'jaz' });
    A.click({ act: 'availrepeat', v: '0' });
    fill(A, { avDate: day(3), avStart: '09:00', avEnd: '10:00', avCoach: 'jaz' });
    A.click({ act: 'availsave' });
    check('a coach offers only her own, whatever the form says', A.blockAll().filter(b => b.start === '09:00').map(b => b.coach).join(), 'other');
    as('boss'); putBlock('b1');
    A.click({ act: 'availoff', id: 'b1' });
    check('an admin takes a week off for any coach', A.blockById('b1').off, true);
    check('and nothing in it is free', A.blockSlots(A.blockById('b1')).some(x => x.free), false);
  }

  console.log('\n--- synced with the teams\' calendars ---');
  {
    as('jaz'); putBlock('b1');
    A.state.teams.t1.events.e1 = { id: 'e1', kind: 'practice', date: day(3), start: '18:00', end: '19:00', venue: 'Hill End' };
    const sl = A.blockSlots(A.blockById('b1'));
    check('a practice of a team she coaches takes out its slot', sl.find(x => x.start === '18:00').free, false);
    check('and says why', /G11 Flight/.test(sl.find(x => x.start === '18:00').clash[0].label), true);
    check('the rest stays free', sl.find(x => x.start === '17:00').free, true);
    A.state.teams.t2.events.e2 = { id: 'e2', kind: 'practice', date: day(3), start: '17:00', end: '18:00' };
    check('another team\'s practice does not', A.blockSlots(A.blockById('b1')).find(x => x.start === '17:00').free, true);
    A.sess.sessions.s9 = { id: 's9', kind: 'group', coach: 'jaz', date: day(3), start: '17:30', end: '18:30', cap: 4 };
    check('nor does a session she runs, once it overlaps', A.blockSlots(A.blockById('b1')).find(x => x.start === '17:00').free, false);
    putBlock('b0', { date: day(-1) });
    check('a past day offers nothing', A.blockSlots(A.blockById('b0')).some(x => x.free), false);
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
    check('on a phone with no club database it is kept here', (A.sessById(A.slotSid('jaz', day(3), '18:00')) || {}).pid, 'p1');

    as('mum'); putBlock('b1');
    const sid = A.slotSid('jaz', day(3), '17:00');
    A.sess.sessions[sid] = { id: sid, kind: 'one', coach: 'jaz', date: day(3), start: '17:00', end: '18:00', slot: 'b1', pid: 'p0', tid: 't1', by: 'gran', open: false, cap: 1 };
    A.sess.booked[sid] = { p0: { tid: 't1', st: 'in', by: 'gran', at: 1 } };
    A.render();
    A.click({ act: 'availopen', id: 'b1' });
    check('another family\'s slot says taken', /Taken/.test(sheet(A)), true);
    check('without her child\'s name', /Ella/.test(sheet(A) + A.rendered()), false);
    check('and only the free one can be booked', (sheet(A).match(/data-act="slotpick"/g) || []).length, 1);
    A.ui.view = 'mycal'; A.render();
    check('nor is that child on her calendar', /Ella/.test(A.rendered()), false);
  }
  {
    as('mum2'); putBlock('b1', { ages: [10, 11] }); A.render();
    check('times outside her child\'s age are not offered', /Book a time with a coach/.test(A.rendered()), false);
    as('mum2'); putBlock('b2', { coach: 'jaz' });
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
    A.sess.sessions[sid] = { id: sid, kind: 'one', coach: 'jaz', coachName: 'Jaz', date: day(3), start: '18:00', end: '19:00', slot: 'b1', pid: 'p1', tid: 't1', by: 'mum', open: false, cap: 1 };
    A.sess.booked[sid] = { p1: { tid: 't1', st: 'in', by: 'mum', at: 1 } };
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
    check('drawn with the times', /Bookable 1-1s until 7pm/.test(A.rendered()), true);
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
  const written = (fbk, p) => { const w = fbk.writtenTo(p); return w.length ? w[w.length - 1].value : undefined; };
  const remote = { b1: block('b1') };
  const SID = 'k_jaz_' + day(3) + '_1800';

  console.log('\n--- what each phone listens to ---');
  {
    const { fbk } = await device('mum');
    check('a family reads the coaches\' times', fbk.watching(TR + 'avail'), true);
  }
  {
    const { fbk } = await device('trk');
    check('a tracker does not', fbk.watching(TR + 'avail'), false);
  }

  console.log('\n--- booking, against the database ---');
  {
    const { D, fbk } = await device('mum');
    fbk.deliver(TR + 'avail', remote); fbk.deliver(TR + 'sessions', {}); fbk.deliver(TR + 'booked', {}); await D.flush();
    D.click({ act: 'availopen', id: 'b1' });
    D.click({ act: 'slotpick', id: 'b1', v: '18:00' });
    D.dom.node('#slotWant').value = 'Weak foot';
    D.click({ act: 'slotbook', id: 'b1', v: '18:00', pid: 'p1' });
    await D.flush();
    const s = written(fbk, TR + 'sessions/' + SID);
    check('the slot is a session under the id its time gives it', !!s, true);
    check('the same id the rule builds', D.slotSid('jaz', day(3), '18:00'), SID);
    check('a 1-1, closed to asks', s && s.kind === 'one' && s.open === false, true);
    check('naming the block, her child, and her', s && [s.slot, s.pid, s.tid, s.by].join(), 'b1,p1,t1,mum');
    check('at the block\'s price, exactly', s && s.price, 30);
    check('inside the window', s && s.start === '18:00' && s.end === '19:00', true);
    const b = written(fbk, TR + 'booked/' + SID + '/p1');
    check('then her child is in it', b && b.st, 'in');
    check('with what she wants to work on', b && b.want, 'Weak foot');
    const order = fbk.record.writes.map(w => w.path);
    check('the session before the booking, as the rules need', order.indexOf(TR + 'sessions/' + SID) < order.indexOf(TR + 'booked/' + SID + '/p1'), true);
    check('never a whole collection', fbk.writtenTo(TR + 'sessions').length + fbk.writtenTo(TR + 'booked/' + SID).length, 0);
    check('the slot is no longer free', D.blockSlots(D.blockById('b1')).find(x => x.start === '18:00').free, false);
    check('and it is on her calendar', D.myCalItems().some(x => x.key === 's:' + SID), true);
    check('nothing is left owed', Object.keys(D.sess.dirty).length, 0);
  }
  {
    const { D, fbk } = await device('mum');
    fbk.deliver(TR + 'avail', remote); fbk.deliver(TR + 'sessions', {}); fbk.deliver(TR + 'booked', {}); await D.flush();
    fbk.record.refuse = p => p.startsWith(TR + 'sessions/') || p.startsWith(TR + 'booked/');
    D.click({ act: 'slotbook', id: 'b1', v: '18:00', pid: 'p1' });
    await D.flush();
    check('a time somebody just took is taken back off her screen', D.sessById(SID), null);
    check('her child\'s booking too', D.sess.booked[SID] && D.sess.booked[SID].p1, undefined);
    check('and she is told to pick another', /Pick another/.test(D.lastToast()), true);
    check('nothing is left owed', Object.keys(D.sess.dirty).length, 0);
  }
  {
    const { D, fbk } = await device('mum', { online: false });
    fbk.deliver(TR + 'avail', remote); fbk.deliver(TR + 'sessions', {}); fbk.deliver(TR + 'booked', {}); await D.flush();
    D.click({ act: 'slotbook', id: 'b1', v: '18:00', pid: 'p1' });
    await D.flush();
    check('offline, nothing is sent', fbk.record.writes.some(w => w.path.startsWith(TR + 'sessions/')), false);
  }

  console.log('\n--- cancelling, against the database ---');
  const mySlot = (extra = {}) => ({ [SID]: { id: SID, kind: 'one', coach: 'jaz', coachName: 'Jaz', date: day(3), start: '18:00', end: '19:00', slot: 'b1', pid: 'p1', tid: 't1', by: 'mum', open: false, cap: 1, notice: 24, price: 30, ...extra } });
  {
    const { D, fbk } = await device('mum');
    fbk.deliver(TR + 'avail', remote); fbk.deliver(TR + 'sessions', mySlot()); fbk.deliver(TR + 'booked', { [SID]: { p1: { tid: 't1', st: 'in', by: 'mum', at: 1 } } }); await D.flush();
    D.sheetSess(SID);
    check('her sheet offers to cancel it', /data-act="slotcancel"/.test(sheet(D)), true);
    fbk.record.writes.length = 0;
    D.click({ act: 'slotcancel', id: SID, pid: 'p1' });
    await D.flush();
    const order = fbk.record.writes.map(w => w.path);
    check('her booking comes off first', order[0], TR + 'booked/' + SID + '/p1');
    check('then the slot, and the time is free again', order[1], TR + 'sessions/' + SID);
    check('both deleted', fbk.record.writes.every(w => w.value === null), true);
    check('free on her screen', D.blockSlots(D.blockById('b1')).find(x => x.start === '18:00').free, true);
  }
  {
    const { D, fbk } = await device('mum');
    fbk.deliver(TR + 'avail', remote); fbk.deliver(TR + 'sessions', mySlot({ by: 'gran' })); fbk.deliver(TR + 'booked', { [SID]: { p1: { tid: 't1', st: 'in', by: 'gran', at: 1 } } }); await D.flush();
    fbk.record.writes.length = 0;
    D.click({ act: 'slotcancel', id: SID, pid: 'p1' });
    check('one somebody else booked is not hers to cancel', fbk.record.writes.length, 0);
  }
  {
    const { D, fbk } = await device('mum');
    const soon = { [SID]: { ...mySlot()[SID], date: TODAY, start: '23:00', end: '23:59' } };
    fbk.deliver(TR + 'avail', remote); fbk.deliver(TR + 'sessions', soon); fbk.deliver(TR + 'booked', { [SID]: { p1: { tid: 't1', st: 'in', by: 'mum', at: 1 } } }); await D.flush();
    fbk.record.writes.length = 0;
    D.click({ act: 'slotcancel', id: SID, pid: 'p1' });
    check('inside the notice, she is sent to the coach', /message the coach/.test(D.lastToast()), true);
    check('and nothing is written', fbk.record.writes.length, 0);
  }

  console.log('\n--- the coach hears ---');
  {
    const { D, fbk } = await device('jaz');
    fbk.deliver(TR + 'avail', remote); fbk.deliver(TR + 'sessions', {}); fbk.deliver(TR + 'booked', {}); await D.flush();
    fbk.deliver(TR + 'sessions', mySlot()); fbk.deliver(TR + 'booked', { [SID]: { p1: { tid: 't1', st: 'in', by: 'mum', at: 1 } } }); await D.flush();
    check('a family booking one of her times', /Booked a time/.test(D.toasts.join('|')), true);
    fbk.deliver(TR + 'booked', {}); fbk.deliver(TR + 'sessions', {}); await D.flush();
    check('and cancelling it', /Cancelled a time/.test(D.lastToast() || ''), true);
    check('naming the child to her coach', /Rosa/.test(D.lastToast() || ''), true);
  }
  {
    const { D, fbk } = await device('jaz');
    fbk.deliver(TR + 'avail', {}); fbk.deliver(TR + 'sessions', {}); fbk.deliver(TR + 'booked', {}); await D.flush();
    fbk.record.writes.length = 0;
    D.click({ act: 'availnew' });
    fill(D, { avDate: day(3), avStart: '17:00', avEnd: '19:00', avField: '', avPlace: '', avPrice: '', avLo: '', avHi: '', avNote: '', avUntil: day(10), avCoach: '' });
    D.click({ act: 'availsave' });
    await D.flush();
    const ws = fbk.record.writes.filter(w => w.path.startsWith(TR + 'avail'));
    check('offering times writes each week at its own path', ws.length === 2 && ws.every(w => /^training\/CLUB\/avail\/\w+$/.test(w.path)), true);
    check('and they reach the club', Object.keys(D.sess.dirty).length, 0);
  }

  H.summary('bookable times and my calendar');
})();
