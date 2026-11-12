'use strict';
// Быстрая проверка перед выкладкой: поднимает сервер на временной базе и проходит главный путь —
// здоровье, главная страница, регистрация, вход, WebSocket, загрузка и скачивание файла.
// Запуск: node scripts/smoke.js   (код выхода 0 — всё работает)
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const WS = require('../server/vendor/ws');

const PORT = 3900 + Math.floor(Math.random() * 90);
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nudist-smoke-'));
const BASE = `http://127.0.0.1:${PORT}`;
const env = { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: DIR, KEEP_AWAKE: 'off' };
for (const k of Object.keys(env)) if (/^(SUPABASE_|S3_)/.test(k)) delete env[k];      // тест никогда не трогает боевые данные

const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'boot.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ok = (cond, what) => { if (!cond) throw new Error(what); console.log('  ✓', what); };
const post = (p, body, headers) => fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body) });

(async () => {
  let up = false;
  for (let i = 0; i < 40 && !up; i++) { await sleep(250); try { up = (await fetch(BASE + '/api/health')).ok; } catch (e) { /* ещё не поднялся */ } }
  ok(up, 'сервер поднялся и отвечает на /api/health');
  const page = await fetch(BASE + '/'); ok(page.ok && (await page.text()).includes('<html'), 'главная страница отдаётся');
  const cred = { username: 'smoke_' + Date.now().toString(36), password: 'Leaf-smoke-12345', name: 'Smoke' };
  const reg = await (await post('/api/register', cred)).json(); ok(reg.token, 'регистрация выдаёт сессию');
  const login = await (await post('/api/login', cred)).json(); ok(login.token, 'вход по паролю работает');
  const init = await new Promise((res, rej) => {
    const ws = new WS(`ws://127.0.0.1:${PORT}/ws?token=${login.token}`); const t = setTimeout(() => rej(new Error('WebSocket молчит')), 5000);
    ws.on('message', m => { clearTimeout(t); ws.close(); res(JSON.parse(String(m))); }); ws.on('error', rej);
  });
  ok(init.ev === 'init' && init.d && init.d.me && init.d.me.username === cred.username, 'WebSocket подключается и узнаёт пользователя');
  const blob = require('crypto').randomBytes(200000);
  const upl = await (await post('/api/upload', blob, { authorization: 'Bearer ' + login.token, 'x-name': 'smoke.bin', 'content-type': 'application/octet-stream' })).json();
  ok(upl.url && upl.size === blob.length, 'файл загружается');
  const back = Buffer.from(await (await fetch(BASE + upl.url, { headers: { authorization: 'Bearer ' + login.token } })).arrayBuffer());
  ok(back.equals(blob), 'файл скачивается без искажений');
  console.log('Готово: всё работает.');
})().then(() => 0, e => { console.error('✗ ' + e.message + '\n--- журнал сервера ---\n' + log.slice(-2000)); return 1; })
  .then(code => { srv.kill('SIGTERM'); setTimeout(() => { try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) { /* не страшно */ } process.exit(code); }, 400); });
