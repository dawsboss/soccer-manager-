/* Clips of the How to topics (build 192; the owner, 2026-10-26: "clips sounds
   good using the HTML"). Drives the real app in Chromium at phone size, as a
   person the topic is for, on the invented club and with the clock fixed, the
   way shoot.js does; opens each How to topic, reads its steps off the screen
   (so a clip holds exactly the steps that person sees), and for each step
   shows its words as a caption, rings the step's button, taps it, and holds on
   the screen it opened. Chromium records the whole thing; ffmpeg trims the
   load, turns it into an .mp4 a phone plays and takes a poster frame.

   Nothing here is wired into the app: a clip is a file for the owner to look
   at, made again by one command when the screens change. A clip is only ever
   of the invented club, so no real child's name can be in one.

   node clips.js <personas.json> <outDir> [topic ...]                         */
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node-tools/node_modules/playwright'); } })();
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const [, , pfile, outDir, ...only] = process.argv;
if (!pfile || !outDir) { console.error('node clips.js <personas.json> <outDir> [topic ...]'); process.exit(1); }
const P = JSON.parse(fs.readFileSync(pfile, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });
const BASE = 'http://127.0.0.1:8765/index.html';
const BUILD = (fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8').match(/name="build" content="(\d+)"/) || [])[1] || '?';
/* Who each clip is recorded as: the parent first, for every topic she has
   (she is who the owner means by "tech incapable"), then the coach for the
   rest of hers, then the admin for the club's. A topic is recorded once. */
const PERSONAS = ['mum', 'jaz', 'boss'];
// recorded at twice the phone's size so text stays crisp when the clip is scaled up on a laptop
const W = 390, H = 844, SCALE = 2;
// how long a caption stays: long enough to read it at a parent's pace, never a lecture
const readMs = s => Math.min(6500, 1500 + 42 * s.length);

/* The caption bar and the tap ring live in the page, over the app, and are
   what the recording sees. The hash is changed in place (never a reload), so
   they survive from step to step. */
const OVERLAY = () => {
  if (document.getElementById('clipcap')) return;
  const st = document.createElement('style');
  st.textContent = `
    #clipcap{position:fixed;left:12px;right:12px;bottom:92px;z-index:9999;background:rgba(20,32,24,.92);color:#fff;border-radius:14px;padding:12px 14px 13px;font:500 16px/1.4 Barlow,system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.35);transition:opacity .25s}
    #clipcap[hidden]{display:none}
    #clipcap b{display:block;font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.75;margin-bottom:3px}
    #clipring{position:fixed;z-index:9998;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;border:4px solid #F2B705;box-shadow:0 0 0 6px rgba(242,183,5,.35);pointer-events:none;animation:clippulse .9s ease-in-out infinite}
    #clipring[hidden]{display:none}
    @keyframes clippulse{0%,100%{transform:scale(1)}50%{transform:scale(1.18)}}
    .clipstep{outline:3px solid #F2B705;outline-offset:4px;border-radius:10px}`;
  document.head.appendChild(st);
  const cap = document.createElement('div'); cap.id = 'clipcap'; cap.hidden = true; document.body.appendChild(cap);
  const ring = document.createElement('div'); ring.id = 'clipring'; ring.hidden = true; document.body.appendChild(ring);
};

(async () => {
  const b = await chromium.launch();
  const done = new Set();
  const manifest = { build: BUILD, NOW: P.NOW, scen: P.scen, made: new Date().toISOString(), clips: [] };
  for (const persona of PERSONAS) {
    const seed = P.personas[persona];
    if (!seed) { console.log('no persona', persona); continue; }
    // one browser context per persona, its own storage and its own video file per topic
    const topics = await listTopics(b, seed);
    for (const t of topics) {
      if (done.has(t.id) || (only.length && !only.includes(t.id))) continue;
      done.add(t.id);
      const clip = await record(b, seed, persona, t);
      manifest.clips.push(clip);
      console.log(`${t.id.padEnd(11)} ${persona.padEnd(5)} ${clip.steps} steps  ${clip.seconds}s  ${clip.mp4}`);
    }
  }
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 1));
  fs.writeFileSync(path.join(outDir, 'INDEX.md'), index(manifest));
  await b.close();

  async function boot(ctx, seed) {
    await ctx.route(/firebaseio\.com|firebasedatabase\.app|googleapis\.com\/(identitytoolkit|securetoken)|cloudfunctions\.net|fcmregistrations/, r => r.abort());
    if (ctx.routeWebSocket) await ctx.routeWebSocket(/firebaseio\.com|firebasedatabase\.app/, ws => ws.close());
    await ctx.addInitScript(({ seed }) => {
      if (!localStorage.getItem('__seeded')) { for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v); localStorage.setItem('__seeded', '1'); }
      Object.defineProperty(navigator, 'onLine', { get: () => false });
    }, { seed });
    const page = await ctx.newPage();
    await page.clock.setFixedTime(P.NOW);
    await page.goto(BASE);
    await page.waitForTimeout(1500);
    // the role card, the first time this person opens the club: put away, so the clip is of the screens
    try { await page.click('[data-act="roleok"]', { timeout: 800 }); } catch (e) { }
    return page;
  }
  async function open(page, hash) { await page.evaluate(h => { location.hash = h; }, hash); await page.waitForTimeout(500); }

  // the topics this person is offered, read off the How to screen itself
  async function listTopics(browser, seed) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: SCALE, isMobile: true, hasTouch: true, locale: 'en-US', timezoneId: 'UTC' });
    const page = await boot(ctx, seed);
    await open(page, '#/how-to');
    const topics = await page.evaluate(() => [...document.querySelectorAll('#app [data-act="howto"][data-k]')].map(b => ({ id: b.dataset.k, title: b.querySelector('.pname').innerText, lead: b.querySelector('.psub').innerText })));
    await ctx.close();
    return topics;
  }

  async function record(browser, seed, persona, t) {
    const vdir = fs.mkdtempSync(path.join(outDir, '.rec-'));
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: SCALE, isMobile: true, hasTouch: true, locale: 'en-US', timezoneId: 'UTC',
      recordVideo: { dir: vdir, size: { width: W * SCALE, height: H * SCALE } } });
    const t0 = Date.now();
    const page = await boot(ctx, seed);
    await page.evaluate(OVERLAY);
    await open(page, '#/how-to/' + t.id);
    const started = Date.now() - t0;   // the load, trimmed off the front of the clip
    const steps = await page.evaluate(() => [...document.querySelectorAll('#app .howsteps li')].map((li, i) => ({
      i, say: li.querySelector('.howsay > span').innerText, label: (li.querySelector('.howsay .btn') || {}).innerText || ''
    })));
    const caption = (kicker, text) => page.evaluate(([k, s]) => { const c = document.getElementById('clipcap'); c.innerHTML = `<b>${k}</b>${s}`; c.hidden = false; }, [kicker, text]);
    const ringAt = sel => page.evaluate(sel => {
      const el = document.querySelector(sel); const r = document.getElementById('clipring');
      if (!el) { r.hidden = true; return false; }
      el.scrollIntoView({ block: 'center' });
      const b = el.getBoundingClientRect(); r.style.left = (b.left + b.width / 2) + 'px'; r.style.top = (b.top + b.height / 2) + 'px'; r.hidden = false; return true;
    }, sel);
    const ringOff = () => page.evaluate(() => { document.getElementById('clipring').hidden = true; });
    // the topic, its title and its line, held a moment
    await caption(t.title, t.lead);
    await page.waitForTimeout(2200);
    /* A step with no button keeps the screen the last tap opened, with its
       words as the caption: "Tap your answer" is said over Home, where the
       answer is, not over the guide. A step with a button starts from the
       topic again, lit, so the clip shows where the button is. */
    let onScreen = false;
    for (const s of steps) {
      if (!s.label && onScreen) { await caption(`Step ${s.i + 1} of ${steps.length}`, s.say); await page.waitForTimeout(readMs(s.say)); continue; }
      await open(page, '#/how-to/' + t.id);
      await page.evaluate(OVERLAY);
      await page.evaluate(i => { const lis = document.querySelectorAll('#app .howsteps li'); lis.forEach(x => x.classList.remove('clipstep')); lis[i].classList.add('clipstep'); lis[i].scrollIntoView({ block: 'center' }); }, s.i);
      await caption(`Step ${s.i + 1} of ${steps.length}`, s.say);
      await page.waitForTimeout(readMs(s.say));
      onScreen = false;
      if (!s.label) continue;
      // the button ringed, then tapped, then the screen it opened held
      const sel = `#app .howsteps li:nth-child(${s.i + 1}) .btn`;
      await ringAt(sel);
      await page.waitForTimeout(1100);
      try { await page.click(sel, { timeout: 2000 }); } catch (e) { }
      await ringOff();
      await page.waitForTimeout(250);
      await caption(s.label, s.say);
      await page.waitForTimeout(2400);
      // a sheet (More) is closed again; a screen stays for the step after
      const sheet = await page.evaluate(() => { const sh = document.getElementById('sheet'); return !!sh && !sh.hidden; });
      if (sheet) { try { await page.evaluate(() => document.getElementById('scrim').click()); } catch (e) { } await page.waitForTimeout(300); }
      else onScreen = true;
    }
    await open(page, '#/how-to/' + t.id);
    await page.evaluate(OVERLAY);
    await caption(t.title, 'That is all there is to it.');
    await page.waitForTimeout(1800);
    const total = Date.now() - t0;
    const vpath = await page.video().path();
    await ctx.close();
    const base = t.id;
    const webm = path.join(outDir, base + '.webm');
    fs.renameSync(vpath, webm);
    fs.rmSync(vdir, { recursive: true, force: true });
    const mp4 = path.join(outDir, base + '.mp4'), poster = path.join(outDir, base + '.png');
    const ss = (started / 1000).toFixed(2);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', ss, '-i', webm, '-c:v', 'libx264', '-preset', 'medium', '-crf', '26', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', mp4]);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', (started / 1000 + 1).toFixed(2), '-i', webm, '-frames:v', '1', poster]);
    fs.unlinkSync(webm);
    return { id: t.id, title: t.title, lead: t.lead, persona, steps: steps.length, seconds: Math.round((total - started) / 1000), mp4: base + '.mp4', poster: base + '.png' };
  }

  function index(m) {
    const who = { mum: 'a parent', jaz: 'a coach', boss: 'an admin' };
    return `# How to, as clips\n\nBuild ${m.build}, made ${m.made.slice(0, 10)} from the \`${m.scen}\` club. Each clip is the How to topic as that person sees it: every step's words as a caption, its button ringed and tapped, the screen it opens held a moment. Silent, phone-shaped, made again by \`node clips.js\` when the screens change.\n\n| Clip | For | Steps | Length |\n|---|---|---|---|\n` +
      m.clips.map(c => `| [${c.title}](${c.mp4}) | ${who[c.persona] || c.persona} | ${c.steps} | ${c.seconds}s |`).join('\n') + '\n';
  }
})().catch(e => { console.error(e); process.exit(1); });
