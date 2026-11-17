'use strict';
// Проверка безопасности: кто что может. Запускается сама, поднимает сервер на временной базе, боевые данные не трогает.
//   1) чужой человек не читает и не меняет чужой личный чат и закрытую группу, не получает о них событий;
//   2) обычный пользователь не может вызвать ни один метод админки и поддержки;
//   3) чужие сессии, пароли, почта наружу не уходят; служебные файлы сервера не отдаются;
//   4) вход: неверный пароль, подбор, выход из сессии, WebSocket без ключа;
//   5) рабочий сервер (NODE_ENV=production): первая регистрация только с кодом установки, вход по номеру выключен;
//   6) сброс забытого пароля: ссылку выдаёт только главный админ, она одноразовая, в базе лежит только её хеш;
//      без старого пароля его нельзя сменить из сеанса моложе суток.
// Запуск: node scripts/security-test.js   (код выхода 0 — всё закрыто)
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const WS = require('../server/vendor/ws');

const sleep = ms => new Promise(r => setTimeout(r, ms));
let bad = 0, total = 0;
const ck = (name, ok, extra) => { total++; if (!ok) { bad++; console.log('  ✗ ПРОВАЛ:', name, extra === undefined ? '' : String(extra).slice(0, 300)); } else if (process.env.VERBOSE) console.log('  ✓', name); };

async function server(extraEnv) {
  const port = 3700 + Math.floor(Math.random() * 180), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nudist-sec-'));
  const env = { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dir, KEEP_AWAKE: 'off', ...extraEnv };
  for (const k of Object.keys(env)) if (/^(SUPABASE_|S3_|OWNERS|LEAF_ADMINS|TG_BOT|YOOKASSA)/.test(k)) delete env[k];      // тест никогда не трогает боевые данные
  if (!extraEnv || !('NODE_ENV' in extraEnv)) delete env.NODE_ENV;
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'boot.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  const S = { port, dir, base: `http://127.0.0.1:${port}`, log: '', srv };
  srv.stdout.on('data', d => S.log += d); srv.stderr.on('data', d => S.log += d);
  let up = false;
  for (let i = 0; i < 60 && !up; i++) { await sleep(250); try { up = (await fetch(S.base + '/api/health')).ok; } catch (e) { /* ещё не поднялся */ } }
  if (!up) throw new Error('сервер не поднялся:\n' + S.log.slice(-1500));
  S.post = async (p, body, headers) => { const r = await fetch(S.base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body) }); let j = null; try { j = await r.json(); } catch (e) { /* не JSON */ } return { status: r.status, j: j || {} }; };
  S.stop = async () => { srv.kill(); await sleep(300); fs.rmSync(dir, { recursive: true, force: true }); };
  S.reg = async (username, extra) => { const r = await S.post('/api/register', { username, password: 'Sec-test-' + username, name: username, agree: true, ...extra }); return r.j; };
  S.conn = tok => new Promise((res, rej) => {
    const ws = new WS(`ws://127.0.0.1:${port}/ws?token=${tok}`); let n = 0; const wait = new Map(), c = { evs: [], tok, ws };
    const t = setTimeout(() => rej(new Error('WebSocket молчит')), 5000);
    ws.on('error', e => { clearTimeout(t); rej(e); }); ws.on('close', () => { clearTimeout(t); rej(new Error('закрыт')); });
    ws.on('message', d => {
      const q = JSON.parse(String(d));
      if (q.ev === 'init') { clearTimeout(t); c.init = q.d; c.me = q.d.me; return res(c); }
      if (q.ev) return c.evs.push(q);
      const w = wait.get(q.id); if (w) { wait.delete(q.id); q.e !== undefined ? w.no(new Error(q.e)) : w.ok(q.r); }
    });
    c.rpc = (m, p) => new Promise((ok, no) => { const i = ++n; wait.set(i, { ok, no }); ws.send(JSON.stringify({ id: i, m, p: p || {} })); setTimeout(() => { if (wait.has(i)) { wait.delete(i); no(new Error('нет ответа на ' + m)); } }, 6000); });
    c.err = (m, p) => c.rpc(m, p).then(r => ({ ok: true, r }), e => ({ ok: false, e: e.message }));      // { ok:false } — сервер отказал
    c.close = () => { try { ws.close(); } catch (e) { /* уже закрыт */ } };
  });
  return S;
}

// ───── 1–4: обычный сервер
async function access() {
  const S = await server();
  try {
    const owner = await S.conn((await S.reg('sec_owner')).token), a = await S.conn((await S.reg('sec_anna')).token), b = await S.conn((await S.reg('sec_boris')).token), c = await S.conn((await S.reg('sec_chuzhoi')).token);
    ck('первый на сервере — админ, остальные — обычные', owner.me.admin === 'superadmin' && !a.me.admin && !c.me.admin);

    const SECRET = 'тайна-' + Math.random().toString(36).slice(2, 10);
    const dm = (await a.rpc('dm.open', { user: b.me.id })).chat;
    const blob = Buffer.from('секретный файл ' + SECRET);
    const up = (await S.post('/api/upload', blob, { authorization: 'Bearer ' + a.tok, 'x-name': 'note.txt', 'content-type': 'application/octet-stream' })).j;
    const m1 = (await a.rpc('msg.send', { chat: dm.id, text: 'личное: ' + SECRET })).msg;
    const grp = await a.rpc('chat.create', { type: 'group', title: 'Закрытая ' + SECRET, members: [b.me.id] });
    const m2 = (await a.rpc('msg.send', { chat: grp.id, text: 'в группе: ' + SECRET })).msg;
    const poll = (await a.rpc('msg.send', { chat: grp.id, type: 'poll', poll: { q: 'Опрос?', opts: ['да', 'нет'] } }).catch(() => ({}))).msg;
    await a.rpc('me.update', { email: 'anna-' + SECRET + '@example.com' }).catch(() => {});
    await sleep(300);
    ck('подготовка: чаты и сообщения созданы', !!(dm.id && m1 && m1.id && grp.id && m2 && m2.id && up.url));
    ck('участник читает свой чат (проверка самой проверки)', JSON.stringify(await b.rpc('msg.history', { chat: dm.id })).includes(SECRET));

    // Чужой пробует всё, что можно сделать с чатом. Каждая попытка должна кончиться отказом.
    const mine = await c.rpc('dm.open', { user: c.me.id }).then(r => r.chat || r);      // «Избранное» чужого — куда он попробует переслать
    for (const [chat, msg, what] of [[dm.id, m1.id, 'личный чат'], [grp.id, m2.id, 'закрытая группа']]) {
      const tries = [
        ['msg.history', { chat }], ['msg.search', { chat, q: 'тайна' }], ['msg.pinned', { chat }], ['msg.hist', { chat, id: msg }], ['msg.who', { chat, id: msg }],
        ['chat.members', { id: chat }], ['chat.count', { id: chat }], ['chat.export', { id: chat }], ['chat.stats', { id: chat }], ['chat.audit', { id: chat }], ['chat.requests', { id: chat }],
        ['chat.state', { id: chat, mute: 1 }], ['chat.read', { id: chat, seq: 1 }], ['chat.typing', { id: chat }],
        ['msg.send', { chat, text: 'я тут' }], ['msg.edit', { chat, id: msg, text: 'взломано' }], ['msg.del', { chat, ids: [msg], all: true }], ['msg.react', { chat, id: msg, e: '👍' }],
        ['msg.pin', { chat, id: msg }], ['msg.forward', { from: chat, ids: [msg], to: [mine.id] }], ['msg.view', { chat, ids: [msg] }], ['msg.click', { chat, id: msg }], ['msg.once.open', { chat, id: msg }],
        ['report', { type: 'msg', target: msg, chat, reason: 'spam' }],
        ['chat.clear', { id: chat, all: true }], ['chat.delete', { id: chat }], ['chat.wipe', { id: chat }], ['chat.update', { id: chat, title: 'взломано', ttl: 5 }], ['chat.purge', { id: chat, q: 'тайна' }],
        ['chat.add', { id: chat, users: [c.me.id] }], ['chat.kick', { id: chat, user: a.me.id }], ['chat.role', { id: chat, user: c.me.id, role: 'admin' }], ['chat.leave', { id: chat }],
        ['invite.new', { chat }], ['invite.list', { chat }], ['chat.join', { id: chat }], ['rtc.join', { chat }], ['call.start', { chat }],
      ];
      if (poll && chat === grp.id) tries.push(['msg.vote', { chat, id: poll.id, opts: [0] }]);
      for (const [m, p] of tries) { const r = await c.err(m, p); ck(`${what}: чужому отказано в ${m}`, !r.ok, JSON.stringify(r.r)); await sleep(15); }
    }
    // Поиск и общие списки не должны выдать чужое.
    const leaks = [];
    for (const [m, p] of [['msg.search', { q: 'тайна' }], ['search', { q: 'тайна' }], ['search', { q: 'Закрытая' }], ['calls.history', {}], ['msg.scheduled', {}], ['user.get', { id: a.me.id }], ['users.get', { ids: [a.me.id, b.me.id] }]]) { const r = await c.err(m, p); if (r.ok && JSON.stringify(r.r).includes(SECRET)) leaks.push(m); await sleep(15); }
    ck('поиск и списки не выдают чужую переписку, название закрытой группы и почту', !leaks.length, leaks.join(', '));
    const pub = JSON.stringify(await c.rpc('user.get', { id: a.me.id }));
    ck('чужой профиль: нет пароля, почты, ключей входа', !/"pass"|"totp"|"email"|"recovery"|"sessions"/.test(pub), pub.slice(0, 200));
    ck('свои данные при входе: нет хеша пароля и секрета 2FA', !/"pass":|"totp":"/.test(JSON.stringify(a.init)));
    await sleep(300);
    const heard = c.evs.filter(e => { const s = JSON.stringify(e); return s.includes(SECRET) || s.includes(dm.id) || s.includes(grp.id); });
    ck('чужой не получил ни одного события о чужих чатах', !heard.length, heard.map(e => e.ev).join(','));
    // Ничего не испортилось.
    const h1 = (await a.rpc('msg.history', { chat: dm.id })).msgs.find(m => m.id === m1.id), h2 = (await a.rpc('msg.history', { chat: grp.id })).msgs.find(m => m.id === m2.id);
    ck('сообщения целы: текст прежний, реакций и закрепов от чужого нет', h1 && h2 && h1.text.includes(SECRET) && h2.text.includes(SECRET) && !h1.rx && !h2.rx && !h1.edited && !h2.edited, JSON.stringify([h1 && h1.text, h2 && h2.rx]));
    ck('название группы прежнее', (await a.rpc('msg.history', { chat: grp.id })) && !JSON.stringify(a.evs).includes('взломано'));
    // Участник без прав не правит чужое.
    ck('участник не может править чужое сообщение', !(await b.err('msg.edit', { chat: dm.id, id: m1.id, text: 'подмена' })).ok);
    ck('участник группы без прав не удаляет чужое у всех', !(await b.err('msg.del', { chat: grp.id, ids: [m2.id], all: true })).ok || (await a.rpc('msg.history', { chat: grp.id })).msgs.some(m => m.id === m2.id));
    ck('участник группы без прав не назначает себя админом', !(await b.err('chat.role', { id: grp.id, user: b.me.id, role: 'admin' })).ok);

    // ── админка и поддержка
    const src = fs.readdirSync(path.join(__dirname, '..', 'server')).filter(f => f.endsWith('.js')).map(f => fs.readFileSync(path.join(__dirname, '..', 'server', f), 'utf8')).join('\n');
    const adminM = [...new Set([...src.matchAll(/^H\['(admin\.[\w.]+)'\]/gm)].map(x => x[1]))];
    const open = [];
    for (const m of adminM) { for (const p of [{}, { id: a.me.id, set: { registration: false }, stars: 999999, role: 'superadmin', ban: true, text: 'x', q: '' }]) { const r = await c.err(m, p); if (r.ok) open.push(m); await sleep(15); } }
    ck(`обычному пользователю закрыты все ${adminM.length} методов админки`, adminM.length > 10 && !open.length, open.join(', '));
    for (const m of ['support.list', 'support.thread', 'support.reply', 'support.close']) ck('обычному пользователю закрыто ' + m, !(await c.err(m, { id: 'x', user: a.me.id, text: 'x' })).ok);
    const cfg = (await fetch(S.base + '/api/config')).ok && await (await fetch(S.base + '/api/config')).json();
    ck('после попыток чужого регистрация не выключилась', cfg.flags.registration === true);
    ck('листики чужому не начислились', ((await a.rpc('stars.info', {}).catch(() => ({}))).stars || 0) < 100000);
    for (const p of ['/api/admin/flags', '/api/admin/users', '/api/admin/stats']) { const r = await fetch(S.base + p, { headers: { authorization: 'Bearer ' + c.tok } }); ck('HTTP-админка закрыта обычному пользователю: ' + p, r.status === 401 || r.status === 403 || r.status === 404, r.status); }

    // ── чужие сессии и личное
    const aSes = await a.rpc('me.sessions', {}), cSes = await c.rpc('me.sessions', {});
    ck('список сессий — только свои', cSes.length === 1 && !cSes.some(s => aSes.some(x => x.id === s.id)));
    await c.err('me.session.kill', { id: aSes[0].id }); await sleep(200);
    ck('чужую сессию закрыть нельзя', (await a.err('me.sessions', {})).ok);
    const story = await a.rpc('story.post', { kind: 'text', text: 'история', bg: '1' }).catch(() => null);
    if (story && story.id) ck('кто смотрел чужую историю — не узнать', !(await c.err('story.viewers', { id: story.id })).ok);

    // ── файлы и служебные адреса
    const name = up.url.split('/').pop();
    ck('имя загруженного файла случайное и длинное (угадать нельзя)', /^[\w-]{16,}\.[a-z0-9]+$/.test(name), name);
    ck('загрузка без входа запрещена', (await S.post('/api/upload', blob, { 'x-name': 'x.txt', 'content-type': 'application/octet-stream' })).status === 401);
    for (const p of ['/u/', '/u/..%2Fdb.json', '/u/../db.json', '/db.json', '/data/db.json', '/server/core.js', '/server/auth.js', '/.env', '/.git/config', '/package.json', '/../server/core.js', '/%2e%2e/server/core.js', '/js/..%2f..%2fserver%2fcore.js', '/setup-code.txt']) {
      const r = await fetch(S.base + p, { redirect: 'manual' }), t = r.status === 200 ? await r.text() : '';
      ck('служебный файл не отдаётся: ' + p, r.status !== 200 || (!t.includes('"users"') && !/require\(|scrypt|"scripts"/.test(t)), r.status);
    }
    const idx = await fetch(S.base + '/');
    ck('страница отдаётся с политикой безопасности содержимого (CSP) и nosniff', /default-src/.test(idx.headers.get('content-security-policy') || '') && idx.headers.get('x-content-type-options') === 'nosniff');
    ck('CSP запрещает встроенные скрипты', !/script-src[^;]*'unsafe-inline'/.test(idx.headers.get('content-security-policy') || '') && !/script-src[^;]*'unsafe-eval'/.test(idx.headers.get('content-security-policy') || ''));

    // ── вход
    ck('неверный пароль не пускает', !(await S.post('/api/login', { username: 'sec_anna', password: 'не тот' })).j.token);
    ck('несуществующий аккаунт: тот же ответ, что и при неверном пароле', (await S.post('/api/login', { username: 'sec_nobody', password: 'не тот' })).j.error === (await S.post('/api/login', { username: 'sec_anna', password: 'не тот' })).j.error);
    let limited = false; for (let i = 0; i < 14 && !limited; i++) { const r = await S.post('/api/login', { username: 'sec_boris', password: 'подбор' + i }); limited = /много|часто|позже|подожд/i.test(r.j.error || '') || r.status === 429; }
    ck('подбор пароля упирается в ограничение', limited);
    ck('телефонной авторизации больше нет: метод не существует', !(await S.post('/api/phone/start', { phone: '+79990001122' })).j.token && cfg.flags.phoneAuth === undefined);
    ck('телефонной привязки больше нет: метод не существует', !(await a.err('me.phone.start', { phone: '+79990001122' })).ok);
    const none = await S.conn('').then(() => true, () => false), junk = await S.conn('x'.repeat(40)).then(() => true, () => false);
    ck('WebSocket без ключа и с чужим ключом не подключается', !none && !junk);
    const c2 = await S.conn((await S.post('/api/login', { username: 'sec_chuzhoi', password: 'Sec-test-sec_chuzhoi' })).j.token);
    await c2.rpc('me.logout', {}).catch(() => {}); await sleep(300);
    ck('после выхода ключ сессии больше не работает', !(await S.conn(c2.tok).then(() => true, () => false)));
    // ── вход через Telegram: без настроенного бота ничего не принимается; подделать «я из Telegram» нельзя
    ck('сообщение «от Telegram» без настроенного бота не принимается', (await S.post('/api/tg/hook', { message: { from: { id: 1 }, chat: { id: 1, type: 'private' }, text: '/start' } }, { 'x-telegram-bot-api-secret-token': 'x' })).status !== 200);
    ck('вход «из мини-приложения» с выдуманными данными не проходит', !(await S.post('/api/tg/app', { initData: 'user=%7B%22id%22%3A1%7D&auth_date=' + Math.floor(Date.now() / 1000) + '&hash=' + '0'.repeat(64) })).j.token);
    ck('одноразовая ссылка из бота не угадывается', !(await S.post('/api/tg/link', { token: 'x'.repeat(24) })).j.token && !(await S.post('/api/tg/poll', { code: 'x'.repeat(22) })).j.token);
    ck('чужой ссылкой #move нельзя подложить сеанс: перенос принимается только с прежнего адреса', /FROM\.test\(ref\)/.test(fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'boot.js'), 'utf8')));
    // ── лобби игр: чужой не входит, не читает и не шлёт ходы
    const lob = await owner.rpc('lobby.new', { app: 'beer' });
    for (const [m, p] of [['lobby.join', { id: lob.id }], ['lobby.get', { id: lob.id }], ['lobby.set', { id: lob.id, app: 'run' }], ['lobby.ready', { id: lob.id }], ['lobby.msg', { id: lob.id, d: { t: 'mv' } }], ['lobby.invite', { id: lob.id, to: c.me.id }]]) ck('лобби: чужому отказано в ' + m, !(await c.err(m, p)).ok);
    await owner.rpc('lobby.leave', {});
    // ── сброс забытого пароля
    const pr = await b.err('me.password.reset', { new: 'Zahvat-parol-1' });
    ck('только что вошедший не может сменить пароль без старого (защита от входа обманом)', !pr.ok && /меньше суток/.test(pr.e || ''), JSON.stringify(pr));
    ck('обычный человек не может выдать ссылку для сброса пароля', !(await c.err('admin.user.reset', { id: a.me.id })).ok);
    const rl = await owner.rpc('admin.user.reset', { id: a.me.id });
    ck('главный админ выдаёт ссылку; почта владельца в ответе не раскрывается', /^[\w-]{30,}$/.test(rl.token || '') && !JSON.stringify(rl).includes(SECRET));
    await sleep(1500); const onDisk = fs.readFileSync(path.join(S.dir, 'db.json'), 'utf8');
    ck('в базе хранится не ключ ссылки, а его хеш', onDisk.includes('"reset":{"h":') && !onDisk.includes(rl.token));
    ck('чужой ключ не подходит', !(await S.post('/api/reset', { token: rl.token.slice(0, -2) + 'zz', password: 'Novyi-parol-9' })).j.token);
    const rs = await S.post('/api/reset', { token: rl.token, password: 'Novyi-parol-9' }); await sleep(300);
    ck('по ссылке пароль меняется, старые сеансы закрываются', !!rs.j.token && !(await a.err('me.sessions', {})).ok);
    ck('ссылка одноразовая', !(await S.post('/api/reset', { token: rl.token, password: 'Novyi-parol-10' })).j.token);
    ck('старый пароль после сброса не подходит', !(await S.post('/api/login', { username: 'sec_anna', password: 'Sec-test-sec_anna' })).j.token);
    let flood = false; const fl = await Promise.all(Array.from({ length: 140 }, () => c.err('stars.info', {}))); flood = fl.some(r => !r.ok && /много запросов/i.test(r.e));
    ck('поток запросов упирается в ограничение', flood);
    [owner, a, b, c].forEach(x => x.close());
  } finally { await S.stop(); }
}

// ───── 5: рабочий сервер
async function production() {
  const S = await server({ NODE_ENV: 'production' });
  try {
    const cfg = await (await fetch(S.base + '/api/config')).json();
    ck('новый рабочий сервер сообщает, что ждёт владельца', cfg.setup === true && cfg.flags.phoneAuth === undefined);
    const file = path.join(S.dir, 'setup-code.txt'), code = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : '';
    ck('код установки создан, лежит в папке данных и напечатан в журнале', code.length >= 12 && S.log.includes(code));
    ck('без кода первая регистрация не проходит', !(await S.reg('sec_thief')).token);
    ck('с неверным кодом — тоже', !(await S.reg('sec_thief', { setup: 'x'.repeat(code.length) })).token);
    ck('телефонных методов на рабочем сервере нет', !(await S.post('/api/phone/start', { phone: '+79990001122' })).j.token && !(await S.post('/api/phone/verify', { phone: '+79990001122', code: '00000', name: 'x' })).j.token);
    const own = await S.reg('sec_owner', { setup: code }); const o = own.token && await S.conn(own.token);
    ck('владелец с кодом регистрируется и становится главным админом', !!o && o.me.admin === 'superadmin');
    await sleep(300);
    ck('после этого код стёрт и больше не нужен', !fs.existsSync(file) && (await (await fetch(S.base + '/api/config')).json()).setup === undefined);
    const u = await S.reg('sec_user'); const uc = u.token && await S.conn(u.token);
    ck('следующие люди регистрируются без кода и без прав', !!uc && !uc.me.admin);
    if (o) o.close(); if (uc) uc.close();
  } finally { await S.stop(); }
}

(async () => {
  console.log('Доступ к чатам, админка, файлы, вход…'); await access();
  console.log('Первый запуск рабочего сервера, вход по номеру…'); await production();
  console.log(bad ? `ПРОВАЛОВ: ${bad} из ${total}` : `Всё закрыто: ${total} проверок.`);
})().then(() => (bad ? 1 : 0), e => { console.error('✗ ' + (e.stack || e.message)); return 1; }).then(code => process.exit(code));
