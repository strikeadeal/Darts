// Viewport readout for checking the installed app on a phone. Hidden from players:
// it loads only after five quick taps on the "How to play" title (or with
// ?viewport in a Safari tab), and the same taps turn it off. Not part of play.
//
// Two bars mark the edges: amber where the room ends (--vh), cyan where the
// layout viewport ends (position:fixed; bottom:0). On a fixed build the amber bar
// sits on the bottom edge of the screen. Touch anywhere to log where the touch
// landed, as a pointer event and as a touch event.
const key = "dartshift.probe"; // present while on (src/app.js)
const lines = [];
let box, last = "none", lastTouch = "none";

const px = (css) => {
  const d = document.createElement("div");
  d.style.cssText = `position:fixed;visibility:hidden;left:0;top:0;width:1px;height:${css}`;
  document.body.append(d);
  const h = d.getBoundingClientRect().height;
  d.remove();
  return Math.round(h * 10) / 10;
};
const inset = (side) => {
  const d = document.createElement("div");
  d.style.cssText = `position:fixed;visibility:hidden;padding-top:env(safe-area-inset-${side},-1px)`;
  document.body.append(d);
  const v = getComputedStyle(d).paddingTop;
  d.remove();
  return v;
};
const rect = (sel) => {
  const r = document.querySelector(sel)?.getBoundingClientRect();
  return r ? `${Math.round(r.top)}–${Math.round(r.bottom)}` : "–";
};

function snapshot(why) {
  const vv = visualViewport;
  const now = {
    why,
    // The OS token is frozen (18.x) from iOS 26; Version/ is the real major, if present.
    ios: `${navigator.userAgent.match(/OS (\d+[_\d]*)/)?.[1]?.replace(/_/g, ".") ?? "?"} · Version/${navigator.userAgent.match(/Version\/([\d.]+)/)?.[1] ?? "–"}`,
    standalone: `${navigator.standalone} · display-mode ${matchMedia("(display-mode: standalone)").matches ? "standalone" : "browser"}`,
    screen: `${screen.width}×${screen.height} @${devicePixelRatio}`,
    inner: `${innerWidth}×${innerHeight}`,
    client: `${document.documentElement.clientWidth}×${document.documentElement.clientHeight}`,
    visual: vv ? `${Math.round(vv.width)}×${Math.round(vv.height)} top ${Math.round(vv.offsetTop)}` : "–",
    units: `100% ${px("100%")} · vh ${px("100vh")} · dvh ${px("100dvh")} · svh ${px("100svh")} · lvh ${px("100lvh")}`,
    "--vh": `${px("var(--vh)")} (${document.documentElement.style.getPropertyValue("--vh") || "css"})`,
    doc: `html ${Math.round(document.documentElement.getBoundingClientRect().height)} · body ${Math.round(document.body.getBoundingClientRect().height)} · scroll ${document.documentElement.scrollHeight} · y ${scrollY}`,
    safe: ["top", "bottom", "left", "right"].map(inset).join(" "),
    room: `scene ${rect("#scene")} · board ${rect(".board-wrap")} · throw ${rect("#throw")}`,
    grip: rect(".dart-grip"),
    pointer: last,
    touch: lastTouch,
  };
  lines.unshift(`${new Date().toLocaleTimeString()} ${why}: inner ${now.inner}, --vh ${now["--vh"]}, y ${scrollY}`);
  lines.length = Math.min(lines.length, 6);
  return now;
}

function paint(why) {
  if (!box) return;
  const now = snapshot(why);
  box.querySelector("pre").textContent =
    Object.entries(now)
      .filter(([k]) => k !== "why")
      .map(([k, v]) => `${k.padEnd(10)} ${v}`)
      .join("\n") +
    "\n\n" +
    lines.join("\n");
}

const events = ["resize", "orientationchange", "pageshow", "visibilitychange", "focus"];
const onEvent = (e) => requestAnimationFrame(() => paint(e.type));
const where = (y, target) =>
  `${Math.round(y)} on ${target.id || target.className?.baseVal || target.className || target.tagName}`;
const onTouch = (e) => {
  last = where(e.clientY, e.target);
  paint("pointer");
};
const onTouchStart = (e) => {
  lastTouch = where(e.touches[0]?.clientY ?? -1, e.target);
  paint("touchstart");
};
export function toggleProbe(on = !box) {
  if (!on) {
    box?.remove();
    box = null;
    for (const t of events) removeEventListener(t, onEvent);
    removeEventListener("pointerdown", onTouch, true);
    removeEventListener("touchstart", onTouchStart, true);
    return;
  }
  if (box) return;
  box = document.createElement("div");
  box.setAttribute("aria-hidden", "true");
  box.innerHTML = `<pre style="position:fixed;z-index:9;left:calc(var(--left) + 6px);right:calc(var(--right) + 6px);top:calc(var(--top) + 104px);margin:0;padding:6px 8px;font:10px/1.35 ui-monospace,monospace;white-space:pre-wrap;color:#fff;background:#000c;border-radius:8px;pointer-events:none"></pre>
    <i style="position:fixed;z-index:9;left:0;right:50%;top:calc(var(--vh) - 10px);height:10px;background:#ffc36a;pointer-events:none"></i>
    <i style="position:fixed;z-index:9;left:50%;right:0;bottom:0;height:10px;background:#3cf;pointer-events:none"></i>`;
  document.body.append(box);
  try {
    localStorage.setItem(key, "1");
  } catch {
    /* On for this session only. */
  }
  for (const t of events) addEventListener(t, onEvent);
  addEventListener("pointerdown", onTouch, true);
  addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
  paint("open");
}
