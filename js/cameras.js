// Camera modes: 'orbit' (dollhouse), 'plan' (blueprint top-down), 'walk' (first person with physics).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { clamp, rad } from './util.js';

const EYE = 1.62;

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
    addEventListener('keydown', (e) => { if (!isTyping(e)) this.keys.add(e.code); });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    this.setupTouch(canvas);
  }

  get camera() { return this.mode === 'plan' ? this.ortho : this.persp; }
  // walking with input captured (pointer lock on desktop; always on touch devices)
  get walking() { return this.mode === 'walk' && (this.lock.isLocked || this.touch); }

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
    this.resize(this.w || innerWidth, this.h || innerHeight);
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
      this.persp.position.set(pos.x, EYE, pos.z);
      const yaw = opts.yaw ?? rad(sp[2] || 0); // spawn[2] = yaw degrees, 0 = facing north
      this.persp.rotation.set(0, yaw, 0, 'YXZ');
      this.persp.fov = 70; this.persp.updateProjectionMatrix();
      if (opts.lock !== false && !this.touch) this.lock.lock();
      if (this.touch) setTimeout(() => this.dispatchEvent(new Event('lockchange')), 0);
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
    if (this.mode === 'orbit') this.orbit.update();
    if (this.mode === 'plan') { this.plan.update(); }
    if (this.mode === 'walk') {
      const k = this.keys, run = k.has('ShiftLeft') || k.has('ShiftRight');
      const f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
      const r = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
      const dir = new THREE.Vector3(); this.persp.getWorldDirection(dir); dir.y = 0; dir.normalize();
      const right = new THREE.Vector3(-dir.z, 0, dir.x);
      const v = dir.clone().multiplyScalar(f - this.joy.y).add(right.multiplyScalar(r + this.joy.x));
      if (v.lengthSq() > 0) v.normalize().multiplyScalar(run ? 4.2 : 1.9);
      if (this.frozen) { if (v.lengthSq() > 0) this.onMoveAttempt?.(); return; }
      this.physics.movePlayer(v.x, v.z, k.has('Space'));
      const p = this.physics.player.position;
      const moving = v.lengthSq() > 0 && this.physics.onGround();
      this.bob += dt * (run ? 11 : 7) * (moving ? 1 : 0);
      this.persp.position.set(p.x, p.y + EYE + (moving ? Math.sin(this.bob) * 0.03 : 0), p.z);
    }
  }
}

export const isTyping = (e) => ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName) || e.target?.isContentEditable;
