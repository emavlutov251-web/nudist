// Сквозная проверка покупки из магазинной сборки: ссылка → просмотр → оплата → повторное использование.
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const WS = require('../server/vendor/ws');
const PORT = 3920 + Math.floor(Math.random() * 40), BASE = 'http://127.0.0.1:' + PORT;
const UA = 'Mozilla/5.0 (Linux; Android 14) NudistAndroid/48 store/rustore';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nudist-buy-'));
const srv = spawn(process.execPath, [require('path').join(__dirname, '..', 'server', 'index.js')], {
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: DIR, KEEP_AWAKE: 'off',
         SITE_URL: BASE, YOOKASSA_SHOP_ID: 'test', YOOKASSA_SECRET: 'test', YOOKASSA_API: 'http://127.0.0.1:9' }, stdio: 'ignore' });
process.on('exit', () => { try { srv.kill(); } catch (e) {} });
const post = (p, b, ua) => fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': ua || UA }, body: JSON.stringify(b || {}) }).then(r => r.json());
(async () => {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + '/api/health')).ok) break; } catch (e) {} await sleep(250); }
  // 1. страница /buy отдаётся
  const page = await fetch(BASE + '/buy');
  const html = await page.text();
  ok(page.ok && html.includes('Оплата в браузере'), '/buy отдаётся');
  ok(!/no-store/.test(page.headers.get('cache-control') || '') === false, '/buy не кешируется');
  // 2. регистрация и ссылка из приложения
  const u = 'by' + Date.now().toString(36);
  const reg = await post('/api/register', { username: u, password: 'Buy-test-12345', name: 'B', agree: true, adult: true });
  const conn = await new Promise((res, rej) => {
    const ws = new WS(`ws://127.0.0.1:${PORT}/ws?token=${reg.token}`, { headers: { 'user-agent': UA } });
    let id = 0; const p = new Map();
    ws.on('message', d => { const m = JSON.parse(d); if (m.id && p.has(m.id)) { p.get(m.id)(m); p.delete(m.id); } });
    ws.on('open', () => res({ call: (m, a) => new Promise(r => { const i = ++id; p.set(i, r); ws.send(JSON.stringify({ id: i, m, p: a || {} })); }), ws }));
    ws.on('error', rej);
  });
  const link = await conn.call('pay.link', { item: 'plan_plus' });
  const url = link.r && link.r.url;
  ok(!!url && url.includes('/buy#k='), 'приложение получило ссылку на браузер');
  const key = url.split('#k=')[1];
  ok((link.r && link.r.min) > 0, 'у ссылки есть срок жизни');
  conn.ws.close();
  // 3. просмотр по ссылке — без списаний
  const view = await post('/api/pay/site', { k: key });
  ok(view.title && view.rub === 99, 'страница видит товар и цену (99 ₽)');
  const view2 = await post('/api/pay/site', { k: key });
  ok(!!view2.title, 'ссылку можно открыть повторно (просмотр не гасит)');
  // 4. оплата: платёжный сервис недоступен — но ссылка должна сработать один раз
  const pay1 = await post('/api/pay/pay', { k: key });
  ok(/не ответил|непонятно|Деньги не списаны/i.test(JSON.stringify(pay1)), 'при недоступном сервисе честная ошибка');
  const pay2 = await post('/api/pay/pay', { k: key });
  ok(/устарела|ещё раз/i.test(JSON.stringify(pay2)), 'после попытки ссылка погашена');
  // 5. поддельный ключ
  const bad = await post('/api/pay/site', { k: 'x'.repeat(24) });
  ok(/устарела|ещё раз/i.test(JSON.stringify(bad)), 'чужой ключ не работает');
  // 6. ссылку нельзя получить из сборки с сайта
  const u2 = 'bs' + Date.now().toString(36);
  const reg2 = await post('/api/register', { username: u2, password: 'Buy-test-12345', name: 'S', agree: true, adult: true }, 'x NudistAndroid/48 store/site');
  const conn2 = await new Promise((res, rej) => {
    const ws = new WS(`ws://127.0.0.1:${PORT}/ws?token=${reg2.token}`, { headers: { 'user-agent': 'x NudistAndroid/48 store/site' } });
    let id = 0; const p = new Map();
    ws.on('message', d => { const m = JSON.parse(d); if (m.id && p.has(m.id)) { p.get(m.id)(m); p.delete(m.id); } });
    ws.on('open', () => res({ call: (m, a) => new Promise(r => { const i = ++id; p.set(i, r); ws.send(JSON.stringify({ id: i, m, p: a || {} })); }), ws }));
    ws.on('error', rej);
  });
  const l2 = await conn2.call('pay.link', { item: 'plan_plus' });
  ok(/только для приложения из магазина/.test(JSON.stringify(l2)), 'сборке с сайта ссылка не выдаётся');
  conn2.ws.close();
  console.log(`\n${fail ? 'ПРОВАЛОВ: ' + fail : 'Всё верно'}: ${pass} проверок`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
