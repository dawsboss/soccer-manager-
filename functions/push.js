/* Who hears a new notice or family message, and what their phone says.

   The first job the server does (GOTSPORT.md, Build order, step 2). Until it,
   a message reached a phone only while Minutes was open on it; now a trigger
   on each new notice and message works out who may read it and sends to every
   phone they turned notifications on for.

   Nothing in here imports Firebase. index.js hands it three things, `get`,
   `remove` and `send`, bound to the database instance the event came from and
   to Cloud Messaging; test/push.js hands it the fake ones. So the part with the
   judgement in it runs in CI with nothing installed, the same way rules.js
   runs the rules.

   Who: exactly who the rules let read the thing, worked out from the same
   lookup tables the rules read (CLAUDE.md, "Five flat lookup tables"), and
   then held to the squad as well, so a stale table entry can never send a
   child's message to someone the squad no longer names. This function writes
   with admin credentials and bypasses the rules, which is why it checks
   rather than trusts. Two things the rules allow it deliberately leaves out:

   - the bridge clauses. While a club has no `access/teamParents` table the
     rules let anyone indexed read every notice; pushing to every indexed
     account would be wider than any phone shows (`msgTeams()` in app.js), so
     until an admin's phone has built the table, families get no push.
   - the author. Nobody is told about what she wrote herself.

   What: the same title the open app pops up (`msgNews()` in app.js), the
   text cut short, and where to open it. The notification's tag is the
   message id, so a trigger Cloud Functions delivers twice replaces its own
   notification rather than adding a second. */

const BODY_MAX = 240;
const BATCH = 500;   // Cloud Messaging's limit per sendEach call
// tokens Cloud Messaging says are gone for good; any other failure may pass
const DEAD = /(registration-token-not-registered|invalid-registration-token)$/;

const { where, readTeam } = require('./club');

const keys = o => Object.keys(o && typeof o === 'object' ? o : {});
const short = s => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > BODY_MAX ? t.slice(0, BODY_MAX - 1) + '…' : t;
};

/* What the club says about one team, read once per event. */
async function teamFacts(env, code, tid, tree) {
  const L = await where(env.get, code, tree);
  const A = L.access;
  const [retired, admins, tIndex, tParents, tPlayers, tSupporters, team, members] = await Promise.all([
    env.get('retired/' + code),
    env.get(A + '/admins'),
    env.get(A + '/teamIndex/' + tid),
    env.get(A + '/teamParents/' + tid),
    env.get(A + '/teamPlayers/' + tid),
    env.get(A + '/teamSupporters/' + tid),
    readTeam(env.get, L, tid),
    env.get(L.members)
  ]);
  return {
    retired: !!retired, admins: admins || {}, tIndex: tIndex || {}, tParents: tParents || {},
    tPlayers: tPlayers || {}, tSupporters: tSupporters || {}, team: team || null, members: members || {}
  };
}
const squad = f => (f.team && f.team.players) || {};
const has = (o, k) => !!(o && typeof o === 'object' && o[k] !== undefined && o[k] !== null && o[k] !== false);
// a family named by the table AND by the squad: the table says which child, the squad has to agree
const parentOn = (f, u) => has(squad(f)[f.tParents[u]] && squad(f)[f.tParents[u]].guardians, u);
// a player's own sign-in, held to her own record the same way
const selfOn = (f, u) => has(squad(f)[f.tPlayers[u]] && squad(f)[f.tPlayers[u]].self, u);
// a supporter (AUTH.md, *More kinds of people*, 1), held to her player's record the same way
const supporterOn = (f, u) => has(squad(f)[f.tSupporters[u]] && squad(f)[f.tSupporters[u]].supporters, u);
const memberName = (f, u) => {
  const m = f.members[u] || {};
  return m.name || (m.email ? String(m.email).split('@')[0] : '') || '';
};

/* A team notice, board/{code}/{tid}/{id}: the board's read rule, without its
   bridge. Admins, the team's coaches and trackers, its families, its
   players who sign in themselves, and its players' supporters. */
function noticeReaders(f) {
  const out = new Set(keys(f.admins));
  for (const u of keys(f.tIndex)) out.add(u);
  for (const u of keys(f.tParents)) if (parentOn(f, u)) out.add(u);
  for (const u of keys(f.tPlayers)) if (selfOn(f, u)) out.add(u);
  for (const u of keys(f.tSupporters)) if (supporterOn(f, u)) out.add(u);
  return out;
}

/* A family conversation, dm/{code}/{tid}/{fam}/m/{id}: the conversation's
   read rule. The family, the team's coaches (not its trackers), the admins,
   and a player whose own record lists this family as her guardian. Never
   another family. */
function threadReaders(f, fam) {
  const staff = new Set(keys(f.admins));
  for (const [u, role] of Object.entries(f.tIndex)) if (role === 'coach') staff.add(u);
  const family = new Set([fam]);
  for (const u of keys(f.tPlayers)) {
    const p = squad(f)[f.tPlayers[u]];
    if (selfOn(f, u) && has(p && p.guardians, fam)) family.add(u);
  }
  for (const u of staff) family.delete(u);   // a coach whose child is on her team reads it as staff
  return { staff, family };
}

/* Every phone of each person, as one message each, leaving out whoever has
   turned this kind off (people/{uid}/mute/{topic}, hers alone in the rules,
   set from Settings on any of her phones): 'msg' a conversation, 'notice' a
   team notice, 'cal' a change to her calendar. Her phones aren't even read. */
async function messagesFor(env, people, data, topic, ttl) {
  const out = [];
  const muted = await Promise.all([...people].map(async u => [u, topic ? (await env.get('people/' + u + '/mute/' + topic)) === true : false]));
  const lists = await Promise.all(muted.filter(([, m]) => !m).map(async ([u]) => [u, await env.get('pushTokens/' + u)]));
  for (const [u, toks] of lists)
    for (const token of keys(toks))
      out.push({
        token, uid: u,
        message: {
          token,
          data: { ...data(u), uid: u },
          // high: a coach's "we're running late" is no use an hour later; a day, then let it go
          webpush: { headers: { Urgency: 'high', TTL: ttl || '86400' } }
        }
      });
  return out;
}

/* Send, and tidy what Cloud Messaging says is dead. A failure for one phone
   never stops the rest. */
async function deliver(env, list) {
  const res = { sent: 0, failed: 0, removed: [] };
  for (let i = 0; i < list.length; i += BATCH) {
    const chunk = list.slice(i, i + BATCH);
    const r = await env.send(chunk.map(x => x.message));
    const each = (r && r.responses) || [];
    for (let j = 0; j < chunk.length; j++) {
      const one = each[j] || {};
      if (one.success) { res.sent++; continue; }
      res.failed++;
      const code = String((one.error && (one.error.code || one.error.errorInfo && one.error.errorInfo.code)) || '');
      if (DEAD.test(code)) {
        const p = 'pushTokens/' + chunk[j].uid + '/' + chunk[j].token;
        await Promise.resolve(env.remove(p)).catch(() => { });
        res.removed.push(p);
      }
    }
  }
  return res;
}

function readable(params, v) {
  return !!(v && typeof v === 'object' && v.by && typeof v.text === 'string' && v.text
    && params && params.code && params.tid && params.id);
}

async function onNotice(env, params, v) {
  if (!readable(params, v)) return { to: [], sent: 0, failed: 0, removed: [] };
  const { code, tid, id } = params;
  const f = await teamFacts(env, code, tid);
  if (f.retired || !f.team) return { to: [], sent: 0, failed: 0, removed: [] };
  const people = noticeReaders(f);
  people.delete(v.by);
  const tn = f.team.name || 'Your team';
  const data = () => ({
    title: `${v.urgent ? 'Urgent · ' : ''}${tn} · ${v.byName || 'a coach'}`,
    body: short(v.text), tag: id, code, hash: '#/messages', urgent: v.urgent ? '1' : ''
  });
  const list = await messagesFor(env, people, data, 'notice');
  return { to: [...people].sort(), ...(await deliver(env, list)) };
}

async function onMessage(env, params, v) {
  if (!readable(params, v) || !params.fam) return { to: [], sent: 0, failed: 0, removed: [] };
  const { code, tid, fam, id } = params;
  const f = await teamFacts(env, code, tid);
  if (f.retired || !f.team) return { to: [], sent: 0, failed: 0, removed: [] };
  const { staff, family } = threadReaders(f, fam);
  staff.delete(v.by); family.delete(v.by);
  const tn = f.team.name || 'Your team';
  const who = v.byName || 'Someone';
  const famName = memberName(f, fam) || 'A parent';
  const data = u => staff.has(u)
    // the coaches see whose conversation it is, and who in it spoke when it wasn't the family
    ? { title: `${famName} · ${tn}`, body: short(v.by === fam ? v.text : `${who}: ${v.text}`) }
    : { title: `${who} · ${tn}`, body: short(v.text) };
  const people = new Set([...staff, ...family]);
  const list = await messagesFor(env, people, u => ({ ...data(u), tag: id, code, hash: `#/messages/${tid}/${fam}`, urgent: '' }), 'msg');
  return { to: [...people].sort(), ...(await deliver(env, list)) };
}

/* Two colleagues, staffdm/{code}/{a}~{b}/m/{id} (build 106): the rule's
   readers are those two, while each is an admin or a coach of some team
   (coachIndex). So the one person told is the other of the pair, and only if
   the author is one of the pair and both are still staff. The id is checked
   to be exactly two plain uids: a made-up one names nobody. */
async function onStaff(env, params, v) {
  const none = { to: [], sent: 0, failed: 0, removed: [] };
  if (!v || typeof v !== 'object' || !v.by || typeof v.text !== 'string' || !v.text || !params || !params.code || !params.cid || !params.id) return none;
  const { code, cid, id } = params;
  const pair = String(cid).split('~');
  if (pair.length !== 2 || pair.some(u => !/^[^.#$\[\]\/~]{1,128}$/.test(u)) || pair[0] === pair[1] || !pair.includes(v.by)) return none;
  const A = (await where(env.get, code)).access;
  const [retired, admins, coachIndex] = await Promise.all([
    env.get('retired/' + code), env.get(A + '/admins'), env.get(A + '/coachIndex')
  ]);
  if (retired) return none;
  const staff = u => has(admins, u) || has(coachIndex, u);
  if (!pair.every(staff)) return none;
  const other = pair.find(u => u !== v.by);
  const people = new Set([other]);
  const list = await messagesFor(env, people, () => ({
    title: v.byName || 'A colleague', body: short(v.text), tag: id, code, hash: `#/messages/with/${v.by}`, urgent: ''
  }), 'msg');
  return { to: [other], ...(await deliver(env, list)) };
}

/* ---------------- a change to the calendar ---------------- */

/* A game or practice of hers called off, back on, moved, or new: the same
   four things the open app's alerts say (`calAlerts()` in app.js), with the
   same signature (date, start, called) and the same silences: a change of
   place or title is not news, nor is a deletion, nor anything already past.
   Pushed only when it is soon, because that is when a closed phone needs to
   hear it: a game moved next March reaches her through the calendar, a
   practice called off tonight should not wait for it.

   Who: everyone on that team, from the same tables as a notice (its coaches
   and trackers, its families, its players who sign in), held to the squad.
   Not the admins: an admin of twenty teams would hear every change in the
   club, which club activity already tells her when she opens the app, unless
   she is on the team herself. Every calendar write carries who made it
   (`edit: { by, at }`, stamped by the app in remoteSet() and held by the
   rules to the writer's own uid), so the coach who called it off is left out,
   on every phone of hers, and named to everyone else. A stamp more than a few
   minutes old is from an earlier change (an older app that wrote none since),
   and is not trusted to say who made this one.

   Games are written every few seconds while one is being played, so nothing
   here listens to a whole game: index.js wakes this for its date, kick-off
   and called-off fields alone, and this reads only the handful of fields it
   needs. Two of those can change in one save (moved to Sunday at 10), which
   is two events for one piece of news, so the last signature told is kept at
   serverState/calSent/{code}/{key}, a node no phone can read or write (no
   rule grants it), and a transaction there lets exactly one of them speak. */
const SOON_DAYS = 14;
const EDIT_FRESH_MS = 5 * 60000;
const CAL_CALLED = { cancelled: 'Cancelled', postponed: 'Postponed' };
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const okDay = d => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
const hm = t => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '')); return m ? m[1].padStart(2, '0') + ':' + m[2] : ''; };
const calSig = x => (x && okDay(x.date) ? [x.date, hm(x.start), x.called || ''].join('|') : null);
const dayOf = (d, now) => {
  const [y, mo, da] = d.split('-').map(Number);
  return Date.UTC(y, mo - 1, da);
};
/* The club's own time zone is not stored anywhere, so "today" is taken a day
   wide either side of UTC's: a practice tonight in California is never "past". */
function soon(date, now) {
  if (!okDay(date)) return false;
  const day = dayOf(date), t = now - (now % 86400000);
  return day >= t - 86400000 && day <= t + SOON_DAYS * 86400000;
}
function whenOf(x) {
  if (!okDay(x.date)) return 'No date';
  const [y, mo, d] = x.date.split('-').map(Number);
  const w = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  let out = `${DAYS[w]} ${d} ${MONTHS[mo - 1]}`;
  const t = hm(x.start);
  if (t) {
    const [h, mi] = t.split(':').map(Number);
    out += ' ' + ((h % 12) || 12) + (mi ? ':' + String(mi).padStart(2, '0') : '') + (h >= 12 ? 'pm' : 'am');
  }
  return out;
}

/* What changed, in the app's words; null when it is not news. */
function calNews(before, after) {
  const was = calSig(before), now = calSig(after);
  if (!now) return null;                                   // deleted, or no date: the app says nothing either
  if (was === now) return null;
  if (!was) return { kind: 'new' };
  const [od, os, oc] = was.split('|');
  if (after.called && after.called !== oc) return { kind: 'called', urgent: true };
  if (!after.called && oc) return { kind: 'back' };
  if (od !== after.date || os !== hm(after.start)) return { kind: 'moved', urgent: od !== after.date };
  return null;
}

/* Everyone on the team, held to the squad: its supporters too, whose
   calendar it is as much as a family's. */
function teamReaders(f) {
  const out = new Set(keys(f.tIndex));
  for (const u of keys(f.tParents)) if (parentOn(f, u)) out.add(u);
  for (const u of keys(f.tPlayers)) if (selfOn(f, u)) out.add(u);
  for (const u of keys(f.tSupporters)) if (supporterOn(f, u)) out.add(u);
  return out;
}

/* One entry changed. `it` is the entry after, `before` what it was, both in
   the calendar's shape: { kind: 'game'|'practice'|'event', tid, id, date,
   start, called, title, series }. */
async function calChange(env, code, before, it, tree) {
  const none = { to: [], sent: 0, failed: 0, removed: [] };
  const now = env.now ? env.now() : Date.now();
  const x = it || before;
  if (!x || !x.tid || !(soon(it && it.date, now) || soon(before && before.date, now))) return none;
  const news = calNews(before, it);
  if (!news) return none;
  /* A weekly series made or changed at once is one piece of news, as in the
     app: told once for the series, then quiet about it for a few minutes. */
  const key = (it.kind === 'game' ? 'g_' : 'e_') + it.id;
  const said = news.kind === 'new' && it.series ? 's_' + it.series : key;
  const sig = calSig(it);
  const told = await env.claim('serverState/calSent/' + code + '/' + said,
    old => (said !== key ? (old && old.at > now - 10 * 60000 ? undefined : { sig, at: now }) : (old && old.sig === sig ? undefined : { sig, at: now })));
  if (!told) return none;

  const f = await teamFacts(env, code, it.tid, tree);
  if (f.retired || !f.team) return none;
  const tn = f.team.name || 'Your team';
  const words = it.kind === 'game' ? `${tn} v ${it.title || 'TBC'}` : `${tn}: ${it.title || (it.kind === 'practice' ? 'Practice' : 'Team event')}`;
  const what = it.kind === 'game' ? 'game' : it.kind === 'practice' ? 'practice' : 'event';
  const title = news.kind === 'called' ? `${CAL_CALLED[it.called] || 'Called off'}: ${words}`
    : news.kind === 'back' ? `Back on: ${words}`
    : news.kind === 'moved' ? `Moved: ${words}`
    : `New ${what}${said !== key ? 's' : ''}: ${words}`;
  const body = news.kind === 'moved' ? `Now ${whenOf(it)}` : news.kind === 'new' && said !== key ? `Weekly, from ${whenOf(it)}` : whenOf(it);
  const hash = it.kind === 'game' ? `#/team/${it.tid}/game/${it.id}/live` : `#/team/${it.tid}/calendar`;
  const people = teamReaders(f);
  const ed = it.edit && typeof it.edit === 'object' ? it.edit : null;
  const by = ed && ed.by && Math.abs(now - (Number(ed.at) || 0)) < EDIT_FRESH_MS ? String(ed.by) : null;
  if (by) people.delete(by);
  const who = by ? memberName(f, by) : '';
  const list = await messagesFor(env, people, () => ({
    title, body: short(body + (who ? ' · ' + who : '')), tag: 'cal:' + code + ':' + said, code, hash, urgent: news.urgent ? '1' : ''
  }), 'cal');
  return { to: [...people].sort(), news: news.kind, by, ...(await deliver(env, list)) };
}

/* A practice or event, teams/{tid}/events/{eid}: the whole entry, before and after. */
async function onEntry(env, params, before, after) {
  const shape = e => (e && typeof e === 'object' ? {
    kind: e.kind === 'practice' ? 'practice' : 'event', tid: params.tid, id: params.eid,
    date: e.date, start: e.start, called: e.called || '', title: e.title || '', series: e.series || '', edit: e.edit || null
  } : null);
  return calChange(env, params.code, shape(before), shape(after), params.tree);
}

/* A game, matches/{mid}: woken by one field, `field`, which was `was`. The
   rest is read as it stands now, a field at a time, never the whole game. */
const GAME_FIELDS = ['teamId', 'date', 'kickoff', 'called', 'opponent', 'edit'];
async function onGameField(env, params, field, was) {
  const base = (await where(env.get, params.code, params.tree)).game(params.mid) + '/';
  const vals = await Promise.all(GAME_FIELDS.map(k => env.get(base + k)));
  const g = Object.fromEntries(GAME_FIELDS.map((k, i) => [k, vals[i]]));
  if (!g.teamId) return { to: [], sent: 0, failed: 0, removed: [] };
  const shape = m => ({ kind: 'game', tid: m.teamId, id: params.mid, date: m.date, start: m.kickoff, called: m.called || '', title: m.opponent || '', edit: m.edit || null });
  const after = shape(g);
  /* A kick-off appearing where there was none is either a new game (its date
     arrives in the same write, and that event tells it) or a time added to a
     dated one, which is not worth a buzz. Either way, not this event's to say. */
  if (field === 'kickoff' && (was === null || was === undefined)) return { to: [], sent: 0, failed: 0, removed: [] };
  const before = field === 'date' && (was === null || was === undefined) ? null : shape({ ...g, [field]: was });
  return calChange(env, params.code, before, after, params.tree);
}

/* ---------------- a game she follows ---------------- */

/* The Live tab's *Notify me* (`feedNotify()` in app.js): goals, kick-off,
   the start of each later half, half time and full time, the same items the
   open page pops up, now reaching a phone with Minutes closed. Following was
   only ever per page; the phone now also leaves `follow/{code}/{mid}/{uid}`
   (hers alone in the rules, and only for a game of a club she is in that has
   not ended), and this reads it.

   What wakes it: never the game, which a game being played writes every few
   seconds. A goal is created once, under its own id; a stretch of play is a
   new `periods/{i}`, once per kick-off, restart or resume; `currentHalf` and
   `ended` change once a half. index.js wakes this for those four alone, and
   the first thing read is whether anybody follows the game, so a game nobody
   follows costs one read per goal.

   Who: whoever follows it, while she is still in the club (its index or its
   admins: every role reads a game, so that is the rules' own reader), and not
   whoever logged the goal.

   The scorer is named the way the screen names her (`shownName()`), worked
   out for each reader: by name to the admins, the coaches and trackers of
   any team, her own family and herself, and to everyone once the club has
   opened the roster (`org/rosterOpen`, the admins' one setting); otherwise
   by shirt number. That is also what a family's phone on orgs/ may read. A
   goal is usually tapped first and its scorer added after, so the scorer
   being added is its own small event ('scorer'): the same notification
   again, under the same tag, which replaces the first without a second buzz
   (sw.js sets no renotify), said only for a goal already told.

   When: only while the game is being played. A goal the outbox delivers
   hours late, a backup loaded or a game reopened next week is not news, so
   nothing is said once the game has ended (but full time), or when its last
   stretch of play started more than LIVE_MS ago, and full time only within
   FT_FRESH_MS of the whistle. Each item is said once, kept at
   serverState/followSent/{code}/{mid}/{key} (no rule grants it; a few keys
   a game), and at full time the follows are cleared: the game is over for
   everyone, as the Live tab's *Notify me* card is. */
const LIVE_MS = 4 * 3600000;
const FT_FRESH_MS = 30 * 60000;
const FOLLOW_FIELDS = ['teamId', 'opponent', 'periodCount', 'currentHalf', 'ended', 'periods', 'goals'];
const halfName = (pc, n) => (pc === 2 ? (n === 1 ? '1st half' : n === 2 ? '2nd half' : 'Extra ' + (n - 2))
  : pc === 4 ? (['1st quarter', '2nd quarter', '3rd quarter', '4th quarter'][n - 1] || 'Extra ' + (n - 4)) : 'Period ' + n);

/* Who may read which child's name, for one game: a function of the reader. */
async function namer(env, L, tid, goal) {
  const pids = [goal.pid, goal.assist].filter(x => typeof x === 'string' && x && !/[.#$\[\]\/]/.test(x));
  if (!pids.length) return () => '';
  const A = L.access;
  const [admins, teamIndex, coachIndex, open, ...kids] = await Promise.all([
    env.get(A + '/admins'), env.get(A + '/teamIndex'), env.get(A + '/coachIndex'), env.get(L.org + '/rosterOpen'),
    ...pids.map(pid => env.get(L.player(tid, pid)))
  ]);
  const staff = u => has(admins, u) || has(coachIndex, u) || Object.values(teamIndex && typeof teamIndex === 'object' ? teamIndex : {}).some(t => has(t, u));
  const shown = (p, u) => {
    if (!p || typeof p !== 'object') return '';
    if (open === true || staff(u) || has(p.guardians, u) || has(p.self, u) || has(p.supporters, u)) return String(p.name || '');
    const n = p.number == null ? '' : String(p.number).trim();
    return n ? '#' + n : 'A teammate';
  };
  const okId = x => pids.includes(x);
  const scorer = okId(goal.pid) ? kids[pids.indexOf(goal.pid)] : null;
  const assist = okId(goal.assist) ? kids[pids.indexOf(goal.assist)] : null;
  return u => {
    const by = shown(scorer, u), as = shown(assist, u);
    return by ? by + (as ? ', assist ' + as : '') : '';
  };
}

/* what: 'goal' (id: the goal's), 'scorer' (id: the goal's, was: its scorer
   before), 'period' (id: the stretch of play's), 'half' or 'ended' (was:
   the field before). */
async function onFollowed(env, params, what, id, was) {
  const none = { to: [], sent: 0, failed: 0, removed: [] };
  const { code, mid } = params || {};
  if (!code || !mid) return none;
  const F = 'follow/' + code + '/' + mid;
  const follows = await env.get(F);
  if (!keys(follows).length) return none;
  const now = env.now ? env.now() : Date.now();
  const L = await where(env.get, code, params.tree);
  const base = L.game(mid) + '/';
  const vals = await Promise.all(FOLLOW_FIELDS.map(k => env.get(base + k)));
  const g = Object.fromEntries(FOLLOW_FIELDS.map((k, i) => [k, vals[i]]));
  if (!g.teamId) return none;
  const pc = Number(g.periodCount) || 2;
  const periods = Object.entries(g.periods && typeof g.periods === 'object' ? g.periods : {})
    .map(([i, p]) => ({ i: Number(i), ...(p && typeof p === 'object' ? p : {}) })).sort((a, b) => a.i - b.i);
  const lastStart = Math.max(0, ...periods.map(p => Number(p.start) || 0));
  const playing = !g.ended && now - lastStart < LIVE_MS;
  // the notes stay: full time said by the last half running out is not said again by End game
  const over = () => Promise.resolve(env.remove(F)).catch(() => { });

  let item = null, by = null, goal = null;
  if (what === 'goal' || what === 'scorer') {
    goal = g.goals && g.goals[id];
    const ok = playing && goal && (goal.side === 'us' || goal.side === 'them');
    if (ok && what === 'goal') item = { key: 'goal:' + id, side: goal.side, goal: true };
    // a scorer added to a goal already told: the same notification, now with her
    else if (ok && what === 'scorer' && goal.side === 'us' && goal.pid && goal.pid !== was && (await env.get('serverState/followSent/' + code + '/' + mid + '/goal:' + id)))
      item = { key: 'name:' + id + ':' + goal.pid, side: 'us', goal: true, tag: 'goal:' + id };
    if (item) by = goal.by ? String(goal.by) : null;
  } else if (what === 'period') {
    const p = periods.find(x => String(x.i) === String(id));
    const h = p && (Number(p.half) || 1);
    // a half starts once; every later stretch of the same half is the clock resumed
    if (playing && p && p.start && !periods.some(x => x.i < p.i && (Number(x.half) || 1) === h && x.start))
      item = { key: 'start:' + h, title: h === 1 ? 'Kick-off' : `${halfName(pc, h)} under way` };
  } else if (what === 'half') {
    const h = Number(g.currentHalf) - 1;
    if (h >= 1 && h > (Number(was) || 1) - 1) {
      if (h >= pc) item = { key: 'ft', title: 'Full time', ft: true };
      else if (playing) item = { key: 'brk:' + h, title: pc === 2 && h === 1 ? 'Half time' : `End of the ${halfName(pc, h).toLowerCase()}` };
    }
  } else if (what === 'ended') {
    if (g.ended && !was) item = Math.abs(now - Number(g.ended)) < FT_FRESH_MS ? { key: 'ft', title: 'Full time', ft: true } : { ft: true, quiet: true };
  }
  if (!item) return none;
  if (item.ft && (item.quiet || (what === 'half' && Math.abs(now - lastStart) > LIVE_MS))) { await over(); return none; }

  const told = await env.claim('serverState/followSent/' + code + '/' + mid + '/' + item.key, old => (old ? undefined : { at: now }));
  if (!told) { if (item.ft) await over(); return none; }
  // a goal told with its scorer already on it needs no second telling when the scorer event comes
  if (what === 'goal' && goal.side === 'us' && goal.pid)
    await env.claim('serverState/followSent/' + code + '/' + mid + '/name:' + id + ':' + goal.pid, old => (old ? undefined : { at: now }));

  const A = L.access;
  const [retired, admins, index, team] = await Promise.all([
    env.get('retired/' + code), env.get(A + '/admins'), env.get(A + '/index'), env.get(L.team(g.teamId) + '/name')
  ]);
  if (retired) return none;
  const people = new Set(keys(follows).filter(u => has(index, u) || has(admins, u)));
  if (by) people.delete(by);
  const tn = team || 'Us', them = g.opponent || 'Them';
  let us = 0, th = 0;
  for (const x of Object.values(g.goals && typeof g.goals === 'object' ? g.goals : {})) if (x && x.side === 'us') us++; else if (x && x.side === 'them') th++;
  const title = item.goal ? `Goal — ${item.side === 'us' ? tn : them}` : item.title;
  const name = goal && goal.side === 'us' ? await namer(env, L, g.teamId, goal) : () => '';
  const list = await messagesFor(env, people, u => ({
    // as the open page says it (feedNotify): who scored, then the score
    title, body: short([name(u), `${tn} ${us}–${th} ${them}`].filter(Boolean).join(' · ')),
    // the open page's own tag (feedNotify), so a phone showing both shows one;
    // never urgent: that keeps it on the lock screen until dismissed (sw.js), which a goal is not worth
    tag: 'minutes-' + mid + '-' + (item.tag || item.key), code, hash: `#/team/${g.teamId}/game/${mid}/live`, urgent: ''
  }), null, '3600');   // a goal is news for an hour, not a day
  const res = { to: [...people].sort(), item: item.key, ...(await deliver(env, list)) };
  if (item.ft) await over();
  return res;
}

module.exports = { onFollowed, LIVE_MS, FT_FRESH_MS, onNotice, onMessage, onStaff, onEntry, onGameField, messagesFor, deliver, calNews, calSig, whenOf, teamReaders, noticeReaders, threadReaders, teamFacts, BODY_MAX, BATCH, SOON_DAYS, GAME_FIELDS };
