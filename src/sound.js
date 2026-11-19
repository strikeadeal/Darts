let context, noise;
export function unlock() {
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    context ??= new Audio();
    if (context.state !== "running") context.resume().catch(() => {});
  } catch {
    /* Visual feedback always works. */
  }
}
const ready = () => context?.state === "running";
function tone(hz, end, delay, length, wave, level) {
  const t = context.currentTime;
  const osc = context.createOscillator(),
    gain = context.createGain();
  osc.type = wave;
  osc.frequency.setValueAtTime(hz, t + delay);
  osc.frequency.exponentialRampToValueAtTime(end, t + delay + length);
  gain.gain.setValueAtTime(level, t + delay);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + delay + length);
  osc.connect(gain);
  gain.connect(context.destination);
  osc.start(t + delay);
  osc.stop(t + delay + length);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
}
export function impact(points) {
  if (!ready()) return;
  tone(points ? 220 : 95, 48, 0, 0.095, "triangle", 0.24);
  tone(1250, 160, 0, 0.028, "sawtooth", 0.06);
  if (points >= 40) {
    tone(660, 660, 0.075, 0.09, "sine", 0.08);
    tone(990, 990, 0.14, 0.14, "sine", 0.07);
  }
}
// Air past the flights: a short band-passed noise sweep, brighter on a quick release.
export function whoosh(pace) {
  if (!ready()) return;
  const t = context.currentTime,
    length = 0.17;
  if (!noise) {
    noise = context.createBuffer(1, context.sampleRate * length, context.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const src = context.createBufferSource(),
    band = context.createBiquadFilter(),
    gain = context.createGain();
  src.buffer = noise;
  band.type = "bandpass";
  band.Q.value = 1.4;
  band.frequency.setValueAtTime(650, t);
  band.frequency.exponentialRampToValueAtTime(2400 + pace * 700, t + length);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.11, t + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  src.connect(band);
  band.connect(gain);
  gain.connect(context.destination);
  src.start(t);
  src.onended = () => {
    src.disconnect();
    band.disconnect();
    gain.disconnect();
  };
}
export function fanfare() {
  if (!ready()) return;
  [523, 659, 784, 1047].forEach((hz, i) =>
    tone(hz, hz, 0.22 + i * 0.09, i === 3 ? 0.42 : 0.12, "triangle", 0.09),
  );
}
