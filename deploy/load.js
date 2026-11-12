// Нагрузочный тест: N пользователей, каждый держит WebSocket и переписывается с соседом.
// node load.js <N> <секунд> <сообщений в минуту на пользователя> [base]
const WS = require('../server/vendor/ws'), http = require('http');
const [N = '200', SEC = '30', RATE = '6', BASE = 'http://localhost:3222'] = process.argv.slice(2);
const n = +N, agent = new http.Agent({ keepAlive: true, maxSockets: 16 });
const post = (path, body, ip) => new Promise((res, rej) => { const d = JSON.stringify(body); const r = http.request(BASE + path, { method: 'POST', agent, headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(d), 'x-forwarded-for': ip } }, x => { let s = ''; x.on('data', c => s += c); x.on('end', () => { try { res(JSON.parse(s)); } catch (e) { rej(new Error(s.slice(0, 80))); } }); }); r.on('error', rej); r.end(d); });
const get = path => new Promise((res, rej) => { const t = Date.now(); http.get(BASE + path, { agent }, x => { let s = ''; x.on('data', c => s += c); x.on('end', () => res({ ms: Date.now() - t, body: s })); }).on('error', rej); });
const pct = (a, p) => a.length ? a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] : 0;
(async () => {
  const tag = Date.now().toString(36).slice(-5), users = []; let t0 = Date.now();
  if (process.env.DB) { const d = JSON.parse(require('fs').readFileSync(process.env.DB, 'utf8')); Object.keys(d.sessions).slice(0, n).forEach((t, i) => { users[i] = { token: t }; }); }
  else for (let i = 0; i < n; i += 8) await Promise.all(Array.from({ length: Math.min(8, n - i) }, (_, k) => post('/api/register', { name: 'L' + (i + k), username: 'l' + tag + (i + k), password: 'secret123' }, '10.' + ((i + k) >> 16 & 255) + '.' + ((i + k) >> 8 & 255) + '.' + ((i + k) & 255)).then(r => { if (!r.token) throw new Error(JSON.stringify(r)); users[i + k] = { token: r.token }; })));
  console.log(`регистрация ${n}: ${((Date.now() - t0) / 1000).toFixed(1)} с`); t0 = Date.now();
  let initBytes = 0, opened = 0, connErr = 0; const GAP = +(process.env.GAP || 3);
  await Promise.all(users.map((u, i) => new Promise((res, rej) => setTimeout(() => {
    const ws = u.ws = new (WS.WebSocket || WS)(BASE.replace('http', 'ws') + '/ws?token=' + u.token); u.wait = new Map(); u.id = 0;
    ws.on('message', m => { const d = JSON.parse(m); if (d.ev === 'init') { initBytes += m.length; u.me = d.d.me.id; opened++; res(); } else if (d.id && u.wait.has(d.id)) { u.wait.get(d.id)(d); u.wait.delete(d.id); } else if (d.ev === 'msg' && d.d.msg && d.d.msg.from !== u.me) { const s = /^t(\d+)$/.exec(d.d.msg.text || ''); if (s) lat.push(Date.now() - +s[1]); } });
    ws.on('error', e => { connErr++; if (!u.me) res(); }); u.call = (m, p) => new Promise(r => { const id = ++u.id; u.wait.set(id, r); ws.send(JSON.stringify({ id, m, p })); });
  }, i * GAP))));
  const lat = [];
  console.log(`ошибок подключения ${connErr}; подключение ${opened}: ${((Date.now() - t0) / 1000).toFixed(1)} с, init в среднем ${(initBytes / n / 1024).toFixed(1)} КБ`);
  for (let i = 0; i < n; i += 2) { const a = users[i], b = users[i + 1] || users[0]; if (!a.me || !b.me) continue; const r = await a.call('dm.open', { user: b.me }); a.chat = b.chat = r.r && r.r.chat.id; }
  let sent = 0, errors = 0; const health = [], gap = 60000 / +RATE;
  const timers = users.map(u => setTimeout(function tick() { if (u.chat) { sent++; u.call('msg.send', { chat: u.chat, text: 't' + Date.now() }).then(r => { if (r.e) errors++; }); } u.t = setTimeout(tick, gap); }, Math.random() * gap));
  const hi = setInterval(() => get('/api/health').then(r => health.push(r.ms)).catch(() => health.push(9999)), 1000);
  await new Promise(r => setTimeout(r, +SEC * 1000));
  clearInterval(hi); timers.forEach(clearTimeout); users.forEach(u => clearTimeout(u.t));
  await new Promise(r => setTimeout(r, 1500));
  console.log(`N=${n} отправлено=${sent} (${(sent / +SEC).toFixed(0)}/с) ошибок=${errors} доставка мс p50=${pct(lat, .5)} p95=${pct(lat, .95)} p99=${pct(lat, .99)} max=${Math.max(0, ...lat)} | health мс p50=${pct(health, .5)} p95=${pct(health, .95)} max=${Math.max(0, ...health)}`);
  users.forEach(u => u.ws.close()); setTimeout(() => process.exit(0), 500);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
