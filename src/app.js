import { freshMatch, decodeMatch, status, advance, scoreAt } from "./game.js";
import { icon, board, readyDart } from "./art.js";
import { bindThrows, bindTurnButton, flyDart } from "./input.js";
import { unlock, impact } from "./sound.js";

const $ = (s) => document.querySelector(s);
const key = "dartshift.save.v1";
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
$("#help").innerHTML = icon("help") + "<span>How to play</span>";
$("#help").onclick = help;
$("#brand").onclick = home;
audioButton();
function record() {
  $("#record").innerHTML =
    icon("trophy") +
    '<span class="mini">Personal best</span><b>' +
    (best === null ? "—" : best + " pts") +
    "</b>";
}
function home() {
  cancelAim();
  const modeButton = (mode, title, detail) => {
    const resume = match?.mode === mode && !status(match).complete;
    return (
      '<button class="mode ' +
      mode +
      '" data-mode="' +
      mode +
      '"><span class="mode-mark">' +
      icon(mode) +
      '</span><span class="mode-copy"><strong>' +
      (resume ? "Resume " + title : title) +
      "</strong><small>" +
      (resume
        ? "Round " + status(match).round + " of 3 · Saved on this device"
        : detail) +
      "</small></span>" +
      icon("arrow") +
      "</button>"
    );
  };
  $("#main").innerHTML =
    '<section class="hero" aria-labelledby="hero-title"><div class="hero-copy"><div class="kicker"><i class="slashes"></i> High score arcade</div><h1 id="hero-title">NINE DART<span>RUSH</span></h1><p>Three rounds. Nine darts. Run up the score.</p></div></section><section class="select"><h2>Select a mode</h2><div class="modes">' +
    modeButton("solo", "Solo run", "Chase your personal best.") +
    modeButton("duel", "Local duel", "Face a friend. Pass the phone.") +
    "</div></section>";
  document
    .querySelectorAll("[data-mode]")
    .forEach((b) => (b.onclick = () => selectMode(b.dataset.mode)));
  record();
}
function sheet(title, body, bind) {
  cancelAim();
  $("#sheet").innerHTML =
    '<div class="sheet-head"><h2 id="sheet-title">' +
    title +
    '</h2><button aria-label="Close" class="square" id="close">' +
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
    '<ol class="steps"><li><strong>Swipe up and lift.</strong><small>Start on the dart and swipe up at least a third of the board’s width.</small></li><li><strong>Angle your swipe.</strong><small>Swipe left or right as you move up to choose your line.</small></li><li><strong>Choose your distance.</strong><small>A longer swipe reaches higher. Aim for three-quarters of a board width for the bull.</small></li></ol><p class="body-copy">Three darts per visit, three visits each. The thin inner ring triples the number. The outer ring doubles it. Bulls score 25 or 50. Highest total wins.</p><button class="primary full" id="okay">Got it</button>',
    () => ($("#okay").onclick = () => $("#modal").close()),
  );
}
function start(mode) {
  match = freshMatch(mode);
  acknowledged = -1;
  save();
  play();
  say(
    "Round one. Swipe up at least a third of the board’s width to throw. A longer swipe lands higher.",
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
const playerName = (i) => "Player " + (i + 1);
function play(impactClass = "") {
  cancelAim();
  const s = status(match),
    n = match.hits.length;
  if (s.complete) {
    finish();
    return;
  }
  const duel = match.mode === "duel";
  const between = n > 0 && n % 3 === 0 && acknowledged !== n;
  const shownPlayer = between && duel ? 1 - s.player : s.player;
  const hits = match.hits.slice(n - (between ? 3 : n % 3));
  const last = n ? scoreAt(match.hits[n - 1].x, match.hits[n - 1].y) : null;
  const lastHit =
    last && hits.length
      ? "<strong>+" + last.points + "</strong>" + last.label
      : "";
  const action = between
    ? '<div class="between"><button class="primary" id="next">' +
      (duel ? "Pass to " + playerName(s.player) : "Start round " + s.round) +
      icon("arrow") +
      "</button></div>"
    : `<button class="throw-control" id="throw" aria-label="Throw dart" aria-describedby="throw-keys">
         <span class="dart-grip">${readyDart}</span>
         <b>Swipe up to throw</b><small>Swipe at least ⅓ of the board’s width</small>
       </button>
       <span class="sr" id="throw-keys">Swipe up at least a third of the board’s width. On a keyboard, aim with the arrows, then press and release Space or Enter. Shift and arrows fine-tune your aim.</span>`;
  const round = between ? Math.floor((n - 1) / (duel ? 6 : 3)) + 1 : s.round;
  const remaining = between ? 0 : 4 - s.dart;
  const opponent = duel
    ? '<span class="opponent">' +
      playerName(1 - shownPlayer) +
      " · " +
      s.totals[1 - shownPlayer] +
      "</span>"
    : "";
  const pips = [0, 1, 2]
    .map((i) => `<i class="${i < remaining ? "left" : ""}"></i>`)
    .join("");
  $("#main").innerHTML = `
    <section class="stage gameplay">
      <div class="stage-head">
        <button class="square" id="back" aria-label="Save and return home">${icon("back")}</button>
        <div><div class="eyelabel">${duel ? "Local duel" : "Solo run"}</div><h1>Nine Dart Rush</h1></div>
        <span class="round-pill">ROUND 0${round} / 03</span>
      </div>
      <div class="play-grid">
        <div class="arena">
          <div class="scoreline">
            <div><div class="eyelabel">${duel ? playerName(shownPlayer) : "Your score"}</div>
              <div class="score-num">${s.totals[shownPlayer]}${opponent}</div></div>
            <div class="throw-count"><div class="eyelabel">${between ? "Visit complete" : "Dart " + s.dart + " of 3"}</div>
              <div class="pips">${pips}</div></div>
          </div>
          <div class="board-wrap">${board(hits, impactClass)}</div>
          <div class="hitline">${lastHit}</div>
        </div>
        ${action}
      </div>
    </section>`;
  $("#back").onclick = home;
  if (between)
    bindTurnButton($("#next"), () => {
      acknowledged = n;
      save();
      play();
      say(
        "Round " + s.round + ", " + (duel ? playerName(s.player) : "your turn"),
      );
    });
  else
    cancelAim = bindThrows($(".play-grid"), wakeAudio, land, (hint) => {
      $(".hitline").textContent = hint;
      say(hint);
    });
}
function land(point) {
  const keyboard = document.activeElement?.id === "throw";
  const hit = scoreAt(point.x, point.y);
  match = advance(match, point);
  const s = status(match);
  if (s.complete && match.mode === "solo")
    best = Math.max(best ?? 0, s.totals[0]);
  save();
  const field = $(".play-grid");
  field.setAttribute("aria-busy", "true");
  const flight = flyDart(field, point);
  function showLanding() {
    if (cancelAim !== showLanding) return;
    cancelAim = () => {};
    flight?.cancel();
    if (!muted) impact(hit.points);
    play(hit.points >= 40 ? "impact premium" : "impact");
    $(".hitline")?.classList.add("flash");
    say(
      hit.label +
        ", " +
        hit.points +
        " points." +
        (s.complete ? " Match complete." : ""),
    );
    if (keyboard)
      ($("#throw") || $("#next") || $("#again"))?.focus({
        preventScroll: true,
      });
    record();
  }
  cancelAim = showLanding;
  if (flight) flight.finished.then(showLanding, showLanding);
  else showLanding();
}
function finish() {
  const { totals } = status(match),
    duel = match.mode === "duel";
  const title = duel
    ? totals[0] === totals[1]
      ? "Match drawn"
      : playerName(totals[0] > totals[1] ? 0 : 1) + " wins"
    : "Run complete";
  const last = match.hits.at(-1),
    hit = scoreAt(last.x, last.y);
  const rounds = [0, 1, 2]
    .map((r) => {
      const cells = totals
        .map((_, p) => {
          const offset = (r * totals.length + p) * 3;
          const sum = match.hits
            .slice(offset, offset + 3)
            .reduce((v, h) => v + scoreAt(h.x, h.y).points, 0);
          return "<td>" + sum + "</td>";
        })
        .join("");
      return "<tr><td>Round " + (r + 1) + "</td>" + cells + "</tr>";
    })
    .join("");
  $("#main").innerHTML =
    '<section class="finish"><div class="kicker"><i class="slashes"></i>' +
    (duel ? "Local duel" : "Solo run") +
    "</div><h1>" +
    title +
    '</h1><div class="result-score">' +
    totals.join(" – ") +
    ' <small>PTS</small></div><p class="body-copy">Final dart · ' +
    hit.label +
    " (+" +
    hit.points +
    ')</p><table class="results-table"><thead><tr><th>Visit</th>' +
    totals
      .map((_, i) => "<th>" + (duel ? playerName(i) : "Points") + "</th>")
      .join("") +
    "</tr></thead><tbody>" +
    rounds +
    '</tbody></table><div class="stack"><button class="primary" id="again">Play again ' +
    icon("arrow") +
    '</button><button class="secondary" id="lobby">Back to modes</button></div></section>';
  bindTurnButton($("#again"), () => start(match.mode));
  bindTurnButton($("#lobby"), home);
}
window.addEventListener("blur", () => cancelAim());
window.addEventListener("resize", () => cancelAim());
document.addEventListener("visibilitychange", () => {
  if (document.hidden) cancelAim();
});
home();

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
