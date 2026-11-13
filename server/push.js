// Уведомления при закрытом приложении (Web Push). Без сторонних библиотек: подпись VAPID (RFC 8292) и шифрование aes128gcm (RFC 8291) на встроенном crypto.
// Работает в браузерах и в установленном из браузера приложении (PWA). В APK на WebView механизма push нет: для него ниже отдельная лента (GET /api/notify), которую опрашивает фоновая служба приложения.
const crypto = require('crypto');
const C = require('./core');
const R = require('./rpc');
const { db, save, now, need, str } = C;
const H = R.H;

const b64u = b => Buffer.from(b).toString('base64url'), unb = s => Buffer.from(String(s || ''), 'base64url');
// Пара ключей сервера. Создаётся один раз и хранится в базе: если ключ сменить, все подписки придётся оформлять заново.
function keys() {
  if (process.env.VAPID_PUBLIC && process.env.VAPID_PRIVATE) return { pub: process.env.VAPID_PUBLIC, priv: process.env.VAPID_PRIVATE };
  if (!db.meta.vapid) { const e = crypto.createECDH('prime256v1'); e.generateKeys(); db.meta.vapid = { pub: b64u(e.getPublicKey()), priv: b64u(e.getPrivateKey()) }; save(); }
  return db.meta.vapid;
}
let signKey = null, signFor = '';
function signer() { const k = keys(); if (signFor !== k.pub) { const p = unb(k.pub); signKey = crypto.createPrivateKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', d: k.priv, x: b64u(p.subarray(1, 33)), y: b64u(p.subarray(33, 65)) } }); signFor = k.pub; } return signKey; }
// Отправлять можно только настоящим службам доставки: адрес приходит от клиента, и без этого списка сервер можно было бы заставить стучаться куда угодно.
const HOSTS = /^(fcm\.googleapis\.com|android\.googleapis\.com|web\.push\.apple\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com)$/;
function okEndpoint(e) { try { const u = new URL(e); if (process.env.PUSH_ALLOW_ANY) return true; return u.protocol === 'https:' && HOSTS.test(u.hostname); } catch (x) { return false; } }

function vapid(endpoint) {
  const aud = new URL(endpoint).origin, head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: process.env.VAPID_SUBJECT || 'mailto:admin@nudist.app' }));
  const sig = crypto.sign('sha256', Buffer.from(head + '.' + body), { key: signer(), dsaEncoding: 'ieee-p1363' });
  return 'vapid t=' + head + '.' + body + '.' + b64u(sig) + ', k=' + keys().pub;
}
function encrypt(sub, text) {
  const ua = unb(sub.p256dh), auth = unb(sub.auth), salt = crypto.randomBytes(16), e = crypto.createECDH('prime256v1'); e.generateKeys();
  const as = e.getPublicKey(), secret = e.computeSecret(ua);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', secret, auth, Buffer.concat([Buffer.from('WebPush: info\0'), ua, as]), 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce), enc = Buffer.concat([c.update(Buffer.concat([Buffer.from(text), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([as.length]), as, enc]);
}
async function sendOne(sub, payload) {
  const body = encrypt(sub, JSON.stringify(payload));
  const r = await fetch(sub.endpoint, { method: 'POST', headers: { authorization: vapid(sub.endpoint), 'content-encoding': 'aes128gcm', 'content-type': 'application/octet-stream', ttl: '86400', urgency: 'high' }, body, signal: AbortSignal.timeout(10000) });
  return r.status;
}
// Рассылка на все устройства человека. Подписки, которые служба доставки больше не знает (404, 410), удаляются.
async function push(u, payload) {
  const subs = (u.push || []).slice(); let sent = 0, failed = 0;
  for (const s of subs) {
    try { const st = await sendOne(s, payload); if (st >= 200 && st < 300) sent++; else { failed++; if (st === 404 || st === 410) { u.push = (u.push || []).filter(x => x.endpoint !== s.endpoint); save(); } else console.warn('[push] ответ', st, new URL(s.endpoint).hostname); } }
    catch (e) { failed++; console.warn('[push]', e.message); }
  }
  return { sent, failed };
}
const rate = new Map();      // не больше 20 уведомлений в минуту на человека
function allowed(uid) { const t = now(), r = rate.get(uid); if (!r || t - r.t > 60000) { rate.set(uid, { t, n: 1 }); return true; } return ++r.n <= 20; }
// online = true: человек сейчас с открытым приложением или вкладкой, браузерный push не нужен, но в ленту телефона событие кладём:
// приложение для Android само решает, показывать ли его (на экране оно или свёрнуто).
function notify(uid, payload, online) { const u = db.users[uid]; if (!u || u.deleted) return; feedAdd(uid, payload); if (online || !u.push || !u.push.length || !allowed(uid)) return; push(u, payload).catch(e => console.warn('[push]', e.message)); }

// ───── Лента уведомлений для приложения на Android (без сервисов Google).
// Фоновая служба приложения держит долгий запрос GET /api/notify?since=N: сервер отвечает сразу, как только для человека
// появилось событие, или пустым ответом через 40 секунд. Лента живёт в памяти и только у тех, чей телефон недавно спрашивал.
const feeds = new Map();      // пользователь → { q: [{ id, title, body, tag, ts }], waiters: Set, at, tz }
let feedSeq = 0; const nextId = () => (feedSeq = Math.max(feedSeq + 1, Date.now()));      // растёт и после перезапуска сервера
const FEED_KEEP = 50, FEED_IDLE = 5 * 60000, FEED_WAIT = 40000;
function feedAdd(uid, p) {
  const f = feeds.get(uid); if (!f) return;
  const it = { id: nextId(), title: String(p.title || 'Нудист').slice(0, 80), body: String(p.body || '').slice(0, 200), tag: String(p.tag || ''), ts: now() };
  f.q.push(it); if (f.q.length > FEED_KEEP) f.q.splice(0, f.q.length - FEED_KEEP);
  for (const w of [...f.waiters]) w.done([it]);
}
function poll(req, res, url, a, json) {
  if (!a) return json(res, 401, { error: 'Нужна авторизация' });
  const uid = a.u.id; let f = feeds.get(uid); if (!f) { if (feeds.size > 20000) return json(res, 503, { error: 'Слишком много устройств' }); feeds.set(uid, f = { q: [], waiters: new Set(), at: 0 }); }
  f.at = now(); const tz = Number(url.searchParams.get('tz')); if (Number.isFinite(tz) && Math.abs(tz) <= 900) f.tz = Math.round(tz);
  const raw = url.searchParams.get('since'), since = Number(raw);
  if (raw === null || !Number.isFinite(since) || since <= 0) return json(res, 200, { last: nextId(), items: [] });      // первое обращение: старое не пересказываем
  const ready = f.q.filter(x => x.id > since); if (ready.length) return json(res, 200, { last: ready[ready.length - 1].id, items: ready });
  if (f.waiters.size >= 5) return json(res, 429, { error: 'Слишком много ожидающих запросов' });
  const w = { done(items) { if (w.over) return; w.over = true; clearTimeout(w.t); f.waiters.delete(w); f.at = now(); try { json(res, 200, { last: items.length ? items[items.length - 1].id : since, items }); } catch (e) { /* телефон уже отключился */ } } };
  w.t = setTimeout(() => w.done([]), FEED_WAIT); f.waiters.add(w);
  req.on('close', () => { if (!w.over) { w.over = true; clearTimeout(w.t); f.waiters.delete(w); } });
}
setInterval(() => { const t = now(); for (const [uid, f] of feeds) if (!f.waiters.size && t - f.at > FEED_IDLE) feeds.delete(uid); }, 60000).unref();


const KIND = { photo: 'Фото', video: 'Видео', voice: 'Голосовое сообщение', round: 'Кружочек', file: 'Файл', sticker: 'Стикер', gif: 'GIF', poll: 'Опрос', geo: 'Геопозиция', contact: 'Контакт', music: 'Музыка' };
const plain = t => String(t).replace(/\*\*|__|~~|\|\||`/g, '').replace(/\s+/g, ' ').trim();
// Что написать в уведомлении о сообщении; null — уведомлять не о чем
function describe(uid, chat, m, mention, s) {
  const u = db.users[uid]; if (!u || m.from === uid || (u.blocked || []).includes(m.from)) return null;
  if (s && s.mute > now() && !mention) return null;
  if ((chat.type === 'channel' || chat.server) && !mention) return null;      // каналы и серверы шумные: только упоминания
  if (m.type === 'call' && !(m.call && m.call.missed)) return null;      // запись о состоявшемся звонке не повод будить телефон
  const from = db.users[m.from], who = from ? from.name : 'Нудист', group = chat.type !== 'dm' && chat.type !== 'secret';
  let body = m.enc || chat.type === 'secret' ? 'Новое сообщение' : m.once ? 'Одноразовое фото или видео' : m.type === 'call' ? 'Пропущенный звонок' : m.text ? plain(m.text) : KIND[m.type] || 'Новое сообщение';
  if (group && !m.enc) body = who + ': ' + body;
  return { title: group ? chat.title || 'Группа' : who, body: body.slice(0, 140), tag: m.type === 'call' ? 'call' : chat.id, url: '/' };
}
// Сообщение человеку, у которого сейчас нет ни одного открытого соединения: браузерный push
C.setOfflineHook((uid, chat, m, mention, s) => {
  const u = db.users[uid]; if (!u || !u.push || !u.push.length || !allowed(uid)) return;
  const p = describe(uid, chat, m, mention, s); if (p) push(u, p).catch(e => console.warn('[push]', e.message));
});
// Любое новое сообщение: в ленту телефона, если его приложение на связи
C.setMsgHook((uid, chat, m, mention, s) => {
  const f = feeds.get(uid); if (!f || m.silent || m.thread) return;
  const set = (db.users[uid] || {}).settings || {};      // те же переключатели, что в «Настройки → Уведомления»
  if (!mention && (chat.type === 'group' ? set.notifGroup === false : (chat.type === 'dm' || chat.type === 'secret') && set.notifDm === false)) return;
  if (quiet(set.dnd, f.tz)) return;
  const p = describe(uid, chat, m, mention, s); if (!p) return;
  if (set.preview === false) p.body = 'Новое сообщение';
  feedAdd(uid, p);
});
// Тихие часы человека. Сервер не знает его часового пояса, поэтому телефон присылает смещение от UTC в минутах.
function quiet(d, tz) {
  if (!d || !d.on || !/^\d\d:\d\d$/.test(d.from || '') || !/^\d\d:\d\d$/.test(d.to || '')) return false;
  const t = new Date(now() + (tz || 0) * 60000), cur = t.getUTCHours() * 60 + t.getUTCMinutes(), [fh, fm] = d.from.split(':').map(Number), [th, tm] = d.to.split(':').map(Number), a = fh * 60 + fm, b = th * 60 + tm;
  return a <= b ? cur >= a && cur < b : cur >= a || cur < b;
}

H['push.key'] = () => ({ key: keys().pub });
H['push.sub'] = (c, p) => {
  const u = db.users[c.uid], s = p.sub || {}, k = s.keys || {}, endpoint = str(s.endpoint, 600), p256dh = str(k.p256dh, 200), auth = str(k.auth, 100);
  need(endpoint && okEndpoint(endpoint), 'Этот браузер использует неизвестную службу уведомлений');
  need(unb(p256dh).length === 65 && unb(auth).length >= 16, 'Браузер прислал неполную подписку');
  u.push = (u.push || []).filter(x => x.endpoint !== endpoint); u.push.push({ endpoint, p256dh, auth, ts: now() }); if (u.push.length > 10) u.push.splice(0, u.push.length - 10);
  save(); return { devices: u.push.length };
};
H['push.unsub'] = (c, p) => { const u = db.users[c.uid], e = str(p.endpoint, 600); u.push = (u.push || []).filter(x => x.endpoint !== e); save(); return { devices: u.push.length }; };
H['push.test'] = async (c, p) => { const u = db.users[c.uid];
  if (p && p.app) {      // приложение для Android: уведомление уйдёт через 10 секунд, чтобы человек успел свернуть приложение
    need(feeds.has(c.uid), 'Приложение ещё не связалось с сервером. Подождите минуту и попробуйте снова.'); require('./auth').limit('pushtest:' + c.uid, 5, 60000);
    setTimeout(() => feedAdd(c.uid, { title: 'Нудист', body: 'Уведомления работают. Теперь вы ничего не пропустите.', tag: 'test' }), 10000).unref(); return { sent: 1, app: true };
  }
  need(u.push && u.push.length, 'На этом аккаунте уведомления ещё не включены'); return push(u, { title: 'Нудист', body: 'Уведомления работают. Теперь вы ничего не пропустите.', tag: 'test', url: '/' }); };

module.exports = { notify, poll, encrypt, vapid, keys };
