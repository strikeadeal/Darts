import { swipeLanding } from "./game.js";

export function bindThrows(field, wakeAudio, land, hint) {
  const board = field.querySelector(".board-wrap");
  const dart = field.querySelector(".ready-dart");
  const keyboardButton = field.querySelector("#throw");
  const sight = board.querySelector("#sight");
  let stroke = null;
  let keyboardAim = null;

  function reset() {
    const id = stroke?.id;
    stroke = null;
    keyboardAim = null;
    sight.hidden = true;
    dart.style.transform = "";
    if (id !== undefined && field.hasPointerCapture(id))
      field.releasePointerCapture(id);
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
      width: board.clientWidth,
    };
    field.setPointerCapture(event.pointerId);
  };
  field.onpointermove = (event) => {
    if (stroke?.id !== event.pointerId) return;
    const dx = event.clientX - stroke.x,
      dy = event.clientY - stroke.y;
    const angle = (Math.atan2(dx, Math.max(30, -dy)) * 180) / Math.PI;
    dart.style.transform = `translate(${dx * 0.22}px, ${Math.min(8, dy * 0.28)}px) rotate(${angle * 0.6}deg)`;
  };
  field.onpointerup = (event) => {
    if (stroke?.id !== event.pointerId) return;
    const point = swipeLanding(
      event.clientX - stroke.x,
      event.clientY - stroke.y,
      stroke.width,
    );
    stroke = null;
    if (field.hasPointerCapture(event.pointerId))
      field.releasePointerCapture(event.pointerId);
    if (point) land(point);
    else {
      reset();
      hint("Swipe up toward the board. A longer swipe lands higher.");
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
    if (!keyboardAim) keyboardAim = { x: 0, y: 35 };
    if (event.key === " " || event.key === "Enter") {
      if (!event.repeat) wakeAudio();
    } else {
      const step = event.shiftKey ? 1 : 8;
      const dx =
        Number(event.key === "ArrowRight") - Number(event.key === "ArrowLeft");
      const dy =
        Number(event.key === "ArrowDown") - Number(event.key === "ArrowUp");
      keyboardAim.x = Math.max(-201, Math.min(201, keyboardAim.x + dx * step));
      keyboardAim.y = Math.max(-201, Math.min(201, keyboardAim.y + dy * step));
    }
    sight.hidden = false;
    sight.style.transform = `translate(${((keyboardAim.x + 211) * board.clientWidth) / 422}px,${((keyboardAim.y + 211) * board.clientWidth) / 422}px)`;
  };
  keyboardButton.onkeyup = (event) => {
    if (!keyboardAim || ![" ", "Enter"].includes(event.key)) return;
    event.preventDefault();
    const point = keyboardAim;
    reset();
    land(point);
  };
  keyboardButton.onblur = () => {
    if (keyboardAim) reset();
  };
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

export function flyDart(field, point) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
  const dart = field.querySelector(".ready-dart");
  const grip = dart.parentElement.getBoundingClientRect();
  const board = field.querySelector(".board-wrap").getBoundingClientRect();
  const x =
    board.left +
    ((point.x + 211) * board.width) / 422 -
    (grip.left + grip.width / 2);
  const y = board.top + ((point.y + 211) * board.height) / 422 - grip.top;
  return dart.animate(
    [
      { transform: dart.style.transform || "none" },
      { transform: `translate(${x}px,${y}px) rotate(-32deg) scale(.24)` },
    ],
    { duration: 190, easing: "cubic-bezier(.18,.55,.38,1)", fill: "forwards" },
  );
}
