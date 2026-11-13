// Движение и свет стиля «Fluent» (Windows 10 1709–1809):
//  • вдавливание — элемент наклоняется в сторону точки нажатия и чуть уменьшается;
//  • Reveal — пятно света и рамка следуют за указателем мыши.
// Работает только при data-style="fluent" и включённых анимациях. Один набор обработчиков на весь документ.
const root = document.documentElement;
const PRESS = '.btn, .ib, .ci, .mi, .rail-b, .chip, .send, .folders button, .tabs button, .set-nav button, .seg button, .th, .wall, .story, .toggle, .em-grid button, .swatches button, .hub-tabs button, .tv-ch, .trk, .app-grid > *, .make-i, .gift-i, .dock-h button';
const REVEAL = '.btn, .ib, .ci, .mi, .rail-b, .chip, .set-nav button, .seg button, .th, .wall, .tv-ch, .hub-tabs button';
const on = () => root.dataset.style === 'fluent' && root.dataset.anim !== '0';

let pressed = null;
function release() { if (pressed) { pressed.classList.remove('fx-press'); pressed = null; } }
addEventListener('pointerdown', e => {
  if (!on() || e.button > 0 || !e.target.closest) return;
  const el = e.target.closest(PRESS); if (!el || el.disabled) return;
  const cs = getComputedStyle(el); if (cs.display === 'inline') return;
  if (cs.transform !== 'none') {      // не ломаем то, что позиционировано трансформацией; чистое уменьшение от :active — не в счёт
    const m = /^matrix\(([^)]+)\)$/.exec(cs.transform), v = m && m[1].split(',').map(Number);
    if (!v || v[1] || v[2] || v[4] || v[5] || v[0] < .9 || v[0] > 1.001) return;
  }
  const r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
  const dx = Math.max(-1, Math.min(1, (e.clientX - r.left) / r.width * 2 - 1)), dy = Math.max(-1, Math.min(1, (e.clientY - r.top) / r.height * 2 - 1));
  const big = Math.max(r.width, r.height), k = big > 260 ? 2.4 : big > 110 ? 5 : 9;      // крупные плитки наклоняются слабее
  el.style.setProperty('--py', (dx * k).toFixed(2) + 'deg'); el.style.setProperty('--px', (-dy * k).toFixed(2) + 'deg');
  el.style.setProperty('--ps', big > 260 ? '.985' : big > 110 ? '.97' : '.92');
  release(); pressed = el; el.classList.add('fx-press');
}, { passive: true });
for (const ev of ['pointerup', 'pointercancel', 'dragstart', 'blur']) addEventListener(ev, release, { passive: true });
addEventListener('scroll', release, { passive: true, capture: true });

let lit = null, raf = 0, last = null;
function unlight() { if (lit) { lit.classList.remove('fx-rv'); lit = null; } }
addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse') return;
  last = e; if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0; const ev = last; if (!on() || !ev.target.closest) return unlight();
    const el = ev.target.closest(REVEAL); if (!el || el.disabled) return unlight();
    if (el !== lit) { unlight(); lit = el; el.classList.add('fx-rv'); }
    const r = el.getBoundingClientRect();
    el.style.setProperty('--rx', Math.round(ev.clientX - r.left) + 'px'); el.style.setProperty('--ry', Math.round(ev.clientY - r.top) + 'px');
  });
}, { passive: true });
document.addEventListener('pointerleave', unlight);
addEventListener('blur', unlight);
