'use strict';
// Магазин: украшения за листики, тарифы подписки Plus / Pro / Max, наборы, пробный период, сезон с заданиями, кэшбэк за друзей.
// За рубли продаются только тарифы и наборы листиков — этим занимается server/pay.js, сюда он приходит за составом и выдачей.
// Здесь нет ничего, чего сервер не умеет на самом деле: каждая строка в perks тарифа проверяется кодом ниже или в rpc.js.
const C = require('./core');
const R = require('./rpc');
const A = require('./auth');
require('./gifts'); require('./guild');      // их обработчики оборачиваются ниже — они должны быть уже загружены
const { db, save, now, need, str } = C;
const H = R.H;

// ───── украшения. tier — редкость: от неё зависит, в какой тариф вещь входит бесплатно.
const CATALOG = {
  // рамка вокруг аватара — видна всем
  frame_leaf: { kind: 'frame', name: 'Листок', emoji: '🍃', price: 500, tier: 'common' },
  frame_sun: { kind: 'frame', name: 'Солнце', emoji: '☀️', price: 800, tier: 'common' },
  frame_fire: { kind: 'frame', name: 'Пламя', emoji: '🔥', price: 1500, tier: 'rare' },
  frame_galaxy: { kind: 'frame', name: 'Галактика', emoji: '🌌', price: 3000, tier: 'epic' },
  frame_crown: { kind: 'frame', name: 'Корона', emoji: '👑', price: 8000, tier: 'legendary' },
  // цвет имени — виден всем
  grad_sunset: { kind: 'gradient', name: 'Закат', emoji: '🌇', price: 300, tier: 'common', colors: ['#FF8A00', '#E52E71'] },
  grad_ocean: { kind: 'gradient', name: 'Океан', emoji: '🌊', price: 300, tier: 'common', colors: ['#2196F3', '#00C2D7'] },
  grad_rainbow: { kind: 'gradient', name: 'Радуга', emoji: '🌈', price: 2500, tier: 'epic', colors: ['#FF0044', '#FF8800', '#E0B000', '#00B044', '#0088FF', '#8800FF'] },
  grad_aurora: { kind: 'gradient', name: 'Полярное сияние', emoji: '🌌', price: 4000, tier: 'epic', colors: ['#00C878', '#00B4E6', '#A066FF'] },
  // эффект при отправке сообщения — видят собеседники
  fx_sparkle: { kind: 'effect', name: 'Блёстки', emoji: '✨', price: 1000, tier: 'rare' },
  fx_hearts: { kind: 'effect', name: 'Сердечки', emoji: '💕', price: 1200, tier: 'rare' },
  fx_confetti: { kind: 'effect', name: 'Конфетти', emoji: '🎉', price: 2000, tier: 'epic' },
  fx_lightning: { kind: 'effect', name: 'Молния', emoji: '⚡', price: 3000, tier: 'epic' },
  // тема оформления — видна только владельцу
  theme_sand: { kind: 'theme', name: 'Песок', emoji: '🏖', price: 500, tier: 'common' },
  theme_forest: { kind: 'theme', name: 'Лес', emoji: '🌲', price: 800, tier: 'rare' },
  theme_neon: { kind: 'theme', name: 'Неон', emoji: '🌃', price: 2000, tier: 'epic' },
  theme_void: { kind: 'theme', name: 'Пустота', emoji: '🕳', price: 3500, tier: 'epic' },
  // наборы стикеров (сами стикеры — public/js/fun.js)
  stickers_space: { kind: 'stickers', name: 'Космос', emoji: '🚀', price: 500, tier: 'common', pack: 'space', count: 12 },
  stickers_party: { kind: 'stickers', name: 'Тусовка', emoji: '🪩', price: 800, tier: 'common', pack: 'party', count: 12 },
  stickers_memes: { kind: 'stickers', name: 'Мемы', emoji: '🗿', price: 1500, tier: 'rare', pack: 'memes', count: 16 },
  stickers_anime: { kind: 'stickers', name: 'Аниме-вайб', emoji: '🌸', price: 2500, tier: 'epic', pack: 'anime', count: 16 },
};
const INCLUDED = { plus: ['common'], pro: ['common', 'rare'], max: ['common', 'rare', 'epic', 'legendary'] };
const SLOT = { frame: 'frame', gradient: 'grad', effect: 'fx' };      // что «надевается» на сервере; тема и стикеры живут в настройках приложения

// ───── тарифы подписки. Цены за рубли можно поменять переменной PAY_PRICES (см. pay.js).
const upFixed = !!Number(process.env.MAX_UPLOAD_MB);
const PLANS = {
  plus: { id: 'plus', name: 'Plus', emoji: '🍃', rub: 99, stars: 1500, days: 30, tap: 25, daily: 0, season: 1, boosts: 0,
    perks: ['Значок Plus рядом с именем', 'Анимированный аватар: видео или GIF', 'До трёх реакций на одно сообщение', 'Набор стикеров «Мемные реакции» и тема «Загар»', 'Все обычные украшения магазина — бесплатно', '+25 % листиков в «Листопаде»', upFixed ? 'Втрое больший часовой лимит загрузки файлов' : 'Файлы до 400 МБ вместо 100 и втрое больший часовой лимит загрузки'] },
  pro: { id: 'pro', name: 'Pro', emoji: '🔥', rub: 249, stars: 4000, days: 30, tap: 50, daily: 20, season: 1.5, boosts: 2,
    perks: ['Всё из Plus', 'Значок Pro', 'Обычные и редкие украшения — бесплатно', '+50 % листиков в «Листопаде»', '+20 🍃 к ежедневному бонусу', 'Награды сезона в полтора раза больше', '2 буста сервера в подарок при каждой оплате'] },
  max: { id: 'max', name: 'Max', emoji: '👑', rub: 599, stars: 10000, days: 30, tap: 100, daily: 50, season: 2, boosts: 5,
    perks: ['Всё из Pro', 'Золотой значок Max', 'Все украшения и все наборы стикеров — бесплатно', '+100 % листиков в «Листопаде»', '+50 🍃 к ежедневному бонусу', 'Награды сезона вдвое больше', '5 бустов сервера в подарок при каждой оплате'] },
};
const TRIAL_DAYS = 3;
// ───── наборы украшений со скидкой
const BUNDLES = {
  starter: { name: 'Стартовый', emoji: '🎁', stars: 990, items: ['frame_leaf', 'grad_ocean', 'theme_forest', 'stickers_space'] },
  streamer: { name: 'Стример', emoji: '🎥', stars: 2990, items: ['frame_fire', 'grad_sunset', 'theme_neon', 'fx_sparkle', 'fx_confetti'] },
  legend: { name: 'Легенда', emoji: '👑', stars: 7990, items: ['frame_crown', 'grad_aurora', 'theme_void', 'fx_lightning', 'stickers_anime'] },
};
// ───── наборы листиков за рубли (чем больше набор, тем выгоднее)
const PACKS = {
  s: { rub: 99, stars: 1200, name: 'Горсть' },
  m: { rub: 249, stars: 3300, name: 'Охапка' },
  l: { rub: 499, stars: 7000, name: 'Стог' },
  xl: { rub: 999, stars: 15000, name: 'Воз' },
  xxl: { rub: 2499, stars: 42000, name: 'Роща' },
};
const FIRST_OFF = 30, CASHBACK = 10;      // скидка на первую покупку украшения и доля листиков пригласившему, %

const tierOf = C.tierOf, rank = t => C.TIERS[t] || 0;
const planOf = u => PLANS[tierOf(u)] || null;
const owns = (u, id) => Array.isArray(u.owned) && u.owned.includes(id);
const included = (u, id) => { const it = CATALOG[id], t = tierOf(u); return !!(it && t && INCLUDED[t].includes(it.tier)); };
const has = (u, id) => owns(u, id) || included(u, id);
const own = (u, id) => { u.owned = u.owned || []; if (!u.owned.includes(id)) u.owned.push(id); };
const touch = u => { R.selfUpdate(u); C.broadcastUser(u); };

// ───── скидка дня: три вещи, одни и те же для всех, меняются в полночь. Считается из даты, хранить нечего.
let dealsCache = { day: '', list: [] };
function dailyDeals() {
  const day = C.today(); if (dealsCache.day === day) return dealsCache.list;
  const keys = Object.keys(CATALOG), seed = Number(day.replace(/-/g, '')) || 1, list = [], used = new Set();
  const rand = n => { const x = Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453; return x - Math.floor(x); };
  for (let i = 0; list.length < 3 && i < 40; i++) { const key = keys[Math.floor(rand(i) * keys.length)]; if (used.has(key)) continue; used.add(key); list.push({ key, off: 20 + Math.floor(rand(i + 100) * 31) }); }      // 20–50 %
  dealsCache = { day, list }; return list;
}
function priceFor(u, id) {
  const it = CATALOG[id], deal = dailyDeals().find(d => d.key === id), first = !u.shopN ? FIRST_OFF : 0, off = Math.max(deal ? deal.off : 0, first);
  return { price: Math.floor(it.price * (100 - off) / 100), off, deal: !!deal && deal.off >= first };
}
// Что стоит набор именно этому человеку: за то, что уже есть, второй раз не берём.
function bundleFor(u, b) {
  const fresh = b.items.filter(i => !has(u, i)), rest = fresh.reduce((a, i) => a + CATALOG[i].price, 0);
  return { fresh, price: Math.min(b.stars, rest), full: b.items.reduce((a, i) => a + CATALOG[i].price, 0) };
}
// Впервые купленное сразу надеваем, если место свободно.
function equipIfEmpty(u, id) { const slot = SLOT[CATALOG[id].kind]; if (!slot) return; u.cos = u.cos || {}; if (!u.cos[slot]) u.cos[slot] = id; }
// 10 % листиками тому, кто пригласил покупателя.
function cashback(buyer, stars) {
  const inv = buyer.ref && db.users[buyer.ref]; if (!inv || inv.deleted || inv.banned || inv.bot) return 0;
  const bonus = Math.floor(stars * CASHBACK / 100); if (bonus <= 0) return 0;
  inv.stars = (inv.stars || 0) + bonus; inv.cashback = (inv.cashback || 0) + bonus; R.selfUpdate(inv);
  return bonus;
}

// ───── подписка
// Тариф один на человека. Докупаете тот же — срок продлевается. Берёте выше — остаток старого пересчитывается в дни нового по цене,
// берёте ниже действующего — купленные дни так же пересчитываются в дни действующего. Ничего оплаченного не сгорает.
function grantPlan(u, tier, days) {
  const p = PLANS[tier]; if (!p) return null;
  const cur = (u.premiumUntil || 0) > now() ? (PLANS[u.premiumTier] ? u.premiumTier : 'plus') : null, left = cur ? u.premiumUntil - now() : 0, ms = days * 864e5;
  if (!cur || cur === tier) { u.premiumUntil = now() + left + ms; u.premiumTier = tier; }
  else if (rank(tier) > rank(cur)) { u.premiumUntil = now() + ms + Math.floor(left * PLANS[cur].rub / p.rub); u.premiumTier = tier; }
  else u.premiumUntil = now() + left + Math.floor(ms * p.rub / PLANS[cur].rub);
  if (p.boosts) u.freeBoosts = Math.min(50, (u.freeBoosts || 0) + p.boosts);
  return { tier: u.premiumTier, until: u.premiumUntil };
}
function buyPlan(u, tier) {
  const p = PLANS[tier]; need(p, 'Такого тарифа нет');
  R.spend(u, p.stars, 'Листики можно накопить или докупить в магазине.');
  const r = grantPlan(u, tier, p.days); u.shopN = (u.shopN || 0) + 1; cashback(u, p.stars); save(); touch(u);
  return { ok: true, ...r, stars: u.stars };
}

// ───── сезон: календарный месяц, задания считаются сами, награду забирают кнопкой
const TASKS = [
  { id: 'msg50', text: 'Написать 50 сообщений', n: 50, stars: 200, on: 'msg' },
  { id: 'msg500', text: 'Написать 500 сообщений', n: 500, stars: 800, on: 'msg' },
  { id: 'react100', text: 'Поставить 100 реакций', n: 100, stars: 300, on: 'react' },
  { id: 'gift3', text: 'Подарить 3 подарка', n: 3, stars: 500, on: 'gift' },
  { id: 'boost1', text: 'Бустануть сервер', n: 1, stars: 1000, on: 'boost' },
  { id: 'invite5', text: 'Позвать 5 друзей', n: 5, stars: 700, on: 'invite' },
];
const DAY_CAP = { msg: 100, react: 40 };      // в зачёт за день: чтобы задание не превращалось в спам
const seasonId = () => C.today().slice(0, 7);
function seasonOf(u) { const sid = seasonId(); if (!u.season || u.season.id !== sid) u.season = { id: sid, n: {}, got: [] }; return u.season; }
function bump(uid, on) {
  const u = db.users[uid]; if (!u || u.bot) return;
  const s = seasonOf(u), cap = DAY_CAP[on];
  if (cap) { const d = C.today(); if (s.day !== d) { s.day = d; s.dayN = {}; } if ((s.dayN[on] || 0) >= cap) return; s.dayN[on] = (s.dayN[on] || 0) + 1; }
  const before = TASKS.filter(t => t.on === on && (s.n[on] || 0) >= t.n).length;
  s.n[on] = (s.n[on] || 0) + 1;
  if (TASKS.filter(t => t.on === on && s.n[on] >= t.n).length > before) { try { C.emit(uid, 'season.done', {}); } catch (e) { /* не в сети */ } }
  save();
}
const seasonMult = u => (planOf(u) || { season: 1 }).season;
function seasonView(u) {
  const s = seasonOf(u), mult = seasonMult(u), end = new Date(Date.UTC(Number(s.id.slice(0, 4)), Number(s.id.slice(5, 7)), 1)).getTime();
  return { id: s.id, end, mult, tasks: TASKS.map(t => ({ id: t.id, text: t.text, n: t.n, stars: Math.round(t.stars * mult), base: t.stars, progress: Math.min(t.n, s.n[t.on] || 0), done: (s.n[t.on] || 0) >= t.n, claimed: s.got.includes(t.id) })) };
}
H['season.get'] = c => seasonView(db.users[c.uid]);
H['season.claim'] = (c, p) => {
  const u = db.users[c.uid], s = seasonOf(u), t = TASKS.find(x => x.id === str(p.id, 32)); need(t, 'Такого задания нет');
  need((s.n[t.on] || 0) >= t.n, 'Задание ещё не выполнено'); need(!s.got.includes(t.id), 'Награда уже получена');
  const n = Math.round(t.stars * seasonMult(u)); u.stars = (u.stars || 0) + n; s.got.push(t.id); save(); R.selfUpdate(u);
  return { ok: true, n, stars: u.stars, season: seasonView(u) };
};
// Задания сезона считаются там, где действие уже произошло и проверено.
R.hook.sent = (uid, chat) => {
  if (chat.type === 'saved') return;
  if (chat.type === 'dm' || chat.type === 'secret') { const o = db.users[C.membersOf(chat).find(x => x !== uid)]; if (!o || o.bot) return; }      // переписка с ботом и с собой — не в счёт
  bump(uid, 'msg');
};
R.hook.reacted = (uid, m) => { if (m.from !== uid) bump(uid, 'react'); };
const after = (name, fn) => { const f = H[name]; if (!f) return console.warn('[shop] нет обработчика', name); H[name] = (c, p) => { const r = f(c, p); try { fn(c, p, r); } catch (e) { console.warn('[shop]', e.message); } return r; }; };
after('gift.send', c => bump(c.uid, 'gift'));
after('server.boost', c => bump(c.uid, 'boost'));
A.hooks.onInvite.push(inv => bump(inv.id, 'invite'));
// Прибавки подписчикам
R.hook.tapPct = u => (planOf(u) || { tap: 0 }).tap;
R.hook.dailyExtra = u => (planOf(u) || { daily: 0 }).daily;
R.hook.fx = u => { const id = u.cos && u.cos.fx; return id && CATALOG[id] && has(u, id) ? id.slice(3) : null; };
// Что из надетого видят другие. Вещь «из тарифа» пропадает сама, когда тариф кончился.
C.setCosHook(u => {
  const o = {}, f = u.cos.frame, g = u.cos.grad;
  if (f && CATALOG[f] && has(u, f)) o.f = f.slice(6);
  if (g && CATALOG[g] && has(u, g)) o.g = CATALOG[g].colors;
  return o.f || o.g ? o : null;
});
C.setSelfHook(u => ({ owned: u.owned || [], worn: u.cos || {}, freeBoosts: u.freeBoosts || 0, trialUsed: !!u.trialUsed || undefined, paidTier: (u.premiumUntil || 0) > now() ? (PLANS[u.premiumTier] ? u.premiumTier : 'plus') : undefined, paidUntil: (u.premiumUntil || 0) > now() ? u.premiumUntil : undefined, trialUntil: (u.trialUntil || 0) > now() ? u.trialUntil : undefined }));

// ───── RPC
H['shop.catalog'] = c => {
  const u = db.users[c.uid], Pay = require('./pay'), rub = id => (Pay.ITEMS.find(i => i.id === id) || {}).rub;
  return {
    stars: u.stars || 0, tier: tierOf(u), first: !u.shopN ? FIRST_OFF : 0, cashback: { pct: CASHBACK, got: u.cashback || 0 }, pay: Pay.enabled(), freeBoosts: u.freeBoosts || 0,
    items: Object.entries(CATALOG).map(([id, it]) => ({ id, ...it, base: it.price, ...priceFor(u, id), owned: owns(u, id), included: included(u, id) })),
    plans: Object.values(PLANS).map(p => ({ id: p.id, name: p.name, emoji: p.emoji, stars: p.stars, rub: rub('plan_' + p.id), days: p.days, perks: p.perks })),
    trial: { days: TRIAL_DAYS, used: !!u.trialUsed, until: (u.trialUntil || 0) > now() ? u.trialUntil : 0, can: !u.trialUsed && rank(tierOf(u)) < rank('pro') },
    bundles: Object.entries(BUNDLES).map(([id, b]) => { const f = bundleFor(u, b); return { id, name: b.name, emoji: b.emoji, items: b.items, price: f.price, full: f.full, fresh: f.fresh.length }; }),
    packs: Object.entries(PACKS).map(([id, s]) => ({ id: 'leaves_' + id, name: s.name, stars: s.stars, rub: rub('leaves_' + id), bonus: Math.round((s.stars / s.rub) / (PACKS.s.stars / PACKS.s.rub) * 100 - 100) })),
  };
};
H['shop.buy'] = (c, p) => {
  const u = db.users[c.uid], id = str(p.id, 64), it = CATALOG[id]; need(it, 'Такой вещи в магазине нет');
  need(!owns(u, id), 'Это у вас уже куплено'); need(!included(u, id), 'Эта вещь входит в вашу подписку — платить не нужно');
  const { price } = priceFor(u, id);
  R.spend(u, price, 'Листики можно накопить или докупить в магазине.');
  own(u, id); equipIfEmpty(u, id); u.shopN = (u.shopN || 0) + 1; cashback(u, price); save(); touch(u);
  return { ok: true, id, price, stars: u.stars };
};
H['shop.buyBundle'] = (c, p) => {
  const u = db.users[c.uid], b = BUNDLES[str(p.id, 32)]; need(b, 'Такого набора нет');
  const { fresh, price } = bundleFor(u, b); need(fresh.length, 'Всё из этого набора у вас уже есть');
  R.spend(u, price, 'Листики можно накопить или докупить в магазине.');
  for (const id of fresh) { own(u, id); equipIfEmpty(u, id); }
  u.shopN = (u.shopN || 0) + 1; cashback(u, price); save(); touch(u);
  return { ok: true, items: fresh, price, stars: u.stars };
};
H['shop.buyPlan'] = (c, p) => buyPlan(db.users[c.uid], str(p.id, 16));
H['premium.buy'] = c => buyPlan(db.users[c.uid], 'plus');      // старое название: «Премиум» — это теперь тариф Plus
// Подписка в подарок другому человеку, за листики
H['shop.giftPlan'] = (c, p) => {
  const u = db.users[c.uid], o = db.users[typeof p.to === 'string' ? p.to : ''], pl = PLANS[str(p.id, 16)]; need(pl, 'Такого тарифа нет'); need(o && !o.deleted && !o.bot, 'Пользователь не найден');
  R.giveCheck(u, o); A.limit('giftplan:' + u.id, 6, 3600e3);
  R.spend(u, pl.stars, 'Листики можно накопить или докупить в магазине.');
  const r = grantPlan(o, pl.id, pl.days); u.shopN = (u.shopN || 0) + 1; cashback(u, pl.stars); save(); R.selfUpdate(u); touch(o);
  const ch = C.openDm(u.id, o.id);
  C.postMessage(ch, u.id, { type: 'service', text: `подарил(а) подписку «Нудист ${pl.name}» на ${pl.days} дней ${pl.emoji}` }, { quiet: true });
  try { require('./push').notify(o.id, { title: R.uname(u), body: `Дарит вам подписку «Нудист ${pl.name}» на ${pl.days} дней`, tag: ch.id, url: '/' }, C.isOnline(o.id)); } catch (e) { console.error('[push]', e.message); }
  return { ok: true, stars: u.stars, chat: ch.id, until: r.until };
};
// Пробный Pro на три дня, один раз на аккаунт. Оплаченный срок при этом не трогается.
H['shop.trial'] = c => {
  const u = db.users[c.uid]; need(!u.trialUsed, 'Пробный период уже использован'); need(rank(tierOf(u)) < rank('pro'), 'У вас уже тариф Pro или выше');
  u.trialUsed = now(); u.trialUntil = now() + TRIAL_DAYS * 864e5; save(); touch(u);
  return { ok: true, days: TRIAL_DAYS, until: u.trialUntil };
};
// Надеть или снять: { id } — надеть вещь, { kind } без id — снять
H['shop.equip'] = (c, p) => {
  const u = db.users[c.uid], id = str(p.id, 64); u.cos = u.cos || {};
  if (!id) { const slot = SLOT[str(p.kind, 16)]; need(slot, 'Это нельзя снять'); delete u.cos[slot]; save(); touch(u); return { ok: true, worn: u.cos }; }
  const it = CATALOG[id]; need(it, 'Такой вещи в магазине нет'); need(has(u, id), 'Сначала купите эту вещь'); need(SLOT[it.kind], 'Эта вещь включается в настройках приложения');
  u.cos[SLOT[it.kind]] = id; save(); touch(u);
  return { ok: true, worn: u.cos };
};

module.exports = { CATALOG, PLANS, BUNDLES, PACKS, TASKS, TRIAL_DAYS, dailyDeals, grantPlan, cashback, has, owns, included, bump, seasonView };
