// Snake face/personality state machine: blinks, tongue flicks, moods, eat squash.
// Pure timing state — no canvas, no DOM. The renderer reads it through getters,
// so it stays stateless and anything that draws a snake can share one anim.
//
// Drive it from the render loop's dt (`anim.update(dt)`); a paused loop stops
// calling update, so the face freezes with the game instead of drifting.

const BLINK_MS = 120;
const BLINK_GAP_MIN = 2500;
const BLINK_GAP_MAX = 5000;
const TONGUE_MS = 350;
const TONGUE_GAP_MIN = 1800;
const TONGUE_GAP_MAX = 4000;
const CHOMP_MS = 190;
const HAPPY_MS = 620;

function gap(min, max) { return min + Math.random() * (max - min); }

export function createSnakeAnim() {
  let time = 0;          // ms since reset, for wobble phases
  let blinkT = -1;       // >=0 while a blink is playing
  let blinkIn = gap(BLINK_GAP_MIN, BLINK_GAP_MAX);
  let tongueT = -1;
  let tongueIn = gap(TONGUE_GAP_MIN, TONGUE_GAP_MAX);
  let mood = "idle";
  let moodT = 0;         // ms left in the current mood (0 = permanent)
  let squash = 0;        // spring value, 1 = fully squashed
  let squashV = 0;
  let deathT = -1;       // ms since onDeath(), -1 while alive — drives the death beat

  function reset() {
    time = 0;
    blinkT = -1;
    blinkIn = gap(BLINK_GAP_MIN, BLINK_GAP_MAX);
    tongueT = -1;
    tongueIn = gap(TONGUE_GAP_MIN, TONGUE_GAP_MAX);
    mood = "idle";
    moodT = 0;
    squash = 0;
    squashV = 0;
    deathT = -1;
  }

  function setMood(next, ms) {
    mood = next;
    moodT = ms;
  }

  return {
    update(dtMs) {
      // A backgrounded tab hands back one huge dt; clamp so nothing snaps.
      const dt = Math.min(100, Math.max(0, dtMs));
      time += dt;
      if (deathT >= 0) deathT += dt;

      if (mood === "dizzy") {
        // Dizzy is terminal — it holds until the next run resets us.
      } else if (moodT > 0) {
        moodT -= dt;
        if (moodT <= 0) {
          if (mood === "chomp") setMood("happy", HAPPY_MS);
          else setMood("idle", 0);
        }
      }

      if (blinkT >= 0) {
        blinkT += dt;
        if (blinkT >= BLINK_MS) {
          blinkT = -1;
          blinkIn = gap(BLINK_GAP_MIN, BLINK_GAP_MAX);
        }
      } else {
        blinkIn -= dt;
        if (blinkIn <= 0) blinkT = 0;
      }

      if (tongueT >= 0) {
        tongueT += dt;
        if (tongueT >= TONGUE_MS) {
          tongueT = -1;
          tongueIn = gap(TONGUE_GAP_MIN, TONGUE_GAP_MAX);
        }
      } else {
        tongueIn -= dt;
        if (tongueIn <= 0) tongueT = 0;
      }

      // Damped spring back to rest after a bite. Underdamped on purpose — the
      // overshoot past zero is the stretch half of squash-and-stretch.
      const s = dt / 1000;
      squashV += (-42 * squash - 6.5 * squashV) * s;
      squash += squashV * s;
      if (Math.abs(squash) < 0.001 && Math.abs(squashV) < 0.01) { squash = 0; squashV = 0; }
    },

    onEat() {
      if (mood === "dizzy") return;
      setMood("chomp", CHOMP_MS);
      squash = 1;
      squashV = 0;
      // Snakes taste with the tongue — flick right after a bite.
      tongueT = 0;
    },

    onDeath() {
      setMood("dizzy", 0);
      squash = 0.6;
      squashV = 0;
      blinkT = -1;
      tongueT = -1;
      deathT = 0;
    },

    reset,

    // Renderer-facing getters.
    getTime()   { return time; },
    getMood()   { return mood; },
    getSquash() { return squash; },
    // ms since death, -1 while alive. Renderer times the flash/drain off it.
    getDeathT() { return deathT; },
    // 0 = wide open, 1 = shut. One close/open ramp across BLINK_MS.
    getBlink() {
      if (blinkT < 0) return 0;
      const p = blinkT / BLINK_MS;
      return 1 - Math.abs(p * 2 - 1);
    },
    // 0 = tucked in, 1 = fully out. Two quick flicks per TONGUE_MS.
    getTongue() {
      if (tongueT < 0) return 0;
      return Math.abs(Math.sin((tongueT / TONGUE_MS) * Math.PI * 2));
    },
  };
}
