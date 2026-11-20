// Viewport readout for checking the installed app on a phone. Hidden from players:
// it loads only after five quick taps on the "How to play" title (or with
// ?viewport in a Safari tab), and the same taps turn it off. Not part of play.
//
// Two rules mark the edges: amber where the room ends (--vh), cyan where the
// layout viewport ends (position:fixed; bottom:0). On a fixed build they meet at
// the bottom of the screen. Touch anywhere to log where the touch landed.
const lines = [];
let box, last = "none";

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
    ios: navigator.userAgent.match(/OS (\d+[_\d]*)/)?.[1]?.replace(/_/g, ".") ?? "?",
    standalone: `${navigator.standalone} · display-mode ${matchMedia("(display-mode: standalone)").matches ? "standalone" : "browser"}`,
    screen: `${screen.width}×${screen.height} @${devicePixelRatio}`,
    inner: `${innerWidth}×${innerHeight}`,
    client: `${document.documentElement.clientWidth}×${document.documentElement.clientHeight}`,
    visual: vv ? `${Math.round(vv.width)}×${Math.round(vv.height)} top ${Math.round(vv.offsetTop)}` : "–",
    units: `100% ${px("100%")} · vh ${px("100vh")} · dvh ${px("100dvh")} · svh ${px("100svh")} · lvh ${px("100lvh")}`,
    "--vh": `${px("var(--vh)")} (${document.documentElement.style.getPropertyValue("--vh") || "css"})`,
    safe: ["top", "bottom", "left", "right"].map(inset).join(" "),
    room: `scene ${rect("#scene")} · board ${rect(".board-wrap")} · throw ${rect("#throw")}`,
    grip: rect(".dart-grip"),
    touch: last,
  };
  lines.unshift(`${new Date().toLocaleTimeString()} ${why}: inner ${now.inner}, --vh ${now["--vh"]}`);
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
const onTouch = (e) => {
  last = `${Math.round(e.clientY)} on ${e.target.id || e.target.className?.baseVal || e.target.className || e.target.tagName}`;
  paint("touch");
};

export function toggleProbe(on = !box) {
  if (!on) {
    box?.remove();
    box = null;
    for (const t of events) removeEventListener(t, onEvent);
    removeEventListener("pointerdown", onTouch, true);
    return;
  }
  if (box) return;
  box = document.createElement("div");
  box.setAttribute("aria-hidden", "true");
  box.innerHTML = `<pre style="position:fixed;z-index:9;left:calc(var(--left) + 6px);right:calc(var(--right) + 6px);top:calc(var(--top) + 104px);margin:0;padding:6px 8px;font:10px/1.35 ui-monospace,monospace;white-space:pre-wrap;color:#fff;background:#000c;border-radius:8px;pointer-events:none"></pre>
    <i style="position:fixed;z-index:9;left:0;right:50%;top:calc(var(--vh) - 3px);height:3px;background:#ffc36a;pointer-events:none"></i>
    <i style="position:fixed;z-index:9;left:50%;right:0;bottom:0;height:3px;background:#3cf;pointer-events:none"></i>`;
  document.body.append(box);
  for (const t of events) addEventListener(t, onEvent);
  addEventListener("pointerdown", onTouch, true);
  paint("open");
}
