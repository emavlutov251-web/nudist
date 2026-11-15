// Рисованная графика мини-игр: герой Листик, предметы и фоны. Всё нарисовано кодом на холсте — ни картинок, ни эмодзи.
const TAU = Math.PI * 2;
const el = (c, x, y, rx, ry, fill, rot) => { c.beginPath(); c.ellipse(x, y, rx, ry, rot || 0, 0, TAU); c.fillStyle = fill; c.fill(); };
const ln = (c, pts, w, col) => { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.lineWidth = w; c.strokeStyle = col; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke(); };
const poly = (c, pts, fill) => { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); c.fillStyle = fill; c.fill(); };
const grad = (c, x0, y0, x1, y1, a, b) => { const g = c.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, a); g.addColorStop(1, b); return g; };
const rr = (c, x, y, w, h, r, fill) => { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); c.fillStyle = fill; c.fill(); };
const shine = (c, x, y, r) => el(c, x - r * 0.35, y - r * 0.4, r * 0.22, r * 0.14, 'rgba(255,255,255,.7)', -0.6);

// ───── Листик. s — рост; o: t (время, с), mood: ok | happy | hurt, hat, dir (−1 влево, 1 вправо), run (фаза шага), air (в прыжке)
export function leafy(c, x, y, s, o = {}) {
  const t = o.t || 0, dir = o.dir || 1, mood = o.mood || 'ok', run = o.run || 0, bob = o.air ? 0 : Math.sin(t * 5) * s * 0.015, k = s / 100;
  c.save(); c.translate(x, y + bob); c.scale(k, k);
  if (!o.air) el(c, 0, 52, 30, 6, 'rgba(0,0,0,.16)');
  // ноги
  const a = Math.sin(run) * 9, legY = o.air ? 40 : 46;
  ln(c, [-10, 30, -10 - a, legY], 6, '#2E7D46'); ln(c, [10, 30, 10 + a, legY], 6, '#2E7D46');
  el(c, -10 - a + dir * 3, legY + 2, 8, 5, '#256B3B'); el(c, 10 + a + dir * 3, legY + 2, 8, 5, '#256B3B');
  // руки
  const up = mood === 'happy' ? -22 : mood === 'hurt' ? 12 : Math.sin(t * 5) * 4;
  ln(c, [-27, 4, -40, 6 + up], 5, '#2E7D46'); ln(c, [27, 4, 40, 6 + up], 5, '#2E7D46');
  // тело-лист
  c.beginPath(); c.moveTo(0, -50); c.bezierCurveTo(34, -40, 42, 6, 0, 38); c.bezierCurveTo(-42, 6, -34, -40, 0, -50); c.closePath();
  c.fillStyle = grad(c, -20, -50, 20, 40, o.color || '#8FE08A', o.color2 || '#3DB96A'); c.fill(); c.lineWidth = 3; c.strokeStyle = '#2A8A4C'; c.stroke();
  ln(c, [0, -44, 0, 30], 1.6, 'rgba(255,255,255,.35)'); ln(c, [0, -20, 14, -30], 1.4, 'rgba(255,255,255,.3)'); ln(c, [0, -20, -14, -30], 1.4, 'rgba(255,255,255,.3)');
  c.beginPath(); c.moveTo(0, -50); c.quadraticCurveTo(6, -62, 14, -60); c.lineWidth = 3.5; c.strokeStyle = '#2A8A4C'; c.lineCap = 'round'; c.stroke();
  // лицо
  el(c, -17, 8, 6, 4, 'rgba(255,120,140,.5)'); el(c, 17, 8, 6, 4, 'rgba(255,120,140,.5)');
  const blink = (t % 3.2) > 3.05, ex = dir * 2;
  if (mood === 'hurt') { for (const sx of [-11, 11]) { ln(c, [sx - 4, -6, sx + 4, 2], 2.6, '#1B3B26'); ln(c, [sx + 4, -6, sx - 4, 2], 2.6, '#1B3B26'); } }
  else if (blink || mood === 'happy') { for (const sx of [-11, 11]) { c.beginPath(); c.arc(sx, -1, 5, Math.PI * 1.1, Math.PI * 1.9); c.lineWidth = 2.6; c.strokeStyle = '#1B3B26'; c.lineCap = 'round'; c.stroke(); } }
  else for (const sx of [-11, 11]) { el(c, sx, -2, 6.5, 7.5, '#fff'); el(c, sx + ex, -1, 3.4, 4.2, '#1B3B26'); el(c, sx + ex + 1, -3, 1.2, 1.2, '#fff'); }
  if (mood === 'happy') { c.beginPath(); c.arc(0, 10, 8, 0.05 * Math.PI, 0.95 * Math.PI); c.closePath(); c.fillStyle = '#7A1F2B'; c.fill(); }
  else if (mood === 'hurt') { c.beginPath(); c.arc(0, 18, 6, Math.PI * 1.15, Math.PI * 1.85); c.lineWidth = 2.4; c.strokeStyle = '#1B3B26'; c.stroke(); }
  else { c.beginPath(); c.arc(0, 9, 6, 0.15 * Math.PI, 0.85 * Math.PI); c.lineWidth = 2.4; c.strokeStyle = '#1B3B26'; c.lineCap = 'round'; c.stroke(); }
  hat(c, o.hat, t);
  c.restore();
}
function hat(c, h, t) {
  if (!h) return;
  if (h === 'santa') { poly(c, [-22, -36, 20, -40, 30, -70], '#D7263D'); c.beginPath(); c.moveTo(30, -70); c.quadraticCurveTo(40, -62, 36, -50); c.lineWidth = 7; c.strokeStyle = '#D7263D'; c.stroke(); el(c, 36, -48, 6, 6, '#fff'); rr(c, -26, -42, 50, 9, 4.5, '#fff'); }
  else if (h === 'scarf') { rr(c, -22, 14, 44, 9, 4, '#D7263D'); rr(c, 10, 18, 9, 22, 4, '#D7263D'); for (let i = 0; i < 4; i++) rr(c, -18 + i * 10, 14, 4, 9, 1, '#fff'); }
  else if (h === 'witch') { poly(c, [-20, -40, 20, -40, 6, -82], '#4B2A7B'); el(c, 0, -40, 34, 7, '#3A1F63'); rr(c, -17, -48, 34, 6, 2, '#F28C28'); }
  else if (h === 'party') { poly(c, [-14, -44, 16, -44, 4, -80], '#FF5E7E'); ln(c, [-8, -52, 10, -56], 3, '#FFE066'); ln(c, [-3, -62, 8, -66], 3, '#FFE066'); el(c, 4, -82, 5, 5, '#FFE066'); }
  else if (h === 'joker') { poly(c, [-20, -40, 0, -46, -30, -74], '#7C4DFF'); poly(c, [20, -40, 0, -46, 30, -74], '#FF5E7E'); el(c, -30, -75, 5, 5, '#FFE066'); el(c, 30, -75, 5, 5, '#FFE066'); rr(c, -22, -46, 44, 7, 3, '#FFE066'); }
  else if (h === 'cap') { c.beginPath(); c.arc(0, -40, 22, Math.PI, 0); c.closePath(); c.fillStyle = '#2B7FE0'; c.fill(); rr(c, 4, -44, 32, 6, 3, '#1F63B5'); }
  else if (h === 'crown') { poly(c, [-20, -40, -24, -64, -10, -52, 0, -70, 10, -52, 24, -64, 20, -40], '#F5B700'); el(c, 0, -70, 3, 3, '#FF5E7E'); rr(c, -20, -44, 40, 6, 2, '#E09F00'); }
  else if (h === 'shades') { rr(c, -20, -8, 17, 12, 4, '#15202B'); rr(c, 3, -8, 17, 12, 4, '#15202B'); ln(c, [-3, -3, 3, -3], 2.5, '#15202B'); ln(c, [-17, -5, -12, -5], 1.6, 'rgba(255,255,255,.6)'); }
  else if (h === 'flowers') { for (let i = -2; i <= 2; i++) { const fx = i * 10, fy = -42 - (2 - Math.abs(i)) * 3; for (let p = 0; p < 5; p++) el(c, fx + Math.cos(p * 1.257) * 4, fy + Math.sin(p * 1.257) * 4, 3, 3, i % 2 ? '#FF8FB1' : '#FFD166'); el(c, fx, fy, 2.4, 2.4, '#fff'); } }
  else if (h === 'umbrella') { ln(c, [40, 6, 40, -64], 3, '#5B4636'); c.beginPath(); c.arc(40, -62, 34, Math.PI, 0); c.closePath(); c.fillStyle = '#E94F64'; c.fill(); for (const dx of [-17, 17]) { c.beginPath(); c.arc(40 + dx, -62, 17, 0, Math.PI); c.fillStyle = 'rgba(0,0,0,.08)'; c.fill(); } }
  else if (h === 'band') { rr(c, -24, -30, 48, 7, 3, '#E94F64'); poly(c, [22, -28, 36, -34, 34, -22], '#E94F64'); }
  else if (h === 'tag') { rr(c, -22, -44, 44, 8, 3, '#111'); el(c, 0, -52, 9, 9, '#111'); el(c, 0, -52, 4, 4, '#F5B700'); }
}

// ───── предметы: item(ctx, имя, x, y, размер, время)
const I = {
  heart(c, r) { c.beginPath(); c.moveTo(0, r * 0.9); c.bezierCurveTo(-r * 1.4, -r * 0.1, -r * 0.7, -r * 1.2, 0, -r * 0.35); c.bezierCurveTo(r * 0.7, -r * 1.2, r * 1.4, -r * 0.1, 0, r * 0.9); c.fillStyle = grad(c, 0, -r, 0, r, '#FF7A93', '#E0244F'); c.fill(); shine(c, -r * 0.1, -r * 0.15, r); },
  broken(c, r) { c.beginPath(); c.moveTo(0, r * 0.9); c.bezierCurveTo(-r * 1.4, -r * 0.1, -r * 0.7, -r * 1.2, 0, -r * 0.35); c.bezierCurveTo(r * 0.7, -r * 1.2, r * 1.4, -r * 0.1, 0, r * 0.9); c.fillStyle = '#6B6F7B'; c.fill(); ln(c, [0, -r * 0.35, -r * 0.25, 0, r * 0.2, r * 0.25, -r * 0.05, r * 0.85], r * 0.16, '#2B2E36'); },
  mandarin(c, r) { el(c, 0, 0, r, r * 0.92, grad(c, 0, -r, 0, r, '#FFB13B', '#F27A1A')); el(c, 0, -r * 0.82, r * 0.16, r * 0.1, '#5B7F2B'); c.beginPath(); c.ellipse(r * 0.35, -r * 0.95, r * 0.4, r * 0.18, -0.5, 0, TAU); c.fillStyle = '#4CAF50'; c.fill(); shine(c, 0, 0, r); },
  gift(c, r) { rr(c, -r * 0.85, -r * 0.5, r * 1.7, r * 1.4, r * 0.15, '#E94F64'); rr(c, -r, -r * 0.75, r * 2, r * 0.45, r * 0.12, '#F2748A'); rr(c, -r * 0.15, -r * 0.75, r * 0.3, r * 1.65, 0, '#FFE066'); el(c, -r * 0.3, -r * 0.9, r * 0.32, r * 0.2, '#FFE066', 0.5); el(c, r * 0.3, -r * 0.9, r * 0.32, r * 0.2, '#FFE066', -0.5); },
  coal(c, r) { poly(c, [-r, r * 0.2, -r * 0.5, -r * 0.8, r * 0.4, -r * 0.9, r, -r * 0.1, r * 0.6, r * 0.8, -r * 0.4, r * 0.9], '#2B2E36'); poly(c, [-r * 0.4, -r * 0.5, r * 0.3, -r * 0.6, r * 0.1, 0], '#4A4E5A'); },
  snow(c, r) { for (let i = 0; i < 6; i++) { c.save(); c.rotate(i * TAU / 6); ln(c, [0, 0, 0, -r], r * 0.16, '#E8F6FF'); ln(c, [0, -r * 0.6, -r * 0.25, -r * 0.85], r * 0.12, '#E8F6FF'); ln(c, [0, -r * 0.6, r * 0.25, -r * 0.85], r * 0.12, '#E8F6FF'); c.restore(); } },
  icicle(c, r) { poly(c, [-r * 0.5, -r, r * 0.5, -r, 0, r * 1.1], grad(c, 0, -r, 0, r, '#DFF4FF', '#7CC8F5')); ln(c, [-r * 0.15, -r * 0.8, 0, r * 0.3], r * 0.1, 'rgba(255,255,255,.8)'); },
  flower(c, r, t, col) { for (let p = 0; p < 6; p++) el(c, Math.cos(p * TAU / 6) * r * 0.6, Math.sin(p * TAU / 6) * r * 0.6, r * 0.42, r * 0.42, col || '#FF8FB1'); el(c, 0, 0, r * 0.36, r * 0.36, '#FFD166'); },
  tulip(c, r) { ln(c, [0, r * 0.1, 0, r], r * 0.14, '#3DB96A'); el(c, r * 0.3, r * 0.6, r * 0.35, r * 0.13, '#3DB96A', -0.6); poly(c, [-r * 0.55, -r * 0.9, -r * 0.2, -r * 0.5, 0, -r, r * 0.2, -r * 0.5, r * 0.55, -r * 0.9, r * 0.5, 0, 0, r * 0.3, -r * 0.5, 0], '#FF5E7E'); },
  ball(c, r) { el(c, 0, 0, r, r, '#fff'); const cols = ['#FF5E7E', '#FFD166', '#3A8EE6']; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, r, i * TAU / 3, i * TAU / 3 + TAU / 6); c.closePath(); c.fillStyle = cols[i]; c.fill(); } el(c, 0, 0, r * 0.2, r * 0.2, '#fff'); shine(c, 0, 0, r); },
  icecream(c, r) { poly(c, [-r * 0.55, -r * 0.05, r * 0.55, -r * 0.05, 0, r * 1.15], '#E9B872'); ln(c, [-r * 0.3, r * 0.2, r * 0.2, r * 0.5], r * 0.06, '#C9944A'); el(c, 0, -r * 0.35, r * 0.62, r * 0.55, '#FFB3C7'); el(c, 0, -r * 0.85, r * 0.42, r * 0.38, '#FFF1B8'); el(c, 0, -r * 1.2, r * 0.13, r * 0.13, '#E0244F'); },
  crab(c, r) { for (const s of [-1, 1]) { ln(c, [s * r * 0.6, 0, s * r * 1.1, -r * 0.5], r * 0.14, '#D8452F'); el(c, s * r * 1.15, -r * 0.65, r * 0.28, r * 0.22, '#EE5A40'); for (let i = 0; i < 3; i++) ln(c, [s * r * 0.5, r * 0.3, s * (r * 0.9 + i * r * 0.1), r * (0.55 + i * 0.12)], r * 0.09, '#D8452F'); } el(c, 0, 0, r * 0.8, r * 0.55, grad(c, 0, -r, 0, r, '#FF7A5C', '#D8452F')); for (const s of [-1, 1]) { ln(c, [s * r * 0.25, -r * 0.45, s * r * 0.3, -r * 0.8], r * 0.07, '#D8452F'); el(c, s * r * 0.3, -r * 0.85, r * 0.13, r * 0.13, '#fff'); el(c, s * r * 0.3, -r * 0.85, r * 0.06, r * 0.06, '#111'); } },
  shell(c, r) { c.beginPath(); c.moveTo(0, r * 0.8); for (let i = 0; i <= 8; i++) { const a = Math.PI + i * Math.PI / 8; c.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.95 + r * 0.1); } c.closePath(); c.fillStyle = grad(c, 0, -r, 0, r, '#FFE3EC', '#FF9EB8'); c.fill(); for (let i = 1; i < 8; i++) { const a = Math.PI + i * Math.PI / 8; ln(c, [0, r * 0.75, Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.85 + r * 0.1], r * 0.05, 'rgba(200,80,120,.45)'); } },
  wasp(c, r, t) { const f = Math.sin(t * 40) * 0.3; el(c, -r * 0.2, -r * 0.6, r * 0.5, r * 0.25, 'rgba(255,255,255,.75)', -0.5 + f); el(c, r * 0.3, -r * 0.6, r * 0.5, r * 0.25, 'rgba(255,255,255,.75)', 0.5 - f); el(c, 0, 0, r * 0.9, r * 0.55, '#FFC83D'); for (const x of [-0.35, 0.05, 0.45]) rr(c, r * x, -r * 0.5, r * 0.17, r, r * 0.05, '#2B2E36'); el(c, -r * 0.85, 0, r * 0.3, r * 0.3, '#2B2E36'); poly(c, [r * 0.85, -r * 0.1, r * 1.25, 0, r * 0.85, r * 0.1], '#2B2E36'); },
  fruit(c, r) { el(c, 0, 0, r, r, grad(c, 0, -r, 0, r, '#FF8A5C', '#E94F4F')); el(c, 0, 0, r * 0.78, r * 0.78, '#FFE3A8'); for (let i = 0; i < 8; i++) { c.save(); c.rotate(i * TAU / 8); poly(c, [0, -r * 0.12, r * 0.22, -r * 0.68, -r * 0.22, -r * 0.68], '#FFB13B'); c.restore(); } },
  pumpkin(c, r) { for (const x of [-0.5, 0.5, 0]) el(c, r * x, r * 0.05, r * 0.55, r * 0.8, x ? '#E8791E' : '#F28C28'); rr(c, -r * 0.1, -r, r * 0.2, r * 0.3, r * 0.05, '#5B7F2B'); poly(c, [-r * 0.5, -r * 0.2, -r * 0.2, -r * 0.2, -r * 0.35, -r * 0.45], '#3A1B00'); poly(c, [r * 0.5, -r * 0.2, r * 0.2, -r * 0.2, r * 0.35, -r * 0.45], '#3A1B00'); poly(c, [-r * 0.45, r * 0.2, -r * 0.2, r * 0.35, 0, r * 0.2, r * 0.2, r * 0.35, r * 0.45, r * 0.2, r * 0.2, r * 0.55, -r * 0.2, r * 0.55], '#3A1B00'); },
  ghost(c, r, t) { const w = Math.sin(t * 4) * r * 0.06; c.beginPath(); c.arc(0, -r * 0.2, r * 0.75, Math.PI, 0); c.lineTo(r * 0.75, r * 0.8); for (let i = 0; i < 4; i++) c.quadraticCurveTo(r * 0.75 - (i + 0.5) * r * 0.375, r * 0.5 + w * (i % 2 ? 1 : -1), r * 0.75 - (i + 1) * r * 0.375, r * 0.8); c.closePath(); c.fillStyle = 'rgba(245,248,255,.95)'; c.fill(); el(c, -r * 0.28, -r * 0.25, r * 0.13, r * 0.18, '#2B2E36'); el(c, r * 0.28, -r * 0.25, r * 0.13, r * 0.18, '#2B2E36'); el(c, 0, r * 0.12, r * 0.14, r * 0.18, '#2B2E36'); },
  bat(c, r, t) { const f = Math.sin(t * 14) * r * 0.25; for (const s of [-1, 1]) poly(c, [0, 0, s * r * 0.6, -r * 0.5 + f, s * r * 1.3, -r * 0.1 + f, s * r * 0.95, r * 0.15, s * r * 0.6, 0, s * r * 0.35, r * 0.3], '#3A2A55'); el(c, 0, 0, r * 0.38, r * 0.45, '#4B2A7B'); poly(c, [-r * 0.3, -r * 0.3, -r * 0.2, -r * 0.7, -r * 0.05, -r * 0.35], '#4B2A7B'); poly(c, [r * 0.3, -r * 0.3, r * 0.2, -r * 0.7, r * 0.05, -r * 0.35], '#4B2A7B'); el(c, -r * 0.13, -r * 0.08, r * 0.07, r * 0.07, '#FFE066'); el(c, r * 0.13, -r * 0.08, r * 0.07, r * 0.07, '#FFE066'); },
  candy(c, r) { poly(c, [-r * 0.6, 0, -r * 1.2, -r * 0.45, -r * 1.2, r * 0.45], '#FF8FB1'); poly(c, [r * 0.6, 0, r * 1.2, -r * 0.45, r * 1.2, r * 0.45], '#FF8FB1'); el(c, 0, 0, r * 0.7, r * 0.55, '#7C4DFF'); ln(c, [-r * 0.3, -r * 0.4, r * 0.1, r * 0.45], r * 0.14, '#FFE066'); shine(c, 0, 0, r * 0.7); },
  coffee(c, r) { rr(c, -r * 0.65, -r * 0.6, r * 1.3, r * 1.5, r * 0.18, '#fff'); rr(c, -r * 0.65, -r * 0.2, r * 1.3, r * 0.6, 0, '#B97A4A'); rr(c, -r * 0.75, -r * 0.85, r * 1.5, r * 0.3, r * 0.1, '#5B4636'); },
  drop(c, r) { c.beginPath(); c.moveTo(0, -r); c.bezierCurveTo(r, 0, r * 0.8, r, 0, r); c.bezierCurveTo(-r * 0.8, r, -r, 0, 0, -r); c.fillStyle = grad(c, 0, -r, 0, r, '#9AD7FF', '#3A8EE6'); c.fill(); shine(c, 0, r * 0.2, r); },
  puddle(c, r) { el(c, 0, r * 0.5, r * 1.3, r * 0.35, '#5AA9E6'); el(c, -r * 0.3, r * 0.42, r * 0.5, r * 0.1, 'rgba(255,255,255,.5)'); },
  drift(c, r) { el(c, 0, r * 0.4, r * 1.2, r * 0.75, '#F4FAFF'); el(c, -r * 0.5, r * 0.55, r * 0.7, r * 0.5, '#E3F1FB'); el(c, r * 0.5, r * 0.6, r * 0.6, r * 0.42, '#fff'); },
  peel(c, r) { for (const a of [-0.9, 0, 0.9]) { c.save(); c.translate(0, r * 0.5); c.rotate(a); el(c, 0, -r * 0.45, r * 0.24, r * 0.6, '#FFD23F'); c.restore(); } el(c, 0, r * 0.5, r * 0.25, r * 0.2, '#C99700'); },
  pie(c, r) { el(c, 0, r * 0.2, r, r * 0.45, '#E9B872'); el(c, 0, 0, r * 0.85, r * 0.45, '#FFF7E6'); for (const x of [-0.4, 0, 0.4]) el(c, r * x, -r * 0.15, r * 0.25, r * 0.22, '#fff'); el(c, 0, -r * 0.4, r * 0.14, r * 0.14, '#E0244F'); },
  rock(c, r) { poly(c, [-r, r * 0.8, -r * 0.7, -r * 0.2, -r * 0.1, -r * 0.8, r * 0.6, -r * 0.4, r, r * 0.8], '#8A8F9C'); poly(c, [-r * 0.1, -r * 0.8, r * 0.6, -r * 0.4, r * 0.1, -r * 0.1], '#A9AEBB'); },
  saw(c, r, t) { c.save(); c.rotate(t * 6); for (let i = 0; i < 10; i++) { c.rotate(TAU / 10); poly(c, [-r * 0.2, -r * 0.7, r * 0.2, -r * 0.7, 0, -r * 1.1], '#C8CCD6'); } el(c, 0, 0, r * 0.78, r * 0.78, '#DDE1EA'); el(c, 0, 0, r * 0.2, r * 0.2, '#8A8F9C'); c.restore(); },
  star(c, r) { c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * TAU / 10, q = i % 2 ? r * 0.45 : r; c.lineTo(Math.cos(a) * q, Math.sin(a) * q); } c.closePath(); c.fillStyle = grad(c, 0, -r, 0, r, '#FFE98A', '#F5B700'); c.fill(); },
  leaf(c, r) { c.beginPath(); c.moveTo(0, -r); c.bezierCurveTo(r * 0.9, -r * 0.6, r * 0.9, r * 0.4, 0, r); c.bezierCurveTo(-r * 0.9, r * 0.4, -r * 0.9, -r * 0.6, 0, -r); c.fillStyle = grad(c, 0, -r, 0, r, '#A8E890', '#3DB96A'); c.fill(); ln(c, [0, -r * 0.8, 0, r * 0.9], r * 0.08, 'rgba(255,255,255,.5)'); },
  gold(c, r) { c.beginPath(); c.moveTo(0, -r); c.bezierCurveTo(r * 0.9, -r * 0.6, r * 0.9, r * 0.4, 0, r); c.bezierCurveTo(-r * 0.9, r * 0.4, -r * 0.9, -r * 0.6, 0, -r); c.fillStyle = grad(c, 0, -r, 0, r, '#FFF1A8', '#F5B700'); c.fill(); ln(c, [0, -r * 0.8, 0, r * 0.9], r * 0.08, 'rgba(255,255,255,.7)'); shine(c, 0, 0, r); },
  cake(c, r) { rr(c, -r * 0.9, -r * 0.1, r * 1.8, r, r * 0.15, '#F7C8D6'); rr(c, -r * 0.9, -r * 0.1, r * 1.8, r * 0.35, r * 0.15, '#fff'); for (const x of [-0.5, 0, 0.5]) { rr(c, r * x - r * 0.06, -r * 0.6, r * 0.12, r * 0.5, r * 0.04, '#7C4DFF'); el(c, r * x, -r * 0.72, r * 0.1, r * 0.16, '#FFB13B'); } },
  balloon(c, r, t, col) { ln(c, [0, r * 0.7, Math.sin(t * 3) * r * 0.1, r * 1.5], r * 0.05, '#8A8F9C'); el(c, 0, 0, r * 0.7, r * 0.85, col || '#3A8EE6'); poly(c, [-r * 0.1, r * 0.8, r * 0.1, r * 0.8, 0, r * 0.95], col || '#3A8EE6'); shine(c, 0, 0, r * 0.8); },
  bag(c, r) { rr(c, -r * 0.75, -r * 0.4, r * 1.5, r * 1.4, r * 0.1, '#1E1E24'); c.beginPath(); c.arc(0, -r * 0.4, r * 0.4, Math.PI, 0); c.lineWidth = r * 0.12; c.strokeStyle = '#F5B700'; c.stroke(); rr(c, -r * 0.35, r * 0.1, r * 0.7, r * 0.3, r * 0.05, '#F5B700'); },
  tag(c, r) { poly(c, [-r * 0.9, -r * 0.5, r * 0.4, -r * 0.5, r, 0, r * 0.4, r * 0.5, -r * 0.9, r * 0.5], '#E0244F'); el(c, r * 0.5, 0, r * 0.13, r * 0.13, '#fff'); ln(c, [-r * 0.55, r * 0.25, -r * 0.05, -r * 0.25], r * 0.1, '#fff'); el(c, -r * 0.5, -r * 0.2, r * 0.1, r * 0.1, '#fff'); el(c, -r * 0.1, r * 0.2, r * 0.1, r * 0.1, '#fff'); },
  bulb(c, r) { el(c, 0, -r * 0.15, r * 0.7, r * 0.75, '#FFE066'); rr(c, -r * 0.3, r * 0.5, r * 0.6, r * 0.45, r * 0.08, '#8A8F9C'); shine(c, 0, -r * 0.1, r * 0.8); },
  broom(c, r) { ln(c, [-r * 0.8, -r * 0.8, r * 0.2, r * 0.2], r * 0.14, '#B97A4A'); poly(c, [0, 0, r * 0.4, r * 0.4, r * 0.95, r * 0.5, r * 0.5, r * 0.95, r * 0.4, r * 0.4], '#F5C96B'); },
  sun(c, r, t) { for (let i = 0; i < 10; i++) { c.save(); c.rotate(i * TAU / 10 + t * 0.4); poly(c, [-r * 0.14, -r * 0.8, r * 0.14, -r * 0.8, 0, -r * 1.2], '#FFC83D'); c.restore(); } el(c, 0, 0, r * 0.72, r * 0.72, grad(c, 0, -r, 0, r, '#FFE98A', '#FFB13B')); },
  mosquito(c, r, t) { const f = Math.sin(t * 50) * 0.4; el(c, -r * 0.3, -r * 0.5, r * 0.75, r * 0.22, 'rgba(255,255,255,.7)', -0.7 + f); el(c, r * 0.3, -r * 0.5, r * 0.75, r * 0.22, 'rgba(255,255,255,.7)', 0.7 - f); for (const s of [-1, 1]) for (let i = 0; i < 3; i++) ln(c, [s * r * 0.2, r * 0.1, s * r * (0.7 + i * 0.15), r * (0.5 + i * 0.25), s * r * (0.9 + i * 0.15), r * (0.9 + i * 0.1)], r * 0.07, '#4A3B5C'); el(c, 0, r * 0.15, r * 0.3, r * 0.7, '#6B5B7B'); el(c, 0, -r * 0.55, r * 0.3, r * 0.3, '#4A3B5C'); ln(c, [0, -r * 0.8, 0, -r * 1.4], r * 0.08, '#2B2233'); el(c, -r * 0.12, -r * 0.6, r * 0.09, r * 0.09, '#FF5E7E'); el(c, r * 0.12, -r * 0.6, r * 0.09, r * 0.09, '#FF5E7E'); },
  fly(c, r, t) { const f = Math.sin(t * 45) * 0.35; el(c, -r * 0.55, -r * 0.2, r * 0.7, r * 0.35, 'rgba(220,240,255,.75)', -0.5 + f); el(c, r * 0.55, -r * 0.2, r * 0.7, r * 0.35, 'rgba(220,240,255,.75)', 0.5 - f); el(c, 0, r * 0.15, r * 0.6, r * 0.75, grad(c, 0, -r, 0, r, '#5A6B4A', '#2F3B26')); el(c, 0, -r * 0.6, r * 0.42, r * 0.36, '#2F3B26'); el(c, -r * 0.22, -r * 0.68, r * 0.17, r * 0.17, '#C0392B'); el(c, r * 0.22, -r * 0.68, r * 0.17, r * 0.17, '#C0392B'); },
  beetle(c, r, t) { for (const s of [-1, 1]) for (let i = 0; i < 3; i++) ln(c, [s * r * 0.5, -r * 0.3 + i * r * 0.35, s * r * 1.05, -r * 0.5 + i * r * 0.45 + Math.sin(t * 12 + i) * r * 0.06], r * 0.09, '#1E1E24'); el(c, 0, r * 0.1, r * 0.75, r * 0.9, grad(c, -r, -r, r, r, '#6A3FA0', '#2B1B4A')); ln(c, [0, -r * 0.6, 0, r * 0.95], r * 0.06, 'rgba(0,0,0,.45)'); el(c, 0, -r * 0.75, r * 0.45, r * 0.3, '#1E1E24'); ln(c, [-r * 0.2, -r * 0.95, -r * 0.45, -r * 1.35], r * 0.08, '#1E1E24'); ln(c, [r * 0.2, -r * 0.95, r * 0.45, -r * 1.35], r * 0.08, '#1E1E24'); el(c, -r * 0.2, -r * 0.8, r * 0.08, r * 0.08, '#FFE066'); el(c, r * 0.2, -r * 0.8, r * 0.08, r * 0.08, '#FFE066'); shine(c, 0, 0, r * 0.8); },
  bolt(c, r) { poly(c, [r * 0.15, -r, -r * 0.6, r * 0.1, -r * 0.05, r * 0.1, -r * 0.25, r, r * 0.6, -r * 0.2, r * 0.05, -r * 0.2], '#FFC83D'); },
  bomb(c, r, t) { el(c, 0, r * 0.15, r * 0.75, r * 0.75, '#2B2E36'); rr(c, -r * 0.15, -r * 0.8, r * 0.3, r * 0.3, r * 0.05, '#4A4E5A'); ln(c, [0, -r * 0.8, r * 0.3, -r * 1.1], r * 0.08, '#B97A4A'); el(c, r * 0.35, -r * 1.15, r * 0.14 + Math.sin(t * 20) * r * 0.04, r * 0.14, '#FFB13B'); shine(c, 0, r * 0.15, r * 0.75); },
  boom(c, r) { c.beginPath(); for (let i = 0; i < 16; i++) { const a = i * TAU / 16, q = i % 2 ? r * 0.55 : r; c.lineTo(Math.cos(a) * q, Math.sin(a) * q); } c.closePath(); c.fillStyle = '#FF8A3D'; c.fill(); c.beginPath(); for (let i = 0; i < 16; i++) { const a = i * TAU / 16 + 0.2, q = i % 2 ? r * 0.3 : r * 0.6; c.lineTo(Math.cos(a) * q, Math.sin(a) * q); } c.closePath(); c.fillStyle = '#FFE066'; c.fill(); },
  ouch(c, r) { for (let i = 0; i < 4; i++) { c.save(); c.rotate(i * TAU / 4 + 0.4); ln(c, [r * 0.3, -r * 0.3, r * 0.8, -r * 0.8], r * 0.2, '#E0244F'); c.restore(); } },
  palm(c, r, t) { ln(c, [0, r, r * 0.12, 0, 0, -r * 0.5], r * 0.2, '#9A6B3F'); for (let i = 0; i < 6; i++) { c.save(); c.translate(0, -r * 0.5); c.rotate(-1.4 + i * 0.56 + Math.sin(t + i) * 0.04); el(c, r * 0.5, 0, r * 0.55, r * 0.16, i % 2 ? '#3DB96A' : '#2E9E57'); c.restore(); } },
  parasol(c, r) { ln(c, [0, -r * 0.2, 0, r], r * 0.08, '#8A8F9C'); for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(0, -r * 0.2); c.arc(0, -r * 0.2, r, Math.PI + i * Math.PI / 6, Math.PI + (i + 1) * Math.PI / 6); c.closePath(); c.fillStyle = i % 2 ? '#fff' : '#E94F64'; c.fill(); } },
  guitar(c, r) { ln(c, [r * 0.1, -r * 0.2, r * 0.75, -r], r * 0.14, '#5B4636'); el(c, -r * 0.25, r * 0.3, r * 0.6, r * 0.55, '#C9772B'); el(c, 0, -r * 0.1, r * 0.4, r * 0.38, '#C9772B'); el(c, -r * 0.15, r * 0.15, r * 0.17, r * 0.17, '#3A1B00'); },
};
export const ITEMS = Object.keys(I);
export function item(c, name, x, y, r, t) { const f = I[name] || I.leaf; c.save(); c.translate(x, y); f(c, r, t || 0); c.restore(); }

// ───── оформление игр по событиям года. good — что ловить и собирать, bad — чего избегать, jump — через что прыгать
export const THEMES = {
  beach: { name: 'Пляж', sky: ['#7CCBFF', '#DFF4FF'], ground: ['#F6DFA6', '#E9C77B'], far: '#58B7E0', good: ['leaf', 'shell', 'icecream'], bad: ['crab'], jump: ['crab', 'rock'], hat: 'shades', decor: 'sun' },
  jan: { name: 'Голый январь', sky: ['#BFE3FF', '#F4FAFF'], ground: ['#FFFFFF', '#DCEBF7'], far: '#C9DDEE', good: ['snow', 'leaf'], bad: ['icicle'], jump: ['drift', 'icicle'], hat: 'scarf', decor: 'snow' },
  feb: { name: 'Валентинки', sky: ['#FFC2D4', '#FFF0F4'], ground: ['#FF9EB8', '#F27A9B'], far: '#FFB3C7', good: ['heart', 'candy', 'flower'], bad: ['broken'], jump: ['broken', 'rock'], hat: 'band', decor: 'hearts' },
  mar: { name: 'Весенняя линька', sky: ['#BDEBFF', '#F2FFE8'], ground: ['#9BDB7A', '#6FBF5A'], far: '#8FD694', good: ['flower', 'tulip', 'leaf'], bad: ['drop'], jump: ['puddle', 'rock'], hat: 'flowers', decor: 'sun' },
  apr: { name: 'День смеха', sky: ['#D9C7FF', '#FFF3C4'], ground: ['#FFD23F', '#F5B700'], far: '#FF8FB1', good: ['candy', 'star', 'balloon'], bad: ['pie'], jump: ['peel', 'pie'], hat: 'joker', decor: 'confetti' },
  may: { name: 'Открытие сезона', sky: ['#59C3FF', '#D6F3FF'], ground: ['#F6DFA6', '#E9C77B'], far: '#3AA8E0', good: ['ball', 'icecream', 'shell'], bad: ['crab'], jump: ['crab', 'rock'], hat: 'cap', decor: 'sun' },
  jun: { name: 'День рождения', sky: ['#FFD9A8', '#FFF6E0'], ground: ['#C7A6FF', '#A77BEF'], far: '#FFB3C7', good: ['cake', 'balloon', 'gold'], bad: ['pie'], jump: ['pie', 'rock'], hat: 'party', decor: 'confetti' },
  jul: { name: 'Игра на выживание', sky: ['#FF9A6B', '#FFE3B8'], ground: ['#C96F4A', '#A8553A'], far: '#E0825A', good: ['star', 'leaf'], bad: ['saw'], jump: ['saw', 'rock'], hat: 'band', decor: 'sun' },
  aug: { name: 'Проводы лета', sky: ['#FF8E6B', '#FFD9A0'], ground: ['#E9B872', '#C9944A'], far: '#D96A6A', good: ['fruit', 'shell', 'guitar'], bad: ['wasp'], jump: ['crab', 'rock'], hat: 'shades', decor: 'sunset' },
  sep: { name: 'Снова в школу', sky: ['#8FA3B8', '#D5DEE8'], ground: ['#6F7F8F', '#566575'], far: '#7A8CA0', good: ['coffee', 'leaf', 'bulb'], bad: ['drop'], jump: ['puddle', 'rock'], hat: 'umbrella', decor: 'rain' },
  oct: { name: 'Хэллоуин', sky: ['#1B1436', '#4B2A7B'], ground: ['#2B2140', '#1A1330'], far: '#2E2350', good: ['candy', 'pumpkin'], bad: ['ghost', 'bat'], jump: ['pumpkin', 'ghost'], hat: 'witch', decor: 'moon', dark: true },
  nov: { name: 'Чёрная пятница', sky: ['#15161C', '#34363F'], ground: ['#1E1E24', '#111'], far: '#2A2C34', good: ['tag', 'bag', 'gold'], bad: ['coal'], jump: ['bag', 'rock'], hat: 'tag', decor: 'moon', dark: true },
  dec: { name: 'Новый год', sky: ['#14335C', '#3E6FA8'], ground: ['#FFFFFF', '#DCEBF7'], far: '#2B4F80', good: ['mandarin', 'gift', 'snow'], bad: ['coal', 'icicle'], jump: ['drift', 'gift'], hat: 'santa', decor: 'snow', dark: true },
};
export const themeOf = () => { const k = new URLSearchParams(location.search).get('t'); return { key: THEMES[k] ? k : 'beach', ...(THEMES[k] || THEMES.beach) }; };

// ───── фон: небо, дальний план, земля и погода
export function scene(c, W, H, th, t, groundY) {
  const gy = groundY || H * 0.8;
  c.fillStyle = grad(c, 0, 0, 0, gy, th.sky[0], th.sky[1]); c.fillRect(0, 0, W, gy);
  if (th.decor === 'sun' || th.decor === 'sunset') { c.save(); c.translate(W * 0.8, th.decor === 'sunset' ? gy - 30 : 70); I.sun(c, th.decor === 'sunset' ? 46 : 30, t); c.restore(); }
  if (th.decor === 'moon') { el(c, W * 0.8, 70, 28, 28, '#FFF4C4'); el(c, W * 0.8 + 10, 62, 24, 24, th.sky[0]); for (let i = 0; i < 24; i++) el(c, (i * 97) % W, (i * 53) % (gy * 0.7), 1.2 + (i % 3) * 0.4, 1.2 + (i % 3) * 0.4, `rgba(255,255,255,${0.4 + 0.4 * Math.sin(t * 2 + i)})`); }
  if (!th.dark) for (let i = 0; i < 3; i++) { const x = ((i * 170 + t * (8 + i * 4)) % (W + 140)) - 70, y = 50 + i * 46; for (const [dx, r] of [[0, 20], [22, 26], [48, 18]]) el(c, x + dx, y, r, r * 0.62, 'rgba(255,255,255,.8)'); }
  c.fillStyle = th.far; c.beginPath(); c.moveTo(0, gy); for (let x = 0; x <= W; x += 20) c.lineTo(x, gy - 26 - Math.sin(x * 0.02 + 1) * 16 - Math.sin(x * 0.007) * 12); c.lineTo(W, gy); c.closePath(); c.globalAlpha = 0.7; c.fill(); c.globalAlpha = 1;
  c.fillStyle = grad(c, 0, gy, 0, H, th.ground[0], th.ground[1]); c.fillRect(0, gy, W, H - gy); c.fillStyle = 'rgba(0,0,0,.06)'; for (let i = 0; i < 26; i++) c.fillRect((i * 83) % W, gy + 8 + (i * 37) % Math.max(1, H - gy - 12), 7, 2.5);
  if (th.decor === 'snow') for (let i = 0; i < 34; i++) el(c, (i * 67 + Math.sin(t + i) * 14) % W, (i * 43 + t * (22 + i % 5 * 6)) % H, 1.6 + (i % 3) * 0.7, 1.6 + (i % 3) * 0.7, 'rgba(255,255,255,.85)');
  if (th.decor === 'rain') { c.strokeStyle = 'rgba(255,255,255,.4)'; c.lineWidth = 1.5; c.beginPath(); for (let i = 0; i < 40; i++) { const x = (i * 61 + t * 60) % W, y = (i * 47 + t * 420) % H; c.moveTo(x, y); c.lineTo(x - 3, y + 11); } c.stroke(); }
  if (th.decor === 'hearts') for (let i = 0; i < 9; i++) { c.save(); c.globalAlpha = 0.28; c.translate((i * 91) % W, gy - 40 - ((i * 57 + t * 14) % (gy - 60))); I.heart(c, 7 + i % 3 * 2); c.restore(); }
  if (th.decor === 'confetti') { const cols = ['#FF5E7E', '#FFD166', '#3A8EE6', '#7C4DFF', '#3DB96A']; for (let i = 0; i < 30; i++) { c.save(); c.translate((i * 59 + Math.sin(t * 2 + i) * 10) % W, (i * 41 + t * (30 + i % 4 * 9)) % gy); c.rotate(t * 2 + i); c.fillStyle = cols[i % 5]; c.globalAlpha = 0.75; c.fillRect(-3, -1.5, 6, 3); c.restore(); } }
}
// Искры при удаче и промахе
export function burst(list, x, y, col, n = 8) { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = 60 + Math.random() * 120; list.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, t: 0.5, col }); } }
export function sparks(c, list, dt) { for (let i = list.length - 1; i >= 0; i--) { const p = list[i]; p.t -= dt; if (p.t <= 0) { list.splice(i, 1); continue; } p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 300 * dt; c.globalAlpha = Math.min(1, p.t * 2); el(c, p.x, p.y, 3.2, 3.2, p.col); c.globalAlpha = 1; } }
export { rr, el, ln, grad };
