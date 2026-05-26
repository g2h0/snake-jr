// Web Audio API — all sounds synthesized at runtime, no asset files.
// AudioContext is created lazily on first user gesture to satisfy autoplay rules.

let ctx = null;
let muted = false;
let masterGain = null;

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  masterGain = ctx.createGain();
  masterGain.gain.value = 0.25;
  masterGain.connect(ctx.destination);
  return ctx;
}

export function unlock() {
  // Call from any tap/click. Resumes a suspended context on iOS.
  ensure();
  if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
}

export function setMuted(v) { muted = v; }
export function isMuted()   { return muted; }

function blip({ freq = 440, duration = 0.08, type = "sine", attack = 0.005, decay = 0.07, gain = 1 }) {
  if (muted) return;
  ensure();
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  osc.connect(g).connect(masterGain);
  osc.start(t0);
  osc.stop(t0 + attack + decay + 0.02);
}

function sweep({ from, to, duration, type = "sine", gain = 1 }) {
  if (muted) return;
  ensure();
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t0 + duration);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g).connect(masterGain);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

export const sfx = {
  eat()          { blip({ freq: 660, duration: 0.08, type: "triangle", gain: 0.8 }); },
  combo(level)   {
    const base = 700 + level * 120;
    blip({ freq: base, duration: 0.09, type: "square", gain: 0.7 });
    setTimeout(() => blip({ freq: base * 1.3, duration: 0.09, type: "square", gain: 0.6 }), 60);
  },
  golden()       {
    sweep({ from: 500, to: 1400, duration: 0.35, type: "triangle", gain: 0.9 });
    setTimeout(() => sweep({ from: 800, to: 1800, duration: 0.3, type: "triangle", gain: 0.7 }), 100);
  },
  milestone()    {
    const notes = [523, 659, 784, 1047]; // C E G C
    notes.forEach((f, i) => setTimeout(() => blip({ freq: f, duration: 0.15, type: "triangle", gain: 0.7 }), i * 90));
  },
  death()        { sweep({ from: 440, to: 60, duration: 0.5, type: "sawtooth", gain: 0.7 }); },
  uiTap()        { blip({ freq: 880, duration: 0.05, type: "sine", gain: 0.4 }); },
};
