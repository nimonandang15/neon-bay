// Neon Bay itself: a sun-soaked grid city built from a seeded random.
// Ground is one big canvas texture (asphalt, lane lines, crosswalks, sidewalks,
// parks and plazas); buildings are boxes with canvas facades and neon signs.
import * as THREE from 'three';
import { CITY, PALETTE } from './config.js';

function makeGroundTexture(rng) {
  const S = 1024;
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const ctx = cv.getContext('2d');
  const world = CITY.bounds * 2 + 80;
  const scale = S / world;
  const toPx = (v) => (v + world / 2) * scale;

  ctx.fillStyle = '#5d6b7a';
  ctx.fillRect(0, 0, S, S);
  // Blocks: plazas, parks and rooftops between the streets. True block
  // centres sit halfway between street centrelines (pitch/2 offset).
  for (let bx = -CITY.halfBlocks - 1; bx <= CITY.halfBlocks; bx += 1) {
    for (let bz = -CITY.halfBlocks - 1; bz <= CITY.halfBlocks; bz += 1) {
      const x = toPx(bx * CITY.pitch + CITY.pitch / 2 - CITY.block / 2);
      const z = toPx(bz * CITY.pitch + CITY.pitch / 2 - CITY.block / 2);
      const w = CITY.block * scale;
      const roll = rng.next();
      if (roll < 0.16) {
        ctx.fillStyle = '#5f9e6a'; // park
        ctx.fillRect(x, z, w, w);
        ctx.fillStyle = '#4c8a58';
        for (let i = 0; i < 5; i += 1) {
          ctx.beginPath();
          ctx.arc(x + rng.range(8, w - 8), z + rng.range(8, w - 8), rng.range(5, 11), 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (roll < 0.26) {
        ctx.fillStyle = '#c9b18a'; // sandy plaza
        ctx.fillRect(x, z, w, w);
        ctx.strokeStyle = '#b39a72';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 6, z + 6, w - 12, w - 12);
      } else {
        ctx.fillStyle = '#7e8694'; // sidewalk slab
        ctx.fillRect(x, z, w, w);
        ctx.strokeStyle = '#6c7482';
        ctx.lineWidth = 1;
        for (let i = 1; i < 4; i += 1) {
          ctx.beginPath();
          ctx.moveTo(x + (w / 4) * i, z);
          ctx.lineTo(x + (w / 4) * i, z + w);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x, z + (w / 4) * i);
          ctx.lineTo(x + w, z + (w / 4) * i);
          ctx.stroke();
        }
      }
    }
  }
  // Streets.
  ctx.fillStyle = '#33383f';
  for (let i = -CITY.halfBlocks; i <= CITY.halfBlocks; i += 1) {
    const c = toPx(i * CITY.pitch);
    const w = CITY.road * scale;
    ctx.fillRect(c - w / 2, 0, w, S);
    ctx.fillRect(0, c - w / 2, S, w);
  }
  // Centre dashes and crosswalks.
  ctx.fillStyle = '#f5d76e';
  for (let i = -CITY.halfBlocks; i <= CITY.halfBlocks; i += 1) {
    const c = toPx(i * CITY.pitch);
    for (let d = -CITY.bounds; d < CITY.bounds; d += 16) {
      const p = toPx(d);
      if (Math.abs(d - i * CITY.pitch) < CITY.pitch / 2 - 6) {
        ctx.fillRect(p - 3, c - 1.5, 6, 3);
        ctx.fillRect(c - 1.5, p - 3, 3, 6);
      }
    }
    for (let j = -CITY.halfBlocks; j <= CITY.halfBlocks; j += 1) {
      const cc = toPx(j * CITY.pitch);
      ctx.fillStyle = '#e8e8e8';
      for (let s = -3; s <= 3; s += 1) {
        ctx.fillRect(cc + s * 3.4 - 1, c - CITY.road / 2 * scale + 2, 2, 5);
        ctx.fillRect(cc + s * 3.4 - 1, c + CITY.road / 2 * scale - 7, 2, 5);
        ctx.fillRect(c - CITY.road / 2 * scale + 2, cc + s * 3.4 - 1, 5, 2);
        ctx.fillRect(c + CITY.road / 2 * scale - 7, cc + s * 3.4 - 1, 5, 2);
      }
      ctx.fillStyle = '#f5d76e';
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function makeFacadeTexture(rng, base, litRatio) {
  const W = 128;
  const H = 256;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');
  const hex = `#${base.toString(16).padStart(6, '0')}`;
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(0, 0, W, 10);
  const cols = 5;
  const rows = 12;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x = 10 + c * 22;
      const y = 18 + r * 19;
      const lit = rng.next() < litRatio;
      ctx.fillStyle = lit ? (rng.next() < 0.5 ? '#ffe9a8' : '#9fe8ff') : 'rgba(10,14,24,0.55)';
      ctx.fillRect(x, y, 14, 11);
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createCity(scene, rng) {
  const colliders = [];
  const group = new THREE.Group();
  group.name = 'city';

  // Sun, sky, fog.
  const sun = new THREE.DirectionalLight(PALETTE.sun, 2.6);
  sun.position.set(180, 260, 120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -380;
  sun.shadow.camera.right = 380;
  sun.shadow.camera.top = 380;
  sun.shadow.camera.bottom = -380;
  sun.shadow.camera.far = 800;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbcd8ff, 0x3d4a3a, 1.1));
  scene.fog = new THREE.Fog(PALETTE.fog, 260, 720);
  scene.background = new THREE.Color(PALETTE.sky);

  // Ground.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.bounds * 2 + 80, CITY.bounds * 2 + 80),
    new THREE.MeshStandardMaterial({ map: makeGroundTexture(rng), roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // Buildings, one to three per true block, kept clear of the streets:
  // a block spans 64 units between street edges, so a building's centre
  // offset (+-8) plus half its size (<=11) stays inside it.
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const facadeCache = new Map();
  const facadeFor = (base) => {
    if (!facadeCache.has(base)) facadeCache.set(base, makeFacadeTexture(rng, base, 0.28));
    return facadeCache.get(base);
  };
  const neonMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (let bx = -CITY.halfBlocks - 1; bx <= CITY.halfBlocks; bx += 1) {
    for (let bz = -CITY.halfBlocks - 1; bz <= CITY.halfBlocks; bz += 1) {
      const cx = bx * CITY.pitch + CITY.pitch / 2;
      const cz = bz * CITY.pitch + CITY.pitch / 2;
      if (cx === 200 && cz === -200) continue; // the Pink Flamingo stands alone here
      if (cx === 40 && cz === 120) continue; // the shop stands alone here
      const roll = rng.next();
      if (roll < 0.16) continue; // park / plaza stays open
      const count = rng.int(1, 3);
      for (let k = 0; k < count; k += 1) {
        const w = rng.range(14, 22);
        const d = rng.range(14, 22);
        const h = rng.range(12, rng.chance(0.12) ? 74 : 42);
        const ox = rng.range(-8, 8);
        const oz = rng.range(-8, 8);
        const x = cx + ox;
        const z = cz + oz;
        const base = rng.pick(PALETTE.building);
        // Repeat the facade so windows stay roughly square on tall buildings.
        const tex = facadeFor(base).clone();
        tex.needsUpdate = true;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(Math.max(1, Math.round(w / 20)), Math.max(1, Math.round(h / 26)));
        const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
        const b = new THREE.Mesh(boxGeo, mat);
        b.scale.set(w, h, d);
        b.position.set(x, h / 2, z);
        b.castShadow = true;
        b.receiveShadow = true;
        group.add(b);
        colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
        // Rooftop box.
        if (rng.chance(0.4)) {
          const roof = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x4a4f58, roughness: 1 }));
          roof.scale.set(w * 0.35, 2.5, d * 0.35);
          roof.position.set(x, h + 1.2, z);
          group.add(roof);
        }
        // Neon sign strip on the street face.
        if (rng.chance(0.5)) {
          const neon = rng.pick(PALETTE.neon);
          const sign = new THREE.Mesh(
            new THREE.BoxGeometry(Math.min(w * 0.7, 12), 1.1, 0.4),
            new THREE.MeshBasicMaterial({ color: neon }),
          );
          sign.position.set(x, Math.min(h - 2, 14), z + d / 2 + 0.3);
          group.add(sign);
        }
      }
    }
  }

  // Street lamps along the avenues.
  const lampGeo = new THREE.CylinderGeometry(0.12, 0.12, 7, 6);
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x2c313a, roughness: 0.7 });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff6c9 });
  for (let i = -CITY.halfBlocks; i <= CITY.halfBlocks; i += 1) {
    for (let j = -CITY.halfBlocks; j <= CITY.halfBlocks; j += 1) {
      if ((i + j) % 2 !== 0) continue;
      const x = i * CITY.pitch + CITY.road / 2 + 1.5;
      const z = j * CITY.pitch + CITY.road / 2 + 1.5;
      const pole = new THREE.Mesh(lampGeo, lampMat);
      pole.position.set(x, 3.5, z);
      group.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), bulbMat);
      bulb.position.set(x, 7.1, z);
      group.add(bulb);
    }
  }

  // Palm trees on the plazas and along Coral Row.
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f9e4d, roughness: 0.9 });
  for (let i = 0; i < 46; i += 1) {
    const x = rng.range(-CITY.bounds, CITY.bounds);
    const z = rng.range(-CITY.bounds, CITY.bounds);
    if (Math.abs(x % CITY.pitch) < CITY.road / 2 + 2 || Math.abs(z % CITY.pitch) < CITY.road / 2 + 2) continue;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 6, 6), trunkMat);
    trunk.position.set(x, 3, z);
    trunk.castShadow = true;
    group.add(trunk);
    for (let l = 0; l < 5; l += 1) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3.4, 4), leafMat);
      const a = (l / 5) * Math.PI * 2;
      leaf.position.set(x + Math.cos(a) * 1.1, 6.6, z + Math.sin(a) * 1.1);
      leaf.rotation.z = Math.cos(a) * 0.9;
      leaf.rotation.x = -Math.sin(a) * 0.9;
      group.add(leaf);
    }
  }

  // Landmark: the Pink Flamingo tower on Coral Row (mission 1 target).
  // It sits in a true block centre (200, -200), clear of the streets.
  const flamingo = new THREE.Mesh(
    boxGeo,
    new THREE.MeshStandardMaterial({ map: facadeFor(0xd96a6a), emissive: 0x881133, emissiveIntensity: 0.25, roughness: 0.8 }),
  );
  flamingo.scale.set(22, 58, 22);
  flamingo.position.set(200, 29, -200);
  flamingo.castShadow = true;
  group.add(flamingo);
  colliders.push({ minX: 189, maxX: 211, minZ: -211, maxZ: -189 });
  const flamingoSign = new THREE.Mesh(
    new THREE.BoxGeometry(16, 2.4, 0.5),
    new THREE.MeshBasicMaterial({ color: 0xff2e88 }),
  );
  flamingoSign.position.set(200, 46, -200 + 11.4);
  group.add(flamingoSign);

  // The shop: Neon Arms & Snacks at (40, 120) — walk up and press E.
  const shop = new THREE.Mesh(
    boxGeo,
    new THREE.MeshStandardMaterial({ map: facadeFor(0x2ecc71), emissive: 0x1a5c2a, emissiveIntensity: 0.3, roughness: 0.8 }),
  );
  shop.scale.set(20, 12, 16);
  shop.position.set(40, 6, 120);
  shop.castShadow = true;
  group.add(shop);
  colliders.push({ minX: 30, maxX: 50, minZ: 112, maxZ: 128 });
  const shopSign = new THREE.Mesh(
    new THREE.BoxGeometry(14, 1.8, 0.5),
    new THREE.MeshBasicMaterial({ color: 0x2ecc71 }),
  );
  shopSign.position.set(40, 10, 120 + 8.4);
  group.add(shopSign);

  // Bay Beach: sand at the south edge and the bay itself beyond it.
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.bounds * 2 + 80, 60),
    new THREE.MeshStandardMaterial({ color: 0xc9b18a, roughness: 1 }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.05, CITY.bounds + 30);
  sand.receiveShadow = true;
  group.add(sand);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.bounds * 2 + 80, 400),
    new THREE.MeshStandardMaterial({ color: 0x1f6fd6, roughness: 0.2, metalness: 0.3, transparent: true, opacity: 0.9 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.02, CITY.bounds + 260);
  group.add(water);

  // Meridian Docks: shipping containers stacked at the west edge.
  const containerColors = [0xd93025, 0x1f6fd6, 0x2ecc71, 0xf2c200, 0x7a4fd0];
  const dockSpots = [
    [-330, 220, 0], [-330, 236, 1], [-318, 228, 2], [-330, 252, 3],
    [-318, 244, 0], [-330, 268, 4], [-318, 260, 1], [-342, 244, 2],
  ];
  for (const [x, z, ci] of dockSpots) {
    const c = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: containerColors[ci], roughness: 0.7, metalness: 0.3 }));
    c.scale.set(12, 3, 3);
    c.position.set(x, 1.5, z);
    c.castShadow = true;
    group.add(c);
    colliders.push({ minX: x - 6, maxX: x + 6, minZ: z - 1.5, maxZ: z + 1.5 });
  }

  scene.add(group);
  return { group, colliders, sun };
}

// Push a circle (x, z, radius) out of every building AABB it overlaps.
export function resolveCollisions(colliders, pos, radius) {
  for (let i = 0; i < colliders.length; i += 1) {
    const c = colliders[i];
    const nx = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - nx;
    const dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius && d2 > 0.0001) {
      const d = Math.sqrt(d2);
      pos.x = nx + (dx / d) * radius;
      pos.z = nz + (dz / d) * radius;
      return { hit: true, nx: dx / d, nz: dz / d };
    }
    if (d2 <= 0.0001) {
      // Inside the box: push out along the smallest penetration axis.
      const px = Math.min(pos.x - c.minX, c.maxX - pos.x);
      const pz = Math.min(pos.z - c.minZ, c.maxZ - pos.z);
      if (px < pz) pos.x = pos.x - c.minX < c.maxX - pos.x ? c.minX - radius : c.maxX + radius;
      else pos.z = pos.z - c.minZ < c.maxZ - pos.z ? c.minZ - radius : c.maxZ + radius;
      return { hit: true, nx: 0, nz: 0 };
    }
  }
  return { hit: false, nx: 0, nz: 0 };
}

export function nearestStreetCoord(v) {
  return Math.round(v / CITY.pitch) * CITY.pitch;
}

export function clampToCity(pos) {
  const b = CITY.bounds;
  pos.x = Math.max(-b, Math.min(b, pos.x));
  pos.z = Math.max(-b, Math.min(b, pos.z));
}
