'use strict';
// «Нудищево РП» онлайн: люди видят друг друга на одной карте, здороваются, болтают и вместе живут в городе.
// Сервер хранит только местоположение, облик и реплики — сама жизнь (работа, деньги, транспорт) остаётся
// в игре на устройстве, поэтому игра не тормозит от чужого пинга. Прогресс привязан к аккаунту:
// закрыл приложение на телефоне — открыл на компьютере и продолжил с того же места.
const C = require('./core');
const R = require('./rpc');
const A = require('./auth');
const { db, save, now, need, str, int } = C;
const H = R.H;

const MAX = Number(process.env.RP_MAX) || 80;      // больше людей на карте — уже толпа, и экран не читается
const room = new Map();      // userId → { id, x, y, hat, ride, name, color, ts, beach, act }
const says = [];             // последние реплики в городе: { id, by, text, ts }
const me = c => { const u = db.users[c.uid]; need(u, 'Вход не выполнен'); return u; };
const pub = u => ({ id: u.id, name: R.uname(u) || 'Житель', color: u.color || 0 });
const list = uid => [...room.values()].filter(p => p.id !== uid);

// Прогресс: что человек нажил в Нудищеве. Хранится в аккаунте, а не в браузере.
H['rp.state'] = c => {
  const u = me(c);
  return { save: u.rp || null, people: list(u.id), says: says.slice(-40), max: MAX, at: room.get(u.id) || null };
};
H['rp.save'] = (c, p) => {
  const u = me(c);
  A.limit('rpsave:' + u.id, 120, 3600e3);
  const s = p.save && typeof p.save === 'object' ? p.save : null;
  need(s, 'Нечего сохранять');
  // Проверяем то, что можно испортить: деньги, уровень, транспорт. Остальное — как есть.
  u.rp = { money: int(s.money, 0, 1e9), xp: int(s.xp, 0, 1e9), ride: int(s.ride, 0, 5), hat: int(s.hat, 0, 20), hats: Array.isArray(s.hats) ? s.hats.map(x => int(x, 0, 20)).slice(0, 20) : [0],
    jobs: int(s.jobs, 0, 1e7), saved: int(s.saved, 0, 1e6), tan: int(s.tan, 0, 1e5), en: int(s.en, 0, 100), food: int(s.food, 0, 100), ts: now() };
  save();
  return { ok: true, at: u.rp.ts };
};
// Где человек сейчас: обновляем не чаще двух раз в секунду, чтобы не забивать канал.
H['rp.pos'] = (c, p) => {
  const u = me(c);
  A.limit('rppos:' + u.id, 90, 60e3);
  const prev = room.get(u.id);
  // Стоит на месте — не шлём ничего соседям: в городе десятки людей, и «я всё ещё тут» каждые полсекунды
  // съедало бы канал впустую. Сравниваем с прошлой точкой с точностью до пары шагов.
  if (prev && Math.abs((Number(p.x) || 0) - prev.x) < 4 && Math.abs((Number(p.y) || 0) - prev.y) < 4 && now() - prev.ts < 1500) return { ok: true, skip: true };
  const at = { id: u.id, ...pub(u), x: Math.round(Number(p.x) || 0), y: Math.round(Number(p.y) || 0), hat: int(p.hat, 0, 20), ride: int(p.ride, 0, 5), beach: !!p.beach, act: str(p.act, 12), ts: now() };
  room.set(u.id, at);
  // Соседи в радиусе: остальным достаточно знать, кто рядом, а не всю карту.
  // Если человек ещё не присылал свою позицию (только вошёл в игру), шлём — иначе он не увидит никого,
  // пока не двинется сам.
  for (const uid of C.conns.keys()) {
    if (uid === u.id) continue;
    const mine = room.get(uid);
    if (mine && (Math.abs(mine.x - at.x) > 900 || Math.abs(mine.y - at.y) > 900)) continue;
    C.emit(uid, 'rp.pos', { p: at });
  }
  if (room.size > MAX * 3) for (const [uid, v] of room) if (now() - v.ts > 60e3) room.delete(uid);
  return { ok: true };
};
H['rp.say'] = (c, p) => {
  const u = me(c);
  A.limit('rpsay:' + u.id, 12, 20e3);
  const text = str(p.text, 120); need(text, 'Пустое сообщение');
  const m = { id: C.id(), by: u.id, name: pub(u).name, text, ts: now() };      // имя сразу в реплике: иначе старые сообщения безымянные
  says.push(m); if (says.length > 60) says.shift();
  for (const uid of C.conns.keys()) C.emit(uid, 'rp.say', { m, user: pub(u) });
};
H['rp.here'] = c => { const u = me(c); return { people: list(u.id).filter(p => now() - p.ts < 120e3), says: says.slice(-20) }; };
// Кто вышел из приложения — того нет в городе.
function gone(uid) { if (room.delete(uid)) for (const x of C.conns.keys()) C.emit(x, 'rp.gone', { id: uid }); }
function dropConn(c) {
  // У человека может быть несколько соединений (телефон и компьютер): убираем с карты, только когда не осталось ни одного.
  const rest = C.conns.get(c.uid); if (rest && rest.size > 1) return;
  gone(c.uid);
}

module.exports = { dropConn, gone };
