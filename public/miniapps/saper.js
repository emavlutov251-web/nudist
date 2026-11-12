import { ready, share, $, store } from '/miniapps/kit.js';
const W = 9, MINES = 10, field = $('#field'); let cells, mines, open, flags, state, t0, timer, dig = true, firstClick;
const around = i => { const x = i % W, y = (i - x) / W, out = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy; if ((dx || dy) && nx >= 0 && ny >= 0 && nx < W && ny < W) out.push(ny * W + nx); } return out; };
function start() {
  field.textContent = ''; cells = []; mines = new Set(); open = new Set(); flags = new Set(); state = 'play'; firstClick = true; clearInterval(timer); t0 = 0;
  for (let i = 0; i < W * W; i++) { const b = document.createElement('button'); b.type = 'button'; b.appendChild(document.createElement('span')); b.dataset.i = i; field.appendChild(b); cells.push(b); }
  $('#new').textContent = '😎'; $('#time').textContent = '0'; draw();
}
function plant(safe) { const ban = new Set([safe, ...around(safe)]); while (mines.size < MINES) { const i = Math.floor(Math.random() * W * W); if (!ban.has(i)) mines.add(i); } }      // первый клик всегда безопасен
function draw() {
  cells.forEach((b, i) => { const s = b.firstChild, n = around(i).filter(j => mines.has(j)).length; b.className = ''; s.className = ''; s.textContent = '';
    if (open.has(i)) { b.className = 'open'; if (mines.has(i)) { s.textContent = '💣'; b.className = 'open boom'; } else if (n) { s.textContent = n; s.className = 'n' + n; } }
    else if (flags.has(i)) s.textContent = '🚩'; else if (state === 'lost' && mines.has(i)) s.textContent = '💣'; });
  $('#left').textContent = MINES - flags.size;
}
function reveal(i) { const q = [i]; while (q.length) { const c = q.pop(); if (open.has(c) || flags.has(c)) continue; open.add(c); if (!mines.has(c) && !around(c).some(j => mines.has(j))) q.push(...around(c)); } }
function end(won) { state = won ? 'won' : 'lost'; clearInterval(timer); $('#new').textContent = won ? '🥳' : '😵'; const sec = Math.round((Date.now() - t0) / 1000); if (won) { const best = store.get('saper.best', 0); if (!best || sec < best) store.set('saper.best', sec); } $('#hint').textContent = won ? `Чисто! ${sec} с. Рекорд: ${store.get('saper.best', sec)} с.` : 'Бабах. Вы остались без штанов. Смайлик — заново.'; }
function click(i, flag) {
  if (state !== 'play' || open.has(i)) return;
  if (flag) { flags.has(i) ? flags.delete(i) : flags.size < MINES && flags.add(i); return draw(); }
  if (flags.has(i)) return;
  if (firstClick) { firstClick = false; plant(i); t0 = Date.now(); timer = setInterval(() => { $('#time').textContent = Math.round((Date.now() - t0) / 1000); }, 1000); }
  if (mines.has(i)) { open.add(i); end(false); return draw(); }
  reveal(i); if (open.size === W * W - MINES) end(true); draw();
}
let hold = null, held = false;
field.addEventListener('pointerdown', e => { const b = e.target.closest('button'); if (!b) return; held = false; hold = setTimeout(() => { held = true; click(+b.dataset.i, true); }, 420); });
field.addEventListener('pointerup', () => clearTimeout(hold)); field.addEventListener('pointerleave', () => clearTimeout(hold));
field.addEventListener('click', e => { const b = e.target.closest('button'); if (!b || held) return; click(+b.dataset.i, !dig); });
field.addEventListener('contextmenu', e => { e.preventDefault(); const b = e.target.closest('button'); if (b && !held) click(+b.dataset.i, true); });
$('#mode').onclick = () => { dig = !dig; $('#mode').textContent = dig ? 'Режим: копать' : 'Режим: флажки 🚩'; };
$('#new').onclick = start;
$('#share').onclick = () => share(state === 'won' ? `💣 Сапёр пройден за ${$('#time').textContent} с. Ни одной царапины!` : state === 'lost' ? '💣 Подорвался в «Сапёре». Помянем.' : '💣 Играю в «Сапёра». Не отвлекайте, тут минное поле.');
window.__g = { click, mines: () => [...mines], state: () => state };
start(); ready();
