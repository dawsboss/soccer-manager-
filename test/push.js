/* Notifications to a closed phone: the server's first job (GOTSPORT.md,
   Build order, step 2).

   Three parts, each tested where it runs:

   - The sender, functions/index.js and functions/push.js, on the fake
     server (test/fakebase.js, makeServer()): the deployed file is required
     with firebase-functions and firebase-admin swapped for fakes, and fed
     writes the way Cloud Functions would. It writes with admin credentials
     and the rules never see it, so what rules.js does for the rules this does
     for it: every kind of account, and who must NOT hear. A push carries the
     message's words to a lock screen; one sent to the wrong person is the
     message read by the wrong person.
   - The page, app.js, on the fake Firebase: turning notifications on and off,
     the token following the account that is signed in, and a tapped
     notification landing in the right club.
   - The service worker, sw.js, run as it is in a sandbox with a fake `self`:
     what it shows, for whom, and where a tap goes. */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const H = require('./harness');
const { check, deepEq } = H;
const { makeFakebase, makeServer } = require('./fakebase');
const push = require('../functions/push');

/* ---------------- the club, as the server reads it ---------------- */

const tok = (who, n = 1) => `fTok_${who}_${n}_0000000000:APA91b-${who}`;
const CLUB = {
  access: {
    org: { name: 'Lakeside SC' },
    admins: { adm: true },
    index: { adm: true, coach: true, trk: true, mum: true, rosamum: true, other: true, dad: true, newbie: true, ella: true },
    members: {
      adm: { name: 'Ada' }, coach: { name: 'Jaz' }, trk: { name: 'Tia' }, mum: { name: 'Mo', email: 'mo@x.test' },
      rosamum: { name: 'Rae' }, other: { name: 'Kim' }, dad: { name: 'Dev' }, ella: { name: 'Ella' }
    },
    teams: { t1: { coaches: { coach: true }, trackers: { trk: true } }, t2: { coaches: { other: true } } },
    teamIndex: { t1: { coach: 'coach', trk: 'tracker' }, t2: { other: 'coach' } },
    // `stale` is still in the table but the squad no longer names her: the table is derived and can lag
    teamParents: { t1: { mum: 'p1', rosamum: 'p2', stale: 'p2' }, t2: { dad: 'q1' } },
    teamPlayers: { t1: { ella: 'p1' } },
    coachIndex: { coach: 't1', other: 't2' }
  },
  teams: {
    t1: { id: 't1', name: 'Flight', players: {
      p1: { id: 'p1', name: 'Ella', number: '7', guardians: { mum: true }, self: { ella: true } },
      p2: { id: 'p2', name: 'Rosa', number: '9', guardians: { rosamum: true } }
    } },
    t2: { id: 't2', name: 'Storm', players: { q1: { id: 'q1', name: 'Gia', number: '3', guardians: { dad: true } } } }
  },
  matches: {}
};
const EVERYONE = ['adm', 'coach', 'trk', 'mum', 'rosamum', 'other', 'dad', 'newbie', 'ella', 'stale'];
function server(extra) {
  const tokens = {};
  for (const u of EVERYONE) tokens[u] = { [tok(u)]: { at: 1, ua: 'iPhone' } };
  tokens.coach[tok('coach', 2)] = { at: 1, ua: 'Mac' };   // a coach with two phones gets it on both
  const S = makeServer({ workspaces: { CLUB: JSON.parse(JSON.stringify(CLUB)) }, pushTokens: tokens, ...(extra || {}) });
  S.loadFunctions();
  return S;
}
const owners = S => [...new Set(S.sent().map(m => m.data.uid))].sort();
const toUid = (S, u) => S.sent().filter(m => m.data.uid === u);

(async () => {

  console.log('--- the functions that are deployed ---');
  {
    const S = server();
    deepEq('three triggers, one per thing that is news', Object.keys(S.triggers).filter(n => S.triggers[n].kind === 'created' && /^push/.test(n)).sort(), ['pushMessage', 'pushNotice', 'pushStaffMessage']);
    check('a message between colleagues wakes its sender', S.woken('staffdm/CLUB/coach~other/m/s1').join(), 'pushStaffMessage');
    check('its markers wake nothing', S.woken('staffdm/CLUB/coach~other/got/other').length + S.woken('staffdm/CLUB/coach~other/seen/other').length, 0);
    check('a new notice wakes the notice sender', S.woken('board/CLUB/t1/n1').join(), 'pushNotice');
    check('a new family message wakes the message sender', S.woken('dm/CLUB/t1/mum/m/x1').join(), 'pushMessage');
    check('a read marker under a notice wakes nothing', S.woken('board/CLUB/t1/n1/seen/mum').length, 0);
    check('nor one in a conversation', S.woken('dm/CLUB/t1/mum/seen/coach').length, 0);
    // a live game is a write a second; none of it should cost a function call
    check('nothing in the club itself wakes the message senders', S.woken('workspaces/CLUB/matches/g1/events/e1').length, 0);
    deepEq('the calendar\'s: one for entries, one per field of a game that says when', Object.keys(S.triggers).filter(n => S.triggers[n].kind === 'written' && /^push/.test(n)).sort(), 
      // each once per tree while clubs move to orgs/ (functions/index.js, both())
      ['pushEntry', 'pushEntryOrgs', 'pushGameCalled', 'pushGameCalledOrgs', 'pushGameDate', 'pushGameDateOrgs', 'pushGameKickoff', 'pushGameKickoffOrgs']);
    const src = fs.readFileSync(path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');
    check('it reads from the database the event came from', /event\.data\.ref\.root/.test(src), true);
    check('and never calls an AI model', /anthropic|openai|gemini|generativ/i.test(src + fs.readFileSync(path.join(__dirname, '..', 'functions', 'push.js'), 'utf8')), false);
  }

  console.log('\n--- a team notice: who hears it ---');
  {
    const S = server();
    const r = await S.fire('board/CLUB/t1/n1', { by: 'coach', byName: 'Jaz', at: 5, text: 'Bring water, it is hot' });
    const res = r.pushNotice;
    deepEq('the admins, the team\'s tracker, its families and its player', res.to, ['adm', 'ella', 'mum', 'rosamum', 'trk']);
    deepEq('and those are exactly the phones sent to', owners(S), ['adm', 'ella', 'mum', 'rosamum', 'trk']);
    check('not the coach who wrote it', toUid(S, 'coach').length, 0);
    check('not another age group\'s coach', toUid(S, 'other').length, 0);
    check('nor its families', toUid(S, 'dad').length, 0);
    check('nor someone in the club with no role on the team', toUid(S, 'newbie').length, 0);
    check('nor a family the table still lists but the squad does not', toUid(S, 'stale').length, 0);
    check('one message per phone', res.sent, 5);
    const m = toUid(S, 'mum')[0];
    check('titled the way the open app pops it up', m.data.title, 'Flight · Jaz');
    check('with what the coach wrote', m.data.body, 'Bring water, it is hot');
    check('opening the notices', m.data.hash, '#/messages');
    check('in this club', m.data.code, 'CLUB');
    check('tagged with the notice, so a repeat replaces itself', m.data.tag, 'n1');
    check('addressed to the account it was sent for', m.data.uid, 'mum');
    check('to that phone', m.token, tok('mum'));
    check('sent at once, kept for a day at most', JSON.stringify(m.webpush.headers), JSON.stringify({ Urgency: 'high', TTL: '86400' }));
    check('every value a string, as Cloud Messaging requires', Object.values(m.data).every(v => typeof v === 'string'), true);
    // this club, on whichever tree it is (asking which is a read of the new one's admins and index)
    const reads = S.reads.filter(p => !/^((workspaces|orgs)\/CLUB\/|retired\/CLUB$|pushTokens\/|people\/[^/]+\/mute\/notice$)/.test(p));
    deepEq('it read nothing but this club, each reader\'s switch for notices, and the phones it sent to', reads, []);
    check('and no phone of anyone it did not send to', S.reads.filter(p => /^pushTokens\/(coach|other|dad|newbie|stale)$/.test(p)).length, 0);
  }
  {
    const S = server();
    await S.fire('board/CLUB/t1/n2', { by: 'adm', byName: 'Ada', at: 5, text: 'Pitch 3 is shut', urgent: true });
    check('an admin\'s notice reaches the coach, on both her phones', toUid(S, 'coach').length, 2);
    check('urgent says so first', toUid(S, 'mum')[0].data.title, 'Urgent · Flight · Ada');
    check('and asks to stay on screen', toUid(S, 'mum')[0].data.urgent, '1');
    check('not the admin who wrote it', toUid(S, 'adm').length, 0);
  }
  {
    const S = server();
    await S.fire('board/CLUB/t2/n3', { by: 'other', byName: 'Kim', at: 5, text: 'Storm only' });
    deepEq('another team\'s notice stays with that team', owners(S), ['adm', 'dad']);
  }

  console.log('\n--- two colleagues: who hears it ---');
  {
    const S = server();
    const r = await S.fire('staffdm/CLUB/coach~other/m/s1', { by: 'coach', byName: 'Jaz', at: 5, text: 'Can you take Thursday?' });
    deepEq('the other coach, and nobody else', r.pushStaffMessage.to, ['other']);
    deepEq('those are the only phones sent to', owners(S), ['other']);
    check('not an admin: it is theirs alone', toUid(S, 'adm').length, 0);
    const m = toUid(S, 'other')[0];
    check('titled with who wrote it', m.data.title, 'Jaz');
    check('opening the conversation with her', m.data.hash, '#/messages/with/coach');
    const reads = S.reads.filter(p => !/^((workspaces|orgs)\/CLUB\/access\/(admins|coachIndex|index)$|retired\/CLUB$|pushTokens\/other$|people\/other\/mute\/msg$)/.test(p));
    deepEq('it read the two tables, her switch for messages, and her phones, nothing else', reads, []);
  }
  {
    const S = server();
    const r = await S.fire('staffdm/CLUB/adm~coach/m/s2', { by: 'adm', byName: 'Ada', at: 5, text: 'Fees are due' });
    deepEq('an admin to a coach', r.pushStaffMessage.to, ['coach']);
    check('on both her phones', toUid(S, 'coach').length, 2);
  }
  for (const [label, cid, by] of [
    ['a parent named in the pair is nobody to tell', 'coach~mum', 'coach'],
    ['nor a tracker', 'coach~trk', 'coach'],
    ['an author not in the pair sends nothing', 'coach~other', 'adm'],
    ['nor a pair of one', 'coach~coach', 'coach'],
    ['nor three', 'adm~coach~other', 'adm']
  ]) {
    const S = server();
    const r = await S.fire(`staffdm/CLUB/${cid}/m/s3`, { by, byName: 'x', at: 5, text: 'hi' });
    check(label, (r.pushStaffMessage || { to: [] }).to.length + S.sent().length, 0);
  }
  {
    // a coach who has left the club is not told, and cannot be the one telling
    const S = server();
    await S.fire('workspaces/CLUB/access/coachIndex/other', null);
    const r = await S.fire('staffdm/CLUB/coach~other/m/s4', { by: 'coach', byName: 'Jaz', at: 5, text: 'still there?' });
    check('nobody, once the other is no longer staff', r.pushStaffMessage.to.length + S.sent().length, 0);
  }

  console.log('\n--- a family conversation: who hears it ---');
  {
    const S = server();
    const r = await S.fire('dm/CLUB/t1/mum/m/x1', { by: 'mum', byName: 'Mo', at: 5, text: 'Ella has a cold' });
    deepEq('the admins, the team\'s coach, and Ella on her own sign-in', r.pushMessage.to, ['adm', 'coach', 'ella']);
    check('not the tracker: trackers never read a family\'s conversation', toUid(S, 'trk').length, 0);
    check('never another family on the team', toUid(S, 'rosamum').length, 0);
    check('nor another age group\'s coach', toUid(S, 'other').length, 0);
    check('not the parent who wrote it', toUid(S, 'mum').length, 0);
    const c = toUid(S, 'coach')[0];
    check('the coach sees whose conversation it is', c.data.title, 'Mo · Flight');
    check('and what she said', c.data.body, 'Ella has a cold');
    check('opening that conversation', c.data.hash, '#/messages/t1/mum');
    check('Ella sees it from her mum', toUid(S, 'ella')[0].data.title, 'Mo · Flight');
  }
  {
    const S = server();
    await S.fire('dm/CLUB/t1/mum/m/x2', { by: 'coach', byName: 'Jaz', at: 5, text: 'Get well soon' });
    deepEq('a coach\'s reply: the family, her daughter, the admins', owners(S), ['adm', 'ella', 'mum']);
    check('the family sees who replied', toUid(S, 'mum')[0].data.title, 'Jaz · Flight');
    check('the admins see whose conversation, and who spoke', toUid(S, 'adm')[0].data.title + ' / ' + toUid(S, 'adm')[0].data.body, 'Mo · Flight / Jaz: Get well soon');
    check('not the coach who wrote it, on either phone', toUid(S, 'coach').length, 0);
  }
  {
    const S = server();
    await S.fire('dm/CLUB/t1/rosamum/m/x3', { by: 'rosamum', byName: 'Rae', at: 5, text: 'Rosa is away' });
    check('Ella is not told about another family\'s conversation', toUid(S, 'ella').length, 0);
    check('nor Ella\'s mum', toUid(S, 'mum').length, 0);
  }
  {
    // the player's own record must name the family, whatever the table says
    const S = server();
    S.put('workspaces/CLUB/teams/t1/players/p1/self', null);
    await S.fire('dm/CLUB/t1/mum/m/x4', { by: 'mum', byName: 'Mo', at: 5, text: 'x' });
    check('a player taken off her own record is not told', toUid(S, 'ella').length, 0);
  }
  {
    // a coach who is also a parent on her team reads it as staff, and is told once
    const S = server();
    S.put('workspaces/CLUB/teams/t1/players/p2/guardians/coach', true);
    S.put('workspaces/CLUB/access/teamParents/t1/coach', 'p2');
    await S.fire('board/CLUB/t1/n4', { by: 'adm', byName: 'Ada', at: 5, text: 'x' });
    check('a coach with a child on her team: once per phone', toUid(S, 'coach').length, 2);
  }

  console.log('\n--- a kind she turned off ---');
  {
    // people/{uid}/mute/{kind}: hers alone in the rules; the server reads it before reading her phones
    const S = server({ people: { mum: { mute: { notice: true } }, coach: { mute: { msg: true } }, other: { mute: { msg: true } } } });
    await S.fire('board/CLUB/t1/n1', { by: 'coach', byName: 'Jaz', at: 5, text: 'Bring water' });
    check('notices off: she gets none', toUid(S, 'mum').length, 0);
    check('and her phones are not even looked up', S.reads.includes('pushTokens/mum'), false);
    check('everyone else on the team still does', owners(S).join(), 'adm,ella,rosamum,trk');
    await S.fire('dm/CLUB/t1/mum/m/x1', { by: 'adm', byName: 'Ada', at: 5, text: 'About fees' });
    check('but her conversation still reaches her: only notices are off', toUid(S, 'mum').length, 1);
    check('the coach, with messages off, is not pushed it', toUid(S, 'coach').length, 0);
    await S.fire('staffdm/CLUB/coach~other/m/s1', { by: 'coach', byName: 'Jaz', at: 5, text: 'Thursday?' });
    check('nor a colleague with messages off', toUid(S, 'other').length, 0);
    const T = server({ people: { mum: { mute: { notice: false } } } });
    await T.fire('board/CLUB/t1/n1', { by: 'coach', byName: 'Jaz', at: 5, text: 'Bring water' });
    check('turned back on (false), she is told again', toUid(T, 'mum').length, 1);
  }

  console.log('\n--- what is never sent ---');
  {
    const S = server({ retired: { CLUB: { at: 1 } } });
    await S.fire('board/CLUB/t1/n5', { by: 'coach', byName: 'Jaz', at: 5, text: 'x' });
    check('nothing from a retired club', S.sent().length, 0);
  }
  {
    const S = server();
    await S.fire('board/CLUB/t9/n6', { by: 'coach', byName: 'Jaz', at: 5, text: 'x' });
    check('nothing for a team the club does not have', S.sent().length, 0);
    await S.fire('board/CLUB/t1/n7', { by: 'coach', byName: 'Jaz', at: 5 });
    check('nothing with no words', S.sent().length, 0);
    await S.fire('dm/CLUB/t1/mum/m/x5', { byName: 'Mo', at: 5, text: 'x' });
    check('nothing nobody wrote', S.sent().length, 0);
  }
  {
    // a club whose lookup tables were never built: the rules' bridge lets every indexed account read, the sender does not
    const S = server();
    S.put('workspaces/CLUB/access/teamParents', null);
    await S.fire('board/CLUB/t1/n8', { by: 'coach', byName: 'Jaz', at: 5, text: 'x' });
    deepEq('no table, no families: only those the rules name directly', owners(S), ['adm', 'ella', 'trk']);
  }
  {
    const S = server();
    const long = 'word '.repeat(200);
    await S.fire('board/CLUB/t1/n9', { by: 'coach', byName: 'Jaz', at: 5, text: long });
    const b = toUid(S, 'mum')[0].data.body;
    check('a long notice is cut short for the lock screen', b.length, push.BODY_MAX);
    check('and says so', b.endsWith('…'), true);
  }

  console.log('\n--- phones that are gone ---');
  {
    const S = server();
    S.answer(t => t === tok('coach', 2) ? { success: false, error: { code: 'messaging/registration-token-not-registered' } }
      : t === tok('trk') ? { success: false, error: { code: 'messaging/internal-error' } } : { success: true });
    const r = (await S.fire('board/CLUB/t1/n10', { by: 'adm', byName: 'Ada', at: 5, text: 'x' })).pushNotice;
    check('a phone Cloud Messaging says is gone is taken off', S.at('pushTokens/coach/' + tok('coach', 2)), null);
    check('her other phone stays', !!S.at('pushTokens/coach/' + tok('coach')), true);
    check('a passing failure keeps the phone', !!S.at('pushTokens/trk/' + tok('trk')), true);
    check('and the rest are still sent', r.sent, 4);
    check('counted', r.failed, 2);
  }
  {
    const S = server();
    const many = {};
    for (let i = 0; i < 620; i++) many[tok('mum', i + 10)] = { at: 1 };
    S.put('pushTokens/mum', many);
    const r = (await S.fire('board/CLUB/t1/n11', { by: 'coach', byName: 'Jaz', at: 5, text: 'x' })).pushNotice;
    check('more phones than one send takes go in batches', S.sends.length, 2);
    check('and every one is sent', r.sent, 620 + 4);
  }

  /* ---------------- a change to the calendar ---------------- */

  console.log('\n--- a change to the calendar: what wakes the server ---');
  const day = n => { const d = new Date(Date.now() + n * 86400000); return d.toISOString().slice(0, 10); };
  const W = 'workspaces/CLUB/';
  function calServer() {
    const S = server();
    S.put(W + 'teams/t1/events', {
      e1: { id: 'e1', kind: 'practice', title: 'Practice', date: day(1), start: '18:00', end: '19:15', venue: 'Lakeside Park' },
      far: { id: 'far', kind: 'practice', title: 'Practice', date: day(30), start: '18:00' },
      old: { id: 'old', kind: 'practice', title: 'Practice', date: day(-3), start: '18:00' }
    });
    S.put(W + 'teams/t2/events', { s1: { id: 's1', kind: 'practice', title: 'Practice', date: day(2), start: '17:00' } });
    S.put(W + 'matches', {
      g1: { id: 'g1', teamId: 't1', opponent: 'Northgate', date: day(3), kickoff: '09:30', venue: 'Northgate Rec', currentHalf: 1, periods: {}, stints: {} }
    });
    return S;
  }
  {
    const S = calServer();
    check('a goal wakes nothing', (await S.wouldWake(W + 'matches/g1/events/x1', { type: 'goal', t: 60 })).length, 0);
    check('nor a sub', (await S.wouldWake(W + 'matches/g1/stints/s1', { pid: 'p1', start: 0 })).length, 0);
    S.put(W + 'matches/g1/periods/0', { half: 1, start: 1 });
    check('nor the clock stopping', (await S.wouldWake(W + 'matches/g1/periods/0/end', 5)).length, 0);
    // a stretch of play starting wakes the followed-game sender (below), never the calendar's
    check('nor the clock starting, for the calendar', (await S.wouldWake(W + 'matches/g1/periods/0', { start: 1 })).filter(n => /^push/.test(n)).length, 0);
    const g = S.at(W + 'matches/g1');
    check('nor the whole game saved with only its game changed', (await S.wouldWake(W + 'matches/g1', { ...g, stints: { s1: { pid: 'p1' } } })).length, 0);
    deepEq('the whole game saved with a new date wakes the date\'s trigger alone', (await S.wouldWake(W + 'matches/g1', { ...g, date: day(4) })).filter(n => /^push/.test(n)), ['pushGameDate']);
    deepEq('a practice changed wakes the entry\'s', (await S.wouldWake(W + 'teams/t1/events/e1/start', '18:30')).filter(n => /^push/.test(n)), ['pushEntry']);
    check('the register taken wakes nothing', (await S.wouldWake(W + 'teams/t1/attend/e1/p1', true)).length, 0);
    check('nor a player edited', (await S.wouldWake(W + 'teams/t1/players/p1/number', '8')).length, 0);
  }

  console.log('\n--- a change to the calendar: who hears what ---');
  {
    const S = calServer();
    const r = (await S.fire(W + 'teams/t1/events/e1/called', 'cancelled')).pushEntry;
    check('tomorrow\'s practice called off is news', r.news, 'called');
    check('read against each person\'s switch for calendar changes', S.reads.includes('people/mum/mute/cal'), true);
    deepEq('to the whole team: coach, tracker, families, its player', r.to, ['coach', 'ella', 'mum', 'rosamum', 'trk']);
    deepEq('the admins too, as club activity', r.admins, ['adm']);
    check('read against her switch for club activity, not her calendar\'s', S.reads.includes('people/adm/mute/news') && !S.reads.includes('people/adm/mute/cal'), true);
    check('in the same words', toUid(S, 'adm')[0].data.title, 'Cancelled: Flight: Practice');
    check('nor another team, nor someone with no role on it', toUid(S, 'other').length + toUid(S, 'dad').length + toUid(S, 'newbie').length, 0);
    check('nor a family the squad no longer names', toUid(S, 'stale').length, 0);
    const m = toUid(S, 'mum')[0];
    check('said the way the app says it', m.data.title, 'Cancelled: Flight: Practice');
    check('with when it was', m.data.body, require('../functions/push').whenOf({ date: day(1), start: '18:00' }));
    check('urgent', m.data.urgent, '1');
    check('opening the team\'s calendar', m.data.hash, '#/team/t1/calendar');
    check('tagged for the entry', m.data.tag, 'cal:CLUB:e_e1');
    check('nobody named: the entry says nobody changed it lately', m.data.body.includes(' · '), false);
    S.sends.length = 0;
    const again = (await S.fire(W + 'teams/t1/events/e1/called', null)).pushEntry;
    check('called back on', again.news + ' / ' + toUid(S, 'mum')[0].data.title, 'back / Back on: Flight: Practice');
  }
  {
    // the app stamps every calendar change with who made it (remoteSet()), the rules hold it to her own uid
    const S = calServer();
    await S.fire(W + 'teams/t1/events/e1/edit', { by: 'coach', at: Date.now() });
    const r = (await S.fire(W + 'teams/t1/events/e1/called', 'cancelled')).pushEntry;
    check('the coach who called it off is not told, on either phone', toUid(S, 'coach').length, 0);
    check('the rest of the team is', r.to.join(), 'ella,mum,rosamum,trk');
    check('and told who did it', toUid(S, 'mum')[0].data.body.endsWith(' · Jaz'), true);
    const n = S.sent().length;
    await S.fire(W + 'teams/t1/events/e1/edit', { by: 'adm', at: Date.now() });
    check('a stamp on its own is not news', S.sent().length, n);
  }
  {
    // a stamp left from a change an hour ago says nothing about this one
    const S = calServer();
    S.put(W + 'teams/t1/events/e1/edit', { by: 'coach', at: Date.now() - 3600000 });
    await S.fire(W + 'teams/t1/events/e1/called', 'cancelled');
    check('an old stamp: nobody left out, nobody named', toUid(S, 'coach').length + ' ' + toUid(S, 'mum')[0].data.body.includes(' · '), '2 false');
  }
  {
    const S = calServer();
    S.put(W + 'matches/g1/edit', { by: 'adm', at: Date.now() });
    await S.fire(W + 'matches/g1/kickoff', '10:30');
    check('a game moved by an admin names her', toUid(S, 'mum')[0].data.body.endsWith(' · Ada'), true);
  }
  {
    const S = calServer();
    const r = (await S.fire(W + 'teams/t1/events/e1/start', '18:30')).pushEntry;
    check('moved half an hour', r.news + ' / ' + toUid(S, 'mum')[0].data.title, 'moved / Moved: Flight: Practice');
    check('saying when it is now', toUid(S, 'mum')[0].data.body.startsWith('Now '), true);
  }
  {
    const S = calServer();
    await S.fire(W + 'teams/t1/events/e1/venue', 'Pitch 4');
    await S.fire(W + 'teams/t1/events/e1/title', 'Shooting practice');
    await S.fire(W + 'teams/t1/events/e1/end', '19:30');
    check('a new place, title or end time is not a buzz, as in the app', S.sent().length, 0);
    await S.fire(W + 'teams/t1/events/e1', null);
    deepEq('a deletion is told to the admins alone, as club activity says it', owners(S), ['adm']);
    check('as deleted, by its title then', toUid(S, 'adm')[0].data.title, 'Deleted: Flight: Shooting practice');
    S.sends.length = 0;
    await S.fire(W + 'teams/t1/events/far/called', 'cancelled');
    check('nor anything a month away: the calendar says it', S.sent().length, 0);
    await S.fire(W + 'teams/t1/events/old/called', 'cancelled');
    check('nor anything past', S.sent().length, 0);
    await S.fire(W + 'teams/t1/events/old', null);
    check('nor a past entry deleted', S.sent().length, 0);
  }
  {
    const S = calServer();
    // Cloud Functions delivers at least once: the very same event, handed over again
    const before = S.at(W + 'teams/t1/events/e1');
    await S.fire(W + 'teams/t1/events/e1/called', 'cancelled');
    const after = S.at(W + 'teams/t1/events/e1');
    const ev = { params: { code: 'CLUB', tid: 't1', eid: 'e1' }, data: { before: { val: () => before, ref: S.ref(W + 'teams/t1/events/e1') }, after: { val: () => after, ref: S.ref(W + 'teams/t1/events/e1') } } };
    await S.triggers.pushEntry.handler(ev);
    check('the same change delivered twice is told once', S.sent().filter(m => m.data.uid === 'mum').length, 1);
    check('the server\'s own note of it is where no phone can reach', !!S.at('serverState/calSent/CLUB/e_e1'), true);
  }
  {
    const S = calServer();
    const g = S.at(W + 'matches/g1');
    const r = await S.fire(W + 'matches/g1', { ...g, date: day(4), kickoff: '11:00' });
    check('a game moved to another day and time wakes two push triggers', Object.keys(r).filter(n => /^push/.test(n)).sort().join(), 'pushGameDate,pushGameKickoff');
    check('and is told once', toUid(S, 'mum').length, 1);
    const m = toUid(S, 'mum')[0];
    check('as moved', m.data.title, 'Moved: Flight v Northgate');
    check('urgent, a new day', m.data.urgent, '1');
    check('opening the game', m.data.hash, '#/team/t1/game/g1/live');
    S.sends.length = 0;
    await S.fire(W + 'matches/g1/called', 'postponed');
    check('postponed says so', toUid(S, 'mum')[0].data.title, 'Postponed: Flight v Northgate');
    S.sends.length = 0;
    await S.fire(W + 'matches/g1/kickoff', '11:15');
    check('a quarter of an hour later is still a move, not urgent', toUid(S, 'mum')[0].data.title + ' ' + toUid(S, 'mum')[0].data.urgent, 'Moved: Flight v Northgate ');
  }
  {
    const S = calServer();
    const r = await S.fire(W + 'matches/g2', { id: 'g2', teamId: 't1', opponent: 'Riverside', date: day(5), kickoff: '10:00', currentHalf: 1 });
    check('a new game this week is told once', toUid(S, 'mum').length, 1);
    check('as new', toUid(S, 'mum')[0].data.title, 'New game: Flight v Riverside');
    S.sends.length = 0;
    await S.fire(W + 'matches/g3', { id: 'g3', teamId: 't1', opponent: 'Hill', currentHalf: 1 });
    check('one with no date yet is not', S.sent().length, 0);
    await S.fire(W + 'matches/g2', null);
    check('nor a game deleted', S.sent().length, 0);
  }
  {
    const S = calServer();
    for (const [id, n] of [['w1', 1], ['w2', 8], ['w3', 15]])
      await S.fire(W + `teams/t1/events/${id}`, { id, kind: 'practice', title: 'Practice', date: day(n), start: '18:00', series: 'ser1' });
    check('a weekly practice added is one piece of news, not one a week', toUid(S, 'mum').length, 1);
    check('said as weekly', toUid(S, 'mum')[0].data.title + ' / ' + toUid(S, 'mum')[0].data.body.startsWith('Weekly, from'), 'New practices: Flight: Practice / true');
  }
  {
    const S = calServer();
    S.put('retired', { CLUB: { at: 1 } });
    await S.fire(W + 'teams/t1/events/e1/called', 'cancelled');
    check('nothing from a retired club', S.sent().length, 0);
  }
  {
    const P = require('../functions/push');
    check('when is said as the app says it', P.whenOf({ date: '2026-10-10', start: '18:00' }), 'Sat 10 Oct 6pm');
    check('half past, and no time at all', P.whenOf({ date: '2026-10-10', start: '9:30' }) + ' / ' + P.whenOf({ date: '2026-10-10' }), 'Sat 10 Oct 9:30am / Sat 10 Oct');
  }

  /* ---------------- the page ---------------- */

  console.log('\n--- training sessions and club activity: what wakes the server ---');
  {
    const S = server();
    check('a booking changing', S.woken('training/CLUB/booked/s1/p1').includes('newsBooked'), true);
    check('a session written', S.woken('training/CLUB/sessions/s1').includes('newsSession'), true);
    check('a coach\'s time off', S.woken('training/CLUB/away/coach/a1').includes('newsAway'), true);
    check('none of them by anything a game writes', S.woken(W + 'matches/g1/goals/x').filter(n => /^news/.test(n)).length, 0);
  }

  console.log('\n--- a booking: who hears what ---');
  const T = 'training/CLUB/';
  const slotS = (extra = {}) => ({ id: 'k1', kind: 'one', title: '', coach: 'coach', coachName: 'Jaz', date: day(3), start: '18:00', end: '19:00', cap: 1, slot: 'b1', t0: Date.now() + 3 * 86400000, by: 'mum', ...extra });
  const groupS = (extra = {}) => ({ id: 's1', kind: 'group', title: 'Finishing', coach: 'coach', coachName: 'Jaz', date: day(3), start: '17:00', end: '18:00', cap: 6, open: true, ...extra });
  function sessServer(training) {
    const S = server({ training: { CLUB: { sessions: { k1: slotS(), s1: groupS() }, ...(training || {}) } } });
    S.put(W + 'access/teams/t1/coaches/co', true);
    S.put(W + 'access/index/co', true);
    S.put('pushTokens/co', { [tok('co')]: { at: 1, ua: 'iPhone' } });
    return S;
  }
  const NEVER = ['trk', 'dad', 'newbie', 'stale'];
  {
    const S = sessServer();
    const r = (await S.fire(T + 'booked/k1/p1', { tid: 't1', st: 'in', by: 'mum', at: 5 })).newsBooked;
    deepEq('a family books a time: her coach and the admins', r.to, ['adm', 'coach']);
    check('her coach, in her words', toUid(S, 'coach')[0].data.title, 'Booked a time');
    check('naming the child to her coach', toUid(S, 'coach')[0].data.body.startsWith('Ella · '), true);
    check('on both her phones', toUid(S, 'coach').length, 2);
    check('the admins, as club activity', toUid(S, 'adm')[0].data.title, 'Booked by a family: 1-1 session with Jaz');
    check('each under her own switch', S.reads.includes('people/coach/mute/cal') && S.reads.includes('people/adm/mute/news'), true);
    check('not the family who booked it', toUid(S, 'mum').length, 0);
    check('nor another family, a tracker or a stranger', [...NEVER, 'rosamum', 'other'].every(u => !toUid(S, u).length), true);
    check('opening the session', toUid(S, 'coach')[0].data.hash, '#/training/k1');
  }
  {
    const S = sessServer({ booked: { k1: { p1: { tid: 't1', st: 'wait', by: 'mum', at: 5 } } } });
    const r = (await S.fire(T + 'booked/k1/p1', { tid: 't1', st: 'in', by: 'server', at: 9 })).newsBooked;
    check('moved off the waiting list: her family is told', toUid(S, 'mum')[0].data.title, 'Ella: booked');
    check('with whose time it is', toUid(S, 'mum')[0].data.body.startsWith('1-1 session with Jaz · '), true);
    check('her coach too', toUid(S, 'coach')[0].data.title, 'Booked a time');
    check('read against the family\'s switch for her calendar', S.reads.includes('people/mum/mute/cal'), true);
    deepEq('and nobody else\'s family', r.to.filter(u => !['adm', 'coach', 'mum'].includes(u)), []);
  }
  {
    const S = sessServer({ booked: { k1: { p1: { tid: 't1', st: 'in', by: 'mum', at: 5 } } } });
    await S.fire(T + 'booked/k1/p1', { tid: 't1', st: 'no', by: 'coach', at: 9 });
    deepEq('the coach turns a child down: only that child\'s family hears', owners(S), ['mum']);
    check('in the app\'s words', toUid(S, 'mum')[0].data.title, 'Ella: not this time');
  }
  {
    const S = sessServer();
    const r = (await S.fire(T + 'booked/s1/p2', { tid: 't1', st: 'asked', by: 'rosamum', at: 5 })).newsBooked;
    deepEq('a family asks on an open session: its coach and the admins', r.to, ['adm', 'coach']);
    check('the coach', toUid(S, 'coach')[0].data.title + ' / ' + toUid(S, 'coach')[0].data.body.split(' · ')[0], 'Asked for a spot / Rosa');
    check('the admins', toUid(S, 'adm')[0].data.title, 'Asked for a place: Rosa');
    check('not the other coach of the team: it is her session, not the team\'s', toUid(S, 'co').length, 0);
  }
  {
    const S = sessServer({ booked: { k1: { p1: { tid: 't1', st: 'in', by: 'mum', at: 5 } } } });
    await S.fire(T + 'booked/k1/p1', null);
    check('a family\'s place given back: the coach', toUid(S, 'coach')[0].data.title, 'Cancelled a time');
    check('and the admins', toUid(S, 'adm')[0].data.title, 'Cancelled a time: Ella');
    check('the family who cancelled is not told', toUid(S, 'mum').length, 0);
  }
  {
    // the last place in a slot given back through the server takes the slot with it before this runs
    const S = sessServer({ booked: { k1: { p1: { tid: 't1', st: 'in', by: 'mum', at: 5 } } } });
    S.put('serverState/slotGone/CLUB/k1', slotS());
    S.put(T + 'sessions/k1', null);
    await S.fire(T + 'booked/k1/p1', null);
    check('the coach still hears, from the server\'s note of the slot', toUid(S, 'coach')[0].data.title, 'Cancelled a time');
  }
  {
    const S = sessServer({ booked: { s1: { p1: { tid: 't1', st: 'in', by: 'coach', at: 5 } } } });
    await S.fire(T + 'booked/s1/p1', { tid: 't1', st: 'in', by: 'coach', at: 5, want: 'Crossing' });
    check('a note changed on a place is not news', S.sent().length, 0);
    S.put(T + 'sessions/s1/date', day(-5));
    await S.fire(T + 'booked/s1/p1', { tid: 't1', st: 'out', by: 'mum', at: 9 });
    check('nor anything about a session already past', S.sent().length, 0);
    S.put(T + 'sessions/s1', groupS({ called: 'cancelled' }));
    await S.fire(T + 'booked/s1/p1', { tid: 't1', st: 'in', by: 'coach', at: 9 });
    check('nor a session called off', S.sent().length, 0);
  }
  {
    const S = sessServer();
    S.put('retired/CLUB', true);
    await S.fire(T + 'booked/k1/p1', { tid: 't1', st: 'in', by: 'mum', at: 5 });
    check('nor anything in a retired club', S.sent().length, 0);
  }

  console.log('\n--- a session: who hears what ---');
  {
    const S = sessServer();
    const r = (await S.fire(T + 'sessions/s2', groupS({ id: 's2', title: 'Shooting', by: 'coach' }))).newsSession;
    deepEq('a coach adds a session: the admins hear, as club activity', r.to, ['adm']);
    check('in the app\'s words', toUid(S, 'adm')[0].data.title, 'New session: Shooting with Jaz');
    S.sends.length = 0;
    await S.fire(T + 'sessions/k2', slotS({ id: 'k2', start: '17:00' }));
    check('a slot a family booked is said from its booking, not here', S.sent().length, 0);
  }
  {
    const S = sessServer({ booked: { s1: { p1: { tid: 't1', st: 'in', by: 'coach', at: 1 }, p2: { tid: 't1', st: 'wait', by: 'coach', at: 2 }, q1: { tid: 't2', st: 'out', by: 'dad', at: 3 } } } });
    const r = (await S.fire(T + 'sessions/s1', groupS({ called: 'cancelled', edit: { by: 'coach', at: Date.now() } }))).newsSession;
    deepEq('called off: the families of children going or waiting, and the admins', r.to, ['adm', 'mum', 'rosamum']);
    check('each family about her own child', toUid(S, 'mum')[0].data.body.startsWith('Ella · '), true);
    check('never another child\'s name', /Rosa/.test(JSON.stringify(toUid(S, 'mum'))) || /Ella/.test(JSON.stringify(toUid(S, 'rosamum'))), false);
    check('titled as the app says it', toUid(S, 'mum')[0].data.title, 'Cancelled: Finishing');
    check('urgent', toUid(S, 'mum')[0].data.urgent, '1');
    check('not a family whose child withdrew', toUid(S, 'dad').length, 0);
    check('not the coach who called it off, on either phone', toUid(S, 'coach').length, 0);
    check('the admins, with whose session it is', toUid(S, 'adm')[0].data.title, 'Cancelled: Finishing with Jaz');
  }
  {
    const S = sessServer({ booked: { s1: { p1: { tid: 't1', st: 'in', by: 'coach', at: 1 } } } });
    await S.fire(T + 'sessions/s1/start', '18:30');
    deepEq('moved: the family hears, the admins do not', owners(S), ['mum']);
    check('when it is now', toUid(S, 'mum')[0].data.title + ' / ' + toUid(S, 'mum')[0].data.body.split(' · ')[1].slice(0, 3), 'Moved: Finishing / now');
    S.sends.length = 0;
    await S.fire(T + 'sessions/s1/place', 'Pitch 2');
    check('a new place is not a buzz', S.sent().length, 0);
  }
  {
    const S = sessServer({ booked: { s1: { p1: { tid: 't1', st: 'in', by: 'coach', at: 1 } } } });
    S.put(T + 'sessions/s1/date', day(40));
    await S.fire(T + 'sessions/s1/called', 'cancelled');
    deepEq('one called off weeks away: the admins, not yet the family', owners(S), ['adm']);
  }

  console.log('\n--- a coach\'s time off: who hears what ---');
  {
    const S = sessServer();
    const r = (await S.fire(T + 'away/coach/c1', { id: 'c1', kind: 'callout', item: 'e:e1', tid: 't1', date: day(2), start: '18:00', title: 'Practice', by: 'coach', at: 1 })).newsAway;
    deepEq('a coach calls out: the team\'s other coach and the admins', r.to, ['adm', 'co']);
    check('in the app\'s words', toUid(S, 'co')[0].data.title, 'Jaz can\'t make Practice');
    check('opening the team\'s calendar', toUid(S, 'co')[0].data.hash, '#/team/t1/calendar');
    check('as club activity', S.reads.includes('people/co/mute/news'), true);
    check('never a family, a tracker or a stranger', ['mum', 'rosamum', 'ella', ...NEVER].every(u => !toUid(S, u).length), true);
    S.sends.length = 0;
    const back = (await S.fire(T + 'away/coach/c1', null)).newsAway;
    deepEq('taken back: the same people', back.to, ['adm', 'co']);
    check('back on', toUid(S, 'co')[0].data.title, 'Back on: Jaz is back on Practice');
  }
  {
    const S = sessServer();
    await S.fire(T + 'away/coach/c2', { id: 'c2', kind: 'callout', item: 'e:e1', tid: 't1', date: day(2), title: 'Practice', by: 'adm', at: 1 });
    check('an admin calls a coach off: she hears it', toUid(S, 'coach')[0].data.title, 'Ada called you off Practice');
    check('the other coach too', toUid(S, 'co')[0].data.title, 'Ada called Jaz off Practice');
    check('not the admin who did it', toUid(S, 'adm').length, 0);
  }
  {
    const S = sessServer();
    const r = (await S.fire(T + 'away/coach/w1', { id: 'w1', kind: 'weekly', days: [2, 4], start: '17:00', end: '19:00', by: 'coach', at: 1 })).newsAway;
    deepEq('time off: the admins alone', r.to, ['adm']);
    check('saying when', toUid(S, 'adm')[0].data.title + ' / ' + toUid(S, 'adm')[0].data.body, 'Time off: Jaz / Every Tue, Thu, 17:00–19:00');
    S.sends.length = 0;
    await S.fire(T + 'away/coach/w1/note', 'Physio');
    check('a note added later is not news', S.sent().length, 0);
    await S.fire(T + 'away/coach/w1', null);
    check('nor time off taken back', S.sent().length, 0);
    await S.fire(T + 'away/coach/c9', { id: 'c9', kind: 'callout', item: 'e:old', tid: 't1', date: day(-4), title: 'Practice', by: 'coach', at: 1 });
    check('nor a call-out from something past', S.sent().length, 0);
  }

  console.log('\n--- a game she follows: what wakes the server ---');
  const ORGS_SERVER = process.env.SERVER_TREE === 'orgs';
  function liveServer(follow) {
    const S = server(follow ? { follow: { CLUB: { g1: follow } } } : undefined);
    const t0 = Date.now() - 10 * 60000;
    S.put(W + 'matches', {
      g1: { id: 'g1', teamId: 't1', opponent: 'Northgate', date: day(0), kickoff: '09:30', periodCount: 2, currentHalf: 1,
        periods: { 0: { half: 1, start: t0 } }, goals: {}, stints: { s1: { pid: 'p1', on: 0 } } }
    });
    return S;
  }
  // a trigger run a second time with the same event, as Cloud Functions may
  const again = (S, name, prm, val) => {
    const ref = S.ref(W + 'matches/g1');
    // a create trigger's snapshot and a write trigger's before/after, either way
    return S.triggers[name + (ORGS_SERVER ? 'Orgs' : '')].handler({ params: prm, data: { val: () => val, ref, before: { val: () => val, ref }, after: { val: () => val, ref } } });
  };
  {
    const S = liveServer();
    const wake = async (p, v) => (await S.wouldWake(W + p, v)).filter(n => /^follow/.test(n));
    deepEq('a goal logged wakes the goal sender', await wake('matches/g1/goals/x1', { t: 600, side: 'us' }), ['followGoal']);
    S.put(W + 'matches/g1/goals/x1', { t: 600, side: 'us' });
    deepEq('its scorer added wakes the scorer\'s', await wake('matches/g1/goals/x1/pid', 'p1'), ['followScorer']);
    deepEq('an assist added wakes nothing', await wake('matches/g1/goals/x1/assist', 'p2'), []);
    deepEq('nor a sub', await wake('matches/g1/stints/s2', { pid: 'p2', on: 600 }), []);
    deepEq('nor the clock stopping', await wake('matches/g1/periods/0/end', Date.now()), []);
    deepEq('the clock starting again wakes the stretch-of-play sender', await wake('matches/g1/periods/1', { half: 1, start: Date.now() }), ['followPeriod']);
    deepEq('half time wakes the half\'s', await wake('matches/g1/currentHalf', 2), ['followHalf']);
    deepEq('End game wakes full time\'s', await wake('matches/g1/ended', Date.now()), ['followEnded']);
    const g = S.at(W + 'matches/g1');
    deepEq('the whole game saved with its goals as they were wakes nothing', await wake('matches/g1', { ...g, stints: { ...g.stints, s3: { pid: 'p2', on: 700 } } }), []);
  }
  {
    const S = liveServer();
    S.reads.length = 0;
    await S.fire(W + 'matches/g1/goals/x1', { t: 600, side: 'us' });
    check('a game nobody follows: nothing sent', S.sent().length, 0);
    deepEq('and nothing read but whether anybody does', S.reads.filter(p => !/^serverState\/moving\//.test(p)), ['follow/CLUB/g1']);
  }

  console.log('\n--- a game she follows: who hears what ---');
  {
    // a family on the team, a family on another team (every role reads a game), the tracker, and someone no longer in the club
    const S = liveServer({ mum: { at: 1 }, dad: { at: 1 }, trk: { at: 1 }, gone: { at: 1 } });
    S.put('pushTokens/gone', { [tok('gone')]: { at: 1 } });
    const r = (await S.fire(W + 'matches/g1/goals/x1', { t: 600, side: 'us', pid: 'p1', by: 'trk', byName: 'Tia' })).followGoal;
    deepEq('whoever follows it, in the club, not whoever logged it', r.to, ['dad', 'mum']);
    check('not someone the club no longer has', toUid(S, 'gone').length, 0);
    check('nor anyone who does not follow it', toUid(S, 'coach').length + toUid(S, 'adm').length + toUid(S, 'rosamum').length, 0);
    const m = toUid(S, 'mum')[0];
    check('said the way the open page says it', m.data.title, 'Goal — Flight');
    check('her own child named, then the score', m.data.body, 'Ella · Flight 1–0 Northgate');
    check('another team\'s family, roster closed: a shirt number', toUid(S, 'dad')[0].data.body, '#7 · Flight 1–0 Northgate');
    check('opening the game\'s Live tab', m.data.hash, '#/team/t1/game/g1/live');
    check('tagged as the open page tags it, so a phone showing both shows one', m.data.tag, 'minutes-g1-goal:x1');
    check('not held on the lock screen until dismissed', m.data.urgent, '');
    check('and kept an hour, not a day', m.webpush.headers.TTL, '3600');
    check('no name reaches a phone the club keeps names from', /Ella|Rosa|Gia/.test(JSON.stringify(toUid(S, 'dad'))), false);
    check('read without anyone\'s switches: following is the switch', S.reads.some(p => /\/mute\//.test(p)), false);
    const n = S.sent().length;
    await again(S, 'followGoal', { code: 'CLUB', mid: 'g1', gid: 'x1', tree: ORGS_SERVER ? 'orgs' : 'workspaces' }, null);
    check('the same goal delivered twice is said once', S.sent().length, n);
    S.sends.length = 0;
    await S.fire(W + 'matches/g1/goals/y1', { t: 900, side: 'them' });
    check('theirs too, with the score after it', toUid(S, 'mum')[0].data.title + ' / ' + toUid(S, 'mum')[0].data.body, 'Goal — Northgate / Flight 1–1 Northgate');
  }
  {
    // names follow the club's setting and the reader, as shownName() does on the screen
    const S = liveServer({ coach: { at: 1 }, rosamum: { at: 1 }, ella: { at: 1 }, dad: { at: 1 }, other: { at: 1 } });
    await S.fire(W + 'matches/g1/goals/x1', { t: 600, side: 'us', pid: 'p1', assist: 'p2' });
    const body = u => (toUid(S, u)[0] || { data: {} }).data.body;
    check('a coach sees names', body('coach'), 'Ella, assist Rosa · Flight 1–0 Northgate');
    check('so does a coach of another team', body('other'), 'Ella, assist Rosa · Flight 1–0 Northgate');
    check('the scorer herself sees her own name, and a number for the rest', body('ella'), 'Ella, assist #9 · Flight 1–0 Northgate');
    check('the assist\'s family sees her child, and a number for the scorer', body('rosamum'), '#7, assist Rosa · Flight 1–0 Northgate');
    check('another family: numbers', body('dad'), '#7, assist #9 · Flight 1–0 Northgate');
    S.sends.length = 0;
    S.put(W + 'access/org/rosterOpen', true);
    await S.fire(W + 'matches/g1/goals/y1', { t: 700, side: 'us', pid: 'p2' });
    check('once the club opens the roster, every family sees names', body('dad'), 'Rosa · Flight 2–0 Northgate');
  }
  {
    // at the sideline the goal is tapped first and its scorer added after
    const S = liveServer({ mum: { at: 1 }, dad: { at: 1 } });
    await S.fire(W + 'matches/g1/goals/x1', { t: 600, side: 'us' });
    check('the goal at once, nobody named yet', toUid(S, 'mum')[0].data.body, 'Flight 1–0 Northgate');
    S.sends.length = 0;
    await S.fire(W + 'matches/g1/goals/x1/pid', 'p1');
    const m = toUid(S, 'mum')[0];
    check('then again with the scorer', m.data.body, 'Ella · Flight 1–0 Northgate');
    check('under the same tag, so it replaces the first', m.data.tag, 'minutes-g1-goal:x1');
    check('a number for a family the club keeps names from', toUid(S, 'dad')[0].data.body, '#7 · Flight 1–0 Northgate');
    S.sends.length = 0;
    await again(S, 'followScorer', { code: 'CLUB', mid: 'g1', gid: 'x1', tree: ORGS_SERVER ? 'orgs' : 'workspaces' }, null);
    check('said once', S.sent().length, 0);
    await S.fire(W + 'matches/g1/goals/x1/pid', 'p2');
    check('a scorer corrected is said again, with the right child', toUid(S, 'mum')[0] ? toUid(S, 'mum')[0].data.body : '', '#9 · Flight 1–0 Northgate');
    S.sends.length = 0;
    S.put(W + 'matches/g1/goals/q1', { t: 900, side: 'us' });   // arrived without the goal trigger telling it
    await S.fire(W + 'matches/g1/goals/q1/pid', 'p1');
    check('a scorer on a goal never told says nothing', S.sent().length, 0);
    await S.fire(W + 'matches/g1/goals/x2', { t: 1000, side: 'us', pid: 'p1' });
    const n = S.sent().length;
    await again(S, 'followScorer', { code: 'CLUB', mid: 'g1', gid: 'x2', tree: ORGS_SERVER ? 'orgs' : 'workspaces' }, null);
    check('a goal told with its scorer is not told again for her', S.sent().length, n);
  }
  {
    const S = liveServer({ mum: { at: 1 } });
    await S.fire(W + 'matches/g1/periods/0/end', Date.now());
    await S.fire(W + 'matches/g1/periods/1', { half: 1, start: Date.now() });
    check('the clock paused and started again is not kick-off', S.sent().length, 0);
    await S.fire(W + 'matches/g1/periods/1/end', Date.now());
    await S.fire(W + 'matches/g1/currentHalf', 2);
    check('half time', toUid(S, 'mum').map(m => m.data.title).join(), 'Half time');
    S.sends.length = 0;
    await S.fire(W + 'matches/g1/periods/2', { half: 2, start: Date.now() });
    check('the second half under way', toUid(S, 'mum').map(m => m.data.title).join(), '2nd half under way');
    S.sends.length = 0;
    await S.fire(W + 'matches/g1/ended', Date.now());
    check('full time', toUid(S, 'mum').map(m => m.data.title).join(), 'Full time');
    check('and following is over: the follows are cleared', S.at('follow/CLUB/g1') == null, true);
    check('what it said is kept, so it is never said twice', !!S.at('serverState/followSent/CLUB/g1/ft'), true);
    S.sends.length = 0;
    await S.fire(W + 'matches/g1/goals/z1', { t: 3000, side: 'us' });
    check('nothing after full time', S.sent().length, 0);
  }
  {
    // kick-off: the first stretch of the first half
    const S = liveServer({ mum: { at: 1 } });
    S.put(W + 'matches/g1/periods', null);
    await S.fire(W + 'matches/g1/periods/0', { half: 1, start: Date.now() });
    check('kick-off', toUid(S, 'mum').map(m => m.data.title + ' / ' + m.data.body).join(), 'Kick-off / Flight 0–0 Northgate');
  }
  {
    // a last half that runs out is full time, whether or not End game follows
    const S = liveServer({ mum: { at: 1 } });
    S.put(W + 'matches/g1/currentHalf', 2);
    await S.fire(W + 'matches/g1/currentHalf', 3);
    check('the last half ending is full time', toUid(S, 'mum').map(m => m.data.title).join(), 'Full time');
    S.sends.length = 0;
    S.put('follow/CLUB/g1', { mum: { at: 1 } });
    await S.fire(W + 'matches/g1/ended', Date.now());
    check('and End game after it does not say it twice', S.sent().length, 0);
  }
  {
    // late: an outbox emptied hours on, a backup loaded, a game reopened next week
    const S = liveServer({ mum: { at: 1 } });
    S.put(W + 'matches/g1/periods/0/start', Date.now() - 6 * 3600000);
    await S.fire(W + 'matches/g1/goals/x1', { t: 600, side: 'us' });
    check('a goal from a game played hours ago is not news', S.sent().length, 0);
    await S.fire(W + 'matches/g1/ended', Date.now() - 5 * 3600000);
    check('nor its full time', S.sent().length, 0);
    check('but the follows are still cleared', S.at('follow/CLUB/g1') == null, true);
  }
  {
    const S = liveServer({ mum: { at: 1 } });
    S.put('retired/CLUB', { at: 1, name: 'Lakeside SC' });
    await S.fire(W + 'matches/g1/goals/x1', { t: 600, side: 'us' });
    check('a retired club sends nothing', S.sent().length, 0);
  }

  console.log('\n--- turning it on, on the phone ---');
  const CONFIG = { apiKey: 'k', databaseURL: 'https://prod.example', projectId: 'p', messagingSenderId: '1', appId: 'a' };
  const KEY = 'BPushKeyFromTheFirebaseConsole0123456789';
  function browser(opts = {}) {
    const b = { posted: [], swListeners: [], registered: [], perm: opts.perm || 'default', answer: opts.answer || 'granted' };
    const reg = { scope: 'https://x.test/', active: { postMessage: m => b.posted.push(m) } };
    b.reg = reg;
    b.navigator = {
      userAgent: opts.ua || 'Mozilla/5.0 (Linux; Android 14) Chrome/130',
      serviceWorker: opts.noSw ? undefined : {
        register: f => { b.registered.push(f); return Promise.resolve(reg); },
        ready: Promise.resolve(reg),
        addEventListener: (t, fn) => b.swListeners.push([t, fn])
      }
    };
    b.window = { ...(opts.noPush ? {} : { PushManager: function () { } }), ...(opts.key === false ? {} : { SOCCER_PUSH_KEY: KEY }) };
    global.Notification = opts.noNotification ? undefined : {
      get permission() { return b.perm; },
      requestPermission: () => { b.asked = (b.asked || 0) + 1; b.perm = b.answer; return Promise.resolve(b.answer); }
    };
    if (opts.noNotification) delete global.Notification;
    return b;
  }
  async function boot(who, opts = {}) {
    const b = browser(opts);
    const fbk = opts.fbk || makeFakebase();
    const A = H.loadApp({ firebase: fbk, config: CONFIG, navigator: b.navigator, window: b.window, search: opts.search, hash: opts.hash,
      storage: { 'sm.workspace': 'CLUB', ...(opts.storage || {}) } });
    await A.flush();
    if (who) fbk.signIn(who, { name: (CLUB.access.members[who] || {}).name || who });
    await A.flush();
    if (opts.online !== false) fbk.deliver('.info/connected', true);
    fbk.deliver('workspaces/CLUB', JSON.parse(JSON.stringify(CLUB))); await A.flush();
    return { A, fbk, b };
  }
  const tokWrites = fbk => fbk.record.writes.filter(w => w.path.startsWith('pushTokens/'));
  const tokRemoves = fbk => fbk.record.removes.filter(p => p.startsWith('pushTokens/'));

  {
    const { A, b } = await boot('mum', { key: false });
    check('no push key for the club: nothing is offered', A.pushSupport(), 'unset');
    A.ui.view = 'setup'; A.render();
    check('and Settings says nothing about it', A.rendered().includes('Notifications on this phone'), false);
    check('the worker is not even registered', b.registered.length, 0);
  }
  {
    const { A } = await boot('mum', { ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Safari/604.1', noPush: true });
    check('an iPhone in a browser tab is told to add it to the Home Screen', A.pushSupport(), 'install');
    A.ui.view = 'setup'; A.render();
    check('in so many words', A.rendered().includes('Add to Home Screen'), true);
    check('with nothing to tap that cannot work', A.rendered().includes('data-act="pushon"'), false);
  }
  {
    const { A } = await boot('mum', { noSw: true });
    check('a browser with no push at all says so', A.pushSupport(), 'no');
  }
  {
    const { A } = await boot('mum', { perm: 'denied' });
    check('blocked in the browser\'s settings is said', A.pushSupport(), 'blocked');
  }
  {
    const { A, fbk, b } = await boot(null);
    A.click({ act: 'pushon' }); await A.flush();
    check('signed out: nothing to leave a token for', A.lastToast(), 'Sign in first');
    check('and nothing written', tokWrites(fbk).length, 0);
    check('nobody was asked', b.asked || 0, 0);
  }
  {
    const { A, fbk, b } = await boot('mum');
    check('a parent may turn it on: it is her own phone', A.pushSupport(), 'ok');
    check('the worker is registered at load, ready for a tap', b.registered.join(), 'sw.js');
    A.ui.view = 'inbox'; A.render();
    check('Messages offers it', A.rendered().includes('data-act="pushon"'), true);
    check('instead of the open-page pop-ups', A.rendered().includes('Pop-ups on this device'), false);
    A.click({ act: 'pushon' }); await A.flush();
    check('the browser is asked, from the tap', b.asked, 1);
    check('the token is asked for with the club\'s key', fbk.record.tokens.map(t => t.vapidKey).join(), KEY);
    check('and for Minutes\' own worker', fbk.record.tokens[0].reg, b.reg);
    const w = tokWrites(fbk);
    check('one write, at her own address', w.map(x => x.path).join(), 'pushTokens/mum/' + fbk.token);
    deepEq('holding when, and what kind of phone', Object.keys(w[0].value).sort(), ['at', 'ua']);
    check('which is all a phone is called', w[0].value.ua, 'Android');
    check('kept on the phone as hers', A.pushRec.uid + ' ' + A.pushRec.token, 'mum ' + fbk.token);
    check('so it is on', A.pushOn(), true);
    check('the worker is told who is signed in', b.posted.some(m => m.type === 'me' && m.uid === 'mum'), true);
    A.ui.view = 'setup'; A.render();
    check('Settings says it is on, with a way off', A.rendered().includes('data-act="pushoff"'), true);
    A.ui.view = 'inbox'; A.render();
    check('and Messages stops asking', A.rendered().includes('Notifications on this phone'), false);

    A.click({ act: 'pushoff' }); await A.flush();
    check('off: the club\'s copy is taken down', tokRemoves(fbk).join(), 'pushTokens/mum/fTok0000000000000000000001:APA91b-first');
    check('and the browser\'s subscription deleted', fbk.record.tokenDrops, 1);
    check('and the phone forgets it', A.pushRec, null);
    check('so it is off', A.pushOn(), false);
  }
  {
    const { A, fbk } = await boot('mum', { online: false });
    A.click({ act: 'pushon' }); await A.flush();
    check('with no signal it waits for one', A.lastToast(), 'Turn notifications on with a signal');
    check('nothing written', tokWrites(fbk).length, 0);
    check('and nothing claimed', A.pushRec, null);
  }
  {
    const { A, fbk } = await boot('mum', { answer: 'denied' });
    A.click({ act: 'pushon' }); await A.flush();
    check('she says no: nothing is left anywhere', tokWrites(fbk).length + fbk.record.tokens.length, 0);
    check('and she is told where to change her mind', /settings/.test(A.lastToast()), true);
  }
  {
    const fbk = makeFakebase().refuseWrites(p => p.startsWith('pushTokens/'));
    const { A } = await boot('mum', { fbk });
    A.click({ act: 'pushon' }); await A.flush();
    check('rules not published: said, by version', new RegExp('refused.*version ' + A.RULES_VERSION).test(A.lastToast()), true);
    check('and not claimed to be on', A.pushRec, null);
  }

  console.log('\n--- the token follows whoever is signed in ---');
  {
    const { A, fbk, b } = await boot('mum');
    A.click({ act: 'pushon' }); await A.flush();
    const left = 'pushTokens/mum/' + fbk.token;
    const removesBefore = fbk.record.removes.length;
    A.click({ act: 'signout' }); await A.flush();
    check('signing out takes her phone\'s address down', fbk.record.removes.slice(removesBefore).join(), left);
    check('and deletes the browser\'s subscription', fbk.record.tokenDrops, 1);
    check('and forgets it', A.pushRec, null);
    fbk.signOut(); await A.flush();
    check('the worker is told nobody is signed in', b.posted[b.posted.length - 1].uid, '');
  }
  {
    // left by mum, and the phone now opens as somebody else: she signed out with no signal, or another browser session
    const stored = { 'sm.push.v1': JSON.stringify({ uid: 'mum', token: tok('mum'), env: '', at: Date.now() }) };
    const { A, fbk } = await boot('coach', { storage: stored, perm: 'granted' });
    check('another account: the old token is given up', A.pushRec, null);
    check('by deleting the browser\'s subscription', fbk.record.tokenDrops, 1);
    check('never written under the new account', tokWrites(fbk).length, 0);
    check('nor touching hers, which only she may', tokRemoves(fbk).length, 0);
  }
  {
    const fbk = makeFakebase();
    const stored = { 'sm.push.v1': JSON.stringify({ uid: 'mum', token: 'fTokOldOldOldOldOldOldOld:APA91b-old', env: '', at: Date.now() }) };
    const { A } = await boot('mum', { fbk, storage: stored, perm: 'granted' });
    check('the browser has a new token: the club gets it', tokWrites(fbk).map(w => w.path).join(), 'pushTokens/mum/' + fbk.token);
    check('and the old one comes down', tokRemoves(fbk).join(), 'pushTokens/mum/fTokOldOldOldOldOldOldOld:APA91b-old');
    check('the phone keeps the new one', A.pushRec.token, fbk.token);
  }
  {
    const fbk = makeFakebase();
    const week = 8 * 86400000;
    const stored = { 'sm.push.v1': JSON.stringify({ uid: 'mum', token: fbk.token, env: '', at: Date.now() - week }) };
    await boot('mum', { fbk, storage: stored, perm: 'granted' });
    check('a week on, its date is freshened', tokWrites(fbk).length, 1);
    check('nothing taken down', tokRemoves(fbk).length, 0);
  }
  {
    const fbk = makeFakebase();
    const stored = { 'sm.push.v1': JSON.stringify({ uid: 'mum', token: fbk.token, env: '', at: Date.now() }) };
    await boot('mum', { fbk, storage: stored, perm: 'granted' });
    check('the same token, recently: nothing written', tokWrites(fbk).length + tokRemoves(fbk).length, 0);
  }
  {
    const stored = { 'sm.push.v1': JSON.stringify({ uid: 'mum', token: tok('mum'), env: '', at: Date.now() }) };
    const { A, fbk } = await boot('mum', { storage: stored, perm: 'default' });
    check('taken back in the browser: the server stops trying', tokRemoves(fbk).join(), 'pushTokens/mum/' + tok('mum'));
    check('and it reads as off', A.pushRec, null);
  }

  console.log('\n--- following a game, on the phone ---');
  /* The Live tab's Notify me is also left where the server finds it
     (onFollowed, above), so the same moments reach her phones with Minutes
     closed. */
  const follows = fbk => fbk.record.writes.filter(w => w.path.startsWith('follow/'));
  {
    const { A, fbk } = await boot('mum');
    A.ui.matchId = 'g1';
    A.click({ act: 'feedfollow', v: '1' }); await A.flush();
    deepEq('following a game is one write, under her own account', follows(fbk).map(w => w.path), ['follow/CLUB/g1/mum']);
    check('saying when, and nothing about her or the game', Object.keys(follows(fbk)[0].value).join(), 'at');
    A.ui.matchId = 'g2';
    A.click({ act: 'feedfollow', v: '1' }); await A.flush();
    check('following another game follows that one', follows(fbk).map(w => w.path).pop(), 'follow/CLUB/g2/mum');
    check('and lets the first go: a page follows one game', fbk.record.removes.includes('follow/CLUB/g1/mum'), true);
    A.click({ act: 'feedfollow', v: '0' }); await A.flush();
    check('stopping takes it away', fbk.record.removes.includes('follow/CLUB/g2/mum') && A.ui.follow === null, true);
  }
  {
    const fbk = makeFakebase().refuseWrites(p => p.startsWith('follow/'));
    const { A } = await boot('mum', { fbk });
    A.ui.matchId = 'g1';
    const before = A.toasts.length;
    A.click({ act: 'feedfollow', v: '1' }); await A.flush();
    check('refused by older rules: the page still follows', A.ui.follow, 'g1');
    check('and a phone without notifications on is not bothered with it', A.toasts.slice(before).join(), 'Following this game');
  }
  {
    const fbk = makeFakebase().refuseWrites(p => p.startsWith('follow/'));
    const { A } = await boot('mum', { fbk, perm: 'granted' });
    A.click({ act: 'pushon' }); await A.flush();
    check('(notifications on for this phone)', A.pushOn(), true);
    A.ui.matchId = 'g1';
    A.click({ act: 'feedfollow', v: '1' }); await A.flush();
    check('with them on, a refusal is said: the closed phone would not hear', /page only.*version/.test(A.lastToast() || ''), true);
    A.state.matches.g1 = { id: 'g1', teamId: 't1', opponent: 'Northgate', date: '2026-10-09', currentHalf: 1, periods: {} };
    A.ui.teamId = 't1'; A.ui.view = 'game'; A.ui.gameView = 'live'; A.render();
    check('the Live tab says they reach the phone closed, not only this page', /even with Minutes closed/.test(A.rendered()) && !/while this page is open/.test(A.rendered()), true);
  }
  {
    const { A, fbk } = await boot(null);
    A.ui.matchId = 'g1';
    A.click({ act: 'feedfollow', v: '1' }); await A.flush();
    check('signed out: the page follows, nothing is written', follows(fbk).length, 0);
  }

  console.log('\n--- a tapped notification lands where it happened ---');
  {
    const { A, b } = await boot('mum');
    const [, onMsg] = b.swListeners.find(([t]) => t === 'message') || [];
    check('the page listens to its worker', typeof onMsg, 'function');
    onMsg({ data: { type: 'open', code: 'CLUB', hash: '#/messages/t1/mum' } }); await A.flush();
    check('this club: straight to the conversation', A.ui.view + ' ' + (A.ui.thread || {}).fam, 'thread mum');
    const was = global.location.hash, reloads = A.dom.reloads || 0;
    onMsg({ data: { type: 'open', code: 'CLUB', hash: 'javascript:alert(1)' } }); await A.flush();
    onMsg({ data: { type: 'open', code: 'OTHER', hash: 'https://evil.test/' } }); await A.flush();
    check('anything but a place in the app is ignored', global.location.hash + ' ' + (A.dom.reloads || 0), was + ' ' + reloads);
  }
  {
    const fbk = makeFakebase();
    const { A } = await boot('mum', { fbk, search: '?open=OTHER', hash: '#/messages' });
    check('opened by a tap from another club: noted', A.pushOpen, 'OTHER');
    check('and taken off the address', A.dom.replaced.includes('open='), false);
    fbk.deliver('userOrgs/mum', { CLUB: { name: 'Lakeside SC' } }); await A.flush();
    check('not her club: nothing switches', A.storage.getItem('sm.workspace') + ' ' + (A.dom.reloads || 0), 'CLUB 0');
  }
  {
    const fbk = makeFakebase();
    const { A } = await boot('mum', { fbk, search: '?open=OTHER', hash: '#/messages' });
    fbk.deliver('userOrgs/mum', { CLUB: { name: 'Lakeside SC' }, OTHER: { name: 'Hill FC' } }); await A.flush();
    check('her club: it switches there', A.storage.getItem('sm.workspace'), 'OTHER');
    check('and reloads into it', A.dom.reloads, 1);
  }
  {
    const { A } = await boot('mum', { search: '?open=CLUB' });
    check('the club already open: nothing to switch', A.pushOpen, null);
  }

  /* ---------------- the service worker ---------------- */

  console.log('\n--- the service worker ---');
  const SW = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  function worker(opts = {}) {
    const w = { handlers: {}, shown: [], opened: [], store: {}, wins: opts.wins || [] };
    const self = {
      navigator: { userAgent: opts.ua || 'Mozilla/5.0 (Linux; Android 14) Chrome/130' },
      addEventListener: (t, fn) => { w.handlers[t] = fn; },
      skipWaiting() { },
      registration: { scope: 'https://x.test/app/', showNotification: (title, o) => { w.shown.push({ title, ...o }); return Promise.resolve(); } },
      clients: {
        matchAll: () => Promise.resolve(w.wins),
        openWindow: url => { w.opened.push(url); return Promise.resolve(); },
        claim: () => Promise.resolve()
      }
    };
    const caches = { open: () => Promise.resolve({
      match: k => Promise.resolve(k in w.store ? { text: () => Promise.resolve(w.store[k]) } : undefined),
      put: (k, r) => { w.store[k] = r.body; return Promise.resolve(); }
    }) };
    function Response(body) { this.body = String(body); }
    vm.runInNewContext(SW, { self, caches, Response, console });
    w.fire = async (type, e) => { let p; w.handlers[type]({ ...e, waitUntil: x => { p = x; } }); await p; };
    w.push = data => w.fire('push', { data: { json: () => ({ data, from: '1', fcmMessageId: 'x' }) } });
    return w;
  }
  const DATA = { title: 'Flight · Jaz', body: 'Bring water', tag: 'n1', code: 'CLUB', hash: '#/messages', uid: 'mum', urgent: '' };
  {
    const w = worker();
    check('no fetch handler: it never serves the app from a copy of its own', 'fetch' in w.handlers, false);
    await w.push(DATA);
    check('a push is shown', w.shown.length, 1);
    check('with the server\'s title', w.shown[0].title, 'Flight · Jaz');
    check('and its words', w.shown[0].body, 'Bring water');
    check('tagged, so a repeat replaces it', w.shown[0].tag, 'n1');
    check('remembering where it opens', JSON.stringify(w.shown[0].data), JSON.stringify({ code: 'CLUB', hash: '#/messages' }));
  }
  {
    const w = worker();
    await w.fire('message', { data: { type: 'me', uid: 'coach' } });
    await w.push(DATA);
    check('for an account not signed in here: shown without its words', w.shown[0].body.includes('Bring water') || w.shown[0].title.includes('Jaz'), false);
    check('and a tap opens nothing of hers', w.shown[0].data.hash, '');
    await w.fire('message', { data: { type: 'me', uid: '' } });
    await w.push(DATA);
    check('signed out: the same', w.shown[1].body.includes('Bring water'), false);
    await w.fire('message', { data: { type: 'me', uid: 'mum' } });
    await w.push(DATA);
    check('signed back in as her: in full', w.shown[2].body, 'Bring water');
  }
  {
    const looking = [{ visibilityState: 'visible', focused: true, focus() { }, postMessage() { } }];
    const w = worker({ wins: looking });
    await w.push(DATA);
    check('Minutes open in front of her: the page says it, not the system', w.shown.length, 0);
    const iw = worker({ wins: looking, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Safari/604.1' });
    await iw.push(DATA);
    check('except on an iPhone, which takes push away from a site that shows nothing', iw.shown.length, 1);
  }
  {
    const w = worker();
    await w.push({ ...DATA, urgent: '1' });
    check('urgent stays on screen until she sees it', w.shown[0].requireInteraction, true);
  }
  {
    const told = [];
    const win = { visibilityState: 'hidden', focused: false, focus() { told.push('focus'); return Promise.resolve(); }, postMessage: m => told.push(m) };
    const w = worker({ wins: [win] });
    await w.fire('notificationclick', { notification: { close() { told.push('closed'); }, data: { code: 'OTHER', hash: '#/messages/t1/mum' } } });
    check('a tap closes it, brings Minutes forward, and says where', JSON.stringify(told), JSON.stringify(['closed', 'focus', { type: 'open', code: 'OTHER', hash: '#/messages/t1/mum' }]));
    check('without opening a second one', w.opened.length, 0);
  }
  {
    const w = worker();
    await w.fire('notificationclick', { notification: { close() { }, data: { code: 'OTHER', hash: '#/messages/t1/mum' } } });
    check('with none open, it opens one there, the club on the address', w.opened[0], 'https://x.test/app/?open=OTHER#/messages/t1/mum');
  }

  /* A team helper (AUTH.md, *Team helpers*): the notices and calendar rules
     read every teamIndex entry for the team, so she is told of both; a
     family's conversation is read only by the 'coach' entries, so she never
     hears one. Nothing in functions/push.js names her. */
  console.log('\n--- a team helper ---');
  {
    const helper = S => {
      S.put(W + 'access/teams/t1/helpers/hal', true);
      S.put(W + 'access/teamIndex/t1/hal', 'helper');
      S.put(W + 'access/index/hal', true);
      S.put('pushTokens/hal', { [tok('hal')]: { at: 1, ua: 'iPhone' } });
      return S;
    };
    let S = helper(server());
    let r = await S.fire('board/CLUB/t1/n9', { by: 'coach', byName: 'Jaz', at: 5, text: 'Kit day' });
    check('she hears her team\'s notices', r.pushNotice.to.includes('hal'), true);
    S = helper(server());
    r = await S.fire('board/CLUB/t1/n9', { by: 'hal', byName: 'Hal', at: 5, text: 'Kit day' });
    check('— not one she posted herself', toUid(S, 'hal').length, 0);
    check('— which the coach hears', toUid(S, 'coach').length > 0, true);
    S = helper(server());
    r = await S.fire('dm/CLUB/t1/mum/m/x9', { by: 'mum', byName: 'Mo', at: 5, text: 'Ella has a cold' });
    check('never a family\'s conversation', toUid(S, 'hal').length, 0);
    S = helper(calServer());
    r = (await S.fire(W + 'teams/t1/events/e1/called', 'cancelled')).pushEntry;
    check('she hears her team\'s calendar change', r.to.includes('hal'), true);
  }

  H.summary('notifications to a closed phone');
})().catch(e => { console.error(e); process.exit(1); });
