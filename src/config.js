// Snake Jr. — configuration
// Paste your Supabase URL and anon key here after creating the project.
// Both are safe to commit publicly — RLS in Supabase enforces the policy.

export const SUPABASE_URL = "";   // e.g. "https://abcd1234.supabase.co"
export const SUPABASE_ANON_KEY = ""; // public anon key from Supabase dashboard

export const GRID = {
  cols: 20,
  rows: 24,
};

export const TICK = {
  startMs: 180,
  minMs: 70,
  decreasePerApple: 4,
};

export const SCORE = {
  appleBase: 1,
  goldenApple: 67,
  goldenChance: 0.05,
  goldenLifetimeMs: 8000,
  comboCapMultiplier: 5,
  comboWindowMultiplier: 4, // window = currentTick * this
};

export const MILESTONES = [
  { at: 10,  text: "NICE!",   color: "cyan" },
  { at: 25,  text: "FIRE!",   color: "pink" },
  { at: 50,  text: "GOATED!", color: "violet" },
  { at: 67,  text: "67!!!",   color: "gold" },
  { at: 100, text: "SIGMA!",  color: "cyan" },
  { at: 150, text: "GYATT!",  color: "pink" },
  { at: 250, text: "OHIO!",   color: "violet" },
];

// Kid-safe emoji avatar set
export const EMOJIS = [
  "🔥","🐢","🦖","🌮","👽","🦄","🍕","🎮",
  "🐸","🦊","🍩","🚀","🌈","⚡","💎","🦦",
  "🐙","🍉","🪐","🍦","🐉","🦕","🐳","🧃",
];

// Skin unlock thresholds (personal best). Default always unlocked.
export const SKIN_UNLOCKS = [
  { id: "default",    name: "Classic",    unlockAt: 0 },
  { id: "strawberry", name: "Strawberry", unlockAt: 25 },
  { id: "bubblegum",  name: "Bubblegum",  unlockAt: 50 },
  { id: "lava",       name: "Lava",       unlockAt: 67 },
  { id: "galaxy",     name: "Galaxy",     unlockAt: 100 },
  { id: "rainbow",    name: "Rainbow",    unlockAt: 150 },
];

export const SWIPE_THRESHOLD_PX = 24;
