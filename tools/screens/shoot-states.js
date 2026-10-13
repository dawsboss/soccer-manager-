/* Screenshots for (a) the harness-rendered states in states.json, dropped
   into the real page shell so the real CSS draws them, and (b) the share
   pages (live.html, game.html) against a fake Firebase SDK that answers
   public/{id} with the app's own documents from pubdocs.json. */
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node-tools/node_modules/playwright'); } })();
const fs = require('fs'), path = require('path');
const outDir = process.argv[2] || 'shots/onboarding';
fs.mkdirSync(outDir, { recursive: true });
const states = JSON.parse(fs.readFileSync('states.json', 'utf8'));
const docs = JSON.parse(fs.readFileSync('pubdocs.json', 'utf8'));
const Q = JSON.parse(fs.readFileSync('quiet.json', 'utf8')), L = JSON.parse(fs.readFileSync('live.json', 'utf8'));
const BASE = 'http://127.0.0.1:8765/';

const INVENTORY = () => {
  const vis = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('[hidden]'); };
  const out = [];
  for (const el of document.querySelectorAll('button, a[href], [role="button"], input, select, textarea, [data-act]')) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    out.push({ tag: el.tagName.toLowerCase(), text: (el.innerText || el.value || el.placeholder || '').replace(/\s+/g, ' ').trim().slice(0, 100), aria: el.getAttribute('aria-label') || '', cls: typeof el.className === 'string' ? el.className : '', act: (el.dataset && el.dataset.act) || '', href: el.getAttribute('href') || '', w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y), font: cs.fontSize, color: cs.color, bg: cs.backgroundColor });
  }
  return out;
};

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'en-US', timezoneId: 'UTC' });
  await ctx.route(/firebaseio\.com|firebasedatabase\.app|googleapis\.com\/(identitytoolkit|securetoken)|cloudfunctions\.net/, r => r.abort());
  // the fake SDK for the share pages: public/{id} answered from pubdocs
  await ctx.route(/gstatic\.com\/firebasejs\/[\d.]+\/firebase-app\.js/, r => r.fulfill({ contentType: 'application/javascript', body: 'export function initializeApp(c){return {c}}' }));
  await ctx.route(/gstatic\.com\/firebasejs\/[\d.]+\/firebase-auth\.js/, r => r.fulfill({ contentType: 'application/javascript', body: 'export function getAuth(){return {}}; export function onAuthStateChanged(a,cb){setTimeout(()=>cb(null),0)}' }));
  await ctx.route(/gstatic\.com\/firebasejs\/[\d.]+\/firebase-database\.js/, r => r.fulfill({ contentType: 'application/javascript', body: `
    export function getDatabase(){return {}}
    export function ref(db,p){return {p}}
    export function onValue(r,cb,err){ const p=r.p; const D=window.__PUBDOCS||{}; if(p==='.info/serverTimeOffset'){cb({val:()=>0});return ()=>{}}
      const id=p.replace(/^public\\//,''); if(D[id]){setTimeout(()=>cb({val:()=>D[id]}),0)} else if(err){setTimeout(()=>err({code:'PERMISSION_DENIED'}),0)} return ()=>{} }
    export function get(r){return Promise.resolve({val:()=>null,exists:()=>false})}
    export function set(){return Promise.resolve()} export function remove(){return Promise.resolve()} export function onChildAdded(){return ()=>{}}` }));
  const manifest = [];
  let n = 0;
  const page = await ctx.newPage();
  const cap = async (name, note, url) => {
    const id = String(++n).padStart(2, '0') + '-' + name;
    await page.waitForTimeout(500);
    const html = await page.evaluate(() => ({ app: (document.getElementById('app') || document.querySelector('main') || document.body).innerHTML, title: document.title, text: document.body.innerText.slice(0, 6000) }));
    const inv = await page.evaluate(INVENTORY);
    await page.screenshot({ path: path.join(outDir, id + '.png') });
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    let full = ''; if (h > 860) { full = id + '-full.png'; await page.screenshot({ path: path.join(outDir, full), fullPage: true }); }
    fs.writeFileSync(path.join(outDir, id + '.json'), JSON.stringify({ step: name, note, url, ...html, inventory: inv }, null, 1));
    manifest.push({ id, step: name, note, hash: url, png: id + '.png', full, json: id + '.json', toast: '', sheet: false, tappables: inv.length });
    console.log(id, note);
  };

  // (a) the states, in the real shell: serve a page that is index.html with the scripts replaced by the state's HTML
  const shell = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
  for (const [name, st] of Object.entries(states)) {
    const html = shell
      .replace(/<!--[\s\S]*?-->/g, '').replace(/<script\b[^>]*>\s*<\/script>/g, '')
      .replace('<nav class="titlebar" id="titlebar" aria-label="Where you are"></nav>', `<nav class="titlebar" id="titlebar" aria-label="Where you are">${st.titlebar}</nav>`)
      .replace('<nav class="tabs" id="tabs">', '<nav class="tabs" id="tabs" hidden>').replace('<main id="app"></main>', `<main id="app">${st.app}</main>`)
      .replace('<nav class="tabbar" id="tabbar" aria-label="Main" hidden></nav>', st.tabbar ? `<nav class="tabbar" id="tabbar" aria-label="Main">${st.tabbar}</nav>` : '<nav class="tabbar" id="tabbar" aria-label="Main" hidden></nav>')
      .replace('<div class="sheet" id="sheet" hidden role="dialog" aria-modal="true"></div>', st.sheet ? `<div class="sheet-scrim" id="scrim"></div><div class="sheet" id="sheet" role="dialog" aria-modal="true">${st.sheet}</div>` : '<div class="sheet" id="sheet" hidden role="dialog" aria-modal="true"></div>')
      .replace('<span class="sync" id="syncBadge" title="Sync status">local</span>', '<span class="sync" id="syncBadge" data-state="live" title="Sync status">Synced</span>')
      .replace('<span class="brand" id="brand">TeamPlayHQ<span class="ver" id="ver"></span></span>', '<span class="brand" id="brand">TeamPlayHQ<span class="ver" id="ver">v153</span></span>');
    await page.route(BASE + 'state-' + name + '.html', r => r.fulfill({ contentType: 'text/html', body: html }));
    await page.goto(BASE + 'state-' + name + '.html');
    await cap(name, st.note + (st.toast ? ' (toast: ' + st.toast + ')' : ''), 'state:' + name);
  }

  // (b) the share pages
  await page.addInitScript(({ docs }) => { window.__PUBDOCS = docs; }, { docs: { seasonabc: docs['quiet-season'], game_sbg5: docs['quiet-game-sbg5'] } });
  await page.clock.setFixedTime(Q.NOW);
  await page.goto(BASE + 'live.html?t=seasonabc'); await page.waitForTimeout(800);
  await cap('share-season', 'the season link a coach sends (live.html): what a parent opens from the group chat', 'live.html?t=seasonabc');
  try { await page.click('[data-gclk]', { timeout: 2000 }); await cap('share-season-game', 'a game tapped on the season page', 'live.html?t=seasonabc (game)'); } catch (e) { console.log('no game row to tap'); }
  await page.goto(BASE + 'game.html?t=game_sbg5&g=sbg5'); await page.waitForTimeout(800);
  await cap('share-game-upcoming', 'a game link (game.html) for the next game', 'game.html?t=game_sbg5&g=sbg5');
  // the live game, on Saturday
  const page2 = await ctx.newPage();
  await page2.addInitScript(({ docs }) => { window.__PUBDOCS = docs; }, { docs: { seasonabc: docs['live-season'], game_sbg3: docs['live-game-sbg3'] } });
  await page2.clock.setFixedTime(L.NOW);
  const p1 = page; Object.assign(page, {}); // keep cap bound to page below
  const capOn = async (pg, name, note, url) => { const saved = page; await (async () => { })(); const id = String(++n).padStart(2, '0') + '-' + name; await pg.waitForTimeout(500); const html = await pg.evaluate(() => ({ app: (document.getElementById('app') || document.querySelector('main') || document.body).innerHTML, title: document.title, text: document.body.innerText.slice(0, 6000) })); const inv = await pg.evaluate(INVENTORY); await pg.screenshot({ path: path.join(outDir, id + '.png') }); const h = await pg.evaluate(() => document.documentElement.scrollHeight); let full = ''; if (h > 860) { full = id + '-full.png'; await pg.screenshot({ path: path.join(outDir, full), fullPage: true }); } fs.writeFileSync(path.join(outDir, id + '.json'), JSON.stringify({ step: name, note, url, ...html, inventory: inv }, null, 1)); manifest.push({ id, step: name, note, hash: url, png: id + '.png', full, json: id + '.json', toast: '', sheet: false, tappables: inv.length }); console.log(id, note); void saved; };
  await page2.goto(BASE + 'game.html?t=game_sbg3&g=sbg3'); await page2.waitForTimeout(800);
  await capOn(page2, 'share-game-live', 'a game link during the game (Saturday, 38 min in)', 'game.html?t=game_sbg3&g=sbg3');
  await page2.goto(BASE + 'live.html?t=seasonabc'); await page2.waitForTimeout(800);
  await capOn(page2, 'share-season-live', 'the season link during the game', 'live.html?t=seasonabc (live)');
  void p1;
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify({ persona: 'states', tour: 'onboarding+share', NOW: Q.NOW, scen: 'quiet/live', steps: manifest, errors: [] }, null, 1));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
