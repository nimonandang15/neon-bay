// Pickups: health kits, body armor, weapon crates, the bribe marker and
// the 10 hidden packages — plus the taxi fares. All glow, bob and spin;
// walk close to collect. Health/armor/weapons respawn after a minute.
import * as THREE from 'three';
import { PICKUP_SPOTS, PACKAGE_SPOTS, WEAPONS } from './config.js';

const COLORS = {
  health: 0xffffff,
  armor: 0x3d7bff,
  weapon: 0xffe600,
  package: 0xff2e88,
  bribe: 0x2ecc71,
};

function makePickupMesh(type, weapon) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: COLORS[type] || 0xffffff, emissive: COLORS[type] || 0xffffff, emissiveIntensity: 0.55, roughness: 0.4 });
  if (type === 'health') {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), mat);
    box.castShadow = true;
    g.add(box);
    const red = new THREE.MeshStandardMaterial({ color: 0xe74c3c, emissive: 0xe74c3c, emissiveIntensity: 0.6 });
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.6, 0.06), red);
    v.position.z = 0.46;
    g.add(v);
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.22, 0.06), red);
    h.position.z = 0.46;
    g.add(h);
  } else if (type === 'armor') {
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.0, 0.35), mat);
    vest.castShadow = true;
    g.add(vest);
  } else if (type === 'weapon') {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.55, 0.6), mat);
    crate.castShadow = true;
    g.add(crate);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.9), new THREE.MeshStandardMaterial({ color: 0x1c2733, roughness: 0.4, metalness: 0.6 }));
    gun.position.y = 0.4;
    g.add(gun);
  } else if (type === 'bribe') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.15), mat);
    g.add(sign);
    const dollar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.2), new THREE.MeshStandardMaterial({ color: 0xffe600, emissive: 0xffe600, emissiveIntensity: 0.7 }));
    g.add(dollar);
  } else {
    // Hidden package: a small glowing parcel.
    const pack = new THREE.Mesh(new THREE.OctahedronGeometry(0.55), mat);
    pack.castShadow = true;
    g.add(pack);
  }
  // A ground ring so the pickup reads from a distance.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.9, 1.15, 24),
    new THREE.MeshBasicMaterial({ color: COLORS[type] || 0xffffff, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -0.9;
  g.add(ring);
  g.position.y = 1;
  g.userData.baseY = 1;
  return g;
}

export function createPickups(g) {
  const items = [];
  for (const spot of PICKUP_SPOTS) {
    const mesh = makePickupMesh(spot.type, spot.weapon);
    mesh.position.set(spot.x, 1, spot.z);
    g.scene.add(mesh);
    items.push({ ...spot, mesh, taken: false, respawnAt: 0 });
  }
  const packages = [];
  for (const spot of PACKAGE_SPOTS) {
    const mesh = makePickupMesh('package');
    mesh.position.set(spot.x, 1, spot.z);
    g.scene.add(mesh);
    packages.push({ ...spot, mesh, taken: false });
  }
  return {
    items,
    packages,
    collected: 0,
    taxi: null,
    update(dt) {
      const p = g.player;
      const t = g.time;
      for (const it of items) {
        if (it.taken) {
          if (it.respawnAt > 0 && t >= it.respawnAt) {
            it.taken = false;
            it.mesh.visible = true;
          }
          continue;
        }
        it.mesh.rotation.y += dt * 1.6;
        it.mesh.position.y = it.mesh.userData.baseY + Math.sin(t * 2 + it.x) * 0.18;
        if (!p.onFoot) continue;
        const d = Math.hypot(p.pos.x - it.x, p.pos.z - it.z);
        if (d > 2.4) continue;
        if (it.type === 'health') {
          if (p.hp >= 100) continue;
          p.hp = Math.min(100, p.hp + 40);
          g.hud.toast(`First aid +40 health (now ${Math.round(p.hp)})`);
          g.audio.blip();
          it.taken = true;
          it.mesh.visible = false;
          it.respawnAt = t + 60;
        } else if (it.type === 'armor') {
          if (p.armor >= 100) continue;
          p.armor = Math.min(100, p.armor + 50);
          g.hud.toast(`Body armor +50 (now ${Math.round(p.armor)})`);
          g.audio.blip();
          it.taken = true;
          it.mesh.visible = false;
          it.respawnAt = t + 60;
        } else if (it.type === 'weapon') {
          g.weapons.give(it.weapon);
          g.audio.blip();
          it.taken = true;
          it.mesh.visible = false;
          it.respawnAt = t + 90;
        } else if (it.type === 'bribe') {
          if (g.police.stars === 0) {
            g.hud.toast('No heat to buy off — stay clean, Rook');
            continue;
          }
          if (p.cash < 200) {
            g.hud.toast('Bribe costs $200 — you are short');
            continue;
          }
          p.cash -= 200;
          g.hud.setCash(p.cash);
          g.police.setStars(g.police.stars - 1);
          g.hud.toast(`Bribe paid — heat down to ${g.police.stars} star${g.police.stars === 1 ? '' : 's'}`);
          g.audio.blip();
          it.taken = true;
          it.mesh.visible = false;
          it.respawnAt = t + 120;
        }
      }
      for (const pk of packages) {
        if (pk.taken) continue;
        pk.mesh.rotation.y += dt * 2;
        pk.mesh.position.y = pk.mesh.userData.baseY + Math.sin(t * 2.4 + pk.x) * 0.18;
        if (!p.onFoot) continue;
        const d = Math.hypot(p.pos.x - pk.x, p.pos.z - pk.z);
        if (d > 2.4) continue;
        pk.taken = true;
        pk.mesh.visible = false;
        this.collected += 1;
        p.cash += 100;
        g.stats.cashEarned += 100;
        g.hud.setCash(p.cash);
        g.hud.setPackages(this.collected, PACKAGE_SPOTS.length);
        g.hud.toast(`Hidden package ${this.collected}/${PACKAGE_SPOTS.length} — +$100`);
        g.audio.blip();
      }
      this.updateTaxi(dt);
    },
    // Taxi: a passenger waits at a corner; drive up and press T, then
    // take them to the yellow marker for a fare.
    spawnTaxi() {
      const spots = [
        { x: 0, z: 160 }, { x: 160, z: 0 }, { x: -160, z: 80 }, { x: 80, z: -160 },
        { x: -80, z: -80 }, { x: 240, z: 80 }, { x: -240, z: -80 },
      ];
      const a = spots[Math.floor(g.rng.next() * spots.length)];
      let b = spots[Math.floor(g.rng.next() * spots.length)];
      while (b === a) b = spots[Math.floor(g.rng.next() * spots.length)];
      // A visible passenger with a yellow marker ring.
      const mesh = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.62, 0.32),
        new THREE.MeshStandardMaterial({ color: 0xffe600, roughness: 0.9 }),
      );
      body.position.y = 1.1;
      mesh.add(body);
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.24, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0xf1c27d, roughness: 0.8 }),
      );
      head.position.y = 1.62;
      mesh.add(head);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.9, 1.2, 24),
        new THREE.MeshBasicMaterial({ color: 0xffe600, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.15;
      mesh.add(ring);
      mesh.position.set(a.x, 0, a.z);
      g.scene.add(mesh);
      // Destination marker (hidden until the passenger is riding).
      const dest = new THREE.Group();
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(1.6, 1.6, 50, 12, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xffe600, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
      );
      beam.position.y = 25;
      dest.add(beam);
      const dring = new THREE.Mesh(
        new THREE.RingGeometry(3, 4.4, 32),
        new THREE.MeshBasicMaterial({ color: 0xffe600, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
      );
      dring.rotation.x = -Math.PI / 2;
      dring.position.y = 0.15;
      dest.add(dring);
      dest.position.set(b.x, 0, b.z);
      dest.visible = false;
      g.scene.add(dest);
      this.taxi = { waiting: { x: a.x, z: a.z }, dest: { x: b.x, z: b.z }, riding: false, mesh, destMarker: dest };
      return this.taxi;
    },
    pickupTaxi() {
      const tx = this.taxi;
      if (!tx || tx.riding || !g.player.car) return false;
      const d = Math.hypot(g.player.pos.x - tx.waiting.x, g.player.pos.z - tx.waiting.z);
      if (d > 9) return false;
      tx.riding = true;
      tx.mesh.visible = false;
      tx.destMarker.visible = true;
      g.hud.toast('Passenger aboard — follow the yellow marker');
      g.audio.blip();
      return true;
    },
    updateTaxi(dt) {
      const tx = this.taxi;
      if (!tx) return;
      const p = g.player;
      if (!tx.riding) {
        const d = Math.hypot(p.pos.x - tx.waiting.x, p.pos.z - tx.waiting.z);
        if (p.car && d < 9) g.hud.setTaxiHint('Passenger waiting — press T to pick up');
        else g.hud.setTaxiHint('');
      } else {
        const d = Math.hypot(p.pos.x - tx.dest.x, p.pos.z - tx.dest.z);
        g.hud.setTaxiHint(`Taxi fare — ${Math.round(d)}m to the marker`);
        if (d < 11) {
          const fare = 90;
          p.cash += fare;
          g.stats.cashEarned += fare;
          g.hud.setCash(p.cash);
          g.hud.toast(`Fare complete — +$${fare}`);
          g.audio.missionComplete();
          g.hud.setTaxiHint('');
          g.scene.remove(tx.destMarker);
          this.taxi = this.spawnTaxi();
        }
      }
    },
  };
}
