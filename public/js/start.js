// Страница выбора /start: «в браузере» или «скачать APK». Обычный скрипт без модулей: ссылку открывают с любых телефонов.
// Без скрипта страница тоже работает: обе кнопки — обычные ссылки.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var ua = navigator.userAgent || '';
  var q = '';
  try { var r = (/[?&]ref=([^&#]*)/.exec(location.search) || [])[1]; r = decodeURIComponent(r || '').replace(/[^\w]/g, '').slice(0, 32); if (r) q = '?ref=' + r; } catch (e) { /* кривая ссылка: идём без приглашения */ }

  // Уже внутри приложения (APK или значок на главном экране): выбирать не из чего, сразу в мессенджер.
  var standalone = false;
  try { standalone = navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches); } catch (e) { /* старый браузер */ }
  if (/NudistAndroid/.test(ua) || standalone) { location.replace('/' + q); return; }

  var os = /Android/i.test(ua) ? 'android' : (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) ? 'ios' : 'desktop';
  document.documentElement.setAttribute('data-os', os);

  $('web').href = '/' + q; $('login').href = '/' + q;

  var inside = false;
  try { inside = !!localStorage.getItem('nudist.token'); } catch (e) { /* хранилище закрыто */ }
  if (inside) { $('webLabel').textContent = 'Открыть «Нудист»'; $('webText').textContent = 'Вы уже вошли на этом устройстве — переписка на месте.'; }

  if (os === 'ios') { $('apk').hidden = true; $('apkText').hidden = true; $('ios').hidden = false; }
  if (os === 'desktop') { $('apkLabel').textContent = 'Скачать APK на этот компьютер'; }

  $('apk').addEventListener('click', function () { $('steps').hidden = false; });

  // Настоящий вес файла: после пересборки приложения цифра обновится сама.
  try {
    var x = new XMLHttpRequest(); x.open('HEAD', '/nudist.apk'); x.timeout = 10000;
    x.onload = function () {
      var n = +x.getResponseHeader('content-length');
      if (x.status === 200 && n > 0) $('size').textContent = n < 1048576 ? Math.max(1, Math.round(n / 1024)) + ' КБ' : (n / 1048576).toFixed(1).replace('.', ',') + ' МБ';
    };
    x.send();
  } catch (e) { /* останется цифра из разметки */ }
})();
