'use strict';
// «Знакомство» — подбор людей, с которыми есть о чём поговорить. Не лента лиц: сначала общее (город, интересы, возраст рядом),
// и только потом внешнее. Работает так: включаешь анкету → видишь по одному человеку → «нравится» или «дальше».
// Совпало взаимно — обоим приходит сообщение, и открывается чат. Никто не узнаёт, что его «пропустили».
//
// Приватность: анкета видна только тем, кто тоже включил знакомство; точный город не показывается, только «рядом» или название;
// возраст — числом, а не датой рождения; кого лайкнули — не раскрывается никогда, кроме взаимного совпадения.
const C = require('./core');
const R = require('./rpc');
const A = require('./auth');
const { db, save, now, need, str, fail } = C;
const H = R.H;

const MAX_INT = 8, MAX_ABOUT = 300, MAX_LIKE_DAY = 100;
const norm = s => String(s || '').trim().toLowerCase().replace(/ё/g, 'е');
const list = (u, k) => (u.dating && Array.isArray(u.dating[k]) ? u.dating[k] : []);
const ageOf = u => { const y = u.dating && Number(u.dating.year); if (!(y > 1900 && y < 2020)) return null; return new Date().getFullYear() - y; };
const view = (u, uid) => {
  const d = u.dating || {};
  const p = C.pubUser(u, uid) || {};
  return { id: u.id, name: p.name, username: p.username, avatar: p.avatar, color: p.color, online: !!C.isOnline(u.id),
    age: ageOf(u), city: d.city ? String(d.city).slice(0, 40) : '', about: String(d.about || '').slice(0, MAX_ABOUT),
    tags: list(u, 'tags').slice(0, MAX_INT), look: d.look || '', play: d.play || '' };
};
// Насколько двое подходят друг другу: интересы, город, возраст. Считаем на сервере — клиент не должен влиять на порядок.
function score(me, u) {
  let n = 0;
  const a = new Set(list(me, 'tags').map(norm)), b = new Set(list(u, 'tags').map(norm));
  for (const t of a) if (b.has(t)) n += 10;                       // общие интересы — главное
  const mc = norm(me.dating && me.dating.city), uc = norm(u.dating && u.dating.city);
  if (mc && mc === uc) n += 12;                                   // один город
  const ma = ageOf(me), ua = ageOf(u);
  if (ma && ua) { const d = Math.abs(ma - ua); n += d <= 3 ? 8 : d <= 7 ? 4 : d <= 12 ? 1 : -4; }
  if (me.dating && me.dating.play && me.dating.play === (u.dating || {}).play) n += 5;      // «зачем пришли» совпало
  if ((me.contacts || []).includes(u.id) || (u.contacts || []).includes(me.id)) n -= 6;     // уже знакомы — не первыми
  return n;
}
const open = (u, uid) => !!(u && u.dating && u.dating.on && !u.deleted && !u.banned && u.id !== uid);
const me = c => { const u = db.users[c.uid]; need(u, 'Вход не выполнен'); return u; };

H['dating.me'] = c => {
  const u = me(c), d = u.dating || {};
  return { on: !!d.on, year: d.year || null, city: d.city || '', about: d.about || '', tags: list(u, 'tags'), look: d.look || '', play: d.play || '',
    likes: (u.datingLikes || []).length, matches: Object.keys(u.datingMatch || {}).length, canLike: likeLeft(u), tagsMax: MAX_INT, aboutMax: MAX_ABOUT };
};
function likeLeft(u) { const d = C.today(); if (!u.datingDay || u.datingDay.d !== d) return MAX_LIKE_DAY; return Math.max(0, MAX_LIKE_DAY - (u.datingDay.n || 0)); }
H['dating.save'] = (c, p) => {
  const u = me(c); A.limit('dating:' + u.id, 60, 3600e3);
  const year = Math.floor(Number(p.year)) || 0;
  need(year >= 1940 && year <= new Date().getFullYear() - 16, 'Возраст — с 16 лет. Укажите год рождения: он нужен только для подбора и никогда не показывается');
  const tags = (Array.isArray(p.tags) ? p.tags : []).map(x => str(x, 24)).filter(Boolean).slice(0, MAX_INT);
  const about = str(p.about, MAX_ABOUT);
  const city = str(p.city, 40);
  u.dating = { on: p.on === false ? false : true, year, city, about, tags, look: str(p.look, 20), play: str(p.play, 20), ts: now() };
  save();
  return H['dating.me'](c);
};
H['dating.off'] = c => { const u = me(c); if (u.dating) u.dating.on = false; save(); return { ok: true }; };
// Кого показать: по одному, лучшие совпадения вперёд. Пропущенные и лайкнутые не возвращаются.
H['dating.next'] = c => {
  const u = me(c); need(u.dating && u.dating.on, 'Сначала заполните анкету и включите знакомство');
  A.limit('dnext:' + u.id, 200, 3600e3);
  if (u.datingSkip && u.datingSkip.size) u.datingSkip = [...u.datingSkip];
  const skip = new Set([...(u.datingSkip || []), ...(u.datingLikes || []), ...Object.keys(u.datingMatch || {}), u.id]);
  const cands = Object.values(db.users).filter(x => open(x, u.id) && !skip.has(x.id)
    && !(x.blocked || []).includes(u.id) && !(u.blocked || []).includes(x.id));
  if (!cands.length) return { none: true, cards: 0 };
  cands.sort((a, b) => score(u, b) - score(u, a) || (b.dating.ts || 0) - (a.dating.ts || 0));
  const x = cands[0];
  return { user: view(x, u.id), common: list(u, 'tags').filter(t => list(x, 'tags').map(norm).includes(norm(t))), cards: cands.length };
};
H['dating.skip'] = (c, p) => {
  const u = me(c); const o = db.users[str(p.id, 32)]; if (!o) return { ok: true };
  if (!Array.isArray(u.datingSkip)) u.datingSkip = [];
  if (!u.datingSkip.includes(o.id)) u.datingSkip.push(o.id);
  if (u.datingSkip.length > 500) u.datingSkip = u.datingSkip.slice(-500);
  save(); return { ok: true };
};
// «Нравится». Если человек ответил взаимно — обоим приходит сообщение и открывается чат.
H['dating.like'] = (c, p) => {
  const u = me(c), o = db.users[str(p.id, 32)];
  need(u.dating && u.dating.on, 'Сначала включите знакомство'); need(o && open(o, u.id), 'Эта анкета уже недоступна');
  need(!(o.blocked || []).includes(u.id) && !(u.blocked || []).includes(o.id), 'Этот человек сейчас недоступен');
  const d = C.today(); if (!u.datingDay || u.datingDay.d !== d) u.datingDay = { d, n: 0 };
  need(u.datingDay.n < MAX_LIKE_DAY, 'На сегодня «нравится» закончились. Завтра будут новые — так спокойнее для всех');
  if (!Array.isArray(u.datingLikes)) u.datingLikes = [];
  if (!u.datingLikes.includes(o.id)) { u.datingLikes.push(o.id); u.datingDay.n++; }
  const mutual = (o.datingLikes || []).includes(u.id);
  if (mutual) {
    u.datingMatch = u.datingMatch || {}; o.datingMatch = o.datingMatch || {};
    u.datingMatch[o.id] = now(); o.datingMatch[u.id] = now();
    const ch = C.openDm(u.id, o.id);
    // первое сообщение пишет сервис: у обоих появляется чат, и разговор не начинается с пустоты
    C.service(ch, null, `🍃 Вы понравились друг другу. Общее: ${list(u, 'tags').filter(t => list(o, 'tags').map(norm).includes(norm(t))).join(', ') || 'пока ничего — тем интереснее'}. Отвечать не обязательно: можно просто сказать «привет».`);
    for (const who of [u.id, o.id]) if (C.isOnline(who)) C.emit(who, 'dating.match', { user: C.pubUser(who === u.id ? o : u, who), chat: ch.id });
  }
  save();
  return { mutual: mutual || undefined, left: likeLeft(u) };
};
H['dating.list'] = c => {
  const u = me(c);
  return Object.keys(u.datingMatch || {}).map(id => { const o = db.users[id]; return o ? { user: C.pubUser(o, u.id), at: u.datingMatch[id], chat: C.dmId(u.id, o.id) } : null; }).filter(Boolean).sort((a, b) => b.at - a.at).slice(0, 100);
};

module.exports = {};
