// One complete match through the visible controls. Needs Playwright; not part of the build.
// node scripts/check/match.cjs <chromium|webkit> <built dir> <WxH> <solo|duel> <touch|mouse|keyboard> <reduced motion 0|1> [rush|301]
// env SEED=<left>: see below. 301 by keyboard plays a fixed route: 1 left (no bust), a bust below zero, then down the single 3 to a
// game shot on it (player 2 misses throughout). Before every 301 dart the board's finishing highlight
// must match the scoreboard's next slot and sit in the board face's own projection.
const pw = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const [, , engine, rootArg, size, mode, input, rm, game = "rush"] = process.argv;
const x01 = game === "301", saveKey = x01 ? "dartshift.301.v2" : "dartshift.save.v1";
// Board mm on the 20–3 line: T20 -103, S20 -130, D20 -166, Bull 0, S3 130, T3 103, D3 166, miss 190.
const route = [-103, -103, -103, /* 121 */ -103, -103, /* 1 left */ 130, /* below zero: back to 121 */ -103, -166, 130, /* 18 */ 130, 130, 130, /* 9 */ 130, 130, 130 /* single 3: game shot */]; const root = path.resolve(rootArg);
const [W, H] = size.split("x").map(Number);
const insets = { "320x568": [20, 0, 0, 0], "360x740": [20, 0, 0, 0], "375x667": [20, 0, 0, 0], "375x812": [44, 34, 0, 0], "390x844": [47, 34, 0, 0], "393x852": [59, 34, 0, 0], "852x393": [0, 21, 59, 59], "667x375": [0, 0, 0, 0], "932x430": [0, 21, 59, 59] }[size];
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".ttf": "font/ttf" };
const server = http.createServer((q, s) => { let p = decodeURIComponent(new URL(q.url, "http://x").pathname); p = path.join(root, p.slice(7) || "index.html"); fs.readFile(p, (e, b) => { if (e) { s.writeHead(404); return s.end(); } s.writeHead(200, { "Content-Type": types[path.extname(p)] || "application/octet-stream" }); s.end(b); }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (m) => { throw new Error(m); };
(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const touch = input === "touch";
  const b = await pw[engine].launch();
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: touch, isMobile: touch, serviceWorkers: "block", reducedMotion: rm === "1" ? "reduce" : "no-preference" });
  const [t, bo, l, r] = insets;
  await ctx.addInitScript((css) => addEventListener("DOMContentLoaded", () => { const s = document.createElement("style"); s.textContent = css; document.head.append(s); }), `:root{--top:${t}px!important;--bottom:${bo}px!important;--left:${l}px!important;--right:${r}px!important}`);
  await ctx.addInitScript(() => {
    window.__downs = [];
    addEventListener("pointerdown", (e) => { const g = document.querySelector(".ready-dart > g")?.getBoundingClientRect(); window.__downs.push({ t: Math.round(performance.now()), x: Math.round(e.clientX), y: Math.round(e.clientY), moving: document.getAnimations().filter((a) => a.playState === "running").map((a) => a.transitionProperty || a.animationName).join(" "), dart: g && [g.left, g.top, g.width, g.height].map(Math.round).join(",") }); }, true);
  });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(String(e)));
  p.on("console", (m) => m.type() === "error" && !/Service Worker/.test(m.text()) && errors.push(m.text()));
  const cdp = touch ? await ctx.newCDPSession(p) : null;
  const tp = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
  async function stroke(x, y, dx, dy, ms) {
    const steps = Math.max(3, Math.round(ms / 16));
    if (touch) await tp("touchStart", x, y); else { await p.mouse.move(x, y); await p.mouse.down(); }
    for (let k = 1; k <= steps; k++) { await sleep(ms / steps); const X = x + (dx * k) / steps, Y = y + (dy * k) / steps; if (touch) await tp("touchMove", X, Y); else await p.mouse.move(X, Y); }
    if (touch) await tp("touchEnd"); else await p.mouse.up();
  }
  async function tap(sel) {
    const bb = await p.locator(sel).boundingBox();
    const x = bb.x + bb.width / 2, y = bb.y + bb.height / 2;
    if (touch) { await tp("touchStart", x, y); await sleep(40); await tp("touchEnd"); } else await p.mouse.click(x, y);
  }
  const hits = () => p.evaluate((k) => JSON.parse(localStorage.getItem(k))?.match?.hits?.length ?? 0, saveKey);
  const geo = () => p.evaluate(() => { const d = document.querySelector(".ready-dart > g").getBoundingClientRect(), bw = document.querySelector(".board-wrap").getBoundingClientRect(); return { x: d.left + d.width / 2, y: d.top + d.height / 2, w: bw.width, bx: bw.left + bw.width / 2, by: bw.top + bw.height / 2 }; });
  const settled = () => p.waitForFunction(() => !document.getAnimations().some((a) => a.playState === "running") && !document.querySelector(".field[aria-busy]"), null, { timeout: 10000 });
  await p.goto(`http://127.0.0.1:${server.address().port}/Darts/`);
  await sleep(300);
  // SEED=<left> (301): resume a first-to-zero match that is on `left` at the start of round 3 (a duel's
  // Player 2 on 301), so touch runs reach the finishing highlight.
  const seedLeft = +process.env.SEED;
  if (x01 && seedLeft) {
    await p.evaluate(async ([left, mode]) => {
      const g = await import("./src/game.js");
      const pt = (l) => { if (l === "Miss") return { x: 0, y: -190 }; const r = { T: 103, D: 166 }[l[0]] ?? 130, d = (g.sectors.indexOf(+l.replace(/^[TD]/, "")) * 18 * Math.PI) / 180; return { x: Math.sin(d) * r, y: -Math.cos(d) * r }; };
      const route = g.checkout(121 - left, 3), miss = ["Miss", "Miss", "Miss"];
      let m = g.freshMatch(mode, "301");
      for (const l of ["T20", "T20", "T20", ...(mode === "duel" ? miss : []), ...route, ...miss.slice(route.length), ...(mode === "duel" ? miss : [])]) m = g.advance(m, pt(l));
      localStorage.setItem("dartshift.301.v2", JSON.stringify({ match: m, best: null, acknowledged: m.hits.length }));
    }, [seedLeft, mode]);
    await p.reload();
    await sleep(300);
  }
  if (x01) { if (input === "keyboard") { await p.focus("[data-game='301']"); await p.keyboard.press("Enter"); } else await tap("[data-game='301']"); await sleep(200); if (await p.getAttribute("[data-game='301']", "aria-pressed") !== "true") fail("301 not selected"); }
  if (input === "keyboard") { await p.focus(`[data-mode=${mode}]`); await p.keyboard.press("Enter"); } else await tap(`[data-mode=${mode}]`);
  let n = await hits(), offDart = 0, skipPickups = 0, afterHandoff = false, visitStart = true, busts = 0, mine = 0, marks = [];
  // The highlight: the remaining score's bed under 20, the next slot's label, and the face's own matrix.
  const mark = () => p.evaluate(() => {
    const bed = document.querySelector(".finish")?.dataset.bed ?? "missing", left = +document.querySelector(".plate .plate-score").textContent;
    const next = document.querySelector(".slot.next")?.textContent || "", g = document.querySelector(".finish > g");
    const a = document.querySelector(".board-plane").getScreenCTM(), b = g?.getScreenCTM();
    const off = b ? Math.max(...["a", "b", "c", "d", "e", "f"].map((k) => Math.abs(a[k] - b[k]))) : 0;
    return { bed, left, next, off, ok: (left < 20 ? bed === String(left) && next === bed : bed === "") && off < 1e-6 };
  });
  while (!(await p.$("#again"))) {
    if (await p.$("#panel > :not(.ghost) #next")) {
      if (await p.$("#panel > .handoff.bust:not(.ghost)")) busts++;
      if (input === "keyboard") { const id = await p.evaluate(() => document.activeElement?.id); if (id !== "next") fail("focus not on #next: " + id); await p.keyboard.press("Enter"); }
      else await tap("#panel > :not(.ghost) #next");
      afterHandoff = visitStart = true;
      await p.waitForSelector("#throw", { timeout: 5000 });
      await sleep(60);
    }
    if (x01) { const m = await mark(); if (!m.ok) fail("highlight " + JSON.stringify(m)); if (m.bed) marks.push(m.bed); }
    if (input === "keyboard") {
      if (n === 0) await settled();
      const id = await p.evaluate(() => document.activeElement?.id);
      if (id !== "throw") { if (n === 0) await p.focus("#throw"); else fail(`focus on "${id}" before dart ${n + 1}`); }
      if (!x01) for (let k = 0; k < (n % 4) + 2; k++) await p.keyboard.press(n % 2 ? "ArrowUp" : "ArrowLeft");
      else {
        // Player 1 follows the route; player 2 misses.
        const p2 = mode === "duel" && (await p.evaluate(() => !!document.querySelector(".plate.p2")));
        const y = p2 ? 190 : route[mine++];
        let d = y - 35; // the sight starts at 35 mm below the bull
        const key = d < 0 ? "ArrowUp" : "ArrowDown"; d = Math.abs(d);
        for (let k = 0; k < Math.floor(d / 8); k++) await p.keyboard.press(key);
        for (let k = 0; k < d % 8; k++) await p.keyboard.press("Shift+" + key);
      }
      await p.keyboard.press(" ");
    } else if (afterHandoff && rm !== "1") {
      // Mid dolly-in: touch the dart where it is drawn right now.
      const g = await geo();
      await stroke(g.x, g.y, 0, -0.6 * g.w, 200);
      skipPickups++;
    } else {
      await settled();
      if (visitStart) {
        // A swipe that starts on the board must cost nothing and point at the dart.
        const g = await geo();
        await stroke(g.bx, g.by + 0.25 * g.w, 0, -0.5 * g.w, 180);
        await sleep(150);
        if ((await hits()) !== n) fail("off-dart swipe threw");
        const hint = await p.textContent(".hint");
        if (hint !== "Touch the dart to pick it up") fail("no cue: " + hint);
        offDart++;
        await settled();
      }
      const g = await geo();
      const side = ((n % 5) - 2) * 0.05 * g.w;
      await stroke(g.x, g.y, side, -(0.45 + (n % 4) * 0.08) * g.w, 120 + (n % 3) * 120);
    }
    afterHandoff = visitStart = false;
    const want = n + 1;
    await p.waitForFunction(([want, k]) => JSON.parse(localStorage.getItem(k))?.match?.hits?.length === want, [want, saveKey], { timeout: 5000 }).catch(async () => fail(`dart ${want} did not register ` + JSON.stringify((await p.evaluate(() => window.__downs)).slice(-2))));
    n = want;
    await p.waitForFunction(() => document.querySelector("#panel > :not(.ghost) #next") || document.querySelector("#again") || (document.querySelector("#throw") && !document.querySelector(".field[aria-busy]")), null, { timeout: 5000 });
    await sleep(rm === "1" ? 50 : 400);
  }
  await p.waitForSelector("#again", { timeout: 6000 });
  const check = await p.evaluate(async (k) => {
    const { status, scoreAt } = await import("./src/game.js");
    const saved = JSON.parse(localStorage.getItem(k)), m = saved.match, s = status(m);
    const shown = [...document.querySelectorAll(".result-score span")].map((s) => +s.textContent);
    // A solo 301 checkout shows the dart count.
    const want = m.game && m.mode === "solo" && s.out ? [m.hits.length] : s.totals;
    return { totals: want, shown, hits: m.hits.length, complete: s.complete, out: s.out, winner: s.winner, best: m.game === "301" ? saved.best : JSON.parse(localStorage.getItem("dartshift.flick.v1"))?.rush, oldBest: saved.best, title: document.querySelector("#result-title").textContent, last: scoreAt(m.hits.at(-1).x, m.hits.at(-1).y).label, rush: JSON.parse(localStorage.getItem("dartshift.save.v1")) };
  }, saveKey);
  if (JSON.stringify(check.totals) !== JSON.stringify(check.shown) || !check.complete) fail("results mismatch " + JSON.stringify(check));
  if (x01 && input === "keyboard" && (!check.out || check.winner !== 0 || busts !== 1 || marks.join() !== "1,18,15,12,9,6,3" || (mode === "solo" && check.best !== 15))) fail("301 route " + JSON.stringify({ ...check, busts, marks }));
  if (x01 && (await p.$eval(".finish", (f) => f.dataset.bed + f.innerHTML))) fail("highlight left on the results");
  if (x01 && check.rush && Object.keys(check.rush).join() !== "match,best,muted,acknowledged") fail("save.v1 shape " + JSON.stringify(check.rush));
  if (input === "keyboard") { const id = await p.evaluate(() => document.activeElement?.id); if (id !== "again") fail("results focus on " + id); }
  // A duel rematch hands the first throw to Player 2 (only the names swap).
  let rematch = "";
  if (mode === "duel") {
    if (input === "keyboard") await p.keyboard.press("Enter"); else await tap("#again");
    await p.waitForSelector("#throw", { timeout: 5000 });
    const who = await p.evaluate(() => [document.querySelector(".plate .who").textContent, document.querySelector(".plate").classList.contains("p2")]);
    const first = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)).match.first, saveKey);
    if (who[0] !== "Player 2" || !who[1] || first !== 1) fail("rematch starter " + JSON.stringify([who[0], who[1], first]));
    rematch = " rematch=Player 2 first";
  }
  if (errors.length) fail("errors: " + errors.join(" | "));
  console.log(`OK ${engine} ${game} ${size} ${mode} ${input} rm=${rm} hits=${check.hits} totals=${check.totals} "${check.title}" last="${check.last}" busts=${busts} offDart=${offDart} skipPickups=${skipPickups}${rematch}${x01 ? " marks=" + (marks.join() || "none") : ""}`);
  await b.close(); server.close();
})().catch((e) => { console.log(`FAIL ${engine} ${game} ${size} ${mode} ${input} rm=${rm}: ${e.message.split("\n")[0]}`); process.exit(1); });
