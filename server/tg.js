'use strict';
// Вход через Telegram: человеку из Telegram не нужно придумывать пароль — его узнаёт бот.
// Дороги три, проверка одна:
//   1) с сайта: «Войти через Telegram» → ссылка t.me/<бот>?start=login_<код> → человек жмёт Start → бот видит, кто это → сайт получает сеанс;
//   2) из Telegram: /start у бота → кнопки «Открыть Нудист» (мини-приложение прямо в Telegram) и «Открыть в браузере» (одноразовая ссылка);
//   3) мини-приложение: Telegram передаёт данные о человеке с подписью (initData), сервер сверяет её ключом бота.
// Нужен ключ бота (TG_BOT_TOKEN или ключ, вставленный в окне импорта стикеров) и публичный https-адрес сайта (SITE_URL): на него
// Telegram присылает сообщения боту (вебхук). От человека сохраняется только номер аккаунта в Telegram и его @username.
// Выключить: TG_LOGIN=off.
const crypto = require('crypto');
const C = require('./core');
const R = require('./rpc');
const A = require('./auth');
const { db, save, now, need, fail, str } = C;
const H = R.H;

const TG = (process.env.TG_API || 'https://api.telegram.org').replace(/\/+$/, '');
const SITE = (process.env.SITE_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, '');
const HOOK = (process.env.TG_HOOK_URL || SITE).replace(/\/+$/, '');      // куда Telegram шлёт сообщения боту; отличается от адреса сайта, если до сайта Telegram не достаёт (мост на старом адресе)
const ON = process.env.TG_LOGIN !== 'off';
const token = () => process.env.TG_BOT_TOKEN || (db.meta && db.meta.tgBot) || '';
const secretOf = t => crypto.createHash('sha256').update('tg-hook:' + t).digest('hex').slice(0, 48);      // его Telegram присылает в заголовке каждого сообщения боту
const bot = { username: '', id: 0, token: '', hook: false };
const ready = () => ON && !!bot.username && bot.token === token();
const botName = () => (ready() ? bot.username : '');

async function call(method, body) {
  const r = await fetch(`${TG}/bot${token()}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}), signal: AbortSignal.timeout(15000) });
  const j = await r.json().catch(() => null); if (!j || !j.ok) throw new Error(method + ': ' + ((j && j.description) || r.status)); return j.result;
}
// При запуске и при смене ключа бота: узнать имя бота, попросить Telegram слать сообщения нам, поставить кнопку меню «Нудист».
async function setup() {
  const t = token(); if (!ON || !t) return;
  try {
    const me = await call('getMe'); Object.assign(bot, { username: me.username, id: me.id, token: t });
    if (/^https:\/\//.test(SITE) && /^https:\/\//.test(HOOK)) {
      await call('setWebhook', { url: HOOK + '/api/tg/hook', secret_token: secretOf(t), allowed_updates: ['message'] }); bot.hook = true;
      await call('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Нудист', web_app: { url: SITE + '/' } } }).catch(e => console.warn('[tg] кнопка меню:', e.message));
      await call('setMyCommands', { commands: [{ command: 'start', description: 'Открыть «Нудист»' }] }).catch(() => {});
      console.log(`[tg] вход через Telegram включён: @${bot.username}, сообщения боту идут на ${HOOK}/api/tg/hook`);
    } else console.log(`[tg] бот @${bot.username} найден, но адрес сайта (SITE_URL) не https — вход через Telegram работать не будет`);
  } catch (e) { console.warn('[tg] вход через Telegram не настроен:', e.message); }
}
setTimeout(setup, Number(process.env.TG_SETUP_MS) || 2500).unref();
setInterval(() => { if (ON && token() && bot.token !== token()) setup(); }, 60e3).unref();      // ключ бота вставили позже или сменили

// ───── кто это: одноразовые коды и ссылки (живут 10 минут, только в памяти)
const TTL = 600e3, pend = new Map(), links = new Map();
const tok = n => crypto.randomBytes(n).toString('base64url');
setInterval(() => { const t = now(); for (const m of [pend, links]) for (const [k, v] of m) if (v.exp < t) m.delete(k); }, 60e3).unref();
const tgUser = f => (f && Number.isSafeInteger(f.id) && f.id > 0 && !f.is_bot ? { id: f.id, name: str([f.first_name, f.last_name].filter(Boolean).join(' '), 64) || 'Нудист', username: /^[A-Za-z][A-Za-z0-9_]{2,31}$/.test(f.username || '') ? f.username : '' } : null);
let index = null;      // номер в Telegram → id аккаунта
const byTg = id => { if (!index) { index = new Map(); for (const u of Object.values(db.users)) if (u.tg && !u.deleted) index.set(u.tg.id, u.id); } const u = db.users[index.get(id)]; return u && !u.deleted && u.tg && u.tg.id === id ? u : null; };
A.hooks.onRegister.push(() => { index = null; });

// Данные мини-приложения: Telegram подписывает их ключом бота. Подпись не сошлась или данные старше суток — не верим.
function checkInitData(raw) {
  need(typeof raw === 'string' && raw.length > 20 && raw.length < 4096, 'Telegram не передал данные для входа');
  const q = new URLSearchParams(raw), hash = q.get('hash') || ''; q.delete('hash');
  const line = [...q.entries()].map(([k, v]) => k + '=' + v).sort().join('\n');
  const key = crypto.createHmac('sha256', 'WebAppData').update(token()).digest(), mac = crypto.createHmac('sha256', key).update(line).digest('hex');
  const a = Buffer.from(mac), b = Buffer.from(hash.toLowerCase());
  need(a.length === b.length && crypto.timingSafeEqual(a, b), 'Подпись Telegram не сошлась. Откройте приложение из бота ещё раз.');
  need(Math.abs(now() / 1000 - Number(q.get('auth_date'))) < 86400, 'Данные Telegram устарели. Откройте приложение из бота ещё раз.');
  let f = null; try { f = JSON.parse(q.get('user') || 'null'); } catch (e) { /* не JSON */ }
  const u = tgUser(f); need(u, 'Telegram не сообщил, кто вы'); return u;
}
const freeName = base => { let n = (base || '').slice(0, 28); if (!C.USERNAME_RE.test(n)) return ''; if (!C.usernameTaken(n)) return n; for (let i = 0; i < 30; i++) { const v = n.slice(0, 26) + '_' + (2 + Math.floor(Math.random() * 97)); if (!C.usernameTaken(v)) return v; } return ''; };

// Человек из Telegram опознан: есть аккаунт — входим; нет — создаём (после согласия с политикой и выбора username).
async function enter(t, b, meta) {
  let u = byTg(t.id);
  if (u) { const s2 = A.second(u, { code: b.totp }); if (s2) return s2; }      /* двухфакторную защиту Telegram не заменяет; код 2FA приходит в поле totp (code занят кодом входа) */
  else {
    need(db.flags.registration, 'Регистрация временно закрыта. Пляж переполнен.'); need(!A.setupNeeded(), 'Сервер ещё не настроен: первым регистрируется владелец, по username и коду установки.');
    if (b.agree !== true) return { need: 'agree', name: t.name, username: freeName(t.username), tg: t.username };
    A.limit('reg:' + meta.ip, 120, 3600e3);
    const username = str(b.username, 32).replace(/^@/, ''), name = str(b.name, 64) || t.name;
    need(C.USERNAME_RE.test(username), 'Username: латиница, цифры и _, от 3 до 32 символов, начинается с буквы'); need(!C.usernameTaken(username), 'Этот username уже занят. Выберите другой.');
    need(!byTg(t.id), 'Этот Telegram уже привязан к аккаунту');
    u = A.createUser({ username, name, ref: str(b.ref, 32) }); u.tg = { id: t.id, username: t.username, at: now() }; u.policy = { v: C.POLICY, ts: now() }; index = null; save();
  }
  if (t.username !== u.tg.username) { u.tg.username = t.username; save(); }
  const s = A.createSession(u, meta); const row = db.sessions[A.sid(s.token)]; if (row) row.via = 'tg';      // вход подтверждён Telegram — такой сеанс может сразу задать пароль
  return s;
}

Object.assign(A.api, {
  'tg/start'(b, meta) {
    need(ready() && bot.hook, 'Вход через Telegram сейчас недоступен'); A.limit('tgs:' + meta.ip, 30, 600e3);
    const code = tok(16); pend.set(code, { exp: now() + TTL, tg: null });
    return { code, bot: bot.username, url: `https://t.me/${bot.username}?start=login_${code}`, ttl: TTL };
  },
  async 'tg/poll'(b, meta) {
    A.limit('tgp:' + meta.ip, 600, 600e3);
    const p = pend.get(str(b.code, 40)); need(p && p.exp > now() && !p.uid, 'Время вышло. Нажмите «Войти через Telegram» ещё раз.');
    if (!p.tg) return { wait: true };
    const r = await enter(p.tg, b, meta); if (r.token) pend.delete(b.code); return r;
  },
  async 'tg/app'(b, meta) { need(ready(), 'Вход через Telegram сейчас недоступен'); A.limit('tga:' + meta.ip, 60, 600e3); return enter(checkInitData(b.initData), b, meta); },
  async 'tg/link'(b, meta) {
    A.limit('tgl:' + meta.ip, 60, 600e3);
    const k = str(b.token, 60), l = links.get(k); need(l && l.exp > now(), 'Ссылка устарела. Напишите боту /start — он пришлёт новую.');
    const r = await enter(l.tg, b, meta); if (r.token) links.delete(k); return r;
  },
});

// ───── привязать Telegram к уже существующему аккаунту (и отвязать)
H['me.tg.start'] = c => {
  need(ready() && bot.hook, 'Вход через Telegram сейчас недоступен'); A.limit('tgs:' + c.uid, 20, 600e3);
  const code = tok(16); pend.set(code, { exp: now() + TTL, tg: null, uid: c.uid });
  return { code, bot: bot.username, url: `https://t.me/${bot.username}?start=login_${code}` };
};
H['me.tg.poll'] = (c, p) => {
  const u = db.users[c.uid], q = pend.get(str(p.code, 40)); need(q && q.exp > now() && q.uid === c.uid, 'Время вышло. Начните привязку заново.');
  if (!q.tg) return { wait: true };
  const other = byTg(q.tg.id); need(!other || other.id === u.id, 'Этот Telegram уже привязан к другому аккаунту');
  u.tg = { id: q.tg.id, username: q.tg.username, at: now() }; index = null; delete u.nag; pend.delete(p.code); save(); R.selfUpdate(u);
  return { ok: true, tg: u.tg.username || true };
};
H['me.tg.bridge'] = c => {
  const u = db.users[c.uid]; need(u.tg, 'Сначала привяжите Telegram: «Вход через Telegram» на странице входа или в «Настройки → Аккаунт».');
  u.tgBridge = u.tgBridge === false;      // было выключено — включаем, было включено — выключаем
  save(); R.selfUpdate(u);
  return { ok: true, bridge: u.tgBridge !== false };
};
H['me.tg.drop'] = c => {
  const u = db.users[c.uid]; need(u.tg, 'Telegram не привязан'); need(u.username && u.pass, 'Сначала задайте пароль: без него и без Telegram в аккаунт будет не войти');
  delete u.tg; index = null; save(); R.selfUpdate(u); return { ok: true };
};

// ───── мост Telegram ↔ «Нудист»: личные сообщения в обе стороны (только для лички и только с привязанным Telegram)
// В Нудист: человек шлёт боту «@username текст» или «/write @username текст», либо отвечает на сообщение, которое бот сам переслал сюда.
// В Telegram: каждое личное сообщение в «Нудисте», отправленное тому, у кого привязан Telegram и включён мост, падает туда же. Текст только, без файлов.
const mirrored = new Map();      // "tgChatId:msgId" -> nudistChatId (только для ответа из Telegram)
const rememberMirrored = (chatId, msgId, nudistChatId) => { if (!msgId) return; mirrored.set(chatId + ':' + msgId, nudistChatId); if (mirrored.size > 400) mirrored.delete(mirrored.keys().next().value); };
const mediaLabel = m => ({ photo: '[фото]', video: '[видео]', voice: '[голосовое]', round: '[кружочек]', file: '[файл]', audio: '[аудио]', gif: '[GIF]' }[m.type] || '');
const PRICE = () => { const n = Number(process.env.MSG_LEAF_PRICE); return Number.isFinite(n) && n >= 1 && n <= 1000 ? Math.floor(n) : 25; };

function tgDeliver(fromTgChatId, who, chatIdOrUser, text) {
  const u = byTg(who.id);
  if (!u) { say(fromTgChatId, 'Сначала привяжите Telegram: «Нудист» → Настройки → Аккаунт → Telegram. Без привязки писать от вашего имени нельзя.'); return; }
  let ch = null;
  if (typeof chatIdOrUser === 'string' && chatIdOrUser.startsWith('@')) {
    const o = db.users[C.byName.get(chatIdOrUser.slice(1).toLowerCase())];
    if (!o) { say(fromTgChatId, 'Не нашёл пользователя ' + chatIdOrUser + ' в «Нудисте».'); return; }
    if (o.deleted) { say(fromTgChatId, 'Этот аккаунт удалён.'); return; }
    ch = C.openDm(u.id, o.id);
    const hasThread = (db.msgs[ch.id] || []).some(m => m.from === o.id);
    const ok = C.canMsgUser(o, u.id, hasThread);
    if (ok === 'deny') { say(fromTgChatId, '@' + (o.username || '') + ' не принимает сообщения от посторонних. Попросите его добавить вас в контакты или исключения приватности.'); return; }
    if (ok === 'paid') {
      const price = PRICE();
      if ((u.stars || 0) < price) { say(fromTgChatId, 'Это сообщение платное для посторонних (' + price + ' 🍃), у вас не хватает листиков.'); return; }
      u.stars -= price; o.stars = (o.stars || 0) + price; save();
    }
  } else { ch = db.chats[chatIdOrUser]; }
  if (!ch || !ch.members || !ch.members[u.id]) { say(fromTgChatId, 'Не получилось открыть чат: вы в нём не состоите.'); return; }
  C.postMessage(ch, u.id, { text, via: 'tg' });
  say(fromTgChatId, 'Отправлено ✅');
}

C.hooks.afterPost.push((chat, m) => {
  try {
    if (!chat || chat.type !== 'dm' || !m.from || m.type === 'service' || m.auto || m.enc || m.via === 'tg') return;
    const targetId = Object.keys(chat.members).find(id => id !== m.from);
    const t = targetId && db.users[targetId];
    if (!t || !t.tg || t.tgBridge === false || t.deleted) return;
    const sender = db.users[m.from];
    const who = sender ? (sender.username ? '@' + sender.username : (sender.name || 'Нудист')) : 'Нудист';
    const body = m.text ? String(m.text).slice(0, 3000) : (mediaLabel(m) || '[сообщение]');
    call('sendMessage', { chat_id: t.tg.id, text: '💬 Из Нудиста от ' + who + ':\n\n' + body })
      .then(r => rememberMirrored(t.tg.id, r && r.message_id, chat.id))
      .catch(e => console.warn('[tg] мост:', e.message));
  } catch (e) { console.warn('[tg] мост:', e.message); }
});

// ───── рассылка «вышло обновление» в Telegram: человеку, который привязал Telegram, бот пишет первым
// (в Telegram нельзя написать незнакомцу, поэтому получатели — только те, кто сам нажал Start).
// Правило тишины: в сутки не больше двух рассылок, одному человеку — не чаще раза в день, ночью (23:00–9:00 по Москве) не будим.
// Настоящий api.telegram.org по умолчанию не трогаем: только при TG_NEWS=on или другом адресе TG_API (зеркало в тестах).
const TG_API_REAL = /^https:\/\/api\.telegram\.org/i;
const ONE = v => v === 'i' || v === true || Number(v) === 1;
const dayMsk = t => new Date((t || now()) + 3 * 3600e3).toISOString().slice(0, 10);
// Утренняя доставка: ночью нажали «Разослать» — в 9:05 по Москве бот сам доделает то, что просили, и больше не повторит.
setInterval(() => {
  const due = db.meta.tgNewsDue; if (!due || isNight()) return;
  delete db.meta.tgNewsDue;
  newsAnnounce(require('./push').apkInfo(), { force: true, wall: due.wall, by: due.by })
    .then(r => console.log('[tg] утренняя доставка обновления:', r.sent, 'из', r.total || 0))
    .catch(e => console.warn('[tg] утренняя доставка:', e.message));
}, 60e3).unref();
const isNight = () => { const h = new Date(now() + 3 * 3600e3).getUTCHours(); return h >= 23 || h < 9; };
const appUrl = () => SITE + '/start';
function newsText(it, apk) {
  const head = '🍃 Вышло обновление «Нудиста» ' + apk.name + '!';
  const list = (apk.news || []).filter(Boolean).slice(0, 5).map(x => '· ' + String(x).slice(0, 300)).join('\n');
  const tail = it.wall ? 'Привяжите Telegram к аккаунту — «Нудист» → Настройки → Аккаунт → Telegram. Входить в аккаунт станет можно без пароля, а сообщения из «Нудиста» будут приходить сюда же.'
    : 'Скачать и поставить поверх старой версии: данные и вход сохранятся.';
  return [head, list, tail, appUrl()].filter(Boolean).join('\n\n');
}
async function newsSend(uid, text) {
  const u = db.users[uid];
  if (!u || u.deleted || u.bot || !u.tg || !u.tg.id) return 'нет telegram';
  try { await call('sendMessage', { chat_id: u.tg.id, text, link_preview_options: { is_disabled: true } }); return 'ok'; }
  catch (e) {
    const m = String((e && e.message) || '');
    if (/blocked|chat not found|deactivated|kicked/i.test(m)) { u.tg.bad = now(); save(); return 'заблокировал'; }
    return 'ошибка: ' + m.slice(0, 80);
  }
}
// Пуш нового обновления: сперва в Telegram (если есть ключ бота), дальше лента телефона и браузерные пуши — это делает push.js.
// it.force — прислать сейчас, не спрашивая про ночь; it.wall — это не обновление, а просьба привязать Telegram.
async function newsAnnounce(apk, it) {
  it = it || {};
  const t = token();
  if (!ON || !t) return { ok: false, sent: 0, error: 'не настроен бот: нет ключа' };
  const mirror = !TG_API_REAL.test(TG);
  if (!mirror && process.env.TG_NEWS !== 'on') return { ok: false, sent: 0, error: 'выключено: на сервере не задано TG_NEWS=on' };
  if (!it.force && isNight()) { if (it) db.meta.tgNewsDue = { wall: !!it.wall, by: it.by || '', at: now() }; save(); return { ok: true, sent: 0, skipped: 'ночная тишина 23:00–9:00 — отправится утром само' }; }
  let day = db.meta.tgNewsDay; if (!day || day.d !== dayMsk()) day = db.meta.tgNewsDay = { d: dayMsk(), n: 0 };
  // «Напомнить про Telegram» — не новость про сборку: у неё своя карта отметок и свой дневной лимит на человека.
  // Так напоминание не «съедает» слот обновления и наоборот: оба сообщения ограничены — одно в день на каждую тему.
  if (!it.wall && day.n >= 2 && !it.force) return { ok: false, sent: 0, error: 'сегодня уже было две рассылки' };
  const text = newsText(it, apk), sentMap = (it.wall ? (db.meta.tgWallSent = db.meta.tgWallSent || {}) : (db.meta.tgNewsSent = db.meta.tgNewsSent || {})), today = dayMsk();
  const targets = Object.values(db.users).filter(u => !u.deleted && !u.bot && u.tg && u.tg.id && !(sentMap[u.id] && dayMsk(sentMap[u.id].at) === today)).map(u => u.id);
  const out = { ok: true, sent: 0, failed: 0, total: targets.length, errors: [] };
  for (const id of targets) {
    const r = await newsSend(id, text);
    if (r === 'ok') { out.sent++; sentMap[id] = { at: now(), c: apk.code }; }
    else if (r !== 'нет telegram') { out.failed++; if (out.errors.length < 5) out.errors.push(id + ': ' + r); }
  }
  for (const k of Object.keys(sentMap)) if (now() - (sentMap[k].at || 0) > 40 * 86400e3) delete sentMap[k];      // файл не растёт
  if (out.sent) { if (!it.wall) day.n++; db.meta.tgNews = { at: now(), by: it.by || '', code: apk.code, name: apk.name, sent: out.sent, wall: !!it.wall }; }
  save();
  return out;
}

// ───── сообщения боту (вебхук Telegram)
const say = (chat, text, extra) => call('sendMessage', { chat_id: chat, text, ...extra }).catch(e => console.warn('[tg] ответ не ушёл:', e.message));
function hook(secret, upd) {
  const t = token(); if (!ON || !t) return 404;
  const a = Buffer.from(String(secret || '')), b = Buffer.from(secretOf(t)); if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return 403;
  const m = upd && upd.message; if (!m || !m.chat || m.chat.type !== 'private') return 200;
  const who = tgUser(m.from); if (!who) return 200;
  try { A.limit('tgm:' + who.id, 20, 60e3); } catch (e) { return 200; }
  const text = String(m.text || ''), arg = (/^\/start(?:@\w+)?\s+(\S+)/.exec(text) || [])[1] || '';
  const writeCmd = /^\/write(?:@\w+)?\s+@?([A-Za-z][A-Za-z0-9_]{2,31})\s+([\s\S]{1,4096})$/.exec(text) || /^@([A-Za-z][A-Za-z0-9_]{2,31})\s+([\s\S]{1,4096})$/.exec(text);
  if (writeCmd) { tgDeliver(m.chat.id, who, '@' + writeCmd[1], writeCmd[2].trim()); return 200; }
  const replyTo = m.reply_to_message && mirrored.get(m.chat.id + ':' + m.reply_to_message.message_id);
  if (replyTo && text.trim()) { tgDeliver(m.chat.id, who, replyTo, text.trim()); return 200; }
  if (arg.startsWith('login_')) {
    const p = pend.get(arg.slice(6));
    if (p && p.exp >= now()) console.log('[tg] бот узнал человека:', who.id, '@' + (who.username || '—'), p.uid ? '(привязка к аккаунту)' : '(вход)');
    if (!p || p.exp < now()) say(m.chat.id, 'Эта ссылка для входа уже устарела. Вернитесь на сайт и нажмите «Войти через Telegram» ещё раз.');
    else { p.tg = who; say(m.chat.id, p.uid ? '✅ Готово: Telegram привязан. Вернитесь в «Нудист».' : '✅ Готово! Вернитесь на сайт — вход выполнится сам.'); }
    return 200;
  }
  const one = tok(18); links.set(one, { exp: now() + TTL, tg: who });
  const known = byTg(who.id), rows = [];
  if (/^https:\/\//.test(SITE)) rows.push([{ text: '🍃 Открыть «Нудист»', web_app: { url: SITE + '/' } }], [{ text: '🌐 Открыть в браузере', url: SITE + '/#tgl=' + one }]);
  say(m.chat.id, (known ? `С возвращением, ${who.name}! ` : `Привет, ${who.name}! «Нудист» — мессенджер, которому нечего скрывать: чаты, группы, лента, игры с друзьями. `)
    + 'Жмите кнопку — ' + (known ? 'и вы в своём аккаунте.' : 'аккаунт создастся за пару секунд, пароль придумывать не нужно.') + '\n\nКнопка «в браузере» работает 10 минут и один раз.\n\nНаписать в «Нудист» отсюда: @username текст (или ответьте на пересланное сообщение).', { reply_markup: { inline_keyboard: rows } });
  return 200;
}

module.exports = { hook, botName, ready, setup, checkInitData, newsAnnounce, newsText, dayMsk };
