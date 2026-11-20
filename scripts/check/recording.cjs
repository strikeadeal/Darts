// Run against npm start after npm run build. Playwright is a QA-only dependency.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");

async function check(browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const input = await context.newCDPSession(page);
  const help = async () => {
    await page.getByRole("button", {name: "How to play"}).click();
    const first = page.getByText("Pick up the dart.", {exact:true});
    for (let i = 0; i < 5; i++) await first.click();
    await page.getByRole("dialog", {name: "Stroke recorder"}).waitFor();
  };
  const touch = (type, x, y) => input.send("Input.dispatchTouchEvent", {
    type, touchPoints: type === "touchEnd" || type === "touchCancel" ? [] : [{x,y}],
  });
  async function stroke(rise, end) {
    const d = await page.locator(".ready-dart > g").boundingBox();
    const {width} = await page.locator(".board-wrap").boundingBox();
    const x = d.x + d.width / 2, y = d.y + d.height / 2;
    await touch("touchStart", x, y);
    for (let i = 1; i <= 5; i++) await touch("touchMove", x, y - width * rise * i / 5);
    await touch(end);
  }
  await page.goto(process.argv[2] || "http://127.0.0.1:4173/Darts/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  assert.equal(await page.getByText("Stroke recorder", {exact:true}).count(), 0);
  await help();
  await page.getByRole("combobox", {name: "Player"}).selectOption("Practised");
  await page.getByRole("combobox", {name: "Intended throw"}).selectOption("T20");
  await page.getByRole("button", {name: "Start recording"}).click();
  await context.setOffline(true);
  await page.reload();
  await page.getByRole("button", {name: /Solo run/}).click();
  await stroke(0.08, "touchEnd");
  await stroke(0.45, "touchCancel");
  await stroke(0.6, "touchEnd");
  await help();
  assert.match(await page.locator("#record-count").textContent(), /Recording · 3 attempts/);
  await page.getByRole("button", {name:"Stop recording"}).click();
  await page.reload();
  await help();
  assert.match(await page.locator("#record-count").textContent(), /Stopped · 3 attempts/);
  const download = page.waitForEvent("download");
  await page.getByRole("button", {name:"Export JSON"}).click();
  const file = await download;
  assert.equal(file.suggestedFilename(), "dartshift-strokes.json");
  const {strokes} = JSON.parse(await readFile(await file.path(), "utf8"));
  assert.deepEqual(strokes.map(r => r.outcome), ["rejected","cancelled","thrown"]);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("dartshift.save.v1")).match.hits);
  assert.deepEqual(saved, [strokes[2].landing]);
  assert.ok(strokes[2].reading.speed > 0);
  for (const r of strokes) {
    assert.equal(r.profile, "Practised");
    assert.equal(r.target, "T20");
    assert.ok(r.session && r.session === strokes[0].session);
    assert.equal(r.raw[0].type, "pointerdown");
    assert.ok(r.width > 0);
    assert.ok(Array.isArray(r.strokeFrameTimesMs));
    assert.ok(["baseline","stroke"].includes(r.refreshSource));
  }
  assert.deepEqual(errors, []);
  console.log("OK offline reload, labelled opt-in, invalid/cancelled/scored input, stop, durable JSON export and saved point");
}

(async () => {
  const browser = await chromium.launch();
  try { await check(browser); } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
