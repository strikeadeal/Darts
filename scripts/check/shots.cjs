// Screens and moments for the visual review (DECISIONS.md "Studio look"). Needs Playwright; not part of the build.
// node scripts/check/shots.cjs <chromium|webkit> <built dir> <out dir> [sizes, e.g. 393x852,852x393]
// env: VIDEO=1 records a throw and a screen transition at the first size instead of screenshots.
//      REDUCED=1 reduced motion. ONLY=<comma list of shot names>.
// Every shot seeds its own saves, so the build under test is the only variable.
const pw = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const [, , engine = "chromium", rootArg, outArg, sizesArg] = process.argv;
const root = path.resolve(rootArg), out = path.resolve(outArg);
const env = process.env;
// Safe areas as the installed app reports them (top, bottom, left, right).
const devices = {
  "375x667": { name: "se", insets: [20, 0, 0, 0] },
  "393x852": { name: "393", insets: [59, 34, 0, 0] },
  "430x932": { name: "promax", insets: [59, 34, 0, 0] },
  "667x375": { name: "se-land", insets: [0, 0, 0, 0] },
  "852x393": { name: "393-land", insets: [0, 21, 59, 59] },
  "932x430": { name: "promax-land", insets: [0, 21, 59, 59] },
};
const sizes = (sizesArg || Object.keys(devices).join(",")).split(",");
const only = env.ONLY ? env.ONLY.split(",") : null;
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".ttf": "font/ttf", ".webmanifest": "application/manifest+json" };
const server = http.createServer((q, s) => {
  let p = decodeURIComponent(new URL(q.url, "http://x").pathname);
  if (!p.startsWith("/Darts/")) { s.writeHead(404); return s.end(); }
  p = path.join(root, p.slice(7) || "index.html");
  fs.readFile(p, (e, b) => { if (e) { s.writeHead(404); return s.end(); } s.writeHead(200, { "Content-Type": types[path.extname(p)] || "application/octet-stream" }); s.end(b); });
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const order = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
// Board mm for a bed name: "20" outer single, "T20", "D20", "25", "Bull", "Miss".
const mm = (l) => {
  if (l === "Bull") return { x: 0, y: 0 };
  if (l === "25") return { x: 0, y: -11 };
  if (l === "Miss") return { x: 0, y: 190 };
  const r = { T: 103, D: 166 }[l[0]] ?? 130, a = (order.indexOf(+l.replace(/^[TD]/, "")) * 18 * Math.PI) / 180;
  return { x: Math.sin(a) * r, y: -Math.cos(a) * r };
};
// [game, mode, beds, acknowledged]: what each seeded screen resumes into.
const seeds = {
  "play-301": ["301", "solo", ["T20", "T20", "T20", "T20", "19", "6", "20"], 6],
  "play-cricket": ["cricket", "solo", ["T20", "T19", "18", "T17"], 3],
  "play-clock": ["clock", "solo", ["1", "2", "3", "4"], 3],
  "play-shanghai": ["shanghai", "solo", ["1", "D1", "T1", "2"], 3],
  "play-cricket-duel": ["cricket", "duel", ["T20", "T19", "18", "T20", "20", "Miss", "T18"], 6],
  "handoff-duel": ["rush", "duel", ["T20", "19", "Bull"], -1],
  "results-solo": ["rush", "solo", ["T20", "T19", "18", "T20", "Bull", "5", "T20", "T20"], 6],
  "results-duel": ["rush", "duel", ["T20", "T20", "19", "T19", "5", "1", "Bull", "T20", "20", "T18", "T18", "4", "T20", "T20", "T20", "25", "T19"], 15],
  "results-shanghai": ["shanghai", "solo", ["1", "D1", "T1", "T2", "2", "D2", "T3", "3", "3", "T4", "D4", "4", "T5", "5", "5", "T6", "D6", "6", "T7", "7"], 18],
};
async function seed(page, [g, mode, beds, ack]) {
  await page.evaluate(async ([g, mode, points, ack]) => {
    const m = await import("./src/game.js");
    const read = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
    const S = m.readSaves(...Object.values(m.saveKeys).map(read));
    let match = m.freshMatch(mode, g);
    for (const p of points) match = m.advance(match, p);
    S.lobby = g;
    const slot = g === "rush" ? S.rush : g === "301" ? S.zero : S.modes[g];
    Object.assign(slot, { match, acknowledged: ack });
    Object.assign(S, { muted: true, learn: m.learnDarts });
    S.flick.carried = [];
    for (const [k, v] of Object.entries(m.writeSaves(S))) localStorage.setItem(k, JSON.stringify(v));
  }, [g, mode, beds.map(mm), ack]);
  await page.reload();
  await sleep(1400);
}
const settled = (page) => page.waitForFunction(() => !document.getAnimations().some((a) => a.playState === "running" && a.effect?.getComputedTiming().endTime < Infinity) && !document.querySelector(".field[aria-busy]"), null, { timeout: 15000 });
async function stroke(page, ms = 215, lean = 0) {
  const g = await page.evaluate(() => {
    const d = document.querySelector(".ready-dart > g").getBoundingClientRect();
    const b = document.querySelector(".board-wrap").getBoundingClientRect();
    return { x: d.left + d.width / 2, y: d.top + d.height * 0.45, w: b.width };
  });
  const steps = Math.max(4, Math.round(ms / 16)), dy = -0.6 * g.w, dx = lean * g.w;
  await page.mouse.move(g.x, g.y);
  await page.mouse.down();
  for (let k = 1; k <= steps; k++) { await sleep(ms / steps); await page.mouse.move(g.x + (dx * k) / steps, g.y + (dy * k) / steps); }
  await page.mouse.up();
}
const pauseAll = (page) => page.evaluate(() => { window.__paused = document.getAnimations().filter((a) => a.playState === "running"); window.__paused.forEach((a) => a.pause()); });
const playAll = (page) => page.evaluate(() => (window.__paused || []).forEach((a) => a.play()));

(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}/Darts/`;
  const browser = await pw[engine].launch();
  fs.mkdirSync(out, { recursive: true });
  for (const size of sizes) {
    const [W, H] = size.split("x").map(Number), dev = devices[size];
    const [t, b, l, r] = dev.insets;
    const ctx = await browser.newContext({
      viewport: { width: W, height: H }, deviceScaleFactor: env.VIDEO ? 1 : 2, serviceWorkers: "block",
      reducedMotion: env.REDUCED ? "reduce" : "no-preference",
      ...(env.VIDEO ? { recordVideo: { dir: out, size: { width: W, height: H } } } : {}),
    });
    await ctx.addInitScript((css) => addEventListener("DOMContentLoaded", () => { const s = document.createElement("style"); s.textContent = css; document.head.append(s); }), `:root{--top:${t}px!important;--bottom:${b}px!important;--left:${l}px!important;--right:${r}px!important}`);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    const want = (n) => !only || only.includes(n);
    const shot = async (n) => { if (!env.VIDEO && want(n)) await page.screenshot({ path: path.join(out, `${dev.name}-${n}.jpg`), type: "jpeg", quality: 80 }); };
    await page.goto(base);
    await page.evaluate(() => localStorage.setItem("dartshift.save.v1", JSON.stringify({ muted: true })));
    if (env.VIDEO) {
      // A transition (lobby → oche), a throw, then a visit's end and handoff.
      await page.reload();
      await sleep(1600);
      await page.click("[data-game='cricket']"); await sleep(1300);
      await page.click("[data-game='rush']"); await sleep(1300);
      await page.click("[data-mode=solo]"); await sleep(900);
      for (const [ms, lean] of [[215, 0], [180, -0.03], [240, 0.02]]) { await stroke(page, ms, lean); await sleep(1300); }
      await sleep(1200);
      await page.click("#next"); await sleep(1400);
      await page.click("#back"); await sleep(1400);
      const v = page.video();
      await ctx.close();
      fs.renameSync(await v.path(), path.join(out, `${dev.name}-throw-and-transition.webm`));
      continue;
    }
    await page.reload();
    await sleep(1700);
    await shot("lobby-rush");
    for (const g of ["301", "cricket", "clock", "shanghai"]) {
      await page.click(`[data-game='${g}']`);
      await sleep(1300);
      await shot("lobby-" + g);
    }
    await page.click("[data-game='rush']");
    await sleep(400);
    if (want("update")) {
      await page.evaluate(() => { document.querySelector("#update").hidden = false; });
      await shot("update");
      await page.evaluate(() => { document.querySelector("#update").hidden = true; });
    }
    if (want("help")) {
      await page.click("#help"); await sleep(500); await shot("help");
      await page.keyboard.press("Escape"); await sleep(300);
    }
    await page.click("[data-mode=solo]");
    await settled(page); await sleep(200);
    await shot("play-rush");
    await stroke(page, 215, 0);
    await sleep(85);
    await page.evaluate(() => document.getAnimations().find((a) => a.id === "flight")?.pause());
    await shot("flight");
    await page.evaluate(() => document.getAnimations().find((a) => a.id === "flight")?.play());
    await page.waitForSelector(".callout", { timeout: 5000 });
    await sleep(140);
    await pauseAll(page); await shot("impact"); await playAll(page);
    await settled(page); await sleep(200);
    await stroke(page, 170, -0.03); await sleep(1300);
    await stroke(page, 250, 0.03); await sleep(1600);
    await settled(page); await sleep(200);
    await shot("handoff-solo");
    // Menus: switching mode over a saved match.
    if (want("switch")) {
      await page.click("#back"); await sleep(1200);
      await page.click("[data-mode=duel]"); await sleep(500); await shot("switch");
      await page.keyboard.press("Escape"); await sleep(300);
    }
    for (const [n, s] of Object.entries(seeds)) {
      if (!want(n) && !(n.startsWith("results") && want(n))) continue;
      await seed(page, s);
      await page.click(`[data-mode=${s[1]}]`);
      await settled(page); await sleep(250);
      if (n.startsWith("results")) {
        await stroke(page, 215, 0);
        await page.waitForSelector("#again", { timeout: 8000 });
        await settled(page); await sleep(400);
      }
      if (n === "handoff-duel") {
        await shot(n);
        await page.click("#next"); await settled(page); await sleep(250);
        await shot("play-duel-p2");
        continue;
      }
      await shot(n);
    }
    if (errors.length) console.error(size, "errors:", errors);
    await ctx.close();
    console.log("done", size);
  }
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(1); });
