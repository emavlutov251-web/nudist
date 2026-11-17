// Локализация «Нудиста».
// Схема — как в Telegram: ключом является оригинальная (русская) фраза интерфейса,
// значением — перевод. Ки был написан по-русски, поэтому поиск идёт по точному совпадению строки.
// Рабочие источники:
//   1. Встроенный пакет «English (beta)» — ниже в этом файле;
//   2. Пользовательские .strings-пакеты (формат Telegram: "ключ" = "перевод";), импортируются
//      в настройках («Язык» → «Импортировать из Telegram…») и хранятся только на этом устройстве.
// Ключи, которых нет в пакете, показываются по-русски — ничего не «ломается».
const LS_LANG = 'nudist.lang', LS_PACKS = 'nudist.langpacks';

const EN = {
  // ── нижняя панель / вкладки
  'Чаты': 'Chats', 'Лента': 'Feed', 'Хаб': 'Hub', 'Магазин': 'Shop', 'Профиль': 'Profile',
  'Все': 'All', 'Личные': 'Direct', 'Группы': 'Groups', 'Боты': 'Bots', 'Непрочитанные': 'Unread', 'Избранное': 'Saved',
  'События': 'Events', 'Музыка': 'Music', 'Игры': 'Games', 'Поддержка': 'Support', 'Видео': 'Video', 'Мои': 'Mine',
  // ── вход
  'С возвращением': 'Welcome back', 'Регистрация': 'Sign up', 'Создать аккаунт': 'Create account',
  'Восстановление доступа': 'Recover access', 'Вход по номеру': 'Sign in with phone',
  'Войти': 'Sign in', 'Войти через Telegram': 'Sign in with Telegram', 'Через Telegram — без пароля': 'Via Telegram — no password',
  'Забыли пароль?': 'Forgot password?', 'Впервые здесь? Создать аккаунт · Забыли пароль?': 'New here? Create an account · Forgot password?',
  // ── общие кнопки
  'Сохранить': 'Save', 'Отмена': 'Cancel', 'Отменить': 'Cancel', 'Удалить': 'Delete', 'Закрыть': 'Close', 'Назад': 'Back',
  'Копировать': 'Copy', 'Скопировать': 'Copy', 'Скопировано': 'Copied', 'Повторить': 'Retry', 'Понятно': 'Got it',
  'Создать': 'Create', 'Скачать': 'Download', 'Загрузить': 'Upload', 'Добавить': 'Add', 'Применить': 'Apply', 'Изменить': 'Change',
  'Выйти': 'Sign out', 'Продолжить': 'Continue', 'Подтвердить': 'Confirm', 'Разрешить': 'Allow', 'Проверить уведомление': 'Test notification',
  'Добавить в друзья': 'Add friend', 'Добавить в список': 'Add to list',
  'Да': 'Yes', 'Нет': 'No', 'Готово': 'Done', 'Очистить': 'Clear', 'Выйти из аккаунта': 'Sign out', 'Сохранено': 'Saved',
  // ── настройки
  'Язык': 'Language', 'Вернуть русский': 'Back to Russian',
  'Тема': 'Theme', 'Как в системе': 'System default', 'Светлая': 'Light', 'Тёмная': 'Dark', 'Загар ★': 'Tan ★', 'Конопля 🌿': 'Hemp 🌿',
  'Простой режим': 'Simple mode', 'Стиль': 'Style', 'Акцент': 'Accent', 'Цвет акцента': 'Accent color', 'Фон чата': 'Chat background',
  'Сбросить оформление': 'Reset appearance', 'Высокий контраст': 'High contrast', 'Анимации': 'Animations',
  'О чём уведомлять': 'Notify about', 'Личные сообщения': 'Direct messages', 'Каналы': 'Channels', 'Комнаты групп': 'Group rooms',
  'Не беспокоить': 'Do not disturb', 'Тихие часы': 'Quiet hours', 'Медиа': 'Media', 'Стикеры': 'Stickers',
  'Опасная зона': 'Danger zone', 'Удалить аккаунт': 'Delete account', 'Чёрный список': 'Blocked', 'Шифрование': 'Encryption',
  'Двухфакторная защита': 'Two-factor authentication', 'Фильтр слов': 'Word filter', 'Аккаунты на этом устройстве': 'Accounts on this device',
  'Сохранить профиль': 'Save profile', 'О себе': 'About me',
  // ── магазин / премиум
  'Премиум': 'Premium', 'Листики': 'Leaves', 'Подписка': 'Subscription', 'Украшения': 'Wearables', 'Наборы': 'Bundles', 'Сезон': 'Season',
  'Цены и оплата': 'Pricing', 'Оферта': 'Terms', 'Контакты и реквизиты': 'Contacts and details', 'Политика конфиденциальности': 'Privacy policy',
  // ── чаты и общее
  'Поиск': 'Search', 'Настройки': 'Settings', 'Сообщение': 'Message', 'Сообщения': 'Messages', 'Канал': 'Channel',
  'Написать': 'Write', 'Участники': 'Members', 'Архив': 'Archive', 'Премиум-подписка': 'Premium subscription',
  // ── вход: метки и слоганы
  'Пароль': 'Password', 'минимум 6 символов': 'at least 6 characters', 'QR-код': 'QR code',
  'Мессенджер, которому нечего скрывать.': 'The messenger with nothing to hide.',
  'Скрывать нечего. Но шифруем на совесть.': 'Nothing to hide. But encrypted for real.',
  'Голая правда и немного стикеров.': 'Naked truth and a little stickers.',
  'Одежда — по желанию. Двухфакторка — обязательно.': 'Clothes optional. Two-factor mandatory.',
  'Впервые здесь?': 'New here?',
  // ── согласие / политика
  'Читать полностью': 'Read fully', 'Принимаю': 'I accept', 'Не согласен — выйти из аккаунта': 'Disagree — sign out',
  'Для аккаунта нужны только username и пароль. Телефон, город и дата рождения — по желанию.': 'Only a username and password are needed for an account. Phone, city and birthday are optional.',
  'Год рождения и возраст другим не показываются: в профиле виден только день и месяц.': 'Your year of birth and age are never shown to anyone — only day and month in your profile.',
  'Обычные чаты хранятся на сервере, секретные зашифрованы от всех, включая нас.': 'Regular chats are stored on the server; secret chats are encrypted from everyone — including us.',
  'Данные не продаются, рекламы нет. Аккаунт можно удалить в настройках.': 'Data is never sold, there are no ads. You can delete your account in settings.',
  // ── сервис
  'Ошибка': 'Error', 'Уведомление': 'Notification', 'Загрузка…': 'Loading…', 'Загружаем…': 'Loading…', 'Ссылка скопирована': 'Link copied',
  'Попробовать': 'Try', 'Ещё': 'More', 'Ещё раз': 'Again', 'Открыть': 'Open',
  '_name': 'English (beta)',
};

function loadLang() { try { return localStorage.getItem(LS_LANG) || 'ru'; } catch (e) { return 'ru'; } }
function loadPacks() { try { return JSON.parse(localStorage.getItem(LS_PACKS) || '{}'); } catch (e) { return {}; } }
function savePacks(p) { try { localStorage.setItem(LS_PACKS, JSON.stringify(p)); } catch (e) { /* приватный режим — только в памяти */ } }

const state = { lang: 'ru', custom: {} };
if (typeof localStorage !== 'undefined') { state.lang = loadLang(); state.custom = loadPacks(); }
const listeners = new Set();

function activePack() {
  if (state.lang === 'ru') return null;
  if (state.lang === 'en') return EN;
  const p = state.custom[state.lang];
  return (p && p.strings) || null;
}

export function t(ru) { const p = activePack(); return (p && p[ru]) || ru; }

export function getLang() { return state.lang; }

export function listPacks() {
  const out = [{ id: 'ru', name: 'Русский' }, { id: 'en', name: EN._name || 'English (beta)' }];
  for (const id of Object.keys(state.custom)) out.push({ id: id, name: state.custom[id].name || id });
  return out;
}

export function setLang(id) {
  state.lang = listPacks().some(p => p.id === id) ? id : 'ru';
  try { localStorage.setItem(LS_LANG, state.lang); } catch (e) {}
  for (const fn of listeners) try { fn(state.lang); } catch (e) {}
  queueApply();
  return state.lang;
}

export function onLangChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// Разбор .strings-файла Telegram: строки вида "ключ" = "перевод";  ключи с «_» в начале — служебные.
export function parseStrings(text) {
  const out = {};
  const src = String(text || '').replace(/\/\*[\s\S]*?\*\//g, ' ');
  const un = s => s.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\\\/g, '\\');
  const re = /"((?:[^"\\\n]|\\.)+)"\s*=\s*"((?:[^"\\\n]|\\.)*)"\s*;?/g;
  let m;
  while ((m = re.exec(src))) out[un(m[1])] = un(m[2]);
  // Android-строки Telegram: <string name="ключ">перевод</string>
  const xml = /<string\s+name="((?:[^"\\]|\\.)+)">([^<]*)<\/string>/g;
  while ((m = xml.exec(src))) out[m[1]] = m[2].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
  return out;
}

export function importStrings(name, text) {
  const strings = parseStrings(text);
  const keys = Object.keys(strings).filter(k => k[0] !== '_');
  if (!keys.length) return { ok: false, error: 'В файле не нашлось ни одной пары «ключ = значение».' };
  const id = 'custom:' + (Date.now().toString(36));
  const nm = (name || '').replace(/\.strings$/i, '').trim() || strings._name || 'Свой пакет';
  state.custom[id] = { name: nm, strings, ts: Date.now() };
  savePacks(state.custom);
  state.lang = id;
  try { localStorage.setItem(LS_LANG, id); } catch (e) {}
  for (const fn of listeners) try { fn(id); } catch (e) {}
  queueApply();
  return { ok: true, id, name: nm, count: keys.length };
}

export function removePack(id) {
  if (!state.custom[id]) return false;
  delete state.custom[id];
  savePacks(state.custom);
  if (state.lang === id) setLang('ru');
  return true;
}

// ── Применение к DOM ─────────────────────────────────────────────
const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'CODE', 'PRE', 'KBD']);
let busy = false, queued = false;

function translateTextNode(node) {
  const raw = node.nodeValue, key = raw.trim();
  if (!key) return;
  const val = t(key);
  if (val !== key) node.nodeValue = raw.replace(key, val);
}

function applyToRoot(root) {
  if (!root) return;
  const p = activePack(); if (!p) return;
  busy = true;
  try {
    const doc = root.nodeType === 9 ? root : root.ownerDocument || document;
    const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const n of nodes) if (n.parentNode && !SKIP.has(n.parentNode.tagName) && !n.parentNode.closest('[data-i18n-skip]')) translateTextNode(n);
    if (root.querySelectorAll) {
      for (const el of root.querySelectorAll('[placeholder],[title],[aria-label]')) {
        for (const attr of ['placeholder', 'title', 'aria-label']) {
          const v = el.getAttribute(attr); if (!v) continue;
          const key = v.trim(); const val = t(key);
          if (val !== key) el.setAttribute(attr, val);
        }
      }
    }
  } finally { busy = false; }
}

function applyAll() { applyToRoot(document); }

function queueApply() {
  if (queued || typeof document === 'undefined') return;
  queued = true;
  const run = () => { queued = false; applyAll(); };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run); else setTimeout(run, 16);
}

function start() {
  if (typeof document === 'undefined' || !document.body) return;
  const obs = new MutationObserver(muts => {
    if (busy || state.lang === 'ru') return;
    for (const m of muts) {
      if (m.type === 'childList' && (m.addedNodes.length)) { queueApply(); return; }
      if (m.type === 'characterData') { queueApply(); return; }
      if (m.type === 'attributes') { queueApply(); return; }
    }
  });
  obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'title', 'aria-label'] });
  applyAll();
}

export const i18n = { t, getLang, setLang, listPacks, importStrings, removePack, onLangChange, apply: applyAll, en: EN };

if (typeof window !== 'undefined') window.NudistI18n = i18n;

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
}
