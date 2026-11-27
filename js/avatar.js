// People in the home: real heights and a body built to human proportions.
// Every size here is a fraction of the person's height, so a 5'4" person and a 6'1" person
// both look right next to real-sized furniture. (Phase 2 swaps the look, not the scale.)
import * as THREE from 'three';

export const DEFAULT_HEIGHT = 1.70;          // meters (5'7")
export const MIN_HEIGHT = 1.40, MAX_HEIGHT = 2.05;
export const EYE_RATIO = 0.936;               // eyes sit at ~93.6% of standing height
export const eyeHeight = (h) => clampH(h) * EYE_RATIO;
export const clampH = (h) => Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, +h || DEFAULT_HEIGHT));

// 4'7" … 6'9" in one-inch steps, for pickers
export function heightOptions() {
  const out = [];
  for (let inches = 55; inches <= 81; inches++) out.push({ m: +(inches * 0.0254).toFixed(3), label: fmtHeight(inches * 0.0254) });
  return out;
}
export function fmtHeight(m) {
  const inches = Math.round(m / 0.0254);
  return `${Math.floor(inches / 12)}′ ${inches % 12}″ (${Math.round(m * 100)} cm)`;
}

const SKIN = '#e2b18e', PANTS = '#3a3d48', SHOES = '#24242a';

// Builds a person standing with their feet at y = 0, facing -z.
export function makeAvatar({ color = '#ff7a59', height = DEFAULT_HEIGHT } = {}) {
  const h = clampH(height);
  const g = new THREE.Group(); g.name = 'avatar';
  const mat = (c, r = 0.6) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
  const shirt = mat(color, 0.55), pants = mat(PANTS, 0.8), skin = mat(SKIN, 0.55), shoes = mat(SHOES, 0.5), dark = mat('#1d1a1a', 0.3);
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; g.add(o); return o; };
  const capsule = (r, len, m, x, y, z) => add(new THREE.CapsuleGeometry(r, Math.max(0.001, len), 6, 14), m, x, y, z);

  // proportions (fractions of height) from standard anthropometric tables
  const hip = 0.53 * h, shoulder = 0.815 * h, legR = 0.034 * h, hipW = 0.05 * h;
  const headR = 0.066 * h, headY = h - headR * 1.08;
  // legs + shoes
  for (const s of [-1, 1]) {
    capsule(legR, hip - legR * 2 - 0.04 * h, pants, s * hipW, (hip + 0.04 * h) / 2, 0);
    add(new THREE.BoxGeometry(legR * 2.2, 0.04 * h, 0.15 * h), shoes, s * hipW, 0.02 * h, -0.025 * h);
  }
  // hips + torso
  capsule(0.085 * h, 0.06 * h, pants, 0, hip, 0).scale.set(1.15, 1, 0.75);
  const torsoLen = shoulder - hip - 0.06 * h;
  capsule(0.1 * h, torsoLen - 0.1 * h, shirt, 0, hip + 0.03 * h + torsoLen / 2, 0).scale.set(1.15, 1, 0.68);
  // arms (shirt sleeve + skin forearm), hanging relaxed
  for (const s of [-1, 1]) {
    const x = s * 0.122 * h;
    capsule(0.03 * h, 0.13 * h, shirt, x, shoulder - 0.09 * h, 0);
    capsule(0.026 * h, 0.14 * h, skin, x, shoulder - 0.27 * h, 0);
  }
  // neck + head + face
  capsule(0.028 * h, 0.02 * h, skin, 0, shoulder + 0.025 * h, 0);
  add(new THREE.SphereGeometry(headR, 22, 16), skin, 0, headY, 0).scale.set(0.92, 1.08, 1);
  for (const s of [-1, 1]) add(new THREE.SphereGeometry(headR * 0.12, 10, 8), dark, s * headR * 0.36, headY + headR * 0.12, -headR * 0.9);
  g.userData = { height: h, color };
  return g;
}
