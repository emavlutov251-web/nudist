// Тишина и безопасность: режим инкогнито, стирание личной переписки без следа, «побыть рядом».
const C = require('./core');
const R = require('./rpc');
const A = require('./auth');
const Push = require('./push');
const { db, save, now, need, str } = C;
const H = R.H;

// ───── инкогнито. Один переключатель: не видно «в сети» и времени захода, не уходят отметки «прочитано» и «печатает…»,
// просмотры историй не записываются, в поиске человек находится только по точному @username. Сами проверки — в core.js и rpc.js по флагу u.incog.
H['me.incog'] = (c, p) => {
  const u = db.users[c.uid]; if (p.on) u.incog = true; else delete u.incog;
  save(); R.selfUpdate(u); C.broadcastUser(u);
  return { on: !!u.incog };
};

// ───── стереть переписку без следа. Личный или секретный чат исчезает у обоих целиком: сообщения, файлы, закрепы, черновики,
// очередь уведомлений. Служебной записи «чат удалён» не остаётся. Жалобы, уже отправленные модераторам, не трогаем:
// иначе обидчик мог бы стереть доказательства раньше, чем их увидят.
H['chat.wipe'] = (c, p) => {
  const ch = R.getChat(c, p.id); need(ch.type === 'dm' || ch.type === 'secret', 'Стереть без следа можно личную переписку. В группе историю чистит владелец.');
  A.limit('wipe:' + c.uid, 30, 3600e3);
  const ids = Object.keys(ch.members), n = (db.msgs[ch.id] || []).length;
  Push.forget(ids, ch.id);
  C.destroyChat(ch);
  for (const id of ids) { const u = db.users[id]; if (u && Array.isArray(u.near)) u.near = u.near.filter(x => !ids.includes(x.u)); }      /* вместе с перепиской уходит и «был рядом»; массив, а не координаты */
  save();
  return { ok: true, n };
};

// ───── «просто побыть рядом». Без слов и советов: человеку приходит тихая отметка, что он не один.
const NEAR_GAP = (Number(process.env.NEAR_GAP_MIN) || 30) * 60e3;
H['near.send'] = (c, p) => {
  const u = db.users[c.uid], o = db.users[typeof p.to === 'string' ? p.to : '']; need(o && !o.deleted && !o.bot && o.id !== u.id, 'Побыть рядом можно с другим человеком');
  need(!(o.blocked || []).includes(u.id) && !(u.blocked || []).includes(o.id), 'Этот человек сейчас недоступен');
  C.needVoice(u);
  const last = (Array.isArray(o.near) ? o.near : []).find(x => x.u === u.id);
  need(!last || now() - last.ts >= NEAR_GAP, 'Вы уже рядом. Этого достаточно — человек знает.');
  A.limit('near:' + u.id, 20, 3600e3);
  o.near = [{ u: u.id, ts: now() }].concat((Array.isArray(o.near) ? o.near : []).filter(x => x.u !== u.id && now() - x.ts < 864e5)).slice(0, 30);
  const ch = C.openDm(u.id, o.id);
  const m = C.postMessage(ch, u.id, { text: '🤍 Я рядом. Отвечать не нужно.', near: 1 });
  save(); R.selfUpdate(o);
  return { ok: true, chat: ch.id, id: m.id };
};
H['near.clear'] = c => { const u = db.users[c.uid]; if (Array.isArray(u.near)) delete u.near; save(); R.selfUpdate(u); return { ok: true }; };      // не стираем координаты «Я рядом» — это другое действие
