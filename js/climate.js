// Indoor climate: thermostat + AC/heat, fans, open windows letting the wind in,
// visible airflow particles and a thermal heat-map on the floor.
import * as THREE from 'three';
import { clamp, lerp, fxLayer } from './util.js';
import { spriteTexture } from './textures.js';

const N = 1600;

export class Climate {
  constructor(scene) {
    this.scene = scene;
    this.Tin = 71; this.Hin = 45; this.hvacMode = null; this.sources = [];
    this.showAir = true; this.showHeat = false;
    // particles
    this.pos = new Float32Array(N * 3); this.col = new Float32Array(N * 3);
    this.vel = new Float32Array(N * 3); this.life = new Float32Array(N);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.035, map: spriteTexture('dot'), vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.points.frustumCulled = false; scene.add(fxLayer(this.points));
    this.cursor = 0; this.heatTimer = 0;
  }

  setApartment(apt) {
    this.apt = apt;
    if (this.heat) { this.scene.remove(this.heat); this.heat.geometry.dispose(); }
    const b = apt.bounds, w = b.maxX - b.minX, d = b.maxZ - b.minZ;
    this.hw = 128; this.hh = Math.max(8, Math.round(128 * d / w));
    this.canvas = document.createElement('canvas'); this.canvas.width = this.hw; this.canvas.height = this.hh;
    this.ctx = this.canvas.getContext('2d'); this.img = this.ctx.createImageData(this.hw, this.hh);
    this.heatTex = new THREE.CanvasTexture(this.canvas); this.heatTex.colorSpace = THREE.SRGBColorSpace; this.heatTex.magFilter = THREE.LinearFilter;
    this.heat = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: this.heatTex, transparent: true, depthWrite: false, opacity: 0.85 }));
    this.heat.rotation.x = -Math.PI / 2; this.heat.position.set(b.minX + w / 2, 0.03, b.minZ + d / 2); this.heat.renderOrder = 2;
    this.heat.visible = this.showHeat; this.scene.add(fxLayer(this.heat));
  }

  // Gather everything that moves air: devices from items + open windows/doors.
  setSources(devices, env, envState) {
    const src = [];
    const wind = envState.windVec;
    for (const d of devices) {
      let active = d.on, temp = 0;
      if (d.kind === 'ac') { active = d.on && !!this.hvacMode; temp = this.hvacMode === 'heat' ? 14 : -12; }
      if (d.kind === 'heater') { active = d.on && this.hvacMode === 'heat'; temp = 16; }
      if (d.kind === 'fan') temp = -1.5;
      if (active) src.push({ kind: d.kind, pos: d.pos, dir: d.dir, strength: d.strength, range: d.range, temp });
    }
    if (this.apt) for (const o of this.apt.openings) {
      if (o.open < 0.2 || o.type === 'opening' || !o.wall.ext) continue;
      const inward = o.wall.normal.clone().negate();
      const blow = wind.dot(inward) / (wind.length() + 0.001);
      const ws = wind.length();
      const strength = (0.25 + Math.max(0, blow) * ws * 0.35) * o.open * (o.type === 'window' ? 0.6 : 1);
      const pos = o.center.clone(); if (o.type !== 'window') pos.y = 1.1; else pos.y = Math.min(pos.y + 0.3, o.head - 0.2);
      src.push({ kind: 'window', pos, dir: blow > -0.2 ? inward.clone().addScaledVector(wind, 0.03).normalize() : inward.clone().negate(), strength: blow > -0.2 ? strength : 0.3, range: 3.5 + ws * 0.15, temp: (this.Tout ?? 70) - this.Tin, width: o.width });
    }
    this.sources = src;
  }

  airAt(p) {
    const v = new THREE.Vector3();
    for (const s of this.sources) {
      const d = p.clone().sub(s.pos), along = d.dot(s.dir);
      if (along < -0.2 || along > s.range) continue;
      const lat = d.clone().addScaledVector(s.dir, -along).length();
      const spread = 0.25 + Math.max(along, 0) * 0.35 + (s.width || 0) * 0.3;
      const f = Math.exp(-(lat * lat) / (2 * spread * spread)) * (1 - Math.max(along, 0) / s.range);
      v.addScaledVector(s.dir, s.strength * f);
    }
    return v;
  }

  tempAt(x, z) {
    let t = this.Tin;
    for (const s of this.sources) {
      const dx = x - s.pos.x, dz = z - s.pos.z;
      const sig = s.kind === 'window' ? 1.8 : s.kind === 'ac' ? 2.4 : 1.4;
      const amt = s.kind === 'window' ? s.temp * 0.6 : s.temp * 0.55;
      // bias the plume in the blowing direction
      const ox = dx - s.dir.x * 1.2, oz = dz - s.dir.z * 1.2;
      t += amt * Math.exp(-(ox * ox + oz * oz) / (2 * sig * sig));
    }
    return t;
  }

  update(dt, ctx) {
    const { design, envState, outdoorTemp, daylight } = ctx;
    const th = design.climate || (design.climate = { mode: 'auto', set: 71 });
    this.Tout = outdoorTemp;
    const hours = dt / 30; // 1 real second ≈ 2 sim minutes
    // thermostat with hysteresis
    const set = th.set;
    const wantCool = th.mode === 'cool' || th.mode === 'auto', wantHeat = th.mode === 'heat' || th.mode === 'auto';
    if (this.hvacMode === 'cool' && this.Tin < set - 0.6) this.hvacMode = null;
    if (this.hvacMode === 'heat' && this.Tin > set + 0.6) this.hvacMode = null;
    if (!this.hvacMode && wantCool && this.Tin > set + 0.8) this.hvacMode = 'cool';
    if (!this.hvacMode && wantHeat && this.Tin < set - 0.8) this.hvacMode = 'heat';
    if (th.mode === 'off' || (this.hvacMode === 'cool' && !wantCool) || (this.hvacMode === 'heat' && !wantHeat)) this.hvacMode = null;
    const acUnits = ctx.devices.filter((d) => d.kind === 'ac' && d.on).length;
    const heaters = ctx.devices.filter((d) => d.kind === 'heater' && d.on).length;
    const openArea = (this.apt?.openings || []).filter((o) => o.wall.ext && o.type !== 'opening').reduce((a, o) => a + o.open * o.width * (o.type === 'window' ? 0.5 : 1), 0);
    let dT = 0.18 * (this.Tout - this.Tin) + openArea * 0.35 * (1 + envState.windSpeed / 8) * (this.Tout - this.Tin) + 1.6 * daylight * (1 - envState.state.cloud) + 0.4;
    if (this.hvacMode === 'cool') dT -= acUnits ? 5 + acUnits * 4 : 8;
    if (this.hvacMode === 'heat') dT += (acUnits ? 5 + acUnits * 4 : 8) + heaters * 5;
    this.Tin = clamp(this.Tin + dT * hours, -10, 120);
    const Hout = { rain: 90, storm: 95, fog: 97, snow: 80, cloudy: 65 }[design.env.weather] || 50;
    let dH = 0.3 * (Hout - this.Hin) + openArea * 0.6 * (Hout - this.Hin);
    if (this.hvacMode === 'cool') dH -= 6;
    this.Hin = clamp(this.Hin + dH * hours, 15, 98);
    this.Hout = Hout;
    this.setSources(ctx.devices, design.env, envState);
    this.updateParticles(dt);
    this.heatTimer -= dt;
    if (this.showHeat && this.heatTimer <= 0) { this.heatTimer = 0.35; this.drawHeat(); }
    if (this.heat) this.heat.visible = this.showHeat;
  }

  feelsLike(p) {
    const air = this.airAt(p).length();
    const t = this.tempAt(p.x, p.z);
    return t - Math.min(air, 4) * 1.8 + (this.Hin > 60 && t > 75 ? (this.Hin - 60) * 0.12 : 0);
  }

  updateParticles(dt) {
    this.points.visible = this.showAir;
    const { pos, vel, life, col } = this;
    if (this.showAir) {
      for (const s of this.sources) {
        const rate = s.strength * (s.kind === 'window' ? 30 * (s.width || 1) : 26) * dt;
        let n = Math.floor(rate) + (Math.random() < rate % 1 ? 1 : 0);
        while (n-- > 0) {
          const i = this.cursor = (this.cursor + 1) % N;
          const jit = s.kind === 'window' ? (s.width || 1) * 0.45 : 0.12;
          const side = new THREE.Vector3(-s.dir.z, 0, s.dir.x).normalize();
          pos[i * 3] = s.pos.x + side.x * (Math.random() - 0.5) * 2 * jit; pos[i * 3 + 1] = s.pos.y + (Math.random() - 0.5) * (s.kind === 'window' ? 0.8 : 0.1); pos[i * 3 + 2] = s.pos.z + side.z * (Math.random() - 0.5) * 2 * jit;
          const sp = s.strength * (0.6 + Math.random() * 0.5);
          vel[i * 3] = s.dir.x * sp + (Math.random() - 0.5) * 0.3; vel[i * 3 + 1] = s.dir.y * sp + (Math.random() - 0.5) * 0.2; vel[i * 3 + 2] = s.dir.z * sp + (Math.random() - 0.5) * 0.3;
          if (s.kind === 'fan' && s.dir.y < -0.5) { const a = Math.random() * Math.PI * 2, r = 0.2 + Math.random() * 0.5; pos[i * 3] += Math.cos(a) * r; pos[i * 3 + 2] += Math.sin(a) * r; }
          life[i] = 1.4 + Math.random() * 1.2;
          const c = s.temp < -2 ? [0.35, 0.7, 1] : s.temp > 2 ? [1, 0.55, 0.25] : [0.85, 0.9, 0.95];
          col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
        }
      }
    }
    for (let i = 0; i < N; i++) {
      if (life[i] <= 0) { pos[i * 3 + 1] = -999; continue; }
      life[i] -= dt;
      const o = i * 3;
      vel[o] *= 1 - dt * 0.6; vel[o + 1] *= 1 - dt * 0.6; vel[o + 2] *= 1 - dt * 0.6;
      // warm rises, cold sinks
      vel[o + 1] += (col[o] > col[o + 2] + 0.2 ? 0.25 : col[o + 2] > col[o] + 0.2 ? -0.2 : 0) * dt;
      pos[o] += vel[o] * dt; pos[o + 1] += vel[o + 1] * dt; pos[o + 2] += vel[o + 2] * dt;
      if (pos[o + 1] < 0.02) { pos[o + 1] = 0.02; vel[o + 1] *= -0.3; vel[o] *= 1.2; vel[o + 2] *= 1.2; }
      if (this.apt && (pos[o + 1] > this.apt.H - 0.05 || !this.apt.isInside(pos[o], pos[o + 2]))) life[i] = Math.min(life[i], 0.15);
    }
    this.points.geometry.attributes.position.needsUpdate = true; this.points.geometry.attributes.color.needsUpdate = true;
  }

  drawHeat() {
    const b = this.apt.bounds, w = b.maxX - b.minX, d = b.maxZ - b.minZ, data = this.img.data;
    for (let j = 0; j < this.hh; j++) for (let i = 0; i < this.hw; i++) {
      const x = b.minX + (i + 0.5) / this.hw * w, z = b.minZ + (j + 0.5) / this.hh * d, k = (j * this.hw + i) * 4;
      if (!this.apt.isIndoor(x, z)) { data[k + 3] = 0; continue; }
      const t = this.tempAt(x, z);
      const u = clamp((t - 60) / 25, 0, 1); // 60°F blue → 85°F red
      const c = new THREE.Color().setHSL(lerp(0.66, 0.0, u), 0.85, 0.5);
      data[k] = c.r * 255; data[k + 1] = c.g * 255; data[k + 2] = c.b * 255; data[k + 3] = 150;
    }
    this.ctx.putImageData(this.img, 0, 0); this.heatTex.needsUpdate = true;
  }
}
