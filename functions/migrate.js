/* Old data moved once, by the server (SERVER.md, *Moving old data*).

   Two kinds of record are still in a shape from before, and until now the
   first phone that opened them moved them, so every phone carried that code
   for ever and a team whose coach never opened the app kept the old shape:

   - **A practice plan with no calendar entry** (`movePlans()` in app.js).
     Plans hang off the practice they are for (`training/{code}/practices/
     {tid}/{eid}`, TRAINING-NEXT.md); one made before that carries its own
     date, time and place and no `eid`. It gets a practice entry under its own
     id, made from those (team-only, the calendar's default), and its `eid`.
     The plan's own id is what makes this safe beside the phones: a phone
     moving the same plan at the same moment writes the same entry to the
     same place, and `eid` is what stops either running twice, or bringing
     back an entry somebody deleted on purpose.
   - **The coach's notes still on a child's record** on orgs/ (SECURITY.md,
     SEC-D10; `moveCoachNotes()`): her note, rating, pairs and avoid, which
     the child's family and the child read there, belong at
     `coachNotes/{tid}/{pid}`, which only coaches and admins read. Each field
     goes there unless something is there already (a newer note, written
     since), and comes off the record in the same write, so nothing is ever
     in both places or neither.

   **Once.** `run()` is scheduled daily (index.js, `migrateOld`) and does
   nothing at all once serverState/migrated/v1/done is set, which it sets
   after a run in which every club went through. A club that fails is tried
   again the next day; a club that went through is never read again. Then
   the phones' halves, and this file, can be deleted (SERVER.md).

   Clubs are found from userOrgs (every club anybody is in has a bookmark
   there), never by reading the whole database. A retired club, and a club
   being moved (serverState/moving), are left for another day.

   Nothing in here imports Firebase: index.js hands it `get`, `set` and
   `update` (a multi-path write at the root) on the default database;
   test/migrate.js hands it the fake server. */

const { where } = require('./club');

const RUN = 'serverState/migrated/v1';
const COACH_FIELDS = ['note', 'rating', 'pairs', 'avoid'];
const keys = o => Object.keys(o && typeof o === 'object' ? o : {});
const okKey = k => typeof k === 'string' && k.length > 0 && !/[.#$\[\]\/]/.test(k);
const okDay = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const pad2 = n => String(n).padStart(2, '0');
// app.js's addMins(): a practice that runs past midnight ends on the clock, not on 25:00
const addMins = (hhmm, n) => { const [h, m] = hhmm.split(':').map(Number); const t = ((h * 60 + m + n) % 1440 + 1440) % 1440; return pad2(Math.floor(t / 60)) + ':' + pad2(t % 60); };

/* A multi-path write, split in two and tried again whenever the database
   refuses it for waking too many function runs (TOO_MANY_TRIGGERS: an entry
   wakes the share pages, the calendar push and My calendar's mark; a
   child's record its roster and share page). Each half is still whole for
   what it holds: an entry with its plan's eid, a note with its removal. */
async function write(env, groups) {
  if (!groups.length) return;
  const patch = Object.assign({}, ...groups);
  try { await env.update(patch); } catch (e) {
    if (groups.length < 2 || !/TOO_MANY_TRIGGERS/.test(String((e && e.message) || e))) throw e;
    const mid = Math.ceil(groups.length / 2);
    await write(env, groups.slice(0, mid));
    await write(env, groups.slice(mid));
  }
}
const BATCH = 100;
async function inBatches(env, groups) {
  for (let i = 0; i < groups.length; i += BATCH) await write(env, groups.slice(i, i + BATCH));
}

/* The plans of one club still with no entry: each a group of two writes,
   the entry (only where there is none) and the plan's eid. A plan whose id
   is already taken by something that is not a practice is left alone; so
   is one whose team has gone. */
async function planGroups(env, code, L, now) {
  const practices = await env.get(`training/${code}/practices`);
  const out = [];
  for (const [tid, plans] of Object.entries(practices && typeof practices === 'object' ? practices : {})) {
    if (!okKey(tid) || !plans || typeof plans !== 'object') continue;
    const old = Object.entries(plans).filter(([pid, raw]) => raw && typeof raw === 'object' && !raw.eid && /^[\w-]+$/.test(pid) && okDay(raw.date));
    if (!old.length) continue;
    const t = await env.get(L.team(tid));
    if (!t || typeof t !== 'object') continue;
    for (const [pid, raw] of old) {
      const here = (t.events || {})[pid];
      const g = { [`training/${code}/practices/${tid}/${pid}/eid`]: pid };
      if (here) { if (typeof here !== 'object' || here.kind !== 'practice') continue; }
      else {
        // normPractice(): what the phone would have read off the plan
        const start = /^\d{2}:\d{2}$/.test(String(raw.start || '')) ? String(raw.start) : '';
        const mins = Number(raw.minutes) > 0 ? Math.min(Number(raw.minutes), 600) : 60;
        /* The entry is a practice the team has had on its plans all along,
           not news: the push sender keeps the last thing it said of each entry
           at serverState/calSent (push.js, calSig()), so this is written as
           already said, in the same write, and nobody is told of a "new"
           practice they planned months ago. */
        g[`serverState/calSent/${code}/e_${pid}`] = { sig: [String(raw.date), start, ''].join('|'), at: now };
        g[`${L.team(tid)}/events/${pid}`] = {
          id: pid, kind: 'practice', title: 'Practice', date: String(raw.date), start, end: start ? addMins(start, mins) : '',
          venue: String(raw.place == null ? '' : raw.place), notes: '', public: false, createdAt: Number(raw.made) || now,
          ...(raw.by ? { by: String(raw.by) } : {})
        };
      }
      out.push(g);
    }
  }
  return out;
}

/* The coach's notes still on a child's record. One group per child. */
async function noteGroups(env, L) {
  const [squad, notes] = await Promise.all([env.get(`${L.base}/squad`), env.get(`${L.base}/coachNotes`)]);
  const out = [];
  for (const [tid, ps] of Object.entries(squad && typeof squad === 'object' ? squad : {})) {
    if (!okKey(tid)) continue;
    for (const [pid, rec] of Object.entries(ps && typeof ps === 'object' ? ps : {})) {
      if (!okKey(pid) || !rec || typeof rec !== 'object') continue;
      const g = {};
      for (const f of COACH_FIELDS) {
        if (rec[f] === undefined || rec[f] === null) continue;
        const have = ((((notes || {})[tid] || {})[pid]) || {})[f];
        if (have === undefined || have === null) g[`${L.base}/coachNotes/${tid}/${pid}/${f}`] = rec[f];
        g[`${L.base}/squad/${tid}/${pid}/${f}`] = null;
      }
      if (keys(g).length) out.push(g);
    }
  }
  return out;
}

async function migrateClub(env, code, now) {
  const [retired, moving] = await Promise.all([env.get('retired/' + code), env.get('serverState/moving/' + code)]);
  if (retired) return { skipped: 'retired' };
  if (moving) return { later: 'moving' };
  const L = await where(env.get, code);
  if (!(await env.get(L.access))) return { skipped: 'no club' };
  const plans = await planGroups(env, code, L, now);
  const notes = await noteGroups(env, L);
  await inBatches(env, plans);
  await inBatches(env, notes);
  return { plans: plans.length, notes: notes.length };
}

/* Every club anybody is in, once. Resolves to what each club came to. */
async function run(env, now = Date.now()) {
  if (await env.get(`${RUN}/done`)) return { done: true };
  const people = await env.get('userOrgs');
  const codes = new Set();
  for (const clubs of Object.values(people && typeof people === 'object' ? people : {})) for (const c of keys(clubs)) if (okKey(c)) codes.add(c);
  const finished = (await env.get(`${RUN}/clubs`)) || {};
  const out = {};
  let left = 0;
  for (const code of [...codes].sort()) {
    if (finished[code]) continue;
    try {
      const r = out[code] = await migrateClub(env, code, now);
      if (r.later) { left++; continue; }
      await env.set(`${RUN}/clubs/${code}`, { at: now, ...r });
    } catch (e) {
      left++;
      out[code] = { failed: String((e && e.message) || e).slice(0, 200) };
    }
  }
  if (!left) await env.set(`${RUN}/done`, now);
  return out;
}

module.exports = { run, migrateClub, planGroups, noteGroups, RUN };
