// Solmar itself: a procedural sun-soaked city — road grid, canvas-window
// towers, sidewalks, palms, lamps, a beach and the sea to the east.
// All geometry is generated here from one seeded RNG, so ?seed=N replays it.
import * as THREE from 'three';
import { WORLD, PALETTE } from './config.js';
import { pick, range } from './rng.js';

export const ROAD_COORDS = [-120, -60, 0, 60, 120];

function windowTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#8a7a68'; g.fillRect(0, 0, 128, 256);
  for (let y = 8; y < 248; y += 18) {
    for (let x = 8; x < 120; x += 18) {
      g.fillStyle = Math.random() < 0.35 ? '#ffd88a' : '#2c3e55';
      g.fillRect(x, y, 12, 12);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makePalm(mat, leafMat) {
  const palm = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 5, 6), mat);
  trunk.position.y = 2.5;
  palm.add(trunk);
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3.2, 4), leafMat);
    const a = (i / 6) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 1.1, 5.2, Math.sin(a) * 1.1);
    leaf.rotation.z = Math.cos(a) * 1.1;
    leaf.rotation.x = -Math.sin(a) * 1.1;
    leaf.scale.set(1, 1, 0.25);
    palm.add(leaf);
  }
  return palm;
}

export function createCity(scene, rng) {
  const colliders = [];
  const addCollider = (x, z, hx, hz) => colliders.push({ x, z, hx, hz });

  // Ground, sand and sea.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.half * 2 + 60, WORLD.half * 2 + 60),
    new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(10, 0, 0);
  scene.add(ground);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(44, WORLD.half * 2 + 60),
    new THREE.MeshLambertMaterial({ color: PALETTE.sand }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(WORLD.beachX + 20, 0.02, 0);
  scene.add(sand);

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(240, WORLD.half * 2 + 80),
    new THREE.MeshLambertMaterial({ color: PALETTE.sea }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(WORLD.seaX + 118, 0.05, 0);
  scene.add(sea);

  // Roads: dark strips + centre dashes, on both axes.
  const roadMat = new THREE.MeshLambertMaterial({ color: PALETTE.road });
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xf5e9a8 });
  for (const c of ROAD_COORDS) {
    for (const horizontal of [true, false]) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(360, WORLD.roadWidth), roadMat);
      road.rotation.x = -Math.PI / 2;
      if (!horizontal) road.rotation.z = Math.PI / 2;
      road.position.set(horizontal ? 0 : c, 0.03, horizontal ? c : 0);
      scene.add(road);
      for (let d = -165; d <= 165; d += 15) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.5), dashMat);
        dash.rotation.x = -Math.PI / 2;
        if (!horizontal) dash.rotation.z = Math.PI / 2;
        dash.position.set(horizontal ? d : c, 0.04, horizontal ? c : d);
        scene.add(dash);
      }
    }
  }

  // Buildings: one or two per block, canvas window texture, varied tints.
  const winTex = windowTexture();
  const blockCentres = [-90, -30, 30, 90];
  const neonMat = PALETTE.neon.map((c) => new THREE.MeshBasicMaterial({ color: c }));
  for (const bx of blockCentres) {
    for (const bz of blockCentres) {
      if (bx > 100) continue; // beach side stays open
      const h = range(rng, 9, 42);
      const w = range(rng, 20, 32);
      const d = range(rng, 20, 32);
      const tint = pick(rng, PALETTE.building);
      const mat = new THREE.MeshLambertMaterial({ color: tint, map: winTex });
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      b.position.set(bx, h / 2, bz);
      scene.add(b);
      addCollider(bx, bz, w / 2 + 0.4, d / 2 + 0.4);
      // Rooftop box + neon sign on some towers.
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.3, 2, d * 0.3), new THREE.MeshLambertMaterial({ color: 0x666666 }));
      roof.position.set(bx, h + 1, bz);
      scene.add(roof);
      if (rng() < 0.5) {
        const sign = new THREE.Mesh(new THREE.BoxGeometry(6, 1.2, 0.4), pick(rng, neonMat));
        sign.position.set(bx, h * 0.8, bz + d / 2 + 0.3);
        scene.add(sign);
      }
    }
  }

  // Plaza fountain at the centre (the vault sits here in mission 4).
  const plaza = new THREE.Mesh(
    new THREE.CylinderGeometry(9, 9, 0.6, 24),
    new THREE.MeshLambertMaterial({ color: 0x7fb8d8 }),
  );
  plaza.position.set(0, 0.3, 0);
  scene.add(plaza);
  addCollider(0, 0, 9, 9);

  // Lighthouse on the beach (mission 4 drop-off).
  const lightMat = new THREE.MeshLambertMaterial({ color: 0xf0ead8 });
  const redMat = new THREE.MeshLambertMaterial({ color: 0xc23a2e });
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3, 18, 12), lightMat);
  tower.position.set(160, 9, -60);
  scene.add(tower);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 2, 12), redMat);
  band.position.set(160, 12, -60);
  scene.add(band);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.6, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe9a0 }));
  lamp.position.set(160, 19, -60);
  scene.add(lamp);
  addCollider(160, -60, 3.5, 3.5);

  // Palms along the beach and the marina.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a44 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f9e4f });
  for (let z = -150; z <= 150; z += 30) {
    const palm = makePalm(trunkMat, leafMat);
    palm.position.set(152 + range(rng, -2, 2), 0, z);
    scene.add(palm);
    if (rng() < 0.6) {
      const palm2 = makePalm(trunkMat, leafMat);
      palm2.position.set(138, 0, z + 15);
      scene.add(palm2);
    }
  }

  // Street lamps at road corners.
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x333944 });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0 });
  for (const cx of ROAD_COORDS) {
    for (const cz of ROAD_COORDS) {
      if (rng() < 0.5) continue;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 5.5, 6), poleMat);
      pole.position.set(cx + 7.5, 2.75, cz + 7.5);
      scene.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), bulbMat);
      bulb.position.set(cx + 7.5, 5.6, cz + 7.5);
      scene.add(bulb);
    }
  }

  // Parked cars flavour along the kerb.
  return { colliders };
}

// Circle (player / car) vs building boxes: push out, return true on hit.
export function collideCircle(colliders, x, z, r) {
  let hit = false;
  for (const c of colliders) {
    const cx = Math.max(c.x - c.hx, Math.min(x, c.x + c.hx));
    const cz = Math.max(c.z - c.hz, Math.min(z, c.z + c.hz));
    const dx = x - cx;
    const dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) { hit = true; }
  }
  return hit;
}

export function resolveCircle(colliders, pos, r) {
  for (const c of colliders) {
    const cx = Math.max(c.x - c.hx, Math.min(pos.x, c.x + c.hx));
    const cz = Math.max(c.z - c.hz, Math.min(pos.z, c.z + c.hz));
    let dx = pos.x - cx;
    let dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r && d2 > 0.0001) {
      const d = Math.sqrt(d2);
      const push = (r - d) / d;
      pos.x += dx * push;
      pos.z += dz * push;
    } else if (d2 <= 0.0001) {
      // Centre inside the box: push out along the smallest axis.
      const px = c.hx + r - Math.abs(pos.x - c.x);
      const pz = c.hz + r - Math.abs(pos.z - c.z);
      if (px < pz) pos.x += pos.x > c.x ? px : -px;
      else pos.z += pos.z > c.z ? pz : -pz;
    }
  }
}

export function clampWorld(pos, half) {
  pos.x = Math.max(-half, Math.min(half + 40, pos.x));
  pos.z = Math.max(-half, Math.min(half, pos.z));
}
