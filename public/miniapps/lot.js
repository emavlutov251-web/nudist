import { ready, share, $, store, host } from '/miniapps/kit.js';
import { MI, dice, diceAny } from '/miniapps/mini-icons.js';
let tab = 'coin', last = '';
const rnd = n => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };
const names = () => $('#names').value.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
function show(big, sub, text) { const r = $('#res'); r.innerHTML = big; r.className = 'big'; void r.offsetWidth; r.className = 'big roll'; $('#sub').textContent = sub; last = text; $('#share').disabled = !text; }
function go() {
  if (tab === 'coin') { const o = rnd(2) ? 'Орёл' : 'Решка'; show(o === 'Орёл' ? MI.eagle : MI.coin, o, `Монетка: ${o}`); }
  else if (tab === 'dice') { const n = rnd(6) + 1; show(dice(n), 'Выпало ' + n, `Кубик: ${n}`); }
  else { const l = names(); if (l.length < 2) return show(MI.shrug, 'Нужно хотя бы двое', ''); store.set('lot.names', $('#names').value); const w = l[rnd(l.length)]; show(w, `из ${l.length}: ` + l.join(', ').slice(0, 80), `Жребий среди (${l.join(', ')}) выбрал: ${w}`); }
}
$('#tabs').onclick = e => { const b = e.target.closest('button'); if (!b) return; tab = b.dataset.t; [...$('#tabs').children].forEach(x => x.classList.toggle('on', x === b)); $('#listbox').hidden = tab !== 'list'; show(tab === 'coin' ? MI.coin : tab === 'dice' ? diceAny : MI.target, tab === 'list' ? 'Впишите участников и нажмите «Выбрать»' : 'Нажмите «Бросить»', ''); $('#go').textContent = tab === 'list' ? 'Выбрать' : 'Бросить'; };
$('#go').onclick = go; $('#share').onclick = () => last && share(last);
$('#names').value = store.get('lot.names', '');
show(MI.coin, 'Нажмите «Бросить»', '');
window.__g = { go, last: () => last };
ready(h => { if (!$('#names').value && h.name) $('#names').placeholder = h.name + '\nПетя\nМаша'; }); void host;
