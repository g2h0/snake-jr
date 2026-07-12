// Headless E2E smoke check for Snake Jr.
//
// One-time setup:   cd tools && npm install && npx playwright install chromium
// Run:              npm run e2e            (from tools/)
//
// Starts its own static server (needs `python` on PATH), then plays a scripted
// deterministic game: Math.random is stubbed ONLY inside spawnFood /
// maybeSpawnGolden (detected via stack inspection) so apples and the golden
// apple land in the snake's path on purpose. That makes exact scores, combos,
// milestone banners, skin unlocks, and the death flow assertable.
//
// Scripted run on the 20x24 grid (snake starts at (10,12) heading right):
//   apple (15,12) -> apple (1,12) -> GOLDEN (4,12) -> apple (7,12) -> apple (17,12)
//   scores: +1, +2 (x2 combo), +67 (golden, flat), +4 (x4), +5 (x5 MAX AURA) = 79
// then the snake coils into itself to reach the submit screen.

const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = 8917;
const ROOT = path.join(__dirname, "..");
const SCREEN_DIR = path.join(__dirname, "screens");

const failures = [];
function check(label, ok, detail = "") {
  console.log(`${ok ? "  ok " : "FAIL "} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(label);
}

async function waitForServer(url, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error(`server at ${url} did not come up in ${ms}ms`);
}

(async () => {
  fs.mkdirSync(SCREEN_DIR, { recursive: true });
  const server = spawn("python", ["-m", "http.server", String(PORT)], { cwd: ROOT, stdio: "ignore" });
  try {
    await waitForServer(`http://localhost:${PORT}/`, 10000);

    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 820, height: 1080 } });
    const errors = [];
    page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", e => errors.push("PAGEERROR: " + e.message));

    await page.addInitScript(() => {
      const q = [
        0.755, 0.51,                   // apple1 -> (15,12)
        0.07, 0.51, 0.99,              // after eat1: apple2 -> (1,12), no golden
        0.36, 0.51, 0.03, 0.22, 0.51,  // after eat2: apple3 -> (7,12), golden -> (4,12)
        0.86, 0.51, 0.99,              // after eat3: apple4 -> (17,12), no golden
        0.51, 0.09, 0.99,              // after eat4: apple5 -> (10,2), out of the way
      ];
      const real = Math.random.bind(Math);
      Math.random = function () {
        if (q.length) {
          const s = new Error().stack || "";
          if (s.includes("spawnFood") || s.includes("maybeSpawnGolden")) return q.shift();
        }
        return real();
      };
      localStorage.clear(); // fresh personal best so the unlock list is exact
    });

    await page.goto(`http://localhost:${PORT}/`);
    await page.waitForSelector("#btn-play");
    await page.waitForTimeout(800);

    const titanoChip = await page.evaluate(() => {
      const chip = [...document.querySelectorAll(".skin-chip")].find(c => c.title === "Titanoboa");
      return chip ? chip.textContent.trim() : "MISSING";
    });
    check("Titanoboa locked at 250 on title screen", titanoChip.includes("250"), titanoChip);

    await page.click("#btn-play");

    const scoreAtLeast = async (n, timeout) => {
      const t0 = Date.now();
      while (Date.now() - t0 < timeout) {
        const s = parseInt(await page.textContent("#hud-score"), 10);
        if (s >= n) return s;
        await page.waitForTimeout(40);
      }
      throw new Error(`score never reached ${n}`);
    };

    let s = await scoreAtLeast(70, 15000);
    check("golden apple is flat +67 mid-combo (score exactly 70)", s === 70, `got ${s}`);
    await page.screenshot({ path: path.join(SCREEN_DIR, "golden.png") });

    s = await scoreAtLeast(79, 15000);
    check("max-combo apple is +5 (score exactly 79)", s === 79, `got ${s}`);

    // coil into ourselves until the submit scene appears
    const dirs = ["ArrowDown", "ArrowLeft", "ArrowUp", "ArrowRight"];
    let i = 0;
    const t0 = Date.now();
    let died = false;
    while (Date.now() - t0 < 20000) {
      died = await page.$eval("#scene-submit", el => el.classList.contains("active")).catch(() => false);
      if (died) break;
      await page.keyboard.press(dirs[i++ % 4]);
      await page.waitForTimeout(200);
    }
    check("self-collision reaches the submit screen", died);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SCREEN_DIR, "submit.png") });

    const unlocks = (await page.textContent("#submit-unlocks")).trim();
    check("79 unlocks up to Green Tree Python", unlocks.includes("Green Tree Python"), unlocks);
    check("79 does NOT unlock King Cobra/Rainbow Boa/Titanoboa",
      !/King Cobra|Rainbow Boa|Titanoboa/.test(unlocks), unlocks);

    // zombie-loop check: no rAF activity while sitting on the submit screen
    const rafCount = await page.evaluate(() => new Promise(res => {
      let c = 0;
      const orig = window.requestAnimationFrame;
      window.requestAnimationFrame = f => { c++; return orig(f); };
      setTimeout(() => { window.requestAnimationFrame = orig; res(c); }, 600);
    }));
    check("game loop fully stopped after death (0 rAF in 600ms)", rafCount === 0, `got ${rafCount}`);

    // save score with Supabase unconfigured -> offline queue -> leaderboard
    await page.click("#btn-submit");
    await page.waitForTimeout(1400);
    const onBoard = await page.$eval("#scene-leaderboard", el => el.classList.contains("active"));
    check("save score lands on the leaderboard scene", onBoard);

    // replay: HUD best carries over; in-game mute stays synced with title mute
    await page.click("#btn-replay");
    await page.waitForTimeout(800);
    const hudBest = await page.textContent("#hud-best");
    check("HUD best shows new personal best on replay", hudBest.includes("79"), hudBest);
    await page.click("#btn-mute-game");
    const icons = await page.evaluate(() => [
      document.querySelector("#btn-mute-game").textContent,
      document.querySelector("#btn-mute").textContent,
    ]);
    check("mute buttons stay in sync", icons[0] === "🔇" && icons[1] === "🔇", icons.join(" "));

    check("no console errors", errors.length === 0, JSON.stringify(errors));

    await browser.close();
  } finally {
    server.kill();
  }

  console.log(failures.length ? `\n${failures.length} check(s) FAILED` : "\nAll checks passed 🐍");
  process.exit(failures.length ? 1 : 0);
})().catch(e => {
  console.error("E2E run crashed:", e);
  process.exit(1);
});
