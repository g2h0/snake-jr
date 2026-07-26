// Shared progression helpers for title and game-over screens.

import { SKIN_UNLOCKS } from "./config.js";
import { WORLD_UNLOCKS } from "./worlds.js";

const REWARDS = [
  ...SKIN_UNLOCKS.map(skin => ({
    kind: "skin",
    id: skin.id,
    name: skin.name,
    icon: "🐍",
    unlockAt: skin.unlockAt,
  })),
  ...WORLD_UNLOCKS.map(world => ({
    kind: "world",
    id: world.id,
    name: world.name,
    icon: world.icon,
    unlockAt: world.unlockAt,
  })),
]
  .filter(reward => reward.unlockAt > 0)
  .sort((a, b) => a.unlockAt - b.unlockAt || a.kind.localeCompare(b.kind));

export function getNextUnlock(best) {
  const safeBest = Math.max(0, Number(best) || 0);
  const next = REWARDS.find(reward => reward.unlockAt > safeBest);
  if (!next) return null;

  const items = REWARDS.filter(reward => reward.unlockAt === next.unlockAt);
  return {
    at: next.unlockAt,
    best: safeBest,
    pointsLeft: next.unlockAt - safeBest,
    progress: Math.min(1, safeBest / next.unlockAt),
    items,
  };
}
