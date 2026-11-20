'use strict';
// Рейв — комната, где вместе смотрят и слушают одно и то же: клипы из ленты или музыка из общей волны.
// Ведущий листает, у всех остальных лента идёт следом (с поправкой на их время ожидания). Сбоку — общий чат.
// Сервер держит только состояние: что сейчас играет, с какой секунды, кто в зале. Сами видео и музыка
// идут с обычных адресов, поэтому комната не съедает канал сервера.
//
// Приватность: закрытую комнату видно только по прямой ссылке; открытую — в списке «сейчас в эфире».
const C = require('./core');
const R = require('./rpc');
const uname = u => (u ? [u.name, u.last].filter(Boolean).join(' ') : 'Кто-то');
const A = require('./auth');
const { db, save, now, need, str, id } = C;
const H = R.H;

const MAX = Number(process.env.RAVE_MAX) || 40;      // больше сорока человек в комнате не проверить толком
const rooms = new Map();      // id → { id, by, title, kind, pub, ts, users: Map(connId → userId), chat: [], now: {kind,id,at,paused} }
const raveMsg = (r, ev, d, skip) => { for (const cid of r.users.keys()) { if (cid === skip) continue; const cn = C.connById.get(cid); if (cn) cn.send(ev, d); } };
const raveView = (r, uid) => ({ id: r.id, by: r.by, title: r.title, kind: r.kind, pub: !!r.pub, ts: r.ts, n: r.users.size, max: MAX,
  users: [...r.users.values()], now: r.now, host: r.by === uid, cover: r.cover || '', about: r.about || '' });
const announce = () => C.emitAll('rave.upd', {});
const me = c => { const u = db.users[c.uid]; need(u, 'Вход не выполнен'); return u; };
const usersOf = (ids, vid) => { const o = {}; for (const i of ids) if (i && !o[i] && db.users[i]) o[i] = C.pubUser(db.users[i], vid); return o; };
const room = (r, c) => { need(r, 'Комната не найдена или уже закрылась'); need(r.users.has(c.id), 'Вы не в этой комнате'); return r; };

H['rave.list'] = c => {
  const list = [...rooms.values()].filter(r => r.pub || r.users.has(c.id));
  return { list: list.sort((a, b) => b.users.size - a.users.size || b.ts - a.ts).slice(0, 30).map(r => raveView(r, c.uid)), users: usersOf(list.flatMap(r => [...r.users.values()]), c.uid) };
};
H['rave.new'] = (c, p) => {
  const u = me(c);
  A.limit('rave:' + u.id, 20, 3600e3);
  for (const r of [...rooms.values()]) if (r.by === u.id && r.users.size <= 1) rooms.delete(r.id);      // брошенные свои комнаты закрываем
  const r = { id: id(), by: u.id, title: str(p.title, 80) || 'Рейв', kind: p.kind === 'music' ? 'music' : 'clips', pub: p.pub !== false,
    ts: now(), users: new Map([[c.id, u.id]]), chat: [], now: null, cover: str(p.cover, 200), about: str(p.about, 200) };
  rooms.set(r.id, r); announce();
  return { room: raveView(r, u.id), you: c.id };
};
H['rave.join'] = (c, p) => {
  me(c);
  const r = rooms.get(str(p.id, 32)); need(r, 'Комната не найдена или уже закрылась');
  need(r.users.size < MAX, `В комнате уже ${MAX} человек — больше мест нет`);
  r.users.set(c.id, c.uid);
  const first = r.users.size === 1 ? c.id : null;
  if (r.users.size === 1) r.by = c.uid;      // хозяин ушёл — комнату ведёт тот, кто пришёл, если дом остался пустым
  raveMsg(r, 'rave.people', { id: r.id, users: [...r.users.values()], n: r.users.size });
  announce();
  return { room: raveView(r, c.uid), you: c.id, first, chat: r.chat.slice(-60), users: usersOf([...r.users.values()].concat(r.chat.map(m => m.by)), c.uid) };
};
H['rave.leave'] = (c, p) => {
  const r = rooms.get(str(p.id, 32)); if (!r) return;
  r.users.delete(c.id);
  const rest = [...r.users.values()];
  if (!rest.length) { rooms.delete(r.id); announce(); return; }
  if (r.by === c.uid) r.by = rest[0];
  raveMsg(r, 'rave.people', { id: r.id, users: rest, n: rest.length });
  announce();
};
// Что играет и с какой секунды. Ставит только хозяин комнаты: у остальных лента едет за ним, а не наоборот.
H['rave.play'] = (c, p) => {
  const r = room(rooms.get(str(p.id, 32)), c);
  need(r.by === c.uid, 'Ленту в комнате переключает хозяин');
  const at = Math.max(0, Math.min(Number(p.at) || 0, 24 * 3600));
  r.now = { kind: str(p.kind, 12) === 'music' ? 'music' : 'clip', item: str(p.item, 32), at, paused: !!p.paused, ts: now() };
  raveMsg(r, 'rave.play', { id: r.id, now: r.now });
  return { now: r.now };
};
H['rave.pause'] = (c, p) => {
  const r = room(rooms.get(str(p.id, 32)), c);
  need(r.by === c.uid, 'Ставит на паузу хозяин');
  if (r.now) { r.now.paused = p.paused !== false; r.now.at = Math.max(0, Math.min(Number(p.at) || 0, 24 * 3600)); r.now.ts = now(); raveMsg(r, 'rave.play', { id: r.id, now: r.now }); }
  return { now: r.now };
};
H['rave.chat'] = (c, p) => {
  const r = room(rooms.get(str(p.id, 32)), c);
  const text = str(p.text, 500); need(text, 'Пустое сообщение');
  A.limit('rchat:' + c.uid, 30, 60e3);
  const u = me(c);
  const m = { id: id(), by: u.id, text, ts: now() };
  r.chat.push(m); if (r.chat.length > 200) r.chat.shift();
  raveMsg(r, 'rave.msg', { id: r.id, m, user: C.pubUser(u, u.id) });
};
H['rave.kick'] = (c, p) => {      // хозяин убирает из комнаты того, кто мешает
  const r = room(rooms.get(str(p.id, 32)), c);
  need(r.by === c.uid, 'Убрать гостя может хозяин');
  const him = str(p.user, 32);
  let hit = false;
  for (const [cid, uid] of [...r.users]) if (uid === him && cid !== c.id) { r.users.delete(cid); const cn = C.connById.get(cid); if (cn) { cn.send('rave.kicked', { id: r.id }); } hit = true; }
  if (hit) { raveMsg(r, 'rave.people', { id: r.id, users: [...r.users.values()], n: r.users.size }); announce(); }
  return { ok: hit };
};
H['rave.invite'] = (c, p) => {      // позвать друга в комнату — сообщением в личный чат
  const r = rooms.get(str(p.id, 32)); need(r && r.users.has(c.id), 'Сначала зайдите в комнату сами');
  const u = me(c), who = db.users[str(p.user, 32)];
  need(who && who.id !== u.id && !(who.blocked || []).includes(u.id), 'Этого человека позвать нельзя');
  const ch = C.openDm(u.id, who.id);
  C.postMessage(ch, u.id, { type: 'text', text: `🍃 ${uname(u)} зовёт на рейв «${r.title}» — вместе смотреть и слушать`, media: undefined, rave: r.id }, {});
  if (C.isOnline(who.id)) C.emit(who.id, 'rave.invite', { id: r.id, title: r.title, by: C.pubUser(u, who.id) });
  save();
  return { ok: true, chat: ch.id };
};
H['rave.get'] = (c, p) => {
  const r = rooms.get(str(p.id, 32)); need(r, 'Комната закрылась');
  return { room: raveView(r, c.uid), in: r.users.has(c.id), now: r.now, chat: r.chat.slice(-60), users: usersOf([...r.users.values()].concat(r.chat.map(m => m.by)), c.uid) };
};
function dropConn(c) { for (const r of [...rooms.values()]) if (r.users.has(c.id)) { r.users.delete(c.id); const rest = [...r.users.values()]; if (!rest.length) rooms.delete(r.id); else { if (r.by === c.uid) r.by = rest[0]; raveMsg(r, 'rave.people', { id: r.id, users: rest, n: rest.length }); } } announce(); }

module.exports = { dropConn };
