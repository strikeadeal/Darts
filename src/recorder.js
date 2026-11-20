// Loaded only from the hidden stroke diagnostics.
import { tune } from "./throw.js";

const flag = "dartshift.recording";
// IndexedDB keeps the export out of the synchronous game-save quota. Pending or
// failed writes stay available in memory, including when export follows a throw.
const pending = new Map();
let database;
function openDB() {
  return database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open("dartshift.strokes", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("strokes", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function persist(row) {
  pending.set(row.id, row);
  try {
    const tx = (await openDB()).transaction("strokes", "readwrite");
    tx.oncomplete = () => pending.delete(row.id);
    tx.objectStore("strokes").put(row);
  } catch { /* Available in the current session. */ }
}
const makeId = () => Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16).padStart(8, "0")).join("");
let profile = "Casual", session;
const profiles = ["First time", "Casual", "Practised"];
let active = false, target = "Bull", frameMs = [], generation = 0;
const aims = ["Bull", "T20", "D16", "Soft bull", "Hard bull"];

export function rawSample(event, type) {
  return { type, x: event.clientX, y: event.clientY, t: event.timeStamp };
}

// WebKit exposes delivered animation frames, not the panel's rated refresh.
// Keep the intervals so an analyst can distinguish throttling from a stable rate.
function measureFrames() {
  const run = ++generation;
  frameMs = [];
  let previous;
  function frame(now) {
    if (!active || run !== generation) return;
    if (previous !== undefined && now > previous) frameMs.push(now - previous);
    previous = now;
    if (frameMs.length < 40) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
function setActive(on) {
  if (on && !session) session = makeId();
  if (!on) session = undefined;
  active = on;
  try {
    if (on) localStorage.setItem(flag, JSON.stringify({target, profile, session}));
    else localStorage.removeItem(flag);
  } catch { /* The current session can still export. */ }
  if (on) {
    measureFrames();
    window.addEventListener("orientationchange", measureFrames);
    window.addEventListener("pageshow", measureFrames);
  } else {
    window.removeEventListener("orientationchange", measureFrames);
    window.removeEventListener("pageshow", measureFrames);
  }
}

export function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(flag));
    if (aims.includes(saved?.target) && profiles.includes(saved.profile)) {
      ({target, profile, session} = saved);
      setActive(true);
    }
  } catch { /* Storage is optional. */ }
}
export function begin(event, width) {
  if (!active) return;
  const row = {
    id: makeId(), session, date: new Date().toISOString(), target, profile, width,
    model: "flick", inputTune: {...tune.input},
    viewport: [innerWidth, innerHeight], screen: [screen.width, screen.height],
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    dpr: devicePixelRatio, standalone: matchMedia("(display-mode: standalone)").matches,
    userAgent: navigator.userAgent, pointerType: event.pointerType,
    frameIntervalsMs: [...frameMs], strokeFrameTimesMs: [], raw: [],
  };
  // ProMotion may change cadence after pickup. Collect frames only while
  // this recorded pointer is down and preserve the short pre-session baseline.
  let frame = requestAnimationFrame(track);
  function track(time) {
    row.strokeFrameTimesMs.push(time);
    frame = requestAnimationFrame(track);
  }
  return {
    sample(event, type) { row.raw.push(rawSample(event, type)); },
    finish(outcome, reading = null, landing = null) {
      cancelAnimationFrame(frame);
      const times = row.strokeFrameTimesMs;
      const during = times.slice(1).map((time, i) => time - times[i]).filter(ms => ms > 0);
      const useStroke = during.length >= 2;
      const intervals = (useStroke ? during : [...row.frameIntervalsMs]).sort((a,b) => a - b);
      row.refreshHz = intervals.length ? 1000 / intervals[Math.floor(intervals.length / 2)] : null;
      row.refreshSource = useStroke ? "stroke" : "baseline";
      Object.assign(row, { outcome, reading, landing });
      persist(row);
    },
  };
}
async function rows() {
  const records = new Map(pending);
  try {
    const db = await openDB();
    const saved = await new Promise((resolve, reject) => {
      const request = db.transaction("strokes").objectStore("strokes").getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    for (const row of saved) records.set(row.id, row);
  } catch { /* Include the in-memory attempts if storage is unavailable. */ }
  return [...records.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// Prepare the File before the click. iOS sharing needs user activation.
export async function controls(sheet) {
  const strokes = await rows();
  const file = new File([JSON.stringify({ schema: 1, strokes })],
    "dartshift-strokes.json", { type: "application/json" });
  sheet("Stroke recorder", `<p class="body-copy" role="status" id="record-count"></p>
    <label>Player <select id="record-profile">${profiles.map(p => `<option>${p}</option>`).join("")}</select></label>
    <label>Intended throw <select id="record-target">${aims.map(a => `<option>${a}</option>`).join("")}</select></label>
    <button class="primary full" id="record-toggle"></button>
    <button class="primary full" id="record-export">Export JSON</button>`, () => {
    const player = document.querySelector("#record-profile");
    player.value = profile;
    player.onchange = () => { profile = player.value; if (active) setActive(true); };
    const select = document.querySelector("#record-target");
    select.value = target;
    select.onchange = () => { target = select.value; if (active) setActive(true); };
    const status = document.querySelector("#record-count");
    status.textContent = (active ? "Recording" : "Stopped") + " · " + strokes.length + " attempts" +
      (pending.size ? " · Export before closing the app" : "");
    const toggle = document.querySelector("#record-toggle");
    toggle.textContent = active ? "Stop recording" : "Start recording";
    toggle.onclick = () => { setActive(!active); document.querySelector("#modal").close(); };
    const button = document.querySelector("#record-export");
    button.disabled = !strokes.length;
    button.onclick = async () => {
      if (navigator.canShare?.({files: [file]})) {
        try { await navigator.share({files: [file]}); return; }
        catch (err) { if (err.name === "AbortError") return; }
      }
      const link = document.createElement("a");
      link.href = URL.createObjectURL(file);
      link.download = file.name;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 60000);
    };
  });
}
