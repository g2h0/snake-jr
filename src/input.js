// Swipe + keyboard input. Reports directions as {x,y} unit vectors.
// 180-degree reverses are rejected by game.js, not here.

import { SWIPE_THRESHOLD_PX } from "./config.js";

export function createInput(target) {
  let down = null;
  let listeners = [];

  function emit(dir) { listeners.forEach(fn => fn(dir)); }

  function onPointerDown(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    down = { x: e.clientX, y: e.clientY, t: performance.now() };
    target.setPointerCapture?.(e.pointerId);
  }

  function onPointerUp(e) {
    if (!down) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    down = null;
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX && Math.abs(dy) < SWIPE_THRESHOLD_PX) return;
    if (Math.abs(dx) > Math.abs(dy)) {
      emit({ x: dx > 0 ? 1 : -1, y: 0 });
    } else {
      emit({ x: 0, y: dy > 0 ? 1 : -1 });
    }
  }

  function onKey(e) {
    const k = e.key;
    if (k === "ArrowUp"    || k === "w" || k === "W") { emit({ x: 0, y: -1 }); e.preventDefault(); }
    if (k === "ArrowDown"  || k === "s" || k === "S") { emit({ x: 0, y:  1 }); e.preventDefault(); }
    if (k === "ArrowLeft"  || k === "a" || k === "A") { emit({ x: -1, y: 0 }); e.preventDefault(); }
    if (k === "ArrowRight" || k === "d" || k === "D") { emit({ x:  1, y: 0 }); e.preventDefault(); }
  }

  target.addEventListener("pointerdown", onPointerDown);
  target.addEventListener("pointerup",   onPointerUp);
  target.addEventListener("pointercancel", () => { down = null; });
  window.addEventListener("keydown", onKey);

  return {
    onDirection(fn) { listeners.push(fn); },
    destroy() {
      target.removeEventListener("pointerdown", onPointerDown);
      target.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("keydown", onKey);
      listeners = [];
    },
  };
}
