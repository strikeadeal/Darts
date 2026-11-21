import test from "node:test";
import assert from "node:assert/strict";
import {
  scoreAt,
  radii,
  freshMatch,
  advance,
  status,
  decodeMatch,
  swipeLanding,
} from "../src/game.js";
import { tune } from "../src/throw.js";

const sectors = [
  20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5,
];
const point = (deg, r) => ({
  x: Math.sin((deg * Math.PI) / 180) * r,
  y: -Math.cos((deg * Math.PI) / 180) * r,
});
const score = (deg, r) => {
  const { x, y } = point(deg, r);
  return scoreAt(x, y).points;
};
test("all 20 wedges score inner and outer singles, trebles and doubles", () => {
  sectors.forEach((n, i) => {
    for (const [r, m] of [
      [45, 1],
      [103, 3],
      [130, 1],
      [166, 2],
    ])
      assert.equal(score(i * 18, r), n * m);
  });
});
test("radial wires score inward, including bull and outer boundary", () => {
  for (const [r, s] of [
    [0, 50],
    [6.35, 50],
    [6.351, 25],
    [15.9, 25],
    [15.901, 20],
    [99, 20],
    [99.001, 60],
    [107, 60],
    [107.001, 20],
    [162, 20],
    [162.001, 40],
    [170, 40],
    [170.001, 0],
  ])
    assert.equal(score(0, r), s);
});
test("sector wires score clockwise, including wrap around the top", () => {
  sectors.forEach((n, i) => {
    assert.equal(score(i * 18 - 9, 130), n);
    assert.equal(score(i * 18 + 8.999, 130), n);
  });
});
test("solo ends on dart nine and scores no extra dart", () => {
  let m = freshMatch("solo");
  for (let i = 0; i < 9; i++) m = advance(m, point(0, 103));
  assert.equal(status(m).complete, true);
  assert.deepEqual(status(m).totals, [540]);
  assert.equal(advance(m, point(0, 103)), m);
});
test("duel visits alternate every three darts and ties survive a reload", () => {
  let m = freshMatch("duel");
  for (let i = 0; i < 18; i++) {
    assert.equal(status(m).player, Math.floor(i / 3) % 2);
    assert.equal(status(m).round, Math.floor(i / 6) + 1);
    assert.equal(status(m).dart, (i % 3) + 1);
    m = advance(m, point(0, 171));
  }
  assert.deepEqual(status(m).totals, [0, 0]);
  assert.equal(status(m).complete, true);
  assert.deepEqual(decodeMatch(JSON.parse(JSON.stringify(m))), m);
});
test("saved match rejects unknown modes, invalid coordinates and excess darts", () => {
  for (const x of [
    null,
    {},
    { mode: "x", hits: [] },
    { mode: "solo", hits: [{ x: 0, y: null }] },
    { mode: "solo", hits: Array(10).fill(point(0, 0)) },
  ])
    assert.equal(decodeMatch(x), null);
});
test("swipe direction, length and release speed determine the impact in board coordinates", () => {
  const g = tune.input,
    k = g.sensitivity;
  // The release speed that puts a straight 60% stroke at height y.
  const speedFor = (y) => g.cruise * 2 ** (-y / (k * g.height));
  for (const width of [169, 227, 340, 400]) {
    assert.equal(swipeLanding(0, -(width * g.minimumRise - 1), width), null);
    assert.equal(swipeLanding(0, 0, width), null); // a tap
    assert.deepEqual(swipeLanding(0, -0.6 * width, width), { x: 0, y: 0 });
    // At the neutral speed, length alone only nudges the dart off the bull...
    const minimum = swipeLanding(0, -Math.max(1, width * g.minimumRise), width);
    assert.ok(minimum.y > 0 && minimum.y < radii.trebleIn);
    assert.ok(Math.abs(swipeLanding(0, -0.9 * width, width).y + 0.3 * k * g.reach) < 1e-9);
    // ...release speed carries it: soft to the bottom of the board, hard to the top.
    for (const [y, label] of [
      [166, "Double 3"],
      [103, "Treble 3"],
      [-103, "Treble 20"],
      [-166, "Double 20"],
    ]) {
      const hit = swipeLanding(0, -0.6 * width, width, speedFor(y));
      assert.equal(scoreAt(hit.x, hit.y).label, label);
    }
  }
  assert.deepEqual(swipeLanding(30, -240, 400), swipeLanding(15, -120, 200));
  assert.ok(swipeLanding(-40, -300, 400).x < 0);
  assert.ok(swipeLanding(40, -300, 400).x > 0);
  const miss = swipeLanding(0, -240, 400, 4 * g.fast);
  assert.equal(scoreAt(miss.x, miss.y).points, 0);
  assert.ok(decodeMatch(advance(freshMatch("solo"), miss)));
});
test("taps, tremor, downward and predominantly sideways swipes cost no dart", () => {
  for (const [dx, dy] of [
    [0, 0],
    [2, 0], // jitter with no rise (any rise at all now throws: minimumRise is 0)
    [0, 100],
    [120, -10],
    [-120, -30],
    [600, -150],
  ])
    assert.equal(swipeLanding(dx, dy, 400), null);
});
test("mixed duel assigns both halves of all three rounds to the right player", () => {
  let m = freshMatch("duel");
  for (let r = 0; r < 3; r++) {
    for (const hit of [
      point(0, 103),
      point(0, 0),
      point(0, 171),
      point(18, 166),
      point(90, 130),
      point(0, 10),
    ])
      m = advance(m, hit);
  }
  assert.deepEqual(status(m).totals, [330, 99]);
});

test("a duel rematch can name Player 2 first without changing the scoring", () => {
  assert.equal(freshMatch("duel", undefined, 1).first, 1);
  assert.equal(freshMatch("duel", "301", 1).first, 1);
  assert.equal("first" in freshMatch("duel"), false);
  assert.equal("first" in freshMatch("solo", undefined, 1), false);
  let a = freshMatch("duel"), b = freshMatch("duel", undefined, 1);
  for (let i = 0; i < 18; i++) {
    const p = { x: (i % 5) * 20 - 40, y: -100 + i * 7 };
    a = advance(a, p);
    b = advance(b, p);
    const [sa, sb] = [status(a), status(b)];
    assert.deepEqual([sb.totals, sb.player, sb.round, sb.complete], [sa.totals, sa.player, sa.round, sa.complete]);
  }
  assert.equal(b.first, 1); // kept through advance
  assert.equal(decodeMatch(JSON.parse(JSON.stringify(b))).first, 1);
  // Anything else is dropped, not rejected.
  for (const first of [0, 2, "1", null]) {
    const m = decodeMatch({ mode: "duel", hits: [], first });
    assert.ok(m);
    assert.equal("first" in m, false);
  }
  assert.equal("first" in decodeMatch({ mode: "solo", hits: [], first: 1 }), false);
});
