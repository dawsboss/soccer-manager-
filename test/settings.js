/* One Settings screen (UX-REVIEW.md, 1.4; build 143).

   Settings used to be in five places: Your settings (account, notifications,
   a Firebase paragraph, sharing, version, backup), Club settings (details,
   what parents see, readiness, and a card for every other club screen),
   People, Squad's Team set-up (shapes, counters, and the parent links again)
   and the training sessions' tabs. "Set up sharing" was on two of them and
   the club's calendar on three. Now there is one, in four sections by whose
   they are, each item one line that taps in. Pinned here:

   - You: the account and notifications for everybody; My drills for whoever
     plans.
   - This team: the team on screen, for whoever could read its set-up (never
     a tracker or a family), changeable only by its coaches, and nowhere else:
     Squad keeps one line to it.
   - Club: People for coaches and admins, the club's screens for admins alone.
   - Advanced: backup and Check readiness for admins (and refused in the
     handler for anyone else), and nobody else gets the section.
   - About: one row for everyone, opening a sheet with the version, the
     connection (in the badge's words) and the account id (UX-REVIEW-3.md,
     18.1, 18.4). Delete my account is a row under You, not on the account
     sheet (18.2).
   - Club details holds the club's own settings and nothing a Settings row
     already opens; More has Settings once, and nothing beside it. */

const H = require('./harness');
const { check } = H;

// a config, so gated() is true and the role checks bite (visibility.js says why)
const A = H.loadApp({ storage: { 'sm.workspace': 'CLUB' }, config: { apiKey: 'k', databaseURL: 'https://x.test' } });

const club = () => ({
  teams: {
    t1: { id: 't1', name: 'G14 Flight', share: 'shareid0000000000001',
      players: { p1: { id: 'p1', name: 'Rosa Delgado', number: '7', guardians: { mum: true } } } },
    t2: { id: 't2', name: 'G12 Storm', players: { k1: { id: 'k1', name: 'Mia Kowalski', number: '4' } } }
  },
  matches: {},
  access: {
    org: { name: 'Lakeside SC' },
    admins: { boss: true },
    teams: { t1: { coaches: { jaz: true }, trackers: { trk: true } }, t2: { coaches: { other: true } } },
    index: { boss: true, jaz: true, trk: true, mum: true, other: true },
    members: { boss: { name: 'Ada' }, jaz: { name: 'Jaz' }, mum: { name: 'Mo' } }
  }
});
A.fb = { db: {}, ref: (db, p) => p, set: () => Promise.resolve(), remove: () => Promise.resolve() };

function as(uid, view = 'setup', tid = 't1') {
  A.state = club();
  A.me = uid ? { uid, name: uid, email: uid + '@x.test' } : null;
  A.appOwners = {};
  A.ui.teamId = tid; A.ui.matchId = null; A.ui.view = view; A.ui.editFid = null;
  A.toasts.length = 0;
  A.closeSheet();
  A.render();
  return A.rendered();
}
const sheet = () => String(A.dom.node('#sheet').innerHTML || '');
const heads = h => [...h.matchAll(/<h2 class="sechead">([^<·]+)/g)].map(m => m[1].trim()).join(' · ');
const acts = h => new Set([...h.matchAll(/data-act="(\w+)"(?: data-(?:v|k|id)="([^"]*)")?/g)].map(m => m[2] ? m[1] + ':' + m[2] : m[1]));

console.log('--- the connection says what the badge says (UX-REVIEW-3.md, 14.4; in About since 18.1) ---');
{
  const row = () => { as('boss'); A.click({ act: 'aboutsheet' }); const h = sheet(); A.closeSheet(); return (h.match(/Connection[\s\S]{0,300}/) || [''])[0].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '); };
  A.online = true;
  check('connected: Synced, with the club', /Connection Synced with Lakeside SC/.test((A.setSync('live', 'Synced'), row())), true);
  A.online = false;
  check('with no signal: Offline, not "Connected"', /Connection Offline/.test((A.setSync('off', 'Offline'), row())) && !/Connected/.test(row()), true);
  A.online = true;
}

console.log('--- the sections, by whose they are ---');
{
  let h = as('boss');
  check('an admin: You, This team, Club, Advanced, About', heads(h), 'You · This team · Club · Advanced · About');
  check('— titled Settings', A.rendered('#titlebar').includes('<span>Settings</span>'), true);
  const a = acts(h);
  for (const x of ['signinsheet', 'goview:admin', 'goview:people', 'goview:regs', 'goview:comply', 'scheduler', 'sesstab:fields', 'sesstab:fees', 'sesstab:hours', 'clubdrills', 'tpllist:clubTpl', 'bulkimport', 'backupsheet', 'readysheet', 'aboutsheet', 'editteam:t1', 'formations', 'trackcfg', 'sharesheet'])
    check(`— ${x}`, a.has(x), true);
  check('— no club calendar here: Club home and the Calendar have it', a.has('schedule'), false);
  check('— the links for families once', (h.match(/data-act="sharesheet"/g) || []).length, 1);

  h = as('jaz');
  check('a coach: You, This team, Club (People), About', heads(h), 'You · This team · Club · About');
  check('— People, the Scheduler (read-only, her teams lit; build 163) and nothing else of the club\'s', [...acts(h)].filter(x => /^goview:(admin|people|regs|comply)$|^scheduler$|^bulkimport$|^clubdrills$/.test(x)).sort().join(), 'goview:people,scheduler');
  check('— her team\'s set-up, to change', ['editteam:t1', 'formations', 'trackcfg'].every(x => acts(h).has(x)), true);
  check('— no backup or readiness', /backupsheet|readysheet/.test(h), false);
  check('— My drills, since she plans', acts(h).has('mydrills'), true);
  check('— fields, her sessions\' fees and her hours, off the Sessions screen (UX-REVIEW-2.md, 7.3)', ['sesstab:fields', 'sesstab:fees', 'sesstab:hours'].every(x => acts(h).has(x)), true);

  h = as('jaz', 'setup', 't2');
  check('a coach on another team: its set-up to read, nothing to change', /This team/.test(h) && /Shapes/.test(h) && !/data-act="(editteam|formations|trackcfg)"/.test(h), true);

  h = as('trk');
  check('a tracker: You and About, no team set-up, no club', heads(h), 'You · About');
  check('— and no drills of her own', acts(h).has('mydrills'), false);
  check('— nor fields, fees or hours', /data-act="sesstab"/.test(h), false);

  h = as('mum', 'setup');
  check('a parent: You and About (UX-REVIEW-3.md, 18.1)', heads(h), 'You · About');
  check('— one quiet row: no version line, database or account id on the page', /page and code agree|Database|Account id|data-act="hardreload"/.test(h), false);
  check('— no team, no club, no links to manage', /data-act="(sharesheet|editteam|formations|trackcfg|scheduler|bulkimport)"|data-v="(admin|people|regs|comply)"/.test(h), false);
  check('— and no child\'s name', /Rosa|Mia/.test(h), false);
  check('— and no drills of her own in a real club (UX-REVIEW-2.md, 7.3)', acts(h).has('mydrills') || /data-act="sesstab"/.test(h), false);

  h = as(null);
  const s = club(); s.access.admins = {}; s.access.index = {}; A.state = s; A.render(); h = A.rendered();
  check('nobody signed in, nobody\'s club yet: Sign in under You', /data-act="signinsheet"[\s\S]*?Sign in/.test(h), true);
}

console.log('\n--- each item one line ---');
{
  const h = as('boss');
  check('no paragraph of Firebase on the screen', /Firebase config is/.test(h), false);
  check('About one line, with the version', new RegExp(`data-act="aboutsheet"[\\s\\S]*?TeamPlayHQ · v${A.BUILD}`).test(h), true);
  A.click({ act: 'aboutsheet' });
  check('— its sheet: the account id, with Copy', /Account id[\s\S]*?class="mono">boss<[\s\S]*?data-act="copylink" data-v="boss"/.test(sheet()), true);
  check('— the version, with Reload', /Version v\d+[\s\S]*?data-act="hardreload"/.test(sheet()), true);
  check('— and the connection in the badge\'s words, never "Connected" beside Offline (18.4)', /Connection[\s\S]*?Offline/.test(sheet()) && !/Connected/.test(sheet()), true);
  A.closeSheet();
}

console.log('\n--- the outbox, one word on the badge and Settings (UX-REVIEW-3.md, 18.4) ---');
{
  as('mum', 'season');
  A.pending.w['teams/t1/x'] = { v: 1, at: 1 }; A.paintSync();
  check('something waiting: the badge says so in the outbox\'s one word', A.dom.node('#syncBadge').textContent, 'Waiting to send · 1');
  check('— Settings says the same words', (A.ui.view = 'setup', A.render(), /Waiting to send · 1/.test(A.rendered())), true);
  delete A.pending.w['teams/t1/x']; A.paintSync();
}

console.log('\n--- Advanced: an admin\'s, in a sheet ---');
{
  as('boss');
  A.click({ act: 'backupsheet' });
  check('Backup opens Download and Load', /data-act="export"/.test(sheet()) && /data-act="import"/.test(sheet()), true);
  A.closeSheet();
  A.click({ act: 'readysheet' });
  check('Check readiness opens the list, with its fix', /Check readiness/.test(sheet()) && /data-act="preplockdown"/.test(sheet()), true);
  for (const uid of ['jaz', 'trk', 'mum']) {
    as(uid); A.dom.node('#sheet').innerHTML = '';
    A.click({ act: 'backupsheet' }); A.click({ act: 'readysheet' });
    check(`${uid}: a tap that reaches either is refused`, A.lastToast() + ' / ' + /data-act="(export|preplockdown)"/.test(sheet()), 'Club admins only / false');
  }
}

console.log('\n--- nothing twice ---');
{
  let h = as('boss', 'admin');
  check('Club details is the club\'s own: details, what parents see, who runs it, teams, retire', ['saveorg', 'rosteropen', 'newteam', 'retireclub'].every(x => h.includes(`data-act="${x}"`)), true);
  check('— and nothing a Settings row opens', /data-act="(schedule|scheduler|bulkimport|clubdrills|people|preplockdown|sesstab)"|data-v="(regs|comply)"/.test(h), false);
  check('— titled Club details, with no second heading', A.rendered('#titlebar').includes('<span>Club details</span>') && !/<h2>Club admin<\/h2>/.test(h), true);
  h = as('jaz', 'roster');
  check('Squad: one line to the team\'s settings', /data-act="goview" data-v="setup"/.test(h), true);
  check('— and none of them itself', /data-act="(sharesheet|formations|trackcfg|editteam)"|Team set-up/.test(h), false);
  as('boss', 'season');
  A.click({ act: 'tab', tab: 'more' });
  check('More: Settings once, no People or Club details beside it', (sheet().match(/data-v="setup"/g) || []).length + ' ' + /data-v="(people|admin)"/.test(sheet()), '1 false');
  A.closeSheet();
}

console.log('\n--- the way back ---');
{
  for (const v of ['people', 'admin', 'regs', 'comply', 'scheduler']) {
    as('boss', v); A.click({ act: 'navback' });
    check(`${v}: back to Settings`, A.ui.view, 'setup');
    // one way up: the arrow, never a second Back of the screen's own going somewhere else
    const h = as('boss', v);
    check(`${v}: no Back button beside the heading, and the arrow says where it goes`, />Back<\/button>/.test(h) + ' ' + A.rendered('#titlebar').includes('aria-label="Back to Settings"'), 'false true');
  }
  // a registration program open: the arrow goes to the list of programs first, then Settings
  as('boss', 'regs'); A.state.programs = { p1: { id: 'p1', name: 'Fall' } }; A.ui.regs = { prog: 'p1' }; A.render();
  check('a program open: the arrow says the programs', A.rendered('#titlebar').includes('aria-label="Back to the programs"'), true);
  A.click({ act: 'navback' });
  check('— and goes to them, still on Registrations', A.ui.view + ' ' + A.ui.regs.prog, 'regs null');
  A.click({ act: 'navback' });
  check('— then Settings', A.ui.view, 'setup');
  as('boss', 'formation'); A.ui.editFid = 'f1'; A.render(); A.click({ act: 'backsetup' });
  check('a team\'s shape: back to Settings, where Shapes is', A.ui.view, 'setup');
}

H.summary('one Settings screen');
