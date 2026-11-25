// Model library ("the Playbox") + builder that turns model JSON into three.js objects.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { expandParts, validateModel, manifestEntry } from './model-spec.js';
import * as TX from './textures.js';

const LS_CUSTOM = 'thehome.customModels';

export class ModelLibrary extends EventTarget {
  constructor() { super(); this.models = new Map(); this.meta = new Map(); }

  async load() {
    let entries = [];
    try {
      const res = await fetch('models/index.json', { cache: 'no-cache' });
      entries = (await res.json()).models || [];
    } catch (e) { console.warn('Could not load models/index.json', e); }
    await Promise.all(entries.map(async (e) => {
      try { this.add(await (await fetch(`${e.path}?v=${e.hash || ''}`, { cache: 'no-cache' })).json(), { path: e.path, hash: e.hash }); }
      catch (err) { console.warn('Model failed to load', e.path, err); }
    }));
    // Models imported in this browser that aren't in the repo yet
    try { for (const m of Object.values(JSON.parse(localStorage.getItem(LS_CUSTOM) || '{}'))) if (!this.models.has(m.id)) this.add(m, { local: true }); } catch {}
    this.dispatchEvent(new Event('change'));
  }

  add(model, { path, local, hash } = {}) {
    this.models.set(model.id, model);
    this.meta.set(model.id, { ...manifestEntry(model, path || ''), local: !!local, hash });
  }

  // Import a model from JSON text (paste / file / design embed). Returns {model, errors, warnings}.
  importJSON(text, { persist = true } = {}) {
    let model;
    try { model = typeof text === 'string' ? JSON.parse(text) : text; } catch (e) { return { errors: ['Invalid JSON: ' + e.message], warnings: [] }; }
    const { errors, warnings } = validateModel(model);
    if (errors.length) return { model, errors, warnings };
    const isNew = !this.models.has(model.id) || this.meta.get(model.id)?.local;
    if (isNew) {
      this.add(model, { local: true });
      if (persist) {
        const all = JSON.parse(localStorage.getItem(LS_CUSTOM) || '{}'); all[model.id] = model;
        localStorage.setItem(LS_CUSTOM, JSON.stringify(all));
      }
      this.dispatchEvent(new Event('change'));
    }
    return { model, errors, warnings };
  }
  removeLocal(id) {
    const all = JSON.parse(localStorage.getItem(LS_CUSTOM) || '{}'); delete all[id];
    localStorage.setItem(LS_CUSTOM, JSON.stringify(all));
    this.models.delete(id); this.meta.delete(id); this.dispatchEvent(new Event('change'));
  }
  get(id) { return this.models.get(id); }
  list() { return [...this.meta.values()]; }
}

// ---------------------------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------------------------
const TOKEN_FINISH = { '@fabric': 'fabric', '@fabric2': 'fabric', '@accent': 'fabric', '@accent2': 'fabric', '@wood': 'wood', '@woodDark': 'wood', '@metal': 'metal', '@stone': 'stone', '@ceramic': 'ceramic', '@plant': 'leaf', '@cabinet': 'satin', '@light': 'emissive' };
export const TOKEN_LABELS = { '@fabric': 'Main fabric', '@fabric2': 'Second fabric', '@wood': 'Wood', '@woodDark': 'Dark wood', '@metal': 'Metal', '@accent': 'Accent', '@accent2': 'Accent 2', '@stone': 'Stone', '@ceramic': 'Ceramic', '@plant': 'Leaves', '@cabinet': 'Cabinets', '@light': 'Light' };

const geoCache = new Map();
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitSphere = new THREE.SphereGeometry(0.5, 28, 18);
function cylGeo(taper = 1) {
  const k = 'cyl' + taper;
  if (!geoCache.has(k)) {
    const rt = taper >= 1 ? 0.5 : 0.5 * taper, rb = taper >= 1 ? 0.5 / taper : 0.5;
    geoCache.set(k, new THREE.CylinderGeometry(Math.max(rt, 0.0005), rb, 1, 28));
  }
  return geoCache.get(k);
}
function rboxGeo([w, h, d], r) {
  const k = `rb${w},${h},${d},${r}`;
  if (!geoCache.has(k)) geoCache.set(k, new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2) * 0.999));
  return geoCache.get(k);
}
function torusGeo([D, tube]) {
  const k = `tor${D},${tube}`;
  if (!geoCache.has(k)) { const g = new THREE.TorusGeometry(Math.max((D - tube) / 2, 0.001), tube / 2, 12, 40); g.rotateX(Math.PI / 2); geoCache.set(k, g); }
  return geoCache.get(k);
}
function clothGeo([w, h, d]) {
  const g = new THREE.PlaneGeometry(w, h, 16, 18);
  const pos = g.attributes.position;
  const depth = d || 0.05;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin((pos.getX(i) / w) * Math.PI * 8) * depth * 0.5);
  g.computeVertexNormals();
  g.userData.base = Float32Array.from(pos.array);
  return g;
}

export function resolveColor(c, style, tokens = {}) {
  if (!c) return '#cccccc';
  if (c[0] === '@') return tokens[c] || style.pal[c.slice(1)] || '#cccccc';
  return c;
}

// Material cache shared by every item for non-glowing materials.
const matCache = new Map();
export function clearMaterialCache() { matCache.forEach((m) => m.dispose()); matCache.clear(); }

function makeMaterial(spec, style, ctx) {
  const s = typeof spec === 'string' ? { color: spec } : { ...spec };
  const token = s.color && s.color[0] === '@' ? s.color : null;
  const finish = s.finish || TOKEN_FINISH[token] || 'satin';
  const color = resolveColor(s.color, style, ctx.tokens);
  const key = [color, finish, s.opacity, s.texture, ctx.seed && s.texture === 'art' ? ctx.seed : ''].join('|');
  if (!s.glow && finish !== 'emissive' && matCache.has(key)) return matCache.get(key);
  const P = { color, roughness: 0.55, metalness: 0 };
  switch (finish) {
    case 'matte': P.roughness = 0.92; break;
    case 'gloss': P.roughness = 0.18; break;
    case 'plastic': P.roughness = 0.38; break;
    case 'fabric': P.roughness = 0.96; P.map = TX.fabricTexture(); break;
    case 'wood': P.roughness = 0.58; P.map = TX.grainTexture(); break;
    case 'metal': P.roughness = 0.32; P.metalness = 0.85; break;
    case 'chrome': P.roughness = 0.08; P.metalness = 1; break;
    case 'stone': P.roughness = 0.28; break;
    case 'ceramic': P.roughness = 0.15; break;
    case 'glass': P.roughness = 0.04; P.transparent = true; P.opacity = s.opacity ?? 0.25; P.depthWrite = false; break;
    case 'mirror': P.roughness = 0.02; P.metalness = 1; break;
    case 'leaf': P.roughness = 0.7; P.side = THREE.DoubleSide; break;
    case 'water': P.roughness = 0.04; P.transparent = true; P.opacity = s.opacity ?? 0.8; P.depthWrite = false; break;
    case 'emissive': P.roughness = 0.5; P.emissive = new THREE.Color(color); P.emissiveIntensity = 0.0; break;
  }
  if (s.opacity != null && s.opacity < 1) { P.transparent = true; P.opacity = s.opacity; }
  if (s.texture === 'rug') { P.map = TX.rugTexture(color); P.color = '#ffffff'; }
  if (s.texture === 'art') { const p = style.pal; P.map = TX.artTexture(ctx.seed || 'art', [p.accent, p.accent2, p.fabric2, p.woodDark, color]); P.color = '#ffffff'; }
  if (s.texture === 'subway') P.map = TX.subwayTexture();
  if (s.texture === 'marble' || (finish === 'stone' && s.texture !== 'none')) P.map = TX.marbleTexture('#ffffff');
  if (s.texture === 'wood') P.map = TX.grainTexture();
  if (s.texture === 'fabric') P.map = TX.fabricTexture();
  if (s.texture === 'none') P.map = null;
  const m = new THREE.MeshStandardMaterial(P);
  if (s.glow || finish === 'emissive') {
    m.emissive = new THREE.Color(finish === 'emissive' ? color : resolveColor('@light', style, ctx.tokens));
    m.userData.glow = true; m.userData.glowMax = finish === 'emissive' ? 2.2 : 0.9;
    return m;
  }
  matCache.set(key, m);
  return m;
}

/**
 * Build a three.js Group from a model.
 * ctx = { style, tokens: {'@fabric':'#hex'}, parts: {partName: {color, finish, hidden, opacity}}, seed }
 */
export function buildModel(model, ctx) {
  const root = new THREE.Group();
  const partMeshes = new Map();
  const glowMats = [];
  const named = new Map();
  const reg = (name, obj) => { if (!named.has(name)) named.set(name, []); named.get(name).push(obj); };

  const makePart = (p, parent) => {
    let obj;
    if (p.shape === 'group') {
      obj = new THREE.Group();
      (p.children || []).forEach((c) => makePart(c, obj));
    } else {
      const ov = (ctx.parts || {})[p.name] || {};
      if (ov.hidden) return;
      let spec = typeof p.material === 'string' ? { color: p.material } : { ...(p.material || {}) };
      if (ov.color) spec.color = ov.color;
      if (ov.finish) spec.finish = ov.finish;
      if (ov.opacity != null) spec.opacity = ov.opacity;
      const mat = makeMaterial(spec, ctx.style, ctx);
      if (mat.userData.glow) glowMats.push(mat);
      let geo, scale = null;
      const sz = p.size || [0.1, 0.1, 0.1];
      switch (p.shape) {
        case 'box': geo = unitBox; scale = sz; break;
        case 'roundedBox': geo = rboxGeo(sz, p.radius ?? 0.02); break;
        case 'cylinder': geo = cylGeo(p.taper ?? 1); scale = sz; break;
        case 'sphere': geo = unitSphere; scale = sz; break;
        case 'torus': geo = torusGeo(sz); break;
        case 'cloth': geo = clothGeo(sz); mat.side = THREE.DoubleSide; break;
        default: geo = unitBox; scale = sz;
      }
      obj = new THREE.Mesh(geo, mat);
      if (scale) obj.scale.set(Math.max(scale[0], 1e-4), Math.max(scale[1], 1e-4), Math.max(scale[2], 1e-4));
      const transparent = mat.transparent;
      obj.castShadow = !transparent; obj.receiveShadow = true;
      if (!partMeshes.has(p.name)) partMeshes.set(p.name, []);
      partMeshes.get(p.name).push(obj);
    }
    obj.name = p.name;
    const [x, y, z] = p.pos || [0, 0, 0];
    obj.position.set(x, y, z);
    if (p.rot) obj.rotation.set(...p.rot.map((d) => d * Math.PI / 180));
    reg(p.name, obj);
    parent.add(obj);
  };
  expandParts(model.parts).forEach((p) => makePart(p, root));

  if (model.mesh?.url) loadGLB(model, root);

  root.userData.partMeshes = partMeshes;
  root.userData.named = named;
  root.userData.glowMats = glowMats;
  return root;
}

const gltfLoader = new GLTFLoader();
function loadGLB(model, root) {
  gltfLoader.load(model.mesh.url, (g) => {
    const obj = g.scene;
    const box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3());
    const [w, h, d] = model.size;
    const s = Math.min(w / size.x, h / size.y, d / size.z);
    obj.scale.setScalar(s);
    const box2 = new THREE.Box3().setFromObject(obj), c = box2.getCenter(new THREE.Vector3());
    obj.position.set(-c.x, model.placement === 'ceiling' ? -box2.max.y : -box2.min.y, model.placement === 'wall' ? -box2.min.z - d / 2 : -c.z);
    obj.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
    obj.name = 'mesh';
    root.add(obj);
  }, undefined, (e) => console.warn('GLB failed', model.mesh.url, e));
}

// Collect which @tokens a model uses (for the inspector color pickers).
export function tokensUsed(model) {
  const set = new Set();
  const walk = (parts) => parts.forEach((p) => {
    if (p.children) walk(p.children);
    const c = typeof p.material === 'string' ? p.material : p.material?.color;
    if (c && c[0] === '@') set.add(c);
  });
  walk(model.parts || []);
  return [...set];
}
export function partNames(model) {
  const out = [];
  const walk = (parts) => parts.forEach((p) => { if (p.shape === 'group') walk(p.children || []); else if (!out.includes(p.name)) out.push(p.name); });
  walk(model.parts || []);
  return out;
}
export function partSpec(model, name) {
  let found = null;
  const walk = (parts) => parts.forEach((p) => { if (found) return; if (p.name === name && p.shape !== 'group') found = p; else if (p.children) walk(p.children); });
  walk(model.parts || []);
  return found;
}
