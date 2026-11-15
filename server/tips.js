'use strict';
// Чаевые: листики автору за конкретное сообщение или запись в канале. 5 % сгорает как комиссия.
// На сообщении остаётся счётчик, автору приходит тихое событие; в чат ничего не пишется, чтобы чаевые не превращались в спам.
const C = require('./core');
const R = require('./rpc');
const A = require('./auth');
const { db, save, now, need, str, pubUser } = C;
const H = R.H;

const FEE = 5, MIN = 10, MAX = 10000, AMOUNTS = [10, 50, 100, 500, 1000];
const month = () => C.today().slice(0, 7);
let onTip = null;

H['tip.info'] = () => ({ amounts: AMOUNTS, fee: FEE, min: MIN, max: MAX });
H['tip.send'] = (c, p) => {
  const chat = R.getChat(c, p.chat), m = C.findMsg(chat.id, p.id); need(m && m.type !== 'service' && !m.hook && !m.once, 'Этому сообщению чаевые не оставить');
  const u = db.users[c.uid], o = db.users[m.from]; need(o && !o.deleted, 'Автор не найден');
  const n = Math.floor(Number(p.n) || 0); need(n >= MIN, `Чаевые — от ${MIN} 🍃`); need(n <= MAX, `Не больше ${MAX} 🍃 за раз`);
  R.giveCheck(u, o); A.limit('tip:' + u.id, 20, 60000);
  R.spend(u, n, 'Листики можно накопить или докупить в магазине.');
  const fee = Math.ceil(n * FEE / 100), got = n - fee;
  o.stars = (o.stars || 0) + got;
  if (!o.tipMon || o.tipMon.id !== month()) o.tipMon = { id: month(), n: 0, c: 0 };
  o.tipMon.n += got; o.tipMon.c++;
  m.tips = (m.tips || 0) + n; m.tipc = (m.tipc || 0) + 1;
  const ts = now(); R.leafLog(u, { ts, to: o.id, n, note: 'чаевые' }); R.leafLog(o, { ts, from: u.id, n: got, note: 'чаевые' });
  R.selfUpdate(u); R.selfUpdate(o); C.updateMsg(chat, m);
  C.emit(o.id, 'tip', { from: u.id, name: R.uname(u), n: got, chat: chat.id, msg: m.id });
  if (onTip) { try { onTip(u.id); } catch (e) { console.warn('[tip]', e.message); } }
  return { ok: true, n, fee, got, stars: u.stars, tips: m.tips };
};
// Кого поддержали в этом месяце больше всех. Счёт каждый месяц начинается заново.
H['tip.top'] = c => {
  const id = month(), list = Object.values(db.users).filter(x => !x.deleted && !x.banned && x.tipMon && x.tipMon.id === id && x.tipMon.n > 0).sort((a, b) => b.tipMon.n - a.tipMon.n).slice(0, 20), users = {};
  for (const x of list) users[x.id] = pubUser(x, c.uid);
  const me = db.users[c.uid];
  return { month: id, list: list.map(x => ({ u: x.id, n: x.tipMon.n, c: x.tipMon.c })), users, mine: me.tipMon && me.tipMon.id === id ? me.tipMon.n : 0 };
};

module.exports = { FEE, MIN, MAX, AMOUNTS, setOnTip: f => { onTip = f; } };
