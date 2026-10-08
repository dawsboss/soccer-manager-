/* Getting parents in without one invite per family.

   Two ways, both driven against the fake Firebase. A personal link per
   family, made for a whole squad in one go (admins). And AUTH.md's bulk path:
   one team link, a parent asks with a shirt number, a coach approves.

   test/rules.js pins what the database allows; this pins that the app asks
   for exactly that, in the order the rules need — the approval before the
   index write that depends on it — and that a parent sees no child's name
   before she is let in. */

const H = require('./harness');
const { check } = H;
const { makeFakebase } = require('./fakebase');

const CONFIG = { apiKey: 'k', databaseURL: 'https://prod.example', projectId: 'p' };
const CODE = 'jabc123';

const CLUB = {
  access: {
    org: { name: 'Lakeside SC' },
    admins: { adm: true },
    index: { adm: true, coach: true, mum: true, other: true },
    members: { adm: { name: 'Ada' }, coach: { name: 'Jaz' }, mum: { name: 'Mo' }, other: { name: 'Kim' } },
    teams: { t1: { coaches: { coach: true } }, t2: { coaches: { other: true } } },
    teamIndex: { t1: { coach: 'coach' }, t2: { other: 'coach' } },
    teamParents: { t1: { mum: 'p1' } }
  },
  teams: {
    t1: { id: 't1', name: 'Flight', join: { code: CODE, at: 1 }, players: {
      p1: { id: 'p1', name: 'Ella', number: '7', active: true, guardians: { mum: true } },
      p2: { id: 'p2', name: 'Bea', number: '9', active: true },
      p3: { id: 'p3', name: 'Cleo', number: '4', active: true },
      p4: { id: 'p4', name: 'Dot', number: '5', active: false }
    } },
    t2: { id: 't2', name: 'Storm', players: { q1: { id: 'q1', name: 'Gia', number: '9', active: true } } }
  },
  matches: {}
};
const JOINDOC = { ws: 'CLUB', team: 't1', teamName: 'Flight', clubName: 'Lakeside SC', by: 'coach', byName: 'Jaz', at: 1 };

async function boot(who, opts = {}) {
  const fbk = makeFakebase();
  const storage = opts.storage || { 'sm.workspace': 'CLUB' };
  const A = H.loadApp({ firebase: fbk, config: CONFIG, storage, search: opts.search });
  await A.flush();
  if (who) { fbk.signIn(who, { name: opts.name || who, email: who + '@x.test' }); await A.flush(); }
  if (storage['sm.workspace']) { fbk.deliver('workspaces/CLUB', JSON.parse(JSON.stringify(CLUB))); await A.flush(); }
  return { A, fbk };
}
const paths = fbk => fbk.record.writes.map(w => w.path);
const valueAt = (fbk, p) => { const w = fbk.writtenTo(p); return w.length ? w[w.length - 1].value : undefined; };

(async () => {

  console.log('--- a whole squad\'s parents, one link each ---');
  {
    const { A, fbk } = await boot('adm');
    A.ui.teamId = 't1';
    A.click({ act: 'squadinvites', tid: 't1' });
    check('offers links for the two with no parent', /Make 2 links/.test(String(A.dom.node('#sheet').innerHTML)), true);
    A.click({ act: 'squadinvitego', tid: 't1' }); await A.flush(20);
    const made = fbk.record.writes.filter(w => /^invites\/[^/]+$/.test(w.path)).map(w => w.value);
    check('one parent invite per player without a parent', made.map(v => v.player).sort().join(), 'p2,p3');
    check('none for a player who has one, or is off the roster', made.some(v => v.player === 'p1' || v.player === 'p4'), false);
    check('each names the shirt, never the child', made.every(v => v.playerNo && !JSON.stringify(v).includes('Bea') && !JSON.stringify(v).includes('Cleo')), true);
    check('each on the admin\'s list', fbk.record.writes.filter(w => /^clubInvites\/CLUB\/[^/]+$/.test(w.path)).length, 2);
    const sheet = String(A.dom.node('#sheet').innerHTML);
    check('the sheet now has a link to copy for each', (sheet.match(/data-act="copylink"/g) || []).length, 2);
    const before = fbk.record.writes.length;
    A.click({ act: 'squadinvitego', tid: 't1' }); await A.flush(20);
    check('running it again makes nothing new', fbk.record.writes.filter((w, i) => i >= before && w.path.startsWith('invites/')).length, 0);
  }
  {
    const { A, fbk } = await boot('coach');
    A.click({ act: 'squadinvitego', tid: 't1' }); await A.flush(20);
    check('a coach cannot make personal invites', fbk.record.writes.some(w => w.path.startsWith('invites/')), false);
  }

  console.log('\n--- the team link, made by its coach ---');
  {
    const club = JSON.parse(JSON.stringify(CLUB)); delete club.teams.t1.join;
    const fbk = makeFakebase();
    const A = H.loadApp({ firebase: fbk, config: CONFIG, storage: { 'sm.workspace': 'CLUB' } });
    await A.flush(); fbk.signIn('coach', { name: 'Jaz' }); await A.flush();
    fbk.deliver('workspaces/CLUB', club); await A.flush();
    A.ui.teamId = 't1'; A.ui.view = 'roster'; A.render();
    check('Squad offers a team link', /Make a team link/.test(A.rendered()), true);
    A.click({ act: 'joinnew', tid: 't1' }); await A.flush();
    const jw = fbk.record.writes.find(w => /^joinCodes\/[^/]+$/.test(w.path));
    check('written at the root, for this team', jw && jw.value.ws + '/' + jw.value.team, 'CLUB/t1');
    check('stamped as her', jw && jw.value.by, 'coach');
    check('carries no child\'s name', /Ella|Bea|Cleo/.test(JSON.stringify(jw && jw.value)), false);
    const code = jw.path.split('/')[1];
    check('the team remembers it', (valueAt(fbk, 'workspaces/CLUB/teams/t1/join') || {}).code, code);
    A.click({ act: 'joinnew', tid: 't1' }); await A.flush();
    check('a new link retires the old one', fbk.record.removes.includes('joinCodes/' + code), true);
  }
  {
    const { A, fbk } = await boot('other');
    A.click({ act: 'joinnew', tid: 't1' }); await A.flush();
    check('another team\'s coach cannot make one', fbk.record.writes.some(w => w.path.startsWith('joinCodes/')), false);
  }

  console.log('\n--- a parent follows it ---');
  {
    const { A, fbk } = await boot(null, { storage: {}, search: '?join=' + CODE });
    check('the link is kept on the device', JSON.parse(A.storage.getItem('sm.join')).code, CODE);
    check('and taken off the address bar', /join=/.test(A.dom.replaced || ''), false);
    fbk.signOut(); await A.flush();
    check('signed out, it asks for a sign-in', /Sign in first/.test(A.rendered()), true);
    fbk.signIn('sam', { name: 'Sam', email: 'sam@x.test' }); await A.flush();
    check('then reads the link', fbk.watching('joinCodes/' + CODE), true);
    fbk.deliver('joinCodes/' + CODE, JOINDOC); await A.flush();
    check('and looks for a request already made', fbk.watching('claims/CLUB/t1/sam'), true);
    fbk.deliver('claims/CLUB/t1/sam', null); await A.flush();
    const html = A.rendered();
    check('it says which team and club', /Join Flight/.test(html) && /Lakeside SC/.test(html), true);
    check('and asks for the shirt number', /id="joinShirt"/.test(html), true);
    check('no child\'s name before she is let in', /Ella|Bea|Cleo/.test(html), false);
    check('crumbs stay empty', A.rendered('#crumbs'), '');

    A.dom.node('#joinShirt').value = ' 9 ';
    A.dom.node('#joinChild').value = 'Bea';
    A.click({ act: 'joinsend' }); await A.flush(); fbk.refuse('workspaces/CLUB/moved'); await A.flush(20);   // the old tree refuses a phone not in the club yet
    const c = valueAt(fbk, 'claims/CLUB/t1/sam');
    check('the request carries the link and the number', c && c.code + '#' + c.shirt, CODE + '#9');
    check('and the name she typed for her own child', c && c.child, 'Bea');
    check('and never an approval', !!(c && c.approved), false);
    check('she registers as a member first', paths(fbk).indexOf('workspaces/CLUB/access/members/sam') < paths(fbk).indexOf('claims/CLUB/t1/sam'), true);
    check('nothing is granted from her side', paths(fbk).some(p => /guardians|access\/index|teamParents/.test(p)), false);
    check('then she waits', /Waiting for a coach of Flight/.test(A.rendered()), true);
    check('the device is not pointed at the club yet', A.storage.getItem('sm.workspace'), null);

    fbk.deliver('claims/CLUB/t1/sam', { ...c, approved: { by: 'coach', at: 2 } }); await A.flush(20);
    check('once approved, the club goes on her list', (valueAt(fbk, 'userOrgs/sam/CLUB') || {}).name, 'Lakeside SC');
    check('her request is tidied away', fbk.record.removes.includes('claims/CLUB/t1/sam'), true);
    check('and the device opens the club', A.storage.getItem('sm.workspace'), 'CLUB');
    check('by reloading into it', A.dom.reloads, 1);
    check('the link is forgotten', A.storage.getItem('sm.join'), null);
  }
  {
    const { A, fbk } = await boot(null, { storage: { 'sm.workspace': 'OTHERCLUB' }, search: '?join=' + CODE });
    fbk.signIn('sam'); await A.flush();
    fbk.deliver('joinCodes/' + CODE, JOINDOC); await A.flush();
    fbk.deliver('claims/CLUB/t1/sam', { code: CODE, shirt: '9', at: 1, approved: { by: 'coach', at: 2 } }); await A.flush(20);
    check('a device using another club is not switched', A.storage.getItem('sm.workspace'), 'OTHERCLUB');
    check('she is told where to find it', /club switcher/.test(A.lastToast() || ''), true);
  }
  {
    const { A, fbk } = await boot(null, { storage: {}, search: '?join=' + CODE });
    fbk.signIn('sam'); await A.flush();
    fbk.deliver('joinCodes/' + CODE, null); await A.flush();
    check('a retired link says so', /no longer works/.test(A.rendered()), true);
  }
  {
    const { A, fbk } = await boot(null, { storage: {}, search: '?join=' + CODE });
    fbk.signIn('sam'); await A.flush();
    fbk.deliver('joinCodes/' + CODE, JOINDOC); await A.flush();
    fbk.deliver('claims/CLUB/t1/sam', { code: CODE, shirt: '9', at: 1 }); await A.flush();
    check('coming back to a request shows it waiting', /Waiting for a coach/.test(A.rendered()), true);
    fbk.deliver('claims/CLUB/t1/sam', null); await A.flush();
    check('a request turned down says so', /Not approved/.test(A.rendered()), true);
  }

  console.log('\n--- the coach lets her in ---');
  {
    const { A, fbk } = await boot('coach', { name: 'Jaz' });
    check('she listens for requests to her team', fbk.watching('claims/CLUB/t1'), true);
    check('not to another team\'s', fbk.watching('claims/CLUB/t2'), false);
    fbk.deliver('claims/CLUB/t1', { sam: { code: CODE, shirt: '9', child: 'Bea', name: 'Sam', email: 'sam@x.test', at: 1 } }); await A.flush();
    A.ui.teamId = 't1'; A.ui.view = 'roster'; A.render();
    const html = A.rendered();
    check('Squad shows who is asking', /Sam/.test(html) && /#9/.test(html), true);
    check('with the player that number matches picked', /data-pid="p2" aria-pressed="true"/.test(html), true);
    // (the team's set-up under the squad has pressed chips of its own: what is counted)
    check('and nobody else picked', /data-pid="[^"]*" aria-pressed="true"/.test(html.replace(/data-pid="p2" aria-pressed="true"/, '')), false);
    A.click({ act: 'claimok', tid: 't1', uid: 'sam' }); await A.flush(20);
    const p = paths(fbk);
    check('the approval is written', (valueAt(fbk, 'claims/CLUB/t1/sam/approved') || {}).by, 'coach');
    check('she becomes that player\'s parent', valueAt(fbk, 'workspaces/CLUB/teams/t1/players/p2/guardians/sam'), true);
    check('indexed with the team id the rule checks', valueAt(fbk, 'workspaces/CLUB/access/index/sam'), 't1');
    check('approval before the index write that needs it', p.indexOf('claims/CLUB/t1/sam/approved') < p.indexOf('workspaces/CLUB/access/index/sam'), true);
    check('and on the team\'s parent list', valueAt(fbk, 'workspaces/CLUB/access/teamParents/t1/sam'), 'p2');
    check('written to the audit log', p.some(x => x.startsWith('workspaces/CLUB/access/log/')), true);
    check('the request leaves the list', A.pendingClaims('t1').length, 0);
  }
  {
    const { A, fbk } = await boot('coach');
    fbk.deliver('claims/CLUB/t1', { sam: { code: CODE, shirt: '77', at: 1 } }); await A.flush();
    A.ui.teamId = 't1'; A.ui.view = 'roster'; A.render();
    check('a number nobody wears is flagged', /No player on the squad has that number/.test(A.rendered()), true);
    A.click({ act: 'claimok', tid: 't1', uid: 'sam' }); await A.flush();
    check('and nobody is let in without a child picked', fbk.record.writes.some(w => w.path.includes('/approved')), false);
    A.click({ act: 'claimno', tid: 't1', uid: 'sam' }); await A.flush();
    check('turning it down removes the request', fbk.record.removes.includes('claims/CLUB/t1/sam'), true);
  }
  {
    // a matching number on another team must not leak across
    const { A } = await boot('coach');
    check('numbers are matched on her own squad only', A.claimMatches(A.state.teams.t1, { shirt: '9' }).map(p => p.id).join(), 'p2');
    check('two children in one request', A.claimMatches(A.state.teams.t1, { shirt: '7, 9' }).map(p => p.id).sort().join(), 'p1,p2');
  }
  {
    const { A, fbk } = await boot('mum');
    A.click({ act: 'claimok', tid: 't1', uid: 'sam' }); await A.flush();
    A.click({ act: 'joinnew', tid: 't1' }); await A.flush();
    check('a parent approves nothing and makes no links', fbk.record.writes.some(w => /approved|joinCodes/.test(w.path)), false);
    check('and is not listening for requests', fbk.watching('claims/CLUB/t1'), false);
  }

  H.summary('team links and squad invites');
})();
