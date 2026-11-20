'use strict';
// Делаем мессенджер интересным творческим людям и айтишникам: готовые сообщества по интересам,
// которые можно открыть в один клик — общий канал, свои правила, доска работ и заказов.
//
// Это не спам и не «весь мир в одном чате»: каждое сообщество — отдельная группа со своим порядком,
// и вступить можно только самому. Список лежит в базе, поэтому его можно править из админки.
const C = require('./core');
const R = require('./rpc');
const { db, save, need, str } = C;
const H = R.H;

// Готовые сообщества. «Теги» — по ним потом ищут люди в поиске и в знакомстве.
const TEMPLATES = [
  { id: 'code', name: 'Код и листики', emoji: '⌨️', about: 'Айтишники «Нудиста»: кто пишет, что делает, где ищет заказы. Без сеньорства и «выучи JS за месяц».',
    cat: 'айти', channels: [['общий', 'text'], ['ищу-работу', 'forum'], ['показываю-код', 'text'], ['вопросы-новичков', 'forum'], ['фриланс-заказы', 'forum'], ['созвон', 'voice']] },
  { id: 'make', name: 'Рисуем и фотографируем', emoji: '🎨', about: 'Творческие: рисунок, фото, дизайн, тату, керамика. Показываем работы и просим честный фидбэк.',
    cat: 'творчество', channels: [['общий', 'text'], ['мои-работы', 'text'], ['фидбэк', 'forum'], ['ищу-модель', 'forum'], ['инструменты', 'text'], ['мастерская', 'voice']] },
  { id: 'musiclab', name: 'Музыкальная лаборатория', emoji: '🎧', about: 'Кто пишет музыку, сводит, играет в группе или просто ищет, с кем послушать. Сюда кидаем треки.',
    cat: 'творчество', channels: [['общий', 'text'], ['мои-треки', 'text'], ['ищу-группу', 'forum'], ['звук-и-сведение', 'text'], ['слушаем-вместе', 'voice']] },
  { id: 'design', name: 'Дизайн-кухня', emoji: '🖌️', about: 'Интерфейсы, айдентика, вёрстка. Показываем до/после и разбираем, почему кнопка здесь не нужна.',
    cat: 'творчество', channels: [['общий', 'text'], ['портфолио', 'text'], ['критика', 'forum'], ['вакансии', 'forum'], ['кухня', 'voice']] },
  { id: 'film', name: 'Кино и клипы', emoji: '🎬', about: 'Снимаем, монтируем, смотрим. Здесь ищут оператора, монтажёра и того, кто согласится на главную роль.',
    cat: 'творчество', channels: [['общий', 'text'], ['наши-клипы', 'text'], ['ищу-команду', 'forum'], ['смотрим-вместе', 'voice']] },
  { id: 'text', name: 'Тексты и сценарии', emoji: '✍️', about: 'Пишем статьи, сценарии, стихи и подписи к мемам. Помогаем друг другу вычитывать и сокращать.',
    cat: 'творчество', channels: [['общий', 'text'], ['читаем-вслух', 'text'], ['правки', 'forum'], ['ищу-автора', 'forum']] },
];
const tagOf = t => ({ code: 'код', make: 'рисование', musiclab: 'музыка', design: 'дизайн', film: 'кино', text: 'книги' }[t.id]);

function ensure() {
  for (const t of TEMPLATES) {
    if (db.meta && db.meta.seeds && db.meta.seeds[t.id] && db.servers[db.meta.seeds[t.id]]) continue;
    // Группа создаётся от лица сервиса: владелец — бот «Нудист», но её видно в каталоге и можно вступить.
    const own = Object.values(db.users).find(u => u.bot && !u.deleted);
    if (!own) return;
    try {
      const s = R.H['server.create']({ uid: own.id, id: 'seed', send: () => {}, raw: () => {} }, { name: t.name, template: 'basic' });
      const sid = s && s.id;
      if (!sid) continue;
      const srv = db.servers[sid];
      if (srv) { srv.about = t.about; srv.seed = t.id; srv.pub = true; srv.tags = [tagOf(t)]; }
      // каналы по шаблону
      const cats = srv && srv.cats;
      if (cats && cats.length) {
        const first = cats[0];
        for (const [name, kind] of t.channels.slice(1)) {
          try { R.H['server.channel.new']({ uid: own.id, id: 'seed', send: () => {}, raw: () => {} }, { server: sid, cat: first.id, name, kind }); } catch (e) { /* похожий канал уже есть */ }
        }
      }
      // Запоминаем, что это сообщество уже создано, чтобы не плодить копии при следующем запуске.
      db.meta = db.meta || {}; db.meta.seeds = db.meta.seeds || {}; db.meta.seeds[t.id] = sid;
      save();
    } catch (e) { console.warn('[guilds] не создалось сообщество', t.id, e.message); }
  }
}

// Что показать в «Сообществах»: готовые, если человек ещё не вступил, и количество людей.
const seedId = t => (db.meta && db.meta.seeds && db.meta.seeds[t.id]) || null;
H['guilds.seed'] = c => {
  const out = TEMPLATES.map(t => {
    const s = db.servers[seedId(t)];
    return { id: seedId(t), tpl: t.id, name: t.name, emoji: t.emoji, about: t.about, cat: t.cat,
      members: s ? C.size(s.members) : 0, joined: !!(s && s.members[c.uid]), exists: !!s };
  });
  return { list: out };
};
H['guilds.join'] = (c, p) => {
  const t = str(p.tpl, 20), s = db.servers[seedId({ id: t })];
  need(s, 'Это сообщество ещё не открылось');
  need(!s.members[c.uid], 'Вы уже здесь');
  const u = db.users[c.uid]; need(u, 'Вход не выполнен');
  R.H['server.join']({ uid: u.id, id: 'join', send: () => {}, raw: () => {} }, { id: s.id });
  return { ok: true, id: s.id };
};

module.exports = { ensure, TEMPLATES };
