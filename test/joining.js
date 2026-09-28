/* Joining with a team code, and creating a club: AUTH.md's two doors for
   somebody who belongs to nothing.

   Driven against the fake Firebase, both sides. The parent's device has no
   workspace code and cannot read the club, so everything it learns comes
   from joinCodes/ and its own request. The coach's side is where the grant
   happens, and test/rules.js pins what the database allows there; what this
   pins is that the app asks for exactly those writes, in the order the rules
   need them — guardian, then index, then the request goes — and that nobody
   is shown a child's name before being let in. */

const H = require('./harness');
const { check, deepEq } = H;
const { makeFakebase } = require('./fakebase');

const CONFIG = { apiKey: 'k', databaseURL: 'https://prod.example', projectId: 'p' };
const KEY = 'FLIGHT7K2M9P';

async function boot(opts = {}) {
  const fbk = makeFakebase();
  const A = H.loadApp({ firebase: fbk, config: CONFIG, storage: opts.storage || {}, search: opts.search });
  await A.flush();
  return { A, fbk };
}
const paths = fbk => fbk.record.writes.map(w => w.path);
const valueAt = (fbk, p) => { const w = fbk.writtenTo(p); return w.length ? w[w.length - 1].value : undefined; };
const codeDoc = { ws: 'CLUB', team: 't1', teamName: 'Flight', clubName: 'Lakeside SC', by: 'coach', byName: 'Jaz', at: 1 };

const CLUB = {
  access: {
    org: { name: 'Lakeside SC' },
    admins: { adm: true },
    index: { adm: true, coach: true },
    members: { adm: { name: 'Ada' }, coach: { name: 'Jaz' } },
    teams: { t1: { coaches: { coach: true } }, t2: { coaches: { other: true } } },
    teamIndex: { t1: { coach: 'coach' }, t2: { other: 'coach' } }
  },
  teams: {
    t1: {
      id: 't1', name: 'Flight', joinCode: KEY, players: {
        p1: { id: 'p1', name: 'Ella', number: '7', active: true },
        p2: { id: 'p2', name: 'Maya', number: '9', active: true },
        p3: { id: 'p3', name: 'Rosa', number: '9', active: true }
      }
    },
    t2: { id: 't2', name: 'Storm', players: { q1: { id: 'q1', name: 'Zoe', number: '7', active: true } } }
  },
  matches: {}
};
const club = () => JSON.parse(JSON.stringify(CLUB));

(async () => {

  console.log('--- the code itself ---');
  {
    const { A } = await boot();
    check('capitals, spaces and the dash do not matter', A.joinKey(' flight-7k2m 9p '), KEY);
    check('it is read out with a dash', A.joinShow(KEY), 'FLIGHT-7K2M9P');
    const k = A.newJoinKey({ name: 'Under 10s Girls' });
    check('a new one starts with the team\'s name', k.startsWith('UNDER10S'), true);
    check('then six characters', k.length, 14);
    check('none of them easily misread', /[01OI]/.test(k.slice(-6)), false);
    check('two are never the same', A.newJoinKey({ name: 'x' }) !== A.newJoinKey({ name: 'x' }), true);
    check('a team with no usable name still gets one', /^TEAM[A-Z2-9]{6}$/.test(A.newJoinKey({ name: '!!' })), true);
  }

  console.log('\n--- a parent opens the team link on a brand-new phone ---');
  {
    const { A, fbk } = await boot({ search: '?join=flight-7k2m9p' });
    check('the code is kept on the device', JSON.parse(A.storage.getItem('sm.join')).code, KEY);
    check('and taken off the address bar', /join=/.test(A.dom.replaced || ''), false);
    fbk.signOut(); await A.flush();
    check('signed out, it asks for a sign-in', /Sign in first/.test(A.rendered()), true);
    check('and has read nothing', fbk.watching('joinCodes/' + KEY), false);
    fbk.signIn('mum', { name: 'Mum', email: 'mum@x.test' }); await A.flush();
    check('signed in, the code is looked up', fbk.watching('joinCodes/' + KEY), true);
    fbk.deliver('joinCodes/' + KEY, codeDoc); await A.flush();
    const page = A.rendered();
    check('it names the team and the club', /Join <b>Flight<\/b> at Lakeside SC/.test(page), true);
    check('and asks for a shirt number', /id="joinShirt"/.test(page), true);
    check('no child\'s name anywhere', /Ella|Maya|Rosa/.test(page), false);
    check('crumbs stay empty', A.rendered('#crumbs'), '');
    check('nothing about the club is read', fbk.readPaths().some(p => p.startsWith('workspaces/')), false);

    A.dom.node('#joinShirt').value = 'seven';
    await A.sendClaim(); await A.flush();
    check('a number, not a word', /digits only/.test(A.lastToast()), true);
    check('with nothing written', fbk.record.writes.length, 0);

    A.dom.node('#joinShirt').value = '#7';
    A.click({ act: 'joinsend' }); await A.flush();
    const req = valueAt(fbk, 'claims/CLUB/t1/mum/7');
    check('the request is written under her own uid', !!req, true);
    deepEq('carrying the code, her name and email', [req.code, req.name, req.email], [KEY, 'Mum', 'mum@x.test']);
    check('and nothing else anywhere', paths(fbk).length, 1);
    check('she is told she is waiting', /Waiting for the coach/.test(A.rendered()) && /#7/.test(A.rendered()), true);
    check('she watches her own request', fbk.watching('claims/CLUB/t1/mum'), true);
    check('which survives closing the page', JSON.parse(A.storage.getItem('sm.join')).shirts.join(), '7');

    fbk.deliver('claims/CLUB/t1/mum', { 7: req }); await A.flush();
    check('still waiting while it is there', /Waiting for the coach/.test(A.rendered()), true);
    fbk.deliver('claims/CLUB/t1/mum', null); await A.flush();
    check('once it goes, she asks whether she is in', fbk.watching('workspaces/CLUB/access/index/mum'), true);
    fbk.deliver('workspaces/CLUB/access/index/mum', 't1'); await A.flush();
    check('she is: the phone opens the club', A.storage.getItem('sm.workspace'), 'CLUB');
    check('the club goes on her own list', (valueAt(fbk, 'userOrgs/mum/CLUB') || {}).name, 'Lakeside SC');
    check('the request is forgotten on the phone', A.storage.getItem('sm.join'), null);
    check('and it reloads into it', A.dom.reloads, 1);
  }

  console.log('\n--- coming back to a request already sent ---');
  {
    const held = JSON.stringify({ code: KEY, ws: 'CLUB', team: 't1', teamName: 'Flight', clubName: 'Lakeside SC', shirts: ['7'] });
    const { A, fbk } = await boot({ storage: { 'sm.join': held } });
    fbk.signIn('mum'); await A.flush();
    check('it does not ask again', /Waiting for the coach/.test(A.rendered()), true);
    check('nor look the code up again', fbk.watching('joinCodes/' + KEY), false);
    check('it watches the request', fbk.watching('claims/CLUB/t1/mum'), true);
    fbk.deliver('claims/CLUB/t1/mum', { 7: { code: KEY, at: 1, rejected: true } }); await A.flush();
    check('turned down: she is told, with the number', /did not approve/.test(A.rendered()) && /#7/.test(A.rendered()), true);
    A.click({ act: 'joinmore' }); await A.flush();
    check('trying again clears the refused one first', fbk.record.removes.includes('claims/CLUB/t1/mum/7'), true);
    check('and asks for a number', /id="joinShirt"/.test(A.rendered()), true);
  }
  {
    const held = JSON.stringify({ code: KEY, ws: 'CLUB', team: 't1', teamName: 'Flight', clubName: 'Lakeside SC', shirts: ['7'] });
    const { A, fbk } = await boot({ storage: { 'sm.join': held } });
    fbk.signIn('mum'); await A.flush();
    fbk.deliver('claims/CLUB/t1/mum', null); await A.flush();
    fbk.refuse('workspaces/CLUB/access/index/mum'); await A.flush();
    check('gone and not let in: she is told', /no longer there/.test(A.rendered()), true);
    check('and the phone stays where it was', A.storage.getItem('sm.workspace'), null);
  }
  {
    const held = JSON.stringify({ code: KEY, ws: 'CLUB', team: 't1', teamName: 'Flight', clubName: 'Lakeside SC', shirts: ['7'] });
    const { A, fbk } = await boot({ storage: { 'sm.join': held } });
    fbk.signIn('mum'); await A.flush();
    A.click({ act: 'joinwithdraw' });
    check('withdrawing deletes her request', fbk.record.removes.includes('claims/CLUB/t1/mum/7'), true);
    check('and forgets it here', A.storage.getItem('sm.join'), null);
  }

  console.log('\n--- codes that do not work ---');
  {
    const { A, fbk } = await boot({ search: '?join=' + KEY });
    fbk.signIn('mum'); await A.flush();
    fbk.deliver('joinCodes/' + KEY, null); await A.flush();
    check('a changed or made-up code says so', /does not work/.test(A.rendered()), true);
    check('and offers another go', /data-act="joinstart"/.test(A.rendered()), true);
  }
  {
    const { A, fbk } = await boot({ search: '?join=' + KEY });
    fbk.signIn('mum'); await A.flush();
    fbk.deliver('joinCodes/' + KEY, codeDoc); await A.flush();
    fbk.refuseWrites(p => p.startsWith('claims/'));
    A.dom.node('#joinShirt').value = '7';
    await A.sendClaim(); await A.flush();
    check('a refused request says so', /refused/.test(A.rendered()), true);
    check('and is not remembered as sent', (JSON.parse(A.storage.getItem('sm.join')).shirts || []).length, 0);
  }
  {
    // typed in, from the "Have a team code?" door
    const { A, fbk } = await boot();
    fbk.signIn('mum'); await A.flush();
    fbk.deliver('userOrgs/mum', {}); await A.flush();
    check('a phone in no club offers the code door', /data-act="joinstart"/.test(A.rendered()), true);
    A.click({ act: 'joinstart' });
    A.dom.node('#joinCode').value = 'abc';
    A.click({ act: 'joingo' });
    check('too short is refused before any read', fbk.watching('joinCodes/ABC'), false);
    A.dom.node('#joinCode').value = 'Flight 7k2m9p';
    A.click({ act: 'joingo' }); await A.flush();
    check('typed loosely, it is looked up exactly', fbk.watching('joinCodes/' + KEY), true);
  }
  {
    // a pending request is not swallowed by opening the one club I am in
    const held = JSON.stringify({ code: KEY, ws: 'CLUB', team: 't1', shirts: ['7'] });
    const { A, fbk } = await boot({ storage: { 'sm.join': held } });
    fbk.signIn('mum'); await A.flush();
    fbk.deliver('userOrgs/mum', { OTHER: { name: 'Riverside' } }); await A.flush();
    check('a waiting request is not interrupted by my other club', A.storage.getItem('sm.workspace'), null);
  }

  console.log('\n--- the coach makes a code ---');
  {
    const c = club(); delete c.teams.t1.joinCode;
    const { A, fbk } = await boot({ storage: { 'sm.workspace': 'CLUB' } });
    fbk.signIn('coach', { name: 'Jaz' }); await A.flush();
    fbk.deliver('workspaces/CLUB', c); await A.flush();
    A.ui.teamId = 't1'; A.ui.view = 'teamset'; A.render();
    check('her team\'s settings offer one', /data-act="joinmake"/.test(A.rendered()), true);
    await A.makeJoinCode('t1'); await A.flush();
    const w = fbk.record.writes.find(x => x.path.startsWith('joinCodes/'));
    check('written at the root', !!w, true);
    const k = w ? w.path.split('/')[1] : '';
    deepEq('pointing at the club and the team', [w.value.ws, w.value.team, w.value.by], ['CLUB', 't1', 'coach']);
    check('with their names for the parent\'s screen', [w.value.teamName, w.value.clubName].join(), 'Flight,Lakeside SC');
    check('never a child\'s', /Ella|Maya|Rosa/.test(JSON.stringify(w.value)), false);
    check('then onto the team', valueAt(fbk, 'workspaces/CLUB/teams/t1/joinCode'), k);
    check('in that order', paths(fbk).indexOf(w.path) < paths(fbk).indexOf('workspaces/CLUB/teams/t1/joinCode'), true);
    A.render();
    check('shown to read out', A.rendered().includes(A.joinShow(k)), true);
    check('with a link to copy', A.rendered().includes(A.joinLink(k)), true);

    A.click({ act: 'joinrotate', tid: 't1' }); await A.flush();
    const k2 = A.state.teams.t1.joinCode;
    check('a new code replaces it', k2 !== k && !!k2, true);
    check('the old one is retired', fbk.record.removes.includes('joinCodes/' + k), true);
    check('only after the new one exists', paths(fbk).includes('joinCodes/' + k2), true);
    A.click({ act: 'joinoff', tid: 't1' }); await A.flush();
    check('turned off, it is deleted', fbk.record.removes.includes('joinCodes/' + k2), true);
    check('and gone from the team', A.state.teams.t1.joinCode, undefined);
  }
  {
    const { A, fbk } = await boot({ storage: { 'sm.workspace': 'CLUB' } });
    fbk.signIn('other'); await A.flush();
    fbk.deliver('workspaces/CLUB', club()); await A.flush();
    await A.makeJoinCode('t1'); await A.flush();
    check('another team\'s coach cannot make one', fbk.record.writes.some(x => x.path.startsWith('joinCodes/')), false);
    check('nor is offered one', A.joinCard(A.state.teams.t1), '');
  }

  console.log('\n--- the coach lets a parent in ---');
  {
    const { A, fbk } = await boot({ storage: { 'sm.workspace': 'CLUB' } });
    fbk.signIn('coach', { name: 'Jaz' }); await A.flush();
    fbk.deliver('workspaces/CLUB', club()); await A.flush();
    A.ui.teamId = 't1'; A.render();
    check('she watches her team\'s requests', fbk.watching('claims/CLUB/t1'), true);
    check('and not another team\'s', fbk.watching('claims/CLUB/t2'), false);
    fbk.deliver('claims/CLUB/t1', {
      mum: { 7: { code: KEY, name: 'Mum', email: 'mum@x.test', at: 1 } },
      dad: { 9: { code: KEY, name: 'Dad', email: 'dad@x.test', at: 2 } },
      gran: { 44: { code: KEY, name: 'Gran', email: 'gran@x.test', at: 3 } }
    }); await A.flush();
    check('her games list says people are waiting', /3 asking to join Flight/.test(A.rendered()), true);
    A.ui.view = 'teamset'; A.render();
    const page = A.rendered();
    check('one match: one tap, naming the child', /Let in as parent of #7 Ella/.test(page), true);
    check('two wear #9: she picks, nothing is guessed', /2 players wear #9/.test(page) && !/Let in as parent of #9/.test(page), true);
    check('nobody wears #44: she is told', /Nobody wears #44/.test(page), true);

    A.click({ act: 'claimok', tid: 't1', uid: 'mum', n: '7', pid: 'p1' }); await A.flush();
    const p = paths(fbk);
    const G = 'workspaces/CLUB/teams/t1/players/p1/guardians/mum', I = 'workspaces/CLUB/access/index/mum';
    check('guardian of that child', valueAt(fbk, G), true);
    check('indexed with the team\'s id, which the rule checks', valueAt(fbk, I), 't1');
    check('registered as a member, from her request', (valueAt(fbk, 'workspaces/CLUB/access/members/mum') || {}).email, 'mum@x.test');
    check('guardian before index', p.indexOf(G) < p.indexOf(I), true);
    check('and the request goes last', fbk.opAt('remove claims/CLUB/t1/mum/7') > fbk.opAt('set ' + I) && fbk.opAt('set ' + I) > -1, true);
    check('it is in the activity log', /let in by team code/.test(JSON.stringify(A.state.access.log || {})), true);
    check('no role beyond parent is written', p.some(x => x.includes('/access/teams/') || x.includes('/teamIndex/')), false);

    A.click({ act: 'claimpick', k: 'dad|9', v: 'p3' }); await A.flush();
    check('picked, the button names her choice', /Let in as parent of #9 Rosa/.test(A.rendered()), true);
    A.click({ act: 'claimok', tid: 't1', uid: 'dad', n: '9', pid: 'p3' }); await A.flush();
    check('and links that child, not the other #9', [!!A.state.teams.t1.players.p3.guardians.dad, !!(A.state.teams.t1.players.p2.guardians || {}).dad].join(), 'true,false');

    A.click({ act: 'claimno', tid: 't1', uid: 'gran', n: '44' }); await A.flush();
    check('turned down, the request says so', (valueAt(fbk, 'claims/CLUB/t1/gran/44') || {}).rejected, true);
    check('and she is not let in', fbk.writtenTo('workspaces/CLUB/access/index/gran').length, 0);
    A.click({ act: 'claimclear', tid: 't1', uid: 'gran', n: '44' }); await A.flush();
    check('cleared, it is deleted', fbk.record.removes.includes('claims/CLUB/t1/gran/44'), true);
  }
  {
    // an admin lets in the same way, and writes a plain true
    const { A, fbk } = await boot({ storage: { 'sm.workspace': 'CLUB' } });
    fbk.signIn('adm'); await A.flush();
    fbk.deliver('workspaces/CLUB', club()); await A.flush();
    A.render();
    check('an admin watches every team\'s requests', fbk.watching('claims/CLUB/t1') && fbk.watching('claims/CLUB/t2'), true);
    fbk.deliver('claims/CLUB/t2', { mum: { 7: { code: 'X', name: 'Mum', at: 1 } } }); await A.flush();
    A.click({ act: 'claimok', tid: 't2', uid: 'mum', n: '7', pid: 'q1' }); await A.flush();
    check('an admin indexes with true', valueAt(fbk, 'workspaces/CLUB/access/index/mum'), true);
  }
  {
    // someone already in the club only gains the link: the index is left alone
    const c = club(); c.access.index.mum = 'iold';
    const { A, fbk } = await boot({ storage: { 'sm.workspace': 'CLUB' } });
    fbk.signIn('coach'); await A.flush();
    fbk.deliver('workspaces/CLUB', c); await A.flush();
    A.render();
    fbk.deliver('claims/CLUB/t1', { mum: { 7: { code: KEY, name: 'Mum', at: 1 } } }); await A.flush();
    A.click({ act: 'claimok', tid: 't1', uid: 'mum', n: '7', pid: 'p1' }); await A.flush();
    check('already indexed: the entry is not rewritten', fbk.writtenTo('workspaces/CLUB/access/index/mum').length, 0);
  }
  {
    // another team's coach, and a forged click
    const { A, fbk } = await boot({ storage: { 'sm.workspace': 'CLUB' } });
    fbk.signIn('other'); await A.flush();
    fbk.deliver('workspaces/CLUB', club()); await A.flush();
    A.claimsIn.t1 = { mum: { 7: { code: KEY, name: 'Mum', at: 1 } } };
    A.click({ act: 'claimok', tid: 't1', uid: 'mum', n: '7', pid: 'p1' }); await A.flush();
    check('another team\'s coach cannot let anyone in', fbk.record.writes.some(x => x.path.includes('guardians')), false);
  }

  console.log('\n--- letting in by hand now matches the rules ---');
  {
    // Noor knocked without a code; the coach used to "let her in" and be refused silently
    const c = club(); c.access.members.noor = { name: 'Noor' };
    const { A, fbk } = await boot({ storage: { 'sm.workspace': 'CLUB' } });
    fbk.signIn('coach'); await A.flush();
    fbk.deliver('workspaces/CLUB', c); await A.flush();
    A.ui.teamId = 't1';
    A.click({ act: 'editplayer', pid: 'p1' });
    A.click({ act: 'toggleguard', pid: 'p1', uid: 'noor' });
    check('a coach linking a stranger is stopped', !!(A.state.teams.t1.players.p1.guardians || {}).noor, false);
    check('and told why', /team code or an invite/.test(A.lastToast()), true);
    A.render(); A.ui.view = 'people'; A.render();
    check('strangers are not on her People list', /Noor/.test(A.rendered()), false);
  }

  console.log('\n--- creating a club ---');
  {
    const { A, fbk } = await boot();
    fbk.signIn('ana', { name: 'Ana', email: 'ana@x.test' }); await A.flush();
    fbk.deliver('userOrgs/ana', {}); await A.flush();
    check('a phone in no club offers it', /data-act="clubnew"/.test(A.rendered()), true);
    A.click({ act: 'clubnew' });
    check('it asks for a name', /id="clubName"/.test(A.rendered('#sheet')), true);
    await A.createClub(); await A.flush();
    check('not without one', A.lastToast(), 'Give the club a name');
    A.dom.node('#clubName').value = '  Hilltop FC ';
    await A.createClub(); await A.flush(20);
    const p = paths(fbk);
    const adm = p.find(x => /^workspaces\/c[0-9a-f]{24}\/access\/admins\/ana$/.test(x));
    check('she becomes admin of a new, long, random code', !!adm, true);
    const code = adm ? adm.split('/')[1] : '';
    const W = 'workspaces/' + code + '/access/';
    check('then indexes herself', valueAt(fbk, W + 'index/ana'), true);
    check('admin first, then the index', p.indexOf(W + 'admins/ana') < p.indexOf(W + 'index/ana'), true);
    check('then names it', (valueAt(fbk, W + 'org') || {}).name, 'Hilltop FC');
    check('the index before anything that needs it', p.indexOf(W + 'index/ana') < p.indexOf(W + 'org'), true);
    check('she is its first member', (valueAt(fbk, W + 'members/ana') || {}).email, 'ana@x.test');
    check('it goes on her own list', (valueAt(fbk, 'userOrgs/ana/' + code) || {}).name, 'Hilltop FC');
    check('no whole-collection write', p.some(x => /\/(teams|matches|access)$/.test(x)), false);
    check('the phone opens it', A.storage.getItem('sm.workspace'), code);
    check('by reloading into it', A.dom.reloads, 1);
    check('two clubs never share a code', A.newClubCode() !== A.newClubCode(), true);
  }
  {
    // a phone that kept teams on its own brings them in, one at a time
    const local = { teams: { x: { id: 'x', name: 'Mine', players: {} } }, matches: { m: { id: 'm', teamId: 'x', opponent: 'Rivals' } }, access: {} };
    const { A, fbk } = await boot({ storage: { 'sm.data.v1:local': JSON.stringify(local) } });
    fbk.signIn('ana'); await A.flush();
    A.click({ act: 'clubnew' });
    check('it offers to bring the phone\'s team', /Bring the 1 team on this phone/.test(A.rendered('#sheet')), true);
    A.dom.node('#clubName').value = 'Hilltop FC';
    await A.createClub(); await A.flush(20);
    const p = paths(fbk);
    check('the team, at the depth the rules grant', p.some(x => /^workspaces\/c[0-9a-f]+\/teams\/x$/.test(x)), true);
    check('and its game', p.some(x => /^workspaces\/c[0-9a-f]+\/matches\/m$/.test(x)), true);
    const at = x => p.findIndex(y => y.endsWith(x));
    check('only once she is admin and indexed', at('/access/index/ana') < at('/teams/x'), true);
  }
  {
    const local = { teams: { x: { id: 'x', name: 'Mine', players: {} } }, matches: {}, access: {} };
    const { A, fbk } = await boot({ storage: { 'sm.data.v1:local': JSON.stringify(local) } });
    fbk.signIn('ana'); await A.flush();
    A.click({ act: 'clubnew' });
    A.click({ act: 'clubbring' });
    A.dom.node('#clubName').value = 'Hilltop FC';
    await A.createClub(); await A.flush(20);
    check('or leaves them here if she says so', paths(fbk).some(x => /\/teams\/x$/.test(x)), false);
  }
  {
    const { A, fbk } = await boot();
    fbk.signIn('ana'); await A.flush();
    fbk.refuseWrites(p => p.includes('/access/admins/'));
    A.click({ act: 'clubnew' });
    A.dom.node('#clubName').value = 'Hilltop FC';
    await A.createClub(); await A.flush(20);
    check('refused: she is told', A.lastToast(), 'The database refused it');
    check('and the phone goes nowhere', A.storage.getItem('sm.workspace'), null);
  }
  {
    const { A, fbk } = await boot();
    fbk.signOut(); await A.flush();
    check('signed out, the doors ask for a sign-in first', /Sign in to create or join a club/.test(A.rendered()), true);
  }

  H.summary('joining');
})();
