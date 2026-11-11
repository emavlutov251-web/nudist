// Ядро клиента: состояние, сеть, утилиты, базовые компоненты.
import { html, render, Component, useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect, useReducer } from '/vendor/preact.js';
import { ICONS } from './icons.js';
export { html, render, Component, useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect, useReducer };

// ───── состояние
export const DEFAULT_SETTINGS = {
  theme: 'system', accent: '', fontSize: 15, wallpaper: 'leaves', anim: true, contrast: false, flat: 'auto', enterSend: true, timeFmt: 24,
  sound: true, notif: true, preview: true, notifSound: 'ding', notifDm: true, notifGroup: true, notifChannel: false, notifServer: false, dnd: { on: false, from: '23:00', to: '08:00' },
  emojiAuto: true, stickerSize: 160, compress: 'high', autoDl: { photo: true, video: true, gif: true }, nakedTyping: false,
  noise: true, echo: true, ptt: false, scale: 1, transcribe: false, folders: [], recentEmoji: ['👍', '❤️', '😂', '🔥', '🍃', '😮', '😢', '🙏'], gifs: [], stickers: [], hiddenPacks: [], searchHistory: [], autoArchive: false, beta: false, bossTitle: 'Отчёт_Q3_финал_v7.xlsx',
};
export const S = {
  token: null, ready: false, offline: false, me: null, users: {}, chats: {}, servers: {}, msgs: {}, hist: {}, typing: {}, rooms: {}, stories: [], flags: {}, prices: {}, sys: null, conn: null,
  settings: structuredClone(DEFAULT_SETTINGS), toasts: [], modals: [], menu: null, viewer: null, storyView: null, player: null,
  ui: { chat: null, thread: null, server: null, folder: 'all', panel: false, list: true, archive: false, q: '', reply: null, edit: null, sel: null, boss: false, jump: null, trail: [] },
};
window.__S = S; // для отладки
let scheduled = false; const subs = new Set();
export const onBump = f => { subs.add(f); };
export function bump() { if (scheduled) return; scheduled = true; requestAnimationFrame(() => { scheduled = false; for (const f of subs) f(); }); }
export function useStore() { const [, f] = useReducer(x => x + 1, 0); useEffect(() => { subs.add(f); return () => subs.delete(f); }, []); }

// ───── утилиты
export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const cx = (...a) => a.flat().filter(Boolean).join(' ');
export const plural = (n, f) => { n = Math.abs(n) % 100; const k = n % 10; return f[n > 10 && n < 20 ? 2 : k === 1 ? 0 : k >= 2 && k <= 4 ? 1 : 2]; };
export const debounce = (fn, ms) => { let t; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; d.cancel = () => clearTimeout(t); return d; };
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const uid = () => Math.random().toString(36).slice(2, 10);
const pad = n => String(n).padStart(2, '0');
export const fmtTime = t => { const d = new Date(t); if (S.settings.timeFmt === 12) { const h = d.getHours() % 12 || 12; return `${h}:${pad(d.getMinutes())} ${d.getHours() < 12 ? 'AM' : 'PM'}`; } return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const DAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const dayStart = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return +d; };
export const sameDay = (a, b) => dayStart(a) === dayStart(b);
export function fmtDay(t) { const diff = Math.round((dayStart(Date.now()) - dayStart(t)) / 864e5); const d = new Date(t); if (diff === 0) return 'Сегодня'; if (diff === 1) return 'Вчера'; return `${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : ''}`; }
export function fmtShort(t) { const diff = Math.round((dayStart(Date.now()) - dayStart(t)) / 864e5); const d = new Date(t); if (diff === 0) return fmtTime(t); if (diff < 7 && diff > 0) return DAYS[d.getDay()]; return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${String(d.getFullYear()).slice(2)}`; }
export const fmtFull = t => `${fmtDay(t)}, ${fmtTime(t)}`;
export const fmtSize = b => b < 1024 ? b + ' Б' : b < 1048576 ? (b / 1024).toFixed(0) + ' КБ' : b < 1073741824 ? (b / 1048576).toFixed(1) + ' МБ' : (b / 1073741824).toFixed(2) + ' ГБ';
export const fmtDur = s => { s = Math.max(0, Math.round(s || 0)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return (h ? h + ':' + pad(m) : m) + ':' + pad(s % 60); };
export const fmtNum = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace('.0', '') + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'K' : n >= 1e3 ? (n / 1e3).toFixed(1).replace('.0', '') + 'K' : String(n);
export const userName = u => !u ? 'Кто-то' : u.deleted ? 'Удалённый аккаунт' : [u.name, u.last].filter(Boolean).join(' ') || u.username || 'Без имени';
export function lastSeen(u) {
  if (!u || u.deleted) return 'аккаунт удалён'; if (u.bot) return 'бот'; if (u.hidden) return 'был(а) недавно. Или давно. Скрывает.'; if (u.online) return 'в сети';
  if (!u.seen) return 'не в сети'; const d = Date.now() - u.seen;
  if (d < 60e3) return 'был(а) только что'; if (d < 3600e3) { const m = Math.round(d / 60e3); return `был(а) ${m} ${plural(m, ['минуту', 'минуты', 'минут'])} назад`; }
  if (sameDay(u.seen, Date.now())) return 'был(а) сегодня в ' + fmtTime(u.seen); if (d < 2 * 864e5) return 'был(а) вчера в ' + fmtTime(u.seen);
  return 'был(а) ' + fmtDay(u.seen).toLowerCase();
}
export const TTL_OPTS = [[0, 'Выкл'], [1, '1 секунда'], [5, '5 секунд'], [30, '30 секунд'], [60, '1 минута'], [3600, '1 час'], [86400, '1 день'], [604800, '1 неделя']];
export const ttlLabel = s => (TTL_OPTS.find(o => o[0] === s) || [0, s + ' сек'])[1];
export function copyText(t) { (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).catch(() => { const a = document.createElement('textarea'); a.value = t; document.body.append(a); a.select(); try { document.execCommand('copy'); } catch (e) { /* не вышло */ } a.remove(); }); toast('Скопировано'); }
export function download(name, data, type = 'application/octet-stream') { const a = document.createElement('a'); a.href = typeof data === 'string' && data.startsWith('/') ? data + '?n=' + encodeURIComponent(name) : URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type })); a.download = name; document.body.append(a); a.click(); a.remove(); }

// ───── имена и аватары чатов
export const AV_COLORS = ['#E2552D', '#C7822F', '#1F9D57', '#0D7C8C', '#3F6FD8', '#8B55D9', '#D1468C', '#5E6B66'];
export function chatInfo(c) {
  if (!c) return { title: 'Чат', color: 0 };
  if (c.type === 'saved') return { title: 'Избранное', saved: true, color: 2, sub: 'личный склад всего' };
  if (c.type === 'dm' || c.type === 'secret') { const u = S.users[c.peer]; return { title: userName(u), avatar: u && u.avatar, color: u ? u.color : 7, user: u, secret: c.type === 'secret', verified: u && (u.badges || []).includes('verified') }; }
  if (c.server) return { title: c.title, kind: c.kind, color: 7 };
  return { title: c.title, avatar: c.avatar, color: c.color || 0, verified: c.verified };
}
export const kindIcon = k => ({ voice: 'volume-2', stage: 'radio', announce: 'megaphone', forum: 'messages-square', rules: 'scroll-text' }[k] || 'hash');
export const isMuted = c => !!c && c.mute > Date.now();
export function svcText(m) {
  if (/^(канал создан|создан секретный чат)/.test(m.text || '')) return m.text[0].toUpperCase() + m.text.slice(1);
  if (m.from !== S.me.id) return userName(S.users[m.from]) + ' ' + m.text;
  return 'Вы ' + (m.text || '').replace(/^не нашёл\(ла\)/, 'не нашли').replace(/^не прошёл\(ла\)/, 'не прошли').replace(/^(\S+)л\(а\)/, '$1ли').replace(/^(\S+)[её]н\(а\)/, '$1ены').replace(/покидает/, 'покидаете').replace('Листок изъят.', 'Листок изъят.');
}
export function msgPreview(m, chat) {
  if (!m) return '';
  if (m.enc && !m.text) return '🔒 зашифрованное сообщение';
  const t = { photo: '🖼 Фото', video: '🎬 Видео', file: '📎 ' + ((m.media || {}).name || 'Файл'), audio: '🎵 ' + ((m.media || {}).name || 'Аудио'), voice: '🎤 Голосовое', round: '⭕ Кружочек', gif: 'GIF', sticker: (m.sticker || {}).e + ' Стикер', loc: '📍 Геопозиция', contact: '👤 Контакт', poll: '📊 ' + ((m.poll || {}).q || 'Опрос'), call: (m.call || {}).missed ? '📵 Пропущенный звонок' : '📞 Звонок' }[m.type];
  if (m.type === 'service') return svcText(m);
  const txt = (m.text || '').replace(/\s+/g, ' ').replace(/[*_~`|]{2}|`/g, '').slice(0, 120);
  return (m.title ? m.title + ': ' : '') + (t ? t + (txt ? ', ' + txt : '') : txt);
}

// ───── подсветка кода и Markdown
const KW = /^(?:const|let|var|function|return|if|else|elif|for|while|class|import|export|from|def|async|await|new|try|catch|except|finally|throw|raise|public|private|static|void|int|float|string|bool|true|false|null|None|True|False|undefined|fn|func|struct|type|interface|package|use|in|of|switch|case|break|continue|do|this|self|lambda|yield|with|as|not|and|or|SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|JOIN|echo|then|fi|done)$/;
function hl(code, lang) {
  const hash = /^(py|python|sh|bash|zsh|rb|ruby|ya?ml|toml|r|pl|perl|conf|ini|dockerfile)$/i.test(lang || '');
  const re = new RegExp('(\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/' + (hash ? '|#[^\\n]*' : '') + ')|("(?:\\\\.|[^"\\\\\\n])*"|\'(?:\\\\.|[^\'\\\\\\n])*\'|`(?:\\\\.|[^`\\\\])*`)|(\\b\\d+(?:\\.\\d+)?\\b)|([A-Za-z_$][\\w$]*)|([\\s\\S])', 'g');
  return code.replace(re, (m, c, s, n, w) => c ? `<i class="hc">${esc(c)}</i>` : s ? `<i class="hs">${esc(s)}</i>` : n ? `<i class="hn">${n}</i>` : w ? (KW.test(w) ? `<i class="hk">${w}</i>` : w) : esc(m));
}
const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|\u200d|\ufe0f|\s){1,12}$/u;
const mdCache = new Map();
export function md(src, opt = {}) {
  if (!src) return '';
  const key = (opt.emojis ? opt.key || '' : '') + '\u0000' + src;
  let out = mdCache.get(key); if (out !== undefined) return out;
  const stash = []; const keep = h => '\u0001' + (stash.push(h) - 1) + '\u0002';
  let s = src.replace(/```([\w+#-]*)[ \t]*\n?([\s\S]*?)```/g, (m, lang, code) => keep(`<pre class="code"><div class="code-h"><span>${esc(lang || 'код')}</span><button type="button" data-copy>копировать</button></div><code>${hl(code.replace(/\n$/, ''), lang)}</code></pre>`));
  s = s.replace(/`([^`\n]+)`/g, (m, c) => keep(`<code class="mono" data-copyable title="Нажмите, чтобы скопировать">${esc(c)}</code>`));
  s = esc(s);
  s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, t, u) => keep(`<a href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>`));
  s = s.replace(/https?:\/\/[^\s<\u0001]+/g, u => { let tail = ''; const m = u.match(/(?:[.,;:!?)\]}»]|&quot;|&#39;|&gt;)+$/); if (m) { tail = m[0]; u = u.slice(0, -tail.length); } return keep(`<a href="${u}" target="_blank" rel="noopener noreferrer">${u.length > 70 ? u.slice(0, 60) + '…' : u}</a>`) + tail; });
  s = s.replace(/\*\*([^*\n][^\n]*?)\*\*/g, '<b>$1</b>').replace(/__([^_\n][^\n]*?)__/g, '<i>$1</i>').replace(/~~([^~\n]+?)~~/g, '<s>$1</s>').replace(/\|\|([^|\n][^\n]*?)\|\|/g, '<span class="spoiler" data-spoiler title="Снять листок">$1</span>');
  s = s.replace(/(^|[\s(>])@([a-zA-Z][a-zA-Z0-9_]{2,31})\b/g, (m, p, n) => `${p}<a class="mention${opt.me && n.toLowerCase() === opt.me ? ' me' : ''}${/^(all|everyone|here)$/.test(n) ? ' me' : ''}" data-mention="${n}">@${n}</a>`);
  s = s.replace(/(^|[\s(>])#([\p{L}\p{N}_]{2,40})/gu, (m, p, t) => `${p}<a class="tag" data-tag="${t}">#${t}</a>`);
  if (opt.emojis && opt.emojis.length) s = s.replace(/:([a-z0-9_]{2,24}):/g, (m, n) => { const e = opt.emojis.find(x => x.name === n); return e ? `<img class="cemoji" src="${esc(e.url)}" alt=":${n}:" title=":${n}:">` : m; });
  const lines = s.split('\n'); const res = []; let quote = null;
  for (const ln of lines) {
    const q = ln.match(/^&gt;\s?(.*)$/);
    if (q) { (quote = quote || []).push(q[1]); continue; }
    if (quote) { res.push(`<blockquote>${quote.join('<br>')}</blockquote>`); quote = null; }
    const li = ln.match(/^\s*(?:[-•]|(\d+)[.)])\s+(.*)$/);
    res.push(li ? `<div class="li"><span>${li[1] ? li[1] + '.' : '•'}</span><div>${li[2]}</div></div>` : ln + '\n');
  }
  if (quote) res.push(`<blockquote>${quote.join('<br>')}</blockquote>`);
  s = res.join('').replace(/\n$/, '').replace(/\n/g, '<br>');
  for (let i = 0; i < 4 && s.includes('\u0001'); i++) s = s.replace(/\u0001(\d+)\u0002/g, (m, i2) => stash[+i2]);
  if (EMOJI_ONLY.test(src.trim()) && [...src.trim()].length <= 8) s = `<span class="jumbo">${s}</span>`;
  if (mdCache.size > 3000) mdCache.clear();
  mdCache.set(key, s);
  return s;
}

// ───── HTTP и WebSocket
export async function http(path, body) {
  const r = await fetch('/api/' + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
  const j = await r.json().catch(() => ({ error: 'Сервер ответил что-то невнятное' }));
  if (!r.ok || j.error) throw new Error(j.error || 'Ошибка ' + r.status);
  return j;
}
let ws = null, rid = 0, backoff = 500, closing = false; const pending = new Map(), handlers = {};
export const on = (ev, fn) => { (handlers[ev] = handlers[ev] || []).push(fn); };
export function connect() {
  if (!S.token) return; closing = false;
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws?token=' + encodeURIComponent(S.token));
  const my = ws;
  ws.onopen = () => { backoff = 500; };
  ws.onmessage = e => {
    const q = JSON.parse(e.data);
    if (q.id) { const p = pending.get(q.id); if (p) { pending.delete(q.id); q.e ? p.no(new Error(q.e)) : p.ok(q.r === undefined ? true : q.r); } return; }
    for (const f of handlers[q.ev] || []) { try { f(q.d); } catch (err) { console.error('[event ' + q.ev + ']', err); } }
    bump();
  };
  ws.onclose = () => {
    if (ws !== my) return;
    for (const p of pending.values()) p.no(new Error('Соединение потеряно')); pending.clear();
    if (closing || !S.token) return;
    S.offline = true; bump(); setTimeout(connect, backoff); backoff = Math.min(backoff * 2, 8000);
  };
}
export function disconnect() { closing = true; if (ws) ws.close(); ws = null; }
export function rpc(m, p) {
  return new Promise((ok, no) => {
    if (!ws || ws.readyState !== 1) return no(new Error('Нет соединения с сервером'));
    const i = ++rid; pending.set(i, { ok, no }); ws.send(JSON.stringify({ id: i, m, p: p || {} }));
    setTimeout(() => { if (pending.delete(i)) no(new Error('Сервер не отвечает')); }, 30000);
  });
}
/** rpc с показом ошибки тостом; возвращает undefined при ошибке */
export const call = (m, p) => rpc(m, p).catch(e => { toast(e.message, 'err'); });
// Админ-панель: в Android-приложении новых вкладок нет, поэтому открываем в том же окне (назад — ссылка «Вышка» в панели).
export const openAdmin = () => { if (/NudistAndroid/.test(navigator.userAgent)) location.href = '/admin'; else window.open('/admin', '_blank'); };
export function upload(file, { onProgress, name, signal } = {}) {
  return new Promise((ok, no) => {
    const x = new XMLHttpRequest(); x.open('POST', '/api/upload');
    x.setRequestHeader('authorization', 'Bearer ' + S.token); x.setRequestHeader('x-name', encodeURIComponent(name || file.name || 'file')); x.setRequestHeader('content-type', file.type || 'application/octet-stream');
    x.upload.onprogress = e => onProgress && e.lengthComputable && onProgress(e.loaded / e.total);
    x.onload = () => { let j = {}; try { j = JSON.parse(x.responseText); } catch (e) { /* не JSON */ } x.status === 200 ? ok(j) : no(new Error(j.error || 'Не удалось загрузить файл')); };
    x.onerror = () => no(new Error('Сеть подвела: файл не загружен')); x.onabort = () => no(new Error('Загрузка отменена'));
    if (signal) signal.addEventListener('abort', () => x.abort());
    x.send(file);
  });
}
const wantUsers = new Set(); let wantTimer = null;
export function needUsers(ids) {
  for (const i of ids) if (i && !S.users[i]) wantUsers.add(i);
  if (!wantUsers.size || wantTimer) return;
  wantTimer = setTimeout(async () => { wantTimer = null; const l = [...wantUsers]; wantUsers.clear(); try { for (const u of await rpc('users.get', { ids: l })) S.users[u.id] = u; bump(); } catch (e) { /* позже */ } }, 30);
}
export const addUsers = o => { if (o) for (const k in o) S.users[k] = { ...S.users[k], ...o[k] }; };

// ───── настройки
const LS = k => 'nudist.' + k;
export function loadSettings(server) {
  let local = null; try { local = JSON.parse(localStorage.getItem(LS('settings.' + (S.me ? S.me.id : '')))); } catch (e) { /* пусто */ }
  S.settings = { ...structuredClone(DEFAULT_SETTINGS), ...(local || {}), ...(server || {}) };
  applyTheme();
}
const pushSettings = debounce(() => { if (S.ready) rpc('me.settings', { settings: S.settings }).catch(() => {}); }, 800);
export function setSetting(patch, sync = true) {
  Object.assign(S.settings, patch);
  try { localStorage.setItem(LS('settings.' + (S.me ? S.me.id : '')), JSON.stringify(S.settings)); } catch (e) { /* переполнено */ }
  applyTheme(); if (sync) pushSettings(); bump();
}
export function applyTheme() {
  const s = S.settings, r = document.documentElement;
  const sys = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  r.dataset.theme = s.theme === 'system' ? sys : s.theme;
  r.dataset.wall = s.wallpaper; r.dataset.anim = s.anim ? '1' : '0'; r.dataset.contrast = s.contrast ? '1' : '0';
  r.style.setProperty('--fs', (s.fontSize || 15) + 'px');
  if (s.accent) r.style.setProperty('--accent', s.accent); else r.style.removeProperty('--accent');
  const z = s.scale && s.scale !== 1 ? s.scale : 1; r.style.zoom = z === 1 ? '' : z; r.style.setProperty('--zoom', z);
}
if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
export const local = { get: (k, d) => { try { const v = JSON.parse(localStorage.getItem(LS(k))); return v == null ? d : v; } catch (e) { return d; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(LS(k)) : localStorage.setItem(LS(k), JSON.stringify(v)); } catch (e) { /* игнор */ } } };

// ───── тосты, меню, модалки
export function toast(text, kind = '') { if (!text) return; const t = { id: uid(), text, kind }; S.toasts.push(t); bump(); setTimeout(() => { S.toasts = S.toasts.filter(x => x !== t); bump(); }, kind === 'err' ? 5000 : 3000); }
export function showMenu(e, items, opt = {}) {
  if (e && e.preventDefault) { e.preventDefault(); e.stopPropagation(); }
  let x, y; if (opt.anchor || (e && !e.clientX && e.currentTarget)) { const r = (opt.anchor || e.currentTarget).getBoundingClientRect(); x = opt.right ? r.right : r.left; y = r.bottom + 4; } else { x = e.clientX; y = e.clientY; }
  S.menu = { x, y, items: items.filter(Boolean), right: opt.right, head: opt.head }; bump();
}
export const closeMenu = () => { if (S.menu) { S.menu = null; bump(); } };
export function openModal(c, props = {}) { const m = { id: uid(), c, props }; S.modals.push(m); bump(); return m.id; }
export function closeModal(id) { if (id) S.modals = S.modals.filter(m => m.id !== id); else S.modals.pop(); bump(); }
export function Modal({ id, title, children, wide, footer, cls, onClose, icon }) {
  const close = () => { onClose && onClose(); closeModal(id); };
  return html`<div class="overlay" onMouseDown=${e => { if (e.target === e.currentTarget) close(); }}>
    <div class=${cx('modal', wide && 'wide', cls)} role="dialog" aria-modal="true" aria-label=${title}>
      ${title && html`<header class="modal-h">${icon && html`<${Icon} n=${icon} />`}<h2>${title}</h2><button class="ib" onClick=${close} aria-label="Закрыть"><${Icon} n="x" /></button></header>`}
      <div class="modal-b">${children}</div>
      ${footer && html`<footer class="modal-f">${footer}</footer>`}
    </div></div>`;
}
function ConfirmDlg({ id, title, text, ok = 'Да', cancel = 'Отмена', danger, res, check }) {
  const [c, setC] = useState(false);
  const done = v => { res(v ? (check ? { check: c } : true) : false); closeModal(id); };
  return html`<${Modal} id=${id} title=${title} onClose=${() => res(false)} cls="small" footer=${html`<button class="btn ghost" onClick=${() => done(false)}>${cancel}</button><button class=${cx('btn', danger && 'danger')} autofocus onClick=${() => done(true)}>${ok}</button>`}>
    <p class="dlg-text">${text}</p>${check && html`<label class="check"><input type="checkbox" checked=${c} onChange=${e => setC(e.target.checked)} /> ${check}</label>`}<//>`;
}
export const confirmDlg = o => new Promise(res => openModal(ConfirmDlg, { ...o, res }));
function PromptDlg({ id, title, label, value = '', placeholder, ok = 'Готово', res, type = 'text', area, hint, max }) {
  const [v, setV] = useState(value);
  const done = x => { res(x); closeModal(id); };
  return html`<${Modal} id=${id} title=${title} onClose=${() => res(null)} cls="small" footer=${html`<button class="btn ghost" onClick=${() => done(null)}>Отмена</button><button class="btn" onClick=${() => done(v)}>${ok}</button>`}>
    <label class="fld"><span>${label}</span>${area ? html`<textarea rows="4" maxlength=${max} value=${v} placeholder=${placeholder} onInput=${e => setV(e.target.value)} ref=${el => el && !el.dataset.f && (el.dataset.f = 1, el.focus())}></textarea>` : html`<input type=${type} maxlength=${max} value=${v} placeholder=${placeholder} onInput=${e => setV(e.target.value)} onKeyDown=${e => e.key === 'Enter' && done(v)} ref=${el => el && !el.dataset.f && (el.dataset.f = 1, el.focus())} />`}</label>
    ${hint && html`<p class="hint">${hint}</p>`}<//>`;
}
export const promptDlg = o => new Promise(res => openModal(PromptDlg, { ...o, res }));

// ───── базовые компоненты
export function Icon({ n, s = 20, cls }) { return html`<svg class=${cx('ic', cls)} width=${s} height=${s} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" dangerouslySetInnerHTML=${{ __html: ICONS[n] || '' }}></svg>`; }
const LEAF = ['......X......', '.....XXX.....', '..X..XXX..X..', '.XXX.XXX.XXX.', '.XXXXXXXXXXX.', 'X.XXXXXXXXX.X', 'XXXXXXXXXXXXX', 'XXXXXXXXXXXXX', '.XXXXXXXXXXX.', '..XXXXXXXXX..', '...XX.X.XX...', '......X......', '......X......'];
const LEAF_TONES = ['#1F9D57', '#2BB36A', '#178A4A', '#45C97F', '#23A860'];
export function Logo({ s = 40, mono }) {
  const rects = [];
  LEAF.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === 'X') rects.push(html`<rect x=${x} y=${y} width="1.02" height="1.02" fill=${mono ? 'currentColor' : LEAF_TONES[(x * 7 + y * 13 + x * y) % 5]} />`); }));
  return html`<svg class="logo" width=${s} height=${s} viewBox="0 0 13 13" shape-rendering="crispEdges" aria-label="Нудист">${rects}</svg>`;
}
export function Avatar({ src, name, color = 0, s = 44, online, saved, deleted, onClick, square, title }) {
  const ini = (name || '?').replace(/[^\p{L}\p{N} ]/gu, '').trim().split(/\s+/).slice(0, 2).map(w => [...w][0] || '').join('').toUpperCase() || '?';
  const vid = src && /\.(mp4|webm)$/.test(src);
  return html`<span class=${cx('ava', square && 'sq', onClick && 'click')} style=${`width:${s}px;height:${s}px;font-size:${Math.round(s * 0.38)}px;${src ? '' : 'background:' + AV_COLORS[color % 8]}`} onClick=${onClick} title=${title}>
    ${saved ? html`<${Icon} n="bookmark" s=${Math.round(s * 0.5)} />` : deleted ? html`<${Icon} n="ghost" s=${Math.round(s * 0.5)} />` : vid ? html`<video src=${src} autoplay loop muted playsinline></video>` : src ? html`<img src=${src} alt="" loading="lazy" />` : ini}
    ${online && html`<i class="dot"></i>`}</span>`;
}
export function ChatAvatar({ chat, s = 44, online = true }) {
  const i = chatInfo(chat);
  if (chat && chat.server) return html`<span class="ava" style=${`width:${s}px;height:${s}px;background:var(--hover);color:var(--ink2)`}><${Icon} n=${kindIcon(chat.kind)} s=${Math.round(s * 0.5)} /></span>`;
  return html`<${Avatar} src=${i.avatar} name=${i.title} color=${i.color} s=${s} saved=${i.saved} deleted=${i.user && i.user.deleted} online=${online && i.user && i.user.online && !i.user.bot} />`;
}
const BADGES = { verified: ['badge-check', 'Подтверждённый аккаунт', 'var(--sea)'], premium: ['leaf', 'Нудист Голый Премиум', 'var(--warn)'], bot: ['bot', 'Бот', 'var(--ink3)'], staff: ['shield', 'Команда «Нудиста»', 'var(--accent)'], developer: ['wrench', 'Разработчик', 'var(--ink2)'] };
export function Badges({ list, s = 15 }) { return (list || []).filter(b => BADGES[b]).map(b => html`<span class="badge" title=${BADGES[b][1]} style=${'color:' + BADGES[b][2]}><${Icon} n=${BADGES[b][0]} s=${s} /></span>`); }
export function Toggle({ on, onChange, label, hint, disabled }) {
  return html`<label class=${cx('toggle', disabled && 'dis')}><span class="tg-l">${label}${hint && html`<small>${hint}</small>`}</span><input type="checkbox" checked=${!!on} disabled=${disabled} onChange=${e => onChange(e.target.checked)} /><i></i></label>`;
}
export function Tabs({ tabs, value, onChange, cls }) { return html`<div class=${cx('tabs', cls)} role="tablist">${tabs.map(([v, l, n]) => html`<button role="tab" aria-selected=${value === v} class=${cx(value === v && 'on')} onClick=${() => onChange(v)}>${l}${n ? html`<b>${n}</b>` : ''}</button>`)}</div>`; }
export function Empty({ icon = 'leaf', title, text, children }) { return html`<div class="empty"><div class="empty-i"><${Icon} n=${icon} s=${34} /></div>${title && html`<h3>${title}</h3>`}${text && html`<p>${text}</p>`}${children}</div>`; }
export function Spinner() { return html`<div class="spin"><${Logo} s=${28} /></div>`; }
export function useAsync(fn, deps = []) {
  const [st, setSt] = useState({ loading: true });
  const [n, setN] = useState(0);
  useEffect(() => { let live = true; setSt(s => ({ ...s, loading: true })); Promise.resolve().then(fn).then(data => live && setSt({ data }), e => live && setSt({ error: e.message })); return () => { live = false; }; }, [...deps, n]);
  return { ...st, reload: () => setN(x => x + 1) };
}
export function pickFile(accept, multiple) { return new Promise(res => { const i = document.createElement('input'); i.type = 'file'; if (accept) i.accept = accept; i.multiple = !!multiple; i.onchange = () => res(multiple ? [...i.files] : i.files[0]); i.addEventListener('cancel', () => res(multiple ? [] : null)); i.click(); }); }
export function imageSize(file) { return new Promise(res => { const img = new Image(); img.onload = () => { res({ w: img.naturalWidth, h: img.naturalHeight, img }); }; img.onerror = () => res({}); img.src = URL.createObjectURL(file); }); }
export async function compressImage(file, mode = S.settings.compress) {
  if (mode === 'original' || !/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 200e3) { const d = await imageSize(file); return { blob: file, w: d.w, h: d.h, name: file.name }; }
  const { w, h, img } = await imageSize(file); if (!w) return { blob: file, name: file.name };
  const max = mode === 'medium' ? 1280 : 2560, k = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', mode === 'medium' ? 0.72 : 0.86));
  if (!blob || blob.size >= file.size) return { blob: file, w, h, name: file.name };
  return { blob, w: c.width, h: c.height, name: file.name.replace(/\.\w+$/, '') + '.jpg' };
}
export async function uploadAvatar() {
  const f = await pickFile('image/*,video/mp4,video/webm'); if (!f) return null;
  try {
    if (f.type.startsWith('video/') || f.type === 'image/gif') return (await upload(f)).url;
    const { img, w, h } = await imageSize(f); const side = Math.min(w, h), c = document.createElement('canvas'); c.width = c.height = Math.min(512, side);
    c.getContext('2d').drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, c.width, c.height); // кроп по центру в квадрат
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.88));
    return (await upload(blob, { name: 'avatar.jpg' })).url;
  } catch (e) { toast(e.message, 'err'); return null; }
}
