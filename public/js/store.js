// Логика клиента: обработка событий сервера, история, отправка, уведомления, E2EE для секретных чатов.
import { S, bump, on, rpc, call, toast, needUsers, addUsers, loadSettings, local, connect, disconnect, isMuted, msgPreview, chatInfo, userName, uid, setSetting, upload, compressImage, imageSize } from './lib.js';
import { sfx, confetti, shake } from './fun.js';

export const msgKey = (chat, thread) => (thread ? chat + '#' + thread : chat);
const listOf = k => (S.msgs[k] = S.msgs[k] || []);
function insertMsg(k, m) {
  const l = listOf(k); const i = l.findIndex(x => x.id === m.id);
  if (i >= 0) { l[i] = { ...l[i], ...m }; return; }
  let j = l.length; while (j > 0 && !l[j - 1].tmp && l[j - 1].seq > m.seq) j--;
  l.splice(j, 0, m);
}
const eachList = (chatId, fn) => { for (const k in S.msgs) if (k === chatId || k.startsWith(chatId + '#')) fn(S.msgs[k], k); };

// ───── E2EE (секретные чаты): ECDH P-256 → AES-256-GCM. Ключ живёт только в этом браузере.
const subtle = window.crypto && window.crypto.subtle;
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const keyCache = new Map();
export const e2eeAvailable = () => !!subtle;
export async function ensureKey() {
  if (!subtle || !S.me) return null;
  let k = local.get('ecdh.' + S.me.id);
  if (!k) { const kp = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']); k = { priv: await subtle.exportKey('jwk', kp.privateKey), pub: await subtle.exportKey('jwk', kp.publicKey) }; local.set('ecdh.' + S.me.id, k); }
  if (!S.me.pubKey || S.me.pubKey.x !== k.pub.x) await rpc('me.pubkey', { jwk: { kty: 'EC', crv: 'P-256', x: k.pub.x, y: k.pub.y } }).catch(() => {});
  return k;
}
async function chatKey(chat) {
  if (keyCache.has(chat.id)) return keyCache.get(chat.id);
  const my = local.get('ecdh.' + S.me.id); const mine = chat.keys && chat.keys[S.me.id], peer = chat.keys && chat.keys[chat.peer];
  if (!subtle || !my || !mine || !peer || mine.x !== my.pub.x) throw new Error('Ключ этого секретного чата хранится на другом устройстве');
  const priv = await subtle.importKey('jwk', my.priv, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey']);
  const pub = await subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: peer.x, y: peer.y }, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const key = await subtle.deriveKey({ name: 'ECDH', public: pub }, priv, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  keyCache.set(chat.id, key); return key;
}
// Что не так с секретным чатом: 'mine' — его ключ остался на другом моём устройстве, 'peer' — собеседник сменил ключ
// (зашёл с другого устройства или переустановил приложение) и прочитать этот чат там не сможет. null — всё в порядке.
export function secretIssue(chat) {
  if (!chat || chat.type !== 'secret' || !chat.keys || !S.me) return null;
  const my = local.get('ecdh.' + S.me.id), mine = chat.keys[S.me.id], peer = chat.keys[chat.peer], pu = S.users[chat.peer];
  if (!subtle || !my || !mine || mine.x !== my.pub.x) return 'mine';
  if (peer && pu && pu.pubKey && pu.pubKey.x !== peer.x) return 'peer';
  return null;
}
export async function encryptFor(chat, obj) {
  const key = await chatKey(chat), iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
  return { iv: b64(iv), ct: b64(ct) };
}
async function decryptMsg(chat, m) {
  if (!m.enc || m.dec) return m;
  try { const key = await chatKey(chat); const pt = await subtle.decrypt({ name: 'AES-GCM', iv: unb64(m.enc.iv) }, key, unb64(m.enc.ct)); Object.assign(m, JSON.parse(new TextDecoder().decode(pt)), { dec: true }); }
  catch (e) { m.text = '🔒 Не удалось расшифровать: ключ этого чата на другом устройстве'; m.bad = true; m.dec = true; }
  return m;
}
export async function safetyCode(chat) {
  const xs = Object.values(chat.keys || {}).map(k => k.x + k.y).sort().join('|');
  const h = new Uint8Array(await subtle.digest('SHA-256', new TextEncoder().encode(xs)));
  const E = ['🍃', '🌞', '🏖', '🌊', '🐚', '🦀', '🍉', '🧴', '🩴', '⛱', '🐬', '🥥', '🍹', '🕶', '🪁', '🦩'];
  return { emoji: [...h.slice(0, 6)].map(b => E[b % 16]).join(' '), hex: [...h.slice(6, 16)].map(b => b.toString(16).padStart(2, '0')).join('').replace(/(.{5})/g, '$1 ').trim() };
}
export async function encryptFile(blob) {
  const key = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']), iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, await blob.arrayBuffer());
  return { blob: new Blob([ct], { type: 'application/octet-stream' }), k: b64(await subtle.exportKey('raw', key)), iv: b64(iv) };
}
const blobCache = new Map();
export async function mediaUrl(media) {
  if (!media || !media.ek) return media && media.url;
  if (blobCache.has(media.url)) return blobCache.get(media.url);
  const key = await subtle.importKey('raw', unb64(media.ek), 'AES-GCM', false, ['decrypt']);
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv: unb64(media.eiv) }, key, await (await fetch(media.url)).arrayBuffer());
  const u = URL.createObjectURL(new Blob([pt], { type: media.mime || 'application/octet-stream' })); blobCache.set(media.url, u); return u;
}

// ───── чаты
function upsertChat(v) {
  if (!v) return; const old = S.chats[v.id];
  if (old && S.ui.chat === v.id && old.draft !== undefined && document.hasFocus()) v.draft = old.draft;
  S.chats[v.id] = v;
  if (v.type === 'secret' && v.last && v.last.enc) decryptMsg(v, v.last).then(bump);
  needUsers([v.peer, v.last && v.last.from]);
}
export async function loadHistory(chatId, o = {}) {
  const k = msgKey(chatId, o.thread), h = (S.hist[k] = S.hist[k] || {});
  if (h.loading) return; h.loading = true; bump();
  try {
    const r = await rpc('msg.history', { chat: chatId, thread: o.thread, before: o.before, after: o.after, around: o.around, aroundId: o.aroundId, limit: 50 });
    addUsers(r.users);
    const chat = S.chats[chatId];
    if (chat && chat.type === 'secret') await Promise.all(r.msgs.map(m => decryptMsg(chat, m)));
    if (o.before !== undefined || o.after !== undefined) { for (const m of r.msgs) insertMsg(k, m); if (o.before !== undefined) h.more = r.more; else h.moreAfter = r.moreAfter; }
    else { S.msgs[k] = [...r.msgs, ...listOf(k).filter(m => m.tmp)]; h.more = r.more; h.moreAfter = r.moreAfter; }
    if (r.root) h.root = r.root;
    h.loaded = true;
  } catch (e) { toast(e.message, 'err'); }
  h.loading = false; bump();
}
const saveDraft = (id, text) => { const c = S.chats[id]; if (!c || (c.draft || '') === (text || '')) return; c.draft = text || undefined; rpc('chat.state', { id, draft: text || '' }).catch(() => {}); };
export { saveDraft };
export function openChat(id, o = {}) {
  const c = S.chats[id]; if (!c) return;
  // След для кнопки «Назад»: если в чат перешли прямо из другого чата (ссылка, упоминание, профиль), назад вернёмся в него.
  if (!o.noTrail) { if (S.ui.chat && !S.ui.list && S.ui.chat !== id && innerWidth <= 800) { S.ui.trail = [...(S.ui.trail || []).filter(x => x !== id), S.ui.chat].slice(-8); } else if (S.ui.chat !== id || S.ui.list) S.ui.trail = []; }
  S.ui.chat = id; S.ui.thread = o.thread || null; S.ui.list = false; S.ui.reply = null; S.ui.edit = null; S.ui.sel = null; S.ui.jump = o.jump || null;
  if (c.server) S.ui.server = c.server; else if (!o.keepServer) S.ui.server = null;
  if (location.hash !== '#c=' + id) history.replaceState(history.state, '', '#c=' + id);
  local.set('lastChat', id);
  const k = msgKey(id, S.ui.thread), h = (S.hist[k] = S.hist[k] || {});
  h.unreadFrom = !o.thread && c.unread > 0 ? c.read : null;
  if (o.jump) loadHistory(id, { thread: o.thread, aroundId: o.jump });
  else if (!h.loaded || h.moreAfter) loadHistory(id, { thread: o.thread, around: !o.thread && c.unread > 35 ? c.read + 1 : undefined });
  bump();
}
export function closeChat() { S.ui.trail = []; S.ui.chat = null; S.ui.thread = null; S.ui.list = true; history.replaceState(history.state, '', location.pathname); bump(); }
export async function openUser(userId) {
  try { const r = await rpc('dm.open', { user: userId }); const v = r.chat || r; if (r.user) S.users[r.user.id] = r.user; upsertChat(v); openChat(v.id); } catch (e) { toast(e.message, 'err'); }
}
export async function openByName(name) {
  try {
    const r = await rpc('resolve', { q: name });
    if (r.user) return { user: r.user };
    return r;
  } catch (e) { toast(e.message, 'err'); return null; }
}
let readTimer = null;
export function markRead(chatId) {
  const c = S.chats[chatId]; if (!c || (!c.unread && !c.mentions) || document.hidden) return;
  clearTimeout(readTimer);
  readTimer = setTimeout(() => { const cur = S.chats[chatId]; if (cur && (cur.unread || cur.mentions)) rpc('chat.read', { id: chatId, seq: cur.seq || (cur.last && cur.last.seq) || 0 }).catch(() => {}); }, 250);
}

// ───── отправка
export async function sendPayload(chatId, p, o = {}) {
  const chat = S.chats[chatId]; if (!chat) return;
  const thread = o.thread || undefined, k = msgKey(chatId, thread);
  const tmp = { id: 'tmp' + uid(), tmp: true, chat: chatId, from: S.me.id, ts: Date.now(), seq: Infinity, type: p.type || 'text', ...p, thread };
  if (p.reply) { const r = (S.msgs[k] || []).find(m => m.id === p.reply); if (r) tmp.rq = { from: r.from, name: userName(S.users[r.from]), text: (r.text || '').slice(0, 140), type: r.type }; }
  if (!p.at) { listOf(k).push(tmp); bump(); }
  try {
    let body = { chat: chatId, thread, ...p };
    if (chat.type === 'secret') { const { reply, quote, ttl, silent, ...plain } = p; body = { chat: chatId, reply, quote, ttl, silent, enc: await encryptFor(chat, plain), files: [...new Set(JSON.stringify(plain).match(/\/u\/[\w-]+\.[a-z0-9]{1,8}/g) || [])].slice(0, 12) }; }      // files: адреса зашифрованных файлов, чтобы сервер стёр их вместе с сообщением
    const r = await rpc('msg.send', body);
    S.msgs[k] = listOf(k).filter(m => m.id !== tmp.id);
    if (r.scheduled) { toast('Сообщение отложено. Уйдёт само, как по расписанию.'); bump(); return r; }
    if (chat.type === 'secret') await decryptMsg(chat, r.msg);
    if (!S.hist[k] || !S.hist[k].moreAfter) insertMsg(k, r.msg);
    if (S.settings.sound && !p.silent) sfx('pop');
    bump(); return r;
  } catch (e) {
    const m = listOf(k).find(x => x.id === tmp.id); if (m) { m.failed = e.message; m.tmp = true; }
    toast(e.message, 'err'); bump(); return null;
  }
}
export function retryMsg(chatId, m) { const k = msgKey(chatId, m.thread); S.msgs[k] = listOf(k).filter(x => x.id !== m.id); const { id, tmp, failed, from, ts, seq, chat, rq, ...p } = m; return sendPayload(chatId, p, { thread: m.thread }); }
const kindOf = f => f.type.startsWith('image/gif') ? 'gif' : f.type.startsWith('image/') && !/svg/.test(f.type) ? 'photo' : f.type.startsWith('video/') ? 'video' : f.type.startsWith('audio/') ? 'audio' : 'file';
export const uploads = []; // {id, name, p, abort}
export async function sendFiles(chatId, files, o = {}) {
  const chat = S.chats[chatId]; if (!chat) return;
  for (const f of files) {
    const u = { id: uid(), name: f.name, p: 0, ctl: new AbortController(), chat: chatId }; uploads.push(u); bump();
    try {
      let type = o.asFile ? 'file' : kindOf(f), blob = f, meta = { name: f.name };
      if (type === 'photo') { const c = await compressImage(f); blob = c.blob; meta = { name: c.name, w: c.w, h: c.h }; }
      else if (type === 'video') { const d = await videoMeta(f); Object.assign(meta, d); }
      else if (type === 'gif') Object.assign(meta, await imageSize(f).then(d => ({ w: d.w, h: d.h })));
      if (type === 'audio') meta.dur = await audioDur(f);
      let extra = {};
      if (chat.type === 'secret') { const enc = await encryptFile(blob); extra = { ek: enc.k, eiv: enc.iv, mime: f.type }; blob = enc.blob; }
      const up = await upload(blob, { name: chat.type === 'secret' ? 'secret.bin' : meta.name, signal: u.ctl.signal, onProgress: p => { u.p = p; bump(); } });
      await sendPayload(chatId, { type, once: (o.once && (type === 'photo' || type === 'video')) || undefined, text: (!o.once && o.caption) || undefined, media: { url: up.url, size: f.size, mime: f.type || up.mime, ...meta, ...extra, spoiler: o.spoiler || undefined }, reply: o.reply, silent: o.silent }, { thread: o.thread });
      o.caption = undefined;
    } catch (e) { toast(e.message, 'err'); }
    uploads.splice(uploads.indexOf(u), 1); bump();
  }
}
const videoMeta = f => new Promise(res => { const v = document.createElement('video'); v.preload = 'metadata'; v.onloadedmetadata = () => res({ w: v.videoWidth, h: v.videoHeight, dur: isFinite(v.duration) ? v.duration : 0 }); v.onerror = () => res({}); v.src = URL.createObjectURL(f); });
const audioDur = f => new Promise(res => { const a = new Audio(); a.onloadedmetadata = () => res(isFinite(a.duration) ? a.duration : 0); a.onerror = () => res(0); a.src = URL.createObjectURL(f); });

// ───── уведомления
function inDnd() { const d = S.settings.dnd; if (!d || !d.on) return false; const n = new Date(), cur = n.getHours() * 60 + n.getMinutes(), [fh, fm] = d.from.split(':').map(Number), [th, tm] = d.to.split(':').map(Number), a = fh * 60 + fm, b = th * 60 + tm; return a <= b ? cur >= a && cur < b : cur >= a || cur < b; }
function notify(chat, m, mention) {
  if (!S.ready || m.from === S.me.id || m.type === 'service' || m.thread) return;
  const s = S.settings; if (isMuted(chat) && !mention) return; if (inDnd()) return;
  const cat = chat.server ? s.notifServer : chat.type === 'channel' ? s.notifChannel : chat.type === 'group' ? s.notifGroup : s.notifDm;
  if (!cat && !mention) return;
  const focused = !document.hidden && document.hasFocus();
  if (focused && S.ui.chat === chat.id && !S.ui.thread) return;
  if (s.sound && !m.silent) sfx((chat.notif && chat.notif.sound) || s.notifSound);
  if (s.notif && !focused && 'Notification' in window && Notification.permission === 'granted') {
    try {
      const info = chatInfo(chat), who = userName(S.users[m.from]);
      const showText = s.preview && chat.type !== 'secret' && (!chat.notif || chat.notif.preview !== false);
      const body = !showText ? 'Новое сообщение' : chat.unread > 3 ? `Вы пропустили ${chat.unread} сообщений. Последнее: ${msgPreview(m)}` : (chat.type === 'dm' ? '' : who + ': ') + msgPreview(m);
      const n = new Notification((mention ? '@ ' : '') + (chat.server ? '#' + info.title + ' · ' + ((S.servers[chat.server] || {}).name || '') : info.title), { body, tag: chat.id, icon: '/icon.svg', silent: true });
      n.onclick = () => { window.focus(); openChat(chat.id); n.close(); };
    } catch (e) { /* уведомления недоступны */ }
  }
}
export function totalUnread() { let n = 0; for (const c of Object.values(S.chats)) if (!isMuted(c) && !c.archived && !c.server) n += c.unread || 0; return n; }
setInterval(() => { if (!S.ready) return; const n = totalUnread(); if (!S.ui.boss) document.title = (n ? `(${n}) ` : '') + 'Нудист'; }, 1000);

// ───── события сервера
on('init', d => {
  S.me = d.me; S.conn = d.conn; S.session = d.session; S.sys = d.sys; S.flags = d.flags; S.prices = d.prices; S.offline = false;
  addUsers(d.users); S.users[d.me.id] = { ...d.me };
  S.chats = {}; for (const c of d.chats) upsertChat(c);
  S.servers = {}; for (const s of d.servers) S.servers[s.id] = s;
  S.rooms = {}; for (const r of d.rooms) S.rooms[r.chat] = r;
  loadSettings(d.settings);
  const first = !S.ready; S.ready = true;
  for (const k of Object.keys(S.hist)) S.hist[k].loaded = false;
  if (!first && S.ui.chat && S.chats[S.ui.chat]) loadHistory(S.ui.chat, { thread: S.ui.thread });
  ensureKey().catch(() => {});
  rpc('story.list', {}).then(r => { addUsers(r.users); S.stories = r.stories; bump(); }).catch(() => {});
  for (const f of readyHooks) f(first);
});
const readyHooks = []; export const onReady = f => readyHooks.push(f);
on('me', d => { S.me = d; S.users[d.id] = { ...S.users[d.id], ...d }; });
on('user', d => { S.users[d.id] = d; });
on('presence', d => { const u = S.users[d.user]; if (u) { u.online = d.online; u.seen = d.seen; } });
on('settings', d => { loadSettings(d); });
on('flags', d => { S.flags = d; });
on('toast', d => toast(d.text));
on('chat', d => upsertChat(d));
on('chat.gone', d => { delete S.chats[d.id]; eachList(d.id, (l, k) => { delete S.msgs[k]; delete S.hist[k]; }); if (S.ui.chat === d.id) { S.ui.chat = null; S.ui.list = true; } });
on('chat.cleared', d => { upsertChat(d.chat); eachList(d.chat.id, (l, k) => { S.msgs[k] = []; }); });
on('msg', async d => {
  const chat = d.chat, m = d.msg, fresh = !S.chats[chat.id]; upsertChat(chat); needUsers([m.from, m.fwd && m.fwd.from]);
  if (fresh && S.settings.autoArchive && chat.type === 'dm' && m.from !== S.me.id && !(S.me.contacts || []).includes(m.from) && !(S.users[m.from] || {}).bot) rpc('chat.state', { id: chat.id, archived: true, mute: Date.now() + 10 * 365 * 864e5 }).catch(() => {});
  if (chat.type === 'secret') await decryptMsg(chat, m);
  const k = msgKey(chat.id, m.thread), h = S.hist[k];
  if (h && h.loaded && !h.moreAfter) insertMsg(k, m);
  if (d.root) eachList(chat.id, l => { const i = l.findIndex(x => x.id === d.root.id); if (i >= 0) l[i] = { ...l[i], ...d.root }; });
  const t = S.typing[chat.id]; if (t) delete t[m.from];
  if (m.fx === 'confetti' && S.ui.chat === chat.id && Date.now() - m.ts < 10000) confetti();
  notify(chat, m, d.mention);
  bump();
});
on('msg.upd', async d => { const chat = S.chats[d.chat]; if (chat && chat.type === 'secret') { await decryptMsg(chat, d.msg); } eachList(d.chat, l => { const i = l.findIndex(x => x.id === d.msg.id); if (i >= 0) l[i] = { ...l[i], ...d.msg, poll: d.msg.poll, rx: d.msg.rx, link: d.msg.link, btn: d.msg.btn }; }); if (chat && chat.last && chat.last.id === d.msg.id) chat.last = d.msg; bump(); });
on('msg.del', d => { upsertChat(d.chat); const ids = new Set(d.ids); eachList(d.chat.id, (l, k) => { S.msgs[k] = l.filter(m => !ids.has(m.id)); }); if (S.ui.thread && ids.has(S.ui.thread) && S.ui.chat === d.chat.id) S.ui.thread = null; });
on('read', d => { const c = S.chats[d.chat]; if (c) { c.peerRead = Math.max(c.peerRead || 0, d.seq); c.peerDeliv = Math.max(c.peerDeliv || 0, d.seq); } });
on('deliv', d => { const c = S.chats[d.chat]; if (c) c.peerDeliv = Math.max(c.peerDeliv || 0, d.seq); });
on('typing', d => { const k = d.thread ? d.chat + '#' + d.thread : d.chat; (S.typing[k] = S.typing[k] || {})[d.user] = { kind: d.kind, text: d.text, at: Date.now() }; needUsers([d.user]); });
setInterval(() => { let ch = false; const t = Date.now(); for (const k in S.typing) for (const u in S.typing[k]) if (t - S.typing[k][u].at > 5000) { delete S.typing[k][u]; ch = true; } if (ch) bump(); }, 1500);
on('server', d => { S.servers[d.id] = d; });
on('server.gone', d => { delete S.servers[d.id]; for (const c of Object.values(S.chats)) if (c.server === d.id) delete S.chats[c.id]; if (S.ui.server === d.id) { S.ui.server = null; S.ui.chat = null; S.ui.list = true; } });
on('server.channels', d => { const keep = new Set(d.chats.map(c => c.id)); for (const c of Object.values(S.chats)) if (c.server === d.server && !keep.has(c.id)) delete S.chats[c.id]; for (const c of d.chats) upsertChat(c); });
on('server.count', d => { if (S.servers[d.id]) S.servers[d.id].count = d.count; });
on('story', d => { S.users[d.user.id] = d.user; S.stories = [...S.stories.filter(s => s.id !== d.story.id), d.story]; });
on('story.del', d => { S.stories = S.stories.filter(s => s.id !== d.id); });
on('story.views', d => { const s = S.stories.find(x => x.id === d.id); if (s) s.views = d.views; });
on('buzz', d => { if (d.user !== S.me.id) { shake(); toast(`${userName(S.users[d.user])} пинает вас. Бзззз!`); } });
on('rx', d => { const c = S.chats[d.chat]; if (c && !isMuted(c) && S.settings.sound && (document.hidden || S.ui.chat !== d.chat)) sfx('pop'); });
on('sched.sent', () => {});
on('session.killed', d => { toast((d && d.reason) || 'Сеанс завершён'); logout(true); });

// ───── вход / выход / мультиаккаунт
export function accounts() { return local.get('accounts', []); }
export function login(token) {
  const acc = accounts().filter(a => a.token !== token); acc.unshift({ token }); local.set('accounts', acc.slice(0, 5)); local.set('token', token);
  S.token = token; S.ready = false; connect(); bump();
}
onReady(() => { const acc = accounts(); const a = acc.find(x => x.token === S.token); if (a) { a.id = S.me.id; a.name = userName(S.me); a.username = S.me.username; a.avatar = S.me.avatar; a.color = S.me.color; local.set('accounts', acc); } });
export function resetState() { S.ready = false; S.me = null; S.chats = {}; S.msgs = {}; S.hist = {}; S.servers = {}; S.rooms = {}; S.stories = []; S.modals = []; S.ui = { ...S.ui, chat: null, thread: null, server: null, list: true, panel: false }; keyCache.clear(); }
export function logout(silent) {
  if (!silent && S.token) rpc('me.logout').catch(() => {});
  const acc = accounts().filter(a => a.token !== S.token); local.set('accounts', acc);
  disconnect(); resetState(); S.token = null; local.set('token', null);
  if (acc.length) login(acc[0].token); else bump();
}
export function switchAccount(token) { if (token === S.token) return; disconnect(); resetState(); login(token); }
export function addAccount() { disconnect(); resetState(); S.token = null; S.adding = true; bump(); }
export function boot() { const t = local.get('token'); if (t) { S.token = t; connect(); } }
