// Items layer: turns design.items into scene objects, enforces gravity (nothing floats),
// and runs per-item behaviors (lights, spinning fans, TVs, swaying plants, curtains...).
import * as THREE from 'three';
import { buildModel } from './models.js';
import { rad } from './util.js';

const MAX_LIGHTS = 14;
const G = 9.81;

export class ItemsLayer {
  constructor(scene, library) {
    this.scene = scene; this.library = library;
    this.group = new THREE.Group(); this.group.name = 'items'; scene.add(this.group);
    this.entries = new Map();
    this.forced = new Map(); // sim activities can force devices on (e.g. TV during movie night)
    this.lightScale = 1;     // and dim the lights
    this.t = 0;
  }

  // ------------------------------------------------------------------ gravity / support
  static footprintContains(item, model, px, pz, pad = 0) {
    const r = rad(item.rot || 0), s = item.scale || [1, 1, 1];
    const dx = px - item.x, dz = pz - item.z;
    const lx = dx * Math.cos(r) - dz * Math.sin(r), lz = dx * Math.sin(r) + dz * Math.cos(r);
    return Math.abs(lx) <= model.size[0] * s[0] / 2 + pad && Math.abs(lz) <= model.size[2] * s[2] / 2 + pad;
  }

  // Where should this item rest? Returns { y, on } — `on` is the supporting item id (or null = floor/wall/ceiling).
  supportFor(item, items, apartment, exclude = new Set()) {
    const model = this.library.get(item.model);
    if (!model) return { y: item.y || 0, on: null };
    const H = apartment?.H ?? 2.8;
    const s = item.scale || [1, 1, 1];
    if (model.placement === 'ceiling') return { y: H, on: null };
    if (model.placement === 'wall') return { y: Math.max(0, Math.min(item.y ?? model.mountHeight ?? 1.4, H - model.size[1] * s[1])), on: null };
    let best = { y: 0, on: null };
    // rugs lift things a hair so they sit ON the rug
    for (const o of items) {
      if (o.id === item.id || exclude.has(o.id)) continue;
      const om = this.library.get(o.model);
      if (!om) continue;
      if (om.rug && !model.rug && ItemsLayer.footprintContains(o, om, item.x, item.z)) best.y = Math.max(best.y, 0.012);
    }
    if (model.placement !== 'surface' && !(model.physics?.body === 'dynamic')) return best;
    for (const o of items) {
      if (o.id === item.id || exclude.has(o.id) || o.on === item.id) continue;
      const om = this.library.get(o.model);
      if (!om || om.surface == null || om.rug) continue;
      if (!ItemsLayer.footprintContains(o, om, item.x, item.z)) continue;
      const top = (o.y || 0) + om.surface * (o.scale?.[1] || 1);
      if (top > best.y) best = { y: top, on: o.id };
    }
    return best;
  }

  // Re-settle every item so nothing floats. Mutates items (y & on). Returns ids whose y changed.
  settleAll(items, apartment) {
    const changed = [];
    const order = [...items].sort((a, b) => {
      const pa = this.library.get(a.model)?.placement === 'surface' ? 1 : 0, pb = this.library.get(b.model)?.placement === 'surface' ? 1 : 0;
      return pa - pb || (a.y || 0) - (b.y || 0);
    });
    for (let pass = 0; pass < 3; pass++) {
      for (const it of order) {
        const m = this.library.get(it.model);
        if (!m || m.physics?.body === 'dynamic') continue; // physics toys are dropped by the physics engine
        const { y, on } = this.supportFor(it, items, apartment);
        if (Math.abs((it.y ?? 0) - y) > 1e-4) { it.y = +y.toFixed(4); changed.push(it.id); }
        it.on = on || undefined;
      }
    }
    return changed;
  }

  // ------------------------------------------------------------------ scene sync
  sync(design, style, apartment) {
    this.style = style; this.apartment = apartment;
    const seen = new Set();
    let lightCount = 0;
    for (const item of design.items) {
      const model = this.library.get(item.model);
      if (!model) continue;
      seen.add(item.id);
      const key = JSON.stringify([item.model, style.id, item.tokens, item.parts, model.version, model.parts.length, model.size]);
      let e = this.entries.get(item.id), fresh = false;
      if (!e || e.key !== key) {
        if (e) { this.removeEntry(e); item._displayY = e.displayY; }
        e = this.createEntry(item, model, style, key);
        if (item._displayY != null) { e.displayY = item._displayY; delete item._displayY; } else fresh = true;
        this.entries.set(item.id, e);
      }
      e.item = item;
      this.place(e, fresh);
      for (const L of e.lights) { L.userData.allowed = lightCount < MAX_LIGHTS; L.visible = L.userData.allowed; lightCount++; }
    }
    for (const [id, e] of this.entries) if (!seen.has(id)) { this.removeEntry(e); this.entries.delete(id); }
  }

  createEntry(item, model, style, key) {
    const outer = new THREE.Group();
    const inner = buildModel(model, { style, tokens: item.tokens || {}, parts: item.parts || {}, seed: item.id });
    outer.add(inner);
    inner.traverse((o) => { if (o.isMesh && o.material.transparent) o.layers.set(1); });
    outer.userData = { kind: 'item', itemId: item.id };
    inner.traverse((o) => { o.userData.itemId = item.id; });
    const e = { item, model, outer, inner, key, lights: [], behaviors: model.behaviors || [], dynamic: model.physics?.body === 'dynamic', displayY: item.y ?? 0, vy: 0, spin: {} };
    // per-instance materials for screens & status lights so they animate independently
    for (const b of e.behaviors) {
      if ((b.type === 'screen' || b.type === 'status') && b.part) {
        for (const m of inner.userData.partMeshes.get(b.part) || []) {
          m.material = m.material.clone(); m.material.emissive = new THREE.Color(m.material.color); m.material.emissiveIntensity = 0;
          (e.instMats ||= []).push({ b, mat: m.material });
        }
      }
      if (b.type === 'light') {
        const L = new THREE.PointLight(style.pal.light || '#ffe2b8', 0, 9, 2);
        L.position.set(...b.at); L.userData.base = b.intensity ?? 1;
        inner.add(L); e.lights.push(L);
      }
    }
    this.group.add(outer);
    return e;
  }

  removeEntry(e) {
    this.group.remove(e.outer);
    e.inner.traverse((o) => { if (o.isMesh && o.geometry?.type === 'PlaneGeometry') o.geometry.dispose(); if (o.userData.glow || e.instMats) {} });
    e.removed = true;
  }

  place(e, instant) {
    const it = e.item, s = it.scale || [1, 1, 1];
    if (e.dynamic && e.body) return; // physics drives it
    e.outer.position.x = it.x; e.outer.position.z = it.z;
    e.outer.rotation.y = rad(it.rot || 0);
    e.outer.scale.set(s[0], s[1], s[2]);
    const target = it.y ?? 0;
    if (instant || target > e.displayY || e.model.placement === 'wall' || e.model.placement === 'ceiling') { e.displayY = target; e.vy = 0; }
    e.outer.position.y = e.displayY;
  }

  get(id) { return this.entries.get(id); }
  objects() { return [...this.entries.values()].map((e) => e.outer); }

  // Devices for the climate sim, in world space.
  devices() {
    const out = [];
    for (const e of this.entries.values()) {
      for (const b of e.behaviors) {
        if (b.type !== 'airflow') continue;
        e.outer.updateMatrixWorld();
        const pos = new THREE.Vector3(...b.at).applyMatrix4(e.outer.matrixWorld);
        const dir = new THREE.Vector3(...b.dir).transformDirection(e.outer.matrixWorld).normalize();
        out.push({ kind: b.kind, pos, dir, strength: b.strength ?? 2, range: b.range ?? 3, on: this.isOn(e), entry: e });
      }
    }
    return out;
  }

  isOn(e) { return this.forced.get(e.item.id) ?? e.item.state?.on ?? e.model.defaultOn ?? true; }

  // ------------------------------------------------------------------ per-frame
  update(dt, ctx) {
    this.t += dt;
    const { dark, autoLights, climate } = ctx;
    for (const e of this.entries.values()) {
      if (e.removed) continue;
      // gravity: items whose support vanished fall smoothly
      if (!e.dynamic && e.displayY > (e.item.y ?? 0) + 1e-4) {
        e.vy += G * dt; e.displayY = Math.max(e.item.y ?? 0, e.displayY - e.vy * dt);
        if (e.displayY === (e.item.y ?? 0)) e.vy = 0;
        e.outer.position.y = e.displayY;
      }
      const on = this.isOn(e);
      for (const b of e.behaviors) {
        const parts = b.part ? e.inner.userData.named.get(b.part) || [] : [];
        switch (b.type) {
          case 'light': {
            const lit = on && (!autoLights || dark > 0.35);
            for (const L of e.lights) L.intensity = lit && L.userData.allowed ? L.userData.base * 7 * this.lightScale : 0;
            for (const m of e.inner.userData.glowMats) m.emissiveIntensity = lit ? m.userData.glowMax : 0;
            break;
          }
          case 'spin': {
            const sp = (e.spin[b.part] ??= { v: 0 });
            sp.v += ((on ? b.speed : 0) - sp.v) * Math.min(1, dt * 0.8);
            for (const p of parts) p.rotation[b.axis || 'y'] += sp.v * dt;
            break;
          }
          case 'oscillate':
            if (on) for (const p of parts) p.rotation[b.axis || 'y'] = Math.sin(this.t * (b.speed || 0.5)) * rad(b.amount || 30);
            break;
          case 'screen':
            for (const { b: bb, mat } of e.instMats || []) if (bb === b) {
              if (on) { const h = (Math.sin(this.t * 0.7) * 0.5 + 0.5) * 0.6 + 0.5; mat.emissive.setHSL(h % 1, 0.5, 0.45 + Math.sin(this.t * 9) * 0.03); mat.emissiveIntensity = 1.4; }
              else mat.emissiveIntensity = 0;
            }
            break;
          case 'status':
            for (const { b: bb, mat } of e.instMats || []) if (bb === b) {
              const mode = climate?.hvacMode;
              const kind = e.behaviors.find((x) => x.type === 'airflow')?.kind;
              const active = on && climate && ((kind === 'ac' && mode) || (kind === 'heater' && mode === 'heat'));
              mat.emissive.set(kind === 'heater' ? '#ff5a1f' : mode === 'heat' ? '#ff8a3d' : '#3fa9ff');
              mat.emissiveIntensity = active ? (kind === 'heater' ? 2.2 : 3) : on ? 0.3 : 0;
            }
            break;
          case 'sway': {
            const air = climate ? climate.airAt(e.outer.position.clone().setY(1.2)).length() : 0;
            const amp = (b.amount || 1) * (0.012 + Math.min(air, 3) * 0.05);
            const droop = e.droop || 0; // thirsty plants sag (set by the sim)
            for (const p of parts) { p.rotation.z = Math.sin(this.t * 2.1 + e.item.x) * amp + droop * 0.18; p.rotation.x = Math.cos(this.t * 1.7 + e.item.z) * amp * 0.7 + droop * 0.32; }
            break;
          }
          case 'cloth': {
            const air = climate ? climate.airAt(e.outer.position.clone().setY(1.2)).length() : 0;
            for (const p of parts) {
              const g = p.geometry, base = g.userData.base; if (!base) continue;
              const pos = g.attributes.position, hh = g.parameters.height;
              const amp = 0.01 + Math.min(air, 3) * 0.06;
              for (let i = 0; i < pos.count; i++) {
                const y = base[i * 3 + 1], k = (hh / 2 - y) / hh; // 0 at top, 1 at bottom
                pos.setZ(i, base[i * 3 + 2] + Math.sin(this.t * 3 + y * 2.5 + base[i * 3] * 4) * amp * k * k + amp * 1.5 * k * k);
              }
              pos.needsUpdate = true;
            }
            break;
          }
        }
      }
    }
  }
}
