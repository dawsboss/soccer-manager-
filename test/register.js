/* Registration (AUTH.md, *Registration*, step 3), against the fake
   Firebase on a club on orgs/. What is pinned:

   - Programs and waivers are the admins', checked in the click handler; a
     program's link carries the program, the waivers' words and nothing of
     any child; a waiver whose words change is a new version, the old kept.
   - A family who is not in the club opens the link, signs in and registers:
     her child, her own list, care, the registration, then each waiver, in
     her own name, in that order; the child fits the program; nothing is
     sent with a waiver unagreed, a question unanswered or nobody to call.
   - Only an admin accepts, which lets the child and her family in.
   - A coach starts one for a family, who finish it: the coach agrees to
     nothing, and who started it is kept. */

const H = require('./harness');
const { check, deepEq } = H;
const { makeFakebase } = require('./fakebase');

const CONFIG = { apiKey: 'k', databaseURL: 'https://prod.example', projectId: 'p' };
const OB = 'orgs/CLUB';
const valueAt = (fbk, p) => { const w = fbk.writtenTo(p); return w.length ? w[w.length - 1].value : undefined; };

const ORG = () => ({
  access: {
    admins: { adm: true },
    index: { adm: true, coachU: true, mumU: true },
    teams: { t1: { coaches: { coachU: true } } },
    teamIndex: { t1: { coachU: 'coach' } },
    coachIndex: { coachU: 't1' },
    teamParents: { t1: { mumU: 'p1' } }
  },
  org: { name: 'Lakeside SC', money: '$' },
  members: { adm: { name: 'Ada', email: 'ada@example.com' } },
  names: { adm: { name: 'Ada' } },
  teams: { t1: { id: 't1', name: 'Flight' } },
  squad: { t1: { p1: { id: 'p1', name: 'Ella Fitz', number: '7', active: true, guardians: { mumU: true }, child: 'p1' } } },
  children: { p1: { id: 'p1', first: 'Ella', last: 'Fitz', born: '2016-05-03', gender: 'F', club: true, by: 'club', at: 1, teams: { t1: 'p1' }, guardians: { mumU: 't1' }, confirmed: { by: 'mumU', at: 2 } } },
  care: { p1: { by: 'mumU', at: 2, contacts: { 0: { name: 'Mo', phone: '555' } } } },
  programs: { f27: { id: 'f27', name: 'Fall 2027', kind: 'season', born: { lo: 2014, hi: 2019 }, gender: 'F', waivers: { w1: true }, asks: { q1: { q: 'Any position she loves?', o: 0 }, q2: { q: 'Can you help on match days?', o: 1, need: true } }, link: 'rl1', by: 'adm', at: 1 } },
  waivers: { w1: { id: 'w1', title: 'Photos', v: 2, text: 'We may take photos at games.', by: 'adm', at: 1 } },
  regs: {}, agreed: {},
  roster: { t1: { p1: { number: '7', active: true } } },
  matches: {}, rsvp: {}
});
const OPEN = () => ({ ws: 'CLUB', prog: 'f27', name: 'Fall 2027', kind: 'season', club: 'Lakeside SC', money: '$', born: { lo: 2014, hi: 2019 }, gender: 'F', fee: 120, feeNote: 'Transfer to the club',
  asks: { q1: { q: 'Any position she loves?', o: 0 }, q2: { q: 'Can you help on match days?', o: 1, need: true } }, waivers: { w1: { title: 'Photos', v: 2, text: 'We may take photos at games.' } }, by: 'adm', at: 1 });

function rulesFor(uid, org) {
  const a = org.access, admin = !!a.admins[uid], coach = !!(a.coachIndex || {})[uid];
  return p => {
    const rel = p.slice(OB.length + 1);
    if (!a.index[uid]) return !/^(children|care|regs|agreed)\//.test(rel);
    if (rel === 'members') return !(admin || coach);
    if (rel === 'members/' + uid) return false;
    if (rel === 'log') return !admin;
    if (/^(coachNotes|children)$/.test(rel) || rel.startsWith('coachNotes/')) return !(admin || coach);
    if (/^(regs|agreed)\/[^/]+$/.test(rel)) return !admin;
    let m = /^(?:children|care|regs\/[^/]+|agreed\/[^/]+)\/([^/]+)$/.exec(rel);
    if (m) { const c = (org.children || {})[m[1]] || {}; return !(admin || (rel.startsWith('children') && coach) || (c.guardians || {})[uid] || (c.family || {})[uid]); }
    m = /^squad\/([^/]+)$/.exec(rel);
    if (m) return !(admin || coach || ((a.teamIndex || {})[m[1]] || {})[uid]);
    m = /^squad\/([^/]+)\/([^/]+)$/.exec(rel);
    if (m) { const rec = ((org.squad || {})[m[1]] || {})[m[2]] || {}; return !(admin || coach || (rec.guardians || {})[uid]); }
    if (/^teamCare\//.test(rel)) return !admin;
    return false;
  };
}
async function boot(who, org = ORG(), opts = {}) {
  const fbk = makeFakebase();
  const A = H.loadApp({ firebase: fbk, config: CONFIG, search: opts.search, storage: { ...(opts.club === false ? {} : { 'sm.workspace': 'CLUB', 'sm.tree.v1:CLUB': 'orgs' }), ...(opts.storage || {}) } });
  await A.flush();
  A.dom.node('#sheet').hidden = true; A.dom.node('#scrim').hidden = true;
  fbk.signIn(who, { name: opts.name || who, email: who + '@x.test' }); await A.flush();
  fbk.deliver('.info/connected', true);
  if (opts.club !== false) await fbk.serve(OB, org, () => A.flush(), rulesFor(who, org));
  await A.flush(10);
  return { A, fbk };
}
const sheet = A => String(A.dom.node('#sheet').innerHTML);
const GENDER = '[data-act="pickone"][data-grp="kgender"][aria-pressed="true"]';
function fillKid(A, o) {
  A.dom.node('#kFirst').value = o.first || ''; A.dom.node('#kLast').value = o.last || ''; A.dom.node('#kBorn').value = o.born || '';
  A.dom.node(GENDER).dataset = o.gender ? { v: o.gender } : {};
  const cs = o.contacts || [];
  for (const i of [0, 1]) { A.dom.node('#kC' + i + 'n').value = (cs[i] || {}).name || ''; A.dom.node('#kC' + i + 'p').value = (cs[i] || {}).phone || ''; A.dom.node('#kC' + i + 'r').value = ''; }
  for (const k of ['allergies', 'medical', 'meds', 'doctor']) A.dom.node('#kCare_' + k).value = '';
  for (const k of ['q1', 'q2']) A.dom.node('#ra_' + k).value = (o.answers || {})[k] || '';
  A.dom.node('#rwName').value = o.sig || '';
}
const PROG = () => ({ name: 'Spring 2028', kind: 'season', lo: '2015', hi: '2017', gender: 'F', opens: '', closes: '2028-03-01', cap: '', fee: '90', feeNote: 'Cash at the first session', about: '', asks: 'Shirt size?\n*Any allergies we should plan for?' });
function fillProg(A, o) {
  A.dom.node('#pName').value = o.name; A.dom.node('#pKind').value = o.kind; A.dom.node('#pLo').value = o.lo; A.dom.node('#pHi').value = o.hi;
  A.dom.node('#pGender').value = o.gender; A.dom.node('#pOpens').value = o.opens; A.dom.node('#pCloses').value = o.closes; A.dom.node('#pCap').value = o.cap;
  A.dom.node('#pFee').value = o.fee; A.dom.node('#pFeeNote').value = o.feeNote; A.dom.node('#pAbout').value = o.about; A.dom.node('#pAsks').value = o.asks;
}

(async () => {
  console.log('--- an admin makes a program and its link ---');
  {
    const { A, fbk } = await boot('adm');
    A.ui.view = 'regs'; A.render();
    check('Registrations lists the program', /Fall 2027/.test(A.rendered()), true);
    A.click({ act: 'progedit' });
    A.click({ act: 'progwaiver', id: 'w1' });
    fillProg(A, PROG());
    A.click({ act: 'progsave', id: '' }); await A.flush(10);
    const pw = fbk.record.writes.find(w => /^orgs\/CLUB\/programs\/[^/]+$/.test(w.path) && w.value && w.value.name === 'Spring 2028');
    check('the program is written', !!pw, true);
    const pr = (pw || {}).value || {};
    deepEq('— its birth years, who it is for, its close and fee', [pr.born, pr.gender, pr.closes, pr.fee, pr.feeNote], [{ lo: 2015, hi: 2017 }, 'F', '2028-03-01', 90, 'Cash at the first session']);
    deepEq('— its questions, the starred one to be answered', Object.values(pr.asks || {}).map(q => [q.q, !!q.need]), [['Shirt size?', false], ['Any allergies we should plan for?', true]]);
    deepEq('— the waivers it asks for', pr.waivers, { w1: true });
    check('— a link id from the secure generator', /^r[0-9a-f]{24}$/.test(pr.link || ''), true);
    const ro = valueAt(fbk, 'regOpen/' + pr.link) || {};
    check('the link carries the program', [ro.ws, ro.prog, ro.name, ro.club].join(), 'CLUB,' + pr.id + ',Spring 2028,Lakeside SC');
    deepEq('— and each waiver\'s own words and version', ro.waivers, { w1: { title: 'Photos', v: 2, text: 'We may take photos at games.' } });
    check('— and no child, team or name of anyone', /Ella|Fitz|Flight|p1|mumU/.test(JSON.stringify(ro)), false);

    console.log('\n--- waivers ---');
    A.click({ act: 'waiveredit', id: 'w1' });
    A.dom.node('#wTitle').value = 'Photos'; A.dom.node('#wText').value = 'We may take photos and video at games.';
    A.click({ act: 'waiversave', id: 'w1' }); await A.flush(10);
    const w = valueAt(fbk, OB + '/waivers/w1') || {};
    check('new words are a new version', w.v, 3);
    check('— the old words kept, under their version', ((w.old || {})[2] || {}).text, 'We may take photos at games.');
    check('— and every open program\'s link carries the new ones', (((valueAt(fbk, 'regOpen/' + pr.link) || {}).waivers || {}).w1 || {}).v, 3);

    console.log('\n--- closing ---');
    A.click({ act: 'progclose', id: pr.id }); await A.flush(10);
    check('closing marks it closed', (valueAt(fbk, OB + '/programs/' + pr.id) || {}).closed, true);
    check('— and takes the link down', fbk.record.removes.includes('regOpen/' + pr.link), true);
  }
  {
    const { A, fbk } = await boot('coachU');
    A.ui.view = 'regs'; A.render();
    check('a coach is not shown Registrations: put back on Club home', A.ui.view !== 'regs' && !/New program/.test(A.rendered()), true);
    A.dom.node('#pName').value = 'Sneaky';
    A.click({ act: 'progsave', id: '' }); await A.flush(10);
    check('— and a tap that reaches the handler writes nothing', fbk.record.writes.filter(w => /programs|regOpen|waivers/.test(w.path)).length, 0);
  }

  console.log('\n--- a family who is not in the club registers ---');
  {
    const { A, fbk } = await boot('newmum', null, { club: false, search: '?reg=rl1', name: 'Ann Cole' });
    check('the link is taken off the address bar', !/reg=/.test(A.dom.replaced || ''), true);
    fbk.deliver('regOpen/rl1', OPEN()); await A.flush();
    fbk.deliver('families/newmum/CLUB', null); await A.flush(10);
    const page = A.rendered();
    check('she sees the program', /Fall 2027/.test(page) && /born 2014–2019/.test(page), true);
    check('— its fee, and that nothing is taken here', /\$120/.test(page) && /nothing is taken here/.test(page), true);
    check('— and nothing of the club\'s children', /Ella|Flight/.test(page), false);
    A.click({ act: 'regform', id: 'new' });
    check('the form asks for the program\'s questions', /Any position she loves/.test(A.rendered()) && /match days\? \*/.test(A.rendered()), true);
    check('— and shows the waiver\'s words', /We may take photos at games/.test(A.rendered()), true);
    const send = async o => { fillKid(A, o); A.click({ act: 'regsend' }); await A.flush(20); };
    const good = { first: 'Nia', last: 'Cole', born: '2016-03-03', gender: 'F', contacts: [{ name: 'Ann Cole', phone: '555 0199' }], answers: { q2: 'Yes' }, sig: 'Ann Cole' };
    await send({ ...good, born: '2012-01-01' });
    check('a child born outside its years is refused', /born 2014–2019/.test(A.lastToast() || '') && fbk.record.writes.length, 0);
    await send({ ...good, gender: 'M' });
    check('— and one it is not for', /for girls/.test(A.lastToast() || ''), true);
    await send({ ...good, answers: {} });
    check('a question it must have answered', /match days/.test(A.lastToast() || ''), true);
    await send({ ...good, contacts: [] });
    check('someone to call', /call/.test(A.lastToast() || ''), true);
    await send(good);
    check('every waiver agreed to', /agreement/.test(A.lastToast() || ''), true);
    A.click({ act: 'regagree', w: 'w1' });
    await send({ ...good, sig: '' });
    check('— and signed', /sign/.test(A.lastToast() || ''), true);
    check('nothing written while any of that was missing', fbk.record.writes.length, 0);
    await send(good);
    const ws = fbk.record.writes.map(x => x.path);
    const cw = ws.find(p => /^orgs\/CLUB\/children\/[^/]+$/.test(p));
    const cid = cw && cw.split('/').pop();
    const kid = valueAt(fbk, cw) || {};
    check('her child, through the link, as her family', [kid.first, kid.last, kid.born, kid.gender, kid.via, (kid.family || {}).newmum, kid.by].join(), 'Nia,Cole,2016-03-03,F,rl1,rl1,newmum');
    check('— confirmed already: she typed it', (kid.confirmed || {}).by, 'newmum');
    check('— not in the club, on no team', !!(kid.club || kid.teams || kid.guardians), false);
    const reg = valueAt(fbk, OB + '/regs/f27/' + cid) || {};
    check('the registration, sent, in her own name', [reg.st, reg.by, reg.sentBy, (reg.fam || {}).name, (reg.fam || {}).email].join(), 'sent,newmum,newmum,Ann Cole,newmum@x.test');
    deepEq('— with her answers', reg.answers, { q2: 'Yes' });
    deepEq('the waiver, agreed to this version, signed', valueAt(fbk, OB + '/agreed/f27/' + cid + '/w1_2'), { by: 'newmum', at: reg.sentAt, name: 'Ann Cole' });
    deepEq('in the order the rules read them', ws.filter(p => /children|families|care|regs|agreed/.test(p)),
      [OB + '/children/' + cid, 'families/newmum/CLUB/' + cid, OB + '/care/' + cid, OB + '/regs/f27/' + cid, OB + '/agreed/f27/' + cid + '/w1_2']);
    check('nothing written into the club she could not write (no index, no squad, no members)', ws.some(p => /access|squad|members/.test(p)), false);
  }
  {
    const { A, fbk } = await boot('newmum', null, { club: false, search: '?reg=gone1' });
    fbk.deliver('regOpen/gone1', null); await A.flush(10);
    check('a link taken down says registration has closed', /Registration has closed/.test(A.rendered()), true);
  }

  console.log('\n--- the admin accepts ---');
  {
    const org = ORG();
    org.children.n1 = { id: 'n1', first: 'Nia', last: 'Cole', born: '2016-03-03', gender: 'F', by: 'newmum', at: 3, via: 'rl1', family: { newmum: 'rl1' }, confirmed: { by: 'newmum', at: 3 } };
    org.regs = { f27: { n1: { st: 'sent', by: 'newmum', at: 3, sentBy: 'newmum', sentAt: 3, answers: { q2: 'Yes' }, fam: { name: 'Ann Cole', email: 'ann@x.test' } } } };
    org.agreed = { f27: { n1: { w1_2: { by: 'newmum', at: 3, name: 'Ann Cole' } } } };
    const { A, fbk } = await boot('adm', org);
    A.ui.view = 'regs'; A.click({ act: 'regprog', id: 'f27' });
    check('the program\'s list names her, and who registered her', /Nia Cole/.test(A.rendered()) && /Ann Cole/.test(A.rendered()), true);
    A.click({ act: 'regopenone', prog: 'f27', id: 'n1' });
    check('her sheet shows the answers and the waiver agreed', /match days/.test(sheet(A)) && /agreed by Ann Cole/.test(sheet(A)), true);
    A.dom.node('#regNote').value = 'Sister on U12';
    A.click({ act: 'regset', prog: 'f27', id: 'n1', st: 'accepted' }); await A.flush(10);
    check('accepted', valueAt(fbk, OB + '/regs/f27/n1/st'), 'accepted');
    check('— with the admin\'s note', valueAt(fbk, OB + '/regs/f27/n1/note'), 'Sister on U12');
    check('— the child let into the club', valueAt(fbk, OB + '/children/n1/club'), true);
    check('— and her family, through her', valueAt(fbk, OB + '/access/index/newmum'), 'n1');
  }
  {
    const org = ORG();
    org.regs = { f27: { p1: { st: 'sent', by: 'mumU', at: 3, sentBy: 'mumU', sentAt: 3 } } };
    const { A, fbk } = await boot('coachU', org);
    A.click({ act: 'regset', prog: 'f27', id: 'p1', st: 'accepted' }); await A.flush(10);
    check('a coach accepts nothing (checked in the handler)', fbk.writtenTo(OB + '/regs/f27/p1/st').length, 0);
  }

  console.log('\n--- a coach starts one for a family ---');
  {
    const { A, fbk } = await boot('coachU');
    A.click({ act: 'kidopen', id: 'p1' });
    check('her sheet offers the open programs she fits', /data-act="regdraft" data-prog="f27"/.test(sheet(A)), true);
    A.click({ act: 'regdraft', prog: 'f27', id: 'p1' }); await A.flush(10);
    deepEq('a draft, in the coach\'s name, agreeing to nothing', [(valueAt(fbk, OB + '/regs/f27/p1') || {}).st, (valueAt(fbk, OB + '/regs/f27/p1') || {}).by, fbk.record.writes.some(w => /agreed/.test(w.path))], ['draft', 'coachU', false]);
  }
  {
    const org = ORG();
    org.regs = { f27: { p1: { st: 'draft', by: 'coachU', at: 3 } } };
    const { A, fbk } = await boot('mumU', org, { storage: { 'sm.kidask.v1:mumU:CLUB:p1': '1' } });
    A.ui.view = 'mine'; A.render();
    check('her family is asked to finish it', /Finish Ella’s registration for Fall 2027/.test(A.rendered()), true);
    A.click({ act: 'regopen', id: 'rl1' }); await A.flush();
    fbk.deliver('regOpen/rl1', OPEN()); await A.flush();
    fbk.deliver('families/mumU/CLUB', null); await A.flush(5);
    await fbk.serve(OB, org, () => A.flush(), rulesFor('mumU', org)); await A.flush(10);
    check('the link shows her child, to finish', /Ella Fitz/.test(A.rendered()) && /Waiting for the family/.test(A.rendered()), true);
    A.click({ act: 'regform', id: 'p1' });
    check('— the form says the club started it', /The club started this for you/.test(A.rendered()), true);
    A.click({ act: 'regagree', w: 'w1' });
    fillKid(A, { first: 'Ella', last: 'Fitz', born: '2016-05-03', gender: 'F', contacts: [{ name: 'Mo', phone: '555' }], answers: { q2: 'No' }, sig: 'Mo Fitz' });
    A.click({ act: 'regsend' }); await A.flush(20);
    const r = valueAt(fbk, OB + '/regs/f27/p1') || {};
    check('sent by her, keeping who started it', [r.st, r.by, r.sentBy].join(), 'sent,coachU,mumU');
    check('her child\'s record is not rewritten when nothing changed', fbk.record.writes.filter(w => /\/children\/p1/.test(w.path)).length, 0);
    check('nor her care details', fbk.writtenTo(OB + '/care/p1').length, 0);
    check('the waiver, in her own name', (valueAt(fbk, OB + '/agreed/f27/p1/w1_2') || {}).by, 'mumU');
  }

  console.log('\n--- placing her on a team ---');
  {
    const org = ORG();
    org.teams.t2 = { id: 't2', name: 'Storm', birthYear: 2016 };
    org.access.teams.t2 = {};
    org.children.n1 = { id: 'n1', first: 'Nia', last: 'Cole', born: '2016-03-03', gender: 'F', club: true, by: 'newmum', at: 3, via: 'rl1', family: { newmum: 'rl1' }, confirmed: { by: 'newmum', at: 3 } };
    org.regs = { f27: { n1: { st: 'accepted', by: 'newmum', at: 3, sentBy: 'newmum', sentAt: 3 } } };
    org.access.index.newmum = 'n1';
    const { A, fbk } = await boot('adm', org);
    A.click({ act: 'regopenone', prog: 'f27', id: 'n1' });
    check('an accepted child is offered the teams that fit her age', /data-act="regplace"[^>]*data-tid="t2"/.test(sheet(A)), true);
    fbk.record.writes.length = 0;
    A.click({ act: 'regplace', prog: 'f27', id: 'n1', tid: 't2' }); await A.flush(10);
    const sq = valueAt(fbk, OB + '/squad/t2/n1') || {};
    deepEq('a squad record pointing at her, her family as its parents, no number yet', [sq.name, sq.child, sq.guardians, sq.number], ['Nia', 'n1', { newmum: true }, '']);
    check('— then her record names the team', valueAt(fbk, OB + '/children/n1/teams/t2'), 'n1');
    check('— her family copied, valued with the team', valueAt(fbk, OB + '/children/n1/guardians/newmum'), 't2');
    check('— the team\'s families table', valueAt(fbk, OB + '/access/teamParents/t2/newmum'), 'n1');
    check('— and the registration says where', [valueAt(fbk, OB + '/regs/f27/n1/st'), valueAt(fbk, OB + '/regs/f27/n1/team')].join(), 'placed,t2');
    const ws = fbk.record.writes.map(w => w.path);
    check('the squad record before the child\'s team, which the rule checks against it', ws.indexOf(OB + '/squad/t2/n1') < ws.indexOf(OB + '/children/n1/teams/t2'), true);
  }
  {
    const org = ORG();
    org.programs.tr = { id: 'tr', name: 'Training', kind: 'sessions', link: 'rl9', by: 'adm', at: 1 };
    org.children.n1 = { id: 'n1', first: 'Nia', born: '2016-03-03', club: true, by: 'x', at: 3, family: { newmum: 'rl9' } };
    org.regs = { tr: { n1: { st: 'accepted', by: 'newmum', at: 3 } } };
    const { A } = await boot('adm', org);
    A.click({ act: 'regopenone', prog: 'tr', id: 'n1' });
    check('a sessions program places on no team', /data-act="regplace"/.test(sheet(A)), false);
  }

  console.log('\n--- training sessions for a child on no team ---');
  {
    const org = ORG();
    org.children.n1 = { id: 'n1', first: 'Nia', last: 'Cole', born: '2016-03-03', gender: 'F', club: true, by: 'x', at: 3, family: { newmum: 'rl9' }, confirmed: { by: 'newmum', at: 3 } };
    org.access.index.newmum = 'n1';
    const { A, fbk } = await boot('newmum', org, { storage: { 'sm.kidask.v1:newmum:CLUB:n1': '1' } });
    fbk.deliver('families/newmum/CLUB', { n1: true }); await A.flush();
    await fbk.serve(OB, org, () => A.flush(), rulesFor('newmum', org)); await A.flush(10);
    const kids = A.myChildren();
    deepEq('she is her family\'s child for sessions, as the club', kids.map(k => [k.t.id, k.p.id, k.p.name]), [['club', 'n1', 'Nia Cole']]);
    check('— so her family has Training sessions', A.canSessions(), true);
    A.sess.sessions = { s1: { id: 's1', kind: 'group', title: 'Finishing', coach: 'coachU', coachName: 'Jaz', date: '2099-01-05', start: '17:00', end: '18:00', cap: 6, open: true, price: 10 } };
    A.click({ act: 'sessask', id: 's1', pid: 'n1' }); await A.flush(10);
    const b = valueAt(fbk, 'training/CLUB/booked/s1/n1') || {};
    deepEq('her family asks for a place, as the club', [b.tid, b.st, b.by], ['club', 'asked', 'newmum']);
    check('the coach\'s list finds her by name', A.playerById('n1') && A.playerById('n1').p.name, 'Nia Cole');
  }

  H.summary('registration: programs, the link and form, waivers, accepting');
})().catch(e => { console.error(e); process.exit(1); });
