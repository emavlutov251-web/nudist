'use strict';
// Аутентификация: пароль, «SMS»-код (демо), QR-вход, TOTP, коды восстановления, сессии.
const crypto = require('crypto');
const C = require('./core');
const { db, save, now, id, token, fail, need, str, USERNAME_RE } = C;

// ───── пароли
function hashPass(p) { const salt = crypto.randomBytes(16); return salt.toString('hex') + ':' + crypto.scryptSync(p, salt, 32).toString('hex'); }
const scryptA = (p, salt) => new Promise((res, rej) => crypto.scrypt(p, salt, 32, (e, k) => (e ? rej(e) : res(k))));
async function hashPassAsync(p) { const salt = crypto.randomBytes(16); return salt.toString('hex') + ':' + (await scryptA(p, salt)).toString('hex'); }
async function checkPassAsync(p, h) {
  if (!h || typeof p !== 'string') return false;
  const [s, k] = h.split(':'); const a = await scryptA(p, Buffer.from(s, 'hex')), b = Buffer.from(k, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function checkPass(p, h) {
  if (!h || typeof p !== 'string') return false;
  const [s, k] = h.split(':'); const a = crypto.scryptSync(p, Buffer.from(s, 'hex'), 32), b = Buffer.from(k, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ───── TOTP (RFC 6238)
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32enc(buf) { let bits = '', out = ''; for (const b of buf) bits += b.toString(2).padStart(8, '0'); for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)]; return out; }
function b32dec(s) { let bits = ''; for (const ch of s.replace(/=+$/, '').toUpperCase()) { const v = B32.indexOf(ch); if (v >= 0) bits += v.toString(2).padStart(5, '0'); } const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out); }
function totp(secret, t = Date.now()) {
  const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(Math.floor(t / 30000)));
  const h = crypto.createHmac('sha1', b32dec(secret)).update(b).digest(); const o = h[19] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0');
}
const totpOk = (secret, code) => [-1, 0, 1].some(d => totp(secret, Date.now() + d * 30000) === String(code || '').replace(/\s/g, ''));
const newRecovery = () => Array.from({ length: 8 }, () => crypto.randomBytes(5).toString('hex'));
function useRecovery(u, code) {
  code = String(code || '').trim().toLowerCase(); const i = (u.recovery || []).indexOf(code);
  if (i < 0) return false; u.recovery.splice(i, 1); return true;
}

// ───── ограничение частоты
const buckets = new Map();
function limit(key, n, ms) {
  const t = now(); const arr = (buckets.get(key) || []).filter(x => x > t - ms);
  if (arr.length >= n) fail('Слишком много попыток. Остыньте, выпейте воды и попробуйте позже.');
  arr.push(t); buckets.set(key, arr);
}
setInterval(() => { const t = now() - 3600e3; for (const [k, arr] of buckets) if (!arr.length || arr[arr.length - 1] < t) buckets.delete(k); }, 600e3).unref();
setInterval(() => { const t = now(); for (const [k, a] of buckets) if (!a.length || a[a.length - 1] < t - 3600e3) buckets.delete(k); }, 600e3).unref();

// ───── пользователи и сессии
const AVA_COLORS = 8;
// Приглашения: новичок пришёл по ссылке друга — обоим листики, сразу в контактах друг у друга и готовый чат.
const REF_BONUS = 100, REF_DAILY = 5;      // бонус за приглашённого и за скольких в день его платят пригласившему
const START_LEAVES = (() => { const n = Number(process.env.LEAF_START); return process.env.LEAF_START !== undefined && Number.isInteger(n) && n >= 0 && n <= 1e6 ? n : 500; })();      // сколько листиков у нового аккаунта
function invitedBy(u, ref) {
  const inv = db.users[C.byName.get(String(ref).replace(/^@/, '').toLowerCase())];
  if (!inv || inv.bot || inv.deleted || inv.banned || inv.id === u.id) return;
  u.ref = inv.id; inv.invited = (inv.invited || 0) + 1;
  const d = C.today(); if (inv.refDay !== d) { inv.refDay = d; inv.refToday = 0; }
  const paid = ++inv.refToday <= REF_DAILY;      // потолок на день, чтобы листики не печатали регистрацией пустышек
  if (paid) inv.stars = (inv.stars || 0) + REF_BONUS;
  u.stars = (u.stars || 0) + REF_BONUS;
  for (const [a, b] of [[u, inv], [inv, u]]) { a.contacts = a.contacts || []; if (!a.contacts.includes(b.id)) a.contacts.push(b.id); }
  setTimeout(() => {
    if (!db.users[u.id] || !db.users[inv.id]) return;
    const ch = C.openDm(inv.id, u.id);
    C.service(ch, u.id, 'пришёл(ла) по приглашению. ' + (paid ? `Обоим по ${REF_BONUS} 🍃` : `Новичку ${REF_BONUS} 🍃`));
    C.emit(inv.id, 'me', C.selfUser(inv)); C.emit(u.id, 'me', C.selfUser(u));
  }, 2500);
}
let humans = false;
function hasHuman() { if (humans) return true; for (const k in db.users) if (!db.users[k].bot) { humans = true; break; } return humans; }
function createUser(f) {
  const u = { id: id(), name: f.name || 'Нудист', last: f.last || '', username: f.username, phone: f.phone, color: Math.floor(Math.random() * AVA_COLORS), created: now(), seen: now(), stars: START_LEAVES, chats: [], servers: [], contacts: [], blocked: [], privacy: {}, ...f.extra };
  if (f.hash) u.pass = f.hash; else if (f.password) u.pass = hashPass(f.password);
  if (!f.bot && !hasHuman()) { u.admin = 'superadmin'; u.badges = ['staff']; }
  if (!f.bot) humans = true;
  db.users[u.id] = u;
  if (u.username) C.byName.set(u.username.toLowerCase(), u.id);
  if (!f.bot) { C.day().regs++; hooks.onRegister.forEach(h => h(u)); if (f.ref) invitedBy(u, f.ref); }
  save();
  return u;
}
const hooks = { onRegister: [], onLogin: [] };
function deviceName(ua = '') {
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Неизвестная ОС';
  const br = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /YaBrowser/.test(ua) ? 'Яндекс Браузер' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Браузер';
  return br + ' · ' + os;
}
// Сеансы хранятся под хешем токена: сам токен знает только устройство человека. Если файл базы утечёт,
// войти по нему в чужие аккаунты не получится. Внутри сервера «ключ сеанса» — это везде хеш.
const sid = t => crypto.createHash('sha256').update(String(t || '')).digest('hex');
if (!db.meta.sessHashed) {          // однократный перевод старой базы
  const old = Object.keys(db.sessions);
  for (const k of old) { const s = db.sessions[k]; delete db.sessions[k]; db.sessions[sid(k)] = s; }
  db.meta.sessHashed = 1; save();
  if (old.length) console.log(`[auth] сеансы переведены на хранение под хешем: ${old.length}`);
}
function createSession(u, meta) {
  if (u.banned) fail('Аккаунт заблокирован администрацией' + (u.banReason ? ': ' + u.banReason : ''));
  const t = token(32), key = sid(t);
  const s = u.hideMeta ? { id: id(), user: u.id, ua: 'Неизвестное устройство', at: now(), seen: now() }      // человек попросил не хранить адрес и устройство
    : { id: id(), user: u.id, ua: deviceName(meta.ua), ip: meta.ip, at: now(), seen: now() };
  db.sessions[key] = s;
  let others = 0;
  if (now() - u.created > 15000) for (const k in db.sessions) if (k !== key && db.sessions[k].user === u.id) { others = 1; break; }      // у только что созданного аккаунта других сеансов нет
  if (others > 0) hooks.onLogin.forEach(h => h(u, s));
  save();
  return { token: t };
}
function killSession(tok) {
  const s = db.sessions[tok]; if (!s) return;
  delete db.sessions[tok];
  for (const c of C.conns.get(s.user) || []) if (c.token === tok) { c.send('session.killed', {}); setTimeout(() => c.close(), 50); }
  save();
}
function deleteUser(u) {
  for (const t of Object.keys(db.sessions)) if (db.sessions[t].user === u.id) killSession(t);
  for (const cid of [...(u.chats || [])]) {
    const c = db.chats[cid]; if (!c) continue;
    if (c.type === 'saved' || c.type === 'secret') { C.destroyChat(c); continue; }
    if (c.type === 'dm') continue;
    const wasOwner = c.members[u.id] && c.members[u.id].role === 'owner';
    C.removeFromChat(c, u.id);
    if (wasOwner) { const next = Object.keys(c.members)[0]; if (next) c.members[next].role = 'owner'; else C.destroyChat(c); }
  }
  for (const sid of [...(u.servers || [])]) { const s = db.servers[sid]; if (!s) continue; delete s.members[u.id]; if (s.owner === u.id) { const next = Object.keys(s.members)[0]; if (next) s.owner = next; } }
  for (const k of Object.keys(db.stories)) if (db.stories[k].user === u.id) { C.releaseFiles(db.stories[k]); delete db.stories[k]; }
  for (const h of C.hooks.userGone) { try { h(u); } catch (e) { console.error('[hook]', e); } }      // записи ленты и клипы
  C.releaseFiles(u.avatar, u.avatars);
  if (u.username) C.byName.delete(u.username.toLowerCase());
  db.users[u.id] = { id: u.id, deleted: true, name: 'Удалённый аккаунт', created: u.created };
  C.broadcastUser(db.users[u.id]);
  save();
}

// ───── HTTP-обработчики (body: объект, meta: {ip, ua})
const phoneCodes = new Map(); // phone -> {code, exp, tries}
const qr = new Map();         // id -> {secret, exp, token?}
const normPhone = p => { p = String(p || '').replace(/[^\d+]/g, ''); if (/^8\d{10}$/.test(p)) p = '+7' + p.slice(1); if (/^\d{10,15}$/.test(p)) p = '+' + p; return /^\+\d{10,15}$/.test(p) ? p : null; };
const findByPhone = p => Object.values(db.users).find(u => u.phone === p && !u.deleted);

function second(u, b) { // вторая ступень: пароль (для входа по телефону) и TOTP
  if (u.totpOn) {
    if (!b.code) return { need: 'totp' };
    if (!totpOk(u.totp, b.code) && !useRecovery(u, b.code)) fail('Неверный код. Код из приложения-аутентификатора или код восстановления.');
  }
  return null;
}
const api = {
  async register(b, meta) {
    need(db.flags.registration, 'Регистрация временно закрыта. Пляж переполнен.');
    limit('reg:' + meta.ip, 120, 3600e3);
    const username = str(b.username, 32), password = typeof b.password === 'string' ? b.password : '';
    need(USERNAME_RE.test(username), 'Username: латиница, цифры и _, от 3 до 32 символов, начинается с буквы');
    need(!C.usernameTaken(username), 'Этот username уже занят. Кто-то разделся раньше вас.');
    need(password.length >= 6 && password.length <= 200, 'Пароль — минимум 6 символов');
    const hash = await hashPassAsync(password);
    need(!C.usernameTaken(username), 'Этот username уже занят. Кто-то разделся раньше вас.');      // пока считался хеш, имя могли занять
    const u = createUser({ username, hash, name: str(b.name, 64) || username, ref: str(b.ref, 32) });
    if (b.agree === true) u.policy = { v: C.POLICY, ts: now() };      // галочка на форме регистрации; без неё приложение спросит согласие при первом входе
    return createSession(u, meta);
  },
  async login(b, meta) {
    // Лимиты на подбор пароля: строгий на пару «адрес + аккаунт», мягкие на адрес (за одним адресом оператора сидят сотни людей) и на аккаунт.
    const lname = str(b.username, 32).replace(/^@/, '').toLowerCase();
    limit('login:' + meta.ip + ':' + lname, 10, 600e3); limit('loginu:' + lname, 40, 600e3); limit('login:' + meta.ip, 300, 600e3);
    const u = db.users[C.byName.get(lname)];
    if (!u || u.bot || !(await checkPassAsync(b.password, u.pass))) fail('Неверный username или пароль');
    return second(u, b) || createSession(u, meta);
  },
  'phone/start'(b, meta) {
    need(db.flags.phoneAuth, 'Вход по номеру отключён администратором');
    limit('sms:' + meta.ip, 60, 600e3);
    const phone = normPhone(b.phone); need(phone, 'Введите номер в международном формате, например +7 999 123-45-67');
    const code = String(crypto.randomInt(10000, 100000));
    phoneCodes.set(phone, { code, exp: now() + 300e3, tries: 0 });
    console.log(`[sms-demo] код для ${phone}: ${code}`);
    // SMS-шлюз не подключён: код возвращается клиенту и показывается на экране (демо-режим).
    return { sent: true, demoCode: code, exists: !!findByPhone(phone) };
  },
  'phone/verify'(b, meta) {
    const phone = normPhone(b.phone); need(phone, 'Некорректный номер');
    const pc = phoneCodes.get(phone);
    need(pc && pc.exp > now(), 'Код устарел, запросите новый');
    if (++pc.tries > 5) { phoneCodes.delete(phone); fail('Слишком много попыток, запросите новый код'); }
    need(pc.code === String(b.code || '').trim(), 'Неверный код');
    let u = findByPhone(phone);
    if (!u) {
      need(db.flags.registration, 'Регистрация временно закрыта');
      const name = str(b.name, 64); if (!name) return { need: 'name' };
      u = createUser({ phone, name });
    } else {
      if (u.pass && !u.totpOn) { if (!b.password) return { need: 'password' }; if (!checkPass(b.password, u.pass)) fail('Неверный облачный пароль'); }
      const s2 = second(u, { code: b.totp }); if (s2) return s2;
    }
    phoneCodes.delete(phone);
    return createSession(u, meta);
  },
  recover(b, meta) {
    limit('rec:' + meta.ip, 6, 600e3);
    const u = db.users[C.byName.get(str(b.username, 32).replace(/^@/, '').toLowerCase())];
    need(u && useRecovery(u, b.code), 'Неверный username или код восстановления');
    need(typeof b.password === 'string' && b.password.length >= 6, 'Новый пароль — минимум 6 символов');
    u.pass = hashPass(b.password); u.totpOn = false; delete u.totp;
    for (const t of Object.keys(db.sessions)) if (db.sessions[t].user === u.id) killSession(t);
    return createSession(u, meta);
  },
  'qr/new'(b, meta) {
    limit('qr:' + meta.ip, 60, 600e3);
    const q = { secret: token(16), exp: now() + 120e3, meta }; const qid = token(9);
    qr.set(qid, q);
    return { id: qid, secret: q.secret, ttl: 120 };
  },
  'qr/poll'(b) {
    const q = qr.get(str(b.id, 64));
    if (!q || q.exp < now() || q.secret !== b.secret) return { expired: true };
    if (q.token) { qr.delete(b.id); return { token: q.token }; }
    return { wait: true };
  },
};
function approveQr(user, qid) {
  const q = qr.get(qid); need(q && q.exp > now() && !q.token, 'QR-код устарел. Обновите его на новом устройстве.');
  q.token = createSession(user, q.meta).token;
}
setInterval(() => { const t = now(); for (const [k, q] of qr) if (q.exp < t - 60e3) qr.delete(k); for (const [k, p] of phoneCodes) if (p.exp < t) phoneCodes.delete(k); }, 60e3).unref();

module.exports = { REF_BONUS, api, hashPass, checkPass, totp, totpOk, b32enc, newRecovery, useRecovery, createUser, createSession, killSession, sid, deleteUser, approveQr, limit, hooks, normPhone, findByPhone, phoneCodes };
