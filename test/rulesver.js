/* Which version of the database rules is published, asked of the database.

   Rules that were never pasted look exactly like a coach with no signal:
   each feature says "saved on this phone only" on its own screen, and nobody
   learns why. rulesVersion accepts one number, the version the rules are, so
   an admin's phone writes the number this app was built for and the answer is
   the check: accepted, they match; refused, the number already there says
   whether the rules or this copy of the app is behind. Only admins are told,
   because they are the ones who can paste the rules, and nobody else's phone
   writes anything. */

const H = require('./harness');
const { check } = H;
const { makeFakebase } = require('./fakebase');

const CONFIG = { apiKey: 'k', databaseURL: 'https://prod.example', projectId: 'p' };
const CODE = 'CLUB';
const WS = 'workspaces/' + CODE;
const VERSION = Number(/const RULES_VERSION = (\d+);/.exec(require('fs').readFileSync(require('path').join(__dirname, '..', 'app.js'), 'utf8'))[1]);

const club = () => ({
  teams: { t1: { id: 't1', name: 'G11 Flight', players: { p1: { id: 'p1', name: 'Rosa Smith', number: '9', active: true } } } },
  matches: {},
  access: {
    admins: { boss: true }, index: { boss: true, jaz: true },
    members: { boss: { name: 'Ada' }, jaz: { name: 'Jaz' } },
    teams: { t1: { coaches: { jaz: true } } }, coachIndex: { jaz: 't1' }
  }
});

async function device(uid, published) {
  const fbk = makeFakebase();
  // the published rules, as far as this one node goes: one number is accepted
  if (published !== undefined) fbk.refuseWrites(p => p === 'rulesVersion' && published !== VERSION);
  const D = H.loadApp({ firebase: fbk, config: CONFIG, storage: { 'sm.workspace': CODE } });
  await D.flush();
  fbk.signIn(uid, { name: (club().access.members[uid] || {}).name }); await D.flush();
  await fbk.serveClub(CODE, club(), D.flush); await D.flush();
  fbk.deliver('.info/connected', true); await D.flush();
  D.render(); await D.flush();
  return { D, fbk, app: () => String(D.dom.node('#app').innerHTML || '') };
}

(async () => {
  console.log('--- the rules match ---');
  {
    const { D, fbk, app } = await device('boss', VERSION);
    check('an admin\'s phone writes the version it was built for', fbk.writtenTo('rulesVersion').map(w => w.value).join(), String(VERSION));
    check('and says nothing when it is accepted', /database rules are out of date|older than the club/.test(app()), false);
    D.render(); await D.flush();
    check('it asks once, not on every draw', fbk.writtenTo('rulesVersion').length, 1);
  }

  console.log('\n--- the rules are older than the app ---');
  {
    const { D, fbk, app } = await device('boss', VERSION - 1);
    fbk.deliver('rulesVersion', VERSION - 1); await D.flush();
    check('the admin is told on every screen', /database rules are out of date/.test(app()), true);
    check('with the version this app needs', new RegExp('needs version ' + VERSION).test(app()), true);
    D.ui.view = 'admin'; D.render(); await D.flush();
    check('Check readiness has a cross for it', /older than version \d+ — paste database\.rules\.json/.test(app()), true);
  }
  {
    // rules that predate the check: no write, and no read either
    const { D, fbk, app } = await device('boss', 0);
    fbk.refuse('rulesVersion'); await D.flush();
    check('rules from before the check count as older', /database rules are out of date/.test(app()), true);
  }

  console.log('\n--- the app is older than the rules ---');
  {
    const { D, fbk, app } = await device('boss', VERSION + 1);
    fbk.deliver('rulesVersion', VERSION + 1); await D.flush();
    check('the admin is told to reload instead', /older than the club's database rules/.test(app()), true);
    check('and not to paste anything', /database rules are out of date/.test(app()), false);
  }

  console.log('\n--- nobody else is asked ---');
  {
    const { fbk, app } = await device('jaz', VERSION - 1);
    check('a coach\'s phone writes nothing', fbk.writtenTo('rulesVersion').length + (fbk.record.held || []).length, 0);
    check('and shows nothing', /database rules are out of date/.test(app()), false);
  }
  {
    const fbk = makeFakebase();
    const D = H.loadApp({ firebase: fbk, config: CONFIG, storage: { 'sm.workspace': CODE } });
    await D.flush();
    fbk.signIn('boss', { name: 'Ada' }); await D.flush();
    await fbk.serveClub(CODE, club(), D.flush); await D.flush();
    D.render(); await D.flush();
    check('an admin with no signal does not ask yet', fbk.writtenTo('rulesVersion').length, 0);
  }

  H.summary('the published rules\' version');
})();
