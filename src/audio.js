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

export function setMuted(v) {
  muted = v;
  applyMusicGain(0.2);
}
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
  // 3… 2… 1… — a flat woodblock tick, then the launch note on GO!
  count()        { blip({ freq: 392, duration: 0.14, type: "triangle", attack: 0.004, decay: 0.13, gain: 0.55 }); },
  go()           {
    sweep({ from: 523, to: 1319, duration: 0.26, type: "triangle", gain: 0.85 });
    setTimeout(() => blip({ freq: 1047, duration: 0.18, type: "square", gain: 0.5 }), 90);
  },
  uiTap()        { blip({ freq: 880, duration: 0.05, type: "sine", gain: 0.4 }); },
};

// ===== Looping menu music: a synthesized "snake charmer" chiptune =====
// Phrygian-dominant scale (A) gives the slinky, exotic snake-charmer flavor.
// All notes are scheduled ahead of time against the AudioContext clock so the
// loop stays rock-steady even if the JS timer jitters.

let musicGain = null;
let musicOn   = false;
let musicTimer = null;
let stepIndex  = 0;
let nextStepTime = 0;

const MUSIC_VOL = 0.16;
const STEP_DUR  = 0.3; // seconds per eighth-note (~100 BPM)

// note frequencies
const A2 = 110.00, F2 = 87.31, E2 = 82.41;
const E4 = 329.63, Gs4 = 415.30, A4 = 440.00, Bb4 = 466.16,
      Cs5 = 554.37, D5 = 587.33, E5 = 659.25;

// 16-step loop. null = rest. A slinky rise-and-fall that coils back on itself.
const MELODY = [
  A4,  Bb4, Cs5, D5,   E5,  D5,  Cs5, Bb4,
  A4,  Cs5, Bb4, A4,   Gs4, null, E4, null,
];
// Low drone that shifts to bVI/V in the second bar for that exotic lift.
const BASS = [
  A2, A2, A2, A2, A2, A2, A2, A2,
  F2, F2, F2, F2, E2, E2, E2, E2,
];

function applyMusicGain(rampSec) {
  if (!musicGain || !ctx) return;
  const target = (muted || !musicOn) ? 0 : MUSIC_VOL;
  const now = ctx.currentTime;
  musicGain.gain.cancelScheduledValues(now);
  musicGain.gain.setValueAtTime(musicGain.gain.value, now);
  musicGain.gain.linearRampToValueAtTime(target, now + rampSec);
}

// A single melodic voice: reedy saw through a lowpass, with gentle vibrato.
function musicVoice({ freq, time, dur, type = "sawtooth", gain = 0.5, glide = null, vibrato = false }) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const g   = ctx.createGain();
  const lp  = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 1900;
  osc.type = type;
  if (glide) {
    osc.frequency.setValueAtTime(glide, time);
    osc.frequency.exponentialRampToValueAtTime(freq, time + Math.min(0.08, dur));
  } else {
    osc.frequency.setValueAtTime(freq, time);
  }
  if (vibrato) {
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 5.5;
    lfoGain.gain.value = freq * 0.012;
    lfo.connect(lfoGain).connect(osc.frequency);
    lfo.start(time);
    lfo.stop(time + dur + 0.05);
  }
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(gain, time + 0.02);
  g.gain.setValueAtTime(gain, time + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  osc.connect(lp).connect(g).connect(musicGain);
  osc.start(time);
  osc.stop(time + dur + 0.05);
}

// Soft hand-drum pulse.
function perc(time, gain) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const g   = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(180, time);
  osc.frequency.exponentialRampToValueAtTime(70, time + 0.12);
  g.gain.setValueAtTime(gain, time);
  g.gain.exponentialRampToValueAtTime(0.0001, time + 0.14);
  osc.connect(g).connect(musicGain);
  osc.start(time);
  osc.stop(time + 0.16);
}

function scheduleStep(i, time) {
  const m = MELODY[i];
  if (m) {
    const prev = MELODY[(i - 1 + MELODY.length) % MELODY.length];
    musicVoice({ freq: m, time, dur: STEP_DUR * 0.9, type: "sawtooth", gain: 0.42, glide: prev, vibrato: true });
  }
  if (i % 4 === 0) {
    // sustained drone for the whole beat, plus a quiet octave shimmer
    musicVoice({ freq: BASS[i],     time, dur: STEP_DUR * 4.2, type: "sine",     gain: 0.55 });
    musicVoice({ freq: BASS[i] * 2, time, dur: STEP_DUR * 4.2, type: "triangle", gain: 0.14 });
  }
  if (i % 2 === 0) perc(time, i % 4 === 0 ? 0.4 : 0.22);
}

function musicScheduler() {
  if (!ctx || !musicOn) return;
  const lookahead = 0.2;
  while (nextStepTime < ctx.currentTime + lookahead) {
    scheduleStep(stepIndex % MELODY.length, nextStepTime);
    stepIndex++;
    nextStepTime += STEP_DUR;
  }
}

export const music = {
  // Idempotent: safe to call on every menu entry.
  start() {
    ensure();
    if (!ctx || musicOn) return;
    if (!musicGain) {
      musicGain = ctx.createGain();
      musicGain.gain.value = 0;
      musicGain.connect(masterGain);
    }
    musicOn = true;
    stepIndex = 0;
    nextStepTime = ctx.currentTime + 0.12;
    musicScheduler();
    musicTimer = setInterval(musicScheduler, 60);
    applyMusicGain(0.8); // fade in
  },
  stop() {
    if (!musicOn) return;
    musicOn = false;
    clearInterval(musicTimer);
    musicTimer = null;
    applyMusicGain(0.4); // fade out (already-scheduled notes ring out under it)
  },
  isOn() { return musicOn; },
};
