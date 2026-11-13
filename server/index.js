'use strict';
// «Нудист» — точка входа: HTTP (статика, загрузки, авторизация, Bot API, вебхуки) + WebSocket (RPC и события) + фоновые задачи.
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib'), crypto = require('crypto');
const { WebSocketServer } = require('./vendor/ws');
const C = require('./core');
const Cloud = require('./cloud');
const A = require('./auth');
const Hub = require('./hub');
require('./feed');
const Ask = require('./ask');
const R = require('./rpc');
const G = require('./guild');
const B = require('./bots');
const Adm = require('./admin');
const Seed = require('./seed');
const { db, save, now, emit } = C;

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(C.ROOT, 'public');
const MIME = { apk: 'application/vnd.android.package-archive', html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon', woff2: 'font/woff2', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mp3: 'audio/mpeg', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac', pdf: 'application/pdf', webmanifest: 'application/manifest+json', txt: 'text/plain; charset=utf-8' };
const INLINE_UPLOAD = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'mp4', 'webm', 'mov', 'mp3', 'ogg', 'oga', 'opus', 'wav', 'm4a', 'aac', 'flac', 'pdf', 'txt']);
const CSP = "default-src 'self'; img-src 'self' data: blob: https:; media-src 'self' blob: data:; connect-src 'self' ws: wss:; style-src 'self' 'unsafe-inline'; font-src 'self'; frame-src 'self' https:; object-src 'none'; base-uri 'self'";

// Адрес клиента. На Render перед нами Cloudflare: он сам пишет настоящий адрес в cf-connecting-ip, а первый элемент x-forwarded-for клиент может подделать.
const ipOf = req => { const h = req.headers, cf = process.env.RENDER && (h['cf-connecting-ip'] || h['true-client-ip']); return String(cf || String(h['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '').replace(/^::ffff:/, ''); };
const json = (res, code, body) => { const s = JSON.stringify(body); res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(s); };
function readBody(req, max = 100000) {
  return new Promise((resolve, reject) => { const ch = []; let n = 0; req.on('data', d => { n += d.length; if (n > max) { reject(new C.PubError('Слишком большой запрос')); req.destroy(); } else ch.push(d); }); req.on('end', () => resolve(Buffer.concat(ch))); req.on('error', reject); });
}
async function readJson(req) { const b = await readBody(req); if (!b.length) return {}; try { const ct = req.headers['content-type'] || ''; return /urlencoded/.test(ct) ? Object.fromEntries(new URLSearchParams(b.toString())) : JSON.parse(b.toString('utf8')); } catch (e) { throw new C.PubError('Некорректный JSON'); } }
const sessionOf = req => { const t = (req.headers.authorization || '').replace(/^Bearer\s+/i, ''); const s = db.sessions[t]; return s && db.users[s.user] && !db.users[s.user].banned ? { s, u: db.users[s.user], t } : null; };

// ───── статика
const gzCache = new Map();
function serveStatic(req, res, rel) {
  const file = path.join(PUBLIC, path.normalize(rel).replace(/^([/\\]?\.\.[/\\])+/, ''));
  if (!file.startsWith(PUBLIC)) return json(res, 403, { error: 'forbidden' });
  fs.stat(file, (err, stt) => {
    if (err || !stt.isFile()) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('404 — тут ничего нет. Совсем голо.'); }
    const ext = path.extname(file).slice(1).toLowerCase(), etag = `"${stt.size}-${Math.round(stt.mtimeMs)}"`;
    const h = { 'content-type': MIME[ext] || 'application/octet-stream', etag, 'cache-control': ext === 'woff2' ? 'public, max-age=31536000, immutable' : /^(png|jpg|ico)$/.test(ext) ? 'public, max-age=86400' : 'no-cache', 'x-content-type-options': 'nosniff' };
    if (ext === 'html') { h['content-security-policy'] = CSP; h['referrer-policy'] = 'no-referrer'; }
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, h); return res.end(); }
    const ae = req.headers['accept-encoding'] || '';
    if (/^(html|js|css|json|svg|webmanifest)$/.test(ext) && /\b(br|gzip)\b/.test(ae)) {      // текст отдаём сжатым: brotli на треть меньше gzip
      const enc = /\bbr\b/.test(ae) ? 'br' : 'gzip', k = enc + file + etag; let z = gzCache.get(k);
      if (!z) {
        const raw = fs.readFileSync(file);
        z = enc === 'br' ? zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length } }) : zlib.gzipSync(raw, { level: 9 });
        gzCache.set(k, z);
      }
      h['content-encoding'] = enc; h.vary = 'accept-encoding'; h['content-length'] = z.length; res.writeHead(200, h); return res.end(z);
    }
    h['content-length'] = stt.size; res.writeHead(200, h); fs.createReadStream(file).pipe(res);
  });
}
// ───── офлайн-кеш оболочки (service worker)
// Браузер один раз скачивает все файлы интерфейса и дальше открывает приложение с диска, без единого запроса за кодом.
// Версия — хеш содержимого: после выкладки новой версии браузер сам докачает её в фоне и предложит обновиться.
const SW_SKIP = /^\/(admin\.html|ask\.html|css\/admin\.css|js\/admin\.js|js\/ask\.js|nudist\.apk|og\.png|sw\.js)$/;
let swBody = null;
function buildSw() {
  const files = [], hash = crypto.createHash('sha1');
  const walk = dir => { for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) { const f = path.join(dir, e.name); if (e.isDirectory()) walk(f); else { const rel = '/' + path.relative(PUBLIC, f).split(path.sep).join('/'); if (!SW_SKIP.test(rel)) { files.push(rel); hash.update(rel).update(fs.readFileSync(f)); } } } };
  walk(PUBLIC);
  const v = hash.digest('hex').slice(0, 12);
  if (process.env.NO_SW) return `self.addEventListener('install',function(){self.skipWaiting()});self.addEventListener('activate',function(e){e.waitUntil(caches.keys().then(function(k){return Promise.all(k.map(function(x){return caches.delete(x)}))}).then(function(){return self.registration.unregister()}))});`;
  return `// Нудист: кеш оболочки, версия ${v}
var V='nudist-${v}',FILES=${JSON.stringify(files)},SET={};FILES.forEach(function(f){SET[f]=1});
self.addEventListener('install',function(e){e.waitUntil(caches.open(V).then(function(c){return Promise.all(FILES.map(function(f){return fetch(f,{cache:'no-cache',credentials:'same-origin'}).then(function(r){if(!r.ok)throw new Error(f+' '+r.status);return c.put(f,r)})}))}))});
self.addEventListener('activate',function(e){e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.filter(function(k){return k.indexOf('nudist-')===0&&k!==V}).map(function(k){return caches.delete(k)}))}).then(function(){return self.clients.claim()}))});
self.addEventListener('message',function(e){if(e.data==='skip')self.skipWaiting()});
self.addEventListener('fetch',function(e){var q=e.request;if(q.method!=='GET')return;var u=new URL(q.url);if(u.origin!==location.origin)return;var p=u.pathname==='/'?'/index.html':u.pathname;if(!SET[p])return;
e.respondWith(caches.open(V).then(function(c){return c.match(p)}).then(function(r){return r||fetch(q)}))});
`;
}
function serveSw(req, res) {
  if (!swBody) swBody = buildSw();
  res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache, max-age=0', 'service-worker-allowed': '/', 'x-content-type-options': 'nosniff' }); res.end(swBody);
}
// ───── загрузки
function serveUpload(req, res, name) {
  if (!/^[\w-]+\.[a-z0-9]{1,8}$/.test(name)) return json(res, 404, { error: 'not found' });
  const file = path.join(C.UPLOADS, name);
  fs.stat(file, async (err, stt) => {
    if (err && Cloud.files && await Cloud.getUpload(name, file)) return serveUpload(req, res, name);   // диск хостинга стёрт — берём из облака
    if (err) return json(res, 404, { error: 'not found' });
    if (Cloud.files && Date.now() - stt.mtimeMs > 3600e3) fs.utimes(file, new Date(), new Date(), () => {});   // отметка «недавно открывали» для чистки кеша
    const ext = name.split('.').pop(), inline = INLINE_UPLOAD.has(ext);
    const q = new URL(req.url, 'http://x').searchParams.get('n');
    const h = { 'content-type': inline ? MIME[ext] : 'application/octet-stream', 'accept-ranges': 'bytes', 'cache-control': 'private, max-age=31536000, immutable', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox", 'cross-origin-resource-policy': 'same-origin' };
    if (!inline || q) h['content-disposition'] = `${inline && !q ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(q || name)}`;
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (range && (range[1] || range[2])) {
      let start = range[1] ? parseInt(range[1], 10) : stt.size - parseInt(range[2], 10), end = range[1] && range[2] ? parseInt(range[2], 10) : stt.size - 1;
      start = Math.max(0, start); end = Math.min(end, stt.size - 1);
      if (start > end) { res.writeHead(416, { 'content-range': `bytes */${stt.size}` }); return res.end(); }
      res.writeHead(206, { ...h, 'content-range': `bytes ${start}-${end}/${stt.size}`, 'content-length': end - start + 1 });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { ...h, 'content-length': stt.size });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}
function handleUpload(req, res) {
  const a = sessionOf(req); if (!a) return json(res, 401, { error: 'Нужна авторизация' });
  if (!db.flags.uploads) return json(res, 403, { error: 'Загрузка файлов отключена администратором' });
  const maxMb = Number(process.env.MAX_UPLOAD_MB) || (C.isPremium(a.u) ? 400 : 100), max = maxMb * 1024 * 1024;
  const len = Number(req.headers['content-length']) || 0;
  if (!Cloud.hasRoom(len)) { req.resume(); return json(res, 507, { error: 'Хранилище файлов заполнено. Удалите ненужные треки и клипы или напишите в поддержку.' }); }
  if (len > max) { req.resume(); return json(res, 413, { error: `Файл больше ${maxMb} МБ. ${C.isPremium(a.u) ? '' : 'С Премиумом лимит выше.'}` }); }
  let name = ''; try { name = decodeURIComponent(req.headers['x-name'] || ''); } catch (e) { /* игнор */ }
  name = name.replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 200) || 'file';
  const byMime = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'audio/webm': 'webm', 'video/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'video/mp4': 'mp4' };
  let ext = (/\.([a-z0-9]{1,8})$/i.exec(name) || [])[1] || byMime[(req.headers['content-type'] || '').split(';')[0]] || 'bin';
  ext = ext.toLowerCase();
  const fname = C.id() + crypto.randomBytes(4).toString('hex') + '.' + ext, tmp = path.join(C.UPLOADS, fname);
  const out = fs.createWriteStream(tmp); let size = 0, dead = false;
  req.on('data', d => { size += d.length; if (size > max && !dead) { dead = true; out.destroy(); fs.unlink(tmp, () => {}); json(res, 413, { error: `Файл больше ${maxMb} МБ` }); req.destroy(); } });
  req.pipe(out);
  req.on('aborted', () => { if (!dead) { dead = true; out.destroy(); fs.unlink(tmp, () => {}); } });
  out.on('finish', async () => {
    if (dead) return;
    try { await Cloud.putUpload(fname, tmp); }
    catch (e) { console.error('[cloud] файл не сохранён:', e.message); fs.unlink(tmp, () => {}); return json(res, e.full ? 507 : 502, { error: e.full ? 'Хранилище файлов заполнено. Удалите ненужные треки и клипы или напишите в поддержку.' : 'Не удалось сохранить файл в хранилище. Попробуйте ещё раз.' }); }
    json(res, 200, { url: '/u/' + fname, name, size, mime: (req.headers['content-type'] || 'application/octet-stream').slice(0, 100) });
  });
  out.on('error', () => { if (!dead) { dead = true; json(res, 500, { error: 'Не удалось сохранить файл' }); } });
}

// ───── HTTP
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x'), p = url.pathname;
    if (p.startsWith('/u/')) return serveUpload(req, res, p.slice(3));
    if (p === '/api/upload' && req.method === 'POST') return handleUpload(req, res);
    if (p === '/api/health') return json(res, 200, { ok: true, uptime: Math.round(process.uptime()), online: C.conns.size, cloud: Cloud.enabled ? { ok: !Cloud.status.lastError, savedAgo: Cloud.status.lastOk ? Math.round((Date.now() - Cloud.status.lastOk) / 1000) : null } : undefined, files: (u => u ? { mb: Math.round(u.bytes / 1048576), maxMb: Math.round(u.max / 1048576), count: u.files } : undefined)(Cloud.usage()) });
    if (p === '/api/config') return json(res, 200, { flags: db.flags, name: 'Нудист', version: '1.0.0' });
    if (p === '/api/clientlog' && req.method === 'POST') {      // телефон сообщает, почему приложение не запустилось
      try { A.limit('clog:' + ipOf(req), 20, 600e3); const b = (await readBody(req, 6000)).toString('utf8').replace(/[\r\n]+/g, ' ').slice(0, 1500); console.log('[client]', (req.headers['user-agent'] || '').slice(0, 200), '|', b); } catch (e) { /* лимит или мусор */ }
      return json(res, 200, { ok: true });
    }
    if (p === '/api/ask/info' && req.method === 'GET') return json(res, 200, Ask.info(url.searchParams.get('u'), ipOf(req)));
    if (p === '/api/ask' && req.method === 'POST') return json(res, 200, Ask.send(await readJson(req), ipOf(req)));
    if (p.startsWith('/api/admin/')) { const r = Adm.httpApi(p, req.headers.authorization); return json(res, r.code, r.body); }
    if (p.startsWith('/api/')) {
      const fn = A.api[p.slice(5)]; if (!fn || req.method !== 'POST') return json(res, 404, { error: 'not found' });
      const body = await readJson(req);
      return json(res, 200, await fn(body, { ip: ipOf(req), ua: req.headers['user-agent'] || '' }));
    }
    const bm = /^\/bot([^/]+)\/(\w+)$/.exec(p);
    if (bm) { const q = { ...Object.fromEntries(url.searchParams), ...(req.method === 'POST' ? await readJson(req) : {}) }; const r = await B.botApi(decodeURIComponent(bm[1]), bm[2], q); return json(res, r.code, r.body); }
    const hm = /^\/hook\/([\w-]+)\/([\w-]+)$/.exec(p);
    if (hm && req.method === 'POST') { A.limit('hook:' + hm[1], 30, 10000); const m = G.runHook(hm[1], hm[2], await readJson(req)); return json(res, 200, { ok: true, id: m.id }); }
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'method not allowed' });
    if (p === '/sw.js') return serveSw(req, res);
    if (p === '/' || p === '/index.html') return serveStatic(req, res, 'index.html');
    if (p === '/admin' || p === '/admin/') return serveStatic(req, res, 'admin.html');
    if (/^\/q\/[\w.-]{1,40}\/?$/.test(p)) return serveStatic(req, res, 'ask.html');      // «Голая правда»: страница анонимного вопроса
    return serveStatic(req, res, p);
  } catch (e) {
    if (e instanceof C.PubError) return json(res, 400, { error: e.message });
    console.error('[http]', e); if (!res.headersSent) json(res, 500, { error: 'Внутренняя ошибка. Мы уже краснеем.' });
  }
});

// ───── WebSocket
const wss = new WebSocketServer({ noServer: true, maxPayload: 1 << 20 });
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname !== '/ws') return socket.destroy();
  const t = url.searchParams.get('token'), s = db.sessions[t], u = s && db.users[s.user];
  wss.handleUpgrade(req, socket, head, ws => {
    if (!s || !u || u.deleted || u.banned) { ws.send(JSON.stringify({ ev: 'session.killed', d: { reason: u && u.banned ? 'Аккаунт заблокирован' : 'Сеанс недействителен' } })); return ws.close(); }
    onConnect(ws, t, s, u, ipOf(req));
  });
});
function presence(u, online) { for (const uid of C.audience(u)) if (C.canSee(u, uid, 'lastSeen')) emit(uid, 'presence', { user: u.id, online, seen: u.seen }); }
function initData(c) {
  const u = db.users[c.uid], chats = C.userChats(u), users = {};
  const add = i => { if (i && !users[i] && db.users[i]) users[i] = C.pubUser(db.users[i], u.id); };
  const views = chats.map(ch => { const v = C.chatView(ch, u.id); add(v.peer); if (v.last) add(v.last.from); return v; });
  (u.contacts || []).forEach(add); add(db.meta.sys);
  const rooms = G.roomsFor(u.id); rooms.forEach(r => r.peers.forEach(p => add(p.user)));
  return { me: C.selfUser(u), settings: u.settings || null, chats: views, servers: (u.servers || []).map(sid => db.servers[sid]).filter(Boolean).map(s => G.serverView(s, u.id)), users, flags: db.flags, rooms, conn: c.id, session: db.sessions[c.token].id, sys: db.meta.sys, time: now(), prices: { premium: R.PREMIUM_PRICE, boost: R.BOOST_PRICE, leaf: R.LEAF } };
}
function onConnect(ws, tok, sess, u, ip) {
  const c = { id: C.id(), uid: u.id, token: tok, ip, ws, alive: true, n: 0, raw: s => { if (ws.readyState === 1) ws.send(s); }, send: (ev, d) => c.raw(JSON.stringify({ ev, d })), close: () => ws.close() };
  const first = !C.conns.has(u.id);
  if (first) C.conns.set(u.id, new Set());
  C.conns.get(u.id).add(c); C.connById.set(c.id, c);
  sess.seen = now(); sess.ip = ip; u.seen = now(); C.touchDau(u.id);
  // отметка «доставлено» для личных чатов
  for (const cid of u.chats || []) { const ch = db.chats[cid]; if (ch && (ch.type === 'dm' || ch.type === 'secret') && ch.members[u.id]) { const s = C.st(ch, u.id); if ((s.deliv || 0) < ch.seq) { s.deliv = ch.seq; for (const o in ch.members) if (o !== u.id) emit(o, 'deliv', { chat: ch.id, seq: ch.seq }); } } }
  c.send('init', initData(c));
  if (first) presence(u, true);
  save();
  ws.on('pong', () => { c.alive = true; });
  ws.on('message', async (data, isBinary) => {
    if (isBinary) return G.audio(c, data); // звук звонка, идущий через сервер
    let q; try { q = JSON.parse(data.toString()); } catch (e) { return; }
    if (!q || typeof q.m !== 'string') return;
    if (++c.n > 80) return c.raw(JSON.stringify({ id: q.id, e: 'Слишком много запросов. Помедленнее, мы записываем.' }));
    const h = R.H[q.m]; C.metrics.rpc++; minuteCount++;
    if (!h) return c.raw(JSON.stringify({ id: q.id, e: 'Неизвестный метод ' + q.m }));
    if (!db.users[c.uid] || db.users[c.uid].deleted) return;
    try { const r = await h(c, q.p && typeof q.p === 'object' ? q.p : {}); c.raw(JSON.stringify({ id: q.id, r: r === undefined ? null : r })); }
    catch (e) {
      C.metrics.errors++;
      if (e instanceof C.PubError) c.raw(JSON.stringify({ id: q.id, e: e.message }));
      else { console.error('[rpc]', q.m, e); c.raw(JSON.stringify({ id: q.id, e: 'Внутренняя ошибка сервера. Мы уже краснеем.' })); }
    }
  });
  ws.on('close', () => {
    G.dropConn(c); Hub.dropConn(c); C.connById.delete(c.id);
    const set = C.conns.get(u.id); if (set) { set.delete(c); if (!set.size) { C.conns.delete(u.id); const cur = db.users[u.id]; if (cur && !cur.deleted) { cur.seen = now(); presence(cur, false); save(); } } }
  });
  ws.on('error', () => {});
}
let minuteCount = 0;

// ───── фоновые задачи
setInterval(() => { for (const set of C.conns.values()) for (const c of set) { c.n = 0; } }, 1000).unref();
setInterval(() => { for (const set of C.conns.values()) for (const c of set) { if (!c.alive) { c.ws.terminate(); continue; } c.alive = false; try { c.ws.ping(); } catch (e) { /* закрыт */ } const s = db.sessions[c.token]; if (s) s.seen = now(); } }, 30000).unref();
setInterval(() => {
  const t = now();
  // исчезающие сообщения
  if (C.expiring.length) { const due = {}; for (let i = C.expiring.length - 1; i >= 0; i--) { const e = C.expiring[i]; if (e.at <= t) { (due[e.c] = due[e.c] || []).push(e.i); C.expiring.splice(i, 1); } } for (const cid in due) if (db.chats[cid]) C.deleteMessages(db.chats[cid], due[cid]); }
  // отложенные сообщения
  for (let i = db.scheduled.length - 1; i >= 0; i--) { const s = db.scheduled[i]; if (s.at > t) continue; db.scheduled.splice(i, 1); const ch = db.chats[s.chat]; if (ch && C.isMember(ch, s.from)) { try { C.postMessage(ch, s.from, s.p); } catch (e) { console.error('[sched]', e.message); } emit(s.from, 'sched.sent', { id: s.id, chat: s.chat }); } save(); }
  // капча в группах и завершение опросов по таймеру
  for (const ch of Object.values(db.chats)) {
    if (ch.caps) for (const uid in ch.caps) if (ch.caps[uid].exp < t) { const cap = ch.caps[uid]; delete ch.caps[uid]; C.deleteMessages(ch, [cap.m]); if (ch.members[uid] && ch.members[uid].pending) { C.service(ch, uid, 'не прошёл(ла) проверку вовремя'); C.removeFromChat(ch, uid); } save(); }
  }
}, 1000).unref();
setInterval(() => {
  C.metrics.perMin.push(minuteCount); minuteCount = 0; if (C.metrics.perMin.length > 60) C.metrics.perMin.shift();
  G.eventReminders(); Seed.factJob();
  const t = now();
  for (const u of Object.values(db.users)) if (u.status && u.status.until && u.status.until < t) { u.status = undefined; C.broadcastUser(u); save(); }
  // истёкшие опросы — разослать финальное состояние
  for (const cid in db.msgs) for (const m of db.msgs[cid].slice(-200)) if (m.poll && m.poll.closeAt && m.poll.closeAt < t && !m.poll.closed) { m.poll.closed = true; if (db.chats[cid]) C.updateMsg(db.chats[cid], m); }
}, 60000).unref();
setInterval(() => B.pollRss().catch(e => console.error('[rss]', e.message)), 10 * 60000).unref();
setInterval(() => { // автоудаление неактивных аккаунтов, чистка старой статистики
  const t = now();
  for (const u of Object.values(db.users)) if (!u.bot && !u.deleted && !C.isOnline(u.id) && u.seen && t - u.seen > (u.autodelete || 6) * 30 * 864e5) { console.log('[autodelete]', u.username || u.id); A.deleteUser(u); }
  const keep = new Set(); for (let i = 0; i < 60; i++) keep.add(C.today(t - i * 864e5)); for (const k of Object.keys(db.daily)) if (!keep.has(k)) delete db.daily[k];
  for (const k of Object.keys(db.invites)) if (db.invites[k].exp && db.invites[k].exp < t - 864e5) delete db.invites[k];
  save();
}, 3600e3).unref();

Seed.seed();
const HOST = process.env.HOST || '0.0.0.0';
server.on('error', e => { console.error('[fatal] сервер не запустился:', e.message); process.exit(1); });
server.listen(PORT, HOST, () => console.log(`🍃 «Нудист» запущен: http://${HOST}:${PORT}  (админка: /admin)`));
let stopping = false;
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => {
  if (stopping) return; stopping = true;
  C.flushSync();
  Cloud.final(JSON.stringify(db)).catch(e => console.error('[cloud]', e.message)).finally(() => process.exit(0));
});
// ───── не засыпать на бесплатных хостингах (Render усыпляет сервис после 15 минут без входящих запросов)
// KEEP_AWAKE: не задано — будим себя круглые сутки, кроме 02:00–06:00 по Москве (экономия бесплатных часов); always — без ночной паузы; off — выключено.
{
  const self = (process.env.KEEP_AWAKE_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, ''), mode = (process.env.KEEP_AWAKE || '').toLowerCase();
  if (self && mode !== 'off' && typeof fetch === 'function') {
    const ping = () => {
      const h = (new Date().getUTCHours() + 3) % 24;
      if (mode !== 'always' && h >= 2 && h < 6 && !C.conns.size) return;
      fetch(self + '/api/health', { headers: { 'user-agent': 'nudist-keep-awake' }, signal: AbortSignal.timeout(20000) }).then(r => r.arrayBuffer()).catch(e => console.error('[keep-awake]', e.message));
    };
    setInterval(ping, 5 * 60000).unref();
    console.log('[keep-awake] сервис будит сам себя: ' + self);
  }
}
process.on('uncaughtException', e => console.error('[fatal]', e));
process.on('unhandledRejection', e => console.error('[rejection]', e));
