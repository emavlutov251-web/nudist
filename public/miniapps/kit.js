// Мост между мини-приложением и «Нудистом». Приложение живёт во фрейме поверх чата и умеет:
// узнать имя пользователя и тему, отправить текст в открытый чат (с подтверждением), закрыться.
export const host = { name: '', chat: '', theme: 'light', canSend: false };
// ───── игра вдвоём (лобби). Адрес фрейма: ?m=1 — партия из лобби, &pvp=1 — общий стол, &seed=N — одинаковая случайность у обоих.
const Q = new URLSearchParams(location.search);
export const match = { on: Q.get('m') === '1', pvp: Q.get('pvp') === '1', foe: '' };
if (match.on) document.documentElement.dataset.match = '1';      // прячет «Ещё раз», «Новая игра» и «В чат»: раундом управляет лобби
{ const seed = Number(Q.get('seed')) >>> 0;      // одинаковая раскладка и одинаковые первые сюрпризы у обоих игроков
  if (match.on && seed) { let s = seed; Math.random = () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; } }
const goSubs = [], netSubs = []; let liveFn = null, liveLast = null;
/** Общий старт: лобби присылает «go» после отсчёта. Без своего обработчика нажимается кнопка #go. */
export function onGo(fn) { goSubs.push(fn); }
/** Как узнать текущий счёт партии — лобби показывает его сопернику вживую. */
export function live(fn) { liveFn = fn; }
/** Ходы сопернику в общей партии. */
export const net = { send: d => say({ nudist: 'net', d }), on: fn => { netSubs.push(fn); } };
setInterval(() => { if (!match.on || !liveFn) return; let n; try { n = Math.max(0, Math.floor(Number(liveFn()) || 0)); } catch (e) { return; } if (n !== liveLast) { liveLast = n; say({ nudist: 'live', score: n }); } }, 600);
const subs = [];
const say = m => { try { parent.postMessage(m, location.origin); } catch (e) { /* открыли вне приложения */ } };
addEventListener('message', e => {
  if (e.source !== parent || !e.data) return; const d = e.data;
  if (d.nudist === 'init') { Object.assign(host, d); if (d.match) match.foe = String(d.match.foe || ''); document.documentElement.dataset.theme = d.theme === 'dark' ? 'dark' : 'light'; subs.forEach(f => f(host)); }
  if (d.nudist === 'go') { if (goSubs.length) goSubs.forEach(f => f()); else { const b = document.getElementById('go'); if (b) b.click(); } }
  if (d.nudist === 'net') netSubs.forEach(f => f(d.d));
  if (d.nudist === 'sent') toast('Отправлено в чат');
  if (d.nudist === 'error') toast(d.text);
  if (d.nudist === 'top') tops.forEach(f => f(d));
  if (d.nudist === 'earned') { const n_ = Math.abs(d.n || 0) % 100, k_ = n_ % 10, word_ = n_ > 10 && n_ < 20 ? 'листиков' : k_ === 1 ? 'листик' : k_ >= 2 && k_ <= 4 ? 'листика' : 'листиков'; if (d.n) toast(`+${d.n} ${word_}` + (d.left ? '' : ' · на сегодня это всё')); else if (!earn.told) { earn.told = true; toast('Листики за эту игру на сегодня собраны. Завтра вырастут новые.'); } }
});
export function ready(fn) { if (fn) subs.push(fn); say({ nudist: 'ready' }); }
export function share(text) { if (parent === window) return toast('Откройте приложение внутри «Нудиста»'); say({ nudist: 'send', text: String(text).slice(0, 2000) }); }
// Попросить у «Нудиста» листики за игровое достижение (что и сколько стоит — решает сервер, у каждой игры потолок на день).
export function earn(what) { if (parent !== window) say({ nudist: 'earn', what: String(what) }); }
// Отправить результат партии в таблицу рекордов; ответ (место и первая десятка) придёт в onTop
const tops = [];
export function score(n) { if (parent !== window) say({ nudist: 'score', score: Math.floor(n), t: new URLSearchParams(location.search).get('t') || '' }); }
export function onTop(fn) { tops.push(fn); }
// Итог партии для дуэли: «Нудист» покажет под игрой кнопку «Вызвать на дуэль», а если это ответ на вызов — запишет результат.
export function result(n) { if (parent !== window) say({ nudist: 'result', score: Math.max(0, Math.floor(Number(n) || 0)) }); }
export function toast(text) {
  let t = document.getElementById('toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = text; t.className = 'on'; clearTimeout(toast.t); toast.t = setTimeout(() => { t.className = ''; }, 1800);
}
export const $ = s => document.querySelector(s);
export const store = { get(k, d) { try { const v = JSON.parse(localStorage.getItem('nudist.app.' + k)); return v == null ? d : v; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('nudist.app.' + k, JSON.stringify(v)); } catch (e) { /* без памяти */ } } };
export const close = () => say({ nudist: 'close' });
addEventListener('keydown', e => { if (e.key === 'Escape') close(); });      // Esc внутри фрейма иначе не дошёл бы до «Нудиста»
