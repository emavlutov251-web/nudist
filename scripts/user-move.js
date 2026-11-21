'use strict';
// Перенос аккаунта: всё содержимое @Knox переходит на @VegasHazb, @Knox освобождается и удаляется.
// Запуск:
//   node scripts/user-move.js <db.json> <knox> <vegas>            — проверка, ничего не меняет (печатает отчёт)
//   node scripts/user-move.js <db.json> <knox> <vegas> --apply    — применить и записать файл
// Важно: сервер перед применением должен быть остановлен (файл перезаписывается целиком).
const fs = require('fs');
const crypto = require('crypto');

const [, , file, fromName, toName, flag] = process.argv;
if (!file || !fromName || !toName) { console.error('Нужно: <db.json> <откуда> <куда> [--apply]'); process.exit(2); }
const APPLY = flag === '--apply';

const db = JSON.parse(fs.readFileSync(file, 'utf8'));
const byName = n => Object.values(db.users).find(u => (u.username || '').toLowerCase() === n.replace(/^@/, '').toLowerCase());

const A = byName(fromName), B = byName(toName);
if (!A || !B) { console.error('Не нашёл аккаунт:', !A ? fromName : toName); process.exit(2); }
if (A.id === B.id) { console.error('Это один и тот же аккаунт'); process.exit(2); }
if (A.deleted) { console.error('Аккаунт', fromName, 'уже удалён'); process.exit(2); }

const log = [];
const say = (s) => { log.push(s); console.log(s); };
say(`Перенос @${A.username} → @${B.username} (${A.id} → ${B.id})`);
say(APPLY ? 'РЕЖИМ: применить изменения' : 'РЕЖИМ: только проверка, база не меняется');

// Слияние двух историй одного чата: порядок по времени сообщения, seq пересчитывается подряд.
// Простое «дописать в конец» переставило бы новые сообщения B после старых A — так нельзя.
function mergeByTime(chatId, incoming) {
  const all = [...(db.msgs[chatId] || []), ...incoming];
  all.sort((a, b) => (a.ts || 0) - (b.ts || 0) || (a.seq || 0) - (b.seq || 0));
  let seq = 0;
  for (const m of all) { m.seq = ++seq; m.chat = chatId; if (m.from === oldId) m.from = newId; }
  db.msgs[chatId] = all;
  const c = db.chats[chatId]; if (c) c.seq = seq;
  return all.length;
}

// ───── 1. Собираем всё, что нужно перевести
const ids = new Set([A.id]);
const oldId = A.id, newId = B.id;

// старые личные чаты (dm_…) и секретные чаты один-на-один переименуем под новый id:
// id личного чата — это dm_<id1>_<id2>, иначе при следующем открытии создастся второй такой же чат.
const chatRemap = new Map();
for (const cid of A.chats || []) {
  const c = db.chats[cid];
  if (!c) continue;
  const peers = Object.keys(c.members || {}).filter(u => u !== oldId);
  const oneToOne = peers.length === 1 && (c.type === 'dm' || c.type === 'secret');
  if (!oneToOne) continue;
  const peer = peers[0];
  if (db.chats[`dm_${[newId, peer].sort().join('_')}`] && c.type === 'dm') {
    say(`  ! ${c.type}: у @${(db.users[peer] || {}).username || peer} уже есть чат с @${B.username} — история сольётся в него`);
  }
}

// ───── 2. Перенос чатов
say('── Чаты');
const movedChats = [];
// Обходим ВСЕ чаты, где аккаунт числится участником, а не только его собственный список.
// Причина: после прошлых переносов id участника мог замениться в members чата, но не в списке u.chats
// (или остался «мёртвый» id) — по списку такие чаты терялись бы.
const myChats = new Set([...(A.chats || [])]);
for (const [cid, c] of Object.entries(db.chats)) if (c && c.members && c.members[oldId]) myChats.add(cid);
for (const cid of [...myChats]) {
  const c = db.chats[cid];
  if (!c) { say(`  ? чат ${cid} не найден — пропускаю`); continue; }
  const peers = Object.keys(c.members || {}).filter(u => u !== oldId);

  if (c.type === 'saved') {
    // «Избранное» у каждого своё — переносим записи в Избранное B
    const mySaved = (B.chats || []).map(x => db.chats[x]).find(x => x && x.type === 'saved');
    const src = db.msgs[cid] || [];
    if (!mySaved) { say(`  ? у @${B.username} нет Избранного — записи некуда класть`); continue; }
    mergeByTime(mySaved.id, src);
    delete db.chats[cid]; delete db.msgs[cid];
    say(`  ✓ Избранное: ${src.length} записей → Избранное @${B.username}`);
    continue;
  }

  // Личный чат между двумя сливаемыми аккаунтами превратился бы в «чат с самим собой»,
  // а такого в проекте нет (rpc.js: «Вы и так всегда с собой»). Убираем, сообщения — в Избранное.
  if ((c.type === 'dm' || c.type === 'secret') && peers.length === 1 && peers[0] === newId) {
    const src = db.msgs[cid] || [];
    const mySaved = (B.chats || []).map(x => db.chats[x]).find(x => x && x.type === 'saved');
    if (src.length && mySaved) {
      mergeByTime(mySaved.id, src);
    }
    delete db.chats[cid]; if (db.msgs[cid]) delete db.msgs[cid];
    say(`  − личный чат @${A.username} ↔ @${B.username} убран (он был ${src.length ? `не пуст: ${src.length} сообщений → в Избранное` : 'пуст'})`);
    continue;
  }

  if ((c.type === 'dm' || c.type === 'secret') && peers.length === 1) {
    const peer = peers[0];
    let target = cid, merged = false;
    if (c.type === 'dm') {
      const want = `dm_${[newId, peer].sort().join('_')}`;
      const other = db.chats[want];
      if (other) {
        // у собеседника уже есть чат с B — переносим сообщения туда, старый убираем
        const src = db.msgs[cid] || [];
        // состояние прочтения и настройки чата берём самые свежие
        if (c.st[oldId] && (!other.st[newId] || (c.st[oldId].read || 0) > (other.st[newId].read || 0))) other.st[newId] = c.st[oldId];
        for (const f of ['pin', 'muted', 'pet']) if (other[f] === undefined && c[f] !== undefined) other[f] = c[f];
        const total = mergeByTime(want, src);
        delete db.chats[cid]; delete db.msgs[cid];
        say(`  ⇄ ${(db.users[peer] || {}).username || peer}: ${src.length} сообщений влиты по времени (всего ${total})`);
        movedChats.push(want); continue;
      }
      target = want; merged = false;
    } else {
      // секретный: id произвольный, но ключи привязаны к участникам — переносим их на B
      target = cid;
    }
    const c2 = c;
    if (target !== cid) {
      // переименовываем чат и все его сообщения; id чата поменялся — его нужно заменить
      // в списках чатов ВСЕХ участников, иначе у собеседника останется ссылка на несуществующий чат
      // и чат исчезнет у него из списка (висел бы «мёртвый» id, а переписка стала бы недоступной).
      delete db.chats[cid];
      c2.id = target;
      db.chats[target] = c2;
      for (const m of db.msgs[cid] || []) { m.chat = target; if (m.from === oldId) m.from = newId; }
      db.msgs[target] = db.msgs[cid] || []; delete db.msgs[cid];
      for (const uid of Object.keys(c2.members || {})) {
        const u = db.users[uid]; if (!u || !Array.isArray(u.chats)) continue;
        const at = u.chats.indexOf(cid);
        if (at >= 0) u.chats[at] = target;
        else if (!u.chats.includes(target)) u.chats.push(target);
      }
      for (const s2 of Object.values(db.servers || {})) if (Array.isArray(s2.channels)) s2.channels = s2.channels.map(x => x === cid ? target : x);
      for (const coll of ['scheduled', 'reports', 'invites']) {
        const items = Array.isArray(db[coll]) ? db[coll] : Object.values(db[coll] || {});
        for (const it of items) if (it && it.chat === cid) it.chat = target;
      }
    } else {
      for (const m of db.msgs[cid] || []) if (m.from === oldId) m.from = newId;
    }
    // участник и его состояние
    if (c2.members[oldId]) { c2.members[newId] = c2.members[oldId]; delete c2.members[oldId]; }
    if (c2.st[oldId]) { c2.st[newId] = c2.st[oldId]; delete c2.st[oldId]; }
    c2.members[newId] = c2.members[newId] || { role: 'member' };
    if (c2.st[newId] === undefined) c2.st[newId] = { read: c2.seq || 0 };
    if (c2.type === 'secret' && c2.keys) {
      if (c2.keys[oldId]) { c2.keys[newId] = c2.keys[oldId]; delete c2.keys[oldId]; }
      if (c2.by === oldId) c2.by = newId;
    }
    movedChats.push(target);
    const n = (db.msgs[target] || []).length;
    say(`  ✓ ${c2.type === 'secret' ? 'секретный' : 'личный'} с @${(db.users[peer] || {}).username || peer}: ${n} сообщений`);
    continue;
  }

  // группы и каналы: меняем участника, роль сохраняется
  const role = (c.members[oldId] || {}).role;
  c.members[newId] = { ...(c.members[newId] || {}), ...(c.members[oldId] || {}) };
  if (c.members[newId].role === undefined) c.members[newId].role = role || 'member';
  // при слиянии ролей берём старшую
  else if (role === 'owner') c.members[newId].role = 'owner';
  else if (role === 'admin' && c.members[newId].role === 'member') c.members[newId].role = 'admin';
  delete c.members[oldId];
  if (c.st[oldId]) { c.st[newId] = { ...(c.st[oldId]), ...(c.st[newId] || {}) }; delete c.st[oldId]; }
  for (const m of db.msgs[cid] || []) if (m.from === oldId) m.from = newId;
  // в серии дней участия
  if (c.sk && c.sk.by && c.sk.by[oldId]) { c.sk.by[newId] = c.sk.by[oldId]; delete c.sk.by[oldId]; }
  if (c.by === oldId) c.by = newId;
  movedChats.push(cid);
  say(`  ✓ ${c.type} «${c.title || cid}» — роль ${c.members[newId].role}, сообщений автора переписано`);
}

// чаты, где A числится участником, но которых нет в его списке
for (const [cid, c] of Object.entries(db.chats)) {
  if (!c || !c.members || !c.members[oldId]) continue;
  if (movedChats.includes(cid)) continue;
  const role = (c.members[oldId] || {}).role;
  c.members[newId] = { ...(c.members[oldId]), ...(c.members[newId] || {}) };
  if (role === 'owner') c.members[newId].role = 'owner';
  delete c.members[oldId];
  if (c.st[oldId]) { c.st[newId] = c.st[oldId]; delete c.st[oldId]; }
  if (c.sk && c.sk.by && c.sk.by[oldId]) { c.sk.by[newId] = c.sk.by[oldId]; delete c.sk.by[oldId]; }
  for (const m of db.msgs[cid] || []) if (m.from === oldId) m.from = newId;
  movedChats.push(cid);
  say(`  + найден чат вне списка: ${c.type} «${c.title || cid}» — тоже перенесён`);
}

// ───── 3. Список чатов у B
const setB = new Set([...(B.chats || []), ...movedChats]);
B.chats = [...setB].filter(cid => db.chats[cid]);
A.chats = [];

// ───── 4. Сообщения: авторство по всей базе (ответы, пересылки, упоминания)
say('── Сообщения и прочие упоминания');
let msgFrom = 0, other = 0;
const swap = (obj, fields) => { for (const f of fields) if (obj && obj[f] === oldId) { obj[f] = newId; other++; } };
for (const arr of Object.values(db.msgs)) {
  for (const m of arr || []) {
    if (m.from === oldId) { m.from = newId; msgFrom++; }
    swap(m, ['replyTo', 'fwdFrom', 'via', 'as']);      // ссылки на автора
    if (m.rq && m.rq.from === oldId) m.rq.from = newId;   // «в ответ на» — автор цитируемого
    if (m.fwd && m.fwd.from === oldId) m.fwd.from = newId; // пересылка — автор оригинала
    if (m.quote && m.quote.from === oldId) m.quote.from = newId;
  }
}
say(`  ✓ авторство сообщений: ${msgFrom}`);

// ───── 5. Серверы, истории, подарки, тикеты, музыка, паки, аудит
for (const [sid, s] of Object.entries(db.servers || {})) {
  if (!s || !s.members) continue;
  if (s.members[oldId]) { s.members[newId] = { ...(s.members[oldId]), ...(s.members[newId] || {}) }; delete s.members[oldId]; }
  if (s.owner === oldId) s.owner = newId;
  for (const a of s.audit || []) if (a.by === oldId) a.by = newId;   // журнал сервера
}
for (const [k, st] of Object.entries(db.stories || {})) {
  if (st && st.user === oldId) st.user = newId;
  for (const v of st.viewers || []) if (v === oldId) { /* просмотры не переносим — они личные */ }
}
const rewriteArr = (coll, fields) => {
  const items = Array.isArray(coll) ? coll : Object.values(coll || {});
  for (const x of items) if (x && typeof x === 'object') swap(x, fields);
};
rewriteArr(db.gifts, ['from', 'to', 'user', 'owner', 'gifter', 'recipient']);
rewriteArr(db.tickets, ['user', 'by', 'uid', 'owner']);
rewriteArr(db.tracks, ['user', 'owner', 'by']);
rewriteArr(db.feed, ['user', 'by', 'from']);
rewriteArr(db.clips, ['user', 'by', 'from']);
rewriteArr(db.invites, ['by', 'user', 'from']);
rewriteArr(db.orders, ['user']);
rewriteArr(db.scheduled, ['user', 'from', 'by']);
rewriteArr(db.reports, ['by', 'user', 'from', 'reporter', 'target']);
rewriteArr(db.audit, []);
// паки стикеров: ключ — id пака, автор — by
rewriteArr(db.packs, ['by', 'user', 'owner', 'from']);
if (db.packs) for (const [k, v] of Object.entries(db.packs)) {
  if (k === oldId) { db.packs[newId] = { ...(db.packs[newId] || {}), ...v }; delete db.packs[k]; }
}
// истории: просмотры — личные, но автор истории должен остаться живым
for (const st of Object.values(db.stories || {})) if (st && st.user === oldId) st.user = newId;
// записи «кто вёл» в объектных картах
for (const key of Object.keys(db)) {
  const v = db[key];
  if (!v || Array.isArray(v) || typeof v !== 'object') continue;
  if (v[oldId] && (key === 'daily' || key === 'presence' || key === 'online')) { v[newId] = v[oldId]; delete v[oldId]; }
}

// ───── 6. Слияние профиля: числа складываем, сроки берём больше
say('── Профиль');
const num = f => Number(A[f]) || 0;
let starsAdded = 0;
if (num('stars')) { B.stars = (Number(B.stars) || 0) + num('stars'); starsAdded = num('stars'); }
if (num('taps')) B.taps = (Number(B.taps) || 0) + num('taps');
if (num('shopN')) B.shopN = (Number(B.shopN) || 0) + num('shopN');
if (num('freeBoosts')) B.freeBoosts = (Number(B.freeBoosts) || 0) + num('freeBoosts');
if (A.premiumUntil && Number(A.premiumUntil) > (Number(B.premiumUntil) || 0)) {
  B.premiumUntil = A.premiumUntil;
  B.premiumTier = A.premiumTier || B.premiumTier;
}
if (A.premiumTier === 'max') B.premiumTier = 'max';
say(`  звёзды: ${num('stars')} + ${Number(B.stars) - starsAdded} = ${B.stars || 0}`);
say(`  премиум до: ${B.premiumUntil ? new Date(Number(B.premiumUntil)).toISOString().slice(0, 10) : 'нет'} (тариф ${B.premiumTier || '-'})`);
if (A.admin) { B.admin = A.admin; say(`  роль: ${A.admin} → @${B.username}`); }
if (A.badges || B.badges) B.badges = [...new Set([...(B.badges || []), ...(A.badges || [])])];
if (A.label && !B.label) { B.label = { ...A.label, by: A.label.by === oldId ? newId : A.label.by }; say(`  подпись «${A.label.t}» перенесена`); }
for (const f of ['owned', 'packs']) if (Array.isArray(A[f])) B[f] = [...new Set([...(B[f] || []), ...A[f]])];
for (const f of ['cos', 'mood', 'privacy']) if (A[f] && typeof A[f] === 'object') B[f] = { ...(A[f] || {}), ...(B[f] || {}) };
if (A.season && !B.season) B.season = A.season;
if (A.settings && B.settings) B.settings = { ...A.settings, ...B.settings };   // своё оформление у B важнее
for (const f of ['bio', 'city', 'tz', 'status', 'music', 'avatar', 'avatars', 'links', 'color']) {
  if (A[f] !== undefined && A[f] !== '' && (B[f] === undefined || B[f] === '')) B[f] = A[f];
}
// включённая 2FA и пароль — тоже часть «прав»
if (A.pass && !B.pass) { B.pass = A.pass; say('  пароль от @' + A.username + ' перенесён (вход по паролю доступен)'); }
if (A.totp && !B.totp) { B.totp = A.totp; say('  2FA перенесена'); }
B.pubKey = B.pubKey || A.pubKey;

// ───── 6.5. Чистка: ссылки на несуществующие чаты у всех и «невидимые» чаты
// Прошлые переименования чатов могли оставить в списках людей id, которых уже нет.
// Такая ссылка бесполезна, а чат, где человек участник, но которого нет в его списке, пропадает из интерфейса.
let deadLinks = 0, revived = 0;
for (const u of Object.values(db.users)) {
  if (!u || u.deleted || !Array.isArray(u.chats)) continue;
  const clean = u.chats.filter(cid => db.chats[cid] && !/^rave:/.test(cid));
  if (clean.length !== u.chats.length) { deadLinks += u.chats.length - clean.length; u.chats = clean; }
}
for (const [cid, c] of Object.entries(db.chats)) {
  if (!c || c.server || !c.members) continue;                      // каналы серверов живут в отдельном списке
  // служебные игры «Рейв» (id вида rave:…) живут отдельно от мессенджера и не имеют поля st —
  // в личный список чатов их класть нельзя, иначе сервер падает на st() и человек видит вечную загрузку
  if (!c.st || typeof c.st !== 'object' || /^rave:/.test(cid)) continue;
  for (const uid of Object.keys(c.members)) {
    const u = db.users[uid];
    if (!u || u.deleted || !Array.isArray(u.chats)) continue;
    if (!u.chats.includes(cid) && !(c.st && c.st[uid] && c.st[uid].hide)) { u.chats.push(cid); revived++; }
  }
}
if (deadLinks || revived) say(`  ✓ порядок в списках: убрано мёртвых ссылок ${deadLinks}, возвращено в списки ${revived} чатов`);

// ───── 6.6. Замки старшинства и журналы
// scope.locks[key] = id того, кто последним менял настройку. У ключей вида «adm.<действие>.<id>»
// id в ключе — ЭТО УДАЛЯЕМЫЙ аккаунт (его мутили, банили и т.п.): ключ переписываем на новый.
// Если так не сделать, останется замок от уже удалённого аккаунта, и действующих админов
// будет по-прежнему ограничивать «тот, кто старше» — а его больше нет.
let lockFix = 0;
const fixLocks = (obj) => {
  if (!obj || !obj.locks || typeof obj.locks !== 'object') return;
  const out = {};
  for (const [k, v] of Object.entries(obj.locks)) {
    const nk = k.split('.').map(part => part === oldId ? newId : part).join('.');
    out[nk] = v === oldId ? newId : v;
    if (nk !== k || v === oldId) lockFix++;
  }
  obj.locks = out;
};
fixLocks(db.meta);
for (const c of Object.values(db.chats)) fixLocks(c);
for (const sv of Object.values(db.servers || {})) fixLocks(sv);
// журналы чатов и серверов: автор записи
let audFix = 0;
const fixAud = (obj) => { for (const a of (obj && obj.audit) || []) if (a.by === oldId) { a.by = newId; audFix++; } };
for (const c of Object.values(db.chats)) fixAud(c);
for (const sv of Object.values(db.servers || {})) fixAud(sv);
if (lockFix || audFix) say(`  ✓ замки прав: переписано ${lockFix}, записи в журналах чатов: ${audFix}`);

// ───── 7. Освобождаем и удаляем @Knox
say('── Удаление @' + A.username);
const freedName = A.username;
for (const [t, s] of Object.entries(db.sessions)) if (s.user === oldId) delete db.sessions[t];
db.users[oldId] = { id: oldId, deleted: true, name: 'Удалённый аккаунт', created: A.created };
say(`  ✓ имя @${freedName} освобождено (может занять кто угодно)`);
say(`  ✓ сеансы @${A.username} закрыты`);

// ───── 8. Итог
const bChats = (B.chats || []).length;
say(`── Итог: у @${B.username} чатов ${bChats}, звёзд ${B.stars || 0}, админ ${B.admin || 'нет'}`);

// проверки на выходе
let errs = 0;
const bad = (s) => { errs++; say('  ✗ ' + s); };
// в личных чатах B не должно остаться старого id
for (const cid of B.chats) {
  const c = db.chats[cid]; if (!c) { bad('чат ' + cid + ' в списке, но не существует'); continue; }
  if (c.members[oldId]) bad('старый id остался участником ' + cid);
  // личный чат должен называться dm_<id1>_<id2> по своим участникам
  if (c.type === 'dm') {
    const want = 'dm_' + Object.keys(c.members || {}).sort().join('_');
    if (cid !== want) bad(`id личного чата не совпадает с участниками: ${cid} (ожидался ${want})`);
  }
  if ((c.type === 'dm' || c.type === 'secret') && Object.keys(c.members || {}).length < 2) bad('чат без собеседника (сам с собой): ' + cid);
}
if (!db.users[newId] || db.users[newId].deleted) bad('аккаунт @' + B.username + ' пропал!');
if (db.users[oldId] && !db.users[oldId].deleted) bad('старый аккаунт не удалён');
say(errs ? `ПРОВАЛОВ: ${errs}` : 'Проверки пройдены');

if (APPLY) {
  if (errs) { console.error('Не записываю: есть провалы проверок'); process.exit(1); }
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, file);
  say('Записано в ' + file);
}
fs.writeFileSync('/tmp/user-move-report.txt', log.join('\n'));
process.exit(errs ? 1 : 0);
