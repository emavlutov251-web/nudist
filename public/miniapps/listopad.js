// «Листопад» — мини-приложение-кликер. Общается с «Нудистом» через postMessage (см. README, раздел Mini Apps).
const $ = id => document.getElementById(id);
const QUIPS = ['Тапайте по листу. Он не обидится.', 'Лист держится из последних сил.', 'Адам одобряет вашу продуктивность.', 'Ещё немного — и хватит на премиум. Ну, почти.', 'Осторожно: вызывает привыкание и мозоль на пальце.', 'Каждый тап — это чей-то прикрытый стыд.', 'Работа? Какая работа? Тут листья падают.', 'Комбо! Листья сыплются, как дедлайны.', 'Бухгалтерия сообщает: листики настоящие. Почти.', 'Вы тапаете профессионально. Укажите это в резюме.'];
let stars = 0, left = 1500, pending = 0, combo = 0, lastTap = 0, timer = null, inHost = window.parent !== window;
const send = m => { if (inHost) window.parent.postMessage(m, location.origin); };
const fmt = n => n.toLocaleString('ru-RU');
function paint() { $('bal').textContent = fmt(stars + pending) + ' 🍃'; const l = Math.max(0, left - pending); $('left').textContent = l ? 'Сегодня осталось: ' + fmt(l) : 'Лимит на сегодня исчерпан. Лист устал.'; $('bar').style.width = Math.min(100, l / 15) + '%'; $('leaf').classList.toggle('tired', !l); $('combo').textContent = combo >= 10 ? 'комбо ×' + combo : ''; }
function flush() { timer = null; if (!pending) return; const n = pending; pending = 0; stars += n; left -= n; if (inHost) send({ nudist: 'tap', n }); paint(); }
function tap(e) {
  if (left - pending <= 0) { $('quip').textContent = 'На сегодня всё. Приходите завтра — отрастут новые.'; return; }
  pending++; const t = Date.now(); combo = t - lastTap < 600 ? combo + 1 : 1; lastTap = t;
  if (!timer) timer = setTimeout(flush, 900);
  const r = $('leaf').getBoundingClientRect(), x = e.clientX || r.left + r.width / 2, y = e.clientY || r.top + r.height / 2;
  const f = document.createElement('i'); f.className = 'fly'; f.textContent = combo % 25 === 0 ? '🍂' : '+1'; f.style.left = x - 10 + 'px'; f.style.top = y - 20 + 'px'; f.style.setProperty('--dx', (Math.random() * 120 - 60).toFixed(0) + 'px'); f.style.setProperty('--r', (Math.random() * 60 - 30).toFixed(0) + 'deg'); document.body.append(f); setTimeout(() => f.remove(), 900);
  $('leaf').classList.add('hit'); setTimeout(() => $('leaf').classList.remove('hit'), 70);
  if ((stars + pending) % 40 === 0) $('quip').textContent = QUIPS[Math.floor(Math.random() * QUIPS.length)];
  if (navigator.vibrate) navigator.vibrate(8);
  paint();
}
$('leaf').addEventListener('pointerdown', e => { e.preventDefault(); tap(e); });
$('leaf').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); tap({}); } });
$('daily').addEventListener('click', () => { $('daily').disabled = true; if (inHost) send({ nudist: 'daily' }); else $('quip').textContent = 'Бонус выдаётся только внутри «Нудиста».'; });
addEventListener('message', e => {
  if (e.origin !== location.origin || e.source !== window.parent) return; const d = e.data || {};
  if (d.nudist === 'balance') { stars = d.stars || 0; if (d.left != null) left = Math.max(0, d.left); if (d.name) $('hello').textContent = 'Привет, ' + d.name + '!'; if (d.daily != null) { $('daily').disabled = !d.daily; if (!d.daily) $('daily').textContent = '✓ Бонус собран'; } paint(); }
  if (d.nudist === 'bonus') { stars = d.stars || stars + d.n; $('daily').textContent = '✓ Бонус собран'; $('quip').textContent = `Бонус дня: +${d.n} 🍃. Не тратьте всё на бусты.`; paint(); }
  if (d.nudist === 'error') { $('quip').textContent = d.text; if (/лимит|завтра/i.test(d.text)) left = 0; paint(); }
});
addEventListener('pagehide', flush);
if (!inHost) $('quip').textContent = 'Откройте игру через бота @listopad в «Нудисте» — так листики будут настоящими.';
send({ nudist: 'ready' }); paint();
