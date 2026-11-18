// Neon Bay — boot and the one loop. The game moves between five screens
// (title, play, paused, shop, over); the world advances in fixed 1/60 s steps.
// ?seed=N fixes the city. ?shot=cover|drive|chase|mission|night|shop (with
// &seed=N) stages that scene instead of running the loop, paints it and sets
// window.__shotReady for a screenshot.
import * as THREE from 'three';
import { STEP, CITY, CAR, PED, PLAYER, START_CASH, SHOP, WEAPON_ORDER } from './config.js';
import { createRandom } from './rng.js';
import { createInput, ACT_ENTER, ACT_PUNCH, ACT_PAUSE, ACT_MISSION, ACT_RELOAD, ACT_CONFIRM, ACT_RADIO, ACT_TAXI } from './input.js';
import { createCity } from './city.js';
import { makeCar, updateTraffic, updatePlayerCar } from './cars.js';
import { makePed, updatePeds, randomSidewalkSpot, randomStreetSpot } from './peds.js';
import { createPlayer, updatePlayerOnFoot, tryEnterExitCar, updateCamera, spawnPlayerCar, damagePlayer } from './player.js';
import { createPolice, updatePolice } from './police.js';
import { createMissions } from './missions.js';
import { createCombat } from './combat.js';
import { createWeapons } from './weapons.js';
import { createPickups } from './pickups.js';
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
  stats: { shotsFired: 0, shotsHit: 0, carsStolen: 0, cashEarned: 0, kills: 0, timePlayed: 0 },
  // Day/night: dayT 0..1 over 300 s; 0.15 is mid-morning.
  dayT: 0.15,
  day: 4, // FRI
  prevDayT: 0.15,
  rain: { active: false, timer: 75, points: null, vel: [] },
  headlight: null,
};

// World.
g.city = createCity(scene, rng);
g.player = createPlayer(scene, 0, 30);
g.weapons = createWeapons(g);
g.police = createPolice(g);
g.missions = createMissions(g);
g.combat = createCombat(g);
g.pickups = createPickups(g);
g.pickups.spawnTaxi();

// Headlight: one spotlight that follows the player's car after dark.
const headlight = new THREE.SpotLight(0xfff6c9, 0, 60, 0.55, 0.45, 1.2);
headlight.position.set(0, 2, 0);
scene.add(headlight);
scene.add(headlight.target);
g.headlight = headlight;

// Rain: a cloud of points around the player, off until a shower starts.
{
  const N = 500;
  const pos = new Float32Array(N * 3);
  const vel = [];
  for (let i = 0; i < N; i += 1) {
    pos[i * 3] = (rng.next() - 0.5) * 120;
    pos[i * 3 + 1] = rng.next() * 50;
    pos[i * 3 + 2] = (rng.next() - 0.5) * 120;
    vel.push(28 + rng.next() * 14);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: 0x9db8d6, size: 0.35, transparent: true, opacity: 0.55 });
  const points = new THREE.Points(geo, mat);
  points.visible = false;
  points.frustumCulled = false;
  scene.add(points);
  g.rain.points = points;
  g.rain.vel = vel;
}

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
    armor: g.player.armor,
    x: g.player.pos.x,
    z: g.player.pos.z,
    weapons: Object.keys(g.weapons.state.owned),
    weapon: g.weapons.state.current,
    mag: g.weapons.state.mag,
    reserve: g.weapons.state.reserve,
    packages: g.pickups.collected,
    stats: g.stats,
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
  document.getElementById('end-stats').textContent = `Cash $${g.player.cash.toLocaleString('en-US')} · Jobs done ${g.missions.completed.size} of 6`;
  document.getElementById('screen-over').classList.add('show');
  g.hud.setCrosshair(false);
  g.saveGame();
};
g.restart = () => {
  g.player.hp = PLAYER.maxHp;
  g.player.armor = 0;
  g.player.pos.set(0, 0, 30);
  g.player.heading = 0;
  g.player.mesh.visible = true;
  g.player.onFoot = true;
  g.player.car = null;
  g.player.ammo = PLAYER.magSize;
  g.player.reloading = 0;
  g.weapons.state.owned = { fists: true, pistol: true };
  g.weapons.state.current = 'pistol';
  g.weapons.state.mag = { pistol: 12 };
  g.weapons.state.reserve = { pistol: 60 };
  g.weapons.showModel();
  g.weapons.refreshHud();
  g.police.setStars(0);
  g.missions.current = null;
  g.missions.beacon.visible = false;
  document.getElementById('screen-over').classList.remove('show');
  g.state = 'play';
  g.hud.setObjective(g.missions.available() ? 'Press M to start the next job' : 'All jobs done — Neon Bay is yours, Rook');
};

// The shop: walk up and press E. Buys cost cash; Esc or the button closes.
const shopEl = document.getElementById('screen-shop');
const shopItemsEl = document.getElementById('shop-items');
function renderShop() {
  document.getElementById('shop-cash').textContent = `Cash: $${g.player.cash.toLocaleString('en-US')}`;
  shopItemsEl.innerHTML = '';
  for (const item of SHOP.items) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:12px;margin:10px 0';
    const label = document.createElement('span');
    label.innerHTML = `<b>${item.name}</b> — ${item.desc} · <b>$${item.price}</b>`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Buy';
    btn.style.cssText = 'margin:0;padding:8px 18px;font-size:14px';
    btn.disabled = g.player.cash < item.price;
    btn.addEventListener('click', () => buyShop(item));
    row.appendChild(label);
    row.appendChild(btn);
    shopItemsEl.appendChild(row);
  }
}
function buyShop(item) {
  const p = g.player;
  if (p.cash < item.price) {
    g.hud.toast('Not enough cash');
    return;
  }
  p.cash -= item.price;
  if (item.id === 'ammo') {
    const cur = g.weapons.state.current;
    if (g.weapons.def().melee) {
      g.weapons.state.reserve.pistol = (g.weapons.state.reserve.pistol || 0) + 60;
      g.hud.toast('Ammo box — +60 pistol reserve');
    } else {
      g.weapons.state.reserve[cur] = (g.weapons.state.reserve[cur] || 0) + 60;
      g.hud.toast(`Ammo box — +60 ${g.weapons.def().name} reserve`);
    }
  } else if (item.id === 'armor') {
    p.armor = 100;
    g.hud.toast('Body armor fitted — armor 100');
  } else {
    p.hp = 100;
    g.hud.toast('Snack pack — health 100');
  }
  g.hud.setCash(p.cash);
  g.weapons.refreshHud();
  g.audio.blip();
  renderShop();
}
g.openShop = () => {
  if (g.state !== 'play') return;
  g.state = 'shop';
  renderShop();
  shopEl.classList.add('show');
  g.audio.setEngine(0, false);
};
g.closeShop = () => {
  shopEl.classList.remove('show');
  if (g.state === 'shop') g.state = 'play';
};
document.getElementById('btn-shop-close').addEventListener('click', () => g.closeShop());

function applySave(save) {
  if (!save) return;
  g.player.cash = typeof save.cash === 'number' ? save.cash : START_CASH;
  if (Array.isArray(save.completed)) {
    for (const id of save.completed) g.missions.completed.add(id);
  }
  if (typeof save.hp === 'number') g.player.hp = Math.max(1, save.hp);
  if (typeof save.armor === 'number') g.player.armor = Math.max(0, Math.min(100, save.armor));
  if (typeof save.x === 'number' && typeof save.z === 'number') {
    g.player.pos.set(save.x, 0, save.z);
  }
  if (Array.isArray(save.weapons)) {
    for (const id of save.weapons) g.weapons.state.owned[id] = true;
  }
  if (typeof save.weapon === 'string' && g.weapons.state.owned[save.weapon]) {
    g.weapons.state.current = save.weapon;
  }
  if (save.mag && typeof save.mag === 'object') g.weapons.state.mag = save.mag;
  if (save.reserve && typeof save.reserve === 'object') g.weapons.state.reserve = save.reserve;
  if (typeof save.packages === 'number') g.pickups.collected = save.packages;
  if (save.stats && typeof save.stats === 'object') Object.assign(g.stats, save.stats);
  g.weapons.showModel();
  g.weapons.refreshHud();
}

const saved = loadSave();
if (saved) {
  applySave(saved);
  document.getElementById('btn-continue').style.display = 'inline-block';
  document.getElementById('save-note').textContent = `Saved game found — $${g.player.cash.toLocaleString('en-US')}, ${g.missions.completed.size} of 6 jobs done.`;
}
g.player.cash = g.player.cash || START_CASH;
g.hud.setCash(g.player.cash);
g.hud.setHealth(g.player.hp);
g.hud.setArmor(g.player.armor);
g.hud.setStars(0);
g.hud.setPackages(g.pickups.collected, 10);
g.weapons.refreshHud();
g.hud.setObjective('Press M to start your first job');

function startGame(fresh) {
  if (fresh) {
    clearSave();
    g.player.cash = START_CASH;
    g.missions.completed.clear();
    g.player.hp = PLAYER.maxHp;
    g.player.armor = 0;
    g.player.pos.set(0, 0, 30);
    g.weapons.state.owned = { fists: true, pistol: true };
    g.weapons.state.current = 'pistol';
    g.weapons.state.mag = { pistol: 12 };
    g.weapons.state.reserve = { pistol: 60 };
    g.weapons.showModel();
    g.police.setStars(0);
    g.hud.setCash(START_CASH);
    g.hud.setHealth(PLAYER.maxHp);
    g.hud.setArmor(0);
    g.weapons.refreshHud();
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

function statsText() {
  const s = g.stats;
  const acc = s.shotsFired > 0 ? Math.round((s.shotsHit / s.shotsFired) * 100) : 0;
  const mins = Math.floor(s.timePlayed / 60);
  const secs = Math.floor(s.timePlayed % 60);
  return `Jobs done ${g.missions.completed.size} of 6 &nbsp;·&nbsp; Cash earned $${s.cashEarned.toLocaleString('en-US')}<br>`
    + `Shots ${s.shotsFired} (hit ${acc}%) &nbsp;·&nbsp; Takedowns ${s.kills}<br>`
    + `Cars stolen ${s.carsStolen} &nbsp;·&nbsp; Packages ${g.pickups.collected}/10<br>`
    + `Time played ${mins}:${String(secs).padStart(2, '0')}`;
}

function togglePause() {
  if (g.state === 'play') {
    g.state = 'paused';
    document.getElementById('stats-line').innerHTML = statsText();
    document.getElementById('screen-pause').classList.add('show');
  } else if (g.state === 'paused') {
    g.state = 'play';
    document.getElementById('screen-pause').classList.remove('show');
  }
}

// Day/night: the sun drops over a 5-minute cycle; headlights and the sky follow.
const skyDay = new THREE.Color(0x87b5e0);
const skyNight = new THREE.Color(0x0b1020);
const fogDay = new THREE.Color(0xa8c6e0);
const fogNight = new THREE.Color(0x0a0f1e);
function updateDayNight(dt) {
  g.dayT = (g.dayT + dt / 300) % 1;
  if (g.dayT < g.prevDayT) g.day += 1;
  g.prevDayT = g.dayT;
  // 0.25 = noon (full daylight), 0.75 = midnight, 0/0.5 = dawn/dusk.
  const daylight = Math.max(0, 0.5 + 0.5 * Math.cos((g.dayT - 0.25) * Math.PI * 2));
  const sun = g.city.sun;
  sun.intensity = 0.25 + daylight * 2.35;
  const elev = Math.max(0, Math.sin(g.dayT * Math.PI * 2));
  sun.position.set(180 * Math.cos(g.dayT * Math.PI * 2), 60 + elev * 220, 120);
  scene.background.lerpColors(skyNight, skyDay, daylight);
  scene.fog.color.lerpColors(fogNight, fogDay, daylight);
  // Headlights after dark while driving.
  const driving = !g.player.onFoot && g.player.car;
  const dark = daylight < 0.35;
  if (driving && dark) {
    const car = g.player.car;
    headlight.intensity = 90;
    headlight.position.set(car.pos.x, 2.2, car.pos.z);
    headlight.target.position.set(
      car.pos.x + Math.sin(car.heading) * 25,
      0.5,
      car.pos.z + Math.cos(car.heading) * 25,
    );
  } else {
    headlight.intensity = 0;
  }
  // Rain showers: roll a new one every minute or so.
  const rain = g.rain;
  rain.timer -= dt;
  if (rain.timer <= 0) {
    rain.active = !rain.active;
    rain.timer = rain.active ? 25 : 60 + Math.random() * 60;
    rain.points.visible = rain.active;
    if (rain.active) g.hud.toast('Rain over Neon Bay — roads are slick');
  }
  if (rain.active) {
    const pos = rain.points.geometry.attributes.position;
    const px = g.player.pos.x;
    const pz = g.player.pos.z;
    for (let i = 0; i < rain.vel.length; i += 1) {
      let y = pos.getY(i) - rain.vel[i] * dt;
      if (y < 0) {
        y = 45 + Math.random() * 10;
        pos.setX(i, px + (Math.random() - 0.5) * 120);
        pos.setZ(i, pz + (Math.random() - 0.5) * 120);
      }
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
    rain.points.position.set(0, 0, 0);
  }
}
g.updateDayNight = updateDayNight;

function nearShop() {
  // The shop front faces south (z 112); the counter is 8 units in front of
  // the building centre, which the player can actually reach.
  return g.player.onFoot && Math.hypot(g.player.pos.x - SHOP.x, g.player.pos.z - (SHOP.z - 8)) < 5;
}

function step(dt) {
  g.time += dt;
  g.stats.timePlayed += dt;
  const p = g.player;
  const actions = g.input.takeActions();
  if (actions & ACT_PAUSE) {
    if (g.state === 'shop') g.closeShop();
    else togglePause();
  }
  if (g.state !== 'play') return;
  if (actions & ACT_MISSION) {
    if (!g.missions.current && g.missions.available()) {
      g.missions.start(g.missions.available());
    } else if (g.missions.current) {
      g.hud.toast('Job already running — check the objective (top left)');
    }
  }
  if (actions & ACT_ENTER) {
    if (nearShop()) g.openShop();
    else tryEnterExitCar(g);
  }
  if (actions & ACT_RADIO) {
    const name = g.audio.nextStation();
    g.hud.toast(`Radio: ${name}`);
  }
  if (actions & ACT_TAXI) g.pickups.pickupTaxi();
  const slot = g.input.takeWeaponSlot();
  if (slot >= 1 && slot <= 6) {
    const id = WEAPON_ORDER[slot - 1];
    if (id) g.weapons.select(id);
  }
  const wheel = g.input.takeWheel();
  if (wheel !== 0) g.weapons.cycle(wheel > 0 ? 1 : -1);
  if (actions & ACT_PUNCH) g.combat.punch();
  if (actions & ACT_RELOAD) g.combat.reload();
  if (g.input.mouseHeld()) g.combat.shoot();
  if (p.reloading > 0) {
    p.reloading -= dt;
    if (p.reloading <= 0) g.weapons.finishReload();
  }
  g.weapons.tick(dt);
  g.combat.tick(dt);
  p.shotRecently = Math.max(0, p.shotRecently - dt);
  if (p.onFoot) updatePlayerOnFoot(g, dt, g.input);
  else updatePlayerCar(g, dt, g.input);
  updateTraffic(g, dt);
  updatePeds(g, dt);
  updatePolice(g, dt);
  g.missions.update(dt);
  g.pickups.update(dt);
  g.effects.update(dt);
  updateCamera(g, dt);
  updateDayNight(dt);
  // Health regen when calm: no wanted stars and no damage for 10 seconds.
  if (g.police.stars === 0 && p.hp > 0 && p.hp < PLAYER.maxHp && g.time - p.lastDamageAt > 10) {
    p.hp = Math.min(PLAYER.maxHp, p.hp + 3 * dt);
  }
  // HUD.
  g.hud.setHealth(p.hp);
  g.hud.setArmor(p.armor);
  const driving = !p.onFoot && p.car;
  g.hud.setSpeed(driving ? p.car.speed * 3.6 : 0, driving);
  g.hud.setCrosshair(p.onFoot || (p.car && (g.weapons.def().driveby)));
  g.hud.drawMinimap(g);
  g.audio.tick(dt);
  g.hud.refreshAll(g);
  let hint = '';
  if (nearShop()) {
    hint = 'E — enter Neon Arms & Snacks';
  } else if (p.onFoot) {
    let near = false;
    for (const car of g.cars) {
      if (car.kind !== 'police' && Math.hypot(car.pos.x - p.pos.x, car.pos.z - p.pos.z) < 4.5) { near = true; break; }
    }
    hint = near ? 'E — steal car · F — punch · Click — shoot · 1-6 — weapon · M — job' : 'WASD — move · Shift — sprint · Click — shoot · 1-6 — weapon · M — job';
  } else {
    hint = 'W/S — gas & brake · A/D — steer · E — get out · Click — drive-by · Q — radio · M — job';
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
      armor: g.player.armor,
      cash: g.player.cash,
      stars: g.police.stars,
      onFoot: g.player.onFoot,
      x: Math.round(g.player.pos.x * 10) / 10,
      z: Math.round(g.player.pos.z * 10) / 10,
      speed: g.player.car ? Math.round(g.player.car.speed * 10) / 10 : 0,
      ammo: g.player.ammo,
      weapon: g.weapons.state.current,
      mag: g.weapons.state.mag[g.weapons.state.current] ?? null,
      reserve: g.weapons.state.reserve[g.weapons.state.current] ?? null,
      reloading: Math.round(g.player.reloading * 100) / 100,
      cooldown: Math.round(g.weapons.state.cooldown * 100) / 100,
      owned: Object.keys(g.weapons.state.owned),
      packages: g.pickups.collected,
      mission: g.missions.current ? g.missions.current.id : null,
      missionStep: g.missions.stepIndex,
      missionDone: [...g.missions.completed],
      target: g.missions.targetPed ? { x: Math.round(g.missions.targetPed.pos.x), z: Math.round(g.missions.targetPed.pos.z), hp: Math.round(g.missions.targetPed.hp), dead: g.missions.targetPed.dead } : null,
      vicHp: g.missions.vicPed ? Math.round(g.missions.vicHp) : null,
      vic: g.missions.vicPed ? { x: Math.round(g.missions.vicPed.pos.x), z: Math.round(g.missions.vicPed.pos.z) } : null,
      officers: g.police.officers.map((o) => ({ x: Math.round(o.pos.x), z: Math.round(o.pos.z), hp: Math.round(o.hp), protect: !!o.protect })),
      heading: Math.round(g.player.heading * 100) / 100,
      dest: g.missions.current && g.missions.current.steps[g.missions.stepIndex] && g.missions.current.steps[g.missions.stepIndex].target ? { x: g.missions.current.steps[g.missions.stepIndex].target.x, z: g.missions.current.steps[g.missions.stepIndex].target.z } : null,
      taxi: g.pickups.taxi ? { riding: g.pickups.taxi.riding, wx: g.pickups.taxi.waiting.x, wz: g.pickups.taxi.waiting.z, dx: g.pickups.taxi.dest.x, dz: g.pickups.taxi.dest.z } : null,
      cars: g.cars.length,
      peds: g.peds.filter((q) => !q.dead).length,
      policeCars: g.police.cars.length,
      dayT: Math.round(g.dayT * 100) / 100,
      rain: g.rain.active,
      stats: { ...g.stats },
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
  giveWeapon: (id) => g.weapons.give(id, true),
  setArmor: (v) => { g.player.armor = v; },
  setHp: (v) => { g.player.hp = v; },
  setTimeOfDay: (v) => { g.dayT = v; },
  setStars: (n) => g.police.setStars(n),
  teleport: (x, z) => { g.player.pos.set(x, 0, z); g.player.mesh.position.set(x, 0, z); },
  aimAt: (x, z) => { const p = g.player; p.heading = Math.atan2(x - p.pos.x, z - p.pos.z); p.camYaw = p.heading; },
  shootOnce: () => g.combat.shoot(),
  reload: () => g.combat.reload(),
  damage: (n) => damagePlayer(g, n),
  openShop: () => g.openShop(),
  getInCar: () => {
    let best = null;
    let bd = 1e9;
    for (const c of g.cars) {
      if (c.kind === 'police') continue;
      const d = Math.hypot(c.pos.x - g.player.pos.x, c.pos.z - g.player.pos.z);
      if (d < bd) { bd = d; best = c; }
    }
    if (!best) return false;
    g.player.pos.set(best.pos.x + 2, 0, best.pos.z);
    g.player.mesh.position.set(best.pos.x + 2, 0, best.pos.z);
    tryEnterExitCar(g);
    return !g.player.onFoot;
  },
  teleportCar: (x, z) => {
    if (!g.player.car) return false;
    g.player.car.pos.set(x, 0, z);
    g.player.car.mesh.position.set(x, 0, z);
    return true;
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
  g.hud.setArmor(g.player.armor);
  g.hud.setCash(g.player.cash);
  g.hud.setStars(g.police.stars);
  g.hud.setPackages(g.pickups.collected, 10);
  g.weapons.refreshHud();
  const driving = !g.player.onFoot && g.player.car;
  g.hud.setSpeed(driving ? g.player.car.speed * 3.6 : 0, driving);
  g.hud.setHint(driving ? 'W/S — gas & brake · A/D — steer · E — get out · M — job' : 'WASD — move · Shift — sprint · Click — shoot · M — job');
  g.hud.drawMinimap(g);
  g.hud.refreshAll(g);
  // Keep the staged dialogue visible for the still, and expose any JS
  // errors in the (visually hidden) status node for automated checks.
  if (g.shotDialogue) {
    const d = g.shotDialogue;
    g.hud.showDialogue(d.name, d.role, d.text, d.color, 60000);
  } else if (g.missions.current) {
    const m = g.missions.current;
    g.hud.showDialogue(m.giver, 'FIXER', m.line, '#ff2e88', 60000);
  }
  document.getElementById('status').textContent = `errors:${JSON.stringify(window.__errors)}`;
  updateCamera(g, 0.5);
  renderer.render(scene, camera);
  window.__shotReady = true;
} else {
  requestAnimationFrame(frame);
}
