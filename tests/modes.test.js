// Cricket, Around the Clock and Shanghai (DECISIONS.md, "Three more games"):
// rules, round limits, saves and what the board shows.
import test from "node:test";
import assert from "node:assert/strict";
import {
  advance,
  boardTargets,
  decodeMatch,
  freshMatch,
  mergeRecords,
  readSaves,
  rules,
  saveKeys,
  scoreAt,
  sectors,
  status,
  writeSaves,
} from "../src/game.js";
import { targetMark, wedge } from "../src/art.js";

// A point on a named bed: "20" (outer single), "i20" (inner single), "T20", "D20", "25", "Bull", "Miss".
function bed(name) {
  if (name === "Bull") return { x: 0, y: 0 };
  if (name === "25") return { x: 0, y: -10 };
  if (name === "Miss") return { x: 0, y: -190 };
  const r = { T: 103, D: 166, i: 60 }[name[0]] ?? 130;
  const deg = sectors.indexOf(Number(name.replace(/^[TDi]/, ""))) * 18;
  return { x: Math.sin((deg * Math.PI) / 180) * r, y: -Math.cos((deg * Math.PI) / 180) * r };
}
const play = (game, mode, names) => names.reduce((m, n) => advance(m, bed(n)), freshMatch(mode, game));
const miss3 = ["Miss", "Miss", "Miss"];
const json = (m) => JSON.parse(JSON.stringify(m));

test("the bed helper hits what it says", () => {
  for (const [n, label] of [["T20", "Treble 20"], ["i7", "Single 7"], ["D16", "Double 16"], ["25", "Outer bull"], ["Bull", "Bullseye"]])
    assert.equal(scoreAt(bed(n).x, bed(n).y).label, label);
});

test("cricket: marks by bed, three to close, and nothing off 15–20 and the bull", () => {
  let s = status(play("cricket", "solo", ["20", "D19", "T18"]));
  assert.deepEqual([s.state.marks[0][20], s.state.marks[0][19], s.state.marks[0][18]], [1, 2, 3]);
  s = status(play("cricket", "solo", ["25", "Bull", "14"]));
  assert.equal(s.state.marks[0][25], 3);
  assert.deepEqual(s.visits[0].gains, [1, 2, 0]);
  assert.deepEqual(s.visits[0].closes, [25]);
  // Solo has no points: marks past three count for nothing.
  s = status(play("cricket", "solo", ["T20", "T20"]));
  assert.deepEqual([s.state.marks[0][20], s.totals, s.visits[0].gains], [3, [0], [3, 0]]);
});

test("cricket: marks past three score while the rival is open, not once they close", () => {
  // P1 T20 T20 (closes, then 60), P2 T20 closes it too, P1's T20 is then dead.
  let s = status(play("cricket", "duel", ["T20", "T20", "Miss", "T20", ...["Miss", "Miss"], "T20", "D20", "Miss"]));
  assert.deepEqual(s.totals, [60, 0]);
  assert.deepEqual(s.visits[2].gains, [0, 0, 0]);
  // A double that closes with its first mark scores with its second; the bull scores 25 a mark.
  s = status(play("cricket", "duel", ["20", "20", "D20", ...miss3, "Bull", "Bull"]));
  assert.deepEqual([s.totals[0], s.visits[0].gains], [20 + 25, [1, 1, 2]]); // D20 closes then scores 20; Bull closes then scores 25
});

test("cricket: closing all seven wins at once when level or ahead, not when behind", () => {
  const close = ["T20", "T19", "T18", "T17", "T16", "T15", "Bull", "25"]; // 8 darts
  let m = play("cricket", "solo", close);
  let s = status(m);
  assert.deepEqual([s.complete, s.out, m.hits.length], [true, true, 8]);
  assert.equal(advance(m, bed("T20")), m, "no dart after the finish");
  // Duel: P1 closes everything on dart 8 (mid-visit), P2 never scored: P1 wins there.
  const duel = ["T20", "T19", "T18", ...miss3, "T17", "T16", "T15", ...miss3, "Bull", "25"];
  s = status(play("cricket", "duel", duel));
  assert.deepEqual([s.complete, s.winner, s.visits.at(-1).hits.length], [true, 0, 2]);
  // P2 ahead on points: P1 closing everything doesn't end it; scoring past P2 does.
  const behind = ["Miss", "Miss", "Miss", "T20", "T20", "T20"]; // P2 has 120
  m = play("cricket", "duel", [...behind, "T20", "T19", "T18", ...miss3, "T17", "T16", "T15", ...miss3, "Bull", "25", "T19"]);
  s = status(m);
  assert.deepEqual([s.complete, s.totals], [false, [57, 120]]);
  m = play("cricket", "duel", [...behind, "T20", "T19", "T18", ...miss3, "T17", "T16", "T15", ...miss3, "Bull", "25", "T19", ...miss3, "T19", "T19"]);
  s = status(m);
  assert.deepEqual([s.complete, s.winner, s.totals, s.visits.at(-1).hits.length], [true, 0, [171, 120], 2]);
});

test("cricket: at the round limit more points wins, then more marks, else a draw", () => {
  const rounds = rules.cricket.rounds;
  const idle = (n) => Array(n * 6).fill("Miss");
  let s = status(play("cricket", "duel", idle(rounds)));
  assert.deepEqual([s.complete, s.out, s.winner], [true, false, null]);
  s = status(play("cricket", "duel", ["Miss", "Miss", "Miss", "20", "Miss", "Miss", ...idle(rounds - 1)]));
  assert.deepEqual([s.complete, s.winner], [true, 1], "level on points, more marks");
  s = status(play("cricket", "duel", ["T20", "T19", "T18", "T17", "T17", "Miss", ...idle(rounds - 1)]));
  assert.deepEqual([s.totals, s.winner], [[0, 51], 1], "more points beats more marks (9 against 6)");
  assert.equal(status(play("cricket", "solo", Array(rounds * 3 - 1).fill("Miss"))).complete, false);
  assert.equal(status(play("cricket", "solo", Array(rounds * 3).fill("Miss"))).complete, true);
});

test("around the clock: 1 to 20 in order on any bed, then either bull", () => {
  let s = status(play("clock", "solo", ["1", "T2", "i3", "D4", "6", "5"]));
  assert.deepEqual([s.totals, s.visits[1].gains], [[5], [1, 0, 1]]);
  const all = Array.from({ length: 20 }, (_, i) => String(i + 1));
  let m = play("clock", "solo", [...all, "20"]);
  s = status(m);
  assert.deepEqual([s.totals, s.complete], [[20], false], "20 again doesn't finish");
  for (const bull of ["25", "Bull"]) {
    m = play("clock", "solo", [...all, bull]);
    s = status(m);
    assert.deepEqual([s.complete, s.out, s.winner, s.totals, m.hits.length], [true, true, 0, [21], 21], bull);
  }
  // A duel ends the moment someone reaches the bull, mid-visit.
  const p1 = [...all, "Miss", "Miss", "25"];
  const darts = [];
  for (let i = 0; i < p1.length; i += 3) darts.push(...p1.slice(i, i + 3), ...(i + 3 < p1.length ? miss3 : []));
  s = status(play("clock", "duel", darts));
  assert.deepEqual([s.complete, s.winner, s.totals, s.visits.at(-1).hits.length], [true, 0, [21, 0], 2]);
});

test("around the clock: after the round limit the furthest wins, level is a draw", () => {
  const n = rules.clock.rounds * 6;
  let s = status(play("clock", "duel", Array(n).fill("Miss")));
  assert.deepEqual([s.complete, s.winner], [true, null]);
  s = status(play("clock", "duel", ["Miss", "Miss", "Miss", "1", ...Array(n - 4).fill("Miss")]));
  assert.deepEqual([s.complete, s.out, s.winner, s.totals], [true, false, 1, [0, 1]]);
  assert.equal(status(play("clock", "solo", Array(rules.clock.rounds * 3 - 1).fill("Miss"))).complete, false);
});

test("shanghai: round n scores only n, single double treble", () => {
  let s = status(play("shanghai", "solo", ["1", "D1", "T2", "2", "T2", "Bull", "T3"]));
  assert.deepEqual(s.visits.map((v) => v.gains), [[1, 2, 0], [2, 6, 0], [9]]);
  assert.deepEqual([s.totals, s.round], [[20], 3]);
  // Seven rounds, then it's over.
  const run = Array.from({ length: 7 }, (_, r) => ["T" + (r + 1), "T" + (r + 1), "T" + (r + 1)]).flat();
  const m = play("shanghai", "solo", run);
  s = status(m);
  assert.deepEqual([s.complete, s.totals], [true, [252]]);
  assert.equal(advance(m, bed("T7")), m);
});

test("shanghai: single, double and treble in one visit wins a duel outright; solo plays on", () => {
  for (const order of [["2", "D2", "T2"], ["T2", "2", "D2"], ["D2", "T2", "i2"]]) {
    const m = play("shanghai", "duel", [...miss3, "T1", "T1", "T1", ...order]);
    const s = status(m);
    assert.deepEqual([s.complete, s.out, s.winner, s.totals, s.visits.at(-1).shanghai], [true, true, 0, [12, 9], true], order.join());
    assert.equal(advance(m, bed("T2")), m, "no reply visit");
  }
  // Not a Shanghai: two singles and a double, or a miss.
  for (const visit of [["2", "i2", "D2"], ["2", "D2", "Miss"]]) {
    const s = status(play("shanghai", "duel", [...visit]));
    assert.deepEqual([s.complete, s.visits[0].shanghai], [false, undefined], visit.join());
  }
  // Solo: celebrated, and the run goes on.
  let s = status(play("shanghai", "solo", ["1", "D1", "T1"]));
  assert.deepEqual([s.visits[0].shanghai, s.complete, s.round], [true, false, 2]);
  // After seven rounds the higher total wins; level draws.
  s = status(play("shanghai", "duel", Array(42).fill("Miss")));
  assert.deepEqual([s.complete, s.out, s.winner], [true, false, null]);
  s = status(play("shanghai", "duel", ["Miss", "Miss", "Miss", "1", ...Array(38).fill("Miss")]));
  assert.deepEqual([s.complete, s.winner], [true, 1]);
});

test("board targets: the number in play, between visits nothing, and after the end nothing", () => {
  let m = play("clock", "duel", ["1", "2", "Miss"]);
  assert.equal(boardTargets(m, m.hits.length - 1), null, "card up");
  assert.deepEqual(boardTargets(m, m.hits.length), { aim: [1] }, "Player 2 starts on 1");
  m = play("clock", "solo", [...Array.from({ length: 20 }, (_, i) => String(i + 1))]);
  assert.deepEqual(boardTargets(m, m.hits.length), { aim: [25] }, "then the bull");
  m = play("clock", "solo", ["1", "2"]);
  assert.deepEqual(boardTargets(m, -1), { aim: [3] }, "mid visit");
  m = play("shanghai", "solo", ["1", "1", "1"]);
  assert.deepEqual(boardTargets(m, 3), { aim: [2] });
  // Resuming a save gives the same.
  const saved = readSaves(null, null, null, 0, null, { shanghai: { match: json(m), best: null, acknowledged: 3 } });
  assert.deepEqual(boardTargets(saved.modes.shanghai.match, saved.modes.shanghai.acknowledged), { aim: [2] });
  // Finished: nothing.
  m = play("clock", "solo", [...Array.from({ length: 20 }, (_, i) => String(i + 1)), "Bull"]);
  assert.equal(boardTargets(m, m.hits.length), null);
  // Cricket: this player's marks, the dead targets, and in a duel what only the rival has closed.
  m = play("cricket", "duel", ["T20", "D19", "Miss", "T20", "T18", "Miss"]);
  let t = boardTargets(m, m.hits.length);
  assert.deepEqual(t.dead, [20]);
  assert.deepEqual(t.aim, [19, 18, 17, 16, 15, 25]);
  assert.deepEqual([t.marks[20], t.marks[19], t.marks[18]], [3, 2, 0]);
  assert.deepEqual(t.rival, [18]);
  assert.equal(boardTargets({ mode: "solo", hits: [] }, 0), null, "not for Nine Dart Rush");
});

test("the overlay sits on its beds: an aimed number covers all its beds and only those", () => {
  const { aim } = { aim: [7] };
  assert.ok(targetMark({ aim }).includes('class="enter"'));
  // The aimed wedge is the shape targetMark draws: every point in it, to within
  // 0.01 mm of its edges, scores that number (the bull's: either bull).
  for (const n of [1, 5, 3, 11, 6, 20, 25]) {
    const { a, b, inner, outer } = wedge(n);
    for (const f of [0.0001, 0.5, 0.9999])
      for (const g of [0.0001, 0.3, 0.5, 0.9999]) {
        const deg = a + (b - a) * f,
          r = inner + (outer - inner) * g;
        const x = Math.sin((deg * Math.PI) / 180) * r,
          y = -Math.cos((deg * Math.PI) / 180) * r;
        const { points, label } = scoreAt(x, y);
        assert.ok(n === 25 ? points >= 25 : label.endsWith(" " + n), `${n} at ${deg}° ${r}mm: ${label}`);
      }
  }
  // Cricket: a third of a ring per mark, a dot for the rival, dead targets darkened, no fade.
  const svg = targetMark({ aim: [19, 25], dead: [20], marks: { 20: 3, 19: 2, 18: 0, 17: 1, 16: 0, 15: 0, 25: 1 }, rival: [18] });
  assert.equal((svg.match(/class="tick on"/g) || []).length, 3 + 2 + 1 + 1);
  assert.equal((svg.match(/class="tick"/g) || []).length, 7 * 3 - 7);
  assert.equal((svg.match(/class="rival"/g) || []).length, 1);
  assert.ok(svg.includes("finish-bust") && svg.includes("badge dead") && !svg.includes('class="enter"'));
  assert.equal(targetMark(null), "");
});

test("saves: dartshift.games.v1 holds the three games; nothing else changes shape", () => {
  const state = readSaves(null, null, null, 0, null, null);
  assert.deepEqual(Object.keys(state.modes), ["cricket", "clock", "shanghai"]);
  for (const id of Object.keys(state.modes)) assert.deepEqual(state.modes[id], { match: null, best: null, acknowledged: -1 });
  const c = play("cricket", "duel", ["T20", "T19"]),
    k = play("clock", "solo", ["1", "2", "3"]);
  state.modes.cricket = { match: c, best: null, acknowledged: -1 };
  state.modes.clock = { match: k, best: 30, acknowledged: 3 };
  state.modes.shanghai.best = 140;
  state.lobby = "clock";
  const out = json(writeSaves(state));
  assert.deepEqual(Object.keys(out), Object.values(saveKeys));
  assert.deepEqual(Object.keys(out[saveKeys.rush]), ["match", "best", "muted", "acknowledged"]);
  assert.deepEqual(Object.keys(out[saveKeys.x01]), ["match", "best", "acknowledged", "lobby"]);
  assert.equal(out[saveKeys.x01].lobby, "clock");
  const back = readSaves(...Object.values(saveKeys).map((key) => out[key]));
  assert.deepEqual(back.modes.cricket, { match: c, best: null, acknowledged: -1 });
  assert.deepEqual(back.modes.clock, { match: k, best: 30, acknowledged: 3 });
  assert.equal(back.modes.shanghai.best, 140);
  assert.equal(back.lobby, "clock");
  for (const lobby of ["cricket", "clock", "shanghai", "301"]) assert.equal(readSaves(null, { lobby }).lobby, lobby);
  assert.equal(readSaves(null, { lobby: "killer" }).lobby, "rush");
  // Each slot takes only its own game; garbage is dropped.
  const wrong = readSaves(null, null, null, 0, null, { cricket: { match: json(k) }, clock: { match: "x" }, shanghai: 5 });
  assert.deepEqual([wrong.modes.cricket.match, wrong.modes.clock.match, wrong.modes.shanghai.match], [null, null, null]);
  // Records: cricket 8–60 and clock 21–45 fewest darts, shanghai 0–252 highest.
  for (const [id, good, bad] of [["cricket", [8, 60], [7, 61, 1.5]], ["clock", [21, 45], [20, 46]], ["shanghai", [0, 252], [-1, 253, "9"]]]) {
    for (const best of good) assert.equal(readSaves(null, null, null, 0, null, { [id]: { best } }).modes[id].best, best, id);
    for (const best of bad) assert.equal(readSaves(null, null, null, 0, null, { [id]: { best } }).modes[id].best, null, id);
  }
  const disk = readSaves(null, null, null, 0, null, { cricket: { best: 20 }, clock: { best: 30 }, shanghai: { best: 100 } });
  const mine = readSaves(null, null, null, 0, null, { cricket: { best: 25 }, clock: { best: 28 }, shanghai: { best: 90 } });
  mergeRecords(disk, mine);
  assert.deepEqual([mine.modes.cricket.best, mine.modes.clock.best, mine.modes.shanghai.best], [20, 28, 100]);
});

test("a saved match rebuilds exactly, and can't hold darts after its end", () => {
  for (const m of [play("cricket", "duel", ["T20", "T20", "Miss", "T19"]), play("clock", "solo", ["1", "2", "Miss", "3"]), play("shanghai", "duel", ["1", "D1"])]) {
    const again = decodeMatch(json(m));
    assert.deepEqual(again, m);
    assert.deepEqual(status(again), status(m));
  }
  const done = play("shanghai", "duel", [...miss3, "T1", "T1", "T1", "2", "D2", "T2"]);
  assert.ok(decodeMatch(json(done)));
  assert.equal(decodeMatch({ ...json(done), hits: [...done.hits, bed("Miss")] }), null);
  assert.equal(decodeMatch({ game: "clock", mode: "solo", hits: Array(rules.clock.rounds * 3 + 1).fill(bed("Miss")) }), null);
  assert.equal(decodeMatch({ game: "killer", mode: "solo", hits: [] }), null);
  assert.deepEqual(freshMatch("duel", "cricket", 1), { game: "cricket", mode: "duel", hits: [], first: 1 });
});
