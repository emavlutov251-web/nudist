// Нативная оболочка Android: приложение «Нудист» рисует нижнюю панель само, на своём языке.
// Страница сообщает ей, что происходит (вошёл ли человек, в каком разделе, сколько непрочитанных),
// и открывает разделы по просьбе панели.
//
// Зачем: по правилам RuStore приложение не должно быть одной лишь обёрткой сайта. Панель внизу —
// родная часть Android-приложения: она работает без интернета, не зависит от загрузки страницы,
// а нажатия в ней открывают разделы мессенджера через обычные функции интерфейса.
//
// Мост включается только в приложении (window.NudistApp.nav). В браузере файл ничего не делает.
import { S, bump, on, local } from './lib.js';
import { openHub } from './hub.js';
import { openChat, closeChat } from './store.js';

const app = () => (typeof window !== 'undefined' && window.NudistApp) || null;
export const nativeNav = () => { const a = app(); try { return !!(a && typeof a.nav === 'function'); } catch (e) { return false; } };

/** Текущий раздел для панели: chats | feed | hub | shop | profile */
function section() {
  if (!S.me) return 'auth';
  const u = S.ui;
  if (S.modals.length && S.tab === 'shop') return 'shop';
  if (u.hub === 'feed') return 'feed';
  if (u.hub) return 'hub';
  if (S.modals.length) return 'modal';
  if (u.chat && !u.list) return 'chat';
  return 'chats';
}

function unread() {
  let n = 0;
  for (const c of Object.values(S.chats || {})) if (!c.muted) n += c.unread || 0;
  return n > 99 ? 99 : n;
}

let lastPush = '';
function push() {
  const a = app();
  if (!a || typeof a.nav !== 'function') return;
  const data = { section: section(), unread: unread(), authed: !!S.me };
  const s = JSON.stringify(data);
  if (s === lastPush) return;      // не дёргаем приложение без изменений
  lastPush = s;
  try { a.nav(s); } catch (e) { /* старая сборка */ }
}

/** Нажатие на кнопку нативной панели. Вызывается из MainActivity через evaluateJavascript. */
export function navTap(where) {
  if (!S.me) return false;
  if (where === 'chats') { for (const m of S.modals) { S.modals = []; break; } if (S.ui.hub) S.ui.hub = null; closeChat(); bump(); return true; }
  if (where === 'feed') { openHub('feed'); return true; }
  if (where === 'hub') { openHub(); return true; }
  if (where === 'shop') { import('./shop.js').then(m => m.openShop()).catch(() => {}); return true; }
  if (where === 'profile') { import('./settings.js').then(m => m.openSettings('profile')).catch(() => {}); return true; }
  return false;
}
window.nudistNavTap = navTap;

if (app()) {
  // Панель рисует приложение: убираем отступ под веб-панель, иначе внизу останется пустая полоса.
  try { document.documentElement.classList.add('native-nav'); } catch (e) { /* не страшно */ }
  local.set('hint.welcome-1', true);      // «внизу — Чаты, Лента, Хаб…»: панель теперь своя, подсказка не нужна
  on('init', () => setTimeout(push, 300));
  setInterval(push, 1500);
  window.addEventListener('focus', push);
}
export { push as pushNativeNav };
