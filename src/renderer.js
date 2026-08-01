// Canvas 2D rendering for the play field. Sized in CSS pixels; we set the
// transform for devicePixelRatio so lines are crisp.

import { GRID } from "./config.js";
import { getSkin } from "./skins.js";
import { getWorld } from "./worlds.js";
import { REDUCED } from "./motion.js";

// The field plate is translucent so the world shows through it, and its decor
// gets a second dimmed pass inside the plate so fireflies/snow/candy stripes
// read from the middle of the playfield instead of only in the margins.
const FIELD_ALPHA = 0.68;
const FIELD_RADIUS = 18;
const DECOR_IN_FIELD = 0.7;
// Sky overdraw. game.js renders the whole frame through the screen-shake
// translate, which peaks around 31px on the death shake, so the sky (and the
// baked copy of it) has to reach past the canvas edge by more than that.
const BLEED = 36;

export function createRenderer(canvas) {
  const ctx = canvas.getContext("2d");
  let cellPx = 0;
  let offsetX = 0;
  let offsetY = 0;
  let widthPx = 0;
  let heightPx = 0;
  // The scale resize() handed to setTransform. The bake reuses this exact value
  // rather than re-deriving canvas.width / widthPx, which drifts by a fraction
  // of a pixel whenever rect.width * dpr isn't an integer.
  let dpr = 1;

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    canvas.width  = Math.floor(rect.width  * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    widthPx = rect.width;
    heightPx = rect.height;
    // Fit the grid centered with even cell size
    cellPx = Math.floor(Math.min(rect.width / GRID.cols, rect.height / GRID.rows));
    offsetX = Math.floor((rect.width  - cellPx * GRID.cols) / 2);
    offsetY = Math.floor((rect.height - cellPx * GRID.rows) / 2);
    backdropKey = ""; // the bake is size-specific
  }

  function cellToPx(cx, cy) {
    return { x: offsetX + cx * cellPx, y: offsetY + cy * cellPx };
  }

  function clear() {
    ctx.clearRect(0, 0, widthPx, heightPx);
  }

  // --- Backdrop cache ------------------------------------------------------
  // Sky, still decor, the field plate, its grid lines and its border don't
  // change while a run is on screen, so they're baked once per (world, size)
  // and blitted per frame. Only moving decor is redrawn live, which also drops
  // the border's shadowBlur and 42 grid-line segments out of the frame budget.
  const backdrop = document.createElement("canvas");
  const backdropCtx = backdrop.getContext("2d");
  let backdropKey = "";
  let bleedX = 0;   // the bake's margin, in CSS px, for the blit back
  let bleedY = 0;

  // Returns false when there's nothing to bake into yet (no layout).
  function bakeBackdrop(worldId, world) {
    const key = `${worldId}|${canvas.width}x${canvas.height}|${cellPx}`;
    if (key === backdropKey) return true;
    if (!canvas.width || !canvas.height || !widthPx || !heightPx) return false;
    // Bake in device pixels at the live context's scale — the same `dpr`
    // resize() set the transform with — plus BLEED of margin so a shaking frame
    // never drags a transparent edge into view.
    const margin = Math.round(BLEED * dpr);
    backdrop.width = canvas.width + margin * 2;
    backdrop.height = canvas.height + margin * 2;
    bleedX = margin / dpr;
    bleedY = bleedX;
    backdropCtx.setTransform(dpr, 0, 0, dpr, margin, margin);
    backdropCtx.clearRect(-bleedX, -bleedY, widthPx + bleedX * 2, heightPx + bleedY * 2);
    paintStillBackdrop(backdropCtx, world);
    backdropKey = key;
    return true;
  }

  function blitBackdrop() {
    ctx.drawImage(backdrop, -bleedX, -bleedY, backdrop.width / dpr, backdrop.height / dpr);
  }

  // The bake is a full-screen backing store and Safari is slow to reclaim those,
  // so a torn-down run hands it back explicitly. A later frame just re-bakes.
  function dispose() {
    backdropKey = "";
    backdrop.width = 0;
    backdrop.height = 0;
  }

  // Clip to "everything the canvas can show, minus the field plate", so a decor
  // pass lands on the sky and stops at the plate's edge. Even-odd over the two
  // sub-paths does the subtraction; the margin covers the bake's bleed.
  function clipOutsideField(c, x, y, w, h) {
    const m = BLEED * 2;
    c.beginPath();
    c.rect(-m, -m, widthPx + m * 2, heightPx + m * 2);
    roundRectPath(c, x, y, w, h, FIELD_RADIUS);
    c.clip("evenodd");
  }

  function paintStillBackdrop(c, world) {
    const x = offsetX, y = offsetY;
    const w = GRID.cols * cellPx;
    const h = GRID.rows * cellPx;

    drawSky(c, world, widthPx, heightPx);
    // Full-strength decor covers the sky only — the plate is cut out of it.
    // Uncut, it also showed through the 0.68-alpha plate at ~0.32 strength and
    // added itself to the dimmed pass below, so still-decor worlds ran hotter
    // inside the field than DECOR_IN_FIELD asked for, and hotter than the
    // live-decor worlds, whose sky pass has always cut the plate out.
    c.save();
    clipOutsideField(c, x, y, w, h);
    drawStillDecor(c, world, widthPx, heightPx, 1);
    // Calm mode bakes the moving decor too, frozen: the sky keeps its stars and
    // snow, they just don't drift.
    if (REDUCED) drawLiveDecor(c, world, widthPx, heightPx, 0, 1);
    c.restore();

    // Play area: translucent, so the sky and its decor stay legible underneath.
    const grad = c.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, world.field[0]);
    grad.addColorStop(1, world.field[1]);
    c.fillStyle = grad;
    c.globalAlpha = FIELD_ALPHA;
    roundRect(c, x, y, w, h, FIELD_RADIUS); c.fill();
    c.globalAlpha = 1;

    // Second, dimmed decor pass clipped to the plate — this is what makes
    // Candy Land tell itself apart from Space in the middle of the board.
    c.save();
    roundRect(c, x, y, w, h, FIELD_RADIUS); c.clip();
    drawStillDecor(c, world, widthPx, heightPx, DECOR_IN_FIELD);
    if (REDUCED) drawLiveDecor(c, world, widthPx, heightPx, 0, DECOR_IN_FIELD);
    c.restore();

    // grid lines (very subtle)
    c.strokeStyle = world.grid;
    c.lineWidth = 1;
    c.beginPath();
    for (let i = 1; i < GRID.cols; i++) {
      c.moveTo(x + i * cellPx + 0.5, y);
      c.lineTo(x + i * cellPx + 0.5, y + h);
    }
    for (let j = 1; j < GRID.rows; j++) {
      c.moveTo(x, y + j * cellPx + 0.5);
      c.lineTo(x + w, y + j * cellPx + 0.5);
    }
    c.stroke();

    drawFieldFrame(c, world, x, y, w, h);
  }

  // Outer glow stroke, a crisp accent line just inside it, and four corner
  // rivets — enough frame that the softer plate still reads as a play area.
  function drawFieldFrame(c, world, x, y, w, h) {
    c.save();
    c.shadowColor = world.border;
    c.shadowBlur = 18;
    c.strokeStyle = world.border;
    c.globalAlpha = 0.78;
    c.lineWidth = 2;
    roundRect(c, x, y, w, h, FIELD_RADIUS); c.stroke();
    c.restore();

    c.save();
    c.strokeStyle = world.accent;
    c.globalAlpha = 0.32;
    c.lineWidth = 1;
    roundRect(c, x + 5.5, y + 5.5, w - 11, h - 11, FIELD_RADIUS - 5); c.stroke();

    const dot = Math.max(2.2, cellPx * 0.12);
    const inset = FIELD_RADIUS * 0.44;
    c.globalAlpha = 0.9;
    c.fillStyle = world.accent;
    c.shadowColor = world.accent;
    c.shadowBlur = 9;
    for (const sx of [0, 1]) {
      for (const sy of [0, 1]) {
        c.beginPath();
        c.arc(x + (sx ? w - inset : inset), y + (sy ? h - inset : inset), dot, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.restore();
  }

  function drawFieldBg(worldId, t) {
    if (!widthPx || !heightPx) return;
    const world = getWorld(worldId);
    const x = offsetX, y = offsetY;
    const w = GRID.cols * cellPx;
    const h = GRID.rows * cellPx;

    if (bakeBackdrop(worldId, world)) blitBackdrop();
    else paintStillBackdrop(ctx, world);

    if (REDUCED || !LIVE_DECOR.has(world.decor)) return;

    // Moving decor, in two clipped passes so it lands at full strength on the
    // sky and dimmed on the plate — the same split the bake gives still decor.
    ctx.save();
    clipOutsideField(ctx, x, y, w, h);
    drawLiveDecor(ctx, world, widthPx, heightPx, t, 1);
    ctx.restore();

    ctx.save();
    roundRect(ctx, x, y, w, h, FIELD_RADIUS);
    ctx.clip();
    drawLiveDecor(ctx, world, widthPx, heightPx, t, DECOR_IN_FIELD);
    ctx.restore();
  }

  function drawApple(cell, t, worldId) {
    const world = getWorld(worldId);
    const [highlight, middle, dark, leaf] = world.apple;
    const { x, y } = cellToPx(cell.x, cell.y);
    const r = cellPx * 0.42;
    const cx = x + cellPx / 2;
    const cy = y + cellPx / 2;
    // bounce scale
    const s = 1 + Math.sin(t / 220) * 0.08;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);

    // stem + leaf go down first so they tuck into the dimple
    ctx.strokeStyle = "#a06a34";
    ctx.lineWidth = Math.max(1.4, r * 0.18);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.6);
    ctx.quadraticCurveTo(r * 0.04, -r * 0.95, r * 0.18, -r * 1.08);
    ctx.stroke();
    ctx.fillStyle = leaf;
    ctx.beginPath();
    ctx.ellipse(r * 0.46, -r * 1.0, r * 0.34, r * 0.15, -0.6, 0, Math.PI * 2);
    ctx.fill();

    // Two overlapping lobes union into the classic apple silhouette — the gap
    // between their tops is the dimple the stem sits in.
    ctx.shadowColor = middle;
    ctx.shadowBlur = 14;
    const g = ctx.createRadialGradient(-r * 0.36, -r * 0.4, r * 0.05, 0, 0, r * 1.3);
    g.addColorStop(0, highlight);
    g.addColorStop(0.5, middle);
    g.addColorStop(1, dark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(-r * 0.4, r * 0.05, r * 0.72, r * 0.9, 0, 0, Math.PI * 2);
    ctx.ellipse( r * 0.4, r * 0.05, r * 0.72, r * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();

    // shine
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.beginPath();
    ctx.ellipse(-r * 0.46, -r * 0.34, r * 0.26, r * 0.13, -0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawGolden(cell, t) {
    const { x, y } = cellToPx(cell.x, cell.y);
    const r = cellPx * 0.5;
    const cx = x + cellPx / 2;
    const cy = y + cellPx / 2;
    const s = 1 + Math.sin(t / 160) * 0.12;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    ctx.rotate(t / 600);
    ctx.shadowColor = "#ffe066";
    ctx.shadowBlur = 26;
    const g = ctx.createConicGradient(t / 400, 0, 0);
    g.addColorStop(0,    "#ff3bd4");
    g.addColorStop(0.2,  "#ffe066");
    g.addColorStop(0.4,  "#36f1ff");
    g.addColorStop(0.6,  "#8a4bff");
    g.addColorStop(0.8,  "#ffe066");
    g.addColorStop(1,    "#ff3bd4");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    // shine
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.beginPath();
    ctx.ellipse(-r * 0.35, -r * 0.4, r * 0.25, r * 0.12, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // orbiting sparkles
    ctx.save();
    for (let i = 0; i < 3; i++) {
      const a = t / 520 + (i * Math.PI * 2) / 3;
      const orbit = r * (1.45 + Math.sin(t / 300 + i) * 0.12);
      ctx.globalAlpha = 0.4 + (Math.sin(t / 210 + i * 2) + 1) * 0.28;
      ctx.fillStyle = i === 1 ? "#ffffff" : "#ffe066";
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * orbit, cy + Math.sin(a) * orbit * 0.72, r * 0.11, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // floating "67" label
    ctx.save();
    const labelPx = Math.max(9, Math.round(cellPx * 0.55));
    ctx.font = `900 ${labelPx}px 'Lilita One', system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#0a0820";
    ctx.fillText("67", cx, cy + labelPx * 0.07);
    ctx.restore();
  }

  // Reused every frame so a 60fps loop allocates nothing per segment.
  const cellX = [];
  const cellY = [];
  const pointPool = [];               // every run's pixel points, back to back
  const runRanges = [];               // flat quads: offset, count, idxFirst, idxLast
  const runPoints = [];               // windowed view into pointPool for one run
  const lookPx = { x: 0, y: 0 };
  const bodyOpts = { width: 0, t: 0, u0: 0, u1: 1, index0: 0, indexStep: -1, glow: 0, flash: 0, drain: 0 };

  // Death beat, all derived from anim.getDeathT(): one white pop, then the
  // colour drains out of the whole snake while the head goes dizzy.
  const DEATH_FLASH_MS = 170;
  const DEATH_DRAIN_MS = 850;
  const DEATH_DRAIN_MAX = 0.62;
  function deathFlash(deathT) {
    return deathT < 0 ? 0 : Math.max(0, 1 - deathT / DEATH_FLASH_MS);
  }
  function deathDrain(deathT) {
    return deathT < 0 ? 0 : Math.min(1, deathT / DEATH_DRAIN_MS) * DEATH_DRAIN_MAX;
  }

  // opts: { prevBody, alpha, anim, look } — prevBody/alpha come from the tick
  // interpolation in game.js, anim is a createSnakeAnim() the renderer only reads.
  function drawSnake(snake, skinId, t, opts = {}) {
    const body = snake.body;
    const n = body.length;
    if (!n || !cellPx) return;
    const skin = getSkin(skinId);
    const prev = opts.prevBody && opts.prevBody.length ? opts.prevBody : body;
    const alpha = opts.alpha ?? 1;
    const anim = opts.anim || null;

    // Interpolated cell-space centers, index-aligned with body (0 = head). A hop
    // longer than one cell means the segment wrapped, so its previous position is
    // unrolled past the wall and the lerp travels out through the edge.
    for (let i = 0; i < n; i++) {
      const c = body[i];
      const p = prev[Math.min(i, prev.length - 1)];
      let px = p.x;
      let py = p.y;
      if (c.x - px > 1) px += GRID.cols;
      else if (c.x - px < -1) px -= GRID.cols;
      if (c.y - py > 1) py += GRID.rows;
      else if (c.y - py < -1) py -= GRID.rows;
      cellX[i] = px + (c.x - px) * alpha;
      cellY[i] = py + (c.y - py) * alpha;
    }

    const bodyW = cellPx * 0.8;
    const last = n - 1;
    const span = Math.max(1, last);

    ctx.save();
    roundRect(ctx, offsetX, offsetY, GRID.cols * cellPx, GRID.rows * cellPx, FIELD_RADIUS);
    ctx.clip();

    // Lay out the runs first. A run covers body indices runStart..i (head end ..
    // tail end); where a wrap cut it we carry one unrolled neighbour past the
    // wall so both halves run into the edge instead of stopping a cell short.
    // The clip trims the rest.
    let used = 0;
    let runs = 0;
    let runStart = 0;
    for (let i = 0; i < n; i++) {
      if (i < last && !splitAfter(i)) continue;
      const offset = used;
      if (i < last) {
        used = poolPoint(used, unwrap(cellX[i + 1], cellX[i], GRID.cols),
                               unwrap(cellY[i + 1], cellY[i], GRID.rows));
      }
      for (let j = i; j >= runStart; j--) used = poolPoint(used, cellX[j], cellY[j]);
      if (runStart > 0) {
        used = poolPoint(used, unwrap(cellX[runStart - 1], cellX[runStart], GRID.cols),
                               unwrap(cellY[runStart - 1], cellY[runStart], GRID.rows));
      }
      runRanges[runs * 4]     = offset;
      runRanges[runs * 4 + 1] = used - offset;
      runRanges[runs * 4 + 2] = i < last ? i + 1 : i;
      runRanges[runs * 4 + 3] = runStart > 0 ? runStart - 1 : runStart;
      runs++;
      runStart = i + 1;
    }

    // Glow: every run batched into one path so a wrapping snake still costs the
    // frame exactly one shadowBlur.
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (let r = 0; r < runs; r++) {
      traceBody(ctx, runView(r), runRanges[r * 4 + 1]);
    }
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = skin.glow;
    ctx.shadowColor = skin.glow;
    ctx.shadowBlur = bodyW * 0.9;
    ctx.lineWidth = bodyW * 1.25;
    ctx.stroke();
    ctx.restore();

    const deathT = anim ? anim.getDeathT() : -1;
    bodyOpts.width = bodyW;
    bodyOpts.t = t;
    bodyOpts.flash = deathFlash(deathT);
    bodyOpts.drain = deathDrain(deathT);
    for (let r = 0; r < runs; r++) {
      const idxFirst = runRanges[r * 4 + 2];
      bodyOpts.u0 = 1 - idxFirst / span;
      bodyOpts.u1 = 1 - runRanges[r * 4 + 3] / span;
      bodyOpts.index0 = idxFirst;
      drawSnakeBodyPath(ctx, runView(r), skin, bodyOpts);
    }

    // The head always sits in run 0, ending at its last point.
    let headAngle = 0;
    if (runs && runRanges[1] >= 2) {
      const end = runRanges[0] + runRanges[1] - 1;
      headAngle = Math.atan2(pointPool[end].y - pointPool[end - 1].y,
                             pointPool[end].x - pointPool[end - 1].x);
    }

    let look = null;
    if (opts.look) {
      lookPx.x = offsetX + (opts.look.x + 0.5) * cellPx;
      lookPx.y = offsetY + (opts.look.y + 0.5) * cellPx;
      look = lookPx;
    }
    const headR = bodyW * 0.625; // head is 1.25x body width so the face reads small
    drawSnakeHead(ctx,
      offsetX + (cellX[0] + 0.5) * cellPx,
      offsetY + (cellY[0] + 0.5) * cellPx,
      headAngle, headR, skin, anim, look, t, bodyOpts.flash, bodyOpts.drain);
    if (n > 1 && splitAfter(0)) {
      // Mid-wrap: the same head is still leaning out of the opposite wall.
      drawSnakeHead(ctx,
        offsetX + (unwrap(cellX[0], cellX[1], GRID.cols) + 0.5) * cellPx,
        offsetY + (unwrap(cellY[0], cellY[1], GRID.rows) + 0.5) * cellPx,
        headAngle, headR, skin, anim, look, t, bodyOpts.flash, bodyOpts.drain);
    }
    ctx.restore();
  }

  function splitAfter(i) {
    return Math.abs(cellX[i] - cellX[i + 1]) > 1.5 || Math.abs(cellY[i] - cellY[i + 1]) > 1.5;
  }

  function poolPoint(k, cx, cy) {
    let p = pointPool[k];
    if (!p) { p = { x: 0, y: 0 }; pointPool[k] = p; }
    p.x = offsetX + (cx + 0.5) * cellPx;
    p.y = offsetY + (cy + 0.5) * cellPx;
    return k + 1;
  }

  // Re-point runPoints at run r's slice of the pool — no copying, no allocation.
  function runView(r) {
    const offset = runRanges[r * 4];
    const count = runRanges[r * 4 + 1];
    for (let j = 0; j < count; j++) runPoints[j] = pointPool[offset + j];
    runPoints.length = count;
    return runPoints;
  }

  function getCellPx() { return cellPx; }
  function getOrigin() { return { x: offsetX, y: offsetY }; }
  function getSize()   { return { w: widthPx, h: heightPx }; }

  return {
    ctx,
    resize,
    clear,
    dispose,
    drawFieldBg,
    drawApple,
    drawGolden,
    drawSnake,
    cellToPx,
    getCellPx,
    getOrigin,
    getSize,
  };
}

// Pick the copy of `v` that sits next to `anchor` on a wrapping axis.
function unwrap(v, anchor, mod) {
  const d = v - anchor;
  if (d > mod / 2) return v - mod;
  if (d < -mod / 2) return v + mod;
  return v;
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

const RAMP_STEPS = 16;
const rampCache = new Map();

function parseHex(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

// Colour ramp down the body: bright near the head, deep at the tail. Cached per
// skin so the per-frame stroke loop only indexes into ready-made strings.
function bodyRamp(lightHex, darkHex) {
  const key = lightHex + darkHex;
  let ramp = rampCache.get(key);
  if (ramp) return ramp;
  const [lr, lg, lb] = parseHex(lightHex);
  const [dr, dg, db] = parseHex(darkHex);
  ramp = new Array(RAMP_STEPS);
  for (let i = 0; i < RAMP_STEPS; i++) {
    const m = 0.16 + 0.66 * (i / (RAMP_STEPS - 1));
    ramp[i] = `rgb(${Math.round(dr + (lr - dr) * m)},${Math.round(dg + (lg - dg) * m)},${Math.round(db + (lb - db) * m)})`;
  }
  rampCache.set(key, ramp);
  return ramp;
}

// Rainbow Boa: hue rotates per segment and over time.
function rainbowAt(index, t) {
  const hue = (((index * 22 + t / 16) % 360) + 360) % 360;
  return `hsl(${hue} 100% 65%)`;
}

// Smooth polyline: corners are rounded by curving through each point with the
// segment midpoints as anchors, so a right-angle turn reads as an arc. Adds a
// sub-path to whatever is open, so several runs can share one path.
function traceBody(ctx, points, n) {
  if (n === 1) {
    ctx.moveTo(points[0].x, points[0].y);
    ctx.lineTo(points[0].x + 0.01, points[0].y);
    return;
  }
  ctx.moveTo(points[0].x, points[0].y);
  ctx.lineTo((points[0].x + points[1].x) / 2, (points[0].y + points[1].y) / 2);
  for (let i = 1; i < n - 1; i++) {
    const p = points[i];
    const q = points[i + 1];
    ctx.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2);
  }
  ctx.lineTo(points[n - 1].x, points[n - 1].y);
}

// Draw a connected snake body through precomputed pixel `points`, ordered
// tail -> head. Three full-path passes (glow, body, highlight) instead of one
// blurred blob per segment — an old iPad can only afford one shadowBlur.
// opts:
//   width      full body width in px at the head end
//   taper      width multiplier at the tail end (default 0.5)
//   u0, u1     body fraction at points[0] / points[n-1] (0 = tail tip, 1 = neck)
//   t          milliseconds, for the Rainbow Boa hue cycle
//   index0     body segment index of points[0], and indexStep per point (hue)
//   glow       alpha of the glow pass, 0 to skip it
//   highlight  draw the chrome spine highlight (default true)
//   flash      0-1 white blow-out over the body (death impact)
//   drain      0-1 grey wash over the body (colour draining after death)
export function drawSnakeBodyPath(ctx, points, skin, opts = {}) {
  const n = points.length;
  if (!n) return;
  const width = opts.width ?? 10;
  const t = opts.t ?? 0;
  const taper = opts.taper ?? 0.5;
  const u0 = opts.u0 ?? 0;
  const u1 = opts.u1 ?? 1;
  const glow = opts.glow ?? 0.18;
  const index0 = opts.index0 ?? 0;
  const indexStep = opts.indexStep ?? 1;
  const flash = opts.flash ?? 0;
  const drain = opts.drain ?? 0;
  const rainbow = skin.body === null;
  const ramp = rainbow ? null : bodyRamp(skin.body[0], skin.body[1]);

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (n === 1) {
    ctx.beginPath();
    ctx.arc(points[0].x, points[0].y, width / 2, 0, Math.PI * 2);
    ctx.fillStyle = rainbow ? rainbowAt(index0, t) : ramp[RAMP_STEPS - 1];
    ctx.fill();
    if (drain > 0) { ctx.globalAlpha = drain; ctx.fillStyle = "#8a8fa6"; ctx.fill(); }
    if (flash > 0) { ctx.globalAlpha = flash; ctx.fillStyle = "#ffffff"; ctx.fill(); }
    ctx.restore();
    return;
  }

  // 1) one soft glow stroke — the only shadowBlur the snake costs. drawSnake
  //    passes glow: 0 and batches every run's glow into a single blurred stroke.
  if (glow > 0) {
    ctx.beginPath();
    traceBody(ctx, points, n);
    ctx.globalAlpha = glow;
    ctx.strokeStyle = skin.glow;
    ctx.shadowColor = skin.glow;
    ctx.shadowBlur = width * 0.9;
    ctx.lineWidth = width * 1.25;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  // 2) the body, as short round-capped pieces so width and colour can change
  //    along the length; the round caps hide the joins between them
  for (let j = 0; j < n; j++) {
    const u = clamp01(u0 + (u1 - u0) * (j / (n - 1)));
    ctx.beginPath();
    if (j === 0) {
      ctx.moveTo(points[0].x, points[0].y);
      ctx.lineTo((points[0].x + points[1].x) / 2, (points[0].y + points[1].y) / 2);
    } else if (j === n - 1) {
      ctx.moveTo((points[n - 2].x + points[n - 1].x) / 2, (points[n - 2].y + points[n - 1].y) / 2);
      ctx.lineTo(points[n - 1].x, points[n - 1].y);
    } else {
      const p = points[j];
      const a = points[j - 1];
      const b = points[j + 1];
      ctx.moveTo((a.x + p.x) / 2, (a.y + p.y) / 2);
      ctx.quadraticCurveTo(p.x, p.y, (p.x + b.x) / 2, (p.y + b.y) / 2);
    }
    ctx.lineWidth = width * (taper + (1 - taper) * u);
    ctx.strokeStyle = rainbow
      ? rainbowAt(index0 + indexStep * j, t)
      : ramp[Math.round(u * (RAMP_STEPS - 1))];
    ctx.stroke();
    // Death wash: restroke the piece we just laid down, so the grey/white
    // follows the exact taper instead of fattening the tail.
    if (drain > 0) {
      ctx.globalAlpha = drain;
      ctx.strokeStyle = "#8a8fa6";
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (flash > 0) {
      ctx.globalAlpha = flash;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // 3) thin chrome highlight, nudged up-left so the tube looks lit from above
  if (opts.highlight !== false) {
    ctx.translate(-width * 0.1, -width * 0.14);
    ctx.beginPath();
    traceBody(ctx, points, n);
    ctx.lineWidth = width * 0.22;
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.stroke();
  }

  ctx.restore();
}

// Cartoon head: an oriented ellipse with big eyes, a mood mouth and a flicking
// tongue. `r` is the head radius across the heading; `anim` is read-only (pass
// null for a plain idle face). Exported so the title mascot and the skin-chip
// previews draw the same face as the playfield.
export function drawSnakeHead(ctx, x, y, angle, r, skin, anim, look, t, flash = 0, drain = 0) {
  const mood   = anim ? anim.getMood() : "idle";
  const blink  = anim ? anim.getBlink() : 0;
  const tongue = anim ? anim.getTongue() : 0;
  const squash = anim ? anim.getSquash() : 0;
  const clock  = anim ? anim.getTime() : t;
  const dizzy  = mood === "dizzy";

  const rot = angle + (dizzy ? Math.sin(clock / 95) * 0.22 : 0);
  const hrx = r * 1.3; // snout length — leaves room for a mouth in front of the eyes
  const hry = r;

  // where to point the pupils, in head-local axes
  let lookAlong = 0;
  let lookAcross = 0;
  if (look) {
    const dx = look.x - x;
    const dy = look.y - y;
    const d = Math.hypot(dx, dy);
    if (d > 0.001) {
      const ca = Math.cos(rot);
      const sa = Math.sin(rot);
      lookAlong  = (ca * dx + sa * dy) / d;
      lookAcross = (-sa * dx + ca * dy) / d;
    }
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(1 - squash * 0.2, 1 + squash * 0.18); // bite squash

  // tongue first so its root disappears under the head
  if (tongue > 0.02 && !dizzy) {
    const tip = hrx * (0.85 + tongue * 0.9);
    const fork = tip - hrx * 0.34 * tongue;
    ctx.strokeStyle = "#ff3b6b";
    ctx.lineWidth = Math.max(1, hrx * 0.14);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(hrx * 0.3, 0);
    ctx.lineTo(fork, 0);
    ctx.moveTo(fork, 0);
    ctx.lineTo(tip, -hry * 0.3 * tongue);
    ctx.moveTo(fork, 0);
    ctx.lineTo(tip, hry * 0.3 * tongue);
    ctx.stroke();
  }

  const g = ctx.createRadialGradient(-hrx * 0.1, -hry * 0.4, hrx * 0.06, 0, 0, hrx * 1.15);
  g.addColorStop(0, skin.head[0]);
  g.addColorStop(1, skin.head[1]);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, hrx, hry, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.26)";
  ctx.beginPath();
  ctx.ellipse(-hrx * 0.5, -hry * 0.4, hrx * 0.22, hry * 0.13, -0.35, 0, Math.PI * 2);
  ctx.fill();

  // Death wash goes on before the face so the X-eyes stay readable on top.
  if (drain > 0 || flash > 0) {
    ctx.beginPath();
    ctx.ellipse(0, 0, hrx, hry, 0, 0, Math.PI * 2);
    if (drain > 0) {
      ctx.globalAlpha = drain;
      ctx.fillStyle = "#8a8fa6";
      ctx.fill();
    }
    if (flash > 0) {
      ctx.globalAlpha = flash;
      ctx.fillStyle = "#ffffff";
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // mouth
  if (mood === "chomp") {
    ctx.fillStyle = "#4a0f22";
    ctx.beginPath();
    ctx.moveTo(hrx * 0.12, 0);
    ctx.arc(0, 0, hrx * 0.86, -0.55, 0.55);
    ctx.closePath();
    ctx.fill();
  } else if (dizzy) {
    ctx.fillStyle = "#4a0f22";
    ctx.beginPath();
    ctx.ellipse(hrx * 0.6, 0, hrx * 0.16, hry * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const happy = mood === "happy";
    ctx.strokeStyle = "#2a0a2e";
    ctx.lineWidth = Math.max(1.2, hry * (happy ? 0.16 : 0.12));
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(hrx * 0.2, 0, hrx * 0.4, happy ? -1.05 : -0.7, happy ? 1.05 : 0.7);
    ctx.stroke();
  }

  if (mood === "happy") {
    ctx.fillStyle = "rgba(255,120,170,0.45)";
    for (let s = -1; s <= 1; s += 2) {
      ctx.beginPath();
      ctx.ellipse(-hrx * 0.55, hry * 0.55 * s, hrx * 0.14, hry * 0.14, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // eyes
  const open = 1 - blink;
  const eR = hry * 0.42;
  const eAlong = -hrx * 0.1;
  const eAcross = hry * 0.46;
  for (let s = -1; s <= 1; s += 2) {
    const ey = eAcross * s;
    if (dizzy) {
      ctx.strokeStyle = "#0a0820";
      ctx.lineWidth = Math.max(1, eR * 0.3);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(eAlong - eR * 0.6, ey - eR * 0.6);
      ctx.lineTo(eAlong + eR * 0.6, ey + eR * 0.6);
      ctx.moveTo(eAlong + eR * 0.6, ey - eR * 0.6);
      ctx.lineTo(eAlong - eR * 0.6, ey + eR * 0.6);
      ctx.stroke();
      continue;
    }
    if (open > 0.12) {
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "rgba(10,8,32,0.5)";
      ctx.lineWidth = Math.max(0.8, eR * 0.15);
      ctx.beginPath();
      ctx.ellipse(eAlong, ey, eR, eR * open, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    if (open > 0.35) {
      const pR = eR * 0.5;
      const pupilX = eAlong + lookAlong * eR * 0.34;
      const pupilY = ey + lookAcross * eR * 0.34;
      ctx.fillStyle = "#0a0820";
      ctx.beginPath();
      ctx.ellipse(pupilX, pupilY, pR, pR * open, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.beginPath();
      ctx.arc(pupilX - pR * 0.3, pupilY - pR * 0.35, pR * 0.33, 0, Math.PI * 2);
      ctx.fill();
    }
    if (open < 0.5) {
      // lid folding in toward the middle of the head
      ctx.strokeStyle = "#0a0820";
      ctx.lineWidth = Math.max(1, eR * 0.2);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(eAlong - eR * 0.85, ey);
      ctx.quadraticCurveTo(eAlong, ey - s * eR * 0.5 * (1 - open), eAlong + eR * 0.85, ey);
      ctx.stroke();
    }
  }

  ctx.restore();

  // Dizzy stars orbit in screen space, not head space — they should keep
  // circling the same way however the snake was pointing when it crashed.
  if (dizzy) {
    const deathT = anim ? anim.getDeathT() : 0;
    const fade = deathT < 0 ? 1 : Math.min(1, deathT / 260);
    if (fade > 0.01) {
      const orbit = r * 1.6;
      ctx.save();
      ctx.globalAlpha = fade;
      for (let i = 0; i < 3; i++) {
        const a = clock / 260 + (i * Math.PI * 2) / 3;
        star(ctx,
          x + Math.cos(a) * orbit,
          y - r * 1.9 + Math.sin(a) * orbit * 0.34,
          r * 0.38, a * 0.7,
          i === 1 ? "#ffffff" : "#ffe066");
      }
      ctx.restore();
    }
  }
}

// Five-pointed star, centred, `outer` is the point radius.
function star(ctx, x, y, outer, rot, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 ? outer * 0.44 : outer;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const px = Math.cos(a) * rad;
    const py = Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function seeded(index, salt = 0) {
  const value = Math.sin((index + 1) * (12.9898 + salt * 7.233)) * 43758.5453;
  return value - Math.floor(value);
}

function drawSky(ctx, world, width, height) {
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, world.sky[0]);
  sky.addColorStop(1, world.sky[1]);
  ctx.fillStyle = sky;
  ctx.fillRect(-BLEED, -BLEED, width + BLEED * 2, height + BLEED * 2);
}

// Decor is split by whether it moves. The still half bakes into the backdrop
// cache; the moving half is redrawn each frame. Both take a `dim` multiplier so
// the same routine can paint the sky at full strength and the field faintly.
const LIVE_DECOR = new Set(["fireflies", "snow", "embers", "stars"]);

function drawStillDecor(ctx, world, width, height, dim) {
  ctx.save();
  switch (world.decor) {
    case "candy":
      ctx.lineWidth = 4;
      for (let i = 0; i < 18; i++) {
        const x = seeded(i, 4) * width;
        const y = seeded(i, 5) * height;
        const radius = 7 + seeded(i, 6) * 18;
        ctx.globalAlpha = 0.18 * dim;
        ctx.strokeStyle = i % 2 ? "#75f4ff" : "#ff9ee8";
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x - radius * 1.55, y);
        ctx.lineTo(x + radius * 1.55, y);
        ctx.stroke();
      }
      break;

    case "leaves":
      for (let i = 0; i < 24; i++) {
        const x = seeded(i, 7) * width;
        const y = seeded(i, 8) * height;
        const angle = seeded(i, 9) * Math.PI;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.globalAlpha = 0.16 * dim;
        ctx.fillStyle = i % 3 === 0 ? "#f6db55" : "#77f05a";
        ctx.beginPath();
        ctx.ellipse(0, 0, 5, 15, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      break;

    case "arcade": {
      const horizon = height * 0.36;
      ctx.globalAlpha = 0.2 * dim;
      ctx.strokeStyle = "#36f1ff";
      ctx.lineWidth = 1;
      for (let i = -8; i <= 8; i++) {
        ctx.beginPath();
        ctx.moveTo(width / 2, horizon);
        ctx.lineTo(width / 2 + i * width / 7, height + 20);
        ctx.stroke();
      }
      ctx.strokeStyle = "#ff3bd4";
      for (let y = horizon; y < height + 30; y += Math.max(18, (y - horizon) * 0.18 + 18)) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      break;
    }

    // The 67s used to breathe between alpha 0.10 and 0.17 — invisible, and 18
    // fillText calls a frame. They're baked at the midpoint instead.
    case "sixtyseven":
      ctx.font = "900 54px 'Lilita One', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let i = 0; i < 18; i++) {
        const x = seeded(i, 23) * width;
        const y = seeded(i, 24) * height;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate((seeded(i, 25) - 0.5) * 0.7);
        ctx.globalAlpha = 0.135 * dim;
        ctx.fillStyle = i % 2 ? "#ffe066" : "#36f1ff";
        ctx.fillText("67", 0, 0);
        ctx.restore();
      }
      break;
  }
  ctx.restore();
}

function drawLiveDecor(ctx, world, width, height, t, dim) {
  ctx.save();
  switch (world.decor) {
    case "fireflies":
      for (let i = 0; i < 26; i++) {
        const x = seeded(i, 1) * width;
        const y = seeded(i, 2) * height;
        const pulse = 0.35 + (Math.sin(t / 420 + i) + 1) * 0.25;
        ctx.globalAlpha = pulse * dim;
        ctx.fillStyle = i % 3 === 0 ? "#fff58a" : "#7dff9b";
        ctx.beginPath();
        ctx.arc(x, y, 1.5 + seeded(i, 3) * 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      break;

    case "snow":
      for (let i = 0; i < 44; i++) {
        const x = seeded(i, 10) * width;
        const speed = 0.012 + seeded(i, 11) * 0.02;
        const y = (seeded(i, 12) * height + t * speed) % Math.max(1, height);
        ctx.globalAlpha = (0.25 + seeded(i, 13) * 0.5) * dim;
        ctx.fillStyle = "#eaffff";
        ctx.beginPath();
        ctx.arc(x, y, 1 + seeded(i, 14) * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      break;

    case "embers":
      for (let i = 0; i < 36; i++) {
        const x = seeded(i, 15) * width;
        const speed = 0.018 + seeded(i, 16) * 0.026;
        const y = height - ((seeded(i, 17) * height + t * speed) % Math.max(1, height));
        ctx.globalAlpha = (0.25 + seeded(i, 18) * 0.55) * dim;
        ctx.fillStyle = i % 3 ? "#ff6738" : "#ffd058";
        ctx.beginPath();
        ctx.arc(x, y, 1 + seeded(i, 19) * 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      break;

    case "stars":
      for (let i = 0; i < 60; i++) {
        const x = seeded(i, 20) * width;
        const y = seeded(i, 21) * height;
        const twinkle = 0.25 + (Math.sin(t / 350 + i * 1.7) + 1) * 0.3;
        ctx.globalAlpha = twinkle * dim;
        ctx.fillStyle = i % 7 === 0 ? "#bf66ff" : "#f4f1ff";
        ctx.beginPath();
        ctx.arc(x, y, 0.8 + seeded(i, 22) * 2.3, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  roundRectPath(ctx, x, y, w, h, r);
}

// Same shape, appended to whatever path is already open — lets drawFieldBg
// build a "canvas minus field" clip in one even-odd path.
function roundRectPath(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
