// Design document + undo/redo + autosave + share links.
import { uid, debounce, compress, decompress } from './util.js';
import { blueprintById } from './data/blueprints.js';

const LS_AUTOSAVE = 'thehome.autosave', LS_SAVED = 'thehome.saved', LS_USER = 'thehome.user';
export const USER_COLORS = ['#ff7a59', '#7c6cff', '#2bb3a3', '#e8a33d', '#e2559f', '#3d8bfd'];

export function newDesign({ blueprint = 'the-home', style = 'modern', furnished = true, user } = {}) {
  const bp = blueprintById(blueprint);
  const items = furnished ? bp.furniture.map(([model, x, z, rot, extra = {}]) => ({ id: uid(), model, x, z, y: extra.y ?? 0, rot: rot || 0, addedBy: user?.name })) : [];
  return {
    app: 'the-home', version: 1, id: uid(), name: `${user?.name ? user.name + "'s" : 'Our'} ${bp.name}`,
    blueprint: bp.id, style,
    structure: { floors: {}, wallColors: {}, wallFinishes: {}, openState: {} },
    items,
    cameras: [],
    env: { season: 'summer', hour: 16.5, weather: 'clear', wind: 0.25, windDir: 300, timeSpeed: 0, live: false, level: 6 },
    climate: { mode: 'auto', set: 71 },
    settings: { autoLights: true, units: 'imperial' },
    customModels: {},
    createdBy: user?.name, updatedBy: user?.name, updatedAt: Date.now(), log: [],
  };
}

export class Store extends EventTarget {
  constructor() {
    super();
    this.design = null; this.undoStack = []; this.redoStack = [];
    this.user = JSON.parse(localStorage.getItem(LS_USER) || 'null');
    this.beforeCommit = null; // hook (design) => void — used to re-settle gravity
    this.autosave = debounce(() => this.saveLocal(), 700);
  }
  setUser(user) { this.user = user; localStorage.setItem(LS_USER, JSON.stringify(user)); }

  load(design, { label = 'Loaded design', remote = false, resetHistory = true } = {}) {
    this.design = migrate(design);
    if (resetHistory) { this.undoStack = []; this.redoStack = []; }
    this.emit(label, { remote, full: true });
    this.autosave();
  }

  // Mutate the design inside fn(design). Records an undo step and broadcasts the change.
  commit(label, fn, opts = {}) {
    const before = JSON.stringify(this.design);
    fn(this.design);
    return this.record(label, before, opts);
  }
  // Record a change that was already applied to this.design (e.g. live dragging).
  record(label, before, { remote = false, by } = {}) {
    this.beforeCommit?.(this.design);
    if (JSON.stringify(this.design) === before) return false;
    this.undoStack.push(before); if (this.undoStack.length > 150) this.undoStack.shift();
    this.redoStack = [];
    const who = by || this.user?.name || 'Someone';
    this.design.updatedBy = who; this.design.updatedAt = Date.now();
    this.design.log = [{ who, what: label, at: Date.now() }, ...(this.design.log || [])].slice(0, 60);
    this.emit(label, { remote });
    this.autosave();
    return true;
  }
  undo() { if (!this.undoStack.length) return; this.redoStack.push(JSON.stringify(this.design)); this.design = JSON.parse(this.undoStack.pop()); this.emit('Undo', { full: true }); this.autosave(); }
  redo() { if (!this.redoStack.length) return; this.undoStack.push(JSON.stringify(this.design)); this.design = JSON.parse(this.redoStack.pop()); this.emit('Redo', { full: true }); this.autosave(); }
  emit(label, extra = {}) { this.dispatchEvent(new CustomEvent('change', { detail: { label, ...extra } })); }

  // ---- local persistence
  saveLocal() { if (this.design) try { localStorage.setItem(LS_AUTOSAVE, JSON.stringify(this.design)); } catch (e) { console.warn('autosave failed', e); } }
  loadAutosave() { try { return JSON.parse(localStorage.getItem(LS_AUTOSAVE) || 'null'); } catch { return null; } }
  savedList() { try { return Object.values(JSON.parse(localStorage.getItem(LS_SAVED) || '{}')).sort((a, b) => b.updatedAt - a.updatedAt); } catch { return []; } }
  saveAs(name) {
    const all = JSON.parse(localStorage.getItem(LS_SAVED) || '{}');
    if (name) this.design.name = name;
    all[this.design.id] = JSON.parse(JSON.stringify(this.design));
    localStorage.setItem(LS_SAVED, JSON.stringify(all));
  }
  deleteSaved(id) { const all = JSON.parse(localStorage.getItem(LS_SAVED) || '{}'); delete all[id]; localStorage.setItem(LS_SAVED, JSON.stringify(all)); }

  // ---- share links
  async shareURL() {
    const data = await compress(JSON.stringify(this.design));
    return `${location.origin}${location.pathname}#d=${data}`;
  }
  static async fromHash() {
    const m = location.hash.match(/#d=([\w-]+)/);
    if (!m) return null;
    try { return JSON.parse(await decompress(m[1])); } catch (e) { console.warn('bad share link', e); return null; }
  }
}

export function migrate(d) {
  d.structure ||= {}; d.structure.floors ||= {}; d.structure.wallColors ||= {}; d.structure.wallFinishes ||= {}; d.structure.openState ||= {};
  d.items ||= []; d.cameras ||= []; d.customModels ||= {}; d.log ||= [];
  d.env = { season: 'summer', hour: 16.5, weather: 'clear', wind: 0.25, windDir: 300, timeSpeed: 0, live: false, level: 6, ...(d.env || {}) };
  d.climate = { mode: 'auto', set: 71, ...(d.climate || {}) };
  d.settings = { autoLights: true, units: 'imperial', ...(d.settings || {}) };
  return d;
}
