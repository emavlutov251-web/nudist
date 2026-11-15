'use strict';
// Календарь года: у каждого события — своя рисованная игра, три задания, марка в альбом и таблица рекордов.
// Окна событий и тексты объявлений лежат в server/events.js; здесь — правила. Часы сдвигаются переменной EVENTS_NOW.
const C = require('./core');
const R = require('./rpc');
const A = require('./auth');
const Ev = require('./events');
const Shop = require('./shop');
const Gifts = require('./gifts');
const { db, save, need, str, id: newId } = C;
const H = R.H, T = Ev.T, DAY = Ev.DAY, MSK = Ev.MSK;

// Задание: [счётчик, сколько нужно, текст, листики]. game — лучший результат за одну партию в игре события.
const CAL = {
  jan: { game: ['run', 'jan', 'Зарядка на морозе'], prize: { leaf: 100 }, tasks: [['daily', 5, 'Соберите ежедневный бонус 5 раз', 20], ['clean', 20, 'Удалите 20 своих сообщений старше недели', 30], ['game', 25, 'Наберите 25 очков в «Зарядке на морозе»', 30]] },
  feb: { game: ['catch', 'feb', 'Сердцеед'], top: 'frame_cupid', prize: { leaf: 100 }, tasks: [['val', 3, 'Отправьте 3 валентинки', 20], ['gift', 1, 'Подарите кому-нибудь подарок', 20], ['game', 30, 'Поймайте 30 сердец в «Сердцееде»', 30]] },
  mar: { game: ['pairs', 'mar', 'Весенний букет'], top: 'frame_bloom', prize: { leaf: 100 }, tasks: [['invite', 3, 'Позовите трёх друзей по своей ссылке', 0, { boost: 1 }], ['gift', 1, 'Подарите кому-нибудь подарок', 20], ['game', 34, 'Соберите «Весенний букет» за 26 ходов или быстрее', 30]] },
  apr: { game: ['run', 'apr', 'Банановый забег'], top: 'frame_joker', prize: { item: 'theme_matrix' }, tasks: [['msg', 30, 'Напишите 30 сообщений людям', 20], ['react', 15, 'Поставьте 15 реакций', 20], ['game', 40, 'Наберите 40 очков в «Банановом забеге»', 30]] },
  may: { game: ['catch', 'may', 'Пляжный волейбол'], prize: { leaf: 100 }, tasks: [['club', 20, 'Напишите 20 сообщений в клубах', 20], ['days', 4, 'Загляните в «Нудист» в 4 разных дня', 20], ['game', 35, 'Наберите 35 очков в «Пляжном волейболе»', 30]] },
  jun: { game: ['pairs', 'jun', 'Праздничный стол'], top: 'frame_bday', prize: { leaf: 127 }, tasks: [['msg', 20, 'Напишите 20 сообщений людям', 20], ['gift', 1, 'Подарите кому-нибудь подарок', 20], ['game', 34, 'Соберите «Праздничный стол» за 26 ходов или быстрее', 30]] },
  jul: { seq: true, skip: 300, game: ['run', 'jul', 'Полоса выживания'], prize: { item: 'frame_survivor' }, tasks: [['msg', 30, 'Напишите 30 сообщений людям', 15], ['react', 20, 'Поставьте 20 реакций', 15], ['voice', 5, 'Отправьте 5 голосовых', 20], ['game', 30, 'Наберите 30 очков в «Полосе выживания»', 20], ['gift', 2, 'Подарите два подарка', 20], ['days', 5, 'Продержитесь 5 разных дней', 30]] },
  aug: { game: ['catch', 'aug', 'Последний урожай'], top: 'frame_sunset', prize: { leaf: 100 }, tasks: [['msg', 25, 'Напишите 25 сообщений людям', 20], ['gift', 1, 'Подарите кому-нибудь подарок', 20], ['game', 40, 'Наберите 40 очков в «Последнем урожае»', 30]] },
  sep: { game: ['run', 'sep', 'Не опоздай'], prize: { leaf: 100 }, tasks: [['days', 5, 'Загляните в «Нудист» в 5 разных дней', 20], ['msg', 30, 'Напишите 30 сообщений людям', 20], ['game', 35, 'Наберите 35 очков в «Не опоздай»', 30]] },
  oct: { game: ['run', 'oct', 'Ночь тыкв'], top: 'frame_vampire', prize: { leaf: 100 }, tasks: [['gift', 1, 'Подарите кому-нибудь подарок', 20], ['react', 15, 'Поставьте 15 реакций', 20], ['game', 40, 'Наберите 40 очков в «Ночи тыкв»', 30]] },
  bf: { game: ['pairs', 'nov', 'Распродажа пар'], prize: { leaf: 100 }, tasks: [['days', 3, 'Загляните в «Нудист» в 3 разных дня', 20], ['msg', 20, 'Напишите 20 сообщений людям', 20], ['game', 34, 'Соберите «Распродажу пар» за 26 ходов или быстрее', 30]] },
  winter: { game: ['catch', 'dec', 'Мандариновый дождь'], prize: { leaf: 100 }, tasks: [['days', 7, 'Загляните в «Нудист» в 7 разных дней', 20], ['gift', 2, 'Подарите два подарка', 20], ['game', 40, 'Поймайте 40 мандаринов в «Мандариновом дожде»', 30]] },
};
const ORDER = Object.keys(CAL), NAME = Object.fromEntries(Ev.LIST.map(e => [e.id, e]));
const ALBUM = [[4, { leaf: 300 }], [8, { item: 'frame_season' }], [12, { item: 'frame_veteran' }]];      // марок собрано → награда
const active = () => ORDER.filter(k => Ev.on(k));
const gameUrl = k => `/miniapps/${CAL[k].game[0]}.html?t=${CAL[k].game[1]}`;
const state = u => { const y = Ev.year(); if (!u.yq || u.yq.y !== y) u.yq = { y, e: {}, stamps: [], album: 0 }; return u.yq; };
const quest = (u, k) => { const s = state(u); return s.e[k] || (s.e[k] = { c: {}, got: [], days: [] }); };
const prizeText = p => (!p ? '' : p.leaf ? `${p.leaf} 🍃` : p.boost ? 'бесплатный буст клуба' : p.item ? `${Shop.CATALOG[p.item].kind === 'theme' ? 'тема' : 'рамка'} «${Shop.CATALOG[p.item].name}»` : '');
function award(u, p) { if (!p) return; if (p.leaf) u.stars = (u.stars || 0) + p.leaf; if (p.boost) u.freeBoosts = (u.freeBoosts || 0) + p.boost; if (p.item) Shop.own(u, p.item); }
// Проверить задания события после изменения счётчика
function settle(u, k) {
  const ev = CAL[k], q = quest(u, k); let changed = false;
  for (let i = 0; i < ev.tasks.length; i++) {
    if (q.got.includes(i)) continue; const [key, n, text, leaf, extra] = ev.tasks[i];
    if ((q.c[key] || 0) < n) { if (ev.seq) break; continue; }
    q.got.push(i); changed = true; award(u, { leaf }); award(u, extra);
    C.emit(u.id, 'toast', { text: `${NAME[k].e} Задание выполнено: ${text}${leaf ? ` · +${leaf} 🍃` : ''}${extra ? ` · ${prizeText(extra)}` : ''}` });
  }
  if (!q.done && q.got.length === ev.tasks.length) {
    q.done = T(); changed = true; const s = state(u); if (!s.stamps.includes(k)) s.stamps.push(k); award(u, ev.prize);
    Ev.tell(u, `${NAME[k].e} **«${NAME[k].name}» пройдено.** Марка в альбоме, награда — ${prizeText(ev.prize)}. Марок в этом году: ${s.stamps.length}.`);
    for (const [n, p] of ALBUM) if (s.stamps.length >= n && s.album < n) { s.album = n; award(u, p); Ev.tell(u, `📮 **Альбом: ${n} ${n < 5 ? 'марки' : 'марок'}.** Награда — ${prizeText(p)}.`); }
  }
  if (changed) { save(); Shop.touch(u); }
}
// В последовательном испытании счётчики копятся только для текущего уровня
const counts = (ev, q, key) => { if (!ev.seq) return ev.tasks.some(t => t[0] === key); const cur = ev.tasks.findIndex((t, i) => !q.got.includes(i)); return cur >= 0 && ev.tasks[cur][0] === key; };
function bump(u, key, n = 1, best) {
  if (!u || u.bot || u.deleted) return;
  for (const k of active()) { const ev = CAL[k], q = quest(u, k); if (q.done || !counts(ev, q, key)) continue; q.c[key] = best ? Math.max(q.c[key] || 0, n) : (q.c[key] || 0) + n; settle(u, k); }
}
// Человек заглянул сегодня: дни для заданий, «Первопроходец» 1 мая, «Золотой листок» в день рождения
function visit(u) {
  if (!u || u.bot || u.deleted) return; const d = Ev.mskDate(); if (u.yv === d) return; u.yv = d;
  for (const k of active()) { const q = quest(u, k); if (!q.days.includes(d)) { q.days.push(d); if (!q.done && counts(CAL[k], q, 'days')) { q.c.days = q.days.length; settle(u, k); } } }
  if (Ev.on('may') && d.slice(5) === '05-01' && !Shop.owns(u, 'frame_pioneer')) { Shop.own(u, 'frame_pioneer'); Ev.tell(u, '🚩 **Вы открыли пляжный сезон.** Рамка «Первопроходец» ваша навсегда: «Магазин» → «Украшения».'); Shop.touch(u); }
  if (Ev.on('jun')) { const s = state(u), bot = Ev.sys(); if (!s.gold && bot && Gifts.ofUser(u.id).length < Gifts.KEEP) { s.gold = 1; const x = { id: newId(), g: 'goldleaf', from: bot.id, to: u.id, ts: Date.now(), free: true, text: 'С днём рождения «Нудиста»!' }; db.gifts[x.id] = x; Ev.tell(u, '🎂 **«Нудисту» год.** В вашем профиле — «Золотой листок». Продать его нельзя, только хранить.'); } }
  save();
}

// ───── счётчики: считаем там, где действие уже произошло и проверено
const sentBefore = R.hook.sent;
R.hook.sent = (uid, chat, m) => {
  if (sentBefore) sentBefore(uid, chat, m);
  const u = db.users[uid]; if (!u || chat.type === 'saved') return; visit(u);
  if (chat.type === 'dm' || chat.type === 'secret') { const o = db.users[C.membersOf(chat).find(x => x !== uid)]; if (!o || o.bot) return; }
  bump(u, 'msg'); if (m && m.type === 'voice') bump(u, 'voice');
  if (chat.server) { bump(u, 'club'); race(u, chat.server); }
};
const reactedBefore = R.hook.reacted;
R.hook.reacted = (uid, m) => { if (reactedBefore) reactedBefore(uid, m); if (m.from !== uid) bump(db.users[uid], 'react'); };
const wrap = (name, fn) => { const f = H[name]; if (!f) return console.warn('[year] нет обработчика', name); H[name] = (c, p) => fn(f, c, p || {}); };
wrap('gift.send', (f, c, p) => { const r = f(c, p); if (p.to !== c.uid) bump(db.users[c.uid], 'gift'); return r; });
wrap('stars.daily', (f, c, p) => {
  const r = f(c, p), u = db.users[c.uid]; bump(u, 'daily');
  if (Ev.on('jan') && r && r.n > 0) { u.stars = (u.stars || 0) + r.n; r.x2 = true; r.n *= 2; r.stars = u.stars; save(); R.selfUpdate(u); }      // «Голый январь»: бонус вдвое
  return r;
});
wrap('msg.del', (f, c, p) => {
  let old = 0; try { const lim = Date.now() - 7 * DAY; for (const i of (Array.isArray(p.ids) ? p.ids : []).slice(0, 200)) { const m = C.findMsg(String(p.chat), i); if (m && m.from === c.uid && m.type !== 'service' && m.ts < lim) old++; } } catch (e) { old = 0; }
  const r = f(c, p); if (old) bump(db.users[c.uid], 'clean', old); return r;
});
wrap('event.list', (f, c, p) => { if (c && c.uid) visit(db.users[c.uid]); return f(c, p); });
A.hooks.onInvite.push(inv => bump(inv, 'invite'));
// 1 апреля сообщения вылетают со случайным эффектом — у кого своего нет
const fxBefore = R.hook.fx, FOOL = ['confetti', 'bubbles', 'sparkle', 'hearts'];
R.hook.fx = u => fxBefore(u) || (Ev.on('apr') && Ev.mskDate().slice(5) === '04-01' ? FOOL[Math.floor(Math.random() * FOOL.length)] : null);
// «Проводы лета»: простые украшения — по 100 листиков
const offBefore = Shop.ev.off, saleBefore = Shop.ev.sale;
Shop.ev.off = it => Math.max(offBefore(it), Ev.on('aug') && !it.ev && it.tier === 'common' && it.price > 100 ? 100 - 10000.5 / it.price : 0);
Object.defineProperty(Shop.ev, 'sale', { get: () => (Ev.on('aug') ? 'Всё по 100' : saleBefore) });

// ───── таблицы рекордов: у события — своя на всё событие, у обычной игры — на неделю. Партия идёт в браузере, поэтому призы — только украшения.
const GAMES = { catch: 'Пляжный ловец', run: 'Пляжная пробежка', pairs: 'Пляжные пары' }, SCORE_MAX = { catch: 3000, run: 3000, pairs: 52 };
const week = () => { const t = T() + MSK, d = new Date(t - ((new Date(t).getUTCDay() + 6) % 7) * DAY); return d.toISOString().slice(0, 10); };
const evOf = (app, t) => active().find(k => CAL[k].game[0] === app && CAL[k].game[1] === t);
const boardKey = (app, t) => { const k = evOf(app, t); return k ? `ev:${k}:${Ev.year()}` : `w:${app}:${week()}`; };
const tops = () => (db.meta.tops = db.meta.tops || {});
function topView(key, uid) {
  const b = tops()[key] || {}, rows = Object.entries(b).filter(([i]) => db.users[i] && !db.users[i].deleted && !db.users[i].banned).sort((a, c) => c[1] - a[1] || (a[0] < c[0] ? -1 : 1)), at = rows.findIndex(r => r[0] === uid);
  return { top: rows.slice(0, 10).map(([i, n]) => ({ user: C.pubUser(db.users[i], uid), n })), n: rows.length, place: at < 0 ? 0 : at + 1, best: b[uid] || 0 };
}
H['apps.score'] = (c, p) => {
  const u = db.users[c.uid], app = str(p.app, 16), t = str(p.t, 8); need(Object.prototype.hasOwnProperty.call(GAMES, app), 'В этой игре таблицы нет');
  const n = Math.floor(Number(p.score)); need(n >= 0 && n <= SCORE_MAX[app], 'Такого результата не бывает'); A.limit('score:' + u.id, 30, 60000);
  const key = boardKey(app, t), all = tops(), b = all[key] || (all[key] = {});
  if (n > (b[u.id] || 0) && (b[u.id] || Object.keys(b).length < 5000)) { b[u.id] = n; for (const k of Object.keys(all)) if (k.startsWith('w:') && k.slice(-10) < new Date(T() + MSK - 15 * DAY).toISOString().slice(0, 10)) delete all[k]; save(); }
  const k = evOf(app, t); if (k) bump(u, 'game', n, true);
  return { ...topView(key, u.id), score: n, event: k ? NAME[k].name : undefined };
};
H['apps.top'] = (c, p) => { const app = str(p.app, 16); need(Object.prototype.hasOwnProperty.call(GAMES, app), 'В этой игре таблицы нет'); return topView(boardKey(app, str(p.t, 8)), c.uid); };
// Игра события в списке приложений заменяет обычную: то же приложение, другое оформление
Ev.gameTiles = () => Object.fromEntries(active().map(k => [CAL[k].game[0], { title: CAL[k].game[2], url: gameUrl(k), ev: k, about: `Игра события «${NAME[k].name}». Рекорды идут в таблицу события.` }]));
// После события трое лучших получают его рамку
function awardTops() {
  const t = T(), y = Ev.year(), done = db.meta.yTop = db.meta.yTop || {};
  for (const k of ORDER) {
    const w = Ev.win(k), item = CAL[k].top; if (!item || done[k + y] || t < w[1] || t > w[1] + 7 * DAY) continue; done[k + y] = t;
    const rows = Object.entries(tops()[`ev:${k}:${y}`] || {}).filter(([i]) => db.users[i] && !db.users[i].deleted && !db.users[i].banned).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 3);
    rows.forEach(([i], n) => { const u = db.users[i]; Shop.own(u, item); Shop.touch(u); Ev.tell(u, `🏆 **${n + 1}-е место в «${CAL[k].game[2]}».** Рамка «${Shop.CATALOG[item].name}» ваша: «Магазин» → «Украшения».`); });
    save();
  }
}

// ───── гонка клубов: выходные «Открытия сезона»
const RACE = { perDay: 40, prizes: [5, 3, 1] };
const raceState = () => { const y = Ev.year(); if (!db.meta.race || db.meta.race.y !== y) db.meta.race = { y, pts: {}, day: {} }; return db.meta.race; };
function race(u, sid) {
  if (!Ev.on('may')) return; const wd = new Date(T() + MSK).getUTCDay(); if (wd !== 0 && wd !== 6) return;
  const r = raceState(), d = Ev.mskDate(), mine = r.day[u.id]; if (!mine || mine[0] !== d) r.day[u.id] = [d, 0];
  if (++r.day[u.id][1] > RACE.perDay) return;      // потолок на человека в день — чтобы не побеждал тот, кто громче флудит
  r.pts[sid] = (r.pts[sid] || 0) + 1; save();
}
const raceRows = () => Object.entries(raceState().pts).filter(([i]) => db.servers[i]).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
function awardRace() {
  const w = Ev.win('may'), t = T(), r = raceState(); if (r.done || t < w[1] || t > w[1] + 7 * DAY) return; r.done = t;
  const rows = raceRows().slice(0, 3); rows.forEach(([i], n) => { const s = db.servers[i]; s.boosts = (s.boosts || 0) + RACE.prizes[n]; });
  const ch = db.meta.common && db.chats[db.meta.common], bot = Ev.sys();
  if (ch && bot && rows.length) C.postMessage(ch, bot.id, { text: '🏖️ **Гонка клубов окончена.**\n' + rows.map(([i, n], k) => `${k + 1}. «${db.servers[i].name}» — ${n} сообщений, +${RACE.prizes[k]} к бустам`).join('\n') }, { quiet: true });
  save();
}

// ───── анонимные валентинки. Текста нет — только открытка из готовых, чтобы анонимность не стала способом писать гадости.
const VAL = { cards: 6, perDay: 5, reveal: 5000 };
const vals = () => { const y = Ev.year(); if (!db.meta.val || db.meta.val.y !== y) db.meta.val = { y, list: [] }; return db.meta.val; };
const valView = (x, uid) => ({ id: x.id, card: x.card, ts: x.ts, open: !!x.open, from: x.open ? C.pubUser(db.users[x.from], uid) : undefined, mutual: x.mutual || undefined });
H['val.get'] = c => { const l = vals().list; return { on: Ev.on('feb'), reveal: VAL.reveal, perDay: VAL.perDay, cards: VAL.cards, got: l.filter(x => x.to === c.uid).map(x => valView(x, c.uid)).reverse(), sent: l.filter(x => x.from === c.uid).map(x => ({ id: x.id, card: x.card, ts: x.ts, to: C.pubUser(db.users[x.to], c.uid), open: !!x.open, mutual: x.mutual || undefined })).reverse() }; };
H['val.send'] = (c, p) => {
  need(Ev.on('feb'), 'Валентинки принимаются с 10 по 16 февраля'); const u = db.users[c.uid], o = db.users[typeof p.to === 'string' ? p.to : '']; need(o && !o.deleted && !o.bot, 'Этому адресату валентинку не отправить'); need(o.id !== u.id, 'Себя мы и так любим');
  need(!(o.blocked || []).includes(u.id), 'Этот человек не принимает от вас сообщения'); const card = Math.floor(Number(p.card)); need(card >= 0 && card < VAL.cards, 'Такой открытки нет');
  const v = vals(), d = Ev.mskDate(); need(!v.list.some(x => x.from === u.id && x.to === o.id), 'Вы уже отправили этому человеку валентинку'); need(v.list.filter(x => x.from === u.id && x.d === d).length < VAL.perDay, `Не больше ${VAL.perDay} валентинок в день`); need(v.list.length < 20000, 'Почта Амура переполнена');
  const x = { id: newId(), from: u.id, to: o.id, card, ts: Date.now(), d }, back = v.list.find(y => y.from === o.id && y.to === u.id);
  if (back) { x.open = back.open = 1; x.mutual = back.mutual = 1; }
  v.list.push(x); save(); bump(u, 'val');
  if (back) { Ev.tell(o, `💞 **Взаимно!** Вы отправили валентинку **${Ev.uname(u)}** — и получили такую же в ответ.`); Ev.tell(u, `💞 **Взаимно!** **${Ev.uname(o)}** тоже отправил(а) вам валентинку.`); }
  else Ev.tell(o, '💌 **Кто-то смотрит на вас с симпатией…** Вам пришла анонимная валентинка. Посмотреть: «Хаб» → «События» → «Анонимные валентинки». Отправьте валентинку тому, на кого думаете: совпадёт — имена откроются.');
  return { ok: true, mutual: !!back };
};
H['val.reveal'] = (c, p) => {
  const u = db.users[c.uid], x = vals().list.find(y => y.id === p.id && y.to === u.id); need(x, 'Валентинка не найдена'); need(!x.open, 'Отправитель уже известен');
  R.spend(u, VAL.reveal, 'Или угадайте бесплатно: отправьте валентинку тому, на кого думаете.'); x.open = 1; save(); R.selfUpdate(u);
  const s = db.users[x.from]; if (s) Ev.tell(s, `💌 **${Ev.uname(u)}** узнал(а), что валентинка была от вас.`);
  return valView(x, u.id);
};

// ───── экран события
function view(u, k) {
  const ev = CAL[k]; need(ev, 'Такого события нет'); const q = quest(u, k), w = Ev.win(k), t = T(), on = t >= w[0] && t < w[1], cur = ev.seq ? ev.tasks.findIndex((x, i) => !q.got.includes(i)) : -1;
  const r = { id: k, on, done: !!q.done, prize: prizeText(ev.prize), seq: !!ev.seq, skip: ev.seq && on && cur >= 0 ? ev.skip : 0, game: { app: CAL[k].game[0], title: ev.game[2], url: gameUrl(k) }, topPrize: ev.top ? `рамка «${Shop.CATALOG[ev.top].name}»` : '',
    tasks: ev.tasks.map(([key, n, text, leaf, extra], i) => ({ text, n, have: q.got.includes(i) ? n : Math.min(n, q.c[key] || 0), done: q.got.includes(i), prize: [leaf ? `${leaf} 🍃` : '', prizeText(extra)].filter(Boolean).join(' + '), locked: ev.seq && cur >= 0 && i > cur })),
    ...topView(`ev:${k}:${Ev.year()}`, u.id) };
  if (k === 'may') r.race = raceRows().slice(0, 5).map(([i, n]) => ({ id: i, name: db.servers[i].name, n }));
  return r;
}
H['year.get'] = (c, p) => { const u = db.users[c.uid]; visit(u); return view(u, str(p.id, 12)); };
H['year.skip'] = (c, p) => {
  const u = db.users[c.uid], k = str(p.id, 12), ev = CAL[k]; need(ev && ev.seq && Ev.on(k), 'Сейчас пропускать нечего'); const q = quest(u, k), cur = ev.tasks.findIndex((x, i) => !q.got.includes(i)); need(cur >= 0, 'Все испытания пройдены');
  R.spend(u, ev.skip, 'Или просто выполните испытание.'); q.got.push(cur); save(); settle(u, k); R.selfUpdate(u); return view(u, k);
};
// «Нудист» открылся в ноябре 2026-го: в альбоме первого года только те события, что ещё можно было застать
const BORN = Ev.at(2026, 11, 1);
H['year.album'] = c => { const u = db.users[c.uid], s = state(u), keys = ORDER.filter(k => Ev.win(k)[1] > BORN); return { y: s.y, stamps: keys.map(k => ({ id: k, e: NAME[k].e, name: NAME[k].name, got: s.stamps.includes(k), from: Ev.win(k)[0] })), goals: ALBUM.filter(([n]) => n <= keys.length).map(([n, p]) => ({ n, prize: prizeText(p), got: s.album >= n })) }; };

// ───── бот: /prediction, /album
const PRED = ['Сегодня вас не узнают без одежды. Впрочем, как и всегда.', 'Звёзды советуют ответить на то сообщение, которое вы читаете третий день.', 'Вас ждёт встреча с холодильником. Не сопротивляйтесь.', 'Кто-то поставит вам реакцию. Скорее всего, по ошибке.', 'День удачный для того, чтобы ничего не делать. Как и вчера.', 'Сегодня вы найдёте носок. Второй — нет.', 'Меркурий ретроградный, поэтому в чате опять спорят.', 'Вас ждёт богатство: целых 30 листиков, если не лениться.', 'К вечеру вы пожалеете о голосовом на четыре минуты.', 'Ваш питомец думает о вас. И о еде. В основном о еде.', 'Вас добавят в клуб, из которого неудобно выйти.', 'Сегодня шутка зайдёт. Но не ваша.', 'Вам напишет тот, кого вы не ждали. Это бот.', 'Отличный день сменить аватар. Старый видел слишком многое.', 'Судьба готовит подарок. Судьба — это вы сами, магазин открыт.', 'Сегодня вы будете правы. Жаль, что никто не спросит.'];
Ev.cmd = (u, say, t) => {
  if (/^\/prediction/.test(t)) { const d = Ev.mskDate(), n = [...(u.id + d)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7); say(`🔮 **Предсказание на ${d.slice(8)}.${d.slice(5, 7)}:** ${PRED[n % PRED.length]}`); return true; }
  if (/^\/album/.test(t)) { const s = state(u); say(`📮 **Альбом ${s.y}:** ${s.stamps.length} из ${ORDER.length} марок.\n` + ORDER.map(k => `${s.stamps.includes(k) ? '✅' : '▫️'} ${NAME[k].e} ${NAME[k].name}`).join('\n') + '\n\nМарку дают за три задания события. 4 марки — 300 🍃, 8 — рамка «Сезонник», 12 — рамка «Старожил».'); return true; }
  return false;
};
Ev.decor = k => (CAL[k] ? { quest: true, game: { app: CAL[k].game[0], title: CAL[k].game[2], url: gameUrl(k) } } : null);
Ev.ticks.push(awardTops, awardRace);
module.exports = { CAL, ORDER, bump, visit, view };
