// Solmar Nights — boot, game loop, player + driving, combat, wanted level,
// police, pickups, save/load and the ?shot= screenshot scenes.
// ?shot=start|play|chase|mission (with &seed=N) stages that scene from the real
// simulation, paints it twice and sets window.__shotReady.
import * as THREE from 'three';
import { CAR, MISSIONS, PALETTE, PLAYER, SAVE_KEY, WANTED, WORLD } from './config.js';
import { createRng, pick, range } from './rng.js';
import { createAudio } from './audio.js';
import { clampWorld, collideCircle, createCity, resolveCircle, ROAD_COORDS } from './world.js';
import { createCarMesh, createPedestrians, createPoliceCar, createTraffic, updatePedestrians, updatePolice, updateTraffic } from './traffic.js';
import { createMissions } from './missions.js';
import { createHud } from './hud.js';

const STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);
const rng = createRng(seed);

const audio = createAudio();
const hud = createHud();
const canvas = document.getElementById('c');

// --- Renderer / scene -------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(PALETTE.fog, 180, 420);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 800);

const sun = new THREE.DirectionalLight(PALETTE.sun, 2.2);
sun.position.set(120, 160, 60);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -200; sun.shadow.camera.right = 200;
sun.shadow.camera.top = 200; sun.shadow.camera.bottom = -200;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x8a7a5a, 0.9));

const city = createCity(scene, rng);
const missions = createMissions(scene);
let trafficCars = createTraffic(scene, rng, 10);
let peds = createPedestrians(scene, rng, 14);
let police = [];

// --- Player mesh ------------------------------------------------------------
function createPlayerMesh() {
  const g = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0xff7a2e });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.95, 0.36), jacket);
  body.position.y = 1.05;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), new THREE.MeshLambertMaterial({ color: 0xe8b88a }));
  head.position.y = 1.78;
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 8, 0, Math.PI * 2, 0, 1.4), new THREE.MeshLambertMaterial({ color: 0x1c1c22 }));
  hair.position.y = 1.82;
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.3), new THREE.MeshLambertMaterial({ color: 0x2a3550 }));
  legs.position.y = 0.3;
  g.add(body); g.add(head); g.add(hair); g.add(legs);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
const playerMesh = createPlayerMesh();
scene.add(playerMesh);

// --- Parked cars (stealable) + the mission Comet -----------------------------
const parked = [];
function addParked(color, x, z, heading, flag) {
  const mesh = createCarMesh(color, false);
  scene.add(mesh.group);
  const car = { ...mesh, x, z, heading, speed: 0, kind: 'parked', flag: flag || null, hp: 3, taken: false };
  car.group.position.set(x, 0, z);
  car.group.rotation.y = -heading;
  parked.push(car);
  return car;
}
const missionCar = addParked(0xd23c2e, 132, -102, Math.PI / 2, 'comet');
addParked(0x2e6fd2, -52, 30, 0);
addParked(0xe8c832, 68, -90, Math.PI);
addParked(0x38b06a, 8, 120, Math.PI / 2);
addParked(0xe8e8e8, -112, -60, 0);

// --- Pickups: health crosses and ammo crates ---------------------------------
const pickups = [];
function addPickup(kind, x, z) {
  const g = new THREE.Group();
  const color = kind === 'health' ? 0xe83a3a : 0x38b06a;
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), new THREE.MeshLambertMaterial({ color }));
  box.position.y = 0.7;
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.2, 0.95), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  top.position.y = 1.2;
  g.add(box); g.add(top);
  g.position.set(x, 0, z);
  scene.add(g);
  pickups.push({ group: g, kind, x, z, taken: false, timer: 0 });
}
addPickup('health', -52, -52); addPickup('ammo', 68, 52); addPickup('health', 128, 30);
addPickup('ammo', -112, 112); addPickup('health', 52, -112); addPickup('ammo', -8, 68);

// --- Game state ---------------------------------------------------------------
const G = {
  screen: 'start', // start | play | pause | end
  cash: 0, health: PLAYER.maxHealth, ammo: 24, wanted: 0,
  driving: false, car: null, carSpeed: 0,
  px: 0, pz: -30, py: 0, vy: 0, heading: Math.PI / 2, onGround: true,
  camYaw: 0, camPitch: 0.42, camDist: 9, driveYaw: 0, camOffset: 0,
  lastCrime: -999, sinceCrime: 0, bustedTimer: 0, damageCooldown: 0,
  regenDelay: 0, time: 0, robTimer: 0, endReason: '',
  scripted: null, // {fwd, steer} autopilot for ?shot= scenes
};

const keys = {};
let dragging = false;
let lastMouse = { x: 0, y: 0 };
let mouseMoved = 0;

function addWanted(n, reason) {
  G.wanted = Math.min(WANTED.max, G.wanted + n);
  G.sinceCrime = 0;
  if (reason) hud.showMessage(reason);
  ensurePolice();
}

function ensurePolice() {
  const want = Math.min(G.wanted * WANTED.policePerStar, WANTED.maxPolice);
  while (police.length < want) {
    const a = rng() * Math.PI * 2;
    const x = G.px + Math.cos(a) * 45;
    const z = G.pz + Math.sin(a) * 45;
    police.push(createPoliceCar(scene, Math.max(-170, Math.min(170, x)), Math.max(-170, Math.min(170, z))));
  }
  while (police.length > want) {
    const p = police.pop();
    scene.remove(p.group);
  }
  audio.startSiren();
  audio.setSiren(G.wanted > 0);
}

function saveGame() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: G.cash, health: G.health, ammo: G.ammo,
      missionIndex: missions.state.index, missionStep: missions.state.step,
      px: G.px, pz: G.pz, heading: G.heading,
    }));
  } catch { /* private mode: progress lasts this visit only */ }
}

function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function applySave(s) {
  G.cash = s.cash || 0;
  G.health = s.health || PLAYER.maxHealth;
  G.ammo = s.ammo ?? 24;
  G.px = s.px ?? 0; G.pz = s.pz ?? -30;
  G.heading = s.heading ?? 0;
  missions.state.index = Math.min(s.missionIndex || 0, MISSIONS.length - 1);
  missions.state.step = s.missionStep || 0;
  missions.state.started = true;
  missions.moveMarker();
}

// --- Shooting -----------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.9 });
let tracer = null;
let tracerTimer = 0;

function shootTargets() {
  const list = [];
  for (const c of trafficCars) { c.group.userData.hit = { kind: 'car', ref: c }; list.push(c.group); }
  for (const c of parked) { if (!c.taken) { c.group.userData.hit = { kind: 'car', ref: c }; list.push(c.group); } }
  for (const p of police) { p.group.userData.hit = { kind: 'police', ref: p }; list.push(p.group); }
  for (const p of peds) { if (p.alive) { p.group.userData.hit = { kind: 'ped', ref: p }; list.push(p.group); } }
  return list;
}

function shoot() {
  if (G.screen !== 'play' || G.driving || G.ammo <= 0) return;
  G.ammo -= 1;
  audio.shoot();
  G.wanted = Math.min(WANTED.max, G.wanted + WANTED.shoot);
  G.sinceCrime = 0;
  ensurePolice();
  raycaster.setFromCamera({ x: 0, y: 0 }, camera);
  const hits = raycaster.intersectObjects(shootTargets(), true);
  const from = new THREE.Vector3(G.px, 1.5, G.pz);
  let to = raycaster.ray.at(60, new THREE.Vector3());
  if (hits.length) {
    const h = hits[0];
    to = h.point.clone();
    let o = h.object;
    while (o && !o.userData.hit) o = o.parent;
    const hit = o && o.userData.hit;
    if (hit && hit.kind === 'ped') {
      hit.ref.alive = false;
      hit.ref.group.rotation.x = Math.PI / 2;
      hit.ref.group.position.y = 0.3;
      addWanted(WANTED.hitPed, 'Pedestrian down! Wanted level up');
    } else if (hit && hit.kind === 'police') {
      hit.ref.hp -= 1;
      hud.showMessage(hit.ref.hp <= 0 ? 'Police cruiser disabled!' : 'Hit! Police cruiser damaged');
      if (hit.ref.hp <= 0) {
        hit.ref.speed = 0;
        hit.ref.disabled = true;
        G.cash += 100;
      }
    } else if (hit && hit.kind === 'car') {
      hud.showMessage('You shot a car!');
    }
  }
  if (tracer) scene.remove(tracer);
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  tracer = new THREE.Line(geo, tracerMat);
  scene.add(tracer);
  tracerTimer = 0.09;
  hud.setAmmo(G.ammo);
}

// --- Entering / exiting cars ----------------------------------------------------
function nearestCar(maxDist) {
  let best = null;
  let bestD = maxDist;
  const all = [...parked.filter((c) => !c.taken), ...trafficCars];
  for (const c of all) {
    const d = Math.hypot(c.x - G.px, c.z - G.pz);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

function enterCar(car) {
  if (car.kind === 'traffic') {
    trafficCars = trafficCars.filter((c) => c !== car);
    addWanted(WANTED.steal, 'Car stolen! Wanted level up');
  } else if (car.flag !== 'comet' || missions.state.index !== 0) {
    if (!car.owned) addWanted(WANTED.steal, 'Car stolen! Wanted level up');
  }
  if (car.flag === 'comet' && missions.state.index === 0 && missions.state.step === 0) {
    advanceMissionStep('stolen');
  }
  car.taken = true;
  G.car = car;
  G.driving = true;
  G.carSpeed = 0;
  G.driveYaw = car.heading;
  audio.startEngine();
  playerMesh.visible = false;
  hud.showMessage(car.flag === 'comet' ? 'The Comet is yours — drive it to Mara\'s garage!' : 'You took the car.');
}

function exitCar() {
  if (!G.car) return;
  const car = G.car;
  car.owned = true;
  G.px = car.x - Math.cos(car.heading) * 2.5;
  G.pz = car.z + Math.sin(car.heading) * 2.5;
  G.py = 0; G.vy = 0;
  G.heading = car.heading;
  G.car = null;
  G.driving = false;
  playerMesh.visible = true;
  audio.setEngine(0, false);
}

function tryInteract() {
  if (G.screen !== 'play') return;
  if (G.driving) { exitCar(); return; }
  const step = missions.currentStep();
  // Mission context actions first.
  if (step && step.target) {
    const d = Math.hypot(step.target[0] - G.px, step.target[2] - G.pz);
    if (d < 5 && (step.kind === 'pickup' || step.kind === 'rob')) {
      if (step.kind === 'pickup') { advanceMissionStep('picked up'); addWanted(2, 'The PD spotted the pickup!'); }
      else { G.robTimer = 1.5; hud.showMessage('Cracking the vault...'); }
      return;
    }
  }
  const car = nearestCar(4.5);
  if (car) enterCar(car);
}

function advanceMissionStep(how) {
  const res = missions.advanceStep();
  if (res === 'mission-done') {
    const m = missions.completeMission();
    G.cash += m.reward;
    audio.mission();
    hud.showMessage(`${m.title} complete! +$${m.reward}`);
    hud.showDialog(m.done[0], m.done[1], '', 6000);
    saveGame();
    if (!missions.state.done) {
      const next = missions.startMission();
      setTimeout(() => { if (G.screen === 'play') hud.showDialog(next.intro[0], next.intro[1], 'New mission: ' + next.title, 8000); }, 6500);
    } else {
      hud.showDialog('Mara Solis', 'That is the whole story, Ray — Solmar is yours now. Free roam!', '', 8000);
    }
  } else {
    audio.pickup();
    hud.showMessage(how === 'stolen' ? 'Got it — now deliver it!' : 'Objective updated');
  }
  refreshObjective();
}

function refreshObjective() {
  hud.setObjective(missions.objectiveText());
  hud.setMissionCount(missions.state.index, MISSIONS.length);
}

// --- Mission step checks ---------------------------------------------------------
function checkMissionSteps(dt) {
  const m = missions.current();
  if (!m || missions.state.done) return;
  const step = missions.currentStep();
  if (!step) return;
  const pos = G.driving && G.car ? { x: G.car.x, z: G.car.z } : { x: G.px, z: G.pz };
  if (step.kind === 'deliver' && step.target) {
    if (Math.hypot(step.target[0] - pos.x, step.target[2] - pos.z) < 6) {
      if (m.id === 'hot-wheels' && !(G.driving && G.car === missionCar)) return; // must arrive in the Comet
      if (m.id === 'hot-wheels') { missionCar.taken = false; missionCar.owned = true; }
      advanceMissionStep('delivered');
    }
  } else if (step.kind === 'pickup' && step.target) {
    if (Math.hypot(step.target[0] - pos.x, step.target[2] - pos.z) < 4) {
      advanceMissionStep('picked up');
      addWanted(2, 'The PD spotted the pickup!');
    }
  } else if (step.kind === 'escape') {
    if (G.wanted === 0) advanceMissionStep('escaped');
  }
  // Rob channel: E sets robTimer=1.5; when it reaches 0 the vault opens.
  if (G.robTimer > 0) {
    G.robTimer -= dt;
    if (G.robTimer <= 0) {
      advanceMissionStep('robbed');
      addWanted(3, 'Vault alarm! Wanted level 3');
      G.cash += 0; // reward lands on delivery
    }
  }
}

// --- Wanted decay / police ---------------------------------------------------------
function updateWanted(dt) {
  G.sinceCrime += dt;
  if (G.wanted > 0 && G.sinceCrime > WANTED.decayDelay) {
    G.wantedTimer += dt;
    if (G.wantedTimer > WANTED.decayEvery) {
      G.wanted -= 1;
      G.wantedTimer = 0;
      ensurePolice();
      if (G.wanted === 0) hud.showMessage('You lost the heat. Clean... for now.');
    }
  } else G.wantedTimer = 0;
  // Police far away give up slowly when wanted is low.
  for (let i = police.length - 1; i >= 0; i--) {
    const p = police[i];
    if (p.disabled) continue;
    const d = Math.hypot(p.x - G.px, p.z - G.pz);
    if (d > 220) { scene.remove(p.group); police.splice(i, 1); }
  }
  ensurePolice();
}

function updatePoliceChase(dt) {
  const target = G.driving && G.car ? { x: G.car.x, z: G.car.z } : { x: G.px, z: G.pz };
  let nearest = Infinity;
  for (const p of police) {
    if (p.disabled) continue;
    const d = updatePolice(p, dt, target, !G.driving);
    nearest = Math.min(nearest, d);
    // Ram the player: damage on contact, with a cooldown.
    if (d < 3.2 && G.damageCooldown <= 0) {
      G.health -= 8;
      G.damageCooldown = 1;
      G.regenDelay = 10;
      audio.crash();
      hud.showMessage('Police rammed you!');
      if (G.driving) G.carSpeed *= 0.4;
    }
    // Busted: on foot and a cruiser sits on you.
    if (!G.driving && d < 2.6) {
      G.bustedTimer += dt;
      if (G.bustedTimer > 2.5) endGame('BUSTED', 'The Solmar PD caught you on foot. Bail is $200 — the streets will wait.');
    } else if (!G.driving) G.bustedTimer = Math.max(0, G.bustedTimer - dt * 2);
  }
  return nearest;
}

// --- Player movement ---------------------------------------------------------------
function updatePlayer(dt) {
  const fwd = G.scripted ? G.scripted.fwd : ((keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0));
  const strafe = G.scripted ? G.scripted.strafe || 0 : ((keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0));
  const run = keys.ShiftLeft || keys.ShiftRight || (G.scripted && G.scripted.run);
  if (G.driving && G.car) {
    updateDriving(dt, fwd, strafe);
    return;
  }
  const fx = -Math.sin(G.camYaw);
  const fz = -Math.cos(G.camYaw);
  const rx = -fz;
  const rz = fx;
  let mx = fx * fwd + rx * strafe;
  let mz = fz * fwd + rz * strafe;
  const len = Math.hypot(mx, mz);
  if (len > 0.01) {
    mx /= len; mz /= len;
    const speed = run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    G.px += mx * speed * dt;
    G.pz += mz * speed * dt;
    G.heading = Math.atan2(-mz, mx);
  }
  // Jump / gravity.
  if ((keys.Space || (G.scripted && G.scripted.jump)) && G.onGround) {
    G.vy = PLAYER.jumpSpeed;
    G.onGround = false;
  }
  G.vy -= PLAYER.gravity * dt;
  G.py += G.vy * dt;
  if (G.py <= 0) { G.py = 0; G.vy = 0; G.onGround = true; }
  clampWorld(G, WORLD.half);
  const pos = { x: G.px, z: G.pz };
  resolveCircle(city.colliders, pos, PLAYER.radius);
  G.px = pos.x; G.pz = pos.z;
  playerMesh.position.set(G.px, G.py, G.pz);
  playerMesh.rotation.y = -G.heading;
  // Walk bob.
  playerMesh.position.y = G.py + (len > 0.01 ? Math.abs(Math.sin(G.time * 10)) * 0.05 : 0);
}

function updateDriving(dt, fwd, strafe) {
  const car = G.car;
  const steerInput = G.scripted ? G.scripted.steer : strafe;
  const throttle = G.scripted ? G.scripted.fwd : fwd;
  if (throttle > 0) G.carSpeed += CAR.accel * dt;
  else if (throttle < 0) G.carSpeed -= (G.carSpeed > 0.5 ? CAR.brake : CAR.accel * 0.5) * dt;
  else G.carSpeed -= Math.sign(G.carSpeed) * CAR.drag * 8 * dt;
  if (Math.abs(G.carSpeed) < 0.2 && throttle === 0) G.carSpeed = 0;
  G.carSpeed = Math.max(-CAR.maxReverse, Math.min(CAR.maxSpeed, G.carSpeed));
  const steerScale = Math.min(1, Math.abs(G.carSpeed) / 8);
  car.heading += steerInput * CAR.turnRate * steerScale * dt * Math.sign(G.carSpeed || 1) * -1;
  const nx = car.x + Math.cos(car.heading) * G.carSpeed * dt;
  const nz = car.z + -Math.sin(car.heading) * G.carSpeed * dt;
  const pos = { x: nx, z: nz };
  const before = { x: car.x, z: car.z };
  resolveCircle(city.colliders, pos, 1.6);
  const hitWall = Math.hypot(pos.x - nx, pos.z - nz) > 0.01;
  car.x = pos.x; car.z = pos.z;
  if (hitWall && Math.abs(G.carSpeed) > 8) {
    audio.crash();
    G.health -= 3;
    G.regenDelay = 10;
  }
  if (hitWall) G.carSpeed *= 0.5;
  clampWorld(car, WORLD.half);
  // Traffic bumps.
  for (const t of trafficCars) {
    const d = Math.hypot(t.x - car.x, t.z - car.z);
    if (d < 3.4 && d > 0.01) {
      const push = (3.4 - d) / 2;
      car.x += ((car.x - t.x) / d) * push;
      car.z += ((car.z - t.z) / d) * push;
      if (Math.abs(G.carSpeed) > 10) audio.crash();
      G.carSpeed *= 0.7;
    }
  }
  // Running over pedestrians.
  for (const p of peds) {
    if (!p.alive) continue;
    if (Math.hypot(p.x - car.x, p.z - car.z) < 2.2 && Math.abs(G.carSpeed) > 3) {
      p.alive = false;
      p.group.rotation.x = Math.PI / 2;
      p.group.position.y = 0.3;
      addWanted(WANTED.hitPed, 'You hit a pedestrian!');
      audio.crash();
    }
  }
  car.speed = G.carSpeed;
  car.group.position.set(car.x, 0, car.z);
  car.group.rotation.y = -car.heading;
  const spin = G.carSpeed * dt * 2;
  for (const w of car.wheels) w.rotation.z += spin;
  audio.setEngine(Math.abs(G.carSpeed) / CAR.maxSpeed, true);
  G.driveYaw += (car.heading - G.driveYaw) * Math.min(1, dt * 2);
}

// --- Camera -------------------------------------------------------------------------
function updateCamera(dt) {
  const target = G.driving && G.car
    ? { x: G.car.x, y: 1.6, z: G.car.z }
    : { x: G.px, y: 1.6 + G.py, z: G.pz };
  // While driving the camera trails the car; mouse drag adds a temporary offset.
  const useYaw = G.driving ? G.driveYaw + G.camOffset : G.camYaw;
  const dist = G.driving ? 12 : G.camDist;
  const h = G.driving ? 4.5 : 2.2 + Math.sin(G.camPitch) * dist * 0.5;
  const cx = target.x + Math.sin(useYaw) * dist;
  const cz = target.z + Math.cos(useYaw) * dist;
  camera.position.set(cx, target.y + h, cz);
  camera.lookAt(target.x, target.y, target.z);
  if (G.driving) G.camOffset *= Math.max(0, 1 - dt * 0.8);
}

// --- Pickups ---------------------------------------------------------------------------
function updatePickups(dt) {
  const pos = G.driving && G.car ? { x: G.car.x, z: G.car.z } : { x: G.px, z: G.pz };
  for (const p of pickups) {
    if (p.taken) {
      p.timer -= dt;
      if (p.timer <= 0) { p.taken = false; p.group.visible = true; }
      continue;
    }
    p.group.rotation.y += dt;
    p.group.position.y = Math.abs(Math.sin(G.time * 2 + p.x)) * 0.15;
    if (Math.hypot(p.x - pos.x, p.z - pos.z) < 2.2) {
      p.taken = true;
      p.timer = 45;
      p.group.visible = false;
      if (p.kind === 'health') { G.health = Math.min(PLAYER.maxHealth, G.health + 40); hud.showMessage('Health +40'); }
      else { G.ammo += 24; hud.showMessage('Ammo +24'); hud.setAmmo(G.ammo); }
      audio.pickup();
    }
  }
}

// --- Screens ------------------------------------------------------------------------------
function showScreen(name) {
  G.screen = name;
  hud.hide(hud.els.start); hud.hide(hud.els.pause); hud.hide(hud.els.end);
  if (name === 'start') { hud.show(hud.els.start); hud.hide(hud.els.hud); }
  else if (name === 'pause') { hud.show(hud.els.pause); }
  else if (name === 'end') { hud.show(hud.els.end); hud.hide(hud.els.hud); }
  else { hud.hide(hud.els.start); hud.show(hud.els.hud); }
}

function startGame(fresh) {
  audio.unlock();
  audio.startEngine();
  if (fresh) {
    G.cash = 0; G.health = PLAYER.maxHealth; G.ammo = 24; G.wanted = 0;
    G.px = 0; G.pz = -30; G.heading = Math.PI / 2; G.py = 0; G.vy = 0;
    missions.state.index = 0; missions.state.step = 0; missions.state.done = false;
    if (G.car) { G.car.taken = false; G.car = null; G.driving = false; playerMesh.visible = true; }
    missions.startMission();
    const m = missions.current();
    hud.showDialog(m.intro[0], m.intro[1], 'Mission 1: ' + m.title, 9000);
  } else {
    const s = loadSave();
    if (s) applySave(s);
    else { startGame(true); return; }
    if (!missions.state.started) { missions.state.started = true; missions.moveMarker(); }
    const m = missions.current();
    if (m) hud.showDialog('Mara Solis', `Back on the job, Ray. ${m.title} — ${missions.currentStep().text}`, '', 6000);
  }
  ensurePolice();
  refreshObjective();
  hud.setCash(G.cash); hud.setHealth(G.health, PLAYER.maxHealth); hud.setAmmo(G.ammo); hud.setWanted(G.wanted);
  showScreen('play');
}

function endGame(title, text) {
  audio.busted();
  audio.setSiren(false);
  const lost = Math.floor(G.cash * 0.2);
  G.cash -= lost;
  hud.els.busted.textContent = title;
  hud.els.endText.textContent = `${text} You lost $${lost}.`;
  hud.els.endStats.textContent = `Cash $${Math.floor(G.cash)} · ${missions.state.done ? 'Story complete' : `Mission ${missions.state.index + 1} of ${MISSIONS.length}`} · Wanted ${G.wanted}★`;
  saveGame();
  showScreen('end');
}

function respawn() {
  G.health = PLAYER.maxHealth;
  G.wanted = 0;
  G.bustedTimer = 0;
  ensurePolice();
  audio.setSiren(false);
  if (G.driving) exitCar();
  G.px = 0; G.pz = -30; G.py = 0; G.vy = 0;
  G.heading = Math.PI / 2;
  playerMesh.visible = true;
  showScreen('play');
}

// --- Input ----------------------------------------------------------------------------------
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') e.preventDefault();
  keys[e.code] = true;
  if (e.code === 'KeyE') tryInteract();
  if (e.code === 'KeyM') toggleMute();
  if (e.code === 'KeyR' && G.screen === 'play' && G.driving) {
    G.car.x = G.px; G.car.z = G.pz; G.carSpeed = 0;
  }
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (G.screen === 'play') { showScreen('pause'); hud.els.pauseStats.textContent = `Cash $${Math.floor(G.cash)} · Health ${Math.floor(G.health)} · ${missions.objectiveText()}`; saveGame(); }
    else if (G.screen === 'pause') showScreen('play');
  }
  hud.hideDialog();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
canvas.addEventListener('mousedown', (e) => { dragging = true; mouseMoved = 0; lastMouse = { x: e.clientX, y: e.clientY }; });
window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastMouse.x;
  const dy = e.clientY - lastMouse.y;
  mouseMoved += Math.abs(dx) + Math.abs(dy);
  lastMouse = { x: e.clientX, y: e.clientY };
  if (G.driving) { G.camOffset = (G.camOffset || 0) - dx * 0.005; }
  else {
    G.camYaw -= dx * 0.005;
    G.camPitch = Math.max(0.05, Math.min(1.2, G.camPitch + dy * 0.003));
  }
});
window.addEventListener('mouseup', () => {
  if (dragging && mouseMoved < 6 && G.screen === 'play') shoot();
  dragging = false;
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function toggleMute() {
  const m = audio.setMuted(!audio.isMuted());
  hud.els.mute.textContent = m ? 'Sound: OFF' : 'Sound: ON';
}
hud.els.mute.addEventListener('click', () => { audio.unlock(); toggleMute(); });
document.getElementById('startbtn').addEventListener('click', () => startGame(true));
document.getElementById('continuebtn').addEventListener('click', () => {
  if (loadSave()) startGame(false);
  else startGame(true);
});
document.getElementById('resumebtn').addEventListener('click', () => showScreen('play'));
document.getElementById('quitbtn').addEventListener('click', () => { saveGame(); showScreen('start'); });
document.getElementById('retrybtn').addEventListener('click', respawn);

// --- Main step --------------------------------------------------------------------------------
function stepGame(dt) {
  G.time += dt;
  G.damageCooldown = Math.max(0, G.damageCooldown - dt);
  G.regenDelay = Math.max(0, G.regenDelay - dt);
  if (G.regenDelay <= 0 && G.health < PLAYER.maxHealth && G.wanted === 0) {
    G.health = Math.min(PLAYER.maxHealth, G.health + 2 * dt);
  }
  updatePlayer(dt);
  updateTraffic(trafficCars, dt);
  updatePedestrians(peds, dt, G.time);
  updateWanted(dt);
  updatePoliceChase(dt);
  updatePickups(dt);
  checkMissionSteps(dt);
  missions.pulse(G.time);
  if (tracer) {
    tracerTimer -= dt;
    if (tracerTimer <= 0) { scene.remove(tracer); tracer = null; }
  }
  updateCamera(dt);
  // HUD refresh.
  hud.setCash(G.cash);
  hud.setHealth(G.health, PLAYER.maxHealth);
  hud.setWanted(G.wanted);
  hud.setSpeed(G.driving ? Math.abs(G.carSpeed) * 3.6 : 0, G.driving);
  const markerStep = missions.currentStep();
  hud.drawMinimap(
    null,
    { x: G.driving && G.car ? G.car.x : G.px, z: G.driving && G.car ? G.car.z : G.pz, heading: G.driving && G.car ? G.car.heading : G.heading },
    trafficCars, police, peds,
    markerStep && markerStep.target ? { x: markerStep.target[0], z: markerStep.target[2] } : null,
  );
  // Interact prompt.
  if (G.screen === 'play') {
    if (G.driving) hud.setInteract('Press <b>E</b> to exit car');
    else {
      const car = nearestCar(4.5);
      const step = missions.currentStep();
      if (step && step.target && Math.hypot(step.target[0] - G.px, step.target[2] - G.pz) < 5 && (step.kind === 'pickup' || step.kind === 'rob')) {
        hud.setInteract(step.kind === 'pickup' ? 'Press <b>E</b> to grab the package' : 'Press <b>E</b> to crack the vault');
      } else if (car) hud.setInteract(car.flag === 'comet' ? 'Press <b>E</b> to steal the Comet' : 'Press <b>E</b> to enter car');
      else hud.setInteract(null);
    }
  }
  if (G.health <= 0 && G.screen === 'play') endGame('WASTED', 'Ray went down in the streets of Solmar.');
}

// --- Screenshot scenes --------------------------------------------------------------------------
function stageShot(name) {
  audio.setMuted(true);
  G.camYaw = 0.6;
  if (name === 'start') {
    showScreen('start');
    G.px = 0; G.pz = -30;
    G.camYaw = 0.8; G.camPitch = 0.5;
    for (let i = 0; i < 120; i++) { updateTraffic(trafficCars, STEP); updatePedestrians(peds, STEP, i * STEP); }
    updateCamera(0);
    return;
  }
  // Playing scenes: real simulation, scripted driver.
  showScreen('play');
  hud.hide(hud.els.dialog);
  if (name === 'mission') {
    G.px = 118; G.pz = 48; G.heading = -0.71;
    G.camYaw = -2.36;
    playerMesh.position.set(G.px, 0, G.pz);
    playerMesh.rotation.y = -G.heading;
    missions.state.index = 2; missions.state.step = 1; missions.state.started = true;
    missions.moveMarker();
    refreshObjective();
    hud.showDialog('Mara Solis', 'Meet me at the beach house, Ray. No cops on your tail — you are clear.', 'Mission 3: Heat Wave', 30000);
    for (let i = 0; i < 30; i++) stepGame(STEP);
    hud.setCash(1700); hud.setHealth(G.health, PLAYER.maxHealth); hud.setAmmo(G.ammo);
    return;
  }
  // Driving scenes: put Ray in the red Comet on Coral Street (road x=0),
  // heading down the long straight away from the plaza fountain.
  const car = missionCar;
  car.taken = true; car.owned = true;
  car.x = 0; car.z = 120; car.heading = Math.PI / 2;
  G.car = car; G.driving = true; G.carSpeed = 0; G.driveYaw = car.heading;
  playerMesh.visible = false;
  missions.state.index = 0; missions.state.step = 1; missions.state.started = true;
  missions.moveMarker();
  refreshObjective();
  G.cash = 500;
  if (name === 'chase') {
    G.wanted = 3;
    G.sinceCrime = 0;
    ensurePolice();
    // Police flanking the Comet so the chase reads in frame (behind the
    // player is behind the chase camera, so they ride up alongside).
    const flank = [[-6.5, 6], [6.5, 0], [-7, -8]];
    police.forEach((p, i) => {
      p.x = flank[i][0]; p.z = car.z + flank[i][1];
      p.heading = Math.PI / 2; p.speed = 25;
    });
    hud.showMessage('LOSE THE HEAT!');
  } else {
    G.wanted = 1;
    ensurePolice();
    police.forEach((p) => { p.x = 6; p.z = car.z + 26; p.heading = Math.PI / 2; });
  }
  G.scripted = { fwd: 1, steer: 0, run: false };
  const steps = name === 'chase' ? 60 : 70;
  for (let i = 0; i < steps; i++) {
    // Autopilot: stay on road x=0 heading -z (heading PI/2), correct drift.
    G.scripted.steer = Math.max(-0.6, Math.min(0.6, -car.x * 0.08 + (car.heading - Math.PI / 2) * 0.8));
    stepGame(STEP);
    if (G.screen !== 'play') break;
  }
  G.scripted = null;
  hud.setCash(G.cash);
}

// --- Boot ------------------------------------------------------------------------------------------------
function runShot(name) {
  stageShot(name);
  let painted = 0;
  function paint() {
    renderer.render(scene, camera);
    painted += 1;
    if (painted < 3) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  // Attract mode behind the start screen: slow orbit over the plaza.
  let last = performance.now();
  let saveTimer = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (G.screen === 'start') {
      G.time += dt;
      G.camYaw += dt * 0.05;
      G.px = 0; G.pz = -30;
      updateTraffic(trafficCars, dt);
      updatePedestrians(peds, dt, G.time);
      updateCamera(dt);
      renderer.render(scene, camera);
      return;
    }
    if (G.screen !== 'play') { renderer.render(scene, camera); return; }
    stepGame(dt);
    saveTimer += dt;
    if (saveTimer > 15) { saveTimer = 0; saveGame(); }
    renderer.render(scene, camera);
  }
  // Continue button only shows when a save exists.
  if (!loadSave()) document.getElementById('continuebtn').style.display = 'none';
  updateCamera(0);
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
