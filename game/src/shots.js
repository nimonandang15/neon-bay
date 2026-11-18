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
    if (g.updateDayNight) g.updateDayNight(STEP);
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
    // On foot with the SMG out, 3 stars, armor on, officers closing in —
    // the weapon panel and armor bar are the point of this frame.
    g.player.pos.set(0, 0, 140);
    g.player.heading = Math.PI;
    g.player.camYaw = Math.PI;
    g.weapons.give('smg', true);
    g.player.armor = 60;
    g.player.hp = 75;
    g.police.setStars(3);
    g.hud.setObjective('Lose the cops — survive 60 seconds at 3 stars');
    runSteps(g, 3, false);
    updateCamera(g, 1);
    g.combat.shoot(); // one tracer + muzzle flash in the frame
    return;
  }
  if (name === 'mission') {
    // The Informant (m4): rifle out, the red-marked target down the avenue.
    const m = g.missions.list.find((q) => q.id === 'm4');
    g.missions.start(m);
    // The briefing card covers the frame in a still — hide it for the shot.
    document.getElementById('mission-card').classList.remove('show');
    g.weapons.give('rifle', true);
    g.player.pos.set(-240, 0, -80);
    g.player.heading = Math.PI;
    g.player.camYaw = Math.PI;
    runSteps(g, 2, false);
    updateCamera(g, 1);
    g.combat.shoot(); // a round downrange at the target
    return;
  }
  if (name === 'night') {
    // After dark: driving with the headlights on.
    g.dayT = 0.78;
    g.updateDayNight(0);
    putPlayerInCar(g, 0, -120, 0);
    g.hud.setObjective('Free roam — Neon Bay after dark');
    runSteps(g, 5, true);
    return;
  }
  if (name === 'shop') {
    // At the shop counter with the buy menu open.
    g.player.pos.set(40, 0, 104);
    g.player.heading = 0;
    g.player.camYaw = 0;
    g.player.cash = 450;
    g.hud.setCash(450);
    runSteps(g, 1, false);
    updateCamera(g, 1);
    g.openShop();
    return;
  }
  // cover: on foot down the middle of Coral Avenue, traffic rolling past.
  g.player.pos.set(0, 0, 140);
  g.player.heading = Math.PI;
  g.player.camYaw = Math.PI;
  g.hud.setObjective('Press M to start your first job');
  runSteps(g, 4, false);
}
