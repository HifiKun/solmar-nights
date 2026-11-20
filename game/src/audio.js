// All sound is synthesized with WebAudio — no audio files, no network.
// Engine hum, police siren, gunshot, pickup chime and a simple synthwave loop.
export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let musicTimer = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let musicStep = 0;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      return true;
    } catch { return false; }
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol || 0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, vol, lowpass) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = lowpass || 1200;
    const g = ctx.createGain(); g.gain.value = vol || 0.25;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t);
  }

  // Synthwave bassline loop: A minor arpeggio, one note every 0.22 s.
  const BASS = [55, 55, 65.41, 55, 82.41, 55, 65.41, 49];
  const LEAD = [220, 261.63, 329.63, 440, 329.63, 261.63, 220, 196];

  function startMusic() {
    if (!ensure() || musicTimer) return;
    musicTimer = setInterval(() => {
      if (muted) return;
      const i = musicStep % 8;
      tone(BASS[i], 0.2, 'sawtooth', 0.05);
      if (musicStep % 2 === 0) tone(LEAD[i], 0.35, 'triangle', 0.04);
      if (musicStep % 8 === 0) noise(0.08, 0.05, 4000);
      musicStep += 1;
    }, 220);
  }

  function stopMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  }

  function startEngine() {
    if (!ensure() || engineOsc) return;
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 60;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0.0;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 500;
    engineOsc.connect(f); f.connect(engineGain); engineGain.connect(master);
    engineOsc.start();
  }

  function setEngine(speed01, on) {
    if (!engineOsc) return;
    const t = ctx.currentTime;
    engineGain.gain.setTargetAtTime(on && !muted ? 0.03 + speed01 * 0.05 : 0, t, 0.1);
    engineOsc.frequency.setTargetAtTime(55 + speed01 * 130, t, 0.1);
  }

  function startSiren() {
    if (!ensure() || sirenOsc) return;
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'sine';
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0.0;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.7;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 250;
    lfo.connect(lfoGain); lfoGain.connect(sirenOsc.frequency);
    sirenOsc.frequency.value = 800;
    sirenOsc.connect(sirenGain); sirenGain.connect(master);
    sirenOsc.start(); lfo.start();
  }

  function setSiren(on) {
    if (!sirenGain) return;
    sirenGain.gain.setTargetAtTime(on && !muted ? 0.035 : 0, ctx.currentTime, 0.2);
  }

  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); startMusic(); },
    setMuted(m) {
      muted = m;
      if (master) master.gain.value = m ? 0 : 0.5;
      return muted;
    },
    isMuted() { return muted; },
    shoot() { noise(0.12, 0.3, 3000); tone(180, 0.1, 'square', 0.12, 60); },
    pickup() { tone(660, 0.12, 'sine', 0.15); setTimeout(() => tone(990, 0.18, 'sine', 0.15), 90); },
    crash() { noise(0.25, 0.35, 800); },
    mission() { [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'triangle', 0.16), i * 110)); },
    busted() { [400, 350, 300, 220].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'sawtooth', 0.12), i * 160)); },
    startEngine, setEngine, startSiren, setSiren, startMusic, stopMusic,
  };
}
