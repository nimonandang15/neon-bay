// Combat: six weapons with slots, hitscan fire with spread, melee, enemy
// health, shotgun knockback, hit markers, muzzle flash and drive-by
// shooting from a car (pistol and SMG only).
import * as THREE from 'three';
import { PLAYER, WEAPONS } from './config.js';
import { killPed } from './cars.js';

const raycaster = new THREE.Raycaster();

// Damage a pedestrian: officers take several hits, bystanders fewer.
// Returns true if the ped died.
export function damagePed(g, ped, dmg, fromDir, knock) {
  if (ped.dead) return false;
  ped.hp -= dmg;
  if (knock && ped.hp > 0) {
    const k = knock * 1.6;
    ped.pos.x += fromDir.x * k;
    ped.pos.z += fromDir.z * k;
  }
  if (ped.hp <= 0) {
    const wasOfficer = ped.kind === 'officer';
    const wasTarget = ped.kind === 'target';
    killPed(g, ped, false);
    if (wasOfficer) {
      // Vigilante bonus: taking down the law pays.
      g.player.cash += 25;
      g.stats.cashEarned += 25;
      g.hud.setCash(g.player.cash);
      g.hud.toast('Officer down — vigilante bounty +$25');
    }
    if (wasTarget) g.missions.onTargetDown(ped);
    return true;
  }
  // A wounded bystander runs.
  if (ped.kind !== 'officer' && ped.kind !== 'target') ped.state = 'flee';
  return false;
}

export function createCombat(g) {
  const flash = new THREE.PointLight(0xffe600, 0, 18, 1.8);
  flash.position.set(0, 2, 0);
  g.scene.add(flash);
  let flashT = 0;

  function muzzleFlash() {
    const p = g.player;
    const origin = p.onFoot ? p.pos.clone().setY(1.5) : p.car.pos.clone().setY(1.6);
    flash.position.copy(origin);
    flash.intensity = 60;
    flashT = 0.06;
  }

  function fireRay(origin, dir, def, isDriveby) {
    raycaster.set(origin, dir);
    raycaster.far = def.range;
    const targets = [];
    for (const ped of g.peds) {
      if (!ped.dead) targets.push({ obj: ped.mesh, kind: 'ped', ref: ped });
    }
    for (const car of g.cars) {
      if (car.kind === 'police') targets.push({ obj: car.mesh, kind: 'police', ref: car });
      else if (car.kind === 'traffic') targets.push({ obj: car.mesh, kind: 'traffic', ref: car });
    }
    const hits = raycaster.intersectObjects(targets.map((t) => t.obj), true);
    let end = origin.clone().add(dir.clone().multiplyScalar(def.range));
    let hitAny = false;
    if (hits.length > 0) {
      const hit = hits[0];
      end = hit.point.clone();
      let node = hit.object;
      while (node.parent && node.parent !== g.scene) node = node.parent;
      const target = targets.find((t) => t.obj === node);
      if (target) {
        hitAny = true;
        const dist = hit.distance;
        const falloff = g.weapons.state.current === 'shotgun' ? Math.max(0.35, 1 - dist / def.range) : 1;
        const dmg = def.damage * falloff;
        if (target.kind === 'ped') {
          const fdir = { x: dir.x, z: dir.z };
          damagePed(g, target.ref, dmg, fdir, def.knock);
          if (!target.ref.dead) g.hud.toast(`${target.ref.kind === 'officer' ? 'Officer' : 'Bystander'} hit — ${Math.max(0, Math.round(target.ref.hp))} HP left`);
          g.police.addCrime(1, 'shots fired');
        } else if (target.kind === 'police') {
          target.ref.hp -= dmg;
          g.police.addCrime(1, 'shot at the PD');
          if (target.ref.hp <= 0) {
            g.hud.toast('Interceptor disabled!');
            g.scene.remove(target.ref.mesh);
            g.cars.splice(g.cars.indexOf(target.ref), 1);
            const pi = g.police.cars.indexOf(target.ref);
            if (pi >= 0) g.police.cars.splice(pi, 1);
            const ri = g.police.roadblock.indexOf(target.ref);
            if (ri >= 0) g.police.roadblock.splice(ri, 1);
          }
        } else {
          target.ref.hp -= dmg;
          g.police.addCrime(1, 'shots fired');
          if (target.ref.hp <= 0) {
            g.hud.toast('You wrecked a parked car');
            g.scene.remove(target.ref.mesh);
            g.cars.splice(g.cars.indexOf(target.ref), 1);
          } else {
            g.hud.toast('You put a round through a parked car');
          }
        }
      }
    }
    g.effects.tracer(origin.clone(), end);
    return hitAny;
  }

  return {
    tick(dt) {
      if (flashT > 0) {
        flashT -= dt;
        if (flashT <= 0) flash.intensity = 0;
      }
    },
    shoot() {
      const p = g.player;
      const w = g.weapons;
      const def = w.def();
      if (w.state.cooldown > 0 || p.reloading > 0) return;
      if (def.melee) {
        this.punch();
        return;
      }
      const driveby = !p.onFoot;
      if (driveby && !def.driveby) {
        g.hud.toast(`You cannot use the ${def.name} from the wheel — get out first`);
        return;
      }
      if (w.state.mag[w.state.current] <= 0) {
        g.hud.toast('Click — empty. Press R to reload');
        g.audio.click();
        return;
      }
      w.state.mag[w.state.current] -= 1;
      w.state.cooldown = def.rate;
      w.state.lastShotAt = g.time;
      p.shotRecently = 1.2;
      g.stats.shotsFired += 1;
      g.audio.weaponSound(def.sound);
      w.refreshHud();
      // Fire from the player's chest (on foot) or the car roof (drive-by),
      // along the camera's horizontal aim. A raw camera ray would dive under
      // distant targets: the camera looks down at the player from above.
      // Chest height (y 1.1) keeps the ray on the torso, the widest target.
      const origin = driveby ? p.car.pos.clone().setY(1.2) : p.pos.clone().setY(1.1);
      const fwd = new THREE.Vector3();
      g.camera.getWorldDirection(fwd);
      fwd.y = 0;
      if (fwd.lengthSq() < 0.001) fwd.set(Math.sin(p.heading), 0, Math.cos(p.heading));
      fwd.normalize();
      const aimYaw = Math.atan2(fwd.x, fwd.z);
      const spread = def.spread * (driveby ? 2 : 1);
      let hitAny = false;
      for (let i = 0; i < def.pellets; i += 1) {
        const yaw = aimYaw + (Math.random() - 0.5) * 2 * spread;
        const pitch = (Math.random() - 0.5) * 2 * spread * 0.5;
        const dir = new THREE.Vector3(
          Math.sin(yaw) * Math.cos(pitch),
          Math.sin(pitch),
          Math.cos(yaw) * Math.cos(pitch),
        );
        if (fireRay(origin, dir, def, driveby)) hitAny = true;
      }
      if (hitAny) {
        g.stats.shotsHit += 1;
        g.hud.hitmarker();
      }
      muzzleFlash();
      if (w.state.mag[w.state.current] === 0) g.hud.toast('Magazine empty — press R to reload');
    },
    punch() {
      const p = g.player;
      const w = g.weapons;
      const def = w.def();
      if (w.state.cooldown > 0) return;
      w.state.cooldown = def.rate;
      if (!p.onFoot) return;
      g.audio.weaponSound(def.sound);
      const fx = Math.sin(p.heading);
      const fz = Math.cos(p.heading);
      let hitAny = false;
      for (const ped of g.peds) {
        if (ped.dead) continue;
        const dx = ped.pos.x - p.pos.x;
        const dz = ped.pos.z - p.pos.z;
        const d = Math.hypot(dx, dz);
        const facing = (dx * fx + dz * fz) / (d || 1);
        if (d < def.range && facing > 0.3) {
          hitAny = true;
          if (ped.kind === 'officer') {
            ped.bustedHold = Math.max(0, ped.bustedHold - 0.8);
            damagePed(g, ped, def.damage, { x: dx / d, z: dz / d }, def.knock);
            if (!ped.dead) g.hud.toast('You shoved the cop off — run!');
          } else {
            damagePed(g, ped, def.damage, { x: dx / d, z: dz / d }, def.knock);
          }
        }
      }
      if (!hitAny) g.hud.toast(w.state.current === 'bat' ? 'You swung the bat at the air' : 'You swung at the air');
    },
    reload() {
      g.weapons.reload();
    },
  };
}
