// «Подышать»: три простых ритма дыхания. Ничего не считает, не награждает и никуда не отправляет — просто ведёт вдох и выдох.
import { ready, $, store } from '/miniapps/kit.js';
// шаги: [что делать, секунд, размер круга]
const MODES = [
  { id: 'calm', n: 'Долгий выдох', how: 'Вдох на 4 счёта, выдох на 6. Самый простой способ успокоиться: выдох длиннее вдоха.', steps: [['Вдох', 4, 2.1], ['Выдох', 6, 1]] },
  { id: 'box', n: 'Квадрат', how: 'Вдох, задержка, выдох, задержка — всё по 4 счёта. Помогает собраться перед важным делом.', steps: [['Вдох', 4, 2.1], ['Задержка', 4, 2.1], ['Выдох', 4, 1], ['Задержка', 4, 1]] },
  { id: '478', n: '4-7-8', how: 'Вдох на 4, задержка на 7, медленный выдох на 8. Хорошо перед сном. Трёх-четырёх кругов достаточно.', steps: [['Вдох', 4, 2.1], ['Задержка', 7, 2.1], ['Выдох', 8, 1]] },
];
let mode = MODES.find(m => m.id === store.get('breath.mode', 'calm')) || MODES[0], on = false, i = 0, left = 0, total = 0, timer = null;
const leaf = $('#leaf');
function paintModes() { $('#modes').innerHTML = ''; for (const m of MODES) { const b = document.createElement('button'); b.type = 'button'; b.textContent = m.n; b.className = m === mode ? 'on' : ''; b.onclick = () => { mode = m; store.set('breath.mode', m.id); stop(); paintModes(); }; $('#modes').appendChild(b); } $('#how').textContent = mode.how; }
function step() { const [w, sec, k] = mode.steps[i]; left = sec; $('#word').textContent = w; $('#count').textContent = sec; leaf.style.transitionDuration = sec + 's'; leaf.style.transform = `scale(${k})`; }
function tick() { total++; left--; $('#time').textContent = Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0'); if (left <= 0) { i = (i + 1) % mode.steps.length; step(); } else $('#count').textContent = left; }
function start() { on = true; i = 0; total = 0; $('#go').textContent = 'Остановиться'; $('#time').textContent = '0:00'; step(); timer = setInterval(tick, 1000); }
function stop() { on = false; clearInterval(timer); $('#go').textContent = 'Начать'; $('#word').textContent = total >= 60 ? 'Хорошо. Вы молодец.' : 'Готовы?'; $('#count').textContent = ''; leaf.style.transitionDuration = '.6s'; leaf.style.transform = 'scale(1)'; }
$('#go').onclick = () => (on ? stop() : start());
paintModes(); ready();
window.__b = { state: () => ({ on, i, left, total, mode: mode.id }) };
