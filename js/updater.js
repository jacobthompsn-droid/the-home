// Keeps The Home up to date without anyone pressing refresh:
//  • new or changed Playbox models (pushed by an agent or the app) hot-load into the running app
//  • when the app's code changes, it saves your work and reloads itself (instantly if the tab is in the
//    background, otherwise after a short heads-up you can postpone)
import { h } from './util.js';

const POLL_MS = 40000;

export class Updater {
  constructor(app) {
    this.app = app; this.sha = null; this.lastInput = Date.now(); this.banner = null; this.snoozeUntil = 0;
    for (const ev of ['pointerdown', 'keydown', 'wheel']) addEventListener(ev, () => { this.lastInput = Date.now(); }, { passive: true });
  }

  start() {
    this.checkVersion(true);
    this.timer = setInterval(() => this.tick(), POLL_MS);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.tick(); });
    addEventListener('focus', () => this.tick());
  }
  tick() {
    if (Date.now() - (this.lastTick || 0) < 8000) return;
    this.lastTick = Date.now();
    this.checkModels(); this.checkVersion();
  }

  async checkModels() {
    const lib = this.app.library;
    let idx;
    try { idx = await (await fetch(`models/index.json?t=${Date.now()}`, { cache: 'no-store' })).json(); } catch { return; }
    const fresh = [], changed = [];
    await Promise.all((idx.models || []).map(async (e) => {
      const meta = lib.meta.get(e.id);
      if (meta && !meta.local && meta.hash === e.hash) return;
      if (meta?.local && !e.hash) return;
      try {
        const model = await (await fetch(`${e.path}?v=${e.hash || Date.now()}`, { cache: 'no-store' })).json();
        (meta ? changed : fresh).push(model.name);
        lib.add(model, { path: e.path, hash: e.hash });
      } catch {}
    }));
    if (!fresh.length && !changed.length) return;
    lib.dispatchEvent(new Event('change'));
    this.app.ui.refreshPlaybox();
    if (changed.length) this.app.refreshItems();
    const list = (a) => a.slice(0, 3).join(', ') + (a.length > 3 ? ` +${a.length - 3} more` : '');
    if (fresh.length) this.app.ui.toast(`🧸 New in the Playbox: ${list(fresh)}`, 5000);
    if (changed.length) this.app.ui.toast(`✨ Updated: ${list(changed)}`, 4000);
  }

  async checkVersion(first) {
    let v;
    try { v = await (await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' })).json(); } catch { return; }
    if (!v?.sha) return;
    if (first || !this.sha) { this.sha = v.sha; return; }
    if (v.sha === this.sha) return;
    this.pending = v;
    const busy = this.app.sim.active || this.app.editor.drag || this.app.editor.placing || this.app.live.active;
    const idle = Date.now() - this.lastInput > 90000;
    if (document.hidden || (idle && !busy)) return this.reload();
    if (Date.now() > this.snoozeUntil) this.showBanner();
  }

  showBanner() {
    if (this.banner) return;
    let n = 20;
    const count = h('b', {}, `${n}s`);
    this.banner = h('div#update-banner', {},
      h('span', {}, '✨ A new version of The Home is ready — updating in '), count,
      h('button.btn.small.primary', { onclick: () => this.reload() }, 'Update now'),
      h('button.btn.small', { onclick: () => { this.snoozeUntil = Date.now() + 10 * 60000; this.hideBanner(); } }, 'Later'));
    document.body.append(this.banner);
    this.countdown = setInterval(() => {
      n--; count.textContent = `${n}s`;
      if (n <= 0) { const busy = this.app.sim.active || this.app.editor.drag || this.app.editor.placing; if (busy) { n = 10; return; } this.reload(); }
    }, 1000);
  }
  hideBanner() { clearInterval(this.countdown); this.banner?.remove(); this.banner = null; }

  reload() {
    this.hideBanner();
    try { this.app.store.saveLocal(); sessionStorage.setItem('thehome.updated', this.pending?.sha || '1'); } catch {}
    location.reload();
  }
}
