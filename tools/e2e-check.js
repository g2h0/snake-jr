// Headless E2E smoke check for Snake Jr.
//
// One-time setup:   cd tools && npm install && npm run install-browser
// Run:              npm run e2e            (from tools/)
//
// Starts its own Node static server, then plays a scripted
// deterministic game: Math.random is stubbed ONLY inside spawnFood /
// maybeSpawnGolden (detected via stack inspection) so apples and the golden
// apple land in the snake's path on purpose. That makes exact scores, combos,
// milestone banners, skin unlocks, and the death flow assertable.
//
// Scripted run on the 20x24 grid (snake starts at (10,12) heading right):
//   apple (15,12) -> apple (1,12) -> GOLDEN (4,12) -> apple (7,12) -> apple (17,12)
//   scores: +1, +2 (x2 combo), +67 (golden, flat), +4 (x4), +5 (x5 MAX AURA) = 79
// then the snake coils into itself to reach the submit screen.

const http = require("http");
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = 8917;
const ROOT = path.join(__dirname, "..");
const SCREEN_DIR = path.join(__dirname, "screens");
const MOCK_SUPABASE_URL = "https://snake-jr-e2e.supabase.co";
const MOCK_SUPABASE_KEY = "sb_publishable_e2e";

const failures = [];
function check(label, ok, detail = "") {
  console.log(`${ok ? "  ok " : "FAIL "} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(label);
}

function startStaticServer(root, port) {
  const mimeTypes = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
  };

  const server = http.createServer((req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD" });
      res.end();
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    } catch {
      res.writeHead(400);
      res.end("Bad request");
      return;
    }

    const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const filePath = path.resolve(root, relativePath);
    if (!filePath.startsWith(`${root}${path.sep}`)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    fs.readFile(filePath, (err, body) => {
      if (err) {
        res.writeHead(err.code === "ENOENT" ? 404 : 500);
        res.end(err.code === "ENOENT" ? "Not found" : "Server error");
        return;
      }
      res.writeHead(200, {
        "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(req.method === "HEAD" ? undefined : body);
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve(server);
    });
  });
}

(async () => {
  fs.mkdirSync(SCREEN_DIR, { recursive: true });
  const server = await startStaticServer(ROOT, PORT);
  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 820, height: 1080 } });
    const errors = [];
    const expectedMockErrors = [];
    const unexpectedSupabaseRequests = [];
    page.on("console", m => {
      if (m.type() !== "error") return;
      const message = m.text();
      const location = m.location().url || "";
      if (message.includes("Failed to load resource") && location.startsWith(MOCK_SUPABASE_URL)) {
        expectedMockErrors.push(message);
      } else {
        errors.push(message);
      }
    });
    page.on("pageerror", e => errors.push("PAGEERROR: " + e.message));
    page.on("request", request => {
      const url = request.url();
      if (url.includes(".supabase.co") && !url.startsWith(MOCK_SUPABASE_URL)) {
        unexpectedSupabaseRequests.push(url);
      }
    });

    const mockScores = [];
    const apiRequests = [];
    let nextMockScoreId = 1;
    let failNextInsert = false;
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "apikey, content-type, prefer",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    };

    await page.route(`${MOCK_SUPABASE_URL}/rest/v1/scores**`, async route => {
      const request = route.request();
      const method = request.method();
      if (method === "OPTIONS") {
        await route.fulfill({ status: 204, headers: corsHeaders });
        return;
      }

      const requestRecord = {
        method,
        url: request.url(),
        headers: request.headers(),
        body: request.postData() ? JSON.parse(request.postData()) : null,
      };
      apiRequests.push(requestRecord);

      if (method === "GET") {
        const url = new URL(request.url());
        const limit = Number(url.searchParams.get("limit")) || 50;
        const rows = [...mockScores]
          .sort((a, b) => b.score - a.score || b.created_at.localeCompare(a.created_at) || b.id - a.id)
          .slice(0, limit);
        await route.fulfill({
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          body: JSON.stringify(rows),
        });
        return;
      }

      if (method === "POST") {
        if (failNextInsert) {
          failNextInsert = false;
          await route.fulfill({
            status: 503,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            body: JSON.stringify({ message: "temporary test failure" }),
          });
          return;
        }

        const row = {
          id: nextMockScoreId++,
          ...requestRecord.body,
          created_at: new Date(Date.UTC(2026, 6, 21, 12, 0, nextMockScoreId)).toISOString(),
        };
        mockScores.push(row);
        const returnRepresentation = requestRecord.headers.prefer?.includes("return=representation");
        await route.fulfill({
          status: 201,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          body: returnRepresentation ? JSON.stringify([row]) : "",
        });
        return;
      }

      await route.fulfill({ status: 405, headers: corsHeaders });
    });

    await page.addInitScript(({ supabaseUrl, supabasePublishableKey }) => {
      globalThis.__SNAKE_JR_TEST_CONFIG__ = { supabaseUrl, supabasePublishableKey };
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
    }, { supabaseUrl: MOCK_SUPABASE_URL, supabasePublishableKey: MOCK_SUPABASE_KEY });

    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForSelector("#btn-play");
    await page.waitForTimeout(800);

    const titanoChip = await page.evaluate(() => {
      const chip = [...document.querySelectorAll(".skin-chip")].find(c => c.title === "Titanoboa");
      return chip ? chip.textContent.trim() : "MISSING";
    });
    check("Titanoboa locked at 250 on title screen", titanoChip.includes("250"), titanoChip);

    const initialProgress = (await page.textContent("#title-next-unlock")).trim();
    check("fresh player sees Candy Land as the next reward",
      initialProgress.includes("Candy Land") && initialProgress.includes("0 / 10"),
      initialProgress);

    const dimensionChip = await page.evaluate(() => {
      const chip = [...document.querySelectorAll(".world-chip")].find(c => c.title === "67 Dimension");
      return chip ? { text: chip.textContent.trim(), disabled: chip.disabled } : null;
    });
    check("67 Dimension is visible and locked at 150",
      dimensionChip?.disabled && dimensionChip.text.includes("150"),
      JSON.stringify(dimensionChip));

    const progressionChecks = await page.evaluate(async () => {
      const { getNextUnlock } = await import("./src/progression.js");
      const at24 = getNextUnlock(24);
      return {
        at24: at24?.at,
        namesAt24: at24?.items.map(item => item.name),
        at250: getNextUnlock(250),
      };
    });
    check("score 24 previews both rewards at 25",
      progressionChecks.at24 === 25 &&
      progressionChecks.namesAt24.includes("Corn Snake") &&
      progressionChecks.namesAt24.includes("Jungle"),
      JSON.stringify(progressionChecks));
    check("score 250 completes the reward track", progressionChecks.at250 === null);

    const renderedWorlds = await page.evaluate(async () => {
      const [{ createRenderer }, { WORLD_UNLOCKS }] = await Promise.all([
        import("./src/renderer.js"),
        import("./src/worlds.js"),
      ]);
      const canvas = document.createElement("canvas");
      canvas.style.cssText = "position:fixed;left:-1000px;top:0;width:320px;height:480px";
      document.body.appendChild(canvas);
      const renderer = createRenderer(canvas);
      renderer.resize();
      const colors = [];
      for (const world of WORLD_UNLOCKS) {
        renderer.clear();
        renderer.drawFieldBg(world.id, 1234);
        renderer.drawApple({ x: 2, y: 2 }, 1234, world.id);
        colors.push([...renderer.ctx.getImageData(2, 2, 1, 1).data].join(","));
      }
      canvas.remove();
      return { count: colors.length, uniqueBackdrops: new Set(colors).size };
    });
    check("all eight worlds render with distinct backdrops",
      renderedWorlds.count === 8 && renderedWorlds.uniqueBackdrops === 8,
      JSON.stringify(renderedWorlds));

    await page.setViewportSize({ width: 390, height: 844 });
    const phoneTitleLayout = await page.evaluate(() => {
      const scene = document.querySelector("#scene-title");
      const play = document.querySelector("#btn-play").getBoundingClientRect();
      return {
        scrollable: scene.scrollHeight > scene.clientHeight,
        overflowY: getComputedStyle(scene).overflowY,
        playVisible: play.top >= 0 && play.bottom <= innerHeight,
      };
    });
    check("phone title keeps Play visible and extra rewards scrollable",
      phoneTitleLayout.playVisible &&
      (!phoneTitleLayout.scrollable || phoneTitleLayout.overflowY === "auto"),
      JSON.stringify(phoneTitleLayout));
    await page.screenshot({ path: path.join(SCREEN_DIR, "phone-title.png") });
    await page.setViewportSize({ width: 820, height: 1080 });

    // Exercise the Supabase REST client directly without touching a live project.
    const initialFetch = await page.evaluate(async () => {
      const { fetchTop } = await import("./src/leaderboard.js");
      return fetchTop(999);
    });
    check("mock leaderboard starts empty", initialFetch.ok && initialFetch.rows.length === 0);
    const firstGet = apiRequests.find(r => r.method === "GET");
    const firstGetUrl = new URL(firstGet?.url || MOCK_SUPABASE_URL);
    check("leaderboard query requests explicit columns",
      firstGetUrl.searchParams.get("select") === "id,emoji,initials,score,created_at",
      firstGetUrl.searchParams.get("select") || "missing");
    check("leaderboard query caps rows at 50", firstGetUrl.searchParams.get("limit") === "50",
      firstGetUrl.searchParams.get("limit") || "missing");

    const postCountBeforeInvalid = apiRequests.filter(r => r.method === "POST").length;
    const invalidResult = await page.evaluate(async () => {
      const { submitScore } = await import("./src/leaderboard.js");
      return submitScore({ emoji: "💣", initials: "NO", score: 10000 });
    });
    check("invalid scores are rejected before fetch", invalidResult.reason === "invalid" && !invalidResult.queued);
    check("invalid scores make no API request",
      apiRequests.filter(r => r.method === "POST").length === postCountBeforeInvalid);

    failNextInsert = true;
    const queuedResult = await page.evaluate(async () => {
      const { submitScore } = await import("./src/leaderboard.js");
      const result = await submitScore({ emoji: "🐢", initials: " qwe ", score: 42 });
      const queue = JSON.parse(localStorage.getItem("snakejr.queue") || "[]");
      return { result, queue };
    });
    check("temporary server errors queue a normalized score",
      queuedResult.result.queued && queuedResult.queue.length === 1 && queuedResult.queue[0].initials === "QWE",
      JSON.stringify(queuedResult));
    check("simulated server failure was exercised", expectedMockErrors.length === 1,
      `observed ${expectedMockErrors.length}`);

    await page.evaluate(async () => {
      const { flushQueue } = await import("./src/leaderboard.js");
      await flushQueue();
    });
    const queueAfterFlush = await page.evaluate(() => JSON.parse(localStorage.getItem("snakejr.queue") || "[]"));
    check("queued scores flush after recovery", queueAfterFlush.length === 0 && mockScores.some(s => s.initials === "QWE"));

    const queueCap = await page.evaluate(async () => {
      const { storage } = await import("./src/storage.js");
      storage.clearQueue();
      for (let score = 0; score < 25; score++) {
        storage.pushQueue({ emoji: "🔥", initials: "AAA", score });
      }
      const queue = storage.getQueue();
      storage.clearQueue();
      return { length: queue.length, first: queue[0]?.score, last: queue.at(-1)?.score };
    });
    check("offline score queue is capped at 20",
      queueCap.length === 20 && queueCap.first === 5 && queueCap.last === 24,
      JSON.stringify(queueCap));

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
    check("79 unlocks worlds up to Space",
      /Candy Land/.test(unlocks) && /Space/.test(unlocks) && !/Neon Arcade/.test(unlocks),
      unlocks);
    check("79 does NOT unlock King Cobra/Rainbow Boa/Titanoboa",
      !/King Cobra|Rainbow Boa|Titanoboa/.test(unlocks), unlocks);

    const nextAfter79 = (await page.textContent("#submit-next-unlock")).trim();
    check("game over points toward Neon Arcade at 100",
      nextAfter79.includes("Neon Arcade") && nextAfter79.includes("21 more points") && nextAfter79.includes("79 / 100"),
      nextAfter79);

    await page.setViewportSize({ width: 390, height: 844 });
    const phoneSubmitLayout = await page.evaluate(() => {
      const scene = document.querySelector("#scene-submit");
      const panel = document.querySelector("#scene-submit .panel").getBoundingClientRect();
      return {
        overflowY: getComputedStyle(scene).overflowY,
        panelTopReachable: panel.top >= 0,
        canReachBottom: scene.scrollHeight >= panel.height,
      };
    });
    check("multi-unlock game over remains reachable on phone",
      phoneSubmitLayout.overflowY === "auto" &&
      phoneSubmitLayout.panelTopReachable &&
      phoneSubmitLayout.canReachBottom,
      JSON.stringify(phoneSubmitLayout));
    await page.screenshot({ path: path.join(SCREEN_DIR, "phone-submit.png") });
    await page.setViewportSize({ width: 820, height: 1080 });

    // zombie-loop check: no rAF activity while sitting on the submit screen
    const rafCount = await page.evaluate(() => new Promise(res => {
      let c = 0;
      const orig = window.requestAnimationFrame;
      window.requestAnimationFrame = f => { c++; return orig(f); };
      setTimeout(() => { window.requestAnimationFrame = orig; res(c); }, 600);
    }));
    check("game loop fully stopped after death (0 rAF in 600ms)", rafCount === 0, `got ${rafCount}`);

    // Save to the mocked Supabase API, then render the returned leaderboard.
    await page.click("#btn-submit");
    await page.waitForTimeout(1400);
    const onBoard = await page.$eval("#scene-leaderboard", el => el.classList.contains("active"));
    check("save score lands on the leaderboard scene", onBoard);
    const highlightedScore = await page.textContent("#board-list .just-me").catch(() => "");
    check("saved score is highlighted on the leaderboard",
      highlightedScore.includes("AAA") && highlightedScore.includes("79"), highlightedScore.trim());

    const dataRequests = apiRequests.filter(r => r.method === "GET" || r.method === "POST");
    check("Supabase requests use the publishable apikey header",
      dataRequests.length > 0 && dataRequests.every(r => r.headers.apikey === MOCK_SUPABASE_KEY));
    check("publishable key is never sent as bearer authorization",
      dataRequests.every(r => !("authorization" in r.headers)));
    check("E2E never contacts configured production Supabase",
      unexpectedSupabaseRequests.length === 0, JSON.stringify(unexpectedSupabaseRequests));

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

    // Newly unlocked worlds can be selected, persist, and reach the renderer.
    await page.click("#btn-pause");
    await page.click("#btn-quit");
    const spaceAvailable = await page.$eval(".world-chip[title='Space']", chip => !chip.disabled);
    check("Space is selectable after the 79-point run", spaceAvailable);
    await page.click(".world-chip[title='Space']");
    const savedWorld = await page.evaluate(() => JSON.parse(localStorage.getItem("snakejr.world")));
    check("selected world persists on the device", savedWorld === "space", savedWorld);
    await page.click("#btn-play");
    await page.waitForTimeout(500);
    const activeWorld = await page.evaluate(() => ({
      label: document.querySelector("#hud-world").textContent,
      canvas: document.querySelector("#game-canvas").dataset.world,
    }));
    check("selected world reaches the game renderer",
      activeWorld.canvas === "space" && activeWorld.label.includes("Space"),
      JSON.stringify(activeWorld));
    await page.screenshot({ path: path.join(SCREEN_DIR, "space-world.png") });

    check("no unexpected console errors", errors.length === 0, JSON.stringify(errors));

  } finally {
    await browser?.close().catch(() => {});
    await new Promise(resolve => server.close(resolve));
  }

  console.log(failures.length ? `\n${failures.length} check(s) FAILED` : "\nAll checks passed 🐍");
  process.exit(failures.length ? 1 : 0);
})().catch(e => {
  console.error("E2E run crashed:", e);
  process.exit(1);
});
