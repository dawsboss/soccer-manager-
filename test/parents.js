/* What a parent sees, AUTH.md's last two build steps. What is pinned here:

   - "What parents actually see": her own child by name, the rest of the squad
     by shirt number (a player with none is "A teammate"), on every screen a
     parent opens that lists players: Stats, Season, Live, the match log and
     the recap. Only someone who is nothing but a parent in the club is
     narrowed: an admin, a coach (of this team or another, child or not) and a
     tracker see names, and so does everybody before the club has an admin.
   - The club's one setting ("Should admins configure what each role sees?":
     two presets, one boolean): the whole roster by name. Only an admin
     changes it, checked in the handler; it is one write at access/org/rosterOpen.
   - My players cuts across clubs ("A parent with three children in two
     clubs"): her children in every other club she is in, from that club's
     cut-down copy, named with team and club, with the next thing to get her
     to and a button to open that club. Never another family's child, and
     nothing added to the copy for it (still no stints). */

const H = require('./harness');
const { check } = H;
const { makeFakebase } = require('./fakebase');

const CFG = { apiKey: 'k', databaseURL: 'https://prod.example', projectId: 'p' };
const T0 = Date.UTC(2026, 8, 12, 12, 0, 0);
const MIN = 60000;

(async () => {
  const A = H.loadApp({ firebase: makeFakebase(), config: CFG });
  await A.flush();
  function setup(uid, extra = {}) {
    H.clock.set(T0);
    A.state = {
      teams: {
        t1: {
          id: 't1', name: 'G14 Flight',
          players: {
            p1: { id: 'p1', name: 'Ella Fitzgerald', number: '7', guardians: { mum: true } },
            p2: { id: 'p2', name: 'Mia Kowalski', number: '8' },
            p3: { id: 'p3', name: 'Rosa Delgado' }
          }
        },
        t2: { id: 't2', name: 'G12 Storm', players: { q1: { id: 'q1', name: 'Lou Park', number: '3', guardians: { jaz: true } } } }
      },
      matches: {
        g1: {
          id: 'g1', teamId: 't1', opponent: 'Riverside', date: '2026-09-12', createdAt: 3,
          periodCount: 2, periodMinutes: 40, onFieldCount: 2, currentHalf: 2, ended: true,
          periods: { 0: { half: 1, start: T0 - 90 * MIN, end: T0 - 50 * MIN }, 1: { half: 2, start: T0 - 45 * MIN, end: T0 - 5 * MIN } },
          stints: { s1: { pid: 'p1', on: 0, off: 4800 }, s2: { pid: 'p2', on: 0, off: 2400 }, s3: { pid: 'p3', on: 2400, off: 4800 } },
          planned: { p1: 80, p2: 40, p3: 40 },
          goals: { a: { t: 300, side: 'us', pid: 'p2', assist: 'p1' }, b: { t: 3000, side: 'us', pid: 'p3' }, c: { t: 3100, side: 'us', pid: 'p1' } },
          shots: { x: { t: 1000, side: 'us', pid: 'p2', onTarget: false } }
        }
      },
      access: {
        org: { name: 'Flight FC', ...(extra.org || {}) },
        admins: { boss: true },
        teams: { t1: { coaches: { coach: true }, trackers: { trk: true } }, t2: { coaches: { jaz: true } } },
        index: { boss: true, coach: true, trk: true, jaz: true, mum: true }
      }
    };
    A.me = uid ? { uid, name: uid } : null;
    A.appOwners = {};
    A.ui.teamId = 't1'; A.ui.matchId = 'g1'; A.ui.view = 'game';
  }
  const screens = () => {
    const out = {};
    for (const v of ['stats', 'live', 'recap']) { A.ui.view = 'game'; A.ui.gameView = v; A.render(); out[v] = A.rendered(); }
    A.ui.view = 'season'; A.render(); out.season = A.rendered();
    out.feed = JSON.stringify(A.feedItems(A.state.teams.t1, A.state.matches.g1));
    return out;
  };
  const others = /Mia|Kowalski|Rosa|Delgado/;

  console.log('--- a parent: her own child by name, the rest by number ---');
  {
    setup('mum');
    check('she is a parent here', A.restricted(), 'parent');
    const s = screens();
    for (const [k, html] of Object.entries(s)) check(`${k}: no other child named`, others.test(html), false);
    check('stats: her own child by name', /Ella Fitzgerald/.test(s.stats), true);
    check('stats: a teammate by shirt number', /#8/.test(s.stats), true);
    check('a teammate with no number is "A teammate"', /A teammate/.test(s.stats), true);
    check('the goal list says who scored, by number', /#8/.test(s.stats) && /assist Ella Fitzgerald/.test(s.stats), true);
    check('season: her child by name, the rest by number', /Ella Fitzgerald/.test(s.season) && /#8/.test(s.season), true);
    check('live: the feed by number', /#8/.test(s.feed) && /Ella Fitzgerald/.test(s.feed), true);
    check('the helper', [A.shownName(A.state.teams.t1, A.state.teams.t1.players.p1), A.shownName(A.state.teams.t1, A.state.teams.t1.players.p2)].join(), 'Ella Fitzgerald,#8');
  }

  console.log('\n--- a child with more than one parent, a parent with more than one child ---');
  {
    setup('dad');
    A.state.teams.t1.players.p1.guardians.dad = 'inv123';   // a second parent, let in by invite: the value is the invite id
    A.state.teams.t1.players.p2.guardians = { dad: true };   // and he has a second child on the team
    A.state.access.index.dad = true;
    const s = screens();
    check('either parent sees their child by name', /Ella Fitzgerald/.test(s.stats), true);
    check('a second child on the same team by name too', /Mia Kowalski/.test(s.stats), true);
    check('everyone else still by number', /Rosa|Delgado/.test(s.stats) || !/A teammate/.test(s.stats), false);
    check('both under My players', A.myPlayers().map(x => x.p.name).join(), 'Ella Fitzgerald,Mia Kowalski');
    setup('mum');
    check('the first parent is unaffected', /Ella Fitzgerald/.test(screens().stats) && !others.test(screens().stats), true);
  }

  console.log('\n--- who still sees names ---');
  for (const [who, why] of [['boss', 'an admin'], ['coach', 'this team\'s coach'], ['trk', 'its tracker'], ['jaz', 'a coach of another team, child or not']]) {
    setup(who);
    const s = screens();
    check(`${why}: names on Stats`, /Mia Kowalski/.test(s.stats) && /Rosa Delgado/.test(s.stats), true);
  }
  {
    setup('mum');
    A.state.access.admins = {};
    check('a club with no admin yet: everyone sees everything, names too', /Mia Kowalski/.test(screens().stats), true);
  }

  console.log('\n--- the club\'s setting ---');
  {
    setup('mum', { org: { rosterOpen: true } });
    const s = screens();
    check('"the whole roster by name": a parent sees names', /Mia Kowalski/.test(s.stats) && /Rosa Delgado/.test(s.season), true);
    setup('mum', { org: { rosterOpen: 'yes' } });
    check('anything but true is shirt numbers', others.test(screens().stats), false);

    setup('boss');
    A.ui.view = 'admin'; A.render();
    check('the admin sees the setting, numbers chosen', /What parents see/.test(A.rendered()) && /data-v="0" aria-pressed="true"/.test(A.rendered()), true);
    A.click({ act: 'rosteropen', v: '1' });
    check('one tap writes it', A.state.access.org.rosterOpen, true);
    A.click({ act: 'rosteropen', v: '0' });
    check('and back', A.state.access.org.rosterOpen, false);

    setup('coach');
    A.click({ act: 'rosteropen', v: '1' });
    check('a coach cannot, whatever reaches the handler', A.state.access.org.rosterOpen, undefined);
    setup('mum');
    A.click({ act: 'rosteropen', v: '1' });
    check('nor a parent', A.state.access.org.rosterOpen, undefined);
  }

  console.log('\n--- My players, across clubs ---');
  {
    const fbk = makeFakebase();
    const D = H.loadApp({ firebase: fbk, config: CFG, storage: { 'sm.workspace': 'CLUB' } });
    await D.flush(); fbk.signIn('mum', { name: 'Mo' }); await D.flush();
    await fbk.serveClub('CLUB', {
      teams: { t1: { id: 't1', name: 'G11 Flight', events: {}, players: { p1: { id: 'p1', name: 'Rosa Smith', number: '2', guardians: { mum: true } } } } },
      matches: {},
      access: { org: { name: 'Lakeside SC' }, admins: { boss: true }, index: { boss: true, mum: true }, teams: {} }
    }, D.flush);
    await D.flush();
    fbk.deliver('userOrgs/mum', { CLUB: { name: 'Lakeside SC', at: 1 }, HILL: { name: 'Hillside', at: 2 } }); await D.flush();
    const day = n => D.addDays(D.todayStr(), n);
    await fbk.serveClub('HILL', {
      access: { org: { name: 'Hillside FC' }, admins: { a: true }, index: { mum: true } },
      teams: { h1: { id: 'h1', name: 'Hill U9', events: { e9: { id: 'e9', kind: 'practice', title: 'Practice', date: day(2), start: '18:00', end: '19:00', venue: 'Hill Park' } },
      players: { k: { id: 'k', name: 'Iris Smith', guardians: { mum: true } }, z: { id: 'z', name: 'Zoe Other', guardians: { someone: true } } } } },
      matches: { g1: { id: 'g1', teamId: 'h1', opponent: 'Storm', date: day(9), kickoff: '10:00', stints: { s: { pid: 'k', on: 0 } } } }
    }, D.flush);
    for (const p of ['sessions', 'booked', 'avail']) fbk.deliver('training/HILL/' + p, {});
    await D.flush();

    check('her child in the other club is one of hers', D.elsewhereKids().map(k => `${k.name}|${k.team}|${k.club}`).join(), 'Iris Smith|Hill U9|Hillside FC');
    check('My players is offered for both', D.anyPlayers() && D.allKidNames().join(), 'Rosa Smith,Iris Smith');
    D.ui.view = 'mine'; D.render();
    const html = D.rendered();
    check('drawn: this club\'s child', /Rosa Smith/.test(html), true);
    check('and the other club\'s, with team and club', /Iris Smith/.test(html) && /Hill U9 · Hillside FC/.test(html), true);
    check('with the next thing to get her to', /Next — Practice/.test(html) && /Hill Park/.test(html), true);
    check('and a way into that club', /data-act="switchclub" data-code="HILL"/.test(html), true);
    check('never another family\'s child', /Zoe/.test(html), false);
    check('heard from this session: no "as of"', /as of/.test(html), false);
    check('the copy still carries no stints', /stints/.test(D.storage.getItem('sm.mirror.v1:mum') || ''), false);
    check('booking here is still about this club', D.guardsAnyone(), true);

    console.log('\n--- only in another club ---');
    delete D.state.teams.t1.players.p1.guardians.mum;
    D.ui.view = 'mine'; D.render();
    check('no child here: My players still opens for the other club', D.ui.view + ' ' + /Iris Smith/.test(D.rendered()), 'mine true');
    check('and sessions here are not hers to book', D.guardsAnyone(), false);
  }

  H.summary('what parents see');
})();
