// Core game loop and state.
// Public API: createGame({canvas, hud, onMilestone, onDeath, onScoreChange}).
// .start() to begin a new run, .destroy() to stop.

import { GRID, TICK, SCORE, MILESTONES } from "./config.js";
import { createRenderer } from "./renderer.js";
import { createInput } from "./input.js";
import { createEffects } from "./effects.js";
import { createSnakeAnim } from "./snakeAnim.js";
import { sfx } from "./audio.js";
import { haptics } from "./haptics.js";
import { storage } from "./storage.js";
import { getWorld as worldTheme } from "./worlds.js";

const DIRS = {
  up:    { x: 0, y: -1 },
  down:  { x: 0, y:  1 },
  left:  { x: -1, y: 0 },
  right: { x: 1,  y: 0 },
};

function eq(a, b) { return a.x === b.x && a.y === b.y; }
function opposite(a, b) { return a.x === -b.x && a.y === -b.y; }
function wrap(v, mod) { return ((v % mod) + mod) % mod; }

export function createGame({ canvas, onMilestone, onDeath, onScoreChange, onGolden, getSkin, getWorld }) {
  const renderer = createRenderer(canvas);
  const effects = createEffects();
  const input = createInput(canvas);
  const anim = createSnakeAnim();
  // Reused each frame so rendering allocates nothing per frame.
  const snakeOpts = { prevBody: null, alpha: 1, anim, look: null };

  let snake, dir, queuedDirs, apple, golden, score, tickMs, lastApplePos;
  let prevBody = [];   // where each segment sat last tick, for render interpolation
  let alive = false;
  let paused = false;
  let lastTickAt = 0;
  let lastEatAt = 0;
  let combo = 0;
  let rafId = 0;
  let lastFrame = 0;
  let goldenSpawnedAt = 0;
  let firedMilestones = new Set();
  const onResize = () => renderer.resize();

  function initState() {
    const cx = Math.floor(GRID.cols / 2);
    const cy = Math.floor(GRID.rows / 2);
    snake = {
      body: [
        { x: cx,     y: cy },
        { x: cx - 1, y: cy },
        { x: cx - 2, y: cy },
      ],
      dir: DIRS.right,
    };
    // Cells are never mutated in place, so a shallow copy is a safe snapshot.
    prevBody = snake.body.slice();
    anim.reset();
    dir = DIRS.right;
    queuedDirs = [];
    score = 0;
    tickMs = TICK.startMs;
    combo = 0;
    lastEatAt = 0;
    golden = null;
    goldenSpawnedAt = 0;
    firedMilestones.clear();
    apple = spawnFood();
    lastApplePos = { ...apple };
    alive = true;
    paused = false;
    onScoreChange?.(score, combo);
  }

  function occupied(cell) {
    if (snake.body.some(s => eq(s, cell))) return true;
    if (apple && eq(apple, cell)) return true;
    if (golden && eq(golden, cell)) return true;
    return false;
  }

  function spawnFood() {
    let c;
    let tries = 0;
    do {
      c = { x: Math.floor(Math.random() * GRID.cols), y: Math.floor(Math.random() * GRID.rows) };
      tries++;
      if (tries > 200) break;
    } while (occupied(c));
    return c;
  }

  function maybeSpawnGolden(now) {
    if (golden) return;
    if (Math.random() < SCORE.goldenChance) {
      let c;
      let tries = 0;
      do {
        c = { x: Math.floor(Math.random() * GRID.cols), y: Math.floor(Math.random() * GRID.rows) };
        tries++;
        if (tries > 200) return;
      } while (occupied(c));
      golden = c;
      goldenSpawnedAt = now;
    }
  }

  function applyDirection(d) {
    if (!alive || paused) return;
    // Compare against the last pending turn (or current heading) so a fast
    // double-swipe queues both turns instead of dropping the first one.
    const ref = queuedDirs.length ? queuedDirs[queuedDirs.length - 1] : dir;
    if (opposite(d, ref)) return; // ignore 180 reversal
    if (eq(d, ref)) return;       // no-op turn
    if (queuedDirs.length >= 2) return;
    queuedDirs.push(d);
  }

  function step(now) {
    if (!alive) return;
    prevBody = snake.body.slice();
    // commit queued direction
    if (queuedDirs.length) {
      dir = queuedDirs.shift();
      snake.dir = dir;
    }
    const head = snake.body[0];
    const next = {
      x: wrap(head.x + dir.x, GRID.cols),
      y: wrap(head.y + dir.y, GRID.rows),
    };

    // self-collision (ignore the tail because it will move unless we're growing)
    let willGrow = false;
    if (golden && eq(next, golden)) willGrow = true;
    if (eq(next, apple)) willGrow = true;
    const compareUntil = willGrow ? snake.body.length : snake.body.length - 1;
    for (let i = 0; i < compareUntil; i++) {
      if (eq(snake.body[i], next)) {
        die();
        return;
      }
    }

    snake.body.unshift(next);
    if (!willGrow) {
      snake.body.pop();
    } else {
      // eat
      let gained = SCORE.appleBase;
      let isGolden = golden && eq(next, golden);
      if (isGolden) {
        gained = SCORE.goldenApple;
        golden = null;
      } else {
        apple = spawnFood();
        // possibly spawn a golden alongside
        maybeSpawnGolden(now);
      }

      // combo logic
      if (now - lastEatAt < SCORE.comboWindowMs) {
        combo = Math.min(SCORE.comboCapMultiplier, combo + 1);
      } else {
        combo = 1;
      }
      lastEatAt = now;
      const multiplier = Math.max(1, combo);
      // The ✨67✨ apple is always worth exactly 67 — no combo multiplication.
      // (It's the whole bit, and it keeps one lucky bite from unlocking
      // every skin at once.) It still extends the combo chain.
      const points = isGolden ? gained : gained * multiplier;
      score += points;

      // visuals + audio
      anim.onEat();
      const { x: px, y: py } = renderer.cellToPx(next.x, next.y);
      const cellPx = renderer.getCellPx();
      if (isGolden) {
        sfx.golden();
        haptics.golden();
        effects.popup(px + cellPx / 2, py + cellPx / 2, `+${points} ✨`, "#ffe066");
        effects.burstConfetti(px + cellPx / 2, py + cellPx / 2, 36, ["#ffe066","#ff3bd4","#36f1ff","#fff"]);
        effects.shake(10, 250);
        onGolden?.(points);
      } else {
        sfx.eat();
        haptics.eat();
        // A little splash in this world's own apple colours, sized to the bite.
        const [shine, flesh, , leaf] = worldTheme(getWorld?.() || "backyard").apple;
        effects.burstConfetti(px + cellPx / 2, py + cellPx / 2, 10, [shine, flesh, leaf], 3.5);
        const maxed = combo >= SCORE.comboCapMultiplier;
        const label = maxed ? `+${points} MAX AURA` : combo > 1 ? `+${points} ×${combo}` : `+${points}`;
        effects.popup(px + cellPx / 2, py + cellPx / 2, label, maxed ? "#ffe066" : combo > 1 ? "#ff3bd4" : "#36f1ff");
        if (combo > 1) {
          sfx.combo(combo);
          haptics.combo();
          effects.shake(4 + combo * 1.5, 140);
        }
      }

      // speed up
      tickMs = Math.max(TICK.minMs, tickMs - TICK.decreasePerApple);

      // milestones — a golden apple can cross several at once; celebrate only
      // the highest so banners don't pile up.
      let topMilestone = null;
      for (const m of MILESTONES) {
        if (!firedMilestones.has(m.at) && score >= m.at) {
          firedMilestones.add(m.at);
          topMilestone = m;
        }
      }
      if (topMilestone) {
        const size = renderer.getSize();
        effects.rainConfetti(size.w, 80);
        effects.shake(8, 320);
        haptics.milestone();
        sfx.milestone();
        onMilestone?.(topMilestone);
      }

      onScoreChange?.(score, combo);
    }

    // expire golden
    if (golden && (now - goldenSpawnedAt) > SCORE.goldenLifetimeMs) {
      golden = null;
    }
  }

  function die() {
    alive = false;
    anim.onDeath();
    haptics.death();
    sfx.death();
    effects.shake(14, 450);
    const size = renderer.getSize();
    effects.rainConfetti(size.w, 30, ["#ff3bd4", "#8a4bff", "#fff"]);

    const prevBest = storage.getBest();
    if (score > prevBest) storage.setBest(score);
    onDeath?.({ score, prevBest, newBest: Math.max(prevBest, score) });
  }

  function frame(now) {
    if (!lastFrame) lastFrame = now;
    const dt = now - lastFrame;
    lastFrame = now;

    if (alive && now - lastTickAt >= tickMs) {
      lastTickAt = now;
      step(now);
    }

    effects.update(dt);
    anim.update(dt);
    render(now);
    rafId = requestAnimationFrame(frame);
  }

  function render(now) {
    renderer.clear();
    const worldId = getWorld?.() || "backyard";
    const shake = effects.getShake();
    const ctx = renderer.ctx;
    ctx.save();
    ctx.translate(shake.dx, shake.dy);
    renderer.drawFieldBg(worldId, now);
    if (apple)  renderer.drawApple(apple, now, worldId);
    if (golden) renderer.drawGolden(golden, now);
    // Render-only interpolation: the snake glides between ticks while the
    // grid-stepped logic above stays exactly as it was.
    snakeOpts.prevBody = prevBody;
    snakeOpts.alpha = alive ? Math.min(1, (now - lastTickAt) / tickMs) : 1;
    snakeOpts.look = golden || apple || null;
    renderer.drawSnake(snake, getSkin?.() || "default", now, snakeOpts);
    effects.drawOverlay(ctx, renderer.getSize().w, renderer.getSize().h);
    ctx.restore();
  }

  // wire input
  input.onDirection(applyDirection);

  return {
    start() {
      renderer.resize();
      window.addEventListener("resize", onResize);
      initState();
      lastTickAt = performance.now();
      lastFrame = 0;
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(frame);
    },
    stop() {
      alive = false;
      paused = false;
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
    },
    pause() {
      if (!alive || paused) return;
      paused = true;
      cancelAnimationFrame(rafId);
    },
    resume() {
      if (!alive || !paused) return;
      paused = false;
      // Reset timing so the snake doesn't fast-forward over the paused gap, and
      // resync prevBody so the restarted lerp doesn't yank it back a cell first.
      prevBody = snake.body.slice();
      lastTickAt = performance.now();
      lastFrame = 0;
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(frame);
    },
    isPaused() { return paused; },
    destroy() {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      input.destroy();
    },
    isAlive() { return alive; },
    getScore() { return score; },
    getCombo() { return combo; },
  };
}
