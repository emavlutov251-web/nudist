// Проверка «магазинной сборки»: UA со store/rustore → оплата скрыта и не создаётся;
// UA сайта → всё как раньше. Плюс /rules и тексты 18+.
// Проверка магазинной сборки: телефон из RuStore (UA «store/rustore») не видит и не может создать оплату
// картой, а такая же сборка с сайта — видит. Заодно /rules и подтверждение 18+ при регистрации.
// Поднимает свой сервер на временной базе, как smoke.js. Запуск: node scripts/store-build-test.js
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const PORT = 3910 + Math.floor(Math.random() * 60), BASE = 'http://127.0.0.1:' + PORT;
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nudist-store-'));
const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: DIR, KEEP_AWAKE: 'off', SITE_URL: 'http://127.0.0.1:' + PORT, YOOKASSA_SHOP_ID: 'test', YOOKASSA_SECRET: 'test' }, stdio: 'ignore' });
process.on('exit', () => { try { srv.kill(); } catch (e) {} });
const UA_STORE = 'Mozilla/5.0 (Linux; Android 14) NudistAndroid/47 store/rustore';
const UA_SITE  = 'Mozilla/5.0 (Linux; Android 14) NudistAndroid/47 store/site';
const post = (p, b, ua) => fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': ua || UA_SITE }, body: JSON.stringify(b) }).then(r => r.json());
const WS = require('../server/vendor/ws');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
(async () => {
  for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE + '/api/health')).ok) break; } catch (e) {} await sleep(250); }
  const u = 'st' + Date.now().toString(36);
  const reg = await post('/api/register', { username: u, password: 'Store-test-12345', name: 'S', agree: true, adult: true }, UA_SITE);
  if (!reg.token) { console.log('регистрация не прошла:', reg); process.exit(1); }
  const conn = ua => new Promise((res, rej) => {
    const ws = new WS(`ws://127.0.0.1:${PORT}/ws?token=${reg.token}`, { headers: { 'user-agent': ua } });
    let id = 0; const p = new Map();
    ws.on('message', d => { const m = JSON.parse(d); if (m.id && p.has(m.id)) { p.get(m.id)(m); p.delete(m.id); } });
    ws.on('open', () => res({ call: (m, a) => new Promise(r => { const i = ++id; p.set(i, r); ws.send(JSON.stringify({ id: i, m, p: a || {} })); }), ws }));
    ws.on('error', rej);
  });
  // сайт
  const site = await conn(UA_SITE);
  const i1 = await site.call('pay.info');
  const R = x => x.r || x.d || {};
  ok(R(i1).storeBuild === false, 'сайт: storeBuild=false');
  const i2 = await site.call('pay.create', { item: 'plan_plus' });
  ok(!/RuStore/.test(JSON.stringify(i2)), 'сайт: запрет магазина не срабатывает');
  site.ws.close();
  // магазин
  const st = await conn(UA_STORE);
  const i3 = await st.call('pay.info');
  ok(R(i3).storeBuild === true, 'магазин: storeBuild=true');
  ok(R(i3).enabled === false, 'магазин: карта внутри приложения не предлагается (enabled=false)');
  // Карту внутри приложения не проводим: pay.create из магазина запрещён,
  // вместо него приложение берёт одноразовую ссылку на оплату в браузере.
  const i4 = await st.call('pay.create', { item: 'plan_plus' });
  ok(/\bRuStore\b|магазин/i.test(JSON.stringify(i4)), 'магазин: оплата картой внутри приложения запрещена');
  const i5 = await st.call('pay.link', { item: 'plan_plus' });
  ok(i5.r && /\/buy#k=[a-f0-9]{20,64}$/.test(i5.r.url || ''), 'магазин: выдаётся ссылка на оплату в браузере');
  st.ws.close();
  // /rules
  const r = await fetch(BASE + '/rules', { redirect: 'manual' });
  ok(r.status === 302 && (r.headers.get('location') || '') === '/offer#content', '/rules → 302 /offer#content');
  // 18+ на регистрации
  const no = await post('/api/register', { username: 'x' + Date.now().toString(36), password: 'Store-test-12345', name: 'X', agree: true }, UA_SITE);
  ok(/18 лет/.test(JSON.stringify(no)), 'без adult: регистрация отклонена с текстом про 18 лет');
  console.log(`\n${fail ? 'ПРОВАЛОВ: ' + fail : 'Всё верно'}: ${pass} проверок`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
