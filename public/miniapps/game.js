// Общие мелочи для игр на холсте: подгонка под экран, игровой цикл, эмодзи вместо спрайтов, палец-джойстик и клавиши.
export function stage(cv, W, H) {
  const ctx = cv.getContext('2d');
  const fit = () => { const p = cv.parentElement, k = Math.min(p.clientWidth / W, p.clientHeight / H) || 1, d = Math.min(2, window.devicePixelRatio || 1); cv.style.width = Math.floor(W * k) + 'px'; cv.style.height = Math.floor(H * k) + 'px'; cv.width = W * d; cv.height = H * d; ctx.setTransform(d, 0, 0, d, 0, 0); };
  fit(); addEventListener('resize', fit); setTimeout(fit, 60);
  const pos = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; };
  return { ctx, pos, fit };
}
export function loop(step) { let last = performance.now(); const f = t => { const dt = Math.min(0.05, Math.max(0, (t - last) / 1000)); last = t; step(dt); requestAnimationFrame(f); }; requestAnimationFrame(f); }
export const emo = (ctx, e, x, y, s) => { ctx.font = s + 'px "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(e, x, y); };
export const text = (ctx, t, x, y, s, c, a) => { ctx.font = `600 ${s}px 'Golos Text', 'Segoe UI', system-ui, sans-serif`; ctx.textAlign = a || 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = c || '#fff'; ctx.fillText(t, x, y); };
export const rnd = (a, b) => a + Math.random() * (b - a), pick = l => l[Math.floor(Math.random() * l.length)], clamp = (v, a, b) => Math.max(a, Math.min(b, v)), dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
// Палец-джойстик: где коснулся, там центр; zones — функции «мой ли это палец» для каждого джойстика
export function sticks(cv, pos, zones) {
  const st = zones.map(() => ({ on: false, id: null, ox: 0, oy: 0, x: 0, y: 0 })), R = 38;
  cv.addEventListener('pointerdown', e => { const p = pos(e), i = zones.findIndex((z, k) => !st[k].on && z(p)); if (i < 0) return; try { cv.setPointerCapture(e.pointerId); } catch (x) { /* не страшно */ } Object.assign(st[i], { on: true, id: e.pointerId, ox: p.x, oy: p.y, x: 0, y: 0 }); e.preventDefault(); });
  cv.addEventListener('pointermove', e => { const s = st.find(q => q.on && q.id === e.pointerId); if (!s) return; const p = pos(e); let dx = p.x - s.ox, dy = p.y - s.oy; const l = Math.hypot(dx, dy); if (l > R) { dx *= R / l; dy *= R / l; } s.x = dx / R; s.y = dy / R; });
  const up = e => { const s = st.find(q => q.on && q.id === e.pointerId); if (s) { s.on = false; s.x = s.y = 0; } };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  return st;
}
export function drawStick(ctx, s) { if (!s.on) return; ctx.globalAlpha = .35; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(s.ox, s.oy, 38, 0, 7); ctx.fill(); ctx.globalAlpha = .7; ctx.beginPath(); ctx.arc(s.ox + s.x * 38, s.oy + s.y * 38, 16, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
export const keys = new Set(); addEventListener('keydown', e => keys.add(e.code)); addEventListener('keyup', e => keys.delete(e.code)); addEventListener('blur', () => keys.clear());
export const axis = () => ({ x: (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0), y: (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) });
