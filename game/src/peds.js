// Pedestrians: box-built walkers that stroll the sidewalks, flee from danger,
// and — in police blue — the officers who chase the player on foot.
import * as THREE from 'three';
import { CITY, PED, PALETTE } from './config.js';
import { clampToCity, nearestStreetCoord, resolveCollisions } from './city.js';

const bodyGeo = new THREE.BoxGeometry(1, 1, 1);

export function buildPedMesh(skin, shirt, pants, officer) {
  const g = new THREE.Group();
  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.8 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.9 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: pants, roughness: 0.9 });
  const legs = new THREE.Mesh(bodyGeo, pantsMat);
  legs.scale.set(0.42, 0.8, 0.3);
  legs.position.y = 0.4;
  g.add(legs);
  const torso = new THREE.Mesh(bodyGeo, shirtMat);
  torso.scale.set(0.55, 0.62, 0.32);
  torso.position.y = 1.1;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), skinMat);
  head.position.y = 1.62;
  head.castShadow = true;
  g.add(head);
  const armMat = shirtMat;
  for (const sx of [-0.33, 0.33]) {
    const arm = new THREE.Mesh(bodyGeo, armMat);
    arm.scale.set(0.13, 0.55, 0.13);
    arm.position.set(sx, 1.08, 0);
    arm.name = sx < 0 ? 'armL' : 'armR';
    g.add(arm);
  }
  if (officer) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.12, 10), new THREE.MeshStandardMaterial({ color: 0x141c28, roughness: 0.6 }));
    cap.position.y = 1.82;
    g.add(cap);
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.03), new THREE.MeshBasicMaterial({ color: 0xffd700 }));
    badge.position.set(0.12, 1.22, 0.18);
    g.add(badge);
  }
  return g;
}

export function makePed(scene, rng, kind, x, z) {
  const officer = kind === 'officer';
  const mesh = buildPedMesh(
    rng.pick(PALETTE.pedSkin),
    officer ? 0x1c2733 : rng.pick(PALETTE.pedShirt),
    officer ? 0x141c28 : rng.pick([0x2c3e50, 0x5d4037, 0x37474f]),
    officer,
  );
  mesh.position.set(x, 0, z);
  scene.add(mesh);
  return {
    mesh,
    kind,
    pos: mesh.position,
    heading: rng.range(0, Math.PI * 2),
    speed: 0,
    // Officers take several hits, the mission target more; bystanders few.
    hp: officer ? 100 : kind === 'target' ? 150 : 50,
    maxHp: officer ? 100 : kind === 'target' ? 150 : 50,
    state: 'walk',
    target: null,
    dead: false,
    deadTimer: 0,
    bustedHold: 0,
    walkPhase: rng.next() * 10,
    // Sidewalk strolling: pick a street and a direction, walk to the next corner.
    axis: rng.chance(0.5) ? 'x' : 'z',
    dir: rng.chance(0.5) ? 1 : -1,
    // A little variety: some walk faster, some slower.
    pace: rng.range(0.8, 1.25),
  };
}

function pickSidewalkTarget(ped, rng) {
  const street = nearestStreetCoord(ped.axis === 'x' ? ped.pos.z : ped.pos.x);
  const along = ped.axis === 'x' ? ped.pos.x : ped.pos.z;
  const next = nearestStreetCoord(along) + (ped.dir > 0 ? CITY.pitch : -CITY.pitch);
  const lane = 10.5;
  if (ped.axis === 'x') return { x: next, z: street + lane * (rng.chance(0.5) ? 1 : -1) };
  return { x: street + lane * (rng.chance(0.5) ? 1 : -1), z: next };
}

export function updatePeds(g, dt) {
  const playerPos = g.player.pos;
  for (const ped of g.peds) {
    if (ped.dead) {
      ped.deadTimer += dt;
      if (ped.deadTimer > 14) {
        // The city cleans up: respawn a fresh walker elsewhere.
        ped.dead = false;
        ped.mesh.rotation.z = 0;
        ped.mesh.position.y = 0;
        const spot = randomSidewalkSpot(g.rng);
        ped.pos.set(spot.x, 0, spot.z);
        ped.state = 'walk';
        ped.target = null;
      }
      continue;
    }
    const dx = playerPos.x - ped.pos.x;
    const dz = playerPos.z - ped.pos.z;
    const distP = Math.hypot(dx, dz);
    const playerCar = g.player.car;
    const danger = (playerCar && Math.abs(playerCar.speed) > 8 && distP < PED.fleeRadius)
      || (!playerCar && g.player.shotRecently > 0 && distP < 14)
      || (g.police.stars >= 3 && distP < 6);
    if (ped.kind === 'officer' || ped.kind === 'target') {
      // Officers run the player down; contact builds the busted meter.
      // The mission target runs from the player instead. Protect officers
      // (mission m6) go for Vic, not the player.
      if (ped.kind === 'target') {
        const sp = PED.runSpeed * 1.05;
        ped.heading = Math.atan2(-dx, -dz);
        ped.pos.x += Math.sin(ped.heading) * sp * dt;
        ped.pos.z += Math.cos(ped.heading) * sp * dt;
        ped.walkPhase += dt * 11;
        if (distP > 30) ped.state = 'walk';
      } else if (ped.protect && g.missions.vicPed && !g.missions.vicPed.dead) {
        const vic = g.missions.vicPed;
        const vx = vic.pos.x - ped.pos.x;
        const vz = vic.pos.z - ped.pos.z;
        const vd = Math.hypot(vx, vz);
        ped.heading = Math.atan2(vx, vz);
        if (vd < 1.6) {
          g.missions.vicHp = Math.max(0, g.missions.vicHp - 3 * dt);
          if (g.missions.vicHp <= 0 && !vic.dead) {
            vic.dead = true;
            vic.deadTimer = 0;
            vic.mesh.rotation.z = Math.PI / 2;
            vic.mesh.position.y = 0.35;
          }
        } else {
          const sp = PED.runSpeed * 1.15;
          ped.pos.x += Math.sin(ped.heading) * sp * dt;
          ped.pos.z += Math.cos(ped.heading) * sp * dt;
          ped.walkPhase += dt * 11;
        }
      } else if (distP < 1.6) {
        ped.bustedHold += dt;
        g.player.hp = Math.max(0, g.player.hp - 6 * dt);
        if (g.player.hp <= 0) g.gameOver('wasted');
        if (ped.bustedHold >= 1.4) g.gameOver('busted');
      } else {
        ped.bustedHold = Math.max(0, ped.bustedHold - dt);
      }
      if (ped.kind === 'officer' && !ped.protect) {
        const sp = PED.runSpeed * 1.15;
        ped.heading = Math.atan2(dx, dz);
        ped.pos.x += Math.sin(ped.heading) * sp * dt;
        ped.pos.z += Math.cos(ped.heading) * sp * dt;
        ped.walkPhase += dt * 11;
      }
    } else if (danger) {
      ped.state = 'flee';
      const away = Math.atan2(-dx, -dz);
      ped.heading = away;
      ped.pos.x += Math.sin(away) * PED.runSpeed * dt;
      ped.pos.z += Math.cos(away) * PED.runSpeed * dt;
      ped.walkPhase += dt * 11;
      if (distP > 26) ped.state = 'walk';
    } else {
      ped.state = 'walk';
      if (!ped.target) ped.target = pickSidewalkTarget(ped, g.rng);
      const tx = ped.target.x - ped.pos.x;
      const tz = ped.target.z - ped.pos.z;
      const d = Math.hypot(tx, tz);
      if (d < 1.5) {
        ped.target = null;
        if (g.rng.chance(0.3)) {
          ped.axis = ped.axis === 'x' ? 'z' : 'x';
          ped.dir = g.rng.chance(0.5) ? 1 : -1;
        }
      } else {
        ped.heading = Math.atan2(tx, tz);
        ped.pos.x += Math.sin(ped.heading) * PED.walkSpeed * (ped.pace || 1) * dt;
        ped.pos.z += Math.cos(ped.heading) * PED.walkSpeed * (ped.pace || 1) * dt;
        ped.walkPhase += dt * 6;
      }
    }
    clampToCity(ped.pos);
    resolveCollisions(g.city.colliders, ped.pos, 0.6);
    ped.mesh.position.set(ped.pos.x, 0, ped.pos.z);
    ped.mesh.rotation.y = ped.heading;
    const swing = Math.sin(ped.walkPhase) * 0.55;
    const armL = ped.mesh.getObjectByName('armL');
    const armR = ped.mesh.getObjectByName('armR');
    if (armL) armL.rotation.x = swing;
    if (armR) armR.rotation.x = -swing;
  }
}

export function randomSidewalkSpot(rng) {
  const i = Math.floor(rng.range(-CITY.halfBlocks, CITY.halfBlocks + 1));
  const j = Math.floor(rng.range(-CITY.halfBlocks, CITY.halfBlocks + 1));
  const along = rng.range(-CITY.bounds, CITY.bounds);
  if (rng.chance(0.5)) return { x: along, z: i * CITY.pitch + (rng.chance(0.5) ? 10.5 : -10.5) };
  return { x: i * CITY.pitch + (rng.chance(0.5) ? 10.5 : -10.5), z: along };
}

export function randomStreetSpot(rng) {
  const i = Math.floor(rng.range(-CITY.halfBlocks, CITY.halfBlocks + 1));
  const along = rng.range(-CITY.bounds, CITY.bounds);
  if (rng.chance(0.5)) return { x: along, z: i * CITY.pitch };
  return { x: i * CITY.pitch, z: along };
}
