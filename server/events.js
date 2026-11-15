'use strict';
// События по календарю: «Чёрная пятница на пляже», зимняя коллекция, адвент-календарь, «Тайный Санта», гонка «Снежный ком», «Голый Новый год».
// Всё считается из даты по московскому времени, включать руками ничего не нужно. Для проверки: EVENTS_NOW=2026-12-01T09:00:00+03:00
// сдвигает часы событий (на боевом сервере не задавать).
const C = require('./core');
const R = require('./rpc');
const A = require('./auth');
const Shop = require('./shop');
const Gifts = require('./gifts');
const { db, save, need, str, id: newId } = C;
const H = R.H;

const SHIFT = process.env.EVENTS_NOW ? (Date.parse(process.env.EVENTS_NOW) || Date.now()) - Date.now() : 0;
const T = () => Date.now() + SHIFT;
const MSK = 3 * 3600e3, DAY = 864e5;
const at = (y, m, d, h = 0) => Date.UTC(y, m - 1, d, h) - MSK;      // московское время → метка
const mskDate = (t = T()) => new Date(t + MSK).toISOString().slice(0, 10);
// Год сезона: до середины января считаем, что идёт прошлогодняя зима, — иначе «Новый год» оборвался бы в полночь.
const year = () => new Date(T() + MSK - 15 * DAY).getUTCFullYear();
const WIN = y => ({
  bf: [at(y, 11, 24), at(y, 12, 1)],
  winter: [at(y, 12, 1), at(y + 1, 1, 15)],
  advent: [at(y, 12, 1), at(y, 12, 26)],
  santa: [at(y, 12, 10), at(y + 1, 1, 1)],
  snow: [at(y, 12, 1), at(y + 1, 1, 1)],
  ny: [at(y, 12, 31, 20), at(y + 1, 1, 2, 20)],
  // календарь года: по событию на месяц (правила, задания и игры — в server/year.js)
  jan: [at(y, 1, 16), at(y, 2, 1)], feb: [at(y, 2, 10), at(y, 2, 17)], mar: [at(y, 3, 1), at(y, 3, 11)], apr: [at(y, 4, 1), at(y, 4, 8)], may: [at(y, 5, 1), at(y, 5, 12)],
  jun: [at(y, 6, 10), at(y, 6, 17)], jul: [at(y, 7, 10), at(y, 7, 25)], aug: [at(y, 8, 22), at(y, 9, 1)], sep: [at(y, 9, 1), at(y, 9, 11)], oct: [at(y, 10, 25), at(y, 11, 2)],
});
const X = { ticks: [], decor: null, cmd: null };      // сюда подключается календарь года
const win = k => WIN(year())[k];
const on = k => { const w = win(k), t = T(); return !!w && t >= w[0] && t < w[1]; };
const sys = () => db.users[db.meta.sys];
const uname = u => R.uname(u) || 'Кто-то';
const tell = (u, text, extra) => { const bot = sys(); if (!bot || !u || u.deleted || u.bot) return null; try { return C.postMessage(C.openDm(bot.id, u.id), bot.id, { text, ...extra }, { quiet: true }); } catch (e) { console.warn('[events]', e.message); return null; } };
const credit = (u, n) => { u.stars = (u.stars || 0) + n; R.selfUpdate(u); };
const common = () => { const ch = db.meta.common && db.chats[db.meta.common]; return ch && sys() ? ch : null; };

// ───── магазин: скидка «Чёрной пятницы» на обычные украшения и окна продажи вещей событий
const BF_OFF = 40;
Shop.ev.on = on;
Shop.ev.till = k => (win(k) || [0, 0])[1];
Shop.ev.off = it => (on('bf') && !it.ev && it.price > 0 && it.tier !== 'season' ? BF_OFF : 0);
Shop.ev.sale = 'Чёрная пятница';

// ───── адвент-календарь: 1–25 декабря, одно окошко в день. Пропущенное без «Золотого билета» не открыть.
const TICKET = 500;
const ADVENT = { 1: 50, 2: 60, 3: 50, 4: 70, 5: 60, 6: 80, 7: { item: 'frame_snow', alt: 300 }, 8: 50, 9: 60, 10: 70, 11: 50, 12: 80, 13: 60, 14: { plan: 3, alt: 150 }, 15: 50, 16: 70, 17: 60, 18: 80, 19: 50, 20: 100, 21: 70, 22: 80, 23: 100, 24: 150, 25: { gift: 'tree', n: 200 } };
const adv = u => { const y = year(); if (!u.advent || u.advent.y !== y) u.advent = { y, got: [] }; return u.advent; };
const adventDay = () => { const w = win('advent'), t = T(); return t < w[0] ? 0 : t >= w[1] ? 26 : Math.floor((t - w[0]) / DAY) + 1; };
const prizeText = (d, x2) => { const p = ADVENT[d]; if (typeof p === 'number') return `${p * (x2 ? 2 : 1)} 🍃`; if (p.item) return 'рамка «Снежинка» ❄️'; if (p.plan) return `Pro на ${p.plan} дня`; return `подарок 🎄 Ёлка и ${p.n * (x2 ? 2 : 1)} 🍃`; };
function adventView(u) {
  const a = adv(u), today = adventDay(), w = win('advent');
  return { from: w[0], to: w[1], today: today >= 1 && today <= 25 ? today : 0, over: today > 25, ticket: !!a.ticket, price: TICKET,
    days: Object.keys(ADVENT).map(Number).map(d => ({ d, got: a.got.includes(d), state: a.got.includes(d) ? 'got' : d === today ? 'today' : d < today ? (a.ticket && today <= 25 ? 'late' : 'missed') : 'locked', special: typeof ADVENT[d] !== 'number', prize: a.got.includes(d) || d <= today || typeof ADVENT[d] !== 'number' ? prizeText(d, a.ticket) : undefined })) };
}
H['advent.get'] = c => adventView(db.users[c.uid]);
H['advent.ticket'] = c => {
  const u = db.users[c.uid], a = adv(u); need(on('advent'), 'Адвент-календарь работает с 1 по 25 декабря'); need(!a.ticket, 'Золотой билет у вас уже есть');
  R.spend(u, TICKET, 'Листики копятся ежедневным бонусом и в «Листопаде».'); a.ticket = T(); save(); R.selfUpdate(u);
  return { advent: adventView(u), stars: u.stars };
};
H['advent.open'] = (c, p) => {
  const u = db.users[c.uid], a = adv(u), today = adventDay(), d = Number(p.day) || today;
  need(on('advent') && today >= 1 && today <= 25, 'Адвент-календарь работает с 1 по 25 декабря'); need(ADVENT[d], 'Такого окошка нет');
  need(!a.got.includes(d), 'Это окошко уже открыто'); need(d <= today, 'Это окошко откроется ' + d + ' декабря. Подглядывать нехорошо.');
  need(d === today || a.ticket, 'Этот день пропущен. Открыть пропущенные окошки можно с «Золотым билетом».');
  A.limit('advent:' + u.id, 30, 60000);
  const pr = ADVENT[d], k = a.ticket ? 2 : 1, out = { day: d };
  if (typeof pr === 'number') { out.n = pr * k; }
  else if (pr.item) { if (Shop.owns(u, pr.item)) out.n = pr.alt; else { Shop.own(u, pr.item); out.item = Shop.CATALOG[pr.item].name; } }
  else if (pr.plan) { if ((C.TIERS[C.tierOf(u)] || 0) >= C.TIERS.pro) out.n = pr.alt; else { u.trialUntil = Math.max(u.trialUntil || 0, Date.now()) + pr.plan * DAY; out.plan = pr.plan; } }
  else if (pr.gift) {
    out.n = pr.n * k; const g = Gifts.BY.get(pr.gift), bot = sys();
    if (g && bot && Gifts.ofUser(u.id).length < Gifts.KEEP) { const x = { id: newId(), g: g.id, from: bot.id, to: u.id, ts: Date.now(), text: 'Из адвент-календаря', free: true }; db.gifts[x.id] = x; out.gift = `${g.e} ${g.name}`; }
  }
  a.got.push(d); if (out.n) u.stars = (u.stars || 0) + out.n;
  save(); Shop.touch(u);
  return { ...out, advent: adventView(u), stars: u.stars || 0 };
};

// ───── «Тайный Санта»: запись 10–24 декабря, жеребьёвка 25-го, подарок подопечному на 100–500 листиков до конца года
const SANTA = { min: 100, max: 500, need: 3 };
const santa = () => { const y = year(); if (!db.meta.santa || db.meta.santa.y !== y) db.meta.santa = { y, users: {}, pairs: null, done: {} }; return db.meta.santa; };
const drawAt = () => at(year(), 12, 25);
function santaView(u) {
  const s = santa(), w = win('santa'), t = T(), ward = s.pairs && db.users[s.pairs[u.id]];
  return { from: w[0], draw: drawAt(), to: w[1], state: t < w[0] ? 'soon' : t < drawAt() ? 'signup' : t < w[1] ? 'give' : 'over', joined: !!s.users[u.id], n: Object.keys(s.users).length, min: SANTA.min, max: SANTA.max, need: SANTA.need,
    drawn: !!s.drawn, few: !!s.few, ward: ward && !ward.deleted ? C.pubUser(ward, u.id) : null, done: !!s.done[u.id],
    gifts: ward ? Gifts.GIFTS.filter(g => !g.lim && Gifts.live(g) && g.price >= SANTA.min && g.price <= SANTA.max).map(g => ({ id: g.id, e: g.e, name: g.name, price: g.price })) : undefined };
}
function santaJoin(u) {
  const s = santa(), t = T(), w = win('santa'); need(t >= w[0], 'Запись в «Тайного Санту» откроется 10 декабря'); need(t < drawAt() && !s.drawn, 'Запись закрыта: жеребьёвка уже прошла');
  need(!u.bot, 'Боты в Санту не играют'); s.users[u.id] = s.users[u.id] || T(); save(); return santaView(u);
}
H['santa.get'] = c => santaView(db.users[c.uid]);
H['santa.join'] = c => santaJoin(db.users[c.uid]);
H['santa.leave'] = c => { const s = santa(), u = db.users[c.uid]; need(!s.drawn, 'Жеребьёвка уже прошла: подопечный ждёт подарка'); delete s.users[u.id]; save(); return santaView(u); };
H['santa.give'] = (c, p) => {
  const s = santa(), u = db.users[c.uid], o = s.pairs && db.users[s.pairs[u.id]]; need(o && !o.deleted, 'Подопечного у вас нет');
  need(on('santa') && T() >= drawAt(), 'Дарить можно с 25 по 31 декабря'); need(!s.done[u.id], 'Вы уже подарили подарок подопечному');
  const g = Gifts.BY.get(str(p.gift, 24)); need(g && !g.lim && Gifts.live(g), 'Такого подарка на витрине нет'); need(g.price >= SANTA.min && g.price <= SANTA.max, `Подарок Санты — от ${SANTA.min} до ${SANTA.max} листиков`);
  need(Gifts.ofUser(o.id).length < Gifts.KEEP, 'У подопечного склад подарков забит под крышу'); A.limit('gift:' + u.id, 12, 60000);
  R.spend(u, g.price, 'Листики копятся ежедневным бонусом и в «Листопаде».');
  const x = { id: newId(), g: g.id, from: u.id, to: o.id, ts: Date.now(), text: 'От Тайного Санты 🎅', anon: true }; db.gifts[x.id] = x; s.done[u.id] = T(); save(); R.selfUpdate(u);
  tell(o, `🎅 **Тайный Санта принёс вам подарок:** ${g.e} ${g.name}.\nКто это был — секрет. Подарок уже лежит в вашем профиле.`);
  return { santa: santaView(u), stars: u.stars };
};
function drawSanta() {
  const s = santa(); if (s.drawn || T() < drawAt() || T() >= win('santa')[1]) return;
  const ids = Object.keys(s.users).filter(i => db.users[i] && !db.users[i].deleted && !db.users[i].banned);
  s.drawn = T();
  if (ids.length < SANTA.need) { s.few = true; save(); for (const i of ids) tell(db.users[i], `🎅 **Тайный Санта в этом году не собрался:** записалось меньше ${SANTA.need} человек. Листики целы, попробуем через год.`); return; }
  for (let i = ids.length - 1; i > 0; i--) { const j = require('crypto').randomInt(0, i + 1); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  s.pairs = {}; ids.forEach((v, i) => { s.pairs[v] = ids[(i + 1) % ids.length]; });      // по кругу: каждый дарит следующему, сам себе никто не выпадет
  save();
  for (const i of ids) { const o = db.users[s.pairs[i]]; tell(db.users[i], `🎅 **Тайный Санта: жеребьёвка прошла.**\nВаш подопечный — **${uname(o)}**${o.username ? ' (@' + o.username + ')' : ''}.\nПодарите подарок на ${SANTA.min}–${SANTA.max} 🍃 до 31 декабря: «Хаб» → «События» → «Тайный Санта». Имя дарителя подопечный не увидит.`); }
  console.log(`[events] Тайный Санта: пар ${ids.length}`);
}

// ───── «Снежный ком»: гонка приглашений в декабре. Снежинка — за друга, который пришёл по ссылке и написал несколько сообщений.
const SNOW = { msgs: 5, perDay: 10, min: 3, leaf: 10, prizes: [[3, 'max', 'Max'], [10, 'pro', 'Pro'], [100, 'plus', 'Plus']] };
const snow = () => { const y = year(); if (!db.meta.snow || db.meta.snow.y !== y) db.meta.snow = { y, pts: {}, awarded: 0 }; return db.meta.snow; };
const board = () => { const s = snow(); return Object.entries(s.pts).filter(([i, n]) => n > 0 && db.users[i] && !db.users[i].deleted).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)); };
A.hooks.onInvite.push((inv, u) => { if (on('snow')) u.snowBy = { y: year(), by: inv.id, n: 0 }; });
const sentBefore = R.hook.sent;
R.hook.sent = (uid, chat) => {
  if (sentBefore) sentBefore(uid, chat);
  const u = db.users[uid], sb = u && u.snowBy; if (!sb || sb.done || sb.y !== year() || !on('snow')) return;
  if (chat.type === 'saved' || (chat.type === 'dm' && (db.users[chat.members && Object.keys(chat.members).find(m => m !== uid)] || {}).bot)) return;      // заметки себе и болтовня с ботами не считаются
  if (++sb.n < SNOW.msgs) return;
  sb.done = 1; const inv = db.users[sb.by]; if (!inv || inv.deleted || inv.banned) return;
  const d = mskDate(); if (inv.snowDay !== d) { inv.snowDay = d; inv.snowToday = 0; }
  if (++inv.snowToday > SNOW.perDay) return;      // потолок на день — от накрутки пустышками
  const s = snow(); s.pts[inv.id] = (s.pts[inv.id] || 0) + 1; save();
  C.emit(inv.id, 'toast', { text: `❄️ +1 снежинка: ${uname(u)} освоился(ась) в «Нудисте». У вас ${s.pts[inv.id]}.` });
};
function snowView(u) {
  const s = snow(), w = win('snow'), b = board(), place = b.findIndex(([i]) => i === u.id);
  return { from: w[0], to: w[1], on: on('snow'), awarded: !!s.awarded, me: s.pts[u.id] || 0, place: place < 0 ? 0 : place + 1, min: SNOW.min, msgs: SNOW.msgs, leaf: SNOW.leaf,
    prizes: SNOW.prizes.map(([to, , name], i) => ({ from: i ? SNOW.prizes[i - 1][0] + 1 : 1, to, name })),
    top: b.slice(0, 100).map(([i, n]) => ({ user: C.pubUser(db.users[i], u.id), n })) };
}
H['snow.get'] = c => snowView(db.users[c.uid]);
function awardSnow() {
  const s = snow(); if (s.awarded || T() < win('snow')[1]) return;
  s.awarded = T(); const b = board();
  b.forEach(([i, n], k) => {
    const u = db.users[i], leaves = n * SNOW.leaf, pr = n >= SNOW.min ? SNOW.prizes.find(p => k < p[0]) : null; credit(u, leaves);
    if (pr) Shop.grantPlan(u, pr[1], 30, { noBoosts: true }); if (pr && k < 10) u.snowWin = s.y;
    Shop.touch(u);
    tell(u, `❄️ **«Снежный ком» закончился.** Ваше место — ${k + 1}, снежинок — ${n}.\nСнежинки превратились в ${leaves} 🍃.${pr ? `\nПриз: «Нудист ${pr[2]}» на 30 дней${k < 10 ? ' и золотой значок рядом с именем' : ''}.` : `\nДля призового тарифа нужно было минимум ${SNOW.min} снежинки.`}`);
  });
  save(); console.log(`[events] Снежный ком: награждено ${b.length}`);
}

// ───── «Голый Новый год»: раз в час бот бросает в общий чат мандарин — кто первый нажал, тому листики
const TANG = { n: 200, quiet: [2, 9] };      // ночью по Москве мандарины не падают
function dropTangerine() {
  if (!on('ny') || !db.flags.stars) return; const ch = common(); if (!ch) return;
  const t = T(), hour = Math.floor(t / 3600e3), h = new Date(t + MSK).getUTCHours(), ny = db.meta.ny = db.meta.ny || {};
  if (ny.h === hour || (h >= TANG.quiet[0] && h < TANG.quiet[1])) return;
  if (ny.msg && !ny.won) { const old = C.findMsg(db.chats[ny.chat] || ch, ny.msg); if (old && old.btn) { old.text = '🍊 Мандарин укатился под ёлку. Никто не поймал.'; delete old.btn; C.updateMsg(db.chats[ny.chat] || ch, old); } }
  const m = C.postMessage(ch, sys().id, { text: `🍊 **Мандарин!** Кто первый нажмёт кнопку — получит ${TANG.n} 🍃. Один мандарин в день на человека.`, btn: [[{ t: 'Поймать 🍊', d: 'ev:tang:' + hour }]] }, { quiet: true });
  db.meta.ny = { h: hour, msg: m.id, chat: ch.id }; save();
}
function button(c, chat, m, data) {
  const [, act, arg] = data.split(':'), u = db.users[c.uid];
  if (act === 'santa') { santaJoin(u); return { toast: 'Вы в игре. Жеребьёвка — 25 декабря.' }; }
  if (act === 'tang') {
    const ny = db.meta.ny || {}; need(on('ny') && String(ny.h) === arg && !ny.won, 'Этот мандарин уже поймали');
    const d = mskDate(); need(u.tangDay !== d, 'Сегодня вы уже поймали мандарин. Оставьте и другим.');
    ny.won = u.id; u.tangDay = d; credit(u, TANG.n);
    m.text = `🍊 Мандарин поймал(а) **${uname(u)}**: +${TANG.n} 🍃. Следующий — через час.`; delete m.btn; C.updateMsg(chat, m);
    return { toast: `+${TANG.n} 🍃. С Новым годом!` };
  }
  return {};
}

// ───── список событий для экрана «События»
const fmt = t => new Date(t + MSK).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' });
const LIST = [
  { id: 'jan', e: '🧊', name: 'Голый январь', about: 'Месяц без лишнего. Ежедневный бонус листиков — вдвое больше. Разберите старые переписки, пробегитесь по морозу и заберите марку в альбом. В магазине — тема «Минимализм» и эффект «Чистый лист».', go: 'shop' },
  { id: 'feb', e: '💌', name: 'Анонимные валентинки', about: 'Отправьте валентинку из профиля человека — он не узнает, от кого. Если симпатия взаимная, имена откроются обоим. Подарки: Сердечко, Разбитое сердце и Стрела Амура, рамка «Купидон».', go: 'shop' },
  { id: 'mar', e: '🌷', name: 'Весенняя линька', about: 'Сбрасываем зимнюю шкуру. Подарки «Тюльпаны» и «Мимоза», рамка «Цветение», эффект «Лепестки». Позовите трёх друзей — получите бесплатный буст для своей группы.', go: 'shop' },
  { id: 'apr', e: '🃏', name: 'День смеха', about: '1 апреля каждое ваше сообщение вылетает со случайным эффектом — бесплатно. Бот «Нудист» раздаёт предсказания: команда /prediction. Рамка «Джокер» — в магазине, а тема «Матрица» спрятана: её не купить, только найти.', go: 'shop' },
  { id: 'may', e: '🏖️', name: 'Открытие пляжного сезона', about: 'Зашли 1 мая — рамка «Первопроходец» ваша навсегда. По выходным группы соревнуются, кто больше наговорит: первым трём — бусты. Подарки «Шезлонг» и «Пляжный мяч».', go: 'shop' },
  { id: 'jun', e: '🎂', name: 'День рождения Нудиста', about: 'Каждый, кто заглянул на этой неделе, получает в профиль «Золотой листок» — его нельзя продать, только хранить. Рамка «Именинник» и праздничная игра.', go: 'shop' },
  { id: 'jul', e: '🦑', name: 'Игра на выживание', about: 'Шесть испытаний по очереди: каждое открывается после предыдущего. Дошли до конца — рамка «Выживший», которой нет в магазине. Застряли — уровень можно пропустить за листики.' },
  { id: 'aug', e: '🌇', name: 'Проводы лета', about: 'Распродажа «Всё по 100»: простые рамки, градиенты, темы и стикеры — по 100 🍃. Коллекция «Закат»: подарки «Сангрия», «Гитара» и «Плед для пикника», рамка «Закат».', go: 'shop' },
  { id: 'sep', e: '☕', name: 'Снова в школу', about: 'Осень, дождь, дедлайны. Тема «Дождливый город», эффект «Антистресс», подарки «Кофе с собой», «Кружка» и «Плед». Тихие часы для уведомлений — в настройках, бесплатно всем.', go: 'shop' },
  { id: 'oct', e: '🎃', name: 'Хэллоуин', about: 'Коллекция «Монстры»: подарки Тыква, Призрак и Гроб, эффекты «Паутина» и «Летучие мыши», рамка «Вампир». Трое лучших в «Ночи тыкв» получают рамку бесплатно.', go: 'shop' },
  { id: 'bf', e: '🖤', name: 'Чёрная пятница на пляже', about: `Все обычные украшения в магазине — со скидкой ${BF_OFF} %. Только на этой неделе: рамка «Чёрный лист», эффект «Золотой песок», тема «Ночной пляж» и подарок «Чёрная жемчужина» тиражом 50 штук.`, go: 'shop' },
  { id: 'winter', e: '❄️', name: 'Зимняя коллекция', about: 'Подарки: Снежок, Глинтвейн, Шарф, Ёлка, Олень и «Дед Мороз в шортах» тиражом 50 штук. В магазине — рамки «Снежинка» и «Подарочная лента», тема «Новый год». После 14 января исчезнут с витрины; купленное остаётся.', go: 'shop' },
  { id: 'advent', e: '🎁', name: 'Адвент-календарь', about: 'Каждый день с 1 по 25 декабря — одно окошко с листиками. 7-го — рамка «Снежинка», 14-го — Pro на три дня, 25-го — Ёлка в профиль. Пропустили день — окошко сгорает, если нет «Золотого билета».' },
  { id: 'santa', e: '🎅', name: 'Тайный Санта', about: `Запись до 24 декабря. 25-го каждому достаётся случайный подопечный — подарите ему подарок на ${SANTA.min}–${SANTA.max} 🍃. Кто кому дарил, остаётся тайной.` },
  { id: 'snow', e: '☃️', name: 'Снежный ком', about: `Зовите друзей весь декабрь. За каждого, кто пришёл по вашей ссылке и написал ${SNOW.msgs} сообщений, — снежинка ❄️. 1 января: места 1–3 — Max на месяц, 4–10 — Pro, 11–100 — Plus (нужно минимум ${SNOW.min} снежинки), десятке — золотой значок. Каждая снежинка ещё и превращается в ${SNOW.leaf} 🍃.` },
  { id: 'ny', e: '🎆', name: 'Голый Новый год', about: `С 20:00 31 декабря на 48 часов: эффект «Фейерверк», рамка «Корона 2027», подарок «Шампанское». Раз в час в общем чате падает мандарин 🍊 — первый поймавший получает ${TANG.n} 🍃. Каждый буст группы считается за два.`, go: 'shop' },
];
function list() {
  const t = T(), W = WIN(year()), next = WIN(year() + 1); for (const k in W) if (t - W[k][1] > 7 * DAY) W[k] = next[k];      // давно прошедшее показываем как будущее: окно следующего года
  return { now: t, list: LIST.map(e => ({ ...e, ...(X.decor ? X.decor(e.id) : null), from: W[e.id][0], to: W[e.id][1], state: t < W[e.id][0] ? 'soon' : t < W[e.id][1] ? 'on' : 'over' })).filter(e => (e.state === 'on') || (e.state === 'soon' && e.from - t < 60 * DAY) || (e.state === 'over' && t - e.to < 7 * DAY)).sort((a, b) => (a.state === 'on' ? 0 : a.state === 'soon' ? 1 : 2) - (b.state === 'on' ? 0 : b.state === 'soon' ? 1 : 2) || a.from - b.from) };
}
H['event.list'] = () => list();

// ───── объявления в общем чате: по одному на событие, без рассылки в личку и без пушей
const SAY = y => [
  ['jan', at(y, 1, 16, 10), '🧊 **Голый январь** — до 31 января. Ежедневный бонус вдвое больше, задания на «убрать лишнее» и зимний забег. «Хаб» → «События».'],
  ['feb', at(y, 2, 10, 10), '💌 **Анонимные валентинки** — до 16 февраля. Откройте профиль человека и нажмите «Валентинка»: он не узнает, от кого. Совпали — имена откроются обоим.'],
  ['mar', at(y, 3, 1, 10), '🌷 **Весенняя линька** — до 10 марта. Тюльпаны, мимоза, рамка «Цветение» и буст группе за трёх приглашённых друзей.'],
  ['apr', at(y, 4, 1, 9), '🃏 **День смеха.** Сегодня у всех случайные эффекты на сообщениях, а бот «Нудист» раздаёт предсказания: /prediction. Неделю ищем спрятанную тему «Матрица».'],
  ['may', at(y, 5, 1, 9), '🏖️ **Пляжный сезон открыт!** Кто зашёл сегодня — рамка «Первопроходец» навсегда. По выходным — гонка групп.'],
  ['jun', at(y, 6, 10, 10), '🎂 **«Нудисту» год!** Каждому, кто заглянет до 16 июня, — «Золотой листок» в профиль. «Хаб» → «События».'],
  ['jul', at(y, 7, 10, 10), '🦑 **Игра на выживание** — до 24 июля. Шесть испытаний, одна рамка «Выживший». В магазине её нет.'],
  ['aug', at(y, 8, 22, 10), '🌇 **Проводы лета** — до 31 августа. Простые украшения — всё по 100 🍃. И коллекция «Закат».'],
  ['sep', at(y, 9, 1, 8), '☕ **Снова в школу** — до 10 сентября. Тема «Дождливый город», кофе с собой и забег «Не опоздай».'],
  ['oct', at(y, 10, 25, 10), '🎃 **Хэллоуин** — до 1 ноября. Коллекция «Монстры» и «Ночь тыкв»: трое лучших получат рамку «Вампир».'],
  ['bf', at(y, 11, 24, 10), '🖤 **Чёрная пятница на пляже** — до 30 ноября. Украшения в магазине со скидкой 40 %, а ещё три вещи и подарок, которых больше не будет. «Хаб» → «События».'],
  ['santa-soon', at(y, 11, 26, 12), '🎅 **Через две недели — «Тайный Санта».** Запись откроется 10 декабря: напишите боту «Нудист» /santa или загляните в «Хаб» → «События». Копите листики на подарок: 100–500 🍃.'],
  ['dec', at(y, 12, 1, 9), '❄️ **Зима на пляже.** С сегодняшнего дня: адвент-календарь (окошко с листиками каждый день), зимние подарки и гонка «Снежный ком» — зовите друзей, лучшим подписка в подарок. Всё в «Хаб» → «События».'],
  ['santa', at(y, 12, 10, 10), '🎅 **Запись в «Тайного Санту» открыта** до 24 декабря. Команда /santa боту «Нудист» или «Хаб» → «События». Жеребьёвка — 25-го.'],
  ['ny', at(y, 12, 31, 20), '🎆 **Голый Новый год начался!** 48 часов: эффект «Фейерверк», рамка «Корона 2027», подарок «Шампанское», двойные бусты групп. И каждый час здесь падает мандарин 🍊 — ловите первым.'],
];
function announce() {
  const ch = common(); if (!ch) return; const t = T(), y = year(), said = db.meta.evSaid = db.meta.evSaid || {};
  for (const [k, when, text] of SAY(y)) { if (said[k + y] || t < when || t > when + 2 * DAY) continue; said[k + y] = t; C.postMessage(ch, sys().id, { text }, { quiet: true }); save(); }
}

// ───── бот «Нудист»: /events, /advent, /santa, /snow
function botCmd(bot, chat, m, t) {
  const u = db.users[m.from], say = (text, extra) => C.postMessage(chat, bot.id, { text, ...extra }, { quiet: true }); if (!u) return;
  if (X.cmd && X.cmd(u, say, t)) return;
  if (/^\/santa/.test(t)) {
    const v = santaView(u);
    if (v.state === 'soon') return say(`🎅 Запись в «Тайного Санту» откроется ${fmt(v.from)}. Я напомню в общем чате.`);
    if (v.state === 'signup') return v.joined ? say(`🎅 Вы записаны. Участников: ${v.n}. Жеребьёвка — ${fmt(v.draw)}.`) : say(`🎅 **Тайный Санта.** ${fmt(v.draw)} каждому достанется случайный подопечный — ему нужно подарить подарок на ${v.min}–${v.max} 🍃. Участников уже: ${v.n}.`, { btn: [[{ t: 'Участвую 🎅', d: 'ev:santa:join' }]] });
    if (v.state === 'give') return say(v.ward ? (v.done ? '🎅 Подарок подопечному вручён. Спасибо, Санта.' : `🎅 Ваш подопечный — **${v.ward.name}**. Подарить: «Хаб» → «События» → «Тайный Санта».`) : '🎅 Жеребьёвка уже прошла. Запишитесь в следующем году.');
    return say('🎅 Санта отдыхает до следующего декабря.');
  }
  if (/^\/advent/.test(t)) { const v = adventView(u); return say(v.today ? `🎁 Сегодня ${v.today} декабря. Окошко ${v.days[v.today - 1].got ? 'уже открыто' : 'ждёт'}: «Хаб» → «События» → «Адвент-календарь».` : '🎁 Адвент-календарь работает с 1 по 25 декабря.'); }
  if (/^\/snow/.test(t)) { const v = snowView(u); return say(v.on ? `☃️ У вас ${v.me} ❄️${v.place ? `, место ${v.place}` : ''}. Таблица: «Хаб» → «События» → «Снежный ком».` : '☃️ «Снежный ком» катится с 1 по 31 декабря.'); }
  const l = list().list.filter(e => e.state !== 'over');
  say(l.length ? '**События**\n' + l.map(e => `${e.e} **${e.name}** — ${e.state === 'on' ? 'идёт до ' + fmt(e.to - 1) : 'с ' + fmt(e.from)}`).join('\n') + '\n\nПодробности: «Хаб» → «События».' : 'Сейчас событий нет. Отдыхаем.');
}

function tick() { for (const f of [announce, drawSanta, awardSnow, dropTangerine, ...X.ticks]) { try { f(); } catch (e) { console.error('[events]', e.message); } } }
setInterval(tick, 30e3).unref(); setTimeout(tick, 5000).unref();

module.exports = Object.assign(X, { on, win, list, button, botCmd, tick, T, year, at, mskDate, tell, credit, fmt, sys, uname, LIST, DAY, MSK });
