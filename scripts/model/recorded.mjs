// Empirical input to the throw model. Each trial is a complete observed stroke.
// Keep the correlations among path, timing, lift and coalescing. Replaying
// a population with an invented speed or independent scatter seed loses them.
// node scripts/model/recorded.mjs [export.json]
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { addSample, readStroke, releaseThrow, cleanLanding } from "../../src/throw.js";

export function samplesOf(row) {
  const samples = [];
  for (const { x, y, t } of row.raw) addSample(samples, x, y, t);
  return samples;
}

// addSample bounds the game's history to 600 events. For reconstruction keep
// the whole observation, even if a finger rested on the dart for several seconds.
function observedPath(row) {
  const path = [];
  for (const p of row.raw) {
    const last = path.at(-1);
    if (last && p.t < last.t) continue;
    if (last?.t === p.t) path.pop();
    path.push(p);
  }
  return path;
}

export function replay(row, samples = samplesOf(row), width = row.width) {
  const start = row.raw[0];
  const read = readStroke(start, samples, width);
  const hit = releaseThrow(start, samples, width);
  if (!read) return { read, hit, clean: null };
  const clean = cleanLanding(read.line, read.length, read.speed);
  return { read, hit, clean };
}

// Counterfactual sampling of the piecewise-linear *observed* path. Preserve
// native lift time/position including a stationary tail. This cannot recover
// faster movement that the original digitiser never reported.
export function resample(row, hz, phase = 0.5, width = row.width) {
  const path = observedPath(row), start = row.raw[0], end = path.at(-1);
  const scale = width / row.width, step = 1000 / hz, samples = [];
  function put(x, y, t) {
    addSample(samples, start.x + (x - start.x) * scale, start.y + (y - start.y) * scale, t);
  }
  put(start.x, start.y, start.t);
  let i = 1;
  for (let t = start.t + step * phase; t < end.t; t += step) {
    while (i < path.length - 1 && path[i].t < t) i++;
    const a = path[i - 1], b = path[i], f = (t - a.t) / (b.t - a.t);
    put(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, t);
  }
  put(end.x, end.y, end.t);
  return samples;
}

// Fit an empirical gesture on a common time grid. Training paths are expressed
// relative to pickup in board widths. Duration and shape stay paired in the
// replay above; this average is solely a held-out check of the motor waveform.
export function fitGesture(rows, bins = 32) {
  if (!rows.length) throw Error("A training stroke is required");
  const shape = Array.from({ length: bins + 1 }, () => ({ x: 0, y: 0 }));
  let duration = 0;
  for (const row of rows) {
    const samples = observedPath(row), start = samples[0], end = samples.at(-1);
    const ms = end.t - start.t;
    if (!(ms > 0)) throw Error("A timed stroke is required");
    duration += ms / rows.length;
    let i = 1;
    shape.forEach((bin, k) => {
      const t = start.t + ms * k / bins;
      while (i < samples.length - 1 && samples[i].t < t) i++;
      const a = samples[i-1], b = samples[i], f = (t - a.t) / (b.t - a.t);
      for (const axis of ["x", "y"]) {
        const at = a[axis] + f * (b[axis] - a[axis]);
        bin[axis] += (at - start[axis]) / (row.width * rows.length);
      }
    });
  }
  return { duration, shape };
}

const mean = a => a.reduce((sum, value) => sum + value, 0) / a.length;
const sigma = a => {
  const m = mean(a);
  return Math.sqrt(mean(a.map(v => (v - m) ** 2)));
};
const axes = points => points.length < 2 ? "insufficient repeats" : ["x", "y"].map(k => sigma(points.map(p => p[k])).toFixed(2)).join(" / ");
function report(label, rows) {
  const trials = rows.map(row => replay(row));
  const valid = trials.filter(v => v.hit);
  console.log(`\n${label}: ${rows.length} released, ${valid.length} valid`);
  if (!valid.length) return;
  console.log("Population SD x / y (board mm)");
  console.log("  recorded landing", axes(rows.map(s => s.landing).filter(Boolean)));
  console.log("  current replay  ", axes(valid.map(t => t.hit)));
  console.log("  faults removed  ", axes(valid.map(v => v.clean)));
  for (const hz of [60, 120]) {
    // Remove each trial's mean before pooling variance. Across-trial player
    // variation never enters this estimate of within-path sampling + rule SD.
    const variance = rows.filter((_, i) => trials[i].hit).map(row => {
      const points = Array.from({length: 16}, (_, i) =>
        replay(row, resample(row, hz, (i + 0.5) / 16)).hit).filter(Boolean);
      return ["x","y"].map(k => sigma(points.map(p => p[k])) ** 2);
    });
    console.log(`  ${hz} Hz phase SD  `, [0,1].map(i => Math.sqrt(mean(variance.map(v => v[i]))).toFixed(2)).join(" / "));
  }
}

const fixture = new URL("./fixtures/simulator-flicks.json", import.meta.url);
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const {schema, strokes} = JSON.parse(await readFile(process.argv[2] || fixture, "utf8"));
  if (schema !== 1 || !Array.isArray(strokes)) throw Error("Expected a Dartshift v1 stroke export");
  const groups = new Map();
  for (const [index, row] of strokes.entries()) {
    if (row.outcome === "cancelled") continue;
    // The native QA run used six ordinary, one fast, one soft, one ordinary.
    const label = process.argv[2] ? [row.session, row.profile, row.target, row.width, row.standalone ? "installed" : "browser"].join(" · ")
      : "Simulator command " + (index === 6 ? 85 : index === 7 ? 300 : 150) + " ms";
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(row);
  }
  for (const [label, rows] of groups) report(label, rows);
  if (!process.argv[2]) {
    const ordinary = groups.get("Simulator command 150 ms");
    const first = ordinary[0], original = replay(first), perturbed = samplesOf(first);
    perturbed[1].t += 0.125;
    const changed = replay(first, perturbed);
    const shifted = Math.hypot(original.hit.x - changed.hit.x, original.hit.y - changed.hit.y);
    console.log(`\nFirst interior timestamp +0.125 ms: same reading ${JSON.stringify(original.read) === JSON.stringify(changed.read)}, hit moved ${shifted.toFixed(2)} mm`);

    const train = fitGesture(ordinary.slice(0, -1));
    const heldOut = fitGesture(ordinary.slice(-1));
    const width = ordinary.at(-1).width;
    const rms = Math.sqrt(mean(train.shape.map((p, i) =>
      (p.x - heldOut.shape[i].x) ** 2 + (p.y - heldOut.shape[i].y) ** 2))) * width;
    console.log(`\nFit first six commands, hold out seventh: ${train.duration.toFixed(1)} vs ${heldOut.duration} ms; path RMS ${rms.toFixed(2)} CSS px`);
  }
}
