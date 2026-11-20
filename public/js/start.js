// Страница /start: посадочная «Нудиста». Обычный скрипт без модулей: ссылку открывают с любых телефонов.
// Без скрипта страница тоже работает: кнопка — обычная ссылка на файл.
// Делает три вещи: (1) запоминает метки кампании (utm_*) и приглашение (?ref=), чтобы регистрация в приложении их увидела;
// (2) анонимно считает визиты/скачивания для воронки в админке; (3) подстраивает страницу под iPhone и компьютер.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var ua = navigator.userAgent || '';

  // ── метки кампании: только безопасные символы, так же, как на сервере
  var clean = function (v, n) { return String(v || '').toLowerCase().replace(/[^a-z0-9_.\-]/g, '').slice(0, n || 48); };
  var params = null;
  try { params = new URLSearchParams(location.search); } catch (e) { params = null; }
  var utm = null, ref = '';
  if (params) {
    var u = {};
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'].forEach(function (k) { var v = clean(params.get(k)); if (v) u[k] = v; });
    if (u.utm_source || u.utm_medium || u.utm_campaign || u.utm_content) utm = u;
    ref = clean(params.get('ref'), 32);
  }
  try {
    if (utm) localStorage.setItem('utm', JSON.stringify(utm));
    if (ref) localStorage.setItem('ref', ref);
  } catch (e) { /* приватный режим: метка просто не сохранится */ }

  // ── анонимная статистика воронки: визит / скачивание / открытие. Уходит фоном, не мешает странице.
  var src = '';
  try {
    var u0 = null; try { u0 = JSON.parse(localStorage.getItem('utm') || 'null'); } catch (e) { /* битая запись */ }
    if (u0 && typeof u0 === 'object') {
      utm = u0;
      var p = [];
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'].forEach(function (k) { if (u0[k]) p.push(k + '=' + encodeURIComponent(u0[k])); });
      src = p.join('&');
    }
    if (!ref) { try { ref = clean(localStorage.getItem('ref')); } catch (e) { /* без разницы */ } }
  } catch (e) { /* идём дальше */ }
  function track(event) {
    var body = { e: event };
    if (utm) { body.utm_source = utm.utm_source; body.utm_medium = utm.utm_medium; body.utm_campaign = utm.utm_campaign; body.utm_content = utm.utm_content; }
    try { body.ref = ref || undefined; } catch (e) { /* пусто */ }
    var text = JSON.stringify(body);
    try {
      if (navigator.sendBeacon) { if (navigator.sendBeacon('/api/track', new Blob([text], { type: 'application/json' }))) return; }
    } catch (e) { /* запасной путь ниже */ }
    try { fetch('/api/track', { method: 'POST', headers: { 'content-type': 'application/json' }, body: text, keepalive: true }).catch(function () {}); } catch (e) { /* статистика не важнее человека */ }
  }

  // Уже внутри приложения (APK или значок на главном экране): скачивать нечего, сразу в мессенджер.
  var standalone = false;
  try { standalone = navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches); } catch (e) { /* старый браузер */ }
  var q = '';
  try { if (ref) q = '?ref=' + ref; } catch (e) { q = ''; }
  if (/NudistAndroid/.test(ua) || standalone) { location.replace('/' + q); return; }
  track('visit');

  var os = /Android/i.test(ua) ? 'android' : (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) ? 'ios' : 'desktop';
  document.documentElement.setAttribute('data-os', os);

  var carry = (function () { // ссылки «в мессенджер» и «в браузере» несут приглашение дальше
    var p = [];
    if (q) p.push(q.slice(1));
    if (src) p.push(src);
    return p.length ? '?' + p.join('&') : '';
  })();
  if ($('web')) $('web').href = '/' + carry;
  var webTop = document.getElementById('webTop'); if (webTop) webTop.href = '/' + carry;
  var webIos = $('webIos'); if (webIos) webIos.href = '/' + carry;

  if (os === 'ios') { if ($('apk')) $('apk').hidden = true; if ($('apkText')) $('apkText').hidden = true; if ($('ios')) $('ios').hidden = false; }
  if (os === 'desktop') { var l = $('apkLabel'); if (l) l.textContent = 'Скачать APK на этот компьютер'; }
  // Пришли из приложения по кнопке «Скачать в браузере»: сразу показываем шаги и не заставляем искать кнопку.
  var wantDownload = /[?&]download=1/.test(location.search);
  if (wantDownload && $('steps')) { $('steps').hidden = false; }

  if ($('apk')) $('apk').addEventListener('click', function () { track('apk'); if ($('steps')) $('steps').hidden = false; });
  if ($('web')) $('web').addEventListener('click', function () { track('open'); });
  if (webTop) webTop.addEventListener('click', function () { track('open'); });

  // Приглашение от друга: показываем баннер и имя (только то, что и так было в ссылке).
  if (ref) { var rb = $('refBanner'), rn = $('refName'); if (rn) rn.textContent = '@' + ref; if (rb) rb.hidden = false; }

  // Сколько нас уже: цифра с сервера, если он ответил.
  try {
    fetch('/api/config').then(function (r) { return r.json(); }).then(function (d) {
      var n = d && d.members, el = $('memberCount');
      if (n > 0 && el) el.textContent = String(n);
      else { var line = el && el.closest('.members'); if (line) line.hidden = true; }
    }).catch(function () { var el = $('memberCount'); var line = el && el.closest('.members'); if (line) line.hidden = true; });
  } catch (e) { /* цифра не критична */ }

  // Настоящий вес файла: после пересборки приложения цифра обновится сама.
  try {
    var x = new XMLHttpRequest(); x.open('HEAD', '/nudist.apk'); x.timeout = 10000;
    x.onload = function () {
      var n = +x.getResponseHeader('content-length');
      if (x.status === 200 && n > 0 && $('size')) $('size').textContent = n < 1048576 ? Math.max(1, Math.round(n / 1024)) + ' КБ' : (n / 1048576).toFixed(1).replace('.', ',') + ' МБ';
    };
    x.send();
  } catch (e) { /* останется цифра из разметки */ }
})();
