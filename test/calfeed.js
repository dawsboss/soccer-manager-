/* The calendar feed: functions/calendar.js, what a phone's calendar
   subscribes to. It was a Cloudflare Worker until build 104 and this was
   test/worker.js; the checks are the same ones, against the function.

   What matters, in the order it would hurt:

   - It can only ever read public/. It runs with admin credentials, so the id
     in the address is the whole wall: anything that is not a plain id is
     refused before a read is made, and a feed must never become a way to ask
     for workspaces/{code}.
   - It carries the same ics.js the app does, byte for byte. Only functions/ is
     uploaded, so it keeps a copy; a copy that drifts would describe the same
     fixture two ways.
   - What it serves is what the app published: the members' feed has the
     practices, a game's own feed has that game, and none of them has a name.
   - A replaced or deleted link is gone (404), and a database that is down is a
     502 the calendar app will retry, not an empty calendar that wipes
     everybody's entries. */

const fs = require('fs');
const path = require('path');
const H = require('./harness');
const { check } = H;
const { makeServer } = require('./fakebase');

const ROOT = path.join(__dirname, '..');

(async () => {
  console.log('--- the feed carries the app\'s own ics.js ---');
  {
    const ics = fs.readFileSync(path.join(ROOT, 'ics.js'), 'utf8');
    let copy = null;
    try { copy = fs.readFileSync(path.join(ROOT, 'functions', 'ics.js'), 'utf8'); } catch (e) { }
    check('byte for byte — run `node functions/make.js` if not', copy === ics, true);
    check('the Cloudflare Worker is retired, not kept as a second way', fs.existsSync(path.join(ROOT, 'worker')), false);
    const cfg = fs.readFileSync(path.join(ROOT, 'firebase-config.js'), 'utf8');
    check('the site points at the function', /SOCCER_CALENDAR_FEED = 'https:\/\/us-central1-[\w-]+\.cloudfunctions\.net\/calendar'/.test(cfg), true);
  }

  /* The app's own documents, so the feed is tested against what really gets
     published rather than a hand-written guess at it. */
  const A = H.loadApp({});
  A.state = {
    teams: {
      t1: {
        id: 't1', name: 'G14 Flight', share: 'sh_flight', calFeed: 'c_flightfeed',
        players: { p1: { id: 'p1', name: 'Ella Fitzgerald', number: '7' } },
        events: {
          e1: { id: 'e1', kind: 'practice', title: 'Practice', date: '2026-09-15', start: '18:00', end: '19:15', venue: 'Lakeside Park', notes: 'Ella brings the balls' },
          e2: { id: 'e2', kind: 'event', title: 'Team photo', date: '2026-09-20', start: '09:15', public: true },
          e3: { id: 'e3', kind: 'practice', title: 'Practice', date: '2026-09-17', start: '18:00', called: 'cancelled' }
        }
      }
    },
    matches: {
      g1: { id: 'g1', teamId: 't1', share: 'f_g1game', opponent: 'Northgate', date: '2026-09-19', kickoff: '9:30', venue: 'Northgate Rec', home: 'away', kit: 'Blue', periodCount: 2, periodMinutes: 40, currentHalf: 1, periods: {}, stints: {} },
      g2: { id: 'g2', teamId: 't1', share: 'f_g2game', opponent: 'Riverside', date: '2026-09-26', kickoff: '10:00', periodCount: 2, periodMinutes: 40, currentHalf: 1, periods: {}, stints: {} }
    },
    access: {}
  };
  A.ui.teamId = 't1';
  const t = A.state.teams.t1;
  const docs = {
    sh_flight: A.publicDoc(t),
    c_flightfeed: A.calendarDoc(t),
    f_g1game: A.fixtureDoc(t, A.state.matches.g1),
    m_myfeedaddr: A.myFeedDoc()
  };

  /* The function as deployed, on the fake server, with the documents the app
     publishes sitting in public/ where the share pages read them. */
  const S = makeServer({ public: docs, workspaces: { CLUB: { access: { admins: { adm: true } }, teams: { t1: { name: 'Secret' } } } } });
  S.loadFunctions();
  const get = async (p, method = 'GET') => {
    const r = await S.request('calendar', p, method);
    return { status: r.status, headers: { get: k => r.headers[Object.keys(r.headers).find(h => h.toLowerCase() === k)] }, text: async () => String(r.body ?? '') };
  };

  console.log('\n--- only ever public/, and only a plain id ---');
  for (const bad of ['/..%2Fworkspaces%2FCLUB.ics', '/../workspaces/CLUB.ics', '/a%2Fb.ics', '/abc.ics', '/x/y.ics', '/sh_flight.json?print=pretty', '/', '/workspaces/CLUB.ics', '/sh%20flight.ics', '/sh.flight.ics']) {
    S.reads.length = 0;
    const r = await get(bad);
    check(`${bad.padEnd(34)} refused`, String(r.status) + (S.reads.length ? ' after a read' : ''), '404');
  }
  S.reads.length = 0;
  await get('/sh_flight.ics');
  check('a good id reads exactly public/{id}', S.reads.join(), 'public/sh_flight');
  check('a POST is refused', (await get('/sh_flight.ics', 'POST')).status, 405);
  {
    const src = fs.readFileSync(path.join(ROOT, 'functions', 'calendar.js'), 'utf8');
    const built = [...src.matchAll(/env\.get\(([^)]*)\)/g)].map(m => m[1].trim());
    check('the only path it ever builds is public/ and the id', built.join(), "'public/' + id");
  }

  console.log('\n--- the members\' feed ---');
  {
    const r = await get('/c_flightfeed.ics');
    const body = await r.text();
    check('served as a calendar', r.headers.get('content-type'), 'text/calendar; charset=utf-8');
    check('asks to be checked hourly', /REFRESH-INTERVAL;VALUE=DURATION:PT60M/.test(body), true);
    check('named for the team', /X-WR-CALNAME:G14 Flight/.test(body), true);
    check('every game and every entry, team-only practice included', (body.match(/BEGIN:VEVENT/g) || []).length, 5);
    check('the called-off practice is marked, not dropped', /SUMMARY:CANCELLED: G14 Flight: Practice/.test(body), true);
    check('an entry links back into the app', /URL:https:\/\/x\.test\/index\.html#\/team\/t1\/calendar/.test(body), true);
    check('no child\'s name in it', /Ella|Fitzgerald/.test(body), false);
    check('the feed document carries no players at all', JSON.stringify(docs.c_flightfeed).includes('"players"'), false);
    check('nor shirt numbers', /"n":/.test(JSON.stringify(docs.c_flightfeed)), false);
    check('an imported 9:30 kick-off is 09:30 in the feed', /DTSTART:20260919T093000/.test(body), true);
    check('without .ics on the end works too', (await get('/c_flightfeed')).status, 200);
    check('HEAD answers with no body', await (await get('/c_flightfeed.ics', 'HEAD')).text(), '');
  }

  console.log('\n--- the share link\'s feed, and a game\'s own ---');
  {
    const season = await (await get('/sh_flight.ics')).text();
    check('season: games plus what was marked for it', (season.match(/BEGIN:VEVENT/g) || []).length, 3);
    check('no team-only practice', /SUMMARY:G14 Flight: Practice/.test(season), false);
    check('links back to the share page', /URL:https:\/\/x\.test\/live\.html\?t=sh_flight#g=g1/.test(season), true);
    const one = await (await get('/f_g1game.ics')).text();
    check('a game\'s own feed has that game only', (one.match(/BEGIN:VEVENT/g) || []).length, 1);
    check('and links to that game\'s page', /URL:https:\/\/x\.test\/game\.html\?t=f_g1game&g=g1/.test(one), true);
  }

  console.log('\n--- one person\'s feed: My calendar ---');
  {
    const body = await (await get('/m_myfeedaddr.ics')).text();
    check('named My calendar', /X-WR-CALNAME:My calendar/.test(body), true);
    check('every game and entry of hers, each titled with its team', (body.match(/BEGIN:VEVENT/g) || []).length + ' ' + /SUMMARY:G14 Flight v Northgate/.test(body) + ' ' + /SUMMARY:G14 Flight: Practice/.test(body), '5 true true');
    check('the called-off practice is marked', /SUMMARY:CANCELLED: G14 Flight: Practice/.test(body), true);
    check('links back to My calendar', /URL:https:\/\/x\.test\/index\.html#\/my-calendar/.test(body), true);
    check('no child\'s name in it', /Ella|Fitzgerald/.test(body) || /Ella|Fitzgerald/.test(JSON.stringify(docs.m_myfeedaddr)), false);
  }

  console.log('\n--- gone, and down ---');
  check('a replaced link is gone', (await get('/c_oldaddress.ics')).status, 404);
  S.down();
  check('the database failing is a 502, so calendars keep what they had', (await get('/c_flightfeed.ics')).status, 502);
  S.down(false);

  H.summary('the calendar feed');
})().catch(e => { console.error(e); process.exit(1); });
