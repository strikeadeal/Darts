// 301's finishing highlight and old saves (DECISIONS.md, "First to zero"). Needs Playwright; not part of the build.
// node scripts/check/finish.cjs <chromium|webkit> <built dir> <screenshot dir> [WxH,...] [numbers]
// For each size and remaining score: seeds a first-to-zero match on that score, resumes it, and checks that
// the highlight is the next slot's label, is drawn in the board face's own matrix, covers exactly its beds
// on screen (sampled through the face's matrix against scoreAt), and lets a touch through to the dart.
// Then resumes a double-out save left on a "Not a double" bust and plays it out by keyboard.
const pw = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const [, , engine = "chromium", rootArg = "dist", out = ".", sizeArg, numArg] = process.argv;
const root = path.resolve(rootArg);
const sizes = (sizeArg || "320x568,360x740,375x667,375x812,390x844,393x852,667x375,852x393,932x430").split(",");
const numbers = (numArg || "1,5,3,11,6,19").split(",").map(Number);
const insets = { "320x568": [20, 0, 0, 0], "360x740": [20, 0, 0, 0], "375x667": [20, 0, 0, 0], "375x812": [44, 34, 0, 0], "390x844": [47, 34, 0, 0], "393x852": [59, 34, 0, 0], "852x393": [0, 21, 59, 59], "667x375": [0, 0, 0, 0], "932x430": [0, 21, 59, 59] };
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".ttf": "font/ttf", ".woff2": "font/woff2" };
const server = http.createServer((q, s) => { let p = decodeURIComponent(new URL(q.url, "http://x").pathname); p = path.join(root, p.slice(7) || "index.html"); fs.readFile(p, (e, b) => { if (e) { s.writeHead(404); return s.end(); } s.writeHead(200, { "Content-Type": types[path.extname(p)] || "application/octet-stream" }); s.end(b); }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (m) => { throw new Error(m); };

// Seeds dartshift.301.v2 with a solo on `left` at the start of round 3 (or a double-out save in v1).
async function seed(p, left) {
  await p.evaluate(async (left) => {
    const g = await import("./src/game.js");
    const pt = (l) => {
      if (l === "Miss") return { x: 0, y: -190 };
      if (l === "Bull") return { x: 0, y: 0 };
      if (l === "25") return { x: 0, y: -10 };
      const r = { T: 103, D: 166 }[l[0]] ?? 130, d = (g.sectors.indexOf(+l.replace(/^[TD]/, "")) * 18 * Math.PI) / 180;
      return { x: Math.sin(d) * r, y: -Math.cos(d) * r };
    };
    const route = g.checkout(121 - left, 3);
    let m = g.freshMatch("solo", "301");
    for (const l of ["T20", "T20", "T20", ...route, ...Array(3 - route.length).fill("Miss")]) m = g.advance(m, pt(l));
    localStorage.setItem("dartshift.301.v2", JSON.stringify({ match: m, best: null, acknowledged: m.hits.length }));
    localStorage.setItem("dartshift.301.v1", JSON.stringify({ match: null, best: null, acknowledged: -1, lobby: "301" }));
  }, left);
}

(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}/Darts/`;
  const b = await pw[engine].launch();
  const results = [];
  for (const size of sizes) {
    const [W, H] = size.split("x").map(Number);
    const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, serviceWorkers: "block", reducedMotion: "reduce" });
    const [t, bo, l, r] = insets[size];
    await ctx.addInitScript((css) => addEventListener("DOMContentLoaded", () => { const s = document.createElement("style"); s.textContent = css; document.head.append(s); }), `:root{--top:${t}px!important;--bottom:${bo}px!important;--left:${l}px!important;--right:${r}px!important}`);
    const p = await ctx.newPage();
    const errors = [];
    p.on("pageerror", (e) => errors.push(String(e)));
    await p.goto(base);
    for (const left of numbers) {
      await seed(p, left);
      await p.goto(base + "?" + left);
      await p.waitForSelector("[data-mode=solo]");
      await p.click("[data-mode=solo]");
      await p.waitForSelector("#throw");
      await sleep(150);
      const m = await p.evaluate(async (left) => {
        const { scoreAt } = await import("./src/game.js");
        const f = document.querySelector(".finish"), g = f.querySelector(":scope > g");
        const a = document.querySelector(".board-plane").getScreenCTM(), c = g.getScreenCTM();
        const off = Math.max(...["a", "b", "c", "d", "e", "f"].map((k) => Math.abs(a[k] - c[k])));
        // Sample the board on a 3 mm grid through the face's matrix: inside the highlight's fill ⇔ scores `left` on a single.
        const hit = g.querySelector(".finish-line"), bust = g.querySelector(".finish-bust");
        let inside = 0, wrong = [], dark = 0;
        for (let x = -170; x <= 170; x += 3)
          for (let y = -170; y <= 170; y += 3) {
            const s = scoreAt(x, y), single = s.label === "Single " + left, pt = new DOMPoint(x, y);
            const inHit = hit.isPointInFill(pt), inBust = bust.isPointInFill(pt);
            if (inHit) inside++;
            if (inBust) dark++;
            const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => scoreAt(x + dx * 0.6, y + dy * 0.6).label !== s.label);
            if (!near && (inHit !== single || inBust !== (s.points > left && s.label.endsWith(" " + left)))) wrong.push([x, y, s.label, inHit, inBust]);
          }
        // A touch on the highlight goes past it, and the dart still takes a touch.
        const box = hit.getBoundingClientRect(), top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return { bed: f.dataset.bed, next: document.querySelector(".slot.next")?.textContent, label: document.querySelector(".slots").getAttribute("aria-label"), off, inside, dark, wrong: wrong.slice(0, 3), passes: !top?.closest(".finish"), events: getComputedStyle(f).pointerEvents };
      }, left);
      const ok = m.bed === String(left) && m.next === m.bed && m.label.endsWith("Checkout single " + left) && m.off < 1e-6 && m.inside > 20 && m.dark > 3 && !m.wrong.length && m.passes && m.events === "none";
      results.push(`${ok ? "ok " : "BAD"} ${size} ${left}: slot ${m.next}, matrix off ${m.off.toExponential(1)}, ${m.inside} grid points lit, ${m.dark} darkened${m.wrong.length ? " WRONG " + JSON.stringify(m.wrong) : ""}`);
      if (!ok) fail(JSON.stringify(m));
      await p.screenshot({ path: path.join(out, `finish-${size}-${left}.png`) });
    }
    if (errors.length) fail(size + " errors: " + errors.join(" | "));
    await ctx.close();
  }
  console.log(results.join("\n"));

  // A double-out save from the previous release, left on the "Not a double" bust card: 21 left, T7.
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: "block" });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(base);
  const legacy = await p.evaluate(async () => {
    const g = await import("./src/game.js");
    const pt = (n, r) => { const d = (g.sectors.indexOf(n) * 18 * Math.PI) / 180; return { x: Math.sin(d) * r, y: -Math.cos(d) * r }; };
    const hits = [pt(20, 103), pt(20, 103), pt(20, 103), pt(20, 103), pt(20, 130), pt(20, 130), pt(7, 103)];
    localStorage.clear();
    localStorage.setItem("dartshift.301.v1", JSON.stringify({ match: { game: "301", mode: "solo", hits }, best: 14, acknowledged: -1, lobby: "301" }));
    localStorage.setItem("dartshift.flick.v1", JSON.stringify({ rush: null, 301: 9, carried: [] }));
    return localStorage.getItem("dartshift.301.v1");
  });
  await p.reload();
  await p.waitForSelector("[data-mode=solo]");
  const lobby = await p.evaluate(() => [document.querySelector("[data-mode=solo] small").textContent, document.querySelector(".best-plate").textContent.trim().replace(/\s+/g, " ")]);
  await p.screenshot({ path: path.join(out, "legacy-lobby.png") });
  await p.click("[data-mode=solo]");
  await p.waitForSelector("#next");
  const card = await p.textContent(".handoff .caller");
  await p.screenshot({ path: path.join(out, "legacy-bust.png") });
  await p.click("#next");
  await p.waitForSelector("#throw");
  await sleep(700);
  const visit = await p.evaluate(() => [document.querySelector(".plate .side").textContent, [...document.querySelectorAll(".slot")].map((s) => s.textContent).join(" "), document.querySelector(".finish").dataset.bed]);
  // The bull from 21 is below zero: a bust under either rule, and the match stays double out.
  await p.focus("#throw");
  for (let k = 0; k < 4; k++) await p.keyboard.press("ArrowUp"); // sight from 35 mm to 3 mm: bull
  await p.keyboard.press("Shift+ArrowUp"); await p.keyboard.press("Shift+ArrowUp"); await p.keyboard.press("Shift+ArrowUp");
  await p.keyboard.press(" ");
  await p.waitForSelector("#panel > :not(.ghost) #next");
  const second = await p.textContent(".handoff .caller");
  const done = await p.evaluate(async () => {
    const g = await import("./src/game.js");
    const v1 = JSON.parse(localStorage.getItem("dartshift.301.v1"));
    const s = g.status(v1.match);
    return { left: s.totals[0], bust: s.visits.at(-1).bust, v2: localStorage.getItem("dartshift.301.v2"), finish: "finish" in v1.match, flick: localStorage.getItem("dartshift.flick.v1") };
  });
  await p.click("#next");
  await p.waitForSelector("#throw");
  // Leave, start a new 301 solo over it: the new one is first to zero, in v2, and v1 is emptied.
  await p.click("#back");
  await p.waitForSelector("[data-mode=duel]");
  await p.click("[data-mode=duel]");
  await p.waitForSelector("#switch");
  await p.click("#switch");
  await p.waitForSelector("#throw");
  const after = await p.evaluate(() => [JSON.parse(localStorage.getItem("dartshift.301.v1")), JSON.parse(localStorage.getItem("dartshift.301.v2"))]);
  await sleep(300);
  console.log(JSON.stringify({ lobby, card, visit, second, done, v1: after[0], v2: { ...after[1], match: after[1].match && { ...after[1].match, hits: after[1].match.hits.length } } }));
  const good = lobby[0].includes("21 left · double out") && /Fewest · double out\s?9/.test(lobby[1]) && card === "Not a double · back to 21" && visit[0] === "Double out" && visit[2] === "" && /(D\d+|Bull)$/.test(visit[1].trim()) && done.left === 21 && JSON.parse(done.v2).match === null && !done.finish && second.startsWith("Below zero") && after[0].match === null && after[0].best === 14 && after[1].match.finish === "any" && after[1].match.mode === "duel";
  if (!good || errors.length) fail("legacy " + errors.join(" | "));
  console.log("ok legacy double-out save resumed, bust card, double route, no highlight, replaced by a first-to-zero match");
  await b.close();
  server.close();
})().catch((e) => { console.log("FAIL " + e.message.split("\n")[0]); process.exit(1); });
