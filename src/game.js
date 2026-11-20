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

// A match is { mode: "solo" | "duel", hits } for Nine Dart Rush, the original
// shape. 301 adds game: "301". mode is the player count either way.
export function freshMatch(mode, game) {
  return game === "301" ? { game, mode, hits: [] } : { mode, hits: [] };
}

export const x01 = { start: 301, rounds: 10 }; // rounds per player

export function decodeMatch(value) {
  if (
    !value ||
    !["solo", "duel"].includes(value.mode) ||
    !Array.isArray(value.hits) ||
    (value.game !== undefined && value.game !== "301")
  )
    return null;
  if (!value.game && value.hits.length > (value.mode === "solo" ? 9 : 18))
    return null;
  if (
    !value.hits.every(
      (p) =>
        p &&
        Number.isFinite(p.x) &&
        Number.isFinite(p.y) &&
        Math.abs(p.x) <= 210 &&
        Math.abs(p.y) <= 210,
    )
  )
    return null;
  // A 301 save can't hold darts thrown after the match ended.
  return value.game && count301(value).used < value.hits.length ? null : value;
}

export function status(match) {
  if (match.game === "301") return status301(match);
  const players = match.mode === "solo" ? 1 : 2;
  const totals = Array(players).fill(0);
  const visits = [];
  match.hits.forEach((hit, i) => {
    const { points } = scoreAt(hit.x, hit.y);
    totals[Math.floor(i / 3) % players] += points;
    if (i % 3 === 0)
      visits.push({
        player: Math.floor(i / 3) % players,
        round: Math.floor(i / (3 * players)) + 1,
        hits: [],
        scored: 0,
      });
    const v = visits.at(-1);
    v.hits.push(hit);
    v.scored += points;
    v.closed = v.hits.length === 3;
  });
  const complete = match.hits.length === players * 9;
  const index = Math.min(match.hits.length, players * 9 - 1);
  return {
    totals,
    complete,
    player: Math.floor(index / 3) % players,
    round: Math.floor(index / (3 * players)) + 1,
    dart: (index % 3) + 1,
    visits,
  };
}

// 301, double out. A bust ends the visit and restores its starting score.
export const bustReasons = {
  over: "Below zero",
  one: "Left on 1",
  double: "Not a double",
};
const isDouble = ({ points, label }) =>
  points === 50 || label.startsWith("Double");
function count301(match) {
  const players = match.mode === "solo" ? 1 : 2;
  const left = Array(players).fill(x01.start);
  const visits = [];
  let used = 0,
    out = null;
  for (const hit of match.hits) {
    let v = visits.at(-1);
    if (out !== null || (visits.length === x01.rounds * players && v.closed))
      break;
    if (!v || v.closed) {
      const i = visits.length;
      v = {
        player: i % players,
        round: Math.floor(i / players) + 1,
        hits: [],
        start: left[i % players],
        scored: 0,
        bust: null,
        out: false,
        closed: false,
      };
      visits.push(v);
    }
    const dart = scoreAt(hit.x, hit.y),
      after = left[v.player] - dart.points;
    v.hits.push(hit);
    used++;
    v.bust =
      after < 0
        ? "over"
        : after === 1
          ? "one"
          : after === 0 && !isDouble(dart)
            ? "double"
            : null;
    if (v.bust) {
      left[v.player] = v.start;
      v.scored = 0;
      v.closed = true;
      continue;
    }
    left[v.player] = after;
    v.scored += dart.points;
    v.out = after === 0;
    v.closed = v.out || v.hits.length === 3;
    if (v.out) out = v.player;
  }
  return { players, left, visits, used, out };
}
function status301(match) {
  const { players, left, visits, out } = count301(match);
  const last = visits.at(-1);
  const complete =
    out !== null || (visits.length === x01.rounds * players && last.closed);
  // At the round limit the lowest score wins a duel; level scores draw.
  const winner =
    out ??
    (complete && players === 2 && left[0] !== left[1]
      ? Number(left[1] < left[0])
      : null);
  const open = last && !last.closed && last;
  const next = visits.length;
  return {
    totals: left,
    complete,
    out: out !== null,
    winner,
    player: open ? open.player : complete ? last.player : next % players,
    round: open || complete ? last.round : Math.floor(next / players) + 1,
    dart: open ? open.hits.length + 1 : 1,
    visits,
  };
}

// A finishing route for `left` in at most `darts` darts, fewest darts first:
// labels such as ["T20", "D20"], or null when there is none. Set-up darts prefer
// singles, then trebles (high first), then doubles and bulls; finishes prefer
// D20, D16, D18, D12 and so on. A route never passes through a bust.
// ponytail: brute force over 62 beds (≤ 3,844 pairs), fast enough to run per render.
const beds = [];
for (let n = 20; n >= 1; n--) {
  beds.push({ label: String(n), points: n, cost: 1 });
  beds.push({ label: "T" + n, points: 3 * n, cost: 2 + (20 - n) / 100 });
  beds.push({ label: "D" + n, points: 2 * n, cost: 3 + (20 - n) / 100 });
}
beds.push({ label: "25", points: 25, cost: 4 }, { label: "Bull", points: 50, cost: 5 });
const finishOrder = [20, 16, 18, 12, 10, 8, 14, 6, 4, 2, 19, 17, 15, 13, 11, 9, 7, 5, 3, 1];
const finishes = new Map(
  [...finishOrder.map((n) => ["D" + n, 2 * n]), ["Bull", 50]].map(
    ([label, points], i) => [points, { label, cost: i / 100 }],
  ),
);
export function checkout(left, darts = 3) {
  if (!Number.isInteger(left) || left < 2 || left > 170) return null;
  if (finishes.has(left)) return [finishes.get(left).label];
  let best = null;
  const consider = (setup, rest) => {
    const end = finishes.get(rest);
    if (!end) return;
    const cost = setup.reduce((c, b) => c + b.cost, end.cost);
    if (!best || cost < best.cost)
      best = { cost, route: [...setup.map((b) => b.label), end.label] };
  };
  if (darts >= 2) for (const a of beds) consider([a], left - a.points);
  if (!best && darts >= 3)
    for (const a of beds)
      for (const b of beds)
        if (b.points <= a.points) consider([a, b], left - a.points - b.points);
  return best?.route ?? null;
}

export function advance(match, point) {
  if (status(match).complete) return match;
  const hit = { x: point.x, y: point.y };
  if (Number.isFinite(point.pace) && Number.isFinite(point.line)) {
    hit.pace = point.pace;
    hit.line = point.line;
  }
  return { ...match, hits: [...match.hits, hit] };
}

// Saved data. dartshift.save.v1 keeps its original shape and meaning (Nine Dart
// Rush match and best, mute, acknowledged visit), so an older cached copy of the
// app still reads and writes it correctly. 301 lives only in its own key, which
// older copies never touch (DECISIONS.md, "301").
export const saveKeys = { rush: "dartshift.save.v1", x01: "dartshift.301.v1" };
const record = (n, low, high) =>
  Number.isInteger(n) && n >= low && n <= high ? n : null;
const seen = (n, match) =>
  Number.isInteger(n) && n === match?.hits.length ? n : -1;
export function readSaves(v1, v301) {
  const a = v1 && typeof v1 === "object" ? v1 : {},
    b = v301 && typeof v301 === "object" ? v301 : {};
  const rush = decodeMatch(a.match),
    three = decodeMatch(b.match);
  const r = rush && !rush.game ? rush : null,
    t = three?.game === "301" ? three : null;
  return {
    muted: a.muted === true,
    lobby: b.lobby === "301" ? "301" : "rush",
    rush: { match: r, best: record(a.best, 0, 540), acknowledged: seen(a.acknowledged, r) },
    301: { match: t, best: record(b.best, 6, x01.rounds * 3), acknowledged: seen(b.acknowledged, t) },
  };
}
export function writeSaves({ muted, lobby, rush, 301: t }) {
  return {
    [saveKeys.rush]: { match: rush.match, best: rush.best, muted, acknowledged: rush.acknowledged },
    [saveKeys.x01]: { match: t.match, best: t.best, acknowledged: t.acknowledged, lobby },
  };
}

export { swipeLanding } from "./throw.js";
