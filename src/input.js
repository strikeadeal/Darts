import { approachShadow, poseModel, rest } from "./art.js";
import {
  addSample,
  boardPosition,
  clamp,
  entryPose,
  onDart,
  readStroke,
  releaseThrow,
  tune,
} from "./throw.js";

const motion = matchMedia("(prefers-reduced-motion: reduce)");
const mix = (a, b, t) => a + (b - a) * t;

function handPose(dx = 0, dy = 0, width = 1) {
  const h = tune.hand;
  const push = clamp(-dy / width / tune.input.bullRise, 0, 1);
  const steer = clamp(dx / width, -0.5, 0.5);
  return {
    x: steer * width * h.track,
    y: width * h.drawDrop * (1 - push) - push * width * h.reach,
    scale: mix(h.drawScale, h.extendScale, push),
    ax: -steer * h.steer,
    ay: h.pitch - push * h.extendPitch,
    roll: h.roll + steer + h.extendRoll * push,
  };
}

function draw(dart, frame) {
  dart.style.transform = `translate(${frame.x}px,${frame.y}px) scale(${frame.scale})`;
  poseModel(dart.firstElementChild, frame);
}

// Everything the flight needs from layout, read when the dart is picked up (after
// any camera move has been finished) so release itself forces no layout.
function measure(field) {
  const board = field.querySelector(".board-wrap");
  return {
    grip: field.querySelector(".dart-grip").getBoundingClientRect(),
    plane: board.querySelector(".board-plane").getScreenCTM(),
    width: board.getBoundingClientRect().width,
  };
}

// `skipped(event)` is the dart's painted box from before a camera move that this
// touch finished early, so a touch where the player saw the dart still lands on it.
export function bindThrows(field, wakeAudio, land, hint, skipped, beginTrace) {
  const board = field.querySelector(".board-wrap");
  const dart = field.querySelector(".ready-dart");
  const keyboardButton = field.querySelector("#throw");
  const sight = board.querySelector("#sight");
  let stroke = null,
    keyboardAim = null,
    pending = 0,
    held,
    handScale = 1;

  // Compact layouts have less room below the board. Turn the shaft further
  // into depth there while preserving the apparent width of the nearby fins.
  function hold(pose) {
    held = {
      ...pose,
      scale: pose.scale * handScale,
      ax: pose.ax / handScale,
      ay: pose.ay / handScale,
    };
    draw(dart, held);
  }
  // idle: only re-measure the resting grip, never cancel a stroke in progress.
  function reset(idle) {
    if (idle === true && (stroke || keyboardAim)) return;
    cancelAnimationFrame(pending);
    pending = 0;
    const id = stroke?.id;
    stroke?.trace?.finish("cancelled");
    stroke = keyboardAim = held = null;
    keyboardButton.classList.remove("held");
    sight.setAttribute("visibility", "hidden");
    if (field.isConnected) {
      // Both from client rects (the board is 422 units wide), so the ratio holds
      // mid camera move; getScreenCTM leaves out the room's perspective.
      const boardScale = board.getBoundingClientRect().width / 422;
      const gripHeight = dart.parentElement.getBoundingClientRect().height;
      handScale = Math.max(
        1,
        (tune.flight.length * boardScale) /
          (gripHeight * tune.camera.nearDepth),
      );
      hold({ ...rest, x: 0, y: 0, scale: 1 });
    }
    if (id !== undefined && field.hasPointerCapture(id))
      field.releasePointerCapture(id);
  }
  function paintHand() {
    pending = 0;
    const last = stroke.samples.at(-1);
    hold(handPose(last.x - stroke.x, last.y - stroke.y, stroke.width));
  }
  // A touch away from the dart never throws. Point at the dart instead, unless
  // the touch was spent finishing a camera move or effect.
  function beckon() {
    hint("Touch the dart to pick it up");
    if (!motion.matches)
      dart.parentElement.animate(
        [{ scale: 1 }, { scale: 1.18 }, { scale: 1 }],
        { duration: 360, easing: "ease-out" },
      );
  }
  field.onpointerdown = (event) => {
    if (
      !event.isPrimary ||
      event.button !== 0 ||
      stroke ||
      field.hasAttribute("aria-busy")
    )
      return;
    event.preventDefault();
    const seen = skipped?.(event);
    const { clientX: x, clientY: y } = event;
    const box = dart.firstElementChild.getBoundingClientRect();
    if (!onDart(x, y, box, seen?.width ? seen : undefined)) {
      if (!seen) beckon();
      return;
    }
    reset();
    wakeAudio();
    keyboardButton.classList.add("held");
    const geo = measure(field);
    stroke = { id: event.pointerId, x, y, width: geo.width, geo, samples: [], trace: beginTrace?.(event, geo.width) };
    sample(event);
    field.setPointerCapture(event.pointerId);
    if (!motion.matches) paintHand();
  };
  function sample(event, type = event.type) {
    stroke.trace?.sample(event, type);
    addSample(stroke.samples, event.clientX, event.clientY, event.timeStamp);
  }
  field.onpointermove = (event) => {
    if (stroke?.id !== event.pointerId) return;
    for (const move of event.getCoalescedEvents?.() || []) sample(move, "coalesced");
    sample(event);
    if (!pending && !motion.matches) pending = requestAnimationFrame(paintHand);
  };
  field.onpointerup = (event) => {
    if (stroke?.id !== event.pointerId) return;
    sample(event);
    const { geo } = stroke;
    const point = releaseThrow(stroke, stroke.samples, stroke.width);
    const read = point && readStroke(stroke, stroke.samples, stroke.width);
    stroke.trace?.finish(point ? "thrown" : "rejected", read, point);
    cancelAnimationFrame(pending);
    pending = 0;
    stroke = null;
    if (field.hasPointerCapture(event.pointerId))
      field.releasePointerCapture(event.pointerId);
    if (point) land(point, held, geo, read);
    else {
      reset();
      hint("Flick further up to throw");
    }
  };
  field.onpointercancel = field.onlostpointercapture = (event) => {
    if (stroke?.id === event.pointerId) {
      stroke.trace?.sample(event, event.type);
      reset();
    }
  };
  field.oncontextmenu = (event) => event.preventDefault();
  keyboardButton.onkeydown = (event) => {
    if (stroke || field.hasAttribute("aria-busy")) return;
    if (event.key === "Escape") {
      reset();
      return;
    }
    if (
      ![
        " ",
        "Enter",
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
      ].includes(event.key)
    )
      return;
    event.preventDefault();
    keyboardAim ??= { x: 0, y: 35, geo: measure(field) };
    if (event.key === " " || event.key === "Enter") {
      if (!event.repeat) wakeAudio();
    } else {
      const step = event.shiftKey ? 1 : 8;
      const dx =
        Number(event.key === "ArrowRight") - Number(event.key === "ArrowLeft");
      const dy =
        Number(event.key === "ArrowDown") - Number(event.key === "ArrowUp");
      keyboardAim.x = clamp(
        keyboardAim.x + dx * step,
        -tune.input.limit,
        tune.input.limit,
      );
      keyboardAim.y = clamp(
        keyboardAim.y + dy * step,
        -tune.input.limit,
        tune.input.limit,
      );
    }
    const p = boardPosition(keyboardAim);
    sight.setAttribute("visibility", "visible");
    sight.setAttribute("transform", `translate(${p.x} ${p.y})`);
  };
  keyboardButton.onkeyup = (event) => {
    if (
      !keyboardAim ||
      ![" ", "Enter"].includes(event.key) ||
      field.hasAttribute("aria-busy")
    )
      return;
    event.preventDefault();
    const { geo, ...point } = keyboardAim;
    reset();
    land(point, held, geo);
  };
  keyboardButton.onblur = () => {
    if (keyboardAim) reset();
  };
  reset();
  return reset;
}

// WebKit can suppress the compatibility click on a button inserted after a swipe.
// Handle a fresh, stationary touch there while preserving native keyboard clicks.
export function bindTurnButton(button, activate) {
  button.onclick = activate;
  let start = null;
  button.addEventListener(
    "touchstart",
    (event) => {
      start = event.touches.length === 1 ? event.touches[0] : null;
    },
    { passive: true },
  );
  button.addEventListener("touchcancel", () => {
    start = null;
  });
  button.addEventListener(
    "touchend",
    (event) => {
      const end = event.changedTouches[0];
      const begin = start;
      start = null;
      if (!begin || begin.identifier !== end.identifier) return;
      event.preventDefault();
      if (
        Math.hypot(end.clientX - begin.clientX, end.clientY - begin.clientY) <=
          10 &&
        button.contains(document.elementFromPoint(end.clientX, end.clientY))
      ) {
        button.click();
      }
    },
    { passive: false },
  );
}

// Project a constant forward velocity and a gravity arc. With depth 1 at
// the board, the screen-space interpolation weight is t / depth.
//
// The path runs as a Web Animation of transform, so the compositor moves the
// dart even when the main thread is late, and the clock starts on the first
// frame that reaches the screen rather than at release. Each frame the main
// thread only re-poses the four fins and barrel, and over the last quarter
// moves the approach shadow, which stays empty (nothing to paint) until then.
const samples = 24; // keyframes along the path, linear between: < 0.1 px from the curve
export function flyDart(field, point, held, geo, onContact, finalDart) {
  if (motion.matches) return null;
  const dart = field.querySelector(".ready-dart");
  dart.closest(".throw-control").classList.add("held");
  const { grip, plane, width } = geo;
  const target = new DOMPoint(point.x, point.y).matrixTransform(plane);
  const start = held || { ...rest, x: 0, y: 0, scale: 1 };
  const end = entryPose(point),
    pace = point.pace || 0;
  const f = tune.flight,
    c = tune.camera;
  const endX = target.x - (grip.left + grip.width / 2);
  const endY = target.y - grip.top;
  const endScale = (f.length * plane.a) / grip.height;
  const releaseDepth = endScale / start.scale;
  const arc = width * (c.arc - c.arcByPace * pace);
  const duration = f.duration - pace * f.byPace;
  const path = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples,
      depth = mix(releaseDepth, 1, t),
      q = t / depth;
    const x = mix(start.x, endX, q),
      y = mix(start.y, endY, q) - (arc * 4 * t * (1 - t)) / depth;
    path.push({ transform: `translate(${x}px,${y}px) scale(${endScale / depth})` });
  }
  const flight = dart.animate(path, { duration, fill: "forwards", id: "flight" });
  // The shadow's box is 200 board units about the impact, so a unit is 0.5% of it.
  const shadow = field.querySelector(".approach");
  const p = boardPosition(point);
  shadow.style.left = (p.x + 111) / 4.22 + "%";
  shadow.style.top = (p.y + 111) / 4.22 + "%";
  let raf, timer, resolve;
  const finished = new Promise((done) => {
    resolve = done;
  });
  function roll() {
    const t = clamp((flight.currentTime || 0) / duration, 0, 1);
    poseModel(dart.firstElementChild, {
      ax: mix(start.ax, end.ax, t),
      ay: mix(start.ay, end.ay, t),
      roll: mix(start.roll, end.roll, t),
    });
    const gap = 1 - t;
    if (t >= f.shadowStart) {
      if (!shadow.firstChild) shadow.innerHTML = approachShadow(point);
      shadow.style.opacity = clamp(1 - gap / (1 - f.shadowStart), 0, 1);
      shadow.style.transform = `translate(${gap * f.approachX * 0.5}%,${gap * f.approachY * 0.5}%)`;
    }
    if (t < 1) raf = requestAnimationFrame(roll);
  }
  roll();
  flight.finished.then(
    () => {
      cancelAnimationFrame(raf);
      onContact();
      if (finalDart) timer = setTimeout(resolve, f.settleMs);
      else resolve();
    },
    () => {},
  );
  return {
    finished,
    // The landing replaces the flying dart and shows the dart's own shadow.
    cancel() {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      flight.cancel();
      shadow.textContent = "";
      shadow.style.opacity = shadow.style.transform = "";
      resolve();
    },
  };
}
