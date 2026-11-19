let context;
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
export function impact(points) {
  if (context?.state !== "running") return;
  const t = context.currentTime;
  function tone(hz, end, delay, length, wave, level) {
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
  tone(points ? 220 : 95, 48, 0, 0.095, "triangle", 0.24);
  tone(1250, 160, 0, 0.028, "sawtooth", 0.06);
  if (points >= 40) {
    tone(660, 660, 0.075, 0.09, "sine", 0.08);
    tone(990, 990, 0.14, 0.14, "sine", 0.07);
  }
}
