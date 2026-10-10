/* Where a club lives, and its parts read back in the shape the rest of the
   server knows.

   A club is on orgs/{code} (AUTH.md, *The move to `orgs/{orgId}`*), its parts
   split by who reads them: the squad out from under its team, members and
   the club's settings out of access. Every reader here asks this file where
   a part is, and gets teams back with their players under them and access
   with org and members inside, the shape the judgement in push.js,
   mirror.js, mycal.js and access.js was written for. The old workspaces/
   tree came out a fortnight after the last club moved (build order step 5).

   Nothing in here imports Firebase: `get` is whatever the caller reads with. */

function paths(code) {
  const B = `orgs/${code}`;
  return {
    code, base: B,
    access: `${B}/access`,
    org: `${B}/org`,
    members: `${B}/members`,
    teams: `${B}/teams`,
    team: tid => `${B}/teams/${tid}`,
    squad: tid => `${B}/squad/${tid}`,
    player: (tid, pid) => `${B}/squad/${tid}/${pid}`,
    matches: `${B}/matches`,
    game: mid => `${B}/matches/${mid}`,
    names: `${B}/names`,
    roster: `${B}/roster`
  };
}

/* Where `code` lives. Kept as a promise, as it was while a club could be on
   either tree, so every caller reads the same way. */
async function where(get, code) {
  return paths(code);
}

/* access with org and members inside. */
async function readAccess(get, L) {
  const [access, org, members] = await Promise.all([get(L.access), get(L.org), get(L.members)]);
  if (access === undefined) return undefined;
  if (access == null && org == null && members == null) return access;
  return { ...(access || {}), ...(org != null ? { org } : {}), ...(members != null ? { members } : {}) };
}

/* Every team, each with its squad under `players`. undefined stays undefined
   (a read that failed), so a caller can still tell "could not read" from
   "nothing there". */
async function readTeams(get, L) {
  const [teams, squad] = await Promise.all([get(L.teams), get(`${L.base}/squad`)]);
  if (teams === undefined || squad === undefined) return undefined;
  if (teams == null) return teams;
  const out = {};
  for (const [tid, t] of Object.entries(teams)) out[tid] = squad && squad[tid] ? { ...(t || {}), players: squad[tid] } : t;
  return out;
}

/* One team, with its squad. */
async function readTeam(get, L, tid) {
  const [team, players] = await Promise.all([get(L.team(tid)), get(L.squad(tid))]);
  if (team == null) return team;
  return players ? { ...team, players } : team;
}

module.exports = { paths, where, readAccess, readTeams, readTeam };
