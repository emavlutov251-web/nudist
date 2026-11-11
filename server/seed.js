'use strict';
// Стартовый контент: служебные боты, сервер «Общий пляж», канал «Голые факты», группа «Курилка».
const C = require('./core');
const A = require('./auth');
const G = require('./guild');
const B = require('./bots');
const { db, save, postMessage } = C;

function seed() {
  B.ensureBuiltin();
  if (db.meta.seeded) return;
  const sys = db.meta.sys, mem = C.byName.get('membot');
  // сервер
  const s = G.createServer(sys, 'Общий пляж', 'memes', { pub: true, verified: true, about: 'Главный сервер «Нудиста». Болталка, мемы, голосовые шезлонги. Вход свободный, выход тоже.' });
  s.roles.splice(0, 0, { id: 'lifeguard', name: 'Спасатель', color: '#e2552d', icon: '🛟', hoist: true, perms: { msgs: true, kick: true, voice: true, mention: true, audit: true } }, { id: 'tan', name: 'Загорелый', color: '#c7822f', icon: '☀️', perms: {} }, { id: 'pale', name: 'Бледный', color: '#7c93a8', icon: '🌙', perms: {} });
  G.joinServer(s, mem, true);
  const chan = n => s.channels.map(x => db.chats[x]).find(ch => ch.title === n);
  const say = (ch, from, text, extra) => postMessage(ch, from, { text, ...extra }, { quiet: true });
  say(chan('правила-пляжа'), sys, '**Правила пляжа**\n\n1. Уважайте друг друга. Скрывать нечего, а хамить — тем более.\n2. Спойлеры прикрываем листком: `||вот так||`.\n3. Голосовые длиннее трёх минут приравниваются к подкасту.\n4. Спам, реклама и крипта — мимо пляжа.\n5. Спасатели (модераторы) всегда правы. Даже когда не правы — см. пункт 5.');
  say(chan('объявления'), sys, '📣 **Пляж открыт!**\nРасполагайтесь. В #болталка — обо всём, в #мемы — понятно что, в «Курилке» и на «Шезлонгах» можно поговорить голосом.');
  say(chan('болталка'), sys, 'Всем привет! Это общий чат. Не стесняйтесь — тут все свои.');
  say(chan('болталка'), mem, 'Подсказка дня: наберите `/` — там кубик, монетка и шар судьбы. А `/buzz` в личке пнёт собеседника, как в старые добрые.');
  postMessage(chan('мемы'), mem, B.memeSticker(), { quiet: true });
  say(chan('мемы'), mem, 'Мемы делаются тут же: скрепка → **Мемогенератор**. Есть режим демотиватора. Мы в 2009-м или где?');
  say(chan('срач-по-расписанию'), sys, 'Тема недели: **ананасы на пицце**. Регламент: аргумент, контраргумент, стикер. Победителей нет.');
  say(chan('кринж'), mem, 'Сюда — всё, за что стыдно. Начну: я бот, и я однажды поздоровался с автоответчиком.');
  postMessage(chan('вопросы-и-ответы'), sys, { title: 'Как сделать свой сервер?', text: 'Нажмите **+** в левой колонке → выберите шаблон. Каналы, роли, приглашения — в меню сервера (клик по названию).' }, { quiet: true });
  postMessage(chan('вопросы-и-ответы'), sys, { title: 'Что такое листики 🍃?', text: 'Внутренняя валюта. Копятся ежедневным бонусом и в мини-игре @listopad. Тратятся на Премиум, бусты серверов и подарки. Настоящих денег тут нет.' }, { quiet: true });
  G.addChannel(s, 'только-для-спасателей', 'text', s.cats[1].id, { allow: ['lifeguard'], topic: 'Служебный канал модераторов' });
  G.addChannel(s, 'роли', 'text', s.cats[0].id, { topic: 'Выберите себе роль' });
  postMessage(chan('роли'), sys, { text: 'Кто вы сегодня? Нажмите кнопку — получите роль и цвет ника. Повторное нажатие снимает роль.', hook: 'Общий пляж', btn: [[{ t: '☀️ Загорелый', d: 'rr:tan' }], [{ t: '🌙 Бледный', d: 'rr:pale' }]] }, { quiet: true });
  s.events = [{ id: C.id(), title: 'Вечер плохих анекдотов', about: 'Собираемся в «Курилке». Вход с анекдотом, выход с фейспалмом.', at: Date.now() + 3 * 864e5, chat: chan('Курилка').id, by: sys, going: [sys] }];
  // канал
  const ch = C.newChat('channel', { title: 'Голые факты', about: 'Только факты. Ничего лишнего. Автопостинг каждые 6 часов.', pub: true, verified: true, color: 2 });
  ch.username = 'golye_fakty'; C.chatNames.set('golye_fakty', ch.id);
  C.addToChat(ch, sys, 'owner'); C.addToChat(ch, mem, 'admin');
  for (const f of B.FACTS.slice(0, 4)) postMessage(ch, mem, { text: '🍃 **Голый факт.** ' + f, as: 'chan' }, { quiet: true });
  postMessage(ch, mem, { type: 'poll', poll: { q: 'Ананасы на пицце — это…', opts: ['Нормально', 'Преступление', 'Я просто хочу есть'], anon: true, votes: {} }, as: 'chan' }, { quiet: true });
  // группа
  const g = C.newChat('group', { title: 'Курилка', about: 'Публичная группа для разговоров ни о чём.', pub: true, perms: { send: true, invite: true }, color: 5 });
  g.username = 'kurilka'; C.chatNames.set('kurilka', g.id);
  C.addToChat(g, sys, 'owner'); C.addToChat(g, mem, 'admin');
  say(g, sys, 'Курилка открыта. Курить, кстати, вредно — а болтать можно.');
  db.meta.autoJoin = [ch.id]; db.meta.autoServers = [s.id]; db.meta.factChannel = ch.id; db.meta.seeded = true; db.meta.lastFact = Date.now();
  save();
}
// первый зарегистрированный человек — владелец сервиса и стартовых сообществ
A.hooks.onRegister.push(u => { if (u.admin !== 'superadmin') return; setTimeout(() => {
  for (const sid of db.meta.autoServers || []) { const s = db.servers[sid]; if (s && s.members[u.id]) { s.owner = u.id; G.emitServer(s); G.emitChannels(s); } }
  for (const cid of db.meta.autoJoin || []) { const c = db.chats[cid]; if (c && c.members[u.id]) { for (const m of Object.values(c.members)) if (m.role === 'owner') m.role = 'admin'; c.members[u.id].role = 'owner'; C.emitChat(c, [u.id]); } }
  save();
}, 80); });
function factJob() {
  const ch = db.chats[db.meta.factChannel]; if (!ch || Date.now() - (db.meta.lastFact || 0) < 6 * 3600e3) return;
  const mem = C.byName.get('membot'); if (!mem || !ch.members[mem]) return;
  db.meta.lastFact = Date.now(); db.meta.factIdx = ((db.meta.factIdx || 3) + 1) % B.FACTS.length;
  postMessage(ch, mem, { text: '🍃 **Голый факт.** ' + B.FACTS[db.meta.factIdx], as: 'chan' }, { quiet: true });
}
module.exports = { seed, factJob };
