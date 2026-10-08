/* Moving a club from workspaces/{code} to orgs/{code} (AUTH.md, *The move to
   `orgs/{orgId}`*, *Moving a club*). SECURITY.md's SEC-1: on the old tree
   everyone in a club reads all of it, so a parent's phone holds every child's
   name, notes and ratings and every member's email; on the new one each part
   has its own readers.

   An admin asks by writing moveRequests/{code} as herself (the rules let only
   an admin of that club write it); index.js wakes this on the create. The
   request is a claim to check, not an order: this reads the club and refuses
   unless she is one of its admins now.

   The care, because this rewrites a whole club with admin credentials:

   - **One switch, however many batches.** The database refuses a write
     that wakes more than a thousand function runs, so the club is copied
     and taken away in batches (see *in steps*, below), but which tree it is
     on changes in one small write: no phone ever sees it on both trees, or
     on neither. The old tree is kept aside at serverState/moved/{code}/{at}
     (no rule reaches serverState/, so it is the console's and the server's
     alone).
   - **Not while a game is being played.** A tracker's goal landing between
     the read and the write would be lost, so a club with a game running is
     refused and told why.
   - **Read back and compared.** Every part is read back and compared with
     what was written. Any difference puts the old tree back, takes the new
     one away, and says what differed; nothing is half moved.
   - **The lookup tables built whole on the way.** The rules on the new tree
     read them as the old ones did; a club that never grew one (a bridge
     still open on the old tree) gets it built here from where each uid
     appears, the same answer the phones and access.js give, so the move
     closes those bridges rather than carrying them over.
   - **The derived parts made on the way**: names/ (staff names for families)
     and roster/ (numbers, and names only while the club opens the roster),
     exactly as access.js keeps them afterwards.

   Nothing in here imports Firebase: index.js hands it get, set and update on
   the event's own database; test/move.js hands it the fake server. */

const { hasRole, isStaff, teamIndexWanted, linkedWanted, coachTeamOf, rosterEntry } = require('./access');

const keys = o => Object.keys(o && typeof o === 'object' ? o : {});
const has = (o, k) => !!(o && typeof o === 'object' && o[k] !== undefined && o[k] !== null && o[k] !== false);
const okKey = k => typeof k === 'string' && k.length > 0 && !/[.#$\[\]\/]/.test(k);

/* What the database would hand back: no empty objects, no nulls, arrays as
   the keyed objects they are stored as. Both sides of the comparison go
   through it, so a part that was empty is not a difference. */
function norm(v) {
  if (v === null || v === undefined) return undefined;
  if (Array.isArray(v)) v = Object.fromEntries(v.map((x, i) => [String(i), x]));
  if (typeof v !== 'object') return v;
  const out = {};
  for (const k of Object.keys(v).sort()) { const n = norm(v[k]); if (n !== undefined) out[k] = n; }
  return Object.keys(out).length ? out : undefined;
}
const same = (a, b) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));

/* A game running: its last period started and not finished, and the game not
   ended. live.js's isRunning(), on the stored game. */
function running(m) {
  if (!m || typeof m !== 'object' || m.ended) return false;
  const ps = Object.values(m.periods || {}).filter(p => p && typeof p === 'object');
  const last = ps[ps.length - 1];
  return !!(last && last.start && !last.end);
}

/* The old tree, laid out as the new one. Pure: given the same workspace it
   makes the same tree, which is what the comparison afterwards relies on. */
function layout(ws) {
  const { members, org, log, ...rest } = (ws && ws.access) || {};
  const teams = {}, squad = {}, roster = {};
  const open = !!(org && org.rosterOpen === true);
  for (const [tid, t] of Object.entries((ws && ws.teams) || {})) {
    if (!t || typeof t !== 'object') continue;
    const { players, ...team } = t;
    teams[tid] = team;
    if (players && typeof players === 'object') {
      squad[tid] = players;
      for (const [pid, p] of Object.entries(players)) {
        const r = rosterEntry(p, open);
        if (r) (roster[tid] = roster[tid] || {})[pid] = r;
      }
    }
  }
  // the facts the lookup tables are worked out from, in the shape access.js reads
  const f = { access: { ...rest, members, org }, teams: (ws && ws.teams) || {} };
  const access = { admins: rest.admins, teams: rest.teams };
  const index = { ...(rest.index || {}) };
  const everyone = new Set(keys(rest.admins));
  for (const ta of Object.values(rest.teams || {})) for (const u of [...keys(ta && ta.coaches), ...keys(ta && ta.trackers)]) everyone.add(u);
  for (const t of Object.values(f.teams)) for (const p of Object.values((t && t.players) || {}))
    for (const u of [...keys(p && p.guardians), ...keys(p && p.self)]) everyone.add(u);
  for (const u of everyone) if (okKey(u) && hasRole(f, u) && !has(index, u)) index[u] = true;
  access.index = index;
  const teamIndex = {}, teamParents = {}, teamPlayers = {}, coachIndex = {};
  for (const tid of keys(rest.teams)) { const w = teamIndexWanted(f, tid); if (keys(w).length) teamIndex[tid] = w; }
  for (const tid of keys(f.teams)) {
    const gp = linkedWanted(f, tid, 'guardians'); if (keys(gp).length) teamParents[tid] = gp;
    const sp = linkedWanted(f, tid, 'self'); if (keys(sp).length) teamPlayers[tid] = sp;
  }
  for (const u of everyone) {
    const keep = (rest.coachIndex || {})[u];
    const ok = keep && has((((rest.teams || {})[keep]) || {}).coaches, u);
    const t = ok ? keep : coachTeamOf(f, u);
    if (t) coachIndex[u] = t;
  }
  Object.assign(access, { teamIndex, teamParents, teamPlayers, coachIndex });
  const names = {};
  for (const u of everyone) {
    const n = members && members[u] && typeof members[u].name === 'string' ? members[u].name.slice(0, 80) : '';
    if (n && isStaff(f, u)) names[u] = { name: n };
  }
  // anything else a club holds at its top comes along as it is
  const other = Object.fromEntries(Object.entries(ws || {}).filter(([k]) => !['access', 'teams', 'matches', 'rsvp', 'moved'].includes(k)));
  /* Without the parts a club does not have yet (no log, no answers): the
     database's own library refuses a write with an undefined anywhere in it,
     and a club with nothing logged used to fail the whole move that way. */
  return JSON.parse(JSON.stringify({ ...other, access, org, members, log, names, teams, squad, roster, matches: ws.matches, rsvp: ws.rsvp }));
}

/* The request at moveRequests/{code}: { by, at }. Resolves to what happened,
   which is also written beside it as `result` for the admin's phone. */
/* The database refuses one write that would wake more than a thousand
   function runs (TOO_MANY_TRIGGERS), and a whole club in one write wakes a
   run for every player, practice and game it touches, on both trees. The
   first move did it in one write and was refused for any club of a real
   size. So it goes in steps, none of them visible to a phone until the one
   that matters:

   1. A marker, serverState/moving/{code}: every function that keeps a club
      in step (index.js, `quiet()`) leaves a club alone while it is there, so
      the copy is not half-updated under the move, and the old tree emptying
      is not read as everybody leaving the club.
   2. The old tree kept whole at serverState/moved/{code}/{at}.
   3. The new tree written in batches, everything but `access`. The rules
      decide which tree a club is on by whether orgs/{code}/access exists, so
      until then the club is on the old tree for every phone and every rule.
   4. Every part read back and compared. A difference: the copy is taken
      away again (in batches) and the old tree was never touched.
   5. One small write: the new tree's access in, the old tree's out, and the
      `moved` marker. From here the club is on orgs/ and nobody can write the
      old tree (its rules need the access it no longer has).
   6. The rest of the old tree taken away, in batches. A failure here leaves
      a moved club with old copies on the server; asking again finishes it.
   7. The marker removed, and My calendar's feeds told the club changed. */
const BATCH = 100;        // children per write: a player wakes at most three runs, an entry two
const GAME_BATCH = 50;    // a game wakes up to eight (its date, kick-off, called-off, place, opponent)
async function inBatches(env, base, obj, size = BATCH, value = x => x) {
  const ks = keys(obj);
  for (let i = 0; i < ks.length; i += size) {
    const patch = {};
    for (const k of ks.slice(i, i + size)) patch[`${base}/${k}`] = value(obj[k]);
    await env.update(patch);
  }
}
const gone = () => null;

/* Steps 3 and 4: the new tree without its access, then compared. */
async function copyTree(env, O, doc) {
  const { access, teams = {}, squad = {}, roster = {}, matches = {}, rsvp = {}, members = {}, names = {}, log = {}, org, ...other } = doc;
  if (org) await env.set(`${O}/org`, org);
  await inBatches(env, `${O}/members`, members);
  await inBatches(env, `${O}/names`, names);
  await inBatches(env, `${O}/log`, log, 500);
  for (const [tid, r] of Object.entries(roster)) await env.set(`${O}/roster/${tid}`, r);
  for (const [tid, ps] of Object.entries(squad)) await inBatches(env, `${O}/squad/${tid}`, ps);
  for (const [tid, t] of Object.entries(teams)) {
    const { events, ...rest } = t || {};
    await env.set(`${O}/teams/${tid}`, rest);
    await inBatches(env, `${O}/teams/${tid}/events`, events || {});
  }
  await inBatches(env, `${O}/matches`, matches, GAME_BATCH);
  for (const [tid, r] of Object.entries(rsvp)) await env.set(`${O}/rsvp/${tid}`, r);
  for (const [k, v] of Object.entries(other)) await env.set(`${O}/${k}`, v);
  const off = [];
  for (const k of Object.keys(doc)) {
    if (k === 'access') continue;
    if (!same(doc[k], await env.get(`${O}/${k}`))) off.push(k);
  }
  return off;
}

/* A club tree taken away in batches, the parts that wake runs first: each
   team's entries and players, then the games, then what is left at once. */
async function clearTree(env, base, tree, keep = []) {
  if (!tree || typeof tree !== 'object') return;
  for (const [tid, t] of Object.entries(tree.teams || {})) {
    await inBatches(env, `${base}/teams/${tid}/events`, (t && t.events) || {}, BATCH, gone);
    await inBatches(env, `${base}/teams/${tid}/players`, (t && t.players) || {}, BATCH, gone);
  }
  for (const [tid, ps] of Object.entries(tree.squad || {})) await inBatches(env, `${base}/squad/${tid}`, ps || {}, BATCH, gone);
  await inBatches(env, `${base}/teams`, tree.teams || {}, BATCH, gone);
  await inBatches(env, `${base}/matches`, tree.matches || {}, GAME_BATCH, gone);
  for (const k of Object.keys(tree)) if (!keep.includes(k)) await env.set(`${base}/${k}`, null);
  if (!keep.length) await env.set(base, null);   // nothing of it left to wake anything
}

/* Whatever goes wrong, the admin's phone hears it: an error thrown here
   would leave the request with no answer and her phone waiting for ever. */
async function onRequest(env, params, req, now = Date.now()) {
  const code = params && params.code;
  try { return await moveIt(env, params, req, now); } catch (e) {
    let state = 'Nothing was changed.';
    if (okKey(code)) {
      // before the switch: take the half-made copy away again; after it, asking again finishes
      try {
        if (await env.get(`orgs/${code}/access`)) state = 'The club has moved; ask again to finish tidying the old copy away.';
        else { await clearTree(env, `orgs/${code}`, await env.get(`orgs/${code}`)); await env.set(`serverState/moving/${code}`, null); }
      } catch (e2) { state = 'Ask again to tidy up.'; }
    }
    const result = { ok: false, why: 'The server could not move it (' + String((e && e.message) || e).slice(0, 200) + '). ' + state, at: now };
    if (okKey(code)) await Promise.resolve(env.set(`moveRequests/${code}/result`, result)).catch(() => { });
    return result;
  }
}
async function moveIt(env, params, req, now) {
  const code = params && params.code;
  const answer = async (ok, why, extra = {}) => {
    const result = { ok, why, at: now, ...extra };
    if (okKey(code)) await env.set(`moveRequests/${code}/result`, result);
    return result;
  };
  if (!okKey(code) || !req || typeof req !== 'object' || !okKey(req.by)) return answer(false, 'That request names nobody.');
  const W = 'workspaces/' + code, O = 'orgs/' + code;
  const [ws, onOrgs, retired] = await Promise.all([env.get(W), env.get(`${O}/access`), env.get('retired/' + code)]);
  if (retired) return answer(false, 'This club has been retired.');

  /* Moved, but the old tree was not all taken away (step 6 failed): an
     admin of the club as it is now asking again finishes it. */
  if (onOrgs) {
    const left = ws && typeof ws === 'object' && Object.keys(ws).some(k => k !== 'moved');
    if (!left) return answer(false, 'This club has already moved.');
    if (!has(onOrgs.admins, req.by)) return answer(false, 'Only an admin of the club can move it.');
    await env.set(`serverState/moving/${code}`, { by: req.by, at: now });
    await clearTree(env, W, ws, ['moved']);
    await env.set(`serverState/moving/${code}`, null);
    return answer(true, 'The old copy is tidied away.');
  }
  if (!ws || typeof ws !== 'object' || ws.moved || !ws.access) return answer(false, 'There is no club here to move.');
  if (!has(ws.access.admins, req.by)) return answer(false, 'Only an admin of the club can move it.');
  if (Object.values(ws.matches || {}).some(running)) return answer(false, 'A game is being played. Move the club once it has finished.');

  await env.set(`serverState/moving/${code}`, { by: req.by, at: now });
  // a copy a failed move left behind is taken away before this one starts
  const stale = await env.get(O);
  if (stale) await clearTree(env, O, stale);
  await env.set(`serverState/moved/${code}/${now}`, ws);

  const doc = layout(ws);
  const off = await copyTree(env, O, doc);
  if (off.length) {
    await clearTree(env, O, await env.get(O));
    await env.set(`serverState/moving/${code}`, null);
    return answer(false, 'The copy did not match (' + off.join(', ') + '), so nothing was moved.');
  }

  // step 5: the switch
  await env.update({ [`${O}/access`]: doc.access, [`${W}/access`]: null, [`${W}/moved`]: { to: 'orgs', at: now, by: req.by } });
  // step 6: the old tree, without its access, taken away in batches
  const { access: _a, ...rest } = ws;
  await clearTree(env, W, rest, ['moved']);
  await env.set(`serverState/moving/${code}`, null);
  if (env.touched) await Promise.resolve(env.touched(code)).catch(() => { });

  const count = o => keys(o).length;
  return answer(true, '', {
    teams: count(doc.teams), players: Object.values(doc.squad || {}).reduce((n, s) => n + count(s), 0),
    games: count(doc.matches), people: count(doc.access.index)
  });
}

module.exports = { onRequest, layout, running, norm, same, BATCH, GAME_BATCH };
