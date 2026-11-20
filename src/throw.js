// Throw feel. Distances in the input section are fractions of the board width.
// Pose components are projected fractions of the full tip-to-tail length.
export const tune = {
  input: {
    minimumRise: 1 / 3,
    minimumSlope: 0.35,
    bullRise: 0.6,
    horizontal: 527.5,
    vertical: 700,
    limit: 201, // board millimetres
    windowMs: 90,
    cruise: 2.8,
    speedRange: 2.8, // widths/second
    lift: 32,
    trim: 16, // maximum velocity corrections, mm
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

// Neutral-speed calibration, also used by the original displacement-only API.
export function swipeLanding(dx, dy, width, trim = 0, lift = 0) {
  const g = tune.input;
  if (
    ![dx, dy, width].every(Number.isFinite) ||
    width <= 0 ||
    -dy < width * g.minimumRise ||
    -dy < Math.abs(dx) * g.minimumSlope
  )
    return null;
  return {
    x: limit((dx / width) * g.horizontal + trim),
    y: limit(((width * g.bullRise + dy) / width) * g.vertical - lift),
  };
}

// Keep one sample on either side of the velocity window's start. Interpolation
// gives the same speed for a straight stroke sampled at 30, 60 or 120 Hz.
export function addSample(samples, x, y, t) {
  const last = samples.at(-1);
  if (last && t < last.t) return;
  if (last?.t === t) samples.pop();
  samples.push({ x, y, t });
  const cutoff = t - tune.input.windowMs;
  while (samples.length > 2 && samples[1].t <= cutoff) samples.shift();
}

export function releaseThrow(start, samples, width) {
  const end = samples.at(-1);
  if (!end) return null;
  const dx = end.x - start.x,
    dy = end.y - start.y;
  if (!(width > 0) || dy >= 0) return null;
  const first = samples[0],
    next = samples[1] || first;
  const ms = Math.min(tune.input.windowMs, end.t - first.t);
  let pace = 0,
    line = 0;
  if (ms > 0) {
    const fraction = (end.t - ms - first.t) / (next.t - first.t || 1);
    const rate = 1000 / (ms * width);
    const vx = (end.x - first.x - fraction * (next.x - first.x)) * rate;
    const vy = (first.y - end.y + fraction * (next.y - first.y)) * rate;
    pace = unit((vy - tune.input.cruise) / tune.input.speedRange);
    line = unit((vx - (vy * dx) / -dy) / tune.input.speedRange);
  }
  const point = swipeLanding(
    dx,
    dy,
    width,
    line * tune.input.trim,
    pace * tune.input.lift,
  );
  return point && { ...point, pace, line };
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
