import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { replay, resample } from "../scripts/model/recorded.mjs";
import { rawSample } from "../src/recorder.js";
import { addSample, readStroke, releaseThrow } from "../src/throw.js";

test("export keeps coalesced and repeated events in delivery order for exact replay", () => {
  const events = [[0, 425, "pointerdown"], [100, 355, "coalesced"], [100, 354, "pointermove"],
    [150, 317, "pointermove"], [168, 317, "pointerup"]];
  const samples = [], raw = [];
  for (const [t, y, type] of events) {
    addSample(samples, 100, y, t);
    raw.push(rawSample({clientX: 100, clientY: y, timeStamp: t}, type));
  }
  assert.deepEqual(raw.map(s => s.type), events.map(e => e[2]));
  const replay = [];
  for (const {x, y, t} of JSON.parse(JSON.stringify(raw))) addSample(replay, x, y, t);
  assert.deepEqual(replay, samples);
  assert.ok(readStroke(replay[0], replay, 180));
  assert.deepEqual(releaseThrow(replay[0], replay, 180), releaseThrow(samples[0], samples, 180));
});

test("the recorded simulator gestures reproduce the WebKit reading and saved point in Node", async () => {
  const file = new URL("../scripts/model/fixtures/simulator-flicks.json", import.meta.url);
  const { strokes } = JSON.parse(await readFile(file));
  assert.equal(strokes.length, 9);
  for (const row of strokes) {
    const { read, hit } = replay(row);
    for (const key of ["x", "y", "pace", "line"])
      assert.ok(Math.abs(hit[key] - row.landing[key]) < 1e-8, key);
    for (const key of ["speed", "bend", "slowdown", "length", "miss"])
      assert.ok(Math.abs(read[key] - row.reading[key]) < 1e-8, key);
    for (const hz of [60, 120]) {
      const samples = resample(row, hz);
      const { x, y, t } = row.raw.at(-1);
      assert.deepEqual(samples.at(-1), {x, y, t});
      assert.ok(samples.every((s,i) => !i || s.t > samples[i-1].t));
    }
  }
});

test("counterfactual replay includes an accepted stroke whose finish turns sideways", () => {
  const row = {width: 100, raw: [{x:0,y:0,t:0},{x:0,y:-35,t:80},{x:20,y:-34,t:100}]};
  const {hit, clean} = replay(row);
  assert.ok(hit);
  assert.ok(clean && Number.isFinite(clean.x) && Number.isFinite(clean.y));
});
