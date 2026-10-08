/* Public follow page. Reads one published mirror and renders it.
   No writes, no login, no names — shirt numbers only. */

const q = new URLSearchParams(location.search);
const SHARE = (q.get('t') || '').trim();
const ONE_GAME = (q.get('g') || '').trim();

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mmss = sec => { sec = Math.max(0, Math.floor(sec)); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); };
const mins = sec => Math.round(sec / 60);

let doc = null, skew = 0, openGame = ONE_GAME || null, openEvent = null;
let auth = null, authMod = null, viewer = null;
/* Anything that changed since the last render gets a flash, so someone watching
   on a phone at the side of the pitch sees that something happened. */
let prev = {};
const bump = (key, val) => {
  const changed = prev[key] !== undefined && prev[key] !== val;
  prev[key] = val;
  return changed ? ' data-bump="1"' : '';
};
const SEASON_PAGE = !/game\.html/.test(location.pathname);
const nowMs = () => Date.now() + skew;

function segments(g) {
  return Object.keys(g.periods || {}).map(Number).sort((a, b) => a - b).map(i => ({ i, ...g.periods[i] }));
}
function elapsed(g, at = nowMs()) {
  let t = 0;
  for (const s of segments(g)) { if (!s.start || s.start > at) continue; t += (Math.min(s.end || at, at) - s.start); }
  return Math.floor(t / 1000);
}
/* A player's seconds are a snapshot taken when the coach's phone last
   published, and while the clock runs that can be minutes old. Someone on the
   pitch has played every second the match clock has moved since then, so add
   exactly that — no guessing, and a paused clock adds nothing. */
function liveSec(g, p) {
  if (!p.on || !doc || !doc.updated) return p.sec;
  return p.sec + Math.max(0, elapsed(g) - elapsed(g, doc.updated));
}
function halfElapsed(g) {
  const h = g.currentHalf || 1;
  let t = 0;
  for (const s of segments(g)) { if (!s.start || (s.half || 1) !== h) continue; t += ((s.end || nowMs()) - s.start); }
  return Math.floor(t / 1000);
}
const isRunning = g => { const l = segments(g); const last = l[l.length - 1]; return !!(last && last.start && !last.end); };
function halfName(g, n) {
  const c = g.periodCount || 2;
  if (c === 2) return n === 1 ? '1st half' : n === 2 ? '2nd half' : 'Extra time';
  if (c === 4) return ['1st quarter', '2nd quarter', '3rd quarter', '4th quarter'][n - 1] || 'Extra time';
  return 'Period ' + n;
}
function niceDate(d) {
  if (!d) return '';
  const [y, mo, da] = d.split('-').map(Number);
  return da + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][mo - 1];
}
function niceTime(t) {
  if (!t) return '';
  const [h, mi] = t.split(':').map(Number);
  const ap = h >= 12 ? 'pm' : 'am';
  return ((h % 12) || 12) + (mi ? ':' + String(mi).padStart(2, '0') : '') + ap;
}
const games = () => Object.values((doc && doc.games) || {})
  .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

/* ---------- the calendar: games plus what the coach marked for this page ---------- */
/* The same reading of "coming up" the app makes, from the published copy:
   games, and the practices and events a coach chose to put on the share link.
   Anything kept to the team was never written here, so there is nothing to
   filter out. */
const KIND = { game: 'Game', practice: 'Practice', event: 'Event' };
const CALLED = { cancelled: 'Cancelled', postponed: 'Postponed' };
const HOME_AWAY = { home: 'Home', away: 'Away', neutral: 'Neutral ground' };
const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const pad2 = n => String(n).padStart(2, '0');
const okDay = d => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
const hm = t => { const x = /^(\d{1,2}):(\d{2})/.exec(String(t || '')); return x ? pad2(x[1]) + ':' + x[2] : ''; };
const dateOf = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const dayStr = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const today = () => dayStr(new Date(nowMs()));
const dayLabel = d => okDay(d) ? WD[(dateOf(d).getDay() + 6) % 7] + ' ' + niceDate(d) : 'Date to be confirmed';
function relDay(d) {
  if (!okDay(d)) return '';
  const n = Math.round((dateOf(d) - dateOf(today())) / 86400000);
  return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n > 1 && n < 7 ? `In ${n} days` : '';
}
function items() {
  const out = [];
  for (const g of Object.values((doc && doc.games) || {})) out.push({
    kind: 'game', id: g.id, date: okDay(g.date) ? g.date : '', start: hm(g.kickoff), end: '',
    mins: (g.periodCount || 2) * (g.periodMinutes || 40) + 15, title: 'v ' + (g.opponent || 'TBC'),
    venue: g.venue || '', called: CALLED[g.called] ? g.called : '', status: g.status, g
  });
  for (const [id, e] of Object.entries((doc && doc.events) || {})) {
    if (!e) continue;
    const kind = e.kind === 'practice' ? 'practice' : 'event';
    out.push({
      kind, id, date: okDay(e.date) ? e.date : '', start: hm(e.start), end: hm(e.end), mins: 0,
      title: e.title || KIND[kind], venue: e.venue || '', called: CALLED[e.called] ? e.called : '', e
    });
  }
  return out.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || (a.start || '').localeCompare(b.start || ''));
}
function past(it) {
  if (it.kind === 'game' && it.status === 'done') return true;
  if (it.kind === 'game' && it.status === 'live') return false;
  if (!it.date) return false;
  if (it.date !== today()) return it.date < today();
  if (!it.start) return false;
  const st = it.start.split(':').map(Number), m0 = st[0] * 60 + st[1];
  let end = m0 + (it.mins || 60);
  if (it.end) { const e = it.end.split(':').map(Number); end = e[0] * 60 + e[1]; if (end <= m0) end += 1440; }
  const n = new Date(nowMs());
  return n.getHours() * 60 + n.getMinutes() >= end;
}
const pageBase = () => location.origin + location.pathname.replace(/[^/]*$/, '');
/* The season link as a calendar feed, when the site has one (README, "Calendar
   sync"): the same games and entries this page shows, never more. */
const feed = () => {
  const b = String(window.SOCCER_CALENDAR_FEED || '').trim();
  return /^https:\/\/\S+$/.test(b) && SHARE ? b.replace(/\/*$/, '/') + encodeURIComponent(SHARE) + '.ics' : '';
};
/* As a calendar file wants it, built by ics.js from the same published copy
   the calendar feed is built from, so a family that adds an entry here and
   subscribes later sees one description of it. Same uid as the app uses, so it
   is not doubled in calendars that go by uid. */
function icsOf(it) {
  const I = window.MinutesIcs;
  const url = (kind, id) => kind === 'game'
    ? `${pageBase()}game.html?t=${encodeURIComponent(SHARE)}&g=${encodeURIComponent(id)}`
    : `${pageBase()}live.html?t=${encodeURIComponent(SHARE)}#e=${encodeURIComponent(id)}`;
  return (I ? I.docItems(doc, url) : []).find(x => x.uid === it.id) || { uid: it.id, title: it.title, date: it.date };
}
function download(name, list) {
  const I = window.MinutesIcs;
  if (!I || !list.length) return;
  const blob = new Blob([I.calendar(name, list, nowMs())], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = I.fileName(name);
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
/* Directions and the two ways into a calendar, for one item. */
function addButtons(it) {
  const I = window.MinutesIcs;
  if (!I || !it.date) return '';
  return `<div class="row wrap" style="margin-top:10px">
    ${it.venue ? `<a class="btn quiet sm" href="${esc(I.mapLink(it.venue))}" target="_blank" rel="noopener">Directions</a>` : ''}
    <a class="btn quiet sm" href="${esc(I.googleLink(icsOf(it)))}" target="_blank" rel="noopener">Google Calendar</a>
    <button class="btn quiet sm" data-ics="${esc(it.kind)}:${esc(it.id)}">Apple or Outlook</button></div>`;
}
function itemRow(it) {
  const right = it.called ? `<span class="tag off">${CALLED[it.called]}</span>`
    : it.g && it.status !== 'upcoming' ? `<span class="pmins">${it.g.score.us}<small>–${it.g.score.them}</small></span>`
      : `<span class="tag ${it.kind}">${KIND[it.kind]}</span>`;
  const sub = [it.venue, it.g && HOME_AWAY[it.g.home]].filter(Boolean).join(' · ');
  return `<button class="prow calrow" data-${it.g ? 'open' : 'event'}="${esc(it.id)}" data-called="${it.called ? 1 : 0}">
    <span class="caltime">${it.start ? niceTime(it.start) : it.date ? 'All day' : 'TBC'}</span>
    <span style="min-width:0"><span class="pname">${esc(it.title)}</span>${sub ? `<span class="psub">${esc(sub)}</span>` : ''}</span>
    ${right}</button>`;
}
function itemList(list) {
  let out = '', last = null;
  for (const it of list) {
    if (it.date !== last) {
      const r = relDay(it.date);
      out += `<p class="calhead">${esc(dayLabel(it.date))}${r ? ` <span>· ${r}</span>` : ''}</p>`;
      last = it.date;
    }
    out += itemRow(it);
  }
  return out;
}

const EV_LABELS = { corner: 'Corners', foul: 'Fouls', throw: 'Throw-ins', goalkick: 'Goal kicks', keeper: 'Keeper claims' };

function statsBlock(g, name) {
  const them = esc(g.opponent || 'Them');
  const sh = g.shots || {};
  const shotsAny = (sh.usOn || 0) + (sh.usOff || 0) + (sh.themOn || 0) + (sh.themOff || 0);
  const evs = Object.entries(g.events || {});
  const po = g.poss || {};
  const settled = (po.us || 0) + (po.them || 0);
  const total = settled + (po.contested || 0);
  const pct = settled ? Math.round(po.us / settled * 100) : 50;
  const cpct = total ? Math.round((po.contested || 0) / total * 100) : 0;
  if (!shotsAny && !evs.length && !total) return '';

  const grid = rows => `<div class="statgrid" style="grid-template-columns:1fr 48px 48px">
    <span></span><span class="tallyhead">${esc(name)}</span><span class="tallyhead">${them}</span>${rows}</div>`;

  return `<div class="card"><h2 style="margin-bottom:10px">Match stats</h2>
    ${shotsAny ? grid(`
      <span class="tallylbl">Shots on target</span><b${bump('sot', sh.usOn)}>${sh.usOn || 0}</b><b${bump('tot', sh.themOn)}>${sh.themOn || 0}</b>
      <span class="tallylbl">Shots off target</span><b>${sh.usOff || 0}</b><b>${sh.themOff || 0}</b>`) : ''}
    ${evs.length ? grid(evs.map(([k, v]) => `
      <span class="tallylbl">${EV_LABELS[k] || k}</span><b${bump('e' + k, v.us)}>${v.us}</b><b${bump('e' + k + 't', v.them)}>${v.them}</b>`).join('')) : ''}
    ${total ? `<div style="margin-top:12px">
      <div class="possbar"><i style="width:${Math.round((po.us || 0) / total * 100)}%"></i><u style="width:${cpct}%"></u></div>
      <div class="spread" style="margin-top:6px"><span>${pct}% possession</span><span class="muted">${100 - pct}% ${them}</span></div>
      ${cpct ? `<p class="muted" style="margin:4px 0 0">${cpct}% scrappy, counted for neither side.</p>` : ''}
    </div>` : ''}
  </div>`;
}

function fail(msg) {
  $('#title').textContent = 'Nothing here';
  $('#sub').textContent = '';
  $('#app').innerHTML = `<div class="empty"><strong>${esc(msg)}</strong>Check the link, or ask whoever sent it for a fresh one.</div>`;
}

function render() {
  if (!doc) return;
  /* A game's own link publishes that game alone, marked `fixture`. There is no
     season to go back to, and nothing else to open. */
  if (doc.fixture) { openGame = doc.fixture; openEvent = null; }
  const name = (doc.team && doc.team.name) || 'Team';
  const g = openGame ? (doc.games || {})[openGame] : null;
  const ev = !g && openEvent ? items().find(x => x.e && x.id === openEvent) : null;

  const logo = (doc.team && doc.team.logo) || null;
  const crest = $('#crest');
  if (crest) { crest.src = logo || ''; crest.hidden = !logo; }

  if (ev) {
    $('#title').textContent = `${name}: ${ev.title}`;
    $('#sub').innerHTML = [esc(dayLabel(ev.date)), ev.start ? niceTime(ev.start) + (ev.end ? '–' + niceTime(ev.end) : '') : 'All day'].join(' · ')
      + (ev.called ? `<br><span class="pill">${CALLED[ev.called]}</span>` : '');
    $('#app').innerHTML = `<div class="stack">
      <button class="backlink" data-back>Back to the season</button>
      ${ev.called ? `<div class="warn alert"><b>${CALLED[ev.called]}.</b> It is not happening at this time.</div>` : ''}
      <div class="card"><dl class="facts" style="margin:0">
        <dt>When</dt><dd>${esc(dayLabel(ev.date))} · ${ev.start ? esc(niceTime(ev.start)) + (ev.end ? '–' + esc(niceTime(ev.end)) : '') : 'all day'}</dd>
        ${ev.venue ? `<dt>Where</dt><dd>${esc(ev.venue)}</dd>` : ''}
        ${ev.e.notes ? `<dt>Notes</dt><dd>${esc(ev.e.notes).replace(/\n/g, '<br>')}</dd>` : ''}
      </dl>${addButtons(ev)}</div>
    </div>`;
    return;
  }

  if (g) {
    const live = g.status === 'live', done = g.status === 'done';
    const it = items().find(x => x.g && x.id === g.id);
    $('#title').textContent = g.home === 'away' ? `${g.opponent || 'TBC'} v ${name}` : `${name} v ${g.opponent || 'TBC'}`;
    $('#sub').innerHTML = [niceDate(g.date), niceTime(g.kickoff), esc(g.venue)].filter(Boolean).join(' · ')
      + `<br><span class="pill ${live ? 'live' : ''}">${live ? 'Live now' : done ? 'Full time' : CALLED[g.called] || 'Not started'}</span>`;
    /* What a family, or the other team, needs before kick-off. */
    const facts = [
      HOME_AWAY[g.home] ? `<dt>Ground</dt><dd>${HOME_AWAY[g.home]}</dd>` : '',
      g.arrive ? `<dt>Arrive by</dt><dd>${esc(niceTime(g.arrive))}</dd>` : '',
      g.kit ? `<dt>${esc(name)} wear</dt><dd>${esc(g.kit)}</dd>` : '',
      g.notes ? `<dt>Notes</dt><dd>${esc(g.notes).replace(/\n/g, '<br>')}</dd>` : ''
    ].join('');

    const on = (g.players || []).filter(p => p.on);
    const off = (g.players || []).filter(p => !p.on);
    $('#app').innerHTML = `<div class="stack">
      ${(ONE_GAME && !SEASON_PAGE) || doc.fixture ? '' : `<button class="backlink" data-back>Back to the season</button>`}
      ${accessBlock()}

      <div class="card scorecard">
        <div class="scoreside"><span class="scorelbl">${esc(name)}</span><span class="bignum"${bump('su', g.score.us)}>${g.score.us}</span></div>
        <div class="scoresep"></div>
        <div class="scoreside"><span class="scorelbl">${esc(g.opponent || 'Them')}</span><span class="bignum"${bump('st', g.score.them)}>${g.score.them}</span></div>
      </div>

      ${g.status !== 'upcoming' ? `<div class="clockwrap"><div class="clockline">
        <div class="clock" id="clk">${mmss(elapsed(g))}</div>
        <div class="clockmeta"><b>${esc(halfName(g, g.currentHalf || 1))}</b>
        <span id="hclk">${mmss(halfElapsed(g))}</span> of ${g.periodMinutes || 40}:00</div>
      </div></div>` : `<div class="card">
        ${CALLED[g.called] ? `<div class="warn alert" style="margin-bottom:10px"><b>${CALLED[g.called]}.</b>${g.called === 'postponed' ? ' A new date will be set.' : ''}</div>` : ''}
        <p class="meta" style="margin:0">
        ${[niceDate(g.date), niceTime(g.kickoff) && 'Kick-off ' + niceTime(g.kickoff), esc(g.venue)].filter(Boolean).map(x => `<span>${x}</span>`).join('')}
      </p>${facts ? `<dl class="facts" style="margin:10px 0 0">${facts}</dl>` : ''}${it && !CALLED[g.called] ? addButtons(it) : ''}</div>`}

      ${g.goals && g.goals.length ? `<div class="card"><h2 style="margin-bottom:10px">Goals</h2>
        <div class="log">${g.goals.slice().reverse().map(x => `<div style="display:grid;grid-template-columns:52px 1fr;gap:10px;padding:7px 0;border-top:1px solid var(--line)">
          <span class="t">${mmss(x.t)}</span>
          <span>${x.side === 'us' ? `<span class="on">${esc(name)}${x.n ? ' — number ' + esc(x.n) : ''}</span>` : `<span class="off">${esc(g.opponent || 'Them')}</span>`}</span>
        </div>`).join('')}</div></div>` : ''}

      ${on.length ? `<div class="card"><h2 style="margin-bottom:10px">On the pitch</h2>
        <div class="numlist">${on.map((p, i) => `<span class="numchip"${bump('on' + p.n, 1)}>${esc(p.n)}<small data-oni="${i}"${bump('m' + p.n, mins(liveSec(g, p)))}>${mins(liveSec(g, p))}m</small></span>`).join('')}</div></div>` : ''}

      ${off.length ? `<div class="card"><h2 style="margin-bottom:10px">On the bench</h2>
        <div class="numlist">${off.map(p => `<span class="numchip off"${bump('on' + p.n, 0)}>${esc(p.n)}<small>${mins(p.sec)}m</small></span>`).join('')}</div></div>` : ''}

      ${g.log && g.log.length ? `<div class="card"><h2 style="margin-bottom:10px">Changes</h2>
        <div class="log">${g.log.map(r => `<div style="display:grid;grid-template-columns:52px 1fr;gap:10px;padding:7px 0;border-top:1px solid var(--line)">
          <span class="t">${mmss(r.t)}</span>
          <span>${r.move ? `Number ${esc(r.on)} moved${r.spot ? ' to ' + esc(r.spot) : ''}`
        : `${r.on ? `<span class="on">${esc(r.on)} on</span>` : ''}${r.on && r.off ? ' for ' : ''}${r.off ? `<span class="off">${esc(r.off)} off</span>` : ''}`}</span>
        </div>`).join('')}</div></div>` : ''}

      ${statsBlock(g, name)}
    </div>`;
    return;
  }

  // season view
  const r = doc.record || { w: 0, d: 0, l: 0, gf: 0, ga: 0 };
  const list = games();
  const now = list.find(x => x.status === 'live');
  const all = items();
  const ahead = all.filter(x => x.date && !past(x));
  const nextIt = ahead.find(x => !x.called && !(x.g && x.status === 'live'));
  const tbc = all.filter(x => !x.date && !(x.g && x.status === 'done'));
  const played = list.filter(x => x.status !== 'upcoming');
  $('#title').textContent = `Follow ${name}`;
  $('#sub').innerHTML = `${r.w}W ${r.d}D ${r.l}L · ${r.gf} scored, ${r.ga} conceded`
    + (now ? `<br><span class="pill live">Playing now</span>` : '');

  $('#app').innerHTML = `<div class="stack">
    ${accessBlock()}
    ${now ? card(now, 'Happening now') : nextIt ? nextCard(nextIt) : ''}
    <div class="card"><h2 style="margin-bottom:0">Coming up</h2>
      ${ahead.length ? `<div class="plist">${itemList(ahead)}</div>
        ${feed() ? `<p class="lbl" style="margin-top:14px">Follow it in your calendar</p>
        <div class="row wrap">
          <a class="btn sm" href="${esc(feed().replace(/^https:/, 'webcal:'))}">Apple Calendar</a>
          <a class="btn quiet sm" href="https://calendar.google.com/calendar/render?cid=${encodeURIComponent(feed().replace(/^https:/, 'webcal:'))}" target="_blank" rel="noopener">Google Calendar</a>
          <button class="btn quiet sm" data-copy="${esc(feed())}">Copy the address</button></div>
        <p class="muted" style="margin:6px 0 0">Subscribe once and your calendar follows every change on this page. Apple and Outlook check about hourly; Google takes longer.</p>
        <button class="backlink" data-icsall style="margin-top:10px">Or add a one-off copy</button>`
        : `<button class="btn quiet wide" data-icsall style="margin-top:12px">Add all of it to my calendar</button>
        <p class="muted" style="margin:6px 0 0">A copy for your phone\u2019s calendar. If a time changes, this page has it first — add it again and each entry replaces itself, in calendars that allow it.</p>`}`
      : '<p class="muted" style="margin-bottom:0">Nothing on the calendar yet.</p>'}</div>
    ${tbc.length ? `<div class="card"><h2 style="margin-bottom:8px">Date to be confirmed</h2><div class="plist">${tbc.map(itemRow).join('')}</div></div>` : ''}
    <div class="card"><h2 style="margin-bottom:10px">Results</h2>
      <div class="plist">${played.map(x => `<button class="gamerow" data-open="${esc(x.id)}">
        <span><b>${esc(x.opponent || 'TBC')}</b>
          <span class="rowsub">${[niceDate(x.date), niceTime(x.kickoff), esc(x.venue)].filter(Boolean).join(' · ')}</span></span>
        <span class="pmins">${x.score.us}<small>–${x.score.them}</small></span>
      </button>`).join('') || '<p class="muted" style="margin:0">No games played yet.</p>'}</div></div>
  </div>`;

  function nextCard(it) {
    const bits = [it.venue, it.g && it.g.arrive ? 'arrive by ' + niceTime(it.g.arrive) : '', it.g && it.g.kit ? 'kit: ' + it.g.kit : ''].filter(Boolean);
    return `<div class="card calnext">
      <button class="plainbtn" data-${it.g ? 'open' : 'event'}="${esc(it.id)}" style="display:block;width:100%;text-align:left">
        <span class="muted">Up next</span>
        <div class="spread" style="margin-top:4px"><b style="font-size:18px">${esc(it.title)}</b><span class="tag ${it.kind}">${KIND[it.kind]}</span></div>
        <p style="margin:4px 0 0"><b>${esc(relDay(it.date) || dayLabel(it.date))} · ${it.start ? esc(niceTime(it.start)) : 'all day'}</b>${it.g && HOME_AWAY[it.g.home] ? ' · ' + HOME_AWAY[it.g.home] : ''}</p>
        ${bits.length ? `<p class="muted" style="margin:2px 0 0">${esc(bits.join(' · '))}</p>` : ''}
      </button>${addButtons(it)}</div>`;
  }

  function card(x, label) {
    return `<button class="card" data-open="${esc(x.id)}" style="text-align:left;width:100%">
      <span class="muted">${label}</span>
      <div class="spread" style="margin-top:6px">
        <b style="font-size:18px">${esc(x.opponent || 'TBC')}</b>
        <span class="pmins">${x.status === 'upcoming' ? '' : `${x.score.us}<small>–${x.score.them}</small>`}</span>
      </div>
      ${x.status === 'live' ? `<p class="muted" style="margin:4px 0 0">${esc(halfName(x, x.currentHalf || 1))} · <span data-gclk="${esc(x.id)}">${mmss(elapsed(x))}</span> played</p>` : ''}
      <p class="meta" style="margin-top:6px">${[niceDate(x.date), niceTime(x.kickoff) && 'Kick-off ' + niceTime(x.kickoff), esc(x.venue)].filter(Boolean).map(v => `<span>${v}</span>`).join('')}</p>
    </button>`;
  }
}

function go(id, push, kind) {
  openGame = kind === 'e' ? null : id;
  openEvent = kind === 'e' ? id : null;
  if (push && history.pushState) history.pushState({ g: openGame, e: openEvent }, '', id ? `#${kind === 'e' ? 'e' : 'g'}=` + id : '#');
  scrollTo(0, 0);
  render();
}
window.addEventListener('popstate', e => {
  openGame = (e.state && e.state.g) || ONE_GAME || null;
  openEvent = (e.state && e.state.e) || null;
  render();
});
// a link to one game or event (a calendar entry's URL carries one) opens on it
{
  const h = /^#([ge])=(.+)$/.exec(location.hash || '');
  if (h && !ONE_GAME) try {
    const id = decodeURIComponent(h[2]);
    if (h[1] === 'e') openEvent = id; else openGame = id;
  } catch (e) { }
}

document.addEventListener('click', e => {
  const o = e.target.closest('[data-open]');
  if (o) { go(o.dataset.open, true); return; }
  const ev = e.target.closest('[data-event]');
  if (ev) { go(ev.dataset.event, true, 'e'); return; }
  const ic = e.target.closest('[data-ics]');
  if (ic) {
    const [k, id] = ic.dataset.ics.split(':');
    const it = items().find(x => x.kind === k && x.id === id);
    if (it) download(icsOf(it).title, [icsOf(it)]);
    return;
  }
  const cp = e.target.closest('[data-copy]');
  if (cp) {
    navigator.clipboard.writeText(cp.dataset.copy).then(() => { cp.textContent = 'Copied'; }, () => { });
    return;
  }
  if (e.target.closest('[data-icsall]')) {
    download((doc.team && doc.team.name) || 'Team', items().filter(x => x.date && !past(x)).map(icsOf));
    return;
  }
  if (e.target.closest('[data-back]')) { go(null, true); return; }
  if (e.target.closest('[data-signin]')) { signIn(); return; }
  if (e.target.closest('[data-signout]')) { authMod.signOut(auth); return; }
});

async function signIn() {
  if (!authMod) return;
  const p = new authMod.GoogleAuthProvider();
  try { await authMod.signInWithPopup(auth, p); }
  catch (err) { if (/popup/i.test(err.code || '')) authMod.signInWithRedirect(auth, p); }
}

/* A signed-in account either has a role in this club or it does not. Rather than
   duplicating the roster here, the page just offers the way through to the app,
   where the rules already decide what anyone may see. */
function accessBlock() {
  const link = doc && doc.link;
  /* The app is the one beside this page, never wherever the published page
     says. A page under an id nobody has claimed can be written by any
     signed-in account, so the address it names is whatever its writer chose, and a
     `javascript:` address in this button would run on this site, where a
     coach's sign-in lives. The team and game go through encodeURIComponent
     for the same reason. */
  const appUrl = pageBase() + 'index.html';
  const tid = link && typeof link.teamId === 'string' ? encodeURIComponent(link.teamId) : '';
  const deep = tid
    ? `${appUrl}#/team/${tid}${openGame ? '/game/' + encodeURIComponent(openGame) + '/stats' : '/season'}`
    : appUrl;
  if (!authMod) return '';
  if (!viewer) return `<div class="card"><div class="spread">
      <span><b>Signed out</b><span class="rowsub">Numbers only. Sign in if a coach has given your account access.</span></span>
      <button class="btn sm" data-signin>Sign in</button></div></div>`;
  return `<div class="card"><div class="spread">
      <span><b>${esc(viewer.name)}</b><span class="rowsub">Open it in Minutes to see names, if your account has been given access.</span></span>
      ${deep ? `<a class="btn sm" href="${esc(deep)}">Open in Minutes</a>` : ''}</div>
      <button class="backlink" data-signout style="margin-top:8px">Sign out</button></div>`;
}

// tick the clocks and the minutes locally between pushes so it feels live
setInterval(() => {
  if (!doc) return;
  for (const el of document.querySelectorAll('[data-gclk]')) {
    const x = (doc.games || {})[el.dataset.gclk];
    if (x && isRunning(x)) el.textContent = mmss(elapsed(x));
  }
  if (!openGame) return;
  const g = (doc.games || {})[openGame];
  if (!g || !isRunning(g)) return;
  const c = $('#clk'), h = $('#hclk');
  if (c) c.textContent = mmss(elapsed(g));
  if (h) h.textContent = mmss(halfElapsed(g));
  // by position, not shirt number: two can share one, and a missing one is '–'
  (g.players || []).filter(p => p.on).forEach((p, i) => {
    const el = document.querySelector(`[data-oni="${i}"]`);
    if (el) el.textContent = mins(liveSec(g, p)) + 'm';
  });
}, 1000);

(async () => {
  const cfg = window.SOCCER_FIREBASE_CONFIG;
  if (!SHARE) return fail('This link is missing its share code.');
  if (!cfg || !cfg.apiKey || !cfg.databaseURL) return fail('This site has no database configured.');
  try {
    const appMod = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
    const dbMod = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js');
    const app = appMod.initializeApp(cfg);
    const db = dbMod.getDatabase(app);
    dbMod.onValue(dbMod.ref(db, '.info/serverTimeOffset'), s => { skew = s.val() || 0; });
    try {
      authMod = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
      auth = authMod.getAuth(app);
    } catch (e) { authMod = null; }
    if (authMod) {
      authMod.onAuthStateChanged(auth, u => {
        viewer = u ? { uid: u.uid, name: u.displayName || (u.email || '').split('@')[0] || 'Signed in' } : null;
        render();
      });
    }

    dbMod.onValue(dbMod.ref(db, 'public/' + SHARE), s => {
      doc = s.val();
      if (!doc) return fail('That link is no longer active.');
      if (ONE_GAME && !(doc.games || {})[ONE_GAME]) return fail('That game is not published.');
      render();
    }, err => {
      console.error(err);
      fail(err && err.code === 'PERMISSION_DENIED'
        ? 'This scoreboard has not been published yet.'
        : 'Could not reach the scoreboard.');
    });
  } catch (e) {
    console.error(e);
    fail('Could not load the scoreboard.');
  }
})();
