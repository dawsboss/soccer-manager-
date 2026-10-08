/* The calendar half of the share pages, kept in step by the server.

   SERVER.md, "The share pages". A team's public pages (`public/{share}`, the
   season link; `public/{m.share}`, one game's link; `public/{calFeed}`, the
   members' calendar feed) are written by the phone that made a change, a
   moment after it (schedulePublish() in app.js), and only for the team open
   on that phone. So a practice called off from a phone that then lost
   signal, picture day booked across twelve teams, a run of games added from
   All teams or an import reached the share pages and the subscribed
   calendars only when somebody next opened that team. Now a change to a
   team's calendar entries, or to a game's when or where, rewrites those
   parts of its pages from the club, whoever made it and whatever happened to
   their signal.

   Only those parts. A game's score, minutes and log change every few seconds
   while it is played and the coach's phone at the sideline is the one place
   they exist; waking the server on each would cost a function call per tap
   for nothing the phone does not already do (CLAUDE.md, push: never on a
   whole game). So the server writes:

   - `events`: every page that carries entries gets them rebuilt, as
     publicEvents() builds them: the season link the ones marked for it, the
     members' feed every one.
   - a game's when and where (opponent, date, kick-off, place, home or away,
     arrival, called off, kit, notes) wherever that game already is; and a
     game not yet on the members' feed is added there, as calendarDoc() would,
     while it has not kicked off. The season link and a game's own page get a
     new game from a coach's or admin's phone, which builds the whole of it.

   It never makes a page that does not exist (a link a coach has not turned
   on, or one she replaced, stays gone), never writes a test club's (`test-`
   codes, or `org/sandbox`, as isSandbox() says), and puts free text through
   the same scrub as pubText(): every word of every player's name on that
   team becomes "a player", so no child's name reaches public/ from here
   either. test/mirror.js holds both to the app's own publicEvents() and
   calendarDoc().

   Nothing in here imports Firebase; index.js hands it `get` and `update`. */

const { where } = require('./club');
const keys = o => Object.keys(o && typeof o === 'object' ? o : {});
const okKey = k => typeof k === 'string' && k.length > 0 && !/[.#$\[\]\/]/.test(k);
// a public id is what the app makes: letters, digits, _ and -, as the feed checks
const okId = k => typeof k === 'string' && /^[A-Za-z0-9_-]{6,80}$/.test(k);

const CAL_KIND = { practice: 'Practice', event: 'Event' };
const CALLED = { cancelled: 'Cancelled', postponed: 'Postponed' };
const HOME_AWAY = { home: 'Home', away: 'Away', neutral: 'Neutral ground' };
const SANDBOX_PREFIX = 'test-';
const okDay = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const pad2 = n => String(n).padStart(2, '0');
const hm = t => { const x = /^(\d{1,2}):(\d{2})/.exec(String(t || '')); return x ? pad2(x[1]) + ':' + x[2] : ''; };

/* replaceNames() and pubText() from app.js, word for word in what they do. */
function replaceNames(text, subs) {
  subs = subs.slice().sort((a, b) => b[0].length - a[0].length);
  for (const [from, to] of subs) {
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'giu');
    text = text.replace(re, (all, pre) => pre + to);
  }
  return text;
}
function scrubber(team) {
  const subs = [];
  for (const p of Object.values((team && team.players) || {})) {
    const full = String((p && p.name) || '').trim();
    if (!full) continue;
    subs.push([full, 'a player']);
    for (const w of full.split(/\s+/)) if (w.length >= 2) subs.push([w, 'a player']);
  }
  return s => (s ? replaceNames(String(s), subs) : '');
}

/* publicEvents(t, all) */
function eventsDoc(team, all) {
  const pub = scrubber(team), out = {};
  for (const [id, e] of Object.entries((team && team.events) || {})) {
    if (!e || !(e.public || all) || !okDay(e.date)) continue;
    const kind = e.kind === 'practice' ? 'practice' : 'event';
    out[id] = {
      kind, title: pub(e.title) || CAL_KIND[kind], date: e.date,
      start: hm(e.start), end: hm(e.end), venue: pub(e.venue), notes: pub(e.notes),
      called: CALLED[e.called] ? e.called : ''
    };
  }
  return out;
}

/* A game's when and where, as publicGame() and calendarDoc() both carry it. */
const WHEN = ['opponent', 'date', 'kickoff', 'venue', 'home', 'arrive', 'called', 'kit', 'notes'];
const GAME_READ = ['teamId', 'share', 'opponent', 'date', 'kickoff', 'venue', 'home', 'arrive', 'called', 'kit', 'notes', 'periodCount', 'periodMinutes', 'ended'];
function gameWhen(team, m) {
  const pub = scrubber(team);
  return {
    opponent: m.opponent || '', date: m.date || '', kickoff: m.kickoff || '', venue: m.venue || '',
    home: HOME_AWAY[m.home] ? m.home : '', arrive: hm(m.arrive), called: CALLED[m.called] ? m.called : '',
    kit: pub(m.kit), notes: pub(m.notes)
  };
}

const sandbox = async (env, code, L) => String(code).startsWith(SANDBOX_PREFIX)
  || !!(await env.get(`${L.org}/sandbox`));
// a page exists when it carries a team, as the feed asks; anything else is not ours to make
const pageOf = async (env, id) => {
  if (!okId(id)) return null;
  const team = await env.get(`public/${id}/team`);
  return team ? id : null;
};

/* A team's entries changed: teams/{tid}/events, any depth. */
async function onEvents(env, params, now = Date.now()) {
  const { code, tid } = params || {};
  if (!okKey(code) || !okKey(tid)) return [];
  const L = await where(env.get, code, params.tree);
  if ((await env.get('retired/' + code)) || (await sandbox(env, code, L))) return [];
  const W = L.team(tid) + '/';
  // the players only to take their names out of what is published
  const [share, calFeed, players, events] = await Promise.all([W + 'share', W + 'calFeed', L.squad(tid), W + 'events'].map(p => env.get(p)));
  const team = { players, events };
  const out = [], patch = {};
  for (const [id, all] of [[share, false], [calFeed, true]]) {
    const page = await pageOf(env, id);
    if (!page) continue;
    patch[`public/${page}/events`] = eventsDoc(team, all);
    patch[`public/${page}/updated`] = now;
    out.push(page);
  }
  if (out.length) await env.update(patch);
  return out;
}

/* A game's date, kick-off, place, opponent or called-off changed. */
async function onGame(env, params, now = Date.now()) {
  const { code, mid } = params || {};
  if (!okKey(code) || !okKey(mid)) return [];
  const L = await where(env.get, code, params.tree);
  if ((await env.get('retired/' + code)) || (await sandbox(env, code, L))) return [];
  const M = L.game(mid) + '/';
  // field by field: a game's stints and events are never read for this
  const vals = await Promise.all(GAME_READ.map(k => env.get(M + k)));
  const m = Object.fromEntries(GAME_READ.map((k, i) => [k, vals[i]]));
  /* A deleted game has no team to find its pages by; the phone that deleted
     it takes its page down (CLAUDE.md, a game link). */
  if (!okKey(m.teamId)) return [];
  const T = L.team(m.teamId) + '/';
  const [share, calFeed, players] = await Promise.all([T + 'share', T + 'calFeed', L.squad(m.teamId)].map(p => env.get(p)));
  const when = gameWhen({ players }, m);
  const out = [], patch = {};
  const put = page => {
    for (const k of WHEN) patch[`public/${page}/games/${mid}/${k}`] = when[k];
    patch[`public/${page}/updated`] = now;
    out.push(page);
  };
  for (const id of [share, m.share]) {
    const page = await pageOf(env, id);
    if (page && (await env.get(`public/${page}/games/${mid}/id`))) put(page);
  }
  const feed = await pageOf(env, calFeed);
  if (feed) {
    if (await env.get(`public/${feed}/games/${mid}/id`)) put(feed);
    else if (!m.ended && !(await env.get(M + 'periods'))) {
      // new to the feed and not kicked off: the whole of calendarDoc()'s entry for it
      patch[`public/${feed}/games/${mid}`] = {
        id: mid, ...when, status: 'upcoming', score: { us: 0, them: 0 },
        periodCount: m.periodCount || 2, periodMinutes: m.periodMinutes || 40
      };
      patch[`public/${feed}/updated`] = now;
      out.push(feed);
    }
  }
  if (out.length) await env.update(patch);
  return out;
}

const GAME_FIELDS = ['date', 'kickoff', 'called', 'venue', 'opponent'];

module.exports = { onEvents, onGame, eventsDoc, gameWhen, scrubber, GAME_FIELDS, WHEN };
