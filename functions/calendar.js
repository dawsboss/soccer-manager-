/* The calendar feed: what a phone's calendar subscribes to.

   A calendar app (Apple, Google, Outlook) subscribes to an address and comes
   back to it on its own schedule, from its own servers, never running any of
   the app's JavaScript, so the static site cannot answer it and this does. It
   was a Cloudflare Worker (worker/calendar.mjs) until build 104; it moved here
   so a club runs one server, deployed one way, rather than two.

   What it may read has not changed: one node of public/, the same document the
   share pages read, named by an id that is checked before anything is asked
   for. It runs with admin credentials now, so that check is the whole wall
   between a feed address and the club's data: the only path this file ever
   builds is `public/` + an id of letters, digits, _ and -. It writes nothing.

     /{id}.ics   a season link's id     games, and entries marked for the share link
                 a game's own id        that game
                 a calendar-feed id     every game and entry: the members' feed
                 a My calendar id       one person's calendar, across teams and
                                        clubs, already titled and with no names

   Like push.js it imports nothing from Firebase: index.js hands it `get`, and
   test/calfeed.js the fake one. ics.js is the app's own, copied beside it by
   `node functions/make.js` because only functions/ is uploaded. */

const ICS = require('./ics.js');

// what the app makes: a letter and two uid()s. Anything else is never fetched.
const ID = /^[A-Za-z0-9_-]{6,80}$/;
/* Asked of the calendar app: come back hourly. Apple and Outlook roughly do;
   Google keeps its own slower schedule whatever this says, and nothing a feed
   can say makes any of them come back sooner. */
const REFRESH_MIN = 60;

const say = (status, msg) => ({ status, headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: msg + '\n' });

async function serve(req, env) {
  const method = String(req.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return say(405, 'Method not allowed');
  const path = /^\/([^/]+?)(?:\.ics)?$/.exec(String(req.path || ''));
  if (!path || !ID.test(path[1])) return say(404, 'No such calendar');
  const id = path[1];

  let doc;
  try { doc = await env.get('public/' + id); } catch (e) { return say(502, 'Could not reach the calendar'); }
  // a link that was replaced, or a game that was deleted, is simply gone
  if (!doc || typeof doc !== 'object' || !doc.team) return say(404, 'No such calendar');

  /* Where each entry links back to. My calendar's feed and the members' feed
     open the app, where signing in decides what anyone sees; a share-link feed
     opens the share page it came from. */
  const app = String((doc.link && doc.link.app) || '');
  const site = app.replace(/[^/]*$/, '');
  const tid = encodeURIComponent(String((doc.link && doc.link.teamId) || ''));
  const back = (kind, x) => !/^https?:\/\//.test(site) ? ''
    : doc.mine ? `${app}#/my-calendar`
    : doc.calendar ? (kind === 'game' ? `${app}#/team/${tid}/game/${encodeURIComponent(x)}/live` : `${app}#/team/${tid}/calendar`)
      : doc.fixture ? `${site}game.html?t=${id}&g=${encodeURIComponent(x)}`
        : `${site}live.html?t=${id}#${kind === 'game' ? 'g' : 'e'}=${encodeURIComponent(x)}`;

  const name = (doc.team && doc.team.name) || 'Team';
  const body = ICS.calendar(name, ICS.docItems(doc, back), env.now ? env.now() : Date.now(), { refresh: REFRESH_MIN });
  return {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="${ICS.fileName(name)}"`,
      // short, so a change reaches the next calendar that asks; calendars poll far less often than this
      'Cache-Control': 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff'
    },
    body: method === 'HEAD' ? '' : body
  };
}

module.exports = { serve, ID, REFRESH_MIN };
