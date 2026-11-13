'use strict';
// Ядро: хранилище, утилиты, права, доставка событий, отправка сообщений.
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const Cloud = require('./cloud');
const DATA = process.env.DATA_DIR || path.join(ROOT, 'data');
const UPLOADS = path.join(DATA, 'uploads');
fs.mkdirSync(UPLOADS, { recursive: true });
const DB_FILE = path.join(DATA, 'db.json');

const db = { users: {}, sessions: {}, chats: {}, msgs: {}, servers: {}, stories: {}, invites: {}, hooks: {}, reports: [], audit: [], scheduled: [], flags: {}, daily: {}, meta: {} };
// Загрузка: основной файл, а если он битый (питание пропало посреди записи) — последняя суточная копия.
const BAK_FILE = DB_FILE + '.bak';
if (fs.existsSync(DB_FILE) || fs.existsSync(BAK_FILE)) {
  let loaded = false;
  for (const f of [DB_FILE, BAK_FILE]) {
    if (!fs.existsSync(f)) continue;
    try { Object.assign(db, JSON.parse(fs.readFileSync(f, 'utf8'))); loaded = true; if (f === BAK_FILE) console.error('[db] база восстановлена из копии', f); break; }
    catch (e) { const bad = f + '.broken-' + Date.now(); fs.renameSync(f, bad); console.error('[db] файл повреждён, сохранён как', bad); }
  }
  if (!loaded) console.error('[db] ни база, ни копия не прочитались — старт с пустой базой');
}
const DEFAULT_FLAGS = { registration: true, phoneAuth: true, stories: true, calls: true, bots: true, stars: true, linkPreview: true, discovery: true, uploads: true };
db.flags = { ...DEFAULT_FLAGS, ...db.flags };
// У каждой базы свой номер. По нему копия в S3 отличает «свою» базу от чужой: тестовый сервер с теми же ключами не затрёт боевую копию.
db.meta = db.meta || {}; if (!db.meta.dbId) { db.meta.dbId = require('crypto').randomBytes(9).toString('base64url'); setImmediate(() => save()); }
Cloud.setDbId(db.meta.dbId);

// Сохранение — это сериализация всей базы. Пока она маленькая, пишем раз в полсекунды; когда растёт — реже,
// чтобы запись занимала не больше ~5% времени процесса и не тормозила переписку.
let saveTimer = null, saving = false, dirty = false, saveCost = 0;
const saveDelay = () => Math.min(60000, Math.max(500, Math.round(saveCost * 20)));
function save() { dirty = true; if (!saveTimer) saveTimer = setTimeout(flush, saveDelay()); }
function flush() {
  saveTimer = null;
  if (saving) { saveTimer = setTimeout(flush, 200); return; }
  if (!dirty) return;
  dirty = false; saving = true;
  const t0 = Date.now(); if (db.meta) db.meta.savedAt = t0;      // по этой метке при запуске выбирается более свежая из двух копий базы
  const text = JSON.stringify(db);
  saveCost = Date.now() - t0; metrics.dbBytes = text.length; metrics.saveMs = saveCost;
  Cloud.queue(text);
  fs.writeFile(DB_FILE + '.tmp', text, err => {
    if (err) { console.error('[db] ошибка записи', err.message); saving = false; dirty = true; if (!saveTimer) saveTimer = setTimeout(flush, 5000); return; }
    fs.rename(DB_FILE + '.tmp', DB_FILE, () => { saving = false; });
  });
}
// Синхронная запись при остановке: через временный файл, чтобы обрыв не оставил полфайла.
function flushSync() { try { fs.writeFileSync(DB_FILE + '.tmp', JSON.stringify(db)); fs.renameSync(DB_FILE + '.tmp', DB_FILE); dirty = false; } catch (e) { console.error('[db] ошибка записи', e.message); } }
// Копия базы рядом с основной: раз в сутки и при старте.
function backupDb() { try { if (fs.existsSync(DB_FILE)) { JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); fs.copyFileSync(DB_FILE, BAK_FILE + '.tmp'); fs.renameSync(BAK_FILE + '.tmp', BAK_FILE); } } catch (e) { console.error('[db] копия не сделана:', e.message); } }
backupDb(); setInterval(backupDb, 24 * 3600e3).unref();

// ───── утилиты
const now = () => Date.now();
const id = () => crypto.randomBytes(8).toString('base64url');
const token = (n = 24) => crypto.randomBytes(n).toString('base64url');
class PubError extends Error {}
const fail = msg => { throw new PubError(msg); };
const need = (cond, msg) => { if (!cond) fail(msg || 'Некорректный запрос'); };
const str = (v, max = 256) => (typeof v === 'string' ? v.replace(/\u0000/g, '').trim().slice(0, max) : '');
const int = (v, min, max, def = 0) => { v = Math.floor(Number(v)); return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def; };
const today = (t = now()) => new Date(t).toISOString().slice(0, 10);
const isUpload = u => typeof u === 'string' && /^\/u\/[\w-]+\.[a-z0-9]{1,8}$/.test(u);
const USERNAME_RE = /^[a-z][a-z0-9_]{2,31}$/i;

// ───── соединения
const metrics = { rpc: 0, errors: 0, started: Date.now(), perMin: [] };
const conns = new Map();     // userId -> Set(conn)
const connById = new Map();  // connId -> conn
function emit(uid, ev, d) {
  const set = conns.get(uid); if (!set) return;
  const s = JSON.stringify({ ev, d });
  for (const c of set) c.raw(s);
}
function emitAll(ev, d) { const s = JSON.stringify({ ev, d }); for (const set of conns.values()) for (const c of set) c.raw(s); }
const isOnline = uid => conns.has(uid);
let offlineHook = null; const setOfflineHook = f => { offlineHook = f; };      // куда сообщать о письме человеку без открытых соединений (уведомления)
// Число ключей в большом объекте (участники сообщества). Object.keys(…).length на 100 тысячах участников — это миллисекунды,
// а считается оно на каждое сообщение каждому получателю. Большие объекты пересчитываем не чаще раза в 3 секунды.
const sizeCache = new WeakMap();
function size(o) {
  if (!o) return 0;
  const c = sizeCache.get(o), t = Date.now();
  if (c && t - c.at < 3000) return c.n;
  const n = Object.keys(o).length;
  if (n > 500) sizeCache.set(o, { n, at: t }); else if (c) sizeCache.delete(o);
  return n;
}

// ───── статистика по дням
function day() { const k = today(); return (db.daily[k] = db.daily[k] || { msgs: 0, regs: 0, dau: [] }); }
let dauKey = '', dauSet = null;
function touchDau(uid) { const d = day(), k = today(); if (dauKey !== k) { dauKey = k; dauSet = new Set(d.dau); } if (!dauSet.has(uid)) { dauSet.add(uid); d.dau.push(uid); } }

// ───── пользователи
const byName = new Map(); // username(lower) -> userId
for (const u of Object.values(db.users)) if (u.username) byName.set(u.username.toLowerCase(), u.id);
const DEFAULT_PRIVACY = { phone: 'none', lastSeen: 'all', avatar: 'all', bio: 'all', calls: 'all', msgs: 'all', invites: 'all', stories: 'all' };
const isPremium = u => !!u.premiumUntil && u.premiumUntil > now();
function canSee(u, viewerId, key) {
  if (u.id === viewerId) return true;
  const p = (u.privacy || {})[key] || DEFAULT_PRIVACY[key];
  return p === 'all' || (p === 'contacts' && (u.contacts || []).includes(viewerId));
}
function badges(u) {
  const b = [...(u.badges || [])];
  if (isPremium(u)) b.push('premium');
  if (u.bot || ROBOTS.has(u.id)) b.push('bot');
  return b;
}
function pubUser(u, vid) {
  if (!u) return null;
  if (u.deleted) return { id: u.id, name: 'Удалённый аккаунт', deleted: true, color: 0 };
  const o = { id: u.id, username: u.username, name: u.name, last: u.last, color: u.color || 0, badges: badges(u), status: u.status, bot: u.bot || undefined, cmds: u.cmds, app: u.app };
  if (canSee(u, vid, 'avatar')) { o.avatar = u.avatar; o.avatars = u.avatars; }
  if (canSee(u, vid, 'bio')) { o.bio = u.bio; o.links = u.links; o.city = u.city; o.birthday = u.birthday; o.tz = u.tz; }
  if (canSee(u, vid, 'phone')) o.phone = u.phone;
  if (canSee(u, vid, 'lastSeen')) { o.online = u.bot ? true : isOnline(u.id); o.seen = u.seen; } else o.hidden = true;
  if (u.profile) o.profile = u.profile;
  if (u.pubKey) o.pubKey = u.pubKey;
  if (u.playing) o.playing = u.playing;
  if (u.private && u.id !== vid && !(u.contacts || []).includes(vid)) { delete o.bio; delete o.links; delete o.city; delete o.birthday; o.private = true; }
  return o;
}
// Владельцы сервиса: id аккаунтов через запятую в переменной OWNERS. Они всегда главные админы,
// их роль никто не может снять, и только они могут менять роль других главных админов.
const OWNERS = new Set(String(process.env.OWNERS || '').split(',').map(s => s.trim()).filter(Boolean));
const isOwner = u => !!u && OWNERS.has(u.id);
// Перенос записей из своего канала в другой сети (scripts/tg-import.js). Людям из IMPORTERS (id через запятую) и владельцам
// можно ставить записи и клипы с исходной датой, прикладывать видео и голосовые и не упираться в дневной лимит.
const IMPORTERS = new Set(String(process.env.IMPORTERS || '').split(',').map(s => s.trim()).filter(Boolean));
const canImport = u => !!u && (IMPORTERS.has(u.id) || isOwner(u));
// Аккаунты редакции с автоматическими подборками: рядом с именем честно стоит значок «Бот».
const ROBOTS = new Set(String(process.env.ROBOTS || '').split(',').map(s => s.trim()).filter(Boolean));
function selfUser(u) {
  return { ...pubUser(u, u.id), phone: u.phone, email: u.email, stars: u.stars || 0, premiumUntil: u.premiumUntil, privacy: { ...DEFAULT_PRIVACY, ...u.privacy }, contacts: u.contacts || [], blocked: u.blocked || [], totp: !!u.totpOn, hasPassword: !!u.pass, admin: u.admin, owner: isOwner(u) || undefined, autodelete: u.autodelete || 6, recoveryLeft: (u.recovery || []).length, private: !!u.private, lastDaily: u.lastDaily, muted: u.muted > now() ? u.muted : undefined, taps: u.tapDay === today() ? u.taps : 0 };
}
// Кому рассылать «в сети / изменил профиль»: только тем, кто этого человека действительно видит — собеседникам, контактам
// и участникам небольших общих чатов и серверов. Рассылка «всем подключённым» на каждое подключение — это N² и смерть при первом же наплыве.
const AUDIENCE_GROUP = 300, AUDIENCE_MAX = 3000;
function audience(u) {
  const out = new Set();
  const add = ids => { for (const x of ids) { if (out.size >= AUDIENCE_MAX) return; if (x !== u.id && conns.has(x)) out.add(x); } };
  if (conns.size <= AUDIENCE_GROUP) { add(conns.keys()); return out; }          // маленькая тусовка — видят все, как раньше
  const small = o => { let n = 0; for (const k in o) if (++n > AUDIENCE_GROUP) return null; return Object.keys(o); };      // большие сообщества не перебираем вовсе
  for (const cid of u.chats || []) { const c = db.chats[cid], ids = c && c.members && small(c.members); if (ids) add(ids); }
  for (const sid of u.servers || []) { const s = db.servers[sid], ids = s && small(s.members); if (ids) add(ids); }
  add(u.contacts || []);
  return out;
}
function broadcastUser(u) { for (const uid of audience(u)) emit(uid, 'user', pubUser(u, uid)); }

// ───── чаты и права
const dmId = (a, b) => 'dm_' + [a, b].sort().join('_');
const st = (chat, uid) => (chat.st[uid] = chat.st[uid] || { read: 0 });
const DEFAULT_RIGHTS = { admin: { send: 1, pin: 1, info: 1, invite: 1, ban: 1, del: 1, promote: 0, audit: 1, mention: 1, voice: 1 }, mod: { send: 1, pin: 1, info: 0, invite: 1, ban: 1, del: 1, promote: 0, audit: 1, mention: 0, voice: 1 } };

function sPerms(s, uid) {
  const m = s.members[uid]; if (!m) return null;
  if (s.owner === uid) return { admin: true };
  const p = {};
  for (const r of s.roles) if (r.id === 'everyone' || m.roles.includes(r.id)) for (const k in r.perms) if (r.perms[k]) p[k] = true;
  return p;
}
function sCan(s, uid, act, chat) {
  const p = sPerms(s, uid); if (!p) return false;
  if (p.admin) return true;
  switch (act) {
    case 'view': return !chat || !chat.allow || !chat.allow.length || chat.allow.some(r => s.members[uid].roles.includes(r));
    case 'send': return !!p.send && !s.members[uid].muted && !(chat && (chat.kind === 'announce' || chat.kind === 'rules') && !p.msgs);
    case 'pin': case 'del': return !!p.msgs;
    case 'info': return !!p.channels;
    case 'promote': return !!p.roles;
    default: return !!p[act];
  }
}
function membersOf(chat) {
  if (chat.server) { const s = db.servers[chat.server]; return s ? Object.keys(s.members).filter(u => sCan(s, u, 'view', chat)) : []; }
  return Object.keys(chat.members);
}
function isMember(chat, uid) {
  if (chat.server) { const s = db.servers[chat.server]; return !!s && !!s.members[uid] && sCan(s, uid, 'view', chat); }
  return !!chat.members[uid];
}
// Мут участника в группе или канале: хранится в самом чате, поэтому выйти и зайти заново, чтобы его сбросить, не получится.
const chatMuted = (chat, uid) => { const t = (chat.mutes || {})[uid]; return t > now() ? t : 0; };
// Мут от администрации сервиса: человек читает, но нигде ничего не публикует.
function needVoice(u) { if (u && u.muted > now()) fail('Администрация выдала вам мут до ' + new Date(u.muted).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }) + ' (МСК). Помолчите, это полезно.'); }
function can(chat, uid, act) {
  if (chat.server) return sCan(db.servers[chat.server], uid, act, chat);
  const m = chat.members[uid]; if (!m) return false;
  if (chat.type === 'dm' || chat.type === 'secret' || chat.type === 'saved') return act === 'send' || act === 'pin';
  if (m.role === 'owner') return true;
  if (act === 'send' && chatMuted(chat, uid)) return false;
  if (m.role === 'admin' || m.role === 'mod') { const r = { ...DEFAULT_RIGHTS[m.role], ...(m.rights || {}) }; return !!r[act]; }
  if (chat.type !== 'group') return false;
  if (act === 'send') return !m.pending && (chat.perms || {}).send !== false;
  if (act === 'pin' || act === 'info' || act === 'invite') return !!(chat.perms || {})[act];
  return false;
}
function myRole(chat, uid) {
  if (chat.server) { const s = db.servers[chat.server]; return s.owner === uid ? 'owner' : (sCan(s, uid, 'del') ? 'admin' : 'member'); }
  return (chat.members[uid] || {}).role;
}
function audit(target, by, act, d) {
  target.audit = target.audit || [];
  target.audit.push({ ts: now(), by, act, d });
  if (target.audit.length > 500) target.audit.splice(0, target.audit.length - 500);
}

// ───── представления
function pollView(p, uid) {
  const counts = p.opts.map(() => 0); let total = 0;
  const voters = p.anon ? undefined : p.opts.map(() => []);
  for (const u in p.votes) { total++; for (const i of p.votes[u]) { counts[i]++; if (voters) voters[i].push(u); } }
  const mine = p.votes[uid];
  const closed = p.closed || (p.closeAt && p.closeAt < now());
  return { q: p.q, opts: p.opts, multi: p.multi, anon: p.anon, quiz: p.quiz, closeAt: p.closeAt, closed, counts, total, mine, voters, correct: p.quiz && (mine || closed) ? p.correct : undefined, explain: p.quiz && (mine || closed) ? p.explain : undefined };
}
function msgView(m, uid) {
  if (!m) return null;
  const v = { ...m };
  delete v.hid; delete v.hist; delete v.clicks; delete v.src;
  if (m.views) v.views = m.views.length;
  if (m.poll) v.poll = pollView(m.poll, uid);
  if (m.once) { delete v.media; v.kind = m.type; v.type = 'once'; v.once = m.onceAt ? 'seen' : 'new'; }      // одноразовое: адрес файла не уходит никому, пока получатель не откроет
  return v;
}
function lastVisible(chat, uid) {
  const arr = db.msgs[chat.id] || [], s = st(chat, uid), isForum = chat.kind === 'forum';
  for (let i = arr.length - 1; i >= 0; i--) {
    const m = arr[i];
    if (m.seq <= (s.cleared || 0)) return null;
    if ((m.thread && !isForum) || (m.hid && m.hid.includes(uid))) continue;
    return m;
  }
  return null;
}
function unreadCount(chat, uid) {
  const arr = db.msgs[chat.id] || [], s = st(chat, uid); let n = 0;
  for (let i = arr.length - 1; i >= 0 && n < 999; i--) {
    const m = arr[i];
    if (m.seq <= s.read || m.seq <= (s.cleared || 0)) break;
    if (m.thread || m.from === uid || (m.hid && m.hid.includes(uid))) continue;
    n++;
  }
  return n;
}
// «Огонёк»: сколько дней подряд оба собеседника писали друг другу. День считаем по Москве.
const dayMsk = (shift = 0) => today(now() + 3 * 3600e3 + shift * 864e5);
function touchStreak(chat, from) {
  const d = dayMsk(), k = chat.sk || (chat.sk = { n: 0, last: '', by: {} });
  if (k.by[from] === d) return false;
  k.by[from] = d;
  const ids = Object.keys(chat.members);
  if (ids.length !== 2 || k.last === d || !ids.every(u => k.by[u] === d)) return false;
  k.n = k.last === dayMsk(-1) ? k.n + 1 : 1; k.last = d;
  return true;
}
function streakOf(chat) {      // { n, hot }: hot — сегодня серия уже продлена; иначе она сгорит в полночь
  const k = chat.sk; if (!k || k.n < 2) return null;
  if (k.last === dayMsk()) return { n: k.n, hot: true };
  if (k.last === dayMsk(-1)) return { n: k.n, hot: false };
  return null;
}
// ───── Файлы, на которые больше никто не ссылается
// Удалили сообщение, запись, клип, чат или аккаунт — их файлы нужно стереть, иначе хранилище забьётся мёртвым грузом.
// Но один файл может стоять в нескольких местах (пересланное сообщение, запись ленты и клип разом), поэтому файлы
// сначала попадают в список кандидатов, а через минуту сверяются со всей базой: стирается только то, на что не осталось ни одной ссылки.
const FILE_DELAY = Number(process.env.FILE_DELAY_MS) || 60000;
const FILE_RE = /\/u\/([\w-]+\.[a-z0-9]{1,8})(?![\w.-])/g;
const FREE_TEXT = new Set(['text', 'enc', 'about', 'bio', 'title', 'name', 'caption', 'html']);      // здесь адрес файла мог напечатать человек — это не вложение
function filesIn(x) {
  const out = new Set(); if (x == null) return out;
  const s = typeof x === 'string' ? x : JSON.stringify(x, (k, v) => (FREE_TEXT.has(k) ? undefined : v)) || '';
  for (const m of s.matchAll(FILE_RE)) out.add(m[1]);
  return out;
}
const fileTrash = new Set(); let fileTimer = null;
function releaseFiles(...things) {
  for (const x of things) for (const n of filesIn(x)) fileTrash.add(n);
  if (fileTrash.size && !fileTimer) { fileTimer = setTimeout(sweepFiles, FILE_DELAY); fileTimer.unref(); }
}
function sweepFiles() {
  fileTimer = null; if (!fileTrash.size) return 0;
  const names = [...fileTrash]; fileTrash.clear();
  const blob = JSON.stringify(db); let n = 0;
  for (const name of names) {
    if (blob.includes('/u/' + name)) continue;          // файл ещё где-то нужен
    fs.unlink(path.join(UPLOADS, name), () => {}); Cloud.dropUpload(name); n++;
  }
  if (n) console.log(`[files] стёрто файлов, на которые не осталось ссылок: ${n}`);
  return n;
}
const dropUpload = url => releaseFiles(String(url || ''));
function chatView(chat, uid) {
  const s = st(chat, uid);
  const v = { id: chat.id, type: chat.type, title: chat.title, about: chat.about, avatar: chat.avatar, username: chat.username, pub: chat.pub, created: chat.created, seq: chat.seq,
    last: msgView(lastVisible(chat, uid), uid), unread: unreadCount(chat, uid), mentions: s.mentions || 0, read: s.read, mute: s.mute, archived: s.archived, pin: s.pin, draft: s.draft, notif: s.notif,
    pinned: chat.pinned, ttl: chat.ttl, slow: chat.slow, verified: chat.verified };
  if (chat.server) {
    Object.assign(v, { server: chat.server, kind: chat.kind, cat: chat.cat, pos: chat.pos, topic: chat.topic, allow: chat.allow });
    const srv = db.servers[chat.server];
    v.can = { send: sCan(srv, uid, 'send', chat), del: sCan(srv, uid, 'del'), pin: sCan(srv, uid, 'pin'), info: sCan(srv, uid, 'info'), voice: sCan(srv, uid, 'voice'), mention: sCan(srv, uid, 'mention') };
  } else {
    v.count = size(chat.members);
    v.role = (chat.members[uid] || {}).role;
    v.pending = (chat.members[uid] || {}).pending;
    if (chatMuted(chat, uid)) v.muted = chatMuted(chat, uid);
    if (chat.type === 'dm' || chat.type === 'secret') v.peer = Object.keys(chat.members).find(u => u !== uid) || uid;
    if (chat.sk) { const k = streakOf(chat); if (k) v.streak = k; }
    if (chat.type === 'secret') { v.keys = chat.keys; v.by = chat.by; }
    if (chat.type === 'group' || chat.type === 'channel') {
      Object.assign(v, { perms: chat.perms, sign: chat.sign, approval: chat.approval, captcha: chat.captcha, price: chat.price, rules: chat.rules, color: chat.color });
      v.can = { send: can(chat, uid, 'send'), del: can(chat, uid, 'del'), pin: can(chat, uid, 'pin'), info: can(chat, uid, 'info'), invite: can(chat, uid, 'invite'), ban: can(chat, uid, 'ban'), promote: can(chat, uid, 'promote'), audit: can(chat, uid, 'audit'), mention: can(chat, uid, 'mention') };
      if (v.can.info) { v.automod = chat.automod; v.reqs = (chat.reqs || []).length; v.rss = chat.rss; }
    }
    if (chat.type !== 'channel' && chat.type !== 'saved') {
      let pr = 0, pd = 0, n = 0;
      for (const u in chat.members) { if (u === uid || ++n > 300) continue; const o = chat.st[u]; if (o) { if (o.read > pr) pr = o.read; if ((o.deliv || 0) > pd) pd = o.deliv; } }
      v.peerRead = pr; v.peerDeliv = Math.max(pd, pr);
    }
  }
  return v;
}
function emitChat(chat, uids) { for (const u of uids || membersOf(chat)) if (isOnline(u)) emit(u, 'chat', chatView(chat, u)); }

// ───── сообщения
const MSG_FIELDS = ['text', 'media', 'reply', 'quote', 'fwd', 'poll', 'thread', 'btn', 'silent', 'sticker', 'loc', 'contact', 'enc', 'title', 'as', 'via', 'hook', 'call', 'act', 'dice', 'album', 'fx', 'gift', 'tags', 'rq', 'sig', 'link', 'once', 'files', 'note', 'present'];
const expiring = [];
for (const cid in db.msgs) for (const m of db.msgs[cid]) if (m.exp) expiring.push({ c: cid, i: m.id, at: m.exp });
const hooks = { afterPost: [], userGone: [] };

function findMsg(chatId, mid) { return (db.msgs[chatId] || []).find(m => m.id === mid); }
function mentionedUsers(chat, from, text) {
  const out = new Set(); let all = false;
  if (!text) return { out, all };
  for (const m of text.matchAll(/@([a-zA-Z0-9_]{3,32})/g)) {
    const n = m[1].toLowerCase();
    if (n === 'all' || n === 'everyone' || n === 'here') { if (from && (can(chat, from, 'mention') || (chat.type === 'group' && size(chat.members) <= 50))) all = n; continue; }
    const uid = byName.get(n); if (uid) out.add(uid);
  }
  return { out, all };
}
function postMessage(chat, from, p, o = {}) {
  const arr = (db.msgs[chat.id] = db.msgs[chat.id] || []);
  const m = { id: id(), seq: (chat.seq = (chat.seq || 0) + 1), chat: chat.id, from, ts: now(), type: p.type || 'text' };
  for (const k of MSG_FIELDS) if (p[k] !== undefined && p[k] !== null && p[k] !== '' && p[k] !== false) m[k] = p[k];
  const ttl = p.ttl || chat.ttl;
  if (ttl && m.type !== 'service') { m.exp = m.ts + ttl * 1000; expiring.push({ c: chat.id, i: m.id, at: m.exp }); }
  arr.push(m);
  if (chat.type === 'dm' && m.type !== 'service' && from && !o.quiet) { const fu = db.users[from]; if (fu && !fu.bot) touchStreak(chat, from); }
  let root = null;
  if (m.thread) { root = findMsg(chat.id, m.thread); if (root) { root.tcount = (root.tcount || 0) + 1; root.tlast = m.ts; } }
  const { out: ment, all } = m.enc ? { out: new Set() } : mentionedUsers(chat, from, m.text);
  if (m.reply) { const r = findMsg(chat.id, m.reply); if (r && r.from !== from) ment.add(r.from); }
  day().msgs++;
  const members = membersOf(chat);
  for (const uid of members) {
    const s = st(chat, uid);
    if (uid === from) { if (!m.thread) s.read = m.seq; s.hide = false; continue; }
    const mention = m.type !== 'service' && (ment.has(uid) || (all && (all !== 'here' || isOnline(uid))));
    if (mention) s.mentions = (s.mentions || 0) + 1;
    if (!m.thread) {
      s.hide = false;
      if (s.archived && (mention || !(s.mute > now()))) s.archived = false;
    }
    if (isOnline(uid)) { s.deliv = m.seq; emit(uid, 'msg', { chat: chatView(chat, uid), msg: msgView(m, uid), root: root ? msgView(root, uid) : undefined, mention }); }
    else if (offlineHook && m.type !== 'service') { try { offlineHook(uid, chat, m, mention, s); } catch (e) { console.error('[push]', e.message); } }
  }
  if (isOnline(from)) emit(from, 'msg', { chat: chatView(chat, from), msg: msgView(m, from), root: root ? msgView(root, from) : undefined });
  save();
  if (!o.quiet) for (const h of hooks.afterPost) { try { h(chat, m); } catch (e) { console.error('[hook]', e); } }
  return m;
}
function service(chat, from, text, extra) { return postMessage(chat, from, { type: 'service', text, ...extra }, { quiet: true }); }
function updateMsg(chat, m) { for (const u of membersOf(chat)) if (isOnline(u)) emit(u, 'msg.upd', { chat: chat.id, msg: msgView(m, u) }); save(); }
function deleteMessages(chat, ids) {
  const arr = db.msgs[chat.id] || []; const set = new Set(ids); const gone = [], dead = [];
  for (let i = arr.length - 1; i >= 0; i--) {
    const m = arr[i];
    if (set.has(m.id) || (m.thread && set.has(m.thread))) {
      gone.push(m.id); dead.push(m); arr.splice(i, 1);
      if (m.thread && !set.has(m.thread)) { const r = findMsg(chat.id, m.thread); if (r && r.tcount) { r.tcount--; updateMsg(chat, r); } }
    }
  }
  if (!gone.length) return gone;
  releaseFiles(dead);
  if (chat.pinned) chat.pinned = chat.pinned.filter(x => !set.has(x));
  for (const u of membersOf(chat)) if (isOnline(u)) emit(u, 'msg.del', { chat: chatView(chat, u), ids: gone });
  save();
  return gone;
}

// ───── общий список чатов пользователя
function userChats(u) {
  const out = [];
  for (const cid of u.chats || []) { const c = db.chats[cid]; if (c && c.members[u.id] && !st(c, u.id).hide) out.push(c); }
  for (const sid of u.servers || []) { const s = db.servers[sid]; if (!s) continue; for (const cid of s.channels) { const c = db.chats[cid]; if (c && sCan(s, u.id, 'view', c)) out.push(c); } }
  return out;
}
function addToChat(chat, uid, role = 'member', extra) {
  chat.members[uid] = { role, at: now(), ...extra };
  const u = db.users[uid]; u.chats = u.chats || [];
  if (!u.chats.includes(chat.id)) u.chats.push(chat.id);
  st(chat, uid).read = chat.seq || 0;
  chat.joins = chat.joins || {}; chat.joins[today()] = (chat.joins[today()] || 0) + 1;
}
function removeFromChat(chat, uid) {
  delete chat.members[uid]; delete chat.st[uid];
  const u = db.users[uid]; if (u && u.chats) u.chats = u.chats.filter(x => x !== chat.id);
  emit(uid, 'chat.gone', { id: chat.id });
}
function newChat(type, fields) {
  const c = { id: type === 'dm' ? fields.id : id(), type, members: {}, st: {}, seq: 0, created: now(), ...fields };
  db.chats[c.id] = c; db.msgs[c.id] = db.msgs[c.id] || [];
  return c;
}
function openDm(a, b) {
  const cid = dmId(a, b);
  let c = db.chats[cid];
  if (!c) { c = newChat('dm', { id: cid }); addToChat(c, a); if (b !== a) addToChat(c, b); save(); }
  return c;
}
function destroyChat(chat) {
  for (const u of Object.keys(chat.members)) removeFromChat(chat, u);
  if (chat.username) chatNames.delete(chat.username.toLowerCase());
  releaseFiles(db.msgs[chat.id], chat.avatar);
  delete db.chats[chat.id]; delete db.msgs[chat.id];
  save();
}
const chatNames = new Map();
for (const c of Object.values(db.chats)) if (c.username) chatNames.set(c.username.toLowerCase(), c.id);
function usernameTaken(n, exceptId) {
  n = n.toLowerCase();
  const RES = ['all', 'everyone', 'here', 'admin', 'support', 'me', 'api', 'bot'];
  if (RES.includes(n)) return true;
  const u = byName.get(n); if (u && u !== exceptId) return true;
  const c = chatNames.get(n); if (c && c !== exceptId) return true;
  return false;
}

const isRobot = uid => ROBOTS.has(uid);
// «Кто посмотрел»: у записи, клипа или трека лежит «кто → когда», не больше VIEWERS_MAX последних человек,
// чтобы база не пухла годами. Общий счётчик просмотров идёт отдельно и не обрезается.
const VIEWERS_MAX = 300;
function markSeen(o, uid, key = 'seen') {
  const m = o[key] || (o[key] = {}); if (m[uid]) return false;
  m[uid] = now(); const ks = Object.keys(m); if (ks.length > VIEWERS_MAX) delete m[ks[0]];
  return true;
}
function viewersOf(o, viewerId, key = 'seen') {
  const m = o[key] || {}, users = {};
  const list = Object.keys(m).filter(u => db.users[u] && !db.users[u].deleted).map(u => ({ u, ts: m[u] })).sort((a, b) => b.ts - a.ts);
  for (const v of list) users[v.u] = pubUser(db.users[v.u], viewerId);
  return { list, users };
}
module.exports = { chatMuted, needVoice, isRobot, markSeen, viewersOf, canImport, setOfflineHook, audience, size, dropUpload, releaseFiles, sweepFiles, streakOf, OWNERS, isOwner, metrics, ROOT, DATA, UPLOADS, db, save, flushSync, now, id, token, PubError, fail, need, str, int, today, isUpload, USERNAME_RE, conns, connById, emit, emitAll, isOnline, day, touchDau, byName, chatNames, usernameTaken, DEFAULT_PRIVACY, isPremium, canSee, pubUser, selfUser, broadcastUser, dmId, st, sPerms, sCan, membersOf, isMember, can, myRole, audit, pollView, msgView, chatView, emitChat, findMsg, postMessage, service, updateMsg, deleteMessages, expiring, hooks, userChats, addToChat, removeFromChat, newChat, openDm, destroyChat, lastVisible };
