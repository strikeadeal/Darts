import test from "node:test";
import assert from "node:assert/strict";
import {
  addSample,
  entryPose,
  readStroke,
  releaseThrow,
  strokeSeed,
  swipeLanding,
  tune,
} from "../src/throw.js";
import {
  advance,
  decodeMatch,
  freshMatch,
  scoreAt,
  status,
} from "../src/game.js";
import { random, synth } from "../scripts/model/difficulty.mjs";
import * as legacy from "../scripts/model/legacy-throw.mjs";

// Paths in board widths, sample times in ms. These expectations express what
// the player can do and are independent of display or event sample rate.
const W = 320;
function samplesOf(path, width = W, add = addSample) {
  const samples = [];
  for (const [t, x, y] of path) add(samples, x * width, y * width, t);
  return samples;
}
const startOf = (path, width = W) => ({ x: path[0][1] * width, y: path[0][2] * width });
const throwPath = (path, width = W, seed) =>
  releaseThrow(startOf(path, width), samplesOf(path, width), width, seed);
const readPath = (path, width = W) => readStroke(startOf(path, width), samplesOf(path, width), width);
// Where a stroke's release would land with no faults: its line, length and speed.
const cleanOf = (s) =>
  swipeLanding(Math.sin(s.line) * s.length * W, -Math.cos(s.line) * s.length * W, W, s.speed);

// A straight stroke from rest, `length` board widths at `angle` degrees from
// straight up at a steady `speed` (widths/s), sampled every `dt` ms. `bow` bends
// it sideways by that share of its length. With `lift`, the pointerup follows
// that many ms after the last move, at the same place, as on a phone.
function steady(length, speed, { angle = 0, dt = 1000 / 60, lift, bow = 0, jitter } = {}) {
  const ms = (length / speed) * 1000,
    a = (angle * Math.PI) / 180;
  const at = (u) => {
    const side = 4 * bow * u * (1 - u) * length;
    return [
      Math.sin(a) * u * length + Math.cos(a) * side,
      -Math.cos(a) * u * length + Math.sin(a) * side,
    ];
  };
  const path = [];
  for (let t = 0; t < ms; t += dt) path.push([t, ...at(t / ms)]);
  path.push([ms, ...at(1)]);
  if (jitter) for (const p of path.slice(1)) (p[1] += jitter() / W), (p[2] += jitter() / W);
  if (lift !== undefined) path.push([ms + lift, path.at(-1)[1], path.at(-1)[2]]);
  return path;
}

test("calibration: a straight stroke of bullRise at the neutral speed hits the bull", () => {
  const g = tune.input;
  assert.deepEqual(swipeLanding(0, -g.bullRise * W, W), { x: 0, y: 0 });
  for (const dt of [1000 / 60, 1000 / 120, 1000 / 240]) {
    const hit = throwPath(steady(g.bullRise, g.cruise, { dt }));
    assert.ok(Math.hypot(hit.x, hit.y) < 1e-9, `${dt} ms`);
    assert.ok(Math.abs(hit.pace) < 1e-12);
    // A real lift arrives a sample later: still the bull, well inside it.
    const lifted = throwPath(steady(g.bullRise, g.cruise, { dt, lift: dt }));
    assert.equal(scoreAt(lifted.x, lifted.y).points, 50);
    assert.ok(Math.hypot(lifted.x, lifted.y) < 2);
  }
});

test("release speed sets the height; stroke length only nudges it", () => {
  const g = tune.input,
    k = g.sensitivity;
  const y = (length, speed) => throwPath(steady(length, speed)).y;
  // Each doubling of a clean release lands `height` higher, all the way up the board.
  for (const v of [1, 2, 4])
    assert.ok(Math.abs(y(0.6, v) - y(0.6, 2 * v) - k * g.height) < 1e-6, `${v} widths/s`);
  // Half as long again lifts by `reach` alone: much less than a doubling of speed.
  assert.ok(Math.abs(y(0.6, g.cruise) - y(0.9, g.cruise) - 0.3 * k * g.reach) < 1e-6);
  assert.ok(0.3 * g.reach < g.height / 3);
  // The same stroke length: a quick finish lands far higher than a steady one.
  const start = [0, 0, 0],
    end = [300, 0, -0.6];
  const quick = throwPath([start, [210, 0, -0.06], end]);
  const even = throwPath([start, [210, 0, -0.348], end]);
  assert.equal(scoreAt(even.x, even.y).points, 50);
  assert.ok(quick.y < even.y - k * g.height && quick.x === 0); // more than a doubling higher
  assert.ok(quick.pace > 0.3 && Math.abs(even.pace) < 1e-9);
  assert.deepEqual(throwPath([start, [210, 0, -0.06], end]), quick);
});

test("a pause before letting go is a fault that grows with the pause, not a softer flick", () => {
  const g = tune.input;
  const flick = readPath(steady(0.6, g.cruise, { lift: g.liftMs }));
  assert.equal(flick.miss, 0); // the lift itself is not a pause
  let last = 0;
  for (const pause of [10, 40, 80, 160]) {
    const s = readPath(steady(0.6, g.cruise, { lift: g.liftMs + pause }));
    assert.ok(Math.abs(s.speed - flick.speed) < 1e-9, "the release speed is the flick's");
    assert.ok(s.miss > last, `${pause} ms`);
    last = s.miss;
  }
  // Resting there with the finger trembling (small moves instead of none) is the
  // same pause: the release is still the flick's.
  const flicked = steady(0.6, g.cruise);
  const [t, x, y] = flicked.at(-1);
  const trembling = [...flicked];
  for (let k = 1; k <= 12; k++) trembling.push([t + 8 * k, x + (k % 2 ? 0.8 : -0.5) / W, y + (k % 3) * 0.3 / W]);
  const rest = readPath(trembling);
  assert.ok(Math.abs(rest.speed - g.cruise) < 0.05);
  assert.ok(rest.faults.slowdown > 20);
  // Sliding to a spot and stopping (pointer aiming) lands far short and is marked.
  const slide = [[0, 0, 0], [150, 0, -0.5], [300, 0, -0.6], [450, 0, -0.6]];
  const stop = throwPath(slide);
  assert.ok(Math.hypot(stop.x, stop.y) > 120, "well off the slide's aim");
  assert.ok(readPath(slide).faults.slowdown > 0);
});

test("stroke quality: clean strokes earn no miss, and faults earn more the worse they are", () => {
  const g = tune.input;
  // Clean: straight and steady at comfortable speeds, any sample rate, touch jitter.
  const r = random(7),
    jitter = () => 0.3 * r.normal();
  for (const speed of [1, 2.8, 6])
    for (const dt of [1000 / 60, 1000 / 120, 1000 / 240]) {
      const s = readPath(steady(0.6, speed, { dt, lift: dt, jitter }));
      assert.equal(s.miss, 0, `${speed} widths/s every ${dt} ms`);
    }
  const rising = (values) => values.every((v, i) => i === 0 || v > values[i - 1]);
  // Bending: free up to `bend`% of the length, then `bendCost` mm per % beyond.
  const bends = [0.02, 0.04, 0.06, 0.08].map((bow) => readPath(steady(0.6, 2.8, { bow })).faults.bend);
  assert.equal(bends[0], 0);
  assert.ok(rising(bends));
  assert.ok(Math.abs(bends[2] - bends[1] - 2 * g.bendCost) < 0.1);
  // Slowing before the lift: the last fifth of the stroke at a fraction of the speed.
  const slowing = [0.95, 0.7, 0.5, 0.3].map((f) => {
    const t1 = (0.4 / 3) * 1000,
      t2 = t1 + (0.2 / (3 * f)) * 1000;
    const path = [];
    for (let t = 0; t <= t1; t += 8) path.push([t, 0, (-0.4 * t) / t1]);
    for (let t = t1 + 8; t < t2; t += 8) path.push([t, 0, -0.4 - (0.2 * (t - t1)) / (t2 - t1)]);
    path.push([t2, 0, -0.6]);
    return readPath(path).faults.slowdown;
  });
  assert.equal(slowing[0], 0);
  assert.ok(rising(slowing));
  // Far outside the comfortable speeds, either way.
  const speeds = [0.99 * g.fast, 1.5 * g.fast, 2 * g.fast].map((v) => readPath(steady(0.6, v)).faults.speed);
  assert.equal(speeds[0], 0);
  assert.ok(rising(speeds));
  const soft = [1.01 * g.slow, g.slow / 1.5, g.slow / 2].map((v) => readPath(steady(0.6, v)).faults.speed);
  assert.equal(soft[0], 0);
  assert.ok(rising(soft));
  // A sloppy throw misses its clean landing by exactly its faults' total.
  const path = steady(0.6, 2.8, { bow: 0.06 });
  const s = readPath(path),
    hit = throwPath(path),
    clean = cleanOf(s);
  assert.ok(s.miss > 10);
  assert.ok(Math.abs(Math.hypot(hit.x - clean.x, hit.y - clean.y) - s.miss) < 1e-6);
});

test("the line: the stroke's direction sets it, a late flick takes a share, a hook costs", () => {
  const g = tune.input,
    k = g.sensitivity;
  for (const angle of [-25, -10, 10, 25]) {
    const hit = throwPath(steady(0.6, 2.8, { angle }));
    assert.ok(Math.abs(hit.x - k * g.aim * angle) < 1e-6);
    assert.ok(Math.abs(hit.y) < 1e-6);
    assert.ok(Math.abs(hit.line) < 1e-12); // a straight diagonal keeps its line
  }
  // A late cut inside the bend allowance moves the line by a share of its turn,
  // the same either way.
  const cut = [[0, 0, 0], [110, -0.012, -0.35], [188.6, 0, -0.6]];
  const right = throwPath(cut),
    left = throwPath(cut.map(([t, x, y]) => [t, -x, y]));
  const turn = Math.atan2(0.012, 0.25);
  assert.ok(Math.abs(readPath(cut).line - g.flickSteer * turn) < 1e-9);
  assert.ok(right.x > 0 && right.x === -left.x && right.y === left.y);
  assert.equal(readPath(cut).miss, 0);
  // A hook well past it is sloppy.
  assert.ok(readPath([[0, 0, 0], [110, -0.18, -0.35], [200, 0, -0.6]]).faults.bend > 50);
});

test("a human-like flick reads the same at 60, 120 and 240 Hz, and at every board width", () => {
  // The stroke model's minimum-jerk flick lifted near peak speed, with touch
  // noise and a random sample phase, aimed low, at the bull, high and wide.
  const model = { addSample, releaseThrow };
  const stats = (a) => {
    const m = a.reduce((x, y) => x + y, 0) / a.length;
    return [m, Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length)];
  };
  for (const plan of [
    { L: 0.5, peak: 1.2, theta: 0 },
    { L: 0.6, peak: 3, theta: 0 },
    { L: 0.75, peak: 5.5, theta: 0 },
    { L: 0.6, peak: 3, theta: 0.3 },
  ]) {
    const by = {};
    for (const hz of [60, 120, 240]) {
      const r = random(hz);
      const hits = Array.from({ length: 200 }, () =>
        synth(model, { ...plan, tau: 0.52, bend: 0, stall: 0, dwell: 20 + 60 * r(), tremor: null }, W, hz, r),
      );
      by[hz] = [stats(hits.map((h) => h.x)), stats(hits.map((h) => h.y))];
    }
    for (const hz of [60, 120])
      for (const axis of [0, 1]) {
        assert.ok(Math.abs(by[hz][axis][0] - by[240][axis][0]) < 1.5, `${JSON.stringify(plan)} ${hz} Hz mean`);
        assert.ok(by[hz][axis][1] < 3.5, `${JSON.stringify(plan)} ${hz} Hz spread`);
      }
  }
  // Extra samples on the same path change nothing, and the reading scales with the board.
  const path = [[0, 0, 0], [90, 0, -0.18], [150, 0.06, -0.42], [200, 0.11, -0.62]];
  const dense = [[0, 0, 0], [90, 0, -0.18], [110, 0.02, -0.26], [150, 0.06, -0.42], [150, 0.06, -0.42], [175, 0.085, -0.52], [200, 0.11, -0.62]];
  const wanted = readPath(path);
  for (const width of [169, 320, 428]) {
    const actual = readPath(dense, width);
    for (const key of ["line", "length", "speed", "bend", "slowdown", "miss"])
      assert.ok(Math.abs(actual[key] - wanted[key]) < 1e-9, `${key} at ${width}`);
    const a = throwPath(dense, width, 5),
      b = throwPath(path, W, 5);
    for (const key of ["x", "y", "pace", "line"]) assert.ok(Math.abs(a[key] - b[key]) < 1e-9);
  }
});

test("seeded scatter: the same stroke always lands the same, a clean one wherever it is seeded", () => {
  const sloppy = steady(0.6, 2.8, { bow: 0.07, lift: 8 });
  const once = throwPath(sloppy);
  assert.deepEqual(throwPath(sloppy), once);
  // The same stroke made elsewhere on the screen and later in time.
  const moved = sloppy.map(([t, x, y]) => [t + 12345.5, x + 0.3, y - 0.2]);
  assert.equal(strokeSeed(startOf(moved), samplesOf(moved), W), strokeSeed(startOf(sloppy), samplesOf(sloppy), W));
  const there = throwPath(moved);
  for (const key of ["x", "y", "pace", "line"]) assert.ok(Math.abs(there[key] - once[key]) < 1e-9);
  // A seed picks only the direction of the miss; its size is the stroke's.
  const s = readPath(sloppy),
    clean = cleanOf(s);
  const seeded = [1, 2, 3, 4].map((seed) => throwPath(sloppy, W, seed));
  for (const hit of seeded) assert.ok(Math.abs(Math.hypot(hit.x - clean.x, hit.y - clean.y) - s.miss) < 1e-6);
  assert.equal(new Set(seeded.map((h) => h.x.toFixed(6))).size, 4);
  assert.deepEqual(throwPath(sloppy, W, 3), seeded[2]);
  // A clean stroke has nothing to scatter.
  const neat = steady(0.6, 2.8, { lift: 8 });
  assert.deepEqual(throwPath(neat, W, 1), throwPath(neat, W, 99));
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

test("old saves replay and score exactly as they were thrown", () => {
  // Strokes thrown through the previous release's own model, saved as it saved them.
  const strokes = [
    [[0, 0, 0], [180, 0, -0.6]],
    [[0, 0, 0], [120, 0.01, -0.5], [210, 0.02, -0.75]],
    [[0, 0, 0], [200, -0.08, -0.55], [260, -0.1, -0.7], [380, -0.1, -0.7]],
    [[0, 0, 0], [90, 0.2, -0.4], [160, 0.3, -0.62]],
    [[0, 0, 0], [60, 0, -0.84]],
  ];
  const thrown = strokes.map((p) =>
    legacy.releaseThrow(startOf(p), samplesOf(p, W, legacy.addSample), W),
  );
  const saved = { mode: "solo", hits: thrown.map(({ x, y, pace, line }) => ({ x, y, pace, line })) };
  // And literal hits from a save written before this release.
  saved.hits.push({ x: 0, y: -103.4, pace: 0.21, line: -0.04 }, { x: -12.5, y: 166.2 });
  const m = decodeMatch(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(m.hits, saved.hits);
  const points = saved.hits.map((h) => scoreAt(h.x, h.y).points);
  assert.deepEqual(status(m).totals, [points.reduce((a, b) => a + b, 0)]);
  assert.deepEqual(points.slice(-2), [60, 6]);
  // The new throw lands the same strokes elsewhere, so a replay that re-threw
  // them instead of reading the saved points would show here.
  assert.ok(strokes.some((p, i) => scoreAt(throwPath(p).x, throwPath(p).y).label !== scoreAt(thrown[i].x, thrown[i].y).label));
  // A 301 save in progress replays its visits and bust from the saved points.
  const t20 = { x: 0, y: -103, pace: 0.2, line: 0 };
  const x01 = decodeMatch({ game: "301", mode: "solo", hits: [t20, t20, t20, t20, t20, t20, { x: 0, y: -130 }] });
  // 180, then T20 T20 leaves 1 (bust, back to 121), then T20 and single 20.
  assert.deepEqual(status(x01).totals, [41]);
  assert.deepEqual(status(x01).visits.map((v) => v.bust), [null, "one", null]);
});
