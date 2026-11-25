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
