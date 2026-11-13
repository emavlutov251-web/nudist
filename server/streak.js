// «Нудист»: огонёк (серия переписки) — разовое зажигание во всех уже существующих чатах и вечернее напоминание.
// Сам подсчёт живёт в core.js (touchStreak, streakOf): его вызывает каждое новое сообщение.
'use strict';
const C = require('./core');
const { db, save, now } = C;

const SEED = '2026-11-13';      // метка разовой работы: меняем — работа выполнится ещё раз
const human = uid => { const u = db.users[uid]; return !!u && !u.deleted && !u.bot && !C.isRobot(uid); };
const mskDay = ts => C.today(ts + 3 * 3600e3);

// Сколько дней подряд условие огонька уже выполнялось по сохранённой переписке (считаем назад от сегодня или от вчера).
function fromHistory(chat) {
  const days = new Map();      // день → кто писал
  for (const m of db.msgs[chat.id] || []) {
    if (m.type === 'service' || !m.from || !human(m.from) || !chat.members[m.from]) continue;
    const d = mskDay(m.ts); let s = days.get(d); if (!s) days.set(d, s = new Set()); s.add(m.from);
  }
  const need = chat.type === 'group' ? 2 : Object.keys(chat.members).length;
  const ok = d => (days.get(d) || { size: 0 }).size >= need;
  let n = 0, shift = ok(C.dayMsk()) ? 0 : -1; const hot = shift === 0;
  while (ok(C.dayMsk(shift))) { n++; shift--; }
  return { n, hot, today: days.get(C.dayMsk()) || new Set() };
}
// Разово: огонёк появляется сразу во всех существующих личных, секретных чатах и группах. Где серия по переписке уже идёт —
// ставим её настоящую длину, в остальных — первый день. Дальше всё по-честному: не написали до конца завтрашнего дня — сгорит.
function seedAll() {
  if (db.meta.streakSeed === SEED) return 0;
  let n = 0; const d = C.dayMsk();
  for (const chat of Object.values(db.chats)) {
    if (!C.streakable(chat)) continue;
    const ids = Object.keys(chat.members).filter(human);
    if (chat.type === 'group' ? ids.length < 2 : (ids.length !== 2 || Object.keys(chat.members).length !== 2)) continue;      // «Избранное», чаты с ботами и удалёнными
    const h = fromHistory(chat), old = chat.sk && C.streakOf(chat) ? chat.sk.n : 0, by = {};
    for (const u of h.today) by[u] = d;
    const len = Math.max(old, h.n, 1);
    chat.sk = { n: len, last: d, by, best: Math.max((chat.sk || {}).best || 0, len) };
    n++;
  }
  db.meta.streakSeed = SEED; save();
  if (n) console.log(`[streak] огонёк зажжён в существующих чатах: ${n}`);
  return n;
}

// Вечернее напоминание: раз в день после 18:00 по Москве тем, у кого огонёк сегодня ещё не продлён и кто сам сегодня в этом чате не писал.
// Одно уведомление на человека, сколько бы огоньков ни гасло. Только личные и секретные чаты; чаты с выключенным звуком пропускаем.
const HOUR = /^\d{1,2}$/.test(process.env.STREAK_REMIND_HOUR || '') ? Math.min(23, Number(process.env.STREAK_REMIND_HOUR)) : 19;      // час по Москве
const plural = (n, f) => f[n % 10 === 1 && n % 100 !== 11 ? 0 : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 1 : 2];
function remind(force) {
  const d = C.dayMsk(); if (!force && (db.meta.streakRemind === d || new Date(now() + 3 * 3600e3).getUTCHours() < HOUR)) return 0;
  db.meta.streakRemind = d;
  const per = new Map();      // человек → [{ name, n }]
  for (const chat of Object.values(db.chats)) {
    if (chat.type !== 'dm' && chat.type !== 'secret') continue;
    const k = C.streakOf(chat); if (!k || k.hot) continue;
    const ids = Object.keys(chat.members); if (ids.length !== 2) continue;
    for (const uid of ids) {
      const peer = ids.find(x => x !== uid), u = db.users[uid], p = db.users[peer];
      if (!human(uid) || !human(peer) || (chat.sk.by || {})[uid] === d) continue;      // сам уже написал — ждём собеседника, его и зовём
      if ((u.settings || {}).notifDm === false || C.st(chat, uid).mute > now() || (u.blocked || []).includes(peer) || (p.blocked || []).includes(uid)) continue;
      if (!per.has(uid)) per.set(uid, []); per.get(uid).push({ name: p.name || 'собеседником', n: k.n, chat: chat.id });
    }
  }
  const Push = require('./push'); let sent = 0;
  for (const [uid, list] of per) {
    list.sort((a, b) => b.n - a.n);
    const a = list[0], body = list.length === 1
      ? `Серия с ${a.name} — ${a.n} ${plural(a.n, ['день', 'дня', 'дней'])}. Напишите до полуночи по Москве, чтобы огонёк не погас`
      : `Гаснет ${list.length} ${plural(list.length, ['огонёк', 'огонька', 'огоньков'])}: ${list.slice(0, 3).map(x => x.name).join(', ')}${list.length > 3 ? ' и другие' : ''}. Напишите до полуночи по Москве`;
    try { Push.notify(uid, { title: '🔥 Огонёк гаснет', body: body.slice(0, 180), tag: list.length === 1 ? a.chat : 'streak', url: '/' }, C.isOnline(uid)); sent++; } catch (e) { console.error('[streak]', e.message); }
  }
  save(); if (sent) console.log(`[streak] напомнили про огонёк: ${sent}`);
  return sent;
}
module.exports = { seedAll, remind, fromHistory };
