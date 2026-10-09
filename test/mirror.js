/* The share pages, written by the server and nobody else (functions/mirror.js,
   functions/game.js; SECURITY.md, SEC-10; SERVER.md, "The share pages").

   The share pages are public/: world-readable, forwarded to group chats,
   opened by the other team. Phones used to write them; now only the server
   does, from what the phones already write to the club. So this checks, in
   order: what must never reach them (a child's name in any note, a
   team-only entry on the season link, a test or retired club, a page under
   an id that is somebody else's); that a live game's score, minutes and log
   reach every page from the workspace writes alone, a goal, a sub and the
   clock each waking one run; that a new game reaches the pages and a deleted
   one, or a replaced id, takes its page down; and that every page is,
   item for item, what the app's own publicDoc(), fixtureDoc(), publicGame()
   and calendarDoc() build from the same club. */

const H = require('./harness');
const { check, deepEq } = H;
const { makeServer } = require('./fakebase');
const G = require('../functions/game');

const T0 = Date.UTC(2026, 9, 11, 9, 30);
// key order is the database's business, not the page's: compare with keys sorted
const canon = v => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map(key => [key, x[key]])) : x));
const same = (label, got, want) => check(label, canon(got), canon(want));

const SITE = 'https://x.test/index.html';
const CLUB = () => ({
  access: {
    org: { name: 'Lakeside SC' }, admins: { adm: true }, index: { adm: true, coach: true },
    teams: { t1: { coaches: { coach: true } } }
  },
  teams: {
    t1: {
      id: 't1', name: 'Flight', share: 'shareT1aaaa', calFeed: 'feedT1aaaaa', possMin: 4,
      players: {
        p1: { id: 'p1', name: 'Ella Stone', number: '7', guardians: { mum: true } },
        p2: { id: 'p2', name: 'Rosa', number: '9' },
        p3: { id: 'p3', name: 'Mae Lin', number: '3' },
        p4: { id: 'p4', name: 'Old Timer', number: '22', active: false },
        p5: { id: 'p5', name: 'Noel Park', number: '' }
      },
      events: {
        e1: { id: 'e1', kind: 'practice', title: 'Practice', date: '2026-10-14', start: '18:00', end: '19:15', venue: 'Rose Park' },
        e2: { id: 'e2', kind: 'event', title: 'Team photo', date: '2026-10-16', start: '17:00', venue: 'Clubhouse', public: true }
      }
    },
    t2: { id: 't2', name: 'Storm', share: 'shareT2aaaa', players: {}, events: {} }
  },
  matches: {
    // to come
    g1: { id: 'g1', teamId: 't1', share: 'gameG1aaaaa', opponent: 'Northgate', date: '2026-10-18', kickoff: '10:00', venue: 'Rose Park', home: 'home', periodCount: 2, periodMinutes: 30, notes: 'Rosa on snacks', createdAt: 1 },
    // being played: the first half running for ten minutes
    g2: {
      id: 'g2', teamId: 't1', share: 'gameG2aaaaa', opponent: 'Eastfield', date: '2026-10-11', kickoff: '09:00', periodCount: 2, periodMinutes: 30, currentHalf: 1, createdAt: 2,
      periods: { 0: { half: 1, start: T0 - 600000 } },
      formation: { slots: [{ id: 'a', label: 'LW', role: 'Winger' }, { id: 'b', label: 'GK', role: 'Keeper' }] },
      stints: { s1: { pid: 'p1', on: 0, slot: 'a' }, s2: { pid: 'p2', on: 0, off: 300 }, s3: { pid: 'p5', on: 301, role: 'Striker' }, s4: { pid: 'p3', on: 0, slot: 'b' } },
      goals: { k1: { t: 200, side: 'us', pid: 'p1' }, k2: { t: 400, side: 'them' } },
      shots: { h1: { t: 100, side: 'us', onTarget: false }, h2: { t: 450, side: 'them', onTarget: true } },
      events: { v1: { t: 50, side: 'us', kind: 'corner' }, v2: { t: 120, side: 'them', kind: 'foul' } },
      poss: { q1: { t: 10, to: 'us' }, q2: { t: 12, to: 'them' } },
      planned: { p1: 25, p2: 15 }, out: {}
    },
    // finished, 2-1
    g3: {
      id: 'g3', teamId: 't1', opponent: 'Westbury', date: '2026-10-04', kickoff: '09:00', periodCount: 2, periodMinutes: 30, currentHalf: 2, ended: true, createdAt: 3,
      periods: { 0: { half: 1, start: T0 - 9e6, end: T0 - 9e6 + 1800000 }, 1: { half: 2, start: T0 - 9e6 + 2400000, end: T0 - 9e6 + 4200000 } },
      stints: { s1: { pid: 'p1', on: 0, off: 3600 }, s2: { pid: 'p2', on: 0, off: 1800 }, s3: { pid: 'p3', on: 1800, off: 3600 } },
      goals: { a: { t: 100, side: 'us', pid: 'p2' }, b: { t: 2000, side: 'us' }, c: { t: 3000, side: 'them' } }
    },
    x1: { id: 'x1', teamId: 't2', opponent: 'Hill', date: '2026-10-20' }
  },
  // Mae's family said she can't make the game being played
  rsvp: { t1: { g_g2: { p3: { v: 'no', by: 'mum' } }, e_e1: { p1: { v: 'yes' } } } }
});
// the pages as a coach's phone last wrote them, before the server did
const OLD = (fixture, extra) => ({ team: { name: 'Flight' }, link: { teamId: 't1', app: SITE }, ...extra, games: {}, updated: 1, ...(fixture ? { fixture } : {}) });
const PAGES = () => ({
  shareT1aaaa: OLD(null, { events: {} }),
  gameG1aaaaa: OLD('g1'),
  feedT1aaaaa: OLD(null, { calendar: true, events: {} }),
  shareT2aaaa: { team: { name: 'Storm' }, link: { teamId: 't2' }, games: {}, events: {}, updated: 1 }
});
// who the old rule let write each page
const OWNERS = () => ({ shareT1aaaa: { coach: true }, gameG1aaaaa: { coach: true }, feedT1aaaaa: { adm: true }, shareT2aaaa: { adm: true }, gameG9aaaaa: { someone: true } });

function server(edit) {
  const club = CLUB(), pub = PAGES(), owners = OWNERS();
  if (edit) edit(club, pub, owners);
  const S = makeServer({ workspaces: { CLUB: club }, public: pub, shareOwners: owners });
  S.loadFunctions();
  return S;
}
const W = 'workspaces/CLUB/';
const P = (S, p) => S.at('public/' + p);
const has = (o, s) => JSON.stringify(o || null).toLowerCase().includes(s.toLowerCase());
const NAMES = ['Ella', 'Stone', 'Rosa', 'Mae', 'Lin', 'Timer', 'Noel'];
const named = o => NAMES.filter(n => new RegExp('\\b' + n + '\\b', 'i').test(JSON.stringify(o || null)));

(async () => {
  // the app, on the same club, for what each page must equal
  const A = H.loadApp({});
  H.clock.set(T0);
  const appOn = club => { A.state = club; A.me = { uid: 'adm', name: 'adm' }; A.appOwners = {}; return club; };
  process.env.SOCCER_SITE = SITE;

  console.log('--- the triggers that are deployed ---');
  {
    const S = server();
    const ours = Object.keys(S.triggers).filter(n => /^(mirror|publish)/.test(n) && !/Orgs$/.test(n)).sort();
    deepEq('the entries, each part of a game, the team\'s own fields, a player and a game\'s answers', ours,
      ['mirrorEvents', 'publishAnswers', 'publishGame', 'publishPlayer', 'publishTeamCalFeed', 'publishTeamLogo', 'publishTeamName', 'publishTeamPossMin', 'publishTeamShare']);
    deepEq('— each once more for a club on orgs/', Object.keys(S.triggers).filter(n => /^(mirror|publish).*Orgs$/.test(n)).map(n => n.replace(/Orgs$/, '')).sort(), ours);
    const wakes = async (p, v) => (await S.wouldWake(W + p, v)).filter(n => /^(mirror|publish)/.test(n));
    deepEq('a goal wakes one run', await wakes('matches/g2/goals/k9', { t: 500, side: 'us' }), ['publishGame']);
    deepEq('a sub, one', await wakes('matches/g2/stints/s9', { pid: 'p4', on: 500 }), ['publishGame']);
    deepEq('the clock stopping, one', await wakes('matches/g2/periods/0/end', T0), ['publishGame']);
    deepEq('a player\'s number, one', await wakes('teams/t1/players/p1/number', '8'), ['publishPlayer']);
    deepEq('a family\'s answer, one', await wakes('rsvp/t1/g_g2/p1', { v: 'no' }), ['publishAnswers']);
    const g = S.at(W + 'matches/g2');
    deepEq('the whole game saved with one goal more wakes the goals\' part alone', await wakes('matches/g2', { ...g, goals: { ...g.goals, k9: { t: 500, side: 'us' } } }), ['publishGame']);
    deepEq('a practice moved wakes the entries\' one', await wakes('teams/t1/events/e1/start', '18:30'), ['mirrorEvents']);
    const t = S.at(W + 'teams/t1');
    deepEq('the whole team saved with only its name changed wakes the name\'s', await wakes('teams/t1', { ...t, name: 'Flight FC' }), ['publishTeamName']);
    check('a write nobody publishes from wakes nothing that writes: the register', (await wakes('teams/t1/attend/e1/p1', true)).length, 0);
    S.put('serverState', null);
    const before = JSON.stringify(S.at('public'));
    await S.fire(W + 'matches/g2/positions/p1', { x: 10, y: 20 });
    check('a token dragged on the pitch rewrites nothing', JSON.stringify(S.at('public')), before);
    await S.fire(W + 'teams/t1/players/p1/guardians/dad', true);
    check('nor a family linked to a player', JSON.stringify(S.at('public')), before);
  }

  console.log('--- the pages, item for item what the app builds ---');
  {
    const S = server();
    await S.fire(W + 'teams/t1/name', 'Flight');        // nothing changed: wakes nothing
    await S.fire(W + 'teams/t1/possMin', 5);            // a team's own field: every page, whole
    const club = appOn(JSON.parse(JSON.stringify(S.at('workspaces/CLUB'))));
    const t = club.teams.t1;
    same('the season link is publicDoc()', P(S, 'shareT1aaaa'), A.publicDoc(t));
    same('a game\'s own page is fixtureDoc()', P(S, 'gameG2aaaaa'), A.fixtureDoc(t, club.matches.g2));
    same('— the game to come\'s too', P(S, 'gameG1aaaaa'), A.fixtureDoc(t, club.matches.g1));
    same('the members\' feed is calendarDoc()', P(S, 'feedT1aaaaa'), A.calendarDoc(t));
    const g = P(S, 'shareT1aaaa/games/g2');
    check('the live game is live', g.status, 'live');
    deepEq('its score', g.score, { us: 1, them: 1 });
    check('a player is her shirt number, in shirt order', g.players.map(p => p.n).join(), '7,9,–');
    check('one out by her family\'s answer is not listed, nor one who has stopped playing', g.players.some(p => p.n === '3' || p.n === '22'), false);
    deepEq('minutes to the moment the page was built', g.players.map(p => p.sec), [600, 300, 299]);
    deepEq('where each is', g.players.map(p => p.spot), ['LW', null, 'Striker']);
    deepEq('the log: a sub, by numbers only', g.log.map(r => [r.t, r.on, r.off]), [[300, '–', '9']]);
    deepEq('the season\'s record, from the finished game', P(S, 'shareT1aaaa/record'), { w: 1, d: 0, l: 0, gf: 2, ga: 1 });
    check('no child\'s name on any page', named(S.at('public')).join(), '');
    check('the coach\'s note scrubbed', P(S, 'gameG1aaaaa/games/g1/notes'), 'a player on snacks');
    check('another team\'s page is untouched', JSON.stringify(P(S, 'shareT2aaaa')), JSON.stringify(PAGES().shareT2aaaa));
    // and every one of the app's own pieces, built by the server's port
    for (const [id, m] of Object.entries(club.matches).filter(([, m]) => m.teamId === 't1'))
      same(`publicGame() for ${id}`, G.publicGame(t, { ...m, id }, ((club.rsvp.t1 || {})['g_' + id]), Date.now()), A.publicGame(t, m));
  }

  console.log('--- a live game, from the workspace writes alone ---');
  {
    const S = server();
    await S.fire(W + 'teams/t1/possMin', 5);
    const tap = async (p, v) => { H.clock.set(Date.now() + 15000); await S.fire(W + p, v); };
    await tap('matches/g2/goals/k3', { t: 615, side: 'us' });
    await tap('matches/g2/goals/k3/pid', 'p5');
    await tap('matches/g2/stints/s1/off', 640);
    await tap('matches/g2/stints/s5', { pid: 'p2', on: 641, slot: 'a' });
    await tap('matches/g2/shots/h3', { t: 650, side: 'us', onTarget: true });
    await tap('matches/g2/events/v3', { t: 655, side: 'us', kind: 'corner' });
    await tap('matches/g2/planned/p5', 20);
    await tap('rsvp/t1/g_g2/p3', null);              // Mae can make it after all
    const club = appOn(JSON.parse(JSON.stringify(S.at('workspaces/CLUB'))));
    const t = club.teams.t1;
    same('the season link\'s game is publicGame(), after every tap', P(S, 'shareT1aaaa/games/g2'), A.publicGame(t, club.matches.g2));
    same('its own page is fixtureDoc()', P(S, 'gameG2aaaaa'), A.fixtureDoc(t, club.matches.g2));
    same('the feed\'s line is calendarDoc()\'s', P(S, 'feedT1aaaaa/games/g2'), A.calendarDoc(t).games.g2);
    deepEq('the score', P(S, 'gameG2aaaaa/games/g2/score'), { us: 2, them: 1 });
    check('the scorer by number', P(S, 'gameG2aaaaa/games/g2/goals').slice(-1)[0].n, '–');
    check('a family\'s answer taken back puts her back on the list', P(S, 'gameG2aaaaa/games/g2/players').some(p => p.n === '3'), true);
    await tap('matches/g2/periods/0/end', Date.now());
    await tap('matches/g2/currentHalf', 2);
    await tap('matches/g2/periods/1', { half: 2, start: Date.now() });
    await tap('matches/g2/ended', true);
    const club2 = appOn(JSON.parse(JSON.stringify(S.at('workspaces/CLUB'))));
    same('full time: the season link is publicDoc() again, record and all', P(S, 'shareT1aaaa'), A.publicDoc(club2.teams.t1));
    deepEq('the record counts it', P(S, 'shareT1aaaa/record'), { w: 2, d: 0, l: 0, gf: 4, ga: 2 });
    check('no run left holding the queue', S.at('serverState/publish/CLUB/t1'), null);
  }

  console.log('--- two runs at once never leave a page older than the club ---');
  {
    const S = server();
    await S.fire(W + 'teams/t1/possMin', 5);
    // a run already holds the queue; this one leaves word and goes
    S.put('serverState/publish/CLUB/t1', { at: Date.now() });
    await S.fire(W + 'matches/g2/goals/k4', { t: 620, side: 'them' });
    check('a run that finds the queue held writes nothing', P(S, 'shareT1aaaa/games/g2/score/them'), 1);
    deepEq('and leaves word of what it was woken for', S.at('serverState/publish/CLUB/t1/want'), { games: { g2: true } });
    // the holder finishing its round takes the word and goes again, reading afresh
    S.put('serverState/publish/CLUB/t1', { at: Date.now() - 61000, want: { games: { g2: true } } });
    await S.fire(W + 'matches/g2/goals/k5', { t: 630, side: 'us' });
    check('a holder silent for a minute is taken over', P(S, 'shareT1aaaa/games/g2/score/them'), 2);
    check('and the page has every goal', P(S, 'shareT1aaaa/games/g2/score/us'), 2);
    check('the queue let go', S.at('serverState/publish/CLUB/t1'), null);
  }

  console.log('--- new games, deleted games, replaced links ---');
  {
    const S = server();
    await S.fire(W + 'teams/t1/possMin', 5);
    await S.fire(W + 'matches/g4', { id: 'g4', teamId: 't1', opponent: 'Hillcrest', date: '2026-10-25', kickoff: '09:30', periodCount: 2, periodMinutes: 25, createdAt: 4 });
    check('a game added from any phone is on the season link', P(S, 'shareT1aaaa/games/g4/opponent'), 'Hillcrest');
    check('and the members\' feed', P(S, 'feedT1aaaaa/games/g4/status'), 'upcoming');
    check('its own page waits for its id', P(S, 'gameG4aaaaa'), null);
    await S.fire(W + 'matches/g4/share', 'gameG4aaaaa');
    check('the id written: its own page is built', P(S, 'gameG4aaaaa/fixture'), 'g4');
    deepEq('and claimed as that game\'s', S.at('serverState/pages/gameG4aaaaa'), { code: 'CLUB', kind: 'game', mid: 'g4' });
    await S.fire(W + 'matches/g4/share', 'gameG4bbbbb');
    check('a game\'s link replaced: the old page comes down', P(S, 'gameG4aaaaa'), null);
    check('the new one is up', P(S, 'gameG4bbbbb/fixture'), 'g4');
    await S.fire(W + 'matches/g3', null);
    check('a finished game deleted comes off the season link', P(S, 'shareT1aaaa/games/g3'), null);
    deepEq('and out of the record', P(S, 'shareT1aaaa/record'), { w: 0, d: 0, l: 0, gf: 0, ga: 0 });
    check('and off the feed', P(S, 'feedT1aaaaa/games/g3'), null);
    await S.fire(W + 'matches/g4', null);
    check('a game deleted takes its own page down', P(S, 'gameG4bbbbb'), null);
    check('and nobody\'s page any more', S.at('serverState/pages/gameG4bbbbb'), null);
    await S.fire(W + 'matches/g1/teamId', 't2');
    check('a game moved to another team leaves this team\'s pages', P(S, 'shareT1aaaa/games/g1'), null);
    check('and is on the other team\'s', P(S, 'shareT2aaaa/games/g1/opponent'), 'Northgate');
    check('its own page comes with it', P(S, 'gameG1aaaaa/link/teamId'), 't2');
    await S.fire(W + 'teams/t1/share', 'shareT1bbbbb');
    check('a season link replaced: the old page comes down', P(S, 'shareT1aaaa'), null);
    check('the new one is built whole', !!P(S, 'shareT1bbbbb/games/g2') && !!P(S, 'shareT1bbbbb/record'), true);
    await S.fire(W + 'teams/t1/calFeed', 'feedT1bbbbb');
    check('a feed replaced: the old page comes down', P(S, 'feedT1aaaaa'), null);
    check('the new one is built', P(S, 'feedT1bbbbb/calendar'), true);
    S.put('public/shareT1bbbbb', null);
    await S.fire(W + 'matches/g2/goals/k8', { t: 640, side: 'us' });
    check('a page of ours deleted by hand is built whole again, not patched into a fragment', !!P(S, 'shareT1bbbbb/team/name') && !!P(S, 'shareT1bbbbb/games/g2'), true);
    await S.fire(W + 'matches/g9/date', '2026-11-01');
    check('a stray field with no game behind it makes nothing', P(S, 'feedT1bbbbb/games/g9'), null);
  }

  console.log('--- a player\'s number or name, every page ---');
  {
    const S = server();
    await S.fire(W + 'teams/t1/possMin', 5);
    await S.fire(W + 'teams/t1/players/p1/number', '11');
    check('a new shirt number is on every game', P(S, 'shareT1aaaa/games/g2/players').some(p => p.n === '11') && P(S, 'gameG2aaaaa/games/g2/goals')[0].n === '11', true);
    await S.fire(W + 'teams/t1/players/p6', { id: 'p6', name: 'Snacks', number: '4' });
    S.put(W + 'matches/g1/notes', 'Snacks brings oranges');
    await S.fire(W + 'teams/t1/players/p6/name', 'Snacks Jones');
    check('a new player\'s name is taken out of every note', P(S, 'gameG1aaaaa/games/g1/notes'), 'a player brings oranges');
  }

  console.log('--- entries: the season link carries only what was marked for it ---');
  {
    const S = server();
    await S.fire(W + 'teams/t1/possMin', 5);
    await S.fire(W + 'teams/t1/events/e1/public', true);
    check('a practice marked for the share link reaches it', !!P(S, 'shareT1aaaa/events/e1'), true);
    await S.fire(W + 'teams/t1/events/e1/public', null);
    check('and leaves it when made team-only again, whoever did it', P(S, 'shareT1aaaa/events/e1'), null);
    check('the members\' feed keeps it either way', !!P(S, 'feedT1aaaaa/events/e1'), true);
    check('the team-only entry was never on the season link\'s copy after', has(P(S, 'shareT1aaaa/events'), 'Rose Park'), false);
    await S.fire(W + 'teams/t1/events/e1/called', 'cancelled');
    check('a practice called off says so on the feed', P(S, 'feedT1aaaaa/events/e1/called'), 'cancelled');
    await S.fire(W + 'teams/t1/events/e2', null);
    check('an entry deleted goes from the season link', P(S, 'shareT1aaaa/events/e2'), null);
    check('and the feed', P(S, 'feedT1aaaaa/events/e2'), null);
    await S.fire(W + 'teams/t1/events/e3', { id: 'e3', kind: 'event', title: 'Snacks: Ella\'s family', notes: 'Rosa brings the ball, ask Stone', venue: 'Ella Stone\'s house', date: '2026-10-20', public: true });
    const e = P(S, 'shareT1aaaa/events/e3');
    check('a new entry is on the season link', !!e, true);
    check('with no child\'s name in its title, notes or place', named(e).length + named(P(S, 'feedT1aaaaa')).length, 0);
    check('each word of a name becomes "a player"', e.notes, 'a player brings the ball, ask a player');
  }
  {
    // a team whose pages the server has not built yet: an entry changed builds them whole
    const S = server((c, pub) => { delete pub.shareT1aaaa; delete pub.feedT1aaaaa; delete pub.gameG1aaaaa; });
    await S.fire(W + 'teams/t1/events/e1/start', '18:15');
    const club = appOn(JSON.parse(JSON.stringify(S.at('workspaces/CLUB'))));
    same('an id with no page yet gets the whole page', P(S, 'shareT1aaaa'), A.publicDoc(club.teams.t1));
    same('— the feed too', P(S, 'feedT1aaaaa'), A.calendarDoc(club.teams.t1));
  }

  console.log('--- whose page is whose ---');
  {
    // another club naming this club's links as its own team's
    const S = server();
    await S.fire(W + 'teams/t1/possMin', 5);
    const mine = JSON.stringify(S.at('public'));
    S.put('workspaces/RIVAL', { access: { admins: { bad: true }, index: { bad: true } }, teams: { t1: { id: 't1', name: 'Fake', players: {} } }, matches: { g2: { id: 'g2', teamId: 't1', opponent: 'Fake', date: '2026-10-11' } } });
    await S.fire('workspaces/RIVAL/teams/t1/share', 'shareT1aaaa');
    await S.fire('workspaces/RIVAL/teams/t1/calFeed', 'feedT1aaaaa');
    await S.fire('workspaces/RIVAL/matches/g2/share', 'gameG2aaaaa');
    await S.fire('workspaces/RIVAL/matches/g2/opponent', 'Cancelled — meet at the car park');
    check('another club naming a club\'s links writes nothing there', JSON.stringify(S.at('public')), mine);
    await S.fire('workspaces/RIVAL/teams/t1/share', null);
    await S.fire('workspaces/RIVAL/matches/g2/share', null);
    check('and taking them away again takes nothing down', JSON.stringify(S.at('public')), mine);
  }
  {
    // a page from before that the old rule let somebody else write
    const S = server((c, pub, owners) => { owners.shareT1aaaa = { stranger: true }; });
    await S.fire(W + 'teams/t1/possMin', 5);
    check('a page from before nobody of this club wrote is not taken on', JSON.stringify(P(S, 'shareT1aaaa')), JSON.stringify(PAGES().shareT1aaaa));
    check('nor claimed', S.at('serverState/pages/shareT1aaaa'), null);
    check('the club\'s own pages still are', S.at('serverState/pages/feedT1aaaaa/kind'), 'feed');
  }
  {
    // somebody's My calendar address named as a team's link
    const S = server((c, pub) => { pub.mFeedMum0001 = { team: { name: 'My calendar' }, mine: true, items: {}, updated: 1 }; c.teams.t1.share = 'mFeedMum0001'; });
    S.put('serverState/pages/mFeedMum0001', { kind: 'mine', uid: 'mum' });
    await S.fire(W + 'teams/t1/possMin', 5);
    check('a My calendar page is never a team\'s', P(S, 'mFeedMum0001/mine'), true);
    check('nor its games', P(S, 'mFeedMum0001/games'), null);
  }
  {
    const S = server(c => { c.access.org.sandbox = true; });
    const before = JSON.stringify(S.at('public'));
    await S.fire(W + 'teams/t1/events/e1/public', true);
    await S.fire(W + 'matches/g2/goals/k9', { t: 700, side: 'us' });
    await S.fire(W + 'teams/t1/possMin', 6);
    check('a test club never reaches public/', JSON.stringify(S.at('public')), before);
    const S2 = makeServer({ workspaces: { 'test-x': CLUB() }, public: PAGES(), shareOwners: OWNERS() });
    S2.loadFunctions();
    await S2.fire('workspaces/test-x/teams/t1/possMin', 6);
    check('nor does a test- code', JSON.stringify(S2.at('public')), before);
    const S3 = server();
    S3.put('retired/CLUB', true);
    await S3.fire(W + 'teams/t1/possMin', 6);
    await S3.fire(W + 'matches/g2/goals/k9', { t: 700, side: 'us' });
    check('nor a retired club', JSON.stringify(S3.at('public')), before);
  }
  {
    const S = server(c => { c.teams.t1.share = '../workspaces'; c.teams.t1.calFeed = 'x/y'; c.matches.g2.share = 'a.b'; });
    const tree = () => { const t = JSON.parse(JSON.stringify(S.tree)); delete t.serverState; return JSON.stringify(t); };
    const before = tree();
    await S.fire(W + 'teams/t1/possMin', 6);
    S.put(W + 'teams/t1/possMin', 4);
    await S.fire(W + 'matches/g2/goals/k9', { t: 700, side: 'us' });
    S.put(W + 'matches/g2/goals/k9', null);
    check('an id with a path in it is never followed', tree(), before);
  }

  console.log('--- the site\'s address, for calendar entries\' links back ---');
  {
    const env = require('fs').readFileSync(require('path').join(__dirname, '..', 'functions', '.env'), 'utf8');
    const site = (/^SOCCER_SITE=(.*)$/m.exec(env) || [])[1] || '';
    check('functions/.env names the site, https and index.html', G.okApp(site) && /\/index\.html$/.test(site), true);
    const S = server((c, pub) => { delete pub.feedT1aaaaa; });
    process.env.SOCCER_SITE = site;
    await S.fire(W + 'teams/t1/possMin', 6);
    check('a feed the server builds new carries it', P(S, 'feedT1aaaaa/link/app'), site);
    const r = await S.request('calendar', '/feedT1aaaaa.ics');
    check('and the calendar feed links each entry back to the app', /URL[:;][^\r\n]*dawsboss\.github\.io\/soccer-manager-\/index\.html#\/team\/t1/.test(r.body.replace(/\r\n /g, '')), true);
    process.env.SOCCER_SITE = SITE;
  }

  console.log('--- the app itself writes nothing to public/ ---');
  {
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'app.js'), 'utf8');
    check('no write to public/ or shareOwners in app.js', /(set|update|remove)\(\s*fb\.ref\(\s*fb\.db,\s*['`](public|shareOwners)\//.test(src), false);
    check('no function left to publish', /function (publishTeam|schedulePublish|feedPublish|claimShare|claimTeamIds)\b/.test(src), false);
  }

  H.summary('the share pages, written by the server');
})().catch(e => { console.error(e); process.exit(1); });
