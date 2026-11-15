'use strict';
// «Тихое место»: дневник настроения (виден только самому человеку), капсулы времени и номера первых пользователей.
// Здесь нет ни листиков, ни платных функций: это не магазин.
const C = require('./core');
const A = require('./auth');
const R = require('./rpc');
const { db, save, need, str, now } = C;
const H = R.H;

// ───── Настроение. Одна отметка в день, хранится год. Никому, кроме самого человека, не отдаётся.
const MOODS = ['sun', 'cloud', 'fog', 'rain', 'storm'];
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
H['mood.set'] = (c, p) => {
  const u = db.users[c.uid], day = str(p.day, 10); need(DAY_RE.test(day) && Math.abs(Date.parse(day + 'T12:00:00Z') - now()) < 2 * 864e5, 'Отметить можно только сегодняшний день');
  const v = str(p.v, 8); need(!v || MOODS.includes(v), 'Такого настроения нет');
  const m = u.mood = u.mood || {}; if (v) m[day] = v; else delete m[day];
  const ks = Object.keys(m).sort(); for (const k of ks.slice(0, Math.max(0, ks.length - 370))) delete m[k];
  save(); return { days: m };
};
H['mood.get'] = c => ({ days: db.users[c.uid].mood || {} });
H['mood.clear'] = c => { delete db.users[c.uid].mood; save(); return { days: {} }; };

// ───── Капсула времени: сообщение в личке, запечатанное до выбранного дня. До срока текст не отдаётся никому (даже автору),
// в срок сообщение открывается само и адресату приходит уведомление. Бесплатно, открыть раньше нельзя ни за какие листики.
const CAP_EARLY = Number(process.env.CAPSULE_EARLY) || 300;      // листиков за досрочное открытие
const CAP_MAX = 10, CAP_MIN = Number(process.env.CAPSULE_MIN_MS) || 3600e3,      // переменные окружения — только для проверок
  TICK = Number(process.env.CAPSULE_TICK_MS) || 60e3, CAP_FAR = 5 * 366 * 864e5;
const caps = () => (db.meta.caps = db.meta.caps || []);
const dateRu = t => new Date(t + 3 * 3600e3).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).replace(/\s*г\.?$/, '');      /* по Москве, без «г.» */
H['capsule.new'] = (c, p) => {
  const u = db.users[c.uid], o = db.users[str(p.to, 32)]; need(o && !o.deleted && !o.bot && o.id !== u.id, 'Капсулу можно оставить только другому человеку');
  const text = str(p.text, 2000).trim(); need(text.length >= 1, 'Напишите, что будет внутри');
  const at = Math.floor(Number(p.at)); need(at - now() >= CAP_MIN, 'Капсула должна пролежать хотя бы час'); need(at - now() <= CAP_FAR, 'Дальше пяти лет не загадываем');
  need(caps().filter(x => x.by === u.id).length < CAP_MAX, `Одновременно можно держать ${CAP_MAX} запечатанных капсул`);
  A.limit('capsule:' + u.id, 10, 3600e3);
  const ch = C.openDm(u.id, o.id); R.checkSend(c, ch, { type: 'text' });
  const m = C.postMessage(ch, u.id, { text: '🔒 Капсула времени', cap: { at, made: now(), ...(p.lock ? { lock: true } : { early: CAP_EARLY }) } });      /* lock — автор запретил открывать раньше срока */
  m.capText = text;
  caps().push({ chat: ch.id, mid: m.id, at, by: u.id }); save();
  return { chat: ch.id, id: m.id, at };
};
H['capsule.list'] = c => ({ list: caps().filter(x => x.by === c.uid).map(x => { const ch = db.chats[x.chat], to = ch && Object.keys(ch.members).find(i => i !== c.uid); return { chat: x.chat, id: x.mid, at: x.at, to }; }), max: CAP_MAX });
H['capsule.cancel'] = (c, p) => {
  const i = caps().findIndex(x => x.by === c.uid && x.chat === str(p.chat, 80) && x.mid === str(p.id, 40)); need(i >= 0, 'Капсула не найдена или уже открыта');
  const x = caps()[i], ch = db.chats[x.chat]; caps().splice(i, 1);
  if (ch) C.deleteMessages(ch, [x.mid], c.uid);
  save(); return { ok: true };
};
function unseal(ch, m, by, t, early) {
  m.text = m.capText || ''; delete m.capText; m.cap = { at: m.cap.at, made: m.cap.made, open: t, ...(early ? { paid: true } : {}) }; C.updateMsg(ch, m);
  C.postMessage(ch, by, { text: early ? `💌 Капсулу времени открыли раньше срока. Запечатана ${dateRu(m.cap.made)}.` : `💌 Капсула времени открылась. Запечатана ${dateRu(m.cap.made)}.`, reply: m.id });
}
// Досрочно: открыть может только адресат, за листики, и только если автор этого не запретил. Листики сгорают — автору они не уходят.
H['capsule.open'] = (c, p) => {
  const u = db.users[c.uid], i = caps().findIndex(x => x.chat === str(p.chat, 80) && x.mid === str(p.id, 40)); need(i >= 0, 'Капсула не найдена или уже открыта');
  const x = caps()[i], ch = db.chats[x.chat]; need(ch && ch.members && ch.members[u.id] && x.by !== u.id, 'Открыть досрочно может только тот, кому капсула адресована');
  const m = C.findMsg(ch.id, x.mid); need(m && m.cap && !m.cap.open, 'Капсула не найдена или уже открыта'); need(!m.cap.lock && m.cap.early > 0, 'Автор запретил открывать эту капсулу раньше срока');
  R.spend(u, m.cap.early, 'Или просто дождитесь срока — тогда она откроется бесплатно.');
  caps().splice(i, 1); unseal(ch, m, x.by, now(), true); save(); R.selfUpdate(u);
  return { ok: true, stars: u.stars };
};
// Раз в минуту открываем созревшие капсулы.
function openDue() {
  const t = now(), list = caps(); if (!list.some(x => x.at <= t)) return;
  db.meta.caps = list.filter(x => {
    if (x.at > t) return true;
    try {
      const ch = db.chats[x.chat], m = ch && C.findMsg(ch.id, x.mid); if (!m || !m.cap) return false;
      unseal(ch, m, x.by, t);
    } catch (e) { console.error('[capsule]', e.message); }
    return false;
  });
  save();
}
const timer = setInterval(() => { try { openDue(); } catch (e) { console.error('[capsule]', e.message); } }, TICK); if (timer.unref) timer.unref();

// ───── Номера первых. Каждый человек получает порядковый номер по дате регистрации; у первой тысячи он виден в профиле навсегда.
const FOUNDERS = 1000;
function numberAll() {
  let n = db.meta.userNo || 0, ch = false;
  if (!n) for (const u of Object.values(db.users)) if (u.no > n) n = u.no;
  for (const u of Object.values(db.users).filter(u => !u.bot && !u.no && !C.isRobot(u.id)).sort((a, b) => (a.created || 0) - (b.created || 0))) { u.no = ++n; ch = true; }
  if (ch || db.meta.userNo !== n) { db.meta.userNo = n; save(); }
}
C.setNoHook(u => { if (u && !u.no && !u.bot && !u.deleted && !C.isRobot(u.id)) numberAll(); return u && u.no && u.no <= FOUNDERS && !u.deleted ? u.no : undefined; });
setImmediate(() => { try { numberAll(); } catch (e) { console.error('[calm]', e.message); } });
module.exports = { openDue, numberAll, MOODS };
