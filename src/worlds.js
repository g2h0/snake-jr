// Unlockable playfield themes. Worlds are cosmetic and never change gameplay.

import { storage } from "./storage.js";

export const WORLD_UNLOCKS = [
  { id: "backyard",  name: "Backyard",     icon: "🌼", unlockAt: 0 },
  { id: "candy",     name: "Candy Land",   icon: "🍭", unlockAt: 10 },
  { id: "jungle",    name: "Jungle",       icon: "🌴", unlockAt: 25 },
  { id: "arctic",    name: "Arctic",       icon: "❄️", unlockAt: 33 },
  { id: "volcano",   name: "Volcano",      icon: "🌋", unlockAt: 50 },
  { id: "space",     name: "Space",        icon: "🚀", unlockAt: 67 },
  { id: "arcade",    name: "Neon Arcade",  icon: "👾", unlockAt: 100 },
  { id: "dimension", name: "67 Dimension", icon: "✨", unlockAt: 150 },
];

export const WORLDS = {
  backyard: {
    ...WORLD_UNLOCKS[0],
    decor: "fireflies",
    sky: ["#163e5a", "#071c31"],
    field: ["#275c3d", "#102e27"],
    grid: "rgba(166, 255, 174, 0.13)",
    border: "#8dff8b",
    accent: "#fff58a",
    apple: ["#ffe1e8", "#ff4f68", "#9a1732", "#70ea79"],
  },
  candy: {
    ...WORLD_UNLOCKS[1],
    decor: "candy",
    sky: ["#762b83", "#26104c"],
    field: ["#743b91", "#321d68"],
    grid: "rgba(255, 211, 248, 0.15)",
    border: "#ff9ee8",
    accent: "#75f4ff",
    apple: ["#fff0fb", "#ff70c8", "#a5197e", "#70f2ff"],
  },
  jungle: {
    ...WORLD_UNLOCKS[2],
    decor: "leaves",
    sky: ["#164b35", "#061e1a"],
    field: ["#28663c", "#0d3624"],
    grid: "rgba(162, 255, 121, 0.12)",
    border: "#77f05a",
    accent: "#f6db55",
    apple: ["#fff2b8", "#ff9238", "#a73718", "#8df05d"],
  },
  arctic: {
    ...WORLD_UNLOCKS[3],
    decor: "snow",
    sky: ["#245a89", "#0c244c"],
    field: ["#397aa2", "#173b6b"],
    grid: "rgba(230, 251, 255, 0.17)",
    border: "#d8fbff",
    accent: "#8deaff",
    apple: ["#ffffff", "#6fe2ff", "#2768ad", "#e9ffff"],
  },
  volcano: {
    ...WORLD_UNLOCKS[4],
    decor: "embers",
    sky: ["#521515", "#17070c"],
    field: ["#57201d", "#211014"],
    grid: "rgba(255, 130, 57, 0.13)",
    border: "#ff6738",
    accent: "#ffd058",
    apple: ["#fff0a6", "#ff7038", "#9b1d17", "#ffd34d"],
  },
  space: {
    ...WORLD_UNLOCKS[5],
    decor: "stars",
    sky: ["#15164e", "#050718"],
    field: ["#20235f", "#0b1035"],
    grid: "rgba(128, 159, 255, 0.13)",
    border: "#7f9cff",
    accent: "#f4f1ff",
    apple: ["#f8e5ff", "#bf66ff", "#54219a", "#6effdf"],
  },
  arcade: {
    ...WORLD_UNLOCKS[6],
    decor: "arcade",
    sky: ["#310b50", "#09051c"],
    field: ["#35165e", "#130c36"],
    grid: "rgba(54, 241, 255, 0.17)",
    border: "#36f1ff",
    accent: "#ff3bd4",
    apple: ["#ffffff", "#36f1ff", "#126696", "#ff3bd4"],
  },
  dimension: {
    ...WORLD_UNLOCKS[7],
    decor: "sixtyseven",
    sky: ["#6a165f", "#13082e"],
    field: ["#4b2679", "#1a1248"],
    grid: "rgba(255, 224, 102, 0.18)",
    border: "#ffe066",
    accent: "#36f1ff",
    apple: ["#ffffff", "#ff3bd4", "#711b8c", "#ffe066"],
  },
};

export function unlockedWorlds(best = storage.getBest()) {
  return WORLD_UNLOCKS.filter(world => best >= world.unlockAt).map(world => world.id);
}

export function newlyUnlockedWorlds(prevBest, nextBest) {
  return WORLD_UNLOCKS
    .filter(world => prevBest < world.unlockAt && nextBest >= world.unlockAt)
    .map(world => world.id);
}

export function getWorld(id) {
  return WORLDS[id] || WORLDS.backyard;
}
