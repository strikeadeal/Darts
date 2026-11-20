import test from "node:test";
import assert from "node:assert/strict";
import { onDart, swipeLanding, tune } from "../src/throw.js";
import { scoreAt, radii } from "../src/game.js";

// The painted dart at rest on a 390×844 phone, in CSS px.
const dart = { left: 170, top: 612, width: 51, height: 138 };

test("a stroke picks the dart up only on it or just around it", () => {
  const { pad } = tune.grab;
  const cx = dart.left + dart.width / 2;
  assert.ok(onDart(cx, dart.top + 70, dart));
  assert.ok(onDart(dart.left - pad, dart.top, dart)); // forgiving edge
  assert.ok(onDart(dart.left + dart.width + pad, dart.top + dart.height + pad, dart));
  assert.ok(!onDart(dart.left - pad - 1, dart.top + 70, dart));
  assert.ok(!onDart(cx, dart.top - pad - 1, dart));
  assert.ok(!onDart(cx, 300, dart)); // on the board
  assert.ok(!onDart(cx + 120, dart.top + 70, dart)); // beside the dart on the floor
});

test("a touch that skips a camera move counts anywhere along the dart's path", () => {
  const drawn = { left: 176, top: 515, width: 37, height: 100 }; // start of a dolly-in
  assert.ok(onDart(195, 580, dart, drawn)); // between the two
  assert.ok(onDart(195, 520, dart, drawn));
  assert.ok(!onDart(195, 520, dart)); // not where it settles
  assert.ok(!onDart(195, 300, dart, drawn)); // still not the board
});

test("the target never shrinks below a thumb", () => {
  assert.ok(tune.grab.min >= 44);
  const speck = { left: 100, top: 100, width: 2, height: 2 };
  const half = tune.grab.min / 2;
  assert.ok(onDart(101 + half - 0.5, 101, speck));
  assert.ok(onDart(101, 101 - half + 0.5, speck));
  assert.ok(!onDart(101 + half + 0.5, 101, speck));
});

// Measured in WebKit with simulated safe areas: board width, the touch target's
// lowest point (the worst place to start a stroke), the dart's centre and the
// safe frame. The smallest screen in each orientation, plus the notched landscape.
// These are the full-screen layouts. Re-measured in Chromium with the installed
// app's short layout viewport (scripts/check/viewport.cjs): --vh puts every value
// back exactly here (see DECISIONS.md, "Full screen in the installed app").
const layouts = [
  { size: "320×568", board: 288, bottom: 544, cx: 160, frame: [0, 20, 320] },
  { size: "667×375", board: 293.5, bottom: 387, cx: 319.5, frame: [0, 0, 667] },
  { size: "852×393", board: 302, bottom: 387, cx: 409, frame: [59, 0, 793] },
  // The iPhone 14 Pro's own landscape insets (0, 20, 59, 59), read on the phone.
  { size: "852×393 measured", board: 303, bottom: 388.5, cx: 409, frame: [59, 0, 793] },
];

test("every bed is reachable from the dart with a comfortable clean flick on the smallest screens", () => {
  const g = tune.input,
    k = g.sensitivity;
  // Comfortable: well inside the free speed range at both ends.
  const soft = 1.2 * g.slow,
    hard = 0.8 * g.fast;
  const beds = [
    [0, -166, "Double 20"],
    [0, 166, "Double 3"],
    [-166, 0, "Double 11"],
    [166, 0, "Double 6"],
    [-97.6, -134.3, "Double 12"],
    [97.6, -134.3, "Double 18"],
  ];
  for (const { size, board: w, bottom, cx, frame } of layouts) {
    const [left, top, right] = frame;
    for (const [x, y, label] of beds) {
      // From the lowest point of the touch target, the stroke leans to the bed's
      // line; find a length that fits the screen and needs a comfortable speed.
      const angle = x / (k * g.aim) * (Math.PI / 180);
      let found = null;
      for (let L = 0.35; L <= 0.9 + 1e-9 && !found; L += 0.05) {
        const dx = Math.sin(angle) * L * w,
          dy = -Math.cos(angle) * L * w;
        const speed = g.cruise * 2 ** ((k * g.reach * (g.bullRise - L) - y) / (k * g.height));
        if (speed < soft || speed > hard || bottom + dy < top || cx + dx < left || cx + dx > right) continue;
        const hit = swipeLanding(dx, dy, w, speed);
        if (hit && scoreAt(hit.x, hit.y).label === label) found = { L, speed };
      }
      assert.ok(found, `${size}: no comfortable flick reaches ${label}`);
    }
  }
});
