/* Загрузчик «Нудиста». Обычный скрипт на старом JavaScript: он обязан выполниться даже там, где само приложение не запустится.
   1. Добавляет недостающие функции старым Android System WebView и браузерам.
   2. Переписывает современный CSS (color-mix, dvh, inset) в понятный старым движкам.
   3. Если приложение не стартовало, показывает причину и кнопку «Повторить», а не вечную заставку. */
(function () {
  'use strict';
  var B = window.__boot = { t0: Date.now(), errors: [], started: false, legacy: [] };
  var ua = navigator.userAgent, m = /(?:Chrome|CriOS)\/(\d+)/.exec(ua);
  B.chrome = m ? +m[1] : 0;

  // ───── 1. недостающие функции
  function def(o, k, f) { if (o && !o[k]) { try { Object.defineProperty(o, k, { value: f, writable: true, configurable: true }); } catch (e) { o[k] = f; } B.legacy.push(k); } }
  def(window, 'globalThis', window);
  def(window, 'structuredClone', function clone(v) {
    if (v === null || typeof v !== 'object') return v;
    if (v instanceof Date) return new Date(v.getTime());
    if (v instanceof Blob || v instanceof ArrayBuffer) return v;
    if (Array.isArray(v)) return v.map(clone);
    if (v instanceof Map) { var mp = new Map(); v.forEach(function (x, k) { mp.set(clone(k), clone(x)); }); return mp; }
    if (v instanceof Set) { var st = new Set(); v.forEach(function (x) { st.add(clone(x)); }); return st; }
    var o = {}; for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k)) o[k] = clone(v[k]); return o;
  });
  function at(i) { i = Math.trunc(i) || 0; if (i < 0) i += this.length; return i < 0 || i >= this.length ? undefined : this[i]; }
  def(Array.prototype, 'at', at); def(String.prototype, 'at', at);
  if (window.Uint8Array) def(Object.getPrototypeOf(Uint8Array.prototype), 'at', at);
  def(Object, 'hasOwn', function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); });
  def(Object, 'fromEntries', function (it) { var o = {}; Array.from(it).forEach(function (p) { o[p[0]] = p[1]; }); return o; });
  def(String.prototype, 'replaceAll', function (a, b) { return a instanceof RegExp ? this.replace(a, b) : this.split(a).join(typeof b === 'function' ? b(a) : b); });
  def(Array.prototype, 'flat', function flat(d) { d = d === undefined ? 1 : d; return this.reduce(function (r, x) { return r.concat(Array.isArray(x) && d > 0 ? flat.call(x, d - 1) : [x]); }, []); });
  def(Array.prototype, 'flatMap', function (f, t) { return this.map(f, t).flat(); });
  def(Array.prototype, 'findLast', function (f, t) { for (var i = this.length - 1; i >= 0; i--) if (f.call(t, this[i], i, this)) return this[i]; });
  def(Array.prototype, 'findLastIndex', function (f, t) { for (var i = this.length - 1; i >= 0; i--) if (f.call(t, this[i], i, this)) return i; return -1; });
  def(Promise, 'allSettled', function (a) { return Promise.all(Array.from(a).map(function (p) { return Promise.resolve(p).then(function (v) { return { status: 'fulfilled', value: v }; }, function (e) { return { status: 'rejected', reason: e }; }); })); });
  def(window, 'queueMicrotask', function (f) { Promise.resolve().then(f); });
  if (window.Element) {
    def(Element.prototype, 'replaceChildren', function () { while (this.lastChild) this.removeChild(this.lastChild); for (var i = 0; i < arguments.length; i++) this.appendChild(typeof arguments[i] === 'string' ? document.createTextNode(arguments[i]) : arguments[i]); });
    def(Element.prototype, 'toggleAttribute', function (n, f) { var on = f === undefined ? !this.hasAttribute(n) : !!f; if (on) this.setAttribute(n, ''); else this.removeAttribute(n); return on; });
  }
  if (window.Blob) {
    def(Blob.prototype, 'arrayBuffer', function () { var b = this; return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; r.readAsArrayBuffer(b); }); });
    def(Blob.prototype, 'text', function () { var b = this; return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; r.readAsText(b); }); });
  }
  if (window.AbortSignal && window.AbortController) def(AbortSignal, 'timeout', function (ms) { var c = new AbortController(); setTimeout(function () { c.abort(); }, ms); return c.signal; });
  if (window.crypto && crypto.getRandomValues) def(crypto, 'randomUUID', function () { var b = crypto.getRandomValues(new Uint8Array(16)); b[6] = b[6] & 15 | 64; b[8] = b[8] & 63 | 128; var h = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join(''); return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20); });
  def(window, 'requestIdleCallback', function (f) { return setTimeout(function () { f({ didTimeout: false, timeRemaining: function () { return 10; } }); }, 1); });
  def(window, 'cancelIdleCallback', function (i) { clearTimeout(i); });

  // ───── 2. старый CSS
  var sup = function (p, v) { try { return !!(window.CSS && CSS.supports && CSS.supports(p, v)); } catch (e) { return false; } };
  var noMix = !sup('color', 'color-mix(in srgb, red, blue)'), noDvh = !sup('height', '1dvh'), noInset = !sup('inset', '0');
  var noGap = B.chrome ? B.chrome < 84 : false;      // gap во flex нельзя проверить через CSS.supports, смотрим на версию движка
  var mixes = [], mixIdx = {}, varsEl = null, probe = null;
  function splitTop(s, ch) { var out = [], d = 0, cur = ''; for (var i = 0; i < s.length; i++) { var c = s[i]; if (c === '(') d++; else if (c === ')') d--; if (c === ch && d === 0) { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out.map(function (x) { return x.trim(); }).filter(Boolean); }
  function rewriteMix(css) {
    var out = '', i = 0;
    for (;;) {
      var j = css.indexOf('color-mix(', i); if (j < 0) { out += css.slice(i); break; }
      var k = j + 10, d = 1; while (k < css.length && d > 0) { if (css[k] === '(') d++; else if (css[k] === ')') d--; k++; }
      var expr = css.slice(j + 10, k - 1).replace(/\s+/g, ' ').trim();
      if (!(expr in mixIdx)) { mixIdx[expr] = mixes.length; mixes.push(expr); }
      out += css.slice(i, j) + 'var(--cm-' + mixIdx[expr] + ')'; i = k;
    }
    return out;
  }
  function rewriteInset(css) {
    return css.replace(/([;{]\s*)inset\s*:\s*([^;}]+)/g, function (all, pre, val) {
      var p = splitTop(val, ' '); if (!p.length) return all;
      var t = p[0], r = p[1] || t, b = p[2] || t, l = p[3] || r;
      return pre + 'top: ' + t + '; right: ' + r + '; bottom: ' + b + '; left: ' + l;
    });
  }
  // Отступы gap во flex-контейнерах (нет до Chrome 84) заменяем отступами между соседями. Приблизительно, но без слипшихся кнопок.
  function rewriteGap(css) {
    return css.replace(/([^{}]+)\{([^{}]*)\}/g, function (all, sel, body) {
      if (!/(^|[;\s])gap\s*:/.test(body) || !/display\s*:\s*(inline-)?flex/.test(body) || sel.indexOf('@') >= 0) return all;
      var g = /(?:^|[;\s])gap\s*:\s*([^;]+)/.exec(body); if (!g) return all;
      var v = splitTop(g[1].replace(/!important/, ''), ' '), col = /flex-direction\s*:\s*column/.test(body), wrap = /flex-wrap\s*:\s*wrap|flex-flow[^;]*wrap/.test(body);
      var val = col ? v[0] : (v[1] || v[0]); if (!val || val === '0') return all;
      var sels = splitTop(sel, ',').filter(function (x) { return x.indexOf('::') < 0; }); if (!sels.length) return all;
      var extra = sels.map(function (x) { return x + ' > * + *'; }).join(', ') + ' { ' + (col ? 'margin-top: ' : 'margin-left: ') + val + '; }';
      if (wrap && !col) extra = sels.map(function (x) { return x + ' > *'; }).join(', ') + ' { margin-right: ' + val + '; margin-bottom: ' + (v[0] || val) + '; }';
      return all + ' ' + extra;
    });
  }
  function rgba(c) {
    if (!probe) { probe = document.createElement('i'); probe.style.display = 'none'; document.documentElement.appendChild(probe); }
    probe.style.color = 'rgba(0,0,0,0)'; probe.style.color = c;
    var x = /rgba?\(([^)]+)\)/.exec(getComputedStyle(probe).color); if (!x) return [0, 0, 0, 0];
    var p = x[1].split(/[,\s\/]+/).filter(Boolean).map(parseFloat); return [p[0] || 0, p[1] || 0, p[2] || 0, p.length > 3 ? p[3] : 1];
  }
  function part(s) { var x = /^(.*?)(?:\s+([\d.]+)%)?$/.exec(s); return { c: rgba(x[1].trim()), p: x[2] === undefined ? null : parseFloat(x[2]) / 100 }; }
  function recalc() {
    if (!mixes.length) return;
    var css = ':root{';
    for (var n = 0; n < mixes.length; n++) {
      var a = splitTop(mixes[n], ','), v = 'transparent';
      if (a.length >= 3) {
        var A = part(a[1]), Bc = part(a[2]);
        var p1 = A.p === null ? (Bc.p === null ? .5 : 1 - Bc.p) : A.p, p2 = Bc.p === null ? 1 - p1 : Bc.p, sum = p1 + p2 || 1; p1 /= sum; p2 /= sum;
        var al = A.c[3] * p1 + Bc.c[3] * p2, ch = function (i) { return al ? Math.round((A.c[i] * A.c[3] * p1 + Bc.c[i] * Bc.c[3] * p2) / al) : 0; };
        v = 'rgba(' + ch(0) + ',' + ch(1) + ',' + ch(2) + ',' + Math.round(al * 1000) / 1000 + ')';
      }
      css += '--cm-' + n + ':' + v + ';';
    }
    css += '}';
    if (!varsEl) { varsEl = document.createElement('style'); varsEl.id = 'cm-vars'; document.head.appendChild(varsEl); }
    if (varsEl.textContent !== css) varsEl.textContent = css;
  }
  function legacyCss() {
    var links = document.querySelectorAll('link[rel="stylesheet"]'), left = links.length;
    Array.prototype.forEach.call(links, function (l) {
      var x = new XMLHttpRequest(); x.open('GET', l.href);
      x.onload = function () {
        if (x.status >= 200 && x.status < 300) {
          var css = x.responseText;
          if (noDvh) css = css.replace(/(\d)dvh\b/g, '$1vh');
          if (noMix) css = rewriteMix(css);
          if (noInset) css = rewriteInset(css);
          if (noGap) css = rewriteGap(css);
          var st = document.createElement('style'); st.setAttribute('data-legacy', l.getAttribute('href')); st.textContent = css;
          l.parentNode.insertBefore(st, l); l.parentNode.removeChild(l);
        }
        if (--left === 0) recalc();
      };
      x.onerror = function () { if (--left === 0) recalc(); };
      x.send();
    });
    var pending = false, later = function () { if (pending) return; pending = true; setTimeout(function () { pending = false; recalc(); }, 30); };
    if (window.MutationObserver) new MutationObserver(later).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-contrast', 'data-wall', 'style', 'class'] });
    if (window.matchMedia) { var mq = matchMedia('(prefers-color-scheme: dark)'); if (mq.addListener) mq.addListener(later); }
  }
  // До Chrome 74 вариативные шрифты теряют часть букв — берём системный шрифт.
  if (B.chrome && B.chrome < 74) { var rs = document.documentElement.style; rs.setProperty('--font', 'Roboto, "Noto Sans", sans-serif'); rs.setProperty('--display', 'Roboto, "Noto Sans", sans-serif'); rs.setProperty('--mono', '"Roboto Mono", "Droid Sans Mono", monospace'); B.legacy.push('fonts'); }
  if (noMix || noDvh || noInset || noGap) {
    B.legacy.push('css:' + [noMix && 'color-mix', noDvh && 'dvh', noInset && 'inset', noGap && 'gap'].filter(Boolean).join('+'));
    document.documentElement.setAttribute('data-legacy', '1');
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', legacyCss); else legacyCss();
  }

  // ───── 3. приложение не запустилось
  var reported = false;
  function report(why) {
    if (reported) return; reported = true;
    try {
      var body = JSON.stringify({ why: why, errors: B.errors.slice(0, 6), legacy: B.legacy.join(','), ms: Date.now() - B.t0, url: location.pathname });
      var x = new XMLHttpRequest(); x.open('POST', '/api/clientlog'); x.setRequestHeader('content-type', 'application/json'); x.send(body);
    } catch (e) { /* сообщить не вышло — не страшно */ }
  }
  function fail(why) {
    if (B.started) return;
    var box = document.querySelector('#app .splash'); if (!box || document.getElementById('boot-fail')) return;
    var old = !('noModule' in document.createElement('script')) || (B.chrome && B.chrome < 70);
    var d = document.createElement('div'); d.id = 'boot-fail'; d.style.cssText = 'max-width:340px;padding:0 20px;text-align:center;font-size:14px;line-height:1.45';
    var h = document.createElement('p'); h.style.cssText = 'font-weight:600;margin:14px 0 6px';
    h.textContent = old ? 'Браузер телефона слишком старый' : why === 'slow' ? 'Долго грузится' : 'Не получилось раздеться';
    var t = document.createElement('p'); t.style.margin = '0 0 12px';
    t.textContent = old ? 'Обновите «Android System WebView» и Chrome в магазине приложений, потом откройте «Нудист» снова.'
      : why === 'slow' ? 'Связь слабая или сервер только проснулся. Подождите ещё немного или попробуйте заново.'
      : 'Приложение не загрузилось целиком. Обычно помогает повторить. Если нет — обновите «Android System WebView» и Chrome.';
    var b = document.createElement('button'); b.type = 'button'; b.textContent = 'Повторить';
    b.style.cssText = 'font:inherit;font-weight:600;padding:10px 22px;border:0;border-radius:12px;background:#1F7A4D;color:#fff';
    b.onclick = function () {      // заодно сбрасываем офлайн-кеш: если сломалась именно сохранённая копия, обычная перезагрузка не поможет
      var go = function () { location.reload(); }, t = setTimeout(go, 2500);
      try {
        var jobs = [];
        if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) jobs.push(navigator.serviceWorker.getRegistrations().then(function (l) { return Promise.all(l.map(function (r) { return r.unregister(); })); }));
        if (window.caches && caches.keys) jobs.push(caches.keys().then(function (k) { return Promise.all(k.map(function (x) { return caches.delete(x); })); }));
        Promise.all(jobs).then(function () { clearTimeout(t); go(); }, function () { clearTimeout(t); go(); });
      } catch (e) { clearTimeout(t); go(); }
    };
    var s = document.createElement('p'); s.style.cssText = 'margin:14px 0 0;font-size:11px;opacity:.6;word-break:break-word';
    s.textContent = (B.chrome ? 'Движок: Chrome ' + B.chrome + '. ' : '') + (B.errors[0] || '');
    d.appendChild(h); d.appendChild(t); d.appendChild(b); d.appendChild(s); box.appendChild(d);
    report(why);
  }
  window.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t !== window && t.tagName) { var src = t.src || t.href || ''; if (t.tagName === 'SCRIPT' || t.tagName === 'LINK') { B.errors.push('не загрузился ' + src.split('/').pop()); if (t.tagName === 'SCRIPT') setTimeout(function () { fail('load'); }, 50); } return; }
    B.errors.push((e.message || 'ошибка') + (e.filename ? ' @' + e.filename.split('/').pop() + ':' + e.lineno : ''));
    if (!B.started) setTimeout(function () { fail('error'); }, 50);
  }, true);
  window.addEventListener('unhandledrejection', function (e) { var r = e.reason; B.errors.push('promise: ' + (r && (r.message || r) || '')); });
  setTimeout(function () { if (!B.started) fail(B.errors.length ? 'error' : 'slow'); }, 20000);
  B.ok = function () { if (B.legacy.length && !B.started) report('started-legacy'); B.started = true; var f = document.getElementById('boot-fail'); if (f && f.parentNode) f.parentNode.removeChild(f); };
})();
