// Сервер должен пережить любой мусор от клиента: обрывки JSON, странные поля, чужие методы.
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const WS = require('../server/vendor/ws');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const port = 3983, dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fz-')), base = `http://127.0.0.1:${port}`;
  const srv = spawn(process.execPath, [require('path').join(__dirname, '..', 'server', 'boot.js')], { env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dir, KEEP_AWAKE: 'off' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  let dead = false; srv.on('exit', () => { dead = true; });
  let up = false; for (let i = 0; i < 60 && !up; i++) { await sleep(250); try { up = (await fetch(base + '/api/health')).ok; } catch (e) {} }
  const post = async (p, b) => (await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })).json();
  const tok = (await post('/api/register', { username: 'fz_one', password: 'Fuzz-test-1', name: 'a', agree: true, adult: true })).token;
  const ws = new WS(`ws://127.0.0.1:${port}/ws?token=${tok}`);
  await sleep(500);
  const junk = ['{', 'null', '[]', '{"id":1}', '{"id":2,"m":null}', '{"id":3,"m":123}', '{"id":4,"m":"cards.get","p":"строка"}', '{"id":5,"m":"cards.get","p":[1,2]}',
    '{"id":6,"m":"dating.save","p":{"year":"abc","tags":"нет"}}', '{"id":7,"m":"rave.new","p":{"title":{"a":1}}}', '{"id":8,"m":"rp.pos","p":{"x":"далеко"}}',
    '{"id":9,"m":"rp.save","p":{"save":[1,2,3]}}', '{"id":10,"m":"cards.play","p":{"i":-5}}', '{"id":11,"m":"","p":{}}', '{"id":12,"m":"__proto__"}',
    '{"id":13,"m":"constructor"}', '{"id":14,"m":"cards.invite","p":{"to":"нет-такого"}}', '{"id":15,"m":"rave.invite","p":{"user":null}}'];
  for (const j of junk) ws.send(j);
  ws.send(Buffer.from([0, 1, 2, 3]));
  await sleep(2000);
  let alive = false; try { alive = (await (await fetch(base + '/api/health')).json()).ok; } catch (e) {}
  const answered = await new Promise(r => { try { ws.send(JSON.stringify({ id: 99, m: 'me.get', p: {} })); } catch (e) {} setTimeout(() => r(true), 1200); });
  console.log('сервер после мусора:', alive && !dead ? 'живой' : 'УПАЛ', '| отвечает:', answered);
  if (!alive) console.log(log.split('\n').slice(-14).join('\n'));
  srv.kill('SIGKILL'); process.exit(alive && !dead ? 0 : 1);
})();
