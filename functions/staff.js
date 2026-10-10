/* A coach's or an admin's letting-in, as one call to the server (SERVER.md,
   *Joining and starting clubs*).

   Four things a coach's or admin's phone wrote itself, several writes each
   in the order the rules needed, undone by hand after a dropped signal:

   - **Approving a team-link request** (`approveClaim()`): the approval
     first (the index rule looks for it), then the family on each child's
     record, her index entry naming the team, her member entry, the log.
   - **Approving a fan's ask** (`approveFan()`): the same, with her place on
     the child's record, her name beside it for the family, and the fans
     table.
   - **A squad's parent links** (`inviteSquad()`): one invite per child with
     no parent and no open invite, each two writes (the invite, the admin's
     list), stopping at the first refusal.
   - **The invites an imported roster's emails ask for** (`inviteImported()`):
     one email-bound invite each, the same way.

   Now the phone asks at staffAsks/{code}/{uid}/{id} (hers alone in the
   rules; only an admin or a coach of some team may make one), and this
   answers beside it, each as one multi-path write, all of it or none:

   - who: an admin of the club, or (for a team's request or a fan) a coach
     of that team by the team's own table, the same two things the rules
     checked; a squad's links and an imported roster's are admins' alone;
   - what: a request that is there and not yet approved, children who are
     on the squad, a fan's player still on it; an invite only for a child
     with no parent and no open invite, or an address with no open invite
     and no role already.

   The lookup tables follow by access.js's settle(), as the role triggers
   would make them. Invite ids come from the server's own generator, as the
   phone's did from randId(): an invite id is the whole of somebody's way
   in. Nothing here imports Firebase; index.js hands it `get`, `set` and
   `update`; test/staffask.js hands it the fake ones. */

const crypto = require('crypto');
const { where, readTeam } = require('./club');
const access = require('./access');

const ASK_TTL = 10 * 60000;
const INVITE_DAYS = 14, LINK_MAX = 50, DAYS_MAX = 365, LIST_MAX = 200;
const okKey = k => typeof k === 'string' && k.length > 0 && k.length <= 128 && !/[.#$\[\]\/]/.test(k);
const has = (o, k) => !!(o && typeof o === 'object' && o[k] !== undefined && o[k] !== null && o[k] !== false);
const keys = o => Object.keys(o && typeof o === 'object' ? o : {});
const okMail = s => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;
const clip = (s, n) => String(s == null ? '' : s).slice(0, n);
const list = v => (Array.isArray(v) ? v : keys(v).sort((a, b) => Number(a) - Number(b)).map(k => v[k]));
// secretId() and randId('m', 18) from app.js, on the server's generator
const inviteId = uses => (uses > 1 ? 'm' : 'i') + crypto.randomBytes(18).toString('hex');
const logId = () => 'l' + Date.now().toString(36) + crypto.randomBytes(6).toString('hex');
const seatsFor = n => (n > 1 ? { max: n, seats: Object.fromEntries(Array.from({ length: n }, (_, i) => ['s' + (i + 1), true])) } : {});
const clampInt = (v, lo, hi, dflt) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt; };

/* The club as this needs it: who may let people in to which team. */
async function facts(env, code, uid) {
  const L = await where(env.get, code);
  const [admins, index, members, org, teamIndex, invites] = await Promise.all([
    env.get(`${L.access}/admins`), env.get(`${L.access}/index`), env.get(L.members), env.get(L.org), env.get(`${L.access}/teamIndex`), env.get(`clubInvites/${code}`)
  ]);
  const admin = has(admins, uid);
  const coachOf = tid => admin || (((teamIndex || {})[tid] || {})[uid]) === 'coach';
  return { L, admin, coachOf, index: index || {}, members: members || {}, org: org || {}, invites: invites || {} };
}
const logEntry = (f, uid, act, target, extra) => ({
  at: extra.at, act, by: uid, byName: clip((f.members[uid] || {}).name, 80) || null,
  target, targetName: clip(((f.members[target] || {}).name) || ((f.members[target] || {}).email), 80) || null, ...extra
});

/* A family's request through the team link, approved for the children picked. */
async function approve(env, code, uid, ask, now) {
  const { tid, uid: who } = ask;
  const pids = list(ask.pids).filter(okKey);
  if (!okKey(tid) || !okKey(who) || !pids.length) return { ok: false, why: 'bad' };
  const f = await facts(env, code, uid);
  if (!f.coachOf(tid)) return { ok: false, why: 'notyours' };
  const [team, claim] = await Promise.all([readTeam(env.get, f.L, tid), env.get(`claims/${code}/${tid}/${who}`)]);
  if (!team) return { ok: false, why: 'gone' };
  if (!claim || typeof claim !== 'object' || claim.invite) return { ok: false, why: 'gone' };
  if (claim.approved) return { ok: false, why: 'approved' };
  const squad = team.players || {};
  const picked = pids.filter(pid => squad[pid] && typeof squad[pid] === 'object');
  if (!picked.length) return { ok: false, why: 'bad' };
  const patch = { [`claims/${code}/${tid}/${who}/approved`]: { by: uid, at: now, players: Object.fromEntries(picked.map(p => [p, true])) } };
  for (const pid of picked) if (!has(squad[pid].guardians, who)) patch[`${f.L.player(tid, pid)}/guardians/${who}`] = true;
  // the team id, not true: that is what the rule checks a coach's write against
  if (!has(f.index, who)) patch[`${f.L.access}/index/${who}`] = tid;
  if (!has(f.members, who)) patch[`${f.L.members}/${who}`] = { name: clip(claim.name, 80), email: clip(claim.email, 254), at: Number(claim.at) || now };
  patch[`${f.L.base}/log/${logId()}`] = logEntry(f, uid, 'approved as parent', who, { at: now, team: tid, teamName: clip(team.name, 80) || null, player: picked.map(p => clip(squad[p].name, 80)).join(', ') });
  await env.update(patch);
  await access.settle(env, code, { uids: [who], tids: [tid], parents: true }, now);
  return { ok: true, pids: picked };
}

/* A fan's ask (AUTH.md, *More kinds of people*, 1), approved. */
async function approveFan(env, code, uid, ask, now) {
  const { tid, uid: who } = ask;
  if (!okKey(tid) || !okKey(who)) return { ok: false, why: 'bad' };
  const f = await facts(env, code, uid);
  if (!f.coachOf(tid)) return { ok: false, why: 'notyours' };
  const [team, claim] = await Promise.all([readTeam(env.get, f.L, tid), env.get(`claims/${code}/${tid}/${who}`)]);
  if (!team || !claim || typeof claim !== 'object' || !claim.invite) return { ok: false, why: 'gone' };
  if (claim.approved) return { ok: false, why: 'approved' };
  const squad = team.players || {}, pid = claim.player, p = okKey(pid) && squad[pid];
  if (!p || typeof p !== 'object') return { ok: false, why: 'player' };
  const patch = { [`claims/${code}/${tid}/${who}/approved`]: { by: uid, at: now, fan: pid } };
  if (!has(p.fans, who)) patch[`${f.L.player(tid, pid)}/fans/${who}`] = true;
  // her name where the child's family reads it (they cannot read the club's members)
  const name = clip(claim.name, 80) || clip(String(claim.email || '').split('@')[0], 80);
  if (name) patch[`${f.L.player(tid, pid)}/fanNames/${who}`] = name;
  if (!has(f.index, who)) patch[`${f.L.access}/index/${who}`] = tid;
  if (!has(f.members, who)) patch[`${f.L.members}/${who}`] = { name: clip(claim.name, 80), email: clip(claim.email, 254), at: Number(claim.at) || now };
  patch[`${f.L.base}/log/${logId()}`] = logEntry(f, uid, 'approved as fan', who, { at: now, team: tid, teamName: clip(team.name, 80) || null, player: clip(p.name, 80) });
  await env.update(patch);
  await access.settle(env, code, { uids: [who], tids: [tid], fans: true }, now);
  return { ok: true, pid };
}

/* One invite, as writeInvite() shapes it: what the invitee sees before
   joining (club, team, who sent it, a shirt number; never a child's name),
   and the admin's own listing, which may name the child. */
function inviteDocs(f, code, team, role, p, email, uses, days, uid, now) {
  const id = inviteId(uses);
  const doc = {
    ws: code, ...(team ? { team: team.id, teamName: clip(team.name, 80) } : {}), role,
    clubName: clip(f.org.name, 80), by: uid, byName: clip((f.members[uid] || {}).name, 80),
    at: now, expiresAt: now + days * 864e5, ...seatsFor(uses)
  };
  if (p) { doc.player = p.id; if (p.number != null && p.number !== '') doc.playerNo = String(p.number).slice(0, 40); }
  if (email) doc.email = email;
  const listed = { role, ...(team ? { team: team.id, teamName: doc.teamName } : {}), by: uid, byName: doc.byName, at: now, expiresAt: doc.expiresAt, ...(uses > 1 ? { max: uses } : {}) };
  if (p) { listed.playerName = clip(p.name, 80); listed.player = p.id; }
  if (email) listed.email = email;
  return { id, doc, listed };
}
const openInvite = (f, now, pred) => Object.entries(f.invites).some(([, v]) => v && !v.used && (Number(v.expiresAt) || 0) > now && pred(v));

/* A squad's parent links: one per child with no parent and no open invite. */
async function squadLinks(env, code, uid, ask, now) {
  const { tid } = ask;
  if (!okKey(tid)) return { ok: false, why: 'bad' };
  const f = await facts(env, code, uid);
  if (!f.admin) return { ok: false, why: 'notyours' };
  const team = await readTeam(env.get, f.L, tid);
  if (!team) return { ok: false, why: 'gone' };
  const uses = clampInt(ask.uses, 1, LINK_MAX, 1), days = clampInt(ask.days, 1, DAYS_MAX, INVITE_DAYS);
  const patch = {}, made = {};
  for (const [pid, p] of Object.entries(team.players || {})) {
    if (!p || typeof p !== 'object' || p.active === false || keys(p.guardians).length) continue;
    if (openInvite(f, now, v => v.role === 'parent' && v.team === tid && v.player === pid)) continue;
    const { id, doc, listed } = inviteDocs(f, code, { id: tid, name: team.name }, 'parent', { ...p, id: pid }, '', uses, days, uid, now);
    patch[`invites/${id}`] = doc; patch[`clubInvites/${code}/${id}`] = listed; made[pid] = id;
  }
  const n = keys(made).length;
  if (n) {
    patch[`${f.L.base}/log/${logId()}`] = logEntry(f, uid, 'invited', null, { at: now, targetName: n + ' parent' + (n === 1 ? '' : 's') + ' by link', team: tid, teamName: clip(team.name, 80) || null });
    await env.update(patch);
  }
  return { ok: true, made };
}

/* The invites an imported roster's emails ask for: one email-bound invite
   each, for a coach of a team or a parent of a child on it, skipping anyone
   who has that role already or an open invite to that address. */
async function importInvites(env, code, uid, ask, now) {
  const rows = list(ask.list);
  if (!rows.length || rows.length > LIST_MAX) return { ok: false, why: 'bad' };
  const f = await facts(env, code, uid);
  if (!f.admin) return { ok: false, why: 'notyours' };
  const days = clampInt(ask.days, 1, DAYS_MAX, INVITE_DAYS);
  const [teams, teamAccess] = await Promise.all([env.get(f.L.teams), env.get(`${f.L.access}/teams`)]);
  const squads = {};
  const squadOf = async tid => { if (!(tid in squads)) squads[tid] = (await env.get(f.L.squad(tid))) || {}; return squads[tid]; };
  const uidsOf = email => Object.entries(f.members).filter(([, m]) => m && String(m.email || '').toLowerCase() === email).map(([u]) => u);
  const patch = {}, made = {}, skipped = {};
  const seen = new Set();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || {};
    const email = String(r.email || '').trim().toLowerCase(), tid = r.team, role = r.role;
    const why = !okMail(email) ? 'email' : !okKey(tid) || !teams || !teams[tid] ? 'team' : role !== 'coach' && role !== 'parent' ? 'role' : null;
    if (why) { skipped[i] = why; continue; }
    const team = { id: tid, name: (teams[tid] || {}).name };
    let p = null;
    if (role === 'parent') {
      const squad = await squadOf(tid);
      p = okKey(r.player) && squad[r.player] && typeof squad[r.player] === 'object' ? { ...squad[r.player], id: r.player } : null;
      if (!p) { skipped[i] = 'player'; continue; }
    }
    const k = [role, tid, p ? p.id : '', email].join('|');
    if (seen.has(k)) { skipped[i] = 'twice'; continue; }
    seen.add(k);
    const them = uidsOf(email);
    if (role === 'coach' ? them.some(u => has(((teamAccess || {})[tid] || {}).coaches, u)) : them.some(u => has(p.guardians, u))) { skipped[i] = 'has'; continue; }
    if (openInvite(f, now, v => v.role === role && v.team === tid && String(v.email || '').toLowerCase() === email && (role !== 'parent' || v.player === p.id))) { skipped[i] = 'open'; continue; }
    const { id, doc, listed } = inviteDocs(f, code, team, role, p, email, 1, days, uid, now);
    patch[`invites/${id}`] = doc; patch[`clubInvites/${code}/${id}`] = listed; made[i] = id;
  }
  const n = keys(made).length;
  if (n) {
    patch[`${f.L.base}/log/${logId()}`] = logEntry(f, uid, 'invited', null, { at: now, targetName: n + ' from an imported roster' });
    await env.update(patch);
  }
  return { ok: true, made, ...(keys(skipped).length ? { skipped } : {}) };
}

/* staffAsks/{code}/{uid}/{id}: { op: 'approve', tid, uid, pids } |
   { op: 'fan', tid, uid } | { op: 'squad', tid, uses, days } |
   { op: 'invites', list: [{ team, role, player, email }], days }. */
async function onAsk(env, params, ask, now = Date.now()) {
  const { code, uid, id } = params || {};
  if (!okKey(code) || !okKey(uid) || !okKey(id)) return { ok: false, why: 'bad' };
  const at = `staffAsks/${code}/${uid}/${id}/answer`;
  if (await env.get(at)) return { ok: false, why: 'answered' };
  const say = async ans => { await env.set(at, { ...ans, at: now }); return ans; };
  if (!ask || typeof ask !== 'object' || !(Math.abs(Number(ask.at) - now) <= ASK_TTL)) return say({ ok: false, why: 'stale' });
  if (await env.get('retired/' + code)) return say({ ok: false, why: 'retired' });
  try {
    if (ask.op === 'approve') return say(await approve(env, code, uid, ask, now));
    if (ask.op === 'fan') return say(await approveFan(env, code, uid, ask, now));
    if (ask.op === 'squad') return say(await squadLinks(env, code, uid, ask, now));
    if (ask.op === 'invites') return say(await importInvites(env, code, uid, ask, now));
    return say({ ok: false, why: 'bad' });
  } catch (e) {
    return say({ ok: false, why: 'failed' });
  }
}

module.exports = { onAsk, ASK_TTL };
