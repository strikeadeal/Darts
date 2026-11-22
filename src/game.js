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
// shape. 301 adds game: "301". mode is the player count either way. A 301 match
// started since "First to zero" (DECISIONS.md) also has finish: "any"; one
// without it was saved under double out and replays under double out. A duel
// rematch adds first: 1 when "Player 2" throws first. The data never changes
// order (index 0 always throws first); only the names and colours swap, so an
// older copy that ignores the field still scores the match correctly.
export function freshMatch(mode, game, first = 0) {
  const match =
    game === "301" ? { game, mode, finish: "any", hits: [] } : rules[game] ? { game, mode, hits: [] } : { mode, hits: [] };
  if (first === 1 && mode === "duel") match.first = 1;
  return match;
}

export const x01 = {
  start: 301,
  rounds: 10, // per player
  // The board highlights the finishing bed while the player about to throw has
  // fewer than this left (finishTarget). The one place to change it.
  highlightBelow: 20,
};
// A 301 match saved before first to zero, played to its end under double out.
export const doubleOut = (match) => match?.game === "301" && match.finish !== "any";

export function decodeMatch(value) {
  if (
    !value ||
    !["solo", "duel"].includes(value.mode) ||
    !Array.isArray(value.hits) ||
    (value.game !== undefined && value.game !== "301" && !rules[value.game])
  )
    return null;
  // Only a duel can swap who is called Player 1; anything else is dropped.
  if ("first" in value && !(value.mode === "duel" && value.first === 1)) {
    value = { ...value };
    delete value.first;
  }
  // Only a 301 match can be first to zero; any other value is dropped.
  if ("finish" in value && !(value.game === "301" && value.finish === "any")) {
    value = { ...value };
    delete value.finish;
  }
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
  // A 301 save, or one of the games below, can't hold darts thrown after the match ended.
  if (rules[value.game]) return replay(value).used < value.hits.length ? null : value;
  return value.game && count301(value).used < value.hits.length ? null : value;
}

export function status(match) {
  if (match.game === "301") return status301(match);
  if (rules[match.game]) return statusOf(match);
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

// 301, first to exactly zero on any bed. Going below zero is a bust: it ends the
// visit and restores its starting score. A double-out match (doubleOut) also
// busts on 1 left, or on zero off anything but a double or the bull.
// ponytail: "one" and "double" only replay double-out saves; delete them, isDouble
// and checkoutDouble once no such save can be in progress.
export const bustReasons = {
  over: "Below zero",
  one: "Left on 1",
  double: "Not a double",
};
const isDouble = ({ points, label }) =>
  points === 50 || label.startsWith("Double");
function count301(match) {
  const strict = doubleOut(match);
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
        : !strict
          ? null
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

// Double out (doubleOut matches only): a finishing route for `left` in at most
// `darts` darts, fewest darts first:
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
function checkoutDouble(left, darts) {
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

// A finishing route for `left` in at most `darts` darts, or null: labels such as
// ["T20", "D20"], highest-scoring dart first. Fewest darts first, then the
// biggest beds: singles, the outer bull, doubles, trebles, the bull (by area:
// about 3,800, 670, 420, 260 and 130 mm²). Equal routes go to the higher first
// dart. Any route that adds up can't bust: nothing below zero is ever left.
// Pass true for a double-out match's routes.
const anyBeds = [...beds]
  .map((b) => ({ ...b, cost: b.label === "25" ? 2 : b.label === "Bull" ? 5 : { T: 4, D: 3 }[b.label[0]] ?? 1 }))
  .sort((a, b) => b.points - a.points || a.cost - b.cost);
const oneDart = new Map();
for (const b of [...anyBeds].reverse()) if (!(oneDart.get(b.points)?.cost <= b.cost)) oneDart.set(b.points, b);
function cheapest(left, darts, from = 0) {
  const one = oneDart.get(left);
  if (one && anyBeds.indexOf(one) >= from) return { cost: one.cost, route: [one.label] };
  if (darts < 2) return null;
  let best = null;
  // ponytail: brute force, non-increasing scores (≤ 41,664 triples), well under 1 ms.
  for (let i = from; i < anyBeds.length; i++) {
    const a = anyBeds[i];
    if (a.points >= left) continue;
    const rest = cheapest(left - a.points, darts - 1, i);
    if (!rest) continue;
    const next = { cost: a.cost + rest.cost, route: [a.label, ...rest.route] };
    if (!best || next.route.length < best.route.length || (next.route.length === best.route.length && next.cost < best.cost))
      best = next;
  }
  return best;
}
export function checkout(left, darts = 3, double = false) {
  if (double) return checkoutDouble(left, darts);
  if (!Number.isInteger(left) || left < 1 || left > 180 || !(darts >= 1)) return null;
  return cheapest(left, Math.min(3, darts))?.route ?? null;
}

// What the board highlights (DECISIONS.md, "First to zero"): the bed that
// finishes for the player about to throw, as a checkout() label, or null. Only
// while fewer than x01.highlightBelow are left, and only when one dart finishes.
// It is the first slot of the scoreboard's route and the spoken checkout, so the
// three always agree. Nothing between visits (the card is up and the slots are
// closed), after the match, or in a double-out match.
export function finishTarget(match, acknowledged) {
  if (match?.game !== "301" || doubleOut(match)) return null;
  const s = status(match),
    last = s.visits.at(-1);
  if (s.complete || (last?.closed && acknowledged !== match.hits.length)) return null;
  const left = s.totals[s.player];
  if (!(left < x01.highlightBelow)) return null;
  const route = checkout(left, 4 - s.dart);
  return route?.length === 1 ? route[0] : null;
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

// Cricket, Around the Clock and Shanghai (DECISIONS.md, "Three more games").
// Each is replayed from its hits like 301: three darts a visit, players taking
// turns, a round limit, and a dart rule that may end the match at once.
// What a dart hit, for these games: the number (25 for either bull) and how
// many times it counts (single 1, double 2, treble 3, outer bull 1, bull 2).
export function bedOf(hit) {
  const { points, label } = scoreAt(hit.x, hit.y);
  if (points === 50) return { n: 25, times: 2 };
  if (points === 25) return { n: 25, times: 1 };
  if (!points) return { n: 0, times: 0 };
  const [kind, n] = label.split(" ");
  return { n: Number(n), times: { Single: 1, Double: 2, Treble: 3 }[kind] };
}
export const cricketTargets = [20, 19, 18, 17, 16, 15, 25];
const other = (p, players) => (players === 2 ? 1 - p : null);
export const rules = {
  // Close 15–20 and the bull with three marks each; marks past three score
  // while an opponent still has the target open. Solo has no points.
  cricket: {
    rounds: 20,
    start: (players) => ({
      marks: Array.from({ length: players }, () => Object.fromEntries(cricketTargets.map((t) => [t, 0]))),
      points: Array(players).fill(0),
    }),
    dart(st, p, { n, times }, v) {
      if (!cricketTargets.includes(n)) return;
      const o = other(p, st.points.length);
      for (let k = 0; k < times; k++) {
        if (st.marks[p][n] < 3) {
          if (++st.marks[p][n] === 3) v.closes = [...(v.closes || []), n];
        } else if (o !== null && st.marks[o][n] < 3) st.points[p] += n;
        else continue;
        v.scored++;
      }
      const closed = cricketTargets.every((t) => st.marks[p][t] === 3);
      if (closed && (o === null || st.points[p] >= st.points[o])) return "won";
    },
    record: { fewer: true, low: 8, high: 60 }, // solo: fewest darts to close all seven
    totals: (st) => st.points,
    // At the limit: more points, then more marks.
    rank: (st, p) => [st.points[p], cricketTargets.reduce((m, t) => m + st.marks[p][t], 0)],
  },
  // 1 to 20 in order, then the bull (outer or inner). Any bed of the number counts.
  clock: {
    rounds: 15,
    start: (players) => ({ at: Array(players).fill(0) }),
    dart(st, p, { n }, v) {
      if (n !== (st.at[p] < 20 ? st.at[p] + 1 : 25)) return;
      st.at[p]++;
      v.scored++;
      if (st.at[p] === 21) return "won";
    },
    record: { fewer: true, low: 21, high: 45 }, // solo: fewest darts round the board
    totals: (st) => st.at, // targets hit, 0–21
    rank: (st, p) => [st.at[p]],
  },
  // Round n scores only n: single, double, treble. Single, double and treble of
  // n in one visit is a Shanghai, which wins a duel on the spot.
  shanghai: {
    rounds: 7,
    start: (players) => ({ points: Array(players).fill(0) }),
    dart(st, p, { n, times }, v) {
      if (n !== v.round) return;
      st.points[p] += n * times;
      v.scored += n * times;
      v.parts = [...new Set([...(v.parts || []), times])];
      if (v.parts.length === 3) {
        v.shanghai = true;
        if (st.points.length === 2) return "won";
      }
    },
    record: { fewer: false, low: 0, high: 252 }, // solo: highest score
    totals: (st) => st.points,
    rank: (st, p) => [st.points[p]],
  },
};
function replay(match) {
  const g = rules[match.game];
  const players = match.mode === "solo" ? 1 : 2;
  const st = g.start(players);
  const visits = [];
  let used = 0,
    won = null;
  for (const hit of match.hits) {
    let v = visits.at(-1);
    if (won !== null || (visits.length === g.rounds * players && v.closed)) break;
    if (!v || v.closed) {
      const i = visits.length;
      v = { player: i % players, round: Math.floor(i / players) + 1, hits: [], gains: [], scored: 0, closed: false };
      visits.push(v);
    }
    v.hits.push(hit);
    used++;
    const before = v.scored;
    if (g.dart(st, v.player, bedOf(hit), v) === "won") won = v.player;
    v.gains.push(v.scored - before); // what this dart counted for: marks, targets or points
    v.closed = won !== null || v.hits.length === 3;
  }
  return { g, players, st, visits, used, won };
}
function statusOf(match) {
  const { g, players, st, visits, won } = replay(match);
  const last = visits.at(-1);
  const complete = won !== null || (visits.length === g.rounds * players && last.closed);
  let winner = won;
  if (winner === null && complete && players === 2) {
    const [a, b] = [g.rank(st, 0), g.rank(st, 1)];
    const i = a.findIndex((x, k) => x !== b[k]);
    winner = i < 0 ? null : Number(b[i] > a[i]);
  }
  const open = last && !last.closed && last;
  const next = visits.length;
  return {
    totals: g.totals(st),
    state: st,
    complete,
    out: won !== null, // finished by the rules, not by the round limit
    winner,
    player: open ? open.player : complete ? last.player : next % players,
    round: open || complete ? last.round : Math.floor(next / players) + 1,
    dart: open ? open.hits.length + 1 : 1,
    visits,
  };
}
// What the board shows for these games (src/art.js targetMark), for the player
// about to throw, or null between visits and after the match. Numbers are 1–20,
// or 25 for the bull. Around the Clock and Shanghai: aim at the one number in
// play. Cricket: every target still worth hitting, with this player's marks, the
// dead ones (closed by everyone), and in a duel those only the rival has closed.
export function boardTargets(match, acknowledged) {
  if (!rules[match?.game]) return null;
  const s = status(match),
    last = s.visits.at(-1);
  if (s.complete || (last?.closed && acknowledged !== match.hits.length)) return null;
  const p = s.player;
  if (match.game === "clock") return { aim: [s.state.at[p] < 20 ? s.state.at[p] + 1 : 25] };
  if (match.game === "shanghai") return { aim: [s.round] };
  const { marks } = s.state;
  const dead = cricketTargets.filter((t) => marks.every((m) => m[t] === 3));
  // Duel: what the rival has closed and this player hasn't, where the rival scores.
  const rival = marks.length === 2 ? cricketTargets.filter((t) => marks[1 - p][t] === 3 && marks[p][t] < 3) : [];
  return { aim: cricketTargets.filter((t) => !dead.includes(t)), dead, marks: marks[p], rival };
}

// Saved data. dartshift.save.v1 keeps its original shape and meaning (Nine Dart
// Rush match and best, mute, acknowledged visit), so an older cached copy of the
// app still reads and writes it correctly. 301 lives only in its own key, which
// older copies never touch (DECISIONS.md, "301"). Records set with the flick live
// in a third: the bests in the other two are from the old throw and are never
// overwritten here (DECISIONS.md, "The flick").
export const saveKeys = {
  rush: "dartshift.save.v1",
  x01: "dartshift.301.v1",
  flick: "dartshift.flick.v1",
  learn: "dartshift.learn.v1",
  zero: "dartshift.301.v2",
  modes: "dartshift.games.v1",
};
// Touch darts a device throws while it gets bull-relative coaching (src/coach.js).
export const learnDarts = 45;
const gameNames = ["rush", "301"];
const record = (n, low, high) =>
  Number.isInteger(n) && n >= low && n <= high ? n : null;
const seen = (n, match) =>
  Number.isInteger(n) && n === match?.hits.length ? n : -1;
// rush.best and 301.best are the old throw's records. flick holds the records set
// since, and `carried`: games whose match in progress began before the flick, so
// finishing it sets no record. The first time the flick key is missing, that is
// every match still in progress.
// learn counts touch darts up to learnDarts (its own key, so no older shape changes).
// modes holds Cricket, Around the Clock and Shanghai (dartshift.games.v1), each
// { match, best, acknowledged }: a key no older copy reads or writes.
// zero is first-to-zero 301 (dartshift.301.v2): its match and its fewest-darts
// record. 301.v1 keeps its shape: it holds only a double-out match, saved before
// first to zero, until a new 301 match replaces it, and older copies, which read
// only v1, never see a first-to-zero match (DECISIONS.md, "First to zero").
export function readSaves(v1, v301, flick, learn, zero, modes) {
  const a = v1 && typeof v1 === "object" ? v1 : {},
    b = v301 && typeof v301 === "object" ? v301 : {},
    f = flick && typeof flick === "object" ? flick : null,
    z = zero && typeof zero === "object" ? zero : {};
  const rush = decodeMatch(a.match),
    three = decodeMatch(b.match),
    next = decodeMatch(z.match);
  const r = rush && !rush.game ? rush : null,
    t = doubleOut(three) ? three : null,
    n = next?.game === "301" && !doubleOut(next) ? next : null;
  const open = { rush: r && !status(r).complete, 301: t && !status(t).complete };
  return {
    muted: a.muted === true,
    lobby: ["301", ...Object.keys(rules)].includes(b.lobby) ? b.lobby : "rush",
    rush: { match: r, best: record(a.best, 0, 540), acknowledged: seen(a.acknowledged, r) },
    301: { match: t, best: record(b.best, 6, x01.rounds * 3), acknowledged: seen(b.acknowledged, t) },
    flick: {
      rush: record(f?.rush, 0, 540),
      301: record(f?.[301], 6, x01.rounds * 3),
      carried: gameNames.filter((g) => open[g] && (f ? Array.isArray(f.carried) && f.carried.includes(g) : true)),
    },
    learn: Number.isInteger(learn) && learn >= 0 ? Math.min(learn, learnDarts) : 0,
    zero: { match: n, best: record(z.best, 6, x01.rounds * 3), acknowledged: seen(z.acknowledged, n) },
    modes: Object.fromEntries(
      Object.entries(rules).map(([id, { record: r }]) => {
        const saved = modes && typeof modes === "object" && modes[id] && typeof modes[id] === "object" ? modes[id] : {};
        const m = decodeMatch(saved.match);
        const match = m?.game === id ? m : null;
        return [id, { match, best: record(saved.best, r.low, r.high), acknowledged: seen(saved.acknowledged, match) }];
      }),
    ),
  };
}
export function writeSaves({ muted, lobby, rush, 301: t, flick, learn, zero, modes }) {
  return {
    [saveKeys.rush]: { match: rush.match, best: rush.best, muted, acknowledged: rush.acknowledged },
    [saveKeys.x01]: { match: t.match, best: t.best, acknowledged: t.acknowledged, lobby },
    [saveKeys.flick]: { rush: flick.rush, 301: flick[301], carried: flick.carried },
    [saveKeys.learn]: learn,
    [saveKeys.zero]: { match: zero.match, best: zero.best, acknowledged: zero.acknowledged },
    [saveKeys.modes]: Object.fromEntries(
      Object.entries(modes).map(([id, m]) => [id, { match: m.match, best: m.best, acknowledged: m.acknowledged }]),
    ),
  };
}
// Before a write, keep the better of each record on disk and in memory, so a tab
// holding older saves can never lower or erase one (DECISIONS.md, "Quick wins").
// Matches are not merged here: the app adopts the disk's before acting (refresh).
// Mutates and returns `mine`.
export function mergeRecords(disk, mine) {
  const pick = (a, b, f) => (a === null ? b : b === null ? a : f(a, b));
  mine.rush.best = pick(disk.rush.best, mine.rush.best, Math.max);
  mine[301].best = pick(disk[301].best, mine[301].best, Math.min);
  mine.flick.rush = pick(disk.flick.rush, mine.flick.rush, Math.max);
  mine.flick[301] = pick(disk.flick[301], mine.flick[301], Math.min);
  mine.zero.best = pick(disk.zero.best, mine.zero.best, Math.min);
  for (const [id, { record: r }] of Object.entries(rules))
    mine.modes[id].best = pick(disk.modes[id].best, mine.modes[id].best, r.fewer ? Math.min : Math.max);
  mine.learn = Math.max(disk.learn, mine.learn);
  return mine;
}

export { swipeLanding } from "./throw.js";
