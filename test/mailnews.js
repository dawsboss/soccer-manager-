/* What the club emails by itself (functions/mailnews.js; SERVER.md, *Email*),
   on the fake server with functions/index.js required as deployed and a
   mailer that records what it was handed; and a training session's families
   emailed from the club when its coach asks (functions/mail.js, `session`),
   with the phone half.

   Each email is about one child and goes to her family alone, found as the
   rules find them (a squad record's guardians, a child's own record), never
   from what a family's phone wrote: a registration's news (a draft to
   finish, received, accepted, waiting, not this time, placed on a team), a
   receipt for a payment the club recorded (never a waived fee or a package
   place), and once a day the sessions still to pay (three to fourteen days
   on, once a place, one email per family, off when the club says). Each is
   said once, an event delivered twice included; nothing for a retired club
   or with no mailer; an unconfirmed account address is never written to. */

const H = require('./harness');
const { check, deepEq } = H;
const { makeServer, makeFakebase, orgsLayout } = require('./fakebase');
const mailnews = require('../functions/mailnews');

const DAY = 864e5;
const day = n => new Date(Date.now() - n * DAY).toISOString().slice(0, 10);
const CLUB = () => ({
  access: {
    org: { name: 'Lakeside SC', money: '£' },
    admins: { adm: true },
    index: { adm: true, coach: true, other: true, trk: true, mum: true, gran: true, newfam: true },
    members: { adm: { name: 'Ada', email: 'ada@x.com' }, coach: { name: 'Jaz', email: 'jaz@x.com' }, other: { name: 'Ox', email: 'ox@x.com' }, mum: { name: 'Mo', email: 'Mo@X.com' }, gran: { name: 'Gran', email: 'gran@x.com' } },
    teams: { t1: { coaches: { coach: true }, trackers: { trk: true } }, t2: { coaches: { other: true } } },
    teamIndex: { t1: { coach: 'coach', trk: 'tracker' }, t2: { other: 'coach' } },
    coachIndex: { coach: 't1', other: 't2' },
    teamParents: { t1: { mum: 'p1', gran: 'p2' } }
  },
  teams: {
    t1: { id: 't1', name: 'U11 Storm', players: { p1: { id: 'p1', name: 'Ella Brown', number: '7', guardians: { mum: true }, child: 'p1' }, p2: { id: 'p2', name: 'Rosa', number: '9', guardians: { gran: true } }, p3: { id: 'p3', name: 'Ivy', number: '4', guardians: { mum: true } } } },
    t2: { id: 't2', name: 'Flight', players: {} }
  },
  children: {
    p1: { id: 'p1', first: 'Ella', last: 'Brown', born: '2015-03-01', family: { mum: 'link1' }, guardians: { mum: 't1' }, teams: { t1: 'p1' } },
    // made through the registration link by a family not in the club: no member entry
    c2: { id: 'c2', first: 'Noor', born: '2015-06-01', family: { newfam: 'link1', sneaky: 'link1' } }
  },
  programs: {
    pr1: { id: 'pr1', name: 'Fall 2026', kind: 'season', fee: 150, feeNote: 'two instalments' },
    pr2: { id: 'pr2', name: 'Winter skills', kind: 'sessions' }
  },
  matches: {}
});
function server(edit, mailer = true) {
  const db = { workspaces: { CLUB: CLUB() }, training: { CLUB: {} }, userOrgs: { adm: { CLUB: true }, mum: { CLUB: true } } };
  if (edit) edit(db);
  if (mailer) process.env.SOCCER_SMTP_URL = 'smtps://u:p@mail.example:465'; else delete process.env.SOCCER_SMTP_URL;
  process.env.SOCCER_MAIL_FROM = mailer ? 'club@example.com' : '';
  process.env.SOCCER_SITE = 'https://club.example/index.html';
  const S = makeServer(db);
  S.users.newfam = { uid: 'newfam', email: 'New@Fam.com', emailVerified: true };
  S.users.sneaky = { uid: 'sneaky', email: 'someone@else.com', emailVerified: false };
  const sent = [];
  const Module = require('module'), real = Module._load;
  Module._load = function (req) { return req === 'nodemailer' ? { createTransport: () => ({ sendMail: m => { sent.push(m); return Promise.resolve(); } }) } : real.apply(this, arguments); };
  S.loadFunctions();
  S.mails = sent;
  S.unload = () => { Module._load = real; };
  return S;
}
const R = 'workspaces/CLUB/regs/';
const T = 'training/CLUB/';
const tos = S => S.mails.map(m => m.to).sort();
// a trigger run again with the same before and after, as a redelivered event is
const again = (S, name, path, params, before, after) => S.triggers[name].handler({ params, data: { before: { val: () => before }, after: { val: () => after, ref: S.ref(path) } } });

(async () => {
  console.log('--- what is deployed ---');
  {
    const S = server();
    check('a registration wakes its email', S.woken(R + 'pr1/p1').includes('mailReg'), true);
    check('a fee recorded wakes a receipt', S.woken(T + 'fees/s1/p1').join(), 'mailFee');
    check('a package sold too', S.woken(T + 'packs/t1/p1/k1').join(), 'mailPack');
    check('the fees due run once a day, at a set hour', [S.triggers.mailFeesDue.kind, S.triggers.mailFeesDue.opts.schedule].join(), 'schedule,every day 15:00');
    for (const n of ['mailReg', 'mailFee', 'mailPack', 'mailFeesDue']) check(`${n} declares the SMTP secret`, (S.triggers[n].opts.secrets || []).map(s => s.name).join(), 'SOCCER_SMTP_URL');
    const ran = await S.wouldWake('workspaces/CLUB/matches/m1', { id: 'm1', goals: { g1: { pid: 'p1', at: 1 } } });
    check('a game being played wakes no email', ran.filter(n => /^mail/.test(n)).length, 0);
    S.unload();
  }

  console.log('\n--- registration ---');
  {
    const S = server();
    await S.fire(R + 'pr1/p1', { st: 'draft', by: 'coach', at: 1 });
    check('a staff draft: her family is asked to finish it', [tos(S).join(), S.mails[0].subject].join(), 'mo@x.com,Lakeside SC: please finish Ella\'s registration for Fall 2026');
    check('  saying what only she can do, and where', /questions, and its waivers, which only a family can agree to/.test(S.mails[0].text) && S.mails[0].text.includes('https://club.example/index.html'), true);
    check('  from the club\'s address', S.mails[0].from, 'club@example.com');
    S.mails.length = 0;
    await S.fire(R + 'pr1/p1', { st: 'sent', by: 'coach', at: 1, sentBy: 'mum', answers: { q1: 'yes' }, fam: { name: 'Mo', email: 'attacker@x.com' } });
    const m = S.mails[0];
    check('sent: received, to the family on the child, never the address the form carried', [tos(S).join(), m.subject].join(), 'mo@x.com,Lakeside SC: registration received for Ella');
    check('  the fee, as the program shows it, in the club\'s money', /The fee is £150 \(two instalments\)\. The club will tell you how to pay it\./.test(m.text), true);
    check('  her first name only, no other child, no birth date', !/Brown|Rosa|Ivy|Noor|2015/.test(m.text), true);
    check('  with the club named after', /— sent by Lakeside SC through TeamPlayHQ, https:\/\/club\.example\/index\.html$/.test(m.text), true);
    S.mails.length = 0;
    await S.fire(R + 'pr1/p1/answers/q1', 'no');
    check('an answer changed says nothing', S.mails.length, 0);
    const now = S.at(R + 'pr1/p1');
    await again(S, 'mailReg', 'orgs/CLUB/regs/pr1/p1', { code: 'CLUB', progId: 'pr1', cid: 'p1' }, { ...now, st: 'draft' }, now);
    check('the same event delivered twice: one email', S.mails.length, 0);
    for (const [st, re] of [['waitlist', /on the waiting list for Fall 2026/], ['accepted', /places Ella on a team next/], ['declined', /cannot offer Ella a place in Fall 2026 this time/]]) {
      S.mails.length = 0;
      await S.fire(R + 'pr1/p1/st', st);
      check(`${st}: said to her family`, [tos(S).join(), re.test(S.mails[0] && S.mails[0].text)].join(), 'mo@x.com,true');
    }
    S.mails.length = 0;
    await S.fire(R + 'pr1/p1/st', 'accepted');
    S.mails.length = 0;
    await S.fire(R + 'pr1/p1', { ...S.at(R + 'pr1/p1'), team: 't1', st: 'placed' });
    check('placed: your child is on the team, with her coach', [S.mails[0].subject, /has placed Ella on U11 Storm\. Coach: Jaz\./.test(S.mails[0].text)].join(), 'Ella is on U11 Storm,true');
    S.mails.length = 0;
    await S.fire(R + 'pr1/p1/st', 'withdrawn');
    check('withdrawn by her family: nothing, she did it', S.mails.length, 0);
    check('nothing written but the server\'s own notes', Object.keys(S.at('serverState')).join(), 'regMail');
    S.unload();
  }
  {
    const S = server();
    await S.fire(R + 'pr2/c2', { st: 'sent', by: 'newfam', at: 1, sentBy: 'newfam', fam: { name: 'N', email: 'n@x.com' } });
    check('a family not in the club yet: her account\'s confirmed address, never an unconfirmed one', tos(S).join(), 'new@fam.com');
    S.mails.length = 0;
    await S.fire(R + 'pr2/c2/st', 'accepted');
    check('a sessions program: she books sessions from now on', /Noor can book training sessions in TeamPlayHQ from now on/.test(S.mails[0].text), true);
    S.unload();
  }
  {
    const S = server(db => { db.retired = { CLUB: true }; });
    await S.fire(R + 'pr1/p1', { st: 'sent', by: 'mum', at: 1 });
    check('a retired club sends nothing', S.mails.length, 0);
    S.unload();
  }
  {
    const S = server(null, false);
    const r = await S.fire(R + 'pr1/p1', { st: 'sent', by: 'mum', at: 1 });
    check('no mailer: nothing sent, nothing noted', [r.mailReg.skip, S.mails.length, S.at('serverState')].join(), 'nomail,0,');
    S.unload();
  }

  console.log('\n--- receipts ---');
  {
    const S = server(db => {
      db.training.CLUB = {
        sessions: { s1: { id: 's1', kind: 'group', title: 'Finishing', coach: 'coach', coachName: 'Jaz', date: day(2), price: 20 } },
        booked: { s1: { p1: { tid: 't1', st: 'in' }, p2: { tid: 't1', st: 'in' }, c2: { child: true, st: 'in' } } }
      };
    });
    await S.fire(T + 'fees/s1/p1', { paid: 20, how: 'cash', at: Date.now(), by: 'coach', byName: 'Jaz' });
    const m = S.mails[0];
    check('a fee marked paid: a receipt to her family alone', [tos(S).join(), m.subject].join(), 'mo@x.com,Lakeside SC: receipt for Ella\'s training session');
    check('  what, when, how much and how', /Finishing with Jaz, .+\nPaid: £20, cash\nRecorded by Jaz on /.test(m.text), true);
    check('  and that TeamPlayHQ took no payment', /TeamPlayHQ does not take payments/.test(m.text), true);
    S.mails.length = 0;
    await S.fire(T + 'fees/s1/p1', { paid: 20, how: 'cash', at: Date.now() + 5, by: 'adm', byName: 'Ada' });
    check('the same payment written again: nothing', S.mails.length, 0);
    await again(S, 'mailFee', T + 'fees/s1/p1', { code: 'CLUB', sid: 's1', pid: 'p1' }, null, S.at(T + 'fees/s1/p1'));
    check('an event delivered twice: nothing', S.mails.length, 0);
    await S.fire(T + 'fees/s1/p2', { paid: 0, how: 'waived', at: 1, by: 'coach' });
    await S.fire(T + 'fees/s1/p2', null);
    await S.fire(T + 'fees/s1/p2', { paid: 0, how: 'package', pack: 'k1', at: 1, by: 'coach' });
    check('waived, cleared or from a package: no receipt', S.mails.length, 0);
    await S.fire(T + 'fees/s1/c2', { paid: 15.5, how: 'transfer', at: 1, by: 'coach' });
    check('a child on no team: her own record\'s family', [tos(S).join(), /Paid: £15\.50, bank transfer/.test(S.mails[0].text)].join(), 'new@fam.com,true');
    S.mails.length = 0;
    await S.fire(T + 'packs/t1/p3/k1', { id: 'k1', n: 10, price: 180, kind: 'one', until: '2027-06-30', paid: 180, how: 'card', at: 1, by: 'adm', byName: 'Ada' });
    check('a package sold: a receipt', [tos(S).join(), /A package of 10 1-1 sessions, to use by .+\nPaid: £180, card/.test(S.mails[0].text), /Ivy/.test(S.mails[0].subject)].join(), 'mo@x.com,true,true');
    S.mails.length = 0;
    await S.fire(T + 'packs/t1/p3/k1', { ...S.at(T + 'packs/t1/p3/k1'), note: 'thanks' });
    check('the package changed but not what was paid: nothing', S.mails.length, 0);
    await S.fire(T + 'packs/t1/p3/k2', { id: 'k2', n: 5, price: 90, kind: 'any', paid: 0, how: 'cash', at: 1 });
    check('a package with nothing paid yet: nothing', S.mails.length, 0);
    S.unload();
  }

  console.log('\n--- fees due ---');
  const DUE = db => {
    db.training.CLUB = {
      sessions: {
        s1: { id: 's1', kind: 'group', title: 'Finishing', coachName: 'Jaz', date: day(4), price: 20 },
        s2: { id: 's2', kind: 'one', coachName: 'Jaz', date: day(5), price: 35 },
        sNew: { id: 'sNew', kind: 'group', date: day(1), price: 20 },
        sOld: { id: 'sOld', kind: 'group', date: day(20), price: 20 },
        sOff: { id: 'sOff', kind: 'group', date: day(4), price: 20, called: 'cancelled' },
        sFree: { id: 'sFree', kind: 'group', date: day(4), price: 0 }
      },
      booked: {
        s1: { p1: { tid: 't1', st: 'in' }, p2: { tid: 't1', st: 'in' }, p3: { tid: 't1', st: 'wait' } },
        s2: { p3: { tid: 't1', st: 'in' } },
        sNew: { p1: { tid: 't1', st: 'in' } }, sOld: { p1: { tid: 't1', st: 'in' } }, sOff: { p1: { tid: 't1', st: 'in' } }, sFree: { p1: { tid: 't1', st: 'in' } }
      },
      fees: { s1: { p2: { paid: 20, how: 'cash' } } }
    };
  };
  {
    const S = server(DUE);
    const r = await S.tick('mailFeesDue');
    check('one email per family, listing all of hers', tos(S).join(), 'mo@x.com');
    const m = S.mails[0];
    check('  each place that ran three to fourteen days ago, unpaid, with a price', [/Finishing with Jaz \(Ella\): £20/.test(m.text), /1-1 session with Jaz \(Ivy\): £35/.test(m.text), /£55 in all/.test(m.text)].join(), 'true,true,true');
    check('  never too soon, too old, called off, free, waiting or paid', [m.text.split('\n').filter(l => l.startsWith('• ')).length, /Rosa/.test(m.text)].join(), '2,false');
    check('  and kind to a family who paid already', /may not have marked it yet/.test(m.text), true);
    check('  as the club counted', r.CLUB.places, 2);
    S.mails.length = 0;
    await S.tick('mailFeesDue');
    check('the next day: each place is said once', S.mails.length, 0);
    S.unload();
  }
  {
    const S = server(db => { DUE(db); db.workspaces.CLUB.access.org.feeMail = false; });
    await S.tick('mailFeesDue');
    check('a club that turned it off: nothing', S.mails.length, 0);
    S.unload();
  }
  {
    const S = server(DUE, false);
    check('no mailer: nothing', (await S.tick('mailFeesDue')).skip, 'nomail');
    S.unload();
  }

  console.log('\n--- a training session\'s families, from the club ---');
  {
    const S = server(db => {
      db.training.CLUB = {
        sessions: { s1: { id: 's1', kind: 'group', coach: 'coach', date: day(-2), price: 20 }, s2: { id: 's2', kind: 'group', coach: 'other', date: day(-2) } },
        booked: { s1: { p1: { tid: 't1', st: 'in' }, p2: { tid: 't1', st: 'asked' }, p3: { tid: 't1', st: 'no' }, c2: { child: true, st: 'wait' } } }
      };
    });
    let n = 0;
    const ask = (uid, v) => S.fire(`mailAsks/CLUB/${uid}/s${++n}`, { at: Date.now(), op: 'session', subject: 'Finishing, Sat', text: 'Bring water', ...v }).then(r => r.mailAsk);
    const a = await ask('coach', { sids: ['s1'] });
    deepEq('the coach running it: every family booked, asked or waiting, one each', [a.ok, a.sent, tos(S)], [true, 3, ['gran@x.com', 'mo@x.com', 'new@fam.com']]);
    check('her words and subject, the club named after', [S.mails[0].subject, /^Bring water\n\n— sent by Lakeside SC/.test(S.mails[0].text)].join(), 'Finishing, Sat,true');
    S.mails.length = 0;
    check('narrowed to one child, for a reminder', [(await ask('coach', { sids: ['s1'], pid: 'p1' })).sent, tos(S).join()].join(), '1,mo@x.com');
    S.mails.length = 0;
    check('an admin may, for any session', (await ask('adm', { sids: ['s1', 's2'] })).sent, 3);
    S.mails.length = 0;
    for (const [who, label] of [['other', 'a coach of another session'], ['trk', 'a tracker'], ['mum', 'a family'], ['rando', 'a stranger']]) {
      const r = await ask(who, { sids: ['s1'] });
      check(`${label} is refused`, [r.ok, r.why, S.mails.length].join(), 'false,notyours,0');
    }
    check('a session that is not there', (await ask('adm', { sids: ['nope'] })).why, 'gone');
    check('nothing to say', (await ask('coach', { sids: ['s1'], text: ' ' })).why, 'bad');
    S.unload();
  }

  console.log('\n--- the phone ---');
  {
    const CONFIG = { apiKey: 'k', databaseURL: 'https://x', projectId: 'p' };
    const fbk = makeFakebase();
    const A = H.loadApp({ firebase: fbk, config: CONFIG, window: { SOCCER_SERVER: true }, storage: { 'sm.workspace': 'CLUB' } });
    await A.flush(); fbk.signIn('coach', { name: 'Jaz' }); await A.flush();
    fbk.deliver('.info/connected', true);
    await fbk.serve('orgs/CLUB', orgsLayout(CLUB()), () => A.flush()); await A.flush(10);
    A.sess.sessions = { s1: { id: 's1', kind: 'group', coach: 'coach', coachName: 'Jaz', date: day(-2), start: '18:00', end: '19:00', price: 20 }, s2: { id: 's2', kind: 'group', coach: 'other', coachName: 'Ox', date: day(-2), start: '18:00', end: '19:00' } };
    A.sess.booked = { s1: { p1: { tid: 't1', st: 'in' } }, s2: { p2: { tid: 't1', st: 'in' } } };
    const asks = () => fbk.record.writes.filter(w => /^mailAsks\//.test(w.path));
    A.click({ act: 'sesstell', id: 's1' }); await A.flush();
    const sheet = String(A.dom.node('#sheet').innerHTML);
    check('a session\'s sheet offers the club\'s email, her own app still', /Email the families from the club/.test(sheet) && /mailto:/.test(sheet), true);
    A.click({ act: 'reachmail' }); await A.flush();
    const q = asks()[0];
    deepEq('the ask names the session and carries her words, no addresses', [q && q.value.op, q && q.value.sids, 'to' in ((q && q.value) || {}), /Jaz/.test(q && q.value.text)], ['session', ['s1'], false, true]);
    fbk.deliver(q.path + '/answer', { ok: true, sent: 1, failed: 0, of: 1, at: 1 }); await A.flush(10);
    check('said', /The club emailed 1 family/.test(A.lastToast()), true);
    A.click({ act: 'sesstell', id: 's1' }); await A.flush();
    A.sess.sessions.s1.coach = 'other';   // given to another coach while the sheet was open
    A.click({ act: 'reachmail' }); await A.flush();
    check('a session she does not run is refused in the handler', [asks().length, A.lastToast()].join(), '1,Only the coach running it, or an admin, can do that');
    A.me = { uid: 'mum', name: 'Mo' };
    A.click({ act: 'sessfeemail', v: '0' }); await A.flush();
    check('only an admin turns the reminders off', [fbk.record.writes.some(w => /feeMail/.test(w.path)), A.lastToast()].join(), 'false,Club admins decide what the club emails');
  }

  H.summary('what the club emails by itself');
})().catch(e => { console.error(e); process.exit(1); });
