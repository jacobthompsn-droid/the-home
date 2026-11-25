// Real physics (cannon-es): walls & furniture collide, the walking player has gravity and can jump,
// physics toys (balls, pillows, boxes, bean bags) fall, bounce, get pushed by fans and wind, and can be thrown.
import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { rad } from './util.js';

export class Physics {
  constructor() {
    const w = this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.81, 0) });
    w.broadphase = new CANNON.SAPBroadphase(w); w.allowSleep = true;
    w.defaultContactMaterial.friction = 0.4; w.defaultContactMaterial.restitution = 0.15;
    this.playerMat = new CANNON.Material('player'); this.bouncy = new CANNON.Material('bouncy');
    w.addContactMaterial(new CANNON.ContactMaterial(this.playerMat, w.defaultMaterial, { friction: 0, restitution: 0 }));
    w.addContactMaterial(new CANNON.ContactMaterial(this.bouncy, w.defaultMaterial, { friction: 0.5, restitution: 0.75 }));
    const ground = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: w.defaultMaterial });
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0); w.addBody(ground);
    this.structure = []; this.furniture = new Map(); this.openingBodies = new Map(); this.dynamic = new Map(); this.temp = [];
    // player
    this.player = new CANNON.Body({ mass: 70, material: this.playerMat, fixedRotation: true, linearDamping: 0.0, allowSleep: false });
    this.player.addShape(new CANNON.Sphere(0.28), new CANNON.Vec3(0, 0.28, 0));
    this.player.addShape(new CANNON.Sphere(0.25), new CANNON.Vec3(0, 0.75, 0));
    this.player.addShape(new CANNON.Sphere(0.22), new CANNON.Vec3(0, 1.25, 0));
    this.playerActive = false;
  }

  boxBody(pos, half, rotY = 0) {
    const b = new CANNON.Body({ mass: 0, material: this.world.defaultMaterial, shape: new CANNON.Box(new CANNON.Vec3(...half.map((v) => Math.max(v, 0.005)))) });
    b.position.set(...pos); if (rotY) b.quaternion.setFromEuler(0, rotY, 0);
    return b;
  }

  setStructure(apartment) {
    for (const b of this.structure) this.world.removeBody(b);
    for (const b of this.openingBodies.values()) this.world.removeBody(b);
    this.structure = []; this.openingBodies.clear();
    for (const c of apartment.colliders) { const b = this.boxBody(c.pos, c.half); this.world.addBody(b); this.structure.push(b); }
    // ceiling so jumping/throwing stays inside
    for (const [x0, z0, x1, z1] of apartment.bp.footprint) {
      const b = this.boxBody([(x0 + x1) / 2, apartment.H + 0.1, (z0 + z1) / 2], [(x1 - x0) / 2, 0.1, (z1 - z0) / 2]);
      this.world.addBody(b); this.structure.push(b);
    }
    this.apartment = apartment;
    this.syncOpenings();
  }

  syncOpenings() {
    if (!this.apartment) return;
    for (const o of this.apartment.openings) {
      o.colliders.forEach((c, i) => {
        const key = o.key + ':' + i, has = this.openingBodies.has(key);
        const want = c.always || o.target < 0.5;
        if (want && !has) { const b = this.boxBody(c.pos, c.half); this.world.addBody(b); this.openingBodies.set(key, b); }
        if (!want && has) { this.world.removeBody(this.openingBodies.get(key)); this.openingBodies.delete(key); }
      });
    }
  }

  // Static colliders for furniture + dynamic bodies for physics toys.
  syncItems(layer) {
    const seen = new Set();
    for (const e of layer.entries.values()) {
      const it = e.item, m = e.model, id = it.id; seen.add(id);
      const s = it.scale || [1, 1, 1];
      if (e.dynamic) {
        let d = this.dynamic.get(id);
        const sig = JSON.stringify([it.x, it.y, it.z, it.rot, s]);
        if (!d) {
          const ph = m.physics;
          const shape = ph.shape === 'sphere' ? new CANNON.Sphere(m.size[0] * s[0] / 2) : new CANNON.Box(new CANNON.Vec3(m.size[0] * s[0] / 2, m.size[1] * s[1] / 2, m.size[2] * s[2] / 2));
          const body = new CANNON.Body({ mass: ph.mass, shape, material: ph.restitution > 0.5 ? this.bouncy : this.world.defaultMaterial, linearDamping: 0.15, angularDamping: 0.3 });
          body.sleepSpeedLimit = 0.15;
          d = { body, entry: e, sig: '', halfH: m.size[1] * s[1] / 2 };
          this.world.addBody(body); this.dynamic.set(id, d);
        }
        d.entry = e; e.body = d.body;
        if (d.sig !== sig) { // moved in the editor → teleport
          d.sig = sig;
          d.body.position.set(it.x, (it.y || 0) + d.halfH + 0.02, it.z); d.body.quaternion.setFromEuler(0, rad(it.rot || 0), 0);
          d.body.velocity.setZero(); d.body.angularVelocity.setZero(); d.body.wakeUp();
        }
        continue;
      }
      const ph = m.physics || {};
      if (ph.body === 'none' || m.rug || m.placement === 'ceiling' || m.placement === 'wall') { this.removeFurniture(id); continue; }
      const sig = JSON.stringify([it.x, it.y, it.z, it.rot, s, m.id]);
      const f = this.furniture.get(id);
      if (f && f.sig === sig) continue;
      this.removeFurniture(id);
      const body = new CANNON.Body({ mass: 0, material: this.world.defaultMaterial });
      const cols = ph.colliders?.length ? ph.colliders : [[0, m.size[1] / 2, 0, ...m.size]];
      for (const [cx, cy, cz, w, h, d] of cols) body.addShape(new CANNON.Box(new CANNON.Vec3(w * s[0] / 2, h * s[1] / 2, d * s[2] / 2)), new CANNON.Vec3(cx * s[0], cy * s[1], cz * s[2]));
      body.position.set(it.x, it.y || 0, it.z); body.quaternion.setFromEuler(0, rad(it.rot || 0), 0);
      this.world.addBody(body); this.furniture.set(id, { body, sig });
      // wake toys that might have been resting on the old position
      for (const dd of this.dynamic.values()) dd.body.wakeUp();
    }
    for (const id of [...this.furniture.keys()]) if (!seen.has(id)) this.removeFurniture(id);
    for (const [id, d] of [...this.dynamic]) if (!seen.has(id)) { this.world.removeBody(d.body); this.dynamic.delete(id); }
  }
  removeFurniture(id) { const f = this.furniture.get(id); if (f) { this.world.removeBody(f.body); this.furniture.delete(id); } }

  setPlayerActive(on, pos) {
    if (on && !this.playerActive) { this.world.addBody(this.player); }
    if (!on && this.playerActive) this.world.removeBody(this.player);
    this.playerActive = on;
    if (on && pos) { this.player.position.set(pos.x, Math.max(pos.y, 0.02), pos.z); this.player.velocity.setZero(); }
  }
  movePlayer(vx, vz, jump) {
    const p = this.player;
    p.velocity.x = vx; p.velocity.z = vz;
    if (jump && this.onGround() && p.velocity.y < 0.5) p.velocity.y = 4.2;
  }
  onGround() {
    const from = this.player.position.clone(); from.y += 0.1;
    const to = from.clone(); to.y -= 0.25;
    const r = new CANNON.RaycastResult();
    this.world.raycastClosest(from, to, { skipBackfaces: true, collisionFilterMask: -1 }, r);
    return r.hasHit && r.body !== this.player || this.player.position.y < 0.03;
  }

  // Throw a temporary ball from the camera
  throwBall(origin, dir) {
    const body = new CANNON.Body({ mass: 0.6, shape: new CANNON.Sphere(0.12), material: this.bouncy, linearDamping: 0.1 });
    body.position.set(origin.x + dir.x * 0.6, origin.y + dir.y * 0.6, origin.z + dir.z * 0.6);
    body.velocity.set(dir.x * 11, dir.y * 11 + 1.5, dir.z * 11);
    this.world.addBody(body);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 14), new THREE.MeshStandardMaterial({ color: '#e0662a', roughness: 0.7 }));
    mesh.castShadow = true;
    this.temp.push({ body, mesh, age: 0 });
    if (this.temp.length > 12) { const t = this.temp.shift(); this.world.removeBody(t.body); t.mesh.removeFromParent(); }
    return mesh;
  }

  // Find a dynamic body hit by a ray (for grabbing/pushing)
  dynamicAt(origin, dir, maxDist = 3) {
    const from = new CANNON.Vec3(origin.x, origin.y, origin.z), to = new CANNON.Vec3(origin.x + dir.x * maxDist, origin.y + dir.y * maxDist, origin.z + dir.z * maxDist);
    const r = new CANNON.RaycastResult();
    this.world.raycastClosest(from, to, { skipBackfaces: true }, r);
    if (!r.hasHit || r.body.mass === 0 || r.body === this.player) return null;
    return r;
  }

  step(dt, airAt) {
    // air forces from fans / AC / open windows on light objects
    if (airAt) {
      const all = [...this.dynamic.values()].map((d) => d.body).concat(this.temp.map((t) => t.body));
      for (const b of all) {
        const v = airAt(new THREE.Vector3(b.position.x, b.position.y, b.position.z));
        const sp = v.length();
        if (sp < 0.15) continue;
        const rel = new CANNON.Vec3(v.x - b.velocity.x, v.y - b.velocity.y, v.z - b.velocity.z);
        const area = b.shapes[0].boundingSphereRadius ** 2 * Math.PI;
        const f = rel.scale(0.6 * area * sp * 1.2);
        b.applyForce(f, b.position); b.wakeUp();
      }
    }
    if (this.held) {
      const b = this.held.body, t = this.held.target;
      b.velocity.set((t.x - b.position.x) * 12, (t.y - b.position.y) * 12, (t.z - b.position.z) * 12);
      b.angularVelocity.scale(0.8, b.angularVelocity);
    }
    this.world.step(1 / 60, dt, 4);
    for (const d of this.dynamic.values()) {
      const o = d.entry.outer, b = d.body;
      o.position.set(b.position.x, b.position.y - d.halfH, b.position.z);
      // rotate around the body center: offset the inner model so the pivot is centered
      d.entry.inner.position.y = 0;
      o.quaternion.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
      if (Math.abs(o.quaternion.x) > 0.01 || Math.abs(o.quaternion.z) > 0.01) {
        // keep visual centered on the body when tumbling
        const off = new THREE.Vector3(0, d.halfH, 0).applyQuaternion(o.quaternion);
        o.position.set(b.position.x - off.x, b.position.y - off.y, b.position.z - off.z);
      }
      if (b.position.y < -50) { b.position.set(d.entry.item.x, 1, d.entry.item.z); b.velocity.setZero(); }
    }
    for (const t of this.temp) { t.mesh.position.copy(t.body.position); t.mesh.quaternion.copy(t.body.quaternion); }
  }
}
