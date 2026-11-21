// Each change's share of the difficulty, for difficulty.mjs --ablate. Every entry
// edits src/throw.js's tune in place and returns a function that restores it.
const set = (tune, values) => {
  const saved = Object.fromEntries(Object.keys(values).map((k) => [k, tune.input[k]]));
  Object.assign(tune.input, values);
  return () => Object.assign(tune.input, saved);
};
const noQuality = { outside: 0, bendCost: 0, slowdownCost: 0 };
// The old balance of height: length-led at 700 mm per board width, and a speed
// effect of 32 mm per 2.8 widths/s at the neutral speed (22 mm per doubling).
const lengthLed = { reach: 700, height: 22 };
export const ablations = [
  // Cumulative: before → + speed → + stroke quality → + sensitivity (= after).
  ["+ speed sets height", (t) => set(t, { ...noQuality, sensitivity: 1 })],
  ["+ stroke quality", (t) => set(t, { sensitivity: 1 })],
  ["+ sensitivity (= after)", () => () => {}],
  // Each one taken out of the finished throw.
  ["after without speed", (t) => set(t, lengthLed)],
  ["after without stroke quality", (t) => set(t, noQuality)],
  ["after without sensitivity", (t) => set(t, { sensitivity: 1 })],
];
