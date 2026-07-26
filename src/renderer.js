// Canvas 2D rendering for the play field. Sized in CSS pixels; we set the
// transform for devicePixelRatio so lines are crisp.

import { GRID } from "./config.js";
import { getSkin } from "./skins.js";
import { getWorld } from "./worlds.js";

export function createRenderer(canvas) {
  const ctx = canvas.getContext("2d");
  let cellPx = 0;
  let offsetX = 0;
  let offsetY = 0;
  let widthPx = 0;
  let heightPx = 0;

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
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
  }

  function cellToPx(cx, cy) {
    return { x: offsetX + cx * cellPx, y: offsetY + cy * cellPx };
  }

  function clear() {
    ctx.clearRect(0, 0, widthPx, heightPx);
  }

  function drawFieldBg(worldId, t) {
    const world = getWorld(worldId);
    drawWorldBackdrop(ctx, world, widthPx, heightPx, t);

    // Themed grid + glowing border
    const x = offsetX, y = offsetY;
    const w = GRID.cols * cellPx;
    const h = GRID.rows * cellPx;
    // play area background
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, world.field[0]);
    grad.addColorStop(1, world.field[1]);
    ctx.fillStyle = grad;
    ctx.globalAlpha = 0.9;
    roundRect(ctx, x, y, w, h, 18); ctx.fill();
    ctx.globalAlpha = 1;
    // grid lines (very subtle)
    ctx.strokeStyle = world.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < GRID.cols; i++) {
      ctx.moveTo(x + i * cellPx + 0.5, y);
      ctx.lineTo(x + i * cellPx + 0.5, y + h);
    }
    for (let j = 1; j < GRID.rows; j++) {
      ctx.moveTo(x, y + j * cellPx + 0.5);
      ctx.lineTo(x + w, y + j * cellPx + 0.5);
    }
    ctx.stroke();
    // World-color border
    ctx.save();
    ctx.shadowColor = world.border;
    ctx.shadowBlur = 18;
    ctx.strokeStyle = world.border;
    ctx.globalAlpha = 0.78;
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, w, h, 18); ctx.stroke();
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
    ctx.shadowColor = middle;
    ctx.shadowBlur = 14;
    const g = ctx.createRadialGradient(-r/3, -r/3, 2, 0, 0, r);
    g.addColorStop(0, highlight);
    g.addColorStop(0.5, middle);
    g.addColorStop(1, dark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    // leaf
    ctx.shadowBlur = 0;
    ctx.fillStyle = leaf;
    ctx.beginPath();
    ctx.ellipse(r * 0.2, -r * 0.95, r * 0.28, r * 0.12, -0.6, 0, Math.PI * 2);
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
    // floating "67" label
    ctx.save();
    ctx.font = "900 14px 'Lilita One', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#0a0820";
    ctx.fillText("67", cx, cy + 1);
    ctx.restore();
  }

  function drawSnake(snake, skinId, t) {
    const skin = getSkin(skinId);
    const r = cellPx * 0.48;
    // body back-to-front so head sits on top
    for (let i = snake.body.length - 1; i >= 0; i--) {
      const seg = snake.body[i];
      const { x, y } = cellToPx(seg.x, seg.y);
      const cx = x + cellPx / 2;
      const cy = y + cellPx / 2;
      const isHead = i === 0;
      ctx.save();
      ctx.shadowColor = skin.glow;
      ctx.shadowBlur = isHead ? 18 : 10;
      let fill;
      if (skin.body === null) {
        // Rainbow Boa: hue rotates per segment + over time
        const hue = (i * 22 + t / 16) % 360;
        fill = `hsl(${hue} 100% 65%)`;
      } else {
        const stops = isHead ? skin.head : skin.body;
        const g = ctx.createRadialGradient(cx - r/3, cy - r/3, 1, cx, cy, r);
        g.addColorStop(0, stops[0]);
        g.addColorStop(1, stops[1]);
        fill = g;
      }
      ctx.fillStyle = fill;
      const segR = isHead ? r : r * (0.95 - i * 0.005);
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(segR, r * 0.5), 0, Math.PI * 2);
      ctx.fill();
      // chrome highlight
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.beginPath();
      ctx.ellipse(cx - r * 0.3, cy - r * 0.35, r * 0.4, r * 0.18, -0.5, 0, Math.PI * 2);
      ctx.fill();
      if (isHead) {
        // Eyes
        const dx = snake.dir.x;
        const dy = snake.dir.y;
        const eyeOffX = dx * r * 0.25;
        const eyeOffY = dy * r * 0.25;
        const perpX = -dy * r * 0.35;
        const perpY =  dx * r * 0.35;
        const eR = r * 0.18;
        const pR = r * 0.09;
        // eye whites
        ctx.fillStyle = "#fff";
        ctx.beginPath(); ctx.arc(cx + eyeOffX + perpX, cy + eyeOffY + perpY, eR, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + eyeOffX - perpX, cy + eyeOffY - perpY, eR, 0, Math.PI * 2); ctx.fill();
        // pupils (look forward)
        ctx.fillStyle = "#0a0820";
        ctx.beginPath(); ctx.arc(cx + eyeOffX * 1.5 + perpX, cy + eyeOffY * 1.5 + perpY, pR, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + eyeOffX * 1.5 - perpX, cy + eyeOffY * 1.5 - perpY, pR, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }

  function getCellPx() { return cellPx; }
  function getOrigin() { return { x: offsetX, y: offsetY }; }
  function getSize()   { return { w: widthPx, h: heightPx }; }

  return {
    ctx,
    resize,
    clear,
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

function seeded(index, salt = 0) {
  const value = Math.sin((index + 1) * (12.9898 + salt * 7.233)) * 43758.5453;
  return value - Math.floor(value);
}

function drawWorldBackdrop(ctx, world, width, height, t = 0) {
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, world.sky[0]);
  sky.addColorStop(1, world.sky[1]);
  ctx.fillStyle = sky;
  ctx.fillRect(-30, -30, width + 60, height + 60);

  ctx.save();
  switch (world.decor) {
    case "fireflies":
      for (let i = 0; i < 26; i++) {
        const x = seeded(i, 1) * width;
        const y = seeded(i, 2) * height;
        const pulse = 0.35 + (Math.sin(t / 420 + i) + 1) * 0.25;
        ctx.globalAlpha = pulse;
        ctx.fillStyle = i % 3 === 0 ? "#fff58a" : "#7dff9b";
        ctx.beginPath();
        ctx.arc(x, y, 1.5 + seeded(i, 3) * 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      break;

    case "candy":
      ctx.lineWidth = 4;
      for (let i = 0; i < 18; i++) {
        const x = seeded(i, 4) * width;
        const y = seeded(i, 5) * height;
        const radius = 7 + seeded(i, 6) * 18;
        ctx.globalAlpha = 0.18;
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
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = i % 3 === 0 ? "#f6db55" : "#77f05a";
        ctx.beginPath();
        ctx.ellipse(0, 0, 5, 15, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      break;

    case "snow":
      for (let i = 0; i < 44; i++) {
        const x = seeded(i, 10) * width;
        const speed = 0.012 + seeded(i, 11) * 0.02;
        const y = (seeded(i, 12) * height + t * speed) % Math.max(1, height);
        ctx.globalAlpha = 0.25 + seeded(i, 13) * 0.5;
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
        ctx.globalAlpha = 0.25 + seeded(i, 18) * 0.55;
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
        ctx.globalAlpha = twinkle;
        ctx.fillStyle = i % 7 === 0 ? "#bf66ff" : "#f4f1ff";
        ctx.beginPath();
        ctx.arc(x, y, 0.8 + seeded(i, 22) * 2.3, 0, Math.PI * 2);
        ctx.fill();
      }
      break;

    case "arcade": {
      const horizon = height * 0.36;
      ctx.globalAlpha = 0.2;
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
        ctx.globalAlpha = 0.1 + (Math.sin(t / 500 + i) + 1) * 0.035;
        ctx.fillStyle = i % 2 ? "#ffe066" : "#36f1ff";
        ctx.fillText("67", 0, 0);
        ctx.restore();
      }
      break;
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
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
