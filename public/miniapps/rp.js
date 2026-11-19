// «Нудищево РП»: маленькая жизнь в провинциальном городе. Работа, еда, сон, транспорт, а на юге — пляж: шезлонги, ракушки, волейбол и дежурство спасателя.
// Одиночная игра, прогресс хранится на устройстве.
import { ready, share, $, store, earn, toast } from '/miniapps/kit.js';
import { MI } from '/miniapps/mini-icons.js';
import { stage, loop, text, rnd, pick, clamp, dist, sticks, drawStick, axis, keys } from '/miniapps/game.js';
import { item } from '/miniapps/art.js';
const W = 360, H = 460, T = 40, N = 30, WORLD = T * N, NY = 36, WH = T * NY, BY = 30 * T, SY = 33 * T,      // город 30×30 клеток; ниже три ряда песка (с BY) и три ряда моря (с SY)
   cv = $('#cv'), { ctx, pos } = stage(cv, W, H), [mv] = sticks(cv, pos, [() => true]);
const road = i => i % 6 === 2, at = (tx, ty) => ({ x: tx * T + T / 2, y: ty * T + T / 2 });

// ───── Рисованные спрайты карты: тот же дуотон, что и у остальной графики. Эмодзи на поле нет.
const IN = '#173F2C', WHITE = '#FBF3E2', DK = '#2B2B33';
const RR = (c, x, y, w, h, r, fill) => { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.closePath(); c.fillStyle = fill; c.fill(); c.lineWidth = 1.8; c.strokeStyle = IN; c.lineJoin = 'round'; c.stroke(); };
const EL = (c, x, y, rx, ry, fill, stroke) => { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, 7); c.fillStyle = fill; c.fill(); if (stroke !== false) { c.lineWidth = 1.7; c.strokeStyle = IN; c.stroke(); } };
const LN = (c, pts, w, col) => { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.lineWidth = w; c.strokeStyle = col; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke(); };
const PL = (c, pts, fill) => { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); c.fillStyle = fill; c.fill(); c.lineWidth = 1.7; c.strokeStyle = IN; c.lineJoin = 'round'; c.stroke(); };
const SKINS = ['#F2C09A', '#E8A87C', '#C97B4A'];
const skinOf = k => SKINS['beard worker bikini ginger'.split(' ').includes(k) ? 1 : k === 'grandma meditate' ? 2 : 0];

// ── здания и достопримечательности (рисуются в точке p.x, p.y) ──
function building(c, kind, x, y, s) {
  c.save(); c.translate(x, y); c.lineJoin = 'round';
  const base = s * 0.9, w = s * 1.05;
  if (kind === 'home') { RR(c, -w, -base * 0.55, w * 2, base * 1.15, 2, '#C9553E'); c.fillStyle = IN; c.beginPath(); c.moveTo(-w - 4, -base * 0.5); c.lineTo(0, -base * 1.55); c.lineTo(w + 4, -base * 0.5); c.closePath(); c.fill(); PL(c, [-w - 4, -base * 0.5, 0, -base * 1.62, w + 4, -base * 0.5], '#8A5A3B'); RR(c, -s * 0.32, -base * 0.05, s * 0.64, base * 0.62, 2, '#5B4636'); }
  else if (kind === 'food') { RR(c, -w * 0.9, -base * 0.15, w * 1.8, base * 0.75, 2, '#FBF3E2'); for (let i = 0; i < 5; i++) PL(c, [(-w * 0.9) + i * (w * 1.8 / 5), -base * 0.15, (-w * 0.9) + (i + 0.5) * (w * 1.8 / 5), -base * 0.75, (-w * 0.9) + (i + 1) * (w * 1.8 / 5), -base * 0.15], i % 2 ? '#FBF3E2' : '#E0486B'); LN(c, [0, -base * 0.75, 0, -base * 1.35], 3, '#8A5A3B'); EL(c, 0, -base * 1.42, s * 0.3, s * 0.3, '#E9B872'); }   // шашлычная с вывеской
  else if (kind === 'post') { RR(c, -w, -base * 0.5, w * 2, base * 1.1, 2, '#3A6EA5'); PL(c, [-w - 3, -base * 0.45, 0, -base * 1.35, w + 3, -base * 0.45], '#2B5480'); RR(c, -s * 0.45, -base * 0.05, s * 0.9, base * 0.5, 2, '#D9A05B'); LN(c, [-s * 0.45, -base * 0.05, 0, base * 0.17, s * 0.45, -base * 0.05], 2, IN); }
  else if (kind === 'shop') { RR(c, -w, -base * 0.5, w * 2, base * 1.1, 2, '#6D4C8F'); PL(c, [-w - 3, -base * 0.45, 0, -base * 1.3, w + 3, -base * 0.45], '#4B2A7B'); RR(c, -w * 0.7, -base * 0.35, w * 1.4, base * 0.28, 2, '#FBF3E2'); PL(c, [-s * 0.5, -base * 0.1, -s * 0.2, base * 0.35, 0, base * 0.1, s * 0.2, base * 0.35, s * 0.5, -base * 0.1], '#7BE0A8'); }
  else if (kind === 'plant') { c.fillStyle = '#9AA5B1'; c.beginPath(); c.moveTo(-w, base * 0.6); c.lineTo(-w, -base * 0.6); c.lineTo(-w * 0.55, -base * 0.1); c.lineTo(-w * 0.1, -base * 0.6); c.lineTo(w * 0.35, -base * 0.1); c.lineTo(w * 0.8, -base * 0.6); c.lineTo(w, -base * 0.6); c.lineTo(w, base * 0.6); c.closePath(); c.fill(); c.lineWidth = 1.8; c.strokeStyle = IN; c.stroke(); RR(c, w * 0.42, -base * 1.45, s * 0.34, base * 0.95, 1.5, '#6B7280'); EL(c, w * 0.6, -base * 1.55, s * 0.32, s * 0.12, '#C9CED6'); }
  else if (kind === 'cars') { RR(c, -w * 1.15, -base * 0.42, w * 2.3, base * 0.95, 3, '#E9EDF2'); RR(c, -w * 0.8, -base * 0.32, w * 1.6, base * 0.38, 2, '#BFE3F2'); car(c, 'car', 0, base * 0.28, s * 0.62, false); }
  else if (kind === 'hosp') { RR(c, -w, -base * 0.5, w * 2, base * 1.1, 2, '#FBF3E2'); PL(c, [-w - 3, -base * 0.45, 0, -base * 1.3, w + 3, -base * 0.45], '#DDE1EA'); EL(c, 0, -base * 0.12, s * 0.5, s * 0.5, '#FBF3E2'); c.strokeStyle = '#E0486B'; c.lineWidth = s * 0.2; LN(c, [0, -base * 0.32, 0, base * 0.08], s * 0.2, '#E0486B'); LN(c, [-s * 0.2, -base * 0.12, s * 0.2, -base * 0.12], s * 0.2, '#E0486B'); }
  else if (kind === 'tan') { LN(c, [-w, base * 0.55, w, base * 0.55], 3.4, '#8A5A3B'); PL(c, [-w * 0.75, base * 0.55, -w * 0.2, -base * 0.75, s * 0.1, base * 0.55], '#3DB96A'); LN(c, [w * 0.35, -base * 0.3, w * 0.35, -base * 1.15], 2.6, '#8A5A3B'); EL(c, w * 0.35, -base * 1.3, s * 0.26, s * 0.26, '#FFD166'); }
  else if (kind === 'ice') { PL(c, [-s * 0.5, 0, s * 0.5, 0, 0, base * 0.85], '#E9B872'); EL(c, 0, -base * 0.32, s * 0.52, s * 0.44, '#FFB3C7'); EL(c, 0, -base * 0.72, s * 0.34, s * 0.28, '#FFF1B8'); EL(c, 0, -base * 0.98, s * 0.1, s * 0.1, '#E0244F', false); }
  else if (kind === 'guard') { LN(c, [0, base * 0.6, 0, -base * 1.05], 3, '#8A5A3B'); lifeRing(c, 0, -base * 1.28, s * 0.42, 0); }
  else if (kind === 'volley') { LN(c, [-w, base * 0.6, w, base * 0.6], 3, '#8A5A3B'); LN(c, [0, base * 0.6, 0, -base * 0.75], 2, '#8A5A3B'); LN(c, [0, -base * 0.72, -w * 0.75, -base * 0.2], 2, '#8A5A3B'); LN(c, [0, -base * 0.72, w * 0.75, -base * 0.2], 2, '#8A5A3B'); EL(c, 0, -base * 0.42, s * 0.28, s * 0.28, '#FBF3E2'); c.beginPath(); c.arc(0, -base * 0.42, s * 0.28, 0.3, Math.PI - 0.3); c.strokeStyle = '#3A8EE6'; c.lineWidth = 2.4; c.stroke(); }
  else if (kind === 'block') { RR(c, -w * 0.8, -base * 1.5, w * 1.6, base * 2.1, 2, '#8A8F9C'); for (let r = 0; r < 4; r++) for (let col = 0; col < 3; col++) RR(c, -w * 0.58 + col * w * 0.52, -base * 1.28 + r * base * 0.46, w * 0.3, base * 0.24, 1, '#FFE9A8'); }
  else if (kind === 'highrise') { RR(c, -w * 0.7, -base * 1.75, w * 1.4, base * 2.35, 2, '#5D6B7A'); for (let r = 0; r < 5; r++) for (let col = 0; col < 2; col++) RR(c, -w * 0.45 + col * w * 0.5, -base * 1.52 + r * base * 0.4, w * 0.28, base * 0.2, 1, '#BFE3F2'); }
  else if (kind === 'ruin') { PL(c, [-w, base * 0.6, -w, -base * 0.4, -w * 0.35, base * 0.05, w * 0.1, -base * 0.62, w * 0.6, -base * 0.1, w, base * 0.05, w, base * 0.6], '#4A3F33'); RR(c, -s * 0.3, -base * 0.05, s * 0.6, base * 0.52, 1.5, '#241E16'); }
  else { RR(c, -w * 0.9, -base * 0.32, w * 1.8, base * 0.92, 2, '#B5483B'); PL(c, [-w - 3, -base * 0.28, 0, -base * 1.15, w + 3, -base * 0.28], '#7A3A2A'); RR(c, -s * 0.3, base * 0.02, s * 0.6, base * 0.4, 1.5, '#3A2A1A'); EL(c, w * 0.55, base * 0.42, s * 0.16, s * 0.12, '#FF8FB1'); EL(c, -w * 0.6, base * 0.4, s * 0.13, s * 0.1, '#FF8FB1'); }   // cottage
  c.restore();
}
// ── транспорт: вид сбоку, едет в обе стороны ──
function car(c, kind, x, y, s, flip) {
  c.save(); c.translate(x, y); if (flip) c.scale(-1, 1);
  const B = (w, h, col) => RR(c, -s * w, -s * h, s * w * 2, s * h * 2, s * 0.28, col);
  const wheels = dy => { EL(c, -s * 0.62, s * dy, s * 0.3, s * 0.3, DK, false); EL(c, s * 0.62, s * dy, s * 0.3, s * 0.3, DK, false); EL(c, -s * 0.62, s * dy, s * 0.12, s * 0.12, '#8A8F9C', false); EL(c, s * 0.62, s * dy, s * 0.12, s * 0.12, '#8A8F9C', false); };
  if (kind === 'bus') { B(1.15, 0.42, '#E0A800'); RR(c, -s * 1.0, -s * 0.3, s * 2.0, s * 0.36, s * 0.08, '#FBF3E2'); LN(c, [-s * 0.35, -s * 0.48, -s * 0.35, s * 0.3], 1.4, IN); LN(c, [s * 0.35, -s * 0.48, s * 0.35, s * 0.3], 1.4, IN); wheels(0.52); }
  else if (kind === 'taxi') { B(0.98, 0.34, '#FFD23F'); RR(c, -s * 0.55, -s * 0.62, s * 1.1, s * 0.22, s * 0.09, '#FFD23F'); RR(c, -s * 0.28, -s * 0.72, s * 0.56, s * 0.14, 1, '#2B2B33'); wheels(0.42); }
  else if (kind === 'truck') { RR(c, -s * 1.1, -s * 0.6, s * 1.35, s * 1.2, 1.5, '#D9A05B'); RR(c, s * 0.32, -s * 0.28, s * 0.78, s * 0.88, 2, '#C9553E'); RR(c, s * 0.42, -s * 0.14, s * 0.4, s * 0.3, 1.5, '#BFE3F2'); wheels(0.55); }
  else if (kind === 'race') { PL(c, [-s * 1.15, s * 0.35, -s * 0.75, -s * 0.25, s * 0.45, -s * 0.25, s * 1.15, s * 0.1, s * 1.15, s * 0.38], '#E0704F'); PL(c, [s * 1.0, -s * 0.42, s * 1.45, -s * 0.42, s * 1.3, s * 0.02], DK); EL(c, -s * 0.68, s * 0.42, s * 0.28, s * 0.28, DK, false); EL(c, s * 0.68, s * 0.42, s * 0.28, s * 0.28, DK, false); }
  else if (kind === 'scooter') { EL(c, -s * 0.7, s * 0.5, s * 0.27, s * 0.27, DK, false); EL(c, s * 0.72, s * 0.5, s * 0.27, s * 0.27, DK, false); LN(c, [-s * 0.7, s * 0.5, -s * 0.1, s * 0.5, s * 0.28, -s * 0.45], 2.6, '#2B6CB0'); LN(c, [s * 0.28, -s * 0.45, s * 0.62, -s * 0.45], 2.2, IN); LN(c, [s * 0.72, s * 0.5, s * 0.55, -s * 0.25], 2.4, '#2B6CB0'); }
  else { B(1.0, 0.36, '#3A8EE6'); RR(c, -s * 0.52, -s * 0.66, s * 1.04, s * 0.3, s * 0.12, '#2B6CB0'); RR(c, -s * 0.4, -s * 0.58, s * 0.8, s * 0.2, 1.5, '#BFE3F2'); wheels(0.44); }
  c.restore();
}
// ── люди: рост s, у всех своё лицо и одежда ──
const PEOPLE = {
  grandma: { skin: 2, hair: '#D8D8E0', bun: 1, top: '#7A6A8F', dress: 1 }, beard: { skin: 1, hair: '#4A3B2A', beard: 1, top: '#4A5568' }, worker: { skin: 0, hair: '#2B2B33', helmet: '#F28C1A', top: '#F2C14E' }, grey: { skin: 0, hair: '#E8E8EC', puffs: 1, top: '#5B7F8F' }, ginger: { skin: 0, hair: '#C9553E', long: 1, top: '#E0486B', dress: 1 }, student: { skin: 1, hair: '#1E1E24', cap: '#1E1E24', top: '#1E1E24' },
  bonnet: { skin: 0, hair: '#A93226', bonnet: '#FBF3E2', top: '#FBF3E2' }, polo: { skin: 1, hair: '#1E1E24', capSwim: '#3A8EE6', top: '#3A8EE6' }, meditate: { skin: 2, hair: '#2B2B33', top: '#E0704F', sit: 1 }, bikini: { skin: 1, hair: '#2B2B33', top: '#FF8FB1', bikini: 1 }, shorts: { skin: 2, hair: '#2B2B33', top: '#FBF3E2', shorts: '#2B6CB0' }, cook: { skin: 0, hair: '#2B2B33', toque: 1, top: '#FBF3E2' },
  me: { skin: 0, hair: '#3DB96A', top: '#3DB96A' }, meSwim: { skin: 0, hair: '#3DB96A', top: '#3DB96A' }, wave: { skin: 0, hair: '#2B2B33', top: '#E0486B' },
};
function person(c, kind, x, y, s, t) {
  const P = PEOPLE[kind] || PEOPLE.me; const skin = SKINS[P.skin];
  c.save(); c.translate(x, y);
  const bob = Math.sin((t || 0) * 6 + x) * s * 0.05;
  c.translate(0, bob);
  if (P.sit) { PL(c, [-s * 1.05, s * 0.42, s * 1.05, s * 0.42, s * 0.6, s * 0.02, -s * 0.6, s * 0.02], P.top); EL(c, -s * 0.62, s * 0.42, s * 0.34, s * 0.17, skin); EL(c, s * 0.62, s * 0.42, s * 0.34, s * 0.17, skin); }   // скрестив ноги
  else { const dress = P.dress || P.bikini; PL(c, [-s * (dress ? 0.78 : 0.52), s * 0.95, s * (dress ? 0.78 : 0.52), s * 0.95, s * 0.42, s * 0.02, -s * 0.42, s * 0.02], P.top); EL(c, -s * 0.34, s * 0.92, s * 0.17, s * 0.13, skin); EL(c, s * 0.34, s * 0.92, s * 0.17, s * 0.13, skin); if (P.shorts) { PL(c, [-s * 0.5, s * 0.5, s * 0.5, s * 0.5, s * 0.44, s * 0.95, -s * 0.44, s * 0.95], P.shorts); } if (P.bikini) { PL(c, [-s * 0.4, s * 0.1, s * 0.4, s * 0.1, 0, s * 0.5], '#E0486B'); } }
  // руки
  const armUp = kind === 'wave' ? Math.sin((t || 0) * 9) * s * 0.14 : 0;
  LN(c, [-s * 0.42, s * 0.05, -s * 0.78, s * (kind === 'swimmer' ? 0.32 : 0.42)], s * 0.15, skin);
  if (kind === 'wave') LN(c, [s * 0.42, s * 0.05, s * 0.7, -s * 0.62 + armUp], s * 0.15, skin); else LN(c, [s * 0.42, s * 0.05, s * 0.78, s * 0.42], s * 0.15, skin);
  // голова
  EL(c, 0, -s * 0.38, s * 0.42, s * 0.42, skin);
  // причёска/головной убор
  if (P.hair && !P.cap && !P.helmet && !P.toque && !P.bon && !P.bonnet) { if (P.bun) { EL(c, 0, -s * 0.78, s * 0.18, s * 0.18, P.hair); c.beginPath(); c.arc(0, -s * 0.42, s * 0.43, Math.PI * 1.05, Math.PI * 1.95); c.fillStyle = P.hair; c.fill(); } else if (P.puffs) { EL(c, -s * 0.4, -s * 0.52, s * 0.15, s * 0.15, P.hair); EL(c, s * 0.4, -s * 0.52, s * 0.15, s * 0.15, P.hair); } else if (P.long) { EL(c, -s * 0.36, -s * 0.28, s * 0.13, s * 0.3, P.hair); EL(c, s * 0.36, -s * 0.28, s * 0.13, s * 0.3, P.hair); c.beginPath(); c.arc(0, -s * 0.42, s * 0.43, Math.PI, 0); c.fillStyle = P.hair; c.fill(); } else { c.beginPath(); c.arc(0, -s * 0.42, s * 0.43, Math.PI, 0); c.fillStyle = P.hair; c.fill(); } }
  if (P.beard) { c.beginPath(); c.arc(0, -s * 0.16, s * 0.32, 0.15 * Math.PI, 0.85 * Math.PI); c.fillStyle = P.hair; c.fill(); }
  if (P.helmet) { c.beginPath(); c.arc(0, -s * 0.4, s * 0.47, Math.PI, 0); c.fillStyle = P.helmet; c.fill(); c.lineWidth = 1.6; c.strokeStyle = IN; c.stroke(); LN(c, [-s * 0.47, -s * 0.4, s * 0.47, -s * 0.4], 2, IN); }
  if (P.capSwim) { c.beginPath(); c.arc(0, -s * 0.4, s * 0.44, Math.PI, 0); c.fillStyle = P.capSwim; c.fill(); LN(c, [-s * 0.44, -s * 0.4, s * 0.44, -s * 0.4], 2.2, '#1F63B5'); }
  if (P.bonnet) { c.beginPath(); c.arc(0, -s * 0.42, s * 0.48, Math.PI * 1.02, -0.02 * Math.PI); c.fillStyle = P.bonnet; c.fill(); c.lineWidth = 1.6; c.strokeStyle = IN; c.stroke(); }
  if (P.cap) { PL(c, [-s * 0.45, -s * 0.52, s * 0.45, -s * 0.52, 0, -s * 0.95], P.cap); }
  if (P.toque) { RR(c, -s * 0.32, -s * 1.02, s * 0.64, s * 0.42, s * 0.14, P.toque); RR(c, -s * 0.38, -s * 0.64, s * 0.76, s * 0.14, s * 0.06, P.toque); }
  // глаза
  EL(c, -s * 0.16, -s * 0.36, s * 0.045, s * 0.055, IN, false); EL(c, s * 0.16, -s * 0.36, s * 0.045, s * 0.055, IN, false);
  c.restore();
}
function swimPose(c, x, y, s, t) {
  c.save(); c.translate(x, y + Math.sin(t * 3.4) * s * 0.08);
  c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 1.6;
  for (const dx of [-s * 0.75, s * 0.75]) { c.beginPath(); c.arc(dx, s * 0.35, s * 0.4, Math.PI * 1.15, Math.PI * 1.85); c.stroke(); }
  EL(c, -s * 0.3, s * 0.28, s * 0.2, s * 0.13, SKINS[0]); EL(c, s * 0.34, s * 0.28, s * 0.2, s * 0.13, SKINS[0]);
  EL(c, 0, -s * 0.05, s * 0.4, s * 0.36, SKINS[0]);
  c.beginPath(); c.arc(0, -s * 0.09, s * 0.41, Math.PI, 0); c.fillStyle = '#3DB96A'; c.fill();
  EL(c, -s * 0.14, -s * 0.1, s * 0.04, s * 0.05, IN, false); EL(c, s * 0.14, -s * 0.1, s * 0.04, s * 0.05, IN, false);
  c.restore();
}
function tree(c, x, y, s, conifer) {
  c.save(); c.translate(x, y);
  LN(c, [0, s * 0.9, 0, s * 0.15], s * 0.26, '#6B4A2B');
  if (conifer) { PL(c, [0, -s, -s * 0.72, s * 0.05, s * 0.72, s * 0.05], '#2E7D46'); PL(c, [0, -s * 0.55, -s * 0.85, s * 0.42, s * 0.85, s * 0.42], '#256B3B'); }
  else { EL(c, 0, -s * 0.4, s * 0.78, s * 0.68, '#3DB96A'); EL(c, -s * 0.5, s * 0.05, s * 0.4, s * 0.35, '#2E9E57'); EL(c, s * 0.5, s * 0.05, s * 0.4, s * 0.35, '#2E9E57'); }
  c.restore();
}
function coral(c, x, y, s) {
  c.save(); c.translate(x, y);
  LN(c, [0, s * 0.75, 0, -s * 0.7], s * 0.3, '#FF8A6B'); LN(c, [-s * 0.45, s * 0.75, -s * 0.45, -s * 0.15], s * 0.22, '#FF6B4A'); LN(c, [s * 0.45, s * 0.75, s * 0.45, -s * 0.25], s * 0.22, '#FF6B4A');
  LN(c, [-s * 0.45, -s * 0.12, -s * 0.85, -s * 0.55], s * 0.16, '#FF6B4A'); LN(c, [s * 0.45, -s * 0.22, s * 0.85, -s * 0.62], s * 0.16, '#FF6B4A'); LN(c, [0, -s * 0.66, -s * 0.35, -s * 1.0], s * 0.15, '#FF8A6B'); LN(c, [0, -s * 0.66, s * 0.35, -s * 1.0], s * 0.15, '#FF8A6B');
  c.restore();
}
function lifeRing(c, x, y, s, t) {
  c.save(); c.translate(x, y + Math.sin((t || 0) * 5) * s * 0.12); c.rotate(Math.sin((t || 0) * 2.4) * 0.18);
  EL(c, 0, 0, s * 0.85, s * 0.85, '#E0486B'); EL(c, 0, 0, s * 0.4, s * 0.4, '#339fd8', false);
  for (let i = 0; i < 4; i++) { c.save(); c.rotate(i * Math.PI / 2 + Math.PI / 4); PL(c, [-s * 0.18, -s * 0.86, s * 0.18, -s * 0.86, s * 0.3, -s * 0.42, -s * 0.3, -s * 0.42], WHITE); c.restore(); }
  c.restore();
}
function hatDraw(c, kind, x, y, s) {
  c.save(); c.translate(x, y);
  if (kind === 'cap') { c.beginPath(); c.arc(0, 0, s * 0.82, Math.PI, 0); c.fillStyle = '#3A8EE6'; c.fill(); c.lineWidth = 1.4; c.strokeStyle = IN; c.stroke(); RR(c, -s * 0.15, -s * 0.14, s * 1.15, s * 0.3, s * 0.14, '#2B6CB0'); }
  else if (kind === 'top') { RR(c, -s * 0.52, -s * 1.15, s * 1.04, s * 1.15, s * 0.1, '#1E1E24'); LN(c, [-s * 0.95, 0, s * 0.95, 0], s * 0.17, '#1E1E24'); LN(c, [-s * 0.52, -s * 0.35, s * 0.52, -s * 0.35], s * 0.16, '#F2C14E'); }
  else if (kind === 'helmet') { c.beginPath(); c.arc(0, 0, s * 0.82, Math.PI, 0); c.fillStyle = '#6B7A3A'; c.fill(); c.lineWidth = 1.4; c.strokeStyle = IN; c.stroke(); LN(c, [-s * 0.82, 0, s * 0.82, 0], s * 0.15, IN); }
  else if (kind === 'crown') { PL(c, [-s * 0.75, 0, -s * 0.88, -s * 0.95, -s * 0.36, -s * 0.4, 0, -s * 1.15, s * 0.36, -s * 0.4, s * 0.88, -s * 0.95, s * 0.75, 0], '#F2C14E'); EL(c, 0, -s * 0.32, s * 0.14, s * 0.14, '#E0486B', false); }
  c.restore();
}
const POI = [
  { id: 'home', art: 'home', n: 'Дом', ...at(10, 9) }, { id: 'food', art: 'food', n: 'Шаурма', ...at(13, 9) }, { id: 'post', art: 'post', n: 'Почта', ...at(10, 13) }, { id: 'shop', art: 'shop', n: 'Секонд-хенд', ...at(13, 13) },
  { id: 'plant', art: 'plant', n: 'Завод', ...at(16, 7) }, { id: 'cars', art: 'cars', n: 'Автосалон', ...at(17, 9) }, { id: 'hosp', art: 'hosp', n: 'Больница', ...at(7, 10) },
  { id: 'tan', art: 'tan', n: 'Шезлонг', ...at(7, 31) }, { id: 'ice', art: 'ice', n: 'Мороженое', ...at(11, 30) }, { id: 'guard', art: 'guard', n: 'Спасатели', ...at(16, 31) }, { id: 'volley', art: 'volley', n: 'Волейбол', ...at(22, 31) },
];
const ADDR = [['ул. Ленина, 1', 4, 3], ['пер. Голый, 7', 22, 3], ['ул. Банная, 12', 25, 9], ['пр. Листопадный, 3', 4, 15], ['ул. Пляжная, 40', 22, 15], ['Гаражи', 16, 21], ['Общага №2', 10, 21], ['Дача тёщи', 4, 25], ['ул. Комариная, 5', 25, 21], ['Рынок', 21, 13], ['ул. Веничная, 9', 3, 7], ['Конечная', 27, 27]].map(([n, x, y], i) => ({ id: 'a' + i, addr: true, art: pick(['block', 'ruin', 'cottage', 'highrise']), n, ...at(x, y) }));
const PLACES = [...POI, ...ADDR], RIDES = [{ n: 'Пешком', art: '', sp: 85, cost: 0 }, { n: 'Самокат', art: 'scooter', sp: 135, cost: 1500 }, { n: '«Жигули»', art: 'car', sp: 190, cost: 7000 }, { n: '«Бэха»', art: 'race', sp: 250, cost: 30000 }], HATS = ['', 'cap', 'top', 'helmet', 'crown'], HATMI = ['', 'cap', 'tophat', 'helmet', 'crown'];
const SAY = ['Слышь, семки есть?', 'Молодой человек, вы за кем занимали?', 'Когда уже дорогу починят…', 'А раньше шаурма была по сорок.', 'Э, братишка, дай позвонить.', 'Маршрутку не видел? Полчаса жду.', 'Чё без шапки? Простудишься.', 'В наше время по газонам не ходили!'];
const BSAY = ['Молодой человек, вы мне солнце загораживаете.', 'Кукуруза! Горячая кукуруза!', 'Вода — парное молоко. Градусов двенадцать.', 'Чурчхела, пахлава, раки!', 'Тут все свои: шапки в гардероб.', 'Кто последний на банан?', 'Мужчина, уберите машину с полотенца.'];
const palm = (x, y) => y >= 30 && y < 33 && (x * 5 + y * 11) % 7 === 0 && !PLACES.some(p => Math.abs(p.x - (x * T + 20)) < T && Math.abs(p.y - (y * T + 20)) < T);
const isTree = (x, y) => y < 30 && !road(x) && !road(y) && (x * 7 + y * 13 + x * y) % 9 === 0 && !PLACES.some(p => Math.abs(p.x - (x * T + 20)) < T && Math.abs(p.y - (y * T + 20)) < T);
let G = null, S = null, saveT = 0;
const fresh = () => ({ money: 300, food: 80, en: 90, xp: 0, ride: 0, hat: 0, hats: [0], jobs: 0, x: at(11, 10).x, y: at(11, 10).y });
function reset(wipe) {
  S = wipe ? fresh() : { ...fresh(), ...store.get('rp.save', {}) }; if (!Array.isArray(S.hats)) S.hats = [0];
  G = { cars: [], folk: [], shells: [], quest: null, rescue: null, work: 0, vol: 0, tanCd: 0, shellT: 0, seen: false, safe: 2, msg: '', msgT: 0, tick: 0 };
  for (let i = 0; i < 9; i++) { const h = Math.random() < .5; G.cars.push({ h, kind: pick(['bus', 'taxi', 'car', 'truck']), line: pick([2, 8, 14, 20, 26]) * T + T / 2 + (Math.random() < .5 ? -8 : 8), p: rnd(0, WORLD), sp: rnd(90, 150) * (Math.random() < .5 ? 1 : -1) }); }
  for (let i = 0; i < 7; i++) G.folk.push({ x: rnd(8, 20) * T, y: rnd(6, 16) * T, tx: 0, ty: 0, t: 0, kind: pick(['grandma', 'beard', 'worker', 'grey', 'ginger', 'student']), say: pick(SAY) });
  for (let i = 0; i < 5; i++) G.folk.push({ beach: true, x: rnd(2, 28) * T, y: BY + rnd(20, 100), tx: 0, ty: 0, t: 0, kind: pick(['bonnet', 'polo', 'meditate', 'bikini', 'shorts', 'cook']), say: pick(BSAY) });
  for (let i = 0; i < 4; i++) shell();
  window.__g = G; window.__s = S; hud();
}
// Ракушки на песке: подобрал — сдал в сувенирную лавку. Иногда вместо ракушки попадается краб.
function shell() { if (G.shells.length < 6) G.shells.push({ x: rnd(30, WORLD - 30), y: BY + rnd(16, 108), kind: Math.random() < .18 ? 'crab' : pick(['shell', 'shell', 'coral', 'star']) }); }
const onBeach = () => S.y > BY, swim = () => S.y > SY + 4;
const lvl = () => 1 + Math.floor(S.xp / 100), pay = n => Math.round(n * (1 + (lvl() - 1) * .1)), tired = () => S.food <= 0 || S.en <= 0;
const tell = (t, s = 2.4) => { G.msg = t; G.msgT = s; };
function hud() { $('#money').textContent = S.money; $('#food').textContent = Math.round(S.food); $('#en').textContent = Math.round(S.en); $('#lvl').textContent = lvl(); }
function save() { store.set('rp.save', S); }
const near = () => { let b = null, bd = 46; for (const p of PLACES) { const d = dist(S, p); if (d < bd) { bd = d; b = p; } } return b; };
// Что предлагает кнопка действия рядом со зданием: [надпись, что сделать]
function action() {
  if (G.work > 0) return [`${MI.nut} Крутить гайку (осталось ${G.work})`, () => { G.work--; if (!G.work) { const m = pay(350); S.money += m; S.xp += 12; S.en = Math.max(0, S.en - 25); S.food = Math.max(0, S.food - 10); S.jobs++; earn('job'); tell(`Смена закрыта: +${m} ₽`); save(); } }];
  if (G.vol > 0) return [`${MI.ball} Отбить мяч (осталось ${G.vol})`, () => { G.vol--; if (!G.vol) { S.xp += 20; S.en = Math.max(0, S.en - 12); S.games = (S.games || 0) + 1; tell(pick(['Партия! +20 опыта. Пляж вас уважает.', 'Победный удар прямо в чей-то арбуз. +20 опыта.'])); save(); } }];
  const p = near(); if (!p) return null;
  if (G.quest && p.id === G.quest.to.id) return [`${MI.parcel} Отдать посылку: ${p.n}`, () => { const m = pay(G.quest.pay); S.money += m; S.xp += 15; S.en = Math.max(0, S.en - 10); S.jobs++; G.quest = null; earn('job'); tell(`Посылка доставлена: +${m} ₽`); save(); }];
  switch (p.id) {
    case 'home': return [`${MI.moon} Поспать`, () => { S.en = 100; S.food = Math.max(0, S.food - 15); tell('Выспались. Энергия на максимуме.'); save(); }];
    case 'food': return [`${MI.shawarma} Шаурма — 150 ₽`, () => { if (S.money < 150) return tell('На шаурму не хватает. Идите работать.'); S.money -= 150; S.food = Math.min(100, S.food + 60); tell(pick(['Шаурма огонь. Сытость +60.', 'В лаваше что-то мяукнуло, но вкусно.'])); save(); }];
    case 'post': return G.quest ? [`${MI.parcel} Посылка уже у вас: ${G.quest.to.n}`, () => tell('Сначала отнесите эту: ' + G.quest.to.n)] : [`${MI.parcel} Взять посылку`, () => { if (tired()) return tell('Сил нет. Поешьте и поспите.'); const to = pick(ADDR); G.quest = { to, pay: 220 + Math.round(dist(p, to) / 4) }; tell(`Несите на адрес: ${to.n}. Стрелка покажет дорогу.`, 3.5); }];
    case 'plant': return [`${MI.factory} Смена на заводе`, () => { if (tired()) return tell('Сил нет. Поешьте и поспите.'); if (S.en < 25) return tell('На смену нужно 25 энергии. Поспите дома.'); G.work = 12; tell('Закрутите 12 гаек: жмите кнопку.'); }];
    case 'cars': { const n = RIDES[S.ride + 1]; return n ? [`${MI[n.art]} ${n.n} — ${n.cost} ₽`, () => { if (S.money < n.cost) return tell(`Не хватает ${n.cost - S.money} ₽. Копите.`); S.money -= n.cost; S.ride++; tell(`Теперь у вас ${n.n}. Скорость выросла.`); save(); }] : [`${MI.race} Лучше «бэхи» тут нет`, () => tell('Вы и так король района.')]; }
    case 'shop': { const i = HATS.findIndex((h, k) => k > 0 && !S.hats.includes(k)); return i > 0 ? [`${MI[HATMI[i]]} Обновка — 500 ₽`, () => { if (S.money < 500) return tell('На обновку не хватает.'); S.money -= 500; S.hats.push(i); S.hat = i; tell('Модный приговор: одобрено.'); save(); }] : [`${MI.tshirt} Сменить шапку`, () => { S.hat = S.hats[(S.hats.indexOf(S.hat) + 1) % S.hats.length]; save(); }]; }
    case 'tan': return [`${MI.lounger} Позагорать`, () => { if (G.tanCd > 0) return tell(`Вы и так как рак. Остыньте ещё ${Math.ceil(G.tanCd)} с.`); G.tanCd = 45; S.en = Math.min(100, S.en + 35); S.food = Math.max(0, S.food - 8); S.tan = (S.tan || 0) + 1; tell(pick(['Загорели со всех сторон. Энергия +35.', 'Солнце, песок и ни одной гайки. Энергия +35.'])); save(); }];
    case 'ice': return [`${MI.icecream} Мороженое — 80 ₽`, () => { if (S.money < 80) return tell('На мороженое не хватает. Соберите ракушки.'); S.money -= 80; S.food = Math.min(100, S.food + 25); tell(pick(['Пломбир как в детстве. Сытость +25.', 'Капнуло на живот. Сытость +25.'])); save(); }];
    case 'guard': return G.rescue ? [`${MI.sos} Плывите к тонущему!`, () => tell('Стрелка показывает, куда плыть.')] : [`${MI.lifeRing} Дежурство спасателя`, () => { if (tired()) return tell('Сил нет. Мороженое и шезлонг — рядом.'); if (S.en < 20) return tell('На дежурство нужно 20 энергии. Позагорайте.'); G.rescue = { x: clamp(S.x + rnd(-260, 260), 40, WORLD - 40), y: SY + rnd(46, 100), t: 30 }; tell('Кто-то тонет! Плывите к кругу — стрелка покажет.', 3.5); }];
    case 'volley': return [`${MI.ball} Сыграть в волейбол`, () => { if (tired()) return tell('Сил нет даже на подачу.'); G.vol = 8; tell('Отбейте 8 мячей: жмите кнопку.'); }];
    case 'hosp': return [`${MI.cross} Подлечиться — 100 ₽`, () => { if (S.money < 100) return tell('Бесплатно только зелёнка.'); S.money -= 100; S.en = Math.min(100, S.en + 40); tell('Капельница бодрит. Энергия +40.'); save(); }];
    default: return [`${MI.door} ${p.n}: постучать`, () => tell(pick(['Никого нет дома.', '«Мы ничего не заказывали!»', 'За дверью лает собака.']))];
  }
}
let actFn = null;
function step(dt) {
  if (G && $('#ov').hidden) {
    const k = axis(); let dx = mv.x + k.x, dy = mv.y + k.y; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
    if (G.work > 0 && l > .3) { G.work = 0; tell('Ушли со смены. Гайки обиделись.'); }
    if (G.vol > 0 && l > .3) { G.vol = 0; tell('Ушли с площадки. Мяч улетел в море.'); }
    // на пляж — босиком: машина остаётся у бордюра, в море плывём медленно
    const sp = (swim() ? 60 : onBeach() ? 95 : RIDES[S.ride].sp) * (tired() ? .5 : 1); S.x = clamp(S.x + dx * sp * dt, 12, WORLD - 12); S.y = clamp(S.y + dy * sp * dt, 12, WH - 12);
    if (onBeach() && !G.seen) { G.seen = true; tell('Пляж Нудищево. Шапки и машины — в гардероб.', 3.2); }
    if (swim()) S.en = Math.max(0, S.en - dt / 3);      // плавать утомительно
    G.tanCd -= dt; G.shellT += dt; if (G.shellT > 7) { G.shellT = 0; shell(); }
    for (const sh of G.shells) if (Math.hypot(sh.x - S.x, sh.y - S.y) < 18) { G.shells.splice(G.shells.indexOf(sh), 1); if (sh.kind === 'crab') { S.en = Math.max(0, S.en - 5); tell('Краб ущипнул за пятку: −5 энергии.'); } else { const m = Math.round(rnd(15, 45)); S.money += m; S.shells = (S.shells || 0) + 1; tell(`Ракушка: +${m} ₽ в сувенирной лавке.`); } hud(); save(); break; }
    if (G.rescue) { G.rescue.t -= dt;
      if (Math.hypot(G.rescue.x - S.x, G.rescue.y - S.y) < 24) { const m = pay(300); S.money += m; S.xp += 18; S.en = Math.max(0, S.en - 15); S.jobs++; S.saved = (S.saved || 0) + 1; G.rescue = null; earn('job'); tell(`Спасли! +${m} ₽ и уважение всего пляжа.`, 3); hud(); save(); }
      else if (G.rescue.t <= 0) { G.rescue = null; tell('Не успели: его вытащил дядя на «банане». Без премии.', 3); } }
    G.tick += dt; if (G.tick >= 1) { G.tick = 0; S.food = Math.max(0, S.food - 1 / 7); S.en = Math.max(0, S.en - 1 / 9); if (tired() && G.msgT <= 0) tell(S.food <= 0 ? 'Вы голодны: еле идёте. Нужна шаурма.' : 'Сил нет: еле идёте. Домой, спать.'); hud(); }
    G.safe -= dt; G.msgT -= dt;
    for (const c of G.cars) { c.p += c.sp * dt; if (c.p > WORLD + (c.h ? 40 : -14)) c.p = -40; if (c.p < -40) c.p = WORLD + (c.h ? 40 : -14); /* дороги кончаются у пляжа: на песок машины не выезжают */ const cx = c.h ? c.p : c.line, cy = c.h ? c.line : c.p;
      if (G.safe <= 0 && Math.hypot(cx - S.x, cy - S.y) < 19) { const fee = Math.min(S.money, 300), h = PLACES.find(p => p.id === 'hosp'); S.money -= fee; S.x = h.x + 30; S.y = h.y + 34; S.en = Math.max(20, S.en - 20); G.safe = 3; G.work = 0; tell(`Вас сбила маршрутка. Больница: −${fee} ₽.`, 3.5); save(); } }
    for (const f of G.folk) { f.t -= dt; if (f.t <= 0) { f.t = rnd(2, 5); const a = rnd(0, 6.28); f.tx = Math.cos(a) * 22; f.ty = Math.sin(a) * 22; if (Math.random() < .3) f.tx = f.ty = 0; } f.x = clamp(f.x + f.tx * dt, 20, WORLD - 20); f.y = f.beach ? clamp(f.y + f.ty * dt, BY + 14, SY - 10) : clamp(f.y + f.ty * dt, 20, WORLD - 20); }
    saveT += dt; if (saveT > 5) { saveT = 0; save(); }
    const a = action(), b = $('#act'); actFn = a ? a[1] : null; b.disabled = !a; const label = a ? a[0] : 'Подойдите к зданию'; if (b.dataset.l !== label) { b.dataset.l = label; b.innerHTML = label; }
    const q = G.rescue ? `${MI.sos} Тонущий в ${Math.round(Math.hypot(G.rescue.x - S.x, G.rescue.y - S.y) / 10)} м · осталось ${Math.ceil(G.rescue.t)} с` : G.vol > 0 ? `${MI.ball} Идёт партия: не уходите с площадки` : G.quest ? `${MI.parcel} Посылка → ${G.quest.to.n} · ${Math.round(dist(S, G.quest.to) / 10)} м · ${pay(G.quest.pay)} ₽` : G.work > 0 ? `${MI.factory} Идёт смена: не отходите от станка` : S.jobs ? `Работ сделано: ${S.jobs}. ${RIDES[S.ride + 1] ? 'До «' + RIDES[S.ride + 1].n.replace(/[«»]/g, '') + '»: ' + Math.max(0, RIDES[S.ride + 1].cost - S.money) + ' ₽' : 'Вы король района.'}` : `Найдите работу: почта или завод. Пляж — на юге`; if ($('#quest').dataset.l !== q) { $('#quest').dataset.l = q; $('#quest').innerHTML = q; }
  }
  draw();
}
function doAct() { if (!actFn || !$('#ov').hidden) return; actFn(); hud(); }
function draw() {
  if (!G) { ctx.fillStyle = '#4c9a57'; ctx.fillRect(0, 0, W, H); return; }
  const cx = clamp(S.x - W / 2, 0, WORLD - W), cy = clamp(S.y - H / 2, 0, WH - H), x0 = Math.floor(cx / T), y0 = Math.floor(cy / T);
  ctx.save(); ctx.translate(-cx, -cy);
  const now = performance.now() / 1000;
  for (let ty = y0; ty <= y0 + Math.ceil(H / T) && ty < NY; ty++) for (let tx = x0; tx <= x0 + Math.ceil(W / T) && tx < N; tx++) { const x = tx * T, y = ty * T;
    if (ty >= 33) { ctx.fillStyle = ty === 33 ? '#49b3e6' : ty === 34 ? '#339fd8' : '#2488c4'; ctx.fillRect(x, y, T, T); ctx.fillStyle = 'rgba(255,255,255,.5)'; const o = Math.sin(now * 1.6 + tx * 1.3 + ty) * 5; ctx.fillRect(x + 6 + o, y + 12, 14, 2); ctx.fillRect(x + 20 - o, y + 28, 10, 2); if (ty === 33) { ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fillRect(x, y + Math.sin(now * 1.2 + tx) * 2, T, 3); } continue; }
    if (ty >= 30) { ctx.fillStyle = (tx + ty) % 2 ? '#ecd9a0' : '#e6d193'; ctx.fillRect(x, y, T, T); ctx.fillStyle = 'rgba(160,125,60,.35)'; ctx.fillRect(x + (tx * 13 + ty * 7) % 30 + 3, y + (tx * 5 + ty * 17) % 30 + 3, 2, 2); if (palm(tx, ty)) item(ctx, (tx + ty) % 3 ? 'palm' : 'parasol', x + 20, y + 18, 15, now); continue; }
    const rx = road(tx), ry = road(ty);
    ctx.fillStyle = rx || ry ? '#565b63' : (tx + ty) % 2 ? '#57a862' : '#4f9f5a'; ctx.fillRect(x, y, T, T);
    if (rx !== ry) { ctx.fillStyle = '#d8d8d8'; rx ? ctx.fillRect(x + T / 2 - 1, y + 8, 2, 24) : ctx.fillRect(x + 8, y + T / 2 - 1, 24, 2); }
    else if (!rx && isTree(tx, ty)) tree(ctx, x + 20, y + 20, 12, (tx + ty) % 4 === 0); }
  for (const sh of G.shells) { if (sh.kind === 'coral') coral(ctx, sh.x, sh.y, 7.5); else item(ctx, sh.kind, sh.x, sh.y, 7.5, sh.x); }
  if (G.rescue) { lifeRing(ctx, G.rescue.x, G.rescue.y + Math.sin(now * 5) * 3, 11, now); person(ctx, 'wave', G.rescue.x, G.rescue.y + 16 + Math.sin(now * 5) * 3, 8, now); }
  for (const p of PLACES) { if (p.x < cx - 40 || p.x > cx + W + 40 || p.y < cy - 40 || p.y > cy + H + 40) continue; building(ctx, p.art, p.x, p.y - 4, 15); const mine = G.quest && G.quest.to.id === p.id; if (!p.addr || mine) { ctx.font = '600 10px sans-serif'; const w = ctx.measureText(p.n).width + 8; ctx.fillStyle = mine ? '#d6402f' : 'rgba(0,0,0,.62)'; ctx.fillRect(p.x - w / 2, p.y + 14, w, 14); text(ctx, p.n, p.x, p.y + 21, 10); } }
  for (const f of G.folk) { person(ctx, f.kind, f.x, f.y, 10.5, now + f.x); if (dist(f, S) < 62) { ctx.font = '600 10px sans-serif'; const w = ctx.measureText(f.say).width + 10; ctx.fillStyle = '#fff'; ctx.fillRect(f.x - w / 2, f.y - 32, w, 16); text(ctx, f.say, f.x, f.y - 24, 10, '#111'); } }
  for (const c of G.cars) car(ctx, c.kind, c.h ? c.p : c.line, c.h ? c.line : c.p, 12.5, c.h ? c.sp < 0 : c.sp > 0);
  const ride = RIDES[S.ride]; if (!(G.safe > 0 && Math.floor(G.safe * 10) % 2)) { const bare = onBeach(), re = bare ? '' : ride.art; if (re) car(ctx, re, S.x, S.y + 6, 12.5, false); if (swim() && !bare) swimPose(ctx, S.x, S.y - (re ? 8 : 0), 10.5, now); else person(ctx, 'me', S.x, S.y - (re ? 8 : 0), 10.5, now); if (HATS[S.hat] && !bare) hatDraw(ctx, HATS[S.hat], S.x, S.y - (re ? 24 : 16), 6.5); }
  ctx.restore();
  const tgt = G.rescue || (G.quest && G.quest.to);
  if (tgt) { const a = Math.atan2(tgt.y - S.y, tgt.x - S.x), px = S.x - cx, py = S.y - cy; ctx.save(); ctx.translate(px + Math.cos(a) * 34, py + Math.sin(a) * 34); ctx.rotate(a); ctx.fillStyle = '#d6402f'; ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-6, -8); ctx.lineTo(-6, 8); ctx.closePath(); ctx.fill(); ctx.restore(); }
  // мини-карта
  const M = 66, MH = M * NY / N, mx = W - M - 6, my = 6, k = M / WORLD; ctx.fillStyle = 'rgba(20,40,24,.78)'; ctx.fillRect(mx, my, M, M); ctx.fillStyle = '#e6d193'; ctx.fillRect(mx, my + BY * k, M, (SY - BY) * k); ctx.fillStyle = '#339fd8'; ctx.fillRect(mx, my + SY * k, M, MH - SY * k); ctx.fillStyle = '#8a8f96'; for (const i of [2, 8, 14, 20, 26]) { ctx.fillRect(mx + i * T * k, my, T * k, M); ctx.fillRect(mx, my + i * T * k, M, T * k); }
  for (const p of POI) { ctx.fillStyle = '#ffd24a'; ctx.fillRect(mx + p.x * k - 1.5, my + p.y * k - 1.5, 3, 3); } if (tgt) { ctx.fillStyle = '#ff5a45'; ctx.fillRect(mx + tgt.x * k - 2.5, my + tgt.y * k - 2.5, 5, 5); } ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(mx + S.x * k, my + S.y * k, 2.6, 0, 7); ctx.fill();
  if (G.msgT > 0) { ctx.font = '600 12px sans-serif'; const w = Math.min(W - 16, ctx.measureText(G.msg).width + 18); ctx.fillStyle = 'rgba(0,0,0,.78)'; ctx.fillRect((W - w) / 2, H - 40, w, 26); text(ctx, G.msg, W / 2, H - 27, 12); }
  drawStick(ctx, mv);
}
$('#act').onclick = doAct; addEventListener('keydown', e => { if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') { e.preventDefault(); doAct(); } });
$('#go').onclick = () => { if (!G) reset(false); $('#ov').hidden = true; }; $('#wipe').onclick = () => { reset(true); save(); $('#ov').hidden = true; toast('Новая жизнь: 300 ₽ и ни одной гайки'); };
$('#share').onclick = () => share(`🏘️ Нудищево РП: ${lvl()}-й уровень, ${S.money} ₽, транспорт: ${RIDES[S.ride].n.toLowerCase()}. Работ сделано: ${S.jobs}.` + (S.saved ? ` На пляже спасено: ${S.saved}.` : ''));
if (store.get('rp.save', null)) $('#wipe').hidden = false;
{ const hud = document.querySelectorAll('.hud-ic'); if (hud[0]) hud[0].insertAdjacentHTML('afterbegin', MI.cash); if (hud[1]) hud[1].insertAdjacentHTML('afterbegin', MI.drumstick); if (hud[2]) hud[2].insertAdjacentHTML('afterbegin', MI.bolt); const ov = $('#ovE'); if (ov && !ov.innerHTML) ov.innerHTML = MI.village; }
reset(false); ready(); loop(step);
