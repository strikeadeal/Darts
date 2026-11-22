import { sectors, radii, cricketTargets } from "./game.js";
import { boardPosition, entryPose, tune } from "./throw.js";
const paths = {
  wing: '<path fill="currentColor" stroke="none" d="M1 5 25 3l-2.5 5H7zm7 5h14l-2 4h-7zm6 6h5l-2 4z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9a2.6 2.6 0 1 1 4.4 2c-1.2.9-2 1.3-2 3m0 2v.2"/>',
  sound:
    '<path d="M3 9h4l5-4v14l-5-4H3zM16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  muted: '<path d="M3 9h4l5-4v14l-5-4H3zM16 9l6 6m0-6-6 6"/>',
  solo: '<circle cx="12" cy="8" r="3.6"/><path d="M4 21v-2a8 8 0 0 1 16 0v2z"/>',
  duel: '<circle cx="9" cy="8" r="3.3"/><path d="M2 20v-2a7 7 0 0 1 14 0v2zm14-15a3.4 3.4 0 0 1 0 6m2 3a6 6 0 0 1 4 6h-3"/>',
  arrow: '<path d="M3 12h17m-7-7 7 7-7 7"/>',
  trophy:
    '<path d="M7 4h10v6a5 5 0 0 1-10 0zM7 6H3v2a5 5 0 0 0 5 5m9-7h4v2a5 5 0 0 1-5 5m-4 2v5m-4 1h8"/>',
  close: '<path d="m5 5 14 14m0-14L5 19"/>',
  back: '<path d="M20 12H4m7-7-7 7 7 7"/>',
  target:
    '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  dart: '<path d="m2 22 12-12m0 0V5l5-4v5h4l-5 5z"/>',
};
export const icon = (name) =>
  '<svg class="icon" aria-hidden="true" viewBox="0 0 26 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
  paths[name] +
  "</svg>";

const polar = (deg, r) => [
  Math.sin((deg * Math.PI) / 180) * r,
  -Math.cos((deg * Math.PI) / 180) * r,
];
function band(a, b, inner, outer, color) {
  return '<path fill="' + color + '" d="' + bandPath(a, b, inner, outer) + '"/>';
}
function bandPath(a, b, inner, outer) {
  return (
    "M" +
    polar(a, inner) +
    " L" +
    polar(a, outer) +
    " A" +
    outer +
    "," +
    outer +
    " 0 0 1 " +
    polar(b, outer) +
    " L" +
    polar(b, inner) +
    " A" +
    inner +
    "," +
    inner +
    " 0 0 0 " +
    polar(a, inner) +
    " Z"
  );
}
const barrelGrooves = [21, 24, 28, 34, 37, 41]
  .map(
    (y) =>
      `<path d="M-4.7 ${y} q4.7 1.6 9.4 0" fill="none" stroke="#252d31" stroke-width="1.25"/>
   <path d="M-4.7 ${y + 0.9} q4.7 1.6 9.4 0" fill="none" stroke="#eef4f3" stroke-opacity=".65" stroke-width=".65"/>`,
  )
  .join("");

const dartDefinitions = `
  <linearGradient id="steel">
    <stop stop-color="#546269"/><stop offset=".19" stop-color="#b6c6c9"/>
    <stop offset=".34" stop-color="#fff"/><stop offset=".48" stop-color="#d3dcd9"/>
    <stop offset=".71" stop-color="#768389"/><stop offset="1" stop-color="#374047"/>
  </linearGradient>
  <linearGradient id="red-shaft">
    <stop stop-color="#8a1021"/><stop offset=".28" stop-color="#ff6770"/>
    <stop offset=".48" stop-color="#e43543"/><stop offset="1" stop-color="#700c1e"/>
  </linearGradient>
  <g id="dart-body">
    <path d="M0 0 2.1 19h-4.2Z" fill="url(#steel)"/>
    <path d="M-2.1 15q-3.1 2-3.1 6v21q0 3 2.3 5h5.8q2.3-2 2.3-5V21q0-4-3.1-6Z" fill="url(#steel)"/>
    ${barrelGrooves}
    <path d="M-3 46q3 1 6 0l1.2 33-3.6 25-4-25Z" fill="url(#red-shaft)"/>
  </g>
  <g id="dart-fin" transform="scale(.77 1)">
    <path d="M0 76Q15 58 24 60Q30 61 30 68L26 94Q25 100 19 106L0 125Z" stroke="#771e2a" stroke-width=".6"/>
    <path d="M0 76Q17 60 24 62L0 110Z" fill="#ff8a76" opacity=".42"/>
  </g>`;

// The tip is the origin. The shaft axis points towards the camera, with
// screen components ax, ay. Project four vanes around it using two radial
// unit vectors. Order them far-to-near so the folds pass in front on roll.
const modelLength = 126;
function geometry({ ax, ay, roll }) {
  const az = Math.sqrt(Math.max(0, 1 - ax * ax - ay * ay));
  const h = Math.hypot(ax, az);
  const body = `rotate(${(Math.atan2(-ax, ay) * 180) / Math.PI}) scale(1 ${Math.hypot(ax, ay)})`;
  const fins = [];
  for (let i = 0; i < 4; i++) {
    const angle = roll + (i * Math.PI) / 2;
    const c = Math.cos(angle),
      s = Math.sin(angle);
    const rx = (az * c - ax * ay * s) / h,
      ry = h * s;
    const rz = (-ax * c - ay * az * s) / h;
    fins.push({
      transform: `matrix(${rx} ${ry} ${ax} ${ay} 0 0)`,
      depth: rz,
      light: Math.round(37 + 13 * Math.cos(angle - 0.7)),
    });
  }
  return { body, fins: fins.sort((a, b) => a.depth - b.depth) };
}

function model(pose) {
  const { body, fins } = geometry(pose);
  return (
    `<use href="#dart-body" transform="${body}"/>` +
    fins
      .map(
        (fin) =>
          `<use href="#dart-fin" transform="${fin.transform}" fill="hsl(352,76%,${fin.light}%)"/>`,
      )
      .join("")
  );
}

// Only this foreground subtree changes during flight. The barrel and four fins reuse static paths.
export function poseModel(group, pose) {
  const { body, fins } = geometry(pose);
  group.children[0].setAttribute("transform", body);
  fins.forEach((fin, i) => {
    const vane = group.children[1 + i];
    vane.setAttribute("transform", fin.transform);
    vane.setAttribute("fill", `hsl(352,76%,${fin.light}%)`);
  });
}
export const rest = {
  ax: 0,
  ay: tune.hand.pitch,
  roll: tune.hand.roll,
};
export const readyDart = `<svg class="ready-dart" viewBox="-33 0 66 ${modelLength}" aria-hidden="true"><g>${model(rest)}</g></svg>`;

function shadow(pose) {
  const f = tune.flight,
    factor = f.length / modelLength;
  const ax = pose.ax + f.shadowX,
    ay = pose.ay + f.shadowY;
  const angle = (Math.atan2(-ax, ay) * 180) / Math.PI;
  return `<path transform="scale(${factor}) rotate(${angle}) scale(1 ${Math.hypot(ax, ay)})" d="M0 0 3 18 4 45 2 74 18 62 19 92 1 125 -14 99 -17 65 -2 75 -3 45 -3 18Z" fill="#080909" opacity=".45"/>`;
}
// Drawn about the impact point; the flight slides it in on its own small layer.
export const approachShadow = (hit) => shadow(entryPose(hit));

function boardFace() {
  const beds = [],
    spokes = [],
    numbers = [];
  sectors.forEach((number, i) => {
    const a = i * 18 - 9,
      b = a + 18;
    const single = i % 2 ? "#f2f0e6" : "#17191a";
    const ring = i % 2 ? "#128959" : "#c52639";
    beds.push(
      band(a, b, radii.outerBull, radii.trebleIn, single),
      band(a, b, radii.trebleIn, radii.trebleOut, ring),
      band(a, b, radii.trebleOut, radii.doubleIn, single),
      band(a, b, radii.doubleIn, radii.edge, ring),
    );
    spokes.push(`M${polar(a, radii.outerBull)}L${polar(a, radii.edge)}`);
    const [x, y] = polar(i * 18, 185);
    numbers.push(`<text x="${x}" y="${y + 6.5}">${number}</text>`);
  });
  const hoops = Object.values(radii)
    .map((r) => `<circle r="${r}"/>`)
    .join("");
  return `<defs>
    ${dartDefinitions}
    <linearGradient id="sidewall"><stop stop-color="#121314"/><stop offset=".19" stop-color="#585651"/><stop offset=".53" stop-color="#33312e"/><stop offset=".89" stop-color="#141516"/><stop offset="1" stop-color="#08090a"/></linearGradient>
    <linearGradient id="rim" x2=".86" y2="1"><stop stop-color="#8b8b80"/><stop offset=".42" stop-color="#383a39"/><stop offset=".72" stop-color="#151718"/><stop offset="1" stop-color="#484643"/></linearGradient>
    <linearGradient id="number-band" x2=".45" y2="1"><stop stop-color="#292b2b"/><stop offset=".55" stop-color="#17191a"/><stop offset="1" stop-color="#101112"/></linearGradient>
    <radialGradient id="face-light" cx=".25" cy=".18" r=".95"><stop stop-color="#fff" stop-opacity=".10"/><stop offset=".51" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#25201e" stop-opacity=".13"/></radialGradient>
    <pattern id="sisal" width="49" height="49" patternUnits="userSpaceOnUse"><image width="49" height="49" href="./assets/sisal.png"/></pattern>
    <g id="wire"><path d="${spokes.join(" ")}"/>${hoops}</g>
  </defs>
  <circle cy="8" r="202" fill="url(#sidewall)" stroke="#101111"/>
  <path d="M-197 49a202 202 0 0 0 391 11" fill="none" stroke="#777369" stroke-opacity=".45" stroke-width=".8"/>
  <circle r="202" fill="url(#rim)"/><circle r="199.5" fill="url(#number-band)"/>
  ${beds.join("")}
  <circle r="${radii.outerBull}" fill="#128959"/><circle r="${radii.bull}" fill="#c52639"/>
  <circle r="${radii.edge}" fill="url(#sisal)"/><circle r="${radii.edge}" fill="url(#face-light)"/>
  <g fill="none">
    <use href="#wire" transform="translate(.6,.8)" stroke="#171315" opacity=".58" stroke-width="1.65"/>
    <use href="#wire" stroke="#d0ccc0" stroke-width="1.05"/>
    <use href="#wire" transform="translate(-.2,-.22)" stroke="#fffbee" stroke-width=".32"/>
  </g>
  <g text-anchor="middle" fill="#f7f6ed">${numbers.join("")}</g>`;
}
const face = boardFace();

export function landed(hit, effect = "") {
  const p = boardPosition(hit),
    pose = entryPose(hit);
  return `<g class="landed ${effect}" transform="translate(${p.x} ${p.y})">
      <circle class="impact-ring" r="13" fill="none" stroke-width="2"/>
      ${shadow(pose)}
      <g class="embedded" style="--settle:${tune.flight.settleMs}ms;--flex:${tune.flight.flex}deg;--rebound:${-tune.flight.flex / 2}deg">
        <g transform="scale(${tune.flight.length / modelLength})">${model(pose)}</g>
      </g></g>`;
}

// 301's finishing highlight (DECISIONS.md, "First to zero"). For a checkout()
// label: the beds that score exactly what is left (`hit`), and the other beds of
// the same number or the bulls that score more and would bust (`bust`). Each is
// { a, b, inner, outer }: degrees clockwise from the top, and board mm, the same
// edges the face is drawn from and scoreAt() reads.
const bedValue = (l) =>
  l === "Bull" ? 50 : l === "25" ? 25 : ({ T: 3, D: 2 }[l[0]] ?? 1) * Number(l.replace(/^[TD]/, ""));
export function finishBeds(label) {
  const left = bedValue(label);
  const bull = label === "Bull" || label === "25";
  const i = sectors.indexOf(Number(label.replace(/^[TD]/, ""))),
    a = i * 18 - 9;
  const rings = bull
    ? [
        [0, radii.bull, 50],
        [radii.bull, radii.outerBull, 25],
      ].map(([inner, outer, points]) => ({ a: 0, b: 360, inner, outer, points }))
    : [
        [radii.outerBull, radii.trebleIn, 1],
        [radii.trebleIn, radii.trebleOut, 3],
        [radii.trebleOut, radii.doubleIn, 1],
        [radii.doubleIn, radii.edge, 2],
      ].map(([inner, outer, m]) => ({ a, b: a + 18, inner, outer, points: m * sectors[i] }));
  return {
    number: bull ? null : sectors[i],
    hit: rings.filter((r) => r.points === left),
    bust: rings.filter((r) => r.points > left),
  };
}
const disc = (r) => (r ? `M0 ${-r}A${r} ${r} 0 1 1 0 ${r}A${r} ${r} 0 1 1 0 ${-r}Z` : "");
const shape = ({ a, b, inner, outer }) =>
  b - a === 360 ? disc(outer) + disc(inner) : bandPath(a, b, inner, outer);
// Drawn in the face's own projection, so it sits exactly on its beds. A dark
// edge under a light one reads on cream, black, red and green alike; the busting
// beds are darkened, and the number on the rim gets a badge.
export function finishMark(label) {
  if (!label) return "";
  const { number, hit, bust } = finishBeds(label);
  const d = hit.map(shape).join(""),
    no = bust.map(shape).join("");
  let badge = "";
  if (number) {
    const [x, y] = polar(sectors.indexOf(number) * 18, 185);
    badge = `<circle class="finish-badge" cx="${x}" cy="${y}" r="16"/><text x="${x}" y="${y + 6.5}">${number}</text>`;
  }
  return `<g class="enter" transform="${plane}">${no ? `<path class="finish-bust" fill-rule="evenodd" d="${no}"/>` : ""}<path class="finish-edge" fill-rule="evenodd" d="${d}"/><path class="finish-line" fill-rule="evenodd" d="${d}"/>${badge}</g>`;
}
const plane = `matrix(1 0 ${tune.camera.skew} ${tune.camera.faceHeight} 0 0)`;

// Cricket, Around the Clock and Shanghai (src/game.js boardTargets), in the same
// layer and style as 301's finish: each number to aim at is outlined over all its
// beds (the bull: both bulls), with its rim number badged. Cricket badges all
// seven targets and rings each with the thrower's marks (a third of a ring per
// mark, so it doesn't rely on colour), the bull's ring round the bull itself,
// puts a dot on those only the rival has closed, and darkens those everyone has.
// All the beds of a number, from the outer bull to the edge (the bull: both bulls),
// as { a, b, inner, outer } like finishBeds.
export const wedge = (n) => {
  if (n === 25) return { a: 0, b: 360, inner: 0, outer: radii.outerBull };
  const a = sectors.indexOf(n) * 18 - 9;
  return { a, b: a + 18, inner: radii.outerBull, outer: radii.edge };
};
const ticks = (x, y, r, marks) =>
  [0, 1, 2]
    .map((i) => {
      const [x0, y0] = polar(i * 120 + 8, r),
        [x1, y1] = polar(i * 120 + 112, r);
      return `<path class="tick${i < marks ? " on" : ""}" d="M${x + x0} ${y + y0}A${r} ${r} 0 0 1 ${x + x1} ${y + y1}"/>`;
    })
    .join("");
// A small white dot: the rival has closed this cricket target and scores on it.
const pip = (t, n, x, y) => (t.rival?.includes(n) ? `<circle class="rival" cx="${x}" cy="${y}" r="5"/>` : "");
export function targetMark(t) {
  if (!t) return "";
  const dead = t.dead || [],
    aim = t.aim.map((n) => shape(wedge(n))).join(""),
    dark = dead.map((n) => shape(wedge(n))).join("");
  const cricket = !!t.marks;
  const badges = (cricket ? cricketTargets : t.aim)
    .filter((n) => n !== 25)
    .map((n) => {
      const state = !cricket ? "" : dead.includes(n) ? " dead" : t.marks[n] === 3 ? "" : " open";
      const [x, y] = polar(sectors.indexOf(n) * 18, cricket ? 188 : 185);
      return `<g class="badge${state}"><circle class="finish-badge" cx="${x}" cy="${y}" r="${cricket ? 13.5 : 16}"/><text x="${x}" y="${y + (cricket ? 5.5 : 6.5)}">${n}</text>${cricket ? ticks(x, y, 17.5, t.marks[n]) + pip(t, n, x + 13, y - 13) : ""}</g>`;
    })
    .join("");
  const bull = cricket ? `<g class="badge">${ticks(0, 0, 21, t.marks[25])}${pip(t, 25, 21, -21)}</g>` : "";
  return `<g${cricket ? "" : ' class="enter"'} transform="${plane}">${dark ? `<path class="finish-bust" d="${dark}"/>` : ""}${aim ? `<path class="finish-edge" d="${aim}"/><path class="finish-line" d="${aim}"/>` : ""}${badges}${bull}</g>`;
}

// `mark` is the overlay on the board, { key, svg }: 301's finish (finishMark) or
// the other games' targets (targetMark), or null. The key goes in data-bed.
export function board(hits, impactClass = "", mark = null) {
  const darts = hits
    .map((hit, i) => landed(hit, i === hits.length - 1 ? impactClass : ""))
    .join("");
  return `<svg class="board" viewBox="-211 -211 422 422" role="img" aria-label="Dartboard, twenty at the top">
    <g class="board-plane" transform="matrix(1 0 ${tune.camera.skew} ${tune.camera.faceHeight} 0 0)">${face}</g></svg>
    <svg class="finish" viewBox="-211 -211 422 422" aria-hidden="true" data-bed="${(mark?.key ?? "").replaceAll('"', "&quot;")}">${mark?.svg ?? ""}</svg>
    <svg class="approach" viewBox="-100 -100 200 200" aria-hidden="true"></svg>
    <svg class="board-objects" viewBox="-211 -211 422 422" aria-hidden="true">${darts}
    <g id="sight" visibility="hidden" fill="none" stroke-width="2"><circle r="10" stroke="#151515" stroke-width="5"/><circle r="10" stroke="#fff"/><circle r="2" fill="#ff5732"/></g>
  </svg>`;
}
