// Наборы стикеров из Telegram. Человек вставляет ссылку вида https://t.me/addstickers/Имя, сервер через Bot API
// (getStickerSet → getFile) забирает файлы к себе, и набор появляется в выборе стикеров. Нужен ключ любого бота от @BotFather:
// переменная TG_BOT_TOKEN или ключ, который владелец один раз вставляет прямо в окне импорта (хранится в базе, наружу не отдаётся).
// Форматы: обычные (.webp), видео (.webm) и анимированные (.tgs — сжатый Lottie, проигрывается в браузере).
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const C = require('./core'), R = require('./rpc'), Cloud = require('./cloud'), A = require('./auth');
const { db, save, now, need, str, fail } = C, H = R.H;
db.packs = db.packs || {};      // id → { id, tg, title, by, ts, items: [{ id, e, url, thumb, kind }] }

const TG = (process.env.TG_API || 'https://api.telegram.org').replace(/\/+$/, '');
const MAX_ITEMS = 120, MAX_FILE = 700 * 1024, MAX_MINE = 30, RETRY_MS = Number(process.env.TG_RETRY_MS) || 1200;
const botToken = () => process.env.TG_BOT_TOKEN || (db.meta && db.meta.tgBot) || '';
const isAdmin = u => C.isOwner(u) || ['admin', 'superadmin'].includes((u || {}).admin);

async function tg(token, method, params) {
  let r; try { r = await fetch(`${TG}/bot${token}/${method}?` + new URLSearchParams(params || {}), { signal: AbortSignal.timeout(20000) }); } catch (e) { fail('Telegram не отвечает. Попробуйте чуть позже.'); }
  const j = await r.json().catch(() => null);
  if (!j || !j.ok) { const d = (j && j.description) || ''; fail(/STICKERSET_INVALID|invalid sticker set/i.test(d) ? 'Такого набора в Telegram нет. Проверьте ссылку.' : r.status === 401 || r.status === 404 ? 'Ключ бота Telegram не подходит. Владельцу нужно вставить новый.' : r.status === 429 ? 'Telegram просит подождать. Попробуйте через минуту.' : 'Telegram ответил ошибкой: ' + (d || r.status)); }
  return j.result;
}
// Скачивает файл Telegram в папку загрузок и возвращает адрес /u/…; null — файл слишком большой или не скачался
async function grab(token, fileId, ext) {
  const f = await tg(token, 'getFile', { file_id: fileId });
  if (!f.file_path || !/^[\w./-]+$/.test(f.file_path) || f.file_path.includes('..') || (f.file_size || 0) > MAX_FILE) return null;
  const r = await fetch(`${TG}/file/bot${token}/${f.file_path}`, { signal: AbortSignal.timeout(30000) }); if (!r.ok) throw new Error('файл не отдан: ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer()); if (!buf.length || buf.length > MAX_FILE) return null;
  if (!Cloud.hasRoom(buf.length)) fail('Хранилище файлов заполнено');
  const real = ext || (/\.(webp|png|jpe?g)$/i.exec(f.file_path) || [0, 'webp'])[1].toLowerCase().replace('jpeg', 'jpg');
  const name = C.id() + crypto.randomBytes(4).toString('hex') + '.' + real, file = path.join(C.UPLOADS, name);
  await fs.promises.writeFile(file, buf);
  try { await Cloud.putUpload(name, file); } catch (e) { fs.unlink(file, () => {}); throw e; }
  return '/u/' + name;
}
async function pool(list, n, fn) { let i = 0; const out = new Array(list.length); await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => { while (i < list.length) { const k = i++; out[k] = await fn(list[k], k); } })); return out; }

const nameOf = raw => { const s = String(raw || '').trim(), m = /(?:t\.me|telegram\.me|telegram\.dog)\/add(?:stickers|emoji)\/([A-Za-z0-9_]+)/i.exec(s) || /[?&]set=([A-Za-z0-9_]+)/i.exec(s) || /^@?([A-Za-z][A-Za-z0-9_]{0,63})$/.exec(s); return m ? m[1] : ''; };
const view = p => ({ id: p.id, tg: p.tg, title: p.title, by: p.by, n: p.items.length, items: p.items });
// У набора есть хозяин — тот, кто принёс его из Telegram. Остальные берут набор с его разрешения: один раз спросили — дальше набор их.
// Хозяин может открыть набор для всех (open). Если хозяина больше нет (аккаунт удалён) или это служебный аккаунт-бот, спрашивать некого — набор свободный.
const ownerOf = p => { const o = db.users[p.by]; return o && !o.deleted && !o.bot ? o : null; };
const free = (p, u) => p.by === u.id || !!p.open || (p.ok || []).includes(u.id) || !ownerOf(p);
const stateOf = (p, u) => mine(u).includes(p.id) ? 'mine' : free(p, u) ? 'free' : (p.asks || {})[u.id] ? 'asked' : 'ask';
const brief = p => ({ id: p.id, title: p.title, n: p.items.length, icon: (p.items.map(s => s.thumb || (!s.kind && s.url) || '').filter(Boolean))[0] || '', e: (p.items[0] || {}).e });
const tell = (uid, ev, d) => { for (const o of C.conns.get(uid) || []) o.send(ev, d); };
const sysBot = () => db.users[db.meta.sys];
const nameOfUser = u => R.uname ? R.uname(u) : (u.name || 'Кто-то');
const mine = u => (u.packs || []).filter(id => db.packs[id]);
const byTg = name => { const l = name.toLowerCase(); for (const k in db.packs) if (db.packs[k].tg.toLowerCase() === l) return db.packs[k]; return null; };
function attach(u, p) { const l = mine(u).filter(x => x !== p.id); need(l.length < MAX_MINE, `Больше ${MAX_MINE} наборов не помещается. Уберите лишний.`); u.packs = [p.id, ...l]; pop.t = 0; save(); }

let pop = { t: 0, n: {} };      // сколько человек держит каждый набор; пересчитывается не чаще раза в 30 секунд и после каждого изменения
const busy = new Map();      // имя набора → обещание: два человека, вставившие одну ссылку, не качают набор дважды
async function load(name, uid) {
  const token = botToken(); need(token, 'Импорт из Telegram ещё не настроен: владельцу нужно один раз вставить ключ бота.');
  const set = await tg(token, 'getStickerSet', { name });
  const src = (set.stickers || []).slice(0, MAX_ITEMS); need(src.length, 'В этом наборе нет стикеров');
  // Сеть и Telegram иногда сбоят на отдельном файле. Без повтора стикер молча пропадал бы из набора навсегда, поэтому три попытки с паузой.
  const again = async (what, fn) => { for (let n = 1; ; n++) { try { return await fn(); } catch (e) { if (/заполнено/.test(e.message)) throw e; if (n >= 3) { console.warn(`[packs] ${name}: ${what} не скачался: ${e.message}`); return null; } await new Promise(r => setTimeout(r, RETRY_MS * n)); } } };
  const items = (await pool(src, 4, async (s, k) => {
    const kind = s.is_animated ? 'l' : s.is_video ? 'v' : undefined;
    const url = await again('стикер ' + (k + 1), () => grab(token, s.file_id, kind === 'l' ? 'tgs' : kind === 'v' ? 'webm' : null)); if (!url) return null;
    const thumb = kind && s.thumbnail ? await again('картинка стикера ' + (k + 1), () => grab(token, s.thumbnail.file_id, null)) : null;
    return { id: str(s.file_unique_id, 32) || C.id(), e: str(s.emoji, 16) || '🙂', url, thumb: thumb || undefined, kind };
  })).filter(Boolean);
  if (items.length < src.length) console.warn(`[packs] ${name}: в набор попало ${items.length} из ${src.length}`);
  if (!items.length) fail('Не удалось скачать ни одного стикера из набора');
  const old = byTg(set.name || name); if (old) { C.releaseFiles(items); return old; }
  const p = { id: 'tg_' + C.id(), tg: str(set.name || name, 64), title: str(set.title, 64) || name, by: uid, ts: now(), items };
  db.packs[p.id] = p; save(); return p;
}

H['pack.status'] = c => ({ ready: !!botToken(), owner: C.isOwner(db.users[c.uid]), max: MAX_MINE });
H['pack.token'] = async (c, p) => {
  need(C.isOwner(db.users[c.uid]), 'Ключ бота может задать только владелец');
  const t = String(p.token || '').trim(); need(/^\d{5,15}:[\w-]{30,60}$/.test(t), 'Это не похоже на ключ бота. Он выглядит так: 123456789:AAH… (выдаёт @BotFather).');
  const me = await tg(t, 'getMe'); db.meta.tgBot = t; save(); return { ok: true, bot: me.username };
};
// Наборы, которые кто-то уже принёс: их можно взять в одно касание, ничего не зная про Telegram. Сверху — самые ходовые.
const holders = () => { if (now() - pop.t > 30000) { const n = {}; for (const u of Object.values(db.users)) for (const id of u.packs || []) n[id] = (n[id] || 0) + 1; pop = { t: now(), n }; } return pop.n; };
H['pack.popular'] = c => {
  const my = new Set(mine(db.users[c.uid])), n = holders();
  return { packs: Object.values(db.packs).map(p => ({ id: p.id, tg: p.tg, title: p.title, n: p.items.length, users: n[p.id] || 0, mine: my.has(p.id), state: stateOf(p, db.users[c.uid]), owner: ownerOf(p) && p.by !== c.uid ? nameOfUser(ownerOf(p)) : '', e: (p.items[0] || {}).e, icons: p.items.map(s => s.thumb || (!s.kind && s.url) || '').filter(Boolean).slice(0, 4) })).sort((a, b) => b.users - a.users || b.n - a.n).slice(0, 40) };
};
H['pack.list'] = c => ({ packs: mine(db.users[c.uid]).map(id => view(db.packs[id])) });
H['pack.get'] = (c, p) => { const u = db.users[c.uid], k = db.packs[str(p.id, 40)]; need(k, 'Набор не найден'); const o = ownerOf(k); return { pack: view(k), mine: mine(u).includes(k.id), state: stateOf(k, u), open: !!k.open, owner: o ? { id: o.id, name: nameOfUser(o) } : null, asks: k.by === u.id ? Object.keys(k.asks || {}).filter(id => db.users[id] && !db.users[id].deleted).map(id => ({ user: C.pubUser(db.users[id]), ts: k.asks[id] })) : undefined }; };
// pack.add убран: набор добавляет pack.ask (если набор открыт или хозяин уже разрешил — сразу, иначе спрашивает хозяина).
// Попросить набор у хозяина. Хозяину приходит сообщение от служебного бота с кнопками «Разрешить» и «Отказать»; запрос виден и в окне «Добавить стикеры».
function ask(u, k) {
  if (free(k, u)) { attach(u, k); return { pack: view(k) }; }
  const o = ownerOf(k); k.asks = k.asks || {};
  if (k.asks[u.id]) return { asked: true, owner: nameOfUser(o), title: k.title };
  need(!(k.no || {})[u.id] || now() - k.no[u.id] > 864e5, 'Хозяин набора уже отказал. Спросить ещё раз можно через сутки.');
  need(mine(u).length < MAX_MINE, `Больше ${MAX_MINE} наборов не помещается. Уберите лишний.`);
  A.limit('packask:' + u.id, 10, 3600e3);
  k.asks[u.id] = now(); if (k.no) delete k.no[u.id]; save();
  tell(o.id, 'pack.ask', { pack: brief(k), user: C.pubUser(u) });
  const bot = sysBot(); if (bot) try { const m = C.postMessage(C.openDm(bot.id, o.id), bot.id, { text: `🧩 **${nameOfUser(u)}**${u.username ? ' (@' + u.username + ')' : ''} просит ваш набор стикеров **«${k.title}»**.\nРазрешите — и набор появится у него в стикерах. Чтобы больше не спрашивали, откройте набор и включите «Разрешать всем».`, btn: [[{ t: '✅ Разрешить', d: `pk:ok:${k.id}:${u.id}` }, { t: 'Отказать', d: `pk:no:${k.id}:${u.id}` }]] }, { quiet: true }); k.askMsg = k.askMsg || {}; if (m) k.askMsg[u.id] = m.id; } catch (e) { console.error('[packs] запрос', e.message); }
  return { asked: true, owner: nameOfUser(o), title: k.title };
}
// Ответ хозяина: из окна стикеров (pack.answer) или кнопкой под сообщением бота
function answer(owner, k, uid, ok) {
  need(k.by === owner.id, 'Отвечать на запрос может только хозяин набора'); need((k.asks || {})[uid], 'Этот запрос уже закрыт');
  const u = db.users[uid]; delete k.asks[uid];
  if (ok && u && !u.deleted) { k.ok = [...new Set([...(k.ok || []), uid])].slice(-5000); try { attach(u, k); tell(uid, 'pack', { pack: view(k) }); } catch (e) { tell(uid, 'pack.fail', { name: k.tg, error: `Набор «${k.title}» вам разрешили, но он не поместился: ${e.message}` }); } }
  else if (u) { k.no = k.no || {}; k.no[uid] = now(); tell(uid, 'pack.fail', { name: k.tg, error: `Хозяин набора «${k.title}» не разрешил его добавить.` }); }
  // под сообщением бота убираем кнопки и дописываем итог
  const bot = sysBot(), mid = (k.askMsg || {})[uid]; if (k.askMsg) delete k.askMsg[uid];
  if (bot && mid) try { const ch = C.openDm(bot.id, owner.id), m = C.findMsg(ch.id, mid); if (m && m.btn) { delete m.btn; m.text += ok ? '\n\n✅ Вы разрешили.' : '\n\n🚫 Вы отказали.'; C.updateMsg(ch, m); } } catch (e) { /* сообщение могли удалить */ }
  save(); tell(owner.id, 'pack.asks', {});
  return { ok: true };
}
H['pack.ask'] = (c, p) => { const k = db.packs[str(p.id, 40)]; need(k, 'Набор не найден'); return ask(db.users[c.uid], k); };
H['pack.answer'] = (c, p) => { const k = db.packs[str(p.id, 40)]; need(k, 'Набор не найден'); return answer(db.users[c.uid], k, str(p.user, 40), !!p.ok); };
H['pack.asks'] = c => { const out = []; for (const k of Object.values(db.packs)) if (k.by === c.uid) for (const id of Object.keys(k.asks || {})) if (db.users[id] && !db.users[id].deleted) out.push({ pack: brief(k), user: C.pubUser(db.users[id]), ts: k.asks[id] }); return { asks: out.sort((a, b) => b.ts - a.ts).slice(0, 100) }; };
H['pack.open'] = (c, p) => { const k = db.packs[str(p.id, 40)]; need(k, 'Набор не найден'); need(k.by === c.uid, 'Это может только хозяин набора'); k.open = !!p.on || undefined; if (k.open) for (const id of Object.keys(k.asks || {})) try { answer(db.users[c.uid], k, id, true); } catch (e) { /* закрыт */ } save(); return { open: !!k.open }; };
// Кнопки под сообщением бота (msg.cb → pk:ok|no:<набор>:<кто просит>)
function button(c, data) { const [, act, pid, uid] = data.split(':'), k = db.packs[pid]; need(k, 'Набора уже нет'); answer(db.users[c.uid], k, uid, act === 'ok'); return { toast: act === 'ok' ? 'Разрешили. Набор уже у человека.' : 'Отказали.' }; }
R.hook.packOk = (u, id) => !db.packs[id] || mine(u).includes(id);
H['pack.remove'] = (c, p) => { const u = db.users[c.uid]; u.packs = mine(u).filter(x => x !== p.id); pop.t = 0; save(); return { ok: true }; };
// Удалить набор у всех: тот, кто его принёс, или администратор
H['pack.drop'] = (c, p) => { const u = db.users[c.uid], k = db.packs[str(p.id, 40)]; need(k, 'Набор не найден'); need(k.by === u.id || isAdmin(u), 'Удалить набор может тот, кто его добавил, или администратор'); delete db.packs[k.id]; save(); C.releaseFiles(k); return { ok: true }; };
// Импорт идёт в фоне (большой набор качается десятки секунд): ответ приходит сразу, итог — событием pack или pack.fail
H['pack.import'] = (c, p) => {
  const u = db.users[c.uid], name = nameOf(p.link); need(name, 'Вставьте ссылку на набор: https://t.me/addstickers/…');
  const have = byTg(name); if (have) return ask(u, have);      // набор уже на сервере: свой или свободный добавится сразу, чужой — через запрос хозяину
  need(botToken(), C.isOwner(u) ? 'Сначала вставьте ключ бота Telegram' : 'Импорт из Telegram ещё не настроен. Напишите владельцу: ему нужно один раз вставить ключ бота.');
  need(mine(u).length < MAX_MINE, `Больше ${MAX_MINE} наборов не помещается. Уберите лишний.`);
  if (!isAdmin(u)) A.limit('pack:' + u.id, 6, 3600e3);
  need(busy.size < 3 || busy.has(name.toLowerCase()), 'Сейчас загружаются другие наборы. Попробуйте через минуту.');
  const key = name.toLowerCase(); let job = busy.get(key);
  if (!job) { job = load(name, u.id); busy.set(key, job); job.catch(() => {}).then(() => busy.delete(key)); }
  const tell = (ev, d) => { for (const o of C.conns.get(u.id) || []) o.send(ev, d); };
  job.then(k => { try { attach(u, k); tell('pack', { pack: view(k) }); } catch (e) { tell('pack.fail', { name, error: e.message }); } }, e => { if (!(e instanceof C.PubError)) console.error('[packs]', e); tell('pack.fail', { name, error: e instanceof C.PubError ? e.message : 'Не получилось забрать набор. Попробуйте ещё раз.' }); });
  return { pending: true, name };
};
// Аккаунт удалён — его список наборов не нужен; сами наборы общие и остаются
module.exports = { nameOf, button };
