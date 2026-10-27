/* Clips of the How to topics (build 192; the owner, 2026-10-26: "clips sounds
   good using the HTML", and 2026-10-27: "shouldn't they be videos of the
   actual things to do?"). Each topic is a walk through the real screens, as
   the person the topic is for, doing the thing: the parent opens Home and taps
   Going, the coach starts the clock on Track, logs a goal and makes a sub, the
   admin opens People and the Scheduler. The step's own words, read off the
   How to screen, are the caption over each action, so the words stay in one
   place (HOWTO in app.js); every tap is ringed first so a viewer sees where
   the button is. Chromium records it at phone size on the invented club with
   the clock fixed, the way shoot.js captures stills; ffmpeg trims the load and
   makes an .mp4 a phone plays and a poster frame.

   Nothing here is wired into the app: a clip is a file for the owner to look
   at, made again by one command when the screens change, and only ever of
   the invented club, so no real child's name can be in one. A walk that needs
   a game being played runs on the live Saturday club; the rest on the quiet
   Wednesday one. The seeder (gen-club.js) makes both into a temp folder.

   node clips.js <outDir> [topic ...]                                         */
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node-tools/node_modules/playwright'); } })();
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const [, , outDir, ...only] = process.argv;
if (!outDir) { console.error('node clips.js <outDir> [topic ...]'); process.exit(1); }
fs.mkdirSync(outDir, { recursive: true });
const BASE = 'http://127.0.0.1:8765/index.html';
const BUILD = (fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8').match(/name="build" content="(\d+)"/) || [])[1] || '?';
// recorded at twice the phone's size so text stays crisp when the clip is scaled up on a laptop
const W = 390, H = 844, SCALE = 2;
// how long a caption stays: long enough to read at a parent's pace, never a lecture
const readMs = s => Math.min(6500, 1500 + 42 * s.length);

/* Who each topic is recorded as, and on which club. The parent is who the
   owner means by "tech incapable"; the coach's topics as the coach; the
   club's as the admin. A topic not listed here is recorded as the How to
   screen alone, so a new topic is never missing a clip, only a walk. */
const WALKS = {
  around: { who: 'mum', scen: 'quiet' }, home: { who: 'mum', scen: 'quiet' }, coming: { who: 'mum', scen: 'quiet' },
  follow: { who: 'mum', scen: 'live' }, calendar: { who: 'mum', scen: 'quiet' }, messages: { who: 'mum', scen: 'quiet' },
  notify: { who: 'mum', scen: 'quiet' }, homescreen: { who: 'mum', scen: 'quiet' }, offline: { who: 'mum', scen: 'quiet' },
  sessions: { who: 'mum', scen: 'quiet' },
  team: { who: 'jaz', scen: 'quiet' }, families: { who: 'jaz', scen: 'quiet' }, lineup: { who: 'jaz', scen: 'quiet' },
  sideline: { who: 'jaz', scen: 'live' }, after: { who: 'jaz', scen: 'quiet' }, practice: { who: 'jaz', scen: 'quiet' },
  register: { who: 'jaz', scen: 'quiet' }, club: { who: 'boss', scen: 'quiet' }
};

/* The caption bar and the tap ring live in the page, over the app, and are
   what the recording sees. The hash is changed in place (never a reload), so
   they survive from screen to screen. */
const OVERLAY = () => {
  if (document.getElementById('clipcap')) return;
  const st = document.createElement('style');
  st.textContent = `
    #clipcap{position:fixed;left:12px;right:12px;bottom:92px;z-index:9999;background:rgba(20,32,24,.92);color:#fff;border-radius:14px;padding:12px 14px 13px;font:500 16px/1.4 Barlow,system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.35)}
    #clipcap[hidden]{display:none}
    #clipcap b{display:block;font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.75;margin-bottom:3px}
    #clipring{position:fixed;z-index:9998;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;border:4px solid #F2B705;box-shadow:0 0 0 6px rgba(242,183,5,.35);pointer-events:none;animation:clippulse .9s ease-in-out infinite}
    #clipring[hidden]{display:none}
    @keyframes clippulse{0%,100%{transform:scale(1)}50%{transform:scale(1.18)}}`;
  document.head.appendChild(st);
  const cap = document.createElement('div'); cap.id = 'clipcap'; cap.hidden = true; document.body.appendChild(cap);
  const ring = document.createElement('div'); ring.id = 'clipring'; ring.hidden = true; document.body.appendChild(ring);
};

(async () => {
  // the two clubs, seeded fresh so the clips are of the screens as they are now
  const seedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clips-seed-'));
  const P = {};
  for (const scen of ['quiet', 'live']) {
    const f = path.join(seedDir, scen + '.json');
    // the seeder writes its file, then the harness's own init throws on the way out: the file is what counts
    try { execFileSync('node', [path.join(__dirname, 'gen-club.js'), scen, f], { stdio: 'ignore' }); } catch (e) { if (!fs.existsSync(f)) throw e; }
    P[scen] = JSON.parse(fs.readFileSync(f, 'utf8'));
  }
  const b = await chromium.launch();
  const mf = path.join(outDir, 'manifest.json');
  const manifest = { build: BUILD, made: new Date().toISOString(), clips: [] };
  try { const old = JSON.parse(fs.readFileSync(mf, 'utf8')); if (old.build === BUILD) manifest.clips = old.clips || []; } catch (e) { }
  // the topics, in the How to screen's own order, read as the parent then the coach then the admin
  const topics = [];
  for (const who of ['mum', 'jaz', 'boss']) for (const t of await listTopics(b, P.quiet.personas[who])) if (!topics.some(x => x.id === t.id)) topics.push(t);
  for (const t of topics) {
    if (only.length && !only.includes(t.id)) continue;
    const w = WALKS[t.id] || { who: 'mum', scen: 'quiet' };
    const clip = await record(b, P[w.scen], w.who, t);
    manifest.clips = manifest.clips.filter(c => c.id !== clip.id).concat(clip);
    console.log(`${t.id.padEnd(11)} ${w.who.padEnd(5)} ${w.scen.padEnd(6)} ${clip.steps} steps  ${clip.seconds}s${clip.misses.length ? '  MISS: ' + clip.misses.join(', ') : ''}`);
  }
  manifest.clips.sort((a, b) => topics.findIndex(t => t.id === a.id) - topics.findIndex(t => t.id === b.id));
  fs.writeFileSync(mf, JSON.stringify(manifest, null, 1));
  fs.writeFileSync(path.join(outDir, 'INDEX.md'), index(manifest));
  fs.rmSync(seedDir, { recursive: true, force: true });
  await b.close();

  async function boot(ctx, P, seed) {
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
    const page = await boot(ctx, P.quiet, seed);
    await open(page, '#/how-to');
    const out = await page.evaluate(() => [...document.querySelectorAll('#app [data-act="howto"][data-k]')].map(b => ({ id: b.dataset.k, title: b.querySelector('.pname').innerText, lead: b.querySelector('.psub').innerText })));
    await ctx.close();
    return out;
  }

  async function record(browser, P, who, t) {
    const vdir = fs.mkdtempSync(path.join(outDir, '.rec-'));
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: SCALE, isMobile: true, hasTouch: true, locale: 'en-US', timezoneId: 'UTC',
      recordVideo: { dir: vdir, size: { width: W * SCALE, height: H * SCALE } } });
    const t0 = Date.now();
    const page = await boot(ctx, P, P.personas[who]);
    await page.evaluate(OVERLAY);
    // the steps as this person sees them, off the How to screen: their words are the captions
    await open(page, '#/how-to/' + t.id);
    const steps = await page.evaluate(() => [...document.querySelectorAll('#app .howsteps li')].map(li => li.querySelector('.howsay > span').innerText));
    const started = Date.now() - t0;   // the load, trimmed off the front of the clip
    const misses = [];
    /* The walk's own words: a caption, a ringed tap, a hold, and the screens.
       A tap that finds nothing is written down and the walk goes on, so a
       selector the app has moved shows up in the manifest, never as a crash. */
    const h = {
      page,
      say: async (i, kicker) => { const s = typeof i === 'number' ? steps[i] || '' : i; await page.evaluate(([k, s]) => { const c = document.getElementById('clipcap'); c.innerHTML = `<b>${k}</b>${s}`; c.hidden = false; }, [kicker || (typeof i === 'number' ? `Step ${i + 1} of ${steps.length}` : ''), s]); await page.waitForTimeout(Math.min(readMs(s), 3800)); },
      hold: ms => page.waitForTimeout(ms || 1800),
      tap: async (sel, what, opt) => {
        const ok = await page.evaluate(sel => {
          const el = document.querySelector(sel); const r = document.getElementById('clipring');
          if (!el) { r.hidden = true; return false; }
          el.scrollIntoView({ block: 'center' });
          const b = el.getBoundingClientRect(); r.style.left = (b.left + b.width / 2) + 'px'; r.style.top = (b.top + b.height / 2) + 'px'; r.hidden = false; return true;
        }, sel);
        if (!ok) { if (!opt) misses.push(what || sel); return false; }
        await page.waitForTimeout(1000);
        try { await page.click(sel, { timeout: 2000 }); } catch (e) { misses.push(what || sel); }
        await page.evaluate(() => { document.getElementById('clipring').hidden = true; });
        await page.waitForTimeout(700);
        return true;
      },
      tab: k => h.tap(`#tabbar [data-tab="${k}"]`, 'tab ' + k),
      go: async hash => { await open(page, hash); await page.evaluate(OVERLAY); await page.waitForTimeout(300); },
      type: async (sel, text) => { try { await page.fill(sel, text); await page.waitForTimeout(600); } catch (e) { misses.push('type ' + sel); } },
      closeSheet: async () => { try { await page.evaluate(() => { const sh = document.getElementById('sheet'); if (sh && !sh.hidden) document.getElementById('scrim').click(); }); } catch (e) { } await page.waitForTimeout(400); },
      pick: async (sel, prefix) => { try { await page.evaluate(([sel, p]) => { const el = document.querySelector(sel); const o = [...el.options].find(o => o.value.startsWith(p)); if (o) { el.value = o.value; el.dispatchEvent(new Event('change', { bubbles: true })); } }, [sel, prefix]); await page.waitForTimeout(600); } catch (e) { misses.push('pick ' + sel); } },
      scroll: async y => { await page.evaluate(y => window.scrollBy({ top: y, behavior: 'smooth' }), y); await page.waitForTimeout(900); }
    };
    await h.say(t.lead, t.title);
    await (TOURS[t.id] || TOURS._plain)(h, steps);
    await h.closeSheet();
    await h.say('That is all there is to it.', t.title);
    const total = Date.now() - t0;
    const vpath = await page.video().path();
    await ctx.close();
    const webm = path.join(outDir, t.id + '.webm');
    fs.renameSync(vpath, webm);
    fs.rmSync(vdir, { recursive: true, force: true });
    const mp4 = path.join(outDir, t.id + '.mp4'), poster = path.join(outDir, t.id + '.png');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', (started / 1000).toFixed(2), '-i', webm, '-c:v', 'libx264', '-preset', 'medium', '-crf', '26', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', mp4]);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', (started / 1000 + 2).toFixed(2), '-i', webm, '-frames:v', '1', poster]);
    fs.unlinkSync(webm);
    return { id: t.id, title: t.title, lead: t.lead, who, steps: steps.length, seconds: Math.round((total - started) / 1000), mp4: t.id + '.mp4', poster: t.id + '.png', misses };
  }

  function index(m) {
    const who = { mum: 'a parent', jaz: 'a coach', boss: 'an admin' };
    return `# How to, as clips\n\nBuild ${m.build}, made ${m.made.slice(0, 10)} from the invented club. Each clip walks through the real screens doing what the topic says, as the person it is for, with each step's words as a caption and every tap ringed before it lands. Silent, phone-shaped, made again by \`node clips.js\` when the screens change.\n\n| Clip | For | Steps | Length |\n|---|---|---|---|\n` +
      m.clips.map(c => `| [${c.title}](${c.mp4}) | ${who[c.who] || c.who} | ${c.steps} | ${c.seconds}s |`).join('\n') + '\n';
  }
})().catch(e => { console.error(e); process.exit(1); });

/* ---------------- the walks ---------------- */
/* One per topic: the steps' words as captions (by index, as the How to screen
   lists them for this person), and between them the taps that do the thing.
   Selectors are the app's own data-act names, the same the screens tool and
   the suites use. The invented club: the parent is Rosa's mother on G12
   Flight, whose next practice is tomorrow and next game Saturday v Eastfield;
   the live club has that game 38 minutes in. */
const TOURS = {
  // a topic with no walk yet: the How to screen itself, step by step
  _plain: async (h, steps) => { for (let i = 0; i < steps.length; i++) await h.say(i); },

  around: async h => {
    await h.tab('home'); await h.say(0);
    await h.tab('calendar'); await h.hold(900); await h.tab('game'); await h.hold(900); await h.closeSheet(); await h.tab('messages'); await h.hold(900);
    await h.go('#/settings'); await h.say(1); await h.tap('#titlebar .tbback', 'the back arrow'); await h.hold(1200);
    await h.say(2); await h.tap('#titlebar [data-act="clubswitch"]', 'the club name'); await h.hold(1500); await h.closeSheet();
    await h.say(3); await h.tap('#avatar', 'the avatar'); await h.hold(1800); await h.closeSheet();
    await h.say(4); await h.tab('more'); await h.hold(2200); await h.closeSheet();
  },
  home: async h => {
    await h.tab('home'); await h.say(0);
    await h.scroll(260); await h.say(1); await h.scroll(300); await h.hold(800);
    await h.say(2); await h.tap('#app .calnext [data-act="calgame"]', 'Open the game') || await h.tap('#app [data-act="calgame"]', 'Open the game'); await h.hold(2200);
    await h.tap('#titlebar [data-act="backgames"]', 'back to Home'); await h.hold(800);
  },
  coming: async h => {
    await h.tab('home'); await h.say(0);
    await h.tap('#app [data-act="rsvp"][data-v="yes"]', 'Going on Home'); await h.say(1);
    await h.tab('calendar'); await h.say(2);
    await h.tap('#app [data-act="calitem"][data-k="practice"]', 'the practice row'); await h.hold(1200);
    await h.tap('#sheet [data-act="rsvp"][data-v="maybe"]', 'Maybe in the sheet'); await h.hold(1200);
    await h.type('#sheet textarea, #sheet input[type="text"]', 'Dentist at 5, may be ten minutes late');
    await h.say(3); await h.closeSheet();
  },
  follow: async h => {
    await h.say(0); await h.tab('game'); await h.hold(1500);
    // one game of hers being played: the tab opens it; otherwise the list's first row
    await h.tap('#app [data-act="navgame"]', 'the game row', true);
    await h.tap('#subtabs [data-gview="live"]', 'Live'); await h.say(1); await h.scroll(400); await h.hold(1200); await h.scroll(-400);
    await h.say(2); await h.tap('#app [data-act="feedfollow"]', 'Buzz me'); await h.hold(1500);
    await h.tap('#subtabs [data-gview="stats"]', 'Stats'); await h.say(3); await h.hold(600);
  },
  calendar: async h => {
    await h.tab('calendar'); await h.say(0);
    for (const v of ['day', 'week', 'month']) { await h.tap(`[data-act="calview"][data-v="${v}"]`, 'view ' + v); await h.hold(1300); }
    await h.tap('[data-act="calview"][data-v="schedule"]', 'Schedule');
    await h.say(1); await h.tap('#app [data-act="calitem"][data-k="game"]', 'a game row'); await h.hold(1000);
    await h.tap('#sheet .caladd .btn, #sheet [data-act="calics"]', 'Add to your calendar'); await h.hold(1600); await h.closeSheet();
    await h.say(2); await h.tap('#app [data-act="calitem"][data-k="practice"]', 'the practice row'); await h.hold(2000); await h.closeSheet();
  },
  messages: async h => {
    await h.tab('messages'); await h.say(0);
    await h.tap('#app [data-act="thread"]', 'Message the coaches'); await h.hold(1600);
    await h.type('#app textarea', 'Rosa will be a few minutes late tonight.'); await h.hold(1200);
    await h.tap('#titlebar .tbback', 'back to Messages'); await h.say(1); await h.scroll(300); await h.hold(1200); await h.scroll(-300);
    await h.say(2);
  },
  notify: async h => {
    await h.tab('more'); await h.tap('#sheet [data-act="goview"][data-v="setup"]', 'Settings');
    await h.say(0); await h.tap('#app #setNotify', 'Notifications'); await h.hold(600);
    await h.tap('#app [data-act="pushon"], #app [data-act="msgalerts"]', 'Turn on'); await h.hold(1200);
    await h.say(1); await h.say(2); await h.scroll(300); await h.hold(1500);
  },
  homescreen: async h => {
    // the browser's own menu cannot be recorded from inside the page: the words carry it, over Home
    await h.tab('home'); await h.say(0); await h.say(1); await h.say(2);
  },
  offline: async h => {
    await h.tab('home'); await h.say(0); await h.tap('#syncBadge', 'the badge'); await h.hold(2000); await h.closeSheet();
    await h.say(1); await h.tap('#app [data-act="rsvp"][data-v="maybe"]', 'an answer with no signal'); await h.hold(1500);
    await h.say(2); await h.go('#/settings'); await h.hold(1800);
  },
  sessions: async h => {
    await h.say(0); await h.go('#/sessions'); await h.hold(1800); await h.scroll(300); await h.hold(1200);
    await h.tap('#app [data-act="sessbook"]', 'Ask for a place'); await h.hold(1500); await h.closeSheet();
    await h.say(1);
  },

  team: async h => {
    await h.go('#/team/sbA/season');
    await h.go('#/team/sbA/squad'); await h.say(0);
    await h.scroll(600); await h.type('#newNum', '14'); await h.type('#newName', 'Ella Moreno'); await h.tap('#app [data-act="addplayer"]', 'Add'); await h.hold(1500);
    await h.say(1); await h.go('#/settings'); await h.scroll(500); await h.hold(1800);
    await h.say(2); await h.go('#/team/sbA/season'); await h.tap('#app [data-act="newmatch"]', 'Add a game'); await h.hold(800);
    await h.type('#mOpp', 'Riverside United'); await h.hold(1500); await h.closeSheet();
    await h.say(3); await h.tab('calendar'); await h.tap('#app [data-act="calnew"]', 'the +'); await h.hold(2200); await h.closeSheet();
  },
  families: async h => {
    await h.go('#/team/sbA/season');
    await h.go('#/team/sbA/squad'); await h.say(0);
    await h.tap('#app [data-act="joinnew"]', 'Make a team link'); await h.hold(1200);
    await h.tap('#app [data-act="copylink"]', 'Copy the link', true); await h.hold(1200);
    await h.say(1); await h.scroll(-300); await h.hold(1200);
    await h.say(2);
  },
  lineup: async h => {
    await h.go('#/team/sbA/season');
    await h.say(0); await h.tab('game'); await h.tap('#app [data-act="navgame"]', 'the next game');
    await h.tap('#subtabs [data-gview="plan"]', 'Lineup'); await h.hold(800);
    if (await h.tap('#app [data-act="editmatch"]', 'Pick a shape', true)) { await h.pick('#mShape', 'preset:'); await h.hold(800); await h.tap('#sheet [data-act="savematch"]', 'Save changes'); await h.hold(800); await h.tap('#subtabs [data-gview="plan"]', 'Lineup'); }
    await h.say(1); await h.tap('#app [data-act="snapstart"]', 'Plan kick-off'); await h.hold(1200);
    await h.tap('#sheet [data-checked="1"]', 'Plan for n players'); await h.hold(1200);
    await h.tap('#sheet [data-act="snapplayer"]', 'the first player'); await h.hold(1000);
    await h.tap('#sheet [data-act="snapplayer"]', 'the next player'); await h.hold(1000);
    await h.closeSheet(); await h.hold(1200);
    await h.say(2); await h.tap('#app [data-act="snapadd"]', 'Add the next change'); await h.hold(1500); await h.closeSheet();
    await h.say(3); await h.tap('#app [data-act="planlock"]', 'Lock in'); await h.hold(1800);
    await h.say(4); await h.scroll(300); await h.hold(1500);
  },
  sideline: async h => {
    await h.say(0); await h.tab('game'); await h.tap('#app [data-act="navgame"]', 'the game being played', true);
    await h.tap('#subtabs [data-gview="track"]', 'Track'); await h.hold(800);
    await h.tap('#app [data-act="pause"]', 'Pause'); await h.hold(900); await h.tap('#app [data-act="start"]', 'Resume'); await h.hold(900);
    await h.say(1); await h.tap('#app [data-act="goal"][data-side="us"]', 'Goal'); await h.hold(1200);
    await h.tap('#app [data-act="shot"]', 'a shot'); await h.hold(900);
    await h.say(2); await h.tap('#subtabs [data-gview="subs"]', 'Subs'); await h.hold(800);
    await h.tap('#app .liverow[data-on="0"] [data-act="taplive"]', 'a player on the bench'); await h.hold(1200);
    await h.tap('#sheet [data-act="taplive"][data-with]', 'who she replaces'); await h.hold(1800);
    await h.say(3); await h.tap('#subtabs [data-gview="track"]', 'Track'); await h.tap('#app [data-act="trackfull"]', 'Full screen'); await h.hold(1200);
    await h.tap('#app [data-act="undolast"]', 'Undo last'); await h.hold(1500); await h.tap('#app [data-act="trackexit"]', 'Exit full screen');
    await h.say(4);
  },
  after: async h => {
    await h.go('#/team/sbA/season');
    await h.say(0); await h.go('#/team/sbA/season'); await h.tap('#app [data-act="gotoplayer"], #app [data-act="openmatch"]', 'the last game'); await h.hold(800);
    await h.tap('#subtabs [data-gview="recap"]', 'Recap'); await h.scroll(400); await h.hold(1500);
    await h.say(1); await h.tap('#subtabs [data-gview="stats"]', 'Stats'); await h.hold(1500); await h.tap('#subtabs [data-gview="live"]', 'Log'); await h.hold(1500);
    await h.say(2); await h.tap('#app [data-act="fixclock"]', 'Clock reading wrong?'); await h.hold(2200); await h.closeSheet();
    await h.say(3); await h.go('#/team/sbA/minutes'); await h.hold(2000);
  },
  practice: async h => {
    await h.go('#/team/sbA/season');
    await h.say(0); await h.go('#/team/sbA/practice'); await h.hold(800); await h.tap('#app [data-act="practab"][data-k="drills"]', 'Drills'); await h.hold(1000);
    await h.tap('#app .drillrow', 'a drill'); await h.hold(2200); await h.closeSheet();
    await h.say(1); await h.tab('calendar'); await h.tap('#app [data-act="calitem"][data-k="practice"]', 'the practice'); await h.hold(800);
    await h.tap('#sheet [data-act="pracfromcal"]', 'Plan'); await h.hold(2200);
    await h.say(2); await h.tab('more'); await h.tap('#sheet [data-act="moredrills"]', 'Drills'); await h.hold(1800);
    await h.say(3); await h.go('#/team/sbA/season'); await h.scroll(500); await h.hold(1500);
  },
  register: async h => {
    await h.go('#/team/sbA/season'); await h.say(0); await h.tap('#app [data-act="attend"]', 'Who came?', true);
    await h.say(1); await h.go('#/team/sbA/attendance'); await h.hold(1500);
    await h.tab('calendar'); await h.tap('#app [data-act="calpast"]', 'Earlier'); await h.hold(600);
    await h.tap('#app [data-act="calitem"][data-k="practice"]', 'a past practice'); await h.hold(800);
    await h.tap('#sheet [data-act="attend"]', 'Take attendance'); await h.hold(800);
    await h.tap('#sheet [data-act="attmark"]', 'a player'); await h.hold(600); await h.tap('#sheet [data-act="attmark"]:nth-of-type(2)', 'another'); await h.hold(600);
    await h.tap('#sheet [data-act="attsave"]', 'Save'); await h.hold(1500);
    await h.say(2);
  },
  club: async h => {
    await h.go('#/settings'); await h.say(0); await h.scroll(700); await h.hold(1500);
    await h.say(1); await h.tap('#app [data-act="goview"][data-v="people"]', 'People'); await h.hold(1500); await h.tap('#app [data-act="invitenew"]', 'Invite someone'); await h.hold(1800); await h.closeSheet();
    await h.say(2); await h.go('#/club/scheduler'); await h.hold(2500);
    await h.say(3); await h.go('#/settings'); await h.tap('#app [data-act="readysheet"]', 'Check readiness'); await h.hold(2000); await h.closeSheet();
    await h.say(4); await h.tap('#app [data-act="backupsheet"]', 'Backup'); await h.hold(2000); await h.closeSheet();
  }
};
