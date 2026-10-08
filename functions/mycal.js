/* My calendar's feed, built by the server (SERVER.md, "My calendar's feed").

   One address per person (people/{uid}/set/feed) that her phone's calendar
   subscribes to, holding everything of hers in every club she is in. Until
   now her own phone built it from what that phone held and wrote it to
   public/{id} (myFeedDoc() and feedPublish() in app.js), so it was only as
   fresh as the last time one of her phones was open with a signal and had
   heard from every club, and a club's typed titles were left out of every
   club but the one open on that phone. Now the server builds it from the
   clubs themselves, a few minutes after anything in it changes, whether or
   not any phone of hers is open.

   **What is hers is worked out in each club, from the roles there, never
   from what she says.** userOrgs/{uid} only says which clubs to look in, and
   she can write it. In each club her items are those of the teams she
   coaches or tracks (access/teams), the teams a child of hers is on (a
   player whose guardians or self list her), the sessions she runs, the
   sessions a child of hers is booked, asked or waiting for, and her own
   bookable times: the same as myCalItems(). A club she has no role in gives
   nothing, and the moment a role is taken away the next build leaves that
   team out, with or without a phone of hers ever opening again.

   **It is public/, so it is built to the same promise as before**: times,
   teams and places, never a child's name. Every typed title and place goes
   through every word of every player's name in that club (as pubText()
   does for the team pages), which is why the server can show the typed
   titles of every club where the phone could show only the open one's. No
   club code reaches it; item ids are clubTag()-hashed exactly as the
   phone's were, so a calendar that subscribed to the phone's feed sees the
   same entries.

   **It writes only her page.** The address must be the one in her own
   setting, claimed by her alone in shareOwners (as setMyFeed() claims it),
   and either not written yet or already a My calendar page (`mine`). So
   naming a team's share link, or somebody else's feed, as her own address
   writes nothing anywhere. The page says `by: 'server'`, which is how her
   phones know to stop writing it themselves.

   **When:** writing a feed on every change would rebuild fifteen families'
   feeds thirty times for a weekly practice added a week at a time. So the
   triggers only mark what changed (serverState/myCal: a club, or a person
   whose own setting or clubs changed), and `run()`, every five minutes,
   rebuilds the feeds those marks reach, reading each club once however many
   feeds it is in. A calendar app comes back hourly at best, so five minutes
   is never what anybody waits for. serverState/ has no rule, so no phone
   reads or writes the marks.

   Nothing in here imports Firebase; index.js hands it `get`, `set`,
   `remove` and `claim` (a transaction). test/mycalfeed.js runs it. */

const { where, readAccess, readTeams } = require('./club');
const keys = o => Object.keys(o && typeof o === 'object' ? o : {});
const has = (o, k) => !!(o && typeof o === 'object' && o[k] !== undefined && o[k] !== null && o[k] !== false);
const okKey = k => typeof k === 'string' && k.length > 0 && !/[.#$\[\]\/]/.test(k);
const okId = k => typeof k === 'string' && /^[A-Za-z0-9_-]{6,80}$/.test(k);

const CAL_KIND = { practice: 'Practice', event: 'Event' };
const CALLED = { cancelled: 'Cancelled', postponed: 'Postponed' };
const BOOKED = { in: true, asked: true, wait: true };
const SANDBOX_PREFIX = 'test-';
const FEED_BACK_DAYS = 60, FEED_MAX = 400;
const MARKS = 'serverState/myCal';

const okDay = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const pad2 = n => String(n).padStart(2, '0');
const hm = t => { const x = /^(\d{1,2}):(\d{2})/.exec(String(t || '')); return x ? pad2(x[1]) + ':' + x[2] : ''; };
const minOf = t => { const x = /^(\d{1,2}):(\d{2})/.exec(String(t || '')); return x ? Number(x[1]) * 60 + Number(x[2]) : 0; };
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const dayStr = ms => new Date(ms).toISOString().slice(0, 10);

/* clubTag() from app.js (cyrb53), so the feed's ids match the phone's. */
function clubTag(code) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (const ch of 'club:' + code) { const c = ch.charCodeAt(0); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/* replaceNames() from app.js, and every word of every name in the club. */
function replaceNames(text, subs) {
  subs = subs.slice().sort((a, b) => b[0].length - a[0].length);
  for (const [from, to] of subs) {
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'giu');
    text = text.replace(re, (all, pre) => pre + to);
  }
  return text;
}
function clubScrub(teams) {
  const subs = [];
  for (const t of Object.values(teams || {}))
    for (const p of Object.values((t && t.players) || {})) {
      const full = String((p && p.name) || '').trim();
      if (!full) continue;
      subs.push([full, 'a player']);
      for (const w of full.split(/\s+/)) if (w.length >= 2) subs.push([w, 'a player']);
    }
  return s => (s ? replaceNames(String(s), subs) : '');
}

/* One run's reads: each path asked for once, however many feeds need it. */
function memo(env) {
  const seen = new Map();
  return p => { if (!seen.has(p)) seen.set(p, Promise.resolve(env.get(p)).catch(() => undefined)); return seen.get(p); };
}

/* Everything one club holds of hers, already as the feed carries it.
   Resolves to [key, item] pairs; `undefined` if the club could not be read,
   so a database that is down never empties her calendar. */
async function clubItems(read, uid, code) {
  if (!okKey(code) || code.startsWith(SANDBOX_PREFIX)) return [];
  const T = `training/${code}/`;
  const L = await where(read, code);
  const [retired, access, teams, matches, sessions, booked, avail] = await Promise.all([
    read('retired/' + code), readAccess(read, L), readTeams(read, L), read(L.matches),
    read(T + 'sessions'), read(T + 'booked'), read(T + 'avail')
  ]);
  if (retired || (access && access.org && access.org.sandbox)) return [];
  if (access === undefined || teams === undefined || matches === undefined) return undefined;
  const acc = access || {}, ts = teams || {};
  const club = String((acc.org || {}).name || '');
  const scrub = clubScrub(ts);
  const venues = (acc.org || {}).venues || {};
  const placeOf = x => { const f = venues[x.field]; const p = String(x.place || '').slice(0, 120); return f && f.name ? f.name + (p ? ', ' + p : '') : p; };

  // myRoleTeams() and myPlayers(): what she works on, and her children
  const mine = new Set(), kids = new Set();
  for (const [tid, ta] of Object.entries(acc.teams || {}))
    if (ts[tid] && (has(ta && ta.coaches, uid) || has(ta && ta.trackers, uid))) mine.add(tid);
  for (const [tid, t] of Object.entries(ts))
    for (const [pid, p] of Object.entries((t && t.players) || {}))
      if (p && (has(p.guardians, uid) || has(p.self, uid))) { mine.add(tid); kids.add(pid); }

  const out = [];
  const add = (key, doc) => out.push(['k' + clubTag(code + '|' + key), doc]);
  const timed = (doc, x) => {
    if (hm(x.start)) doc.start = hm(x.start);
    if (hm(x.end)) doc.end = hm(x.end);
    return doc;
  };
  for (const tid of mine) {
    const t = ts[tid] || {}, team = String(t.name || '');
    for (const [mid, m] of Object.entries(matches || {})) {
      if (!m || m.teamId !== tid || !okDay(m.date)) continue;
      const doc = { title: `${team || 'Game'} ${scrub('v ' + (m.opponent || 'TBC'))}`.trim(), date: m.date, called: CALLED[m.called] ? m.called : '' };
      if (hm(m.kickoff)) doc.start = hm(m.kickoff);
      doc.mins = (m.periodCount || 2) * (m.periodMinutes || 40) + 15;
      const venue = scrub(m.venue);
      if (venue) doc.venue = venue;
      doc.desc = club;
      add('g:' + (m.id || mid), doc);
    }
    for (const [eid, e] of Object.entries(t.events || {})) {
      if (!e || typeof e !== 'object' || !okDay(e.date)) continue;
      const kind = e.kind === 'practice' ? 'practice' : 'event';
      const doc = timed({ title: `${team ? team + ': ' : ''}${scrub(e.title || CAL_KIND[kind]) || CAL_KIND[kind]}`.trim(), date: e.date, called: CALLED[e.called] ? e.called : '' }, e);
      const venue = scrub(e.venue);
      if (venue) doc.venue = venue;
      doc.desc = club;
      add('e:' + eid, doc);
    }
  }
  // the sessions she runs, and her children's (booked, asked for, or waiting)
  for (const [sid, s] of Object.entries(sessions || {})) {
    if (!s || typeof s !== 'object' || !okDay(s.date)) continue;
    const run = String(s.coach || '') === uid;
    const hers = keys((booked || {})[sid]).some(pid => kids.has(pid) && BOOKED[(((booked || {})[sid] || {})[pid] || {}).st]);
    if (!run && !hers) continue;
    const title = String(s.title || '').slice(0, 80) || (s.kind === 'one' ? '1-1 session' : 'Group session');
    const doc = timed({ title: (run ? scrub(title) : 'Training: ' + scrub(title)).trim(), date: s.date, called: CALLED[s.called] ? s.called : '' }, s);
    const venue = scrub(placeOf(s));
    if (venue) doc.venue = venue;
    doc.desc = club;
    add('s:' + String(s.id || sid), doc);
  }
  // the times she has offered
  for (const [bid, b] of Object.entries(avail || {})) {
    if (!b || typeof b !== 'object' || String(b.coach || '') !== uid || !okDay(b.date)) continue;
    if (!hm(b.start) || !hm(b.end) || minOf(b.end) <= minOf(b.start)) continue;
    const group = b.kind === 'group', cap = group ? clamp(Math.round(Number(b.cap)) || 6, 1, 60) : 1;
    const label = String(b.title || '').slice(0, 80) || (group ? `Small group, ${cap} places` : '1-1s');
    const doc = timed({ title: 'Bookable: ' + scrub(label), date: b.date, called: b.off === true ? 'cancelled' : '' }, b);
    const venue = scrub(placeOf(b));
    if (venue) doc.venue = venue;
    doc.desc = club;
    add('a:' + String(b.id || bid), doc);
  }
  return out;
}

/* calOrder(), on what the feed carries: date, then time, games first. */
const order = ([, a], [, b]) => a.date.localeCompare(b.date) || String(a.start || '').localeCompare(String(b.start || ''))
  || ((a.mins ? 0 : 1) - (b.mins ? 0 : 1));

/* Her items across every club she is in. Undefined if any club could not be
   read: better an hour-old feed than one with a club missing. */
async function feedItems(read, uid, now) {
  const clubs = keys(await read('userOrgs/' + uid)).filter(okKey).sort();
  const from = dayStr(now - FEED_BACK_DAYS * 864e5);
  const all = [];
  for (const code of clubs) {
    const xs = await clubItems(read, uid, code);
    if (xs === undefined) return undefined;
    all.push(...xs);
  }
  const items = {};
  let n = 0;
  for (const [k, doc] of all.filter(([, d]) => d.date >= from).sort(order)) {
    if (n >= FEED_MAX) break;
    if (!items[k]) { items[k] = doc; n++; }
  }
  return items;
}

/* Rebuild one person's feed, if she has one and it is hers to have. */
async function publish(env, read, uid, now) {
  if (!okKey(uid)) return 'bad uid';
  const id = await read(`people/${uid}/set/feed`);
  if (!okId(id)) return 'no feed';
  // her claim, and hers alone, as setMyFeed() makes it
  const owners = await read('shareOwners/' + id);
  if (!has(owners, uid) || keys(owners).length !== 1) return 'not hers';
  const page = await read('public/' + id);
  if (page && (typeof page !== 'object' || page.mine !== true)) return 'not a my calendar page';
  const items = await feedItems(read, uid, now);
  if (items === undefined) return 'unreadable';
  const app = String((page && page.link && page.link.app) || '');
  const doc = { team: { name: 'My calendar' }, mine: true, by: 'server', items, updated: now };
  if (/^https:\/\//.test(app)) doc.link = { app };
  // unchanged: leave it, so a calendar that asks sees the same page
  if (page && page.by === 'server' && JSON.stringify(page.items || {}) === JSON.stringify(items)) return 'same';
  await env.set('public/' + id, doc);
  return 'written';
}

/* The marks. A club: something in it that is on somebody's calendar changed.
   A person: her own address, or the clubs she is in. */
const touchClub = (env, code, now = Date.now()) => okKey(code) && !String(code).startsWith(SANDBOX_PREFIX)
  ? env.set(`${MARKS}/clubs/${code}`, now) : Promise.resolve();
const touchPerson = (env, uid, now = Date.now()) => okKey(uid) ? env.set(`${MARKS}/people/${uid}`, now) : Promise.resolve();

/* Every five minutes: the feeds the marks reach, each club read once. A mark
   made while this ran is left for the next run (it is removed only if it
   still says what was read). */
async function run(env, now = Date.now()) {
  const [clubs, people] = await Promise.all([env.get(`${MARKS}/clubs`), env.get(`${MARKS}/people`)]);
  if (!keys(clubs).length && !keys(people).length) return {};
  const read = memo(env);
  const who = new Set(keys(people).filter(okKey));
  // everyone in a club that changed: the club's own index says who is in it
  for (const code of keys(clubs).filter(okKey)) for (const u of keys(await read(`${(await where(read, code)).access}/index`))) if (okKey(u)) who.add(u);
  const out = {};
  for (const uid of [...who].sort()) {
    try { out[uid] = await publish(env, read, uid, now); } catch (e) { out[uid] = 'failed'; }
  }
  const failed = new Set(Object.entries(out).filter(([, r]) => r === 'unreadable' || r === 'failed').map(([u]) => u));
  const done = (p, at) => env.claim(p, cur => (cur === at ? null : undefined));
  for (const [code, at] of Object.entries(clubs || {})) await done(`${MARKS}/clubs/${code}`, at);
  // somebody whose feed could not be built keeps her own mark, and is tried again
  for (const [uid, at] of Object.entries(people || {})) if (!failed.has(uid)) await done(`${MARKS}/people/${uid}`, at);
  for (const uid of failed) await env.set(`${MARKS}/people/${uid}`, now);
  return out;
}

module.exports = { run, publish, feedItems, clubItems, touchClub, touchPerson, clubTag, MARKS, FEED_BACK_DAYS, FEED_MAX };
