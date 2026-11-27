// Generates the built-in Playbox models as plain JSON files in /models.
// Agents adding NEW models should NOT edit this script — write a JSON file directly
// (see .claude/skills/photo-to-model/SKILL.md). This script just keeps the built-ins tidy.
//
//   node tools/generate-builtins.mjs && node tools/models.mjs manifest
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const r3 = (n) => Math.round(n * 1000) / 1000;

// ---------- part helpers (y is the BOTTOM of the part; JSON stores centers) ----------
const B = (name, [w, h, d], [x, y, z], material, o = {}) => ({ name, shape: 'box', size: [w, h, d], pos: [x, r3(y + h / 2), z], material, ...o });
const R = (name, [w, h, d], [x, y, z], material, radius = 0.03, o = {}) => ({ name, shape: 'roundedBox', radius, size: [w, h, d], pos: [x, r3(y + h / 2), z], material, ...o });
const C = (name, [w, h, d], [x, y, z], material, o = {}) => ({ name, shape: 'cylinder', size: [w, h, d], pos: [x, r3(y + h / 2), z], material, ...o });
const S = (name, [w, h, d], [x, y, z], material, o = {}) => ({ name, shape: 'sphere', size: [w, h, d], pos: [x, r3(y + h / 2), z], material, ...o });
// center-based variants (for rotated parts and children of groups)
const Bc = (name, size, pos, material, o = {}) => ({ name, shape: 'box', size, pos, material, ...o });
const Cc = (name, size, pos, material, o = {}) => ({ name, shape: 'cylinder', size, pos, material, ...o });
const Sc = (name, size, pos, material, o = {}) => ({ name, shape: 'sphere', size, pos, material, ...o });
const Tc = (name, size, pos, material, o = {}) => ({ name, shape: 'torus', size, pos, material, ...o });
const G = (name, pos, children, o = {}) => ({ name, shape: 'group', pos, children, ...o });

const WHITE_FABRIC = { color: '#f4f1ea', finish: 'fabric' };
const SHADE = { color: '#f3ead8', finish: 'fabric', opacity: 0.93, glow: true };
const BULB = { color: '#fff4dc', finish: 'emissive', glow: true };
const BLACK = { color: '#151515', finish: 'satin' };
const STEEL = { color: '#c9ccce', finish: 'metal' };
const PORCELAIN = { color: '#f7f7f5', finish: 'ceramic' };
const GLASS = { color: '#cfe6ee', finish: 'glass', opacity: 0.22 };

let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

const models = [];
function M(def) {
  models.push({
    version: 1, collection: 'Built-in', source: { type: 'builtin' }, tags: [],
    physics: { body: 'static' }, ...def,
  });
}

// ===================== LIVING =====================
function sofa(id, name, w, price) {
  const n = w > 1.8 ? 3 : 2, inner = w - 0.36, cw = inner / n - 0.01;
  const xs = Array.from({ length: n }, (_, i) => r3(-inner / 2 + inner / n * (i + 0.5)));
  M({
    id, name, category: 'living', icon: '🛋️', price, size: [w, 0.85, 0.95], placement: 'floor',
    tags: ['seating', 'sofa', 'couch'],
    physics: { body: 'static', colliders: [[0, 0.245, 0.05, w, 0.49, 0.85], [0, 0.425, -0.375, w, 0.85, 0.2]] },
    parts: [
      C('leg', [0.05, 0.1, 0.05], [r3(w / 2 - 0.08), 0, 0.39], '@woodDark', { mirror: 'xz' }),
      R('base', [w, 0.25, 0.95], [0, 0.1, 0], '@fabric', 0.04),
      R('arm', [0.18, 0.32, 0.95], [r3(w / 2 - 0.09), 0.35, 0], '@fabric', 0.05, { mirror: 'x' }),
      R('back', [w, 0.5, 0.2], [0, 0.35, -0.375], '@fabric', 0.05),
      ...xs.map((x, i) => R(`seat-cushion-${i + 1}`, [cw, 0.14, 0.72], [x, 0.35, 0.09], '@fabric', 0.05)),
      ...xs.map((x, i) => R(`back-cushion-${i + 1}`, [cw, 0.38, 0.14], [x, 0.45, -0.21], '@fabric', 0.06)),
      R('throw-pillow', [0.42, 0.38, 0.12], [r3(w / 2 - 0.45), 0.49, -0.08], '@accent', 0.06, { rot: [-12, 12, 0], mirror: 'x' }),
    ],
  });
}
sofa('sofa-3seat', '3-Seat Sofa', 2.2, 1299);
sofa('loveseat', 'Loveseat', 1.6, 899);

M({
  id: 'sectional-l', name: 'L-Shaped Sectional', category: 'living', icon: '🛋️', price: 2399, size: [2.9, 0.85, 2.2], placement: 'floor',
  tags: ['seating', 'sectional', 'couch'],
  physics: { body: 'static', colliders: [[0, 0.245, -0.58, 2.9, 0.49, 1.04], [-0.975, 0.245, 0.475, 0.95, 0.49, 1.25], [0, 0.425, -1.0, 2.9, 0.85, 0.2], [-1.35, 0.425, 0, 0.2, 0.85, 2.2]] },
  parts: [
    ...[[1.37, -1.02], [1.37, -0.2], [-1.37, -1.02], [-1.37, 1.02], [-0.58, 1.02], [-0.58, -0.2]].map(([x, z]) => C('leg', [0.05, 0.1, 0.05], [x, 0, z], '@woodDark')),
    R('base-main', [2.9, 0.25, 0.95], [0, 0.1, -0.625], '@fabric', 0.04),
    R('base-chaise', [0.95, 0.25, 1.25], [-0.975, 0.1, 0.475], '@fabric', 0.04),
    R('back-main', [2.9, 0.5, 0.2], [0, 0.35, -1.0], '@fabric', 0.05),
    R('back-side', [0.2, 0.5, 2.2], [-1.35, 0.35, 0], '@fabric', 0.05),
    R('arm', [0.18, 0.32, 0.95], [1.36, 0.35, -0.625], '@fabric', 0.05),
    R('arm-chaise', [0.95, 0.32, 0.18], [-0.975, 0.35, 1.01], '@fabric', 0.05),
    R('seat-main', [2.5, 0.14, 0.74], [0.01, 0.35, -0.53], '@fabric', 0.05),
    R('seat-chaise', [0.74, 0.14, 1.06], [-0.875, 0.35, 0.385], '@fabric', 0.05),
    R('back-cushion-a', [1.2, 0.36, 0.14], [-0.6, 0.45, -0.83], '@fabric', 0.06),
    R('back-cushion-b', [1.2, 0.36, 0.14], [0.65, 0.45, -0.83], '@fabric', 0.06),
    R('back-cushion-side', [0.14, 0.36, 1.0], [-1.18, 0.45, 0.3], '@fabric', 0.06),
    R('throw-pillow', [0.42, 0.38, 0.12], [0.9, 0.49, -0.7], '@accent', 0.06, { rot: [-12, -10, 0] }),
    R('throw-pillow-2', [0.12, 0.38, 0.42], [-1.05, 0.49, -0.6], '@accent2', 0.06, { rot: [0, 30, 12] }),
  ],
});

M({
  id: 'armchair', name: 'Armchair', category: 'living', icon: '💺', price: 649, size: [0.9, 0.85, 0.9], placement: 'floor',
  tags: ['seating', 'chair'],
  physics: { body: 'static', colliders: [[0, 0.245, 0.05, 0.9, 0.49, 0.8], [0, 0.425, -0.35, 0.9, 0.85, 0.2]] },
  parts: [
    C('leg', [0.04, 0.1, 0.04], [0.37, 0, 0.37], '@woodDark', { mirror: 'xz' }),
    R('base', [0.9, 0.25, 0.9], [0, 0.1, 0], '@fabric', 0.04),
    R('arm', [0.16, 0.32, 0.9], [0.37, 0.35, 0], '@fabric', 0.05, { mirror: 'x' }),
    R('back', [0.9, 0.5, 0.2], [0, 0.35, -0.35], '@fabric', 0.05),
    R('seat-cushion', [0.56, 0.14, 0.66], [0, 0.35, 0.1], '@fabric', 0.05),
    R('back-cushion', [0.56, 0.36, 0.14], [0, 0.45, -0.19], '@fabric', 0.06),
    R('throw-pillow', [0.36, 0.32, 0.11], [0, 0.49, -0.07], '@accent', 0.05, { rot: [-12, 0, 0] }),
  ],
});

M({
  id: 'coffee-table', name: 'Coffee Table', category: 'living', icon: '🪵', price: 349, size: [1.2, 0.42, 0.6], placement: 'floor', surface: 0.42,
  tags: ['table', 'surface'],
  parts: [
    R('top', [1.2, 0.05, 0.6], [0, 0.37, 0], '@wood', 0.012),
    C('leg', [0.045, 0.37, 0.045], [0.54, 0, 0.24], '@woodDark', { mirror: 'xz' }),
    B('shelf', [1.08, 0.02, 0.48], [0, 0.12, 0], '@wood'),
  ],
});

M({
  id: 'side-table', name: 'Side Table', category: 'living', icon: '🪑', price: 129, size: [0.5, 0.55, 0.5], placement: 'floor', surface: 0.55,
  tags: ['table', 'surface'],
  parts: [
    C('foot', [0.34, 0.02, 0.34], [0, 0, 0], '@metal'),
    C('stem', [0.05, 0.49, 0.05], [0, 0.02, 0], '@metal'),
    C('top', [0.5, 0.04, 0.5], [0, 0.51, 0], '@wood'),
  ],
});

M({
  id: 'tv-console', name: 'TV + Media Console', category: 'living', icon: '📺', price: 1499, size: [1.8, 1.38, 0.45], placement: 'floor', surface: 0.51,
  tags: ['tv', 'entertainment'], defaultOn: false,
  behaviors: [{ type: 'screen', part: 'screen' }],
  parts: [
    B('leg', [0.04, 0.06, 0.04], [0.85, 0, 0.18], '@metal', { mirror: 'xz' }),
    R('cabinet', [1.8, 0.45, 0.45], [0, 0.06, 0], '@wood', 0.01),
    B('door-line', [0.006, 0.38, 0.006], [0.3, 0.095, 0.226], '@woodDark', { mirror: 'x' }),
    B('tv-base', [0.4, 0.02, 0.22], [0, 0.51, 0], BLACK),
    B('tv-neck', [0.06, 0.12, 0.04], [0, 0.53, -0.03], BLACK),
    B('tv-frame', [1.46, 0.85, 0.05], [0, 0.53, -0.06], BLACK),
    B('screen', [1.42, 0.81, 0.01], [0, 0.55, -0.03], { color: '#06080b', finish: 'gloss' }),
  ],
});

function bookshelf() {
  seed = 42;
  const BOOK = ['#7b2d26', '#2f4b6e', '#c9a227', '#3d6b4f', '#e8e2d4', '#1f1f1f', '#a35a3a', '#6b5b95', '#d98c5f', '#457b9d'];
  const parts = [
    B('side', [0.03, 1.9, 0.35], [0.485, 0, 0], '@wood', { mirror: 'x' }),
    B('back', [0.94, 1.9, 0.02], [0, 0, -0.165], '@wood'),
  ];
  const ys = [0.02, 0.46, 0.9, 1.34, 1.875];
  ys.forEach((y, i) => parts.push(B(`shelf-${i + 1}`, [0.94, 0.025, 0.33], [0, y, 0.01], '@wood')));
  ys.slice(0, 4).forEach((y, s) => {
    let x = -0.45;
    while (x < 0.42) {
      if (rnd() < 0.12) { x += 0.08; continue; }
      const w = r3(0.025 + rnd() * 0.03), hgt = r3(0.2 + rnd() * 0.12);
      if (x + w > 0.45) break;
      parts.push(B(`books-${s + 1}`, [w, hgt, 0.22], [r3(x + w / 2), r3(y + 0.025), 0.02], { color: BOOK[Math.floor(rnd() * BOOK.length)], finish: 'satin' }));
      x += w + 0.002;
    }
  });
  M({
    id: 'bookshelf', name: 'Bookshelf', category: 'living', icon: '📚', price: 279, size: [1.0, 1.9, 0.35], placement: 'floor', surface: 1.9,
    tags: ['storage', 'books'], parts,
  });
}
bookshelf();

M({
  id: 'rug', name: 'Area Rug', category: 'living', icon: '🟫', price: 399, size: [2.4, 0.012, 1.7], placement: 'floor', rug: true,
  tags: ['rug', 'textile'], physics: { body: 'none' },
  parts: [R('rug', [2.4, 0.012, 1.7], [0, 0, 0], { color: '@accent2', finish: 'fabric', texture: 'rug' }, 0.004)],
});
M({
  id: 'rug-runner', name: 'Runner Rug', category: 'living', icon: '🟫', price: 149, size: [0.8, 0.012, 2.6], placement: 'floor', rug: true,
  tags: ['rug', 'textile'], physics: { body: 'none' },
  parts: [R('rug', [0.8, 0.012, 2.6], [0, 0, 0], { color: '@accent', finish: 'fabric', texture: 'rug' }, 0.004)],
});

// ===================== LIGHTING =====================
M({
  id: 'floor-lamp', name: 'Floor Lamp', category: 'lighting', icon: '🪔', price: 189, size: [0.42, 1.6, 0.42], placement: 'floor',
  tags: ['light', 'lamp'], defaultOn: true,
  behaviors: [{ type: 'light', at: [0, 1.42, 0], intensity: 1 }],
  parts: [
    C('base', [0.3, 0.03, 0.3], [0, 0, 0], '@metal'),
    C('pole', [0.025, 1.36, 0.025], [0, 0.03, 0], '@metal'),
    C('shade', [0.42, 0.3, 0.42], [0, 1.3, 0], SHADE, { taper: 0.72 }),
    S('bulb', [0.08, 0.08, 0.08], [0, 1.36, 0], BULB),
  ],
});
M({
  id: 'table-lamp', name: 'Table Lamp', category: 'lighting', icon: '💡', price: 89, size: [0.3, 0.5, 0.3], placement: 'surface',
  tags: ['light', 'lamp'], defaultOn: true, physics: { body: 'none' },
  behaviors: [{ type: 'light', at: [0, 0.36, 0], intensity: 0.6 }],
  parts: [
    S('base', [0.18, 0.2, 0.18], [0, 0, 0], { color: '@accent', finish: 'ceramic' }),
    C('neck', [0.02, 0.12, 0.02], [0, 0.19, 0], '@metal'),
    C('shade', [0.3, 0.2, 0.3], [0, 0.3, 0], SHADE, { taper: 0.75 }),
    S('bulb', [0.06, 0.06, 0.06], [0, 0.33, 0], BULB),
  ],
});
M({
  id: 'pendant-light', name: 'Pendant Light', category: 'lighting', icon: '🔆', price: 159, size: [0.36, 0.9, 0.36], placement: 'ceiling',
  tags: ['light', 'pendant'], defaultOn: true, physics: { body: 'none' },
  behaviors: [{ type: 'light', at: [0, -0.86, 0], intensity: 0.9 }],
  parts: [
    C('canopy', [0.1, 0.03, 0.1], [0, -0.03, 0], '@metal'),
    C('cord', [0.01, 0.62, 0.01], [0, -0.64, 0], BLACK),
    C('shade', [0.36, 0.24, 0.36], [0, -0.86, 0], '@metal', { taper: 0.18 }),
    S('bulb', [0.09, 0.09, 0.09], [0, -0.88, 0], BULB),
  ],
});
M({
  id: 'ceiling-light', name: 'Flush Ceiling Light', category: 'lighting', icon: '⚪', price: 79, size: [0.5, 0.1, 0.5], placement: 'ceiling',
  tags: ['light'], defaultOn: true, physics: { body: 'none' },
  behaviors: [{ type: 'light', at: [0, -0.25, 0], intensity: 1.2 }],
  parts: [
    C('rim', [0.52, 0.02, 0.52], [0, -0.02, 0], '@metal'),
    C('diffuser', [0.5, 0.08, 0.5], [0, -0.1, 0], { color: '#fbf8f0', finish: 'gloss', glow: true }, { taper: 0.85 }),
  ],
});

// ===================== CLIMATE =====================
M({
  id: 'ceiling-fan', name: 'Ceiling Fan', category: 'climate', icon: '🌀', price: 249, size: [1.3, 0.5, 1.3], placement: 'ceiling',
  tags: ['fan', 'airflow', 'light'], defaultOn: true, physics: { body: 'none' },
  behaviors: [
    { type: 'spin', part: 'blades', axis: 'y', speed: 7 },
    { type: 'airflow', kind: 'fan', at: [0, -0.45, 0], dir: [0, -1, 0], strength: 2.2, range: 2.6 },
    { type: 'light', at: [0, -0.55, 0], intensity: 0.7 },
  ],
  parts: [
    C('canopy', [0.14, 0.05, 0.14], [0, -0.05, 0], '@metal'),
    C('downrod', [0.035, 0.26, 0.035], [0, -0.3, 0], '@metal'),
    C('motor', [0.24, 0.12, 0.24], [0, -0.42, 0], '@metal'),
    G('blades', [0, -0.37, 0], Array.from({ length: 5 }, (_, i) => {
      const a = i * 72 * Math.PI / 180;
      return Bc('blade', [0.55, 0.012, 0.13], [r3(Math.cos(a) * 0.38), 0, r3(-Math.sin(a) * 0.38)], '@wood', { rot: [0, i * 72, 0] });
    })),
    S('light-bowl', [0.2, 0.1, 0.2], [0, -0.5, 0], { color: '#fbf6ea', finish: 'gloss', glow: true }),
  ],
});
M({
  id: 'floor-fan', name: 'Standing Fan', category: 'climate', icon: '🌬️', price: 69, size: [0.42, 1.12, 0.36], placement: 'floor',
  tags: ['fan', 'airflow'], defaultOn: false,
  behaviors: [
    { type: 'spin', part: 'blades', axis: 'z', speed: 22 },
    { type: 'oscillate', part: 'head', axis: 'y', amount: 35, speed: 0.6 },
    { type: 'airflow', kind: 'fan', at: [0, 0.92, 0.12], dir: [0, 0, 1], strength: 3.2, range: 4 },
  ],
  parts: [
    C('base', [0.34, 0.04, 0.34], [0, 0, -0.02], { color: '#eeeeec', finish: 'plastic' }),
    C('pole', [0.03, 0.8, 0.03], [0, 0.04, -0.02], { color: '#eeeeec', finish: 'plastic' }),
    G('head', [0, 0.92, -0.02], [
      Cc('motor', [0.13, 0.14, 0.13], [0, 0, -0.07], { color: '#eeeeec', finish: 'plastic' }, { rot: [90, 0, 0] }),
      Tc('cage', [0.4, 0.015, 0.4], [0, 0, 0.04], { color: '#dddddd', finish: 'metal' }, { rot: [90, 0, 0] }),
      G('blades', [0, 0, 0.04], [0, 120, 240].map((d) => {
        const a = d * Math.PI / 180;
        return Bc('blade', [0.16, 0.08, 0.006], [r3(Math.cos(a) * 0.08), r3(Math.sin(a) * 0.08), 0], { color: '#9fd3ff', finish: 'plastic', opacity: 0.85 }, { rot: [0, 0, d] });
      }).concat([Cc('hub', [0.05, 0.03, 0.05], [0, 0, 0], { color: '#eeeeec', finish: 'plastic' }, { rot: [90, 0, 0] })])),
    ]),
  ],
});
M({
  id: 'mini-split', name: 'Mini-Split AC / Heat Pump', category: 'climate', icon: '❄️', price: 1199, size: [0.9, 0.3, 0.22], placement: 'wall', mountHeight: 2.15,
  tags: ['ac', 'heat', 'airflow', 'thermostat'], defaultOn: true, physics: { body: 'none' },
  behaviors: [{ type: 'airflow', kind: 'ac', at: [0, 0.04, 0.16], dir: [0, -0.5, 1], strength: 2.6, range: 4.2 }, { type: 'status', part: 'led' }],
  parts: [
    R('body', [0.9, 0.3, 0.22], [0, 0, 0], { color: '#f5f5f3', finish: 'plastic' }, 0.05),
    B('vent', [0.8, 0.03, 0.02], [0, 0.03, 0.1], { color: '#3a3a3a', finish: 'satin' }),
    S('led', [0.016, 0.016, 0.016], [0.38, 0.12, 0.104], { color: '#3fa9ff', finish: 'emissive', glow: true }),
  ],
});
M({
  id: 'space-heater', name: 'Space Heater', category: 'climate', icon: '🔥', price: 59, size: [0.35, 0.6, 0.25], placement: 'floor',
  tags: ['heat', 'airflow'], defaultOn: true,
  behaviors: [{ type: 'airflow', kind: 'heater', at: [0, 0.4, 0.15], dir: [0, 0.6, 1], strength: 0.8, range: 2.5 }, { type: 'status', part: 'grill' }],
  parts: [
    R('body', [0.35, 0.58, 0.25], [0, 0.02, 0], { color: '#e9e6e0', finish: 'plastic' }, 0.04),
    B('grill', [0.27, 0.32, 0.01], [0, 0.18, 0.124], { color: '#ff7a2f', finish: 'emissive', glow: true }),
    B('foot', [0.3, 0.02, 0.28], [0, 0, 0], BLACK),
  ],
});

// ===================== DECOR / PLANTS =====================
function fiddle() {
  seed = 99;
  const leaves = [];
  for (let i = 0; i < 16; i++) {
    const a = i * 137.5 * Math.PI / 180, y = r3(-0.35 + i * 0.045 + rnd() * 0.05), r = 0.12;
    leaves.push(Sc('leaf', [0.2, 0.035, 0.3], [r3(Math.cos(a) * r), y, r3(Math.sin(a) * r)], '@plant', { rot: [r3(-25 + rnd() * 20), r3(-(a * 180 / Math.PI) + 90), 0] }));
  }
  M({
    id: 'plant-fiddle', name: 'Fiddle Leaf Fig', category: 'decor', icon: '🪴', price: 129, size: [0.7, 1.7, 0.7], placement: 'floor',
    tags: ['plant'], behaviors: [{ type: 'sway', part: 'foliage', amount: 1 }],
    physics: { body: 'static', colliders: [[0, 0.21, 0, 0.42, 0.42, 0.42]] },
    parts: [
      C('pot', [0.42, 0.42, 0.42], [0, 0, 0], { color: '@ceramic', finish: 'ceramic' }, { taper: 1.25 }),
      C('soil', [0.38, 0.02, 0.38], [0, 0.39, 0], { color: '#3b2a1d', finish: 'matte' }),
      C('trunk', [0.04, 1.0, 0.04], [0, 0.4, 0], '@woodDark'),
      G('foliage', [0, 1.3, 0], leaves),
    ],
  });
}
fiddle();
M({
  id: 'plant-small', name: 'Small Potted Plant', category: 'decor', icon: '🌿', price: 29, size: [0.28, 0.42, 0.28], placement: 'surface',
  tags: ['plant'], physics: { body: 'none' }, behaviors: [{ type: 'sway', part: 'foliage', amount: 0.6 }],
  parts: [
    C('pot', [0.18, 0.16, 0.18], [0, 0, 0], { color: '@ceramic', finish: 'ceramic' }, { taper: 1.2 }),
    G('foliage', [0, 0.24, 0], [
      Sc('leaves', [0.26, 0.2, 0.26], [0, 0, 0], '@plant'),
      Sc('leaves', [0.16, 0.16, 0.16], [0.05, 0.08, -0.03], '@plant'),
      Sc('leaves', [0.15, 0.14, 0.15], [-0.06, 0.06, 0.04], '@plant'),
    ]),
  ],
});
M({
  id: 'snake-plant', name: 'Snake Plant', category: 'decor', icon: '🌱', price: 49, size: [0.36, 0.95, 0.36], placement: 'floor',
  tags: ['plant'], behaviors: [{ type: 'sway', part: 'foliage', amount: 0.4 }],
  parts: [
    C('pot', [0.3, 0.3, 0.3], [0, 0, 0], { color: '@ceramic', finish: 'ceramic' }),
    G('foliage', [0, 0.3, 0], [[0, 0], [0.06, 0.03], [-0.05, 0.04], [0.02, -0.06], [-0.04, -0.03], [0.07, -0.04]].map(([x, z], i) =>
      Cc('leaf', [0.06, r3(0.45 + (i % 3) * 0.1), 0.025], [x, r3(0.22 + (i % 3) * 0.05), z], { color: i % 2 ? '#3f6b3a' : '#5d8a48', finish: 'leaf' }, { taper: 0, rot: [r3((x) * 90), i * 40, r3(-z * 90)] }))),
  ],
});
M({
  id: 'wall-art', name: 'Framed Art', category: 'decor', icon: '🖼️', price: 149, size: [1.0, 0.7, 0.04], placement: 'wall', mountHeight: 1.15, // centre at 1.5 m, gallery standard
  tags: ['art'], physics: { body: 'none' },
  parts: [
    B('frame', [1.0, 0.7, 0.03], [0, 0, -0.005], '@woodDark'),
    B('canvas', [0.92, 0.62, 0.006], [0, 0.04, 0.013], { color: '@accent', finish: 'matte', texture: 'art' }),
  ],
});
M({
  id: 'wall-shelf', name: 'Floating Wall Shelf', category: 'decor', icon: '➖', price: 49, size: [0.9, 0.04, 0.25], placement: 'wall', mountHeight: 1.4, surface: 0.04,
  tags: ['shelf', 'surface'], physics: { body: 'none' },
  parts: [B('shelf', [0.9, 0.04, 0.25], [0, 0, 0], '@wood')],
});
M({
  id: 'mirror-round', name: 'Round Wall Mirror', category: 'decor', icon: '🪞', price: 119, size: [0.8, 0.8, 0.04], placement: 'wall', mountHeight: 1.2,
  tags: ['mirror'], physics: { body: 'none' },
  parts: [
    Cc('frame', [0.8, 0.025, 0.8], [0, 0.4, -0.007], '@metal', { rot: [90, 0, 0] }),
    Cc('mirror', [0.74, 0.01, 0.74], [0, 0.4, 0.01], { color: '#dfe6ea', finish: 'mirror' }, { rot: [90, 0, 0] }),
  ],
});
M({
  id: 'curtains', name: 'Curtains', category: 'decor', icon: '🪟', price: 119, size: [2.4, 2.42, 0.14], placement: 'wall', mountHeight: 0.02,
  tags: ['textile', 'window'], physics: { body: 'none' },
  behaviors: [{ type: 'cloth', part: 'panel' }],
  parts: [
    B('bracket', [0.03, 0.06, 0.1], [1.1, 2.33, -0.035], '@metal', { mirror: 'x' }),
    Cc('rod', [0.03, 2.4, 0.03], [0, 2.38, 0], '@metal', { rot: [0, 0, 90] }),
    { name: 'panel', shape: 'cloth', size: [0.8, 2.36, 0.06], pos: [-0.75, 1.18, 0.0], material: { color: '@fabric2', finish: 'fabric', opacity: 0.96 }, mirror: 'x' },
  ],
});

// ===================== BEDROOM =====================
function bed(id, name, w, price) {
  const hw = w / 2;
  M({
    id, name, category: 'bedroom', icon: '🛏️', price, size: [r3(w + 0.1), 1.1, 2.15], placement: 'floor', surface: 0.6,
    tags: ['bed', 'sleep'],
    physics: { body: 'static', colliders: [[0, 0.3, 0.05, w, 0.6, 2.05], [0, 0.55, -1.025, r3(w + 0.1), 1.1, 0.1]] },
    parts: [
      B('leg', [0.05, 0.08, 0.05], [r3(hw - 0.06), 0, 0.98], '@woodDark', { mirror: 'xz' }),
      R('frame', [w, 0.25, 2.05], [0, 0.08, 0.05], '@wood', 0.02),
      R('mattress', [r3(w - 0.1), 0.24, 1.95], [0, 0.33, 0.06], WHITE_FABRIC, 0.06),
      R('duvet', [r3(w - 0.04), 0.06, 1.42], [0, 0.54, 0.33], '@fabric', 0.03),
      R('throw-blanket', [r3(w - 0.02), 0.03, 0.42], [0, 0.6, 0.78], '@accent', 0.012),
      R('pillow', [0.6, 0.13, 0.38], [r3(w / 4), 0.57, -0.7], { color: '#fbfaf7', finish: 'fabric' }, 0.06, { mirror: 'x' }),
      R('accent-pillow', [0.45, 0.3, 0.1], [r3(w / 5), 0.6, -0.5], '@accent2', 0.05, { rot: [-18, 0, 0], mirror: 'x' }),
      R('headboard', [r3(w + 0.1), 1.1, 0.1], [0, 0, -1.025], '@fabric2', 0.03),
    ],
  });
}
bed('bed-queen', 'Queen Bed', 1.6, 1599);
bed('bed-king', 'King Bed', 1.95, 1999);

M({
  id: 'nightstand', name: 'Nightstand', category: 'bedroom', icon: '🗄️', price: 199, size: [0.5, 0.55, 0.4], placement: 'floor', surface: 0.55,
  tags: ['storage', 'surface'],
  parts: [
    B('leg', [0.03, 0.08, 0.03], [0.22, 0, 0.17], '@woodDark', { mirror: 'xz' }),
    R('body', [0.5, 0.47, 0.4], [0, 0.08, 0], '@wood', 0.01),
    B('drawer-line', [0.46, 0.006, 0.005], [0, 0.32, 0.2], '@woodDark'),
    S('knob', [0.03, 0.03, 0.02], [0, 0.39, 0.205], '@metal'),
  ],
});
M({
  id: 'dresser', name: 'Dresser', category: 'bedroom', icon: '🗄️', price: 699, size: [1.4, 0.85, 0.5], placement: 'floor', surface: 0.85,
  tags: ['storage', 'surface'],
  parts: [
    B('leg', [0.04, 0.08, 0.04], [0.65, 0, 0.21], '@woodDark', { mirror: 'xz' }),
    R('body', [1.4, 0.77, 0.5], [0, 0.08, 0], '@wood', 0.01),
    B('drawer-line', [1.36, 0.006, 0.005], [0, 0.33, 0.25], '@woodDark'),
    B('drawer-line-2', [1.36, 0.006, 0.005], [0, 0.58, 0.25], '@woodDark'),
    B('center-line', [0.006, 0.73, 0.005], [0, 0.1, 0.25], '@woodDark'),
    ...[0.2, 0.45, 0.7].map((y, i) => S(`knob-${i + 1}`, [0.03, 0.03, 0.02], [0.35, y, 0.255], '@metal', { mirror: 'x' })),
  ],
});
M({
  id: 'wardrobe', name: 'Wardrobe', category: 'bedroom', icon: '🚪', price: 899, size: [1.2, 2.1, 0.6], placement: 'floor', surface: 2.1,
  tags: ['storage', 'closet'],
  parts: [
    R('body', [1.2, 2.05, 0.6], [0, 0.05, 0], '@wood', 0.01),
    B('plinth', [1.16, 0.05, 0.56], [0, 0, 0], '@woodDark'),
    B('door-split', [0.006, 1.97, 0.005], [0, 0.09, 0.3], '@woodDark'),
    B('handle', [0.02, 0.3, 0.02], [0.06, 1.0, 0.31], '@metal', { mirror: 'x' }),
  ],
});
M({
  id: 'desk', name: 'Desk', category: 'office', icon: '🖥️', price: 449, size: [1.4, 0.75, 0.7], placement: 'floor', surface: 0.75,
  tags: ['desk', 'work', 'surface'],
  parts: [
    B('leg-panel', [0.04, 0.71, 0.62], [0.66, 0, 0], '@metal', { mirror: 'x' }),
    R('top', [1.4, 0.04, 0.7], [0, 0.71, 0], '@wood', 0.01),
    B('drawer', [0.42, 0.12, 0.6], [0.4, 0.59, 0], '@wood'),
    B('drawer-pull', [0.12, 0.012, 0.012], [0.4, 0.65, 0.305], '@metal'),
  ],
});
M({
  id: 'office-chair', name: 'Office Chair', category: 'office', icon: '🪑', price: 329, size: [0.64, 1.05, 0.64], placement: 'floor',
  tags: ['chair', 'work'],
  physics: { body: 'static', colliders: [[0, 0.25, 0, 0.55, 0.5, 0.55], [0, 0.78, -0.24, 0.48, 0.55, 0.08]] },
  parts: [
    ...[0, 72, 144, 216, 288].map((d) => {
      const a = d * Math.PI / 180;
      return Bc('base-arm', [0.3, 0.03, 0.05], [r3(Math.cos(a) * 0.15), 0.07, r3(-Math.sin(a) * 0.15)], BLACK, { rot: [0, d, 0] });
    }),
    ...[0, 72, 144, 216, 288].map((d) => {
      const a = d * Math.PI / 180;
      return Sc('caster', [0.05, 0.05, 0.05], [r3(Math.cos(a) * 0.28), 0.025, r3(-Math.sin(a) * 0.28)], BLACK);
    }),
    C('column', [0.05, 0.36, 0.05], [0, 0.08, 0], '@metal'),
    R('seat', [0.52, 0.08, 0.5], [0, 0.44, 0], '@fabric2', 0.03),
    B('back-support', [0.05, 0.12, 0.04], [0, 0.5, -0.24], BLACK),
    R('back', [0.48, 0.5, 0.06], [0, 0.55, -0.24], '@fabric2', 0.03),
  ],
});

// ===================== DINING =====================
M({
  id: 'dining-table', name: 'Dining Table', category: 'dining', icon: '🍽️', price: 799, size: [1.8, 0.76, 0.9], placement: 'floor', surface: 0.76,
  tags: ['table', 'surface'],
  parts: [
    R('top', [1.8, 0.04, 0.9], [0, 0.72, 0], '@wood', 0.012),
    B('leg', [0.06, 0.72, 0.06], [0.82, 0, 0.37], '@wood', { mirror: 'xz' }),
    B('apron', [1.6, 0.08, 0.02], [0, 0.64, 0.37], '@wood', { mirror: 'z' }),
  ],
});
M({
  id: 'round-table', name: 'Round Dining Table', category: 'dining', icon: '⭕', price: 549, size: [1.1, 0.76, 1.1], placement: 'floor', surface: 0.76,
  tags: ['table', 'surface'],
  parts: [
    C('foot', [0.55, 0.04, 0.55], [0, 0, 0], '@woodDark'),
    C('pedestal', [0.12, 0.68, 0.12], [0, 0.04, 0], '@woodDark'),
    C('top', [1.1, 0.04, 1.1], [0, 0.72, 0], '@wood'),
  ],
});
M({
  id: 'dining-chair', name: 'Dining Chair', category: 'dining', icon: '🪑', price: 149, size: [0.46, 0.88, 0.5], placement: 'floor',
  tags: ['chair', 'seating'],
  physics: { body: 'static', colliders: [[0, 0.235, 0.02, 0.46, 0.47, 0.46], [0, 0.66, -0.21, 0.44, 0.44, 0.04]] },
  parts: [
    C('leg', [0.03, 0.44, 0.03], [0.19, 0, 0.2], '@wood', { mirror: 'xz' }),
    R('seat', [0.46, 0.05, 0.46], [0, 0.44, 0.02], '@fabric', 0.015),
    R('back', [0.44, 0.4, 0.04], [0, 0.48, -0.21], '@wood', 0.01),
  ],
});
M({
  // counter-height stool (seat 66 cm) to suit 94 cm counters and islands — bar-height (76 cm) seats are for 107 cm bars
  id: 'bar-stool', name: 'Counter Stool', category: 'dining', icon: '🪑', price: 119, size: [0.42, 0.66, 0.42], placement: 'floor',
  tags: ['stool', 'seating'],
  parts: [
    B('leg', [0.03, 0.61, 0.03], [0.15, 0, 0.15], '@metal', { mirror: 'xz' }),
    Tc('footrest', [0.36, 0.02, 0.36], [0, 0.22, 0], '@metal'),
    C('seat', [0.4, 0.05, 0.4], [0, 0.61, 0], '@wood'),
  ],
});

// ===================== KITCHEN =====================
const CAB = (w) => [
  B('toe-kick', [w, 0.1, 0.55], [0, 0, -0.02], BLACK),
  B('cabinet', [w, 0.8, 0.6], [0, 0.1, -0.01], '@cabinet'),
  B('countertop', [w, 0.04, 0.62], [0, 0.9, 0], '@stone'),
];
M({
  id: 'kitchen-counter', name: 'Counter + Cabinets', category: 'kitchen', icon: '🧱', price: 1100, size: [1.2, 2.22, 0.62], placement: 'floor', surface: 0.94,
  tags: ['kitchen', 'cabinet', 'surface'],
  physics: { body: 'static', colliders: [[0, 0.47, 0, 1.2, 0.94, 0.62]] },
  parts: [
    ...CAB(1.2),
    B('door-line', [0.006, 0.74, 0.005], [0, 0.13, 0.29], '@woodDark'),
    B('handle', [0.012, 0.18, 0.02], [0.05, 0.66, 0.3], '@metal', { mirror: 'x' }),
    B('backsplash', [1.2, 0.56, 0.015], [0, 0.94, -0.3], { color: '#f2f0ea', finish: 'ceramic', texture: 'subway' }),
    B('upper-cabinet', [1.2, 0.72, 0.35], [0, 1.5, -0.135], '@cabinet'),
    B('upper-handle', [0.012, 0.16, 0.02], [0.05, 1.52, 0.05], '@metal', { mirror: 'x' }),
  ],
});
M({
  id: 'kitchen-sink', name: 'Sink Counter', category: 'kitchen', icon: '🚰', price: 1400, size: [1.2, 2.22, 0.62], placement: 'floor', surface: 0.94,
  tags: ['kitchen', 'sink', 'surface'],
  physics: { body: 'static', colliders: [[0, 0.47, 0, 1.2, 0.94, 0.62]] },
  parts: [
    ...CAB(1.2),
    B('door-line', [0.006, 0.74, 0.005], [0, 0.13, 0.29], '@woodDark'),
    B('sink-basin', [0.62, 0.02, 0.42], [0, 0.925, 0.03], STEEL),
    C('faucet', [0.03, 0.32, 0.03], [0, 0.94, -0.22], '@metal'),
    B('spout', [0.03, 0.03, 0.18], [0, 1.23, -0.14], '@metal'),
    B('backsplash', [1.2, 0.56, 0.015], [0, 0.94, -0.3], { color: '#f2f0ea', finish: 'ceramic', texture: 'subway' }),
    B('upper-cabinet', [1.2, 0.72, 0.35], [0, 1.5, -0.135], '@cabinet'),
  ],
});
M({
  id: 'stove-range', name: 'Range + Hood', category: 'kitchen', icon: '🍳', price: 1299, size: [0.76, 2.25, 0.65], placement: 'floor', surface: 0.94,
  tags: ['kitchen', 'stove', 'appliance'],
  physics: { body: 'static', colliders: [[0, 0.47, 0, 0.76, 0.94, 0.65]] },
  parts: [
    B('body', [0.76, 0.92, 0.64], [0, 0, 0], STEEL),
    B('oven-door', [0.66, 0.5, 0.01], [0, 0.15, 0.32], { color: '#1b1b1b', finish: 'gloss' }),
    B('oven-handle', [0.5, 0.02, 0.03], [0, 0.7, 0.34], STEEL),
    B('cooktop', [0.76, 0.02, 0.64], [0, 0.92, 0], { color: '#101010', finish: 'gloss' }),
    C('burner', [0.16, 0.008, 0.16], [0.17, 0.94, 0.14], { color: '#333333', finish: 'metal' }, { mirror: 'xz' }),
    B('backsplash', [0.76, 0.66, 0.015], [0, 0.94, -0.315], { color: '#f2f0ea', finish: 'ceramic', texture: 'subway' }),
    B('hood', [0.76, 0.15, 0.5], [0, 1.6, -0.075], STEEL),
    B('chimney', [0.3, 0.5, 0.25], [0, 1.75, -0.2], STEEL),
  ],
});
M({
  id: 'fridge', name: 'Refrigerator', category: 'kitchen', icon: '🧊', price: 1899, size: [0.9, 1.85, 0.75], placement: 'floor', surface: 1.85,
  tags: ['kitchen', 'appliance'],
  parts: [
    R('body', [0.9, 1.85, 0.75], [0, 0, 0], STEEL, 0.02),
    B('split', [0.006, 1.2, 0.006], [0, 0.6, 0.376], { color: '#888888', finish: 'metal' }),
    B('freezer-line', [0.88, 0.006, 0.006], [0, 0.6, 0.376], { color: '#888888', finish: 'metal' }),
    B('handle', [0.025, 0.5, 0.03], [0.05, 1.0, 0.39], STEEL, { mirror: 'x' }),
  ],
});
M({
  id: 'kitchen-island', name: 'Kitchen Island', category: 'kitchen', icon: '🏝️', price: 1999, size: [2.0, 0.94, 1.0], placement: 'floor', surface: 0.94,
  tags: ['kitchen', 'island', 'surface'],
  parts: [
    B('base', [1.8, 0.9, 0.8], [0, 0, -0.05], '@cabinet'),
    B('countertop', [2.0, 0.04, 1.0], [0, 0.9, 0], '@stone'),
    B('handle', [0.18, 0.012, 0.02], [0.45, 0.78, -0.46], '@metal', { mirror: 'x' }),
  ],
});

M({
  id: 'wet-bar', name: 'Wet Bar + Wine Rack', category: 'kitchen', icon: '🍷', price: 1650, size: [1.5, 2.2, 0.57], placement: 'floor', surface: 0.94,
  tags: ['bar', 'wine', 'entertaining', 'surface'],
  physics: { body: 'static', colliders: [[0, 0.47, 0, 1.5, 0.94, 0.57]] },
  parts: [
    B('toe-kick', [1.5, 0.1, 0.5], [0, 0, -0.03], BLACK),
    B('cabinet', [0.9, 0.8, 0.55], [-0.3, 0.1, -0.01], '@cabinet'),
    B('door-line', [0.006, 0.74, 0.005], [-0.3, 0.13, 0.27], '@woodDark'),
    B('handle', [0.012, 0.16, 0.02], [0.05, 0.66, 0.28], '@metal', { mirror: 'x' }),
    B('wine-rack', [0.6, 0.8, 0.55], [0.45, 0.1, -0.01], '@woodDark'),
    ...[0.2, 0.38, 0.56, 0.74].flatMap((y, r) => [0.24, 0.38, 0.52, 0.66].map((x, c) => Cc(`bottle-${r * 4 + c + 1}`, [0.075, 0.3, 0.075], [x, y + 0.06, 0.12], { color: ['#1d3b26', '#4a0f19', '#1d3b26', '#2b2219'][(r + c) % 4], finish: 'glass', opacity: 0.92 }, { rot: [90, 0, 0] }))),
    B('countertop', [1.5, 0.04, 0.57], [0, 0.9, 0], '@stone'),
    B('backsplash', [1.5, 1.26, 0.015], [0, 0.94, -0.277], { color: '@accent2', finish: 'gloss', texture: 'subway' }),
    B('shelf', [1.4, 0.03, 0.25], [0, 1.54, -0.14], '@wood'),
    B('shelf-2', [1.4, 0.03, 0.25], [0, 1.92, -0.14], '@wood'),
    ...[-0.5, -0.35, -0.2, -0.05].map((x, i) => C(`glass-${i + 1}`, [0.07, 0.14, 0.07], [x, 1.57, -0.14], { color: '#e6f2f5', finish: 'glass', opacity: 0.35 }, { taper: 1.15 })),
    ...[0.2, 0.32, 0.44].map((x, i) => C(`bottle-top-${i + 1}`, [0.08, 0.3, 0.08], [x, 1.57, -0.14], { color: ['#5a2a12', '#1d3b26', '#c8a14e'][i], finish: 'glass', opacity: 0.9 })),
    C('decanter', [0.12, 0.26, 0.12], [-0.55, 0.94, 0.05], { color: '#e6f2f5', finish: 'glass', opacity: 0.35 }, { taper: 0.35 }),
    S('fruit-bowl', [0.26, 0.08, 0.26], [-0.2, 0.94, 0.05], { color: '@ceramic', finish: 'ceramic' }),
  ],
});

// ===================== BATH & LAUNDRY =====================
M({
  id: 'bathtub', name: 'Bathtub', category: 'bath', icon: '🛁', price: 1299, size: [1.7, 0.75, 0.8], placement: 'floor',
  tags: ['bath'],
  parts: [
    B('basin', [1.7, 0.45, 0.8], [0, 0, 0], PORCELAIN),
    B('rim-long', [1.7, 0.15, 0.08], [0, 0.45, 0.36], PORCELAIN, { mirror: 'z' }),
    B('rim-short', [0.08, 0.15, 0.64], [0.81, 0.45, 0], PORCELAIN, { mirror: 'x' }),
    C('faucet', [0.03, 0.14, 0.03], [-0.8, 0.6, 0], '@metal'),
    B('spout', [0.12, 0.03, 0.03], [-0.75, 0.71, 0], '@metal'),
  ],
});
M({
  id: 'toilet', name: 'Toilet', category: 'bath', icon: '🚽', price: 349, size: [0.4, 0.8, 0.7], placement: 'floor',
  tags: ['bath'],
  parts: [
    C('base', [0.3, 0.38, 0.42], [0, 0, 0.06], PORCELAIN, { taper: 1.2 }),
    C('seat', [0.38, 0.03, 0.46], [0, 0.38, 0.08], PORCELAIN),
    B('tank', [0.4, 0.4, 0.18], [0, 0.38, -0.26], PORCELAIN),
    B('tank-lid', [0.42, 0.03, 0.2], [0, 0.78, -0.26], PORCELAIN),
    B('flush', [0.04, 0.015, 0.015], [0.12, 0.72, -0.165], '@metal'),
  ],
});
M({
  id: 'vanity', name: 'Bathroom Vanity + Mirror', category: 'bath', icon: '🪞', price: 899, size: [1.0, 1.9, 0.5], placement: 'floor', surface: 0.86,
  tags: ['bath', 'sink'],
  physics: { body: 'static', colliders: [[0, 0.43, 0, 1.0, 0.86, 0.5]] },
  parts: [
    B('cabinet', [1.0, 0.82, 0.48], [0, 0, -0.01], '@cabinet'),
    B('top', [1.0, 0.04, 0.5], [0, 0.82, 0], '@stone'),
    C('basin', [0.42, 0.12, 0.34], [0, 0.86, 0.03], PORCELAIN, { taper: 1.15 }),
    C('faucet', [0.025, 0.22, 0.025], [0, 0.86, -0.18], '@metal'),
    B('spout', [0.025, 0.025, 0.1], [0, 1.06, -0.13], '@metal'),
    B('backsplash', [1.0, 0.3, 0.02], [0, 0.86, -0.24], '@stone'),
    B('mirror', [0.8, 0.74, 0.02], [0, 1.16, -0.235], { color: '#dfe6ea', finish: 'mirror' }),
  ],
});
M({
  id: 'shower', name: 'Glass Shower', category: 'bath', icon: '🚿', price: 1599, size: [0.9, 2.1, 0.9], placement: 'floor',
  tags: ['bath'],
  parts: [
    B('tray', [0.9, 0.06, 0.9], [0, 0, 0], PORCELAIN),
    B('glass-front', [0.9, 1.95, 0.01], [0, 0.06, 0.445], GLASS),
    B('glass-side', [0.01, 1.95, 0.9], [0.445, 0.06, 0], GLASS),
    C('pipe', [0.02, 1.95, 0.02], [-0.4, 0.06, -0.4], '@metal'),
    B('arm', [0.02, 0.02, 0.12], [-0.4, 1.99, -0.33], '@metal'),
    C('head', [0.16, 0.02, 0.16], [-0.4, 1.97, -0.25], '@metal'),
  ],
});
function laundry(id, name) {
  M({
    id, name, category: 'bath', icon: '🧺', price: 899, size: [0.6, 0.85, 0.65], placement: 'floor', surface: 0.85,
    tags: ['laundry', 'appliance'],
    parts: [
      R('body', [0.6, 0.85, 0.65], [0, 0, 0], { color: '#f4f4f2', finish: 'plastic' }, 0.02),
      B('panel', [0.6, 0.1, 0.01], [0, 0.72, 0.326], { color: '#dcdcdc', finish: 'plastic' }),
      Tc('door-ring', [0.42, 0.04, 0.42], [0, 0.38, 0.33], STEEL, { rot: [90, 0, 0] }),
      Cc('door-glass', [0.36, 0.01, 0.36], [0, 0.38, 0.33], { color: '#2a3540', finish: 'glass', opacity: 0.7 }, { rot: [90, 0, 0] }),
      Sc('dial', [0.05, 0.05, 0.02], [0.2, 0.77, 0.333], STEEL),
    ],
  });
}
laundry('washer', 'Washer');
laundry('dryer', 'Dryer');

// ===================== GAME ROOM / OFFICE =====================
M({
  id: 'pool-table', name: 'Pool Table', category: 'game', icon: '🎱', price: 2899, size: [2.5, 0.82, 1.4], placement: 'floor', surface: 0.8,
  tags: ['game'],
  parts: [
    B('leg', [0.12, 0.62, 0.12], [1.1, 0, 0.55], '@woodDark', { mirror: 'xz' }),
    B('apron', [2.5, 0.13, 1.4], [0, 0.62, 0], '@woodDark'),
    B('felt', [2.3, 0.03, 1.2], [0, 0.75, 0], { color: '#1f6b45', finish: 'fabric' }),
    B('rail-long', [2.5, 0.07, 0.1], [0, 0.75, 0.65], '@woodDark', { mirror: 'z' }),
    B('rail-short', [0.1, 0.07, 1.2], [1.2, 0.75, 0], '@woodDark', { mirror: 'x' }),
    C('pocket', [0.1, 0.012, 0.1], [1.13, 0.79, 0.58], BLACK, { mirror: 'xz' }),
    C('pocket-side', [0.1, 0.012, 0.1], [0, 0.79, 0.58], BLACK, { mirror: 'z' }),
    ...[['#f2f2f2', 0.6, 0], ['#d42b2b', -0.5, 0.05], ['#f0c419', -0.56, -0.05], ['#1d4fa8', -0.62, 0.02], ['#111111', -0.4, -0.12]]
      .map(([c, x, z], i) => S(`ball-${i + 1}`, [0.057, 0.057, 0.057], [x, 0.78, z], { color: c, finish: 'gloss' })),
  ],
});
M({
  id: 'arcade-cabinet', name: 'Arcade Cabinet', category: 'game', icon: '🕹️', price: 1499, size: [0.7, 1.8, 0.8], placement: 'floor',
  tags: ['game', 'retro'], defaultOn: true,
  behaviors: [{ type: 'screen', part: 'screen' }],
  parts: [
    B('body', [0.7, 1.8, 0.6], [0, 0, -0.1], '@accent'),
    B('control-panel', [0.7, 0.08, 0.3], [0, 0.95, 0.15], BLACK, { rot: [-15, 0, 0] }),
    Sc('joystick', [0.04, 0.04, 0.04], [-0.15, 1.08, 0.16], { color: '#ee3333', finish: 'gloss' }),
    Sc('button', [0.035, 0.02, 0.035], [0.1, 1.06, 0.18], { color: '#3c8cff', finish: 'gloss' }, { mirror: 'x' }),
    Bc('screen', [0.56, 0.45, 0.01], [0, 1.32, 0.205], { color: '#06080b', finish: 'gloss' }, { rot: [-8, 0, 0] }),
    B('marquee', [0.7, 0.16, 0.02], [0, 1.64, 0.2], { color: '#ffcf4a', finish: 'emissive', glow: true }),
  ],
});
M({
  id: 'dartboard', name: 'Dartboard', category: 'game', icon: '🎯', price: 79, size: [0.46, 0.46, 0.05], placement: 'wall', mountHeight: 1.5,
  tags: ['game'], physics: { body: 'none' },
  parts: [
    Cc('board', [0.46, 0.04, 0.46], [0, 0.23, -0.005], BLACK, { rot: [90, 0, 0] }),
    Cc('ring-1', [0.36, 0.01, 0.36], [0, 0.23, 0.018], { color: '#c0392b', finish: 'matte' }, { rot: [90, 0, 0] }),
    Cc('ring-2', [0.28, 0.01, 0.28], [0, 0.23, 0.02], { color: '#f2e6c9', finish: 'matte' }, { rot: [90, 0, 0] }),
    Cc('ring-3', [0.12, 0.01, 0.12], [0, 0.23, 0.022], { color: '#27ae60', finish: 'matte' }, { rot: [90, 0, 0] }),
    Cc('bullseye', [0.035, 0.01, 0.035], [0, 0.23, 0.024], { color: '#c0392b', finish: 'matte' }, { rot: [90, 0, 0] }),
  ],
});
M({
  id: 'guitar-stand', name: 'Acoustic Guitar on Stand', category: 'decor', icon: '🎸', price: 499, size: [0.42, 1.3, 0.42], placement: 'floor',
  tags: ['music', 'guitar'],
  physics: { body: 'static', colliders: [[0, 0.5, 0, 0.4, 1.0, 0.3]] },
  parts: [
    Bc('stand-leg', [0.03, 0.03, 0.38], [0.12, 0.015, 0], BLACK, { mirror: 'x' }),
    Bc('stand-cradle', [0.3, 0.03, 0.06], [0, 0.2, 0.06], BLACK),
    Bc('stand-post', [0.03, 0.62, 0.03], [0, 0.32, -0.1], BLACK, { rot: [-12, 0, 0] }),
    Bc('stand-riser', [0.03, 0.2, 0.03], [0, 0.1, 0.06], BLACK),
    G('guitar', [0, 0.215, 0.02], [
      Cc('body-lower', [0.38, 0.1, 0.38], [0, 0.19, 0], { color: '#c7843f', finish: 'gloss' }, { rot: [78, 0, 0] }),
      Cc('body-upper', [0.29, 0.1, 0.29], [0, 0.42, -0.05], { color: '#c7843f', finish: 'gloss' }, { rot: [78, 0, 0] }),
      Cc('soundhole', [0.09, 0.005, 0.09], [0, 0.36, 0.0], BLACK, { rot: [78, 0, 0] }),
      Bc('neck', [0.05, 0.42, 0.03], [0, 0.72, -0.1], '@woodDark', { rot: [-12, 0, 0] }),
      Bc('headstock', [0.07, 0.17, 0.025], [0, 1.0, -0.16], '@woodDark', { rot: [-18, 0, 0] }),
    ]),
  ],
});

// ===================== PLAY (dynamic physics toys) =====================
M({
  id: 'basketball', name: 'Basketball', category: 'play', icon: '🏀', price: 30, size: [0.24, 0.24, 0.24], placement: 'floor',
  tags: ['toy', 'physics'], physics: { body: 'dynamic', mass: 0.6, shape: 'sphere', restitution: 0.78 },
  parts: [
    S('ball', [0.24, 0.24, 0.24], [0, 0, 0], { color: '#e0662a', finish: 'matte' }),
    Tc('seam', [0.242, 0.005, 0.242], [0, 0.12, 0], BLACK),
    Tc('seam-2', [0.242, 0.005, 0.242], [0, 0.12, 0], BLACK, { rot: [90, 0, 0] }),
  ],
});
M({
  id: 'throw-pillow', name: 'Throw Pillow', category: 'play', icon: '🟪', price: 35, size: [0.45, 0.15, 0.45], placement: 'surface',
  tags: ['textile', 'physics'], physics: { body: 'dynamic', mass: 0.4, shape: 'box' },
  parts: [R('pillow', [0.45, 0.15, 0.45], [0, 0, 0], '@accent', 0.06)],
});
M({
  id: 'pouf', name: 'Pouf', category: 'play', icon: '🟤', price: 129, size: [0.5, 0.4, 0.5], placement: 'floor',
  tags: ['seating', 'physics'], physics: { body: 'dynamic', mass: 4, shape: 'box' },
  parts: [C('pouf', [0.5, 0.4, 0.5], [0, 0, 0], '@fabric2')],
});
M({
  id: 'bean-bag', name: 'Bean Bag', category: 'play', icon: '🫘', price: 149, size: [0.9, 0.7, 0.9], placement: 'floor',
  tags: ['seating', 'game', 'physics'], physics: { body: 'dynamic', mass: 6, shape: 'box' },
  parts: [
    S('bag', [0.9, 0.5, 0.9], [0, 0, 0], '@accent'),
    S('back', [0.62, 0.42, 0.42], [0, 0.26, -0.16], '@accent'),
  ],
});
M({
  id: 'moving-box', name: 'Moving Box', category: 'play', icon: '📦', price: 5, size: [0.5, 0.4, 0.4], placement: 'surface',
  tags: ['box', 'physics'], physics: { body: 'dynamic', mass: 3, shape: 'box' },
  parts: [
    B('box', [0.5, 0.4, 0.4], [0, 0, 0], { color: '#b48a5a', finish: 'matte' }),
    B('tape', [0.08, 0.004, 0.402], [0, 0.4, 0], { color: '#d9c49a', finish: 'gloss' }),
  ],
});

// ===================== OUTDOOR =====================
M({
  id: 'patio-set', name: 'Bistro Patio Set', category: 'outdoor', icon: '☕', price: 299, size: [1.5, 0.85, 0.7], placement: 'floor', surface: 0.7,
  tags: ['outdoor', 'balcony'],
  physics: { body: 'static', colliders: [[0, 0.35, 0, 1.5, 0.7, 0.6]] },
  parts: [
    C('table-foot', [0.36, 0.03, 0.36], [0, 0, 0], '@metal'),
    C('table-stem', [0.04, 0.64, 0.04], [0, 0.03, 0], '@metal'),
    C('table-top', [0.6, 0.03, 0.6], [0, 0.67, 0], '@metal'),
    ...[-1, 1].flatMap((s) => [
      B(`chair-leg-${s > 0 ? 'r' : 'l'}`, [0.025, 0.45, 0.025], [s * 0.6 + 0.17, 0, 0.17], '@metal', { mirror: 'z' }),
      B(`chair-leg2-${s > 0 ? 'r' : 'l'}`, [0.025, 0.45, 0.025], [s * 0.6 - 0.17, 0, 0.17], '@metal', { mirror: 'z' }),
      R(`chair-seat-${s > 0 ? 'r' : 'l'}`, [0.4, 0.04, 0.4], [s * 0.6, 0.45, 0], '@metal', 0.01),
      R(`chair-back-${s > 0 ? 'r' : 'l'}`, [0.04, 0.38, 0.38], [s * 0.78, 0.47, 0], '@metal', 0.01),
    ]),
  ],
});
M({
  id: 'sun-lounger', name: 'Sun Lounger', category: 'outdoor', icon: '🏖️', price: 249, size: [0.7, 0.75, 1.9], placement: 'floor',
  tags: ['outdoor', 'seating'],
  parts: [
    B('leg', [0.04, 0.25, 0.04], [0.3, 0, 0.88], '@wood', { mirror: 'xz' }),
    B('frame', [0.7, 0.06, 1.9], [0, 0.25, 0], '@wood'),
    R('cushion', [0.64, 0.07, 1.25], [0, 0.31, 0.3], '@fabric', 0.03),
    Bc('backrest', [0.64, 0.07, 0.7], [0, 0.5, -0.6], '@fabric', { rot: [-35, 0, 0] }),
  ],
});
M({
  id: 'hot-tub', name: 'Hot Tub', category: 'outdoor', icon: '♨️', price: 6999, size: [2.2, 0.9, 2.2], placement: 'floor',
  tags: ['outdoor', 'spa'],
  parts: [
    R('shell', [2.2, 0.78, 2.2], [0, 0, 0], '@woodDark', 0.06),
    B('rim', [2.2, 0.1, 2.2], [0, 0.78, 0], { color: '#e8e6e0', finish: 'plastic' }),
    B('water', [1.9, 0.02, 1.9], [0, 0.86, 0], { color: '#4fb8d6', finish: 'water', opacity: 0.85 }),
  ],
});

// ---------- write ----------
let n = 0;
for (const m of models) {
  const dir = path.join(ROOT, 'models', m.category);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${m.id}.json`), JSON.stringify(m, null, 2) + '\n');
  n++;
}
console.log(`Wrote ${n} built-in models to /models`);
