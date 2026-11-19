// All distances are nominal millimetres from the bull. Positive y points down.
export const sectors = [
  20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5,
];
export const radii = {
  bull: 6.35,
  outerBull: 15.9,
  trebleIn: 99,
  trebleOut: 107,
  doubleIn: 162,
  edge: 170,
};
const epsilon = 1e-9; // Trigonometric roundoff at mathematical wire boundaries.
export function scoreAt(x, y) {
  const r = Math.hypot(x, y);
  if (!Number.isFinite(r) || r > radii.edge + epsilon)
    return { points: 0, label: "Miss" };
  if (r <= radii.bull + epsilon) return { points: 50, label: "Bullseye" };
  if (r <= radii.outerBull + epsilon)
    return { points: 25, label: "Outer bull" };
  const degrees = (Math.atan2(x, -y) * 180) / Math.PI;
  const sector = sectors[Math.floor((degrees + 369 + epsilon) / 18) % 20];
  const triple = r > radii.trebleIn + epsilon && r <= radii.trebleOut + epsilon;
  const multiplier = r > radii.doubleIn + epsilon ? 2 : triple ? 3 : 1;
  return {
    points: sector * multiplier,
    label: ["", "Single", "Double", "Treble"][multiplier] + " " + sector,
  };
}

export function freshMatch(mode) {
  return { mode, hits: [] };
}

export function decodeMatch(value) {
  if (
    !value ||
    !["solo", "duel"].includes(value.mode) ||
    !Array.isArray(value.hits)
  )
    return null;
  if (value.hits.length > (value.mode === "solo" ? 9 : 18)) return null;
  return value.hits.every(
    (p) =>
      p &&
      Number.isFinite(p.x) &&
      Number.isFinite(p.y) &&
      Math.abs(p.x) <= 210 &&
      Math.abs(p.y) <= 210,
  )
    ? value
    : null;
}

export function status(match) {
  const players = match.mode === "solo" ? 1 : 2;
  const totals = Array(players).fill(0);
  match.hits.forEach(({ x, y }, i) => {
    totals[Math.floor(i / 3) % players] += scoreAt(x, y).points;
  });
  const complete = match.hits.length === players * 9;
  const index = Math.min(match.hits.length, players * 9 - 1);
  return {
    totals,
    complete,
    player: Math.floor(index / 3) % players,
    round: Math.floor(index / (3 * players)) + 1,
    dart: (index % 3) + 1,
  };
}

export function advance(match, point) {
  if (status(match).complete) return match;
  return { ...match, hits: [...match.hits, { x: point.x, y: point.y }] };
}

// Distances scale with the board. A straight swipe of 60% reaches the bull.
export function swipeLanding(dx, dy, boardWidth) {
  const rise = -dy;
  if (
    boardWidth <= 0 ||
    rise < boardWidth / 3 ||
    rise < Math.abs(dx) * 0.35
  )
    return null;
  const horizontalUnitsPerPixel = (422 * 1.25) / boardWidth;
  // Leave room below double 3 between the shortest throw and the bull.
  const verticalUnitsPerPixel = 700 / boardWidth;
  const limit = (value) => Math.max(-201, Math.min(201, value));
  return {
    x: limit(dx * horizontalUnitsPerPixel),
    y: limit((boardWidth * 0.6 - rise) * verticalUnitsPerPixel),
  };
}
