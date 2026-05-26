// Canvas 2D rendering for the play field. Sized in CSS pixels; we set the
// transform for devicePixelRatio so lines are crisp.

import { GRID } from "./config.js";
import { getSkin } from "./skins.js";

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

  function drawFieldBg() {
    // Subtle grid + glowing border
    const x = offsetX, y = offsetY;
    const w = GRID.cols * cellPx;
    const h = GRID.rows * cellPx;
    // play area background
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, "rgba(40, 22, 100, 0.45)");
    grad.addColorStop(1, "rgba(15, 8, 50, 0.55)");
    ctx.fillStyle = grad;
    roundRect(ctx, x, y, w, h, 18); ctx.fill();
    // grid lines (very subtle)
    ctx.strokeStyle = "rgba(138, 75, 255, 0.10)";
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
    // Neon border
    ctx.save();
    ctx.shadowColor = "#ff3bd4";
    ctx.shadowBlur = 18;
    ctx.strokeStyle = "rgba(255, 59, 212, 0.65)";
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, w, h, 18); ctx.stroke();
    ctx.restore();
  }

  function drawApple(cell, t) {
    const { x, y } = cellToPx(cell.x, cell.y);
    const r = cellPx * 0.42;
    const cx = x + cellPx / 2;
    const cy = y + cellPx / 2;
    // bounce scale
    const s = 1 + Math.sin(t / 220) * 0.08;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    ctx.shadowColor = "#ff3060";
    ctx.shadowBlur = 14;
    const g = ctx.createRadialGradient(-r/3, -r/3, 2, 0, 0, r);
    g.addColorStop(0, "#ffd7e0");
    g.addColorStop(0.5, "#ff5070");
    g.addColorStop(1, "#a01030");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    // leaf
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#5be084";
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
        // rainbow: hue rotates per segment + over time
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
