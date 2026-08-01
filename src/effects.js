// Visual juice: screen shake, floating score popups, confetti.
// Banners are CSS-driven and triggered from main.js by toggling DOM nodes.

import { REDUCED } from "./motion.js";

// Reduce Motion keeps the feedback (you still see confetti) but drops the
// camera moving under you and thins the swarm right down.
function thin(count) { return REDUCED ? Math.max(1, Math.round(count / 3)) : count; }

export function createEffects() {
  let shakeT = 0;
  let shakeMag = 0;
  const popups = [];   // {x,y,text,color,t,life}
  const confetti = []; // {x,y,vx,vy,size,color,spin,vspin,t,life}

  return {
    shake(mag = 8, ms = 200) {
      if (REDUCED) return;
      shakeMag = Math.max(shakeMag, mag);
      shakeT = Math.max(shakeT, ms);
    },
    popup(x, y, text, color = "#fff") {
      popups.push({ x, y, text, color, t: 0, life: 900 });
    },
    // `size` is the piece width in px; speed and lifetime scale with it so a
    // small splash stays local to the bite instead of spraying up the field.
    burstConfetti(x, y, count = 30, palette = ["#ff3bd4", "#36f1ff", "#8a4bff", "#ffe066"], size = 6) {
      const n = thin(count);
      const scale = size / 6;
      for (let i = 0; i < n; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = (80 + Math.random() * 240) * scale;
        confetti.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 60 * scale,
          size: size * 0.66 + Math.random() * size,
          color: palette[Math.floor(Math.random() * palette.length)],
          spin: Math.random() * Math.PI * 2,
          vspin: (Math.random() - 0.5) * 10,
          t: 0,
          life: (1200 + Math.random() * 800) * (0.3 + scale * 0.7),
        });
      }
    },
    rainConfetti(width, count = 80, palette = ["#ff3bd4", "#36f1ff", "#8a4bff", "#ffe066", "#ffffff"]) {
      count = thin(count);
      for (let i = 0; i < count; i++) {
        confetti.push({
          x: Math.random() * width,
          y: -20 - Math.random() * 200,
          vx: (Math.random() - 0.5) * 60,
          vy: 200 + Math.random() * 200,
          size: 5 + Math.random() * 8,
          color: palette[Math.floor(Math.random() * palette.length)],
          spin: Math.random() * Math.PI * 2,
          vspin: (Math.random() - 0.5) * 8,
          t: 0,
          life: 2500 + Math.random() * 1000,
        });
      }
    },

    update(dtMs) {
      // shake decay
      if (shakeT > 0) {
        shakeT -= dtMs;
        if (shakeT <= 0) { shakeT = 0; shakeMag = 0; }
      }
      const dt = dtMs / 1000;
      // popups rise + fade
      for (let i = popups.length - 1; i >= 0; i--) {
        const p = popups[i];
        p.t += dtMs;
        p.y -= 40 * dt;
        if (p.t >= p.life) popups.splice(i, 1);
      }
      // confetti physics
      for (let i = confetti.length - 1; i >= 0; i--) {
        const c = confetti[i];
        c.t += dtMs;
        c.vy += 600 * dt;       // gravity
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.spin += c.vspin * dt;
        if (c.t >= c.life) confetti.splice(i, 1);
      }
    },

    getShake() {
      if (shakeT <= 0) return { dx: 0, dy: 0 };
      const k = shakeMag * (shakeT / 200);
      return { dx: (Math.random() - 0.5) * 2 * k, dy: (Math.random() - 0.5) * 2 * k };
    },

    drawOverlay(ctx, w, h) {
      // popups
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const p of popups) {
        const alpha = 1 - (p.t / p.life);
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.font = "900 28px 'Lilita One', system-ui, sans-serif";
        ctx.lineWidth = 6;
        ctx.strokeStyle = "rgba(0,0,0,0.6)";
        ctx.strokeText(p.text, p.x, p.y);
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, p.x, p.y);
      }
      ctx.restore();
      // confetti
      ctx.save();
      for (const c of confetti) {
        const alpha = Math.min(1, 1 - (c.t / c.life));
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.translate(c.x, c.y);
        ctx.rotate(c.spin);
        ctx.fillStyle = c.color;
        ctx.fillRect(-c.size / 2, -c.size / 4, c.size, c.size / 2);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
      ctx.restore();
    },
  };
}
