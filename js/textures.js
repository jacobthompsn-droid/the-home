// Procedural canvas textures — no image downloads needed.
import * as THREE from 'three';
import { seeded } from './util.js';

const cache = new Map();
function canvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function shade(hex, amt) {
  const c = new THREE.Color(hex); const hsl = {}; c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amt)));
  return '#' + c.getHexString();
}
function finish(c, worldSize = 1, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.userData.worldSize = worldSize;
  return t;
}
function memo(key, fn) { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); }
function noise(ctx, w, h, amt, rnd, size = 1) {
  for (let i = 0; i < w * h * amt / (size * size); i++) {
    ctx.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,255,255'},${rnd() * 0.06})`;
    ctx.fillRect(rnd() * w, rnd() * h, size, size);
  }
}

export function floorTexture(type) {
  const k = 'floor:' + type.kind + type.color + (type.grout || '');
  return memo(k, () => {
    const rnd = seeded(type.color);
    switch (type.kind) {
      case 'wood': case 'herringbone': case 'deck': {
        const S = 1024, [c, x] = canvas(S); const world = 2.4;
        const plankW = type.kind === 'deck' ? 0.14 : 0.19, px = S / world;
        const rows = Math.ceil(world / plankW);
        for (let r = 0; r < rows; r++) {
          let pos = -rnd() * 1.2;
          while (pos < world) {
            const len = 0.8 + rnd() * 1.4;
            x.fillStyle = shade(type.color, (rnd() - 0.5) * 0.09);
            x.fillRect(pos * px, r * plankW * px, len * px, plankW * px);
            // grain
            x.strokeStyle = `rgba(60,35,15,${0.05 + rnd() * 0.06})`; x.lineWidth = 1;
            for (let g = 0; g < 7; g++) {
              const y0 = (r * plankW + rnd() * plankW) * px; x.beginPath(); x.moveTo(pos * px, y0);
              for (let s = 0; s <= 8; s++) x.lineTo((pos + len * s / 8) * px, y0 + Math.sin(s + rnd()) * 2);
              x.stroke();
            }
            x.fillStyle = type.kind === 'deck' ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.22)';
            x.fillRect(pos * px, r * plankW * px, 2, plankW * px);
            pos += len;
          }
          x.fillStyle = type.kind === 'deck' ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.18)';
          x.fillRect(0, r * plankW * px, S, type.kind === 'deck' ? 4 : 1.5);
        }
        return finish(c, world);
      }
      case 'tile': {
        const S = 512, [c, x] = canvas(S); const n = 2, world = (type.size || 0.6) * n, t = S / n;
        x.fillStyle = type.grout; x.fillRect(0, 0, S, S);
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
          x.fillStyle = shade(type.color, (rnd() - 0.5) * 0.05); x.fillRect(i * t + 3, j * t + 3, t - 6, t - 6);
        }
        noise(x, S, S, 0.6, rnd);
        return finish(c, world);
      }
      case 'carpet': {
        const S = 256, [c, x] = canvas(S); x.fillStyle = type.color; x.fillRect(0, 0, S, S);
        noise(x, S, S, 3, rnd, 2); return finish(c, 0.6);
      }
      case 'concrete': {
        const S = 512, [c, x] = canvas(S); x.fillStyle = type.color; x.fillRect(0, 0, S, S);
        for (let i = 0; i < 60; i++) { const g = x.createRadialGradient(rnd() * S, rnd() * S, 0, rnd() * S, rnd() * S, 40 + rnd() * 120); g.addColorStop(0, `rgba(${rnd() < 0.5 ? '0,0,0' : '255,255,255'},0.05)`); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, S, S); }
        noise(x, S, S, 2, rnd); x.strokeStyle = 'rgba(0,0,0,0.12)'; x.strokeRect(0, 0, S, S);
        return finish(c, 2.4);
      }
      case 'marble': return marbleTexture(type.color);
      default: return null;
    }
  });
}

export function marbleTexture(color = '#ecebe7') {
  return memo('marble' + color, () => {
    const S = 512, [c, x] = canvas(S), rnd = seeded(color);
    x.fillStyle = color; x.fillRect(0, 0, S, S);
    for (let v = 0; v < 14; v++) {
      x.strokeStyle = `rgba(90,90,95,${0.05 + rnd() * 0.15})`; x.lineWidth = 0.5 + rnd() * 2.5;
      x.beginPath(); let px = rnd() * S, py = 0; x.moveTo(px, py);
      while (py < S) { px += (rnd() - 0.5) * 40; py += 10 + rnd() * 30; x.lineTo(px, py); }
      x.stroke();
    }
    return finish(c, 1.2);
  });
}

export function wallTexture(finishName, color) {
  return memo('wall' + finishName + color, () => {
    const rnd = seeded(finishName + color);
    if (finishName === 'brick') {
      const S = 512, [c, x] = canvas(S); x.fillStyle = '#cfc6bb'; x.fillRect(0, 0, S, S);
      const bw = S / 5, bh = S / 15;
      for (let r = 0; r < 15; r++) for (let i = -1; i < 6; i++) {
        const off = r % 2 ? bw / 2 : 0;
        x.fillStyle = shade(['#9c5a43', '#a9634a', '#8d4f3b', '#b06f55'][Math.floor(rnd() * 4)], (rnd() - 0.5) * 0.08);
        x.fillRect(i * bw + off + 2, r * bh + 2, bw - 4, bh - 4);
      }
      noise(x, S, S, 1.5, rnd);
      return finish(c, 1.0);
    }
    if (finishName === 'panel') {
      const S = 512, [c, x] = canvas(S); x.fillStyle = '#ffffff'; x.fillRect(0, 0, S, S);
      for (let i = 0; i < 8; i++) { x.fillStyle = `rgba(0,0,0,${0.03 + rnd() * 0.03})`; x.fillRect(i * 64, 0, 64, S); x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(i * 64, 0, 2, S); }
      return finish(c, 1.2);
    }
    // paint / plaster: subtle mottling, grayscale so the material color tints it
    const S = 256, [c, x] = canvas(S); x.fillStyle = '#ffffff'; x.fillRect(0, 0, S, S);
    const strength = finishName === 'plaster' ? 0.03 : 0.007;
    for (let i = 0; i < 80; i++) { const g = x.createRadialGradient(rnd() * S, rnd() * S, 0, rnd() * S, rnd() * S, 20 + rnd() * 60); g.addColorStop(0, `rgba(0,0,0,${strength})`); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, S, S); }
    return finish(c, finishName === 'plaster' ? 1.5 : 2);
  });
}

// Grayscale detail maps for furniture (tinted by material color)
export function grainTexture() {
  return memo('grain', () => {
    const S = 256, [c, x] = canvas(S), rnd = seeded(3);
    x.fillStyle = '#e8e8e8'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 60; i++) {
      x.strokeStyle = `rgba(0,0,0,${0.04 + rnd() * 0.08})`; x.lineWidth = 0.5 + rnd() * 1.5;
      x.beginPath(); const y = rnd() * S; x.moveTo(0, y);
      for (let s = 0; s <= 16; s++) x.lineTo(s * S / 16, y + Math.sin(s * 0.7 + i) * 3 * rnd());
      x.stroke();
    }
    return finish(c, 0.5);
  });
}
export function fabricTexture() {
  return memo('fabric', () => {
    const S = 128, [c, x] = canvas(S), rnd = seeded(5);
    x.fillStyle = '#ededed'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < S; i += 2) { x.fillStyle = `rgba(0,0,0,${0.03 + rnd() * 0.03})`; x.fillRect(i, 0, 1, S); x.fillRect(0, i, S, 1); }
    noise(x, S, S, 2, rnd);
    return finish(c, 0.15);
  });
}
export function subwayTexture() {
  return memo('subway', () => {
    const S = 256, [c, x] = canvas(S); x.fillStyle = '#d8d6d0'; x.fillRect(0, 0, S, S);
    const bw = S / 4, bh = S / 8;
    for (let r = 0; r < 8; r++) for (let i = -1; i < 5; i++) { x.fillStyle = '#ffffff'; x.fillRect(i * bw + (r % 2 ? bw / 2 : 0) + 2, r * bh + 2, bw - 4, bh - 4); }
    return finish(c, 0.6);
  });
}
export function rugTexture(base) {
  return memo('rug' + base, () => {
    const S = 512, [c, x] = canvas(S), rnd = seeded(base);
    const b = new THREE.Color(base);
    x.fillStyle = '#' + b.getHexString(); x.fillRect(0, 0, S, S);
    x.strokeStyle = shade(base, 0.25); x.lineWidth = 14; x.strokeRect(30, 30, S - 60, S - 60);
    x.strokeStyle = shade(base, -0.15); x.lineWidth = 5; x.strokeRect(58, 58, S - 116, S - 116);
    x.fillStyle = shade(base, 0.18);
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
      x.save(); x.translate(110 + i * 73, 110 + j * 73); x.rotate(Math.PI / 4); x.fillRect(-12, -12, 24, 24); x.restore();
    }
    noise(x, S, S, 3, rnd, 2);
    const t = finish(c, 1); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
  });
}
export function artTexture(seed, colors) {
  return memo('art' + seed + colors.join(), () => {
    const W = 512, H = 360, [c, x] = canvas(W, H), rnd = seeded(seed);
    x.fillStyle = '#f4efe6'; x.fillRect(0, 0, W, H);
    const style = Math.floor(rnd() * 3);
    for (let i = 0; i < 9; i++) {
      x.fillStyle = colors[Math.floor(rnd() * colors.length)]; x.globalAlpha = 0.85;
      if (style === 0) { x.beginPath(); x.arc(rnd() * W, rnd() * H, 30 + rnd() * 110, 0, Math.PI * 2); x.fill(); }
      else if (style === 1) { x.fillRect(rnd() * W, rnd() * H, 40 + rnd() * 200, 20 + rnd() * 150); }
      else { x.beginPath(); x.moveTo(0, H * (0.4 + i * 0.07)); for (let s = 0; s <= 10; s++) x.lineTo(s * W / 10, H * (0.35 + i * 0.07) + Math.sin(s + i * rnd() * 3) * 25); x.lineTo(W, H); x.lineTo(0, H); x.fill(); }
    }
    x.globalAlpha = 1;
    const t = finish(c, 1); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
  });
}

// ---- outdoor ----
export function groundTexture() {
  return memo('ground', () => {
    const S = 512, [c, x] = canvas(S), rnd = seeded(11);
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 4000; i++) { x.fillStyle = `rgba(0,0,0,${rnd() * 0.12})`; x.fillRect(rnd() * S, rnd() * S, 2, 3 + rnd() * 3); }
    return finish(c, 6);
  });
}
export function facadeTexture(lit) {
  return memo('facade' + lit, () => {
    const W = 256, H = 512, [c, x] = canvas(W, H), rnd = seeded(lit ? 21 : 20);
    x.fillStyle = lit ? '#000000' : '#ffffff'; x.fillRect(0, 0, W, H);
    const cols = 4, rows = 8, cw = W / cols, rh = H / rows;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      if (lit) { if (rnd() < 0.45) { x.fillStyle = ['#ffd89a', '#ffe9c4', '#cfe3ff', '#ffc477'][Math.floor(rnd() * 4)]; x.fillRect(i * cw + 10, j * rh + 12, cw - 20, rh - 24); } }
      else { x.fillStyle = '#5a6672'; x.fillRect(i * cw + 10, j * rh + 12, cw - 20, rh - 24); x.fillStyle = 'rgba(255,255,255,0.25)'; x.fillRect(i * cw + 12, j * rh + 14, (cw - 24) / 2, rh - 28); }
    }
    return finish(c, 12);
  });
}
export function spriteTexture(kind) {
  return memo('sprite' + kind, () => {
    const S = kind === 'cloud' ? 256 : 64, [c, x] = canvas(S);
    if (kind === 'cloud') {
      const rnd = seeded(9);
      for (let i = 0; i < 26; i++) {
        const px = S * (0.2 + rnd() * 0.6), py = S * (0.35 + rnd() * 0.3), r = S * (0.08 + rnd() * 0.16);
        const g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = g; x.fillRect(0, 0, S, S);
      }
    } else {
      const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(kind === 'snow' ? 0.5 : 0.25, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, S, S);
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  });
}
