// The player: Rook, a driver for the Neon Bay crew. On foot (third person,
// drag the mouse to orbit the camera) or behind the wheel of a stolen car.
import * as THREE from 'three';
import { PLAYER, PALETTE } from './config.js';
import { clampToCity, resolveCollisions } from './city.js';
import { buildPedMesh } from './peds.js';
import { makeCar } from './cars.js';

export function createPlayer(scene, x, z) {
  const mesh = buildPedMesh(0xf1c27d, PALETTE.playerShirt, PALETTE.playerPants, false);
  mesh.position.set(x, 0, z);
  scene.add(mesh);
  return {
    mesh,
    pos: mesh.position,
    heading: 0,
    camYaw: Math.PI,
    camPitch: 0.32,
    hp: PLAYER.maxHp,
    cash: 150,
    onFoot: true,
    car: null,
    ammo: PLAYER.magSize,
    reloading: 0,
    shotRecently: 0,
    walkPhase: 0,
    moving: false,
  };
}

// On-foot movement, camera-relative: W runs away from the camera.
export function updatePlayerOnFoot(g, dt, input) {
  const p = g.player;
  const ax = input.axis();
  const drag = input.takeDrag();
  p.camYaw -= drag.x * 0.005;
  p.camPitch = Math.max(0.08, Math.min(1.1, p.camPitch + drag.y * 0.004));
  const sprint = input.sprint();
  const speed = sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
  const fx = Math.sin(p.camYaw);
  const fz = Math.cos(p.camYaw);
  const rx = Math.cos(p.camYaw);
  const rz = -Math.sin(p.camYaw);
  const mx = fx * ax.forward + rx * ax.strafe;
  const mz = fz * ax.forward + rz * ax.strafe;
  const len = Math.hypot(mx, mz);
  p.moving = len > 0.01;
  if (p.moving) {
    const nx = mx / len;
    const nz = mz / len;
    p.pos.x += nx * speed * dt;
    p.pos.z += nz * speed * dt;
    p.heading = Math.atan2(nx, nz);
    p.walkPhase += dt * (sprint ? 13 : 9);
  }
  const hit = resolveCollisions(g.city.colliders, p.pos, PLAYER.radius);
  if (hit.hit && p.moving) {
    // Slide along the wall instead of sticking.
    p.pos.x -= hit.nx * 0.05;
    p.pos.z -= hit.nz * 0.05;
  }
  clampToCity(p.pos);
  p.mesh.position.set(p.pos.x, 0, p.pos.z);
  p.mesh.rotation.y = p.heading;
  const swing = p.moving ? Math.sin(p.walkPhase) * 0.6 : 0;
  const armL = p.mesh.getObjectByName('armL');
  const armR = p.mesh.getObjectByName('armR');
  if (armL) armL.rotation.x = swing;
  if (armR) armR.rotation.x = -swing;
}

// E near a car: jack it (traffic cars count as stolen). E while driving: get out.
export function tryEnterExitCar(g) {
  const p = g.player;
  if (p.onFoot) {
    let best = null;
    let bestD = 4.5;
    for (const car of g.cars) {
      if (car.kind === 'police') continue;
      const d = Math.hypot(car.pos.x - p.pos.x, car.pos.z - p.pos.z);
      if (d < bestD) {
        best = car;
        bestD = d;
      }
    }
    if (!best) {
      g.hud.toast('No car in reach — walk up to one and press E');
      return false;
    }
    if (best.kind === 'traffic' && best.driver) {
      best.driver = false;
      g.police.addCrime(1, 'car jacked');
      g.hud.toast('Car jacked! The Bay PD noticed.');
      g.audio.sirenBlip();
      // The old driver runs off.
      const spot = best.pos;
      const ped = g.peds.find((q) => !q.dead && Math.hypot(q.pos.x - spot.x, q.pos.z - spot.z) < 12);
      if (ped) ped.state = 'flee';
    }
    best.kind = 'player';
    p.car = best;
    p.onFoot = false;
    p.mesh.visible = false;
    g.audio.engineStart();
    g.missions.onEnterCar(best);
    return true;
  }
  // Get out beside the car.
  const car = p.car;
  car.kind = 'traffic';
  car.driver = false;
  car.speed = 0;
  p.car = null;
  p.onFoot = true;
  p.mesh.visible = true;
  p.pos.set(car.pos.x + Math.cos(car.heading) * 2.6, 0, car.pos.z - Math.sin(car.heading) * 2.6);
  p.heading = car.heading;
  p.mesh.position.copy(p.pos);
  g.audio.engineStop();
  return true;
}

// Third-person camera: behind the player on foot, chase cam in a car.
export function updateCamera(g, dt) {
  const p = g.player;
  const cam = g.camera;
  let target;
  let dist;
  let height;
  if (p.onFoot) {
    target = new THREE.Vector3(p.pos.x, 1.6, p.pos.z);
    dist = 8.5;
    height = 3.4 + p.camPitch * 4;
    const cx = p.pos.x - Math.sin(p.camYaw) * dist;
    const cz = p.pos.z - Math.cos(p.camYaw) * dist;
    cam.position.lerp(new THREE.Vector3(cx, height, cz), Math.min(1, 10 * dt));
    cam.lookAt(target);
  } else {
    const car = p.car;
    target = new THREE.Vector3(car.pos.x, 1.4, car.pos.z);
    // A staged shot can pull the camera back (e.g. a chase) so a pursuer
    // behind the car is between the camera and the car, not behind the lens.
    const back = g.shotCamBack || (9 + Math.abs(car.speed) * 0.08);
    // Slight lateral offset so a pursuer right behind the car stays in frame.
    const side = 2.2;
    const cx = car.pos.x - Math.sin(car.heading) * back + Math.cos(car.heading) * side;
    const cz = car.pos.z - Math.cos(car.heading) * back - Math.sin(car.heading) * side;
    const cy = 3.6 + Math.abs(car.speed) * 0.02;
    cam.position.lerp(new THREE.Vector3(cx, cy, cz), Math.min(1, 6 * dt));
    cam.lookAt(target);
  }
}

export function spawnPlayerCar(g) {
  const spot = { x: 0, z: 24 };
  const car = makeCar(g.scene, g.rng, 'player', spot.x, spot.z, 0);
  g.cars.push(car);
  return car;
}
