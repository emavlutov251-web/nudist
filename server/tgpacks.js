// Наборы стикеров из Telegram. Человек вставляет ссылку вида https://t.me/addstickers/Имя, сервер через Bot API
// (getStickerSet → getFile) забирает файлы к себе, и набор появляется в выборе стикеров. Нужен ключ любого бота от @BotFather:
// переменная TG_BOT_TOKEN или ключ, который владелец один раз вставляет прямо в окне импорта (хранится в базе, наружу не отдаётся).
// Форматы: обычные (.webp), видео (.webm) и анимированные (.tgs — сжатый Lottie, проигрывается в браузере).
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const C = require('./core'), R = require('./rpc'), Cloud = require('./cloud'), A = require('./auth');
const { db, save, now, need, str, fail } = C, H = R.H;
db.packs = db.packs || {};      // id → { id, tg, title, by, ts, items: [{ id, e, url, thumb, kind }] }

const TG = (process.env.TG_API || 'https://api.telegram.org').replace(/\/+$/, '');
const MAX_ITEMS = 120, MAX_FILE = 700 * 1024, MAX_MINE = 30;
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
  const r = await fetch(`${TG}/file/bot${token}/${f.file_path}`, { signal: AbortSignal.timeout(30000) }); if (!r.ok) return null;
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
const mine = u => (u.packs || []).filter(id => db.packs[id]);
const byTg = name => { const l = name.toLowerCase(); for (const k in db.packs) if (db.packs[k].tg.toLowerCase() === l) return db.packs[k]; return null; };
function attach(u, p) { const l = mine(u).filter(x => x !== p.id); need(l.length < MAX_MINE, `Больше ${MAX_MINE} наборов не помещается. Уберите лишний.`); u.packs = [p.id, ...l]; save(); }

const busy = new Map();      // имя набора → обещание: два человека, вставившие одну ссылку, не качают набор дважды
async function load(name, uid) {
  const token = botToken(); need(token, 'Импорт из Telegram ещё не настроен: владельцу нужно один раз вставить ключ бота.');
  const set = await tg(token, 'getStickerSet', { name });
  const src = (set.stickers || []).slice(0, MAX_ITEMS); need(src.length, 'В этом наборе нет стикеров');
  const items = (await pool(src, 5, async s => {
    try {
      const kind = s.is_animated ? 'l' : s.is_video ? 'v' : undefined;
      const url = await grab(token, s.file_id, kind === 'l' ? 'tgs' : kind === 'v' ? 'webm' : null); if (!url) return null;
      const thumb = kind && s.thumbnail ? await grab(token, s.thumbnail.file_id, null).catch(() => null) : null;
      return { id: str(s.file_unique_id, 32) || C.id(), e: str(s.emoji, 16) || '🙂', url, thumb: thumb || undefined, kind };
    } catch (e) { if (/заполнено/.test(e.message)) throw e; return null; }
  })).filter(Boolean);
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
H['pack.list'] = c => ({ packs: mine(db.users[c.uid]).map(id => view(db.packs[id])) });
H['pack.get'] = (c, p) => { const k = db.packs[str(p.id, 40)]; need(k, 'Набор не найден'); return { pack: view(k), mine: mine(db.users[c.uid]).includes(k.id) }; };
H['pack.add'] = (c, p) => { const k = db.packs[str(p.id, 40)]; need(k, 'Набор не найден'); attach(db.users[c.uid], k); return { pack: view(k) }; };
H['pack.remove'] = (c, p) => { const u = db.users[c.uid]; u.packs = mine(u).filter(x => x !== p.id); save(); return { ok: true }; };
// Удалить набор у всех: тот, кто его принёс, или администратор
H['pack.drop'] = (c, p) => { const u = db.users[c.uid], k = db.packs[str(p.id, 40)]; need(k, 'Набор не найден'); need(k.by === u.id || isAdmin(u), 'Удалить набор может тот, кто его добавил, или администратор'); delete db.packs[k.id]; save(); C.releaseFiles(k); return { ok: true }; };
// Импорт идёт в фоне (большой набор качается десятки секунд): ответ приходит сразу, итог — событием pack или pack.fail
H['pack.import'] = (c, p) => {
  const u = db.users[c.uid], name = nameOf(p.link); need(name, 'Вставьте ссылку на набор: https://t.me/addstickers/…');
  const have = byTg(name); if (have) { attach(u, have); return { pack: view(have) }; }
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
module.exports = { nameOf };
