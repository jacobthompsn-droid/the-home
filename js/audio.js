// Procedural ambience (no audio files): rain, wind, HVAC hum, fan whir, thunder.
export class Ambience {
  constructor() { this.ctx = null; this.muted = localStorage.getItem('thehome.muted') === '1'; }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const len = ctx.sampleRate * 3, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let b = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b = (b + 0.02 * w) / 1.02; d[i] = w * 0.5 + b * 3; }
    this.noise = buf;
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.8; this.master.connect(ctx.destination);
    const chan = (type, freq, q = 0.7) => {
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.playbackRate.value = 0.8 + Math.random() * 0.4;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(f).connect(g).connect(this.master); src.start();
      return { f, g };
    };
    this.rain = chan('highpass', 900); this.rainLow = chan('lowpass', 500);
    this.wind = chan('bandpass', 380, 1.2);
    this.hvac = chan('lowpass', 220); this.fan = chan('bandpass', 900, 0.6);
    this.windLfo = 0;
  }
  setMuted(m) { this.muted = m; localStorage.setItem('thehome.muted', m ? '1' : '0'); if (this.master) this.master.gain.value = m ? 0 : 0.8; }

  // levels 0..1; indoor muffles weather unless windows are open
  update({ rain = 0, wind = 0, hvac = 0, fan = 0, exposure = 1 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, k = 0.25;
    this.windLfo += 0.016;
    const muffle = 0.25 + 0.75 * exposure;
    this.rain.g.gain.setTargetAtTime(rain * 0.35 * muffle, t, k);
    this.rain.f.frequency.setTargetAtTime(600 + 1600 * exposure, t, k);
    this.rainLow.g.gain.setTargetAtTime(rain * 0.25, t, k);
    const gust = 0.7 + 0.3 * Math.sin(this.windLfo * 0.7) * Math.sin(this.windLfo * 0.23);
    this.wind.g.gain.setTargetAtTime(Math.min(1, wind) * 0.3 * muffle * gust, t, k);
    this.wind.f.frequency.setTargetAtTime(250 + wind * 500 * gust, t, k);
    this.hvac.g.gain.setTargetAtTime(hvac * 0.22, t, 0.6);
    this.fan.g.gain.setTargetAtTime(Math.min(fan, 1) * 0.06, t, 0.6);
  }

  // A named looping noise bed (water running, sizzling pan, steam...). level 0 = silent.
  loop(name, level, { type = 'bandpass', freq = 1200, q = 0.8, rate = 1 } = {}) {
    if (!this.ctx) return;
    this.loops ||= {};
    let L = this.loops[name];
    if (!L) {
      const src = this.ctx.createBufferSource(); src.buffer = this.noise; src.loop = true; src.playbackRate.value = rate;
      const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = this.ctx.createGain(); g.gain.value = 0;
      src.connect(f).connect(g).connect(this.master); src.start();
      L = this.loops[name] = { g, f };
    }
    L.g.gain.setTargetAtTime(level, this.ctx.currentTime, 0.2);
  }

  // Karplus–Strong plucked string — sounds like a real acoustic guitar.
  pluck(freq, when, gain = 0.22) {
    const ctx = this.ctx, sr = ctx.sampleRate;
    this.strings ||= new Map();
    const key = Math.round(freq * 10);
    let buf = this.strings.get(key);
    if (!buf) {
      const N = Math.max(2, Math.round(sr / freq)), len = Math.floor(sr * 2.2);
      buf = ctx.createBuffer(1, len, sr); const d = buf.getChannelData(0);
      for (let i = 0; i < N; i++) d[i] = Math.random() * 2 - 1;
      for (let i = N; i < len; i++) d[i] = 0.996 * 0.5 * (d[i - N] + d[i - N + 1]);
      this.strings.set(key, buf);
    }
    const src = ctx.createBufferSource(); src.buffer = buf;
    const g = ctx.createGain(); g.gain.value = gain;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 3200;
    src.connect(f).connect(g).connect(this.master); src.start(when);
  }
  // G – D – Em – C, a classic strum pattern. Returns the duration in seconds.
  playGuitar() {
    if (!this.ctx || this.muted) return 0;
    const chords = [[98, 123.47, 146.83, 196, 246.94, 392], [146.83, 220, 293.66, 369.99], [82.41, 123.47, 164.81, 196, 246.94, 329.63], [130.81, 164.81, 196, 261.63, 329.63]];
    const pattern = [[0, 1], [0.5, 1], [0.75, -1], [1.25, -1], [1.5, 1], [1.75, -1]]; // D D U U D U
    const t0 = this.ctx.currentTime + 0.05; let t = t0;
    for (let rep = 0; rep < 2; rep++) for (const ch of chords) {
      for (const [off, dir] of pattern) {
        const notes = dir > 0 ? ch : [...ch].reverse().slice(0, 4);
        notes.forEach((f, i) => this.pluck(f, t + off + i * 0.014, dir > 0 ? 0.2 : 0.13));
      }
      t += 2;
    }
    return t - t0;
  }
  // Simple 120 bpm dance beat (kick, hat, bass) for `seconds`.
  playBeat(seconds = 15) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t0 = ctx.currentTime + 0.05, bass = [55, 55, 65.4, 49];
    for (let i = 0; i < seconds * 4; i++) {
      const t = t0 + i * 0.25;
      if (i % 2 === 0) { // kick
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
        g.gain.setValueAtTime(0.7, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.3);
      }
      { // hat
        const src = ctx.createBufferSource(); src.buffer = this.noise; const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
        const g = ctx.createGain(); g.gain.setValueAtTime(i % 2 ? 0.12 : 0.05, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        src.connect(f).connect(g).connect(this.master); src.start(t, Math.random()); src.stop(t + 0.06);
      }
      if (i % 2 === 1) { // bass
        const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.value = bass[Math.floor(i / 8) % 4];
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400;
        g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        o.connect(f).connect(g).connect(this.master); o.start(t); o.stop(t + 0.24);
      }
    }
  }
  blip(freq = 880, dur = 0.08, gain = 0.15, type = 'square') {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq; g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  thud(gain = 0.4) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime, src = this.ctx.createBufferSource(); src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    src.connect(f).connect(g).connect(this.master); src.start(t, Math.random()); src.stop(t + 0.15);
  }

  thunder(dist = 0.5) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noise; src.playbackRate.value = 0.35;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 160 + (1 - dist) * 300;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1.3 * (1 - dist * 0.6), t + 0.08 + dist * 0.2);
    g.gain.exponentialRampToValueAtTime(0.001, t + 3.5 + dist * 2);
    src.connect(f).connect(g).connect(this.master); src.start(t); src.stop(t + 6);
  }
}
