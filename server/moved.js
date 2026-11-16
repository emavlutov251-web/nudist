'use strict';
// Сервис переехал на другой адрес. На старом адресе остаётся эта заглушка (MOVED_TO=https://новый-адрес), и она:
//   1) переносит людей: страница на старом адресе забирает из браузера ключ сеанса, настройки и ключи секретных чатов и отдаёт их
//      новому адресу в части ссылки после «#» (на сервер она не попадает) — человек остаётся в своём аккаунте;
//   2) работает мостом к Telegram, если новый сервер стоит там, откуда Telegram недоступен: принимает сообщения боту и пересылает их
//      на новый адрес, а запросы нового сервера к Telegram — в обратную сторону (нужен общий ключ RELAY_KEY);
//   3) для приложения на Android, собранного под старый адрес, работает сквозным проводником: оно не умеет уйти на другой адрес,
//      поэтому заглушка молча передаёт его запросы и живое соединение новому серверу — приложение работает, пока его не обновят;
//   4) сама базу не открывает и ничего не пишет: данные теперь живут только на новом сервере.
const http = require('http');
const https = require('https');
const TO = String(process.env.MOVED_TO || '').replace(/\/+$/, '');
const KEY = String(process.env.RELAY_KEY || '');
const TG = 'https://api.telegram.org';
const PORT = Number(process.env.PORT) || 3000, HOST = process.env.HOST || '0.0.0.0';
const BUILD = 'moved-' + Date.now().toString(36);

const body = (req, max = 2e6) => new Promise((res, rej) => { const a = []; let n = 0; req.on('data', d => { n += d.length; if (n > max) { rej(new Error('too large')); req.destroy(); } else a.push(d); }); req.on('end', () => res(Buffer.concat(a))); req.on('error', rej); });
const json = (res, code, o) => { const s = JSON.stringify(o); res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*' }); res.end(s); };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const PAGE = `<!doctype html><html lang="ru" data-to="${esc(TO)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>«Нудист» переехал</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.5 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:#0f1722;color:#e8eef5}main{max-width:420px;padding:28px;text-align:center}h1{font-size:1.4rem;margin:0 0 10px}p{margin:0 0 16px;color:#a9b6c6}a{display:inline-block;padding:12px 20px;border-radius:12px;background:#4ca6ee;color:#06121f;font-weight:600;text-decoration:none}</style></head>
<body><main><h1>«Нудист» переехал</h1><p>Новый адрес открывается в России без VPN. Сейчас перенесём вас туда — аккаунт, настройки и секретные чаты останутся на месте.</p><a id="go" href="${esc(TO)}/">Перейти на новый адрес</a></main><script src="/moved.js"></script></body></html>`;
// Что переносим: всё, что приложение хранит в браузере под своим именем (ключ сеанса, список аккаунтов, настройки, ключи секретных чатов). Большие записи пропускаем.
const SCRIPT = `(function(){var to=document.documentElement.getAttribute('data-to'),d={},i,k,v;try{for(i=0;i<localStorage.length;i++){k=localStorage.key(i);if(k.indexOf('nudist.')!==0)continue;v=localStorage.getItem(k);if(v&&v.length<20000)d[k]=v}}catch(e){}
var p='';try{p=btoa(unescape(encodeURIComponent(JSON.stringify({v:1,d:d,h:location.hash||''})))).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'')}catch(e){}
var u=to+location.pathname+location.search+(p?'#move='+p:location.hash);document.getElementById('go').href=u;location.replace(u)})();`;
const SW = `self.addEventListener('install',function(){self.skipWaiting()});self.addEventListener('activate',function(e){e.waitUntil(caches.keys().then(function(k){return Promise.all(k.map(function(c){return caches.delete(c)}))}).then(function(){return self.registration.unregister()}).then(function(){return self.clients.matchAll({type:'window'})}).then(function(cs){cs.forEach(function(c){c.navigate(c.url)})}))});`;

// Приложение на Android узнаём по подписи в User-Agent. Его запросы уходят на новый сервер как есть.
const T = new URL(TO || 'http://127.0.0.1'), lib = T.protocol === 'https:' ? https : http, isApp = req => /NudistAndroid/.test(req.headers['user-agent'] || '');
const fwdHeaders = req => { const h = { ...req.headers, host: T.host }; const ip = (req.socket.remoteAddress || '').replace(/^::ffff:/, ''); h['x-forwarded-for'] = [req.headers['x-forwarded-for'], ip].filter(Boolean).join(', '); delete h['accept-encoding']; return h; };
function proxy(req, res) {
  const out = lib.request({ protocol: T.protocol, hostname: T.hostname, port: T.port || (T.protocol === 'https:' ? 443 : 80), method: req.method, path: req.url, headers: fwdHeaders(req), timeout: 120000 }, r => { res.writeHead(r.statusCode || 502, r.headers); r.pipe(res); });
  out.on('timeout', () => out.destroy(new Error('timeout'))); out.on('error', e => { console.warn('[moved] проводник:', e.message); if (!res.headersSent) json(res, 502, { error: 'Новый сервер не отвечает. Попробуйте чуть позже.' }); else res.destroy(); });
  req.pipe(out);
}
function proxyWs(req, socket, head) {      // живое соединение: соединяем два сокета напрямую
  const out = lib.request({ protocol: T.protocol, hostname: T.hostname, port: T.port || (T.protocol === 'https:' ? 443 : 80), method: 'GET', path: req.url, headers: fwdHeaders(req) });
  out.on('upgrade', (r, up, h2) => {
    socket.write('HTTP/1.1 101 Switching Protocols\r\n' + Object.entries(r.headers).map(([k, v]) => k + ': ' + v).join('\r\n') + '\r\n\r\n'); if (h2 && h2.length) socket.write(h2); if (head && head.length) up.write(head);
    up.pipe(socket); socket.pipe(up); const end = () => { up.destroy(); socket.destroy(); }; up.on('error', end); socket.on('error', end); up.on('close', end); socket.on('close', end);
  });
  out.on('response', r => { socket.end('HTTP/1.1 ' + (r.statusCode || 502) + ' ' + (r.statusMessage || '') + '\r\n\r\n'); });
  out.on('error', () => socket.destroy()); out.end();
}

async function relay(req, res, rest) {      // запрос нового сервера к Telegram: пересылаем как есть
  const b = req.method === 'GET' || req.method === 'HEAD' ? undefined : await body(req);
  const r = await fetch(TG + rest, { method: req.method, headers: req.headers['content-type'] ? { 'content-type': req.headers['content-type'] } : {}, body: b, signal: AbortSignal.timeout(40000) });
  const buf = Buffer.from(await r.arrayBuffer());
  res.writeHead(r.status, { 'content-type': r.headers.get('content-type') || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(buf);
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x'), p = url.pathname;
    if (p === '/api/health') return json(res, 200, { ok: true, moved: TO, uptime: Math.round(process.uptime()) });
    if (p === '/api/tg/hook' && req.method === 'POST') {      // сообщение боту от Telegram → новому серверу, с тем же секретом
      const b = await body(req);
      try { await fetch(TO + '/api/tg/hook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': req.headers['x-telegram-bot-api-secret-token'] || '' }, body: b, signal: AbortSignal.timeout(20000) }); } catch (e) { console.warn('[moved] сообщение боту не доставлено:', e.message); return json(res, 502, { ok: false }); }
      return json(res, 200, { ok: true });
    }
    const m = /^\/tg-relay\/([\w-]{16,})(\/(?:file\/)?bot[^/]+\/.+)$/.exec(p);
    if (m) { if (!KEY || m[1] !== KEY) return json(res, 403, { ok: false, description: 'forbidden' }); return await relay(req, res, m[2] + url.search); }
    if (isApp(req)) return proxy(req, res);      /* приложение на Android: всё остальное — сквозь нас на новый сервер */
    if (p === '/moved.js') { res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' }); return res.end(SCRIPT); }
    if (p === '/sw.js') { res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' }); return res.end(SW); }      // старый офлайн-кеш стирает сам себя и перезагружает вкладки
    if (p === '/api/version') return json(res, 200, { build: BUILD, moved: TO });      // старая открытая вкладка увидит «вышло обновление», обновится и попадёт на страницу переезда
    if (p.startsWith('/api/') || p === '/ws') return json(res, 410, { error: '«Нудист» переехал на ' + TO + '. Обновите страницу.', moved: TO });
    if (/\.(apk|png|jpg|svg|ico|webmanifest|json|css|woff2)$/.test(p) || /^\/(privacy|pay|offer|contacts|start|admin|u\/)/.test(p)) { res.writeHead(302, { location: TO + p + url.search, 'cache-control': 'no-store' }); return res.end(); }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'", 'referrer-policy': 'origin', 'x-content-type-options': 'nosniff' });      /* новый адрес принимает перенос только от нас — он узнаёт это по адресу, с которого пришли */
    res.end(PAGE);
  } catch (e) { console.error('[moved]', e.message); try { json(res, 500, { error: 'ошибка' }); } catch (x) { /* ответ уже ушёл */ } }
}).on('upgrade', (req, socket, head) => { if (isApp(req) && TO) proxyWs(req, socket, head); else socket.end('HTTP/1.1 410 Gone\r\n\r\n'); }).listen(PORT, HOST, () => console.log(`[moved] заглушка на ${HOST}:${PORT}: всё ведёт на ${TO}` + (KEY ? ', мост к Telegram включён' : '')));
