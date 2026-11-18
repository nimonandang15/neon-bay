// Screenshot scenes behind ?shot=cover|drive|chase|mission. Each one plays the
// real rules forward from a fresh world for a fixed number of steps with
// scripted inputs, so the frame is what a short game really looks like and
// the same seed always gives the same frame.
import { STEP } from './config.js';
import { updateTraffic, updatePlayerCar } from './cars.js';
import { updatePeds } from './peds.js';
import { updatePlayerOnFoot, updateCamera } from './player.js';
import { updatePolice } from './police.js';

const fakeDrive = {
  axis: () => ({ forward: 1, strafe: 0 }),
  takeDrag: () => ({ x: 0, y: 0 }),
  sprint: () => false,
};
const fakeWalk = {
  axis: () => ({ forward: 1, strafe: 0 }),
  takeDrag: () => ({ x: 0, y: 0 }),
  sprint: () => false,
};

// A scripted driver: segments of [seconds, forward, strafe] so a staged scene
// can brake, turn and accelerate like a real driver.
function scriptedInput(segments) {
  let elapsed = 0;
  let index = 0;
  let left = segments[0][0];
  return {
    axis() {
      const seg = segments[index];
      return { forward: seg[1], strafe: seg[2] };
    },
    takeDrag: () => ({ x: 0, y: 0 }),
    sprint: () => false,
    advance(dt) {
      elapsed += dt;
      left -= dt;
      if (left <= 0 && index < segments.length - 1) {
        index += 1;
        left = segments[index][0];
      }
    },
  };
}

function runSteps(g, seconds, drive, segments) {
  const input = segments ? scriptedInput(segments) : drive ? fakeDrive : fakeWalk;
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    g.time += STEP;
    if (input.advance) input.advance(STEP);
    if (g.player.onFoot) updatePlayerOnFoot(g, STEP, input);
    else updatePlayerCar(g, STEP, input);
    updateTraffic(g, STEP);
    updatePeds(g, STEP);
    updatePolice(g, STEP);
    g.missions.update(STEP);
    g.effects.update(STEP);
  }
  for (let i = 0; i < 8; i += 1) updateCamera(g, 1);
}

function putPlayerInCar(g, x, z, heading) {
  const car = g.player.car || g.cars.find((c) => c.kind === 'player');
  car.pos.set(x, 0, z);
  car.heading = heading;
  car.speed = 0;
  if (g.player.onFoot) {
    g.player.car = car;
    car.kind = 'player';
    g.player.onFoot = false;
    g.player.mesh.visible = false;
  }
  g.player.pos.copy(car.pos);
  g.player.heading = heading;
  g.player.camYaw = heading + Math.PI;
}

export function stageShot(g, name) {
  if (name === 'drive') {
    putPlayerInCar(g, 0, -120, 0);
    g.hud.setObjective('Free roam — Neon Bay is yours, Rook');
    runSteps(g, 7, true);
    return;
  }
  if (name === 'chase') {
    putPlayerInCar(g, 0, -160, 0);
    g.police.setStars(3);
    g.hud.setObjective('Lose the cops — survive 60 seconds at 3 stars');
    // Bring the interceptors into the frame: they spawn across the grid,
    // so stage them on the player's tail — from here the chase is real.
    updatePolice(g, 0.01);
    g.police.cars.forEach((c, i) => {
      c.pos.set(0, 0, -160 - 12 - i * 8);
      c.heading = 0;
      c.speed = 30;
      c.targetJunction = null; // recompute the route from the staged spot
    });
    // Pull the camera back so the interceptors sit between the lens and the
    // player car instead of behind the lens.
    g.shotCamBack = 26;
    // Get up to speed first, then run until a real interceptor is on the
    // tail (12–15 units — between the pulled-back camera and the player),
    // so the frame shows the chase instead of an empty road behind.
    runSteps(g, 3, true);
    let t = 0;
    while (t < 12) {
      runSteps(g, 0.25, true);
      t += 0.25;
      const close = g.police.cars.some((c) => {
        const d = Math.hypot(c.pos.x - g.player.pos.x, c.pos.z - g.player.pos.z);
        return d > 12 && d < 15;
      });
      if (close) break;
    }
    return;
  }
  if (name === 'mission') {
    const m = g.missions.list.find((q) => q.id === 'm2');
    g.missions.start(m);
    putPlayerInCar(g, -240, 150, 0);
    runSteps(g, 5, true);
    return;
  }
  // cover: on foot down the middle of Coral Avenue, traffic rolling past.
  g.player.pos.set(0, 0, 140);
  g.player.heading = Math.PI;
  g.player.camYaw = Math.PI;
  g.hud.setObjective('Press M to start your first job');
  runSteps(g, 4, false);
}
