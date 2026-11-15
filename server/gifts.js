'use strict';
// Подарки, как в Telegram: покупаются за листики, приходят карточкой в личку и остаются в профиле получателя.
// Получатель может спрятать подарок из профиля или продать его обратно за часть цены.
// Лимитированные подарки выпускаются тиражом на всё приложение, у каждого свой номер; обратно в магазин они не продаются — только другим людям на рынке.
const C = require('./core');
const R = require('./rpc');
const A = require('./auth');
const { db, save, now, id, need, str, pubUser } = C;
const H = R.H;

db.gifts = db.gifts || {};        // id → { id, g, from, to, ts, text, anon, hidden }
const GIFTS = [
  { id: 'leaf', e: '🍃', name: 'Фиговый листок', price: 10 }, { id: 'duck', e: '🦆', name: 'Уточка', price: 15 }, { id: 'bear', e: '🧸', name: 'Мишка', price: 15 }, { id: 'heart', e: '💝', name: 'Сердце', price: 15 },
  { id: 'rose', e: '🌹', name: 'Роза', price: 25 }, { id: 'box', e: '🎁', name: 'Сюрприз', price: 25 }, { id: 'trunks', e: '🩲', name: 'Плавки на всякий случай', price: 30 }, { id: 'pineapple', e: '🍍', name: 'Ананас', price: 40 },
  { id: 'cake', e: '🎂', name: 'Торт', price: 50 }, { id: 'bouquet', e: '💐', name: 'Букет', price: 50 }, { id: 'rocket', e: '🚀', name: 'Ракета', price: 50 }, { id: 'beach', e: '🏖️', name: 'Путёвка на пляж', price: 75 },
  { id: 'cup', e: '🏆', name: 'Кубок', price: 100 }, { id: 'ring', e: '💍', name: 'Кольцо', price: 100 }, { id: 'gem', e: '💎', name: 'Алмаз', price: 150 }, { id: 'crown', e: '👑', name: 'Корона', price: 250 },
  { id: 'shell', e: '🐚', name: 'Ракушка', price: 20 }, { id: 'icecream', e: '🍦', name: 'Мороженое', price: 20 }, { id: 'shades', e: '🕶️', name: 'Тёмные очки', price: 60 }, { id: 'coconut', e: '🥥', name: 'Кокос', price: 80 },
  { id: 'cocktail', e: '🍹', name: 'Коктейль', price: 300 }, { id: 'palm', e: '🌴', name: 'Пальма', price: 500 }, { id: 'umbrella', e: '⛱️', name: 'Зонтик', price: 800 }, { id: 'surf', e: '🏄', name: 'Сёрф', price: 1500 },
  { id: 'yacht', e: '🛥️', name: 'Яхта', price: 5000 }, { id: 'nudiamond', e: '💠', name: 'Алмаз нудиста', price: 10000 },
  // лимитированные: тираж на всё приложение, больше не выпускаются
  { id: 'sunset', e: '🌅', name: 'Редкий закат', price: 30000, lim: 100 }, { id: 'aurora', e: '🌌', name: 'Северное сияние', price: 75000, lim: 50 }, { id: 'unicorn', e: '🦄', name: 'Единорог пляжа', price: 200000, lim: 10 },
];
const FEE = 10, MIN_ASK = 30;      // рынок: комиссия с продажи и нижняя граница цены, % от цены выпуска
const issued = gid => ((db.meta.editions || {})[gid] || 0), left = g => (g.lim ? Math.max(0, g.lim - issued(g.id)) : undefined);
const BY = new Map(GIFTS.map(g => [g.id, g])), SELL = 0.8, KEEP = 300;      // продать можно за 80% цены; в профиле хранится не больше 300 подарков
const sellPrice = g => Math.floor(g.price * SELL);
const ofUser = uid => Object.values(db.gifts).filter(x => x.to === uid).sort((a, b) => b.ts - a.ts);
// Что видит зритель: скрытые подарки — только хозяин; имя анонимного дарителя — только хозяин и сам даритель.
function view(x, vid) {
  const g = BY.get(x.g) || { e: '🎁', name: 'Подарок', price: 0 }, mine = x.to === vid, showFrom = !x.anon || mine || x.from === vid;
  return { id: x.id, g: x.g, e: g.e, name: g.name, price: g.price, sell: mine && !g.lim ? sellPrice(g) : undefined, no: x.no, lim: g.lim, ask: x.ask, to: x.to, from: showFrom ? x.from : undefined, anon: x.anon || undefined, hidden: x.hidden || undefined, ts: x.ts, text: x.text };
}
H['gift.catalog'] = () => ({ gifts: GIFTS.map(g => (g.lim ? { ...g, left: left(g) } : g)), sell: SELL, fee: FEE, minAsk: MIN_ASK });
H['gift.send'] = (c, p) => {
  const u = db.users[c.uid], o = db.users[typeof p.to === 'string' ? p.to : '']; need(o && !o.deleted, 'Пользователь не найден');
  const g = BY.get(str(p.gift, 24)); need(g, 'Такого подарка на витрине нет');
  const self = o.id === u.id; need(!self || g.lim, 'Себе дарить — это просто перекладывание');      // себе можно взять только лимитированный, в коллекцию
  if (!self) R.giveCheck(u, o); else need(db.flags.stars, 'Листики временно отключены');
  need(!g.lim || left(g) > 0, 'Тираж разошёлся. Теперь этот подарок можно купить только на рынке, у владельцев.');
  need(ofUser(o.id).length < KEEP, 'У этого человека уже целый склад подарков. Больше не помещается.');
  A.limit('gift:' + u.id, 12, 60000);
  const text = str(p.text, 120).replace(/\s+/g, ' ');
  R.spend(u, g.price, 'Листики копятся в «Листопаде» и ежедневным бонусом.');
  const x = { id: id(), g: g.id, from: u.id, to: o.id, ts: now(), text: text || undefined, anon: !!p.anon || undefined };
  if (g.lim) { db.meta.editions = db.meta.editions || {}; x.no = db.meta.editions[g.id] = issued(g.id) + 1; }
  db.gifts[x.id] = x; save(); R.selfUpdate(u);
  if (self) return { id: x.id, stars: u.stars, no: x.no };
  const ch = C.openDm(u.id, o.id);
  const m = C.postMessage(ch, u.id, { type: 'service', text: `подарил(а) подарок: ${g.e} ${g.name}${x.no ? ` № ${x.no} из ${g.lim}` : ''}`, present: { id: x.id, g: g.id, e: g.e, name: g.name, price: g.price, no: x.no, lim: g.lim }, note: text }, { quiet: true });
  try { require('./push').notify(o.id, { title: R.uname(u), body: `Дарит вам подарок: ${g.e} ${g.name}${text ? ' — ' + text : ''}`.slice(0, 140), tag: ch.id, url: '/' }, C.isOnline(o.id)); } catch (e) { console.error('[push]', e.message); }
  return { id: x.id, stars: u.stars, chat: ch.id, msg: m.id, no: x.no };
};
H['gift.list'] = (c, p) => {
  const o = db.users[typeof p.user === 'string' ? p.user : c.uid]; need(o && !o.deleted, 'Пользователь не найден');
  const mine = o.id === c.uid, all = ofUser(o.id), list = (mine ? all : all.filter(x => !x.hidden)).map(x => view(x, c.uid)), users = {};
  for (const x of list) if (x.from && db.users[x.from]) users[x.from] = pubUser(db.users[x.from], c.uid);
  return { gifts: list.slice(0, KEEP), total: list.length, users };
};
const own = (c, p) => { const x = db.gifts[typeof p.id === 'string' ? p.id : '']; need(x && x.to === c.uid, 'Подарок не найден'); return x; };
H['gift.hide'] = (c, p) => { const x = own(c, p); x.hidden = p.on === false ? undefined : true; save(); return view(x, c.uid); };
H['gift.sell'] = (c, p) => {
  const x = own(c, p), g = BY.get(x.g), n = g ? sellPrice(g) : 0, u = db.users[c.uid];
  need(!(g && g.lim), 'Лимитированный подарок в магазин не сдаётся. Его можно выставить на рынок.');
  delete db.gifts[x.id]; u.stars = (u.stars || 0) + n; save(); R.selfUpdate(u);
  return { n, stars: u.stars };
};
// Удалили аккаунт — его витрина подарков исчезает; подарки, которые он дарил другим, остаются у них.
C.hooks.userGone.push(u => { let n = 0; for (const k of Object.keys(db.gifts)) if (db.gifts[k].to === u.id) { delete db.gifts[k]; n++; } if (n) save(); });

// ───── рынок лимитированных подарков: владелец назначает цену, покупатель платит, 10 % листиков сгорает как комиссия
H['gift.offer'] = (c, p) => {
  const x = own(c, p), g = BY.get(x.g); need(g && g.lim, 'На рынок выставляются только лимитированные подарки');
  const price = Math.floor(Number(p.price) || 0);
  if (price <= 0) { delete x.ask; save(); return view(x, c.uid); }
  const min = Math.ceil(g.price * MIN_ASK / 100); need(price >= min, `Цена не ниже ${min} 🍃 — это ${MIN_ASK} % от цены выпуска`); need(price <= 1e8, 'Слишком дорого даже для единорога');
  x.ask = price; x.hidden = undefined; save(); return view(x, c.uid);
};
H['gift.market'] = c => {
  const list = Object.values(db.gifts).filter(x => x.ask && BY.get(x.g) && db.users[x.to] && !db.users[x.to].banned).sort((a, b) => a.ask - b.ask).slice(0, 100), users = {};
  for (const x of list) users[x.to] = pubUser(db.users[x.to], c.uid);
  return { list: list.map(x => view(x, c.uid)), users, fee: FEE, editions: GIFTS.filter(g => g.lim).map(g => ({ id: g.id, e: g.e, name: g.name, price: g.price, lim: g.lim, left: left(g) })) };
};
H['gift.buy'] = (c, p) => {
  const x = db.gifts[typeof p.id === 'string' ? p.id : ''], b = db.users[c.uid]; need(x && x.ask, 'Этот подарок уже продан или снят с продажи');
  const s = db.users[x.to], g = BY.get(x.g); need(s && g, 'Подарок не найден'); need(s.id !== b.id, 'Это и так ваш подарок'); need(db.flags.stars, 'Листики временно отключены'); need(!s.banned, 'Продавец заблокирован');
  need(ofUser(b.id).length < KEEP, 'У вас уже целый склад подарков. Больше не помещается.');
  A.limit('giftbuy:' + b.id, 10, 60000);
  const price = x.ask; need(!p.price || Number(p.price) === price, 'Цена изменилась. Обновите рынок.');
  R.spend(b, price, 'Листики можно накопить или докупить в магазине.');
  const fee = Math.ceil(price * FEE / 100), got = price - fee;
  s.stars = (s.stars || 0) + got;
  x.from = s.id; x.to = b.id; x.ts = now(); x.sold = (x.sold || 0) + 1; delete x.ask; delete x.text; delete x.anon; delete x.hidden;
  save(); R.selfUpdate(b); R.selfUpdate(s);
  try { const sys = db.meta.sys; if (sys && db.users[sys]) C.postMessage(C.openDm(sys, s.id), sys, { text: `🛒 **Подарок продан: ${g.e} ${g.name} № ${x.no} из ${g.lim}.**\nПокупатель заплатил ${price} 🍃, вам зачислено ${got} 🍃 (комиссия рынка ${FEE} %).` }, { quiet: true }); } catch (e) { console.warn('[gift]', e.message); }
  return { gift: view(x, b.id), price, fee, stars: b.stars };
};

module.exports = { GIFTS, FEE };
