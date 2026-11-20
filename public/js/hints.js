// Одноразовые подсказки и мягкое напоминание про уведомления.
// Дисциплина: одновременно — не больше одной; не больше двух новых за один заход; каждая показывается
// один раз (флаг на устройстве); напоминание «включить уведомления» повторяется до трёх раз, пока
// человек не разрешит или не выключит системные уведомления в настройках, — и больше не появляется.
// Никакого пуша и всплывашек поверх работы: полоса сверху, сама исчезает, всегда есть «×».
import { S, local, toast } from './lib.js';

const seen = id => !!local.get('hint.' + id, false);
const mark = id => local.set('hint.' + id, true);
let perLoad = 0, lastShown = 0, active = null;

function styleOnce() {
  if (document.getElementById('hint-css')) return;
  const st = document.createElement('style');
  st.id = 'hint-css';
  st.textContent = `
.hintbar { position: fixed; top: calc(10px + env(safe-area-inset-top, 0px)); left: 50%; z-index: 400;
  display: flex; align-items: center; gap: 10px; max-width: min(560px, calc(100vw - 20px));
  background: var(--panel); color: var(--ink); border: 1px solid var(--line); border-radius: 16px;
  box-shadow: 0 12px 36px rgba(0, 0, 0, .22); padding: 9px 10px 9px 12px; font: inherit;
  opacity: 0; transform: translate(-50%, -14px); transition: opacity .22s var(--ease, ease), transform .22s var(--ease, ease); }
.hintbar.in { opacity: 1; transform: translate(-50%, 0); }
.hintbar.out { opacity: 0; transform: translate(-50%, -10px); pointer-events: none; }
.hintbar .h-i { font-size: 20px; line-height: 1; flex: none; }
.hintbar .h-t { font-size: 13px; line-height: 1.4; }
.hintbar .h-a { flex: none; border: 0; border-radius: 10px; padding: 7px 11px; background: var(--accent); color: #fff; font: inherit; font-weight: 600; font-size: 12.5px; cursor: pointer; }
.hintbar .h-a:hover { filter: brightness(1.08); }
.hintbar .h-x { flex: none; border: 0; background: transparent; color: var(--ink); opacity: .55; font-size: 17px; line-height: 1; padding: 4px 6px; border-radius: 8px; cursor: pointer; }
.hintbar .h-x:hover { opacity: .9; background: var(--hover); }
@media (prefers-reduced-motion: reduce) { .hintbar { transition: none; } }`;
  document.head.appendChild(st);
}

function dismissActive() {
  if (!active) return;
  const root = active; active = null;
  root.classList.remove('in'); root.classList.add('out');
  setTimeout(() => root.remove(), 240);
}
// Подсказка может не поместиться (открыто видео/история/«Прикрыться» или показана другая) — тогда откладываем, не теряем.
// Пока открыто окно (настройки, магазин, профиль), меню или звонок — подсказка подождёт:
// иначе она ложится поверх окна и закрывает кнопки, как было с «Включите push-уведомления».
// Занят экран: открыто окно, меню, вставка или человек смотрит клипы/играет — тогда не мешаем.
const busy = () => !!(S.modals && S.modals.length) || !!(S.menu) || !!(S.dock && S.dock.open)
  || !!(S.ui && (S.ui.feed === 'video' || S.ui.game))
  || !!(document.querySelector && document.querySelector('.miniapp.gamefull, .overlay .miniapp'));
function canShow(id, { gap = 20e3, per = 2, force = false } = {}) {
  if (seen(id)) return false;
  if (active || S.viewer || S.storyView || S.ui.boss || busy()) return false;
  if (!force && perLoad >= per) return false;
  if (Date.now() - lastShown < gap) return false;
  return true;
}
export function hint(id, text, { icon = '💡', action, onAction, gap, per, force = false, delay = 0 } = {}) {
  const fire = () => {
    if (!canShow(id, { gap, per, force })) return false;
    mark(id); perLoad++; lastShown = Date.now();
    styleOnce();
    const root = document.createElement('div');
    root.className = 'hintbar'; root.setAttribute('role', 'status'); root.setAttribute('aria-live', 'polite');
    const i = document.createElement('span'); i.className = 'h-i'; i.setAttribute('aria-hidden', 'true'); i.textContent = icon; root.appendChild(i);
    const t = document.createElement('span'); t.className = 'h-t'; t.textContent = text; root.appendChild(t);
    const kill = () => { clearTimeout(timer); dismissActive(); };
    if (action) { const a = document.createElement('button'); a.className = 'h-a'; a.type = 'button'; a.textContent = action; a.addEventListener('click', () => { kill(); try { onAction && onAction(); } catch (e) { /* тихо */ } }); root.appendChild(a); }
    const x = document.createElement('button'); x.className = 'h-x'; x.type = 'button'; x.setAttribute('aria-label', 'Скрыть подсказку'); x.textContent = '×'; x.addEventListener('click', kill); root.appendChild(x);
    const timer = setTimeout(() => { dismissActive(); }, 12000);
    root.addEventListener('keydown', e => { if (e.key === 'Escape') kill(); });
    document.body.appendChild(root); active = root;
    requestAnimationFrame(() => root.classList.add('in'));
    return true;
  };
  if (delay) { setTimeout(fire, delay); return true; }
  return fire();
}

// ─── «Включить уведомления» — мягкое напоминание (до трёх раз, дальше отстаём) ───
const isNative = () => !!(window.NudistApp || / NudistAndroid\//.test(navigator.userAgent));
const webPerm = () => ('Notification' in window ? Notification.permission : 'unsupported');
function remindNotif() {
  const n = local.get('hint.notif', 0);
  if (n >= 3) return;
  if (S.settings.notif === false) return;                       // человек сам выключил системные — не напоминаем
  const native = isNative(), perm = native ? 'apk' : webPerm();
  if (!native && (perm === 'granted')) { local.set('hint.notif', 99); return; }   // включил — больше не беспокоим
  if (!native && perm === 'unsupported') return;
  if (!native && perm === 'denied') return hint('notif-denied', 'Уведомления заблокированы браузером. Чтобы не пропускать сообщения: значок слева от адресной строки → разрешить.', { icon: '🔕', delay: 13000 });
  const fire = () => {
    if (active || S.viewer || S.storyView || S.ui.boss || busy() || perLoad >= 2) { setTimeout(fire, 8000); return; }   // не влезаем на полпути — доскажем позже в этом же заходе
    const now = Date.now(); if (now - lastShown < 20e3) { setTimeout(fire, 5000); return; }
    local.set('hint.notif', n + 1); perLoad++; lastShown = now;
    styleOnce();
    const root = document.createElement('div');
    root.className = 'hintbar'; root.setAttribute('role', 'status'); root.setAttribute('aria-live', 'polite');
    const i = document.createElement('span'); i.className = 'h-i'; i.setAttribute('aria-hidden', 'true'); i.textContent = '🔔'; root.appendChild(i);
    const t = document.createElement('span'); t.className = 'h-t'; t.textContent = native ? 'Включите push-уведомления — иначе можно пропустить сообщения, когда приложение свернуто.' : 'Включите уведомления — иначе можно пропустить сообщения, когда вкладка в фоне.'; root.appendChild(t);
    const kill = () => { clearTimeout(timer); dismissActive(); };
    const a = document.createElement('button'); a.className = 'h-a'; a.type = 'button'; a.textContent = native ? 'Настроить' : 'Включить';
    a.addEventListener('click', async () => {
      kill();
      try {
        if (native) { const g = await import('./growth.js'); g.openPush(); return; }
        const p = await Notification.requestPermission();
        if (p === 'granted') { local.set('hint.notif', 99); toast('Уведомления включены. Теперь вы ничего не пропустите.'); }
      } catch (e) { /* отказался — живём */ }
    });
    root.appendChild(a);
    const x = document.createElement('button'); x.className = 'h-x'; x.type = 'button'; x.setAttribute('aria-label', 'Не напоминать сейчас'); x.textContent = '×'; x.addEventListener('click', kill); root.appendChild(x);
    const timer = setTimeout(dismissActive, 14000);
    document.body.appendChild(root); active = root;
    requestAnimationFrame(() => root.classList.add('in'));
  };
  setTimeout(fire, 9000);
}

// ─── Заход в приложение ───
export function appEntryHints() {
  const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  // В приложении подсказка «Ctrl+K» бессмысленна, а в полноэкранной ленте клипов вообще закрывает видео — там молчим.
  if (!coarse && window.NudistApp) return remindNotif();
  if (S.ui && (S.ui.hub === 'feed' || S.ui.feed === 'video')) return remindNotif();
  hint('welcome-1', coarse ? 'Внизу — «Чаты», «Лента», «Хаб» и «Магазин». Поиск по всем чатам — значок сверху.' : 'Ctrl+K — поиск · Ctrl+, — настройки · двойной щелчок по сообщению — быстрый ответ · Esc — закрыть панель.', { icon: '👋', delay: 2500, per: 2, gap: 0 });
  remindNotif();
}
// ─── Открытие чего-либо ───
export const chatFirstHint = () => hint('chat-first', 'Свайп вправо по сообщению — ответить. Двойной щелчок — быстрый ответ, правая кнопка — меню.', { icon: '💬', delay: 1200, per: 2, gap: 0 });
export const hubFirstHint = () => hint('hub-first', 'Здесь живут события, музыка, мини-игры и поддержка. Обещанные призы сезонов — тоже тут.', { icon: '✨', delay: 600, per: 2, gap: 0 });
export const shopFirstHint = () => hint('shop-first', 'Листики 🍃 тратятся на Премиум, рамки и бусты вашей группы. Ежедневный бонус — на вкладке магазина, маленькая точка внизу.', { icon: '🛍️', delay: 1400, per: 2, gap: 0, force: true });
// Рейв: у хозяина — что умеет, у гостя — почему лента идёт сама. Показываем один раз за устройство.
export const raveHostHint = () => hint('rave-host', 'Вы хозяин комнаты: пауза и перемотка видны всем сразу, ссылку на видео слышат все. Микрофон вверху — общий голос, как в звонке.', { icon: '🎬', delay: 700, per: 1, gap: 0, force: true });
export const raveGuestHint = () => hint('rave-guest', 'Ленту ведёт хозяин: клип, пауза и перемотка приходят к вам сами. Говорить можно микрофоном вверху — или писать в чат рядом.', { icon: '🎧', delay: 900, per: 1, gap: 0, force: true });
// Звонок: что нажимать, чтобы тебя слышали
export const callFirstHint = () => hint('call-first', 'Микрофон выключен по умолчанию — включите кнопкой внизу. Если вас не слышно, проверьте «Микрофон» в меню звонка: там же выбор динамика.', { icon: '🎙️', delay: 1500, per: 1, gap: 0, force: true });
