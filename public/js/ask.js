// Страница анонимного вопроса /q/<username>. Обычный скрипт без модулей: ссылку открывают с любых телефонов.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var who = decodeURIComponent((location.pathname.split('/')[2] || '')).replace(/[^\w.-]/g, '').slice(0, 40);
  var COLORS = ['#E2552D', '#C7822F', '#1F9D57', '#0D7C8C', '#3F6FD8', '#8B55D9', '#D1468C', '#5E6B66'];
  var IDEAS = [
    'Что ты подумал(а) обо мне при первой встрече?', 'Какая песня у тебя сейчас на повторе?', 'За что тебе до сих пор стыдно?',
    'Кто тебе нравится? Только честно.', 'Твой самый странный страх?', 'Что бы ты сделал(а) с миллионом?', 'Какой сериал ты пересматривал(а) больше двух раз?',
    'Ананасы на пицце — да или нет?', 'Что тебя бесит в людях больше всего?', 'Последнее, что ты гуглил(а)?', 'Чему ты хочешь научиться в этом году?',
    'Какой совет ты дал(а) бы себе пять лет назад?', 'Самое глупое, на что ты потратил(а) деньги?', 'Кого из наших общих знакомых ты считаешь самым смешным?',
    'Какое твоё любимое место в городе?', 'О чём ты мечтаешь, но никому не говоришь?'
  ];
  var last = -1;
  function show(id) { ['form', 'done', 'closed'].forEach(function (x) { $(x).hidden = x !== id; }); }
  function req(method, url, body, cb) {
    var x = new XMLHttpRequest(); x.open(method, url); x.timeout = 20000;
    if (body) x.setRequestHeader('content-type', 'application/json');
    x.onload = function () { var d = {}; try { d = JSON.parse(x.responseText); } catch (e) { /* не JSON */ } cb(x.status >= 200 && x.status < 300 ? null : (d.error || 'Не получилось. Попробуйте ещё раз.'), d); };
    x.onerror = x.ontimeout = function () { cb('Нет связи с сервером. Попробуйте ещё раз.'); };
    x.send(body ? JSON.stringify(body) : null);
  }
  $('own').href = '/?ref=' + encodeURIComponent(who) + '#ask';
  req('GET', '/api/ask/info?u=' + encodeURIComponent(who), null, function (err, d) {
    if (err) { $('name').textContent = 'Никого нет'; $('closedTitle').textContent = 'Ссылка не работает'; $('closedText').textContent = err; return show('closed'); }
    var name = d.name || d.username;
    $('name').textContent = name; $('uname').textContent = '@' + d.username; document.title = name + ' ждёт анонимный вопрос · Нудист';
    var a = $('ava');
    if (d.avatar) {
      var src = String(d.avatar).replace(/["\\\n]/g, '');
      if (/\.(mp4|webm|mov|m4v)$/i.test(src)) { // аватар-видео: картинкой его не показать
        var v = document.createElement('video'); v.muted = true; v.loop = true; v.autoplay = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.setAttribute('muted', '');
        v.onloadeddata = function () { a.textContent = ''; a.appendChild(v); }; v.src = src;
      } else { a.textContent = ''; a.style.backgroundImage = 'url("' + src + '")'; }
    }
    else { a.textContent = (name.match(/[^\s_@]/) || ['🍃'])[0].toUpperCase(); a.style.backgroundColor = COLORS[(d.color || 0) % 8]; }
    if (!d.open) show('closed');
  });
  var ta = $('text');
  function count() { $('cnt').textContent = ta.value.length + ' / 500'; }
  ta.addEventListener('input', function () { count(); $('err').textContent = ''; });
  $('dice').addEventListener('click', function () { var i; do { i = Math.floor(Math.random() * IDEAS.length); } while (i === last); last = i; ta.value = IDEAS[i]; count(); ta.focus(); });
  $('send').addEventListener('click', function () {
    var t = ta.value.replace(/^\s+|\s+$/g, '');
    if (t.length < 2) { $('err').textContent = 'Напишите хотя бы пару слов.'; return ta.focus(); }
    var b = $('send'); b.disabled = true; b.textContent = 'Отправляем…';
    req('POST', '/api/ask', { to: who, text: t }, function (err) {
      b.disabled = false; b.textContent = 'Отправить анонимно';
      if (err) { $('err').textContent = err; return; }
      ta.value = ''; count(); show('done');
    });
  });
  $('again').addEventListener('click', function () { show('form'); ta.focus(); });
})();
