/* Drill diagrams: a few lines of data in, an animated SVG out.

   A coaching diagram is cones, goals and players on a patch of grass, then
   who passes, dribbles and runs where, in order. That is small enough to write
   by hand as data, and drawing it here rather than shipping pictures buys four
   things a GIF can't:

   - It weighs a few kilobytes and works offline, like everything else at a
     field with no signal.
   - It animates without any script. The moves are SMIL inside the SVG, so the
     same string loops in the app, in an <img>, or saved to a file.
   - The still version (every move drawn as an arrow, numbered by step) comes
     from the same data, for anyone who asks for less motion.
   - A coach's own diagrams, when the editor comes, are the same format: no
     upload, no storage bucket, nothing a parent's phone downloads.

   The format, in yards, x across and y down:

     area:    [width, length]               the patch drawn
     mark:    'grid' | 'box' | 'half' | 'pitch' | 'none'
              grid: a coned square. box: a penalty area on the top edge.
              half: that plus halfway on the bottom. pitch: both ends, boxes
              left and right when the area is wider than it is long.
     cones, balls:  [[x, y], ...]           static
     goals:   [[x, y, 'big'|'mini', facing]]    the middle of the goal line;
              facing is the way the mouth opens: n, s, e or w
     zones:   [[x, y, w, h, label?]]        shaded: end zones, channels, homes
     lines:   [[x1, y1, x2, y2]]            dashed: a build-out line, a start line
     labels:  [[x, y, text]]
     players: { A1: [x, y], ... }           A blue, D red, N yellow (neutral),
                                            B teal (a fourth team), K keeper,
                                            C coach or server
     ball:    'A1' | ['A1', 'A2'] | [[x, y]]    who starts with a ball, or where
     frames:  [ ['A1>A2', 'A1-10,4', '# caption'], ... ]   one array per step;
              leave it out for a layout with nothing moving

   Moves inside one frame happen at the same time:

     A1>A2     pass to a player, to wherever she is at the end of the step
     A1>12,4   pass into space
     A1>G      shot at the nearest goal (G2: the second goal in the list)
     A1~12,4   dribble there with the ball
     A1-12,4   run there without it
     D1-A1     run at a player, stopping just short of her
     D1*       win the nearest ball;  D1*A2  win A2's
     # text    the caption for this step

   A loose ball that ends a step at someone's feet becomes hers. A shot that
   reaches a goal stays in it.

   parse() checks all of this and returns every problem rather than throwing,
   so test/drills.js can hold every built-in diagram to it. */

(function (root) {
  /* Narrow on purpose: at a 600 canvas, a phone drew the players as specks.
     Everything below is in these units. */
  const W = 480;              // viewBox width; height follows the area
  const MAX_H = 380;
  const PAD = 14;
  const R = 12;               // player radius, whatever the scale
  const CAPTION_H = 30;
  const SLACK = 1.5;          // yards a player may stand outside the area

  const COLOURS = {
    grass: '#2F8A55', stripe: '#2B814F', line: '#FFFFFF', zone: 'rgba(255,255,255,.13)',
    A: '#1D5FD6', D: '#D23B3B', N: '#F2B417', B: '#0E9C94', K: '#7A3FD1', C: '#F5F7F6',
    cone: '#FF8A1F', ball: '#FFFFFF', arrow: '#FFFFFF', shot: '#FFE15A', ink: '#0E1B14', caption: 'rgba(8,20,13,.8)'
  };

  const ID = /^[ADNBKC]\d*$/;
  const PT = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/;
  const MOVE = /^([ADNBKC]\d*)(>|~|-|\*)(.*)$/;

  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const toward = (from, at, gap) => {
    const d = dist(from, at);
    return d > gap ? [at[0] - (at[0] - from[0]) * gap / d, at[1] - (at[1] - from[1]) * gap / d] : from.slice();
  };
  const copy = s => ({
    players: Object.fromEntries(Object.entries(s.players).map(([k, v]) => [k, v.slice()])),
    balls: s.balls.map(b => ({ ...b, at: b.at && b.at.slice() }))
  });

  function parse(dg) {
    const errors = [];
    const err = m => errors.push(m);
    if (!dg || typeof dg !== 'object') return { errors: ['no diagram'], states: [], steps: [] };
    const [aw, ah] = Array.isArray(dg.area) ? dg.area : [];
    if (!(aw > 0 && ah > 0)) { err('area must be [width, length]'); return { errors, states: [], steps: [] }; }
    const inside = (p, slack = SLACK) => p[0] >= -slack && p[1] >= -slack && p[0] <= aw + slack && p[1] <= ah + slack;
    const point = (p, what, slack) => {
      if (!Array.isArray(p) || p.length < 2 || !p.slice(0, 2).every(Number.isFinite)) { err(`${what}: not a point`); return false; }
      if (!inside(p, slack)) { err(`${what} [${p[0]}, ${p[1]}] is outside the area`); return false; }
      return true;
    };
    const mark = dg.mark || 'grid';
    if (!['grid', 'box', 'half', 'pitch', 'none'].includes(mark)) err(`unknown mark '${mark}'`);
    if ((mark === 'box' || mark === 'half') && aw < 44) err('a penalty box needs an area at least 44 yd wide');
    if (mark === 'pitch' && Math.min(aw, ah) < 44) err('a pitch needs both sides at least 44 yd');
    (dg.cones || []).forEach((c, i) => point(c, `cone ${i + 1}`));
    (dg.balls || []).forEach((c, i) => point(c, `ball ${i + 1}`));
    (dg.goals || []).forEach((g, i) => {
      point(g, `goal ${i + 1}`, 0);
      if (!['big', 'mini'].includes(g[2])) err(`goal ${i + 1}: size must be big or mini`);
      if (!['n', 's', 'e', 'w'].includes(g[3])) err(`goal ${i + 1}: facing must be n, s, e or w`);
    });
    (dg.zones || []).forEach((z, i) => { point(z, `zone ${i + 1}`, 0); point([z[0] + z[2], z[1] + z[3]], `zone ${i + 1} far corner`, 0); });
    (dg.lines || []).forEach((l, i) => { point(l, `line ${i + 1}`); point([l[2], l[3]], `line ${i + 1} end`); });
    (dg.labels || []).forEach((l, i) => { point(l, `label ${i + 1}`); if (typeof l[2] !== 'string' || !l[2]) err(`label ${i + 1} has no text`); });

    const players = {};
    for (const [id, p] of Object.entries(dg.players || {})) {
      if (!ID.test(id)) err(`player id '${id}' should be A, D, N, B, K or C and a number`);
      else if (point(p, id)) players[id] = p.slice(0, 2);
    }
    if (!Object.keys(players).length) err('no players');

    const balls = [];
    const one = Array.isArray(dg.ball) && dg.ball.length === 2 && dg.ball.every(Number.isFinite);
    const startBalls = dg.ball === undefined ? [] : Array.isArray(dg.ball) && !one ? dg.ball : [dg.ball];
    for (const b of startBalls) {
      if (typeof b === 'string') { if (!players[b]) err(`ball starts with '${b}', who isn't on the diagram`); else balls.push({ by: b, at: null }); }
      else if (point(b, 'ball')) balls.push({ by: null, at: b.slice(0, 2) });
    }

    const states = [{ players, balls }];
    const steps = [];
    if (dg.frames !== undefined && !Array.isArray(dg.frames)) err('frames should be a list of steps');
    (Array.isArray(dg.frames) ? dg.frames : []).forEach((frame, fi) => {
      const n = fi + 1;
      if (!Array.isArray(frame)) { err(`step ${n} should be a list of moves`); return; }
      const prev = states[states.length - 1];
      const next = copy(prev);
      const moves = [];
      let caption = '';
      const held = id => next.balls.find(b => b.by === id);
      const parsed = [];
      for (const raw of frame) {
        if (typeof raw !== 'string') { err(`step ${n}: '${raw}' is not a move`); continue; }
        if (raw.startsWith('#')) { caption = raw.slice(1).trim(); continue; }
        const m = MOVE.exec(raw.replace(/\s+/g, ''));
        if (!m) { err(`step ${n}: can't read '${raw}'`); continue; }
        const [, who, op, tgt] = m;
        if (!prev.players[who]) { err(`step ${n}: '${who}' isn't on the diagram`); continue; }
        if (op !== '>' && parsed.some(p => p.who === who && p.op !== '>')) { err(`step ${n}: ${who} is told to move twice`); continue; }
        parsed.push({ who, op, tgt, raw });
      }
      const pointOf = t => { const pm = PT.exec(t); return pm ? [Number(pm[1]), Number(pm[2])] : null; };

      /* Resolved in the order a coach means one step: runners first, so a pass
         can be played onto a run; then runs at a player, who may herself be
         moving; then the ball; then anyone winning it. */
      for (const p of parsed.filter(p => p.op === '~' || (p.op === '-' && !ID.test(p.tgt)))) {
        const to = pointOf(p.tgt);
        if (!to) { err(`step ${n}: '${p.raw}' needs a point to go to`); continue; }
        if (!inside(to)) { err(`step ${n}: '${p.raw}' leaves the area`); continue; }
        if (p.op === '~' && !held(p.who)) {
          const loose = next.balls.find(b => !b.by && !b.goal && dist(b.at, prev.players[p.who]) <= 2.5);
          if (loose) { loose.by = p.who; loose.at = null; }
          else { err(`step ${n}: ${p.who} dribbles without a ball`); continue; }
        }
        next.players[p.who] = to;
        moves.push({ kind: p.op === '~' ? 'dribble' : 'run', who: p.who, from: prev.players[p.who], to, toPlayer: false });
      }
      for (const p of parsed.filter(p => p.op === '-' && ID.test(p.tgt))) {
        if (!prev.players[p.tgt]) { err(`step ${n}: '${p.raw}' runs at '${p.tgt}', who isn't there`); continue; }
        const from = prev.players[p.who];
        const to = toward(from, next.players[p.tgt], 2);
        next.players[p.who] = to;
        moves.push({ kind: 'run', who: p.who, from, to, toPlayer: false });
      }
      for (const p of parsed.filter(p => p.op === '>')) {
        const ball = next.balls.find(b => b.by === p.who);
        if (!ball) { err(`step ${n}: ${p.who} passes without a ball`); continue; }
        const from = prev.players[p.who];
        if (/^G\d*$/.test(p.tgt)) {
          const goals = dg.goals || [];
          if (!goals.length) { err(`step ${n}: '${p.raw}' shoots, but there is no goal`); continue; }
          const g = p.tgt === 'G' ? goals.slice().sort((a, b) => dist(a, from) - dist(b, from))[0] : goals[Number(p.tgt.slice(1)) - 1];
          if (!g) { err(`step ${n}: '${p.raw}' shoots at a goal that isn't there`); continue; }
          ball.by = null; ball.at = [g[0], g[1]]; ball.goal = true;
          moves.push({ kind: 'shot', who: p.who, from, to: [g[0], g[1]], toPlayer: false });
        } else if (ID.test(p.tgt)) {
          if (!next.players[p.tgt]) { err(`step ${n}: '${p.raw}' passes to '${p.tgt}', who isn't there`); continue; }
          if (p.tgt === p.who) { err(`step ${n}: '${p.raw}' passes to herself`); continue; }
          ball.by = p.tgt; ball.at = null;
          moves.push({ kind: 'pass', who: p.who, from, to: next.players[p.tgt], toPlayer: true });
        } else {
          const to = pointOf(p.tgt);
          if (!to || !inside(to)) { err(`step ${n}: can't pass to '${p.tgt}'`); continue; }
          ball.by = null; ball.at = to;
          moves.push({ kind: 'pass', who: p.who, from, to, toPlayer: false });
        }
      }
      for (const p of parsed.filter(p => p.op === '*')) {
        const from = prev.players[p.who];
        let ball;
        if (p.tgt) {
          if (!ID.test(p.tgt)) { err(`step ${n}: '${p.raw}' should name who to win it from`); continue; }
          ball = next.balls.find(b => b.by === p.tgt);
          if (!ball) { err(`step ${n}: '${p.raw}': ${p.tgt} has no ball`); continue; }
        } else {
          const where = b => b.by ? next.players[b.by] : b.at;
          ball = next.balls.filter(b => b.by !== p.who && !b.goal).sort((a, b) => dist(where(a), from) - dist(where(b), from))[0];
          if (!ball) { err(`step ${n}: ${p.who} wins the ball, but there isn't one`); continue; }
        }
        const at = ball.by ? next.players[ball.by] : ball.at;
        const to = toward(from, at, 1.5);
        next.players[p.who] = to;
        ball.by = p.who; ball.at = null;
        moves.push({ kind: 'run', who: p.who, from, to, toPlayer: false });
      }
      for (const b of next.balls) {
        if (b.by || b.goal) continue;
        const near = Object.entries(next.players).filter(([id]) => !next.balls.some(x => x.by === id))
          .sort((x, y) => dist(x[1], b.at) - dist(y[1], b.at))[0];
        if (near && dist(near[1], b.at) <= 1.5) { b.by = near[0]; b.at = null; }
      }
      if (!moves.length) err(`step ${n} has no moves`);
      steps.push({ moves, caption });
      states.push(next);
    });
    return { errors, states, steps };
  }

  /* ---------------- drawing ---------------- */

  const f = n => Math.round(n * 10) / 10;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  /* Fit the area, and anyone standing just outside it, to the canvas. A goal
     on the edge has its net outside the area, so that side gets room too. */
  function geometry(dg, states) {
    const [aw, ah] = dg.area;
    let x0 = 0, y0 = 0, x1 = aw, y1 = ah;
    const take = p => { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); };
    for (const st of states) for (const p of Object.values(st.players)) take(p);
    for (const p of [...(dg.cones || []), ...(dg.balls || [])]) take(p);
    const room = { n: 0, s: 0, e: 0, w: 0 };
    for (const [x, y, size, facing] of dg.goals || []) {
      const deep = size === 'big' ? 22 : 12;
      if (facing === 's' && y <= y0 + 1) room.n = Math.max(room.n, deep);
      if (facing === 'n' && y >= y1 - 1) room.s = Math.max(room.s, deep);
      if (facing === 'e' && x <= x0 + 1) room.w = Math.max(room.w, deep);
      if (facing === 'w' && x >= x1 - 1) room.e = Math.max(room.e, deep);
    }
    const bw = x1 - x0, bh = y1 - y0;
    const s = Math.min((W - 2 * PAD - room.e - room.w) / bw, (MAX_H - 2 * PAD - room.n - room.s) / bh);
    const ox = PAD + room.w + ((W - 2 * PAD - room.e - room.w) - bw * s) / 2 - x0 * s;
    const oy = PAD + room.n - y0 * s;
    const h = bh * s + 2 * PAD + room.n + room.s;
    return { s, h, px: p => [f(ox + p[0] * s), f(oy + p[1] * s)], len: y => y * s };
  }

  function markings(dg, g) {
    const [aw, ah] = dg.area;
    const L = `stroke="${COLOURS.line}" stroke-width="2" fill="none" stroke-opacity=".85"`;
    const out = [];
    const poly = pts => `<polyline points="${pts.map(p => g.px(p).join(',')).join(' ')}" ${L}/>`;
    /* A penalty area on any edge, from coordinates along the goal line (u,
       from its middle) and into the field (v). */
    const at = edge => (u, v) => edge === 'n' ? [aw / 2 + u, v] : edge === 's' ? [aw / 2 + u, ah - v] : edge === 'w' ? [v, ah / 2 + u] : [aw - v, ah / 2 + u];
    const box = edge => {
      const m = at(edge);
      out.push(poly([m(-22, 0), m(-22, 18), m(22, 18), m(22, 0)]), poly([m(-10, 0), m(-10, 6), m(10, 6), m(10, 0)]));
      const [cx, cy] = g.px(m(0, 12));
      out.push(`<circle cx="${cx}" cy="${cy}" r="2.5" fill="${COLOURS.line}"/>`);
      const arc = [];
      for (let i = 0; i <= 12; i++) { const a = -0.9273 + i * 0.9273 / 6; arc.push(m(10 * Math.sin(a), 12 + 10 * Math.cos(a))); }
      out.push(poly(arc));
    };
    const halfway = (horizontal) => {
      if (horizontal) out.push(poly([[0, ah / 2], [aw, ah / 2]]));
      else out.push(poly([[aw / 2, 0], [aw / 2, ah]]));
      const [cx, cy] = g.px([aw / 2, ah / 2]);
      out.push(`<circle cx="${cx}" cy="${cy}" r="${f(g.len(10))}" ${L}/>`);
    };
    const mark = dg.mark || 'grid';
    if (mark === 'grid') {
      const [a, b] = g.px([0, 0]);
      out.push(`<rect x="${a}" y="${b}" width="${f(g.len(aw))}" height="${f(g.len(ah))}" fill="none" stroke="${COLOURS.line}" stroke-width="1.5" stroke-dasharray="6 5" stroke-opacity=".8"/>`);
    }
    if (mark === 'box' || mark === 'half') { out.push(poly([[0, 0], [aw, 0]])); box('n'); }
    if (mark === 'half') {
      out.push(poly([[0, ah], [aw, ah]]));
      const arc = [];
      for (let i = 0; i <= 16; i++) { const a = -Math.PI / 2 + i * Math.PI / 16; arc.push([aw / 2 + 10 * Math.sin(a), ah - 10 * Math.cos(a)]); }
      out.push(poly(arc));
    }
    if (mark === 'pitch') {
      out.push(poly([[0, 0], [aw, 0], [aw, ah], [0, ah], [0, 0]]));
      if (aw >= ah) { box('w'); box('e'); halfway(false); }
      else { box('n'); box('s'); halfway(true); }
    }
    return out.join('');
  }

  function goalSvg(goal, g, uid) {
    const [x, y, size, facing] = goal;
    const wide = Math.max(size === 'big' ? g.len(7) : g.len(2.5), size === 'big' ? 34 : 16);
    const deep = size === 'big' ? Math.min(Math.max(g.len(2), 9), 20) : Math.min(Math.max(g.len(1.2), 7), 11);
    const [cx, cy] = g.px([x, y]);
    const across = facing === 'n' || facing === 's';
    // the net sits behind the goal line, away from the way the mouth faces
    const back = facing === 's' || facing === 'e' ? -1 : 1;
    const rx = across ? cx - wide / 2 : back < 0 ? cx - deep : cx;
    const ry = across ? (back < 0 ? cy - deep : cy) : cy - wide / 2;
    const net = `<rect x="${f(rx)}" y="${f(ry)}" width="${f(across ? wide : deep)}" height="${f(across ? deep : wide)}" fill="url(#${uid}n)" stroke="${COLOURS.line}" stroke-width="2"/>`;
    const mouth = across
      ? `<line x1="${f(cx - wide / 2)}" y1="${cy}" x2="${f(cx + wide / 2)}" y2="${cy}" stroke="${COLOURS.line}" stroke-width="3.5"/>`
      : `<line x1="${cx}" y1="${f(cy - wide / 2)}" x2="${cx}" y2="${f(cy + wide / 2)}" stroke="${COLOURS.line}" stroke-width="3.5"/>`;
    return net + mouth;
  }

  function wavy(a, b) {
    const d = dist(a, b), n = Math.max(2, Math.round(d / 14));
    const ux = (b[0] - a[0]) / d, uy = (b[1] - a[1]) / d;
    let p = `M${a[0]} ${a[1]}`;
    for (let i = 1; i <= n * 4; i++) {
      const t = i / (n * 4), off = i === n * 4 ? 0 : Math.sin(t * n * 2 * Math.PI) * 4;
      p += ` L${f(a[0] + ux * d * t - uy * off)} ${f(a[1] + uy * d * t + ux * off)}`;
    }
    return p;
  }

  /* Every arrow sits a few units to the left of its line of travel, so a pass
     there and a pass back draw as two arrows rather than one on top of the
     other. */
  function arrowSvg(mv, g, num) {
    let a = g.px(mv.from), b = g.px(mv.to);
    const d = dist(a, b);
    const ux = (b[0] - a[0]) / d, uy = (b[1] - a[1]) / d;
    const cutStart = R + 2, cutEnd = mv.toPlayer ? R + 4 : mv.kind === 'shot' ? 2 : 3;
    if (!(d > cutStart + cutEnd + 8)) return '';
    const side = 3.5;
    a = [f(a[0] + ux * cutStart + uy * side), f(a[1] + uy * cutStart - ux * side)];
    b = [f(b[0] - ux * cutEnd + uy * side), f(b[1] - uy * cutEnd - ux * side)];
    const col = mv.kind === 'shot' ? COLOURS.shot : COLOURS.arrow;
    const w = mv.kind === 'shot' ? 3 : 2.2;
    const dash = mv.kind === 'run' ? ` stroke-dasharray="6 5"` : '';
    const path = mv.kind === 'dribble' ? wavy(a, b) : `M${a[0]} ${a[1]} L${b[0]} ${b[1]}`;
    const head = `<path d="M${b[0]} ${b[1]} L${f(b[0] - ux * 9 - uy * 5)} ${f(b[1] - uy * 9 + ux * 5)} L${f(b[0] - ux * 9 + uy * 5)} ${f(b[1] - uy * 9 - ux * 5)} Z" fill="${col}"/>`;
    const label = num ? (() => {
      const m = [f(a[0] + (b[0] - a[0]) * 0.45 + uy * 10), f(a[1] + (b[1] - a[1]) * 0.45 - ux * 10)];
      return `<circle cx="${m[0]}" cy="${m[1]}" r="7.5" fill="${COLOURS.ink}" fill-opacity=".8"/><text x="${m[0]}" y="${f(m[1] + 3.6)}" font-size="10" font-weight="700" text-anchor="middle" fill="#fff">${num}</text>`;
    })() : '';
    return `<path d="${path}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${dash}/>${head}${label}`;
  }

  function playerSvg(id) {
    const team = id[0];
    const num = id.slice(1);
    const text = team === 'K' ? 'GK' : team === 'C' ? 'C' : num || team;
    const ink = team === 'N' || team === 'C' ? COLOURS.ink : '#fff';
    const fs = text.length > 1 ? 10 : 12;
    return `<circle r="${R}" fill="${COLOURS[team]}" stroke="${team === 'C' ? COLOURS.ink : '#fff'}" stroke-width="2"/>`
      + `<text y="${f(fs * 0.36)}" font-size="${fs}" font-weight="700" text-anchor="middle" fill="${ink}">${text}</text>`;
  }

  const ballSvg = () => `<circle r="5.2" fill="${COLOURS.ball}" stroke="${COLOURS.ink}" stroke-width="1.6"/>`;

  /* A held ball sits at her feet, down and to the right, so both show. */
  const ballPx = (b, st, g) => {
    if (b.by) { const p = g.px(st.players[b.by]); return [f(p[0] + R * 0.8), f(p[1] + R * 0.75)]; }
    return g.px(b.at);
  };

  /* opts.animate loops the moves. Without it every move is drawn at once,
     numbered by step, which is how a diagram on paper reads. */
  function svg(dg, opts = {}) {
    const { errors, states, steps } = parse(dg);
    if (errors.length) return '';
    const g = geometry(dg, states);
    const anim = !!opts.animate && steps.length > 0;
    const captions = anim && steps.some(s => s.caption);
    const H = f(g.h + (captions ? CAPTION_H : 0));
    const uid = 'd' + Math.random().toString(36).slice(2, 8);
    const many = steps.length > 1;

    /* A short look at the set-up, then each step moves and holds. */
    const LEAD = 1.0, MOVE = 1.15, HOLD = 0.65, TAIL = 1.3;
    const T = LEAD + steps.length * (MOVE + HOLD) + TAIL;
    const t = x => f(Math.min(1, Math.max(0, x / T)) * 1e4) / 1e4;
    const ms = k => LEAD + k * (MOVE + HOLD);
    const keyTimes = [0];
    for (let k = 0; k < steps.length; k++) keyTimes.push(t(ms(k)), t(ms(k) + MOVE));
    keyTimes.push(1);
    const track = fn => {
      const v = [fn(states[0])];
      for (let k = 0; k < steps.length; k++) v.push(fn(states[k]), fn(states[k + 1]));
      v.push(fn(states[states.length - 1]));
      return v;
    };
    const dur = `dur="${f(T)}s" repeatCount="indefinite"`;
    const motion = vals => `<animateTransform attributeName="transform" type="translate" ${dur} keyTimes="${keyTimes.join(';')}" values="${vals.map(v => v.join(',')).join(';')}"/>`;
    const show = (from, to, startOn) => {
      const a = t(from), b = t(to);
      const kt = startOn ? [0, Math.max(0.001, b - 0.012), b, 1] : [0, Math.max(0, a - 0.001), Math.min(1, a + 0.012), Math.max(a + 0.013, b - 0.012), b, 1];
      const vals = startOn ? '1;1;0;0' : '0;0;1;1;0;0';
      return `<animate attributeName="opacity" ${dur} keyTimes="${kt.map(x => f(x * 1e4) / 1e4).join(';')}" values="${vals}"/>`;
    };
    const until = k => k === steps.length - 1 ? T - 0.3 : ms(k + 1);

    const out = [];
    out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" font-family="system-ui,-apple-system,'Segoe UI',sans-serif">`);
    if (opts.title) out.push(`<title>${esc(opts.title)}</title>`);
    out.push(`<defs><pattern id="${uid}s" width="48" height="8" patternUnits="userSpaceOnUse"><rect width="48" height="8" fill="${COLOURS.grass}"/><rect width="24" height="8" fill="${COLOURS.stripe}"/></pattern>`
      + `<pattern id="${uid}n" width="5" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="rgba(255,255,255,.08)"/><path d="M0 0L5 5M5 0L0 5" stroke="rgba(255,255,255,.45)" stroke-width=".7"/></pattern></defs>`);
    out.push(`<rect width="${W}" height="${f(g.h)}" fill="url(#${uid}s)"/>`);
    for (const z of dg.zones || []) {
      const [a, b] = g.px(z);
      out.push(`<rect x="${a}" y="${b}" width="${f(g.len(z[2]))}" height="${f(g.len(z[3]))}" fill="${COLOURS.zone}" stroke="${COLOURS.line}" stroke-opacity=".5" stroke-dasharray="3 4"/>`);
      if (z[4]) out.push(`<text x="${f(a + g.len(z[2]) / 2)}" y="${f(b + g.len(z[3]) / 2 + 4)}" font-size="11" font-weight="700" text-anchor="middle" fill="#fff" fill-opacity=".75" letter-spacing=".6">${esc(z[4])}</text>`);
    }
    out.push(markings(dg, g));
    for (const l of dg.lines || []) {
      const [a, b] = g.px(l), [c, d] = g.px([l[2], l[3]]);
      out.push(`<line x1="${a}" y1="${b}" x2="${c}" y2="${d}" stroke="${COLOURS.line}" stroke-width="1.8" stroke-dasharray="8 6" stroke-opacity=".8"/>`);
    }
    for (const gl of dg.goals || []) out.push(goalSvg(gl, g, uid));
    for (const c of dg.cones || []) {
      const [a, b] = g.px(c);
      out.push(`<path d="M${a} ${f(b - 6)} L${f(a + 5.5)} ${f(b + 4)} L${f(a - 5.5)} ${f(b + 4)} Z" fill="${COLOURS.cone}" stroke="${COLOURS.ink}" stroke-opacity=".35" stroke-width="1"/>`);
    }
    for (const b of dg.balls || []) { const [a, c] = g.px(b); out.push(`<g transform="translate(${a},${c})">${ballSvg()}</g>`); }
    for (const l of dg.labels || []) {
      const [a, b] = g.px(l);
      out.push(`<text x="${a}" y="${b}" font-size="11.5" font-weight="700" text-anchor="middle" fill="#fff" stroke="${COLOURS.grass}" stroke-width="3" paint-order="stroke">${esc(l[2])}</text>`);
    }

    steps.forEach((st, k) => {
      const arrows = st.moves.map(mv => arrowSvg(mv, g, many && !anim ? k + 1 : 0)).join('');
      if (arrows) out.push(anim ? `<g opacity="0">${show(ms(k), until(k))}${arrows}</g>` : `<g>${arrows}</g>`);
    });

    for (const id of Object.keys(states[0].players)) {
      const p = g.px(states[0].players[id]);
      out.push(`<g transform="translate(${p[0]},${p[1]})">${anim ? motion(track(s => g.px(s.players[id]))) : ''}${playerSvg(id)}</g>`);
    }
    states[0].balls.forEach((b, i) => {
      const p = ballPx(b, states[0], g);
      out.push(`<g transform="translate(${p[0]},${p[1]})">${anim ? motion(track(s => ballPx(s.balls[i], s, g))) : ''}${ballSvg()}</g>`);
    });

    if (captions) {
      out.push(`<rect y="${f(g.h)}" width="${W}" height="${CAPTION_H}" fill="${COLOURS.caption}"/>`);
      steps.forEach((st, k) => {
        if (!st.caption) return;
        out.push(`<text x="14" y="${f(g.h + 20)}" font-size="14" font-weight="600" fill="#fff" opacity="${k === 0 ? 1 : 0}">`
          + (k === 0 ? show(0, until(0), true) : show(ms(k), until(k))) + `${k + 1}. ${esc(st.caption)}</text>`);
      });
    }
    out.push('</svg>');
    return out.join('');
  }

  const API = { parse, svg, COLOURS };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.DrillDiagram = API;
})(typeof window !== 'undefined' ? window : globalThis);
