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
  comboWindowMs: 2600, // eat the next apple within this to chain a combo
};

export const MILESTONES = [
  { at: 10,  text: "W START!",      color: "cyan" },
  { at: 25,  text: "FIRE!",         color: "pink" },
  { at: 33,  text: "HALF A 67!",    color: "violet" },
  { at: 50,  text: "GOATED!",       color: "cyan" },
  { at: 67,  text: "67!!!",         color: "gold" },
  { at: 100, text: "SIGMA!",        color: "pink" },
  { at: 134, text: "DOUBLE 67!!",   color: "gold" },
  { at: 150, text: "MAX AURA!",     color: "violet" },
  { at: 201, text: "TRIPLE 67!!!",  color: "gold" },
  { at: 250, text: "OHIO FINAL BOSS!", color: "pink" },
];

// Rotating title-screen taglines — one is picked at random per visit.
export const TAGLINES = [
  "Easy to slither. Hard to GOAT.",
  "Six!! Seven!!",
  "100% aura farming",
  "No cap, just apples",
  "Very mindful. Very slithery.",
  "Cooler than a Labubu",
  "Zero brainrot. Okay, some.",
  "Certified snake moment",
];

// Rotating game-over headings — kid-safe roasts.
export const DEATH_HEADINGS = [
  "You got cooked! 🍳",
  "Womp womp 💀",
  "You're toast! 🍞",
  "GG! Run it back 🔁",
  "−100 aura 📉",
  "Snake.exe crashed out 🫠",
  "That was lowkey bussin 🐍",
  "Certified 6-7 moment 🙌",
];

// Kid-safe emoji avatar set
export const EMOJIS = [
  "🔥","🐢","🦖","🌮","👽","🦄","🍕","🎮",
  "🐸","🦊","🍩","🚀","🌈","⚡","💎","🦦",
  "🐙","🍉","🪐","🍦","🐉","🦕","🐳","🧃",
  "🗿","🥶","🫡","🧋","👾","🫧","🦥","🍄",
];

// Skin unlock thresholds (personal best). Default always unlocked.
export const SKIN_UNLOCKS = [
  { id: "default",    name: "Blue Racer",        unlockAt: 0 },
  { id: "coral",      name: "Coral Snake",       unlockAt: 15 },
  { id: "corn",       name: "Corn Snake",        unlockAt: 25 },
  { id: "blackmamba", name: "Black Mamba",       unlockAt: 33 },
  { id: "ballpython", name: "Ball Python",       unlockAt: 50 },
  { id: "greentree",  name: "Green Tree Python", unlockAt: 67 },
  { id: "kingcobra",  name: "King Cobra",        unlockAt: 100 },
  { id: "rainbowboa", name: "Rainbow Boa",       unlockAt: 150 },
  { id: "titanoboa",  name: "Titanoboa",         unlockAt: 250 },
];

export const SWIPE_THRESHOLD_PX = 24;
