// Snake skin catalog. Each skin has head & body gradient stops, plus a glow color.
// Gradient is rendered per-segment in renderer.js as a small radial gradient.

import { SKIN_UNLOCKS } from "./config.js";
import { storage } from "./storage.js";

export const SKINS = {
  default: {
    name: "Classic",
    head:  ["#36f1ff", "#0d5b8c"],
    body:  ["#ff3bd4", "#6e1b8a"],
    glow:  "#ff3bd4",
  },
  strawberry: {
    name: "Strawberry",
    head:  ["#ffb3c1", "#a3133c"],
    body:  ["#ff5d7b", "#5a0a1f"],
    glow:  "#ff5d7b",
  },
  bubblegum: {
    name: "Bubblegum",
    head:  ["#ffe5fb", "#ff5fc8"],
    body:  ["#ffc4f0", "#aa3aa6"],
    glow:  "#ffb3ec",
  },
  lava: {
    name: "Lava",
    head:  ["#fff0a8", "#ff6a00"],
    body:  ["#ffae3d", "#8a1500"],
    glow:  "#ff6a00",
  },
  galaxy: {
    name: "Galaxy",
    head:  ["#dac4ff", "#3b1d7a"],
    body:  ["#8a4bff", "#150a3d"],
    glow:  "#8a4bff",
  },
  rainbow: {
    name: "Rainbow",
    head:  ["#ffffff", "#36f1ff"],
    body:  null, // signal: cycle hue per segment
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
