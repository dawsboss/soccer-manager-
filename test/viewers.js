/* Club-wide viewers (AUTH.md, *More kinds of people*, 3; the owner's
   decisions, 2026-10-09), against the fake Firebase on a club on orgs/.

   A viewer (a director) sees every team's games and calendar with the
   children's names, and nothing else: her phone never asks for the members
   and their emails, the access log or the coach's notes, and every write a
   screen might offer (the squad, a game, an answer, an invite) is refused in
   the handler. She is in access/index like everyone else in the club, so an
   admin's phone keeps her there and following a game works for her. The
   game link without signing in is untouched: stats.js still requires the
   public page carry no name. */

const H = require('./harness');
const { check, deepEq } = H;
const { makeFakebase } = require('./fakebase');

const CONFIG = { apiKey: 'k', databaseURL: 'https://prod.example', projectId: 'p' };
const OB = 'orgs/CLUB';
const DAY = 864e5;
const valueAt = (fbk, p) => { const w = fbk.writtenTo(p); return w.length ? w[w.length - 1].value : undefined; };
const under = (fbk, pre) => fbk.readPaths().filter(p => p === pre || p.startsWith(pre + '/'));

const ORG = () => ({
  access: {
    admins: { adm: true },
    index: { adm: true, coachU: true, coach2: true, mumU: true, dirU: 'inv-d' },
    teams: { t1: { coaches: { coachU: true } }, t2: { coaches: { coach2: true } } },
    teamIndex: { t1: { coachU: 'coach' }, t2: { coach2: 'coach' } },
    coachIndex: { coachU: 't1', coach2: 't2' },
    teamParents: { t1: { mumU: 'p1' } },
    viewers: { dirU: 'inv-d' }
  },
  org: { name: 'Lakeside SC' },
  members: { adm: { name: 'Ada', email: 'ada@example.com' }, coachU: { name: 'Jaz', email: 'jaz@example.com' }, mumU: { name: 'Mo', email: 'mo@example.com' }, dirU: { name: 'Dee', email: 'dee@example.com' } },
  names: { adm: { name: 'Ada' }, coachU: { name: 'Jaz' } },
  log: { l1: { at: 1, act: 'linked guardian', by: 'adm', target: 'mumU', player: 'Ella Fitz' } },
  teams: {
    t1: { id: 't1', name: 'Flight', events: { e1: { id: 'e1', kind: 'practice', date: '2026-09-15', start: '18:00', venue: 'North Park' } } },
    t2: { id: 't2', name: 'Storm' }
  },
  squad: {
    t1: { p1: { id: 'p1', name: 'Ella Fitz', number: '7', guardians: { mumU: true } }, p2: { id: 'p2', name: 'Rosa Lind', number: '9' } },
    t2: { q1: { id: 'q1', name: 'Bea Quill', number: '3' } }
  },
  coachNotes: { t1: { p1: { note: 'shy in goal', rating: 4 } } },
  roster: { t1: { p1: { number: '7', active: true }, p2: { number: '9', active: true } }, t2: { q1: { number: '3', active: true } } },
  matches: {
    g1: { id: 'g1', teamId: 't1', opponent: 'Northgate', date: '2026-09-13', periodCount: 2, periodMinutes: 30, onFieldCount: 2,
      goals: { a: { t: 300, side: 'us', pid: 'p2', assist: 'p1' } } },
    g2: { id: 'g2', teamId: 't1', opponent: 'Hilltop', date: '2026-09-20' },
    h1: { id: 'h1', teamId: 't2', opponent: 'Brook', date: '2026-09-14' }
  },
  rsvp: { t1: { g_g1: { p1: { v: 'yes', by: 'mumU', at: 1 } } } }
});

/* What the rules let each of these read on orgs/CLUB (database.rules.json;
   rules.js walks the real thing, viewers included). */
function rulesFor(uid, org) {
  const a = org.access, staff = !!(a.admins[uid] || (a.coachIndex || {})[uid]);
  const viewer = !!(a.viewers || {})[uid];
  return p => {
    const rel = p.slice(OB.length + 1);
    if (!a.index[uid]) return true;
    if (rel === 'members' || rel === 'log' || rel.startsWith('coachNotes')) return !staff;
    const m = /^squad\/([^/]+)$/.exec(rel);
    if (m) return !(staff || viewer || ((a.teamIndex || {})[m[1]] || {})[uid]);
    return false;
  };
}
async function boot(uid, org, extra = {}) {
  const fbk = makeFakebase();
  const A = H.loadApp({ firebase: fbk, config: CONFIG, storage: { 'sm.workspace': 'CLUB', 'sm.tree.v1:CLUB': 'orgs', ...(extra.storage || {}) }, search: extra.search });
  await A.flush();
  fbk.signIn(uid, { name: extra.name || uid, email: uid + '@x.test' }); await A.flush();
  if (org) await fbk.serve(OB, org, () => A.flush(), rulesFor(uid, org));
  await A.flush();
  return { A, fbk };
}
const clubWrites = (fbk, from = 0) => fbk.record.writes.slice(from).map(w => w.path).filter(p => p.startsWith(OB + '/'));

(async () => {
  console.log('--- a club viewer\'s phone ---');
  {
    const org = ORG();
    const { A, fbk } = await boot('dirU', org, { name: 'Dee' });
    const asked = under(fbk, OB);
    check('she reads the teams, the games and every team\'s squad', ['teams', 'matches', 'squad/t1', 'squad/t2'].every(k => asked.includes(OB + '/' + k)), true);
    check('never the members and their emails', asked.includes(OB + '/members'), false);
    check('never the access log', asked.includes(OB + '/log'), false);
    check('never the coach\'s notes', asked.some(p => p.startsWith(OB + '/coachNotes')), false);
    check('every child by name, on every team', A.state.teams.t1.players.p2.name + ', ' + A.state.teams.t2.players.q1.name, 'Rosa Lind, Bea Quill');
    const held = JSON.stringify(A.state) + A.storage.getItem('sm.data.v1:CLUB');
    check('no email but her own', (held.match(/[\w.]+@[\w.]+/g) || []).filter(e => !/^dir/.test(e) && e !== 'dee@example.com').length, 0);
    check('no access log, no notes', /linked guardian|shy in goal|"rating"/.test(held), false);
    check('she is a viewer, on every team', A.isViewer('dirU') + ' ' + A.roleIn('t1', 'dirU') + ' ' + A.roleIn('t2', 'dirU'), 'true viewer viewer');
    check('— and sees every team', A.myTeams().map(t => t.id).sort().join(), 't1,t2');
    A.ui.teamId = 't1';
    check('— read-only', A.canEditTeam('t1') + ' ' + A.restricted(), 'false viewer');
    const t = A.state.teams.t1;
    check('— with names, whatever the club\'s setting', A.namesNarrowed('t1') + ' ' + A.shownName(t, t.players.p2), 'false Rosa Lind');
    A.ui.view = 'game'; A.ui.matchId = 'g1'; A.ui.gameView = 'stats'; A.render();
    check('the game, with the scorer named', /Rosa Lind/.test(A.rendered()), true);
    check('— and says she is a club viewer who reads, not changes', /as a club viewer/.test(A.rendered()), true);
    for (const gv of ['live', 'recap']) { A.ui.gameView = gv; A.render(); }
    check('the game\'s own screens are Live, Stats and Recap', ['subs', 'track', 'plan', 'pitch'].includes(A.ui.gameView), false);
    A.ui.view = 'calendar'; A.render();
    A.ui.view = 'season'; A.render();
    check('nothing to message: no conversations, no notices', A.msgTeams().length + A.famThreads().length, 0);

    const n = fbk.record.writes.length;
    A.click({ act: 'addplayer' }); A.click({ act: 'newmatch' });
    A.click({ act: 'rsvp', tid: 't1', k: 'g_g1', pid: 'p1', v: 'no', kind: 'game', id: 'g1' });
    A.click({ act: 'invitemake' });
    await A.flush(10);
    deepEq('a squad change, a game, an answer or an invite: nothing written to the club', clubWrites(fbk, n), []);
    check('— nor any invite', fbk.record.writes.slice(n).some(w => /^invites\//.test(w.path)), false);
    A.ui.view = 'game'; A.ui.matchId = 'g1';
    A.click({ act: 'feedfollow', v: '1' }); await A.flush(10);
    check('following a game reaches the server for her, as for anyone in the club', fbk.record.writes.some(w => w.path === 'follow/CLUB/g1/dirU'), true);
    fbk.deliver('userOrgs/dirU', {}); await A.flush(5);
    check('her bookmark to the club is written, so her other phones find it', !!valueAt(fbk, 'userOrgs/dirU/CLUB'), true);
    check('her phone does not take her out of the index', fbk.record.removes.includes(OB + '/access/index/dirU'), false);
  }

  console.log('\n--- an admin makes and unmakes one ---');
  {
    const org = ORG(); delete org.access.viewers;
    const { A, fbk } = await boot('adm', org);
    A.click({ act: 'setviewer', uid: 'mumU' }); await A.flush(10);
    check('one write, where the rules look', valueAt(fbk, OB + '/access/viewers/mumU'), true);
    check('— and she stays in the index', fbk.record.removes.includes(OB + '/access/index/mumU'), false);
    check('the People row says so', /Club viewer<i>every team<\/i>/.test(A.roleTags('mumU', A.teams())), true);
    A.click({ act: 'setviewer', uid: 'mumU' }); await A.flush(10);
    check('tapped again, it goes', fbk.record.removes.includes(OB + '/access/viewers/mumU'), true);
    A.click({ act: 'setviewer', uid: 'newU' }); await A.flush(10);
    check('someone with no other role made a viewer is indexed, so she can read the club', valueAt(fbk, OB + '/access/index/newU'), true);
    check('— a role the index counts', A.hasAnyRole('newU'), true);
    A.click({ act: 'setviewer', uid: 'newU' }); await A.flush(10);
    check('unmade, she leaves the index', fbk.record.removes.includes(OB + '/access/index/newU'), true);
    check('— and loses her bookmark', fbk.record.removes.includes('userOrgs/newU/CLUB'), true);
  }
  for (const who of ['coachU', 'mumU']) {
    const { A, fbk } = await boot(who, ORG());
    const n = fbk.record.writes.length;
    A.click({ act: 'setviewer', uid: 'mumU' }); await A.flush(10);
    check(`${who === 'coachU' ? 'a coach' : 'a parent'} cannot make a viewer, whatever reaches the handler`, fbk.record.writes.slice(n).some(w => w.path.includes('/viewers/')), false);
  }

  console.log('\n--- an admin\'s invite to be a viewer, and accepting it ---');
  {
    const { A, fbk } = await boot('adm', ORG());
    A.click({ act: 'invitenew' }); A.click({ act: 'invitepick', k: 'role', v: 'viewer' }); await A.flush();
    check('a club viewer\'s invite asks for no team', /data-act="invitepick" data-k="team"/.test(String(A.dom.node('#sheet').innerHTML || '')), false);
    A.click({ act: 'invitemake' }); await A.flush(10);
    const inv = fbk.record.writes.find(w => /^invites\/[^/]+$/.test(w.path));
    check('it is written, for the whole club', inv && inv.value.role + ' ' + ('team' in inv.value), 'viewer false');
    check('— and listed for the admins', fbk.record.writes.some(w => w.path === 'clubInvites/CLUB/' + inv.path.split('/')[1]), true);
  }
  {
    const fbk = makeFakebase();
    const A = H.loadApp({ firebase: fbk, config: CONFIG, storage: { 'sm.tree.v1:CLUB': 'orgs' }, search: '?invite=iview' });
    await A.flush();
    fbk.signIn('dirU', { name: 'Dee', email: 'dee@x.test' }); await A.flush();
    fbk.deliver('invites/iview', { ws: 'CLUB', role: 'viewer', clubName: 'Lakeside SC', by: 'adm', byName: 'Ada', at: A.nowMs() - 1000, expiresAt: A.nowMs() + 7 * DAY });
    await A.flush();
    check('it says what she is joining as', /a club viewer/.test(A.rendered()), true);
    A.click({ act: 'inviteaccept' }); await A.flush(20);
    check('a viewer, carrying the invite id', valueAt(fbk, OB + '/access/viewers/dirU'), 'iview');
    check('in the club\'s People', !!valueAt(fbk, OB + '/members/dirU'), true);
    check('in the index, carrying the invite id', valueAt(fbk, OB + '/access/index/dirU'), 'iview');
    const ps = fbk.record.writes.map(w => w.path);
    check('— after her viewer entry, in the order the rules need', ps.indexOf(OB + '/access/viewers/dirU') < ps.indexOf(OB + '/access/index/dirU'), true);
    check('nor any team or lookup table', fbk.record.writes.some(w => /\/access\/(teams|teamIndex|teamParents|teamPlayers)\//.test(w.path)), false);
    check('her bookmark to the club', !!valueAt(fbk, 'userOrgs/dirU/CLUB'), true);
  }

  H.summary('club viewers');
})();
