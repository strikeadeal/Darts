import test from "node:test";
import assert from "node:assert/strict";
import { coach, nearBull } from "../src/coach.js";
import { tune } from "../src/throw.js";

const clean = { speed: tune.input.cruise, faults: { speed: 0, bend: 0, slowdown: 0 } };
const at = (x, y) => ({ x, y });

test("stroke faults are coached as before, whatever the landing", () => {
  assert.equal(coach({ ...clean, faults: { bend: 9, slowdown: 2, speed: 0 } }, at(0, 0), true), "Keep the stroke straight");
  assert.equal(coach({ ...clean, faults: { bend: 0, slowdown: 30, speed: 0 } }, at(0, 0)), "Let go while still flicking");
  assert.equal(coach({ speed: tune.input.fast * 2, faults: { speed: 40, bend: 0, slowdown: 0 } }, at(0, 0)), "Too hard · flick softer");
  assert.equal(coach({ speed: tune.input.slow / 2, faults: { speed: 40, bend: 0, slowdown: 0 } }, at(0, 0)), "Too soft · flick harder");
  // Under 6 mm a fault is not worth mentioning.
  assert.equal(coach({ ...clean, faults: { bend: 5.9, slowdown: 0, speed: 0 } }, at(0, 0), true), "");
});

test("a clean dart off the board says which way, learning or not", () => {
  for (const learning of [true, false]) {
    assert.equal(coach(clean, at(0, 180), learning), "Too low · flick harder");
    assert.equal(coach(clean, at(0, -180), learning), "Too high · flick softer");
    assert.equal(coach(clean, at(190, 20), learning), "Too wide · straighten your line");
  }
});

test("while learning, a clean dart on the board is coached relative to the bull, beyond nearBull only", () => {
  assert.equal(nearBull, 50);
  assert.equal(coach(clean, at(0, nearBull - 1), true), "");
  assert.equal(coach(clean, at(0, nearBull), true), "");
  assert.equal(coach(clean, at(0, nearBull + 1), true), "Below the bull · flick harder");
  assert.equal(coach(clean, at(0, -(nearBull + 1)), true), "Above the bull · flick softer");
  assert.equal(coach(clean, at(nearBull + 1, 10), true), "Wide · straighten your line");
  assert.equal(coach(clean, at(-120, -30), true), "Wide · straighten your line");
  assert.equal(coach(clean, at(0, 166), true), "Below the bull · flick harder"); // still on the board
});

test("after learning, on-board darts and keyboard throws are never coached", () => {
  for (const p of [at(0, 103), at(0, -103), at(-32, 98), at(0, 166)]) assert.equal(coach(clean, p, false), "");
  assert.equal(coach(undefined, at(0, 120), true), "");
  assert.equal(coach(undefined, at(0, 190), true), "");
});
