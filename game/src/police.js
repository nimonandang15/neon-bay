// The wanted system: stars rise with every crime, Bay PD interceptors chase the
// player along the street grid, and officers on foot move in to make the arrest.
import { CITY, WANTED, CAR } from './config.js';
import { makeCar } from './cars.js';
import { makePed, randomSidewalkSpot } from './peds.js';
import { nearestStreetCoord, clampToCity, resolveCollisions } from './city.js';

export function createPolice(g) {
  return {
    stars: 0,
    lastCrimeAt: -999,
    decayTimer: 0,
    cars: [],
    officers: [],
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
    const ped = pol.officers.pop();
    g.scene.remove(ped.mesh);
    g.peds.splice(g.peds.indexOf(ped), 1);
  }

  const pp = g.player.pos;
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
        g.player.hp = Math.max(0, g.player.hp - 12);
        g.hud.flashDamage();
        g.audio.thud();
        const push = 9;
        g.player.pos.x += (dx / (dist || 1)) * -push * 0.3;
        g.player.pos.z += (dz / (dist || 1)) * -push * 0.3;
        if (g.player.hp <= 0) g.gameOver('wasted');
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
