'use strict';
// Итоги сезона: в конце месяца — призы за вклад в общий котёл. (Это те «обещанные призы сезонов», о которых
// говорит подсказка на главной.)
//
// Считаем не «кто больше пишет», а кто делает город лучше: приглашённые люди, подарки и чаевые, бусты группам,
// сделанные задания, собранные клипы и посты, победы в играх. Голосование звёздами — отдельно: каждый может
// один раз в месяц отметить до трёх человек, и их звёзды прибавляются к общему счёту.
//
// Призы — листики и украшения из магазина. Начисляются по кнопке «Забрать» или сами в первый день месяца,
// чтобы никто не потерял награду, если не зашёл вовремя.
const C = require('./core');
const R = require('./rpc');
const A = require('./auth');
const { db, save, now, need, str, id } = C;
const H = R.H;

const seasonId = t => new Date(Number(t) || Date.now()).toISOString().slice(0, 7);
const AWARDS = [
  { place: 1, stars: 3000, item: 'frame_trident', title: 'Три звезды сезона' },
  { place: 2, stars: 1500 },
  { place: 3, stars: 700 },
  { place: 4, stars: 300 }, { place: 5, stars: 300 }, { place: 6, stars: 300 }, { place: 7, stars: 300 }, { place: 8, stars: 300 }, { place: 9, stars: 300 }, { place: 10, stars: 300 },
];
const me = c => { const u = db.users[c.uid]; need(u, 'Вход не выполнен'); return u; };

// ───── звёзды: «спасибо» конкретному человеку
// Одна звезда за человека в месяц и не больше пяти в месяц — иначе это уже не спасибо, а накрутка.
const STARS_PER_MONTH = 5;
function votes() { db.awardVotes = db.awardVotes || {}; return db.awardVotes; }
function starsOf(uid, sid) { const v = votes()[sid]; if (!v) return 0; let n = 0; for (const from in v) if (v[from][uid]) n++; return n; }
H['award.star'] = (c, p) => {
  const u = me(c), sid = seasonId(), to = str(p.user, 32), o = db.users[to];
  need(o && !o.deleted && !o.banned && o.id !== u.id, 'Этому человеку звезду не поставить');
  A.limit('star:' + u.id, 12, 3600e3);
  const v = votes(), mine = (v[sid] = v[sid] || {})[u.id] = v[sid][u.id] || {};
  need(!mine[o.id], 'Вы уже отметили этого человека в этом месяце');
  need(Object.keys(mine).length < STARS_PER_MONTH, `В этом месяце можно отметить до ${STARS_PER_MONTH} человек`);
  mine[o.id] = now();
  o.starGot = (o.starGot || 0) + 1;      // накопительное «спасибо» за всё время — видно в профиле
  save(); R.selfUpdate(o);
  if (C.isOnline(o.id)) C.emit(o.id, 'award.star', { from: C.pubUser(u, o.id), total: o.starGot });
  return { ok: true, left: STARS_PER_MONTH - Object.keys(mine).length, total: o.starGot };
};
H['award.stars'] = c => {
  const u = me(c), sid = seasonId(), v = votes()[sid] || {};
  const mine = v[u.id] || {};
  return { got: starsOf(u.id, sid), gave: Object.keys(mine).length, left: STARS_PER_MONTH - Object.keys(mine).length, perMonth: STARS_PER_MONTH, total: u.starGot || 0 };
};

// ───── итоги сезона
function scoreList(sid) {
  const wins = (db.seasonWins = db.seasonWins || {})[sid] || {};
  const rows = Object.values(db.users).filter(u => !u.bot && !u.deleted && !u.banned).map(u => {
    const w = wins[u.id] || {};
    const parts = { people: (w.invite || 0) * 4, gifts: (w.gift || 0) * 2, boosts: (w.boost || 0) * 6, tasks: (w.task || 0) * 2, posts: (w.post || 0) * 2, games: (w.game || 0) };
    const stars = starsOf(u.id, sid) * 5;
    const sum = parts.people + parts.gifts + parts.boosts + parts.tasks + parts.posts + parts.games + stars;
    return { id: u.id, name: R.uname(u) || 'Кто-то', color: u.color || 0, avatar: u.avatar, sum, parts, stars };
  }).filter(x => x.sum > 0).sort((a, b) => b.sum - a.sum || a.id.localeCompare(b.id));
  return rows;
}
const ended = sid => sid < seasonId();      // сезон закончился, если он раньше текущего месяца
function payOut(sid) {
  const done = (db.awardPaid = db.awardPaid || {});
  if (done[sid]) return done[sid];
  const rows = scoreList(sid);
  const out = rows.slice(0, 10).map((r, i) => {
    const a = AWARDS[i], u = db.users[r.id]; if (!u) return null;
    u.stars = (u.stars || 0) + a.stars;
    if (a.item) { u.owned = u.owned || []; if (!u.owned.includes(a.item)) u.owned.push(a.item); else u.stars += 300; }
    u.seasonPrize = { id: sid, place: i + 1, stars: a.stars, item: a.item || null, at: now() };
    try { R.selfUpdate(u); } catch (e) { /* не в сети */ }
    if (C.isOnline(u.id)) C.emit(u.id, 'award.prize', u.seasonPrize);
    return { id: r.id, name: r.name, place: i + 1, stars: a.stars, item: a.item || null };
  }).filter(Boolean);
  done[sid] = { at: now(), list: out };
  save();
  return done[sid];
}
H['award.season'] = c => {
  const u = me(c), sid = seasonId(), prev = seasonId(Date.now() - 32 * 864e5);
  // Прошлый сезон закрываем при первом заходе кого угодно — так награды выдаются сами.
  if (ended(prev)) payOut(prev);
  const list = scoreList(sid).slice(0, 20);
  const past = (db.awardPaid || {})[prev] || null;
  return { id: sid, rows: list, me: list.findIndex(x => x.id === u.id), mine: list.find(x => x.id === u.id) || null,
    stars: H['award.stars'](c), past, prize: u.seasonPrize && u.seasonPrize.id !== sid ? u.seasonPrize : null, places: AWARDS.length };
};

module.exports = { payOut, scoreList };

// ───── Зачёт вклада по ходу сезона. Всё, что человек делает полезного, попадает в копилку месяца.
const wins = () => { const sid = seasonId(); db.seasonWins = db.seasonWins || {}; return (db.seasonWins[sid] = db.seasonWins[sid] || {}); };
function add(uid, key, n = 1) { const w = wins(); const r = (w[uid] = w[uid] || {}); r[key] = (r[key] || 0) + n; save(); }
A.hooks.onInvite.push(inv => { if (inv && inv.id) add(inv.id, 'invite'); });
// Подарки, чаевые, бусты и игры считаем, не трогая сами обработчики: те же данные уже крутятся в пропуске сезона.
require('./shop');
try {
  const H2 = R.H;
  for (const [name, key] of [['gift.send', 'gift'], ['server.boost', 'boost'], ['season.claim', 'task']]) {
    const f = H2[name]; if (!f) continue;
    H2[name] = (c, p) => { const r = f(c, p); try { add(c.uid, key); } catch (e) { /* зачёт не должен мешать действию */ } return r; };
  }
} catch (e) { console.warn('[awards] зачёт не подключился:', e.message); }
// Победы в играх: карточный стол отмечает победу отдельно.
const cardsWin = R.H['apps.earn'];
if (cardsWin) R.H['apps.earn'] = (c, p) => { const r = cardsWin(c, p); try { if (p && p.what === 'win') add(c.uid, 'game'); } catch (e) { /* тихо */ } return r; };
