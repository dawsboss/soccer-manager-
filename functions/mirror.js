/* The share pages, written by the server and nobody else (SECURITY.md,
   SEC-10; SERVER.md, "The share pages").

   A team's public pages are `public/{share}` (the season link),
   `public/{m.share}` (one game's link) and `public/{calFeed}` (the members'
   calendar feed). Phones used to write them, which meant the database rule
   had to let a phone write public/, and it could not tell a coach from any
   signed-in account for an id no club had claimed yet: anyone could publish
   a made-up fixture under the club's own address. Now only the server writes
   public/ (the rule is `.write: false`), building each page from the club as
   the app's publicDoc(), fixtureDoc() and calendarDoc() did (game.js, held
   to them item for item by test/mirror.js).

   **What wakes it.** The sideline phone writes every goal, sub and clock
   change to the club anyway, so the server hears each one when the phone
   could have published it, and more reliably: that write is in the phone's
   outbox and survives a page closed with no signal, where a publish did not.
   It wakes on the parts of a game (index.js: matches/{mid}/{part}, each part
   on its own, never the game whole), a game's answers, a player's number,
   name or whether she is active, a team's name, badge, possession setting
   and page ids, and a team's entries. A tap reads that one game, its answers
   and the team's head, and rewrites that game wherever it is; the season's
   record is worked out again only when a game is or was finished. Anything
   touching the whole team (an id made, a name or number changed) rebuilds
   every page of it from the club.

   **One at a time per team.** A sub is two writes and wakes two runs, each
   reading the game at its own moment; written in the wrong order, the page
   would keep the older. So work for a team goes through a queue at
   serverState/publish/{code}/{tid}: the first run holds it and does the
   work; a run that finds it held adds what it was woken for and leaves; the
   holder, done, takes whatever was added and goes again, reading afresh,
   until nothing is left. A holder that died is taken over after a minute.

   **Whose page is whose.** An id is the club's to write only if the server
   has it down as that team's (or that game's) page, at serverState/pages/{id}
   ({ code, kind, tid | mid }). An id nobody has a page under is claimed for
   whoever names it first; ids are random (randId()), so naming one is
   making one. A page already there and not claimed (written by a phone,
   before this) is taken on only if it is that team's (its link says so) and
   someone in shareOwners for it is that club's admin or that team's coach,
   which is what the old rule let write it. So naming another club's link,
   or somebody's My calendar address (mycal.js claims those, kind 'mine'), as
   a team's makes nothing, and changing it away takes nothing down.

   A test club (`test-` codes, or `org/sandbox`, as isSandbox() says) and a
   retired club never reach public/. Free text goes through every word of
   every player's name on the team, and a player is her shirt number, so no
   child's name reaches public/ from here.

   Nothing in here imports Firebase; index.js hands it `get`, `update`,
   `set`, `remove` and `claim` (a transaction), and the site's address
   (`site`) when it was deployed with one. */

const { where } = require('./club');
const G = require('./game');
const keys = o => Object.keys(o && typeof o === 'object' ? o : {});
const obj = o => (o && typeof o === 'object' ? o : {});
const okKey = k => typeof k === 'string' && k.length > 0 && !/[.#$\[\]\/]/.test(k);
// a public id is what the app makes: letters, digits, _ and -, as the feed checks
const okId = k => typeof k === 'string' && /^[A-Za-z0-9_-]{6,80}$/.test(k);

const SANDBOX_PREFIX = 'test-';
const PAGES = 'serverState/pages';
const QUEUE = 'serverState/publish';
const STALE = 60000;      // a holder silent this long has died
const ROUNDS = 40;        // a run gives the queue up after this many, rather than run for ever

/* The parts of a game a page carries (matches/{mid}/{part}). Anything else
   (positions while a token is dragged, the edit stamp, the plan's lock)
   wakes a run that does nothing. */
const GAME_PARTS = new Set(['goals', 'stints', 'periods', 'shots', 'events', 'poss', 'planned', 'out', 'formation',
  'currentHalf', 'ended', 'periodCount', 'periodMinutes', 'opponent', 'date', 'kickoff', 'venue', 'home', 'arrive',
  'called', 'kit', 'notes', 'teamId', 'share']);
/* A team's own fields a page carries, each with a trigger of its own */
const TEAM_FIELDS = ['share', 'calFeed', 'name', 'logo', 'possMin'];
/* The game fields My calendar's feeds carry too (index.js marks the club for them) */
const GAME_FIELDS = ['date', 'kickoff', 'called', 'venue', 'opponent'];
const PLAYER_FIELDS = ['name', 'number', 'active'];

const now = env => (env.now ? env.now() : Date.now());
const time = () => Date.now();

async function clubOf(env, params) {
  const code = params && params.code;
  if (!okKey(code)) return null;
  const L = await where(env.get, code, params.tree);
  if (String(code).startsWith(SANDBOX_PREFIX)) return null;
  const [retired, sandbox] = await Promise.all([env.get('retired/' + code), env.get(`${L.org}/sandbox`)]);
  return retired || sandbox ? null : L;
}

/* ---- whose page is whose ---- */
const sameClaim = (a, b) => !!a && !!b && a.code === b.code && a.kind === b.kind
  && (a.tid || '') === (b.tid || '') && (a.mid || '') === (b.mid || '');
const kindFits = (page, want) => want.kind === 'season' ? !page.fixture && !page.calendar && !page.mine
  : want.kind === 'feed' ? page.calendar === true && !page.mine
    : want.kind === 'game' ? page.fixture === want.mid : false;
/* A page a phone wrote before the server did, and nobody has claimed since:
   that team's, and one of its old owners this club's admin or the team's coach. */
async function legacyOk(env, L, id, page, want) {
  if (!page || typeof page !== 'object' || !kindFits(page, want)) return false;
  const tid = page.link && page.link.teamId;
  if (!okKey(tid) || (want.tid && tid !== want.tid)) return false;
  const [owners, admins, coaches] = await Promise.all([
    env.get('shareOwners/' + id), env.get(`${L.access}/admins`), env.get(`${L.access}/teams/${tid}/coaches`)]);
  return keys(owners).some(u => obj(admins)[u] || obj(coaches)[u]);
}
/* Is `id` this page's to write? 'ours' when it already was, 'new' or
   'legacy' when it has just been claimed (the page is to be built whole),
   null when it is somebody else's. */
async function ownPage(env, L, id, want) {
  if (!okId(id)) return null;
  const cur = await env.get(`${PAGES}/${id}`);
  if (cur) return sameClaim(cur, want) ? 'ours' : null;
  const page = await env.get('public/' + id);
  if (page != null && !(await legacyOk(env, L, id, page, want))) return null;
  let got = false;
  await env.claim(`${PAGES}/${id}`, c => {
    if (c == null) { got = true; return want; }
    got = sameClaim(c, want);
    return undefined;
  });
  return got ? (page != null ? 'legacy' : 'new') : null;
}
/* Take a page down: only one that is this team's or game's. */
async function takeDown(env, L, id, want) {
  if (!okId(id)) return false;
  const cur = await env.get(`${PAGES}/${id}`);
  if (cur) { if (!sameClaim(cur, want)) return false; }
  else if (!(await legacyOk(env, L, id, await env.get('public/' + id), want))) return false;
  await env.update({ ['public/' + id]: null, [`${PAGES}/${id}`]: null });
  return true;
}
/* The site's address as deployed wins, so a site that moves takes every
   page's links with it on the next write; a page from before keeps its own
   only while the server has none to give it. */
const appOf = async (env, id) => {
  if (G.okApp(env.site)) return env.site;
  const a = await env.get(`public/${id}/link/app`);
  return G.okApp(a) ? a : '';
};

/* ---- the work ---- */
async function teamHead(env, L, tid) {
  const T = L.team(tid) + '/';
  const vals = await Promise.all(TEAM_FIELDS.map(k => env.get(T + k)));
  const t = { id: tid };
  TEAM_FIELDS.forEach((k, i) => { if (vals[i] != null) t[k] = vals[i]; });
  return t;
}
const want = (code, kind, tid, mid) => (kind === 'game' ? { code, kind, mid } : { code, kind, tid });

/* Every page of a team, whole, from the club. */
async function rebuild(env, L, code, tid, t, at) {
  const [matches, answers] = await Promise.all([env.get(L.matches), env.get(`${L.base}/rsvp/${tid}`)]);
  t.events = await env.get(L.team(tid) + '/events');
  const games = Object.entries(obj(matches)).filter(([, m]) => m && m.teamId === tid).map(([id, m]) => ({ ...m, id }));
  const out = [];
  if (t.share && (await ownPage(env, L, t.share, want(code, 'season', tid)))) {
    await env.set('public/' + t.share, G.publicDoc(t, games, answers, at, await appOf(env, t.share)));
    out.push(t.share);
    for (const m of games) {
      if (!m.share || !(await ownPage(env, L, m.share, want(code, 'game', tid, m.id)))) continue;
      await env.set('public/' + m.share, G.fixtureDoc(t, m, obj(answers)['g_' + m.id], at, await appOf(env, m.share)));
      out.push(m.share);
    }
  }
  if (t.calFeed && (await ownPage(env, L, t.calFeed, want(code, 'feed', tid)))) {
    await env.set('public/' + t.calFeed, G.calendarDoc(t, games, at, await appOf(env, t.calFeed)));
    out.push(t.calFeed);
  }
  return out;
}

/* One game, wherever it is: its place on the season link (and the record,
   when it is or was finished), its own page, its line on the feed. A game
   gone, or moved to another team, comes off this team's pages. Says 'all'
   when a page needs building whole first. */
async function oneGame(env, L, code, tid, t, mid, at) {
  const [raw, answers] = await Promise.all([env.get(L.game(mid)), env.get(`${L.base}/rsvp/${tid}/g_${mid}`)]);
  const m = raw && typeof raw === 'object' && raw.teamId === tid ? { ...raw, id: mid } : null;
  const patch = {}, out = [];
  if (t.share) {
    const own = await ownPage(env, L, t.share, want(code, 'season', tid));
    // just claimed, or ours but gone (deleted by hand): built whole, never patched into a fragment
    if (own === 'new' || own === 'legacy' || (own && !(await env.get(`public/${t.share}/team`)))) return 'all';
    if (own) {
      const P = `public/${t.share}`;
      const g = m ? G.publicGame(t, m, answers, at) : null;
      const was = await env.get(`${P}/games/${mid}/status`);
      patch[`${P}/games/${mid}`] = g;
      if (was === 'done' || (g && g.status === 'done') || (!g && was != null)) {
        const games = obj(await env.get(`${P}/games`));
        if (g) games[mid] = g; else delete games[mid];
        patch[`${P}/record`] = G.record(games);
      }
      patch[`${P}/updated`] = at;
      out.push(t.share);
      if (m && m.share && (await ownPage(env, L, m.share, want(code, 'game', tid, mid)))) {
        patch[`public/${m.share}`] = G.fixtureDoc(t, m, answers, at, await appOf(env, m.share));
        out.push(m.share);
      }
    }
  }
  if (t.calFeed) {
    const own = await ownPage(env, L, t.calFeed, want(code, 'feed', tid));
    if (own === 'new' || own === 'legacy' || (own && !(await env.get(`public/${t.calFeed}/team`)))) return 'all';
    if (own) {
      patch[`public/${t.calFeed}/games/${mid}`] = m ? G.feedGame(t, m, at) : null;
      patch[`public/${t.calFeed}/updated`] = at;
      out.push(t.calFeed);
    }
  }
  if (out.length) await env.update(patch);
  return out;
}

async function work(env, L, code, tid, todo) {
  const at = now(env);
  const t = await teamHead(env, L, tid);
  if (!t.share && !t.calFeed) return [];
  if (!todo.all) {
    const players = await env.get(L.squad(tid));
    const out = [];
    for (const mid of keys(todo.games).filter(okKey)) {
      const r = await oneGame(env, L, code, tid, { ...t, players }, mid, at);
      if (r === 'all') { todo = { all: true }; break; }
      out.push(...r);
    }
    if (!todo.all) return out;
  }
  t.players = await env.get(L.squad(tid));
  return rebuild(env, L, code, tid, t, at);
}

/* The queue: hold it, or leave word with whoever does. */
const merge = (a, b) => {
  const out = {};
  if ((a && a.all) || (b && b.all)) out.all = true;
  const games = { ...obj(a && a.games), ...obj(b && b.games) };
  if (!out.all && keys(games).length) out.games = games;
  return out;
};
const empty = w => !w || (!w.all && !keys(w.games).length);
async function enqueue(env, L, code, tid, todo) {
  if (!okKey(tid) || empty(todo)) return [];
  const Q = `${QUEUE}/${code}/${tid}`;
  let mine = false;
  await env.claim(Q, cur => {
    if (cur && Number(cur.at) > time() - STALE) { mine = false; return { ...cur, want: merge(cur.want, todo) }; }
    mine = true;
    return { at: time() };
  });
  if (!mine) return [];   // whoever holds it does this too
  const out = [];
  try {
    for (let i = 0; i < ROUNDS && !empty(todo); i++) {
      out.push(...(await work(env, L, code, tid, todo)));
      let next = null;
      await env.claim(Q, cur => {
        next = cur && !empty(cur.want) ? cur.want : null;
        return next ? { at: time() } : null;
      });
      todo = next;
    }
  } catch (e) {
    await env.set(Q, null);
    throw e;
  }
  if (!empty(todo)) await env.set(Q, null);
  return [...new Set(out)];
}

/* ---- what index.js wakes ---- */

/* A team's entries changed: teams/{tid}/events, any depth. Only `events`
   and `updated` on pages that are already this team's. */
async function onEvents(env, params) {
  const L = await clubOf(env, params);
  const tid = params && params.tid;
  if (!L || !okKey(tid)) return [];
  const W = L.team(tid) + '/';
  // the players only to take their names out of what is published
  const [share, calFeed, players, events] = await Promise.all([W + 'share', W + 'calFeed', L.squad(tid), W + 'events'].map(p => env.get(p)));
  const team = { players, events };
  const at = now(env), out = [], patch = {};
  for (const [id, kind, all] of [[share, 'season', false], [calFeed, 'feed', true]]) {
    if (!okId(id)) continue;
    const own = await ownPage(env, L, id, want(params.code, kind, tid));
    if (!own) continue;
    // a page not built yet is built whole, entries and all
    if (own !== 'ours') { out.push(...(await enqueue(env, L, params.code, tid, { all: true }))); continue; }
    patch[`public/${id}/events`] = G.eventsDoc(team, all);
    patch[`public/${id}/updated`] = at;
    out.push(id);
  }
  if (keys(patch).length) await env.update(patch);
  return out;
}

/* A part of a game: matches/{mid}/{part}, before and after. */
async function onGamePart(env, params, before, after) {
  const L = await clubOf(env, params);
  const { code, mid, part } = params || {};
  if (!L || !okKey(mid) || !GAME_PARTS.has(part)) return [];
  if (part === 'share') {
    // the old link goes; the new one is built with the game below
    if (before && before !== after) await takeDown(env, L, before, want(code, 'game', null, mid));
    if (!after) return [];
  }
  if (part === 'teamId') {
    const out = [];
    if (okKey(before) && before !== after) out.push(...(await enqueue(env, L, code, before, { games: { [mid]: true } })));
    if (okKey(after)) out.push(...(await enqueue(env, L, code, after, { games: { [mid]: true } })));
    return out;
  }
  const tid = await env.get(L.game(mid) + '/teamId');
  // a game deleted is taken off by its teamId's run; a stray part with no game makes nothing
  if (!okKey(tid)) return [];
  return enqueue(env, L, code, tid, { games: { [mid]: true } });
}

/* A team's page ids, name, badge or possession setting. */
async function onTeamField(env, params, field, before, after) {
  const L = await clubOf(env, params);
  const { code, tid } = params || {};
  if (!L || !okKey(tid)) return [];
  if (field === 'share' && before && before !== after) await takeDown(env, L, before, want(code, 'season', tid));
  if (field === 'calFeed' && before && before !== after) await takeDown(env, L, before, want(code, 'feed', tid));
  return enqueue(env, L, code, tid, { all: true });
}

/* A player: her number, name or whether she plays changes every page of the
   team (numbers, and the names taken out of free text). Anything else about
   her (who her family is, the coach's view of her) changes nothing here. */
async function onPlayer(env, params, before, after) {
  const changed = PLAYER_FIELDS.some(k => JSON.stringify(obj(before)[k] ?? null) !== JSON.stringify(obj(after)[k] ?? null));
  if (!changed) return [];
  const L = await clubOf(env, params);
  if (!L) return [];
  return enqueue(env, L, params.code, params.tid, { all: true });
}

/* A game's answers (rsvp/{tid}/g_{mid}): a "not going" takes her off the
   game's list of players, as squad() does. */
async function onAnswers(env, params) {
  const { item } = params || {};
  const x = /^g_(.+)$/.exec(String(item || ''));
  if (!x || !okKey(x[1])) return [];
  const L = await clubOf(env, params);
  if (!L) return [];
  // only if it is this team's game: an answer under another team's id moves nothing
  if ((await env.get(L.game(x[1]) + '/teamId')) !== params.tid) return [];
  return enqueue(env, L, params.code, params.tid, { games: { [x[1]]: true } });
}

module.exports = {
  onEvents, onGamePart, onTeamField, onPlayer, onAnswers, ownPage, takeDown,
  GAME_PARTS, TEAM_FIELDS, GAME_FIELDS, PAGES, QUEUE
};
