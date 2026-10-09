/* The app on a club on orgs/{code} (AUTH.md, *The move to `orgs/{orgId}`*;
   SECURITY.md, SEC-1), against the fake Firebase. Every club is there, and
   the old workspaces/ tree is gone (build order step 5).

   What the move is for is what a family's phone receives, so that is what is
   checked first and hardest: the parts it asks for, and what it holds after
   — her own children in full, the rest by shirt number, nobody's email, no
   access log — in memory, on the screen and in the copy it keeps. Then the
   staff, who read the squads; then where every write goes, the outbox made
   on the old tree included; and another club of hers, read for My calendar.

   The club is laid out the way the server moved it (test/fakebase.js), and
   answered part by part through a stand-in for the rules, so what the phone
   is handed is what the database would hand it. */

const H = require('./harness');
const { check, deepEq } = H;
const { makeFakebase } = require('./fakebase');
const { orgsLayout: layout } = require('./fakebase');

const CONFIG = { apiKey: 'k', databaseURL: 'https://prod.example', projectId: 'p' };
const OB = 'orgs/CLUB';

/* The club as the app holds it in memory (the old tree's shape), and as orgs/ lays it out. */
const OLD = () => ({
  access: {
    org: { name: 'Lakeside SC' },
    admins: { adm: true },
    index: { adm: true, coachU: true, trkU: true, mumU: true, other2: true },
    members: {
      adm: { name: 'Ada', email: 'ada@example.com' }, coachU: { name: 'Jaz', email: 'jaz@example.com' },
      trkU: { name: 'Tam', email: 'tam@example.com' }, mumU: { name: 'Mo', email: 'mo@example.com' }, other2: { name: 'Kit', email: 'kit@example.com' }
    },
    teams: { t1: { coaches: { coachU: true }, trackers: { trkU: true } }, t2: { coaches: { other2: true } } },
    log: { l1: { at: 1, act: 'linked guardian', by: 'adm', target: 'mumU', player: 'Rosa Lind' } }
  },
  teams: {
    t1: {
      id: 't1', name: 'Flight', players: {
        p1: { id: 'p1', name: 'Ella Fitz', number: '7', note: 'shy in goal', rating: 4, guardians: { mumU: true } },
        p2: { id: 'p2', name: 'Rosa Lind', number: '9', rating: 2, avoid: { p1: true } },
        p3: { id: 'p3', name: 'Ida Fitz', number: '4', guardians: { mumU: true } }
      }
    },
    t2: { id: 't2', name: 'Storm', players: { q1: { id: 'q1', name: 'Bea Quill', number: '3' } } }
  },
  matches: { g1: { id: 'g1', teamId: 't1', opponent: 'Northgate', date: '2026-10-11' } },
  rsvp: {}
});
const ORG = () => layout(OLD());

/* What the rules let `uid` read on orgs/CLUB (database.rules.json; rules.js
   walks the real thing). */
function rulesFor(uid, org) {
  const a = org.access, admin = !!a.admins[uid], coach = !!(a.coachIndex || {})[uid];
  return p => {
    const rel = p.slice(OB.length + 1);
    if (!a.index[uid]) return true;
    if (rel === 'members') return !(admin || coach);
    if (rel === 'log') return !admin;
    // the coach's notes (SECURITY.md, SEC-12): coaches and admins only, never a tracker or a family
    if (rel === 'coachNotes' || rel.startsWith('coachNotes/')) return !(admin || coach);
    let m = /^squad\/([^/]+)$/.exec(rel);
    if (m) return !(admin || coach || ((a.teamIndex || {})[m[1]] || {})[uid]);
    m = /^squad\/([^/]+)\/([^/]+)$/.exec(rel);
    if (m) {
      const rec = ((org.squad || {})[m[1]] || {})[m[2]] || {};
      return !(admin || coach || ((a.teamIndex || {})[m[1]] || {})[uid] || (rec.guardians || {})[uid] || (rec.self || {})[uid]);
    }
    return false;
  };
}
async function boot(storage = {}) {
  const fbk = makeFakebase();
  const A = H.loadApp({ firebase: fbk, config: CONFIG, storage: { 'sm.workspace': 'CLUB', ...storage } });
  await A.flush();
  return { A, fbk };
}
const under = (fbk, pre) => fbk.readPaths().filter(p => p === pre || p.startsWith(pre + '/'));
const wrote = fbk => fbk.record.writes.map(w => w.path);

(async () => {
  console.log('--- a family\'s phone with a copy from the old tree ---');
  {
    // her copy from before the move: the whole squad, everyone's email, the log
    const old = OLD();
    const { A, fbk } = await boot({ 'sm.data.v1:CLUB': JSON.stringify({ ...old, matches: old.matches }) });
    check('the old copy is on the phone', /Rosa Lind/.test(A.storage.getItem('sm.data.v1:CLUB')), true);
    fbk.signIn('mumU', { name: 'Mo' }); await A.flush();
    check('it remembers its copy is cut down for orgs/', A.storage.getItem('sm.tree.v1:CLUB'), 'orgs');
    const kept = A.storage.getItem('sm.data.v1:CLUB');
    check('before anything is read, other children are gone from her copy', /Rosa|Bea/.test(kept), false);
    check('— hers stay', /Ella Fitz/.test(kept) && /Ida Fitz/.test(kept), true);
    check('— and the access log', /linked guardian/.test(kept), false);
    check('— and everyone\'s email', /@example\.com/.test(kept), false);
    deepEq('then it asks for access first, and nothing else', under(fbk, OB), [OB + '/access']);

    const org = ORG();
    await fbk.serve(OB, org, () => A.flush(), rulesFor('mumU', org));
    const asked = under(fbk, OB);
    check('it never asks for the members and their emails', asked.includes(OB + '/members'), false);
    check('nor the access log', asked.includes(OB + '/log'), false);
    check('nor any team\'s squad', asked.some(p => /\/squad\/[^/]+$/.test(p)), false);
    check('it reads the roster, the teams, the games and the staff names', ['roster', 'teams', 'matches', 'names', 'org'].every(k => asked.includes(OB + '/' + k)), true);
    check('her child the lookup table names, by path', asked.includes(OB + '/squad/t1/p1'), true);
    check('and a twin it does not, by asking for each number on the roster once', asked.includes(OB + '/squad/t1/p3'), true);

    const t1 = A.state.teams.t1.players;
    check('her children, in full', t1.p1.name + ' / ' + t1.p1.number + ' / ' + t1.p3.name, 'Ella Fitz / 7 / Ida Fitz');
    check('but not what the coach wrote about her own child (SEC-12)', [t1.p1.note, t1.p1.rating].join(), ',');
    check('her phone never asks for the coach\'s notes', asked.some(p => p.startsWith(OB + '/coachNotes')), false);
    deepEq('another child: a number, nothing else', t1.p2, { id: 'p2', name: '', number: '9', active: true });
    deepEq('another team\'s child: the same', A.state.teams.t2.players.q1, { id: 'q1', name: '', number: '3', active: true });
    const held = JSON.stringify(A.state) + A.storage.getItem('sm.data.v1:CLUB');
    check('no other child\'s name anywhere on the phone', /Rosa|Bea/.test(held), false);
    check('no note or rating of another child', /"avoid"|"rating":2/.test(held), false);
    check('nor of her own, though her copy from before the move had it', /shy in goal|"rating":4/.test(held), false);
    check('no access log', /linked guardian/.test(held), false);
    check('no email but her own', (held.match(/[\w.]+@[\w.]+/g) || []).filter(e => e !== 'mumU@x.test' && e !== 'mo@example.com').length, 0);   // her own, as she signed in and as the club has it
    deepEq('the staff\'s names, for her messages and sessions', Object.keys(A.state.access.members).sort(), ['adm', 'coachU', 'mumU', 'other2', 'trkU']);
    const t = A.state.teams.t1;
    check('the screen names her own', A.shownName(t, t.players.p1), 'Ella Fitz');
    check('— and the rest by number, as it did before', A.shownName(t, t.players.p2), '#9');
    check('the remembered answers: hers yes, the other child no', A.storage.getItem('sm.kids.v1:CLUB:mumU'), '{"t1":{"p1":1,"p2":0,"p3":1}}');

    console.log('\n--- her next connect ---');
    const fb2 = makeFakebase();
    const B = H.loadApp({ firebase: fb2, config: CONFIG, storage: { ...A.storage._d } });
    await B.flush();
    fb2.signIn('mumU', { name: 'Mo' }); await B.flush();
    check('nothing is read from the old tree', fb2.readPaths().some(p => p.startsWith('workspaces/')), false);
    const org2 = ORG(); org2.squad.t1.p5 = { id: 'p5', name: 'Nia Cole', number: '11' }; org2.roster.t1.p5 = { number: '11', active: true };
    await fb2.serve(OB, org2, () => B.flush(), rulesFor('mumU', org2));
    const asked2 = under(fb2, OB);
    check('asks again for her own', asked2.includes(OB + '/squad/t1/p1') && asked2.includes(OB + '/squad/t1/p3'), true);
    check('not for the child she was refused', asked2.includes(OB + '/squad/t1/p2'), false);
    check('once for a child new to the roster', asked2.includes(OB + '/squad/t1/p5'), true);
    check('and holds her number only', JSON.stringify(B.state.teams.t1.players.p5), '{"id":"p5","name":"","number":"11","active":true}');
  }

  console.log('\n--- staff read the squads ---');
  {
    const org = ORG();
    const { A, fbk } = await boot({ 'sm.tree.v1:CLUB': 'orgs' });
    fbk.signIn('coachU', { name: 'Jaz' }); await A.flush();
    check('nothing is read from the old tree', fbk.readPaths().some(p => p.startsWith('workspaces/')), false);
    await fbk.serve(OB, org, () => A.flush(), rulesFor('coachU', org));
    const asked = under(fbk, OB);
    check('a coach reads every team\'s squad', asked.includes(OB + '/squad/t1') && asked.includes(OB + '/squad/t2'), true);
    check('and the members, emails and all', asked.includes(OB + '/members'), true);
    check('not the access log', asked.includes(OB + '/log'), false);
    check('not the roster: she has the squads', asked.includes(OB + '/roster'), false);
    check('names on every child', A.state.teams.t1.players.p2.name + ', ' + A.state.teams.t2.players.q1.name, 'Rosa Lind, Bea Quill');
    check('the coach\'s notes, read from where only coaches and admins read them', A.state.teams.t1.players.p1.note + ' / ' + A.state.teams.t1.players.p2.rating, 'shy in goal / 2');
    check('— asked for there', asked.includes(OB + '/coachNotes'), true);
    check('— and the child\'s record has none of them', /shy in goal/.test(JSON.stringify(org.squad)), false);
    check('emails', A.state.access.members.mumU.email, 'mo@example.com');
    check('she writes her own name where families read it', JSON.stringify((fbk.writtenTo(OB + '/names/coachU')[0] || {}).value), '{"name":"Jaz"}');
  }
  {
    const org = ORG();
    const { A, fbk } = await boot({ 'sm.tree.v1:CLUB': 'orgs' });
    fbk.signIn('trkU', { name: 'Tam' }); await A.flush();
    await fbk.serve(OB, org, () => A.flush(), rulesFor('trkU', org));
    const asked = under(fbk, OB);
    check('a tracker reads her own team\'s squad', asked.includes(OB + '/squad/t1'), true);
    check('— not another team\'s (decided 2026-10-08)', asked.includes(OB + '/squad/t2'), false);
    check('— and its numbers from the roster', JSON.stringify(A.state.teams.t2.players.q1), '{"id":"q1","name":"","number":"3","active":true}');
    check('no emails', asked.includes(OB + '/members'), false);
    check('names on her own team', A.state.teams.t1.players.p2.name, 'Rosa Lind');
    check('but not the coach\'s notes (SEC-12)', asked.some(p => p.startsWith(OB + '/coachNotes')) + ' ' + /shy in goal|"rating"|"avoid"/.test(JSON.stringify(A.state.teams)), 'false false');
  }
  {
    const org = ORG();
    const { A, fbk } = await boot({ 'sm.tree.v1:CLUB': 'orgs' });
    fbk.signIn('adm', { name: 'Ada' }); await A.flush();
    await fbk.serve(OB, org, () => A.flush(), rulesFor('adm', org));
    check('an admin reads the access log too', under(fbk, OB).includes(OB + '/log'), true);
    check('— and has it', Object.keys(A.state.access.log || {}).join(), 'l1');
  }

  console.log('\n--- the coach\'s notes still on a record from before (SEC-12) ---');
  // a club moved before the notes had their own place: on the child's record, as the old tree kept them
  const before = () => {
    const org = ORG();
    org.squad.t1.p1 = { ...org.squad.t1.p1, note: 'shy in goal', rating: 4 };
    org.squad.t1.p2 = { ...org.squad.t1.p2, rating: 5 };   // stale: coachNotes has a newer one
    delete org.coachNotes.t1.p1;
    return org;
  };
  {
    const org = before();
    const { A, fbk } = await boot({ 'sm.tree.v1:CLUB': 'orgs' });
    fbk.signIn('coachU', { name: 'Jaz' }); await A.flush();
    await fbk.serve(OB, org, () => A.flush(), rulesFor('coachU', org)); await A.flush();
    check('the team\'s coach moves a note to where only coaches and admins read it', [(fbk.writtenTo(OB + '/coachNotes/t1/p1/note')[0] || {}).value, (fbk.writtenTo(OB + '/coachNotes/t1/p1/rating')[0] || {}).value].join(), 'shy in goal,4');
    check('— then takes it off the child\'s record', ['note', 'rating'].every(f => fbk.record.removes.includes(OB + '/squad/t1/p1/' + f)), true);
    check('one already there is not overwritten by the older copy', fbk.writtenTo(OB + '/coachNotes/t1/p2/rating').length, 0);
    check('— and the older copy is taken off the record', fbk.record.removes.includes(OB + '/squad/t1/p2/rating'), true);
    check('meanwhile she sees the newer one', A.state.teams.t1.players.p2.rating, 2);
    check('and the note still on the record, until it has moved', A.state.teams.t1.players.p1.note, 'shy in goal');
  }
  {
    const org = before();
    const { A, fbk } = await boot({ 'sm.tree.v1:CLUB': 'orgs' });
    fbk.signIn('other2', { name: 'Kit' }); await A.flush();
    await fbk.serve(OB, org, () => A.flush(), rulesFor('other2', org)); await A.flush();
    check('a coach of another team moves nothing of this team\'s (she may not write it)', fbk.record.writes.filter(w => /coachNotes\/t1/.test(w.path)).length + fbk.record.removes.filter(p => /squad\/t1/.test(p)).length, 0);
  }
  {
    const org = before();
    const { A, fbk } = await boot({ 'sm.tree.v1:CLUB': 'orgs' });
    fbk.signIn('trkU', { name: 'Tam' }); await A.flush();
    await fbk.serve(OB, org, () => A.flush(), rulesFor('trkU', org)); await A.flush();
    check('a tracker moves nothing', fbk.record.writes.filter(w => /coachNotes/.test(w.path)).length + fbk.record.removes.length, 0);
    check('and holds none of it, though it is still on the record she reads', /shy in goal|"rating"/.test(JSON.stringify(A.state.teams) + A.storage.getItem('sm.data.v1:CLUB')), false);
  }
  {
    const org = before();
    const fbk = makeFakebase().refuseWrites(p => /coachNotes/.test(p));
    const A = H.loadApp({ firebase: fbk, config: CONFIG, storage: { 'sm.workspace': 'CLUB', 'sm.tree.v1:CLUB': 'orgs' } });
    await A.flush();
    fbk.signIn('coachU', { name: 'Jaz' }); await A.flush();
    await fbk.serve(OB, org, () => A.flush(), rulesFor('coachU', org)); await A.flush();
    check('refused (older rules): the note stays on the record, to try again', fbk.record.removes.filter(p => /squad\/t1\/p1/.test(p)).length, 0);
  }

  console.log('\n--- where each write goes ---');
  {
    const org = ORG();
    const { A, fbk } = await boot({ 'sm.tree.v1:CLUB': 'orgs' });
    fbk.signIn('coachU', { name: 'Jaz' }); await A.flush();
    fbk.deliver('.info/connected', true);
    await fbk.serve(OB, org, () => A.flush(), rulesFor('coachU', org));
    fbk.record.writes.length = 0;
    const p9 = { id: 'p9', name: 'Zoe Park', number: '12', note: 'new', rating: 3 };
    A.quiet('teams/t1/players/p9', p9); await A.flush();
    check('a child added: into the squad, without the coach\'s notes', JSON.stringify((fbk.writtenTo(OB + '/squad/t1/p9')[0] || {}).value), JSON.stringify({ id: 'p9', name: 'Zoe Park', number: '12' }));
    check('— they go where only coaches and admins read them, a field at a time', [(fbk.writtenTo(OB + '/coachNotes/t1/p9/note')[0] || {}).value, (fbk.writtenTo(OB + '/coachNotes/t1/p9/rating')[0] || {}).value].join(), 'new,3');
    const r = (fbk.writtenTo(OB + '/roster/t1').pop() || {}).value || {};
    deepEq('and the roster: her number, not her name', r.p9, { number: '12', active: true });
    check('— nobody\'s name in it', /Zoe|Rosa|Ella/.test(JSON.stringify(r)), false);
    fbk.record.writes.length = 0;
    A.quiet('teams/t1/players/p2/avoid', { p9: true }); await A.flush();
    deepEq('who to keep apart, changed on its own: there too, and nothing else (not even the roster)', wrote(fbk), [OB + '/coachNotes/t1/p2/avoid']);
    fbk.record.writes.length = 0;
    const team = JSON.parse(JSON.stringify(A.state.teams.t1));
    A.quiet('teams/t1', team); await A.flush();
    const tw = (fbk.writtenTo(OB + '/teams/t1')[0] || {}).value;
    check('a whole team: the team, without its players', !!tw && !('players' in tw) && tw.name === 'Flight', true);
    check('— and its squad on its own', Object.keys((fbk.writtenTo(OB + '/squad/t1')[0] || {}).value || {}).sort().join(), 'p1,p2,p3,p9');
    check('— with no note in it', /shy in goal|"rating"|"avoid"/.test(JSON.stringify((fbk.writtenTo(OB + '/squad/t1')[0] || {}).value)), false);
    check('— the notes it carries, a field each, never the team\'s notes whole (a phone yet to read them must not wipe them)', wrote(fbk).includes(OB + '/coachNotes/t1') || !wrote(fbk).includes(OB + '/coachNotes/t1/p1/note'), false);
    fbk.record.writes.length = 0;
    A.quiet('access/members/coachU', { name: 'Jaz', email: 'jaz@example.com', at: 1 });
    A.quiet('access/log/x1', { at: 1, act: 'x', by: 'coachU' });
    A.quiet('access/org/venues/f1', { name: 'Rose Park' });
    A.quiet('matches/g1/goals/k1', { at: 1, by: 'coachU' });
    A.remoteSet('access/teamIndex/t1/coachU', 'coach');
    await A.flush();
    deepEq('each where orgs/ keeps it', wrote(fbk).sort(), [OB + '/access/teamIndex/t1/coachU', OB + '/log/x1', OB + '/matches/g1/goals/k1', OB + '/members/coachU', OB + '/org/venues/f1']);
    check('nothing to the old tree', fbk.record.writes.some(w => w.path.startsWith('workspaces/')), false);
  }

  console.log('\n--- what was owed from the old tree ---');
  {
    /* A goal tracked with no signal on a phone that last saw the club on the
       old tree, which is gone. The outbox names paths as the app does, so it
       waits for the first read of the club and goes to orgs/. */
    const pending = { seq: 1, w: { 'matches/g1/goals/k7': { v: { at: 1, by: 'coachU' }, n: 1 } } };
    const { A, fbk } = await boot({ 'sm.pending.v1:CLUB': JSON.stringify(pending) });
    fbk.signIn('coachU', { name: 'Jaz' }); await A.flush();
    fbk.deliver('.info/connected', true); await A.flush();
    check('nothing is sent before the club is read', fbk.record.writes.filter(w => /goals/.test(w.path)).length, 0);
    const org = ORG();
    await fbk.serve(OB, org, () => A.flush(), rulesFor('coachU', org));
    check('the goal goes to the club where it is now', fbk.writtenTo(OB + '/matches/g1/goals/k7').length, 1);
    check('never to the old tree', fbk.record.writes.some(w => w.path.startsWith('workspaces/')), false);
    check('and leaves the outbox once it lands', Object.keys(JSON.parse(A.storage.getItem('sm.pending.v1:CLUB')).w).length, 0);
  }

  console.log('\n--- a role changes ---');
  {
    const org = ORG();
    const { A, fbk } = await boot({ 'sm.tree.v1:CLUB': 'orgs' });
    fbk.signIn('coachU', { name: 'Jaz' }); await A.flush();
    await fbk.serve(OB, org, () => A.flush(), rulesFor('coachU', org));
    // taken off as a coach: what she may read changes, so the club is read again as what she is now
    const now = JSON.parse(JSON.stringify(org));
    delete now.access.coachIndex.coachU; delete now.access.teams.t1.coaches.coachU; delete now.access.teamIndex.t1.coachU;
    const before = fbk.readPaths().length;
    fbk.deliver(OB + '/access', now.access); await A.flush();
    check('read again', fbk.readPaths().slice(before).includes(OB + '/access'), true);
    await fbk.serve(OB, now, () => A.flush(), rulesFor('coachU', now));
    check('and the squad goes with the role', /Rosa/.test(JSON.stringify(A.state.teams)), false);
  }

  console.log('\n--- another club of hers, for My calendar ---');
  {
    const other = layout({
      access: { org: { name: 'Hillside' }, admins: { a2: true }, index: { a2: true, mumU: true }, members: {}, teams: {} },
      teams: { h1: { id: 'h1', name: 'Hill U9', players: { k1: { id: 'k1', name: 'Kai Fitz', number: '5', guardians: { mumU: true } }, k2: { id: 'k2', name: 'Lou Hart', number: '6' } } } },
      matches: { m1: { id: 'm1', teamId: 'h1', opponent: 'Owls', date: '2026-10-12' } }
    });
    const { A, fbk } = await boot({ 'sm.tree.v1:OTHER': 'orgs' });
    fbk.signIn('mumU', { name: 'Mo' }); await A.flush();
    await fbk.serveClub('CLUB', OLD(), A.flush); await A.flush();
    fbk.deliver('userOrgs/mumU', { CLUB: { name: 'Lakeside SC', at: 1 }, OTHER: { name: 'Hillside', at: 1 } }); await A.flush();
    await fbk.serve('orgs/OTHER', other, () => A.flush(), p => /\/squad\/h1(\/k2)?$/.test(p));
    const asked = under(fbk, 'orgs/OTHER');
    check('her child there, by path', asked.includes('orgs/OTHER/squad/h1/k1'), true);
    check('never the squad', asked.includes('orgs/OTHER/squad/h1'), false);
    check('never the members', asked.includes('orgs/OTHER/members'), false);
    check('nothing from its old tree', fbk.readPaths().some(p => p.startsWith('workspaces/OTHER')), false);
    // the copy she keeps of it, as it stands in memory (it is saved on a timer)
    const copy = JSON.stringify(A.you.clubs.OTHER || {});
    check('her copy has her child', /Kai Fitz/.test(copy), true);
    check('and nobody else\'s', /Lou Hart/.test(copy), false);
  }

  H.summary('the app on a club on orgs/');
})();
