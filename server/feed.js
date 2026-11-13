// «Лента»: записи людей как в соцсети. Текст и до четырёх картинок, лайки, комментарии, подписки на авторов.
// Чтобы у новичка лента не была пустой, в общую вкладку подмешиваются свежие записи каналов, на которые он подписан.
const C = require('./core');
const R = require('./rpc');
const { db, save, now, id, need, str, int, isUpload, pubUser } = C;
const H = R.H;

db.posts = db.posts || {};        // записи: id → запись
const IMG_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp']);
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
let order = null;      // id записей от новых к старым; сбрасывается при добавлении и удалении
const sorted = () => order || (order = Object.values(db.posts).sort((a, b) => b.ts - a.ts).map(p => p.id));
const view = (p, u) => ({ id: p.id, by: p.by, ts: p.ts, text: p.text, media: p.media || [], likes: count(p.likes), liked: !!p.likes[u.id], comments: (p.cm || []).length, own: p.by === u.id || isMod(u) });
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
      out.push({ id: 'ch.' + cid + '.' + m.id, kind: 'channel', chat: cid, title: ch.title, avatar: ch.avatar, color: ch.color || 0, ts: m.ts, text: m.text || '', media: img }); n++;
    }
  }
  return out;
}

H['feed.list'] = (c, p) => {
  const u = me(c), tab = ['all', 'subs', 'user'].includes(p.tab) ? p.tab : 'all', off = int(p.off, 0, 1e6), who = str(p.user, 32), fol = new Set(u.follows || []);
  let items = sorted().map(i => db.posts[i]).filter(x => visible(x.by, u));
  if (tab === 'subs') items = items.filter(x => x.by === u.id || fol.has(x.by));
  else if (tab === 'user') items = items.filter(x => x.by === (who || u.id));
  items = items.map(x => view(x, u));
  if (tab === 'all') items = items.concat(channelItems(u)).sort((a, b) => b.ts - a.ts);
  const page = items.slice(off, off + 15);
  return { items: page, more: off + page.length < items.length, users: usersOf(page.map(x => x.by), u.id), follows: [...fol] };
};
H['feed.post'] = (c, p) => {
  const u = me(c), text = str(p.text, 2000).trim();
  const media = (Array.isArray(p.media) ? p.media : []).slice(0, 4).map(x => str(x, 200)).filter(x => isUpload(x) && IMG_EXT.has(extOf(x)));
  need(text || media.length, 'Пустую запись публиковать незачем. Даже у нудистов есть что показать.');
  perDay(u, 'post', 30, 'Слишком много записей за день. Оставьте что-нибудь на завтра.');
  const x = { id: id(), by: u.id, ts: now(), text, media, likes: {} }; db.posts[x.id] = x; order = null; save();
  return view(x, u);
};
H['feed.del'] = (c, p) => {
  const x = post(p), u = me(c); need(x.by === u.id || isMod(u), 'Удалять можно только свои записи');
  delete db.posts[x.id]; order = null; for (const url of x.media || []) C.dropUpload(url); save();
};
H['feed.like'] = (c, p) => { const x = post(p); if (p.on === false) delete x.likes[c.uid]; else x.likes[c.uid] = 1; save(); return { likes: count(x.likes), liked: !!x.likes[c.uid] }; };
H['feed.comments'] = (c, p) => { const x = post(p), u = me(c), list = (x.cm || []).filter(k => visible(k.by, u)).slice(-200); return { list, users: usersOf(list.map(k => k.by), c.uid) }; };
H['feed.comment'] = (c, p) => {
  const x = post(p), u = me(c), text = str(p.text, 500).trim(); need(text, 'Пустой комментарий');
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
