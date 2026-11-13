// «Нудист»: общий канал — в нём состоят все люди мессенджера. Создаётся один раз, когда на сервере есть владелец (OWNERS).
// Каждый, кто уже зарегистрирован, попадает в канал сразу; каждый новый — при регистрации. Выйти можно как из любого канала:
// силой обратно никого не возвращаем. Название, описание и аватар владелец меняет прямо в приложении, как у обычного канала.
//   COMMON=off            — не заводить общий канал;
//   COMMON_OWNER=<id>     — кто из владельцев станет владельцем канала (остальные владельцы — админы);
//   COMMON_TITLE, COMMON_ABOUT, COMMON_TYPE=group — название, описание и вид (канал или группа) при создании.
'use strict';
const C = require('./core');
const A = require('./auth');
const { db, save } = C;

const human = u => !!u && !u.bot && !u.deleted;
function ensure() {
  if (process.env.COMMON === 'off') return null;
  if (db.meta.common !== undefined) return db.chats[db.meta.common] || null;      // владелец удалил канал — заново не создаём
  const owners = [...C.OWNERS].map(i => db.users[i]).filter(human); if (!owners.length) return null;
  const boss = owners.find(u => u.id === process.env.COMMON_OWNER) || owners[0], group = process.env.COMMON_TYPE === 'group';
  const ch = C.newChat(group ? 'group' : 'channel', { title: String(process.env.COMMON_TITLE || 'Весь Нудист').slice(0, 100),
    about: String(process.env.COMMON_ABOUT || 'Общий канал: здесь все, кто есть в «Нудисте». Новости, объявления и главное за день.').slice(0, 500),
    pub: true, verified: true, everyone: true, color: 3, perms: group ? { send: true, invite: true, pin: false, info: false } : undefined });
  C.addToChat(ch, boss.id, 'owner');
  C.service(ch, boss.id, group ? 'общая группа создана' : 'канал создан');      // до остальных: канал появится у всех в списке, но без «непрочитанного»
  for (const o of owners) if (o !== boss) C.addToChat(ch, o.id, 'admin');
  let n = 0; for (const u of Object.values(db.users)) if (human(u) && !ch.members[u.id]) { C.addToChat(ch, u.id); n++; }
  db.meta.common = ch.id; save();
  console.log(`[common] общий ${group ? 'чат' : 'канал'} «${ch.title}» создан, владелец @${boss.username || boss.id}, участников: ${n + owners.length}`);
  return ch;
}
ensure();
A.hooks.onRegister.push(u => { const ch = ensure(); if (ch && human(u) && !ch.members[u.id]) { C.addToChat(ch, u.id); save(); } });

module.exports = { ensure };
