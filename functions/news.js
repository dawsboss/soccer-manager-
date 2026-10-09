/* Club activity and training sessions, pushed to a closed phone (GOTSPORT.md,
   *Push notifications*, the last of build order step 2; SERVER.md,
   *Notifications*).

   Until this, both were worked out on each phone while Minutes was open
   (`clubNews()` and `sessNews()` in app.js): what changed since that phone
   last looked, per source, said once. A closed phone heard nothing of a
   family booking a coach's time, a place confirmed or turned down, a session
   called off, a coach calling out or taking time off. These triggers see each
   change once, as it is written, and tell whoever the open page would have
   told, in the same words:

   - a booking, training/{code}/booked/{sid}/{pid}: the child's family when
     somebody else confirms, waitlists, turns down or takes off her place
     (the server moving her off the waiting list included); the session's
     coach when a family asks, books her time, joins its waiting list,
     withdraws or cancels; the admins (club activity) of the same, less the
     coach's own business;
   - a session, training/{code}/sessions/{sid}: the families with a child in
     it when it is called off or moved, soon; the admins when a coach adds
     one or calls one off;
   - a coach's time off, training/{code}/away/{uid}/{id}: the admins, the
     coaches of the team a call-out is on (or the coach of its session), and
     the coach herself when somebody else calls her off; and a call-out
     taken back.

   The calendar's own news (a game or practice new, moved, called off, back
   on, or deleted) reaches the admins from push.js, which already tells the
   team. Families never hear club activity, as on the open page.

   The same care as the rest of the sender: nobody hears what she did
   herself (the writer is the record's `by`, or its `edit` stamp when fresh);
   a family hears only about her own child, by first name, and a family's
   phone is never handed another child's name; staff hear names, as their
   screens show them. Each reader's own switches decide: 'cal' for a family
   or coach hearing about her sessions (as `sessNews()` checks), 'news' for
   club activity (as `clubNews()` does). What has already passed is not news.

   Nothing in here imports Firebase; index.js hands it `get`, `remove`, `send`
   and `claim`, as for push.js. */

const { where } = require('./club');
const { messagesFor, deliver, whenOf, SOON_DAYS } = require('./push');

const BODY_MAX = 240;
const EDIT_FRESH_MS = 5 * 60000;
const okId = s => typeof s === 'string' && /^[^.#$\[\]\/]{1,128}$/.test(s);
const okDay = d => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
const hm = t => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '')); return m ? m[1].padStart(2, '0') + ':' + m[2] : ''; };
const keys = o => Object.keys(o && typeof o === 'object' ? o : {});
const has = (o, k) => !!(o && typeof o === 'object' && o[k] !== undefined && o[k] !== null && o[k] !== false);
const short = s => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > BODY_MAX ? t.slice(0, BODY_MAX - 1) + '…' : t; };
const firstName = n => String(n || '').trim().split(/\s+/)[0] || 'Your child';
const CALLED = { cancelled: 'Cancelled', postponed: 'Postponed' };
const none = () => ({ to: [], sent: 0, failed: 0, removed: [] });
const DAY = 86400000;

/* Past, a day wide either side of UTC's today as push.js's soon() is: the
   club's time zone is nowhere on the server. */
function past(date, now) {
  if (!okDay(date)) return false;
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d) < now - (now % DAY) - DAY;
}
function soon(date, now) {
  if (!okDay(date) || past(date, now)) return false;
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d) <= now - (now % DAY) + SOON_DAYS * DAY;
}
const sessTitle = s => s.title || (s.kind === 'one' ? '1-1 session' : 'Group session');
const sessWhen = s => whenOf({ date: s.date, start: s.start });

/* What one club says about who is who, read once per event. */
async function clubFacts(env, code) {
  const L = await where(env.get, code);
  const A = L.access;
  const [retired, admins, index, members, teams] = await Promise.all([
    env.get('retired/' + code), env.get(A + '/admins'), env.get(A + '/index'), env.get(L.members), env.get(A + '/teams')
  ]);
  const f = { L, retired: !!retired, admins: admins || {}, index: index || {}, members: members || {}, teams: teams || {} };
  f.inClub = u => has(f.index, u) || has(f.admins, u);
  f.name = u => { const m = f.members[u] || {}; return m.name || (m.email ? String(m.email).split('@')[0] : '') || ''; };
  f.coachesOf = tid => keys((f.teams[tid] || {}).coaches).filter(f.inClub);
  return f;
}

/* Send each person her own words, a person once: whoever is first in
   `lists` keeps her (a family over a coach over an admin), and each list
   is its own switch. */
async function send(env, f, lists) {
  const done = new Set(), out = [];
  for (const [people, words, topic] of lists) {
    const mine = new Set([...people].filter(u => u && !done.has(u) && f.inClub(u)));
    for (const u of mine) done.add(u);
    if (mine.size) out.push(...(await messagesFor(env, mine, words, topic)));
  }
  return { to: [...done].sort(), ...(await deliver(env, out)) };
}

/* ---------------- a booking ---------------- */

const BOOK = { asked: 'asked', in: 'booked', wait: 'on the waiting list', no: 'not this time', out: 'taken off' };

async function onBooked(env, params, before, after) {
  const { code, sid, pid } = params || {};
  if (!okId(code) || !okId(sid) || !okId(pid)) return none();
  const now = env.now ? env.now() : Date.now();
  const was = before && typeof before === 'object' ? before : null;
  const is = after && typeof after === 'object' ? after : null;
  if (!was && !is) return none();
  if (was && is && was.st === is.st) return none();             // a note changed, or the same place written again
  /* A family giving back the last place in a slot takes the slot with it
     (book.js), so what it was is read from the server's note of it. */
  const s = (await env.get('training/' + code + '/sessions/' + sid)) || (!is ? await env.get('serverState/slotGone/' + code + '/' + sid) : null);
  // a booking taken off with its session (the coach deleting it) is not news to anyone
  if (!s || typeof s !== 'object' || s.called || past(s.date, now) || (Number(s.t0) && Number(s.t0) < now)) return none();
  const f = await clubFacts(env, code);
  if (f.retired) return none();
  const tid = (is || was).tid;
  const kid = okId(tid) ? await env.get(f.L.player(tid, pid)) : null;
  const name = kid && kid.name ? String(kid.name) : 'A player who has left';
  const by = is ? String(is.by || '') : '';
  const title = sessTitle(s), when = sessWhen(s), coach = String(s.coach || '');
  const coachName = s.coachName || f.name(coach) || 'the coach';
  // a family's own doing, or the server's for her (a booking, the waiting list moving her in)
  const familyBy = by === 'server' || !!(by && kid && (has(kid.guardians, by) || has(kid.self, by)));
  const hash = '#/training/' + sid;
  const tag = 'sess:' + code + ':' + sid + ':' + pid + ':' + (is ? is.st : 'gone');
  const words = (t, b) => () => ({ title: t, body: short(b), tag, code, hash, urgent: '' });
  const lists = [];

  // her family: her own child, by first name, told when somebody else moved her place
  if (is && is.st !== 'asked' && BOOK[is.st] && kid) {
    const fam = new Set([...keys(kid.guardians)]);
    fam.delete(by);
    lists.push([fam, words(`${firstName(name)}: ${BOOK[is.st]}`, `${title} with ${coachName} · ${when}`), 'cal']);
  }
  // the coach: what families do about her session
  if (coach && coach !== by) {
    let t = null, b = `${name} · ${title} · ${when}`;
    if (is && is.st === 'asked') t = 'Asked for a spot';
    else if (is && is.st === 'in' && s.slot && familyBy) { t = 'Booked a time'; b = `${name} · ${when}`; }
    else if (is && is.st === 'wait' && s.slot && familyBy) t = 'Joined the waiting list';
    else if (is && is.st === 'out' && familyBy) t = 'Withdrew';
    else if (!is && was && was.st === 'in' && s.slot) { t = 'Cancelled a time'; b = `${name} · ${when}`; }
    if (t) lists.push([new Set([coach]), words(t, b), 'cal']);
  }
  // the admins: club activity, the families' side of it
  {
    let t = null, b = `${title} with ${coachName} · ${when}`;
    if (is && is.st === 'in' && s.slot && familyBy) { t = `Booked by a family: ${title} with ${coachName}`; b = `${when} · ${name}`; }
    else if (is && is.st === 'asked') t = `Asked for a place: ${name}`;
    else if (is && is.st === 'out' && familyBy) t = `Withdrew: ${name}`;
    else if (!is && was && was.st === 'in' && s.slot) t = `Cancelled a time: ${name}`;
    if (t) {
      const admins = new Set(keys(f.admins));
      admins.delete(by); admins.delete(coach);
      lists.push([admins, words(t, b), 'news']);
    }
  }
  return send(env, f, lists);
}

/* ---------------- a session ---------------- */

async function onSession(env, params, before, after) {
  const { code, sid } = params || {};
  if (!okId(code) || !okId(sid)) return none();
  const now = env.now ? env.now() : Date.now();
  const was = before && typeof before === 'object' ? before : null;
  const is = after && typeof after === 'object' ? after : null;
  if (!is) return none();                                        // deleted: its bookings are told nothing, as on the page
  const s = is;
  if (past(s.date, now)) return none();
  const ed = s.edit && typeof s.edit === 'object' ? s.edit : null;
  const by = ed && ed.by && Math.abs(now - (Number(ed.at) || 0)) < EDIT_FRESH_MS ? String(ed.by) : (!was ? String(s.by || '') : '');
  const called = s.called && (!was || s.called !== was.called);
  const moved = was && !s.called && (was.date !== s.date || hm(was.start) !== hm(s.start));
  const isNew = !was;
  if (!called && !moved && !(isNew && !s.slot)) return none();
  const f = await clubFacts(env, code);
  if (f.retired) return none();
  const title = sessTitle(s), when = sessWhen(s);
  const coachName = s.coachName || f.name(s.coach) || 'the coach';
  const hash = '#/training/' + sid;
  const tag = 'sess:' + code + ':' + sid + ':' + (called ? 'called' : moved ? 'moved:' + s.date + hm(s.start) : 'new');
  const lists = [];
  // families with a child going, asking or waiting: their own child, by first name, when it is soon
  if ((called || moved) && soon(s.date, now) && !isNew) {
    const booked = await env.get('training/' + code + '/booked/' + sid);
    const going = Object.entries(booked && typeof booked === 'object' ? booked : {}).filter(([, b]) => b && ['in', 'wait', 'asked'].includes(b.st));
    const kids = await Promise.all(going.map(([p, b]) => (okId(b.tid) && okId(p) ? env.get(f.L.player(b.tid, p)) : null)));
    const byFam = new Map();
    going.forEach(([p], i) => {
      const k = kids[i];
      if (!k) return;
      for (const u of keys(k.guardians)) if (u !== by) (byFam.get(u) || byFam.set(u, []).get(u)).push(firstName(k.name));
    });
    for (const [u, names] of byFam) {
      const t = called ? `${CALLED[s.called] || 'Called off'}: ${title}` : `Moved: ${title}`;
      lists.push([new Set([u]), () => ({ title: t, body: short(`${names.join(', ')} · ${called ? when : 'now ' + when}`), tag, code, hash, urgent: called ? '1' : '' }), 'cal']);
    }
  }
  // the admins: a session added, or one called off (a booked slot is said from its booking)
  if ((isNew && !s.slot) || called) {
    const admins = new Set(keys(f.admins));
    admins.delete(by);
    if (isNew) admins.delete(String(s.coach || ''));
    const t = isNew ? `New session: ${title} with ${coachName}` : `${CALLED[s.called] || 'Called off'}: ${title} with ${coachName}`;
    lists.push([admins, () => ({ title: t, body: short(when + (by && by !== s.coach && f.name(by) ? ' · by ' + f.name(by) : '')), tag, code, hash, urgent: '' }), 'news']);
  }
  return send(env, f, lists);
}

/* ---------------- a coach's time off ---------------- */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function awayWords(r) {
  const hours = hm(r.start) && hm(r.end) ? `${hm(r.start)}–${hm(r.end)}` : 'all day';
  if (r.kind === 'weekly') {
    const days = Object.values(r.days && typeof r.days === 'object' ? r.days : {}).map(Number).filter(n => n >= 0 && n <= 6).sort();
    return `Every ${days.map(i => WEEKDAYS[i]).join(', ')}, ${hours}${okDay(r.to) ? ' until ' + whenOf({ date: r.to }) : ''}`;
  }
  if (r.kind === 'dates') return `${r.from === r.to || !okDay(r.to) ? whenOf({ date: r.from }) : whenOf({ date: r.from }) + ' to ' + whenOf({ date: r.to })}, ${hours}`;
  return '';
}

async function onAway(env, params, before, after) {
  const { code, uid, id } = params || {};
  if (!okId(code) || !okId(uid) || !okId(id)) return none();
  const now = env.now ? env.now() : Date.now();
  const was = before && typeof before === 'object' ? before : null;
  const is = after && typeof after === 'object' ? after : null;
  if (was && is) return none();                                  // an edit to a note is not news
  const r = is || was;
  if (!['weekly', 'dates', 'callout'].includes(r.kind)) return none();
  if (r.kind === 'callout' && (!was || is) && past(r.date, now)) return none();
  if (r.kind === 'callout' && was && !is && past(r.date, now)) return none();
  if (r.kind === 'dates' && okDay(r.to) && past(r.to, now)) return none();
  if (!is && r.kind !== 'callout') return none();                // time off taken back is quiet, as on the page
  const f = await clubFacts(env, code);
  if (f.retired || !f.inClub(uid)) return none();
  const by = is ? String(r.by || uid) : '';
  const who = f.name(uid) || 'A coach', byName = f.name(by) || 'An admin';
  const what = String(r.title || 'it').slice(0, 80);
  const date = okDay(r.date) ? whenOf({ date: r.date, start: r.start }) : '';
  const hash = r.kind === 'callout' && /^s:/.test(String(r.item || '')) ? '#/training/' + String(r.item).slice(2)
    : r.kind === 'callout' && r.tid && okId(r.tid) ? `#/team/${r.tid}/calendar` : '#/messages';
  const tag = 'away:' + code + ':' + uid + ':' + id + (is ? '' : ':back');
  const lists = [];
  if (r.kind === 'callout') {
    // who else is on it: the team's coaches, or the session's
    let staff = [];
    if (/^s:/.test(String(r.item || ''))) {
      const s = await env.get('training/' + code + '/sessions/' + String(r.item).slice(2));
      if (s && s.coach) staff = [String(s.coach)];
    } else if (okId(r.tid)) staff = f.coachesOf(r.tid);
    const t = !is ? `Back on: ${who} is back on ${what}`
      : by !== uid ? `${byName} called ${who} off ${what}` : `${who} can't make ${what}`;
    const body = date + (is && r.note ? ' · ' + String(r.note).slice(0, 120) : '');
    const words = () => ({ title: t, body: short(body), tag, code, hash, urgent: '' });
    // the coach herself, when somebody else called her off
    if (is && by !== uid) lists.push([new Set([uid]), () => ({ title: `${byName} called you off ${what}`, body: short(body), tag, code, hash, urgent: '' }), 'news']);
    const rest = new Set([...staff, ...keys(f.admins)]);
    rest.delete(uid); rest.delete(by);
    lists.push([rest, words, 'news']);
  } else {
    const admins = new Set(keys(f.admins));
    admins.delete(by); admins.delete(uid);
    lists.push([admins, () => ({ title: `Time off: ${who}`, body: short(awayWords(r)), tag, code, hash: '#/messages', urgent: '' }), 'news']);
  }
  return send(env, f, lists);
}

module.exports = { onBooked, onSession, onAway, clubFacts, past, soon };
