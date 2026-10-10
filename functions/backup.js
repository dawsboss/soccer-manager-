/* Nightly backups, without anybody remembering (SERVER.md, *Backups and
   imports*).

   Until this a backup was an admin tapping *Download a copy* (backupDoc() in
   app.js), which is a file on her phone, as current as the last time she
   thought of it. Now a scheduled run writes every club to the project's own
   Cloud Storage bucket once a day, and keeps the last KEEP_DAYS of them.

   What is kept of a club: everything the club holds under orgs/{code}
   (teams, squads, the coach's notes, games, answers, children's records
   and all), its training records (training/{code}), its notices and
   conversations (board/, dm/, staffdm/) and the admin's list of invites
   (clubInvites/). The bucket is the project's, private, readable with
   Firebase credentials alone: nothing is ever written to public/, and no
   phone reads a backup. A family's care details are in it, which a phone's
   backup leaves out on purpose (AUTH.md, *Care*): this one does not go
   wherever files go, and a restore that lost them would be the worse
   failure. A retired club and a test club are left out.

   Every club is found from userOrgs (every club anybody is in has a
   bookmark there), never by reading orgs/ whole. One file per club per day,
   backups/{code}/{date}.json, written whole, so a run cut off part way
   leaves yesterday's copy untouched; the run's own note at
   serverState/backups/{code} says when and how big.

   Nothing in here imports Firebase. index.js hands it `get` on the default
   database, `set` for its note, and the bucket as `save`, `list` and
   `remove`; test/backup.js hands it the fake ones. */

const KEEP_DAYS = 30;
const SANDBOX_PREFIX = 'test-';
const keys = o => Object.keys(o && typeof o === 'object' ? o : {});
const okKey = k => typeof k === 'string' && k.length > 0 && !/[.#$\[\]\/]/.test(k);
const dayStr = ms => new Date(ms).toISOString().slice(0, 10);

/* Everything of one club, as one document. `undefined` for a club that
   could not be read whole: better no file today than a half one. */
async function clubDoc(env, code, now) {
  const parts = {
    club: `orgs/${code}`, training: `training/${code}`, board: `board/${code}`, dm: `dm/${code}`,
    staffdm: `staffdm/${code}`, clubInvites: `clubInvites/${code}`
  };
  const out = { code, savedAt: now, by: 'server' };
  for (const [k, p] of Object.entries(parts)) {
    let v;
    try { v = await env.get(p); } catch (e) { return undefined; }
    if (v != null) out[k] = v;
  }
  return out;
}

async function backupClub(env, code, now) {
  if (!okKey(code) || code.startsWith(SANDBOX_PREFIX)) return { skipped: 'test club' };
  const [retired, org] = await Promise.all([env.get('retired/' + code), env.get(`orgs/${code}/org`)]);
  if (retired) return { skipped: 'retired' };
  if (org && org.sandbox) return { skipped: 'test club' };
  const doc = await clubDoc(env, code, now);
  if (!doc) return { failed: 'unreadable' };
  if (!doc.club) return { skipped: 'no club' };
  const text = JSON.stringify(doc);
  const path = `backups/${code}/${dayStr(now)}.json`;
  await env.save(path, text);
  // yesterday's and older, past the window, go; today's and the rest stay
  const keep = dayStr(now - KEEP_DAYS * 864e5);
  for (const name of await env.list(`backups/${code}/`)) {
    const m = /\/(\d{4}-\d{2}-\d{2})\.json$/.exec(name);
    if (m && m[1] < keep) await env.remove(name);
  }
  await env.set(`serverState/backups/${code}`, { at: now, bytes: text.length, file: path });
  return { bytes: text.length, file: path };
}

/* Once a night: every club, one at a time. A club that fails is noted and
   the rest still go; it is tried again tomorrow. */
async function run(env, now = Date.now()) {
  const people = await env.get('userOrgs');
  const codes = new Set();
  for (const clubs of Object.values(people && typeof people === 'object' ? people : {})) for (const c of keys(clubs)) if (okKey(c)) codes.add(c);
  const out = {};
  for (const code of [...codes].sort()) {
    try { out[code] = await backupClub(env, code, now); } catch (e) { out[code] = { failed: String((e && e.message) || e).slice(0, 200) }; }
  }
  return out;
}

module.exports = { run, backupClub, clubDoc, KEEP_DAYS };
