// Boot + scene routing.
// Scenes: title -> game -> submit -> leaderboard -> title.

import { createGame } from "./game.js";
import { sfx, music, unlock as unlockAudio, setMuted, isMuted } from "./audio.js";
import { haptics } from "./haptics.js";
import { storage } from "./storage.js";
import { fetchTop, submitScore, flushQueue } from "./leaderboard.js";
import { EMOJIS, SKIN_UNLOCKS, TAGLINES, DEATH_HEADINGS } from "./config.js";
import { unlockedSkins, newlyUnlocked, SKINS } from "./skins.js";

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
const taglineEl    = $("#tagline");

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function refreshTitle() {
  const best = storage.getBest();
  bestEl.textContent = best;
  taglineEl.textContent = pick(TAGLINES);
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
const bannerEl  = $("#banner");
const pauseOverlay = $("#pause-overlay");

let gameInstance = null;
let lastRunMeta = null;

function startGame() {
  music.stop();
  const runBest = storage.getBest();
  let bestBeaten = false;
  hudBest.textContent = `★ ${runBest}`;
  hudBest.classList.remove("newbest");
  hudScore.textContent = 0;
  hudCombo.textContent = "";
  clearBanners();
  pauseOverlay.classList.remove("show");
  showScene("game");
  const canvas = $("#game-canvas");
  if (gameInstance) gameInstance.destroy();
  gameInstance = createGame({
    canvas,
    getSkin: () => storage.getSkin(),
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
      lastRunMeta = { score, prevBest, newBest, unlocks: newlyUnlocked(prevBest, newBest) };
      // Let the death shake/confetti play out, then tear the game down so the
      // rAF loop and input listeners don't keep running behind the menus.
      setTimeout(() => {
        if (gameInstance) { gameInstance.destroy(); gameInstance = null; }
        openSubmit();
      }, 700);
    },
  });
  gameInstance.start();
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
  pauseOverlay.classList.add("show");
  sfx.uiTap();
  haptics.tap();
}

function resumeGame() {
  if (!gameInstance || !gameInstance.isPaused()) return;
  pauseOverlay.classList.remove("show");
  gameInstance.resume();
  sfx.uiTap();
  haptics.tap();
}

function quitToMenu() {
  pauseOverlay.classList.remove("show");
  clearBanners();
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
const initialsEls = [$("#init-0"), $("#init-1"), $("#init-2")];
const submitFinalScore = $("#submit-final-score");
const submitUnlocks    = $("#submit-unlocks");
const submitStatus     = $("#submit-status");

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

function bumpInitial(idx, delta) {
  const code = selectedInitials[idx].charCodeAt(0) - 65;
  const next = ((code + delta) % 26 + 26) % 26;
  selectedInitials[idx] = String.fromCharCode(65 + next);
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

$("#init-up").addEventListener("click", () => { bumpInitial(activeInitialIdx,  1); sfx.uiTap(); haptics.tap(); });
$("#init-down").addEventListener("click", () => { bumpInitial(activeInitialIdx, -1); sfx.uiTap(); haptics.tap(); });
$("#init-next").addEventListener("click", () => {
  activeInitialIdx = (activeInitialIdx + 1) % 3;
  renderInitials();
  sfx.uiTap();
  haptics.tap();
});

// keyboard support for initials
window.addEventListener("keydown", (e) => {
  if (!scenes.submit.classList.contains("active")) return;
  if (/^[a-zA-Z]$/.test(e.key)) {
    selectedInitials[activeInitialIdx] = e.key.toUpperCase();
    if (activeInitialIdx < 2) activeInitialIdx++;
    renderInitials();
  } else if (e.key === "ArrowRight") {
    activeInitialIdx = Math.min(2, activeInitialIdx + 1); renderInitials();
  } else if (e.key === "ArrowLeft") {
    activeInitialIdx = Math.max(0, activeInitialIdx - 1); renderInitials();
  } else if (e.key === "Enter") {
    doSubmit();
  } else if (e.key === "Backspace") {
    bumpInitial(activeInitialIdx, -1);
  }
});

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
  const unlocks = lastRunMeta.unlocks || [];
  if (unlocks.length) {
    submitUnlocks.innerHTML = `🎉 New skin${unlocks.length > 1 ? "s" : ""} unlocked: ` +
      unlocks.map(id => `<b>${SKINS[id].name}</b>`).join(", ");
    submitUnlocks.classList.add("show");
  } else {
    submitUnlocks.classList.remove("show");
    submitUnlocks.innerHTML = "";
  }
  if (lastRunMeta.newBest > lastRunMeta.prevBest) {
    submitStatus.textContent = "🏆 New personal best!";
  } else {
    submitStatus.textContent = "";
  }
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
      boardStatus.innerHTML = "Leaderboard isn't connected yet. <br>Set <code>SUPABASE_URL</code> &amp; <code>SUPABASE_ANON_KEY</code> in <code>src/config.js</code> — see README.";
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
refreshTitle();
showScene("title");
flushQueue();
