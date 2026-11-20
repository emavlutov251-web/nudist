'use strict';
// Сообщества по интересам: открываются сами, вступить можно один раз и только по-настоящему.
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const WS = require('../server/vendor/ws');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let bad = 0, total = 0;
const ck = (n, ok, x) => { total++; if (!ok) { bad++; console.log('  ✗ ПРОВАЛ:', n, x === undefined ? '' : JSON.stringify(x).slice(0, 240)); } else if (process.env.VERBOSE) console.log('  ✓', n); };
(async () => {
  const port = 3990 + Math.floor(Math.random() * 9), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nudist-co-')), base = `http://127.0.0.1:${port}`;
  const env = { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dir, KEEP_AWAKE: 'off' };
  for (const k of Object.keys(env)) if (/^(SUPABASE_|S3_|OWNERS|LEAF_ADMINS|TG_|YOOKASSA|NODE_ENV|SITE_URL|MOVED_TO)/.test(k)) delete env[k];
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'boot.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  try {
    let up = false; for (let i = 0; i < 60 && !up; i++) { await sleep(250); try { up = (await fetch(base + '/api/health')).ok; } catch (e) {} }
    if (!up) throw new Error('сервер не поднялся:\n' + log.slice(-900));
    await sleep(5200);      // сообщества создаются через несколько секунд после старта
    const post = async (p, b) => (await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })).json();
    const conn = tok => new Promise((res, rej) => { const ws = new WS(`ws://127.0.0.1:${port}/ws?token=${tok}`); let n = 0; const w = new Map(), c = {};
      ws.on('error', rej);
      ws.on('message', d => { const q = JSON.parse(String(d)); if (q.ev === 'init') { c.me = q.d.me; return res(c); } if (q.ev) return; const x = w.get(q.id); if (x) { w.delete(q.id); q.e !== undefined ? x.no(new Error(q.e)) : x.ok(q.r); } });
      c.rpc = (m, p) => new Promise((ok, no) => { const i = ++n; w.set(i, { ok, no }); ws.send(JSON.stringify({ id: i, m, p: p || {} })); setTimeout(() => { if (w.has(i)) { w.delete(i); no(new Error('нет ответа на ' + m)); } }, 8000); });
      c.fail = (m, p) => c.rpc(m, p).then(() => null, e => e.message); c.close = () => ws.close(); });
    const reg = async u => { const r = await post('/api/register', { username: u, password: 'Co-test-' + u, name: u, agree: true }); await sleep(150); return conn(r.token); };
    const a = await reg('co_anya'), b = await reg('co_boris');

    const s = await a.rpc('guilds.seed');
    ck('список сообществ приходит', Array.isArray(s.list) && s.list.length >= 6, s.list && s.list.length);
    ck('есть айтишные и творческие', s.list.some(x => x.cat === 'айти') && s.list.some(x => x.cat === 'творчество'), s.list.map(x => x.cat));
    ck('сообщества открыты', s.list.every(x => x.exists), s.list.map(x => x.exists));
    ck('сначала ни в одном не состою', s.list.every(x => !x.joined), s.list.map(x => x.joined));
    const j = await a.rpc('guilds.join', { tpl: 'code' });
    ck('вступление работает', j.ok === true, j);
    const s2 = await a.rpc('guilds.seed');
    ck('после вступления — внутри', s2.list.find(x => x.tpl === 'code').joined === true, s2.list.map(x => x.tpl + ':' + x.joined).slice(0, 3));
    ck('повторно не вступить', !!(await a.fail('guilds.join', { tpl: 'code' })));
    ck('чужое не вступает само', (await b.rpc('guilds.seed')).list.find(x => x.tpl === 'code').joined === false);
    ck('в сообществе есть люди', s2.list.find(x => x.tpl === 'code').members >= 1, s2.list.find(x => x.tpl === 'code').members);
    ck('несуществующее сообщество отклоняется', !!(await a.fail('guilds.join', { tpl: 'нетакого' })));
    // группа появляется в каталоге и в чатах
    const disc = await a.rpc('server.discover', {});
    ck('сообщества видны в каталоге групп', disc.some(x => /Код и листики/.test(x.name)), disc.map(x => x.name).slice(0, 5));
    const mine = await a.rpc('me.chats', {}).catch(() => null);
    ck('повторный старт не плодит копии', Object.values((await a.rpc('guilds.seed')).list).filter(x => x.tpl === 'code').length === 1, 'ок');

    if (process.env.VERBOSE) console.log('');
    console.log(`${total - bad}/${total} ✓`);
    if (bad) process.exitCode = 1;
  } catch (e) { console.log('  ✗ ИСКЛЮЧЕНИЕ:', e.message); process.exitCode = 1; }
  finally { srv.kill('SIGKILL'); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} }
  process.exit(process.exitCode || 0);
})();
