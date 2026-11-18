// Cars: a stylised box-built car mesh, traffic that follows the street grid,
// and police interceptors. Every car is { mesh, pos, heading, speed, kind, hp }.
import * as THREE from 'three';
import { CITY, CAR, PALETTE, VEHICLES } from './config.js';
import { clampToCity, nearestStreetCoord, resolveCollisions } from './city.js';
import { damagePlayer } from './player.js';

const bodyGeo = new THREE.BoxGeometry(1, 1, 1);
const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.35, 10);
const glassMat = new THREE.MeshStandardMaterial({ color: 0x10161f, roughness: 0.15, metalness: 0.6 });
const tyreMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95 });
const chromeMat = new THREE.MeshStandardMaterial({ color: 0xd8dee6, roughness: 0.25, metalness: 0.8 });

export function buildCarMesh(color, kind, variant) {
  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.45 });
  const body = new THREE.Mesh(bodyGeo, paint);
  if (variant === 'truck') {
    body.scale.set(2.1, 0.9, 4.8);
    body.position.y = 0.75;
  } else if (variant === 'sport') {
    body.scale.set(1.9, 0.5, 4.5);
    body.position.y = 0.55;
  } else {
    body.scale.set(2.0, 0.62, 4.4);
    body.position.y = 0.62;
  }
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(bodyGeo, glassMat);
  if (variant === 'truck') {
    cabin.scale.set(1.8, 0.7, 1.4);
    cabin.position.set(0, 1.5, 1.2);
    // Open bed.
    const bed = new THREE.Mesh(bodyGeo, paint);
    bed.scale.set(1.9, 0.3, 2.4);
    bed.position.set(0, 1.15, -1.2);
    group.add(bed);
  } else if (variant === 'sport') {
    cabin.scale.set(1.6, 0.45, 2.0);
    cabin.position.set(0, 1.0, -0.3);
    // Spoiler.
    const wing = new THREE.Mesh(bodyGeo, paint);
    wing.scale.set(1.7, 0.08, 0.4);
    wing.position.set(0, 1.05, -2.1);
    group.add(wing);
  } else {
    cabin.scale.set(1.7, 0.55, 2.1);
    cabin.position.set(0, 1.18, -0.25);
  }
  cabin.castShadow = true;
  group.add(cabin);
  const hood = new THREE.Mesh(bodyGeo, paint);
  hood.scale.set(1.9, 0.16, 1.0);
  hood.position.set(0, 0.98, 1.65);
  group.add(hood);
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const wheel = new THREE.Mesh(wheelGeo, tyreMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.42, wz);
    wheel.castShadow = true;
    group.add(wheel);
  }
  // Headlights and tail lights.
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6c9 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
  for (const sx of [-0.6, 0.6]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.1), lightMat);
    h.position.set(sx, 0.62, 2.21);
    group.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.1), tailMat);
    t.position.set(sx, 0.62, -2.21);
    group.add(t);
  }
  if (kind === 'police') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.22, 0.5), chromeMat);
    bar.position.set(0, 1.55, -0.25);
    group.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.24, 0.52), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    red.position.set(-0.28, 1.55, -0.25);
    red.name = 'siren-red';
    group.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.24, 0.52), new THREE.MeshBasicMaterial({ color: 0x2040ff }));
    blue.position.set(0.28, 1.55, -0.25);
    blue.name = 'siren-blue';
    group.add(blue);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 3.2), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    door.position.set(-1.01, 0.66, 0);
    group.add(door);
  }
  return group;
}

export function makeCar(scene, rng, kind, x, z, heading) {
  const color = kind === 'police' ? PALETTE.police : rng.pick(PALETTE.car);
  // Sedans are common, sports cars quick, trucks tough.
  let variant = 'sedan';
  if (kind === 'traffic') {
    const r = rng.next();
    variant = r < 0.6 ? 'sedan' : r < 0.82 ? 'sport' : 'truck';
  } else if (kind === 'police') {
    variant = 'sport';
  }
  const mesh = buildCarMesh(color, kind, variant);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  scene.add(mesh);
  const stats = VEHICLES[variant];
  return {
    mesh,
    kind,
    variant,
    variantLabel: stats.label,
    maxSpeed: kind === 'police' ? CAR.policeMaxSpeed : stats.maxSpeed,
    accel: stats.accel,
    pos: mesh.position,
    heading,
    speed: 0,
    hp: kind === 'police' ? CAR.policeHp : stats.hp,
    maxHp: kind === 'police' ? CAR.policeHp : stats.hp,
    driver: kind === 'traffic',
    steer: 0,
    stuck: 0,
    // Traffic route state.
    axis: rng.chance(0.5) ? 'x' : 'z',
    dir: rng.chance(0.5) ? 1 : -1,
    targetSpeed: CAR.trafficSpeed * rng.range(0.8, 1.15),
    sirenPhase: rng.next() * 10,
  };
}

function syncMesh(car) {
  car.mesh.position.set(car.pos.x, 0, car.pos.z);
  car.mesh.rotation.y = car.heading;
}

// Traffic: follow the street centrelines, turn or carry on at each junction,
// slow down for the car ahead.
export function updateTraffic(g, dt) {
  for (const car of g.cars) {
    if (car.kind !== 'traffic') continue;
    const lane = 3.2;
    const street = nearestStreetCoord(car.axis === 'x' ? car.pos.z : car.pos.x);
    // Steer back onto the lane centre: heading = axis direction, nudged by the
    // lateral offset so the car drifts back to its lane.
    const off = car.axis === 'x' ? car.pos.z - (street + lane * car.dir) : car.pos.x - (street + lane * car.dir);
    const wantHeading = car.axis === 'x' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.dir > 0 ? 0 : Math.PI);
    let dh = wantHeading - car.heading - Math.max(-0.35, Math.min(0.35, off * 0.06));
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    car.heading += Math.max(-2.4 * dt, Math.min(2.4 * dt, dh));
    // Junction: decide to turn or go straight.
    const along = car.axis === 'x' ? car.pos.x : car.pos.z;
    const nextJunction = nearestStreetCoord(along) + (car.dir > 0 ? CITY.pitch / 2 : -CITY.pitch / 2);
    const distJ = Math.abs(nextJunction - along);
    if (distJ < 2.5 && !car.turned) {
      car.turned = true;
      const r = g.rng.next();
      if (r < 0.45) {
        car.axis = car.axis === 'x' ? 'z' : 'x';
        car.dir = g.rng.chance(0.5) ? 1 : -1;
      } else if (r < 0.55) {
        car.dir *= -1;
      }
    }
    if (distJ > 10) car.turned = false;
    // Car ahead: slow down.
    let speed = car.targetSpeed;
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    for (const other of g.cars) {
      if (other === car) continue;
      const dx = other.pos.x - car.pos.x;
      const dz = other.pos.z - car.pos.z;
      const ahead = dx * fx + dz * fz;
      const side = Math.abs(dx * fz - dz * fx);
      if (ahead > 0 && ahead < 13 && side < 2.6) {
        speed = Math.min(speed, Math.max(0, (ahead - 7) * 0.8));
        break;
      }
    }
    car.speed += (speed - car.speed) * Math.min(1, 2.5 * dt);
    car.pos.x += Math.sin(car.heading) * car.speed * dt;
    car.pos.z += Math.cos(car.heading) * car.speed * dt;
    clampToCity(car.pos);
    resolveCollisions(g.city.colliders, car.pos, 2.2);
    syncMesh(car);
  }
}

// Player driving: arcade handling with steering that bites harder at low speed.
export function updatePlayerCar(g, dt, input) {
  const car = g.player.car;
  if (!car) return;
  const ax = input.axis();
  const target = ax.forward;
  if (target > 0) car.speed += car.accel * dt;
  else if (target < 0) {
    if (car.speed > 0.5) car.speed -= CAR.brake * dt;
    else car.speed -= CAR.reverseAccel * dt;
  } else {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 9 * dt);
  }
  car.speed = Math.max(-CAR.maxReverse, Math.min(car.maxSpeed, car.speed));
  const steerInput = ax.strafe;
  // Radius-based steering: the turn rate grows with speed but the turning
  // radius stays drivable in the city grid (about 14 units at a crawl,
  // about 28 at full speed). D (right) decreases heading: forward
  // (sin h, cos h) swings toward -x, the car's right when facing +z.
  // Reversing flips the turn.
  const radius = 10 + Math.abs(car.speed) * 0.45;
  car.heading -= steerInput * (car.speed / radius) * Math.sign(car.speed || 1) * dt;
  // Steering sign: reverse flips the turn.
  car.pos.x += Math.sin(car.heading) * car.speed * dt;
  car.pos.z += Math.cos(car.heading) * car.speed * dt;
  const hit = resolveCollisions(g.city.colliders, car.pos, 2.2);
  if (hit.hit) {
    if (Math.abs(car.speed) > 14) damagePlayer(g, 4);
    car.speed *= 0.55;
  }
  clampToCity(car.pos);
  // Hit a pedestrian?
  for (const ped of g.peds) {
    if (ped.dead) continue;
    const dx = ped.pos.x - car.pos.x;
    const dz = ped.pos.z - car.pos.z;
    if (dx * dx + dz * dz < 3.4 * 3.4 && Math.abs(car.speed) > 4) {
      killPed(g, ped, true);
      car.speed *= 0.85;
    }
  }
  syncMesh(car);
  g.player.pos.copy(car.pos);
}

export function killPed(g, ped, byCar) {
  if (ped.dead) return;
  ped.dead = true;
  ped.deadTimer = 0;
  ped.mesh.rotation.z = Math.PI / 2;
  ped.mesh.position.y = 0.35;
  g.stats.kills += 1;
  if (byCar || true) g.police.addCrime(1, 'pedestrian down');
  g.audio.thud();
}
