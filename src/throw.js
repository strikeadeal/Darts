// Throw feel. Lengths in the input section are fractions of the board width and
// speeds are board widths per second, so a flick feels the same on every screen.
// Pose components are projected fractions of the full tip-to-tail length.
// DECISIONS.md, "The flick", says which input values to try first on a phone.
export const tune = {
  input: {
    // Which strokes throw at all.
    minimumRise: 1 / 3, // upward travel, board widths
    minimumSlope: 0.35, // upward travel per unit of sideways travel
    limit: 201, // board millimetres
    // How the release is read: speed and direction over the last `window` board
    // widths of travel, so a slow stroke is timed over longer and a fast one over
    // less. A pointerup within `liftMs` of the last move is the lift itself; a
    // finger within `stillPx` of where it lifts has stopped, and anything longer
    // than the lift is a pause before letting go.
    window: 0.15,
    liftMs: 20,
    stillPx: 2,
    // Where a clean flick lands. A straight stroke of `bullRise` released at
    // `cruise` hits the bull. Release speed is the main height control.
    cruise: 2.8,
    bullRise: 0.6,
    height: 95, // mm higher for each doubling of release speed
    reach: 40, // mm higher per board width of extra stroke length
    aim: 6.9, // mm sideways per degree the stroke leans from straight up
    flickSteer: 0.25, // share of the line set by the release direction; the rest by the whole stroke
    sensitivity: 0.88, // multiplies height, reach and aim: up is sharper, down more forgiving
    // Stroke quality. Each fault past its free allowance adds a miss of this
    // many mm, in a direction seeded by the stroke itself.
    slow: 0.6,
    fast: 13, // the comfortable release speeds: the board spans about 0.8 to 10
    outside: 40, // mm per doubling of speed outside them
    bend: 2.5, // % of its length the path may bow from straight
    bendCost: 6, // mm per % beyond
    slowdown: 10, // % the speed may fall from its peak before the lift
    slowdownCost: 1.5, // mm per % beyond
  },
  camera: {
    faceHeight: 0.95,
    skew: -0.025, // fixed board-plane projection
    nearDepth: 0.53, // furthest resting grip depth, board plane = 1
    arc: 0.14,
    arcByPace: 0.075, // apex lift in board widths before projection
  },
  hand: {
    pitch: 0.84,
    roll: 0.35, // radians around the shaft
    drawScale: 1.13,
    extendScale: 0.9,
    drawDrop: 0.06,
    steer: 0.6,
    extendPitch: 0.28,
    extendRoll: 0.45,
    reach: 0.23,
    track: 0.34, // tip travel relative to swipe
  },
  flight: {
    duration: 236,
    byPace: 34,
    rollTravel: 2.9, // ms, ms, radians
    length: 90, // dart length at the board in board millimetres
    side: 0.2,
    pitch: -0.27,
    sideByLine: 0.16,
    pitchByPace: 0.14,
    fan: 0.00085, // rays diverge slightly from the eye to off-centre targets
    settleMs: 170,
    flex: 7, // tip-centred settling angle in degrees
    shadowStart: 0.75,
    approachX: 110,
    approachY: 145, // shadow approach in board mm
    shadowX: 0.24,
    shadowY: 0.34, // board-plane light displacement / dart length
  },
  // Pickup. A stroke only starts on the dart: its painted outline at rest, grown
  // by `pad` on every side and never smaller than `min` across (CSS px). iOS asks
  // for 44 px; the painted dart alone is at least 40 px wide on the smallest screen.
  grab: {
    pad: 12,
    min: 48,
  },
};

export const clamp = (n, low, high) => Math.min(high, Math.max(low, n));

// Does a touch at (x, y) pick up a dart painted inside `box` (left, top, width,
// height)? With a second box (where the dart began a camera move this touch
// skipped) it counts anywhere along the way between the two.
export function onDart(x, y, box, seen) {
  const g = tune.grab;
  const left = Math.min(box.left, seen?.left ?? Infinity),
    top = Math.min(box.top, seen?.top ?? Infinity);
  const width = Math.max(box.left + box.width, seen ? seen.left + seen.width : -Infinity) - left,
    height = Math.max(box.top + box.height, seen ? seen.top + seen.height : -Infinity) - top;
  const halfW = Math.max(width + 2 * g.pad, g.min) / 2;
  const halfH = Math.max(height + 2 * g.pad, g.min) / 2;
  return (
    Math.abs(x - left - width / 2) <= halfW &&
    Math.abs(y - top - height / 2) <= halfH
  );
}
const unit = (n) => clamp(n, -1, 1);
const limit = (n) => clamp(n, -tune.input.limit, tune.input.limit);
const degrees = 180 / Math.PI;

// Too short, sideways or downward strokes never throw.
function upward(dx, dy, width) {
  const g = tune.input;
  return (
    [dx, dy, width].every(Number.isFinite) &&
    width > 0 &&
    -dy >= width * g.minimumRise &&
    -dy >= Math.abs(dx) * g.minimumSlope
  );
}
// Where a clean release lands: its line (radians from straight up), stroke
// length (board widths) and release speed (board widths per second).
function aimed(line, length, speed) {
  const g = tune.input,
    k = g.sensitivity;
  return {
    x: k * g.aim * line * degrees,
    y:
      k * g.reach * (g.bullRise - length) -
      k * g.height * Math.log2(Math.max(speed, g.slow / 8) / g.cruise),
  };
}

// A clean, straight stroke of (dx, dy) px released at `speed`: the calibration.
export function swipeLanding(dx, dy, width, speed = tune.input.cruise) {
  if (!upward(dx, dy, width)) return null;
  const p = aimed(Math.atan2(dx, -dy), Math.hypot(dx, dy) / width, speed);
  return { x: limit(p.x), y: limit(p.y) };
}

// The whole stroke is kept, for its shape as well as its release.
// ponytail: capped at 600 samples (2.5 s at 240 Hz); a longer hold keeps its end.
export function addSample(samples, x, y, t) {
  const last = samples.at(-1);
  if (last && t < last.t) return;
  if (last?.t === t) samples.pop();
  samples.push({ x, y, t });
  if (samples.length > 600) samples.shift();
}

// What a stroke did: its line, length and release speed, how far it bowed and
// slowed, and the miss (mm) those faults earn. null if it doesn't throw.
export function readStroke(start, samples, width) {
  const g = tune.input;
  const end = samples.at(-1);
  if (!end || !upward(end.x - start.x, end.y - start.y, width)) return null;
  // The pointerup repeats the last position: the finger lifted somewhere
  // between that last move and the pointerup. Take the middle of the gap (up to
  // `liftMs`), still moving as it last moved, so a 60 Hz and a 120 Hz screen
  // agree. If it had been resting within `stillPx` of there for longer than a
  // lift takes, it stopped where it arrived, and the rest is a pause before
  // letting go: a fault, not a slower release.
  const near = (p, r) => Math.hypot(p.x - end.x, p.y - end.y) < r;
  let j = samples.length - 1;
  while (j > 0 && near(samples[j - 1], 0.5)) j--;
  let k = j;
  while (k > 0 && near(samples[k - 1], g.stillPx)) k--;
  if (end.t - samples[k].t > g.liftMs) j = k;
  const path = samples.slice(0, j + 1),
    moved = path[j];
  // Speed into path[i] over the last `window` widths of travel (or since the
  // touch, if it hasn't gone that far: not a full window). The window's start
  // is interpolated between samples, so 60, 120 and 240 Hz screens agree.
  const need = g.window * width;
  const velocity = (i) => {
    const b = path[i];
    let a = path[0],
      full = false;
    for (let k = i; k > 0; k--) {
      const p = path[k - 1],
        q = path[k];
      const d = Math.hypot(b.x - p.x, b.y - p.y);
      if (d < need) continue;
      const e = Math.hypot(b.x - q.x, b.y - q.y),
        f = (need - e) / (d - e);
      a = { x: q.x + (p.x - q.x) * f, y: q.y + (p.y - q.y) * f, t: q.t + (p.t - q.t) * f };
      full = true;
      break;
    }
    const ms = b.t - a.t;
    if (!(ms > 0)) return { vx: 0, vy: 0, v: 0, full };
    const vx = ((b.x - a.x) * 1000) / (ms * width),
      vy = ((b.y - a.y) * 1000) / (ms * width);
    return { vx, vy, v: Math.hypot(vx, vy), full };
  };
  const gap = end.t - moved.t,
    coast = Math.min(gap, g.liftMs) / 2;
  if (coast > 0) {
    const { vx, vy } = velocity(j),
      k = (coast * width) / 1000;
    const lift = { x: moved.x + vx * k, y: moved.y + vy * k, t: moved.t + coast };
    path.push(lift);
    if (gap > g.liftMs) path.push({ ...lift, t: lift.t + gap - g.liftMs });
  }
  const tip = path.length > j + 1 ? j + 1 : j,
    dx = path[tip].x - start.x,
    dy = path[tip].y - start.y;
  // Bow: the path's furthest point from the straight line, per stroke length.
  // Slowdown: the largest fall in speed from its peak so far, up to the lift
  // (a pause counts in full). Only full windows count, so jitter while the
  // finger rests on the dart never reads as a peak.
  const chord = Math.hypot(dx, dy);
  let bow = 0,
    peak = 0,
    slowdown = 0;
  path.forEach((p, i) => {
    bow = Math.max(bow, Math.abs((p.x - start.x) * dy - (p.y - start.y) * dx));
    const { v, full } = velocity(i);
    if (!full && i < tip) return;
    peak = Math.max(peak, v);
    slowdown = Math.max(slowdown, (peak - v) / Math.max(peak, g.slow));
  });
  const release = velocity(tip);
  const bend = bow / (chord * chord),
    speed = release.v;
  // The line follows the whole stroke, turned part-way towards the release.
  const direction = Math.atan2(dx, -dy),
    off = Math.atan2(release.vx, -release.vy) - direction;
  const turn = speed ? Math.atan2(Math.sin(off), Math.cos(off)) : 0;
  const steer = g.flickSteer * Math.min(1, speed / g.slow) * clamp(turn, -Math.PI / 2, Math.PI / 2);
  const outside = Math.max(0, Math.log2(speed / g.fast), Math.log2(g.slow / Math.max(speed, g.slow / 8)));
  const faults = {
    speed: g.outside * outside,
    bend: g.bendCost * Math.max(0, 100 * bend - g.bend),
    slowdown: g.slowdownCost * Math.max(0, 100 * slowdown - g.slowdown),
  };
  return {
    line: direction + steer,
    length: chord / width,
    speed,
    turn,
    bend,
    slowdown,
    faults,
    miss: faults.speed + faults.bend + faults.slowdown,
  };
}

// A stroke's fingerprint: its shape and timing relative to its own start, so the
// same stroke always earns the same scatter, wherever and whenever it is made.
export function strokeSeed(start, samples, width) {
  let h = 2166136261;
  const mix = (n) => {
    h = Math.imul(h ^ Math.round(n * 16), 16777619);
  };
  mix(width);
  for (const p of samples) {
    mix(p.x - start.x);
    mix(p.y - start.y);
    mix(p.t - samples[0].t);
  }
  return h >>> 0;
}
// A uniform number in [0, 1) from a 32-bit seed (one mulberry32 step).
function uniform(seed) {
  let t = (seed + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// The landing in board mm, plus pace and line for the flight's look. A clean
// stroke lands exactly where its release says; a sloppy one misses by its
// faults' total, in a direction drawn from `seed` (by default the stroke itself).
export function releaseThrow(start, samples, width, seed) {
  const s = readStroke(start, samples, width);
  if (!s) return null;
  const g = tune.input;
  const p = aimed(s.line, s.length, s.speed);
  const a = 2 * Math.PI * uniform(seed ?? strokeSeed(start, samples, width));
  return {
    x: limit(p.x + s.miss * Math.cos(a)),
    y: limit(p.y + s.miss * Math.sin(a)),
    pace: unit(Math.log2(Math.max(s.speed, g.slow / 8) / g.cruise) / Math.log2(g.fast / g.cruise)),
    line: unit((s.speed * Math.sin(s.turn)) / g.cruise),
  };
}

export function boardPosition({ x, y }) {
  return { x: x + y * tune.camera.skew, y: y * tune.camera.faceHeight };
}

// Old saves and keyboard throws have a neutral release. Treat saved pose data
// as optional presentation only, including when older/edited saves lack it.
export function entryPose(hit) {
  const f = tune.flight;
  const pace = Number.isFinite(hit.pace) ? unit(hit.pace) : 0;
  const line = Number.isFinite(hit.line) ? unit(hit.line) : 0;
  return {
    ax: f.side - hit.x * f.fan - line * f.sideByLine,
    ay: f.pitch - hit.y * f.fan + pace * f.pitchByPace,
    roll: tune.hand.roll + f.rollTravel * (1 + pace / 3) + line,
  };
}
