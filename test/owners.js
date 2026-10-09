/* The club owner, and who is told when the admin list changes (SECURITY.md,
   SEC-D8).

   Any admin used to be able to remove every other admin and own the club.
   The rules now let only a club owner take an admin away (test/rules.js has
   them, both trees); this holds the other two halves to the same design:

   - the server (functions/adminwatch.js, watchAdmin and watchOwner, required
     as deployed on the fake server, and again with every club on orgs/ as
     owners-orgs): every admin and owner told of an admin or owner given or
     taken away, the person it happened to included and never the one who
     did it, named from a fresh diary entry only; nothing that cannot be
     turned off muted; a record at clubAudit/{code}; a value rewritten, a
     retired club and a redelivered event saying nothing;
   - the app: the claim button on a club with no owner, and only for its
     admins; an admin refused another admin's removal once there is an owner
     (checked in the handler, so nothing is written), the owner allowed it,
     everyone allowed to step down; owners made and stepped down only as the
     rules allow; retiring owner-only; the diary written before the change,
     with the change's real name; and pushAll() writing one admin at a time. */

const H = require('./harness');
const { check, deepEq } = H;
const { makeServer, makeFakebase, ORGS_MODE } = require('./fakebase');

const W = 'workspaces/CLUB/';
const NOW = Date.now();

const CLUB = (owners) => ({
  access: {
    org: { name: 'Lakeside SC' },
    admins: { adm: true, adm2: true, adm3: true },
    ...(owners ? { owners } : {}),
    index: { adm: true, adm2: true, adm3: true, coach: true, mum: true },
    members: { adm: { name: 'Ada' }, adm2: { name: 'Bea' }, adm3: { name: 'Cal' }, coach: { name: 'Jaz' }, mum: { name: 'Mo' } },
    teams: { t1: { coaches: { coach: true } } },
    teamIndex: { t1: { coach: 'coach' } },
    coachIndex: { coach: 't1' },
    log: {}
  },
  teams: { t1: { id: 't1', name: 'Flight', players: { p1: { id: 'p1', name: 'Ella', guardians: { mum: true } } } } },
  matches: {}
});
const TOKENS = () => {
  const o = {};
  for (const u of ['adm', 'adm2', 'adm3', 'coach', 'mum', 'newbie']) o[u] = { ['tok_' + u]: true };
  return o;
};
function server(owners, extra) {
  const S = makeServer({ workspaces: { CLUB: CLUB(owners) }, pushTokens: TOKENS(), ...(extra || {}) });
  S.loadFunctions();
  return S;
}
const told = S => [...new Set(S.sent().map(m => m.data.uid))].sort();
const said = (S, u) => (S.sent().find(m => m.data.uid === u) || { data: {} }).data;
const audit = S => Object.values(S.at('clubAudit/CLUB') || {});
const logged = (S, id, e) => S.put(W + 'access/log/' + id, { at: NOW - 1000, ...e });

(async () => {

  console.log('--- the triggers that are deployed ---');
  {
    const S = server();
    deepEq('one on admins and one on owners, each once per tree', Object.keys(S.triggers).filter(n => /^watch/.test(n)).sort(),
      ['watchAdmin', 'watchAdminOrgs', 'watchOwner', 'watchOwnerOrgs']);
    check('a goal wakes neither', (await S.wouldWake(W + 'matches/g1/events/x', { type: 'goal' })).filter(n => /^watch/.test(n)).length, 0);
    check('nor a coach given', (await S.wouldWake(W + 'access/teams/t1/coaches/newbie', true)).filter(n => /^watch/.test(n)).length, 0);
  }

  console.log('\n--- the owner takes an admin away ---');
  {
    const S = server({ adm: true });
    logged(S, 'l1', { act: 'removed admin', by: 'adm', byName: 'Ada', target: 'adm3' });
    const r = (await S.fire(W + 'access/admins/adm3', null)).watchAdmin;
    deepEq('every admin and owner, and the one removed, are told', told(S), ['adm2', 'adm3']);
    check('never the one who did it', told(S).includes('adm'), false);
    check('nor a coach or a family', told(S).some(u => u === 'coach' || u === 'mum'), false);
    check('the one removed hears who did it', said(S, 'adm3').body, 'Ada took away your place as an admin of Lakeside SC.');
    check('and the others what happened', said(S, 'adm2').body, 'Cal is no longer an admin: Ada took it away.');
    check('as an urgent one', said(S, 'adm2').urgent, '1');
    check('opening the club\'s settings', said(S, 'adm2').hash, '#/club/settings');
    const a = audit(S);
    check('one record kept', a.length, 1);
    check('of what, to whom and by whom', [a[0].act, a[0].target, a[0].by, a[0].byName].join(), 'removed admin,adm3,adm,Ada');
    check('the result says so too', r && r.audit && r.audit.act, 'removed admin');
  }

  console.log('\n--- nobody recorded as doing it ---');
  {
    const S = server({ adm: true });
    await S.fire(W + 'access/admins/adm3', null);
    deepEq('then every admin and owner is told, the owner included', told(S), ['adm', 'adm2', 'adm3']);
    check('and told nobody is recorded', /Nobody is recorded as doing it\.$/.test(said(S, 'adm').body), true);
    check('the record says nobody', audit(S)[0].by, null);
  }
  {
    const S = server({ adm: true });
    S.put(W + 'access/log/old', { at: NOW - 60 * 60000, act: 'removed admin', by: 'adm2', target: 'adm3' });
    S.put(W + 'access/log/other', { at: NOW - 1000, act: 'removed admin', by: 'adm2', target: 'adm' });
    S.put(W + 'access/log/coach', { at: NOW - 1000, act: 'made coach', by: 'adm2', target: 'adm3' });
    await S.fire(W + 'access/admins/adm3', null);
    check('a stale diary entry is not trusted', audit(S)[0].by, null);
    check('nor one about someone else, or another role', told(S).includes('adm2'), true);
  }

  console.log('\n--- given, claimed, stepped down ---');
  {
    const S = server();
    logged(S, 'l1', { act: 'made admin', by: 'adm', byName: 'Ada', target: 'coach' });
    await S.fire(W + 'access/admins/coach', true);
    deepEq('an admin made: the admins, and her', told(S), ['adm2', 'adm3', 'coach']);
    check('she hears it', said(S, 'coach').body, 'Ada made you an admin of Lakeside SC.');
    check('the others too', said(S, 'adm2').body, 'Ada made Jaz an admin.');
  }
  {
    const S = server();
    logged(S, 'l1', { act: 'made owner', by: 'adm2', byName: 'Bea', target: 'adm2' });
    await S.fire(W + 'access/owners/adm2', true);
    deepEq('an admin claiming the club: every other admin is told', told(S), ['adm', 'adm3']);
    check('in words', said(S, 'adm').body, 'Bea made Bea an owner.');
    check('and it is kept', audit(S)[0].act, 'made owner');
  }
  {
    const S = server({ adm: true, adm2: true });
    logged(S, 'l1', { act: 'removed owner', by: 'adm2', byName: 'Bea', target: 'adm2' });
    await S.fire(W + 'access/owners/adm2', null);
    deepEq('an owner stepping down: everyone else who runs it', told(S), ['adm', 'adm3']);
  }

  console.log('\n--- what says nothing ---');
  {
    const S = server({ adm: true }, { people: { adm2: { mute: { msg: true, notice: true, cal: true, news: true } } } });
    await S.fire(W + 'access/admins/adm3', null);
    check('not something she can turn off', told(S).includes('adm2'), true);
  }
  {
    const S = server();
    await S.fire(W + 'access/admins/adm3', 'inv1');
    check('a value rewritten, nobody given or taken away: nothing', S.sent().length + audit(S).length, 0);
  }
  {
    const S = server({ adm: true }, { retired: { CLUB: { at: 1 } } });
    await S.fire(W + 'access/admins/adm3', null);
    check('a retired club: nothing', S.sent().length + audit(S).length, 0);
  }
  {
    const S = server({ adm: true });
    const name = ORGS_MODE ? 'watchAdminOrgs' : 'watchAdmin';
    const p = W + 'access/admins/adm3';
    S.put(p, null);
    const event = { id: 'ev1', params: { code: 'CLUB', uid: 'adm3' }, data: { before: { val: () => true, ref: S.ref(p) }, after: { val: () => null, ref: S.ref(p) } } };
    await S.triggers[name].handler(event);
    const n = S.sent().length;
    await S.triggers[name].handler(event);
    check('an event delivered twice is said once', S.sent().length, n);
    check('and kept once', audit(S).length, 1);
    check('and the first time it was said at all', n > 0, true);
  }
  {
    const S = server({ adm: true });
    await S.fire(W + 'access/admins/adm3', null);
    check('nothing of a child, a family or an email in what is sent', /Ella|Mo\b|@/.test(JSON.stringify(S.sent())), false);
  }

  if (ORGS_MODE) { H.summary('who runs the club, with every club on orgs/'); return; }

  /* ---------------- the app ---------------- */

  const CONFIG = { apiKey: 'k', databaseURL: 'https://prod.example', projectId: 'p' };
  async function device(uid, owners, opts = {}) {
    const fbk = makeFakebase();
    const order = [];
    fbk.refuseWrites((p, v) => { order.push(p + (v === null ? ' x' : '')); return false; });
    const D = H.loadApp({ firebase: fbk, config: CONFIG, storage: { 'sm.workspace': 'CLUB' }, ...opts });
    await D.flush();
    fbk.signIn(uid, { name: (CLUB().access.members[uid] || {}).name }); await D.flush();
    fbk.deliver('workspaces/CLUB', CLUB(owners)); await D.flush();
    fbk.deliver('.info/connected', true); await D.flush();
    D.render(); await D.flush();
    order.length = 0;
    const admin = () => { D.ui.view = 'admin'; D.render(); return String(D.dom.node('#app').innerHTML || ''); };
    const removed = p => order.includes(W + p + ' x');
    const wrote = p => order.includes(W + p);
    return { D, fbk, order, admin, removed, wrote };
  }
  const logActs = D => Object.values(D.acc().log || {}).map(e => e.act + ' ' + e.target).sort();

  console.log('\n--- a club with no owner yet ---');
  {
    const { D, admin, removed } = await device('adm2');
    check('its admins are offered the claim', /Become the club owner/.test(admin()), true);
    check('Check readiness has a cross for it', D.readiness().some(r => r.label === 'Somebody owns it' && !r.ok), true);
    D.click({ act: 'setrole', uid: 'adm3', r: 'admin' }); await D.flush();
    check('and any admin still removes another, as the rules let her', removed('access/admins/adm3'), true);
  }
  {
    const { D, order, wrote } = await device('adm2');
    D.click({ act: 'claimowner' }); await D.flush();
    check('the claim is one write, at her own entry', wrote('access/owners/adm2'), true);
    const li = order.findIndex(p => /access\/log\//.test(p)), oi = order.indexOf(W + 'access/owners/adm2');
    check('logged first, so the server can name her', li > -1 && li < oi, true);
    check('as what it is', logActs(D).includes('made owner adm2'), true);
    check('then she owns it', D.isClubOwner('adm2'), true);
  }
  {
    const { D, admin, order } = await device('coach');
    check('a coach is never offered it', /Become the club owner/.test(admin()), false);
    D.click({ act: 'claimowner' }); await D.flush();
    check('and a tap is refused in the handler', order.some(p => /owners/.test(p)), false);
    check('with a reason', D.lastToast(), 'Club admins only');
  }

  console.log('\n--- once it has one ---');
  {
    const { D, admin, order, removed } = await device('adm2', { adm: true });
    check('no claim button', /Become the club owner/.test(admin()), false);
    check('the owner is named', /Owned by Ada/.test(admin()), true);
    D.click({ act: 'claimowner' }); await D.flush();
    check('a claim is refused', order.some(p => /owners/.test(p)), false);
    D.click({ act: 'setrole', uid: 'adm3', r: 'admin' }); await D.flush();
    check('an admin cannot remove another admin', removed('access/admins/adm3'), false);
    check('and is told why', D.lastToast(), 'Only the club owner can take an admin away');
    D.click({ act: 'setrole', uid: 'adm', r: 'admin' }); await D.flush();
    check('nor the owner', removed('access/admins/adm'), false);
    check('nothing at all was written', order.length, 0);
    D.click({ act: 'setrole', uid: 'coach', r: 'admin' }); await D.flush();
    check('she still makes an admin', order.includes(W + 'access/admins/coach'), true);
    check('logged as made, not removed', logActs(D).includes('made admin coach'), true);
    D.click({ act: 'setrole', uid: 'adm2', r: 'admin' }); await D.flush();
    check('and steps down herself', removed('access/admins/adm2'), true);
  }
  {
    const { D, order, removed } = await device('adm', { adm: true });
    D.click({ act: 'setrole', uid: 'adm3', r: 'admin' }); await D.flush();
    check('the owner removes an admin', removed('access/admins/adm3'), true);
    const li = order.findIndex(p => /access\/log\//.test(p)), ri = order.indexOf(W + 'access/admins/adm3 x');
    check('logged before the change', li > -1 && li < ri, true);
    check('as removed, which it was', logActs(D).includes('removed admin adm3'), true);
    D.click({ act: 'setrole', uid: 'adm', r: 'admin' }); await D.flush();
    check('but not herself while she owns it', removed('access/admins/adm'), false);
  }

  console.log('\n--- owners made and stepping down ---');
  {
    const { D, order, wrote, removed } = await device('adm', { adm: true });
    D.click({ act: 'setowner', uid: 'coach' }); await D.flush();
    check('not someone who is not an admin', order.length, 0);
    D.click({ act: 'setowner', uid: 'adm' }); await D.flush();
    check('the last owner cannot step down', removed('access/owners/adm'), false);
    check('and is told how', /Make another admin an owner first/.test(D.lastToast()), true);
    D.click({ act: 'setowner', uid: 'adm2' }); await D.flush();
    check('the owner makes another admin an owner', wrote('access/owners/adm2'), true);
    D.click({ act: 'setowner', uid: 'adm2' }); await D.flush();
    check('but cannot take it from her', removed('access/owners/adm2'), false);
    D.click({ act: 'setowner', uid: 'adm' }); await D.flush();
    check('and with two, steps down herself', removed('access/owners/adm'), true);
  }
  {
    const { D, order } = await device('adm2', { adm: true });
    D.click({ act: 'setowner', uid: 'adm3' }); await D.flush();
    check('an admin who does not own it makes no owner', order.length, 0);
  }

  console.log('\n--- retiring it ---');
  {
    const { D, order } = await device('adm2', { adm: true });
    D.click({ act: 'retireclub' }); await D.flush();
    check('an admin who does not own it cannot', order.includes('retired/CLUB'), false);
    check('and is told', D.lastToast(), 'Only the club owner can retire it');
  }
  {
    const { D, order } = await device('adm', { adm: true });
    D.click({ act: 'retireclub' }); await D.flush();
    check('the owner can', order.includes('retired/CLUB'), true);
  }
  {
    const { D, order } = await device('adm2');
    D.click({ act: 'retireclub' }); await D.flush();
    check('and any admin, while nobody owns the club', order.includes('retired/CLUB'), true);
  }

  console.log('\n--- writes at the depth the rules sit at ---');
  {
    const { D, order } = await device('adm', { adm: true });
    D.pushAll(); await D.flush();
    check('pushAll() never writes the admin list whole', order.includes(W + 'access/admins'), false);
    check('one admin at a time', ['adm', 'adm2', 'adm3'].every(u => order.includes(W + 'access/admins/' + u)), true);
    check('and the owner after them', order.indexOf(W + 'access/owners/adm') > order.indexOf(W + 'access/admins/adm3'), true);
  }

  console.log('\n--- a club nobody ran, taken by the app owner ---');
  {
    const fbk = makeFakebase();
    const order = [];
    fbk.refuseWrites(p => { order.push(p); return false; });
    const D = H.loadApp({ firebase: fbk, config: CONFIG, storage: { 'sm.workspace': 'CLUB' } });
    await D.flush();
    fbk.signIn('own', { name: 'Owner' }); await D.flush();
    fbk.deliver('appOwners', { own: true });
    const c = CLUB(); c.access.admins = {}; c.access.index = {};
    fbk.deliver('workspaces/CLUB', c); await D.flush();
    fbk.deliver('.info/connected', true); await D.flush();
    order.length = 0;
    D.click({ act: 'claimadmin' }); await D.flush();
    check('she becomes its admin', order.includes(W + 'access/admins/own'), true);
    check('and its owner, as a founder does', order.indexOf(W + 'access/owners/own') > order.indexOf(W + 'access/admins/own'), true);
  }

  H.summary('who runs the club: the owner, and every admin told');
})();
