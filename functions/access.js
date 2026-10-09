/* The lookup tables the rules read, kept true the moment a role changes.

   SERVER.md, "The lookup tables the rules read". The rules cannot iterate, so
   seven flat tables answer their questions in one hop (CLAUDE.md, "Six flat
   lookup tables", and teamFans since build 121): access/index, teamIndex,
   teamParents, teamPlayers, teamFans, coachIndex and helperIndex. Each is derived from where a uid appears, and
   until now only an admin's or a coach's phone rebuilt them, on connect (syncIndex() and its
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
     coaches and trackers, a player's guardians, self and fans) and the same values
     (`'coach'` wins over `'tracker'`, and both over `'helper'`; a parent's, a player's and a
     fan's entry is a player id that really lists her; coachIndex names a team she coaches,
     the first by id, and is left alone while the one it names stays true;
     helperIndex the same for a team she helps).
     So a phone and the server never fight over an entry, and the phones go
     on doing it too, for a club whose functions are not deployed.
   - **Never close a bridge.** The rules fall back to the old club-wide
     behaviour while teamIndex or teamParents is missing (CLAUDE.md, "A rule
     that needs a node which may not exist yet carries a bridge"), and treat a
     club with no access/index at all as one still being made. One entry
     written for one team would end that fallback for every other team at
     once, so a table that does not exist yet is left for an admin's phone to
     build whole. coachIndex, helperIndex, teamPlayers and teamFans carry no bridge and are written
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

const { where, readAccess, readTeams } = require('./club');

const keys = o => Object.keys(o && typeof o === 'object' ? o : {});
const has = (o, k) => !!(o && typeof o === 'object' && o[k] !== undefined && o[k] !== null && o[k] !== false);
const same = (a, b) => JSON.stringify(a || null) === JSON.stringify(b || null);
// a database key: no path tricks from an id somebody typed
const okKey = k => typeof k === 'string' && k.length > 0 && !/[.#$\[\]\/]/.test(k);

/* Everything this needs about one club, read once per event. Teams are read
   whole because a uid's roles can be on any team's squad; role changes are
   rare (an invite, a coach changing a parent), never the game-day writes. */
async function clubFacts(env, code, tree) {
  const L = await where(env.get, code, tree);
  const [retired, access, teams, names, children] = await Promise.all([
    env.get('retired/' + code),
    readAccess(env.get, L),
    readTeams(env.get, L),
    L.names ? env.get(L.names) : null,
    L.tree === 'orgs' ? env.get(`${L.base}/children`) : null
  ]);
  return { L, retired: !!retired, access: access || {}, teams: teams || {}, names: names || {}, children: children || {} };
}
const squad = (f, tid) => ((f.teams[tid] || {}).players) || {};
const teamAcc = (f, tid) => ((f.access.teams || {})[tid]) || {};

/* hasAnyRole() in app.js, against the server's copy. */
function hasRole(f, uid) {
  // a club viewer is in the index like everyone else in the club (AUTH.md, *Club viewers, as built*)
  if (has(f.access.admins, uid) || has(f.access.viewers, uid)) return true;
  for (const ta of Object.values(f.access.teams || {}))
    if (has(ta && ta.coaches, uid) || has(ta && ta.trackers, uid) || has(ta && ta.helpers, uid)) return true;
  for (const t of Object.values(f.teams))
    for (const p of Object.values((t && t.players) || {}))
      if (p && (has(p.guardians, uid) || has(p.self, uid) || has(p.fans, uid))) return true;
  /* a family named on a child the club has let in (AUTH.md, *A child in the
     club*): a child on no team, say. Her `guardians` are copies of the
     squads', which are counted above already. */
  for (const c of Object.values(f.children || {}))
    if (c && c.club === true && has(c.family, uid)) return true;
  return false;
}

/* What each table should say, as the phones work it out. */
function teamIndexWanted(f, tid) {
  const ta = teamAcc(f, tid), want = {};
  for (const u of keys(ta.helpers)) if (has(ta.helpers, u)) want[u] = 'helper';
  for (const u of keys(ta.trackers)) if (has(ta.trackers, u)) want[u] = 'tracker';
  for (const u of keys(ta.coaches)) if (has(ta.coaches, u)) want[u] = 'coach';   // coach wins
  return want;
}
// parentsWanted(), playersWanted() and fansWanted(): the first player listing her, in squad order
function linkedWanted(f, tid, field) {
  const want = {};
  for (const [pid, p] of Object.entries(squad(f, tid)))
    for (const u of keys(p && p[field])) if (has(p[field], u) && !want[u]) want[u] = pid;
  return want;
}
function coachTeamOf(f, uid) {
  return keys(f.access.teams).sort().find(tid => has(teamAcc(f, tid).coaches, uid)) || null;
}
// helperTeamOf() in app.js: the same for a team helper
function helperTeamOf(f, uid) {
  return keys(f.access.teams).sort().find(tid => has(teamAcc(f, tid).helpers, uid)) || null;
}

/* Bring one per-team table (teamParents, teamPlayers or teamFans) for one team into
   line, entry by entry. An entry still naming a player who lists her is kept
   even if another would be first, as syncTeamParents() keeps it. */
async function syncLinked(env, f, code, table, field, tid, out) {
  const all = f.access[table];
  if (table === 'teamParents' && !all) return;   // the bridge: an admin's phone builds it whole
  const now = (all || {})[tid] || {};
  const want = linkedWanted(f, tid, field);
  const holds = (u, pid) => has((squad(f, tid)[pid] || {})[field], u);
  const base = `${f.L.access}/${table}/${tid}/`;
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
  const p = `${f.L.access}/teamIndex/${tid}`;
  if (keys(want).length) { await env.set(p, want); out.push('set teamIndex/' + tid); }
  else { await env.remove(p); out.push('del teamIndex/' + tid); }
}

/* coachIndex, and its twin helperIndex (AUTH.md, *Team helpers*): one team
   she coaches, or helps, for the training rules' "of any team". */
async function syncOneIndex(env, f, uid, out, table, key, teamOf) {
  const now = (f.access[table] || {})[uid] || null;
  // any team will do, so only rewrite it once the one it names stops being true
  if (now && has(teamAcc(f, now)[key], uid)) return;
  const want = teamOf(f, uid);
  if (want === now) return;
  const p = `${f.L.access}/${table}/${uid}`;
  if (want) { await env.set(p, want); out.push('set ' + table + '/' + uid); }
  else { await env.remove(p); out.push('del ' + table + '/' + uid); }
}
async function syncCoachIndex(env, f, code, uid, out) {
  await syncOneIndex(env, f, uid, out, 'coachIndex', 'coaches', coachTeamOf);
  await syncOneIndex(env, f, uid, out, 'helperIndex', 'helpers', helperTeamOf);
}

async function syncIndex(env, f, code, uid, out, now) {
  const index = f.access.index;
  if (hasRole(f, uid)) {
    // no table at all is a club still being made: its first admin writes it herself
    if (index && !has(index, uid)) { await env.set(`${f.L.access}/index/${uid}`, true); out.push('set index/' + uid); }
    if (!(await env.get(`userOrgs/${uid}/${code}`))) {
      await env.set(`userOrgs/${uid}/${code}`, { name: ((f.access.org || {}).name) || '', at: now });
      out.push('set userOrgs/' + uid);
    }
    return;
  }
  if (index && has(index, uid)) {
    const v = index[uid];
    await env.remove(`${f.L.access}/index/${uid}`); out.push('del index/' + uid);
    await forgetInvite(env, code, v, out);
  }
  if (await env.get(`userOrgs/${uid}/${code}`)) { await env.remove(`userOrgs/${uid}/${code}`); out.push('del userOrgs/' + uid); }
}
// forgetInvite(): the invite a role named, if it was one of this club's
async function forgetInvite(env, code, v, out) {
  // never a link for several people (seats): the others still to use it would lose it with her
  if (typeof v === 'string' && okKey(v) && (await env.get(`invites/${v}/ws`)) === code && !(await env.get(`invites/${v}/seats`))) {
    await env.remove('invites/' + v); out.push('del invite');
  }
}

/* One role source changed. `uids` are the accounts named before or after,
   `tids` the teams whose per-team tables it could have moved, and `coaches`
   whether it was a team's coaches (coachIndex). Resolves to what it did, for
   the tests and the function's log. */
async function settle(env, code, { uids = [], tids = [], parents = false, players = false, fans = false, coaches = false, tree }, now = Date.now()) {
  const out = [];
  if (!okKey(code)) return out;
  const f = await clubFacts(env, code, tree);
  if (f.retired) return out;
  for (const tid of tids.filter(okKey)) {
    if (coaches) await syncTeamIndex(env, f, code, tid, out);
    if (parents) await syncLinked(env, f, code, 'teamParents', 'guardians', tid, out);
    if (players) await syncLinked(env, f, code, 'teamPlayers', 'self', tid, out);
    if (fans) await syncLinked(env, f, code, 'teamFans', 'fans', tid, out);
  }
  for (const uid of [...new Set(uids)].filter(okKey)) {
    if (coaches) await syncCoachIndex(env, f, code, uid, out);
    await syncIndex(env, f, code, uid, out, now);
    await syncName(env, f, uid, out);
  }
  return out;
}

/* ---------------- the two parts only orgs/ has ---------------- */

/* names/{uid}: a member's name, for staff only, so a family can see who her
   coach is without reading anyone's email (members/ is admins' and coaches').
   Staff is what hasRole() counts short of a family: an admin, or a coach,
   tracker or helper of any team. Her name, never her email; gone with her last staff
   role. */
function isStaff(f, uid) {
  if (has(f.access.admins, uid)) return true;
  return Object.values(f.access.teams || {}).some(ta => has(ta && ta.coaches, uid) || has(ta && ta.trackers, uid) || has(ta && ta.helpers, uid));
}
async function syncName(env, f, uid, out) {
  if (!f.L.names) return;
  const m = (f.access.members || {})[uid] || {};
  const name = typeof m.name === 'string' ? m.name.slice(0, 80) : '';
  const want = isStaff(f, uid) && name ? { name } : null;
  if (same(f.names[uid], want)) return;
  if (want) { await env.set(`${f.L.names}/${uid}`, want); out.push('set names/' + uid); }
  else { await env.remove(`${f.L.names}/${uid}`); out.push('del names/' + uid); }
}

/* members/{uid} on orgs/: her name changed, so the copy families read does. */
async function onMember(env, params, now) {
  const out = [];
  const { code, uid } = params || {};
  if (!okKey(code) || !okKey(uid)) return out;
  const f = await clubFacts(env, code, 'orgs');
  if (f.retired) return out;
  await syncName(env, f, uid, out);
  return out;
}

/* roster/{tid}/{pid}: what the whole club reads of a child on orgs/ — her
   shirt number and whether she plays, and her name only while the club has
   opened the roster (org/rosterOpen, the club's one preset). The squad is
   read by its staff and her own family; this is everyone else's view of it.
   A coach's phone writes it beside each squad change too, so a club without
   the functions deployed still has numbers; this keeps it true whoever
   changed the squad. */
function rosterEntry(p, open) {
  if (!p || typeof p !== 'object') return null;
  const n = p.number;
  const out = { number: typeof n === 'number' || typeof n === 'string' ? n : '', active: p.active !== false };
  if (open && typeof p.name === 'string' && p.name) out.name = p.name.slice(0, 80);
  return out;
}
async function syncRoster(env, code, tid, pid, out) {
  const B = `orgs/${code}`;
  const [p, open, now] = await Promise.all([env.get(`${B}/squad/${tid}/${pid}`), env.get(`${B}/org/rosterOpen`), env.get(`${B}/roster/${tid}/${pid}`)]);
  const want = rosterEntry(p, open === true);
  if (same(now, want)) return;
  if (want) { await env.set(`${B}/roster/${tid}/${pid}`, want); out.push('set roster/' + tid + '/' + pid); }
  else { await env.remove(`${B}/roster/${tid}/${pid}`); out.push('del roster/' + tid + '/' + pid); }
}
/* squad/{tid}/{pid}: one child's record, any depth: the roster, and the
   club's record of the child (below). */
async function onSquadPlayer(env, params, before, now = Date.now()) {
  const out = [];
  const { code, tid, pid } = params || {};
  if (!okKey(code) || !okKey(tid) || !okKey(pid) || (await env.get('retired/' + code))) return out;
  await syncRoster(env, code, tid, pid, out);
  await syncChild(env, code, tid, pid, before, out, now);
  return out;
}
/* org/rosterOpen: names in or out of every team's roster at once. */
async function onRosterOpen(env, params) {
  const out = [];
  const { code } = params || {};
  if (!okKey(code) || (await env.get('retired/' + code))) return out;
  const B = `orgs/${code}`;
  const [squad, roster] = await Promise.all([env.get(`${B}/squad`), env.get(`${B}/roster`)]);
  const seen = new Set();
  for (const [tid, ps] of Object.entries(squad || {})) for (const pid of keys(ps)) { seen.add(tid + '/' + pid); await syncRoster(env, code, tid, pid, out); }
  for (const [tid, ps] of Object.entries(roster || {})) for (const pid of keys(ps)) if (!seen.has(tid + '/' + pid)) await syncRoster(env, code, tid, pid, out);
  return out;
}

/* ---------------- a child in the club (orgs/ only) ---------------- */

/* AUTH.md, *A child in the club, and registration*. Each squad record points
   at the club's record of the child (`child`), and the child lists the squad
   records that are her (`teams/{tid}: pid`). Her family on a team is the
   squad's: the child's `guardians` (and `self`) hold a copy of each squad
   record's, valued with the team, which the rules let anyone write and never
   let claim more than the squad says. This keeps those copies, and gives a
   squad record that has no child yet one of its own, made from it: the
   phones do the same (syncChildren() in app.js), for a club whose functions
   are not deployed, and both make the same record with the same id. */
function splitName(name) {
  const n = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 120);
  const k = n.lastIndexOf(' ');
  return k > 0 ? { first: n.slice(0, k).slice(0, 60), last: n.slice(k + 1).slice(0, 60) } : { first: (n || 'Player').slice(0, 60), last: '' };
}
// childFrom() in app.js: the record a squad record that has none gets
function childFrom(rec, tid, pid, at) {
  return { id: pid, ...splitName(rec.name), club: true, by: 'club', at, teams: { [tid]: pid } };
}
async function syncChild(env, code, tid, pid, before, out, now) {
  const B = `orgs/${code}`;
  const rec = await env.get(`${B}/squad/${tid}/${pid}`);
  let cid = rec && typeof rec.child === 'string' && okKey(rec.child) ? rec.child : null;
  if (!rec) cid = before && typeof before.child === 'string' && okKey(before.child) ? before.child : null;
  if (!cid && rec && typeof rec === 'object') {
    // the first record of hers to be seen; the player id is the child id, as the phones make it
    const there = await env.get(`${B}/children/${pid}`);
    if (there && (there.teams || {})[tid] !== pid) return;   // somebody else's id: left for an admin
    await env.set(`${B}/squad/${tid}/${pid}/child`, pid); out.push('set squad/' + tid + '/' + pid + '/child');
    if (!there) { await env.set(`${B}/children/${pid}`, childFrom(rec, tid, pid, now)); out.push('set children/' + pid); }
    cid = pid;
  }
  if (!cid) return;
  const c = await env.get(`${B}/children/${cid}`);
  if (!c || typeof c !== 'object') return;   // never start a child from a pointer alone
  const teams = c.teams || {};
  if (rec && teams[tid] !== pid) { await env.set(`${B}/children/${cid}/teams/${tid}`, pid); out.push('set children/' + cid + '/teams/' + tid); }
  if (!rec && teams[tid] === pid) { await env.remove(`${B}/children/${cid}/teams/${tid}`); out.push('del children/' + cid + '/teams/' + tid); }
  for (const field of ['guardians', 'self']) {
    const want = rec ? keys(rec[field]).filter(u => has(rec[field], u) && okKey(u)) : [];
    const now2 = c[field] || {};
    for (const u of want) if (!has(now2, u)) { await env.set(`${B}/children/${cid}/${field}/${u}`, tid); out.push('set children/' + cid + '/' + field + '/' + u); }
    for (const u of keys(now2)) if (now2[u] === tid && !want.includes(u)) { await env.remove(`${B}/children/${cid}/${field}/${u}`); out.push('del children/' + cid + '/' + field + '/' + u); }
  }
}
/* children/{cid}: a family named on the child herself, or the club letting
   her in, moves who is in the club's index. (Her family on a team is in it
   through the squad already.) */
async function onChildRecord(env, params, before, after, now) {
  const b = before || {}, a = after || {};
  if (same(b.family, a.family) && b.club === a.club) return [];
  const uids = both(b.family, a.family);
  return settle(env, params.code, { uids, tree: 'orgs' }, now);
}

const both = (before, after) => [...new Set([...keys(before), ...keys(after)])];

/* access/admins/{uid}: one admin given or taken away. */
function onAdmin(env, params, now) {
  return settle(env, params.code, { uids: [params.uid], tree: params.tree }, now);
}
/* access/teams/{tid}: a team's coaches, trackers and helpers. */
function onTeamStaff(env, params, before, after, now) {
  const b = before || {}, a = after || {};
  const uids = [...both(b.coaches, a.coaches), ...both(b.trackers, a.trackers), ...both(b.helpers, a.helpers)];
  return settle(env, params.code, { uids, tids: [params.tid], coaches: true, tree: params.tree }, now);
}
/* access/viewers/{uid} (orgs/ only): a club viewer given or taken away.
   She is in the index like any role, so this is the same settle, plus the
   invite her viewer entry named once it is gone. */
async function onViewer(env, params, before, after, now) {
  const out = await settle(env, params.code, { uids: [params.uid], tree: 'orgs' }, now);
  if (!after && okKey(params.code)) await forgetInvite(env, params.code, before, out);
  return out;
}

/* teams/{tid}/players/{pid}/guardians: a player's families. */
function onGuardians(env, params, before, after, now) {
  return settle(env, params.code, { uids: both(before, after), tids: [params.tid], parents: true, tree: params.tree }, now);
}
/* teams/{tid}/players/{pid}/self: a player's own sign-in. */
function onSelf(env, params, before, after, now) {
  return settle(env, params.code, { uids: both(before, after), tids: [params.tid], players: true, tree: params.tree }, now);
}
/* squad/{tid}/{pid}/fans: a player's fans (AUTH.md, *More kinds
   of people*, 1). On orgs/ only: the old tree has no rule that writes one. */
function onFans(env, params, before, after, now) {
  return settle(env, params.code, { uids: both(before, after), tids: [params.tid], fans: true, tree: params.tree }, now);
}

module.exports = { onChildRecord, childFrom, splitName, settle, onAdmin, onTeamStaff, onGuardians, onSelf, onViewer, onFans, onMember, onSquadPlayer, onRosterOpen, rosterEntry, isStaff, hasRole, teamIndexWanted, linkedWanted, coachTeamOf, helperTeamOf };
