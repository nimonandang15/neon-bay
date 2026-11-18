// Keyboard and mouse input. Held keys are polled each frame; one-shot actions
// (enter car, punch, pause, mission, reload) are queued as flags and taken once.
export const ACT_ENTER = 1;
export const ACT_PUNCH = 2;
export const ACT_PAUSE = 4;
export const ACT_MISSION = 8;
export const ACT_RELOAD = 16;
export const ACT_CONFIRM = 32;

const FORWARD = new Set(['KeyW', 'ArrowUp']);
const BACK = new Set(['KeyS', 'ArrowDown']);
const LEFT = new Set(['KeyA', 'ArrowLeft']);
const RIGHT = new Set(['KeyD', 'ArrowRight']);
const SPRINT = new Set(['ShiftLeft', 'ShiftRight']);
const ENTER = new Set(['KeyE']);
const PUNCH = new Set(['KeyF']);
const PAUSE = new Set(['KeyP', 'Escape']);
const MISSION = new Set(['KeyM']);
const RELOAD = new Set(['KeyR']);
const CONFIRM = new Set(['Space', 'Enter']);

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let dragX = 0;
  let dragY = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let mouseDown = false;

  window.addEventListener('keydown', (event) => {
    if (event.target && (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA')) return;
    keys.add(event.code);
    if (!event.repeat) {
      if (ENTER.has(event.code)) actions |= ACT_ENTER;
      else if (PUNCH.has(event.code)) actions |= ACT_PUNCH;
      else if (PAUSE.has(event.code)) actions |= ACT_PAUSE;
      else if (MISSION.has(event.code)) actions |= ACT_MISSION;
      else if (RELOAD.has(event.code)) actions |= ACT_RELOAD;
      else if (CONFIRM.has(event.code)) actions |= ACT_CONFIRM;
    }
    if (FORWARD.has(event.code) || BACK.has(event.code) || event.code === 'Space') event.preventDefault();
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('pointerdown', (event) => {
    mouseDown = true;
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    dragX += event.clientX - lastX;
    dragY += event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
  });
  const endDrag = () => {
    dragging = false;
    mouseDown = false;
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    axis() {
      const f = [...keys].some((k) => FORWARD.has(k)) ? 1 : 0;
      const b = [...keys].some((k) => BACK.has(k)) ? 1 : 0;
      const l = [...keys].some((k) => LEFT.has(k)) ? 1 : 0;
      const r = [...keys].some((k) => RIGHT.has(k)) ? 1 : 0;
      return { forward: f - b, strafe: r - l };
    },
    sprint() {
      return [...keys].some((k) => SPRINT.has(k));
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    takeDrag() {
      const d = { x: dragX, y: dragY };
      dragX = 0;
      dragY = 0;
      return d;
    },
    takeMouseDown() {
      const d = mouseDown;
      mouseDown = false;
      return d;
    },
    anyKey() {
      return keys.size > 0;
    },
  };
}
