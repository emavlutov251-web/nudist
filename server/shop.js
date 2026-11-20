'use strict';
// Магазин: украшения за листики, тарифы подписки Plus / Pro / Max, наборы, пробный Plus, сезон с заданиями, кэшбэк за друзей.
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
  // награды пропуска сезона: не продаются и ни в какой тариф не входят
  frame_wave: { kind: 'frame', name: 'Волна', emoji: '🌊', price: 0, tier: 'season' },
  grad_coral: { kind: 'gradient', name: 'Коралл', emoji: '🪸', price: 0, tier: 'season', colors: ['#FF6B6B', '#FF9E7D', '#F7B267'] },
  fx_bubbles: { kind: 'effect', name: 'Пузыри', emoji: '🫧', price: 0, tier: 'season' },
  frame_trident: { kind: 'frame', name: 'Трезубец', emoji: '🔱', price: 0, tier: 'season' },
  // вещи событий (server/events.js): продаются только пока идёт событие `ev`, ни в какой тариф не входят, купленное остаётся навсегда
  frame_blackleaf: { kind: 'frame', name: 'Чёрный лист', emoji: '🖤', price: 1800, tier: 'event', ev: 'bf' },
  fx_goldsand: { kind: 'effect', name: 'Золотой песок', emoji: '⏳', price: 1500, tier: 'event', ev: 'bf' },
  theme_nightbeach: { kind: 'theme', name: 'Ночной пляж', emoji: '🌙', price: 1500, tier: 'event', ev: 'bf' },
  frame_snow: { kind: 'frame', name: 'Снежинка', emoji: '❄️', price: 1200, tier: 'event', ev: 'winter' },
  frame_gift: { kind: 'frame', name: 'Подарочная лента', emoji: '🎀', price: 1500, tier: 'event', ev: 'winter' },
  theme_newyear: { kind: 'theme', name: 'Новый год', emoji: '🎄', price: 1500, tier: 'event', ev: 'winter' },
  fx_firework: { kind: 'effect', name: 'Фейерверк', emoji: '🎆', price: 2000, tier: 'event', ev: 'ny' },
  frame_crown27: { kind: 'frame', name: 'Корона 2027', emoji: '👑', price: 2500, tier: 'event', ev: 'ny' },
  // календарь года. ev: 'prize' — в продаже не бывает: только награда
  fx_blank: { kind: 'effect', name: 'Чистый лист', emoji: '📄', price: 1200, tier: 'event', ev: 'jan' },
  theme_minimal: { kind: 'theme', name: 'Минимализм', emoji: '⬜', price: 1500, tier: 'event', ev: 'jan' },
  frame_cupid: { kind: 'frame', name: 'Купидон', emoji: '💘', price: 1500, tier: 'event', ev: 'feb' },
  frame_bloom: { kind: 'frame', name: 'Цветение', emoji: '🌸', price: 1500, tier: 'event', ev: 'mar' },
  fx_petals: { kind: 'effect', name: 'Лепестки', emoji: '🌸', price: 1200, tier: 'event', ev: 'mar' },
  frame_joker: { kind: 'frame', name: 'Джокер', emoji: '🃏', price: 1500, tier: 'event', ev: 'apr' },
  theme_matrix: { kind: 'theme', name: 'Матрица', emoji: '🟩', price: 0, tier: 'event', ev: 'prize' },
  frame_pioneer: { kind: 'frame', name: 'Первопроходец', emoji: '🚩', price: 0, tier: 'event', ev: 'prize' },
  frame_bday: { kind: 'frame', name: 'Именинник', emoji: '🎂', price: 1500, tier: 'event', ev: 'jun' },
  frame_survivor: { kind: 'frame', name: 'Выживший', emoji: '🦑', price: 0, tier: 'event', ev: 'prize' },
  frame_sunset: { kind: 'frame', name: 'Закат', emoji: '🌇', price: 1500, tier: 'event', ev: 'aug' },
  theme_rain: { kind: 'theme', name: 'Дождливый город', emoji: '🌧️', price: 1500, tier: 'event', ev: 'sep' },
  fx_calm: { kind: 'effect', name: 'Антистресс', emoji: '🫧', price: 1200, tier: 'event', ev: 'sep' },
  frame_vampire: { kind: 'frame', name: 'Вампир', emoji: '🧛', price: 1800, tier: 'event', ev: 'oct' },
  fx_web: { kind: 'effect', name: 'Паутина', emoji: '🕸️', price: 1200, tier: 'event', ev: 'oct' },
  fx_bats: { kind: 'effect', name: 'Летучие мыши', emoji: '🦇', price: 1500, tier: 'event', ev: 'oct' },
  frame_season: { kind: 'frame', name: 'Сезонник', emoji: '📮', price: 0, tier: 'event', ev: 'prize' },
  frame_veteran: { kind: 'frame', name: 'Старожил', emoji: '🏅', price: 0, tier: 'event', ev: 'prize' },
  // значки у имени: украшение, а не подтверждение — так и написано в подсказке значка. Ни в какой тариф не входят
  badge_press: { kind: 'badge', name: 'Пресса', emoji: '📰', price: 5000, tier: 'badge', since: '2026-11-15' },
  badge_streamer: { kind: 'badge', name: 'Стример', emoji: '🎥', price: 5000, tier: 'badge', since: '2026-11-15' },
  badge_artist: { kind: 'badge', name: 'Художник', emoji: '🎨', price: 5000, tier: 'badge', since: '2026-11-15' },
  // тайная витрина: открывается, когда на счету хоть раз набралось SECRET_FROM листиков, и остаётся открытой. Без скидок, ни в какой тариф не входит
  frame_diamond: { kind: 'frame', name: 'Бриллиант', emoji: '💎', price: 40000, tier: 'secret' },
  grad_gold: { kind: 'gradient', name: 'Чистое золото', emoji: '🥇', price: 25000, tier: 'secret', colors: ['#B8860B', '#FFD700', '#FFF4B0', '#E6A700'] },
  fx_meteor: { kind: 'effect', name: 'Звездопад', emoji: '☄️', price: 30000, tier: 'secret' },
  badge_gem: { kind: 'badge', name: 'Коллекционер', emoji: '💠', price: 50000, tier: 'secret' },
};
const SECRET_FROM = 100000;
const vip = u => { if (!u.vip && (u.stars || 0) >= SECRET_FROM) { u.vip = now(); save(); } return !!u.vip; };
// Что знает о событиях магазин: идёт ли событие, скидка события на вещь, до какого времени вещь в продаже. Заполняет server/events.js.
const ev = { on: () => false, off: () => 0, till: () => 0, sale: '' };
const INCLUDED = { plus: ['common'], pro: ['common', 'rare'], max: ['common', 'rare', 'epic', 'legendary'] };
const SLOT = { frame: 'frame', gradient: 'grad', effect: 'fx', badge: 'badge' };      // что «надевается» на сервере; тема и стикеры живут в настройках приложения

// ───── тарифы подписки. Цены за рубли можно поменять переменной PAY_PRICES (см. pay.js).
const upFixed = !!Number(process.env.MAX_UPLOAD_MB);
const PLANS = {
  plus: { id: 'plus', name: 'Plus', emoji: '🍃', rub: 99, stars: 1500, days: 30, tap: 25, daily: 0, season: 1, boosts: 0,
    perks: ['Значок Plus рядом с именем', 'Анимированный аватар: видео или GIF', 'До трёх реакций на одно сообщение', 'Набор стикеров «Мемные реакции» и тема «Загар»', 'Все обычные украшения магазина — бесплатно', '+25 % листиков в «Листопаде»', upFixed ? 'Втрое больший часовой лимит загрузки файлов' : 'Файлы до 400 МБ вместо 100 и втрое больший часовой лимит загрузки'] },
  pro: { id: 'pro', name: 'Pro', emoji: '🔥', rub: 249, stars: 4000, days: 30, tap: 50, daily: 20, season: 1.5, boosts: 2,
    perks: ['Всё из Plus', 'Значок Pro', 'Обычные и редкие украшения — бесплатно', '+50 % листиков в «Листопаде»', '+20 🍃 к ежедневному бонусу', 'Награды сезона в полтора раза больше', '2 буста группы в подарок при каждой оплате'] },
  max: { id: 'max', name: 'Max', emoji: '👑', rub: 599, stars: 10000, days: 30, tap: 100, daily: 50, season: 2, boosts: 5,
    perks: ['Всё из Pro', 'Золотой значок Max', 'Все украшения и все наборы стикеров — бесплатно', '+100 % листиков в «Листопаде»', '+50 🍃 к ежедневному бонусу', 'Награды сезона вдвое больше', '5 бустов группы в подарок при каждой оплате'] },
};
const TRIAL_DAYS = 3, TRIAL_TIER = 'plus';
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
const RENEW_OFF = 20, RENEW_DAYS = 3;      // скидка на продление того же тарифа за листики в последние дни срока, %
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
  const keys = Object.keys(CATALOG).filter(k => CATALOG[k].price > 0 && !CATALOG[k].ev && CATALOG[k].tier !== 'secret'), seed = Number(day.replace(/-/g, '')) || 1, list = [], used = new Set();
  const rand = n => { const x = Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453; return x - Math.floor(x); };
  for (let i = 0; list.length < 3 && i < 40; i++) { const key = keys[Math.floor(rand(i) * keys.length)]; if (used.has(key)) continue; used.add(key); list.push({ key, off: 20 + Math.floor(rand(i + 100) * 31) }); }      // 20–50 %
  dealsCache = { day, list }; return list;
}
function priceFor(u, id) {
  const it = CATALOG[id]; if (it.tier === 'secret') return { price: it.price, off: 0, deal: false };      /* тайная витрина — всегда по полной цене */
  const deal = dailyDeals().find(d => d.key === id), first = !u.shopN ? FIRST_OFF : 0, sale = ev.off(it), off = Math.max(deal ? deal.off : 0, first, sale);
  return { price: Math.floor(it.price * (100 - off) / 100), off: Math.round(off), deal: !!deal && deal.off >= first && deal.off >= sale, sale: sale > 0 && sale >= off ? ev.sale : undefined };
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
function grantPlan(u, tier, days, opt) {
  const p = PLANS[tier]; if (!p) return null;
  const cur = (u.premiumUntil || 0) > now() ? (PLANS[u.premiumTier] ? u.premiumTier : 'plus') : null, left = cur ? u.premiumUntil - now() : 0, ms = days * 864e5;
  if (!cur || cur === tier) { u.premiumUntil = now() + left + ms; u.premiumTier = tier; }
  else if (rank(tier) > rank(cur)) { u.premiumUntil = now() + ms + Math.floor(left * PLANS[cur].rub / p.rub); u.premiumTier = tier; }
  else u.premiumUntil = now() + left + Math.floor(ms * PLANS[tier].rub / PLANS[cur].rub);
  if (p.boosts && !(opt && opt.noBoosts)) u.freeBoosts = Math.min(50, (u.freeBoosts || 0) + p.boosts);
  return { tier: u.premiumTier, until: u.premiumUntil };
}
// Награда события/пропуска не продлевает Pro или Max бесплатно: владельцы более высокого тарифа получают стоимость в листиках.
function grantRewardPlan(u, tier, days, opt) {
  if (rank(tierOf(u)) > rank(tier)) {
    const stars = Math.floor(PLANS[tier].stars * days / PLANS[tier].days);
    u.stars = (u.stars || 0) + stars;
    return { stars, converted: true };
  }
  return grantPlan(u, tier, days, opt);
}
// Автопродления нет, поэтому за три дня до конца срока напоминаем и даём скидку на продление того же тарифа за листики.
const paidTier = u => ((u.premiumUntil || 0) > now() ? (PLANS[u.premiumTier] ? u.premiumTier : 'plus') : null);
const renewOff = (u, tier) => (paidTier(u) === tier && u.premiumUntil - now() < RENEW_DAYS * 864e5 ? RENEW_OFF : 0);
const planPrice = (u, tier) => Math.floor(PLANS[tier].stars * (100 - renewOff(u, tier)) / 100);
function buyPlan(u, tier) {
  const p = PLANS[tier]; need(p, 'Такого тарифа нет');
  const price = planPrice(u, tier);
  R.spend(u, price, 'Листики можно накопить или докупить в магазине.');
  const r = grantPlan(u, tier, p.days); u.shopN = (u.shopN || 0) + 1; cashback(u, price); save(); touch(u);
  return { ok: true, ...r, price, stars: u.stars };
}
function remind() {
  const sys = db.meta.sys; if (!sys || !db.users[sys]) return;
  for (const u of Object.values(db.users)) {
    if (u.bot || u.deleted || u.banned) continue;
    const t = paidTier(u); if (!t || u.premiumUntil - now() > RENEW_DAYS * 864e5 || u.renewNote === u.premiumUntil) continue;
    u.renewNote = u.premiumUntil; const p = PLANS[t], date = new Date(u.premiumUntil + 3 * 3600e3).toISOString().slice(0, 10).split('-').reverse().join('.');
    try { C.postMessage(C.openDm(sys, u.id), sys, { text: `⏳ **Подписка «Нудист ${p.name}» закончится ${date}.**\nСама она не продлевается и ничего не списывает. Если хотите продлить — до конца срока это можно сделать за листики со скидкой ${RENEW_OFF} %: ${planPrice(u, t)} 🍃 вместо ${p.stars} 🍃. Меню → «Магазин и подписка» → «Подписка».` }, { quiet: true }); } catch (e) { console.warn('[shop]', e.message); }
    save();
  }
}
setInterval(remind, 3600e3).unref(); setTimeout(remind, (Number(process.env.REMIND_AFTER_S) || 90) * 1000).unref();

// ───── сезон: календарный месяц, задания считаются сами, награду забирают кнопкой
const TASKS = [
  { id: 'msg50', text: 'Написать 50 сообщений', n: 50, stars: 100, on: 'msg' },
  { id: 'msg500', text: 'Написать 500 сообщений', n: 500, stars: 400, on: 'msg' },
  { id: 'react100', text: 'Поставить 100 реакций', n: 100, stars: 150, on: 'react' },
  { id: 'gift3', text: 'Подарить 3 подарка', n: 3, stars: 250, on: 'gift' },
  { id: 'boost1', text: 'Бустануть группу', n: 1, stars: 500, on: 'boost' },
  { id: 'invite5', text: 'Позвать 5 друзей', n: 5, stars: 350, on: 'invite' },
];
const DAY_CAP = { msg: 100, react: 40 };      // в зачёт за день: чтобы задание не превращалось в спам
// Пропуск сезона: опыт за ту же активность, 50 уровней, две дорожки наград — обычная для всех и «Премиум» (покупается за листики, в тарифе Max бесплатна).
const XP = { msg: 1, react: 1, gift: 5, tip: 10, boost: 25, invite: 20, daily: 50 };
const PASS = { levels: 50, per: 100, price: 990 };
const SEASON_ITEMS = { 10: 'frame_wave', 20: 'grad_coral', 30: 'fx_bubbles', 50: 'frame_trident' }, DUPE = 300;      // если вещь уже есть — вместо неё листики
function reward(lvl, prem) {
  if (!prem) return { stars: lvl % 10 === 0 ? 50 : lvl % 5 === 0 ? 25 : 10 };
  if (SEASON_ITEMS[lvl]) return { item: SEASON_ITEMS[lvl] };
  if (lvl === 40) return { plan: 'plus', days: 3 };
  return { stars: lvl % 5 === 0 ? 150 : 40 };
}
const levelOf = s => Math.min(PASS.levels, Math.floor((s.xp || 0) / PASS.per));
const passOn = (u, s) => !!s.pass || tierOf(u) === 'max';
const seasonId = () => C.today().slice(0, 7);
function seasonOf(u) { const sid = seasonId(); if (!u.season || u.season.id !== sid) u.season = { id: sid, n: {}, got: [] }; if (!u.season.lv) u.season.lv = []; return u.season; }
function bump(uid, on) {
  const u = db.users[uid]; if (!u || u.bot) return;
  const s = seasonOf(u), cap = DAY_CAP[on];
  if (cap) { const d = C.today(); if (s.day !== d) { s.day = d; s.dayN = {}; } if ((s.dayN[on] || 0) >= cap) return; s.dayN[on] = (s.dayN[on] || 0) + 1; }
  const before = TASKS.filter(t => t.on === on && (s.n[on] || 0) >= t.n).length, lv0 = levelOf(s);
  s.n[on] = (s.n[on] || 0) + 1; s.xp = (s.xp || 0) + (XP[on] || 0);
  if (TASKS.filter(t => t.on === on && s.n[on] >= t.n).length > before) { try { C.emit(uid, 'season.done', {}); } catch (e) { /* не в сети */ } }
  if (levelOf(s) > lv0) { try { C.emit(uid, 'season.level', { level: levelOf(s) }); } catch (e) { /* не в сети */ } }
  save();
}
const seasonMult = u => (planOf(u) || { season: 1 }).season;
function seasonView(u) {
  const s = seasonOf(u), mult = seasonMult(u), end = new Date(Date.UTC(Number(s.id.slice(0, 4)), Number(s.id.slice(5, 7)), 1)).getTime();
  const lvl = levelOf(s), prem = passOn(u, s);
  const pass = { xp: s.xp || 0, level: lvl, levels: PASS.levels, per: PASS.per, price: PASS.price, premium: prem, auto: !s.pass && prem, xpFor: XP, cap: DAY_CAP,
    track: Array.from({ length: PASS.levels }, (_, i) => { const l = i + 1, pr = reward(l, true); return { lvl: l, free: reward(l, false), prem: pr.item ? { item: pr.item, name: CATALOG[pr.item].name, emoji: CATALOG[pr.item].emoji, kind: CATALOG[pr.item].kind } : pr, gotF: s.lv.includes('f' + l), gotP: s.lv.includes('p' + l) }; }) };
  pass.ready = pass.track.filter(t => t.lvl <= lvl && (!t.gotF || (prem && !t.gotP))).length;
  return { id: s.id, end, mult, pass, tasks: TASKS.map(t => ({ id: t.id, text: t.text, n: t.n, stars: Math.round(t.stars * mult), base: t.stars, progress: Math.min(t.n, s.n[t.on] || 0), done: (s.n[t.on] || 0) >= t.n, claimed: s.got.includes(t.id) })) };
}
H['season.get'] = c => seasonView(db.users[c.uid]);
H['season.claim'] = (c, p) => {
  const u = db.users[c.uid], s = seasonOf(u), t = TASKS.find(x => x.id === str(p.id, 32)); need(t, 'Такого задания нет');
  need((s.n[t.on] || 0) >= t.n, 'Задание ещё не выполнено'); need(!s.got.includes(t.id), 'Награда уже получена');
  const n = Math.round(t.stars * seasonMult(u)); u.stars = (u.stars || 0) + n; s.got.push(t.id); save(); R.selfUpdate(u);
  return { ok: true, n, stars: u.stars, season: seasonView(u) };
};
// Пропуск: купить «Премиум»-дорожку и забрать награды. { lvl, prem } — одну, { all: true } — все доступные разом.
H['season.pass.buy'] = c => {
  const u = db.users[c.uid], s = seasonOf(u); need(!s.pass, 'Премиум-дорожка этого сезона уже куплена'); need(tierOf(u) !== 'max', 'В тарифе Max премиум-дорожка уже открыта');
  R.spend(u, PASS.price, 'Листики можно накопить или докупить в магазине.'); s.pass = now(); u.shopN = (u.shopN || 0) + 1; cashback(u, PASS.price); save(); R.selfUpdate(u);
  return { ok: true, stars: u.stars, season: seasonView(u) };
};
function give(u, s, lvl, prem) {
  const r = reward(lvl, prem), out = { lvl, prem };
  if (r.stars) { u.stars = (u.stars || 0) + r.stars; out.stars = r.stars; }
  if (r.item) { if (owns(u, r.item)) { u.stars = (u.stars || 0) + DUPE; out.stars = DUPE; } else { own(u, r.item); equipIfEmpty(u, r.item); out.item = r.item; out.name = CATALOG[r.item].name; } }
  if (r.plan) { const g = grantRewardPlan(u, r.plan, r.days, { noBoosts: true }); if (g.stars) out.stars = g.stars; else { out.plan = r.plan; out.days = r.days; } }
  s.lv.push((prem ? 'p' : 'f') + lvl); return out;
}
H['season.pass.claim'] = (c, p) => {
  const u = db.users[c.uid], s = seasonOf(u), lvl = levelOf(s), prem = passOn(u, s), got = [];
  if (p.all) { for (let l = 1; l <= lvl; l++) { if (!s.lv.includes('f' + l)) got.push(give(u, s, l, false)); if (prem && !s.lv.includes('p' + l)) got.push(give(u, s, l, true)); } need(got.length, 'Пока забирать нечего'); }
  else {
    const l = Math.floor(Number(p.lvl) || 0), pr = !!p.prem; need(l >= 1 && l <= PASS.levels, 'Такого уровня нет'); need(l <= lvl, 'Уровень ещё не достигнут');
    need(!pr || prem, 'Премиум-дорожка не открыта'); need(!s.lv.includes((pr ? 'p' : 'f') + l), 'Награда уже получена');
    got.push(give(u, s, l, pr));
  }
  save(); touch(u);
  return { ok: true, got, stars: u.stars, n: got.reduce((a, g) => a + (g.stars || 0), 0), season: seasonView(u) };
};
// Задания сезона считаются там, где действие уже произошло и проверено.
R.hook.sent = (uid, chat) => {
  if (chat.type === 'saved') return;
  if (chat.type === 'dm' || chat.type === 'secret') { const o = db.users[C.membersOf(chat).find(x => x !== uid)]; if (!o || o.bot) return; }      // переписка с ботом и с собой — не в счёт
  bump(uid, 'msg');
};
R.hook.reacted = (uid, m) => { if (m.from !== uid) bump(uid, 'react'); };
const after = (name, fn) => { const f = H[name]; if (!f) return console.warn('[shop] нет обработчика', name); H[name] = (c, p) => { const r = f(c, p); try { fn(c, p, r); } catch (e) { console.warn('[shop]', e.message); } return r; }; };
after('gift.send', (c, p) => { if (p.to !== c.uid) bump(c.uid, 'gift'); });
after('stars.daily', c => bump(c.uid, 'daily'));
require('./tips').setOnTip(uid => bump(uid, 'tip'));
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
// Значок из магазина рядом с именем и «коллекция» в профиле: что человек купил или получил (тариф тут не считается — только своё).
C.setShopHooks({ badge: u => { const b = u.cos && u.cos.badge; return b && CATALOG[b] && CATALOG[b].kind === 'badge' && owns(u, b) ? b.slice(6) : null; },
  col: u => (u.owned || []).filter(i => CATALOG[i]).map(i => ({ id: i, kind: CATALOG[i].kind, name: CATALOG[i].name, emoji: CATALOG[i].emoji, tier: CATALOG[i].tier, colors: CATALOG[i].colors })) });
C.setSelfHook(u => ({ owned: u.owned || [], worn: u.cos || {}, freeBoosts: u.freeBoosts || 0, trialUsed: !!u.trialUsed || undefined, trialTier: (u.trialUntil || 0) > now() ? (u.trialTier || 'plus') : undefined, paidTier: (u.premiumUntil || 0) > now() ? (PLANS[u.premiumTier] ? u.premiumTier : 'plus') : undefined, paidUntil: (u.premiumUntil || 0) > now() ? u.premiumUntil : undefined, trialUntil: (u.trialUntil || 0) > now() ? u.trialUntil : undefined }));

// ───── RPC
H['shop.catalog'] = c => {
  const u = db.users[c.uid], Pay = require('./pay'), rub = id => (Pay.ITEMS.find(i => i.id === id) || {}).rub;
  return {
    stars: u.stars || 0, tier: tierOf(u), first: !u.shopN ? FIRST_OFF : 0, cashback: { pct: CASHBACK, got: u.cashback || 0 }, pay: Pay.enabled(), freeBoosts: u.freeBoosts || 0,
    secret: { open: vip(u), from: SECRET_FROM },
    items: Object.entries(CATALOG).filter(([id, it]) => (!it.ev || ev.on(it.ev) || owns(u, id)) && (it.tier !== 'secret' || vip(u) || owns(u, id))).map(([id, it]) => ({ id, ...it, base: it.price, ...priceFor(u, id), owned: owns(u, id), included: included(u, id), fresh: !!it.since && now() - Date.parse(it.since) < 21 * 864e5 || undefined /* «новинка» — три недели с даты появления */, till: it.ev && ev.on(it.ev) ? ev.till(it.ev) : undefined })),
    plans: Object.values(PLANS).map(p => ({ id: p.id, name: p.name, emoji: p.emoji, stars: planPrice(u, p.id), full: p.stars, off: renewOff(u, p.id), rub: rub('plan_' + p.id), days: p.days, perks: p.perks })),
    trial: { tier: TRIAL_TIER, days: TRIAL_DAYS, used: !!u.trialUsed, until: (u.trialUntil || 0) > now() ? u.trialUntil : 0, can: !u.trialUsed && rank(tierOf(u)) < rank(TRIAL_TIER) },
    bundles: Object.entries(BUNDLES).map(([id, b]) => { const f = bundleFor(u, b); return { id, name: b.name, emoji: b.emoji, items: b.items, price: f.price, full: f.full, fresh: f.fresh.length }; }),
    packs: Object.entries(PACKS).map(([id, s]) => ({ id: 'leaves_' + id, name: s.name, stars: s.stars, rub: rub('leaves_' + id), bonus: Math.round((s.stars / s.rub) / (PACKS.s.stars / PACKS.s.rub) * 100 - 100) })),
  };
};
H['shop.buy'] = (c, p) => {
  const u = db.users[c.uid], id = str(p.id, 64), it = CATALOG[id]; need(it, 'Такой вещи в магазине нет');
  need(!owns(u, id), 'Это у вас уже куплено'); need(it.tier !== 'season', 'Эта вещь не продаётся: её дают в пропуске сезона'); need(!included(u, id), 'Эта вещь входит в вашу подписку — платить не нужно');
  need(!it.ev || ev.on(it.ev), 'Эта вещь продаётся только во время события. Сейчас её не купить.');
  need(it.tier !== 'secret' || vip(u), 'Такой вещи в магазине нет');
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
// Вещь в подарок: платит даритель, вещь остаётся у друга навсегда и сразу надевается, если место свободно.
H['shop.gift'] = (c, p) => {
  const u = db.users[c.uid], o = db.users[typeof p.to === 'string' ? p.to : ''], id = str(p.id, 64), it = CATALOG[id]; need(it, 'Такой вещи в магазине нет'); need(o && !o.deleted && !o.bot && o.id !== u.id, 'Подарить можно только другому человеку');
  need(it.price > 0 && it.tier !== 'season' && (!it.ev || ev.on(it.ev)), 'Эту вещь нельзя подарить: она не продаётся'); need(it.tier !== 'secret' || vip(u), 'Такой вещи в магазине нет');
  need(!owns(o, id), 'У этого человека такая вещь уже есть');
  R.giveCheck(u, o); A.limit('giftitem:' + u.id, 10, 3600e3);
  const { price } = priceFor(u, id);
  R.spend(u, price, 'Листики можно накопить или докупить в магазине.');
  own(o, id); equipIfEmpty(o, id); u.shopN = (u.shopN || 0) + 1; cashback(u, price); save(); R.selfUpdate(u); touch(o);
  const ch = C.openDm(u.id, o.id);
  C.postMessage(ch, u.id, { type: 'service', text: `подарил(а) ${KIND_WORD[it.kind] || 'вещь'} «${it.name}» ${it.emoji}` }, { quiet: true });
  try { require('./push').notify(o.id, { title: R.uname(u), body: `Дарит вам ${KIND_WORD[it.kind] || 'вещь'} «${it.name}» ${it.emoji}`, tag: ch.id, url: '/' }, C.isOnline(o.id)); } catch (e) { console.error('[push]', e.message); }
  return { ok: true, price, stars: u.stars, chat: ch.id };
};
const KIND_WORD = { frame: 'рамку', gradient: 'цвет имени', effect: 'эффект', theme: 'тему', stickers: 'набор стикеров', badge: 'значок' };
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
// Пробный Plus на три дня, один раз на аккаунт. Pro и Max доступны только по покупке или подарку.
H['shop.trial'] = c => {
  const u = db.users[c.uid]; need(!u.trialUsed, 'Пробный период уже использован'); need(rank(tierOf(u)) < rank(TRIAL_TIER), 'Пробный Plus доступен только без действующей подписки');
  u.trialUsed = now(); u.trialTier = TRIAL_TIER; u.trialUntil = now() + TRIAL_DAYS * 864e5; save(); touch(u);
  return { ok: true, tier: TRIAL_TIER, days: TRIAL_DAYS, until: u.trialUntil };
};
// Надеть или снять: { id } — надеть вещь, { kind } без id — снять
H['shop.equip'] = (c, p) => {
  const u = db.users[c.uid], id = str(p.id, 64); u.cos = u.cos || {};
  if (!id) { const slot = SLOT[str(p.kind, 16)]; need(slot, 'Это нельзя снять'); delete u.cos[slot]; save(); touch(u); return { ok: true, worn: u.cos }; }
  const it = CATALOG[id]; need(it, 'Такой вещи в магазине нет'); need(has(u, id), 'Сначала купите эту вещь'); need(SLOT[it.kind], 'Эта вещь включается в настройках приложения');
  u.cos[SLOT[it.kind]] = id; save(); touch(u);
  return { ok: true, worn: u.cos };
};

module.exports = { ev, own, touch, vip, SECRET_FROM, CATALOG, PLANS, BUNDLES, PACKS, TASKS, TRIAL_DAYS, dailyDeals, grantPlan, grantRewardPlan, cashback, has, owns, included, bump, seasonView };
