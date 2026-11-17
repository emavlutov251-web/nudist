'use strict';
// «Бизнес»: адрес, часы, сайт, приветствие и «нет на месте» (автоответ на первое сообщение в личке,
// раз в 7 дней на одного отправителя) и быстрые ответы.
const C = require('./core');
const R = require('./rpc');
const { db, save, now, fail, need, str, postMessage } = C;
const H = R.H;
const AUTO_AGAIN = 7 * 864e5;

H['me.biz'] = (c, p) => {
  const u = db.users[c.uid]; if (!u) fail('Вход не выполнен');
  const q = Array.isArray(p.quick) ? p.quick.slice(0, 10) : [];
  u.biz = {
    addr: str(p.addr, 160) || '',
    hours: str(p.hours, 120) || '',
    site: str(p.site, 200) || '',
    greetOn: !!p.greetOn,
    greet: str(p.greet, 500) || '',
    awayOn: !!p.awayOn,
    away: str(p.away, 500) || '',
    quick: q.map(x => ({ t: str(x && x.t, 40) || '', body: str(x && x.body, 300) || '' })).filter(x => x.body),
  };
  if (!u.biz.addr && !u.biz.hours && !u.biz.site && !u.biz.greetOn && !u.biz.awayOn && !u.biz.quick.length) delete u.biz;
  save(); R.selfUpdate(u); C.broadcastUser(u);
  return { ok: true, biz: u.biz };
};

// Автоответ бизнеса: только в личных чатах, только на первое сообщение от человека и не чаще раза в 7 дней.
C.hooks.afterPost.push((chat, m) => {
  if (!chat || chat.type !== 'dm' || !m || !m.from || m.auto || m.type === 'service') return;
  const targetId = Object.keys(chat.members).find(id => id !== m.from);
  const t = targetId && db.users[targetId];
  const b = t && t.biz;
  if (!b) return;
  const text = b.awayOn && b.away ? b.away : (b.greetOn && b.greet ? b.greet : '');
  if (!text) return;
  const prev = (db.msgs[chat.id] || []);
  if (prev.some(x => x.from === m.from && x.id !== m.id)) return;      // уже писал(а) сюда — это не «первый контакт»
  chat.bizAuto = chat.bizAuto || {};
  if (chat.bizAuto[m.from] && now() - chat.bizAuto[m.from] < AUTO_AGAIN) return;
  chat.bizAuto[m.from] = now();
  setImmediate(() => {
    try { postMessage(chat, targetId, { text, auto: true, sig: 'Бизнес-автоответ' }, { quiet: true }); }
    catch (e) { console.error('[biz]', e.message); }
  });
});
module.exports = {};
