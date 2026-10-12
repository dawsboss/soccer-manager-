/* Coach compliance (GOTSPORT.md, *Coach and volunteer compliance*; build
   139, rules version 31), against the fake Firebase on a club on orgs/.
   What is pinned:

   - Where an item stands: lapsed, lapsing within thirty days, not recorded
     (SafeSport, concussion and the background check; never the licence),
     or fine; a SafeSport or background check with no lapse date lapses a
     year after it was done.
   - Everyone the club should hold a record for is its coaches, helpers and
     admins, never a tracker or a family, the most urgent first.
   - Only an admin keeps the records, checked in the click handler, one
     person's written whole in her own name; a coach's tap writes nothing.
   - An admin's phone reads every record and has a card on Club home while
     anything needs doing; a coach's reads her own record and nobody
     else's, and her card names only her own to-dos; a tracker's and a
     family's read none. Nothing about anyone's teams changes. */

const H = require('./harness');
const { check, deepEq } = H;
const { makeFakebase } = require('./fakebase');

const CONFIG = { apiKey: 'k', databaseURL: 'https://prod.example', projectId: 'p' };
const OB = 'orgs/CLUB';
const valueAt = (fbk, p) => { const w = fbk.writtenTo(p); return w.length ? w[w.length - 1].value : undefined; };
// the harness clock starts at 2026-09-12; "today" for these checks
const TODAY = '2026-09-12';

const ORG = () => ({
  access: {
    admins: { adm: true },
    index: { adm: true, coachU: true, coach2: true, helpU: true, trk: true, mumU: true },
    teams: { t1: { coaches: { coachU: true }, helpers: { helpU: true }, trackers: { trk: true } }, t2: { coaches: { coach2: true } } },
    teamIndex: { t1: { coachU: 'coach', helpU: 'helper', trk: 'tracker' }, t2: { coach2: 'coach' } },
    coachIndex: { coachU: 't1', coach2: 't2' },
    helperIndex: { helpU: 't1' },
    teamParents: { t1: { mumU: 'p1' } }
  },
  org: { name: 'Lakeside SC' },
  members: { adm: { name: 'Ada' }, coachU: { name: 'Cal' }, coach2: { name: 'Dee' }, helpU: { name: 'Hal' }, trk: { name: 'Tia' }, mumU: { name: 'Mo' } },
  names: { adm: { name: 'Ada' }, coachU: { name: 'Cal' }, coach2: { name: 'Dee' }, helpU: { name: 'Hal' }, trk: { name: 'Tia' } },
  teams: { t1: { id: 't1', name: 'Flight' }, t2: { id: 't2', name: 'Storm' } },
  squad: { t1: { p1: { id: 'p1', name: 'Ella Fitz', number: '7', active: true, guardians: { mumU: true } } } },
  roster: { t1: { p1: { number: '7', active: true } } },
  comply: {
    adm: { safe: { done: '2026-03-01', lapses: '2027-03-01' }, conc: { done: '2026-03-01' }, bg: { done: '2026-03-02', lapses: '2027-03-02' }, by: 'adm', at: 1 },
    coachU: { safe: { done: '2025-09-01', lapses: '2026-09-01' }, conc: { done: '2025-08-01' }, by: 'adm', at: 1 },
    coach2: { safe: { done: '2025-10-01', lapses: '2026-10-01' }, conc: { done: '2025-08-01' }, bg: { done: '2025-10-02', lapses: '2026-10-02' }, by: 'adm', at: 1 }
  },
  matches: {}, rsvp: {}
});
function rulesFor(uid, org) {
  const a = org.access, admin = !!a.admins[uid], coach = !!(a.coachIndex || {})[uid];
  return p => {
    const rel = p.slice(OB.length + 1);
    if (!a.index[uid]) return true;
    if (rel === 'members') return !(admin || coach);
    if (rel === 'members/' + uid) return false;
    if (rel === 'log') return !admin;
    if (/^(coachNotes|children)$/.test(rel) || rel.startsWith('coachNotes/')) return !(admin || coach);
    if (rel === 'comply') return !admin;
    const m = /^comply\/([^/]+)$/.exec(rel);
    if (m) return !(admin || m[1] === uid);
    if (/^squad\/[^/]+$/.test(rel)) return !(admin || coach || ((a.teamIndex || {})[rel.split('/')[1]] || {})[uid]);
    if (/^teamCare\//.test(rel)) return !admin;
    return false;
  };
}
async function boot(who, org = ORG()) {
  const fbk = makeFakebase();
  const A = H.loadApp({ firebase: fbk, config: CONFIG, storage: { 'sm.workspace': 'CLUB', 'sm.tree.v1:CLUB': 'orgs' } });
  await A.flush();
  A.dom.node('#sheet').hidden = true; A.dom.node('#scrim').hidden = true;
  fbk.signIn(who, { name: who, email: who + '@x.test' }); await A.flush();
  fbk.deliver('.info/connected', true);
  for (let i = 0; i < 2; i++) { await fbk.serve(OB, org, () => A.flush(), rulesFor(who, org)); await A.flush(10); }
  return { A, fbk };
}
const sheet = A => String(A.dom.node('#sheet').innerHTML);

(async () => {
  console.log('--- where a record stands ---');
  {
    const { A, fbk } = await boot('adm');
    check('today, for these checks', A.nowMs() > 0 && new Date(A.nowMs()).toISOString().slice(0, 10), TODAY);
    check('a lapse date passed is lapsed', A.complyState({ done: '2025-09-01', lapses: '2026-09-01' }, true, TODAY), 'lapsed');
    check('— within thirty days lapses soon', A.complyState({ lapses: '2026-10-12' }, true, TODAY), 'soon');
    check('— a day past thirty is fine', A.complyState({ lapses: '2026-10-13' }, true, TODAY), 'ok');
    check('— no lapse date never lapses', A.complyState({ done: '2010-01-01' }, true, TODAY), 'ok');
    check('nothing for a required item is not recorded', A.complyState(undefined, true, TODAY), 'none');
    check('— and for the licence, nothing to flag', A.complyState(undefined, false, TODAY), 'blank');
    deepEq('a record\'s to-dos, in MSYSA\'s order', A.complyFlags({ safe: { lapses: '2026-09-01' }, conc: { done: '2026-01-01' } }, TODAY).map(f => f.k + ':' + f.st), ['safe:lapsed', 'bg:none']);
    const read = vals => A.complyRead(id => vals[id] || '');
    deepEq('a SafeSport course with no lapse date lapses a year on', read({ cm_safe_done: '2024-02-29' }).rec.safe, { done: '2024-02-29', lapses: '2025-03-01' });
    check('— a concussion course does not', read({ cm_conc_done: '2025-01-05' }).rec.conc.lapses, undefined);
    check('a lapse before it was done is refused', !!read({ cm_bg_done: '2025-05-01', cm_bg_lapses: '2025-01-01' }).why, true);
    check('a date that is not one is refused', !!read({ cm_safe_done: '01/05/2025' }).why, true);
    deepEq('the licence keeps its name', read({ cm_lic_name: 'USSF D', cm_lic_done: '2023-06-01' }).rec.lic, { done: '2023-06-01', name: 'USSF D' });

    console.log('\n--- the admin ---');
    deepEq('everyone the club should hold a record for, the most urgent first', A.complyRows(TODAY).map(r => r.uid), ['coachU', 'helpU', 'coach2', 'adm']);
    check('— never a tracker or a family', A.complyRows(TODAY).some(r => r.uid === 'trk' || r.uid === 'mumU'), false);
    A.ui.view = 'club'; A.render();
    check('Club home has the tally', /Coach compliance/.test(A.rendered()) && /1 lapsed/.test(A.rendered()) && /1 lapsing soon/.test(A.rendered()) && /2 with something not recorded/.test(A.rendered()), true);
    A.click({ act: 'goview', v: 'comply' });
    check('the list names each one with what needs doing', /Cal/.test(A.rendered()) && /SafeSport lapsed/.test(A.rendered()) && /Hal/.test(A.rendered()), true);
    A.click({ act: 'complyopen', uid: 'helpU' });
    check('a record opens for her to keep', /cm_safe_done/.test(sheet(A)), true);
    A.dom.node('#cm_safe_done').value = '2026-09-10';
    A.dom.node('#cm_conc_done').value = '2026-09-11';
    A.dom.node('#cm_bg_done').value = '2026-09-15';
    for (const k of ['#cm_safe_lapses', '#cm_conc_lapses', '#cm_bg_lapses', '#cm_lic_done', '#cm_lic_lapses', '#cm_lic_name', '#cm_note']) A.dom.node(k).value = '';
    A.click({ act: 'complysave', uid: 'helpU' }); await A.flush(10);
    const w = valueAt(fbk, OB + '/comply/helpU') || {};
    deepEq('written whole, in her own name', [w.safe, w.bg.lapses, w.by], [{ done: '2026-09-10', lapses: '2027-09-10' }, '2027-09-15', 'adm']);
    A.dom.node('#sheet').innerHTML = '';
    A.click({ act: 'complyopen', uid: 'trk' });
    check('a tracker has no record to keep', /cm_safe_done/.test(sheet(A)), false);
  }

  console.log('\n--- a coach ---');
  {
    const { A, fbk } = await boot('coachU');
    check('her phone reads her own record', fbk.readPaths().includes(OB + '/comply/coachU'), true);
    check('— not the list, nor anyone else\'s', fbk.readPaths().some(p => p === OB + '/comply' || (/\/comply\//.test(p) && !/coachU$/.test(p))), false);
    A.ui.view = 'club'; A.render();
    check('Club home names her own to-dos', /Your coaching records/.test(A.rendered()) && /SafeSport lapsed/.test(A.rendered()) && /Background check not recorded/.test(A.rendered()), true);
    check('— and not the club\'s tally', /Coach compliance/.test(A.rendered()), false);
    check('— and nobody else\'s', /Dee|Hal/.test(A.rendered().slice(A.rendered().indexOf('Your coaching records'), A.rendered().indexOf('Your coaching records') + 400)), false);
    check('she still has her team', /Flight/.test(A.rendered()) && A.canEditTeam('t1'), true);
    A.ui.view = 'comply'; A.render();
    check('the list is put back on Club home', A.ui.view, 'club');
    A.click({ act: 'complysave', uid: 'coachU' }); await A.flush(10);
    check('a tap that reaches the handler writes nothing', fbk.record.writes.filter(w => /comply/.test(w.path)).length, 0);
  }
  {
    const { A } = await boot('coach2');
    A.ui.view = 'club'; A.render();
    check('a coach lapsing within thirty days is told', /Your coaching records/.test(A.rendered()) && /SafeSport lapses soon/.test(A.rendered()), true);
  }
  for (const who of ['trk', 'mumU']) {
    const { A, fbk } = await boot(who);
    check(`${who === 'trk' ? 'a tracker' : 'a family'} reads no coaching record`, fbk.readPaths().some(p => /comply/.test(p)), false);
    A.ui.view = 'club'; A.render();
    check('— and has no card', /coaching records|Coach compliance/.test(A.rendered()), false);
  }
  {
    const o = ORG();
    o.comply.coachU = { safe: { done: '2026-06-01', lapses: '2027-06-01' }, conc: { done: '2026-06-01' }, bg: { done: '2026-06-02', lapses: '2027-06-02' }, by: 'adm', at: 1 };
    const { A } = await boot('coachU', o);
    A.ui.view = 'club'; A.render();
    check('a coach who is up to date has no card', /Your coaching records/.test(A.rendered()), false);
  }

  H.summary('coach compliance');
})();
