'use strict';
// RPC-обработчики: аккаунт, чаты, сообщения, истории, поиск, листики.
const crypto = require('crypto');
const C = require('./core');
const A = require('./auth');
const { db, save, now, id, token, fail, need, str, int, emit, st, can, isMember, membersOf, chatView, msgView, pubUser, postMessage, service, audit, isUpload, today } = C;

const H = {};
const user = c => db.users[c.uid];
const uname = u => (u ? [u.name, u.last].filter(Boolean).join(' ') : 'Кто-то');
function getChat(c, cid, { member = true } = {}) {
  const chat = db.chats[typeof cid === 'string' ? cid : ''];
  need(chat, 'Чат не найден');
  if (member) need(isMember(chat, c.uid), 'Вы не участник этого чата');
  return chat;
}
const getUser = uid => { const u = db.users[typeof uid === 'string' ? uid : '']; need(u && !u.deleted, 'Пользователь не найден'); return u; };
const selfUpdate = u => emit(u.id, 'me', C.selfUser(u));
const sys = () => db.meta.sys;

// ══════════ АККАУНТ ══════════
H['me.update'] = (c, p) => {
  const u = user(c);
  if (p.name !== undefined) { const n = str(p.name, 64); need(n, 'Имя не может быть пустым. Даже у нудистов есть имена.'); u.name = n; }
  if (p.last !== undefined) u.last = str(p.last, 64);
  if (p.bio !== undefined) u.bio = str(p.bio, 300);
  if (p.username !== undefined) {
    const n = str(p.username, 32).replace(/^@/, '');
    if (n !== (u.username || '')) {
      if (n) { need(C.USERNAME_RE.test(n), 'Username: латиница, цифры и _, 3–32 символа'); need(!C.usernameTaken(n, u.id), 'Этот username уже занят'); }
      else need(u.phone, 'Без username можно только с привязанным номером');
      if (u.username) C.byName.delete(u.username.toLowerCase());
      u.username = n || undefined; if (n) C.byName.set(n.toLowerCase(), u.id);
    }
  }
  const oldAvatars = [u.avatar, ...(u.avatars || [])];
  if (p.avatar !== undefined) {
    need(!p.avatar || isUpload(p.avatar), 'Некорректный аватар');
    if (p.avatar && /\.(mp4|webm|gif)$/.test(p.avatar)) need(C.isPremium(u), 'Анимированный аватар — привилегия «Нудист Голый Премиум»');
    u.avatar = p.avatar || undefined;
    if (p.avatar) { u.avatars = [p.avatar, ...(u.avatars || []).filter(a => a !== p.avatar)].slice(0, 12); }
  }
  if (p.delAvatar) { u.avatars = (u.avatars || []).filter(a => a !== p.delAvatar); if (u.avatar === p.delAvatar) u.avatar = u.avatars[0]; }
  if (p.avatar !== undefined || p.delAvatar) C.releaseFiles(oldAvatars);      // сотрутся только те, что выпали из списка
  if (p.color !== undefined) u.color = int(p.color, 0, 7);
  if (p.status !== undefined) u.status = p.status && (p.status.e || p.status.t) ? { e: str(p.status.e, 16), t: str(p.status.t, 80), until: p.status.until ? int(p.status.until, 0, 1e15) : undefined } : undefined;
  if (p.links !== undefined) u.links = (Array.isArray(p.links) ? p.links : []).slice(0, 5).map(l => ({ t: str(l.t, 40), u: str(l.u, 200) })).filter(l => /^https?:\/\//i.test(l.u));
  if (p.birthday !== undefined) u.birthday = /^\d{4}-\d{2}-\d{2}$/.test(p.birthday) ? p.birthday : undefined;
  if (p.city !== undefined) u.city = str(p.city, 64);
  if (p.tz !== undefined) u.tz = str(p.tz, 64);
  if (p.email !== undefined) { const e = str(p.email, 120); need(!e || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e), 'Некорректный email'); u.email = e || undefined; }
  if (p.profile !== undefined) u.profile = p.profile ? { color: /^#[0-9a-f]{6}$/i.test(p.profile.color) ? p.profile.color : undefined, wall: str(p.profile.wall, 24) || undefined, emoji: str(p.profile.emoji, 16) || undefined } : undefined;
  if (p.private !== undefined) u.private = !!p.private;
  if (p.playing !== undefined) u.playing = str(p.playing, 64) || undefined;
  save(); selfUpdate(u); C.broadcastUser(u);
  return C.selfUser(u);
};
H['me.privacy'] = (c, p) => {
  const u = user(c); u.privacy = u.privacy || {};
  for (const k of Object.keys(C.DEFAULT_PRIVACY)) if (['all', 'contacts', 'none'].includes(p[k])) u.privacy[k] = p[k];
  save(); selfUpdate(u); C.broadcastUser(u);
};
H['me.settings'] = (c, p) => {
  const s = JSON.stringify(p.settings || {}); need(s.length < 100000, 'Слишком большие настройки');
  user(c).settings = JSON.parse(s); save();
  for (const o of C.conns.get(c.uid) || []) if (o !== c) o.send('settings', user(c).settings);
};
H['me.password'] = (c, p) => {
  const u = user(c);
  if (u.pass) need(A.checkPass(p.old, u.pass), 'Старый пароль неверный');
  need(typeof p.new === 'string' && p.new.length >= 6 && p.new.length <= 200, 'Пароль — минимум 6 символов');
  u.pass = A.hashPass(p.new); save(); selfUpdate(u);
};
H['me.totp.setup'] = c => {
  const u = user(c); need(!u.totpOn, 'Двухфакторная защита уже включена');
  u.totp = A.b32enc(crypto.randomBytes(20)); save();
  const label = encodeURIComponent('Нудист:' + (u.username || u.phone || u.id));
  return { secret: u.totp, uri: `otpauth://totp/${label}?secret=${u.totp}&issuer=${encodeURIComponent('Нудист')}` };
};
H['me.totp.enable'] = (c, p) => {
  const u = user(c); need(u.totp && !u.totpOn, 'Сначала начните настройку');
  need(A.totpOk(u.totp, p.code), 'Код не подошёл. Проверьте время на устройстве.');
  u.totpOn = true; u.recovery = A.newRecovery(); save(); selfUpdate(u);
  return { recovery: u.recovery };
};
H['me.totp.disable'] = (c, p) => {
  const u = user(c); need(u.totpOn, 'Двухфакторная защита не включена');
  need(A.totpOk(u.totp, p.code) || A.useRecovery(u, p.code), 'Неверный код');
  u.totpOn = false; delete u.totp; save(); selfUpdate(u);
};
H['me.recovery.new'] = (c, p) => {
  const u = user(c);
  if (u.totpOn) need(A.totpOk(u.totp, p.code), 'Нужен код из аутентификатора');
  else need(u.pass && A.checkPass(p.password, u.pass), 'Нужен текущий пароль');
  u.recovery = A.newRecovery(); save(); selfUpdate(u);
  return { recovery: u.recovery };
};
H['me.sessions'] = c => Object.entries(db.sessions).filter(([, s]) => s.user === c.uid).map(([t, s]) => ({ id: s.id, ua: s.ua, ip: s.ip, at: s.at, seen: s.seen, current: t === c.token, online: [...(C.conns.get(c.uid) || [])].some(o => o.token === t) })).sort((a, b) => b.seen - a.seen);
H['me.session.kill'] = (c, p) => {
  for (const [t, s] of Object.entries(db.sessions)) if (s.user === c.uid && (p.all ? t !== c.token : s.id === p.id)) A.killSession(t);
};
H['me.logout'] = c => { A.killSession(c.token); };
H['me.delete'] = (c, p) => {
  const u = user(c);
  if (u.pass) need(A.checkPass(p.password, u.pass), 'Неверный пароль');
  else need(p.confirm === 'УДАЛИТЬ', 'Введите слово УДАЛИТЬ для подтверждения');
  A.deleteUser(u);
};
// Согласие с политикой конфиденциальности. Пока человек не принял действующую редакцию, приложение не пускает его дальше окна с текстом.
H['me.policy'] = (c, p) => { const u = user(c); need(p.v === C.POLICY, 'Политика обновилась. Обновите страницу и прочитайте новую редакцию.'); u.policy = { v: C.POLICY, ts: now() }; save(); selfUpdate(u); return { v: C.POLICY }; };
H['me.autodelete'] = (c, p) => { user(c).autodelete = int(p.months, 1, 24, 6); save(); selfUpdate(user(c)); };
H['me.contact'] = (c, p) => {
  const u = user(c), o = getUser(p.id); need(o.id !== u.id, 'Вы и так всегда с собой');
  u.contacts = (u.contacts || []).filter(x => x !== o.id); if (p.on !== false) u.contacts.push(o.id);
  save(); selfUpdate(u); emit(o.id, 'user', pubUser(u, o.id));
};
H['me.block'] = (c, p) => {
  const u = user(c), o = getUser(p.id); need(o.id !== u.id, 'Себя заблокировать нельзя');
  u.blocked = (u.blocked || []).filter(x => x !== o.id); if (p.on !== false) u.blocked.push(o.id);
  save(); selfUpdate(u);
};
H['me.pubkey'] = (c, p) => {
  need(p.jwk && p.jwk.kty === 'EC' && p.jwk.crv === 'P-256' && !p.jwk.d && JSON.stringify(p.jwk).length < 600, 'Некорректный ключ');
  const u = user(c); u.pubKey = { kty: 'EC', crv: 'P-256', x: str(p.jwk.x, 64), y: str(p.jwk.y, 64) }; save(); C.broadcastUser(u);
};
H['me.export'] = c => {
  const u = user(c); const chats = C.userChats(u);
  return { profile: C.selfUser(u), settings: u.settings, sessions: H['me.sessions'](c), chats: chats.map(ch => ({ id: ch.id, type: ch.type, title: ch.title, myMessages: (db.msgs[ch.id] || []).filter(m => m.from === u.id).map(m => ({ id: m.id, ts: m.ts, type: m.type, text: m.text, media: m.media })) })), stories: Object.values(db.stories).filter(s => s.user === u.id), exportedAt: new Date().toISOString() };
};
H['me.phone.start'] = (c, p) => {
  const r = A.api['phone/start'](p, { ip: c.ip });
  need(!r.exists, 'Этот номер уже привязан к другому аккаунту');
  return r;
};
H['me.phone.verify'] = (c, p) => {
  const phone = A.normPhone(p.phone), pc = A.phoneCodes.get(phone);
  need(pc && pc.exp > now() && pc.code === String(p.code || '').trim(), 'Неверный или устаревший код');
  need(!A.findByPhone(phone), 'Номер уже занят');
  A.phoneCodes.delete(phone);
  const u = user(c); u.phone = phone; save(); selfUpdate(u); C.broadcastUser(u);
};
H['qr.approve'] = (c, p) => { A.approveQr(user(c), str(p.id, 64)); };

// ══════════ ПОЛЬЗОВАТЕЛИ ══════════
H['user.get'] = (c, p) => {
  const o = p.username ? db.users[C.byName.get(str(p.username, 33).replace(/^@/, '').toLowerCase())] : db.users[p.id];
  need(o, 'Пользователь не найден');
  const me = user(c);
  const common = (me.chats || []).map(x => db.chats[x]).filter(ch => ch && ch.type === 'group' && ch.members[o.id]).map(ch => ({ id: ch.id, title: ch.title })).slice(0, 20);
  let gifts = 0; for (const k in db.gifts || {}) { const g = db.gifts[k]; if (g.to === o.id && (!g.hidden || o.id === c.uid)) gifts++; }      // для вкладки «Подарки» в профиле
  return { user: pubUser(o, c.uid), common, gifts, dm: db.chats[C.dmId(c.uid, o.id)] ? C.dmId(c.uid, o.id) : null };
};
H['users.get'] = (c, p) => (Array.isArray(p.ids) ? p.ids : []).slice(0, 200).map(x => pubUser(db.users[x], c.uid)).filter(Boolean);

// ══════════ ЧАТЫ ══════════
function ensureSaved(u) {
  let ch = (u.chats || []).map(x => db.chats[x]).find(x => x && x.type === 'saved');
  if (!ch) { ch = C.newChat('saved', { title: 'Избранное' }); C.addToChat(ch, u.id, 'owner'); save(); }
  return ch;
}
H['dm.open'] = (c, p) => {
  const o = getUser(p.user);
  if (o.id === c.uid) return chatView(ensureSaved(user(c)), c.uid);
  const existed = !!db.chats[C.dmId(c.uid, o.id)];
  const ch = C.openDm(c.uid, o.id);
  st(ch, c.uid).hide = false;
  if (!existed) { st(ch, o.id).hide = true; save(); } // у собеседника чат появится с первым сообщением
  return { chat: chatView(ch, c.uid), user: pubUser(o, c.uid) };
};
H['secret.open'] = (c, p) => {
  const me = user(c), o = getUser(p.user);
  need(o.id !== me.id && !o.bot, 'Секретный чат с ботом или с собой невозможен');
  need(me.pubKey, 'На этом устройстве ещё не создан ключ шифрования');
  need(o.pubKey, 'Собеседник ещё не заходил с устройства, поддерживающего секретные чаты');
  need(!(o.blocked || []).includes(me.id), 'Пользователь ограничил круг общения');
  const ch = C.newChat('secret', { keys: { [me.id]: me.pubKey, [o.id]: o.pubKey }, by: me.id });
  C.addToChat(ch, me.id); C.addToChat(ch, o.id);
  service(ch, me.id, 'создан секретный чат. Сообщения шифруются на устройствах — серверу достаётся только абракадабра.');
  return chatView(ch, c.uid);
};
function setChatUsername(ch, n) {
  n = str(n, 32).replace(/^@/, '');
  if (n === (ch.username || '')) return;
  if (n) { need(C.USERNAME_RE.test(n), 'Ссылка: латиница, цифры и _, 3–32 символа'); need(!C.usernameTaken(n, ch.id), 'Эта ссылка уже занята'); }
  if (ch.username) C.chatNames.delete(ch.username.toLowerCase());
  ch.username = n || undefined; if (n) C.chatNames.set(n.toLowerCase(), ch.id);
}
H['chat.create'] = (c, p) => {
  const type = p.type === 'channel' ? 'channel' : 'group';
  const title = str(p.title, 100); need(title, 'Нужно название');
  const ch = C.newChat(type, { title, about: str(p.about, 500), avatar: isUpload(p.avatar) ? p.avatar : undefined, pub: !!p.pub, perms: type === 'group' ? { send: true, invite: true, pin: false, info: false } : undefined, color: Math.floor(Math.random() * 8) });
  if (p.username) setChatUsername(ch, p.username);
  C.addToChat(ch, c.uid, 'owner');
  for (const uid of (Array.isArray(p.members) ? p.members : []).slice(0, 200)) {
    const o = db.users[uid]; if (!o || o.deleted || ch.members[uid]) continue;
    if (!C.canSee(o, c.uid, 'invites') || (o.blocked || []).includes(c.uid)) continue;
    C.addToChat(ch, uid);
  }
  service(ch, c.uid, type === 'channel' ? 'канал создан' : 'создал(а) группу «' + title + '»');
  C.emitChat(ch);
  return chatView(ch, c.uid);
};
H['chat.update'] = (c, p) => {
  const ch = getChat(c, p.id);
  if (p.ttl !== undefined && (ch.type === 'dm' || ch.type === 'secret' || can(ch, c.uid, 'info'))) {
    ch.ttl = int(p.ttl, 0, 604800) || undefined;
    service(ch, c.uid, ch.ttl ? 'включил(а) автоудаление сообщений: ' + ttlText(ch.ttl) : 'отключил(а) автоудаление сообщений');
  }
  if (ch.type === 'group' || ch.type === 'channel') {
    need(can(ch, c.uid, 'info') || p.ttl !== undefined, 'Недостаточно прав');
    if (can(ch, c.uid, 'info')) {
      const before = { title: ch.title, pub: ch.pub, slow: ch.slow };
      if (p.title !== undefined) { const t = str(p.title, 100); need(t, 'Нужно название'); if (t !== ch.title) { ch.title = t; service(ch, c.uid, 'изменил(а) название на «' + t + '»'); } }
      if (p.about !== undefined) ch.about = str(p.about, 500);
      if (p.rules !== undefined) ch.rules = str(p.rules, 2000);
      if (p.avatar !== undefined) { need(!p.avatar || isUpload(p.avatar), 'Некорректный аватар'); C.releaseFiles(ch.avatar); ch.avatar = p.avatar || undefined; }
      if (p.pub !== undefined) ch.pub = !!p.pub;
      if (p.username !== undefined) setChatUsername(ch, p.username);
      if (p.slow !== undefined) ch.slow = int(p.slow, 0, 86400) || undefined;
      if (p.perms !== undefined && ch.type === 'group') ch.perms = { send: p.perms.send !== false, invite: !!p.perms.invite, pin: !!p.perms.pin, info: !!p.perms.info };
      if (p.sign !== undefined) ch.sign = !!p.sign;
      if (p.approval !== undefined) ch.approval = !!p.approval;
      if (p.captcha !== undefined) ch.captcha = !!p.captcha;
      if (p.price !== undefined && ch.type === 'channel') ch.price = int(p.price, 0, 100000) || undefined;
      if (p.automod !== undefined) ch.automod = { words: (Array.isArray(p.automod.words) ? p.automod.words : []).map(w => str(w, 40).toLowerCase()).filter(Boolean).slice(0, 200), flood: !!p.automod.flood, links: !!p.automod.links };
      if (p.rss !== undefined && ch.type === 'channel') ch.rss = (Array.isArray(p.rss) ? p.rss : []).slice(0, 5).map(r => ({ url: str(r.url || r, 300), seen: r.seen })).filter(r => /^https?:\/\//.test(r.url));
      audit(ch, c.uid, 'update', Object.keys(p).filter(k => k !== 'id').join(', ') + (before.title !== ch.title ? ` («${before.title}» → «${ch.title}»)` : ''));
    }
  }
  save(); C.emitChat(ch);
  return chatView(ch, c.uid);
};
const ttlText = s => s < 60 ? s + ' сек' : s < 3600 ? Math.round(s / 60) + ' мин' : s < 86400 ? Math.round(s / 3600) + ' ч' : Math.round(s / 86400) + ' дн';

function resolveTarget(q) {
  q = str(q, 300);
  const inv = q.match(/(?:join=|\+)([\w-]{6,})$/); if (inv && db.invites[inv[1]]) q = inv[1];
  if (db.invites[q]) { const i = db.invites[q]; if ((i.exp && i.exp < now()) || (i.max && i.uses >= i.max)) fail('Приглашение истекло. Вечеринка закончилась.'); return { invite: i, chat: db.chats[i.chat], server: db.servers[i.server] }; }
  const n = q.replace(/^.*[@/]/, '').toLowerCase();
  if (C.chatNames.has(n)) return { chat: db.chats[C.chatNames.get(n)] };
  if (C.byName.has(n)) return { user: db.users[C.byName.get(n)] };
  return {};
}
const chatPreview = ch => ({ id: ch.id, type: ch.type, title: ch.title, about: ch.about, avatar: ch.avatar, username: ch.username, count: C.size(ch.members), approval: ch.approval, price: ch.price, verified: ch.verified, color: ch.color });
const serverPreview = s => ({ id: s.id, name: s.name, icon: s.icon, banner: s.banner, about: s.about, count: C.size(s.members), verified: s.verified, boosts: s.boosts || 0, online: Object.keys(s.members).filter(C.isOnline).length });
H['resolve'] = (c, p) => {
  const t = resolveTarget(p.q);
  if (t.user) return { user: pubUser(t.user, c.uid) };
  if (t.chat) return { chat: chatPreview(t.chat), member: !!t.chat.members[c.uid], invite: t.invite && t.invite.code };
  if (t.server) return { server: serverPreview(t.server), member: !!t.server.members[c.uid], invite: t.invite && t.invite.code };
  fail('Ничего не нашлось. Возможно, оно стесняется.');
};
function startCaptcha(ch, uid) {
  const icons = ['🌵', '🍃', '🧦', '🩳', '🧤'].sort(() => Math.random() - 0.5).slice(0, 4);
  if (!icons.includes('🍃')) icons[Math.floor(Math.random() * 4)] = '🍃';
  const u = db.users[uid];
  const m = postMessage(ch, sys(), { text: `${u.username ? '@' + u.username : uname(u)}, докажите, что вы не бот: нажмите на фиговый листок. На раздумья 3 минуты.`, btn: [icons.map(e => ({ t: e, d: 'cap:' + uid + ':' + e }))] }, { quiet: true });
  ch.caps = ch.caps || {}; ch.caps[uid] = { m: m.id, exp: now() + 180e3 };
}
function joinChat(ch, uid, via) {
  need(!(ch.banned || []).includes(uid), 'Вы забанены в этом чате. Листок вам в помощь.');
  need(!ch.members[uid], 'Вы уже участник');
  const u = db.users[uid];
  if (ch.price && via !== 'admin') {
    need((u.stars || 0) >= ch.price, `Подписка стоит ${ch.price} 🍃 в месяц. У вас ${u.stars || 0}.`);
    u.stars -= ch.price; const owner = db.users[Object.keys(ch.members).find(x => ch.members[x].role === 'owner')];
    if (owner) { owner.stars = (owner.stars || 0) + ch.price; selfUpdate(owner); }
    selfUpdate(u);
  }
  C.addToChat(ch, uid, 'member', ch.price ? { paidUntil: now() + 30 * 864e5 } : undefined);
  if (ch.type === 'group') {
    service(ch, uid, via === 'admin' ? 'добавлен(а) в группу' : 'вступил(а) в группу');
    if (ch.captcha && via !== 'admin' && !u.bot) { ch.members[uid].pending = true; startCaptcha(ch, uid); }
  }
  audit(ch, uid, 'join', via || '');
  C.emitChat(ch, [uid]);
  save();
}
H['chat.join'] = (c, p) => {
  let ch, inv;
  if (p.invite) { const t = resolveTarget(p.invite); need(t.invite && t.chat, 'Приглашение недействительно'); ch = t.chat; inv = t.invite; }
  else { ch = getChat(c, p.id, { member: false }); need(ch.pub && (ch.type === 'group' || ch.type === 'channel'), 'Это приватный чат. Нужна ссылка-приглашение.'); }
  if (ch.members[c.uid]) return chatView(ch, c.uid);
  if (ch.approval && !(inv && inv.noApproval)) {
    need(!(ch.banned || []).includes(c.uid), 'Вы забанены в этом чате');
    ch.reqs = ch.reqs || []; if (!ch.reqs.includes(c.uid)) ch.reqs.push(c.uid);
    save(); C.emitChat(ch, Object.keys(ch.members).filter(u => can(ch, u, 'info')));
    return { requested: true };
  }
  joinChat(ch, c.uid, inv ? 'invite' : 'link');
  if (inv) { inv.uses = (inv.uses || 0) + 1; save(); }
  return chatView(ch, c.uid);
};
H['chat.requests'] = (c, p) => { const ch = getChat(c, p.id); need(can(ch, c.uid, 'invite') || can(ch, c.uid, 'info'), 'Недостаточно прав'); return (ch.reqs || []).map(u => pubUser(db.users[u], c.uid)).filter(Boolean); };
H['chat.request'] = (c, p) => {
  const ch = getChat(c, p.id); need(can(ch, c.uid, 'invite') || can(ch, c.uid, 'info'), 'Недостаточно прав');
  need((ch.reqs || []).includes(p.user), 'Заявка не найдена');
  ch.reqs = ch.reqs.filter(u => u !== p.user);
  if (p.ok && db.users[p.user] && !db.users[p.user].deleted) joinChat(ch, p.user, 'admin');
  audit(ch, c.uid, p.ok ? 'approve' : 'decline', p.user);
  save(); C.emitChat(ch, [c.uid]);
};
H['chat.leave'] = (c, p) => {
  const ch = getChat(c, p.id); need(ch.type === 'group' || ch.type === 'channel', 'Этот чат нельзя покинуть');
  const role = ch.members[c.uid].role;
  if (ch.type === 'group') service(ch, c.uid, 'покинул(а) группу');
  C.removeFromChat(ch, c.uid);
  if (!C.size(ch.members)) return C.destroyChat(ch);
  if (role === 'owner') { const next = Object.keys(ch.members).find(u => ch.members[u].role === 'admin') || Object.keys(ch.members)[0]; ch.members[next].role = 'owner'; C.emitChat(ch, [next]); }
  audit(ch, c.uid, 'leave'); save();
};
H['chat.members'] = (c, p) => {
  const ch = getChat(c, p.id); need(!ch.server, 'Используйте список участников сервера');
  need(ch.type !== 'channel' || can(ch, c.uid, 'info'), 'Список подписчиков виден только администраторам');
  const q = str(p.q, 64).toLowerCase(); const order = { owner: 0, admin: 1, mod: 2, member: 3 };
  let list = Object.entries(ch.members).map(([uid, m]) => ({ u: db.users[uid], m })).filter(x => x.u && !x.u.deleted);
  if (q) list = list.filter(x => (uname(x.u) + ' ' + (x.u.username || '')).toLowerCase().includes(q));
  if (p.filter === 'admins') list = list.filter(x => x.m.role !== 'member');
  if (p.filter === 'bots') list = list.filter(x => x.u.bot);
  if (p.filter === 'online') list = list.filter(x => C.isOnline(x.u.id));
  list.sort((a, b) => order[a.m.role] - order[b.m.role] || (C.isOnline(b.u.id) - C.isOnline(a.u.id)) || uname(a.u).localeCompare(uname(b.u)));
  const off = int(p.offset, 0, 1e6);
  return { total: list.length, members: list.slice(off, off + 200).map(x => ({ user: pubUser(x.u, c.uid), role: x.m.role, rights: x.m.rights, title: x.m.title, at: x.m.at, pending: x.m.pending, muted: C.chatMuted(ch, x.u.id) || undefined })), banned: can(ch, c.uid, 'ban') ? (ch.banned || []).map(u => pubUser(db.users[u], c.uid)).filter(Boolean) : undefined };
};
H['chat.add'] = (c, p) => {
  const ch = getChat(c, p.id); need(ch.type === 'group' || ch.type === 'channel', 'Сюда нельзя добавлять участников');
  need(can(ch, c.uid, 'invite'), 'Недостаточно прав, чтобы приглашать');
  const skipped = [];
  for (const uid of (Array.isArray(p.users) ? p.users : []).slice(0, 100)) {
    const o = db.users[uid]; if (!o || o.deleted || ch.members[uid]) continue;
    if ((!o.bot && !C.canSee(o, c.uid, 'invites')) || (o.blocked || []).includes(c.uid) || (ch.banned || []).includes(uid)) { skipped.push(uname(o)); continue; }
    joinChat(ch, uid, 'admin');
  }
  C.emitChat(ch);
  return { skipped };
};
H['chat.role'] = (c, p) => {
  const ch = getChat(c, p.id); need(ch.type === 'group' || ch.type === 'channel', 'Недоступно');
  need(can(ch, c.uid, 'promote'), 'Назначать роли может только владелец или админ с этим правом');
  const m = ch.members[p.user]; need(m, 'Участник не найден'); need(m.role !== 'owner', 'Владельца нельзя разжаловать');
  if (p.role === 'owner') {
    need(ch.members[c.uid].role === 'owner', 'Передать владение может только владелец');
    ch.members[c.uid].role = 'admin'; m.role = 'owner'; delete m.rights;
  } else {
    need(['admin', 'mod', 'member'].includes(p.role), 'Неизвестная роль');
    m.role = p.role;
    if (p.rights && p.role !== 'member') { m.rights = {}; for (const k of ['send', 'pin', 'info', 'invite', 'ban', 'del', 'promote', 'audit', 'mention', 'voice']) if (p.rights[k] !== undefined) m.rights[k] = p.rights[k] ? 1 : 0; } else delete m.rights;
    if (p.title !== undefined) m.title = str(p.title, 24) || undefined;
  }
  audit(ch, c.uid, 'role', `${uname(db.users[p.user])} → ${p.role}`);
  save(); C.emitChat(ch, [c.uid, p.user]);
};
H['chat.kick'] = (c, p) => {
  const ch = getChat(c, p.id); need(ch.type === 'group' || ch.type === 'channel', 'Недоступно');
  need(can(ch, c.uid, 'ban'), 'Недостаточно прав');
  const rank = { owner: 3, admin: 2, mod: 1, member: 0 }; let n = 0;
  for (const uid of (Array.isArray(p.users) ? p.users : [p.user]).slice(0, 500)) {
    const m = ch.members[uid];
    if (m) { if (uid === c.uid || rank[m.role] >= rank[ch.members[c.uid].role]) continue; }
    if (p.ban) { ch.banned = ch.banned || []; if (!ch.banned.includes(uid)) ch.banned.push(uid); }
    if (p.purge) C.deleteMessages(ch, (db.msgs[ch.id] || []).filter(x => x.from === uid).map(x => x.id));
    if (m) { if (ch.type === 'group') service(ch, uid, p.ban ? 'забанен(а). Листок изъят.' : 'исключён(а) из группы'); C.removeFromChat(ch, uid); }
    audit(ch, c.uid, p.ban ? 'ban' : 'kick', uname(db.users[uid]));
    n++;
  }
  save(); C.emitChat(ch);
  return { n };
};
// Запретить участнику писать: hours — на сколько часов, -1 — пока не вернут, 0 — снять запрет.
H['chat.mute'] = (c, p) => {
  const ch = getChat(c, p.id); need(ch.type === 'group' || ch.type === 'channel', 'Недоступно');
  need(can(ch, c.uid, 'ban'), 'Недостаточно прав');
  const o = getUser(p.user), m = ch.members[o.id], rank = { owner: 3, admin: 2, mod: 1, member: 0 }; need(o.id !== c.uid, 'Себе рот не заклеивают');
  need(!m || rank[m.role] < rank[ch.members[c.uid].role], 'Нельзя запретить писать тому, кто равен вам по роли или выше');
  const h = Number(p.hours) || 0, was = C.chatMuted(ch, o.id); ch.mutes = ch.mutes || {};
  if (h) ch.mutes[o.id] = now() + (h < 0 ? 100 * 365 * 864e5 : Math.min(h, 8760) * 3600e3); else delete ch.mutes[o.id];
  for (const k in ch.mutes) if (!(ch.mutes[k] > now())) delete ch.mutes[k];
  const how = h < 0 ? 'бессрочно' : h >= 24 ? `на ${Math.round(h / 24)} дн.` : `на ${h} ч`;
  audit(ch, c.uid, h ? 'mute' : 'unmute', uname(o) + (h ? ' ' + how : ''));
  if (m && ch.type === 'group' && (h || was)) service(ch, o.id, h ? `получил(а) мут ${how}` : 'получил(а) право голоса обратно');
  save(); C.emitChat(ch, [c.uid, o.id]);
  return { muted: C.chatMuted(ch, o.id) };
};
H['chat.unban'] = (c, p) => { const ch = getChat(c, p.id); need(can(ch, c.uid, 'ban'), 'Недостаточно прав'); ch.banned = (ch.banned || []).filter(u => u !== p.user); audit(ch, c.uid, 'unban', uname(db.users[p.user])); save(); };
H['invite.new'] = (c, p) => {
  let target;
  if (p.server) { const s = db.servers[p.server]; need(s && C.sCan(s, c.uid, 'invite'), 'Недостаточно прав'); target = { server: s.id }; if (p.role && s.roles.some(r => r.id === p.role && !r.perms.admin) && C.sCan(s, c.uid, 'promote')) target.role = p.role; audit(s, c.uid, 'invite.new'); }
  else { const ch = getChat(c, p.chat); need((ch.type === 'group' || ch.type === 'channel') && can(ch, c.uid, 'invite'), 'Недостаточно прав'); target = { chat: ch.id }; audit(ch, c.uid, 'invite.new'); }
  const code = token(8);
  db.invites[code] = { code, ...target, by: c.uid, at: now(), exp: p.ttl ? now() + int(p.ttl, 60, 31536000) * 1000 : undefined, max: int(p.max, 0, 100000) || undefined, uses: 0, name: str(p.name, 40) || undefined };
  save();
  return db.invites[code];
};
H['invite.list'] = (c, p) => {
  if (p.server) { const s = db.servers[p.server]; need(s && C.sCan(s, c.uid, 'invite'), 'Недостаточно прав'); return Object.values(db.invites).filter(i => i.server === s.id); }
  const ch = getChat(c, p.chat); need(can(ch, c.uid, 'invite'), 'Недостаточно прав');
  return Object.values(db.invites).filter(i => i.chat === ch.id);
};
H['invite.del'] = (c, p) => {
  const i = db.invites[p.code]; need(i, 'Приглашение не найдено');
  if (i.server) need(C.sCan(db.servers[i.server], c.uid, 'invite'), 'Недостаточно прав'); else need(can(db.chats[i.chat], c.uid, 'invite'), 'Недостаточно прав');
  delete db.invites[p.code]; save();
};
H['chat.state'] = (c, p) => {
  const ch = getChat(c, p.id), s = st(ch, c.uid);
  if (p.mute !== undefined) s.mute = int(p.mute, 0, 1e16) || undefined;
  if (p.archived !== undefined) s.archived = !!p.archived || undefined;
  if (p.pin !== undefined) s.pin = p.pin ? now() : undefined;
  if (p.draft !== undefined) s.draft = str(p.draft, 4096) || undefined;
  if (p.notif !== undefined) s.notif = p.notif ? { sound: str(p.notif.sound, 16), preview: p.notif.preview !== false } : undefined;
  save();
  for (const o of C.conns.get(c.uid) || []) if (o !== c || p.draft === undefined) o.send('chat', chatView(ch, c.uid));
};
H['chat.read'] = (c, p) => {
  const ch = getChat(c, p.id), s = st(ch, c.uid);
  const seq = int(p.seq, 0, ch.seq || 0);
  if (seq <= s.read && !s.mentions) return;
  s.read = Math.max(s.read, seq); s.mentions = 0; save();
  emit(c.uid, 'chat', chatView(ch, c.uid));
  if (ch.type === 'dm' || ch.type === 'secret' || (ch.type === 'group' && C.size(ch.members) <= 200))
    for (const u in ch.members) if (u !== c.uid) emit(u, 'read', { chat: ch.id, user: c.uid, seq: s.read });
};
H['chat.typing'] = (c, p) => {
  const ch = getChat(c, p.id); if (ch.type === 'channel') return;
  const d = { chat: ch.id, user: c.uid, kind: str(p.kind, 12) || 'text', text: p.text ? str(p.text, 300) : undefined, thread: p.thread ? str(p.thread, 24) : undefined };
  for (const u of membersOf(ch)) if (u !== c.uid) emit(u, 'typing', d);
};
H['chat.clear'] = (c, p) => {
  const ch = getChat(c, p.id);
  if (p.all) {
    need(ch.type === 'dm' || ch.type === 'secret' || ch.type === 'saved' || can(ch, c.uid, 'del') && myRoleIs(ch, c.uid, 'owner'), 'Очистить историю для всех может только владелец');
    C.deleteMessages(ch, (db.msgs[ch.id] || []).map(m => m.id));
    if (ch.type !== 'dm' && ch.type !== 'saved' && ch.type !== 'secret') audit(ch, c.uid, 'clear');
  } else { const s = st(ch, c.uid); s.cleared = ch.seq; s.read = ch.seq; emit(c.uid, 'chat.cleared', { chat: chatView(ch, c.uid) }); }
  save();
};
const myRoleIs = (ch, uid, r) => C.myRole(ch, uid) === r;
H['chat.delete'] = (c, p) => {
  const ch = getChat(c, p.id);
  if (ch.type === 'dm') {
    if (p.all) C.deleteMessages(ch, (db.msgs[ch.id] || []).map(m => m.id));
    const s = st(ch, c.uid); s.cleared = ch.seq; s.read = ch.seq; s.hide = true; s.draft = undefined;
    emit(c.uid, 'chat.gone', { id: ch.id });
    if (p.all) { const o = Object.keys(ch.members).find(u => u !== c.uid); if (o) { st(ch, o).hide = true; emit(o, 'chat.gone', { id: ch.id }); } }
  } else if (ch.type === 'secret') C.destroyChat(ch);
  else if (ch.type === 'group' || ch.type === 'channel') { need(myRoleIs(ch, c.uid, 'owner'), 'Удалить может только владелец'); C.destroyChat(ch); }
  else fail('Этот чат нельзя удалить');
  save();
};
H['chat.audit'] = (c, p) => { const ch = getChat(c, p.id); need(can(ch, c.uid, 'audit'), 'Журнал доступен админам'); return { log: (ch.audit || []).slice(-200).reverse(), users: usersFor(c, (ch.audit || []).map(a => a.by)) }; };
H['chat.stats'] = (c, p) => {
  const ch = getChat(c, p.id); need(can(ch, c.uid, 'info'), 'Статистика доступна админам');
  const arr = (db.msgs[ch.id] || []).filter(m => !m.thread && m.type !== 'service'); const last = arr.slice(-30);
  const views = last.reduce((a, m) => a + (m.views || []).length, 0), rx = last.reduce((a, m) => a + Object.values(m.rx || {}).reduce((x, y) => x + y.length, 0) + (m.tcount || 0), 0);
  const days = []; for (let i = 13; i >= 0; i--) { const d = today(now() - i * 864e5); days.push({ d, joins: (ch.joins || {})[d] || 0, posts: arr.filter(m => today(m.ts) === d).length }); }
  return { members: C.size(ch.members), posts: arr.length, avgViews: last.length ? Math.round(views / last.length) : 0, er: views ? Math.round(rx / views * 1000) / 10 : 0, clicks: arr.reduce((a, m) => a + (m.clicks || 0), 0), days, top: [...last].sort((a, b) => (b.views || []).length - (a.views || []).length).slice(0, 5).map(m => ({ id: m.id, text: (m.text || m.type).slice(0, 80), views: (m.views || []).length, rx: Object.values(m.rx || {}).reduce((x, y) => x + y.length, 0), comments: m.tcount || 0 })) };
};
H['chat.export'] = (c, p) => {
  const ch = getChat(c, p.id), s = st(ch, c.uid);
  const msgs = (db.msgs[ch.id] || []).filter(m => m.seq > (s.cleared || 0) && !(m.hid || []).includes(c.uid)).slice(-10000);
  return { chat: { id: ch.id, type: ch.type, title: ch.title, exportedAt: new Date().toISOString() }, users: usersFor(c, msgs.map(m => m.from)), msgs: msgs.map(m => msgView(m, c.uid)) };
};
H['chat.purge'] = (c, p) => {
  const ch = getChat(c, p.id); need(ch.type !== 'dm' && ch.type !== 'secret' && can(ch, c.uid, 'del'), 'Недостаточно прав');
  const q = str(p.q, 100).toLowerCase(), since = p.hours ? now() - int(p.hours, 1, 8760) * 3600e3 : 0;
  need(p.user || q || since, 'Задайте хотя бы один фильтр');
  const ids = (db.msgs[ch.id] || []).filter(m => m.type !== 'service' && (!p.user || m.from === p.user) && (!q || (m.text || '').toLowerCase().includes(q)) && m.ts >= since).map(m => m.id);
  C.deleteMessages(ch, ids); audit(ch.server ? db.servers[ch.server] : ch, c.uid, 'purge', ids.length + ' сообщ.');
  return { n: ids.length };
};
function usersFor(c, ids) { const o = {}; for (const i of new Set(ids)) if (db.users[i]) o[i] = pubUser(db.users[i], c.uid); return o; }

// ══════════ СООБЩЕНИЯ ══════════
const flood = new Map();
const BALL = ['Бесспорно', 'Даже не думай', 'Спроси у мамы', 'Звёзды говорят «да», но звёзды врут', 'Определённо да', 'Пока не ясно, попробуй после обеда', 'Мой ответ — нет', 'Перспективы так себе', 'Да, но оденься', 'Знаки говорят — да', 'Лучше не рассказывать', 'Сосредоточься и спроси опять', 'Весьма сомнительно', 'Без сомнений', 'Шансы хорошие, как погода в июле'];
function mediaOf(p) {
  const m = p.media; need(m && isUpload(m.url), 'Файл не загружен');
  const o = { url: m.url, name: str(m.name, 200), size: int(m.size, 0, 1e11), mime: str(m.mime, 100) };
  if (m.w) { o.w = int(m.w, 1, 20000); o.h = int(m.h, 1, 20000); }
  if (m.dur) o.dur = Math.round(Math.min(86400, Math.max(0, Number(m.dur) || 0)) * 10) / 10;
  if (Array.isArray(m.wave)) o.wave = m.wave.slice(0, 64).map(x => int(x, 0, 31));
  if (m.spoiler) o.spoiler = true;
  return o;
}
function buildPayload(c, chat, p) {
  const u = user(c); const out = { type: 'text' };
  const type = str(p.type, 12) || 'text';
  if (chat.type === 'secret') {
    need(p.enc && typeof p.enc.iv === 'string' && typeof p.enc.ct === 'string' && p.enc.ct.length < 400000, 'В секретном чате сообщения должны быть зашифрованы');
    out.enc = { iv: p.enc.iv.slice(0, 64), ct: p.enc.ct };
    // Что внутри, сервер не видит. Адреса зашифрованных файлов приложение называет отдельно — только чтобы стереть их вместе с сообщением.
    const fl = Array.isArray(p.files) ? p.files.filter(isUpload).slice(0, 12) : []; if (fl.length) out.files = fl;
  } else if (['photo', 'video', 'file', 'audio', 'voice', 'round', 'gif'].includes(type)) {
    out.type = type; out.media = mediaOf(p); out.text = str(p.text, 1024);
    if (p.once) { need(type === 'photo' || type === 'video', 'Одноразовыми бывают только фото и видео'); need(chat.type === 'dm', 'Одноразовые фото и видео — только в личных чатах'); out.once = true; out.text = ''; }
  } else if (type === 'sticker') {
    const s = p.sticker || {}; out.type = 'sticker';
    out.sticker = { pack: str(s.pack, 32), id: str(s.id, 32), e: str(s.e, 16), t: str(s.t, 64), bg: str(s.bg, 32), anim: str(s.anim, 16), snd: str(s.snd, 16), url: isUpload(s.url) ? s.url : undefined };
    need(out.sticker.e || out.sticker.url, 'Пустой стикер');
  } else if (type === 'loc') {
    const l = p.loc || {}; need(Math.abs(l.lat) <= 90 && Math.abs(l.lon) <= 180, 'Некорректные координаты');
    out.type = 'loc'; out.loc = { lat: +(+l.lat).toFixed(6), lon: +(+l.lon).toFixed(6), title: str(l.title, 100) || undefined, addr: str(l.addr, 200) || undefined };
  } else if (type === 'contact') {
    out.type = 'contact';
    if (p.contact && p.contact.id) { const o = getUser(p.contact.id); out.contact = { id: o.id, name: uname(o), username: o.username, phone: C.canSee(o, c.uid, 'phone') ? o.phone : undefined }; }
    else { out.contact = { name: str((p.contact || {}).name, 100), phone: str((p.contact || {}).phone, 32) }; need(out.contact.name, 'Нужно имя контакта'); }
  } else if (type === 'poll') {
    const q = p.poll || {}; const opts = (Array.isArray(q.opts) ? q.opts : []).map(x => str(x, 100)).filter(Boolean).slice(0, 10);
    need(str(q.q, 300) && opts.length >= 2, 'Опросу нужен вопрос и минимум два варианта');
    out.type = 'poll'; out.poll = { q: str(q.q, 300), opts, multi: !!q.multi && !q.quiz, anon: q.anon !== false, quiz: !!q.quiz, votes: {} };
    if (q.quiz) { out.poll.correct = int(q.correct, 0, opts.length - 1); out.poll.explain = str(q.explain, 200) || undefined; }
    if (q.timer) out.poll.closeAt = now() + int(q.timer, 5, 604800) * 1000;
  } else {
    let text = str(p.text, 4096); need(text, 'Пустое сообщение');
    const cmd = text.match(/^\/(roll|coin|8ball|ball)(?:@\w+)?(?:\s+(.*))?$/i);
    if (cmd) {
      const k = cmd[1].toLowerCase(), arg = cmd[2] || '';
      if (k === 'roll') { const max = int(arg, 2, 1000000, 6); const v = crypto.randomInt(1, max + 1); out.dice = { k: 'roll', v, max }; text = `🎲 бросает кубик d${max}: выпало ${v}`; }
      else if (k === 'coin') { const v = crypto.randomInt(0, 2); out.dice = { k: 'coin', v }; text = `🪙 подбрасывает монетку: ${v ? 'орёл' : 'решка'}`; }
      else { out.dice = { k: 'ball' }; text = `🎱 ${arg ? '«' + arg.slice(0, 200) + '» — ' : ''}${BALL[crypto.randomInt(0, BALL.length)]}`; }
    }
    out.text = text;
  }
  if (p.reply) {
    const r = C.findMsg(chat.id, str(p.reply, 24));
    if (r) { out.reply = r.id; const ru = db.users[r.from]; out.rq = { from: r.from, name: r.hook ? r.hook : uname(ru), text: r.enc ? '🔒' : (r.text || '').slice(0, 140), type: r.type }; if (p.quote) out.quote = str(p.quote, 500); }
  }
  if (p.thread) { const r = C.findMsg(chat.id, str(p.thread, 24)); need(r && !r.thread, 'Тред не найден'); out.thread = r.id; }
  if (chat.kind === 'forum' && !out.thread) { out.title = str(p.title, 120); need(out.title, 'У поста на форуме должен быть заголовок'); if (Array.isArray(p.tags)) out.tags = p.tags.slice(0, 5).map(t => str(t, 24)).filter(Boolean); }
  if (p.silent) out.silent = true;
  if (p.fx) out.fx = str(p.fx, 16);
  if (p.ttl) out.ttl = int(p.ttl, 1, 604800);
  if (chat.type === 'channel' && !out.thread) { if (!p.personal) out.as = 'chan'; if (chat.sign || p.signed) out.sig = uname(u); }
  return out;
}
function checkSend(c, chat, p) {
  const u = user(c);
  if (chat.type !== 'saved') C.needVoice(u);
  if (chat.type === 'dm') {
    const o = db.users[Object.keys(chat.members).find(x => x !== c.uid)];
    if (o) {
      need(!o.deleted, 'Аккаунт удалён. Писать некому.');
      need(!(o.blocked || []).includes(c.uid), 'Пользователь ограничил круг общения');
      need(!(u.blocked || []).includes(o.id), 'Вы заблокировали этого пользователя');
      if (!o.bot && !C.canSee(o, c.uid, 'msgs') && !(db.msgs[chat.id] || []).some(m => m.from === o.id)) fail('Пользователь принимает сообщения только от ' + ((o.privacy || {}).msgs === 'contacts' ? 'контактов' : 'избранных'));
    }
  } else if (chat.type === 'channel' && p.thread) { need(!C.chatMuted(chat, c.uid), 'Администраторы канала запретили вам комментировать'); }      // комментарии доступны подписчикам
  else need(can(chat, c.uid, 'send'), chat.type === 'channel' ? 'Писать в канал могут только администраторы' : (chat.members && chat.members[c.uid] && chat.members[c.uid].pending ? 'Сначала пройдите проверку: нажмите на листок' : 'У вас нет права писать в этот чат'));
  const admin = chat.type !== 'dm' && chat.type !== 'secret' && chat.type !== 'saved' && can(chat, c.uid, 'del');
  const s = st(chat, c.uid);
  if (chat.slow && !admin) {
    const wait = Math.ceil(((s.sent || 0) + chat.slow * 1000 - now()) / 1000);
    if (wait > 0) fail(`Медленный режим: подождите ещё ${wait} сек. Тише едешь — дальше будешь.`);
  }
  const am = chat.automod || (chat.server && (db.servers[chat.server].automod));
  if (am && !admin) {
    const text = (p.text || '').toLowerCase();
    const bad = (am.words || []).find(w => text.includes(w));
    if (bad) { audit(chat.server ? db.servers[chat.server] : chat, c.uid, 'automod', 'стоп-слово в сообщении'); save(); fail('Автомодерация: сообщение содержит запрещённое слово и не отправлено'); }
    if (am.links && /https?:\/\/|www\./i.test(text)) fail('Автомодерация: ссылки в этом чате запрещены');
    if (am.flood) {
      const k = chat.id + ':' + c.uid, t = now(), arr = (flood.get(k) || []).filter(x => x > t - 5000);
      if (arr.length >= 5) { audit(chat.server ? db.servers[chat.server] : chat, c.uid, 'automod', 'антифлуд'); fail('Антифлуд: не так быстро, ковбой'); }
      arr.push(t); flood.set(k, arr);
    }
  }
  s.sent = now();
}
H['msg.send'] = (c, p) => {
  const chat = getChat(c, p.chat);
  checkSend(c, chat, p);
  const payload = buildPayload(c, chat, p);
  if (p.at) {
    const at = int(p.at, 0, now() + 366 * 864e5); need(at > now() + 3000, 'Время отправки должно быть в будущем');
    need(db.scheduled.filter(x => x.from === c.uid).length < 100, 'Слишком много отложенных сообщений');
    const item = { id: id(), chat: chat.id, from: c.uid, p: payload, at }; db.scheduled.push(item); save();
    return { scheduled: item };
  }
  const m = postMessage(chat, c.uid, payload);
  return { msg: msgView(m, c.uid), tmp: p.tmp };
};
// Одноразовое фото или видео: получатель открывает один раз, после этого файл стирается с сервера.
H['msg.once.open'] = (c, p) => {
  const chat = getChat(c, p.chat), m = C.findMsg(chat.id, p.id);
  need(m && m.once, 'Сообщение не найдено'); need(m.from !== c.uid, 'Своё одноразовое сообщение пересмотреть нельзя. Таковы правила стриптиза.');
  need(!m.onceAt && m.media, 'Уже просмотрено. Второго раза не будет.');
  const media = m.media; m.onceAt = now(); delete m.media;
  C.updateMsg(chat, m);
  setTimeout(() => C.dropUpload(media.url), 180e3);      // три минуты на то, чтобы файл успел загрузиться у смотрящего
  return { media, type: m.type };
};
// Приглашения: личная ссылка, счётчик и доска почёта.
let refTop = { at: 0, list: [] };
H['ref.info'] = c => {
  const u = user(c);
  if (now() - refTop.at > 60e3) {
    const all = []; for (const k in db.users) { const x = db.users[k]; if (x.invited && !x.deleted && !x.banned) all.push(x); }
    refTop = { at: now(), list: all.sort((a, b) => b.invited - a.invited).slice(0, 10).map(x => ({ id: x.id, n: x.invited })) };
  }
  return { username: u.username, invited: u.invited || 0, earned: (u.invited || 0) * A.REF_BONUS, bonus: A.REF_BONUS, by: u.ref && db.users[u.ref] ? pubUser(db.users[u.ref], c.uid) : undefined,
    top: refTop.list.map(t => ({ user: pubUser(db.users[t.id], c.uid), n: t.n })) };
};
H['msg.scheduled'] = (c, p) => db.scheduled.filter(x => x.from === c.uid && (!p.chat || x.chat === p.chat)).sort((a, b) => a.at - b.at);
H['msg.unschedule'] = (c, p) => { const i = db.scheduled.findIndex(x => x.id === p.id && x.from === c.uid); if (i >= 0) { db.scheduled.splice(i, 1); save(); } };
H['msg.history'] = (c, p) => {
  const chat = getChat(c, p.chat), s = st(chat, c.uid), limit = int(p.limit, 1, 100, 50);
  const thread = p.thread ? str(p.thread, 24) : null;
  const all = (db.msgs[chat.id] || []).filter(m => m.seq > (s.cleared || 0) && !(m.hid && m.hid.includes(c.uid)) && (thread ? m.thread === thread : !m.thread));
  let from, to;
  if (p.around || p.aroundId) { const i = Math.max(0, p.aroundId ? all.findIndex(m => m.id === p.aroundId) : all.findIndex(m => m.seq >= p.around)); from = Math.max(0, i - (limit >> 1)); to = Math.min(all.length, from + limit); }
  else if (p.after !== undefined) { from = all.findIndex(m => m.seq > p.after); if (from < 0) from = all.length; to = Math.min(all.length, from + limit); }
  else { to = p.before ? all.findIndex(m => m.seq >= p.before) : all.length; if (to < 0) to = all.length; from = Math.max(0, to - limit); }
  const msgs = all.slice(from, to);
  const ids = []; for (const m of msgs) { ids.push(m.from); if (m.fwd && m.fwd.from) ids.push(m.fwd.from); if (m.rq) ids.push(m.rq.from); }
  const root = thread ? msgView(C.findMsg(chat.id, thread), c.uid) : undefined; if (root) ids.push(root.from);
  return { msgs: msgs.map(m => msgView(m, c.uid)), users: usersFor(c, ids), more: from > 0, moreAfter: to < all.length, root };
};
H['msg.edit'] = (c, p) => {
  const chat = getChat(c, p.chat), m = C.findMsg(chat.id, p.id); need(m, 'Сообщение не найдено');
  need(m.from === c.uid && !m.fwd && m.type !== 'service' && m.type !== 'poll' && m.type !== 'sticker', 'Это сообщение нельзя редактировать');
  if (chat.type === 'secret') { need(p.enc && typeof p.enc.ct === 'string', 'Нужен шифртекст'); m.enc = { iv: String(p.enc.iv).slice(0, 64), ct: p.enc.ct.slice(0, 400000) }; }
  else {
    const text = str(p.text, 4096); need(text || m.media, 'Пустое сообщение'); if (text === m.text) return;
    m.hist = m.hist || []; m.hist.push({ ts: m.edited || m.ts, text: m.text || '' }); if (m.hist.length > 20) m.hist.shift();
    m.text = text; delete m.link;
  }
  m.edited = now(); C.updateMsg(chat, m);
  if (!chat.server && C.lastVisible(chat, c.uid) === m) C.emitChat(chat);
  hooksEdit.forEach(h => h(chat, m));
};
const hooksEdit = [];
H['msg.hist'] = (c, p) => { const chat = getChat(c, p.chat), m = C.findMsg(chat.id, p.id); need(m, 'Сообщение не найдено'); need(m.from === c.uid || can(chat, c.uid, 'del'), 'История правок видна автору и админам'); return m.hist || []; };
H['msg.del'] = (c, p) => {
  const chat = getChat(c, p.chat); const ids = (Array.isArray(p.ids) ? p.ids : []).slice(0, 200);
  const priv = chat.type === 'dm' || chat.type === 'secret' || chat.type === 'saved', mod = !priv && can(chat, c.uid, 'del');
  if (p.all) {
    const ok = ids.filter(i => { const m = C.findMsg(chat.id, i); return m && (m.from === c.uid || priv || mod); });
    need(ok.length, 'Нет прав на удаление');
    if (mod && ok.some(i => C.findMsg(chat.id, i).from !== c.uid)) audit(chat.server ? db.servers[chat.server] : chat, c.uid, 'msg.del', ok.length + ' сообщ.');
    C.deleteMessages(chat, ok);
  } else {
    for (const i of ids) { const m = C.findMsg(chat.id, i); if (m) { m.hid = m.hid || []; if (!m.hid.includes(c.uid)) m.hid.push(c.uid); } }
    save(); emit(c.uid, 'msg.del', { chat: chatView(chat, c.uid), ids });
  }
};
H['msg.react'] = (c, p) => {
  const chat = getChat(c, p.chat), m = C.findMsg(chat.id, p.id); need(m && m.type !== 'service', 'Сообщение не найдено');
  const e = str(p.e, 40); need(e, 'Пустая реакция');
  m.rx = m.rx || {};
  const had = (m.rx[e] || []).includes(c.uid);
  const max = C.isPremium(user(c)) ? 3 : 1;
  const mine = Object.keys(m.rx).filter(k => m.rx[k].includes(c.uid));
  if (had) m.rx[e] = m.rx[e].filter(u => u !== c.uid);
  else {
    need(Object.keys(m.rx).length < 20 || m.rx[e], 'Слишком много разных реакций');
    while (mine.length >= max) { const k = mine.shift(); m.rx[k] = m.rx[k].filter(u => u !== c.uid); }
    (m.rx[e] = m.rx[e] || []).push(c.uid);
  }
  for (const k of Object.keys(m.rx)) if (!m.rx[k].length) delete m.rx[k];
  if (!Object.keys(m.rx).length) delete m.rx;
  C.updateMsg(chat, m);
  if (!had && m.from !== c.uid && chat.type !== 'channel') emit(m.from, 'rx', { chat: chat.id, msg: m.id, user: c.uid, e });
};
H['msg.pin'] = (c, p) => {
  const chat = getChat(c, p.chat), m = C.findMsg(chat.id, p.id); need(m, 'Сообщение не найдено');
  need(can(chat, c.uid, 'pin'), 'Недостаточно прав, чтобы закреплять');
  chat.pinned = (chat.pinned || []).filter(x => x !== m.id);
  if (p.on !== false) { chat.pinned.push(m.id); if (chat.pinned.length > 50) chat.pinned.shift(); if (!p.quiet && chat.type !== 'channel') service(chat, c.uid, 'закрепил(а) сообщение', { reply: m.id }); }
  if (!chat.pinned.length) delete chat.pinned;
  if (chat.type !== 'dm' && chat.type !== 'secret' && chat.type !== 'saved') audit(chat.server ? db.servers[chat.server] : chat, c.uid, p.on !== false ? 'pin' : 'unpin');
  save(); C.emitChat(chat);
};
H['msg.pinned'] = (c, p) => { const chat = getChat(c, p.chat); const ms = (chat.pinned || []).map(i => C.findMsg(chat.id, i)).filter(Boolean); return { msgs: ms.map(m => msgView(m, c.uid)), users: usersFor(c, ms.map(m => m.from)) }; };
H['msg.vote'] = (c, p) => {
  const chat = getChat(c, p.chat), m = C.findMsg(chat.id, p.id); need(m && m.poll, 'Опрос не найден');
  const q = m.poll; need(!q.closed && !(q.closeAt && q.closeAt < now()), 'Опрос завершён');
  const opts = [...new Set((Array.isArray(p.opts) ? p.opts : []).map(x => int(x, 0, q.opts.length - 1)))];
  if (q.quiz) need(!q.votes[c.uid] && opts.length === 1, 'В викторине можно ответить только один раз');
  if (!opts.length) delete q.votes[c.uid]; else q.votes[c.uid] = q.multi ? opts : [opts[0]];
  C.updateMsg(chat, m);
  return msgView(m, c.uid);
};
H['msg.pollclose'] = (c, p) => { const chat = getChat(c, p.chat), m = C.findMsg(chat.id, p.id); need(m && m.poll && (m.from === c.uid || can(chat, c.uid, 'del')), 'Недостаточно прав'); m.poll.closed = true; C.updateMsg(chat, m); };
H['msg.forward'] = (c, p) => {
  const src = getChat(c, p.from); need(src.type !== 'secret', 'Из секретного чата пересылать нельзя. На то он и секретный.');
  const ids = new Set((Array.isArray(p.ids) ? p.ids : []).slice(0, 100));
  const msgs = (db.msgs[src.id] || []).filter(m => ids.has(m.id) && m.type !== 'service' && m.type !== 'call' && !m.once);
  need(msgs.length, 'Нечего пересылать');
  const out = [];
  for (const tid of (Array.isArray(p.to) ? p.to : []).slice(0, 20)) {
    const dst = getChat(c, tid); need(dst.type !== 'secret', 'В секретный чат пересылать нельзя');
    checkSend(c, dst, {});
    for (const m of msgs) {
      const pl = { type: m.type, text: m.text, media: m.media, sticker: m.sticker, loc: m.loc, contact: m.contact };
      if (m.poll) pl.poll = { ...m.poll, votes: {} };
      if (!p.hide) { const fu = m.fwd ? m.fwd : { from: m.as === 'chan' ? undefined : m.from, chat: src.type === 'channel' && src.pub ? src.id : undefined, name: m.as === 'chan' ? src.title : uname(db.users[m.from]), username: src.type === 'channel' ? src.username : undefined }; pl.fwd = fu; }
      if (dst.type === 'channel') pl.as = 'chan';
      if (dst.kind === 'forum') pl.title = (m.title || m.text || 'Пересланное').slice(0, 120);
      out.push(postMessage(dst, c.uid, pl).id);
    }
  }
  return { n: out.length };
};
H['msg.view'] = (c, p) => {
  const chat = getChat(c, p.chat); const res = {};
  for (const i of (Array.isArray(p.ids) ? p.ids : []).slice(0, 100)) { const m = C.findMsg(chat.id, i); if (!m || m.thread) continue; m.views = m.views || []; if (!m.views.includes(c.uid) && m.views.length < 1e6) m.views.push(c.uid); res[i] = m.views.length; }
  save();
  return res;
};
H['msg.click'] = (c, p) => { const chat = getChat(c, p.chat), m = C.findMsg(chat.id, p.id); if (m) { m.clicks = (m.clicks || 0) + 1; save(); } };
H['report'] = (c, p) => {
  A.limit('report:' + c.uid, 20, 3600e3);
  const r = { id: id(), by: c.uid, ts: now(), status: 'open', type: ['user', 'msg', 'chat', 'server'].includes(p.type) ? p.type : 'user', target: str(p.target, 40), chat: str(p.chat, 60) || undefined, reason: str(p.reason, 40) || 'other', text: str(p.text, 500) };
  if (r.type === 'msg') { const chat = getChat(c, r.chat); const m = C.findMsg(chat.id, r.target); need(m, 'Сообщение не найдено'); r.snap = { from: m.from, text: m.enc ? '[зашифровано]' : (m.text || '').slice(0, 500), type: m.type, media: m.media && m.media.url }; }
  db.reports.push(r); save();
  return { ok: true };
};

// ══════════ ПОИСК ══════════
const TYPE_MATCH = { photo: m => m.type === 'photo', video: m => m.type === 'video' || m.type === 'round', file: m => m.type === 'file', voice: m => m.type === 'voice', audio: m => m.type === 'audio', gif: m => m.type === 'gif', link: m => /https?:\/\//.test(m.text || ''), media: m => m.type === 'photo' || m.type === 'video' || m.type === 'gif' };
H['calls.history'] = (c) => {
  const res = [];
  for (const ch of C.userChats(user(c))) {
    if (ch.type !== 'dm' && ch.type !== 'secret') continue;
    const s = st(ch, c.uid), arr = db.msgs[ch.id] || [];
    for (let i = arr.length - 1, n = 0; i >= 0 && n < 30; i--) { const m = arr[i]; if (m.seq <= (s.cleared || 0)) break; if (m.type !== 'call' || (m.hid && m.hid.includes(c.uid))) continue; res.push(msgView(m, c.uid)); n++; }
  }
  return res.sort((a, b) => b.ts - a.ts).slice(0, 60);
};
H['msg.search'] = (c, p) => {
  const q = str(p.q, 100).toLowerCase(), limit = int(p.limit, 1, 100, 40);
  const chats = p.chat ? [getChat(c, p.chat)] : C.userChats(user(c));
  const tm = TYPE_MATCH[p.type]; const since = p.since ? +new Date(p.since) : 0, until = p.until ? +new Date(p.until) + 864e5 : Infinity;
  need(q || tm || p.from || since, 'Введите запрос');
  const res = [];
  for (const ch of chats) {
    if (ch.type === 'secret') continue;
    const s = st(ch, c.uid), arr = db.msgs[ch.id] || [];
    for (let i = arr.length - 1; i >= 0; i--) {
      const m = arr[i];
      if (m.seq <= (s.cleared || 0)) break;
      if (m.type === 'service' || (m.hid && m.hid.includes(c.uid))) continue;
      if (p.before && m.seq >= p.before) continue;
      if (tm && !tm(m)) continue;
      if (p.from && m.from !== p.from) continue;
      if (m.ts < since || m.ts > until) continue;
      if (q && !((m.text || '') + ' ' + (m.title || '') + ' ' + ((m.media || {}).name || '') + ' ' + ((m.poll || {}).q || '')).toLowerCase().includes(q)) continue;
      res.push(m); if (res.length >= limit * (p.chat ? 1 : 3)) break;
    }
  }
  res.sort((a, b) => b.ts - a.ts);
  const out = res.slice(0, limit);
  return { msgs: out.map(m => msgView(m, c.uid)), users: usersFor(c, out.map(m => m.from)) };
};
H['search'] = (c, p) => {
  const q = str(p.q, 64).toLowerCase().replace(/^@/, ''); need(q.length >= 1, 'Введите запрос');
  const me = user(c);
  const users = Object.values(db.users).filter(u => !u.deleted && u.id !== me.id && !u.banned && (((u.username || '').toLowerCase().startsWith(q)) || (!u.private && uname(u).toLowerCase().includes(q)) || (me.contacts || []).includes(u.id) && uname(u).toLowerCase().includes(q))).slice(0, 20).map(u => pubUser(u, c.uid));
  const chats = db.flags.discovery ? Object.values(db.chats).filter(ch => ch.pub && (ch.type === 'group' || ch.type === 'channel') && !ch.members[c.uid] && ((ch.title || '').toLowerCase().includes(q) || (ch.username || '').toLowerCase().startsWith(q))).slice(0, 20).map(chatPreview) : [];
  const servers = db.flags.discovery ? Object.values(db.servers).filter(s => s.pub && !s.members[c.uid] && s.name.toLowerCase().includes(q)).slice(0, 10).map(serverPreview) : [];
  return { users, chats, servers };
};

// ══════════ ИСТОРИИ ══════════
const knows = (a, b) => (a.contacts || []).includes(b.id) || (b.contacts || []).includes(a.id) || !!db.chats[C.dmId(a.id, b.id)];
function storyVisible(s, viewer) {
  if (s.user === viewer.id) return true;
  const a = db.users[s.user]; if (!a || a.deleted || (a.blocked || []).includes(viewer.id)) return false;
  if (!C.canSee(a, viewer.id, 'stories')) return false;
  if (s.aud === 'close' || s.aud === 'selected') return (s.list || []).includes(viewer.id);
  if (s.aud === 'except' && (s.list || []).includes(viewer.id)) return false;
  if (s.aud === 'contacts') return (a.contacts || []).includes(viewer.id);
  return C.isRobot(a.id) || knows(a, viewer);      // подборки редакции видны всем, остальные истории только знакомым
}
const storyView = (s, uid) => ({ id: s.id, user: s.user, ts: s.ts, kind: s.kind, text: s.text, bg: s.bg, media: s.media, aud: s.user === uid ? s.aud : undefined, seen: s.views.some(v => v.u === uid), views: s.user === uid ? s.views.length : undefined, items: s.items });
H['story.list'] = (c, p) => {
  const me = user(c), t = now() - 864e5;
  const list = Object.values(db.stories).filter(s => (p.archive ? s.user === me.id : s.ts > t && s.ts <= now()) && storyVisible(s, me)).sort((a, b) => a.ts - b.ts);
  return { stories: list.map(s => storyView(s, c.uid)), users: usersFor(c, list.map(s => s.user)) };
};
H['story.post'] = (c, p) => {
  C.needVoice(user(c));
  need(db.flags.stories, 'Истории отключены администратором');
  const me = user(c); A.limit('story:' + c.uid, 30, 864e5);
  const kind = ['text', 'photo', 'video'].includes(p.kind) ? p.kind : 'text';
  const s = { id: id(), user: c.uid, ts: now(), kind, text: str(p.text, 500), bg: str(p.bg, 60), aud: ['all', 'contacts', 'close', 'selected', 'except'].includes(p.aud) ? p.aud : 'all', list: (Array.isArray(p.list) ? p.list : []).slice(0, 500).map(x => str(x, 24)), views: [], rx: {} };
  if (Array.isArray(p.items)) s.items = p.items.slice(0, 12).map(i => ({ k: i.k === 'emoji' ? 'emoji' : 'text', v: str(i.v, 80), x: int(i.x, 0, 100), y: int(i.y, 0, 100), s: int(i.s, 10, 200, 40), c: str(i.c, 20) }));
  if (kind !== 'text') { need(p.media && isUpload(p.media.url), 'Файл не загружен'); s.media = { url: p.media.url, w: int(p.media.w, 0, 20000), h: int(p.media.h, 0, 20000), dur: Math.min(60, Number(p.media.dur) || 0) || undefined }; }
  else need(s.text, 'Пустая история');
  if (p.ts && C.canImport(me)) s.ts = int(p.ts, 1, now() + 31 * 864e5, now());      // отложенная история редакции: появится в своё время
  db.stories[s.id] = s; save();
  if (s.ts <= now()) for (const uid of C.conns.keys()) { const v = db.users[uid]; if (v && storyVisible(s, v)) emit(uid, 'story', { story: storyView(s, uid), user: pubUser(me, uid) }); }
  return storyView(s, c.uid);
};
H['story.view'] = (c, p) => { const s = db.stories[p.id]; if (!s || !storyVisible(s, user(c)) || s.user === c.uid) return; if (!s.views.some(v => v.u === c.uid)) { s.views.push({ u: c.uid, ts: now() }); save(); emit(s.user, 'story.views', { id: s.id, views: s.views.length }); } };
H['story.react'] = (c, p) => {
  const s = db.stories[p.id]; need(s && storyVisible(s, user(c)), 'История не найдена');
  const e = str(p.e, 16), text = str(p.text, 1000);
  if (e) { s.rx[c.uid] = e; save(); }
  if (s.user !== c.uid && (text || e)) {
    const ch = C.openDm(c.uid, s.user); checkSend(c, ch, {});
    postMessage(ch, c.uid, { text: text || e, quote: 'История: ' + (s.text || (s.kind === 'photo' ? 'фото' : 'видео')).slice(0, 80) });
  }
};
H['story.viewers'] = (c, p) => { const s = db.stories[p.id]; need(s && s.user === c.uid, 'История не найдена'); return { views: s.views.map(v => ({ ...v, e: s.rx[v.u] })), users: usersFor(c, s.views.map(v => v.u)) }; };
H['story.del'] = (c, p) => { const s = db.stories[p.id]; need(s && s.user === c.uid, 'История не найдена'); C.releaseFiles(s); delete db.stories[s.id]; save(); C.emitAll('story.del', { id: s.id }); };

// ══════════ ЛИСТИКИ (внутренняя валюта) И ПРЕМИУМ ══════════
const PREMIUM_PRICE = 500, BOOST_PRICE = 200;
// Сколько листиков и как быстро можно добыть. Числа меняются переменными окружения (см. README), применяются после перезапуска.
const envInt = (k, d, min, max) => { const n = Number(process.env[k]); return process.env[k] !== undefined && Number.isFinite(n) && n >= min && n <= max ? Math.floor(n) : d; };
const LEAF = {
  per: envInt('LEAF_TAPS', 10, 1, 1000),                 // тапов в «Листопаде» на один листик
  limit: envInt('LEAF_DAY_LIMIT', 150, 0, 100000),       // листиков в день за тапы
  dailyMin: envInt('LEAF_DAILY_MIN', 10, 0, 100000),     // ежедневный бонус, от
  dailyMax: envInt('LEAF_DAILY_MAX', 20, 0, 100000),     // и до
};
if (LEAF.dailyMax < LEAF.dailyMin) LEAF.dailyMax = LEAF.dailyMin;
// Тапы принимаем не быстрее, чем их может настучать человек: скрипт, который шлёт «300 тапов» раз за разом, получит столько же, сколько живой палец.
const TAP_RATE = 15, TAP_BURST = 150, tapBucket = new Map();      // тапов в секунду, запас, пользователь → { t, left }
const tapsToday = u => (u.tapDay === today() ? u.taps || 0 : 0);
const leafInfo = u => { const t = tapsToday(u); return { stars: u.stars || 0, per: LEAF.per, prog: t % LEAF.per, left: Math.max(0, LEAF.limit - Math.floor(t / LEAF.per)), limit: LEAF.limit, daily: u.lastDaily !== today(), dailyMin: LEAF.dailyMin, dailyMax: LEAF.dailyMax }; };
H['stars.info'] = c => leafInfo(user(c));
function spend(u, n, why) { need(db.flags.stars, 'Листики временно отключены'); need((u.stars || 0) >= n, `Не хватает листиков: нужно ${n} 🍃, у вас ${u.stars || 0}. ${why || ''}`); u.stars -= n; }
H['stars.daily'] = c => { const u = user(c); need(db.flags.stars, 'Листики отключены'); need(u.lastDaily !== today(), 'Сегодняшний бонус уже собран. Листья растут до завтра.'); u.lastDaily = today(); const n = LEAF.dailyMin + crypto.randomInt(0, LEAF.dailyMax - LEAF.dailyMin + 1); u.stars = (u.stars || 0) + n; save(); selfUpdate(u); return { n, stars: u.stars }; };
H['stars.tap'] = (c, p) => {
  const u = user(c); need(db.flags.stars, 'Листики отключены');
  if (u.tapDay !== today()) { u.tapDay = today(); u.taps = 0; }      // u.taps — тапы за сегодня, листик капает за каждые LEAF.per
  const t = now(); let b = tapBucket.get(u.id); if (!b) { if (tapBucket.size > 100000) tapBucket.clear(); tapBucket.set(u.id, b = { t, left: TAP_BURST }); }
  b.left = Math.min(TAP_BURST, b.left + (t - b.t) / 1000 * TAP_RATE); b.t = t;
  const taps = Math.max(0, Math.min(int(p.n, 0, 300), Math.floor(b.left), LEAF.limit * LEAF.per - u.taps)); b.left -= taps;
  const before = Math.floor(u.taps / LEAF.per); u.taps += taps; const n = Math.floor(u.taps / LEAF.per) - before;
  if (n) { u.stars = (u.stars || 0) + n; selfUpdate(u); } if (taps) save();
  return { n, taps, ...leafInfo(u) };
};
// Поделиться листиками: перевод другому человеку с подписью. У обоих остаётся запись в истории, получателю приходит карточка в личке и уведомление.
const SHARE = { max: envInt('LEAF_SHARE_MAX', 100000, 1, 1e9), ageH: envInt('LEAF_SHARE_AGE_H', 24, 0, 8760), keep: 40 };
const leafLog = (u, rec) => { (u.leafLog = u.leafLog || []).unshift(rec); if (u.leafLog.length > SHARE.keep) u.leafLog.length = SHARE.keep; };
// Общие условия для любого дарения (листики, подарки): кому можно и кто уже может.
function giveCheck(u, o) {
  need(db.flags.stars, 'Листики временно отключены');
  need(o.id !== u.id, 'Себе дарить — это просто перекладывание');
  need(!o.bot, 'Ботам дарить бесполезно: они не оценят');
  need(!o.banned, 'Этот аккаунт заблокирован, до него ничего не долетит');
  need(!(o.blocked || []).includes(u.id), 'Пользователь ограничил круг общения');
  need(!(u.blocked || []).includes(o.id), 'Вы заблокировали этого пользователя');
  // Свежий аккаунт сначала должен пожить: иначе листики печатаются регистрацией пустышек по приглашению и сливаются на основной.
  const wait = SHARE.ageH * 3600e3 - (now() - (u.created || 0));
  if (wait > 0 && !u.admin && !C.isOwner(u)) fail(`Дарить и делиться листиками можно через ${SHARE.ageH} ч после регистрации. Осталось примерно ${Math.max(1, Math.ceil(wait / 3600e3))} ч.`);
}
H['stars.send'] = (c, p) => {
  const u = user(c), o = getUser(p.to), n = Number(p.n), note = str(p.note, 120).replace(/\s+/g, ' ');
  need(db.flags.stars, 'Листики временно отключены');
  need(Number.isInteger(n) && n >= 1, 'Сколько листиков? Нужно целое число от 1.');
  need(n <= SHARE.max, `За один раз можно поделиться не больше чем ${SHARE.max} 🍃`);
  giveCheck(u, o);
  A.limit('leafsend:' + u.id, 12, 60000);
  spend(u, n); o.stars = (o.stars || 0) + n;
  const ts = now(); leafLog(u, { ts, to: o.id, n, note: note || undefined }); leafLog(o, { ts, from: u.id, n, note: note || undefined });
  save(); selfUpdate(u); selfUpdate(o);
  const ch = C.openDm(u.id, o.id);
  const m = postMessage(ch, u.id, { type: 'service', text: `подарил(а) ${n} 🍃`, gift: n, note }, { quiet: true });
  try { require('./push').notify(o.id, { title: uname(u), body: `Делится с вами: ${n} 🍃${note ? ' — ' + note : ''}`.slice(0, 140), tag: ch.id, url: '/' }, C.isOnline(o.id)); } catch (e) { console.error('[push]', e.message); }
  return { stars: u.stars, chat: ch.id, msg: m.id };
};
H['stars.history'] = c => { const u = user(c), list = (u.leafLog || []).slice(0, SHARE.keep); return { list, users: usersFor(c, list.map(r => r.to || r.from)), max: SHARE.max }; };
H['premium.buy'] = c => { const u = user(c); spend(u, PREMIUM_PRICE, 'Листики копятся в мини-игре «Листопад», ежедневным бонусом и приглашениями друзей.'); u.premiumUntil = Math.max(u.premiumUntil || 0, now()) + 30 * 864e5; save(); selfUpdate(u); C.broadcastUser(u); return { until: u.premiumUntil }; };
H['fun.buzz'] = (c, p) => { const ch = getChat(c, p.chat); need(ch.type === 'dm' || ch.type === 'group', 'Пинать можно только в личке и группах'); A.limit('buzz:' + c.uid + ch.id, 1, 15000); for (const u of membersOf(ch)) emit(u, 'buzz', { chat: ch.id, user: c.uid }); };

module.exports = { H, getChat, getUser, uname, usersFor, ensureSaved, joinChat, chatPreview, serverPreview, resolveTarget, checkSend, buildPayload, hooksEdit, selfUpdate, spend, giveCheck, BOOST_PRICE, PREMIUM_PRICE, LEAF };
