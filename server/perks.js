// Энергия в играх. Каждый запуск игры тратит одну единицу; энергия сама восстанавливается со временем,
// а нетерпеливые могут восполнить её листиками. Утилиты («Жребий», «Скинемся», «Подышать») и ответ на дуэль энергию не тратят.
// Выключается одной переменной окружения ENERGY=off — тогда игры снова без ограничений.
const C = require('./core');
const R = require('./rpc');
const Hub = require('./hub');
const { db, save, now, need, str } = C;
const H = R.H;

const ON = process.env.ENERGY !== 'off';
const MAX = Number(process.env.ENERGY_MAX) || 10;                    // запас без подписки
const STEP = (Number(process.env.ENERGY_MIN) || 10) * 60e3;          // одна единица раз в столько минут
const PRICE = Number(process.env.ENERGY_PRICE) || 150;               // листиков за полное восполнение
const BONUS = { plus: 2 };                                           // Plus — запас вдвое больше; Pro и Max играют без ограничений
const cap = u => MAX * (BONUS[C.tierOf(u)] || 1);
const endless = u => !ON || ['pro', 'max'].includes(C.tierOf(u));
// Состояние хранится как «сколько было и когда»: восстановление считается на лету, таймеров нет.
function state(u) {
  const m = cap(u), e = u.energy || { n: m, at: now() }, t = now();
  let n = Math.min(m, e.n), at = e.at;
  if (n < m) { const got = Math.floor((t - at) / STEP); if (got > 0) { n = Math.min(m, n + got); at = n >= m ? t : at + got * STEP; } } else at = t;
  return { n, at, max: m };
}
const view = u => { if (endless(u)) return { on: ON, inf: true, n: 0, max: 0, next: 0, price: PRICE, step: STEP }; const s = state(u); return { on: true, inf: false, n: s.n, max: s.max, next: s.n < s.max ? Math.max(1000, s.at + STEP - now()) : 0, price: PRICE, step: STEP }; };
const isGame = id => { const a = (Hub.APPS || []).find(x => x.id === id); return !!a && a.cat === 'games'; };

H['energy.get'] = c => view(db.users[c.uid]);
H['energy.use'] = (c, p) => {
  const u = db.users[c.uid], app = str(p.app, 16);
  if (endless(u) || !isGame(app)) return { ok: true, ...view(u) };
  const s = state(u);
  if (s.n < 1) return { ok: false, ...view(u) };      // не ошибка: окно само предложит подождать или восполнить
  u.energy = { n: s.n - 1, at: s.n >= s.max ? now() : s.at }; save();
  return { ok: true, ...view(u) };
};
H['energy.refill'] = c => {
  const u = db.users[c.uid]; need(ON && !endless(u), 'У вас и так энергии сколько угодно');
  const s = state(u); need(s.n < s.max, 'Энергия уже полная');
  R.spend(u, PRICE, 'Или подождите: энергия восстанавливается сама.');
  u.energy = { n: s.max, at: now() }; save(); R.selfUpdate(u);
  return { ok: true, stars: u.stars, ...view(u) };
};
module.exports = { view, ON, MAX, PRICE };
