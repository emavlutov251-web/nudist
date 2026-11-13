'use strict';
// Подарки, как в Telegram: покупаются за листики, приходят карточкой в личку и остаются в профиле получателя.
// Получатель может спрятать подарок из профиля или продать его обратно за часть цены.
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
];
const BY = new Map(GIFTS.map(g => [g.id, g])), SELL = 0.8, KEEP = 300;      // продать можно за 80% цены; в профиле хранится не больше 300 подарков
const sellPrice = g => Math.floor(g.price * SELL);
const ofUser = uid => Object.values(db.gifts).filter(x => x.to === uid).sort((a, b) => b.ts - a.ts);
// Что видит зритель: скрытые подарки — только хозяин; имя анонимного дарителя — только хозяин и сам даритель.
function view(x, vid) {
  const g = BY.get(x.g) || { e: '🎁', name: 'Подарок', price: 0 }, mine = x.to === vid, showFrom = !x.anon || mine || x.from === vid;
  return { id: x.id, g: x.g, e: g.e, name: g.name, price: g.price, sell: mine ? sellPrice(g) : undefined, to: x.to, from: showFrom ? x.from : undefined, anon: x.anon || undefined, hidden: x.hidden || undefined, ts: x.ts, text: x.text };
}
H['gift.catalog'] = () => ({ gifts: GIFTS, sell: SELL });
H['gift.send'] = (c, p) => {
  const u = db.users[c.uid], o = db.users[typeof p.to === 'string' ? p.to : '']; need(o && !o.deleted, 'Пользователь не найден');
  const g = BY.get(str(p.gift, 24)); need(g, 'Такого подарка на витрине нет');
  R.giveCheck(u, o);
  need(ofUser(o.id).length < KEEP, 'У этого человека уже целый склад подарков. Больше не помещается.');
  A.limit('gift:' + u.id, 12, 60000);
  const text = str(p.text, 120).replace(/\s+/g, ' ');
  R.spend(u, g.price, 'Листики копятся в «Листопаде» и ежедневным бонусом.');
  const x = { id: id(), g: g.id, from: u.id, to: o.id, ts: now(), text: text || undefined, anon: !!p.anon || undefined };
  db.gifts[x.id] = x; save(); R.selfUpdate(u);
  const ch = C.openDm(u.id, o.id);
  const m = C.postMessage(ch, u.id, { type: 'service', text: `подарил(а) подарок: ${g.e} ${g.name}`, present: { id: x.id, g: g.id, e: g.e, name: g.name, price: g.price }, note: text }, { quiet: true });
  if (!C.isOnline(o.id)) { try { require('./push').notify(o.id, { title: R.uname(u), body: `Дарит вам подарок: ${g.e} ${g.name}${text ? ' — ' + text : ''}`.slice(0, 140), tag: ch.id, url: '/' }); } catch (e) { console.error('[push]', e.message); } }
  return { id: x.id, stars: u.stars, chat: ch.id, msg: m.id };
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
  delete db.gifts[x.id]; u.stars = (u.stars || 0) + n; save(); R.selfUpdate(u);
  return { n, stars: u.stars };
};
// Удалили аккаунт — его витрина подарков исчезает; подарки, которые он дарил другим, остаются у них.
C.hooks.userGone.push(u => { let n = 0; for (const k of Object.keys(db.gifts)) if (db.gifts[k].to === u.id) { delete db.gifts[k]; n++; } if (n) save(); });

module.exports = { GIFTS };
