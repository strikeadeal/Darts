// The release model as shipped before the flick (main at c83ebb6), copied verbatim
// from src/throw.js so scripts/model/difficulty.mjs can measure "before" without
// git history. Not part of the build, never imported by the game.
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
};
const clamp = (n, low, high) => Math.min(high, Math.max(low, n));
const unit = (n) => clamp(n, -1, 1);
const limit = (n) => clamp(n, -tune.input.limit, tune.input.limit);

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
