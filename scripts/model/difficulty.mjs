// A model of human thumb flicks, used to measure how hard the throw is.
// Not part of the build and never imported by the game. See DECISIONS.md, "The flick".
//
//   node scripts/model/difficulty.mjs            before (legacy-throw.mjs) and after (src/throw.js)
//   node scripts/model/difficulty.mjs --quick    fewer samples, about 4× faster
//   node scripts/model/difficulty.mjs --ablate   also each change's contribution
//   node scripts/model/difficulty.mjs --robust   also with every motor noise ×⅔ and ×1.5
//   node scripts/model/difficulty.mjs --legacy   before only (what was measured before tuning)
//
// Everything is seeded, so a run prints the same numbers every time.
import * as legacy from "./legacy-throw.mjs";
import * as current from "../../src/throw.js";
import { scoreAt, checkout, sectors } from "../../src/game.js";

const args = new Set(process.argv.slice(2));
const quick = args.has("--quick");

// ---------------------------------------------------------------- the player
// Assumptions, per throw, at a 340 px board (an iPhone 15/16 in portrait; the
// smallest supported board is 288 px). Motor noise is physical, so it is held in
// CSS px and seconds, not board widths.
export const profiles = {
  // Plays now and then. Knows the controls and has learned where they land.
  casual: {
    length: 9, // px, 1σ: where the finger lifts, relative to where it landed on the dart
    angle: 2.5, // degrees, 1σ: direction of the stroke
    speed: 0.15, // 1σ relative error in peak flick speed (log-normal)
    floor: 0.1, // board widths/s, 1σ absolute speed error (dominates very slow strokes)
    flick: 3.2, // natural peak speed, board widths/s
    tau: [0.62, 0.08], // when the finger lifts: 0.5 = at peak speed, 1 = stopped (mean, 1σ)
    bend: [0.02, 0.025], // bow of the path / its length: habitual, 1σ
    stall: [0.08, 30, 150], // chance of stopping before lifting, and the pause in ms
    tremor: 0.8, // px, 1σ, at 8–12 Hz
  },
  // Has practised: straight, decisive flicks with a repeatable speed.
  skilled: {
    length: 3.5,
    angle: 1.0,
    speed: 0.06,
    floor: 0.05,
    flick: 3.0,
    tau: [0.52, 0.04],
    bend: [0.005, 0.008],
    stall: [0.01, 30, 120],
    tremor: 0.4,
  },
};
const scaled = (p, k) => ({
  ...p,
  length: p.length * k,
  angle: p.angle * k,
  speed: p.speed * k,
  floor: p.floor * k,
  tau: [0.5 + (p.tau[0] - 0.5) * k, p.tau[1] * k],
  bend: [p.bend[0] * k, p.bend[1] * k],
  stall: [Math.min(1, p.stall[0] * k), p.stall[1], p.stall[2]],
  tremor: p.tremor * k,
});
// Touch hardware, the same for everyone: digitiser noise, reported positions in
// thirds of a CSS px (3× screens), the lift reported on the next sample.
const touch = { noise: 0.25, grid: 1 / 3 };
const W = 340;

// ------------------------------------------------------------------- random
export function random(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.normal = () =>
    Math.sqrt(-2 * Math.log(next() || 1e-12)) * Math.cos(2 * Math.PI * next());
  return next;
}
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// ------------------------------------------------------------------ strokes
// A stroke is a minimum-jerk reach from rest, lifted part-way (tau). A decisive
// flick lifts near peak speed; a hesitant one lifts while slowing down. The path
// bows sideways by `bend` × its length, the finger trembles, and the touch
// screen samples it at `hz` with noise. Units: L in board widths, peak in widths/s.
const phi = (t) => t * t * t * (10 - 15 * t + 6 * t * t);
const dphi = (t) => 30 * t * t * (1 - t) * (1 - t);
export function synth(model, i, w, hz, r) {
  const D = i.L / phi(i.tau); // planned reach, of which the finger covers L
  const Tf = ((1.875 * D) / i.peak) * 1000; // ms; peak speed is 1.875 D / Tf
  const lift = i.dwell + i.tau * Tf + i.stall;
  const ux = Math.sin(i.theta),
    uy = -Math.cos(i.theta);
  const tr = i.tremor;
  const at = (t) => {
    const u = phi(clamp((t - i.dwell) / Tf, 0, i.tau)) / phi(i.tau);
    const along = u * i.L * w,
      bow = 4 * i.bend * u * (1 - u) * i.L * w;
    let x = ux * along - uy * bow,
      y = uy * along + ux * bow;
    if (tr)
      for (const [a, f, p, axis] of tr) {
        const d = a * Math.sin(2 * Math.PI * f * t / 1000 + p);
        if (axis) y += d;
        else x += d;
      }
    return [x, y];
  };
  const sense = ([x, y]) =>
    r
      ? [x + touch.noise * r.normal(), y + touch.noise * r.normal()].map(
          (n) => Math.round(n / touch.grid) * touch.grid,
        )
      : [x, y];
  const x0 = 170,
    y0 = 600;
  const [sx, sy] = sense(at(0));
  const start = { x: x0 + sx, y: y0 + sy };
  const samples = [];
  model.addSample(samples, start.x, start.y, 0);
  const dt = 1000 / hz;
  let t = dt,
    last = start;
  for (; t < lift; t += dt) {
    const [x, y] = sense(at(t));
    last = { x: x0 + x, y: y0 + y };
    model.addSample(samples, last.x, last.y, t);
  }
  // The lift arrives as pointerup on the next sample, where the finger last was.
  // Without noise (r null) the plan is traced exactly to the lift instead, so a
  // solver sees a smooth mapping rather than steps at sample boundaries.
  if (!r) {
    const [x, y] = at(lift);
    last = { x: x0 + x, y: y0 + y };
    model.addSample(samples, last.x, last.y, (t = lift));
  }
  model.addSample(samples, last.x, last.y, t + (r ? r() : 0.5));
  return model.releaseThrow(start, samples, w, r ? Math.floor(r() * 2 ** 32) : 1);
}

// One throw's motor plan with this player's noise.
function noisy(plan, p, w, r) {
  const L = plan.L + (p.length / w) * r.normal();
  const peak = Math.max(0.05, plan.peak * Math.exp(p.speed * r.normal()) + p.floor * r.normal());
  const stalled = r() < p.stall[0],
    slide = plan.style === "slide";
  const tremor = p.tremor
    ? [0, 1].flatMap((axis) =>
        [0, 1].map(() => [p.tremor * 0.7 * r.normal(), 8 + 4 * r(), 2 * Math.PI * r(), axis]),
      )
    : null;
  return {
    L: Math.max(0.05, L),
    theta: plan.theta + (p.angle * Math.PI / 180) * r.normal(),
    peak,
    tau: slide ? 0.97 : clamp(p.tau[0] + p.tau[1] * r.normal(), 0.3, 0.97),
    bend: p.bend[0] + p.bend[1] * r.normal(),
    stall: slide ? 100 + 80 * r() : stalled ? p.stall[1] + (p.stall[2] - p.stall[1]) * r() : 0,
    dwell: 20 + 60 * r(),
    tremor,
  };
}
// "slide": drag to a spot, stop, then lift, which aims a pointer rather than throws.
const calm = (plan, p) => {
  const slide = plan.style === "slide";
  return { ...plan, tau: slide ? 0.97 : p.tau[0], bend: p.bend[0], stall: slide ? 140 : 0, dwell: 40, tremor: null };
};

// ------------------------------------------------------------------ aiming
// The player has learned the throw: for a target, find the plan whose average
// landing on their own phone is the target. Two ways to aim, and the player uses
// whichever lands more often: keep a natural speed and vary the length, keep a
// length and vary the speed, or slide to a spot and stop before lifting.
export function solve(model, target, plan, free, p, w) {
  let th = Math.atan2(target.x, 330),
    q = plan[free];
  const lo = free === "L" ? 0.34 : 0.2,
    hi = free === "L" ? 1.3 : 30;
  const land = (theta, v) => synth(model, calm({ ...plan, theta, [free]: v }, p), w, 1000, null);
  for (let k = 0; k < 40; k++) {
    const a = land(th, q);
    if (!a) {
      q = clamp(free === "L" ? q + 0.05 : q, lo, hi);
      if (free !== "L") return null;
      continue;
    }
    const ex = a.x - target.x,
      ey = a.y - target.y;
    if (Math.hypot(ex, ey) < 0.02) return { ...plan, theta: th, [free]: q };
    const h = 1e-3,
      hq = free === "L" ? 1e-3 : q * 1e-3;
    const b = land(th + h, q),
      c = land(th, q + hq);
    if (!b || !c) return null;
    const j11 = (b.x - a.x) / h,
      j12 = (c.x - a.x) / hq,
      j21 = (b.y - a.y) / h,
      j22 = (c.y - a.y) / hq;
    const det = j11 * j22 - j12 * j21;
    if (!det) return null;
    const dth = (ex * j22 - ey * j12) / det,
      dq = (ey * j11 - ex * j21) / det;
    th = clamp(th - clamp(dth, -0.2, 0.2), -1.2, 1.2);
    q = clamp(q - clamp(dq, -0.3 * (hi - lo), 0.3 * (hi - lo)), lo, hi);
  }
  return null;
}

// Average landing of a plan on this phone (random sample phase, no motor noise),
// used once to cancel the device's own bias, as a player would by practice.
function deviceBias(model, plan, p, w, hz, r) {
  let sx = 0,
    sy = 0,
    n = 0;
  for (let k = 0; k < 64; k++) {
    const a = synth(model, { ...calm(plan, p), dwell: 20 + 60 * r() }, w, hz, r);
    if (a) (sx += a.x), (sy += a.y), n++;
  }
  return n ? { x: sx / n, y: sy / n } : null;
}

export function learnedPlan(model, target, p, w, hz, r) {
  const options = [
    { free: "L", plan: { peak: p.flick, L: 0.6 } },
    { free: "L", plan: { peak: 1.5, L: 0.6, style: "slide" } },
  ];
  for (const L of [0.45, 0.55, 0.65, 0.75, 0.9]) options.push({ free: "peak", plan: { L, peak: 3 } });
  const plans = [];
  for (const { free, plan } of options) {
    let s = solve(model, target, plan, free, p, w);
    if (!s) continue;
    const b = deviceBias(model, s, p, w, hz, r);
    if (!b) continue;
    const s2 = solve(model, { x: 2 * target.x - b.x, y: 2 * target.y - b.y }, s, free, p, w);
    plans.push(s2 || s);
  }
  return plans;
}

// --------------------------------------------------------------------- beds
const deg = (n) => sectors.indexOf(n) * 18 * (Math.PI / 180);
const polar = (a, rr) => ({ x: Math.sin(a) * rr, y: -Math.cos(a) * rr });
function bedTargets(label) {
  if (label === "Bull") return [{ x: 0, y: 0 }];
  if (label === "25") return [polar(0, 11)];
  const n = Number(label.replace(/^[TD]/, ""));
  if (label[0] === "T") return [polar(deg(n), 103)];
  if (label[0] === "D") return [polar(deg(n), 166)];
  return [polar(deg(n), 57), polar(deg(n), 134)]; // inner and outer single
}
const bedOf = (h) => {
  const s = scoreAt(h.x, h.y);
  if (s.points === 50) return "Bull";
  if (s.points === 25) return "25";
  if (!s.points) return "Miss";
  const [kind, n] = s.label.split(" ");
  return ({ Treble: "T", Double: "D", Single: "" })[kind] + n;
};

// ------------------------------------------------------------------ a player
// A player on one phone (model, board width, sample rate) who has learned the
// throw for every bed they aim at. aim(label) gives the plan that hits it most.
export function player(model, p, { w = W, hz = 60, seed = 1 } = {}) {
  const r = random(seed);
  const cache = new Map();
  const trials = quick ? 150 : 400;
  function aim(label) {
    if (cache.has(label)) return cache.get(label);
    let best = null;
    for (const t of bedTargets(label))
      for (const plan of learnedPlan(model, t, p, w, hz, r)) {
        let hits = 0;
        for (let k = 0; k < trials; k++) {
          const h = synth(model, noisy(plan, p, w, r), w, hz, r);
          if (h && bedOf(h) === label) hits++;
        }
        if (!best || hits > best.hits) best = { plan, hits };
      }
    cache.set(label, best?.plan || null);
    return best?.plan || null;
  }
  // A dart aimed at `label`: the landing, or null if the stroke was rejected.
  const dart = (label) => {
    const plan = aim(label);
    if (!plan) return { x: 0, y: 300 };
    for (let k = 0; k < 5; k++) {
      const h = synth(model, noisy(plan, p, w, r), w, hz, r);
      if (h) return h;
    }
    return { x: 0, y: 300 };
  };
  return { aim, dart, r };
}

// ------------------------------------------------------------------ metrics
function rate(pl, label, n) {
  let k = 0;
  for (let i = 0; i < n; i++) if (bedOf(pl.dart(label)) === label) k++;
  return k / n;
}
function points(pl, label, n) {
  let s = 0;
  for (let i = 0; i < n; i++) {
    const h = pl.dart(label);
    s += scoreAt(h.x, h.y).points;
  }
  return s / n;
}
// Nine Dart Rush: the player aims every dart at whichever of these scores most.
const scoring = ["T20", "T19", "Bull", "20"];
function rush(pl, n) {
  let best = { label: null, mean: -1 };
  for (const label of scoring) {
    const mean = points(pl, label, n);
    if (mean > best.mean) best = { label, mean };
  }
  return { ...best, total: 9 * best.mean };
}
// 301, double out, played without the ten-round limit so a slow finish still
// counts (the limit is reported as the share finished within 30 darts).
function x01(pl, games, scoringLabel, cap = 300) {
  const darts = [];
  for (let g = 0; g < games; g++) {
    let left = 301,
      n = 0;
    while (n < cap) {
      const start = left;
      let done = false;
      for (let d = 0; d < 3 && n < cap; d++) {
        const route = checkout(left, 3 - d) || checkout(left, 3);
        const label = route ? route[0] : scoringLabel;
        const h = pl.dart(label);
        n++;
        const s = scoreAt(h.x, h.y),
          after = left - s.points;
        const double = s.points === 50 || s.label.startsWith("Double");
        if (after < 0 || after === 1 || (after === 0 && !double)) {
          left = start;
          break;
        }
        left = after;
        if (!left) {
          done = true;
          break;
        }
      }
      if (done) break;
    }
    darts.push(n);
  }
  darts.sort((a, b) => a - b);
  const mean = darts.reduce((a, b) => a + b, 0) / games;
  return {
    mean,
    median: darts[Math.floor(games / 2)],
    within30: darts.filter((d) => d <= 30).length / games,
    capped: darts.filter((d) => d >= cap).length / games,
  };
}

export function measure(model, p, opts = {}) {
  const n = quick ? 1500 : 5000;
  const out = {};
  for (const hz of [60, 120]) {
    const pl = player(model, p, { ...opts, hz, seed: (opts.seed || 1) + hz });
    const m = {
      bull: rate(pl, "Bull", n),
      t20: rate(pl, "T20", n),
      d20: rate(pl, "D20", n),
      d16: rate(pl, "D16", n),
    };
    const nr = rush(pl, quick ? 800 : 3000);
    m.rush = nr.total;
    m.rushAim = nr.label;
    m.style = pl.aim("T20")?.style || (pl.aim("T20")?.L === 0.6 ? "flick, speed" : "flick");
    Object.assign(m, Object.fromEntries(Object.entries(x01(pl, quick ? 300 : 1200, nr.label)).map(([k, v]) => ["x01" + k, v])));
    out[hz] = m;
  }
  const avg = {};
  for (const k of Object.keys(out[60]))
    avg[k] = typeof out[60][k] === "number" ? (out[60][k] + out[120][k]) / 2 : out[60][k] + "/" + out[120][k];
  return { avg, ...out };
}

// ------------------------------------------------------ first-time players
// A first-time player follows the How to play text with no idea of the mapping:
// a natural flick speed and length drawn from wide spreads, aimed at the bull,
// then corrects by part of each miss (in whichever control the text says sets
// height). Reports how many of the first darts land on the board.
export function novices(model, p, control, { count = quick ? 300 : 1000, darts = 15, hz = 60, w = W } = {}) {
  const r = random(77);
  const on = Array(darts).fill(0),
    dist = Array.from({ length: darts }, () => []);
  for (let k = 0; k < count; k++) {
    const plan = {
      L: clamp(0.58 + 0.1 * r.normal(), 0.36, 1),
      peak: 3.2 * Math.exp(0.45 * r.normal()),
      theta: (3 * Math.PI / 180) * r.normal(),
    };
    for (let d = 0; d < darts; d++) {
      let h = null;
      for (let tries = 0; !h && tries < 5; tries++) h = synth(model, noisy(plan, p, w, r), w, hz, r);
      h ||= { x: 0, y: 300 };
      if (Math.hypot(h.x, h.y) <= 170) on[d]++;
      dist[d].push(Math.hypot(h.x, h.y));
      // Feedback: how far, and which way. Correct half of it.
      const base = synth(model, calm(plan, p), w, 1000, null);
      const bump = control === "L" ? { L: plan.L + 0.01 } : { peak: plan.peak * 1.01 };
      const moved = base && synth(model, calm({ ...plan, ...bump }, p), w, 1000, null);
      if (moved && moved.y !== base.y) {
        const step = (-0.5 * clamp(h.y, -250, 250)) / (moved.y - base.y);
        if (control === "L") plan.L = clamp(plan.L + 0.01 * step, 0.36, 1.1);
        else plan.peak = clamp(plan.peak * Math.pow(1.01, step), 0.4, 15);
      }
      plan.theta -= (0.5 * clamp(h.x, -250, 250)) / 330;
    }
  }
  const median = (a) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
  return { on: on.map((v) => v / count), median: dist.map(median) };
}

// ---------------------------------------------------- touch noise on its own
// The same clean plan thrown again and again with no motor noise: only the
// digitiser, the sample phase and the lift's sample decide the spread.
export function touchSpread(model, p, labels = ["Bull", "T20", "D20", "D11"], w = W) {
  const rows = [];
  for (const label of labels) {
    const pl60 = player(model, p, { hz: 60, seed: 9 });
    const plan = pl60.aim(label);
    const res = {};
    for (const hz of [60, 120]) {
      const r = random(hz);
      const xs = [],
        ys = [];
      for (let k = 0; k < 2000; k++) {
        const h = synth(model, { ...calm(plan, p), dwell: 20 + 60 * r() }, w, hz, r);
        if (h) xs.push(h.x), ys.push(h.y);
      }
      const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
      const sd = (a) => Math.sqrt(mean(a.map((v) => (v - mean(a)) ** 2)));
      res[hz] = { mx: mean(xs), my: mean(ys), sx: sd(xs), sy: sd(ys) };
    }
    rows.push({ label, ...res });
  }
  return rows;
}

// ------------------------------------------------------------------ report
const pct = (v) => (100 * v).toFixed(1) + "%";
const row = (name, m) =>
  `| ${name} | ${pct(m.bull)} | ${pct(m.t20)} | ${pct(m.d20)} | ${pct(m.d16)} | ${m.rush.toFixed(0)} (${m.rushAim}) | ${m.x01mean.toFixed(1)} / ${m.x01median} | ${pct(m.x01within30)} | ${m.style} |`;
const head =
  "| Model · profile | Bull | T20 | D20 | D16 | Nine Dart Rush | 301 darts (mean / median) | 301 within 10 rounds | T20 aimed by (60/120 Hz) |\n|---|---|---|---|---|---|---|---|---|";

export const models = {
  before: { name: "before", ...legacy },
  after: { name: "after", ...current },
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const t0 = Date.now();
  const list = args.has("--legacy") ? ["before"] : ["before", "after"];
  console.log(head);
  const results = {};
  for (const m of list)
    for (const [pname, p] of Object.entries(profiles)) {
      const res = measure(models[m], p);
      results[m + " " + pname] = res;
      console.log(row(`${m} · ${pname}`, res.avg));
    }
  console.log("\nBy sample rate (60 Hz | 120 Hz):");
  for (const [k, res] of Object.entries(results))
    console.log(`  ${k}: T20 ${pct(res[60].t20)} | ${pct(res[120].t20)}, rush ${res[60].rush.toFixed(0)} | ${res[120].rush.toFixed(0)}, 301 ${res[60].x01mean.toFixed(1)} | ${res[120].x01mean.toFixed(1)}`);
  for (const m of list) {
    const n = novices(models[m], profiles.casual, m === "before" ? "L" : "peak");
    console.log(`\nFirst-time players, ${m}: on the board, darts 1–15: ${n.on.map((v) => (100 * v).toFixed(0)).join(" ")} %`);
    console.log(`  median distance from the bull, mm: ${n.median.map((v) => v.toFixed(0)).join(" ")}`);
  }
  for (const m of list) {
    console.log(`\nTouch noise alone, ${m} (skilled plan; mean shift 60→120 Hz and 1σ in mm):`);
    for (const t of touchSpread(models[m], profiles.skilled))
      console.log(
        `  ${t.label}: shift x ${(t[120].mx - t[60].mx).toFixed(2)} y ${(t[120].my - t[60].my).toFixed(2)} · 60 Hz σ ${t[60].sx.toFixed(2)}, ${t[60].sy.toFixed(2)} · 120 Hz σ ${t[120].sx.toFixed(2)}, ${t[120].sy.toFixed(2)}`,
      );
  }
  if (args.has("--robust")) {
    console.log("\nEvery motor noise ×⅔ and ×1.5:\n" + head);
    for (const k of [2 / 3, 1.5])
      for (const m of list)
        for (const [pname, p] of Object.entries(profiles))
          console.log(row(`${m} · ${pname} ×${k.toFixed(2)}`, measure(models[m], scaled(p, k)).avg));
  }
  if (args.has("--ablate") && !args.has("--legacy")) {
    const { ablations } = await import("./ablate.mjs");
    console.log("\nEach change's contribution:\n" + head);
    for (const [name, apply] of ablations) {
      const undo = apply(current.tune);
      for (const [pname, p] of Object.entries(profiles))
        console.log(row(`${name} · ${pname}`, measure(models.after, p).avg));
      undo();
    }
  }
  console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
