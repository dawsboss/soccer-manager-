/* Booking a coach's time, as one server call (SERVER.md, *Bookable times and
   training sessions*; AVAILABILITY.md).

   Until this, a family's phone booked a slot itself, in three writes the
   rules checked one at a time: the session (first family only), a numbered
   seat, then her child's booking naming it. A rule cannot count, search or do
   dates, so the coach's window had to carry what they looked up instead (the
   slots it still offered, worked out on the coach's or an admin's phone; one
   key per place), and three things stayed open: a practice added from another
   phone was bookable until one of theirs next drew the app, a seat taken with
   no booking behind it waited ten minutes for the coach's phone to let it go,
   and one child could hold two seats by hand. A full group could only say no.

   Now the family's phone asks, `bookAsks/{code}/{uid}/{id}` (hers alone in
   the rules, create or delete, never the answer), and this answers beside it:

   - who: she is in the club and a guardian of the child on the squad, the
     same two things the rules checked;
   - when: the start is on the window's grid, the window is not taken off, the
     slot has not started, and (to cancel) the coach's notice has not begun;
   - the coach is free: her teams' practices and games, the other sessions
     she runs, her time off and her busy times at other clubs, read here and
     now rather than as some phone last saw them. A call-out frees her from
     its entry, as on the planner;
   - the child is free: her team's practices and games, and any other session
     she is in or asking for;
   - the place: inside one transaction on the session's bookings, counted, so
     two families can never both have the last place, and a child is booked
     once per session by construction (bookings are keyed by child). A full
     slot puts her on its waiting list if she asked for that, and the first
     on it is moved in the moment a place comes free (onBooked, below).

   Nothing here imports Firebase; index.js hands it `get`, `set`, `remove`,
   `claim` (a transaction) and `dated` (one day's records under a path), and
   test/book.js hands it the fake ones. It writes with admin credentials, so
   it checks the asker against the club rather than trusting the ask. A
   booking still needs a signal, as it did: first come, first served is a
   promise only the club's copy can keep. */

const { where } = require('./club');

// a phone's clock can be minutes out, so this is wide; a phone that gave up deletes its ask, which says so better
const ASK_TTL = 10 * 60000;
const H = 3600000;
const WANT_MAX = 280;
const okId = s => typeof s === 'string' && /^[^.#$\[\]\/]{1,128}$/.test(s);
const okDay = d => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
const hm = t => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '')); return m ? m[1].padStart(2, '0') + ':' + m[2] : ''; };
const minOf = t => { const [h, m] = hm(t).split(':').map(Number); return h * 60 + m; };
const clockOf = m => String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const has = (o, k) => !!(o && typeof o === 'object' && o[k] !== undefined && o[k] !== null && o[k] !== false);
const obj = v => (v && typeof v === 'object' ? v : {});
// the same id the app gives a slot (`slotSid()`), so the coach's screens find it
const slotSid = (coach, date, start) => 'k_' + coach + '_' + date + '_' + start.replace(':', '');
// [a, b) in minutes of the day, as busyItems() spans them
const span = (start, end, mins) => { const a = minOf(start); let b = hm(end) ? minOf(end) : a + (mins || 60); if (b <= a) b += 1440; return [a, b]; };
const weekday = d => { const [y, m, da] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, da)).getUTCDay(); };

/* clubTag() from app.js (cyrb53): her busy times at other clubs are filed by
   it, and this club's own are left out, as elsewhereOn() leaves them. */
function clubTag(code) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (const ch of 'club:' + code) { const c = ch.charCodeAt(0); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/* The window's grid: every start a slot of `len` minutes fits from its start
   to its end, as blockSlots() cuts it. */
function grid(b) {
  const out = [];
  const len = Math.round(Number(b.len)) || 60;
  if (!hm(b.start) || !hm(b.end) || len < 15) return out;
  for (let a = minOf(b.start); a + len <= minOf(b.end) && out.length < 48; a += len) out.push(clockOf(a));
  return out;
}

/* When a slot starts, as a timestamp. The coach's phone writes `day0`, its
   own midnight on that date, because only it knows the club's time zone; a
   window from before this carries each slot's start in `slots` instead.
   Failing both, UTC, which is at worst a few hours out for "has it started". */
function slotAt(b, start) {
  if (Number.isFinite(Number(b.day0)) && Number(b.day0) > 0) return Number(b.day0) + minOf(start) * 60000;
  const listed = obj(obj(b.slots)['t' + start.replace(':', '')]);
  if (Number(listed.at) > 0) return Number(listed.at);
  const [y, m, d] = b.date.split('-').map(Number);
  return Date.UTC(y, m - 1, d) + minOf(start) * 60000;
}

/* Her time off, in spans on one date: awaySpans() in app.js. */
function awaySpans(r, date) {
  if (!r || typeof r !== 'object') return [];
  const hours = hm(r.start) && hm(r.end) && minOf(r.end) > minOf(r.start) ? [minOf(r.start), minOf(r.end)] : [0, 1440];
  if (r.kind === 'weekly') {
    const days = Object.values(obj(r.days)).map(Number);
    if (!days.includes(weekday(date)) || (okDay(r.from) && date < r.from) || (okDay(r.to) && date > r.to)) return [];
    return [hours];
  }
  if (r.kind === 'dates') {
    const to = okDay(r.to) && r.to >= r.from ? r.to : r.from;
    return okDay(r.from) && date >= r.from && date <= to ? [hours] : [];
  }
  return [];
}

/* One day's games and entries for some teams, as [a, b) spans with what they
   are, each read once however many questions are asked of it. */
async function teamDay(env, L, tids, date) {
  const out = [];
  if (!tids.length) return out;
  const [games, ...events] = await Promise.all([env.dated(L.matches, date), ...tids.map(t => env.get(L.team(t) + '/events'))]);
  tids.forEach((tid, i) => {
    for (const [id, e] of Object.entries(obj(events[i]))) {
      if (!e || typeof e !== 'object' || e.date !== date || e.called || !hm(e.start)) continue;
      const [a, b] = span(e.start, e.end, 60);
      out.push({ key: 'e:' + id, tid, a, b, what: e.title || (e.kind === 'practice' ? 'a practice' : 'a team event') });
    }
  });
  for (const [id, m] of Object.entries(obj(games))) {
    if (!m || typeof m !== 'object' || m.date !== date || m.called || !hm(m.kickoff) || !tids.includes(m.teamId)) continue;
    const mins = (Number(m.periodCount) || 2) * (Number(m.periodMinutes) || 40) + 15;
    const [a, b] = span(m.kickoff, '', mins);
    out.push({ key: 'g:' + id, tid: m.teamId, a, b, what: 'a game' });
  }
  return out;
}

/* Is the coach due anywhere else during [a, b) on `date`? What she is due at,
   or null. `sid` is the slot being booked, which is never its own clash. */
async function coachBusy(env, L, code, coach, date, a, b, sid, sessions) {
  const T = 'training/' + code + '/';
  const [staff, away, elsewhere] = await Promise.all([env.get(L.access + '/teams'), env.get(T + 'away/' + coach), env.get('people/' + coach + '/busy')]);
  const recs = Object.values(obj(away)).filter(r => r && typeof r === 'object');
  const out = new Set(recs.filter(r => r.kind === 'callout' && typeof r.item === 'string').map(r => r.item));
  const over = (x, y) => x < b && a < y;
  const tids = Object.entries(obj(staff)).filter(([, t]) => has(obj(t).coaches, coach)).map(([tid]) => tid);
  for (const x of await teamDay(env, L, tids, date)) if (!out.has(x.key) && over(x.a, x.b)) return x.what;
  for (const [id, s] of Object.entries(sessions)) {
    if (id === sid || !s || s.coach !== coach || s.date !== date || s.called || !hm(s.start) || out.has('s:' + id)) continue;
    const [x, y] = span(s.start, s.end, 60);
    if (over(x, y)) return 'another session';
  }
  for (const r of recs) for (const [x, y] of awaySpans(r, date)) if (over(x, y)) return 'time off';
  const here = clubTag(code);
  for (const [tag, v] of Object.entries(obj(elsewhere))) {
    if (tag === here) continue;
    for (const x of Object.values(obj(obj(v).b))) {
      if (!x || x.d !== date || !hm(x.s)) continue;
      const [p, q] = span(x.s, x.e, 60);
      if (over(p, q)) return 'another club';
    }
  }
  return null;
}

/* Is the child due anywhere else then: her team's practice or game, or
   another session she is booked into or asking for (kidBusy() in app.js). */
async function kidBusy(env, L, code, tid, pid, date, a, b, sid, sessions) {
  const over = (x, y) => x < b && a < y;
  for (const x of await teamDay(env, L, [tid], date)) if (over(x.a, x.b)) return x.what;
  const others = Object.entries(sessions).filter(([id, s]) => id !== sid && s && s.date === date && !s.called && hm(s.start));
  const books = await Promise.all(others.map(([id]) => env.get('training/' + code + '/booked/' + id + '/' + pid)));
  for (let i = 0; i < others.length; i++) {
    const bk = books[i];
    if (!bk || !['in', 'asked', 'wait'].includes(bk.st)) continue;
    const [x, y] = span(others[i][1].start, others[i][1].end, 60);
    if (over(x, y)) return 'another session';
  }
  return null;
}

/* A guardian of the child, on the squad itself: what the rules held a family
   to, and what this holds her to. */
async function guardianOf(env, L, uid, tid, pid) {
  if (!okId(tid) || !okId(pid)) return false;
  const p = await env.get(L.player(tid, pid) + '/guardians');
  return has(p, uid);
}

const tidy = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''));

async function book(env, ctx, v) {
  const { code, uid, L, now, say } = ctx;
  const T = 'training/' + code + '/';
  if (!okId(v.block) || !okId(v.tid)) return say({ ok: false, why: 'bad' });
  const b = await env.get(T + 'avail/' + v.block);
  const start = hm(v.start);
  if (!b || typeof b !== 'object' || !okDay(b.date) || !okId(b.coach) || !start || !grid(b).includes(start)) return say({ ok: false, why: 'gone' });
  if (b.off === true) return say({ ok: false, why: 'off' });
  if (!(await guardianOf(env, L, uid, v.tid, v.pid))) return say({ ok: false, why: 'family' });
  const len = Math.round(Number(b.len)) || 60;
  const a = minOf(start), end = clockOf(a + len);
  const t0 = slotAt(b, start);
  if (t0 <= now) return say({ ok: false, why: 'past' });
  const sid = slotSid(b.coach, b.date, start);
  const sessions = obj(await env.dated(T + 'sessions', b.date));
  const s = sessions[sid] || await env.get(T + 'sessions/' + sid);
  if (s && (s.slot !== b.id && s.slot !== v.block)) return say({ ok: false, why: 'gone' });
  if (s && s.called) return say({ ok: false, why: 'called' });
  // a slot somebody already holds is hers already; a new one needs her free
  if (!s) {
    const busy = await coachBusy(env, L, code, b.coach, b.date, a, a + len, sid, sessions);
    if (busy) return say({ ok: false, why: 'busy' });
  }
  const kid = await kidBusy(env, L, code, v.tid, v.pid, b.date, a, a + len, sid, sessions);
  if (kid) return say({ ok: false, why: 'kidbusy', what: kid });

  if (!s) {
    const kind = b.kind === 'group' ? 'group' : 'one';
    const made = tidy({
      id: sid, kind, title: String(b.title || '').slice(0, 80), coach: b.coach, coachName: String(b.coachName || ''), date: b.date, start, end, t0,
      field: b.field ? String(b.field) : '', place: String(b.place || '').slice(0, 120), cap: kind === 'one' ? 1 : Math.max(1, Math.min(60, Math.round(Number(b.cap)) || 6)),
      open: false, slot: b.id || v.block, pid: v.pid, tid: v.tid, by: uid, made: now, at: now,
      price: Number(b.price) >= 0 ? Number(b.price) : undefined, notice: Number(b.notice) >= 0 ? Number(b.notice) : undefined,
      ages: b.ages && typeof b.ages === 'object' ? b.ages : undefined
    });
    // two families on a new slot at once: the first makes it, the second books into it
    await env.claim(T + 'sessions/' + sid, cur => (cur ? undefined : made));
  }
  const held = s || await env.get(T + 'sessions/' + sid);
  if (!held || held.called) return say({ ok: false, why: 'called' });
  const cap = Math.max(1, Math.round(Number(held.cap)) || 1);
  const want = typeof v.want === 'string' ? v.want.trim().slice(0, WANT_MAX) : '';
  let got = null;
  /* The place, counted and taken in one go. `got` is what the last run of
     the transaction decided: a transaction may run more than once, and only
     the run that committed (or the last one) counts. */
  const committed = await env.claim(T + 'booked/' + sid, cur => {
    const all = obj(cur);
    const mine = all[v.pid];
    if (mine && (mine.st === 'in' || mine.st === 'wait' || mine.st === 'no')) { got = mine.st === 'no' ? 'no' : 'already:' + mine.st; return undefined; }
    const n = Object.values(all).filter(x => x && x.st === 'in').length;
    const st = n < cap ? 'in' : v.wait === true ? 'wait' : null;
    got = st || 'full';
    if (!st) return undefined;
    return { ...all, [v.pid]: tidy({ tid: v.tid, st, by: uid, at: now, want }) };
  });
  if (committed) return say({ ok: true, st: got, sid });
  if (got && got.startsWith('already:')) return say({ ok: true, st: got.slice(8), sid, already: true });
  // the coach turned this child down for this slot; asking again does not undo her say
  if (got === 'no') return say({ ok: false, why: 'no', sid });
  return say({ ok: false, why: 'full', sid });
}

async function cancel(env, ctx, v) {
  const { code, uid, L, now, say } = ctx;
  const T = 'training/' + code + '/';
  if (!okId(v.sid)) return say({ ok: false, why: 'bad' });
  const [s, bk] = await Promise.all([env.get(T + 'sessions/' + v.sid), env.get(T + 'booked/' + v.sid + '/' + v.pid)]);
  if (!s || typeof s !== 'object' || !s.slot) return say({ ok: false, why: 'gone' });
  if (!bk || typeof bk !== 'object') return say({ ok: true, st: 'gone', sid: v.sid });
  if (!(await guardianOf(env, L, uid, bk.tid, v.pid))) return say({ ok: false, why: 'family' });
  const t0 = Number(s.t0) || 0;
  if (t0 <= now) return say({ ok: false, why: 'past' });
  // a place on the waiting list holds nobody up, so it can be given back any time before
  if (bk.st === 'in') {
    const notice = Number(s.notice) || 0;
    if (notice && t0 - now < notice * H) return say({ ok: false, why: 'notice', notice });
  }
  const [fee, came] = await Promise.all([env.get(T + 'fees/' + v.sid + '/' + v.pid), env.get(T + 'came/' + v.sid)]);
  if (fee || came) return say({ ok: false, why: 'paid' });
  let left = 0;
  await env.claim(T + 'booked/' + v.sid, cur => {
    const all = { ...obj(cur) };
    delete all[v.pid];
    left = Object.keys(all).length;
    return Object.keys(all).length ? all : null;
  });
  /* Nobody left in it: the slot goes too, and the time is free again. A
     session the coach has put more on (a plan, a register, a fee) stays. */
  if (!left) {
    const [plan, fees] = await Promise.all([env.get(T + 'splans/' + v.sid), env.get(T + 'fees/' + v.sid)]);
    if (!plan && !fees) {
      /* What the slot was, kept where no phone reaches (no rule grants
         serverState/), for the push that tells the coach a time was given
         back (news.js): it runs after this, and the session is gone by then. */
      await env.set('serverState/slotGone/' + code + '/' + v.sid, { ...s, at: now });
      await env.claim(T + 'sessions/' + v.sid, cur => (cur && cur.slot && !cur.called ? null : undefined));
    }
  }
  return say({ ok: true, st: 'gone', sid: v.sid });
}

/* A family's ask, bookAsks/{code}/{uid}/{id}: { op: 'book', block, start,
   tid, pid, want, wait, at } or { op: 'cancel', sid, pid, at }. Answered at
   its own `answer`, which only this writes (the rule refuses it from a
   phone), once: a trigger delivered twice finds the answer there. */
async function onAsk(env, params, v) {
  const { code, uid, id } = params || {};
  const now = env.now ? env.now() : Date.now();
  if (!okId(code) || !okId(uid) || !okId(id)) return { ok: false, why: 'bad' };
  const P = 'bookAsks/' + code + '/' + uid + '/' + id + '/answer';
  if (await env.get(P)) return { ok: false, why: 'twice' };
  // the phone stopped waiting and took its ask back: acting on it now would book a place nobody is told of
  if (!(await env.get('bookAsks/' + code + '/' + uid + '/' + id))) return { ok: false, why: 'withdrawn' };
  const say = async a => { await env.set(P, { ...a, at: now }); return a; };
  if (!v || typeof v !== 'object' || !okId(v.pid) || (v.op !== 'book' && v.op !== 'cancel')) return say({ ok: false, why: 'bad' });
  if (!(Number(v.at) > now - ASK_TTL)) return say({ ok: false, why: 'late' });
  if (await env.get('retired/' + code)) return say({ ok: false, why: 'club' });
  const L = await where(env.get, code);
  if (!(await env.get(L.access + '/index/' + uid))) return say({ ok: false, why: 'club' });
  const ctx = { code, uid, L, now, say };
  return v.op === 'book' ? book(env, ctx, v) : cancel(env, ctx, v);
}

/* A booking changed, training/{code}/booked/{sid}/{pid}. A place in a slot
   that came free (a family cancelling, the coach taking a child off or
   turning one down) goes to the first on the waiting list, by when she
   joined it, inside the same transaction that counts. Only a booked slot:
   on an ordinary session the waiting list is the coach's to work through. */
async function onBooked(env, params, before, after) {
  const { code, sid } = params || {};
  const none = { promoted: [] };
  const was = before && before.st === 'in', is = after && after.st === 'in';
  if (!was || is || !okId(code) || !okId(sid)) return none;
  const T = 'training/' + code + '/';
  const s = await env.get(T + 'sessions/' + sid);
  const now = env.now ? env.now() : Date.now();
  if (!s || typeof s !== 'object' || !s.slot || s.called || !((Number(s.t0) || 0) > now)) return none;
  if (await env.get('retired/' + code)) return none;
  const cap = Math.max(1, Math.round(Number(s.cap)) || 1);
  let promoted = [];
  await env.claim(T + 'booked/' + sid, cur => {
    const all = { ...obj(cur) };
    promoted = [];
    let n = Object.values(all).filter(x => x && x.st === 'in').length;
    const queue = Object.entries(all).filter(([, x]) => x && x.st === 'wait').sort((x, y) => (Number(x[1].at) || 0) - (Number(y[1].at) || 0) || x[0].localeCompare(y[0]));
    for (const [pid, x] of queue) {
      if (n >= cap) break;
      all[pid] = { ...x, st: 'in', by: 'server', at: now };
      promoted.push(pid); n++;
    }
    return promoted.length ? all : undefined;
  });
  return { promoted };
}

module.exports = { onAsk, onBooked, grid, slotAt, slotSid, clubTag, coachBusy, kidBusy, awaySpans, ASK_TTL };
