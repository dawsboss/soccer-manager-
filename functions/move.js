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

   - **One write.** The new tree, the old one replaced by a `moved` marker,
     and a copy of the old one kept aside at serverState/moved/{code}/{at}
     (no rule reaches serverState/, so it is the console's and the server's
     alone) all go in a single multi-path update, which the database applies
     whole or not at all. No phone ever sees a club on both trees, or on
     neither.
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
  return { ...other, access, org, members, log, names, teams, squad, roster, matches: ws.matches, rsvp: ws.rsvp };
}

/* The request at moveRequests/{code}: { by, at }. Resolves to what happened,
   which is also written beside it as `result` for the admin's phone. */
async function onRequest(env, params, req, now = Date.now()) {
  const code = params && params.code;
  const answer = async (ok, why, extra = {}) => {
    const result = { ok, why, at: now, ...extra };
    if (okKey(code)) await env.set(`moveRequests/${code}/result`, result);
    return result;
  };
  if (!okKey(code) || !req || typeof req !== 'object' || !okKey(req.by)) return answer(false, 'That request names nobody.');
  const W = 'workspaces/' + code;
  const [ws, onOrgs, retired] = await Promise.all([env.get(W), env.get(`orgs/${code}/access`), env.get('retired/' + code)]);
  if (retired) return answer(false, 'This club has been retired.');
  if (onOrgs) return answer(false, 'This club has already moved.');
  if (!ws || typeof ws !== 'object' || ws.moved || !ws.access) return answer(false, 'There is no club here to move.');
  if (!has(ws.access.admins, req.by)) return answer(false, 'Only an admin of the club can move it.');
  if (Object.values(ws.matches || {}).some(running)) return answer(false, 'A game is being played. Move the club once it has finished.');

  const doc = layout(ws);
  await env.update({
    [`orgs/${code}`]: doc,
    [W]: { moved: { to: 'orgs', at: now, by: req.by } },
    [`serverState/moved/${code}/${now}`]: ws
  });

  const back = await env.get(`orgs/${code}`);
  const off = Object.keys({ ...(norm(doc) || {}), ...(norm(back) || {}) }).filter(k => !same((doc || {})[k], (back || {})[k]));
  if (off.length) {
    await env.update({ [`orgs/${code}`]: null, [W]: ws });
    return answer(false, 'The copy did not match (' + off.join(', ') + '), so nothing was moved.');
  }
  const count = o => keys(o).length;
  return answer(true, '', {
    teams: count(doc.teams), players: Object.values(doc.squad).reduce((n, s) => n + count(s), 0),
    games: count(doc.matches), people: count(doc.access.index)
  });
}

module.exports = { onRequest, layout, running, norm, same };
