/* Invites: how somebody new gets into a club.

   Two devices' worth of behaviour, driven against the fake Firebase. The
   invitee's side is the one that matters most: a brand-new device with no
   workspace code and no role, which in a locked club cannot read anything,
   has to end up connected with exactly the role the invite names. The rules
   decide whether each write is allowed — test/rules.js pins those. What this
   pins is that the app asks for the right writes, in the order the rules need
   them, and that nothing about a club leaks onto the screen or into the
   invite on the way. */

const H = require('./harness');
const { check, deepEq } = H;
const { makeFakebase } = require('./fakebase');

const CONFIG = { apiKey: 'k', databaseURL: 'https://prod.example', projectId: 'p' };
const ID = 'iabc123';

async function boot(opts = {}) {
  const fbk = makeFakebase();
  const A = H.loadApp({ firebase: fbk, config: CONFIG, storage: opts.storage || {}, search: opts.search });
  await A.flush();
  return { A, fbk };
}

const inviteDoc = (A, extra = {}) => ({
  ws: 'CLUB', team: 't1', teamName: 'Flight', role: 'coach', clubName: 'Lakeside SC',
  by: 'adm', byName: 'Ada', at: A.nowMs() - 1000, expiresAt: A.nowMs() + 7 * 864e5, ...extra
});

const paths = fbk => fbk.record.writes.map(w => w.path);
const valueAt = (fbk, p) => { const w = fbk.writtenTo(p); return w.length ? w[w.length - 1].value : undefined; };

const CLUB = {
  access: {
    org: { name: 'Lakeside SC' },
    admins: { adm: true },
    index: { adm: true, coach: true },
    members: { adm: { name: 'Ada' }, coach: { name: 'Jaz' } },
    teams: { t1: { coaches: { coach: true } } }
  },
  teams: {
    t1: { id: 't1', name: 'Flight', players: { p1: { id: 'p1', name: 'Ella', number: '7', active: true } } }
  },
  matches: {}
};

(async () => {

  console.log('--- a brand-new device opens an invite link ---');
  {
    const { A, fbk } = await boot({ search: '?invite=' + ID });
    check('the invite is kept on the device', A.storage.getItem('sm.invite'), ID);
    check('and taken off the address bar', /invite=/.test(A.dom.replaced || ''), false);
    check('no workspace yet', A.wsCode(), '');
    check('nothing is read before sign-in', fbk.watching('invites/' + ID), false);
    fbk.signOut(); await A.flush();
    check('signed out, it asks for a sign-in', /Sign in to see what it is/.test(A.rendered()), true);
    check('and still has not read it', fbk.watching('invites/' + ID), false);

    fbk.signIn('sam', { name: 'Sam', email: 'sam@x.test' }); await A.flush();
    check('once signed in, the invite is read', fbk.watching('invites/' + ID), true);
    fbk.deliver('invites/' + ID, inviteDoc(A)); await A.flush();
    check('it says which club and what role', /Join Lakeside SC/.test(A.rendered()) && /coach of <b>Flight/.test(A.rendered()), true);
    check('and offers to accept', /data-act="inviteaccept"/.test(A.rendered()), true);
    check('crumbs stay empty until joined', A.rendered('#crumbs'), '');

    A.click({ act: 'inviteaccept' }); await A.flush(20);
    const p = paths(fbk);
    const at = x => p.indexOf(x);
    check('spends the invite, as Sam', JSON.stringify((valueAt(fbk, 'invites/' + ID + '/used') || {}).by), '"sam"');
    check('registers as a member', !!valueAt(fbk, 'workspaces/CLUB/access/members/sam'), true);
    check('coach on that team, carrying the invite id', valueAt(fbk, 'workspaces/CLUB/access/teams/t1/coaches/sam'), ID);
    check('indexed, carrying the invite id', valueAt(fbk, 'workspaces/CLUB/access/index/sam'), ID);
    check('mirrored into the team index', valueAt(fbk, 'workspaces/CLUB/access/teamIndex/t1/sam'), 'coach');
    check('spent before the role is written', at('invites/' + ID + '/used') < at('workspaces/CLUB/access/teams/t1/coaches/sam'), true);
    check('role before the index', at('workspaces/CLUB/access/teams/t1/coaches/sam') < at('workspaces/CLUB/access/index/sam'), true);
    check('the admin\'s list is marked used', (valueAt(fbk, 'clubInvites/CLUB/' + ID + '/used') || {}).by, 'sam');
    check('the club goes on Sam\'s own list', (valueAt(fbk, 'userOrgs/sam/CLUB') || {}).name, 'Lakeside SC');
    check('and the join is in the audit log', p.some(x => x.startsWith('workspaces/CLUB/access/log/')), true);
    check('then the spent invite is deleted', fbk.record.removes.includes('invites/' + ID), true);
    check('no admin grant was asked for', p.some(x => x.includes('/access/admins/')), false);
    check('the device now opens the club', A.storage.getItem('sm.workspace'), 'CLUB');
    check('the invite is forgotten', A.storage.getItem('sm.invite'), null);
    check('and it reloads into it', A.dom.reloads, 1);
  }

  console.log('\n--- a parent invite ---');
  {
    const { A, fbk } = await boot({ search: '?invite=' + ID });
    fbk.signIn('mum', { name: 'Mum', email: 'mum@x.test' }); await A.flush();
    fbk.deliver('invites/' + ID, inviteDoc(A, { role: 'parent', player: 'p1', playerNo: '7' })); await A.flush();
    check('it names the shirt, not the child', /parent of #7 on <b>Flight/.test(A.rendered()), true);
    A.click({ act: 'inviteaccept' }); await A.flush(20);
    check('guardian of that one player', valueAt(fbk, 'workspaces/CLUB/teams/t1/players/p1/guardians/mum'), ID);
    check('not a coach or tracker', paths(fbk).some(x => x.includes('/access/teams/')), false);
    check('and not in the team index', paths(fbk).some(x => x.includes('/teamIndex/')), false);
    check('indexed, so she can read the club', valueAt(fbk, 'workspaces/CLUB/access/index/mum'), ID);
    check('on her team\'s parent list, naming her child', valueAt(fbk, 'workspaces/CLUB/access/teamParents/t1/mum'), 'p1');
    check('written after the guardian entry the rule checks', paths(fbk).indexOf('workspaces/CLUB/teams/t1/players/p1/guardians/mum') < paths(fbk).indexOf('workspaces/CLUB/access/teamParents/t1/mum'), true);
  }

  console.log('\n--- the database says no ---');
  {
    const { A, fbk } = await boot({ search: '?invite=' + ID });
    fbk.signIn('sam'); await A.flush();
    fbk.deliver('invites/' + ID, inviteDoc(A)); await A.flush();
    fbk.refuseWrites(p => p.includes('/access/teams/'));
    A.click({ act: 'inviteaccept' }); await A.flush(20);
    check('it says so', /Could not open the invite/.test(A.rendered()) && /refused/.test(A.rendered()), true);
    check('the index is never attempted', paths(fbk).some(x => x.endsWith('/access/index/sam')), false);
    check('the device is not pointed at the club', A.storage.getItem('sm.workspace'), null);
    check('the invite is kept to try again', A.storage.getItem('sm.invite'), ID);
    check('and nothing reloads', A.dom.reloads || 0, 0);
  }

  console.log('\n--- invites that cannot be used ---');
  for (const [label, doc, re] of [
    ['withdrawn', () => null, /no longer exists/],
    ['expired', A => inviteDoc(A, { expiresAt: A.nowMs() - 1 }), /has expired/],
    ['used by somebody else', A => inviteDoc(A, { used: { by: 'rando', at: 1 } }), /already been used/],
    ['sent to another address', A => inviteDoc(A, { email: 'jo@x.test' }), /is for someone else/]
  ]) {
    const { A, fbk } = await boot({ search: '?invite=' + ID });
    fbk.signIn('sam', { email: 'sam@x.test' }); await A.flush();
    fbk.deliver('invites/' + ID, doc(A)); await A.flush();
    check(label + ': says why', re.test(A.rendered()), true);
    check(label + ': offers no accept', /data-act="inviteaccept"/.test(A.rendered()), false);
  }
  {
    const { A, fbk } = await boot({ search: '?invite=' + ID });
    fbk.signIn('sam', { email: 'Sam@X.test' }); await A.flush();
    fbk.deliver('invites/' + ID, inviteDoc(A, { email: 'sam@x.test' })); await A.flush();
    check('the right address in another case is fine', /data-act="inviteaccept"/.test(A.rendered()), true);
  }
  {
    /* Half finished on an earlier try: spent by this account, grant not
       complete. Carry on rather than call it taken. */
    const { A, fbk } = await boot({ search: '?invite=' + ID });
    fbk.signIn('sam'); await A.flush();
    fbk.deliver('invites/' + ID, inviteDoc(A, { used: { by: 'sam', at: 1 } })); await A.flush();
    check('spent by me already: can still finish', /data-act="inviteaccept"/.test(A.rendered()), true);
    A.click({ act: 'inviteaccept' }); await A.flush(20);
    check('without spending it twice', fbk.writtenTo('invites/' + ID + '/used').length, 0);
    check('and the role is written', valueAt(fbk, 'workspaces/CLUB/access/teams/t1/coaches/sam'), ID);
  }

  console.log('\n--- an invite on a device already in another club ---');
  {
    const { A, fbk } = await boot({ search: '?invite=' + ID, storage: { 'sm.workspace': 'OTHER' } });
    fbk.signIn('sam'); await A.flush();
    fbk.deliver('workspaces/OTHER', CLUB); await A.flush();
    check('the invite screen wins', /Opening your invite|Join/.test(A.rendered()), true);
    check('the open club\'s names are not drawn behind it', /Flight|Ella/.test(A.rendered('#crumbs')), false);
    check('the device stays where it was until accepted', A.storage.getItem('sm.workspace'), 'OTHER');
    A.click({ act: 'invitedismiss' });
    check('not now: the invite is dropped', A.storage.getItem('sm.invite'), null);
    check('and the club is back', /Lakeside SC/.test(A.rendered('#crumbs')), true);
  }

  console.log('\n--- switching account re-reads the invite ---');
  {
    const { A, fbk } = await boot({ search: '?invite=' + ID });
    fbk.signIn('wrong', { email: 'wrong@x.test' }); await A.flush();
    fbk.deliver('invites/' + ID, inviteDoc(A, { email: 'sam@x.test' })); await A.flush();
    check('the wrong account is told so', /is for someone else/.test(A.rendered()), true);
    fbk.signIn('sam', { email: 'sam@x.test' }); await A.flush();
    check('the right one reads it afresh', fbk.totalReads('invites/' + ID), 2);
    fbk.deliver('invites/' + ID, inviteDoc(A, { email: 'sam@x.test' })); await A.flush();
    check('and may accept it', /data-act="inviteaccept"/.test(A.rendered()), true);
  }

  console.log('\n--- an admin makes one ---');
  {
    const { A, fbk } = await boot({ storage: { 'sm.workspace': 'CLUB' } });
    fbk.signIn('adm', { name: 'Ada' }); await A.flush();
    fbk.deliver('workspaces/CLUB', CLUB); await A.flush();
    A.ui.view = 'people'; A.render();
    check('People offers invites to an admin', /data-act="invitenew"/.test(A.rendered()), true);
    check('and reads the club\'s list', fbk.watching('clubInvites/CLUB'), true);

    A.click({ act: 'invitenew' });
    A.click({ act: 'invitepick', k: 'team', v: 't1' });
    A.click({ act: 'invitepick', k: 'role', v: 'parent' });
    A.click({ act: 'invitepick', k: 'player', v: 'p1' });
    await A.makeInvite(); await A.flush();
    const w = fbk.record.writes.find(x => /^invites\/i[0-9a-f]+$/.test(x.path));
    check('the invite is written at the root', !!w, true);
    const id = w ? w.path.split('/')[1] : '';
    check('with a long random id', id.length >= 30, true);
    check('two invites never share one', A.secretId() !== A.secretId(), true);
    const doc = w ? w.value : {};
    deepEq('carrying what it grants', [doc.ws, doc.team, doc.role, doc.player, doc.by], ['CLUB', 't1', 'parent', 'p1', 'adm']);
    check('lasting two weeks', Math.round((doc.expiresAt - doc.at) / 864e5), 14);
    check('the shirt number, for the invitee to see', doc.playerNo, '7');
    check('never the child\'s name', JSON.stringify(doc).includes('Ella'), false);
    const listed = valueAt(fbk, 'clubInvites/CLUB/' + id);
    check('listed for the admin, name included', listed && listed.playerName, 'Ella');
    check('the link carries only the id', A.inviteLink(id), 'https://x.test/?invite=' + id);
    check('and is shown to copy', A.rendered('#sheet').includes(A.inviteLink(id)), true);
    check('the log says who was invited', paths(fbk).some(x => x.startsWith('workspaces/CLUB/access/log/')), true);

    A.click({ act: 'invitedrop', id });
    check('withdrawing deletes the invite', fbk.record.removes.includes('invites/' + id), true);
    check('and its entry in the list', fbk.record.removes.includes('clubInvites/CLUB/' + id), true);
  }

  console.log('\n--- an invite can be found again ---');
  {
    const { A, fbk } = await boot({ storage: { 'sm.workspace': 'CLUB' } });
    fbk.signIn('adm', { name: 'Ada' }); await A.flush();
    fbk.deliver('workspaces/CLUB', CLUB); await A.flush();
    A.ui.view = 'people'; A.render();
    const at = A.nowMs();
    fbk.deliver('clubInvites/CLUB', {
      iopen: { role: 'coach', team: 't1', teamName: 'Flight', byName: 'Ada', at, expiresAt: at + 864e5 },
      iused: { role: 'parent', team: 't1', teamName: 'Flight', playerName: 'Ella', byName: 'Ada', at: at - 10, expiresAt: at + 864e5, used: { by: 'coach', at, name: 'Jaz' } },
      iold: { role: 'tracker', team: 't1', teamName: 'Flight', byName: 'Ada', at: at - 20, expiresAt: at - 1 }
    }); await A.flush();
    const page = A.rendered();
    check('an open invite offers its link again', page.includes(A.inviteLink('iopen')), true);
    check('used and expired ones are folded away', /Show used and expired \(2\)/.test(page), true);
    A.click({ act: 'inviteopen', id: 'iopen' });
    const open = A.rendered('#sheet');
    check('its own sheet shows the link', open.includes(A.inviteLink('iopen')), true);
    check('and can revoke it', /data-act="invitedrop" data-id="iopen"/.test(open), true);
    A.click({ act: 'inviteopen', id: 'iused' });
    const used = A.rendered('#sheet');
    check('a used one names who used it', /Used by[\s\S]*Jaz/.test(used), true);
    check('says whether they still have the role', /Since removed/.test(used), true);
    check('and never offers a dead link to copy', used.includes('data-act="copylink"'), false);
    A.click({ act: 'invitedrop', id: 'iopen' });
    check('revoking deletes the invite', fbk.record.removes.includes('invites/iopen'), true);
    check('and is written to the activity log', /revoked an invite/.test(JSON.stringify(A.state.access.log || {})), true);
  }

  console.log('\n--- letting someone in from People ---');
  {
    const club = JSON.parse(JSON.stringify(CLUB));
    club.access.members.newbie = { name: 'Noor', email: 'noor@x.test' };
    for (let i = 2; i <= 12; i++) club.teams['t' + i] = { id: 't' + i, name: 'Team ' + i, players: {} };
    const { A, fbk } = await boot({ storage: { 'sm.workspace': 'CLUB' } });
    fbk.signIn('adm', { name: 'Ada' }); await A.flush();
    fbk.deliver('workspaces/CLUB', club); await A.flush();
    A.ui.view = 'people'; A.render();
    check('People says someone is waiting', /1 waiting to be let in/.test(A.rendered()), true);
    check('with a Let in button on their row', /data-act="personedit" data-uid="newbie">Let in/.test(A.rendered()), true);
    A.click({ act: 'personedit', uid: 'newbie' });
    const sheet = A.rendered('#sheet');
    check('which opens on letting them in, as a parent first', /Let them in as[\s\S]*data-v="parent" aria-pressed="true"/.test(sheet), true);
    check('twelve teams are a list, not twelve rows of chips', /<select data-pick="prpick" data-k="team"/.test(sheet), true);
    check('no per-team chip rows', (sheet.match(/data-act="setrolet"/g) || []).length, 0);
    A.change({ pick: 'prpick', k: 'team' }, 't1');
    A.click({ act: 'prpick', k: 'player', v: 'p1' });
    A.click({ act: 'praddrole', uid: 'newbie' });
    check('accepted as a parent of that player', !!A.state.teams.t1.players.p1.guardians.newbie, true);
    check('and indexed, so she can read the club', A.approved('newbie'), true);
    check('her role reads Parent', A.roleIn('t1', 'newbie'), 'parent');
    A.click({ act: 'prpick', k: 'role', v: 'coach' });
    A.click({ act: 'praddrole', uid: 'newbie' });
    check('upgraded to coach on the same team', A.isCoach('t1', 'newbie'), true);
    deepEq('and holds both, so either can be taken away', A.rolesHeld('newbie', A.teams()).map(v => v.r), ['coach', 'parent']);
    for (const tid of ['t2', 't3', 't4']) { A.change({ pick: 'prpick', k: 'team' }, tid); A.click({ act: 'praddrole', uid: 'newbie' }); }
    check('four teams read as a count, not four tags', /Coach<i>4 teams<\/i>/.test(A.roleTags('newbie', A.teams())), true);
    A.click({ act: 'prunguard', uid: 'newbie', tid: 't1', pid: 'p1' });
    check('the parent link can be removed there too', A.isGuardian('t1', 'newbie'), false);
  }
  {
    const club = JSON.parse(JSON.stringify(CLUB));
    club.access.members.newbie = { name: 'Noor' };
    club.teams.t2 = { id: 't2', name: 'Other', players: { p2: { id: 'p2', name: 'Zoe', active: true } } };
    const { A, fbk } = await boot({ storage: { 'sm.workspace': 'CLUB' } });
    fbk.signIn('coach', { name: 'Jaz' }); await A.flush();
    fbk.deliver('workspaces/CLUB', club); await A.flush();
    A.ui.pr = { uid: 'newbie', role: 'coach', team: 't2', player: null };
    A.click({ act: 'praddrole', uid: 'newbie' });
    check('a coach cannot hand out roles on another team', A.isCoach('t2', 'newbie'), false);
    A.click({ act: 'setrolet', uid: 'newbie', tid: 't2', r: 'tracker' });
    check('not by the old button either', A.isTracker('t2', 'newbie'), false);
    A.ui.pr = { uid: 'newbie', role: 'tracker', team: 't1', player: null };
    A.click({ act: 'praddrole', uid: 'newbie' });
    check('but can on her own', A.isTracker('t1', 'newbie'), true);
  }

  console.log('\n--- only an admin ---');
  {
    const { A, fbk } = await boot({ storage: { 'sm.workspace': 'CLUB' } });
    fbk.signIn('coach', { name: 'Jaz' }); await A.flush();
    fbk.deliver('workspaces/CLUB', CLUB); await A.flush();
    A.ui.view = 'people'; A.render();
    check('a coach is not offered it', /data-act="invitenew"/.test(A.rendered()), false);
    check('nor reads the list', fbk.watching('clubInvites/CLUB'), false);
    A.ui.inv = { role: 'coach', team: 't1' };
    await A.makeInvite(); await A.flush();
    check('and making one anyway is refused', A.lastToast(), 'Club admins only');
    check('with nothing written', fbk.record.writes.some(x => x.path.startsWith('invites/')), false);
  }

  console.log('\n--- withdrawing a role that came from an invite ---');
  {
    const club = JSON.parse(JSON.stringify(CLUB));
    club.access.teams.t1.coaches.sam = ID;
    club.access.index.sam = ID;
    club.access.members.sam = { name: 'Sam' };
    const { A, fbk } = await boot({ storage: { 'sm.workspace': 'CLUB' } });
    fbk.signIn('adm'); await A.flush();
    fbk.deliver('workspaces/CLUB', club); await A.flush();
    check('Sam reads as a coach', A.isCoach('t1', 'sam'), true);
    A.click({ act: 'setrolet', uid: 'sam', tid: 't1', r: 'coach' });
    check('the role goes', A.isCoach('t1', 'sam'), false);
    check('and the invite it came from, so it cannot be replayed', fbk.record.removes.includes('invites/' + ID), true);
    check('Sam leaves the index', fbk.record.removes.includes('workspaces/CLUB/access/index/sam'), true);
    check('and loses the bookmark to this club', fbk.record.removes.includes('userOrgs/sam/CLUB'), true);
  }
  {
    /* Still holding another role, so the index stays. The invite has to go
       because of the role that came from it, not as a side effect of the
       index being emptied. */
    const club = JSON.parse(JSON.stringify(CLUB));
    club.access.teams.t1.coaches.sam = ID;
    club.access.teams.t1.trackers = { sam: true };
    club.access.index.sam = true;
    club.access.members.sam = { name: 'Sam' };
    const { A, fbk } = await boot({ storage: { 'sm.workspace': 'CLUB' } });
    fbk.signIn('adm'); await A.flush();
    fbk.deliver('workspaces/CLUB', club); await A.flush();
    A.click({ act: 'setrolet', uid: 'sam', tid: 't1', r: 'coach' });
    check('still a tracker, so still indexed', fbk.record.removes.includes('workspaces/CLUB/access/index/sam'), false);
    check('but the coach invite is deleted all the same', fbk.record.removes.includes('invites/' + ID), true);
    A.click({ act: 'setrolet', uid: 'sam', tid: 't1', r: 'tracker' });
    check('a role an admin granted by hand names no invite', fbk.record.removes.filter(x => x.startsWith('invites/')).length, 1);
  }

  console.log('\n--- a second device finds the club without an invite ---');
  {
    const { A, fbk } = await boot();
    fbk.signIn('sam'); await A.flush();
    check('with no code, it asks which clubs this account is in', fbk.watching('userOrgs/sam'), true);
    fbk.deliver('userOrgs/sam', { CLUB: { name: 'Lakeside SC', at: 1 } }); await A.flush();
    check('exactly one: it opens it', A.storage.getItem('sm.workspace'), 'CLUB');
    check('by reloading into it', A.dom.reloads, 1);
  }
  {
    const { A, fbk } = await boot({ storage: { 'sm.data.v1:local': JSON.stringify({ teams: { x: { id: 'x', name: 'Mine' } }, matches: {}, access: {} }) } });
    fbk.signIn('sam'); await A.flush();
    fbk.deliver('userOrgs/sam', { CLUB: { name: 'Lakeside SC', at: 1 } }); await A.flush();
    check('not over a squad this device keeps on its own', A.storage.getItem('sm.workspace'), null);
    check('the club is offered instead', A.knownClubs().some(c => c.code === 'CLUB' && c.name === 'Lakeside SC'), true);
  }
  {
    const { A, fbk } = await boot({ storage: { 'sm.workspace': 'CLUB' } });
    fbk.signIn('coach'); await A.flush();
    fbk.deliver('userOrgs/coach', {}); await A.flush();
    fbk.deliver('workspaces/CLUB', CLUB); await A.flush();
    check('a member who predates it gets the bookmark', (valueAt(fbk, 'userOrgs/coach/CLUB') || {}).name, 'Lakeside SC');
  }
  {
    const { A, fbk } = await boot({ storage: { 'sm.workspace': 'CLUB' } });
    fbk.signIn('rando'); await A.flush();
    fbk.deliver('userOrgs/rando', {}); await A.flush();
    fbk.deliver('workspaces/CLUB', CLUB); await A.flush();
    check('an account with no role does not', fbk.writtenTo('userOrgs/rando/CLUB').length, 0);
  }

  console.log('\n--- starting a new club from inside one ---');
  {
    const { A, fbk } = await boot({ storage: { 'sm.workspace': 'CLUB' } });
    fbk.signIn('coach', { name: 'Jaz', email: 'jaz@x.test' }); await A.flush();
    fbk.deliver('.info/connected', true);
    fbk.deliver('workspaces/CLUB', CLUB); await A.flush();
    A.click({ act: 'clubswitch' });
    check('the club switcher offers a new club', /data-act="newclub"/.test(A.rendered('#sheet')), true);
    A.click({ act: 'newclub' });
    A.dom.node('#newClubName').value = '';
    A.click({ act: 'newclubgo' });
    check('a club needs a name', fbk.record.writes.filter(w => /^workspaces\/sm-/.test(w.path)).length, 0);
    A.dom.node('#newClubName').value = '  Hillside FC ';
    A.click({ act: 'newclubgo' }); await A.flush(20);
    const ws = fbk.record.writes.filter(w => /^workspaces\/sm-/.test(w.path));
    const code = ws.length ? ws[0].path.split('/')[1] : '';
    const p = paths(fbk), at = x => p.indexOf('workspaces/' + code + '/' + x);
    check('at a new code, not this club\'s', !!code && code !== 'CLUB', true);
    check('admin first, as the rules need', ws[0] && ws[0].path, 'workspaces/' + code + '/access/admins/coach');
    check('then the index', at('access/index/coach') > at('access/admins/coach'), true);
    check('she is a member', (valueAt(fbk, 'workspaces/' + code + '/access/members/coach') || {}).name, 'Jaz');
    check('and the club has its name, trimmed', valueAt(fbk, 'workspaces/' + code + '/access/org/name'), 'Hillside FC');
    check('nothing of the old club goes with it', ws.some(w => /\/teams|\/matches/.test(w.path)), false);
    check('the old club is not written to', fbk.record.writes.some(w => w.path.startsWith('workspaces/CLUB/access/admins')), false);
    check('it goes on her list of clubs', (valueAt(fbk, 'userOrgs/coach/' + code) || {}).name, 'Hillside FC');
    check('and the phone opens it', A.storage.getItem('sm.workspace'), code);
    check('by reloading into it', A.dom.reloads, 1);
  }
  {
    /* A reload is not instant: the old page keeps running, and redrawing, until
       the new one arrives. In that gap storage already names the new club while
       memory still holds the old one, so anything kept per club was filed under
       the new club's name, and the new club opened to "Deleted:" for every game
       and practice the old one had. */
    const club = JSON.parse(JSON.stringify(CLUB));
    club.teams.t1.events = { e1: { id: 'e1', kind: 'practice', title: 'Practice', date: '2031-05-01', start: '18:00' } };
    club.matches = { g1: { id: 'g1', teamId: 't1', opponent: 'Storm', date: '2031-05-03', kickoff: '10:00' } };
    const { A, fbk } = await boot({ storage: { 'sm.workspace': 'CLUB' } });
    fbk.signIn('adm', { name: 'Ada' }); await A.flush();
    fbk.deliver('.info/connected', true);
    fbk.deliver('workspaces/CLUB', club); await A.flush();
    A.render(); A.render();
    A.click({ act: 'newclub' });
    A.dom.node('#newClubName').value = 'Hillside FC';
    A.click({ act: 'newclubgo' }); await A.flush(20);
    const code = A.storage.getItem('sm.workspace');
    check('the new club is opened', code !== 'CLUB' && /^sm-/.test(code), true);
    const under = () => Object.keys(A.storage._d).filter(k => k.includes(code)).join(' ');
    A.render();                                            // the old page, still drawing before the reload lands
    check('what club activity saw is not filed under the new club', under(), '');
    A.saveLocal();
    check('nor the old club\'s copy', under(), '');
    check('the old club\'s copy stays its own', JSON.parse(A.storage.getItem('sm.data.v1:CLUB')).teams.t1.name, 'Flight');
    const fb2 = makeFakebase();
    const B = H.loadApp({ firebase: fb2, config: CONFIG, storage: A.storage._d });
    await B.flush();
    fb2.signIn('adm', { name: 'Ada' }); await B.flush();
    fb2.deliver('.info/connected', true);
    fb2.deliver('workspaces/' + code, { access: { org: { name: 'Hillside FC' }, admins: { adm: true }, index: { adm: true }, members: { adm: { name: 'Ada' } } } }); await B.flush();
    B.render();
    check('the new club opens empty', Object.keys(B.state.teams || {}).join(), '');
    check('nor sent to it', fb2.record.writes.filter(w => /\/(teams|matches)\//.test(w.path)).map(w => w.path).join(' '), '');
    check('and with no news of anything deleted', B.newsItems().map(x => x.title).join(' | '), '');
  }
  {
    const { A, fbk } = await boot({ storage: { 'sm.workspace': 'CLUB' } });
    fbk.signIn('coach'); await A.flush();
    fbk.deliver('.info/connected', true);
    fbk.deliver('workspaces/CLUB', CLUB); await A.flush();
    fbk.refuseWrites(p => /^workspaces\/sm-/.test(p));
    A.click({ act: 'newclub' });
    A.dom.node('#newClubName').value = 'Hillside FC';
    A.click({ act: 'newclubgo' }); await A.flush(20);
    check('refused: the phone stays in its club', A.storage.getItem('sm.workspace'), 'CLUB');
    check('and is not bookmarked', fbk.record.writes.some(w => w.path.startsWith('userOrgs/coach/sm-')), false);
  }
  {
    const { A, fbk } = await boot({ storage: { 'sm.workspace': 'CLUB' } });
    fbk.signIn('coach'); await A.flush();
    fbk.deliver('.info/connected', false);
    fbk.deliver('workspaces/CLUB', CLUB); await A.flush();
    A.click({ act: 'newclub' });
    A.dom.node('#newClubName').value = 'Hillside FC';
    A.click({ act: 'newclubgo' }); await A.flush(20);
    check('with no signal nothing is half-made', fbk.record.writes.some(w => /^workspaces\/sm-/.test(w.path)), false);
  }
  {
    const { A, fbk } = await boot({ storage: { 'sm.workspace': 'CLUB' } });
    fbk.signOut(); await A.flush();
    A.click({ act: 'newclubgo' }); await A.flush(5);
    check('signed out, the handler refuses', fbk.record.writes.some(w => /^workspaces\/sm-/.test(w.path)), false);
  }

  console.log('\n--- inviting the people an imported roster names ---');
  {
    const club = JSON.parse(JSON.stringify(CLUB));
    club.access.members.coach.email = 'jaz@x.test';
    club.access.members.mum = { name: 'Mum', email: 'mum@x.test' };
    club.teams.t1.players.p1.name = 'Ella Moss';
    club.teams.t1.players.p1.guardians = { mum: true };
    const { A, fbk } = await boot({ storage: { 'sm.workspace': 'CLUB' } });
    fbk.signIn('adm', { name: 'Ada' }); await A.flush();
    fbk.deliver('workspaces/CLUB', club); await A.flush();
    const tsv = [
      ['team', 'player_first_name', 'player_last_name', 'player_number', 'coach_email', 'parent1_email', 'parent2_email', 'parent1_mobile_number'],
      ['Flight', 'Ella', 'Moss', '7', 'jaz@x.test', 'MUM@x.test', 'dad@x.test', '555-0101'],
      ['Flight', 'Bea', 'Smith', '9', 'new.coach@x.test', 'bea.mum@x.test', 'not an email', '555-0102']
    ].map(r => r.join('\t')).join('\n');
    A.click({ act: 'bulkimport' });
    A.dom.node('#impText').value = tsv;
    A.click({ act: 'importcheck' });
    check('the check says the emails are there, and nothing is sent yet', /3 parent emails and 2 coach emails in it[\s\S]*no email is kept or sent/.test(A.rendered('#sheet')), true);
    A.click({ act: 'importgo' }); await A.flush();
    check('no email is in the club after importing', /@x\.test/.test(JSON.stringify(A.state.teams)), false);
    check('no invite made before asked', fbk.record.writes.some(w => w.path.startsWith('invites/')), false);
    const sheet = A.rendered('#sheet');
    check('it offers the invites', /Invite them too\?/.test(sheet), true);
    const st = Object.fromEntries(A.importInviteRows().map(r => [r.role + ':' + r.email, r.st]));
    deepEq('who gets one and who is skipped', st, {
      'coach:jaz@x.test': 'has', 'parent:mum@x.test': 'has', 'parent:dad@x.test': 'todo',
      'coach:new.coach@x.test': 'todo', 'parent:bea.mum@x.test': 'todo'
    });
    check('offers exactly those three', /Make 3 invites/.test(sheet), true);
    A.click({ act: 'importinvitego' }); await A.flush(20);
    const made = fbk.record.writes.filter(w => /^invites\/[^/]+$/.test(w.path)).map(w => w.value);
    deepEq('one each, bound to its email', made.map(v => v.role + ':' + v.email).sort(), ['coach:new.coach@x.test', 'parent:bea.mum@x.test', 'parent:dad@x.test']);
    const bea = Object.values(A.state.teams.t1.players).find(p => p.name === 'Bea Smith');
    check('a parent\'s is for her own child, by id', made.find(v => v.email === 'bea.mum@x.test').player, bea.id);
    check('and names no child', made.some(v => /Ella|Bea|Moss|Smith/.test(JSON.stringify(v))), false);
    check('none sent until asked', fbk.record.mails.length, 0);
    const before = fbk.record.writes.length;
    A.click({ act: 'importinvitego' }); await A.flush(20);
    check('asking again makes nothing new', fbk.record.writes.slice(before).some(w => w.path.startsWith('invites/')), false);
    A.click({ act: 'importinvitemail' }); await A.flush(20);
    deepEq('the emails go to those three, each with its own link', fbk.record.mails.map(m => m.email + ' ' + (m.url || '').includes('invite=')).sort(),
      ['bea.mum@x.test true', 'dad@x.test true', 'new.coach@x.test true']);
    A.click({ act: 'importinvitemail' }); await A.flush(20);
    check('and are not sent twice', fbk.record.mails.length, 3);
    A.click({ act: 'importinviteskip' });
    check('closing forgets the emails', A.importContacts, null);
  }
  {
    const { A, fbk } = await boot({ storage: { 'sm.workspace': 'CLUB' } });
    fbk.signIn('coach', { name: 'Jaz' }); await A.flush();
    fbk.deliver('workspaces/CLUB', JSON.parse(JSON.stringify(CLUB))); await A.flush();
    A.click({ act: 'importinvitego' }); await A.flush(20);
    check('nobody else gets the invites made', fbk.record.writes.some(w => w.path.startsWith('invites/')), false);
  }

  H.summary('invites');
})();
