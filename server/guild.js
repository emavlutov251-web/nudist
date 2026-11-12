'use strict';
// Серверы в стиле Discord: каналы, категории, роли, приглашения, события, вебхуки + голосовые комнаты и звонки (сигналинг WebRTC).
const C = require('./core');
const R = require('./rpc');
const { db, save, now, id, token, fail, need, str, int, emit, sCan, chatView, pubUser, audit, isUpload, service, postMessage } = C;
const H = R.H;

const PERMS = ['admin', 'channels', 'roles', 'kick', 'ban', 'msgs', 'send', 'mention', 'voice', 'invite', 'audit'];
const TEMPLATES = {
  basic: { cats: [['Текстовые каналы', [['общий', 'text']]], ['Голосовые каналы', [['Общий', 'voice']]]] },
  gaming: { cats: [['Инфо', [['правила', 'rules'], ['анонсы', 'announce']]], ['Чатики', [['общий', 'text'], ['поиск-тимы', 'text'], ['клипы-и-скрины', 'text']]], ['Голос', [['Лобби', 'voice'], ['Катка №1', 'voice'], ['Катка №2', 'voice'], ['AFK (ушёл за чаем)', 'voice']]]] },
  study: { cats: [['Деканат', [['объявления', 'announce'], ['правила', 'rules']]], ['Учёба', [['общий', 'text'], ['домашка', 'text'], ['вопросы', 'forum']]], ['Аудитории', [['Читальный зал', 'voice'], ['Лекция', 'stage']]]] },
  memes: { cats: [['Вход', [['правила-пляжа', 'rules'], ['объявления', 'announce']]], ['Основное', [['болталка', 'text'], ['мемы', 'text'], ['кринж', 'text'], ['срач-по-расписанию', 'text'], ['вопросы-и-ответы', 'forum']]], ['Голосовые', [['Курилка', 'voice'], ['Шезлонги', 'voice'], ['Сцена: стендап', 'stage']]]] },
};
const getServer = (c, sid, act) => { const s = db.servers[typeof sid === 'string' ? sid : '']; need(s && s.members[c.uid], 'Сервер не найден'); if (act) need(sCan(s, c.uid, act), 'Недостаточно прав на сервере'); return s; };
function serverView(s, uid) {
  return { id: s.id, name: s.name, icon: s.icon, banner: s.banner, about: s.about, owner: s.owner, pub: s.pub, roles: s.roles, cats: s.cats, emojis: s.emojis || [], boosts: s.boosts || 0, events: s.events || [], count: C.size(s.members), verified: s.verified, color: s.color, automod: sCan(s, uid, 'channels') ? s.automod : undefined, afk: s.afk,
    me: { roles: s.members[uid].roles, nick: s.members[uid].nick, perms: C.sPerms(s, uid) } };
}
const emitServer = s => { for (const u in s.members) if (C.isOnline(u)) emit(u, 'server', serverView(s, u)); };
const emitChannels = s => { for (const u in s.members) if (C.isOnline(u)) emit(u, 'server.channels', { server: s.id, chats: s.channels.map(x => db.chats[x]).filter(ch => ch && sCan(s, u, 'view', ch)).map(ch => chatView(ch, u)) }); };
function addChannel(s, name, kind, cat, extra) {
  const ch = C.newChat('sch', { server: s.id, title: name, kind, cat, pos: s.channels.length, ...extra });
  s.channels.push(ch.id);
  return ch;
}
function createServer(owner, name, tpl, extra) {
  const s = { id: id(), name, owner, created: now(), members: {}, channels: [], cats: [], roles: [{ id: 'everyone', name: '@everyone', color: '', perms: { send: true, invite: true } }], color: Math.floor(Math.random() * 8), ...extra };
  db.servers[s.id] = s;
  for (const [cn, chans] of (TEMPLATES[tpl] || TEMPLATES.basic).cats) { const cat = { id: id(), name: cn }; s.cats.push(cat); for (const [n, k] of chans) addChannel(s, n, k, cat.id); }
  joinServer(s, owner, true);
  return s;
}
function joinServer(s, uid, quiet, role) {
  need(!(s.banned || []).includes(uid), 'Вы забанены на этом сервере');
  if (s.members[uid]) return;
  s.members[uid] = { roles: role ? [role] : [], at: now() };
  const u = db.users[uid]; u.servers = u.servers || []; if (!u.servers.includes(s.id)) u.servers.push(s.id);
  for (const cid of s.channels) { const ch = db.chats[cid]; if (ch) C.st(ch, uid).read = ch.seq || 0; }
  audit(s, uid, 'join');
  if (!quiet && C.size(s.members) <= 200) { const first = s.channels.map(x => db.chats[x]).find(ch => ch && ch.kind === 'text'); if (first) service(first, uid, 'запрыгнул(а) на сервер. Все прикрылись!'); }
  save();
  emit(uid, 'server', serverView(s, uid));
  emit(uid, 'server.channels', { server: s.id, chats: s.channels.map(x => db.chats[x]).filter(ch => ch && sCan(s, uid, 'view', ch)).map(ch => chatView(ch, uid)) });
  countSoon(s);
}
const countTimers = new Map();
function countSoon(s) {
  if (countTimers.has(s.id)) return;
  countTimers.set(s.id, setTimeout(() => {
    countTimers.delete(s.id); const cur = db.servers[s.id]; if (!cur) return;
    const count = C.size(cur.members);
    if (count <= C.conns.size) { for (const m in cur.members) if (C.isOnline(m)) emit(m, 'server.count', { id: cur.id, count }); }
    else for (const m of C.conns.keys()) if (cur.members[m]) emit(m, 'server.count', { id: cur.id, count });
  }, 2000));
}
function leaveServer(s, uid) {
  delete s.members[uid];
  const u = db.users[uid]; if (u && u.servers) u.servers = u.servers.filter(x => x !== s.id);
  for (const cid of s.channels) { const ch = db.chats[cid]; if (ch) delete ch.st[uid]; leaveRoom(cid, uid); }
  emit(uid, 'server.gone', { id: s.id }); save();
}
function destroyServer(s) {
  for (const u of Object.keys(s.members)) leaveServer(s, u);
  for (const cid of s.channels) { delete db.chats[cid]; delete db.msgs[cid]; }
  for (const k of Object.keys(db.invites)) if (db.invites[k].server === s.id) delete db.invites[k];
  delete db.servers[s.id]; save();
}

H['server.create'] = (c, p) => {
  const name = str(p.name, 60); need(name, 'У сервера должно быть имя');
  need((db.users[c.uid].servers || []).length < 50, 'Слишком много серверов');
  const s = createServer(c.uid, name, str(p.template, 16), { icon: isUpload(p.icon) ? p.icon : undefined });
  return serverView(s, c.uid);
};
H['server.update'] = (c, p) => {
  const s = getServer(c, p.id, 'channels');
  if (p.name !== undefined) { const n = str(p.name, 60); need(n, 'Нужно имя'); s.name = n; }
  if (p.about !== undefined) s.about = str(p.about, 500);
  for (const k of ['icon', 'banner']) if (p[k] !== undefined) { need(!p[k] || isUpload(p[k]), 'Некорректная картинка'); s[k] = p[k] || undefined; }
  if (p.pub !== undefined) s.pub = !!p.pub;
  if (p.afk !== undefined) s.afk = s.channels.includes(p.afk) ? p.afk : undefined;
  if (p.automod !== undefined) s.automod = { words: (Array.isArray(p.automod.words) ? p.automod.words : []).map(w => str(w, 40).toLowerCase()).filter(Boolean).slice(0, 200), flood: !!p.automod.flood, links: !!p.automod.links };
  audit(s, c.uid, 'server.update', Object.keys(p).filter(k => k !== 'id').join(', '));
  save(); emitServer(s);
};
H['server.delete'] = (c, p) => { const s = getServer(c, p.id); need(s.owner === c.uid, 'Удалить сервер может только владелец'); destroyServer(s); };
H['server.leave'] = (c, p) => {
  const s = getServer(c, p.id); need(s.owner !== c.uid || C.size(s.members) === 1, 'Владелец не может уйти: передайте владение или удалите сервер');
  if (C.size(s.members) === 1) return destroyServer(s);
  audit(s, c.uid, 'leave'); leaveServer(s, c.uid);
};
H['server.transfer'] = (c, p) => { const s = getServer(c, p.id); need(s.owner === c.uid && s.members[p.user], 'Недоступно'); s.owner = p.user; audit(s, c.uid, 'transfer', R.uname(db.users[p.user])); save(); emitServer(s); };
H['server.join'] = (c, p) => {
  let s, role, inv;
  if (p.invite) { const t = R.resolveTarget(p.invite); need(t.invite && t.server, 'Приглашение недействительно'); s = t.server; role = t.invite.role; inv = t.invite; }
  else { s = db.servers[p.id]; need(s && s.pub, 'Сервер приватный: нужна ссылка-приглашение'); }
  if (!s.members[c.uid]) { joinServer(s, c.uid, false, role); if (inv) inv.uses = (inv.uses || 0) + 1; }
  return serverView(s, c.uid);
};
H['server.discover'] = (c, p) => {
  need(db.flags.discovery, 'Каталог отключён администратором');
  const q = str(p.q, 64).toLowerCase();
  return Object.values(db.servers).filter(s => s.pub && (!q || s.name.toLowerCase().includes(q) || (s.about || '').toLowerCase().includes(q))).sort((a, b) => C.size(b.members) - C.size(a.members)).slice(0, 50).map(s => ({ ...R.serverPreview(s), member: !!s.members[c.uid] }));
};
H['server.members'] = (c, p) => {
  const s = getServer(c, p.id); const q = str(p.q, 64).toLowerCase();
  let list = Object.entries(s.members).map(([uid, m]) => ({ u: db.users[uid], m })).filter(x => x.u && !x.u.deleted);
  if (q) list = list.filter(x => (R.uname(x.u) + ' ' + (x.u.username || '') + ' ' + (x.m.nick || '')).toLowerCase().includes(q));
  return { total: list.length, members: list.slice(0, 500).map(x => ({ user: pubUser(x.u, c.uid), roles: x.m.roles, nick: x.m.nick, at: x.m.at, muted: x.m.muted, owner: s.owner === x.u.id })), banned: sCan(s, c.uid, 'ban') ? (s.banned || []).map(u => pubUser(db.users[u], c.uid)).filter(Boolean) : undefined };
};
// каналы и категории
H['server.channel.new'] = (c, p) => {
  const s = getServer(c, p.server, 'channels'); need(s.channels.length < 200, 'Слишком много каналов');
  const kind = ['text', 'voice', 'announce', 'forum', 'rules', 'stage'].includes(p.kind) ? p.kind : 'text';
  let name = str(p.name, 60); need(name, 'Нужно название канала');
  if (kind !== 'voice' && kind !== 'stage') name = name.toLowerCase().replace(/\s+/g, '-');
  const ch = addChannel(s, name, kind, s.cats.some(x => x.id === p.cat) ? p.cat : undefined, { topic: str(p.topic, 300) || undefined, allow: Array.isArray(p.allow) ? p.allow.filter(r => s.roles.some(x => x.id === r)) : undefined });
  audit(s, c.uid, 'channel.new', '#' + name); save(); emitChannels(s);
  return chatView(ch, c.uid);
};
H['server.channel.update'] = (c, p) => {
  const ch = db.chats[p.id]; need(ch && ch.server, 'Канал не найден'); const s = getServer(c, ch.server, 'channels');
  if (p.name !== undefined) { const n = str(p.name, 60); need(n, 'Нужно название'); ch.title = ch.kind === 'voice' || ch.kind === 'stage' ? n : n.toLowerCase().replace(/\s+/g, '-'); }
  if (p.topic !== undefined) ch.topic = str(p.topic, 300) || undefined;
  if (p.slow !== undefined) ch.slow = int(p.slow, 0, 21600) || undefined;
  if (p.cat !== undefined) ch.cat = s.cats.some(x => x.id === p.cat) ? p.cat : undefined;
  if (p.allow !== undefined) ch.allow = Array.isArray(p.allow) && p.allow.length ? p.allow.filter(r => s.roles.some(x => x.id === r)) : undefined;
  if (p.pos !== undefined) { const i = s.channels.indexOf(ch.id), j = int(p.pos, 0, s.channels.length - 1); s.channels.splice(i, 1); s.channels.splice(j, 0, ch.id); s.channels.forEach((x, k) => { if (db.chats[x]) db.chats[x].pos = k; }); }
  audit(s, c.uid, 'channel.update', '#' + ch.title); save(); emitChannels(s);
  for (const u in s.members) if (!sCan(s, u, 'view', ch)) emit(u, 'chat.gone', { id: ch.id });
};
H['server.channel.del'] = (c, p) => {
  const ch = db.chats[p.id]; need(ch && ch.server, 'Канал не найден'); const s = getServer(c, ch.server, 'channels');
  s.channels = s.channels.filter(x => x !== ch.id); delete db.chats[ch.id]; delete db.msgs[ch.id]; rooms.delete(ch.id);
  for (const u in s.members) emit(u, 'chat.gone', { id: ch.id });
  audit(s, c.uid, 'channel.del', '#' + ch.title); save();
};
H['server.cat'] = (c, p) => {
  const s = getServer(c, p.server, 'channels');
  if (p.del) { s.cats = s.cats.filter(x => x.id !== p.del); for (const cid of s.channels) if (db.chats[cid] && db.chats[cid].cat === p.del) delete db.chats[cid].cat; emitChannels(s); }
  else if (p.id) { const cat = s.cats.find(x => x.id === p.id); need(cat, 'Категория не найдена'); cat.name = str(p.name, 60) || cat.name; }
  else { need(s.cats.length < 30 && str(p.name, 60), 'Нужно название'); s.cats.push({ id: id(), name: str(p.name, 60) }); }
  audit(s, c.uid, 'category', str(p.name, 60)); save(); emitServer(s);
};
// роли
const topPos = (s, uid) => s.owner === uid ? -1 : Math.min(999, ...s.members[uid].roles.map(r => s.roles.findIndex(x => x.id === r)).filter(i => i >= 0));
H['server.role'] = (c, p) => {
  const s = getServer(c, p.server, 'promote'); const isOwner = s.owner === c.uid;
  if (p.del) { need(p.del !== 'everyone', 'Эту роль удалить нельзя'); const i = s.roles.findIndex(r => r.id === p.del); need(i >= 0 && (isOwner || i > topPos(s, c.uid)), 'Нельзя удалить роль выше своей'); s.roles.splice(i, 1); for (const m of Object.values(s.members)) m.roles = m.roles.filter(r => r !== p.del); audit(s, c.uid, 'role.del'); }
  else {
    let r = p.id ? s.roles.find(x => x.id === p.id) : null;
    if (p.id) { need(r, 'Роль не найдена'); need(isOwner || s.roles.indexOf(r) > topPos(s, c.uid), 'Нельзя менять роль выше своей'); }
    else { need(s.roles.length < 50, 'Слишком много ролей'); r = { id: id(), name: 'новая роль', color: '', perms: {} }; s.roles.splice(s.roles.length - 1, 0, r); }
    if (p.name !== undefined && r.id !== 'everyone') r.name = str(p.name, 40) || r.name;
    if (p.color !== undefined) r.color = /^#[0-9a-f]{6}$/i.test(p.color) ? p.color : '';
    if (p.icon !== undefined) r.icon = str(p.icon, 8) || undefined;
    if (p.hoist !== undefined) r.hoist = !!p.hoist;
    if (p.perms) { for (const k of PERMS) if (p.perms[k] !== undefined) { if (k === 'admin' && !isOwner) continue; r.perms[k] = !!p.perms[k]; } }
    if (p.pos !== undefined && r.id !== 'everyone') { const i = s.roles.indexOf(r); const j = int(p.pos, isOwner ? 0 : topPos(s, c.uid) + 1, s.roles.length - 2); s.roles.splice(i, 1); s.roles.splice(j, 0, r); }
    audit(s, c.uid, p.id ? 'role.update' : 'role.new', r.name);
  }
  save(); emitServer(s); emitChannels(s);
};
H['server.member'] = (c, p) => {
  const s = getServer(c, p.server); const m = s.members[p.user]; need(m, 'Участник не найден');
  if (p.roles !== undefined) {
    need(sCan(s, c.uid, 'promote'), 'Недостаточно прав'); const top = topPos(s, c.uid);
    const next = (Array.isArray(p.roles) ? p.roles : []).filter(r => r !== 'everyone' && s.roles.some(x => x.id === r));
    const changed = [...next.filter(r => !m.roles.includes(r)), ...m.roles.filter(r => !next.includes(r))];
    need(changed.every(r => s.roles.findIndex(x => x.id === r) > top), 'Нельзя выдавать или снимать роли выше своей');
    m.roles = next; audit(s, c.uid, 'member.roles', R.uname(db.users[p.user]));
  }
  if (p.nick !== undefined) { need(p.user === c.uid || sCan(s, c.uid, 'kick'), 'Недостаточно прав'); m.nick = str(p.nick, 40) || undefined; }
  if (p.muted !== undefined) { need(sCan(s, c.uid, 'kick') && p.user !== s.owner, 'Недостаточно прав'); m.muted = !!p.muted || undefined; audit(s, c.uid, p.muted ? 'mute' : 'unmute', R.uname(db.users[p.user])); }
  save(); emit(p.user, 'server', serverView(s, p.user)); emitChannels(s);
};
H['server.kick'] = (c, p) => {
  const s = getServer(c, p.server, p.ban ? 'ban' : 'kick'); let n = 0;
  for (const uid of (Array.isArray(p.users) ? p.users : [p.user]).slice(0, 500)) {
    if (uid === s.owner || uid === c.uid) continue;
    if (s.members[uid] && s.owner !== c.uid && topPos(s, uid) <= topPos(s, c.uid)) continue;
    if (p.ban) { s.banned = s.banned || []; if (!s.banned.includes(uid)) s.banned.push(uid); }
    if (p.purge) for (const cid of s.channels) { const ch = db.chats[cid]; if (ch) C.deleteMessages(ch, (db.msgs[cid] || []).filter(m => m.from === uid).map(m => m.id)); }
    if (s.members[uid]) leaveServer(s, uid);
    audit(s, c.uid, p.ban ? 'ban' : 'kick', R.uname(db.users[uid]) + (p.reason ? ': ' + str(p.reason, 100) : '')); n++;
  }
  save();
  for (const m in s.members) emit(m, 'server.count', { id: s.id, count: C.size(s.members) });
  return { n };
};
H['server.unban'] = (c, p) => { const s = getServer(c, p.server, 'ban'); s.banned = (s.banned || []).filter(u => u !== p.user); audit(s, c.uid, 'unban', R.uname(db.users[p.user])); save(); };
H['server.audit'] = (c, p) => { const s = getServer(c, p.id, 'audit'); return { log: (s.audit || []).slice(-300).reverse(), users: R.usersFor(c, (s.audit || []).map(a => a.by)) }; };
// события
H['server.event'] = (c, p) => {
  const s = getServer(c, p.server); s.events = s.events || [];
  if (p.rsvp) { const e = s.events.find(x => x.id === p.rsvp); need(e, 'Событие не найдено'); e.going = e.going.includes(c.uid) ? e.going.filter(u => u !== c.uid) : [...e.going, c.uid]; }
  else if (p.del) { need(sCan(s, c.uid, 'channels'), 'Недостаточно прав'); s.events = s.events.filter(x => x.id !== p.del); }
  else { need(sCan(s, c.uid, 'channels'), 'Недостаточно прав'); const at = int(p.at, now(), now() + 366 * 864e5); need(str(p.title, 100), 'Нужно название события'); s.events.push({ id: id(), title: str(p.title, 100), about: str(p.about, 500), at, chat: s.channels.includes(p.chat) ? p.chat : undefined, by: c.uid, going: [c.uid] }); if (s.events.length > 50) s.events.shift(); audit(s, c.uid, 'event.new', str(p.title, 100)); }
  save(); emitServer(s);
};
function eventReminders() {
  const t = now();
  for (const s of Object.values(db.servers)) for (const e of s.events || []) {
    if (!e.reminded && e.at <= t) {
      e.reminded = true;
      const ch = db.chats[e.chat] && db.chats[e.chat].kind !== 'voice' && db.chats[e.chat].kind !== 'stage' ? db.chats[e.chat] : s.channels.map(x => db.chats[x]).find(x => x && (x.kind === 'announce' || x.kind === 'text'));
      if (ch) postMessage(ch, db.meta.sys, { text: `📅 Начинается событие **${e.title}**! ${e.going.map(u => db.users[u] && db.users[u].username ? '@' + db.users[u].username : '').filter(Boolean).join(' ')}` }, { quiet: true });
      for (const u of e.going) emit(u, 'toast', { text: `📅 Событие «${e.title}» на сервере «${s.name}» начинается!` });
      save();
    }
    if (e.at < t - 6 * 3600e3) { s.events = s.events.filter(x => x !== e); save(); }
  }
}
// кастомные эмодзи и бусты
H['server.emoji'] = (c, p) => {
  const s = getServer(c, p.server, 'channels'); s.emojis = s.emojis || [];
  if (p.del) s.emojis = s.emojis.filter(e => e.name !== p.del);
  else { const name = str(p.name, 24).toLowerCase().replace(/[^a-z0-9_]/g, ''); need(name.length >= 2 && isUpload(p.url), 'Нужны имя (латиница) и картинка'); need(s.emojis.length < 50 + (s.boosts || 0) * 10, 'Слоты эмодзи закончились. Бустаните сервер!'); need(!s.emojis.some(e => e.name === name), 'Такое имя уже есть'); s.emojis.push({ name, url: p.url }); }
  audit(s, c.uid, 'emoji', str(p.name || p.del, 24)); save(); emitServer(s);
};
H['server.boost'] = (c, p) => { const s = getServer(c, p.id); const u = db.users[c.uid]; R.spend(u, R.BOOST_PRICE); s.boosts = (s.boosts || 0) + 1; audit(s, c.uid, 'boost'); save(); R.selfUpdate(u); emitServer(s); const ch = s.channels.map(x => db.chats[x]).find(x => x && x.kind === 'text'); if (ch) service(ch, c.uid, 'бустанул(а) сервер! 🚀 Теперь бустов: ' + s.boosts); };
// вебхуки (Discord/Slack-совместимый приём JSON {content|text, username})
H['hook.new'] = (c, p) => { const ch = db.chats[p.chat]; need(ch && ch.server, 'Канал не найден'); const s = getServer(c, ch.server, 'channels'); const h = { id: id(), token: token(18), chat: ch.id, name: str(p.name, 40) || 'Вебхук', by: c.uid, at: now() }; db.hooks[h.id] = h; audit(s, c.uid, 'webhook.new', h.name); save(); return h; };
H['hook.list'] = (c, p) => { const s = getServer(c, p.server, 'channels'); return Object.values(db.hooks).filter(h => s.channels.includes(h.chat)); };
H['hook.del'] = (c, p) => { const h = db.hooks[p.id]; need(h, 'Вебхук не найден'); getServer(c, db.chats[h.chat].server, 'channels'); delete db.hooks[h.id]; save(); };
function runHook(hid, tok, body) {
  const h = db.hooks[hid]; need(h && h.token === tok && db.chats[h.chat], 'Unknown webhook');
  const text = str(body.content || body.text, 4000); need(text, 'Empty content');
  return postMessage(db.chats[h.chat], db.meta.sys, { text, hook: str(body.username, 40) || h.name }, { quiet: true });
}
// роли по кнопке (reaction roles)
H['server.rolemsg'] = (c, p) => {
  const ch = db.chats[p.chat]; need(ch && ch.server, 'Канал не найден'); const s = getServer(c, ch.server, 'promote');
  const roles = (Array.isArray(p.roles) ? p.roles : []).map(r => s.roles.find(x => x.id === r)).filter(r => r && r.id !== 'everyone' && !r.perms.admin).slice(0, 10);
  need(roles.length, 'Выберите хотя бы одну роль (не админскую)');
  postMessage(ch, db.meta.sys, { text: str(p.text, 500) || 'Выберите себе роль — нажмите кнопку. Повторное нажатие снимает роль.', hook: s.name, btn: roles.map(r => [{ t: (r.icon ? r.icon + ' ' : '') + r.name, d: 'rr:' + r.id }]) }, { quiet: true });
};
function roleButton(c, ch, data) {
  const s = db.servers[ch.server]; const r = s.roles.find(x => x.id === data.slice(3)); need(r && !r.perms.admin, 'Роль больше не существует');
  const m = s.members[c.uid]; const had = m.roles.includes(r.id);
  m.roles = had ? m.roles.filter(x => x !== r.id) : [...m.roles, r.id];
  save(); emit(c.uid, 'server', serverView(s, c.uid)); emitChannels(s);
  return { toast: had ? `Роль «${r.name}» снята` : `Вы получили роль «${r.name}»` };
}

// ══════════ ГОЛОС, ЗВОНКИ (сигналинг; медиа идёт P2P через WebRTC mesh) ══════════
const rooms = new Map(); // chatId -> { peers: Map(connId -> state), started, by, video, answered }
const roomView = (cid, r) => ({ chat: cid, started: r ? r.started : 0, video: r ? r.video : false, peers: r ? [...r.peers.entries()].map(([pid, s]) => ({ id: pid, ...s })) : [] });
function emitRoom(cid) {
  const ch = db.chats[cid]; if (!ch) return; const v = roomView(cid, rooms.get(cid));
  for (const u of C.membersOf(ch)) emit(u, 'rtc.room', v);
}
function leaveRoom(cid, uid, connId) {
  const r = rooms.get(cid); if (!r) return;
  let changed = false;
  for (const [pid, s] of r.peers) if (connId ? pid === connId : s.user === uid) { r.peers.delete(pid); changed = true; const cn = C.connById.get(pid); if (cn && !connId) cn.send('rtc.kicked', { chat: cid }); }
  if (!changed) return;
  const ch = db.chats[cid];
  if (!r.peers.size || (ch && ch.type === 'dm' && r.peers.size < 2 && r.answered)) {
    rooms.delete(cid);
    if (ch && (ch.type === 'dm' || ch.type === 'group')) {
      const dur = r.answered ? Math.round((now() - r.answered) / 1000) : 0;
      postMessage(ch, r.by, { type: 'call', call: { dur, video: r.video, missed: !r.answered } }, { quiet: true });
      for (const u of C.membersOf(ch)) emit(u, 'call.end', { chat: cid });
    }
  }
  emitRoom(cid);
}
function dropConn(conn) { for (const [cid, r] of rooms) if (r.peers.has(conn.id)) leaveRoom(cid, conn.uid, conn.id); }
// ICE для звонков. TURN_HOST + TURN_SECRET — свой coturn (use-auth-secret): клиенту выдаётся пароль на 12 часов,
// сам секрет наружу не уходит. ICE_SERVERS — готовый JSON, если нужен другой набор.
const iceServers = () => {
  const host = process.env.TURN_HOST, secret = process.env.TURN_SECRET;
  if (host && secret) {
    const username = String(Math.floor(Date.now() / 1000) + 12 * 3600);
    const credential = require('crypto').createHmac('sha1', secret).update(username).digest('base64');
    const port = process.env.TURN_PORT || 3478;
    return [{ urls: `stun:${host}:${port}` }, { urls: [`turn:${host}:${port}?transport=udp`, `turn:${host}:${port}?transport=tcp`], username, credential }];
  }
  try { return JSON.parse(process.env.ICE_SERVERS || ''); } catch (e) { return [{ urls: 'stun:stun.l.google.com:19302' }]; }
};
function rtcChat(c, cid) {
  const ch = R.getChat(c, cid); need(db.flags.calls, 'Звонки отключены администратором');
  need(ch.type === 'dm' || ch.type === 'group' || (ch.server && (ch.kind === 'voice' || ch.kind === 'stage')), 'Здесь нельзя созвониться');
  return ch;
}
H['rtc.join'] = (c, p) => {
  const ch = rtcChat(c, p.chat);
  for (const [cid, r] of rooms) if (r.peers.has(c.id) && cid !== ch.id) leaveRoom(cid, c.uid, c.id);
  let r = rooms.get(ch.id);
  if (!r) { r = { peers: new Map(), started: now(), by: c.uid, video: !!p.video }; rooms.set(ch.id, r); if (ch.server) r.answered = now(); }
  else if (!r.answered && c.uid !== r.by) r.answered = now();
  need(r.peers.size < 12, 'Комната переполнена: без SFU-сервера в mesh-режиме помещается до 12 участников');
  const speak = ch.kind !== 'stage' || C.can(ch, c.uid, 'voice');
  const others = [...r.peers.keys()];
  r.peers.set(c.id, { user: c.uid, muted: !speak || !!p.muted, deaf: false, cam: false, screen: false, hand: false, speak });
  emitRoom(ch.id);
  return { you: c.id, peers: others, ice: iceServers(), room: roomView(ch.id, r) };
};
H['rtc.leave'] = (c, p) => leaveRoom(str(p.chat, 60), c.uid, c.id);
H['rtc.signal'] = (c, p) => {
  const r = rooms.get(p.chat); if (!r || !r.peers.has(c.id) || !r.peers.has(p.to)) return;
  const t = C.connById.get(p.to); if (t) t.send('rtc.signal', { chat: p.chat, from: c.id, data: p.data });
};
H['rtc.state'] = (c, p) => {
  const r = rooms.get(p.chat), s = r && r.peers.get(c.id); if (!s) return;
  if (p.muted !== undefined) s.muted = !!p.muted || !s.speak || !!s.smute;
  for (const k of ['deaf', 'cam', 'screen', 'hand']) if (p[k] !== undefined) s[k] = !!p[k];
  if (!s.speak) { s.cam = false; s.screen = false; }
  emitRoom(p.chat);
};
H['rtc.mod'] = (c, p) => {
  const ch = rtcChat(c, p.chat); need(ch.server ? C.can(ch, c.uid, 'voice') : C.can(ch, c.uid, 'ban'), 'Недостаточно прав');
  const r = rooms.get(ch.id); const s = r && r.peers.get(p.peer); need(s, 'Участник уже вышел');
  const t = C.connById.get(p.peer);
  if (p.act === 'mute') { s.smute = !s.smute; s.muted = s.muted || s.smute; if (t) t.send('rtc.force', { chat: ch.id, mute: s.smute }); }
  else if (p.act === 'speak') { s.speak = !s.speak; s.hand = false; if (!s.speak) s.muted = true; if (t) t.send('rtc.force', { chat: ch.id, speak: s.speak }); }
  else if (p.act === 'kick') { r.peers.delete(p.peer); if (t) t.send('rtc.kicked', { chat: ch.id }); if (!r.peers.size) rooms.delete(ch.id); }
  else if (p.act === 'move') { const to = db.chats[p.to]; need(to && to.server === ch.server && (to.kind === 'voice' || to.kind === 'stage'), 'Некуда перемещать'); if (t) t.send('rtc.move', { from: ch.id, to: to.id }); }
  if (ch.server) audit(db.servers[ch.server], c.uid, 'voice.' + p.act, R.uname(db.users[s.user]));
  emitRoom(ch.id);
};
H['rtc.fx'] = (c, p) => {
  const r = rooms.get(p.chat); if (!r || !r.peers.has(c.id)) return;
  const d = { chat: p.chat, user: c.uid, sound: p.sound ? str(p.sound, 16) : undefined, e: p.e ? str(p.e, 8) : undefined };
  for (const pid of r.peers.keys()) { const t = C.connById.get(pid); if (t) t.send('rtc.fx', d); }
};
H['call.start'] = (c, p) => {
  const ch = rtcChat(c, p.chat); need(!ch.server, 'В голосовой канал просто заходят');
  const me = db.users[c.uid];
  if (ch.type === 'dm') {
    const o = db.users[Object.keys(ch.members).find(u => u !== c.uid)]; need(o && !o.deleted && !o.bot, 'Этому абоненту позвонить нельзя');
    need(!(o.blocked || []).includes(c.uid) && C.canSee(o, c.uid, 'calls'), 'Пользователь не принимает звонки');
  }
  const res = H['rtc.join'](c, p);
  const r = rooms.get(ch.id);
  if (r.peers.size === 1) for (const u of C.membersOf(ch)) if (u !== c.uid) emit(u, 'call.ring', { chat: ch.id, from: c.uid, video: !!p.video, user: pubUser(me, u), title: ch.title });
  return res;
};
H['call.decline'] = (c, p) => {
  const ch = R.getChat(c, p.chat); const r = rooms.get(ch.id); if (!r) return;
  emit(c.uid, 'call.end', { chat: ch.id, quiet: true });
  if (ch.type === 'dm') for (const pid of r.peers.keys()) { const t = C.connById.get(pid); if (t) t.send('call.declined', { chat: ch.id }); }
};
const roomsFor = uid => { const out = []; for (const [cid, r] of rooms) { const ch = db.chats[cid]; if (ch && C.isMember(ch, uid)) out.push(roomView(cid, r)); } return out; };

module.exports = { serverView, createServer, joinServer, leaveServer, destroyServer, addChannel, emitServer, emitChannels, runHook, roleButton, eventReminders, rooms, roomsFor, dropConn, leaveRoom, TEMPLATES };
