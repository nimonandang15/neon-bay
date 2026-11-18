// Combat: a pistol (hitscan from the camera's crosshair) and a melee punch.
// Shooting a bystander or a cop is a crime; a wrecked police car stops chasing.
import * as THREE from 'three';
import { PLAYER } from './config.js';
import { killPed } from './cars.js';

const raycaster = new THREE.Raycaster();

export function createCombat(g) {
  return {
    shoot() {
      const p = g.player;
      if (!p.onFoot) {
        g.hud.toast('You cannot shoot from the wheel — get out first');
        return;
      }
      if (p.reloading > 0) return;
      if (p.ammo <= 0) {
        g.hud.toast('Click — empty. Press R to reload');
        g.audio.click();
        return;
      }
      p.ammo -= 1;
      p.shotRecently = 1.2;
      g.audio.gunshot();
      g.hud.setAmmo(p.ammo);
      raycaster.setFromCamera(new THREE.Vector2(0, 0), g.camera);
      const targets = [];
      for (const ped of g.peds) {
        if (!ped.dead) targets.push({ obj: ped.mesh, kind: 'ped', ref: ped });
      }
      for (const car of g.cars) {
        if (car.kind === 'police') targets.push({ obj: car.mesh, kind: 'police', ref: car });
        else if (car.kind === 'traffic') targets.push({ obj: car.mesh, kind: 'traffic', ref: car });
      }
      const hits = raycaster.intersectObjects(targets.map((t) => t.obj), true);
      let tracerEnd = null;
      if (hits.length > 0) {
        const hit = hits[0];
        tracerEnd = hit.point;
        let node = hit.object;
        while (node.parent && node.parent !== g.scene) node = node.parent;
        const target = targets.find((t) => t.obj === node);
        if (target) {
          if (target.kind === 'ped') {
            killPed(g, target.ref, false);
            g.hud.toast('Bystander down — the whole block saw that');
          } else if (target.kind === 'police') {
            target.ref.hp -= PLAYER.pistolDamage;
            g.police.addCrime(1, 'shot at the PD');
            if (target.ref.hp <= 0) {
              g.hud.toast('Interceptor disabled!');
              g.scene.remove(target.ref.mesh);
              g.cars.splice(g.cars.indexOf(target.ref), 1);
              g.police.cars.splice(g.police.cars.indexOf(target.ref), 1);
            }
          } else {
            g.hud.toast('You put a round through a parked car');
            g.police.addCrime(1, 'shots fired');
          }
        }
      } else {
        tracerEnd = raycaster.ray.at(60, new THREE.Vector3());
      }
      g.effects.tracer(g.camera.position.clone(), tracerEnd);
      if (p.ammo === 0) g.hud.toast('Magazine empty — press R to reload');
    },
    punch() {
      const p = g.player;
      if (!p.onFoot) return;
      g.audio.punch();
      const fx = Math.sin(p.heading);
      const fz = Math.cos(p.heading);
      let hitAny = false;
      for (const ped of g.peds) {
        if (ped.dead) continue;
        const dx = ped.pos.x - p.pos.x;
        const dz = ped.pos.z - p.pos.z;
        const d = Math.hypot(dx, dz);
        const facing = (dx * fx + dz * fz) / (d || 1);
        if (d < PLAYER.punchRange && facing > 0.3) {
          hitAny = true;
          if (ped.kind === 'officer') {
            ped.bustedHold = Math.max(0, ped.bustedHold - 0.8);
            ped.pos.x += (dx / d) * 3;
            ped.pos.z += (dz / d) * 3;
            g.hud.toast('You shoved the cop off — run!');
          } else {
            killPed(g, ped, false);
          }
        }
      }
      if (!hitAny) g.hud.toast('You swung at the air');
    },
    reload() {
      const p = g.player;
      if (p.reloading > 0 || p.ammo === PLAYER.magSize) return;
      p.reloading = PLAYER.reloadTime;
      g.audio.reload();
    },
  };
}
