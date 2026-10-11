/* A player with her own sign-in (AUTH.md, "A player with her own account").
   The owner's decisions, pinned:

   - Her coach gives it, on request, and so may an admin; never a parent, and
     a tracker or another team's coach cannot. It is an ordinary single-use
     invite of role `player` naming the child, by shirt number, never name.
   - Accepting it writes her onto her own player record (`self`, never
     `guardians`: she is not her own parent), indexes her in the club, and
     puts her on the team's player list, in the order the rules need.
   - She sees what a parent sees: her own name, teammates by shirt number (or
     by name if the club says so), Live, Stats and the recap, no squad tab.
   - She answers "going" for herself, and nobody else.
   - She reads and writes in her family's conversations with the coaches,
     where her parents see every word, and never has one of her own.
   - She books and pays for nothing: sessions are her parents'.
   - An admin's phone keeps her in the club's index and on the player list;
     the coach can take her sign-in away. */

const H = require('./harness');
const { check } = H;
const { makeFakebase } = require('./fakebase');

const CONFIG = { apiKey: 'k', databaseURL: 'https://prod.example', projectId: 'p' };
const ID = 'iplay01';
const paths = fbk => fbk.record.writes.map(w => w.path);
const valueAt = (fbk, p) => { const w = fbk.writtenTo(p); return w.length ? w[w.length - 1].value : undefined; };

const club = () => ({
  access: {
    org: { name: 'Lakeside SC' },
    admins: { adm: true },
    index: { adm: true, coach: true, mum: true, dad: true, ella: 'old', trk: true, other: true },
    members: { adm: { name: 'Ada' }, coach: { name: 'Jaz' }, mum: { name: 'Mo' }, dad: { name: 'Dev' }, ella: { name: 'Ella F' } },
    teams: { t1: { coaches: { coach: true }, trackers: { trk: true } }, t2: { coaches: { other: true } } },
    teamIndex: { t1: { coach: 'coach', trk: 'tracker' }, t2: { other: 'coach' } },
    teamParents: { t1: { mum: 'p1', dad: 'p1' } }
  },
  teams: {
    t1: {
      id: 't1', name: 'G15 Flight', events: {},
      players: {
        p1: { id: 'p1', name: 'Ella Fitzgerald', number: '7', active: true, guardians: { mum: true, dad: true }, self: { ella: 'old' } },
        p2: { id: 'p2', name: 'Mia Kowalski', number: '8', active: true, guardians: { other: true } }
      }
    },
    t2: { id: 't2', name: 'G12 Storm', players: {} }
  },
  matches: {}
});

async function boot(who, ws = club(), extra = {}) {
  const fbk = makeFakebase();
  const A = H.loadApp({ firebase: fbk, config: CONFIG, storage: { 'sm.workspace': 'CLUB', ...(extra.storage || {}) }, search: extra.search });
  await A.flush();
  fbk.signIn(who, { name: who, email: who + '@x.test' }); await A.flush();
  if (ws) { await fbk.serveClub('CLUB', ws, A.flush); await A.flush(); }
  return { A, fbk };
}

(async () => {
  console.log('--- the coach gives it ---');
  {
    const ws = club(); delete ws.teams.t1.players.p1.self; delete ws.access.index.ella;
    const { A, fbk } = await boot('coach', ws);
    A.ui.teamId = 't1';
    A.click({ act: 'editplayer', pid: 'p1' });
    const sheet = () => String(A.dom.node('#sheet').innerHTML);
    check('her sheet offers a sign-in link', /data-act="selfinvite"/.test(sheet()), true);
    check('and says what it gives her', /reads and writes in her family's conversation/.test(sheet()), true);
    A.click({ act: 'selfinvite', pid: 'p1' }); await A.flush(10);
    const inv = fbk.record.writes.find(w => /^invites\/[^/]+$/.test(w.path));
    check('an invite is written', !!inv, true);
    check('role player, for that child, on that team', inv && [inv.value.role, inv.value.player, inv.value.team, inv.value.ws].join(), 'player,p1,t1,CLUB');
    check('made by the coach', inv && inv.value.by, 'coach');
    check('the invite names her by shirt number, never by name', inv && /Ella|Fitzgerald/.test(JSON.stringify(inv.value)), false);
    check('listed for the admins', paths(fbk).some(p => p === 'clubInvites/CLUB/' + inv.path.split('/')[1]), true);
    check('the link is on her sheet to copy', /\?invite=/.test(sheet()) && /data-act="selfinvdrop"/.test(sheet()), true);
    check('and its id is never written into the club', paths(fbk).some(p => p.startsWith('workspaces/') && JSON.stringify(valueAt(fbk, p) || '').includes(inv.path.split('/')[1])), false);
    A.click({ act: 'selfinvdrop', pid: 'p1' }); await A.flush(10);
    check('withdrawn: the invite goes', fbk.record.removes.includes(inv.path), true);
    check('and off the admins\' list', fbk.record.removes.includes('clubInvites/CLUB/' + inv.path.split('/')[1]), true);
    check('and the sheet offers a new one', /data-act="selfinvite"/.test(sheet()), true);
  }
  for (const [who, why] of [['mum', 'her parent'], ['trk', 'the tracker'], ['other', 'another team\'s coach']]) {
    const { A, fbk } = await boot(who);
    A.ui.teamId = 't1';
    const before = fbk.record.writes.length;
    A.click({ act: 'selfinvite', pid: 'p1' }); await A.flush(10);
    check(`${why} cannot, whatever reaches the handler`, fbk.record.writes.slice(before).some(w => w.path.startsWith('invites/')), false);
  }

  console.log('\n--- she accepts it ---');
  {
    const fbk = makeFakebase();
    const A = H.loadApp({ firebase: fbk, config: CONFIG, storage: {}, search: '?invite=' + ID });
    await A.flush();
    fbk.signIn('ella', { name: 'Ella F', email: 'ella@x.test' }); await A.flush();
    fbk.deliver('invites/' + ID, { ws: 'CLUB', team: 't1', teamName: 'G15 Flight', role: 'player', player: 'p1', playerNo: '7', clubName: 'Lakeside SC',
      by: 'coach', byName: 'Jaz', at: A.nowMs() - 1000, expiresAt: A.nowMs() + 7 * 864e5 });
    await A.flush();
    check('it says what she is joining as', /a player, #7 on <b>G15 Flight<\/b>, with your own sign-in/.test(A.rendered()), true);
    A.click({ act: 'inviteaccept' }); await A.flush(); await A.flush(20);   // the old tree refuses a phone not in the club yet
    const p = paths(fbk), at = x => p.indexOf(x);
    check('on her own player record, carrying the invite id', valueAt(fbk, 'orgs/CLUB/squad/t1/p1/self/ella'), ID);
    check('never as her own parent', p.some(x => x.includes('/guardians/')), false);
    check('nor a coach or tracker', p.some(x => x.includes('/access/teams/') || x.includes('/teamIndex/')), false);
    check('indexed in the club', valueAt(fbk, 'orgs/CLUB/access/index/ella'), ID);
    check('on the team\'s player list, naming herself', valueAt(fbk, 'orgs/CLUB/access/teamPlayers/t1/ella'), 'p1');
    check('record, then index, then the list the rules check against the record',
      at('orgs/CLUB/squad/t1/p1/self/ella') < at('orgs/CLUB/access/index/ella') && at('orgs/CLUB/access/index/ella') < at('orgs/CLUB/access/teamPlayers/t1/ella'), true);
    check('not on the parent list', p.some(x => x.includes('/teamParents/')), false);
  }

  console.log('\n--- what she sees ---');
  {
    const ws = club();
    ws.matches.g1 = { id: 'g1', teamId: 't1', opponent: 'Riverside', date: '2026-09-12', createdAt: 3, periodCount: 2, periodMinutes: 40, onFieldCount: 2,
      currentHalf: 2, ended: true, periods: { 0: { half: 1, start: 1, end: 2400001 } },
      stints: { s1: { pid: 'p1', on: 0, off: 2400 }, s2: { pid: 'p2', on: 0, off: 2400 } }, goals: { a: { t: 300, side: 'us', pid: 'p2', assist: 'p1' } } };
    const { A } = await boot('ella', ws);
    A.ui.teamId = 't1'; A.ui.matchId = 'g1';
    check('she is a player here', A.roleIn('t1', 'ella') + ' ' + A.restricted(), 'player player');
    check('her team is hers to see', A.myTeams().map(t => t.id).join(), 't1');
    A.ui.view = 'game'; A.ui.gameView = 'stats'; A.render();
    const stats = A.rendered();
    check('herself by name', /Ella Fitzgerald/.test(stats), true);
    check('a teammate by shirt number', /#8/.test(stats) && !/Mia|Kowalski/.test(stats), true);
    A.ui.gameView = 'subs'; A.render();
    check('no subs, as for a parent', A.ui.gameView !== 'subs', true);
    A.ui.view = 'roster'; A.render();
    check('no squad tab', A.ui.view !== 'roster', true);
    check('her season, under My players', A.myPlayers().map(x => x.p.id).join(), 'p1');
    A.ui.view = 'mine'; A.render();
    check('which reads as hers', /<h2>My season<\/h2>/.test(A.rendered()), true);
    A.state.access.org.rosterOpen = true;
    A.ui.view = 'game'; A.ui.gameView = 'stats'; A.render();
    check('the club\'s setting opens names to her too', /Mia Kowalski/.test(A.rendered()), true);
    delete A.state.access.org.rosterOpen;

    console.log('\n--- going, for herself ---');
    check('she answers for herself', A.canRsvp('t1', 'p1'), true);
    check('not for a teammate', A.canRsvp('t1', 'p2'), false);
    check('asked as herself', A.goingQ(A.state.teams.t1.players.p1), 'Are you going?');

    console.log('\n--- no sessions to book or pay for ---');
    check('not a parent of anybody', A.guardsAnyone(), false);
    check('sessions are not offered', A.canSessions(), false);
  }

  console.log('\n--- her family\'s conversations ---');
  {
    // her parents' names on her record, as their own phones keep them there (ownFamilyName(), below)
    const ws = club(); ws.teams.t1.players.p1.familyNames = { mum: 'Mo', dad: 'Dev' };
    const { A, fbk } = await boot('ella', ws);
    A.render(); await A.flush();
    check('she listens to her mum\'s conversation with the coaches', fbk.watching('dm/CLUB/t1/mum'), true);
    check('and her dad\'s', fbk.watching('dm/CLUB/t1/dad'), true);
    check('never one of her own', fbk.watching('dm/CLUB/t1/ella'), false);
    check('nor the list of every family\'s', fbk.watching('dm/CLUB/t1'), false);
    check('nor another family\'s', fbk.watching('dm/CLUB/t1/other'), false);
    check('and her team\'s notices', fbk.watching('board/CLUB/t1'), true);
    check('the threads are hers to write in', A.famThreads().map(x => x.fam).sort().join(), 'dad,mum');
    A.ui.view = 'inbox'; A.render();
    /* She reads her own member entry and staff names, never her parents'
       (members/ is staff's: it has everyone's email), so their names come
       from her own record, where each of them keeps hers. */
    check('she never holds her parents\' member entries', ['mum', 'dad'].some(u => (A.state.access.members || {})[u]), false);
    check('named for whose conversation it is', /Mo and the coaches of/.test(A.rendered()), true);
    A.ui.view = 'thread'; A.ui.thread = { tid: 't1', fam: 'mum' }; A.render();
    check('the conversation opens', /data-act="msgsend" data-tid="t1" data-fam="mum"/.test(A.rendered()), true);
    check('and says her mum reads it too', /and so can Mo/.test(A.rendered()), true);
    A.dom.node('#msgText').value = 'I have a cold, missing Thursday';
    A.click({ act: 'msgsend', tid: 't1', fam: 'mum' }); await A.flush(10);
    const sent = fbk.record.writes.find(w => w.path.startsWith('dm/CLUB/t1/mum/m/'));
    check('her message goes into her family\'s conversation', !!sent, true);
    check('in her own name', sent && sent.value.by, 'ella');
    A.ui.thread = { tid: 't1', fam: 'ella' }; A.render();
    check('a conversation of her own does not open', A.ui.view, 'inbox');
    const before = fbk.record.writes.length;
    A.dom.node('#msgText').value = 'just me';
    A.click({ act: 'msgsend', tid: 't1', fam: 'ella' }); await A.flush(10);
    check('nor can one be written', fbk.record.writes.slice(before).some(w => w.path.startsWith('dm/')), false);
  }

  console.log('\n--- her parents\' names on her record ---');
  {
    // a family linked before names were kept: her own phone writes hers, once, beside her on each child
    const { A, fbk } = await boot('mum');
    const n = fbk.writtenTo('orgs/CLUB/squad/t1/p1/familyNames/mum');
    check('a parent\'s phone writes her own name on her child\'s record', n.map(w => w.value).join(), 'mum');
    check('— never another parent\'s', fbk.record.writes.some(w => /familyNames\/(?!mum$)/.test(w.path)), false);
    check('— nor on a child who is not hers', fbk.record.writes.some(w => /squad\/t1\/p2\/familyNames/.test(w.path)), false);
    check('— straight to the club, not the outbox', Object.keys(A.pending.w).some(k => /familyNames/.test(k)), false);
  }
  {
    const ws = club(); ws.teams.t1.players.p1.familyNames = { mum: 'mum' };
    const { fbk } = await boot('mum', ws);
    check('already there: nothing written', fbk.record.writes.some(w => /familyNames/.test(w.path)), false);
  }
  {
    const ws = club(); delete ws.teams.t1.players.p2.guardians;
    ws.access.members.newmum = { name: 'Nia', email: 'nia@x.test' };
    const { A, fbk } = await boot('coach', ws);
    A.ui.teamId = 't1';
    A.click({ act: 'toggleguard', pid: 'p2', uid: 'newmum' }); await A.flush();
    check('a coach linking a parent puts her name beside her', valueAt(fbk, 'orgs/CLUB/squad/t1/p2/familyNames/newmum'), 'Nia');
    A.click({ act: 'toggleguard', pid: 'p2', uid: 'newmum' }); await A.flush();
    check('— and unlinking takes it off', fbk.record.removes.includes('orgs/CLUB/squad/t1/p2/familyNames/newmum'), true);
  }

  console.log('\n--- kept true by an admin\'s phone ---');
  {
    const ws = club(); ws.access.teamPlayers = {};   // written as nothing: serveClub() would derive it
    const { A, fbk } = await boot('adm', ws);
    await A.flush(10);
    check('she stays in the club\'s index', A.hasAnyRole('ella'), true);
    check('never removed from it', fbk.record.removes.includes('orgs/CLUB/access/index/ella'), false);
    check('the player list is built', valueAt(fbk, 'orgs/CLUB/access/teamPlayers/t1/ella'), 'p1');
    check('People shows her as a player', A.rolesHeld('ella', A.teams()).map(v => v.r + ':' + (v.p || {}).id).join(), 'player:p1');
  }

  console.log('\n--- the coach takes it away ---');
  {
    const { A, fbk } = await boot('coach');
    A.ui.teamId = 't1';
    A.click({ act: 'editplayer', pid: 'p1' });
    check('her account is on the sheet', /Ella F/.test(String(A.dom.node('#sheet').innerHTML)) && /data-act="selfdrop"/.test(String(A.dom.node('#sheet').innerHTML)), true);
    A.dom.confirm = () => true;
    A.click({ act: 'selfdrop', pid: 'p1', uid: 'ella' }); await A.flush(10);
    check('off her player record', fbk.record.removes.includes('orgs/CLUB/squad/t1/p1/self/ella'), true);
    check('off the player list', fbk.record.removes.includes('orgs/CLUB/access/teamPlayers/t1/ella'), true);
    check('her parents keep theirs', Object.keys(A.state.teams.t1.players.p1.guardians).sort().join(), 'dad,mum');
  }

  H.summary('a player with her own sign-in');
})();
