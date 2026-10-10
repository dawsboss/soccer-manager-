/* My calendar's feed, built by the server (functions/mycal.js; SERVER.md,
   "My calendar's feed").

   A person's feed is public/: a calendar app fetches it with no account, so
   anyone holding the address reads it. And the server writes it with admin
   credentials, from every club she is in. So this checks, on the deployed
   file and the fake server:

   - what is hers is decided by her roles in each club, never by her list of
     clubs, which she can write: a bookmark to a club she has no role in adds
     nothing, and a role taken away takes that team out of her calendar on
     the next run, with no phone of hers open;
   - no child's name, in any club, and no club's code;
   - it writes only her own page: never somebody else's feed, never a team's
     share page, whatever her setting names;
   - a club that cannot be read leaves her feed as it was, rather than
     emptying it;
   - it is built a few minutes after a change, once per feed and once per
     club per run, and a game being played marks nothing;
   - and that it carries the same entries, under the same ids, as the
     phone's own myFeedDoc() did, so a calendar that subscribed before sees
     the same calendar after. */

const H = require('./harness');
const { check, deepEq } = H;
const { makeServer, orgsLayout } = require('./fakebase');
const mycal = require('../functions/mycal');

const FEED = 'mFeedMum0001', CFEED = 'mFeedCoach01';
const CLUB = () => ({
  access: {
    org: { name: 'Lakeside SC', venues: { f1: { id: 'f1', name: 'Rose Park' } } },
    admins: { adm: true },
    index: { adm: true, coach: true, mum: true, rae: true, nofeed: true },
    teams: { t1: { coaches: { coach: true } }, t2: { coaches: { adm: true } } }
  },
  teams: {
    t1: {
      id: 't1', name: 'Flight',
      players: {
        p1: { id: 'p1', name: 'Ella Stone', guardians: { mum: true } },
        p2: { id: 'p2', name: 'Rosa', guardians: { rae: true, nofeed: true } }
      },
      events: {
        e1: { id: 'e1', kind: 'practice', title: 'Practice: Ella in goal', date: '2026-10-14', start: '18:00', end: '19:15', venue: 'Rosa\'s garden' },
        e2: { id: 'e2', kind: 'event', title: 'Team photo', date: '2026-10-16', start: '17:00', called: 'cancelled' }
      }
    },
    t2: { id: 't2', name: 'Storm', players: { q1: { id: 'q1', name: 'Gia', guardians: { someone: true } } }, events: { x1: { kind: 'practice', date: '2026-10-15', start: '17:00' } } }
  },
  matches: {
    g1: { id: 'g1', teamId: 't1', opponent: 'Northgate', date: '2026-10-18', kickoff: '10:00', venue: 'Rose Park', periodCount: 2, periodMinutes: 30, stints: { s1: { pid: 'p1', start: 0 } } },
    g2: { id: 'g2', teamId: 't2', opponent: 'Eastfield', date: '2026-10-19', kickoff: '09:00' }
  }
});
const TRAINING = () => ({
  sessions: {
    s1: { id: 's1', coach: 'coach', kind: 'group', title: 'Finishing with Ella', date: '2026-10-20', start: '16:00', end: '17:00', field: 'f1', place: 'pitch 2' },
    s2: { id: 's2', coach: 'coach', kind: 'one', date: '2026-10-21', start: '16:00', end: '17:00' },
    s3: { id: 's3', coach: 'adm', kind: 'group', title: 'Rondos', date: '2026-10-22', start: '16:00', end: '17:00' }
  },
  booked: { s2: { p1: { st: 'in', tid: 't1' } }, s3: { p2: { st: 'in', tid: 't1' }, p1: { st: 'out', tid: 't1' } } },
  avail: { b1: { id: 'b1', coach: 'coach', kind: 'group', cap: 4, date: '2026-10-23', start: '17:00', end: '19:00', place: 'Rose Park' } }
});
const OTHER = () => ({
  access: { org: { name: 'Hill United' }, admins: { hadm: true }, index: { hadm: true, mum: true }, teams: { o1: { coaches: { mum: true } } } },
  teams: { o1: { id: 'o1', name: 'Hill U12', players: { r1: { id: 'r1', name: 'Kai Moon' } }, events: { h1: { kind: 'practice', title: 'Kai\'s birthday practice', date: '2026-10-17', start: '10:00', end: '11:00', venue: 'Moon Field' } } } },
  matches: {}
});
function server(edit) {
  const db = {
    workspaces: { CLUB: CLUB(), OTHER: OTHER(), ELSE: { access: { org: { name: 'Elsewhere' }, admins: { e: true }, index: { e: true } }, teams: { z1: { name: 'Z', events: { z: { kind: 'practice', date: '2026-10-15' } } } }, matches: {} } },
    training: { CLUB: TRAINING() },
    userOrgs: { mum: { CLUB: { name: 'Lakeside SC' }, OTHER: { name: 'Hill United' } }, coach: { CLUB: { name: 'Lakeside SC' } }, rae: { CLUB: {} }, nofeed: { CLUB: {} } },
    people: { mum: { set: { share: false, feed: FEED } }, coach: { set: { share: false, feed: CFEED } }, rae: { set: { share: false } } },
    shareOwners: { [FEED]: { mum: true }, [CFEED]: { coach: true }, shareT1aaaa: { adm: true, coach: true }, teamOnlyRae: { rae: true } },
    public: {
      [FEED]: { team: { name: 'My calendar' }, mine: true, link: { app: 'https://club.example/index.html' }, items: { old: { title: 'From her phone', date: '2026-10-01' } }, updated: 1 },
      shareT1aaaa: { team: { name: 'Flight' }, games: {}, events: {}, updated: 1 },
      teamOnlyRae: { team: { name: 'Flight' }, games: {}, updated: 1 }
    }
  };
  if (edit) edit(db);
  const S = makeServer(db);
  S.loadFunctions();
  return S;
}
const W = 'workspaces/CLUB/';
const feedOf = (S, id = FEED) => S.at('public/' + id);
const titles = (S, id = FEED) => Object.values((feedOf(S, id) || {}).items || {}).map(x => x.title).sort();
const NAMES = ['Ella', 'Stone', 'Rosa', 'Kai', 'Moon', 'Gia'];
const named = doc => NAMES.filter(n => JSON.stringify(doc || {}).includes(n));

(async () => {

  console.log('--- the functions that are deployed ---');
  {
    const S = server();
    check('one scheduled build', S.triggers.myCalBuild && S.triggers.myCalBuild.kind, 'schedule');
    check('every five minutes, one at a time', JSON.stringify(S.triggers.myCalBuild.opts), JSON.stringify({ schedule: 'every 5 minutes', maxInstances: 1 }));
    // serverState/myCal only: the push sender keeps notes of its own beside it
    const marks = async (p, v) => { S.put('serverState/myCal', null); await S.fire(p, v); return !!S.at('serverState/myCal'); };
    check('a practice changed marks the club', await marks(W + 'teams/t1/events/e1/start', '18:30'), true);
    check('a game moved', await marks(W + 'matches/g1/date', '2026-10-25'), true);
    check('a coach given a team', await marks(W + 'access/teams/t1/coaches/new', true), true);
    check('a family linked', await marks(W + 'teams/t1/players/p2/guardians/new', true), true);
    check('a session changed', await marks('training/CLUB/sessions/s1/start', '16:30'), true);
    check('a booking', await marks('training/CLUB/booked/s1/p1', { st: 'asked', tid: 't1' }), true);
    check('a bookable time', await marks('training/CLUB/avail/b1/off', true), true);
    check('her clubs', await marks('userOrgs/mum/ELSE', { name: 'Elsewhere' }), true);
    check('her own setting', await marks('people/mum/set/at', 2), true);
    check('a goal marks nothing', await marks(W + 'matches/g1/events/x1', { type: 'goal', t: 60 }), false);
    check('nor a sub', await marks(W + 'matches/g1/stints/s2', { pid: 'p2', start: 60 }), false);
    check('nor the clock', await marks(W + 'matches/g1/periods/0', { start: 1 }), false);
    check('nor the register', await marks(W + 'teams/t1/attend/e1/p1', true), false);
    check('nor a test club', await marks('workspaces/test-x/teams/t1/events/e1', { date: '2026-10-14' }), false);
    check('and a trigger only marks: no feed is written until the build runs', feedOf(S).items.old.title, 'From her phone');
  }

  console.log('--- what is in it: her teams, her children\'s sessions, her clubs ---');
  {
    const S = server();
    await S.fire('people/mum/set/at', 2);
    await S.tick('myCalBuild');
    const f = feedOf(S);
    check('her feed is written by the server', f.by, 'server');
    check('as a My calendar page', f.mine === true && f.team.name === 'My calendar', true);
    check('keeping the link back to the app her phone gave it', f.link.app, 'https://club.example/index.html');
    // the site moves: the deployed address wins over the one her phone gave the page
    process.env.SOCCER_SITE = 'https://moved.example/index.html';
    await S.fire('people/mum/set/at', 3);
    await S.tick('myCalBuild');
    S.put('public/' + FEED + '/by', 'phone');      // so the page is rewritten though nothing in it changed
    await S.fire('people/mum/set/at', 4);
    await S.tick('myCalBuild');
    check('a site that moves takes her feed\'s links with it', feedOf(S).link.app, 'https://moved.example/index.html');
    delete process.env.SOCCER_SITE;
    deepEq('her child\'s team, her child\'s session, and the team she coaches in another club', titles(S), [
      'Flight v Northgate', 'Flight: Practice: a player in goal', 'Flight: Team photo', 'Hill U12: a player\'s birthday practice', 'Training: 1-1 session'
    ].sort());
    check('another club\'s typed titles are there now, scrubbed with that club\'s names', titles(S).includes('Hill U12: a player\'s birthday practice'), true);
    check('no child\'s name anywhere in it', named(f).join(), '');
    check('no club\'s code', /CLUB|OTHER/.test(JSON.stringify(f)), false);
    check('the phone\'s old copy is replaced', JSON.stringify(f.items).includes('From her phone'), false);
    check('a team in the club that is not hers is not in it', titles(S).some(t => /Storm|Eastfield/.test(t)), false);
    check('nor a session another child is booked for', titles(S).some(t => /Rondos/.test(t)), false);
    const photo = Object.values(f.items).find(x => x.title === 'Flight: Team photo');
    check('called off says so', photo.called, 'cancelled');
    const game = Object.values(f.items).find(x => /Northgate/.test(x.title));
    check('a game: kick-off, length and place', [game.start, game.mins, game.venue, game.desc].join('|'), '10:00|75|Rose Park|Lakeside SC');
    const prac = Object.values(f.items).find(x => /in goal/.test(x.title));
    check('a practice\'s place scrubbed too', prac.venue, 'a player\'s garden');
  }
  {
    const S = server();
    await S.fire('people/coach/set/at', 2);
    await S.tick('myCalBuild');
    deepEq('a coach: her team, the sessions she runs, the times she offers', titles(S, CFEED), [
      'Bookable: Small group, 4 places', 'Finishing with a player', 'Flight v Northgate', 'Flight: Practice: a player in goal', 'Flight: Team photo', '1-1 session'
    ].sort());
    const s1 = Object.values(feedOf(S, CFEED).items).find(x => /Finishing/.test(x.title));
    check('a session at a field: the field\'s name and the place typed', s1.venue, 'Rose Park, pitch 2');
    check('her feed only: nobody else\'s was written', feedOf(S).items.old.title, 'From her phone');
  }

  console.log('--- a role taken away is out of her calendar on the next run ---');
  {
    const S = server();
    await S.fire('people/mum/set/at', 2);
    await S.tick('myCalBuild');
    check('her child\'s team is in it', titles(S).some(t => /^Flight/.test(t)), true);
    await S.fire(W + 'teams/t1/players/p1/guardians/mum', null);
    check('unlinked, she is out of the club (functions/access.js)', S.at(W + 'access/index/mum'), null);
    check('and its bookmark has gone', S.at('userOrgs/mum/CLUB'), null);
    await S.tick('myCalBuild');
    check('her calendar no longer has that team', titles(S).some(t => /^Flight/.test(t)), false);
    check('nor her child\'s session', titles(S).some(t => /Training/.test(t)), false);
    check('her other club is still there', titles(S).some(t => /Hill U12/.test(t)), true);
  }
  {
    const S = server();
    await S.fire('people/mum/set/at', 2);
    await S.tick('myCalBuild');
    // her bookmark is kept but her role goes: the club is read and gives nothing
    S.put('userOrgs/mum/CLUB', { name: 'Lakeside SC' });
    S.put(W + 'teams/t1/players/p1/guardians', null);
    await S.fire('userOrgs/mum/CLUB/at', 5);
    await S.tick('myCalBuild');
    check('a bookmark with no role behind it gives nothing', titles(S).some(t => /^Flight|Training/.test(t)), false);
    await S.fire('userOrgs/mum/ELSE', { name: 'Elsewhere' });
    await S.tick('myCalBuild');
    check('nor does a club she added to her own list', titles(S).some(t => /^Z/.test(t)), false);
  }

  console.log('--- built when something changes, a club read once ---');
  {
    const S = server();
    await S.fire('people/mum/set/at', 2);
    await S.fire('people/coach/set/at', 2);
    await S.tick('myCalBuild');
    const left = S.at('serverState/myCal') || {};
    check('the marks are cleared once built', Object.values(left).every(v => !v || !Object.keys(v).length), true);
    const n = S.reads.length;
    await S.tick('myCalBuild');
    check('a run with nothing marked reads only the marks', S.reads.length - n, 2);
    await S.fire(W + 'teams/t1/events/e1/start', '18:45');
    const from = S.reads.length;
    await S.tick('myCalBuild');
    const r = S.reads.slice(from);
    check('a practice moved: both feeds that carry it are rebuilt', [feedOf(S), feedOf(S, CFEED)].every(f => Object.values(f.items).some(x => x.start === '18:45')), true);
    check('the club\'s games read once for both of them', r.filter(p => p === W.replace(/\/$/, '') + '/matches').length, 1);
    check('people in the club with no feed: no page written for them', Object.keys(S.at('public')).sort().join(), [FEED, CFEED, 'shareT1aaaa', 'teamOnlyRae'].sort().join());
    const at = feedOf(S).updated;
    await S.fire(W + 'teams/t2/events/x1/start', '17:30');
    await S.tick('myCalBuild');
    check('a change to a team not in her calendar leaves her page as it was', feedOf(S).updated, at);
  }
  {
    // a mark made while a run is building stays for the next one
    const S = server();
    S.put('serverState/myCal/people/mum', 1);
    const env = {
      get: p => S.ref(p).get().then(s => s.val()),
      set: (p, v) => S.ref(p).set(v),
      claim: (p, fn) => S.ref(p).transaction(fn).then(r => !!r.committed)
    };
    const real = env.get;
    env.get = p => { if (p === 'userOrgs/mum') S.put('serverState/myCal/people/mum', 2); return real(p); };
    await mycal.run(env, Date.now());
    check('a mark made during a run is not lost', S.at('serverState/myCal/people/mum'), 2);
  }

  console.log('--- it writes her page and nobody else\'s ---');
  {
    const S = server(db => {
      db.people.rae.set.feed = FEED;                 // somebody else's feed
      db.people.nofeed = { set: { share: false, feed: 'shareT1aaaa' } };   // a team's share link
    });
    S.put('shareOwners/teamOnlyRae', { rae: true });
    const before = { mum: JSON.stringify(feedOf(S)), team: JSON.stringify(S.at('public/shareT1aaaa')) };
    await S.fire('people/rae/set/at', 3);
    await S.fire('people/nofeed/set/at', 3);
    const r = await S.tick('myCalBuild');
    check('naming another person\'s feed as hers writes nothing', JSON.stringify(feedOf(S)), before.mum);
    check('and is refused as not hers', r.rae, 'not hers');
    check('naming a team\'s share link writes nothing', JSON.stringify(S.at('public/shareT1aaaa')), before.team);
    S.put('people/rae/set/feed', 'teamOnlyRae');
    await S.fire('people/rae/set/at', 4);
    const r2 = await S.tick('myCalBuild');
    check('a page she alone claims that is not a My calendar page is left alone', r2.rae, 'not hers');
    check('untouched', S.at('public/teamOnlyRae/games') !== undefined && !S.at('public/teamOnlyRae/items'), true);
  }

  console.log('--- only the server writes public/: whose address is whose, and taking one down ---');
  {
    const S = server();
    await S.fire('people/mum/set/at', 2);
    await S.tick('myCalBuild');
    deepEq('her page from before is taken on as hers', S.at('serverState/pages/' + FEED), { kind: 'mine', uid: 'mum' });
    S.put('shareOwners', null);
    await S.fire('people/mum/set/at', 3);
    check('and kept hers with shareOwners gone', (await S.tick('myCalBuild')).mum === 'same' || feedOf(S).by === 'server', true);
    // somebody naming her address after the server has it down as hers
    S.put('people/rae/set', { share: false, feed: FEED });
    await S.fire('people/rae/set/at', 5);
    check('is refused', (await S.tick('myCalBuild')).rae, 'not hers');
    // and turning it away again takes nothing down
    await S.fire('people/rae/set', { share: false, at: 6 });
    check('turning "her" address off takes nobody else\'s page down', !!feedOf(S), true);
    // a new address: claimed for her the first time it is built
    await S.fire('people/coach/set', { share: false, at: 7, feed: 'mFreshCoach01' });
    check('the address she replaced is taken down at once', feedOf(S, CFEED), null);
    await S.tick('myCalBuild');
    check('the new one built by the server', feedOf(S, 'mFreshCoach01').by, 'server');
    deepEq('and claimed for her', S.at('serverState/pages/mFreshCoach01'), { kind: 'mine', uid: 'coach' });
    await S.fire('people/coach/set', { share: false, at: 8 });
    check('turned off: taken down', feedOf(S, 'mFreshCoach01'), null);
    check('and nobody\'s any more', S.at('serverState/pages/mFreshCoach01'), null);
    // a team's page in the same list is never hers
    S.put('serverState/pages/shareT1aaaa', { code: 'CLUB', kind: 'season', tid: 't1' });
    S.put('people/rae/set', { share: false, feed: 'shareT1aaaa' });
    await S.fire('people/rae/set/at', 9);
    check('an id the server has down as a team\'s is not hers', (await S.tick('myCalBuild')).rae, 'not hers');
  }
  {
    const S = server(db => { db.people.mum.set.feed = '../workspaces'; });
    const before = JSON.stringify([S.at('public'), S.at('workspaces')]);
    await S.fire('people/mum/set/at', 2);
    const r = await S.tick('myCalBuild');
    check('an address with a path in it is never followed', JSON.stringify([S.at('public'), S.at('workspaces')]), before);
    check('and is no feed at all', r.mum, 'no feed');
  }
  {
    const S = server(db => { delete db.public[FEED]; });
    await S.fire('people/mum/set/at', 2);
    await S.tick('myCalBuild');
    check('a feed just turned on, not yet written by her phone, is written', feedOf(S).by, 'server');
    check('with no link back it was never given', 'link' in feedOf(S), false);
  }

  console.log('--- a club that cannot be read leaves her calendar as it was ---');
  {
    const S = server();
    S.put('serverState/myCal/people/mum', 1);
    const env = {
      // the other club's games, on whichever tree this pass keeps it
      get: p => (require('./fakebase').fromOrgsPath(p) === 'workspaces/OTHER/matches' ? Promise.reject(new Error('unavailable')) : S.ref(p).get().then(s => s.val())),
      set: (p, v) => S.ref(p).set(v),
      claim: (p, fn) => S.ref(p).transaction(fn).then(r => !!r.committed)
    };
    const r = await mycal.run(env, Date.now());
    check('her feed is not rebuilt with a club missing', r.mum, 'unreadable');
    check('the copy she has stays', feedOf(S).items.old.title, 'From her phone');
    check('and she is marked to be tried again', !!S.at('serverState/myCal/people/mum'), true);
  }
  {
    const S = server(db => { db.retired = { OTHER: true }; db.workspaces.CLUB.access.org.sandbox = true; });
    await S.fire('people/mum/set/at', 2);
    await S.tick('myCalBuild');
    check('a retired club and a test club give nothing', titles(S).length, 0);
  }

  console.log('--- an end date on her address ---');
  {
    const until = Date.now() + 30 * 864e5;
    const S = server(db => { db.people.mum.set.feedUntil = until; });
    await S.fire('people/mum/set/at', 2);
    await S.tick('myCalBuild');
    check('the page carries the end date she gave it', feedOf(S).until, until);
    S.put('people/mum/set/feedUntil', null);
    await S.fire('people/mum/set/at', 3);
    await S.tick('myCalBuild');
    check('taken off, the page carries none, though nothing else changed', 'until' in feedOf(S), false);
  }
  {
    const A = H.loadApp({ storage: { 'sm.workspace': 'CLUB' } });
    A.state = CLUB(); A.appOwners = {}; A.me = { uid: 'mum', name: 'mum' };
    A.myFeedDoc(); A.you.set = { share: false, feed: FEED, feedUntil: 1234 };   // her own copy loaded first, then the setting
    check('her phone\'s copy carries it the same way', A.myFeedDoc().until, 1234);
  }

  console.log('--- the same entries, under the same ids, as her phone\'s feed ---');
  {
    const A = H.loadApp({ storage: { 'sm.workspace': 'CLUB' } });
    const club = CLUB();
    A.state = club; A.sess = { ...A.sess, ...TRAINING() }; A.appOwners = {};
    // a fan (AUTH.md, *More kinds of people*, 1) of a child booked into a session: the team is hers, the session is not
    club.teams.t1.players.p2.fans = { gran: true };
    for (const who of ['mum', 'coach', 'gran']) {
      A.me = { uid: who, name: who };
      const phone = A.myFeedDoc().items;
      const read = p => {
        const segs = p.split('/');
        let cur = { orgs: { CLUB: orgsLayout(club) }, training: { CLUB: TRAINING() } };
        for (const k of segs) cur = cur == null ? undefined : cur[k];
        return Promise.resolve(cur === undefined ? null : cur);
      };
      const server = Object.fromEntries(await mycal.clubItems(read, who, 'CLUB'));
      deepEq(`${who}: the same item ids`, Object.keys(server).sort(), Object.keys(phone).sort());
      if (who === 'gran') check('gran: her player\'s team, not his sessions', Object.keys(server).length === 3 && !Object.values(server).some(x => /Rondos/.test(x.title)), true);
      for (const k of Object.keys(phone)) {
        const a = { ...phone[k] }, b = { ...server[k] };
        deepEq(`${who}: ${a.title}`, b, a);
      }
    }
  }

  console.log('--- her busy times, for her other clubs, kept by the server ---');
  {
    // a fixed "now": these fixtures are dated, and the phone's own clock is the harness's
    const NOW = Date.UTC(2026, 9, 10, 12);
    const env = S => ({
      get: p => S.ref(p).get().then(s => s.val()),
      set: (p, v) => S.ref(p).set(v),
      claim: (p, fn) => S.ref(p).transaction(fn).then(r => !!r.committed)
    });
    const TAG = mycal.clubTag('CLUB'), TAG_O = mycal.clubTag('OTHER');
    const spans = v => Object.values((v && v.b) || {}).map(x => `${x.d} ${x.s}-${x.e}`).sort();
    const S = server(db => { db.people.mum.set.share = true; });
    S.put('serverState/myCal/people/mum', 1);
    const r = await mycal.run(env(S), NOW);
    check('a person who shares has hers written', r.busy.mum, 'written');
    const b = S.at('people/mum/busy');
    deepEq('one entry per club, under its tag, and no club code', Object.keys(b).sort(), [TAG, TAG_O].sort());
    deepEq('this club: her child\'s team\'s practice and game, her child\'s place, nothing called off, no booking out',
      spans(b[TAG]), ['2026-10-14 18:00-19:15', '2026-10-18 10:00-11:15', '2026-10-21 16:00-17:00']);
    deepEq('the club she coaches at too', spans(b[TAG_O]), ['2026-10-17 10:00-11:00']);
    check('a date and two times, nothing else: no title, no place, no name', named(b).length + /Practice|Rose|garden|Northgate|Lakeside/.test(JSON.stringify(b)), 0);
    check('each stamped', b[TAG].at, NOW);
    const r2 = await (async () => { S.put('serverState/myCal/people/mum', 2); return mycal.run(env(S), NOW + 60000); })();
    check('nothing changed: nothing rewritten, the stamp kept', [r2.busy.mum, S.at('people/mum/busy/' + TAG).at].join(), ['same', NOW].join());

    // a practice added at one club reaches the others with no phone of hers open
    await S.fire(W + 'teams/t1/events/e9', { id: 'e9', kind: 'practice', date: '2026-10-24', start: '09:00', end: '10:30' });
    await mycal.run(env(S), NOW + 120000);
    check('a practice added: hers within the next build', spans(S.at('people/mum/busy/' + TAG)).includes('2026-10-24 09:00-10:30'), true);
    await S.fire(W + 'teams/t1/events/e9/called', 'cancelled');
    await mycal.run(env(S), NOW + 180000);
    check('called off: gone again', spans(S.at('people/mum/busy/' + TAG)).includes('2026-10-24 09:00-10:30'), false);

    // the coach: the sessions she runs make her busy, the times she offers never do
    const SC = server(db => { db.people.coach.set.share = true; });
    SC.put('serverState/myCal/people/coach', 1);
    await mycal.run(env(SC), NOW);
    deepEq('a coach: her team, the sessions she runs; not her bookable times', spans(SC.at('people/coach/busy/' + TAG)),
      ['2026-10-14 18:00-19:15', '2026-10-18 10:00-11:15', '2026-10-20 16:00-17:00', '2026-10-21 16:00-17:00']);

    // taken away: her role, the club, and her word
    S.put(W + 'teams/t1/players/p1/guardians', null);
    S.put('serverState/myCal/people/mum', 3);
    await mycal.run(env(S), NOW + 240000);
    check('her child taken off the team: that club\'s busy times go', S.at('people/mum/busy/' + TAG), null);
    check('the other club\'s stay', spans(S.at('people/mum/busy/' + TAG_O)).length, 1);
    S.put('userOrgs/mum/OTHER', null);
    S.put('serverState/myCal/people/mum', 4);
    await mycal.run(env(S), NOW + 300000);
    check('a club she has left loses its entry', S.at('people/mum/busy'), null);
    const SP = server(db => { db.people.mum.set.share = true; });
    SP.put('serverState/myCal/people/mum', 1);
    await mycal.run(env(SP), NOW);
    await SP.fire('people/mum/set/share', false);
    const r3 = await mycal.run(env(SP), NOW + 60000);
    check('she turns sharing off on any phone: every one taken down on the next build', [r3.busy.mum, SP.at('people/mum/busy')].join(), ['taken down', null].join());
    const r4 = await (async () => { SP.put('serverState/myCal/people/mum', 9); return mycal.run(env(SP), NOW + 120000); })();
    check('and private stays private', [r4.busy.mum, SP.at('people/mum/busy')].join(), ['private', null].join());
    const SN = server();
    SN.put('serverState/myCal/people/mum', 1);
    await mycal.run(env(SN), NOW);
    check('private is the default: nothing written for somebody who never said yes', SN.at('people/mum/busy'), null);
  }
  {
    // each club's own copy, of her other clubs only, for its coaches and admins to read (rules.js's gap 10 closed)
    const NOW = Date.UTC(2026, 9, 10, 12);
    const TAG = mycal.clubTag('CLUB'), TAG_O = mycal.clubTag('OTHER');
    const env = S => ({ get: p => S.ref(p).get().then(s => s.val()), set: (p, v) => S.ref(p).set(v), claim: (p, fn) => S.ref(p).transaction(fn).then(r => !!r.committed) });
    const S = server(db => { db.people.mum.set.share = true; });
    S.put('serverState/myCal/people/mum', 1);
    await mycal.run(env(S), NOW);
    deepEq('this club holds her times at the other club, under its tag, and none of its own', Object.keys(S.at('training/CLUB/elsewhere/mum') || {}), [TAG_O]);
    deepEq('and the other club hers here', Object.keys(S.at('training/OTHER/elsewhere/mum') || {}), [TAG]);
    check('a club she is not in gets nothing', S.at('training/ELSE/elsewhere'), null);
    const r = await (async () => { S.put('serverState/myCal/people/mum', 2); return mycal.run(env(S), NOW + 60000); })();
    check('unchanged: not rewritten', r.busy.mum, 'same');
    await S.fire('people/mum/set/share', false);
    await mycal.run(env(S), NOW + 120000);
    check('sharing turned off: every club\'s copy goes', [S.at('training/CLUB/elsewhere/mum'), S.at('training/OTHER/elsewhere/mum')].join(), ',');
    // a role taken away: her bookmark goes with it (access.js), so the club's own run prunes her
    const S2 = server(db => { db.people.mum.set.share = true; });
    S2.put('serverState/myCal/people/mum', 1);
    await mycal.run(env(S2), NOW);
    S2.put('workspaces/OTHER/access/index/mum', null); S2.put('workspaces/OTHER/access/teams/o1/coaches/mum', null); S2.put('userOrgs/mum/OTHER', null);
    S2.put('serverState/myCal/clubs/OTHER', 5);
    await mycal.run(env(S2), NOW + 60000);
    check('out of a club: that club\'s copy of her goes on its next run', S2.at('training/OTHER/elsewhere/mum'), null);
    check('the club she is still in keeps its copy', !!S2.at('training/CLUB/elsewhere/mum'), true);
  }
  {
    // a club that cannot be read keeps what it had, and she is tried again
    const NOW = Date.UTC(2026, 9, 10, 12);
    const S = server(db => { db.people.mum.set.share = true; db.people.mum.busy = { [mycal.clubTag('OTHER')]: { at: 5, b: { b1: { d: '2026-10-17', s: '10:00', e: '11:00' } } } }; });
    S.put('serverState/myCal/people/mum', 1);
    const env = {
      get: p => (require('./fakebase').fromOrgsPath(p) === 'workspaces/OTHER/matches' ? Promise.reject(new Error('unavailable')) : S.ref(p).get().then(s => s.val())),
      set: (p, v) => S.ref(p).set(v),
      claim: (p, fn) => S.ref(p).transaction(fn).then(r => !!r.committed)
    };
    const r = await mycal.run(env, NOW);
    check('a club that could not be read: its busy times are kept as they were', S.at('people/mum/busy/' + mycal.clubTag('OTHER')).at, 5);
    check('the club that could be read is written', !!S.at('people/mum/busy/' + mycal.clubTag('CLUB')), true);
    check('and she is tried again', [r.busy.mum, !!S.at('serverState/myCal/people/mum')].join(), ['unreadable', true].join());
  }
  {
    // the same times, in the same shape, as her phone's own youPublish()
    const A = H.loadApp({ storage: { 'sm.workspace': 'CLUB' } });
    A.clock.set(Date.UTC(2026, 9, 10, 12));
    const club = CLUB();
    A.state = club; A.sess = { ...A.sess, ...TRAINING() }; A.appOwners = {};
    const read = p => {
      let cur = { orgs: { CLUB: orgsLayout(club) }, training: { CLUB: TRAINING() } };
      for (const k of p.split('/')) cur = cur == null ? undefined : cur[k];
      return Promise.resolve(cur === undefined ? null : cur);
    };
    for (const who of ['mum', 'coach']) {
      A.me = { uid: who, name: who };
      const phone = A.youBusy(A.myCalItems('all', true));
      const server = mycal.busyTimes(await mycal.clubItems(read, who, 'CLUB'), '2026-10-09');
      deepEq(`${who}: the same busy times as her phone writes`, server, phone);
    }
  }

  H.summary('My calendar\'s feed, built by the server');
})().catch(e => { console.error(e); process.exit(1); });
