// The flick in a real browser (evidence for DECISIONS.md "The flick"). Needs Playwright; not part of the build.
// node scripts/check/flick.cjs <built dir> [WxH]
// 1. A save from before the flick: the lobby shows its best as the old throw's, the
//    match in progress resumes and replays its old darts, and finishing it sets no record.
// 2. Touch strokes: each saved hit equals src/throw.js replayed on exactly the samples
//    the page received; a faster flick lands higher; a bowed or paused stroke gets its
//    coaching hint; and the flying dart's tip ends on the scored point.
const pw = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const [, , rootArg, size = "390x844"] = process.argv;
const root = path.resolve(rootArg);
const [W, H] = size.split("x").map(Number);
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".ttf": "font/ttf", ".woff2": "font/woff2" };
const server = http.createServer((q, s) => { let p = decodeURIComponent(new URL(q.url, "http://x").pathname); p = path.join(root, p.slice(7) || "index.html"); fs.readFile(p, (e, b) => { if (e) { s.writeHead(404); return s.end(); } s.writeHead(200, { "Content-Type": types[path.extname(p)] || "application/octet-stream" }); s.end(b); }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (m) => { throw new Error(m); };

// Record what the app samples (pointer events and their coalesced moves), and catch
// each flight at its last frame to compare the tip with the saved point.
const recorder = () => {
  window.__strokes = [];
  window.__tips = [];
  const at = (e) => ({ x: e.clientX, y: e.clientY, t: e.timeStamp });
  addEventListener("pointerdown", (e) => window.__strokes.push({ start: at(e), raw: [at(e)], width: document.querySelector(".board-wrap")?.getBoundingClientRect().width }), true);
  addEventListener("pointermove", (e) => { const s = window.__strokes.at(-1); if (s) for (const m of [...(e.getCoalescedEvents?.() || []), e]) s.raw.push(at(m)); }, true);
  addEventListener("pointerup", (e) => window.__strokes.at(-1)?.raw.push(at(e)), true);
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (frames, options) {
    const a = animate.call(this, frames, options);
    if (options?.id === "flight") {
      const dart = this;
      requestAnimationFrame(() => {
        a.pause();
        a.currentTime = options.duration;
        requestAnimationFrame(() => {
          // The hit is saved before the flight starts.
          const hit = JSON.parse(localStorage.getItem("dartshift.save.v1")).match.hits.at(-1);
          const tip = new DOMPoint(0, 0).matrixTransform(dart.getScreenCTM());
          const target = new DOMPoint(hit.x, hit.y).matrixTransform(document.querySelector(".board-plane").getScreenCTM());
          window.__tips.push(Math.hypot(tip.x - target.x, tip.y - target.y));
          a.play();
        });
      });
    }
    return a;
  };
};

(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}/Darts/`;
  const b = await pw.chromium.launch();
  const out = {};

  // 1. An old save.
  {
    const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, serviceWorkers: "block" });
    const old = { match: { mode: "solo", hits: [{ x: 0, y: -103 }, { x: 0, y: 0, pace: 0.1, line: 0 }] }, best: 450, muted: true, acknowledged: -1 };
    await ctx.addInitScript((v) => { if (!sessionStorage.seeded) { localStorage.setItem("dartshift.save.v1", v); sessionStorage.seeded = 1; } }, JSON.stringify(old));
    const p = await ctx.newPage();
    const errors = [];
    p.on("pageerror", (e) => errors.push(String(e)));
    await p.goto(url);
    await sleep(400);
    const plate = await p.evaluate(() => { const l = document.querySelector(".best-plate .plate-label"); return { label: l.textContent, score: document.querySelector(".best-plate .plate-score").textContent, fits: l.scrollWidth <= l.clientWidth + 1 }; });
    if (plate.label !== "Best · old throw" || plate.score !== "450" || !plate.fits) fail("old best plate " + JSON.stringify(plate));
    await p.focus("[data-mode=solo]");
    await p.keyboard.press("Enter");
    await sleep(900);
    const ready = () => p.waitForFunction(() => document.querySelector("#panel > :not(.ghost) #next") || document.querySelector("#again") || (document.querySelector("#throw") && !document.querySelector(".field[aria-busy]")), null, { timeout: 8000 });
    for (let n = 2; n < 9; n++) {
      await ready();
      if (await p.$("#panel > :not(.ghost) #next")) {
        await p.focus("#panel > :not(.ghost) #next");
        await p.keyboard.press("Enter");
        await p.waitForSelector("#throw", { timeout: 5000 });
      }
      await p.focus("#throw");
      await p.keyboard.press(" ");
      await p.waitForFunction((k) => JSON.parse(localStorage.getItem("dartshift.save.v1")).match.hits.length === k, n + 1);
    }
    await p.waitForSelector("#again", { timeout: 8000 });
    const end = await p.evaluate(() => ({ line: document.querySelector(".results")?.textContent.includes("Begun with the old throw · no record"), v1: JSON.parse(localStorage.getItem("dartshift.save.v1")), flick: JSON.parse(localStorage.getItem("dartshift.flick.v1")) }));
    if (!end.line || end.v1.best !== 450 || end.flick.rush !== null || JSON.stringify(end.flick.carried) !== '["rush"]' || end.v1.match.hits[0].y !== -103) fail("carried run " + JSON.stringify(end));
    if (errors.length) fail(errors.join(" | "));
    out.oldSave = { plate, carried: end.flick.carried, results: "Begun with the old throw · no record", oldBest: end.v1.best, flickBest: end.flick.rush };
    await ctx.close();
  }

  // 2. Touch strokes.
  {
    const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, serviceWorkers: "block" });
    await ctx.addInitScript(recorder);
    const p = await ctx.newPage();
    const errors = [];
    p.on("pageerror", (e) => errors.push(String(e)));
    p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    const cdp = await ctx.newCDPSession(p);
    // With `at` (ms), the event carries that timestamp, as a phone's digitiser stamps
    // touches, so the page sees steady 60 Hz sampling however late CDP delivers it.
    const tp = (type, x, y, at) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }], ...(at && { timestamp: at / 1000 }) });
    await p.goto(url);
    await sleep(400);
    const bb = await p.locator("[data-mode=solo]").boundingBox();
    await tp("touchStart", bb.x + 20, bb.y + 20); await sleep(40); await tp("touchEnd");
    const settled = () => p.waitForFunction(() => !document.getAnimations().some((a) => a.playState === "running") && !document.querySelector(".field[aria-busy]"), null, { timeout: 10000 });
    // A stroke of `length` board widths at `speed` widths/s, bowed by `bow`, then a `pause` before lifting.
    async function stroke(length, speed, { bow = 0, pause = 0 } = {}) {
      await settled();
      const g = await p.evaluate(() => { const d = document.querySelector(".ready-dart > g").getBoundingClientRect(), bw = document.querySelector(".board-wrap").getBoundingClientRect(); return { x: d.left + d.width / 2, y: d.top + d.height / 2, w: bw.width }; });
      const ms = (length / speed) * 1000, steps = Math.max(4, Math.round(ms / 16));
      const want = 1 + (await p.evaluate(() => JSON.parse(localStorage.getItem("dartshift.save.v1"))?.match?.hits.length ?? 0));
      const t0 = Date.now() + 50, dt = ms / steps;
      await tp("touchStart", g.x, g.y, t0);
      for (let k = 1; k <= steps; k++) {
        const u = k / steps;
        await tp("touchMove", g.x + 4 * bow * u * (1 - u) * length * g.w, g.y - u * length * g.w, t0 + k * dt);
      }
      await tp("touchEnd", 0, 0, t0 + ms + 8 + pause);
      await p.waitForFunction((k) => JSON.parse(localStorage.getItem("dartshift.save.v1")).match.hits.length === k, want);
      await settled();
      await sleep(100);
      return p.evaluate(async (w) => {
        const { addSample, releaseThrow, readStroke } = await import("./src/throw.js");
        const { scoreAt } = await import("./src/game.js");
        const s = window.__strokes.at(-1), samples = [];
        for (const q of s.raw) addSample(samples, q.x, q.y, q.t);
        const width = s.width;
        const hit = JSON.parse(localStorage.getItem("dartshift.save.v1")).match.hits.at(-1);
        const again = releaseThrow(s.start, samples, width), read = readStroke(s.start, samples, width);
        const tip = window.__tips.at(-1);
        return { hit, label: scoreAt(hit.x, hit.y).label, same: JSON.stringify(again) === JSON.stringify(hit), speed: read.speed, miss: read.miss, hint: document.querySelector(".throw-control .hint")?.textContent, tipError: tip ?? null };
      });
    }
    const runs = {
      neutral: await stroke(0.6, 5),
      bowed: await stroke(0.6, 5, { bow: 0.12 }), // not a visit's last dart, so its prompt shows
      fast: await stroke(0.6, 10),
    };
    if (await p.$("#panel > :not(.ghost) #next")) { const nb = await p.locator("#panel > :not(.ghost) #next").boundingBox(); await tp("touchStart", nb.x + 20, nb.y + 20); await sleep(40); await tp("touchEnd"); await sleep(900); }
    runs.paused = await stroke(0.6, 5, { pause: 150 });
    runs.slow = await stroke(0.6, 2.5);
    for (const [k, r] of Object.entries(runs)) if (!r.same) fail(`${k}: the saved hit is not the model's ` + JSON.stringify(r));
    if (!(runs.fast.hit.y < runs.neutral.hit.y - 60 && runs.slow.hit.y > runs.neutral.hit.y + 60)) fail("speed order " + JSON.stringify(runs));
    if (runs.neutral.label !== "Bullseye") fail("neutral flick " + JSON.stringify(runs.neutral));
    if (runs.neutral.miss || runs.fast.miss || runs.slow.miss) fail("clean strokes missed " + JSON.stringify(runs));
    if (runs.bowed.hint !== "Keep the stroke straight") fail("bowed hint " + runs.bowed.hint);
    if (runs.paused.hint !== "Let go while still flicking") fail("paused hint " + runs.paused.hint);
    const tips = Object.values(runs).map((r) => r.tipError);
    if (tips.some((t) => t === null || t > 0.01)) fail("tip " + JSON.stringify(tips));
    if (errors.length) fail(errors.join(" | "));
    out.strokes = Object.fromEntries(Object.entries(runs).map(([k, r]) => [k, { x: +r.hit.x.toFixed(1), y: +r.hit.y.toFixed(1), label: r.label, speed: +r.speed.toFixed(2), miss: +r.miss.toFixed(1), hint: r.hint, tipErrorPx: +r.tipError.toFixed(6) }]));
    await ctx.close();
  }
  console.log("OK " + size + " " + JSON.stringify(out, null, 1));
  await b.close(); server.close();
})().catch((e) => { console.log(`FAIL ${size}: ${e.message.split("\n")[0]}`); process.exit(1); });
