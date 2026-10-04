/* My calendar is the person's, not a club's. AVAILABILITY.md, "My calendar is
   yours, not a club's", is the design. What is easy to get quietly wrong, and
   so is pinned here:

   - The crumbs say whose a screen is: a team's tabs carry the team, club
     screens (settings, people, sessions) the club alone, and My calendar
     neither — it is "You".
   - Each phone writes a summary of the club it has open to her own node, once
     the club has been read, with no child's name in it, and nobody's but hers.
   - Her other clubs show on My calendar from those summaries, each named, with
     a chip each; a club read directly when she opens it with a signal is
     summarised without disturbing the club open on the phone.
   - Private is the default: nothing about her is readable by anyone else
     until she turns sharing on, and then only times. Turning it off takes them
     down. The setting is written before any busy time, because the rules
     refuse a busy time while it is off.
   - Shared busy times make a coach busy wherever this club asks who is free,
     except the club's own times (already there, in full). A private coach is
     exactly as before. Her own other clubs take out her bookable slots.
   - A parent's phone never asks for anybody's busy times, and the calendar
     sheet on People is refused to her in the handler.
   - Signing out forgets the summaries on the phone. */

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
  const hill = (at) => ({ name: 'Hillside', at, items: { i1: { k: 'practice', d: day(1), s: '18:00', e: '19:30', t: 'Practice', p: 'Hill Park', n: 'Hill U12' }, i2: { k: 'session', d: day(2), s: '09:00', e: '10:00', t: 'Finishing 1-1' } } });

  console.log('--- whose screen it is ---');
  {
    const { D } = await boot('jaz');
    D.ui.view = 'matches'; D.render();
    check('a team\'s tab carries the club and the team', /Club<\/span>/.test(D.crumbs()) && /Team<\/span>/.test(D.crumbs()), true);
    for (const v of ['setup', 'club', 'people', 'sessions', 'inbox']) {
      D.ui.view = v;
      check(`${v}: the club and no team`, /Club<\/span>/.test(D.crumbs()) && !/Team<\/span>/.test(D.crumbs()), true);
    }
    D.ui.view = 'mycal';
    check('My calendar: neither, it is hers', /You<\/span>/.test(D.crumbs()) && !/Club<\/span>/.test(D.crumbs()) && !/Team<\/span>/.test(D.crumbs()), true);
    D.ui.view = 'formation'; D.ui.editFid = '@game';
    check('the game\'s shape is the team\'s', D.viewScope(), 'team');
    D.ui.view = 'formation'; D.ui.editFid = 'f1';
    check('the club\'s shapes are the club\'s', D.viewScope(), 'club');
    D.click({ act: 'accountsheet' });
    check('the You crumb opens her account, with My calendar on it', /data-v="mycal"/.test(String(D.dom.node('#sheet').innerHTML)), true);
  }

  console.log('\n--- her summary of the club she has open ---');
  {
    const { D, fbk } = await boot('jaz', { practiceOn: day(3) });
    check('nothing before the club has been read and a moment has passed', fbk.writtenTo('people/jaz/cal/CLUB').length, 0);
    D.timers.run(); await D.flush();
    const w = fbk.writtenTo('people/jaz/cal/CLUB');
    check('then written once, to her own node', w.length, 1);
    const doc = w[0] && w[0].value;
    check('named for the club', doc && doc.name, 'Lakeside SC');
    const it = doc && Object.values(doc.items).find(x => x.k === 'practice');
    check('with the practice, its time, place and team', it && [it.d, it.s, it.e, it.p, it.n].join(' '), `${day(3)} 17:00 18:00 Lakeside Park G11 Flight`);
    check('only the fields the rule allows', Object.values(doc.items).every(x => Object.keys(x).every(k => 'kdsemtpnx'.includes(k))), true);
    check('no child\'s name in it', nameIn(doc), false);
    D.render(); D.timers.run(); await D.flush();
    check('unchanged, not written again this session', fbk.writtenTo('people/jaz/cal/CLUB').length, 1);
    check('private by default: no busy times anywhere', fbk.record.writes.some(x => /^people\/jaz\/busy/.test(x.path)), false);
    check('and no setting written for her', fbk.writtenTo('people/jaz/set').length, 0);

    console.log('\n--- her other clubs ---');
    fbk.deliver('people/jaz/cal', { HILL: hill(D.nowMs()) }); await D.flush();
    const keys = D.myCalItems('all').map(x => x.key);
    check('another club\'s practice is on My calendar', keys.includes('y:HILL:i1'), true);
    check('with this club\'s own', keys.includes('e:e1'), true);
    check('a chip for each club', D.myCalFilters().map(([k]) => k).filter(k => k.startsWith('c:')).join(), 'c:CLUB,c:HILL');
    check('one club alone', D.myCalItems('c:HILL').map(x => x.key).join(), 'y:HILL:i1,y:HILL:i2');
    check('this club alone leaves the other out', D.myCalItems('c:CLUB').some(x => x.club), false);
    D.ui.view = 'mycal'; D.ui.myCal = 'all'; D.render();
    check('drawn with the club\'s name', /Hillside · Hill U12 · Hill Park/.test(D.rendered()), true);
    check('her own summary of this club is not drawn twice', D.myCalItems('all').filter(x => x.club === 'CLUB').length, 0);

    console.log('\n--- busy at another club, for herself ---');
    const st = D.coachStatus('jaz', day(1), 18 * 60, 19 * 60);
    check('she is busy then', st.state, 'busy');
    check('and it says where', /Hillside: Practice/.test(st.why), true);
    check('free either side', D.coachStatus('jaz', day(1), 16 * 60, 17 * 60).state, 'free');
    D.sess.avail.b1 = { id: 'b1', kind: 'one', cap: 1, coach: 'jaz', coachName: 'Jaz', date: day(1), start: '17:00', end: '20:00', len: 60, price: 30, notice: 24 };
    const sl = D.blockSlots(D.blockById('b1'));
    check('her bookable slots leave it out', sl.map(x => x.start + (x.clash.length ? 'x' : '')).join(), '17:00,18:00x,19:00x');

    console.log('\n--- sharing, and taking it back ---');
    D.click({ act: 'youshare', v: '1' }); await D.flush();
    const order = fbk.record.writes.map(x => x.path).filter(p => /^people\/jaz\/(set|busy)/.test(p));
    check('the setting goes first, since the rules read it', order[0], 'people/jaz/set');
    check('as a yes', (fbk.writtenTo('people/jaz/set')[0] || {}).value.share, true);
    const bH = fbk.writtenTo('people/jaz/busy/' + TAG_HILL)[0], bC = fbk.writtenTo('people/jaz/busy/' + TAG_CLUB)[0];
    check('then each club\'s busy times, under a tag', !!bH && !!bC, true);
    check('times and nothing else', bH && Object.values(bH.value.b).every(x => Object.keys(x).sort().join() === 'd,e,s'), true);
    check('the other club\'s practice', bH && Object.values(bH.value.b).map(x => x.d + ' ' + x.s + '-' + x.e).join(), `${day(1)} 18:00-19:30,${day(2)} 09:00-10:00`);
    check('no club code, no title, no place', /HILL|CLUB|Practice|Park|Hillside|Lakeside/.test(JSON.stringify(bH.value) + JSON.stringify(bC.value)), false);
    check('no child\'s name', nameIn(bC.value), false);
    check('said', D.lastToast(), 'Your busy times are shared');
    D.click({ act: 'youshare', v: '0' }); await D.flush();
    check('private again: the setting', fbk.writtenTo('people/jaz/set').slice(-1)[0].value.share, false);
    check('and the busy times come down, all of them', fbk.record.removes.includes('people/jaz/busy'), true);

    console.log('\n--- refreshed from the club itself ---');
    fbk.deliver('.info/connected', true); await D.flush();
    const before = fbk.totalReads('workspaces/CLUB/teams');
    D.ui.view = 'mycal'; D.render();
    check('opening My calendar online reads the other club\'s teams', fbk.watching('workspaces/HILL/teams'), true);
    check('and not the one open here, which it has', fbk.totalReads('workspaces/CLUB/teams'), before);
    D.render();
    check('once, not on every draw', fbk.totalReads('workspaces/HILL/teams'), 1);
    fbk.deliver('workspaces/HILL/teams', { h1: { id: 'h1', name: 'Hill U12', players: { z: { id: 'z', name: 'Zoe Smith', guardians: {} } }, events: { e9: { id: 'e9', kind: 'practice', date: day(4), start: '18:30', end: '19:30', title: 'Practice' } } } });
    fbk.deliver('workspaces/HILL/matches', {});
    fbk.deliver('workspaces/HILL/access', { org: { name: 'Hillside FC' }, teams: { h1: { coaches: { jaz: true } } }, index: { jaz: true } });
    await D.flush();
    const hk = D.youCalItems('HILL');
    check('the moved practice, as the club has it now', hk.some(x => x.date === day(4) && x.start === '18:30'), true);
    check('the old one gone', hk.some(x => x.date === day(1)), false);
    check('the session from the summary kept', hk.some(x => x.kind === 'session'), true);
    check('the club\'s own name', hk[0] && hk[0].clubName, 'Hillside FC');
    check('the club open here is untouched', Object.keys(D.state.teams).join() + ' ' + D.state.access.org.name, 't1 Lakeside SC');
    check('and written back for her other phones', fbk.writtenTo('people/jaz/cal/HILL').length, 1);
    check('with no child\'s name from that club', /Zoe/.test(JSON.stringify(fbk.writtenTo('people/jaz/cal/HILL')[0].value)), false);

    console.log('\n--- signing out ---');
    check('kept on the phone while she is signed in', !!D.storage.getItem('sm.you.v1:jaz'), true);
    fbk.signOut(); await D.flush();
    check('forgotten when she signs out', D.storage.getItem('sm.you.v1:jaz'), null);
    check('and gone from memory', Object.keys(D.you.cal).length, 0);
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

  H.summary('my calendar');
})();
