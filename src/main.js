// Boot + scene routing.
// Scenes: title -> game -> submit -> leaderboard -> title.

import { createGame } from "./game.js";
import { sfx, music, unlock as unlockAudio, setMuted, isMuted } from "./audio.js";
import { haptics } from "./haptics.js";
import { storage } from "./storage.js";
import { fetchTop, submitScore, flushQueue } from "./leaderboard.js";
import { EMOJIS, SKIN_UNLOCKS, TAGLINES, DEATH_HEADINGS } from "./config.js";
import { unlockedSkins, newlyUnlocked, SKINS } from "./skins.js";
import { WORLD_UNLOCKS, WORLDS, unlockedWorlds, newlyUnlockedWorlds, getWorld } from "./worlds.js";
import { getNextUnlock } from "./progression.js";
import { REDUCED } from "./motion.js";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const scenes = {
  title:       $("#scene-title"),
  game:        $("#scene-game"),
  submit:      $("#scene-submit"),
  leaderboard: $("#scene-leaderboard"),
};

function showScene(name) {
  for (const [k, el] of Object.entries(scenes)) {
    el.classList.toggle("active", k === name);
  }
}

// Browsers block audio until a user gesture. On the first tap anywhere, unlock
// the audio context and kick off the menu music (unless we're already in a game).
let audioKicked = false;
function kickAudio() {
  if (audioKicked) return;
  audioKicked = true;
  unlockAudio();
  if (!scenes.game.classList.contains("active")) music.start();
}
window.addEventListener("pointerdown", kickAudio);

// --- Title screen wiring ---
const bestEl       = $("#title-best");
const skinSelectEl = $("#skin-select");
const worldSelectEl = $("#world-select");
const taglineEl    = $("#tagline");
const titleNextUnlockEl = $("#title-next-unlock");

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function rewardNames(items) {
  return items.map(item => `${item.icon} ${item.name}`).join(" + ");
}

function renderNextUnlock(container, best, { gameOver = false } = {}) {
  const next = getNextUnlock(best);
  if (!next) {
    container.classList.add("complete");
    container.innerHTML = `
      <div class="unlock-progress-copy">
        <span>🏆 Every reward unlocked!</span>
        <span>MAX</span>
      </div>
      <div class="unlock-progress-track" role="progressbar" aria-label="All rewards unlocked" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100">
        <div class="unlock-progress-fill" style="width: 100%"></div>
      </div>`;
    return;
  }

  container.classList.remove("complete");
  const close = gameOver && next.pointsLeft <= 3;
  const label = gameOver
    ? `${close ? "SO CLOSE! " : ""}${next.pointsLeft} more point${next.pointsLeft === 1 ? "" : "s"} for ${rewardNames(next.items)}`
    : `Next: ${rewardNames(next.items)}`;
  const percent = Math.round(next.progress * 100);
  container.innerHTML = `
    <div class="unlock-progress-copy">
      <span>${label}</span>
      <span>${next.best} / ${next.at}</span>
    </div>
    <div class="unlock-progress-track" role="progressbar" aria-label="Progress to ${rewardNames(next.items)}" aria-valuemin="0" aria-valuemax="${next.at}" aria-valuenow="${next.best}">
      <div class="unlock-progress-fill" style="width: ${percent}%"></div>
    </div>`;
}

function selectedWorldId(best = storage.getBest()) {
  const available = unlockedWorlds(best);
  const selected = storage.getWorld();
  if (available.includes(selected)) return selected;
  storage.setWorld("backyard");
  return "backyard";
}

function refreshTitle() {
  const best = storage.getBest();
  bestEl.textContent = best;
  taglineEl.textContent = pick(TAGLINES);
  renderNextUnlock(titleNextUnlockEl, best);
  // skins
  skinSelectEl.innerHTML = "";
  const unlocked = new Set(unlockedSkins(best));
  const current = storage.getSkin();
  for (const s of SKIN_UNLOCKS) {
    const btn = document.createElement("button");
    const isUnlocked = unlocked.has(s.id);
    btn.className = "skin-chip";
    btn.classList.toggle("locked", !isUnlocked);
    btn.classList.toggle("selected", current === s.id && isUnlocked);
    btn.disabled = !isUnlocked;
    const sk = SKINS[s.id];
    const swatch = (sk.body ? sk.body : ["#36f1ff", "#ff3bd4"]);
    btn.style.background = `linear-gradient(135deg, ${swatch[0]}, ${swatch[1]})`;
    btn.title = s.name;
    btn.innerHTML = `<span class="skin-name">${s.name}</span>${isUnlocked ? "" : `<span class="skin-lock">🔒 ${s.unlockAt}</span>`}`;
    btn.addEventListener("click", () => {
      if (!isUnlocked) return;
      storage.setSkin(s.id);
      sfx.uiTap();
      haptics.tap();
      refreshTitle();
    });
    skinSelectEl.appendChild(btn);
  }
  // worlds
  worldSelectEl.innerHTML = "";
  const availableWorlds = new Set(unlockedWorlds(best));
  const currentWorld = selectedWorldId(best);
  for (const world of WORLD_UNLOCKS) {
    const btn = document.createElement("button");
    const isUnlocked = availableWorlds.has(world.id);
    const theme = WORLDS[world.id];
    btn.className = "world-chip";
    btn.classList.toggle("locked", !isUnlocked);
    btn.classList.toggle("selected", currentWorld === world.id && isUnlocked);
    btn.disabled = !isUnlocked;
    btn.style.background = `linear-gradient(145deg, ${theme.field[0]}, ${theme.field[1]})`;
    btn.title = world.name;
    btn.innerHTML = `<span class="world-icon">${world.icon}</span><span class="world-name">${world.name}</span>${isUnlocked ? "" : `<span class="world-lock">🔒 ${world.unlockAt}</span>`}`;
    btn.addEventListener("click", () => {
      if (!isUnlocked) return;
      storage.setWorld(world.id);
      sfx.uiTap();
      haptics.tap();
      refreshTitle();
    });
    worldSelectEl.appendChild(btn);
  }
}

$("#btn-play").addEventListener("click", () => {
  unlockAudio();
  sfx.uiTap();
  haptics.tap();
  startGame();
});

$("#btn-board").addEventListener("click", async () => {
  unlockAudio();
  sfx.uiTap();
  haptics.tap();
  await openLeaderboard();
});

// Mute lives on both the title screen and the in-game HUD; keep them in sync.
function syncMuteUI() {
  const icon = isMuted() ? "🔇" : "🔊";
  $("#btn-mute").textContent = icon;
  $("#btn-mute-game").textContent = icon;
}
function toggleMute() {
  setMuted(!isMuted());
  syncMuteUI();
}
$("#btn-mute").addEventListener("click", toggleMute);
$("#btn-mute-game").addEventListener("click", toggleMute);

// --- Game scene ---
const hudScore  = $("#hud-score");
const hudCombo  = $("#hud-combo");
const hudBest   = $("#hud-best");
const hudWorld  = $("#hud-world");
const bannerEl  = $("#banner");
const countdownEl = $("#countdown");
const pauseOverlay = $("#pause-overlay");

let gameInstance = null;
let lastRunMeta = null;

// --- Start countdown ---
// Beats fire off setTimeout while game.js holds the snake still for COUNTDOWN_MS.
// Every exit from the game scene must call clearCountdown(), or a stray "GO!"
// lands on the title screen.
const COUNTDOWN_STEPS = [
  { at: 0,    text: "3",   step: "n" },
  { at: 700,  text: "2",   step: "n" },
  { at: 1400, text: "1",   step: "n" },
  { at: 2100, text: "GO!", step: "go" },
];
const COUNTDOWN_MS = 2100;   // the snake starts moving on "GO!"
const COUNTDOWN_END = 2800;  // "GO!" has finished fading by here

const countdownTimers = [];
let countdownStartedAt = 0;
let countdownElapsed = -1; // >=0 only while paused mid-countdown

function showCountdownStep(s) {
  countdownEl.textContent = s.text;
  countdownEl.dataset.step = s.step;
  countdownEl.classList.remove("show");
  void countdownEl.offsetWidth; // force reflow so the animation restarts
  countdownEl.classList.add("show");
  if (s.step === "go") { sfx.go(); haptics.tap(); }
  else sfx.count();
}

function scheduleCountdown(fromMs) {
  for (const s of COUNTDOWN_STEPS) {
    if (s.at < fromMs) continue;
    countdownTimers.push(setTimeout(() => showCountdownStep(s), s.at - fromMs));
  }
  countdownTimers.push(setTimeout(() => {
    countdownEl.classList.remove("show");
    countdownEl.textContent = "";
  }, COUNTDOWN_END - fromMs));
}

function startCountdown() {
  clearCountdown();
  countdownStartedAt = performance.now();
  countdownElapsed = -1;
  scheduleCountdown(0);
}

function clearCountdown() {
  countdownTimers.forEach(clearTimeout);
  countdownTimers.length = 0;
  countdownElapsed = -1;
  countdownEl.classList.remove("show");
  countdownEl.textContent = "";
}

function pauseCountdown() {
  const elapsed = performance.now() - countdownStartedAt;
  if (!countdownTimers.length || elapsed >= COUNTDOWN_END) { clearCountdown(); return; }
  countdownTimers.forEach(clearTimeout);
  countdownTimers.length = 0;
  countdownElapsed = elapsed;
}

function resumeCountdown() {
  if (countdownElapsed < 0) return;
  countdownStartedAt = performance.now() - countdownElapsed;
  scheduleCountdown(countdownElapsed);
  countdownElapsed = -1;
}

function startGame() {
  music.stop();
  const runBest = storage.getBest();
  const worldId = selectedWorldId(runBest);
  const world = getWorld(worldId);
  let bestBeaten = false;
  hudBest.textContent = `★ ${runBest}`;
  hudBest.classList.remove("newbest");
  hudScore.textContent = 0;
  hudCombo.textContent = "";
  hudWorld.textContent = `${world.icon} ${world.name}`;
  clearBanners();
  clearCountdown();
  pauseOverlay.classList.remove("show");
  showScene("game");
  const canvas = $("#game-canvas");
  canvas.dataset.world = worldId;
  if (gameInstance) gameInstance.destroy();
  gameInstance = createGame({
    canvas,
    getSkin: () => storage.getSkin(),
    getWorld: () => worldId,
    onScoreChange(score, combo) {
      hudScore.textContent = score;
      hudCombo.textContent = combo > 1 ? `×${combo} 🔥` : "";
      if (score > runBest) {
        hudBest.textContent = `★ ${score}`;
        hudBest.classList.add("newbest");
        if (!bestBeaten && runBest > 0) {
          bestBeaten = true;
          showBanner("NEW BEST! 👑", "gold");
        }
      }
    },
    onMilestone(m) {
      showBanner(m.text, m.color);
    },
    onGolden() {
      showBanner("SIX SEVENNN!", "gold");
    },
    onDeath({ score, prevBest, newBest }) {
      clearCountdown();
      lastRunMeta = {
        score,
        prevBest,
        newBest,
        skinUnlocks: newlyUnlocked(prevBest, newBest),
        worldUnlocks: newlyUnlockedWorlds(prevBest, newBest),
      };
      // Let the whole death beat play out — flash, colour drain, dizzy stars —
      // then tear the game down so the rAF loop and input listeners don't keep
      // running behind the menus.
      setTimeout(() => {
        if (gameInstance) { gameInstance.destroy(); gameInstance = null; }
        openSubmit();
      }, 1100);
    },
  });
  gameInstance.start({ delayMs: COUNTDOWN_MS });
  startCountdown();
}

// Banners queue up so back-to-back celebrations play one after another
// instead of overwriting each other.
const bannerQueue = [];
let bannerTimer = null;

function showBanner(text, color) {
  bannerQueue.push({ text, color });
  if (!bannerTimer) nextBanner();
}

function nextBanner() {
  const b = bannerQueue.shift();
  if (!b) { bannerTimer = null; return; }
  bannerEl.textContent = b.text;
  bannerEl.dataset.color = b.color;
  bannerEl.classList.remove("show");
  // force reflow to restart animation
  void bannerEl.offsetWidth;
  bannerEl.classList.add("show");
  bannerTimer = setTimeout(() => {
    bannerEl.classList.remove("show");
    bannerTimer = setTimeout(nextBanner, 120);
  }, 1400);
}

function clearBanners() {
  bannerQueue.length = 0;
  clearTimeout(bannerTimer);
  bannerTimer = null;
  bannerEl.classList.remove("show");
}

// --- Pause ---
function pauseGame() {
  if (!gameInstance || !gameInstance.isAlive() || gameInstance.isPaused()) return;
  gameInstance.pause();
  pauseCountdown();
  pauseOverlay.classList.add("show");
  sfx.uiTap();
  haptics.tap();
}

function resumeGame() {
  if (!gameInstance || !gameInstance.isPaused()) return;
  pauseOverlay.classList.remove("show");
  gameInstance.resume();
  resumeCountdown();
  sfx.uiTap();
  haptics.tap();
}

function quitToMenu() {
  pauseOverlay.classList.remove("show");
  clearBanners();
  clearCountdown();
  if (gameInstance) { gameInstance.stop(); gameInstance.destroy(); gameInstance = null; }
  sfx.uiTap();
  haptics.tap();
  refreshTitle();
  showScene("title");
  music.start();
}

$("#btn-pause").addEventListener("click", pauseGame);
$("#btn-resume").addEventListener("click", resumeGame);
$("#btn-quit").addEventListener("click", quitToMenu);

// Auto-pause if the kid switches apps / the tab is hidden mid-game.
document.addEventListener("visibilitychange", () => {
  if (document.hidden && scenes.game.classList.contains("active")) pauseGame();
});

// --- Submit scene ---
const emojiRow  = $("#emoji-row");
const letterGrid = $("#letter-grid");
const initialsEls = [$("#init-0"), $("#init-1"), $("#init-2")];
const submitFinalScore = $("#submit-final-score");
const submitUnlocks    = $("#submit-unlocks");
const submitStatus     = $("#submit-status");
const submitNextUnlock = $("#submit-next-unlock");

let selectedEmoji = "🔥";
let selectedInitials = ["A","A","A"];
let activeInitialIdx = 0;

function buildEmojiRow() {
  emojiRow.innerHTML = "";
  for (const e of EMOJIS) {
    const b = document.createElement("button");
    b.className = "emoji-chip";
    b.textContent = e;
    b.addEventListener("click", () => {
      selectedEmoji = e;
      $$(".emoji-chip").forEach(x => x.classList.remove("selected"));
      b.classList.add("selected");
      sfx.uiTap();
      haptics.tap();
    });
    emojiRow.appendChild(b);
  }
}

function renderInitials() {
  initialsEls.forEach((el, i) => {
    el.textContent = selectedInitials[i];
    el.classList.toggle("active", i === activeInitialIdx);
  });
}

// A-Z keyboard. 26 keys never change, so it's built once at boot.
function buildLetterGrid() {
  letterGrid.innerHTML = "";
  for (let i = 0; i < 26; i++) {
    const letter = String.fromCharCode(65 + i);
    const key = document.createElement("button");
    key.className = "letter-key";
    key.textContent = letter;
    key.addEventListener("click", () => {
      setInitial(letter);
      sfx.uiTap();
      haptics.tap();
    });
    letterGrid.appendChild(key);
  }
}

// Type into the active slot, then step to the next one so three taps spell a
// name. The third letter parks in place instead of wrapping to the first.
function setInitial(letter) {
  selectedInitials[activeInitialIdx] = letter;
  if (activeInitialIdx < 2) activeInitialIdx++;
  renderInitials();
}

initialsEls.forEach((el, i) => {
  el.addEventListener("click", () => {
    activeInitialIdx = i;
    renderInitials();
    sfx.uiTap();
    haptics.tap();
  });
});

// keyboard support for initials
window.addEventListener("keydown", (e) => {
  if (!scenes.submit.classList.contains("active")) return;
  if (/^[a-zA-Z]$/.test(e.key)) {
    setInitial(e.key.toUpperCase());
  } else if (e.key === "ArrowRight") {
    activeInitialIdx = Math.min(2, activeInitialIdx + 1); renderInitials();
  } else if (e.key === "ArrowLeft") {
    activeInitialIdx = Math.max(0, activeInitialIdx - 1); renderInitials();
  } else if (e.key === "Enter") {
    doSubmit();
  } else if (e.key === "Backspace") {
    activeInitialIdx = Math.max(0, activeInitialIdx - 1);
    renderInitials();
  }
});

// Each reward gets its own card so a ten-unlock run reads as a row of prizes
// instead of a run-on sentence. Names stay in textContent (the E2E suite reads
// them straight off #submit-unlocks) and the "🎉 New rewards:" label is kept.
const REWARD_STAGGER_MS = 55;

function renderRewardCards(rewards) {
  clearSparkles();
  submitUnlocks.innerHTML = "";
  const label = document.createElement("span");
  label.className = "unlocks-label";
  label.textContent = "🎉 New rewards:";
  submitUnlocks.appendChild(label);
  rewards.forEach((reward, i) => {
    const card = document.createElement("span");
    card.className = "reward-card";
    card.style.animationDelay = `${i * REWARD_STAGGER_MS}ms`;
    for (const [cls, value] of [["reward-icon", reward.icon], ["reward-name", reward.name], ["reward-kind", reward.kind]]) {
      const span = document.createElement("span");
      span.className = cls;
      span.textContent = value;
      card.appendChild(span);
    }
    submitUnlocks.appendChild(card);
  });
}

// The game canvas is long gone by the time this screen appears, so the burst is
// plain DOM. The sparkles carry no text, so they never pollute textContent.
const SPARKLE_COUNT = 12;
const SPARKLE_LIFE_MS = 1100;
let sparkleTimer = null;

function clearSparkles() {
  clearTimeout(sparkleTimer);
  sparkleTimer = null;
  submitUnlocks.querySelectorAll(".reward-spark").forEach(el => el.remove());
}

function sparkleBurst(container) {
  if (REDUCED) return;
  for (let i = 0; i < SPARKLE_COUNT; i++) {
    const spark = document.createElement("span");
    spark.className = "reward-spark";
    const angle = (i / SPARKLE_COUNT) * Math.PI * 2 + Math.random() * 0.4;
    const dist = 50 + Math.random() * 60;
    spark.style.setProperty("--dx", `${Math.round(Math.cos(angle) * dist)}px`);
    spark.style.setProperty("--dy", `${Math.round(Math.sin(angle) * dist * 0.7)}px`);
    spark.style.animationDelay = `${Math.round(Math.random() * 160)}ms`;
    container.appendChild(spark);
  }
  sparkleTimer = setTimeout(clearSparkles, SPARKLE_LIFE_MS);
}

function openSubmit() {
  if (!lastRunMeta) return;
  $("#submit-heading").textContent = pick(DEATH_HEADINGS);
  selectedEmoji = storage.getEmoji();
  selectedInitials = storage.getInitials().split("");
  activeInitialIdx = 0;
  buildEmojiRow();
  // mark previously-selected emoji
  setTimeout(() => {
    $$(".emoji-chip").forEach(b => b.classList.toggle("selected", b.textContent === selectedEmoji));
  }, 0);
  renderInitials();
  submitFinalScore.textContent = lastRunMeta.score;
  const skinUnlocks = (lastRunMeta.skinUnlocks || []).map(id => ({
    icon: "🐍",
    name: SKINS[id].name,
    kind: "skin",
  }));
  const worldUnlocks = (lastRunMeta.worldUnlocks || []).map(id => ({
    icon: WORLDS[id].icon,
    name: WORLDS[id].name,
    kind: "world",
  }));
  const rewards = [...skinUnlocks, ...worldUnlocks];
  if (rewards.length) {
    renderRewardCards(rewards);
    submitUnlocks.classList.add("show");
    sfx.fanfare();
    haptics.milestone();
    sparkleBurst(submitUnlocks);
  } else {
    submitUnlocks.classList.remove("show");
    clearSparkles();
    submitUnlocks.innerHTML = "";
  }
  if (lastRunMeta.newBest > lastRunMeta.prevBest) {
    submitStatus.textContent = "🏆 New personal best!";
  } else {
    submitStatus.textContent = "";
  }
  renderNextUnlock(submitNextUnlock, lastRunMeta.newBest, { gameOver: true });
  showScene("submit");
  music.start();
}

async function doSubmit() {
  const initials = selectedInitials.join("");
  storage.setEmoji(selectedEmoji);
  storage.setInitials(initials);
  sfx.uiTap();
  haptics.tap();
  $("#btn-submit").disabled = true;
  submitStatus.textContent = "Sending…";
  const result = await submitScore({
    emoji: selectedEmoji,
    initials,
    score: lastRunMeta.score,
  });
  $("#btn-submit").disabled = false;
  if (result.ok) {
    await openLeaderboard({ highlightId: result.row?.id });
  } else if (result.queued) {
    submitStatus.textContent = "Saved offline — will retry next visit.";
    setTimeout(() => openLeaderboard(), 900);
  } else {
    submitStatus.textContent = "Hmm, something went wrong.";
  }
}

$("#btn-submit").addEventListener("click", doSubmit);
$("#btn-skip").addEventListener("click", () => { sfx.uiTap(); haptics.tap(); openLeaderboard(); });

// --- Leaderboard scene ---
const boardList = $("#board-list");
const boardStatus = $("#board-status");

async function openLeaderboard({ highlightId } = {}) {
  showScene("leaderboard");
  music.start();
  boardList.innerHTML = "";
  boardStatus.textContent = "Loading…";
  const result = await fetchTop(50);
  if (!result.ok) {
    if (result.reason === "not-configured") {
      boardStatus.innerHTML = "Leaderboard isn't connected yet. <br>Set <code>SUPABASE_URL</code> &amp; <code>SUPABASE_PUBLISHABLE_KEY</code> in <code>src/config.js</code> — see README.";
    } else {
      boardStatus.textContent = "Couldn't load scores. Check your connection.";
    }
    return;
  }
  boardStatus.textContent = result.rows.length ? "" : "Be the first to set a score! 🎮";
  result.rows.forEach((row, i) => {
    const li = document.createElement("li");
    li.className = "board-row";
    if (highlightId && row.id === highlightId) li.classList.add("just-me");
    const rank = i + 1;
    const medal = rank === 1 ? "👑" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `${rank}`;
    // Build with textContent — emoji/initials come from the public table, so
    // never trust them as HTML.
    for (const [cls, value] of [["rank", medal], ["avatar", row.emoji], ["initials", row.initials], ["score", row.score]]) {
      const span = document.createElement("span");
      span.className = cls;
      span.textContent = value;
      li.appendChild(span);
    }
    boardList.appendChild(li);
  });
  if (highlightId) {
    setTimeout(() => {
      const el = boardList.querySelector(".just-me");
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  }
}

$("#btn-replay").addEventListener("click", () => { sfx.uiTap(); haptics.tap(); startGame(); });
$("#btn-home").addEventListener("click", () => { sfx.uiTap(); haptics.tap(); refreshTitle(); showScene("title"); music.start(); });

// --- Boot ---
buildLetterGrid();
refreshTitle();
showScene("title");
flushQueue();
