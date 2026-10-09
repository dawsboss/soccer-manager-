/* A player's fans (AUTH.md, *More kinds of people*, 1), against the
   fake Firebase on a club on orgs/. The owner's decisions, pinned:

   - Anyone who can see the player may ask for one: her family, the player
     herself, her coach, an admin. Never a tracker, another team's coach, or
     another fan. The ask is a single-use link (an invite of role
     `fan`) that names the child by shirt number, never by name.
   - The team's coach approves it. A coach or an admin making the link has
     approved already: whoever opens it is let in. A family's link only lets
     the person who opens it ask, on the coach's list beside the families'.
   - A fan does less than a parent: the calendar, Live, the scores, the
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
    teamFans: { t1: { gran: 'p2' } }
  },
  org: { name: 'Lakeside SC' },
  members: { adm: { name: 'Ada', email: 'ada@example.com' }, coachU: { name: 'Jaz', email: 'jaz@example.com' }, mumU: { name: 'Mo', email: 'mo@example.com' }, gran: { name: 'Gran Lind', email: 'gran@example.com' } },
  names: { adm: { name: 'Ada' }, coachU: { name: 'Jaz' } },
  teams: { t1: { id: 't1', name: 'Flight', events: {} }, t2: { id: 't2', name: 'Storm' } },
  squad: {
    t1: {
      p1: { id: 'p1', name: 'Ella Fitz', number: '7', active: true, guardians: { mumU: true }, self: { ellaU: true } },
      p2: { id: 'p2', name: 'Rosa Lind', number: '9', active: true, fans: { gran: true } }
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
      return !(admin || coach || ((a.teamIndex || {})[m[1]] || {})[uid] || (rec.guardians || {})[uid] || (rec.self || {})[uid] || (rec.fans || {})[uid]);
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
    check('My players offers her child\'s fans', /data-act="fansheet" data-tid="t1" data-pid="p1"/.test(A.rendered()), true);
    A.click({ act: 'fansheet', tid: 't1', pid: 'p1' });
    check('the sheet says what a fan gets, and does not', /doesn't say who is going, message the coaches or book sessions/.test(sheet(A)), true);
    check('and that a coach says yes first', /A coach of the team says yes before they see anything/.test(sheet(A)), true);
    A.click({ act: 'faninvite', tid: 't1', pid: 'p1', from: 'sheet' }); await A.flush(10);
    const inv = invitesMade(fbk)[0];
    check('a link is made: an invite of role fan', !!inv && inv.value.role, 'fan');
    check('for her child, on that team, in this club', inv && [inv.value.player, inv.value.team, inv.value.ws].join(), 'p1,t1,CLUB');
    check('in her name', inv && inv.value.by, 'mumU');
    check('not approved: the coach decides', inv && inv.value.approved, undefined);
    check('naming the child by shirt number, never by name', inv && inv.value.playerNo + ' ' + /Ella|Fitz/.test(JSON.stringify(inv.value)), '7 false');
    check('never on the admins\' list, nor anywhere in the club', wrote(fbk).some(p => p.startsWith('clubInvites/') || (p.startsWith(OB) && JSON.stringify(valueAt(fbk, p) || '').includes(inv.path.split('/')[1]))), false);
    check('the link is on the sheet to send', /\?invite=/.test(sheet(A)) && /data-act="faninvdrop"/.test(sheet(A)), true);
    A.click({ act: 'faninvite', tid: 't1', pid: 'p1', from: 'sheet' }); await A.flush(10);
    check('one link per person: another for Grandad as well', invitesMade(fbk).length + ' ' + (sheet(A).match(/data-act="faninvdrop"/g) || []).length, '2 2');
    A.click({ act: 'faninvdrop', tid: 't1', pid: 'p1', id: inv.path.split('/')[1], from: 'sheet' }); await A.flush(10);
    check('withdrawn: the invite goes', fbk.record.removes.includes(inv.path), true);
    check('and off the sheet', (sheet(A).match(/data-act="faninvdrop"/g) || []).length, 1);
    const before = fbk.record.writes.length;
    A.click({ act: 'faninvite', tid: 't1', pid: 'p2', from: 'sheet' }); await A.flush(10);
    check('not for another family\'s child', invitesMade(fbk, before).length, 0);
  }
  {
    const { A, fbk } = await boot('ellaU');
    A.click({ act: 'faninvite', tid: 't1', pid: 'p1', from: 'sheet' }); await A.flush(10);
    check('the player asks for her own', (invitesMade(fbk)[0] || { value: {} }).value.by, 'ellaU');
  }

  console.log('\n--- her coach asks, which is approving ---');
  {
    const { A, fbk } = await boot('coachU');
    A.ui.teamId = 't1';
    A.click({ act: 'editplayer', pid: 'p2' });
    check('her player sheet lists her fans by name', /Gran Lind/.test(sheet(A)) && /data-act="fandrop"/.test(sheet(A)), true);
    check('and offers a link', /data-act="faninvite" data-tid="t1" data-pid="p2" data-from="player"/.test(sheet(A)), true);
    A.click({ act: 'faninvite', tid: 't1', pid: 'p2', from: 'player' }); await A.flush(10);
    const inv = invitesMade(fbk)[0];
    check('the coach\'s link is approved already', inv && inv.value.approved, true);
    check('— and says so', /whoever opens it is let in/.test(sheet(A)), true);
  }
  for (const [who, why] of [['trkU', 'the tracker'], ['other2', 'another team\'s coach'], ['gran', 'a fan']]) {
    const { A, fbk } = await boot(who);
    const before = fbk.record.writes.length;
    A.click({ act: 'faninvite', tid: 't1', pid: 'p2', from: 'sheet' }); await A.flush(10);
    check(`${why} cannot ask, whatever reaches the handler`, invitesMade(fbk, before).length, 0);
  }

  console.log('\n--- she opens a link her family sent ---');
  {
    const fbk = makeFakebase();
    const A = H.loadApp({ firebase: fbk, config: CONFIG, storage: { 'sm.tree.v1:CLUB': 'orgs' }, search: '?invite=' + ID });
    await A.flush();
    fbk.signIn('aunt', { name: 'Aunt Jo', email: 'jo@x.test' }); await A.flush();
    fbk.deliver('invites/' + ID, { ws: 'CLUB', team: 't1', teamName: 'Flight', role: 'fan', player: 'p1', playerNo: '7', clubName: 'Lakeside SC',
      by: 'mumU', byName: 'Mo', at: A.nowMs() - 1000, expiresAt: A.nowMs() + 7 * 864e5 });
    await A.flush();
    check('it says what she is asking for, and who says yes', /a fan of #7 on <b>Flight<\/b>/.test(A.rendered()) && /A coach of the team says yes/.test(A.rendered()), true);
    A.click({ act: 'inviteaccept' }); await A.flush(20);
    const p = wrote(fbk);
    check('the link is spent', !!valueAt(fbk, 'invites/' + ID + '/used'), true);
    const ask = valueAt(fbk, 'claims/CLUB/t1/aunt');
    check('she asks the team\'s coaches, naming the link and the child', ask && [ask.invite, ask.player, ask.askedBy].join(), ID + ',p1,Mo');
    check('she is not let in by it', p.some(x => /\/fans\/|\/access\/index\/|teamFans/.test(x)), false);
    check('the spent link goes', fbk.record.removes.includes('invites/' + ID), true);
    check('and she waits for a coach', /Waiting for a coach of Flight/.test(A.rendered()) && /as a fan/.test(A.rendered()), true);
    fbk.deliver('claims/CLUB/t1/aunt', { ...ask, approved: { by: 'coachU', at: A.nowMs(), fan: 'p1' } }); await A.flush(10);
    check('approved: the club goes on her list', !!valueAt(fbk, 'userOrgs/aunt/CLUB'), true);
    check('and her ask is cleared', fbk.record.removes.includes('claims/CLUB/t1/aunt'), true);
  }

  console.log('\n--- she opens a link a coach made ---');
  {
    const fbk = makeFakebase();
    const A = H.loadApp({ firebase: fbk, config: CONFIG, storage: { 'sm.tree.v1:CLUB': 'orgs' }, search: '?invite=' + ID });
    await A.flush();
    fbk.signIn('aunt', { name: 'Aunt Jo', email: 'jo@x.test' }); await A.flush();
    fbk.deliver('invites/' + ID, { ws: 'CLUB', team: 't1', teamName: 'Flight', role: 'fan', player: 'p1', playerNo: '7', clubName: 'Lakeside SC',
      by: 'coachU', byName: 'Jaz', approved: true, at: A.nowMs() - 1000, expiresAt: A.nowMs() + 7 * 864e5 });
    await A.flush();
    check('it does not say anyone has to say yes', /says yes/.test(A.rendered()), false);
    A.click({ act: 'inviteaccept' }); await A.flush(20);
    const p = wrote(fbk), at = x => p.indexOf(x);
    check('on the child\'s record, carrying the invite id', valueAt(fbk, OB + '/squad/t1/p1/fans/aunt'), ID);
    check('never as a parent or as the player', p.some(x => /\/guardians\/|\/self\//.test(x)), false);
    check('indexed in the club', valueAt(fbk, OB + '/access/index/aunt'), ID);
    check('on the team\'s fans, naming her player', valueAt(fbk, OB + '/access/teamFans/t1/aunt'), 'p1');
    check('record, then index, then the table the rules check against the record',
      at(OB + '/squad/t1/p1/fans/aunt') < at(OB + '/access/index/aunt') && at(OB + '/access/index/aunt') < at(OB + '/access/teamFans/t1/aunt'), true);
    check('no ask', p.some(x => x.startsWith('claims/')), false);
  }

  console.log('\n--- the coach approves an ask ---');
  {
    const { A, fbk } = await boot('coachU');
    A.ui.teamId = 't1'; A.ui.view = 'roster'; A.render(); await A.flush();
    check('the coach listens for asks on her team', fbk.watching('claims/CLUB/t1'), true);
    fbk.deliver('claims/CLUB/t1', { aunt: { invite: ID, player: 'p1', name: 'Aunt Jo', email: 'jo@x.test', askedBy: 'Mo', at: A.nowMs() } }); await A.flush();
    A.render();
    check('Squad lists it with the families\' asks', /Fans asking/.test(A.rendered()) && /Asks to follow Ella Fitz as a fan · asked for by Mo/.test(A.rendered()), true);
    check('to let in or turn down', /data-act="fanok" data-tid="t1" data-uid="aunt"/.test(A.rendered()) && /data-act="claimno" data-tid="t1" data-uid="aunt"/.test(A.rendered()), true);
    A.click({ act: 'fanok', tid: 't1', uid: 'aunt' }); await A.flush(20);
    const p = wrote(fbk), at = x => p.indexOf(x);
    check('the approval is written first, naming her player', (valueAt(fbk, 'claims/CLUB/t1/aunt/approved') || {}).fan, 'p1');
    check('then she is on the child\'s record', valueAt(fbk, OB + '/squad/t1/p1/fans/aunt'), true);
    check('indexed with the team id, as the rule checks', valueAt(fbk, OB + '/access/index/aunt'), 't1');
    check('and on the team\'s fans', valueAt(fbk, OB + '/access/teamFans/t1/aunt'), 'p1');
    check('in that order', at('claims/CLUB/t1/aunt/approved') < at(OB + '/squad/t1/p1/fans/aunt') && at(OB + '/squad/t1/p1/fans/aunt') < at(OB + '/access/teamFans/t1/aunt'), true);
    check('never a parent', p.some(x => x.includes('/guardians/aunt') || x.includes('teamParents')), false);
    check('logged', Object.values(A.state.access.log || {}).some(e => e.act === 'approved as fan' && e.target === 'aunt'), true);
  }
  {
    const { A, fbk } = await boot('mumU');
    fbk.deliver('claims/CLUB/t1', { aunt: { invite: ID, player: 'p1', name: 'Aunt Jo', at: A.nowMs() } }); await A.flush();
    const before = fbk.record.writes.length;
    A.click({ act: 'fanok', tid: 't1', uid: 'aunt' }); await A.flush(10);
    check('her family cannot approve it', fbk.record.writes.length, before);
    check('nor even listens for asks', fbk.watching('claims/CLUB/t1'), false);
  }

  console.log('\n--- what a fan\'s phone reads ---');
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
    check('a fan here', A.roleIn('t1', 'gran') + ' ' + A.restricted(), 'fan fan');
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
    check('My players has her player, as one she is a fan of', /Rosa Lind/.test(A.rendered()) && /you.re her fan/.test(A.rendered()), true);
    check('with no fans of her own to ask for', /data-act="fansheet"/.test(A.rendered()), false);
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
    const org = ORG(); delete org.access.teamFans;
    const { A, fbk } = await boot('adm', org);
    check('she stays in the club\'s index', A.hasAnyRole('gran'), true);
    check('never removed from it', fbk.record.removes.includes(OB + '/access/index/gran'), false);
    check('the fans table is built', valueAt(fbk, OB + '/access/teamFans/t1/gran'), 'p2');
    check('People shows her as a fan', A.rolesHeld('gran', A.teams()).map(v => v.r + ':' + v.p.id).join(), 'fan:p2');
  }
  {
    const { A, fbk } = await boot('coachU');
    A.ui.teamId = 't1';
    A.dom.confirm = () => true;
    A.click({ act: 'fandrop', tid: 't1', pid: 'p2', uid: 'gran', from: 'player' }); await A.flush(10);
    check('off her player\'s record', fbk.record.removes.includes(OB + '/squad/t1/p2/fans/gran'), true);
    check('off the team\'s fans', fbk.record.removes.includes(OB + '/access/teamFans/t1/gran'), true);
    check('out of the club, her last role gone', fbk.record.removes.includes(OB + '/access/index/gran'), true);
    check('logged', Object.values(A.state.access.log || {}).some(e => e.act === 'removed fan' && e.target === 'gran'), true);
  }
  {
    const { A, fbk } = await boot('mumU');
    A.dom.confirm = () => true;
    A.click({ act: 'fandrop', tid: 't1', pid: 'p2', uid: 'gran', from: 'player' }); await A.flush(10);
    check('a family cannot take a fan away', fbk.record.removes.some(p => p.includes('/fans/')), false);
  }

  console.log('\n--- her family sees who, and decides ---');
  {
    const org = ORG();
    org.squad.t1.p1.fans = { aunt: true, uncle: 'iold' };
    org.squad.t1.p1.fanNames = { aunt: 'Aunt Jo', uncle: 'Uncle Sid' };
    org.access.teamFans.t1.aunt = 'p1'; org.access.teamFans.t1.uncle = 'p1';
    const { A, fbk } = await boot('mumU', org);
    A.click({ act: 'fansheet', tid: 't1', pid: 'p1' });
    check('her child\'s fans, by name', /Aunt Jo/.test(sheet(A)) && /Uncle Sid/.test(sheet(A)) && /2 fans follow Ella/.test(sheet(A)), true);
    check('with Remove beside each', (sheet(A).match(/data-act="fandrop"/g) || []).length, 2);
    check('the sheet offers how many people and for how long', /id="fanLUses"/.test(sheet(A)) && /id="fanLDays"/.test(sheet(A)), true);
    A.dom.confirm = () => true;
    A.click({ act: 'fandrop', tid: 't1', pid: 'p1', uid: 'aunt', from: 'sheet' }); await A.flush(10);
    const rm = fbk.record.removes;
    check('off her child\'s record', rm.includes(OB + '/squad/t1/p1/fans/aunt'), true);
    check('— her name with it', rm.includes(OB + '/squad/t1/p1/fanNames/aunt'), true);
    check('— and out of the team\'s table, once the record no longer names her', rm.includes(OB + '/access/teamFans/t1/aunt'), true);
    check('her family does not touch the club\'s index: that is the staff\'s and the server\'s', rm.some(x => x.includes('/access/index/')), false);
    check('nor the invite she came in by', rm.some(x => x.startsWith('invites/')), false);
    check('the other fan stays', /Uncle Sid/.test(sheet(A)), true);
    A.dom.node('#fanLUses').value = '2'; A.dom.node('#fanLDays').value = '3';
    A.click({ act: 'faninvite', tid: 't1', pid: 'p1', from: 'sheet' }); await A.flush(10);
    const inv = fbk.record.writes.find(w => /^invites\/m[0-9a-f]+$/.test(w.path));
    check('a fan link for both grandparents: two seats, three days', inv && Object.keys(inv.value.seats).length + ' ' + Math.round((inv.value.expiresAt - inv.value.at) / 864e5), '2 3');
  }

  console.log('\n--- a fan leaves ---');
  {
    const { A, fbk } = await boot('gran');
    A.ui.view = 'mine'; A.render();
    check('her card offers to stop following', /data-act="fanleave" data-tid="t1" data-pid="p2"/.test(A.rendered()) && /Stop following Rosa/.test(A.rendered()), true);
    A.dom.confirm = () => true;
    A.click({ act: 'fanleave', tid: 't1', pid: 'p2' }); await A.flush(10);
    const rm = fbk.record.removes;
    check('off the record', rm.includes(OB + '/squad/t1/p2/fans/gran'), true);
    check('off the team\'s table', rm.includes(OB + '/access/teamFans/t1/gran'), true);
    check('out of the club, her last role gone', rm.includes(OB + '/access/index/gran'), true);
    check('and its bookmark', rm.includes('userOrgs/gran/CLUB'), true);
    check('nobody else\'s place touched', rm.some(x => /guardians|\/self\//.test(x)), false);
  }
  {
    const { A, fbk } = await boot('mumU');
    A.dom.confirm = () => true;
    A.click({ act: 'fanleave', tid: 't1', pid: 'p2' }); await A.flush(10);
    check('nobody but the fan herself leaves for her', fbk.record.removes.some(x => x.includes('/fans/')), false);
  }

  console.log('\n--- her name, where the family reads it ---');
  {
    const { A, fbk } = await boot('coachU');
    fbk.deliver('claims/CLUB/t1', { aunt: { invite: ID, player: 'p1', name: 'Aunt Jo', email: 'jo@x.test', at: A.nowMs() } }); await A.flush();
    A.click({ act: 'fanok', tid: 't1', uid: 'aunt' }); await A.flush(20);
    check('the coach approving writes it on the record', valueAt(fbk, OB + '/squad/t1/p1/fanNames/aunt'), 'Aunt Jo');
  }
  {
    const fbk = makeFakebase();
    const A = H.loadApp({ firebase: fbk, config: CONFIG, storage: { 'sm.tree.v1:CLUB': 'orgs' }, search: '?invite=' + ID });
    await A.flush();
    fbk.signIn('aunt', { name: 'Aunt Jo', email: 'jo@x.test' }); await A.flush();
    fbk.deliver('invites/' + ID, { ws: 'CLUB', team: 't1', teamName: 'Flight', role: 'fan', player: 'p1', playerNo: '7', clubName: 'Lakeside SC',
      by: 'coachU', byName: 'Jaz', approved: true, at: A.nowMs() - 1000, expiresAt: A.nowMs() + 7 * 864e5 });
    await A.flush();
    A.click({ act: 'inviteaccept' }); await A.flush(20);
    const p = wrote(fbk), at = x => p.indexOf(x);
    check('she writes her own on accepting a coach\'s link', valueAt(fbk, OB + '/squad/t1/p1/fanNames/aunt'), 'Aunt Jo');
    check('— after she is on the record', at(OB + '/squad/t1/p1/fans/aunt') < at(OB + '/squad/t1/p1/fanNames/aunt'), true);
  }

  H.summary('a player\'s fans: asked for by anyone who can see her, approved by her coach');
})();
