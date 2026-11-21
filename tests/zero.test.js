// 301, first to zero (DECISIONS.md, "First to zero"): the rules, the routes, the
// save policy and the board's finishing highlight.
import test from "node:test";
import assert from "node:assert/strict";
import {
  advance,
  checkout,
  decodeMatch,
  doubleOut,
  finishTarget,
  freshMatch,
  mergeRecords,
  readSaves,
  saveKeys,
  scoreAt,
  sectors,
  status,
  writeSaves,
  x01,
} from "../src/game.js";
import { finishBeds, finishMark } from "../src/art.js";
import { tune } from "../src/throw.js";

// A point on a named bed: "20" (outer single), "i20" (inner single), "T20", "D20", "25", "Bull", "Miss".
function bed(name) {
  if (name === "Bull") return { x: 0, y: 0 };
  if (name === "25") return { x: 0, y: -10 };
  if (name === "Miss") return { x: 0, y: -190 };
  const r = { T: 103, D: 166, i: 60 }[name[0]] ?? 130;
  const deg = sectors.indexOf(Number(name.replace(/^[TDi]/, ""))) * 18;
  return { x: Math.sin((deg * Math.PI) / 180) * r, y: -Math.cos((deg * Math.PI) / 180) * r };
}
const throwAll = (match, names) => names.reduce((m, n) => advance(m, bed(n)), match);
const solo = (...names) => throwAll(freshMatch("solo", "301"), names);
const duel = (...names) => throwAll(freshMatch("duel", "301"), names);
const legacy = (mode, ...names) => throwAll({ game: "301", mode, hits: [] }, names);
const ton80 = ["T20", "T20", "T20"]; // 301 → 121
const value = (l) =>
  l === "Bull" ? 50 : l === "25" ? 25 : ({ T: 3, D: 2 }[l[0]] ?? 1) * Number(l.replace(/^[TD]/, ""));
// Darts that take a solo from 301 to exactly `left` at the start of round 3 (121 ≥ left ≥ 1).
const toLeft = (left) => {
  const route = left === 121 ? [] : checkout(121 - left, 3);
  return [...ton80, ...route, ...Array(3 - route.length).fill("Miss")];
};
const json = (m) => JSON.parse(JSON.stringify(m));

test("a new 301 match is first to zero; one saved without the mark is double out", () => {
  assert.deepEqual(freshMatch("solo", "301"), { game: "301", mode: "solo", finish: "any", hits: [] });
  assert.deepEqual(freshMatch("solo"), { mode: "solo", hits: [] });
  assert.equal(doubleOut(freshMatch("duel", "301")), false);
  assert.equal(doubleOut({ game: "301", mode: "solo", hits: [] }), true);
  assert.equal(doubleOut({ mode: "solo", hits: [] }), false);
  // decodeMatch keeps the mark only on 301, and only as "any".
  assert.equal(decodeMatch({ mode: "solo", finish: "any", hits: [] }).finish, undefined);
  assert.equal(decodeMatch({ game: "301", mode: "solo", finish: "double", hits: [] }).finish, undefined);
  assert.equal(decodeMatch(json(solo("T20"))).finish, "any");
});

test("reaching zero wins on a single, a double, a treble and either bull", () => {
  for (const [left, last] of [
    [19, "19"],
    [19, "i19"],
    [38, "D19"],
    [57, "T19"],
    [25, "25"],
    [50, "Bull"],
  ]) {
    const m = solo(...toLeft(left), last);
    const s = status(m);
    assert.equal(scoreAt(bed(last).x, bed(last).y).points, left, last);
    assert.deepEqual([s.complete, s.out, s.winner, s.totals], [true, true, 0, [0]], last);
    assert.equal(s.visits.at(-1).bust, null);
    assert.equal(advance(m, bed("T20")), m, "no dart after zero");
  }
});

test("going below zero is a bust; leaving 1 is not", () => {
  // 19 left, T20: below zero. The visit ends at once and goes back to 19.
  let s = status(solo(...toLeft(19), "5", "T20"));
  assert.equal(s.visits.at(-1).bust, "over");
  assert.equal(s.visits.at(-1).hits.length, 2);
  assert.equal(s.visits.at(-1).scored, 0);
  assert.deepEqual([s.totals, s.round, s.dart, s.complete], [[19], 4, 1, false]);
  // 121 → T20 → T20 leaves 1: the visit goes on, and a single 1 finishes it.
  s = status(solo(...ton80, "T20", "T20"));
  assert.equal(s.visits[1].bust, null);
  assert.deepEqual([s.totals, s.dart, s.visits[1].closed], [[1], 3, false]);
  s = status(solo(...ton80, "T20", "T20", "1"));
  assert.deepEqual([s.complete, s.out, s.totals], [true, true, [0]]);
  // Under double out the same darts are still a bust: the policy, not the rule, decides.
  assert.equal(status(legacy("solo", ...ton80, "T20", "T20")).visits[1].bust, "one");
});

test("finishing on the first, second and third dart of a visit", () => {
  for (const darts of [1, 2, 3]) {
    const m = solo(...toLeft(12), ...Array(darts - 1).fill("Miss"), "12");
    const s = status(m);
    assert.equal(s.out, true, String(darts));
    assert.equal(s.visits.at(-1).hits.length, darts);
    assert.equal(m.hits.length, 6 + darts);
  }
});

test("a duel ends the moment a player reaches zero, mid-visit", () => {
  // P1 180, P2 nothing, P1 T20 T20 (1 left), then single 1 with the third dart.
  const m = duel(...ton80, "Miss", "Miss", "Miss", "T20", "T20", "1");
  let s = status(m);
  assert.deepEqual([s.complete, s.winner, s.totals], [true, 0, [0, 301]]);
  assert.equal(advance(m, bed("T20")), m);
  // Player 2 can win mid-visit too, on the second dart: 121 → 21 → 20 → 0.
  const p2 = duel(...ton80, ...ton80, "Miss", "Miss", "Miss", "T20", "D20", "Miss", "Miss", "Miss", "Miss", "1");
  s = status(p2);
  assert.deepEqual([s.complete, s.player, s.dart, s.totals], [false, 1, 2, [121, 20]]);
  s = status(throwAll(p2, ["20"]));
  assert.deepEqual([s.complete, s.winner, s.totals, s.visits.at(-1).hits.length], [true, 1, [121, 0], 2]);
  // Turns alternate after a bust.
  s = status(duel(...ton80, "Miss", "Miss", "Miss", "T20", "T20", "5"));
  assert.equal(s.visits[2].bust, "over");
  assert.deepEqual([s.player, s.round, s.dart, s.totals], [1, 2, 1, [121, 301]]);
});

test("ten rounds each: lowest remaining wins a duel, level scores draw, solo just ends", () => {
  const misses = (n) => Array(n).fill("Miss");
  let s = status(solo(...misses(29)));
  assert.deepEqual([s.complete, s.round, s.dart], [false, 10, 3]);
  const run = solo(...misses(30));
  s = status(run);
  assert.deepEqual([s.complete, s.out, s.winner, s.totals], [true, false, null, [301]]);
  assert.equal(advance(run, bed("T20")), run);
  assert.equal(finishTarget(run, 30), null);
  s = status(duel(...misses(60)));
  assert.deepEqual([s.complete, s.winner], [true, null]);
  s = status(duel("20", ...misses(59)));
  assert.deepEqual([s.complete, s.winner, s.totals], [true, 0, [281, 301]]);
  s = status(duel(...misses(3), "1", ...misses(56)));
  assert.deepEqual([s.complete, s.winner], [true, 1]);
  // A save can't hold darts after the limit or after zero.
  assert.equal(decodeMatch({ ...solo(), hits: Array(31).fill(bed("Miss")) }), null);
  const done = solo(...toLeft(19), "19");
  assert.equal(decodeMatch({ ...json(done), hits: [...done.hits, bed("Miss")] }), null);
});

// Every bed and what it scores, for an independent check of the routes.
const allBeds = [];
for (let n = 1; n <= 20; n++) allBeds.push([String(n), n], ["D" + n, 2 * n], ["T" + n, 3 * n]);
allBeds.push(["25", 25], ["Bull", 50]);
const fewest = (left) => {
  const p = new Set(allBeds.map((b) => b[1]));
  if (p.has(left)) return 1;
  for (const a of p) if (p.has(left - a)) return 2;
  for (const a of p) for (const b of p) if (p.has(left - a - b)) return 3;
  return null;
};

test("checkout routes: any bed finishes, fewest darts, then the biggest beds", () => {
  for (let left = 1; left <= 180; left++) {
    const want = fewest(left);
    for (const darts of [1, 2, 3]) {
      const route = checkout(left, darts);
      if (want === null || want > darts) {
        assert.equal(route, null, `${left} in ${darts}`);
        continue;
      }
      assert.equal(route.length, want, `${left} in ${darts}: ${route}`);
      assert.equal(route.reduce((t, l) => t + value(l), 0), left);
      // Highest first, and every label is a real bed.
      route.forEach((l, i) => {
        assert.ok(allBeds.some((b) => b[0] === l), l);
        if (i) assert.ok(value(route[i - 1]) >= value(l), `${left}: ${route}`);
      });
    }
  }
  // Under 21 a single always does it: the number itself.
  for (let left = 1; left <= 20; left++) assert.deepEqual(checkout(left, 1), [String(left)]);
  // Bigger beds win ties of dart count: outer bull over a double over a treble over the bull.
  assert.deepEqual(checkout(25, 3), ["25"]);
  assert.deepEqual(checkout(30, 3), ["D15"]); // not T10
  assert.deepEqual(checkout(36, 3), ["D18"]); // not T12
  assert.deepEqual(checkout(50, 3), ["Bull"]); // one dart beats 25 + 25
  assert.deepEqual(checkout(35, 3), ["20", "15"]); // two singles; the higher first dart wins the tie
  assert.deepEqual(checkout(41, 3), ["25", "16"]);
  assert.deepEqual(checkout(61, 3), ["T20", "1"]);
  assert.deepEqual(checkout(100, 3), ["T20", "D20"]);
  assert.deepEqual(checkout(121, 3), ["T20", "T20", "1"]);
  assert.deepEqual(checkout(170, 3), ["T20", "T20", "Bull"]);
  assert.deepEqual(checkout(180, 3), ["T20", "T20", "T20"]);
  for (const left of [169, 172, 173, 175, 176, 178, 179]) assert.equal(checkout(left, 3), null, String(left));
  for (const left of [0, -1, 181, 301, 1.5, NaN]) assert.equal(checkout(left, 3), null);
  assert.equal(checkout(19, 0), null);
  // The double-out routes are unchanged for double-out saves.
  assert.deepEqual(checkout(19, 3, true), ["3", "D8"]);
  assert.equal(checkout(1, 3, true), null);
});

test("saved double-out matches keep double out, including one saved mid-bust", () => {
  // As the previous release wrote them: 301.v1, no finish mark, no v2 key yet.
  const notDouble = legacy("solo", ...ton80, "T20", "20", "20", "T7"); // 21 left, T7: zero off a treble
  const leftOne = legacy("duel", ...ton80, "Miss", "Miss", "Miss", "T20", "T20"); // P1 left on 1
  for (const [m, bust, totals] of [
    [notDouble, "double", [21]],
    [leftOne, "one", [121, 301]],
  ]) {
    const disk = { match: json(m), best: 14, acknowledged: m.hits.length - 1, lobby: "301" };
    const s = readSaves(null, disk, { rush: null, 301: 9, carried: [] }, 0);
    // It loads into the double-out slot unchanged, with the card still due.
    assert.deepEqual(s[301], { match: m, best: 14, acknowledged: -1 });
    assert.deepEqual(s.zero, { match: null, best: null, acknowledged: -1 });
    const st = status(s[301].match);
    assert.deepEqual([st.visits.at(-1).bust, st.totals, st.complete], [bust, totals, false]);
    // Under first to zero the same darts would have been a finish or a live visit.
    const asNew = status({ ...m, finish: "any" });
    assert.notDeepEqual([asNew.visits.at(-1).bust, asNew.totals], [bust, totals]);
    // No highlight in a double-out match, even under 20, and its routes end on a double.
    const next = advance(m, bed("Miss"));
    assert.equal(finishTarget(next, next.hits.length), null);
    // Written back, v1 is the same object, and a v2 key appears beside it.
    const out = json(writeSaves(s));
    assert.deepEqual(out[saveKeys.x01], { ...disk, acknowledged: -1 });
    assert.deepEqual(out[saveKeys.zero], { match: null, best: null, acknowledged: -1 });
    assert.deepEqual(readSaves(null, out[saveKeys.x01], out[saveKeys.flick], 0, out[saveKeys.zero])[301].match, m);
  }
  // A double-out match finishes on a double as before.
  const done = status(advance(notDouble, bed("Miss")));
  assert.equal(done.complete, false);
  const s = status(legacy("solo", ...ton80, "T20", "20", "20", "T7", "1", "D10"));
  assert.deepEqual([s.complete, s.out], [true, true]);
});

test("first-to-zero matches live in 301.v2, which older copies never read", () => {
  const m = solo(...ton80, "T20");
  const state = readSaves(null, null, null, 0, null);
  state.zero = { match: m, best: 11, acknowledged: -1 };
  state.lobby = "301";
  const out = json(writeSaves(state));
  assert.deepEqual(out[saveKeys.zero], { match: m, best: 11, acknowledged: -1 });
  assert.equal(out[saveKeys.x01].match, null);
  assert.deepEqual(Object.keys(out[saveKeys.x01]), ["match", "best", "acknowledged", "lobby"]);
  // Back in, and an older copy rewriting v1 and the flick key leaves v2 alone.
  let back = readSaves(null, { match: null, best: 14, acknowledged: -1, lobby: "301" }, { rush: 300, 301: 9, carried: [] }, 0, out[saveKeys.zero]);
  assert.deepEqual(back.zero, { match: m, best: 11, acknowledged: -1 });
  assert.deepEqual([back[301].best, back.flick[301]], [14, 9]);
  // Each slot takes only its own kind of match.
  back = readSaves(null, { match: json(m) }, null, 0, { match: json(legacy("solo", "T20")) });
  assert.deepEqual([back[301].match, back.zero.match], [null, null]);
  assert.equal(readSaves(null, null, null, 0, { match: { mode: "solo", hits: [] } }).zero.match, null);
  // The record is fewest darts, 6 to 30, and a write never raises it.
  for (const best of [5, 31, -1, "12", 6.5]) assert.equal(readSaves(null, null, null, 0, { best }).zero.best, null);
  const disk = readSaves(null, null, null, 0, { best: 8 });
  const mine = readSaves(null, null, null, 0, { best: 12 });
  mergeRecords(disk, mine);
  assert.equal(mine.zero.best, 8);
  // A rebuilt save is identical, mid-visit and just after a bust.
  for (const saved of [solo(...ton80, "T20"), solo(...toLeft(19), "5", "T20"), duel(...ton80, "T20", "T20")]) {
    const again = decodeMatch(json(saved));
    assert.deepEqual(again, saved);
    assert.deepEqual(status(again), status(saved));
  }
});

// The highlight.
const at = (...names) => {
  const m = solo(...names);
  return { m, target: (ack = m.hits.length) => finishTarget(m, ack) };
};

test("the threshold is fewer than x01.highlightBelow: 20 left shows nothing, 19 shows 19", () => {
  assert.equal(x01.highlightBelow, 20);
  assert.equal(at(...toLeft(20)).target(), null);
  assert.equal(at(...toLeft(19)).target(), "19");
  assert.equal(at(...toLeft(21)).target(), null);
  assert.equal(at(...toLeft(1)).target(), "1");
  // Mid visit too, after each dart.
  assert.equal(at(...toLeft(25), "5").target(), null); // 20 left
  assert.equal(at(...toLeft(25), "6").target(), "19");
  assert.equal(at(...toLeft(25), "6", "8").target(), "11");
});

test("the highlight is the scoreboard's route, on that number's single beds", () => {
  for (const left of [1, 5, 3, 11, 6, 18, 19, 2, 20 - 1]) {
    for (const thrown of [0, 1, 2]) {
      const { m, target } = at(...toLeft(left + thrown), ...Array(thrown).fill("1"));
      const s = status(m);
      assert.equal(s.totals[0], left);
      // The board, the slots (checkout with the darts in hand) and the spoken route agree.
      assert.deepEqual([target()], checkout(left, 3 - thrown));
      assert.equal(target(), String(left));
    }
    const { number, hit, bust } = finishBeds(String(left));
    assert.equal(number, left);
    assert.equal(hit.length, 2, "both single beds");
    assert.equal(bust.length, 2, "its treble and double");
    // Every point inside a highlighted bed scores exactly what is left; inside a
    // darkened one, more. Sampled to within 0.01 mm of each edge.
    for (const [beds, ok] of [
      [hit, (p) => p === left],
      [bust, (p) => p > left],
    ])
      for (const { a, b, inner, outer } of beds)
        for (const f of [0.0001, 0.5, 0.9999])
          for (const g of [0.01, 0.5, 0.99]) {
            const deg = a + (b - a) * f,
              r = inner + (outer - inner) * g;
            const x = Math.sin((deg * Math.PI) / 180) * r,
              y = -Math.cos((deg * Math.PI) / 180) * r;
            assert.ok(ok(scoreAt(x, y).points), `${left}: ${deg}° ${r}mm scores ${scoreAt(x, y).points}`);
          }
  }
  // Drawn in the board face's own projection.
  assert.ok(finishMark("3").includes(`matrix(1 0 ${tune.camera.skew} ${tune.camera.faceHeight} 0 0)`));
  assert.equal(finishMark(null), "");
  // Other beds a raised threshold could need are drawn too.
  assert.deepEqual(finishBeds("D20").hit.map((r) => r.points), [40]);
  assert.deepEqual(finishBeds("D20").bust.map((r) => r.points), [60]);
  assert.deepEqual(finishBeds("25").bust.map((r) => r.points), [50]);
  assert.deepEqual(finishBeds("Bull").hit.map((r) => r.points), [50]);
});

test("the highlight after a bust, at a handoff, after resuming, and at the end", () => {
  // A bust closes the visit: nothing while the card is up, then the same number again.
  const { m, target } = at(...toLeft(19), "T20");
  assert.equal(status(m).visits.at(-1).bust, "over");
  assert.equal(target(m.hits.length - 1), null);
  assert.equal(target(), "19");
  // A visit that ends without a finish: nothing until the card is acknowledged.
  const end = at(...toLeft(19), "1", "1", "1");
  assert.equal(end.target(end.m.hits.length - 1), null);
  assert.equal(end.target(), "16");
  // Duel handoff: the highlight belongs to whoever throws next.
  let d = duel(...ton80, "Miss", "Miss", "Miss", "T20", "T14", "Miss"); // P1 19, P2 on 301
  assert.equal(finishTarget(d, d.hits.length - 1), null, "card up");
  assert.equal(finishTarget(d, d.hits.length), null, "P2 has 301");
  d = throwAll(d, ["Miss", "Miss", "Miss"]);
  assert.equal(finishTarget(d, d.hits.length - 1), null, "card up");
  assert.equal(finishTarget(d, d.hits.length), "19", "P1 again");
  // Resuming a save gives the same highlight.
  const saved = readSaves(null, null, null, 0, json({ match: d, best: null, acknowledged: d.hits.length }));
  assert.equal(finishTarget(saved.zero.match, saved.zero.acknowledged), "19");
  // A finish ends the match and the highlight.
  const won = throwAll(d, ["19"]);
  assert.equal(status(won).complete, true);
  assert.equal(finishTarget(won, won.hits.length), null);
  assert.equal(finishTarget(won, won.hits.length - 1), null);
  // Out of rounds on 19: the match is over, so nothing, even with the card acknowledged.
  const limit = solo(...toLeft(19), ...Array(24).fill("Miss"));
  assert.equal(status(limit).complete, true);
  assert.equal(finishTarget(limit, limit.hits.length), null);
  // A double-out match on 19 never has one.
  const old = legacy("solo", ...toLeft(19));
  assert.equal(status(old).totals[0], 19);
  assert.equal(finishTarget(old, old.hits.length), null);
  // Nine Dart Rush never has one.
  assert.equal(finishTarget({ mode: "solo", hits: [] }, 0), null);
  assert.equal(finishTarget(null, -1), null);
});
