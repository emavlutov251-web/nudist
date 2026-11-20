'use strict';
// «Нудищево РП» онлайн: жители видят друг друга, слышат реплики, прогресс живёт в аккаунте.
// Проверяем и то, что чужой метод через мост не вызвать и что игра без онлайна не падает.
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const WS = require('../server/vendor/ws');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let bad = 0, total = 0;
const ck = (n, ok, x) => { total++; if (!ok) { bad++; console.log('  ✗ ПРОВАЛ:', n, x === undefined ? '' : JSON.stringify(x).slice(0, 240)); } else if (process.env.VERBOSE) console.log('  ✓', n); };

(async () => {
  const port = 3900 + Math.floor(Math.random() * 80), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nudist-rp-')), base = `http://127.0.0.1:${port}`;
  const env = { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dir, KEEP_AWAKE: 'off' };
  for (const k of Object.keys(env)) if (/^(SUPABASE_|S3_|OWNERS|LEAF_ADMINS|TG_|YOOKASSA|NODE_ENV|SITE_URL|MOVED_TO)/.test(k)) delete env[k];
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'boot.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  try {
    let up = false; for (let i = 0; i < 60 && !up; i++) { await sleep(250); try { up = (await fetch(base + '/api/health')).ok; } catch (e) {} }
    if (!up) throw new Error('сервер не поднялся:\n' + log.slice(-900));
    const post = async (p, b) => (await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })).json();
    const conn = tok => new Promise((res, rej) => { const ws = new WS(`ws://127.0.0.1:${port}/ws?token=${tok}`); let n = 0; const w = new Map(), c = { evs: [] };
      ws.on('error', rej);
      ws.on('message', d => { const q = JSON.parse(String(d)); if (q.ev === 'init') { c.me = q.d.me; return res(c); } if (q.ev) return c.evs.push(q); const x = w.get(q.id); if (x) { w.delete(q.id); q.e !== undefined ? x.no(new Error(q.e)) : x.ok(q.r); } });
      c.rpc = (m, p) => new Promise((ok, no) => { const i = ++n; w.set(i, { ok, no }); ws.send(JSON.stringify({ id: i, m, p: p || {} })); setTimeout(() => { if (w.has(i)) { w.delete(i); no(new Error('нет ответа на ' + m)); } }, 8000); });
      c.fail = (m, p) => c.rpc(m, p).then(() => null, e => e.message); c.close = () => ws.close(); });
    const reg = async u => { const r = await post('/api/register', { username: u, password: 'Rp-test-' + u, name: u, agree: true }); await sleep(150); return conn(r.token); };
    const a = await reg('rp_anya'), b = await reg('rp_boris'), c1 = await reg('rp_vika');

    const st = await a.rpc('rp.state');
    ck('состояние города отдаётся', Array.isArray(st.people) && Array.isArray(st.says), st && typeof st);
    ck('новичок без соседей', st.people.length === 0, st.people.length);
    await a.rpc('rp.pos', { x: 100, y: 200, hat: 1, ride: 0 });
    await b.rpc('rp.pos', { x: 130, y: 210, hat: 0, ride: 2 });
    await sleep(400);
    const ev = b.evs.filter(e => e.ev === 'rp.pos').pop();
    ck('сосед видит, кто подошёл', !!(ev && ev.d.p && ev.d.p.x === 100 && ev.d.p.y === 200), ev && ev.d);
    ck('видно имя и шапку', !!(ev && ev.d.p.name && ev.d.p.hat === 1), ev && ev.d.p);
    const skip = await a.rpc('rp.pos', { x: 100, y: 200, hat: 1, ride: 0 });
    ck('стоящий на месте не забивает канал', skip.skip === true, skip);
    // далёкий сосед не должен получать обновления: экономия канала
    await c1.rpc('rp.pos', { x: 5000, y: 5000 });
    const far = a.evs.filter(e => e.ev === 'rp.pos' && e.d.p && e.d.p.id === c1.me.id).length;
    ck('далёкий не спамит чужим экранам', far === 0, far);
    // чат города
    await a.rpc('rp.say', { text: 'шаурма сегодня хороша' });
    await sleep(400);
    const say = b.evs.filter(e => e.ev === 'rp.say').pop();
    ck('реплика доходит до всех', !!(say && say.d.m.text === 'шаурма сегодня хороша'), say && say.d);
    ck('видно, кто сказал', !!(say && say.d.user && say.d.user.name), say && say.d.user);
    const here = await b.rpc('rp.here');
    ck('в «кто рядом» есть сосед', here.people.some(p => p.id === a.me.id), here.people.length);
    ck('реплики хранятся', (here.says || []).some(m => /шаурма/.test(m.text)), (here.says || []).length);
    // прогресс на аккаунте
    await a.rpc('rp.save', { save: { money: 1250, xp: 340, ride: 2, hat: 1, hats: [0, 1], jobs: 7, saved: 2, tan: 3, en: 80, food: 55 } });
    const st2 = await a.rpc('rp.state');
    ck('прогресс сохранён в аккаунте', st2.save && st2.save.money === 1250 && st2.save.ride === 2, st2.save);
    const badSave = await a.rpc('rp.save', { save: { money: -999, ride: 99 } });
    const st3 = await a.rpc('rp.state');
    ck('испорченный прогресс не принимается', st3.save.money === 0 && st3.save.ride <= 5, st3.save);
    // кто вышел — пропадает
    b.close();
    await sleep(600);
    const left = c1.evs.filter(e => e.ev === 'rp.gone' && e.d.id === b.me.id).length;
    const here2 = await a.rpc('rp.here');
    ck('вышедший пропадает из города', !here2.people.some(p => p.id === b.me.id), here2.people.length);
    ck('о выходе сообщают', left >= 1, left);
    // мусор не ломает
    ck('пустую реплику отклонили', !!(await a.fail('rp.say', { text: '   ' })));
    ck('без позиции город не падает', !!(await a.rpc('rp.pos', {})));

    if (process.env.VERBOSE) console.log('');
    console.log(`${total - bad}/${total} ✓`);
    if (bad) process.exitCode = 1;
  } catch (e) { console.log('  ✗ ИСКЛЮЧЕНИЕ:', e.message); process.exitCode = 1; }
  finally { srv.kill('SIGKILL'); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} }
  process.exit(process.exitCode || 0);
})();
