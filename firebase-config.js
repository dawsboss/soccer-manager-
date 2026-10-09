// Paste the config object from your Firebase project here, then commit this file.
// Firebase console > Project settings > Your apps > Web app > SDK setup and configuration.
//
// Leave the values blank to run the app entirely on this device (no sync).
// These keys are not secrets — access is controlled by your Realtime Database rules.
// See README.md for the rules to paste in.

window.SOCCER_FIREBASE_CONFIG = {
  apiKey: "AIzaSyCMrbnc2CykdkUKWtdhYb3POemqYeq1_pw",
  authDomain: "soccer-manager-272ff.firebaseapp.com",
  databaseURL: "https://soccer-manager-272ff-default-rtdb.firebaseio.com",
  projectId: "soccer-manager-272ff",
  storageBucket: "soccer-manager-272ff.firebasestorage.app",
  messagingSenderId: "915056212579",
  appId: "1:915056212579:web:992553ba48f34cc0849656",
  measurementId: "G-9C7RFNTDL0"
};

// Where the calendar feed is served, so families can subscribe and their
// calendars follow every change: the `calendar` function in functions/, on this
// project (README, "Calendar sync"). Answers once the functions are deployed;
// blank, and the calendar offers a one-off copy instead.
window.SOCCER_CALENDAR_FEED = 'https://us-central1-soccer-manager-272ff.cloudfunctions.net/calendar';

// Optional: more ways to sign in. Each has to be switched on first in the Firebase
// console (Authentication > Sign-in method; README, "Sign-in methods"), and only
// what is listed here gets a button. Known: 'google', 'apple', 'microsoft'.
// Email, as a link or a password, is always offered. Left out, it is Google alone.
window.SOCCER_SIGNIN = ['google'];

// Optional: notifications to a closed phone. The public half of the project's web
// push key pair: Firebase console > Project settings > Cloud Messaging > Web Push
// certificates > Generate key pair, and copy the key it shows. Not a secret. Set it
// only once the functions are deployed (README, "Notifications to a closed phone"):
// the app offers notifications whenever it is filled in, and without the server
// nothing would ever be sent. Blank, and nothing about them is offered.
window.SOCCER_PUSH_KEY = 'BBzBzLZqwAdX3Ih8A2NFjUjR_mpE4ouH1vB7udcINm1fHfngTJbPOjMYyZv3KjxdXfhROU44kkJvfWJ4E2GHc98';

// Optional: the club's server (functions/) is deployed on this project (README,
// "Deploying the server"). Joining by invite, starting a club and a bulk import
// then ask it first, and are done on the phone, as before, only where it cannot
// be asked. Leave it out where the functions are not deployed.
window.SOCCER_SERVER = true;

// Optional: other databases to point this app at, for trying auth and rules
// changes somewhere that is not the club with this season's data in it.
//
// A test *club* (Setup > Workspace > Make a test club) isolates data but not
// rules: rules belong to a database instance, and database.rules.json is
// written against workspaces/$code, so publishing it to try it on a test club
// applies it to the real club at the same moment. A child rule can only ever
// add permission, never take it back, so there is no carving a stricter
// sandbox out of an open wildcard either. A second database is what isolates
// them.
//
// An entry overrides only the keys it names. A second Realtime Database in the
// same project needs a databaseURL and nothing else, and keeps the same Auth,
// so accounts and uids carry over. A separate Firebase project needs the whole
// config object, and has its own Auth — different uids, so appOwners has to be
// set again in that project's console and everyone signs in afresh.
//
// Leave this out entirely and the app simply runs against production.
//
// window.SOCCER_FIREBASE_ENVS = {
//   sandbox: { databaseURL: "https://soccer-manager-272ff-sandbox.firebaseio.com" }
// };
