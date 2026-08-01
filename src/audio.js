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
  // The +7 gold apple: one bright sweep — golden's little sibling.
  gold()         { sweep({ from: 600, to: 1500, duration: 0.28, type: "triangle", gain: 0.8 }); },
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
  // Unlock celebration: an ascending arpeggio capped by a rising shimmer.
  // Every note goes through blip/sweep, so muting mid-fanfare cuts the rest.
  fanfare()      {
    const notes = [523, 659, 784, 1047, 1319]; // C E G C E
    notes.forEach((f, i) => setTimeout(() => blip({ freq: f, duration: 0.18, type: "triangle", attack: 0.006, decay: 0.17, gain: 0.6 }), i * 105));
    setTimeout(() => sweep({ from: 784, to: 2093, duration: 0.45, type: "triangle", gain: 0.45 }), 540);
  },
  uiTap()        { blip({ freq: 880, duration: 0.05, type: "sine", gain: 0.4 }); },
};

// ===== Looping music: synthesized "snake charmer" chiptunes =====
// Phrygian-dominant scale (A) gives the slinky, exotic snake-charmer flavor.
// Two tracks share one lookahead scheduler — the slow menu loop and a faster
// gameplay loop in the same key — so they always sound like one soundtrack.
// All notes are scheduled ahead of time against the AudioContext clock so a
// loop stays rock-steady even if the JS timer jitters.
//
//   masterGain <- musicGain (mute / on-off gate) <- trackBus (per-track fader)
//
// Every voice hangs off the *current* track's bus, so swapping tracks is a
// crossfade between two buses rather than a cut: the outgoing loop's already
// scheduled notes ring out under their own fade instead of colliding with the
// incoming one.

let musicGain = null;   // shared music bus; carries mute + fade in/out
let trackBus  = null;   // the live track's own fader
let musicOn   = false;
let musicTimer = null;
let trackName = null;
let track     = null;
let stepIndex  = 0;
let nextStepTime = 0;

// Tempo and timbre only ever move on a loop boundary: the lookahead scheduler
// has already committed the next ~200ms, so changing stepDur mid-bar would
// stretch notes that are queued to play at the old spacing.
let stepDur   = 0;
let intensity = 0;
let pendingIntensity = 0;

const CROSSFADE = 0.35;

// note frequencies
const A2 = 110.00, F2 = 87.31, E2 = 82.41;
const E4 = 329.63, Gs4 = 415.30, A4 = 440.00, Bb4 = 466.16,
      Cs5 = 554.37, D5 = 587.33, E5 = 659.25, F5 = 698.46;

// --- Menu track: 16-step loop. null = rest. A slinky rise-and-fall that coils
// back on itself. ---
const MELODY = [
  A4,  Bb4, Cs5, D5,   E5,  D5,  Cs5, Bb4,
  A4,  Cs5, Bb4, A4,   Gs4, null, E4, null,
];
// Low drone that shifts to bVI/V in the second bar for that exotic lift.
const BASS = [
  A2, A2, A2, A2, A2, A2, A2, A2,
  F2, F2, F2, F2, E2, E2, E2, E2,
];

// --- Gameplay track: same scale, twice the loop, half the sitting still. ---
// 32 eighth-notes = four bars. Bars 1-2 state the hook and answer it, bar 3
// climbs for the lift, bar 4 tumbles back down onto the tonic.
const GAME_MELODY = [
  A4,  A4,  Cs5, D5,   E5,  null, D5,  Cs5,
  A4,  null, Bb4, A4,  Gs4, null, A4,  null,
  E5,  E5,  F5,  E5,   D5,  null, Cs5, D5,
  E5,  Cs5, Bb4, A4,   Bb4, A4,   Gs4, null,
];
// One root per bar — i / A, i / A, bVI / F, V / E, the same move the menu makes.
const GAME_BASS = [A2, A2, F2, E2];

function applyMusicGain(rampSec) {
  if (!musicGain || !ctx) return;
  // A plain gate: the audible level lives on the track's own bus.
  const target = (muted || !musicOn) ? 0 : 1;
  const now = ctx.currentTime;
  musicGain.gain.cancelScheduledValues(now);
  musicGain.gain.setValueAtTime(musicGain.gain.value, now);
  musicGain.gain.linearRampToValueAtTime(target, now + rampSec);
}

// Hand the current bus back to the garbage collector. fadeSec 0 means the
// caller is already fading musicGain and the bus should just be let go.
function retireTrackBus(fadeSec) {
  const bus = trackBus;
  trackBus = null;
  if (!bus || !ctx) return;
  const now = ctx.currentTime;
  bus.gain.cancelScheduledValues(now);
  bus.gain.setValueAtTime(bus.gain.value, now);
  bus.gain.linearRampToValueAtTime(0, now + Math.max(fadeSec, 0.3));
  // Disconnect only once the longest queued note (a ~1.3s drone scheduled up to
  // 0.2s ahead) has stopped, so nothing is cut off mid-tail.
  setTimeout(() => bus.disconnect(), 3000);
}

// A single melodic voice: reedy saw through a lowpass, with gentle vibrato.
function musicVoice({ freq, time, dur, type = "sawtooth", gain = 0.5, glide = null, vibrato = false, cutoff = 1900 }) {
  if (!ctx || !trackBus) return;
  const osc = ctx.createOscillator();
  const g   = ctx.createGain();
  const lp  = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = cutoff;
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
  osc.connect(lp).connect(g).connect(trackBus);
  osc.start(time);
  osc.stop(time + dur + 0.05);
}

// Soft hand-drum pulse. The defaults are the menu's drum; the gameplay loop
// pitches it down into a punchier kick.
function perc(time, gain, { from = 180, to = 70, bend = 0.12, dur = 0.14 } = {}) {
  if (!ctx || !trackBus) return;
  const osc = ctx.createOscillator();
  const g   = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(from, time);
  osc.frequency.exponentialRampToValueAtTime(to, time + bend);
  g.gain.setValueAtTime(gain, time);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  osc.connect(g).connect(trackBus);
  osc.start(time);
  osc.stop(time + dur + 0.02);
}

// One short noise buffer, reused by every hat.
let noiseBuf = null;
function noiseBuffer() {
  if (noiseBuf) return noiseBuf;
  const len = Math.floor(ctx.sampleRate * 0.2);
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

// Filtered noise tick — the off-beat hat that gives the gameplay loop its shuffle.
function hat(time, gain, dur = 0.045) {
  if (!ctx || !trackBus) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer();
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 7000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, time);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  src.connect(hp).connect(g).connect(trackBus);
  src.start(time);
  src.stop(time + dur + 0.02);
}

const TRACKS = {
  menu: {
    vol: 0.16,
    stepDur: 0.3,   // seconds per eighth-note (~100 BPM)
    len: 16,
    tempoRange: 0,  // the menu never reacts to anything
    step(i, time, dur) {
      const m = MELODY[i];
      if (m) {
        const prev = MELODY[(i - 1 + MELODY.length) % MELODY.length];
        musicVoice({ freq: m, time, dur: dur * 0.9, type: "sawtooth", gain: 0.42, glide: prev, vibrato: true });
      }
      if (i % 4 === 0) {
        // sustained drone for the whole beat, plus a quiet octave shimmer
        musicVoice({ freq: BASS[i],     time, dur: dur * 4.2, type: "sine",     gain: 0.55 });
        musicVoice({ freq: BASS[i] * 2, time, dur: dur * 4.2, type: "triangle", gain: 0.14 });
      }
      if (i % 2 === 0) perc(time, i % 4 === 0 ? 0.4 : 0.22);
    },
  },
  game: {
    // Quieter than the menu on purpose: the eat/combo blips have to read on top.
    vol: 0.11,
    stepDur: 0.24,   // eighth-notes at ~125 BPM
    len: 32,
    tempoRange: 0.08, // up to +8% faster at full intensity
    step(i, time, dur, level) {
      const m = GAME_MELODY[i];
      if (m) {
        // The lead opens up as the run heats up: same notes, brighter tone.
        musicVoice({ freq: m, time, dur: dur * 0.82, type: "square", gain: 0.34, cutoff: 1900 + 1300 * level });
        // Downbeat sparkle an octave up.
        if (i % 4 === 0) musicVoice({ freq: m * 2, time, dur: dur * 0.5, type: "triangle", gain: 0.12 });
      }
      const root = GAME_BASS[i >> 3];
      // Lighter drone than the menu's — it holds the bar together while the
      // plucked bass under it does the driving.
      if (i % 8 === 0) musicVoice({ freq: root, time, dur: dur * 8.4, type: "sine", gain: 0.34 });
      if (i % 2 === 0) musicVoice({ freq: root, time, dur: dur * 0.85, type: "triangle", gain: 0.44 });
      if (i % 4 === 3) musicVoice({ freq: root * 2, time, dur: dur * 0.55, type: "triangle", gain: 0.26 });
      // Four-on-the-floor kick, accented on the downbeat of each bar.
      if (i % 2 === 0) perc(time, i % 8 === 0 ? 0.62 : 0.4, { from: 210, to: 48, bend: 0.09, dur: 0.16 });
      // Off-beat hats always; 16th-note ghosts fill in as the score climbs.
      if (i % 2 === 1) hat(time, 0.1 + 0.04 * level);
      const ghost = level >= 0.67 ? 1 : level >= 0.34 ? 2 : 0;
      if (ghost && i % ghost === ghost - 1) hat(time + dur * 0.5, 0.065);
    },
  },
};

function stepDurFor(t, level) {
  return t.stepDur / (1 + t.tempoRange * level);
}

function musicScheduler() {
  if (!ctx || !musicOn || !track) return;
  const lookahead = 0.2;
  while (nextStepTime < ctx.currentTime + lookahead) {
    const i = stepIndex % track.len;
    if (i === 0) {
      // Loop boundary: the only safe moment to change tempo or intensity.
      intensity = pendingIntensity;
      stepDur = stepDurFor(track, intensity);
    }
    track.step(i, nextStepTime, stepDur, intensity);
    stepIndex++;
    nextStepTime += stepDur;
  }
}

function startTrack(name) {
  ensure();
  if (!ctx) return;
  if (musicOn && trackName === name) return; // already playing — nothing to do
  const next = TRACKS[name];
  if (!next) return;
  if (!musicGain) {
    musicGain = ctx.createGain();
    musicGain.gain.value = 0;
    musicGain.connect(masterGain);
  }
  const swapping = musicOn; // replacing a live track -> crossfade instead of cut
  clearInterval(musicTimer);
  musicTimer = null;
  retireTrackBus(swapping ? CROSSFADE : 0);

  trackBus = ctx.createGain();
  trackBus.connect(musicGain);
  if (swapping) {
    // Fade up under the outgoing loop's fade-out; musicGain stays where it is.
    trackBus.gain.setValueAtTime(0, ctx.currentTime);
    trackBus.gain.linearRampToValueAtTime(next.vol, ctx.currentTime + CROSSFADE);
  } else {
    // Cold start: musicGain does the fade, so the bus sits at track level.
    trackBus.gain.setValueAtTime(next.vol, ctx.currentTime);
  }

  track = next;
  trackName = name;
  musicOn = true;
  stepIndex = 0;
  intensity = 0;
  pendingIntensity = 0;
  stepDur = stepDurFor(track, 0);
  nextStepTime = ctx.currentTime + 0.12;
  musicScheduler();
  musicTimer = setInterval(musicScheduler, 60);
  applyMusicGain(swapping ? CROSSFADE : 0.8);
}

export const music = {
  // Both starters are idempotent: safe to call on every scene entry, and each
  // crossfades out of whatever else was playing.
  start()     { startTrack("menu"); },
  startGame() { startTrack("game"); },
  stop() {
    if (!musicOn) return;
    musicOn = false;
    trackName = null;
    track = null;
    clearInterval(musicTimer);
    musicTimer = null;
    applyMusicGain(0.4); // fade out (already-scheduled notes ring out under it)
    retireTrackBus(0);
  },
  // 0..1, typically score/100. Takes effect at the next loop boundary.
  setIntensity(v) {
    pendingIntensity = Math.max(0, Math.min(1, v || 0));
  },
  isOn() { return musicOn; },
};
