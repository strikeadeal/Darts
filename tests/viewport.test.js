import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fullHeight } from "../src/viewport.js";

// What the installed app reports, in CSS px. iOS keeps screen.* in portrait
// order whatever the orientation.
const phone = (innerWidth, innerHeight, screenWidth, screenHeight, standalone = true) => ({
  standalone,
  innerWidth,
  innerHeight,
  screenWidth,
  screenHeight,
});

test("an installed iPhone app takes its height from the screen", () => {
  // iPhone 14 Pro, iOS 27: laid out 59 px (the status bar) short of the screen.
  assert.equal(fullHeight(phone(393, 793, 393, 852)), 852);
  // Already right (iOS 16–18): unchanged.
  assert.equal(fullHeight(phone(393, 852, 393, 852)), 852);
  // Landscape: the short side.
  assert.equal(fullHeight(phone(852, 393, 393, 852)), 393);
  assert.equal(fullHeight(phone(852, 372, 393, 852)), 393);
  // No notch (SE): short by the 20 px status bar.
  assert.equal(fullHeight(phone(320, 548, 320, 568)), 568);
  assert.equal(fullHeight(phone(568, 320, 320, 568)), 320);
  // Fractional widths still count as spanning the screen.
  assert.equal(fullHeight(phone(393.5, 793, 393, 852)), 852);
});

test("anything that is not a full-screen installed app keeps the CSS height", () => {
  // A Safari tab: its toolbars take real space, so 100dvh is right.
  assert.equal(fullHeight(phone(393, 659, 393, 852, false)), null);
  assert.equal(fullHeight({ ...phone(393, 659, 393, 852), standalone: undefined }), null);
  // iPad Split View or Stage Manager: the window is not the screen.
  assert.equal(fullHeight(phone(507, 1300, 1024, 1366)), null);
  // Missing or bogus values.
  assert.equal(fullHeight(phone(393, 793, 0, 0)), null);
  assert.equal(fullHeight(phone(NaN, 793, 393, 852)), null);
});

// Every screen-sized measure goes through --vh, so the one height decides the
// board, the grip and where the throw control and cards sit.
test("the stylesheet sizes the screen only through --vh", () => {
  const css = readFileSync(new URL("../style.css", import.meta.url), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );
  const lines = css.split("\n");
  const viewportUnits = lines.filter((l) => /\d+(d|s|l)?vh\b/.test(l) && !l.includes("--vh:"));
  assert.deepEqual(viewportUnits, [], "use var(--vh)");
  for (const layer of [".scene {", "#panel {"]) {
    const rule = css.slice(css.indexOf("\n" + layer), css.indexOf("}", css.indexOf("\n" + layer)));
    assert.match(rule, /height: var\(--vh\)/, layer);
    assert.doesNotMatch(rule, /inset: 0;/, layer + " must not end at the layout viewport's bottom");
  }
});
