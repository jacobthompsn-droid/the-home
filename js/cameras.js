// Camera modes: 'orbit' (dollhouse), 'plan' (blueprint top-down), 'walk' (first person with physics).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { clamp, rad } from './util.js';
import { DEFAULT_HEIGHT, eyeHeight, clampH } from './avatar.js';

// Walk-mode field of view (vertical degrees). ~60° matches how big things look to your own eyes;
// wider angles make rooms feel huge and furniture tiny.
export const DEFAULT_WALK_FOV = 60;
const LS_FOV = 'thehome.walkFov';

export class Cameras extends EventTarget {
  constructor(canvas, physics) {
    super();
    this.canvas = canvas; this.physics = physics;
    this.persp = new THREE.PerspectiveCamera(55, 1, 0.05, 6000);
    this.ortho = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 500);
    this.persp.position.set(12, 14, 22);
    this.persp.layers.enable(1); this.ortho.layers.enable(1);
    this.orbit = new OrbitControls(this.persp, canvas);
    this.orbit.enableDamping = true; this.orbit.dampingFactor = 0.08; this.orbit.maxPolarAngle = Math.PI * 0.495; this.orbit.minDistance = 1.5; this.orbit.maxDistance = 120;
    this.orbit.screenSpacePanning = true;
    // zoom toward whatever is under the cursor, so scrolling dives into a room instead of the middle of the house
    this.orbit.zoomToCursor = true;
    this.orbit.panSpeed = 1.1;
    this.orbit.addEventListener('start', () => { this.fly = null; });
    this.focused = null; // index of the room the dollhouse is zoomed in on (null = whole home)
    this.plan = new OrbitControls(this.ortho, canvas);
    this.plan.enableRotate = false; this.plan.screenSpacePanning = true; this.plan.enableDamping = true;
    this.plan.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    this.plan.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
    this.plan.minZoom = 0.3; this.plan.maxZoom = 8; this.plan.enabled = false;
    this.lock = new PointerLockControls(this.persp, document.body);
    this.lock.addEventListener('lock', () => this.dispatchEvent(new Event('lockchange')));
    this.lock.addEventListener('unlock', () => this.dispatchEvent(new Event('lockchange')));
    this.mode = 'orbit';
    this.keys = new Set();
    this.fly = null; this.bob = 0;
    addEventListener('keydown', (e) => { if (!isTyping(e) && !e.ctrlKey && !e.metaKey) this.keys.add(e.code); });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    this.setupTouch(canvas);
    this.setupDragLook(canvas);
    this.speed = 0; this.vel = new THREE.Vector3();
    this.height = DEFAULT_HEIGHT;
    let fov = DEFAULT_WALK_FOV; try { fov = +localStorage.getItem(LS_FOV) || DEFAULT_WALK_FOV; } catch {}
    this.walkFov = clamp(fov, 45, 90);
  }

  get eye() { return eyeHeight(this.height); }
  // Your real height: sets eye level and the size of your body in the physics world.
  setHeight(h) {
    this.height = clampH(h);
    this.physics.setPlayerHeight(this.height);
    if (this.mode === 'walk') this.persp.position.y = (this.physics.player.position.y || 0) + this.eye;
  }
  setWalkFov(f) {
    this.walkFov = clamp(+f || DEFAULT_WALK_FOV, 45, 90);
    try { localStorage.setItem(LS_FOV, String(this.walkFov)); } catch {}
    if (this.mode === 'walk') { this.persp.fov = this.walkFov; this.persp.updateProjectionMatrix(); }
  }

  get camera() { return this.mode === 'plan' ? this.ortho : this.persp; }
  // walking with input captured (pointer lock on desktop; always on touch devices)
  get walking() { return this.mode === 'walk' && (this.lock.isLocked || this.touch); }

  // Desktop walk mode: click-and-drag anywhere on empty space to look around (no pointer lock needed).
  setupDragLook(canvas) {
    let drag = null;
    canvas.addEventListener('contextmenu', (e) => { if (this.mode === 'walk') e.preventDefault(); });
    canvas.addEventListener('pointerdown', (e) => {
      if (this.mode !== 'walk' || e.pointerType === 'touch' || this.lock.isLocked) return;
      drag = { x: e.clientX, y: e.clientY, moved: 0 };
      canvas.setPointerCapture?.(e.pointerId);
      canvas.style.cursor = 'grabbing';
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
      this.look(dx, dy, 0.0042);
    });
    const end = () => { drag = null; canvas.style.cursor = ''; };
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
    this.lock.pointerSpeed = 0.75;
  }
  look(dx, dy, k) {
    const r = this.persp.rotation; r.order = 'YXZ';
    r.y -= dx * k; r.x = Math.max(-1.35, Math.min(1.35, r.x - dy * k)); r.z = 0;
  }

  // Phones & tablets: left thumb = joystick, right thumb = look, tap = click.
  setupTouch(canvas) {
    this.touch = matchMedia('(pointer: coarse)').matches || new URLSearchParams(location.search).has('touch');
    if (this.touch) document.body.classList.add('touch');
    this.joy = { x: 0, y: 0 };
    const ptrs = new Map();
    const stick = document.createElement('div'); stick.id = 'stick'; stick.innerHTML = '<i></i>'; document.body.append(stick);
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch' || this.mode !== 'walk') return;
      const left = e.clientX < innerWidth * 0.45;
      ptrs.set(e.pointerId, { left, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t: performance.now() });
      if (left) { stick.style.left = e.clientX + 'px'; stick.style.top = e.clientY + 'px'; stick.classList.add('on'); }
    });
    addEventListener('pointermove', (e) => {
      const p = ptrs.get(e.pointerId); if (!p) return;
      if (p.left) {
        const dx = e.clientX - p.x0, dy = e.clientY - p.y0, len = Math.min(1, Math.hypot(dx, dy) / 55), a = Math.atan2(dy, dx);
        this.joy = { x: Math.cos(a) * len, y: Math.sin(a) * len };
        stick.firstChild.style.transform = `translate(${Math.cos(a) * len * 30}px, ${Math.sin(a) * len * 30}px)`;
      } else if (!this.frozen || true) {
        const r = this.persp.rotation; r.order = 'YXZ';
        r.y -= (e.clientX - p.x) * 0.006; r.x = Math.max(-1.4, Math.min(1.4, r.x - (e.clientY - p.y) * 0.006));
      }
      p.x = e.clientX; p.y = e.clientY;
    });
    const up = (e) => {
      const p = ptrs.get(e.pointerId); if (!p) return; ptrs.delete(e.pointerId);
      if (p.left) { this.joy = { x: 0, y: 0 }; stick.classList.remove('on'); stick.firstChild.style.transform = ''; }
      else if (Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < 10 && performance.now() - p.t < 300) this.onTap?.();
    };
    addEventListener('pointerup', up); addEventListener('pointercancel', up);
  }

  frame(apt) {
    this.apt = apt;
    const c = apt.center, b = apt.bounds, span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
    this.orbit.target.copy(c).setY(0.8);
    this.persp.position.set(c.x + span * 0.55, span * 0.95, c.z + span * 0.95);
    this.plan.target.set(c.x, 0, c.z);
    this.ortho.position.set(c.x, 60, c.z + 0.001);
    this.span = span;
    this.home = { pos: this.persp.position.toArray(), target: this.orbit.target.toArray() };
    this.focused = null;
    this.resize(this.w || innerWidth, this.h || innerHeight);
    this.dispatchEvent(new Event('focus'));
  }

  // Dollhouse: swoop in so one room fills the screen, keeping the current compass direction.
  focusRoom(index, duration = 1.1) {
    const r = this.apt?.rooms[index]; if (!r) return;
    const [x0, z0, x1, z1] = r.rect, c = new THREE.Vector3((x0 + x1) / 2, 0.6, (z0 + z1) / 2);
    const radius = Math.hypot(x1 - x0, z1 - z0) / 2 + 1.1;
    // only count the part of the screen that isn't covered by the side panels
    const W = this.w || innerWidth, cover = [...document.querySelectorAll('#left:not(.collapsed), #right:not(.collapsed)')].reduce((a, el) => a + el.getBoundingClientRect().width + 14, 0);
    const visible = W > 900 ? clamp((W - cover) / W, 0.4, 1) : 1;
    const vf = rad(55), hf = 2 * Math.atan(Math.tan(vf / 2) * (this.persp.aspect || 1.6) * visible);
    const dist = clamp(radius / Math.sin(Math.min(vf, hf) / 2), 6, 60);
    const from = this.mode === 'orbit' ? this.persp.position.clone().sub(this.orbit.target) : new THREE.Vector3(0.5, 0, 1);
    const az = Math.atan2(from.x, from.z), polar = rad(38);
    const pos = c.clone().add(new THREE.Vector3(Math.sin(az) * Math.sin(polar), Math.cos(polar), Math.cos(az) * Math.sin(polar)).multiplyScalar(dist));
    this.focused = index;
    this.flyTo({ pos: pos.toArray(), target: c.toArray(), fov: 55 }, duration);
    this.dispatchEvent(new Event('focus'));
  }
  // Back out to the whole-home view.
  frameAll(duration = 1.1) {
    if (!this.home) return;
    this.focused = null;
    this.flyTo({ pos: this.home.pos, target: this.home.target, fov: 55 }, duration);
    this.dispatchEvent(new Event('focus'));
  }

  resize(w, h) {
    this.w = w; this.h = h;
    this.persp.aspect = w / h; this.persp.updateProjectionMatrix();
    const s = (this.span || 16) * 0.62, a = w / h;
    this.ortho.left = -s * a; this.ortho.right = s * a; this.ortho.top = s; this.ortho.bottom = -s; this.ortho.updateProjectionMatrix();
  }

  setMode(mode, opts = {}) {
    const prev = this.mode;
    this.mode = mode; this.fly = null;
    this.orbit.enabled = mode === 'orbit';
    this.plan.enabled = mode === 'plan';
    if (mode === 'walk') {
      const sp = opts.spawn || this.apt?.bp.spawn || [0, 0, 0];
      let pos = new THREE.Vector3(sp[0], 0.05, sp[1]);
      if (opts.at) pos = opts.at.clone().setY(0.05);
      this.physics.setPlayerActive(true, pos);
      this.persp.position.set(pos.x, this.eye, pos.z);
      const yaw = opts.yaw ?? rad(sp[2] || 0); // spawn[2] = yaw degrees, 0 = facing north
      this.persp.rotation.set(0, yaw, 0, 'YXZ');
      this.persp.fov = this.walkFov; this.persp.updateProjectionMatrix();
      this.vel.set(0, 0, 0); this.speed = 0;
      if (opts.lock === true && !this.touch) this.lock.lock();
      setTimeout(() => this.dispatchEvent(new Event('lockchange')), 0);
    } else {
      if (prev === 'walk') {
        this.physics.setPlayerActive(false);
        if (this.lock.isLocked) this.lock.unlock();
        // look at where the player was
        const p = this.persp.position.clone(), dir = new THREE.Vector3(); this.persp.getWorldDirection(dir);
        this.orbit.target.copy(p).addScaledVector(dir, 2).setY(1);
        this.persp.position.copy(p).add(new THREE.Vector3(-dir.x * 4, 4, -dir.z * 4));
      }
      this.persp.fov = 55; this.persp.updateProjectionMatrix();
    }
    this.dispatchEvent(new Event('mode'));
  }

  // Dollhouse: WASD (and arrow keys when nothing is selected) slide the view across the floor plan.
  keyPan(dt) {
    const k = this.keys, arrows = !this.arrowsBusy?.();
    const f = (k.has('KeyW') || (arrows && k.has('ArrowUp')) ? 1 : 0) - (k.has('KeyS') || (arrows && k.has('ArrowDown')) ? 1 : 0);
    const r = (k.has('KeyD') || (arrows && k.has('ArrowRight')) ? 1 : 0) - (k.has('KeyA') || (arrows && k.has('ArrowLeft')) ? 1 : 0);
    if (!f && !r) return;
    this.fly = null;
    const dir = this.orbit.target.clone().sub(this.persp.position); dir.y = 0;
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
    dir.normalize();
    const right = new THREE.Vector3(-dir.z, 0, dir.x);
    const dist = this.persp.position.distanceTo(this.orbit.target);
    const step = dir.multiplyScalar(f).add(right.multiplyScalar(r)).normalize().multiplyScalar(Math.max(2, dist * 0.8) * dt * (k.has('ShiftLeft') || k.has('ShiftRight') ? 2.2 : 1));
    this.orbit.target.add(step); this.persp.position.add(step);
  }

  // Save / restore points of view
  capture() {
    const cam = this.persp, dir = new THREE.Vector3(); cam.getWorldDirection(dir);
    const target = this.mode === 'orbit' ? this.orbit.target.clone() : cam.position.clone().addScaledVector(dir, 1.5);
    return { pos: cam.position.toArray().map((v) => +v.toFixed(3)), target: target.toArray().map((v) => +v.toFixed(3)), fov: cam.fov, eye: this.mode === 'walk' };
  }
  flyTo(view, duration = 1.4) {
    if (this.mode !== 'orbit') this.setMode('orbit');
    this.fly = { t: 0, d: duration, p0: this.persp.position.clone(), t0: this.orbit.target.clone(), p1: new THREE.Vector3(...view.pos), t1: new THREE.Vector3(...view.target), f0: this.persp.fov, f1: view.fov || 55 };
  }

  update(dt) {
    if (this.fly) {
      const f = this.fly; f.t += dt; const k = clamp(f.t / f.d, 0, 1), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      this.persp.position.lerpVectors(f.p0, f.p1, e); this.orbit.target.lerpVectors(f.t0, f.t1, e);
      this.persp.fov = f.f0 + (f.f1 - f.f0) * e; this.persp.updateProjectionMatrix();
      if (k >= 1) this.fly = null;
    }
    if (this.mode === 'orbit') { this.keyPan(dt); this.orbit.update(); }
    if (this.mode === 'plan') { this.plan.update(); }
    if (this.mode === 'walk') {
      const k = this.keys, run = k.has('ShiftLeft') || k.has('ShiftRight');
      const f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
      const r = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
      const turn = (k.has('ArrowLeft') ? 1 : 0) - (k.has('ArrowRight') ? 1 : 0);
      if (turn) this.look(-turn * 160 * dt, 0, 0.012);
      const dir = new THREE.Vector3(); this.persp.getWorldDirection(dir); dir.y = 0; dir.normalize();
      const right = new THREE.Vector3(-dir.z, 0, dir.x);
      const want = dir.clone().multiplyScalar(f - this.joy.y).add(right.multiplyScalar(r + this.joy.x));
      if (want.lengthSq() > 1) want.normalize();
      want.multiplyScalar(run ? 4.6 : 2.3);
      if (this.frozen) { if (want.lengthSq() > 0) this.onMoveAttempt?.(); return; }
      // ease in / ease out like a real walk (frame-rate independent)
      const ground = this.physics.onGround();
      const accel = want.lengthSq() ? (ground ? 9 : 2) : (ground ? 12 : 1.5);
      this.vel.lerp(want, 1 - Math.exp(-accel * dt));
      this.physics.movePlayer(this.vel.x, this.vel.z, k.has('Space'));
      const p = this.physics.player.interpolatedPosition || this.physics.player.position;
      const sp = Math.hypot(this.vel.x, this.vel.z);
      this.speed += (sp - this.speed) * Math.min(1, dt * 8);
      if (ground) this.bob += dt * (4.2 + this.speed * 2.2);
      const amp = Math.min(this.speed / 4.6, 1) * 0.028;
      const eye = p.y + this.eye + Math.sin(this.bob * 2) * amp;
      // smooth camera follow removes physics jitter
      this.persp.position.x = p.x; this.persp.position.z = p.z;
      this.persp.position.y += (eye - this.persp.position.y) * Math.min(1, dt * 18);
    }
  }
}

export const isTyping = (e) => ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName) || e.target?.isContentEditable;
