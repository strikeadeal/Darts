import { sectors, radii } from "./game.js";
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
  return (
    '<path fill="' +
    color +
    '" d="M' +
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
    ' Z"/>'
  );
}
// The local dart origin is the end of its steel point in all three poses.
export const dartPose = { length: 126, angle: -32, scaleX: 0.36, scaleY: 0.3 };

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
  <linearGradient id="near-fin" x2=".9" y2=".75">
    <stop stop-color="#fc4851"/><stop offset=".55" stop-color="#d01935"/><stop offset="1" stop-color="#710f27"/>
  </linearGradient>
  <linearGradient id="fold" x2=".8" y2=".6">
    <stop stop-color="#ff6b6e"/><stop offset=".48" stop-color="#e92543"/><stop offset="1" stop-color="#a2112c"/>
  </linearGradient>
  <g id="dart-model">
    <path d="M0 0 2.1 19h-4.2Z" fill="url(#steel)"/>
    <path d="M-2.1 15q-3.1 2-3.1 6v21q0 3 2.3 5h5.8q2.3-2 2.3-5V21q0-4-3.1-6Z" fill="url(#steel)"/>
    ${barrelGrooves}
    <path d="M-3 46q3 1 6 0l1.2 33-3.6 25-4-25Z" fill="url(#red-shaft)"/>
    <path d="M0 78Q11 53 17 54q8 1 9 9l-5 28L3 113Z" fill="#9d1732"/>
    <path d="M0 78 16 56 7 90 2 103Z" fill="#ce2940"/>
    <path d="M1 82Q-12 59-24 62q-8 2-7 12l4 23q1 5 6 9l19 17 5-14Z" fill="url(#near-fin)"/>
    <path d="M-28 67q4-7 14 0l15 19-3 21Z" fill="url(#fold)"/>
    <path d="M-27 66q5-4 11 .2" fill="none" stroke="#ffb3ad" stroke-width=".9"/>
    <path d="M2 81q13-14 22-15 6 0 6 7l-2 23q-1 7-5 11L6 125l-7-6Z" fill="url(#near-fin)"/>
    <path d="M3 81q12-12 21-14L8 103l-2 21-6-6Z" fill="url(#fold)"/>
    <path d="m1 79 2 4-3 35-3-5Z" fill="#670e22"/>
  </g>`;

export const readyDart = `<svg class="ready-dart" viewBox="-33 0 66 ${dartPose.length}" aria-hidden="true"><use href="#dart-model"/></svg>`;

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

export function board(hits, impactClass = "") {
  const { angle, scaleX, scaleY } = dartPose;
  const darts = hits
    .map(({ x, y }, i) => {
      const effect = i === hits.length - 1 ? impactClass : "";
      return `<g class="landed ${effect}" transform="translate(${x} ${y})">
      <circle class="impact-ring" r="13" fill="none" stroke-width="2"/>
      <g transform="rotate(-45)">
        <path d="M0 0 2 21 8 25 7 42 2 46-5 39-6 26-1 23Z" fill="#110f10" opacity=".36"/>
      </g>
      <use href="#dart-model" transform="rotate(${angle}) scale(${scaleX} ${scaleY})"/>
    </g>`;
    })
    .join("");
  return `<svg class="board" viewBox="-211 -211 422 422" aria-label="Dartboard, twenty at the top">${face}${darts}</svg><span id="sight" hidden></span>`;
}
