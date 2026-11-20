// Vehicles and people: the car mesh factory, AI traffic looping the road grid,
// wandering pedestrians, and police cruisers that chase the player.
import * as THREE from 'three';
import { CAR_COLORS } from './config.js';
import { ROAD_COORDS } from './world.js';
import { pick, range } from './rng.js';

const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });

export function createCarMesh(color, police) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: police ? 0xf0f0f0 : color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.85, 2), bodyMat);
  body.position.y = 0.65;
  group.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(2.3, 0.7, 1.8),
    new THREE.MeshLambertMaterial({ color: police ? 0x222831 : 0x1c2733 }),
  );
  cabin.position.set(-0.2, 1.35, 0);
  group.add(cabin);
  const wheels = [];
  for (const [wx, wz] of [[1.5, 0.95], [1.5, -0.95], [-1.5, 0.95], [-1.5, -0.95]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.x = Math.PI / 2;
    w.position.set(wx, 0.36, wz);
    group.add(w);
    wheels.push(w);
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
  for (const wz of [0.6, -0.6]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.25, 0.4), lightMat);
    h.position.set(2.22, 0.7, wz);
    group.add(h);
  }
  let lightbar = null;
  if (police) {
    lightbar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.7), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    red.position.x = -0.4;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.7), new THREE.MeshBasicMaterial({ color: 0x2040ff }));
    blue.position.x = 0.4;
    lightbar.add(red); lightbar.add(blue);
    lightbar.position.set(-0.2, 1.85, 0);
    group.add(lightbar);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(4.42, 0.3, 2.02), new THREE.MeshLambertMaterial({ color: 0x1c4fd2 }));
    stripe.position.y = 0.65;
    group.add(stripe);
  }
  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { group, wheels, lightbar, police: !!police };
}

function syncCarMesh(car) {
  car.group.position.set(car.x, 0, car.z);
  car.group.rotation.y = -car.heading;
  const spin = car.speed * 0.016;
  for (const w of car.wheels) w.rotation.z += spin;
}

// --- Traffic: cars looping rectangles of the road grid. ---
export function createTraffic(scene, rng, count) {
  const cars = [];
  for (let i = 0; i < count; i++) {
    const rx = pick(rng, [-60, 0, 60]);
    const rz = pick(rng, [-60, 0, 60]);
    const hw = pick(rng, [30, 60]);
    const loop = [
      { x: rx - hw, z: rz - hw }, { x: rx + hw, z: rz - hw },
      { x: rx + hw, z: rz + hw }, { x: rx - hw, z: rz + hw },
    ];
    // Snap loop corners onto roads so cars stay on tarmac.
    for (const p of loop) {
      p.x = ROAD_COORDS.reduce((a, b) => Math.abs(b - p.x) < Math.abs(a - p.x) ? b : a);
      p.z = ROAD_COORDS.reduce((a, b) => Math.abs(b - p.z) < Math.abs(a - b.z) ? b : a);
    }
    const mesh = createCarMesh(pick(rng, CAR_COLORS), false);
    scene.add(mesh.group);
    const start = loop[Math.floor(rng() * 4)];
    cars.push({
      ...mesh, x: start.x, z: start.z, heading: 0,
      speed: range(rng, 7, 12), loop, wp: 0, kind: 'traffic',
    });
  }
  return cars;
}

export function updateTraffic(cars, dt) {
  for (const car of cars) {
    const target = car.loop[car.wp];
    const dx = target.x - car.x;
    const dz = target.z - car.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 3) { car.wp = (car.wp + 1) % car.loop.length; continue; }
    const want = Math.atan2(-dz, dx);
    let diff = want - car.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    car.heading += Math.max(-1.6 * dt, Math.min(1.6 * dt, diff));
    car.x += Math.cos(car.heading) * car.speed * dt;
    car.z += -Math.sin(car.heading) * car.speed * dt;
    syncCarMesh(car);
  }
}

// --- Pedestrians wandering the sidewalks. ---
const SHIRT_COLORS = [0xe86a6a, 0x6aa8e8, 0x7dd67d, 0xe8c86a, 0xc98ae8, 0xe8e8e8, 0x6ad8d0];

export function createPedestrians(scene, rng, count) {
  const peds = [];
  const bodyGeo = new THREE.CylinderGeometry(0.28, 0.34, 1.1, 8);
  const headGeo = new THREE.SphereGeometry(0.26, 10, 8);
  const legGeo = new THREE.BoxGeometry(0.4, 0.5, 0.2);
  for (let i = 0; i < count; i++) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(bodyGeo, new THREE.MeshLambertMaterial({ color: pick(rng, SHIRT_COLORS) }));
    body.position.y = 0.95;
    const head = new THREE.Mesh(headGeo, new THREE.MeshLambertMaterial({ color: 0xe8b88a }));
    head.position.y = 1.75;
    const legs = new THREE.Mesh(legGeo, new THREE.MeshLambertMaterial({ color: 0x2a2f3a }));
    legs.position.y = 0.25;
    g.add(body); g.add(head); g.add(legs);
    scene.add(g);
    const road = pick(rng, ROAD_COORDS);
    peds.push({
      group: g, x: road + 8, z: range(rng, -150, 150),
      tx: road + 8, tz: range(rng, -150, 150),
      speed: range(rng, 1.2, 2.2), alive: true, bob: rng() * 6,
    });
  }
  return peds;
}

export function updatePedestrians(peds, dt, time) {
  for (const p of peds) {
    if (!p.alive) continue;
    const dx = p.tx - p.x;
    const dz = p.tz - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1) {
      const road = ROAD_COORDS[Math.floor(Math.random() * ROAD_COORDS.length)];
      p.tx = road + 8 + (Math.random() - 0.5) * 4;
      p.tz = Math.max(-150, Math.min(150, p.tz + (Math.random() - 0.5) * 80));
      continue;
    }
    p.x += (dx / dist) * p.speed * dt;
    p.z += (dz / dist) * p.speed * dt;
    p.group.position.set(p.x, Math.abs(Math.sin(time * 6 + p.bob)) * 0.06, p.z);
    p.group.rotation.y = Math.atan2(dx, dz);
  }
}

// --- Police cruisers. ---
export function createPoliceCar(scene, x, z) {
  const mesh = createCarMesh(0, true);
  scene.add(mesh.group);
  return { ...mesh, x, z, heading: 0, speed: 0, kind: 'police', flash: 0 };
}

export function updatePolice(car, dt, target, onFoot) {
  const dx = target.x - car.x;
  const dz = target.z - car.z;
  const dist = Math.hypot(dx, dz);
  const want = Math.atan2(-dz, dx);
  let diff = want - car.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
  car.heading += steer;
  const wantSpeed = dist > 4 ? (onFoot ? 16 : 30) : 6;
  car.speed += Math.max(-20 * dt, Math.min(14 * dt, wantSpeed - car.speed));
  car.x += Math.cos(car.heading) * car.speed * dt;
  car.z += -Math.sin(car.heading) * car.speed * dt;
  car.flash += dt;
  if (car.lightbar) {
    car.lightbar.children[0].material.color.setHex(Math.sin(car.flash * 10) > 0 ? 0xff2020 : 0x551010);
    car.lightbar.children[1].material.color.setHex(Math.sin(car.flash * 10) > 0 ? 0x102060 : 0x2040ff);
  }
  syncCarMesh(car);
  return dist;
}
