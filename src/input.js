import { approachShadow, poseModel, rest } from "./art.js";
import {
  addSample,
  boardPosition,
  clamp,
  entryPose,
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
    ax: h.side - steer * h.steer,
    ay: h.pitch - push * h.extendPitch,
    roll: h.roll + steer + h.extendRoll * push,
  };
}

function draw(dart, frame) {
  dart.style.transform = `translate(${frame.x}px,${frame.y}px) scale(${frame.scale})`;
  poseModel(dart.firstElementChild, frame);
}

export function bindThrows(field, wakeAudio, land, hint) {
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
  function reset() {
    cancelAnimationFrame(pending);
    pending = 0;
    const id = stroke?.id;
    stroke = keyboardAim = held = null;
    sight.setAttribute("visibility", "hidden");
    if (field.isConnected) {
      const boardScale = board.querySelector(".board-plane").getScreenCTM().a;
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
  field.onpointerdown = (event) => {
    if (
      !event.isPrimary ||
      event.button !== 0 ||
      stroke ||
      field.hasAttribute("aria-busy")
    )
      return;
    event.preventDefault();
    reset();
    wakeAudio();
    stroke = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      width: board.getBoundingClientRect().width,
      samples: [],
    };
    sample(event);
    field.setPointerCapture(event.pointerId);
    if (!motion.matches) paintHand();
  };
  function sample(event) {
    addSample(stroke.samples, event.clientX, event.clientY, event.timeStamp);
  }
  field.onpointermove = (event) => {
    if (stroke?.id !== event.pointerId) return;
    for (const move of event.getCoalescedEvents?.() || []) sample(move);
    sample(event);
    if (!pending && !motion.matches) pending = requestAnimationFrame(paintHand);
  };
  field.onpointerup = (event) => {
    if (stroke?.id !== event.pointerId) return;
    sample(event);
    const point = releaseThrow(stroke, stroke.samples, stroke.width);
    cancelAnimationFrame(pending);
    pending = 0;
    stroke = null;
    if (field.hasPointerCapture(event.pointerId))
      field.releasePointerCapture(event.pointerId);
    if (point) land(point, held);
    else {
      reset();
      hint("Swipe up at least ⅓ of the board’s width, then lift.");
    }
  };
  field.onpointercancel = field.onlostpointercapture = (event) => {
    if (stroke?.id === event.pointerId) reset();
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
    keyboardAim ??= { x: 0, y: 35 };
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
    const point = keyboardAim;
    reset();
    land(point, held);
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
export function flyDart(field, point, held, onContact, finalDart) {
  if (motion.matches) return null;
  const dart = field.querySelector(".ready-dart");
  const grip = dart.parentElement.getBoundingClientRect();
  const board = field.querySelector("svg.board");
  const plane = board.querySelector(".board-plane").getScreenCTM();
  const target = new DOMPoint(point.x, point.y).matrixTransform(plane);
  const start = held || { ...rest, x: 0, y: 0, scale: 1 };
  const end = entryPose(point),
    pace = point.pace || 0;
  const f = tune.flight,
    c = tune.camera;
  const width = board.getBoundingClientRect().width;
  const endX = target.x - (grip.left + grip.width / 2);
  const endY = target.y - grip.top;
  const endScale = (f.length * plane.a) / grip.height;
  const releaseDepth = endScale / start.scale;
  const arc = width * (c.arc - c.arcByPace * pace);
  const duration = f.duration - pace * f.byPace;
  const shadow = field.querySelector(".approach-shadow");
  shadow.innerHTML = approachShadow(point);
  let raf, timer, resolve;
  const finished = new Promise((done) => {
    resolve = done;
  });
  const began = performance.now();
  function frame(now) {
    const t = clamp((now - began) / duration, 0, 1);
    const depth = mix(releaseDepth, 1, t);
    const q = t / depth;
    draw(dart, {
      x: mix(start.x, endX, q),
      y: mix(start.y, endY, q) - (arc * 4 * t * (1 - t)) / depth,
      scale: endScale / depth,
      ax: mix(start.ax, end.ax, t),
      ay: mix(start.ay, end.ay, t),
      roll: mix(start.roll, end.roll, t),
    });
    const gap = 1 - t;
    shadow.setAttribute("opacity", clamp(1 - gap / (1 - f.shadowStart), 0, 1));
    shadow.setAttribute(
      "transform",
      `translate(${gap * f.approachX} ${gap * f.approachY})`,
    );
    if (t < 1) raf = requestAnimationFrame(frame);
    else {
      onContact();
      if (finalDart) timer = setTimeout(resolve, f.settleMs);
      else resolve();
    }
  }
  frame(began);
  return {
    finished,
    cancel() {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      resolve();
    },
  };
}
