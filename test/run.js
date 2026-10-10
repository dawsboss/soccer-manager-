/* Every suite, one command, one exit code.

   CLAUDE.md asks for the checks to be run after every change to app.js and
   again after every change to the rules in database.rules.json. Asking for four separate
   commands is how one of them quietly stops being run, so this is the one to
   remember; the individual files still work on their own when you want to read
   the detail of a single area.

   Each suite runs in its own process because they all load app.js into module
   scope and would otherwise tread on each other. Quiet on success — a wall of
   passing output is how a failure gets scrolled past. Pass --verbose to see
   everything, or run the file itself. */

const { spawnSync } = require('child_process');
const path = require('path');

const SUITES = [
  ['version', 'the build markers agree'],
  ['clock', 'the match clock and minutes played'],
  ['stints', 'who is on the pitch, and the sub actions'],
  ['plan', 'the Plan tab\'s snapshots of the pitch'],
  ['subs', 'a locked-in plan, called from the sideline'],
  ['stats', 'tallies, and what reaches the public tier'],
  ['feed', 'the Live tab, and what it notifies'],
  ['recap', 'a finished game told back: when, how often, what went well'],
  ['calendar', 'the one calendar: views, which calendars, and what reaches the share link'],
  ['rsvp', 'parents say who is coming, for their own child only'],
  ['attend', 'who came, and the season counted from it'],
  ['calfeed', 'the calendar feed reads public/ and nothing else'],
  ['ids', 'share, game, feed and club ids come from the secure generator'],
  ['ai', 'the AI prompt carries numbers, never names'],
  ['roles', 'roles derived from where a uid appears'],
  ['visibility', 'which teams each account sees and edits'],
  ['signout', 'a signed-out device draws nothing of a locked club'],
  ['signin', 'the ways in: Google, Apple, Microsoft, email, and one account per email'],
  ['routing', 'links in, links out'],
  ['sync', 'auth, the workspace read, and its races'],
  ['invites', 'joining a club by invite, on both sides'],
  ['join', 'a squad of invites at once, and the team link a coach approves'],
  ['messages', 'notices and family conversations, read and written by whom'],
  ['push', 'notifications to a closed phone: who the server tells, and the phone that asked'],
  ['access', 'the lookup tables the rules read, kept true by the server the moment a role changes'],
  ['mirror', 'the share pages\' calendar, kept in step by the server whoever changed it'],
  ['mycalfeed', 'my calendar\'s feed, built by the server from her roles in every club'],
  ['book', 'booking a coach\'s time: one server call, counted, with a waiting list'],
  ['owners', 'who runs the club: only an owner takes an admin away, and every admin is told'],
  ['orgs', 'the app on orgs/: a family\'s phone holds her own children and numbers, staff read the squads, every write lands there'],
  ['import', 'bulk import merges, and never replaces'],
  ['drills', 'the built-in drill library holds together'],
  ['practice', 'the Practice tab, and who gets it'],
  ['plans', 'practice plans, and how they reach the club'],
  ['sessions', 'training sessions, fields, fees and hours'],
  ['avail', 'coaches\' bookable times, a family booking one, and my calendar'],
  ['alerts', 'alerts from every club: messages and calendar changes, over any screen, opening where they happened'],
  ['parents', 'what a parent sees: her own child by name, the rest by number, and her children in every club'],
  ['helpers', 'a team helper: prepares the calendar, register, notices and plans, and never runs the day'],
  ['players', 'a player\'s own sign-in: the coach gives it, she sees what her parents see, and talks to the coaches only where they do'],
  ['viewers', 'club-wide viewers see every team\'s games with names and nothing else, and are in the index like everyone else'],
  ['fans', 'a player\'s fans: anyone who can see her asks, her coach approves, and they read less than a parent'],
  ['children', 'a child in the club: her record, read by staff and her own family, made for every child on a team, confirmed by her family alone'],
  ['register', 'registration: programs and waivers for admins, the link and form a family fills (in her own name, in the rules\' order), accepting, and a draft a coach starts for a family'],
  ['details', 'getting families to finish their children\'s details: reminded on every screen and once a day, kept to the calendar and messages after the club\'s deadline, never staff; what is required and the deadline the admins\''],
  ['forget', 'forgetting an account: every role, table and place on a child in every club, her own nodes, a child with no family left kept for the admins, never the last admin'],
  ['links', 'links with limits: how many people may use one, and until when, for every kind of link'],
  ['mycal', 'my calendar is the person\'s, across clubs, and private unless she shares it'],
  ['safekeep', 'nothing floats away: one count, a full phone, a whole backup'],
  ['library', 'the club\'s drills and a coach\'s own, and who sees which'],
  ['away', 'coaches\' time off: nights, dates away, calling out'],
  ['news', 'club activity: what an admin hears, and a coach, and never a parent'],
  ['planner', 'planning for the club: clashes, a time for everyone, picture day'],
  ['schedule', 'all teams on the calendar: the club\'s week for its admins, adding to any team, and shared fields'],
  ['smoke', 'every view renders without throwing'],
  ['sandbox', 'the test club, and database isolation'],
  ['rulesver', 'an admin is told when the published rules are behind'],
  ['rules', 'the database rules, as database.rules.json has them']
];

const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');
const only = process.argv.filter(a => !a.startsWith('-')).slice(2);
const list = only.length ? SUITES.filter(([n]) => only.includes(n)) : SUITES;

const results = [];
let allGaps = [];

for (const [name, what] of list) {
  const started = Date.now();
  const r = spawnSync(process.execPath, [path.join(__dirname, name + '.js')], {
    encoding: 'utf8', cwd: path.join(__dirname, '..'), env: process.env
  });
  const ms = Date.now() - started;
  const out = (r.stdout || '') + (r.stderr || '');
  const ok = r.status === 0;
  // "  gap  <label padded to 50> <value>" — keep the label, drop the value
  const gaps = out.split('\n').filter(l => /^ {2}gap /.test(l)).map(l => l.slice(7, 57).trim());
  const fails = out.split('\n').filter(l => /^ {2}FAIL /.test(l));
  results.push({ name, what, ok, ms, out, gaps, fails });
  allGaps = allGaps.concat(gaps.map(g => name + ': ' + g));

  const mark = ok ? 'ok  ' : 'FAIL';
  const note = gaps.length ? `  (${gaps.length} known gap${gaps.length === 1 ? '' : 's'})` : '';
  console.log(`${mark} ${name.padEnd(14)} ${String(ms + 'ms').padStart(7)}  ${what}${note}`);
  if (verbose) console.log(out.split('\n').map(l => '     ' + l).join('\n'));
  else if (!ok) {
    /* Show the whole failing suite: the assertions before a failure are usually
       what explains it. */
    console.log('\n--- ' + name + ' ---');
    console.log(out.trimEnd().split('\n').map(l => '  ' + l).join('\n'));
    console.log('--- end ' + name + ' ---\n');
  }
}

const failed = results.filter(r => !r.ok);
const total = results.reduce((s, r) => s + r.ms, 0);

if (allGaps.length) {
  console.log('\nKnown gaps, pinned so a change to them is visible:');
  for (const g of allGaps) console.log('  • ' + g);
}

console.log(`\n${results.length} suite${results.length === 1 ? '' : 's'} in ${total}ms — ` +
  (failed.length ? `${failed.length} FAILED: ${failed.map(r => r.name).join(', ')}` : 'all green'));

process.exit(failed.length ? 1 : 0);
