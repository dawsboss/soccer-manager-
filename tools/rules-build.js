/* Builds database.rules.json, the file that is published, from
   tools/rules-source.json, the file you edit.

   Why there are two: a club is moving from workspaces/{code} to orgs/{code}
   (AUTH.md, *The move to `orgs/{orgId}`*), one club at a time. Every root
   block that looks into a club — training, board, dm, claims, invites and the
   rest, about two hundred lookups — has to ask whichever tree that club is
   on. Typed by hand that is two hundred places to get one of wrong, and a
   rule that is wrong is silent until a club is refused something. So the
   source says each lookup once, against workspaces/ as it always has, and
   this script writes each one as

     ((!ON_ORGS && <the lookup>) || (ON_ORGS && <the same lookup on orgs/>))

   where ON_ORGS is "orgs/{code}/access exists". A club is on exactly one
   tree: moveClub empties the old one, and the bootstrap clauses on each tree
   refuse to start a club the other already holds, so nobody can make a club
   look moved by writing into orgs/ under its code.

   The two trees themselves (workspaces/$code and orgs/$code) are written out
   in full in the source and copied as they are. Once every club has moved,
   the workspaces/ branch and this wrapping come out, and the source is the
   published file again.

   `node tools/rules-build.js` writes database.rules.json; `--check` only
   says whether it is up to date (test/rules.js runs that). */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'tools', 'rules-source.json');
const OUT = path.join(ROOT, 'database.rules.json');

const START = "root.child('workspaces/' + ";

/* The end of a balanced (...) group starting at s[i] === '(', skipping over
   quoted strings. */
function closeParen(s, i) {
  let depth = 0;
  for (; i < s.length; i++) {
    const c = s[i];
    if (c === "'" || c === '"') { const q = c; i++; while (i < s.length && s[i] !== q) i++; continue; }
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) return i + 1; }
  }
  throw new Error('unbalanced parentheses in: ' + s);
}

/* One operand on the right of a comparison: a string, a number, a keyword,
   or a chain like newData.child('x').val() or root.child(...).val(). */
function operandEnd(s, i) {
  if (s[i] === "'" || s[i] === '"') { const q = s[i]; i++; while (s[i] !== q) i++; return i + 1; }
  while (i < s.length) {
    if (/[A-Za-z0-9_$.]/.test(s[i])) i++;
    else if (s[i] === '(') i = closeParen(s, i);
    else break;
  }
  return i;
}

/* From `root.child('workspaces/'…` at j: the whole predicate — the lookup,
   its method chain, and the comparison it ends in, if any. A lookup used as
   a value (inside another path, say) would not survive being wrapped, so it
   is refused here rather than built wrong. */
function predicateEnd(s, j) {
  let i = closeParen(s, j + 'root.child'.length);
  let last = '';
  while (s[i] === '.') {
    const m = /^\.([A-Za-z]+)\(/.exec(s.slice(i));
    if (!m) break;
    last = m[1];
    i = closeParen(s, i + m[0].length - 1);
  }
  const rest = s.slice(i);
  const op = /^\s*(===|!==|==|!=|>=|<=|>|<)\s*/.exec(rest);
  if (op) return operandEnd(s, i + op[0].length);
  if (last === 'exists' || last === 'hasChild' || last === 'hasChildren' || last === 'isString' || last === 'isNumber' || last === 'isBoolean') return i;
  throw new Error('a club lookup used as a value, which cannot be wrapped: ' + s.slice(j, i + 20));
}

/* The same lookup against orgs/: the tree's own paths, and the squad out
   from under the team. */
function toOrgs(p) {
  let o = p.split("'workspaces/' + ").join("'orgs/' + ");
  // the team id is one operand: no bare parenthesis, so it never reaches into the next lookup
  const TID = "((?:[^'()]|'[^']*'|\\([^()]*\\))+?)";
  o = o.replace(new RegExp("'/teams/' \\+ " + TID + " \\+ '/players/' \\+ ", 'g'), "'/squad/' + $1 + '/' + ");
  o = o.replace(new RegExp("'/teams/' \\+ " + TID + " \\+ '/players/'", 'g'), "'/squad/' + $1 + '/'");
  o = o.split("'/access/members/'").join("'/members/'").split("'/access/org/'").join("'/org/'").split("'/access/log/'").join("'/log/'");
  if (/workspaces\/|\/players\//.test(o)) throw new Error('could not move to orgs/: ' + p);
  return o;
}

function codeOf(pred) {
  const k = pred.indexOf(" + '/", START.length);
  if (k < 0) throw new Error('no club code in: ' + pred);
  return pred.slice(START.length, k);
}

function wrap(expr) {
  if (typeof expr !== 'string' || !expr.includes(START)) return expr;
  let out = '', i = 0;
  for (;;) {
    const j = expr.indexOf(START, i);
    if (j < 0) { out += expr.slice(i); break; }
    out += expr.slice(i, j);
    const end = predicateEnd(expr, j);
    const pred = expr.slice(j, end);
    const on = `root.child('orgs/' + ${codeOf(pred)} + '/access').exists()`;
    out += `((!${on} && ${pred}) || (${on} && ${toOrgs(pred)}))`;
    i = end;
  }
  return out;
}

function walk(node) {
  if (!node || typeof node !== 'object') return node;
  const out = {};
  for (const [k, v] of Object.entries(node)) out[k] = k[0] === '.' ? wrap(v) : walk(v);
  return out;
}

function build() {
  const src = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));
  const rules = {};
  for (const [k, v] of Object.entries(src.rules)) rules[k] = k === 'workspaces' || k === 'orgs' ? v : walk(v);
  return JSON.stringify({ rules }, null, 2) + '\n';
}

module.exports = { build, wrap, toOrgs, SOURCE, OUT };

if (require.main === module) {
  const out = build();
  const now = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (process.argv.includes('--check')) {
    console.log(out === now ? 'database.rules.json is up to date' : 'database.rules.json is out of date: run node tools/rules-build.js');
    process.exit(out === now ? 0 : 1);
  }
  fs.writeFileSync(OUT, out);
  console.log('wrote database.rules.json (' + out.length + ' bytes)');
}
