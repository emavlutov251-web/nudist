'use strict';
// «Нудист в купальнике» — карточный стол на 2–4 человека. В отличие от дуэлей, где считает клиент, здесь всё решает сервер:
// раздаёт карты, проверяет ход, сам выкидывает «пропусти ход» и объявляет победителя. Поэтому играть честно можно только через правила —
// подделать колоду или подсмотреть чужие карты нельзя даже при желании.
//
// Правила (одна колода, 108 карт как в «Уно», названия «по-нудистски»):
//   • ход по кругу; на верхнюю карту кладём такую же по цвету или по числу;
//   • «Солнце» — пропуск хода, «Волна» — обратный круг, «Нудист в купальнике» — следующий берёт две карты;
//   • «Голый король» — заказываем цвет; «Пляжный день» — берём четыре и заказываем цвет;
//   • нечем ходить — берёшь карту из колоды; подошла — можно сразу пойти;
//   • кто первым остался без карт — победил. За победу — листики (apps.earn).
// Живёт в памяти сервера вместе с лобби: стол закрылся — игра забыта, как и лобби.
const C = require('./core');
const R = require('./rpc');
const { db, now, need, str, fail } = C;
const H = R.H;

const COLORS = ['r', 'y', 'g', 'b'];            // красный, жёлтый, зелёный, синий — как в «Уно»
const KIND = { number: '', skip: 'skip', reverse: 'rev', draw2: 'd2', wild: 'w', wild4: 'w4' };
const MAXP = 4, TURN_MS = 45e3;                  // задумался дольше 45 секунд — ход переходит сам (иначе стол встаёт)

// ───── колода
function newDeck() {
  const d = [];
  for (const c of COLORS) {
    d.push({ c, k: 'n', v: 0 });
    for (let v = 1; v <= 9; v++) { d.push({ c, k: 'n', v }); d.push({ c, k: 'n', v }); }
    for (const k of ['skip', 'rev', 'draw2']) { d.push({ c, k }); d.push({ c, k }); }
  }
  for (let i = 0; i < 4; i++) { d.push({ c: '', k: 'wild' }); d.push({ c: '', k: 'wild4' }); }
  return d;
}
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const matches = (card, top, color) => card.k === 'wild' || card.k === 'wild4' || card.c === color || (card.k === 'n' && top.k === 'n' && card.v === top.v) || (card.k !== 'n' && card.k === top.k);
const view = (g, uid) => ({
  id: g.id, state: g.state, seats: g.seats, turn: g.turn, dir: g.dir, color: g.color,
  top: g.top, deck: g.deck.length, discard: g.discard.length,
  players: g.order.map(p => { const u = db.users[p] || {}; return { id: p, name: u.name || u.username || 'Игрок', color: u.color || 0, n: g.hand[p].length, said: !!g.said[p], out: !!g.out[p] }; }),
  hand: g.hand[uid] || [], log: g.log.slice(-6), winner: g.winner, endsAt: g.turnEnd,
  // какие карты сейчас можно положить: клиент подсвечивает, но решает всё равно сервер
  playable: (g.hand[uid] || []).map((c, i) => ({ i, ok: g.turn === uid && g.state === 'play' && matches(c, g.top, g.color) })),
});
const games = new Map(), byUser = new Map();
const emit = (uid, ev, d) => { if (C.isOnline(uid)) C.emit(uid, ev, d); };
const tell = g => { for (const p of g.order) emit(p, 'cards', view(g, p)); };
const get = (c, gid) => { const g = games.get(str(gid, 32)); need(g && g.hand[c.uid], 'Этот стол уже закрыт'); return g; };

function draw(g, uid, n) {
  const hand = g.hand[uid]; let took = 0;
  for (let k = 0; k < n; k++) {
    if (!g.deck.length) {      // колода кончилась — перетасовываем сброс, оставляя верхнюю карту
      if (g.discard.length <= 1) break;
      const top = g.discard.pop(); g.deck = shuffle(g.discard); g.discard = [top];
    }
    if (!g.deck.length) break;
    hand.push(g.deck.pop()); took++;
  }
  return took;
}
function nextSeat(g, step = 1) {
  const n = g.order.length; let i = g.order.indexOf(g.turn);
  for (let k = 0; k < n * 2; k++) { i = (i + step * g.dir + n) % n; if (!g.out[g.order[i]]) return g.order[i]; }
  return g.turn;
}
function beginTurn(g) {
  if (g.winner) return;
  g.turnEnd = now() + TURN_MS; g.drawnThisTurn = false;
  // если человек вышел и карты у него остались — его ход пропускаем
  const uid = g.turn; if (g.out[uid]) { g.turn = nextSeat(g); beginTurn(g); }
}
function finish(g, uid) {
  g.state = 'over'; g.winner = uid;
  const i = g.order.indexOf(uid); if (i >= 0) { g.out[uid] = true; g.hand[uid] = []; }
  g.log.push(`${(db.users[uid] || {}).name || 'Игрок'} остался без карт — победа!`);
  tell(g);
  for (const p of g.order) byUser.delete(p);
  setTimeout(() => { if (games.get(g.id) === g) { games.delete(g.id); for (const p of g.order) emit(p, 'cards.closed', { id: g.id }); } }, 60e3);
}
function sanitize(g, card) {
  const c = card || {};
  const k = Object.prototype.hasOwnProperty.call(KIND, c.k) ? c.k : 'n';
  const color = COLORS.includes(c.c) ? c.c : (k === 'wild' || k === 'wild4' ? '' : null);
  if (k === 'n') {
    const v = Math.floor(Number(c.v));
    if (!(v >= 0 && v <= 9) || !color) return null;
    return { c: color, k, v };
  }
  if (color === null) return null;
  return { c: color, k };
}

H['cards.new'] = (c, p) => {
  const u = db.users[c.uid], seats = Math.max(2, Math.min(MAXP, Math.floor(Number(p.seats) || 2)));
  const g = { id: C.id(), host: u.id, state: 'lobby', turn: null, dir: 1, color: '', top: null, deck: [], discard: [], hand: {}, said: {}, out: {}, order: [], log: [], winner: null, turnEnd: 0, drawnThisTurn: false, inv: {}, seats };
  g.hand[u.id] = []; g.order.push(u.id);
  games.set(g.id, g); byUser.set(u.id, g.id);
  return view(g, u.id);
};
H['cards.join'] = (c, p) => {
  const g = games.get(str(p.id, 32)); need(g, 'Стол уже закрыт'); need(g.inv[c.uid] || g.order.includes(c.uid), 'За этот стол вас не звали');
  if (!g.order.includes(c.uid)) {
    need(g.state === 'lobby', 'Партия уже началась'); need(g.order.length < g.seats, 'Мест за столом нет');
    g.order.push(c.uid); g.hand[c.uid] = []; byUser.set(c.uid, g.id);
    g.log.push(`${(db.users[c.uid] || {}).name || 'Игрок'} сел за стол`);
  }
  tell(g); return view(g, c.uid);
};
H['cards.invite'] = (c, p) => {
  const g = get(c, p.id), u = db.users[c.uid], o = db.users[str(p.to, 32)];
  need(g.state === 'lobby', 'Партия уже идёт — позовите в следующий раз');
  need(o && !o.deleted && !o.bot && o.id !== u.id, 'Позвать можно только живого человека, и не себя');
  need(!g.order.includes(o.id), 'Этот человек уже за столом'); need(g.order.length < g.seats, 'Мест за столом нет');
  g.inv[o.id] = now();
  const ch = C.openDm(u.id, o.id);
  const msg = C.postMessage(ch, u.id, { text: `🃏 Зову за карточный стол «Нудист в купальнике». Мест: ${g.order.length} из ${g.seats}.`, cards: { id: g.id } });
  emit(o.id, 'cards.invite', { id: g.id, from: u.id, fromName: u.name, seats: g.seats, n: g.order.length, chat: ch.id, mid: msg.id });
  tell(g); return view(g, c.uid);
};
// Ограничение частоты на стол: обычная игра укладывается в 120 запросов за 10 секунд с запасом,
// а «скрипт», который щёлкает картами, упрётся. Общий лимит соединения (80 запросов за всё время) для стола не годится.
const RATE = new Map();      // uid → { t, n }
const rate = uid => {
  const t = now(), r = RATE.get(uid);
  if (!r || t - r.t > 10e3) { RATE.set(uid, { t, n: 1 }); return; }
  if (++r.n > 120) fail('Слишком быстро для карточного стола');
};
H['cards.get'] = (c, p) => { rate(c.uid); return view(get(c, p.id || byUser.get(c.uid)), c.uid); };
H['cards.start'] = (c, p) => {
  const g = get(c, p.id || byUser.get(c.uid)); need(g.host === c.uid, 'Начинает хозяин стола');
  need(g.state === 'lobby', 'Партия уже идёт'); need(g.order.length >= 2, 'За столом должен быть хотя бы ещё один человек');
  g.deck = shuffle(newDeck());
  for (const uid of g.order) { g.hand[uid] = g.deck.splice(-7); g.said[uid] = false; g.out[uid] = false; }
  // первая карта — не «дикая» и не «возьми две»: иначе партия начинается с неудобства
  let first = g.deck.pop(); while (first && (first.k === 'wild' || first.k === 'wild4')) { g.deck.unshift(first); first = g.deck.pop(); }
  g.discard = [first]; g.top = first; g.color = first.c; g.dir = 1; g.turn = g.order[0]; g.state = 'play'; g.log = ['Партия началась'];
  if (first.k === 'skip') g.turn = nextSeat(g);
  else if (first.k === 'rev') g.dir = -1;
  beginTurn(g);
  tell(g); return view(g, c.uid);
};
H['cards.play'] = (c, p) => {
  rate(c.uid);
  const g = get(c, p.id || byUser.get(c.uid));
  need(g.state === 'play', 'Партия не идёт'); need(g.turn === c.uid, 'Сейчас не ваш ход');
  const hand = g.hand[c.uid], i = Math.floor(Number(p.i));
  need(Number.isInteger(i) && i >= 0 && i < hand.length, 'Такой карты нет в руке');
  const card = hand[i]; need(matches(card, g.top, g.color), 'Эту карту сюда не положить: нужен тот же цвет или число');
  hand.splice(i, 1); g.discard.push(card); g.top = card;
  const name = (db.users[c.uid] || {}).name || 'Игрок';
  if (card.k === 'wild' || card.k === 'wild4') {
    const want = COLORS.includes(str(p.color, 1)) ? str(p.color, 1) : COLORS[Math.floor(Math.random() * 4)];
    g.color = want; g.log.push(`${name}: «${card.k === 'wild4' ? 'Пляжный день' : 'Голый король'}» → цвет ${({ r: 'красный', y: 'жёлтый', g: 'зелёный', b: 'синий' })[want]}`);
  } else g.color = card.c;
  // «возьми две/четыре» и пропуск хода отрабатывает сервер, а не клиент
  const victim = nextSeat(g);
  if (card.k === 'draw2') { draw(g, victim, 2); g.log.push(`«Нудист в купальнике»: ${(db.users[victim] || {}).name || 'игрок'} берёт две карты`); }
  if (card.k === 'wild4') { draw(g, victim, 4); g.log.push(`«Пляжный день»: ${(db.users[victim] || {}).name || 'игрок'} берёт четыре`); }
  if (card.k === 'rev') g.dir = -g.dir;
  const skip = card.k === 'skip' || card.k === 'draw2' || card.k === 'wild4' || card.k === 'rev' ? (card.k === 'rev' && g.order.length === 2 ? g.turn : victim) : null;
  if (hand.length === 0) { finish(g, c.uid); return view(g, c.uid); }
  g.said[c.uid] = hand.length !== 1 ? false : !!p.said;      // осталась одна карта — «Нудист!» иначе штраф
  if (hand.length === 1 && !g.said[c.uid]) { draw(g, c.uid, 1); g.log.push(`${name} забыл сказать «Нудист!» — берёт карту`); }
  g.turn = skip || nextSeat(g);
  g.drawnThisTurn = false; beginTurn(g); tell(g); return view(g, c.uid);
};
H['cards.draw'] = (c, p) => {
  rate(c.uid);
  const g = get(c, p.id || byUser.get(c.uid));
  need(g.state === 'play', 'Партия не идёт'); need(g.turn === c.uid, 'Сейчас не ваш ход');
  const hand = g.hand[c.uid];
  need(!g.drawnThisTurn, 'Одну карту за ход хватает');
  const took = draw(g, c.uid, 1); g.drawnThisTurn = true;
  const card = hand[hand.length - 1];
  g.log.push(`${(db.users[c.uid] || {}).name || 'Игрок'} берёт карту из колоды`);
  if (!took || !card || !matches(card, g.top, g.color)) { g.drawnThisTurn = false; g.turn = nextSeat(g); beginTurn(g); }
  tell(g); return view(g, c.uid);
};
H['cards.say'] = (c, p) => {      // «Нудист!» — объявил, что карта последняя: без этого штраф
  const g = get(c, p.id || byUser.get(c.uid));
  if (g.hand[c.uid] && g.hand[c.uid].length === 1) { g.said[c.uid] = true; tell(g); }
  return { ok: true };
};
H['cards.leave'] = (c, p) => {
  const g = games.get(str(p.id, 32) || byUser.get(c.uid)); if (!g || !g.hand[c.uid]) return { ok: true };
  g.out[c.uid] = true; byUser.delete(c.uid);
  g.log.push(`${(db.users[c.uid] || {}).name || 'Игрок'} вышел из-за стола`);
  if (g.state === 'play') {
    const left = g.order.filter(u => !g.out[u]);
    if (left.length <= 1) finish(g, left[0] || null);
    else if (g.turn === c.uid) { g.turn = nextSeat(g); beginTurn(g); }
  } else {
    g.order = g.order.filter(u => u !== c.uid);
    if (!g.order.length) { games.delete(g.id); return { ok: true }; }
    if (g.host === c.uid) g.host = g.order[0];
  }
  tell(g); return { ok: true };
};

// Ход не должен «висеть»: если человек закрыл приложение, через 45 секунд ход перейдёт дальше.
setInterval(() => {
  const t = now();
  for (const g of [...games.values()]) {
    if (g.state !== 'play' || !g.turnEnd || t <= g.turnEnd) continue;
    const uid = g.turn;
    g.log.push(`${(db.users[uid] || {}).name || 'Игрок'} не успел — ход перешёл дальше`);
    g.turn = nextSeat(g); g.turnEnd = t + TURN_MS;
    tell(g);
  }
}, 5000).unref();

module.exports = { games, MAXP };
