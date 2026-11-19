import test from "node:test";
import assert from "node:assert/strict";
import { addSample, entryPose, releaseThrow } from "../src/throw.js";
import {
  advance,
  decodeMatch,
  freshMatch,
  scoreAt,
  status,
} from "../src/game.js";

// Paths in board widths, sample times in ms. These expectations express what
// the player can do and are independent of display or event sample rate.
function throwPath(path, width = 320) {
  const samples = [];
  for (const [t, x, y] of path) addSample(samples, x * width, y * width, t);
  const [, x, y] = path[0];
  return releaseThrow({ x: x * width, y: y * width }, samples, width);
}

test("same stroke length: a quick finish lifts, a late pause drops", () => {
  const start = [0, 0, 0],
    end = [300, 0, -0.6];
  const fast = throwPath([start, [210, 0, -0.06], end]);
  const medium = throwPath([start, [210, 0, -0.348], end]);
  const pause = throwPath([start, [190, 0, -0.6], end]);
  assert.equal(scoreAt(medium.x, medium.y).points, 50);
  assert.ok(fast.y < -25 && fast.y > -40);
  assert.ok(pause.y > 25 && pause.y < 40);
  assert.equal(fast.x, 0);
  assert.deepEqual(throwPath([start, [210, 0, -0.06], end]), fast);
});

test("late sideways cuts trim the line in either direction, straight diagonals retain their line", () => {
  const path = [
    [0, 0, 0],
    [110, -0.18, -0.35],
    [200, 0, -0.6],
  ];
  const right = throwPath(path);
  const left = throwPath(path.map(([t, x, y]) => [t, -x, y]));
  assert.ok(right.x > 8 && right.x <= 16);
  assert.equal(right.x, -left.x);
  assert.equal(right.y, left.y);
  assert.ok(
    Math.abs(
      throwPath([
        [0, 0, 0],
        [100, 0.05, -0.3],
        [200, 0.1, -0.6],
      ]).line,
    ) < 1e-12,
  );
});

test("release window interpolates across samples and scales with board width", () => {
  const path = [
    [0, 0, 0],
    [90, 0, -0.18],
    [150, 0.06, -0.42],
    [200, 0.11, -0.62],
  ];
  const dense = [
    [0, 0, 0],
    [90, 0, -0.18],
    [110, 0.02, -0.26],
    [150, 0.06, -0.42],
    [150, 0.06, -0.42],
    [175, 0.085, -0.52],
    [200, 0.11, -0.62],
  ];
  const wanted = throwPath(path);
  for (const width of [169, 320, 428]) {
    const actual = throwPath(dense, width);
    for (const key of ["x", "y", "pace", "line"])
      assert.ok(Math.abs(actual[key] - wanted[key]) < 1e-9);
  }
});

test("flicks still require a deliberate upward stroke and extreme throws remain misses", () => {
  for (const end of [
    [1, 0, -0.3],
    [3, 1, -0.34],
    [100, 0, 0.5],
    [100, 0, 0],
  ]) {
    assert.equal(throwPath([[0, 0, 0], end]), null);
  }
  for (const end of [
    [2, -4, -2],
    [1000, 4, -3],
    [300, 0.01, -3],
  ]) {
    const hit = throwPath([[0, 0, 0], end]);
    assert.equal(scoreAt(hit.x, hit.y).points, 0);
    assert.ok(decodeMatch(advance(freshMatch("solo"), hit)));
  }
});

test("coordinate-only hits and new release angles survive a mixed-match reload", () => {
  const old = { mode: "solo", hits: [{ x: 0, y: -103 }] };
  const hit = throwPath([
    [0, 0, 0],
    [180, 0, -0.6],
  ]);
  const updated = advance(decodeMatch(old), hit);
  const again = decodeMatch(JSON.parse(JSON.stringify(updated)));
  assert.deepEqual(again.hits, [...old.hits, hit]);
  assert.deepEqual(status(again).totals, [60 + scoreAt(hit.x, hit.y).points]);
  assert.deepEqual(entryPose(again.hits[1]), entryPose(hit));
  assert.deepEqual(
    entryPose(old.hits[0]),
    entryPose({ ...old.hits[0], pace: "bad", line: null }),
  );
  assert.notDeepEqual(
    entryPose({ ...hit, pace: -1 }),
    entryPose({ ...hit, pace: 1 }),
  );
});
