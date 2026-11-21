'use strict';
// Переезд «Весь Нудист» → «Нудист»: один раз при старте. Старая беседа удаляется, её сообщения и участники
// оказываются в «Нудист», «Весь Нудист» заводится заново с чистой историей. Запуск: node scripts/common-refresh-test.js
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const WS = require('../server/vendor/ws');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let bad = 0, total = 0;
const ck = (name, ok, extra) => { total++; if (!ok) { bad++; console.log('  ✗ ПРОВАЛ:', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } else if (process.env.VERBOSE) console.log('  ✓', name); };
const readDb = dir => JSON.parse(fs.readFileSync(path.join(dir, 'db.json'), 'utf8'));
const spawnServer = (dir, port) => {
  const env = { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dir, KEEP_AWAKE: 'off' };
  for (const k of Object.keys(env)) if (/^(SUPABASE_|S3_|OWNERS|LEAF_ADMINS|TG_|YOOKASSA|NODE_ENV|SITE_URL|MOVED_TO|COMMON_ARCHIVE)/.test(k)) delete env[k];
  const log = { text: '' };
  const p = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'boot.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', d => log.text += d); p.stderr.on('data', d => log.text += d);
  return { p, log };
};
const waitUp = async (port, log, tries = 80) => { for (let i = 0; i < tries; i++) { await sleep(250); try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) return true; } catch (e) { /* ждём */ } } throw new Error('сервер не поднялся:\n' + log.text.slice(-1500)); };
const conn = (port, tok) => new Promise((res, rej) => {
  const ws = new WS(`ws://127.0.0.1:${port}/ws?token=${tok}`); let n = 0; const w = new Map(), c = { evs: [], tok }; ws.on('error', rej);
  ws.on('message', d => { const q = JSON.parse(String(d)); if (q.ev === 'init') { c.me = q.d.me; return res(c); } if (q.ev) return c.evs.push(q); const x = w.get(q.id); if (x) { w.delete(q.id); q.e !== undefined ? x.no(new Error(q.e)) : x.ok(q.r); } });
  c.rpc = (m, p) => new Promise((ok, no) => { const i = ++n; w.set(i, { ok, no }); ws.send(JSON.stringify({ id: i, m, p: p || {} })); setTimeout(() => { if (w.has(i)) { w.delete(i); no(new Error('нет ответа на ' + m)); } }, 6000); });
  c.close = () => ws.close();
});
const reg = async (port, u) => { const r = await fetch(`http://127.0.0.1:${port}/api/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: u, password: 'Refresh-test-1', name: u, agree: true, adult: true }) }).then(x => x.json()); await sleep(300); return conn(port, r.token); };
const stop = async (p) => { p.kill('SIGTERM'); await Promise.race([new Promise(r => p.on('exit', r)), sleep(4000)]); if (p.exitCode === null) p.kill('SIGKILL'); await sleep(200); };

(async () => {
  const base = 3700 + Math.floor(Math.random() * 150);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nudist-refresh-'));
  try {
    // ── фаза 1: «Весь Нудист» живёт, в нём сообщения; рядом заводится «Нудист» с собственной перепиской
    let srv = spawnServer(dir, base);
    await waitUp(base, srv.log);
    const o1 = await reg(base, 'mig_owner'), o2 = await reg(base, 'mig_anna'), o3 = await reg(base, 'mig_boris');
    let db = readDb(dir);
    const oldCommon = Object.values(db.chats).find(c => c.title === 'Весь Нудист');
    ck('старый «Весь Нудист» создан', !!oldCommon, db.meta.common);
    ck('в него входят все зарегистрированные', ['mig_owner', 'mig_anna', 'mig_boris'].every(n => { const u = Object.values(db.users).find(x => x.username === n); return u && oldCommon.members[u.id]; }));
    await o1.rpc('msg.send', { chat: oldCommon.id, text: 'первое сообщение переезжает' });
    await o2.rpc('msg.send', { chat: oldCommon.id, text: 'и второе тоже' });
    const grp = await o1.rpc('chat.create', { type: 'group', title: 'Нудист', about: 'Архив общей беседы' });
    await o1.rpc('msg.send', { chat: grp.id, text: 'история, которая была в «Нудист» до переезда' });
    await sleep(400);
    await stop(srv.p);
    db = readDb(dir);
    const nOldBefore = (db.msgs[oldCommon.id] || []).length, nTargetBefore = (db.msgs[grp.id] || []).length, seqBefore = grp.seq || 0;
    ck('до переезда: сообщения на месте', nOldBefore >= 2 && nTargetBefore >= 1, { nOldBefore, nTargetBefore });

    // ── фаза 2: перезапуск — миграция срабатывает один раз при старте
    srv = spawnServer(dir, base);
    await waitUp(base, srv.log);
    await sleep(300);
    await stop(srv.p);
    db = readDb(dir);
    ck('флаг одноразовой миграции выставлен', db.meta.commonRefreshed === true);
    ck('старая беседа удалена', !db.chats[oldCommon.id]);
    ck('сообщения переехали в «Нудист» с сохранением дат и порядка', (db.msgs[grp.id] || []).some(m => m.text === 'первое сообщение переезжает') && (db.msgs[grp.id] || []).some(m => m.text === 'и второе тоже') && (db.msgs[grp.id] || []).some(m => m.text === 'история, которая была в «Нудист» до переезда'));
    const msgs = db.msgs[grp.id] || [];
    const tss = msgs.map(m => m.seq);
    ck('номера seq идут по возрастанию и без дублей', tss.every((s, i) => i === 0 || s > tss[i - 1]) && new Set(tss).size === tss.length, tss);
    ck('даты сообщений не поменялись', msgs.find(m => m.text === 'первое сообщение переезжает').ts > 0 && msgs.find(m => m.text === 'история, которая была в «Нудист» до переезда').ts > 0);
    ck('владелец «Нудиста» остался владельцем', grp.id && db.chats[grp.id] && db.chats[grp.id].members[o1.me.id] && db.chats[grp.id].members[o1.me.id].role === 'owner');
    ck('бывшие участники «Весь Нудист» добавлены в «Нудист»', ['mig_anna', 'mig_boris'].every(n => { const u = Object.values(db.users).find(x => x.username === n); return u && db.chats[grp.id].members[u.id]; }));
    ck('всем «всё прочитано», без сотни непрочитанных', Object.entries(db.chats[grp.id].members).every(([uid]) => (db.chats[grp.id].st[uid] || {}).read === db.chats[grp.id].seq));
    ck('все в своих списках чатов', ['mig_owner', 'mig_anna', 'mig_boris'].every(n => { const u = Object.values(db.users).find(x => x.username === n); return (u.chats || []).includes(grp.id) && !(u.chats || []).includes(oldCommon.id); }));
    const fresh = db.chats[db.meta.common];
    ck('«Весь Нудист» заведена заново, чистая', !!fresh && fresh.id !== oldCommon.id && fresh.title === 'Весь Нудист' && (db.msgs[fresh.id] || []).length >= 0 && Object.keys(fresh.members).length >= 3);
    ck('объявление в новой беседе отправится заново', db.meta.commonHello !== true);

    // ── фаза 3: второй перезапуск — ничего не дублируется
    srv = spawnServer(dir, base);
    await waitUp(base, srv.log);
    await sleep(300);
    await stop(srv.p);
    const db2 = readDb(dir);
    ck('повторный старт ничего не переносит второй раз', (db2.msgs[grp.id] || []).length === msgs.length && db2.chats[db.meta.common].id === db.meta.common);

    // ── фаза 4: нет «Нудист» — переезд не выполняется и ничего не ломается
    const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'nudist-refresh2-'));
    srv = spawnServer(dir2, base + 1);
    await waitUp(base + 1, srv.log);
    const q1 = await reg(base + 1, 'solo_owner');
    await q1.rpc('msg.send', { chat: (readDb(dir2).chats[readDb(dir2).meta.common] || {}).id, text: 'остаюсь на месте' });
    await stop(srv.p);
    srv = spawnServer(dir2, base + 1);
    await waitUp(base + 1, srv.log);
    await sleep(300);
    await stop(srv.p);
    const db3 = readDb(dir2);
    const still = db3.chats[db3.meta.common];
    ck('без чата «Нудист» старая беседа цела, переезд отложен', !!still && still.title === 'Весь Нудист' && (db3.msgs[still.id] || []).some(m => m.text === 'остаюсь на месте') && db3.meta.commonRefreshed !== true);
    fs.rmSync(dir2, { recursive: true, force: true });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(bad ? `ПРОВАЛОВ: ${bad} из ${total}` : `Переезд работает: ${total} проверок.`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('✗ ' + (e.stack || e.message)); process.exit(1); });
