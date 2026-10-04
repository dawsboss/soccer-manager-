/* Coaches' time off: the nights she can't do, the dates she's away, and
   calling out of one practice, game or session.

   What's pinned here is what would be easy to get quietly wrong:

   - It's the coaches' and the admins'. A parent's or a tracker's phone never
     asks for it, never draws it, and a tap that gets through is refused.
   - A coach writes her own, in her own name, one record per write at
     training/{code}/away/{uid}/{id}; she calls out only of her own team's
     entries and her own sessions, once, and takes it back the same way.
   - It is read, not obeyed: time off makes her busy where busyItems() is
     read (the planner, find-a-time, her bookable slots), a call-out takes
     her off the entry, and nothing is called off or changed for her. */

const H = require('./harness');
const { check, deepEq } = H;
const { makeFakebase } = require('./fakebase');

const CONFIG = { apiKey: 'k', databaseURL: 'https://prod.example', projectId: 'p' };
// the harness clock: Saturday 12 September 2026
const MON = '2026-09-14', TUE = '2026-09-15';
const kid = (id, name, g) => ({ id, name, number: id.slice(1), active: true, guardians: { [g]: true } });
const club = () => ({
  teams: {
    t1: { id: 't1', name: 'G11 Flight', players: { p1: kid('p1', 'Ella', 'mum') },
      events: { e1: { id: 'e1', kind: 'practice', title: 'Practice', date: MON, start: '17:30', end: '18:30', venue: 'Lakeside' },
        e2: { id: 'e2', kind: 'practice', title: 'Practice', date: TUE, start: '17:30', end: '18:30', venue: 'Lakeside' } } },
    t2: { id: 't2', name: 'G13 Storm', players: {}, events: { e3: { id: 'e3', kind: 'practice', title: 'Practice', date: TUE, start: '18:00', end: '19:00' } } }
  },
  matches: {},
  access: {
    admins: { boss: true },
    index: { boss: true, jaz: true, kim: true, mum: true, trk: true },
    members: { boss: { name: 'Ada' }, jaz: { name: 'Jaz' }, kim: { name: 'Kim' } },
    teams: { t1: { coaches: { jaz: true }, trackers: { trk: true } }, t2: { coaches: { jaz: true, kim: true } } },
    coachIndex: { jaz: 't1', kim: 't2' }
  }
});
const sheet = A => String(A.dom.node('#sheet').innerHTML || '');
const fill = (A, v) => { for (const [k, x] of Object.entries(v)) A.dom.node('#' + k).value = x; };
const A = H.loadApp({ config: CONFIG, firebase: makeFakebase() });
function as(uid) {
  A.state = club(); A.me = uid ? { uid, name: uid } : null; A.appOwners = {};
  A.sess = { sessions: {}, booked: {}, came: {}, fees: {}, pay: {}, splans: {}, avail: {}, seats: {}, away: {}, dirty: {}, refused: {} };
  A.ui.teamId = 't1'; A.ui.view = 'mycal'; A.ui.myCal = 'all'; A.ui.planner = {}; A.toasts.length = 0;
  A.dom.node('#sheet').innerHTML = '';
}
const blank = { awFrom: '', awTo: '', awStart: '', awEnd: '', awNote: '' };

(async () => {

  console.log('--- who has it ---');
  {
    for (const who of ['mum', 'trk']) {
      as(who); A.render();
      check(who + ': no Time off card', /Time off/.test(A.rendered()), false);
      A.click({ act: 'awaynew' });
      check(who + ': a tap that gets through is refused', A.lastToast(), 'Time off is for coaches and admins');
      A.click({ act: 'awayout', k: 'e:e1', tid: 't1', d: MON });
      check(who + ': calling out is refused too', A.lastToast(), 'Time off is for coaches and admins');
      check(who + ': and nothing is written', Object.keys(A.sess.dirty).length, 0);
    }
    as('jaz'); A.render();
    check('a coach has her Time off on My calendar', /<h2 style="margin:0">Time off<\/h2>/.test(A.rendered()), true);
  }

  console.log('\n--- every week, and dates away ---');
  {
    as('jaz');
    A.click({ act: 'awaynew' }); fill(A, blank);
    A.click({ act: 'awaysave' });
    check('every week needs a day', A.lastToast(), 'Pick at least one day');
    A.click({ act: 'awayday', v: '0' }); fill(A, { ...blank, awStart: '18:00' });
    A.click({ act: 'awaysave' });
    check('a start with no end is refused', A.lastToast(), 'Give a start and an end, or leave both blank for all day');
    fill(A, { ...blank, awNote: 'Work' }); A.click({ act: 'awaysave' });
    const recs = Object.values(A.sess.away.jaz || {});
    check('never Mondays is saved', recs.length === 1 && recs[0].kind === 'weekly' && recs[0].days.join(), '0');
    check('in her own name', recs[0].by, 'jaz');
    check('at its own path, waiting for the club', Object.keys(A.sess.dirty).every(k => /^away\/jaz\/[\w-]+$/.test(k)), true);
    deepEq('Monday is all day', A.awaySpans(A.awayAll()[0], MON), [[0, 1440]]);
    deepEq('Tuesday is nothing', A.awaySpans(A.awayAll()[0], TUE), []);
    A.render();
    check('her list says it in words', /Every Mon, all day \(Work\)/.test(A.rendered()), true);

    A.click({ act: 'awaynew' }); A.click({ act: 'awaykind', v: 'dates' });
    fill(A, { ...blank, awFrom: '2026-10-12', awTo: '2026-10-10' }); A.click({ act: 'awaysave' });
    check('dates the wrong way round are refused', A.lastToast(), 'The last day is before the first');
    fill(A, { ...blank, awFrom: '2026-10-12', awTo: '2026-10-19', awNote: 'Holiday' }); A.click({ act: 'awaysave' });
    const d = A.awayAll().find(r => r.kind === 'dates');
    check('dates away are saved', d.from + ' ' + d.to, '2026-10-12 2026-10-19');
    check('and taken off every day between', A.awaySpans(d, '2026-10-15').length, 1);

    const busy = A.busyItems(MON).filter(x => x.away);
    check('time off is a busy item of hers alone on the day', busy.length === 1 && busy[0].coaches.join(), 'jaz');
    as('boss'); A.sess.away = { jaz: { w: { id: 'w', kind: 'weekly', days: [0], by: 'jaz', at: 1 } } };
    const cs = A.clubClashesOn(MON);
    check('the planner says she is due at practice on her night off', cs.some(c => c.kind === 'away' && /^Jaz has time off \(Every Mon, all day\) but is due at G11 Flight: Practice at 5:30pm/.test(c.text)), true);
    check('and that the team has no coach left', cs.some(c => c.kind === 'nocoach' && /No coach for G11 Flight: Practice at 5:30pm: Jaz has time off/.test(c.text)), true);
    const ft = A.findTimes({ tids: ['t1'], len: 60, from: MON, days: 2, h0: '19:00', h1: '20:00', field: '', ran: true });
    check('find a time counts her busy on Mondays', ft.find(r => r.date === MON).why.join(), 'Jaz is busy');
    check('and free on Tuesday evening', ft.find(r => r.date === TUE).why.length, 0);
    A.ui.view = 'planner'; A.ui.planner = { tab: 'clash', days: 7 }; A.render();
    check('the clashes tab lists coaches\' time off', /Coaches' time off/.test(A.rendered()) && /<b>Jaz<\/b> · Every Mon/.test(A.rendered()), true);

    as('jaz');
    A.sess.away = { jaz: { w: { id: 'w', kind: 'weekly', days: [0], by: 'jaz', at: 1 } } };
    A.sess.avail = { b1: { id: 'b1', kind: 'one', cap: 1, coach: 'jaz', coachName: 'Jaz', date: MON, start: '09:00', end: '11:00', len: 60, slots: {}, seats: { s1: true } } };
    check('her bookable times on a Monday offer nothing', A.blockSlots(A.blockById('b1')).every(x => x.clash.length), true);
    A.click({ act: 'awayrm', id: 'w' });
    check('she removes it', A.awayAll().length, 0);
    A.sess.away = { kim: { k: { id: 'k', kind: 'weekly', days: [1], by: 'kim', at: 1 } } };
    A.click({ act: 'awayrm', id: 'k' });
    check('but never someone else\'s', A.lastToast() + ' ' + A.awayAll().length, 'That is not yours to remove 1');
  }

  console.log('\n--- calling out ---');
  {
    as('kim');
    A.click({ act: 'awayout', k: 'e:e1', tid: 't1', d: MON });
    check('a coach of another team cannot call out of this one', A.lastToast(), 'Only its own coach calls out of that');
    as('boss');
    A.click({ act: 'awayout', k: 'e:e1', tid: 't1', d: MON });
    check('nor an admin who doesn\'t coach it', A.lastToast(), 'Only its own coach calls out of that');

    as('jaz');
    A.click({ act: 'calitem', k: 'practice', tid: 't1', id: 'e1' });
    check('her practice offers "I can\'t make this"', /data-act="awayout" data-k="e:e1"/.test(sheet(A)), true);
    A.click({ act: 'awayout', k: 'e:e1', tid: 't1', d: MON });
    check('which asks for an optional note, and says families aren\'t told', /families aren't told/.test(sheet(A)), true);
    fill(A, { coNote: 'Work' });
    A.click({ act: 'awayoutgo', k: 'e:e1', tid: 't1', d: MON });
    const co = A.awayAll().find(r => r.kind === 'callout');
    check('the call-out is hers, about that entry', [co.uid, co.item, co.date, co.note].join(' '), 'jaz e:e1 2026-09-14 Work');
    check('nothing about the entry itself changed', JSON.stringify(A.state.teams.t1.events.e1), JSON.stringify(club().teams.t1.events.e1));
    A.click({ act: 'awayoutgo', k: 'e:e1', tid: 't1', d: MON });
    check('once only', A.lastToast(), 'You have already said');
    check('she is no longer due there', A.busyItems(MON).find(x => x.key === 'e:e1').coaches.length, 0);
    A.click({ act: 'calitem', k: 'practice', tid: 't1', id: 'e1' });
    check('the entry says so, and that nobody is left', /You can't make it \(Work\)/.test(sheet(A)) && /No coach left for it/.test(sheet(A)), true);
    check('and offers to take it back', /data-act="awayback"/.test(sheet(A)), true);
    A.ui.view = 'calendar'; A.render();
    check('the calendar row says it to her team', /no coach: all called out/.test(A.rendered()), true);

    const sv = A.sess.away;
    as('mum'); A.sess.away = sv; A.ui.view = 'calendar'; A.render();
    check('a parent\'s calendar says nothing of it', /called out|can't make/.test(A.rendered()), false);
    A.click({ act: 'calitem', k: 'practice', tid: 't1', id: 'e1' });
    check('nor the entry', /can't make/.test(sheet(A)), false);

    as('boss'); A.sess.away = sv;
    check('the planner calls it a practice with no coach', A.clubClashesOn(MON).some(c => c.kind === 'nocoach' && /Jaz called out/.test(c.text)), true);
    A.sess.away = { jaz: { c: { id: 'c', kind: 'callout', item: 'e:e3', tid: 't2', date: TUE, by: 'jaz', at: 1 } } };
    check('one of two coaches out is said, not a clash', A.clubClashesOn(TUE).some(c => c.kind === 'callout' && /Jaz called out of G13 Storm: Practice at 6pm; Kim still on/.test(c.text)), true);
    check('and frees her for the other team\'s practice at the same time', A.clubClashesOn(TUE).some(c => c.kind === 'coach'), false);

    as('jaz'); A.sess.away = sv;
    const id = A.awayAll()[0].id;
    A.click({ act: 'awayback', id });
    check('"I can make it after all" takes it back', A.calledOut('e:e1').length, 0);

    // her own session
    A.sess.sessions = { s1: { id: 's1', kind: 'one', title: '1-1', coach: 'jaz', coachName: 'Jaz', date: TUE, start: '09:00', end: '10:00', cap: 1 },
      s2: { id: 's2', kind: 'one', title: '1-1', coach: 'kim', coachName: 'Kim', date: TUE, start: '09:00', end: '10:00', cap: 1 } };
    A.click({ act: 'sessopen', id: 's1' });
    check('a session she runs offers it too', /data-act="awayout" data-k="s:s1"/.test(sheet(A)), true);
    A.click({ act: 'awayoutgo', k: 's:s2', tid: '', d: TUE });
    check('but not someone else\'s session', A.lastToast(), 'Only its own coach calls out of that');
    A.click({ act: 'awayoutgo', k: 's:s1', tid: '', d: TUE });
    check('out of her own', A.calledOut('s:s1').join(), 'jaz');
    check('and the session is not called off', !A.sess.sessions.s1.called, true);
  }

  console.log('\n--- an admin acts for a coach ---');
  {
    as('kim');
    A.click({ act: 'awaynew', u: 'jaz' });
    check('a coach cannot add another coach\'s time off', A.lastToast(), "Only an admin changes another coach's time off");
    A.click({ act: 'awayout', u: 'jaz', k: 'e:e1', tid: 't1', d: MON });
    check('nor call her off', A.lastToast(), "Only an admin changes another coach's time off");

    as('boss');
    A.click({ act: 'calitem', k: 'practice', tid: 't1', id: 'e1' });
    check('an admin can call the team\'s coach off', /data-act="awayout" data-u="jaz" data-k="e:e1"/.test(sheet(A)) && />Call Jaz off</.test(sheet(A)), true);
    A.click({ act: 'awayout', u: 'jaz', k: 'e:e1', tid: 't1', d: MON });
    check('asked first, by name', /Call Jaz off\?/.test(sheet(A)), true);
    fill(A, { coNote: 'Suspended' });
    A.click({ act: 'awayoutgo', u: 'jaz', k: 'e:e1', tid: 't1', d: MON });
    const r = A.awayAll().find(x => x.kind === 'callout');
    check('the call-out is the coach\'s, made by the admin', [r.uid, r.by, r.note].join(' '), 'jaz boss Suspended');
    check('written under her uid', Object.keys(A.sess.dirty).some(k => k.startsWith('away/jaz/')), true);
    A.click({ act: 'calitem', k: 'practice', tid: 't1', id: 'e1' });
    check('the entry says who called her off', /Jaz can't make it \(called off by you\)/.test(sheet(A)), true);
    check('and who is free to cover', /No coach left for it\.<\/b> Free then: Kim\./.test(sheet(A)), true);
    A.click({ act: 'awayout', u: 'kim', k: 'e:e1', tid: 't1', d: MON });
    check('but not a coach who doesn\'t coach it', A.lastToast(), "Kim doesn't coach that");
    A.click({ act: 'awayback', u: 'jaz', id: r.id });
    check('and puts her back on', A.calledOut('e:e1').length, 0);

    A.click({ act: 'awaynew', u: 'jaz' });
    check('time off for a coach says whose', /Time off for Jaz/.test(sheet(A)), true);
    A.click({ act: 'awaykind', v: 'dates' });
    fill(A, { ...blank, awFrom: TUE, awTo: TUE });
    A.click({ act: 'awaysave' });
    const t = A.awayAll().find(x => x.kind === 'dates');
    check('saved under her, by the admin', t.uid + ' ' + t.by, 'jaz boss');
    check('she is off on Tuesday', A.coachStatus('jaz', TUE, 18 * 60, 19 * 60).state, 'off');

    console.log('\n--- who is free then ---');
    A.sess.away = {};
    check('free when nothing is on', A.coachStatus('kim', MON, 9 * 60, 10 * 60).state, 'free');
    const b = A.coachStatus('jaz', TUE, 17 * 60 + 45, 18 * 60 + 15);
    check('busy says where', b.state + ' ' + b.why, 'busy G11 Flight: Practice at 5:30pm; G13 Storm: Practice at 6pm');
    deepEq('who is free at once', A.freeCoaches(MON, 9 * 60, 10 * 60), ['Jaz', 'Kim'].map(n => n.toLowerCase()));
    A.ui.view = 'planner'; A.ui.planner = { tab: 'coach', cw: { date: TUE, h0: '18:00', h1: '19:00' } }; A.render();
    const html = A.rendered();
    check('the Coaches tab lists every coach with where she is', /G13 Storm: Practice at 6pm/.test(html) && />Busy</.test(html), true);
    check('with a way to add time off for each', /data-act="awaynew" data-u="kim"/.test(html), true);
    A.state.access.teams.t2.coaches = { jaz: true };
    A.render();
    check('someone taken off every team is no longer a coach here', /Kim/.test(A.rendered().split('Time off')[0]), false);
    A.sess.away = { jaz: { c: { id: 'c', kind: 'callout', item: 'e:e1', tid: 't1', date: MON, by: 'jaz', at: 1 } } };
    A.state.access.teams.t2.coaches = { jaz: true, kim: true };
    const nc = A.clubClashesOn(MON).find(c => c.kind === 'nocoach');
    check('a practice with no coach names who could cover', /Free then: Kim$/.test(nc.text), true);
  }

  console.log('\n--- against the database ---');
  {
    for (const [who, wants] of [['mum', false], ['jaz', true], ['boss', true]]) {
      const fbk = makeFakebase();
      const D = H.loadApp({ firebase: fbk, config: CONFIG, storage: { 'sm.workspace': 'CLUB' } });
      await D.flush(); fbk.signIn(who, { name: who }); await D.flush(); fbk.deliver('workspaces/CLUB', club()); await D.flush();
      D.ui.view = 'mycal'; D.render(); await D.flush();
      check(who + (wants ? ': reads the coaches\' time off' : ': never asks for it'), fbk.readPaths().includes('training/CLUB/away'), wants);
      if (who !== 'jaz') continue;
      fbk.deliver('training/CLUB/away', { kim: { k: { id: 'k', kind: 'dates', from: TUE, to: TUE, by: 'kim', at: 1 } } }); await D.flush();
      check('another coach\'s arrives', D.awayAll().some(r => r.uid === 'kim'), true);
      D.click({ act: 'awaynew' }); D.click({ act: 'awayday', v: '2' });
      for (const [k, v] of Object.entries(blank)) D.dom.node('#' + k).value = v;
      D.click({ act: 'awaysave' }); await D.flush();
      const ws = fbk.record.writes.filter(w => w.path.startsWith('training/CLUB/away'));
      check('one record written, at away/{her uid}/{id}', ws.length === 1 && /^training\/CLUB\/away\/jaz\/[\w-]+$/.test(ws[0].path), true);
      check('acknowledged, it is no longer owed', Object.keys(D.sess.dirty).length, 0);
      fbk.deliver('training/CLUB/away', { kim: { k: { id: 'k', kind: 'dates', from: TUE, to: TUE, by: 'kim', at: 1 } } }); await D.flush();
      check('one gone from the club with nothing owed here was deleted there', D.awayAll().filter(r => r.uid === 'jaz').length, 0);
    }
  }

  H.summary('coaches\' time off');
})();
