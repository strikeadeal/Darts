// The baked board face (src/light.js) against the scoring (DECISIONS.md "Studio look"). Needs Playwright; not part of the build.
// node scripts/check/face.cjs <chromium|webkit> <built dir> [WxH,...]
// For random points on the board, at least 1.6 mm from any wire, the baked face's pixel must be the colour family of the
// bed scoreAt() gives there (red, green, cream or black), read through the same projection the SVG face and the throw use.
// Also checks that the lit page keeps the SVG board's .board-plane matrix, and that ?flat keeps the SVG face.
const pw = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const [, , engine = "chromium", rootArg, sizesArg = "393x852,375x667,852x393"] = process.argv;
const root = path.resolve(rootArg);
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".ttf": "font/ttf", ".webmanifest": "application/manifest+json" };
const server = http.createServer((q, s) => {
  let p = decodeURIComponent(new URL(q.url, "http://x").pathname);
  if (!p.startsWith("/Darts/")) { s.writeHead(404); return s.end(); }
  p = path.join(root, p.slice(7) || "index.html");
  fs.readFile(p, (e, b) => { if (e) { s.writeHead(404); return s.end(); } s.writeHead(200, { "Content-Type": types[path.extname(p)] || "application/octet-stream" }); s.end(b); });
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}/Darts/`;
  const browser = await pw[engine].launch();
  let failed = false;
  for (const size of sizesArg.split(",")) {
    const [W, H] = size.split("x").map(Number);
    for (const dpr of [2, 3]) {
      const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: dpr, serviceWorkers: "block" });
      const page = await ctx.newPage();
      await page.goto(base);
      await sleep(800);
      const r = await page.evaluate(async () => {
        const g = await import("./src/game.js"), t = await import("./src/throw.js");
        const scene = document.querySelector("#scene");
        if (!scene.classList.contains("lit")) return { error: "not lit" };
        const face = document.querySelector(".room-face"), N = face.width;
        const px = face.getContext("2d").getImageData(0, 0, N, N).data;
        const plane = document.querySelector(".board-plane")?.getAttribute("transform");
        const R = g.radii, edges = [R.bull, R.outerBull, R.trebleIn, R.trebleOut, R.doubleIn, R.edge];
        // Family of a lit pixel: hue survives the light where brightness doesn't.
        const family = ([r, gr, b]) => {
          const max = Math.max(r, gr, b), min = Math.min(r, gr, b);
          if (max - min < 40) return max > 110 ? "cream" : "black";
          if (r > gr && r > b) return r - gr > 60 ? "red" : "cream";
          return gr > r ? "green" : "cream";
        };
        const expect = (x, y) => {
          const r = Math.hypot(x, y);
          if (r < R.bull) return "red";
          if (r < R.outerBull) return "green";
          const deg = ((Math.atan2(x, -y) * 180) / Math.PI + 369) % 360, i = Math.floor(deg / 18), odd = i % 2;
          const ring = (r > R.trebleIn && r < R.trebleOut) || r > R.doubleIn;
          return ring ? (odd ? "green" : "red") : odd ? "cream" : "black";
        };
        let seed = 7, checked = 0;
        const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
        const wrong = [];
        while (checked < 1500) {
          const x = (rand() * 2 - 1) * R.edge, y = (rand() * 2 - 1) * R.edge, r = Math.hypot(x, y);
          if (r > R.edge - 1.6) continue;
          if (edges.some((e) => Math.abs(r - e) < 1.6)) continue;
          const deg = ((Math.atan2(x, -y) * 180) / Math.PI + 369) % 18;
          if (r > R.outerBull && Math.min(deg, 18 - deg) * (Math.PI / 180) * r < 1.6) continue;
          const p = t.boardPosition({ x, y });
          const u = Math.round(((p.x + 211) / 422) * N - 0.5), v = Math.round(((p.y + 211) / 422) * N - 0.5);
          const k = (v * N + u) * 4, rgb = [px[k], px[k + 1], px[k + 2]];
          const got = family(rgb), want = expect(x, y);
          // Cross-check the expectation against the scoring itself.
          const s = g.scoreAt(x, y), mult = s.label.startsWith("Double") || s.label.startsWith("Treble");
          const ring = r > R.outerBull && ((r > R.trebleIn && r < R.trebleOut) || r > R.doubleIn);
          if (mult !== ring) return { error: "expectation disagrees with scoreAt at " + x + "," + y };
          if (got !== want) wrong.push({ x: +x.toFixed(1), y: +y.toFixed(1), want, got, rgb });
          checked++;
        }
        return { N, checked, wrong: wrong.length, sample: wrong.slice(0, 5), plane };
      });
      const flat = await page.goto(base + "?flat").then(() => sleep(500)).then(() => page.evaluate(() => ({ lit: document.querySelector("#scene").classList.contains("lit"), wires: !!document.querySelector(".board-plane use[href='#wire']") })));
      const ok = !r.error && r.wrong === 0 && r.plane === "matrix(1 0 -0.025 0.95 0 0)" && !flat.lit && flat.wires;
      failed ||= !ok;
      console.log(JSON.stringify({ size, dpr, ...r, flat, ok }));
      await ctx.close();
    }
  }
  await browser.close();
  server.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
