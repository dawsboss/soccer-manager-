/* Emails the club sends by itself (SERVER.md, *Email*; GOTSPORT.md, *Email*),
   build 136. mail.js sends what somebody asks for; these follow from what
   the club's admins and coaches already do in the app, to the family of the
   one child it is about and nobody else:

   - **Registration** (`onReg`, a registration's `st` changing): a staff-made
     draft for her family to finish, a registration received, accepted, on
     the waiting list, not offered a place, and placed on a team (*your child
     is on U11 Storm*). A family withdrawing her own is told nothing: she did
     it. The family is the child's record's (`family`, `guardians`), never
     the registration's own `fam`, which her phone wrote.
   - **A receipt for a payment the club recorded** (`onFee`, `onPack`): a
     session's fee marked paid in cash, by card, by transfer or another way,
     and a package sold. TeamPlayHQ takes no payments yet (GOTSPORT.md, step
     5), so this is the club's own book of what it was paid, said so; a
     waived fee or a place taken from a package is no payment and sends
     nothing. Card receipts from Stripe, once payments are built, are the
     webhook's and say the same things.
   - **A fee due** (`feesDue`, once a day): each place booked `in` on a
     session that ran three to fourteen days ago, with a price, not called
     off and with no fee recorded, once per place, one email per family
     listing all of hers. Three days, because the coach marks cash taken at
     the session afterwards; fourteen, so turning this on does not chase a
     season's history. An admin turns it off for the club (`org/feeMail`
     false, on Fees).

   Each says a thing once: what was said is noted at serverState/ (which no
   rule grants, so no phone reads or writes it), before sending, so an event
   delivered twice sends one email. A retired club sends nothing, and with no
   mailer set up nothing is attempted.

   A waiver "about to lapse" has nothing to follow: waivers here never lapse
   (the owner, 2026-10-06: nothing expires on a timer), and a new version is
   asked for on the next registration. Nothing in here imports Firebase or a
   mail library; test/mailnews.js hands it fakes. */

const { where } = require('./club');
const { okKey, has, keys, clip, addressOf, placeOf, placeTid, firstOf, money, dayWords, footerOf } = require('./mail');

const PAID_HOW = { cash: 'cash', card: 'card', transfer: 'bank transfer', other: 'paid another way' };
const PACK_KIND = { any: '1-1s or group sessions', one: '1-1 sessions', group: 'group sessions' };
const DUE_FROM = 14, DUE_TO = 3;
const MAX_FAMILIES = 20;
const dayOf = ms => new Date(ms).toISOString().slice(0, 10);
const daysBefore = (now, n) => dayOf(now - n * 864e5);

/* One message to each address the family has, once each. */
async function tell(env, members, fam, m) {
  const to = new Set();
  for (const u of fam.slice(0, MAX_FAMILIES)) { const em = await addressOf(env, members, u); if (em) to.add(em); }
  let sent = 0, failed = 0;
  for (const em of [...to].sort()) {
    try { await env.mail({ to: em, subject: m.subject, text: m.text }); sent++; } catch (e) { failed++; }
  }
  return { sent, failed, of: to.size };
}

/* ---- registration ---- */

function regMail(st, x) {
  const { first, prog, club } = x;
  const site = x.site ? `\n${x.site}` : '';
  const fee = x.fee != null && Number(x.fee) > 0 ? `\n\nThe fee is ${money(x.sign, x.fee)}${x.feeNote ? ` (${x.feeNote})` : ''}. The club will tell you how to pay it.` : '';
  if (st === 'draft') return {
    subject: `${club}: please finish ${first}'s registration for ${prog}`,
    text: `${club} has started ${first}'s registration for ${prog}, and it needs you to finish it: the program's questions, and its waivers, which only a family can agree to.\n\nOpen TeamPlayHQ and sign in with this email address. It is waiting under My players:${site}`
  };
  if (st === 'sent') return {
    subject: `${club}: registration received for ${first}`,
    text: `Thank you. ${club} has ${first}'s registration for ${prog}. The club's admins look at it next, and you will get an email when they have.${fee}\n\nYou can see where it stands, change it or withdraw it in TeamPlayHQ:${site}`
  };
  if (st === 'accepted') return {
    subject: `${club}: ${first} has a place in ${prog}`,
    text: x.kind === 'sessions'
      ? `${club} has accepted ${first}'s registration for ${prog}. ${first} can book training sessions in TeamPlayHQ from now on:${site}`
      : `${club} has accepted ${first}'s registration for ${prog}. The club places ${first} on a team next, and you will get an email when it does.${fee}`
  };
  if (st === 'waitlist') return {
    subject: `${club}: ${first} is on the waiting list for ${prog}`,
    text: `${club} has put ${first} on the waiting list for ${prog}. You will get an email if a place comes free.`
  };
  if (st === 'declined') return {
    subject: `${club}: ${prog}`,
    text: `${club} cannot offer ${first} a place in ${prog} this time. ${first}'s details stay with the club unless you delete them in TeamPlayHQ.`
  };
  if (st === 'placed') return {
    subject: `${first} is on ${x.team}`,
    text: `${club} has placed ${first} on ${x.team}.${x.coaches ? ` ${x.coaches.includes(',') ? 'Coaches' : 'Coach'}: ${x.coaches}.` : ''}\n\nThe team's games and practices are on your calendar in TeamPlayHQ, and the coach's notices come to you there:${site}`
  };
  return null;
}

/* orgs/{code}/regs/{progId}/{cid}, written: a whole registration (the
   family's form, a staff draft) or one field (an admin's `st`). */
async function onReg(env, params, before, after) {
  const { code, progId, cid } = params || {};
  if (!okKey(code) || !okKey(progId) || !okKey(cid)) return { skip: 'bad' };
  const st = after && typeof after === 'object' ? after.st : null, was = before && typeof before === 'object' ? before.st : null;
  if (!st || st === was || !['draft', 'sent', 'accepted', 'waitlist', 'declined', 'placed'].includes(st)) return { skip: 'unchanged' };
  if (st === 'draft' && before) return { skip: 'unchanged' };
  if (st === 'placed' && !okKey(after.team)) return { skip: 'noteam' };
  if (typeof env.mail !== 'function') return { skip: 'nomail' };
  if (await env.get('retired/' + code)) return { skip: 'retired' };
  const mark = `serverState/regMail/${code}/${progId}/${cid}`;
  if ((await env.get(mark)) === st) return { skip: 'said' };
  const L = await where(env.get, code);
  const [child, prog, org, members] = await Promise.all([
    env.get(`${L.base}/children/${cid}`), env.get(`${L.base}/programs/${progId}`), env.get(L.org), env.get(L.members)
  ]);
  if (!child || typeof child !== 'object' || !prog || typeof prog !== 'object') return { skip: 'gone' };
  const club = clip(org && org.name, 80) || 'Your club';
  const x = {
    first: firstOf(child.first), prog: clip(prog.name, 80) || 'its program', kind: prog.kind, club, site: env.site,
    fee: prog.fee, feeNote: clip(prog.feeNote, 120), sign: (org && org.money) || '$'
  };
  if (st === 'placed') {
    const [team, staff] = await Promise.all([env.get(L.team(after.team)), env.get(`${L.access}/teams/${after.team}/coaches`)]);
    x.team = clip(team && team.name, 80) || 'a team';
    x.coaches = keys(staff).map(u => clip(members && members[u] && members[u].name, 80)).filter(Boolean).sort().join(', ');
  }
  const m = regMail(st, x);
  await env.set(mark, st);
  const fam = keys({ ...(child.family || {}), ...(child.guardians || {}) });
  return { st, ...(await tell(env, members, fam, { subject: m.subject, text: m.text + footerOf(club, env.site) })) };
}

/* ---- receipts ---- */

const RECEIPT_NOTE = 'This is the club\'s own record of a payment made to it; TeamPlayHQ does not take payments.';

/* training/{code}/fees/{sid}/{pid}, written by the session's coach or an admin. */
async function onFee(env, params, before, after) {
  const { code, sid, pid } = params || {};
  if (!okKey(code) || !okKey(sid) || !okKey(pid)) return { skip: 'bad' };
  if (!after || typeof after !== 'object' || !PAID_HOW[after.how] || !(Number(after.paid) > 0)) return { skip: 'nopayment' };
  if (before && before.how === after.how && Number(before.paid) === Number(after.paid)) return { skip: 'unchanged' };
  if (typeof env.mail !== 'function') return { skip: 'nomail' };
  if (await env.get('retired/' + code)) return { skip: 'retired' };
  const mark = `serverState/feeMail/${code}/${sid}/${pid}`, said = `${after.paid}|${after.how}`;
  if ((await env.get(mark)) === said) return { skip: 'said' };
  const L = await where(env.get, code), T = `training/${code}`;
  const [s, b, org, members] = await Promise.all([env.get(`${T}/sessions/${sid}`), env.get(`${T}/booked/${sid}/${pid}`), env.get(L.org), env.get(L.members)]);
  const w = s && typeof s === 'object' ? await placeOf(env, L, pid, placeTid(b)) : null;
  if (!w) return { skip: 'gone' };
  const club = clip(org && org.name, 80) || 'Your club', sign = (org && org.money) || '$';
  const what = `${clip(s.title, 80) || (s.kind === 'one' ? '1-1 session' : 'Group session')}${s.coachName ? ` with ${clip(s.coachName, 80)}` : ''}, ${dayWords(s.date)}`;
  await env.set(mark, said);
  return tell(env, members, w.fam, {
    subject: `${club}: receipt for ${w.first}'s training session`,
    text: [`${club} has recorded a payment for ${w.first}:`, '', what, `Paid: ${money(sign, after.paid)}, ${PAID_HOW[after.how]}`,
      `Recorded${after.byName ? ` by ${clip(after.byName, 80)}` : ''} on ${dayWords(dayOf(Number(after.at) || Date.now()))}.`, '', RECEIPT_NOTE].join('\n') + footerOf(club, env.site)
  });
}

/* training/{code}/packs/{tid}/{pid}/{id}, written by an admin selling one. */
async function onPack(env, params, before, after) {
  const { code, tid, pid, id } = params || {};
  if (!okKey(code) || !okKey(tid) || !okKey(pid) || !okKey(id)) return { skip: 'bad' };
  if (!after || typeof after !== 'object' || !PAID_HOW[after.how] || !(Number(after.paid) > 0)) return { skip: 'nopayment' };
  if (before && before.how === after.how && Number(before.paid) === Number(after.paid)) return { skip: 'unchanged' };
  if (typeof env.mail !== 'function') return { skip: 'nomail' };
  if (await env.get('retired/' + code)) return { skip: 'retired' };
  const mark = `serverState/packMail/${code}/${tid}/${pid}/${id}`, said = `${after.paid}|${after.how}`;
  if ((await env.get(mark)) === said) return { skip: 'said' };
  const L = await where(env.get, code);
  const [org, members] = await Promise.all([env.get(L.org), env.get(L.members)]);
  const w = await placeOf(env, L, pid, tid);
  if (!w) return { skip: 'gone' };
  const club = clip(org && org.name, 80) || 'Your club', sign = (org && org.money) || '$';
  const n = Math.max(1, Math.round(Number(after.n) || 1));
  await env.set(mark, said);
  return tell(env, members, w.fam, {
    subject: `${club}: receipt for ${w.first}'s training package`,
    text: [`${club} has recorded a payment for ${w.first}:`, '',
      `A package of ${n} ${PACK_KIND[after.kind] || PACK_KIND.any}${/^\d{4}-\d\d-\d\d$/.test(String(after.until || '')) ? `, to use by ${dayWords(after.until)}` : ''}`,
      `Paid: ${money(sign, after.paid)}, ${PAID_HOW[after.how]}${Number(after.price) > 0 && Number(after.price) !== Number(after.paid) ? ` (the package is ${money(sign, after.price)})` : ''}`,
      `Recorded${after.byName ? ` by ${clip(after.byName, 80)}` : ''} on ${dayWords(dayOf(Number(after.at) || Date.now()))}.`, '', RECEIPT_NOTE].join('\n') + footerOf(club, env.site)
  });
}

/* ---- fees due ---- */

async function feesDueClub(env, code, now) {
  if (await env.get('retired/' + code)) return { skip: 'retired' };
  const L = await where(env.get, code), T = `training/${code}`;
  const org = await env.get(L.org);
  if (org && org.feeMail === false) return { skip: 'off' };
  const sessions = await env.get(`${T}/sessions`);
  const from = daysBefore(now, DUE_FROM), to = daysBefore(now, DUE_TO);
  const due = Object.values(sessions && typeof sessions === 'object' ? sessions : {}).filter(s =>
    s && typeof s === 'object' && okKey(s.id) && !s.called && Number(s.price) > 0 && String(s.date) >= from && String(s.date) <= to);
  const markAt = `serverState/feeDue/${code}`;
  const marks = (await env.get(markAt)) || {};
  // what was said about sessions now out of the window is no longer needed
  for (const sid of keys(marks)) { const s = sessions && sessions[sid]; if (!s || !(String(s.date) >= from)) await env.set(`${markAt}/${sid}`, null); }
  if (!due.length) return { sent: 0 };
  const members = await env.get(L.members);
  const byFam = new Map(), places = [];
  for (const s of due) {
    const [booked, fees] = await Promise.all([env.get(`${T}/booked/${s.id}`), env.get(`${T}/fees/${s.id}`)]);
    for (const [pid, b] of Object.entries(booked && typeof booked === 'object' ? booked : {})) {
      if (!b || b.st !== 'in' || has(fees, pid) || has(marks[s.id], pid)) continue;
      const w = await placeOf(env, L, pid, placeTid(b));
      if (!w) continue;
      places.push([s.id, pid]);
      for (const u of w.fam) { if (!byFam.has(u)) byFam.set(u, []); byFam.get(u).push({ s, first: w.first }); }
    }
  }
  // noted before anything is sent, so a run that dies part way never sends twice
  for (const [sid, pid] of places) await env.set(`${markAt}/${sid}/${pid}`, now);
  const club = clip(org && org.name, 80) || 'Your club', sign = (org && org.money) || '$';
  let sent = 0, failed = 0;
  const said = new Set();
  for (const [u, rows] of byFam) {
    const em = await addressOf(env, members, u);
    if (!em || said.has(em)) continue;
    said.add(em);
    const firsts = [...new Set(rows.map(r => r.first))];
    const total = rows.reduce((n, r) => n + Number(r.s.price), 0);
    const text = [`A reminder from ${club}: ${firsts.join(' and ')}'s training session${rows.length === 1 ? '' : 's'} still to pay.`, '',
      ...rows.sort((a, b) => String(a.s.date).localeCompare(String(b.s.date))).map(r =>
        `• ${dayWords(r.s.date)}, ${clip(r.s.title, 80) || (r.s.kind === 'one' ? '1-1 session' : 'Group session')}${r.s.coachName ? ` with ${clip(r.s.coachName, 80)}` : ''}${firsts.length > 1 ? ` (${r.first})` : ''}: ${money(sign, r.s.price)}`),
      '', `${money(sign, total)} in all. The club will tell you how to pay it.`,
      `If you have paid already, or a package covers it, the club may not have marked it yet; there is nothing more to do.`].join('\n');
    try { await env.mail({ to: em, subject: `${club}: training sessions to pay`, text: text + footerOf(club, env.site) }); sent++; } catch (e) { failed++; }
  }
  return { sent, failed, places: places.length };
}

/* Once a day: every club anybody is in, found from userOrgs as the backups
   find them. One club failing never stops the rest. */
async function feesDue(env, now = Date.now()) {
  if (typeof env.mail !== 'function') return { skip: 'nomail' };
  const people = await env.get('userOrgs');
  const codes = new Set();
  for (const clubs of Object.values(people && typeof people === 'object' ? people : {})) for (const c of keys(clubs)) if (okKey(c)) codes.add(c);
  const out = {};
  for (const code of [...codes].sort()) {
    try { out[code] = await feesDueClub(env, code, now); } catch (e) { out[code] = { failed: String((e && e.message) || e).slice(0, 200) }; }
  }
  return out;
}

module.exports = { onReg, onFee, onPack, feesDue, feesDueClub, regMail, DUE_FROM, DUE_TO };
