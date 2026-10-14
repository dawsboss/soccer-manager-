/* The visual system (UX-REVIEW.md, 4; build 147), held in place.

   The review's complaints were about the stylesheet, not the data: type too
   small for a sideline and grey on grey, every block a white bordered card
   whether a tap opened it or not, orange and red on every row until neither
   meant anything, and the calendar's + sitting over the list. Each fix is a
   number or a rule in styles.css, and a number drifts back one 13px at a
   time; this reads the file the browser loads and holds it to the decisions
   the comment at the top of styles.css sets out:

   - nothing a person reads is under 14px; 12px for labels, badges and
     kickers; smaller only in the grids, on a pitch token and on a chart,
     each named here with the floor it keeps;
   - --ink-soft, the grey every secondary line is set in, clears WCAG AA on
     both the page and a card;
   - a card is flat unless a tap opens it; every row and card that opens
     something carries .go (the chevron) and a press state;
   - a thing called off is grey, a player short of minutes is grey, a count
     is green: orange and red are kept for what wants the coach;
   - the calendar's + is in the flow, at the end of the views row, never fixed over the list.

   It parses styles.css itself rather than rendering it: there is no layout
   engine in the rig, and these are decisions about numbers, which a parse
   reads exactly. */

const fs = require('fs');
const path = require('path');
const H = require('./harness');
const { check } = H;

const root = f => path.join(__dirname, '..', f);
const raw = fs.readFileSync(root('styles.css'), 'utf8');
const app = fs.readFileSync(root('app.js'), 'utf8');
// comments out, with their newlines kept so a line number still points at the file
const css = raw.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));

/* ---- the rules, flat: selector, body, line. A block inside @media is read
   as its own rule, which is what matters for a floor. */
const rules = [];
{
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const sel = m[1].trim().replace(/\s+/g, ' ');
    if (!sel || sel.startsWith('@') || /^\d+%$|^from$|^to$/.test(sel)) continue;
    rules.push({ sel, body: m[2], line: css.slice(0, m.index + m[1].length).split('\n').length });
  }
}
const vars = Object.fromEntries([...rules.find(r => r.sel === ':root').body.matchAll(/--([\w-]+):\s*([^;]+)/g)].map(m => [m[1], m[2].trim()]));
const ruleOf = sel => rules.find(r => r.sel === sel);
const bodyOf = sel => (ruleOf(sel) || {}).body || '';

/* ---------------- type ---------------- */
console.log('--- type: 14px is the floor; 12px for labels; the grids, tokens and charts named ---');

/* A label is read at a glance, not as a sentence: a kicker over a group, a
   count in a badge, a tag, a column heading, the tab bar's words, a unit
   under a big number, a monospace id. 12px. */
const LABELS = new Set([
  '.ts-label', '.sync', '.token .mins', '.token .nm', '.snapmins .pmtot', '.livemins small', '.diff',
  '.tallybtn span', '.gb-label', '.gb-name small', '.gb-hint', '.ver', '.tallylbl .conv', '.ghsync',
  '.tab', '.tabn', '.personrow .pill', 'table.grid th', '.tag', '.snapgap', '.snapwhen b small',
  '.benchgrp h4,.benchwhen', '.calgrid .wd', '.calkey', '.calhead', '.msghead .pill,.convrow .pill',
  '.msgdot', '.bubble .bwhen', '.pill.asking', '.drilltype', '.need', '.hint', '.sheet h4',
  '.drillname .tag', '.runmode h4', '.wkick', '.wstars .lbl', '.spell .sl', '.wpair .lbl',
  '.tlogrow .t small', '.calleaf small', '.calrow.tc .tag:not(.called)', '.agdate small', '.ev-tag',
  '.tg-ev', '.tg-more', '.mg-n', '.mono', '.calmenu span'
]);
/* Smaller than a label only where the layout is the message and the words
   ride along: a 54px pitch token, a month cell a seventh of a phone wide, the
   hour gutter, a chart's axis in viewBox units, the dots under a day. Each
   with the floor it keeps, so a grid cannot creep down to 9px either. */
const GRAPHICS = {
  '.stars': 11,            // five dots, a rating
  '.token .role': 10,      // the spot's name over a pitch token
  '.slotok .rl': 10,       // the same on a formation spot
  '.spell .gdot': 9,       // a goal dot on the recap's spells
  '.lc-ax': 9,             // a chart axis, in SVG units, scaled on screen
  '.calday small': 11,     // the day's note in a 44px cell
  '.dots small': 9,        // a count beside the dots under a day
  '.caltoday i': 11,       // today's number inside the Today icon
  '.ev-live': 11,          // the LIVE badge on an entry
  '.tg-day small': 11,     // the weekday over an hour column
  '.tg-gl': 11,            // the gutter's heading
  '.tg-gutter span': 11,   // the hours down the gutter
  '.tg-ev span': 11,       // the place under an entry's title in an hour
  '.tg-week .tg-ev': 11,   // an entry in a seventh of the week
  '.tg-allday .mg-ev': 11, // an all-day entry over the hours
  '.mg-wd span': 11,       // the weekdays over the month
  '.mg-ev': 11,            // an entry in a month cell
  '.mg-more': 11,          // "+2" in a month cell
  '.infobtn': 11           // the i in an 18px circle
};
const sizes = [];
for (const r of rules) {
  for (const m of r.body.matchAll(/font-size:\s*([\d.]+)px/g)) sizes.push({ ...r, px: parseFloat(m[1]) });
  for (const m of r.body.matchAll(/font:\s*[^;]*?([\d.]+)px/g)) sizes.push({ ...r, px: parseFloat(m[1]) });
}
const floorOf = sel => sel in GRAPHICS ? GRAPHICS[sel] : LABELS.has(sel) ? 12 : 14;
const low = sizes.filter(s => s.px < floorOf(s.sel));
console.log(`  ${sizes.length} font sizes read; ${sizes.filter(s => s.px < 14).length} under 14px, every one named above`);
check('body text is 16px', /font-size:16px/.test(bodyOf('body')), true);
check('nothing is set under its floor', low.map(s => `${s.sel} ${s.px}px at line ${s.line} (floor ${floorOf(s.sel)})`).join('; '), '');
check('no label is set under 12px', sizes.filter(s => LABELS.has(s.sel) && s.px < 12).length, 0);
{
  // a selector named here that no longer sets a size is a list that has drifted from the file
  const named = [...LABELS, ...Object.keys(GRAPHICS)];
  const gone = named.filter(sel => !sizes.some(s => s.sel === sel));
  check('every selector the lists name still sets a size', gone.join(', '), '');
  const both = [...LABELS].filter(sel => sel in GRAPHICS);
  check('and none is on both lists', both.join(', '), '');
}
{
  /* app.js draws a few sizes inline (the AI prompt boxes); the same floor. */
  const inline = [...app.matchAll(/font-size:\s*([\d.]+)px/g)].map(m => parseFloat(m[1]));
  check(`app.js's ${inline.length} inline sizes are 14px or more`, inline.filter(px => px < 14).join(', '), '');
}

/* ---------------- contrast ---------------- */
console.log('\n--- the grey text, on the page and on a card ---');
const lum = hex => {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16) / 255)
    .map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const r1 = ratio(vars['ink-soft'], vars.paper), r2 = ratio(vars['ink-soft'], vars.card);
console.log(`  --ink-soft ${vars['ink-soft']} on --paper ${vars.paper}: ${r1.toFixed(2)}:1; on a card: ${r2.toFixed(2)}:1`);
check('.muted is set in --ink-soft', /color:var\(--ink-soft\)/.test(bodyOf('.muted')), true);
check('--ink-soft on the page clears AA for body text (4.5:1)', r1 >= 4.5, true);
check('--ink-soft on a card clears it too', r2 >= 4.5, true);
check('--ink on the page clears AAA (7:1)', ratio(vars.ink, vars.paper) >= 7, true);

/* ---------------- surfaces ---------------- */
console.log('\n--- a card that says something is flat; one a tap opens says so ---');
check('.card has no border', /border:0/.test(bodyOf('.card')), true);
check('a button card keeps one', /border:1px solid var\(--line\)/.test(bodyOf('button.card')), true);
const press = rules.find(r => /button\.card:active/.test(r.sel) && /button\.prow:active/.test(r.sel));
check('a pressed card or row goes green', !!press && /background:var\(--field-wash\)/.test(press.body), true);
check('.go draws a chevron', /content:""/.test(bodyOf('.go::after')) && /border-right:2px solid/.test(bodyOf('.go::after')), true);
check('Settings\' own chevron is gone from the stylesheet', rules.some(r => r.sel === '.setgo'), false);
check('and from app.js', /setgo/.test(app), false);
{
  /* Every row or card a tap opens carries .go. A row that is a choice (a
     player picked on Subs or the Lineup, a person ticked for a message) is
     not a door and gets none. */
  const SELECT = new Set(['tap', 'snapplayer', 'msgpick']);
  const tags = [...app.matchAll(/<button[^>]*class="(prow|card)[^"]*"[^>]*>/g)];
  const rows = tags.map(m => {
    const cls = (m[0].match(/class="([^"]*)"/) || [])[1].replace(/\$\{[^}]*\}/g, '');
    const act = (m[0].match(/data-act="([^"$]*)"/) || [])[1] || '';
    return { kind: m[1], cls, act, go: /\bgo\b/.test(cls) };
  });
  const doors = rows.filter(r => !SELECT.has(r.act));
  console.log(`  ${rows.length} tappable rows and cards in app.js: ${doors.filter(r => r.go).length} doors with a chevron, ${rows.length - doors.length} choices without`);
  check('every row or card that opens something carries .go', doors.filter(r => !r.go).map(r => r.kind + ' ' + r.act).join(', '), '');
  check('a row that is a choice carries none', rows.filter(r => SELECT.has(r.act) && r.go).map(r => r.act).join(', '), '');
  check('rows and cards of both kinds exist', doors.length > 30 && rows.length - doors.length >= 3, true);
}

/* ---------------- colour ---------------- */
console.log('\n--- orange and red for what wants the coach; a fact is grey ---');
check('a player short of minutes is grey, not orange', /color:var\(--ink-soft\)/.test(bodyOf('.diff.owed,.diff.over,.diff.even')), true);
check('— except the furthest behind on Subs, which is what the coach scans for (build 151)', /color:var\(--owed\)/.test(bodyOf('.liverow .diff.owed')), true);
check('a player over her target is not red: the bar is just full (build 151)', bodyOf('.bar i[data-over="1"]'), '');
check('— and app.js no longer marks one', /data-over=/.test(app), false);
check('called off is a grey tag', /var\(--paper\)/.test(bodyOf('.tag.called')) && !/--over|#FBE7E3|#6E2317/.test(bodyOf('.tag.called')), true);
check('on a calendar entry too', /var\(--paper\)/.test(bodyOf('.ev[data-called="1"] .ev-tag')), true);
check('app.js draws a called-off game with it', /class="tag called">\$\{CALLED\[/.test(app), true);
check('and never with the red one', /class="tag off">\$\{CALLED\[/.test(app), false);
check('the count on a tab is green', /background:var\(--field-deep\)/.test(bodyOf('.tabn')), true);
check('a game that needs a name is grey, not red', /var\(--ink-soft\)/.test(bodyOf('.untitled')), true);
check('a sub due is still red', /var\(--over\)/.test(bodyOf('.subscard[data-state="due"]')), true);
check('and a sub due soon still orange', /var\(--owed\)/.test(bodyOf('.subscard[data-state="soon"]')), true);
check('Delete is still red', /var\(--over\)/.test(bodyOf('.btn.danger')), true);

/* ---------------- the calendar's + ---------------- */
console.log('\n--- the + is in the flow, over no row ---');
{
  /* It was fixed in the corner, and with the live card and the bar above the
     list the first row's score sat under it (UX-REVIEW.md, 3). A row mid-page
     cannot be padded out from under a fixed button, so it sits at the end of
     the views row (build 146), a flex item like the segment beside it. */
  const fab = bodyOf('.calfab');
  check('the + is not fixed over the page', /position:fixed/.test(fab), false);
  check('it is a flex item beside the views', /flex:none/.test(fab) && /display:flex/.test(bodyOf('.calviewrow')), true);
  check('green, the action on the row', /background:var\(--field-deep\)/.test(fab), true);
  const row = app.slice(app.indexOf('<div class="calviewrow">'), app.indexOf('function calFab('));
  check('app.js draws it at the end of the views row', /\$\{calFab\(ed, v\)\}<\/div>/.test(row), true);
  check('and nowhere else', app.split('${calFab(ed, v)}').length - 1, 1);
  check('nothing pads the list for it any more', rules.some(r => r.sel === '.stack.calendar'), false);
}

/* ---------------- what a parent taps (UX-REVIEW-3.md, 12; build 155) ---------------- */
console.log('\n--- the controls a parent taps: her answer its own, nothing under 40px, red for what cannot wait ---');
{
  const px = (body, prop) => { const m = body.match(new RegExp('(?:^|;|\\s)' + prop + ':\\s*([\\d.]+)px')); return m ? parseFloat(m[1]) : 0; };
  // the vertical padding a rule sets, from the shorthand
  const padY = body => { const m = body.match(/(?:^|;|\s)padding:\s*([^;]+)/); if (!m) return 0; const v = m[1].trim().split(/\s+/).map(parseFloat); return v[0] + (v.length >= 3 ? v[2] : v[0]); };
  check('a chip is 40px tall at least', px(bodyOf('.chip'), 'min-height'), 40);
  check('— with 8px between chips', /gap:8px/.test(bodyOf('.chips')), true);
  check('a small button is 40px tall at least', px(bodyOf('.btn.sm'), 'min-height'), 40);
  check('the steppers too', px(bodyOf('.stepbtn'), 'min-height') >= 40 && px(bodyOf('.calnavs .stepbtn'), 'height') >= 40, true);
  check('the avatar is 36px', px(bodyOf('.avatar'), 'width') + ' ' + px(bodyOf('.avatar'), 'height'), '36 36');
  /* 20px of words (14px at 1.45) and padding to 40, given back by a negative
     margin so nothing moves */
  for (const sel of ['.textbtn', '.linkbtn', '.linkbtn.dark', '.tbsub', '.legal a'])
    check(`${sel}: 40px to tap, the space given back`, padY(bodyOf(sel)) + 20 >= 40 && /margin:-/.test(bodyOf(sel)), true);
  check('the sync badge, a button now, reaches 40px past its pill', /inset:-9px/.test(bodyOf('.sync::before')) && /border:0/.test(bodyOf('.sync')), true);
  const page = fs.readFileSync(root('index.html'), 'utf8');
  check('— and is a button that opens what is waiting', /<button class="sync" id="syncBadge" type="button" data-act="pendingsheet"/.test(page), true);

  // her answer: one control, its own class, 44px, pressed in what she said
  check('her answer is 44px tall', px(bodyOf('.rsvpseg button'), 'min-height'), 44);
  check('— Going pressed green', /background:var\(--field-deep\)/.test(bodyOf('.rsvpseg button[aria-pressed="true"][data-v="yes"]')), true);
  check('— Not going grey', /background:var\(--ink-soft\)/.test(bodyOf('.rsvpseg button[aria-pressed="true"][data-v="no"]')), true);
  check('— Maybe orange', /var\(--owed\)/.test(bodyOf('.rsvpseg button[aria-pressed="true"][data-v="maybe"]')), true);
  const ctl = app.slice(app.indexOf('function rsvpChips('), app.indexOf('function rsvpSaid('));
  check('app.js draws it in one place, rsvpChips()', (app.match(/class="[^"]*\brsvpseg\b/g) || []).length + ' ' + /class="seg rsvpseg"/.test(ctl), '1 true');
  check('— and no chip answers for anyone', /class="chip"[^>]*data-act="rsvp"/.test(app), false);

  // red is for what needs her now or cannot be undone, and there is one red
  check('a lost game is not red: a result is a fact', /--over/.test(bodyOf('.resbadge[data-r="L"]')), false);
  check('the now line is the calendar\'s green, not a second red', /var\(--field-deep\)/.test(bodyOf('.tg-now')) && /var\(--field-deep\)/.test(bodyOf('.agline')), true);
  check('one red in the file', /#C5221F/i.test(raw), false);
  const acct = app.slice(app.indexOf('function sheetAccount('), app.indexOf('function sheetForget('));
  check('the account sheet: Sign out quiet, Delete my account a line, no two reds', /class="btn quiet wide" data-act="signout"/.test(acct) && /class="textbtn dangerlink" data-act="forgetsheet"/.test(acct) && !/class="btn[^"]*danger/.test(acct), true);

  // the clock and FT in the game header are words, not buttons
  check('the header\'s clock has no border, a pill unlike the buttons beside it', /border:0/.test(bodyOf('.ghclock')) && /border-radius:999px/.test(bodyOf('.ghclock')), true);
}

H.summary('the visual system');
