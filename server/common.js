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
  let owners = [...C.OWNERS].map(i => db.users[i]).filter(human);
  if (!owners.length) owners = Object.values(db.users).filter(u => u.admin === 'superadmin' && human(u)).sort((a, b) => (a.created || 0) - (b.created || 0));   // запасной вариант: первый главный админ, если в окружении нет OWNERS
  if (!owners.length) owners = Object.values(db.users).filter(human).sort((a, b) => (a.created || 0) - (b.created || 0));                                        // совсем запасной: самый первый зарегистрированный человек
  if (!owners.length) return null;                                                        // людей ещё нет — создадим при первой регистрации
  const boss = (process.env.COMMON_OWNER && owners.find(u => u.id === process.env.COMMON_OWNER)) || owners[0], type = wantChannel() ? 'channel' : 'group';
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

// ───── Одноразовый переезд: старая общая беседа → «Нудист», старая удаляется, «Весь Нудист» заводится заново.
// Срабатывает один раз (флаг db.meta.commonRefreshed) при старте сервера. Если чат «Нудист» не найден или находится
// неоднозначно — ничего не меняем и пробуем на следующем старте. Принудительно указать цель можно переменной
// COMMON_ARCHIVE (id чата, @username или код приглашения).
const okTarget = ch => !!ch && (ch.type === 'group' || ch.type === 'channel') && !ch.server;
function pickArchive() {
  const o = String(process.env.COMMON_ARCHIVE || '').trim();
  if (o) {
    const code = (o.match(/(?:join=|\+)([\w-]{6,})$/) || [])[1];
    for (const key of [o, code].filter(Boolean)) { const inv = (db.invites || {})[key]; if (inv && inv.chat && okTarget(db.chats[inv.chat])) return db.chats[inv.chat]; }
    if (okTarget(db.chats[o])) return db.chats[o];
    const n = o.replace(/^.*[@/]/, '').toLowerCase();
    if (C.chatNames && C.chatNames.has(n) && okTarget(db.chats[C.chatNames.get(n)])) return db.chats[C.chatNames.get(n)];
    console.error('[common] COMMON_ARCHIVE не указывает на группу или канал — перенос не выполнен:', o);
    return null;
  }
  const hits = Object.values(db.chats).filter(ch => okTarget(ch) && String(ch.title || '').trim().toLowerCase() === 'нудист');
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) console.error(`[common] найдено несколько чатов «Нудист» (${hits.length}) — укажите COMMON_ARCHIVE (id чата, @username или код приглашения); перенос не выполнен`);
  else console.error('[common] чат «Нудист» не найден — перенос не выполнен; укажите COMMON_ARCHIVE (id чата, @username или код приглашения)');
  return null;
}
function refreshCommon() {
  if (db.meta.commonRefreshed) return;
  const oldId = db.meta.common;
  const old = oldId ? db.chats[oldId] : null;
  if (!old) return;                                                                          // свежей установке нечего переносить (беседа появится позже — переедет на следующем старте)
  const target = pickArchive();
  if (!target) return;                                                                // ничего не трогаем, попробуем на следующем старте
  if (target.id === old.id) { console.error('[common] COMMON_ARCHIVE указывает на саму общую беседу — перенос не выполнен'); return; }
  const moved = (db.msgs[old.id] || []).slice();
  for (const m of moved) { m.chat = target.id; m.seq = ++target.seq; }                // даты и порядок сохраняются, номера доезжают до хвоста
  db.msgs[target.id] = (db.msgs[target.id] || []).concat(moved);
  const have = new Set((db.msgs[target.id] || []).map(m => m.id));
  const pins = [...new Set([...(target.pinned || []), ...(old.pinned || [])])].filter(id => have.has(id));
  if (pins.length) target.pinned = pins; else delete target.pinned;
  old.pinned = [];
  let added = 0;
  const ownerIn = () => Object.values(target.members).some(m => m.role === 'owner');
  for (const [uid, mem] of Object.entries(old.members)) {
    if (target.members[uid]) continue;
    let role = mem.role || 'member';
    if (role === 'owner' && ownerIn()) role = 'admin';                                // у «Нудиста» свой владелец — второй не нужен
    C.addToChat(target, uid, role);
    added++;
    const ost = old.st && old.st[uid];
    if (ost && ost.mute) C.st(target, uid).mute = ost.mute;
  }
  for (const uid of Object.keys(target.members)) { const s = C.st(target, uid); s.read = target.seq || 0; if (s.pr !== undefined) s.pr = s.read; }   // «все прочитано», без сотни непрочитанных
  if (Array.isArray(old.reqs) && old.reqs.length) target.reqs = [...(target.reqs || []), ...old.reqs];
  if (C.expiring) for (const e of C.expiring) if (e.c === old.id) e.c = target.id;   // TTL-записи переезжают вместе с сообщениями
  const b = db.meta.community && db.meta.community.battle;                           // итоги мем-батла воскресенья — в новом доме истории
  if (b && Array.isArray(b.pending)) b.pending = b.pending.map(id => (id === old.id ? target.id : id));
  C.destroyChat(old);                                                                  // у всех исчезает из списка, файлы без единой ссылки уходят
  delete db.meta.common; delete db.meta.commonHello;                                   // чтобы «Весь Нудист» завелась заново (см. ниже)
  db.meta.commonRefreshed = true;
  save();
  console.log(`[common] «${old.title}» переезжает в «${target.title}»: сообщений ${moved.length}, участников добавлено ${added} — старая беседа удалена`);
}

// Одно объявление от служебного бота — чтобы о беседе узнали все: в группе сообщение приходит уведомлением каждому участнику.
function hello() {
  const ch = db.meta.common && db.chats[db.meta.common];
  if (!ch || ch.type !== 'group' || db.meta.commonHello || !db.users[db.meta.sys]) return;
  db.meta.commonHello = true;
  C.postMessage(ch, db.meta.sys, { text: HELLO }, { quiet: true });      // quiet — без ответных ботов; уведомления при этом уходят как обычно
  console.log(`[common] объявление в «${ch.title}» отправлено: ${Object.keys(ch.members).length} чел.`);
}

refreshCommon(); ensure(); toGroup();
setTimeout(() => { try { hello(); } catch (e) { console.error('[common]', e.message); } }, HELLO_DELAY);
A.hooks.onRegister.push(u => { const ch = ensure(); if (ch && human(u) && !ch.members[u.id]) { C.addToChat(ch, u.id); save(); } });

module.exports = { ensure };
