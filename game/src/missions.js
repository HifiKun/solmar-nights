// The four-mission story: steps, markers, dialog and rewards. The mission
// manager only tracks state; main.js owns the world effects (wanted, cash).
import * as THREE from 'three';
import { MISSIONS } from './config.js';

export function createMissions(scene) {
  const markerMat = new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.75 });
  const markerGeo = new THREE.CylinderGeometry(2.2, 2.2, 0.4, 20);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.25 });
  const beamGeo = new THREE.CylinderGeometry(1.2, 1.2, 30, 12);
  const marker = new THREE.Mesh(markerGeo, markerMat);
  const beam = new THREE.Mesh(beamGeo, beamMat);
  marker.visible = false;
  beam.visible = false;
  scene.add(marker);
  scene.add(beam);

  const state = {
    index: 0,          // mission 0..3, 4 = story complete
    step: 0,           // step inside the mission
    started: false,
    done: false,
  };

  function current() { return MISSIONS[state.index] || null; }
  function currentStep() {
    const m = current();
    return m ? m.steps[state.step] : null;
  }
  function objectiveText() {
    if (state.done) return 'Story complete — free roam Solmar. New jobs soon, Ray.';
    const m = current();
    if (!m) return '';
    const s = currentStep();
    return `${m.title}: ${s ? s.text : ''}`;
  }
  function moveMarker() {
    const s = currentStep();
    if (!s || !s.target) { marker.visible = false; beam.visible = false; return; }
    marker.visible = true;
    beam.visible = true;
    marker.position.set(s.target[0], 0.3, s.target[2]);
    beam.position.set(s.target[0], 15, s.target[2]);
  }
  function startMission() {
    state.started = true;
    state.step = 0;
    moveMarker();
    return current();
  }
  function advanceStep() {
    state.step += 1;
    const m = current();
    if (state.step >= m.steps.length) {
      return 'mission-done';
    }
    moveMarker();
    return 'step';
  }
  function completeMission() {
    const m = current();
    state.index += 1;
    state.step = 0;
    if (state.index >= MISSIONS.length) {
      state.done = true;
      marker.visible = false;
      beam.visible = false;
      return m;
    }
    state.started = false;
    moveMarker();
    return m;
  }
  function pulse(time) {
    if (!marker.visible) return;
    const s = 1 + Math.sin(time * 4) * 0.15;
    marker.scale.set(s, 1, s);
    marker.rotation.y = time;
    beam.material.opacity = 0.2 + Math.sin(time * 4) * 0.08;
  }

  return { state, current, currentStep, objectiveText, startMission, advanceStep, completeMission, moveMarker, pulse, marker };
}
