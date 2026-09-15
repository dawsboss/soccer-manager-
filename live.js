/* Public follow page. Reads one published mirror and renders it.
   No writes, no login, no names — shirt numbers only. */

const q = new URLSearchParams(location.search);
const SHARE = (q.get('t') || '').trim();
const ONE_GAME = (q.get('g') || '').trim();

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mmss = sec => { sec = Math.max(0, Math.floor(sec)); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); };
const mins = sec => Math.round(sec / 60);

let doc = null, skew = 0, openGame = ONE_GAME || null;
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
function elapsed(g) {
  let t = 0;
  for (const s of segments(g)) { if (!s.start) continue; t += ((s.end || nowMs()) - s.start); }
  return Math.floor(t / 1000);
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
  const name = (doc.team && doc.team.name) || 'Team';
  const g = openGame ? (doc.games || {})[openGame] : null;

  const logo = (doc.team && doc.team.logo) || null;
  const crest = $('#crest');
  if (crest) { crest.src = logo || ''; crest.hidden = !logo; }

  if (g) {
    const live = g.status === 'live', done = g.status === 'done';
    $('#title').textContent = `${name} v ${g.opponent || 'TBC'}`;
    $('#sub').innerHTML = [niceDate(g.date), niceTime(g.kickoff), esc(g.venue)].filter(Boolean).join(' · ')
      + `<br><span class="pill ${live ? 'live' : ''}">${live ? 'Live now' : done ? 'Full time' : 'Not started'}</span>`;

    const on = (g.players || []).filter(p => p.on);
    const off = (g.players || []).filter(p => !p.on);
    $('#app').innerHTML = `<div class="stack">
      ${ONE_GAME && !SEASON_PAGE ? '' : `<button class="backlink" data-back>Back to the season</button>`}

      <div class="card scorecard">
        <div class="scoreside"><span class="scorelbl">${esc(name)}</span><span class="bignum"${bump('su', g.score.us)}>${g.score.us}</span></div>
        <div class="scoresep"></div>
        <div class="scoreside"><span class="scorelbl">${esc(g.opponent || 'Them')}</span><span class="bignum"${bump('st', g.score.them)}>${g.score.them}</span></div>
      </div>

      ${g.status !== 'upcoming' ? `<div class="clockwrap"><div class="clockline">
        <div class="clock" id="clk">${mmss(elapsed(g))}</div>
        <div class="clockmeta"><b>${esc(halfName(g, g.currentHalf || 1))}</b>
        <span id="hclk">${mmss(halfElapsed(g))}</span> of ${g.periodMinutes || 40}:00</div>
      </div></div>` : `<div class="card"><p class="meta" style="margin:0">
        ${[niceDate(g.date), niceTime(g.kickoff) && 'Kick-off ' + niceTime(g.kickoff), esc(g.venue)].filter(Boolean).map(x => `<span>${x}</span>`).join('')}
      </p></div>`}

      ${g.goals && g.goals.length ? `<div class="card"><h2 style="margin-bottom:10px">Goals</h2>
        <div class="log">${g.goals.slice().reverse().map(x => `<div style="display:grid;grid-template-columns:52px 1fr;gap:10px;padding:7px 0;border-top:1px solid var(--line)">
          <span class="t">${mmss(x.t)}</span>
          <span>${x.side === 'us' ? `<span class="on">${esc(name)}${x.n ? ' — number ' + esc(x.n) : ''}</span>` : `<span class="off">${esc(g.opponent || 'Them')}</span>`}</span>
        </div>`).join('')}</div></div>` : ''}

      ${on.length ? `<div class="card"><h2 style="margin-bottom:10px">On the pitch</h2>
        <div class="numlist">${on.map(p => `<span class="numchip"${bump('on' + p.n, 1)}>${esc(p.n)}<small${bump('m' + p.n, mins(p.sec))}>${mins(p.sec)}m</small></span>`).join('')}</div></div>` : ''}

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
  const next = list.filter(x => x.status === 'upcoming').slice(-1)[0];
  $('#title').textContent = `Follow ${name}`;
  $('#sub').innerHTML = `${r.w}W ${r.d}D ${r.l}L · ${r.gf} scored, ${r.ga} conceded`
    + (now ? `<br><span class="pill live">Playing now</span>` : '');

  $('#app').innerHTML = `<div class="stack">
    ${now ? card(now, 'Happening now') : next ? card(next, 'Up next') : ''}
    <div class="card"><h2 style="margin-bottom:10px">All games</h2>
      <div class="plist">${list.map(x => `<button class="gamerow" data-open="${esc(x.id)}">
        <span><b>${esc(x.opponent || 'TBC')}</b>
          <span class="rowsub">${[niceDate(x.date), niceTime(x.kickoff), esc(x.venue)].filter(Boolean).join(' · ')}</span></span>
        <span class="pmins">${x.status === 'upcoming' ? '<small>upcoming</small>' : `${x.score.us}<small>–${x.score.them}</small>`}</span>
      </button>`).join('') || '<p class="muted" style="margin:0">No games yet.</p>'}</div></div>
  </div>`;

  function card(x, label) {
    return `<button class="card" data-open="${esc(x.id)}" style="text-align:left;width:100%">
      <span class="muted">${label}</span>
      <div class="spread" style="margin-top:6px">
        <b style="font-size:18px">${esc(x.opponent || 'TBC')}</b>
        <span class="pmins">${x.status === 'upcoming' ? '' : `${x.score.us}<small>–${x.score.them}</small>`}</span>
      </div>
      <p class="meta" style="margin-top:6px">${[niceDate(x.date), niceTime(x.kickoff) && 'Kick-off ' + niceTime(x.kickoff), esc(x.venue)].filter(Boolean).map(v => `<span>${v}</span>`).join('')}</p>
    </button>`;
  }
}

document.addEventListener('click', e => {
  const o = e.target.closest('[data-open]');
  if (o) { openGame = o.dataset.open; scrollTo(0, 0); render(); return; }
  if (e.target.closest('[data-back]')) { openGame = null; scrollTo(0, 0); render(); }
});

// tick the clock locally between pushes so it feels live
setInterval(() => {
  if (!doc || !openGame) return;
  const g = (doc.games || {})[openGame];
  if (!g || !isRunning(g)) return;
  const c = $('#clk'), h = $('#hclk');
  if (c) c.textContent = mmss(elapsed(g));
  if (h) h.textContent = mmss(halfElapsed(g));
}, 1000);

(async () => {
  const cfg = window.SOCCER_FIREBASE_CONFIG;
  if (!SHARE) return fail('This link is missing its share code.');
  if (!cfg || !cfg.apiKey || !cfg.databaseURL) return fail('This site has no database configured.');
  try {
    const appMod = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
    const dbMod = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js');
    const db = dbMod.getDatabase(appMod.initializeApp(cfg));
    dbMod.onValue(dbMod.ref(db, '.info/serverTimeOffset'), s => { skew = s.val() || 0; });
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
