/* My calendar is the person's, not a club's, and a phone is in every club its
   account is in. AVAILABILITY.md, "My calendar is yours, not a club's", is the
   design. What is easy to get quietly wrong, and so is pinned here:

   - The top row says whose a screen is and which one: a team's tabs carry
     Club › Team, club screens Club › the screen, My calendar You › My
     calendar.
   - Every other club the account is in is listened to as well as the open
     one, read-only, for its teams, games, sessions and bookable times, and
     kept on the phone cut down to what My calendar needs: her own children,
     no squad, no game's stints. Nothing about a club is written anywhere new.
   - Her other clubs show on My calendar, each named, with a chip each, live
     as they change, and from the phone's copy with no signal (said as "as
     of"); drawing them never disturbs the club open on the phone. A club she
     leaves is let go.
   - Private is the default: nothing about her is readable by anyone else
     until she turns sharing on, and then only times. Turning it off takes them
     down. The setting is written before any busy time, because the rules
     refuse a busy time while it is off.
   - Shared busy times make a coach busy wherever this club asks who is free,
     except the club's own times (already there, in full). A private coach is
     exactly as before. Her own other clubs take out her bookable slots.
   - A parent's phone never asks for anybody's busy times, and the calendar
     sheet on People is refused to her in the handler.
   - Signing out forgets the other clubs' copies on the phone. */

const H = require('./harness');
const { check } = H;
const { makeFakebase } = require('./fakebase');

const CONFIG = { apiKey: 'k', databaseURL: 'https://prod.example', projectId: 'p' };

const club = () => ({
  teams: {
    t1: {
      id: 't1', name: 'G11 Flight', events: {},
      players: { p1: { id: 'p1', name: 'Rosa Smith', number: '2', active: true, guardians: { mum: true } } }
    }
  },
  matches: {},
  access: {
    org: { name: 'Lakeside SC' },
    admins: { boss: true },
    index: { boss: true, jaz: true, mum: true },
    members: { boss: { name: 'Ada' }, jaz: { name: 'Jaz' }, mum: { name: 'Mo' } },
    teams: { t1: { coaches: { jaz: true } } },
    coachIndex: { jaz: 't1' }
  }
});

async function boot(who, extra = {}) {
  const fbk = makeFakebase();
  const D = H.loadApp({ firebase: fbk, config: CONFIG, storage: { 'sm.workspace': 'CLUB' } });
  await D.flush(); fbk.signIn(who, { name: who }); await D.flush();
  const ws = club();
  if (extra.practiceOn) ws.teams.t1.events.e1 = { id: 'e1', kind: 'practice', title: 'Practice', date: extra.practiceOn, start: '17:00', end: '18:00', venue: 'Lakeside Park' };
  fbk.deliver('workspaces/CLUB', ws); await D.flush();
  fbk.deliver('userOrgs/' + who, { CLUB: { name: 'Lakeside SC', at: 1 }, HILL: { name: 'Hillside', at: 2 } }); await D.flush();
  return { D, fbk };
}
const names = ['Rosa', 'Smith'];
const nameIn = v => names.some(n => JSON.stringify(v).includes(n));

(async () => {
  let day, TAG_CLUB, TAG_HILL;
  {
    const { D } = await boot('jaz');
    day = n => D.addDays(D.todayStr(), n);
    TAG_CLUB = D.clubTag('CLUB'); TAG_HILL = D.clubTag('HILL');
  }
  const hillTeams = (pday = 1) => ({ h1: { id: 'h1', name: 'Hill U12', events: { e9: { id: 'e9', kind: 'practice', title: 'Practice', date: day(pday), start: '18:00', end: '19:30', venue: 'Hill Park' } },
    players: { z: { id: 'z', name: 'Zoe Smith', guardians: { someone: true } }, k: { id: 'k', name: 'Kai Smith', guardians: { jaz: true } } } } });
  const hillMatches = { g1: { id: 'g1', teamId: 'h1', opponent: 'Storm', date: day(2), kickoff: '10:00', periodCount: 2, periodMinutes: 30, stints: { s1: { pid: 'z', on: 0 } }, goals: { x: { t: 1, side: 'us', pid: 'z' } } } };
  const hillAccess = { org: { name: 'Hillside FC' }, teams: { h1: { coaches: { jaz: true } } }, index: { jaz: true }, members: { someone: { name: 'Zed', email: 'z@x.test' } } };
  const hillSess = { s1: { id: 's1', kind: 'one', cap: 1, coach: 'jaz', coachName: 'Jaz', title: 'Finishing', date: day(3), start: '09:00', end: '10:00' } };
  const deliverHill = async (D, fbk, pday) => {
    fbk.deliver('workspaces/HILL/teams', hillTeams(pday));
    fbk.deliver('workspaces/HILL/matches', hillMatches);
    fbk.deliver('workspaces/HILL/access', hillAccess);
    fbk.deliver('training/HILL/sessions', hillSess);
    fbk.deliver('training/HILL/booked', {});
    fbk.deliver('training/HILL/avail', {});
    await D.flush();
  };

  console.log('--- whose screen it is, and which ---');
  {
    const { D } = await boot('jaz');
    D.ui.view = 'matches'; D.render();
    check('a team\'s tab carries the club and the team', /Club<\/span>/.test(D.crumbs()) && /Team<\/span>/.test(D.crumbs()), true);
    for (const [v, name] of [['setup', 'Your settings'], ['people', 'People'], ['sessions', 'Training sessions'], ['inbox', 'Messages'], ['admin', 'Club settings'], ['planner', 'Planner'], ['mine', 'My players']]) {
      D.ui.view = v;
      check(`${v}: Club › ${name}, no team`, /Club<\/span>/.test(D.crumbs()) && D.crumbs().includes(name + '</span>') && !/Team<\/span>/.test(D.crumbs()), true);
    }
    D.ui.view = 'club';
    check('club home: the club alone', /Club<\/span>/.test(D.crumbs()) && !/Screen<\/span>|Team<\/span>/.test(D.crumbs()), true);
    D.ui.view = 'mycal';
    check('My calendar: You › My calendar, no club, no team', /You<\/span>/.test(D.crumbs()) && D.crumbs().includes('My calendar</span>') && !/Club<\/span>/.test(D.crumbs()) && !/Team<\/span>/.test(D.crumbs()), true);
    D.ui.view = 'formation'; D.ui.editFid = '@game';
    check('the game\'s shape is the team\'s', D.viewScope(), 'team');
    D.ui.view = 'formation'; D.ui.editFid = 'f1';
    check('the club\'s shapes are the club\'s', D.viewScope() + ' ' + D.crumbs().includes('Shapes</span>'), 'club true');
    D.click({ act: 'accountsheet' });
    check('the You crumb opens her account, with My calendar on it', /data-v="mycal"/.test(String(D.dom.node('#sheet').innerHTML)), true);
  }

  let keptCopy = null;
  console.log('\n--- every club she is in, on this phone ---');
  {
    const { D, fbk } = await boot('jaz', { practiceOn: day(3) });
    check('the other club\'s teams and games are listened to', fbk.watching('workspaces/HILL/teams') && fbk.watching('workspaces/HILL/matches') && fbk.watching('workspaces/HILL/access'), true);
    check('and its sessions and bookable times', fbk.watching('training/HILL/sessions') && fbk.watching('training/HILL/booked') && fbk.watching('training/HILL/avail'), true);
    await deliverHill(D, fbk);
    const keys = D.myCalItems('all').map(x => x.key);
    check('the other club\'s practice is on My calendar', keys.includes('y:HILL:e:e9'), true);
    check('its game', keys.includes('y:HILL:g:g1'), true);
    check('the session she runs there', keys.includes('y:HILL:s:s1'), true);
    check('with this club\'s own', keys.includes('e:e1'), true);
    check('a chip for each club', D.myCalFilters().map(([k]) => k).filter(k => k.startsWith('c:')).join(), 'c:CLUB,c:HILL');
    check('one club alone', D.myCalItems('c:HILL').every(x => x.club === 'HILL') && D.myCalItems('c:HILL').length, 3);
    check('this club alone leaves the other out', D.myCalItems('c:CLUB').some(x => x.club), false);
    D.ui.view = 'mycal'; D.ui.myCal = 'all'; D.render();
    check('drawn with the club\'s name', /Hillside FC · Hill U12 · Hill Park/.test(D.rendered()), true);
    check('not the open club, which is held in full already', D.youClubs().map(([c]) => c).join(), 'HILL');
    check('heard from this session: no "as of"', /as of/.test(D.rendered()), false);
    check('the club open here is untouched', Object.keys(D.state.teams).join() + ' ' + D.state.access.org.name, 't1 Lakeside SC');
    D.timers.run(); await D.flush();
    check('nothing about a club written anywhere', fbk.record.writes.some(x => /^people\//.test(x.path)), false);
    const kept = D.storage.getItem('sm.mirror.v1:jaz') || '';
    check('kept on the phone for no signal', kept.includes('Hill Park'), true);
    check('her own child only, not the squad', kept.includes('Kai') && !kept.includes('Zoe'), true);
    check('no game\'s stints or goals, no members', /stints|goals|z@x\.test/.test(kept), false);

    console.log('\n--- live as it changes ---');
    fbk.deliver('workspaces/HILL/teams', hillTeams(4)); await D.flush();
    const hk = D.youCalItems('HILL').filter(x => x.kind === 'practice');
    check('a practice moved there is moved here', hk.map(x => x.date).join(), day(4));

    console.log('\n--- busy at another club, for herself ---');
    fbk.deliver('workspaces/HILL/teams', hillTeams(1)); await D.flush();
    const st = D.coachStatus('jaz', day(1), 18 * 60, 19 * 60);
    check('she is busy then', st.state, 'busy');
    check('and it says where', /Hillside FC: Practice/.test(st.why), true);
    check('free either side', D.coachStatus('jaz', day(1), 16 * 60, 17 * 60).state, 'free');
    D.sess.avail.b1 = { id: 'b1', kind: 'one', cap: 1, coach: 'jaz', coachName: 'Jaz', date: day(1), start: '17:00', end: '20:00', len: 60, price: 30, notice: 24 };
    const sl = D.blockSlots(D.blockById('b1'));
    check('her bookable slots leave it out', sl.map(x => x.start + (x.clash.length ? 'x' : '')).join(), '17:00,18:00x,19:00x');
    delete D.sess.avail.b1;

    console.log('\n--- sharing, and taking it back ---');
    D.click({ act: 'youshare', v: '1' }); await D.flush();
    const order = fbk.record.writes.map(x => x.path).filter(p => /^people\/jaz\/(set|busy)/.test(p));
    check('the setting goes first, since the rules read it', order[0], 'people/jaz/set');
    check('as a yes', (fbk.writtenTo('people/jaz/set')[0] || {}).value.share, true);
    const bH = fbk.writtenTo('people/jaz/busy/' + TAG_HILL)[0], bC = fbk.writtenTo('people/jaz/busy/' + TAG_CLUB)[0];
    check('then each club\'s busy times, under a tag', !!bH && !!bC, true);
    check('times and nothing else', bH && Object.values(bH.value.b).every(x => Object.keys(x).sort().join() === 'd,e,s'), true);
    check('the other club\'s practice, game and session', bH && Object.values(bH.value.b).map(x => x.d + ' ' + x.s + '-' + x.e).join(), `${day(1)} 18:00-19:30,${day(2)} 10:00-11:15,${day(3)} 09:00-10:00`);
    check('no club code, no title, no place', /HILL|CLUB|Practice|Park|Hillside|Lakeside|Storm/.test(JSON.stringify(bH.value) + JSON.stringify(bC.value)), false);
    check('no child\'s name', nameIn(bC.value) || nameIn(bH.value), false);
    check('said', D.lastToast(), 'Your busy times are shared');
    D.click({ act: 'youshare', v: '0' }); await D.flush();
    check('private again: the setting', fbk.writtenTo('people/jaz/set').slice(-1)[0].value.share, false);
    check('and the busy times come down, all of them', fbk.record.removes.includes('people/jaz/busy'), true);

    keptCopy = D.storage.getItem('sm.mirror.v1:jaz');
    console.log('\n--- leaving a club ---');
    fbk.deliver('userOrgs/jaz', { CLUB: { name: 'Lakeside SC', at: 1 } }); await D.flush();
    check('it goes from My calendar', D.youClubs().length + ' ' + D.myCalItems('all').some(x => x.club), '0 false');
    D.timers.run(); await D.flush();
    check('and from the phone', (D.storage.getItem('sm.mirror.v1:jaz') || '').includes('Hill'), false);

    console.log('\n--- signing out ---');
    fbk.deliver('userOrgs/jaz', { CLUB: { name: 'Lakeside SC', at: 1 }, HILL: { name: 'Hillside', at: 2 } }); await D.flush();
    await deliverHill(D, fbk); D.timers.run(); await D.flush();
    check('kept on the phone while she is signed in', !!D.storage.getItem('sm.mirror.v1:jaz'), true);
    fbk.signOut(); await D.flush();
    check('forgotten when she signs out', D.storage.getItem('sm.mirror.v1:jaz'), null);
    check('and gone from memory', D.youClubs().length, 0);
    check('the club\'s own copy is not hers to clear', !!D.storage.getItem('sm.data.v1:CLUB'), true);
  }

  // another phone: loadApp() swaps the global localStorage, so this comes after the first is done
  {
    console.log('\n--- no signal ---');
    {
      const fb2 = makeFakebase();
      const E = H.loadApp({ firebase: fb2, config: CONFIG, storage: { 'sm.workspace': 'CLUB', 'sm.mirror.v1:jaz': keptCopy } });
      await E.flush(); fb2.signIn('jaz', { name: 'jaz' }); await E.flush();
      fb2.deliver('workspaces/CLUB', club()); await E.flush();
      fb2.deliver('userOrgs/jaz', { CLUB: { name: 'Lakeside SC', at: 1 }, HILL: { name: 'Hillside', at: 2 } }); await E.flush();
      check('the other club is there before it answers', E.myCalItems('all').some(x => x.key === 'y:HILL:e:e9'), true);
      E.ui.view = 'mycal'; E.render();
      check('said as of when', /Hillside FC as of/.test(E.rendered()), true);
    }

  }

  console.log('\n--- what the club sees of her ---');
  {
    const { D, fbk } = await boot('boss');
    check('an admin\'s phone listens for the coaches\' shared times', fbk.watching('people/jaz/busy'), true);
    check('nobody else\'s', fbk.watching('people/mum/busy'), false);
    check('a private coach: free at any time', D.coachStatus('jaz', day(1), 18 * 60, 19 * 60).state, 'free');
    fbk.deliver('people/jaz/busy', {
      [TAG_HILL]: { at: 1, b: { b1: { d: day(1), s: '18:00', e: '19:30' } } },
      [TAG_CLUB]: { at: 1, b: { b1: { d: day(1), s: '12:00', e: '13:00' } } }
    }); await D.flush();
    const st = D.coachStatus('jaz', day(1), 18 * 60, 19 * 60);
    check('sharing: busy then', st.state, 'busy');
    check('at another club, and nothing more', st.why, 'another club at 6pm');
    check('this club\'s own times are not counted twice', D.elsewhereOn(day(1)).length, 1);
    D.ui.view = 'people'; D.render();
    check('People has her calendar', /data-act="personcal" data-uid="jaz"/.test(D.rendered()), true);
    D.click({ act: 'personcal', uid: 'jaz' });
    const sh = String(D.dom.node('#sheet').innerHTML);
    check('it says busy at another club', /Busy at another club/.test(sh), true);
    check('and that she chose to share it', /chosen to share/.test(sh), true);
  }
  {
    const { D, fbk } = await boot('mum');
    check('a parent\'s phone never asks for anyone\'s busy times', fbk.readPaths().some(p => /^people\/(?!mum\/)/.test(p)), false);
    D.dom.node('#sheet').innerHTML = '';
    D.click({ act: 'personcal', uid: 'jaz' });
    check('and is refused a coach\'s calendar', String(D.dom.node('#sheet').innerHTML), '');
  }

  console.log('\n--- a parent: her children in every club ---');
  {
    const { D, fbk } = await boot('mum', { practiceOn: day(2) });
    const mumHill = hillTeams(3);
    mumHill.h1.players.k.guardians = { mum: true };
    const deliverMum = async teamsV => {
      fbk.deliver('workspaces/HILL/teams', teamsV);
      fbk.deliver('workspaces/HILL/matches', hillMatches);
      fbk.deliver('workspaces/HILL/access', { ...hillAccess, index: { jaz: true, mum: true } });
      for (const p of ['sessions', 'booked', 'avail']) fbk.deliver('training/HILL/' + p, {});
      await D.flush();
    };
    await deliverMum(mumHill);
    const keys = D.myCalItems('all').map(x => x.key);
    check('her child\'s practice in the other club is on My calendar', keys.includes('y:HILL:e:e9'), true);
    check('and that team\'s game', keys.includes('y:HILL:g:g1'), true);
    check('beside her child\'s here', keys.includes('e:e1'), true);
    check('a chip for each club', D.myCalFilters().map(([k]) => k).filter(k => k.startsWith('c:')).join(), 'c:CLUB,c:HILL');

    console.log('\n--- one calendar feed for all of it ---');
    global.window.SOCCER_CALENDAR_FEED = '';
    D.ui.view = 'mycal'; D.render();
    check('no feed for the site: a copy to add instead', /data-act="myfeedics"/.test(D.rendered()) && !/data-act="myfeed"/.test(D.rendered()), true);
    global.window.SOCCER_CALENDAR_FEED = 'https://feed.example.workers.dev';
    D.render();
    check('off until she turns it on', /data-act="myfeed" data-v="on"/.test(D.rendered()), true);
    check('nothing published before', fbk.record.writes.some(x => /^public\/m/.test(x.path)), false);
    D.sess.sessions.s9 = { id: 's9', kind: 'one', cap: 1, coach: 'jaz', coachName: 'Jaz', title: 'Rosa finishing', date: day(4), start: '09:00', end: '10:00' };
    D.sess.booked.s9 = { p1: { st: 'in', by: 'mum' } };
    D.click({ act: 'myfeed', v: 'on' }); await D.flush(); D.timers.run(); await D.flush();
    const paths = fbk.record.writes.map(x => x.path);
    const set = (fbk.writtenTo('people/mum/set').slice(-1)[0] || {}).value || {};
    const id = set.feed || '';
    check('an address of its own, kept with her settings', /^m\w{10,}$/.test(id), true);
    check('still private about busy times', set.share, false);
    check('claimed before anything is written there', paths.indexOf('shareOwners/' + id) >= 0 && paths.indexOf('shareOwners/' + id) < paths.indexOf('public/' + id), true);
    const doc = (fbk.writtenTo('public/' + id).slice(-1)[0] || {}).value || {};
    const items = Object.values(doc.items || {});
    check('a feed the Worker reads', doc.mine === true && !!doc.team && doc.team.name, 'My calendar');
    const titles = items.map(x => x.title).sort();
    check('both clubs\' entries, titled with the team', titles.includes('G11 Flight: Practice') && titles.includes('Hill U12: Practice') && titles.includes('Hill U12 v Storm'), true);
    check('her child\'s training session, the child not named', titles.includes('Training: a player finishing'), true);
    check('the other club named in the description', items.some(x => /Hillside FC/.test(x.desc || '')), true);
    check('no child\'s name anywhere in it', nameIn(doc) || /Kai/.test(JSON.stringify(doc)), false);
    check('no club code either', /HILL|CLUB/.test(JSON.stringify(doc)), false);
    D.render();
    check('subscribe buttons once it is on', /webcal:\/\/feed\.example\.workers\.dev\/m\w+\.ics/.test(D.rendered()), true);
    const n0 = fbk.writtenTo('public/' + id).length;
    D.render(); D.timers.run(); await D.flush();
    check('nothing rewritten while nothing changed', fbk.writtenTo('public/' + id).length, n0);
    mumHill.h1.events.e9.called = 'cancelled';
    await deliverMum(mumHill);
    D.render(); D.timers.run(); await D.flush();
    const doc2 = (fbk.writtenTo('public/' + id).slice(-1)[0] || {}).value || {};
    check('a practice called off in the other club follows', Object.values(doc2.items || {}).some(x => x.title === 'Hill U12: Practice' && x.called === 'cancelled'), true);

    console.log('\n--- a new address, and off ---');
    global.confirm = () => true;
    D.click({ act: 'myfeed', v: 'new' }); await D.flush(); D.timers.run(); await D.flush();
    const id2 = ((fbk.writtenTo('people/mum/set').slice(-1)[0] || {}).value || {}).feed;
    check('replaced: a different address', !!id2 && id2 !== id, true);
    check('and the old one taken down', fbk.record.removes.includes('public/' + id), true);
    D.click({ act: 'myfeed', v: 'off' }); await D.flush();
    check('off: the address taken down', fbk.record.removes.includes('public/' + id2), true);
    check('and gone from her settings', 'feed' in ((fbk.writtenTo('people/mum/set').slice(-1)[0] || {}).value || {}), false);
    global.window.SOCCER_CALENDAR_FEED = '';
  }

  H.summary('my calendar');
})();
