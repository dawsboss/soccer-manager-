/* The ways in: Google, Apple, Microsoft, a link to her email, a password.

   Each company's button works only once the club has switched that method on
   in the Firebase console, and one that isn't fails with a code nobody at a
   sideline can read, so the sheet draws only what firebase-config.js lists.
   The part that matters most is the account, not the button: with "one
   account per email address" on, a parent who joined with a link and later
   taps Apple is refused instead of being given a second account with no
   club in it. This pins that she is told how to get back in, and that the
   new way is then added to the account she already has, never to another
   one. Driven against the fake Firebase. */

const H = require('./harness');
const { check, deepEq } = H;
const { makeFakebase } = require('./fakebase');

const CONFIG = { apiKey: 'k', databaseURL: 'https://prod.example', projectId: 'p' };

async function boot(opts = {}) {
  const fbk = makeFakebase();
  const A = H.loadApp({ firebase: fbk, config: CONFIG, storage: opts.storage || {}, search: opts.search,
    window: opts.signin === undefined ? {} : { SOCCER_SIGNIN: opts.signin } });
  await A.flush();
  return { A, fbk };
}
const sheet = A => A.rendered('#sheet');
const calls = (fbk, fn) => fbk.record.auth.filter(x => x.fn === fn);
const exists = (provider, email) => ({ code: 'auth/account-exists-with-different-credential', customData: { email, providerId: provider }, _cred: { providerId: provider, token: 'tok-' + provider } });

(async () => {

  console.log('--- which buttons are drawn ---');
  {
    const { A, fbk } = await boot();
    fbk.signOut(); await A.flush();
    A.click({ act: 'signinsheet' });
    check('nothing listed: Google alone, as before', /Continue with Google/.test(sheet(A)) && !/Apple|Microsoft/.test(sheet(A)), true);
    check('email is always offered, a link first', /signin-link/.test(sheet(A)) && /data-act="signin-mode" data-v="pass"/.test(sheet(A)), true);
    A.dom.node('#authEmail').value = 'jo@x.test';
    A.click({ act: 'signin-mode', v: 'pass' });
    check('or a password', /signin-pass/.test(sheet(A)) && /signup-pass/.test(sheet(A)), true);
    check('the email typed is kept across the switch', /value="jo@x\.test"/.test(sheet(A)), true);
    check('and a way back from a forgotten password', /signin-reset/.test(sheet(A)), true);
    A.click({ act: 'signin-mode', v: 'link' });
  }
  {
    const { A, fbk } = await boot({ signin: ['google', 'apple', 'Microsoft', 'apple', 'facebook'] });
    fbk.signOut(); await A.flush();
    A.click({ act: 'signinsheet' });
    const s = sheet(A);
    check('each switched-on company is a button', ['Google', 'Apple', 'Microsoft'].every(x => s.includes('Continue with ' + x)), true);
    check('in the order listed, once each', s.indexOf('with Google') < s.indexOf('with Apple') && s.indexOf('with Apple') < s.indexOf('with Microsoft') && s.split('with Apple').length === 2, true);
    check('one the app doesn\'t know is left out', /facebook/i.test(s), false);
  }
  {
    const { A, fbk } = await boot({ signin: ['apple'] });
    fbk.signOut(); await A.flush();
    A.click({ act: 'signinsheet' });
    check('a club may leave Google out', /Google/.test(sheet(A)), false);
    A.click({ act: 'signin-oauth', v: 'google' }); await A.flush();
    check('and a tap that names it anyway does nothing', calls(fbk, 'popup').length, 0);
  }

  console.log('\n--- signing in with each ---');
  {
    const { A, fbk } = await boot({ signin: ['google', 'apple', 'microsoft'] });
    fbk.signOut(); await A.flush();
    A.click({ act: 'signin-oauth', v: 'apple' }); await A.flush();
    const ap = calls(fbk, 'popup')[0] || {};
    check('Apple, by its own provider', ap.provider, 'apple.com');
    deepEq('asking for the email and name', ap.scopes, ['email', 'name']);
    A.click({ act: 'signin-oauth', v: 'microsoft' }); await A.flush();
    const ms = calls(fbk, 'popup')[1] || {};
    check('Microsoft, by its own provider', ms.provider, 'microsoft.com');
    check('asking which account, so a shared laptop\'s is not taken silently', (ms.params || {}).prompt, 'select_account');
    A.click({ act: 'signin-oauth', v: 'google' }); await A.flush();
    check('Google as before', (calls(fbk, 'popup')[2] || {}).provider, 'google.com');

    fbk.record.popupFail = { code: 'auth/popup-blocked' };
    A.click({ act: 'signin-oauth', v: 'apple' }); await A.flush();
    check('a blocked popup goes by redirect', (calls(fbk, 'redirect')[0] || {}).provider, 'apple.com');
    const before = A.toasts.length;
    fbk.record.popupFail = { code: 'auth/popup-closed-by-user' };
    A.click({ act: 'signin-oauth', v: 'apple' }); await A.flush();
    check('closing the popup is not an error to her', A.toasts.length, before);
    fbk.record.popupFail = { code: 'auth/operation-not-allowed' };
    A.click({ act: 'signin-oauth', v: 'microsoft' }); await A.flush();
    check('a method not switched on in Firebase says so', /not switched on in Firebase/.test(A.lastToast()), true);
  }

  console.log('\n--- an email that already has an account ---');
  {
    const { A, fbk } = await boot({ signin: ['google', 'apple'] });
    fbk.signOut(); await A.flush();
    fbk.record.popupFail = exists('apple.com', 'jo@x.test');
    A.click({ act: 'signin-oauth', v: 'apple' }); await A.flush();
    check('she is told the email has an account', /jo@x\.test<\/b> already has an account/.test(sheet(A)), true);
    check('and how to get in', /Sign in the way you did before/.test(sheet(A)) && /Apple will be added/.test(sheet(A)), true);
    check('the email box is filled in for her', /value="jo@x\.test"/.test(sheet(A)), true);
    check('nothing linked yet', calls(fbk, 'link').length, 0);

    fbk.signIn('jo', { name: 'Jo', email: 'Jo@x.test' }); await A.flush();
    const l = calls(fbk, 'link');
    check('signing in the old way adds Apple to her account', l.length === 1 && l[0].uid === 'jo' && l[0].cred.providerId === 'apple.com', true);
    check('and says so', /Apple added/.test(A.lastToast()), true);
    fbk.signOut(); await A.flush(); fbk.signIn('jo', { email: 'jo@x.test' }); await A.flush();
    check('once', calls(fbk, 'link').length, 1);
  }
  {
    const { A, fbk } = await boot({ signin: ['microsoft'] });
    fbk.signOut(); await A.flush();
    fbk.record.popupFail = exists('microsoft.com', 'jo@x.test');
    A.click({ act: 'signin-oauth', v: 'microsoft' }); await A.flush();
    fbk.signIn('sam', { email: 'sam@x.test' }); await A.flush();
    check('never added to an account with another email', calls(fbk, 'link').length, 0);
    fbk.signOut(); await A.flush(); fbk.signIn('jo', { email: 'jo@x.test' }); await A.flush();
    check('and forgotten, not carried to whoever is next', calls(fbk, 'link').length, 0);
  }
  {
    const fbk = makeFakebase();
    fbk.record.redirectFail = exists('apple.com', 'jo@x.test');
    const A = H.loadApp({ firebase: fbk, config: CONFIG, window: { SOCCER_SIGNIN: ['apple'] } });
    await A.flush();
    check('the same, back from a redirect', /jo@x\.test<\/b> already has an account/.test(sheet(A)), true);
  }

  console.log('\n--- her account ---');
  {
    const { A, fbk } = await boot({ signin: ['google', 'apple', 'microsoft'] });
    fbk.signIn('jo', { name: 'Jo', email: 'jo@x.test', providers: ['password', 'google.com'] }); await A.flush();
    A.click({ act: 'signinsheet' });
    const s = sheet(A);
    check('lists the ways she signs in', /Email \(a link or a password\)/.test(s) && /<span>Google<\/span><span class="auth-tick"/.test(s), true);
    check('offers to add the others', /Add Apple/.test(s) && /Add Microsoft/.test(s) && !/Add Google/.test(s), true);
    A.click({ act: 'signin-add', v: 'microsoft' }); await A.flush();
    const lp = calls(fbk, 'linkPopup')[0] || {};
    check('adding one links it to this account', lp.provider === 'microsoft.com' && lp.uid === 'jo', true);
    check('and it is then listed', /<span>Microsoft<\/span><span class="auth-tick"/.test(sheet(A)) && !/Add Microsoft/.test(sheet(A)), true);
    fbk.record.popupFail = { code: 'auth/credential-already-in-use' };
    A.click({ act: 'signin-add', v: 'apple' }); await A.flush();
    check('one that is someone else\'s account is refused in words', /already signs in to a different account/.test(A.lastToast()), true);

    A.dom.node('#acctName').value = '  Joanna  ';
    A.click({ act: 'savename' }); await A.flush();
    check('her name is saved to her account', ((calls(fbk, 'updateProfile')[0] || {}).p || {}).displayName, 'Joanna');
    check('and used from now on', A.me.name, 'Joanna');
  }
  {
    const { A, fbk } = await boot({ signin: ['apple'] });
    fbk.signIn('ap', { name: '', email: 'x7k2@privaterelay.appleid.com', providers: ['apple.com'] }); await A.flush();
    check('Apple\'s hidden address is not made into her name', A.me.name, 'Signed in');
    A.click({ act: 'signinsheet' });
    check('and she is told what hiding it means for an invite', /Apple is hiding your email/.test(sheet(A)), true);
  }

  console.log('\n--- a forgotten password ---');
  {
    const { A, fbk } = await boot();
    fbk.signOut(); await A.flush();
    A.click({ act: 'signinsheet' });
    A.dom.node('#authEmail').value = '';
    A.click({ act: 'signin-reset' }); await A.flush();
    check('asks for the email first', calls(fbk, 'reset').length === 0 && /Enter your email/.test(A.lastToast()), true);
    A.dom.node('#authEmail').value = ' jo@x.test ';
    A.click({ act: 'signin-reset' }); await A.flush();
    check('sends the reset to it', (calls(fbk, 'reset')[0] || {}).email, 'jo@x.test');
    check('without saying whether it has an account', /If that email has a password here/.test(A.lastToast()), true);
  }

  console.log('\n--- an invite for one address ---');
  {
    const ID = 'iabc123';
    const { A, fbk } = await boot({ search: '?invite=' + ID });
    fbk.signIn('ms', { name: 'Mo', email: 'mo@x.test', verified: false, providers: ['microsoft.com'] }); await A.flush();
    fbk.deliver('invites/' + ID, { ws: 'CLUB', team: 't1', teamName: 'Flight', role: 'coach', clubName: 'Lakeside SC', email: 'mo@x.test', by: 'adm', at: A.nowMs(), expiresAt: A.nowMs() + 864e5 });
    await A.flush();
    check('an address the sign-in never confirmed is not offered Accept', /data-act="inviteaccept"/.test(A.rendered()), false);
    check('she is told to use a link to it instead', /has not confirmed that address/.test(A.rendered()), true);
  }
  {
    const ID = 'iabc124';
    const { A, fbk } = await boot({ search: '?invite=' + ID });
    fbk.signIn('ap', { email: 'x7k2@privaterelay.appleid.com', providers: ['apple.com'] }); await A.flush();
    fbk.deliver('invites/' + ID, { ws: 'CLUB', team: 't1', teamName: 'Flight', role: 'parent', playerNo: '7', clubName: 'Lakeside SC', email: 'jo@x.test', by: 'adm', at: A.nowMs(), expiresAt: A.nowMs() + 864e5 });
    await A.flush();
    check('Apple hiding her address is explained on the wrong-email screen', /Apple is hiding your address/.test(A.rendered()), true);
  }

  H.summary('signin');
})();
