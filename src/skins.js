// Snake skin catalog. Each skin has head & body gradient stops, plus a glow color.
// Gradient is rendered per-segment in renderer.js as a small radial gradient.

import { SKIN_UNLOCKS } from "./config.js";
import { storage } from "./storage.js";

export const SKINS = {
  // Starter keeps the id "default" so the storage fallback stays valid.
  default: {
    name: "Blue Racer",
    head:  ["#a8f0ff", "#1060d8"],
    body:  ["#3bc4ff", "#0a2a8a"],
    glow:  "#3bc4ff",
  },
  coral: {
    name: "Coral Snake",
    head:  ["#ffe14a", "#ff2a2a"],
    body:  ["#ff3a2a", "#1a0606"],
    glow:  "#ff5a3a",
  },
  corn: {
    name: "Corn Snake",
    head:  ["#ffe1b0", "#ff6a00"],
    body:  ["#ff5d3d", "#8a1500"],
    glow:  "#ff6a2a",
  },
  blackmamba: {
    name: "Black Mamba",
    head:  ["#9fb4c8", "#1b2330"],
    body:  ["#5a6b7d", "#0a0e14"],
    glow:  "#7fe3ff",
  },
  ballpython: {
    name: "Ball Python",
    head:  ["#ffe9a8", "#c8920a"],
    body:  ["#e0a83a", "#2e2000"],
    glow:  "#ffc83a",
  },
  greentree: {
    name: "Green Tree Python",
    head:  ["#e6ffce", "#19c93a"],
    body:  ["#3bff62", "#055e1a"],
    glow:  "#3bff62",
  },
  kingcobra: {
    name: "King Cobra",
    head:  ["#fff0a0", "#7a6a1e"],
    body:  ["#9a8a2e", "#15140a"],
    glow:  "#e8c84a",
  },
  rainbowboa: {
    name: "Rainbow Boa",
    head:  ["#ffffff", "#36f1ff"],
    body:  null, // signal: cycle hue per segment (the boa's iridescent shimmer)
    glow:  "#ffffff",
  },
};

export function unlockedSkins(best = storage.getBest()) {
  return SKIN_UNLOCKS.filter(s => best >= s.unlockAt).map(s => s.id);
}

export function newlyUnlocked(prevBest, nextBest) {
  return SKIN_UNLOCKS
    .filter(s => prevBest < s.unlockAt && nextBest >= s.unlockAt)
    .map(s => s.id);
}

export function getSkin(id) {
  return SKINS[id] || SKINS.default;
}
