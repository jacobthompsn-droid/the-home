// The Home — life sim layer.
// Real-time needs (plants dry out over days, dishes pile up, laundry fills, the bed gets messy),
// household mood meters, activities you do together, mini-games, and a memory journal.
// State lives in design.sim so it syncs through GitHub / live sessions like everything else.
import * as THREE from 'three';
import { clamp, rad, uid, fxLayer } from './util.js';
import { spriteTexture } from './textures.js';
import { HeartCatch } from './minigames.js';

const DAY = 86400000;
const DECAY = { fun: 0.35, cozy: 0.25, together: 0.3 }; // lost per day
const THIRST_DAYS = { 'plant-fiddle': 4, 'plant-small': 3, 'snake-plant': 9 };
const BROWN = new THREE.Color('#8b6a2e');
const LS_THUMBS = 'thehome.memoryThumbs';

export const METERS = [
  { id: 'plants', icon: '🌿', name: 'Plants' },
  { id: 'tidy', icon: '🧽', name: 'Tidy' },
  { id: 'fun', icon: '🎉', name: 'Fun' },
  { id: 'cozy', icon: '🛋️', name: 'Cozy' },
  { id: 'together', icon: '💞', name: 'Together' },
];

export const ACTIVITIES = [
  { id: 'movie', name: 'Movie night', icon: '🍿', models: ['tv-console', 'sofa-3seat', 'sectional-l', 'loveseat'], dur: 22, mood: { fun: 0.25, cozy: 0.2, together: 0.15 }, seat: true, blurb: 'Lights down, TV on, cuddle up.' },
  { id: 'dance', name: 'Dance party', icon: '🪩', models: ['tv-console', 'arcade-cabinet'], dur: 16, mood: { fun: 0.3, together: 0.1 }, blurb: 'Disco lights and a beat.' },
  { id: 'cook', name: 'Cook dinner', icon: '🍳', models: ['stove-range'], dur: 14, mood: { cozy: 0.15, fun: 0.05 }, blurb: 'Something sizzling. Makes dishes.' },
  { id: 'dinner', name: 'Candlelit dinner', icon: '🕯️', models: ['dining-table', 'round-table'], dur: 16, mood: { together: 0.35, cozy: 0.15 }, seat: true, blurb: 'Date night at home.' },
  { id: 'darts', name: 'Darts', icon: '🎯', models: ['dartboard'], game: 'darts', mood: { fun: 0.2 }, stand: 2.37, blurb: '3 darts — aim with the crosshair, click to throw.' },
  { id: 'pool', name: 'Pool break', icon: '🎱', models: ['pool-table'], dur: 9, mood: { fun: 0.2 }, stand: 1.1, blurb: 'Break the rack.' },
  { id: 'arcade', name: 'Heart Catch', icon: '🕹️', models: ['arcade-cabinet'], game: 'arcade', mood: { fun: 0.25 }, blurb: '30-second arcade game. Beat your high score.' },
  { id: 'guitar', name: 'Play guitar', icon: '🎸', models: ['guitar-stand'], dur: 16, mood: { fun: 0.15, cozy: 0.15 }, blurb: 'G · D · Em · C' },
  { id: 'read', name: 'Read a book', icon: '📚', models: ['armchair', 'scallop-accent-chair', 'bookshelf', 'sofa-3seat', 'loveseat'], dur: 14, mood: { cozy: 0.25 }, seat: true, blurb: 'A quiet chapter.' },
  { id: 'coffee', name: 'Coffee outside', icon: '☕', models: ['patio-set', 'sun-lounger'], dur: 14, mood: { cozy: 0.2, together: 0.1 }, seat: true, skipHours: 0.5, blurb: 'Watch the weather roll by.' },
  { id: 'soak', name: 'Hot tub soak', icon: '♨️', models: ['hot-tub'], dur: 14, mood: { cozy: 0.3, together: 0.15 }, blurb: 'Steam rising into the night.' },
  { id: 'bath', name: 'Bubble bath', icon: '🛁', models: ['bathtub', 'shower'], dur: 12, mood: { cozy: 0.25 }, blurb: 'Warm water, zero emails.' },
  { id: 'sleep', name: 'Sleep till morning', icon: '😴', models: ['bed-queen', 'bed-king'], dur: 4.5, mood: { cozy: 0.2 }, blurb: 'Skip to 7 AM. The bed will need making.' },
];
export const CHORES = {
  water: { name: 'Water', icon: '💧', dur: 1.8 },
  dishes: { name: 'Wash the dishes', icon: '🍽️', models: ['kitchen-sink'], dur: 6 },
  laundry: { name: 'Do the laundry', icon: '🧺', models: ['washer', 'dryer'], dur: 7 },
  bed: { name: 'Make the bed', icon: '🛏️', models: ['bed-queen', 'bed-king'], dur: 3 },
};

export class Sim extends EventTarget {
  constructor(app) {
    super();
    this.app = app;
    this.active = null; this.visualT = 0;
    this.fx = new THREE.Group(); this.fx.name = 'sim-fx'; app.scene.add(this.fx);
    this.props = new THREE.Group(); this.props.name = 'sim-props'; app.scene.add(this.props);
    // particle pool (steam, water droplets, sparkles)
    const N = this.N = 700;
    this.pp = new Float32Array(N * 3); this.pv = new Float32Array(N * 3); this.pl = new Float32Array(N); this.pg = new Float32Array(N); this.pc = new Float32Array(N * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pp, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.pc, 3));
    this.particles = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.06, map: spriteTexture('dot'), vertexColors: true, transparent: true, opacity: 0.7, depthWrite: false }));
    this.particles.frustumCulled = false; this.fx.add(this.particles); this.pcur = 0;
    for (let i = 0; i < N; i++) this.pp[i * 3 + 1] = -999;
    fxLayer(this.fx);
    this.emitters = [];
    this.arcade = new HeartCatch(app);
    app.cameras.onMoveAttempt = () => { if (this.active?.def.seat || (this.active && !this.active.def.game)) this.cancel('You got up.'); };
  }

  get d() { return this.app.design; }
  get s() { return ensure(this.d); }
  get pace() { return this.s.pace || 1; }
  now() { return Date.now(); }
  elapsedDays(t) { return Math.max(0, (this.now() - (t || this.now())) / DAY) * this.pace; }

  // ------------------------------------------------------------------ state readers
  entries() { return [...this.app.items.entries.values()].filter((e) => !e.removed); }
  isPlant(e) { return (e.model.tags || []).includes('plant'); }
  water(e) {
    const t = this.s.plants[e.item.id];
    if (t == null) return 1;
    return clamp(1 - this.elapsedDays(t) / (THIRST_DAYS[e.model.id] || e.model.thirstDays || 5), 0, 1);
  }
  plants() { return this.entries().filter((e) => this.isPlant(e)).map((e) => ({ e, water: this.water(e) })); }
  dishes() { const c = this.s.chores.dishes; return Math.min(8, Math.floor((c.n || 0) + this.elapsedDays(c.t) * 1.2)); }
  laundry() { return clamp(this.elapsedDays(this.s.chores.laundry.t) / 5, 0, 1); }
  bedMessy() { const b = this.s.chores.bed; return !!b.messy || this.elapsedDays(b.t) > 1.2; }
  has(models) { return this.entries().find((e) => models.includes(e.model.id)); }
  meter(id) {
    if (id === 'plants') { const p = this.plants(); return p.length ? p.reduce((a, x) => a + x.water, 0) / p.length : 1; }
    if (id === 'tidy') {
      const parts = [];
      if (this.has(CHORES.dishes.models)) parts.push(1 - this.dishes() / 8);
      if (this.has(CHORES.laundry.models)) parts.push(1 - this.laundry());
      if (this.has(CHORES.bed.models)) parts.push(this.bedMessy() ? 0.35 : 1);
      return parts.length ? parts.reduce((a, b) => a + b) / parts.length : 1;
    }
    const m = this.s.meters[id];
    return clamp(m.v - this.elapsedDays(m.t) * DECAY[id], 0, 1);
  }
  happiness() { return METERS.reduce((a, m) => a + this.meter(m.id), 0) / METERS.length; }

  // Everything that needs doing, most urgent first.
  tasks() {
    const out = [];
    for (const { e, water } of this.plants()) if (water < 0.5) out.push({ kind: 'water', icon: water < 0.2 ? '🥀' : '💧', label: `Water the ${(e.item.name || e.model.name).toLowerCase()}`, sub: water < 0.2 ? 'wilting!' : `${Math.round(water * 100)}% water`, id: e.item.id, urgency: 1 - water });
    const sink = this.has(CHORES.dishes.models), n = this.dishes();
    if (sink && n >= 2) out.push({ kind: 'dishes', icon: '🍽️', label: 'Wash the dishes', sub: `${n} in the sink`, id: sink.item.id, urgency: n / 8 });
    const washer = this.has(CHORES.laundry.models), l = this.laundry();
    if (washer && l > 0.45) out.push({ kind: 'laundry', icon: '🧺', label: 'Do the laundry', sub: l > 0.85 ? 'overflowing' : 'basket filling up', id: washer.item.id, urgency: l });
    const bed = this.has(CHORES.bed.models);
    if (bed && this.bedMessy()) out.push({ kind: 'bed', icon: '🛏️', label: 'Make the bed', sub: 'unmade', id: bed.item.id, urgency: 0.4 });
    return out.sort((a, b) => b.urgency - a.urgency);
  }
  activitiesFor(e) { return ACTIVITIES.filter((a) => a.models.includes(e.model.id)); }
  available() { return ACTIVITIES.map((a) => ({ a, e: this.has(a.models) })); }

  // ------------------------------------------------------------------ walk-mode hooks
  choreFor(e) {
    if (this.isPlant(e)) return { kind: 'water', label: this.water(e) < 0.97 ? `Water ${e.item.name || e.model.name} (${Math.round(this.water(e) * 100)}%)` : `${e.model.name} is happy 🌿` , ok: this.water(e) < 0.97 };
    if (CHORES.dishes.models.includes(e.model.id)) return { kind: 'dishes', label: this.dishes() ? `Wash ${this.dishes()} dishes` : 'Sink is clean ✨', ok: this.dishes() > 0 };
    if (CHORES.laundry.models.includes(e.model.id)) return { kind: 'laundry', label: this.laundry() > 0.1 ? 'Do the laundry' : 'Laundry is done ✨', ok: this.laundry() > 0.1 };
    if (CHORES.bed.models.includes(e.model.id) && this.bedMessy()) return { kind: 'bed', label: 'Make the bed', ok: true };
    return null;
  }
  hint(e) {
    if (this.active) return '';
    const parts = [];
    const c = this.choreFor(e);
    if (c) parts.push(c.ok ? `E · ${c.label}` : c.label);
    const acts = this.activitiesFor(e);
    if (acts[0]) parts.push(`Q · ${acts[0].icon} ${acts[0].name}`);
    if (acts[1]) parts.push(`⇧Q · ${acts[1].icon} ${acts[1].name}`);
    return parts.join('   ');
  }
  // E in walk mode. Returns true if the sim handled it.
  use(e) {
    if (this.active) return true;
    const c = this.choreFor(e);
    if (!c) return false;
    if (c.ok) this.start({ id: c.kind, ...CHORES[c.kind], chore: true, name: c.kind === 'water' ? `Water ${e.model.name}` : CHORES[c.kind].name }, e);
    else this.app.ui.toast(c.label);
    return true;
  }
  activity(e, alt) {
    if (this.active) return;
    const acts = this.activitiesFor(e); const a = acts[alt && acts[1] ? 1 : 0];
    if (a) this.start(a, e);
  }

  // Walk over to an item (from the Life tab), then optionally start something.
  goTo(itemId, then) {
    const e = this.app.items.get(itemId); if (!e) return;
    const { pos, yaw } = this.standPoint(e, then?.stand);
    this.app.editor.cancelPlacing();
    this.app.cameras.setMode('walk', { at: pos, yaw });
    if (then) setTimeout(() => this.start(then, e), 450);
  }

  standPoint(e, dist) {
    const it = e.item, r = rad(it.rot || 0), front = new THREE.Vector3(Math.sin(r), 0, Math.cos(r));
    const depth = e.model.size[2] * (it.scale?.[2] || 1);
    const pos = new THREE.Vector3(it.x, 0, it.z).addScaledVector(front, (e.model.placement === 'wall' ? 0 : depth / 2) + (dist ?? 0.75));
    return { pos, yaw: r, front };
  }

  // ------------------------------------------------------------------ activities
  start(def, e) {
    const app = this.app;
    if (app.cameras.mode !== 'walk') { this.goTo(e.item.id, def); return; }
    if (this.active) this.cancel();
    const A = this.active = { def, e, t: 0, dur: def.dur || 999, cleanup: [] };
    const cam = app.cameras.persp;
    // where to be: seated activities sit down facing the TV/table; others stand in front
    let pose = null;
    if (def.seat) pose = this.seatPose(def, e);
    if (!pose) {
      const sp = this.standPoint(e, def.stand ?? (def.chore ? 0.55 : 0.8));
      const target = new THREE.Vector3(e.item.x, (e.item.y || 0) + Math.min(e.model.size[1], 1.2) * 0.6, e.item.z);
      if (e.model.placement === 'wall') target.y = (e.item.y || 0) + e.model.size[1] / 2;
      pose = { pos: sp.pos.clone().setY(1.62), look: target };
      app.physics.player.position.set(sp.pos.x, 0.02, sp.pos.z); app.physics.player.velocity.setZero();
    } else app.physics.setPlayerActive(false);
    A.seated = !!def.seat && pose.seated;
    A.from = { p: cam.position.clone(), q: cam.quaternion.clone() };
    const m = new THREE.Matrix4().lookAt(pose.pos, pose.look, new THREE.Vector3(0, 1, 0));
    A.to = { p: pose.pos, q: new THREE.Quaternion().setFromRotationMatrix(m) };
    A.blend = 0;
    app.cameras.frozen = true;
    document.body.classList.add('in-activity');
    this.begin(A);
    this.dispatchEvent(new Event('change'));
  }

  seatPose(def, e) {
    const all = this.entries();
    const SEATS = ['sofa-3seat', 'sectional-l', 'loveseat', 'armchair', 'scallop-accent-chair', 'patio-set', 'sun-lounger', 'dining-chair', 'bar-stool'];
    let seat = SEATS.includes(e.model.id) ? e : null, look = null;
    const pos3 = (x) => new THREE.Vector3(x.item.x, (x.item.y || 0), x.item.z);
    if (def.id === 'movie') {
      const tv = e.model.id === 'tv-console' ? e : all.filter((x) => x.model.id === 'tv-console').sort((a, b) => pos3(a).distanceTo(pos3(e)) - pos3(b).distanceTo(pos3(e)))[0];
      if (!seat && tv) seat = all.filter((x) => ['sofa-3seat', 'sectional-l', 'loveseat', 'armchair'].includes(x.model.id)).sort((a, b) => pos3(a).distanceTo(pos3(tv)) - pos3(b).distanceTo(pos3(tv)))[0];
      if (tv) look = pos3(tv).setY(0.95);
    }
    if (def.id === 'dinner') { seat = all.filter((x) => x.model.id === 'dining-chair').sort((a, b) => pos3(a).distanceTo(pos3(e)) - pos3(b).distanceTo(pos3(e)))[0] || null; look = pos3(e).setY(0.85); }
    if (!seat) return null;
    const r = rad(seat.item.rot || 0), front = new THREE.Vector3(Math.sin(r), 0, Math.cos(r));
    const pos = pos3(seat).addScaledVector(front, seat.model.id === 'sectional-l' ? 0.5 : 0.12).setY((seat.item.y || 0) + 1.12);
    if (!look) look = pos.clone().addScaledVector(front, 4).setY(0.9);
    return { pos, look, seated: true };
  }

  begin(A) {
    const app = this.app, { def, e } = A, au = app.audio;
    au.start();
    const top = new THREE.Vector3(e.item.x, (e.item.y || 0) + e.model.size[1], e.item.z);
    const local = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(e.outer.matrixWorld);
    e.outer.updateMatrixWorld();
    switch (def.id) {
      case 'water': {
        const from = app.cameras.persp.position.clone().add(new THREE.Vector3(0, -0.35, 0));
        A.tick = (dt) => { if (A.t < 1.3) for (let i = 0; i < 3; i++) this.emitArc(from, top.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.15, -0.1, (Math.random() - 0.5) * 0.15)), [0.45, 0.72, 1]); };
        au.loop('water', 0.12, { type: 'highpass', freq: 2500 }); A.cleanup.push(() => au.loop('water', 0));
        break;
      }
      case 'dishes': case 'bath': case 'soak': {
        au.loop('water', def.id === 'dishes' ? 0.16 : 0.1, { type: 'highpass', freq: 2500 }); A.cleanup.push(() => au.loop('water', 0));
        const at = def.id === 'dishes' ? local(0, 1.0, 0.05) : top.clone().setY((e.item.y || 0) + e.model.size[1] * 0.9);
        this.emitters.push({ pos: at, rate: def.id === 'dishes' ? 25 : 40, kind: def.id === 'dishes' ? 'splash' : 'steam', spread: def.id === 'dishes' ? 0.2 : 0.7 });
        break;
      }
      case 'laundry': au.loop('hvac2', 0.15, { type: 'lowpass', freq: 180 }); A.cleanup.push(() => au.loop('hvac2', 0)); A.tick = () => { e.inner.rotation.z = Math.sin(A.t * 40) * 0.004; }; A.cleanup.push(() => { e.inner.rotation.z = 0; }); break;
      case 'bed': A.tick = () => {}; break;
      case 'movie':
        for (const x of this.entries()) if (x.model.id === 'tv-console') app.items.forced.set(x.item.id, true);
        app.items.lightScale = 0.18; au.loop('movie', 0.05, { type: 'bandpass', freq: 500, q: 0.4 });
        A.cleanup.push(() => { for (const x of this.entries()) if (x.model.id === 'tv-console') app.items.forced.delete(x.item.id); app.items.lightScale = 1; au.loop('movie', 0); });
        break;
      case 'dance': {
        app.items.lightScale = 0.1; au.playBeat(def.dur);
        const room = app.apartment.roomAt(e.item.x, e.item.z), c = room ? new THREE.Vector3((room.rect[0] + room.rect[2]) / 2, 2.1, (room.rect[1] + room.rect[3]) / 2) : top.clone().setY(2.1);
        const lights = ['#ff3fa4', '#3fb7ff', '#b4ff3f'].map((col) => { const L = new THREE.PointLight(col, 14, 9, 1.6); this.props.add(L); return L; });
        const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 1), new THREE.MeshStandardMaterial({ color: '#dddddd', metalness: 1, roughness: 0.15, flatShading: true }));
        ball.position.copy(c).setY(app.apartment.H - 0.3); this.props.add(ball);
        A.tick = (dt) => { lights.forEach((L, i) => { const a = A.t * 2.4 + i * 2.1; L.position.set(c.x + Math.cos(a) * 1.6, c.y + Math.sin(A.t * 4 + i) * 0.3, c.z + Math.sin(a) * 1.6); L.intensity = 10 + Math.sin(A.t * 12.6 + i) * 6; }); ball.rotation.y += dt * 2; };
        A.cleanup.push(() => { lights.forEach((L) => this.props.remove(L)); this.props.remove(ball); app.items.lightScale = 1; });
        for (const x of this.entries()) if (x.model.id === 'tv-console') { app.items.forced.set(x.item.id, true); A.cleanup.push(() => app.items.forced.delete(x.item.id)); }
        break;
      }
      case 'cook': {
        const burner = local(0.17, 0.95, 0.14);
        const pan = new THREE.Group();
        pan.add(new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.05, 24), new THREE.MeshStandardMaterial({ color: '#222', metalness: 0.6, roughness: 0.4 })));
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.015, 0.03), new THREE.MeshStandardMaterial({ color: '#111' })); handle.position.x = 0.22; pan.add(handle);
        const food = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 20), new THREE.MeshStandardMaterial({ color: '#d98a3a', roughness: 0.8 })); food.position.y = 0.02; pan.add(food);
        pan.position.copy(burner).add(new THREE.Vector3(0, 0.03, 0)); pan.rotation.y = rad(e.item.rot || 0);
        const flame = new THREE.PointLight('#ff7a2a', 1.2, 1.2); flame.position.copy(burner); this.props.add(pan, flame);
        this.emitters.push({ pos: burner.clone().add(new THREE.Vector3(0, 0.08, 0)), rate: 30, kind: 'steam', spread: 0.12 });
        au.loop('sizzle', 0.11, { type: 'bandpass', freq: 4200, q: 0.6 });
        A.tick = () => { food.material.color.setHSL(0.08, 0.65, 0.55 - Math.min(A.t / A.dur, 1) * 0.22); pan.position.y = burner.y + 0.03 + Math.abs(Math.sin(A.t * 3)) * 0.01; };
        A.cleanup.push(() => { this.props.remove(pan, flame); au.loop('sizzle', 0); });
        break;
      }
      case 'dinner': {
        app.items.lightScale = 0.35;
        const r = rad(e.item.rot || 0), surf = (e.item.y || 0) + (e.model.surface || 0.76);
        const candles = [-0.25, 0.25].map((dx) => {
          const g = new THREE.Group();
          const c = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.2, 12), new THREE.MeshStandardMaterial({ color: '#f6efe0', roughness: 0.6 })); c.position.y = 0.1; g.add(c);
          const f = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffc46b' })); f.scale.y = 1.8; f.position.y = 0.225; g.add(f);
          const L = new THREE.PointLight('#ffb36b', 1.8, 4, 1.5); L.position.y = 0.26; g.add(L);
          g.position.set(e.item.x + Math.cos(r) * dx, surf, e.item.z - Math.sin(r) * dx); this.props.add(g); return { g, L, f };
        });
        A.tick = () => candles.forEach((c, i) => { c.L.intensity = 1.6 + Math.sin(A.t * 13 + i * 3) * 0.25 + Math.random() * 0.15; c.f.scale.x = 1 + Math.sin(A.t * 17 + i) * 0.12; });
        A.cleanup.push(() => { candles.forEach((c) => this.props.remove(c.g)); app.items.lightScale = 1; });
        break;
      }
      case 'guitar': {
        const len = au.playGuitar();
        A.dur = Math.max(def.dur, len || def.dur);
        const g = e.inner.userData.named.get('guitar')?.[0];
        A.tick = () => { if (g) g.rotation.z = Math.sin(A.t * 6.28) * 0.02; if (Math.random() < 0.08) this.emit(top.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0, 0)), new THREE.Vector3(0, 0.4, 0), [1, 0.85, 0.4], 1.4, 0); };
        A.cleanup.push(() => { if (g) g.rotation.z = 0; });
        break;
      }
      case 'read': case 'coffee': {
        if (def.id === 'coffee') {
          const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.09, 16), new THREE.MeshStandardMaterial({ color: '#f2efe8', roughness: 0.3 }));
          mug.position.set(e.item.x, (e.item.y || 0) + (e.model.surface || 0.7) + 0.045, e.item.z); this.props.add(mug); A.cleanup.push(() => this.props.remove(mug));
          this.emitters.push({ pos: mug.position.clone().add(new THREE.Vector3(0, 0.06, 0)), rate: 8, kind: 'steam', spread: 0.02 });
        }
        break;
      }
      case 'pool': this.poolBreak(e, A); break;
      case 'sleep': {
        const fade = document.getElementById('fade'); fade.classList.add('on');
        A.tick = () => { if (A.t > 2 && !A.slept) { A.slept = true; this.app.store.commit('Slept till morning 😴', (d) => { d.env.hour = 7; ensure(d).chores.bed = { messy: true, t: Date.now() }; }); } };
        A.cleanup.push(() => fade.classList.remove('on'));
        break;
      }
      case 'darts': this.darts = { left: 3, score: 0, e, darts: [] }; app.ui.toast('🎯 Aim with the crosshair · click to throw (3 darts)', 3000); break;
      case 'arcade': document.exitPointerLock?.(); this.arcade.start((score) => this.finishGame(score)); break;
    }
  }

  emit(pos, vel, color, life = 1.5, gravity = 0) {
    const i = this.pcur = (this.pcur + 1) % this.N;
    this.pp[i * 3] = pos.x; this.pp[i * 3 + 1] = pos.y; this.pp[i * 3 + 2] = pos.z;
    this.pv[i * 3] = vel.x; this.pv[i * 3 + 1] = vel.y; this.pv[i * 3 + 2] = vel.z;
    this.pc[i * 3] = color[0]; this.pc[i * 3 + 1] = color[1]; this.pc[i * 3 + 2] = color[2];
    this.pl[i] = life; this.pg[i] = gravity;
  }
  emitArc(from, to, color) {
    const T = 0.55, v = to.clone().sub(from).divideScalar(T); v.y += 9.81 * T / 2;
    this.emit(from.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.03, 0, (Math.random() - 0.5) * 0.03)), v, color, T * 1.05, 9.81);
  }

  poolBreak(e, A) {
    const names = ['ball-1', 'ball-2', 'ball-3', 'ball-4', 'ball-5'];
    const balls = names.map((n) => e.inner.userData.named.get(n)?.[0]).filter(Boolean).map((m) => {
      m.userData.base ||= m.position.clone(); m.position.copy(m.userData.base); m.visible = true;
      return { m, vx: 0, vz: 0, sunk: false };
    });
    // re-rack in a triangle, cue ball at the head
    const rack = [[-0.5, 0], [-0.56, -0.035], [-0.56, 0.035], [-0.62, 0]];
    balls.slice(1).forEach((b, i) => { if (rack[i]) { b.m.position.x = rack[i][0]; b.m.position.z = rack[i][1]; } });
    if (balls[0]) { balls[0].m.position.set(0.6, balls[0].m.userData.base.y, 0); balls[0].vx = -3.4; balls[0].vz = (Math.random() - 0.5) * 0.25; }
    const R = 0.0285, X = 1.15 - R, Z = 0.6 - R;
    const pockets = [[1.13, 0.58], [1.13, -0.58], [-1.13, 0.58], [-1.13, -0.58], [0, 0.58], [0, -0.58]];
    A.tick = (dt) => {
      const steps = 4, h = dt / steps;
      for (let s = 0; s < steps; s++) {
        for (const b of balls) {
          if (b.sunk) continue;
          b.m.position.x += b.vx * h; b.m.position.z += b.vz * h;
          const sp = Math.hypot(b.vx, b.vz), dec = Math.max(0, sp - 0.55 * h);
          if (sp > 0) { b.vx *= dec / sp; b.vz *= dec / sp; }
          if (b.m.position.x > X || b.m.position.x < -X) { b.vx *= -0.8; b.m.position.x = clamp(b.m.position.x, -X, X); this.app.audio.thud(0.08); }
          if (b.m.position.z > Z || b.m.position.z < -Z) { b.vz *= -0.8; b.m.position.z = clamp(b.m.position.z, -Z, Z); this.app.audio.thud(0.08); }
          for (const [px, pz] of pockets) if (Math.hypot(b.m.position.x - px, b.m.position.z - pz) < 0.065) { b.sunk = true; b.m.visible = false; this.app.audio.thud(0.3); A.sunk = (A.sunk || 0) + 1; }
        }
        for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) {
          const a = balls[i], b = balls[j]; if (a.sunk || b.sunk) continue;
          const dx = b.m.position.x - a.m.position.x, dz = b.m.position.z - a.m.position.z, dist = Math.hypot(dx, dz);
          if (dist < 2 * R && dist > 0) {
            const nx = dx / dist, nz = dz / dist, rel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
            if (rel > 0) { a.vx -= rel * nx; a.vz -= rel * nz; b.vx += rel * nx; b.vz += rel * nz; this.app.audio.blip(1800, 0.02, 0.05, 'triangle'); }
            const push = (2 * R - dist) / 2; a.m.position.x -= nx * push; a.m.position.z -= nz * push; b.m.position.x += nx * push; b.m.position.z += nz * push;
          }
        }
      }
    };
  }

  // walk-mode click during darts
  click() {
    const D = this.darts; if (!D || !this.active) return false;
    const app = this.app, cam = app.cameras.persp, dir = new THREE.Vector3(); cam.getWorldDirection(dir);
    // a little hand wobble
    dir.x += (Math.random() - 0.5) * 0.012; dir.y += (Math.random() - 0.5) * 0.012; dir.normalize();
    const ray = new THREE.Raycaster(cam.position, dir, 0, 6);
    const board = D.e.inner.userData.named.get('board')?.[0];
    const hit = ray.intersectObject(D.e.outer, true)[0];
    let pts = 0, where = null;
    if (hit && board) {
      const c = new THREE.Vector3(); board.getWorldPosition(c);
      const r = hit.point.distanceTo(c);
      pts = r < 0.018 ? 50 : r < 0.04 ? 25 : r < 0.07 ? 20 : r < 0.11 ? 15 : r < 0.14 ? 10 : r < 0.18 ? 5 : r < 0.23 ? 1 : 0;
      where = hit.point;
    }
    if (where) {
      const dart = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.002, 0.13, 6), new THREE.MeshStandardMaterial({ color: '#c0c0c0', metalness: 0.8, roughness: 0.3 }));
      shaft.rotation.x = Math.PI / 2; shaft.position.z = 0.065; dart.add(shaft);
      const fl = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.035), new THREE.MeshStandardMaterial({ color: ['#e33', '#3a7bff', '#1db954'][3 - D.left] })); fl.position.z = 0.13; dart.add(fl);
      dart.position.copy(where); dart.lookAt(where.clone().sub(dir)); this.props.add(dart); D.darts.push(dart);
      app.audio.thud(0.35);
    }
    D.score += pts; D.left--;
    app.ui.toast(pts ? `🎯 +${pts}${pts === 50 ? ' BULLSEYE!' : ''}  (total ${D.score})` : `Missed! (total ${D.score})`, 1600);
    if (D.left <= 0) setTimeout(() => { const s = D.score; D.darts.forEach((x) => this.props.remove(x)); this.darts = null; this.finishGame(s); }, 1200);
    return true;
  }

  finishGame(score) {
    if (!this.active) return;
    const id = this.active.def.id, best = this.s.scores[id] || 0;
    this.active.score = score;
    this.app.ui.toast(score > best ? `🏆 New high score: ${score}!` : `Score ${score} · best ${best}`, 3000);
    this.finish();
  }

  update(dt) {
    const A = this.active, app = this.app;
    if (A) {
      A.t += dt;
      // glide the camera into position
      if (A.blend < 1) {
        A.blend = Math.min(1, A.blend + dt / 0.9);
        const k = A.blend * A.blend * (3 - 2 * A.blend);
        app.cameras.persp.position.lerpVectors(A.from.p, A.to.p, k);
        app.cameras.persp.quaternion.slerpQuaternions(A.from.q, A.to.q, k);
      }
      A.tick?.(dt);
      for (const em of this.emitters) {
        const n = em.rate * dt; let c = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
        while (c--) {
          const p = em.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * em.spread, 0, (Math.random() - 0.5) * em.spread));
          if (em.kind === 'steam') this.emit(p, new THREE.Vector3((Math.random() - 0.5) * 0.08, 0.35 + Math.random() * 0.2, (Math.random() - 0.5) * 0.08), [0.95, 0.95, 0.95], 1.8, -0.05);
          else this.emit(p, new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.6 + Math.random() * 0.5, (Math.random() - 0.5) * 0.6), [0.6, 0.8, 1], 0.6, 9.81);
        }
      }
      if (!A.def.game && A.t >= A.dur) this.finish();
      app.ui.updateActivity?.(A);
    }
    // particles
    const { pp, pv, pl, pg, N } = this;
    for (let i = 0; i < N; i++) {
      if (pl[i] <= 0) { pp[i * 3 + 1] = -999; continue; }
      pl[i] -= dt; pv[i * 3 + 1] -= pg[i] * dt;
      pp[i * 3] += pv[i * 3] * dt; pp[i * 3 + 1] += pv[i * 3 + 1] * dt; pp[i * 3 + 2] += pv[i * 3 + 2] * dt;
    }
    this.particles.geometry.attributes.position.needsUpdate = true; this.particles.geometry.attributes.color.needsUpdate = true;
    this.visualT -= dt;
    if (this.visualT <= 0) { this.visualT = 0.5; this.applyVisuals(); }
  }

  finish() {
    const A = this.active; if (!A) return;
    const { def, e } = A, app = this.app;
    this.end();
    const together = app.live.count > 0;
    const who = [this.app.store.user?.name, ...[...app.partners.values()].map((p) => p.el.textContent)].filter(Boolean);
    const memId = uid();
    app.store.commit(def.chore ? `${def.icon} ${def.name}` : `${def.icon} ${def.name}${A.score != null ? ` (${A.score})` : ''}`, (d) => {
      const s = ensure(d), now = Date.now();
      if (def.id === 'water') s.plants[e.item.id] = now;
      if (def.id === 'dishes') s.chores.dishes = { n: 0, t: now };
      if (def.id === 'laundry') s.chores.laundry = { t: now };
      if (def.id === 'bed') s.chores.bed = { messy: false, t: now };
      if (def.id === 'cook') { const c = s.chores.dishes; s.chores.dishes = { n: this.dishes() + 2, t: now }; void c; }
      if (def.skipHours) d.env.hour = (d.env.hour + def.skipHours) % 24;
      for (const [k, v] of Object.entries(def.mood || {})) {
        const cur = this.meter(k), boost = v * (together && k === 'together' ? 2 : 1) + (together && k !== 'together' ? 0.05 : 0);
        s.meters[k] = { v: clamp(cur + boost, 0, 1), t: now };
      }
      if (together && !def.mood?.together && !def.chore) s.meters.together = { v: clamp(this.meter('together') + 0.12, 0, 1), t: now };
      if (A.score != null) s.scores[def.id] = Math.max(s.scores[def.id] || 0, A.score);
      if (!def.chore) s.memories = [{ id: memId, act: def.id, icon: def.icon, title: def.name + (A.score != null ? ` — ${A.score} pts` : ''), who, at: now, room: app.apartment.roomAt(e.item.x, e.item.z)?.name }, ...s.memories].slice(0, 60);
    });
    if (def.chore) {
      app.audio.blip(1320, 0.12, 0.08, 'sine'); setTimeout(() => app.audio.blip(1760, 0.15, 0.07, 'sine'), 90);
      for (let i = 0; i < 24; i++) this.emit(new THREE.Vector3(e.item.x, (e.item.y || 0) + e.model.size[1] * 0.8, e.item.z), new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.8 + Math.random(), (Math.random() - 0.5) * 1.2), [1, 0.9, 0.4], 0.9, 3);
      app.ui.toast(`${def.icon} ${def.name} — done ✨`, 1800);
    } else { this.captureFor = memId; app.ui.toast(`📸 Memory saved: ${def.icon} ${def.name}`, 2600); }
    this.applyVisuals();
  }

  cancel(msg) {
    if (!this.active) return;
    this.end();
    if (msg) this.app.ui.toast(msg, 1400);
  }
  end() {
    const A = this.active; if (!A) return;
    A.cleanup.forEach((f) => f());
    this.emitters = [];
    if (this.darts) { this.darts.darts.forEach((x) => this.props.remove(x)); this.darts = null; }
    this.arcade.stop();
    this.active = null;
    const app = this.app;
    app.cameras.frozen = false;
    if (app.cameras.mode === 'walk' && !app.physics.playerActive) {
      const p = app.cameras.persp.position; const sp = A.seated ? this.standPoint(A.e, 0.6).pos : p;
      app.physics.setPlayerActive(true, new THREE.Vector3(sp.x, 0.02, sp.z));
    }
    document.body.classList.remove('in-activity');
    app.ui.updateActivity?.(null);
    this.dispatchEvent(new Event('change'));
  }

  // grab a thumbnail of the moment right after rendering
  afterRender() {
    if (!this.captureFor) return;
    try {
      const src = this.app.canvas, c = document.createElement('canvas'); c.width = 320; c.height = 200;
      const s = Math.max(c.width / src.width, c.height / src.height), w = src.width * s, h = src.height * s;
      c.getContext('2d').drawImage(src, (c.width - w) / 2, (c.height - h) / 2, w, h);
      const all = JSON.parse(localStorage.getItem(LS_THUMBS) || '{}'); all[this.captureFor] = c.toDataURL('image/jpeg', 0.72);
      const keys = Object.keys(all); if (keys.length > 40) delete all[keys[0]];
      localStorage.setItem(LS_THUMBS, JSON.stringify(all));
    } catch (e) { console.warn('memory thumbnail failed', e); }
    this.captureFor = null;
    this.app.ui.refreshLife?.();
  }
  thumb(id) { try { return JSON.parse(localStorage.getItem(LS_THUMBS) || '{}')[id]; } catch { return null; } }

  // ------------------------------------------------------------------ visuals of needs
  onDesignChange() {
    const s = this.s, now = Date.now();
    // new plants start freshly watered
    for (const e of this.entries()) if (this.isPlant(e) && s.plants[e.item.id] == null) s.plants[e.item.id] = now;
    this.applyVisuals();
  }
  applyVisuals() {
    if (!this.d) return;
    for (const e of this.entries()) {
      if (this.isPlant(e)) {
        const w = this.water(e), k = Math.pow(1 - w, 1.6);
        e.droop = k;
        const fol = e.inner.userData.named.get('foliage') || [];
        for (const f of fol) {
          f.scale.y = 1 - k * 0.25;
          f.traverse((m) => {
            if (!m.isMesh) return;
            if (!m.userData.simMat) { m.material = m.material.clone(); m.userData.simMat = true; m.userData.baseColor = m.material.color.clone(); }
            m.material.color.copy(m.userData.baseColor).lerp(BROWN, k * 0.85);
          });
        }
      }
      if (CHORES.bed.models.includes(e.model.id)) {
        const messy = this.bedMessy();
        for (const n of ['duvet', 'throw-blanket', 'pillow']) for (const m of e.inner.userData.named.get(n) || []) {
          m.userData.basePos ||= m.position.clone(); m.userData.baseRot ||= m.rotation.clone();
          m.position.copy(m.userData.basePos); m.rotation.copy(m.userData.baseRot);
          if (messy) {
            if (n === 'duvet') { m.rotation.y = 0.22; m.position.x += 0.18; m.position.z += 0.12; }
            if (n === 'throw-blanket') { m.rotation.z = 0.5; m.position.x -= 0.4; m.position.y -= 0.2; }
            if (n === 'pillow') { m.rotation.z = (m.position.x > 0 ? 1 : -1) * 0.35; m.rotation.y = m.position.x * 0.8; m.position.z += 0.15; }
          }
        }
      }
    }
    // dishes stacked next to the sink, clothes piled on the washer
    const key = JSON.stringify([this.dishes(), Math.ceil(this.laundry() * 6), this.has(CHORES.dishes.models)?.item.id, this.has(CHORES.laundry.models)?.item.id]);
    if (key === this.propKey) return; this.propKey = key;
    this.chorePropsGroup && this.props.remove(this.chorePropsGroup);
    const g = this.chorePropsGroup = new THREE.Group(); this.props.add(g);
    const sink = this.has(CHORES.dishes.models), n = this.dishes();
    if (sink && n) {
      sink.outer.updateMatrixWorld();
      const plateMat = new THREE.MeshStandardMaterial({ color: '#f4f2ec', roughness: 0.25 }), dirt = new THREE.MeshStandardMaterial({ color: '#b98d5a', roughness: 0.9 });
      for (let i = 0; i < n; i++) {
        const big = i < 5;
        const p = new THREE.Mesh(new THREE.CylinderGeometry(big ? 0.13 : 0.045, big ? 0.1 : 0.04, big ? 0.02 : 0.1, 20), plateMat);
        const local = big ? new THREE.Vector3(-0.38, 0.95 + i * 0.022, 0.06) : new THREE.Vector3(-0.2 + (i - 5) * 0.1, 0.99, 0.18);
        p.position.copy(local.applyMatrix4(sink.outer.matrixWorld)); p.castShadow = true; g.add(p);
        if (big && i === n - 1) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.004, 12), dirt); s.position.copy(p.position).add(new THREE.Vector3(0, 0.012, 0)); g.add(s); }
      }
    }
    const washer = this.has(CHORES.laundry.models), piles = Math.ceil(this.laundry() * 6);
    if (washer && piles > 1) {
      washer.outer.updateMatrixWorld();
      const cols = ['#5b7db1', '#e8e2d4', '#c25b56', '#3d3d3d', '#9fb8a0', '#e0b85a'];
      for (let i = 0; i < piles; i++) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), new THREE.MeshStandardMaterial({ color: cols[i % cols.length], roughness: 1 }));
        m.scale.set(1.3, 0.45, 1); m.rotation.y = i;
        m.position.copy(new THREE.Vector3(((i % 3) - 1) * 0.14, 0.88 + Math.floor(i / 3) * 0.07, ((i * 7) % 3 - 1) * 0.08).applyMatrix4(washer.outer.matrixWorld)); m.castShadow = true; g.add(m);
      }
    }
  }

  // ------------------------------------------------------------------ welcome back
  welcome() {
    const me = this.app.store.user?.name; if (!me || !this.d) return;
    const s = this.s, last = s.visits[me];
    s.visits[me] = Date.now(); this.app.store.autosave();
    if (!last || Date.now() - last < 4 * 3600 * 1000) return;
    const tasks = this.tasks();
    const since = (this.d.log || []).filter((l) => l.at > last && l.who !== me);
    const mems = s.memories.filter((m) => m.at > last && !m.who?.includes(me));
    if (!tasks.length && !since.length) return;
    this.app.ui.welcomeBack({ away: Date.now() - last, tasks, since, mems });
  }
}

// Make sure design.sim exists with every field.
export function ensure(d) {
  const s = d.sim ||= {};
  s.plants ||= {}; s.chores ||= {};
  s.chores.dishes ||= { n: 0, t: Date.now() }; s.chores.laundry ||= { t: Date.now() }; s.chores.bed ||= { messy: false, t: Date.now() };
  s.meters ||= {}; for (const k of ['fun', 'cozy', 'together']) s.meters[k] ||= { v: 0.75, t: Date.now() };
  s.memories ||= []; s.scores ||= {}; s.visits ||= {}; s.pace ||= 1;
  return s;
}
