// «Нудист в купальнике» — карточный стол на 2–4 человек. Правила целиком на сервере (server/cards.js):
// страница только показывает, что пришло, и отправляет нажатия. Поэтому выиграть «подкруткой» браузера нельзя.
import { ready, earn } from './kit.js';

const $ = s => document.querySelector(s);
const app = $('#app');
let view = null, gid = new URLSearchParams(location.search).get('g') || '', me = '', timer = null, pick = null, said = false;
const NAMES = { skip: '☀️', rev: '🌊', draw2: '🩳', wild: '👑', wild4: '🏖️' };
const COLOR_NAME = { r: 'красный', y: 'жёлтый', g: 'зелёный', b: 'синий' };

// ───── связь с приложением
const say = m => { try { parent.postMessage(m, location.origin); } catch (e) { /* открыто вне «Нудиста» */ } };
const WAIT = {};
const rpc = (m, p) => new Promise((ok, no) => { const id = Math.random().toString(36).slice(2); WAIT[id] = { ok, no }; say({ nudist: 'cards', m, p, id }); setTimeout(() => { if (WAIT[id]) { delete WAIT[id]; no(new Error('Сервер не ответил. Проверьте связь.')); } }, 9000); });
addEventListener('message', e => {
  if (e.source !== parent || !e.data) return; const d = e.data;
  if (d.nudist === 'cards.state') { view = d.v; me = d.me; gid = d.v.id; render(); }
  if (d.nudist === 'cards.reply') { const w = WAIT[d.id]; if (w) { delete WAIT[d.id]; d.e ? w.no(new Error(d.e)) : w.ok(d.r); } }
});
// Порядок важен: подписка на сообщения уже стоит, теперь говорим «я готов» — «Нудист» ответит столом.
ready(() => { if (gid) rpc('cards.get', { id: gid }).catch(() => {}); });

// ───── карта: одна разметка на всё
function cardEl(c, extra) {
  const k = c.k === 'n' ? '' : NAMES[c.k] || '';
  const cls = 'card ' + (c.c || 'w') + (extra ? ' ' + extra : '');
  const corner = c.k === 'n' ? String(c.v) : k;
  const face = c.k === 'n' ? `<span class="v">${c.v}</span>` : c.k === 'wild4' ? `<span class="w4k">+4</span>` : `<span class="k">${k}</span>`;
  return `<div class="${cls}"><span class="corner">${corner}</span>${face}<span class="corner b2">${corner}</span></div>`;
}
const initials = n => (n || '?').trim().slice(0, 1).toUpperCase();
const HUES = ['#FFD166', '#8FE08A', '#7BB8FF', '#FF9C8F'];

function render() {
  if (!view) return;
  const v = view, iAmTurn = v.turn === me && v.state === 'play';
  const foes = v.players.filter(p => p.id !== me);
  const top = v.top;
  app.innerHTML = `
    <div class="top">
      <b>Нудист в купальнике</b>
      <span class="color-dot" style="background:${{ r: '#E14B3B', y: '#E9A93B', g: '#22945A', b: '#3566D6' }[v.color] || '#888'}" title="Текущий цвет: ${COLOR_NAME[v.color] || '—'}"></span>
      <span class="sp"></span>
      ${v.state === 'play' ? `<span style="font-size:12px;opacity:.8">${iAmTurn ? '<span class="turn-me" style="padding:5px 10px;border-radius:8px">Ваш ход</span>' : 'Ждём хода…'}</span>` : ''}
      <button id="leave" type="button">Выйти</button>
    </div>
    <div class="table">
      <div class="foes">${foes.map((p, i) => `
        <div class="foe ${p.id === v.turn ? 'turn' : ''} ${p.out ? 'out' : ''}">
          <div class="av" style="background:${HUES[i % 4]}">${initials(p.name)}</div>
          <div class="nm">${p.name}</div>
          <div class="cnt">${p.out ? 'вышел' : p.n + ' карт'}</div>
          <div class="hand-mini">${'<i></i>'.repeat(Math.min(7, p.n))}</div>
        </div>`).join('')}</div>
      <div class="mid">
        <div class="pile"><div class="deck ${iAmTurn ? '' : ''}" id="deck" data-off="${iAmTurn ? '' : '1'}" title="Взять карту"><i></i><span>🍃</span></div><small>колода · ${v.deck}</small></div>
        <div class="pile">${top ? cardEl(top, 'big') : ''}<small>сброс · ${v.discard}</small></div>
      </div>
      <div class="log">${v.log.map(l => `<div>${l}</div>`).join('')}</div>
    </div>
    <div class="hand">${(v.hand || []).map((c, i) => {
      const ok = v.playable && v.playable[i] && v.playable[i].ok;
      return `<div class="slot ${ok && iAmTurn ? 'ok' : 'no'}" data-i="${i}" ${ok && iAmTurn ? 'role="button"' : ''}>${cardEl(c, ok && iAmTurn ? '' : '')}</div>`;
    }).join('')}</div>
    ${(v.hand || []).length === 1 && !v.said?.[me] ? '<button class="nud-btn" id="nud" type="button">Нудист!</button>' : ''}
    ${v.state === 'lobby' ? lobbySheet(v) : ''}
    ${v.state === 'over' ? overSheet(v) : ''}
    ${pick ? colorSheet() : ''}
  `;
  $('#leave').onclick = () => { say({ nudist: 'cards.leave' }); location.reload(); };
  const deck = $('#deck'); if (deck) deck.onclick = () => { if (!iAmTurn) return; rpc('cards.draw', { id: v.id }).catch(e => flash(e.message)); };
  app.querySelectorAll('.hand .slot.ok').forEach(el => el.onclick = () => {
    const i = Number(el.dataset.i), c = v.hand[i];
    if (c.k === 'wild' || c.k === 'wild4') { pick = i; render(); return; }
    play(i);
  });
  const nud = $('#nud'); if (nud) nud.onclick = () => { said = true; rpc('cards.say', { id: v.id }).catch(() => {}); render(); };
}
const flash = t => { const d = document.createElement('div'); d.className = 'log'; d.style.cssText = 'position:fixed;left:0;right:0;bottom:150px;text-align:center;font-size:13px;opacity:1;z-index:9;color:#FFD166'; d.textContent = t; app.appendChild(d); setTimeout(() => d.remove(), 2200); };
const play = (i, color) => rpc('cards.play', { id: view.id, i, color, said }).then(() => { pick = null; said = false; }).catch(e => { pick = null; flash(e.message); render(); });

function colorSheet() {
  return `<div class="sheet"><div class="box"><h2>Какой цвет?</h2><p>«Голый король» и «Пляжный день» заказывают цвет — следующий ход должен быть таким.</p>
    <div class="colors">${['r', 'y', 'g', 'b'].map(c => `<button class="${c}" type="button" data-c="${c}" aria-label="${COLOR_NAME[c]}"></button>`).join('')}</div>
    <div class="btns"><button class="alt" type="button" id="cancelPick">Отмена</button></div></div></div>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('.colors button');
  if (b) { const i = pick; pick = null; play(i, b.dataset.c); return; }
  if (e.target.id === 'cancelPick') { pick = null; render(); }
});
function lobbySheet(v) {
  return `<div class="sheet"><div class="box">
    <h2>Стол на ${v.seats}</h2>
    <p>${v.players.length} из ${v.seats} ${v.players.length === 1 ? 'человека' : 'человек'}. Позовите друзей или начните, если уже есть с кем.</p>
    <div class="btns">
      ${v.players.length < v.seats ? '<button class="alt" type="button" id="invite">Позвать друга</button>' : ''}
      ${v.host === me && v.players.length >= 2 ? '<button type="button" id="start">Начать партию</button>' : ''}
    </div>
    ${v.host !== me ? '<p style="margin-top:12px">Начинает хозяин стола.</p>' : ''}
  </div></div>`;
}
function overSheet(v) {
  const win = v.winner === me, w = v.players.find(p => p.id === v.winner);
  if (v.winner && win) earn('win');
  return `<div class="sheet"><div class="box">
    <h2>${win ? 'Победа! 🍃' : w ? 'Победил ' + w.name : 'Партия окончена'}</h2>
    <p>${win ? 'Вы остались без карт первым. Листики капнули в кошелёк.' : 'В следующий раз колода будет добрее.'}</p>
    <div class="btns"><button type="button" id="again">Ещё раз</button><button class="alt" type="button" id="quit">Выйти</button></div>
  </div></div>`;
}
document.addEventListener('click', e => {
  if (e.target.id === 'start') rpc('cards.start', { id: view.id }).catch(x => flash(x.message));
  if (e.target.id === 'invite') say({ nudist: 'cards.invite' });
  if (e.target.id === 'again' || e.target.id === 'quit') { say({ nudist: 'cards.leave' }); location.reload(); }
});

// Пока не пришло ни одного состояния — тихая заглушка, чтобы стол не «прыгал»
app.innerHTML = '<div style="margin:auto;text-align:center;opacity:.7">Раскладываем карты…</div>';
setTimeout(() => { if (!view) app.innerHTML = '<div style="margin:auto;text-align:center;opacity:.8;padding:20px">Стол не отвечает. Закройте игру и откройте заново из «Хаба».</div>'; }, 5000);
