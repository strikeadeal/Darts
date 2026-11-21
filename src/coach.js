// What the next dart's prompt says after a throw that went astray. Pure, so it
// is tested on its own (tests/coach.test.js). It only reads the release
// (src/throw.js readStroke); it never changes where a dart lands.
import { tune } from "./throw.js";

// While a device is still learning (src/game.js learnDarts), a clean dart this
// far from the bull, in board mm, gets a tip relative to the bull, the target
// How to play starts players on. After that only faults and darts off the board
// are coached, so a player aiming at treble 20 is never told to flick softer.
export const nearBull = 50;

export function coach(stroke, { x, y }, learning = false) {
  const [fault, mm] = Object.entries(stroke?.faults || {}).sort((a, b) => b[1] - a[1])[0] || [];
  if (mm >= 6)
    return {
      bend: "Keep the stroke straight",
      slowdown: "Let go while still flicking",
      speed: stroke.speed > tune.input.fast ? "Too hard · flick softer" : "Too soft · flick harder",
    }[fault];
  if (!stroke) return "";
  const r = Math.hypot(x, y);
  if (r > 170) {
    if (Math.abs(x) > Math.abs(y)) return "Too wide · straighten your line";
    return y < 0 ? "Too high · flick softer" : "Too low · flick harder";
  }
  if (!learning || r <= nearBull) return "";
  if (Math.abs(x) > Math.abs(y)) return "Wide · straighten your line";
  return y < 0 ? "Above the bull · flick softer" : "Below the bull · flick harder";
}
