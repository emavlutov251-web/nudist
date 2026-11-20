'use strict';
// Кодировка и сжатие: у части телефонов вместо русских букв были ромбики с вопросами.
// Причина — сжатые ответы, которые старый WebView показывал как есть. Тест держит три правила:
//  1) приложению (NudistAndroid) ничего не отдаётся сжатым — ни страница, ни скрипты, ни стили;
//  2) любой текстовый ответ объявлен как UTF-8;
//  3) в текстах интерфейса нет битых последовательностей и «кракозябр».
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
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
    const get = async (p, ua, ae) => { const r = await fetch(base + p, { headers: { 'user-agent': ua, 'accept-encoding': ae } }); return { status: r.status, type: r.headers.get('content-type') || '', enc: r.headers.get('content-encoding') || '', text: await r.text() }; };
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
    if (process.env.VERBOSE) console.log('');
    console.log(`${total - bad}/${total} ✓`);
    if (bad) process.exitCode = 1;
  } catch (e) { console.log('  ✗ ИСКЛЮЧЕНИЕ:', e.message); process.exitCode = 1; }
  finally { srv.kill('SIGKILL'); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} }
  process.exit(process.exitCode || 0);
})();
