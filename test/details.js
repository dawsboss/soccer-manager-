/* Getting families to finish their children's details (AUTH.md, *Getting
   families to finish their children's details*; the owner, 2026-10-10),
   against the fake Firebase on a club on orgs/. What is pinned:

   - A family with a child still to finish (not confirmed, or missing
     something the club requires) is told on every screen and asked once a
     day; nothing is closed until the club's deadline has passed.
   - After it, her calendar, messages, the bell, My players and her settings
     stay open and nothing else does, until it is finished; staff are never
     kept out, and a phone that has not heard her care details yet does not
     count "someone to call" as missing.
   - Admins choose what is required and the deadline, checked in the click
     handler, and see who is still to finish. */

const H = require('./harness');
const { check, deepEq } = H;
const { makeFakebase } = require('./fakebase');

const CONFIG = { apiKey: 'k', databaseURL: 'https://prod.example', projectId: 'p' };
const OB = 'orgs/CLUB';
const valueAt = (fbk, p) => { const w = fbk.writtenTo(p); return w.length ? w[w.length - 1].value : undefined; };
const DONE = { by: 'mumU', at: 2, contacts: { 0: { name: 'Mo', phone: '555' } } };

const ORG = (details) => ({
  access: {
    admins: { adm: true },
    index: { adm: true, coachU: true, mumU: true },
    teams: { t1: { coaches: { coachU: true } } },
    teamIndex: { t1: { coachU: 'coach' } },
    coachIndex: { coachU: 't1' },
    teamParents: { t1: { mumU: 'p1', coachU: 'p2' } }
  },
  org: { name: 'Lakeside SC', ...(details ? { details } : {}) },
  members: { adm: { name: 'Ada' }, coachU: { name: 'Jaz' } },
  names: { adm: { name: 'Ada' }, coachU: { name: 'Jaz' } },
  teams: { t1: { id: 't1', name: 'Flight', events: {} } },
  squad: { t1: {
    p1: { id: 'p1', name: 'Ella Fitz', number: '7', active: true, guardians: { mumU: true }, child: 'p1' },
    p2: { id: 'p2', name: 'Kit Jones', number: '8', active: true, guardians: { coachU: true }, child: 'p2' }
  } },
  children: {
    p1: { id: 'p1', first: 'Ella', last: 'Fitz', born: '2016-05-03', gender: 'F', club: true, by: 'club', at: 1, teams: { t1: 'p1' }, guardians: { mumU: 't1' } },
    p2: { id: 'p2', first: 'Kit', club: true, by: 'club', at: 1, teams: { t1: 'p2' }, guardians: { coachU: 't1' } }
  },
  roster: { t1: { p1: { number: '7', active: true }, p2: { number: '8', active: true } } },
  matches: {}, rsvp: {}
});
function rulesFor(uid, org, deny = () => false) {
  const a = org.access, admin = !!a.admins[uid], coach = !!(a.coachIndex || {})[uid];
  return p => {
    const rel = p.slice(OB.length + 1);
    if (deny(rel)) return true;
    if (!a.index[uid]) return true;
    if (rel === 'members') return !(admin || coach);
    if (rel === 'members/' + uid) return false;
    if (rel === 'log') return !admin;
    if (/^(coachNotes|children)$/.test(rel) || rel.startsWith('coachNotes/')) return !(admin || coach);
    let m = /^(?:children|care)\/([^/]+)$/.exec(rel);
    if (m) { const c = (org.children || {})[m[1]] || {}; return !(admin || (rel.startsWith('children') && coach) || (c.guardians || {})[uid] || (c.family || {})[uid]); }
    m = /^squad\/([^/]+)$/.exec(rel);
    if (m) return !(admin || coach || ((a.teamIndex || {})[m[1]] || {})[uid]);
    m = /^squad\/([^/]+)\/([^/]+)$/.exec(rel);
    if (m) { const rec = ((org.squad || {})[m[1]] || {})[m[2]] || {}; return !(admin || coach || (rec.guardians || {})[uid]); }
    if (/^teamCare\/([^/]+)$/.test(rel)) return !(admin || ((a.teamIndex || {})[rel.split('/')[1]] || {})[uid] === 'coach');
    return false;
  };
}
async function boot(who, org, opts = {}) {
  const fbk = makeFakebase();
  const A = H.loadApp({ firebase: fbk, config: CONFIG, storage: { 'sm.workspace': 'CLUB', ...(opts.storage || {}) } });
  await A.flush();
  A.dom.node('#sheet').hidden = true; A.dom.node('#scrim').hidden = true;
  fbk.signIn(who, { name: who }); await A.flush();
  fbk.deliver('.info/connected', true);
  await fbk.serve(OB, org, () => A.flush(), rulesFor(who, org, opts.deny));
  await A.flush(10);
  return { A, fbk };
}
const sheet = A => String(A.dom.node('#sheet').innerHTML);
const go = (A, v) => { A.ui.view = v; A.ui.teamId = 't1'; A.render(); return A.ui.view; };
const asked = { 'sm.kidask.v1:mumU:CLUB:p1': '2000-01-01' };

(async () => {
  console.log('--- reminded, never kept out ---');
  {
    const { A } = await boot('mumU', ORG());
    check('asked straight away', /Check Ella/.test(sheet(A)), true);
    A.dom.node('#sheet').hidden = true;
    check('her team\'s Season is open to her', go(A, 'season'), 'season');
    check('— with a strip saying her child\'s details aren\'t finished', /Ella’s details aren’t finished/.test(A.rendered()), true);
    check('— and a way to finish them', /data-act="kidopen" data-id="p1"/.test(A.rendered()), true);
    check('— saying nothing will close', /calendar and messages only/.test(A.rendered()), false);
    check('the strip is on the calendar too', go(A, 'calendar') === 'calendar' && /details aren’t finished/.test(A.rendered()), true);
  }
  {
    const org = ORG({ by: '2099-12-31' });
    const { A } = await boot('mumU', org, { storage: asked });
    check('before the deadline, still open', go(A, 'season'), 'season');
    check('— and the strip says the date', /needs them by/.test(A.rendered()), true);
  }

  console.log('\n--- past the deadline ---');
  {
    const org = ORG({ by: '2000-01-01' });
    const { A } = await boot('mumU', org, { storage: asked });
    check('her team\'s Season is closed: My players instead', go(A, 'season'), 'mine');
    check('— a game too', (A.ui.gameView = 'live', go(A, 'game')), 'mine');
    check('— and club home', go(A, 'club'), 'mine');
    for (const v of ['calendar', 'inbox', 'notes', 'setup']) check(`${v} stays open`, go(A, v), v);
    check('the strip says why', /calendar and messages only/.test(A.rendered()), true);
    check('My players has the card to finish it', go(A, 'mine') === 'mine' && /Check her details/.test(A.rendered()), true);
  }
  {
    const org = ORG({ by: '2000-01-01' });
    org.children.p1 = { ...org.children.p1, confirmed: { by: 'mumU', at: 2 } };
    org.care = { p1: DONE };
    const { A } = await boot('mumU', org);
    check('finished: nothing closed', go(A, 'season'), 'season');
    check('— no strip', /details aren’t finished/.test(A.rendered()), false);
    check('— and no pop-up', /Check Ella/.test(sheet(A)), false);
  }
  {
    const org = ORG({ by: '2000-01-01' });
    const { A } = await boot('coachU', org, { storage: { 'sm.kidask.v1:coachU:CLUB:p2': '2000-01-01' } });
    check('a coach whose own child is still to finish is never kept out', go(A, 'season'), 'season');
    check('— but is reminded like any family', /Kit’s details aren’t finished/.test(A.rendered()), true);
  }
  {
    const org = ORG({ by: '2000-01-01' });
    org.children.p1 = { ...org.children.p1, confirmed: { by: 'mumU', at: 2 } };
    const { A } = await boot('mumU', org, { deny: rel => rel === 'care/p1' });
    check('a phone that has not heard her care details does not count them missing', /Check Ella|details aren’t finished/.test(A.rendered() + sheet(A)), false);
    check('— nor keeps her out for them', go(A, 'season'), 'season');
  }

  console.log('\n--- what the club requires ---');
  {
    const org = ORG({ need: { born: true, gender: true, contact: true, doctor: true } });
    org.children.p1 = { ...org.children.p1, confirmed: { by: 'mumU', at: 2 } };
    org.care = { p1: DONE };
    const { A, fbk } = await boot('mumU', org, { storage: asked });
    check('a doctor required: confirmed is not finished without one', /Check Ella/.test(sheet(A)), true);
    check('— the sheet asks for it', /add a doctor/.test(sheet(A)), true);
    A.dom.node('#kFirst').value = 'Ella'; A.dom.node('#kLast').value = 'Fitz'; A.dom.node('#kBorn').value = '2016-05-03';
    A.dom.node('[data-act="pickone"][data-grp="kgender"][aria-pressed="true"]').dataset = { v: 'F' };
    A.dom.node('#kC0n').value = 'Mo'; A.dom.node('#kC0p').value = '555'; A.dom.node('#kC0r').value = ''; A.dom.node('#kC1n').value = ''; A.dom.node('#kC1p').value = ''; A.dom.node('#kC1r').value = '';
    for (const k of ['allergies', 'medical', 'meds', 'doctor']) A.dom.node('#kCare_' + k).value = '';
    A.click({ act: 'kidconfirm', id: 'p1' }); await A.flush(5);
    check('— and refuses without it', /needs her a doctor/.test(A.lastToast() || ''), true);
    A.dom.node('#kCare_doctor').value = 'Dr Patel, 555 0100';
    A.click({ act: 'kidconfirm', id: 'p1' }); await A.flush(5);
    check('— saved with it', (valueAt(fbk, OB + '/care/p1') || {}).doctor, 'Dr Patel, 555 0100');
    check('— confirmed already, so not confirmed twice', fbk.writtenTo(OB + '/children/p1/confirmed').length, 0);
  }
  {
    const org = ORG({ need: { born: false, gender: false, contact: false, doctor: false } });
    org.children.p1 = { ...org.children.p1, confirmed: { by: 'mumU', at: 2 }, born: undefined };
    const { A } = await boot('mumU', org);
    check('nothing required: confirmed is finished', /details aren’t finished/.test(A.rendered()), false);
  }

  console.log('\n--- the admins ---');
  {
    const org = ORG();
    org.teamCare = { t1: { p1: { ...DONE, cid: 'p1' } } };
    const { A, fbk } = await boot('adm', org);
    A.ui.view = 'regs'; A.ui.regs = {}; A.render();
    const page = A.rendered();
    check('Registrations says how many are still to finish', /2 children have details still to finish/.test(page), true);
    check('— which, and what each is missing', /Ella Fitz/.test(page) && /not confirmed by her family/.test(page) && /no birth date/.test(page), true);
    check('— someone to call, from her team\'s copy', /Kit[^<]*<\/span><span class="rowsub">[^<]*no someone to call/.test(page), true);
    A.click({ act: 'detneed', k: 'doctor' }); await A.flush(5);
    deepEq('she requires a doctor as well', valueAt(fbk, OB + '/org/details/need'), { born: true, gender: true, contact: true, doctor: true });
    A.dom.node('#detBy').value = '2026-11-01';
    A.click({ act: 'detby' }); await A.flush(5);
    check('— and sets a deadline', valueAt(fbk, OB + '/org/details/by'), '2026-11-01');
    A.click({ act: 'detbyclear' }); await A.flush(5);
    check('— and takes it away', fbk.record.removes.includes(OB + '/org/details/by'), true);
  }
  {
    const { A, fbk } = await boot('coachU', ORG());
    A.dom.node('#detBy').value = '2000-01-01';
    A.click({ act: 'detby' }); A.click({ act: 'detneed', k: 'doctor' }); await A.flush(5);
    check('a coach sets neither (checked in the handler)', fbk.record.writes.some(w => /org\/details/.test(w.path)), false);
  }

  H.summary('getting families to finish their children\'s details');
})().catch(e => { console.error(e); process.exit(1); });
