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
function boardFace() {
  const beds = sectors
    .map((n, i) => {
      const a = i * 18 - 9,
        b = a + 18;
      const single = i % 2 ? "#eadcb8" : "#222625";
      const ring = i % 2 ? "#278573" : "#e34d32";
      const [x, y] = polar(i * 18, 186);
      return (
        band(a, b, radii.outerBull, radii.trebleIn, single) +
        band(a, b, radii.trebleIn, radii.trebleOut, ring) +
        band(a, b, radii.trebleOut, radii.doubleIn, single) +
        band(a, b, radii.doubleIn, radii.edge, ring) +
        '<text x="' +
        x +
        '" y="' +
        (y + 5.8) +
        '" stroke="none" fill="#f4ebd3" text-anchor="middle">' +
        n +
        "</text>"
      );
    })
    .join("");
  return (
    '<circle r="203" fill="#161918" stroke="#60605a" stroke-width="2"/><circle r="199" fill="none" stroke="#343836"/><g stroke="#bab19a" stroke-width=".85">' +
    beds +
    '<circle r="' +
    radii.outerBull +
    '" fill="#278573"/><circle r="' +
    radii.bull +
    '" fill="#e34d32"/></g>'
  );
}
const face = boardFace();
export function board(hits, impactClass = "") {
  const darts = hits
    .map(({ x, y }, i) => {
      const effect = i === hits.length - 1 ? impactClass : "";
      return `<g class="landed ${effect}" transform="translate(${x} ${y})">
      <circle class="impact-ring" r="13" fill="none" stroke-width="2"/>
      <g class="shaft">
        <path d="M0 0 14 -20" stroke="#0d1011" stroke-width="5"/>
        <path d="M0 0 14 -20" stroke="#efefdd" stroke-width="2.3"/>
        <path d="m10-14 2-10 9-8-1 10-6 6z" fill="#ff7045" stroke="#211813" stroke-width="1"/>
      </g>
    </g>`;
    })
    .join("");
  return `<svg class="board" viewBox="-211 -211 422 422" aria-label="Dartboard, twenty at the top">
    ${face}${darts}</svg><span id="sight" hidden></span>`;
}
