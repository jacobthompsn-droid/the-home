// The Home — model file spec (shared by the browser app AND tools/models.mjs).
// Pure JS, no dependencies, so Node can import it for validation.
//
// A model is a JSON file in /models/<category>/<id>.json made of simple primitive "parts".
// Full documentation: .claude/skills/photo-to-model/SKILL.md

export const SPEC_VERSION = 1;
export const CATEGORIES = ['living', 'bedroom', 'kitchen', 'dining', 'bath', 'office', 'game', 'outdoor', 'decor', 'lighting', 'climate', 'play'];
export const CATEGORY_LABELS = {
  living: 'Living', bedroom: 'Bedroom', kitchen: 'Kitchen', dining: 'Dining', bath: 'Bath & Laundry', office: 'Office',
  game: 'Game Room', outdoor: 'Outdoor', decor: 'Decor & Plants', lighting: 'Lighting', climate: 'Climate', play: 'Physics Toys',
};
export const PLACEMENTS = ['floor', 'surface', 'wall', 'ceiling'];
export const SHAPES = ['box', 'roundedBox', 'cylinder', 'sphere', 'torus', 'cloth', 'group'];
export const FINISHES = ['matte', 'satin', 'gloss', 'plastic', 'fabric', 'wood', 'metal', 'chrome', 'stone', 'ceramic', 'glass', 'mirror', 'leaf', 'water', 'emissive'];
export const TEXTURES = ['wood', 'fabric', 'rug', 'art', 'subway', 'marble', 'none'];
export const TOKENS = ['@fabric', '@fabric2', '@wood', '@woodDark', '@metal', '@accent', '@accent2', '@stone', '@ceramic', '@plant', '@cabinet', '@light'];
export const BEHAVIORS = ['light', 'spin', 'oscillate', 'airflow', 'screen', 'sway', 'cloth', 'status'];
export const TOLERANCE = 0.025; // meters — how close parts must be to count as "touching"

const isHex = (s) => typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s);
const isVec = (v, n = 3) => Array.isArray(v) && v.length === n && v.every((x) => typeof x === 'number' && isFinite(x));

// Expand `mirror: "x" | "z" | "xz"` into real copies (recursively inside groups).
export function expandParts(parts = []) {
  const out = [];
  for (const p0 of parts) {
    const p = p0.shape === 'group' ? { ...p0, children: expandParts(p0.children) } : { ...p0 };
    const m = p.mirror || '';
    delete p.mirror;
    const variants = [p];
    if (m.includes('x')) variants.push(...variants.map((v) => mirrorPart(v, 'x')));
    if (m.includes('z')) variants.push(...variants.map((v) => mirrorPart(v, 'z')));
    out.push(...variants);
  }
  return out;
}
function mirrorPart(p, axis) {
  const pos = [...(p.pos || [0, 0, 0])], rot = [...(p.rot || [0, 0, 0])];
  if (axis === 'x') { pos[0] = -pos[0]; rot[1] = -rot[1]; rot[2] = -rot[2]; }
  else { pos[2] = -pos[2]; rot[0] = -rot[0]; rot[1] = -rot[1]; }
  const q = { ...p, pos, rot, mirrored: (p.mirrored || '') + axis };
  if (p.shape === 'group') q.children = p.children.map((c) => mirrorPart(c, axis));
  return q;
}

// ---------- tiny 4x4 matrix math (column-major like three.js) ----------
function mat(pos = [0, 0, 0], rotDeg = [0, 0, 0]) {
  const [x, y, z] = rotDeg.map((d) => d * Math.PI / 180);
  const a = Math.cos(x), b = Math.sin(x), c = Math.cos(y), d = Math.sin(y), e = Math.cos(z), f = Math.sin(z);
  const ae = a * e, af = a * f, be = b * e, bf = b * f; // Euler order XYZ (three.js default)
  const m = new Array(16).fill(0);
  m[0] = c * e; m[4] = -c * f; m[8] = d;
  m[1] = af + be * d; m[5] = ae - bf * d; m[9] = -b * c;
  m[2] = bf - ae * d; m[6] = be + af * d; m[10] = a * c;
  m[12] = pos[0]; m[13] = pos[1]; m[14] = pos[2]; m[15] = 1;
  return m;
}
function mul(A, B) {
  const C = new Array(16).fill(0);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    let s = 0; for (let k = 0; k < 4; k++) s += A[k * 4 + i] * B[j * 4 + k];
    C[j * 4 + i] = s;
  }
  return C;
}
const apply = (m, [x, y, z]) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];

// Local half-extents of a primitive (before rotation)
function halfExtents(p) {
  const s = p.size || [0.1, 0.1, 0.1];
  if (p.shape === 'cloth') return [s[0] / 2, s[1] / 2, Math.max(s[2] || 0.04, 0.02) / 2];
  return [s[0] / 2, s[1] / 2, s[2] / 2];
}

// World-space (model-space) AABBs for every leaf part.
export function partBoxes(model) {
  const boxes = [];
  const walk = (parts, parent) => {
    for (const p of parts) {
      const m = mul(parent, mat(p.pos, p.rot));
      if (p.shape === 'group') { walk(p.children || [], m); continue; }
      const [hx, hy, hz] = halfExtents(p);
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
        const v = apply(m, [sx * hx, sy * hy, sz * hz]);
        for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], v[i]); max[i] = Math.max(max[i], v[i]); }
      }
      boxes.push({ name: p.name, min, max });
    }
  };
  walk(expandParts(model.parts), mat());
  return boxes;
}

const touches = (a, b, t = TOLERANCE) => [0, 1, 2].every((i) => a.min[i] <= b.max[i] + t && b.min[i] <= a.max[i] + t);

// Is this box touching the thing the model hangs on / stands on?
function isAnchored(box, model) {
  const [w, h, d] = model.size;
  switch (model.placement) {
    case 'ceiling': return box.max[1] >= -TOLERANCE;
    case 'wall': return box.min[2] <= -d / 2 + TOLERANCE;
    default: return box.min[1] <= TOLERANCE;
  }
}

// Find parts that aren't connected (through touching parts) to the floor / wall / ceiling.
export function floatingParts(model) {
  const boxes = partBoxes(model);
  const seen = new Set();
  const queue = [];
  boxes.forEach((b, i) => { if (isAnchored(b, model)) { seen.add(i); queue.push(i); } });
  while (queue.length) {
    const i = queue.shift();
    boxes.forEach((b, j) => { if (!seen.has(j) && touches(boxes[i], b)) { seen.add(j); queue.push(j); } });
  }
  return boxes.filter((_, i) => !seen.has(i)).map((b) => b.name);
}

export function modelBounds(model) {
  const boxes = partBoxes(model);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const b of boxes) for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], b.min[i]); max[i] = Math.max(max[i], b.max[i]); }
  return { min, max };
}

function checkMaterial(mtl, where, errors) {
  if (typeof mtl === 'string') {
    if (!(TOKENS.includes(mtl) || isHex(mtl))) errors.push(`${where}: material "${mtl}" must be a #rrggbb hex or one of ${TOKENS.join(', ')}`);
    return;
  }
  if (!mtl || typeof mtl !== 'object') { errors.push(`${where}: missing material`); return; }
  if (mtl.color && !(TOKENS.includes(mtl.color) || isHex(mtl.color))) errors.push(`${where}: material.color "${mtl.color}" invalid`);
  if (mtl.finish && !FINISHES.includes(mtl.finish)) errors.push(`${where}: finish "${mtl.finish}" not in ${FINISHES.join(', ')}`);
  if (mtl.texture && !TEXTURES.includes(mtl.texture)) errors.push(`${where}: texture "${mtl.texture}" not in ${TEXTURES.join(', ')}`);
  if (mtl.opacity != null && !(mtl.opacity > 0 && mtl.opacity <= 1)) errors.push(`${where}: opacity must be 0–1`);
}

// Full validation. Returns { errors: [], warnings: [] }
export function validateModel(model, { fileId } = {}) {
  const errors = [], warnings = [];
  const E = (s) => errors.push(s), W = (s) => warnings.push(s);
  if (!model || typeof model !== 'object') return { errors: ['not an object'], warnings };
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(model.id || '')) E('id must be kebab-case (a-z, 0-9, dashes)');
  if (fileId && model.id !== fileId) E(`id "${model.id}" must match file name "${fileId}.json"`);
  if (!model.name) E('name is required');
  if (!CATEGORIES.includes(model.category)) E(`category must be one of: ${CATEGORIES.join(', ')}`);
  if (!PLACEMENTS.includes(model.placement)) E(`placement must be one of: ${PLACEMENTS.join(', ')}`);
  if (!isVec(model.size) || model.size.some((v) => v <= 0)) E('size must be [width, height, depth] in meters, all > 0');
  if (model.size && model.size.some((v) => v > 8)) W('size is over 8 m on some axis — is that really meters?');
  if (model.price != null && typeof model.price !== 'number') E('price must be a number (USD)');
  if (model.placement === 'wall' && typeof model.mountHeight !== 'number') W('wall models should set mountHeight (meters from floor to the bottom of the model)');
  if (!Array.isArray(model.parts) || !model.parts.length) E('parts must be a non-empty array');
  if (errors.length) return { errors, warnings };

  const names = new Set();
  const checkParts = (parts, path) => parts.forEach((p, i) => {
    const where = `${path}[${i}]${p.name ? ` "${p.name}"` : ''}`;
    if (!p.name) E(`${where}: every part needs a name`); else names.add(p.name);
    if (!SHAPES.includes(p.shape)) E(`${where}: shape must be one of ${SHAPES.join(', ')}`);
    if (p.pos && !isVec(p.pos)) E(`${where}: pos must be [x, y, z]`);
    if (p.rot && !isVec(p.rot)) E(`${where}: rot must be [x, y, z] degrees`);
    if (p.mirror && !['x', 'z', 'xz'].includes(p.mirror)) E(`${where}: mirror must be "x", "z" or "xz"`);
    if (p.shape === 'group') {
      if (!Array.isArray(p.children) || !p.children.length) E(`${where}: group needs children`);
      else checkParts(p.children, `${where}.children`);
      return;
    }
    if (!isVec(p.size) || p.size.some((v) => v < 0)) E(`${where}: size must be [x, y, z] meters`);
    checkMaterial(p.material, where, errors);
  });
  checkParts(model.parts, 'parts');

  for (const b of model.behaviors || []) {
    if (!BEHAVIORS.includes(b.type)) E(`behavior type "${b.type}" not in ${BEHAVIORS.join(', ')}`);
    if (b.part && !names.has(b.part)) E(`behavior "${b.type}" references unknown part "${b.part}"`);
    if (b.at && !isVec(b.at)) E(`behavior "${b.type}": at must be [x, y, z]`);
  }
  const ph = model.physics || {};
  if (ph.body && !['static', 'dynamic', 'none'].includes(ph.body)) E('physics.body must be static, dynamic or none');
  if (ph.body === 'dynamic' && !(ph.mass > 0)) E('dynamic physics needs mass > 0 (kg)');
  for (const c of ph.colliders || []) if (!(Array.isArray(c) && c.length === 6)) E('each physics collider is [cx, cy, cz, w, h, d]');
  if (errors.length) return { errors, warnings };

  // Geometry checks: bounds + gravity (nothing floating)
  const { min, max } = modelBounds(model);
  const [w, h, d] = model.size;
  const t = 0.05;
  const yMin = model.placement === 'ceiling' ? -h : 0, yMax = model.placement === 'ceiling' ? 0 : h;
  if (min[0] < -w / 2 - t || max[0] > w / 2 + t) W(`parts span x ${min[0].toFixed(2)}..${max[0].toFixed(2)} but size width is ${w} (should be ${-w / 2}..${w / 2})`);
  if (min[2] < -d / 2 - t || max[2] > d / 2 + t) W(`parts span z ${min[2].toFixed(2)}..${max[2].toFixed(2)} but size depth is ${d}`);
  if (min[1] < yMin - t || max[1] > yMax + t) W(`parts span y ${min[1].toFixed(2)}..${max[1].toFixed(2)} but expected ${yMin}..${yMax}`);
  if (model.placement === 'ceiling' ? Math.abs(max[1]) > TOLERANCE : model.placement !== 'wall' && Math.abs(min[1]) > TOLERANCE)
    E(model.placement === 'ceiling' ? `top of model must touch the ceiling (max y = 0), got ${max[1].toFixed(3)}` : `bottom of model must touch the floor (min y = 0), got ${min[1].toFixed(3)} — nothing may float`);
  if (model.placement === 'wall' && min[2] > -d / 2 + TOLERANCE) E(`back of a wall model must touch the wall (min z = -depth/2 = ${-d / 2}), got ${min[2].toFixed(3)}`);
  const floating = floatingParts(model);
  if (floating.length) E(`floating parts (not touching anything that reaches the ${model.placement === 'wall' ? 'wall' : model.placement === 'ceiling' ? 'ceiling' : 'floor'}): ${[...new Set(floating)].join(', ')}`);
  return { errors, warnings };
}

export function manifestEntry(model, path) {
  const { id, name, category, icon, price, size, placement, collection, tags, source } = model;
  return { id, path, name, category, icon: icon || '📦', price: price || 0, size, placement, collection: collection || 'Custom', tags: tags || [], source: source?.type || 'custom' };
}
