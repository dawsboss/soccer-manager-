/* Who is coming: a parent answers for her own child, a coach for anyone.

   This is the first thing in the app a parent writes, so what matters, in the
   order it would hurt:

   - She answers for her own children and nobody else's, checked in the click
     handler and not only by which chips are drawn. (The rule says the same;
     rules.js pins it.)
   - The answer is written at rsvp/{tid}/{item}/{pid} and nowhere else: never
     the game, never the team — so a coach saving a game cannot wipe it, and a
     parent's write cannot touch either.
   - A refused write does not stick on screen. A parent who taps Going and sees
     it hold, when the database said no, is worse off than one with no button.
   - Answers are about named children, so none of them — not even a count —
     reach the share link or the calendar feed.
   - The coach sees names and who has not answered; a parent sees her own
     child and a count; a tracker sees a count. */

const H = require('./harness');
const { check, deepEq } = H;

/* Gated, with a Firebase config (see visibility.js), and booted on the fake
   Firebase so the app's own start-up waits quietly for a sign-in that never
   comes, while the writes below go to a recorder the test can refuse. */
const { makeFakebase } = require('./fakebase');
const A = H.loadApp({ firebase: makeFakebase(), config: { apiKey: 'k', databaseURL: 'https://x.test' } });
const at = (d, hhmm) => { const [y, m, dd] = d.split('-').map(Number); const [h, mi] = hhmm.split(':').map(Number); return new Date(y, m - 1, dd, h, mi).getTime(); };

let sets = [], refuse = false;
function setup() {
  H.clock.set(at('2026-09-12', '10:00'));
  A.state = {
    teams: {
      t1: {
        id: 't1', name: 'G14 Flight', share: 'sh_flight', calFeed: 'c_feed',
        players: {
          p1: { id: 'p1', name: 'Ella Fitzgerald', number: '7', guardians: { mumU: true } },
          p2: { id: 'p2', name: 'Rosa Delgado', number: '4', guardians: { dadU: true } },
          p3: { id: 'p3', name: 'Jo Nakamura', number: '9' },
          p4: { id: 'p4', name: 'Sam Okoro', number: '2', active: false }
        },
        events: {
          e1: { id: 'e1', kind: 'practice', title: 'Practice', date: '2026-09-15', start: '18:00', end: '19:15' },
          e0: { id: 'e0', kind: 'practice', title: 'Practice', date: '2026-09-08', start: '18:00', end: '19:15' },
          ex: { id: 'ex', kind: 'event', title: 'Team photo', date: '2026-09-16', called: 'cancelled' }
        }
      }
    },
    matches: {
      g1: { id: 'g1', teamId: 't1', opponent: 'Northgate', date: '2026-09-19', kickoff: '09:30', periodCount: 2, periodMinutes: 40, currentHalf: 1, periods: {}, stints: {} }
    },
    access: {
      admins: { bossU: true },
      teams: { t1: { coaches: { coachU: true }, trackers: { trkU: true } } },
      index: { bossU: true, coachU: true, trkU: true, mumU: true, dadU: true },
      members: { dadU: { name: 'Rosa\'s dad' } }
    },
    rsvp: {}
  };
  A.ui.teamId = 't1'; A.ui.view = 'calendar'; A.ui.matchId = null; A.ui.calAll = false;
  sets = []; refuse = false; A.toasts.length = 0;
  A.fb = {
    db: {}, base: 'workspaces/CLUB', ref: (db, path) => path,
    set: (path, v) => { sets.push([path, v]); return refuse ? Promise.reject({ code: 'PERMISSION_DENIED' }) : Promise.resolve(); },
    remove: () => Promise.resolve()
  };
}
const as = uid => { A.me = uid ? { uid, name: uid } : null; };
const html = () => { A.render(); return A.rendered(); };
const sheet = () => String(A.dom.node('#sheet').innerHTML || '');
const answer = (pid, v, item = 'e_e1', extra = {}) => A.click({ act: 'rsvp', tid: 't1', k: item, pid, v, kind: item[0] === 'g' ? 'game' : 'practice', id: item.slice(2), ...extra });
const rsvpWrites = () => sets.filter(([p]) => /\/rsvp\//.test(p));
const otherWrites = () => sets.filter(([p]) => p.startsWith('workspaces/') && !/\/rsvp\//.test(p));
const ans = (pid, item = 'e_e1') => ((((A.state.rsvp || {}).t1 || {})[item] || {})[pid]) || null;

console.log('--- a parent, for her own child ---');
{
  setup(); as('mumU');
  let h = html();
  check('the calendar row says she has not answered', /Ella: not answered/.test(h), true);
  check('Next up asks her', /Is Ella going\?/.test(h), true);
  check('and never names another child', /Rosa|Jo Nakamura/.test(h), false);

  answer('p1', 'yes');
  check('her answer is kept', ans('p1') && ans('p1').v, 'yes');
  check('stamped as her', ans('p1').by, 'mumU');
  deepEq('written once, at rsvp/{tid}/{item}/{pid}', rsvpWrites().map(([p]) => p), ['workspaces/CLUB/rsvp/t1/e_e1/p1']);
  check('and nothing else in the club is written', otherWrites().length, 0);
  check('the row says so now', /Ella: going/.test(html()), true);

  answer('p1', 'no');
  check('a new answer replaces it', ans('p1').v, 'no');
  answer('p1', 'no');
  check('the same answer again takes it back', ans('p1'), null);
  check('— as a delete, not an empty answer', rsvpWrites().pop()[1], null);

  sets = []; A.toasts.length = 0;
  answer('p2', 'yes');
  check('not for somebody else\'s child', ans('p2'), null);
  check('nothing written', rsvpWrites().length, 0);
  check('and she is told', A.lastToast(), 'Only that player’s family or coach can answer for her');

  answer('p1', 'maybe');
  A.click({ act: 'calitem', k: 'practice', tid: 't1', id: 'e1' });
  check('her sheet asks about her child', /Is Ella going\?/.test(sheet()), true);
  check('and has room for a note once she has answered', /id="rsvpNote_p1"/.test(sheet()), true);
  check('it shows how many are going, not who', /going so far/.test(sheet()) && !/Rosa|Nakamura/.test(sheet()), true);
  A.dom.node('#rsvpNote_p1').value = '  Arriving late, after school pickup ' + 'x'.repeat(200);
  A.click({ act: 'rsvpnote', tid: 't1', k: 'e_e1', pid: 'p1', kind: 'practice', id: 'e1' });
  check('the note is kept with the answer', ans('p1').v + ' / ' + ans('p1').note.slice(0, 34), 'maybe / Arriving late, after school pickup');
  check('no longer than a text', ans('p1').note.length, 140);
  answer('p1', 'yes');
  check('changing the answer keeps the note', /Arriving late/.test(ans('p1').note), true);

  A.click({ act: 'calitem', k: 'practice', tid: 't1', id: 'e0' });
  check('something already over is not asked about', /rsvpchips/.test(sheet()), false);
  A.click({ act: 'calitem', k: 'event', tid: 't1', id: 'ex' });
  check('nor something called off', /rsvpchips/.test(sheet()), false);

  A.ui.view = 'mine';
  check('My players: the answer beside what is next', /Next — Practice[\s\S]*?Going/.test(html()), true);
}

console.log('--- a refused write does not stick ---');
{
  setup(); as('mumU');
  refuse = true;
  answer('p1', 'yes');
  check('shown at once', ans('p1') && ans('p1').v, 'yes');
  return H.flush().then(() => {
    check('taken back when the database says no', ans('p1'), null);
    check('and she is told why', /rules need the rsvp block/.test(A.lastToast()), true);
    // taken back off the screen, it must not come back from the outbox on the next connect
    check('and out of the outbox, so it does not come back', Object.keys(A.pending.w).some(p => p.startsWith('rsvp/')), false);
    rest();
  });
}

function rest() {
  console.log('--- the coach ---');
  {
    setup(); as('dadU'); answer('p2', 'no', 'g_g1');
    A.state.rsvp.t1.g_g1.p2.note = 'Away at Gran’s';
    as('mumU'); answer('p1', 'yes', 'g_g1');
    as('coachU');
    const h = html();
    check('the row counts the answers', /1 going · 1 not · 1 to answer/.test(h), true);
    check('a player off the roster is not counted', /2 to answer/.test(h), false);
    A.click({ act: 'calitem', k: 'game', tid: 't1', id: 'g1' });
    const s = sheet();
    check('the sheet names everyone', /Ella Fitzgerald/.test(s) && /Rosa Delgado/.test(s) && /Jo Nakamura/.test(s), true);
    check('who has not answered comes first — the one to chase', s.indexOf('Jo Nakamura') < s.indexOf('Rosa Delgado') && s.indexOf('Rosa Delgado') < s.indexOf('Ella Fitzgerald'), true);
    check('with who said it, and the note', /Not going · said by Rosa&#39;s dad · Away at Gran/.test(s), true);
    sets = [];
    answer('p3', 'yes', 'g_g1', { from: 'sheet' });
    check('she answers for a family that told her another way', ans('p3', 'g_g1').v + ' by ' + ans('p3', 'g_g1').by, 'yes by coachU');
    check('— redrawing the sheet with it', /Jo Nakamura<span class="rowsub">Going/.test(sheet()), true);

  }

  console.log('--- the plan works from who is coming ---');
  {
    setup();
    const g1 = () => A.state.matches.g1;
    const sq = () => A.squad(A.state.teams.t1, g1()).map(p => p.id).join(',');
    check('nobody has answered: everyone on the roster is planned for', sq(), 'p2,p1,p3');
    as('dadU'); sets = []; answer('p2', 'no', 'g_g1');
    check('a family\'s "not going" leaves her out of the plan', sq(), 'p1,p3');
    check('— with no write to the game: the parent cannot make one', sets.filter(([p]) => /\/matches\//.test(p)).length, 0);
    check('the AI prompt and the Subs tab count her out too', A.outIds(A.state.teams.t1, g1()).join(), 'p2');
    answer('p2', 'yes', 'g_g1');
    check('the family changes its mind: back in, by itself', sq(), 'p2,p1,p3');
    answer('p2', 'no', 'g_g1');

    as('coachU');
    A.ui.view = 'game'; A.ui.gameView = 'plan'; A.ui.matchId = 'g1';
    let h = html();
    check('Plan says who is coming', /Who is coming[\s\S]*?2 to plan for · 1 out/.test(h), true);
    check('who is out, and that the family said so', /Out:<\/b> Rosa Delgado <span class="muted">\(family said\)/.test(h), true);
    check('and who has not answered', /Not answered:<\/b> Ella Fitzgerald, Jo Nakamura/.test(h), true);
    A.click({ act: 'availability' });
    check('availability says why she is out', /Rosa Delgado<span class="rowsub">Not going · Away at Gran|Rosa Delgado<span class="rowsub">Not going/.test(sheet()), true);

    sets = [];
    A.click({ act: 'toggleout', pid: 'p2' });
    check('the coach can have her play anyway', A.squad(A.state.teams.t1, g1()).some(p => p.id === 'p2'), true);
    check('— written as the coach\'s own word, false', g1().out.p2, false);
    check('— which the sheet explains', /Family said not going — you have her playing/.test(sheet()), true);
    as('dadU'); answer('p2', 'maybe', 'g_g1'); answer('p2', 'no', 'g_g1');
    check('a later answer does not undo the coach\'s decision', sq().includes('p2'), true);
    as('coachU');
    A.click({ act: 'toggleout', pid: 'p2' });
    check('agreeing with the family again leaves nothing behind', g1().out && 'p2' in g1().out, false);
    check('— and she is out, on the family\'s word', sq().includes('p2'), false);

    A.click({ act: 'toggleout', pid: 'p3' });
    check('a coach can still mark out someone whose family said nothing', g1().out.p3, true);
    as('mumU'); sets = []; A.toasts.length = 0;
    A.click({ act: 'toggleout', pid: 'p1' });
    check('a parent cannot', sets.some(([p]) => /\/out\//.test(p)) || (g1().out || {}).p1 !== undefined, false);
    as('coachU');

    /* Once the game has started the answers are closed, and the bench is what
       it was at kick-off: a "not going" that turned up anyway is the coach's
       one tap, as it always was. */
    g1().periods = { 0: { half: 1, start: H.clock.t - 60000 } };
    check('kicked off: the "no" still reads as out', sq().includes('p2'), false);
    as('mumU'); A.ui.view = 'calendar';
    // the game being played is on top, live; "next" is whatever comes after it, and that may still ask
    check('and her parent is not asked any more', /data-act="rsvp"[^>]*data-k="g_g1"/.test(html()), false);
    check('— it is on top, being played', /class="card callive"[^>]*data-id="g1"/.test(html()), true);
  }

  console.log('--- a tracker ---');
  {
    setup(); as('mumU'); answer('p1', 'yes');
    as('trkU');
    A.click({ act: 'calitem', k: 'practice', tid: 't1', id: 'e1' });
    check('sees how many', /1 going/.test(sheet()), true);
    check('not who', /Ella|Rosa|Jo Nakamura/.test(sheet()), false);
    sets = [];
    answer('p3', 'yes');
    check('and cannot answer for anyone', ans('p3') === null && rsvpWrites().length === 0, true);
  }

  console.log('--- none of it leaves the club ---');
  {
    setup(); as('mumU');
    answer('p1', 'no');
    A.click({ act: 'rsvpnote', tid: 't1', k: 'e_e1', pid: 'p1', kind: 'practice', id: 'e1' });
    A.state.rsvp.t1.e_e1.p1.note = 'Ella has a cold';
    const t = A.state.teams.t1;
    const out = JSON.stringify([A.publicDoc(t), A.calendarDoc(t), A.fixtureDoc(t, A.state.matches.g1)]);
    check('no answers on the share link, the game page or the feed', /rsvp|"yes"|"no"|cold|going/i.test(out), false);
  }

  console.log('--- answers survive a reload, and are never replayed ---');
  {
    setup(); as('mumU'); answer('p1', 'yes');
    A.saveLocal();
    A.state = { teams: {}, matches: {}, access: {} };
    A.loadLocal();
    check('kept in this device\'s copy', ans('p1') && ans('p1').v, 'yes');
    sets = [];
    A.pushAll();
    check('a first push does not replay other people\'s answers', rsvpWrites().length, 0);
  }

  H.summary('who is coming');
}
