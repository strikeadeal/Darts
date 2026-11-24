// Layout and tip check for the installed-app viewport (DECISIONS.md "Full screen in the
// installed app"). Needs Playwright; not part of the build.
// node scripts/check/viewport.cjs <chromium|webkit> <built dir> <layout WxH> [screen WxH]
// env: INSETS=top,bottom,left,right  STANDALONE=1 (navigator.standalone + display-mode)
//      THROWS=n (swipe n darts and report the flying tip against the saved point)
//
// It models iOS 26–27 standalone: WebKit lays the page out in a viewport (the "layout"
// size) shorter than the screen it draws on. The browser window is the layout size and
// screen.* is the screen size. Rects below the window are measured, not painted: a
// beyond-viewport capture in Chromium re-lays out the page, so it is not a faithful picture.
const pw = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const [, , engine = "chromium", rootArg, layout = "393x793", screenArg] = process.argv;
const root = path.resolve(rootArg);
const [W, H] = layout.split("x").map(Number);
const [SW, SH] = (screenArg || layout).split("x").map(Number);
const [t, b, l, r] = (process.env.INSETS || "0,0,0,0").split(",").map(Number);
const standalone = process.env.STANDALONE === "1";
const THROWS = +process.env.THROWS || 0;
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".ttf": "font/ttf", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json" };
const server = http.createServer((q, s) => {
  let p = decodeURIComponent(new URL(q.url, "http://x").pathname);
  if (!p.startsWith("/Darts/")) { s.writeHead(404); return s.end(); }
  p = path.join(root, p.slice(7) || "index.html");
  fs.readFile(p, (e, buf) => { if (e) { s.writeHead(404); return s.end(); } s.writeHead(200, { "Content-Type": types[path.extname(p)] || "application/octet-stream" }); s.end(buf); });
});
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
(async () => {
  await new Promise((res) => server.listen(0, "127.0.0.1", res));
  const browser = await pw[engine].launch();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, screen: { width: SW, height: SH }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, serviceWorkers: "block" });
  await ctx.addInitScript(({ css, standalone }) => {
    if (standalone) Object.defineProperty(Navigator.prototype, "standalone", { get: () => true });
    addEventListener("DOMContentLoaded", () => { const s = document.createElement("style"); s.textContent = css; document.head.append(s); });
  }, { css: `:root{--top:${t}px!important;--bottom:${b}px!important;--left:${l}px!important;--right:${r}px!important}`, standalone });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const cdp = engine === "chromium" ? await ctx.newCDPSession(page) : null;
  if (cdp && standalone) await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "display-mode", value: "standalone" }] });
  await page.goto(`http://127.0.0.1:${server.address().port}/Darts/`);
  await sleep(300);
  await page.click("[data-mode=solo]");
  await page.waitForSelector("#throw");
  await page.waitForFunction(() => !document.getAnimations().some((a) => a.playState === "running"), null, { timeout: 10000 });
  await sleep(100);
  const report = await page.evaluate(() => {
    const rect = (sel) => { const e = document.querySelector(sel); if (!e) return null; const q = e.getBoundingClientRect(); return { top: +q.top.toFixed(1), bottom: +q.bottom.toFixed(1), height: +q.height.toFixed(1), left: +q.left.toFixed(1), width: +q.width.toFixed(1) }; };
    const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;left:0;top:0;width:var(--b);height:var(--vh,100dvh)";
    document.body.append(probe);
    const box = probe.getBoundingClientRect();
    probe.remove();
    const dart = document.querySelector(".ready-dart > g").getBoundingClientRect();
    return {
      innerHeight, screen: `${screen.width}x${screen.height}`, vhInline: document.documentElement.style.getPropertyValue("--vh") || "(css)",
      vh: box.height, board: +box.width.toFixed(2),
      scene: rect("#scene"), panel: rect("#panel"), throwControl: rect("#throw"), hint: rect("#throw b"), small: rect("#throw small"), grip: rect(".dart-grip"), boardWrap: rect(".board-wrap"),
      dartBottom: +dart.bottom.toFixed(1), dartCx: +(dart.left + dart.width / 2).toFixed(1),
      gripVar: css("--grip"),
    };
  });
  if (THROWS) {
    report.tips = [];
    for (let n = 0; n < THROWS; n++) {
      await page.waitForSelector("#throw:not(.held)");
      await page.waitForFunction(() => !document.querySelector(".field[aria-busy]") && !document.getAnimations().some((a) => a.playState === "running"), null, { timeout: 10000 });
      const g = await page.evaluate(() => { const d = document.querySelector(".ready-dart > g").getBoundingClientRect(), w = document.querySelector(".board-wrap").getBoundingClientRect().width; return { x: d.left + d.width / 2, y: d.top + d.height / 2, w }; });
      const dx = ((n % 3) - 1) * 0.12 * g.w, dy = -(0.6 + ((n % 4) - 1.5) * 0.08) * g.w;
      await page.mouse.move(g.x, g.y);
      await page.mouse.down();
      for (let k = 1; k <= 8; k++) { await sleep(25); await page.mouse.move(g.x + (dx * k) / 8, g.y + (dy * k) / 8); }
      await page.mouse.up();
      const tip = await page.evaluate(() => {
        const a = document.getAnimations().find((x) => x.id === "flight");
        if (!a) return { error: "no flight" };
        a.pause();
        a.currentTime = a.effect.getComputedTiming().endTime;
        const hit = JSON.parse(localStorage.getItem("dartshift.save.v1")).match.hits.at(-1);
        const plane = document.querySelector(".board-plane").getScreenCTM();
        const want = new DOMPoint(hit.x, hit.y).matrixTransform(plane);
        const got = new DOMPoint(0, 0).matrixTransform(document.querySelector(".ready-dart").getScreenCTM());
        a.play();
        return { err: +Math.hypot(got.x - want.x, got.y - want.y).toFixed(6) };
      });
      report.tips.push(tip.err ?? tip.error);
      if (n % 3 === 2 && n < 8) { await page.waitForSelector("#panel > :not(.ghost) #next", { state: "attached" }); await page.$eval("#panel > :not(.ghost) #next", (b) => b.click()); } // below a short window Playwright won't click
    }
  }
  report.errors = errors;
  console.log(JSON.stringify({ engine, layout, screen: `${SW}x${SH}`, insets: [t, b, l, r], standalone, ...report }));
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(1); });
