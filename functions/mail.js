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
     one who made that invite (a coach's invite for her own player). An
     invite made for an address goes to that address and no other; one made
     for whoever opens it goes to the address she typed into Email it
     (`to`, build 140): the words are the club's, never hers, so it is no
     more than making an invite for that address would have been.
   - `link` (build 140): the club's other ways in, to the address she typed
     (`to`), in the club's words: `join`, a team's link (teams/{tid}/join,
     the joinCodes entry still this club's team and in date), for an admin
     or that team's coach; `reg`, a program's registration link (its
     regOpen entry this club's and open), for an admin. The link is built
     here from what the club holds, never taken from the ask.
   - `team`: the asker an admin, or a coach or helper of the team
     (postsTo() on the phone: teamIndex names her as coach or helper); the
     addresses are the team's families' (teamParents, held to the squad, as
     every reader list on this server is), from members/, never from the ask;
     the words are hers, cut to a size.
   - `session` (build 137): the families of one or more training sessions'
     places (*Email or share* on a session, *Remind the family* on Fees),
     asked for by an admin or the coach each session names (still a coach);
     the families found from each place as the rules find them (a squad
     record's guardians, or a child on no team's own record), never from the
     ask; `pid` narrows it to one child's places.

   How it sends: index.js hands it `mail({ to, subject, text })`, built from
   the project's SMTP secret (SOCCER_SMTP_URL in Secret Manager, README,
   *Email from the club*) and the from address (SOCCER_MAIL_FROM in
   functions/.env). With no secret there is no mailer, and the answer says
   so (`nomail`): the phone then does what it did before. Nothing in here
   imports Firebase or a mail library; test/mail.js hands it fakes. */

const { where, readTeam } = require('./club');

const ASK_TTL = 10 * 60000;
const MAX_IDS = 200;
const MAX_SIDS = 50;
const TEXT_MAX = 4000;
const okKey = k => typeof k === 'string' && k.length > 0 && k.length <= 128 && !/[.#$\[\]\/]/.test(k);
const has = (o, k) => !!(o && typeof o === 'object' && o[k] !== undefined && o[k] !== null && o[k] !== false);
const keys = o => Object.keys(o && typeof o === 'object' ? o : {});
const okMail = s => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;
const clip = (s, n) => String(s == null ? '' : s).replace(/[\r\n]+/g, ' ').trim().slice(0, n);
// the words of a notice keep their lines
const body = (s, n) => String(s == null ? '' : s).replace(/\r\n?/g, '\n').trim().slice(0, n);
const ROLE_WORDS = { coach: 'a coach', tracker: 'a tracker', helper: 'a team helper', parent: 'a parent', player: 'a player, with your own sign-in', viewer: 'a club viewer', sesscoach: 'a session coach', admin: 'a club admin', fan: 'a fan' };

/* Where a family's email is: her member entry, or, for a family the club
   let in through registration who has none, her account's address, and only
   once it is confirmed (an unconfirmed address could be anybody's, and these
   emails name her child). */
async function addressOf(env, members, u) {
  const em = members && members[u] && members[u].email;
  if (okMail(em)) return String(em).toLowerCase();
  if (typeof env.user !== 'function') return null;
  const a = await env.user(u).catch(() => null);
  return a && a.emailVerified === true && okMail(a.email) ? String(a.email).toLowerCase() : null;
}

/* A booked place's child and family, found as the rules find them: a squad
   record's guardians for a child on a team (`tid`), the child's own record
   for one on no team (`child: true`, or a package's `club`). */
async function placeOf(env, L, pid, tid) {
  if (!okKey(pid)) return null;
  if (tid === 'club') {
    const c = await env.get(`${L.base}/children/${pid}`);
    return c && typeof c === 'object' ? { first: firstOf(c.first), fam: keys({ ...(c.family || {}), ...(c.guardians || {}) }) } : null;
  }
  if (!okKey(tid)) return null;
  const p = await env.get(L.player(tid, pid));
  return p && typeof p === 'object' ? { first: firstOf(p.name), fam: keys(p.guardians) } : null;
}
const placeTid = b => (b && b.child ? 'club' : b && b.tid);
const firstOf = s => clip(s, 80).split(' ')[0] || 'your child';
const money = (sign, n) => { n = Math.round((Number(n) || 0) * 100) / 100; return clip(sign, 3) + (Number.isInteger(n) ? String(n) : n.toFixed(2)); };
const dayWords = d => /^\d{4}-\d\d-\d\d$/.test(String(d || '')) ? new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';
const footerOf = (club, site) => `\n\n— sent by ${club} through TeamPlayHQ${site ? `, ${site}` : ''}`;

/* The invitation, in plain words: who, to what, the link, how long it lasts.
   An invite made for whoever opens it says so, rather than "this address
   only", which would not be true. */
function inviteMail(v, club, site, now) {
  const bound = okMail(v.email), seats = Number(v.max) > 1 || !!(v.seats && keys(v.seats).length > 1);
  const who = clip(v.byName, 80) || 'An admin';
  const what = v.role === 'parent' && v.playerNo ? `the parent of #${clip(v.playerNo, 20)} on ${clip(v.teamName, 80) || 'a team'}`
    : v.team ? `${ROLE_WORDS[v.role] || v.role} of ${clip(v.teamName, 80) || 'a team'}` : ROLE_WORDS[v.role] || v.role;
  const days = Math.max(1, Math.round((Number(v.expiresAt) - now) / 864e5));
  const link = `${site}?invite=${encodeURIComponent(v.id)}`;
  return {
    subject: `${who} has invited you to ${club}`,
    text: [
      `${who} has invited you to join ${club} in TeamPlayHQ as ${what}.`,
      '', bound ? `Open this link on your phone and sign in with this email address to accept it:` : `Open this link on your phone and sign in to accept it:`, link, '',
      bound ? `The link works once, for this address only, and for ${days} day${days === 1 ? '' : 's'}. If you were not expecting it, ignore it: nothing happens until you accept.`
        : `The link works for ${days} day${days === 1 ? '' : 's'}${seats ? '' : ', for the first person to open it, so keep it to yourself'}. If you were not expecting it, ignore it: nothing happens until you accept.`
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
  // an address she typed, for an invite made for whoever opens it
  const typed = ask.to == null ? null : String(ask.to).trim().toLowerCase();
  if (typed !== null && !okMail(typed)) return { ok: false, why: 'bad' };
  const sent = [], skipped = {};
  for (const id of ids) {
    if (!okKey(id)) { skipped[String(id).slice(0, 40)] = 'bad'; continue; }
    const v = await env.get('invites/' + id);
    const bound = v && typeof v === 'object' && okMail(v.email) ? String(v.email).toLowerCase() : null;
    const why = !v || typeof v !== 'object' ? 'gone' : v.ws !== code ? 'gone' : !bound && !typed ? 'noemail'
      : bound && typed && typed !== bound ? 'other'
      : v.used ? 'used' : !(Number(v.expiresAt) > now) ? 'expired' : !(admin || v.by === uid) ? 'notyours' : null;
    if (why) { skipped[id] = why; continue; }
    const m = inviteMail({ ...v, id }, club, env.site, now);
    try { await env.mail({ to: bound || typed, subject: m.subject, text: m.text }); sent.push(id); } catch (e) { skipped[id] = 'failed'; }
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
  const footer = footerOf(club, env.site);
  let sent = 0, failed = 0;
  for (const em of [...to].sort()) {
    try { await env.mail({ to: em, subject, text: text + footer }); sent++; } catch (e) { failed++; }
  }
  return { ok: true, sent, failed, of: to.size };
}

/* A team's link or a program's registration link, to the one address she
   typed. The words are the club's; the link is built from the club's own
   records, so nothing in the ask but an id and an address reaches the mail. */
async function sendLink(env, code, uid, ask, now) {
  const to = String(ask.to == null ? '' : ask.to).trim().toLowerCase();
  if (!okMail(to)) return { ok: false, why: 'bad' };
  const L = await where(env.get, code);
  const [admins, org, members] = await Promise.all([env.get(`${L.access}/admins`), env.get(L.org), env.get(L.members)]);
  const admin = has(admins, uid);
  const club = clip(org && org.name, 80) || 'the club';
  const who = clip(members && members[uid] && members[uid].name, 80);
  let m;
  if (ask.kind === 'join') {
    const tid = ask.tid;
    if (!okKey(tid)) return { ok: false, why: 'bad' };
    const [team, role] = await Promise.all([env.get(L.team(tid)), env.get(`${L.access}/teamIndex/${tid}/${uid}`)]);
    if (!team || typeof team !== 'object') return { ok: false, why: 'gone' };
    if (!(admin || role === 'coach')) return { ok: false, why: 'notyours' };
    const jc = team.join && team.join.code;
    const j = okKey(jc) ? await env.get('joinCodes/' + jc) : null;
    if (!j || typeof j !== 'object' || j.ws !== code || j.team !== tid) return { ok: false, why: 'gone' };
    if (j.expiresAt && !(Number(j.expiresAt) > now)) return { ok: false, why: 'expired' };
    const tn = clip(team.name, 80) || 'the team';
    m = {
      subject: `Join ${tn} at ${club}`,
      text: [`${who || 'The coach'} invites you to join ${tn} at ${club} in TeamPlayHQ.`, '',
        `Open this link on your phone, sign in, and give your child's shirt number (or her details, if she isn't on the squad yet), and a coach will let you in:`,
        `${env.site}?join=${encodeURIComponent(jc)}`].join('\n')
    };
  } else if (ask.kind === 'reg') {
    const prog = ask.prog;
    if (!okKey(prog)) return { ok: false, why: 'bad' };
    if (!admin) return { ok: false, why: 'notyours' };
    const pr = await env.get(`${L.base}/programs/${prog}`);
    const link = pr && typeof pr === 'object' ? pr.link : null;
    const open = okKey(link) ? await env.get('regOpen/' + link) : null;
    if (!open || typeof open !== 'object' || open.ws !== code || open.closed === true || pr.closed) return { ok: false, why: 'gone' };
    const name = clip(pr.name || open.name, 80) || 'the season';
    m = {
      subject: `Register for ${name} at ${club}`,
      text: [`${club} is taking registrations for ${name} in TeamPlayHQ.`, '',
        `Open this link on your phone and sign in to register your child:`, `${env.site}?reg=${encodeURIComponent(link)}`].join('\n')
    };
  } else return { ok: false, why: 'bad' };
  try { await env.mail({ to, subject: m.subject, text: m.text + footerOf(club, env.site) }); } catch (e) { return { ok: true, sent: 0, failed: 1 }; }
  return { ok: true, sent: 1, failed: 0 };
}

/* A training session's families: every place booked, waiting or asked for on
   each session named (one child's, with `pid`), from the club. */
async function sendSession(env, code, uid, ask) {
  const sids = Array.isArray(ask.sids) ? ask.sids : keys(ask.sids).sort((a, b) => Number(a) - Number(b)).map(k => ask.sids[k]);
  const pid = ask.pid == null ? null : ask.pid;
  if (!sids.length || sids.length > MAX_SIDS || !sids.every(okKey) || (pid !== null && !okKey(pid))) return { ok: false, why: 'bad' };
  const text = body(ask.text, TEXT_MAX);
  if (!text) return { ok: false, why: 'bad' };
  const L = await where(env.get, code), T = `training/${code}`;
  const [admins, coach, members, org] = await Promise.all([
    env.get(`${L.access}/admins`), env.get(`${L.access}/coachIndex/${uid}`), env.get(L.members), env.get(L.org)
  ]);
  const admin = has(admins, uid);
  // coachIndex's value is a team she coaches: there at all is what counts
  if (!admin && (coach == null || coach === false)) return { ok: false, why: 'notyours' };
  const fams = new Set();
  for (const sid of sids) {
    const [s, booked] = await Promise.all([env.get(`${T}/sessions/${sid}`), env.get(`${T}/booked/${sid}`)]);
    if (!s || typeof s !== 'object') return { ok: false, why: 'gone' };
    if (!admin && s.coach !== uid) return { ok: false, why: 'notyours' };
    for (const [p, b] of Object.entries(booked && typeof booked === 'object' ? booked : {})) {
      if ((pid !== null && p !== pid) || !b || !['in', 'wait', 'asked'].includes(b.st)) continue;
      const w = await placeOf(env, L, p, placeTid(b));
      for (const u of (w && w.fam) || []) if (u !== uid) fams.add(u);
    }
  }
  const club = clip(org && org.name, 80) || 'the club';
  const subject = clip(ask.subject, 160) || `${club}: a training session`;
  const to = new Set();
  for (const u of fams) { const em = await addressOf(env, members, u); if (em) to.add(em); }
  let sent = 0, failed = 0;
  for (const em of [...to].sort()) {
    try { await env.mail({ to: em, subject, text: text + footerOf(club, env.site) }); sent++; } catch (e) { failed++; }
  }
  return { ok: true, sent, failed, of: to.size };
}

/* mailAsks/{code}/{uid}/{id}: { op: 'invites', ids, to? }, { op: 'link',
   kind, tid | prog, to }, { op: 'team', tid,
   subject, text } or { op: 'session', sids, pid?, subject, text }. Answered
   once at its `answer`. */
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
    if (ask.op === 'link') return say(await sendLink(env, code, uid, ask, now));
    if (ask.op === 'team') return say(await sendTeam(env, code, uid, ask, now));
    if (ask.op === 'session') return say(await sendSession(env, code, uid, ask));
    return say({ ok: false, why: 'bad' });
  } catch (e) {
    return say({ ok: false, why: 'failed' });
  }
}

module.exports = { onAsk, inviteMail, ASK_TTL, okKey, okMail, has, keys, clip, addressOf, placeOf, placeTid, firstOf, money, dayWords, footerOf };
