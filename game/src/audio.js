// Sound, all synthesised with WebAudio — no audio files. Engine hum follows the
// car's speed, sirens wail when the heat is on, and a soft synth pad loops a
// four-chord progression under the city. Everything starts on the first click.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let musicGain = null;
  let musicTimer = null;
  let muted = false;
  let started = false;

  const CHORDS = [
    [130.81, 164.81, 196.0], // Cmaj
    [98.0, 123.47, 146.83], // G
    [110.0, 130.81, 164.81], // Am
    [87.31, 110.0, 130.81], // F
  ];
  // Radio stations: three synth flavours for the drive.
  const STATIONS = [
    { name: 'Neon FM', chords: CHORDS, tempo: 4000, tracks: ['Midnight Drive', 'Pink Horizon', 'Chrome Sunset'] },
    { name: 'Bay 88', chords: [[116.54, 138.59, 174.61], [103.83, 123.47, 155.56], [110.0, 130.81, 164.81], [98.0, 116.54, 146.83]], tempo: 4600, tracks: ['Coral Static', 'Low Tide', 'Harbor Lights'] },
    { name: 'Drive Time', chords: [[146.83, 185.0, 220.0], [164.81, 207.65, 246.94], [130.81, 164.81, 196.0], [174.61, 220.0, 261.63]], tempo: 3200, tracks: ['Full Throttle', 'Neon Rain', 'Last Exit'] },
  ];
  let station = 0;
  let track = 0;
  let trackTimer = 0;

  function ensure() {
    if (started) return;
    started = true;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.55;
    master.connect(ctx.destination);
    // Engine: two detuned saws through a low-pass.
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    engineOsc2 = ctx.createOscillator();
    engineOsc2.type = 'sawtooth';
    engineOsc2.frequency.value = 82;
    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineFilter);
    engineOsc2.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();
    engineOsc2.start();
    // Siren: a sine that alternates between two notes.
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'triangle';
    sirenOsc.frequency.value = 700;
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain);
    sirenGain.connect(master);
    sirenOsc.start();
    let hi = false;
    setInterval(() => {
      if (sirenOsc) sirenOsc.frequency.setTargetAtTime(hi ? 950 : 700, ctx.currentTime, 0.05);
      hi = !hi;
    }, 420);
    // Music pad.
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.05;
    musicGain.connect(master);
    let chord = 0;
    const playChord = () => {
      if (!ctx) return;
      const st = STATIONS[station];
      const notes = st.chords[chord % st.chords.length];
      chord += 1;
      for (const f of notes) {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = f;
        const gn = ctx.createGain();
        gn.gain.setValueAtTime(0, ctx.currentTime);
        gn.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 1.2);
        gn.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 3.9);
        o.connect(gn);
        gn.connect(musicGain);
        o.start();
        o.stop(ctx.currentTime + 4);
      }
    };
    playChord();
    musicTimer = setInterval(playChord, 4000);
  }

  function noiseBurst(duration, filterFreq, gainValue) {
    if (!ctx) return;
    const len = Math.floor(ctx.sampleRate * duration);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gn = ctx.createGain();
    gn.gain.value = gainValue;
    src.connect(filter);
    filter.connect(gn);
    gn.connect(master);
    src.start();
  }

  function tone(freq, duration, type, gainValue, slideTo) {
    if (!ctx) return;
    const o = ctx.createOscillator();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + duration);
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(gainValue, ctx.currentTime);
    gn.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    o.connect(gn);
    gn.connect(master);
    o.start();
    o.stop(ctx.currentTime + duration + 0.05);
  }

  return {
    unlock: ensure,
    get ready() {
      return started;
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.55;
      return muted;
    },
    setEngine(speed, driving) {
      if (!ctx || !engineGain) return;
      const target = driving ? 0.05 + Math.min(0.16, Math.abs(speed) * 0.004) : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
      const f = 52 + Math.abs(speed) * 3.2;
      engineOsc.frequency.setTargetAtTime(f, ctx.currentTime, 0.08);
      engineOsc2.frequency.setTargetAtTime(f * 1.5, ctx.currentTime, 0.08);
      engineFilter.frequency.setTargetAtTime(380 + Math.abs(speed) * 22, ctx.currentTime, 0.1);
    },
    setSiren(on) {
      if (!ctx || !sirenGain) return;
      sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, ctx.currentTime, 0.2);
    },
    engineStart() {
      ensure();
      tone(90, 0.5, 'sawtooth', 0.12, 160);
    },
    engineStop() {
      this.setEngine(0, false);
    },
    gunshot() {
      noiseBurst(0.14, 1800, 0.5);
      tone(160, 0.1, 'square', 0.2, 60);
    },
    weaponSound(name) {
      if (name === 'shotgun') {
        noiseBurst(0.3, 900, 0.65);
        tone(110, 0.22, 'square', 0.3, 45);
      } else if (name === 'smg') {
        noiseBurst(0.07, 2400, 0.35);
        tone(220, 0.05, 'square', 0.14, 90);
      } else if (name === 'rifle') {
        noiseBurst(0.2, 2600, 0.55);
        tone(200, 0.16, 'sawtooth', 0.22, 50);
        setTimeout(() => noiseBurst(0.12, 1200, 0.15), 120);
      } else if (name === 'bat') {
        noiseBurst(0.12, 700, 0.3);
        tone(140, 0.12, 'sine', 0.25, 70);
      } else if (name === 'pistol') {
        this.gunshot();
      } else {
        this.punch();
      }
    },
    nextStation() {
      station = (station + 1) % STATIONS.length;
      track = 0;
      trackTimer = 0;
      return STATIONS[station].name;
    },
    stationName() {
      return STATIONS[station].name;
    },
    trackName() {
      return STATIONS[station].tracks[track];
    },
    // Rotate the on-air track every ~28 s so the HUD radio display moves.
    tick(dt) {
      trackTimer += dt;
      if (trackTimer >= 28) {
        trackTimer = 0;
        track = (track + 1) % STATIONS[station].tracks.length;
      }
    },
    punch() {
      noiseBurst(0.08, 500, 0.35);
    },
    thud() {
      noiseBurst(0.18, 300, 0.4);
      tone(70, 0.18, 'sine', 0.3, 40);
    },
    click() {
      tone(1200, 0.05, 'square', 0.08);
    },
    reload() {
      tone(500, 0.08, 'square', 0.1);
      setTimeout(() => tone(700, 0.08, 'square', 0.1), 350);
    },
    blip() {
      tone(880, 0.12, 'sine', 0.18);
      setTimeout(() => tone(1320, 0.16, 'sine', 0.18), 120);
    },
    sirenBlip() {
      tone(950, 0.18, 'triangle', 0.14, 700);
    },
    missionStart() {
      [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'triangle', 0.2), i * 130));
    },
    missionComplete() {
      [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'triangle', 0.22), i * 140));
    },
    missionFail() {
      [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'sawtooth', 0.12), i * 160));
    },
  };
}
