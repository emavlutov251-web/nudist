import { ready, share, toast, $, store, earn } from '/miniapps/kit.js';
const N = 4, board = $('#board'); let g, score, over, best = store.get('2048.best', 0);
const cells = []; for (let i = 0; i < N * N; i++) { const c = document.createElement('i'); c.appendChild(document.createElement('b')); board.appendChild(c); cells.push(c); }
function spawn() { const free = []; g.forEach((v, i) => { if (!v) free.push(i); }); if (!free.length) return -1; const i = free[Math.floor(Math.random() * free.length)]; g[i] = Math.random() < .9 ? 2 : 4; return i; }
function draw(fresh) {
  g.forEach((v, i) => { const c = cells[i]; c.className = v ? (v > 2048 ? 'vx' : 'v' + v) + (i === fresh ? ' pop' : '') : ''; c.firstChild.textContent = v || ''; });
  $('#score').textContent = score; if (score > best) { best = score; store.set('2048.best', best); } $('#best').textContent = best;
}
let paid = new Set();      // за какие плитки в этой партии листики уже выданы
function start() { g = new Array(N * N).fill(0); score = 0; over = false; paid = new Set(); spawn(); draw(spawn()); $('#hint').textContent = 'Свайпы или стрелки. Одинаковые плитки складываются.'; }
// Сдвиг одной линии влево; остальные направления получаются перестановкой индексов.
function slide(line) { const a = line.filter(Boolean), out = []; for (let i = 0; i < a.length; i++) { if (a[i] === a[i + 1]) { out.push(a[i] * 2); score += a[i] * 2; i++; } else out.push(a[i]); } while (out.length < N) out.push(0); return out; }
function move(dir) {      // 0 влево, 1 вправо, 2 вверх, 3 вниз
  if (over) return; let moved = false;
  for (let k = 0; k < N; k++) {
    const idx = []; for (let j = 0; j < N; j++) idx.push(dir < 2 ? k * N + (dir === 0 ? j : N - 1 - j) : (dir === 2 ? j : N - 1 - j) * N + k);
    const before = idx.map(i => g[i]), after = slide(before);
    after.forEach((v, j) => { if (g[idx[j]] !== v) moved = true; g[idx[j]] = v; });
  }
  if (!moved) return;
  draw(spawn());
  const top = Math.max(...g); for (const t of [128, 256, 512, 1024, 2048]) if (top >= t && !paid.has(t)) { paid.add(t); earn(t); }
  const stuck = !g.includes(0) && !g.some((v, i) => (i % N < N - 1 && v === g[i + 1]) || (i < N * (N - 1) && v === g[i + N]));
  if (stuck) { over = true; $('#hint').textContent = `Ходов больше нет. Счёт ${score}. Одевайтесь и пробуйте снова.`; }
  else if (g.includes(2048) && !start.won) { start.won = true; toast('2048! Можно продолжать'); }
}
addEventListener('keydown', e => { const d = { ArrowLeft: 0, ArrowRight: 1, ArrowUp: 2, ArrowDown: 3, a: 0, d: 1, w: 2, s: 3 }[e.key]; if (d !== undefined) { e.preventDefault(); move(d); } });
let t0 = null;
board.addEventListener('pointerdown', e => { t0 = { x: e.clientX, y: e.clientY }; });
addEventListener('pointerup', e => { if (!t0) return; const dx = e.clientX - t0.x, dy = e.clientY - t0.y; t0 = null; if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return; move(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 0 : 1) : (dy < 0 ? 2 : 3)); });
$('#new').onclick = start;
$('#share').onclick = () => share(`🔢 2048: мой счёт ${score}, старшая плитка ${Math.max(...g)}. Рекорд ${best}. Попробуй побить!`);
window.__g = { move, state: () => ({ g: g.slice(), score, over }) };
start(); ready();
