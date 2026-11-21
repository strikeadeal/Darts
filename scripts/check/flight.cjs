// Flight profiler (evidence for DECISIONS.md "Grab and flight"). Needs Playwright; not part of the build.
// node scripts/check/flight.cjs <chromium|webkit> <built dir> [label]
// env: VW VH DPR THROWS STROKES=ms,ms,ms CDP=<rate> QUOTA=<% of one core via cgroup v1, root> CSS=<override> MUTED=1 DETAIL=1 OUT=<jsonl>
//      TRACE=<file> (chromium) REDUCED=1
//      SEED=<left>: throw in a 301 solo resumed on `left` (first to zero in dartshift.301.v2; with LEGACY=1,
//      a double-out save in 301.v1, which a build from before first to zero also plays, without a highlight)
const pw = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const { execSync } = require("child_process");
const [, , engine = "chromium", rootArg, label = "run"] = process.argv;
const root = path.resolve(rootArg);
const env = process.env;
const VW = +env.VW || 390, VH = +env.VH || 844, DPR = +env.DPR || 2;
const THROWS = +env.THROWS || 9;
const STROKES = (env.STROKES || "215,120,380").split(",").map(Number);
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".ttf": "font/ttf", ".webmanifest": "application/manifest+json" };
const server = http.createServer((q, s) => {
  let p = decodeURIComponent(new URL(q.url, "http://x").pathname);
  if (!p.startsWith("/Darts/")) { s.writeHead(404); return s.end(); }
  p = path.join(root, p.slice(7) || "index.html");
  fs.readFile(p, (e, b) => { if (e) { s.writeHead(404); return s.end(); } s.writeHead(200, { "Content-Type": types[path.extname(p)] || "application/octet-stream" }); s.end(b); });
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CG = "/sys/fs/cgroup/cpu/slow";
function throttleCgroup(pattern, pct) {
  fs.mkdirSync(CG, { recursive: true });
  fs.writeFileSync(CG + "/cpu.cfs_period_us", "10000");
  fs.writeFileSync(CG + "/cpu.cfs_quota_us", String(Math.round(pct * 100)));
  const pids = execSync(`pgrep -f '${pattern}' || true`).toString().trim().split(/\s+/).filter(Boolean);
  for (const pid of pids) try { fs.writeFileSync(CG + "/cgroup.procs", pid); } catch {}
  return pids.length;
}
function unthrottle() {
  try { for (const pid of fs.readFileSync(CG + "/cgroup.procs", "utf8").split(/\s+/).filter(Boolean)) try { fs.writeFileSync("/sys/fs/cgroup/cpu/cgroup.procs", pid); } catch {} } catch {}
}

const recorder = () => {
  window.__rec = null;
  addEventListener("pointerup", (e) => { const r = window.__rec; if (r && !r.up) r.up = { ts: e.timeStamp, cap: performance.now() }; }, true);
  addEventListener("pointerup", () => { const r = window.__rec; if (r?.up && !r.up.end) r.up.end = performance.now(); });
  // Per-API timing, attributed to the release handler window or the landing microtask.
  const cost = (window.__cost = {});
  const wrap = (obj, name, key) => {
    const d = Object.getOwnPropertyDescriptor(obj, name);
    if (!d) return;
    const timed = (fn) => function (...a) { const t = performance.now(); try { return fn.apply(this, a); } finally { const r = window.__rec; if (r) { const k = (r.up && !r.up.end ? "release:" : r.impact === null && r.up?.end ? "flight:" : "after:") + key; (r.cost[k] ||= [0, 0]); r.cost[k][0] += performance.now() - t; r.cost[k][1]++; } } };
    if (d.value) obj[name] = timed(d.value); else if (d.set) Object.defineProperty(obj, name, { ...d, set: timed(d.set) });
  };
  wrap(Storage.prototype, "setItem", "localStorage.setItem");
  wrap(Element.prototype, "getBoundingClientRect", "getBoundingClientRect");
  wrap(SVGGraphicsElement.prototype, "getScreenCTM", "getScreenCTM");
  wrap(Element.prototype, "innerHTML", "innerHTML");
  wrap(Element.prototype, "setAttribute", "setAttribute");
  wrap(HTMLElement.prototype, "offsetWidth", "offsetWidth");
  if (window.AudioContext) { wrap(AudioContext.prototype, "createBufferSource", "audio"); wrap(BaseAudioContext.prototype, "createBiquadFilter", "audio"); wrap(BaseAudioContext.prototype, "createGain", "audio"); wrap(BaseAudioContext.prototype, "createBuffer", "audio"); }
  window.__start = () => {
    const r = (window.__rec = { frames: [], up: null, impact: null, cost: {} });
    const before = new Set(document.querySelectorAll("#stage .landed"));
    const loop = (ts) => { r.frames.push([ts, performance.now()]); if (!r.stop) requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    r.mo = new MutationObserver(() => {
      if (!r.impact && [...document.querySelectorAll("#stage .landed.impact")].some((n) => !before.has(n))) r.impact = performance.now();
    });
    r.mo.observe(document.getElementById("stage"), { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  };
  window.__stop = () => { const r = window.__rec; r.stop = true; r.mo.disconnect(); const { mo, ...out } = r; return out; };
};

function analyse(r) {
  const up = r.up; if (!up) return null;
  const f = r.frames;
  const i0 = f.findIndex(([, now]) => now >= up.end);
  if (i0 < 0) return null;
  const iImp = r.impact ? f.findIndex(([, now]) => now >= r.impact) - 1 : -1; // frame whose callback ran before impact mutation
  const flight = [];
  for (let i = i0 + 1; i <= (iImp > 0 ? iImp : f.length - 1); i++) flight.push(f[i][0] - f[i - 1][0]);
  const after = [];
  for (let i = iImp + 1; i < f.length && iImp > 0 && f[i][0] - f[iImp][0] < 600; i++) after.push(f[i][0] - f[i - 1][0]);
  return {
    handler: up.end - up.cap,
    toFirstFrame: f[i0][1] - up.ts, // release event -> first rAF callback after the handler
    firstInterval: f[i0 + 1] ? f[i0 + 1][0] - f[i0][0] : null,
    cost: r.cost,
    flight, // intervals from first frame to the frame carrying contact
    // The landing runs either inside a rAF callback (rendered in after[0]) or in the
    // animation update that precedes rAF callbacks (rendered in after[1]): take the worse.
    impactFrame: after.length ? Math.max(after[0], after[1] ?? 0) : null,
    visitEnd: null,
    after,
  };
}
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };

(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}/Darts/`;
  const browser = await pw[engine].launch();
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: DPR, serviceWorkers: "block", reducedMotion: env.REDUCED ? "reduce" : "no-preference" });
  await ctx.addInitScript(recorder);
  if (env.MUTED) await ctx.addInitScript(() => { if (!localStorage.getItem("dartshift.save.v1")) localStorage.setItem("dartshift.save.v1", JSON.stringify({ muted: true })); });
  if (env.CSS) await ctx.addInitScript((css) => addEventListener("DOMContentLoaded", () => { const s = document.createElement("style"); s.textContent = css; document.head.append(s); }), env.CSS);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(base);
  if (env.SEED) {
    await page.evaluate(async ([left, legacy]) => {
      const g = await import("./src/game.js");
      const pt = (l) => { if (l === "Miss") return { x: 0, y: -190 }; const r = { T: 103, D: 166 }[l[0]] ?? 130, d = (g.sectors.indexOf(+l.replace(/^[TD]/, "")) * 18 * Math.PI) / 180; return { x: Math.sin(d) * r, y: -Math.cos(d) * r }; };
      const route = g.checkout(121 - left, 3, legacy);
      let m = legacy ? { game: "301", mode: "solo", hits: [] } : g.freshMatch("solo", "301");
      for (const l of ["T20", "T20", "T20", ...route, ...["Miss", "Miss", "Miss"].slice(route.length)]) m = g.advance(m, pt(l));
      const save = { match: m, best: null, acknowledged: m.hits.length };
      localStorage.setItem("dartshift.301.v1", JSON.stringify({ ...(legacy ? save : { match: null, best: null, acknowledged: -1 }), lobby: "301" }));
      if (!legacy) localStorage.setItem("dartshift.301.v2", JSON.stringify(save));
    }, [+env.SEED, !!env.LEGACY]);
    await page.reload();
  }
  await page.click("[data-mode=solo]");
  const settled = () => page.waitForFunction(() => document.getAnimations().filter((a) => a.playState === "running").length === 0 && !document.querySelector(".field[aria-busy]"), null, { timeout: 15000 });
  await settled();
  let cdp;
  if (env.CDP && engine === "chromium") { cdp = await ctx.newCDPSession(page); await cdp.send("Emulation.setCPUThrottlingRate", { rate: +env.CDP }); }
  if (env.QUOTA) console.error("cgroup pids:", throttleCgroup(engine === "webkit" ? "webkit-2359" : "pw-browsers/chromium", +env.QUOTA));
  if (env.TRACE && engine === "chromium") await browser.startTracing(page, { path: env.TRACE, categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "disabled-by-default-devtools.timeline.frame", "toplevel", "cc", "viz", "blink"] });
  const results = [];
  for (let n = 0; n < THROWS; n++) {
    if (await page.$("#next")) { await page.evaluate(() => document.querySelector("#next").click()); await sleep(50); }
    await settled();
    await sleep(150);
    const g = await page.evaluate(() => {
      const d = document.querySelector(".ready-dart").getBoundingClientRect();
      const b = document.querySelector(".board-wrap").getBoundingClientRect();
      return { x: d.left + d.width / 2, y: d.top + d.height * 0.45, w: b.width };
    });
    await page.evaluate(() => window.__start());
    const ms = STROKES[n % STROKES.length], steps = Math.max(4, Math.round(ms / 16));
    const dy = -0.6 * g.w, dx = (n % 3 - 1) * 0.04 * g.w;
    await page.mouse.move(g.x, g.y);
    await page.mouse.down();
    for (let k = 1; k <= steps; k++) {
      await sleep(ms / steps);
      await page.mouse.move(g.x + (dx * k) / steps, g.y + (dy * k) / steps);
    }
    await page.mouse.up();
    await sleep(1100);
    const r = await page.evaluate(() => window.__stop());
    const a = analyse(r);
    if (a) results.push({ n, ms, ...a });
    else results.push({ n, ms, error: "no release recorded", up: r.up, impact: r.impact });
  }
  if (env.TRACE && engine === "chromium") await browser.stopTracing();
  unthrottle();
  const score = await page.evaluate(() => ["dartshift.save.v1", "dartshift.301.v1", "dartshift.301.v2"].map((k) => JSON.parse(localStorage.getItem(k))?.match?.hits?.length ?? "-").join("/"));
  await browser.close();
  server.close();
  const ok = results.filter((r) => !r.error);
  const flight = ok.flatMap((r) => r.flight);
  const summary = {
    label, engine, viewport: `${VW}x${VH}@${DPR}`, throttle: env.CDP ? `cdp ${env.CDP}x` : env.QUOTA ? `cgroup ${env.QUOTA}%` : "none", css: env.CSS || "",
    throws: results.length, saved: score, errors,
    handler: { med: med(ok.map((r) => r.handler)), max: Math.max(...ok.map((r) => r.handler)) },
    toFirstFrame: { med: med(ok.map((r) => r.toFirstFrame)), max: Math.max(...ok.map((r) => r.toFirstFrame)) },
    firstInterval: { med: med(ok.map((r) => r.firstInterval)), max: Math.max(...ok.map((r) => r.firstInterval)) },
    flight: { n: flight.length, med: med(flight), p95: q(flight, 0.95), max: Math.max(...flight), over: flight.filter((x) => x > 25).length },
    impact: { med: med(ok.filter((r) => r.n % 3 !== 2).map((r) => r.impactFrame)), max: Math.max(...ok.filter((r) => r.n % 3 !== 2).map((r) => r.impactFrame)) },
    impactVisitEnd: { med: med(ok.filter((r) => r.n % 3 === 2).map((r) => r.impactFrame)), max: Math.max(...ok.filter((r) => r.n % 3 === 2).map((r) => r.impactFrame)) },
    afterMax: Math.max(...ok.map((r) => Math.max(...r.after.slice(2)))),
    // Worst of the three frames after contact: the landing in either build, split or not.
    landing3: { med: med(ok.map((r) => Math.max(...r.after.slice(0, 3)))), max: Math.max(...ok.map((r) => Math.max(...r.after.slice(0, 3)))) },
    post600: (() => { const a = ok.flatMap((r) => r.after); return { n: a.length, med: med(a), p95: q(a, 0.95), max: Math.max(...a) }; })(),
  };
  const round = (o) => JSON.parse(JSON.stringify(o, (k, v) => (typeof v === "number" ? Math.round(v * 10) / 10 : v)));
  console.log(JSON.stringify(round(summary)));
  if (env.DETAIL) console.log(JSON.stringify(round(results)));
  if (env.OUT) fs.appendFileSync(env.OUT, JSON.stringify(round({ summary, results })) + "\n");
})().catch((e) => { unthrottle(); console.error(e); process.exit(1); });
