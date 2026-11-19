// Точка входа: экран входа, каркас приложения, глобальные клавиши и маршруты.
import { html, render, useState, useEffect, useRef, S, bump, useStore, http, rpc, call, toast, Icon, Logo, Avatar, cx, closeMenu, closeModal, confirmDlg, local, openModal, userName, applyTheme, Spinner, copyText, download } from './lib.js';
import { SnowFx } from './events.js';
import { boot, login, logout, openChat, closeChat, onReady, accounts, switchAccount, openUser } from './store.js';
import { BossScreen, funKeys, DAILY_FACTS, sfx } from './fun.js';
import { NavBar, Sidebar } from './sidebar.js';
import { Main } from './chat.js';
import { InfoPanel, JoinPreview, QR, showProfile } from './panels.js';
import { CallLayer } from './rtc.js';
import { MediaViewer, StoryViewer, AudioBar } from './media.js';
import { openSettings } from './settings.js';
import { hashFromHistory } from './back.js';
import './fluent.js';
import { Hub, openHub, openApps } from './hub.js';
import { Dock, foldDock } from './dock.js';
import { takeRef, pendingRef, clearRef, pendingUtm, clearUtm, offerSiteUpdate, StartCards } from './growth.js';
import './i18n.js';
import { appEntryHints } from './hints.js';
takeRef();
// Офлайн-кеш оболочки: со второго захода приложение открывается с диска. Вышла новая версия — докачается в фоне и предложит обновиться.
function swSetup() {
  if (!('serviceWorker' in navigator) || !/^https:|^http:\/\/(localhost|127\.)/.test(location.href)) return;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloading) location.reload(); });
  const offer = w => offerSiteUpdate(() => { reloading = true; w.postMessage('skip'); setTimeout(() => location.reload(), 5000); });      // окно «Вышло обновление»; если новая копия не включилась за 5 секунд — просто перезагружаемся
  navigator.serviceWorker.register('/sw.js').then(reg => {
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => { const w = reg.installing; if (w) w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); }); });
    setInterval(() => reg.update().catch(() => {}), 10 * 60e3);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });      // вернулись в приложение — сразу проверяем, не вышла ли новая версия
  }).catch(() => { /* без кеша тоже работает */ });
}
if (document.readyState === 'complete') swSetup(); else addEventListener('load', swSetup);

// ═════ Политика конфиденциальности ═════
// Полный текст — отдельная страница /privacy. Показываем её во фрейме поверх приложения: так она открывается и в APK, и не сбрасывает форму регистрации.
function PolicyView({ onClose }) {
  useEffect(() => { const k = e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }; addEventListener('keydown', k, true); return () => removeEventListener('keydown', k, true); }, []);
  return html`<div class="pview" role="dialog" aria-modal="true" aria-label="Политика конфиденциальности"><header><b>Политика конфиденциальности</b><button type="button" class="ib" onClick=${onClose} aria-label="Закрыть"><${Icon} n="x" /></button></header><iframe src="/privacy" title="Политика конфиденциальности"></iframe></div>`;
}
// Пока человек не принял действующую редакцию политики, дальше этого экрана приложение не пускает.
function PolicyGate() {
  const [full, setFull] = useState(false), [busy, setBusy] = useState(false);
  const accept = async () => { setBusy(true); try { await rpc('me.policy', { v: S.me.policyNeed }); } catch (e) { toast(e.message, 'err'); } setBusy(false); };
  return html`<div class="pgate"><section class="card" role="dialog" aria-modal="true" aria-labelledby="pgate-t">
    <${Logo} s=${56} /><h2 id="pgate-t">Политика конфиденциальности</h2>
    <p class="dim">${S.me.policy ? 'Политика обновилась. Чтобы продолжить, примите новую редакцию.' : 'Прежде чем продолжить, посмотрите, как «Нудист» обращается с вашими данными.'}</p>
    <ul><li>Для аккаунта нужны только username и пароль. Телефон, город и дата рождения — по желанию.</li><li>Год рождения и возраст другим не показываются: в профиле виден только день и месяц.</li><li>Обычные чаты хранятся на сервере, секретные зашифрованы от всех, включая нас.</li><li>Данные не продаются, рекламы нет. Аккаунт можно удалить в настройках.</li></ul>
    <button type="button" class="btn ghost wide" onClick=${() => setFull(true)}><${Icon} n="file-text" s=${16} /> Читать полностью</button>
    <button type="button" class="btn big wide" disabled=${busy} onClick=${accept}>${busy ? 'Секунду…' : 'Принимаю'}</button>
    <button type="button" class="link" onClick=${() => logout()}>Не согласен — выйти из аккаунта</button>
  </section>${full && html`<${PolicyView} onClose=${() => setFull(false)} />`}</div>`;
}

// ═════ Сброс пароля по ссылке от администрации: /#reset=КЛЮЧ ═════
// Ключ сразу убираем из адресной строки, чтобы он не остался в истории браузера и на снимках экрана.
const takeReset = () => { const m = /^#reset=([\w-]{20,80})$/.exec(location.hash); if (!m) return false; history.replaceState(history.state, '', location.pathname); S.reset = m[1]; return true; };
takeReset(); addEventListener('hashchange', () => { if (takeReset()) bump(); });
function ResetScreen() {
  const tok = S.reset, [info, setInfo] = useState(null), [err, setErr] = useState(''), [f, setF] = useState({ a: '', b: '' }), [busy, setBusy] = useState(false), [res, setRes] = useState(null);
  useEffect(() => { http('reset/info', { token: tok }).then(setInfo, e => setErr(e.message)); }, []);
  const leave = () => { S.reset = null; bump(); };
  const submit = async e => { e.preventDefault(); if (f.a !== f.b) return setErr('Пароли не совпадают'); setErr(''); setBusy(true); try { setRes(await http('reset', { token: tok, password: f.a })); } catch (x) { setErr(x.message); } setBusy(false); };
  const enter = () => { const t = res.token; S.reset = null; S.adding = false; login(t); };
  return html`<div class="auth">
    <section class="auth-brand"><div class="auth-logo"><${Logo} s=${132} /></div><h1 class="wordmark">НУДИСТ</h1><p class="slogan">Новый пароль — и снова на пляж.</p></section>
    <section class="auth-form">
      ${res ? html`<div class="card reset-card"><h2>Пароль изменён</h2>
          <p class="hint">Прежние сеансы завершены. Сохраните коды восстановления: с любым из них в следующий раз смените забытый пароль сами — «Забыли пароль?» на экране входа. Каждый код срабатывает один раз.</p>
          <div class="codes mono">${res.recovery.map(c => html`<span>${c}</span>`)}</div>
          <div class="reset-acts"><button type="button" class="btn ghost" onClick=${() => { copyText(res.recovery.join('\n')); toast('Коды скопированы'); }}>Скопировать</button><button type="button" class="btn ghost" onClick=${() => download('nudist-recovery-codes.txt', 'Коды восстановления «Нудист»' + (info && info.username ? ' для @' + info.username : '') + '\n\n' + res.recovery.join('\n') + '\n', 'text/plain')}>Скачать</button></div>
          <button type="button" class="btn big" onClick=${enter}>Я сохранил — войти</button></div>`
      : !info ? html`<div class="card reset-card"><h2>Сброс пароля</h2>${err ? html`<p class="err" role="alert">${err}</p><p class="hint">Ссылка работает один раз и живёт сутки. Попросите администратора прислать новую.</p><button type="button" class="btn big" onClick=${leave}>На экран входа</button>` : html`<${Spinner} />`}</div>`
      : html`<form class="card reset-card" onSubmit=${submit}><h2>Новый пароль</h2>
          <p class="hint">Аккаунт <b>${info.username ? '@' + info.username : info.name}</b>. После смены все прежние сеансы завершатся, двухфакторная защита выключится.</p>
          <label class="fld"><span>Новый пароль</span><input type="password" value=${f.a} onInput=${e => setF({ ...f, a: e.target.value })} placeholder="минимум 6 символов" autocomplete="new-password" required minlength="6" autofocus /></label>
          <label class="fld"><span>Ещё раз</span><input type="password" value=${f.b} onInput=${e => setF({ ...f, b: e.target.value })} autocomplete="new-password" required minlength="6" /></label>
          ${err && html`<p class="err" role="alert">${err}</p>`}
          <button class="btn big" disabled=${busy}>${busy ? 'Секунду…' : 'Сменить пароль'}</button>
          <p class="auth-alt"><a onClick=${leave}>Не сейчас</a></p></form>`}
    </section></div>`;
}

// ═════ Вход через Telegram ═════
// Три дороги: кнопка на экране входа (код → бот → возврат), одноразовая ссылка из бота (#tgl=…) и мини-приложение внутри Telegram
// (Telegram сам кладёт подписанные данные в адрес: #tgWebAppData=…). Во всех случаях сервер отвечает одним из трёх: «вошли», «ждём»,
// «нужно согласие и username» — поэтому экран один.
const TGJOB = 'nudist.tgjob';
const tgJob = j => { S.tgEnter = j; try { j && j.code ? sessionStorage.setItem(TGJOB, JSON.stringify({ code: j.code, url: j.url, at: j.at })) : sessionStorage.removeItem(TGJOB); } catch (e) { /* без памяти вкладки */ } bump(); };
const tgSignal = () => { for (const ev of ['web_app_ready', 'web_app_expand']) { try { const m = JSON.stringify({ eventType: ev, eventData: '' }); if (window.TelegramWebviewProxy) window.TelegramWebviewProxy.postEvent(ev, ''); else if (window.external && 'notify' in window.external) window.external.notify(m); else if (window.parent !== window) window.parent.postMessage(m, 'https://web.telegram.org'); } catch (e) { /* не в Telegram */ } } };      /* просим Telegram развернуть окно во всю высоту */
(() => {
  const h = location.hash.slice(1), init = h.includes('tgWebAppData=') ? new URLSearchParams(h).get('tgWebAppData') : null, one = (/^tgl=([\w-]{20,60})$/.exec(h) || [])[1];
  if (init || one) history.replaceState(history.state, '', location.pathname + location.search);
  if (init) tgSignal();
  if (local.get('token')) return;      /* уже вошли на этом устройстве — ничего не трогаем */
  if (init) S.tgEnter = { path: 'tg/app', body: { initData: init } };
  else if (one) S.tgEnter = { path: 'tg/link', body: { token: one } };
  else { try { const j = JSON.parse(sessionStorage.getItem(TGJOB) || 'null'); if (j && Date.now() - j.at < 9 * 60e3) S.tgEnter = { path: 'tg/poll', body: { code: j.code }, ...j }; } catch (e) { /* нечего продолжать */ } }      /* вкладку выгрузило, пока человек был в Telegram, — продолжаем ждать */
})();
function TgEnter() {
  const job = S.tgEnter, [st, setSt] = useState({ phase: job.code ? 'wait' : 'load' }), [f, setF] = useState({ username: '', name: '', totp: '' }), [agree, setAgree] = useState(false), [busy, setBusy] = useState(false), [policy, setPolicy] = useState(false), alive = useRef(true), timer = useRef(0);
  const leave = () => tgJob(null);
  const go = async (extra, quiet) => {
    if (!quiet) setBusy(true);
    try {
      const r = await http(job.path, { ...job.body, ...extra, ref: pendingRef() || undefined }); if (!alive.current) return;
      if (r.token) { clearRef(); S.adding = false; tgJob(null); login(r.token); return; }
      if (r.wait) { setSt(s => (s.phase === 'wait' ? s : { phase: 'wait' })); timer.current = setTimeout(() => go({}, true), 2000); }
      else if (r.need === 'agree') { setF(x => ({ ...x, username: x.username || r.username || '', name: x.name || r.name || '' })); setSt({ phase: 'agree', tg: r.tg }); }
      else if (r.need === 'totp') setSt({ phase: 'totp' });
    } catch (e) { if (alive.current) setSt(s => (s.phase === 'agree' || s.phase === 'totp' ? { ...s, err: e.message } : { phase: 'fail', err: e.message })); }
    if (alive.current && !quiet) setBusy(false);
  };
  useEffect(() => { go({}, true); return () => { alive.current = false; clearTimeout(timer.current); }; }, []);
  const submit = e => { e.preventDefault(); if (st.phase === 'agree') { if (!agree) return setSt(s => ({ ...s, err: 'Чтобы создать аккаунт, примите политику конфиденциальности' })); setSt(s => ({ ...s, err: '' })); go({ agree: true, username: f.username.trim(), name: f.name.trim() }); } else go({ totp: f.totp.trim() }); };
  return html`<div class="auth">
    <section class="auth-brand"><div class="auth-logo"><${Logo} s=${132} /></div><h1 class="wordmark">НУДИСТ</h1><p class="slogan">Из Telegram — в два касания.</p></section>
    <section class="auth-form">
      ${st.phase === 'load' ? html`<div class="card tg-card"><h2>Входим через Telegram…</h2><${Spinner} /></div>`
      : st.phase === 'fail' ? html`<div class="card tg-card"><h2>Не получилось</h2><p class="err" role="alert">${st.err}</p><button type="button" class="btn big" onClick=${leave}>На экран входа</button></div>`
      : st.phase === 'wait' ? html`<div class="card tg-card"><h2>Вход через Telegram</h2>
          <ol class="tg-steps"><li>Откройте бота и нажмите <b>Start</b> («Запустить»).</li><li>Вернитесь сюда — вход выполнится сам.</li></ol>
          <a class="btn big tg-btn" href=${job.url} target="_blank" rel="noopener"><${Icon} n="send" s=${18} /> Открыть Telegram</a>
          <p class="hint tg-wait"><${Spinner} /> Ждём, пока вы нажмёте Start…</p>
          <p class="auth-alt"><a onClick=${leave}>Отмена</a></p></div>`
      : html`<form class="card tg-card" onSubmit=${submit}>
          ${st.phase === 'agree' ? html`<h2>Почти готово</h2>
            <p class="hint">Telegram подтвердил, что это вы${st.tg ? ` (@${st.tg})` : ''}. Выберите имя в «Нудисте». Пароль придумывать не нужно: входить будете через Telegram.</p>
            <label class="fld"><span>Как вас зовут</span><input value=${f.name} onInput=${e => setF({ ...f, name: e.target.value })} maxlength="64" autocomplete="name" /></label>
            <label class="fld"><span>Username</span><input value=${f.username} onInput=${e => setF({ ...f, username: e.target.value })} placeholder="latinica_bez_probelov" autocomplete="username" required /></label>
            <label class="agree"><input type="checkbox" checked=${agree} onChange=${e => setAgree(e.target.checked)} /><span>Я принимаю <a role="button" tabindex="0" onClick=${e => { e.preventDefault(); setPolicy(true); }}>политику конфиденциальности</a></span></label>`
          : html`<h2>Двухфакторная защита</h2><label class="fld"><span>Код из приложения-аутентификатора</span><input value=${f.totp} onInput=${e => setF({ ...f, totp: e.target.value })} inputmode="numeric" placeholder="6 цифр или код восстановления" required autofocus /></label>`}
          ${st.err && html`<p class="err" role="alert">${st.err}</p>`}
          <button class="btn big" disabled=${busy}>${busy ? 'Секунду…' : st.phase === 'agree' ? 'Создать аккаунт' : 'Войти'}</button>
          <p class="auth-alt"><a onClick=${leave}>Отмена</a></p></form>`}
    </section>${policy && html`<${PolicyView} onClose=${() => setPolicy(false)} />`}</div>`;
}

// ═════ Вход ═════
const SLOGANS = ['Мессенджер, которому нечего скрывать.', 'Скрывать нечего. Но шифруем на совесть.', 'Голая правда и немного стикеров.', 'Одежда — по желанию. Двухфакторка — обязательно.'];
function Auth() {
  const ref = pendingRef(); const [mode, setMode] = useState(ref ? 'register' : 'login');
  const [f, setF] = useState({ username: '', password: '', name: '', totp: '', rec: '', setup: '' });
  const [cfg, setCfg] = useState(null);      /* что разрешает сервер: вход по номеру (только демо), первый запуск с кодом установки */
  useEffect(() => { fetch('/api/config').then(r => r.json()).then(setCfg).catch(() => {}); }, []);
  /* Вход через Telegram: ссылку на бота готовим заранее, чтобы кнопка открывала Telegram с первого касания (браузеры не дают открыть окно после ожидания ответа). */
  const [tg, setTg] = useState(null);
  useEffect(() => { if (cfg && cfg.tg) http('tg/start').then(r => setTg({ ...r, at: Date.now() })).catch(() => setTg(null)); }, [cfg && cfg.tg]);
  const tgGo = e => {
    if (tg && Date.now() - tg.at < 8 * 60e3) return setTimeout(() => tgJob({ path: 'tg/poll', body: { code: tg.code }, code: tg.code, url: tg.url, at: tg.at }), 50);      /* ссылка свежая: Telegram открывается сам, а здесь — экран ожидания */
    e.preventDefault(); http('tg/start').then(r => tgJob({ path: 'tg/poll', body: { code: r.code }, code: r.code, url: r.url, at: Date.now() })).catch(x => setErr(x.message));
  };
  const [step, setStep] = useState(null); // totp
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const [agree, setAgree] = useState(false), [policy, setPolicy] = useState(false);
  const [slogan] = useState(() => SLOGANS[Math.floor(Math.random() * SLOGANS.length)]);
  const set = k => e => setF(x => ({ ...x, [k]: e.target.value }));
  const go = async fn => { setErr(''); setBusy(true); try { await fn(); } catch (e) { setErr(e.message); } setBusy(false); };
  const done = r => { if (r.token) { S.adding = false; login(r.token); return true; } return false; };
  const submit = e => {
    e.preventDefault();
    go(async () => {
      if (mode === 'register') { if (!agree) throw new Error('Чтобы зарегистрироваться, примите политику конфиденциальности'); const r = await http('register', { username: f.username, password: f.password, name: f.name, agree: true, setup: f.setup || undefined, ref: pendingRef() || undefined, utm: pendingUtm() }); if (r.token) local.set('just.reg', '1'); if (done(r)) { clearRef(); clearUtm(); } }
      else if (mode === 'login') { const r = await http('login', { username: f.username, password: f.password, code: f.totp || undefined }); if (!done(r) && r.need === 'totp') setStep('totp'); }
      else if (mode === 'recover') done(await http('recover', { username: f.username, code: f.rec, password: f.password }));
    });
  };
  const sw = m => { setMode(m); setStep(null); setErr(''); };
  const acc = accounts().filter(a => a.name);
  return html`<div class="auth">
    <section class="auth-brand">
      <div class="auth-logo"><${Logo} s=${132} /></div>
      <h1 class="wordmark">НУДИСТ</h1>
      <p class="slogan">${slogan}</p>
      <ul class="auth-points"><li><${Icon} n="message-circle" s=${18} /> Чаты, группы и каналы — как в Telegram</li><li><${Icon} n="headphones" s=${18} /> Группы с комнатами, ролями и голосовыми</li><li><${Icon} n="leaf" s=${18} /> Спойлеры под фиговым листком, мемы и кнопка «Прикрыться»</li></ul>
    </section>
    <section class="auth-form">
      <form class="card" onSubmit=${submit}>
        <div class="tabs auth-tabs"><button type="button" class=${cx((mode === 'login' || mode === 'register' || mode === 'recover') && 'on')} onClick=${() => sw('login')}>Username</button><button type="button" class=${cx(mode === 'qr' && 'on')} onClick=${() => sw('qr')}>QR-код</button></div>
        ${ref && html`<div class="ref-note"><${Icon} n="gift" s=${18} /><span>Вас зовёт <b>@${ref}</b>. Зарегистрируйтесь — и вы сразу окажетесь у него в контактах, а обоим дадут по 100<${Icon} n="leaf" s=${12} cls="tx-leaf" />.</span></div>`}
        ${mode === 'qr' ? html`<${QrLogin} onToken=${t => done({ token: t })} />` : html`
          <h2>${mode === 'register' ? 'Регистрация' : mode === 'recover' ? 'Восстановление доступа' : 'С возвращением'}</h2>
          ${(mode === 'login' || mode === 'register' || mode === 'recover') && html`
            ${mode === 'register' && html`<label class="fld"><span>Как вас зовут</span><input value=${f.name} onInput=${set('name')} placeholder="Имя" maxlength="64" autocomplete="name" /></label>`}
            <label class="fld"><span>Username</span><input value=${f.username} onInput=${set('username')} placeholder="latinica_bez_probelov" autocomplete="username" required autofocus /></label>
            ${mode === 'recover' && html`<label class="fld"><span>Код восстановления</span><input value=${f.rec} onInput=${set('rec')} placeholder="10 символов из списка кодов" required /></label>`}
            <label class="fld"><span>${mode === 'recover' ? 'Новый пароль' : 'Пароль'}</span><input type="password" value=${f.password} onInput=${set('password')} placeholder="минимум 6 символов" autocomplete=${mode === 'login' ? 'current-password' : 'new-password'} required minlength="6" /></label>
            ${mode === 'register' && cfg && cfg.setup && html`<label class="fld"><span>Код установки</span><input value=${f.setup} onInput=${set('setup')} placeholder="из журнала сервера или файла setup-code.txt" autocomplete="off" required /></label>`}
            ${step === 'totp' && html`<label class="fld"><span>Код двухфакторной защиты</span><input value=${f.totp} onInput=${set('totp')} inputmode="numeric" placeholder="6 цифр или код восстановления" autofocus required /></label>`}`}
          ${mode === 'register' && html`<label class="agree"><input type="checkbox" checked=${agree} onChange=${e => { setAgree(e.target.checked); if (e.target.checked) setErr(''); }} /><span>Я принимаю <a role="button" tabindex="0" onClick=${e => { e.preventDefault(); setPolicy(true); }} onKeyDown=${e => { if (e.key === 'Enter') { e.preventDefault(); setPolicy(true); } }}>политику конфиденциальности</a></span></label>`}
          ${err && html`<p class="err" role="alert">${err}</p>`}
          <button class="btn big" disabled=${busy}>${busy ? 'Секунду…' : mode === 'register' ? 'Раздеться и войти' : mode === 'recover' ? 'Сменить пароль и войти' : 'Войти'}</button>
          ${cfg && cfg.tg && (mode === 'login' || mode === 'register') && html`<a class="btn big ghost tg-btn" href=${tg ? tg.url : 'https://t.me/' + cfg.tg} target="_blank" rel="noopener" onClick=${tgGo}><${Icon} n="send" s=${18} /> ${mode === 'register' ? 'Через Telegram — без пароля' : 'Войти через Telegram'}</a>`}
          ${mode === 'login' && html`<p class="auth-alt">Впервые здесь? <a onClick=${() => sw('register')}>Создать аккаунт</a> · <a onClick=${() => sw('recover')}>Забыли пароль?</a></p>`}
          ${(mode === 'login' || mode === 'register') && html`<p class="auth-alt"><a class="apk-dl" href="/nudist.apk" download="nudist.apk"><${Icon} n="download" s=${15} /> Скачать приложение для Android</a></p>`}
          ${mode === 'register' && html`<p class="auth-alt">Уже есть аккаунт? <a onClick=${() => sw('login')}>Войти</a></p><p class="hint">${cfg && cfg.setup ? 'Сервер новый: первым регистрируется владелец, он же станет администратором. Остальные смогут зарегистрироваться после него.' : 'Номер и почта не нужны. 500 🍃 приветственный бонус — уже на вашем счету.'}</p>`}
          ${mode === 'recover' && html`<p class="auth-alt"><a onClick=${() => sw('login')}>Вспомнил пароль</a></p><p class="hint">Код восстановления — один из тех, что вы сохранили в «Настройки → Аккаунт». <b>Нет кода?</b> Напишите администратору: он пришлёт одноразовую ссылку для сброса. <a href="/contacts" target="_blank" rel="noopener">Как связаться</a>. Сам пароль не знаем даже мы.</p>`}`}
        <p class="auth-legal"><a href="/pay" target="_blank" rel="noopener">Цены и оплата</a> · <a href="/offer" target="_blank" rel="noopener">Оферта</a> · <a href="/contacts" target="_blank" rel="noopener">Контакты и реквизиты</a></p>
        ${S.adding && acc.length > 0 && html`<p class="auth-alt"><a onClick=${() => { S.adding = false; login(acc[0].token); }}>← Вернуться в аккаунт ${acc[0].name}</a></p>`}
      </form>
    </section>${policy && html`<${PolicyView} onClose=${() => setPolicy(false)} />`}</div>`;
}
function QrLogin({ onToken }) {
  const [q, setQ] = useState(null); const [n, setN] = useState(0);
  useEffect(() => {
    let live = true, timer;
    http('qr/new').then(r => { if (!live) return; setQ(r); const poll = async () => { try { const p = await http('qr/poll', { id: r.id, secret: r.secret }); if (!live) return; if (p.token) return onToken(p.token); if (p.expired) return setN(x => x + 1); } catch (e) { /* повтор */ } timer = setTimeout(poll, 1500); }; poll(); }).catch(e => toast(e.message, 'err'));
    return () => { live = false; clearTimeout(timer); };
  }, [n]);
  const link = q ? location.origin + '/#qr=' + q.id : '';
  return html`<div class="qr-login"><h2>Вход по QR-коду</h2>
    <div class="qr-box">${q ? html`<${QR} text=${link} size=${196} />` : html`<${Spinner} />`}</div>
    <ol><li>Откройте «Нудист» на устройстве, где вы уже вошли</li><li>Настройки → Устройства → <b>Подключить устройство</b></li><li>Наведите камеру на код или вставьте код вручную</li></ol>
    ${q && html`<p class="hint">Код для ручного ввода: <code class="mono">${q.id}</code></p>`}</div>`;
}

// ═════ Каркас ═════
function Welcome() {
  const fact = DAILY_FACTS[new Date().getDate() % DAILY_FACTS.length];
  return html`<div class="welcome"><${Logo} s=${72} /><h2>С чего начнём?</h2><p>Или просто выберите чат слева. Мы не осуждаем.</p>
    <${StartCards} />
    <div class="tip"><b>Подсказка дня</b><span>${fact}</span></div>
    <div class="row"><button class="btn ghost" onClick=${() => { const c = Object.values(S.chats).find(x => x.type === 'saved'); c ? openChat(c.id) : openUser(S.me.id); }}><${Icon} n="bookmark" s=${16} /> Избранное</button><button class="btn ghost" onClick=${() => { S.ui.boss = true; bump(); }}><${Icon} n="table" s=${16} /> Прикрыться</button></div></div>`;
}
function Toasts() { return html`<div class="toasts" aria-live="polite">${S.toasts.map(t => html`<div key=${t.id} class=${cx('toast', t.kind)}>${t.text}</div>`)}</div>${S.ui.update && !S.modals.length && html`<div class="upd-bar" role="status"><span>Вышла новая версия «Нудиста»</span><button class="btn sm" onClick=${S.ui.update}>Обновить</button></div>`}`; }
function Menu() {
  const m = S.menu, ref = useRef(); const [sub, setSub] = useState(null);
  useEffect(() => { setSub(null); }, [m]);
  useEffect(() => { const el = ref.current; if (!el || !m) return; const r = el.getBoundingClientRect(); let x = m.right ? m.x - r.width : m.x, y = m.y; if (x + r.width > innerWidth - 8) x = innerWidth - r.width - 8; if (y + r.height > innerHeight - 8) y = Math.max(8, innerHeight - r.height - 8); el.style.left = Math.max(8, x) + 'px'; el.style.top = y + 'px'; el.style.visibility = 'visible'; });
  if (!m) return null;
  const items = sub || m.items;
  return html`<div class="menu-bg" onMouseDown=${closeMenu} onContextMenu=${e => { e.preventDefault(); closeMenu(); }}>
    <div class="menu" ref=${ref} role="menu" style="visibility:hidden" onMouseDown=${e => e.stopPropagation()}>
      ${!sub && m.head}
      ${sub && html`<button class="mi" onClick=${() => setSub(null)}><${Icon} n="chevron-left" s=${17} /> Назад</button><hr />`}
      ${items.map(i => i === '-' ? html`<hr />` : html`<button role="menuitem" class=${cx('mi', i.danger && 'danger', i.on && 'on')} disabled=${i.disabled} onClick=${() => { if (i.sub) return setSub(i.sub.filter(Boolean)); closeMenu(); i.run && i.run(); }}>${i.icon && html`<${Icon} n=${i.icon} s=${17} />`}${i.emoji && html`<span class="mi-e">${i.emoji}</span>`}<span>${i.label}</span>${i.hint && html`<small>${i.hint}</small>`}${i.sub && html`<${Icon} n="chevron-right" s=${15} cls="mi-sub" />`}${i.on && html`<${Icon} n="check" s=${15} cls="mi-sub" />`}</button>`)}
    </div></div>`;
}
function Modals() { return S.modals.map(m => html`<${m.c} key=${m.id} id=${m.id} ...${m.props} />`); }

function App() {
  useStore();
  useEffect(() => {
    if (S.ready && S.me && local.get('just.reg')) {
      local.set('just.reg', null);
      const t = setTimeout(() => import('./growth.js').then(g => g.openInvite()).catch(() => {}), 900);      // новый человек: сразу показываем «Позови друзей»
      return () => clearTimeout(t);
    }
  }, [S.ready, S.me && S.me.id]);
  if (S.reset) return html`<${ResetScreen} /><${Toasts} />`;
  if (S.tgEnter && !S.token) return html`<${TgEnter} /><${Toasts} />`;
  if (!S.token) return html`<${Auth} /><${Toasts} />`;
  if (S.ready && S.me && S.me.policyNeed && S.me.policy !== S.me.policyNeed) return html`<${PolicyGate} /><${Toasts} />`;
  if (!S.ready) return html`<div class="splash"><${Logo} s=${88} /><p>${S.offline ? 'Связь потеряна. Переподключаемся…' : 'Снимаем лишнее…'}</p></div><${Toasts} />`;
  const chat = S.chats[S.ui.chat];
  return html`<div class=${cx('shell', !S.ui.list && chat && 'in-chat', S.ui.panel && chat && 'with-panel', S.ui.hub && 'hub-open')}>
    <${Sidebar} />
    <main class="main">${S.offline && html`<div class="offline"><${Icon} n="refresh-cw" s=${15} /> Нет связи с сервером. Переподключаемся…</div>`}<${AudioBar} />${chat ? html`<${Main} key=${chat.id + (S.ui.thread || '')} chat=${chat} />` : html`<${Welcome} />`}</main>
    ${S.ui.panel && chat && html`<${InfoPanel} chat=${chat} />`}
    <${Hub} />
    <${NavBar} />
    <${SnowFx} />
  </div>
  <${Dock} />
  <${CallLayer} /><${Modals} />${S.viewer && html`<${MediaViewer} />`}${S.storyView && html`<${StoryViewer} />`}<${Menu} /><${Toasts} />${S.ui.boss && html`<${BossScreen} />`}`;
}

// ═════ Глобальные клавиши и ссылки ═════
document.addEventListener('keydown', e => {
  if (funKeys(e)) { e.preventDefault(); return; }
  if (S.ui.boss) return;
  if (e.key === 'Escape') {
    if (S.menu) return closeMenu();
    if (S.viewer) { S.viewer = null; return bump(); }
    if (S.storyView) { S.storyView = null; return bump(); }
    if (S.modals.length) return closeModal();
    if (S.dock && S.dock.open) return foldDock();
    if (S.ui.sel) { S.ui.sel = null; return bump(); }
    if (S.ui.reply || S.ui.edit) { S.ui.reply = null; S.ui.edit = null; return bump(); }
    if (S.ui.thread) { S.ui.thread = null; return bump(); }
    if (S.ui.panel) { S.ui.panel = false; return bump(); }
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); const el = document.getElementById('search'); if (el) { S.ui.list = true; bump(); setTimeout(() => el.focus(), 30); } }
  if ((e.ctrlKey || e.metaKey) && e.key === ',') { e.preventDefault(); openSettings(); }
  if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && S.ready) { // Alt+↑/↓ — соседний чат
    e.preventDefault(); const list = [...document.querySelectorAll('[data-chat]')].map(x => x.dataset.chat); const i = list.indexOf(S.ui.chat); const n = list[i + (e.key === 'ArrowDown' ? 1 : -1)]; if (n) openChat(n, { keepServer: true });
  }
});
document.addEventListener('click', () => { try { if ('Notification' in window && Notification.permission === 'default' && S.ready && S.settings.notif && !local.get('askedNotif')) { local.set('askedNotif', 1); Notification.requestPermission(); } } catch (e) { /* игнор */ } }, { passive: true });
// Ничего не утаскивается: картинки, ссылки и аватары не перетаскиваются ни внутри страницы, ни в другие приложения,
// а бросить что-то на страницу можно только файлом в открытый чат (там свой обработчик).
addEventListener('dragstart', e => { e.preventDefault(); });
for (const ev of ['dragover', 'drop']) addEventListener(ev, e => { const t = e.target; if (!(t && t.closest && t.closest('.chat')) || !(e.dataTransfer && [...e.dataTransfer.types].includes('Files'))) e.preventDefault(); });
// Страница не должна уезжать: если что-то всё же прокрутило окно (фокус в поле, клавиатура), возвращаем на место.
addEventListener('scroll', () => { if (scrollX || scrollY) scrollTo(0, 0); }, { passive: true });
async function handleHash(first) {
  if (/^#hub(=\w+)?$/.test(location.hash)) { const t = location.hash.split('=')[1]; history.replaceState(history.state, '', location.pathname); openHub(['feed', 'video', 'user', 'events', 'music', 'clips', 'live', 'apps', 'help'].includes(t) ? t : 'music'); return; }
  if (location.hash === '#events') { history.replaceState(history.state, '', location.pathname); openHub('events'); return; }
  if (/^#shop(=\w+)?$/.test(location.hash)) { const tab = location.hash.split('=')[1]; history.replaceState(history.state, '', location.pathname); import('./shop.js').then(m => m.openShop(tab)); return; }
  if (/^#buy(=[\w]+)?$/.test(location.hash)) { const it = location.hash.split('=')[1]; history.replaceState(history.state, '', location.pathname); import('./pay.js').then(m => (it ? m.buyItem(it) : import('./panels.js').then(p => openModal(p.StarsModal)))); return; }
  if (/^#stickers(=[\w]+)?$/.test(location.hash)) { const n = location.hash.split('=')[1]; history.replaceState(history.state, '', location.pathname); import('./stickers.js').then(m => m.openImport(n ? { link: 'https://t.me/addstickers/' + n } : {})); return; }
  if (location.hash === '#ask') { history.replaceState(history.state, '', location.pathname); import('./growth.js').then(g => g.openAsk()); return; }
  if (location.hash === '#invite') { history.replaceState(history.state, '', location.pathname); import('./growth.js').then(g => g.openInvite()); return; }
  if (/^#dm=/.test(location.hash)) {
    const hp = new URLSearchParams(location.hash.slice(1));
    const name = String(hp.get('dm') || '').replace(/^@/, '').trim(); const payload = String(hp.get('text') || '').slice(0, 500);
    history.replaceState(history.state, '', location.pathname);
    if (name) {
      const found = Object.values(S.users).find(u => u && u.username && u.username.toLowerCase() === name.toLowerCase());
      const open = u => { openUser(u.id); if (payload) S.ui.prefill = payload; };
      if (found) open(found);
      else rpc('user.get', { username: name }).then(r => r.user && open(r.user)).catch(e => toast(e.message || 'Не нашли пользователя', 'err'));
    }
    return;
  }
  if (first && pendingRef()) { const r = pendingRef(); clearRef(); if (S.me && r.toLowerCase() !== (S.me.username || '').toLowerCase()) { showProfile(null, r); return; } }      // уже вошедший открыл чужую ссылку-приглашение — покажем, кто звал
  const h = location.hash.slice(1); if (!h) { if (first && innerWidth > 800) { const l = local.get('lastChat'); if (l && S.chats[l]) openChat(l); } return; }
  const p = new URLSearchParams(h);
  if (p.get('c') && S.chats[p.get('c')]) { if (S.ui.chat !== p.get('c')) openChat(p.get('c')); }
  else if (p.get('qr')) { history.replaceState(history.state, '', location.pathname); if (await confirmDlg({ title: 'Вход на новом устройстве', text: 'Разрешить вход в ваш аккаунт на устройстве, которое показало этот QR-код? Соглашайтесь, только если это вы.', ok: 'Разрешить вход' })) { if (await call('qr.approve', { id: p.get('qr') }) !== undefined) toast('Готово: новое устройство вошло в аккаунт'); } }
  else if (p.get('join')) { history.replaceState(history.state, '', location.pathname); openModal(JoinPreview, { q: p.get('join') }); }
  else if (p.get('u')) { history.replaceState(history.state, '', location.pathname); showProfile(null, p.get('u')); }
}
onReady(first => { handleHash(first); appEntryHints(); });
window.addEventListener('hashchange', () => S.ready && !hashFromHistory() && handleHash(false));
window.addEventListener('focus', () => bump());

applyTheme();
render(html`<${App} />`, document.getElementById('app'));
if (window.__boot) window.__boot.ok();
boot();
