/* The calendar half of the share pages, kept by the server (functions/mirror.js;
   SERVER.md, "The share pages").

   The share pages are public/: world-readable, forwarded to group chats,
   opened by the other team. So what this checks first is what must never
   reach them: a child's name typed into a note, an entry a coach kept
   team-only on the season link, a test club's invented fixtures, a page the
   coach never turned on or has replaced. Then that the pages follow the
   calendar whoever changed it, and that a game being played wakes none of it.
   Last, that the server builds exactly what the app's own publicEvents() and
   calendarDoc() build, since a phone and the server both write these pages. */

const H = require('./harness');
const { check, deepEq } = H;
const { makeServer } = require('./fakebase');
const mirror = require('../functions/mirror');

const CLUB = () => ({
  access: { org: { name: 'Lakeside SC' }, admins: { adm: true }, index: { adm: true } },
  teams: {
    t1: {
      id: 't1', name: 'Flight', share: 'shareT1aaaa', calFeed: 'feedT1aaaaa',
      players: { p1: { id: 'p1', name: 'Ella Stone', number: '7' }, p2: { id: 'p2', name: 'Rosa', number: '9' } },
      events: {
        e1: { id: 'e1', kind: 'practice', title: 'Practice', date: '2026-10-14', start: '18:00', end: '19:15', venue: 'Rose Park' },
        e2: { id: 'e2', kind: 'event', title: 'Team photo', date: '2026-10-16', start: '17:00', venue: 'Clubhouse', public: true }
      }
    },
    t2: { id: 't2', name: 'Storm', share: 'shareT2aaaa', calFeed: 'feedT2aaaaa', players: {}, events: {} }
  },
  matches: {
    g1: { id: 'g1', teamId: 't1', share: 'gameG1aaaaa', opponent: 'Northgate', date: '2026-10-18', kickoff: '10:00', venue: 'Rose Park', home: 'home', periodCount: 2, periodMinutes: 30 },
    g2: { id: 'g2', teamId: 't1', opponent: 'Eastfield', date: '2026-10-11', kickoff: '09:00', periodCount: 2, periodMinutes: 30, periods: { 0: { start: 1 } }, stints: { s1: { pid: 'p1', start: 0 } } }
  }
});
// the pages as a coach's phone last wrote them, live fields and all
const LIVE = { status: 'upcoming', score: { us: 0, them: 0 }, players: [{ n: '7', sec: 0 }], goals: [], log: [] };
const PAGES = () => ({
  shareT1aaaa: { team: { name: 'Flight' }, games: { g1: { id: 'g1', opponent: 'Northgate', date: '2026-10-18', kickoff: '10:00', ...LIVE } }, events: { e2: { kind: 'event', title: 'Team photo' } }, updated: 1 },
  gameG1aaaaa: { team: { name: 'Flight' }, fixture: 'g1', games: { g1: { id: 'g1', opponent: 'Northgate', date: '2026-10-18', kickoff: '10:00', ...LIVE } }, updated: 1 },
  feedT1aaaaa: { team: { name: 'Flight' }, calendar: true, games: { g1: { id: 'g1', date: '2026-10-18', status: 'upcoming', score: { us: 0, them: 0 } } }, events: {}, updated: 1 },
  shareT2aaaa: { team: { name: 'Storm' }, games: {}, events: {}, updated: 1 }
});
function server(edit) {
  const club = CLUB(), pub = PAGES();
  if (edit) edit(club, pub);
  const S = makeServer({ workspaces: { CLUB: club }, public: pub });
  S.loadFunctions();
  return S;
}
const W = 'workspaces/CLUB/';
const P = (S, p) => S.at('public/' + p);
const has = (o, s) => JSON.stringify(o || null).toLowerCase().includes(s.toLowerCase());

(async () => {

  console.log('--- the triggers that are deployed ---');
  {
    const S = server();
    deepEq('one for a team\'s entries, one per field of a game that says when or where',
      Object.keys(S.triggers).filter(n => /^mirror/.test(n) && !/Orgs$/.test(n)).sort(),
      ['mirrorEvents', 'mirrorGameCalled', 'mirrorGameDate', 'mirrorGameKickoff', 'mirrorGameOpponent', 'mirrorGameVenue']);
    // and the same again for a club on orgs/ (functions/index.js, both())
    deepEq('— each once more for a club on orgs/', Object.keys(S.triggers).filter(n => /^mirror.*Orgs$/.test(n)).map(n => n.replace(/Orgs$/, '')).sort(),
      ['mirrorEvents', 'mirrorGameCalled', 'mirrorGameDate', 'mirrorGameKickoff', 'mirrorGameOpponent', 'mirrorGameVenue']);
    check('a practice moved wakes the entries\' one', (await S.wouldWake(W + 'teams/t1/events/e1/start', '18:30')).includes('mirrorEvents'), true);
    check('a game moved wakes its date\'s', (await S.wouldWake(W + 'matches/g1/date', '2026-10-19')).includes('mirrorGameDate'), true);
    const mine = ns => ns.filter(n => /^mirror/.test(n));
    check('a goal wakes none of it', mine(await S.wouldWake(W + 'matches/g2/events/x1', { type: 'goal', t: 60 })).length, 0);
    check('nor a sub', mine(await S.wouldWake(W + 'matches/g2/stints/s2', { pid: 'p2', start: 60 })).length, 0);
    check('nor the clock', mine(await S.wouldWake(W + 'matches/g2/periods/0/end', 2400)).length, 0);
    const g = S.at(W + 'matches/g2');
    check('nor the whole game saved with only its play changed', mine(await S.wouldWake(W + 'matches/g2', { ...g, stints: {} })).length, 0);
    check('nor the register', mine(await S.wouldWake(W + 'teams/t1/attend/e1/p1', true)).length, 0);
    check('nor a player edited', mine(await S.wouldWake(W + 'teams/t1/players/p1/number', '8')).length, 0);
  }

  console.log('--- entries: the season link carries only what was marked for it ---');
  {
    const S = server();
    await S.fire(W + 'teams/t1/events/e1/public', true);
    check('a practice marked for the share link reaches it', !!P(S, 'shareT1aaaa/events/e1'), true);
    await S.fire(W + 'teams/t1/events/e1/public', null);
    check('and leaves it when made team-only again, whoever did it', P(S, 'shareT1aaaa/events/e1'), null);
    check('the members\' feed keeps it either way', !!P(S, 'feedT1aaaaa/events/e1'), true);
    check('the team-only entry was never on the season link\'s copy after', has(P(S, 'shareT1aaaa'), 'Rose Park'), false);
    await S.fire(W + 'teams/t1/events/e1/called', 'cancelled');
    check('a practice called off says so on the feed', P(S, 'feedT1aaaaa/events/e1/called'), 'cancelled');
    await S.fire(W + 'teams/t1/events/e2', null);
    check('an entry deleted goes from the season link', P(S, 'shareT1aaaa/events/e2'), null);
    check('and the feed', P(S, 'feedT1aaaaa/events/e2'), null);
    check('the page says when it changed', P(S, 'feedT1aaaaa/updated') > 1, true);
    check('the season link\'s games are untouched', JSON.stringify(P(S, 'shareT1aaaa/games')), JSON.stringify(PAGES().shareT1aaaa.games));
    check('another team\'s page is untouched', JSON.stringify(P(S, 'shareT2aaaa')), JSON.stringify(PAGES().shareT2aaaa));
  }
  {
    const S = server();
    await S.fire(W + 'teams/t1/events/e3', { id: 'e3', kind: 'event', title: 'Snacks: Ella\'s family', notes: 'Rosa brings the ball, ask Stone', venue: 'Ella Stone\'s house', date: '2026-10-20', public: true });
    const e = P(S, 'shareT1aaaa/events/e3');
    check('a new entry is on the season link', !!e, true);
    check('with no child\'s name in its title, notes or place', ['Ella', 'Stone', 'Rosa'].some(n => has(e, n) || has(P(S, 'feedT1aaaaa'), n)), false);
    check('each word of a name becomes "a player"', e.notes, 'a player brings the ball, ask a player');
  }
  {
    const S = server((c, pub) => { delete pub.feedT1aaaaa; c.teams.t1.share = 'oldLinkGone'; });
    await S.fire(W + 'teams/t1/events/e1/public', true);
    check('a page that does not exist is never made: the feed a coach never turned on', P(S, 'feedT1aaaaa'), null);
    check('nor a link she replaced', P(S, 'oldLinkGone'), null);
    check('and the old link\'s page is not written', P(S, 'shareT1aaaa/events/e1'), null);
  }
  {
    const S = server(c => { c.access.org.sandbox = true; });
    const before = JSON.stringify(S.at('public'));
    await S.fire(W + 'teams/t1/events/e1/public', true);
    await S.fire(W + 'matches/g1/date', '2026-10-25');
    check('a test club never reaches public/', JSON.stringify(S.at('public')), before);
    const S2 = makeServer({ workspaces: { 'test-x': CLUB() }, public: PAGES() });
    S2.loadFunctions();
    await S2.fire('workspaces/test-x/teams/t1/events/e1/public', true);
    check('nor does a test- code', JSON.stringify(S2.at('public')), before);
    const S3 = server();
    S3.put('retired/CLUB', true);
    await S3.fire(W + 'teams/t1/events/e1/public', true);
    check('nor a retired club', JSON.stringify(S3.at('public')), before);
  }
  {
    const S = server(c => { c.teams.t1.share = '../workspaces'; c.teams.t1.calFeed = 'x/y'; });
    const tree = () => { const t = JSON.parse(JSON.stringify(S.tree)); delete t.serverState; return JSON.stringify(t); };
    const before = tree();
    await S.fire(W + 'teams/t1/events/e1/public', true);
    S.put(W + 'teams/t1/events/e1/public', null);
    check('a share id with a path in it is never followed', tree(), before);
  }

  console.log('--- games: when and where, never the play ---');
  {
    const S = server();
    await S.fire(W + 'matches/g1/kickoff', '11:30');
    for (const [label, id] of [['season link', 'shareT1aaaa'], ['game\'s own page', 'gameG1aaaaa'], ['members\' feed', 'feedT1aaaaa']])
      check(`a game moved: the ${label} has the new time`, P(S, id + '/games/g1/kickoff'), '11:30');
    deepEq('and its score, players and log as the coach\'s phone left them', ['score', 'players', 'goals', 'log'].map(k => P(S, 'shareT1aaaa/games/g1/' + k)), ['score', 'players', 'goals', 'log'].map(k => LIVE[k]));
    await S.fire(W + 'matches/g1/called', 'postponed');
    check('called off, on every page', [P(S, 'shareT1aaaa/games/g1/called'), P(S, 'gameG1aaaaa/games/g1/called'), P(S, 'feedT1aaaaa/games/g1/called')].join(), 'postponed,postponed,postponed');
    S.put(W + 'matches/g1/notes', 'Ella Stone has the oranges');
    await S.fire(W + 'matches/g1/venue', 'Rose Park 2');
    check('notes ride along with any change, scrubbed', P(S, 'gameG1aaaaa/games/g1/notes'), 'a player has the oranges');
  }
  {
    const S = server();
    await S.fire(W + 'matches/g3', { id: 'g3', teamId: 't1', opponent: 'Westbury', date: '2026-10-25', kickoff: '09:30', periodCount: 2, periodMinutes: 25, createdAt: 1 });
    check('a game added from another phone is on the members\' feed', P(S, 'feedT1aaaaa/games/g3/opponent'), 'Westbury');
    check('not yet on the season link, which a coach\'s phone writes whole', P(S, 'shareT1aaaa/games/g3'), null);
    await S.fire(W + 'matches/g2/venue', 'Away ground');
    check('a game already kicked off is not added to the feed as upcoming', P(S, 'feedT1aaaaa/games/g2'), null);
    await S.fire(W + 'matches/g1', null);
    check('a game deleted: nothing for the server to find its pages by, so they are left to the phone', !!P(S, 'gameG1aaaaa'), true);
    await S.fire(W + 'matches/g9/date', '2026-11-01');
    check('a stray field with no game behind it makes nothing', P(S, 'feedT1aaaaa/games/g9'), null);
  }

  console.log('--- the same pages the phones write ---');
  {
    const A = H.loadApp({});
    const club = CLUB();
    club.teams.t1.events.e3 = { id: 'e3', kind: 'practice', title: 'Ella\'s first session', date: '2026-10-21', start: '7:5', venue: 'Rosa\'s field', notes: 'Bring water', called: 'cancelled', public: true };
    club.teams.t1.events.e4 = { id: 'e4', kind: 'party', date: 'someday' };
    club.matches.g1.notes = 'Rosa on snacks'; club.matches.g1.arrive = '9:15'; club.matches.g1.called = 'nonsense';
    A.state = club; A.me = { uid: 'adm', name: 'adm' }; A.appOwners = {};
    const t = club.teams.t1;
    deepEq('the season link\'s entries', mirror.eventsDoc(t, false), A.publicEvents(t, false));
    deepEq('the members\' feed\'s entries', mirror.eventsDoc(t, true), A.publicEvents(t, true));
    const want = A.calendarDoc(t).games.g1;
    const got = { id: 'g1', ...mirror.gameWhen(t, club.matches.g1), status: 'upcoming', score: { us: 0, them: 0 }, periodCount: 2, periodMinutes: 30 };
    deepEq('a game on the feed, as calendarDoc() builds it', got, want);
    const pg = A.publicGame(t, club.matches.g1);
    deepEq('and its when and where as publicGame() builds it', Object.fromEntries(mirror.WHEN.map(k => [k, pg[k]])), mirror.gameWhen(t, club.matches.g1));
  }

  H.summary('the calendar half of the share pages, kept by the server');
})().catch(e => { console.error(e); process.exit(1); });
