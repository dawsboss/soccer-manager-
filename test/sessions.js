/* Training sessions: 1-1s and small groups that belong to no team, and the
   admin around them — fields and permits, fees, coach hours, clashes, telling
   families. SESSIONS.md is the design. The parts that are easy to get quietly
   wrong, and so are pinned here:

   - Who gets it. Families, coaches of any team and admins; never a tracker
     who is only a tracker. Only the coach a session names, or an admin, runs
     it, and each action checks that in the click handler, not just by what
     the screen draws.
   - A family asks and never gives herself the spot, for her own child only,
     and sees no other child's name: not in the list, not in the sheet, not on
     the calendar.
   - The coach keeps the count: a full session waitlists, and Book refuses.
   - The register counts on the player's record only once taken, only for
     something that happened.
   - Fees owe from a booked place, never a withdrawal; hours count what was run.
   - Clashes: outside the permit, more at once than the field's pitches, the
     coach due elsewhere, a player due elsewhere.
   - Sessions never reach public/: not the season page, not the calendar feed.
   - Merge, never replace, and every write at the depth its rule sits at. */

const H = require('./harness');
const { check, deepEq } = H;
const { makeFakebase } = require('./fakebase');

const CONFIG = { apiKey: 'k', databaseURL: 'https://prod.example', projectId: 'p' };
const CODE = 'CLUB';
const WS = 'workspaces/' + CODE;
const TR = 'training/' + CODE + '/';

const NAMES = ['Ella', 'Rosa', 'Maya', 'Nia', 'Zoe', 'Iris'];
const OTHER_NAMES = ['Quinn', 'Uma', 'Vera', 'Wren'];
/* Born 2016 is U11 on the harness clock (12 September 2026), born 2014 U13. */
const club = () => ({
  teams: {
    t1: {
      id: 't1', name: 'G11 Flight', birthYear: 2016,
      players: Object.fromEntries(NAMES.map((n, i) => ['p' + i, { id: 'p' + i, name: n + ' Smith', number: String(i + 1), active: true, ...(i === 1 ? { guardians: { mum: true } } : {}) }]))
    },
    t2: {
      id: 't2', name: 'G13 Storm', birthYear: 2014,
      players: Object.fromEntries(OTHER_NAMES.map((n, i) => ['q' + i, { id: 'q' + i, name: n + ' Jones', number: String(i + 1), active: true, ...(i === 1 ? { guardians: { mum2: true } } : {}) }]))
    }
  },
  matches: {},
  access: {
    admins: { boss: true },
    index: { boss: true, jaz: true, other: true, trk: true, mum: true, mum2: true },
    members: { boss: { name: 'Ada' }, jaz: { name: 'Jaz' }, other: { name: 'Olu' }, mum: { name: 'Mo', email: 'mo@x.test' }, mum2: { name: 'Pat', email: 'pat@x.test' } },
    teams: { t1: { coaches: { jaz: true }, trackers: { trk: true } }, t2: { coaches: { other: true } } },
    coachIndex: { jaz: 't1', other: 't2' }
  }
});

const sheet = A => String(A.dom.node('#sheet').innerHTML || '');
const fill = (A, v) => { for (const [k, x] of Object.entries(v)) A.dom.node('#' + k).value = x; };

/* ---------- part one: the screens, on a device whose database never answers ---------- */

const A = H.loadApp({ config: CONFIG, firebase: makeFakebase() });
const TODAY = A.todayStr();
const day = n => A.addDays(TODAY, n);
function as(uid) {
  A.state = club();
  A.sess = { sessions: {}, booked: {}, came: {}, fees: {}, pay: {}, splans: {}, dirty: {} };
  A.me = uid ? { uid, name: (club().access.members[uid] || {}).name || uid } : null;
  A.appOwners = {};
  A.ui.view = 'sessions'; A.ui.sess = { tab: 'list' }; A.ui.teamId = 't1';
  A.toasts.length = 0;
  A.dom.node('#sheet').innerHTML = '';
}
/* A session straight into the store, as if it had arrived from the club. */
function put(id, extra = {}) {
  A.sess.sessions[id] = { id, kind: 'group', coach: 'jaz', coachName: 'Jaz', date: day(3), start: '17:00', end: '18:00', cap: 6, price: 0, open: true, place: 'Hill End', ...extra };
  return id;
}
function book(sid, pid, tid, st = 'in', extra = {}) {
  (A.sess.booked[sid] = A.sess.booked[sid] || {})[pid] = { tid, st, by: 'jaz', at: 1, ...extra };
}
function newSession(v = {}) {
  A.click({ act: 'sessnew' });
  fill(A, { ssTitle: '', ssDate: day(3), ssStart: '17:00', ssEnd: '18:00', ssField: '', ssPlace: 'Hill End', ssCap: '6', ssLo: '', ssHi: '', ssPrice: '', ssFocus: '', ssNotes: '', ssUntil: '', ssCoach: '', ...v });
}

(async () => {

  console.log('--- who gets it ---');
  {
    for (const [who, want] of [['boss', true], ['jaz', true], ['other', true], ['mum', true], ['trk', false], [null, false], ['newbie', false]]) {
      as(who);
      check(`${who || 'signed out'}: ${want ? 'has' : 'does not have'} training sessions`, A.canSessions(), want);
    }
    as('jaz'); check('a coach offers sessions', A.canOffer(), true);
    as('boss'); check('an admin does', A.canOffer(), true);
    as('mum'); check('a parent does not', A.canOffer(), false);
    as('mum'); A.render();
    check('the parent gets one list, no staff tabs', /data-act="sesstab"/.test(A.rendered()), false);
    A.click({ act: 'sessnew' });
    check('a tap that reaches New session is refused', A.lastToast(), 'That is for coaches and admins');
    check('and no form opens', /New session/.test(sheet(A)), false);
    as('trk'); A.render();
    check('a tracker is told it is not hers', /Training sessions are for coaches, admins and families/.test(A.rendered()), true);
    A.click({ act: 'sessopen', id: 'x' });
    check('and is refused at the handler', A.lastToast(), 'Training sessions are for coaches, admins and families');
    as('trk'); A.ui.view = 'club'; A.render();
    check('no card for it on the club page', /Training sessions/.test(A.rendered()), false);
    as('mum'); A.ui.view = 'club'; A.render();
    check('a family has the card', /<b>Training sessions<\/b>/.test(A.rendered()), true);
    as('jaz'); A.render();
    check('a coach has the four tabs', ['Sessions', 'Fields', 'Fees', 'Hours'].every(t => A.rendered().includes(`>${t}</button>`)), true);
    check('and a way to offer one', /data-act="sessnew"/.test(A.rendered()), true);
    check('every session action is behind the handler\'s own check', [...A.SESS_ACTS].every(a => a.startsWith('sess') || a.startsWith('field') || a.startsWith('reach')), true);
  }

  console.log('\n--- offering one ---');
  {
    as('jaz');
    newSession({ ssEnd: '' });
    A.click({ act: 'sesssave' });
    check('no end time is refused', /start and an end/.test(A.lastToast()), true);
    check('and nothing is made', A.sessAll().length, 0);
    newSession({ ssTitle: '1-1: finishing', ssPrice: '25', ssFocus: 'weak foot' });
    A.click({ act: 'sesssave' });
    const [s] = A.sessAll();
    check('a 1-1 is made', !!s && s.kind, 'one');
    check('run by the coach who made it', s.coach, 'jaz');
    check('with one spot', s.cap, 1);
    check('at its price', s.price, 25);
    check('open for families to ask, by default', s.open, true);
    check('and its sheet is opened to add players', /Add players/.test(sheet(A)), true);
    check('the write sits at its own path', Object.keys(A.sess.dirty).includes('sessions/' + s.id), true);

    newSession({ ssCoach: 'other' });
    A.click({ act: 'sesskind', v: 'group' });
    fill(A, { ssCap: '4', ssLo: '10', ssHi: '12', ssCoach: 'other' });
    A.click({ act: 'sessopenask', v: '0' });
    A.click({ act: 'sesssave' });
    const g = A.sessAll().find(x => x.kind === 'group');
    check('a group keeps its spots', g.cap, 4);
    deepEq('and its ages', g.ages, [10, 12]);
    check('and can be booked by the coach only', g.open, false);
    check('a coach cannot make one in another coach\'s name', g.coach, 'jaz');

    newSession();
    A.click({ act: 'sessrepeat', v: '1' });
    fill(A, { ssUntil: day(3 + 7 * 3) });
    A.click({ act: 'sesssave' });
    const series = A.sessAll().filter(x => x.series);
    check('every week makes one session a week', series.length, 4);
    check('all sharing one series', new Set(series.map(x => x.series)).size, 1);

    as('boss');
    newSession();
    fill(A, { ssCoach: 'other' });
    A.click({ act: 'sesssave' });
    check('an admin makes one for another coach', A.sessAll()[0].coach, 'other');
    check('who is named on it', A.sessAll()[0].coachName, 'Olu');

    as('jaz');
    put('theirs', { coach: 'other', coachName: 'Olu' });
    A.click({ act: 'sessedit', id: 'theirs' });
    check('another coach\'s session cannot be edited', A.lastToast(), 'Only the coach running it, or an admin, can change that');
    A.click({ act: 'sesscall', id: 'theirs' });
    check('nor called off', A.sessById('theirs').called, '');
    check('it is the club\'s to read, though', A.canRun(A.sessById('theirs')), false);
  }

  console.log('\n--- players: the coach books, the count is hers ---');
  {
    as('jaz');
    put('g', { cap: 2 });
    A.click({ act: 'sesspick', id: 'g' });
    A.click({ act: 'sesspicktoggle', pid: 'p0' });
    A.click({ act: 'sesspickteam', k: 'tid', v: 't2' });
    check('the picker reaches another team', /Quinn Jones/.test(sheet(A)), true);
    A.click({ act: 'sesspicktoggle', pid: 'q0' });
    A.click({ act: 'sesspicktoggle', pid: 'q2' });
    A.click({ act: 'sesspicksave' });
    check('two booked', A.bookingsOf('g').filter(x => x.st === 'in').length, 2);
    check('and the third on the waiting list: it was full', A.bookOf('g', 'q2') && A.bookOf('g', 'q2').st, 'wait');
    check('and the coach is told', /waiting list/.test(A.lastToast()), true);
    check('each booking names its own team', [A.bookOf('g', 'p0').tid, A.bookOf('g', 'q0').tid].join(), 't1,t2');
    A.click({ act: 'sessbook', id: 'g', pid: 'q2', v: 'in' });
    check('Book is refused while it is full', /No spots left/.test(A.lastToast()), true);
    check('and nothing changes', A.bookOf('g', 'q2').st, 'wait');
    A.click({ act: 'sessbook', id: 'g', pid: 'q0', v: 'out' });
    A.click({ act: 'sessbook', id: 'g', pid: 'q2', v: 'in' });
    check('a place freed is a place to give', A.bookOf('g', 'q2').st, 'in');

    put('wk1', { series: 'S', date: day(3) }); put('wk2', { series: 'S', date: day(10) }); put('wk3', { series: 'S', date: day(17) });
    A.click({ act: 'sesspick', id: 'wk1' });
    A.click({ act: 'sesspicktoggle', pid: 'p3' });
    A.click({ act: 'sesspickscope', v: 'later' });
    A.click({ act: 'sesspicksave' });
    check('"every week from this one" books the whole series', ['wk1', 'wk2', 'wk3'].every(id => (A.bookOf(id, 'p3') || {}).st === 'in'), true);

    as('other');
    put('g2');
    A.click({ act: 'sesspick', id: 'g2' });
    check('another coach cannot add players to it', A.lastToast(), 'Only the coach running it, or an admin, can change that');
  }

  console.log('\n--- a family asks, for her own child ---');
  {
    as('mum');
    put('open1', { title: 'Finishing group', ages: [10, 12] });
    put('closed1', { open: false });
    put('older', { ages: [13, 14] });
    book('open1', 'p0', 't1');
    A.render();
    const h = A.rendered();
    check('an open session for her age is offered', /Finishing group/.test(h), true);
    check('one for older girls is not', (h.match(/data-id="older"/g) || []).length, 0);
    check('nor one the coach books herself', (h.match(/data-id="closed1"/g) || []).length, 0);
    A.click({ act: 'sessopen', id: 'open1' });
    check('the sheet offers to ask for her child', /Ask for a spot for Rosa/.test(sheet(A)), true);
    check('and names nobody else\'s child', NAMES.filter(n => n !== 'Rosa').some(n => sheet(A).includes(n)), false);
    fill(A, { sessWant_p1: 'Weak foot, and the rondo from last week' });
    A.click({ act: 'sessask', id: 'open1', pid: 'p1' });
    const b = A.bookOf('open1', 'p1');
    check('she has asked', b && b.st, 'asked');
    check('in her own name', b.by, 'mum');
    check('for her child\'s own team', b.tid, 't1');
    check('with what she wants to work on', b.want, 'Weak foot, and the rondo from last week');
    deepEq('and nothing the rule would refuse', Object.keys(b).sort(), ['at', 'by', 'st', 'tid', 'want']);
    A.click({ act: 'sessask', id: 'open1', pid: 'p0' });
    check('never for somebody else\'s child', A.lastToast(), 'You can only ask for your own child');
    A.click({ act: 'sessask', id: 'closed1', pid: 'p1' });
    check('nor for a session closed to asking', A.lastToast(), 'That session is not taking asks');
    A.render();
    check('her list names her child', /Rosa: asked/.test(A.rendered()), true);
    check('and no other child', NAMES.filter(n => n !== 'Rosa').concat(OTHER_NAMES).some(n => A.rendered().includes(n)), false);

    as('mum2');
    put('older', { ages: [13, 14] });
    A.render();
    check('the older girls\' session is offered to the U13 family', /data-id="older"/.test(A.rendered()), true);

    // the coach answers
    A.me = { uid: 'jaz', name: 'Jaz' };
    A.sess.booked.open1 = { p1: { tid: 't1', st: 'asked', by: 'mum', at: 1, want: 'Weak foot' } };
    put('open1', { title: 'Finishing group', ages: [10, 12] });
    A.ui.sess = { tab: 'list', scope: 'mine' }; A.render();
    check('the coach sees the ask first', /Asking for a spot/.test(A.rendered()), true);
    check('with what she wants', /wants: Weak foot/.test(A.rendered()), true);
    A.click({ act: 'sessbook', id: 'open1', pid: 'p1', v: 'in' });
    check('the coach books her', A.bookOf('open1', 'p1').st, 'in');
    check('and her wants stay on the booking', A.bookOf('open1', 'p1').want, 'Weak foot');

    A.me = { uid: 'mum', name: 'Mo' };
    A.click({ act: 'sesswithdraw', id: 'open1', pid: 'p1' });
    check('the family withdraws', A.bookOf('open1', 'p1').st, 'out');
    check('in her own name', A.bookOf('open1', 'p1').by, 'mum');
    A.click({ act: 'sesswithdraw', id: 'open1', pid: 'p0' });
    check('and only for her own child', A.lastToast(), 'You can only ask for your own child');
  }

  console.log('\n--- who came ---');
  {
    as('jaz');
    put('past', { date: day(-2) }); book('past', 'p1', 't1'); book('past', 'p0', 't1'); book('past', 'p2', 't1', 'out');
    put('future', { date: day(2) }); book('future', 'p1', 't1');
    put('off', { date: day(-3), called: 'cancelled' }); book('off', 'p1', 't1');
    A.sess.came.off = { p1: true };
    A.click({ act: 'sessopen', id: 'past' });
    check('a session that has happened offers the register', /Take the register/.test(sheet(A)), true);
    A.click({ act: 'sessregister', id: 'past' });
    deepEq('it starts with everyone booked as there', A.sess.came.past, { p1: true, p0: true });
    A.click({ act: 'sesscame', id: 'past', pid: 'p0' });
    check('a tap marks a miss', A.sess.came.past.p0, false);
    deepEq('it counts on her record', A.sessAttendance('p1'), { came: 1, of: 1 });
    deepEq('a miss counts as one', A.sessAttendance('p0'), { came: 0, of: 1 });
    check('said with the rest of her season', /Extra sessions 1 of 1/.test(A.attendLine(A.attendance(A.state.teams.t1, 'p1'))), true);
    check('a called-off session never counts, register or not', A.sessAttendance('p1').of, 1);
    A.click({ act: 'sessopen', id: 'future' });
    check('one still to come has no register', /Take the register/.test(sheet(A)), false);
    as('other'); put('past', { date: day(-2) }); book('past', 'p1', 't1');
    A.click({ act: 'sessregister', id: 'past' });
    check('another coach cannot take it', A.lastToast(), 'Only the coach running it, or an admin, can change that');
  }

  console.log('\n--- fees ---');
  {
    as('jaz');
    put('f1', { date: day(-2), price: 25 }); book('f1', 'p1', 't1'); book('f1', 'p0', 't1'); book('f1', 'p2', 't1', 'out');
    put('f2', { date: day(-1), price: 30 }); book('f2', 'p0', 't1');
    put('f3', { date: day(-1), price: 40, called: 'cancelled' }); book('f3', 'p0', 't1');
    const rows = A.feeRows();
    check('a booked place owes; a withdrawal and a called-off session do not', rows.length, 3);
    A.click({ act: 'sessfee', k: 'f1/p1' });
    A.click({ act: 'sessfeehow', v: 'card' });
    fill(A, { feeAmount: '25' });
    A.click({ act: 'sessfeesave' });
    const f = A.feeOf('f1', 'p1');
    check('marked paid', f && f.paid, 25);
    check('by card', f.how, 'card');
    check('by whom', f.by, 'jaz');
    A.click({ act: 'sessfee', k: 'f1/p0,f2/p0' });
    A.dom.node('#feeAmount').value = '';
    A.click({ act: 'sessfeesave' });
    check('several at once, each at its own price', [A.feeOf('f1', 'p0').paid, A.feeOf('f2', 'p0').paid].join(), '25,30');
    A.click({ act: 'sessfee', k: 'f2/p0' });
    A.click({ act: 'sessfeehow', v: 'waived' });
    A.click({ act: 'sessfeesave' });
    check('waived is a fee of nothing', A.feeOf('f2', 'p0').paid + ' ' + A.feeOf('f2', 'p0').how, '0 waived');
    A.click({ act: 'sessdel', id: 'f1' });
    check('a session with payments is not deleted', /call it off instead/.test(A.lastToast()), true);
    check('and is still there', !!A.sessById('f1'), true);

    as('mum');
    put('f1', { date: day(-2), price: 25 }); book('f1', 'p1', 't1');
    put('f4', { date: day(5), price: 20 }); book('f4', 'p1', 't1');
    A.sess.fees.f1 = { p1: { paid: 25, how: 'cash', at: 1, by: 'jaz' } };
    const o = A.familyOwed();
    check('a family owes for her child\'s unpaid places', o.rows.map(r => r.s.id).join(), 'f4');
    check('totalled', o.total, 20);
    A.render();
    check('and sees it', /To pay/.test(A.rendered()), true);
    A.click({ act: 'sessfee', k: 'f4/p1' });
    check('but cannot mark it paid', A.lastToast(), 'That is for coaches and admins');

    as('other');
    put('f1', { date: day(-2), price: 25 }); book('f1', 'p1', 't1');
    A.click({ act: 'sessfee', k: 'f1/p1' });
    check('nor can a coach who does not run it', A.lastToast(), 'Only the coach running it, or an admin, can mark that');

    as('jaz');
    put('f5', { date: day(-1), price: 15 }); book('f5', 'p1', 't1');
    A.click({ act: 'sessremind', pid: 'p1' });
    check('a reminder lists what is owed', /15/.test(A.reach.text) && /Rosa/.test(A.reach.text), true);
    deepEq('and goes to the family\'s address', A.reach.emails, ['mo@x.test']);
  }

  console.log('\n--- coach hours ---');
  {
    as('boss');
    const month = TODAY.slice(0, 7);
    const inMonth = n => { const d = day(n); return d.slice(0, 7) === month ? d : null; };
    const d1 = inMonth(-1) || inMonth(1), d2 = inMonth(-2) || inMonth(2);
    put('h1', { date: d1 < TODAY ? d1 : day(-1), start: '17:00', end: '18:00' });
    put('h2', { date: d2 < TODAY ? d2 : day(-1), start: '17:00', end: '18:30', kind: 'one', cap: 1 });
    put('h3', { date: day(-1), called: 'cancelled' });
    put('h4', { date: day(1) });
    put('h5', { date: day(-1), coach: 'other', coachName: 'Olu' });
    book('h1', 'p1', 't1'); book('h2', 'p1', 't1'); book('h1', 'p0', 't1');
    const pastIn = ['h1', 'h2', 'h5'].filter(id => A.sessById(id).date.startsWith(month)).length;
    A.ui.sess.month = A.sessById('h1').date.slice(0, 7);
    const hs = A.hoursFor(A.ui.sess.month);
    const jaz = hs.find(h => h.uid === 'jaz');
    check('a coach\'s month counts what she ran', jaz.n, A.sessById('h2').date.startsWith(A.ui.sess.month) ? 2 : 1);
    check('start to end', jaz.mins, A.sessById('h2').date.startsWith(A.ui.sess.month) ? 150 : 60);
    check('not what was called off, nor what is still to come', hs.reduce((n, h) => n + h.list.filter(s => ['h3', 'h4'].includes(s.id)).length, 0), 0);
    A.sess.pay = { jaz: { rate: 30, per: 'hour' }, other: { rate: 20, per: 'session' } };
    check('a rate per hour', A.payFor(jaz), 30 * jaz.mins / 60);
    check('a rate per session', A.payFor(hs.find(h => h.uid === 'other')), 20 * hs.find(h => h.uid === 'other').n);
    A.ui.sess.tab = 'hours'; A.render();
    check('an admin sees every coach', /Jaz/.test(A.rendered()) && /Olu/.test(A.rendered()), true);
    check('and the rates', /Pay rates/.test(A.rendered()), true);
    A.click({ act: 'sesspay', v: 'jaz' });
    fill(A, { payRate: '35' });
    A.click({ act: 'sesspayper', v: 'session' });
    fill(A, { payRate: '35' });
    A.click({ act: 'sesspaysave' });
    deepEq('an admin sets one', A.sess.pay.jaz, { rate: 35, per: 'session' });

    A.me = { uid: 'jaz', name: 'Jaz' };
    A.ui.sess.tab = 'hours'; A.render();
    check('a coach sees her own hours', /Jaz/.test(A.rendered()), true);
    check('and nobody else\'s', /Olu/.test(A.rendered()), false);
    check('nor anyone\'s rate list', /Pay rates/.test(A.rendered()), false);
    A.click({ act: 'sesspay', v: 'jaz' });
    check('and cannot set her own rate', A.lastToast(), 'Club admins set pay rates');
    void pastIn;
  }

  console.log('\n--- fields and permits ---');
  {
    as('jaz');
    A.click({ act: 'fieldnew' });
    check('a coach cannot add a field', A.lastToast(), 'Club admins look after the fields');
    as('boss');
    const D = day(3), wd = A.weekdayOf(D);
    A.click({ act: 'fieldnew' });
    fill(A, { fdName: 'Lakeside Park', fdAddress: '1 Lake Rd', fdPitches: '1', fdNotes: '' });
    A.click({ act: 'fieldpermit' });
    A.click({ act: 'fieldday', i: '0', v: String(wd) });
    fill(A, { fdName: 'Lakeside Park', fdAddress: '1 Lake Rd', fdPitches: '1', fdNotes: '', pmStart_0: '16:00', pmEnd_0: '19:00', pmFrom_0: '', pmUntil_0: '', pmRef_0: 'City #4471', pmNote_0: '' });
    A.click({ act: 'fieldpermit' });
    A.click({ act: 'fieldsave' });
    const [f] = A.fieldList();
    check('an admin adds one', f && f.name, 'Lakeside Park');
    check('under the club settings the admin rule covers', !!A.state.access.org.venues[f.id], true);
    check('with its permit', A.permitsOf(f).length, 1);
    check('and a permit with no days is left off', /left off/.test(A.lastToast()), true);
    check('"Lakeside Park, field 2" is at it', (A.fieldOfText('Lakeside Park, field 2') || {}).id, f.id);
    check('"lakeside park" is, whatever the case', (A.fieldOfText('lakeside park') || {}).id, f.id);
    check('"Lakeside Parkway" is not', A.fieldOfText('Lakeside Parkway'), null);

    put('in', { date: D, start: '17:00', end: '18:00', field: f.id, place: '' });
    check('inside the permit: nothing to say', A.sessClashes(A.sessById('in')).length, 0);
    put('late', { date: D, start: '19:30', end: '20:30', field: f.id, place: '' });
    check('after it ends: outside the permit', A.sessClashes(A.sessById('late')).some(c => /Outside the club's permit/.test(c)), true);
    put('nextday', { date: A.addDays(D, 1), start: '17:00', end: '18:00', field: f.id, place: '' });
    check('on a day it does not cover: outside too', A.sessClashes(A.sessById('nextday')).some(c => /Outside/.test(c)), true);

    A.state.teams.t1.events = { e1: { id: 'e1', kind: 'practice', title: 'Practice', date: D, start: '17:30', end: '18:30', venue: 'Lakeside Park, field 2' } };
    const cl = A.sessClashes(A.sessById('in'));
    check('a team practice on its one pitch is a clash', cl.some(c => /has 1 pitch/.test(c)), true);
    check('and its coach is due at it', cl.some(c => /Jaz is also due at G11 Flight: Practice/.test(c)), true);
    book('in', 'p1', 't1');
    const cl2 = A.sessClashes(A.sessById('in'));
    check('a booked player whose team practises then', cl2.some(c => /Rosa Smith has G11 Flight: Practice/.test(c)), true);
    book('in', 'q0', 't2');
    check('a player on another team is not', A.sessClashes(A.sessById('in')).some(c => /Quinn/.test(c)), false);
    A.state.access.org.venues[f.id].pitches = 2;
    check('with two pitches, two at once is fine', A.sessClashes(A.sessById('in')).some(c => /pitch/.test(c)), false);
    const days = A.fieldDays(A.fieldById(f.id), TODAY, 7);
    check('the field\'s week lists what is on it', days.length >= 2, true);
    check('and flags what is outside the permit', days.some(x => x.x.key === 's:late' && x.flags.includes('outside the permit')), true);
    A.state.teams.t2.events = { e2: { id: 'e2', kind: 'practice', date: D, start: '17:00', venue: 'Riverside Rec' } };
    check('a venue typed on the calendar is offered as a field', A.looseVenues().includes('Riverside Rec'), true);
    A.click({ act: 'fieldopen', id: f.id });
    check('a field has a profile', /City #4471/.test(sheet(A)) && /The next two weeks/.test(sheet(A)), true);

    as('jaz');
    A.state.access.org = { venues: { [f.id]: { ...f, permits: {} } } };
    put('new', { date: D, start: '21:00', end: '22:00', field: f.id });
    check('a field with no permits listed is not checked', A.sessClashes(A.sessById('new')).some(c => /permit/.test(c)), false);
    newSession({ ssField: f.id, ssStart: '17:30', ssEnd: '18:30' });
    A.click({ act: 'sesscheck' });
    check('the form checks before saving', /Jaz is also due|has 1 pitch|No clashes/.test(sheet(A)), true);
  }

  console.log('\n--- on the calendar, and never on the share link ---');
  {
    as('jaz');
    put('c1', { title: 'Secret 1-1', date: day(2), kind: 'one', cap: 1 }); book('c1', 'p1', 't1');
    put('c2', { title: 'Another 1-1', date: day(2), kind: 'one', cap: 1, start: '18:00', end: '19:00' }); book('c2', 'p0', 't1');
    A.ui.view = 'calendar'; A.ui.teamId = 't1'; A.render();
    check('the team\'s coach sees her players\' sessions', /Secret 1-1 with Jaz/.test(A.rendered()) && /Another 1-1/.test(A.rendered()), true);
    check('tagged as training', /tag session/.test(A.rendered()), true);
    A.me = { uid: 'mum', name: 'Mo' };
    A.render();
    check('a family sees her own child\'s', /Secret 1-1/.test(A.rendered()), true);
    check('and not another child\'s', /Another 1-1/.test(A.rendered()), false);
    A.state.teams.t1.share = 'sh1';
    const pub = JSON.stringify([A.publicDoc(A.state.teams.t1), A.calendarDoc(A.state.teams.t1)]);
    check('the season page and the calendar feed carry no session', /Secret 1-1|Another 1-1|Hill End/.test(pub), false);
    check('and no session reached public/ through calItems', A.calItems(['t1']).some(x => x.kind === 'session'), false);
    A.ui.view = 'calendar'; A.render();
    check('one she is booked into is "next up"', /Next up[\s\S]{0,400}Secret 1-1/.test(A.rendered()), true);
    A.sess.booked.c1.p1.st = 'asked'; A.render();
    check('one she has only asked for is not "next up"', /Next up[\s\S]{0,400}Secret 1-1/.test(A.rendered()), false);
    A.sess.booked.c1.p1.st = 'in';
    A.state.access.org = { venues: { v1: { id: 'v1', name: 'Hill End', pitches: 1 } } };
    A.click({ act: 'fieldopen', id: 'v1' });
    check('a family sees a field\'s address, not everything booked on it', /The next two weeks/.test(sheet(A)), false);
    A.me = { uid: 'mum', name: 'Mo' }; A.ui.view = 'mine'; A.render();
    check('My players shows her next session', /Next session — Secret 1-1/.test(A.rendered()), true);
  }

  console.log('\n--- telling the families ---');
  {
    as('jaz');
    put('t', { title: 'Finishing group', date: day(4) }); book('t', 'p1', 't1'); book('t', 'q1', 't2');
    A.click({ act: 'sesscall', id: 't' });
    check('calling it off', A.sessById('t').called, 'cancelled');
    check('opens the message to the families', /Cancelled: Finishing group/.test(sheet(A)), true);
    check('which says it is off', /CANCELLED/.test(A.reach.text), true);
    deepEq('to both families\' addresses', A.reach.emails.sort(), ['mo@x.test', 'pat@x.test']);
    check('and names no child', NAMES.concat(OTHER_NAMES).some(n => A.reach.text.includes(n)), false);
    A.click({ act: 'sesscall', id: 't' });
    check('and back on again', A.sessById('t').called, '');
  }

  console.log('\n--- drills for a session ---');
  {
    as('jaz');
    put('d', { kind: 'one', cap: 1 }); book('d', 'p1', 't1', 'in', { want: 'Weak foot' });
    A.click({ act: 'sessdrills', id: 'd' });
    check('the picker shows what the family asked for', /Weak foot/.test(sheet(A)), true);
    const L = require('../drills.js');
    const oneish = L.DRILLS.find(x => x.players.min <= 2 && x.ages[0] <= 11 && x.ages[1] >= 11);
    const crowd = L.DRILLS.find(x => x.players.min >= 6);
    check('and drills one player and a coach can do', sheet(A).includes(`data-v="${oneish.id}"`), true);
    check('not ones that need a crowd', sheet(A).includes(`data-v="${crowd.id}"`), false);
    A.click({ act: 'sessdrilladd', id: 'd', v: oneish.id });
    check('a drill is added by reference', JSON.stringify(A.sess.splans.d.blocks[0].drill), JSON.stringify({ shelf: 'builtin', id: oneish.id, v: L.version }));
    as('mum'); put('d', { kind: 'one', cap: 1 }); book('d', 'p1', 't1');
    A.click({ act: 'sessdrills', id: 'd' });
    check('a family never gets the drills', /Only the coach running it/.test(A.lastToast()), true);
  }

  console.log('\n--- every screen draws ---');
  {
    for (const who of ['boss', 'jaz', 'mum', 'other']) {
      as(who);
      put('x1', { date: day(-1), price: 10 }); book('x1', 'p1', 't1');
      put('x2', { date: day(2), title: 'Group', open: true }); book('x2', 'p0', 't1', 'asked');
      A.state.access.org = { venues: { v1: { id: 'v1', name: 'Lakeside', pitches: 1, permits: { a: { id: 'a', days: [0, 1], start: '16:00', end: '20:00' } } } } };
      for (const tab of ['list', 'fields', 'fees', 'hours']) {
        A.ui.sess.tab = tab;
        let ok = true; try { A.render(); A.sheetSess('x1'); A.sheetSess('x2'); } catch (e) { ok = false; console.log(e); }
        check(`${who}: ${tab} draws`, ok, true);
      }
    }
  }

  /* ---------- part two: against the fake database ---------- */

  async function device(uid, storage = {}) {
    const fbk = makeFakebase();
    const D = H.loadApp({ firebase: fbk, config: CONFIG, storage: { 'sm.workspace': CODE, ...storage } });
    await D.flush();
    fbk.signIn(uid, { name: (club().access.members[uid] || {}).name || uid }); await D.flush();
    fbk.deliver(WS, club()); await D.flush();
    D.render();
    return { D, fbk };
  }
  const written = (fbk, p) => { const w = fbk.writtenTo(p); return w.length ? w[w.length - 1].value : undefined; };
  const remoteSess = { s1: { id: 's1', kind: 'group', coach: 'jaz', coachName: 'Jaz', date: day(3), start: '17:00', end: '18:00', cap: 4, open: true, price: 20 } };

  console.log('\n--- what each phone listens to ---');
  {
    const { D, fbk } = await device('mum');
    check('a family reads the club\'s sessions', fbk.watching(TR + 'sessions'), true);
    check('and bookings, and registers', fbk.watching(TR + 'booked') && fbk.watching(TR + 'came'), true);
    check('never every fee', fbk.watching(TR + 'fees'), false);
    check('nor pay rates', fbk.readPaths().some(p => p.startsWith(TR + 'pay')), false);
    fbk.deliver(TR + 'sessions', remoteSess); fbk.deliver(TR + 'booked', { s1: { p1: { tid: 't1', st: 'in', by: 'jaz', at: 1 } } }); await D.flush();
    D.render();
    check('only her own child\'s fee, once she is booked', fbk.watching(TR + 'fees/s1/p1'), true);
    check('nobody else\'s', fbk.readPaths().filter(p => p.startsWith(TR + 'fees')).length, 1);
    check('and no session\'s drills', fbk.readPaths().some(p => p.startsWith(TR + 'splans')), false);
  }
  {
    const { D, fbk } = await device('jaz');
    fbk.deliver(TR + 'sessions', remoteSess); await D.flush(); D.render();
    check('a coach reads her own session\'s fees', fbk.watching(TR + 'fees/s1'), true);
    check('not every fee', fbk.watching(TR + 'fees'), false);
    check('and her own pay rate', fbk.watching(TR + 'pay/jaz'), true);
    check('not the list', fbk.watching(TR + 'pay'), false);
    D.sheetSess('s1'); D.render();
    check('opening a session reads its drills', fbk.watching(TR + 'splans/s1'), true);
    D.render(); D.render();
    check('once, however often it redraws', fbk.countReads(TR + 'sessions'), 1);
  }
  {
    const { fbk } = await device('boss');
    check('an admin reads every fee', fbk.watching(TR + 'fees'), true);
    check('and every rate', fbk.watching(TR + 'pay'), true);
  }
  {
    const { fbk } = await device('trk');
    check('a tracker reads none of it', fbk.readPaths().some(p => /^training\/CLUB\/(sessions|booked|came|fees|pay|splans)/.test(p)), false);
  }

  console.log('\n--- writes, at the depth the rules sit at ---');
  {
    const { D, fbk } = await device('jaz');
    fbk.deliver(TR + 'sessions', remoteSess); fbk.deliver(TR + 'booked', {}); fbk.deliver(TR + 'came', {}); await D.flush();
    D.click({ act: 'sesspick', id: 's1' });
    D.click({ act: 'sesspicktoggle', pid: 'p0' });
    D.click({ act: 'sesspicksave' });
    await D.flush();
    const w = written(fbk, TR + 'booked/s1/p0');
    check('a booking is one write, at its own path', w && w.st, 'in');
    check('never the session\'s whole list', fbk.writtenTo(TR + 'booked/s1').length + fbk.writtenTo(TR + 'booked').length, 0);
    check('and acknowledged, it is clean', Object.keys(D.sess.dirty).length, 0);
    D.click({ act: 'sessfee', k: 's1/p0' });
    D.click({ act: 'sessfeesave' });
    await D.flush();
    check('a fee is one write per place', !!written(fbk, TR + 'fees/s1/p0'), true);
    D.click({ act: 'sessbook', id: 's1', pid: 'p0', v: 'out' });
    D.click({ act: 'sessdel', id: 's1' });
    check('a session with a payment is not deleted', !!D.sessById('s1'), true);
    fbk.record.writes.length = 0;
    D.sess.fees = {};
    D.click({ act: 'sessdel', id: 's1' });
    await D.flush();
    const order = fbk.record.writes.map(x => x.path.slice(TR.length).split('/')[0]);
    check('deleting clears the bookings before the session', order.indexOf('booked') < order.indexOf('sessions'), true);
    check('the session goes last, while its coach can still clear the rest', order[order.length - 1], 'sessions');
  }
  {
    const { D, fbk } = await device('mum');
    fbk.deliver(TR + 'sessions', remoteSess); fbk.deliver(TR + 'booked', {}); fbk.deliver(TR + 'came', {}); await D.flush();
    fbk.record.refuse = path => path.includes('/booked/');
    D.dom.node('#sessWant_p1').value = 'Crossing';
    D.click({ act: 'sessask', id: 's1', pid: 'p1' });
    await D.flush();
    check('an ask the database refuses is taken back off the screen', D.bookOf('s1', 'p1'), null);
    check('and she is told why', /Not saved/.test(D.lastToast()), true);
    check('nothing is left owed', Object.keys(D.sess.dirty).length, 0);
  }

  console.log('\n--- merge, never replace ---');
  {
    const { D, fbk } = await device('jaz');
    fbk.deliver(TR + 'sessions', remoteSess); await D.flush();
    fbk.record.refuse = () => true;           // offline in effect: nothing the phone sends is acknowledged
    fbk.record.refuse = null;
    // a session made with no answer from the club yet
    const set0 = D.fb.set; let held = [];
    D.fb.set = (ref, v) => { held.push(ref.path); return new Promise(() => { }); };
    D.click({ act: 'sessnew' });
    fill(D, { ssTitle: 'Made offline', ssDate: day(5), ssStart: '10:00', ssEnd: '11:00', ssField: '', ssPlace: 'Hill End', ssPrice: '', ssLo: '', ssHi: '', ssFocus: '', ssNotes: '' });
    D.click({ act: 'sesssave' });
    const mine = D.sessAll().find(s => s.title === 'Made offline');
    check('it is on the phone', !!mine, true);
    check('and owed to the club', D.sess.dirty['sessions/' + mine.id] !== undefined, true);
    fbk.deliver(TR + 'sessions', remoteSess); await D.flush();
    check('the club\'s answer, without it, does not erase it', !!D.sessById(mine.id), true);
    check('the club\'s own session is still there', !!D.sessById('s1'), true);
    fbk.deliver(TR + 'sessions', { s9: { ...remoteSess.s1, id: 's9' } }); await D.flush();
    check('one deleted at the club goes', D.sessById('s1'), null);
    check('one made elsewhere arrives', !!D.sessById('s9'), true);
    D.fb.set = set0;

    // a reload: the phone still owes it, and sends it on the first answer
    const saved = { ...D.storage._d };
    const fbk2 = makeFakebase();
    const D2 = H.loadApp({ firebase: fbk2, config: CONFIG, storage: saved });
    await D2.flush(); fbk2.signIn('jaz', { name: 'Jaz' }); await D2.flush(); fbk2.deliver(WS, club()); await D2.flush(); D2.render();
    check('after a reload it is still on the phone', !!D2.sessById(mine.id), true);
    fbk2.deliver(TR + 'sessions', {}); await D2.flush();
    check('and is sent on the first answer', !!written(fbk2, TR + 'sessions/' + mine.id), true);
    void held;
  }

  console.log('\n--- notices ---');
  {
    const { D, fbk } = await device('mum');
    fbk.deliver(TR + 'sessions', remoteSess);
    fbk.deliver(TR + 'booked', { s1: { p1: { tid: 't1', st: 'asked', by: 'mum', at: 1 } } }); await D.flush();
    const n0 = D.toasts.length;
    check('the first read tells her nothing', D.toasts.length, n0);
    fbk.deliver(TR + 'booked', { s1: { p1: { tid: 't1', st: 'in', by: 'jaz', at: 2 } } }); await D.flush();
    check('her child\'s place confirmed is news', /Rosa: booked/.test(D.lastToast() || ''), true);
    const n1 = D.toasts.length;
    fbk.deliver(TR + 'booked', { s1: { p1: { tid: 't1', st: 'in', by: 'jaz', at: 2 } } }); await D.flush();
    check('said once', D.toasts.length, n1);
    fbk.deliver(TR + 'sessions', { s1: { ...remoteSess.s1, called: 'cancelled' } }); await D.flush();
    check('called off is news', /Cancelled/.test(D.lastToast() || ''), true);
    check('naming only her own child', /Rosa/.test(D.lastToast()) && !/Ella|Maya/.test(D.lastToast()), true);
  }
  {
    const { D, fbk } = await device('jaz');
    fbk.deliver(TR + 'sessions', remoteSess); fbk.deliver(TR + 'booked', {}); await D.flush();
    fbk.deliver(TR + 'booked', { s1: { p1: { tid: 't1', st: 'asked', by: 'mum', at: 3, want: 'Weak foot' } } }); await D.flush();
    check('the coach hears that a family asked', /Asked for a spot/.test(D.lastToast() || ''), true);
    const n = D.toasts.length;
    D.click({ act: 'sessbook', id: 's1', pid: 'p1', v: 'in' });
    fbk.deliver(TR + 'booked', { s1: { p1: { tid: 't1', st: 'in', by: 'jaz', at: 4 } } }); await D.flush();
    check('and not about her own tap', D.toasts.filter(t => /Asked|Withdrew|booked/.test(t)).length, D.toasts.slice(0, n).filter(t => /Asked|Withdrew|booked/.test(t)).length);
  }

  H.summary('training sessions');
})();
