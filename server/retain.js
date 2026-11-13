'use strict';
// Напоминания «без спама»: человеку, которого давно нет, — не больше одного уведомления каждого вида в сутки.
//   story()  — «N выложил(а) историю»: только тем, с кем у автора есть личный чат, кого нет в сети больше часа.
//   digest() — раз в день тем, кто не заходил больше 12 часов и у кого есть непрочитанное: одной строкой, без перечисления.
// Тем, кто в сети или был недавно, ничего не шлём: они и так всё видят. Выключатели — те же, что в «Настройки → Уведомления».
//   DIGEST_HOUR=13   — час по Москве, после которого рассылается сводка (off — не рассылать)
const C = require('./core');
const Push = require('./push');
const { db, now, save } = C;
const HOUR = process.env.DIGEST_HOUR === 'off' ? -1 : /^\d{1,2}$/.test(process.env.DIGEST_HOUR || '') ? Math.min(23, Number(process.env.DIGEST_HOUR)) : 13;
const AWAY_STORY = 3600e3, AWAY_DIGEST = 12 * 3600e3, DAY = 864e5;
const plural = (n, a, b, c) => { const k = n % 100, d = n % 10; return k > 10 && k < 20 ? c : d === 1 ? a : d > 1 && d < 5 ? b : c; };
const human = u => u && !u.deleted && !u.bot;
const away = (u, ms) => !C.isOnline(u.id) && now() - (u.seen || 0) > ms;

function story(s, author, visible) {
  if (!human(author) || C.isRobot(author.id)) return 0;      // истории редакции приходят пачками — о них не уведомляем
  let n = 0;
  for (const cid of author.chats || []) {
    const ch = db.chats[cid]; if (!ch || ch.type !== 'dm') continue;
    const uid = Object.keys(ch.members).find(x => x !== author.id), u = db.users[uid];
    if (!human(u) || !away(u, AWAY_STORY) || !visible(u)) continue;
    if ((u.blocked || []).includes(author.id) || C.st(ch, uid).mute > now() || (u.settings || {}).notifDm === false) continue;
    if (!(db.msgs[cid] || []).some(m => m.from === uid)) continue;      // только те, кто сам писал автору: не чужие люди
    if (now() - (u.storyPush || 0) < DAY) continue;
    u.storyPush = now(); n++;
    Push.notify(uid, { title: author.name || 'Новая история', body: 'Новая история — исчезнет через сутки', tag: 'story', url: '/' });
  }
  if (n) save();
  return n;
}

function digest(force) {
  const day = C.dayMsk(); if (!force && (HOUR < 0 || db.meta.digestDay === day || new Date(now() + 3 * 3600e3).getUTCHours() < HOUR)) return 0;
  db.meta.digestDay = day; let n = 0;
  for (const u of Object.values(db.users)) {
    if (!human(u) || C.isRobot(u.id) || !away(u, AWAY_DIGEST) || now() - (u.seen || 0) > 30 * DAY) continue;      // пропавшим больше месяца не напоминаем
    const set = u.settings || {}; let msgs = 0, chats = 0;
    for (const ch of C.userChats(u)) {
      if (ch.server || ch.type === 'channel' || ch.type === 'saved' || C.st(ch, u.id).mute > now() || C.st(ch, u.id).archived) continue;
      if (ch.type === 'group' ? set.notifGroup === false : set.notifDm === false) continue;
      if (ch.type === 'dm' && Object.keys(ch.members).some(x => (db.users[x] || {}).bot)) continue;      // приветствия ботов — не повод звать
      const k = C.unreadCount(ch, u.id); if (k > 0) { msgs += k; chats++; }
    }
    if (!msgs) continue;
    n++; Push.notify(u.id, { title: 'Пока вас не было', body: `${msgs} ${plural(msgs, 'непрочитанное сообщение', 'непрочитанных сообщения', 'непрочитанных сообщений')} в ${chats} ${plural(chats, 'чате', 'чатах', 'чатах')}`, tag: 'digest', url: '/' });
  }
  save(); if (n) console.log('[retain] сводка отправлена: ' + n);
  return n;
}
module.exports = { story, digest };
