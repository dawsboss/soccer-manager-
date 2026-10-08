/* Where a club lives, and its parts read back in the shape the rest of the
   server knows.

   A club is on workspaces/{code} until it moves, and on orgs/{code} after
   (AUTH.md, *The move to `orgs/{orgId}`*). The rules hold each code to one
   tree, and say which by whether orgs/{code}/access exists; this says the
   same. On orgs/ a club's parts are split by who reads them (the squad out
   from under its team, members and the club's settings out of access), so
   every reader here asks this file where a part is, and gets teams back with
   their players under them, as the old tree had them, so the judgement in
   push.js, mirror.js, mycal.js and access.js did not have to change with the
   move.

   Nothing in here imports Firebase: `get` is whatever the caller reads with. */

const TREES = ['workspaces', 'orgs'];

function paths(tree, code) {
  if (!TREES.includes(tree)) throw new Error('no such tree: ' + tree);
  const B = `${tree}/${code}`, o = tree === 'orgs';
  return {
    tree, code, base: B,
    access: `${B}/access`,
    org: o ? `${B}/org` : `${B}/access/org`,
    members: o ? `${B}/members` : `${B}/access/members`,
    teams: `${B}/teams`,
    team: tid => `${B}/teams/${tid}`,
    squad: tid => (o ? `${B}/squad/${tid}` : `${B}/teams/${tid}/players`),
    player: (tid, pid) => (o ? `${B}/squad/${tid}/${pid}` : `${B}/teams/${tid}/players/${pid}`),
    matches: `${B}/matches`,
    game: mid => `${B}/matches/${mid}`,
    // the two derived parts only the new tree has
    names: o ? `${B}/names` : null,
    roster: o ? `${B}/roster` : null
  };
}

/* Which tree `code` is on. A trigger on one tree already knows (index.js
   passes it as params.tree); a trigger on a root node (board/, dm/,
   training/…) and the scheduled feed builder ask. */
async function where(get, code, tree) {
  if (tree) return paths(tree, code);
  const on = await get(`orgs/${code}/access/admins`) || await get(`orgs/${code}/access/index`);
  return paths(on ? 'orgs' : 'workspaces', code);
}

/* access as the old tree held it: with org and members inside. */
async function readAccess(get, L) {
  if (L.tree !== 'orgs') return get(L.access);
  const [access, org, members] = await Promise.all([get(L.access), get(L.org), get(L.members)]);
  if (access === undefined) return undefined;
  if (access == null && org == null && members == null) return access;
  return { ...(access || {}), ...(org != null ? { org } : {}), ...(members != null ? { members } : {}) };
}

/* Every team, each with its squad under `players`. undefined stays undefined
   (a read that failed), so a caller can still tell "could not read" from
   "nothing there". */
async function readTeams(get, L) {
  if (L.tree !== 'orgs') return get(L.teams);
  const [teams, squad] = await Promise.all([get(L.teams), get(`${L.base}/squad`)]);
  if (teams === undefined || squad === undefined) return undefined;
  if (teams == null) return teams;
  const out = {};
  for (const [tid, t] of Object.entries(teams)) out[tid] = squad && squad[tid] ? { ...(t || {}), players: squad[tid] } : t;
  return out;
}

/* One team, with its squad. */
async function readTeam(get, L, tid) {
  if (L.tree !== 'orgs') return get(L.team(tid));
  const [team, players] = await Promise.all([get(L.team(tid)), get(L.squad(tid))]);
  if (team == null) return team;
  return players ? { ...team, players } : team;
}

module.exports = { TREES, paths, where, readAccess, readTeams, readTeam };
