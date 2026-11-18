// Missions: three story jobs from fixer Marla Voss, with objectives, a timer,
// a 3D beacon and a minimap blip. Completing one pays cash and unlocks the next.
import * as THREE from 'three';
import { MISSIONS } from './config.js';

export function createMissions(g) {
  const beacon = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 60, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xff2e88, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 30;
  beacon.add(beam);
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.6),
    new THREE.MeshBasicMaterial({ color: 0xffe600 }),
  );
  diamond.position.y = 7;
  beacon.add(diamond);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(3, 4.4, 32),
    new THREE.MeshBasicMaterial({ color: 0xff2e88, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  beacon.add(ring);
  beacon.visible = false;
  g.scene.add(beacon);

  return {
    list: MISSIONS,
    completed: new Set(),
    current: null,
    stepIndex: 0,
    timer: 0,
    beacon,
    diamond,
    available() {
      for (const m of MISSIONS) {
        if (!this.completed.has(m.id)) return m;
      }
      return null;
    },
    start(mission) {
      this.current = mission;
      this.stepIndex = 0;
      this.timer = 0;
      g.hud.showMissionCard(mission);
      g.hud.setObjective(this.currentStep().text);
      g.audio.missionStart();
      if (mission.id === 'm3') g.police.setStars(3);
      this.updateBeacon();
    },
    currentStep() {
      return this.current ? this.current.steps[this.stepIndex] : null;
    },
    advance() {
      this.stepIndex += 1;
      if (this.stepIndex >= this.current.steps.length) {
        this.complete();
        return;
      }
      const step = this.currentStep();
      if (step.time) this.timer = step.time;
      g.hud.setObjective(step.text);
      g.audio.blip();
      this.updateBeacon();
    },
    complete() {
      const m = this.current;
      this.completed.add(m.id);
      g.player.cash += m.reward;
      g.hud.setCash(g.player.cash);
      g.hud.showBanner(`JOB DONE — ${m.title}`, `+$${m.reward} from ${m.giver}`);
      g.audio.missionComplete();
      g.saveGame();
      this.current = null;
      this.beacon.visible = false;
      g.hud.setObjective(this.available() ? 'Press M to start the next job' : 'All jobs done — Neon Bay is yours, Rook');
    },
    fail(reason) {
      if (!this.current) return;
      g.hud.showBanner('JOB FAILED', reason);
      g.audio.missionFail();
      this.current = null;
      this.beacon.visible = false;
      g.hud.setObjective(this.available() ? 'Press M to retry the job' : 'All jobs done — Neon Bay is yours, Rook');
    },
    updateBeacon() {
      const step = this.currentStep();
      if (!step || !step.target) {
        this.beacon.visible = false;
        return;
      }
      this.beacon.visible = true;
      this.beacon.position.set(step.target.x, 0, step.target.z);
    },
    onEnterCar() {
      const step = this.currentStep();
      if (this.current && step && step.type === 'steal') this.advance();
    },
    onPickup() {
      const step = this.currentStep();
      if (this.current && step && step.type === 'goto') this.advance();
    },
    update(dt) {
      if (!this.current) return;
      const step = this.currentStep();
      if (!step) return;
      this.diamond.rotation.y += dt * 2;
      this.diamond.position.y = 7 + Math.sin(g.time * 2.4) * 0.8;
      if (step.type === 'deliver' || step.type === 'survive') {
        this.timer -= dt;
        g.hud.setTimer(this.timer);
        if (this.timer <= 0) {
          if (step.type === 'survive') this.complete();
          else this.fail('Out of time — the client walked away.');
          return;
        }
      }
      if (step.type === 'goto' || step.type === 'deliver') {
        const d = Math.hypot(g.player.pos.x - step.target.x, g.player.pos.z - step.target.z);
        g.hud.setDistance(d);
        if (d < step.radius) {
          if (step.type === 'goto' && this.current.id === 'm2' && this.stepIndex === 0) {
            g.hud.toast('Package secured. Now move!');
            this.advance();
          } else {
            this.advance();
          }
        }
      }
      if (step.type === 'survive') {
        if (g.police.stars < step.stars && this.timer > 0) {
          // Heat dropped early: the crew counts it.
          this.complete();
        }
      }
    },
  };
}
