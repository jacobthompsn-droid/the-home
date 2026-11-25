// All the DOM UI for The Home.
import { h, fmtMoney, fmtTemp, fmtArea, download, slug, clamp } from './util.js';
import { BLUEPRINTS, blueprintById } from './data/blueprints.js';
import { STYLES, styleById, FLOOR_TYPES, WALL_FINISHES, floorRole } from './data/styles.js';
import { CATEGORIES, CATEGORY_LABELS, FINISHES } from './model-spec.js';
import { tokensUsed, partNames, partSpec, resolveColor, TOKEN_LABELS } from './models.js';
import { SEASONS, WEATHERS } from './environment.js';
import { newDesign, migrate, USER_COLORS } from './store.js';
import { isTyping } from './cameras.js';
import { CONFIG } from './config.js';
import { icon } from './icons.js';
import { METERS, CHORES } from './sim.js';

const SEASON_ICON = { spring: '🌸', summer: '☀️', autumn: '🍂', winter: '❄️' };
const WEATHER_ICON = { clear: '☀️', cloudy: '☁️', rain: '🌧️', storm: '⛈️', snow: '🌨️', fog: '🌫️' };
const fmtHour = (hr) => { const H = Math.floor(hr) % 24, M = Math.floor((hr % 1) * 60); return `${((H + 11) % 12) + 1}:${String(M).padStart(2, '0')} ${H < 12 ? 'AM' : 'PM'}`; };
const ago = (t) => { const s = (Date.now() - t) / 1000; return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`; };
const $ = (id) => document.getElementById(id);
const ico = (n, sz) => icon(n, sz);
const add = (el, ...kids) => el.append(...kids.flat(Infinity).filter((k) => k != null && k !== false));

export class UI {
  constructor(app) { this.app = app; this.leftTab = 'playbox'; this.rightTab = 'climate'; this.cat = 'all'; this.q = ''; this.hudT = 0; this.openParts = false; }
  get d() { return this.app.design; }
  get store() { return this.app.store; }

  build() {
    this.buildTop(); this.buildLeft(); this.buildRight(); this.buildHud(); this.buildWalk(); this.buildRooms();
    // phones: the panels would cover the whole 3D view, so start with both tucked away and show one at a time
    const small = matchMedia('(max-width: 900px)');
    if (small.matches) { $('left').classList.add('collapsed'); $('right').classList.add('collapsed'); }
    for (const [a, b] of [['left', 'right'], ['right', 'left']]) {
      new MutationObserver(() => { if (small.matches && !$(a).classList.contains('collapsed')) $(b).classList.add('collapsed'); }).observe($(a), { attributes: true, attributeFilter: ['class'] });
    }
    this.app.editor.addEventListener('select', () => { if (this.app.editor.selection) this.rightTab = 'inspect'; this.renderRight(); });
    addEventListener('keydown', (e) => {
      if (isTyping(e) || e.ctrlKey || e.metaKey) return;
      if (e.code === 'Digit1') this.app.setMode('orbit');
      if (e.code === 'Digit2') this.app.setMode('plan');
      if (e.code === 'Digit3') this.app.setMode('walk');
      if ((e.code === 'Escape' || e.code === 'KeyH') && this.app.cameras.mode === 'orbit' && !e.escHandled && this.app.cameras.focused != null) this.app.cameras.frameAll();
      if (e.code === 'Escape' && this.app.cameras.mode === 'walk' && !e.escHandled) { if (this.app.sim.active) this.app.sim.cancel(); else this.app.setMode('orbit'); }
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('.menu-wrap')) document.querySelectorAll('.menu').forEach((m) => m.classList.remove('open')); });
  }

  // ================================================================ top bar
  buildTop() {
    const bar = $('topbar');
    const modeBtn = (mode, ic, label, key) => h('button.seg', { dataset: { mode }, title: `${label} (${key})`, onclick: () => this.app.setMode(mode) }, ico(ic, 16), h('span', {}, label));
    this.nameInput = h('input.design-name', { value: '', title: 'Rename this design', onchange: (e) => this.store.commit('Renamed design', (d) => { d.name = e.target.value || 'Our Home'; }) });
    const menu = (content, items) => {
      const m = h('div.menu', {}, items.map(([ic, t, fn]) => t === '-' ? h('hr') : h('button', { onclick: () => { m.classList.remove('open'); fn(); } }, ico(ic, 15), h('span', {}, t))));
      return h('div.menu-wrap', {}, h('button.btn', { onclick: (e) => { e.stopPropagation(); document.querySelectorAll('.menu').forEach((x) => x !== m && x.classList.remove('open')); m.classList.toggle('open'); } }, ...content), m);
    };
    const iconBtn = (ic, title, fn) => h('button.btn.icon', { title, onclick: fn }, ico(ic, 17));
    this.userChip = h('button.user-chip', { onclick: () => this.settings() });
    this.liveBtn = h('button.btn.live-btn', { onclick: () => this.liveModal() }, ico('users', 16), h('span', {}, 'Live'));
    bar.append(
      h('div.brand', {}, h('div.logo-mark', {}, ico('house', 18)), h('b', {}, CONFIG.appName)),
      h('div.divider'),
      this.nameInput,
      h('div.segs', {}, modeBtn('orbit', 'house', 'Dollhouse', '1'), modeBtn('plan', 'map', 'Blueprint', '2'), modeBtn('walk', 'walk', 'Walk', '3')),
      h('div.tool-group', {},
        this.cutBtn = h('button.btn.icon', { title: 'Cutaway walls', onclick: () => { this.app.setCutaway(!this.app.cutawayOn); this.cutBtn.classList.toggle('on', this.app.cutawayOn); } }, ico('scissors', 17)),
        iconBtn('undo', 'Undo (Ctrl+Z)', () => this.store.undo()),
        iconBtn('redo', 'Redo (Ctrl+Shift+Z)', () => this.store.redo()),
        iconBtn('camera', 'Screenshot', () => this.app.screenshot())),
      h('div.spacer'),
      menu([ico('folder', 16), h('span', {}, 'Designs'), ico('chevron', 14)], [
        ['download', 'Save in this browser', () => { this.store.saveAs(); this.toast('Saved in this browser ✓'); }],
        ['upload', 'Save to our GitHub repo', () => this.saveToRepo()],
        ['folder', 'Open a design…', () => this.designsModal()],
        ['sparkles', 'New design…', () => this.wizard()],
        ['-', '-'],
        ['download', 'Export .json', () => download(`${slug(this.d.name)}.json`, JSON.stringify(this.d, null, 1))],
        ['upload', 'Import .json', () => this.importDesign()],
        ['-', '-'],
        ['sliders', 'Settings', () => this.settings()],
      ]),
      h('button.btn', { onclick: () => this.shareModal() }, ico('link', 16), h('span', {}, 'Share')),
      this.liveBtn, this.userChip,
    );
  }

  // ================================================================ left panel
  buildLeft() {
    const p = $('left');
    const tabs = [['playbox', 'box', 'Playbox'], ['life', 'sprout', 'Life'], ['home', 'palette', 'Home'], ['views', 'video', 'Views'], ['activity', 'history', 'Log']];
    this.leftTabs = h('div.tabs', {}, tabs.map(([id, ic, t]) => h('button', { dataset: { tab: id }, title: t, onclick: () => { this.leftTab = id; this.renderLeft(); } }, ico(ic, 16), h('span', {}, t))));
    this.leftBody = h('div.panel-body');
    p.append(h('button.collapse', { title: 'Hide panel', onclick: () => p.classList.toggle('collapsed') }, '⟨'), this.leftTabs, this.leftBody);
  }
  renderLeft() {
    this.leftTabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.tab === this.leftTab));
    const body = this.leftBody; body.innerHTML = '';
    ({ playbox: () => this.renderPlaybox(body), life: () => this.renderLife(body), home: () => this.renderHome(body), views: () => this.renderViews(body), activity: () => this.renderActivity(body) })[this.leftTab]();
  }
  refreshPlaybox() { if (this.leftTab === 'playbox') this.renderLeft(); }

  renderPlaybox(body) {
    const lib = this.app.library;
    const all = lib.list();
    const search = h('label.search', {}, ico('search', 15), h('input', { placeholder: 'Search the Playbox…', value: this.q, oninput: (e) => { this.q = e.target.value; draw(); } }));
    const hasCustom = all.some((m) => m.collection !== 'Built-in');
    const cats = ['all', ...(hasCustom ? ['custom'] : []), ...CATEGORIES.filter((c) => all.some((m) => m.category === c))];
    const chips = h('div.chips', {}, cats.map((c) => h('button.chip', { className: 'chip' + (this.cat === c ? ' on' : ''), onclick: () => { this.cat = c; this.renderLeft(); } }, c === 'all' ? 'All' : c === 'custom' ? '⭐ From photos' : CATEGORY_LABELS[c])));
    const grid = h('div.grid');
    const draw = () => {
      grid.innerHTML = '';
      const q = this.q.toLowerCase();
      const list = all.filter((m) => (this.cat === 'all' || m.category === this.cat || (this.cat === 'custom' && m.collection !== 'Built-in')) && (!q || (m.name + ' ' + m.tags.join(' ') + ' ' + m.category).toLowerCase().includes(q)))
        .sort((a, b) => (a.collection === 'Built-in') - (b.collection === 'Built-in') || a.name.localeCompare(b.name));
      if (!list.length) grid.append(h('p.muted', {}, 'Nothing matches. Try another search — or add a new model from a photo below.'));
      for (const m of list) {
        grid.append(h('div.card', {
          draggable: true, title: `${m.name} — drag into the home or click then click to place`,
          ondragstart: (e) => { e.dataTransfer.setData('text/plain', m.id); e.dataTransfer.effectAllowed = 'copy'; this.app.editor.dragModelId = m.id; },
          ondragend: () => { this.app.editor.dragModelId = null; if (this.app.editor.placing?.fromDrag) this.app.editor.cancelPlacing(); },
          onclick: () => { if (this.app.cameras.mode === 'walk') this.app.setMode('orbit'); this.app.editor.startPlacing(m.id); },
        },
        this.thumbFor(m), h('div.card-name', {}, m.name), h('div.card-price', {}, m.price ? fmtMoney(m.price) : ''),
        m.collection !== 'Built-in' ? h('span.badge', {}, m.local ? 'local' : 'new') : null));
      }
    };
    draw();
    add(body, search, chips, grid,
      h('div.add-model', {},
        h('button.btn.primary.wide', { onclick: () => this.importModelModal() }, ico('image', 16), h('span', {}, 'Add a model from a photo')),
        h('p.tiny', {}, 'Drag any card into the home. Everything you add drops with gravity onto the floor, a table, a shelf or a wall.')));
  }

  // Real rendered 3D thumbnail (falls back to the emoji until it's ready)
  thumbFor(m) {
    const box = h('div.card-thumb', {}, h('span.card-emoji', {}, m.icon));
    const model = this.app.library.get(m.id); if (!model) return box;
    const put = (url) => { if (!url) return; box.innerHTML = ''; box.append(h('img', { src: url, alt: '', draggable: false })); };
    const url = this.app.thumbs.get(model, this.app.style, put);
    if (url) put(url);
    return box;
  }

  // ================================================================ life (sim)
  renderLife(body) {
    const sim = this.app.sim;
    const hap = sim.happiness(), pct = Math.round(hap * 100);
    const mood = hap > 0.8 ? 'Thriving' : hap > 0.6 ? 'Happy & cozy' : hap > 0.4 ? 'Could use some love' : 'Needs attention';
    const ring = h('div.ring', { style: { '--p': pct } }, h('div', {}, h('b', {}, `${pct}%`), h('span', {}, 'happy')));
    const meters = h('div.meters', {}, METERS.map((m) => {
      const v = sim.meter(m.id);
      return h('div.meter', {}, h('span', {}, `${m.icon} ${m.name}`), h('i', {}, h('em', { style: { width: `${Math.round(v * 100)}%`, background: v < 0.3 ? 'var(--danger)' : v < 0.6 ? 'var(--warn)' : 'var(--ok)' } })));
    }));
    const tasks = sim.tasks();
    const choreDef = (t) => t.kind === 'water' ? { id: 'water', ...CHORES.water, chore: true, name: 'Water the plant' } : { id: t.kind, ...CHORES[t.kind], chore: true };
    const taskList = tasks.length ? h('div.task-list', {}, tasks.map((t) => h('div.task', {},
      h('span.task-ic', {}, t.icon), h('div', {}, h('b', {}, t.label), h('span', {}, t.sub)),
      h('button.btn.small.primary', { onclick: () => sim.goTo(t.id, choreDef(t)) }, 'Go', ico('arrow', 13)))))
      : h('div.all-good', {}, '✨ Everything’s taken care of.');
    const acts = h('div.act-grid', {}, sim.available().map(({ a, e }) => h('button.act', {
      className: 'act' + (e ? '' : ' off'), title: e ? a.blurb : `Add a ${a.models[0].replace(/-/g, ' ')} from the Playbox to unlock`,
      onclick: () => e ? sim.goTo(e.item.id, a) : this.toast(`Add a ${a.models[0].replace(/-/g, ' ')} from the Playbox to unlock ${a.name}`),
    }, h('span.act-ic', {}, a.icon), h('b', {}, a.name), h('span', {}, e ? (sim.s.scores[a.id] ? `best ${sim.s.scores[a.id]}` : a.blurb) : '🔒 needs furniture'))));
    const mems = sim.s.memories.slice(0, 24);
    const journal = mems.length ? h('div.journal', {}, mems.map((m) => {
      const th = sim.thumb(m.id);
      return h('div.memory', {}, th ? h('img', { src: th, alt: '' }) : h('div.mem-ic', {}, m.icon),
        h('div', {}, h('b', {}, `${m.icon} ${m.title}`), h('span', {}, `${(m.who || []).join(' & ')}${m.room ? ' · ' + m.room : ''} · ${ago(m.at)}`)));
    })) : h('p.muted', {}, 'Do an activity and it’s saved here with a snapshot of the moment.');
    const pace = h('select', { onchange: (e) => this.store.commit('Changed life pace', (dd) => { dd.sim.pace = +e.target.value; }) },
      [[1, 'Real time — plants need water every few days'], [6, 'Quick — 6× faster'], [48, 'Demo — 48× faster']].map(([v, t]) => h('option', { value: v, selected: (sim.s.pace || 1) === v }, t)));
    add(body,
      h('div.life-hero', {}, ring, h('div.life-meters', {}, h('b.mood', {}, mood), meters)),
      h('section', {}, h('h4', {}, `Needs attention${tasks.length ? ` · ${tasks.length}` : ''}`), taskList),
      h('section', {}, h('h4', {}, 'Things to do'), acts, h('p.tiny', {}, 'In walk mode, look at something and press E to use it or Q for an activity. Activities during a Live session count double for Together.')),
      h('section', {}, h('h4', {}, 'Memories'), journal),
      h('section', {}, h('h4', {}, 'Pace of life'), pace));
  }
  refreshLife() { if (this.leftTab === 'life') this.renderLeft(); }

  welcomeBack({ away, tasks, since, mems }) {
    const days = away / 86400000, when = days >= 1 ? `${Math.floor(days)} day${days >= 2 ? 's' : ''}` : `${Math.round(away / 3600000)} hours`;
    const m = this.modal(`Welcome home, ${this.store.user?.name} 🏡`,
      h('p', {}, `You’ve been away ${when}. Here’s what happened while you were gone:`),
      tasks.length ? h('div.task-list', {}, tasks.slice(0, 6).map((t) => h('div.task', {}, h('span.task-ic', {}, t.icon), h('div', {}, h('b', {}, t.label), h('span', {}, t.sub))))) : null,
      since.length ? h('section', {}, h('h4', {}, 'Meanwhile'), h('div.log', {}, since.slice(0, 8).map((l) => h('div.log-row', {}, h('b', { style: { color: this.colorFor(l.who) } }, l.who), ' ', l.what, h('em', {}, ago(l.at)))))) : null,
      mems.length ? h('p', {}, `📸 ${mems.length} new memor${mems.length > 1 ? 'ies' : 'y'} in the journal.`) : null,
      h('div.btn-row', {}, h('button.btn.primary', { onclick: () => { m.close(); this.leftTab = 'life'; this.renderLeft(); } }, 'See what needs doing'), h('button.btn', { onclick: () => m.close() }, 'Later')));
  }

  // Activity progress pill (bottom center)
  updateActivity(A) {
    const el = $('activity');
    if (!A) { el.classList.remove('on'); this.actKey = null; return; }
    const key = A.def.id + A.e.item.id;
    if (this.actKey !== key) {
      this.actKey = key; el.innerHTML = '';
      el.append(h('span.act-ic', {}, A.def.icon), h('div.act-txt', {}, h('b', {}, A.def.name), this.actSub = h('span', {}, '')),
        h('div.act-bar', {}, this.actBar = h('i')), h('button.icon-btn', { title: 'Stop', onclick: () => this.app.sim.cancel() }, ico('x', 16)));
      el.classList.add('on');
    }
    const p = A.def.game ? null : Math.min(1, A.t / A.dur);
    this.actBar.style.width = p == null ? '100%' : `${p * 100}%`;
    this.actBar.parentElement.classList.toggle('game', p == null);
    const D = this.app.sim.darts;
    const sub = D ? `${D.left} dart${D.left === 1 ? '' : 's'} left · ${D.score} pts` : p == null ? 'playing…' : A.def.seat ? 'look around · WASD to get up' : `${Math.ceil(A.dur - A.t)}s`;
    if (this.actSub.textContent !== sub) this.actSub.textContent = sub;
  }

  renderHome(body) {
    const d = this.d, style = this.app.style;
    const section = (t, ...kids) => h('section', {}, h('h4', {}, t), ...kids);
    // floor plans
    const plans = h('div.plan-list', {}, BLUEPRINTS.map((bp) => {
      const c = h('canvas', { width: 160, height: 110 }); drawPlan(c, bp);
      return h('button.plan-card', { className: 'plan-card' + (bp.id === d.blueprint ? ' on' : ''), onclick: () => {
        if (bp.id === d.blueprint) return;
        const keep = confirm(`Switch to "${bp.name}"?\n\nOK = start with that plan's furnished layout\nCancel = keep your plan`);
        if (keep) this.store.commit(`Switched floor plan to ${bp.name}`, (dd) => { const n = newDesign({ blueprint: bp.id, style: dd.style, user: this.store.user }); dd.blueprint = bp.id; dd.items = n.items; dd.structure = n.structure; });
      } }, c, h('b', {}, bp.name), h('span', {}, bp.blurb));
    }));
    const styles = h('div.style-list', {}, STYLES.map((s) => h('button.style-card', { className: 'style-card' + (s.id === d.style ? ' on' : ''), onclick: () => this.store.commit(`Style → ${s.name}`, (dd) => { dd.style = s.id; }) },
      h('div.swatches', {}, [s.wall, s.pal.fabric, s.pal.wood, s.pal.accent, s.pal.accent2, s.pal.metal].map((c) => h('i', { style: { background: c } }))),
      h('b', {}, s.name), h('span', {}, s.blurb))));
    const wallColor = h('input', { type: 'color', value: d.structure.wallColor || style.wall });
    this.bindLive(wallColor, 'Painted the walls', (v) => { this.d.structure.wallColor = v; this.d.structure.wallColors = {}; }, true);
    const finish = h('select', { onchange: (e) => this.store.commit('Changed wall finish', (dd) => { dd.structure.wallFinish = e.target.value; dd.structure.wallFinishes = {}; }) },
      Object.entries(WALL_FINISHES).map(([k, v]) => h('option', { value: k, selected: (d.structure.wallFinish || style.wallFinish) === k }, v)));
    const rooms = h('div.rows', {}, blueprintById(d.blueprint).rooms.map((r) => {
      const cur = d.structure.floors[r.name] || style.floors[floorRole(r.type)];
      return h('label.row', {}, h('span', {}, r.name), h('select', { onchange: (e) => this.store.commit(`New floor in ${r.name}`, (dd) => { dd.structure.floors[r.name] = e.target.value; }) },
        Object.entries(FLOOR_TYPES).map(([k, v]) => h('option', { value: k, selected: k === cur }, v.name))));
    }));
    const level = h('input', { type: 'range', min: 1, max: 30, value: d.env.level });
    const levelLbl = h('span', {}, `Floor ${d.env.level}`);
    level.oninput = () => { levelLbl.textContent = `Floor ${level.value}`; };
    level.onchange = () => this.store.commit('Changed building floor', (dd) => { dd.env.level = +level.value; });
    // budget
    const byCat = {};
    let total = 0;
    for (const it of d.items) { const m = this.app.library.get(it.model); if (!m) continue; const p = it.price ?? m.price ?? 0; total += p; byCat[m.category] = (byCat[m.category] || 0) + p; }
    const max = Math.max(1, ...Object.values(byCat));
    const budget = h('div.budget', {}, h('div.total', {}, fmtMoney(total), h('span', {}, ` · ${d.items.length} items`)),
      Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([c, v]) => h('div.bar', {}, h('span', {}, CATEGORY_LABELS[c]), h('i', { style: { width: `${(v / max) * 100}%` } }), h('em', {}, fmtMoney(v)))));
    add(body, 
      section('Floor plan', plans),
      section('Style', styles),
      section('Walls', h('label.row', {}, h('span', {}, 'Paint'), wallColor), h('label.row', {}, h('span', {}, 'Finish'), finish), h('p.tiny', {}, 'Tip: click any single wall to paint just that wall.')),
      section('Floors', rooms),
      section('Building', h('label.row', {}, levelLbl, level), h('p.tiny', {}, 'Which floor of the building we live on — changes the view out the windows.')),
      section('Budget', budget),
      section('Layout', h('div.btn-row', {},
        h('button.btn', { onclick: () => confirm('Reset furniture to this floor plan\'s starter layout?') && this.store.commit('Reset layout', (dd) => { dd.items = newDesign({ blueprint: dd.blueprint, user: this.store.user }).items; }) }, '↺ Starter layout'),
        h('button.btn', { onclick: () => confirm('Remove all furniture?') && this.store.commit('Cleared all furniture', (dd) => { dd.items = []; }) }, '🧹 Empty it'))),
    );
  }

  renderViews(body) {
    const d = this.d;
    add(body, 
      h('p.tiny', {}, 'Save camera spots — “Morning coffee”, “From the bed”, “Movie night” — then play them as a tour.'),
      h('div.btn-row', {},
        h('button.btn.primary', { onclick: () => { const name = prompt('Name this view', `View ${d.cameras.length + 1}`); if (name) this.store.commit(`Saved view "${name}"`, (dd) => dd.cameras.push({ id: Math.random().toString(36).slice(2, 8), name, ...this.app.cameras.capture(), by: this.store.user?.name })); } }, '📍 Save this view'),
        h('button.btn', { onclick: () => this.app.playTour() }, '▶ Tour'),
        h('button.btn', { onclick: () => this.app.screenshot() }, '📸')),
      h('div.view-list', {}, d.cameras.length ? d.cameras.map((v, i) => h('div.view-row', {},
        h('button.view-go', { onclick: () => this.app.cameras.flyTo(v) }, h('b', {}, `🎥 ${v.name}`), h('span', {}, v.by ? `by ${v.by}` : '')),
        h('button.icon-btn', { title: 'Rename', onclick: () => { const n = prompt('Rename view', v.name); if (n) this.store.commit('Renamed view', (dd) => { dd.cameras[i].name = n; }); } }, '✎'),
        h('button.icon-btn', { title: 'Update to current camera', onclick: () => this.store.commit('Updated view', (dd) => Object.assign(dd.cameras[i], this.app.cameras.capture())) }, '⟳'),
        h('button.icon-btn', { title: 'Delete', onclick: () => this.store.commit('Deleted view', (dd) => dd.cameras.splice(i, 1)) }, '🗑'),
      )) : h('p.muted', {}, 'No saved views yet.')),
      h('section', {}, h('h4', {}, 'Camera controls'), h('ul.keys', {},
        h('li', {}, h('kbd', {}, '1'), ' Dollhouse — drag to orbit, right-drag or Shift-drag to pan (two fingers on touch), scroll to zoom toward the cursor'),
        h('li', {}, h('kbd', {}, 'WASD'), ' Slide the dollhouse around (arrows too when nothing is selected)'),
        h('li', {}, 'Double-click a room (or pick it in the room bar) to zoom in on it; double-click again to walk in. ', h('kbd', {}, 'H'), ' or ', h('kbd', {}, 'Esc'), ' backs out'),
        h('li', {}, 'Click furniture to select it, then drag to move it'),
        h('li', {}, h('kbd', {}, '2'), ' Blueprint — top-down with room sizes'),
        h('li', {}, h('kbd', {}, '3'), ' Walk — first person with real physics'),
        h('li', {}, h('kbd', {}, '✂️'), ' Cutaway lowers the walls in dollhouse view'),
        h('li', {}, 'Double-click furniture to fly the camera to it'))),
    );
  }

  renderActivity(body) {
    const d = this.d, lib = this.app.library;
    const people = this.people();
    const loved = d.items.filter((i) => i.likes?.length);
    const both = loved.filter((i) => people.length > 1 && people.every((p) => i.likes.includes(p)));
    add(body, 
      h('section', {}, h('h4', {}, '❤️ Loved'),
        both.length ? h('p', {}, h('b', {}, 'You both love: '), both.map((i) => i.name || lib.get(i.model)?.name).join(', ')) : null,
        loved.length ? h('div.rows', {}, loved.map((i) => h('button.row.link', { onclick: () => this.app.editor.select({ type: 'item', id: i.id }) }, h('span', {}, `${lib.get(i.model)?.icon || ''} ${i.name || lib.get(i.model)?.name}`), h('em', {}, i.likes.join(' & '))))) : h('p.muted', {}, 'Tap ♥ on anything in the inspector to love it.')),
      h('section', {}, h('h4', {}, '🕒 Recent changes'),
        h('div.log', {}, (d.log || []).slice(0, 40).map((l) => h('div.log-row', {}, h('b', { style: { color: this.colorFor(l.who) } }, l.who), ' ', l.what, h('em', {}, ago(l.at)))))),
    );
  }
  people() { const s = new Set([this.store.user?.name, this.d.createdBy, ...(this.d.log || []).map((l) => l.who), ...this.d.items.flatMap((i) => i.likes || [])].filter(Boolean)); return [...s]; }
  colorFor(name) { if (name === this.store.user?.name) return this.store.user.color; let h0 = 0; for (const c of name || '') h0 = (h0 * 31 + c.charCodeAt(0)) | 0; return USER_COLORS[Math.abs(h0) % USER_COLORS.length]; }

  // ================================================================ right panel
  buildRight() {
    const p = $('right');
    this.rightTabs = h('div.tabs', {}, [['inspect', 'pointer', 'Inspect'], ['climate', 'cloudsun', 'Climate']].map(([id, ic, t]) => h('button', { dataset: { tab: id }, onclick: () => { this.rightTab = id; this.renderRight(); } }, ico(ic, 16), h('span', {}, t))));
    this.rightBody = h('div.panel-body');
    p.append(h('button.collapse', { title: 'Hide panel', onclick: () => p.classList.toggle('collapsed') }, '⟩'), this.rightTabs, this.rightBody);
  }
  renderRight() {
    this.rightTabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.tab === this.rightTab));
    const body = this.rightBody; body.innerHTML = '';
    if (this.rightTab === 'climate') return this.renderClimate(body);
    const s = this.app.editor.selection;
    if (!s) return add(body, h('div.empty', {}, h('div.big', {}, '👆'), h('p', {}, 'Click any furniture, wall or floor to edit it.'), h('p.tiny', {}, 'Click windows & doors to open them. Drag furniture to move it — things on top ride along. R rotates, Delete removes, Ctrl+D duplicates.')));
    if (s.type === 'item') return this.renderItem(body, s.id);
    if (s.type === 'wall') return this.renderWall(body, s.index);
    if (s.type === 'room') return this.renderRoom(body, s.index);
  }

  // Slider/color edits: apply live, record one undo step when released.
  bindLive(input, label, apply, structural = false) {
    let before = null;
    const start = () => { before ??= JSON.stringify(this.d); };
    input.addEventListener('pointerdown', start); input.addEventListener('focus', start);
    input.addEventListener('input', () => {
      start(); apply(input.type === 'range' || input.type === 'number' ? +input.value : input.value);
      if (structural) { this.app.lastShell = null; this.app.onChange({ label, live: true }); }
      else { this.app.items.settleAll(this.d.items, this.app.apartment); this.app.refreshItems(); }
    });
    input.addEventListener('change', () => { if (before) this.store.record(label, before); before = null; });
  }

  renderItem(body, id) {
    const it = this.d.items.find((i) => i.id === id), app = this.app;
    if (!it) { app.editor.select(null); return; }
    const m = app.library.get(it.model); if (!m) return;
    const style = app.style, me = this.store.user?.name;
    const entry = app.items.get(id);
    const isDevice = (m.behaviors || []).some((b) => ['light', 'spin', 'screen', 'airflow'].includes(b.type));
    const name = h('input.title-input', { value: it.name || '', placeholder: m.name, onchange: (e) => this.store.commit('Renamed item', () => { it.name = e.target.value || undefined; }) });
    const liked = it.likes?.includes(me);
    const heart = h('button.heart', { className: 'heart' + (liked ? ' on' : ''), onclick: () => this.store.commit(liked ? 'Un-loved' : `Loved ${m.name}`, () => { it.likes = liked ? it.likes.filter((x) => x !== me) : [...(it.likes || []), me]; }) }, liked ? '♥' : '♡');
    const row = (label, ...kids) => h('label.row', {}, h('span', {}, label), ...kids);
    const rot = h('input', { type: 'range', min: -180, max: 180, step: 5, value: ((it.rot + 180) % 360 + 360) % 360 - 180 });
    this.bindLive(rot, 'Rotated', (v) => { it.rot = v; });
    const scales = ['Width', 'Height', 'Depth'].map((lbl, k) => {
      const inp = h('input', { type: 'range', min: 0.5, max: 2, step: 0.05, value: it.scale?.[k] ?? 1 });
      const out = h('em', {}, `${((m.size[k] * (it.scale?.[k] ?? 1)) * 39.37).toFixed(0)}″`);
      this.bindLive(inp, `Resized ${m.name}`, (v) => { it.scale = [...(it.scale || [1, 1, 1])]; it.scale[k] = v; out.textContent = `${(m.size[k] * v * 39.37).toFixed(0)}″`; });
      return row(lbl, inp, out);
    });
    let heightRow = null;
    if (m.placement === 'wall') {
      const hi = h('input', { type: 'range', min: 0, max: app.apartment.H - m.size[1], step: 0.05, value: it.y ?? m.mountHeight });
      this.bindLive(hi, 'Changed mounting height', (v) => { it.y = v; });
      heightRow = row('Mount height', hi);
    }
    // colors (style tokens)
    const toks = tokensUsed(m);
    const tokenRows = toks.map((t) => {
      const inp = h('input', { type: 'color', value: resolveColor(t, style, it.tokens) });
      this.bindLive(inp, `Recolored ${m.name}`, (v) => { it.tokens = { ...(it.tokens || {}), [t]: v }; });
      return row(TOKEN_LABELS[t] || t, inp, it.tokens?.[t] ? h('button.icon-btn', { title: 'Back to style color', onclick: () => this.store.commit('Reset color', () => { delete it.tokens[t]; }) }, '↺') : null);
    });
    // every part
    const parts = partNames(m).map((pn) => {
      const spec = partSpec(m, pn), ov = it.parts?.[pn] || {};
      const base = typeof spec.material === 'string' ? spec.material : spec.material?.color;
      const color = h('input', { type: 'color', value: ov.color || resolveColor(base, style, it.tokens) });
      this.bindLive(color, `Recolored ${pn}`, (v) => { it.parts = { ...(it.parts || {}) }; it.parts[pn] = { ...(it.parts[pn] || {}), color: v }; });
      const fin = h('select', { onchange: (e) => this.store.commit(`Changed ${pn} finish`, () => { it.parts = { ...(it.parts || {}) }; it.parts[pn] = { ...(it.parts[pn] || {}), finish: e.target.value || undefined }; }) },
        h('option', { value: '' }, 'finish'), FINISHES.map((f) => h('option', { value: f, selected: ov.finish === f }, f)));
      const hide = h('input', { type: 'checkbox', checked: !ov.hidden, title: 'Show / hide', onchange: (e) => this.store.commit(`${e.target.checked ? 'Showed' : 'Hid'} ${pn}`, () => { it.parts = { ...(it.parts || {}) }; it.parts[pn] = { ...(it.parts[pn] || {}), hidden: !e.target.checked || undefined }; }) });
      return h('div.part-row', {}, hide, h('span', {}, pn), color, fin);
    });
    const partsBox = h('details.parts', { open: this.openParts, ontoggle: (e) => { this.openParts = e.target.open; } }, h('summary', {}, `🧩 Edit every part (${parts.length})`), ...parts,
      Object.keys(it.parts || {}).length ? h('button.btn.small', { onclick: () => this.store.commit('Reset parts', () => { delete it.parts; }) }, '↺ Reset all parts') : null);
    const notes = h('textarea', { placeholder: 'Notes, links, where to buy…', value: it.notes || '', onchange: (e) => this.store.commit('Edited notes', () => { it.notes = e.target.value || undefined; }) });
    const price = h('input', { type: 'number', min: 0, step: 1, value: it.price ?? m.price ?? 0, onchange: (e) => this.store.commit('Changed price', () => { it.price = +e.target.value; }) });
    const support = it.on ? this.d.items.find((x) => x.id === it.on) : null;
    const overlap = app.editor.overlaps(it);
    add(body, 
      h('div.item-head', {}, h('div.big-icon', {}, m.icon), h('div', {}, name, h('div.sub', {}, `${CATEGORY_LABELS[m.category]} · ${m.name}${it.addedBy ? ` · added by ${it.addedBy}` : ''}`)), heart),
      it.likes?.length ? h('p.tiny', {}, `♥ ${it.likes.join(' & ')}`) : null,
      overlap ? h('div.warn', {}, '⚠️ Overlapping something — drag it to a clear spot.') : null,
      h('p.tiny.rest', {}, m.placement === 'wall' ? '🧲 Mounted on the wall' : m.placement === 'ceiling' ? '🧲 Hanging from the ceiling' : support ? `⬇️ Resting on ${support.name || app.library.get(support.model)?.name}` : m.physics?.body === 'dynamic' ? '🏀 Physics object — falls, rolls and can be thrown' : '⬇️ Resting on the floor'),
      isDevice ? h('div.device', {}, h('span', {}, 'Power'), h('button.toggle', { className: 'toggle' + (entry && app.items.isOn(entry) ? ' on' : ''), onclick: () => app.editor.toggleItem(id) }, entry && app.items.isOn(entry) ? 'On' : 'Off')) : null,
      h('section', {}, h('h4', {}, 'Placement'), row('Rotate', rot), heightRow, h('div.btn-row', {},
        h('button.btn.small', { onclick: () => app.editor.rotateSelected(-90) }, '⟲ 90°'), h('button.btn.small', { onclick: () => app.editor.rotateSelected(90) }, '⟳ 90°'))),
      h('section', {}, h('h4', {}, 'Size'), ...scales, it.scale ? h('button.btn.small', { onclick: () => this.store.commit('Reset size', () => { delete it.scale; }) }, '↺ Original size') : null),
      tokenRows.length ? h('section', {}, h('h4', {}, 'Colors'), ...tokenRows) : null,
      partsBox,
      h('section', {}, h('h4', {}, 'Details'), row('Price $', price), notes,
        m.source?.url ? h('a.src', { href: m.source.url, target: '_blank', rel: 'noopener' }, '📌 Inspiration photo ↗') : null),
      h('div.btn-row', {},
        h('button.btn', { onclick: () => app.editor.duplicateSelected() }, '⧉ Duplicate'),
        h('button.btn.danger', { onclick: () => app.editor.removeSelected() }, '🗑 Remove')),
    );
  }

  renderWall(body, index) {
    const d = this.d, style = this.app.style;
    const w = this.app.apartment.walls.find((x) => x.index === index);
    if (!w || w.rail) return add(body, h('p', {}, 'Balcony railing'));
    const col = h('input', { type: 'color', value: d.structure.wallColors[index] || d.structure.wallColor || style.wall });
    this.bindLive(col, 'Painted a wall', (v) => { d.structure.wallColors[index] = v; }, true);
    const fin = h('select', { onchange: (e) => this.store.commit('Changed wall finish', (dd) => { dd.structure.wallFinishes[index] = e.target.value; }) },
      Object.entries(WALL_FINISHES).map(([k, v]) => h('option', { value: k, selected: (d.structure.wallFinishes[index] || d.structure.wallFinish || style.wallFinish) === k }, v)));
    add(body, 
      h('div.item-head', {}, h('div.big-icon', {}, '🧱'), h('div', {}, h('b', {}, `${w.ext ? 'Exterior' : 'Interior'} wall`), h('div.sub', {}, `${((w.a1 - w.a0) * 3.281).toFixed(1)} ft long`))),
      h('section', {}, h('h4', {}, 'This wall'), h('label.row', {}, h('span', {}, 'Paint'), col), h('label.row', {}, h('span', {}, 'Finish'), fin),
        h('div.btn-row', {}, h('button.btn.small', { onclick: () => this.store.commit('Reset wall', (dd) => { delete dd.structure.wallColors[index]; delete dd.structure.wallFinishes[index]; }) }, '↺ Match other walls'),
          h('button.btn.small', { onclick: () => this.store.commit('Painted all walls', (dd) => { dd.structure.wallColor = col.value; dd.structure.wallColors = {}; }) }, 'Use on all walls'))),
      h('p.tiny', {}, 'Tip: an accent wall behind the bed or sofa looks great.'));
  }

  renderRoom(body, index) {
    const r = this.app.apartment.rooms[index], d = this.d, style = this.app.style;
    if (!r) return;
    const cur = d.structure.floors[r.name] || style.floors[floorRole(r.type)];
    const [x0, z0, x1, z1] = r.rect;
    add(body, 
      h('div.item-head', {}, h('div.big-icon', {}, r.type === 'outdoor' ? '🌿' : '🚪'), h('div', {}, h('b', {}, r.name), h('div.sub', {}, `${fmtArea(r.area)} · ${((x1 - x0) * 3.281).toFixed(1)}′ × ${((z1 - z0) * 3.281).toFixed(1)}′`))),
      h('section', {}, h('h4', {}, 'Floor'), h('div.floor-grid', {}, Object.entries(FLOOR_TYPES).map(([k, v]) => h('button.floor-chip', { className: 'floor-chip' + (k === cur ? ' on' : ''), onclick: () => this.store.commit(`New floor in ${r.name}`, (dd) => { dd.structure.floors[r.name] = k; }) }, h('i', { style: { background: v.color } }), v.name)))),
      h('p.tiny', {}, `${d.items.filter((i) => { const [a, b, c, e] = r.rect; return i.x >= a && i.x <= c && i.z >= b && i.z <= e; }).length} items in this room.`));
  }

  renderClimate(body) {
    const d = this.d, env = d.env, th = d.climate, app = this.app;
    const commitEnv = (label, fn) => this.store.commit(label, (dd) => fn(dd.env));
    const seg = (opts, cur, onPick) => h('div.seg-row', {}, opts.map(([v, label]) => h('button', { className: cur === v ? 'on' : '', onclick: () => onPick(v) }, label)));
    const time = h('input', { type: 'range', min: 0, max: 23.99, step: 0.05, value: env.hour });
    this.timeLbl = h('b', {}, fmtHour(env.hour));
    time.oninput = () => { env.hour = +time.value; this.timeLbl.textContent = fmtHour(env.hour); };
    time.onchange = () => this.store.commit('Changed time of day', () => {});
    this.timeInput = time;
    const wind = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: env.wind });
    wind.onchange = () => commitEnv('Changed wind', (e) => { e.wind = +wind.value; });
    const wdir = h('input', { type: 'range', min: 0, max: 359, step: 5, value: env.windDir });
    const compass = (deg) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8];
    const wdirLbl = h('em', {}, `from ${compass(env.windDir)}`);
    wdir.oninput = () => { wdirLbl.textContent = `from ${compass(+wdir.value)}`; };
    wdir.onchange = () => commitEnv('Changed wind direction', (e) => { e.windDir = +wdir.value; });
    const toggle = (label, on, fn) => h('label.switch', {}, h('input', { type: 'checkbox', checked: on, onchange: (e) => fn(e.target.checked) }), h('i'), label);
    this.readouts = h('div.readouts');
    add(body, 
      h('section', {}, h('h4', {}, 'Season'), seg(SEASONS.map((s) => [s, `${SEASON_ICON[s]} ${s[0].toUpperCase() + s.slice(1)}`]), env.season, (v) => commitEnv(`Season → ${v}`, (e) => { e.season = v; }))),
      h('section', {}, h('h4', {}, 'Time of day ', this.timeLbl), time,
        seg([[0, '⏸'], [1, '1×'], [10, '10×'], [60, '60×']], env.timeSpeed, (v) => commitEnv(v ? `Time running ${v}×` : 'Paused time', (e) => { e.timeSpeed = v; }))),
      h('section', {}, h('h4', {}, 'Weather'), seg(WEATHERS.map((w) => [w, `${WEATHER_ICON[w]} ${w}`]), env.weather, (v) => commitEnv(`Weather → ${v}`, (e) => { e.weather = v; e.live = false; })),
        toggle('Live weather (changes on its own with the season)', env.live, (v) => commitEnv(v ? 'Live weather on' : 'Live weather off', (e) => { e.live = v; }))),
      h('section', {}, h('h4', {}, 'Wind'), h('label.row', {}, h('span', {}, 'Strength'), wind), h('label.row', {}, h('span', {}, 'Direction'), wdir, wdirLbl),
        h('p.tiny', {}, 'Open windows (click them) to let the breeze in — watch curtains, plants and pillows react.')),
      h('section', {}, h('h4', {}, 'Thermostat'),
        seg([['off', 'Off'], ['cool', '❄️ Cool'], ['heat', '🔥 Heat'], ['auto', 'Auto']], th.mode, (v) => this.store.commit(`Thermostat → ${v}`, (dd) => { dd.climate.mode = v; })),
        h('div.thermo', {}, h('button.btn', { onclick: () => this.store.commit('Thermostat down', (dd) => { dd.climate.set--; }) }, '−'), h('b', {}, fmtTemp(th.set, d.settings.units)), h('button.btn', { onclick: () => this.store.commit('Thermostat up', (dd) => { dd.climate.set++; }) }, '+')),
        this.readouts),
      h('section', {}, h('h4', {}, 'Show'),
        toggle('Airflow particles', app.climate.showAir, (v) => { app.climate.showAir = v; }),
        toggle('Thermal heat map', app.climate.showHeat, (v) => { app.climate.showHeat = v; }),
        toggle('Lights turn on at dusk', d.settings.autoLights, (v) => this.store.commit('Auto lights', (dd) => { dd.settings.autoLights = v; })),
        toggle('Sound', !app.audio.muted, (v) => { app.audio.start(); app.audio.setMuted(!v); })),
    );
    this.updateReadouts();
  }
  refreshClimate() { if (this.rightTab === 'climate') this.renderRight(); }
  updateReadouts() {
    if (!this.readouts || !this.readouts.isConnected) return;
    const app = this.app, c = app.climate, u = this.d.settings.units;
    const p = app.cameras.persp.position;
    const feels = app.apartment.isIndoor(p.x, p.z) ? c.feelsLike(p.clone().setY(1.2)) : app.env.outdoorTemp;
    this.readouts.innerHTML = '';
    this.readouts.append(
      h('div', {}, h('span', {}, 'Outside'), h('b', {}, fmtTemp(app.env.outdoorTemp ?? 70, u)), h('em', {}, `${Math.round(c.Hout ?? 50)}% RH`)),
      h('div', {}, h('span', {}, 'Inside'), h('b', {}, fmtTemp(c.Tin, u)), h('em', {}, `${Math.round(c.Hin)}% RH`)),
      h('div', {}, h('span', {}, 'Feels like here'), h('b', {}, fmtTemp(feels, u)), h('em', {}, `${Math.round((app.env.windSpeed || 0) * 2.237)} mph wind`)),
      h('div', {}, h('span', {}, 'HVAC'), h('b', {}, c.hvacMode === 'cool' ? '❄️ Cooling' : c.hvacMode === 'heat' ? '🔥 Heating' : '😴 Idle')),
    );
  }

  // ================================================================ HUD + walk
  buildHud() {
    this.hud = $('hud');
  }
  tick(dt) {
    this.hudT -= dt;
    if (this.hudT > 0) return;
    this.hudT = 0.5;
    const app = this.app, d = this.d, env = d.env, c = app.climate, u = d.settings.units, sim = app.sim;
    const night = app.env.daylight < 0.3;
    let total = 0; for (const it of d.items) total += it.price ?? app.library.get(it.model)?.price ?? 0;
    const hap = sim.happiness(), tasks = sim.tasks().length;
    this.hud.innerHTML = '';
    add(this.hud,
      h('div.pill', {}, h('span.big-emoji', {}, env.weather === 'clear' && night ? '🌙' : WEATHER_ICON[env.weather]), h('div.stack', {}, h('b', {}, fmtHour(env.hour)), h('span', {}, `${SEASON_ICON[env.season]} ${env.season} · ${env.weather}${env.live ? ' · live' : ''}`))),
      h('div.pill', {}, ico('thermo', 16), h('div.stack', {}, h('b', {}, `${fmtTemp(c.Tin, u)} inside`), h('span', {}, `${fmtTemp(app.env.outdoorTemp ?? 70, u)} outside`)), h('span.chip-s', { className: 'chip-s ' + (c.hvacMode || 'idle') }, c.hvacMode === 'cool' ? '❄ cooling' : c.hvacMode === 'heat' ? '🔥 heating' : 'idle')),
      h('div.spacer'),
      h('button.pill.life-pill', { title: 'Home life — needs & activities', onclick: () => { this.leftTab = 'life'; $('left').classList.remove('collapsed'); this.renderLeft(); } },
        h('div.mini-ring', { style: { '--p': Math.round(hap * 100) } }),
        h('div.stack', {}, h('b', {}, `${Math.round(hap * 100)}% happy`), h('span', {}, tasks ? `${tasks} thing${tasks > 1 ? 's' : ''} need${tasks > 1 ? '' : 's'} you` : 'all cared for ✨')),
        h('div.mini-meters', {}, METERS.map((m) => { const v = sim.meter(m.id); return h('i', { title: `${m.name} ${Math.round(v * 100)}%`, style: { height: `${Math.max(12, v * 100)}%`, background: v < 0.3 ? 'var(--danger)' : v < 0.6 ? 'var(--warn)' : 'var(--ok)' } }); }))),
      h('div.spacer'),
      h('div.pill', {}, ico('wallet', 16), h('div.stack', {}, h('b', {}, fmtMoney(total)), h('span', {}, `${d.items.length} items`))),
      app.live.active ? h('div.pill.live', {}, ico('users', 16), h('div.stack', {}, h('b', {}, `Live · ${app.live.code}`), h('span', {}, `${app.live.count + 1} here`))) : null,
    );
    if (this.timeInput?.isConnected && document.activeElement !== this.timeInput) { this.timeInput.value = env.hour; this.timeLbl.textContent = fmtHour(env.hour); }
    this.updateReadouts();
    if (this.leftTab === 'life' && !this.leftBody.matches(':hover')) { this.lifeT = (this.lifeT || 0) - 1; if (this.lifeT <= 0) { this.lifeT = 12; this.renderLeft(); } }
  }
  buildWalk() {
    // on-screen buttons for touch devices
    const key = (code, down) => dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code }));
    const tb = (label, code, hold) => h('button.tbtn', hold
      ? { onpointerdown: (e) => { e.preventDefault(); this.app.cameras.keys.add(code); }, onpointerup: () => this.app.cameras.keys.delete(code), onpointerleave: () => this.app.cameras.keys.delete(code) }
      : { onpointerdown: (e) => { e.preventDefault(); key(code, true); key(code, false); } }, label);
    document.body.append(h('div#touch-ui', {}, tb('Use', 'KeyE'), tb('Do', 'KeyQ'), tb('Grab', 'KeyG'), tb('Jump', 'Space', true), h('button.tbtn.exit', { onclick: () => this.app.setMode('orbit') }, '✕')));
    document.body.append(h('div#walk-help', {}, ...[['WASD', 'move'], ['drag', 'look'], ['← →', 'turn'], ['Shift', 'run'], ['E', 'use'], ['Q', 'do'], ['M', 'mouse-look'], ['Esc', 'exit']].map(([k, t]) => h('span', {}, h('kbd', {}, k), ' ', t))));
    const o = $('walk-overlay');
    o.append(h('div.walk-card', {},
      h('h2', {}, '🚶 Walk through The Home'),
      h('div.walk-keys', {},
        ...[['W A S D', 'move'], ['Shift', 'run'], ['Space', 'jump'], ['Mouse', 'look'], ['E', 'use: doors, windows, lights, water plants, chores'], ['Q', 'activity: movie night, darts, guitar, cook…'], ['G', 'grab a physics object'], ['Click', 'push / throw'], ['B', 'throw a ball'], ['F', 'flashlight'], ['Esc', 'pause · 1 / 2 to leave']]
          .map(([k, t]) => h('div', {}, h('kbd', {}, k), h('span', {}, t)))),
      h('button.btn.primary.wide', { onclick: () => this.app.cameras.lock.lock() }, 'Click to start walking'),
      h('button.btn.wide', { onclick: () => this.app.setMode('orbit') }, 'Back to dollhouse')));
  }
  setWalkHint(t) { const el = $('walk-hint'); if (el.textContent !== t) el.textContent = t; }
  onLock() { document.body.classList.toggle('locked', this.app.cameras.mode === 'walk' && this.app.cameras.lock.isLocked); }
  // Dollhouse room switcher: jump the camera to any room, or back out to the whole home.
  buildRooms() {
    this.roomsBar = h('nav#rooms-bar', { 'aria-label': 'Focus on a room' });
    document.body.append(this.roomsBar);
    this.app.cameras.addEventListener('focus', () => this.renderRooms());
    this.renderRooms();
  }
  renderRooms() {
    const cams = this.app.cameras, rooms = this.app.apartment?.rooms || [], bar = this.roomsBar;
    if (!bar) return;
    bar.innerHTML = '';
    const chip = (label, on, fn, title) => h('button.room-chip' + (on ? '.on' : ''), { title, onclick: fn }, label);
    add(bar,
      chip('🏠 Whole home', cams.focused == null, () => cams.frameAll(), 'See the whole home (H or Esc)'),
      rooms.map((r) => chip(r.name, cams.focused === r.index, () => { if (cams.mode !== 'orbit') this.app.setMode('orbit'); cams.focusRoom(r.index); }, `Zoom in on the ${r.name} — double-click it again to walk in`)));
  }

  onMode() {
    document.querySelectorAll('#topbar .seg').forEach((b) => b.classList.toggle('on', b.dataset.mode === this.app.cameras.mode));
    this.onLock();
  }

  onDesignChange({ remote }) {
    const d = this.d;
    if (document.activeElement !== this.nameInput) this.nameInput.value = d.name;
    const u = this.store.user;
    this.userChip.innerHTML = ''; this.userChip.append(h('i', { style: { background: u?.color || '#999' } }, (u?.name || '?')[0].toUpperCase()), h('span', {}, u?.name || 'Set name'));
    if (remote && this.rightBody.contains(document.activeElement)) return;
    const sel = this.app.editor.selection;
    if (sel?.type === 'item' && !d.items.some((i) => i.id === sel.id)) this.app.editor.selection = null;
    this.renderLeft(); this.renderRight();
  }

  // ================================================================ toasts & modals
  toast(msg, ms = 2200) {
    const t = h('div.toast', {}, msg); $('toasts').append(t);
    setTimeout(() => t.classList.add('out'), ms); setTimeout(() => t.remove(), ms + 400);
  }
  modal(title, ...content) {
    const root = $('modal'); root.innerHTML = '';
    const close = () => { root.classList.remove('open'); root.innerHTML = ''; };
    const card = h('div.modal-card', {}, h('div.modal-head', {}, h('h3', {}, title), h('button.icon-btn', { onclick: close }, '✕')), h('div.modal-body', {}, ...content));
    root.append(card); root.classList.add('open');
    root.onclick = (e) => { if (e.target === root && !root.dataset.locked) close(); };
    return { close, card };
  }

  wizard() {
    const st = { step: this.store.user ? 1 : 0, name: this.store.user?.name || '', color: this.store.user?.color || USER_COLORS[0], blueprint: 'the-home', style: 'modern', furnished: true };
    const root = $('modal'); root.dataset.locked = '1';
    const render = () => {
      const steps = [
        () => [h('p', {}, 'Welcome! Let\'s build our dream place together. First — who\'s designing on this device?'),
          h('input.big-input', { placeholder: 'Your name', value: st.name, oninput: (e) => { st.name = e.target.value; } }),
          h('div.color-pick', {}, USER_COLORS.map((c) => h('button', { className: st.color === c ? 'on' : '', style: { background: c }, onclick: () => { st.color = c; render(); } })))],
        () => [h('p', {}, 'Pick a floor plan (you can switch any time).'),
          h('div.plan-list.big', {}, BLUEPRINTS.map((bp) => { const c = h('canvas', { width: 240, height: 160 }); drawPlan(c, bp); return h('button.plan-card', { className: 'plan-card' + (st.blueprint === bp.id ? ' on' : ''), onclick: () => { st.blueprint = bp.id; render(); } }, c, h('b', {}, bp.name), h('span', {}, bp.blurb)); }))],
        () => [h('p', {}, 'Choose a style — it sets the paint, floors, fabrics and woods.'),
          h('div.style-list.big', {}, STYLES.map((s) => h('button.style-card', { className: 'style-card' + (st.style === s.id ? ' on' : ''), onclick: () => { st.style = s.id; render(); } }, h('div.swatches', {}, [s.wall, s.pal.fabric, s.pal.wood, s.pal.accent, s.pal.accent2, s.pal.metal].map((c) => h('i', { style: { background: c } }))), h('b', {}, s.name), h('span', {}, s.blurb))))],
        () => [h('p', {}, 'Start furnished, or with empty rooms?'),
          h('div.choice', {}, [[true, '🛋️ Furnished', 'A starter layout to rearrange'], [false, '📦 Empty', 'Blank canvas — fill it from the Playbox']].map(([v, t, s]) => h('button.choice-card', { className: 'choice-card' + (st.furnished === v ? ' on' : ''), onclick: () => { st.furnished = v; render(); } }, h('b', {}, t), h('span', {}, s))))],
      ];
      const titles = ['Who\'s designing?', 'Floor plan', 'Style', 'Furnish'];
      const next = () => {
        if (st.step === 0) { if (!st.name.trim()) return this.toast('Type your name first 🙂'); this.store.setUser({ name: st.name.trim(), color: st.color }); }
        if (st.step < steps.length - 1) { st.step++; render(); return; }
        delete root.dataset.locked;
        this.app.loadDesign(newDesign({ blueprint: st.blueprint, style: st.style, furnished: st.furnished, user: this.store.user }), 'New design');
        m.close(); this.toast(`Welcome home, ${this.store.user.name} 🏡`);
      };
      const m = this.modal(`✨ ${titles[st.step]}`, ...steps[st.step](),
        h('div.wizard-foot', {}, h('div.dots', {}, steps.map((_, i) => h('i', { className: i === st.step ? 'on' : '' }))),
          st.step > (this.store.user ? 1 : 0) ? h('button.btn', { onclick: () => { st.step--; render(); } }, 'Back') : null,
          h('button.btn.primary', { onclick: next }, st.step === steps.length - 1 ? 'Build our home →' : 'Next →')));
      m.card.classList.add('wide');
    };
    render();
  }

  settings() {
    const u = this.store.user || { name: '', color: USER_COLORS[0] }, gh = this.app.github;
    const name = h('input', { value: u.name });
    let color = u.color;
    const colors = h('div.color-pick', {}, USER_COLORS.map((c) => h('button', { className: color === c ? 'on' : '', style: { background: c }, onclick: (e) => { color = c; colors.querySelectorAll('button').forEach((b) => b.classList.remove('on')); e.target.classList.add('on'); } })));
    const repo = h('input', { value: gh.repo, placeholder: 'owner/repo' });
    const token = h('input', { type: 'password', value: gh.token, placeholder: 'github_pat_… (optional)' });
    const m = this.modal('⚙️ Settings',
      h('label.field', {}, 'Your name', name), colors,
      h('label.field', {}, 'Units', h('select', { onchange: (e) => this.store.commit('Changed units', (d) => { d.settings.units = e.target.value; }) }, h('option', { value: 'imperial', selected: this.d.settings.units !== 'metric' }, 'Feet & °F'), h('option', { value: 'metric', selected: this.d.settings.units === 'metric' }, 'Meters & °C'))),
      h('label.field', {}, 'Graphics', h('select', { onchange: (e) => this.app.setQuality(e.target.value) }, [['ultra', 'Ultra (sharpest, soft shadows, glow)'], ['high', 'High (ambient occlusion + glow)'], ['medium', 'Medium (glow only)'], ['low', 'Low (fastest)']].map(([v, t]) => h('option', { value: v, selected: this.app.quality === v }, t)))),
      h('hr'),
      h('h4', {}, 'GitHub repo (for saving designs & publishing models)'),
      h('label.field', {}, 'Repository', repo),
      h('label.field', {}, 'Personal access token', token),
      h('p.tiny', {}, 'Optional. With a fine-grained token (Contents: read & write on just this repo) the Save and Publish buttons commit straight to GitHub. Without one, they open GitHub with the file ready to commit. The token is stored only in this browser.',
        ' ', h('a', { href: 'https://github.com/settings/personal-access-tokens/new', target: '_blank', rel: 'noopener' }, 'Create a token ↗')),
      h('div.btn-row', {}, h('button.btn.primary', { onclick: () => {
        if (name.value.trim()) this.store.setUser({ name: name.value.trim(), color });
        gh.setRepo(repo.value); gh.setToken(token.value);
        m.close(); this.onDesignChange({}); this.toast('Settings saved');
      } }, 'Save')));
  }

  async shareModal() {
    const link = h('input', { value: 'Making link…', readOnly: true });
    const m = this.modal('🔗 Share',
      h('p', {}, 'Anyone with this link opens a copy of this exact design (furniture, colors, weather, saved views).'),
      h('div.copy-row', {}, link, h('button.btn', { onclick: async () => { await navigator.clipboard.writeText(link.value); this.toast('Link copied 💌'); } }, 'Copy')),
      h('hr'),
      h('p', {}, 'To keep it permanently for both of you, save it into the GitHub repo:'),
      h('button.btn.primary', { onclick: () => { m.close(); this.saveToRepo(); } }, '☁️ Save to our GitHub repo'),
      h('p.tiny', {}, 'For editing together at the same time, use 💞 Live.'));
    link.value = await this.store.shareURL();
  }

  async saveToRepo() {
    const gh = this.app.github, d = this.d;
    if (!gh.repo) { this.toast('Set your GitHub repo in Settings first'); return this.settings(); }
    const json = JSON.stringify(d, null, 1) + '\n', path = `${CONFIG.designsDir}/${slug(d.name)}.json`;
    if (gh.token) {
      try { this.toast('Saving to GitHub…'); await gh.saveDesign(d, this.store.user?.name); this.toast(`Saved to ${gh.repo}/${path} ✓`, 3500); }
      catch (e) { this.toast('GitHub save failed: ' + e.message, 5000); }
    } else {
      if (json.length >= 6000) { await navigator.clipboard.writeText(json); this.toast('Design copied — paste it into the GitHub page that just opened', 6000); }
      open(gh.newFileURL(path, json), '_blank');
    }
  }

  async designsModal() {
    const local = this.store.savedList();
    const repoList = h('div.rows', {}, h('p.muted', {}, 'Loading…'));
    const m = this.modal('📂 Designs',
      h('div.btn-row', {}, h('button.btn.primary', { onclick: () => { m.close(); this.wizard(); } }, '✨ New design')),
      h('h4', {}, 'In this browser'),
      h('div.rows', {}, local.length ? local.map((d) => h('div.row', {}, h('button.link', { onclick: () => { this.app.loadDesign(d, 'Opened design'); m.close(); } }, `🏡 ${d.name}`), h('em', {}, ago(d.updatedAt)), h('button.icon-btn', { onclick: (e) => { this.store.deleteSaved(d.id); e.target.closest('.row').remove(); } }, '🗑'))) : h('p.muted', {}, 'Nothing saved here yet.')),
      h('h4', {}, `In the GitHub repo ${this.app.github.repo ? `(${this.app.github.repo})` : ''}`), repoList);
    const list = await this.app.github.listDesigns();
    repoList.innerHTML = '';
    if (!list.length) repoList.append(h('p.muted', {}, 'No designs in the repo yet — use “Save to our GitHub repo”.'));
    for (const e of list) repoList.append(h('div.row', {}, h('button.link', { onclick: async () => { try { this.app.loadDesign(await this.app.github.loadDesign(e), 'Opened from GitHub'); m.close(); } catch (err) { this.toast('Could not open: ' + err.message); } } }, `☁️ ${e.name}`)));
  }

  importDesign() {
    const f = h('input', { type: 'file', accept: '.json,application/json', onchange: async () => {
      try { const d = JSON.parse(await f.files[0].text()); if (!d.items) throw new Error('Not a The Home design file'); this.app.loadDesign(d, 'Imported design'); this.toast('Design imported'); }
      catch (e) { this.toast('Import failed: ' + e.message, 4000); }
    } });
    f.click();
  }

  importModelModal() {
    const gh = this.app.github;
    const ta = h('textarea.code', { placeholder: '{\n  "id": "my-velvet-sofa",\n  "name": "Velvet Sofa",\n  ...\n}' });
    const out = h('div.validate');
    const file = h('input', { type: 'file', accept: '.json', multiple: true, onchange: async () => { ta.value = await file.files[0].text(); check(); } });
    let result = null;
    const check = () => {
      out.innerHTML = '';
      if (!ta.value.trim()) return;
      let model; try { model = JSON.parse(ta.value); } catch (e) { out.append(h('div.warn', {}, 'Invalid JSON: ' + e.message)); return; }
      result = this.app.library.importJSON(model, { persist: false });
      if (result.errors.length) out.append(h('div.warn', {}, h('b', {}, 'Fix these first:'), h('ul', {}, result.errors.map((x) => h('li', {}, x)))));
      else out.append(h('div.ok', {}, `✓ “${model.name}” looks good${result.warnings.length ? ` (${result.warnings.length} warnings)` : ''} — it’s in the Playbox now.`));
      if (result.warnings.length) out.append(h('ul.tiny', {}, result.warnings.map((x) => h('li', {}, x))));
      this.renderLeft();
    };
    ta.addEventListener('input', check);
    const prompt = `Read the skill at .claude/skills/photo-to-model/SKILL.md in ${gh.repo ? 'https://github.com/' + gh.repo : 'our The Home repo'} and turn this photo into a Playbox model for The Home: <paste the Pinterest link or attach the image>`;
    const m = this.modal('📷 Add a model from a photo',
      h('ol.steps', {},
        h('li', {}, 'Find a piece you love (Pinterest, a store, a photo you took).'),
        h('li', {}, 'Give the photo to any coding agent (Claude Code, Cursor, Copilot…) with this prompt:',
          h('div.copy-row', {}, h('input', { value: prompt, readOnly: true }), h('button.btn', { onclick: async () => { await navigator.clipboard.writeText(prompt); this.toast('Prompt copied'); } }, 'Copy'))),
        h('li', {}, 'The agent writes a model file to /models and pushes it — it shows up in everyone’s Playbox automatically.'),
        h('li', {}, 'Or paste/upload a model JSON here to try it right now:')),
      ta, h('div.btn-row', {}, file), out,
      h('div.btn-row', {},
        h('button.btn.primary', { onclick: () => { check(); if (result && !result.errors.length) { this.app.library.importJSON(result.model); this.toast('Added to your Playbox (this browser)'); } } }, 'Keep in my Playbox'),
        h('button.btn', { onclick: async () => {
          check(); if (!result || result.errors.length) return;
          const model = result.model;
          if (gh.token) { try { await gh.publishModel(model, this.store.user?.name); this.toast('Published to the repo — it will appear for everyone ✓', 4000); } catch (e) { this.toast('Publish failed: ' + e.message, 5000); } }
          else if (gh.repo) { open(gh.newFileURL(`${CONFIG.modelsDir}/${model.category}/${model.id}.json`, JSON.stringify(model, null, 2)), '_blank'); }
          else this.toast('Set the GitHub repo in Settings first');
        } }, '☁️ Publish to repo')));
    m.card.classList.add('wide');
  }

  liveModal() {
    const L = this.app.live;
    const code = h('input.big-input', { placeholder: 'CODE', maxLength: 6, style: { textTransform: 'uppercase', textAlign: 'center', letterSpacing: '6px' } });
    const body = L.active
      ? [h('p', {}, 'Live session code:'), h('div.big-code', {}, L.code), h('p', {}, `${L.count + 1} people connected. Everyone sees edits instantly and can see each other walk around.`),
        h('button.btn.danger', { onclick: () => { L.leave(); m.close(); } }, 'Leave session')]
      : [h('p', {}, 'Edit together in real time — you’ll see each other’s changes as they happen and each other’s avatar walking around the home.'),
        h('button.btn.primary.wide', { onclick: async () => { try { const c = await L.host(); m.close(); this.liveModal(); this.toast(`Session ${c} started — send the code to your partner 💞`, 4000); } catch (e) { this.toast('Could not start: ' + e.message, 4000); } } }, '💞 Start a session'),
        h('div.or', {}, 'or join one'), code,
        h('button.btn.wide', { onclick: async () => { if (!code.value.trim()) return; try { this.toast('Connecting…'); await L.join(code.value); m.close(); this.toast('Connected 💞'); } catch (e) { this.toast('Could not join: ' + (e.type || e.message), 4000); } } }, 'Join'),
        h('p.tiny', {}, 'Uses a free peer-to-peer connection (PeerJS). Works best on home Wi-Fi; strict work/school networks may block it.')];
    const m = this.modal('💞 Live together', ...body);
  }
  refreshLive() { this.liveBtn.classList.toggle('on', this.app.live.active); this.liveBtn.textContent = this.app.live.active ? `💞 ${this.app.live.code}` : '💞 Live'; }
}

// Little floor-plan thumbnail
export function drawPlan(canvas, bp) {
  const x = canvas.getContext('2d'), rects = bp.rooms.map((r) => r.rect);
  const minX = Math.min(...rects.map((r) => r[0])), minZ = Math.min(...rects.map((r) => r[1])), maxX = Math.max(...rects.map((r) => r[2])), maxZ = Math.max(...rects.map((r) => r[3]));
  const pad = 8, s = Math.min((canvas.width - pad * 2) / (maxX - minX), (canvas.height - pad * 2) / (maxZ - minZ));
  const ox = (canvas.width - (maxX - minX) * s) / 2, oz = (canvas.height - (maxZ - minZ) * s) / 2;
  const X = (v) => ox + (v - minX) * s, Z = (v) => oz + (v - minZ) * s;
  x.clearRect(0, 0, canvas.width, canvas.height);
  const fill = { living: '#f3e3c8', dining: '#efd9b6', kitchen: '#dfe9ee', bath: '#cfe2ea', bedroom: '#e9dcef', closet: '#e6e1da', office: '#e2ecd9', hall: '#ece7df', game: '#f2d6cf', outdoor: '#cfe5c4' };
  for (const r of bp.rooms) { x.fillStyle = fill[r.type] || '#eee'; x.fillRect(X(r.rect[0]), Z(r.rect[1]), (r.rect[2] - r.rect[0]) * s, (r.rect[3] - r.rect[1]) * s); }
  for (const [ax, c, a0, a1, o = {}] of bp.walls) {
    x.strokeStyle = o.rail ? '#7aa36a' : '#3a3632'; x.lineWidth = o.ext ? 2.4 : o.rail ? 1 : 1.4;
    x.beginPath(); if (ax === 'h') { x.moveTo(X(a0), Z(c)); x.lineTo(X(a1), Z(c)); } else { x.moveTo(X(c), Z(a0)); x.lineTo(X(c), Z(a1)); } x.stroke();
    for (const op of o.open || []) {
      x.strokeStyle = op.t === 'door' ? '#c47a3c' : '#6fb5d9'; x.lineWidth = 2.6; x.beginPath();
      const s0 = a0 + op.c - op.w / 2, s1 = a0 + op.c + op.w / 2;
      if (ax === 'h') { x.moveTo(X(s0), Z(c)); x.lineTo(X(s1), Z(c)); } else { x.moveTo(X(c), Z(s0)); x.lineTo(X(c), Z(s1)); } x.stroke();
    }
  }
}
