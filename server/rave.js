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
  users: [...r.users.values()], now: r.now, host: r.by === uid, cover: r.cover || '', about: r.about || '', video: !!r.video });
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
    ts: now(), users: new Map([[c.id, u.id]]), chat: [], now: null, cover: str(p.cover, 200), about: str(p.about, 200),
    video: !!p.video };      // голосовая комната: все слышат друг друга, а на экране — общее видео
  rooms.set(r.id, r); announce();
  return { room: raveView(r, u.id), you: c.id };
};
/**
 * Ссылка на видео из любого популярного сервиса → то, что умеет играть наш плеер.
 * Свои файлы (mp4/webm/m3u8) играем как есть. YouTube в России без VPN не грузится — его отдаём
 * через тот же закреплённый плеер, что и в чатах (с честным предупреждением). VK, Rutube и Дзен
 * отдаём их же официальными embed-плеерами: они работают из России и не требуют ключей.
 */
function parseVideo(raw) {
  const s = str(raw, 600).trim();
  need(s, 'Вставьте ссылку на видео');
  const u = (() => { try { const x = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s); return /^https?:$/.test(x.protocol) ? x : null; } catch (e) { return null; } })();
  need(u, 'Это не похоже на ссылку');
  const host = u.hostname.replace(/^www\.|^m\./, '').toLowerCase(), path = u.pathname;
  const yt = /(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([\w-]{11})/.exec(u.href);
  if (yt) return { kind: 'embed', site: 'YouTube', url: `https://www.youtube.com/embed/${yt[1]}?autoplay=1&playsinline=1&rel=0`, poster: `https://i.ytimg.com/vi/${yt[1]}/hqdefault.jpg`, link: 'https://www.youtube.com/watch?v=' + yt[1], title: 'Видео с YouTube', dur: 0, warn: 'yt' };
  if (/(^|\.)vk(video)?\.(com|ru)$/.test(host)) {
    const m = /video(-?\d+)_(\d+)/.exec(u.href);
    if (m) return { kind: 'embed', site: 'VK', url: `https://vk.com/video_ext.php?oid=${m[1]}&id=${m[2]}&hd=2`, link: u.href, title: 'Видео из VK', dur: 0 };
  }
  if (/(^|\.)rutube\.ru$/.test(host)) {
    const m = /(?:video|embed)\/([0-9a-f]{32})/.exec(path) || /\/([0-9a-f]{32})\/?/.exec(path);
    if (m) return { kind: 'embed', site: 'Rutube', url: `https://rutube.ru/play/embed/${m[1]}/`, link: u.href, title: 'Видео с Rutube', dur: 0 };
  }
  if (/(^|\.)dzen\.ru$/.test(host)) {
    const m = /video\/watch\/([0-9a-zA-Z_-]+)/.exec(path);
    if (m) return { kind: 'embed', site: 'Дзен', url: `https://dzen.ru/embed/${m[1]}?from_block=ya&autoplay=1`, link: u.href, title: 'Видео из Дзена', dur: 0 };
  }
  if (/(^|\.)(tiktok|instagram|facebook|twitch|vimeo)\.(com|tv)$/.test(host)) return { kind: 'link', site: host.split('.').slice(-2).join('.'), url: u.href, link: u.href, title: 'Ссылка на видео (' + host + ')', dur: 0 };
  if (!/\.(mp4|webm|ogv|ogg|m4v|mov|m3u8)$/i.test(path)) need(false, 'Не знаю такой сервис. Своё видео — файлом mp4/webm или ссылкой с youtube, vk, rutube, дзен');
  return { kind: 'file', site: '', url: u.href, link: u.href, title: decodeURIComponent(path.split('/').pop() || 'Видео').slice(0, 70), dur: 0 };
}

/** Поставить в комнату ссылку (хозяин) — видео сразу у всех. */
H['rave.url'] = (c, p) => {
  const r = room(rooms.get(str(p.id, 32)), c);
  need(r.by === c.uid, 'Ссылку ставит хозяин комнаты');
  A.limit('raveurl:' + c.uid, 30, 600e3);
  const v = parseVideo(p.url);
  const item = 'url_' + id();
  r.links = r.links || {}; r.links[item] = v;
  r.now = { kind: 'link', item, at: 0, paused: false, ts: now() };
  raveMsg(r, 'rave.play', { id: r.id, now: r.now, link: v }); announce();
  return { now: r.now, item: v };
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
  const link = r.now && r.now.kind === 'link' && r.links && r.links[r.now.item];
  return { room: raveView(r, c.uid), you: c.id, first, link: link || null, chat: r.chat.slice(-60), users: usersOf([...r.users.values()].concat(r.chat.map(m => m.by)), c.uid) };
};
H['rave.leave'] = (c, p) => {
  const r = rooms.get(str(p.id, 32)); if (!r) return;
  r.users.delete(c.id);
  const rest = [...r.users.values()];
  if (!rest.length) { rooms.delete(r.id); dropVoiceChat(r.id); announce(); return; }
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
/**
 * Голос в комнате рейва. Отдельного «канала» в базе не заводим: комната и есть канал.
 * Пока кто-то в голосе — чат room.id лежит в db.chats временно, чтобы общий механизм звонков (WebRTC)
 * работал как обычно. Как только голос выключили все — убираем.
 */
const voiceRooms = new Set();
R.getChat = ((orig) => (c, cid, o) => {
  const id = typeof cid === 'string' ? cid : '';
  if (id.indexOf('rave:') === 0) {
    const r = rooms.get(id.slice(5));
    need(r, 'Комната закрылась');
    need(r.users.has(c.id), 'Сначала зайдите в комнату');
    let ch = db.chats[id];
    if (!ch) { ch = db.chats[id] = { id, type: 'group', title: r.title || 'Рейв', members: {}, pos: 0, ts: now() }; voiceRooms.add(id); }
    ch.members[c.uid] = { role: r.by === c.uid ? 'owner' : 'member' };
    return ch;
  }
  return orig(c, cid, o);
})(R.getChat);
function dropVoiceChat(rid) {
  const id = 'rave:' + rid;
  if (!db.chats[id]) return;
  delete db.chats[id]; voiceRooms.delete(id);
  for (const [cid, cn] of C.connById) { /* пусть клиенты сами увидят, что разговор кончился */ if (cn) cn.send('call.end', { chat: id, quiet: true }); }
}
H['rave.get'] = (c, p) => {
  const r = rooms.get(str(p.id, 32)); need(r, 'Комната закрылась');
  const link = r.now && r.now.kind === 'link' && r.links && r.links[r.now.item];
  return { room: raveView(r, c.uid), in: r.users.has(c.id), now: r.now, link: link || null, chat: r.chat.slice(-60), users: usersOf([...r.users.values()].concat(r.chat.map(m => m.by)), c.uid) };
};
function dropConn(c) { for (const r of [...rooms.values()]) if (r.users.has(c.id)) { r.users.delete(c.id); const rest = [...r.users.values()]; if (!rest.length) { rooms.delete(r.id); dropVoiceChat(r.id); } else { if (r.by === c.uid) r.by = rest[0]; raveMsg(r, 'rave.people', { id: r.id, users: rest, n: rest.length }); } } announce(); }

module.exports = { dropConn };
