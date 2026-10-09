/* A bulk import applied by the server (SERVER.md, *Backups and imports*).

   The admin's phone plans an import exactly as before (importPlan(): read
   the file, match it against the club, merge and never replace, nothing
   while an error is left). Until this it then wrote the plan itself, one
   record at a time at the depth each rule sits at (applyImport()), through
   the outbox; a season's worth is hundreds of writes, and a phone that lost
   its signal or was closed half-way left the club with half a season until
   it next opened.

   Now the phone sends the whole plan in one write, `importAsks/{code}/{uid}/
   {id}` (hers alone in the rules, and only while she is an admin of that
   club), and this applies it:

   - **She is an admin of the club as it is now**, it is not retired and not
     being moved: what the rules checked for each write, checked once here.
   - **Every write is inside the club, in a part an admin's import writes**:
     teams, a team's squad and the coach's notes on it, the roster, games,
     the club's fields, and the club's training records (sessions,
     bookings, registers, fees, plans, drills, templates and the rest).
     Never the roles or the lookup tables (access/), another club, or
     anything at the root: one write that is not is a refusal of the whole
     import, and nothing is written.
   - **In order, and all of it**: in the order the phone planned (a team
     before its games, a session before its bookings), in multi-path writes
     of a hundred records, each split in two whenever the database refuses
     one for waking too many function runs. A failure part way says so, and
     asking again finishes it: every write in a plan sets a value, so doing
     one twice changes nothing.

   The paths come from the phone already laid out for the club's tree
   (clubWrites()), and calendar writes already stamped with who made them
   (calStamp()), because those are the app's and a second copy here would
   be the one that drifts. What the server adds is the check, the order and
   the signal: once the ask has landed, a phone switched off loses nothing.

   Nothing here imports Firebase. index.js hands it `get`, `set` and
   `update` (a multi-path write at the root); test/importask.js hands it the
   fake ones. The answer is written once, and the plan taken off the ask
   with it: it carries children's names, and the ask is not where they
   live. */

const { where } = require('./club');

const ASK_TTL = 10 * 60000;
const MAX_WRITES = 20000;
const BATCH = 100;
const seg = k => typeof k === 'string' && k.length > 0 && k.length <= 200 && !/[.#$\[\]\/]/.test(k);
const okKey = k => seg(k) && k.length <= 128;
const has = (o, k) => !!(o && typeof o === 'object' && o[k] !== undefined && o[k] !== null && o[k] !== false);

/* What an import may write, below the club's own base and below
   training/{code}: the first part, and how many parts it needs at least. */
const CLUB_PARTS = {
  orgs: { teams: 2, squad: 2, coachNotes: 2, roster: 2, matches: 2, 'org/venues': 3 },
  workspaces: { teams: 2, matches: 2, 'access/org/venues': 4 }
};
const TRAINING_PARTS = ['sessions', 'booked', 'came', 'packs', 'packuse', 'fees', 'pay', 'splans', 'avail', 'away', 'practices', 'drills', 'templates'];

function allowed(p, L, code) {
  if (typeof p !== 'string' || p.length > 600) return false;
  const parts = p.split('/');
  if (!parts.every(seg)) return false;
  if (p.startsWith(`training/${code}/`)) return parts.length >= 4 && TRAINING_PARTS.includes(parts[2]);
  if (!p.startsWith(L.base + '/')) return false;
  const rel = p.slice(L.base.length + 1);
  return Object.entries(CLUB_PARTS[L.tree]).some(([head, min]) => (rel === head || rel.startsWith(head + '/')) && rel.split('/').length >= min);
}

/* A multi-path write, halved and tried again while the database says it
   wakes too many function runs. Order is kept: the first half goes first. */
async function write(env, list) {
  if (!list.length) return;
  const patch = {};
  for (const [p, v] of list) patch[p] = v;
  try { await env.update(patch); } catch (e) {
    if (list.length < 2 || !/TOO_MANY_TRIGGERS/.test(String((e && e.message) || e))) throw e;
    const mid = Math.ceil(list.length / 2);
    await write(env, list.slice(0, mid));
    await write(env, list.slice(mid));
  }
}

/* The writes as the ask carries them: a list of { p, v }, which the
   database stores as an object keyed 0, 1, 2…, and a v of null is simply
   not there. Undefined if it cannot be read as one. */
function listOf(writes) {
  const xs = Array.isArray(writes) ? writes : writes && typeof writes === 'object'
    ? Object.keys(writes).sort((a, b) => Number(a) - Number(b)).map(k => writes[k]) : null;
  if (!xs || !xs.every(x => x && typeof x === 'object' && typeof x.p === 'string')) return undefined;
  return xs.map(x => [x.p, x.v === undefined ? null : x.v]);
}

async function apply(env, code, uid, ask, now) {
  if (!okKey(code)) return { ok: false, why: 'bad' };
  const [retired, moving] = await Promise.all([env.get('retired/' + code), env.get('serverState/moving/' + code)]);
  if (retired) return { ok: false, why: 'retired' };
  if (moving) return { ok: false, why: 'moving' };
  const L = await where(env.get, code);
  if (!has(await env.get(`${L.access}/admins`), uid)) return { ok: false, why: 'admin' };
  // the phone laid the paths out for the tree it knew; a club that has moved since is planned again there
  if (ask.tree && ask.tree !== L.tree) return { ok: false, why: 'tree' };
  const list = listOf(ask.writes);
  if (!list || !list.length || list.length > MAX_WRITES) return { ok: false, why: 'bad' };
  const bad = list.find(([p]) => !allowed(p, L, code));
  if (bad) return { ok: false, why: 'outside', path: String(bad[0]).slice(0, 200) };
  /* Batches of a hundred, and a new one wherever a path is beneath (or
     above) one already in the batch: the database refuses an update that
     names both, and the later of the two must land after the earlier. */
  const parts = [];
  let cur = [];
  const near = (a, b) => a === b || a.startsWith(b + '/') || b.startsWith(a + '/');
  for (const w of list) {
    if (cur.length >= BATCH || cur.some(([q]) => near(q, w[0]))) { parts.push(cur); cur = []; }
    cur.push(w);
  }
  if (cur.length) parts.push(cur);
  let done = 0;
  try {
    for (const part of parts) {
      await write(env, part);
      done += part.length;
    }
  } catch (e) {
    return { ok: false, why: 'failed', done, of: list.length };
  }
  return { ok: true, n: list.length };
}

/* importAsks/{code}/{uid}/{id}: { at, tree, writes: [{ p, v }] }. Resolves
   to the answer, also written at its `answer`, with the plan taken off. */
async function onAsk(env, params, ask, now = Date.now()) {
  const { code, uid, id } = params || {};
  if (!okKey(code) || !okKey(uid) || !okKey(id)) return { ok: false, why: 'bad' };
  const base = `importAsks/${code}/${uid}/${id}`;
  if (await env.get(base + '/answer')) return { ok: false, why: 'answered' };
  let ans;
  if (!ask || typeof ask !== 'object' || !(Math.abs(Number(ask.at) - now) <= ASK_TTL)) ans = { ok: false, why: 'stale' };
  else {
    try { ans = await apply(env, code, uid, ask, now); } catch (e) { ans = { ok: false, why: 'failed', done: 0 }; }
  }
  await env.update({ [base + '/writes']: null, [base + '/answer']: { ...ans, at: now } });
  return ans;
}

module.exports = { onAsk, allowed, listOf, MAX_WRITES, ASK_TTL };
