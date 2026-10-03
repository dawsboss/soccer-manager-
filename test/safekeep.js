/* Nothing floats away: what this phone still owes the club is counted in one
   place, a phone that can't keep a change says so, and a backup holds the
   whole club, training included, and restores only what the club is missing.

   - One count. The badge, the banner on every screen and "Not saved to the
     club yet" include practice plans, drills and training sessions as well as
     the workspace outbox, so "synced" is never said while any of it is still
     only here. A refused session is marked per record, survives a reload, and
     is retried or dropped from the same sheet.
   - A full phone. A save the browser refuses used to be swallowed; now the
     coach is told once, and every screen says so until a save gets through.
   - The backup. *Download a copy* carries sessions, bookings, registers, fees,
     pay rates, practice plans and the club's drills, laid over the club's own
     copy where it could ask. *Load from a file* puts back only what the club
     is missing, never on top of something it has, and nothing it could not
     check. */

const H = require('./harness');
const { check, deepEq } = H;
const { makeFakebase } = require('./fakebase');

const CONFIG = { apiKey: 'k', databaseURL: 'https://prod.example', projectId: 'p' };
const CODE = 'CLUB';
const WS = 'workspaces/' + CODE;
const TR = 'training/' + CODE + '/';

const club = () => ({
  teams: {
    t1: { id: 't1', name: 'G11 Flight', birthYear: 2016, players: {
      p1: { id: 'p1', name: 'Rosa Smith', number: '9', active: true, guardians: { mum: true } },
      p2: { id: 'p2', name: 'Ella Fitz', number: '7', active: true } } }
  },
  matches: {},
  access: {
    admins: { boss: true }, index: { boss: true, jaz: true, mum: true },
    members: { boss: { name: 'Ada' }, jaz: { name: 'Jaz' }, mum: { name: 'Mo', email: 'mo@x.test' } },
    teams: { t1: { coaches: { jaz: true } } }, coachIndex: { jaz: 't1' },
    org: { name: 'Lakeside SC', venues: { v1: { id: 'v1', name: 'Lakeside Park', pitches: 1, permits: {} } } }
  }
});
const session = (id, extra = {}) => ({ id, kind: 'group', coach: 'jaz', coachName: 'Jaz', date: '2026-10-07', start: '17:00', end: '18:00', cap: 4, price: 20, open: true, ...extra });
const BLANK = () => ({ sessions: {}, booked: {}, came: {}, fees: {}, pay: {}, splans: {}, dirty: {}, refused: {} });

async function device(uid, storage = {}) {
  const fbk = makeFakebase();
  const D = H.loadApp({ firebase: fbk, config: CONFIG, storage: { 'sm.workspace': CODE, ...storage } });
  await D.flush();
  fbk.signIn(uid, { name: (club().access.members[uid] || {}).name || uid }); await D.flush();
  fbk.deliver(WS, club()); await D.flush();
  D.render();
  return { D, fbk };
}
const sheet = D => String(D.dom.node('#sheet').innerHTML || '');
const badge = D => String(D.dom.node('#syncBadge').textContent || '');

(async () => {

  console.log('--- one count for everything not yet with the club ---');
  {
    const { D, fbk } = await device('jaz');
    fbk.deliver(TR + 'sessions', {}); fbk.deliver(TR + 'booked', {}); fbk.deliver(TR + 'came', {}); await D.flush();
    fbk.holdWrites(p => p.startsWith(TR));        // no signal for training writes
    D.click({ act: 'sessnew' });
    for (const [k, v] of Object.entries({ ssTitle: 'Finishing', ssDate: '2026-10-08', ssStart: '17:00', ssEnd: '18:00', ssField: '', ssPlace: 'Hill End', ssPrice: '', ssLo: '', ssHi: '', ssFocus: '', ssNotes: '' })) D.dom.node('#' + k).value = v;
    D.click({ act: 'sesssave' });
    await D.flush();
    check('an unsent session is counted', D.pendingCount(), 1);
    check('and the badge says so, not "synced"', badge(D), '1 to send');
    D.click({ act: 'pendingsheet' });
    check('"Not saved to the club yet" lists it', /a training session/.test(sheet(D)), true);
    check('as waiting', /<span class="tag">waiting<\/span>/.test(sheet(D)), true);
  }
  {
    const { D, fbk } = await device('jaz');
    fbk.deliver(TR + 'sessions', {}); await D.flush();
    fbk.refuseWrites(p => p.startsWith(TR + 'sessions/'));     // rules not pasted yet
    D.click({ act: 'sessnew' });
    for (const [k, v] of Object.entries({ ssTitle: 'Keepers', ssDate: '2026-10-08', ssStart: '17:00', ssEnd: '18:00', ssField: '', ssPlace: 'Hill End', ssPrice: '', ssLo: '', ssHi: '', ssFocus: '', ssNotes: '' })) D.dom.node('#' + k).value = v;
    D.click({ act: 'sesssave' });
    await D.flush();
    check('a refused session is kept', D.sessAll().some(s => s.title === 'Keepers'), true);
    check('and counted as refused', D.refusedCount(), 1);
    check('the badge says it is not saved', badge(D), '1 not saved');
    D.ui.view = 'club'; D.render();
    check('and every screen says so, not just Training sessions', /hasn't been accepted by the club's database/.test(D.rendered()), true);
    D.click({ act: 'pendingsheet' });
    check('the sheet marks it refused', /a training session<\/span><span class="tag wait">refused/.test(sheet(D)), true);
    check('and offers to drop it', /data-act="pendingdrop"/.test(sheet(D)), true);

    const saved = { ...D.storage._d };
    fbk.refuseWrites(null);
    D.click({ act: 'pendingretry' });
    await D.flush();
    check('"Try again" sends it, and once accepted nothing is owed', D.pendingCount(), 0);
    check('and the badge stops warning', /not saved|to send/.test(badge(D)), false);
    // the mark survives a reload (last: a second app takes over the shared stub DOM)
    const D2 = H.loadApp({ firebase: makeFakebase(), config: CONFIG, storage: saved });
    check('after a reload it is still marked refused', D2.refusedCount(), 1);
  }
  {
    const { D, fbk } = await device('jaz');
    fbk.deliver(TR + 'sessions', { s1: session('s1') }); await D.flush();
    fbk.refuseWrites(p => p.startsWith(TR));
    D.click({ act: 'sesscall', id: 's1' });
    await D.flush();
    check('a refused change to a session is owed', D.refusedCount(), 1);
    D.click({ act: 'pendingdrop' });
    check('dropping it takes the mark away', D.refusedCount(), 0);
    D.render();
    fbk.deliver(TR + 'sessions', { s1: session('s1') }); await D.flush();
    check('and the club\'s copy comes back in its place', D.sessById('s1').called, '');
  }

  console.log('\n--- a phone with no room left ---');
  {
    const { D } = await device('jaz');
    const real = D.storage.setItem;
    D.storage.setItem = function () { throw new Error('QuotaExceededError'); };
    D.toasts.length = 0;
    D.click({ act: 'sessnew' });
    for (const [k, v] of Object.entries({ ssTitle: 'Full', ssDate: '2026-10-08', ssStart: '17:00', ssEnd: '18:00', ssField: '', ssPlace: 'Hill End', ssPrice: '', ssLo: '', ssHi: '', ssFocus: '', ssNotes: '' })) D.dom.node('#' + k).value = v;
    D.click({ act: 'sesssave' });
    check('a save the phone refuses is said out loud', D.toasts.some(t => /out of storage space/.test(t)), true);
    check('once, not once per save', D.toasts.filter(t => /out of storage space/.test(t)).length, 1);
    D.ui.view = 'club'; D.render();
    check('and on every screen until it is fixed', /This phone is out of storage space/.test(D.rendered()), true);
    D.storage.setItem = real;
    D.state.teams.t1.name = 'G11 Flight'; D.render();
    D.click({ act: 'goview', v: 'club' });
    // the next real save that gets through clears it
    D.keepStored('sm.test', '1');
    D.render();
    check('the warning goes once a save gets through', /out of storage space/.test(D.rendered()), false);
  }

  console.log('\n--- the backup holds the whole club ---');
  {
    /* No database: this phone's copy is the club's. */
    const A = H.loadApp();
    A.state = club(); A.me = { uid: 'boss', name: 'Ada' };
    A.sess = { ...BLANK(), sessions: { s1: session('s1') }, booked: { s1: { p1: { tid: 't1', st: 'in', by: 'jaz', at: 1 } } },
      came: { s1: { p1: true } }, fees: { s1: { p1: { paid: 20, how: 'cash', at: 1, by: 'jaz' } } }, pay: { jaz: { rate: 30, per: 'hour' } },
      splans: { s1: { blocks: [{ drill: { shelf: 'builtin', id: 'rondo-4v1' }, name: 'Rondo', minutes: 12 }], at: 1 } } };
    A.train = { ...A.train, practices: { t1: { pr1: { id: 'pr1', teamId: 't1', date: '2026-10-06', start: '17:30', minutes: 60, blocks: [], status: 'plan' } } }, schedule: {}, dirty: {} };
    const { doc, missed } = await A.backupDoc();
    check('teams, games and roles, as before', !!doc.teams.t1 && !!doc.access.admins.boss, true);
    check('the club\'s fields', !!doc.access.org.venues.v1, true);
    deepEq('training sessions, bookings, registers, fees, pay and drills', ['sessions', 'booked', 'came', 'fees', 'pay', 'splans'].map(k => Object.keys(doc.training[k]).length), [1, 1, 1, 1, 1, 1]);
    check('the fee itself', doc.training.fees.s1.p1.paid, 20);
    check('practice plans', !!doc.training.practices.t1.pr1, true);
    check('nothing it could not check', missed.size, 0);
    check('the outbox and dirty marks are not in it', JSON.stringify(doc.training).includes('"dirty"'), false);
    A.click({ act: 'export' });
    await A.flush();
    check('Download a copy writes that', !!(A.lastBackup && A.lastBackup.doc.training.sessions.s1), true);
    check('and says what is in it', /training sessions.*fees.*practice plans/.test(A.lastToast() || ''), true);

    console.log('\n--- and puts back only what the club is missing ---');
    const file = JSON.stringify(doc);
    // the club since then: one session deleted, one fee changed, a field and a plan lost
    A.sess = { ...BLANK(), sessions: {}, fees: {}, booked: {}, came: {}, pay: { jaz: { rate: 35, per: 'hour' } } };
    A.train = { ...A.train, practices: {} };
    delete A.state.access.org.venues.v1;
    A.state.access.org.venues.v2 = { id: 'v2', name: 'Lakeside Park', pitches: 2 };
    const plan = A.importPlan(JSON.parse(file));
    deepEq('no errors', plan.errors, []);
    check('the missing session, its booking, register, fee and drills come back', plan.sessWrites.map(([p]) => p.split('/')[0]).sort().join(), 'booked,came,fees,sessions,splans');
    check('the session before what hangs off it', plan.sessWrites[0][0], 'sessions/s1');
    check('a pay rate the club changed since keeps the club\'s', plan.sessWrites.some(([p]) => p.startsWith('pay/')), false);
    check('the lost practice plan comes back', plan.trainWrites.some(([w, v]) => w === 'practice' && v.id === 'pr1'), true);
    check('a field the club has under the same name is not doubled', plan.writes.some(([p]) => p.startsWith('access/org/venues/')), false);
    check('and it says what it adds', /training records/.test(A.importSummary(plan.counts)), true);
    A.dom.node('#impText').value = file;
    A.click({ act: 'importgo' });
    check('restored into the club', !!A.sessById('s1') && A.feeOf('s1', 'p1').paid === 20, true);
    check('the plan restored', !!A.practiceById('t1', 'pr1'), true);
    check('the club\'s newer pay rate kept', A.sess.pay.jaz.rate, 35);
    const again = A.importPlan(JSON.parse(file));
    check('loading it again adds nothing', again.sessWrites.length + again.trainWrites.length + again.writes.length, 0);
    check('an old backup with no training still loads', A.importPlan({ teams: {}, matches: {} }).errors.length, 0);
  }

  console.log('\n--- with a database: asked first, never written blind ---');
  {
    const { D, fbk } = await device('boss');
    fbk.deliver(TR + 'sessions', {}); fbk.deliver(TR + 'booked', {}); fbk.deliver(TR + 'came', {}); fbk.deliver(TR + 'fees', {}); fbk.deliver(TR + 'pay', {}); await D.flush();
    const p = D.backupDoc();
    await D.flush();
    // the club answers for what this phone doesn't hold: a session, its drills, a team's plans
    fbk.deliver(TR + 'sessions', { s9: session('s9') });
    for (const k of ['booked', 'came', 'fees', 'pay']) fbk.deliver(TR + k, {});
    fbk.deliver(TR + 'practices/t1', { pr9: { id: 'pr9', teamId: 't1', date: '2026-10-09' } });
    fbk.deliver(TR + 'drills', {});
    await D.flush();
    // splans/s9 was never asked: s9 was not on this phone when the backup started
    const { doc, missed } = await p;
    check('the club\'s own records are in the backup', !!doc.training.sessions.s9 && !!doc.training.practices.t1.pr9, true);
    check('and nothing was missed', missed.size, 0);

    // restoring a file whose records the club could not be asked about
    const file = JSON.stringify({ teams: {}, matches: {}, training: { sessions: { s5: session('s5') } } });
    D.dom.node('#impText').value = file;
    D.click({ act: 'bulkimport' });
    D.click({ act: 'importcheck' });
    check('the sheet asks the club before saying anything', /Checking what the club already has/.test(sheet(D)), true);
    check('and offers no Import button while it asks', /data-act="importgo"/.test(sheet(D)), false);
    D.click({ act: 'importgo' });
    check('a tap on Import meanwhile writes nothing', fbk.record.writes.some(w => w.path.includes('/s5')), false);
    fbk.refuse(TR + 'sessions');
    for (const k of ['booked', 'came', 'fees', 'pay', 'drills', 'splans/s5', 'splans/s9', 'practices/t1']) fbk.deliver(TR + k, null);
    await D.flush();
    check('what could not be checked is not restored', /not restored, because this phone could not check/.test(sheet(D)), true);
    check('and no Import button for nothing', /data-act="importgo"/.test(sheet(D)), false);
  }

  H.summary('safekeeping');
})();
