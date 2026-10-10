/* Email from the club (functions/mail.js; SERVER.md, *Email*), on the fake
   server with functions/index.js required as deployed and a mailer that
   records what it was handed.

   The server sends in the club's name with admin credentials, so this holds
   it to what the rules would have: an invitation only for an invite of this
   club with an address on it, unspent and unexpired, asked for by an admin
   or by whoever made it (the address from the invite, never the ask); a
   team's notice only from an admin, a coach or a helper of that team, to
   its families held to the squad, one message each, no address in anyone
   else's mail; nothing for a retired club, a stale ask or a stranger; and,
   with no mailer set up, `nomail` and nothing sent. Then the phone half:
   invitations asked of the club first, the sign-in links only where the
   club cannot send; a notice emailed from the club with the words and the
   team, the families found by the server. */

const H = require('./harness');
const { check, deepEq } = H;
const { makeServer, makeFakebase, orgsLayout } = require('./fakebase');
const mail = require('../functions/mail');

const LATER = Date.now() + 7 * 864e5;
const CLUB = () => ({
  access: {
    org: { name: 'Lakeside SC' },
    admins: { adm: true },
    index: { adm: true, coach: true, helper: true, trk: true, mum: true, gran: true, dad: true, other: true },
    members: { adm: { name: 'Ada', email: 'ada@x.com' }, coach: { name: 'Jaz', email: 'jaz@x.com' }, mum: { name: 'Mo', email: 'Mo@X.com' }, gran: { name: 'Gran' }, dad: { name: 'Dev', email: 'dev@x.com' }, other: { name: 'Ox', email: 'ox@x.com' } },
    teams: { t1: { coaches: { coach: true }, helpers: { helper: true }, trackers: { trk: true } }, t2: { coaches: { other: true } } },
    teamIndex: { t1: { coach: 'coach', helper: 'helper', trk: 'tracker' }, t2: { other: 'coach' } },
    // dad is in the table but not on the squad any more: the table says, the squad disagrees
    teamParents: { t1: { mum: 'p1', gran: 'p2', dad: 'p1' }, t2: { } }
  },
  teams: {
    t1: { id: 't1', name: 'Flight', players: { p1: { id: 'p1', name: 'Ella', number: '7', guardians: { mum: true } }, p2: { id: 'p2', name: 'Rosa', number: '9', guardians: { gran: true } } } },
    t2: { id: 't2', name: 'Storm', players: {} }
  },
  matches: {}
});
const inv = (extra = {}) => ({ ws: 'CLUB', role: 'parent', team: 't1', teamName: 'Flight', player: 'p2', playerNo: '9', by: 'adm', byName: 'Ada', expiresAt: LATER, clubName: 'Lakeside SC', email: 'new@x.com', ...extra });
function server(edit, mailer = true) {
  const db = {
    workspaces: { CLUB: CLUB() },
    invites: {
      iA: inv(), iC: inv({ role: 'coach', player: null, playerNo: null, email: 'c@x.com' }), iP: inv({ role: 'player', by: 'coach', byName: 'Jaz', email: 'kid@x.com' }),
      iNo: inv({ email: null }), iUsed: inv({ used: { by: 'x', at: 1 } }), iOld: inv({ expiresAt: Date.now() - 1 }), iElse: inv({ ws: 'OTHER' })
    }
  };
  for (const v of Object.values(db.invites)) for (const k of Object.keys(v)) if (v[k] === null) delete v[k];
  if (edit) edit(db);
  if (mailer) process.env.SOCCER_SMTP_URL = 'smtps://u:p@mail.example:465'; else delete process.env.SOCCER_SMTP_URL;
  process.env.SOCCER_MAIL_FROM = mailer ? 'club@example.com' : '';
  process.env.SOCCER_SITE = 'https://club.example/index.html';
  const S = makeServer(db);
  // nodemailer, as index.js loads it only with a URL: what it was handed, by address
  const sent = [];
  const Module = require('module'), real = Module._load;
  Module._load = function (req) { return req === 'nodemailer' ? { createTransport: () => ({ sendMail: m => { sent.push(m); return Promise.resolve(); } }) } : real.apply(this, arguments); };
  S.loadFunctions();
  S.mails = sent;
  S.unload = () => { Module._load = real; };
  return S;
}
let n = 0;
const ask = (S, uid, v) => S.fire(`mailAsks/CLUB/${uid}/m${++n}`, { at: Date.now(), ...v }).then(r => r.mailAsk);

(async () => {
  console.log('--- what is deployed ---');
  {
    const S = server();
    check('an ask wakes the mailer', S.woken('mailAsks/CLUB/adm/x').join(), 'mailAsk');
    check('its answer wakes nothing', S.woken('mailAsks/CLUB/adm/x/answer').length, 0);
    check('the SMTP secret is the function\'s, declared', (S.triggers.mailAsk.opts.secrets || []).map(s => s.name).join(), 'SOCCER_SMTP_URL');
    S.unload();
  }

  console.log('\n--- invitations, from the club ---');
  {
    const S = server();
    const a = await ask(S, 'adm', { op: 'invites', ids: ['iA', 'iC', 'iP', 'iNo', 'iUsed', 'iOld', 'iElse', 'iGone', 'bad/id'] });
    deepEq('an admin: every invite of this club with an address, unspent and in date', a.sent, ['iA', 'iC', 'iP']);
    deepEq('and why each of the others was not', a.skipped, { iNo: 'noemail', iUsed: 'used', iOld: 'expired', iElse: 'gone', iGone: 'gone', 'bad/id': 'bad' });
    const m = S.mails.find(x => x.to === 'new@x.com');
    check('to the invite\'s address, from the club\'s', [m.to, m.from].join(), 'new@x.com,club@example.com');
    check('an invitation, not a sign-in link', m.subject, 'Ada has invited you to Lakeside SC');
    check('saying what, by shirt number, never a child\'s name', /the parent of #9 on Flight/.test(m.text) && !/Rosa|Ella/.test(m.text), true);
    check('with the link, to the site', m.text.includes('https://club.example/index.html?invite=iA'), true);
    check('and that it works once, for this address', /works once, for this address only, and for 7 days/.test(m.text), true);
    check('a coach\'s invite says so', /a coach of Flight/.test(S.mails.find(x => x.to === 'c@x.com').text), true);
    check('the answer beside the ask', !!S.at(`mailAsks/CLUB/adm/m${n}/answer/ok`), true);
    const b = await ask(S, 'coach', { op: 'invites', ids: ['iA', 'iP'] });
    deepEq('a coach: only the invite she made herself', [b.sent, b.skipped], [['iP'], { iA: 'notyours' }]);
    for (const [who, label] of [['trk', 'a tracker'], ['mum', 'a family'], ['rando', 'a stranger']]) {
      const before = S.mails.length;
      const r = await S.fire(`mailAsks/CLUB/${who}/x${++n}`, { at: Date.now(), op: 'invites', ids: ['iA'] });
      check(`${label} sends nothing`, [JSON.stringify((r.mailAsk || {}).sent || []), S.mails.length - before].join(), '[],0');
    }
    const c = await S.fire('mailAsks/CLUB/adm/old', { at: Date.now() - 3600000, op: 'invites', ids: ['iA'] });
    check('an ask an hour old is not acted on', c.mailAsk.why, 'stale');
    check('nothing a phone could not have written is written', Object.keys(S.tree).sort().join(), 'invites,mailAsks,workspaces');
    S.unload();
  }
  {
    const S = server(db => { db.retired = { CLUB: true }; });
    check('a retired club sends nothing', (await ask(S, 'adm', { op: 'invites', ids: ['iA'] })).why + S.mails.length, 'retired0');
    S.unload();
  }

  console.log('\n--- a notice to the team\'s families ---');
  {
    const S = server();
    const a = await ask(S, 'coach', { op: 'team', tid: 't1', subject: 'Flight: message from Jaz', text: 'Practice moved to 6.\nBring water.' });
    deepEq('one message per family on the squad, nobody else', [a.ok, a.sent, a.of, S.mails.map(m => m.to).sort()], [true, 1, 1, ['mo@x.com']]);
    const m = S.mails[0];
    check('her words, with the club\'s name after', [m.subject, /Practice moved to 6\.\nBring water\.\n\n— sent by Lakeside SC through Minutes/.test(m.text)].join(), 'Flight: message from Jaz,true');
    check('no address in anyone else\'s mail', 'bcc' in m || 'cc' in m, false);
    check('a family in the table but off the squad is not written to', S.mails.some(x => x.to === 'dev@x.com'), false);
    check('a family with no address is counted out', a.failed, 0);
    S.mails.length = 0;
    check('an admin may', (await ask(S, 'adm', { op: 'team', tid: 't1', text: 'Hi' })).sent, 1);
    check('a helper may', (await ask(S, 'helper', { op: 'team', tid: 't1', text: 'Hi' })).sent, 1);
    check('with a subject of its own when she gave none', S.mails[0].subject, 'Flight: a message from the coach');
    S.mails.length = 0;
    for (const [who, label] of [['trk', 'a tracker'], ['other', 'a coach of another team'], ['mum', 'a family'], ['rando', 'a stranger']]) {
      const r = await ask(S, who, { op: 'team', tid: 't1', text: 'Hi' });
      check(`${label} is refused`, [r.ok, r.why, S.mails.length].join(), 'false,notyours,0');
    }
    check('a team that is not there', (await ask(S, 'adm', { op: 'team', tid: 'nope', text: 'Hi' })).why, 'gone');
    check('nothing to say', (await ask(S, 'adm', { op: 'team', tid: 't1', text: '  ' })).why, 'bad');
    S.unload();
  }

  console.log('\n--- no mailer set up ---');
  {
    const S = server(null, false);
    const a = await ask(S, 'adm', { op: 'invites', ids: ['iA'] });
    check('answered as such, nothing sent', [a.why, S.mails.length].join(), 'nomail,0');
    S.unload();
  }

  console.log('\n--- the phone ---');
  {
    const CONFIG = { apiKey: 'k', databaseURL: 'https://x', projectId: 'p' };
    const boot = async (who, opts = {}) => {
      const fbk = makeFakebase();
      if (opts.refuse) fbk.refuseWrites(p => /^mailAsks\//.test(p));
      const A = H.loadApp({ firebase: fbk, config: CONFIG, window: { SOCCER_SERVER: true }, storage: { 'sm.workspace': 'CLUB' } });
      await A.flush(); fbk.signIn(who, { name: who }); await A.flush();
      fbk.deliver('.info/connected', true);
      await fbk.serve('orgs/CLUB', orgsLayout(CLUB()), () => A.flush()); await A.flush(10);
      return { A, fbk };
    };
    const asks = fbk => fbk.record.writes.filter(w => /^mailAsks\//.test(w.path));
    {
      const { A, fbk } = await boot('adm');
      A.importContacts = { list: [{ role: 'parent', team: 'Flight', player: 'Rosa', email: 'new@x.com' }], made: {}, sent: {} };
      // the invite made already (inviteImported() is pinned in test/invites.js); only the sending is asked here
      const ids = A.importInviteRows().map(r => r.key);
      A.importContacts.made[ids[0]] = 'iA';
      const p = A.mailImported(); await A.flush();
      const ask = asks(fbk)[0];
      check('the invitations are asked of the club, by id, in her own name', [ask && ask.path.startsWith('mailAsks/CLUB/adm/'), ask && ask.value.op, JSON.stringify(ask && ask.value.ids)].join(), 'true,invites,["iA"]');
      check('no sign-in link goes from her phone', fbk.record.mails.length, 0);
      fbk.deliver(ask.path + '/answer', { ok: true, sent: ['iA'], at: 1 }); await p; await A.flush();
      check('sent: marked so, and said', [A.importContacts.sent[ids[0]], /The club emailed 1 invitation/.test(A.lastToast())].join(), 'true,true');
    }
    {
      const { A, fbk } = await boot('adm');
      A.importContacts = { list: [{ role: 'parent', team: 'Flight', player: 'Rosa', email: 'new@x.com' }], made: {}, sent: {} };
      const ids = A.importInviteRows().map(r => r.key);
      A.importContacts.made[ids[0]] = 'iA';
      const p = A.mailImported(); await A.flush();
      fbk.deliver(asks(fbk)[0].path + '/answer', { ok: false, why: 'nomail', at: 1 }); await p; await A.flush();
      check('no mailer at the club: the sign-in link goes from her phone, as before', fbk.record.mails.map(m => m.email).join(), 'new@x.com');
      A.importContacts.sent = {};
      await A.mailImported(); await A.flush();
      check('and the club is not asked again this session', asks(fbk).length, 1);
    }
    {
      const { A, fbk } = await boot('adm', { refuse: true });
      A.importContacts = { list: [{ role: 'parent', team: 'Flight', player: 'Rosa', email: 'new@x.com' }], made: {}, sent: {} };
      A.importContacts.made[A.importInviteRows()[0].key] = 'iA';
      await A.mailImported(); await A.flush(20);
      check('rules too old for the ask: the sign-in link, as before', fbk.record.mails.map(m => m.email).join(), 'new@x.com');
    }
    {
      const { A, fbk } = await boot('coach');
      await fbk.serve('board/CLUB/t1', { n1: { by: 'coach', byName: 'Jaz', text: 'Practice moved to 6', at: 1 } }, () => A.flush());
      A.sheetPostShare('t1', 'n1');
      const sheet = String(A.dom.node('#sheet').innerHTML);
      check('the share sheet offers the club\'s email first, her own app still', /Email the parents from the club \(1\)/.test(sheet) && /mailto:/.test(sheet), true);
      A.click({ act: 'postmail', tid: 't1', id: 'n1' }); await A.flush();
      const ask = asks(fbk)[0];
      deepEq('the notice goes as the team and her words, no addresses', [ask.value.op, ask.value.tid, ask.value.text, 'to' in ask.value], ['team', 't1', 'Practice moved to 6', false]);
      fbk.deliver(ask.path + '/answer', { ok: true, sent: 1, failed: 0, of: 1, at: 1 }); await A.flush(10);
      check('said', /The club emailed 1 family/.test(A.lastToast()), true);
      const before = asks(fbk).length;
      A.me = { uid: 'mum', name: 'Mum' };
      A.click({ act: 'postmail', tid: 't1', id: 'n1' }); await A.flush();
      check('a family tapping it is refused in the handler', [asks(fbk).length - before, A.lastToast()].join(), '0,Only the team\'s coaches post to it');
    }
  }

  H.summary('email from the club');
})().catch(e => { console.error(e); process.exit(1); });
