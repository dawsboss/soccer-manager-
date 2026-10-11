/* Tryouts and evaluations (GOTSPORT.md, *Tryouts and evaluations*; build
   136, rules version 29), against the fake Firebase on a club on orgs/.
   What is pinned:

   - Admins name a tryout's evaluators (never on another kind of program)
     and give bibs: the next free number to everyone registered without
     one, withdrawn and declined left out, the published bib first and
     carrying a birth year and gender and nothing else.
   - An evaluator the program names gets a card on Club home and a screen
     of bibs; nothing on it names a child, and her phone never asks for a
     registration. She scores only her own record, only a published bib,
     through the outbox; the same score again takes it back. A coach the
     program does not name gets neither, and a tap that reaches the handler
     writes nothing.
   - The admin sees the scores side by side, highest first, and offers a
     place (the child and her family into the club as accepting does); her
     family accepts or declines on My players in her own name; an accepted
     offer is placed on the team offered.
   - A bib no registration holds goes with its scores, and only once the
     club's registrations and bibs have been heard this session. */

const H = require('./harness');
const { check, deepEq } = H;
const { makeFakebase } = require('./fakebase');

const CONFIG = { apiKey: 'k', databaseURL: 'https://prod.example', projectId: 'p' };
const OB = 'orgs/CLUB';
const valueAt = (fbk, p) => { const w = fbk.writtenTo(p); return w.length ? w[w.length - 1].value : undefined; };
const NAMES = /Ella|Fitz|Nia|Cole|Kit|Rowe|Zoe/;

const kid = (id, first, last, born, fam, extra = {}) => ({ id, first, last, born, gender: 'F', by: fam, at: 1, family: { [fam]: 'rl1' }, confirmed: { by: fam, at: 1 }, ...extra });
const ORG = () => ({
  access: {
    admins: { adm: true },
    index: { adm: true, coachU: true, coach2: true, mumU: true },
    teams: { t1: { coaches: { coachU: true } }, t2: { coaches: { coach2: true } } },
    teamIndex: { t1: { coachU: 'coach' }, t2: { coach2: 'coach' } },
    coachIndex: { coachU: 't1', coach2: 't2' },
    teamParents: { t1: { mumU: 'p1' } }
  },
  org: { name: 'Lakeside SC', money: '$' },
  members: { adm: { name: 'Ada', email: 'ada@example.com' }, coachU: { name: 'Cal', email: 'cal@example.com' }, coach2: { name: 'Dee', email: 'dee@example.com' } },
  names: { adm: { name: 'Ada' }, coachU: { name: 'Cal' }, coach2: { name: 'Dee' } },
  teams: { t1: { id: 't1', name: 'Flight', birthYear: 2016 }, t2: { id: 't2', name: 'Storm', birthYear: 2015 } },
  squad: { t1: { p1: { id: 'p1', name: 'Ella Fitz', number: '7', active: true, guardians: { mumU: true }, child: 'p1' } } },
  children: {
    p1: { id: 'p1', first: 'Ella', last: 'Fitz', born: '2016-05-03', gender: 'F', club: true, by: 'club', at: 1, teams: { t1: 'p1' }, guardians: { mumU: 't1' }, confirmed: { by: 'mumU', at: 2 } },
    n1: kid('n1', 'Nia', 'Cole', '2016-02-01', 'famN'),
    n2: kid('n2', 'Kit', 'Rowe', '2015-09-09', 'famK'),
    n3: kid('n3', 'Zoe', 'Ash', '2016-07-07', 'famZ')
  },
  programs: {
    tr: { id: 'tr', name: 'U11 tryouts', kind: 'tryout', born: { lo: 2015, hi: 2016 }, evaluators: { coachU: true }, link: 'rl1', by: 'adm', at: 1 },
    f27: { id: 'f27', name: 'Fall 2027', kind: 'season', link: 'rl2', by: 'adm', at: 1 }
  },
  waivers: {},
  regs: {
    tr: {
      n1: { st: 'sent', by: 'famN', at: 10, sentBy: 'famN', sentAt: 10 },
      n2: { st: 'sent', by: 'famK', at: 20, sentBy: 'famK', sentAt: 20 },
      n3: { st: 'withdrawn', by: 'famZ', at: 5, sentBy: 'famZ', sentAt: 5 },
      p1: { st: 'sent', by: 'mumU', at: 30, sentBy: 'mumU', sentAt: 30 }
    }
  },
  agreed: {},
  roster: { t1: { p1: { number: '7', active: true } } },
  matches: {}, rsvp: {}
});

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
    let m = /^tryBibs\/([^/]+)$/.exec(rel);
    if (m) return !(admin || (((org.programs || {})[m[1]] || {}).evaluators || {})[uid]);
    if (/^evals\/[^/]+$/.test(rel)) return !admin;
    m = /^evals\/([^/]+)\/([^/]+)$/.exec(rel);
    if (m) return !(admin || (m[2] === uid && (((org.programs || {})[m[1]] || {}).evaluators || {})[uid]));
    m = /^(?:children|care|regs\/[^/]+|agreed\/[^/]+)\/([^/]+)$/.exec(rel);
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
  const A = H.loadApp({ firebase: fbk, config: CONFIG, storage: { 'sm.workspace': 'CLUB', 'sm.tree.v1:CLUB': 'orgs', ...(opts.storage || {}) } });
  await A.flush();
  A.dom.node('#sheet').hidden = true; A.dom.node('#scrim').hidden = true;
  fbk.signIn(who, { name: who, email: who + '@x.test' }); await A.flush();
  fbk.deliver('.info/connected', true);
  if (opts.hold) fbk.holdWrites(opts.hold);
  await fbk.serve(OB, org, () => A.flush(), rulesFor(who, org));
  await A.flush(10);
  // a family's own list of her children, at the root, then whatever it led her phone to ask for
  if (opts.kids) { fbk.deliver('families/' + who + '/CLUB', opts.kids); await A.flush(10); }
  await fbk.serve(OB, org, () => A.flush(), rulesFor(who, org));
  await A.flush(10);
  return { A, fbk };
}
const sheet = A => String(A.dom.node('#sheet').innerHTML);

(async () => {
  console.log('--- an admin names the evaluators ---');
  {
    const { A, fbk } = await boot('adm');
    A.ui.view = 'regs'; A.render();
    A.click({ act: 'progedit', id: 'tr' });
    check('the program sheet offers the club\'s staff as evaluators', /data-act="progeval" data-id="coach2"/.test(sheet(A)), true);
    check('— the one named already pressed', /data-act="progeval" data-id="coachU" aria-pressed="true"/.test(sheet(A)), true);
    A.click({ act: 'progeval', id: 'coach2' });
    A.dom.node('#pName').value = 'U11 tryouts'; A.dom.node('#pKind').value = 'tryout';
    for (const k of ['#pLo', '#pHi', '#pOpens', '#pCloses', '#pCap', '#pFee', '#pFeeNote', '#pAbout', '#pAsks', '#pGender']) A.dom.node(k).value = '';
    A.click({ act: 'progsave', id: 'tr' }); await A.flush(10);
    deepEq('saved with both', (valueAt(fbk, OB + '/programs/tr') || {}).evaluators, { coachU: true, coach2: true });
    check('— and the link carries none of them', /coachU|coach2|evaluators/.test(JSON.stringify(valueAt(fbk, 'regOpen/rl1') || {})), false);
    A.click({ act: 'progedit', id: 'f27' });
    A.click({ act: 'progeval', id: 'coachU' });
    A.dom.node('#pName').value = 'Fall 2027'; A.dom.node('#pKind').value = 'season';
    A.click({ act: 'progsave', id: 'f27' }); await A.flush(10);
    check('a season has no evaluators, whoever was ticked', 'evaluators' in (valueAt(fbk, OB + '/programs/f27') || {}), false);

    console.log('\n--- bibs ---');
    A.click({ act: 'regprog', id: 'tr' });
    check('the tryout\'s list offers bibs for the three without one', /Give 3 bibs/.test(A.rendered()), true);
    const before = fbk.record.writes.length;
    A.click({ act: 'trybibs', id: 'tr' }); await A.flush(10);
    const ws = fbk.record.writes.slice(before).map(w => w.path.slice(OB.length + 1));
    deepEq('the oldest registration first, each bib published before her registration names it', ws,
      ['tryBibs/tr/1', 'regs/tr/n1/bib', 'tryBibs/tr/2', 'regs/tr/n2/bib', 'tryBibs/tr/3', 'regs/tr/p1/bib']);
    deepEq('a published bib is a birth year and a gender', valueAt(fbk, OB + '/tryBibs/tr/2'), { at: valueAt(fbk, OB + '/tryBibs/tr/2').at, y: 2015, g: 'F' });
    check('— and nothing that names her', NAMES.test(JSON.stringify(fbk.record.writes.filter(w => /tryBibs/.test(w.path)))) || /n1|n2|p1/.test(JSON.stringify(fbk.record.writes.filter(w => /tryBibs/.test(w.path)).map(w => w.value))), false);
    check('the withdrawn registration has none', valueAt(fbk, OB + '/regs/tr/n3/bib'), undefined);
    A.render();
    check('nobody is left without one', /Give \d+ bib/.test(A.rendered()), false);
  }
  {
    const { A, fbk } = await boot('coachU');
    A.click({ act: 'trybibs', id: 'tr' }); await A.flush(10);
    check('a coach\'s tap on bibs writes nothing', fbk.record.writes.filter(w => /tryBibs|bib/.test(w.path)).length, 0);
  }

  console.log('\n--- an evaluator, at the pitch ---');
  const scored = () => { const o = ORG(); o.regs.tr.n1.bib = 1; o.regs.tr.n2.bib = 2; o.regs.tr.p1.bib = 3; o.tryBibs = { tr: { 1: { at: 1, y: 2016, g: 'F' }, 2: { at: 1, y: 2015, g: 'F' }, 3: { at: 1, y: 2016, g: 'F' } } }; return o; };
  {
    const { A, fbk } = await boot('coachU', scored(), { hold: p => /\/evals\//.test(p) });
    A.ui.view = 'club'; A.render();
    check('Club home has her tryouts to score', /Tryouts to score/.test(A.rendered()), true);
    check('her phone never asks for a registration', fbk.readPaths().some(p => /\/regs\//.test(p)), false);
    check('— but reads the bibs and her own scores', fbk.readPaths().includes(OB + '/tryBibs/tr') && fbk.readPaths().includes(OB + '/evals/tr/coachU'), true);
    check('— not everyone\'s', fbk.readPaths().includes(OB + '/evals/tr'), false);
    A.click({ act: 'goview', v: 'tryout' });
    check('her screen lists the bibs', /data-act="tryopen" data-bib="1"/.test(A.rendered()) && /data-bib="3"/.test(A.rendered()), true);
    check('— by birth year', /Born 2015/.test(A.rendered()), true);
    A.click({ act: 'tryopen', bib: '3' });
    check('a bib opens its criteria', /Bib 3/.test(A.rendered()) && /On the ball/.test(A.rendered()), true);
    check('nothing on her screen names a child', NAMES.test(A.rendered()), false);
    A.click({ act: 'tryscore', k: 'ball', n: '4' }); await A.flush(10);
    A.click({ act: 'tryscore', k: 'att', n: '5' }); await A.flush(10);
    const held = (fbk.record.held || []).filter(w => /\/evals\//.test(w.path));
    check('each score is her own record of that bib', held.every(w => w.path === OB + '/evals/tr/coachU/3'), true);
    deepEq('— with what she gave', (held[held.length - 1] || {}).value.s, { ball: 4, att: 5 });
    check('with no signal it waits in the outbox', A.pendingList().some(([p]) => p === 'evals/tr/coachU/3'), true);
    check('— and stays on her screen', /data-k="ball" data-n="4" aria-pressed="true"/.test(A.rendered()), true);
    A.click({ act: 'tryscore', k: 'att', n: '5' }); await A.flush(10);
    deepEq('the same score again takes it back', A.state.evals.tr.coachU[3].s, { ball: 4 });
    A.dom.node('#tryNote').value = 'Quick feet, Ella';
    A.click({ act: 'trynext' }); await A.flush(10);
    check('Next saves her note and moves on', A.state.evals.tr.coachU[3].note === 'Quick feet, Ella' && A.ui.tryout.bib === null, true);
    A.click({ act: 'tryopen', bib: '9' });
    check('a bib the club has not given is not opened', A.ui.tryout.bib, null);
    A.ui.tryout.bib = 9; A.click({ act: 'tryscore', k: 'ball', n: '3' }); await A.flush(10);
    check('— nor scored', A.pendingList().some(([p]) => /\/9$/.test(p)), false);
  }
  {
    const { A, fbk } = await boot('coach2', scored());
    A.ui.view = 'club'; A.render();
    check('a coach it does not name has no card', /Tryouts to score/.test(A.rendered()), false);
    check('— reads no bibs', fbk.readPaths().some(p => /tryBibs|evals/.test(p)), false);
    A.ui.view = 'tryout'; A.render();
    check('— and is put back on Club home', A.ui.view, 'club');
    A.ui.tryout = { prog: 'tr', bib: 1 };
    A.click({ act: 'tryscore', k: 'ball', n: '4' }); await A.flush(10);
    check('— a tap that reaches the handler writes nothing', fbk.record.writes.filter(w => /evals/.test(w.path)).length, 0);
  }
  {
    const { A, fbk } = await boot('mumU', scored());
    check('a family never reads the bibs or the scores', fbk.readPaths().some(p => /tryBibs|evals/.test(p)), false);
  }

  console.log('\n--- the admin: scores, an offer, and placing ---');
  {
    const o = scored();
    o.evals = { tr: { coachU: { 1: { s: { ball: 3, game: 3 }, at: 1 }, 2: { s: { ball: 5, game: 4, move: 5, att: 5 }, note: 'Leader', at: 1 } }, coach2: { 2: { s: { ball: 4 }, at: 1 } } } };
    o.programs.tr.evaluators.coach2 = true;
    const { A, fbk } = await boot('adm', o);
    A.click({ act: 'goview', v: 'regs' }); A.click({ act: 'regprog', id: 'tr' }); A.click({ act: 'trytab', k: 'scores' });
    const html = A.rendered();
    check('the scores name each child, for the admin', /Kit Rowe/.test(html) && /Nia Cole/.test(html), true);
    check('— highest overall first', html.indexOf('Kit Rowe') < html.indexOf('Nia Cole'), true);
    check('— with how many scored her', /<td><b>4\.6<\/b><\/td><td>2<\/td>/.test(html), true);
    A.click({ act: 'regopenone', prog: 'tr', id: 'n2' });
    check('her sheet has each evaluator\'s scores by name, and notes', /Cal:/.test(sheet(A)) && /Dee:/.test(sheet(A)) && /Leader/.test(sheet(A)), true);
    check('— and offers the teams her age fits', /data-act="tryoffer"[^>]*data-tid="t2"/.test(sheet(A)), true);
    A.click({ act: 'tryoffer', prog: 'tr', id: 'n2', tid: 't2' }); await A.flush(10);
    deepEq('an offer names the team, then she is offered', [valueAt(fbk, OB + '/regs/tr/n2/offer').team, valueAt(fbk, OB + '/regs/tr/n2/st')], ['t2', 'offered']);
    check('— and, as accepting does, she and her family are in the club', valueAt(fbk, OB + '/children/n2/club') === true && valueAt(fbk, OB + '/access/index/famK') === 'n2', true);
  }
  {
    const o = scored();
    o.children.n2.club = true; o.access.index.famK = 'n2';
    o.regs.tr.n2 = { ...o.regs.tr.n2, st: 'offered', offer: { team: 't2', by: 'adm', at: 50 } };
    const { A, fbk } = await boot('famK', o, { kids: { n2: true } });
    A.click({ act: 'goview', v: 'mine' });
    check('her family sees the offer on My players', /a place on/.test(A.rendered()) && /Storm/.test(A.rendered()), true);
    A.click({ act: 'tryans', prog: 'tr', id: 'n2', v: 'yes' }); await A.flush(10);
    const a = valueAt(fbk, OB + '/regs/tr/n2/ans') || {};
    deepEq('she accepts it, in her own name', [a.v, a.by], ['yes', 'famK']);
    check('her phone reads no bibs and no scores', fbk.readPaths().some(p => /tryBibs|evals/.test(p)), false);
    const before = fbk.record.writes.length;
    A.click({ act: 'tryans', prog: 'tr', id: 'n1', v: 'yes' }); await A.flush(10);
    check('another family\'s offer is not hers to answer', fbk.record.writes.length, before);
  }
  {
    const o = scored();
    o.children.n2.club = true; o.access.index.famK = 'n2';
    o.regs.tr.n2 = { ...o.regs.tr.n2, st: 'offered', offer: { team: 't2', by: 'adm', at: 50 }, ans: { v: 'yes', by: 'famK', at: 60 } };
    const { A, fbk } = await boot('adm', o);
    A.click({ act: 'goview', v: 'regs' }); A.click({ act: 'regprog', id: 'tr' });
    A.click({ act: 'regopenone', prog: 'tr', id: 'n2' });
    check('an accepted offer says so, and offers to place her', /her family accepted/.test(sheet(A)) && /Place her on Storm/.test(sheet(A)), true);
    A.click({ act: 'regplace', prog: 'tr', id: 'n2', tid: 't1' }); await A.flush(10);
    check('— not on another team than the one offered', valueAt(fbk, OB + '/regs/tr/n2/st'), undefined);
    A.click({ act: 'regplace', prog: 'tr', id: 'n2', tid: 't2' }); await A.flush(10);
    check('— on the team offered: her squad record, then placed', !!fbk.record.writes.find(w => /^orgs\/CLUB\/squad\/t2\/[^/]+$/.test(w.path) && w.value.child === 'n2') && valueAt(fbk, OB + '/regs/tr/n2/st') === 'placed', true);
  }

  console.log('\n--- a bib nobody holds ---');
  {
    const o = scored();
    delete o.regs.tr.n2;   // her family deleted it
    o.evals = { tr: { coachU: { 1: { s: { ball: 3 }, at: 1 }, 2: { s: { ball: 5 }, at: 1 } } } };
    const { A, fbk } = await boot('adm', o);
    A.click({ act: 'goview', v: 'regs' }); A.click({ act: 'regprog', id: 'tr' }); await A.flush(10);
    check('opening the program takes the bib\'s scores', fbk.record.removes.includes(OB + '/evals/tr/coachU/2'), true);
    check('— and the bib', fbk.record.removes.includes(OB + '/tryBibs/tr/2'), true);
    check('— and nothing anybody holds', fbk.record.removes.some(p => /\/(1|3)$/.test(p)), false);
  }
  {
    const o = scored();
    delete o.regs.tr.n2;
    o.evals = { tr: { coachU: { 2: { s: { ball: 5 }, at: 1 } } } };
    const fbk = makeFakebase();
    const A = H.loadApp({ firebase: fbk, config: CONFIG, storage: { 'sm.workspace': 'CLUB', 'sm.tree.v1:CLUB': 'orgs' } });
    await A.flush(); fbk.signIn('adm', { name: 'adm' }); await A.flush();
    A.state.programs = o.programs; A.state.regs = o.regs; A.state.tryBibs = o.tryBibs; A.state.evals = o.evals;
    A.state.access = { ...o.access };
    check('a phone that has not heard the club this session takes nothing', A.tidyBibs('tr'), 0);
  }

  console.log('\n--- the scores, side by side ---');
  {
    const A = H.loadApp({});
    const sc = A.bibScores({ e1: { 3: { s: { ball: 4, game: 2 }, at: 1 }, 5: { s: { att: 5 }, at: 1 } }, e2: { 3: { s: { ball: 2, move: 3 }, at: 1 }, 9: { note: 'no scores', at: 1 } } });
    check('a bib two evaluators scored counts both', sc[3].n, 2);
    check('— each criterion its own mean, over whoever scored it', [sc[3].avg.ball, sc[3].avg.game, sc[3].avg.move, sc[3].avg.att].join(), '3,2,3,');
    check('— and overall the mean of every score given it', sc[3].all, (4 + 2 + 2 + 3) / 4);
    check('a record with no scores is not one', sc[9], undefined);
    deepEq('bibs go to whoever has none, oldest first, withdrawn and declined left out, round numbers taken', A.bibsToGive({
      a: { st: 'sent', sentAt: 30 }, b: { st: 'sent', sentAt: 10 }, c: { st: 'withdrawn', sentAt: 1 }, d: { st: 'declined', sentAt: 2 }, e: { st: 'accepted', bib: 2, sentAt: 3 }, f: { st: 'waitlist', sentAt: 20 }
    }, { 1: { at: 1 } }), [['b', 3], ['f', 4], ['a', 5]]);
  }

  H.summary('tryouts');
})();
