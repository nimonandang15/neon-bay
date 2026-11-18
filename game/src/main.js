// Neon Bay — boot and the one loop. The game moves between four screens
// (title, play, paused, over); the world advances in fixed 1/60 s steps.
// ?seed=N fixes the city. ?shot=cover|drive|chase|mission (with &seed=N)
// stages that scene instead of running the loop, paints it and sets
// window.__shotReady for a screenshot.
import * as THREE from 'three';
import { STEP, CITY, CAR, PED, PLAYER, START_CASH } from './config.js';
import { createRandom } from './rng.js';
import { createInput, ACT_ENTER, ACT_PUNCH, ACT_PAUSE, ACT_MISSION, ACT_RELOAD, ACT_CONFIRM } from './input.js';
import { createCity } from './city.js';
import { makeCar, updateTraffic, updatePlayerCar } from './cars.js';
import { makePed, updatePeds, randomSidewalkSpot, randomStreetSpot } from './peds.js';
import { createPlayer, updatePlayerOnFoot, tryEnterExitCar, updateCamera, spawnPlayerCar } from './player.js';
import { createPolice, updatePolice } from './police.js';
import { createMissions } from './missions.js';
import { createCombat } from './combat.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { loadSave, writeSave, clearSave } from './save.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

window.__errors = [];
window.addEventListener('error', (e) => window.__errors.push(String(e.message || e.error)));
window.addEventListener('unhandledrejection', (e) => window.__errors.push(String(e.reason)));

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1200);
camera.position.set(0, 8, -14);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const rng = createRandom(seed);
const g = {
  scene,
  camera,
  renderer,
  rng,
  time: 0,
  state: 'title',
  overKind: null,
  input: createInput(canvas),
  hud: createHud(),
  audio: createAudio(),
  cars: [],
  peds: [],
  saveTimer: 0,
};

// World.
g.city = createCity(scene, rng);
g.player = createPlayer(scene, 0, 30);
g.police = createPolice(g);
g.missions = createMissions(g);
g.combat = createCombat(g);

// Tracer effects (gunfire lines that fade).
const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe600, transparent: true, opacity: 0.9 });
const tracers = [];
g.effects = {
  tracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, tracerMat.clone());
    line.userData.life = 0.12;
    scene.add(line);
    tracers.push(line);
  },
  update(dt) {
    for (let i = tracers.length - 1; i >= 0; i -= 1) {
      const t = tracers[i];
      t.userData.life -= dt;
      t.material.opacity = Math.max(0, t.userData.life / 0.12) * 0.9;
      if (t.userData.life <= 0) {
        scene.remove(t);
        t.geometry.dispose();
        t.material.dispose();
        tracers.splice(i, 1);
      }
    }
  },
};

// Parked + traffic cars.
spawnPlayerCar(g);
for (let i = 0; i < CAR.trafficCount; i += 1) {
  const spot = randomStreetSpot(rng);
  const car = makeCar(scene, rng, 'traffic', spot.x, spot.z, rng.range(0, Math.PI * 2));
  g.cars.push(car);
}
// A few parked cars near the spawn for easy stealing.
for (const [x, z] of [[6, 30], [-6, 34], [10, -8]]) {
  const car = makeCar(scene, rng, 'traffic', x, z, Math.PI / 2);
  car.driver = false;
  car.targetSpeed = 0;
  g.cars.push(car);
}
for (let i = 0; i < PED.count; i += 1) {
  const spot = randomSidewalkSpot(rng);
  g.peds.push(makePed(scene, rng, 'walk', spot.x, spot.z));
}

// Save / resume.
g.saveGame = () => {
  writeSave({
    cash: g.player.cash,
    completed: [...g.missions.completed],
    hp: g.player.hp,
    x: g.player.pos.x,
    z: g.player.pos.z,
    savedAt: Date.now(),
  });
};
g.ejectPlayer = () => {
  if (g.player.car) tryEnterExitCar(g);
};
g.gameOver = (kind) => {
  if (g.state === 'over') return;
  g.state = 'over';
  g.overKind = kind;
  g.audio.setEngine(0, false);
  g.audio.setSiren(false);
  const title = kind === 'busted' ? 'BUSTED' : 'WASTED';
  const sub = kind === 'busted'
    ? 'The Bay PD finally put the cuffs on. The crew posts your bail — this time.'
    : 'Neon Bay chews up drivers who stop paying attention.';
  document.getElementById('end-title').textContent = title;
  document.getElementById('end-sub').textContent = sub;
  document.getElementById('end-stats').textContent = `Cash $${g.player.cash.toLocaleString('en-US')} · Jobs done ${g.missions.completed.size} of 3`;
  document.getElementById('screen-over').classList.add('show');
  g.hud.setCrosshair(false);
  g.saveGame();
};
g.restart = () => {
  g.player.hp = PLAYER.maxHp;
  g.player.pos.set(0, 0, 30);
  g.player.heading = 0;
  g.player.mesh.visible = true;
  g.player.onFoot = true;
  g.player.car = null;
  g.player.ammo = PLAYER.magSize;
  g.police.setStars(0);
  g.missions.current = null;
  g.missions.beacon.visible = false;
  document.getElementById('screen-over').classList.remove('show');
  g.state = 'play';
  g.hud.setObjective(g.missions.available() ? 'Press M to start the next job' : 'All jobs done — Neon Bay is yours, Rook');
};

function applySave(save) {
  if (!save) return;
  g.player.cash = typeof save.cash === 'number' ? save.cash : START_CASH;
  if (Array.isArray(save.completed)) {
    for (const id of save.completed) g.missions.completed.add(id);
  }
  if (typeof save.hp === 'number') g.player.hp = Math.max(1, save.hp);
  if (typeof save.x === 'number' && typeof save.z === 'number') {
    g.player.pos.set(save.x, 0, save.z);
  }
}

const saved = loadSave();
if (saved) {
  applySave(saved);
  document.getElementById('btn-continue').style.display = 'inline-block';
  document.getElementById('save-note').textContent = `Saved game found — $${g.player.cash.toLocaleString('en-US')}, ${g.missions.completed.size} of 3 jobs done.`;
}
g.player.cash = g.player.cash || START_CASH;
g.hud.setCash(g.player.cash);
g.hud.setHealth(g.player.hp);
g.hud.setStars(0);
g.hud.setAmmo(PLAYER.magSize);
g.hud.setObjective('Press M to start your first job');

function startGame(fresh) {
  if (fresh) {
    clearSave();
    g.player.cash = START_CASH;
    g.missions.completed.clear();
    g.player.hp = PLAYER.maxHp;
    g.player.pos.set(0, 0, 30);
    g.police.setStars(0);
    g.hud.setCash(START_CASH);
    g.hud.setHealth(PLAYER.maxHp);
  }
  g.audio.unlock();
  document.getElementById('screen-title').classList.remove('show');
  document.getElementById('hud').classList.add('show');
  g.state = 'play';
  g.hud.toast('Welcome to Neon Bay. Press M for your first job, E to steal a car.');
  if (!g.missions.current && g.missions.available()) {
    g.hud.setObjective('Press M to start the next job');
  }
}
document.getElementById('btn-start').addEventListener('click', () => startGame(true));
document.getElementById('btn-continue').addEventListener('click', () => startGame(false));
document.getElementById('btn-restart').addEventListener('click', () => g.restart());
document.getElementById('btn-resume').addEventListener('click', () => togglePause());
document.getElementById('btn-quit-title').addEventListener('click', () => {
  g.state = 'title';
  document.getElementById('screen-pause').classList.remove('show');
  document.getElementById('screen-title').classList.add('show');
});
document.getElementById('btn-sound').addEventListener('click', (e) => {
  const muted = g.audio.toggleMute();
  e.target.textContent = muted ? '🔇' : '🔊';
});
document.getElementById('screen-title').classList.add('show');

function togglePause() {
  if (g.state === 'play') {
    g.state = 'paused';
    document.getElementById('screen-pause').classList.add('show');
  } else if (g.state === 'paused') {
    g.state = 'play';
    document.getElementById('screen-pause').classList.remove('show');
  }
}

function step(dt) {
  g.time += dt;
  const p = g.player;
  const actions = g.input.takeActions();
  if (actions & ACT_PAUSE) togglePause();
  if (g.state !== 'play') return;
  if (actions & ACT_MISSION) {
    if (!g.missions.current && g.missions.available()) {
      g.missions.start(g.missions.available());
    } else if (g.missions.current) {
      g.hud.toast('Job already running — check the objective (top left)');
    }
  }
  if (actions & ACT_ENTER) tryEnterExitCar(g);
  if (actions & ACT_PUNCH) g.combat.punch();
  if (actions & ACT_RELOAD) g.combat.reload();
  if (g.input.takeMouseDown()) g.combat.shoot();
  if (p.reloading > 0) {
    p.reloading -= dt;
    if (p.reloading <= 0) {
      p.ammo = PLAYER.magSize;
      g.hud.setAmmo(p.ammo);
    }
  }
  p.shotRecently = Math.max(0, p.shotRecently - dt);
  if (p.onFoot) updatePlayerOnFoot(g, dt, g.input);
  else updatePlayerCar(g, dt, g.input);
  updateTraffic(g, dt);
  updatePeds(g, dt);
  updatePolice(g, dt);
  g.missions.update(dt);
  g.effects.update(dt);
  updateCamera(g, dt);
  // Health regen when calm.
  if (g.police.stars === 0 && p.hp > 0 && p.hp < PLAYER.maxHp) {
    p.hp = Math.min(PLAYER.maxHp, p.hp + 2 * dt);
  }
  // HUD.
  g.hud.setHealth(p.hp);
  const driving = !p.onFoot && p.car;
  g.hud.setSpeed(driving ? p.car.speed * 3.6 : 0, driving);
  g.hud.setCrosshair(p.onFoot);
  g.hud.drawMinimap(g);
  let hint = '';
  if (p.onFoot) {
    let near = false;
    for (const car of g.cars) {
      if (car.kind !== 'police' && Math.hypot(car.pos.x - p.pos.x, car.pos.z - p.pos.z) < 4.5) { near = true; break; }
    }
    hint = near ? 'E — steal car · F — punch · Click — shoot · M — job' : 'WASD — move · Shift — sprint · Click — shoot · M — job';
  } else {
    hint = 'W/S — gas & brake · A/D — steer · E — get out · M — job';
  }
  g.hud.setHint(hint);
  g.audio.setEngine(driving ? p.car.speed : 0, driving);
  g.audio.setSiren(g.police.stars > 0);
  // Autosave.
  g.saveTimer += dt;
  if (g.saveTimer > 20) {
    g.saveTimer = 0;
    g.saveGame();
  }
}

// Debug handle for automated checks: a read-only snapshot of the live state.
window.__nb = {
  get state() {
    return {
      screen: g.state,
      hp: g.player.hp,
      cash: g.player.cash,
      stars: g.police.stars,
      onFoot: g.player.onFoot,
      x: Math.round(g.player.pos.x * 10) / 10,
      z: Math.round(g.player.pos.z * 10) / 10,
      speed: g.player.car ? Math.round(g.player.car.speed * 10) / 10 : 0,
      ammo: g.player.ammo,
      mission: g.missions.current ? g.missions.current.id : null,
      missionStep: g.missions.stepIndex,
      missionDone: [...g.missions.completed],
      cars: g.cars.length,
      peds: g.peds.filter((q) => !q.dead).length,
      policeCars: g.police.cars.length,
      errors: window.__errors.slice(),
    };
  },
  get police() {
    const p = g.player.car ? g.player.car.pos : g.player.pos;
    return g.police.cars.map((c) => ({
      dx: Math.round(c.pos.x - p.x),
      dz: Math.round(c.pos.z - p.z),
      hp: Math.round(c.hp),
      speed: Math.round(c.speed * 10) / 10,
    }));
  },
  // Distance to the nearest stealable car, for automated play-testing.
  get nearestCar() {
    const p = g.player.pos;
    let best = null;
    let bestD = Infinity;
    for (const car of g.cars) {
      if (car.kind === 'police') continue;
      const d = Math.hypot(car.pos.x - p.x, car.pos.z - p.z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best ? { d: Math.round(bestD * 10) / 10, kind: best.kind } : null;
  },
  start: () => startGame(true),
  startMission: (id) => {
    const m = g.missions.list.find((q) => q.id === id);
    if (m) g.missions.start(m);
  },
};

let last = performance.now();
let acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const elapsed = Math.min(MAX_FRAME, (now - last) / 1000);
  last = now;
  if (g.state === 'play' || g.state === 'paused') {
    acc += elapsed;
    while (acc >= STEP) {
      step(STEP);
      acc -= STEP;
    }
  } else if (g.state === 'title') {
    // Slow cinematic orbit over the city behind the title screen.
    const t = now / 1000;
    camera.position.set(Math.sin(t * 0.05) * 190, 85, Math.cos(t * 0.05) * 190);
    camera.lookAt(0, 10, 0);
  }
  renderer.render(scene, camera);
}

if (shot) {
  // Screenshot mode: stage the scene, paint it, signal readiness.
  document.getElementById('screen-title').classList.remove('show');
  document.getElementById('hud').classList.add('show');
  g.state = 'play';
  stageShot(g, shot);
  g.hud.setHealth(g.player.hp);
  g.hud.setCash(g.player.cash);
  g.hud.setStars(g.police.stars);
  g.hud.setAmmo(g.player.ammo);
  const driving = !g.player.onFoot && g.player.car;
  g.hud.setSpeed(driving ? g.player.car.speed * 3.6 : 0, driving);
  g.hud.setHint(driving ? 'W/S — gas & brake · A/D — steer · E — get out · M — job' : 'WASD — move · Shift — sprint · Click — shoot · M — job');
  g.hud.drawMinimap(g);
  updateCamera(g, 0.5);
  renderer.render(scene, camera);
  window.__shotReady = true;
} else {
  requestAnimationFrame(frame);
}
