// The Home — app bootstrap & main loop.
import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { Store, newDesign, migrate, USER_COLORS } from './store.js';
import { ModelLibrary } from './models.js';
import { Apartment } from './apartment.js';
import { ItemsLayer } from './items.js';
import { Environment } from './environment.js';
import { Climate } from './climate.js';
import { Physics } from './physics.js';
import { Cameras } from './cameras.js';
import { Editor } from './editor.js';
import { Ambience } from './audio.js';
import { GitHub, LiveSession } from './collab.js';
import { UI } from './ui.js';
import { blueprintById } from './data/blueprints.js';
import { styleById } from './data/styles.js';
import { download, slug } from './util.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Sim } from './sim.js';
import { Thumbs } from './thumbs.js';
import { Updater } from './updater.js';
import { makeAvatar, eyeHeight, DEFAULT_HEIGHT } from './avatar.js';

// quality presets: pixel ratio cap, ambient occlusion, bloom, shadow map size
const QUALITY = {
  ultra: { dpr: 2, ao: true, bloom: true, shadow: 4096 },
  high: { dpr: 1.5, ao: true, bloom: true, shadow: 4096 },
  medium: { dpr: 1.25, ao: false, bloom: true, shadow: 2048 },
  low: { dpr: 1, ao: false, bloom: false, shadow: 1024 },
};

class App {
  async init() {
    const canvas = this.canvas = document.getElementById('scene');
    this.quality = QUALITY[localStorage.getItem('thehome.quality')] ? localStorage.getItem('thehome.quality') : 'high';
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio, QUALITY[this.quality].dpr));
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.AgXToneMapping; r.localClippingEnabled = true;
    this.labels = new CSS2DRenderer({ element: document.getElementById('labels') });
    this.scene = new THREE.Scene();

    this.store = new Store();
    this.library = new ModelLibrary();
    this.physics = new Physics();
    this.cameras = new Cameras(canvas, this.physics);
    this.env = new Environment(this.scene, r);
    this.apartment = new Apartment(this.scene);
    this.items = new ItemsLayer(this.scene, this.library);
    this.climate = new Climate(this.scene);
    this.audio = new Ambience();
    this.github = new GitHub();
    this.live = new LiveSession(this.store);
    this.editor = new Editor(this);
    this.sim = new Sim(this);
    this.thumbs = new Thumbs();
    this.ui = new UI(this);
    this.partners = new Map();
    this.me = { key: '', body: null, avatar: null, label: null };
    this.cutaway = null;

    this.store.beforeCommit = (d) => this.items.settleAll(d.items, this.apartment);
    this.store.addEventListener('change', (e) => this.onChange(e.detail));
    this.env.onThunder = (d) => this.audio.thunder(d);
    this.env.onWeatherChange = () => this.ui.refreshClimate();
    this.cameras.addEventListener('mode', () => this.onMode());
    this.cameras.addEventListener('focus', () => this.applyCutaway()); // lower the walls while zoomed in on a room
    this.cameras.addEventListener('lockchange', () => this.ui.onLock());
    this.setupLive();
    this.setupPost();
    addEventListener('resize', () => this.resize()); this.resize();
    addEventListener('pointerdown', () => this.audio.start(), { once: true });
    addEventListener('keydown', () => this.audio.start(), { once: true });

    this.ui.build();
    await this.library.load();
    this.ui.refreshPlaybox();

    // Which design to open: share link → last autosave → first-run wizard
    const shared = await Store.fromHash();
    const auto = this.store.loadAutosave();
    if (shared) { this.loadDesign(shared, 'Opened shared link'); history.replaceState(null, '', location.pathname); this.ui.toast('Opened a shared design 💌'); }
    else if (auto && this.store.user) this.loadDesign(auto, 'Welcome back');
    else { this.loadDesign(newDesign({ user: this.store.user || { name: 'Us' } }), 'Preview'); this.ui.wizard(); }

    this.sim.welcome();
    // ask for your height once, as soon as no other window is open
    const ask = setInterval(() => {
      if (!this.store.user || this.store.user.height) return clearInterval(ask);
      if (!document.getElementById('modal').classList.contains('open') && this.cameras.mode !== 'walk') { clearInterval(ask); this.ui.askHeight(); }
    }, 1500);
    this.updater = new Updater(this); this.updater.start();
    if (sessionStorage.getItem('thehome.updated')) { sessionStorage.removeItem('thehome.updated'); setTimeout(() => this.ui.toast('✨ Updated to the latest version', 3000), 800); }
    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.tick());
    setInterval(() => this.store.saveLocal(), 5000); // keeps time-of-day/weather between visits
    document.getElementById('loading')?.remove();
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false); this.labels.setSize(w, h); this.cameras.resize(w, h);
    if (this.composer) { this.composer.setPixelRatio(this.renderer.getPixelRatio()); this.composer.setSize(w, h); }
  }
  setQuality(q) {
    this.quality = q; localStorage.setItem('thehome.quality', q);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, QUALITY[q].dpr));
    this.setupPost();
    this.resize();
  }
  // Post-processing: ground-truth ambient occlusion (soft contact shadows) + gentle bloom on lights & screens.
  setupPost() {
    const Q = QUALITY[this.quality];
    const sm = Q.shadow; this.env.sun.shadow.mapSize.set(sm, sm); this.env.sun.shadow.map?.dispose(); this.env.sun.shadow.map = null;
    this.composer?.dispose(); this.composer = null; this.gtao = null; this.bloom = null;
    if (!Q.ao && !Q.bloom) return;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    const c = this.composer = new EffectComposer(this.renderer, rt);
    this.renderPass = new RenderPass(this.scene, this.cameras.persp); c.addPass(this.renderPass);
    if (Q.ao) {
      this.aoCam = new THREE.PerspectiveCamera();
      this.gtao = new GTAOPass(this.scene, this.aoCam, size.x, size.y);
      this.gtao.blendIntensity = 0.9;
      this.gtao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 16, distanceFallOff: 1 });
      this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 16 });
      c.addPass(this.gtao);
    }
    if (Q.bloom) { this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.28, 0.55, 2.5); c.addPass(this.bloom); }
    c.addPass(new OutputPass());
    c.setPixelRatio(this.renderer.getPixelRatio()); c.setSize(innerWidth, innerHeight);
  }
  render(cam) {
    if (!this.composer) return this.renderer.render(this.scene, cam);
    this.renderPass.camera = cam;
    if (this.gtao) {
      const ok = cam.isPerspectiveCamera; this.gtao.enabled = ok;
      if (ok) { this.aoCam.copy(cam, false); this.aoCam.layers.set(0); this.aoCam.updateMatrixWorld(); this.aoCam.updateProjectionMatrix(); }
    }
    if (this.bloom) this.bloom.threshold = 1.7 / this.renderer.toneMappingExposure;
    this.composer.render();
  }

  get design() { return this.store.design; }
  get style() { return styleById(this.design?.style); }

  loadDesign(d, label) {
    d = migrate(JSON.parse(JSON.stringify(d)));
    for (const m of Object.values(d.customModels || {})) this.library.importJSON(m, { persist: false });
    this.lastShell = null;
    this.store.load(d, { label });
  }

  // Called after every change to the design (local edit, undo, or partner edit)
  onChange({ label, remote, full }) {
    const d = this.design;
    const bp = blueprintById(d.blueprint), style = this.style;
    const s = d.structure;
    const shellSig = JSON.stringify([bp.id, style.id, s.floors, s.wallColor, s.wallFinish, s.wallColors, s.wallFinishes, d.env.level]);
    if (shellSig !== this.lastShell) {
      const blueprintChanged = this.lastBlueprint !== bp.id || this.lastLevel !== d.env.level;
      this.apartment.build(bp, style, d);
      this.physics.setStructure(this.apartment);
      this.climate.setApartment(this.apartment);
      if (blueprintChanged) { this.env.setSite(this.apartment); this.cameras.frame(this.apartment); this.me.body = null; }
      this.lastShell = shellSig; this.lastBlueprint = bp.id; this.lastLevel = d.env.level;
      this.applyCutaway();
    }
    for (const o of this.apartment.openings) { const st = s.openState[o.key]; if (st != null) o.target = st ? 1 : 0; }
    this.physics.syncOpenings();
    this.items.settleAll(d.items, this.apartment);
    this.refreshItems();
    this.sim.onDesignChange();
    if (!remote && this.live.active && label !== 'Loaded design') this.live.sendDesign(label);
    this.ui.onDesignChange({ label, remote, full });
  }

  refreshItems({ live } = {}) {
    this.items.sync(this.design, this.style, this.apartment);
    this.physics.syncItems(this.items);
    this.applyCutaway();
  }

  setMode(mode, opts = {}) {
    const cams = this.cameras, from = cams.mode;
    if (mode === from) return;
    this.sim.cancel();
    this.editor.cancelPlacing();
    if (mode === 'walk' && !opts.at) {
      // step in right where you were looking, facing the same way
      const t = from === 'plan' ? cams.plan.target : cams.orbit.target;
      if (this.apartment.isInside(t.x, t.z)) {
        opts.at = t.clone();
        if (from === 'orbit') opts.yaw = Math.atan2(-(t.x - cams.persp.position.x), -(t.z - cams.persp.position.z));
      }
    }
    cams.setMode(mode, opts);
  }
  onMode() {
    const m = this.cameras.mode;
    document.body.dataset.mode = m;
    this.apartment.ceilings.visible = m === 'walk';
    this.apartment.labels.visible = m === 'plan';
    this.applyCutaway();
    this.ui.onMode();
  }
  setCutaway(on) { this.cutawayOn = on; this.applyCutaway(); }
  applyCutaway() {
    const m = this.cameras.mode;
    this.cutaway = m === 'orbit' && (this.cutawayOn || this.cameras.focused != null) ? 1.25 : null;
    this.apartment.setCutaway(this.cutaway);
    for (const e of this.items.entries.values()) {
      const p = e.model.placement;
      e.outer.visible = !((this.cutaway != null && (p === 'wall' || p === 'ceiling') && (e.item.y ?? 0) > 1.0) || (m === 'plan' && p === 'ceiling'));
    }
  }

  // ------------------------------------------------------------ live sessions
  setupLive() {
    const L = this.live;
    L.addEventListener('message', (e) => {
      const { msg, peer } = e.detail;
      if (msg.type === 'design') {
        for (const m of Object.values(msg.design.customModels || {})) this.library.importJSON(m, { persist: false });
        this.store.design = migrate(msg.design);
        this.store.emit(msg.label, { remote: true, by: msg.by });
        this.store.autosave();
        if (msg.by && msg.label !== 'Joined session') this.ui.toast(`${msg.by}: ${msg.label}`, 1800);
      } else if (msg.type === 'move') {
        for (const m of msg.items) { const it = this.design.items.find((i) => i.id === m.id); if (it) Object.assign(it, m); }
        this.refreshItems({ live: true });
      } else if (msg.type === 'presence') this.updatePartner(peer, msg);
      else if (msg.type === 'hello') this.ui.toast(`💞 ${msg.user?.name || 'Your partner'} joined`, 2500);
    });
    L.addEventListener('leave', (e) => { const p = this.partners.get(e.detail.peer); if (p) { this.scene.remove(p.group); p.label.element.remove(); this.partners.delete(e.detail.peer); } this.ui.toast('Partner left the session'); });
    L.addEventListener('status', () => this.ui.refreshLive());
  }
  updatePartner(peer, msg) {
    let p = this.partners.get(peer);
    const color = msg.user?.color || USER_COLORS[1], height = msg.user?.height || DEFAULT_HEIGHT, key = `${color}|${height}`;
    if (!p) {
      const group = new THREE.Group(); group.visible = false;
      const cam = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.5, 4), new THREE.MeshStandardMaterial({ color, roughness: 0.5 })); cam.rotation.x = Math.PI / 2; cam.visible = false;
      this.scene.add(group, cam);
      const el = document.createElement('div'); el.className = 'partner-label'; el.style.background = color;
      const label = new CSS2DObject(el); this.scene.add(label);
      p = { group, cam, label, el, key: '' }; this.partners.set(peer, p);
    }
    if (p.key !== key) { // (re)build their body at their real height
      p.group.clear(); p.group.add(makeAvatar({ color, height })); p.key = key; p.height = height;
      p.el.style.background = color; p.cam.material.color.set(color);
    }
    p.el.textContent = msg.user?.name || 'Partner';
    const pos = new THREE.Vector3(...msg.pos), dir = new THREE.Vector3(...msg.dir);
    // where their body stands: sent directly by newer versions, otherwise worked out from their eyes
    const body = msg.body || (msg.mode === 'walk' ? [pos.x, pos.y - eyeHeight(height), pos.z, Math.atan2(-dir.x, -dir.z)] : null);
    if (body) { p.group.visible = true; p.group.position.set(body[0], body[1], body[2]); p.group.rotation.y = body[3]; }
    p.cam.visible = msg.mode !== 'walk';
    if (msg.mode === 'walk') p.label.position.set(body[0], body[1] + p.height + 0.25, body[2]);
    else {
      p.cam.position.copy(pos); p.cam.lookAt(pos.clone().add(dir)); p.cam.rotateX(Math.PI / 2);
      p.label.position.copy(pos).add(new THREE.Vector3(0, 0.5, 0));
    }
  }

  // Your own body: matches your height, and stands where you last walked so you can size things up
  // from the dollhouse (hidden while you're looking through its eyes in walk mode).
  updateMe() {
    const me = this.me, u = this.store.user, cams = this.cameras;
    const height = u?.height || DEFAULT_HEIGHT, color = u?.color || USER_COLORS[0], key = `${color}|${height}|${u?.name}`;
    if (me.key !== key) {
      cams.setHeight(height);
      if (me.avatar) this.scene.remove(me.avatar);
      me.avatar = makeAvatar({ color, height }); this.scene.add(me.avatar);
      if (!me.label) { me.el = document.createElement('div'); me.el.className = 'partner-label me-label'; me.label = new CSS2DObject(me.el); this.scene.add(me.label); }
      me.el.style.background = color; me.el.textContent = u?.name ? `${u.name} (you)` : 'You';
      me.key = key;
    }
    if (!me.body && this.apartment?.bp) { const sp = this.apartment.bp.spawn || [0, 0, 0]; me.body = [sp[0], 0, sp[1], (sp[2] || 0) * Math.PI / 180]; }
    if (cams.mode === 'walk') {
      const p = this.physics.player.position;
      me.body = [p.x, Math.max(0, p.y), p.z, cams.persp.rotation.y];
    }
    const b = me.body, show = cams.mode !== 'walk' && !!b;
    me.avatar.visible = show; me.label.visible = show; me.el.style.display = show ? '' : 'none';
    if (b) { me.avatar.position.set(b[0], b[1], b[2]); me.avatar.rotation.y = b[3]; me.label.position.set(b[0], b[1] + height + 0.25, b[2]); }
  }

  // ------------------------------------------------------------ tools
  screenshot() {
    this.render(this.cameras.camera);
    download(`${slug(this.design.name)}-${Date.now()}.png`, this.canvas.toDataURL('image/png'));
  }
  async playTour() {
    const cams = this.design.cameras;
    if (!cams.length) return this.ui.toast('Save a few views first (Views tab).');
    this.touring = true; this.ui.toast('Tour started · press Esc to stop', 2000);
    const stop = (e) => { if (e.key === 'Escape') this.touring = false; };
    addEventListener('keydown', stop);
    for (const v of cams) {
      if (!this.touring) break;
      this.ui.toast(`🎥 ${v.name}`, 2600);
      this.cameras.flyTo(v, 2.2);
      await new Promise((r) => setTimeout(r, 4200));
    }
    this.touring = false; removeEventListener('keydown', stop);
  }

  // ------------------------------------------------------------ main loop
  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const d = this.design; if (!d) return;
    const cam = this.cameras.camera;
    this.env.update(dt, d.env, this.cameras.persp);
    this.apartment.update(dt);
    const devices = this.items.devices();
    this.climate.update(dt, { design: d, envState: this.env, outdoorTemp: this.env.outdoorTemp, daylight: this.env.daylight, devices });
    const apt = this.apartment, wind = this.env.windVec;
    this.physics.step(dt, (p) => {
      const v = this.climate.airAt(p);
      if (!apt.isIndoor(p.x, p.z)) v.addScaledVector(wind, 0.35);
      return v;
    });
    this.cameras.update(dt);
    this.items.update(dt, { dark: this.env.dark, autoLights: d.settings.autoLights, climate: this.climate });
    this.editor.update();
    // ambience
    const p = this.cameras.persp.position, inside = apt.isIndoor(p.x, p.z) && this.cameras.mode === 'walk';
    const openness = apt.openings.filter((o) => o.wall.ext).reduce((a, o) => a + o.open * o.width, 0);
    const fans = devices.filter((x) => x.kind === 'fan' && x.on).length;
    this.audio.update({ rain: this.env.state.rain, wind: Math.min(1, this.env.windSpeed / 14), hvac: this.climate.hvacMode ? 1 : 0, fan: fans * 0.5, exposure: inside ? Math.min(1, openness / 3) : 1 });
    // live presence
    this.updateMe();
    if (this.live.active) {
      const dir = new THREE.Vector3(); this.cameras.persp.getWorldDirection(dir);
      this.live.sendPresence({ pos: this.cameras.persp.position.toArray(), dir: dir.toArray(), mode: this.cameras.mode, body: this.me.body?.map((v) => +v.toFixed(3)) });
    }
    this.ui.tick(dt);
    this.sim.update(dt);
    this.render(cam);
    this.sim.afterRender();
    this.labels.render(this.scene, cam);
  }
}

const app = new App();
window.theHome = app; // handy for debugging in the console
app.init().catch((e) => {
  console.error(e);
  const el = document.getElementById('loading');
  if (el) el.innerHTML = `<div class="load-card"><b>Something went wrong loading The Home.</b><pre>${e.message}</pre><p>Make sure you're opening it through a web server (see README), not by double-clicking index.html.</p></div>`;
});
