import { ready, share, $ } from '/miniapps/kit.js';
const fmt = n => n.toLocaleString('ru-RU');
let text = '';
function calc() {
  const sum = Math.max(0, parseFloat(String($('#sum').value).replace(',', '.')) || 0), ppl = Math.max(1, Math.floor(+$('#ppl').value || 1)), tip = Math.min(100, Math.max(0, +$('#tip').value || 0)), step = +$('#round').value || 1;
  const kop = Math.round(sum * (100 + tip)), total = kop / 100, each = Math.ceil(kop / (ppl * step * 100) - 1e-9) * step;      // считаем в копейках: 3200 × 1.1 в дробях даёт 3520.0000000000005
  $('#each').textContent = fmt(each) + ' ₽';
  $('#total').textContent = sum ? `Итого с чаевыми ${fmt(Math.round(total))} ₽ на ${ppl} чел. Соберётся ${fmt(each * ppl)} ₽` : 'Введите сумму';
  text = sum ? `🧾 Скидываемся: счёт ${fmt(sum)} ₽ + чаевые ${tip}% = ${fmt(Math.round(total))} ₽. Нас ${ppl}, с каждого по ${fmt(each)} ₽.` : '';
  $('#share').disabled = !text; return { each, total: Math.round(total) };
}
['sum', 'ppl', 'tip', 'round'].forEach(i => $('#' + i).addEventListener('input', calc));
$('#share').onclick = () => text && share(text);
window.__g = { calc };
calc(); ready();
