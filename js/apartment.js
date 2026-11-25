// Builds the apartment shell (walls, openings, floors, ceilings, building) from a blueprint.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { OPENING_DEFAULTS } from './data/blueprints.js';
import { FLOOR_TYPES, floorRole } from './data/styles.js';
import { floorTexture, wallTexture, facadeTexture } from './textures.js';
import { fmtArea, clamp } from './util.js';

const EXT_T = 0.2, INT_T = 0.12, FLOOR_HEIGHT = 3.2;

export class Apartment {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group(); this.group.name = 'apartment';
    scene.add(this.group);
    this.cutPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 100);
    this.openings = []; this.walls = []; this.rooms = [];
  }

  dispose() {
    this.group.traverse((o) => { if (o.isMesh && o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); if (o.element) o.element.remove(); });
    this.group.clear();
  }

  build(bp, style, design) {
    this.dispose();
    this.bp = bp; this.style = style; this.H = bp.height || 2.8;
    const S = design.structure || {};
    const level = design.env?.level ?? 5;
    this.groundY = -(level - 1) * FLOOR_HEIGHT - 0.3;
    this.walls = []; this.openings = []; this.rooms = []; this.colliders = [];
    this.wallMeshes = []; this.floorMeshes = []; this.clipMats = [];
    this.indoorRects = bp.rooms.filter((r) => r.type !== 'outdoor').map((r) => r.rect);
    this.outdoorRects = bp.rooms.filter((r) => r.type === 'outdoor').map((r) => r.rect);
    const all = bp.rooms.map((r) => r.rect).concat(bp.footprint);
    this.bounds = { minX: Math.min(...all.map((r) => r[0])), minZ: Math.min(...all.map((r) => r[1])), maxX: Math.max(...all.map((r) => r[2])), maxZ: Math.max(...all.map((r) => r[3])) };
    this.center = new THREE.Vector3((this.bounds.minX + this.bounds.maxX) / 2, 0, (this.bounds.minZ + this.bounds.maxZ) / 2);

    this.mat = {
      cap: this.clip(new THREE.MeshStandardMaterial({ color: '#3a3836', roughness: 0.9 })),
      trim: this.clip(new THREE.MeshStandardMaterial({ color: style.trim, roughness: 0.5 })),
      glass: this.clip(new THREE.MeshStandardMaterial({ color: '#bcd9e6', roughness: 0.03, metalness: 0.1, transparent: true, opacity: 0.18, depthWrite: false })),
      door: this.clip(new THREE.MeshStandardMaterial({ color: style.pal.wood, roughness: 0.55 })),
      frontDoor: this.clip(new THREE.MeshStandardMaterial({ color: style.trim, roughness: 0.4 })),
      metal: this.clip(new THREE.MeshStandardMaterial({ color: '#2b2b2b', roughness: 0.4, metalness: 0.7 })),
      ceiling: new THREE.MeshStandardMaterial({ color: style.ceiling, roughness: 0.95 }),
    };
    this.wallMatCache = new Map();

    this.buildFloors(S);
    bp.walls.forEach((w, i) => this.buildWall(w, i, S));
    this.buildCeilings();
    this.buildBuilding();
    this.buildLabels();
    return this;
  }

  clip(m) { m.clippingPlanes = [this.cutPlane]; this.clipMats?.push(m); return m; }
  setCutaway(height) { this.cutPlane.constant = height == null ? 100 : height; }

  wallMaterial(color, finish) {
    const k = color + finish;
    if (!this.wallMatCache.has(k)) {
      const map = wallTexture(finish, color);
      this.wallMatCache.set(k, this.clip(new THREE.MeshStandardMaterial({ color: finish === 'brick' ? '#ffffff' : color, map, roughness: finish === 'panel' ? 0.6 : 0.92 })));
    }
    return this.wallMatCache.get(k);
  }

  // -------------------------------------------------------------- floors
  buildFloors(S) {
    const matCache = new Map();
    this.bp.rooms.forEach((room, i) => {
      const typeId = S.floors?.[room.name] || this.style.floors[floorRole(room.type)] || 'oak';
      const type = FLOOR_TYPES[typeId] || FLOOR_TYPES.oak;
      if (!matCache.has(typeId)) {
        const rough = { wood: 0.42, herringbone: 0.42, tile: 0.25, carpet: 0.97, concrete: 0.45, marble: 0.12, deck: 0.8 }[type.kind] ?? 0.5;
        matCache.set(typeId, new THREE.MeshStandardMaterial({ map: floorTexture(type), roughness: rough }));
      }
      const [x0, z0, x1, z1] = room.rect;
      const ws = floorTexture(type)?.userData.worldSize || 1;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([x0, 0, z0, x0, 0, z1, x1, 0, z1, x1, 0, z0], 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([x0 / ws, z0 / ws, x0 / ws, z1 / ws, x1 / ws, z1 / ws, x1 / ws, z0 / ws], 2));
      g.setIndex([0, 1, 2, 0, 2, 3]);
      const mesh = new THREE.Mesh(g, matCache.get(typeId));
      mesh.position.y = 0.002; mesh.receiveShadow = true;
      mesh.userData = { kind: 'floor', roomIndex: i };
      this.group.add(mesh); this.floorMeshes.push(mesh);
      this.rooms.push({ ...room, index: i, floor: typeId, mesh, indoor: room.type !== 'outdoor', area: (x1 - x0) * (z1 - z0) });
      // slab under outdoor areas (indoor slabs are part of the building mass)
      if (room.type === 'outdoor') this.addBox([(x0 + x1) / 2, -0.15, (z0 + z1) / 2], [x1 - x0, 0.3, z1 - z0], this.mat.cap, { shadow: true });
    });
  }

  // -------------------------------------------------------------- walls
  buildWall(spec, index, S) {
    const [axis, c, a0, a1, opts = {}] = spec;
    const H = this.H;
    if (opts.rail) return this.buildRailing(axis, c, a0, a1, index);
    const t = opts.ext ? EXT_T : INT_T;
    const color = S.wallColors?.[index] || S.wallColor || this.style.wall;
    const finish = S.wallFinishes?.[index] || S.wallFinish || this.style.wallFinish || 'paint';
    const mat = this.wallMaterial(color, finish);
    const mats = [mat, mat, this.mat.cap, mat, mat, mat];
    const wall = { index, axis, c, a0, a1, t, ext: !!opts.ext, meshes: [] };
    const ext = t / 2, L = a1 - a0;
    const hJit = (index % 7) * 0.002 + (opts.ext ? 0.01 : 0);
    // normal pointing to the "outside" for exterior walls (+axis side by default)
    const nrm = axis === 'h' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    if (opts.ext) {
      const probe = (s) => axis === 'h' ? this.isIndoor((a0 + a1) / 2, c + s * 0.4) : this.isIndoor(c + s * 0.4, (a0 + a1) / 2);
      if (probe(1) && !probe(-1)) nrm.negate();
    }
    wall.normal = nrm;
    const piece = (s0, s1, y0, y1) => {
      if (s1 - s0 < 0.005 || y1 - y0 < 0.005) return;
      const mid = a0 + (s0 + s1) / 2, len = s1 - s0, h = y1 - y0;
      const size = axis === 'h' ? [len, h, t] : [t, h, len];
      const pos = axis === 'h' ? [mid, (y0 + y1) / 2, c] : [c, (y0 + y1) / 2, mid];
      const g = new THREE.BoxGeometry(...size);
      worldUV(g, size, mat.map?.userData.worldSize || 1, axis === 'h' ? a0 + s0 : a0 + s0);
      const m = new THREE.Mesh(g, mats);
      m.position.set(...pos); m.castShadow = true; m.receiveShadow = true;
      m.userData = { kind: 'wall', wallIndex: index };
      this.group.add(m); wall.meshes.push(m); this.wallMeshes.push(m);
      this.colliders.push({ pos, half: size.map((v) => v / 2) });
    };
    const opens = (opts.open || []).map((o, k) => ({ ...OPENING_DEFAULTS[o.t], ...o, k })).sort((p, q) => p.c - q.c);
    let cur = -ext;
    for (const o of opens) {
      const s0 = o.c - o.w / 2, s1 = o.c + o.w / 2;
      piece(cur, s0, 0, H + hJit);
      if (o.sill > 0) piece(s0, s1, 0, o.sill);
      const head = Math.min(o.head, H - 0.02);
      piece(s0, s1, head, H + hJit);
      this.buildOpening(wall, o, s0, s1, { ...o, head }, S);
      cur = s1;
    }
    piece(cur, L + ext, 0, H + hJit);
    this.walls.push(wall);
  }

  buildOpening(wall, o, s0, s1, oo, S) {
    const { axis, c, a0, t } = wall;
    const key = `w${wall.index}o${o.k}`;
    const w = s1 - s0, h = oo.head - oo.sill, midS = a0 + (s0 + s1) / 2;
    const center = axis === 'h' ? new THREE.Vector3(midS, oo.sill + h / 2, c) : new THREE.Vector3(c, oo.sill + h / 2, midS);
    const g = new THREE.Group(); g.position.copy(center);
    if (axis === 'v') g.rotation.y = -Math.PI / 2; // local +x runs along the wall
    this.group.add(g);
    const opening = { key, type: o.t, wall, center, width: w, sill: oo.sill, head: oo.head, group: g, normal: wall.normal.clone(), front: !!o.front, open: 0, target: 0, colliders: [] };
    const frameDepth = t + 0.02, fw = 0.05;
    const box = (size, pos, mat, parent = g, data = {}) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(...size), mat); m.position.set(...pos);
      m.castShadow = mat !== this.mat.glass; m.receiveShadow = true; m.userData = { kind: 'opening', key, ...data }; parent.add(m); return m;
    };
    const interiorSide = (() => {
      // which local z side (+1/-1) is indoors? local z corresponds to world +z ('h') or world -x... compute from world normal
      const n = wall.ext ? wall.normal.clone().negate() : new THREE.Vector3(axis === 'h' ? 0 : 1, 0, axis === 'h' ? 1 : 0);
      const local = n.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -g.rotation.y);
      return Math.sign(local.z) || 1;
    })();
    opening.interiorSide = interiorSide;

    if (o.t !== 'opening') {
      // frame
      box([w + fw * 2, fw, frameDepth], [0, h / 2 + fw / 2, 0], this.mat.trim);
      box([fw, h, frameDepth], [-w / 2 - fw / 2, 0, 0], this.mat.trim);
      box([fw, h, frameDepth], [w / 2 + fw / 2, 0, 0], this.mat.trim);
      if (oo.sill > 0) box([w + fw * 2 + 0.06, 0.03, frameDepth + 0.06], [0, -h / 2 - 0.015, 0], this.mat.trim);
    }
    if (o.t === 'window' || o.t === 'tall') {
      const sash = new THREE.Group(); g.add(sash);
      box([w - 0.02, h - 0.02, 0.012], [0, 0, 0], this.mat.glass, sash, { pane: true });
      box([w, 0.035, 0.04], [0, h / 2 - 0.02, 0], this.mat.trim, sash);
      box([w, 0.035, 0.04], [0, -h / 2 + 0.02, 0], this.mat.trim, sash);
      if (w > 1.3) box([0.03, h, 0.04], [0, 0, 0], this.mat.trim, sash);
      opening.animate = (v) => { sash.position.y = v * h * 0.48; sash.position.z = interiorSide * 0.03 * Math.min(1, v * 4); };
      opening.colliders = [{ always: true, pos: center.toArray(), half: axis === 'h' ? [w / 2, h / 2, 0.04] : [0.04, h / 2, w / 2] }];
    } else if (o.t === 'slider') {
      const fixed = new THREE.Group(), moving = new THREE.Group(); g.add(fixed, moving);
      const pw = w / 2 + 0.03;
      box([pw, h - 0.02, 0.012], [-w / 4, 0, -0.03], this.mat.glass, fixed, { pane: true });
      box([0.04, h, 0.05], [-w / 2 + 0.02, 0, -0.03], this.mat.trim, fixed);
      box([pw, h - 0.02, 0.012], [w / 4, 0, 0.03], this.mat.glass, moving, { pane: true });
      box([0.04, h, 0.05], [w / 2 - 0.02, 0, 0.03], this.mat.trim, moving);
      box([0.04, h, 0.05], [0.02, 0, 0.03], this.mat.trim, moving);
      box([0.02, 0.25, 0.04], [0.06, 0, 0.06], this.mat.metal, moving);
      opening.animate = (v) => { moving.position.x = -v * (w / 2 - 0.02); };
      const half = (frac) => axis === 'h' ? [w / 2 * frac, h / 2, 0.05] : [0.05, h / 2, w / 2 * frac];
      opening.colliders = [{ always: false, pos: center.toArray(), half: half(1) }];
    } else if (o.t === 'door') {
      const hinge = new THREE.Group(); hinge.position.set(-w / 2, 0, 0); g.add(hinge);
      const leafMat = o.front ? this.mat.frontDoor : this.mat.door;
      box([w - 0.02, h - 0.01, 0.045], [w / 2, -0.005, 0], leafMat, hinge, { leaf: true });
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), this.mat.metal);
      knob.position.set(w - 0.09, -0.05, 0.04); knob.userData = { kind: 'opening', key }; hinge.add(knob);
      const knob2 = knob.clone(); knob2.position.z = -0.04; hinge.add(knob2);
      opening.animate = (v) => { hinge.rotation.y = -interiorSide * v * Math.PI / 2 * 0.95; };
      opening.colliders = [{ always: false, pos: center.toArray(), half: axis === 'h' ? [w / 2, h / 2, 0.03] : [0.03, h / 2, w / 2] }];
    }
    const defaultOpen = o.t === 'door' && !o.front ? 1 : 0;
    const st = S.openState?.[key];
    opening.open = opening.target = st == null ? defaultOpen : st ? 1 : 0;
    opening.animate?.(opening.open);
    this.openings.push(opening);
  }

  buildRailing(axis, c, a0, a1, index) {
    const L = a1 - a0, hgt = 1.05;
    const mid = (a0 + a1) / 2;
    const at = (s, y) => axis === 'h' ? [a0 + s, y, c] : [c, y, a0 + s];
    const size = (len, h, th) => axis === 'h' ? [len, h, th] : [th, h, len];
    const add = (sz, pos, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(...sz), mat); m.position.set(...pos); m.castShadow = mat !== this.mat.glass; m.receiveShadow = true; m.userData = { kind: 'rail', wallIndex: index }; this.group.add(m); };
    add(size(L + 0.05, 0.05, 0.07), at(L / 2, hgt), this.mat.metal);
    add(size(L, hgt - 0.1, 0.015), at(L / 2, (hgt - 0.05) / 2 + 0.02), this.mat.glass);
    const n = Math.max(1, Math.round(L / 1.2));
    for (let i = 0; i <= n; i++) add([0.05, hgt, 0.05], at(clamp(i * L / n, 0.025, L - 0.025), hgt / 2), this.mat.metal);
    this.colliders.push({ pos: at(L / 2, hgt / 2 + 0.2), half: size(L / 2, hgt / 2 + 0.2, 0.06) });
    this.walls.push({ index, axis, c, a0, a1, t: 0.07, rail: true, meshes: [] });
  }

  buildCeilings() {
    this.ceilings = new THREE.Group(); this.ceilings.visible = false;
    for (const r of this.bp.rooms) {
      if (r.type === 'outdoor') continue;
      const [x0, z0, x1, z1] = r.rect;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), this.mat.ceiling);
      m.rotation.x = Math.PI / 2; m.position.set((x0 + x1) / 2, this.H - 0.001, (z0 + z1) / 2); m.receiveShadow = true;
      m.userData = { kind: 'ceiling' };
      this.ceilings.add(m);
    }
    this.group.add(this.ceilings);
    // Invisible roof that still casts shadows, so sunlight only comes in through windows.
    const roofMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    this.roof = new THREE.Group();
    for (const [x0, z0, x1, z1] of this.bp.footprint) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 + 0.4, 0.25, z1 - z0 + 0.4), roofMat);
      m.position.set((x0 + x1) / 2, this.H + 0.14, (z0 + z1) / 2); m.castShadow = true; m.renderOrder = -1;
      this.roof.add(m);
    }
    this.group.add(this.roof);
  }

  buildBuilding() {
    const depth = -0.3 - this.groundY;
    this.facadeMat = new THREE.MeshStandardMaterial({ color: '#d9d4cc', map: facadeTexture(false), emissiveMap: facadeTexture(true), emissive: '#ffffff', emissiveIntensity: 0, roughness: 0.85 });
    const slabMat = new THREE.MeshStandardMaterial({ color: '#b9b4ad', roughness: 0.9 });
    for (const [x0, z0, x1, z1] of this.bp.footprint) {
      const size = [x1 - x0 + 0.4, depth, z1 - z0 + 0.4];
      const g = new THREE.BoxGeometry(...size);
      worldUV(g, size, 12, 0);
      const m = new THREE.Mesh(g, [this.facadeMat, this.facadeMat, slabMat, slabMat, this.facadeMat, this.facadeMat]);
      m.position.set((x0 + x1) / 2, this.groundY + depth / 2 - 0.0005, (z0 + z1) / 2); m.receiveShadow = true; m.castShadow = true;
      this.group.add(m);
      this.addBox([(x0 + x1) / 2, -0.15, (z0 + z1) / 2], [x1 - x0 + 0.4, 0.3, z1 - z0 + 0.4], slabMat, {});
    }
  }

  addBox(pos, size, mat, { shadow } = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...size), mat); m.position.set(...pos);
    m.receiveShadow = true; m.castShadow = !!shadow; this.group.add(m); return m;
  }

  buildLabels() {
    this.labels = new THREE.Group(); this.labels.visible = false;
    for (const r of this.rooms) {
      const [x0, z0, x1, z1] = r.rect;
      const el = document.createElement('div'); el.className = 'room-label';
      el.innerHTML = `<b>${r.name}</b><span>${fmtArea(r.area)} · ${((x1 - x0) * 3.281).toFixed(0)}′×${((z1 - z0) * 3.281).toFixed(0)}′</span>`;
      const o = new CSS2DObject(el); o.position.set((x0 + x1) / 2, 0.2, (z0 + z1) / 2);
      this.labels.add(o);
    }
    this.group.add(this.labels);
  }

  // -------------------------------------------------------------- queries
  isIndoor(x, z) { return this.indoorRects.some(([a, b, c, d]) => x >= a && x <= c && z >= b && z <= d); }
  isInside(x, z) { return this.isIndoor(x, z) || this.outdoorRects.some(([a, b, c, d]) => x >= a && x <= c && z >= b && z <= d); }
  roomAt(x, z) { return this.rooms.find((r) => { const [a, b, c, d] = r.rect; return x >= a && x <= c && z >= b && z <= d; }); }

  // Snap a wall-mounted item against the nearest wall face. Returns {x, z, rot} or null.
  snapToWall(x, z, depth) {
    let best = null;
    for (const w of this.walls) {
      if (w.rail) continue;
      const along = w.axis === 'h' ? x : z, across = w.axis === 'h' ? z : x;
      if (along < w.a0 - 0.05 || along > w.a1 + 0.05) continue;
      const dist = Math.abs(across - w.c);
      if (best && dist >= best.dist) continue;
      const side = across >= w.c ? 1 : -1;
      const off = w.c + side * (w.t / 2 + depth / 2 + 0.003);
      best = w.axis === 'h'
        ? { dist, x: clamp(x, w.a0, w.a1), z: off, rot: side > 0 ? 0 : 180, wall: w }
        : { dist, x: off, z: clamp(z, w.a0, w.a1), rot: side > 0 ? 90 : -90, wall: w };
    }
    return best;
  }

  setOpening(key, open) {
    const o = this.openings.find((p) => p.key === key);
    if (o) o.target = open ? 1 : 0;
    return o;
  }

  update(dt) {
    for (const o of this.openings) {
      if (o.open !== o.target) {
        o.open += Math.sign(o.target - o.open) * Math.min(Math.abs(o.target - o.open), dt * 1.6);
        o.animate?.(o.open);
      }
    }
  }
}

// Give a box geometry UVs in world meters so textures (brick, plaster, facade) tile at real scale.
function worldUV(g, [w, h, d], ws, offset = 0) {
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
    const i = f * 4 + v;
    uv.setXY(i, (uv.getX(i) * dims[f][0] + offset) / ws, uv.getY(i) * dims[f][1] / ws);
  }
  uv.needsUpdate = true;
}
