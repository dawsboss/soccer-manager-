/* Every suite, one command, one exit code.

   CLAUDE.md asks for the checks to be run after every change to app.js and
   again after every change to the rules in README.md. Asking for four separate
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
  ['version', 'the four build markers agree'],
  ['clock', 'the match clock and minutes played'],
  ['stints', 'who is on the pitch, and the sub actions'],
  ['stats', 'tallies, and what reaches the public tier'],
  ['roles', 'roles derived from where a uid appears'],
  ['visibility', 'which teams each account sees and edits'],
  ['routing', 'links in, links out'],
  ['sync', 'auth, the workspace read, and its races'],
  ['smoke', 'every view renders without throwing'],
  ['sandbox', 'the test club, and database isolation'],
  ['rules', 'the database rules, as README publishes them']
];

const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');
const only = process.argv.filter(a => !a.startsWith('-')).slice(2);
const list = only.length ? SUITES.filter(([n]) => only.includes(n)) : SUITES;

const results = [];
let allGaps = [];

for (const [name, what] of list) {
  const started = Date.now();
  const r = spawnSync(process.execPath, [path.join(__dirname, name + '.js')], {
    encoding: 'utf8', cwd: path.join(__dirname, '..')
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
  console.log(`${mark} ${name.padEnd(11)} ${String(ms + 'ms').padStart(7)}  ${what}${note}`);
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
