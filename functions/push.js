/* Who hears a new notice or family message, and what their phone says.

   The first job the server does (GOTSPORT.md, Build order, step 2). Until it,
   a message reached a phone only while Minutes was open on it; now a trigger
   on each new notice and message works out who may read it and sends to every
   phone they turned notifications on for.

   Nothing in here imports Firebase. index.js hands it three things, `get`,
   `remove` and `send`, bound to the database instance the event came from and
   to Cloud Messaging; test/push.js hands it the fake ones. So the part with the
   judgement in it runs in CI with nothing installed, the same way rules.js
   runs the rules.

   Who: exactly who the rules let read the thing, worked out from the same
   lookup tables the rules read (CLAUDE.md, "Five flat lookup tables"), and
   then held to the squad as well, so a stale table entry can never send a
   child's message to someone the squad no longer names. This function writes
   with admin credentials and bypasses the rules, which is why it checks
   rather than trusts. Two things the rules allow it deliberately leaves out:

   - the bridge clauses. While a club has no `access/teamParents` table the
     rules let anyone indexed read every notice; pushing to every indexed
     account would be wider than any phone shows (`msgTeams()` in app.js), so
     until an admin's phone has built the table, families get no push.
   - the author. Nobody is told about what she wrote herself.

   What: the same title the open app pops up (`msgNews()` in app.js), the
   text cut short, and where to open it. The notification's tag is the
   message id, so a trigger Cloud Functions delivers twice replaces its own
   notification rather than adding a second. */

const BODY_MAX = 240;
const BATCH = 500;   // Cloud Messaging's limit per sendEach call
// tokens Cloud Messaging says are gone for good; any other failure may pass
const DEAD = /(registration-token-not-registered|invalid-registration-token)$/;

const keys = o => Object.keys(o && typeof o === 'object' ? o : {});
const short = s => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > BODY_MAX ? t.slice(0, BODY_MAX - 1) + '…' : t;
};

/* What the club says about one team, read once per event. */
async function teamFacts(env, code, tid) {
  const W = 'workspaces/' + code;
  const [retired, admins, tIndex, tParents, tPlayers, team, members] = await Promise.all([
    env.get('retired/' + code),
    env.get(W + '/access/admins'),
    env.get(W + '/access/teamIndex/' + tid),
    env.get(W + '/access/teamParents/' + tid),
    env.get(W + '/access/teamPlayers/' + tid),
    env.get(W + '/teams/' + tid),
    env.get(W + '/access/members')
  ]);
  return {
    retired: !!retired, admins: admins || {}, tIndex: tIndex || {}, tParents: tParents || {},
    tPlayers: tPlayers || {}, team: team || null, members: members || {}
  };
}
const squad = f => (f.team && f.team.players) || {};
const has = (o, k) => !!(o && typeof o === 'object' && o[k] !== undefined && o[k] !== null && o[k] !== false);
// a family named by the table AND by the squad: the table says which child, the squad has to agree
const parentOn = (f, u) => has(squad(f)[f.tParents[u]] && squad(f)[f.tParents[u]].guardians, u);
// a player's own sign-in, held to her own record the same way
const selfOn = (f, u) => has(squad(f)[f.tPlayers[u]] && squad(f)[f.tPlayers[u]].self, u);
const memberName = (f, u) => {
  const m = f.members[u] || {};
  return m.name || (m.email ? String(m.email).split('@')[0] : '') || '';
};

/* A team notice, board/{code}/{tid}/{id}: the board's read rule, without its
   bridge. Admins, the team's coaches and trackers, its families, and its
   players who sign in themselves. */
function noticeReaders(f) {
  const out = new Set(keys(f.admins));
  for (const u of keys(f.tIndex)) out.add(u);
  for (const u of keys(f.tParents)) if (parentOn(f, u)) out.add(u);
  for (const u of keys(f.tPlayers)) if (selfOn(f, u)) out.add(u);
  return out;
}

/* A family conversation, dm/{code}/{tid}/{fam}/m/{id}: the conversation's
   read rule. The family, the team's coaches (not its trackers), the admins,
   and a player whose own record lists this family as her guardian. Never
   another family. */
function threadReaders(f, fam) {
  const staff = new Set(keys(f.admins));
  for (const [u, role] of Object.entries(f.tIndex)) if (role === 'coach') staff.add(u);
  const family = new Set([fam]);
  for (const u of keys(f.tPlayers)) {
    const p = squad(f)[f.tPlayers[u]];
    if (selfOn(f, u) && has(p && p.guardians, fam)) family.add(u);
  }
  for (const u of staff) family.delete(u);   // a coach whose child is on her team reads it as staff
  return { staff, family };
}

/* Every phone of each person, as one message each. */
async function messagesFor(env, people, data) {
  const out = [];
  const lists = await Promise.all([...people].map(async u => [u, await env.get('pushTokens/' + u)]));
  for (const [u, toks] of lists)
    for (const token of keys(toks))
      out.push({
        token, uid: u,
        message: {
          token,
          data: { ...data(u), uid: u },
          // high: a coach's "we're running late" is no use an hour later; a day, then let it go
          webpush: { headers: { Urgency: 'high', TTL: '86400' } }
        }
      });
  return out;
}

/* Send, and tidy what Cloud Messaging says is dead. A failure for one phone
   never stops the rest. */
async function deliver(env, list) {
  const res = { sent: 0, failed: 0, removed: [] };
  for (let i = 0; i < list.length; i += BATCH) {
    const chunk = list.slice(i, i + BATCH);
    const r = await env.send(chunk.map(x => x.message));
    const each = (r && r.responses) || [];
    for (let j = 0; j < chunk.length; j++) {
      const one = each[j] || {};
      if (one.success) { res.sent++; continue; }
      res.failed++;
      const code = String((one.error && (one.error.code || one.error.errorInfo && one.error.errorInfo.code)) || '');
      if (DEAD.test(code)) {
        const p = 'pushTokens/' + chunk[j].uid + '/' + chunk[j].token;
        await Promise.resolve(env.remove(p)).catch(() => { });
        res.removed.push(p);
      }
    }
  }
  return res;
}

function readable(params, v) {
  return !!(v && typeof v === 'object' && v.by && typeof v.text === 'string' && v.text
    && params && params.code && params.tid && params.id);
}

async function onNotice(env, params, v) {
  if (!readable(params, v)) return { to: [], sent: 0, failed: 0, removed: [] };
  const { code, tid, id } = params;
  const f = await teamFacts(env, code, tid);
  if (f.retired || !f.team) return { to: [], sent: 0, failed: 0, removed: [] };
  const people = noticeReaders(f);
  people.delete(v.by);
  const tn = f.team.name || 'Your team';
  const data = () => ({
    title: `${v.urgent ? 'Urgent · ' : ''}${tn} · ${v.byName || 'a coach'}`,
    body: short(v.text), tag: id, code, hash: '#/messages', urgent: v.urgent ? '1' : ''
  });
  const list = await messagesFor(env, people, data);
  return { to: [...people].sort(), ...(await deliver(env, list)) };
}

async function onMessage(env, params, v) {
  if (!readable(params, v) || !params.fam) return { to: [], sent: 0, failed: 0, removed: [] };
  const { code, tid, fam, id } = params;
  const f = await teamFacts(env, code, tid);
  if (f.retired || !f.team) return { to: [], sent: 0, failed: 0, removed: [] };
  const { staff, family } = threadReaders(f, fam);
  staff.delete(v.by); family.delete(v.by);
  const tn = f.team.name || 'Your team';
  const who = v.byName || 'Someone';
  const famName = memberName(f, fam) || 'A parent';
  const data = u => staff.has(u)
    // the coaches see whose conversation it is, and who in it spoke when it wasn't the family
    ? { title: `${famName} · ${tn}`, body: short(v.by === fam ? v.text : `${who}: ${v.text}`) }
    : { title: `${who} · ${tn}`, body: short(v.text) };
  const people = new Set([...staff, ...family]);
  const list = await messagesFor(env, people, u => ({ ...data(u), tag: id, code, hash: `#/messages/${tid}/${fam}`, urgent: '' }));
  return { to: [...people].sort(), ...(await deliver(env, list)) };
}

module.exports = { onNotice, onMessage, noticeReaders, threadReaders, teamFacts, BODY_MAX, BATCH };
