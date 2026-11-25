// Editing: pick, drag & drop from the Playbox, move/rotate with live gravity, select walls/floors,
// toggle doors/windows, and first-person interaction (E toggle, G grab, click throw, B ball, F flashlight).
import * as THREE from 'three';
import { uid, rad } from './util.js';
import { isTyping } from './cameras.js';

const GRID = 0.05;

export class Editor extends EventTarget {
  constructor(app) {
    super();
    this.app = app;
    this.ray = new THREE.Raycaster(); this.ray.layers.enableAll();
    this.ndc = new THREE.Vector2();
    this.selection = null; // {type:'item'|'wall'|'room', id|index}
    this.snap = true;
    this.helper = new THREE.Box3Helper(new THREE.Box3(), 0xff8a5c); this.helper.visible = false; this.helper.layers.set(1); app.scene.add(this.helper);
    this.ghost = null; this.placing = null;
    const c = app.canvas;
    // registered BEFORE OrbitControls so we can veto orbiting when grabbing furniture
    c.addEventListener('pointerdown', (e) => this.onDown(e), { capture: true });
    addEventListener('pointermove', (e) => this.onMove(e));
    addEventListener('pointerup', (e) => this.onUp(e));
    c.addEventListener('dblclick', (e) => this.onDouble(e));
    c.addEventListener('dragover', (e) => { e.preventDefault(); const id = this.dragModelId; if (id) { if (!this.placing) this.startPlacing(id, { fromDrag: true }); this.updateGhost(e); } });
    c.addEventListener('dragleave', () => { if (this.placing?.fromDrag) this.cancelPlacing(); });
    c.addEventListener('drop', (e) => { e.preventDefault(); if (this.placing) { this.updateGhost(e); this.placeGhost(); this.cancelPlacing(); } this.dragModelId = null; });
    addEventListener('keydown', (e) => this.onKey(e));
    c.addEventListener('click', () => { if (app.cameras.mode === 'walk' && !app.cameras.walking) app.cameras.lock.lock(); });
    app.cameras.onTap = () => this.walkClick();
    app.cameras.arrowsBusy = () => this.selection?.type === 'item'; // arrows nudge the selected item instead of panning
    addEventListener('mousedown', (e) => { if (app.cameras.mode === 'walk' && app.cameras.lock.isLocked && e.button === 0) this.walkClick(); });
    this.flashlight = new THREE.SpotLight('#fff2d8', 0, 18, rad(28), 0.5, 1.5); this.flashlight.castShadow = false;
    app.cameras.persp.add(this.flashlight); app.cameras.persp.add(this.flashlight.target); this.flashlight.target.position.set(0, 0, -1);
    app.scene.add(app.cameras.persp);
  }

  get design() { return this.app.store.design; }
  item(id) { return this.design.items.find((i) => i.id === id); }

  setNDC(e) {
    const r = this.app.canvas.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.app.cameras.camera);
  }
  rayPlane(y) { const p = new THREE.Vector3(); return this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), p) ? p : null; }

  pick() {
    const targets = [this.app.items.group, this.app.apartment.group];
    const hits = this.ray.intersectObjects(targets, true);
    for (const h of hits) {
      let o = h.object;
      if (!o.visible || o.material?.colorWrite === false) continue;
      if (o.parent?.visible === false) continue;
      // respect cutaway clipping
      if (this.app.cutaway != null && h.point.y > this.app.cutaway + 0.01 && o.userData.kind !== 'item' && !o.userData.itemId) continue;
      if (o.userData.itemId) return { type: 'item', id: o.userData.itemId, point: h.point, object: o };
      while (o && !o.userData.kind) o = o.parent;
      if (!o) continue;
      const k = o.userData.kind;
      if (k === 'opening') return { type: 'opening', key: o.userData.key, point: h.point };
      if (k === 'wall' || k === 'rail') return { type: 'wall', index: o.userData.wallIndex, point: h.point };
      if (k === 'floor') return { type: 'room', index: o.userData.roomIndex, point: h.point };
    }
    return null;
  }

  // ------------------------------------------------------------- selection
  select(sel) {
    this.selection = sel;
    this.dispatchEvent(new Event('select'));
  }
  updateHelper() {
    const s = this.selection;
    if (!s) { this.helper.visible = false; return; }
    const box = this.helper.box;
    if (s.type === 'item') {
      const e = this.app.items.get(s.id);
      if (!e) { this.helper.visible = false; return; }
      box.setFromObject(e.outer);
      this.helper.material.color.set(this.overlaps(e.item) ? 0xff3b3b : 0xff8a5c);
    } else if (s.type === 'wall') {
      const w = this.app.apartment.walls.find((x) => x.index === s.index);
      box.makeEmpty(); (w?.meshes || []).forEach((m) => box.expandByObject(m));
      this.helper.material.color.set(0x5cc8ff);
    } else if (s.type === 'room') {
      const r = this.app.apartment.rooms[s.index];
      if (!r) { this.helper.visible = false; return; }
      box.set(new THREE.Vector3(r.rect[0], 0, r.rect[1]), new THREE.Vector3(r.rect[2], 0.05, r.rect[3]));
      this.helper.material.color.set(0x5cc8ff);
    }
    this.helper.visible = !box.isEmpty();
  }

  // 2D oriented-box overlap with other floor items & walls → red outline
  overlaps(item) {
    const lib = this.app.library, m = lib.get(item.model);
    if (!m || m.rug || m.placement !== 'floor') return false;
    const A = obb(item, m);
    for (const o of this.design.items) {
      if (o.id === item.id) continue;
      const om = lib.get(o.model);
      if (!om || om.rug || om.placement !== 'floor' || om.physics?.body === 'dynamic') continue;
      // chairs & stools are meant to tuck under tables, islands and desks
      const tucks = (x, y) => (x.tags || []).some((t) => ['chair', 'stool', 'seating'].includes(t)) && (y.tags || []).some((t) => ['table', 'island', 'desk', 'surface'].includes(t));
      if (tucks(m, om) || tucks(om, m)) continue;
      if (satOverlap(A, obb(o, om), 0.04)) return true;
    }
    for (const w of this.app.apartment.walls) {
      const t = w.t / 2;
      const B = w.axis === 'h' ? { cx: (w.a0 + w.a1) / 2, cz: w.c, hx: (w.a1 - w.a0) / 2, hz: t, r: 0 } : { cx: w.c, cz: (w.a0 + w.a1) / 2, hx: t, hz: (w.a1 - w.a0) / 2, r: 0 };
      if (satOverlap(A, B, 0.03)) {
        // allow overlaps that are inside a doorway/window gap
        const hitPiece = w.meshes.some((mesh) => { const bb = new THREE.Box3().setFromObject(mesh); return bb.min.y < 0.5 && satOverlap(A, { cx: (bb.min.x + bb.max.x) / 2, cz: (bb.min.z + bb.max.z) / 2, hx: (bb.max.x - bb.min.x) / 2, hz: (bb.max.z - bb.min.z) / 2, r: 0 }, 0.03); });
        if (hitPiece || w.rail) return true;
      }
    }
    return false;
  }

  // ------------------------------------------------------------- placing from the Playbox
  startPlacing(modelId, opts = {}) {
    this.cancelPlacing();
    const model = this.app.library.get(modelId);
    if (!model) return;
    const item = { id: 'ghost', model: modelId, x: 0, y: 0, z: 0, rot: 0 };
    const tmpLayerEntry = this.app.items.createEntry(item, model, this.app.style, 'ghost');
    tmpLayerEntry.outer.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.55; o.material.depthWrite = false; o.castShadow = false; } });
    this.app.items.group.remove(tmpLayerEntry.outer);
    this.app.scene.add(tmpLayerEntry.outer);
    this.placing = { modelId, model, item, entry: tmpLayerEntry, ...opts };
    this.app.ui?.toast(`Click to place ${model.name} · R to rotate · Esc to cancel`, 2500);
  }
  cancelPlacing() {
    if (!this.placing) return;
    this.app.scene.remove(this.placing.entry.outer);
    this.placing = null;
  }
  updateGhost(e) {
    const P = this.placing; if (!P) return;
    this.setNDC(e);
    const m = P.model, it = P.item, apt = this.app.apartment;
    if (m.placement === 'wall') {
      const p = this.rayPlane((m.mountHeight ?? 1.4) + m.size[1] / 2) || this.rayPlane(0); if (!p) return;
      const s = apt.snapToWall(p.x, p.z, m.size[2]);
      if (s) { it.x = s.x; it.z = s.z; it.rot = s.rot; } else { it.x = p.x; it.z = p.z; }
      it.y = m.mountHeight ?? 1.4;
    } else {
      const p = m.placement === 'ceiling' ? this.rayPlane(apt.H) : this.rayPlane(0); if (!p) return;
      it.x = this.snapV(p.x); it.z = this.snapV(p.z);
      it.y = this.app.items.supportFor(it, this.design.items, apt).y;
      // surfaces: aim at the top of whatever is under the cursor
      if (m.placement === 'surface') {
        const hit = this.pick();
        if (hit?.type === 'item') { it.x = this.snapV(hit.point.x); it.z = this.snapV(hit.point.z); it.y = this.app.items.supportFor(it, this.design.items, apt).y; }
      }
    }
    const o = P.entry.outer; o.position.set(it.x, it.y, it.z); o.rotation.y = rad(it.rot);
  }
  placeGhost() {
    const P = this.placing; if (!P) return;
    const it = P.item, m = P.model;
    if (m.placement === 'wall' && !this.app.apartment.snapToWall(it.x, it.z, m.size[2])) { this.app.ui?.toast('Wall items need a wall — move closer to one.'); return; }
    const item = { id: uid(), model: P.modelId, x: +it.x.toFixed(3), y: +(it.y || 0).toFixed(3), z: +it.z.toFixed(3), rot: it.rot || 0, addedBy: this.app.store.user?.name };
    if (m.physics?.body === 'dynamic') item.y = (it.y || 0) + 0.4; // drop it in so you see it fall
    this.app.store.commit(`Added ${m.name}`, (d) => {
      d.items.push(item);
      if (this.app.library.meta.get(m.id)?.local) d.customModels[m.id] = m; // travels with the design
    });
    this.select({ type: 'item', id: item.id });
  }
  snapV(v) { return this.snap ? Math.round(v / GRID) * GRID : v; }

  // ------------------------------------------------------------- pointer
  onDown(e) {
    const app = this.app;
    if (e.button !== 0) return;
    if (app.cameras.mode === 'walk' && app.cameras.lock.isLocked) return;
    this.setNDC(e);
    if (app.cameras.mode === 'walk' && app.sim.darts) { e.stopImmediatePropagation(); app.sim.click(this.ray.ray.direction.clone()); return; }
    if (this.placing) { e.stopImmediatePropagation(); this.updateGhost(e); this.placeGhost(); if (!e.shiftKey) this.cancelPlacing(); return; }
    const hit = this.pick();
    this.down = { x: e.clientX, y: e.clientY, hit, t: performance.now() };
    // a drag moves the camera unless you grab furniture that's already selected
    // (click once to select it, then drag to move it) — so furniture never blocks orbiting/panning
    if (hit?.type === 'item' && this.selection?.id !== hit.id) return;
    if (hit?.type === 'item') {
      const it = this.item(hit.id); if (!it) return;
      app.cameras.orbit.enabled = false; app.cameras.plan.enabled = false;
      e.stopImmediatePropagation();
      this.select({ type: 'item', id: it.id });
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -hit.point.y);
      const deps = this.dependents(it.id).map((d) => ({ d, dx: d.x - it.x, dz: d.z - it.z }));
      this.drag = { id: it.id, plane, off: new THREE.Vector3(it.x - hit.point.x, 0, it.z - hit.point.z), before: JSON.stringify(this.design), moved: false, deps };
    }
  }
  dependents(id, acc = []) {
    for (const o of this.design.items) if (o.on === id && !acc.includes(o)) { acc.push(o); this.dependents(o.id, acc); }
    return acc;
  }
  onMove(e) {
    if (e.target === this.app.canvas) { const r = this.app.canvas.getBoundingClientRect(); (this.mouse ||= new THREE.Vector2()).set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); }
    if (this.placing && e.target === this.app.canvas) this.updateGhost(e);
    if (!this.drag) return;
    this.setNDC(e);
    const p = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(this.drag.plane, p)) return;
    const it = this.item(this.drag.id); if (!it) return;
    const m = this.app.library.get(it.model);
    let nx = this.snapV(p.x + this.drag.off.x), nz = this.snapV(p.z + this.drag.off.z);
    if (!this.drag.moved && Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) < 4) return;
    this.drag.moved = true;
    if (m.placement === 'wall') { const s = this.app.apartment.snapToWall(nx, nz, m.size[2] * (it.scale?.[2] || 1)); if (s) { nx = s.x; nz = s.z; it.rot = s.rot; } }
    const dx = nx - it.x, dz = nz - it.z;
    it.x = nx; it.z = nz;
    for (const { d } of this.drag.deps) { d.x += dx; d.z += dz; }
    this.app.items.settleAll(this.design.items, this.app.apartment);
    this.app.refreshItems({ live: true });
    this.app.live?.sendMove([it, ...this.drag.deps.map((x) => x.d)]);
  }
  onUp(e) {
    const app = this.app;
    const still = !e || !this.down || Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) < 6;
    if (this.drag) {
      if (this.drag.moved) { const m = app.library.get(this.item(this.drag.id)?.model); app.store.record(`Moved ${m?.name || 'item'}`, this.drag.before); }
      this.drag = null;
    } else if (this.down && still && performance.now() - this.down.t < 500) {
      const h = this.down.hit;
      if (!h) this.select(null);
      else if (h.type === 'opening') this.toggleOpening(h.key);
      else if (h.type === 'wall' || h.type === 'room') this.select(h);
      else if (h.type === 'item' && this.selection?.id !== h.id) this.select({ type: 'item', id: h.id });
    }
    this.down = null;
    app.cameras.orbit.enabled = app.cameras.mode === 'orbit'; app.cameras.plan.enabled = app.cameras.mode === 'plan';
  }
  onDouble(e) {
    if (this.app.cameras.mode === 'walk') return;
    this.setNDC(e); const h = this.pick();
    // dollhouse: double-click a room to zoom in on it; double-click it again to step inside
    if (h?.type === 'room' && this.app.cameras.mode === 'orbit' && this.app.cameras.focused !== h.index) {
      this.app.cameras.focusRoom(h.index);
      return;
    }
    // double-click any floor to step inside right there
    if (h?.type === 'room' || (this.app.cameras.mode === 'plan' && !h)) {
      const p = h?.point || this.rayPlane(0);
      if (p && this.app.apartment.isInside(p.x, p.z)) {
        const cam = this.app.cameras.persp, yaw = this.app.cameras.mode === 'orbit' ? Math.atan2(-(p.x - cam.position.x), -(p.z - cam.position.z)) : 0;
        this.app.setMode('walk', { at: p, yaw });
        return;
      }
    }
    if (this.app.cameras.mode !== 'orbit') return;
    if (h?.type === 'item') {
      const it = this.item(h.id), t = new THREE.Vector3(it.x, (it.y || 0) + 0.6, it.z);
      const cam = this.app.cameras.persp.position, dir = cam.clone().sub(t).normalize();
      this.app.cameras.flyTo({ pos: t.clone().addScaledVector(dir, 3.5).toArray(), target: t.toArray(), fov: 55 }, 0.9);
    }
  }

  toggleOpening(key) {
    const o = this.app.apartment.openings.find((p) => p.key === key); if (!o) return;
    const open = o.target < 0.5;
    const name = { door: o.front ? 'front door' : 'door', window: 'window', tall: 'window', slider: 'sliding door' }[o.type] || 'opening';
    this.app.store.commit(`${open ? 'Opened' : 'Closed'} ${name}`, (d) => { d.structure.openState[key] = open; });
  }
  toggleItem(id) {
    const it = this.item(id), e = this.app.items.get(id); if (!it || !e) return;
    const on = !this.app.items.isOn(e);
    this.app.store.commit(`Turned ${on ? 'on' : 'off'} ${e.model.name}`, () => { it.state = { ...(it.state || {}), on }; });
  }

  // ------------------------------------------------------------- item ops
  removeSelected() {
    const s = this.selection; if (s?.type !== 'item') return;
    const it = this.item(s.id); if (!it) return;
    const name = this.app.library.get(it.model)?.name || 'item';
    this.app.store.commit(`Removed ${name}`, (d) => { d.items = d.items.filter((x) => x.id !== s.id); });
    this.select(null);
  }
  duplicateSelected() {
    const s = this.selection; if (s?.type !== 'item') return;
    const it = this.item(s.id); if (!it) return;
    const copy = { ...JSON.parse(JSON.stringify(it)), id: uid(), x: it.x + 0.4, z: it.z + 0.4, addedBy: this.app.store.user?.name, likes: [] };
    this.app.store.commit(`Duplicated ${this.app.library.get(it.model)?.name}`, (d) => d.items.push(copy));
    this.select({ type: 'item', id: copy.id });
  }
  rotateSelected(deg) {
    if (this.placing) { this.placing.item.rot = ((this.placing.item.rot || 0) + deg) % 360; this.placing.entry.outer.rotation.y = rad(this.placing.item.rot); return; }
    const s = this.selection; if (s?.type !== 'item') return;
    const it = this.item(s.id); if (!it) return;
    const before = JSON.stringify(this.design);
    const deps = this.dependents(it.id), r = rad(deg);
    for (const d of deps) { // spin things sitting on top along with it
      const dx = d.x - it.x, dz = d.z - it.z;
      d.x = it.x + dx * Math.cos(r) + dz * Math.sin(r); d.z = it.z - dx * Math.sin(r) + dz * Math.cos(r); d.rot = ((d.rot || 0) + deg) % 360;
    }
    it.rot = (((it.rot || 0) + deg) % 360 + 360) % 360;
    this.app.store.record('Rotated', before);
  }
  nudge(dx, dz) {
    const s = this.selection; if (s?.type !== 'item') return;
    const it = this.item(s.id); if (!it) return;
    this.app.store.commit('Nudged', () => { it.x += dx; it.z += dz; for (const d of this.dependents(it.id)) { d.x += dx; d.z += dz; } });
  }

  onKey(e) {
    if (isTyping(e)) return;
    const app = this.app, mod = e.ctrlKey || e.metaKey;
    if (mod && e.code === 'KeyZ') { e.preventDefault(); e.shiftKey ? app.store.redo() : app.store.undo(); return; }
    if (mod && e.code === 'KeyY') { e.preventDefault(); app.store.redo(); return; }
    if (app.cameras.mode === 'walk') {
      if (this.walkKey(e)) return;
      const editKey = ['Delete', 'Backspace', 'KeyR', 'Escape'].includes(e.code) || (mod && e.code === 'KeyD');
      if (!editKey) return;
    }
    if (mod && e.code === 'KeyD') { e.preventDefault(); this.duplicateSelected(); return; }
    switch (e.code) {
      case 'Escape': if (this.placing || this.selection) e.escHandled = true; this.cancelPlacing(); this.select(null); break;
      case 'Delete': case 'Backspace': this.removeSelected(); break;
      case 'KeyR': this.rotateSelected(e.shiftKey ? -90 : 90); break;
      case 'KeyQ': this.rotateSelected(-15); break;
      case 'KeyE': this.rotateSelected(15); break;
      case 'ArrowLeft': e.preventDefault(); this.nudge(e.shiftKey ? -0.25 : -0.05, 0); break;
      case 'ArrowRight': e.preventDefault(); this.nudge(e.shiftKey ? 0.25 : 0.05, 0); break;
      case 'ArrowUp': e.preventDefault(); this.nudge(0, e.shiftKey ? -0.25 : -0.05); break;
      case 'ArrowDown': e.preventDefault(); this.nudge(0, e.shiftKey ? 0.25 : 0.05); break;
    }
  }

  // ------------------------------------------------------------- walk mode
  // What the player is pointing at: screen center when mouse-look is on, otherwise whatever is under the cursor.
  centerRay() {
    if (this.app.cameras.lock.isLocked || !this.mouse) this.ndc.set(0, 0); else this.ndc.copy(this.mouse);
    this.ray.setFromCamera(this.ndc, this.app.cameras.persp); this.ray.far = 4; const h = this.pick(); this.ray.far = Infinity; return h;
  }
  walkKey(e) {
    const app = this.app;
    if (!['KeyE', 'KeyQ', 'KeyG', 'KeyB', 'KeyF', 'KeyM'].includes(e.code)) return false;
    if (e.code === 'KeyM') { if (app.cameras.lock.isLocked) app.cameras.lock.unlock(); else app.cameras.lock.lock(); return true; }
    if (e.code === 'KeyE') {
      const h = this.centerRay();
      if (h?.type === 'item' && app.sim.use(app.items.get(h.id))) return true;
      if (h?.type === 'opening') this.toggleOpening(h.key);
      else if (h?.type === 'item') { const en = app.items.get(h.id); if (en && en.behaviors.some((b) => ['light', 'spin', 'screen', 'airflow'].includes(b.type))) this.toggleItem(h.id); }
    }
    if (e.code === 'KeyQ') { const h = this.centerRay(); if (h?.type === 'item') app.sim.activity(app.items.get(h.id), e.shiftKey); return true; }
    if (e.code === 'KeyG') {
      if (app.physics.held) { app.physics.held = null; return true; }
      const cam = app.cameras.persp, dir = new THREE.Vector3(); cam.getWorldDirection(dir);
      const r = app.physics.dynamicAt(cam.position, dir, 3);
      if (r) app.physics.held = { body: r.body, target: new THREE.Vector3() };
    }
    if (e.code === 'KeyB') {
      const cam = app.cameras.persp, dir = new THREE.Vector3(); cam.getWorldDirection(dir);
      app.scene.add(app.physics.throwBall(cam.position, dir));
    }
    if (e.code === 'KeyF') this.flashlight.intensity = this.flashlight.intensity ? 0 : 40;
    return true;
  }
  walkClick() {
    const app = this.app, cam = app.cameras.persp, dir = new THREE.Vector3(); cam.getWorldDirection(dir);
    if (app.sim.click()) return;
    if (app.sim.active) return;
    if (app.physics.held) {
      const b = app.physics.held.body; app.physics.held = null;
      b.velocity.set(dir.x * 9, dir.y * 9 + 1.5, dir.z * 9); return;
    }
    const r = app.physics.dynamicAt(cam.position, dir, 3);
    if (r) { r.body.applyImpulse(new (r.body.velocity.constructor)(dir.x * 6 * r.body.mass, (dir.y + 0.3) * 6 * r.body.mass, dir.z * 6 * r.body.mass), r.body.position); r.body.wakeUp(); }
  }

  update() {
    this.updateHelper();
    const app = this.app;
    if (app.cameras.mode === 'walk') {
      if (app.physics.held) { const cam = app.cameras.persp, dir = new THREE.Vector3(); cam.getWorldDirection(dir); app.physics.held.target.copy(cam.position).addScaledVector(dir, 1.3); }
      if (app.cameras.mode === 'walk') {
        const h = this.centerRay();
        let hint = '';
        if (h?.type === 'opening') { const o = app.apartment.openings.find((p) => p.key === h.key); hint = `E · ${o?.target > 0.5 ? 'Close' : 'Open'} ${o?.type === 'door' ? 'door' : o?.type === 'slider' ? 'sliding door' : 'window'}`; }
        else if (h?.type === 'item' && app.sim.hint(app.items.get(h.id))) {
          const en = app.items.get(h.id), toggle = en.behaviors.some((b) => ['light', 'spin', 'screen', 'airflow'].includes(b.type)) && !app.sim.choreFor(en);
          hint = (toggle ? `E · Turn ${app.items.isOn(en) ? 'off' : 'on'}   ` : '') + app.sim.hint(en);
        }
        else if (h?.type === 'item') {
          const en = app.items.get(h.id);
          if (en?.dynamic) hint = `G · Grab ${en.model.name} · Click · Push`;
          else if (en?.behaviors.some((b) => ['light', 'spin', 'screen', 'airflow'].includes(b.type))) hint = `E · Turn ${app.items.isOn(en) ? 'off' : 'on'} ${en.model.name}`;
          else if (en) hint = en.model.name;
        }
        if (app.physics.held) hint = 'Click · Throw   G · Drop';
        if (app.sim.active) hint = app.sim.darts ? `🎯 ${app.sim.darts.left} dart${app.sim.darts.left === 1 ? '' : 's'} left · click to throw` : '';
        app.ui?.setWalkHint(hint);
      }
    }
  }
}

function obb(item, m) {
  const s = item.scale || [1, 1, 1];
  return { cx: item.x, cz: item.z, hx: m.size[0] * s[0] / 2, hz: m.size[2] * s[2] / 2, r: rad(item.rot || 0) };
}
function satOverlap(A, B, slack = 0.01) {
  const axes = [A.r, A.r + Math.PI / 2, B.r, B.r + Math.PI / 2].map((r) => [Math.cos(r), -Math.sin(r)]);
  const corners = (O) => [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([a, b]) => [O.cx + a * O.hx * Math.cos(O.r) + b * O.hz * Math.sin(O.r), O.cz - a * O.hx * Math.sin(O.r) + b * O.hz * Math.cos(O.r)]);
  const ca = corners(A), cb = corners(B);
  for (const [ax, az] of axes) {
    const pa = ca.map(([x, z]) => x * ax + z * az), pb = cb.map(([x, z]) => x * ax + z * az);
    if (Math.max(...pa) - slack < Math.min(...pb) || Math.max(...pb) - slack < Math.min(...pa)) return false;
  }
  return true;
}
