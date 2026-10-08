/* The lookup tables the rules read, kept true the moment a role changes.

   SERVER.md, "The lookup tables the rules read". The rules cannot iterate, so
   five flat tables answer their questions in one hop (CLAUDE.md, "Five flat
   lookup tables"): access/index, teamIndex, teamParents, teamPlayers and
   coachIndex. Each is derived from where a uid appears, and until now only an
   admin's or a coach's phone rebuilt them, on connect (syncIndex() and its
   siblings in app.js). Between a change and that phone's next connect the
   table was stale: a parent the coach unlinked kept reading the team's
   notices until somebody with the right role opened the app (rules.js, gap
   5). Now a trigger on every place a role lives recomputes the entries that
   change could have touched, from what the club holds now.

   Nothing in here imports Firebase. index.js hands it `get`, `set` and
   `remove` on the database the event came from; test/access.js hands it the
   fake server.

   The care, because this writes with admin credentials and the rules never
   see it:

   - **What is there now, never what the event says.** Cloud Functions may
     deliver events late, twice or out of order. Every run reads the club's
     current roles and writes what they say, so whichever run is last leaves
     the tables right, and a run for a removal that arrives after the role was
     given back finds the role and keeps the entry.
   - **The same answer the phones give.** The same sources (admins, a team's
     coaches and trackers, a player's guardians and self) and the same values
     (`'coach'` wins over `'tracker'`; a parent's and a player's entry is a
     player id that really lists her; coachIndex names a team she coaches,
     the first by id, and is left alone while the one it names stays true).
     So a phone and the server never fight over an entry, and the phones go
     on doing it too, for a club whose functions are not deployed.
   - **Never close a bridge.** The rules fall back to the old club-wide
     behaviour while teamIndex or teamParents is missing (CLAUDE.md, "A rule
     that needs a node which may not exist yet carries a bridge"), and treat a
     club with no access/index at all as one still being made. One entry
     written for one team would end that fallback for every other team at
     once, so a table that does not exist yet is left for an admin's phone to
     build whole. coachIndex and teamPlayers carry no bridge and are written
     whenever they are owed.
   - **An index entry is never rewritten while it is there.** Its value may be
     the invite id that granted it, or the team a coach approved a claim to,
     and the rule checked that when it was written. Everything reads only
     whether it is there (CLAUDE.md, "A role entry's value is not always
     true"), so a missing entry becomes `true` and a present one is kept.
   - **Only the people the change was about.** A run recomputes the uids in
     the before and after of what changed, never the whole club, so a club's
     other members are never touched by somebody else's change.

   Taking someone's last role away also takes away her bookmark to the club
   (`userOrgs/{uid}/{code}`) and the invite her entry named, as syncIndex()
   does; giving her the first one writes the bookmark if she has none, so a
   second phone of hers finds the club without waiting for the first
   (SERVER.md, "Which clubs an account is in"). */

const keys = o => Object.keys(o && typeof o === 'object' ? o : {});
const has = (o, k) => !!(o && typeof o === 'object' && o[k] !== undefined && o[k] !== null && o[k] !== false);
const same = (a, b) => JSON.stringify(a || null) === JSON.stringify(b || null);
// a database key: no path tricks from an id somebody typed
const okKey = k => typeof k === 'string' && k.length > 0 && !/[.#$\[\]\/]/.test(k);

/* Everything this needs about one club, read once per event. Teams are read
   whole because a uid's roles can be on any team's squad; role changes are
   rare (an invite, a coach changing a parent), never the game-day writes. */
async function clubFacts(env, code) {
  const W = 'workspaces/' + code;
  const [retired, access, teams] = await Promise.all([
    env.get('retired/' + code),
    env.get(W + '/access'),
    env.get(W + '/teams')
  ]);
  return { retired: !!retired, access: access || {}, teams: teams || {} };
}
const squad = (f, tid) => ((f.teams[tid] || {}).players) || {};
const teamAcc = (f, tid) => ((f.access.teams || {})[tid]) || {};

/* hasAnyRole() in app.js, against the server's copy. */
function hasRole(f, uid) {
  if (has(f.access.admins, uid)) return true;
  for (const ta of Object.values(f.access.teams || {}))
    if (has(ta && ta.coaches, uid) || has(ta && ta.trackers, uid)) return true;
  for (const t of Object.values(f.teams))
    for (const p of Object.values((t && t.players) || {}))
      if (p && (has(p.guardians, uid) || has(p.self, uid))) return true;
  return false;
}

/* What each table should say, as the phones work it out. */
function teamIndexWanted(f, tid) {
  const ta = teamAcc(f, tid), want = {};
  for (const u of keys(ta.trackers)) if (has(ta.trackers, u)) want[u] = 'tracker';
  for (const u of keys(ta.coaches)) if (has(ta.coaches, u)) want[u] = 'coach';   // coach wins
  return want;
}
// parentsWanted() and playersWanted(): the first player listing her, in squad order
function linkedWanted(f, tid, field) {
  const want = {};
  for (const [pid, p] of Object.entries(squad(f, tid)))
    for (const u of keys(p && p[field])) if (has(p[field], u) && !want[u]) want[u] = pid;
  return want;
}
function coachTeamOf(f, uid) {
  return keys(f.access.teams).sort().find(tid => has(teamAcc(f, tid).coaches, uid)) || null;
}

/* Bring one per-team table (teamParents or teamPlayers) for one team into
   line, entry by entry. An entry still naming a player who lists her is kept
   even if another would be first, as syncTeamParents() keeps it. */
async function syncLinked(env, f, code, table, field, tid, out) {
  const all = f.access[table];
  if (table === 'teamParents' && !all) return;   // the bridge: an admin's phone builds it whole
  const now = (all || {})[tid] || {};
  const want = linkedWanted(f, tid, field);
  const holds = (u, pid) => has((squad(f, tid)[pid] || {})[field], u);
  const base = `workspaces/${code}/access/${table}/${tid}/`;
  for (const [u, pid] of Object.entries(want))
    if (!now[u] || !holds(u, now[u])) { await env.set(base + u, pid); out.push('set ' + table + '/' + tid + '/' + u); }
  for (const u of keys(now))
    if (!want[u]) { await env.remove(base + u); out.push('del ' + table + '/' + tid + '/' + u); }
}

async function syncTeamIndex(env, f, code, tid, out) {
  if (!f.access.teamIndex) return;   // the bridge, as above
  const now = f.access.teamIndex[tid] || null;
  const want = teamIndexWanted(f, tid);
  if (same(now, keys(want).length ? want : null)) return;
  const p = `workspaces/${code}/access/teamIndex/${tid}`;
  if (keys(want).length) { await env.set(p, want); out.push('set teamIndex/' + tid); }
  else { await env.remove(p); out.push('del teamIndex/' + tid); }
}

async function syncCoachIndex(env, f, code, uid, out) {
  const now = (f.access.coachIndex || {})[uid] || null;
  // any team she coaches will do, so only rewrite it once the one it names stops being true
  if (now && has(teamAcc(f, now).coaches, uid)) return;
  const want = coachTeamOf(f, uid);
  if (want === now) return;
  const p = `workspaces/${code}/access/coachIndex/${uid}`;
  if (want) { await env.set(p, want); out.push('set coachIndex/' + uid); }
  else { await env.remove(p); out.push('del coachIndex/' + uid); }
}

async function syncIndex(env, f, code, uid, out, now) {
  const index = f.access.index;
  if (hasRole(f, uid)) {
    // no table at all is a club still being made: its first admin writes it herself
    if (index && !has(index, uid)) { await env.set(`workspaces/${code}/access/index/${uid}`, true); out.push('set index/' + uid); }
    if (!(await env.get(`userOrgs/${uid}/${code}`))) {
      await env.set(`userOrgs/${uid}/${code}`, { name: ((f.access.org || {}).name) || '', at: now });
      out.push('set userOrgs/' + uid);
    }
    return;
  }
  if (index && has(index, uid)) {
    const v = index[uid];
    await env.remove(`workspaces/${code}/access/index/${uid}`); out.push('del index/' + uid);
    // forgetInvite(): the invite her entry named, if it was one of this club's
    if (typeof v === 'string' && okKey(v) && (await env.get(`invites/${v}/ws`)) === code) {
      await env.remove('invites/' + v); out.push('del invite');
    }
  }
  if (await env.get(`userOrgs/${uid}/${code}`)) { await env.remove(`userOrgs/${uid}/${code}`); out.push('del userOrgs/' + uid); }
}

/* One role source changed. `uids` are the accounts named before or after,
   `tids` the teams whose per-team tables it could have moved, and `coaches`
   whether it was a team's coaches (coachIndex). Resolves to what it did, for
   the tests and the function's log. */
async function settle(env, code, { uids = [], tids = [], parents = false, players = false, coaches = false }, now = Date.now()) {
  const out = [];
  if (!okKey(code)) return out;
  const f = await clubFacts(env, code);
  if (f.retired) return out;
  for (const tid of tids.filter(okKey)) {
    if (coaches) await syncTeamIndex(env, f, code, tid, out);
    if (parents) await syncLinked(env, f, code, 'teamParents', 'guardians', tid, out);
    if (players) await syncLinked(env, f, code, 'teamPlayers', 'self', tid, out);
  }
  for (const uid of [...new Set(uids)].filter(okKey)) {
    if (coaches) await syncCoachIndex(env, f, code, uid, out);
    await syncIndex(env, f, code, uid, out, now);
  }
  return out;
}

const both = (before, after) => [...new Set([...keys(before), ...keys(after)])];

/* access/admins/{uid}: one admin given or taken away. */
function onAdmin(env, params, now) {
  return settle(env, params.code, { uids: [params.uid] }, now);
}
/* access/teams/{tid}: a team's coaches and trackers. */
function onTeamStaff(env, params, before, after, now) {
  const b = before || {}, a = after || {};
  const uids = [...both(b.coaches, a.coaches), ...both(b.trackers, a.trackers)];
  return settle(env, params.code, { uids, tids: [params.tid], coaches: true }, now);
}
/* teams/{tid}/players/{pid}/guardians: a player's families. */
function onGuardians(env, params, before, after, now) {
  return settle(env, params.code, { uids: both(before, after), tids: [params.tid], parents: true }, now);
}
/* teams/{tid}/players/{pid}/self: a player's own sign-in. */
function onSelf(env, params, before, after, now) {
  return settle(env, params.code, { uids: both(before, after), tids: [params.tid], players: true }, now);
}

module.exports = { settle, onAdmin, onTeamStaff, onGuardians, onSelf, hasRole, teamIndexWanted, linkedWanted, coachTeamOf };
