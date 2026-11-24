// Update game, offline launch and rollback across the three new games. Needs Playwright; not part of the build.
// node scripts/check/modes-update.cjs <chromium|webkit> <previous release dist> <this build's dist> <this build, one byte changed>
// 1. The previous release, with a real service worker: a 301 solo by keyboard left on its first visit card,
//    with mute on and a Nine Dart Rush best.
// 2. This build is published; Update game resumes that card, and the release note shows.
// 3. Cricket: a solo by keyboard left on its first visit card; another update resumes straight into it.
// 4. The server stops; a reload launches from cache in the Cricket lobby, resumes and takes a dart.
// 5. Rollback: the previous release is served again and applied. It shows Nine Dart Rush in the lobby, keeps
//    its own saves, and leaves dartshift.games.v1 untouched even when it writes. Forward again: Cricket resumes.
const pw = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const [, , engine = "chromium", oldDir, newDir, nextDir] = process.argv;
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
const sectors = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port, base = `http://127.0.0.1:${port}/Darts/`;
  const b = await pw[engine].launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(String(e)));
  const raw = () => p.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])));
  // Keyboard aim at a bed ("T20", "20", "Miss"); the sight starts at (0, 35) mm, 8 mm a step, 1 with Shift.
  async function dart(name) {
    await p.focus("#throw");
    const r = { T: 103, D: 166 }[name[0]] ?? 130, a = (sectors.indexOf(+name.replace(/^[TD]/, "")) * 18 * Math.PI) / 180;
    const [x, y] = name === "Miss" ? [0, 190] : [Math.round(Math.sin(a) * r), Math.round(-Math.cos(a) * r)];
    for (const [d, minus, plus] of [[x, "ArrowLeft", "ArrowRight"], [y - 35, "ArrowUp", "ArrowDown"]]) {
      const key = d < 0 ? minus : plus, n = Math.abs(d);
      for (let k = 0; k < Math.floor(n / 8); k++) await p.keyboard.press(key);
      for (let k = 0; k < n % 8; k++) await p.keyboard.press("Shift+" + key);
    }
    await p.keyboard.press(" ");
    await sleep(250);
  }
  async function update(dir) {
    root = path.resolve(dir);
    await p.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
    await p.waitForSelector("#update:not([hidden])", { timeout: 10000 });
    await Promise.all([p.waitForEvent("load"), p.click("#apply")]);
  }
  const pick = async (game) => { await p.$eval(`[data-game='${game}']`, (b) => b.click()); await sleep(150); };

  // 1. The previous release, installed.
  await p.goto(base);
  await p.evaluate(() => navigator.serviceWorker.ready);
  await p.reload();
  await p.waitForFunction(() => !!navigator.serviceWorker.controller);
  await p.evaluate(() => localStorage.setItem("dartshift.save.v1", JSON.stringify({ match: null, best: 450, muted: true, acknowledged: -1 })));
  await p.reload();
  await pick("301");
  await p.click("[data-mode=solo]");
  await p.waitForSelector("#throw");
  for (const d of ["T20", "T20", "T20"]) await dart(d);
  await p.waitForSelector("#panel > :not(.ghost) #next");
  const before = await raw();

  // 2. Update to this build, from the visit card.
  await update(newDir);
  await p.waitForSelector("#panel > :not(.ghost) #next", { timeout: 10000 });
  const card = await p.evaluate(() => [document.querySelector(".handoff .visit-total").textContent, document.querySelector("#updated").textContent]);
  const after = await raw();
  check(card[0] === "180" && card[1].startsWith("Updated · A new look") && after["dartshift.301.v2"] === before["dartshift.301.v2"] && after["dartshift.save.v1"] === before["dartshift.save.v1"], "Update game resumed the 301 card with every save unchanged", card);

  // 3. Cricket, left on its first card, then another update.
  await p.click("#next");
  await p.waitForSelector("#throw");
  await p.click("#back");
  await pick("cricket");
  await p.click("[data-mode=solo]");
  await p.waitForSelector("#throw");
  for (const d of ["T20", "T19", "19"]) await dart(d);
  await p.waitForSelector("#panel > :not(.ghost) #next");
  const games = (await raw())["dartshift.games.v1"];
  await update(nextDir);
  await p.waitForSelector("#panel > :not(.ghost) #next", { timeout: 10000 });
  const resumed = await p.evaluate(() => [document.querySelector(".handoff .caller").textContent, document.querySelector(".neon b").textContent]);
  check(resumed[0] === "Closed 20, 19" && resumed[1] === "CRICKET" && (await raw())["dartshift.games.v1"] === games, "a second update resumed the Cricket card", resumed);

  // 4. Offline launch.
  server.close();
  server.closeAllConnections?.();
  await p.reload();
  await p.waitForSelector("[data-mode=solo]");
  const label = await p.textContent("[data-mode=solo] small");
  await p.click("[data-mode=solo]");
  await p.waitForSelector("#panel > :not(.ghost) #next");
  await p.click("#panel > :not(.ghost) #next");
  await p.waitForSelector("#throw");
  await dart("T18");
  const off = JSON.parse((await raw())["dartshift.games.v1"]).cricket.match.hits.length;
  check(off === 4 && label.includes("2 of 7 closed"), "offline: launched from cache, resumed (" + label + ") and saved a dart", off);

  // 5. Rollback to the previous release, then forward again.
  const kept = (await raw())["dartshift.games.v1"];
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  await p.click("#back");
  await update(oldDir);
  await p.waitForSelector("[data-mode=solo]", { timeout: 10000 });
  const old = await p.evaluate(() => [document.querySelector(".neon b").textContent, document.querySelectorAll("[data-game]").length]);
  await p.click("#audio"); // the previous release writes all its keys
  await sleep(200);
  const rolled = await raw();
  check(old[0] === "RUSH" && old[1] === 2 && rolled["dartshift.games.v1"] === kept && JSON.parse(rolled["dartshift.save.v1"]).best === 450, "rollback: the previous release shows Nine Dart Rush and leaves dartshift.games.v1 alone", old);
  await update(newDir);
  await p.waitForSelector("[data-mode=solo]", { timeout: 10000 });
  await pick("cricket");
  const back = await p.textContent("[data-mode=solo] small");
  check(back.includes("3 of 7 closed"), "forward again: the Cricket solo is still there (" + back + ")", back);
  if (errors.length) fail("errors: " + errors.join(" | "));
  console.log("OK update, offline and rollback");
  await b.close();
  server.close();
})().catch((e) => { console.log("FAIL " + e.message.split("\n")[0]); process.exit(1); });
