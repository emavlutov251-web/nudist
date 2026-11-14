'use strict';
// Боты: встроенные (Нудист, БотБатя, МемБот, Листопад), Bot API (HTTP), вебхуки, кнопки, превью ссылок, RSS.
const crypto = require('crypto');
const C = require('./core');
const A = require('./auth');
const R = require('./rpc');
const G = require('./guild');
const N = require('./net');
const { db, save, now, id, token, fail, need, str, int, emit, postMessage, pubUser } = C;
const H = R.H;
const pick = a => a[crypto.randomInt(0, a.length)];

// ───── контент
const JOKES = [
  '— Почему нудисты не играют в покер?\n— Блефовать бесполезно: всё на виду.',
  'Программист-нудист: «У меня открытый исходный код».',
  '— Доктор, меня все игнорируют.\n— Следующий!',
  'Нудист заходит в чат. Скрывать нечего, а «был(а) недавно» всё равно включил.',
  'Самый честный статус: «печатает… стирает… печатает опять… ушёл пить чай».',
  '— Ты где?\n— В сети.\n— А почему не отвечаешь?\n— Я в сети, а не в ресурсе.',
  'Купил умные часы. Теперь точно знаю, что сплю плохо, хожу мало и часы купил зря.',
  '— Сколько программистов нужно, чтобы вкрутить лампочку?\n— Ни одного. Это аппаратная проблема.',
  'Оптимист видит стакан наполовину полным, пессимист — наполовину пустым, а нудист рад, что есть куда положить ключи.',
  'Голосовое на семь минут — это не сообщение. Это подкаст без согласия слушателя.',
  '«Прочитано в 14:02». Это не галочки. Это приговор.',
  'Нудисту подарили шкаф. Стоит пустой, зато в нём отличная акустика для голосовых.',
  '— Вам есть что скрывать?\n— Только историю браузера.',
  'В групповом чате двести человек. Пишут трое. Читают все. Отвечает бот.',
  'Интроверт установил мессенджер. Отключил уведомления. Удалил мессенджер. Идеальный вечер.',
  'Нудист на собеседовании: «Мои слабые стороны? Карманы».',
  '— Алло, это служба поддержки?\n— Да.\n— Поддержите меня, пожалуйста.',
];
const FACTS = [
  'У осьминога три сердца. И ни одного кармана.',
  'Голый землекоп — грызун, который почти не чувствует некоторые виды боли и живёт больше 30 лет. Нудист по призванию.',
  'Бананы с точки зрения ботаники — ягоды, а клубника — нет.',
  'Вомбаты производят помёт кубической формы.',
  'Морские выдры держатся за лапки во сне, чтобы их не унесло течением.',
  'Официальное национальное животное Шотландии — единорог.',
  'На Венере сутки длиннее года: планета вращается вокруг своей оси медленнее, чем облетает Солнце.',
  'Первое в мире SMS отправили в декабре 1992 года. В нём было написано «Merry Christmas».',
  'Символ @ в России называют «собакой», в Италии — «улиткой», а в Нидерландах — «обезьяньим хвостиком».',
  'Первый смайлик :-) предложил учёный Скотт Фалман в 1982 году.',
  'Фламинго розовые из-за каротиноидов в пище. Без правильной диеты они бледнеют.',
  'Мёд практически не портится: его находили съедобным в древнеегипетских гробницах.',
  'Первый в мире сайт до сих пор работает по адресу info.cern.ch.',
  'Сердце синего кита весит около 180 килограммов.',
  'У коров бывают лучшие подруги, и в разлуке с ними они испытывают стресс.',
];
const COMPLIMENTS = ['Вы сегодня выглядите так, будто выспались. Невероятно.', 'Ваши сообщения читают до конца. Это редкость.', 'С вами даже «ок» звучит тепло.', 'Вы — тот самый человек, который отвечает в течение суток. Герой.', 'У вас отличный вкус в мессенджерах.', 'Вы единственный, кто не пишет «привет» отдельным сообщением. Спасибо вам.', 'Ваши голосовые хочется слушать на 1x.'];
const SIGNS = ['Овен', 'Телец', 'Близнецы', 'Рак', 'Лев', 'Дева', 'Весы', 'Скорпион', 'Стрелец', 'Козерог', 'Водолей', 'Рыбы'];
const HORO = ['Сегодня звёзды советуют не отвечать «ок». Напишите хотя бы «окей».', 'Меркурий ретрограден, поэтому сообщение уйдёт не в тот чат. Перепроверьте.', 'День подходит для того, чтобы наконец прочитать 847 непрочитанных. Или нет.', 'Вас ждёт неожиданное голосовое. Крепитесь.', 'Благоприятный день, чтобы выйти из чата подъезда.', 'Луна в Козероге. Никто не знает, что это значит, но стикер отправьте.', 'Сегодня вас добавят в группу без спроса. Будьте мужественны.'];
const SMALLTALK = ['Интересная мысль. Жаль, я бот и ничего не понял.', 'Запишу это в свой несуществующий блокнот.', 'Полностью согласен. Или нет. Я ещё не решил.', 'Попробуйте /mem — там хотя бы смешно.', 'Скрывать не буду: я не умею вести светские беседы.', 'Это вы сейчас мне или просто мимо проходили?'];
const MEMES = [
  ['🐸', 'Это не баг.\nЭто фича.'], ['🐕', 'This is fine.\n(Всё горит)'], ['🗿', 'Понедельник'], ['🦥', 'Отвечу через\n3–5 рабочих дней'], ['🐈', 'Я не толстый.\nЯ в оффлайне.'],
  ['🧠', 'Мозг в 3 часа ночи:\n«А помнишь, в 2014-м…»'], ['📵', 'Перезвоню.\n(Никогда)'], ['🦆', 'Кря — краткость\nсестра таланта'], ['🍃', 'Скрывать нечего.\nНо листок возьму.'], ['🫠', 'Созвон мог быть\nписьмом'],
  ['🐹', 'Тапать — не\nработать'], ['🧦', 'Носки — это\nуже слишком'],
];

// ───── служебные аккаунты
const BUILTIN = {
  nudist: { name: 'Нудист', bio: 'Служебные уведомления. Скрывать нам нечего, но пароль мы всё равно не спросим.', badges: ['verified'], cmds: [{ c: 'start', d: 'приветствие' }, { c: 'help', d: 'что тут вообще можно' }] },
  botbatya: { name: 'БотБатя', bio: 'Отец всех ботов. Создаю ботов и выдаю токены. Спросите /help.', badges: ['verified'], cmds: [{ c: 'newbot', d: 'создать бота' }, { c: 'mybots', d: 'мои боты' }, { c: 'token', d: 'показать токен' }, { c: 'revoke', d: 'перевыпустить токен' }, { c: 'setapp', d: 'привязать Mini App' }, { c: 'delbot', d: 'удалить бота' }, { c: 'help', d: 'справка по Bot API' }] },
  membot: { name: 'МемБот', bio: 'Мемы, анекдоты, голые факты и гороскоп сомнительной точности. В любом чате: @membot запрос', badges: [], cmds: [{ c: 'mem', d: 'случайный мем' }, { c: 'anekdot', d: 'анекдот' }, { c: 'fact', d: 'голый факт' }, { c: 'compliment', d: 'комплимент' }, { c: 'horoscope', d: 'гороскоп' }, { c: 'help', d: 'справка' }], inline: true },
  support: { name: 'Поддержка', bio: 'Техподдержка «Нудиста». Опишите проблему — на частые вопросы отвечу сразу, остальное передам человеку.', badges: ['verified'], cmds: [{ c: 'help', d: 'частые вопросы' }, { c: 'operator', d: 'позвать оператора' }] },
  pravda: { name: 'Голая правда', bio: 'Сюда приходят анонимные вопросы по вашей личной ссылке. Кто спросил — не знает никто, даже мы.', badges: ['verified'], cmds: [{ c: 'start', d: 'как это работает' }] },
  listopad: { name: 'Листопад', bio: 'Мини-игра: тапайте по листку и зарабатывайте листики 🍃', badges: [], cmds: [{ c: 'start', d: 'играть' }], app: '/miniapps/listopad.html' },
};
function ensureBuiltin() {
  for (const [username, f] of Object.entries(BUILTIN)) {
    let u = db.users[C.byName.get(username)];
    if (!u) u = A.createUser({ username, name: f.name, bot: true, extra: { bot: true, builtin: username } });
    Object.assign(u, { name: f.name, bio: f.bio, badges: f.badges, cmds: f.cmds, app: f.app, inline: f.inline, bot: true, builtin: username });
    if (username === 'nudist') db.meta.sys = u.id;
  }
  save();
}
const botSay = (bot, chat, text, extra) => postMessage(chat, bot.id, { text, ...extra }, { quiet: true });
const memeSticker = () => { const [e, t] = pick(MEMES); return { type: 'sticker', sticker: { pack: 'mem', id: 'm' + crypto.randomInt(0, 1e6), e, t, bg: pick(['sun', 'leaf', 'sea', 'sand', 'night']) } }; };

const WELCOME = `**Добро пожаловать в «Нудист»!** 🍃

Мессенджер, которому нечего скрывать — кроме вашей переписки.

Что попробовать в первую очередь:
• Напишите в **Избранное** — это ваш личный склад всего.
• Загляните на сервер **«Общий пляж»** слева — там болталка, мемы и голосовые шезлонги.
• Закройте спойлер фиговым листком: \`||вот так||\` → ||сюрприз||
• Наберите \`/\` в любом чате — там /roll, /shrug, /8ball и другие приколы.
• Дважды нажмите **Esc**, если в комнату вошёл начальник. Мы вас прикроем.
• Поболтайте с @membot, сыграйте в @listopad, создайте своего бота у @botbatya.

Справка — /help`;
const HELP = `**Шпаргалка**

**Форматирование:** \`**жирный**\`, \`__курсив__\`, \`~~зачёркнутый~~\`, \`||спойлер||\`, \`\`моно\`\`, блок кода в тройных кавычках, \`> цитата\`
**Команды:** /roll, /coin, /8ball, /shrug, /tableflip, /mock, /uwu, /gol, /buzz, /party
**Горячие клавиши:** Ctrl+K — поиск, Esc — закрыть, Esc Esc — «Прикрыться», ↑ — править последнее сообщение, Ctrl+B / Ctrl+I — формат
**Безопасность:** включите двухфакторную защиту в Настройках → Приватность.

Я служебный бот и на остальное отвечаю примерно никак.`;

const batyaState = new Map();
const builtinHandlers = {
  support(bot, chat, m) { require('./hub').onSupport(bot, chat, m); },
  nudist(bot, chat, m) {
    const t = (m.text || '').trim();
    if (/^\/start/.test(t)) botSay(bot, chat, WELCOME);
    else if (/^\/help/.test(t)) botSay(bot, chat, HELP);
    else botSay(bot, chat, pick(['Я служебный бот. Умею присылать уведомления о входе и делать серьёзное лицо. /help', 'Принято. Передал в отдел, которого не существует. /help', 'Скрывать нечего: я вас не понял. Попробуйте /help']));
  },
  botbatya(bot, chat, m) {
    const t = (m.text || '').trim(), uid = m.from, state = batyaState.get(uid);
    const mine = () => Object.values(db.users).filter(u => u.bot && u.owner === uid && !u.deleted);
    const find = name => mine().find(u => u.username.toLowerCase() === String(name || '').replace(/^@/, '').toLowerCase());
    const say = (x, e) => botSay(bot, chat, x, e);
    if (/^\/(start|help)/.test(t)) { batyaState.delete(uid); return say(`Здорово. Я **БотБатя** — делаю ботов.\n\n/newbot — создать бота\n/mybots — список ваших ботов\n/token @bot — показать токен\n/revoke @bot — перевыпустить токен\n/setapp @bot https://… — привязать Mini App\n/delbot @bot — удалить\n\n**Bot API** (как у Telegram, только проще):\n\`\`\`\nGET  /bot<TOKEN>/getMe\nGET  /bot<TOKEN>/getUpdates?offset=0&timeout=20\nPOST /bot<TOKEN>/sendMessage  {"chat_id":"…","text":"…","reply_markup":{"inline_keyboard":[[{"text":"Жми","callback_data":"x"}]]}}\nPOST /bot<TOKEN>/editMessageText, deleteMessage, answerCallbackQuery, setWebhook, setMyCommands\n\`\`\`\nБоту нужно сначала написать /start, чтобы он узнал chat_id.`); }
    if (/^\/newbot/.test(t)) { need(db.flags.bots, 'Создание ботов отключено администратором'); if (mine().length >= 10) return say('Десять ботов — это уже ферма. Удалите кого-нибудь: /delbot'); batyaState.set(uid, { step: 'name' }); return say('Как назовём бота? Напишите отображаемое имя.'); }
    if (/^\/mybots/.test(t)) { const l = mine(); return say(l.length ? 'Ваши боты:\n' + l.map(b => `• **${b.name}** — @${b.username}`).join('\n') : 'Ботов пока нет. /newbot — и будет.'); }
    const cmd = t.match(/^\/(token|revoke|delbot|setapp)\s+(\S+)(?:\s+(\S+))?/);
    if (cmd) {
      const b = find(cmd[2]); if (!b) return say('Не нашёл такого бота среди ваших. /mybots');
      if (cmd[1] === 'token') return say(`Токен @${b.username}:\n\`${b.token}\`\nНикому не показывайте. Даже нудистам.`);
      if (cmd[1] === 'revoke') { b.token = b.id + ':' + token(24); save(); return say(`Новый токен @${b.username}:\n\`${b.token}\``); }
      if (cmd[1] === 'setapp') { if (cmd[3] && !/^https:\/\//.test(cmd[3])) return say('Нужен адрес, начинающийся с https://'); b.app = cmd[3] || undefined; save(); C.broadcastUser(b); return say(b.app ? 'Mini App привязан. В профиле бота появится кнопка «Открыть приложение».' : 'Mini App отвязан.'); }
      if (cmd[1] === 'delbot') { A.deleteUser(b); return say('Бот удалён. Помянем.'); }
    }
    if (state && state.step === 'name') { const name = str(t, 64); if (!name || name[0] === '/') return say('Имя нужно обычным текстом.'); batyaState.set(uid, { step: 'username', name }); return say('Отлично. Теперь username — латиницей, должен заканчиваться на `bot`. Например: `my_cool_bot`'); }
    if (state && state.step === 'username') {
      const un = t.replace(/^@/, '');
      if (!C.USERNAME_RE.test(un) || !/bot$/i.test(un)) return say('Не подходит. Латиница, цифры и _, от 3 символов, в конце — `bot`.');
      if (C.usernameTaken(un)) return say('Занято. Придумайте другой username.');
      const b = A.createUser({ username: un, name: state.name, bot: true, extra: { bot: true, owner: uid, bio: 'Бот пользователя @' + (db.users[uid].username || 'аноним') } });
      b.token = b.id + ':' + token(24); save(); batyaState.delete(uid);
      return say(`Готово! Бот **${b.name}** (@${b.username}) создан.\n\nТокен для Bot API:\n\`${b.token}\`\n\nПроверка: откройте в браузере\n\`/bot${b.token}/getMe\`\n\nСправка по методам — /help`);
    }
    say('Не понял. /help — список того, что я умею.');
  },
  membot(bot, chat, m) {
    const t = (m.text || '').trim().toLowerCase();
    if (/^\/(start|help)/.test(t)) return botSay(bot, chat, 'Я **МемБот**. Мой репертуар:\n/mem — мем\n/anekdot — анекдот\n/fact — голый факт\n/compliment — комплимент\n/horoscope — гороскоп\n\nА ещё меня можно позвать в любом чате: наберите `@membot` и запрос.', { btn: [[{ t: '🎭 Мем', d: 'mem' }, { t: '😂 Анекдот', d: 'anekdot' }], [{ t: '🍃 Голый факт', d: 'fact' }, { t: '🔮 Гороскоп', d: 'horoscope' }]] });
    if (/^\/mem/.test(t)) return postMessage(chat, bot.id, memeSticker(), { quiet: true });
    if (/^\/anekdot/.test(t)) return botSay(bot, chat, pick(JOKES), { btn: [[{ t: 'Ещё!', d: 'anekdot' }]] });
    if (/^\/fact/.test(t)) return botSay(bot, chat, '🍃 **Голый факт.** ' + pick(FACTS), { btn: [[{ t: 'Ещё факт', d: 'fact' }]] });
    if (/^\/compliment/.test(t)) return botSay(bot, chat, pick(COMPLIMENTS));
    if (/^\/horoscope/.test(t)) return botSay(bot, chat, `🔮 **${pick(SIGNS)}** (угадал?). ${pick(HORO)}`);
    if (chat.type === 'dm') botSay(bot, chat, pick(SMALLTALK));
  },
  pravda(bot, chat) { botSay(bot, chat, '🍃 **Голая правда** — анонимные вопросы.\n\nОткройте меню ☰ → **«Голая правда»**: там ваша личная ссылка и картинка для истории. Выложите ссылку в соцсетях — вопросы придут в этот чат. Кто спросил, не узнает никто.\n\nОтвечать сюда бесполезно: я бот и никому не передам. Ответьте в истории — пусть гадают, кто спрашивал.'); },
  listopad(bot, chat) { botSay(bot, chat, `🍃 **Листопад** — тапайте по листку, копите листики, тратьте на Премиум и бусты.\nЛистик падает за каждые ${R.LEAF.per} ${R.LEAF.per % 10 === 1 && R.LEAF.per % 100 !== 11 ? 'тап' : 'тапов'}, в день — не больше ${R.LEAF.limit} 🍃. Лёгких листьев не бывает.`, { btn: [[{ t: '🍃 Играть', app: '/miniapps/listopad.html' }]] }); },
};
const builtinCallbacks = {
  membot(bot, chat, m, data) { builtinHandlers.membot(bot, chat, { text: '/' + data, from: m.from }); return {}; },
};

// ───── доставка обновлений ботам
const queues = new Map(); // botId -> { list, seq, waiters }
const queue = b => { let q = queues.get(b.id); if (!q) { q = { list: [], seq: 1, waiters: [] }; queues.set(b.id, q); } return q; };
const apiUser = u => ({ id: u.id, is_bot: !!u.bot, first_name: u.name, last_name: u.last || undefined, username: u.username });
const apiChat = ch => ({ id: ch.id, type: ch.type === 'dm' ? 'private' : ch.type === 'channel' ? 'channel' : 'group', title: ch.title });
const apiMsg = (m, ch) => ({ message_id: m.id, date: Math.floor(m.ts / 1000), chat: apiChat(ch), from: db.users[m.from] ? apiUser(db.users[m.from]) : undefined, text: m.text, reply_to_message: m.reply ? { message_id: m.reply } : undefined });
function pushUpdate(bot, upd) {
  const q = queue(bot); const u = { update_id: q.seq++, ...upd };
  if (bot.webhook) { N.safeFetch(bot.webhook, { method: 'POST', body: JSON.stringify(u), headers: { 'content-type': 'application/json' }, timeout: 5000, max: 1000 }).catch(e => { bot.webhookError = e.message; }); return; }
  q.list.push(u); if (q.list.length > 200) q.list.shift();
  for (const w of q.waiters.splice(0)) w();
}
C.hooks.afterPost.push((chat, m) => {
  if (m.type === 'service' || m.enc) return;
  const text = m.text || '';
  let targets = [];
  if (chat.type === 'dm') { const o = db.users[Object.keys(chat.members).find(u => u !== m.from)]; if (o && o.bot) targets = [o]; }
  else if (text[0] === '/' || text.includes('@')) {
    const ids = chat.server ? Object.keys(db.servers[chat.server].members) : Object.keys(chat.members);
    const bots = ids.map(i => db.users[i]).filter(u => u && u.bot);
    const at = (text.match(/^\/\w+@(\w+)/) || [])[1];
    targets = bots.filter(b => at ? b.username.toLowerCase() === at.toLowerCase() : (text[0] === '/' || text.toLowerCase().includes('@' + b.username.toLowerCase())));
  }
  for (const b of targets) {
    if (b.builtin) setTimeout(() => { try { builtinHandlers[b.builtin](b, chat, m); } catch (e) { if (e instanceof C.PubError) botSay(b, chat, e.message); else console.error('[bot]', e); } }, 350);
    else pushUpdate(b, { message: apiMsg(m, chat) });
  }
  // превью ссылки
  const url = (text.match(/https?:\/\/[^\s<>"')\]]+/) || [])[0];
  if (url && !m.link && m.via !== 'RSS' && m.via !== 'YouTube' && db.flags.linkPreview && chat.type !== 'secret') N.linkPreview(url).then(l => { if (l && C.findMsg(chat.id, m.id) === m) { m.link = l; C.updateMsg(chat, m); } }).catch(() => {});
});
H['msg.cb'] = (c, p) => {
  const chat = R.getChat(c, p.chat), m = C.findMsg(chat.id, p.id); need(m && m.btn, 'Кнопка устарела');
  const data = str(p.d, 128); need(m.btn.some(row => row.some(b => b.d === data)), 'Кнопка устарела');
  if (data.startsWith('cap:')) {
    const [, uid, e] = data.split(':'); need(uid === c.uid, 'Эта проверка не для вас');
    const cap = (chat.caps || {})[uid]; if (!cap) return {};
    delete chat.caps[uid]; C.deleteMessages(chat, [m.id]);
    if (e === '🍃') { if (chat.members[uid]) delete chat.members[uid].pending; C.emitChat(chat, [uid]); save(); return { toast: 'Проверка пройдена. Добро пожаловать!' }; }
    C.service(chat, uid, 'не нашёл(ла) листок и покидает чат'); C.removeFromChat(chat, uid); save();
    return { toast: 'Это был не листок. До свидания!' };
  }
  if (data.startsWith('rr:') && chat.server) return G.roleButton(c, chat, data);
  const bot = db.users[m.from]; need(bot && bot.bot, 'Кнопка устарела');
  if (bot.builtin) return (builtinCallbacks[bot.builtin] || (() => ({})))(bot, chat, { from: c.uid }, data) || {};
  const cbId = id(); pushUpdate(bot, { callback_query: { id: cbId, from: apiUser(db.users[c.uid]), message: apiMsg(m, chat), data } });
  return new Promise(res => { cbWait.set(cbId, { uid: c.uid, res }); setTimeout(() => { if (cbWait.delete(cbId)) res({}); }, 4000); });
};
const cbWait = new Map();
H['bot.inline'] = (c, p) => {
  const b = db.users[C.byName.get(str(p.bot, 32).toLowerCase())]; need(b && b.bot && b.inline, 'Этот бот не умеет inline-режим');
  const q = str(p.q, 64).toLowerCase(); const res = [];
  const add = (title, desc, send) => res.push({ id: res.length, title, desc, send });
  for (const [e, t] of MEMES) if (!q || t.toLowerCase().includes(q) || q === 'мем' || q === 'mem') add(e + ' ' + t.split('\n')[0], 'мем-стикер', { type: 'sticker', sticker: { pack: 'mem', id: 'i' + res.length, e, t, bg: 'leaf' } });
  for (const j of JOKES) if (q && (j.toLowerCase().includes(q) || 'анекдот'.startsWith(q))) add('😂 ' + j.slice(0, 50), 'анекдот', { type: 'text', text: j });
  for (const f of FACTS) if (q && (f.toLowerCase().includes(q) || 'факт'.startsWith(q))) add('🍃 ' + f.slice(0, 50), 'голый факт', { type: 'text', text: '🍃 ' + f });
  if (q && !res.length) {
    const raw = str(p.q, 40);
    for (const [e, bg] of [['🗿', 'night'], ['🙈', 'sand'], ['🔥', 'sun']]) add(e + ' ' + raw, 'свежий мем из вашего запроса', { type: 'sticker', sticker: { pack: 'mem', id: 'q' + res.length, e, t: raw, bg } });
    const pick = a => a[crypto.randomInt(0, a.length)];
    const j = pick(JOKES), f = pick(FACTS);
    add('😂 ' + j.slice(0, 50), 'случайный анекдот — по запросу ничего, зато смешно', { type: 'text', text: j });
    add('🍃 ' + f.slice(0, 50), 'случайный голый факт', { type: 'text', text: '🍃 ' + f });
  }
  return res.slice(0, 20);
};
H['bot.catalog'] = c => Object.values(db.users).filter(u => u.bot && !u.deleted && (u.builtin || u.listed)).map(u => pubUser(u, c.uid));
H['bot.appdata'] = (c, p) => {
  const b = R.getUser(p.bot); need(b.bot && b.app, 'У бота нет Mini App');
  const u = db.users[c.uid]; const data = { user: JSON.stringify({ id: u.id, first_name: u.name, username: u.username }), auth_date: Math.floor(now() / 1000) };
  const check = Object.keys(data).sort().map(k => k + '=' + data[k]).join('\n');
  const hash = b.token ? crypto.createHmac('sha256', crypto.createHash('sha256').update(b.token).digest()).update(check).digest('hex') : '';
  return { url: b.app, initData: new URLSearchParams({ ...data, hash }).toString(), builtin: !!b.builtin };
};

// ───── Bot API (HTTP): /bot<token>/<method>
async function botApi(tok, method, q) {
  const bot = Object.values(db.users).find(u => u.bot && u.token && u.token === tok && !u.deleted);
  if (!bot) return { code: 401, body: { ok: false, error_code: 401, description: 'Unauthorized: неверный токен' } };
  if (!db.flags.bots) return { code: 403, body: { ok: false, error_code: 403, description: 'Bot API отключён администратором' } };
  try {
    A.limit('botapi:' + bot.id, 120, 10000);
    const chatOf = () => { const ch = db.chats[String(q.chat_id || '')]; need(ch && C.isMember(ch, bot.id), 'Bad Request: chat not found (бот не состоит в этом чате)'); return ch; };
    const kb = () => { const k = q.reply_markup && (typeof q.reply_markup === 'string' ? JSON.parse(q.reply_markup) : q.reply_markup).inline_keyboard; return Array.isArray(k) ? k.slice(0, 10).map(row => (Array.isArray(row) ? row : []).slice(0, 6).map(b => ({ t: str(b.text, 60), d: b.callback_data ? str(b.callback_data, 64) : undefined, u: /^https?:\/\//.test(b.url || '') ? str(b.url, 300) : undefined, app: b.web_app && /^https:\/\//.test(b.web_app.url || '') ? str(b.web_app.url, 300) : undefined })).filter(b => b.t)) : undefined; };
    let result;
    switch (method) {
      case 'getMe': result = apiUser(bot); break;
      case 'getUpdates': {
        const qu = queue(bot); const off = Number(q.offset) || 0;
        if (off) qu.list = qu.list.filter(u => u.update_id >= off);
        const timeout = Math.min(25, Math.max(0, Number(q.timeout) || 0));
        if (!qu.list.length && timeout) await new Promise(res => { const w = () => { clearTimeout(t); res(); }; const t = setTimeout(() => { qu.waiters = qu.waiters.filter(x => x !== w); res(); }, timeout * 1000); qu.waiters.push(w); });
        result = qu.list.slice(0, 100); break;
      }
      case 'sendMessage': { const ch = chatOf(); const text = str(q.text, 4096); need(text, 'Bad Request: message text is empty'); need(C.can(ch, bot.id, 'send') || ch.type === 'dm', 'Forbidden: бот не может писать в этот чат'); result = apiMsg(postMessage(ch, bot.id, { text, btn: kb(), reply: q.reply_to_message_id ? str(q.reply_to_message_id, 24) : undefined, silent: !!q.disable_notification, as: ch.type === 'channel' ? 'chan' : undefined }, { quiet: true }), ch); break; }
      case 'editMessageText': { const ch = chatOf(); const m = C.findMsg(ch.id, String(q.message_id)); need(m && m.from === bot.id, 'Bad Request: message to edit not found'); m.text = str(q.text, 4096) || m.text; if (q.reply_markup) m.btn = kb(); m.edited = now(); C.updateMsg(ch, m); result = apiMsg(m, ch); break; }
      case 'deleteMessage': { const ch = chatOf(); const m = C.findMsg(ch.id, String(q.message_id)); need(m && (m.from === bot.id || C.can(ch, bot.id, 'del')), 'Bad Request: message can\'t be deleted'); C.deleteMessages(ch, [m.id]); result = true; break; }
      case 'answerCallbackQuery': { const w = cbWait.get(String(q.callback_query_id)); if (w) { cbWait.delete(String(q.callback_query_id)); w.res({ toast: str(q.text, 200) || undefined }); } result = true; break; }
      case 'setWebhook': { const url = str(q.url, 300); need(!url || /^https:\/\//.test(url), 'Bad Request: webhook URL должен начинаться с https://'); bot.webhook = url || undefined; save(); result = true; break; }
      case 'deleteWebhook': delete bot.webhook; save(); result = true; break;
      case 'getWebhookInfo': result = { url: bot.webhook || '', last_error_message: bot.webhookError }; break;
      case 'setMyCommands': { const cm = typeof q.commands === 'string' ? JSON.parse(q.commands) : q.commands; bot.cmds = (Array.isArray(cm) ? cm : []).slice(0, 30).map(x => ({ c: str(x.command, 32).replace(/^\//, ''), d: str(x.description, 100) })).filter(x => x.c); save(); C.broadcastUser(bot); result = true; break; }
      case 'getChat': result = apiChat(chatOf()); break;
      default: return { code: 404, body: { ok: false, error_code: 404, description: 'Not Found: метод ' + method + ' не поддерживается' } };
    }
    return { code: 200, body: { ok: true, result } };
  } catch (e) {
    if (e instanceof C.PubError || e instanceof SyntaxError) return { code: 400, body: { ok: false, error_code: 400, description: e.message } };
    throw e;
  }
}

// ───── RSS → канал
//   RSS_MAX_TEXT=30000 — сколько знаков текста новости помещается в один пост (0 — только заголовок и ссылка)
//   RSS_KEEP=400       — сколько последних автопостов хранит канал: более старые удаляются, чтобы база не разрасталась
const RSS_MAX_TEXT = /^\d+$/.test(process.env.RSS_MAX_TEXT || '') ? Number(process.env.RSS_MAX_TEXT) : 30000;
const RSS_KEEP = Math.max(20, Number(process.env.RSS_KEEP) || 400);
function rssText(it) {
  let body = RSS_MAX_TEXT ? String(it.body || '') : '', tail = '';
  if (body.length > RSS_MAX_TEXT) { const cut = body.lastIndexOf('\n', RSS_MAX_TEXT); body = body.slice(0, cut > RSS_MAX_TEXT * 0.6 ? cut : RSS_MAX_TEXT).trim() + '…'; tail = '\n\nОкончание — в источнике.'; }
  return `**${it.title}**` + (body ? '\n\n' + body : '') + tail + `\n\nИсточник: ${it.link}`;
}
function rssCard(it, img) { let site = ''; try { site = new URL(it.link).hostname.replace(/^www\./, ''); } catch (e) { /* без подписи */ } return { url: it.link, title: it.title.slice(0, 200), site, img }; }
function rssTrim(ch) {
  const auto = (db.msgs[ch.id] || []).filter(m => m.via === 'RSS' || m.via === 'YouTube');
  if (auto.length > RSS_KEEP) C.deleteMessages(ch, auto.slice(0, auto.length - RSS_KEEP).filter(m => !(ch.pinned || []).includes(m.id)).map(m => m.id));
}
// YouTube: у канала три вкладки — «Видео», «Трансляции» и «Shorts», у каждой своя лента на 15 последних записей.
// Общая лента канала тоже одна на 15 записей, и короткие ролики быстро вытесняют из неё большие видео, поэтому читаем все три.
const YT_KINDS = [['UULF', 'video'], ['UULV', 'live'], ['UUSH', 'short']];
const YT_LABEL = { video: ['▶️', 'видео'], live: ['🔴', 'трансляция'], short: ['⚡', 'Shorts'] };
const YT_FILL = { video: 8, live: 3, short: 4 };      // сколько последних записей каждой вкладки публикуем при подключении канала
const FILL_AGE = 14 * 864e5, FRESH_AGE = 3 * 864e5, DAY_MS = 864e5;
const YT_PAGE = { video: 'videos', live: 'streams', short: 'shorts' }, YT_PAGE_EVERY = 25 * 6e4, ytPageAt = new Map();
async function ytItems(src, seen) {
  const id = (src.match(/channel_id=UC([\w-]{22})/) || [])[1], out = [], had = new Set(); let ok = 0;
  const add = (r, kind) => { for (const i of r) if (!had.has(i.guid)) { had.add(i.guid); out.push({ ...i, kind }); } };
  if (id) for (const [pre, kind] of YT_KINDS) {
    try { add(await N.rssItems(`https://www.youtube.com/feeds/videos.xml?playlist_id=${pre}${id}`), kind); ok++; } catch (e) { /* у канала нет такой вкладки */ }
  }
  if (!ok) {
    let err;
    try { for (const i of await N.rssItems(src)) out.push({ ...i, kind: /\/shorts\//.test(i.link) ? 'short' : 'video' }); ok++; } catch (e) { err = e; }
    // ленты YouTube не отвечают (у него это бывает сразу по всем каналам) — читаем вкладки канала со страницы, но не чаще раза в 25 минут
    if (!ok && id) {
      if (Date.now() - (ytPageAt.get(id) || 0) < YT_PAGE_EVERY) return null;
      ytPageAt.set(id, Date.now());
      for (const [, kind] of YT_KINDS) {
        try {
          let r = await N.ytTab('UC' + id, YT_PAGE[kind]); ok++;
          // у Shorts на странице нет дат: новыми считаем только те, что стоят выше первого уже известного
          if (seen && seen.size) { const cut = r.findIndex(i => !i.ts && seen.has(i.guid)); r = r.filter((i, n) => i.ts || (cut >= 0 && n < cut)); }
          add(r, kind);
        } catch (e) { err = err || e; }
      }
    }
    if (!ok) throw err || new Error('лента недоступна');
  }
  return out.sort((x, y) => (y.ts || 0) - (x.ts || 0));
}
const ytText = it => { const [icon, label] = YT_LABEL[it.kind] || YT_LABEL.video; return `${icon} **${it.title}**\n${it.author ? it.author + ' · ' : ''}${label}\n${it.link}`; };
async function pollRss() {
  for (const ch of Object.values(db.chats)) {
    if (ch.type !== 'channel' || !ch.rss || !ch.rss.length) continue;
    const owner = Object.keys(ch.members).find(u => ch.members[u].role === 'owner'); if (!owner) continue;
    const isYt = f => /youtube\.com\/feeds\//.test(f.src || '') || /(^|\.)youtube\.com\//.test((f.url || '').replace(/^https?:\/\//, ''));
    // каналы YouTube, подключённые до появления вкладок: публикуем их заново, уже со всеми вкладками
    if (ch.rss.some(f => isYt(f) && f.seen && !f.tabs)) {
      const old = (db.msgs[ch.id] || []).filter(m => m.via === 'YouTube').map(m => m.id); if (old.length) C.deleteMessages(ch, old);
      for (const f of ch.rss) if (isYt(f)) f.seen = undefined;
    }
    const posted = new Set(); for (const m of (db.msgs[ch.id] || []).slice(-RSS_KEEP)) if (m.via) { const u = String(m.text || '').match(/https?:\/\/\S+$/); if (u) posted.add(u[0]); }
    const batch = [];
    for (const feed of ch.rss) {
      try {
        if (!feed.src) feed.src = await N.feedUrl(feed.url);      // ссылка на канал YouTube → адрес его ленты (узнаём один раз)
        const yt = /youtube\.com\/feeds\//.test(feed.src);
        const seen = new Set(feed.seen || []), t = Date.now();
        const items = yt ? await ytItems(feed.src, seen) : await N.rssItems(feed.src); if (!items) continue;      // запасной путь YouTube только что опрашивали — ждём
        feed.err = undefined;
        let pick;
        if (feed.seen) pick = items.filter(i => !seen.has(i.guid) && (!yt || !i.ts || t - i.ts < FRESH_AGE)).slice(0, yt ? 5 : 3);      // обычная работа: только новое
        else if (yt) { const left = { ...YT_FILL }; pick = items.filter(i => (!i.ts || t - i.ts < FILL_AGE) && left[i.kind]-- > 0); }      // подключение: последние записи каждой вкладки
        else pick = items.slice(0, 1);
        for (const it of pick) if (!posted.has(it.link)) { posted.add(it.link); batch.push({ it, yt, fill: !feed.seen }); }
        feed.seen = [...new Set([...items.map(i => i.guid), ...(feed.seen || [])])].slice(0, 200); if (yt) feed.tabs = 1;
      } catch (e) { feed.err = e.message; }
    }
    // публикуем по порядку выхода; у записей, добавленных при подключении, сохраняем настоящую дату
    batch.sort((x, y) => (x.it.ts || 9e15) - (y.it.ts || 9e15));      // записи без даты (Shorts с запасного пути) идут последними, как самые свежие
    for (const { it, yt, fill } of batch) {
      const o = fill && it.ts && Date.now() - it.ts > DAY_MS / 24 ? { ts: it.ts } : {};
      if (yt) { postMessage(ch, owner, { text: ytText(it), as: 'chan', via: 'YouTube' }, o); continue; }
      // новость целиком: заголовок, текст из самой ленты и ссылка на источник — читать можно прямо в канале;
      // карточка источника под текстом: картинка из ленты, а если её там нет — со страницы материала
      const m = postMessage(ch, owner, { text: rssText(it), as: 'chan', via: 'RSS', link: it.img ? rssCard(it, it.img) : undefined }, o);
      if (!it.img && db.flags.linkPreview) N.linkPreview(it.link).then(l => { if (l && l.img && C.findMsg(ch.id, m.id) === m) { m.link = rssCard(it, l.img); C.updateMsg(ch, m); } }).catch(() => {});
    }
    if (batch.length) rssTrim(ch);
    save();
  }
}

// ───── приветствие и оповещения о входе
A.hooks.onRegister.push(u => setTimeout(() => {
  const sysBot = db.users[db.meta.sys]; if (!sysBot || !db.users[u.id] || db.users[u.id].deleted) return;
  R.ensureSaved(u);
  const ch = C.openDm(sysBot.id, u.id);
  postMessage(ch, sysBot.id, { text: WELCOME }, { quiet: true });
  for (const cid of db.meta.autoJoin || []) { const c = db.chats[cid]; if (c && !c.members[u.id]) { C.addToChat(c, u.id); C.emitChat(c, [u.id]); } }
  for (const c of Object.values(db.chats)) {      // открытые каналы редакции тоже сразу в списке у новичка, чтобы там не было пусто
    if (c.type !== 'channel' || !c.pub || c.members[u.id] || !Object.keys(c.members).some(m => c.members[m].role === 'owner' && C.isRobot(m))) continue;
    C.addToChat(c, u.id); C.emitChat(c, [u.id]);
  }
  for (const sid of db.meta.autoServers || []) { const s = db.servers[sid]; if (s) G.joinServer(s, u.id, false); }
  save();
}, 30));
A.hooks.onLogin.push((u, s) => {
  const sysBot = db.users[db.meta.sys]; if (!sysBot) return;
  postMessage(C.openDm(sysBot.id, u.id), sysBot.id, { text: `🔐 **Новый вход в аккаунт**\nУстройство: ${s.ua}\nIP: ${s.ip}\n\nЕсли это были не вы — завершите сеанс в Настройках → Устройства и смените пароль.` }, { quiet: true });
});

module.exports = { ensureBuiltin, botApi, pollRss, JOKES, FACTS, MEMES, pick, memeSticker };
