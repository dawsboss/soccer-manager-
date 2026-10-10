/* Joining a club, and starting one, as one call to the server (SERVER.md,
   *Joining and starting clubs*).

   Until this, both were writes from the person's own phone, in the order
   the rules needed them, each awaited:

   - **Joining by invite** (`redeemInvite()`): spend the invite (or take a
     seat on a link for several), add herself to the members, take the role
     the invite names, add herself to the index, then the bookkeeping (the
     team's lookup table, the admin's list, her bookmark, the log, the
     invite deleted). A dropped signal half-way left her with some of it:
     a spent invite and no role, or a role and no index entry.
   - **Starting a club** (`createClub()`): the first person to write a
     code's admin list owns the club (the bootstrap clauses; rules.js prints
     it as trust-on-first-use), at a code her own phone made up.

   Now her phone asks, at `joinAsks/{uid}/{id}` (hers alone in the rules,
   create or delete, never the answer), and this answers beside it:

   - `{ op: 'invite', invite }`: everything the rules checked, here, against
     the invite and the club as they are now (it exists, is not spent by
     somebody else, has a seat, has not expired, is for her email if it
     names one and her address is confirmed, and its club, team and player
     are there), then the spend inside one transaction on the invite (so two
     people can never take one invite or the same seat), then the rest in
     one multi-path write: all of it or none of it. The lookup tables are
     then brought into line by access.js's own settle(), the same answer the
     role triggers give.
   - `{ op: 'club', name }`: a new club on orgs/ at a code the server makes
     (crypto, 16 bytes, never one that is taken), with her as
     its admin and owner, in one write. The bootstrap clauses stay in the
     rules for now, as a bridge for a database without the functions; once
     this is live everywhere they can go, and with them rules.js's gap.

   Her email and whether it is confirmed come from her account (Firebase
   Auth, `env.user`), never from the ask; her name may come from the ask,
   as her phone wrote it to the club before.

   Nothing here imports Firebase. index.js hands it `get`, `set`, `remove`,
   `update` (a multi-path write at the root), `claim` (a transaction) and
   `user` (her account); test/joinask.js hands it the fake ones. An answer is written once: an ask delivered twice finds it there. */

const crypto = require('crypto');
const { where, readAccess, readTeam } = require('./club');
const access = require('./access');

// a phone's clock can be minutes out; a phone that gave up deletes its ask
const ASK_TTL = 10 * 60000;
const okKey = k => typeof k === 'string' && k.length > 0 && k.length <= 128 && !/[.#$\[\]\/]/.test(k);
const has = (o, k) => !!(o && typeof o === 'object' && o[k] !== undefined && o[k] !== null && o[k] !== false);
const keys = o => Object.keys(o && typeof o === 'object' ? o : {});
const STAFF_KEY = { coach: 'coaches', tracker: 'trackers', helper: 'helpers' };
const TEAM_ROLES = ['coach', 'tracker', 'helper', 'parent', 'player', 'fan'];
// INVITE_ROLES and ROLE_LABEL from app.js, for the log
const ROLE_NAME = { coach: 'Coach', tracker: 'Tracker', helper: 'Team helper', parent: 'Parent', viewer: 'Club viewer', player: 'Player', fan: 'Fan' };
const clip = (s, n) => String(s == null ? '' : s).slice(0, n);
const seatOrder = (a, b) => Number(a.slice(1)) - Number(b.slice(1));
// randId() from app.js, on the server's own generator: a club code is the whole of nobody's access, but it must never be guessed or taken
const newCode = () => 'sm-' + crypto.randomBytes(16).toString('hex');
const newId = () => 'j' + Date.now().toString(36) + crypto.randomBytes(6).toString('hex');

/* Whether she may spend this invite, from the invite alone: null for yes, or
   why not, in the words the phone's invite screen already has. */
function inviteStatus(v, uid, me, now) {
  if (!v || typeof v !== 'object') return 'gone';
  if (v.seats) {
    if (has(v.took, uid)) return null;
    if (!(Number(v.expiresAt) > now)) return 'expired';
    if (!keys(v.seats).some(s => !has(v.seat, s))) return 'full';
  } else {
    if (v.used && v.used.by !== uid) return 'taken';
    if (v.used) return null;                        // hers, half finished: carry on
    if (!(Number(v.expiresAt) > now)) return 'expired';
  }
  if (v.email) {
    if (String(v.email).toLowerCase() !== String((me && me.email) || '').toLowerCase()) return 'wrongemail';
    if (!me || me.emailVerified !== true) return 'unverified';
  }
  return null;
}

async function redeem(env, uid, ask, now) {
  const id = ask.invite;
  if (!okKey(id)) return { ok: false, why: 'gone' };
  const [v0, me] = await Promise.all([env.get('invites/' + id), env.user(uid)]);
  const why0 = inviteStatus(v0, uid, me, now);
  if (why0) return { ok: false, why: why0 };
  const ws = v0.ws, role = v0.role;
  if (!okKey(ws) || !(TEAM_ROLES.includes(role) || role === 'viewer')) return { ok: false, why: 'gone' };
  if (TEAM_ROLES.includes(role) && !okKey(v0.team)) return { ok: false, why: 'gone' };
  if (['parent', 'player', 'fan'].includes(role) && !okKey(v0.player)) return { ok: false, why: 'gone' };
  const [retired, moving] = await Promise.all([env.get('retired/' + ws), env.get('serverState/moving/' + ws)]);
  if (retired) return { ok: false, why: 'gone' };
  if (moving) return { ok: false, why: 'moving' };
  const L = await where(env.get, ws);
  const acc = await readAccess(env.get, L);
  if (!acc || typeof acc !== 'object' || !acc.admins) return { ok: false, why: 'gone' };
  // the rules ask for the team and the child to be there; a viewer is club-wide
  const team = TEAM_ROLES.includes(role) ? await readTeam(env.get, L, v0.team) : null;
  if (TEAM_ROLES.includes(role) && !team) return { ok: false, why: 'gone' };
  if (v0.player && !(team.players || {})[v0.player]) return { ok: false, why: 'gone' };

  /* The spend, inside one transaction on the invite: whichever of two
     people asking at once commits first has it, and the other is told the
     invite was taken (or, on a link for several, given the next seat). A
     transaction may run with nothing in hand before it has read the
     invite; writing nothing then lets the database run it again with what
     is there. */
  let got = null;
  await env.claim('invites/' + id, cur => {
    if (!cur) { got = 'gone'; return null; }
    got = inviteStatus(cur, uid, me, now);
    if (got) return undefined;
    if (cur.seats) {
      if (has(cur.took, uid)) return undefined;
      const s = keys(cur.seats).sort(seatOrder).find(k => !has(cur.seat, k));
      return { ...cur, seat: { ...(cur.seat || {}), [s]: { by: uid, at: now } }, took: { ...(cur.took || {}), [uid]: s } };
    }
    if (cur.used) return undefined;
    return { ...cur, used: { by: uid, at: now } };
  });
  if (got) return { ok: false, why: got };
  const v = await env.get('invites/' + id);
  if (!v || !(v.seats ? has(v.took, uid) : v.used && v.used.by === uid)) return { ok: false, why: 'taken' };

  const name = clip(typeof ask.name === 'string' && ask.name.trim() ? ask.name.trim() : (me && me.displayName) || '', 80);
  const email = String((me && me.email) || '').toLowerCase();
  const A = L.access, pl = v.player ? L.player(v.team, v.player) : null;
  const patch = {};
  patch[`${L.members}/${uid}`] = { name, email, at: now };
  /* A fan her family or the player asked for is let in by the team's coach,
     not by the link: the link only lets her ask (AUTH.md, *More kinds of
     people*, 1). One a coach or admin made is approved already. */
  const asks = role === 'fan' && !v.approved;
  if (asks) {
    patch[`claims/${ws}/${v.team}/${uid}`] = {
      invite: id, player: v.player, name, email, at: now,
      ...(v.byName ? { askedBy: clip(v.byName, 80) } : {}), ...(v.playerNo ? { shirt: clip(v.playerNo, 40) } : {})
    };
  } else {
    if (role === 'parent') patch[`${pl}/guardians/${uid}`] = id;
    else if (role === 'player') patch[`${pl}/self/${uid}`] = id;
    else if (role === 'fan') { patch[`${pl}/fans/${uid}`] = id; patch[`${pl}/fanNames/${uid}`] = clip(name || email || 'A fan', 80); }
    else if (role === 'viewer') patch[`${A}/viewers/${uid}`] = id;
    else patch[`${A}/teams/${v.team}/${STAFF_KEY[role]}/${uid}`] = id;
    // an entry already there keeps its value: the rule checked it when it was written
    if (!has(acc.index, uid)) patch[`${A}/index/${uid}`] = id;
    patch[`userOrgs/${uid}/${ws}`] = { name: clip((acc.org || {}).name || v.clubName || '', 80), at: now };
    patch[`${L.base}/log/${newId()}`] = {
      at: now, act: 'joined by invite as', by: uid, byName: name || null, target: uid,
      targetName: ROLE_NAME[role] || role, team: v.team || null, teamName: v.teamName || null
    };
  }
  // the admin's list of invites, where it has this one
  if (await env.get(`clubInvites/${ws}/${id}`)) {
    if (v.seats) patch[`clubInvites/${ws}/${id}/took/${uid}`] = { at: now, name };
    else patch[`clubInvites/${ws}/${id}/used`] = { by: uid, at: now, name };
  }
  // spent; a link for several stays for the rest, until its date
  if (!v.seats) patch['invites/' + id] = null;
  await env.update(patch);

  /* The lookup tables (teamIndex, teamParents, teamPlayers, teamFans,
     coachIndex, helperIndex), as the role triggers would make them, now
     rather than a moment after her phone reloads. Never a table that is
     not there: that would close a bridge for every other team. */
  if (!asks) await access.settle(env, ws, {
    uids: [uid], tids: v.team ? [v.team] : [],
    coaches: !!STAFF_KEY[role], parents: role === 'parent', players: role === 'player', fans: role === 'fan'
  }, now);
  return { ok: true, ws, role, ...(asks ? { asked: true, team: v.team } : {}) };
}

/* A new club, at a code the server makes. */
async function startClub(env, uid, ask, now) {
  const club = clip(typeof ask.name === 'string' ? ask.name.trim() : '', 80);
  if (!club) return { ok: false, why: 'name' };
  const me = await env.user(uid);
  let code = null;
  for (let i = 0; i < 3 && !code; i++) {
    const c = (env.newCode || newCode)();
    if ((await env.get(`orgs/${c}`)) == null) code = c;
  }
  if (!code) return { ok: false, why: 'busy' };
  const name = clip(typeof ask.you === 'string' && ask.you.trim() ? ask.you.trim() : (me && me.displayName) || '', 80);
  const O = `orgs/${code}`;
  await env.update({
    [`${O}/access/admins/${uid}`]: true,
    // whoever starts a club owns it, so no later admin can take it from her (SECURITY.md, SEC-D8)
    [`${O}/access/owners/${uid}`]: true,
    [`${O}/access/index/${uid}`]: true,
    [`${O}/members/${uid}`]: { name, email: String((me && me.email) || '').toLowerCase(), at: now },
    [`${O}/org/name`]: club,
    ...(name ? { [`${O}/names/${uid}`]: { name } } : {}),
    // the bookmark is what puts it in every one of her devices' club lists
    [`userOrgs/${uid}/${code}`]: { name: club, at: now }
  });
  return { ok: true, ws: code };
}

/* joinAsks/{uid}/{id}. Resolves to the answer, also written at its `answer`. */
async function onAsk(env, params, ask, now = Date.now()) {
  const { uid, id } = params || {};
  if (!okKey(uid) || !okKey(id)) return { ok: false, why: 'bad' };
  const at = `joinAsks/${uid}/${id}/answer`;
  if (await env.get(at)) return { ok: false, why: 'answered' };
  const say = async ans => { await env.set(at, { ...ans, at: now }); return ans; };
  if (!ask || typeof ask !== 'object' || !(Math.abs(Number(ask.at) - now) <= ASK_TTL)) return say({ ok: false, why: 'stale' });
  try {
    if (ask.op === 'invite') return say(await redeem(env, uid, ask, now));
    if (ask.op === 'club') return say(await startClub(env, uid, ask, now));
    return say({ ok: false, why: 'bad' });
  } catch (e) {
    // whatever went wrong, her phone hears it rather than waiting for ever
    return say({ ok: false, why: 'failed' });
  }
}

module.exports = { onAsk, inviteStatus, ASK_TTL };
