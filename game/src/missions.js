// Missions: six story jobs from fixer Marla Voss, with objectives, a timer,
// a 3D beacon and a minimap blip. Completing one pays cash and unlocks the next.
import * as THREE from 'three';
import { MISSIONS } from './config.js';
import { makePed } from './peds.js';

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
    targetPed: null,
    targetRing: null,
    vicPed: null,
    vicHp: 100,
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
      g.hud.showDialogue(mission.giver, 'FIXER', mission.line, '#ff2e88', 8000);
      g.hud.setObjective(this.currentStep().text);
      g.audio.missionStart();
      // Timed first steps (m3 survive, m5 escape) need the clock now;
      // advance() only sets it for later steps.
      if (this.currentStep().time) this.timer = this.currentStep().time;
      if (mission.id === 'm3') g.police.setStars(3);
      if (mission.id === 'm5') g.police.setStars(3);
      if (mission.id === 'm4') {
        // The informant: a marked ped in Old Town.
        const t = mission.steps[0].target;
        const ped = makePed(g.scene, g.rng, 'target', t.x, t.z);
        ped.mesh.traverse((o) => { if (o.material) o.material = o.material.clone(); });
        g.peds.push(ped);
        this.targetPed = ped;
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(1.1, 1.5, 24),
          new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.12;
        ped.mesh.add(ring);
        this.targetRing = ring;
        this.timer = mission.steps[0].time;
      }
      if (mission.id === 'm6') {
        // Vic holds the Skyline Bar door; three officers come for him.
        const t = mission.steps[0].target;
        const vic = makePed(g.scene, g.rng, 'walk', t.x, t.z);
        vic.mesh.traverse((o) => { if (o.material) o.material = o.material.clone(); });
        g.peds.push(vic);
        this.vicPed = vic;
        this.vicHp = 100;
        this.timer = mission.steps[0].time;
        for (let i = 0; i < 3; i += 1) {
          const off = makePed(g.scene, g.rng, 'officer', t.x + (i - 1) * 8, t.z + 14);
          off.protect = true;
          g.peds.push(off);
          g.police.officers.push(off);
        }
        g.hud.toast('Vic is marked — keep him alive!');
      }
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
      g.stats.cashEarned += m.reward;
      g.hud.setCash(g.player.cash);
      g.hud.showBanner(`JOB DONE — ${m.title}`, `+$${m.reward} from ${m.giver}`);
      g.hud.showDialogue(m.giver, 'FIXER', m.doneLine, '#2ecc71', 8000);
      g.audio.missionComplete();
      g.saveGame();
      this.cleanupActors();
      this.current = null;
      this.beacon.visible = false;
      g.hud.setObjective(this.available() ? 'Press M to start the next job' : 'All jobs done — Neon Bay is yours, Rook');
    },
    fail(reason) {
      if (!this.current) return;
      g.hud.showBanner('JOB FAILED', reason);
      g.audio.missionFail();
      this.cleanupActors();
      this.current = null;
      this.beacon.visible = false;
      g.hud.setObjective(this.available() ? 'Press M to retry the job' : 'All jobs done — Neon Bay is yours, Rook');
    },
    cleanupActors() {
      // Remove any mission peds (target, Vic, protect officers), dead or alive.
      if (this.targetPed) {
        g.scene.remove(this.targetPed.mesh);
        const i = g.peds.indexOf(this.targetPed);
        if (i >= 0) g.peds.splice(i, 1);
      }
      if (this.vicPed) {
        g.scene.remove(this.vicPed.mesh);
        const i = g.peds.indexOf(this.vicPed);
        if (i >= 0) g.peds.splice(i, 1);
      }
      for (const ped of g.peds.filter((q) => q.protect)) {
        g.scene.remove(ped.mesh);
        g.peds.splice(g.peds.indexOf(ped), 1);
        const oi = g.police.officers.indexOf(ped);
        if (oi >= 0) g.police.officers.splice(oi, 1);
      }
      this.targetPed = null;
      this.targetRing = null;
      this.vicPed = null;
    },
    onTargetDown(ped) {
      if (this.current && this.current.id === 'm4' && ped === this.targetPed) {
        this.advance();
      }
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
      if (step.type === 'deliver' || step.type === 'survive' || step.type === 'takedown' || step.type === 'escape' || step.type === 'protect') {
        this.timer -= dt;
        g.hud.setTimer(this.timer);
        if (this.timer <= 0) {
          if (step.type === 'survive' || step.type === 'protect') this.complete();
          else if (step.type === 'takedown') this.fail('The informant slipped away.');
          else this.fail('Out of time — the client walked away.');
          return;
        }
      }
      if (step.type === 'protect') {
        if (this.vicPed) {
          if (this.vicPed.dead || this.vicHp <= 0) {
            this.fail('Vic went down — the job is blown.');
            return;
          }
          g.hud.setObjective(`Keep Vic alive — Vic ${Math.round(this.vicHp)} HP`);
        }
        return;
      }
      if (step.type === 'takedown') {
        if (this.targetPed && !this.targetPed.dead) {
          const d = Math.hypot(g.player.pos.x - this.targetPed.pos.x, g.player.pos.z - this.targetPed.pos.z);
          g.hud.setDistance(d);
        }
        return;
      }
      if (step.type === 'goto' || step.type === 'deliver' || step.type === 'escape') {
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
