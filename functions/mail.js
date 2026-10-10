/* Email from the club (SERVER.md, *Joining and starting clubs*, *Email*).

   Two things the app could only do through somebody else's mail until now:

   - **An invitation.** An invite made for an email address (the imported
     roster's, People → Invite with an address) was emailed by Firebase Auth
     as a sign-in link from the admin's own phone, one call at a time
     (mailImported()), worded as a sign-in rather than an invitation and
     stopping at Firebase's daily limit. Now the club sends it: who invited
     her, to what, and the link, from the club's own address.
   - **A team notice to every family.** *Email the parents* opened the coach's
     own mail app with every address in Bcc (sheetPostShare()). Now the club
     sends it, one message per family, so no address is ever in anyone else's
     mail.

   The phone asks at mailAsks/{code}/{uid}/{id} (hers alone in the rules,
   create or delete, never the answer; only an admin or a coach of that club
   may make one), and this answers beside it. It writes with admin
   credentials and sends in the club's name, so it holds the asker to what
   the rules would have:

   - `invites`: each id must be an invite of this club with an email on it,
     not yet spent and not expired, and the asker an admin of the club or the
     one who made that invite (a coach's invite for her own player). The
     address comes from the invite, never from the ask.
   - `team`: the asker an admin, or a coach or helper of the team
     (postsTo() on the phone: teamIndex names her as coach or helper); the
     addresses are the team's families' (teamParents, held to the squad, as
     every reader list on this server is), from members/, never from the ask;
     the words are hers, cut to a size.

   How it sends: index.js hands it `mail({ to, subject, text })`, built from
   the project's SMTP secret (SOCCER_SMTP_URL in Secret Manager, README,
   *Email from the club*) and the from address (SOCCER_MAIL_FROM in
   functions/.env). With no secret there is no mailer, and the answer says
   so (`nomail`): the phone then does what it did before. Nothing in here
   imports Firebase or a mail library; test/mail.js hands it fakes. */

const { where, readTeam } = require('./club');

const ASK_TTL = 10 * 60000;
const MAX_IDS = 200;
const TEXT_MAX = 4000;
const okKey = k => typeof k === 'string' && k.length > 0 && k.length <= 128 && !/[.#$\[\]\/]/.test(k);
const has = (o, k) => !!(o && typeof o === 'object' && o[k] !== undefined && o[k] !== null && o[k] !== false);
const keys = o => Object.keys(o && typeof o === 'object' ? o : {});
const okMail = s => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;
const clip = (s, n) => String(s == null ? '' : s).replace(/[\r\n]+/g, ' ').trim().slice(0, n);
// the words of a notice keep their lines
const body = (s, n) => String(s == null ? '' : s).replace(/\r\n?/g, '\n').trim().slice(0, n);
const ROLE_WORDS = { coach: 'a coach', tracker: 'a tracker', helper: 'a team helper', parent: 'a parent', player: 'a player, with your own sign-in', viewer: 'a club viewer', fan: 'a fan' };

/* The invitation, in plain words: who, to what, the link, how long it lasts. */
function inviteMail(v, club, site, now) {
  const who = clip(v.byName, 80) || 'An admin';
  const what = v.role === 'parent' && v.playerNo ? `the parent of #${clip(v.playerNo, 20)} on ${clip(v.teamName, 80) || 'a team'}`
    : v.team ? `${ROLE_WORDS[v.role] || v.role} of ${clip(v.teamName, 80) || 'a team'}` : ROLE_WORDS[v.role] || v.role;
  const days = Math.max(1, Math.round((Number(v.expiresAt) - now) / 864e5));
  const link = `${site}?invite=${encodeURIComponent(v.id)}`;
  return {
    subject: `${who} has invited you to ${club}`,
    text: [
      `${who} has invited you to join ${club} in Minutes as ${what}.`,
      '', `Open this link on your phone and sign in with this email address to accept it:`, link, '',
      `The link works once, for this address only, and for ${days} day${days === 1 ? '' : 's'}. If you were not expecting it, ignore it: nothing happens until you accept.`
    ].join('\n')
  };
}

async function sendInvites(env, code, uid, ask, now) {
  const L = await where(env.get, code);
  const [admins, org] = await Promise.all([env.get(`${L.access}/admins`), env.get(L.org)]);
  const admin = has(admins, uid);
  const club = clip(org && org.name, 80) || 'a club';
  const ids = Array.isArray(ask.ids) ? ask.ids : keys(ask.ids).sort((a, b) => Number(a) - Number(b)).map(k => ask.ids[k]);
  if (!ids.length || ids.length > MAX_IDS) return { ok: false, why: 'bad' };
  const sent = [], skipped = {};
  for (const id of ids) {
    if (!okKey(id)) { skipped[String(id).slice(0, 40)] = 'bad'; continue; }
    const v = await env.get('invites/' + id);
    const why = !v || typeof v !== 'object' ? 'gone' : v.ws !== code ? 'gone' : !okMail(v.email) ? 'noemail'
      : v.used ? 'used' : !(Number(v.expiresAt) > now) ? 'expired' : !(admin || v.by === uid) ? 'notyours' : null;
    if (why) { skipped[id] = why; continue; }
    const m = inviteMail({ ...v, id }, club, env.site, now);
    try { await env.mail({ to: String(v.email).toLowerCase(), subject: m.subject, text: m.text }); sent.push(id); } catch (e) { skipped[id] = 'failed'; }
  }
  return { ok: true, sent, ...(keys(skipped).length ? { skipped } : {}) };
}

async function sendTeam(env, code, uid, ask, now) {
  const tid = ask.tid;
  if (!okKey(tid)) return { ok: false, why: 'bad' };
  const L = await where(env.get, code);
  const [admins, role, parents, team, members, org] = await Promise.all([
    env.get(`${L.access}/admins`), env.get(`${L.access}/teamIndex/${tid}/${uid}`), env.get(`${L.access}/teamParents/${tid}`),
    readTeam(env.get, L, tid), env.get(L.members), env.get(L.org)
  ]);
  if (!team) return { ok: false, why: 'gone' };
  if (!(has(admins, uid) || role === 'coach' || role === 'helper')) return { ok: false, why: 'notyours' };
  const text = body(ask.text, TEXT_MAX);
  const subject = clip(ask.subject, 160) || `${clip(team.name, 80) || 'Your team'}: a message from the coach`;
  if (!text) return { ok: false, why: 'bad' };
  // the families, held to the squad: the table says which child, the record has to agree
  const squad = team.players || {};
  const to = new Set();
  for (const [u, pid] of Object.entries(parents || {})) {
    if (u === uid || !has(squad[pid] && squad[pid].guardians, u)) continue;
    const em = members && members[u] && members[u].email;
    if (okMail(em)) to.add(String(em).toLowerCase());
  }
  const club = clip(org && org.name, 80) || 'the club';
  const footer = `\n\n— sent by ${club} through Minutes${env.site ? `, ${env.site}` : ''}`;
  let sent = 0, failed = 0;
  for (const em of [...to].sort()) {
    try { await env.mail({ to: em, subject, text: text + footer }); sent++; } catch (e) { failed++; }
  }
  return { ok: true, sent, failed, of: to.size };
}

/* mailAsks/{code}/{uid}/{id}: { op: 'invites', ids } or { op: 'team', tid,
   subject, text }. Answered once at its `answer`. */
async function onAsk(env, params, ask, now = Date.now()) {
  const { code, uid, id } = params || {};
  if (!okKey(code) || !okKey(uid) || !okKey(id)) return { ok: false, why: 'bad' };
  const at = `mailAsks/${code}/${uid}/${id}/answer`;
  if (await env.get(at)) return { ok: false, why: 'answered' };
  const say = async ans => { await env.set(at, { ...ans, at: now }); return ans; };
  if (!ask || typeof ask !== 'object' || !(Math.abs(Number(ask.at) - now) <= ASK_TTL)) return say({ ok: false, why: 'stale' });
  if (typeof env.mail !== 'function') return say({ ok: false, why: 'nomail' });
  if (await env.get('retired/' + code)) return say({ ok: false, why: 'retired' });
  try {
    if (ask.op === 'invites') return say(await sendInvites(env, code, uid, ask, now));
    if (ask.op === 'team') return say(await sendTeam(env, code, uid, ask, now));
    return say({ ok: false, why: 'bad' });
  } catch (e) {
    return say({ ok: false, why: 'failed' });
  }
}

module.exports = { onAsk, inviteMail, ASK_TTL };
