/* Booking a coach's time as one server call (functions/book.js; SERVER.md,
   *Bookable times and training sessions*).

   The server half, on the fake server with functions/index.js required as
   deployed: a family's phone asks at bookAsks/{code}/{uid}/{id}, and the
   answer is written beside the ask. It writes with admin credentials and the
   rules never see it, so this does for it what rules.js did for the old
   three-write booking: every kind of account, and every reason to say no.
   The page half (asking, waiting, what the sheet says) is in test/avail.js. */

const H = require('./harness');
const { check, deepEq } = H;
const { makeServer } = require('./fakebase');
const book = require('../functions/book');

const DAY = 86400000;
const iso = ms => new Date(ms).toISOString().slice(0, 10);
const today0 = Date.now() - (Date.now() % DAY);
const D = iso(today0 + 3 * DAY);            // a Tuesday or whatever: three days out
const D0 = Date.UTC(...D.split('-').map((x, i) => Number(x) - (i === 1 ? 1 : 0)));

const CLUB = {
  access: {
    org: { name: 'Lakeside SC' },
    admins: { adm: true },
    index: { adm: true, coach: true, trk: true, mum: true, gran: true, other: true, dad: true },
    members: { adm: { name: 'Ada' }, coach: { name: 'Jaz' }, mum: { name: 'Mo' }, gran: { name: 'Gran' }, dad: { name: 'Dev' } },
    teams: { t1: { coaches: { coach: true }, trackers: { trk: true } }, t2: { coaches: { other: true } } },
    teamIndex: { t1: { coach: 'coach', trk: 'tracker' }, t2: { other: 'coach' } },
    teamParents: { t1: { mum: 'p1', gran: 'p2' }, t2: { dad: 'q1' } },
    coachIndex: { coach: 't1', other: 't2' }
  },
  teams: {
    t1: { id: 't1', name: 'Flight', players: {
      p1: { id: 'p1', name: 'Ella', number: '7', guardians: { mum: true } },
      p2: { id: 'p2', name: 'Rosa', number: '9', guardians: { gran: true } },
      p3: { id: 'p3', name: 'Ivy', number: '4', guardians: { mum: true } }
    } },
    t2: { id: 't2', name: 'Storm', players: { q1: { id: 'q1', name: 'Gia', number: '3', guardians: { dad: true } } } }
  },
  matches: {}
};
const block = (id, extra = {}) => ({ id, coach: 'coach', coachName: 'Jaz', date: D, start: '17:00', end: '19:00', len: 60, kind: 'one', cap: 1, price: 30, notice: 24, day0: D0, ...extra });
// she coaches t2 as well, whose practices are nothing to the families booking here
const COACH_T2 = S => { S.put('workspaces/CLUB/access/teams/t2/coaches/coach', true); return S; };
const group = (id, extra = {}) => block(id, { kind: 'group', cap: 2, title: 'Finishing', ...extra });
function server(training = {}, extra = {}) {
  const S = makeServer({
    workspaces: { CLUB: JSON.parse(JSON.stringify(CLUB)) },
    training: { CLUB: { avail: { b1: block('b1'), g1: group('g1', { start: '10:00', end: '12:00' }), off: block('off', { off: true }) }, ...training } },
    ...extra
  });
  S.loadFunctions();
  return S;
}
let n = 0;
const ask = (S, uid, v) => S.fire(`bookAsks/CLUB/${uid}/a${++n}`, { at: Date.now(), ...v }).then(r => r.bookAsk);
const bk = (S, uid, extra) => ask(S, uid, { op: 'book', block: 'b1', start: '18:00', tid: 't1', pid: 'p1', ...extra });
const SID = 'k_coach_' + D + '_1800';
const T = 'training/CLUB/';

(async () => {
  console.log('--- what is deployed ---');
  {
    const S = server();
    check('an ask wakes the booking call', S.woken('bookAsks/CLUB/mum/x').join(), 'bookAsk');
    check('its answer, written beneath it, wakes nothing', S.woken('bookAsks/CLUB/mum/x/answer').length, 0);
    check('a booking changing wakes the waiting list', S.woken(T + 'booked/s1/p1').includes('bookFreed'), true);
  }

  console.log('\n--- a family books a 1-1 for her own child ---');
  {
    const S = server();
    const a = await bk(S, 'mum', { want: 'Weak foot' });
    deepEq('she is in', [a.ok, a.st, a.sid], [true, 'in', SID]);
    const ans = S.at(`bookAsks/CLUB/mum/a${n}/answer`);
    check('the answer is written beside the ask', !!(ans && ans.ok && ans.at), true);
    const s = S.at(T + 'sessions/' + SID);
    check('the slot is made as a session, under its time', s && s.id, SID);
    deepEq('copied from the window', [s.coach, s.date, s.start, s.end, s.kind, s.cap, s.price, s.notice, s.slot, s.open], ['coach', D, '18:00', '19:00', 'one', 1, 30, 24, 'b1', false]);
    check('its start worked out from the coach\'s own midnight', s.t0, D0 + 18 * 3600000);
    const b = S.at(T + 'booked/' + SID + '/p1');
    deepEq('her child booked, in her name, with what she wants', [b.st, b.by, b.tid, b.want], ['in', 'mum', 't1', 'Weak foot']);
    check('no seat anywhere', S.at(T + 'seats'), null);

    const again = await bk(S, 'mum');
    deepEq('asking again books nothing twice', [again.ok, again.st, again.already], [true, 'in', true]);
    const g = await bk(S, 'gran', { pid: 'p2' });
    deepEq('another family: the 1-1 is full', [g.ok, g.why], [false, 'full']);
    check('and nothing is written for her', S.at(T + 'booked/' + SID + '/p2'), null);
    const w = await bk(S, 'gran', { pid: 'p2', wait: true });
    deepEq('unless she asks for the waiting list', [w.ok, w.st], [true, 'wait']);
    const sib = await bk(S, 'mum', { pid: 'p3' });
    deepEq('a sibling cannot take the same 1-1 either', [sib.ok, sib.why], [false, 'full']);
  }

  console.log('\n--- who may ask ---');
  for (const [who, uid, extra, why] of [
    ['not for somebody else\'s child', 'mum', { pid: 'p2' }, 'family'],
    ['not claiming another team', 'mum', { tid: 't2' }, 'family'],
    ['the coach books nobody through here', 'coach', {}, 'family'],
    ['nor a tracker', 'trk', {}, 'family'],
    ['nor an admin for a child not hers', 'adm', {}, 'family'],
    ['nor a family of another team', 'dad', {}, 'family'],
    ['nor somebody not in the club', 'stranger', {}, 'club'],
    ['not off the grid: 5:30 is no slot', 'mum', { start: '17:30' }, 'gone'],
    ['not past the window\'s end', 'mum', { start: '19:00' }, 'gone'],
    ['not in a window that does not exist', 'mum', { block: 'nope' }, 'gone'],
    ['not in a week taken off', 'mum', { block: 'off' }, 'off']
  ]) {
    const S = server();
    const a = await bk(S, uid, extra);
    deepEq(who, [a.ok, a.why], [false, why]);
    check('  and nothing is booked', S.at(T + 'booked') || S.at(T + 'sessions'), null);
  }
  {
    const S = server();
    const a = await ask(S, 'mum', { op: 'book', block: 'b1', start: '18:00', tid: 't1', pid: 'p1', at: Date.now() - 15 * 60000 });
    deepEq('an ask the phone has given up on is not acted on', [a.ok, a.why], [false, 'late']);
    const b = await ask(S, 'mum', { op: 'steal', pid: 'p1' });
    deepEq('nor one that is neither booking nor cancelling', [b.ok, b.why], [false, 'bad']);
  }
  {
    const S = server({ avail: { b1: block('b1', { date: iso(today0 - 2 * DAY), day0: today0 - 2 * DAY }) } });
    const a = await bk(S, 'mum');
    deepEq('not in the past', [a.ok, a.why], [false, 'past']);
  }
  {
    const S = server({}, { retired: { CLUB: true } });
    deepEq('not in a retired club', [(await bk(S, 'mum')).why], ['club']);
  }
  {
    // a window from before day0 was written: each slot's own start, as the coach's phone listed it
    const S = server({ avail: { b1: { ...block('b1'), day0: null, slots: { t1800: { end: '19:00', at: D0 + 18 * 3600000 + 7 } } } } });
    await bk(S, 'mum');
    check('an older window\'s slot start is used as it was listed', S.at(T + 'sessions/' + SID).t0, D0 + 18 * 3600000 + 7);
  }

  console.log('\n--- the coach must be free, as the club stands now ---');
  {
    const S = COACH_T2(server());
    S.put('workspaces/CLUB/teams/t2/events/e1', { id: 'e1', kind: 'practice', date: D, start: '17:30', end: '18:30', title: 'Practice' });
    deepEq('a practice of a team she coaches, added from any phone, takes the slot out', [(await bk(S, 'mum')).why], ['busy']);
    deepEq('one that does not overlap leaves the next slot free', [(await bk(S, 'mum', { start: '17:00' })).why], ['busy']);
    S.put(T + 'away/coach/c1', { id: 'c1', kind: 'callout', item: 'e:e1', tid: 't2', date: D, by: 'coach', at: 1 });
    check('called out of it, she is free again', (await bk(S, 'gran', { pid: 'p2' })).st, 'in');
  }
  {
    const S = server();
    S.put('workspaces/CLUB/teams/t2/events/e1', { id: 'e1', kind: 'practice', date: D, start: '17:30', end: '18:30' });
    check('a team she does not coach is nothing to her', (await bk(S, 'mum')).st, 'in');
  }
  {
    const S = COACH_T2(server());
    S.put('workspaces/CLUB/matches/g1', { id: 'g1', teamId: 't2', date: D, kickoff: '17:00', periodCount: 2, periodMinutes: 25 });
    deepEq('a game of hers runs over it (two halves and a bit)', [(await bk(S, 'mum')).why], ['busy']);
    S.put('workspaces/CLUB/matches/g1/called', 'cancelled');
    check('called off, it does not', (await bk(S, 'mum')).st, 'in');
  }
  {
    const S = server({ sessions: { s9: { id: 's9', kind: 'group', coach: 'coach', date: D, start: '18:30', end: '19:30', cap: 6 } } });
    deepEq('another session she runs', [(await bk(S, 'mum')).why], ['busy']);
  }
  {
    const S = server({ away: { coach: { w: { id: 'w', kind: 'weekly', days: [new Date(D0).getUTCDay()], start: '18:00', end: '20:00', by: 'coach', at: 1 } } } });
    deepEq('her weekly time off', [(await bk(S, 'mum')).why], ['busy']);
    check('the hour before it is still bookable', (await bk(S, 'mum', { start: '17:00' })).st, 'in');
  }
  {
    const S = server({ away: { coach: { d: { id: 'd', kind: 'dates', from: D, to: D, by: 'adm', at: 1 } } } });
    deepEq('dates away, all day', [(await bk(S, 'mum')).why], ['busy']);
  }
  {
    const here = book.clubTag('CLUB');
    const S = server({}, { people: { coach: { busy: {
      zzz: { b: { 0: { d: D, s: '18:15', e: '19:00' } } },
      [here]: { b: { 0: { d: D, s: '17:00', e: '17:45' } } }
    } } } });
    deepEq('busy at another club she shares', [(await bk(S, 'mum')).why], ['busy']);
    check('this club\'s own published times are not counted twice', (await bk(S, 'mum', { start: '17:00' })).st, 'in');
  }
  {
    // a slot already held by a family is hers already: a practice added after does not turn the next family away
    const S = COACH_T2(server());
    S.put(T + 'avail/g1', group('g1'));
    const G = 'k_coach_' + D + '_1800';
    await bk(S, 'mum', { block: 'g1' });
    S.put('workspaces/CLUB/teams/t2/events/e1', { id: 'e1', kind: 'practice', date: D, start: '17:30', end: '18:30' });
    check('a group already running takes the next family', (await bk(S, 'gran', { block: 'g1', pid: 'p2' })).st, 'in');
    check('in the same slot', !!S.at(T + 'booked/' + G + '/p2'), true);
  }

  console.log('\n--- and so must the child ---');
  {
    // another team's coach, so it is the child who is busy and not her
    const S = server({ avail: { o1: block('o1', { coach: 'other', start: '10:00', end: '12:00' }) } });
    S.put('workspaces/CLUB/teams/t1/events/e1', { id: 'e1', kind: 'practice', date: D, start: '10:30', end: '11:30' });
    const a = await bk(S, 'mum', { block: 'o1', start: '10:00' });
    deepEq('her own team\'s practice', [a.ok, a.why], [false, 'kidbusy']);
  }
  {
    const S = server({ sessions: { s9: { id: 's9', kind: 'group', coach: 'other', date: D, start: '18:30', end: '19:30', cap: 6 } }, booked: { s9: { p1: { tid: 't1', st: 'in', by: 'other', at: 1 } } } });
    deepEq('another session she is in', [(await bk(S, 'mum')).why], ['kidbusy']);
    check('a sibling who is not in it books', (await bk(S, 'mum', { pid: 'p3' })).st, 'in');
  }

  console.log('\n--- a group: counted, then a waiting list ---');
  {
    const S = server();
    const G = 'k_coach_' + D + '_1000';
    const g = (uid, pid, extra) => bk(S, uid, { block: 'g1', start: '10:00', pid, ...extra });
    check('the first family makes the group slot', (await g('mum', 'p1')).st, 'in');
    check('a second family joins it', (await g('gran', 'p2')).st, 'in');
    deepEq('the third is told it is full', [(await g('mum', 'p3')).why], ['full']);
    check('and the count holds', Object.values(S.at(T + 'booked/' + G)).filter(x => x.st === 'in').length, 2);
    check('the third asks for the waiting list', (await g('mum', 'p3', { wait: true })).st, 'wait');
    // the coach turns one down from her own phone: the trigger hears the place come free
    const r = await S.fire(T + 'booked/' + G + '/p2', { tid: 't1', st: 'no', by: 'coach', at: 2 });
    deepEq('the first on the waiting list is moved in', r.bookFreed.promoted, ['p3']);
    const p3 = S.at(T + 'booked/' + G + '/p3');
    deepEq('by the server', [p3.st, p3.by], ['in', 'server']);
    deepEq('the one turned down cannot book back in', [(await g('gran', 'p2')).why], ['no']);
  }
  {
    const S = server({ sessions: { [SID]: { id: SID, kind: 'one', coach: 'coach', date: D, start: '18:00', end: '19:00', t0: Date.now() + 3 * DAY, cap: 1, slot: 'b1', notice: 24 } },
      booked: { [SID]: { p1: { tid: 't1', st: 'in', by: 'mum', at: 1 }, p2: { tid: 't1', st: 'wait', by: 'gran', at: 5 }, q1: { tid: 't2', st: 'wait', by: 'dad', at: 3 } } } });
    const r = await S.fire(T + 'booked/' + SID + '/p1', null);
    deepEq('a place given back goes to whoever joined the list first', r.bookFreed.promoted, ['q1']);
    check('the next stays waiting', S.at(T + 'booked/' + SID + '/p2').st, 'wait');
    const r2 = await S.fire(T + 'booked/' + SID + '/q1', { tid: 't2', st: 'in', by: 'server', at: 9, want: 'x' });
    deepEq('a booking changing in some other way moves nobody', r2.bookFreed.promoted, []);
  }
  {
    const S = server({ sessions: { s1: { id: 's1', kind: 'group', coach: 'coach', date: D, start: '18:00', t0: Date.now() + DAY, cap: 1 } },
      booked: { s1: { p1: { tid: 't1', st: 'in', by: 'coach', at: 1 }, p2: { tid: 't1', st: 'wait', by: 'coach', at: 2 } } } });
    const r = await S.fire(T + 'booked/s1/p1', { tid: 't1', st: 'out', by: 'mum', at: 3 });
    deepEq('on an ordinary session the waiting list is the coach\'s', r.bookFreed.promoted, []);
  }

  console.log('\n--- cancelling, held to the coach\'s notice ---');
  const held = (t0, extra = {}) => server({
    sessions: { [SID]: { id: SID, kind: 'one', coach: 'coach', date: D, start: '18:00', end: '19:00', t0, cap: 1, slot: 'b1', notice: 24, by: 'mum' } },
    booked: { [SID]: { p1: { tid: 't1', st: 'in', by: 'mum', at: 1 } } }, ...extra
  });
  const cx = (S, uid, pid = 'p1') => ask(S, uid, { op: 'cancel', sid: SID, pid });
  {
    const S = held(Date.now() + 3 * DAY);
    deepEq('another family cannot take her place off', [(await cx(S, 'gran')).why], ['family']);
    check('her place is still there', S.at(T + 'booked/' + SID + '/p1').st, 'in');
    check('she cancels, a day and more ahead', (await cx(S, 'mum')).ok, true);
    check('her place is gone', S.at(T + 'booked/' + SID), null);
    check('and with nobody left, the slot itself, so the time is free', S.at(T + 'sessions/' + SID), null);
    check('what it was kept where only the server reads, for the coach\'s push', S.at('serverState/slotGone/CLUB/' + SID).coach, 'coach');
  }
  {
    const S = held(Date.now() + 3 * 3600000);
    deepEq('inside the notice, she cannot', [(await cx(S, 'mum')).why], ['notice']);
    check('and nothing changes', S.at(T + 'booked/' + SID + '/p1').st, 'in');
  }
  {
    const S = held(Date.now() + 3 * 3600000, {});
    S.put(T + 'booked/' + SID + '/p3', { tid: 't1', st: 'wait', by: 'mum', at: 2 });
    check('a waiting-list place can be given back inside the notice', (await cx(S, 'mum', 'p3')).ok, true);
    check('and the slot stays for the child in it', !!S.at(T + 'sessions/' + SID), true);
  }
  {
    const S = held(Date.now() - 3600000);
    deepEq('not once it has started', [(await cx(S, 'mum')).why], ['past']);
  }
  {
    const S = held(Date.now() + 3 * DAY, {});
    S.put(T + 'fees/' + SID + '/p1', { paid: 30, how: 'cash', at: 1, by: 'coach' });
    deepEq('nor once it has been paid for', [(await cx(S, 'mum')).why], ['paid']);
  }
  {
    const S = held(Date.now() + 3 * DAY, {});
    S.put(T + 'booked/' + SID + '/p2', { tid: 't1', st: 'in', by: 'gran', at: 1 });
    await cx(S, 'mum');
    check('a slot with somebody else still in it stays', !!S.at(T + 'sessions/' + SID), true);
  }
  {
    const S = server({ sessions: { s1: { id: 's1', kind: 'group', coach: 'coach', date: D, start: '18:00', t0: Date.now() + DAY, cap: 4 } }, booked: { s1: { p1: { tid: 't1', st: 'in', by: 'coach', at: 1 } } } });
    deepEq('a session a coach made is not cancelled through here', [(await ask(S, 'mum', { op: 'cancel', sid: 's1', pid: 'p1' })).why], ['gone']);
  }

  console.log('\n--- an ask is answered once ---');
  {
    const S = server();
    const v = { op: 'book', block: 'b1', start: '18:00', tid: 't1', pid: 'p1', at: Date.now() };
    const r = await book.onAsk({
      get: p => S.ref(p).get().then(s => s.val()), set: (p, x) => S.ref(p).set(x), remove: p => S.ref(p).remove(),
      claim: (p, fn) => S.ref(p).transaction(fn).then(x => !!x.committed),
      dated: (p, d) => S.ref(p).orderByChild('date').equalTo(d).get().then(s => s.val())
    }, { code: 'CLUB', uid: 'mum', id: 'gone' }, v);
    check('an ask the phone has already taken back is not acted on', r.why, 'withdrawn');
    check('nothing booked, and no answer left behind', S.at(T + 'booked') || S.at('bookAsks'), null);
  }
  {
    const S = server();
    const at = Date.now();
    await S.fire('bookAsks/CLUB/mum/dup', { op: 'book', block: 'b1', start: '18:00', tid: 't1', pid: 'p1', at });
    const first = S.at('bookAsks/CLUB/mum/dup/answer');
    const r = await book.onAsk({
      get: p => S.ref(p).get().then(s => s.val()), set: (p, v) => S.ref(p).set(v), remove: p => S.ref(p).remove(),
      claim: (p, fn) => S.ref(p).transaction(fn).then(x => !!x.committed),
      dated: (p, d) => S.ref(p).orderByChild('date').equalTo(d).get().then(s => s.val())
    }, { code: 'CLUB', uid: 'mum', id: 'dup' }, { op: 'book', block: 'b1', start: '18:00', tid: 't1', pid: 'p1', at });
    check('delivered twice, the second finds the answer and does nothing', r.why, 'twice');
    deepEq('the first answer stands', S.at('bookAsks/CLUB/mum/dup/answer'), first);
  }
  {
    const S = server({}, { serverState: { moving: { CLUB: { at: 1 } } } });
    const r = await S.fire('bookAsks/CLUB/mum/m1', { op: 'book', block: 'b1', start: '18:00', tid: 't1', pid: 'p1', at: Date.now() });
    check('while the club is moving, the ask is left for the phone to ask again', r.bookAsk, null);
    check('and nothing is booked', S.at(T + 'booked'), null);
  }

  /* A child in the club on no team (AUTH.md, *Sessions for a child on no
     team*) books as `club`, her family found on her club record. On orgs/
     only: the old tree has no club records. */
  console.log('\n--- a child in the club on no team ---');
  {
    const ORGS = require('./fakebase').ORGS_MODE;
    const S = server();
    S.put('workspaces/CLUB/children/k5', { id: 'k5', first: 'Mia', club: true, by: 'adm', at: 1, family: { kmum: 'ik' } });
    S.put('workspaces/CLUB/children/k6', { id: 'k6', first: 'Zed', by: 'kz', at: 1, family: { kz: 'rl' } });
    S.put('workspaces/CLUB/access/index/kmum', 'k5'); S.put('workspaces/CLUB/access/index/kz', true);
    const a = await bk(S, 'kmum', { tid: 'club', pid: 'k5' });
    check(ORGS ? 'her family books her, as the club' : 'on the old tree there is no such child', a.ok, ORGS);
    if (ORGS) check('— the booking says so', S.at(T + 'booked/' + SID + '/k5').tid, 'club');
    const b = await bk(S, 'kmum', { tid: 'club', pid: 'k6', start: '17:00' });
    deepEq('a child not hers is refused', [b.ok, b.why], [false, 'family']);
    const c = await bk(S, 'kz', { tid: 'club', pid: 'k6', start: '17:00' });
    deepEq('— and one the club has not let in', [c.ok, c.why], [false, 'family']);
  }

  H.summary('booking a coach\'s time, as one server call');
})().catch(e => { console.error(e); process.exit(1); });
