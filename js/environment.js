// Outdoor world: sun path by season & hour, sky, clouds, rain, snow, fog, lightning, wind, trees, city.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { CONFIG } from './config.js';
import { clamp, lerp, smoothstep, seeded, rad, fxLayer } from './util.js';
import { groundTexture, facadeTexture, spriteTexture } from './textures.js';

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
export const WEATHERS = ['clear', 'cloudy', 'rain', 'storm', 'snow', 'fog'];
const DAY_OF_YEAR = { spring: 80, summer: 172, autumn: 265, winter: 355 };
const WEATHER_TARGETS = {
  clear: { cloud: 0.08, rain: 0, snow: 0, fog: 0 },
  cloudy: { cloud: 0.7, rain: 0, snow: 0, fog: 0.15 },
  rain: { cloud: 0.88, rain: 0.6, snow: 0, fog: 0.35 },
  storm: { cloud: 1, rain: 1, snow: 0, fog: 0.5 },
  snow: { cloud: 0.85, rain: 0, snow: 0.8, fog: 0.4 },
  fog: { cloud: 0.6, rain: 0, snow: 0, fog: 1 },
};
const LIVE_WEIGHTS = {
  spring: { clear: 0.35, cloudy: 0.3, rain: 0.25, storm: 0.07, fog: 0.03 },
  summer: { clear: 0.55, cloudy: 0.18, rain: 0.1, storm: 0.17 },
  autumn: { clear: 0.3, cloudy: 0.3, rain: 0.25, fog: 0.1, storm: 0.05 },
  winter: { clear: 0.3, cloudy: 0.3, snow: 0.3, fog: 0.1 },
};
const BASE_TEMP = { spring: 61, summer: 84, autumn: 58, winter: 33 };
const FOLIAGE = {
  spring: ['#86b94f', '#9ccc5a', '#f4b6c8', '#7fb24a', '#f7c9d6'],
  summer: ['#3f7f2f', '#4f8f3a', '#2f6a2a', '#5a9a40'],
  autumn: ['#d9822b', '#c2452d', '#e3b23c', '#9a7a2a', '#b8562e'],
  winter: ['#5b4a3a'],
};
const RAIN_N = 7000, SNOW_N = 5000;

export function sunDirection(season, hour, lat = CONFIG.latitude) {
  const N = DAY_OF_YEAR[season] ?? 172;
  const decl = rad(23.44) * Math.sin(2 * Math.PI * (284 + N) / 365);
  const H = rad(15 * (hour - 12)), phi = rad(lat);
  const el = Math.asin(Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(H));
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi)); // from south, + toward west
  return new THREE.Vector3(-Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize();
}

export function outdoorTemp(env, cloud = 0) {
  const base = BASE_TEMP[env.season] ?? 65;
  const diurnal = Math.cos((env.hour - 15) / 24 * Math.PI * 2) * 9 * (1 - cloud * 0.6);
  const w = { rain: -6, storm: -9, snow: -4, fog: -3, cloudy: -2 }[env.weather] || 0;
  let t = base + diurnal + w;
  if (env.weather === 'snow') t = Math.min(t, 30);
  return t;
}

export class Environment {
  constructor(scene, renderer) {
    this.scene = scene; this.renderer = renderer;
    this.state = { ...WEATHER_TARGETS.clear };
    this.windVec = new THREE.Vector3();
    this.snowCover = 0; this.flash = 0; this.nextBolt = 6; this.liveTimer = 30;
    this.onThunder = null;
    this.group = new THREE.Group(); this.group.name = 'environment'; scene.add(this.group);

    // sky
    this.sky = new Sky(); this.sky.scale.setScalar(4500); this.group.add(this.sky);
    const u = this.sky.material.uniforms; u.mieCoefficient.value = 0.005; u.mieDirectionalG.value = 0.8;
    this.overcast = new THREE.Mesh(new THREE.SphereGeometry(4000, 32, 16), new THREE.MeshBasicMaterial({ color: '#9aa3ad', side: THREE.BackSide, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.group.add(this.overcast);
    // env-map scene
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    this.envSky = new Sky(); this.envSky.scale.setScalar(1000); this.envScene.add(this.envSky);
    this.envOver = new THREE.Mesh(new THREE.SphereGeometry(900, 16, 8), new THREE.MeshBasicMaterial({ color: '#9aa3ad', side: THREE.BackSide, transparent: true, opacity: 0 }));
    this.envScene.add(this.envOver);
    this.lastEnv = { sun: new THREE.Vector3(9, 9, 9), cloud: -1, t: 0 };

    // lights
    this.sun = new THREE.DirectionalLight('#fff3e0', 3); this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048); this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.03;
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight('#bcd6ff', '#6b5f4f', 0.8); scene.add(this.hemi);
    this.flashLight = new THREE.DirectionalLight('#dfe8ff', 0); this.flashLight.position.set(30, 80, -20); scene.add(this.flashLight);
    scene.fog = new THREE.Fog('#c8d4e0', 150, 1400);

    // stars & moon
    const sp = [], rnd = seeded(77);
    for (let i = 0; i < 2500; i++) { const v = new THREE.Vector3(rnd() * 2 - 1, rnd(), rnd() * 2 - 1).normalize().multiplyScalar(3000); sp.push(v.x, v.y + 100, v.z); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.group.add(this.stars);
    this.moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: spriteTexture('dot'), color: '#f4f1e6', transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.moon.scale.setScalar(140); this.group.add(this.moon);

    // clouds
    this.clouds = new THREE.Group(); this.group.add(this.clouds);
    const ctex = spriteTexture('cloud');
    for (let i = 0; i < 36; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: ctex, color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, fog: false }));
      s.position.set((rnd() - 0.5) * 1400, 160 + rnd() * 140, (rnd() - 0.5) * 1400); s.scale.set(260 + rnd() * 260, 120 + rnd() * 90, 1);
      s.userData.k = 0.6 + rnd() * 0.4; this.clouds.add(s);
    }

    // precipitation
    this.rainPos = new Float32Array(RAIN_N * 6);
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: '#b4c4d4', transparent: true, opacity: 0.45, depthWrite: false }));
    this.rain.frustumCulled = false; this.group.add(this.rain);
    this.snowPos = new Float32Array(SNOW_N * 3);
    const ng = new THREE.BufferGeometry(); ng.setAttribute('position', new THREE.BufferAttribute(this.snowPos, 3));
    this.snow = new THREE.Points(ng, new THREE.PointsMaterial({ map: spriteTexture('snow'), size: 0.09, transparent: true, depthWrite: false, opacity: 0.95 }));
    this.snow.frustumCulled = false; this.group.add(this.snow);
    this.rand = seeded(5);
    [this.sky, this.overcast, this.stars, this.moon, this.clouds, this.rain, this.snow].forEach(fxLayer);
  }

  // Build the neighborhood around the apartment (call after apartment.build)
  setSite(apartment) {
    this.apt = apartment;
    if (this.site) { this.group.remove(this.site); this.site.traverse((o) => o.geometry?.dispose()); }
    const site = this.site = new THREE.Group();
    const gy = apartment.groundY, c = apartment.center, b = apartment.bounds;
    const rnd = seeded('site');
    // ground
    const gt = groundTexture().clone(); gt.needsUpdate = true; gt.repeat.set(3000 / 6, 3000 / 6);
    this.groundMat = new THREE.MeshStandardMaterial({ color: '#5d8a3c', map: gt, roughness: 1 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), this.groundMat);
    ground.rotation.x = -Math.PI / 2; ground.position.set(c.x, gy, c.z); ground.receiveShadow = true; site.add(ground);
    // street (south of the building) + sidewalk
    const roadZ = b.maxZ + 16;
    this.roadMat = new THREE.MeshStandardMaterial({ color: '#3b3d40', roughness: 0.85 });
    const road = new THREE.Mesh(new THREE.PlaneGeometry(3000, 12), this.roadMat); road.rotation.x = -Math.PI / 2; road.position.set(c.x, gy + 0.02, roadZ); road.receiveShadow = true; site.add(road);
    const walkMat = new THREE.MeshStandardMaterial({ color: '#b5b1aa', roughness: 0.9 });
    for (const dz of [-8, 8]) { const w = new THREE.Mesh(new THREE.BoxGeometry(3000, 0.15, 4), walkMat); w.position.set(c.x, gy + 0.07, roadZ + dz); w.receiveShadow = true; site.add(w); }
    const lineMat = new THREE.MeshBasicMaterial({ color: '#e8d36a' });
    for (let x = -300; x < 300; x += 6) { const l = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.15), lineMat); l.rotation.x = -Math.PI / 2; l.position.set(c.x + x, gy + 0.03, roadZ); site.add(l); }
    // neighbor buildings
    this.facadeMat = new THREE.MeshStandardMaterial({ color: '#cfc9bf', map: facadeTexture(false), emissiveMap: facadeTexture(true), emissive: '#ffffff', emissiveIntensity: 0, roughness: 0.8 });
    const tints = ['#d9d4cc', '#c7b8a6', '#a9b1ba', '#e4ddd0', '#b9a089', '#9aa4ad'];
    const roofMat = new THREE.MeshStandardMaterial({ color: '#6f6b66', roughness: 0.95 });
    let placed = 0;
    for (let i = 0; i < 400 && placed < 60; i++) {
      const a = rnd() * Math.PI * 2, r = 45 + rnd() * 260;
      const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      if (Math.abs(z - roadZ) < 14) continue;
      if (x > b.minX - 25 && x < b.maxX + 25 && z > b.minZ - 25 && z < b.maxZ + 12) continue;
      const w = 14 + rnd() * 22, d = 14 + rnd() * 22, h = 10 + Math.pow(rnd(), 1.6) * 70;
      const mat = this.facadeMat.clone(); mat.color.set(tints[Math.floor(rnd() * tints.length)]);
      const g = new THREE.BoxGeometry(w, h, d);
      const uv = g.attributes.uv; const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
      for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const k = f * 4 + v; uv.setXY(k, uv.getX(k) * dims[f][0] / 12, uv.getY(k) * dims[f][1] / 12); }
      const m = new THREE.Mesh(g, [mat, mat, roofMat, roofMat, mat, mat]);
      m.position.set(x, gy + h / 2, z); m.rotation.y = Math.round(rnd() * 4) * Math.PI / 2; m.castShadow = true; m.receiveShadow = true;
      m.userData.facade = mat; site.add(m); placed++;
    }
    this.neighbors = site.children.filter((o) => o.userData.facade);
    // trees (instanced)
    const N = 90;
    this.treeTrunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.3, 1, 7), new THREE.MeshStandardMaterial({ color: '#5b4636', roughness: 1 }), N);
    this.treeTops = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, flatShading: true }), N);
    this.treeTrunks.castShadow = this.treeTops.castShadow = true; this.treeTops.receiveShadow = true;
    this.trees = [];
    for (let i = 0; i < 600 && this.trees.length < N; i++) {
      const street = this.trees.length < 30;
      const x = street ? c.x - 150 + this.trees.length * 10 + rnd() * 2 : c.x + (rnd() - 0.5) * 300;
      const z = street ? roadZ + (this.trees.length % 2 ? 8 : -8) : c.z + (rnd() - 0.5) * 300;
      if (!street && x > b.minX - 8 && x < b.maxX + 8 && z > b.minZ - 8 && z < b.maxZ + 8) continue;
      if (!street && Math.abs(z - roadZ) < 10) continue;
      if (!street && this.neighbors.some((n) => Math.abs(n.position.x - x) < 22 && Math.abs(n.position.z - z) < 22)) continue;
      const h = 4 + rnd() * 5, r = 1.8 + rnd() * 1.6;
      this.trees.push({ x, z, h, r, ever: rnd() < 0.22, phase: rnd() * 10, c: rnd() });
    }
    this.treeTrunks.count = this.treeTops.count = this.trees.length;
    const m4 = new THREE.Matrix4();
    this.trees.forEach((t, i) => { m4.compose(new THREE.Vector3(t.x, gy + t.h / 2, t.z), new THREE.Quaternion(), new THREE.Vector3(1, t.h, 1)); this.treeTrunks.setMatrixAt(i, m4); });
    site.add(this.treeTrunks, this.treeTops);
    this.seasonApplied = null;
    this.group.add(site);
    // shadow camera around the apartment
    const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) / 2 + 5;
    const cam = this.sun.shadow.camera; cam.left = -span; cam.right = span; cam.top = span; cam.bottom = -span; cam.near = 1; cam.far = 200; cam.updateProjectionMatrix();
    this.resetPrecip();
  }

  resetPrecip() {
    for (let i = 0; i < RAIN_N; i++) this.spawnDrop(i, true);
    for (let i = 0; i < SNOW_N; i++) this.spawnFlake(i, true);
  }
  killY(x, z) {
    const a = this.apt; if (!a) return -100;
    if (a.isIndoor(x, z)) return a.H + 0.25;
    if (a.isInside(x, z)) return 0.01;
    for (const [x0, z0, x1, z1] of a.bp.footprint) if (x > x0 - 0.2 && x < x1 + 0.2 && z > z0 - 0.2 && z < z1 + 0.2) return a.H + 0.25;
    return a.groundY;
  }
  spawnDrop(i, anyY) {
    const c = this.focus || this.apt?.center || new THREE.Vector3(), R = 34, top = (this.apt?.H ?? 3) + 22, bot = this.apt?.groundY ?? -12;
    const x = c.x + (this.rand() - 0.5) * 2 * R, z = c.z + (this.rand() - 0.5) * 2 * R;
    const y = anyY ? bot + this.rand() * (top - bot) : top + this.rand() * 4;
    const p = this.rainPos; p[i * 6] = p[i * 6 + 3] = x; p[i * 6 + 1] = y; p[i * 6 + 4] = y + 0.35; p[i * 6 + 2] = p[i * 6 + 5] = z;
  }
  spawnFlake(i, anyY) {
    const c = this.focus || this.apt?.center || new THREE.Vector3(), R = 30, top = (this.apt?.H ?? 3) + 14, bot = this.apt?.groundY ?? -12;
    this.snowPos[i * 3] = c.x + (this.rand() - 0.5) * 2 * R; this.snowPos[i * 3 + 2] = c.z + (this.rand() - 0.5) * 2 * R;
    this.snowPos[i * 3 + 1] = anyY ? bot + this.rand() * (top - bot) : top + this.rand() * 3;
  }

  applySeason(season) {
    if (this.seasonApplied === season || !this.trees) return;
    this.seasonApplied = season;
    const pal = FOLIAGE[season], col = new THREE.Color();
    this.trees.forEach((t, i) => {
      col.set(t.ever ? '#2f5a3a' : pal[Math.floor(t.c * pal.length)]);
      this.treeTops.setColorAt(i, col);
    });
    this.treeTops.instanceColor.needsUpdate = true;
  }

  update(dt, env, camera) {
    const S = this.state;
    // live weather & time
    if (env.timeSpeed) env.hour = (env.hour + dt * env.timeSpeed / 60) % 24;
    if (env.live) {
      this.liveTimer -= dt;
      if (this.liveTimer <= 0) {
        this.liveTimer = 70 + this.rand() * 80;
        const w = LIVE_WEIGHTS[env.season]; let r = this.rand(), pick = 'clear';
        for (const [k, p] of Object.entries(w)) { if ((r -= p) <= 0) { pick = k; break; } }
        env.weather = pick; env.wind = clamp((pick === 'storm' ? 0.65 : 0.1) + this.rand() * 0.45, 0, 1); env.windDir = Math.round(this.rand() * 360);
        this.onWeatherChange?.(pick);
      }
    }
    const T = WEATHER_TARGETS[env.weather] || WEATHER_TARGETS.clear;
    const k = Math.min(1, dt * 0.35);
    for (const key of Object.keys(T)) S[key] = lerp(S[key], T[key], k);
    const storm = env.weather === 'storm';
    // wind
    const windMS = (env.wind ?? 0.2) * 15 * (0.8 + 0.3 * Math.sin(performance.now() / 1300) * Math.sin(performance.now() / 3700 + 1)) + (storm ? 4 : 0);
    const th = rad(env.windDir ?? 0);
    this.windVec.set(-Math.sin(th), 0, Math.cos(th)).multiplyScalar(windMS);
    this.windSpeed = windMS;

    // sun & sky
    const sunDir = sunDirection(env.season, env.hour);
    const el = sunDir.y;
    this.daylight = smoothstep(-0.12, 0.28, el);
    this.dark = 1 - smoothstep(-0.04, 0.2, el) * (1 - S.cloud * 0.35);
    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(sunDir); u.turbidity.value = 2 + S.cloud * 9; u.rayleigh.value = el < 0 ? 0.6 : 1.2 + S.cloud * 1.5;
    const ovColor = new THREE.Color().setHSL(0.6, 0.06, lerp(0.05, 0.62, this.daylight) * (storm ? 0.55 : 1));
    this.overcast.material.color.copy(ovColor); this.overcast.material.opacity = clamp(S.cloud * 1.05 - 0.1, 0, 0.94);
    // light rig
    const c = this.focus || this.apt?.center || new THREE.Vector3();
    const cloudDim = 1 - S.cloud * 0.8;
    if (el > -0.05) {
      this.sun.position.copy(c).addScaledVector(sunDir, 80); this.sun.target.position.copy(c);
      this.sun.intensity = 3.4 * smoothstep(-0.03, 0.15, el) * cloudDim;
      this.sun.color.setHSL(0.09, lerp(0.85, 0.25, smoothstep(0, 0.4, el)), lerp(0.62, 0.92, smoothstep(0, 0.4, el)));
    } else {
      const moonDir = new THREE.Vector3(-sunDir.x, Math.abs(sunDir.y) * 0.8 + 0.2, -sunDir.z).normalize();
      this.sun.position.copy(c).addScaledVector(moonDir, 80); this.sun.target.position.copy(c);
      this.sun.intensity = 0.22 * (1 - S.cloud * 0.9); this.sun.color.set('#9fb4ff');
    }
    this.hemi.intensity = (0.12 + 0.95 * this.daylight) * (1 - S.cloud * 0.35) + this.flash * 2.5;
    this.hemi.color.setHSL(0.6, lerp(0.3, 0.45, this.daylight) * (1 - S.cloud * 0.8), lerp(0.25, 0.8, this.daylight));
    this.hemi.groundColor.setHSL(0.08, 0.2, lerp(0.05, 0.35, this.daylight));
    this.flashLight.intensity = this.flash * 6;
    this.renderer.toneMappingExposure = lerp(1.1, 0.55, this.daylight);
    // fog
    const fogFar = lerp(1400, 70, S.fog) * (1 - S.rain * 0.3) * (1 - S.snow * 0.4);
    this.scene.fog.near = Math.min(150, fogFar * 0.08); this.scene.fog.far = Math.max(60, fogFar);
    this.scene.fog.color.setHSL(0.6, 0.1 * (1 - S.cloud), lerp(0.04, 0.72, this.daylight) * (1 - S.cloud * 0.25));
    // stars, moon, clouds
    this.stars.material.opacity = clamp((1 - this.daylight * 1.6) * (1 - S.cloud), 0, 1);
    this.stars.position.copy(camera.position);
    this.moon.material.opacity = clamp((1 - this.daylight * 1.5) * (1 - S.cloud * 0.9), 0, 1) * 0.95;
    this.moon.position.copy(camera.position).add(new THREE.Vector3(-sunDir.x, Math.abs(sunDir.y) * 0.7 + 0.25, -sunDir.z).normalize().multiplyScalar(2500));
    const cloudCol = new THREE.Color().setHSL(0.6, 0.05, lerp(0.08, 0.95, this.daylight) * (storm ? 0.55 : 1));
    for (const s of this.clouds.children) {
      s.material.opacity = clamp(S.cloud * 1.2 + 0.18, 0, 1) * s.userData.k; s.material.color.copy(cloudCol);
      s.position.addScaledVector(this.windVec, dt * 0.8);
      if (s.position.x - c.x > 700) s.position.x -= 1400; if (s.position.x - c.x < -700) s.position.x += 1400;
      if (s.position.z - c.z > 700) s.position.z -= 1400; if (s.position.z - c.z < -700) s.position.z += 1400;
    }
    this.sky.position.copy(camera.position); this.overcast.position.copy(camera.position);
    // env map (throttled)
    const now = performance.now();
    if ((this.lastEnv.sun.distanceTo(sunDir) > 0.03 || Math.abs(this.lastEnv.cloud - S.cloud) > 0.05) && now - this.lastEnv.t > 800) {
      this.envSky.material.uniforms.sunPosition.value.copy(sunDir);
      this.envSky.material.uniforms.turbidity.value = u.turbidity.value; this.envSky.material.uniforms.rayleigh.value = u.rayleigh.value;
      this.envOver.material.color.copy(ovColor); this.envOver.material.opacity = this.overcast.material.opacity;
      this.envRT?.dispose(); this.envRT = this.pmrem.fromScene(this.envScene, 0, 0.1, 2000);
      this.scene.environment = this.envRT.texture;
      this.lastEnv = { sun: sunDir.clone(), cloud: S.cloud, t: now };
    }
    this.scene.environmentIntensity = 0.06 + 0.32 * this.daylight * (1 - S.cloud * 0.4);
    // night windows in the city
    const lit = clamp(1 - this.daylight * 1.4, 0, 1) * 1.6;
    if (this.neighbors) for (const n of this.neighbors) n.userData.facade.emissiveIntensity = lit;
    if (this.apt?.facadeMat) this.apt.facadeMat.emissiveIntensity = lit;
    // season: ground, trees, snow cover
    this.applySeason(env.season);
    if (S.snow > 0.2) this.snowCover = Math.min(1, this.snowCover + dt * 0.03 * S.snow);
    else this.snowCover = Math.max(env.season === 'winter' ? 0.15 : 0, this.snowCover - dt * (env.season === 'winter' ? 0.002 : 0.02));
    if (this.groundMat) {
      const g = new THREE.Color({ spring: '#6f9a4a', summer: '#5d8a3c', autumn: '#8a8445', winter: '#7d7b66' }[env.season]);
      g.lerp(new THREE.Color('#f4f6f8'), this.snowCover);
      g.multiplyScalar(1 - S.rain * 0.25);
      this.groundMat.color.copy(g);
      this.roadMat.roughness = 0.85 - S.rain * 0.7; this.roadMat.color.set(this.snowCover > 0.6 ? '#dfe3e6' : S.rain > 0.3 ? '#2c2e31' : '#3b3d40');
    }
    if (this.trees) {
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
      const gy = this.apt.groundY, t = now / 1000, ws = Math.min(this.windSpeed, 15) / 15;
      const winter = env.season === 'winter';
      this.trees.forEach((tr, i) => {
        const bare = winter && !tr.ever;
        const sway = (0.02 + ws * 0.12) * Math.sin(t * (1.2 + ws * 2) + tr.phase);
        e.set(this.windVec.z / (this.windSpeed + 0.01) * sway, 0, -this.windVec.x / (this.windSpeed + 0.01) * sway);
        q.setFromEuler(e);
        const s = bare ? 0.001 : tr.r; sc.set(s, (tr.ever ? 1.5 : 1.05) * s, s);
        v.set(tr.x + Math.sin(e.z) * -tr.h * 0.3, gy + tr.h + s * 0.35, tr.z + Math.sin(e.x) * tr.h * 0.3);
        m4.compose(v, q, sc); this.treeTops.setMatrixAt(i, m4);
      });
      this.treeTops.instanceMatrix.needsUpdate = true;
    }
    // lightning
    this.flash = Math.max(0, this.flash - dt * 3.5);
    if (storm && S.rain > 0.6) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        this.nextBolt = 4 + this.rand() * 10; this.flash = 1;
        setTimeout(() => { this.flash = 0.7; }, 120);
        const dist = 0.3 + this.rand() * 0.7; setTimeout(() => this.onThunder?.(dist), 400 + dist * 3500);
      }
    }
    this.updatePrecip(dt, camera);
    this.outdoorTemp = outdoorTemp(env, S.cloud);
  }

  updatePrecip(dt, camera) {
    const S = this.state;
    // keep precipitation centered between the camera and the apartment
    const apc = this.apt?.center || new THREE.Vector3();
    this.focus = new THREE.Vector3().lerpVectors(apc, camera.position, camera.position.distanceTo(apc) < 40 ? 1 : 0.2).setY(0);
    const nr = Math.floor(RAIN_N * clamp(S.rain, 0, 1));
    this.rain.geometry.setDrawRange(0, nr * 2); this.rain.visible = nr > 0;
    if (nr) {
      const p = this.rainPos, fall = 11 + S.rain * 4, wx = this.windVec.x, wz = this.windVec.z;
      for (let i = 0; i < nr; i++) {
        const o = i * 6;
        p[o] += wx * dt; p[o + 2] += wz * dt; p[o + 1] -= fall * dt;
        p[o + 3] = p[o] - wx * 0.035; p[o + 5] = p[o + 2] - wz * 0.035; p[o + 4] = p[o + 1] + 0.38;
        if (p[o + 1] < this.killY(p[o], p[o + 2])) this.spawnDrop(i, false);
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
      this.rain.material.color.setHSL(0.6, 0.15, lerp(0.15, 0.75, this.daylight));
    }
    const ns = Math.floor(SNOW_N * clamp(S.snow, 0, 1));
    this.snow.geometry.setDrawRange(0, ns); this.snow.visible = ns > 0;
    if (ns) {
      const p = this.snowPos, t = performance.now() / 1000;
      for (let i = 0; i < ns; i++) {
        const o = i * 3;
        p[o] += (this.windVec.x * 0.35 + Math.sin(t + i) * 0.3) * dt; p[o + 2] += (this.windVec.z * 0.35 + Math.cos(t * 0.8 + i) * 0.3) * dt; p[o + 1] -= 1.1 * dt;
        if (p[o + 1] < this.killY(p[o], p[o + 2])) this.spawnFlake(i, false);
      }
      this.snow.geometry.attributes.position.needsUpdate = true;
    }
  }
}
