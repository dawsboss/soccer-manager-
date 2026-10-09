/* A player's supporters (AUTH.md, *More kinds of people*, 1), against the
   fake Firebase on a club on orgs/. The owner's decisions, pinned:

   - Anyone who can see the player may ask for one: her family, the player
     herself, her coach, an admin. Never a tracker, another team's coach, or
     another supporter. The ask is a single-use link (an invite of role
     `supporter`) that names the child by shirt number, never by name.
   - The team's coach approves it. A coach or an admin making the link has
     approved already: whoever opens it is let in. A family's link only lets
     the person who opens it ask, on the coach's list beside the families'.
   - A supporter does less than a parent: the calendar, Live, the scores, the
     recap and the team's notices, her player by name and teammates by the
     club's setting; never "going", never a conversation with the coaches,
     never a session. Her phone reads her player's record by path and nobody
     else's, and nothing a coach wrote about her.
   - The coach takes her away; her family keeps theirs. */

const H = require('./harness');
const { check, deepEq } = H;
const { makeFakebase } = require('./fakebase');

const CONFIG = { apiKey: 'k', databaseURL: 'https://prod.example', projectId: 'p' };
const OB = 'orgs/CLUB';
const ID = 'isup01';
const wrote = fbk => fbk.record.writes.map(w => w.path);
const valueAt = (fbk, p) => { const w = fbk.writtenTo(p); return w.length ? w[w.length - 1].value : undefined; };
const under = (fbk, pre) => fbk.readPaths().filter(p => p === pre || p.startsWith(pre + '/'));

/* The club as the server lays it out on orgs/. */
const ORG = () => ({
  access: {
    admins: { adm: true },
    index: { adm: true, coachU: true, trkU: true, mumU: true, other2: true, ellaU: true, gran: 't1' },
    teams: { t1: { coaches: { coachU: true }, trackers: { trkU: true } }, t2: { coaches: { other2: true } } },
    teamIndex: { t1: { coachU: 'coach', trkU: 'tracker' }, t2: { other2: 'coach' } },
    coachIndex: { coachU: 't1', other2: 't2' },
    teamParents: { t1: { mumU: 'p1' } },
    teamPlayers: { t1: { ellaU: 'p1' } },
    teamSupporters: { t1: { gran: 'p2' } }
  },
  org: { name: 'Lakeside SC' },
  members: { adm: { name: 'Ada', email: 'ada@example.com' }, coachU: { name: 'Jaz', email: 'jaz@example.com' }, mumU: { name: 'Mo', email: 'mo@example.com' }, gran: { name: 'Gran Lind', email: 'gran@example.com' } },
  names: { adm: { name: 'Ada' }, coachU: { name: 'Jaz' } },
  teams: { t1: { id: 't1', name: 'Flight', events: {} }, t2: { id: 't2', name: 'Storm' } },
  squad: {
    t1: {
      p1: { id: 'p1', name: 'Ella Fitz', number: '7', active: true, guardians: { mumU: true }, self: { ellaU: true } },
      p2: { id: 'p2', name: 'Rosa Lind', number: '9', active: true, supporters: { gran: true } }
    },
    t2: { q1: { id: 'q1', name: 'Bea Quill', number: '3', active: true } }
  },
  coachNotes: { t1: { p2: { note: 'needs a confidence boost', rating: 2 } } },
  roster: { t1: { p1: { number: '7', active: true }, p2: { number: '9', active: true } }, t2: { q1: { number: '3', active: true } } },
  matches: {
    g1: { id: 'g1', teamId: 't1', opponent: 'Riverside', date: '2026-09-12', createdAt: 3, periodCount: 2, periodMinutes: 40, onFieldCount: 2,
      currentHalf: 2, ended: true, periods: { 0: { half: 1, start: 1, end: 2400001 } },
      stints: { s1: { pid: 'p1', on: 0, off: 2400 }, s2: { pid: 'p2', on: 0, off: 2400 } }, goals: { a: { t: 300, side: 'us', pid: 'p1', assist: 'p2' } } }
  },
  rsvp: {}
});

/* What the rules let `uid` read on orgs/CLUB (rules.js walks the real thing). */
function rulesFor(uid, org) {
  const a = org.access, admin = !!a.admins[uid], coach = !!(a.coachIndex || {})[uid];
  return p => {
    const rel = p.slice(OB.length + 1);
    if (!a.index[uid]) return true;
    if (rel === 'members') return !(admin || coach);
    if (rel === 'members/' + uid) return false;
    if (rel === 'log') return !admin;
    if (rel === 'coachNotes' || rel.startsWith('coachNotes/')) return !(admin || coach);
    let m = /^squad\/([^/]+)$/.exec(rel);
    if (m) return !(admin || coach || ((a.teamIndex || {})[m[1]] || {})[uid]);
    m = /^squad\/([^/]+)\/([^/]+)$/.exec(rel);
    if (m) {
      const rec = ((org.squad || {})[m[1]] || {})[m[2]] || {};
      return !(admin || coach || ((a.teamIndex || {})[m[1]] || {})[uid] || (rec.guardians || {})[uid] || (rec.self || {})[uid] || (rec.supporters || {})[uid]);
    }
    return false;
  };
}

async function boot(who, org = ORG(), extra = {}) {
  const fbk = makeFakebase();
  const A = H.loadApp({ firebase: fbk, config: CONFIG, search: extra.search,
    storage: { 'sm.workspace': 'CLUB', 'sm.tree.v1:CLUB': 'orgs', ...(extra.storage || {}) } });
  await A.flush();
  fbk.signIn(who, { name: who === 'gran' ? 'Gran Lind' : who, email: who + '@x.test' }); await A.flush();
  if (org) await fbk.serve(OB, org, () => A.flush(), rulesFor(who, org));
  await A.flush(10);
  return { A, fbk };
}
const sheet = A => String(A.dom.node('#sheet').innerHTML);
const invitesMade = (fbk, from = 0) => fbk.record.writes.slice(from).filter(w => /^invites\/[^/]+$/.test(w.path));

(async () => {
  console.log('--- her family asks for one ---');
  {
    const { A, fbk } = await boot('mumU');
    A.ui.view = 'mine'; A.render();
    check('My players offers her child\'s supporters', /data-act="supsheet" data-tid="t1" data-pid="p1"/.test(A.rendered()), true);
    A.click({ act: 'supsheet', tid: 't1', pid: 'p1' });
    check('the sheet says what a supporter gets, and does not', /doesn't say who is going, message the coaches or book sessions/.test(sheet(A)), true);
    check('and that a coach says yes first', /A coach of the team says yes before they see anything/.test(sheet(A)), true);
    A.click({ act: 'supinvite', tid: 't1', pid: 'p1', from: 'sheet' }); await A.flush(10);
    const inv = invitesMade(fbk)[0];
    check('a link is made: an invite of role supporter', !!inv && inv.value.role, 'supporter');
    check('for her child, on that team, in this club', inv && [inv.value.player, inv.value.team, inv.value.ws].join(), 'p1,t1,CLUB');
    check('in her name', inv && inv.value.by, 'mumU');
    check('not approved: the coach decides', inv && inv.value.approved, undefined);
    check('naming the child by shirt number, never by name', inv && inv.value.playerNo + ' ' + /Ella|Fitz/.test(JSON.stringify(inv.value)), '7 false');
    check('never on the admins\' list, nor anywhere in the club', wrote(fbk).some(p => p.startsWith('clubInvites/') || (p.startsWith(OB) && JSON.stringify(valueAt(fbk, p) || '').includes(inv.path.split('/')[1]))), false);
    check('the link is on the sheet to send', /\?invite=/.test(sheet(A)) && /data-act="supinvdrop"/.test(sheet(A)), true);
    A.click({ act: 'supinvite', tid: 't1', pid: 'p1', from: 'sheet' }); await A.flush(10);
    check('one link per person: another for Grandad as well', invitesMade(fbk).length + ' ' + (sheet(A).match(/data-act="supinvdrop"/g) || []).length, '2 2');
    A.click({ act: 'supinvdrop', tid: 't1', pid: 'p1', id: inv.path.split('/')[1], from: 'sheet' }); await A.flush(10);
    check('withdrawn: the invite goes', fbk.record.removes.includes(inv.path), true);
    check('and off the sheet', (sheet(A).match(/data-act="supinvdrop"/g) || []).length, 1);
    const before = fbk.record.writes.length;
    A.click({ act: 'supinvite', tid: 't1', pid: 'p2', from: 'sheet' }); await A.flush(10);
    check('not for another family\'s child', invitesMade(fbk, before).length, 0);
  }
  {
    const { A, fbk } = await boot('ellaU');
    A.click({ act: 'supinvite', tid: 't1', pid: 'p1', from: 'sheet' }); await A.flush(10);
    check('the player asks for her own', (invitesMade(fbk)[0] || { value: {} }).value.by, 'ellaU');
  }

  console.log('\n--- her coach asks, which is approving ---');
  {
    const { A, fbk } = await boot('coachU');
    A.ui.teamId = 't1';
    A.click({ act: 'editplayer', pid: 'p2' });
    check('her player sheet lists her supporters by name', /Gran Lind/.test(sheet(A)) && /data-act="supdrop"/.test(sheet(A)), true);
    check('and offers a link', /data-act="supinvite" data-tid="t1" data-pid="p2" data-from="player"/.test(sheet(A)), true);
    A.click({ act: 'supinvite', tid: 't1', pid: 'p2', from: 'player' }); await A.flush(10);
    const inv = invitesMade(fbk)[0];
    check('the coach\'s link is approved already', inv && inv.value.approved, true);
    check('— and says so', /whoever opens it is let in/.test(sheet(A)), true);
  }
  for (const [who, why] of [['trkU', 'the tracker'], ['other2', 'another team\'s coach'], ['gran', 'a supporter']]) {
    const { A, fbk } = await boot(who);
    const before = fbk.record.writes.length;
    A.click({ act: 'supinvite', tid: 't1', pid: 'p2', from: 'sheet' }); await A.flush(10);
    check(`${why} cannot ask, whatever reaches the handler`, invitesMade(fbk, before).length, 0);
  }

  console.log('\n--- she opens a link her family sent ---');
  {
    const fbk = makeFakebase();
    const A = H.loadApp({ firebase: fbk, config: CONFIG, storage: { 'sm.tree.v1:CLUB': 'orgs' }, search: '?invite=' + ID });
    await A.flush();
    fbk.signIn('aunt', { name: 'Aunt Jo', email: 'jo@x.test' }); await A.flush();
    fbk.deliver('invites/' + ID, { ws: 'CLUB', team: 't1', teamName: 'Flight', role: 'supporter', player: 'p1', playerNo: '7', clubName: 'Lakeside SC',
      by: 'mumU', byName: 'Mo', at: A.nowMs() - 1000, expiresAt: A.nowMs() + 7 * 864e5 });
    await A.flush();
    check('it says what she is asking for, and who says yes', /a supporter of #7 on <b>Flight<\/b>/.test(A.rendered()) && /A coach of the team says yes/.test(A.rendered()), true);
    A.click({ act: 'inviteaccept' }); await A.flush(20);
    const p = wrote(fbk);
    check('the link is spent', !!valueAt(fbk, 'invites/' + ID + '/used'), true);
    const ask = valueAt(fbk, 'claims/CLUB/t1/aunt');
    check('she asks the team\'s coaches, naming the link and the child', ask && [ask.invite, ask.player, ask.askedBy].join(), ID + ',p1,Mo');
    check('she is not let in by it', p.some(x => /\/supporters\/|\/access\/index\/|teamSupporters/.test(x)), false);
    check('the spent link goes', fbk.record.removes.includes('invites/' + ID), true);
    check('and she waits for a coach', /Waiting for a coach of Flight/.test(A.rendered()) && /as a supporter/.test(A.rendered()), true);
    fbk.deliver('claims/CLUB/t1/aunt', { ...ask, approved: { by: 'coachU', at: A.nowMs(), supporter: 'p1' } }); await A.flush(10);
    check('approved: the club goes on her list', !!valueAt(fbk, 'userOrgs/aunt/CLUB'), true);
    check('and her ask is cleared', fbk.record.removes.includes('claims/CLUB/t1/aunt'), true);
  }

  console.log('\n--- she opens a link a coach made ---');
  {
    const fbk = makeFakebase();
    const A = H.loadApp({ firebase: fbk, config: CONFIG, storage: { 'sm.tree.v1:CLUB': 'orgs' }, search: '?invite=' + ID });
    await A.flush();
    fbk.signIn('aunt', { name: 'Aunt Jo', email: 'jo@x.test' }); await A.flush();
    fbk.deliver('invites/' + ID, { ws: 'CLUB', team: 't1', teamName: 'Flight', role: 'supporter', player: 'p1', playerNo: '7', clubName: 'Lakeside SC',
      by: 'coachU', byName: 'Jaz', approved: true, at: A.nowMs() - 1000, expiresAt: A.nowMs() + 7 * 864e5 });
    await A.flush();
    check('it does not say anyone has to say yes', /says yes/.test(A.rendered()), false);
    A.click({ act: 'inviteaccept' }); await A.flush(20);
    const p = wrote(fbk), at = x => p.indexOf(x);
    check('on the child\'s record, carrying the invite id', valueAt(fbk, OB + '/squad/t1/p1/supporters/aunt'), ID);
    check('never as a parent or as the player', p.some(x => /\/guardians\/|\/self\//.test(x)), false);
    check('indexed in the club', valueAt(fbk, OB + '/access/index/aunt'), ID);
    check('on the team\'s supporters, naming her player', valueAt(fbk, OB + '/access/teamSupporters/t1/aunt'), 'p1');
    check('record, then index, then the table the rules check against the record',
      at(OB + '/squad/t1/p1/supporters/aunt') < at(OB + '/access/index/aunt') && at(OB + '/access/index/aunt') < at(OB + '/access/teamSupporters/t1/aunt'), true);
    check('no ask', p.some(x => x.startsWith('claims/')), false);
  }

  console.log('\n--- the coach approves an ask ---');
  {
    const { A, fbk } = await boot('coachU');
    A.ui.teamId = 't1'; A.ui.view = 'roster'; A.render(); await A.flush();
    check('the coach listens for asks on her team', fbk.watching('claims/CLUB/t1'), true);
    fbk.deliver('claims/CLUB/t1', { aunt: { invite: ID, player: 'p1', name: 'Aunt Jo', email: 'jo@x.test', askedBy: 'Mo', at: A.nowMs() } }); await A.flush();
    A.render();
    check('Squad lists it with the families\' asks', /Supporters asking/.test(A.rendered()) && /Asks to follow Ella Fitz as a supporter · asked for by Mo/.test(A.rendered()), true);
    check('to let in or turn down', /data-act="supok" data-tid="t1" data-uid="aunt"/.test(A.rendered()) && /data-act="claimno" data-tid="t1" data-uid="aunt"/.test(A.rendered()), true);
    A.click({ act: 'supok', tid: 't1', uid: 'aunt' }); await A.flush(20);
    const p = wrote(fbk), at = x => p.indexOf(x);
    check('the approval is written first, naming her player', (valueAt(fbk, 'claims/CLUB/t1/aunt/approved') || {}).supporter, 'p1');
    check('then she is on the child\'s record', valueAt(fbk, OB + '/squad/t1/p1/supporters/aunt'), true);
    check('indexed with the team id, as the rule checks', valueAt(fbk, OB + '/access/index/aunt'), 't1');
    check('and on the team\'s supporters', valueAt(fbk, OB + '/access/teamSupporters/t1/aunt'), 'p1');
    check('in that order', at('claims/CLUB/t1/aunt/approved') < at(OB + '/squad/t1/p1/supporters/aunt') && at(OB + '/squad/t1/p1/supporters/aunt') < at(OB + '/access/teamSupporters/t1/aunt'), true);
    check('never a parent', p.some(x => x.includes('/guardians/aunt') || x.includes('teamParents')), false);
    check('logged', Object.values(A.state.access.log || {}).some(e => e.act === 'approved as supporter' && e.target === 'aunt'), true);
  }
  {
    const { A, fbk } = await boot('mumU');
    fbk.deliver('claims/CLUB/t1', { aunt: { invite: ID, player: 'p1', name: 'Aunt Jo', at: A.nowMs() } }); await A.flush();
    const before = fbk.record.writes.length;
    A.click({ act: 'supok', tid: 't1', uid: 'aunt' }); await A.flush(10);
    check('her family cannot approve it', fbk.record.writes.length, before);
    check('nor even listens for asks', fbk.watching('claims/CLUB/t1'), false);
  }

  console.log('\n--- what a supporter\'s phone reads ---');
  {
    const org = ORG();
    const { A, fbk } = await boot('gran', org);
    const asked = under(fbk, OB);
    check('her player\'s record, by path', asked.includes(OB + '/squad/t1/p2'), true);
    check('not the squad', asked.includes(OB + '/squad/t1'), false);
    check('nor the members and their emails', asked.includes(OB + '/members'), false);
    check('nor the coach\'s notes', asked.some(x => x.startsWith(OB + '/coachNotes')), false);
    const held = JSON.stringify(A.state) + A.storage.getItem('sm.data.v1:CLUB');
    check('no other child\'s name anywhere on the phone', /Ella Fitz|Bea Quill/.test(held), false);
    check('nothing a coach wrote about her player', /confidence|"rating"/.test(held), false);
    check('her player\'s team\'s notices', fbk.watching('board/CLUB/t1'), true);
    check('not another team\'s', fbk.watching('board/CLUB/t2'), false);
    check('no family\'s conversation, nor one of her own', fbk.readPaths().some(x => x.startsWith('dm/')), false);
    check('no asks to approve', fbk.watching('claims/CLUB/t1'), false);

    console.log('\n--- what she sees, and does ---');
    A.ui.teamId = 't1'; A.ui.matchId = 'g1';
    check('a supporter here', A.roleIn('t1', 'gran') + ' ' + A.restricted(), 'supporter supporter');
    check('her player\'s team is the one she sees', A.myTeams().map(t => t.id).join(), 't1');
    A.ui.view = 'game'; A.ui.gameView = 'stats'; A.render();
    const stats = A.rendered();
    check('her player by name', /Rosa Lind/.test(stats), true);
    check('a teammate by shirt number', /#7/.test(stats) && !/Ella/.test(stats), true);
    A.ui.gameView = 'subs'; A.render();
    check('no subs', A.ui.gameView !== 'subs', true);
    A.ui.view = 'roster'; A.render();
    check('no squad tab', A.ui.view !== 'roster', true);
    A.ui.view = 'mine'; A.render();
    check('My players has her player, as one she supports', /Rosa Lind/.test(A.rendered()) && /you support her/.test(A.rendered()), true);
    check('with no supporters of her own to ask for', /data-act="supsheet"/.test(A.rendered()), false);
    check('her player\'s team is on her calendar', A.myCalTeams().join(), 't1');
    check('she is not anybody\'s family', A.myPlayers().length + ' ' + A.guardsAnyone(), '0 false');
    check('she says nobody is going', A.canRsvp('t1', 'p2'), false);
    check('she writes in no conversation', A.famThreads().length, 0);
    check('sessions are not offered', A.canSessions(), false);
    A.state.access.org.rosterOpen = true;
    A.ui.view = 'game'; A.ui.gameView = 'stats'; A.render();
    check('the club\'s setting opens names to her too', /Ella Fitz/.test(A.rendered()) || A.shownName(A.state.teams.t1, { id: 'p1', name: 'Ella Fitz', number: '7' }) === 'Ella Fitz', true);
  }

  console.log('\n--- kept true, and taken away ---');
  {
    const org = ORG(); delete org.access.teamSupporters;
    const { A, fbk } = await boot('adm', org);
    check('she stays in the club\'s index', A.hasAnyRole('gran'), true);
    check('never removed from it', fbk.record.removes.includes(OB + '/access/index/gran'), false);
    check('the supporters table is built', valueAt(fbk, OB + '/access/teamSupporters/t1/gran'), 'p2');
    check('People shows her as a supporter', A.rolesHeld('gran', A.teams()).map(v => v.r + ':' + v.p.id).join(), 'supporter:p2');
  }
  {
    const { A, fbk } = await boot('coachU');
    A.ui.teamId = 't1';
    A.dom.confirm = () => true;
    A.click({ act: 'supdrop', tid: 't1', pid: 'p2', uid: 'gran', from: 'player' }); await A.flush(10);
    check('off her player\'s record', fbk.record.removes.includes(OB + '/squad/t1/p2/supporters/gran'), true);
    check('off the team\'s supporters', fbk.record.removes.includes(OB + '/access/teamSupporters/t1/gran'), true);
    check('out of the club, her last role gone', fbk.record.removes.includes(OB + '/access/index/gran'), true);
    check('logged', Object.values(A.state.access.log || {}).some(e => e.act === 'removed supporter' && e.target === 'gran'), true);
  }
  {
    const { A, fbk } = await boot('mumU');
    A.dom.confirm = () => true;
    A.click({ act: 'supdrop', tid: 't1', pid: 'p2', uid: 'gran', from: 'player' }); await A.flush(10);
    check('a family cannot take a supporter away', fbk.record.removes.some(p => p.includes('/supporters/')), false);
  }

  H.summary('a player\'s supporters: asked for by anyone who can see her, approved by her coach');
})();
