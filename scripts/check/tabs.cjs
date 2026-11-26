// Two tabs of the game in one browser: an older tab must never wipe what a newer one saved.
// node scripts/check/tabs.cjs <chromium|webkit> <built dir>
// Tab B sets a Nine Dart Rush record and starts a 301 solo; then tab A (opened first,
// holding the older saves) toggles sound, throws, goes back and reloads. B's match and
// record must survive every step. Then again with A deaf to storage events (as a
// suspended tab may be), so only the refresh on A's next touch protects B's saves.
const pw = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const [, , engine = "chromium", rootArg = "dist"] = process.argv;
const root = path.resolve(rootArg);
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".ttf": "font/ttf" };
const server = http.createServer((q, s) => { let p = decodeURIComponent(new URL(q.url, "http://x").pathname); p = path.join(root, p.slice(7) || "index.html"); fs.readFile(p, (e, b) => { if (e) { s.writeHead(404); return s.end(); } s.writeHead(200, { "Content-Type": types[path.extname(p)] || "application/octet-stream" }); s.end(b); }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (m) => { throw new Error(m); };
const stored = (p) => p.evaluate(() => ({
  rush: JSON.parse(localStorage.getItem("dartshift.flick.v1"))?.rush ?? null,
  // A new 301 match is first to zero, saved in 301.v2 (DECISIONS.md "First to zero"); 301.v1 holds only old double-out ones.
  darts301: (JSON.parse(localStorage.getItem("dartshift.301.v2")) ?? JSON.parse(localStorage.getItem("dartshift.301.v1")))?.match?.hits.length ?? null,
}));
const settled = (p) => p.waitForFunction(() => !document.querySelector(".field[aria-busy]") && !document.getAnimations().some((a) => a.playState === "running"), null, { timeout: 8000 });
async function keyDarts(p, n) {
  for (let i = 0; i < n; i++) {
    if (await p.$("#panel > :not(.ghost) #next")) { await p.click("#panel > :not(.ghost) #next"); await p.waitForSelector("#throw"); }
    await settled(p);
    await p.focus("#throw");
    await p.keyboard.press("ArrowUp");
    await p.keyboard.press(" ");
    await sleep(250);
  }
}

(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}/Darts/`;
  const b = await pw[engine].launch();
  for (const how of ["storage event", "no storage event"]) {
    const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, serviceWorkers: "block", reducedMotion: "reduce" });
    const errors = [];
    const open = async (deaf) => {
      const p = await ctx.newPage();
      p.on("pageerror", (e) => errors.push(String(e)));
      if (deaf) await p.addInitScript(() => addEventListener("storage", (e) => e.stopImmediatePropagation(), true));
      await p.goto(url);
      await sleep(300);
      return p;
    };
    const A = await open(how === "no storage event"), B = await open(false);
    // B: a Nine Dart Rush solo record, then three darts of a 301 solo.
    await B.bringToFront();
    await B.click("[data-mode=solo]");
    await keyDarts(B, 9);
    await B.waitForSelector("#again");
    await B.click("#lobby");
    await B.click("[data-game='301']");
    await B.click("[data-mode=solo]");
    await keyDarts(B, 3);
    const want = await stored(B);
    if (want.rush === null || want.darts301 !== 3) fail("setup " + JSON.stringify(want));
    await A.bringToFront();
    const steps = [
      ["toggle sound", () => A.click("#audio")],
      ["start and throw", async () => { await A.click("[data-mode=solo]").catch(() => A.click("[data-mode=duel]")); await sleep(300); await keyDarts(A, 1); }],
      ["back", () => A.click("#back")],
      ["reload", () => A.reload()],
    ];
    for (const [name, step] of steps) {
      await step();
      await sleep(300);
      const got = await stored(B);
      if (got.rush !== want.rush || got.darts301 !== want.darts301) fail(`${how}: after A's ${name}, B's saves became ${JSON.stringify(got)} (were ${JSON.stringify(want)})`);
    }
    if (errors.length) fail("errors: " + errors.join(" | "));
    console.log(`OK ${engine} two tabs (${how}): record ${want.rush} and 301 match (${want.darts301} darts) survived`);
    await ctx.close();
  }
  await b.close();
  server.close();
})().catch((e) => { console.log(`FAIL ${engine} tabs: ${e.message.split("\n")[0]}`); process.exit(1); });
