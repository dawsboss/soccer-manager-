/* Drives the real app in Chromium at phone size as one persona, with the
   club's database unreachable (a phone with no signal: the app draws from
   its own copy) and the clock fixed, and captures every step: a viewport
   screenshot, a full-page one, the screen's HTML, and an inventory of every
   tappable thing (label, class, action, size, colours).

   node shoot.js <personas.json> <persona> <outDir> [tour]                     */
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node-tools/node_modules/playwright'); } })();
const fs = require('fs'), path = require('path');
const [, , pfile, persona, outDir, tourName = 'family'] = process.argv;
const P = JSON.parse(fs.readFileSync(pfile, 'utf8'));
const seed = P.personas[persona];
if (!seed) { console.error('no persona', persona); process.exit(1); }
fs.mkdirSync(outDir, { recursive: true });
const BASE = 'http://127.0.0.1:8765/index.html';

const INVENTORY = () => {
  const regionOf = el => {
    for (const id of ['sheet', 'tabbar', 'titlebar', 'tabs', 'subtabs', 'app']) { const r = document.getElementById(id); if (r && r.contains(el)) return id; }
    if (document.querySelector('.topbar') && document.querySelector('.topbar').contains(el)) return 'topbar';
    return 'other';
  };
  const vis = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('[hidden]'); };
  const out = [];
  for (const el of document.querySelectorAll('button, a[href], [role="button"], input, select, textarea, [data-act], summary, label.field')) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    const label = el.getAttribute('aria-label');
    out.push({
      tag: el.tagName.toLowerCase(), text: (el.innerText || el.value || el.placeholder || '').replace(/\s+/g, ' ').trim().slice(0, 100),
      aria: label || '', cls: typeof el.className === 'string' ? el.className : '', act: (el.dataset && el.dataset.act) || '',
      href: el.getAttribute('href') || '', pressed: el.getAttribute('aria-pressed') || el.getAttribute('aria-current') || '',
      region: regionOf(el), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      font: cs.fontSize, weight: cs.fontWeight, color: cs.color, bg: cs.backgroundColor, border: cs.borderTopWidth + ' ' + cs.borderTopStyle + ' ' + cs.borderTopColor, radius: cs.borderTopLeftRadius
    });
  }
  return out;
};
const SNAP = () => {
  const g = id => { const el = document.getElementById(id); return el && !el.hidden && getComputedStyle(el).display !== 'none' ? el.innerHTML : ''; };
  const toast = document.getElementById('toast');
  return {
    hash: location.hash, title: document.title, body: { ...document.body.dataset },
    topbar: (document.querySelector('.topbar-main') || {}).innerText || '',
    titlebar: g('titlebar'), tabs: g('tabs'), subtabs: g('subtabs'), app: g('app'), tabbar: g('tabbar'), sheet: g('sheet'),
    toast: toast && !toast.hidden ? toast.innerText : '', docHeight: document.documentElement.scrollHeight
  };
};

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'en-US', timezoneId: 'UTC' });
  // the club's database and Google's auth servers out of reach; the SDK itself and the fonts load
  await ctx.route(/firebaseio\.com|firebasedatabase\.app|googleapis\.com\/(identitytoolkit|securetoken)|cloudfunctions\.net|fcmregistrations/, r => r.abort());
  /* route() never sees a WebSocket, and the database SDK talks over one: when the network let it
     through, the real club refused the invented account and every screen after the first was the
     lock screen. Close it too (Playwright 1.48 and later). */
  if (ctx.routeWebSocket) await ctx.routeWebSocket(/firebaseio\.com|firebasedatabase\.app/, ws => ws.close());
  await ctx.addInitScript(({ seed }) => {
    if (!localStorage.getItem('__seeded')) { for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v); localStorage.setItem('__seeded', '1'); }
    Object.defineProperty(navigator, 'onLine', { get: () => false });
  }, { seed });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(P.NOW);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  const manifest = [];
  let n = 0;
  const capture = async (name, note) => {
    await page.waitForTimeout(350);
    const id = String(++n).padStart(2, '0') + '-' + name;
    const snap = await page.evaluate(SNAP);
    const inv = await page.evaluate(INVENTORY);
    await page.screenshot({ path: path.join(outDir, id + '.png') });
    let full = '';
    if (snap.docHeight > 860 && !snap.sheet) { full = id + '-full.png'; await page.screenshot({ path: path.join(outDir, full), fullPage: true }); }
    fs.writeFileSync(path.join(outDir, id + '.json'), JSON.stringify({ step: name, note, ...snap, inventory: inv }, null, 1));
    manifest.push({ id, step: name, note, hash: snap.hash, png: id + '.png', full, json: id + '.json', toast: snap.toast, sheet: !!snap.sheet, tappables: inv.length });
    console.log(id, snap.hash, snap.toast ? 'toast: ' + snap.toast : '', snap.sheet ? '(sheet)' : '');
  };
  const tap = async (sel, what) => {
    try { await page.click(sel, { timeout: 2500 }); return true; }
    catch (e) { manifest.push({ miss: sel, what, at: n }); console.log('  missing:', sel, what || ''); return false; }
  };
  const tapText = async (text, what) => {
    try { await page.getByRole('button', { name: text, exact: false }).first().click({ timeout: 2500 }); return true; }
    catch (e) { manifest.push({ miss: 'text:' + text, what, at: n }); console.log('  missing text:', text); return false; }
  };
  const closeSheet = async () => {
    try { await page.evaluate(() => { const s = document.getElementById('sheet'); if (s && !s.hidden) document.getElementById('scrim').click(); }); await page.waitForTimeout(250); } catch (e) { }
    try { if (await page.evaluate(() => { const s = document.getElementById('sheet'); return s && !s.hidden; })) { await page.goBack(); await page.waitForTimeout(250); } } catch (e) { }
  };
  const tab = k => tap(`#tabbar [data-tab="${k}"]`, 'tab ' + k);
  const go = async hash => { await page.goto(BASE + hash); await page.waitForTimeout(600); };

  await page.goto(BASE);
  await page.waitForTimeout(1800);

  const TOURS = {
    landing: async () => { await capture('landing', 'what the app opens on'); },
    // the four screens most people open, one capture each, for a visual pass
    look: async () => {
      await tap('[data-act="roleok"]');
      if (persona === 'jaz') await go('#/team/sbA/season');
      await tab('home'); await capture('home', 'Home');
      await tab('calendar'); await capture('calendar', 'the Calendar');
      if (persona === 'jaz' || persona === 'boss') { await go('#/team/sbA/squad'); await capture('players', 'Players'); }
      await go('#/club'); await capture('club-home', 'Club home');
    },
    // the Scheduler (SCHEDULER.md, build 163): the board as an admin or a coach
    scheduler: async () => {
      await tap('[data-act="roleok"]');
      await go('#/club/scheduler'); await capture('scheduler', 'the Scheduler: the board, this week');
      if (await tap('#app [data-act="schfield"]:not([aria-pressed="true"])', 'another field')) await capture('scheduler-field-2', 'the board, another field');
      if (await tap('#app [data-act="schweek"][data-v="1"]', 'the week after')) await capture('scheduler-next-week', 'the board, the week after');
      if (await tap('#app [data-act="schneed"]', 'a team row')) { await capture('scheduler-needs', 'a team\'s needs sheet'); await closeSheet(); }
      // placing (build 164): pick a team, tap a half hour, place it
      if (await tap('#app [data-act="schpick"]:not([aria-pressed="true"])', 'a team chip to place')) {
        await capture('scheduler-picking', 'a team picked: every half hour is a place to tap');
        if (await tap('#app [data-act="schcell"][data-wd="1"][data-t="19:00"]', 'Tuesday 7pm')) {
          await capture('scheduler-place-sheet', 'the place sheet: pitch, what warns, Place it');
          if (await tap('#sheet [data-act="schplacego"]', 'Place it')) await capture('scheduler-placed', 'a block placed, dotted, not written yet');
          else await closeSheet();
        }
        if (await tap('#app [data-act="schcell"][data-wd="4"][data-t="18:00"]', 'Friday 6pm, when the field is closed')) { await capture('scheduler-refused', 'a cell that refuses'); await closeSheet(); }
        await tap('#app [data-act="schpick"][data-v=""]', 'Done');
      }
      if (await tap('#app .tg-board .tg-ev[data-draft="1"]', 'the draft block')) { await capture('scheduler-draft-sheet', 'the draft block\'s sheet: move, lock, take off'); await closeSheet(); }
      if (await tap('#app [data-act="schterm"]', 'The term…')) { await capture('scheduler-term', 'the term sheet'); await closeSheet(); }
      if (await tap('#app .tg-board .tg-ev', 'a block on the board')) { await capture('scheduler-block', 'a block opened: the entry\'s sheet'); await closeSheet(); }
      for (const k of ['find', 'coach', 'pic']) { if (await tap(`[data-act="pltab"][data-k="${k}"]`, 'tab ' + k)) await capture('scheduler-' + k, 'the ' + k + ' tab'); }
      await tab('more'); if (await tap('#sheet [data-act="goview"][data-v="setup"]', 'Settings')) await capture('settings', 'Settings, with the Scheduler row');
    },
    anon: async () => {
      await capture('welcome', 'a phone that has never opened a club, signed out');
      await tapText('Sign in'); await capture('signin-sheet', 'the sign-in sheet');
      await closeSheet();
      await go('#/calendar'); await capture('welcome-calendar-link', 'a link to the calendar, signed out');
    },
    family: async () => {
      await capture('home-first', 'Home, first open on this phone (role card)');
      if (await tap('[data-act="roleok"]', 'Got it')) await capture('home', 'Home after Got it');
      if (await tap('[data-act="fansheet"]', 'Fans button on the child card')) { await capture('fans-sheet', 'her child\'s fans'); await closeSheet(); }
      // the next-up card: its buttons, its sheet, and the answer chips
      if (await tap('.calnext [data-act="caladd"]', 'Add to my calendar on the next-up card')) { await capture('nextup-sheet', 'Add to your calendar, from the next-up card'); await closeSheet(); }
      if (await tap('#app [data-act="rsvp"][data-v="no"]', 'Not going chip on Home')) { await capture('home-rsvp-no', 'after tapping Not going on Home'); await tap('#app [data-act="rsvp"][data-v="no"]', 'Not going again (take back)'); }
      if (await tap('#app [data-act="calgame"]', 'Open the game on the Next game card')) { await capture('next-game-live', 'the next game opened from Home: Live'); await tap('#subtabs [data-gview="stats"]'); await capture('next-game-stats', 'the next game: Stats'); }
      if (await tap('[data-act="gamemenu"]', 'the game\'s ⋯ menu')) { await capture('game-menu', 'the ⋯ menu'); if (await tap('[data-act="sharesheet"]', 'Share')) { await capture('game-share', 'the Share sheet'); } await closeSheet(); }
      if (await tap('[data-act="pickgame"]', 'Which game (the title)')) { await capture('game-picker', 'tapping the game title'); await closeSheet(); }
      if (await tap('[data-act="backgames"]', 'the game\'s back arrow')) await capture('game-back', 'where the game\'s back arrow lands');
      // the last game: recap, stats, log
      await tab('home');
      if (await tap('[data-act="gotoplayer"]', 'Last game row on the child card')) {
        await capture('last-game', 'the last game from her child\'s card');
        if (await tap('#subtabs [data-gview="stats"]')) await capture('last-game-stats', 'Stats of the last game');
        if (await tap('#subtabs [data-gview="live"]')) await capture('last-game-log', 'the Log of the last game');
        if (await tap('#subtabs [data-gview="recap"]')) await capture('last-game-recap', 'the Recap of the last game');
      }
      // the Game tab itself
      await tab('game'); await capture('game-tab', 'the Game tab'); await closeSheet();
      // the calendar
      await tab('calendar'); await capture('calendar', 'the Calendar (schedule)');
      if (await tap('[data-act="caltree"]', 'Calendars ▾')) { await capture('calendar-calendars', 'the Calendars panel open'); await tap('[data-act="caltree"]'); }
      if (await tap('[data-act="calmini"]', 'the month title')) { await capture('calendar-month-picker', 'the month picker open'); await tap('[data-act="calmini"]'); }
      for (const v of ['day', 'week', 'month']) { if (await tap(`[data-act="calview"][data-v="${v}"]`, 'view ' + v)) await capture('calendar-' + v, 'the ' + v + ' view'); }
      await tap('[data-act="calview"][data-v="schedule"]');
      if (await tap('#app [data-act="calitem"][data-k="practice"]', 'a practice row')) {
        await capture('practice-sheet', 'a practice\'s sheet from the calendar');
        if (await tap('#sheet [data-act="rsvp"][data-v="no"]', 'Not going in the sheet')) { await capture('practice-sheet-no', 'after Not going in the sheet'); await tap('#sheet [data-act="rsvp"][data-v="no"]'); }
        if (await tap('#sheet [data-act="calics"]', 'Apple or Outlook')) await capture('practice-sheet-ics', 'after Apple or Outlook');
        await closeSheet();
      }
      if (await tap('#app [data-act="calitem"][data-k="game"]', 'a game row')) { await capture('game-sheet', 'a game\'s sheet from the calendar'); await closeSheet(); }
      if (await tap('#app [data-act="calitem"][data-k="event"]', 'an event row')) { await capture('event-sheet', 'an event\'s sheet from the calendar'); await closeSheet(); }
      if (await tap('#app [data-act="calpast"]', 'Earlier (n)')) await capture('calendar-earlier', 'Earlier opened');
      // messages
      if (await tab('messages')) {
        await capture('messages', 'Messages');
        if (await tap('[data-act="thread"]', 'the conversation with the coaches')) { await capture('thread', 'her conversation with the coaches'); if (await tap('[data-act="msgprivacy"]', 'How private?')) { await capture('thread-privacy', 'the privacy sheet'); await closeSheet(); } await tap('[data-act="inbox"]'); }
      }
      // more, and everything under it
      await tab('more'); await capture('more', 'the More sheet');
      if (await tap('#sheet [data-act="goview"][data-v="notes"]', "What's new")) await capture('whats-new', "What's new");
      await tab('more'); if (await tap('#sheet [data-act="goview"][data-v="club"]', 'Club home')) await capture('club-home', 'Club home');
      if (await tap('#app [data-act="goteam"]', 'a team card on Club home')) await capture('club-home-team', 'a team opened from Club home');
      await tab('more'); if (await tap('#sheet [data-act="goview"][data-v="sessions"]', 'Sessions')) await capture('sessions', 'Sessions'); else await closeSheet();
      await tab('more'); if (await tap('#sheet [data-act="goview"][data-v="setup"]', 'Settings')) await capture('settings', 'Settings');
      if (await tap('#app [data-act="signinsheet"]', 'the You row')) { await capture('settings-you', 'the You row'); await closeSheet(); }
      await tap('#avatar', 'the avatar'); await capture('account-sheet', 'the account sheet'); await closeSheet();
      await tap('#syncBadge', 'the sync badge'); await capture('sync-badge-tap', 'after tapping the sync badge'); await closeSheet();
      await tap('#titlebar [data-act="clubswitch"]', 'the club name in the title'); await capture('club-switch', 'after tapping the club name'); await closeSheet();
      await tab('home'); await tap('#titlebar [data-act="teammenu"]', 'the team name in the title'); await capture('team-menu', 'after tapping the team name'); await closeSheet();
      // links in
      await go('#/invite/abc123'); await capture('invite-link', 'an invite link opened with no signal');
      await go('#/messages'); await capture('link-messages', 'a link to messages');
      await go('#/my-players'); await capture('link-my-players', 'the old My players address');
    },
    live: async () => {
      await capture('home-live', 'Home while a game is being played');
      await tap('[data-act="roleok"]');
      await tab('game'); await capture('game-live', 'the Game tab during a game: Live');
      if (await tap('[data-act="feedfollow"]', 'Notify me')) await capture('game-live-follow', 'after Notify me');
      await tap('#subtabs [data-gview="stats"]'); await capture('game-live-stats', 'Stats during a game');
      await tab('calendar'); await capture('calendar-live', 'the Calendar during a game');
      await tap('[data-act="calview"][data-v="month"]'); await capture('calendar-live-month', 'Month during a game');
      await tab('home'); await tap('[data-act="gotoplayer"]', 'Playing now row'); await capture('playing-now-row', 'Playing now from the child card');
    },
    /* The coach subbing (build 176): the list and the pitch, and the sheet
       either opens, the one way to pair two players. Run on live.json as jaz. */
    subs: async () => {
      await tap('[data-act="roleok"]');
      await tab('game'); await closeSheet();
      await capture('subs', 'Subs, the list: no Goal taps, no pick bar');
      if (await tap('#app .liverow[data-on="1"] [data-act="taplive"]', 'a player on the pitch')) { await capture('subs-sheet-off', 'her sheet: who takes her place'); await closeSheet(); }
      if (await tap('#app .liverow[data-on="0"] [data-act="taplive"]', 'a player on the bench')) { await capture('subs-sheet-on', 'her sheet: who she replaces'); await closeSheet(); }
      await tap('[data-act="opengview"][data-v="pitch"]', 'Pitch'); await capture('pitch', 'the Pitch look');
      if (await tap('#pitch .token', 'a token')) { await capture('pitch-sheet-off', 'the sheet from a token: the mock pitch, her spot a ?'); await closeSheet(); }
      if (await tap('#app .prow[data-on="0"][data-act="taplive"]', 'a bench row')) { await capture('pitch-sheet-on', 'the sheet from the bench: the mock pitch, every token tappable'); await closeSheet(); }
    },
    staff: async () => {
      await capture('home-first', 'Home as this role');
      await tap('[data-act="roleok"]');
      await tab('home'); await capture('home', 'Home');
      await tab('game'); await capture('game', 'Game'); await closeSheet();
      if (await tap('#sheet [data-act="navgame"], #sheet .opt', 'first game in the picker')) await capture('game-picked', 'the game picked'); await closeSheet();
      await tab('calendar'); await capture('calendar', 'Calendar');
      if (await tap('#app [data-act="calitem"][data-k="practice"]', 'a practice row')) { await capture('practice-sheet', 'a practice sheet'); await closeSheet(); }
      await tab('messages'); await capture('messages', 'Messages'); await closeSheet();
      await tab('more'); await capture('more', 'More');
      if (await tap('#sheet [data-act="goview"][data-v="setup"]')) await capture('settings', 'Settings');
    }
  };
  await TOURS[tourName]();
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify({ persona, tour: tourName, NOW: P.NOW, scen: P.scen, steps: manifest, errors }, null, 1));
  console.log('errors:', errors.length, errors.slice(0, 5));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
