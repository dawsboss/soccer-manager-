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
  await fbk.serveClub('CLUB', JSON.parse(JSON.stringify(opts.club || CLUB)), A.flush); await A.flush();
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
    check('Messages is drawn', A.dom.node('#msgBtn').hidden, false);
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
    check('and no Messages', A.dom.node('#msgBtn').hidden, true);
  }

  console.log('\n--- what arrives, and what is news ---');
  {
    const { A, fbk } = await boot('mum');
    fbk.deliver('board/CLUB/t1', { n1: NOTE(A, 'coach', 'Old news') }); await A.flush();
    check('the first read notifies nothing', A.toasts.length, 0);
    check('but it counts as unread', A.unreadCount(), 1);
    check('and Messages says so', A.dom.node('#msgN').textContent, '1');
    check('not the bell: a notice is a message, not a notification', A.dom.node('#bellN').textContent, '');
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

  console.log('\n--- a coach or admin writes first ---');
  {
    const { A, fbk } = await boot('coach');
    fbk.deliver('dm/CLUB/t1', null); await A.flush();
    A.click({ act: 'inbox' }); await A.flush();
    check('she is offered a new message', /data-act="msgnew"/.test(A.rendered()), true);
    A.click({ act: 'msgnew' });
    const sheet = String(A.dom.node('#sheet').innerHTML);
    check('listing each family on her team, with whose parent', /Mo[\s\S]*Parent of Ella/.test(sheet) && /Dev[\s\S]*Parent of Bea/.test(sheet), true);
    check('and the other coaches and admins', /data-k="c:adm"/.test(sheet) && /data-k="c:other"/.test(sheet), true);
    check('never a tracker', /data-k="c:trk"|:trk"/.test(sheet), false);
    check('nor another team\'s family', /data-k="f:t2:/.test(sheet), false);
    check('no team dropdown to work through', /<select/.test(sheet), false);
    A.click({ act: 'msgpick', k: 'f:t1:mum' });
    check('tapping one chooses her', /Write to Mo/.test(String(A.dom.node('#msgPickFoot').innerHTML)), true);
    A.click({ act: 'msgpickgo' }); await A.flush();
    check('the family\'s conversation opens, empty', A.ui.view === 'thread' && /No messages yet/.test(A.rendered()), true);
    check('and says who reads it, with a lock', /class="lock"[\s\S]*Private · only Mo, the coaches of/.test(A.rendered()), true);
    A.dom.node('#msgText').value = 'Ella was great today';
    A.click({ act: 'msgsend', tid: 't1', fam: 'mum' }); await A.flush();
    const w = writes(fbk, 'dm/CLUB/t1/mum/m/');
    check('written into that family\'s one conversation', w.length === 1 && w[0].value.by === 'coach', true);
    fbk.deliver('dm/CLUB/t1', { mum: { m: { [w[0].path.split('/').pop()]: w[0].value } } }); await A.flush();
    check('Sent once the database has it', A.msgState({ tid: 't1', fam: 'mum' }, A.convMsgs({ tid: 't1', fam: 'mum' })[0]), 'sent');
    A.click({ act: 'msgto', tid: 't1', fam: 'trk' }); await A.flush();
    check('not to somebody who is not a family on the team', A.ui.view === 'thread' && A.ui.thread.fam === 'trk', false);
    A.click({ act: 'msgto', tid: 't2', fam: 'mum' }); await A.flush();
    check('nor on a team she does not coach', A.ui.thread && A.ui.thread.tid, 't1');
    A.dom.node('#msgText').value = 'sneaky';
    A.click({ act: 'msgsend', tid: 't1', fam: 'trk' }); await A.flush();
    check('and the handler refuses the write too', writes(fbk, 'dm/CLUB/t1/trk/').length, 0);
  }
  {
    // the parent's side: the coach's first message lands in her own conversation, and her phone says it got it
    const { A, fbk } = await boot('mum');
    fbk.deliver('dm/CLUB/t1/mum', null); await A.flush();
    const at = A.nowMs() - 1000;
    fbk.deliver('dm/CLUB/t1/mum', { m: { c1: { by: 'coach', byName: 'Jaz', at, text: 'Ella was great today' } } }); await A.flush();
    check('it pops up', /Jaz · Flight · Ella was great today/.test(A.lastToast() || ''), true);
    const got = writes(fbk, 'dm/CLUB/t1/mum/got/mum');
    check('her phone says it has it, once', got.length, 1);
    check('no earlier than the message', got[0] && got[0].value >= at, true);
    check('not read just by arriving', writes(fbk, 'dm/CLUB/t1/mum/seen/').length, 0);
    // a club still on older rules: the marker is refused and Firebase hands back the conversation without it
    fbk.deliver('dm/CLUB/t1/mum', { m: { c1: { by: 'coach', byName: 'Jaz', at, text: 'Ella was great today' } } }); await A.flush();
    fbk.deliver('dm/CLUB/t1/mum', { m: { c1: { by: 'coach', byName: 'Jaz', at, text: 'Ella was great today' } } }); await A.flush();
    check('a refused marker is not asked for again and again', writes(fbk, 'dm/CLUB/t1/mum/got/mum').length, 1);
    check('counted on Messages', A.msgUnread(), 1);
    check('not under the bell', A.notesUnread(), 0);
  }
  {
    // the coach's side again: a second tick, then read, and who
    const { A, fbk } = await boot('coach');
    const at = A.nowMs() - 60000;
    const th = (extra) => ({ mum: { m: { c1: { by: 'coach', byName: 'Jaz', at, text: 'Ella was great today' } }, ...extra } });
    fbk.deliver('dm/CLUB/t1', th()); await A.flush();
    A.click({ act: 'thread', tid: 't1', fam: 'mum' }); await A.flush();
    const one = () => A.msgState({ tid: 't1', fam: 'mum' }, A.convMsgs({ tid: 't1', fam: 'mum' })[0]);
    check('one tick: the server has it', one(), 'sent');
    check('drawn as Sent, with the time', /✓<\/span> Sent/.test(A.rendered()), true);
    fbk.deliver('dm/CLUB/t1', th({ got: { mum: at + 5000 } })); await A.flush();
    check('two: her phone has it', one(), 'delivered');
    check('drawn as Delivered', /✓✓<\/span> Delivered/.test(A.rendered()), true);
    fbk.deliver('dm/CLUB/t1', th({ got: { mum: at + 5000 }, seen: { mum: at + 9000 } })); await A.flush();
    check('read once she opens it', one(), 'read');
    check('drawn blue', /tick read[^>]*>✓✓<\/span> Read/.test(A.rendered()), true);
    const id = A.convMsgs({ tid: 't1', fam: 'mum' })[0].id;
    A.click({ act: 'msginfo', id });
    const info = String(A.dom.node('#sheet').innerHTML);
    check('message info names who has it and who read it', /Delivered[\s\S]*Mo,[\s\S]*Read[\s\S]*Mo,/.test(info), true);
    fbk.deliver('dm/CLUB/t1', th({ got: { coach: at + 9000 } })); await A.flush();
    check('her own marker is not a delivery', one(), 'sent');
  }
  {
    // a reply with no signal says so, and goes when it comes back
    const pre = makeFakebase();
    const realSet = pre.modules.database.set;
    pre.modules.database.set = (ref, v) => /^dm\//.test(ref.path) && /\/m\//.test(ref.path) ? new Promise(() => { }) : realSet(ref, v);
    const { A, fbk } = await boot('coach', { fbk: pre });
    fbk.deliver('.info/connected', false); fbk.deliver('dm/CLUB/t1', null); await A.flush();
    A.click({ act: 'msgto', tid: 't1', fam: 'mum' }); await A.flush();
    A.dom.node('#msgText').value = 'Bring shin pads';
    A.click({ act: 'msgsend', tid: 't1', fam: 'mum' }); await A.flush();
    check('waiting for a signal, said as such', /Waiting for a signal/.test(A.rendered()), true);
  }

  console.log('\n--- finding people, and writing to several ---');
  {
    const { A, fbk } = await boot('adm');
    fbk.deliver('dm/CLUB/t1', null); fbk.deliver('dm/CLUB/t2', null); await A.flush();
    A.click({ act: 'msgnew' });
    const find = q => { A.dom.node('#msgFind').value = q; A.ui.msgPick.q = q; return A.pickMatches().map(p => p.key).sort().join(' '); };
    check('an admin can find anyone she may write to', find(''), 'c:coach c:other f:t1:dad f:t1:mum');
    check('by a child\'s name', find('ella'), 'f:t1:mum');
    check('by the parent\'s', find('dev'), 'f:t1:dad');
    check('by team', find('flight'), 'c:coach f:t1:dad f:t1:mum');
    check('by role', find('coach'), 'c:coach c:other');
    check('every word has to match', find('flight parent bea'), 'f:t1:dad');
    find('flight parent');
    A.click({ act: 'msgpickall' });
    check('choose all that match', A.ui.msgPick.sel.sort().join(' '), 'f:t1:dad f:t1:mum');
    A.click({ act: 'msgpick', k: 'c:other' });
    A.click({ act: 'msgpickgo' });
    check('several: one message to write', /To 3 people/.test(String(A.dom.node('#sheet').innerHTML)), true);
    check('saying nobody sees who else got it', /Nobody sees who else got it/.test(String(A.dom.node('#sheet').innerHTML)), true);
    A.dom.node('#multiText').value = 'Fees for the spring are due Friday';
    A.click({ act: 'msgmulti' }); await A.flush();
    const w = fbk.record.writes.filter(x => /\/m\//.test(x.path)).map(x => x.path.replace(/\/m\/.*/, '')).sort();
    check('each into their own conversation, never one shared', w.join(' '), 'dm/CLUB/t1/dad dm/CLUB/t1/mum staffdm/CLUB/adm~other');
    check('all the same words', fbk.record.writes.filter(x => /\/m\//.test(x.path)).every(x => x.value.text === 'Fees for the spring are due Friday'), true);
    check('and back on Messages', A.ui.view, 'inbox');
  }
  {
    // a choice that is no longer hers is left out, not sent
    const { A, fbk } = await boot('coach');
    fbk.deliver('dm/CLUB/t1', null); await A.flush();
    A.click({ act: 'msgnew' });
    A.ui.msgPick.sel = ['f:t1:mum', 'f:t2:dad'];
    A.click({ act: 'msgpickgo' });
    check('a family on a team she does not coach is not even offered', /To 2 people/.test(String(A.dom.node('#sheet').innerHTML)), false);
    A.ui.msgPick = { q: '', sel: ['f:t1:mum', 'f:t1:dad'] };
    A.click({ act: 'msgpickgo' });
    A.dom.node('#multiText').value = 'hi';
    A.state.access.teams.t1.coaches = {};   // taken off the team while the sheet was open
    A.click({ act: 'msgmulti' }); await A.flush();
    check('taken off the team, nothing goes', fbk.record.writes.filter(x => /^dm\//.test(x.path) && /\/m\//.test(x.path)).length, 0);
  }
  {
    const { A } = await boot('mum');
    A.click({ act: 'msgnew' });
    check('a parent finds only the coaches of her teams', A.pickMatches().map(p => p.key).join(), 'f:t1:mum');
    A.ui.msgPick.q = 'flight';
    check('and is never shown which children have no parent signed in', /No parent signed in|Cleo/.test(A.pickListHtml()), false);
  }
  {
    // what there is to choose from, before guessing a name
    const { A } = await boot('coach');
    A.click({ act: 'msgnew' });
    const groups = String(A.dom.node('#sheet').innerHTML);
    check('her team is a chip, with how many she can write to', /data-act="msgpickgroup" data-k="t1"[^>]*>Flight <span class="muted">2/.test(groups), true);
    check('and her colleagues another', /data-k="staff"[^>]*>Coaches and admins <span class="muted">2/.test(groups), true);
    A.click({ act: 'msgpickgroup', k: 'staff' });
    check('a chip narrows the list to it', A.pickMatches().map(p => p.key).sort().join(' '), 'c:adm c:other');
    A.click({ act: 'msgpickgroup', k: 't1' });
    check('her team: its families', A.pickMatches().map(p => p.key).sort().join(' '), 'f:t1:dad f:t1:mum');
    check('and the child with no parent signed in yet, said as such', /No parent signed in yet[\s\S]*Cleo\.[\s\S]*Squad → Parents/.test(A.pickListHtml()), true);
    A.click({ act: 'msgpickgroup', k: 't1' });
    A.ui.msgPick.q = 'cleo';
    check('a search for that child says why she is not there', /No parent signed in yet[\s\S]*Cleo/.test(A.pickListHtml()), true);
    A.ui.msgPick.q = 'storm';
    check('another team\'s families are not offered, only its coach', A.pickMatches().map(p => p.key).join(), 'c:other');
  }
  {
    // a team whose parents have not joined at all: not an empty, broken-looking list
    const club = JSON.parse(JSON.stringify(CLUB));
    for (const p of Object.values(club.teams.t1.players)) delete p.guardians;
    const { A } = await boot('coach', { club });
    A.click({ act: 'msgnew' });
    A.ui.msgPick.q = 'flight';
    const h = A.pickListHtml();
    check('searching her team says nobody there yet', /Nobody on Flight you can message yet/.test(h), true);
    check('and lists who is waiting on a parent', /Ella · Flight, Bea · Flight, Cleo · Flight/.test(h) || /Cleo · Flight/.test(h), true);
  }

  console.log('\n--- coaches and admins, to each other ---');
  {
    const { A, fbk } = await boot('coach');
    check('a coach listens to her conversation with each colleague', fbk.watching('staffdm/CLUB/' + A.sdId('coach', 'other')) && fbk.watching('staffdm/CLUB/' + A.sdId('adm', 'coach')), true);
    check('named the same from either side', A.sdId('other', 'coach'), A.sdId('coach', 'other'));
    check('never one with a tracker or a parent', fbk.readPaths().some(p => /^staffdm\/.*(trk|mum|dad)/.test(p)), false);
    check('nor the list of them', fbk.watching('staffdm/CLUB'), false);
    A.click({ act: 'sdopen', u: 'other' }); await A.flush();
    check('opens, just the two of them', /Private · only you and Kim/.test(A.rendered()) && /no other coach, and no admin/.test(A.rendered()), true);
    check('at an address naming the other', A.uiToHash(), '#/messages/with/other');
    A.dom.node('#msgText').value = 'Can you take my Thursday session?';
    A.click({ act: 'msgsend', cid: A.sdId('coach', 'other') }); await A.flush();
    const w = writes(fbk, 'staffdm/');
    check('one write, at one message in their conversation', w.length === 1 && w[0].path.startsWith('staffdm/CLUB/coach~other/m/') && w[0].value.by === 'coach', true);
    fbk.deliver('staffdm/CLUB/coach~other', { m: { [w[0].path.split('/').pop()]: w[0].value } });
    fbk.deliver('staffdm/CLUB/adm~coach', null); await A.flush();
    A.click({ act: 'inbox' }); await A.flush();
    check('listed under Conversations with what she is', /Kim <span class="muted">· Coach · Storm/.test(A.rendered()), true);
    A.click({ act: 'sdopen', u: 'trk' }); await A.flush();
    check('not with a tracker', A.ui.view, 'inbox');
    A.click({ act: 'sdopen', u: 'mum' }); await A.flush();
    check('nor a parent', A.ui.view, 'inbox');
  }
  {
    const { A, fbk } = await boot('other');
    fbk.deliver('staffdm/CLUB/coach~other', null); await A.flush();
    fbk.deliver('staffdm/CLUB/coach~other', { m: { s1: { by: 'coach', byName: 'Jaz', at: A.nowMs(), text: 'Can you take my Thursday session?' } } }); await A.flush();
    check('the other coach is told', /Jaz · Can you take my Thursday/.test(A.lastToast() || ''), true);
    check('and her phone says it has it', writes(fbk, 'staffdm/CLUB/coach~other/got/other').length, 1);
    check('counted on Messages', A.msgUnread(), 1);
    A.click({ act: 'sdopen', u: 'coach' }); await A.flush();
    check('opening it marks it read', writes(fbk, 'staffdm/CLUB/coach~other/seen/other').length, 1);
  }
  for (const who of ['mum', 'trk']) {
    const { A, fbk } = await boot(who);
    check(`a ${who === 'mum' ? 'parent' : 'tracker'} listens to no colleagues' conversation`, fbk.readPaths().some(p => p.startsWith('staffdm/')), false);
    A.click({ act: 'sdopen', u: 'coach' }); await A.flush();
    A.dom.node('#msgText').value = 'hi';
    A.click({ act: 'msgsend', cid: 'coach~' + who }); await A.flush();
    check('and cannot write in one', writes(fbk, 'staffdm/').length, 0);
  }

  console.log('\n--- two buttons: Messages and the bell ---');
  {
    const { A } = await boot('coach');
    A.click({ act: 'notes' }); await A.flush();
    check('the bell opens Notifications', A.ui.view === 'notes' && /Notifications/.test(A.rendered()), true);
    check('with no messages on it', /<h2[^>]*>Conversations|data-act="msgnew"|data-act="postnew"/.test(A.rendered()), false);
    check('at its own address', A.uiToHash(), '#/notifications');
    A.click({ act: 'msgprivacy' });
    const p = String(A.dom.node('#sheet').innerHTML);
    check('privacy is said plainly, never claiming end-to-end', /Not end-to-end encrypted/.test(p) && /HTTPS/.test(p), true);
  }

  console.log('\n--- turning a kind of notification off ---');
  {
    const { A, fbk } = await boot('mum');
    fbk.deliver('board/CLUB/t1', {}); fbk.deliver('dm/CLUB/t1/mum', null); await A.flush();
    check('her own switches are read, from her own place', fbk.watching('people/mum/mute'), true);
    A.click({ act: 'notes' }); await A.flush();
    check('offered on Notifications', /What notifies you/.test(A.rendered()) && /data-act="muteset" data-k="notice"/.test(A.rendered()), true);
    check('a parent has no Club activity switch, hearing none', /data-k="news"/.test(A.rendered()), false);
    A.click({ act: 'muteset', k: 'notice', v: '1' }); await A.flush();
    check('one write, hers, at that kind', fbk.writtenTo('people/mum/mute/notice').map(w => w.value).join(), 'true');
    const before = A.toasts.length;
    fbk.deliver('board/CLUB/t1', { n1: NOTE(A, 'coach', 'Bring water') }); await A.flush();
    check('notices off: no pop-up', A.toasts.length, before);
    check('no banner over the screen', /alertbar/.test(A.rendered()), false);
    check('but it waits on Messages, counted', A.msgUnread(), 1);
    fbk.deliver('dm/CLUB/t1/mum', { m: { c1: { by: 'coach', byName: 'Jaz', at: A.nowMs(), text: 'See you Saturday' } } }); await A.flush();
    check('her conversations still pop up', /See you Saturday/.test(A.lastToast() || ''), true);
    A.click({ act: 'muteset', k: 'notice', v: '0' }); await A.flush();
    check('and back on', fbk.writtenTo('people/mum/mute/notice').map(w => w.value).join(), 'true,false');
    A.click({ act: 'muteset', k: 'everything', v: '1' }); await A.flush();
    check('only the four kinds', fbk.record.writes.some(w => w.path === 'people/mum/mute/everything'), false);
  }
  {
    // set on another phone: this one hears it from the database
    const { A, fbk } = await boot('coach');
    fbk.deliver('dm/CLUB/t1', null); fbk.deliver('people/coach/mute', { msg: true }); await A.flush();
    const before = A.toasts.length;
    fbk.deliver('dm/CLUB/t1', { mum: { m: { d1: { by: 'mum', byName: 'Mo', at: A.nowMs(), text: 'Late today' } } } }); await A.flush();
    check('switched off on another phone, quiet on this one', A.toasts.length, before);
    check('and still counted', A.msgUnread(), 1);
  }
  {
    const fbk = makeFakebase().refuseWrites(p => p.startsWith('people/'));
    const { A } = await boot('mum', { fbk });
    A.click({ act: 'muteset', k: 'msg', v: '1' }); await A.flush();
    check('refused by older rules: taken back and said', /version/.test(A.lastToast() || '') && /aria-pressed="true">On/.test((A.click({ act: 'notes' }), A.rendered())), true);
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
    // a club without the list: an admin's connect creates it, team by team, uid by uid
    const { A, fbk } = await boot('adm', { club: { ...CLUB, access: { ...CLUB.access, teamParents: {} } } });
    const tp = fbk.record.writes.filter(w => w.path.includes('/access/teamParents/'));
    check('an admin\'s connect writes every parent', tp.map(w => w.path + '=' + w.value).sort().join(' '),
      'orgs/CLUB/access/teamParents/t1/dad=p2 orgs/CLUB/access/teamParents/t1/mum=p1');
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
    check('linking a parent puts her on it', fbk.writtenTo('orgs/CLUB/access/teamParents/t1/trk').map(w => w.value).join(), 'p3');
    A.click({ act: 'toggleguard', pid: 'p1', uid: 'mum' }); await A.flush();
    check('unlinking her last child takes her off', fbk.record.removes.includes('orgs/CLUB/access/teamParents/t1/mum'), true);
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
    check('Messages goes', A.dom.node('#msgBtn').hidden, true);
    check('and this device forgets it', A.storage.getItem('sm.msgs:CLUB:mum'), null);
  }

  H.summary('messages');
})();
