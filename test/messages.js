/* Messages: team notices from the coaches, and each family's conversation
   with its team's coaches.

   Driven against the fake Firebase, because everything that matters here is
   about which paths get read and written by whom: a parent must listen to her
   own conversation and never the list of every family's, a coach of another
   age group must not be handed a team's notices, and a post or a reply must be
   written where test/rules.js says the database will take it. The rules are
   the real line; this pins that the app asks for exactly what they allow, and
   that a name never reaches a screen it has no business on. */

const H = require('./harness');
const { check } = H;
const { makeFakebase } = require('./fakebase');

const CONFIG = { apiKey: 'k', databaseURL: 'https://prod.example', projectId: 'p' };

const CLUB = {
  access: {
    org: { name: 'Lakeside SC' },
    admins: { adm: true },
    index: { adm: true, coach: true, trk: true, mum: true, dad: true, other: true },
    members: {
      adm: { name: 'Ada', email: 'ada@x.test' }, coach: { name: 'Jaz', email: 'jaz@x.test' },
      trk: { name: 'Tia' }, mum: { name: 'Mo', email: 'mo@x.test' }, dad: { name: 'Dev', email: 'dev@x.test' },
      other: { name: 'Kim' }
    },
    teams: { t1: { coaches: { coach: true }, trackers: { trk: true } }, t2: { coaches: { other: true } } },
    teamIndex: { t1: { coach: 'coach', trk: 'tracker' }, t2: { other: 'coach' } }
  },
  teams: {
    t1: { id: 't1', name: 'Flight', players: {
      p1: { id: 'p1', name: 'Ella', number: '7', active: true, guardians: { mum: true } },
      p2: { id: 'p2', name: 'Bea', number: '9', active: true, guardians: { dad: true } },
      p3: { id: 'p3', name: 'Cleo', number: '4', active: true }
    } },
    t2: { id: 't2', name: 'Storm', players: { q1: { id: 'q1', name: 'Gia', number: '3', active: true } } }
  },
  matches: {}
};

async function boot(who, opts = {}) {
  const fbk = opts.fbk || makeFakebase();
  const A = H.loadApp({ firebase: fbk, config: CONFIG, storage: { 'sm.workspace': 'CLUB', ...(opts.storage || {}) } });
  await A.flush();
  fbk.signIn(who, { name: (CLUB.access.members[who] || {}).name || who, email: who + '@x.test' }); await A.flush();
  // a copy each time: the app writes into what it was handed, and one test's sync must not seed the next
  fbk.deliver('workspaces/CLUB', JSON.parse(JSON.stringify(opts.club || CLUB))); await A.flush();
  return { A, fbk };
}
const writes = (fbk, prefix) => fbk.record.writes.filter(w => w.path.startsWith(prefix));
const NOTE = (A, by, text, extra) => ({ by, byName: CLUB.access.members[by].name, at: A.nowMs() - 60000, text, ...(extra || {}) });

(async () => {

  console.log('--- who listens to what ---');
  {
    const { A, fbk } = await boot('mum');
    check('a parent listens to her team\'s notices', fbk.watching('board/CLUB/t1'), true);
    check('and to her own conversation', fbk.watching('dm/CLUB/t1/mum'), true);
    check('never to every family\'s', fbk.watching('dm/CLUB/t1'), false);
    check('nor another family\'s', fbk.watching('dm/CLUB/t1/dad'), false);
    check('nor a team she has no child on', fbk.watching('board/CLUB/t2'), false);
    check('the bell is drawn', A.dom.node('#inboxBtn').hidden, false);
  }
  {
    const { fbk } = await boot('coach');
    check('a coach listens to her team\'s notices', fbk.watching('board/CLUB/t1'), true);
    check('and every family\'s conversation', fbk.watching('dm/CLUB/t1'), true);
    check('not another age group\'s notices', fbk.watching('board/CLUB/t2'), false);
    check('nor its families', fbk.watching('dm/CLUB/t2'), false);
  }
  {
    const { fbk } = await boot('trk');
    check('a tracker reads the notices', fbk.watching('board/CLUB/t1'), true);
    check('but no family\'s conversation', fbk.watching('dm/CLUB/t1'), false);
  }
  {
    const { fbk } = await boot('adm');
    check('an admin hears from every team', fbk.watching('dm/CLUB/t1') && fbk.watching('dm/CLUB/t2'), true);
  }
  {
    // a club that has never had an admin is not past its bootstrap, and nothing here has rules to stand on
    const club = JSON.parse(JSON.stringify(CLUB)); club.access.admins = {};
    const { A, fbk } = await boot('coach', { club });
    check('no admin yet: no messages at all', fbk.readPaths().some(p => /^(board|dm)\//.test(p)), false);
    check('and no bell', A.dom.node('#inboxBtn').hidden, true);
  }

  console.log('\n--- what arrives, and what is news ---');
  {
    const { A, fbk } = await boot('mum');
    fbk.deliver('board/CLUB/t1', { n1: NOTE(A, 'coach', 'Old news') }); await A.flush();
    check('the first read notifies nothing', A.toasts.length, 0);
    check('but it counts as unread', A.unreadCount(), 1);
    check('and the bell says so', A.dom.node('#inboxN').textContent, '1');
    fbk.deliver('board/CLUB/t1', { n1: NOTE(A, 'coach', 'Old news'), n2: NOTE(A, 'coach', 'Training moved to 6pm', { urgent: true }) }); await A.flush();
    check('a new notice pops up', /Urgent · Flight · Jaz · Training moved to 6pm/.test(A.lastToast() || ''), true);
    const before = A.toasts.length;
    fbk.deliver('board/CLUB/t1', { n1: NOTE(A, 'coach', 'Old news'), n2: NOTE(A, 'coach', 'Training moved to 6pm'), n3: NOTE(A, 'mum', 'mine') }); await A.flush();
    check('my own does not', A.toasts.length, before);

    A.click({ act: 'inbox' }); await A.flush();
    const seen = writes(fbk, 'board/CLUB/t1/');
    check('opening Messages ticks each notice seen', seen.map(w => w.path).sort().join(' '), 'board/CLUB/t1/n1/seen/mum board/CLUB/t1/n2/seen/mum');
    check('nothing unread now', A.unreadCount(), 0);
    const html = A.rendered();
    check('the notice is drawn', /Training moved to 6pm/.test(html), true);
    check('a parent is not offered to post', /data-act="postnew"/.test(html), false);
    check('no other child\'s name reaches her screen', /Bea|Cleo/.test(html), false);
    check('she is offered the coaches', /Coaches of/.test(html), true);
    A.click({ act: 'postsend' }); await A.flush();
    check('and posting is refused in the handler', writes(fbk, 'board/CLUB/t1/').filter(w => !/seen/.test(w.path)).length, 0);
  }

  console.log('\n--- a coach posts a notice ---');
  {
    const { A, fbk } = await boot('coach');
    fbk.deliver('board/CLUB/t1', null); fbk.deliver('dm/CLUB/t1', null); await A.flush();
    A.click({ act: 'inbox' }); await A.flush();
    check('she is offered to post', /data-act="postnew"/.test(A.rendered()), true);
    A.click({ act: 'postnew' });
    A.click({ act: 'posturgent' });
    A.dom.node('#postText').value = '  No training Thursday, pitch is waterlogged  ';
    A.click({ act: 'postsend' }); await A.flush();
    const w = writes(fbk, 'board/CLUB/t1/');
    check('written at one notice, under her team', w.length === 1 && /^board\/CLUB\/t1\/[^/]+$/.test(w[0].path), true);
    check('stamped as her', w[0] && w[0].value.by, 'coach');
    check('trimmed', w[0] && w[0].value.text, 'No training Thursday, pitch is waterlogged');
    check('and urgent', w[0] && w[0].value.urgent, true);
    check('nothing is left in the outbox once saved', Object.keys(A.msgs.outbox).length, 0);
    const sheet = String(A.dom.node('#sheet').innerHTML);
    check('then offers to email the parents', /Email the parents \(2\)/.test(sheet), true);
    check('in Bcc, every family with an address', /bcc=mo%40x\.test%2Cdev%40x\.test|bcc=dev%40x\.test%2Cmo%40x\.test/.test(sheet), true);
    check('the families list is accounts, not players', A.families('t1').sort().join(','), 'dad,mum');

    fbk.deliver('board/CLUB/t1', { [w[0].path.split('/').pop()]: { ...w[0].value, seen: { mum: A.nowMs() } } }); await A.flush();
    A.click({ act: 'inbox' }); await A.flush();
    check('she sees who has seen it', /Seen by 1 of 2 families/.test(A.rendered()), true);
  }

  console.log('\n--- a family and the coaches ---');
  {
    const { A, fbk } = await boot('mum');
    fbk.deliver('dm/CLUB/t1/mum', null); await A.flush();
    A.click({ act: 'thread', tid: 't1', fam: 'mum' }); await A.flush();
    check('her conversation opens', /Coaches of/.test(A.rendered()) && /Jaz/.test(A.rendered()), true);
    check('and says who can read it', /never one coach alone/.test(A.rendered()), true);
    A.dom.node('#msgText').value = 'Ella has a cold, back next week';
    A.click({ act: 'msgsend', tid: 't1', fam: 'mum' }); await A.flush();
    const w = writes(fbk, 'dm/CLUB/t1/mum/m/');
    check('written into her own conversation', w.length, 1);
    check('as her', w[0] && w[0].value.by, 'mum');
    A.dom.node('#msgText').value = 'sneaky';
    A.click({ act: 'msgsend', tid: 't1', fam: 'dad' }); await A.flush();
    check('never into another family\'s', writes(fbk, 'dm/CLUB/t1/dad/').length, 0);
    A.click({ act: 'thread', tid: 't1', fam: 'dad' }); await A.flush();
    check('and another family\'s is not drawn', /Coaches of|sneaky/.test(A.rendered()) && A.ui.view === 'thread', false);
  }
  {
    const { A, fbk } = await boot('coach');
    const at = A.nowMs() - 5000;
    fbk.deliver('board/CLUB/t1', null);
    fbk.deliver('dm/CLUB/t1', { mum: { m: { d1: { by: 'mum', byName: 'Mo', at, text: 'Ella has a cold' } } } }); await A.flush();
    check('a family\'s message is unread for the coach', A.unreadCount(), 1);
    A.click({ act: 'inbox' }); await A.flush();
    check('listed with whose parent it is', /Mo/.test(A.rendered()) && /Ella/.test(A.rendered()), true);
    A.click({ act: 'thread', tid: 't1', fam: 'mum' }); await A.flush();
    check('opening it marks it read for her', writes(fbk, 'dm/CLUB/t1/mum/seen/coach').length, 1);
    A.dom.node('#msgText').value = 'Get well soon';
    A.click({ act: 'msgsend', tid: 't1', fam: 'mum' }); await A.flush();
    check('her reply goes into that family\'s conversation', writes(fbk, 'dm/CLUB/t1/mum/m/').map(w => w.value.by).join(), 'coach');
    fbk.deliver('dm/CLUB/t1', { mum: { m: { d1: { by: 'mum', byName: 'Mo', at, text: 'Ella has a cold' } } },
      dad: { m: { e1: { by: 'dad', byName: 'Dev', at: A.nowMs(), text: 'Bea will be late' } } } }); await A.flush();
    check('a new family writing in pops up', /Dev · Flight · Bea will be late/.test(A.lastToast() || ''), true);
  }
  {
    const { A, fbk } = await boot('other');
    A.dom.node('#msgText').value = 'hello';
    A.click({ act: 'msgsend', tid: 't1', fam: 'mum' }); await A.flush();
    check('another team\'s coach cannot write to Flight\'s families', writes(fbk, 'dm/').length, 0);
  }

  console.log('\n--- no signal, and refusals ---');
  {
    const { A, fbk } = await boot('mum');
    fbk.refuseWrites(p => /^dm\//.test(p));
    fbk.deliver('dm/CLUB/t1/mum', null); await A.flush();
    A.click({ act: 'thread', tid: 't1', fam: 'mum' });
    A.dom.node('#msgText').value = 'Running late';
    A.click({ act: 'msgsend', tid: 't1', fam: 'mum' }); await A.flush();
    check('a refused message is kept, not lost', Object.values(A.msgs.outbox).map(o => o.status).join(), 'refused');
    check('and says so', /Not sent/.test(A.rendered()) && /msgretry/.test(A.rendered()), true);
    fbk.refuseWrites(() => false);
    const id = Object.keys(A.msgs.outbox)[0];
    A.click({ act: 'msgretry', id }); await A.flush();
    check('trying again sends it', Object.keys(A.msgs.outbox).length, 0);
  }
  {
    // no signal: the write never answers, but Firebase echoes it to this page at once
    const pre = makeFakebase();
    const realSet = pre.modules.database.set;
    pre.modules.database.set = (ref, v) => /^dm\//.test(ref.path) ? new Promise(() => { }) : realSet(ref, v);
    const { A, fbk } = await boot('mum', { fbk: pre });
    fbk.deliver('dm/CLUB/t1/mum', null); await A.flush();
    A.click({ act: 'thread', tid: 't1', fam: 'mum' });
    A.dom.node('#msgText').value = 'No signal here';
    A.click({ act: 'msgsend', tid: 't1', fam: 'mum' }); await A.flush();
    const id = Object.keys(A.msgs.outbox)[0];
    fbk.deliver('dm/CLUB/t1/mum', { m: { [id]: A.msgs.outbox[id].value } }); await A.flush();
    check('its own echo does not clear the outbox', Object.keys(A.msgs.outbox).join(), id);
    check('drawn once, still sending', A.threadMsgs('t1', 'mum').map(x => x.status).join(), 'sending');
  }
  {
    // a message queued with no signal, and the page reloaded before it went
    const pend = { kind: 'dm', tid: 't1', fam: 'mum', path: 'dm/CLUB/t1/mum/m/q1', status: 'sending',
      value: { by: 'mum', byName: 'Mo', at: 1, text: 'Sent from the car park' } };
    const { A, fbk } = await boot('mum', { storage: { 'sm.msgs:CLUB:mum': JSON.stringify({ board: {}, dm: {}, outbox: { q1: pend } }) } });
    check('still waiting after the reload', /Sent from the car park/.test(A.threadMsgs('t1', 'mum').map(x => x.text).join()), true);
    fbk.deliver('dm/CLUB/t1/mum', null); await A.flush();
    check('sent again once the conversation is read', writes(fbk, 'dm/CLUB/t1/mum/m/q1').length, 1);
  }
  {
    const pend = { kind: 'dm', tid: 't1', fam: 'mum', path: 'dm/CLUB/t1/mum/m/q1', status: 'sending',
      value: { by: 'mum', byName: 'Mo', at: 1, text: 'Already there' } };
    const { A, fbk } = await boot('mum', { storage: { 'sm.msgs:CLUB:mum': JSON.stringify({ board: {}, dm: {}, outbox: { q1: pend } }) } });
    fbk.deliver('dm/CLUB/t1/mum', { m: { q1: pend.value } }); await A.flush();
    check('but not if it had landed before the reload', writes(fbk, 'dm/CLUB/t1/mum/m/q1').length, 0);
    check('and it leaves the outbox', Object.keys(A.msgs.outbox).length, 0);
  }

  console.log('\n--- the parent list the rules narrow notices with ---');
  {
    // a club from before the list: an admin's connect creates it, team by team, uid by uid
    const { A, fbk } = await boot('adm');
    const tp = fbk.record.writes.filter(w => w.path.includes('/access/teamParents/'));
    check('an admin\'s connect writes every parent', tp.map(w => w.path + '=' + w.value).sort().join(' '),
      'workspaces/CLUB/access/teamParents/t1/dad=p2 workspaces/CLUB/access/teamParents/t1/mum=p1');
    check('one entry at a time, never a whole team', tp.every(w => w.path.split('/').length === 6), true);
  }
  {
    // a coach may not be the one to create it: the first entry closes the bridge on every team
    const { fbk } = await boot('coach');
    check('a coach does not start the list', fbk.record.writes.some(w => w.path.includes('/teamParents/')), false);
  }
  {
    const club = JSON.parse(JSON.stringify(CLUB));
    club.access.teamParents = { t1: { mum: 'p1', dad: 'p2' } };
    const { A, fbk } = await boot('coach', { club });
    check('nothing to write when it is already right', fbk.record.writes.some(w => w.path.includes('/teamParents/')), false);
    A.ui.teamId = 't1';
    A.click({ act: 'toggleguard', pid: 'p3', uid: 'trk' }); await A.flush();
    check('linking a parent puts her on it', fbk.writtenTo('workspaces/CLUB/access/teamParents/t1/trk').map(w => w.value).join(), 'p3');
    A.click({ act: 'toggleguard', pid: 'p1', uid: 'mum' }); await A.flush();
    check('unlinking her last child takes her off', fbk.record.removes.includes('workspaces/CLUB/access/teamParents/t1/mum'), true);
    check('and the list no longer names her', !!(((A.state.access.teamParents || {}).t1 || {}).mum), false);
  }
  {
    const club = JSON.parse(JSON.stringify(CLUB));
    club.access.teamParents = { t1: { mum: 'p1' } };
    const { A, fbk } = await boot('other', { club });
    A.ui.teamId = 't1';
    A.click({ act: 'toggleguard', pid: 'p3', uid: 'other' }); await A.flush();
    check('a coach of another team writes no one onto it', fbk.record.writes.some(w => w.path.includes('/teamParents/')), false);
  }

  console.log('\n--- signing out ---');
  {
    const { A, fbk } = await boot('mum');
    fbk.deliver('dm/CLUB/t1/mum', { m: { d1: { by: 'coach', byName: 'Jaz', at: A.nowMs(), text: 'Private reply' } } }); await A.flush();
    check('the conversation is cached for offline', /Private reply/.test(A.storage.getItem('sm.msgs:CLUB:mum') || ''), true);
    A.click({ act: 'thread', tid: 't1', fam: 'mum' }); await A.flush();
    fbk.signOut(); await A.flush();
    check('signed out, nothing of it is drawn', /Private reply/.test(A.rendered()), false);
    check('the bell goes', A.dom.node('#inboxBtn').hidden, true);
    check('and this device forgets it', A.storage.getItem('sm.msgs:CLUB:mum'), null);
  }

  H.summary('messages');
})();
