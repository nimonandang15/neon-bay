// Weapons: six slots, pickups, switching, reload and the in-hand model.
// The player starts with fists and a pistol; the rest are found in the city.
import * as THREE from 'three';
import { WEAPONS, WEAPON_ORDER } from './config.js';

function buildWeaponModel(id) {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c2733, roughness: 0.4, metalness: 0.6 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.8 });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const add = (mesh, x, y, z) => {
    mesh.position.set(x, y, z);
    g.add(mesh);
    return mesh;
  };
  if (id === 'bat') {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.9, 8), wood);
    m.rotation.x = Math.PI / 2 - 0.5;
    add(m, 0, 0, 0.2);
  } else if (id === 'pistol') {
    const b = new THREE.Mesh(box, dark);
    b.scale.set(0.07, 0.1, 0.32);
    add(b, 0, 0, 0.12);
    const grip = new THREE.Mesh(box, wood);
    grip.scale.set(0.06, 0.16, 0.08);
    grip.rotation.x = 0.4;
    add(grip, 0, -0.08, -0.02);
  } else if (id === 'shotgun') {
    const b = new THREE.Mesh(box, dark);
    b.scale.set(0.09, 0.11, 0.85);
    add(b, 0, 0, 0.3);
    const pump = new THREE.Mesh(box, wood);
    pump.scale.set(0.08, 0.09, 0.3);
    add(pump, 0, -0.08, 0.35);
  } else if (id === 'smg') {
    const b = new THREE.Mesh(box, dark);
    b.scale.set(0.09, 0.12, 0.55);
    add(b, 0, 0, 0.2);
    const mag = new THREE.Mesh(box, dark);
    mag.scale.set(0.06, 0.22, 0.08);
    add(mag, 0, -0.14, 0.12);
  } else if (id === 'rifle') {
    const b = new THREE.Mesh(box, dark);
    b.scale.set(0.07, 0.09, 1.05);
    add(b, 0, 0, 0.4);
    const stock = new THREE.Mesh(box, wood);
    stock.scale.set(0.06, 0.12, 0.3);
    add(stock, 0, -0.02, -0.28);
    const scope = new THREE.Mesh(box, dark);
    scope.scale.set(0.05, 0.06, 0.18);
    add(scope, 0, 0.09, 0.25);
  }
  // Fists: no model.
  return g;
}

export function createWeapons(g) {
  const p = g.player;
  const modelGroup = new THREE.Group();
  modelGroup.name = 'weaponModel';
  modelGroup.position.set(0.34, 1.05, 0.3);
  modelGroup.rotation.x = -0.35;
  p.mesh.add(modelGroup);
  let currentModel = null;

  const state = {
    owned: { fists: true, pistol: true },
    current: 'pistol',
    mag: { pistol: 12 },
    reserve: { pistol: 60 },
    cooldown: 0,
    lastShotAt: -99,
  };

  function showModel() {
    if (currentModel) {
      modelGroup.remove(currentModel);
      currentModel = null;
    }
    const def = WEAPONS[state.current];
    if (def.melee && state.current === 'fists') return;
    currentModel = buildWeaponModel(state.current);
    modelGroup.add(currentModel);
    modelGroup.visible = p.onFoot;
  }

  function refreshHud() {
    const def = WEAPONS[state.current];
    const mag = def.melee ? null : state.mag[state.current];
    const res = def.melee ? null : state.reserve[state.current];
    g.hud.setWeapon(def.name, mag, res, state.current, state.owned, state.mag, state.reserve);
  }

  return {
    state,
    def() {
      return WEAPONS[state.current];
    },
    give(id, silent) {
      const def = WEAPONS[id];
      if (!def) return false;
      const first = !state.owned[id];
      state.owned[id] = true;
      if (!def.melee) {
        state.mag[id] = def.mag;
        state.reserve[id] = (state.reserve[id] || 0) + def.reserve;
      }
      if (first) {
        this.select(id);
        if (!silent) g.hud.toast(`Picked up ${def.name}!`);
      } else if (!silent) {
        g.hud.toast(`${def.name} ammo topped up`);
      }
      refreshHud();
      return true;
    },
    select(id) {
      if (!state.owned[id] || state.current === id) return false;
      state.current = id;
      state.cooldown = 0.15;
      p.reloading = 0;
      showModel();
      refreshHud();
      return true;
    },
    cycle(dir) {
      const owned = WEAPON_ORDER.filter((id) => state.owned[id]);
      if (owned.length < 2) return;
      let i = owned.indexOf(state.current);
      i = (i + dir + owned.length) % owned.length;
      this.select(owned[i]);
    },
    reload() {
      const def = WEAPONS[state.current];
      const p2 = g.player;
      if (def.melee || p2.reloading > 0) return;
      const need = def.mag - (state.mag[state.current] || 0);
      if (need <= 0 || (state.reserve[state.current] || 0) <= 0) return;
      p2.reloading = 1.3;
      g.audio.reload();
    },
    finishReload() {
      const def = WEAPONS[state.current];
      const take = Math.min(def.mag - state.mag[state.current], state.reserve[state.current]);
      state.mag[state.current] += take;
      state.reserve[state.current] -= take;
      refreshHud();
    },
    tick(dt) {
      state.cooldown = Math.max(0, state.cooldown - dt);
      modelGroup.visible = p.onFoot;
    },
    refreshHud,
    showModel,
  };
}
