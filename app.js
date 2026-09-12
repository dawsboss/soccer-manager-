/* Minutes — soccer sub & minutes tracker.
   Static app. Data lives in localStorage, and mirrors to Firebase Realtime
   Database when a config + workspace code are present. */

const LS_DATA = 'sm.data.v1';
const LS_UI = 'sm.ui.v1';
const LS_WS = 'sm.workspace';

let state = { teams: {}, matches: {} };
let ui = { view: 'match', teamId: null, matchId: null, picked: null, dragging: false, editFid: null };
let lastLog = [];

const ROLES = ['GK', 'Back', 'Mid', 'Wing', 'Forward'];
const S = (label, role, x, y) => ({ id: 's' + label + x, label, role, x, y });

/* Built-in shapes, keyed by how many are on the pitch. Coaches can copy one,
   drag it around and save it as a team default. */
const PRESETS = {
  11: {
    '4-4-2': [S('GK', 'GK', 50, 92), S('LB', 'Back', 16, 74), S('LCB', 'Back', 38, 79), S('RCB', 'Back', 62, 79), S('RB', 'Back', 84, 74),
    S('LM', 'Mid', 16, 50), S('LCM', 'Mid', 38, 53), S('RCM', 'Mid', 62, 53), S('RM', 'Mid', 84, 50),
    S('LS', 'Forward', 40, 22), S('RS', 'Forward', 60, 22)],
    '4-3-3': [S('GK', 'GK', 50, 92), S('LB', 'Back', 16, 74), S('LCB', 'Back', 38, 79), S('RCB', 'Back', 62, 79), S('RB', 'Back', 84, 74),
    S('LCM', 'Mid', 32, 55), S('CM', 'Mid', 50, 61), S('RCM', 'Mid', 68, 55),
    S('LW', 'Wing', 18, 27), S('ST', 'Forward', 50, 18), S('RW', 'Wing', 82, 27)],
    '3-5-2': [S('GK', 'GK', 50, 92), S('LCB', 'Back', 30, 80), S('CB', 'Back', 50, 83), S('RCB', 'Back', 70, 80),
    S('LWB', 'Wing', 12, 58), S('LCM', 'Mid', 35, 57), S('CM', 'Mid', 50, 63), S('RCM', 'Mid', 65, 57), S('RWB', 'Wing', 88, 58),
    S('LS', 'Forward', 40, 22), S('RS', 'Forward', 60, 22)]
  },
  9: {
    '3-3-2': [S('GK', 'GK', 50, 92), S('LB', 'Back', 22, 76), S('CB', 'Back', 50, 81), S('RB', 'Back', 78, 76),
    S('LM', 'Mid', 22, 53), S('CM', 'Mid', 50, 57), S('RM', 'Mid', 78, 53),
    S('LS', 'Forward', 38, 23), S('RS', 'Forward', 62, 23)],
    '3-2-3': [S('GK', 'GK', 50, 92), S('LB', 'Back', 22, 76), S('CB', 'Back', 50, 81), S('RB', 'Back', 78, 76),
    S('LCM', 'Mid', 36, 56), S('RCM', 'Mid', 64, 56),
    S('LW', 'Wing', 20, 27), S('ST', 'Forward', 50, 20), S('RW', 'Wing', 80, 27)]
  },
  7: {
    '2-3-1': [S('GK', 'GK', 50, 92), S('LB', 'Back', 32, 77), S('RB', 'Back', 68, 77),
    S('LM', 'Mid', 20, 53), S('CM', 'Mid', 50, 57), S('RM', 'Mid', 80, 53), S('ST', 'Forward', 50, 23)],
    '3-2-1': [S('GK', 'GK', 50, 92), S('LB', 'Back', 22, 77), S('CB', 'Back', 50, 81), S('RB', 'Back', 78, 77),
    S('LM', 'Mid', 35, 53), S('RM', 'Mid', 65, 53), S('ST', 'Forward', 50, 23)]
  },
  5: {
    '1-2-1': [S('GK', 'GK', 50, 92), S('CB', 'Back', 50, 77), S('LM', 'Mid', 28, 51), S('RM', 'Mid', 72, 51), S('ST', 'Forward', 50, 25)]
  }
};

const presetsFor = size => PRESETS[size] || {};
const clone = o => JSON.parse(JSON.stringify(o));

/* How well a player suits a spot. Neutral (0) means "fine here" — the default
   for youth players, who can go anywhere. */
function fit(p, slot) {
  if (!slot) return 0;
  if (slot.role === 'GK') return p.gk || p.preferred === 'GK' ? 3 : -3;
  if (p.gk) return -1;
  if (p.preferred === slot.role) return 2;
  if ((p.canPlay || []).includes(slot.role)) return 1;
  return p.anywhere === false ? -1 : 0;
}

/* Greedy best-fit assignment of an XI to the shape's spots. prev keeps players
   in the role they held last block rather than rotating them for no reason. */
function assignSlots(chosen, slots, prev) {
  if (!slots || !slots.length) return {};
  const pairs = [];
  for (const p of chosen) for (const s of slots)
    pairs.push({ pid: p.id, sid: s.id, v: fit(p, s) + (prev && prev[s.id] === p.id ? 0.5 : 0) });
  pairs.sort((a, b) => b.v - a.v);
  const assign = {}, usedP = new Set(), usedS = new Set();
  for (const x of pairs) {
    if (usedP.has(x.pid) || usedS.has(x.sid)) continue;
    assign[x.sid] = x.pid; usedP.add(x.pid); usedS.add(x.sid);
  }
  return assign;
}

const slotById = (m, sid) => ((m.formation && m.formation.slots) || []).find(s => s.id === sid) || null;
const slotOf = (m, pid) => slotById(m, ((m.positions || {})[pid] || {}).slot);
const slotTaken = (m, sid) => Object.values(m.positions || {}).some(p => p.slot === sid);

/* Old players stored a flat positions[] list; fold it into the new fields. */
function migrate(p) {
  if (p.preferred !== undefined || !Array.isArray(p.positions)) return p;
  const [first, ...rest] = p.positions;
  return { ...p, preferred: first || '', canPlay: rest, anywhere: true };
}

/* ---------------- utils ---------------- */
const $ = (s, r = document) => r.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

function mmss(sec) {
  sec = Math.max(0, Math.floor(sec));
  return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
}
function mins(sec) { return Math.round(sec / 60); }

function setDeep(obj, path, value) {
  const k = path.split('/');
  let o = obj;
  for (let i = 0; i < k.length - 1; i++) { if (typeof o[k[i]] !== 'object' || o[k[i]] === null) o[k[i]] = {}; o = o[k[i]]; }
  o[k[k.length - 1]] = value;
}
function delDeep(obj, path) {
  const k = path.split('/');
  let o = obj;
  for (let i = 0; i < k.length - 1; i++) { if (!o[k[i]]) return; o = o[k[i]]; }
  delete o[k[k.length - 1]];
}

/* ---------------- storage ---------------- */
function saveLocal() {
  try { localStorage.setItem(LS_DATA, JSON.stringify(state)); } catch (e) { }
}
function saveUi() {
  try { localStorage.setItem(LS_UI, JSON.stringify({ view: ui.view, teamId: ui.teamId, matchId: ui.matchId })); } catch (e) { }
}
function loadLocal() {
  try {
    const d = JSON.parse(localStorage.getItem(LS_DATA) || 'null');
    if (d) state = { teams: d.teams || {}, matches: d.matches || {} };
    const u = JSON.parse(localStorage.getItem(LS_UI) || 'null');
    if (u) Object.assign(ui, u);
  } catch (e) { }
}

/* ---------------- firebase sync ---------------- */
let fb = null; // { db, ref, set, remove, onValue, base }

function setSync(stateName, label) {
  const b = $('#syncBadge');
  b.dataset.state = stateName;
  b.textContent = label;
}

async function initSync() {
  const cfg = window.SOCCER_FIREBASE_CONFIG;
  const code = localStorage.getItem(LS_WS);
  if (!cfg || !cfg.apiKey || !cfg.databaseURL) { setSync('off', 'this device'); return; }
  if (!code) { setSync('off', 'no code'); return; }
  try {
    const appMod = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
    const dbMod = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js');
    const app = appMod.initializeApp(cfg);
    const db = dbMod.getDatabase(app);
    fb = { db, ref: dbMod.ref, set: dbMod.set, remove: dbMod.remove, base: 'workspaces/' + code };

    dbMod.onValue(dbMod.ref(db, '.info/connected'), s => {
      setSync(s.val() ? 'live' : 'off', s.val() ? 'synced' : 'offline');
    });

    dbMod.onValue(dbMod.ref(db, fb.base), snap => {
      const v = snap.val();
      if (!v) { pushAll(); return; }
      const next = { teams: v.teams || {}, matches: v.matches || {} };
      if (JSON.stringify(next) === JSON.stringify(state)) return;
      if (ui.dragging) return;
      state = next;
      saveLocal();
      render();
    });
  } catch (e) {
    console.error(e);
    setSync('off', 'sync failed');
  }
}

function pushAll() { if (fb) fb.set(fb.ref(fb.db, fb.base), state); }
function remoteSet(path, value) { if (fb) fb.set(fb.ref(fb.db, fb.base + '/' + path), value === undefined ? null : value); }
function remoteDel(path) { if (fb) fb.remove(fb.ref(fb.db, fb.base + '/' + path)); }

function quiet(path, value) { setDeep(state, path, value); remoteSet(path, value); }
function commit(path, value) { setDeep(state, path, value); saveLocal(); remoteSet(path, value); render(); }
function drop(path) { delDeep(state, path); saveLocal(); remoteDel(path); render(); }

/* ---------------- model helpers ---------------- */
const teams = () => Object.values(state.teams).sort((a, b) => a.name.localeCompare(b.name));
const team = () => state.teams[ui.teamId] || null;
const players = t => Object.values((t && t.players) || {}).sort((a, b) => (Number(a.number) || 999) - (Number(b.number) || 999) || a.name.localeCompare(b.name));
const teamMatches = id => Object.values(state.matches).filter(m => m.teamId === id).sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt);
const match = () => state.matches[ui.matchId] || null;

function segments(m) {
  return Object.keys(m.periods || {}).map(Number).sort((a, b) => a - b).map(i => ({ i, ...m.periods[i] }));
}
function elapsedSec(m, now = Date.now()) {
  let t = 0;
  for (const s of segments(m)) { if (!s.start) continue; t += ((s.end || now) - s.start); }
  return Math.floor(t / 1000);
}
function halfSec(m, now = Date.now()) {
  const h = m.currentHalf || 1;
  let t = 0;
  for (const s of segments(m)) { if (!s.start || (s.half || 1) !== h) continue; t += ((s.end || now) - s.start); }
  return Math.floor(t / 1000);
}
function openSeg(m) { const l = segments(m); const last = l[l.length - 1]; return last && last.start && !last.end ? last : null; }
const running = m => !!openSeg(m);

function halfName(m, n) {
  const c = m.periodCount || 2;
  if (c === 2) return n === 1 ? '1st half' : n === 2 ? '2nd half' : 'Extra ' + (n - 2);
  if (c === 4) return ['1st quarter', '2nd quarter', '3rd quarter', '4th quarter'][n - 1] || 'Extra ' + (n - 4);
  return 'Period ' + n;
}

function stintsOf(m, pid) { return Object.entries(m.stints || {}).filter(([, s]) => s.pid === pid); }
function openStint(m, pid) { return stintsOf(m, pid).find(([, s]) => s.off == null); }

function playedSec(m, pid, now = Date.now()) {
  const e = elapsedSec(m, now);
  let t = 0;
  for (const [, s] of stintsOf(m, pid)) { const off = s.off == null ? e : s.off; t += Math.max(0, off - s.on); }
  return t;
}
function plannedSec(m, pid) { return (m.planned && m.planned[pid] != null ? Number(m.planned[pid]) : 0) * 60; }
const onField = (m, pid) => !!(m.positions && m.positions[pid]);
const fieldIds = m => Object.keys(m.positions || {});

const isOut = (m, pid) => !!(m.out && m.out[pid]);
function squad(t, m) {
  return players(t).filter(p => p.active !== false && (!m || !isOut(m, p.id)));
}
const keeperOf = (t, m) => squad(t, m).find(p => p.gk) || null;
const pairsWith = (a, b) => !!((a.pairs || {})[b.id] || (b.pairs || {})[a.id]);
const avoidsWith = (a, b) => !!((a.avoid || {})[b.id] || (b.avoid || {})[a.id]);
const rating = p => Number(p.rating) || 3;
const matchMinutes = m => (m.periodCount || 2) * (m.periodMinutes || 40);

function evenSplit(m, roster) {
  const gk = roster.find(p => p.gk);
  const slots = (m.onFieldCount || 11) - (gk ? 1 : 0);
  const outfield = roster.filter(p => !p.gk).length;
  const total = matchMinutes(m) * slots;
  return outfield ? Math.round(total / outfield) : 0;
}

function clashesOn(t, m) {
  const on = fieldIds(m).map(id => (t.players || {})[id]).filter(Boolean);
  const out = [];
  for (let i = 0; i < on.length; i++) for (let j = i + 1; j < on.length; j++)
    if (avoidsWith(on[i], on[j])) out.push([on[i], on[j]]);
  return out;
}

/* Greedy block planner. Each block is a stretch of the game with a fixed XI;
   substitutions happen at block boundaries. */
function buildPlan(m, roster) {
  const blockLen = Number(m.blockMinutes) || 10;
  const perHalf = Math.max(1, Math.round((m.periodMinutes || 40) / blockLen));
  const total = perHalf * (m.periodCount || 2);
  const realLen = (m.periodMinutes || 40) / perHalf;

  const gk = roster.find(p => p.gk) || null;
  const field = roster.filter(p => !gk || p.id !== gk.id);
  const slots = Math.min((m.onFieldCount || 11) - (gk ? 1 : 0), field.length);
  const teamAvg = field.length ? field.reduce((s, p) => s + rating(p), 0) / field.length : 3;

  const need = {}, consec = {}, got = {};
  for (const p of field) { need[p.id] = (m.planned && m.planned[p.id] != null ? Number(m.planned[p.id]) : 0); consec[p.id] = 0; got[p.id] = 0; }

  const shape = (m.formation && m.formation.slots) || [];
  const blocks = [];
  let prevAssign = null;
  for (let b = 0; b < total; b++) {
    const left = total - b;
    const cap = p => p.maxStint ? Math.max(1, Math.round(Number(p.maxStint) / realLen)) : 99;
    const score = new Map(field.map(p => [p.id,
      (need[p.id] / left) + rating(p) * 0.02 - (consec[p.id] >= cap(p) ? 500 : 0)]));

    const pool = [...field];
    const chosen = [];
    while (chosen.length < slots && pool.length) {
      pool.sort((a, c) => score.get(c.id) - score.get(a.id));
      const pick = pool.find(p => !chosen.some(c => avoidsWith(c, p))) || pool[0];
      pool.splice(pool.indexOf(pick), 1);
      chosen.push(pick);
      for (const p of pool) if (pairsWith(pick, p)) score.set(p.id, score.get(p.id) + 0.8);
    }

    // one balance pass: if this block is much weaker than the squad average, upgrade
    const avg = chosen.length ? chosen.reduce((s, p) => s + rating(p), 0) / chosen.length : teamAvg;
    if (avg < teamAvg - 0.35 && pool.length) {
      const weakest = [...chosen].sort((a, c) => rating(a) - rating(c))[0];
      const best = [...pool].filter(p => consec[p.id] < cap(p)).sort((a, c) => rating(c) - rating(a))[0];
      if (best && rating(best) > rating(weakest) &&
        !chosen.some(c => c.id !== weakest.id && avoidsWith(c, best))) {
        chosen[chosen.indexOf(weakest)] = best;
      }
    }

    const ids = chosen.map(p => p.id);
    for (const p of field) {
      const on = ids.includes(p.id);
      consec[p.id] = on ? consec[p.id] + 1 : 0;
      if (on) { need[p.id] -= realLen; got[p.id] += realLen; }
    }
    const all = gk ? [gk, ...chosen] : chosen;
    const assign = assignSlots(all, shape, prevAssign);
    prevAssign = assign;
    blocks.push({ start: Math.round(b * realLen * 60), ids: all.map(p => p.id), assign });
  }

  const projected = {};
  for (const p of field) projected[p.id] = Math.round(got[p.id]);
  if (gk) projected[gk.id] = matchMinutes(m);
  return { blockMinutes: realLen, blocks, projected };
}

function planBlockAt(m, sec) {
  if (!m.plan || !m.plan.blocks) return null;
  let cur = null;
  for (const b of m.plan.blocks) if (b.start <= sec) cur = b;
  return cur;
}
function nextPlanBlock(m, sec) {
  if (!m.plan || !m.plan.blocks) return null;
  return m.plan.blocks.find(b => b.start > sec) || null;
}

/* Turn a picker value into a standalone copy. Always a copy: a game must never
   point at a team shape that a coach might edit next month. */
function resolveShape(t, pick, size) {
  if (pick === 'none') return null;
  if (pick.startsWith('team:')) {
    const f = (t.formations || {})[pick.slice(5)];
    return f ? { name: f.name, size: f.size, slots: clone(f.slots) } : null;
  }
  if (pick.startsWith('preset:')) {
    const [, sz, k] = pick.split(':');
    const sl = presetsFor(Number(sz))[k];
    return sl ? { name: k, size: Number(sz), slots: clone(sl) } : null;
  }
  // 'auto' — the team default for this side size, else the first preset
  const fid = (t.defaults || {})[size];
  const f = fid && (t.formations || {})[fid];
  if (f) return { name: f.name, size: f.size, slots: clone(f.slots) };
  const k = Object.keys(presetsFor(size))[0];
  return k ? { name: k, size, slots: clone(presetsFor(size)[k]) } : null;
}

function parseTime(str, fallback) {
  const s = String(str || '').trim();
  if (/^\d+:\d{1,2}$/.test(s)) { const [a, b] = s.split(':').map(Number); return a * 60 + b; }
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s) * 60);
  return fallback;
}

/* ---------------- actions ---------------- */
function startClock(m) {
  if (running(m)) return;
  const idx = segments(m).length;
  commit(`matches/${m.id}/periods/${idx}`, { half: m.currentHalf || 1, start: Date.now() });
}
function pauseClock(m) {
  const s = openSeg(m);
  if (!s) return;
  commit(`matches/${m.id}/periods/${s.i}/end`, Date.now());
}
function endHalf(m) {
  const s = openSeg(m);
  if (s) { setDeep(state, `matches/${m.id}/periods/${s.i}/end`, Date.now()); remoteSet(`matches/${m.id}/periods/${s.i}/end`, Date.now()); }
  const next = (m.currentHalf || 1) + 1;
  commit(`matches/${m.id}/currentHalf`, next);
  toast(halfName(m, next - 1) + ' ended');
}

function putOnField(m, pid, x, y, slot) {
  const path = `matches/${m.id}`;
  const pos = { x, y, slot: slot || null };
  setDeep(state, `${path}/positions/${pid}`, pos);
  remoteSet(`${path}/positions/${pid}`, pos);
  if (!openStint(m, pid)) {
    const sid = uid(), rec = { pid, on: elapsedSec(m) };
    setDeep(state, `${path}/stints/${sid}`, rec);
    remoteSet(`${path}/stints/${sid}`, rec);
  }
  saveLocal(); render();
}
function takeOffField(m, pid) {
  const path = `matches/${m.id}`;
  const open = openStint(m, pid);
  if (open) { const t = elapsedSec(m); setDeep(state, `${path}/stints/${open[0]}/off`, t); remoteSet(`${path}/stints/${open[0]}/off`, t); }
  delDeep(state, `${path}/positions/${pid}`); remoteDel(`${path}/positions/${pid}`);
  saveLocal(); render();
}
function swap(m, outPid, inPid) {
  const pos = (m.positions || {})[outPid] || { x: 50, y: 50 };
  takeOffField(m, outPid);
  putOnField(m, inPid, pos.x, pos.y, pos.slot);
}

function subEvents(m) {
  const evs = [];
  for (const [sid, s] of Object.entries(m.stints || {})) {
    if (s.on > 0) evs.push({ t: s.on, pid: s.pid, sid, type: 'on' });
    if (s.off != null) evs.push({ t: s.off, pid: s.pid, sid, type: 'off' });
  }
  evs.sort((a, b) => a.t - b.t);
  const rows = [];
  const used = new Set();
  evs.forEach((e, i) => {
    if (used.has(i)) return;
    if (e.type === 'off') {
      const j = evs.findIndex((x, k) => k > i && !used.has(k) && x.type === 'on' && Math.abs(x.t - e.t) <= 3);
      if (j > -1) {
        used.add(i); used.add(j);
        rows.push({ t: e.t, off: e.pid, offSid: e.sid, on: evs[j].pid, onSid: evs[j].sid });
        return;
      }
    }
    used.add(i);
    rows.push({
      t: e.t,
      off: e.type === 'off' ? e.pid : null, offSid: e.type === 'off' ? e.sid : null,
      on: e.type === 'on' ? e.pid : null, onSid: e.type === 'on' ? e.sid : null
    });
  });
  return rows.reverse();
}

/* move a whole sub (both sides) to a new match time */
function moveSub(m, row, t) {
  t = clamp(Math.round(t), 0, elapsedSec(m));
  const p = `matches/${m.id}/stints`;
  if (row.offSid) { setDeep(state, `${p}/${row.offSid}/off`, t); remoteSet(`${p}/${row.offSid}/off`, t); }
  if (row.onSid) { setDeep(state, `${p}/${row.onSid}/on`, t); remoteSet(`${p}/${row.onSid}/on`, t); }
  saveLocal(); render();
}

/* record a sub that happened earlier than you tapped it */
function subAt(m, outPid, inPid, t) {
  const e = elapsedSec(m);
  const open = openStint(m, outPid);
  const floor = open ? open[1].on : 0;
  t = clamp(Math.round(t), floor, e);
  const pos = (m.positions || {})[outPid] || { x: 50, y: 50, slot: null };
  const p = `matches/${m.id}`;
  if (open) { setDeep(state, `${p}/stints/${open[0]}/off`, t); remoteSet(`${p}/stints/${open[0]}/off`, t); }
  delDeep(state, `${p}/positions/${outPid}`); remoteDel(`${p}/positions/${outPid}`);
  const sid = uid(), rec = { pid: inPid, on: t };
  setDeep(state, `${p}/stints/${sid}`, rec); remoteSet(`${p}/stints/${sid}`, rec);
  setDeep(state, `${p}/positions/${inPid}`, pos); remoteSet(`${p}/positions/${inPid}`, pos);
  saveLocal(); render();
}

/* nudge the match clock when it was started late or left running */
function adjustClock(m, deltaSec) {
  const segs = segments(m).filter(s => (s.half || 1) === (m.currentHalf || 1) && s.start);
  const first = segs[0];
  if (!first) { toast('Start the clock first'); return; }
  const span = (first.end || Date.now()) - first.start;
  const shift = clamp(-deltaSec * 1000, -60 * 60000, span - 1000);
  commit(`matches/${m.id}/periods/${first.i}/start`, first.start + shift);
}

/* ---------------- sheet / toast ---------------- */
function openSheet(html) {
  $('#sheet').innerHTML = html;
  $('#sheet').hidden = false;
  $('#scrim').hidden = false;
}
function closeSheet() { $('#sheet').hidden = true; $('#scrim').hidden = true; }
let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2200);
}

/* ---------------- rendering ---------------- */
function render() {
  const t = team();
  if (!t && teams().length) { ui.teamId = teams()[0].id; }
  $('#teamSwitchName').textContent = team() ? team().name : 'No team yet';
  const tabView = ui.view === 'formation' ? 'setup' : ui.view;
  for (const b of document.querySelectorAll('#tabs button')) b.setAttribute('aria-current', String(b.dataset.view === tabView));
  const app = $('#app');
  const v = ui.view;
  app.innerHTML =
    v === 'match' ? viewMatch() :
      v === 'matches' ? viewMatches() :
        v === 'roster' ? viewRoster() :
          v === 'season' ? viewSeason() :
            v === 'formation' ? viewFormation() : viewSetup();
  if (v === 'match') wireDrag();
  if (v === 'formation') wireFormationDrag();
  saveUi();
}

function needTeam() {
  return `<div class="empty"><strong>Start with a team</strong>Add a team, then its players. Everything else hangs off that.
  <div style="margin-top:14px"><button class="btn" data-act="newteam">Add a team</button></div></div>`;
}

/* --- match --- */
function viewMatch() {
  const t = team(); if (!t) return needTeam();
  let m = match();
  if (!m || m.teamId !== t.id) { const l = teamMatches(t.id); m = l[0] || null; ui.matchId = m ? m.id : null; }
  if (!m) return `<div class="empty"><strong>No game yet</strong>Create a game to start tracking minutes.
    <div style="margin-top:14px"><button class="btn" data-act="newmatch">Add a game</button></div></div>`;

  const roster = squad(t, m);
  const now = Date.now();
  const el = elapsedSec(m, now);
  const bench = roster.filter(p => !onField(m, p.id));
  const field = roster.filter(p => onField(m, p.id));
  const cap = m.onFieldCount || 11;

  const tokens = field.map(p => {
    const pos = m.positions[p.id];
    const pl = playedSec(m, p.id, now), pd = plannedSec(m, p.id);
    const owed = pd > 0 && pl < pd ? 1 : 0;
    const sl = slotOf(m, p.id);
    return `<div class="token" data-pid="${p.id}" data-owed="${owed}" data-picked="${ui.picked === p.id ? 1 : 0}"
      style="left:${pos.x}%;top:${pos.y}%">
      ${sl ? `<span class="role">${esc(sl.label)}</span>` : ''}
      <span class="num">${esc(p.number ?? '')}</span>
      <span class="mins" data-tokmins="${p.id}">${mins(pl)}′</span>
      <span class="nm">${esc(p.name.split(' ')[0])}</span></div>`;
  }).join('');

  const shape = (m.formation && m.formation.slots) || [];
  const ghosts = shape.filter(s => !slotTaken(m, s.id)).map(s =>
    `<button type="button" class="ghost" data-act="fillslot" data-sid="${s.id}"
      style="left:${s.x}%;top:${s.y}%">${esc(s.label)}</button>`).join('');

  const pitch = `<div class="pitch" id="pitch">
    <svg class="lines" viewBox="0 0 68 100" preserveAspectRatio="none" aria-hidden="true">
      <g fill="none" stroke="rgba(255,255,255,.45)" stroke-width=".5">
        <rect x="2" y="2" width="64" height="96"/>
        <line x1="2" y1="50" x2="66" y2="50"/>
        <circle cx="34" cy="50" r="9"/>
        <rect x="16" y="2" width="36" height="15"/><rect x="16" y="83" width="36" height="15"/>
        <rect x="26" y="2" width="16" height="6"/><rect x="26" y="92" width="16" height="6"/>
      </g>
    </svg>${ghosts}${tokens}
    <div class="pitchhint">${ui.picked ? 'Tap a spot, a player to swap, or anywhere on the grass' : field.length ? 'Drag to move · tap to pick' : 'Tap a bench player, then tap where she starts'}</div>
  </div>`;

  const clock = `<div class="clockwrap">
    <div class="clockline">
      <div class="clock" id="clock">${mmss(el)}</div>
      <div class="clockmeta"><b>${esc(halfName(m, m.currentHalf || 1))}</b><span id="halfclock">${mmss(halfSec(m, now))}</span> of ${m.periodMinutes || 40}:00</div>
    </div>
    <div class="clockbtns">
      ${running(m)
      ? `<button class="btn stop" data-act="pause">Pause clock</button><button class="btn stop" data-act="endhalf">End ${esc(halfName(m, m.currentHalf || 1)).toLowerCase()}</button>`
      : `<button class="btn" data-act="start">${el ? 'Resume clock' : 'Start clock'}</button>${el ? `<button class="btn stop" data-act="endhalf">End ${esc(halfName(m, m.currentHalf || 1)).toLowerCase()}</button>` : ''}`}
    </div>
    <button class="linkbtn" data-act="fixclock">Clock reading wrong?</button></div>`;

  const benchRows = bench.map(p => playerRow(m, p, now, false)).join('') ||
    `<p class="muted" style="margin:2px 0">Everyone is on the pitch.</p>`;
  const fieldRows = field.map(p => playerRow(m, p, now, true)).join('') ||
    `<p class="muted" style="margin:2px 0">Nobody placed yet. Pick from the bench below.</p>`;

  lastLog = subEvents(m);
  const name = id => { const p = (t.players || {})[id]; return p ? esc(p.name) : 'Unknown'; };
  const logHtml = lastLog.length
    ? `<div class="log">${lastLog.map((r, i) => `<button type="button" data-act="fixsub" data-i="${i}">
        <span class="t">${mmss(r.t)}</span>
        <span>${r.on ? `<span class="on">${name(r.on)} on</span>` : ''}${r.on && r.off ? ' for ' : ''}${r.off ? `<span class="off">${name(r.off)} off</span>` : ''}</span>
        <span class="muted">fix</span></button>`).join('')}</div>`
    : `<p class="muted" style="margin:0">Subs show up here with the minute they happened. Tap one to correct the time.</p>`;

  const clashes = clashesOn(t, m);
  const warn = clashes.length
    ? `<div class="warn">${clashes.map(([a, b]) => `${esc(a.name)} and ${esc(b.name)} are on together`).join(' · ')}</div>` : '';

  const nb = nextPlanBlock(m, el), cb = planBlockAt(m, el);
  let planHtml;
  if (!m.plan) {
    planHtml = `<p class="muted" style="margin:0 0 10px">Build a block-by-block plan from planned minutes, ratings and pairings.</p>
      <button class="btn wide" data-act="makeplan">Plan the game</button>`;
  } else if (nb) {
    const onIds = nb.ids.filter(id => !cb || !cb.ids.includes(id));
    const offIds = cb ? cb.ids.filter(id => !nb.ids.includes(id)) : [];
    planHtml = `<div class="spread" style="align-items:flex-start">
      <div><div class="muted">Next change at ${mmss(nb.start)}</div>
      <div style="margin-top:4px">${onIds.length ? `<span class="on">on: ${onIds.map(name).join(', ')}</span><br>` : ''}${offIds.length ? `<span class="off">off: ${offIds.map(name).join(', ')}</span>` : ''}${!onIds.length && !offIds.length ? 'no changes' : ''}</div></div>
      <button class="btn sm" data-act="applyblock" data-start="${nb.start}">Make these subs</button></div>
      <div class="row" style="margin-top:12px"><button class="btn quiet sm" data-act="viewplan">See the plan</button><button class="btn quiet sm" data-act="makeplan">Rebuild</button></div>`;
  } else {
    planHtml = `<p class="muted" style="margin:0 0 10px">Plan finished — no changes left.</p>
      <div class="row"><button class="btn quiet sm" data-act="viewplan">See the plan</button><button class="btn quiet sm" data-act="makeplan">Rebuild</button></div>`;
  }

  const outCount = Object.keys(m.out || {}).length;

  return `<div class="stack">
    ${clock}
    ${warn}
    <div class="split">
      <div class="stack">
        ${pitch}
        <div class="card"><div class="spread" style="margin-bottom:10px">
          <h2>On the pitch</h2><span class="muted">${field.length} of ${cap}</span></div>
          <div class="plist">${fieldRows}</div></div>
      </div>
      <div class="stack">
        <div class="card"><div class="spread" style="margin-bottom:10px">
          <h2>Bench</h2><button class="btn quiet sm" data-act="planall">Planned minutes</button></div>
          <div class="plist">${benchRows}</div>
          <div style="margin-top:10px"><button class="btn quiet sm" data-act="availability">Who is unavailable${outCount ? ` (${outCount})` : ''}</button></div></div>
        <div class="card"><h2 style="margin-bottom:10px">Game plan</h2>${planHtml}</div>
        <div class="card"><div class="spread" style="margin-bottom:10px"><h2>Subs</h2>
          <div class="row"><button class="btn quiet sm" data-act="addsub">Add a sub</button>
          <button class="btn quiet sm" data-act="fixminutes">Fix minutes</button></div></div>${logHtml}</div>
        <div class="card"><div class="spread">
          <div><h2>${esc(m.opponent || 'Game')}</h2><div class="muted">${esc(m.date || '')} · ${m.periodCount || 2} × ${m.periodMinutes || 40} min · ${cap}v${cap}</div></div>
          <button class="btn quiet sm" data-act="editmatch" data-id="${m.id}">Edit</button></div>
          ${m.veoUrl ? `<p style="margin:10px 0 0"><a href="${esc(m.veoUrl)}" target="_blank" rel="noopener">Open the Veo recording</a></p>` : ''}
        </div>
      </div>
    </div></div>`;
}

function playerRow(m, p, now, isOn) {
  const sl = isOn ? slotOf(m, p.id) : null;
  const pl = playedSec(m, p.id, now), pd = plannedSec(m, p.id);
  const pct = pd > 0 ? clamp(pl / pd * 100, 0, 100) : 0;
  const owed = pd > 0 && pl < pd - 60 ? 1 : 0;
  const over = pd > 0 && pl > pd + 60 ? 1 : 0;
  const bar = pd > 0 ? `<div class="bar"><i style="width:${pct}%" data-bar="${p.id}" data-owed="${owed}" data-over="${over}"></i><u style="left:100%"></u></div>` : '';
  return `<button class="prow" type="button" data-act="tap" data-pid="${p.id}" data-on="${isOn ? 1 : 0}" data-picked="${ui.picked === p.id ? 1 : 0}">
    <span class="pnum">${esc(p.number ?? '')}</span>
    <span><span class="pname">${esc(p.name)}</span>${bar}<span class="psub">${sl ? esc(sl.label) + ' · ' : ''}${pd > 0 ? mins(pd) + ' min planned' : 'no plan set'}</span></span>
    <span class="pmins" data-mins="${p.id}">${mins(pl)}<small> min</small></span>
  </button>`;
}

/* --- games --- */
function viewMatches() {
  const t = team(); if (!t) return needTeam();
  const list = teamMatches(t.id);
  const rows = list.map(m => {
    const el = elapsedSec(m);
    return `<button class="prow" type="button" data-act="openmatch" data-id="${m.id}" style="grid-template-columns:1fr auto">
      <span><span class="pname">${esc(m.opponent || 'Game')}</span><span class="psub">${esc(m.date || '')} · ${mins(el)} min played${running(m) ? ' · clock running' : ''}</span></span>
      <span class="pmins">${Object.keys(m.positions || {}).length}<small> on</small></span></button>`;
  }).join('') || `<div class="empty"><strong>No games yet</strong>Add one and it becomes the live game.</div>`;
  return `<div class="stack"><div class="spread"><h2>Games</h2><button class="btn sm" data-act="newmatch">Add a game</button></div><div class="plist">${rows}</div></div>`;
}

/* --- roster --- */
function viewRoster() {
  const t = team(); if (!t) return needTeam();
  const list = players(t);
  const rows = list.map(p => {
    const bits = [];
    if (p.gk) bits.push('keeper');
    if (p.preferred) bits.push('best at ' + p.preferred);
    if ((p.canPlay || []).length) bits.push('also ' + p.canPlay.join('/'));
    if (p.anywhere === false) bits.push('fixed position');
    const np = Object.keys(p.pairs || {}).length, na = Object.keys(p.avoid || {}).length;
    if (np) bits.push(np + ' pairing' + (np > 1 ? 's' : ''));
    if (na) bits.push(na + ' to keep apart');
    if (p.maxStint) bits.push('max ' + p.maxStint + ' min');
    if (p.active === false) bits.unshift('off the roster');
    return `<button class="prow" type="button" data-act="editplayer" data-pid="${p.id}">
      <span class="pnum">${esc(p.number ?? '')}</span>
      <span><span class="pname">${esc(p.name)}</span><span class="psub">${esc(bits.join(' · ') || 'no profile yet')}</span></span>
      <span class="stars" aria-label="rated ${rating(p)} of 5">${'●'.repeat(rating(p))}<span class="dim">${'●'.repeat(5 - rating(p))}</span></span></button>`;
  }).join('') ||
    `<div class="empty"><strong>No players yet</strong>Add the squad once; every game reuses it.</div>`;
  return `<div class="stack">
    <div class="spread"><h2>${esc(t.name)}</h2><span class="muted">${list.length} players</span></div>
    <div class="card"><div class="row" style="align-items:flex-end">
      <div style="width:76px"><label class="field"><span>Number</span><input type="number" inputmode="numeric" id="newNum" placeholder="7"></label></div>
      <div style="flex:1"><label class="field"><span>Name</span><input type="text" id="newName" placeholder="Ella Moreno"></label></div>
      <button class="btn" data-act="addplayer" style="margin-bottom:10px">Add</button>
    </div></div>
    <div class="plist">${rows}</div></div>`;
}

/* --- season --- */
function viewSeason() {
  const t = team(); if (!t) return needTeam();
  const ms = teamMatches(t.id);
  const rows = players(t).map(p => {
    let pl = 0, pd = 0;
    for (const m of ms) { pl += playedSec(m, p.id); pd += plannedSec(m, p.id); }
    return { p, pl, pd, diff: pl - pd };
  }).sort((a, b) => a.diff - b.diff);
  if (!rows.length) return `<div class="empty"><strong>No players yet</strong>Add the squad on the Roster tab.</div>`;
  const html = rows.map(r => {
    const pct = r.pd > 0 ? clamp(r.pl / r.pd * 100, 0, 100) : 0;
    const owed = r.pd > 0 && r.diff < -60 ? 1 : 0, over = r.pd > 0 && r.diff > 60 ? 1 : 0;
    return `<div class="prow" data-on="0">
      <span class="pnum">${esc(r.p.number ?? '')}</span>
      <span><span class="pname">${esc(r.p.name)}</span>
      ${r.pd > 0 ? `<div class="bar"><i style="width:${pct}%" data-owed="${owed}" data-over="${over}"></i><u style="left:100%"></u></div>` : ''}
      <span class="psub">${r.pd > 0 ? `${mins(r.pd)} planned · ${r.diff < 0 ? mins(-r.diff) + ' min owed' : mins(r.diff) + ' min over'}` : 'no plan set'}</span></span>
      <span class="pmins">${mins(r.pl)}<small> min</small></span></div>`;
  }).join('');
  return `<div class="stack"><div class="spread"><h2>Season totals</h2><span class="muted">${ms.length} games</span></div>
    <div class="plist">${html}</div>
    <p class="muted">Sorted by who is furthest behind their planned minutes.</p></div>`;
}

/* --- formation editor --- */
function viewFormation() {
  const t = team(); if (!t) return needTeam();
  const f = (t.formations || {})[ui.editFid];
  if (!f) return `<div class="empty"><strong>Shape not found</strong><div style="margin-top:14px"><button class="btn" data-act="backsetup">Back to setup</button></div></div>`;
  const isDefault = (t.defaults || {})[f.size] === f.id;
  const toks = (f.slots || []).map(s => `<div class="slotok" data-sid="${s.id}" style="left:${s.x}%;top:${s.y}%">
    <span class="lab">${esc(s.label)}</span><span class="rl">${esc(s.role)}</span></div>`).join('');
  return `<div class="stack">
    <div class="spread"><button class="btn quiet sm" data-act="backsetup">Back</button>
      <span class="muted">${(f.slots || []).length} of ${f.size} spots</span></div>
    <label class="field"><span>Name</span><input type="text" id="fName" value="${esc(f.name)}"></label>
    <div class="pitch" id="fpitch">
      <svg class="lines" viewBox="0 0 68 100" preserveAspectRatio="none" aria-hidden="true">
        <g fill="none" stroke="rgba(255,255,255,.45)" stroke-width=".5">
          <rect x="2" y="2" width="64" height="96"/><line x1="2" y1="50" x2="66" y2="50"/><circle cx="34" cy="50" r="9"/>
          <rect x="16" y="2" width="36" height="15"/><rect x="16" y="83" width="36" height="15"/>
          <rect x="26" y="2" width="16" height="6"/><rect x="26" y="92" width="16" height="6"/>
        </g></svg>${toks}
      <div class="pitchhint">Drag a spot to move it · tap to rename</div></div>
    <div class="row"><button class="btn quiet" data-act="addslot">Add a spot</button>
      <button class="btn" data-act="savefname">Save name</button></div>
    <div class="card"><div class="spread"><span>Use for ${f.size}v${f.size} by default</span>
      <button class="chip" type="button" data-act="setdefault" data-id="${f.id}" aria-pressed="${isDefault}">${isDefault ? 'Default' : 'Make default'}</button></div>
      <p class="muted" style="margin:10px 0 0">Changing this shape only affects games you create from now on. Games already played keep the lineup they were played with.</p></div>
    <button class="btn danger wide" data-act="delformation" data-id="${f.id}">Delete this shape</button>
  </div>`;
}

function sheetSlot(sid) {
  const t = team(), f = (t.formations || {})[ui.editFid];
  const s = (f.slots || []).find(x => x.id === sid); if (!s) return;
  openSheet(`<h3>${esc(s.label)}</h3>
    <label class="field"><span>Label on the pitch</span><input type="text" id="slLabel" value="${esc(s.label)}" placeholder="LB"></label>
    <p class="lbl">Kind of spot</p>
    <div class="chips" style="margin-bottom:14px">
      ${ROLES.map(r => `<button class="chip" type="button" data-act="pickone" data-grp="role" data-v="${r}" aria-pressed="${s.role === r}">${r}</button>`).join('')}
    </div>
    <button class="btn wide" data-act="saveslot" data-sid="${sid}">Save spot</button>
    <div style="margin-top:8px"><button class="btn danger wide" data-act="delslot" data-sid="${sid}">Remove this spot</button></div>`);
}

function sheetFormations() {
  const t = team();
  const list = Object.values(t.formations || {});
  openSheet(`<h3>Shapes for ${esc(t.name)}</h3>
    <p class="muted" style="margin-top:0">Each new game copies the default shape for its side size. Editing a shape here never changes a game that already exists.</p>
    ${list.map(f => `<button class="opt spread" type="button" data-act="editformation" data-id="${f.id}">
      <span>${esc(f.name)} <span class="muted">· ${f.size}v${f.size}</span></span>
      <span class="muted">${(t.defaults || {})[f.size] === f.id ? 'default' : 'edit'}</span></button>`).join('')}
    <p class="lbl" style="margin-top:14px">Start from a preset</p>
    ${[11, 9, 7, 5].map(size => `<div class="chips" style="margin-bottom:8px"><span class="muted" style="align-self:center;min-width:44px">${size}v${size}</span>
      ${Object.keys(presetsFor(size)).map(k => `<button class="chip" type="button" data-act="newformation" data-size="${size}" data-k="${k}">${k}</button>`).join('')}</div>`).join('')}`);
}
/* --- setup --- */
function viewSetup() {
  const code = localStorage.getItem(LS_WS) || '';
  const cfgOk = !!(window.SOCCER_FIREBASE_CONFIG && window.SOCCER_FIREBASE_CONFIG.apiKey);
  return `<div class="stack">
    <div class="card"><h2 style="margin-bottom:8px">Shared workspace</h2>
      <p class="muted" style="margin-top:0">Both phones and the tablet need the same code to see the same games. Firebase config is ${cfgOk ? 'in place' : 'not filled in yet — see README.md'}.</p>
      <label class="field"><span>Workspace code</span><input type="text" id="wsCode" value="${esc(code)}" placeholder="e.g. thunder-2026-9f3a"></label>
      <div class="row"><button class="btn" data-act="savews">Save and reload</button>
      <button class="btn quiet" data-act="gencode">Make one up</button></div></div>

    <div class="card"><h2 style="margin-bottom:8px">Teams</h2>
      <div class="plist">${teams().map(t => `<button class="prow" type="button" data-act="editteam" data-id="${t.id}" style="grid-template-columns:1fr auto">
        <span class="pname">${esc(t.name)}</span><span class="muted">Rename</span></button>`).join('') || '<p class="muted" style="margin:0">No teams yet.</p>'}</div>
      <div style="margin-top:10px"><button class="btn quiet wide" data-act="newteam">Add a team</button></div></div>

    <div class="card"><h2 style="margin-bottom:8px">Shapes</h2>
      <p class="muted" style="margin-top:0">Default lineups per side size. New games copy the default; existing games keep what they were played with.</p>
      <button class="btn quiet wide" data-act="formations">Manage shapes</button></div>

    <div class="card"><h2 style="margin-bottom:8px">Backup</h2>
      <div class="row"><button class="btn quiet" data-act="export">Download a copy</button>
      <button class="btn quiet" data-act="import">Load from a file</button></div>
      <p class="muted" style="margin-bottom:0">A JSON file with every team, game and sub.</p></div>
  </div>`;
}

/* ---------------- ticking ---------------- */
setInterval(() => {
  if (ui.view !== 'match' || ui.dragging) return;
  const m = match(); if (!m || !running(m)) return;
  const t = team(); if (!t) return;
  const now = Date.now();
  const c = $('#clock'); if (c) c.textContent = mmss(elapsedSec(m, now));
  const h = $('#halfclock'); if (h) h.textContent = mmss(halfSec(m, now));
  for (const p of players(t)) {
    const pl = playedSec(m, p.id, now), pd = plannedSec(m, p.id);
    const a = document.querySelector(`[data-mins="${p.id}"]`);
    if (a) a.innerHTML = `${mins(pl)}<small> min</small>`;
    const b = document.querySelector(`[data-tokmins="${p.id}"]`);
    if (b) b.textContent = mins(pl) + '′';
    const bar = document.querySelector(`[data-bar="${p.id}"]`);
    if (bar && pd > 0) {
      bar.style.width = clamp(pl / pd * 100, 0, 100) + '%';
      bar.dataset.owed = pl < pd - 60 ? 1 : 0;
      bar.dataset.over = pl > pd + 60 ? 1 : 0;
    }
  }
}, 1000);

/* ---------------- drag ---------------- */
function draggable(pitch, el, onDrop, onTap) {
  el.addEventListener('pointerdown', e => {
    let moved = false;
    const rect = pitch.getBoundingClientRect();
    const at = ev => ({
      x: clamp((ev.clientX - rect.left) / rect.width * 100, 4, 96),
      y: clamp((ev.clientY - rect.top) / rect.height * 100, 4, 96)
    });
    el.setPointerCapture(e.pointerId);
    el.classList.add('dragging');
    ui.dragging = true;
    const move = ev => {
      if (Math.abs(ev.clientX - e.clientX) + Math.abs(ev.clientY - e.clientY) > 6) moved = true;
      if (!moved) return;
      const p = at(ev);
      el.style.left = p.x + '%'; el.style.top = p.y + '%';
    };
    const up = ev => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.classList.remove('dragging');
      ui.dragging = false;
      if (moved) onDrop(at(ev)); else onTap();
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  });
}

function wireDrag() {
  const pitch = $('#pitch'); if (!pitch) return;
  const m = match(); if (!m) return;
  for (const tok of pitch.querySelectorAll('.token')) {
    const pid = tok.dataset.pid;
    draggable(pitch, tok,
      p => commit(`matches/${m.id}/positions/${pid}`, { ...((m.positions || {})[pid] || {}), x: p.x, y: p.y }),
      () => tapPlayer(pid));
  }

  pitch.addEventListener('pointerdown', e => {
    if (e.target.closest('.token') || e.target.closest('.ghost')) return;
    if (!ui.picked || onField(m, ui.picked)) return;
    if (fieldIds(m).length >= (m.onFieldCount || 11)) { toast('Pitch is full — tap a player to swap'); return; }
    const rect = pitch.getBoundingClientRect();
    const x = clamp((e.clientX - rect.left) / rect.width * 100, 4, 96);
    const y = clamp((e.clientY - rect.top) / rect.height * 100, 4, 96);
    const pid = ui.picked; ui.picked = null;
    putOnField(m, pid, x, y, null);
    const p = (team().players || {})[pid];
    if (p) toast(p.name + ' on at ' + mins(elapsedSec(m)) + '′');
  });
}

function wireFormationDrag() {
  const pitch = $('#fpitch'); if (!pitch) return;
  const t = team(), f = t && (t.formations || {})[ui.editFid];
  if (!f) return;
  for (const el of pitch.querySelectorAll('.slotok')) {
    const sid = el.dataset.sid;
    draggable(pitch, el, p => {
      const slots = (f.slots || []).map(s => s.id === sid ? { ...s, x: p.x, y: p.y } : s);
      commit(`teams/${t.id}/formations/${f.id}/slots`, slots);
    }, () => sheetSlot(sid));
  }
}

function tapPlayer(pid) {
  const m = match(); if (!m) return;
  const t = team(); const p = (t.players || {})[pid]; if (!p) return;

  if (!ui.picked) { ui.picked = pid; render(); return; }
  if (ui.picked === pid) { ui.picked = null; render(); return; }

  const a = ui.picked, b = pid;
  const aOn = onField(m, a), bOn = onField(m, b);
  ui.picked = null;

  if (aOn && bOn) { // swap positions on the pitch
    const pa = m.positions[a], pb = m.positions[b];
    setDeep(state, `matches/${m.id}/positions/${a}`, pb); remoteSet(`matches/${m.id}/positions/${a}`, pb);
    setDeep(state, `matches/${m.id}/positions/${b}`, pa); remoteSet(`matches/${m.id}/positions/${b}`, pa);
    saveLocal(); render(); return;
  }
  if (!aOn && !bOn) { ui.picked = b; render(); return; }
  const outPid = aOn ? a : b, inPid = aOn ? b : a;
  swap(m, outPid, inPid);
  const pin = (t.players || {})[inPid], pout = (t.players || {})[outPid];
  toast(`${pin.name} on for ${pout.name} at ${mins(elapsedSec(m))}′`);
}

/* ---------------- sheets ---------------- */
function sheetTeams() {
  openSheet(`<h3>Switch team</h3>
    ${teams().map(t => `<button class="opt" data-act="pickteam" data-id="${t.id}" aria-current="${t.id === ui.teamId}">${esc(t.name)}</button>`).join('')}
    <button class="btn wide" data-act="newteam">Add a team</button>`);
}

function sheetMatch(m) {
  const t = team();
  const isNew = !m;
  m = m || { periodCount: 2, periodMinutes: 40, onFieldCount: 11, date: new Date().toISOString().slice(0, 10) };
  openSheet(`<h3>${isNew ? 'New game' : 'Game details'}</h3>
    <label class="field"><span>Opponent</span><input type="text" id="mOpp" value="${esc(m.opponent || '')}" placeholder="Riverside United"></label>
    <label class="field"><span>Date</span><input type="date" id="mDate" value="${esc(m.date || '')}"></label>
    <div class="grid2">
      <label class="field"><span>Halves or quarters</span><select id="mCount">
        <option value="2"${(m.periodCount || 2) == 2 ? ' selected' : ''}>2 halves</option>
        <option value="4"${m.periodCount == 4 ? ' selected' : ''}>4 quarters</option></select></label>
      <label class="field"><span>Minutes each</span><input type="number" inputmode="numeric" id="mLen" value="${m.periodMinutes || 40}"></label>
    </div>
    <label class="field"><span>Players on the pitch</span><select id="mSide">
      ${[5, 7, 9, 11].map(n => `<option value="${n}"${(m.onFieldCount || 11) == n ? ' selected' : ''}>${n} v ${n}</option>`).join('')}</select></label>
    <label class="field"><span>Shape</span><select id="mShape">
      ${isNew ? '<option value="auto" selected>Team default for this side size</option>'
        : `<option value="keep" selected>Keep ${esc(m.formation ? m.formation.name : 'no shape')}</option>`}
      <option value="none">No shape — place them anywhere</option>
      ${Object.values(t.formations || {}).map(f => `<option value="team:${f.id}">${esc(f.name)} (${f.size}v${f.size}, saved)</option>`).join('')}
      ${[11, 9, 7, 5].map(sz => Object.keys(presetsFor(sz)).map(k => `<option value="preset:${sz}:${k}">${k} (${sz}v${sz})</option>`).join('')).join('')}
    </select></label>
    <p class="muted" style="margin:-4px 0 12px">Copied into this game when you save. Editing the team shape later will not touch it.</p>
    <label class="field"><span>Veo link (optional)</span><input type="url" id="mVeo" value="${esc(m.veoUrl || '')}" placeholder="https://app.veo.co/matches/..."></label>
    <button class="btn wide" data-act="savematch" data-id="${m.id || ''}">${isNew ? 'Create game' : 'Save changes'}</button>
    ${isNew ? '' : `<div style="margin-top:8px"><button class="btn danger wide" data-act="delmatch" data-id="${m.id}">Delete this game</button></div>`}`);
}

function sheetPlanned() {
  const t = team(), m = match(); if (!t || !m) return;
  const roster = squad(t, m);
  const gk = roster.find(p => p.gk);
  const outfield = roster.filter(p => !p.gk).length;
  openSheet(`<h3>Planned minutes</h3>
    <p class="muted" style="margin-top:0">${matchMinutes(m) * ((m.onFieldCount || 11) - (gk ? 1 : 0))} outfield minutes to share between ${outfield} players${gk ? `, plus ${matchMinutes(m)} in goal` : ''}.</p>
    <button class="btn quiet wide" data-act="evensplit" style="margin-bottom:12px">Split evenly (${evenSplit(m, roster)} min each outfield)</button>
    ${roster.map(p => `<div class="row" style="margin-bottom:8px">
      <span class="pnum" style="width:34px">${esc(p.number ?? '')}</span>
      <span style="flex:1" class="pname">${esc(p.name)}</span>
      <input type="number" inputmode="numeric" style="width:84px" data-plan="${p.id}" value="${m.planned && m.planned[p.id] != null ? m.planned[p.id] : ''}" placeholder="0">
    </div>`).join('')}
    <button class="btn wide" data-act="saveplan" style="margin-top:6px">Save planned minutes</button>`);
}

function sheetPlayer(p) {
  p = migrate(p);
  const t = team();
  const others = players(t).filter(o => o.id !== p.id);
  const pairs = p.pairs || {}, avoid = p.avoid || {};
  openSheet(`<h3>${esc(p.name)}</h3>
    <div class="grid2">
      <label class="field"><span>Number</span><input type="number" inputmode="numeric" id="epNum" value="${esc(p.number ?? '')}"></label>
      <label class="field"><span>Name</span><input type="text" id="epName" value="${esc(p.name)}"></label>
    </div>

    <p class="lbl">Best position</p>
    <div class="chips" style="margin-bottom:14px">
      ${['', ...ROLES].map(x => `<button class="chip" type="button" data-act="pickone" data-grp="pref" data-v="${x}" aria-pressed="${(p.preferred || '') === x}">${x || 'No preference'}</button>`).join('')}
    </div>

    <p class="lbl">Also fine at</p>
    <div class="chips" style="margin-bottom:10px">
      ${ROLES.map(x => `<button class="chip" type="button" data-act="togglechip" data-grp="can" data-v="${x}" aria-pressed="${(p.canPlay || []).includes(x)}">${x}</button>`).join('')}
    </div>
    <div class="chips" style="margin-bottom:14px">
      <button class="chip" type="button" data-act="toggleanywhere" aria-pressed="${p.anywhere !== false}">Can go anywhere</button>
      <span class="muted" style="align-self:center">on by default — the planner will not fight you</span>
    </div>

    <p class="lbl">How strong she is right now</p>
    <div class="chips" style="margin-bottom:14px">
      ${[1, 2, 3, 4, 5].map(n => `<button class="chip" type="button" data-act="pickone" data-grp="rating" data-v="${n}" aria-pressed="${rating(p) === n}">${n}</button>`).join('')}
      <span class="muted" style="align-self:center">5 is a starter you build around</span>
    </div>

    <div class="grid2">
      <label class="field"><span>Longest stint (min)</span><input type="number" inputmode="numeric" id="epStint" value="${esc(p.maxStint ?? '')}" placeholder="no limit"></label>
      <label class="field"><span>Goalkeeper</span><select id="epGk"><option value="0"${p.gk ? '' : ' selected'}>No</option><option value="1"${p.gk ? ' selected' : ''}>Yes</option></select></label>
    </div>

    <p class="lbl">Plays better alongside</p>
    <div class="chips" style="margin-bottom:14px">
      ${others.map(o => `<button class="chip" type="button" data-act="togglechip" data-grp="pair" data-v="${o.id}" aria-pressed="${!!pairs[o.id]}">${esc(o.name)}</button>`).join('') || '<span class="muted">Add more players first.</span>'}
    </div>

    <p class="lbl">Keep apart from</p>
    <div class="chips" style="margin-bottom:14px">
      ${others.map(o => `<button class="chip warn-chip" type="button" data-act="togglechip" data-grp="avoid" data-v="${o.id}" aria-pressed="${!!avoid[o.id]}">${esc(o.name)}</button>`).join('') || '<span class="muted">Add more players first.</span>'}
    </div>

    <label class="field"><span>Notes</span><textarea id="epNote" rows="2" placeholder="Strong left foot, fades after 25 minutes">${esc(p.note || '')}</textarea></label>

    <div class="chips" style="margin-bottom:14px">
      <button class="chip" type="button" data-act="toggleavail" data-pid="${p.id}" aria-pressed="${p.active === false}">Off the roster for the season</button>
    </div>
    <button class="btn wide" data-act="saveplayer" data-pid="${p.id}">Save changes</button>
    <div style="margin-top:8px"><button class="btn danger wide" data-act="delplayer" data-pid="${p.id}">Remove from roster</button></div>`);
}

function sheetAvailability() {
  const t = team(), m = match();
  openSheet(`<h3>Available for ${esc(m.opponent || 'this game')}</h3>
    <p class="muted" style="margin-top:0">Anyone switched off here is left out of the bench, the plan and the even split — but keeps her season totals.</p>
    ${players(t).filter(p => p.active !== false).map(p => `<button class="opt spread" type="button" data-act="toggleout" data-pid="${p.id}">
      <span>${esc(p.number ?? '')} ${esc(p.name)}</span>
      <span class="${isOut(m, p.id) ? 'off' : 'on'}">${isOut(m, p.id) ? 'out' : 'available'}</span></button>`).join('')}
    <button class="btn wide" data-act="closesheet">Done</button>`);
}

function sheetFixClock() {
  const m = match();
  openSheet(`<h3>Adjust the clock</h3>
    <p class="muted" style="margin-top:0">Reads ${mmss(elapsedSec(m))} now. This shifts the current ${esc(halfName(m, m.currentHalf || 1)).toLowerCase()} and the total together.</p>
    <div class="chips" style="margin-bottom:14px">
      ${[-60, -15, -5, 5, 15, 60].map(d => `<button class="chip" type="button" data-act="nudgeclock" data-d="${d}">${d > 0 ? '+' : '−'}${Math.abs(d)}s</button>`).join('')}
    </div>
    <button class="btn wide" data-act="closesheet">Done</button>`);
}

function sheetFixSub(i) {
  const r = lastLog[i]; if (!r) return;
  const t = team();
  const nm = id => { const p = (t.players || {})[id]; return p ? esc(p.name) : 'Unknown'; };
  openSheet(`<h3>${r.on ? nm(r.on) + ' on' : ''}${r.on && r.off ? ' for ' : ''}${r.off ? nm(r.off) + ' off' : ''}</h3>
    <p class="muted" style="margin-top:0">Logged at ${mmss(r.t)}.</p>
    <div class="chips" style="margin-bottom:14px">
      ${[-60, -30, -15, -5, 5, 15, 30, 60].map(d => `<button class="chip" type="button" data-act="nudgesub" data-i="${i}" data-d="${d}">${d > 0 ? '+' : '−'}${Math.abs(d)}s</button>`).join('')}
    </div>
    <label class="field"><span>Or set the exact time</span><input type="text" id="subT" value="${mmss(r.t)}" placeholder="23:10" inputmode="numeric"></label>
    <button class="btn wide" data-act="setsubtime" data-i="${i}">Save time</button>
    <div style="margin-top:8px"><button class="btn quiet wide" data-act="closesheet">Cancel</button></div>`);
}

function sheetAddSub() {
  const t = team(), m = match();
  const roster = squad(t, m);
  const on = roster.filter(p => onField(m, p.id));
  const off = roster.filter(p => !onField(m, p.id));
  if (!on.length || !off.length) { toast('Need someone on the pitch and someone on the bench'); return; }
  openSheet(`<h3>Add a sub you missed</h3>
    <label class="field"><span>Coming off</span><select id="asOut">${on.map(p => `<option value="${p.id}">${esc(p.number ?? '')} ${esc(p.name)}</option>`).join('')}</select></label>
    <label class="field"><span>Going on</span><select id="asIn">${off.map(p => `<option value="${p.id}">${esc(p.number ?? '')} ${esc(p.name)}</option>`).join('')}</select></label>
    <label class="field"><span>When it actually happened</span><input type="text" id="asT" value="${mmss(elapsedSec(m))}" placeholder="23:10" inputmode="numeric"></label>
    <button class="btn wide" data-act="doaddsub">Record it</button>`);
}

function sheetFixMinutes(pid) {
  const t = team(), m = match();
  if (!pid) {
    openSheet(`<h3>Whose minutes need fixing?</h3>
      ${squad(t, m).map(p => `<button class="opt spread" type="button" data-act="fixminutes" data-pid="${p.id}">
        <span>${esc(p.number ?? '')} ${esc(p.name)}</span><span class="muted">${mins(playedSec(m, p.id))} min</span></button>`).join('')}`);
    return;
  }
  const p = t.players[pid];
  const list = stintsOf(m, pid).sort((a, b) => a[1].on - b[1].on);
  const e = elapsedSec(m);
  openSheet(`<h3>${esc(p.name)} — ${mins(playedSec(m, pid))} min</h3>
    <p class="muted" style="margin-top:0">Each row is one spell on the pitch. Blank means she is still on.</p>
    ${list.map(([sid, s]) => `<div class="row" style="margin-bottom:8px">
      <input type="text" style="flex:1" data-son="${sid}" value="${mmss(s.on)}" inputmode="numeric">
      <span class="muted">to</span>
      <input type="text" style="flex:1" data-soff="${sid}" value="${s.off == null ? '' : mmss(s.off)}" placeholder="still on" inputmode="numeric">
      <button class="btn danger sm" data-act="delstint" data-sid="${sid}">Delete</button>
    </div>`).join('') || '<p class="muted">She has not been on yet.</p>'}
    <button class="btn wide" data-act="savestints" data-pid="${pid}" style="margin-top:6px">Save spells</button>
    <div style="margin-top:8px"><button class="btn quiet wide" data-act="addstint" data-pid="${pid}">Add a spell she was on for</button></div>
    <p class="muted" style="margin:8px 0 0">Times are minutes into the game, like 23:10. Now is ${mmss(e)}.</p>`);
}

function sheetPlan() {
  const t = team(), m = match();
  if (!m.plan) return;
  const roster = squad(t, m);
  const nm = id => { const p = (t.players || {})[id]; return p ? (p.number ? p.number + ' ' : '') + p.name.split(' ')[0] : '?'; };
  const spotFor = (b, id) => {
    const sid = Object.keys(b.assign || {}).find(k => b.assign[k] === id);
    const sl = sid && slotById(m, sid);
    return sl ? ` (${sl.label})` : '';
  };
  openSheet(`<h3>Game plan${m.formation ? ' · ' + esc(m.formation.name) : ''}</h3>
    <p class="muted" style="margin-top:0">${m.plan.blocks.length} blocks of about ${Math.round(m.plan.blockMinutes)} minutes.</p>
    ${m.plan.blocks.map((b, i) => {
    const prev = i ? m.plan.blocks[i - 1] : null;
    const onIds = prev ? b.ids.filter(id => !prev.ids.includes(id)) : b.ids;
    const offIds = prev ? prev.ids.filter(id => !b.ids.includes(id)) : [];
    return `<div class="planblock"><div class="spread"><b>${mmss(b.start)}</b>
        <button class="btn quiet sm" data-act="applyblock" data-start="${b.start}">Use this XI</button></div>
        <div style="margin-top:4px">${prev ? `${onIds.length ? `<span class="on">on: ${onIds.map(id => nm(id) + spotFor(b, id)).join(', ')}</span> ` : ''}${offIds.length ? `<span class="off">off: ${offIds.map(nm).join(', ')}</span>` : ''}${!onIds.length && !offIds.length ? '<span class="muted">unchanged</span>' : ''}` : b.ids.map(id => nm(id) + spotFor(b, id)).join(', ')}</div></div>`;
  }).join('')}
    <h3 style="margin-top:16px">Projected minutes</h3>
    ${roster.map(p => {
    const pr = m.plan.projected[p.id] || 0, pd = (m.planned && m.planned[p.id]) || 0;
    const d = pr - pd;
    return `<div class="spread" style="padding:4px 0"><span>${esc(p.name)}</span>
      <span><b>${pr}</b> <span class="muted">of ${pd} planned${pd ? d < 0 ? ` · ${-d} short` : d > 0 ? ` · ${d} over` : '' : ''}</span></span></div>`;
  }).join('')}
    <button class="btn wide" data-act="closesheet" style="margin-top:12px">Done</button>`);
}

function sheetTeam(t) {
  openSheet(`<h3>${t ? 'Team name' : 'New team'}</h3>
    <label class="field"><span>Name</span><input type="text" id="tName" value="${esc(t ? t.name : '')}" placeholder="Lakeside Thunder G14"></label>
    <button class="btn wide" data-act="saveteam" data-id="${t ? t.id : ''}">${t ? 'Save changes' : 'Create team'}</button>
    ${t ? `<div style="margin-top:8px"><button class="btn danger wide" data-act="delteam" data-id="${t.id}">Delete team and its games</button></div>` : ''}`);
}

/* ---------------- events ---------------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const a = el.dataset.act, d = el.dataset;
  const t = team(), m = match();

  if (a === 'tap') { tapPlayer(d.pid); return; }
  if (a === 'start') { startClock(m); return; }
  if (a === 'pause') { pauseClock(m); return; }
  if (a === 'endhalf') { endHalf(m); return; }

  if (a === 'newteam') { closeSheet(); sheetTeam(null); return; }
  if (a === 'editteam') { sheetTeam(state.teams[d.id]); return; }
  if (a === 'pickteam') { ui.teamId = d.id; ui.matchId = null; closeSheet(); render(); return; }
  if (a === 'saveteam') {
    const name = $('#tName').value.trim(); if (!name) { toast('Give the team a name'); return; }
    if (d.id) { commit(`teams/${d.id}/name`, name); }
    else { const id = uid(); commit(`teams/${id}`, { id, name, players: {} }); ui.teamId = id; }
    closeSheet(); render(); return;
  }
  if (a === 'delteam') {
    if (!confirm('Delete this team and every game with it?')) return;
    for (const mm of teamMatches(d.id)) drop(`matches/${mm.id}`);
    drop(`teams/${d.id}`); ui.teamId = null; ui.matchId = null; closeSheet(); render(); return;
  }

  if (a === 'addplayer') {
    const name = $('#newName').value.trim(); const num = $('#newNum').value.trim();
    if (!name) { toast('Add a name first'); return; }
    const id = uid();
    commit(`teams/${t.id}/players/${id}`, { id, name, number: num, active: true, anywhere: true, preferred: '', canPlay: [], rating: 3 });
    $('#newName').value = ''; $('#newNum').value = '';
    return;
  }
  if (a === 'editplayer') { sheetPlayer(t.players[d.pid]); return; }
  if (a === 'togglechip') {
    const on = el.getAttribute('aria-pressed') !== 'true';
    el.setAttribute('aria-pressed', String(on));
    if (on && (d.grp === 'pair' || d.grp === 'avoid')) {
      const other = d.grp === 'pair' ? 'avoid' : 'pair';
      const twin = document.querySelector(`[data-grp="${other}"][data-v="${d.v}"]`);
      if (twin) twin.setAttribute('aria-pressed', 'false');
    }
    return;
  }
  if (a === 'pickone') {
    for (const b of document.querySelectorAll(`[data-act="pickone"][data-grp="${d.grp}"]`)) b.setAttribute('aria-pressed', String(b === el));
    return;
  }
  if (a === 'toggleanywhere') { el.setAttribute('aria-pressed', String(el.getAttribute('aria-pressed') !== 'true')); return; }
  if (a === 'saveplayer') {
    const p = t.players[d.pid];
    const chip = grp => [...document.querySelectorAll(`[data-act="togglechip"][data-grp="${grp}"][aria-pressed="true"]`)].map(x => x.dataset.v);
    const pairs = {}, avoid = {};
    chip('pair').forEach(id => pairs[id] = true);
    chip('avoid').forEach(id => avoid[id] = true);
    const rEl = document.querySelector('[data-act="pickone"][data-grp="rating"][aria-pressed="true"]');
    const pEl = document.querySelector('[data-act="pickone"][data-grp="pref"][aria-pressed="true"]');
    const anyEl = document.querySelector('[data-act="toggleanywhere"]');
    const stint = $('#epStint').value.trim();
    quiet(`teams/${t.id}/players/${d.pid}`, {
      ...p,
      positions: null,
      name: $('#epName').value.trim() || p.name,
      number: $('#epNum').value.trim(),
      preferred: pEl ? pEl.dataset.v : (p.preferred || ''),
      canPlay: chip('can'),
      anywhere: anyEl ? anyEl.getAttribute('aria-pressed') === 'true' : true,
      rating: rEl ? Number(rEl.dataset.v) : rating(p),
      maxStint: stint ? Number(stint) : null,
      gk: $('#epGk').value === '1',
      note: $('#epNote').value.trim(),
      pairs, avoid
    });
    for (const o of players(t)) {
      if (o.id === d.pid) continue;
      const op = { ...(o.pairs || {}) }, oa = { ...(o.avoid || {}) };
      if (pairs[o.id]) op[d.pid] = true; else delete op[d.pid];
      if (avoid[o.id]) oa[d.pid] = true; else delete oa[d.pid];
      quiet(`teams/${t.id}/players/${o.id}/pairs`, op);
      quiet(`teams/${t.id}/players/${o.id}/avoid`, oa);
    }
    saveLocal(); closeSheet(); render(); return;
  }
  if (a === 'toggleavail') {
    const p = t.players[d.pid];
    commit(`teams/${t.id}/players/${d.pid}/active`, p.active === false);
    sheetPlayer(state.teams[t.id].players[d.pid]); return;
  }
  if (a === 'availability') { sheetAvailability(); return; }
  if (a === 'toggleout') {
    if (isOut(m, d.pid)) { drop(`matches/${m.id}/out/${d.pid}`); }
    else { if (onField(m, d.pid)) takeOffField(m, d.pid); commit(`matches/${m.id}/out/${d.pid}`, true); }
    sheetAvailability(); return;
  }

  if (a === 'fixclock') { sheetFixClock(); return; }
  if (a === 'nudgeclock') { adjustClock(m, Number(d.d)); sheetFixClock(); return; }
  if (a === 'fixsub') { sheetFixSub(Number(d.i)); return; }
  if (a === 'nudgesub') {
    const r = lastLog[Number(d.i)]; if (!r) return;
    moveSub(m, r, r.t + Number(d.d));
    const i = lastLog.findIndex(x => x.onSid === r.onSid && x.offSid === r.offSid);
    if (i > -1) sheetFixSub(i); else closeSheet();
    return;
  }
  if (a === 'setsubtime') {
    const r = lastLog[Number(d.i)]; if (!r) return;
    moveSub(m, r, parseTime($('#subT').value, r.t)); closeSheet(); return;
  }
  if (a === 'addsub') { sheetAddSub(); return; }
  if (a === 'doaddsub') {
    const o = $('#asOut').value, i2 = $('#asIn').value;
    subAt(m, o, i2, parseTime($('#asT').value, elapsedSec(m)));
    closeSheet(); toast('Sub recorded'); return;
  }
  if (a === 'fixminutes') { sheetFixMinutes(d.pid || null); return; }
  if (a === 'addstint') {
    const e = elapsedSec(m), sid = uid();
    quiet(`matches/${m.id}/stints/${sid}`, { pid: d.pid, on: e, off: e });
    saveLocal(); render(); sheetFixMinutes(d.pid); return;
  }
  if (a === 'delstint') {
    const s = (m.stints || {})[d.sid]; if (!s) return;
    const pid = s.pid;
    drop(`matches/${m.id}/stints/${d.sid}`);
    if (s.off == null && onField(m, pid)) { delDeep(state, `matches/${m.id}/positions/${pid}`); remoteDel(`matches/${m.id}/positions/${pid}`); saveLocal(); }
    sheetFixMinutes(pid); return;
  }
  if (a === 'savestints') {
    const e = elapsedSec(m);
    for (const inp of document.querySelectorAll('[data-son]')) {
      const sid = inp.dataset.son;
      const offEl = document.querySelector(`[data-soff="${sid}"]`);
      const on = clamp(parseTime(inp.value, 0), 0, e);
      const raw = offEl.value.trim();
      const off = raw === '' ? null : clamp(parseTime(raw, e), on, e);
      quiet(`matches/${m.id}/stints/${sid}`, { pid: d.pid, on, off });
    }
    saveLocal(); closeSheet(); render(); toast('Minutes updated'); return;
  }

  if (a === 'makeplan') {
    const roster = squad(t, m);
    if (!roster.length) { toast('Add players first'); return; }
    if (!m.planned || !Object.keys(m.planned).length) {
      const each = evenSplit(m, roster), pl = {};
      roster.forEach(p => pl[p.id] = p.gk ? matchMinutes(m) : each);
      quiet(`matches/${m.id}/planned`, pl);
    }
    commit(`matches/${m.id}/plan`, buildPlan(m, roster));
    sheetPlan(); return;
  }
  if (a === 'viewplan') { sheetPlan(); return; }
  if (a === 'applyblock') {
    const b = m.plan.blocks.find(x => String(x.start) === String(d.start)); if (!b) return;
    const cur = fieldIds(m);
    const goOff = cur.filter(id => !b.ids.includes(id));
    const goOn = b.ids.filter(id => !cur.includes(id));
    const n = Math.min(goOff.length, goOn.length);
    for (let i = 0; i < n; i++) swap(m, goOff[i], goOn[i]);
    for (let i = n; i < goOff.length; i++) takeOffField(m, goOff[i]);
    for (let i = n; i < goOn.length; i++) putOnField(m, goOn[i], 50, 25 + (i * 9) % 55);
    for (const [sid, pid] of Object.entries(b.assign || {})) {
      const sl = slotById(m, sid);
      if (sl && onField(m, pid)) quiet(`matches/${m.id}/positions/${pid}`, { x: sl.x, y: sl.y, slot: sid });
    }
    saveLocal(); render();
    closeSheet(); toast(n + (n === 1 ? ' sub made' : ' subs made')); return;
  }
  if (a === 'fillslot') {
    const sl = slotById(m, d.sid); if (!sl) return;
    if (!ui.picked) { toast('Pick a player first'); return; }
    const pid = ui.picked; ui.picked = null;
    if (onField(m, pid)) { commit(`matches/${m.id}/positions/${pid}`, { x: sl.x, y: sl.y, slot: sl.id }); return; }
    if (fieldIds(m).length >= (m.onFieldCount || 11)) { toast('Pitch is full — tap a player to swap'); return; }
    putOnField(m, pid, sl.x, sl.y, sl.id);
    const p = (t.players || {})[pid];
    if (p) toast(`${p.name} on at ${sl.label}, ${mins(elapsedSec(m))}′`);
    return;
  }
  if (a === 'formations') { sheetFormations(); return; }
  if (a === 'newformation') {
    const size = Number(d.size), k = d.k, id = uid();
    quiet(`teams/${t.id}/formations/${id}`, { id, name: k, size, slots: clone(presetsFor(size)[k]) });
    if (!((t.defaults || {})[size])) quiet(`teams/${t.id}/defaults/${size}`, id);
    saveLocal(); ui.editFid = id; ui.view = 'formation'; closeSheet(); render(); return;
  }
  if (a === 'editformation') { ui.editFid = d.id; ui.view = 'formation'; closeSheet(); render(); return; }
  if (a === 'backsetup') { ui.view = 'setup'; ui.editFid = null; render(); return; }
  if (a === 'savefname') {
    commit(`teams/${t.id}/formations/${ui.editFid}/name`, $('#fName').value.trim() || 'Shape');
    toast('Saved'); return;
  }
  if (a === 'setdefault') {
    const f = t.formations[d.id];
    commit(`teams/${t.id}/defaults/${f.size}`, f.id); return;
  }
  if (a === 'delformation') {
    if (!confirm('Delete this shape? Games already created keep their own copy.')) return;
    const f = t.formations[d.id];
    if ((t.defaults || {})[f.size] === f.id) drop(`teams/${t.id}/defaults/${f.size}`);
    drop(`teams/${t.id}/formations/${d.id}`);
    ui.view = 'setup'; ui.editFid = null; render(); return;
  }
  if (a === 'addslot') {
    const f = t.formations[ui.editFid];
    commit(`teams/${t.id}/formations/${f.id}/slots`, [...(f.slots || []), { id: 's' + uid(), label: 'New', role: 'Mid', x: 50, y: 50 }]);
    return;
  }
  if (a === 'saveslot') {
    const f = t.formations[ui.editFid];
    const rEl = document.querySelector('[data-act="pickone"][data-grp="role"][aria-pressed="true"]');
    const label = $('#slLabel').value.trim() || 'Spot';
    commit(`teams/${t.id}/formations/${f.id}/slots`,
      (f.slots || []).map(x => x.id === d.sid ? { ...x, label, role: rEl ? rEl.dataset.v : x.role } : x));
    closeSheet(); return;
  }
  if (a === 'delslot') {
    const f = t.formations[ui.editFid];
    commit(`teams/${t.id}/formations/${f.id}/slots`, (f.slots || []).filter(x => x.id !== d.sid));
    closeSheet(); return;
  }
  if (a === 'closesheet') { closeSheet(); return; }
  if (a === 'delplayer') {
    if (!confirm('Remove this player from the roster?')) return;
    drop(`teams/${t.id}/players/${d.pid}`); closeSheet(); return;
  }

  if (a === 'newmatch') { closeSheet(); sheetMatch(null); return; }
  if (a === 'editmatch') { sheetMatch(state.matches[d.id]); return; }
  if (a === 'openmatch') { ui.matchId = d.id; ui.view = 'match'; render(); return; }
  if (a === 'savematch') {
    const side = Number($('#mSide').value);
    const base = {
      opponent: $('#mOpp').value.trim(), date: $('#mDate').value,
      periodCount: Number($('#mCount').value), periodMinutes: Number($('#mLen').value) || 40,
      onFieldCount: side, veoUrl: $('#mVeo').value.trim()
    };
    const pick = $('#mShape').value;
    if (pick !== 'keep') base.formation = resolveShape(t, pick, side);
    if (d.id) { commit(`matches/${d.id}`, { ...state.matches[d.id], ...base }); }
    else {
      const id = uid();
      commit(`matches/${id}`, { id, teamId: t.id, currentHalf: 1, periods: {}, planned: {}, positions: {}, stints: {}, createdAt: Date.now(), ...base });
      ui.matchId = id; ui.view = 'match';
    }
    closeSheet(); render(); return;
  }
  if (a === 'delmatch') {
    if (!confirm('Delete this game and its minutes?')) return;
    drop(`matches/${d.id}`); ui.matchId = null; closeSheet(); render(); return;
  }

  if (a === 'planall') { sheetPlanned(); return; }
  if (a === 'evensplit') {
    const roster = squad(t, m);
    const each = evenSplit(m, roster);
    for (const inp of document.querySelectorAll('[data-plan]')) {
      const p = (t.players || {})[inp.dataset.plan];
      inp.value = p && p.gk ? matchMinutes(m) : each;
    }
    return;
  }
  if (a === 'saveplan') {
    const plan = {};
    for (const inp of document.querySelectorAll('[data-plan]')) { const v = Number(inp.value); if (v > 0) plan[inp.dataset.plan] = v; }
    commit(`matches/${m.id}/planned`, plan); closeSheet(); return;
  }

  if (a === 'savews') {
    const v = $('#wsCode').value.trim();
    if (v) localStorage.setItem(LS_WS, v); else localStorage.removeItem(LS_WS);
    location.reload(); return;
  }
  if (a === 'gencode') { $('#wsCode').value = 'sm-' + uid() + uid(); return; }
  if (a === 'export') {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'minutes-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    link.click(); URL.revokeObjectURL(url); return;
  }
  if (a === 'import') {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/json';
    inp.onchange = () => {
      const f = inp.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          const d2 = JSON.parse(r.result);
          state = { teams: d2.teams || {}, matches: d2.matches || {} };
          saveLocal(); pushAll(); render(); toast('Backup loaded');
        } catch (err) { toast('That file could not be read'); }
      };
      r.readAsText(f);
    };
    inp.click(); return;
  }
});

$('#teamSwitch').addEventListener('click', sheetTeams);
$('#scrim').addEventListener('click', closeSheet);
$('#tabs').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  ui.view = b.dataset.view; ui.picked = null; render();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

/* ---------------- boot ---------------- */
loadLocal();
render();
initSync();
