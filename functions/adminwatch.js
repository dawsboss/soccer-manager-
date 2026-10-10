/* Every admin hears when the admin list changes (SECURITY.md, SEC-D8).

   The rules now let only a club owner take an admin away, but a rule cannot
   say whether a change was rightful, and an owner's account can be taken
   over like anyone's. So whoever is given or loses admin, or owner, the
   club's admins and owners are all told at once, the person it happened to
   included (her phones are hers, not the club's, so a removed admin still
   hears it), and the change is written to clubAudit/{code}, which admins
   read and no phone can write. access/log is the phones' own diary of the
   same thing; a phone can leave an entry out, the server cannot.

   Who did it comes from that diary: the app logs a role change just before
   making it, and the rules hold each entry's `by` to the writer's own uid, so
   a fresh entry about this person and this role names who did it. With no
   such entry (an older app, or a change made by hand) nobody is named, and
   the message says so; that is itself worth an admin's attention.

   Not something she can turn off: muting is for club news, and this is about
   who controls the club. Nothing in here imports Firebase; index.js hands it
   `get`, `set` (clubAudit/ only), `remove` and `send` on the event's own
   database, and `claim`, a transaction for the one note it keeps. */

const { where, readAccess } = require('./club');
const { messagesFor, deliver } = require('./push');

const FRESH_MS = 5 * 60000;
const keys = o => Object.keys(o && typeof o === 'object' ? o : {});
const has = (o, k) => !!(o && typeof o === 'object' && o[k] !== undefined && o[k] !== null && o[k] !== false);
const okId = s => typeof s === 'string' && /^[^.#$\[\]\/]{1,128}$/.test(s);
const NONE = { to: [], sent: 0, failed: 0, removed: [], audit: null };

/* What happened, in the words the app logs it with and the record keeps. */
const ACTS = {
  admin: { on: 'made admin', off: 'removed admin' },
  owner: { on: 'made owner', off: 'removed owner' }
};

/* The freshest diary entry about this person and this role, if it is fresh. */
function whoDid(log, uid, kind, now) {
  let best = null;
  for (const e of Object.values(log && typeof log === 'object' ? log : {})) {
    if (!e || typeof e !== 'object' || e.target !== uid || typeof e.act !== 'string' || !e.act.includes(kind)) continue;
    if (!(typeof e.at === 'number' && now - e.at <= FRESH_MS && e.at <= now + 60000)) continue;
    if (!okId(e.by)) continue;
    if (!best || e.at > best.at) best = e;
  }
  return best;
}

/* `kind` is 'admin' or 'owner'; before and after are the entry's values. */
async function onChange(env, params, kind, before, after, now = Date.now()) {
  if (!ACTS[kind] || !params || !okId(params.code) || !okId(params.uid)) return NONE;
  const was = before !== null && before !== undefined && before !== false;
  const is = after !== null && after !== undefined && after !== false;
  if (was === is) return NONE;          // a value rewritten, nobody given or taken away
  const { code, uid } = params;
  if (await env.get('retired/' + code)) return NONE;
  // a redelivered event says nothing twice
  if (params.eid && !(await env.claim(`serverState/roleSent/${code}/${String(params.eid).replace(/[.#$\[\]\/]/g, '_')}`, cur => (cur ? undefined : now)))) return NONE;
  const L = await where(env.get, code);
  const access = (await readAccess(env.get, L)) || {};
  const log = await env.get(L.base + '/log');
  const name = u => {
    const m = (access.members || {})[u];
    return (m && typeof m === 'object' && typeof m.name === 'string' && m.name.slice(0, 80)) || '';
  };
  const act = ACTS[kind][is ? 'on' : 'off'];
  const e = whoDid(log, uid, kind, now);
  const by = e ? e.by : null;
  const byName = by ? (name(by) || (typeof e.byName === 'string' ? e.byName.slice(0, 80) : '') || 'An admin') : null;
  const targetName = name(uid) || 'Someone';
  const club = ((access.org || {}).name && String(access.org.name).slice(0, 80)) || 'your club';

  const audit = { at: now, act, target: uid, targetName, by, byName };
  const key = `${now}_${kind}_${uid}`.replace(/[.#$\[\]\/]/g, '_');
  await env.set(`clubAudit/${code}/${key}`, JSON.parse(JSON.stringify(audit)));

  /* Everyone who runs the club now, and the person it happened to; never the
     one who did it, who knows. */
  const people = new Set([...keys(access.admins), ...keys(access.owners), uid].filter(okId));
  if (by) people.delete(by);
  const role = kind === 'admin' ? 'an admin' : 'an owner';
  const how = by ? '' : ' Nobody is recorded as doing it.';
  const body = u => u === uid
    ? (is ? `${byName || 'Someone'} made you ${role} of ${club}.` : `${byName || 'Someone'} took away your place as ${role} of ${club}.`) + how
    : (is ? `${byName || 'Someone'} made ${targetName} ${role}.` : `${targetName} is no longer ${role}${by ? `: ${byName} took it away` : ''}.`) + how;
  const list = await messagesFor(env, people, u => ({
    title: `${club} · who runs the club`, body: body(u), tag: 'role_' + key, code, hash: '#/club/settings', urgent: '1'
  }), null);
  return { to: [...people].sort(), ...(await deliver(env, list)), audit };
}

module.exports = { onChange, whoDid, ACTS, FRESH_MS };
