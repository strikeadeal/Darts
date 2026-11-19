import test from "node:test";
import assert from "node:assert/strict";
import {
  scoreAt,
  freshMatch,
  advance,
  status,
  decodeMatch,
  sightAt,
} from "../src/game.js";

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
test("sight is repeatable, steerable and moves during a hold", () => {
  const a = sightAt(0, 0, 300, 0);
  assert.deepEqual(a, sightAt(0, 0, 300, 0));
  assert.notDeepEqual(a, sightAt(0, 0, 420, 0));
  const b = sightAt(24, -12, 300, 0);
  assert.equal(Math.round(b.x - a.x), 24);
  assert.equal(Math.round(b.y - a.y), -12);
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
