'use strict';
// Админ-панель владельца сервиса: RBAC, пользователи, жалобы, флаги, статистика, мониторинг, аудит.
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const C = require('./core');
const Cloud = require('./cloud');
const A = require('./auth');
const R = require('./rpc');
const G = require('./guild');
const { db, save, now, id, token, fail, need, str, int, today } = C;
const H = R.H;

const RANK = { viewer: 1, moderator: 2, admin: 3, superadmin: 4 };
const rank = u => RANK[(u || {}).admin] || 0;
function guard(c, min) { const u = db.users[c.uid]; need(rank(u) >= RANK[min], 'Недостаточно прав администратора (нужна роль ' + min + ')'); return u; }
function log(c, act, d) { db.audit.push({ ts: now(), by: c.uid, act, d }); if (db.audit.length > 2000) db.audit.splice(0, db.audit.length - 2000); save(); }

let dirCache = { at: 0, size: 0, files: 0 };
function uploadsSize() {
  const cu = Cloud.usage(); if (cu && cu.known) return { at: now(), size: cu.bytes, files: cu.files, max: cu.max };   // файлы в облаке: локальный диск — только кеш
  if (now() - dirCache.at < 60000) return dirCache;
  let size = 0, files = 0;
  try { for (const f of fs.readdirSync(C.UPLOADS)) { size += fs.statSync(path.join(C.UPLOADS, f)).size; files++; } } catch (e) { /* пусто */ }
  return (dirCache = { at: now(), size, files });
}
function stats() {
  const users = Object.values(db.users).filter(u => !u.deleted), people = users.filter(u => !u.bot), t = now();
  const days = []; for (let i = 13; i >= 0; i--) { const k = today(t - i * 864e5), d = db.daily[k] || { msgs: 0, regs: 0, dau: [] }; days.push({ d: k, msgs: d.msgs, regs: d.regs, dau: d.dau.length }); }
  const chats = Object.values(db.chats); const up = uploadsSize();
  return { users: people.length, bots: users.length - people.length, online: [...C.conns.keys()].length, dau: (db.daily[today()] || { dau: [] }).dau.length, wau: people.filter(u => u.seen > t - 7 * 864e5).length, mau: people.filter(u => u.seen > t - 30 * 864e5).length,
    premium: people.filter(C.isPremium).length, banned: people.filter(u => u.banned).length, msgs: Object.values(db.msgs).reduce((a, m) => a + m.length, 0), msgsToday: (db.daily[today()] || {}).msgs || 0,
    groups: chats.filter(c => c.type === 'group').length, channels: chats.filter(c => c.type === 'channel').length, dms: chats.filter(c => c.type === 'dm').length, secrets: chats.filter(c => c.type === 'secret').length, servers: Object.keys(db.servers).length,
    stories: Object.values(db.stories).filter(s => s.ts > t - 864e5).length, reportsOpen: db.reports.filter(r => r.status === 'open').length, uploads: up.size, uploadFiles: up.files, uploadsMax: up.max || 0, starsTotal: people.reduce((a, u) => a + (u.stars || 0), 0), days };
}
function monitor() {
  const m = process.memoryUsage(); let conn = 0; for (const s of C.conns.values()) conn += s.size;
  let dbSize = 0; try { dbSize = fs.statSync(path.join(C.DATA, 'db.json')).size; } catch (e) { /* ещё не записана */ }
  return { uptime: Math.round(process.uptime()), node: process.version, rss: m.rss, heap: m.heapUsed, load: os.loadavg(), cpus: os.cpus().length, connections: conn, voiceRooms: G.rooms.size, voicePeers: [...G.rooms.values()].reduce((a, r) => a + r.peers.size, 0), rpcTotal: C.metrics.rpc, rpcErrors: C.metrics.errors, rpcPerMin: C.metrics.perMin.slice(-30), dbSize, scheduled: db.scheduled.length,
    components: [
      { name: 'HTTP API', ok: true, note: 'работает (этот процесс)' }, { name: 'WebSocket-шлюз', ok: true, note: conn + ' соединений' },
      { name: 'STUN/TURN', ok: !!(process.env.ICE_SERVERS || (process.env.TURN_HOST && process.env.TURN_SECRET)), note: process.env.TURN_HOST && process.env.TURN_SECRET ? 'свой TURN: ' + process.env.TURN_HOST : process.env.ICE_SERVERS ? 'задан через ICE_SERVERS' : 'только публичный STUN, TURN не настроен' },
      { name: 'SFU', ok: false, note: 'не развёрнут — звонки идут P2P mesh (до 12 участников)' }, { name: 'Брокер (Kafka)', ok: false, note: 'не используется — один процесс, события в памяти' },
      { name: 'Хранилище', ok: true, note: 'JSON-файл ' + (dbSize / 1024).toFixed(0) + ' КБ' }, { name: 'SMS-шлюз', ok: false, note: 'не подключён — демо-коды' }, { name: 'Push (FCM/APNs)', ok: false, note: 'не подключены — только уведомления браузера' },
    ] };
}

H['admin.me'] = c => ({ role: guard(c, 'viewer').admin });
H['admin.stats'] = c => { guard(c, 'viewer'); return stats(); };
H['admin.monitor'] = c => { guard(c, 'viewer'); return monitor(); };
H['admin.users'] = (c, p) => {
  guard(c, 'viewer'); const q = str(p.q, 64).toLowerCase();
  let list = Object.values(db.users).filter(u => !u.deleted);
  if (q) list = list.filter(u => ((u.username || '') + ' ' + R.uname(u) + ' ' + (u.phone || '') + ' ' + u.id).toLowerCase().includes(q));
  if (p.filter === 'banned') list = list.filter(u => u.banned); if (p.filter === 'premium') list = list.filter(C.isPremium); if (p.filter === 'bots') list = list.filter(u => u.bot); if (p.filter === 'staff') list = list.filter(u => u.admin); if (p.filter === 'online') list = list.filter(u => C.isOnline(u.id));
  list.sort((a, b) => (b.seen || 0) - (a.seen || 0));
  const off = int(p.offset, 0, 1e7);
  return { total: list.length, users: list.slice(off, off + 50).map(u => { const ss = Object.values(db.sessions).filter(s => s.user === u.id); return { id: u.id, username: u.username, name: R.uname(u), phone: u.phone, avatar: u.avatar, color: u.color, created: u.created, seen: u.seen, online: C.isOnline(u.id), sessions: ss.length, ip: (ss.sort((a, b) => b.seen - a.seen)[0] || {}).ip, banned: !!u.banned, banReason: u.banReason, muted: u.muted > now() ? u.muted : 0, admin: u.admin, premiumUntil: u.premiumUntil, stars: u.stars || 0, bot: !!u.bot, owner: u.owner, badges: u.badges || [], chats: (u.chats || []).length, servers: (u.servers || []).length, totp: !!u.totpOn }; }) };
};
function target(c, uid, min = 'moderator') { const me = guard(c, min); const u = db.users[uid]; need(u && !u.deleted, 'Пользователь не найден'); need(u.id === me.id || rank(u) < rank(me), 'Нельзя управлять администратором своего или более высокого ранга'); return u; }
H['admin.user.ban'] = (c, p) => {
  const u = target(c, p.id); need(u.id !== c.uid, 'Себя банить не надо');
  u.banned = !!p.on || undefined; u.banReason = p.on ? str(p.reason, 200) : undefined;
  if (p.on) for (const t of Object.keys(db.sessions)) if (db.sessions[t].user === u.id) A.killSession(t);
  log(c, p.on ? 'user.ban' : 'user.unban', `${R.uname(u)} (@${u.username || u.id})${p.reason ? ': ' + str(p.reason, 200) : ''}`);
};
H['admin.user.mute'] = (c, p) => { const u = target(c, p.id); const h = int(p.hours, 0, 8760); u.muted = h ? now() + h * 3600e3 : undefined; log(c, h ? 'user.mute' : 'user.unmute', `${R.uname(u)}${h ? ' на ' + h + ' ч' : ''}`); };
H['admin.user.logout'] = (c, p) => { const u = target(c, p.id); for (const t of Object.keys(db.sessions)) if (db.sessions[t].user === u.id) A.killSession(t); log(c, 'user.logout', R.uname(u)); };
// Роли администраторов. Назначает главный админ; тех, кто равен ему по рангу, может менять только владелец сервиса.
function roleBlock(me, u) {
  if (rank(me) < RANK.superadmin) return 'Назначать администраторов может только главный админ';
  if (!u || u.deleted) return 'Пользователь не найден';
  if (u.bot) return 'Боту роль администратора не выдать';
  if (u.id === me.id) return 'Свою роль менять нельзя';
  if (C.isOwner(u)) return 'Роль владельца сервиса изменить нельзя';
  if (!C.isOwner(me) && rank(u) >= rank(me)) return 'Роль главного админа может менять только владелец сервиса';
  return '';
}
function applyRole(c, u, role) {
  need(!role || RANK[role], 'Неизвестная роль');
  u.admin = role || undefined;
  const badges = (u.badges || []).filter(b => b !== 'staff'); if (u.admin) badges.push('staff'); u.badges = badges;
  save(); R.selfUpdate(u); C.broadcastUser(u); log(c, 'user.role', `${R.uname(u)} (@${u.username || u.id}): ${u.admin || 'роль снята'}`);
}
const staffView = (me, u) => ({ id: u.id, username: u.username, name: R.uname(u), avatar: u.avatar, color: u.color, role: u.admin || null, owner: C.isOwner(u), online: C.isOnline(u.id), seen: u.seen, can: !roleBlock(me, u) });
H['admin.staff'] = c => {
  const me = guard(c, 'viewer');
  const list = Object.values(db.users).filter(u => u.admin && !u.deleted && !u.bot).sort((a, b) => (C.isOwner(b) - C.isOwner(a)) || rank(b) - rank(a) || (a.created || 0) - (b.created || 0));
  return { me: { id: me.id, role: me.admin, owner: C.isOwner(me) }, staff: list.map(u => staffView(me, u)) };
};
H['admin.staff.find'] = (c, p) => {
  const me = guard(c, 'superadmin'); const q = str(p.q, 64).toLowerCase().replace(/^@/, '');
  if (p.id) { const u = db.users[str(p.id, 32)]; need(u && !u.deleted, 'Пользователь не найден'); return { users: [staffView(me, u)] }; }
  if (!q) return { users: [] };
  const list = Object.values(db.users).filter(u => !u.deleted && !u.bot && u.id !== me.id && ((u.username || '') + ' ' + R.uname(u)).toLowerCase().includes(q));
  list.sort((a, b) => ((b.username || '').toLowerCase() === q) - ((a.username || '').toLowerCase() === q) || (b.seen || 0) - (a.seen || 0));
  return { users: list.slice(0, 20).map(u => staffView(me, u)) };
};
H['admin.role.set'] = (c, p) => {
  const me = guard(c, 'viewer'), u = db.users[str(p.id, 32)], why = roleBlock(me, u); need(!why, why);
  applyRole(c, u, p.role ? str(p.role, 16) : null);
  return { ok: true, role: u.admin || null };
};
// При старте: владельцам из OWNERS — роль главного админа.
for (const oid of C.OWNERS) {
  const u = db.users[oid];
  if (!u || u.deleted || u.bot) { console.error('[owners] аккаунт', oid, 'не найден — проверьте переменную OWNERS'); continue; }
  if (u.admin !== 'superadmin' || !(u.badges || []).includes('staff')) { u.admin = 'superadmin'; u.badges = [...(u.badges || []).filter(b => b !== 'staff'), 'staff']; save(); console.log('[owners] главный админ:', R.uname(u), '@' + (u.username || u.id)); }
}

H['admin.user.set'] = (c, p) => {
  const roleOnly = p.admin !== undefined && C.isOwner(db.users[c.uid]);   // владелец может менять роль и у равных по рангу
  const u = roleOnly ? db.users[p.id] : target(c, p.id, 'admin'); const ch = []; need(u && !u.deleted, 'Пользователь не найден');
  if (p.badges !== undefined) { u.badges = (Array.isArray(p.badges) ? p.badges : []).filter(b => ['verified', 'staff', 'developer'].includes(b)); ch.push('бейджи: ' + (u.badges.join(', ') || '—')); }
  if (p.premiumDays !== undefined) { const d = int(p.premiumDays, 0, 3650); u.premiumUntil = d ? now() + d * 864e5 : undefined; ch.push(d ? 'премиум на ' + d + ' дн.' : 'премиум снят'); }
  if (p.stars !== undefined) { u.stars = int(p.stars, 0, 1e9); ch.push('листики = ' + u.stars); }
  if (p.listed !== undefined && u.bot) { u.listed = !!p.listed; ch.push(u.listed ? 'бот в каталоге' : 'бот убран из каталога'); }
  if (p.admin !== undefined) { const why = roleBlock(db.users[c.uid], u); need(!why, why); applyRole(c, u, p.admin || null); ch.push('роль: ' + (u.admin || 'нет')); }
  save(); R.selfUpdate(u); C.broadcastUser(u); log(c, 'user.set', `${R.uname(u)}: ${ch.join('; ')}`);
};
H['admin.reports'] = (c, p) => {
  guard(c, 'moderator');
  const list = db.reports.filter(r => (p.status || 'open') === 'all' || r.status === (p.status || 'open')).slice(-200).reverse();
  const name = uid => { const u = db.users[uid]; return u ? R.uname(u) + (u.username ? ' @' + u.username : '') : uid; };
  return list.map(r => ({ ...r, byName: name(r.by), targetName: r.type === 'user' ? name(r.target) : r.type === 'msg' ? name((r.snap || {}).from) : r.type === 'chat' ? (db.chats[r.target] || {}).title : (db.servers[r.target] || {}).name, chatTitle: r.chat ? (db.chats[r.chat] || {}).title : undefined, resolvedByName: r.resolvedBy ? name(r.resolvedBy) : undefined }));
};
H['admin.report.resolve'] = (c, p) => {
  guard(c, 'moderator'); const r = db.reports.find(x => x.id === p.id); need(r && r.status === 'open', 'Жалоба не найдена или уже закрыта');
  const act = ['dismiss', 'delete', 'ban', 'mute'].includes(p.action) ? p.action : 'dismiss';
  const offender = r.type === 'user' ? r.target : r.type === 'msg' ? (r.snap || {}).from : null;
  if (act === 'delete' && r.type === 'msg' && db.chats[r.chat]) C.deleteMessages(db.chats[r.chat], [r.target]);
  if (act === 'ban' && offender) H['admin.user.ban'](c, { id: offender, on: true, reason: 'по жалобе: ' + r.reason });
  if (act === 'mute' && offender) H['admin.user.mute'](c, { id: offender, hours: 24 });
  r.status = 'resolved'; r.resolution = act; r.note = str(p.note, 300); r.resolvedBy = c.uid; r.resolvedAt = now();
  log(c, 'report.' + act, `жалоба ${r.id} (${r.reason})`);
};
H['admin.chats'] = (c, p) => {
  guard(c, 'viewer'); const q = str(p.q, 64).toLowerCase();
  const chats = Object.values(db.chats).filter(ch => (ch.type === 'group' || ch.type === 'channel') && (!q || (ch.title || '').toLowerCase().includes(q) || (ch.username || '').toLowerCase().includes(q))).map(ch => ({ kind: ch.type, id: ch.id, title: ch.title, username: ch.username, pub: !!ch.pub, members: C.size(ch.members), msgs: (db.msgs[ch.id] || []).length, verified: !!ch.verified, created: ch.created }));
  const servers = Object.values(db.servers).filter(s => !q || s.name.toLowerCase().includes(q)).map(s => ({ kind: 'server', id: s.id, title: s.name, pub: !!s.pub, members: C.size(s.members), msgs: s.channels.reduce((a, x) => a + (db.msgs[x] || []).length, 0), verified: !!s.verified, created: s.created, boosts: s.boosts || 0 }));
  return [...servers, ...chats].sort((a, b) => b.members - a.members).slice(0, 200);
};
H['admin.chat.set'] = (c, p) => {
  guard(c, 'admin');
  if (p.kind === 'server') { const s = db.servers[p.id]; need(s, 'Сервер не найден'); if (p.del) { log(c, 'server.del', s.name); return G.destroyServer(s); } s.verified = !!p.verified; save(); G.emitServer(s); log(c, 'server.verify', `${s.name}: ${s.verified}`); }
  else { const ch = db.chats[p.id]; need(ch && !ch.server, 'Чат не найден'); if (p.del) { log(c, 'chat.del', ch.title); return C.destroyChat(ch); } ch.verified = !!p.verified; save(); C.emitChat(ch); log(c, 'chat.verify', `${ch.title}: ${ch.verified}`); }
};
H['admin.flags'] = (c, p) => {
  if (p.set) { guard(c, 'admin'); for (const k of Object.keys(db.flags)) if (typeof p.set[k] === 'boolean' && p.set[k] !== db.flags[k]) { db.flags[k] = p.set[k]; log(c, 'flag', `${k} = ${p.set[k]}`); } save(); C.emitAll('flags', db.flags); }
  else guard(c, 'viewer');
  return db.flags;
};
H['admin.audit'] = c => { guard(c, 'admin'); const name = uid => { const u = db.users[uid]; return u ? R.uname(u) : uid; }; return db.audit.slice(-300).reverse().map(a => ({ ...a, byName: name(a.by) })); };
H['admin.broadcast'] = (c, p) => {
  guard(c, 'admin'); const text = str(p.text, 2000); need(text, 'Пустое объявление');
  const sysBot = db.users[db.meta.sys]; let n = 0;
  for (const u of Object.values(db.users)) if (!u.bot && !u.deleted) { C.postMessage(C.openDm(sysBot.id, u.id), sysBot.id, { text: '📣 ' + text }, { quiet: true }); n++; }
  log(c, 'broadcast', text.slice(0, 80)); return { n };
};
H['admin.apikeys'] = (c, p) => {
  guard(c, 'superadmin'); db.meta.apiKeys = db.meta.apiKeys || [];
  if (p.del) { db.meta.apiKeys = db.meta.apiKeys.filter(k => k.id !== p.del); log(c, 'apikey.del'); save(); }
  if (p.new) { const key = 'nud_' + token(24); const k = { id: id(), name: str(p.new, 40), hash: crypto.createHash('sha256').update(key).digest('hex'), at: now() }; db.meta.apiKeys.push(k); log(c, 'apikey.new', k.name); save(); return { key, list: db.meta.apiKeys.map(x => ({ id: x.id, name: x.name, at: x.at })) }; }
  return { list: db.meta.apiKeys.map(x => ({ id: x.id, name: x.name, at: x.at })) };
};
// HTTP API для интеграций: Authorization: Bearer nud_…
function httpApi(pathname, auth) {
  const key = (auth || '').replace(/^Bearer\s+/i, ''); const h = crypto.createHash('sha256').update(key).digest('hex');
  if (!key || !(db.meta.apiKeys || []).some(k => k.hash === h)) return { code: 401, body: { error: 'unauthorized' } };
  if (pathname === '/api/admin/stats') return { code: 200, body: stats() };
  if (pathname === '/api/admin/monitor') return { code: 200, body: monitor() };
  if (pathname === '/api/admin/flags') return { code: 200, body: db.flags };
  return { code: 404, body: { error: 'not found' } };
}
module.exports = { httpApi, stats, monitor };
