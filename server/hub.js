// «Нудист»: развлекательная часть — музыка, клипы, прямые эфиры, каталог мини-приложений и техподдержка.
'use strict';
const C = require('./core');
const R = require('./rpc');
const { db, save, now, id, need, str, int, emit, isUpload, pubUser } = C;
const H = R.H;

db.tracks = db.tracks || {};      // музыка: id → трек
db.clips = db.clips || {};        // клипы: id → клип
db.tickets = db.tickets || {};    // поддержка: id пользователя → обращение

const upMb = u => Number(process.env.MAX_UPLOAD_MB) || (C.isPremium(u) ? 400 : 100);      // тот же предел, что и в загрузке файлов
const extOf = url => String(url).split('.').pop().toLowerCase();
const isMod = u => !!u && ['moderator', 'admin', 'superadmin'].includes(u.admin);
const me = c => db.users[c.uid];
const usersOf = (ids, vid) => { const o = {}; for (const i of ids) if (i && !o[i] && db.users[i]) o[i] = pubUser(db.users[i], vid); return o; };
// Простой ограничитель «не чаще N раз в сутки» на пользователя.
function perDay(u, key, max, msg) {
  const d = C.today(); u.lim = u.lim || {}; const k = u.lim[key];
  if (!k || k.d !== d) u.lim[key] = { d, n: 0 };
  need(u.lim[key].n < max, msg); u.lim[key].n++;
}

// ───────────────────────────── музыка
const AUDIO_EXT = new Set(['mp3', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'wav', 'flac']);
const MUSIC_MAX = Number(process.env.MUSIC_MAX_TRACKS) || 300;      // треков в одной библиотеке
const trackView = (t, u) => ({ id: t.id, title: t.title, artist: t.artist, url: t.url, dur: t.dur, size: t.size, ts: t.ts, by: t.by, pub: !!t.pub, plays: t.plays || 0, own: t.by === u.id, mine: (u.music || []).includes(t.id) });
const cleanLib = u => { u.music = (u.music || []).filter(i => db.tracks[i] && (db.tracks[i].pub || db.tracks[i].by === u.id)); return u.music; };

H['music.add'] = (c, p) => {
  const u = me(c), m = p.media || {};
  need(isUpload(m.url) && AUDIO_EXT.has(extOf(m.url)), 'Нужен аудиофайл: mp3, m4a, ogg, wav или flac');
  need(cleanLib(u).length < MUSIC_MAX, `В библиотеке уже ${MUSIC_MAX} треков. Удалите что-нибудь из старого.`);
  perDay(u, 'music', 100, 'На сегодня хватит загрузок. Уши тоже должны отдыхать.');
  const raw = str(m.name, 200).replace(/\.[a-z0-9]{2,5}$/i, '').replace(/_/g, ' ');
  let title = str(p.title, 120), artist = str(p.artist, 120);
  if (!title) { const parts = raw.split(/\s+[-–—]\s+/); if (parts.length > 1) { artist = artist || parts[0].trim(); title = parts.slice(1).join(' - ').trim(); } else title = raw || 'Без названия'; }
  const t = { id: id(), by: u.id, title: title.slice(0, 120), artist: artist || 'Неизвестный исполнитель', url: m.url, size: int(m.size, 0, 2e9), dur: Math.round(Number(m.dur) || 0), ts: now(), pub: !!p.pub, plays: 0 };
  db.tracks[t.id] = t; u.music.unshift(t.id); save();
  return trackView(t, u);
};
H['music.list'] = (c, p) => {
  const u = me(c), q = str(p.q, 60).toLowerCase(), tab = p.tab === 'all' ? 'all' : 'my';
  let list;
  if (tab === 'my') list = cleanLib(u).map(i => db.tracks[i]);
  else { list = []; for (const k in db.tracks) if (db.tracks[k].pub) list.push(db.tracks[k]); list.sort((a, b) => (b.plays || 0) - (a.plays || 0) || b.ts - a.ts); }
  if (q) list = list.filter(t => (t.title + ' ' + t.artist).toLowerCase().includes(q));
  const off = int(p.off, 0, 1e6), page = list.slice(off, off + 100);
  return { tracks: page.map(t => trackView(t, u)), total: list.length, max: MUSIC_MAX, mb: upMb(u), users: usersOf(page.map(t => t.by), c.uid) };
};
H['music.save'] = (c, p) => {
  const u = me(c), t = db.tracks[str(p.id, 32)]; need(t && (t.pub || t.by === u.id), 'Трек не найден');
  cleanLib(u);
  if (p.on === false) { need(t.by !== u.id, 'Свой трек можно только удалить'); u.music = u.music.filter(i => i !== t.id); }
  else if (!u.music.includes(t.id)) { need(u.music.length < MUSIC_MAX, `В библиотеке уже ${MUSIC_MAX} треков`); u.music.unshift(t.id); }
  save(); return trackView(t, u);
};
H['music.edit'] = (c, p) => {
  const u = me(c), t = db.tracks[str(p.id, 32)]; need(t && t.by === u.id, 'Править можно только свои треки');
  if (p.title !== undefined) { const v = str(p.title, 120); need(v, 'У трека должно быть название'); t.title = v; }
  if (p.artist !== undefined) t.artist = str(p.artist, 120) || 'Неизвестный исполнитель';
  if (p.pub !== undefined) t.pub = !!p.pub;
  save(); return trackView(t, u);
};
H['music.del'] = (c, p) => {
  const u = me(c), t = db.tracks[str(p.id, 32)]; need(t && (t.by === u.id || isMod(u)), 'Удалять можно только свои треки');
  delete db.tracks[t.id]; u.music = (u.music || []).filter(i => i !== t.id); C.dropUpload(t.url); save();
};
H['music.play'] = (c, p) => { const t = db.tracks[str(p.id, 32)]; if (t) { t.plays = (t.plays || 0) + 1; save(); } };

// ───────────────────────────── клипы (короткие вертикальные видео)
const VIDEO_EXT = new Set(['mp4', 'webm', 'mov']);
const CLIP_MAX_SEC = 180;
const count = o => { let n = 0; for (const k in o) n++; return n; };
const clipView = (k, uid) => ({ id: k.id, by: k.by, url: k.url, w: k.w, h: k.h, dur: k.dur, text: k.text, ts: k.ts, likes: count(k.likes), liked: !!k.likes[uid], views: k.views || 0, comments: (k.cm || []).length, own: k.by === uid });
let clipOrder = null;      // id клипов от новых к старым; пересобирается при добавлении и удалении
const order = () => clipOrder || (clipOrder = Object.values(db.clips).sort((a, b) => b.ts - a.ts).map(k => k.id));

H['clip.add'] = (c, p) => {
  const u = me(c), m = p.media || {};
  need(isUpload(m.url) && VIDEO_EXT.has(extOf(m.url)), 'Нужно видео: mp4, webm или mov');
  const dur = Math.round(Number(m.dur) || 0); need(dur <= CLIP_MAX_SEC, `Клип — это до ${CLIP_MAX_SEC / 60} минут. Остальное называется фильм.`);
  perDay(u, 'clips', 30, 'На сегодня хватит клипов. Оставьте что-нибудь на завтра.');
  const k = { id: id(), by: u.id, url: m.url, w: int(m.w, 0, 20000), h: int(m.h, 0, 20000), dur, size: int(m.size, 0, 2e9), text: str(p.text, 300), ts: now(), likes: {}, views: 0, cm: [] };
  db.clips[k.id] = k; clipOrder = null; save();
  return clipView(k, u.id);
};
H['clip.feed'] = (c, p) => {
  const off = int(p.off, 0, 1e6), by = str(p.user, 32);
  let ids = order(); if (by) ids = ids.filter(i => db.clips[i].by === by);
  const page = ids.slice(off, off + 8).map(i => db.clips[i]);
  return { clips: page.map(k => clipView(k, c.uid)), more: off + page.length < ids.length, mb: upMb(me(c)), users: usersOf(page.map(k => k.by), c.uid) };
};
const clip = p => { const k = db.clips[str(p.id, 32)]; need(k, 'Клип не найден. Возможно, автор одумался.'); return k; };
H['clip.like'] = (c, p) => { const k = clip(p); if (p.on === false) delete k.likes[c.uid]; else k.likes[c.uid] = 1; save(); return { likes: count(k.likes), liked: !!k.likes[c.uid] }; };
const seenClips = new Map();      // кто что уже смотрел с момента запуска: просмотр считается один раз на человека
H['clip.view'] = (c, p) => {
  const k = db.clips[str(p.id, 32)]; if (!k || k.by === c.uid) return;
  let set = seenClips.get(c.uid); if (!set) { if (seenClips.size > 50000) seenClips.clear(); seenClips.set(c.uid, set = new Set()); }
  if (set.has(k.id)) return; if (set.size > 2000) set.clear(); set.add(k.id); k.views = (k.views || 0) + 1; save();
};
H['clip.del'] = (c, p) => { const k = clip(p), u = me(c); need(k.by === u.id || isMod(u), 'Удалять можно только свои клипы'); delete db.clips[k.id]; clipOrder = null; C.dropUpload(k.url); save(); };
H['clip.comments'] = (c, p) => { const k = clip(p), list = (k.cm || []).slice(-200); return { list, users: usersOf(list.map(x => x.by), c.uid) }; };
H['clip.comment'] = (c, p) => {
  const k = clip(p), u = me(c), text = str(p.text, 500); need(text, 'Пустой комментарий');
  perDay(u, 'clipcm', 300, 'Слишком много комментариев за день');
  const x = { id: id(), by: u.id, text, ts: now() }; k.cm = k.cm || []; k.cm.push(x); if (k.cm.length > 500) k.cm.splice(0, k.cm.length - 500); save();
  return { item: x, comments: k.cm.length, users: usersOf([u.id], c.uid) };
};
H['clip.uncomment'] = (c, p) => { const k = clip(p), u = me(c); const x = (k.cm || []).find(i => i.id === p.cid); need(x && (x.by === u.id || k.by === u.id || isMod(u)), 'Нельзя удалить этот комментарий'); k.cm = k.cm.filter(i => i !== x); save(); return { comments: k.cm.length }; };

// ───────────────────────────── прямые эфиры
// Видео идёт напрямую от ведущего каждому зрителю (WebRTC), сервер только знакомит их друг с другом и ведёт чат.
// Поэтому зрителей на один эфир немного: упираемся в исходящий канал ведущего. Записей эфиров нет.
const LIVE_MAX = Number(process.env.LIVE_MAX_VIEWERS) || 30;
const lives = new Map();      // id → { id, by, conn, title, kind, started, viewers: Map(connId → userId), peak, chat: [] }
const liveView = l => ({ id: l.id, by: l.by, title: l.title, kind: l.kind, started: l.started, viewers: l.viewers.size, peak: l.peak, max: LIVE_MAX });
const liveSend = (l, ev, d, skip) => { for (const cid of [l.conn, ...l.viewers.keys()]) { if (cid === skip) continue; const cn = C.connById.get(cid); if (cn) cn.send(ev, d); } };
const liveAnnounce = () => C.emitAll('live.upd', {});
function endLive(l, why) { if (!lives.has(l.id)) return; lives.delete(l.id); liveSend(l, 'live.end', { id: l.id, why: why || 'Эфир завершён' }); liveAnnounce(); }

H['live.list'] = c => { const list = [...lives.values()].sort((a, b) => b.viewers.size - a.viewers.size || b.started - a.started); return { list: list.map(liveView), users: usersOf(list.map(l => l.by), c.uid), max: LIVE_MAX }; };
H['live.start'] = (c, p) => {
  const u = me(c); need(db.flags.calls !== false, 'Эфиры отключены администратором');
  for (const l of lives.values()) if (l.by === u.id) endLive(l, 'Ведущий начал новый эфир');
  const l = { id: id(), by: u.id, conn: c.id, title: str(p.title, 120) || `Эфир ${R.uname(u)}`, kind: p.kind === 'screen' ? 'screen' : 'cam', started: now(), viewers: new Map(), peak: 0, chat: [] };
  lives.set(l.id, l); liveAnnounce();
  return { live: liveView(l), ice: iceServers() };
};
H['live.stop'] = (c, p) => { const l = lives.get(str(p.id, 32)); if (l && (l.by === c.uid || isMod(me(c)))) endLive(l, l.by === c.uid ? 'Ведущий завершил эфир' : 'Эфир остановлен модератором'); };
H['live.join'] = (c, p) => {
  const l = lives.get(str(p.id, 32)); need(l, 'Эфир уже закончился');
  need(l.conn !== c.id, 'Это ваш собственный эфир');
  need(l.viewers.has(c.id) || l.viewers.size < LIVE_MAX, `В зале уже ${LIVE_MAX} зрителей — больше канал ведущего не потянет`);
  l.viewers.set(c.id, c.uid); l.peak = Math.max(l.peak, l.viewers.size);
  const host = C.connById.get(l.conn); if (host) host.send('live.viewer', { id: l.id, conn: c.id, user: pubUser(me(c), l.by) });
  liveSend(l, 'live.count', { id: l.id, n: l.viewers.size });
  return { live: liveView(l), ice: iceServers(), you: c.id, chat: l.chat, users: usersOf([l.by, ...l.chat.map(m => m.by)], c.uid) };
};
function leaveLive(l, connId) { if (!l.viewers.delete(connId)) return; const host = C.connById.get(l.conn); if (host) host.send('live.gone', { id: l.id, conn: connId }); liveSend(l, 'live.count', { id: l.id, n: l.viewers.size }); }
H['live.leave'] = (c, p) => { const l = lives.get(str(p.id, 32)); if (l) leaveLive(l, c.id); };
H['live.signal'] = (c, p) => {      // знакомство ведущего со зрителем: только между участниками одного эфира
  const l = lives.get(str(p.id, 32)); if (!l || typeof p.to !== 'string') return;
  const ok = (c.id === l.conn && l.viewers.has(p.to)) || (l.viewers.has(c.id) && p.to === l.conn); if (!ok) return;
  const t = C.connById.get(p.to); if (t) t.send('live.signal', { id: l.id, from: c.id, data: p.data });
};
H['live.chat'] = (c, p) => {
  const l = lives.get(str(p.id, 32)); need(l && (l.conn === c.id || l.viewers.has(c.id)), 'Вы не в этом эфире');
  const text = str(p.text, 300); need(text, 'Пустое сообщение');
  const m = { id: id(), by: c.uid, text, ts: now() }; l.chat.push(m); if (l.chat.length > 60) l.chat.shift();
  liveSend(l, 'live.msg', { id: l.id, m, user: pubUser(me(c), c.uid) });
};
H['live.react'] = (c, p) => { const l = lives.get(str(p.id, 32)); if (l && (l.conn === c.id || l.viewers.has(c.id))) liveSend(l, 'live.react', { id: l.id, e: str(p.e, 8) || '❤️' }); };
function dropConn(c) { for (const l of [...lives.values()]) { if (l.conn === c.id) endLive(l, 'Связь с ведущим оборвалась'); else leaveLive(l, c.id); } }
// Те же STUN/TURN, что и у звонков.
function iceServers() {
  const host = process.env.TURN_HOST, secret = process.env.TURN_SECRET;
  if (host && secret) {
    const username = String(Math.floor(Date.now() / 1000) + 12 * 3600), credential = require('crypto').createHmac('sha1', secret).update(username).digest('base64'), port = process.env.TURN_PORT || 3478;
    return [{ urls: `stun:${host}:${port}` }, { urls: [`turn:${host}:${port}?transport=udp`, `turn:${host}:${port}?transport=tcp`], username, credential }];
  }
  try { return JSON.parse(process.env.ICE_SERVERS || ''); } catch (e) { return [{ urls: 'stun:stun.l.google.com:19302' }]; }
}

// ───────────────────────────── мини-приложения
const APPS = [
  { id: 'listopad', title: 'Листопад', about: 'Тапайте по листу и зарабатывайте листики 🍃', cat: 'games', emoji: '🍃', bot: 'listopad' },
  { id: 'g2048', title: '2048', about: 'Складывайте плитки до 2048. Затягивает сильнее ленты', cat: 'games', emoji: '🔢', url: '/miniapps/2048.html' },
  { id: 'saper', title: 'Сапёр', about: 'Классика из Windows. Одна ошибка — и вы голый', cat: 'games', emoji: '💣', url: '/miniapps/saper.html' },
  { id: 'lot', title: 'Жребий', about: 'Монетка, кубик и «кто идёт за пиццей»', cat: 'tools', emoji: '🎲', url: '/miniapps/lot.html' },
  { id: 'split', title: 'Скинемся', about: 'Делит счёт на компанию с чаевыми', cat: 'tools', emoji: '🧾', url: '/miniapps/split.html' },
];
H['apps.list'] = c => {
  const apps = APPS.map(a => { const b = a.bot && db.users[C.byName.get(a.bot)]; return { ...a, bot: b ? b.id : undefined }; }).filter(a => a.url || a.bot);
  const builtin = new Set(apps.map(a => a.bot).filter(Boolean));
  const bots = []; for (const k in db.users) { const b = db.users[k]; if (b.bot && b.app && !b.deleted && !b.banned && !builtin.has(b.id) && (b.listed || b.builtin || b.owner === c.uid)) bots.push({ id: 'bot:' + b.id, title: b.name, about: b.bio || 'Мини-приложение бота @' + b.username, cat: 'bots', bot: b.id, avatar: b.avatar, color: b.color || 0 }); if (bots.length >= 100) break; }
  return { apps: apps.concat(bots) };
};

// ───────────────────────────── техподдержка
// Человек пишет боту «Поддержка» в обычном чате. Частые вопросы бот закрывает сам; остальное попадает в очередь,
// которую видят администраторы (роль «модератор» и выше) и отвечают от имени поддержки.
const FAQ = [
  [/парол|не могу войти|не пуска|восстанов|забыл/i, 'Пароль меняется в «Настройки → Аккаунт». Если забыли — на экране входа есть «Забыли пароль?», но сработает он только с кодом восстановления (их выдают там же, в «Аккаунте»). Кодов нет — напишите сюда username, оператор поможет.'],
  [/не открыва|впн|vpn|не грузит|не загружа|не работает сайт/i, 'Сайт стоит на зарубежном хостинге, и у части российских операторов он без VPN открывается с перебоями. Попробуйте другую сеть (Wi‑Fi вместо мобильной или наоборот). Если приложение зависло на заставке — нажмите «Повторить».'],
  [/уведомлен|не приход|звук/i, 'Уведомления приходят, пока приложение или вкладка открыты. Проверьте «Настройки → Уведомления» и разрешение браузера. Когда приложение закрыто, уведомлений пока нет — честно, мы над этим работаем.'],
  [/звон|камер|микрофон|не слыш/i, 'Для звонков и эфиров браузеру нужно разрешение на камеру и микрофон (значок замка в адресной строке). Между некоторыми мобильными сетями звонок может не соединиться — тогда помогает Wi‑Fi хотя бы у одного из собеседников.'],
  [/удал(ить|ение) аккаунт|удалиться|снести аккаунт/i, 'Удалить аккаунт можно самостоятельно: «Настройки → Аккаунт → Удалить аккаунт». Это навсегда, переписка у собеседников останется.'],
  [/листик|преми|звёзд|оплат|купить/i, 'Листики 🍃 — внутренняя валюта: дают за ежедневный бонус, приглашённых друзей и «Листопад». Настоящих денег «Нудист» не принимает, так что и списать с вас нечего.'],
  [/музык|трек|mp3|мп3/i, `Музыка: кнопка с нотой слева → «Загрузить». Подходят mp3, m4a, ogg, wav и flac до ${upMb()} МБ. Трек можно оставить личным или выложить в «Общую волну».`],
  [/клип|эфир|стрим|трансляц/i, 'Клипы и эфиры — кнопки слева под списком серверов. Клип — вертикальное видео до 3 минут. Эфир идёт напрямую от ведущего к зрителям, поэтому зал небольшой: до 30 человек.'],
  [/жалоб|спам|оскорб|мошен|забан|разбан|блокир/i, 'Пожаловаться можно прямо в чате: нажмите на сообщение или профиль → «Пожаловаться». Жалобы разбирают модераторы. Если заблокировали вас и вы не согласны — опишите ситуацию здесь.'],
];
const supportBot = () => db.users[C.byName.get('support')];
const staffIds = () => { const out = []; for (const uid of C.conns.keys()) if (isMod(db.users[uid])) out.push(uid); return out; };
const ticketView = (t, vid) => { const u = db.users[t.user]; return { user: t.user, open: !!t.open, n: t.n, created: t.created, last: t.last, unread: t.unread || 0, text: t.text || '', by: t.by, name: u ? R.uname(u) : 'Удалённый аккаунт' }; };
const staffPing = t => { for (const uid of staffIds()) emit(uid, 'support.upd', { ticket: ticketView(t, uid), user: pubUser(db.users[t.user], uid) }); };
function onSupport(bot, chat, m) {      // вызывается из bots.js на каждое сообщение боту поддержки
  const u = db.users[m.from]; if (!u || u.bot) return;
  const text = String(m.text || '').trim(), say = t => C.postMessage(chat, bot.id, { text: t }, { quiet: true });
  if (/^\/start/.test(text)) return say('**Поддержка «Нудиста» на связи.** 🛟\n\nОпишите, что случилось, одним-двумя сообщениями: что делали, что ожидали и что получилось. Скриншот тоже можно. На частые вопросы отвечу сразу, остальное передам живому человеку.\n\n/help — частые вопросы\n/operator — сразу позвать оператора');
  if (/^\/help/.test(text)) return say('**Частые вопросы.** Напишите одним словом, что интересует: «пароль», «не открывается», «уведомления», «звонки», «музыка», «клипы», «листики», «жалоба», «удалить аккаунт».');
  let t = db.tickets[u.id]; const fresh = !t || !t.open;
  if (!t) t = db.tickets[u.id] = { user: u.id, created: now(), n: 0 };
  const hit = !/^\/operator/.test(text) && fresh && FAQ.find(([re]) => re.test(text));
  if (hit) { say(hit[1] + '\n\nЕсли не помогло — напишите /operator, передам человеку.'); return; }
  if (fresh) { db.meta.ticketSeq = (db.meta.ticketSeq || 0) + 1; t.n = db.meta.ticketSeq; t.open = true; t.created = now(); t.by = undefined; t.unread = 0; }
  t.last = now(); t.unread = (t.unread || 0) + 1; t.text = (text || (m.type === 'photo' ? 'Фото' : 'Вложение')).slice(0, 140); save();
  if (fresh) say(`Обращение №${t.n} принято. Оператор ответит прямо в этом чате. Обычно это недолго, но ночью мы тоже спим — без одежды, зато крепко.`);
  staffPing(t);
}
const staff = c => { const u = me(c); need(isMod(u), 'Очередь обращений видят только администраторы (роль «модератор» и выше)'); return u; };
H['support.open'] = c => { const b = supportBot(); need(b, 'Поддержка ещё не настроена'); const ch = C.openDm(b.id, c.uid); const fresh = !(db.msgs[ch.id] || []).length; if (fresh) C.postMessage(ch, b.id, { text: '**Поддержка «Нудиста» на связи.** 🛟\n\nОпишите, что случилось: что делали, что ожидали и что получилось. На частые вопросы отвечу сразу, остальное передам живому человеку.' }, { quiet: true }); C.emitChat(ch, [c.uid]); return { chat: ch.id, user: pubUser(b, c.uid) }; };
H['support.list'] = (c, p) => {
  staff(c); const all = Object.values(db.tickets).filter(t => (p.closed ? !t.open : t.open) && t.n).sort((a, b) => (b.last || 0) - (a.last || 0)).slice(0, 200);
  return { list: all.map(t => ticketView(t, c.uid)), users: usersOf(all.map(t => t.user), c.uid), open: Object.values(db.tickets).filter(t => t.open).length };
};
const ticket = p => { const t = db.tickets[str(p.user, 32)]; need(t && db.users[t.user], 'Обращение не найдено'); return t; };
H['support.thread'] = (c, p) => {
  staff(c); const t = ticket(p), b = supportBot(), ch = C.openDm(b.id, t.user);
  if (t.unread) { t.unread = 0; save(); }
  return { ticket: ticketView(t, c.uid), bot: b.id, msgs: (db.msgs[ch.id] || []).filter(m => m.type !== 'service').slice(-80).map(m => C.msgView(m, c.uid)), users: usersOf([t.user, b.id, t.by], c.uid) };
};
H['support.reply'] = (c, p) => {
  const u = staff(c), t = ticket(p), b = supportBot(), text = str(p.text, 4000); need(text, 'Пустой ответ');
  const m = C.postMessage(C.openDm(b.id, t.user), b.id, { text, sig: R.uname(u) });
  t.by = u.id; t.unread = 0; t.last = now(); if (!t.open) t.open = true; save(); staffPing(t);
  return { msg: C.msgView(m, c.uid) };
};
H['support.close'] = (c, p) => {
  const u = staff(c), t = ticket(p), b = supportBot(); if (!t.open) return;
  t.open = false; t.unread = 0; t.by = u.id; save();
  C.postMessage(C.openDm(b.id, t.user), b.id, { text: `Обращение №${t.n} закрыто. Если вопрос остался — просто напишите сюда снова.` }, { quiet: true });
  staffPing(t);
};

module.exports = { dropConn, onSupport, lives };
