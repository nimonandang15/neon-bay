// The wanted system: stars rise with every crime, Bay PD interceptors chase the
// player along the street grid, and officers on foot move in to make the arrest.
import * as THREE from 'three';
import { CITY, WANTED, CAR } from './config.js';
import { makeCar } from './cars.js';
import { makePed, randomSidewalkSpot } from './peds.js';
import { nearestStreetCoord, clampToCity, resolveCollisions } from './city.js';
import { damagePlayer } from './player.js';

const CALLSIGNS = ['IRIS', 'TARPON', 'KESTREL', 'MARLIN', 'GULL', 'SNAPPER', 'ORCA', 'HERON'];
function newCallsign(rng) {
  return `${CALLSIGNS[Math.floor(rng.next() * CALLSIGNS.length)]}-${10 + Math.floor(rng.next() * 89)}`;
}

// Police helicopter: a simple circling air unit with a searchlight cone and
// a pool of light on the ground. No collision, no shooting — presence only.
function buildHeli(scene) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1c2733, roughness: 0.5, metalness: 0.4 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.4, 5.2), bodyMat);
  group.add(body);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 4.5), bodyMat);
  tail.position.set(0, 0.3, -4.2);
  group.add(tail);
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 0.9, 1.6),
    new THREE.MeshStandardMaterial({ color: 0x10161f, roughness: 0.15, metalness: 0.6 }),
  );
  glass.position.set(0, 0.2, 2.2);
  group.add(glass);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.08, 0.5), new THREE.MeshStandardMaterial({ color: 0x222831 }));
  rotor.position.y = 1.1;
  group.add(rotor);
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(9, 38, 20, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff6c9, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false }),
  );
  cone.position.y = -19;
  group.add(cone);
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(9, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff6c9, transparent: true, opacity: 0.18, depthWrite: false }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.12;
  scene.add(disc);
  group.userData = { rotor, disc };
  return group;
}

export function createPolice(g) {
  return {
    stars: 0,
    lastCrimeAt: -999,
    decayTimer: 0,
    cars: [],
    officers: [],
    roadblock: [],
    heli: null,
    addCrime(n, why) {
      const before = this.stars;
      this.stars = Math.min(WANTED.maxStars, this.stars + n);
      this.lastCrimeAt = g.time;
      this.decayTimer = 0;
      if (this.stars > before) {
        g.hud.setStars(this.stars);
        g.hud.toast(`WANTED — ${this.stars} star${this.stars > 1 ? 's' : ''} (${why})`);
        g.audio.sirenBlip();
      }
      return this.stars;
    },
    setStars(n) {
      this.stars = Math.max(0, Math.min(WANTED.maxStars, n));
      this.lastCrimeAt = g.time;
      g.hud.setStars(this.stars);
    },
  };
}

function spawnPoliceCar(g) {
  const p = g.player.pos;
  const angle = g.rng.range(0, Math.PI * 2);
  const x = p.x + Math.cos(angle) * 60;
  const z = p.z + Math.sin(angle) * 60;
  const car = makeCar(g.scene, g.rng, 'police', x, z, 0);
  car.callsign = newCallsign(g.rng);
  car.targetJunction = null;
  g.cars.push(car);
  g.police.cars.push(car);
  return car;
}

function spawnOfficer(g) {
  const spot = randomSidewalkSpot(g.rng);
  // Officers arrive close to the action, not across the map.
  const p = g.player.pos;
  const x = Math.max(-CITY.bounds, Math.min(CITY.bounds, p.x + g.rng.range(-24, 24)));
  const z = Math.max(-CITY.bounds, Math.min(CITY.bounds, p.z + g.rng.range(-24, 24)));
  const ped = makePed(g.scene, g.rng, 'officer', x, z);
  ped.callsign = `OFFICER-${10 + Math.floor(g.rng.next() * 89)}`;
  g.peds.push(ped);
  g.police.officers.push(ped);
  return ped;
}

// Grid pursuit: drive to the junction nearest the player, then the next one
// along the Manhattan route, ramming straight at the player when close.
export function updatePolice(g, dt) {
  const pol = g.police;
  // Decay: stars fall when the player stays clean and out of sight.
  if (pol.stars > 0 && g.time - pol.lastCrimeAt > WANTED.decayDelay) {
    pol.decayTimer += dt;
    if (pol.decayTimer >= WANTED.decayInterval) {
      pol.decayTimer = 0;
      pol.stars -= 1;
      g.hud.setStars(pol.stars);
      if (pol.stars === 0) g.hud.toast('You lost the heat. For now.');
    }
  }
  // Keep the force matched to the stars.
  const wantCars = Math.min(WANTED.maxPoliceCars, pol.stars * WANTED.policeCarPerStar);
  while (pol.cars.length < wantCars) spawnPoliceCar(g);
  const wantOfficers = pol.stars >= WANTED.officerAtStars && !g.player.car
    ? Math.min(WANTED.maxOfficers, pol.stars - 1)
    : 0;
  while (pol.officers.length < wantOfficers) spawnOfficer(g);
  // Despawn the surplus when the heat drops.
  while (pol.cars.length > wantCars) {
    const car = pol.cars.pop();
    g.scene.remove(car.mesh);
    g.cars.splice(g.cars.indexOf(car), 1);
  }
  while (pol.officers.length > wantOfficers) {
    // Mission protect officers (m6) stay until the job ends.
    const idx = pol.officers.findIndex((o) => !o.protect);
    if (idx < 0) break;
    const ped = pol.officers.splice(idx, 1)[0];
    g.scene.remove(ped.mesh);
    g.peds.splice(g.peds.indexOf(ped), 1);
  }

  // Roadblocks at 4-5 stars: two interceptors parked across the street
  // ahead of the player. They vanish when the heat drops.
  const pp = g.player.pos;
  const wantBlock = pol.stars >= 4 ? 2 : 0;
  if (pol.roadblock.length < wantBlock) {
    const ahead = g.player.car ? g.player.car.heading : g.player.heading;
    const bx = pp.x + Math.sin(ahead) * 70;
    const bz = pp.z + Math.cos(ahead) * 70;
    const car = makeCar(g.scene, g.rng, 'police', nearestStreetCoord(bx), nearestStreetCoord(bz), ahead + Math.PI / 2);
    car.callsign = newCallsign(g.rng);
    car.targetSpeed = 0;
    car.speed = 0;
    car.roadblock = true;
    g.cars.push(car);
    pol.roadblock.push(car);
    if (pol.roadblock.length === 1) g.hud.toast('Roadblock ahead — the PD sealed the street');
  }
  while (pol.roadblock.length > wantBlock) {
    const car = pol.roadblock.pop();
    g.scene.remove(car.mesh);
    g.cars.splice(g.cars.indexOf(car), 1);
  }
  // Roadblock cars sit still; keep them out of the pursuit loop.
  for (const car of pol.roadblock) {
    car.speed = 0;
    car.mesh.position.set(car.pos.x, 0, car.pos.z);
    car.mesh.rotation.y = car.heading;
  }
  // Helicopter at 4-5 stars: circles the player with a searchlight.
  if (pol.stars >= 4 && !pol.heli) {
    pol.heli = buildHeli(g.scene);
    g.scene.add(pol.heli);
    g.hud.toast('Bay PD helicopter overhead — stay out of the spotlight');
    g.hud.showDialogue('BAY PD DISPATCH', 'RADIO', 'Air One has the spotlight on Rook. All units, close the net.', '#3d7bff', 7000);
  }
  if (pol.stars < 4 && pol.heli) {
    g.scene.remove(pol.heli);
    g.scene.remove(pol.heli.userData.disc);
    pol.heli = null;
  }
  if (pol.heli) {
    const t = g.time * 0.5;
    pol.heli.position.set(pp.x + Math.sin(t) * 26, 38, pp.z + Math.cos(t) * 26);
    pol.heli.rotation.y = Math.atan2(pp.x - pol.heli.position.x, pp.z - pol.heli.position.z);
    pol.heli.userData.rotor.rotation.y += dt * 22;
    pol.heli.userData.disc.position.set(pp.x, 0.12, pp.z);
  }

  for (const car of pol.cars) {
    const dx = pp.x - car.pos.x;
    const dz = pp.z - car.pos.z;
    const dist = Math.hypot(dx, dz);
    car.ramCd = Math.max(0, (car.ramCd || 0) - dt);
    if (dist < 12) {
      // Ram: steer straight at the player.
      const want = Math.atan2(dx, dz);
      let dh = want - car.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      car.heading += Math.max(-3.2 * dt, Math.min(3.2 * dt, dh));
      car.speed = Math.min(CAR.policeMaxSpeed, car.speed + 26 * dt);
    } else {
      // Grid route: retarget every frame so the car chases the player's
      // current position, not a junction it already reached. On the same
      // junction as the player it drives straight at the player; otherwise
      // it takes the next junction toward the player's junction.
      const pjx = nearestStreetCoord(pp.x);
      const pjz = nearestStreetCoord(pp.z);
      const cx = nearestStreetCoord(car.pos.x);
      const cz = nearestStreetCoord(car.pos.z);
      if (cx === pjx && cz === pjz) {
        car.targetJunction = { x: pp.x, z: pp.z };
      } else if (Math.abs(pjx - cx) > Math.abs(pjz - cz)) {
        car.targetJunction = { x: cx + Math.sign(pjx - cx) * CITY.pitch, z: cz };
      } else {
        car.targetJunction = { x: cx, z: cz + Math.sign(pjz - cz) * CITY.pitch };
      }
      const tx = car.targetJunction.x - car.pos.x;
      const tz = car.targetJunction.z - car.pos.z;
      const want = Math.atan2(tx, tz);
      let dh = want - car.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      car.heading += Math.max(-2.6 * dt, Math.min(2.6 * dt, dh));
      car.speed = Math.min(CAR.policeMaxSpeed, car.speed + 18 * dt);
    }
    car.pos.x += Math.sin(car.heading) * car.speed * dt;
    car.pos.z += Math.cos(car.heading) * car.speed * dt;
    const hit = resolveCollisions(g.city.colliders, car.pos, 2.2);
    if (hit.hit) car.speed *= 0.6;
    clampToCity(car.pos);
    // Ram the player. A cooldown per car keeps three interceptors from
    // stun-locking the player to death in seconds.
    if (g.player.onFoot) {
      if (dist < 2.6 && Math.abs(car.speed) > 3 && car.ramCd <= 0) {
        car.ramCd = 2.5;
        damagePlayer(g, 12);
        const push = 9;
        g.player.pos.x += (dx / (dist || 1)) * -push * 0.3;
        g.player.pos.z += (dz / (dist || 1)) * -push * 0.3;
      }
    } else if (g.player.car) {
      const pc = g.player.car;
      const cdx = pc.pos.x - car.pos.x;
      const cdz = pc.pos.z - car.pos.z;
      const cd = Math.hypot(cdx, cdz);
      if (cd < 4.4 && Math.abs(car.speed) > 4 && car.ramCd <= 0) {
        car.ramCd = 2;
        pc.hp -= 8;
        car.speed *= 0.5;
        pc.speed *= 0.95;
        g.hud.flashDamage();
        g.audio.thud();
        if (pc.hp <= 0) {
          g.hud.toast('Your ride is wrecked!');
          g.ejectPlayer();
        }
      }
    }
    car.mesh.position.set(car.pos.x, 0, car.pos.z);
    car.mesh.rotation.y = car.heading;
    // Flashing light bar.
    car.sirenPhase += dt * 7;
    const red = car.mesh.getObjectByName('siren-red');
    const blue = car.mesh.getObjectByName('siren-blue');
    const on = Math.sin(car.sirenPhase) > 0;
    if (red) red.visible = on;
    if (blue) blue.visible = !on;
  }
  // Officers are peds; their chase runs in updatePeds. Drop dead ones.
  pol.officers = pol.officers.filter((o) => !o.dead);
}
