import { sightAt } from "./game.js";

// The point committed on lift is exactly the last painted point.
export function armPad(pad, wrap, dartIndex, onStart, onLand, onHint) {
  const sight = wrap.querySelector("#sight");
  let hold = null;
  let frame = 0;
  let lastPoint;
  function paint() {
    if (!hold) return;
    lastPoint = sightAt(
      hold.x,
      hold.y,
      performance.now() - hold.time,
      dartIndex,
    );
    const px = (v) => ((v + 211) * hold.boardWidth) / 422;
    sight.style.transform =
      "translate3d(" + px(lastPoint.x) + "px," + px(lastPoint.y) + "px,0)";
    frame = requestAnimationFrame(paint);
  }
  function start(id, x, y) {
    if (hold) return;
    onStart();
    const rect = wrap.getBoundingClientRect();
    hold = {
      id,
      startX: x,
      startY: y,
      x: 0,
      y: 0,
      time: performance.now(),
      boardWidth: rect.width,
      scale: 365 / Math.min(pad.clientWidth, 260),
    };
    pad.classList.add("aiming");
    pad.querySelector("b").textContent = "Release to throw";
    sight.hidden = false;
    paint();
  }
  function cancel() {
    if (!hold) return;
    const id = hold.id;
    hold = null;
    cancelAnimationFrame(frame);
    if (typeof id === "number" && pad.hasPointerCapture(id))
      pad.releasePointerCapture(id);
    sight.hidden = true;
    pad.classList.remove("aiming");
    pad.querySelector("b").textContent = "Hold to aim";
  }
  function release(id) {
    if (hold?.id !== id) return;
    const duration = performance.now() - hold.time;
    cancel();
    if (duration >= 140) onLand(lastPoint);
    else onHint("Hold, drag to aim, then lift.");
  }
  pad.onpointerdown = (e) => {
    if (!e.isPrimary || e.button !== 0 || hold) return;
    e.preventDefault();
    pad.setPointerCapture(e.pointerId);
    start(e.pointerId, e.clientX, e.clientY);
  };
  pad.onpointermove = (e) => {
    if (hold?.id !== e.pointerId) return;
    hold.x = (e.clientX - hold.startX) * hold.scale;
    hold.y = (e.clientY - hold.startY) * hold.scale;
  };
  pad.onpointerup = (e) => release(e.pointerId);
  pad.onlostpointercapture = pad.onpointercancel = (e) => {
    if (hold?.id === e.pointerId) cancel();
  };
  pad.oncontextmenu = (e) => e.preventDefault();
  pad.onkeydown = (e) => {
    if ([" ", "Enter"].includes(e.key)) {
      e.preventDefault();
      if (!e.repeat) start("keys", 0, 0);
    } else if (hold?.id === "keys" && e.key.startsWith("Arrow")) {
      e.preventDefault();
      hold.x += { ArrowLeft: -7, ArrowRight: 7 }[e.key] || 0;
      hold.y += { ArrowUp: -7, ArrowDown: 7 }[e.key] || 0;
    } else if (e.key === "Escape") cancel();
  };
  pad.onkeyup = (e) => {
    if ([" ", "Enter"].includes(e.key)) {
      e.preventDefault();
      release("keys");
    }
  };
  pad.onblur = cancel;
  return cancel;
}
