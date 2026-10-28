/* How to: the tutorial (build 192).

   The owner, 2026-10-26: "a tutorial for the site ... to help new, tech
   incapable, and coaches of all sizes". It is a screen under More, *How to*,
   at #/how-to: short topics picked for what she is in the club, each a few
   numbered steps in the glossary's words, with a button on a step that names
   a screen which goes there through the one click handler. This suite pins:
   which topics each kind of account gets (a parent is never shown the clock,
   a tracker never the lineup, only an admin the club); that no page of it
   carries a banned word, a child's name, a club's or a team's, or a pronoun
   for the reader; that every step's button is an action the handler has and,
   tapped as that role, lands on a screen with no refusal; that the way to it
   is on More, on Settings → You and on the role card; the address and the
   back arrow; and that a locked device draws none of it. */

const fs = require('fs');
const path = require('path');
const H = require('./harness');
const { check } = H;

const GLOSSARY = fs.readFileSync(path.join(__dirname, '..', 'GLOSSARY.md'), 'utf8');
const section = head => (GLOSSARY.split(new RegExp('^## ' + head + '\\s*$', 'm'))[1] || '').split(/^## /m)[0];
const banned = [...section('Never on screen').matchAll(/^- `([^`]+)`/gm)].map(m => m[1]);

// a config, so gated() is true and every role check bites (visibility.js says why)
const A = H.loadApp({ storage: { 'sm.workspace': 'CLUB' }, config: { apiKey: 'k', databaseURL: 'https://x.test' } });
A.fb = { db: {}, ref: (db, p) => p, set: () => Promise.resolve(), remove: () => Promise.resolve() };

const NOW = Date.now();
const club = () => ({
  teams: {
    t1: { id: 't1', name: 'G14 Flight', birthYear: 2012,
      players: {
        p1: { id: 'p1', name: 'Rosa Delgado', number: '7', guardians: { mum: true } },
        p2: { id: 'p2', name: 'Mia Kowalski', number: '4' }
      },
      events: { e1: { id: 'e1', kind: 'practice', title: 'Practice', date: '2026-10-28', start: '18:00', end: '19:00', venue: 'Lakeside Park' } } },
    t2: { id: 't2', name: 'G12 Storm', players: { k1: { id: 'k1', name: 'Zoe Hart', number: '4' } } }
  },
  matches: {
    g1: { id: 'g1', teamId: 't1', opponent: 'Riverside', date: '2026-10-31', kickoff: '10:00', periodCount: 2, periodMinutes: 30, onFieldCount: 7, currentHalf: 1, periods: {}, stints: {}, createdAt: 2 }
  },
  access: {
    org: { name: 'Lakeside SC' },
    admins: { boss: true },
    teams: { t1: { coaches: { jaz: true }, trackers: { trk: true }, helpers: { hal: 'inv1' } }, t2: { coaches: { other: true } } },
    index: { boss: true, jaz: true, trk: true, hal: true, mum: true, other: true },
    teamIndex: { t1: { jaz: 'coach', trk: 'tracker', hal: 'helper' }, t2: { other: 'coach' } },
    teamParents: { t1: { mum: 'p1' } },
    helperIndex: { hal: 't1' },
    members: { boss: { name: 'Ada' }, jaz: { name: 'Jaz' }, trk: { name: 'Tom' }, hal: { name: 'Hal' }, mum: { name: 'Mo' } }
  }
});
const ROLES = { boss: 'an admin', jaz: 'a coach', trk: 'a tracker', hal: 'an assistant coach', mum: 'a parent' };

function as(uid, view = 'guide', topic = null) {
  A.state = club();
  A.me = uid ? { uid, name: uid, email: uid + '@x.test' } : null;
  A.appOwners = {};
  A.ui.teamId = 't1'; A.ui.matchId = null; A.ui.view = view; A.ui.howto = topic; A.ui.editFid = null;
  A.toasts.length = 0;
  A.closeSheet();
  A.render();
  return page();
}
const page = () => A.rendered();
const sheet = () => String(A.dom.node('#sheet').innerHTML || '');
const text = html => String(html).replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ');
const wordRe = w => new RegExp('(^|[^\\w])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w-])');
const ids = () => A.howtoTopics().map(t => t.id).join(' ');

/* ---------------- the topics, by role ---------------- */

console.log('--- which topics each kind of account gets ---');
{
  as('boss');
  check('an admin: everything but a family\'s answer', ids(), 'around home follow calendar messages notify homescreen offline team families lineup sideline after practice register club sessions');
  as('jaz');
  check('a coach: her team, the families, the lineup, the sideline, practices and the register; never the club', ids(), 'around home follow calendar messages notify homescreen offline team families lineup sideline after practice register sessions');
  as('trk');
  check('a tracker: the sideline and after, never the lineup, the team or the club', ids(), 'around home follow calendar messages notify homescreen offline sideline after');
  as('hal');
  check('an assistant coach: the lineup, after, practices and the register, never the clock', ids(), 'around home follow calendar messages notify homescreen offline lineup after practice register');
  as('mum');
  check('a parent: coming, following, the calendar, messages, and sessions', ids(), 'around home coming follow calendar messages notify homescreen offline sessions');
  check('— and her messages topic says Message the coaches, never New message', (t => /Message the coaches/.test(t) && !/New message/.test(t))(A.howtoTopics().find(t => t.id === 'messages').steps.map(s => s.say).join(' ')), true);
  as('trk');
  check('— the tracker\'s sideline has no Subs step', A.howtoTopics().find(t => t.id === 'sideline').steps.some(s => /^Subs:/.test(s.say)), false);
  as('jaz');
  check('— the coach\'s has', A.howtoTopics().find(t => t.id === 'sideline').steps.some(s => /^Subs:/.test(s.say)), true);
  check('every topic has a title, a line and at least three steps', A.HOWTO.every(t => t.title && t.lead && t.steps.length >= 3), true);
  check('every id is unique', new Set(A.HOWTO.map(t => t.id)).size, A.HOWTO.length);
  // a step names a button by the word on the screen: Live's follow button is Buzz me (UX-REVIEW-3.md, 16.4), and the guide said Notify me (UX-REVIEW-4.md, 25.4)
  check('Follow a game names the button as Live does: Buzz me, never Notify me', A.HOWTO.find(t => t.id === 'follow').steps.some(s => /Buzz me/.test(s.say)) && !A.HOWTO.some(t => t.steps.some(s => /Notify me/.test(s.say))), true);
  // the door switch is explained to whoever has it (UX-REVIEW-4.md, 24.1), and to nobody else
  as('mum');
  check('a parent\'s Finding your way around says what the Sessions pill does', A.howtoTopics().find(t => t.id === 'around').steps.some(s => /Sessions or Teams, switches/.test(s.say)), true);
  as('trk');
  check('— a tracker, who has no door, is not told about one', A.howtoTopics().find(t => t.id === 'around').steps.some(s => /Sessions or Teams, switches/.test(s.say)), false);
}

/* ---------------- every page, as every role ---------------- */

console.log('\n--- no banned word, no name and no pronoun for the reader on any page ---');
{
  const bad = [];
  const names = ['Rosa', 'Delgado', 'Mia', 'Kowalski', 'Zoe', 'Hart', 'Lakeside', 'Flight', 'Storm', 'Riverside'];
  const pron = /(^|[^\w])(she|her|hers|he|him|his)(?![\w-])/i;
  let drawn = 0;
  for (const uid of Object.keys(ROLES)) {
    const h = as(uid);
    const look = (name, html) => {
      drawn++;
      const t = text(html);
      for (const w of banned) if (wordRe(w).test(t)) bad.push(`${uid}/${name}: "${w}"`);
      for (const n of names) if (wordRe(n).test(t)) bad.push(`${uid}/${name}: "${n}"`);
      if (pron.test(t)) bad.push(`${uid}/${name}: "${(t.match(new RegExp('.{0,30}' + pron.source + '.{0,30}', 'i')) || [''])[0].trim()}"`);
    };
    look('list', h);
    check(`${ROLES[uid]}: the list is a card of rows with a chevron, one per topic`, (h.match(/class="prow go"[^>]*data-act="howto" data-k="/g) || []).length, A.howtoTopics().length);
    for (const t of A.howtoTopics()) {
      A.click({ act: 'howto', k: t.id });
      look(t.id, page());
      check(`— ${t.id} drawn as numbered steps`, A.ui.view === 'guide' && A.ui.howto === t.id && (page().match(/<span class="hownum">\d+<\/span>/g) || []).length, t.steps.length);
    }
  }
  check('pages drawn', drawn >= 60, true);
  check('— and none carries a banned word, a name, or she/he for the reader', bad.join('; ') || 'none', 'none');
  if (bad.length) console.log('     ' + bad.join('\n     '));
}

/* ---------------- every step's button ---------------- */

console.log('\n--- every step\'s button is a real tap, and lands as that role ---');
{
  const src = fs.readFileSync(H.APP_PATH, 'utf8');
  const acts = new Set(A.HOWTO.flatMap(t => t.steps).filter(s => s.go).map(s => s.go.act));
  check('every button is an action the click handler has', [...acts].filter(a => !src.includes(`a === '${a}'`)).join(', ') || 'all', 'all');
  const bad = [];
  let taps = 0;
  for (const uid of Object.keys(ROLES)) {
    as(uid);
    for (const t of A.howtoTopics()) for (const s of t.steps) {
      if (!s.go) continue;
      as(uid, 'guide', t.id);
      const btn = new RegExp(`<button class="btn quiet sm" type="button" data-act="${s.go.act}"[^>]*>${s.label.replace(/[’']/g, '.')}</button>`);
      if (!btn.test(page())) { bad.push(`${uid}/${t.id}: no "${s.label}" button drawn`); continue; }
      A.click({ ...s.go });
      taps++;
      const toast = A.lastToast();
      if (toast) { bad.push(`${uid}/${t.id} ${s.label}: "${toast}"`); continue; }
      if (s.go.act === 'tab' && s.go.tab === 'more') { if (!/<h3>More<\/h3>/.test(sheet())) bad.push(`${uid}/${t.id} ${s.label}: More did not open`); continue; }
      if (A.ui.view === 'guide') bad.push(`${uid}/${t.id} ${s.label}: still on How to`);
      // a screen the role may not have is swapped by render(); the button then promised something else
      const went = { tab: { home: ['season', 'club'], calendar: ['calendar'], game: ['games', 'game'] }[s.go.tab], goview: [s.go.v], moredrills: ['practice'] }[s.go.act];
      if (went && !went.includes(A.ui.view)) bad.push(`${uid}/${t.id} ${s.label}: landed on ${A.ui.view}`);
    }
  }
  check('buttons tapped', taps >= 40, true);
  check('— each lands where it says, with no refusal', bad.join('; ') || 'none', 'none');
  if (bad.length) console.log('     ' + bad.join('\n     '));
  check('a step with no screen to go to has no button', (as('mum', 'guide', 'homescreen'), /class="btn quiet sm"/.test(page())), false);
}

/* ---------------- the ways to it ---------------- */

console.log('\n--- the way to it: More, Settings → You, and the role card ---');
{
  for (const uid of Object.keys(ROLES)) {
    as(uid, 'season'); A.sheetMore();
    check(`${ROLES[uid]}: How to use TeamPlayHQ is a row on More`, /data-act="howto"><b>How to use TeamPlayHQ<\/b>/.test(sheet()), true);
    A.closeSheet();
    const h = as(uid, 'setup');
    check(`— and a card under Settings → You`, /<h2 class="sechead">You<\/h2>[\s\S]*?data-act="howto"[\s\S]*?<b>How to use TeamPlayHQ<\/b>/.test(h.split('<h2 class="sechead">Notifications')[0]), true);
  }
  as('jaz', 'season'); A.sheetMore(); A.click({ act: 'howto' });
  check('tapping the row opens the list and closes More', A.ui.view + ' ' + A.ui.howto + ' ' + A.dom.node('#sheet').hidden, 'guide null true');
  const h = as('trk', 'season');
  check('the tracker\'s role card carries Show me how beside Got it', /rolecard[\s\S]*?data-act="howto">Show me how<\/button><button class="linkbtn dark" data-act="roleok"/.test(h), true);
  A.click({ act: 'howto' });
  check('— which opens the list, with the card still waiting for Got it', A.ui.view === 'guide' && !A.roleCardSeen('tracker'), true);
  check('a parent\'s Home carries no role card, so her way in is More', /rolecard/.test(as('mum', 'season')), false);
}

/* ---------------- the address, Next and Back ---------------- */

console.log('\n--- the address, Next, and the back arrow ---');
{
  as('mum', 'guide', 'coming');
  check('a topic has an address of its own', A.uiToHash(), '#/how-to/coming');
  A.ui.howto = null;
  check('— the list too', A.uiToHash(), '#/how-to');
  global.location.hash = '#/how-to/coming'; A.ui.view = 'nowhere'; A.ui.howto = null;
  check('#/how-to/coming puts the topic back', A.hashToUi() && A.ui.view + ' ' + A.ui.howto, 'guide coming');
  global.location.hash = '#/how-to/nope'; A.hashToUi();
  check('a topic that is not one lands on the list', A.ui.view + ' ' + A.ui.howto, 'guide null');
  global.location.hash = '#/how-to/club'; A.hashToUi(); A.render();
  check('a topic that is not hers (the club, to a parent) draws the list', A.ui.howto === null && /<h2>How to<\/h2>/.test(page()), true);
  global.location.hash = '';
  as('mum', 'guide', 'coming');
  check('the back arrow on a topic goes to the list, and says so', A.upView() + ' · ' + (page => (A.rendered('#titlebar').match(/aria-label="([^"]*)"/) || [])[1])(), 'guide · Back to How to');
  A.click({ act: 'navback' });
  check('— and lands there', A.ui.view + ' ' + A.ui.howto, 'guide null');
  check('— from the list, up is Home', A.upView(), 'season');
  as('mum', 'guide', 'around');
  check('a topic ends with Next, the one after it', /data-act="howto" data-k="home"><span class="tc-main"><span class="muted">Next<\/span><b>What Home shows you<\/b>/.test(page()), true);
  A.click({ act: 'howto', k: 'home' });
  check('— which opens it', A.ui.howto, 'home');
  const last = A.howtoTopics().slice(-1)[0].id;
  as('mum', 'guide', last);
  check('the last has no Next, only the way to the list', !/<span class="muted">Next<\/span>/.test(page()) && /data-act="howto">All the how-tos</.test(page()), true);
  check('How to lights More on the bar', (A.render(), A.tabFor()), 'more');
}

/* ---------------- a locked device ---------------- */

console.log('\n--- a locked device draws none of it ---');
{
  const h = as(null, 'guide', 'around');
  check('signed out, a club with an admin: the lock screen, not the guide', /Sign in to see this club/.test(h) && !/How to|Finding your way/.test(h), true);
}

H.summary('How to');
