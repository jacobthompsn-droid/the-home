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

class App {
  async init() {
    const canvas = this.canvas = document.getElementById('scene');
    this.quality = localStorage.getItem('thehome.quality') || 'high';
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio, this.quality === 'high' ? 2 : 1));
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.localClippingEnabled = true;
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
    this.ui = new UI(this);
    this.partners = new Map();
    this.cutaway = null;

    this.store.beforeCommit = (d) => this.items.settleAll(d.items, this.apartment);
    this.store.addEventListener('change', (e) => this.onChange(e.detail));
    this.env.onThunder = (d) => this.audio.thunder(d);
    this.env.onWeatherChange = () => this.ui.refreshClimate();
    this.cameras.addEventListener('mode', () => this.onMode());
    this.cameras.addEventListener('lockchange', () => this.ui.onLock());
    this.setupLive();
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

    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.tick());
    setInterval(() => this.store.saveLocal(), 5000); // keeps time-of-day/weather between visits
    document.getElementById('loading')?.remove();
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false); this.labels.setSize(w, h); this.cameras.resize(w, h);
  }
  setQuality(q) {
    this.quality = q; localStorage.setItem('thehome.quality', q);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, q === 'high' ? 2 : 1));
    this.env.sun.shadow.mapSize.set(q === 'high' ? 2048 : 1024, q === 'high' ? 2048 : 1024); this.env.sun.shadow.map?.dispose(); this.env.sun.shadow.map = null;
    this.resize();
  }

  get design() { return this.store.design; }
  get style() { return styleById(this.design.style); }

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
      if (blueprintChanged) { this.env.setSite(this.apartment); this.cameras.frame(this.apartment); }
      this.lastShell = shellSig; this.lastBlueprint = bp.id; this.lastLevel = d.env.level;
      this.applyCutaway();
    }
    for (const o of this.apartment.openings) { const st = s.openState[o.key]; if (st != null) o.target = st ? 1 : 0; }
    this.physics.syncOpenings();
    this.items.settleAll(d.items, this.apartment);
    this.refreshItems();
    if (!remote && this.live.active && label !== 'Loaded design') this.live.sendDesign(label);
    this.ui.onDesignChange({ label, remote, full });
  }

  refreshItems({ live } = {}) {
    this.items.sync(this.design, this.style, this.apartment);
    this.physics.syncItems(this.items);
    this.applyCutaway();
  }

  setMode(mode) {
    if (mode === 'walk' && this.cameras.mode === 'walk') return this.cameras.lock.lock();
    this.editor.cancelPlacing();
    this.cameras.setMode(mode);
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
    this.cutaway = m === 'orbit' && this.cutawayOn ? 1.25 : null;
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
    const color = msg.user?.color || USER_COLORS[1];
    if (!p) {
      const group = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.0, 6, 16), mat); body.position.y = 0.85; body.castShadow = true;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 14), mat); head.position.y = 1.62; head.castShadow = true;
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 12), new THREE.MeshStandardMaterial({ color: '#ffffff' })); nose.rotation.x = -Math.PI / 2; nose.position.set(0, 1.62, -0.2);
      const cam = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.5, 4), mat); cam.rotation.x = Math.PI / 2; cam.visible = false;
      group.add(body, head, nose); this.scene.add(group, cam);
      const el = document.createElement('div'); el.className = 'partner-label'; el.style.background = color;
      const label = new CSS2DObject(el); this.scene.add(label);
      p = { group, cam, label, el }; this.partners.set(peer, p);
    }
    p.el.textContent = msg.user?.name || 'Partner';
    const pos = new THREE.Vector3(...msg.pos), dir = new THREE.Vector3(...msg.dir);
    if (msg.mode === 'walk') {
      p.group.visible = true; p.cam.visible = false;
      p.group.position.set(pos.x, pos.y - 1.62, pos.z); p.group.rotation.y = Math.atan2(-dir.x, -dir.z);
      p.label.position.set(pos.x, pos.y + 0.35, pos.z);
    } else {
      p.group.visible = false; p.cam.visible = true;
      p.cam.position.copy(pos); p.cam.lookAt(pos.clone().add(dir)); p.cam.rotateX(Math.PI / 2);
      p.label.position.copy(pos).add(new THREE.Vector3(0, 0.5, 0));
    }
  }

  // ------------------------------------------------------------ tools
  screenshot() {
    this.renderer.render(this.scene, this.cameras.camera);
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
    if (this.live.active) {
      const dir = new THREE.Vector3(); this.cameras.persp.getWorldDirection(dir);
      this.live.sendPresence({ pos: this.cameras.persp.position.toArray(), dir: dir.toArray(), mode: this.cameras.mode });
    }
    this.ui.tick(dt);
    this.renderer.render(this.scene, cam);
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
