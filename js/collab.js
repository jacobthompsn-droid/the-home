// Collaboration: GitHub repo storage (designs + Playbox models) and live peer-to-peer sessions.
import { CONFIG, detectRepo } from './config.js';
import { slug } from './util.js';
import { manifestEntry, SPEC_VERSION } from './model-spec.js';

const b64 = (str) => { const bytes = new TextEncoder().encode(str); let bin = ''; bytes.forEach((b) => bin += String.fromCharCode(b)); return btoa(bin); };

export class GitHub {
  constructor() {
    this.repo = detectRepo(); this.branch = CONFIG.githubBranch;
    this.token = localStorage.getItem('thehome.ghToken') || '';
  }
  setRepo(r) { this.repo = r.trim(); localStorage.setItem('thehome.repo', this.repo); }
  setToken(t) { this.token = t.trim(); if (this.token) localStorage.setItem('thehome.ghToken', this.token); else localStorage.removeItem('thehome.ghToken'); }
  get connected() { return !!(this.repo && this.token); }

  async api(path, opts = {}) {
    const res = await fetch(`https://api.github.com/repos/${this.repo}/${path}`, {
      ...opts, headers: { Accept: 'application/vnd.github+json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}), ...(opts.headers || {}) },
    });
    if (!res.ok) { const t = await res.text(); throw new Error(`GitHub ${res.status}: ${t.slice(0, 200)}`); }
    return res.status === 204 ? null : res.json();
  }

  // List designs saved in the repo. Works without a token on public repos; falls back to the local copy.
  async listDesigns() {
    if (this.repo) {
      try {
        const files = await this.api(`contents/${CONFIG.designsDir}?ref=${this.branch}&t=${Date.now()}`);
        return files.filter((f) => f.name.endsWith('.json') && f.name !== 'index.json').map((f) => ({ name: f.name.replace(/\.json$/, ''), path: f.path, url: f.download_url, sha: f.sha }));
      } catch (e) { console.warn(e); }
    }
    try { return ((await (await fetch(`${CONFIG.designsDir}/index.json`, { cache: 'no-cache' })).json()).designs || []).map((p) => ({ name: p.replace(/^.*\/|\.json$/g, ''), path: p, url: p })); }
    catch { return []; }
  }
  async loadDesign(entry) {
    if (this.token && this.repo) {
      const f = await this.api(`contents/${entry.path}?ref=${this.branch}&t=${Date.now()}`);
      return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(f.content.replace(/\n/g, '')), (c) => c.charCodeAt(0))));
    }
    return (await fetch(entry.url + (entry.url.includes('?') ? '&' : '?') + 't=' + Date.now())).json();
  }

  async putFile(path, content, message) {
    let sha;
    try { sha = (await this.api(`contents/${path}?ref=${this.branch}`)).sha; } catch {}
    return this.api(`contents/${path}`, { method: 'PUT', body: JSON.stringify({ message, content: b64(content), branch: this.branch, ...(sha ? { sha } : {}) }) });
  }

  async saveDesign(design, who) {
    const path = `${CONFIG.designsDir}/${slug(design.name)}.json`;
    await this.putFile(path, JSON.stringify(design, null, 1) + '\n', `🏡 Save design "${design.name}"${who ? ` (by ${who})` : ''}`);
    return path;
  }

  // Publish a model to /models/<category>/<id>.json and add it to models/index.json (the Playbox list).
  async publishModel(model, who) {
    const path = `${CONFIG.modelsDir}/${model.category}/${model.id}.json`;
    await this.putFile(path, JSON.stringify(model, null, 2) + '\n', `🪑 Add model "${model.name}" to the Playbox${who ? ` (by ${who})` : ''}`);
    try {
      const f = await this.api(`contents/${CONFIG.modelsDir}/index.json?ref=${this.branch}`);
      const idx = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(f.content.replace(/\n/g, '')), (c) => c.charCodeAt(0))));
      idx.models = (idx.models || []).filter((m) => m.id !== model.id).concat([manifestEntry(model, path)]).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
      idx.count = idx.models.length; idx.spec = SPEC_VERSION;
      await this.putFile(`${CONFIG.modelsDir}/index.json`, JSON.stringify(idx, null, 1) + '\n', `Update Playbox index (+${model.id})`);
    } catch (e) { console.warn('index update skipped (the GitHub Action will rebuild it)', e); }
    return path;
  }

  // No token? Open GitHub's "new file" page pre-filled (or copy to clipboard if too long for a URL).
  newFileURL(path, content) {
    const base = `https://github.com/${this.repo}/new/${this.branch}?filename=${encodeURIComponent(path)}`;
    return content.length < 6000 ? `${base}&value=${encodeURIComponent(content)}` : base;
  }
}

// ---------------------------------------------------------------------------------------------
// Live session: WebRTC via PeerJS (public broker only brokers the connection; data goes peer-to-peer).
export class LiveSession extends EventTarget {
  constructor(store) { super(); this.store = store; this.conns = []; this.peer = null; this.code = null; this.isHost = false; this.lastMove = 0; this.lastPresence = 0; }
  get active() { return !!this.peer && !this.peer.destroyed; }
  get count() { return this.conns.filter((c) => c.open).length; }

  async lib() {
    if (window.Peer) return window.Peer;
    await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js'; s.onload = res; s.onerror = () => rej(new Error('Could not load PeerJS')); document.head.append(s); });
    return window.Peer;
  }
  async host() {
    const Peer = await this.lib();
    this.code = Math.random().toString(36).slice(2, 7).toUpperCase().replace(/[01OI]/g, 'X');
    this.isHost = true;
    return new Promise((res, rej) => {
      this.peer = new Peer(CONFIG.peerPrefix + this.code);
      this.peer.on('open', () => { this.emit('status'); res(this.code); });
      this.peer.on('connection', (c) => this.setup(c));
      this.peer.on('error', (e) => { this.emit('error', { error: e }); rej(e); });
    });
  }
  async join(code) {
    const Peer = await this.lib();
    this.code = code.trim().toUpperCase(); this.isHost = false;
    return new Promise((res, rej) => {
      this.peer = new Peer();
      this.peer.on('open', () => { const c = this.peer.connect(CONFIG.peerPrefix + this.code, { reliable: true }); this.setup(c); c.on('open', () => res()); });
      this.peer.on('error', (e) => { this.emit('error', { error: e }); rej(e); });
    });
  }
  setup(conn) {
    this.conns.push(conn);
    conn.on('open', () => {
      conn.send({ type: 'hello', user: this.store.user });
      if (this.isHost) conn.send({ type: 'design', design: this.store.design, label: 'Joined session', by: this.store.user?.name });
      this.emit('status');
    });
    conn.on('data', (msg) => {
      if (this.isHost) for (const c of this.conns) if (c !== conn && c.open) c.send(msg); // relay to other guests
      this.emit('message', { msg, peer: conn.peer });
    });
    conn.on('close', () => { this.conns = this.conns.filter((c) => c !== conn); this.emit('leave', { peer: conn.peer }); this.emit('status'); });
  }
  send(msg) { for (const c of this.conns) if (c.open) c.send(msg); }
  sendDesign(label) { this.send({ type: 'design', design: this.store.design, label, by: this.store.user?.name }); }
  sendMove(items) {
    const now = performance.now(); if (now - this.lastMove < 50 || !this.count) return; this.lastMove = now;
    this.send({ type: 'move', items: items.map(({ id, x, y, z, rot }) => ({ id, x, y, z, rot })) });
  }
  sendPresence(p) {
    const now = performance.now(); if (now - this.lastPresence < 100 || !this.count) return; this.lastPresence = now;
    this.send({ type: 'presence', user: this.store.user, ...p });
  }
  leave() { this.conns.forEach((c) => c.close()); this.conns = []; this.peer?.destroy(); this.peer = null; this.code = null; this.emit('status'); }
  emit(type, detail = {}) { this.dispatchEvent(new CustomEvent(type, { detail })); }
}
