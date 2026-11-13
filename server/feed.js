// «Лента»: записи людей как в соцсети. Текст и до четырёх картинок, лайки, комментарии, подписки на авторов.
// При переносе из своего канала (C.canImport) запись может нести до десяти вложений, включая видео и голосовые, и исходную дату.
// Дата может быть и в будущем: такая запись лежит скрытой и сама появляется в ленте, когда приходит её время.
// Чтобы у новичка лента не была пустой, в общую вкладку подмешиваются свежие записи каналов, на которые он подписан.
const C = require('./core');
const R = require('./rpc');
const { db, save, now, id, need, str, int, isUpload, pubUser } = C;
const H = R.H;

db.posts = db.posts || {};        // записи: id → запись
const IMG_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp']);
const AV_EXT = new Set(['mp4', 'webm', 'mov', 'm4a', 'mp3', 'ogg', 'oga', 'opus', 'aac', 'wav']);
const extOf = url => String(url).split('.').pop().toLowerCase();
const isMod = u => !!u && ['moderator', 'admin', 'superadmin'].includes(u.admin);
const me = c => db.users[c.uid];
const count = o => { let n = 0; for (const k in o) n++; return n; };
const usersOf = (ids, vid) => { const o = {}; for (const i of ids) if (i && !o[i] && db.users[i]) o[i] = pubUser(db.users[i], vid); return o; };
function perDay(u, key, max, msg) {
  const d = C.today(); u.lim = u.lim || {}; const k = u.lim[key];
  if (!k || k.d !== d) u.lim[key] = { d, n: 0 };
  need(u.lim[key].n < max, msg); u.lim[key].n++;
}
C.hooks.userGone.push(u => { let n = 0; for (const k of Object.keys(db.posts)) if (db.posts[k].by === u.id) { C.releaseFiles(db.posts[k]); delete db.posts[k]; n++; } if (n) order = null; });      // аккаунт удалён — его записи тоже
let order = null;      // id записей от новых к старым; сбрасывается при добавлении и удалении
const sorted = () => order || (order = Object.values(db.posts).sort((a, b) => b.ts - a.ts).map(p => p.id));
const view = (p, u) => ({ id: p.id, by: p.by, ts: p.ts, text: p.text, media: p.media || [], likes: count(p.likes), liked: !!p.likes[u.id], comments: (p.cm || []).length, views: p.views || 0, own: p.by === u.id || isMod(u) });
const post = p => { const x = db.posts[str(p.id, 32)]; need(x, 'Запись не найдена. Возможно, автор передумал.'); return x; };
// Автор виден, если он существует, не удалён и никто из двоих не заблокировал другого
function visible(by, u) { const a = db.users[by]; return !!a && !a.deleted && !(a.blocked || []).includes(u.id) && !(u.blocked || []).includes(by); }
// Свежие записи каналов, где человек состоит: по пять последних из каждого
function channelItems(u) {
  const out = [];
  for (const cid of u.chats || []) {
    const ch = db.chats[cid]; if (!ch || ch.type !== 'channel' || !ch.members || !ch.members[u.id]) continue;
    const arr = db.msgs[cid] || []; let n = 0;
    for (let i = arr.length - 1; i >= 0 && n < 5; i--) {
      const m = arr[i]; if (m.type === 'service' || m.enc || m.once || m.thread || !(m.text || m.media)) continue;
      const url = m.media && m.media.url, img = url && isUpload(url) && IMG_EXT.has(extOf(url)) ? [url] : [];
      if (!m.text && !img.length) continue;
      out.push({ id: 'ch.' + cid + '.' + m.id, kind: 'channel', chat: cid, title: ch.title, avatar: ch.avatar, color: ch.color || 0, ts: m.ts, text: (m.text || '').replace(/\*\*|__|~~|\|\||`/g, ''), media: img });      // разметку чата лента не понимает: убираем звёздочки
      n++;
    }
  }
  return out;
}

// ───── «Для вас»: рекомендации. Без нейросетей: каждая запись получает оценку, лента сортируется по ней.
// Что учитывается: свежесть (старое не тонет насовсем), отклик (лайки и комментарии), ваш интерес к автору
// (подписка, ваши лайки и комментарии под его записями), наличие картинки или видео. Уже просмотренное уходит в хвост.
// Чтобы один плодовитый автор не занял всю ленту, каждая его следующая запись получает штраф.
// Небольшой случайный разброс меняется раз в день: лента не одинаковая изо дня в день, но не прыгает при листании.
const recCache = new Map();      // id человека → { at, list }: порядок считается при открытии ленты и держится, пока её листают
const noise = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
function diversify(scored) {      // scored: [{ ref, by, s }] → ссылки по убыванию оценки с учётом штрафа за повтор автора
  const byAuthor = new Map();
  for (const x of scored) { let a = byAuthor.get(x.by); if (!a) byAuthor.set(x.by, a = []); a.push(x); }
  for (const a of byAuthor.values()) { a.sort((p, q) => q.s - p.s); a.forEach((x, k) => { x.s /= 1 + 0.6 * k; }); }
  return scored.sort((p, q) => q.s - p.s).map(x => x.ref);
}
function recommend(u) {
  const t = now(), fol = new Set(u.follows || []), day = C.today(), near = {}, cand = [];
  for (const x of Object.values(db.posts)) {
    if (x.ts > t || !visible(x.by, u)) continue;
    if (x.by === u.id) continue;
    let mine = x.likes[u.id] ? 1 : 0; for (const k of x.cm || []) if (k.by === u.id) { mine++; break; }
    if (mine) near[x.by] = (near[x.by] || 0) + mine;
    cand.push(x);
  }
  const scored = cand.map(x => {
    const ageH = (t - x.ts) / 36e5, likes = count(x.likes), cm = (x.cm || []).length, hasMedia = x.media && x.media.length > 0;
    let s = 0.15 + 0.85 / (1 + ageH / 48);                                   // свежесть
    s *= 1 + 0.5 * Math.log2(1 + 2 * likes + 3 * cm);                        // отклик
    s *= (fol.has(x.by) ? 2 : 1) * (1 + 0.3 * Math.min(3, near[x.by] || 0)); // интерес к автору
    s *= hasMedia ? 1.15 : (x.text || '').length < 20 ? 0.7 : 1;
    s *= 0.8 + 0.4 * noise(u.id + day + x.id);
    if (x.seen && x.seen[u.id]) s *= 0.03;                                   // уже видели — в хвост
    return { ref: x.id, by: x.by, s };
  });
  for (const it of channelItems(u)) scored.push({ ref: it, by: 'ch.' + it.chat, s: (0.15 + 0.85 / (1 + (t - it.ts) / 36e5 / 48)) * (0.8 + 0.4 * noise(u.id + day + it.id)) });
  return diversify(scored);
}

H['feed.list'] = (c, p) => {
  const u = me(c), tab = ['rec', 'all', 'subs', 'user'].includes(p.tab) ? p.tab : 'all', off = int(p.off, 0, 1e6), who = str(p.user, 32), fol = new Set(u.follows || []);
  const t = now();
  if (tab === 'rec') {
    let rc = recCache.get(u.id);
    if (!off || !rc || t - rc.at > 30 * 60e3) { if (recCache.size > 3000) recCache.clear(); rc = { at: t, list: recommend(u) }; recCache.set(u.id, rc); }
    const page = rc.list.slice(off, off + 15).map(r => (typeof r === 'string' ? db.posts[r] && view(db.posts[r], u) : r)).filter(Boolean);
    return { items: page, more: off + 15 < rc.list.length, next: off + 15, now: t, users: usersOf(page.map(x => x.by), u.id), follows: [...fol] };
  }
  let items = sorted().map(i => db.posts[i]).filter(x => x.ts <= t && visible(x.by, u));
  if (tab === 'subs') items = items.filter(x => x.by === u.id || fol.has(x.by));
  else if (tab === 'user') items = items.filter(x => x.by === (who || u.id));
  items = items.map(x => view(x, u));
  if (tab === 'all') items = items.concat(channelItems(u)).sort((a, b) => b.ts - a.ts);
  const page = items.slice(off, off + 15);
  return { items: page, more: off + page.length < items.length, next: off + page.length, now: t, users: usersOf(page.map(x => x.by), u.id), follows: [...fol] };
};
// Обновление открытой ленты без перезагрузки: что появилось после момента after и что изменилось у уже загруженных записей.
H['feed.fresh'] = (c, p) => {
  const u = me(c), t = now(), after = int(p.after, 0, t, t), tab = ['subs', 'user'].includes(p.tab) ? p.tab : 'all', fol = new Set(u.follows || []);
  let items = [];
  if (tab !== 'user') {
    for (const i of sorted()) {
      const x = db.posts[i]; if (x.ts <= after) break;
      if (x.ts > t || x.by === u.id || !visible(x.by, u) || (tab === 'subs' && !fol.has(x.by))) continue;
      items.push(view(x, u)); if (items.length >= 30) break;
    }
    if (tab === 'all') items = items.concat(channelItems(u).filter(x => x.ts > after && x.ts <= t)).sort((a, b) => b.ts - a.ts);
  }
  const stats = {}, gone = [];
  for (const i of (Array.isArray(p.ids) ? p.ids : []).slice(0, 100)) {
    const k = str(i, 32), x = db.posts[k]; if (!k) continue;
    if (!x) gone.push(k); else stats[k] = { likes: count(x.likes), liked: !!x.likes[u.id], comments: (x.cm || []).length, views: x.views || 0 };
  }
  return { items, stats, gone, now: t, users: usersOf(items.map(x => x.by), u.id) };
};
// Просмотры: приложение сообщает пачкой, какие записи человек действительно увидел на экране.
H['feed.seen'] = (c, p) => {
  const u = me(c), t = now(); let n = 0;
  for (const i of (Array.isArray(p.ids) ? p.ids : []).slice(0, 40)) {
    const x = db.posts[str(i, 32)]; if (!x || x.by === u.id || x.ts > t) continue;
    if (C.markSeen(x, u.id)) { x.views = (x.views || 0) + 1; n++; }
  }
  if (n) save();
};
H['feed.viewers'] = (c, p) => { const x = post(p); need(x.by === c.uid, 'Кто смотрел запись, видит только её автор'); return { ...C.viewersOf(x, c.uid), total: x.views || 0 }; };
H['feed.post'] = (c, p) => {
  C.needVoice(me(c)); const u = me(c), imp = C.canImport(u), text = str(p.text, imp ? 4096 : 2000).trim();
  const media = (Array.isArray(p.media) ? p.media : []).slice(0, imp ? 10 : 4).map(x => str(x, 200)).filter(x => isUpload(x) && (IMG_EXT.has(extOf(x)) || (imp && AV_EXT.has(extOf(x)))));
  need(text || media.length, 'Пустую запись публиковать незачем. Даже у нудистов есть что показать.');
  if (!imp) perDay(u, 'post', 30, 'Слишком много записей за день. Оставьте что-нибудь на завтра.');
  const ts = imp && Number(p.ts) > 0 ? Math.min(now() + 31 * 864e5, Math.round(Number(p.ts))) : now();
  const x = { id: id(), by: u.id, ts, text, media, likes: {} }; db.posts[x.id] = x; order = null; save();
  return view(x, u);
};
H['feed.del'] = (c, p) => {
  const x = post(p), u = me(c); need(x.by === u.id || isMod(u), 'Удалять можно только свои записи');
  delete db.posts[x.id]; order = null; for (const url of x.media || []) C.dropUpload(url); save();
};
H['feed.like'] = (c, p) => { const x = post(p); if (p.on === false) delete x.likes[c.uid]; else x.likes[c.uid] = 1; save(); return { likes: count(x.likes), liked: !!x.likes[c.uid] }; };
H['feed.comments'] = (c, p) => { const x = post(p), u = me(c), list = (x.cm || []).filter(k => visible(k.by, u)).slice(-200); return { list, users: usersOf(list.map(k => k.by), c.uid) }; };
H['feed.comment'] = (c, p) => {
  const x = post(p), u = me(c), text = str(p.text, 500).trim(); need(text, 'Пустой комментарий'); C.needVoice(u);
  need(visible(x.by, u), 'Автор закрыл для вас комментарии');
  perDay(u, 'postcm', 300, 'Слишком много комментариев за день');
  const k = { id: id(), by: u.id, text, ts: now() }; x.cm = x.cm || []; x.cm.push(k); if (x.cm.length > 500) x.cm.splice(0, x.cm.length - 500); save();
  return { item: k, comments: x.cm.length, users: usersOf([u.id], c.uid) };
};
H['feed.uncomment'] = (c, p) => {
  const x = post(p), u = me(c), k = (x.cm || []).find(q => q.id === str(p.cid, 32)); need(k, 'Комментарий не найден');
  need(k.by === u.id || x.by === u.id || isMod(u), 'Удалять можно свои комментарии и комментарии под своими записями');
  x.cm = x.cm.filter(q => q !== k); save(); return { comments: x.cm.length };
};
H['feed.follow'] = (c, p) => {
  const u = me(c), o = db.users[str(p.user, 32)]; need(o && !o.deleted && o.id !== u.id, 'Подписаться можно только на другого человека');
  const set = new Set(u.follows || []); if (p.on === false) set.delete(o.id); else { need(set.size < 2000, 'Слишком много подписок'); set.add(o.id); }
  u.follows = [...set]; save(); return { follows: u.follows };
};
