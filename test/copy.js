/* Copy and vocabulary (UX-REVIEW.md, 2; build 145).

   Four findings, one suite. 2.1: infrastructure leaked onto user screens
   ("Org admin", "Firebase config is not filled in — see README.md", "a lookup
   table the app hasn't written yet", "the rsvp block from README", "Force
   refresh", "id sbA"). 2.2: paragraphs where labels belong. 2.3: four words
   for one concept (Squad / Players / Roster; Practice the tab / practice the
   entry / Training sessions; Org admin / Club admin), and the coach's own
   stats words (owed, scrappy, stint, By need, Batch, set / move) shown to
   everyone. 2.4: a role banner over every screen, for good.

   GLOSSARY.md is the one place the words are picked, and this suite holds the
   screens to it: every screen, as an admin, a coach, a tracker and a parent,
   stripped of its tags, must carry none of the words under *Never on screen*;
   the labels it names are drawn as it names them. Then the pieces: the role
   card shown once per account, club and role and put away with Got it, with
   its sentence in the account sheet and under Settings → You; a refusal said
   in one plain sentence, kept or not, with the admin sent to Check readiness
   and everyone else to the admin; the detail behind a label in an ⓘ sheet
   from `INFO`, never a paragraph; buttons that are verbs. */

const fs = require('fs');
const path = require('path');
const H = require('./harness');
const { check } = H;

/* ---------------- the glossary, read ---------------- */

const GLOSSARY = fs.readFileSync(path.join(__dirname, '..', 'GLOSSARY.md'), 'utf8');
const section = head => (GLOSSARY.split(new RegExp('^## ' + head + '\\s*$', 'm'))[1] || '').split(/^## /m)[0];
const banned = [...section('Never on screen').matchAll(/^- `([^`]+)`/gm)].map(m => m[1]);
check('GLOSSARY.md lists the words never on screen', banned.length >= 15 && banned.includes('Org admin') && banned.includes('Squad') && banned.includes('owed'), true);

// a config, so gated() is true and every role check bites (visibility.js says why)
const A = H.loadApp({ storage: { 'sm.workspace': 'CLUB' }, config: { apiKey: 'k', databaseURL: 'https://x.test' } });
A.fb = { db: {}, ref: (db, p) => p, set: () => Promise.resolve(), remove: () => Promise.resolve() };

const NOW = Date.now();
const club = () => ({
  teams: {
    t1: { id: 't1', name: 'G14 Flight', share: 'shareid0000000000001', birthYear: 2012,
      players: {
        p1: { id: 'p1', name: 'Rosa Delgado', number: '7', guardians: { mum: true } },
        p2: { id: 'p2', name: 'Mia Kowalski', number: '4' },
        p3: { id: 'p3', name: 'Ines Baptiste', number: '9' }
      },
      events: { e1: { id: 'e1', kind: 'practice', title: 'Practice', date: '2026-10-14', start: '18:00', end: '19:00', venue: 'Lakeside Park' } } },
    t2: { id: 't2', name: 'G12 Storm', players: { k1: { id: 'k1', name: 'Zoe Hart', number: '4' } } }
  },
  matches: {
    g1: { id: 'g1', teamId: 't1', opponent: 'Riverside', date: '2026-10-12', kickoff: '10:00', periodCount: 2, periodMinutes: 30, onFieldCount: 7, currentHalf: 1,
      periods: { 0: { half: 1, start: NOW - 600000 } }, planned: { p1: 40, p2: 40, p3: 20 },
      positions: { p1: { x: 50, y: 50, slot: null } }, stints: { s1: { pid: 'p1', on: 0 } }, goals: { a: { t: 120, side: 'us', pid: 'p1' } }, createdAt: 2 },
    g0: { id: 'g0', teamId: 't1', opponent: 'Hill End', date: '2026-10-05', periodCount: 2, periodMinutes: 30, onFieldCount: 7, currentHalf: 2, ended: true,
      periods: { 0: { half: 1, start: NOW - 9000000, end: NOW - 7200000 }, 1: { half: 2, start: NOW - 7100000, end: NOW - 5300000 } },
      planned: { p1: 40, p2: 40 }, stints: { s1: { pid: 'p1', on: 0, off: 1800 }, s2: { pid: 'p2', on: 0, off: 3600 } },
      goals: { a: { t: 300, side: 'us', pid: 'p2' }, b: { t: 2000, side: 'them' } }, shots: { x: { t: 290, side: 'us', onTarget: true, pid: 'p2' } }, createdAt: 1 }
  },
  access: {
    org: { name: 'Lakeside SC' },
    admins: { boss: true },
    teams: { t1: { coaches: { jaz: true }, trackers: { trk: true } }, t2: { coaches: { other: true } } },
    index: { boss: true, jaz: true, trk: true, mum: true, other: true },
    teamIndex: { t1: { jaz: 'coach', trk: 'tracker' }, t2: { other: 'coach' } },
    teamParents: { t1: { mum: 'p1' } },
    members: { boss: { name: 'Ada' }, jaz: { name: 'Jaz' }, trk: { name: 'Tom' }, mum: { name: 'Mo' } }
  }
});

function as(uid, view = 'season', tid = 't1', gview = null, mid = null) {
  A.state = club();
  A.me = uid ? { uid, name: uid, email: uid + '@x.test' } : null;
  A.appOwners = {};
  A.ui.teamId = tid; A.ui.matchId = mid; A.ui.view = view; A.ui.editFid = null;
  if (gview) A.ui.gameView = gview;
  A.toasts.length = 0;
  A.closeSheet();
  A.render();
  return screen();
}
const sheet = () => String(A.dom.node('#sheet').innerHTML || '');
const screen = () => [A.rendered(), A.rendered('#titlebar'), A.rendered('#tabbar')].join('\n');
// what a person reads: the tags, and with them every data-act, class and id, taken out
const text = html => String(html).replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ');
const wordRe = w => new RegExp('(^|[^\\w])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w-])');
const offending = html => banned.filter(w => wordRe(w).test(text(html)));

/* ---------------- every screen, for every role ---------------- */

console.log('--- no word from the code, the database or the docs on any screen ---');
{
  const views = ['season', 'teamstats', 'minutes', 'attend', 'roster', 'practice', 'calendar', 'club', 'setup', 'people', 'admin', 'mine', 'sessions', 'inbox', 'notes', 'planner', 'regs', 'comply'];
  const gviews = ['live', 'subs', 'track', 'stats', 'plan'];
  const bad = [];
  let drawn = 0;
  for (const uid of ['boss', 'jaz', 'trk', 'mum']) {
    for (const v of views) {
      let h;
      try { h = as(uid, v); } catch (e) { bad.push(`${uid}/${v} threw: ${e.message}`); continue; }
      drawn++;
      for (const w of offending(h)) bad.push(`${uid}/${v}: "${w}"`);
      // the sheets a screen opens: More and the account
      for (const act of ['moresheet', 'avatar']) {
        A.closeSheet();
        try { if (act === 'avatar') A.sheetAccount(); else A.sheetMore(); } catch (e) { continue; }
        for (const w of offending(sheet())) bad.push(`${uid}/${v} ${act}: "${w}"`);
      }
    }
    for (const g of gviews) {
      let h;
      try { h = as(uid, 'game', 't1', g, 'g1'); } catch (e) { bad.push(`${uid}/game/${g} threw: ${e.message}`); continue; }
      drawn++;
      for (const w of offending(h)) bad.push(`${uid}/game/${g}: "${w}"`);
    }
    for (const g of ['recap', 'stats', 'live']) {
      let h;
      try { h = as(uid, 'game', 't1', g, 'g0'); } catch (e) { bad.push(`${uid}/game0/${g} threw: ${e.message}`); continue; }
      drawn++;
      for (const w of offending(h)) bad.push(`${uid}/game0/${g}: "${w}"`);
    }
  }
  check('every screen drawn, as four kinds of account', drawn >= 4 * (views.length + gviews.length + 3), true);
  check('— and none carries a banned word', bad.join('; ') || 'none', 'none');
  if (bad.length) console.log('     ' + bad.join('\n     '));
}

/* ---------------- the doors, before she is in ---------------- */

/* UX-REVIEW-3.md, 13.6: the team-link form said "She's on the squad" to every
   parent, because this suite drew no screen before she was in the club. The
   invite, the team link and the registration link, in every state, held to
   the glossary and to no pronoun for a child who may be a boy. */
console.log('\n--- the invite, team-link and registration screens ---');
{
  const pron = /(^|[^\w])(she|her|hers|She|Her)(?![\w-])/;
  const bad = [];
  const look = (name, html) => {
    for (const w of offending(html)) bad.push(`${name}: "${w}"`);
    if (pron.test(text(html))) bad.push(`${name}: "${(text(html).match(new RegExp('.{0,30}' + pron.source + '.{0,30}')) || [''])[0].trim()}"`);
  };
  const saved = A.me;
  for (const signed of [null, { uid: 'newbie', name: 'Mo', email: 'mo@x.test' }]) {
    A.me = signed;
    const inv = { clubName: 'Lakeside SC', teamName: 'G14 Flight', byName: 'Ada', role: 'parent', playerNo: '7', email: 'mo@x.test', max: 3 };
    for (const status of ['idle', 'working', 'gone', 'full', 'taken', 'expired', 'wrongemail', 'unverified', 'error', 'ready'])
      for (const role of ['parent', 'fan', 'player', 'coach']) { A.invite = { id: 'i1', status, doc: { ...inv, role } }; look(`invite ${role}/${status}${signed ? '' : ' signed out'}`, A.inviteScreen()); }
    A.invite = null;
    for (const status of ['idle', 'working', 'expired', 'full', 'gone', 'error', 'sent', 'declined', 'ready'])
      for (const kid of [false, true]) for (const fan of [false, true]) {
        A.join = { code: 'j1', status, kid, doc: { clubName: 'Lakeside SC', teamName: 'G14 Flight', fan } };
        look(`team link ${status}${kid ? ' new child' : ''}${fan ? ' fan' : ''}${signed ? '' : ' signed out'}`, A.joinScreen());
      }
    A.join = null;
    const doc = { name: 'Fall 2027', club: 'Lakeside SC', kind: 'season', born: { lo: 2014, hi: 2019 }, fee: 120, asks: { q1: { q: 'Anything the coach should know?', o: 1 } }, waivers: { w1: { title: 'Photos', text: 'We may take photos at games.', v: 1 } } };
    for (const status of ['idle', 'gone', 'error', 'working', 'ready']) {
      A.regx = { id: 'rl1', status, doc, kids: {}, regs: {}, agreed: {}, care: {} };
      look(`registration ${status}${signed ? '' : ' signed out'}`, A.regScreen());
      if (signed && status === 'ready') { A.regx.form = 'new'; look('registration form', A.regScreen()); }
    }
    A.regx = null;
  }
  A.me = saved;
  check('no banned word and no "she" on a door into the club', bad.join('; ') || 'none', 'none');
}

console.log('\n--- the labels, as GLOSSARY.md names them ---');
{
  const idx = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const src0 = fs.readFileSync(H.APP_PATH, 'utf8');
  const tab = v => (idx.match(new RegExp(`data-view="${v}"[^>]*>([^<]+)<`)) || [])[1];
  check('a team\'s tabs are Season · Players · Training', [tab('season'), tab('roster'), tab('practice')].join(' · '), 'Season · Players · Training');
  const gtab = v => (idx.match(new RegExp(`data-gview="${v}"[^>]*>([^<]+)<`)) || [])[1];
  check('a game\'s screens are Subs · Track · Lineup · Stats · Live, in that order, never Plan', [...idx.matchAll(/data-gview="(\w+)"[^>]*>([^<]+)</g)].map(m => m[2]).join(' · '), 'Subs · Track · Lineup · Stats · Live · Recap');
  as('jaz');
  check('the bar: Home · Calendar · Game · Messages · More for staff', A.navTabs().map(t => t.label).join(' · '), 'Home · Calendar · Game · Messages · More');
  as('mum', 'mine');
  check('— and the same for a family (UX-REVIEW-2.md, 9.1)', A.navTabs().map(t => t.label).join(' · '), 'Home · Calendar · Game · Messages · More');
  check('— Live feed is gone: the play-by-play is Live for everyone', /'Live feed'|>Live feed</.test(src0), false);
  check('who runs the club is a Club admin', A.ROLE_LABEL.admin, 'Club admin');
  check('a 1-1 on the calendar is a Session', A.CAL_KIND.session, 'Session');
  check('— and the screen is Sessions', A.VIEW_TITLE.sessions, 'Sessions');
  // UX-REVIEW-2.md, 6.2 (build 148): the page is What's new, Notifications the switches
  check('what changed is What\'s new, never Notifications', A.VIEW_TITLE.notes, "What's new");
  as('boss', 'club');
  check('— on Club home and under More', /<b>Sessions<\/b>/.test(A.rendered()) && (A.sheetMore(), /<b>Sessions<\/b>/.test(sheet())), true);
  // the sync badge's words come from one function; every label it is given is one of the glossary's four
  const src = fs.readFileSync(H.APP_PATH, 'utf8');
  const labels = src.split('\n').filter(l => /setSync\(/.test(l) && !/^function setSync/.test(l)).flatMap(l => [...l.matchAll(/'([^']*)'/g)].map(m => m[1])).filter(x => x !== 'off' && x !== 'live');
  check('the sync badge says Synced, Offline, Not synced or Sign in', labels.length >= 4 && labels.every(x => ['Not synced', 'Synced', 'Offline', 'Sign in'].includes(x)), true);
  check('— never "local" or "this device"', /setSync\([^)]*'(?:local|this device|no code|sync failed)'/.test(src), false);
  const h = as('boss', 'setup');
  check('a team row carries no id', /· id [a-z0-9]{4}/i.test(h), false);
  A.click({ act: 'aboutsheet' }); const ab = sheet(); A.closeSheet();
  check('the version row says Reload', /data-act="hardreload">Reload</.test(ab), true);
  check('the account id is for support, not the console', /Account id[\s\S]*?for support/.test(ab) && !/app owner/.test(text(ab.split('Account id')[1] || '')), true);
  A.click({ act: 'readysheet' });
  check('Check readiness explains itself without a lookup table', /every change saves/.test(sheet()) && !/lookup table/.test(sheet()), true);
  check('— and is the one place the rules are named', /The published rules match this app/.test(sheet()), true);
}

/* ---------------- 2.4: the role card, once ---------------- */

console.log('\n--- what her role lets her do: a card, once, and a line in the account sheet ---');
{
  A.storage.removeItem('sm.role.v1:mum');
  let h = as('mum', 'mine');
  // UX-REVIEW-3.md, 13.8: a family's Home leads with her child, and the card sat over him
  check('a parent\'s Home carries no role card over her child', /rolecard|Signed in as/.test(h), false);
  for (const v of ['mine', 'season', 'calendar', 'setup', 'club']) { A.ui.view = v; A.render(); if (/rolecard/.test(screen())) check(`— none on ${v}`, false, true); }
  A.sheetAccount();
  check('the account sheet keeps the sentence, in her own words', /class="muted rolewords"[^>]*>You are a parent here: you see your own child by name, say whether your child is coming/.test(sheet()) && !/Signed in as/.test(sheet()), true);
  check('— never "she" for a child who may be a boy', /whether she is coming/.test(sheet()), false);
  h = as('mum', 'setup');
  check('— Settings → You does not run it on after her email and role (UX-REVIEW-2.md, 7.1)', /rolewords|You are a parent here/.test(h), false);
  check('— which it says as a line of its own', /data-act="signinsheet"[\s\S]*?<span class="psub">[^<]*Parent · G14 Flight<\/span><\/span><\/button>/.test(h), true);

  A.storage.removeItem('sm.role.v1:trk');
  h = as('trk', 'season');
  check('a tracker is told once what she may do, on her team\'s Season', /rolecard" data-role="tracker"[\s\S]*?You track this team: you log what happens/.test(h), true);
  check('— never over the game', /rolecard/.test(as('trk', 'game', 't1', 'track', 'g1')), false);
  check('on Home alone (UX-REVIEW-2.md, 7.3): not over the Calendar', /rolecard/.test(as('trk', 'calendar')), false);
  as('trk', 'season'); A.click({ act: 'roleok', v: 'tracker' });
  check('— and no more', /rolecard/.test(as('trk', 'season')), false);
  check('remembered on this phone, for her account', !!A.storage.getItem('sm.role.v1:trk') && A.roleCardSeen('tracker'), true);

  h = as('jaz');
  check('a coach of the team gets none', /rolecard|Signed in as/.test(h), false);
  A.sheetAccount();
  check('— nor a sentence in the account sheet', /rolewords/.test(sheet()), false);
  A.storage.removeItem('sm.role.v1:jaz');
  h = as('jaz', 'season', 't2');
  check('on another team she is told once that she reads it', /rolecard" data-role="viewer"[\s\S]*?You can read G12 Storm, not change it: it is another team/.test(h), true);
  check('the role card is a card, not a banner class alone', /rolebar rolecard/.test(h), true);
  A.click({ act: 'roleok', v: 'viewer' });
  check('— put away for that club', /rolecard/.test(as('jaz', 'season', 't2')), false);
  check('a role is keyed with the club, so another club asks again', A.roleCardSeen('viewer'), true);
}

/* ---------------- 2.1: a refusal in one sentence ---------------- */

console.log('\n--- a refusal: one plain sentence, who can fix it, and whether it is kept ---');
{
  as('mum', 'mine');
  check('a parent is told to tell the admin', A.refusedMsg(), 'That didn’t save. The club’s set-up is out of date: tell the club admin.');
  check('— kept on this phone, when it is', A.refusedMsg(true), 'That didn’t save. It is kept on this phone. The club’s set-up is out of date: tell the club admin.');
  as('boss', 'setup');
  check('an admin is sent to Check readiness', A.refusedMsg(), 'That didn’t save. The club’s set-up is out of date: Check readiness, under Settings → Advanced, says what to do.');
  const src = fs.readFileSync(H.APP_PATH, 'utf8');
  check('no string names the database refusing, or README', /['`"][^'`"\n]*(?:database refused|from README|rules \(version)/.test(src), false);
  check('every permission refusal goes through refusedMsg()', (src.match(/permission\|denied\/i\.test\([^?]*\? refusedMsg\(/g) || []).length >= 8, true);
}

/* ---------------- 2.2: labels, with the detail behind an ⓘ ---------------- */

console.log('\n--- labels, not paragraphs ---');
{
  let h = as('jaz', 'season');
  check('the calendar card is a label and a button', /In your own calendar[\s\S]*?data-act="calicsall"[^>]*>Add to calendar</.test(h), true);
  check('— not the paragraph about copies', /Everything still to come|each entry replaces its earlier self/.test(h), false);
  check('— with an ⓘ beside the label', /data-act="info" data-k="calcopy"/.test(h), true);
  A.click({ act: 'info', k: 'calcopy' });
  check('the ⓘ opens the words in a sheet', /A copy, not a subscription[\s\S]*add it again/.test(sheet()), true);
  check('— from INFO, by key', A.INFO.calcopy[1].includes('Each entry replaces its earlier self'), true);
  check('an unknown key draws no button', A.infoBtn('nothing'), '');
  check('the minutes line under My players is gone', /Minutes are across every game/.test(as('mum', 'mine')), false);
  h = as('boss', 'admin');
  check('What parents see is two chips and an ⓘ', /What parents see[\s\S]*?data-act="info" data-k="rosteropen"[\s\S]*?Shirt numbers only[\s\S]*?Everyone by name/.test(h) && !/For the screen only/.test(h), true);
  A.click({ act: 'info', k: 'rosteropen' });
  check('— whose sheet says what it used to say under the chips', /for the screen only/.test(sheet()), true);
  h = as('boss', 'season');
  check('an admin\'s calendar card says what sync needs, without README', /needs the feed set up once for the club/.test(h) && !/README/.test(h), true);
  A.click({ act: 'info', k: 'calfeed' });
  check('— the ⓘ says who does it', /done once, by whoever set the club up/.test(sheet()), true);
}

console.log('\n--- buttons that are verbs ---');
{
  const src = fs.readFileSync(H.APP_PATH, 'utf8');
  check('Plan, not "Plan this practice"', /'Plan this practice'/.test(src), false);
  check('— and Open plan', (src.match(/\? 'Open plan' : 'Plan'/g) || []).length, 3);   // the next-up card, the plans list, and Home's Coming up (build 165)
  check('Add to calendar, not "Add what is coming up"', /Add what is coming up|Add a one-off copy/.test(src), false);
  check('Reload, not Force refresh', /Force refresh/.test(src), false);
  const h = as('jaz', 'game', 't1', 'subs', 'g1');
  check('Subs sorts By minutes or By number', /data-act="togglesort">By (?:minutes|number)</.test(h), true);
  check('— stages Several at once, not a Batch', /data-act="startplan">Several at once</.test(h) && !/>Batch</.test(h), true);
  check('— says short, over or on plan, never owed', /class="diff (?:owed|over)">\d+ (?:short|over)<|>on plan</.test(h) && !/\d+ owed/.test(h), true);
  check('— a spot with nothing in it reads Spot, and one word (build 146: no set/move stacked under it)', /aria-label="Set her spot">\s*<span>Spot<\/span><\/button>/.test(h) && !/lrspot-hint/.test(h), true);
}

H.summary('copy and vocabulary: every screen held to GLOSSARY.md');
