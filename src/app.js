import {
  freshMatch,
  status,
  advance,
  scoreAt,
  checkout,
  bustReasons,
  x01,
  readSaves,
  writeSaves,
  saveKeys,
} from "./game.js";
import { icon, board, landed, readyDart } from "./art.js";
import { bindThrows, bindTurnButton, flyDart } from "./input.js";
import { boardPosition, tune } from "./throw.js";
import { unlock, impact, whoosh, fanfare } from "./sound.js";
import { fitScreen } from "./viewport.js";

const $ = (s) => document.querySelector(s);
const scene = $("#scene"),
  stage = $("#stage"),
  panel = $("#panel");
// "1" (Nine Dart Rush, as before) or "301". Session-only: set just before an update reloads.
const resumeKey = "dartshift.resume";
const read = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null; // Start clean.
  }
};
// Each game keeps its own match, record and acknowledged visit (src/game.js
// readSaves). `game` is the one on screen; match, best and acknowledged are its
// copies, put back by use() and save(). `best` is the record set with the flick;
// saves[game].best is the old throw's, kept as it was.
const saves = readSaves(read(saveKeys.rush), read(saveKeys.x01), read(saveKeys.flick));
let game = saves.lobby;
let { match, acknowledged } = saves[game];
let best = saves.flick[game];
let muted = saves.muted;
let freshBest = false;
let cancelAim = () => {};
function stash() {
  Object.assign(saves[game], { match, acknowledged });
  saves.flick[game] = best;
}
function use(next) {
  stash();
  game = saves.lobby = next;
  ({ match, acknowledged } = saves[game]);
  best = saves.flick[game];
  sign();
}
// A match begun before the flick sets no record when it ends.
const carried = () => saves.flick.carried.includes(game);
function save() {
  stash();
  saves.muted = muted;
  try {
    for (const [key, value] of Object.entries(writeSaves(saves)))
      localStorage.setItem(key, JSON.stringify(value));
  } catch {
    $("#storage-note").hidden = false;
  }
}
function say(text) {
  $("#announce").textContent = text;
}
function audioButton() {
  const b = $("#audio");
  b.innerHTML = icon(muted ? "muted" : "sound");
  b.setAttribute("aria-label", muted ? "Turn sound on" : "Mute sound");
  b.title = b.getAttribute("aria-label");
}
function wakeAudio() {
  if (!muted) unlock();
}
$("#audio").onclick = () => {
  muted = !muted;
  wakeAudio();
  audioButton();
  save();
  if (!muted) impact(1);
};
$("#help").innerHTML = icon("help");
$("#help").setAttribute("aria-label", "How to play");
$("#help").title = "How to play";
$("#help").onclick = help;
$("#back").innerHTML = icon("back");
$("#back").title = "Save and return home";
$("#back").onclick = home;
audioButton();

// The camera. Shots (wide, oche, step, final) are defined in the scene tuning
// block of style.css. "oche" is the identity transform, so the throw measures
// the same untransformed board it always has.
function shoot(shot) {
  if (scene.dataset.shot === "intro") getComputedStyle(stage).transform; // start from the intro pose
  scene.dataset.shot = shot;
}
// Any touch or key finishes running transitions: nobody waits on the camera,
// and a stroke always begins on a settled layout. A dart in flight is left to land.
// A touch that ends a camera move first notes where the dart began that move.
// With where it settles, that spans the path the player saw it travel, so a
// touch on the moving dart still picks it up (see onDart).
let skip = null;
function settle(event) {
  if (later) {
    const { run } = later;
    later.stop();
    later = null;
    run();
  }
  const running = document
    .getAnimations()
    .filter(
      (a) =>
        a.playState !== "finished" &&
        a.id !== "flight" &&
        a.effect?.getComputedTiming().endTime < Infinity,
    );
  if (!running.length) return;
  for (const a of running)
    try {
      a.currentTime = 0;
    } catch {
      /* Already gone. */
    }
  skip = {
    event,
    dart: stage.querySelector(".ready-dart > g")?.getBoundingClientRect(),
  };
  for (const a of running)
    try {
      a.finish();
    } catch {
      /* Already gone. */
    }
}
const skipped = (event) => (skip?.event === event ? skip.dart || {} : null);
addEventListener("pointerdown", settle, true);
addEventListener("keydown", settle, true);
// A landing that ends a visit or the match holds on the dart (--hold) before the
// camera steps back. The shot change and card are made when the hold ends: the
// engine sets up a camera move and a card the moment they are created, even with
// a delay, and that was the costliest work on the impact frame. A touch or key
// during the hold skips it, like any other transition.
// `later` is the one pending step (the next frame, or the end of a hold). Any
// render cancels it; a touch or key runs it now.
let later = null;
function defer(run, ms = 0) {
  const go = () => {
    later = null;
    run();
  };
  // A landing runs as the flight's animation finishes, before this frame's rAF
  // callbacks, so a rAF asked for now would still run in this frame. Ask from
  // inside one to reach the next.
  let id = ms
    ? setTimeout(go, ms)
    : requestAnimationFrame(() => (id = requestAnimationFrame(go)));
  later = { run, stop: () => (ms ? clearTimeout(id) : cancelAnimationFrame(id)) };
}
function afterHold(run) {
  const ms = parseFloat(getComputedStyle(scene).getPropertyValue("--hold"));
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || !(ms > 0)) run();
  else defer(run, ms);
}
// Replay a one-shot room effect (lamp flare, neon relight). No idle loops.
// Prefixed so the scene never picks up an element's rule (.flare is the lamp).
function moment(name) {
  scene.classList.remove("moment-" + name);
  void scene.offsetWidth;
  scene.classList.add("moment-" + name);
}
// Screen-space overlays cross-fade: the outgoing one stays as an inert ghost
// until its exit animation ends (immediately under reduced motion).
function setPanel(html) {
  for (const old of [...panel.children]) {
    if (old.classList.contains("ghost")) continue;
    old.classList.add("ghost");
    old.inert = true;
    Promise.allSettled(old.getAnimations().map((a) => a.finished)).then(() =>
      old.remove(),
    );
  }
  if (html) panel.insertAdjacentHTML("beforeend", html);
}
// Bring `old` in line with `next`: attributes, text and children, recursing
// while the shapes match, so only what changed is repainted.
function morph(old, next) {
  for (const { name } of [...old.attributes])
    if (!next.hasAttribute(name)) old.removeAttribute(name);
  for (const { name, value } of [...next.attributes])
    if (old.getAttribute(name) !== value) old.setAttribute(name, value);
  const was = [...old.childNodes],
    now = [...next.childNodes];
  if (was.length !== now.length) return old.replaceChildren(...now);
  was.forEach((node, i) => {
    const want = now[i];
    if (node.nodeName !== want.nodeName) node.replaceWith(want);
    else if (node.nodeType === 1) morph(node, want);
    else if (node.data !== want.data) node.data = want.data;
  });
}
let refocus = false;
// `keep` is a board already on screen (see landing). The rest of the field is
// updated in place around it, so the board and room are never rebuilt.
function render(shot, world, overlay = "", keep = null) {
  const active = document.activeElement;
  // Focus lost with the old controls goes to the new ones. A landing that ends
  // a visit has no control until its card arrives after the hold, so it waits.
  const lost =
    refocus || (active && (stage.contains(active) || panel.contains(active)));
  cancelAim(); // may land a dart in flight, which queues its next step: drop it
  cancelAim = () => {};
  later?.stop();
  later = null;
  shoot(shot);
  if (keep) {
    const field = keep.parentElement,
      t = document.createElement("template");
    t.innerHTML = world;
    const next = t.content.firstElementChild;
    field.className = next.className;
    field.removeAttribute("aria-busy");
    const old = [...field.children].filter((part) => part !== keep);
    let at = null;
    for (const part of [...next.children]) {
      const same = part.matches(".board-wrap")
        ? keep
        : old.find(
            (o) =>
              o.tagName === part.tagName && o.classList[0] === part.classList[0],
          );
      if (same && same !== keep) {
        old.splice(old.indexOf(same), 1);
        morph(same, part);
      } else if (!same) at ? at.after(part) : field.prepend(part);
      at = same || part;
    }
    old.forEach((part) => part.remove());
  } else stage.innerHTML = world;
  setPanel(overlay);
  $("#back").hidden = shot === "wide" || shot === "final";
  const next = lost
    ? $("#throw") || panel.querySelector(":scope > :not(.ghost) button")
    : null;
  next?.focus({ preventScroll: true });
  refocus = !!lost && !next;
}

const playerName = (i) => "Player " + (i + 1);
const games = {
  rush: {
    name: "Nine Dart Rush",
    neon: ["NINE DART", "RUSH"],
    tagline: "Three rounds. Nine darts. Run up the score.",
    solo: "Chase your personal best.",
    duel: "Face a friend. Pass the phone.",
    rounds: 3,
    bestLabel: "Personal best",
    oldLabel: "Best · old throw",
  },
  301: {
    name: "301",
    neon: ["DOUBLE OUT", "301"],
    tagline: "Count down from 301. Finish on a double.",
    solo: "Fewest darts to zero.",
    duel: "First to zero on a double wins.",
    rounds: x01.rounds,
    bestLabel: "Fewest darts",
    oldLabel: "Fewest · old throw",
  },
};
const is301 = () => game === "301";
const bestText = (n = best) => (n === null ? "—" : n + (is301() ? " darts" : ""));
// The neon sign names the game (index.html holds Nine Dart Rush for first paint).
function sign() {
  const [top, big] = games[game].neon;
  $(".neon span").textContent = top;
  $(".neon b").textContent = big;
}
sign();
// "T20" → "treble 20" for screen readers.
const spoken = (route) =>
  route
    .map((l) =>
      l === "Bull"
        ? "bull"
        : l === "25"
          ? "outer bull"
          : ({ T: "treble ", D: "double " }[l[0]] || "single ") + l.replace(/^[TD]/, ""),
    )
    .join(", ");
// 301: what's left for the player about to throw, and a checkout if one exists.
function standing(left, darts = 3) {
  const route = checkout(left, darts);
  return left + " left." + (route ? " Checkout: " + spoken(route) + "." : "");
}
// The last dart's outcome in 301: "bust", "out" or "".
const noteOf = (v) => (is301() && v?.closed ? (v.bust ? "bust" : v.out ? "out" : "") : "");
const visitTotal = (hits) =>
  hits.reduce((v, h) => v + scoreAt(h.x, h.y).points, 0);
const lobbyDarts = [
  { x: 0, y: -103, pace: 0.4, line: 0 },
  { x: -7, y: -101, pace: -0.3, line: -0.6 },
  { x: 6, y: -128, pace: 0, line: 0.5 },
];

function lobbyParts() {
  const g = games[game],
    old = best === null ? saves[game].best : null;
  const modeButton = (mode, title) => {
    const s = match?.mode === mode && !status(match).complete && status(match);
    const left = s && is301() ? " · " + s.totals.join("–") + (mode === "solo" ? " left" : "") : "";
    return `<button class="mode ${mode}" data-mode="${mode}">
      <span class="mode-mark">${icon(mode)}</span>
      <span class="mode-copy"><strong>${s ? "Resume " + title : title}</strong>
      <small>${s ? "Round " + s.round + " of " + g.rounds + left + (is301() ? "" : " · Saved on this device") : g[mode]}</small></span>
      ${icon("arrow")}</button>`;
  };
  const pick = (id, name) =>
    `<button data-game="${id}" aria-pressed="${game === id}">${name}</button>`;
  return {
    // Until the flick sets one, the lobby shows the old throw's record as that.
    plate: `<div class="plate best-plate"><span class="plate-label">${old === null ? g.bestLabel : g.oldLabel}</span><b class="plate-score">${bestText(old ?? best)}</b></div>`,
    panel: `<section class="lobby" aria-labelledby="lobby-title">
       <h1 id="lobby-title" class="sr">Dartshift · ${g.name}</h1>
       <div class="games" role="group" aria-label="Game">${pick("rush", "Nine Dart Rush")}${pick("301", "301")}</div>
       <p class="tagline">${g.tagline}</p>
       <div class="modes">
         ${modeButton("solo", "Solo run")}
         ${modeButton("duel", "Local duel")}
       </div>
     </section>`,
  };
}
function home() {
  const { plate, panel: lobby } = lobbyParts();
  render("wide", plate + `<div class="board-wrap">${board(lobbyDarts)}</div>`, lobby);
  bindLobby();
}
function bindLobby() {
  panel
    .querySelectorAll(".lobby [data-mode]")
    .forEach((b) => (b.onclick = () => selectMode(b.dataset.mode)));
  panel
    .querySelectorAll(".lobby [data-game]")
    .forEach((b) => (b.onclick = () => pickGame(b.dataset.game)));
}
// Switching game repaints the lobby in place: the board and camera stay, the
// buttons keep focus, and the neon relights with the new name.
function pickGame(next) {
  if (next === game) return;
  wakeAudio();
  use(next);
  save();
  const { plate, panel: lobby } = lobbyParts();
  const t = document.createElement("template");
  t.innerHTML = plate + lobby;
  morph(stage.querySelector(".best-plate"), t.content.children[0]);
  morph(panel.querySelector(":scope > .lobby:not(.ghost)"), t.content.children[1]);
  bindLobby();
  moment("win");
  say(games[game].name + ". " + games[game].tagline);
}
function sheet(title, body, bind) {
  cancelAim();
  $("#sheet").innerHTML =
    '<div class="sheet-head"><h2 id="sheet-title">' +
    title +
    '</h2><button aria-label="Close" class="glass" id="close">' +
    icon("close") +
    "</button></div>" +
    body;
  $("#modal").setAttribute("aria-labelledby", "sheet-title");
  $("#modal").showModal();
  $("#close").onclick = () => $("#modal").close();
  bind?.();
}
let recorder, loadingRecorder;
function loadRecorder() {
  return loadingRecorder ??= import("./recorder.js").then(module => {
    recorder = module;
    module.restore();
    return module;
  });
}
async function openRecorder() {
  (await loadRecorder()).controls(sheet);
}
try {
  if (localStorage.getItem("dartshift.recording"))
    await loadRecorder(); // Restore opt-in before a resumed match can accept its first touch.
} catch { /* Optional diagnostics. */ }

function help() {
  sheet(
    "How to play",
    '<ol class="steps"><li><strong>Pick up the dart.</strong><small>Put your finger on the dart beneath the board.</small></li><li><strong>Flick it up.</strong><small>The faster the flick, the higher the dart lands. Lean the stroke left or right to aim. Start with a medium flick at the bull.</small></li><li><strong>Keep it clean.</strong><small>Swipe straight and let go while your finger is still moving. A curved, slowing or paused stroke scatters the dart.</small></li></ol><p class="body-copy">The thin inner ring triples the number. The outer ring doubles it. Bulls score 25 or 50.</p><p class="body-copy"><strong>Nine Dart Rush.</strong> Three darts per visit, three visits each. Highest total wins.</p><p class="body-copy"><strong>301.</strong> Count down from 301 to exactly zero. The last dart must be a double or the bull. Going below zero, leaving 1 or reaching zero any other way is a bust: the visit ends and your score goes back. Empty dart slots suggest a checkout. Ten rounds each; if nobody finishes, the lowest score wins.</p><button class="primary full" id="okay">Got it</button>',
    () => {
      $("#okay").onclick = () => $("#modal").close();
      $("#sheet-title").onclick = probeTap;
      let taps = [];
      $("#sheet .steps li").onpointerup = (event) => {
        taps = taps.filter(t => event.timeStamp - t < 2500);
        taps.push(event.timeStamp);
        if (taps.length === 5) openRecorder();
      };
    },
  );
}
// Five quick taps on the help title toggle the viewport readout (src/probe.js),
// and it stays on across launches until toggled off. For checking the installed
// app on a phone; players never see it.
const probeKey = "dartshift.probe";
let probeTaps = [];
function probeTap(event) {
  probeTaps = [...probeTaps, event.timeStamp].filter((t) => event.timeStamp - t < 2500);
  if (probeTaps.length < 5) return;
  probeTaps = [];
  import("./probe.js").then(({ toggleProbe }) => {
    let on = true;
    try {
      on = localStorage.getItem(probeKey) === null; // set by the readout while on
      if (!on) localStorage.removeItem(probeKey);
    } catch {
      /* On for this session only. */
    }
    toggleProbe(on);
  });
}
try {
  if (localStorage.getItem(probeKey) !== null || /[?&]viewport\b/.test(location.search))
    import("./probe.js").then(({ toggleProbe }) => toggleProbe(true));
} catch {
  /* No readout. */
}
function start(mode) {
  match = freshMatch(mode, game);
  acknowledged = -1;
  freshBest = false;
  saves.flick.carried = saves.flick.carried.filter((g) => g !== game);
  save();
  play();
  say(
    (is301() ? "301, double out. " : "") +
      "Round one. Touch the dart and flick it up to throw. The faster the flick, the higher it lands. Keep the stroke straight.",
  );
}
function selectMode(mode) {
  wakeAudio();
  if (match && !status(match).complete) {
    if (match.mode === mode) {
      play();
      return;
    }
    sheet(
      "Switch modes?",
      '<p class="body-copy">Starting a new match will replace your saved ' +
        (is301() ? "301 " : "") +
        (match.mode === "solo" ? "solo run" : "duel") +
        '.</p><div class="stack"><button class="primary" id="switch">Start new match</button><button class="secondary" id="stay">Keep current match</button></div>',
      () => {
        $("#switch").onclick = () => {
          $("#modal").close();
          start(mode);
        };
        $("#stay").onclick = () => $("#modal").close();
      },
    );
  } else start(mode);
}

// The scoreboard is mounted on the wall, so it shares the room's light and camera.
// In 301 the big number is what's left, and the empty slots show a checkout.
function plate(s, shown, round, visit, closed, bust = null) {
  const duel = match.mode === "duel";
  const route = is301() && !closed ? checkout(s.totals[shown], 3 - visit.length) : null;
  const slots = [0, 1, 2]
    .map((i) => {
      const h = visit[i];
      if (h) return `<i class="slot thrown${bust ? " void" : ""}">${scoreAt(h.x, h.y).points}</i>`;
      const next = !closed && i === visit.length ? " next" : "";
      const out = route?.[i - visit.length];
      return out ? `<i class="slot out${next}">${out}</i>` : `<i class="slot${next}"></i>`;
    })
    .join("");
  const where = closed
    ? bust
      ? "Bust"
      : "Visit complete"
    : "Dart " + s.dart + " of 3" + (route ? ". Checkout " + spoken(route) : "");
  return `<div class="plate${duel ? " p" + (shown + 1) : ""}">
    <span class="plate-label who">${duel ? playerName(shown) : is301() ? "Remaining" : "Score"}</span>
    <span class="plate-label side">${duel ? playerName(1 - shown) + " · " + s.totals[1 - shown] : "Best " + bestText()}</span>
    <b class="plate-score">${s.totals[shown]}</b>
    <span class="visit"><span class="plate-label">Round ${round} / ${games[game].rounds}</span>
      <span class="slots" role="img" aria-label="${where}">${slots}</span></span>
  </div>`;
}
// Score pop at the impact point, on the board itself.
// `note` is the 301 outcome of this dart: "bust" or "out" (game shot).
function callout(hit, note = "") {
  const p = boardPosition(hit),
    h = scoreAt(hit.x, hit.y);
  const tier =
    note === "bust" ? "miss bust" : h.points >= 40 || note === "out" ? "premium" : h.points ? "" : "miss";
  const top = note === "bust" ? "<b>Bust</b>" : h.points ? "<b>+" + h.points + "</b>" : "";
  const name = note === "out" ? "Game shot" : h.points === 50 ? "Bull" : h.label;
  return `<div class="callout ${tier}" style="left:${((p.x + 211) / 4.22).toFixed(2)}%;top:${((p.y + 211) / 4.22).toFixed(2)}%" aria-hidden="true">${top}<span>${name}</span></div>`;
}
// Impact adds the new dart to the board already on screen instead of rebuilding
// the stage at the moment the eye is on the landing (see showLanding). Returns
// that board, or null when it doesn't hold the visit's earlier darts.
let embedded = null;
function embed(hit, earlier, impactClass) {
  const objects = stage.querySelector(".field .board-objects");
  const darts = [...(objects?.querySelectorAll(".landed:not(.leaving)") || [])];
  if (!objects || darts.length !== earlier) return null;
  objects.querySelectorAll(".leaving").forEach((g) => g.remove());
  darts.forEach((g) => g.classList.remove("impact", "premium"));
  objects
    .querySelector("#sight")
    .insertAdjacentHTML("beforebegin", landed(hit, impactClass));
  return objects.parentElement;
}
// The frame after: the callout joins the board that holds the new dart.
function landing(hits, impactClass, note) {
  const wrap = impactClass && embedded?.isConnected ? embedded : null;
  embedded = null;
  if (!wrap) return null;
  wrap.querySelector(".callout")?.remove();
  wrap.insertAdjacentHTML("beforeend", callout(hits.at(-1), note));
  return wrap;
}
// What a darts caller would shout for a three-dart visit.
function caller(total) {
  if (total === 180) return "One hundred and eighty!";
  if (total >= 100) return "Ton" + (total > 100 ? " " + (total - 100) : "");
  return total ? "" : "No score";
}
const throwControl = `<button class="throw-control" id="throw" aria-label="Throw dart" aria-describedby="throw-keys">
    <span class="dart-grip">${readyDart}</span>
    <b class="hint">Flick the dart up</b><small>Faster flies higher · keep it straight</small>
  </button>
  <span class="sr" id="throw-keys">Touch the dart and flick it up: the faster the flick, the higher it lands. Keep the stroke straight and let go while still moving. On a keyboard, aim with the arrows, then press and release Space or Enter. Shift and arrows fine-tune your aim.</span>`;

function play(impactClass = "", leaving = false) {
  const s = status(match),
    n = match.hits.length;
  if (s.complete) {
    finish(impactClass);
    return;
  }
  const duel = match.mode === "duel";
  // A visit ends after three darts, or in 301 on a bust.
  const last = s.visits.at(-1);
  const between = !!last?.closed && acknowledged !== n;
  const shown = between ? last.player : s.player;
  const visit = between || !last?.closed ? last?.hits || [] : [];
  const round = between ? last.round : s.round;
  // After a handoff the last visit's darts stay just long enough to be pulled.
  const onBoard = leaving ? last.hits : visit;
  const note = noteOf(last);
  let card = "",
    total = 0;
  if (between) {
    total = last.scored;
    const bust = last.bust;
    const tier = bust ? " flat bust" : total >= 100 ? " big" : total ? "" : " flat";
    const heading = bust
      ? `<span class="visit-total">Bust</span><span class="caller">${bustReasons[bust]} · back to ${last.start}</span>`
      : `<span class="visit-total">${total}</span><span class="caller">${caller(total)}</span>`;
    const mine = is301()
      ? `<span>Left · ${s.totals[0]}</span><span>Darts · ${n}</span>`
      : `<span>Total · ${s.totals[0]}</span><span>Best · ${bestText()}</span>`;
    card = `<section class="card handoff${tier}${duel ? " p" + (s.player + 1) : ""}" aria-labelledby="visit-title">
      <p class="eyelabel">${duel ? playerName(shown) + " · " : ""}Visit complete</p>
      <h2 id="visit-title">${heading}</h2>
      <p class="standings">${duel ? `<span class="p1">Player 1 · ${s.totals[0]}</span><span class="p2">Player 2 · ${s.totals[1]}</span>` : mine}</p>
      <button class="primary big" id="next">${duel ? "Pass to " + playerName(s.player) : "Start round " + s.round}${icon("arrow")}</button>
    </section>`;
  }
  const keep = landing(onBoard, impactClass, note);
  const world = `<div class="field gameplay">
       ${plate(s, shown, round, visit, between, between && last.bust)}
       <div class="board-wrap">${keep ? "" : board(onBoard, impactClass) + (impactClass && visit.length ? callout(visit.at(-1), note) : "")}</div>
       ${between ? "" : throwControl}
     </div>`;
  if (between) {
    const step = () => {
      render("step", world, card, keep);
      if (total >= 100 && impactClass) moment("ton");
      bindTurnButton($("#next"), () => {
        acknowledged = n;
        save();
        play("", true);
        say(
          "Round " +
            s.round +
            ", " +
            (duel ? playerName(s.player) : "your turn") +
            (is301() ? ". " + standing(s.totals[s.player]) : ""),
        );
      });
    };
    if (keep) {
      render("oche", world, "", keep);
      afterHold(step);
    } else step();
    return;
  }
  render("oche", world, "", keep);
  // A landing keeps the throw control: bring the next dart in as a new one would.
  if (keep)
    for (const a of $("#throw").getAnimations()) {
      a.currentTime = 0;
      a.play();
    }
  if (leaving)
    stage.querySelectorAll(".landed").forEach((g) => g.classList.add("leaving"));
  const reset = (cancelAim = bindThrows(
    stage.querySelector(".field"),
    wakeAudio,
    land,
    (text) => {
      const hint = stage.querySelector(".hint");
      hint.textContent = text;
      hint.classList.remove("nudge");
      void hint.offsetWidth;
      hint.classList.add("nudge");
      say(text);
    },
    skipped,
    (event, width) => recorder?.begin(event, width),
  ));
  // Re-measure the resting grip once the camera arrives at the oche.
  Promise.allSettled(stage.getAnimations().map((a) => a.finished)).then(() => {
    if (cancelAim === reset) reset(true);
  });
}
// After a throw that went astray, the next dart's prompt says why: the stroke's
// biggest fault if it cost 6 mm or more, else which way a clean flick left the board.
function coach(stroke, { x, y }) {
  const [fault, mm] = Object.entries(stroke?.faults || {}).sort((a, b) => b[1] - a[1])[0] || [];
  if (mm >= 6)
    return {
      bend: "Keep the stroke straight",
      slowdown: "Let go while still flicking",
      speed: stroke.speed > tune.input.fast ? "Too hard · flick softer" : "Too soft · flick harder",
    }[fault];
  if (!stroke || Math.hypot(x, y) <= 170) return "";
  if (Math.abs(x) > Math.abs(y)) return "Too wide · straighten your line";
  return y < 0 ? "Too high · flick softer" : "Too low · flick harder";
}
function land(point, held, geo, stroke) {
  const hit = scoreAt(point.x, point.y);
  match = advance(match, point);
  const s = status(match),
    v = s.visits.at(-1),
    note = noteOf(v),
    darts = match.hits.length,
    tip = coach(stroke, point);
  if (s.complete && match.mode === "solo" && !carried()) {
    if (!is301()) {
      freshBest = best === null || s.totals[0] > best;
      best = Math.max(best ?? 0, s.totals[0]);
    } else if (s.out) {
      freshBest = best === null || darts < best;
      best = Math.min(best ?? darts, darts);
    }
  }
  save();
  const field = stage.querySelector(".field");
  field.setAttribute("aria-busy", "true");
  let sounded = false;
  function contact() {
    if (!sounded && !muted) impact(note === "bust" ? 0 : hit.points);
    sounded = true;
  }
  const flight = flyDart(field, point, held, geo, contact, s.complete);
  if (flight && !muted) whoosh(point.pace || 0);
  // Contact changes only the board: the dart embeds and the thrown one is hidden
  // (its control's fade is held at zero). The scoreboard, callout and next dart
  // follow on the next frame, so no frame does all of it at once.
  function showLanding() {
    if (cancelAim !== showLanding) return;
    cancelAim = () => {};
    flight?.cancel();
    contact();
    const big = hit.points >= 40 || note === "out";
    const effect = big ? "impact premium" : "impact";
    embedded = embed(match.hits.at(-1), v.hits.length - 1, effect);
    for (const a of field.querySelector(".throw-control")?.getAnimations() || []) {
      a.pause();
      a.currentTime = 0;
    }
    say(
      !is301()
        ? hit.label + ", " + hit.points + " points." + (s.complete ? " Match complete." : "")
        : note === "bust"
          ? `${hit.label}. Bust, ${bustReasons[v.bust].toLowerCase()}. Back to ${v.start}.`
          : `${hit.label}, ${hit.points} points. ` +
            (note === "out"
              ? "Game shot!"
              : v.closed
                ? s.totals[v.player] + " left."
                : standing(s.totals[v.player], 3 - v.hits.length)) +
            (s.complete ? " " + verdict(s) + "." : "") +
        (tip && !s.complete ? " " + tip + "." : ""),
    );
    defer(() => {
      play(effect);
      if (big) moment("flare");
      const prompt = tip && stage.querySelector(".throw-control .hint");
      if (prompt) prompt.textContent = tip;
    });
  }
  cancelAim = showLanding;
  if (flight) flight.finished.then(showLanding, showLanding);
  else showLanding();
}
// The 301 result in words: the results title and the final announcement.
function verdict(s) {
  if (match.mode === "solo") return s.out ? "Checked out" : "Out of rounds";
  return s.winner === null ? "Match drawn" : playerName(s.winner) + " wins";
}
function finish(impactClass = "") {
  const s = status(match),
    { totals } = s,
    duel = match.mode === "duel";
  const end = s.visits.at(-1),
    visit = end.hits,
    note = noteOf(end);
  const last = match.hits.at(-1),
    hit = scoreAt(last.x, last.y);
  let title, score, line, table;
  if (!is301()) {
    title = duel
      ? totals[0] === totals[1]
        ? "Match drawn"
        : playerName(totals[0] > totals[1] ? 0 : 1) + " wins"
      : "Run complete";
    const rounds = [0, 1, 2]
      .map((r) => {
        const cells = totals
          .map((_, p) => {
            const offset = (r * totals.length + p) * 3;
            return "<td>" + visitTotal(match.hits.slice(offset, offset + 3)) + "</td>";
          })
          .join("");
        return "<tr><td>Round " + (r + 1) + "</td>" + cells + "</tr>";
      })
      .join("");
    score = `${totals.map((t, i) => `<span class="${duel ? "p" + (i + 1) : ""}">${t}</span>`).join("<i>–</i>")}<small>PTS</small>`;
    line = duel
      ? "Final dart · " + hit.label + " (+" + hit.points + ")"
      : carried()
        ? "Begun with the old throw · no record"
        : freshBest
          ? "New personal best"
          : "Personal best · " + bestText();
    table = `<thead><tr><th>Visit</th>${totals.map((_, i) => "<th>" + (duel ? playerName(i) : "Points") + "</th>").join("")}</tr></thead><tbody>${rounds}</tbody>`;
  } else {
    title = verdict(s);
    const darts = match.hits.length;
    score =
      !duel && s.out
        ? `<span>${darts}</span><small>DARTS</small>`
        : `${totals.map((t, i) => `<span class="${duel ? "p" + (i + 1) : ""}">${t}</span>`).join("<i>–</i>")}<small>LEFT</small>`;
    line = s.out
      ? duel
        ? "Game shot · " + hit.label
        : carried()
          ? "Begun with the old throw · no record"
          : freshBest
            ? "New personal best"
            : "Personal best · " + bestText()
      : duel
        ? x01.rounds + " rounds up · " + (s.winner === null ? "level on " + totals[0] : "lowest score wins")
        : "Check out within " + x01.rounds + " rounds to set a best";
    const stats = totals.map((_, p) => {
      const mine = s.visits.filter((v) => v.player === p);
      const thrown = mine.reduce((t, v) => t + v.hits.length, 0),
        scored = mine.reduce((t, v) => t + v.scored, 0);
      return {
        darts: thrown,
        average: thrown ? ((scored / thrown) * 3).toFixed(1) : "0.0",
        top: Math.max(0, ...mine.map((v) => v.scored)),
      };
    });
    const row = (name, key) =>
      "<tr><td>" + name + "</td>" + stats.map((x) => "<td>" + x[key] + "</td>").join("") + "</tr>";
    const head = duel ? `<thead><tr><th></th>${totals.map((_, i) => "<th>" + playerName(i) + "</th>").join("")}</tr></thead>` : "";
    table = `${head}<tbody>${row("Darts", "darts")}${row("3-dart average", "average")}${row("Best visit", "top")}</tbody>`;
  }
  const keep = landing(visit, impactClass, note);
  const world = `<div class="field">${plate(s, end.player, end.round, visit, true, end.bust)}
       <div class="board-wrap">${keep ? "" : board(visit, impactClass) + (impactClass ? callout(last, note) : "")}</div></div>`;
  const results = `<section class="card results${freshBest && !duel ? " record" : ""}" aria-labelledby="result-title">
      <p class="eyelabel">${is301() ? "301 · " : ""}${duel ? "Local duel" : "Solo run"}</p>
      <h1 id="result-title">${title}</h1>
      <div class="result-score">${score}</div>
      <p class="note">${line}</p>
      <table class="results-table">${table}</table>
      <div class="actions"><button class="primary" id="again">Play again ${icon("arrow")}</button><button class="secondary" id="lobby">Modes</button></div>
    </section>`;
  const show = () => {
    render("final", world, results, keep);
    bindTurnButton($("#again"), () => start(match.mode));
    bindTurnButton($("#lobby"), home);
    if (impactClass) moment("win");
  };
  if (impactClass && !muted) fanfare();
  if (keep) {
    render("oche", world, "", keep);
    afterHold(show);
  } else show();
}
window.addEventListener("blur", () => cancelAim());
window.addEventListener("resize", () => cancelAim());
document.addEventListener("visibilitychange", () => {
  if (document.hidden) cancelAim();
});
// The room's height comes from the screen in the installed app (src/viewport.js).
// Check again whenever the window may have changed: rotation, returning from the
// background or the app switcher. iOS can report the new width a frame after
// the event, so look again then. A change re-measures the resting dart.
function refit() {
  if (fitScreen()) cancelAim();
  requestAnimationFrame(() => fitScreen() && cancelAim());
}
fitScreen();
for (const type of ["resize", "orientationchange", "pageshow"])
  addEventListener(type, refit);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refit();
});

// An update reload returns straight to the match it interrupted.
let resuming = null;
try {
  resuming = { 1: "rush", 301: "301" }[sessionStorage.getItem(resumeKey)];
  sessionStorage.removeItem(resumeKey);
} catch {
  /* Lobby. */
}
if (resuming && resuming !== game) use(resuming);
if (resuming && match && !status(match).complete) play();
else home();

if ("serviceWorker" in navigator) {
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadController) location.reload();
    hadController = true;
  });
  navigator.serviceWorker
    .register("./sw.js", { scope: "./", updateViaCache: "none" })
    .then((reg) => {
      function offer() {
        if (!reg.waiting || !navigator.serviceWorker.controller) return;
        $("#update").hidden = false;
        $("#apply").onclick = () => {
          cancelAim();
          save();
          try {
            if (["oche", "step"].includes(scene.dataset.shot))
              sessionStorage.setItem(resumeKey, is301() ? "301" : "1");
          } catch {
            /* Reload lands in the lobby instead. */
          }
          reg.waiting?.postMessage("activate");
        };
      }
      offer();
      reg.addEventListener("updatefound", () => {
        const worker = reg.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed") setTimeout(offer, 0);
        });
      });
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) reg.update().catch(() => {});
      });
    })
    .catch(() => {
      /* Online play remains available when workers are disabled. */
    });
}

if (new URLSearchParams(location.search).has("record")) openRecorder();
