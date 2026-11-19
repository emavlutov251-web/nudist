'use strict';
// «Редакция сообщества»: робот, который каждый день ведёт общую беседу «Весь Нудист» (db.meta.common — там все зарегистрированные),
// или «Сообщество Нудист» (nudist_community), если общей беседы нет. Куда писать, решает COMMUNITY_CHAT:
//   auto (по умолчанию) — «Весь Нудист», если есть, иначе «Сообщество»;  both — в оба;  common | community — только один.
// Расписание (МСК): 09:00 вопрос дня · вторник 19:00 факт дня · среда 18:00 опрос недели · четверг 20:00 «позовите друга» ·
//   пятница 17:00 мем-батл · суббота 12:00 челлендж · 10:00, 1–25 декабря адвент · первый день события — анонс ·
//   20:00 воскресенье — итоги недели + авто-вручение 50 🍃 победителю мем-батла · 22:00 итог дня.
// Все сообщения silent: уведомлений они не рассылают — их видят, когда заходят в чат (иначе ежедневный шум съест доверие к пушу).
// Выключатель: COMMUNITY_AUTO=off. Метка публикации и исторические отметки лежат в db.meta.community.marks.
const C = require('./core');
const R = require('./rpc');
const Ev = require('./events');
const B = require('./bots');
const { db, save } = C;
const MSK = 3 * 3600e3, DAY = 864e5;
const BATTLE_PRIZE = 50, BATTLE_HOUR = 17, WEEK_HOUR = 20, WRAP_HOUR = 22, Q_HOUR = 9, ADVENT_HOUR = 10, FACT_HOUR = 19, POLL_HOUR = 18, INVITE_HOUR = 20, CHALLENGE_HOUR = 12;

const QUESTIONS = [
  'Ананас на пицце: за или против — и почему вообще спорим?',
  'Какая песня сейчас крутится у вас в наушниках (одна)?',
  'Что съели на завтрак? От «ничего» до «того самого».',
  'Если бы «Нудист» делал одно волшебное действие — какое?',
  'Какое приложение удалили бы первым, будь вы супергероем?',
  'Письмо другу, которое вы так и не отправили, — что в нём было?',
  'Любимое место в вашем городе, куда почти никто не ходит?',
  'Какой навык хотели бы освоить за 30 дней?',
  'Утренний человек вы или «ещё пять минут»?',
  'Лучшая вещь, купленная дешевле 300 рублей?',
  'Какая книга/игра/сериал поглотили вас без остатка?',
  'Если бы завтра был незапланированный выходной — куда бы пошли?',
  'Чем чаще делитесь: фото или голосовыми?',
  'Идеальное утро — опишите тремя словами.',
  'Какой стикер изнутри «Нудиста» вы готовы защищать в бою?',
  'Что вас бесит в чужих уведомлениях?',
  'Какая еда решает любой плохой день?',
  'Последний смешной скриншот, который сохранили, — о чём он?',
  'Питомцы дома, на работе или в телефоне?',
  'Что вы открывали в последний раз: холодильник или чат?',
  'Одно блюдо, которое вы готовите лучше, чем кто-либо из знакомых?',
  'Какая экранизация лучше книги? Отстаивайте.',
  'Какой странный факт знаете вы, а не знают другие?',
  'Чему бы вы научили человека из прошлого? □ текст',
  'Какое ваше маленькое «да» сейчас — про что?',
  'Сова, жаворонок или «как ляжет»?',
  'Одно приложение/сервис, без которого проживёте неделю?',
  'Любимый мем сезона — кидайте, проверим географию узнаваемости.',
  'Что вас недавно искренне порадовало?',
  'Какой проект отложили «на потом» до сих пор?',
  'Опишите свой голос одним словом — и послушайте голосовое друг друга.',
  'Какой цвет — ваш сегодня?',
  'Будь сейчас 2004 год, какой был бы ваш статус в соцсетях?',
  'Что у вас на столе прямо сейчас?',
  'Какой вопрос стесняетесь спросить у людей постарше?',
  'Какое «спасибо» вам запомнилось больше всего?',
  'Если бы существовал музей вас, что в первых трёх залах?',
  'Какой документальный фильм откроет вам глаза?',
  'Какой аромат — ваш? (Кофе, дождь, новый пластик — всё считается.)',
  'Что вы коллекционируете без стыда?',
  'Одна вещь, которую стоит попробовать каждому.',
  'Какое место ждёт вашего визита уже больше года?',
  'Листики 🍃 вы тратите на что в первую очередь?',
  'Какая игра в «Нудисте» втянула вас сильнее остальных?',
  'Если бы ваш аватар оживлял вас на 5 минут в день — что бы она делала?',
  'Какой вопрос вы бы задали «Нудисту», будь сервер человеком?',
  'Какую привычку хотели бы встроить в неделю?',
  'Ваш главный совет тому, кто регется сегодня?',
];
const WRAPS = [
  'Что хорошего случилось сегодня — в двух строках?',
  'Одна маленькая победа дня. У меня была: отвечаю первым. А у вас?',
  'Что за сегодня стоило запомнить? Память — тоже архив.',
  'Кому из своих вы бы сегодня сказали спасибо? Можно прямо в чате.',
  'Чем закончился день: мир, тишина или няшные катастрофы?',
  'Чему новый день вас научил? Или хотя бы разозлил?',
  'Что самое тёплое из сегодняшнего? Только честно.',
  'Если бы сегодня был эпизод сериала — как бы он назывался?',
  'Что вы сегодня доделали (наконец-то)?',
  'Кому написали первым сегодня? Пишите им ещё, не жадничайте.',
  'Главное разочарование и главная радость дня — по одному слову.',
  'Что бы вы повторили завтра обязательно?',
  'Один скриншот дня — словами.',
  'Ваш личный КПД сегодня: в процентах и в хорошем настроении.',
  'Что услышали сегодня в голосовых от близких?',
  'Какое слово сегодня чаще всего просилось в голосовое?',
  'Если бы сегодняшний день — кот, какой он?',
  'Чему аплодируете в себе сегодня?',
  'Что отложили на завтра — и легче ли с этим спать?',
  'Одна вещь, которую вы сделали ради себя, а не ради дел.',
];
const POLLS = [
  { q: 'Когда вы чаще всего в «Нудисте»?', opts: ['Утром с кофе', 'Днём', 'Вечером после дел', 'Глубокой ночью'] },
  { q: 'Зачем вы здесь прежде всего?', opts: ['Общаться', 'Читать ленту', 'Играть и события', 'Мемить и смеяться'] },
  { q: 'Идеальное сообщество: что добавить?', opts: ['Больше мини-игр', 'Турниры и призы', 'Больше событий по календарю', 'Листай, что есть'] },
  { q: 'Ананас на пицце — это…', opts: ['Высокая кухня', 'Преступление', 'Личные предпочтения', 'Я пришёл за другим'] },
  { q: 'Чем чаще делитесь в чатах?', opts: ['Голосовыми', 'Текстом', 'Фото и видео', 'Стикерами — стикеры наше всё'] },
  { q: 'Ваш любимый ритуал тут?', opts: ['Вопрос дня утром', 'Итоги недели', 'Мем-батл по пятницам', 'У меня нет ритуалов, я свободный человек'] },
  { q: 'Куда вас заманили бы события «Нудиста»?', opts: ['Адвент-календарь', 'Мандариновый дождь', 'Хэллоуин-марафон', 'Новый год на пляже'] },
  { q: 'Огонёк кому важнее?', opts: ['Личный — с конкретным человеком', 'В группе — там все свои', 'Мне нужен +1 день, а кому — всё равно', 'Огоньки мой кошмар, я сапёр'] },
];
const CHALLENGES = [
  'Напишите сегодня троим, кому давно не писали, «как день?» — просто так.',
  'Скажите в чате одну маленькую победу этой недели.',
  'Спросите то, что стеснялись спросить. Скорее всего, ответ облегчит вам жизнь.',
  'Отправьте кому-нибудь мем без слов — одним стикером.',
  'Узнайте у двух человек, чем им нравится «Нудист».',
  'Сделайте один звонок, который откладывали больше недели.',
  'Придумайте одно желание для общего чата и напишите его.',
  'Отблагодарите репликой того, с кем обычно спорите.',
  'Расскажите шутку недели — пусть честно скажут «не смешно».',
  'Замените одно голосовое текстом — и послушайте, легче ли без него?',
  'Напишите: «Я сегодня такой-то, и это нормально».',
  'Похвалите первое, что заметили в человеке над вами в чате.',
];
const BATTLES = [
  '🖼 **Мем-батл недели открыт.** Кидайте сюда лучшие мемы до воскресенья 20:00 — победителю (по реакциям) 50 🍃 на счёт.',
  '🖼 **Батл мемов.** Правила простые: мем — в чат, реакция 🍀 решает. Воскресенье, 20:00 — объявим короля и вручим 50 🍃.',
  '🖼 **Пятница, значит мем-батл.** Лучший мем по реакциям уносит 50 🍃. Спорный юмор — только в смешной чёрный пиджак.',
  '🖼 **Чемпионат недели по мемам.** Загружайте в чат всё, за что не стыдно (почти). Воскресенье — финал и 50 🍃.',
];
const plural = (n, one, few, many) => { const k = n % 100, d = n % 10; return k > 10 && k < 20 ? many : d === 1 ? one : d > 1 && d < 5 ? few : many; };
const msk = t => new Date(t + MSK);
const dayMs = t => { const d = msk(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); };
const dayStr = t => msk(t).toISOString().slice(0, 10);
const dayIdx = t => Math.floor(dayMs(t) / DAY);
const marksOf = () => (db.meta.community = db.meta.community || { marks: {} }).marks || (db.meta.community.marks = {});
const markGet = k => marksOf()[k];
const markSet = (k, day, tNow) => { marksOf()[k] = day || (tNow ? dayStr(tNow) : dayStr(Ev.T())); };
const pruneMarks = tNow => { const m = marksOf(), lim = dayStr(tNow - 45 * DAY); for (const k of Object.keys(m)) { const v = m[k]; if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) continue; if (v < lim) delete m[k]; } };
const communityChats = () => {
  const ov = String(process.env.COMMUNITY_CHAT || '').toLowerCase();
  const common = db.meta.common && db.chats[db.meta.common] ? db.chats[db.meta.common] : null;
  const id = C.chatNames && C.chatNames.get('nudist_community'); const community = (id && db.chats[id]) || null;
  if (ov === 'common') return common ? [common] : [];
  if (ov === 'community') return community ? [community] : [];
  if (ov === 'both') return [common, community].filter(Boolean);
  return common ? [common] : community ? [community] : [];      // auto: все в «Весь Нудист», иначе клуб
};

// План публикаций на момент времени t: массив { key, kind } — чистая функция, ничего не меняет.
function planTasks(t) {
  const out = [], d = msk(t), wd = d.getUTCDay(), h = d.getUTCHours(), day = d.toISOString().slice(0, 10);
  if (h >= Q_HOUR && h < 21) out.push({ key: 'q-' + day, kind: 'question' });
  if (wd === 2 && h >= FACT_HOUR) out.push({ key: 'fact-' + day, kind: 'fact' });
  if (wd === 3 && h >= POLL_HOUR) out.push({ key: 'poll-' + day, kind: 'poll' });
  if (wd === 4 && h >= INVITE_HOUR) out.push({ key: 'invite-' + day, kind: 'invite' });
  if (wd === 5 && h >= BATTLE_HOUR && h < 23) out.push({ key: 'battle-' + day, kind: 'battle' });
  if (wd === 6 && h >= CHALLENGE_HOUR) out.push({ key: 'ch-' + day, kind: 'challenge' });
  if (d.getUTCMonth() === 11 && d.getUTCDate() >= 1 && d.getUTCDate() <= 25 && h >= ADVENT_HOUR) out.push({ key: 'advent-' + day, kind: 'advent' });
  // анонсы стартов событий из календаря года (адвент уже покрыт ежедневным пушем)
  const seasonYear = new Date(t + MSK - 15 * DAY).getUTCFullYear();
  for (const e of Ev.LIST || []) {
    if (e.id === 'advent') continue;
    const w = Ev.winFor && Ev.winFor(seasonYear, e.id); if (!w) continue;
    if (dayStr(w[0]) === day) out.push({ key: `ev-${e.id}-${seasonYear}`, kind: 'event', event: e });
  }
  if (wd === 0 && h >= WEEK_HOUR) out.push({ key: 'week-' + day, kind: 'week' });
  if (h >= WRAP_HOUR) out.push({ key: 'wrap-' + day, kind: 'wrap' });
  return out;
}
const qText = t => '❓ **Вопрос дня.** ' + QUESTIONS[dayIdx(t) % QUESTIONS.length];
const factText = t => '🍃 **Факт дня.** ' + ((B.FACTS || [])[dayIdx(t) % (B.FACTS || ['']).length] || '');
const inviteText = () => '🤝 **Позовите друга.** ☰ → «Позвать друзей» — отправьте ссылку тому, с кем давно хотели наладить переписку. Обоим по 100 🍃.';
const challengeText = t => '🎯 **Субботний челлендж.** ' + CHALLENGES[dayIdx(t) % CHALLENGES.length];
const wrapText = t => '🌙 **Итог дня.** ' + WRAPS[dayIdx(t) % WRAPS.length];
const battleText = t => BATTLES[dayIdx(t) % BATTLES.length];
const weekStats = (ch, t) => {
  const from = t - 7 * DAY, msgs = (db.msgs && db.msgs[ch.id]) || [];
  let n = 0; const authors = new Set();
  for (const m of msgs) { if (m.ts < from || m.type === 'service' || m.from === db.meta.sys) continue; const u = db.users[m.from]; if (!u || u.bot || u.deleted) continue; n++; authors.add(m.from); }
  return { n, authors: authors.size };
};
// Подсчёт победителя батла: самое лайкаемое (по реакциям) сообщение человека, написанное после старта пятницы.
function battleWinner(ch, since) {
  const msgs = (db.msgs && db.msgs[ch.id]) || []; let best = null, bestN = 0;
  for (const m of msgs) { if (m.ts < since || m.type === 'service' || !m.rx) continue; const u = db.users[m.from]; if (!u || u.bot || u.deleted || m.from === db.meta.sys) continue; const n = Object.values(m.rx).reduce((a, b) => a + b.length, 0); if (n > bestN) { bestN = n; best = m; } }
  return bestN >= 1 ? { m: best, n: bestN } : null;
}
const tell = (ch, text) => { try { C.postMessage(ch, db.meta.sys, { text, silent: true }, { quiet: true }); return true; } catch (e) { console.error('[community]', e.message); return false; } };

function tick() {
  if (process.env.COMMUNITY_AUTO === 'off') return;
  const targets = communityChats(); if (!targets.length || !db.meta.sys || !db.users[db.meta.sys]) return;
  const t = Ev.T ? Ev.T() : Date.now(); pruneMarks(t);
  const tellAll = text => { let ok = false; for (const ch of targets) { ok = tell(ch, text) || ok; } return ok; };
  for (const task of planTasks(t)) {
    if (markGet(task.key)) continue;
    let ok = false;
    if (task.kind === 'question') ok = tellAll(qText(t));
    else if (task.kind === 'fact') ok = tellAll(factText(t));
    else if (task.kind === 'invite') ok = tellAll(inviteText());
    else if (task.kind === 'challenge') ok = tellAll(challengeText(t));
    else if (task.kind === 'wrap') ok = tellAll(wrapText(t));
    else if (task.kind === 'poll') { const p = POLLS[dayIdx(t) % POLLS.length]; for (const ch of targets) { try { C.postMessage(ch, db.meta.sys, { type: 'poll', poll: { q: p.q, opts: p.opts, anon: true, votes: {} }, silent: true }, { quiet: true }); ok = true; } catch (e) { console.error('[community]', e.message); } } }
    else if (task.kind === 'battle') { ok = tellAll(battleText(t)); if (ok) db.meta.community.battle = { since: dayMs(t) - MSK + BATTLE_HOUR * 3600e3, day: task.key.slice(7), pending: targets.map(x => x.id) }; }
    else if (task.kind === 'advent') { const d = msk(t).getUTCDate(); ok = tellAll(`🎁 **Адвент, день ${d}.** Окошко дня открыто: «Хаб» → «События» → «Адвент-календарь». Кто открыл — отмечайте сообщение реакцией 🎁`); }
    else if (task.kind === 'event' && task.event) { const e = task.event; ok = tellAll(`🎉 **Началось: ${e.e} «${e.name}».** ${e.about}\nЗадания и игру — в «Хаб» → «События».`); }
    else if (task.kind === 'week') {
      ok = true;
      for (const ch of targets) {                       // итоги и батл — отдельно для каждой цели
        const s = weekStats(ch, t); let extra = '';
        const b = db.meta.community.battle;
        if (b && b.since && (b.pending || []).includes(ch.id)) {
          const w = battleWinner(ch, b.since);
          if (w) { const u = db.users[w.m.from]; u.stars = (u.stars || 0) + BATTLE_PRIZE; try { R.selfUpdate(u); } catch (e) { /* обновится при следующем действии */ } extra = `\n🖼 Мем-батл выиграл(а) **${R.uname ? R.uname(u) : (u.name || 'кто-то')}** — +${BATTLE_PRIZE} 🍃 (${w.n} ${plural(w.n, 'реакция', 'реакции', 'реакций')}).`; }
          else extra = '\n🖼 Мем-батл тихо не случился — в пятницу реванш.';
          b.pending = (b.pending || []).filter(id => id !== ch.id);
          if (!b.pending.length) delete db.meta.community.battle;
        }
        if (!tell(ch, `🏁 **Итоги недели под одной крышей.**\nЗа 7 дней: **${s.n}** ${plural(s.n, 'сообщение', 'сообщения', 'сообщений')} от **${s.authors}** ${plural(s.authors, 'человека', 'людей', 'человек')}. Спасибо, что вы тут.${extra}\nДальше: завтра вопрос дня в 09:00, в среду — опрос, в пятницу — новый мем-батл.`)) ok = false;
      }
    }
    if (ok) markSet(task.key, dayStr(t), t);
  }
  // одиночный вызов save() для всех меток и призов
  try { save(); } catch (e) { console.error('[community]', e.message); }
}
module.exports = { tick, planTasks, QUESTIONS, WRAPS, BATTLES, POLLS, CHALLENGES };
