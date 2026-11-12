// «Листопад» — мини-приложение-кликер. Общается с «Нудистом» через postMessage (см. README, раздел Mini Apps).
const $ = id => document.getElementById(id);
const QUIPS = ['Тапайте по листу. Он не обидится.', 'Лист держится из последних сил.', 'Адам одобряет вашу продуктивность.', 'Ещё немного — и хватит на премиум. Ну, почти.', 'Осторожно: вызывает привыкание и мозоль на пальце.', 'Каждый тап — это чей-то прикрытый стыд.', 'Работа? Какая работа? Тут листья падают.', 'Комбо! Листья сыплются, как дедлайны.', 'Бухгалтерия сообщает: листики настоящие. Почти.', 'Вы тапаете профессионально. Укажите это в резюме.'];
// Листик падает не за каждый тап, а за каждые `per` тапов; в день их не больше `left`. Числа присылает сервер.
let stars = 0, left = 150, per = 10, prog = 0, pending = 0, inflight = 0, total = 0, combo = 0, lastTap = 0, timer = null, inHost = window.parent !== window;
const send = m => { if (inHost) window.parent.postMessage(m, location.origin); };
const fmt = n => n.toLocaleString('ru-RU');
const word = (n, f) => { n = Math.abs(n) % 100; const k = n % 10; return f[n > 10 && n < 20 ? 2 : k === 1 ? 0 : k >= 2 && k <= 4 ? 1 : 2]; };
const gained = () => Math.min(left, Math.floor((prog + pending) / per));      // листики, которые уже настучали, но сервер ещё не подтвердил
function paint() {
  const g = gained(), l = left - g, step = (prog + pending) % per;
  $('bal').textContent = fmt(stars + g) + ' 🍃';
  $('left').textContent = l ? `До листика: ${per - step} ${word(per - step, ['тап', 'тапа', 'тапов'])} · сегодня ещё ${fmt(l)} 🍃` : 'Лимит на сегодня исчерпан. Лист устал.';
  $('bar').style.width = (l ? step / per * 100 : 0) + '%'; $('leaf').classList.toggle('tired', !l); $('combo').textContent = combo >= 10 ? 'комбо ×' + combo : '';
}
function flush() { timer = null; if (!pending) return; const n = pending, all = prog + n, g = Math.min(left, Math.floor(all / per)); pending = 0; stars += g; left -= g; prog = all % per; if (inHost) { inflight++; send({ nudist: 'tap', n }); } paint(); }
function tap(e) {
  if (left - gained() <= 0) { $('quip').textContent = 'На сегодня всё. Приходите завтра — отрастут новые.'; return; }
  pending++; total++; const t = Date.now(); combo = t - lastTap < 600 ? combo + 1 : 1; lastTap = t;
  if (!timer) timer = setTimeout(flush, 900);
  const step = (prog + pending) % per, r = $('leaf').getBoundingClientRect(), x = e.clientX || r.left + r.width / 2, y = e.clientY || r.top + r.height / 2;
  const f = document.createElement('i'); f.className = 'fly' + (step ? ' dim' : ''); f.textContent = step ? step + '/' + per : '+1 🍃'; f.style.left = x - 10 + 'px'; f.style.top = y - 20 + 'px'; f.style.setProperty('--dx', (Math.random() * 120 - 60).toFixed(0) + 'px'); f.style.setProperty('--r', (Math.random() * 60 - 30).toFixed(0) + 'deg'); document.body.append(f); setTimeout(() => f.remove(), 900);
  $('leaf').classList.add('hit'); setTimeout(() => $('leaf').classList.remove('hit'), 70);
  if (total % 40 === 0) $('quip').textContent = QUIPS[Math.floor(Math.random() * QUIPS.length)];
  if (navigator.vibrate) navigator.vibrate(step ? 8 : 30);
  paint();
}
$('leaf').addEventListener('pointerdown', e => { e.preventDefault(); tap(e); });
$('leaf').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); tap({}); } });
$('daily').addEventListener('click', () => { $('daily').disabled = true; if (inHost) send({ nudist: 'daily' }); else $('quip').textContent = 'Бонус выдаётся только внутри «Нудиста».'; });
addEventListener('message', e => {
  if (e.origin !== location.origin || e.source !== window.parent) return; const d = e.data || {};
  if (d.ack) inflight = Math.max(0, inflight - 1);
  if (d.nudist === 'balance' && inflight) return;      // ждём ответ на последнюю пачку тапов, иначе счётчик прыгнет назад
  if (d.nudist === 'balance') { stars = d.stars || 0; if (d.left != null) left = Math.max(0, d.left); if (d.per) per = d.per; if (d.prog != null) prog = d.prog; if (d.name) $('hello').textContent = 'Привет, ' + d.name + '!'; if (d.daily != null) { $('daily').disabled = !d.daily; if (!d.daily) $('daily').textContent = '✓ Бонус собран'; } paint(); }
  if (d.nudist === 'bonus') { stars = d.stars || stars + d.n; $('daily').textContent = '✓ Бонус собран'; $('quip').textContent = `Бонус дня: +${d.n} 🍃. Не тратьте всё на бусты.`; paint(); }
  if (d.nudist === 'error') { $('quip').textContent = d.text; if (/лимит|завтра/i.test(d.text)) left = 0; paint(); }
});
addEventListener('pagehide', flush);
if (!inHost) $('quip').textContent = 'Откройте игру через бота @listopad в «Нудисте» — так листики будут настоящими.';
send({ nudist: 'ready' }); paint();
