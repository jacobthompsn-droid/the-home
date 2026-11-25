// Arcade cabinet mini-game: "Heart Catch" — 30 seconds, catch hearts, dodge broken ones.
export class HeartCatch {
  constructor(app) { this.app = app; this.running = false; }

  start(onEnd) {
    this.onEnd = onEnd;
    const root = document.getElementById('game');
    root.innerHTML = '';
    const W = 480, H = 360;
    const frame = document.createElement('div'); frame.className = 'arcade';
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const help = document.createElement('div'); help.className = 'arcade-help'; help.textContent = '← → or mouse to move · catch 💖 · avoid 💔 · Esc to quit';
    frame.append(cv, help); root.append(frame); root.classList.add('open');
    const ctx = cv.getContext('2d');
    const S = this.state = { x: W / 2, score: 0, t: 30, items: [], spawn: 0, combo: 0, keys: new Set(), flash: 0 };
    this.running = true;
    const kd = (e) => { if (e.code === 'Escape') { this.end(); return; } S.keys.add(e.code); e.stopPropagation(); };
    const ku = (e) => S.keys.delete(e.code);
    const mm = (e) => { const r = cv.getBoundingClientRect(); S.x = (e.clientX - r.left) / r.width * W; };
    addEventListener('keydown', kd, true); addEventListener('keyup', ku, true); cv.addEventListener('pointermove', mm);
    this.cleanup = () => { removeEventListener('keydown', kd, true); removeEventListener('keyup', ku, true); root.classList.remove('open'); root.innerHTML = ''; };
    let last = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      S.t -= dt;
      const speed = 330;
      if (S.keys.has('ArrowLeft') || S.keys.has('KeyA')) S.x -= speed * dt;
      if (S.keys.has('ArrowRight') || S.keys.has('KeyD')) S.x += speed * dt;
      S.x = Math.max(30, Math.min(W - 30, S.x));
      S.spawn -= dt;
      const level = 1 + (30 - S.t) / 12;
      if (S.spawn <= 0) {
        S.spawn = 0.55 / level;
        const r = Math.random();
        S.items.push({ x: 20 + Math.random() * (W - 40), y: -20, vy: 90 + Math.random() * 60 * level, kind: r < 0.18 ? 'bad' : r < 0.25 ? 'gold' : 'good' });
      }
      for (const it of S.items) {
        it.y += it.vy * dt;
        if (!it.done && it.y > H - 52 && it.y < H - 20 && Math.abs(it.x - S.x) < 38) {
          it.done = true;
          if (it.kind === 'bad') { S.score = Math.max(0, S.score - 3); S.combo = 0; S.flash = 0.3; this.app.audio.blip(140, 0.18, 0.2, 'sawtooth'); }
          else { S.combo++; const pts = (it.kind === 'gold' ? 5 : 1) * (S.combo > 8 ? 2 : 1); S.score += pts; this.app.audio.blip(it.kind === 'gold' ? 1320 : 880 + Math.min(S.combo, 10) * 40, 0.07, 0.1); }
        }
      }
      S.items = S.items.filter((it) => !it.done && it.y < H + 30);
      S.flash = Math.max(0, S.flash - dt);
      // draw
      const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1a0b2e'); g.addColorStop(1, '#3b0f4f');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(255,80,200,.18)'; for (let y = H - 60; y < H; y += 12) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      if (S.flash) { ctx.fillStyle = `rgba(255,0,60,${S.flash})`; ctx.fillRect(0, 0, W, H); }
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '28px serif';
      for (const it of S.items) ctx.fillText(it.kind === 'bad' ? '💔' : it.kind === 'gold' ? '💛' : '💖', it.x, it.y);
      ctx.font = '40px serif'; ctx.fillText('🧺', S.x, H - 36);
      ctx.font = 'bold 18px ui-monospace, monospace'; ctx.fillStyle = '#ffd1f0'; ctx.textAlign = 'left';
      ctx.fillText(`SCORE ${S.score}`, 14, 20); ctx.textAlign = 'right'; ctx.fillText(`${Math.ceil(Math.max(0, S.t))}s`, W - 14, 20);
      if (S.combo > 8) { ctx.textAlign = 'center'; ctx.fillStyle = '#ffe36e'; ctx.fillText(`COMBO x2`, W / 2, 20); }
      if (S.t <= 0) { this.end(true); return; }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  end(done) {
    if (!this.running) return;
    this.running = false; this.cleanup?.();
    const score = this.state.score;
    if (done) this.onEnd?.(score); else this.app.sim.cancel('Game over — you quit early.');
  }
  stop() { if (this.running) { this.running = false; this.cleanup?.(); } }
}
