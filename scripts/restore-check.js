'use strict';
// Учебное восстановление: проверяет, что из резервной копии базы действительно можно подняться.
// Копия никуда не выкладывается и боевой сервер не трогается: сервер запускается на временной папке без облака.
//
//   node scripts/restore-check.js путь/к/db.json          — снимок базы с диска
//   node scripts/restore-check.js путь/к/main-2026-11-15.gz — копия из S3 (db/<строка>-ГГГГ-ММ-ДД.gz)
//   node scripts/restore-check.js --s3                     — взять самую свежую дневную копию из S3 (нужны S3_ENDPOINT, S3_BUCKET, S3_KEY_ID, S3_SECRET; только чтение)
//
// Что проверяется: файл читается и разбирается; ссылки внутри базы целы; сервер поднимается на этой базе;
// в него можно войти новым аккаунтом и найти старого пользователя; после остановки ничего не потерялось.
// Код выхода 0 — копия рабочая.
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path'), zlib = require('zlib');
const WS = require('../server/vendor/ws');

const sleep = ms => new Promise(r => setTimeout(r, ms));
let bad = 0; const ck = (name, ok, extra) => { if (!ok) bad++; console.log(ok ? '  ✓' : '  ✗ ПРОВАЛ:', name, extra === undefined ? '' : extra); };
const count = db => ({ users: Object.keys(db.users || {}).length, chats: Object.keys(db.chats || {}).length, msgs: Object.values(db.msgs || {}).reduce((a, l) => a + l.length, 0), sessions: Object.keys(db.sessions || {}).length });

async function fromS3(tmp) {
  const S3 = require('../server/s3'); if (!S3.enabled) throw new Error('Не заданы S3_ENDPOINT, S3_BUCKET, S3_KEY_ID, S3_SECRET');
  const l = await S3.request('GET', '', { query: { 'list-type': '2', prefix: 'db/', 'max-keys': '1000' }, timeout: 30000 });
  const keys = [...l.text.matchAll(/<Key>(db\/[^<]+-\d{4}-\d\d-\d\d\.gz)<\/Key>/g)].map(m => m[1]).sort();
  if (!keys.length) throw new Error('В хранилище нет дневных копий (db/…-ГГГГ-ММ-ДД.gz)');
  console.log(`Дневных копий в хранилище: ${keys.length}, от ${keys[0].slice(-13, -3)} до ${keys[keys.length - 1].slice(-13, -3)}`);
  const key = keys[keys.length - 1], file = path.join(tmp, 'copy.gz');
  const r = await S3.request('GET', key, { sink: file, timeout: 120000 }); if (r.status !== 200) throw new Error('копия не скачалась: HTTP ' + r.status);
  console.log('Скачана', key); return file;
}

(async () => {
  const arg = process.argv[2]; if (!arg) { console.log('Укажите файл копии или --s3. Подробности — в начале scripts/restore-check.js'); return 2; }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nudist-restore-'));
  try {
    const file = arg === '--s3' ? await fromS3(tmp) : arg;
    let buf = fs.readFileSync(file); if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
    let db; try { db = JSON.parse(buf.toString('utf8')); } catch (e) { db = null; }
    ck('копия читается и разбирается', !!db && !!db.users && !!db.chats, db ? `${(buf.length / 1048576).toFixed(2)} МБ` : 'файл повреждён'); if (!db) return 1;
    const before = count(db), age = db.meta && db.meta.savedAt ? Math.round((Date.now() - db.meta.savedAt) / 3600e3) : null;
    console.log(`  В копии: людей и ботов ${before.users}, чатов ${before.chats}, сообщений ${before.msgs}, сессий ${before.sessions}` + (age === null ? '' : `; возраст копии ${age} ч`));
    const humans = Object.values(db.users).filter(u => !u.bot && !u.deleted);
    ck('в копии есть люди и главный админ', humans.length > 0 && humans.some(u => u.admin === 'superadmin'));
    const lost = []; for (const u of Object.values(db.users)) for (const c of u.chats || []) if (!db.chats[c]) lost.push(c);
    ck('у людей нет ссылок на пропавшие чаты', !lost.length, lost.length || '');
    ck('у всех сообщений есть свой чат', Object.keys(db.msgs || {}).every(c => db.chats[c]));
    ck('все сессии принадлежат существующим аккаунтам', Object.values(db.sessions || {}).every(s => db.users[s.user]));

    // Копия для пробного запуска: без подписок на уведомления, чтобы пробный сервер никому ничего не прислал.
    for (const u of Object.values(db.users)) delete u.push;
    const dir = path.join(tmp, 'data'); fs.mkdirSync(dir); fs.writeFileSync(path.join(dir, 'db.json'), JSON.stringify(db));
    const port = 3600 + Math.floor(Math.random() * 90), base = `http://127.0.0.1:${port}`;
    const env = { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dir, KEEP_AWAKE: 'off' };
    for (const k of Object.keys(env)) if (/^(SUPABASE_|S3_|OWNERS|LEAF_ADMINS|TG_BOT|YOOKASSA|IMPORTERS|ROBOTS|MAINT|NODE_ENV)/.test(k)) delete env[k];      // никакого облака и боевых ключей
    const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'boot.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
    let up = false; for (let i = 0; i < 80 && !up; i++) { await sleep(250); try { up = (await fetch(base + '/api/health')).ok; } catch (e) { /* ещё не поднялся */ } }
    ck('сервер поднялся на этой копии', up, up ? '' : log.slice(-600));
    if (up) {
      const name = 'restore_' + Date.now().toString(36);
      const reg = await (await fetch(base + '/api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: name, password: 'Restore-check-1', name: 'Проверка', agree: true }) })).json();
      ck('на восстановленном сервере работает регистрация, новый человек не получает прав', !!reg.token);
      const known = humans.find(u => u.username);
      const found = reg.token && known && await new Promise(res => {
        const ws = new WS(`ws://127.0.0.1:${port}/ws?token=${reg.token}`); const t = setTimeout(() => res(null), 6000);
        ws.on('error', () => res(null));
        ws.on('message', d => { const q = JSON.parse(String(d)); if (q.ev === 'init') { if (q.d.me.admin) bad++; ws.send(JSON.stringify({ id: 1, m: 'user.get', p: { username: known.username } })); } else if (q.id === 1) { clearTimeout(t); ws.close(); res(q.r || null); } });
      });
      ck('старые аккаунты на месте и находятся', !known || !!(found && (found.id === known.id || (found.user && found.user.id === known.id))));
      srv.kill('SIGTERM'); await new Promise(r => { srv.on('exit', r); setTimeout(r, 8000); });
      const after = count(JSON.parse(fs.readFileSync(path.join(dir, 'db.json'), 'utf8')));
      ck('после остановки база сохранилась и ничего не потеряла', after.users >= before.users + 1 && after.chats >= before.chats && after.msgs >= before.msgs, JSON.stringify(after));
    } else srv.kill('SIGKILL');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }      // пробная копия и скачанный файл стираются
  console.log(bad ? `ПРОВАЛОВ: ${bad}` : 'Копия рабочая: из неё можно подняться.');
  return bad ? 1 : 0;
})().then(code => process.exit(code), e => { console.error('✗ ' + e.message); process.exit(1); });
