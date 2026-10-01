/* Calendar files and add-to-calendar links, shared by the app (index.html) and
   the share pages (live.html, game.html).

   A classic script rather than a module, for two reasons. The test harness
   loads app.js as a function body, where a static import is a syntax error;
   and the Cloudflare Worker on the roadmap is the only way a calendar can ever
   *subscribe* to a season and see changes land by themselves (a calendar app
   fetches a feed server-side and never runs our JavaScript), so this file is
   written to be dropped into that Worker unchanged: no DOM, no Firebase, plain
   data in and text out.

   Times are "floating" — 20261004T093000 with no zone and no Z. A fixture is
   9:30 wherever the pitch is, and a floating time is exactly that: the
   calendar shows it at 9:30 in whatever zone the phone is in. Converting to
   UTC would need the club's zone, which nothing here stores, and would get a
   daylight-saving weekend wrong by an hour.

   An item is { uid, title, date: 'YYYY-MM-DD', start: 'HH:MM', end: 'HH:MM',
   mins, venue, desc, called: 'cancelled' | 'postponed', url }. Only uid,
   title and date are needed; with no start it is an all-day entry. */
(function (root) {
  const pad = n => String(n).padStart(2, '0');
  const okDate = d => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
  const okTime = t => /^\d{1,2}:\d{2}$/.test(String(t || ''));

  /* Date arithmetic on the calendar date itself, in UTC so a daylight-saving
     change between today and the fixture cannot move it by an hour. */
  function shift(date, time, addMin) {
    const [y, mo, d] = date.split('-').map(Number);
    const [h, mi] = (time || '0:00').split(':').map(Number);
    const x = new Date(Date.UTC(y, mo - 1, d, h, mi + (addMin || 0)));
    return {
      date: x.getUTCFullYear() + '-' + pad(x.getUTCMonth() + 1) + '-' + pad(x.getUTCDate()),
      time: pad(x.getUTCHours()) + ':' + pad(x.getUTCMinutes())
    };
  }
  const minsOf = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

  /* When an item starts and ends. An end before the start is taken to run past
     midnight rather than to be a typo that makes a negative-length entry. */
  function span(it) {
    if (!okDate(it.date)) return null;
    if (!okTime(it.start)) return { allDay: true, start: { date: it.date }, end: shift(it.date, '0:00', 24 * 60) };
    const start = shift(it.date, it.start, 0);
    let len = Number(it.mins) || 0;
    if (okTime(it.end)) { len = minsOf(it.end) - minsOf(it.start); if (len <= 0) len += 24 * 60; }
    if (!len) len = 60;
    return { allDay: false, start, end: shift(it.date, it.start, len) };
  }
  const stampOf = p => p.date.replace(/-/g, '') + (p.time ? 'T' + p.time.replace(':', '') + '00' : '');
  const utcStamp = ms => { const x = new Date(ms); return x.getUTCFullYear() + pad(x.getUTCMonth() + 1) + pad(x.getUTCDate()) + 'T' + pad(x.getUTCHours()) + pad(x.getUTCMinutes()) + pad(x.getUTCSeconds()) + 'Z'; };

  /* RFC 5545 §3.3.11: backslash, semicolon and comma are escaped, and a line
     break is the two characters \n. */
  const text = s => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

  /* §3.1: no line longer than 75 octets, continued with CRLF and one space.
     Counted in UTF-8 bytes and split between characters, never inside one, so
     a venue with an accent or an emoji survives. */
  function fold(line) {
    const bytes = cp => cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
    const out = [];
    let cur = '', n = 0, lim = 75;
    for (const ch of line) {
      const b = bytes(ch.codePointAt(0));
      if (n + b > lim) { out.push(cur); cur = ''; n = 0; lim = 74; }
      cur += ch; n += b;
    }
    out.push(cur);
    return out.join('\r\n ');
  }

  const titleOf = it => (it.called === 'cancelled' ? 'CANCELLED: ' : it.called === 'postponed' ? 'POSTPONED: ' : '') + (it.title || 'Team event');

  function vevent(it, now) {
    const sp = span(it);
    if (!sp) return [];
    const lines = ['BEGIN:VEVENT', 'UID:' + text(it.uid) + '@minutes', 'DTSTAMP:' + utcStamp(now)];
    if (sp.allDay) lines.push('DTSTART;VALUE=DATE:' + stampOf(sp.start), 'DTEND;VALUE=DATE:' + stampOf({ date: sp.end.date }));
    else lines.push('DTSTART:' + stampOf(sp.start), 'DTEND:' + stampOf(sp.end));
    lines.push('SUMMARY:' + text(titleOf(it)));
    if (it.venue) lines.push('LOCATION:' + text(it.venue));
    if (it.desc) lines.push('DESCRIPTION:' + text(it.desc));
    if (it.url) lines.push('URL:' + text(it.url));
    /* Cancelled says so in the calendar's own terms, so an import over an
       earlier one strikes it through rather than leaving the old time there. */
    lines.push('STATUS:' + (it.called === 'cancelled' ? 'CANCELLED' : it.called === 'postponed' ? 'TENTATIVE' : 'CONFIRMED'));
    lines.push('END:VEVENT');
    return lines;
  }

  /* The whole file. CRLF line ends, as the format requires; some calendars
     refuse a bare LF. The uid is stable per fixture, so importing the season
     again updates entries instead of doubling them, in the calendars that
     honour it. */
  function calendar(name, items, now) {
    const at = now || Date.now();
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Minutes//Team calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    if (name) lines.push('X-WR-CALNAME:' + text(name));
    for (const it of items || []) lines.push(...vevent(it, at));
    lines.push('END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
  }

  /* Google Calendar's own "add this" page. No account linking and no API key:
     it opens pre-filled and the person taps Save. Floating times again, which
     Google reads in the calendar's own zone. */
  function googleLink(it) {
    const sp = span(it);
    if (!sp) return '';
    const dates = sp.allDay ? stampOf(sp.start) + '/' + stampOf({ date: sp.end.date }) : stampOf(sp.start) + '/' + stampOf(sp.end);
    const q = ['action=TEMPLATE', 'text=' + encodeURIComponent(titleOf(it)), 'dates=' + dates];
    const details = [it.desc, it.url].filter(Boolean).join('\n\n');
    if (details) q.push('details=' + encodeURIComponent(details));
    if (it.venue) q.push('location=' + encodeURIComponent(it.venue));
    return 'https://calendar.google.com/calendar/render?' + q.join('&');
  }

  /* Directions from the venue as typed. A search link rather than coordinates:
     "Lakeside Park, field 3" is what the coach knows, and the maps app is
     better at turning that into a place than anything we could store. */
  const mapLink = venue => venue ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(venue) : '';

  /* A file name a phone will not choke on. */
  const fileName = s => (String(s || 'calendar').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'calendar') + '.ics';

  const api = { calendar, googleLink, mapLink, span, fileName, fold, text };
  root.MinutesIcs = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
