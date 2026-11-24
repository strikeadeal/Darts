// Update game and offline launch across the first-to-zero change. Needs Playwright; not part of the build.
// node scripts/check/update.cjs <chromium|webkit> <a release from before first to zero (f2dea07) dist> <a later build's dist>
// 1. The previous release, with a real service worker: a double-out 301 solo by keyboard is left on its
//    "Left on 1" bust card, with mute on and a Nine Dart Rush best.
// 2. This build is served; Update game reloads straight into that bust card, and the match plays on
//    under double out, with no highlight.
// 3. The server stops; a reload launches from the cache, resumes and takes a dart.
// 4. Still offline, a new 301 match is first to zero, in dartshift.301.v2, and highlights its finish.
const pw = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const [, , engine = "chromium", oldDir, newDir] = process.argv;
let root = path.resolve(oldDir);
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".ttf": "font/ttf", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json" };
const server = http.createServer((q, s) => {
  let p = decodeURIComponent(new URL(q.url, "http://x").pathname);
  if (!p.startsWith("/Darts/")) { s.writeHead(404); return s.end(); }
  p = path.join(root, p.slice(7) || "index.html");
  fs.readFile(p, (e, b) => { if (e) { s.writeHead(404); return s.end(); } s.writeHead(200, { "Content-Type": types[path.extname(p)] || "application/octet-stream", "Cache-Control": "no-cache" }); s.end(b); });
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (m) => { throw new Error(m); };
const check = (ok, what, got) => { if (!ok) fail(what + " " + JSON.stringify(got)); console.log("ok " + what); };

(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}/Darts/`;
  const b = await pw[engine].launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(String(e)));
  const store = () => p.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((k) => [k, JSON.parse(localStorage.getItem(k))])));
  // Keyboard aim on the 20–3 line: the sight starts 35 mm below the bull, 8 mm a step, 1 with Shift.
  async function dart(y) {
    await p.focus("#throw");
    let d = y - 35;
    const key = d < 0 ? "ArrowUp" : "ArrowDown";
    d = Math.abs(d);
    for (let k = 0; k < Math.floor(d / 8); k++) await p.keyboard.press(key);
    for (let k = 0; k < d % 8; k++) await p.keyboard.press("Shift+" + key);
    await p.keyboard.press(" ");
    await sleep(250);
  }
  async function next() { await p.waitForSelector("#panel > :not(.ghost) #next"); await p.click("#panel > :not(.ghost) #next"); await p.waitForSelector("#throw"); await sleep(150); }

  // 1. The previous release, installed.
  await p.goto(base);
  await p.evaluate(() => navigator.serviceWorker.ready);
  await p.reload();
  await p.waitForFunction(() => !!navigator.serviceWorker.controller);
  await p.evaluate(() => localStorage.setItem("dartshift.save.v1", JSON.stringify({ match: null, best: 450, muted: true, acknowledged: -1 })));
  await p.reload();
  await p.click("[data-game='301']");
  await p.click("[data-mode=solo]");
  await p.waitForSelector("#throw");
  for (const y of [-103, -103, -103]) await dart(y);
  await next();
  for (const y of [-103, -103]) await dart(y); // 121 → 61 → 1: a bust under double out
  await p.waitForSelector("#panel > :not(.ghost) #next");
  const before = await store();
  check(before["dartshift.301.v1"].match.hits.length === 5 && !("finish" in before["dartshift.301.v1"].match) && !before["dartshift.301.v2"], "previous release left a double-out match on its bust card", before["dartshift.301.v1"]);

  // 2. This build is published; Update game.
  root = path.resolve(newDir);
  await p.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
  await p.waitForSelector("#update:not([hidden])", { timeout: 10000 });
  await Promise.all([p.waitForEvent("load"), p.click("#apply")]);
  await p.waitForSelector("#panel > :not(.ghost) #next", { timeout: 10000 });
  const card = await p.evaluate(() => [document.querySelector(".handoff .caller").textContent, document.querySelector("#updated").textContent, document.querySelector(".neon span").textContent]);
  check(card[0] === "Left on 1 · back to 121" && card[1].startsWith("Updated · 301 is now first to zero"), "Update game resumed the bust card under double out", card);
  await next();
  const visit = await p.evaluate(() => [document.querySelector(".plate .side").textContent, [...document.querySelectorAll(".slot")].map((s) => s.textContent).join(" ").trim(), document.querySelector(".finish").dataset.bed]);
  check(visit[0] === "Double out" && /(D\d+|Bull)$/.test(visit[1]) && visit[2] === "", "the next visit shows a double-out route and no highlight", visit);
  const after = await store();
  check(JSON.stringify(after["dartshift.301.v1"].match) === JSON.stringify(before["dartshift.301.v1"].match) && after["dartshift.save.v1"].best === 450 && after["dartshift.save.v1"].muted === true && after["dartshift.301.v2"].match === null, "saves kept: v1 match byte-for-byte, best 450, mute", after["dartshift.301.v2"]);

  // 3. Offline launch.
  server.close();
  server.closeAllConnections?.();
  await p.reload();
  await p.waitForSelector("[data-mode=solo]");
  const label = await p.textContent("[data-mode=solo] small");
  await p.click("[data-mode=solo]");
  await p.waitForSelector("#throw");
  await dart(190); // a miss
  const off = await store();
  check(off["dartshift.301.v1"].match.hits.length === 6 && label.includes("121 left · double out"), "offline: launched from cache, resumed (" + label + ") and saved a dart", off["dartshift.301.v1"].match.hits.length);

  // 4. Offline, a new 301 match over it: first to zero.
  await p.click("#back");
  await p.click("[data-mode=duel]");
  await p.click("#switch");
  await p.waitForSelector("#throw");
  for (const y of [-103, -103, -103, 190, 190, 190]) { await dart(y); if (await p.$("#panel > :not(.ghost) #next")) await next(); }
  for (const y of [-103, -103]) await dart(y); // 121 → 1: not a bust now
  const now = await store();
  const lit = await p.evaluate(() => [document.querySelector(".finish").dataset.bed, document.querySelector(".slot.next")?.textContent]);
  check(now["dartshift.301.v1"].match === null && now["dartshift.301.v2"].match.finish === "any" && lit[0] === "1" && lit[1] === "1", "offline new duel: first to zero in v2, 1 left lit on the board", lit);
  if (errors.length) fail("errors: " + errors.join(" | "));
  console.log("OK update and offline");
  await b.close();
})().catch((e) => { console.log("FAIL " + e.message.split("\n")[0]); process.exit(1); });
