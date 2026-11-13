// Кнопка «Назад»: телефонная, браузерная и из Android-оболочки.
// Экран считается стопкой слоёв: папка → архив → сервер → чат (и чаты, из которых в него перешли) → панели → окна → меню.
// «Назад» снимает верхний слой. Когда слоёв нет, приложение сворачивается (или браузер уходит со страницы).
import { S, bump, onBump, closeMenu, closeModal } from './lib.js';
import { openChat, closeChat } from './store.js';

const MOBILE = 800;
export const backHooks = new Map();          // id окна → функция «шаг назад внутри окна» со свойством depth() — есть ли такой шаг
const narrow = () => innerWidth <= MOBILE;

// Слои снизу вверх. Каждый — функция, которая его снимает.
function layers() {
  const u = S.ui, L = [];
  if (!S.me) return L;
  if (narrow()) {
    if (u.folder && u.folder !== 'all') L.push(() => { u.folder = 'all'; });
    if (u.archive) L.push(() => { u.archive = false; });
    if (u.server) L.push(() => { u.server = null; u.list = true; });
    if (u.chat && !u.list && S.chats[u.chat]) {
      const chat = S.chats[u.chat];
      L.push(() => { if (chat.server) { u.list = true; u.trail = []; } else closeChat(); });                      // из чата — к списку
      for (const _ of (u.trail || [])) L.push(() => { const prev = u.trail.pop(); if (S.chats[prev]) openChat(prev, { noTrail: true }); else closeChat(); });   // к чату, из которого пришли
    }
  }
  if (u.chat && (!narrow() || !u.list)) {
    if (u.panel) L.push(() => { u.panel = false; });
    if (u.thread) L.push(() => { u.thread = null; });
    if (u.reply || u.edit) L.push(() => { u.reply = null; u.edit = null; });
    if (u.sel) L.push(() => { u.sel = null; });
  }
  if (u.hub) L.push(() => { import('./hub.js').then(h => h.closeHub()); });
  if (S.dock && S.dock.open) L.push(() => { import('./dock.js').then(k => k.foldDock()); });
  if (S.dock && S.dock.open && S.dock.full) L.push(() => { S.dock.full = false; });      // …а из полного экрана сначала выходим в окно
  // музыка сворачивается и играет дальше, телевизор выключается
  for (const m of S.modals) {
    L.push(() => { if (m.props && typeof m.props.res === 'function') m.props.res(null); closeModal(m.id); });
    const h = backHooks.get(m.id); if (h && h.depth()) L.push(() => { h(); });          // внутри окна есть свой шаг назад
  }
  if (S.storyView) L.push(() => { S.storyView = null; });
  if (S.viewer) L.push(() => { S.viewer = null; });
  if (S.menu) L.push(() => closeMenu());
  if (u.boss) L.push(() => { u.boss = false; });
  return L;
}

/** Снять верхний слой. false — снимать нечего, приложение можно сворачивать. */
export function goBack() {
  const L = layers(); if (!L.length) return false;
  L[L.length - 1](); bump(); return true;
}
window.nudistBack = goBack;

// ── Синхронизация с историей браузера: на каждый слой — одна запись, чтобы системная «Назад» снимала ровно один слой.
// Работает на узких экранах и в Android-оболочке; на широких экранах историю не трогаем.
let depth = 0, pending = 0, skipHash = false;
// Android-оболочка с версии 1.3 сама зовёт nudistBack() — история ей не нужна. Без неё надёжнее: вставки с чужих сайтов (плеер Яндекс Музыки,
// сайты телеканалов) пишут в общую историю свои записи и сами шагают по ней назад, а со стороны это выглядит как нажатие «Назад».
const nativeBack = () => { try { return !!(window.NudistApp && window.NudistApp.version && Number(window.NudistApp.version()) >= 13); } catch (e) { return false; } };
const enabled = () => !nativeBack() && (narrow() || /NudistAndroid/.test(navigator.userAgent));
const pos = () => (history.state && history.state.nb) || 0;      // номер текущей записи истории в нашей стопке
export const hashFromHistory = () => skipHash;      // hashchange после нашего перехода по истории обрабатывать не нужно
function sync() {
  if (pending) return;
  const want = enabled() ? layers().length : 0;
  while (depth < want) { depth++; history.pushState({ nb: depth }, '', location.href); }
  if (depth > want) { const n = depth - want; depth = want; travel(-n); }
}
// Переход по истории, которого мы ждём. Если между нашими записями оказались записи вставки, шаг уходит ей и popstate к нам не приходит:
// тогда через треть секунды шагаем дальше, пока не вернёмся к своей записи. Без этого кнопка «Назад» переставала работать до перезагрузки.
let timer = 0, hops = 0;
function travel(n) { pending = 1; clearTimeout(timer); timer = setTimeout(settle, 350); try { history.go(n); } catch (e) { /* нет истории */ } }
function settle() {
  if (!pending) return;
  if (pos() > depth && hops < 40) { hops++; travel(-1); return; }
  pending = 0; hops = 0; sync();
}
addEventListener('popstate', () => {
  skipHash = true; setTimeout(() => { skipHash = false; }, 60);
  const p = pos();
  if (pending) { clearTimeout(timer); if (p > depth && hops < 40) { hops++; travel(depth - p); return; } pending = 0; hops = 0; sync(); return; }
  if (p > depth) { travel(depth - p); return; }      // «Вперёд» не поддерживаем: закрытый слой сам не откроется
  while (depth > p) { depth--; if (!goBack()) break; }
  depth = p;
});
// После перезагрузки страницы в истории могли остаться наши старые записи — возвращаемся к основанию стопки.
if (pos() > 0) travel(-pos());
onBump(sync);
