// «Пары»: найдите одинаковые карточки. Картинки на карточках нарисованы кодом и зависят от события.
import { ready, share, earn, store, score, onTop, $, result, live, match } from '/miniapps/kit.js';
import { leafy, item, themeOf, ITEMS } from '/miniapps/art.js';
const TH = themeOf(), NAMES = { beach: 'Пляжные пары', mar: 'Весенний букет', jun: 'Праздничный стол', nov: 'Распродажа пар' }, title = NAMES[TH.key] || 'Пары: ' + TH.name;
const pool = [...new Set([...TH.good, ...TH.bad, ...TH.jump, 'star', 'sun', 'leaf', 'heart', 'ball', 'flower'])].filter(n => ITEMS.includes(n)).slice(0, 8);
let cards = [], open = [], moves = 0, lock = false, mood = 'ok';
const face = () => { const cv = $('#face'), c = cv.getContext('2d'); c.clearRect(0, 0, cv.width, cv.height); leafy(c, cv.width / 2, cv.height * 0.58, cv.height * 0.6, { t: 1, mood, hat: TH.hat }); };
function paint(el, n) { const cv = el.firstChild, c = cv.getContext('2d'); c.clearRect(0, 0, 90, 120); if (n) item(c, n, 45, 62, 26, 1); else { c.globalAlpha = 0.3; item(c, 'leaf', 45, 60, 22, 0); c.globalAlpha = 1; } }
function deal() {
  const names = [...pool, ...pool].map(n => [Math.random(), n]).sort((a, b) => a[0] - b[0]).map(x => x[1]); cards = []; open = []; moves = 0; lock = false; mood = 'ok'; face(); $('#moves').textContent = 'Ходов: 0'; const g = $('#grid'); g.textContent = '';
  names.forEach((n, i) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'pcard'; b.setAttribute('aria-label', 'Карточка ' + (i + 1)); const cv = document.createElement('canvas'); cv.width = 90; cv.height = 120; b.appendChild(cv); g.appendChild(b); const card = { n, el: b, up: false, done: false }; cards.push(card); paint(b, null); b.onclick = () => flip(card); });
}
function flip(card) {
  if (lock || card.up || card.done) return; card.up = true; card.el.classList.add('up'); paint(card.el, card.n); open.push(card); if (open.length < 2) return;
  moves++; $('#moves').textContent = 'Ходов: ' + moves; const [a, b] = open; open = [];
  if (a.n === b.n) { a.done = b.done = true; a.el.classList.add('done'); b.el.classList.add('done'); mood = 'happy'; face(); setTimeout(() => { mood = 'ok'; face(); }, 500); if (cards.every(x => x.done)) win(); }
  else { lock = true; mood = 'hurt'; face(); setTimeout(() => { for (const x of [a, b]) { x.up = false; x.el.classList.remove('up'); paint(x.el, null); } lock = false; mood = 'ok'; face(); }, 750); }
}
function win() { const best = Math.min(moves, store.get('pairs.best.' + TH.key, 999)); store.set('pairs.best.' + TH.key, best); mood = 'happy'; face(); $('#moves').textContent = `Готово за ${moves} · рекорд ${best}`; score(Math.max(1, 60 - moves)); result(match.on ? 8 + Math.max(0, 52 - moves) : Math.max(1, 60 - moves));      /* в лобби: 8 за все пары плюс запас ходов — собравший всё всегда выше того, кто не успел */ earn('win'); if (moves <= 26) setTimeout(() => earn('ace'), 400); }
$('#title').textContent = title; $('#go').onclick = deal; $('#share').onclick = () => share(`«${title}»: все пары за ${moves || '…'} ходов 🍃 Кто быстрее?`);
onTop(d => { if (d.place) $('#moves').textContent += ` · ${d.place}-е место из ${d.n}`; });
live(() => cards.filter(x => x.done).length / 2);
deal(); ready();
