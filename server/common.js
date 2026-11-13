// «Нудист»: общая беседа — группа, в которой состоят все люди мессенджера и писать может каждый (как беседа во ВКонтакте).
// Создаётся один раз, когда на сервере есть владелец (OWNERS). Каждый, кто уже зарегистрирован, попадает в неё сразу;
// каждый новый — при регистрации. Выйти можно как из любой группы: силой обратно никого не возвращаем.
// Название, описание и аватар владелец меняет прямо в приложении.
//   COMMON=off            — не заводить общую беседу;
//   COMMON_OWNER=<id>     — кто из владельцев станет её владельцем (остальные владельцы — админы);
//   COMMON_TITLE, COMMON_ABOUT — название и описание при создании;
//   COMMON_TYPE=channel   — вместо группы завести канал: пишут только владелец и админы.
'use strict';
const C = require('./core');
const A = require('./auth');
const { db, save } = C;

const PERMS = { send: true, invite: true, pin: false, info: false };      // писать и звать людей может каждый; закреплять и менять оформление — админы
const ABOUT = { group: 'Общая беседа: здесь все, кто есть в «Нудисте». Писать может каждый.', channel: 'Общий канал: здесь все, кто есть в «Нудисте». Новости, объявления и главное за день.' };
const HELLO = '👋 **Это общая беседа «Нудиста».** Здесь все, кто зарегистрирован, и писать может каждый. Знакомьтесь, зовите друзей, кидайте мемы.\n\nНадоедят уведомления — выключите их в меню чата, никто не обидится.';
const HELLO_DELAY = Number(process.env.COMMON_HELLO_DELAY) || 180000;      // после запуска телефоны ещё переподключаются: объявление, сказанное сразу, до них бы не дошло
const human = u => !!u && !u.bot && !u.deleted;
const wantChannel = () => process.env.COMMON_TYPE === 'channel';

function ensure() {
  if (process.env.COMMON === 'off') return null;
  if (db.meta.common !== undefined) return db.chats[db.meta.common] || null;      // владелец удалил беседу — заново не создаём
  const owners = [...C.OWNERS].map(i => db.users[i]).filter(human); if (!owners.length) return null;
  const boss = owners.find(u => u.id === process.env.COMMON_OWNER) || owners[0], type = wantChannel() ? 'channel' : 'group';
  const ch = C.newChat(type, { title: String(process.env.COMMON_TITLE || 'Весь Нудист').slice(0, 100), about: String(process.env.COMMON_ABOUT || ABOUT[type]).slice(0, 500),
    pub: true, verified: true, everyone: true, color: 3, perms: type === 'group' ? { ...PERMS } : undefined });
  C.addToChat(ch, boss.id, 'owner');
  C.service(ch, boss.id, type === 'group' ? 'создал(а) группу «' + ch.title + '»' : 'канал создан');      // до остальных: чат появится у всех в списке без «непрочитанного»
  for (const o of owners) if (o !== boss) C.addToChat(ch, o.id, 'admin');
  let n = 0; for (const u of Object.values(db.users)) if (human(u) && !ch.members[u.id]) { C.addToChat(ch, u.id); n++; }
  db.meta.common = ch.id; save();
  console.log(`[common] «${ch.title}» (${type === 'group' ? 'общая группа' : 'общий канал'}) создан, владелец @${boss.username || boss.id}, участников: ${n + owners.length}`);
  return ch;
}

// Общий чат сначала был каналом. Теперь это группа: превращаем на месте — участники, история и оформление остаются.
function toGroup() {
  const ch = db.meta.common && db.chats[db.meta.common];
  if (!ch || ch.type !== 'channel' || wantChannel() || process.env.COMMON === 'off') return;
  ch.type = 'group'; ch.perms = { ...PERMS }; delete ch.sign; delete ch.price;
  if (ch.about === ABOUT.channel) ch.about = ABOUT.group;
  delete db.meta.commonHello; save();
  console.log(`[common] «${ch.title}»: канал стал общей группой, писать могут все (${Object.keys(ch.members).length} чел.)`);
}

// Одно объявление от служебного бота — чтобы о беседе узнали все: в группе сообщение приходит уведомлением каждому участнику.
function hello() {
  const ch = db.meta.common && db.chats[db.meta.common];
  if (!ch || ch.type !== 'group' || db.meta.commonHello || !db.users[db.meta.sys]) return;
  db.meta.commonHello = true;
  C.postMessage(ch, db.meta.sys, { text: HELLO }, { quiet: true });      // quiet — без ответных ботов; уведомления при этом уходят как обычно
  console.log(`[common] объявление в «${ch.title}» отправлено: ${Object.keys(ch.members).length} чел.`);
}

ensure(); toGroup();
setTimeout(() => { try { hello(); } catch (e) { console.error('[common]', e.message); } }, HELLO_DELAY);
A.hooks.onRegister.push(u => { const ch = ensure(); if (ch && human(u) && !ch.members[u.id]) { C.addToChat(ch, u.id); save(); } });

module.exports = { ensure };
