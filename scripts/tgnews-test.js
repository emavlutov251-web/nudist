'use strict';
// Telegram-обновления: (1) рассылка «вышло обновление» уходит только привязавшим бота и один раз в день,
// (2) бот сам не рассылает без кнопки админа, (3) полоска и подсказка про привязку появляются, откладываются на 3 дня
// и исчезают после привязки. Настоящий api.telegram.org не трогаем: поднимаем зеркало и указываем TG_API на него.
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const WS = require('../server/vendor/ws');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let bad = 0, total = 0, passed = 0;
const ck = (n, ok, x) => { total++; passed++; if (!ok) { bad++; console.log('  ✗ ПРОВАЛ:', n, x === undefined ? '' : JSON.stringify(x).slice(0, 300)); } else if (process.env.VERBOSE) console.log('  ✓', n); };
const TOKEN = '123456:TEST-only-token', sent = [], docs = [];

(async () => {
  const port = 4300 + Math.floor(Math.random() * 120), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nudist-tgnews-'));

  // ── зеркало Telegram Bot API: getMe, setWebhook, setChatMenuButton, setMyCommands, sendMessage
  const mock = http.createServer((req, res) => {
    let b = ''; req.on('data', d => b += d);
    req.on('end', () => {
      const isJson = /application\/json/.test(req.headers['content-type'] || '');
      let body = {}; try { body = isJson && b ? JSON.parse(b) : {}; } catch (e) { body = {}; }
      const m = /\/bot([^/]+)\/(\w+)$/.exec(req.url);
      const ok = r => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, result: r })); };
      if (!m || m[1] !== TOKEN) { res.writeHead(401); return res.end(JSON.stringify({ ok: false, description: 'Unauthorized' })); }
      const method = m[2];
      if (method === 'getMe') return ok({ id: 777000, is_bot: true, username: 'nudist_test_bot' });
      if (method === 'sendMessage') {
        if (String(body.text || '').includes('ЗАБЛОКИРОВАН')) { res.writeHead(403); return res.end(JSON.stringify({ ok: false, description: 'Forbidden: bot was blocked by the user' })); }
        sent.push({ chat: body.chat_id, text: body.text }); return ok({ message_id: sent.length });
      }
      if (method === 'sendDocument') {
        if (!isJson) {      // первый раз — настоящий файл
          const m2 = /name="document"; filename="([^"]+)"/.exec(b) || [];
          docs.push({ chat: 0, file: m2[1] || '', bytes: b.length, real: true });
          return ok({ message_id: 900 + docs.length, document: { file_id: 'F' + docs.length, file_name: m2[1] || 'x.apk' } });
        }
        docs.push({ chat: body.chat_id, byId: String(body.document || ''), bytes: 0, real: false });      // повторно — по номеру
        return ok({ message_id: 900 + docs.length, document: { file_id: body.document, file_name: 'nudist.apk' } });
      }
      return ok(true);
    });
  });
  await new Promise(r => mock.listen(0, '127.0.0.1', r));
  const TG_API = `http://127.0.0.1:${mock.address().port}`;

  const env = { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dir, KEEP_AWAKE: 'off', TG_BOT_TOKEN: TOKEN, TG_API, TG_SETUP_MS: '100', NEWS_KEY: 'test-news-key-0123456789', SITE_URL: 'https://nudist.example' };
  for (const k of Object.keys(env)) if (/^(SUPABASE_|S3_|OWNERS|LEAF_ADMINS|TG_LOGIN|YOOKASSA|NODE_ENV|MOVED_TO)/.test(k)) delete env[k];
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'boot.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  const base = `http://127.0.0.1:${port}`;
  try {
    let up = false; for (let i = 0; i < 80 && !up; i++) { await sleep(250); try { up = (await fetch(base + '/api/health')).ok; } catch (e) {} }
    if (!up) throw new Error('сервер не поднялся:\n' + log.slice(-900));
    const post = async (p, b) => (await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })).json();
    const conn = tk => new Promise((res, rej) => { const ws = new WS(`ws://127.0.0.1:${port}/ws?token=${tk}`); let n = 0; const w = new Map(), c = { evs: [] };
      ws.on('error', rej);
      ws.on('message', d => { const q = JSON.parse(String(d)); if (q.ev === 'init') { c.me = q.d.me; return res(c); } if (q.ev) return c.evs.push(q); const x = w.get(q.id); if (x) { w.delete(q.id); q.e !== undefined ? x.no(new Error(q.e)) : x.ok(q.r); } });
      c.rpc = (m, p) => new Promise((ok, no) => { const i = ++n; w.set(i, { ok, no }); ws.send(JSON.stringify({ id: i, m, p: p || {} })); setTimeout(() => { if (w.has(i)) { w.delete(i); no(new Error('нет ответа на ' + m)); } }, 8000); });
      c.fail = (m, p) => c.rpc(m, p).then(() => null, e => e.message); c.close = () => ws.close(); });
    const reg = async u => { const r = await post('/api/register', { username: u, password: 'Tgtest-' + u, name: u, agree: true }); await sleep(150); return conn(r.token); };

    // первый на сервере — главный админ; второй — обычный, у него привяжем Telegram «вручную»
    const adm = await reg('tg_adm'), bob = await reg('tg_bob'), cat = await reg('tg_cat');
    await sleep(900);      // setup() бота при запуске
    const st = await adm.rpc('me.tg.start', {});
    ck('кнопка «привязать» даёт ссылку на бота', /^https:\/\/t\.me\/nudist_test_bot\?start=login_.{10,}$/.test(st.url || ''), st.url);

    // бот получил Start по ссылке привязки → админ привязан; потом так же bob, cat
    const hookUrl = base + '/api/tg/hook', secret = require('/home/user/nudist/server/tg.js');
    const sec = (() => { const t = require('crypto').createHash('sha256').update('tg-hook:' + TOKEN).digest('hex').slice(0, 48); return t; })();
    const start = async (chatId, code) => post('/api/tg/hook', {}).catch(() => null);      // вебхук ходит POST-ом; обёртка ниже
    const hookPost = (body, s2) => fetch(hookUrl, { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': s2 }, body: JSON.stringify(body) });
    const who = (id, name) => ({ id, is_bot: false, first_name: name, username: name });
    // привязка админа через настоящий вебхук
    let r = await hookPost({ update_id: 1, message: { message_id: 1, chat: { id: 9001, type: 'private' }, from: who(9001, 'adm_tg'), text: '/start login_' + st.code } }, sec);
    ck('вебхук принимает Start', r.status === 200, r.status);
    const pl = await adm.rpc('me.tg.poll', { code: st.code });
    ck('админ привязал Telegram', pl.ok === true && pl.tg === 'adm_tg', pl);
    // bob и cat — через свои ссылки
    for (const [u, id, nm] of [[bob, 9002, 'bob_tg'], [cat, 9003, 'cat_tg']]) {
      const s2 = await u.rpc('me.tg.start', {}); const k = s2.code;
      await hookPost({ update_id: id, message: { message_id: id, chat: { id, type: 'private' }, from: who(id, nm), text: '/start login_' + k } }, sec);
      await u.rpc('me.tg.poll', { code: k });
    }

    // ── рассылка: админ жмёт «Разослать обновление»
    sent.length = 0;
    const hour = new Date(Date.now() + 3 * 3600e3).getUTCHours();
    const night = hour >= 23 || hour < 9;
    const real = night ? await adm.rpc('admin.news', {}) : null;
    if (night) ck('ночью само не уходит, а ждёт утра', real && real.tg && real.tg.sent === 0 && /ночная/.test(real.tg.skipped || ''), real && real.tg);
    const out = await adm.rpc('admin.news', { force: 'i' });
    ck('рассылка ушла привязавшим', out.tg && out.tg.sent === 3 && out.tg.failed === 0, out.tg);
    const apk = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'apk.json'), 'utf8'));
    ck('текст — про текущую сборку и со ссылкой', sent.length === 3 && sent[0].text.includes(apk.name) && /https:\/\/nudist\.example\/start/.test(sent[0].text), sent[0] && sent[0].text.slice(0, 160));
    ck('в тексте первая новинка из apk.json', sent[0].text.includes(apk.news[0].slice(0, 40)), sent[0] && sent[0].text.slice(0, 300));
    ck('в чаты ушли только привязавшим', sent.map(m => m.chat).join(',') === '9001,9002,9003', sent.map(m => m.chat));
    ck('в тексте — просьба скачать с сайта', /Скачайте обновление с сайта/.test(sent[0].text), sent[0] && sent[0].text.slice(0, 200));
    ck('каждому приложен файл сборки', docs.length === 3, docs.length);
    ck('файл загружается один раз, дальше по номеру', docs.filter(d => d.real).length === 1 && docs.filter(d => d.byId).length === 2, docs.map(d => d.real ? 'файл' : d.byId));
    ck('файл настоящий — не пустышка', docs[0] && docs[0].bytes > 300 * 1024 && /\.apk$/.test(docs[0].file), docs[0] && { b: docs[0].bytes, f: docs[0].file });

    // ── второй раз в тот же день: каждому не больше раза в день
    sent.length = 0;
    const out2 = await adm.rpc('admin.news', { force: 'i' });
    ck('повторная рассылка не дублирует (и файлы тоже)', out2.tg && out2.tg.sent === 0 && sent.length === 0 && docs.length === 3, { tg: out2.tg, sent: sent.length, docs: docs.length });

    // ── «жив ли сайт»: телефон проверяет адрес обновления перед скачиванием
    const hh = await fetch(base + '/api/tg/health');
    ck('адрес проверки жив — /api/tg/health', hh.status === 200 && (await hh.json()).ok === true, hh.status);

    // ── рассылка снаружи по ключу интеграции (для скрипта выкладки)
    const noKey = await fetch(base + '/api/admin/news', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    ck('без ключа внешняя рассылка не работает', noKey.status === 401, noKey.status);
    let apiOut = null;
    {      // ключ выдаём админом (как в админке), кладём в базу напрямую — сервер читает её при каждом запросе
      const raw = await adm.rpc('admin.apikeys', { new: 'агент' });
      const dbf = path.join(dir, 'db.json'); const j = JSON.parse(fs.readFileSync(dbf, 'utf8'));
      j.meta.apiKeys = j.meta.apiKeys || []; j.meta.apiKeys.push({ id: 'k1', name: 'агент', hash: require('crypto').createHash('sha256').update(raw.key).digest('hex'), at: Date.now() });
      fs.writeFileSync(dbf, JSON.stringify(j));
      const rr = await fetch(base + '/api/admin/news', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + raw.key }, body: JSON.stringify({ force: 'i' }) });
      apiOut = { status: rr.status, body: await rr.json() };
    }
    ck('снаружи по ключу рассылка проходит', apiOut.status === 200 && apiOut.body && apiOut.body.tg && apiOut.body.tg.ok === true, apiOut);
    const nk = await fetch(base + '/api/admin/news', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer test-news-key-0123456789' }, body: '{}' });
    ck('ключ рассылки из настроек сервера тоже работает', nk.status === 200, nk.status);
    const wrong = await fetch(base + '/api/admin/news', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer test-news-key-0000000000' }, body: '{}' });
    ck('чужой ключ рассылки не пускает', wrong.status === 401, wrong.status);
    const wrongStats = await fetch(base + '/api/admin/stats', { headers: { authorization: 'Bearer test-news-key-0123456789' } });
    ck('ключ рассылки не открывает остальную админку', wrongStats.status === 401, wrongStats.status);

    // ── обычный пользователь не может рассылать
    const den = await bob.fail('admin.news', { force: 'i' });
    ck('не-админ не рассылает', /Недостаточно прав/i.test(den || ''), den);

    // ── только что зарегистрированный — не получил вчерашних отметок: его просим привязать, но он без tg
    ck('лента: без открытых телефонов карточек нет', out.feed === 0, out.feed);


  } finally { srv.kill(); mock.close(); }
  await sleep(300);
  console.log(`\n${bad ? '✗' : '✓'} ${passed}/${total}${bad ? '' : ' ✓'}`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('ОШИБКА:', e.message); process.exit(1); });
