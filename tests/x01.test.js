import test from "node:test";
import assert from "node:assert/strict";
import {
  advance,
  checkout,
  decodeMatch,
  freshMatch,
  readSaves,
  saveKeys,
  scoreAt,
  sectors,
  status,
  writeSaves,
  mergeRecords,
  learnDarts,
} from "../src/game.js";

// A point on a named bed: "20", "T20", "D20", "25", "Bull", or "Miss".
function bed(name) {
  if (name === "Bull") return { x: 0, y: 0 };
  if (name === "25") return { x: 0, y: -10 };
  if (name === "Miss") return { x: 0, y: -190 };
  const ring = { T: 103, D: 166 }[name[0]] ?? 130;
  const deg = sectors.indexOf(Number(name.replace(/^[TD]/, ""))) * 18;
  const r = ring;
  return {
    x: Math.sin((deg * Math.PI) / 180) * r,
    y: -Math.cos((deg * Math.PI) / 180) * r,
  };
}
const throwAll = (match, names) =>
  names.reduce((m, n) => advance(m, bed(n)), match);
const solo = (...names) => throwAll(freshMatch("solo", "301"), names);
const duel = (...names) => throwAll(freshMatch("duel", "301"), names);
// Double out: a 301 match saved before first to zero (no `finish`), which still
// replays under its own rules (DECISIONS.md, "First to zero"). The double-out
// tests below are restated on these saves; tests/zero.test.js has the new rules.
const old = (mode) => ({ game: "301", mode, hits: [] });
const legacySolo = (...names) => throwAll(old("solo"), names);
const legacyDuel = (...names) => throwAll(old("duel"), names);
const ton80 = ["T20", "T20", "T20"]; // 301 → 121

test("the bed helper hits what it says", () => {
  for (const [n, p] of [["T20", 60], ["D16", 32], ["7", 7], ["25", 25], ["Bull", 50], ["Miss", 0]])
    assert.equal(scoreAt(bed(n).x, bed(n).y).points, p, n);
});

test("301 counts down per dart and visits close after three", () => {
  let s = status(solo("T20"));
  assert.deepEqual([s.totals[0], s.dart, s.round], [241, 2, 1]);
  s = status(solo(...ton80));
  assert.deepEqual([s.totals[0], s.dart, s.round], [121, 1, 2]);
  assert.equal(s.visits[0].closed, true);
  assert.equal(s.visits[0].scored, 180);
  assert.equal(s.complete, false);
});

test("bust below zero ends the visit at once and restores its start", () => {
  // 121 → 61 → 4 → T20 would be -56.
  const s = status(solo(...ton80, "T20", "T19", "T20"));
  const v = s.visits[1];
  assert.equal(v.bust, "over");
  assert.equal(v.scored, 0);
  assert.equal(v.closed, true);
  assert.equal(s.totals[0], 121);
  assert.deepEqual([s.round, s.dart], [3, 1]);
});

test("double out: bust when left on 1, even on the first dart of a visit", () => {
  let s = status(legacySolo(...ton80, "T20", "T20")); // 121 → 61 → 1
  assert.equal(s.visits[1].bust, "one");
  assert.equal(s.visits[1].hits.length, 2);
  assert.equal(s.totals[0], 121);
  // A new visit on 41: D20 leaves 1 with the first dart.
  s = status(legacySolo(...ton80, "T20", "20", "Miss", "D20"));
  assert.equal(s.visits[2].bust, "one");
  assert.equal(s.visits[2].hits.length, 1);
  assert.equal(s.totals[0], 41);
  assert.deepEqual([s.round, s.dart], [4, 1]);
});

test("double out: bust when reaching zero without a double, including the outer bull", () => {
  // 301 → 121 → 61 → 41 → 21 (miss) | 20 single → zero off a single.
  let m = legacySolo(...ton80, "T20", "20", "20");
  assert.equal(status(m).totals[0], 21);
  let s = status(throwAll(m, ["T7"])); // 21 → 0 on a treble
  assert.equal(s.visits.at(-1).bust, "double");
  assert.equal(s.totals[0], 21);
  assert.equal(s.complete, false);
  // 25 left, outer bull: zero, but not a double.
  m = legacySolo(...ton80, "T20", "T12", "Miss"); // 121 → 61 → 25
  s = status(throwAll(m, ["25"]));
  assert.equal(s.visits.at(-1).bust, "double");
  assert.equal(s.totals[0], 25);
});

test("double out: checkouts on a double or the bull, on the first, second or third dart", () => {
  const to40 = [...ton80, "T20", "T7", "Miss"]; // 121 → 61 → 40
  for (const [route, darts] of [
    [["D20"], 1],
    [["Miss", "D20"], 2],
    [["20", "Miss", "D10"], 3],
  ]) {
    const m = legacySolo(...to40, ...route);
    const s = status(m);
    assert.equal(s.complete, true, route.join());
    assert.equal(s.out, true);
    assert.equal(s.winner, 0);
    assert.equal(s.totals[0], 0);
    assert.equal(s.visits.at(-1).hits.length, darts);
    assert.equal(s.visits.at(-1).out, true);
    assert.equal(m.hits.length, to40.length + darts);
    assert.equal(advance(m, bed("T20")), m, "no dart after the checkout");
  }
  // 50 on the bull.
  const s = status(legacySolo(...ton80, "T20", "11", "Miss", "Bull")); // 121 → 61 → 50 → 0
  assert.equal(s.out, true);
  assert.equal(s.visits.at(-1).hits.length, 1);
});

test("double out: a duel checkout wins outright; the other player gets no reply", () => {
  // P1 180, P2 nothing, P1 121 → 61 → D? 61 → T7 → 40, D20.
  const m = legacyDuel(...ton80, "Miss", "Miss", "Miss", "T20", "T7", "D20");
  const s = status(m);
  assert.deepEqual([s.complete, s.winner, s.totals], [true, 0, [0, 301]]);
  assert.equal(advance(m, bed("T20")), m);
  // Turns alternate after a bust too.
  const b = status(legacyDuel(...ton80, "Miss", "Miss", "Miss", "T20", "T20"));
  assert.equal(b.visits[2].bust, "one");
  assert.deepEqual([b.player, b.round, b.dart, b.totals], [1, 2, 1, [121, 301]]);
});

test("ten rounds each: lowest remaining wins a duel, level scores draw, solo just ends", () => {
  const misses = (n) => Array(n).fill("Miss");
  let s = status(solo(...misses(29)));
  assert.equal(s.complete, false);
  assert.deepEqual([s.round, s.dart], [10, 3]);
  const run = solo(...misses(30));
  s = status(run);
  assert.deepEqual([s.complete, s.out, s.winner, s.totals], [true, false, null, [301]]);
  assert.equal(advance(run, bed("D20")), run);
  s = status(duel(...misses(60)));
  assert.deepEqual([s.complete, s.winner], [true, null]);
  s = status(duel("20", ...misses(59)));
  assert.deepEqual([s.complete, s.winner, s.totals], [true, 0, [281, 301]]);
  s = status(duel(...misses(3), "1", ...misses(56)));
  assert.deepEqual([s.complete, s.winner], [true, 1]);
});

test("double out: a mid-match save, including one that just bust, rebuilds exactly", () => {
  const cases = [
    legacyDuel(...ton80, "T20"), // mid visit
    legacyDuel(...ton80, "Miss", "Miss", "Miss", "T20", "T20"), // P1 just bust, card not yet acknowledged
    legacySolo(...ton80, "T20", "T19", "T20"), // solo bust below zero
  ];
  for (const m of cases) {
    const saved = decodeMatch(JSON.parse(JSON.stringify(m)));
    assert.deepEqual(saved, m);
    assert.deepEqual(status(saved), status(m));
  }
  const s = status(decodeMatch(JSON.parse(JSON.stringify(cases[1]))));
  assert.deepEqual([s.totals, s.player, s.visits.at(-1).bust], [[121, 301], 1, "one"]);
});

test("a 301 save is rejected if it holds darts after the end, or an unknown game", () => {
  const done = solo(...ton80, "T20", "T7", "D20");
  assert.ok(decodeMatch(done));
  assert.equal(decodeMatch({ ...done, hits: [...done.hits, bed("T20")] }), null);
  assert.equal(decodeMatch({ ...done, game: "501" }), null);
  assert.equal(decodeMatch({ game: "301", mode: "solo", hits: Array(31).fill(bed("Miss")) }), null);
  // 301 allows more than nine darts; Nine Dart Rush still doesn't.
  assert.ok(decodeMatch({ game: "301", mode: "solo", hits: Array(30).fill(bed("Miss")) }));
  assert.equal(decodeMatch({ mode: "solo", hits: Array(10).fill(bed("Miss")) }), null);
});

test("double out: every checkout route is valid, finishes on a double and never busts", () => {
  const bogeys = [169, 168, 166, 165, 163, 162, 159];
  const value = (l) =>
    l === "Bull" ? 50 : l === "25" ? 25 : l[0] === "T" ? 3 * l.slice(1) : l[0] === "D" ? 2 * l.slice(1) : +l;
  for (let left = 2; left <= 170; left++) {
    const route = checkout(left, 3, true);
    if (bogeys.includes(left)) {
      assert.equal(route, null, left);
      continue;
    }
    assert.ok(route && route.length <= 3, String(left));
    assert.equal(route.reduce((t, l) => t + value(l), 0), left);
    assert.match(route.at(-1), /^(D\d+|Bull)$/);
    let rest = left;
    for (const l of route.slice(0, -1)) {
      rest -= value(l);
      assert.ok(rest >= 2, `${left}: ${route} passes through ${rest}`);
    }
    // Fewest darts.
    if (left <= 40 && left % 2 === 0) assert.equal(route.length, 1);
  }
  assert.deepEqual(checkout(40, 1, true), ["D20"]);
  assert.deepEqual(checkout(50, 1, true), ["Bull"]);
  assert.deepEqual(checkout(100, 3, true), ["T20", "D20"]);
  assert.deepEqual(checkout(170, 3, true), ["T20", "T20", "Bull"]);
  assert.deepEqual(checkout(110, 2, true), ["T20", "Bull"]);
  assert.equal(checkout(111, 2, true), null);
  assert.equal(checkout(41, 1, true), null);
  for (const left of [0, 1, 171, 301, NaN]) assert.equal(checkout(left, 3, true), null);
});

// Saves as written by the current release (before 301): match, best, muted, acknowledged.
const v1 = {
  match: { mode: "duel", hits: Array(7).fill(bed("T20")).map(({ x, y }) => ({ x, y, pace: 0.2, line: -0.1 })) },
  best: 450,
  muted: true,
  acknowledged: 6,
};

test("current saves load unchanged, mid-match and record included", () => {
  const s = readSaves(JSON.parse(JSON.stringify(v1)), null);
  assert.deepEqual(s.rush, { match: v1.match, best: 450, acknowledged: -1 });
  assert.equal(s.muted, true);
  assert.equal(s.lobby, "rush");
  assert.deepEqual(s[301], { match: null, best: null, acknowledged: -1 });
  const atHandoff = { ...v1, match: { ...v1.match, hits: v1.match.hits.slice(0, 6) } };
  assert.equal(readSaves(atHandoff, undefined).rush.acknowledged, 6);
  // Written back, save.v1 is the same object an older copy of the app expects.
  const out = writeSaves(readSaves(v1, null));
  assert.deepEqual(out[saveKeys.rush], { ...v1, acknowledged: -1 });
  assert.deepEqual(Object.keys(out[saveKeys.rush]), ["match", "best", "muted", "acknowledged"]);
  // Empty, missing, null best and garbage.
  for (const raw of [null, undefined, {}, "x", { best: null }, { best: 541 }, { best: 1.5 }])
    assert.equal(readSaves(raw, null).rush.best, null);
});

test("301 data stays out of save.v1 and survives an older copy rewriting it", () => {
  const state = readSaves(v1, null);
  state[301] = { match: legacySolo(...ton80, "T20"), best: 12, acknowledged: -1 };
  state.lobby = "301";
  const out = JSON.parse(JSON.stringify(writeSaves(state)));
  assert.equal(out[saveKeys.rush].match.game, undefined);
  assert.equal(JSON.stringify(out[saveKeys.rush]).includes("301"), false);
  // An older copy rewrites save.v1 with only the four fields it knows.
  const old = { match: null, best: 455, muted: false, acknowledged: -1 };
  const back = readSaves(old, out[saveKeys.x01]);
  assert.deepEqual(back[301].match, state[301].match);
  assert.equal(back[301].best, 12);
  assert.equal(back.rush.best, 455);
  assert.equal(back.lobby, "301");
  // Neither slot accepts the other game's match, and a bad 301 record is dropped.
  assert.equal(readSaves({ match: state[301].match }, { match: v1.match }).rush.match, null);
  assert.equal(readSaves({ match: state[301].match }, { match: v1.match })[301].match, null);
  for (const best of [5, 31, -1, "12"]) assert.equal(readSaves(null, { best })[301].best, null);
});

test("flick records start fresh beside the old throw's, and a match begun before the flick sets none", () => {
  // First load after the update: no flick key yet, a Nine Dart Rush duel in progress.
  const first = readSaves(JSON.parse(JSON.stringify(v1)), null, null);
  assert.deepEqual(first.flick, { rush: null, 301: null, carried: ["rush"] });
  assert.equal(first.rush.best, 450); // the old throw's record, untouched
  const out = JSON.parse(JSON.stringify(writeSaves(first)));
  assert.deepEqual(out[saveKeys.rush], { ...v1, acknowledged: -1 });
  assert.deepEqual(out[saveKeys.flick], { rush: null, 301: null, carried: ["rush"] });
  // Later loads keep the mark while that match is open, and drop it once it is done.
  assert.deepEqual(readSaves(v1, null, out[saveKeys.flick]).flick.carried, ["rush"]);
  const done = { ...v1, match: { mode: "solo", hits: Array(9).fill(bed("T20")) } };
  assert.deepEqual(readSaves(done, null, out[saveKeys.flick]).flick.carried, []);
  // A match started after the update was never carried; an empty first load carries nothing.
  assert.deepEqual(readSaves(v1, null, { rush: 300, 301: 9, carried: [] }).flick, { rush: 300, 301: 9, carried: [] });
  assert.deepEqual(readSaves(null, null, null).flick, { rush: null, 301: null, carried: [] });
  // Bad values are dropped, and an older copy rewriting save.v1 leaves the flick records alone.
  for (const bad of [{ rush: 541 }, { rush: "300" }, { 301: 5 }, { 301: 31 }, "x"])
    assert.deepEqual([readSaves(null, null, bad).flick.rush, readSaves(null, null, bad).flick[301]], [null, null]);
  assert.deepEqual(readSaves(v1, null, { carried: "rush" }).flick.carried, []);
  const old = { match: null, best: 455, muted: false, acknowledged: -1 };
  assert.deepEqual(readSaves(old, null, { rush: 300, 301: 9, carried: [] }).flick, { rush: 300, 301: 9, carried: [] });
  assert.equal(readSaves(old, null, { rush: 300 }).rush.best, 455);
});

test("the learn count has its own key and leaves the other three as they were", () => {
  const s = readSaves(JSON.parse(JSON.stringify(v1)), null, { rush: 300, 301: 9, carried: [] }, 12);
  assert.equal(s.learn, 12);
  const out = JSON.parse(JSON.stringify(writeSaves(s)));
  assert.deepEqual(Object.keys(out), [saveKeys.rush, saveKeys.x01, saveKeys.flick, saveKeys.learn, saveKeys.zero, saveKeys.modes]);
  assert.equal(out[saveKeys.learn], 12);
  assert.deepEqual(Object.keys(out[saveKeys.rush]), ["match", "best", "muted", "acknowledged"]);
  assert.deepEqual(Object.keys(out[saveKeys.flick]).sort(), ["301", "carried", "rush"]);
  assert.equal(readSaves(null, null, null, out[saveKeys.learn]).learn, 12);
  for (const bad of [null, undefined, -1, 1.5, "12", {}]) assert.equal(readSaves(null, null, null, bad).learn, 0);
  assert.equal(readSaves(null, null, null, 999).learn, learnDarts);
});

test("a write never lowers or erases a record another tab set", () => {
  const disk = readSaves({ best: 450 }, { best: 14 }, { rush: 300, 301: 9, carried: [] }, 30);
  const stale = readSaves({ best: 400 }, null, null, 5);
  mergeRecords(disk, stale);
  assert.deepEqual([stale.rush.best, stale[301].best, stale.flick.rush, stale.flick[301], stale.learn], [450, 14, 300, 9, 30]);
  // A better record in memory wins over the disk's.
  const mine = readSaves({ best: 500 }, { best: 8 }, { rush: 320, 301: 7, carried: [] }, 45);
  mergeRecords(disk, mine);
  assert.deepEqual([mine.rush.best, mine[301].best, mine.flick.rush, mine.flick[301], mine.learn], [500, 8, 320, 7, 45]);
  // Missing or garbage on disk changes nothing.
  for (const bad of [readSaves(null, null, null), readSaves("x", 5, "y", "z")]) {
    const m = readSaves({ best: 450 }, { best: 14 }, { rush: 300, 301: 9, carried: [] }, 30);
    mergeRecords(bad, m);
    assert.deepEqual([m.rush.best, m[301].best, m.flick.rush, m.flick[301], m.learn], [450, 14, 300, 9, 30]);
  }
  // Matches are left alone: the app adopts the disk's before acting.
  const a = readSaves(v1, null), b = readSaves(null, null);
  mergeRecords(a, b);
  assert.equal(b.rush.match, null);
});
