// A model of human thumb flicks, used to measure how hard the throw is.
// Not part of the build and never imported by the game. See DECISIONS.md, "The flick".
//
//   node scripts/model/difficulty.mjs            before (legacy-throw.mjs) and after (src/throw.js)
//   node scripts/model/difficulty.mjs --quick    fewer samples, about 4× faster
//   node scripts/model/difficulty.mjs --ablate   also each change's contribution
//   node scripts/model/difficulty.mjs --robust   also with every motor noise ×⅔ and ×1.5
//   node scripts/model/difficulty.mjs --legacy   before only (what was measured before tuning)
//   node scripts/model/difficulty.mjs --after    after only
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
    flick: 4.5, // natural peak speed, board widths/s (~250 mm/s: Bevan & Fraser 2016, secondhand)
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
    flick: 4.3,
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
  let last = start;
  const move = (t) => {
    const [x, y] = sense(at(t));
    last = { x: x0 + x, y: y0 + y };
    model.addSample(samples, last.x, last.y, t);
  };
  if (r) {
    // The screen samples at `hz` from the touch, and reports the lift as
    // pointerup on the next sample, where the finger last was.
    const dt = 1000 / hz;
    let t = dt;
    for (; t < lift; t += dt) move(t);
    model.addSample(samples, last.x, last.y, t + r());
  } else {
    // Without noise the plan is traced at 240 Hz with a sample exactly at the
    // lift, so a solver sees a smooth mapping rather than steps between samples.
    const dt = 1000 / 240;
    for (let k = Math.floor(lift / dt); k >= 0; k--) if (lift - k * dt > 0) move(lift - k * dt);
    model.addSample(samples, last.x, last.y, lift + 2);
  }
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
// A player can learn where a stroke lands on average, never which way a sloppy
// stroke's scatter falls, so aiming uses the landing without it.
const costs = ["outside", "bendCost", "pauseCost"];
function clean(model, fn) {
  const t = model.tune?.input;
  if (!t || !(costs[0] in t)) return fn();
  const saved = costs.map((k) => t[k]);
  costs.forEach((k) => (t[k] = 0));
  try {
    return fn();
  } finally {
    costs.forEach((k, i) => (t[k] = saved[i]));
  }
}

// The player has learned the throw: for a target, find the plan whose average
// landing on their own phone is the target. Three ways to aim, and the player uses
// whichever lands more often: keep a natural speed and vary the length, keep a
// length and vary the speed, or slide to a spot and stop before lifting.
// Newton's method on (direction, length) or (direction, log speed), with a
// backtracking step so a trial that lands off the board (clamped) is not trusted.
export function solve(model, target, plan, free, p, w) {
  const log = free !== "L";
  const lo = log ? Math.log(0.2) : 0.34,
    hi = log ? Math.log(30) : 1.1; // no stroke longer than a comfortable reach
  const land = (theta, u) =>
    clean(model, () => synth(model, calm({ ...plan, theta, [free]: log ? Math.exp(u) : u }, p), w, 1000, null));
  const off = (a) => !a || Math.abs(a.x) > 200 || Math.abs(a.y) > 200;
  let th = 0,
    u = log ? Math.log(plan[free]) : plan[free];
  let a = land(th, u);
  for (let k = 0; k < 60; k++) {
    if (off(a)) return null;
    const ex = a.x - target.x,
      ey = a.y - target.y,
      err = Math.hypot(ex, ey);
    if (err < 0.02) return { ...plan, theta: th, [free]: log ? Math.exp(u) : u };
    const h = 1e-3;
    const b = land(th + h, u),
      c = land(th, u + h);
    if (off(b) || off(c)) return null;
    const j11 = (b.x - a.x) / h,
      j12 = (c.x - a.x) / h,
      j21 = (b.y - a.y) / h,
      j22 = (c.y - a.y) / h;
    const det = j11 * j22 - j12 * j21;
    if (!det) return null;
    let dth = (ex * j22 - ey * j12) / det,
      du = (ey * j11 - ex * j21) / det;
    const big = Math.max(Math.abs(dth) / 0.2, Math.abs(du) / (log ? 0.5 : 0.1), 1);
    dth /= big;
    du /= big;
    let next = null;
    for (let s = 1; s > 1 / 64; s /= 2) {
      const t2 = clamp(th - s * dth, -1.2, 1.2),
        u2 = clamp(u - s * du, lo, hi);
      const n = land(t2, u2);
      if (!off(n) && Math.hypot(n.x - target.x, n.y - target.y) < err) {
        next = [t2, u2, n];
        break;
      }
    }
    if (!next) return null;
    [th, u, a] = next;
  }
  return null;
}

// Average landing of a plan on this phone (random sample phase, no motor noise),
// used once to cancel the device's own bias, as a player would by practice.
function deviceBias(model, plan, p, w, hz, r) {
  let sx = 0,
    sy = 0,
    n = 0;
  clean(model, () => {
    for (let k = 0; k < 64; k++) {
      const a = synth(model, { ...calm(plan, p), dwell: 20 + 60 * r() }, w, hz, r);
      if (a) (sx += a.x), (sy += a.y), n++;
    }
  });
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
      peak: 4.5 * Math.exp(0.45 * r.normal()),
      theta: (3 * Math.PI / 180) * r.normal(),
    };
    for (let d = 0; d < darts; d++) {
      let h = null;
      for (let tries = 0; !h && tries < 5; tries++) h = synth(model, noisy(plan, p, w, r), w, hz, r);
      h ||= { x: 0, y: 300 };
      if (Math.hypot(h.x, h.y) <= 170) on[d]++;
      dist[d].push(Math.hypot(h.x, h.y));
      // Feedback: how far, and which way. Correct half of it.
      const base = clean(model, () => synth(model, calm(plan, p), w, 1000, null));
      const bump = control === "L" ? { L: plan.L + 0.01 } : { peak: plan.peak * 1.01 };
      const moved = base && clean(model, () => synth(model, calm({ ...plan, ...bump }, p), w, 1000, null));
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

// ---------------------------------------- clean strokes and pointer aiming
// For the flick only: how often each profile's strokes aimed at T20 earn no miss
// at all, and the typical miss of the rest; and how well slide-and-stop does.
export function cleanliness(model, p, { hz = 60, n = quick ? 1000 : 4000 } = {}) {
  let read = null;
  const spy = { ...model, releaseThrow: (s, samples, w, seed) => ((read = model.readStroke(s, samples, w)), model.releaseThrow(s, samples, w, seed)) };
  const pl = player(spy, p, { hz, seed: 21 }),
    plan = pl.aim("T20"),
    r = random(22);
  const misses = [];
  for (let k = 0; k < n; k++) if (synth(spy, noisy(plan, p, W, r), W, hz, r) && read) misses.push(read.miss);
  misses.sort((a, b) => a - b);
  const faulted = misses.filter((m) => m > 0);
  return { clean: 1 - faulted.length / misses.length, median: faulted[Math.floor(faulted.length / 2)] || 0 };
}
export function slideAndStop(model, p, { hz = 60, n = quick ? 1000 : 4000 } = {}) {
  const r = random(23);
  const plan = solve(model, { x: 0, y: -103 }, { peak: 1.5, L: 0.6, style: "slide" }, "L", p, W);
  const top = clean(model, () => synth(model, calm({ peak: 1.5, L: 1.1, theta: 0, style: "slide" }, p), W, 1000, null));
  if (!plan) return { t20: 0, highest: top?.y ?? null };
  let hits = 0;
  for (let k = 0; k < n; k++) {
    const h = synth(model, noisy(plan, p, W, r), W, hz, r);
    if (h && bedOf(h) === "T20") hits++;
  }
  return { t20: hits / n, highest: top?.y ?? null };
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
  const list = args.has("--legacy") ? ["before"] : args.has("--after") ? ["after"] : ["before", "after"];
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
  if (list.includes("after"))
    for (const [pname, p] of Object.entries(profiles)) {
      const c = cleanliness(models.after, p),
        sl = slideAndStop(models.after, p);
      console.log(
        `\nAfter, ${pname}: ${pct(c.clean)} of T20 strokes earn no miss (median miss of the rest ${c.median.toFixed(1)} mm). ` +
          `Slide and stop: T20 ${pct(sl.t20)}; at the longest slide it lands at y ${sl.highest?.toFixed(0)} mm.`,
      );
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
