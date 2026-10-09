/* A child in the club (AUTH.md, *A child in the club, and registration*,
   step 1), against the fake Firebase on a club on orgs/. What is pinned:

   - Coaches and admins read every child's club record; a family reads her
     own by path and holds nobody else's; a tracker reads none.
   - Every child already on a team gets a record, made by an admin's phone
     from the squad (the owner, 2026-10-09), the squad pointing at her first;
     her family on the team is copied onto it.
   - A coach adding a player registers her with the club for her family.
   - Only her family confirms her details, and is asked once, then by a card;
     her family, an admin, or the coach who added her (until the family has
     confirmed) changes them, checked in the click handler.
   - A family named on a child the club has let in has a role in the club. */

const H = require('./harness');
const { check, deepEq } = H;
const { makeFakebase } = require('./fakebase');
const access = require('../functions/access');

const CONFIG = { apiKey: 'k', databaseURL: 'https://prod.example', projectId: 'p' };
const OB = 'orgs/CLUB';
const valueAt = (fbk, p) => { const w = fbk.writtenTo(p); return w.length ? w[w.length - 1].value : undefined; };
const under = (fbk, pre) => fbk.readPaths().filter(p => p === pre || p.startsWith(pre + '/'));

const ORG = () => ({
  access: {
    admins: { adm: true },
    index: { adm: true, coachU: true, trkU: true, mumU: true, other2: true },
    teams: { t1: { coaches: { coachU: true }, trackers: { trkU: true } }, t2: { coaches: { other2: true } } },
    teamIndex: { t1: { coachU: 'coach', trkU: 'tracker' }, t2: { other2: 'coach' } },
    coachIndex: { coachU: 't1', other2: 't2' },
    teamParents: { t1: { mumU: 'p1' } }
  },
  org: { name: 'Lakeside SC' },
  members: { adm: { name: 'Ada', email: 'ada@example.com' }, coachU: { name: 'Jaz', email: 'jaz@example.com' } },
  names: { adm: { name: 'Ada' }, coachU: { name: 'Jaz' } },
  teams: { t1: { id: 't1', name: 'Flight', events: {} }, t2: { id: 't2', name: 'Storm' } },
  squad: {
    t1: {
      p1: { id: 'p1', name: 'Ella Fitz', number: '7', active: true, guardians: { mumU: true }, child: 'p1' },
      p2: { id: 'p2', name: 'Rosa Lind', number: '9', active: true }
    },
    t2: { q1: { id: 'q1', name: 'Bea Quill', number: '3', active: true, child: 'q1' } }
  },
  children: {
    p1: { id: 'p1', first: 'Ella', last: 'Fitz', club: true, by: 'club', at: 1, teams: { t1: 'p1' }, guardians: { mumU: 't1' } },
    q1: { id: 'q1', first: 'Bea', last: 'Quill', born: '2016-02-01', gender: 'F', club: true, by: 'other2', at: 1, teams: { t2: 'q1' } }
  },
  roster: { t1: { p1: { number: '7', active: true }, p2: { number: '9', active: true } }, t2: { q1: { number: '3', active: true } } },
  matches: {},
  rsvp: {}
});

/* What the rules let `uid` read on orgs/CLUB (rules.js walks the real thing). */
function rulesFor(uid, org) {
  const a = org.access, admin = !!a.admins[uid], coach = !!(a.coachIndex || {})[uid];
  return p => {
    const rel = p.slice(OB.length + 1);
    if (!a.index[uid]) return true;
    if (rel === 'members') return !(admin || coach);
    if (rel === 'members/' + uid) return false;
    if (rel === 'log') return !admin;
    if (rel === 'coachNotes' || rel.startsWith('coachNotes/')) return !(admin || coach);
    if (rel === 'children') return !(admin || coach);
    let m = /^children\/([^/]+)$/.exec(rel);
    if (m) {
      const c = (org.children || {})[m[1]] || {};
      return !(admin || coach || (c.guardians || {})[uid] || (c.family || {})[uid] || (c.self || {})[uid]);
    }
    m = /^squad\/([^/]+)$/.exec(rel);
    if (m) return !(admin || coach || ((a.teamIndex || {})[m[1]] || {})[uid]);
    m = /^squad\/([^/]+)\/([^/]+)$/.exec(rel);
    if (m) {
      const rec = ((org.squad || {})[m[1]] || {})[m[2]] || {};
      return !(admin || coach || ((a.teamIndex || {})[m[1]] || {})[uid] || (rec.guardians || {})[uid] || (rec.self || {})[uid]);
    }
    return false;
  };
}
async function boot(who, org = ORG(), storage = {}) {
  const fbk = makeFakebase();
  const A = H.loadApp({ firebase: fbk, config: CONFIG, storage: { 'sm.workspace': 'CLUB', 'sm.tree.v1:CLUB': 'orgs', ...storage } });
  await A.flush();
  // a page starts with no sheet open (the stub's nodes start shown)
  A.dom.node('#sheet').hidden = true; A.dom.node('#scrim').hidden = true;
  fbk.signIn(who, { name: who, email: who + '@x.test' }); await A.flush();
  fbk.deliver('.info/connected', true);
  await fbk.serve(OB, org, () => A.flush(), rulesFor(who, org));
  await A.flush(10);
  return { A, fbk };
}
const sheet = A => String(A.dom.node('#sheet').innerHTML);
const sheetOpen = A => !A.dom.node('#sheet').hidden;
const GENDER = '[data-act="pickone"][data-grp="kgender"][aria-pressed="true"]';
function fill(A, o) {
  A.dom.node('#kFirst').value = o.first || '';
  A.dom.node('#kLast').value = o.last || '';
  A.dom.node('#kBorn').value = o.born || '';
  A.dom.node(GENDER).dataset = o.gender ? { v: o.gender } : {};
  const cs = o.contacts || [];
  for (const i of [0, 1]) {
    A.dom.node('#kC' + i + 'n').value = (cs[i] || {}).name || '';
    A.dom.node('#kC' + i + 'p').value = (cs[i] || {}).phone || '';
    A.dom.node('#kC' + i + 'r').value = (cs[i] || {}).rel || '';
  }
  for (const k of ['allergies', 'medical', 'meds', 'doctor']) A.dom.node('#kCare_' + k).value = (o.care || {})[k] || '';
}

(async () => {
  console.log('--- who reads the children ---');
  {
    const { A, fbk } = await boot('coachU');
    check('a coach reads every child\'s record', under(fbk, OB).includes(OB + '/children'), true);
    deepEq('— and holds them', Object.keys(A.state.children).sort(), ['p1', 'q1']);
  }
  {
    const { A, fbk } = await boot('trkU');
    check('a tracker never asks for them', under(fbk, OB).some(p => p.startsWith(OB + '/children')), false);
    check('— and holds none', Object.keys(A.state.children || {}).length, 0);
  }
  {
    const { A, fbk } = await boot('mumU');
    const asked = under(fbk, OB);
    check('a family asks for her own child, by path', asked.includes(OB + '/children/p1'), true);
    check('— never the list', asked.includes(OB + '/children'), false);
    check('— nor another child', asked.includes(OB + '/children/q1'), false);
    deepEq('she holds her own and nobody else\'s', Object.keys(A.state.children), ['p1']);
    check('no other child\'s birth date on the phone', /2016-02-01|Quill/.test(JSON.stringify(A.state) + A.storage.getItem('sm.data.v1:CLUB')), false);

    console.log('\n--- her family confirms ---');
    check('asked once, straight away', sheetOpen(A) && /Check Ella’s details/.test(sheet(A)), true);
    check('— says what is missing', /add birth date, gender and someone to call/.test(sheet(A)), true);
    check('— shows her team and number', /Flight · #7/.test(sheet(A)), true);
    A.render(); A.ui.view = 'mine'; A.render();
    check('a card on My players until she does', /Check her details/.test(A.rendered()), true);
    fill(A, { first: 'Ella', last: 'Fitz' });
    A.click({ act: 'kidconfirm', id: 'p1' }); await A.flush(10);
    check('not without her birth date and gender', !!valueAt(fbk, OB + '/children/p1/confirmed'), false);
    check('— and says so', /birth date and gender/.test(A.lastToast() || ''), true);
    fill(A, { first: 'Ellie', last: 'Fitz', born: '2016-05-03', gender: 'F' });
    A.click({ act: 'kidconfirm', id: 'p1' }); await A.flush(10);
    check('not without someone the coach can call', !!valueAt(fbk, OB + '/children/p1/confirmed'), false);
    fill(A, { first: 'Ellie', last: 'Fitz', born: '2016-05-03', gender: 'F', contacts: [{ name: 'Mo Fitz' }] });
    A.click({ act: 'kidconfirm', id: 'p1' }); await A.flush(10);
    check('— nor a contact with no phone number', /name and a phone/.test(A.lastToast() || ''), true);
    fill(A, { first: 'Ellie', last: 'Fitz', born: '2016-05-03', gender: 'F', contacts: [{ name: 'Mo Fitz', phone: '555 0101', rel: 'Mum' }], care: { allergies: 'Peanuts', meds: 'Inhaler in her bag' } });
    A.click({ act: 'kidconfirm', id: 'p1' }); await A.flush(10);
    const cr = valueAt(fbk, OB + '/care/p1') || {};
    deepEq('her care details are written, in her own name', [cr.by, cr.contacts, cr.allergies, cr.meds, cr.medical], ['mumU', { 0: { name: 'Mo Fitz', phone: '555 0101', rel: 'Mum' } }, 'Peanuts', 'Inhaler in her bag', undefined]);
    deepEq('— and her team\'s copy, for its coaches', valueAt(fbk, OB + '/teamCare/t1/p1'), { ...cr, cid: 'p1' });
    check('— nowhere else: not the child\'s record, the squad or a game', fbk.record.writes.filter(w => /Peanuts|555 0101/.test(JSON.stringify(w.value)) && !/\/(care|teamCare)\//.test(w.path)).length, 0);
    check('what she changed is written, a field at a time', [valueAt(fbk, OB + '/children/p1/first'), valueAt(fbk, OB + '/children/p1/born'), valueAt(fbk, OB + '/children/p1/gender')].join(), 'Ellie,2016-05-03,F');
    check('— what she did not change is not', fbk.writtenTo(OB + '/children/p1/last').length, 0);
    check('then confirmed, in her own name', (valueAt(fbk, OB + '/children/p1/confirmed') || {}).by, 'mumU');
    check('— and put on her own list of her children', valueAt(fbk, 'families/mumU/CLUB/p1'), true);
    check('the team\'s name for her is the coach\'s, untouched', fbk.writtenTo(OB + '/squad/t1/p1').length + fbk.writtenTo(OB + '/squad/t1/p1/name').length, 0);
    A.render();
    check('the card is gone', /Check her details/.test(A.rendered()), false);

    console.log('\n--- her next phone ---');
    const org = ORG(); org.children.p1.confirmed = { by: 'mumU', at: 2 };
    const B = await boot('mumU', org);
    check('a confirmed child asks nothing', sheetOpen(B.A), false);
  }
  {
    const { A } = await boot('mumU', ORG(), { 'sm.kidask.v1:mumU:CLUB:p1': '1' });
    check('asked once only: not again on the next open', sheetOpen(A), false);
  }

  console.log('\n--- who changes a child\'s record ---');
  {
    const { A, fbk } = await boot('coachU');
    fill(A, { first: 'Ella', last: 'Fitz', born: '2016-05-03', gender: 'F' });
    A.click({ act: 'kidconfirm', id: 'p1' }); await A.flush(10);
    check('a coach cannot confirm for a family (checked in the handler)', fbk.writtenTo(OB + '/children/p1/confirmed').length + fbk.writtenTo(OB + '/children/p1/born').length, 0);
    A.click({ act: 'kidsave', id: 'p1' }); await A.flush(10);
    check('— nor change a record she did not make', fbk.writtenTo(OB + '/children/p1/born').length, 0);
    check('— and is told why', /her family/.test(A.lastToast() || ''), true);
  }
  {
    const org = ORG(); org.children.q1.confirmed = { by: 'x', at: 2 };
    const { A, fbk } = await boot('other2', org);
    fill(A, { first: 'Beatrice', last: 'Quill', born: '2016-02-01', gender: 'F' });
    A.click({ act: 'kidsave', id: 'q1' }); await A.flush(10);
    check('once her family has confirmed, the coach who added her no longer changes it', fbk.writtenTo(OB + '/children/q1/first').length, 0);
  }
  {
    const { A, fbk } = await boot('other2');
    A.click({ act: 'kidopen', id: 'q1' });
    check('until then she does', /data-act="kidsave"/.test(sheet(A)) && /Waiting for her family to confirm/.test(sheet(A)), true);
    fill(A, { first: 'Beatrice', last: 'Quill', born: '2016-02-01', gender: 'F' });
    A.click({ act: 'kidsave', id: 'q1' }); await A.flush(10);
    check('— and only what changed is written', [valueAt(fbk, OB + '/children/q1/first'), fbk.writtenTo(OB + '/children/q1/born').length].join(), 'Beatrice,0');
    fill(A, { first: 'Bea', born: 'May 3rd' });
    A.click({ act: 'kidsave', id: 'q1' }); await A.flush(10);
    check('a birth date that is not one is refused', fbk.writtenTo(OB + '/children/q1/born').length, 0);
  }
  {
    const { A, fbk } = await boot('adm');
    A.click({ act: 'kidopen', id: 'p1' });
    check('an admin edits any child\'s record', /data-act="kidsave"/.test(sheet(A)), true);
    check('— never with a Confirm of her own', /data-act="kidconfirm"/.test(sheet(A)), false);

    console.log('\n--- every child already on a team gets a record ---');
    const pt = fbk.writtenTo(OB + '/squad/t1/p2/child');
    check('the admin\'s phone points the squad record at its child', (pt[0] || {}).value, 'p2');
    const c = valueAt(fbk, OB + '/children/p2') || {};
    check('— then makes the child, under the player id', c.id, 'p2');
    const wi = p => fbk.record.writes.findIndex(w => w.path === p);
    check('— the pointer first, which the rule on her teams checks', wi(OB + '/squad/t1/p2/child') < wi(OB + '/children/p2'), true);
    deepEq('— the same record the server makes', c, access.childFrom({ name: 'Rosa Lind' }, 't1', 'p2', c.at));
    check('— unconfirmed, for her family to check', !!c.confirmed, false);
    check('a squad record that has one is left alone', fbk.writtenTo(OB + '/squad/t1/p1/child').length + fbk.writtenTo(OB + '/children/p1').length, 0);
    check('nothing went through the outbox, so an older ruleset is not shouted about', Object.keys(JSON.parse(A.storage.getItem('sm.pending.v1:CLUB') || '{"w":{}}').w || {}).filter(p => /child/.test(p)).length, 0);
  }
  {
    const org = ORG(); org.squad.t1.p1.guardians.dadU = true;
    const { fbk } = await boot('coachU', org);
    check('a staff phone copies a family the squad names onto the child', valueAt(fbk, OB + '/children/p1/guardians/dadU'), 't1');
    check('— and makes no new child: that is an admin\'s', fbk.writtenTo(OB + '/children/p2').length, 0);
  }
  {
    const org = ORG(); org.squad.t1.p1.guardians = {};
    org.children.p1.guardians = { mumU: 't1', gran: 'elsewhere' };
    const { fbk } = await boot('adm', org);
    check('a copy the squad no longer backs is taken off', fbk.record.removes.includes(OB + '/children/p1/guardians/mumU'), true);
    check('— one from somewhere else is not', fbk.record.removes.includes(OB + '/children/p1/guardians/gran'), false);
  }
  {
    const org = ORG(); delete org.children.p1.guardians;
    const { A, fbk } = await boot('mumU', org);
    check('a family whose copy is not there yet writes her own, from the squad', valueAt(fbk, OB + '/children/p1/guardians/mumU'), 't1');
    check('— never anyone else\'s', fbk.record.writes.filter(w => /\/children\/[^/]+\/(guardians|self)\//.test(w.path) && !/mumU$/.test(w.path)).length, 0);
    check('— and only on her own children', fbk.record.writes.some(w => /children\/(p2|q1)/.test(w.path)), false);
    void A;
  }

  console.log('\n--- care details at the pitch ---');
  {
    const care = { by: 'mumU', at: 2, contacts: { 0: { name: 'Mo Fitz', phone: '555 0101', rel: 'Mum' } }, allergies: 'Peanuts' };
    const org = ORG(); org.teamCare = { t1: { p1: { ...care, cid: 'p1' } } }; org.care = { p1: care };
    const rf = (uid, o) => { const base = rulesFor(uid, o), a = o.access; return p => {
      const rel = p.slice(OB.length + 1);
      let m = /^teamCare\/([^/]+)$/.exec(rel);
      if (m) return !(a.admins[uid] || ((a.teamIndex || {})[m[1]] || {})[uid] === 'coach');
      m = /^care\/([^/]+)$/.exec(rel);
      if (m) { const c = (o.children || {})[m[1]] || {}; return !(a.admins[uid] || (c.guardians || {})[uid] || (c.family || {})[uid]); }
      return base(p);
    }; };
    const bootC = async who => {
      const fbk = makeFakebase();
      const A = H.loadApp({ firebase: fbk, config: CONFIG, storage: { 'sm.workspace': 'CLUB', 'sm.tree.v1:CLUB': 'orgs', ['sm.kidask.v1:' + who + ':CLUB:p1']: '1' } });
      await A.flush(); A.dom.node('#sheet').hidden = true;
      fbk.signIn(who, { name: who }); await A.flush();
      await fbk.serve(OB, org, () => A.flush(), rf(who, org)); await A.flush(10);
      return { A, fbk };
    };
    {
      const { A, fbk } = await bootC('coachU');
      check('her team\'s coach reads its copy', under(fbk, OB).includes(OB + '/teamCare/t1'), true);
      check('— not another team\'s, nor the family\'s own', under(fbk, OB).some(p => /teamCare\/t2|\/care\//.test(p)), false);
      A.ui.teamId = 't1'; A.sheetPlayer(A.state.teams.t1.players.p1);
      check('her page in Squad says who to call, with a link to ring', /href="tel:5550101"/.test(sheet(A)) && /Mo Fitz/.test(sheet(A)), true);
      check('— and what to know', /Peanuts/.test(sheet(A)), true);
      A.sheetPlayer(A.state.teams.t1.players.p2);
      check('a child with none says her family hasn\'t given any', /hasn't given who to call/.test(sheet(A)), true);
      A.click({ act: 'kidopen', id: 'p1' });
      check('the coach has no care form of her own (her family\'s and the admins\')', /kC0n/.test(sheet(A)), false);
      const { A: B } = await bootC('other2');
      B.ui.teamId = 't1'; B.sheetPlayer(B.state.teams.t1.players.p1);
      check('another team\'s coach sees none of it', /Peanuts|555/.test(sheet(B)), false);
    }
    {
      const { A, fbk } = await bootC('trkU');
      check('a tracker never asks for it', under(fbk, OB).some(p => /care/i.test(p)), false);
      check('— and holds none', /Peanuts|555 0101/.test(JSON.stringify(A.state) + A.storage.getItem('sm.data.v1:CLUB')), false);
    }
    {
      const { A } = await bootC('mumU');
      check('her family reads her own', (A.state.care.p1 || {}).allergies, 'Peanuts');
      A.click({ act: 'kidopen', id: 'p1' });
      check('— and can change it', /value="555 0101"/.test(sheet(A)), true);
    }
    {
      const { A, fbk } = await bootC('adm');
      const pr = A.backupDoc(); await A.flush();
      // the club answers for its training records, which the backup asks for first
      await fbk.serve('training/CLUB', {}, () => A.flush()); await fbk.serve('userLibrary', {}, () => A.flush());
      const doc = (await pr).doc;
      check('an admin\'s backup carries no care details', /Peanuts|555 0101/.test(JSON.stringify(doc)), false);
    }
  }

  console.log('\n--- a coach adds a player ---');
  {
    const { A, fbk } = await boot('coachU');
    A.ui.teamId = 't1';
    A.dom.node('#newName').value = 'Nia Cole'; A.dom.node('#newNum').value = '11';
    A.click({ act: 'addplayer' }); await A.flush(10);
    const sq = fbk.record.writes.find(w => /\/squad\/t1\/[^/]+$/.test(w.path) && w.value && w.value.name === 'Nia Cole');
    check('the squad record points at her club record', !!sq && sq.value.child === sq.value.id, true);
    const id = sq && sq.value.id;
    const c = valueAt(fbk, OB + '/children/' + id) || {};
    check('she is registered with the club, by the coach, for her family', [c.first, c.last, c.club, c.by].join(), 'Nia,Cole,true,coachU');
    deepEq('— on the coach\'s team', c.teams, { t1: id });
    check('— no family, nothing confirmed: her family does that', !!(c.guardians || c.family || c.confirmed), false);
  }

  console.log('\n--- a child on no team ---');
  {
    const org = ORG();
    org.children.k9 = { id: 'k9', first: 'Mia', last: 'Snow', born: '2015-01-01', gender: 'F', club: true, by: 'adm', at: 1, family: { mumU: 'ik' }, confirmed: { by: 'mumU', at: 2 } };
    const { A, fbk } = await boot('mumU', org, { 'sm.kidask.v1:mumU:CLUB:p1': '1' });
    fbk.deliver('families/mumU/CLUB', { k9: true }); await A.flush();
    await fbk.serve(OB, org, () => A.flush(), rulesFor('mumU', org)); await A.flush(10);
    check('found from her own list, and read by path', under(fbk, OB).includes(OB + '/children/k9'), true);
    A.ui.view = 'mine'; A.render();
    check('My players shows her, in the club on no team yet', /Mia Snow/.test(A.rendered()) && /on no team yet/.test(A.rendered()), true);
    check('a family named on a child the club has let in has a role here', A.hasAnyRole('mumU'), true);
    const st = A.state; st.access.index = {}; st.squad = undefined;
    for (const t of Object.values(st.teams)) for (const p of Object.values(t.players || {})) p.guardians = {};
    check('— from that child alone', A.hasAnyRole('mumU'), true);
    st.children.k9.club = false;
    check('— not once the club has not let her in', A.hasAnyRole('mumU'), false);
  }

  H.summary('a child in the club');
})().catch(e => { console.error(e); process.exit(1); });
