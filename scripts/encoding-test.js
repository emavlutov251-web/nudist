'use strict';
// Кодировка и сжатие: у части телефонов вместо русских букв были ромбики с вопросами.
// Причина — сжатые ответы, которые старый WebView показывал как есть. Тест держит три правила:
//  1) приложению (NudistAndroid) ничего не отдаётся сжатым — ни страница, ни скрипты, ни стили;
//  2) любой текстовый ответ объявлен как UTF-8;
//  3) в текстах интерфейса нет битых последовательностей и «кракозябр».
const { spawn } = require('child_process');
const fs = require('fs'), zlib = require('zlib'), os = require('os'), path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let bad = 0, total = 0;
const ck = (n, ok, x) => { total++; if (!ok) { bad++; console.log('  ✗ ПРОВАЛ:', n, x === undefined ? '' : JSON.stringify(x).slice(0, 200)); } else if (process.env.VERBOSE) console.log('  ✓', n); };
(async () => {
  const port = 3960 + Math.floor(Math.random() * 9), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nudist-enc-')), base = `http://127.0.0.1:${port}`;
  const env = { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dir, KEEP_AWAKE: 'off' };
  for (const k of Object.keys(env)) if (/^(SUPABASE_|S3_|OWNERS|LEAF_ADMINS|TG_|YOOKASSA|NODE_ENV|SITE_URL|MOVED_TO)/.test(k)) delete env[k];
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'boot.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  try {
    let up = false; for (let i = 0; i < 60 && !up; i++) { await sleep(250); try { up = (await fetch(base + '/api/health')).ok; } catch (e) {} }
    if (!up) throw new Error('сервер не поднялся:\n' + log.slice(-900));
    const get = async (p, ua, ae) => { const r = await fetch(base + p, { headers: { 'user-agent': ua, 'accept-encoding': ae } }); const buf = Buffer.from(await r.arrayBuffer()); const dec = r.headers.get('content-encoding') || ''; let body = buf; try { if (dec.includes('gzip') && buf[0] === 0x1f && buf[1] === 0x8b) body = zlib.gunzipSync(buf); else if (dec.includes('br')) body = zlib.brotliDecompressSync(buf); } catch (e) { body = buf; } return { status: r.status, type: r.headers.get('content-type') || '', enc: dec, text: body.toString('utf8'), body }; };
    const APP = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/100 Mobile Safari/537.36 NudistAndroid/32';
    const APPWEB = 'NudistAndroid-web';       // так приложение скачивает себе копию интерфейса
    for (const p of ['/', '/js/app.js', '/css/app.css', '/api/version']) {
      const r = await get(p, APP, 'gzip, deflate, br');
      ck('приложению без сжатия: ' + p, r.enc === '', r.enc || 'несжато');
    }
    // приложение качает копию интерфейса этим именем — тоже без сжатия
    for (const p of ['/js/rave.js', '/css/hub.css']) {
      const r = await get(p, APPWEB, 'gzip, br');
      ck('скачивание интерфейса без сжатия: ' + p, r.enc === '', r.enc || 'несжато');
    }
    for (const p of ['/', '/js/app.js', '/css/app.css', '/js/community.js', '/api/version']) {
      const r = await get(p, APP, 'gzip, br');
      ck('текст объявлен UTF-8: ' + p, /charset=utf-8/i.test(r.type) || p.startsWith('/api/'), r.type);
    }
    const idx = await get('/', APP, 'gzip'); 
    ck('страница отдаётся целым HTML', /^<!doctype html>/i.test(idx.text.trim()) && /Нудист/.test(idx.text), idx.text.slice(0, 40));
    ck('в странице читаются русские буквы', /Мессенджер|мессенджер|Нудист/.test(idx.text), '');
    ck('нет ромбиков и знаков вопроса вместо букв', !/\uFFFD/.test(idx.text), (idx.text.match(/\uFFFD/g) || []).length);
    // браузеру сжатие можно: на нём экономия реальная
    const br = await get('/js/app.js', 'Mozilla/5.0 Chrome/130 Safari/537.36', 'gzip');
    ck('обычному браузеру скрипты сжимаются', br.enc !== '', br.enc || 'не сжато');
    // сами файлы интерфейса — валидный UTF-8 без «кракозябр»
    const files = ['public/index.html', 'public/js/app.js', 'public/js/rave.js', 'public/js/communities.js'].map(f => path.join(__dirname, '..', f));
    for (const f of files) {
      const b = fs.readFileSync(f);
      const s = b.toString('utf8');
      ck('файл читается как UTF-8: ' + path.basename(f), !/\uFFFD/.test(s), (s.match(/\uFFFD/g) || []).length);
      ck('в файле нет кракозябр: ' + path.basename(f), !/Ð[°-¿]|Ñ[\x80-\xBF]/.test(s), '');
    }
    // ── автообновление сборки: приложение качает /nudist.apk само и ставит одним нажатием
    const apk = await get('/nudist.apk', 'NudistAndroid-update/36', 'identity');
    ck('новая сборка скачивается целиком', apk.status === 200 && apk.body.length > 300 * 1024, { код: apk.status, байт: apk.body.length });
    ck('это именно APK-файл, а не страница', apk.body.slice(0, 2).toString() === 'PK', apk.body.slice(0, 4).toString('hex'));
    const ver = await get('/api/version', 'NudistAndroid-update/36');
    let vj = {}; try { vj = JSON.parse(ver.text); } catch (e) {}
    ck('сервер сообщает номер сборки для обновления', !!(vj.apk && Number(vj.apk.code) > 0), vj.apk && vj.apk.code);
    const apkJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'apk.json'), 'utf8'));
    ck('номер в apk.json совпадает с сервером', Number(apkJson.code) === Number(vj.apk && vj.apk.code), { файл: apkJson.code, сервер: vj.apk && vj.apk.code });
    const apkSize = fs.statSync(path.join(__dirname, '..', 'public', 'nudist.apk')).size;
    ck('размер файла совпадает с заявленным', Math.abs(apkSize - apk.body.length) === 0, { файл: apkSize, сеть: apk.body.length });
    const growth = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'growth.js'), 'utf8');
    ck('окно обновления умеет качать в фоне', /updateFetch/.test(growth) && /updateInstall/.test(growth), '');
    ck('сборка качается заранее, до открытия окна', /prefetchApk/.test(growth), '');
    // ── путь обновления для старой сборки: видимая плашка, окно и переход из уведомления
    const appjs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app.js'), 'utf8');
    ck('на главной есть плашка «новая версия»', /function ApkBar/.test(appjs), '');
    ck('плашка ведёт в окно обновления', /showUpdateNow/.test(appjs), '');
    ck('переход из уведомления #update обрабатывается', /#update/.test(appjs) && /showUpdateNow/.test(fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'growth.js'), 'utf8')), '');
    const pushjs = fs.readFileSync(path.join(__dirname, '..', 'server', 'push.js'), 'utf8');
    ck('уведомление об обновлении несёт click=update', /click: 'update'/.test(pushjs), '');
    ck('напоминание об обновлении идёт первым', /f\.q\.unshift\(upd\)/.test(pushjs), '');
    // ── установка сборки и «своя страница» в оболочке: раньше тут были дыры
    const mainj = fs.readFileSync(path.join(__dirname, '..', 'android', 'src', 'ru', 'nudist', 'app', 'MainActivity.java'), 'utf8');
    ck('кнопка «Скачать и установить» качает внутри приложения', /async function downloadTap/.test(growth) && /updateFetch/.test(growth), '');
    ck('в приложении кнопка скачивания не уводит на файл', /onClick=\$\{e => downloadTap\(e\)\}/.test(growth), '');
    ck('оболочка знает свою страницу вместо пустого экрана', /showBuiltinPage/.test(mainj), '');
    ck('пустой экран после загрузки ловится', /checkShown\(url\)/.test(mainj), '');
    ck('установку не гасит запрет из настроек — ведём туда', /ACTION_MANAGE_UNKNOWN_APP_SOURCES/.test(mainj) && /canRequestPackageInstalls/.test(mainj), '');
    ck('сборки (.apk) страница из памяти не получает', /endsWith\("\.apk"\)/.test(mainj), '');
    if (process.env.VERBOSE) console.log('');
    console.log(`${total - bad}/${total} ✓`);
    if (bad) process.exitCode = 1;
  } catch (e) { console.log('  ✗ ИСКЛЮЧЕНИЕ:', e.message); process.exitCode = 1; }
  finally { srv.kill('SIGKILL'); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} }
  process.exit(process.exitCode || 0);
})();
