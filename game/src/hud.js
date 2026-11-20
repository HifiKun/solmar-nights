// HUD, minimap, dialogs and screens. All DOM reads/writes live here so
// main.js stays about simulation, not element ids.
import { ROAD_COORDS } from './world.js';

const $ = (id) => document.getElementById(id);

export function createHud() {
  const els = {
    hud: $('hud'), cash: $('cash'), missionCount: $('missioncount'),
    wanted: $('wanted'), healthFill: $('healthfill'), ammo: $('ammo'),
    msg: $('msg'), objText: $('objtext'), speed: $('speed'),
    minimap: $('minimap'), dialog: $('dialog'), dlgWho: $('dlgwho'),
    dlgText: $('dlgtext'), dlgHint: $('dlghint'),
    interact: $('interact'), crosshair: $('crosshair'),
    start: $('start'), pause: $('pause'), end: $('end'),
    busted: $('busted'), endText: $('endtext'), endStats: $('endstats'),
    pauseStats: $('pausestats'), mute: $('mute'),
  };
  const mm = els.minimap.getContext('2d');
  let msgTimer = null;
  let dialogTimer = null;

  function show(el) { el.classList.remove('hidden'); }
  function hide(el) { el.classList.add('hidden'); }

  function setCash(cash) {
    els.cash.childNodes[0].nodeValue = `$${Math.floor(cash).toLocaleString('en-US')}`;
  }
  function setMissionCount(index, total) {
    els.missionCount.textContent = index >= total ? 'Story complete' : `Mission ${index + 1} / ${total}`;
  }
  function setWanted(n) {
    let s = '';
    for (let i = 0; i < 5; i++) s += `<span class="${i < n ? 'on' : 'off'}">★</span>`;
    els.wanted.innerHTML = s;
  }
  function setHealth(h, max) {
    const pct = Math.max(0, Math.min(100, (h / max) * 100));
    els.healthFill.style.width = `${pct}%`;
    els.healthFill.style.background = pct > 50 ? 'linear-gradient(90deg,#37d67a,#a8e063)' : pct > 25 ? 'linear-gradient(90deg,#e8a83a,#ffd23e)' : 'linear-gradient(90deg,#e83a3a,#ff7a5c)';
  }
  function setAmmo(n) { els.ammo.textContent = `Ammo ${n}`; }
  function setObjective(text) { els.objText.textContent = text; }
  function setSpeed(kmh, driving) {
    els.speed.textContent = driving ? `${Math.round(kmh)} km/h` : '';
  }
  function showMessage(text, ms) {
    els.msg.textContent = text;
    if (msgTimer) clearTimeout(msgTimer);
    msgTimer = setTimeout(() => { els.msg.textContent = ''; }, ms || 3000);
  }
  function showDialog(who, text, hint, ms) {
    els.dlgWho.textContent = `${who}:`;
    els.dlgText.textContent = ` “${text}”`;
    els.dlgHint.textContent = hint || 'Press any key to continue';
    show(els.dialog);
    if (dialogTimer) clearTimeout(dialogTimer);
    dialogTimer = setTimeout(() => hide(els.dialog), ms || 7000);
  }
  function hideDialog() { hide(els.dialog); if (dialogTimer) clearTimeout(dialogTimer); }
  function setInteract(text) {
    if (text) { els.interact.innerHTML = text; show(els.interact); }
    else hide(els.interact);
  }

  // Top-down minimap: roads, sea, player, cars, police, mission marker.
  function drawMinimap(world, player, cars, police, peds, markerPos) {
    const W = 190;
    const R = 88; // world half 180 -> radius 88 px
    const toMap = (x, z) => [95 + (x / 180) * R, 95 + (z / 180) * R];
    mm.clearRect(0, 0, W, W);
    mm.fillStyle = '#1c2f22';
    mm.fillRect(0, 0, W, W);
    // Sea on the east.
    mm.fillStyle = '#2a7fb8';
    mm.fillRect(95 + (150 / 180) * R, 0, W, W);
    mm.fillStyle = '#e8d29a';
    mm.fillRect(95 + (148 / 180) * R, 0, 4, W);
    // Roads.
    mm.strokeStyle = '#3a3d44';
    mm.lineWidth = 7;
    for (const c of ROAD_COORDS) {
      const [x1] = toMap(c, 0);
      mm.beginPath(); mm.moveTo(x1, 4); mm.lineTo(x1, W - 4); mm.stroke();
      const [, z1] = toMap(0, c);
      mm.beginPath(); mm.moveTo(4, z1); mm.lineTo(W - 4, z1); mm.stroke();
    }
    const dot = (x, z, color, r) => {
      const [mx, mz] = toMap(x, z);
      mm.fillStyle = color;
      mm.beginPath(); mm.arc(mx, mz, r, 0, Math.PI * 2); mm.fill();
    };
    if (markerPos) dot(markerPos.x, markerPos.z, '#ffd23e', 6);
    for (const p of peds) if (p.alive) dot(p.x, p.z, '#c8c8c8', 1.5);
    for (const c of cars) dot(c.x, c.z, '#7dd8ff', 2.5);
    for (const p of police) dot(p.x, p.z, '#ff4040', 3.5);
    // Player arrow.
    const [px, pz] = toMap(player.x, player.z);
    mm.save();
    mm.translate(px, pz);
    mm.rotate(-player.heading + Math.PI / 2);
    mm.fillStyle = '#ffffff';
    mm.strokeStyle = '#000';
    mm.beginPath(); mm.moveTo(0, -7); mm.lineTo(5, 6); mm.lineTo(-5, 6); mm.closePath();
    mm.fill(); mm.stroke();
    mm.restore();
    // North marker.
    mm.fillStyle = '#fff';
    mm.font = 'bold 11px Verdana';
    mm.fillText('N', 91, 12);
  }

  return {
    els, show, hide, setCash, setMissionCount, setWanted, setHealth, setAmmo,
    setObjective, setSpeed, showMessage, showDialog, hideDialog, setInteract, drawMinimap,
  };
}
