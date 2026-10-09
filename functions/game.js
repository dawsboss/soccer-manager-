/* The share pages' documents, built by the server from the club (SECURITY.md,
   SEC-10; SERVER.md, "The share pages").

   These are app.js's publicGame(), publicDoc(), fixtureDoc() and
   calendarDoc(), and the game math under them (the clock, minutes played,
   who is on and where, the score, shots, set pieces, possession, the sub
   log), ported line for line. Phones used to write public/ themselves; now
   only the server does, so this is the one place a share page is made, and
   test/mirror.js holds every function here to the app's own, item for item,
   on live, finished and odd games alike. A change to how the app counts
   minutes or reads a sub has to be made in both, or that suite goes red.

   The page carries shirt numbers and never a name: a player is her number
   (shirtOf), and free text goes through every word of every player's name on
   the team (scrubber, as pubText() does), so no child's name is in anything
   built here by construction.

   `now` is passed in everywhere the app reads nowMs(): a game still being
   played has an open period, and minutes are counted to the moment the page
   is built, as the phone counted them to the moment it published.

   Nothing in here imports Firebase, or reads anything: the caller hands over
   the team (with its squad under `players`), the game and that game's
   answers (rsvp/{tid}/g_{mid}). */

const CALLED = { cancelled: 'Cancelled', postponed: 'Postponed' };
const HOME_AWAY = { home: 'Home', away: 'Away', neutral: 'Neutral ground' };
const CAL_KIND = { practice: 'Practice', event: 'Event' };
const EVENT_KINDS = ['corner', 'foul', 'throw', 'goalkick', 'keeper'];
const pad2 = n => String(n).padStart(2, '0');
const hm = t => { const x = /^(\d{1,2}):(\d{2})/.exec(String(t || '')); return x ? pad2(x[1]) + ':' + x[2] : ''; };
const okDay = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const obj = o => (o && typeof o === 'object' ? o : {});

/* players(t): the squad in shirt order, each with her id */
const players = t => Object.entries(obj(t && t.players)).filter(([, p]) => p && typeof p === 'object')
  .map(([k, p]) => ({ ...p, id: p.id || k }))
  .sort((a, b) => (Number(a.number) || 999) - (Number(b.number) || 999) || (a.name || '').localeCompare(b.name || ''));

/* replaceNames() and pubText() */
function replaceNames(text, subs) {
  subs = subs.slice().sort((a, b) => b[0].length - a[0].length);
  for (const [from, to] of subs) {
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'giu');
    text = text.replace(re, (all, pre) => pre + to);
  }
  return text;
}
function scrubber(team) {
  const subs = [];
  for (const p of players(team)) {
    const full = String(p.name || '').trim();
    if (!full) continue;
    subs.push([full, 'a player']);
    for (const w of full.split(/\s+/)) if (w.length >= 2) subs.push([w, 'a player']);
  }
  return s => (s ? replaceNames(String(s), subs) : '');
}

/* The clock: segments(), elapsedSec(), openSeg(), running() */
const segments = m => Object.keys(obj(m.periods)).map(Number).sort((a, b) => a - b).map(i => ({ i, ...m.periods[i] }));
function elapsedSec(m, now) {
  let t = 0;
  for (const s of segments(m)) { if (!s.start) continue; t += ((s.end || now) - s.start); }
  return Math.floor(t / 1000);
}
function running(m) { const l = segments(m); const last = l[l.length - 1]; return !!(last && last.start && !last.end); }

/* Who is on: the stints, and nothing else (CLAUDE.md, the invariants) */
const stintsOf = (m, pid) => Object.entries(obj(m.stints)).filter(([, s]) => s && s.pid === pid);
const openStint = (m, pid) => stintsOf(m, pid).find(([, s]) => s.off == null);
const onField = (m, pid) => !!openStint(m, pid);
function playedSec(m, pid, now) {
  const e = elapsedSec(m, now);
  let t = 0;
  for (const [, s] of stintsOf(m, pid)) { const off = s.off == null ? e : s.off; t += Math.max(0, off - s.on); }
  return t;
}
const slotById = (m, sid) => ((m.formation && m.formation.slots) || []).find(s => s.id === sid) || null;
const spotLabel = st => st ? (st.label || st.role || null) : null;
function currentSpot(m, pid) {
  const o = openStint(m, pid);
  if (!o) return null;
  const sl = o[1].slot ? slotById(m, o[1].slot) : null;
  return sl ? sl.label : (o[1].role || null);
}

/* Who is out: the coach's word, else the family's answer (isOut()) */
function isOut(m, pid, answers) {
  const o = obj(m.out)[pid];
  if (o === false) return false;
  if (o) return true;
  return (obj(obj(answers)[pid]).v === 'no');
}
const squad = (t, m, answers) => players(t).filter(p => p.active !== false && (!m || !isOut(m, p.id, answers)));
const shirtOf = p => String((p && p.number) ?? '').trim() || '–';

/* The score and the tallies */
const list = (m, k) => Object.entries(obj(m[k])).map(([id, x]) => ({ id, ...x })).sort((a, b) => a.t - b.t);
const goalList = m => list(m, 'goals');
function score(m) {
  const g = goalList(m);
  return { us: g.filter(x => x.side === 'us').length, them: g.filter(x => x.side === 'them').length };
}
const evCount = (m, k, side) => list(m, 'events').filter(x => x.kind === k && x.side === side).length;
function shotTally(m) {
  const sh = list(m, 'shots'), g = goalList(m);
  const f = (side, on) => sh.filter(x => x.side === side && !!x.onTarget === on).length;
  return {
    usOn: f('us', true) + g.filter(x => x.side === 'us').length,
    usOff: f('us', false),
    themOn: f('them', true) + g.filter(x => x.side === 'them').length,
    themOff: f('them', false)
  };
}
/* possMarkers() and possession(): `min` is the team's possMin, as the app
   reads it from the team open on the phone that published */
function possMarkers(m) {
  const out = [];
  for (const [id, x] of Object.entries(obj(m.poss))) out.push({ t: x.t, to: x.to, src: 'tap', id, coll: 'poss' });
  for (const [id, x] of Object.entries(obj(m.events))) {
    const other = x.side === 'us' ? 'them' : 'us';
    out.push({ t: x.t, to: x.kind === 'foul' ? other : x.side, src: x.kind, id, coll: 'events' });
  }
  for (const [id, x] of Object.entries(obj(m.goals))) out.push({ t: x.t, to: x.side === 'us' ? 'them' : 'us', src: 'goal', id, coll: 'goals' });
  return out.sort((a, b) => a.t - b.t);
}
function possession(m, now, min) {
  const evs = possMarkers(m), end = elapsedSec(m, now);
  let us = 0, them = 0, contested = 0;
  evs.forEach((e, i) => {
    const to = i + 1 < evs.length ? evs[i + 1].t : end;
    const d = Math.max(0, to - e.t);
    if (d < min) contested += d;
    else if (e.to === 'us') us += d; else them += d;
  });
  return { us, them, contested, changes: evs.length };
}
const gameStatus = (m, now) => m.ended ? 'done'
  : (m.currentHalf || 1) > (m.periodCount || 2) ? 'done'
  : (elapsedSec(m, now) > 0 || running(m)) ? 'live' : 'upcoming';

/* subEvents(): the sub log, newest first */
function subEvents(m) {
  const stints = obj(m.stints), evs = [];
  for (const [sid, s] of Object.entries(stints)) {
    if (!s) continue;
    if (s.on > 0) evs.push({ t: s.on, pid: s.pid, sid, type: 'on' });
    if (s.off != null) evs.push({ t: s.off, pid: s.pid, sid, type: 'off' });
  }
  evs.sort((a, b) => a.t - b.t);
  const rows = [], used = new Set();
  evs.forEach((e, i) => {
    if (used.has(i)) return;
    if (e.type === 'off') {
      const j = evs.findIndex((x, k) => k > i && !used.has(k) && x.type === 'on' && Math.abs(x.t - e.t) <= 3);
      if (j > -1) {
        used.add(i); used.add(j);
        const same = evs[j].pid === e.pid;
        rows.push({
          t: e.t, off: e.pid, on: evs[j].pid, move: same,
          spot: same ? spotLabel(stints[evs[j].sid] && slotById(m, stints[evs[j].sid].slot)) || (stints[evs[j].sid] || {}).role : null
        });
        return;
      }
    }
    used.add(i);
    rows.push({ t: e.t, off: e.type === 'off' ? e.pid : null, on: e.type === 'on' ? e.pid : null });
  });
  return rows.reverse();
}

/* publicGame(t, m) */
function publicGame(t, m, answers, now) {
  const pub = scrubber(t);
  const numOf = pid => shirtOf(obj(t.players)[pid]);
  const min = t.possMin != null ? Number(t.possMin) : 5;
  return {
    id: m.id,
    opponent: m.opponent || '', date: m.date || '', kickoff: m.kickoff || '', venue: m.venue || '',
    home: HOME_AWAY[m.home] ? m.home : '', arrive: hm(m.arrive), called: CALLED[m.called] ? m.called : '',
    kit: pub(m.kit), notes: pub(m.notes),
    periodCount: m.periodCount || 2, periodMinutes: m.periodMinutes || 40,
    currentHalf: m.currentHalf || 1, periods: m.periods || {},
    status: gameStatus(m, now), score: score(m), shots: shotTally(m),
    events: Object.fromEntries(EVENT_KINDS.map(k => [k, { us: evCount(m, k, 'us'), them: evCount(m, k, 'them') }])
      .filter(([, v]) => v.us + v.them > 0)),
    poss: possession(m, now, min),
    players: squad(t, m, answers).map(p => ({
      n: shirtOf(p), sec: playedSec(m, p.id, now), on: onField(m, p.id),
      spot: currentSpot(m, p.id) || null, plan: obj(m.planned)[p.id] || 0
    })).sort((a, b) => (Number(a.n) || 999) - (Number(b.n) || 999)),
    goals: goalList(m).map(g => ({ t: g.t, side: g.side, n: g.pid ? numOf(g.pid) : null })),
    log: subEvents(m).map(r => ({
      t: r.t, on: r.on ? numOf(r.on) : null, off: r.off ? numOf(r.off) : null,
      move: !!r.move, spot: r.spot || null
    }))
  };
}

/* publicEvents(t, all): the season link the entries marked for it, the
   members' feed every one */
function eventsDoc(team, all) {
  const pub = scrubber(team), out = {};
  for (const [id, e] of Object.entries(obj(team && team.events))) {
    if (!e || !(e.public || all) || !okDay(e.date)) continue;
    const kind = e.kind === 'practice' ? 'practice' : 'event';
    out[id] = {
      kind, title: pub(e.title) || CAL_KIND[kind], date: e.date,
      start: hm(e.start), end: hm(e.end), venue: pub(e.venue), notes: pub(e.notes),
      called: CALLED[e.called] ? e.called : ''
    };
  }
  return out;
}

/* A game on the members' feed, as calendarDoc() carries it: when and where,
   status and score, no players */
function feedGame(t, m, now) {
  const pub = scrubber(t);
  return {
    id: m.id, opponent: m.opponent || '', date: m.date || '', kickoff: m.kickoff || '', venue: m.venue || '',
    home: HOME_AWAY[m.home] ? m.home : '', arrive: hm(m.arrive), called: CALLED[m.called] ? m.called : '',
    kit: pub(m.kit), notes: pub(m.notes), status: gameStatus(m, now), score: score(m),
    periodCount: m.periodCount || 2, periodMinutes: m.periodMinutes || 40
  };
}

/* The season's record, from the games as the page carries them */
function record(games) {
  let w = 0, d = 0, l = 0, gf = 0, ga = 0;
  for (const g of Object.values(obj(games))) {
    if (!g || g.status !== 'done') continue;
    const s = obj(g.score), us = Number(s.us) || 0, them = Number(s.them) || 0;
    gf += us; ga += them;
    if (us > them) w++; else if (us === them) d++; else l++;
  }
  return { w, d, l, gf, ga };
}

const head = t => ({ name: t.name || 'Team', logo: t.logo || null });
/* Where the page sends a signed-in visitor, and where a calendar feed's
   entries link back to (functions/calendar.js). The share pages themselves
   never follow `app` (SECURITY.md, SEC-D4); the feed does, so it is https or
   left out, and comes from the page as it was, or the site's address the
   server was deployed with (index.js, SOCCER_SITE). */
const okApp = a => typeof a === 'string' && /^https:\/\/[^\s"'<>]+$/.test(a);
const link = (t, app) => ({ teamId: t.id, ...(okApp(app) ? { app } : {}) });
/* The end date its coach gave a page (the app's untilOf()): the public/ read
   rule refuses it from then on, and the calendar function says it has gone. */
const untilOf = u => typeof u === 'number' && u > 0 ? { until: u } : {};

/* publicDoc(t): `games` is every game of the team, `answers` its rsvp/{tid} */
function publicDoc(t, games, answers, now, app) {
  const out = {};
  for (const m of games) out[m.id] = publicGame(t, m, obj(answers)['g_' + m.id], now);
  return { team: head(t), link: link(t, app), games: out, events: eventsDoc(t, false), record: record(out), updated: now, ...untilOf(t.shareUntil) };
}
/* fixtureDoc(t, m) */
const fixtureDoc = (t, m, answers, now, app) => ({
  team: head(t), link: link(t, app), fixture: m.id, games: { [m.id]: publicGame(t, m, answers, now) }, updated: now, ...untilOf(m.shareUntil || t.shareUntil)
});
/* calendarDoc(t) */
function calendarDoc(t, games, now, app) {
  const out = {};
  for (const m of games) out[m.id] = feedGame(t, m, now);
  return { team: head(t), link: link(t, app), calendar: true, games: out, events: eventsDoc(t, true), updated: now, ...untilOf(t.calFeedUntil) };
}

module.exports = {
  publicGame, publicDoc, fixtureDoc, calendarDoc, feedGame, eventsDoc, record, scrubber,
  okApp, gameStatus, elapsedSec, playedSec, subEvents, CALLED, HOME_AWAY
};
