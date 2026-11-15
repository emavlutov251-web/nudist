'use strict';
// Нагрузочная проверка: как сервер ведёт себя, когда база большая и люди пишут одновременно.
// Сама поднимает сервер на временной папке, боевые данные не трогает.
//   node scripts/load-test.js                — три размера базы: 100 тыс., 500 тыс. и 1 млн сообщений
//   node scripts/load-test.js 200000 5000    — свой размер: сообщений и аккаунтов
// Печатает: размер базы, время запуска, память, цену одного сохранения, задержку ответа на отправку сообщения.
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const WS = require('../server/vendor/ws');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0; };

async function boot(dir) {
  const port = 3500 + Math.floor(Math.random() * 90), base = `http://127.0.0.1:${port}`;
  const env = { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dir, KEEP_AWAKE: 'off' };
  for (const k of Object.keys(env)) if (/^(SUPABASE_|S3_|OWNERS|LEAF_ADMINS|TG_BOT|YOOKASSA|NODE_ENV)/.test(k)) delete env[k];
  const t0 = Date.now(), srv = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'boot.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  let up = false; for (let i = 0; i < 600 && !up; i++) { await sleep(100); try { up = (await fetch(base + '/api/health')).ok; } catch (e) { /* ждём */ } }
  if (!up) throw new Error('сервер не поднялся: ' + log.slice(-800));
  const stop = () => new Promise(r => { srv.on('exit', r); srv.kill('SIGTERM'); setTimeout(r, 60000); });
  const conn = tok => new Promise((res, rej) => {
    const ws = new WS(`ws://127.0.0.1:${port}/ws?token=${tok}`); let n = 0; const wait = new Map(), c = {};
    ws.on('error', rej);
    ws.on('message', d => { const q = JSON.parse(String(d)); if (q.ev === 'init') { c.me = q.d.me; return res(c); } if (q.ev) return; const w = wait.get(q.id); if (w) { wait.delete(q.id); q.e !== undefined ? w.no(new Error(q.e)) : w.ok(q.r); } });
    c.rpc = (m, p) => new Promise((ok, no) => { const i = ++n; wait.set(i, { ok, no }); ws.send(JSON.stringify({ id: i, m, p: p || {} })); });
    c.close = () => ws.close();
  });
  const post = async (p, body) => (await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
  return { base, bootMs: Date.now() - t0, stop, conn, post };
}

async function run(MSGS, USERS) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nudist-load-'));
  try {
    // 1) маленькая настоящая база: 20 человек, одна группа, по сообщению от каждого — чтобы взять с них образцы записей
    let S = await boot(dir); const toks = [];
    for (let i = 0; i < 20; i++) toks.push((await S.post('/api/register', { username: 'load_' + i, password: 'Load-test-12345', name: 'Нагрузка ' + i, agree: true })).token);
    let cs = []; for (const t of toks) cs.push(await S.conn(t));
    const grp = await cs[0].rpc('chat.create', { type: 'group', title: 'Нагрузка', members: cs.slice(1).map(c => c.me.id) });
    for (const c of cs) await c.rpc('msg.send', { chat: grp.id, text: 'Сообщение обычной длины: привет, как дела, что нового? Увидимся вечером на пляже.' });
    cs.forEach(c => c.close()); await S.stop();
    // 2) раздуваем её до нужного размера, не меняя устройства записей
    const file = path.join(dir, 'db.json'), db = JSON.parse(fs.readFileSync(file, 'utf8'));
    const tplU = Object.values(db.users).find(u => u.username === 'load_1'), list = db.msgs[grp.id], tplM = list.filter(m => m.type !== 'service'), chat = db.chats[grp.id];
    for (let i = 0; i < USERS; i++) { const id = 'LU' + i.toString(36).padStart(9, '0'); db.users[id] = { ...tplU, id, username: 'ghost_' + i, name: 'Призрак ' + i, chats: [], pass: tplU.pass }; }
    let seq = chat.seq || list.length, ts = Date.now() - MSGS * 1000;
    while (list.length < MSGS) { const t = tplM[list.length % tplM.length]; seq++; list.push({ ...t, id: 'LM' + seq.toString(36).padStart(9, '0'), seq, ts: ts += 1000 }); }
    chat.seq = seq; if (chat.last) chat.last = { ...chat.last, seq };
    fs.writeFileSync(file, JSON.stringify(db));
    const mb = fs.statSync(file).size / 1048576;
    // 3) запуск на большой базе и живая нагрузка: 20 человек пишут в группу примерно 40 сообщений в секунду
    S = await boot(dir); cs = []; for (const t of toks) cs.push(await S.conn(t));
    const lat = [], health = []; let stopPing = false;
    (async () => { while (!stopPing) { const t = Date.now(); try { await fetch(S.base + '/api/health'); health.push(Date.now() - t); } catch (e) { health.push(9999); } await sleep(50); } })();
    const t0 = Date.now(); let sent = 0, errs = 0;
    await Promise.all(cs.map(async (c, k) => { for (let i = 0; i < 60; i++) { const t = Date.now(); try { await c.rpc('msg.send', { chat: grp.id, text: `нагрузка ${k}-${i}` }); lat.push(Date.now() - t); sent++; } catch (e) { errs++; } await sleep(480); } }));
    const secs = (Date.now() - t0) / 1000;
    const th = Date.now(); await cs[1].rpc('msg.history', { chat: grp.id }); const histMs = Date.now() - th;
    const ts2 = Date.now(); await cs[1].rpc('msg.search', { chat: grp.id, q: 'нагрузка 3-5' }); const searchMs = Date.now() - ts2;
    await sleep(1500); stopPing = true;
    const mon = await cs[0].rpc('admin.monitor', {}).catch(() => null);      // первый зарегистрированный — админ
    const rssMb = mon ? Math.round(mon.rss / 1048576) : 0, saveMs = mon && (mon.saveMs !== undefined ? mon.saveMs : (mon.db || {}).saveMs);
    cs.forEach(c => c.close()); const tS = Date.now(); await S.stop(); const stopMs = Date.now() - tS;
    return { MSGS, USERS, mb, bootMs: S.bootMs, rssMb, saveMs, sent, errs, rate: sent / secs, p50: pct(lat, 0.5), p95: pct(lat, 0.95), max: Math.max(...lat), hp95: pct(health, 0.95), hmax: Math.max(...health), histMs, searchMs, stopMs };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

(async () => {
  const sizes = process.argv[2] ? [[+process.argv[2], +process.argv[3] || 2000]] : [[100000, 2000], [500000, 10000], [1000000, 20000]];
  console.log('сообщений | аккаунтов | база, МБ | запуск, с | память, МБ | сохранение, мс | отправка p50/p95/макс, мс | пинг p95/макс, мс | история, мс | поиск, мс | остановка, с | ошибок');
  for (const [m, u] of sizes) {
    const r = await run(m, u);
    console.log([r.MSGS, r.USERS, r.mb.toFixed(0), (r.bootMs / 1000).toFixed(1), r.rssMb, r.saveMs === undefined ? '?' : r.saveMs, `${r.p50}/${r.p95}/${r.max}`, `${r.hp95}/${r.hmax}`, r.histMs, r.searchMs, (r.stopMs / 1000).toFixed(1), r.errs].join(' | '));
  }
})().then(() => process.exit(0), e => { console.error('✗ ' + (e.stack || e.message)); process.exit(1); });
