import { freshMatch, decodeMatch, status, advance, scoreAt } from "./game.js";
import { icon, board, readyDart } from "./art.js";
import { bindThrows, bindTurnButton, flyDart } from "./input.js";
import { boardPosition } from "./throw.js";
import { unlock, impact, whoosh, fanfare } from "./sound.js";

const $ = (s) => document.querySelector(s);
const scene = $("#scene"),
  stage = $("#stage"),
  panel = $("#panel");
const key = "dartshift.save.v1";
const resumeKey = "dartshift.resume"; // session-only: set just before an update reloads
let stored = {};
try {
  stored = JSON.parse(localStorage.getItem(key)) || {};
} catch {
  /* Start clean. */
}
let match = decodeMatch(stored.match);
let best =
  Number.isInteger(stored.best) && stored.best >= 0 && stored.best <= 540
    ? stored.best
    : null;
let muted = stored.muted === true;
let acknowledged =
  Number.isInteger(stored.acknowledged) &&
  stored.acknowledged === match?.hits.length
    ? stored.acknowledged
    : -1;
let freshBest = false;
let cancelAim = () => {};
function save() {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({ match, best, muted, acknowledged }),
    );
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
// and a stroke always begins on a settled layout.
function settle() {
  for (const a of document.getAnimations())
    try {
      if (a.effect?.getComputedTiming().endTime < Infinity) a.finish();
    } catch {
      /* Already gone. */
    }
}
addEventListener("pointerdown", settle, true);
addEventListener("keydown", settle, true);
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
function render(shot, world, overlay = "") {
  const active = document.activeElement;
  const lost = active && (stage.contains(active) || panel.contains(active));
  cancelAim();
  cancelAim = () => {};
  shoot(shot);
  stage.innerHTML = world;
  setPanel(overlay);
  $("#back").hidden = shot === "wide" || shot === "final";
  if (lost)
    ($("#throw") || panel.querySelector(":scope > :not(.ghost) button"))?.focus(
      { preventScroll: true },
    );
}

const playerName = (i) => "Player " + (i + 1);
const visitTotal = (hits) =>
  hits.reduce((v, h) => v + scoreAt(h.x, h.y).points, 0);
const lobbyDarts = [
  { x: 0, y: -103, pace: 0.4, line: 0 },
  { x: -7, y: -101, pace: -0.3, line: -0.6 },
  { x: 6, y: -128, pace: 0, line: 0.5 },
];

function home() {
  const modeButton = (mode, title, detail) => {
    const resume = match?.mode === mode && !status(match).complete;
    return `<button class="mode ${mode}" data-mode="${mode}">
      <span class="mode-mark">${icon(mode)}</span>
      <span class="mode-copy"><strong>${resume ? "Resume " + title : title}</strong>
      <small>${resume ? "Round " + status(match).round + " of 3 · Saved on this device" : detail}</small></span>
      ${icon("arrow")}</button>`;
  };
  render(
    "wide",
    `<div class="plate best-plate"><span class="plate-label">Personal best</span><b class="plate-score">${best ?? "—"}</b></div>
     <div class="board-wrap">${board(lobbyDarts)}</div>`,
    `<section class="lobby" aria-labelledby="lobby-title">
       <h1 id="lobby-title" class="sr">Dartshift · Nine Dart Rush</h1>
       <p class="tagline">Three rounds. Nine darts. Run up the score.</p>
       <div class="modes">
         ${modeButton("solo", "Solo run", "Chase your personal best.")}
         ${modeButton("duel", "Local duel", "Face a friend. Pass the phone.")}
       </div>
     </section>`,
  );
  panel
    .querySelectorAll(".lobby [data-mode]")
    .forEach((b) => (b.onclick = () => selectMode(b.dataset.mode)));
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
function help() {
  sheet(
    "How to play",
    '<ol class="steps"><li><strong>Pick up the dart.</strong><small>Touch the dart or the playfield. Swipe up at least a third of the board’s width and lift.</small></li><li><strong>Throw along your line.</strong><small>Angle left or right. A longer stroke reaches higher. Start with a straight stroke just over half a board wide.</small></li><li><strong>Finish with a flick.</strong><small>A quick finish carries higher on a flatter arc. Ease off for a lower hit. A sideways flick trims your line.</small></li></ol><p class="body-copy">Three darts per visit, three visits each. The thin inner ring triples the number. The outer ring doubles it. Bulls score 25 or 50. Highest total wins.</p><button class="primary full" id="okay">Got it</button>',
    () => ($("#okay").onclick = () => $("#modal").close()),
  );
}
function start(mode) {
  match = freshMatch(mode);
  acknowledged = -1;
  freshBest = false;
  save();
  play();
  say(
    "Round one. Swipe up at least a third of the board’s width to throw. A longer stroke or quicker finish lands higher.",
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
function plate(s, shown, round, visit, closed) {
  const duel = match.mode === "duel";
  const slots = [0, 1, 2]
    .map((i) => {
      const h = visit[i];
      if (h) return `<i class="slot thrown">${scoreAt(h.x, h.y).points}</i>`;
      return `<i class="slot${!closed && i === visit.length ? " next" : ""}"></i>`;
    })
    .join("");
  return `<div class="plate${duel ? " p" + (shown + 1) : ""}">
    <span class="plate-label who">${duel ? playerName(shown) : "Score"}</span>
    <span class="plate-label side">${duel ? playerName(1 - shown) + " · " + s.totals[1 - shown] : "Best " + (best ?? "—")}</span>
    <b class="plate-score">${s.totals[shown]}</b>
    <span class="visit"><span class="plate-label">Round ${round} / 3</span>
      <span class="slots" role="img" aria-label="${closed ? "Visit complete" : "Dart " + s.dart + " of 3"}">${slots}</span></span>
  </div>`;
}
// Score pop at the impact point, on the board itself.
function callout(hit) {
  const p = boardPosition(hit),
    h = scoreAt(hit.x, hit.y);
  const tier = h.points >= 40 ? "premium" : h.points ? "" : "miss";
  return `<div class="callout ${tier}" style="left:${((p.x + 211) / 4.22).toFixed(2)}%;top:${((p.y + 211) / 4.22).toFixed(2)}%" aria-hidden="true">${h.points ? "<b>+" + h.points + "</b>" : ""}<span>${h.points === 50 ? "Bull" : h.label}</span></div>`;
}
// What a darts caller would shout for a three-dart visit.
function caller(total) {
  if (total === 180) return "One hundred and eighty!";
  if (total >= 100) return "Ton" + (total > 100 ? " " + (total - 100) : "");
  return total ? "" : "No score";
}
const throwControl = `<button class="throw-control" id="throw" aria-label="Throw dart" aria-describedby="throw-keys">
    <span class="dart-grip">${readyDart}</span>
    <b class="hint">Swipe up to throw</b><small>At least ⅓ board width · Flick faster for height</small>
  </button>
  <span class="sr" id="throw-keys">Swipe up at least a third of the board’s width. On a keyboard, aim with the arrows, then press and release Space or Enter. Shift and arrows fine-tune your aim.</span>`;

function play(impactClass = "", leaving = false) {
  const s = status(match),
    n = match.hits.length;
  if (s.complete) {
    finish(impactClass);
    return;
  }
  const duel = match.mode === "duel";
  const between = n > 0 && n % 3 === 0 && acknowledged !== n;
  const shown = between && duel ? 1 - s.player : s.player;
  const visit = match.hits.slice(n - (between ? 3 : n % 3));
  const round = between ? Math.floor((n - 1) / (duel ? 6 : 3)) + 1 : s.round;
  // After a handoff the last visit's darts stay just long enough to be pulled.
  const onBoard = leaving ? match.hits.slice(-3) : visit;
  let card = "";
  if (between) {
    const total = visitTotal(visit);
    const tier = total >= 100 ? " big" : total ? "" : " flat";
    card = `<section class="card handoff${tier}${duel ? " p" + (s.player + 1) : ""}" aria-labelledby="visit-title">
      <p class="eyelabel">${duel ? playerName(shown) + " · " : ""}Visit complete</p>
      <h2 id="visit-title"><span class="visit-total">${total}</span><span class="caller">${caller(total)}</span></h2>
      <p class="standings">${duel ? `<span class="p1">Player 1 · ${s.totals[0]}</span><span class="p2">Player 2 · ${s.totals[1]}</span>` : `<span>Total · ${s.totals[0]}</span><span>Best · ${best ?? "—"}</span>`}</p>
      <button class="primary big" id="next">${duel ? "Pass to " + playerName(s.player) : "Start round " + s.round}${icon("arrow")}</button>
    </section>`;
    if (total >= 100 && impactClass) moment("ton");
  }
  render(
    between ? "step" : "oche",
    `<div class="field gameplay">
       ${plate(s, shown, round, visit, between)}
       <div class="board-wrap">${board(onBoard, impactClass)}${impactClass && visit.length ? callout(visit.at(-1)) : ""}</div>
       ${between ? "" : throwControl}
     </div>`,
    card,
  );
  if (leaving)
    stage.querySelectorAll(".landed").forEach((g) => g.classList.add("leaving"));
  if (between) {
    bindTurnButton($("#next"), () => {
      acknowledged = n;
      save();
      play("", true);
      say(
        "Round " + s.round + ", " + (duel ? playerName(s.player) : "your turn"),
      );
    });
    return;
  }
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
  ));
  // Re-measure the resting grip once the camera arrives at the oche.
  Promise.allSettled(stage.getAnimations().map((a) => a.finished)).then(() => {
    if (cancelAim === reset) reset();
  });
}
function land(point, held) {
  const hit = scoreAt(point.x, point.y);
  match = advance(match, point);
  const s = status(match);
  if (s.complete && match.mode === "solo") {
    freshBest = best === null || s.totals[0] > best;
    best = Math.max(best ?? 0, s.totals[0]);
  }
  save();
  const field = stage.querySelector(".field");
  field.setAttribute("aria-busy", "true");
  let sounded = false;
  function contact() {
    if (!sounded && !muted) impact(hit.points);
    sounded = true;
  }
  const flight = flyDart(field, point, held, contact, s.complete);
  if (flight && !muted) whoosh(point.pace || 0);
  function showLanding() {
    if (cancelAim !== showLanding) return;
    cancelAim = () => {};
    flight?.cancel();
    contact();
    play(hit.points >= 40 ? "impact premium" : "impact");
    if (hit.points >= 40) moment("flare");
    say(
      hit.label +
        ", " +
        hit.points +
        " points." +
        (s.complete ? " Match complete." : ""),
    );
  }
  cancelAim = showLanding;
  if (flight) flight.finished.then(showLanding, showLanding);
  else showLanding();
}
function finish(impactClass = "") {
  const s = status(match),
    { totals } = s,
    duel = match.mode === "duel";
  const title = duel
    ? totals[0] === totals[1]
      ? "Match drawn"
      : playerName(totals[0] > totals[1] ? 0 : 1) + " wins"
    : "Run complete";
  const visit = match.hits.slice(-3);
  const last = match.hits.at(-1),
    hit = scoreAt(last.x, last.y);
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
  const note = duel
    ? "Final dart · " + hit.label + " (+" + hit.points + ")"
    : freshBest
      ? "New personal best"
      : "Personal best · " + best;
  render(
    "final",
    `<div class="field">${plate(s, totals.length - 1, 3, visit, true)}
       <div class="board-wrap">${board(visit, impactClass)}${impactClass ? callout(last) : ""}</div></div>`,
    `<section class="card results${freshBest && !duel ? " record" : ""}" aria-labelledby="result-title">
      <p class="eyelabel">${duel ? "Local duel" : "Solo run"}</p>
      <h1 id="result-title">${title}</h1>
      <div class="result-score">${totals.map((t, i) => `<span class="${duel ? "p" + (i + 1) : ""}">${t}</span>`).join("<i>–</i>")}<small>PTS</small></div>
      <p class="note">${note}</p>
      <table class="results-table"><thead><tr><th>Visit</th>${totals.map((_, i) => "<th>" + (duel ? playerName(i) : "Points") + "</th>").join("")}</tr></thead><tbody>${rounds}</tbody></table>
      <div class="actions"><button class="primary" id="again">Play again ${icon("arrow")}</button><button class="secondary" id="lobby">Modes</button></div>
    </section>`,
  );
  bindTurnButton($("#again"), () => start(match.mode));
  bindTurnButton($("#lobby"), home);
  if (impactClass) {
    moment("win");
    if (!muted) fanfare();
  }
}
window.addEventListener("blur", () => cancelAim());
window.addEventListener("resize", () => cancelAim());
document.addEventListener("visibilitychange", () => {
  if (document.hidden) cancelAim();
});

// An update reload returns straight to the match it interrupted.
let resuming = false;
try {
  resuming = sessionStorage.getItem(resumeKey) === "1";
  sessionStorage.removeItem(resumeKey);
} catch {
  /* Lobby. */
}
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
              sessionStorage.setItem(resumeKey, "1");
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
