// Оплата из приложения в браузере: страница /buy. Ключ приходит в якоре адреса (не попадает в журналы сервера).
(function(){
  var K = (function(){ var m = /(?:^|[#&])k=([a-f0-9]{20,64})/.exec(location.hash); return m ? m[1] : ''; })();
  var C = document.getElementById('bwc');
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function rub(n){ return String(n).replace(/B(?=(d{3})+(?!d))/g, ' ') + ' ₽'; }
  function post(m, p){ return fetch('/api/' + m.replace('.', '/'), {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(p || {})}).then(function(r){ return r.json(); }); }
  function fail(t){ C.innerHTML = '<p class="err">' + esc(t) + '</p><a class="btn" href="/#buy">Открыть магазин в приложении</a>'; }
  if (!K) return fail('Ссылка неполная. Вернитесь в приложение и нажмите «Купить» ещё раз.');
  window.addEventListener('hashchange', function(){ if (K) history.replaceState(history.state, '', location.pathname + '#k=' + K); });
  post('pay.site', { k: K }).then(function(r){
    if (!r || !r.title) return fail((r && r.error) || 'Не получилось прочитать ссылку.');
    history.replaceState(history.state, '', location.pathname + '#k=' + K);
    C.innerHTML = '<div class="bw-i"><b>' + esc(r.title) + '</b><span class="bw-p">' + rub(r.rub) + '</span></div>' +
      '<label class="fld"><span>Почта для чека' + (r.receipt ? '' : ' (необязательно)') + '</span><input id="bwe" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com" value="' + esc(r.email || '') + '"></label>' +
      '<p class="hint">Оплата пройдёт на странице ЮKassa: карты «Мир», Visa и Mastercard российских банков, СБП. Данные карты мы не видим.</p>' +
      '<button class="btn big" id="bwg" style="width:100%;margin-top:8px">Перейти к оплате ' + rub(r.rub) + '</button>' +
      '<p class="hint">Нажимая кнопку, вы принимаете <a href="/offer" target="_blank" rel="noopener">оферту</a>. Вопросы и возврат — <a href="/contacts" target="_blank" rel="noopener">контакты</a>.</p>';
    document.getElementById('bwg').onclick = function(){
      var b = this; b.disabled = true; b.textContent = 'Открываем оплату…';
      var e = (document.getElementById('bwe').value || '').trim();
      post('pay.pay', { k: K, email: e }).then(function(x){
        if (x && x.url) { location.assign(x.url); return; }
        fail((x && x.error) || 'Платёжный сервис не ответил. Деньги не списаны.');
      }).catch(function(){ fail('Сеть не ответила. Проверьте связь и попробуйте ещё раз.'); });
    };
  }).catch(function(){ fail('Сеть не ответила. Проверьте связь и попробуйте ещё раз.'); });
})();
