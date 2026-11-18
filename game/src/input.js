// Keyboard and mouse input. Held keys are polled each frame; one-shot actions
// (enter car, punch, pause, mission, reload) are queued as flags and taken once.
export const ACT_ENTER = 1;
export const ACT_PUNCH = 2;
export const ACT_PAUSE = 4;
export const ACT_MISSION = 8;
export const ACT_RELOAD = 16;
export const ACT_CONFIRM = 32;
export const ACT_RADIO = 64;
export const ACT_TAXI = 128;

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
const RADIO = new Set(['KeyQ']);
const TAXI = new Set(['KeyT']);
const WEAPON_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'];

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let dragX = 0;
  let dragY = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let mouseDown = false;
  let downMoved = 0;
  let weaponSlot = 0;
  let wheelDelta = 0;

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
      else if (RADIO.has(event.code)) actions |= ACT_RADIO;
      else if (TAXI.has(event.code)) actions |= ACT_TAXI;
      else {
        const wi = WEAPON_KEYS.indexOf(event.code);
        if (wi >= 0) weaponSlot = wi + 1;
      }
    }
    if (FORWARD.has(event.code) || BACK.has(event.code) || event.code === 'Space') event.preventDefault();
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('pointerdown', (event) => {
    mouseDown = true;
    downMoved = 0;
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const mx = event.clientX - lastX;
    const my = event.clientY - lastY;
    downMoved += Math.abs(mx) + Math.abs(my);
    dragX += mx;
    dragY += my;
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
  canvas.addEventListener('wheel', (event) => {
    wheelDelta += event.deltaY > 0 ? 1 : -1;
    event.preventDefault();
  }, { passive: false });

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
    // Held fire (auto weapons): true only for a real click, not a camera drag.
    mouseHeld() {
      return mouseDown && downMoved < 8;
    },
    takeWeaponSlot() {
      const s = weaponSlot;
      weaponSlot = 0;
      return s;
    },
    takeWheel() {
      const d = wheelDelta;
      wheelDelta = 0;
      return d;
    },
    anyKey() {
      return keys.size > 0;
    },
  };
}
