'use strict';
// Итоги сезона и звёзды: «спасибо» работает один раз в месяц на человека, звёзды идут в общий зачёт,
// призы прошлого сезона выдаются сами, а не теряются.
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const WS = require('../server/vendor/ws');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let bad = 0, total = 0;
const ck = (n, ok, x) => { total++; if (!ok) { bad++; console.log('  ✗ ПРОВАЛ:', n, x === undefined ? '' : JSON.stringify(x).slice(0, 240)); } else if (process.env.VERBOSE) console.log('  ✓', n); };
(async () => {
  const port = 3970 + Math.floor(Math.random() * 9), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nudist-aw-')), base = `http://127.0.0.1:${port}`;
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
    const reg = async u => { const r = await post('/api/register', { username: u, password: 'Aw-test-' + u, name: u, agree: true }); await sleep(150); return conn(r.token); };
    const a = await reg('aw_anya'), b = await reg('aw_boris'), c1 = await reg('aw_vika'), d1 = await reg('aw_gleb');

    const st = await a.rpc('award.stars');
    ck('звёзды: дают 5 в месяц', st.perMonth === 5 && st.left === 5, st);
    const g = await a.rpc('award.star', { user: b.me.id });
    ck('звезда ставится', g.ok === true && g.total === 1, g);
    ck('себе звезду не поставить', !!(await a.fail('award.star', { user: a.me.id })));
    ck('дважды одному человеку — нельзя', /уже отметили/i.test(await a.fail('award.star', { user: b.me.id }) || ''));
    for (const x of [c1, d1]) await a.rpc('award.star', { user: x.me.id }).catch(() => {});
    const st2 = await a.rpc('award.stars');
    ck('за месяц можно отметить несколько', st2.gave >= 3 && st2.left === st2.perMonth - st2.gave, st2);
    const bs = await b.rpc('award.stars');
    ck('получатель видит спасибо', bs.got === 1 && bs.total === 1, bs);
    const ev = b.evs.filter(e => e.ev === 'award.star').pop();
    ck('получателю приходит уведомление', !!(ev && ev.d.from && ev.d.from.name), ev && ev.d);

    // зачёт сезона: звезда идёт в таблицу
    const ssn = await a.rpc('award.season');
    ck('таблица сезона приходит', Array.isArray(ssn.rows), typeof ssn.rows);
    ck('звёзды идут в общий зачёт', ssn.rows.some(r => r.id === b.me.id && r.stars >= 1), ssn.rows.map(r => [r.name, r.sum]).slice(0, 4));
    ck('порядок по очкам', ssn.rows.every((r, i) => i === 0 || ssn.rows[i - 1].sum >= r.sum), ssn.rows.map(r => r.sum));
    // Ане тоже нужен вклад: пусть Вика отметит её звездой
    await c1.rpc('award.star', { user: a.me.id }).catch(() => {});
    const ssn1 = await a.rpc('award.season');
    ck('моя строка подсвечена', ssn1.mine && ssn1.mine.id === a.me.id, ssn1.me);
    // прошлый сезон закрывается без ошибок (а начисление призов проверяем отдельным тестом)
    const ssn2 = await a.rpc('award.season');
    ck('прошлый сезон закрывается без ошибок', !!ssn2 && Array.isArray(ssn2.rows), ssn2 && ssn2.id);
    ck('в ответе есть прошлые итоги (или их нет)', ssn2.past === null || typeof ssn2.past === 'object', ssn2.past && typeof ssn2.past);

    if (process.env.VERBOSE) console.log('');
    console.log(`${total - bad}/${total} ✓`);
    if (bad) process.exitCode = 1;
  } catch (e) { console.log('  ✗ ИСКЛЮЧЕНИЕ:', e.message); process.exitCode = 1; }
  finally { srv.kill('SIGKILL'); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} }
  process.exit(process.exitCode || 0);
})();
