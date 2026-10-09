/* Club-wide viewers and guests (AUTH.md, *More kinds of people*, 3 and 4;
   the owner's decisions 4 and 5, 2026-10-09), against the fake Firebase on
   a club on orgs/.

   A viewer (a director) sees every team's games and calendar with the
   children's names, and nothing else: her phone never asks for the members
   and their emails, the access log, the coach's notes or who is coming, and
   every write a screen might offer is refused in the handler. She is not in
   access/index, so an admin's phone never takes her bookmark away for having
   no "role", and following a game asks the server for nothing.

   A guest (a referee, a scout) is let in by the team's coach or an admin to
   one game or one entry until a time: her phone reads only that, with the
   team's names, lands on it, writes nothing to the club, and shows nothing
   once her time is up. The game link without signing in is untouched:
   stats.js still requires the public page carry no name. */

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
    index: { adm: true, coachU: true, coach2: true, mumU: true },
    teams: { t1: { coaches: { coachU: true } }, t2: { coaches: { coach2: true } } },
    teamIndex: { t1: { coachU: 'coach' }, t2: { coach2: 'coach' } },
    coachIndex: { coachU: 't1', coach2: 't2' },
    teamParents: { t1: { mumU: 'p1' } },
    viewers: { dirU: 'inv-d' },
    guests: {}
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
   rules.js walks the real thing, viewers and guests included). */
function rulesFor(uid, org, now) {
  const a = org.access, staff = !!(a.admins[uid] || (a.coachIndex || {})[uid]);
  const viewer = !!(a.viewers || {})[uid];
  const g = (a.guests || {})[uid], guest = g && g.until > now ? g : null;
  return p => {
    const rel = p.slice(OB.length + 1);
    if (a.index[uid]) {
      if (rel === 'members' || rel === 'log' || rel.startsWith('coachNotes')) return !staff;
      return false;
    }
    if (viewer) {
      if (['access', 'org', 'names', 'teams', 'matches'].includes(rel) || /^squad\/[^/]+$/.test(rel)) return false;
      if (rel === 'members/' + uid) return false;
      return true;
    }
    if (rel === 'access/guests/' + uid) return false;
    if (guest) {
      if (rel === 'org/name' || rel === 'teams/' + guest.team + '/name' || rel === 'squad/' + guest.team) return false;
      if (guest.item.startsWith('g_') && rel === 'matches/' + guest.item.slice(2)) return false;
      if (guest.item.startsWith('e_') && rel === 'teams/' + guest.team + '/events/' + guest.item.slice(2)) return false;
    }
    return true;
  };
}
async function boot(uid, org, extra = {}) {
  const fbk = makeFakebase();
  const A = H.loadApp({ firebase: fbk, config: CONFIG, storage: { 'sm.workspace': 'CLUB', 'sm.tree.v1:CLUB': 'orgs', ...(extra.storage || {}) }, search: extra.search });
  await A.flush();
  fbk.signIn(uid, { name: extra.name || uid, email: uid + '@x.test' }); await A.flush();
  if (org) await fbk.serve(OB, org, () => A.flush(), rulesFor(uid, org, A.nowMs()));
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
    A.click({ act: 'feedfollow', v: 1 });
    A.click({ act: 'guestmake', tid: 't1', item: 'g_g1' });
    A.click({ act: 'invitemake' });
    await A.flush(10);
    deepEq('a squad change, a game, an answer, a guest link or an invite: nothing written to the club', clubWrites(fbk, n), []);
    check('— nor any invite', fbk.record.writes.slice(n).some(w => /^invites\//.test(w.path)), false);
    check('— nor a follow the rules would refuse (her page still follows it)', fbk.record.writes.slice(n).some(w => /^follow\//.test(w.path)), false);
    fbk.deliver('userOrgs/dirU', {}); await A.flush(5);
    check('her bookmark to the club is written, so her other phones find it', !!valueAt(fbk, 'userOrgs/dirU/CLUB'), true);
    check('she is never put in the index', fbk.record.writes.some(w => w.path.includes('/access/index/dirU')), false);
  }

  console.log('\n--- an admin makes and unmakes one ---');
  {
    const org = ORG(); delete org.access.viewers;
    const { A, fbk } = await boot('adm', org);
    A.click({ act: 'setviewer', uid: 'mumU' }); await A.flush(10);
    check('one write, where the rules look', valueAt(fbk, OB + '/access/viewers/mumU'), true);
    check('her index entry stays: she is still a parent', fbk.record.removes.includes(OB + '/access/index/mumU'), false);
    check('the People row says so', /Club viewer<i>every team<\/i>/.test(A.roleTags('mumU', A.teams())), true);
    A.click({ act: 'setviewer', uid: 'mumU' }); await A.flush(10);
    check('tapped again, it goes', fbk.record.removes.includes(OB + '/access/viewers/mumU'), true);
    A.state.access.viewers = { dirU: true };
    check('a viewer with no other role keeps her bookmark when an admin\'s phone heals the index', (A.syncIndex('dirU'), await A.flush(5), fbk.record.removes.includes('userOrgs/dirU/CLUB')), false);
    delete A.state.access.viewers;
    A.syncIndex('dirU'); await A.flush(5);
    check('— and loses it once she is not one', fbk.record.removes.includes('userOrgs/dirU/CLUB'), true);
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
    check('never in the index, which would open sessions, answers and following', fbk.record.writes.some(w => w.path.includes('/access/index/')), false);
    check('nor any team or lookup table', fbk.record.writes.some(w => /\/access\/(teams|teamIndex|teamParents|teamPlayers)\//.test(w.path)), false);
    check('her bookmark to the club', !!valueAt(fbk, 'userOrgs/dirU/CLUB'), true);
  }

  console.log('\n--- the team\'s coach lets a guest in to one game ---');
  {
    const { A, fbk } = await boot('coachU', ORG());
    A.ui.teamId = 't1';
    A.sheetCalItem('game', 't1', 'g1');
    check('the game\'s sheet offers it to the team\'s coach', /data-act="guestopen"[^>]*data-item="g_g1"/.test(String(A.dom.node('#sheet').innerHTML || '')), true);
    A.click({ act: 'guestopen', tid: 't1', item: 'g_g1' });
    A.click({ act: 'guestpick', v: 'two' });
    A.click({ act: 'guestmake', tid: 't1', item: 'g_g1' }); await A.flush(10);
    const inv = fbk.record.writes.find(w => /^invites\/[^/]+$/.test(w.path));
    const until = A.guestUntil('2026-09-13', 'two');
    check('an invite for a guest at that game', inv && [inv.value.role, inv.value.team, inv.value.item].join(), 'guest,t1,g_g1');
    check('— ending two days after the game day', inv && inv.value.until, until);
    check('— a link that lasts no longer than she does', inv && inv.value.expiresAt <= until, true);
    check('— naming the game, never a child', inv && /Northgate/.test(inv.value.itemLabel) && !/Ella|Rosa/.test(JSON.stringify(inv.value)), true);
    check('— listed for the club\'s admins', fbk.record.writes.some(w => w.path === 'clubInvites/CLUB/' + inv.path.split('/')[1] && w.value.role === 'guest'), true);
  }
  {
    const { A, fbk } = await boot('coach2', ORG());
    const n = fbk.record.writes.length;
    A.click({ act: 'guestmake', tid: 't1', item: 'g_g1' }); await A.flush(10);
    check('another team\'s coach cannot, whatever reaches the handler', fbk.record.writes.slice(n).some(w => /^invites\//.test(w.path)), false);
  }
  {
    const { A, fbk } = await boot('mumU', ORG());
    const n = fbk.record.writes.length;
    A.click({ act: 'guestmake', tid: 't1', item: 'g_g1' }); await A.flush(10);
    check('nor a parent', fbk.record.writes.slice(n).some(w => /^invites\//.test(w.path)), false);
    A.sheetCalItem('game', 't1', 'g1');
    check('— and her sheet does not offer it', /guestopen/.test(String(A.dom.node('#sheet').innerHTML || '')), false);
  }

  console.log('\n--- the guest accepts it ---');
  {
    const fbk = makeFakebase();
    const A = H.loadApp({ firebase: fbk, config: CONFIG, storage: { 'sm.tree.v1:CLUB': 'orgs' }, search: '?invite=iguest' });
    await A.flush();
    fbk.signIn('refU', { name: 'Ray Ref', email: 'ray@x.test' }); await A.flush();
    const until = A.nowMs() + 2 * DAY;
    fbk.deliver('invites/iguest', { ws: 'CLUB', role: 'guest', team: 't1', teamName: 'Flight', item: 'g_g1', until, itemLabel: 'the game against Northgate',
      clubName: 'Lakeside SC', by: 'coachU', byName: 'Jaz', at: A.nowMs() - 1000, expiresAt: until });
    await A.flush();
    check('it says what she is let in to, and until when', /a guest at <b>the game against Northgate<\/b>/.test(A.rendered()), true);
    A.click({ act: 'inviteaccept' }); await A.flush(20);
    deepEq('her guest entry, exactly as the invite says', valueAt(fbk, OB + '/access/guests/refU'), { team: 't1', item: 'g_g1', until, inv: 'iguest', name: 'Ray Ref' });
    check('not a member of the club, so no email of hers in it', fbk.record.writes.some(w => w.path.includes('/members/')), false);
    check('never in the index', fbk.record.writes.some(w => w.path.includes('/access/index/')), false);
    check('her bookmark, so she finds it again', !!valueAt(fbk, 'userOrgs/refU/CLUB'), true);
  }

  console.log('\n--- a guest\'s phone ---');
  {
    const org = ORG();
    const until = H.clock.t + 2 * DAY;
    org.access.guests = { refU: { team: 't1', item: 'g_g1', until, inv: 'iguest', name: 'Ray' } };
    const { A, fbk } = await boot('refU', org);
    const asked = under(fbk, OB);
    check('she asks for access, is refused, and then for her own guest entry', asked.includes(OB + '/access') && asked.includes(OB + '/access/guests/refU'), true);
    check('then her one game, its team\'s name and squad, and the club\'s name',
      ['matches/g1', 'teams/t1/name', 'squad/t1', 'org/name'].every(k => asked.includes(OB + '/' + k)), true);
    check('nothing else of the club', asked.filter(p => !['access', 'access/guests/refU', 'matches/g1', 'teams/t1/name', 'squad/t1', 'org/name'].includes(p.slice(OB.length + 1))).join(), '');
    deepEq('she holds that one game', Object.keys(A.state.matches), ['g1']);
    deepEq('— and that one team', Object.keys(A.state.teams), ['t1']);
    check('— with its names', A.state.teams.t1.players.p2.name, 'Rosa Lind');
    const held = JSON.stringify(A.state) + A.storage.getItem('sm.data.v1:CLUB');
    check('nothing of another team, game, entry or answer', /Storm|Bea|Hilltop|Brook|North Park|"rsvp":\{"t1"/.test(held), false);
    check('no email, no note, no log', /@example|shy in goal|linked guardian/.test(held), false);
    check('she is a guest on her team, nothing elsewhere', A.roleIn('t1', 'refU') + ' ' + A.roleIn('t2', 'refU'), 'guest null');
    A.render();
    check('she lands on her game', A.ui.view + ' ' + A.ui.matchId + ' ' + A.ui.teamId, 'game g1 t1');
    check('— read-only, with names', A.restricted() + ' ' + A.canEditTeam('t1') + ' ' + A.namesNarrowed('t1'), 'viewer false false');
    A.ui.gameView = 'stats'; A.render();
    check('— the scorer named', /Rosa Lind/.test(A.rendered()), true);
    check('— and told she is a guest until when', /A guest at one game of/.test(A.rendered()), true);
    check('the club is gated: signed out, nothing is drawn', A.gated(), true);
    const n = fbk.record.writes.length;
    A.click({ act: 'addplayer' }); A.click({ act: 'feedfollow', v: 1 });
    A.click({ act: 'claimadmin' });
    A.click({ act: 'rsvp', tid: 't1', k: 'g_g1', pid: 'p1', v: 'no', kind: 'game', id: 'g1' });
    await A.flush(10);
    deepEq('she writes nothing to the club', clubWrites(fbk, n), []);
    check('— not even claiming a club her phone sees with no admin', fbk.record.writes.slice(n).some(w => w.path.includes('/admins/')), false);

    console.log('\n--- when her time is up ---');
    A.clock.advance(3 * DAY); A.render();
    check('the game is no longer drawn', /Rosa Lind|Northgate/.test(A.rendered()), false);
    check('she is told it has ended', /Your time as a guest has ended/.test(A.rendered()), true);
    check('no crumbs naming the club or team', /Lakeside|Flight/.test(String(A.dom.node('#crumbs').innerHTML || '')), false);
    A.clock.advance(-3 * DAY);
  }
  {
    const org = ORG();
    org.access.guests = { refU: { team: 't1', item: 'g_g1', until: H.clock.t - 1 } };
    const { A, fbk } = await boot('refU', org);
    check('a guest whose time is up before she opens it reads nothing past her own entry', under(fbk, OB).some(p => /matches|squad/.test(p)), false);
    // the app retries a refusal twice before believing it (a token that had not reached the database yet)
    for (let i = 0; i < 3; i++) { A.timers.run(); await A.flush(); await fbk.serve(OB, org, () => A.flush(), rulesFor('refU', org, A.nowMs())); }
    check('— and is shown the lock screen', A.denied, true);
  }
  {
    const org = ORG();
    org.access.guests = { scoutU: { team: 't1', item: 'e_e1', until: H.clock.t + DAY } };
    const { A, fbk } = await boot('scoutU', org);
    check('a guest at a practice reads that entry', under(fbk, OB).includes(OB + '/teams/t1/events/e1'), true);
    check('— and no game', Object.keys(A.state.matches).length, 0);
    deepEq('— holds only it', Object.keys(A.state.teams.t1.events || {}), ['e1']);
    A.render();
    check('— and lands on the calendar', A.ui.view, 'calendar');
  }

  console.log('\n--- the coach takes a guest out ---');
  {
    const org = ORG();
    org.access.guests = { refU: { team: 't1', item: 'g_g1', until: H.clock.t + DAY, inv: 'iguest', name: 'Ray' } };
    const { A, fbk } = await boot('coachU', org);
    A.click({ act: 'guestopen', tid: 't1', item: 'g_g1' });
    check('the sheet lists who is a guest now', /Ray/.test(String(A.dom.node('#sheet').innerHTML || '')), true);
    A.click({ act: 'guestdrop', tid: 't1', item: 'g_g1', uid: 'refU' }); await A.flush(10);
    check('she is taken out', fbk.record.removes.includes(OB + '/access/guests/refU'), true);
    check('— and the invite she came by goes too', fbk.record.removes.includes('invites/iguest'), true);
  }
  {
    const org = ORG();
    org.access.guests = { refU: { team: 't1', item: 'g_g1', until: H.clock.t + DAY } };
    const { A, fbk } = await boot('coach2', org);
    A.click({ act: 'guestdrop', tid: 't1', item: 'g_g1', uid: 'refU' }); await A.flush(10);
    check('another team\'s coach cannot', fbk.record.removes.includes(OB + '/access/guests/refU'), false);
  }

  H.summary('viewers and guests');
})();
