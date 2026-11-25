// Renders real 3D thumbnails of Playbox models (in the current style) on a small offscreen renderer.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildModel } from './models.js';

const SIZE = 192;

export class Thumbs {
  constructor() { this.cache = new Map(); this.waiting = new Map(); this.queue = []; this.busy = false; }

  setup() {
    if (this.r) return;
    const r = this.r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setSize(SIZE, SIZE, false); r.setPixelRatio(1);
    r.toneMapping = THREE.AgXToneMapping; r.toneMappingExposure = 1.15;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    const s = this.scene = new THREE.Scene();
    s.environment = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture; s.environmentIntensity = 0.75;
    const key = new THREE.DirectionalLight('#fff4e6', 2.4); key.position.set(3, 6, 4); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); key.shadow.radius = 4; Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3 });
    s.add(key, key.target);
    this.key = key;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.ShadowMaterial({ opacity: 0.22 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; s.add(ground); this.ground = ground;
    this.cam = new THREE.PerspectiveCamera(28, 1, 0.01, 100);
  }

  // Returns a cached data URL or null; calls cb(url) when ready.
  get(model, style, cb) {
    const k = model.id + '|' + style.id + '|' + (model.parts?.length || 0);
    if (this.cache.has(k)) return this.cache.get(k);
    if (!this.waiting.has(k)) { this.waiting.set(k, []); this.queue.push({ k, model, style }); }
    this.waiting.get(k).push(cb);
    this.pump();
    return null;
  }

  pump() {
    if (this.busy || !this.queue.length) return;
    this.busy = true;
    const step = () => {
      const t0 = performance.now();
      while (this.queue.length && performance.now() - t0 < 12) {
        const job = this.queue.shift();
        let url = null;
        try { url = this.render(job.model, job.style); } catch (e) { console.warn('thumb failed', job.model.id, e); }
        this.cache.set(job.k, url);
        for (const cb of this.waiting.get(job.k) || []) cb(url);
        this.waiting.delete(job.k);
      }
      if (this.queue.length) requestAnimationFrame(step); else this.busy = false;
    };
    requestAnimationFrame(step);
  }

  render(model, style) {
    this.setup();
    const obj = buildModel(model, { style, seed: model.id });
    obj.userData.glowMats.forEach((m) => { m.emissiveIntensity = m.userData.glowMax * 0.8; });
    const [w, h, d] = model.size;
    if (model.placement === 'ceiling') obj.position.y = h;
    this.scene.add(obj);
    this.ground.visible = model.placement !== 'wall' && model.placement !== 'ceiling';
    const box = new THREE.Box3().setFromObject(obj), c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
    const radius = sz.length() / 2;
    const dist = radius / Math.sin((this.cam.fov / 2) * Math.PI / 180) * 0.92;
    const dir = model.placement === 'wall' ? new THREE.Vector3(0.35, 0.18, 1) : new THREE.Vector3(1.05, 0.78, 1.45);
    this.cam.position.copy(c).addScaledVector(dir.normalize(), dist);
    this.cam.lookAt(c); this.cam.near = dist / 50; this.cam.far = dist * 4; this.cam.updateProjectionMatrix();
    this.key.position.copy(c).add(new THREE.Vector3(2.5, 5, 3.5)); this.key.target.position.copy(c);
    this.r.render(this.scene, this.cam);
    const url = this.r.domElement.toDataURL('image/webp', 0.9);
    this.scene.remove(obj);
    return url;
  }
}
