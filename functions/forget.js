/* Forgetting an account (AUTH.md, *Deleting*; GOTSPORT.md, *Protecting the
   data*): asked for by the person herself, at forgetRequests/{uid}, just
   before her phone deletes the sign-in. The request is the account's own
   (the rules let nobody else write it), and this acts only on that uid.

   What goes, in every club she is in (her bookmarks, `userOrgs/{uid}`, and
   her own list of her children, `families/{uid}`): every role (admin, owner,
   viewer, a team's coach, tracker or helper), every lookup table's entry for
   her, her member entry and staff name, her place on any child's record and
   squad record (family, her own sign-in, fan), her asks on team links and
   for bookings; and at the root her settings and busy times, her phones'
   push tokens, her own drills, and both lists. What stays is the club's:
   the messages and notices she wrote, as in any group chat, and a child's
   record. A child left with no family is taken off her team (her games keep
   her name and number) and her record is kept, marked `left`, for the
   admins to delete or keep (the owner, 2026-10-09).

   Refused, and said why, while she is the last admin of a club: a club with
   no admin is a club anyone could set up again.

   Nothing in here imports Firebase; test/forget.js runs it on the fake
   server. */

const { where } = require('./club');

const keys = o => Object.keys(o && typeof o === 'object' ? o : {});
const has = (o, k) => !!(o && typeof o === 'object' && o[k] !== undefined && o[k] !== null && o[k] !== false);
const okKey = k => typeof k === 'string' && k.length > 0 && !/[.#$\[\]\/]/.test(k);

async function forgetIn(env, code, uid, now, out) {
  const L = await where(env.get, code);
  // every club is on orgs/ (AUTH.md); a club still on the old tree is left to its admins
  if (L.tree !== 'orgs' || (await env.get('retired/' + code))) return;
  const B = 'orgs/' + code;
  const gone = async p => { if ((await env.get(p)) !== null && (await env.get(p)) !== undefined) { await env.remove(p); out.push('del ' + p.slice(B.length + 1)); } };
  const access = (await env.get(B + '/access')) || {};
  for (const k of ['admins', 'owners', 'viewers', 'index', 'coachIndex', 'helperIndex']) if (has(access[k], uid)) await gone(`${B}/access/${k}/${uid}`);
  for (const [tid, ta] of Object.entries(access.teams || {}))
    for (const k of ['coaches', 'trackers', 'helpers']) if (has((ta || {})[k], uid)) await gone(`${B}/access/teams/${tid}/${k}/${uid}`);
  for (const t of ['teamIndex', 'teamParents', 'teamPlayers', 'teamFans'])
    for (const [tid, row] of Object.entries(access[t] || {})) if (has(row, uid)) await gone(`${B}/access/${t}/${tid}/${uid}`);
  await gone(`${B}/members/${uid}`);
  await gone(`${B}/names/${uid}`);

  const left = new Set();
  const squad = (await env.get(B + '/squad')) || {};
  for (const [tid, ps] of Object.entries(squad)) for (const [pid, p] of Object.entries(ps || {})) {
    if (!p || typeof p !== 'object') continue;
    const fam = has(p.guardians, uid) || has(p.self, uid);
    for (const f of ['guardians', 'self', 'fans', 'fanNames']) if (has(p[f], uid)) await gone(`${B}/squad/${tid}/${pid}/${f}/${uid}`);
    // the last of her family gone from a record with no club record to say so
    if (fam && !p.child && !keys(p.guardians).some(u => u !== uid) && !keys(p.self).some(u => u !== uid)) left.add(tid + '/' + pid);
  }
  const children = (await env.get(B + '/children')) || {};
  for (const [cid, c] of Object.entries(children)) {
    if (!c || typeof c !== 'object') continue;
    const had = has(c.family, uid) || has(c.guardians, uid) || has(c.self, uid);
    if (!had) continue;
    for (const f of ['family', 'guardians', 'self']) if (has(c[f], uid)) await gone(`${B}/children/${cid}/${f}/${uid}`);
    const still = ['family', 'guardians', 'self'].some(f => keys(c[f]).some(u => u !== uid && has(c[f], u)));
    if (still) continue;
    // left with no family: off her teams, kept for the admins to decide
    await env.set(`${B}/children/${cid}/left`, { at: now }); out.push('set children/' + cid + '/left');
    for (const [tid, pid] of Object.entries(c.teams || {})) if (okKey(tid) && okKey(pid)) left.add(tid + '/' + pid);
  }
  for (const tp of left) {
    const [tid, pid] = tp.split('/');
    if (squad[tid] && squad[tid][pid] && squad[tid][pid].active !== false) { await env.set(`${B}/squad/${tid}/${pid}/active`, false); out.push('set squad/' + tp + '/active'); }
  }
  const claims = (await env.get('claims/' + code)) || {};
  for (const tid of keys(claims)) if (has(claims[tid], uid)) { await env.remove(`claims/${code}/${tid}/${uid}`); out.push('del claim/' + tid); }
  if (await env.get(`bookAsks/${code}/${uid}`)) { await env.remove(`bookAsks/${code}/${uid}`); out.push('del bookAsks'); }
}

async function onRequest(env, params, value, now = Date.now()) {
  const out = [];
  const uid = params && params.uid;
  if (!okKey(uid) || !value || typeof value !== 'object' || value.answer) return out;
  const say = a => env.set(`forgetRequests/${uid}/answer`, { ...a, at: now });
  const clubs = [...new Set([...keys(await env.get('userOrgs/' + uid)), ...keys(await env.get('families/' + uid))])].filter(okKey);
  // never leave a club with no admin
  const last = [];
  for (const code of clubs) {
    const L = await where(env.get, code);
    const admins = (await env.get(L.access + '/admins')) || {};
    if (has(admins, uid) && !keys(admins).some(u => u !== uid && has(admins, u))) {
      const org = (await env.get(L.org)) || {};
      last.push(String(org.name || 'a club').slice(0, 80));
    }
  }
  if (last.length) { await say({ ok: false, why: 'lastAdmin', clubs: last }); out.push('refused: last admin'); return out; }
  for (const code of clubs) await forgetIn(env, code, uid, now, out);
  for (const p of ['people/', 'pushTokens/', 'userLibrary/', 'families/', 'userOrgs/'])
    if ((await env.get(p + uid)) != null) { await env.remove(p + uid); out.push('del ' + p + uid); }
  await say({ ok: true, clubs: clubs.length });
  return out;
}

module.exports = { onRequest, forgetIn };
