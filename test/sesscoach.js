/* A session coach, a coach of no team (DOORS.md, *A coach of no team*;
   build 181, rules version 35), on a club on orgs/.

   A goalkeeper coach the club pays for 1-1s who runs no team used to have no
   way in but being named coach of a team she does not coach. She is named
   by an admin at access/sessionCoaches/{uid}, as a viewer is, and indexed
   like everyone. What is easy to get quietly wrong, pinned here:

   - Her phone reads every squad and the children's records, for the names
     and ages of the children she books, and never the members' emails, the
     access log or the coach's notes.
   - She offers, runs and plans sessions and bookable times as a coach of any
     team does (canOffer, canRun, canEditBlock), and is a colleague to talk
     to; she changes nothing of a team, and a tap at it writes nothing.
   - Her door is Sessions alone: no Teams door, no switch, a team's or a
     game's address landing on her own Home. A session coach who also coaches
     a team keeps both doors.
   - Only an admin names one, from People (the Session coach chip) or an
     invite for the whole club; a coach is refused in the handler. */

const H = require('./harness');
const { check, deepEq } = H;
const { makeFakebase } = require('./fakebase');

const CONFIG = { apiKey: 'k', databaseURL: 'https://prod.example', projectId: 'p' };
const OB = 'orgs/CLUB';
const under = (fbk, pre) => fbk.readPaths().filter(p => p === pre || p.startsWith(pre + '/'));

const ORG = () => ({
  access: {
    admins: { adm: true },
    index: { adm: true, coachU: true, mumU: true, gkU: 'inv-g' },
    teams: { t1: { coaches: { coachU: true } }, t2: { coaches: {} } },
    teamIndex: { t1: { coachU: 'coach' } },
    coachIndex: { coachU: 't1' },
    teamParents: { t1: { mumU: 'p1' } },
    sessionCoaches: { gkU: 'inv-g' }
  },
  org: { name: 'Lakeside SC' },
  members: { adm: { name: 'Ada', email: 'ada@example.com' }, coachU: { name: 'Jaz', email: 'jaz@example.com' }, mumU: { name: 'Mo', email: 'mo@example.com' }, gkU: { name: 'Gus', email: 'gus@example.com' } },
  names: { adm: { name: 'Ada' }, coachU: { name: 'Jaz' }, gkU: { name: 'Gus' } },
  log: { l1: { at: 1, act: 'linked guardian', by: 'adm', target: 'mumU', player: 'Ella Fitz' } },
  teams: {
    t1: { id: 't1', name: 'Flight', birthYear: 2013, events: { e1: { id: 'e1', kind: 'practice', date: '2026-09-15', start: '18:00', venue: 'North Park' } } },
    t2: { id: 't2', name: 'Storm', birthYear: 2015 }
  },
  squad: {
    t1: { p1: { id: 'p1', name: 'Ella Fitz', number: '7', guardians: { mumU: true } }, p2: { id: 'p2', name: 'Rosa Lind', number: '9' } },
    t2: { q1: { id: 'q1', name: 'Bea Quill', number: '3' } }
  },
  children: { c1: { id: 'c1', first: 'Nell', last: 'Okafor', club: true, born: '2014-02-02', gender: 'F', confirmed: 1, family: { mumU: true } } },
  coachNotes: { t1: { p1: { note: 'shy in goal', rating: 4 } } },
  roster: { t1: { p1: { number: '7', active: true }, p2: { number: '9', active: true } }, t2: { q1: { number: '3', active: true } } },
  matches: { g1: { id: 'g1', teamId: 't1', opponent: 'Northgate', date: '2026-09-13', periodCount: 2, periodMinutes: 30, onFieldCount: 2 } }
});

/* What the rules let each of these read on orgs/CLUB (database.rules.json;
   rules.js walks the real thing, session coaches included). */
function rulesFor(uid, org) {
  const a = org.access, staff = !!(a.admins[uid] || (a.coachIndex || {})[uid]);
  const names = staff || !!(a.viewers || {})[uid] || !!(a.sessionCoaches || {})[uid];
  return p => {
    const rel = p.slice(OB.length + 1);
    if (!a.index[uid]) return true;
    if (rel === 'members' || rel === 'log' || rel.startsWith('coachNotes')) return !staff;
    const m = /^squad\/([^/]+)$/.exec(rel);
    if (m) return !(names || ((a.teamIndex || {})[m[1]] || {})[uid]);
    if (rel === 'children' || rel.startsWith('children/')) return !names;
    return false;
  };
}
async function boot(uid, org, extra = {}) {
  const fbk = makeFakebase();
  const A = H.loadApp({ firebase: fbk, config: CONFIG, storage: { 'sm.workspace': 'CLUB', 'sm.tree.v1:CLUB': 'orgs', ...(extra.storage || {}) } });
  await A.flush();
  fbk.signIn(uid, { name: extra.name || uid, email: uid + '@x.test' }); await A.flush();
  if (org) await fbk.serve(OB, org, () => A.flush(), rulesFor(uid, org));
  await A.flush();
  A.sess = { sessions: {}, booked: {}, came: {}, fees: {}, pay: {}, splans: {}, avail: {}, dirty: {} };
  // a 1-1 she runs, with Ella booked, and a group Jaz runs
  A.sess.sessions.k1 = { id: 'k1', kind: 'one', title: 'Keeper 1-1', coach: 'gkU', coachName: 'Gus', date: A.addDays(A.todayStr(), 2), start: '17:00', end: '18:00', cap: 1, price: 25, open: true, place: 'North Park' };
  A.sess.booked.k1 = { p1: { tid: 't1', st: 'in', by: 'gkU', at: 1 } };
  A.sess.sessions.s2 = { id: 's2', kind: 'group', title: 'Finishing', coach: 'coachU', coachName: 'Jaz', date: A.addDays(A.todayStr(), 3), start: '17:00', end: '18:00', cap: 6, price: 0, open: true, place: 'North Park' };
  A.render(); await A.flush();
  return { A, fbk };
}
const clubWrites = (fbk, from = 0) => fbk.record.writes.slice(from).map(w => w.path).filter(p => p.startsWith(OB + '/'));
const sheet = A => String(A.dom.node('#sheet').innerHTML || '');
const tabs = A => [...A.rendered('#tabbar').matchAll(/data-tab="(\w+)"/g)].map(m => m[1]).join(' ');

(async () => {
  console.log('--- a session coach\'s phone ---');
  {
    const { A, fbk } = await boot('gkU', ORG(), { name: 'Gus' });
    const asked = under(fbk, OB);
    check('she reads the teams, the games, every squad and the children\'s records', ['teams', 'matches', 'squad/t1', 'squad/t2', 'children'].every(k => asked.includes(OB + '/' + k)), true);
    check('never the members and their emails', asked.includes(OB + '/members'), false);
    check('never the access log', asked.includes(OB + '/log'), false);
    check('never the coach\'s notes', asked.some(p => p.startsWith(OB + '/coachNotes')), false);
    check('every child by name, so she knows who is booked', A.state.teams.t1.players.p1.name + ', ' + A.state.teams.t2.players.q1.name, 'Ella Fitz, Bea Quill');
    const held = JSON.stringify(A.state) + A.storage.getItem('sm.data.v1:CLUB');
    check('no email but her own', (held.match(/[\w.]+@[\w.]+/g) || []).filter(e => e !== 'gus@example.com' && !/^gkU/.test(e)).length, 0);
    check('no access log, no notes', /linked guardian|shy in goal|"rating"/.test(held), false);
    check('she is a session coach and no team\'s coach', A.isSessionCoach('gkU') + ' ' + A.isCoachAny('gkU') + ' ' + A.coachesSessions('gkU'), 'true false true');
    check('— who sees no team of her own', A.myTeams().length, 0);
    check('she offers and runs sessions', A.canOffer() + ' ' + A.canRun(A.sessAll().find(s => s.id === 'k1')) + ' ' + A.canRun(A.sessAll().find(s => s.id === 's2')), 'true true false');
    check('— and has the Sessions door alone', A.hasDoor('sessions') + ' ' + A.hasDoor('teams') + ' ' + A.defaultDoor(), 'true false sessions');
    A.ui.view = 'season'; A.render();
    check('a team\'s screen lands on her own Home, in Sessions', A.ui.view + ' ' + A.curDoor() + ' ' + tabs(A), 'shome sessions home calendar sessions messages more');
    check('— with no switch to Teams on the title row', /tbdoor/.test(A.rendered('#titlebar')), false);
    A.click({ act: 'tab', tab: 'more' });
    check('— nor on More', /data-act="door"/.test(sheet(A)), false);
    A.closeSheet();
    A.ui.view = 'games'; A.render();
    check('— the games too', A.ui.view, 'shome');
    A.ui.view = 'club'; A.render();
    check('— and Club home', A.ui.view, 'shome');
    check('her Home: her next session, Ella booked in it, New session and Offer a time', /Your next session/.test(A.rendered()) && /Keeper 1-1/.test(A.rendered()) && /data-act="sessnew"/.test(A.rendered()) && /data-act="availnew"/.test(A.rendered()), true);
    check('— and the role card says what she does here', /class="rolebar rolecard"[^>]*>[^<]*<span>You coach sessions here/.test(A.rendered()), true);
    A.click({ act: 'sessopen', id: 'k1' });
    check('her session\'s sheet names the child booked, and offers Edit', /Ella Fitz/.test(sheet(A)) && /data-act="sessedit"/.test(sheet(A)), true);
    A.closeSheet();
    A.click({ act: 'sessnew' });
    check('New session opens the form for her', /New session|<h3>/.test(sheet(A)) && /ssDate/.test(sheet(A)), true);
    A.closeSheet();
    check('she is a colleague to the admin and the coach', A.colleagues().sort().join(), 'adm,coachU');
    check('— at staffdm, the two alone', A.cidRoot(A.sdId('gkU', 'coachU')), 'staffdm');
    check('— and may write to the family of the child in her session', A.talkPartners().join(), 'mumU');
    const n = fbk.record.writes.length;
    A.click({ act: 'addplayer' }); A.click({ act: 'newmatch' });
    A.click({ act: 'rsvp', tid: 't1', k: 'g_g1', pid: 'p1', v: 'no', kind: 'game', id: 'g1' });
    A.click({ act: 'invitemake' }); A.click({ act: 'setsesscoach', uid: 'mumU' });
    await A.flush(10);
    deepEq('a squad change, a game, an answer, an invite or a role: nothing written to the club', clubWrites(fbk, n), []);
    check('her phone does not take her out of the index', fbk.record.removes.includes(OB + '/access/index/gkU'), false);
  }

  console.log('\n--- a session coach who also coaches a team keeps both doors ---');
  {
    const org = ORG();
    org.access.teams.t2.coaches = { gkU: true }; org.access.teamIndex.t2 = { gkU: 'coach' }; org.access.coachIndex.gkU = 't2';
    const { A } = await boot('gkU', org, { name: 'Gus' });
    check('both doors, opening in Teams', A.hasDoor('teams') + ' ' + A.hasDoor('sessions') + ' ' + A.defaultDoor(), 'true true teams');
    check('— and her team is hers', A.myTeams().map(t => t.id).includes('t2') && A.canEditTeam('t2'), true);
  }

  console.log('\n--- who names one ---');
  {
    const { A, fbk } = await boot('adm', ORG(), { name: 'Ada' });
    A.sheetPersonRoles('coachU');
    check('People offers the Session coach chip to an admin', /data-act="setsesscoach" data-uid="coachU" aria-pressed="false"/.test(sheet(A)), true);
    A.sheetPersonRoles('gkU');
    check('— pressed for one who is', /data-act="setsesscoach" data-uid="gkU" aria-pressed="true"/.test(sheet(A)), true);
    const n = fbk.record.writes.length;
    A.click({ act: 'setsesscoach', uid: 'coachU' }); await A.flush(10);
    const w = fbk.record.writes.slice(n).map(x => x.path);
    check('an admin names one: the role, the log before it, and the index', w.includes(OB + '/access/sessionCoaches/coachU') && w.some(p => p.startsWith(OB + '/log/')) && A.isSessionCoach('coachU'), true);
    check('— the Session coach tag on People', /Session coach<i>sessions<\/i>/.test(A.roleTags('coachU', A.teams())), true);
    A.click({ act: 'setsesscoach', uid: 'coachU' }); await A.flush(10);
    check('— and takes it away', fbk.record.removes.includes(OB + '/access/sessionCoaches/coachU') || !A.isSessionCoach('coachU'), true);
    check('an invite may name the role, for the whole club', A.INVITE_ROLES.sesscoach + ' ' + A.CLUB_ROLES.has('sesscoach'), 'Session coach true');
  }
  {
    const { A, fbk } = await boot('coachU', ORG(), { name: 'Jaz' });
    const n = fbk.record.writes.length;
    A.click({ act: 'setsesscoach', uid: 'mumU' }); await A.flush(10);
    check('a coach is refused in the handler, with nothing written', A.lastToast() + ' ' + clubWrites(fbk, n).length, 'Club admins only 0');
    A.sheetPersonRoles('mumU');
    check('— the admin\'s chips are not drawn for her', /setsesscoach/.test(sheet(A)), false);
    check('a session coach is her colleague', A.colleagues().includes('gkU') && A.sessCoaches().some(([u]) => u === 'gkU'), true);
  }

  H.summary('a session coach, a coach of no team');
})();
