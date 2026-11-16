'use strict';
// Проверка целостности проекта без запуска сервера. Падает (код 1), если:
//   1) не хватает готовых библиотек или статики, без которых ничего не запустится;
//   2) интерфейс вызывает метод сервера, которого нет;
//   3) в коде сервера есть переменная окружения, не описанная в ENV.md;
//   4) номер версии приложения Android расходится между исходником и public/apk.json.
// Запуск: node scripts/check-project.js
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8'), ls = d => fs.readdirSync(path.join(ROOT, d));
let bad = 0; const fail = m => { bad++; console.log('  ✗', m); }, ok = m => console.log('  ✓', m);

// 1. без этих файлов сервер или интерфейс не поднимется
const NEED = ['server/vendor/ws/index.js', 'public/vendor/preact.js', 'public/vendor/qrcode.js', 'public/vendor/lottie.js', 'public/js/emoji-data.js', 'public/js/icons.js', 'public/icon-192.png', 'public/icon-512.png', 'public/icon-maskable.png', 'public/icon-180.png', 'public/og.png', 'public/manifest.webmanifest', 'public/nudist.apk', 'public/apk.json', 'README.md', 'ENV.md'];
const miss = NEED.filter(f => !fs.existsSync(path.join(ROOT, f)));
miss.length ? fail('нет файлов: ' + miss.join(', ')) : ok(`готовые библиотеки и статика на месте (${NEED.length} файлов)`);
const fonts = fs.existsSync(path.join(ROOT, 'public/fonts')) ? ls('public/fonts').filter(f => f.endsWith('.woff2')).length : 0; fonts ? ok('шрифты на месте: ' + fonts) : fail('нет шрифтов в public/fonts');

// 2. методы: что вызывает интерфейс и что умеет сервер
const server = ls('server').filter(f => f.endsWith('.js')).map(f => rd('server/' + f)).join('\n');
const have = new Set([...server.matchAll(/^H\['([\w.]+)'\]/gm)].map(m => m[1]));
const client = [...ls('public/js').filter(f => f.endsWith('.js') && f !== 'emoji-data.js' && f !== 'icons.js').map(f => rd('public/js/' + f)), ...ls('public/miniapps').filter(f => f.endsWith('.js')).map(f => rd('public/miniapps/' + f))].join('\n');
const used = new Set([...client.matchAll(/\b(?:rpc|call|act)\(\s*'([a-z][\w.]*)'/g)].map(m => m[1]).filter(m => m.includes('.') || have.has(m)));
const ghost = [...used].filter(m => !have.has(m));
ghost.length ? fail('интерфейс вызывает методы, которых нет на сервере: ' + ghost.join(', ')) : ok(`все ${used.size} методов, которые вызывает интерфейс, есть на сервере`);
// Методы без вызова из интерфейса — не ошибка, но список должен быть осознанным: это API для ботов, админки по HTTP и старых сборок.
const QUIET = new Set(['msg.cb', 'bot.inline', 'bot.appdata', 'hook.new', 'hook.list', 'hook.del', 'push.test', 'me.export', 'app.hello', 'year.skip', 'santa.leave', 'season.claim', 'msg.click', 'msg.view', 'feed.viewers', 'clip.viewers', 'music.listeners', 'ask.unblockAll', 'admin.me', 'rtc.join', 'call.start', 'premium.buy']);      /* rtc.join и call.start зовутся через общую функцию звонка; premium.buy — старое имя покупки Plus для давних сборок */
const idle = [...have].filter(m => !used.has(m) && !QUIET.has(m) && !m.startsWith('admin.'));
console.log(`  · методов сервера без вызова из интерфейса: ${idle.length}` + (idle.length ? ' (' + idle.join(', ') + ')' : ''));

// 3. переменные окружения
const envDoc = rd('ENV.md'), envUsed = new Set([...server.matchAll(/process\.env\.([A-Z][A-Z_0-9]*)/g)].map(m => m[1]));
const undoc = [...envUsed].filter(v => !new RegExp('`' + v + '`').test(envDoc));
undoc.length ? fail('переменные окружения без описания в ENV.md: ' + undoc.join(', ')) : ok(`все ${envUsed.size} переменных окружения сервера описаны в ENV.md`);

// 4. версия приложения Android
const appv = Number((/APP_VERSION = (\d+);/.exec(rd('android/src/ru/nudist/app/MainActivity.java')) || [])[1]), apk = JSON.parse(rd('public/apk.json'));
appv && appv === Number(apk.code) ? ok(`версия приложения Android одна и та же в исходнике и в apk.json: ${apk.name} (${appv})`) : fail(`версия Android расходится: в исходнике ${appv}, в public/apk.json ${apk.code}`);
if (/nudist-leaf/.test(rd('android/build.sh'))) fail('в android/build.sh снова зашит пароль хранилища ключа');

console.log(bad ? `ПРОВАЛОВ: ${bad}` : 'Проект цел.');
process.exit(bad ? 1 : 0);
