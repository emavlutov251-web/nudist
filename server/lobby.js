'use strict';
// Лобби: играть с другом одновременно, а не по очереди.
// Хозяин выбирает игру и зовёт человека; тот входит из приглашения, оба жмут «Готов» — партия стартует у обоих сразу.
// «Пивная битва» — настоящий поединок за одним столом (ходы пересылаются через lobby.msg). В остальных играх у каждого своё поле,
// старт общий, счёт соперника виден вживую, побеждает тот, у кого больше. После партии оба остаются в лобби: «Готов» — и новый раунд.
// Лобби живёт в памяти сервера: после перезапуска его нет, приглашение в чате помечается закрытым. Результаты сообщает браузер,
// проверить их сервер не может, поэтому на кону только честь — листиков за победу в лобби нет.
const C = require('./core');
const R = require('./rpc');
const A = require('./auth');
const Hub = require('./hub');
const Perks = require('./perks');
const { db, now, need, str, id } = C;
const H = R.H;

// Игры лобби: потолок очков (как в дуэлях) и предел раунда в секундах. pvp — общий стол; остальные — гонка за счётом.
const GAMES = {
  beer: { cap: 600, pvp: true, how: 'Настоящий поединок за одним столом: оба выбирают ход, потом открываются.' },
  royale: { cap: 240, how: 'Старт одновременно, у каждого своя баня. Больше бананов — победа.' },
  catch: { cap: 300, how: 'Старт одновременно, у каждого своё поле. Счёт соперника виден вживую.' },
  run: { cap: 300, how: 'Старт одновременно, у каждого своя дорожка. Счёт соперника виден вживую.' },
  shooter: { cap: 300, how: 'Старт одновременно, у каждого свой пляж. Кто пройдёт больше волн.' },
  pairs: { cap: 240, how: 'Одинаковая раскладка у обоих. Кто соберёт все пары за меньшее число ходов.' },
  g2048: { cap: 180, how: 'Одинаковое начало у обоих, три минуты. У кого счёт больше.' },
};
const game = a => { const g = GAMES[a], d = Hub.DUELS[a], app = (Hub.APPS || []).find(x => x.id === a); return g && d && app ? { id: a, name: d.name, e: d.e, unit: d.unit, max: d.max, url: app.url, ...g } : null; };
const gamesView = () => Object.keys(GAMES).map(game).filter(Boolean).map(g => ({ id: g.id, name: g.name, e: g.e, unit: g.unit, url: g.url, cap: g.cap, pvp: !!g.pvp, how: g.how }));

const MAXP = 2, COUNTDOWN = 4000, OFF_MS = Number(process.env.LOBBY_OFF_MS) || 40e3, IDLE_MS = 30 * 60e3;
const CAP_S = Number(process.env.LOBBY_CAP_S) || 0;      // для проверок: общий предел раунда в секундах вместо своего у каждой игры
const lobbies = new Map(), byUser = new Map();      // id → лобби; человек → id лобби, где он сейчас
const emit = (uid, ev, d) => { if (C.isOnline(uid)) C.emit(uid, ev, d); };
const view = L => ({ id: L.id, app: L.app, host: L.host, state: L.state, round: L.round, startAt: L.startAt, endAt: L.endAt, seed: L.seed, now: now(),
  players: [...L.players.values()].map(p => ({ id: p.id, ready: p.ready, score: p.score, done: p.done, wins: p.wins, online: C.isOnline(p.id) })),
  invited: Object.keys(L.inv).filter(i => !L.players.has(i)), last: L.last,
  users: Object.fromEntries([...L.players.keys(), ...Object.keys(L.inv)].map(i => db.users[i]).filter(Boolean).map(u => [u.id, { id: u.id, name: u.name, last: u.last, username: u.username, avatar: u.avatar, color: u.color }])) });
const tell = L => { L.ts = now(); for (const p of L.players.keys()) emit(p, 'lobby', view(L)); };
const get = (c, lid) => { const L = lobbies.get(str(lid, 32)); need(L && L.players.has(c.uid), 'Лобби уже закрыто'); return L; };

// Приглашение в чате остаётся навсегда, а лобби — нет: закрытое лобби помечаем на карточке, чтобы кнопка «Войти» не вела в пустоту.
function markOver(chatId, mid, lid) { const ch = db.chats[chatId], m = ch && C.findMsg(chatId, mid); if (m && m.lobby && m.lobby.id === lid && !m.lobby.over) { m.lobby = { ...m.lobby, over: true }; C.updateMsg(ch, m); } }
function close(L, why) {
  lobbies.delete(L.id);
  for (const k of L.cards) markOver(k.chat, k.mid, L.id);
  for (const p of [...L.players.keys(), ...Object.keys(L.inv)]) { if (byUser.get(p) === L.id) byUser.delete(p); emit(p, 'lobby.closed', { id: L.id, why: why || '' }); }
}
function finish(L, why) {      // раунд окончен: считаем победителя и возвращаем всех в лобби
  if (L.state !== 'play') return;
  const ps = [...L.players.values()], scores = Object.fromEntries(ps.map(p => [p.id, p.score || 0]));
  let win = null; if (!why || why === 'time') { const top = Math.max(...ps.map(p => p.score || 0)), best = ps.filter(p => (p.score || 0) === top); if (best.length === 1 && ps.length > 1) { win = best[0].id; best[0].wins++; } }
  L.last = { round: L.round, app: L.app, scores, win, why: why || '' };
  L.state = 'idle'; L.startAt = L.endAt = 0; for (const p of ps) { p.ready = false; p.done = false; }
  tell(L);
}
function leave(uid, why) {
  const L = lobbies.get(byUser.get(uid)); byUser.delete(uid); if (!L || !L.players.has(uid)) return;
  if (L.state === 'play') { L.players.get(uid).score = 0; finish(L, 'left'); }
  L.players.delete(uid);
  if (!L.players.size) return close(L, why);
  if (L.host === uid) L.host = L.players.keys().next().value;
  if (L.last && L.last.why === 'left') L.last.left = uid;
  for (const p of L.players.values()) p.ready = false;
  tell(L);
}
function start(L) {
  const g = game(L.app);
  for (const p of L.players.values()) { Perks.use(db.users[p.id], L.app); p.score = 0; p.done = false; }      // раунд стоит единицу энергии, как обычный запуск игры
  L.state = 'play'; L.round++; L.startAt = now() + COUNTDOWN; L.endAt = L.startAt + (CAP_S || g.cap) * 1000; L.seed = g.pvp ? 0 : 1 + Math.floor(Math.random() * 2147483000);
  tell(L);
}

H['lobby.games'] = () => ({ games: gamesView() });
H['lobby.new'] = (c, p) => {
  const u = db.users[c.uid], g = game(str(p.app, 16)) || game('beer'); need(g, 'Игры для лобби сейчас недоступны');
  A.limit('lobby:' + u.id, 40, 3600e3);
  leave(u.id);
  const L = { id: id(), app: g.id, host: u.id, state: 'idle', round: 0, startAt: 0, endAt: 0, seed: 0, players: new Map(), inv: {}, cards: [], last: null, ts: now() };
  L.players.set(u.id, { id: u.id, ready: false, score: 0, done: false, wins: 0, off: 0 });
  lobbies.set(L.id, L); byUser.set(u.id, L.id);
  return view(L);
};
H['lobby.get'] = (c, p) => view(get(c, p.id));
H['lobby.invite'] = (c, p) => {
  const L = get(c, p.id), u = db.users[c.uid], g = game(L.app);
  const o = db.users[str(p.to, 32)]; need(o && !o.deleted && !o.bot && o.id !== u.id, 'Позвать можно только живого человека, и не себя');
  need(!L.players.has(o.id), 'Этот человек уже в лобби'); need(L.players.size < MAXP, 'В лобби уже двое. Больше стол не вмещает.');
  need(!L.inv[o.id] || now() - L.inv[o.id] > 20e3, 'Приглашение уже отправлено. Дайте человеку пару секунд.');
  A.limit('lobbyinv:' + u.id, 40, 3600e3);
  const ch = C.openDm(u.id, o.id); R.checkSend(c, ch, { type: 'text' });
  const m = C.postMessage(ch, u.id, { text: `🎮 Зову в игру «${g.name}». Заходи в лобби — сыграем вместе!`, lobby: { id: L.id, app: g.id, name: g.name, e: g.e } });
  L.inv[o.id] = now(); L.cards.push({ chat: ch.id, mid: m.id }); if (L.cards.length > 20) L.cards.shift();
  emit(o.id, 'lobby.invite', { id: L.id, app: g.id, name: g.name, e: g.e, from: u.id, fromName: u.name, chat: ch.id, mid: m.id, at: now() });
  tell(L);
  return view(L);
};
H['lobby.join'] = (c, p) => {
  const lid = str(p.id, 32), L = lobbies.get(lid);
  if (!L) { if (p.chat && p.mid) { const ch = db.chats[str(p.chat, 60)]; if (ch && C.isMember(ch, c.uid)) markOver(ch.id, str(p.mid, 32), lid); } need(false, 'Это лобби уже закрыто. Позовите друга заново.'); }
  if (L.players.has(c.uid)) return view(L);
  need(L.inv[c.uid], 'В это лобби вас не звали'); need(L.players.size < MAXP, 'В лобби уже двое');
  leave(c.uid);
  L.players.set(c.uid, { id: c.uid, ready: false, score: 0, done: false, wins: 0, off: 0 }); byUser.set(c.uid, L.id);
  tell(L);
  return view(L);
};
H['lobby.leave'] = c => { leave(c.uid); return { ok: true }; };
H['lobby.set'] = (c, p) => {
  const L = get(c, p.id); need(L.host === c.uid, 'Игру выбирает хозяин лобби'); need(L.state === 'idle', 'Сначала доиграйте раунд');
  const g = game(str(p.app, 16)); need(g, 'Такой игры в лобби нет');
  if (L.app !== g.id) { L.app = g.id; for (const q of L.players.values()) q.ready = false; }
  tell(L); return view(L);
};
H['lobby.ready'] = (c, p) => {
  const L = get(c, p.id), me = L.players.get(c.uid); need(L.state === 'idle', 'Раунд уже идёт');
  if (p.on !== false && !Perks.has(db.users[c.uid], L.app)) return { energy: false, ...view(L) };      // не ошибка: окно само предложит подождать или восполнить
  me.ready = p.on !== false;
  if (L.players.size >= 2 && [...L.players.values()].every(q => q.ready)) start(L); else tell(L);
  return view(L);
};
H['lobby.score'] = (c, p) => {
  const L = get(c, p.id), me = L.players.get(c.uid); if (L.state !== 'play' || me.done) return;
  const g = game(L.app), n = Math.max(0, Math.min(g.max, Math.floor(Number(p.n) || 0))); if (n === me.score) return;
  me.score = n; for (const q of L.players.keys()) if (q !== c.uid) emit(q, 'lobby.score', { id: L.id, u: c.uid, n });
};
H['lobby.done'] = (c, p) => {
  const L = get(c, p.id), me = L.players.get(c.uid); if (L.state !== 'play' || me.done) return view(L);
  const g = game(L.app); me.score = Math.max(0, Math.min(g.max, Math.floor(Number(p.n) || 0))); me.done = true;
  if (g.pvp && p.quit) { me.score = 0; for (const q of L.players.values()) q.done = true; }      /* общий стол: один встал — партия окончена для обоих, вставший проиграл */
  if ([...L.players.values()].every(q => q.done)) finish(L); else tell(L);
  return view(L);
};
// Ходы в общей партии («Пивная битва»): сервер только пересылает их сопернику.
H['lobby.msg'] = (c, p) => {
  const L = get(c, p.id); if (L.state !== 'play') return;
  let s; try { s = JSON.stringify(p.d); } catch (e) { s = ''; } need(s && s.length <= 600, 'Слишком длинный ход');
  for (const q of L.players.keys()) if (q !== c.uid) emit(q, 'lobby.msg', { id: L.id, from: c.uid, d: JSON.parse(s) });
};

// Раз в несколько секунд: время раунда вышло — подводим итог по текущему счёту; пропал из сети дольше 40 секунд — вышел; пустые и забытые лобби закрываются.
setInterval(() => {
  const t = now();
  for (const L of [...lobbies.values()]) {
    if (L.state === 'play' && t > L.endAt + 3000) finish(L, 'time');
    for (const p of [...L.players.values()]) { if (C.isOnline(p.id) && db.users[p.id] && !db.users[p.id].deleted) p.off = 0; else if (!p.off) p.off = t; else if (t - p.off > OFF_MS) leave(p.id, 'offline'); }
    if (lobbies.has(L.id) && L.state === 'idle' && t - L.ts > IDLE_MS) close(L, 'idle');
  }
}, CAP_S ? 1000 : 4000).unref();

module.exports = { lobbies, GAMES };
