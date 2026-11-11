// Точка входа: экран входа, каркас приложения, глобальные клавиши и маршруты.
import { html, render, useState, useEffect, useRef, S, bump, useStore, http, rpc, call, toast, Icon, Logo, Avatar, cx, closeMenu, closeModal, confirmDlg, local, openModal, userName, applyTheme, Spinner } from './lib.js';
import { boot, login, openChat, closeChat, onReady, accounts, switchAccount, openUser } from './store.js';
import { BossScreen, funKeys, DAILY_FACTS, sfx } from './fun.js';
import { Rail, Sidebar } from './sidebar.js';
import { Main } from './chat.js';
import { InfoPanel, JoinPreview, QR, showProfile } from './panels.js';
import { CallLayer } from './rtc.js';
import { MediaViewer, StoryViewer, AudioBar } from './media.js';
import { openSettings } from './settings.js';

// ═════ Вход ═════
const SLOGANS = ['Мессенджер, которому нечего скрывать.', 'Скрывать нечего. Но шифруем на совесть.', 'Голая правда и немного стикеров.', 'Одежда — по желанию. Двухфакторка — обязательно.'];
function Auth() {
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ username: '', password: '', name: '', phone: '', code: '', totp: '', rec: '' });
  const [step, setStep] = useState(null); // totp | code | name | password
  const [demo, setDemo] = useState(null);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const [slogan] = useState(() => SLOGANS[Math.floor(Math.random() * SLOGANS.length)]);
  const set = k => e => setF(x => ({ ...x, [k]: e.target.value }));
  const go = async fn => { setErr(''); setBusy(true); try { await fn(); } catch (e) { setErr(e.message); } setBusy(false); };
  const done = r => { if (r.token) { S.adding = false; login(r.token); return true; } return false; };
  const submit = e => {
    e.preventDefault();
    go(async () => {
      if (mode === 'register') done(await http('register', { username: f.username, password: f.password, name: f.name }));
      else if (mode === 'login') { const r = await http('login', { username: f.username, password: f.password, code: f.totp || undefined }); if (!done(r) && r.need === 'totp') setStep('totp'); }
      else if (mode === 'recover') done(await http('recover', { username: f.username, code: f.rec, password: f.password }));
      else if (mode === 'phone') {
        if (!step) { const r = await http('phone/start', { phone: f.phone }); setDemo(r.demoCode); setStep('code'); }
        else { const r = await http('phone/verify', { phone: f.phone, code: f.code, name: f.name || undefined, password: f.password || undefined, totp: f.totp || undefined }); if (!done(r)) setStep(r.need); }
      }
    });
  };
  const sw = m => { setMode(m); setStep(null); setErr(''); setDemo(null); };
  const acc = accounts().filter(a => a.name);
  return html`<div class="auth">
    <section class="auth-brand">
      <div class="auth-logo"><${Logo} s=${132} /></div>
      <h1 class="wordmark">НУДИСТ</h1>
      <p class="slogan">${slogan}</p>
      <ul class="auth-points"><li><${Icon} n="message-circle" s=${18} /> Чаты, группы и каналы — как в Telegram</li><li><${Icon} n="headphones" s=${18} /> Серверы, роли и голосовые — как в Discord</li><li><${Icon} n="leaf" s=${18} /> Спойлеры под фиговым листком, мемы и кнопка «Прикрыться»</li></ul>
    </section>
    <section class="auth-form">
      <form class="card" onSubmit=${submit}>
        <div class="tabs auth-tabs"><button type="button" class=${cx((mode === 'login' || mode === 'register' || mode === 'recover') && 'on')} onClick=${() => sw('login')}>Username</button><button type="button" class=${cx(mode === 'phone' && 'on')} onClick=${() => sw('phone')}>Телефон</button><button type="button" class=${cx(mode === 'qr' && 'on')} onClick=${() => sw('qr')}>QR-код</button></div>
        ${mode === 'qr' ? html`<${QrLogin} onToken=${t => done({ token: t })} />` : html`
          <h2>${mode === 'register' ? 'Регистрация' : mode === 'recover' ? 'Восстановление доступа' : mode === 'phone' ? 'Вход по номеру' : 'С возвращением'}</h2>
          ${(mode === 'login' || mode === 'register' || mode === 'recover') && html`
            ${mode === 'register' && html`<label class="fld"><span>Как вас зовут</span><input value=${f.name} onInput=${set('name')} placeholder="Имя" maxlength="64" autocomplete="name" /></label>`}
            <label class="fld"><span>Username</span><input value=${f.username} onInput=${set('username')} placeholder="latinica_bez_probelov" autocomplete="username" required autofocus /></label>
            ${mode === 'recover' && html`<label class="fld"><span>Код восстановления</span><input value=${f.rec} onInput=${set('rec')} placeholder="10 символов из списка кодов" required /></label>`}
            <label class="fld"><span>${mode === 'recover' ? 'Новый пароль' : 'Пароль'}</span><input type="password" value=${f.password} onInput=${set('password')} placeholder="минимум 6 символов" autocomplete=${mode === 'login' ? 'current-password' : 'new-password'} required minlength="6" /></label>
            ${step === 'totp' && html`<label class="fld"><span>Код двухфакторной защиты</span><input value=${f.totp} onInput=${set('totp')} inputmode="numeric" placeholder="6 цифр или код восстановления" autofocus required /></label>`}`}
          ${mode === 'phone' && html`
            <label class="fld"><span>Номер телефона</span><input type="tel" value=${f.phone} onInput=${set('phone')} placeholder="+7 999 123-45-67" disabled=${!!step} required autofocus /></label>
            ${step && html`<div class="demo-note"><${Icon} n="info" s=${16} /><div><b>Демо-режим.</b> SMS-шлюз не подключён, поэтому код показан прямо здесь: <code class="mono">${demo}</code></div></div>
              <label class="fld"><span>Код из SMS</span><input value=${f.code} onInput=${set('code')} inputmode="numeric" placeholder="5 цифр" required autofocus /></label>`}
            ${step === 'name' && html`<label class="fld"><span>Номер новый — давайте знакомиться</span><input value=${f.name} onInput=${set('name')} placeholder="Ваше имя" required /></label>`}
            ${step === 'password' && html`<label class="fld"><span>Облачный пароль</span><input type="password" value=${f.password} onInput=${set('password')} required /></label>`}
            ${step === 'totp' && html`<label class="fld"><span>Код двухфакторной защиты</span><input value=${f.totp} onInput=${set('totp')} inputmode="numeric" required /></label>`}`}
          ${err && html`<p class="err" role="alert">${err}</p>`}
          <button class="btn big" disabled=${busy}>${busy ? 'Секунду…' : mode === 'register' ? 'Раздеться и войти' : mode === 'recover' ? 'Сменить пароль и войти' : mode === 'phone' && !step ? 'Получить код' : 'Войти'}</button>
          ${mode === 'login' && html`<p class="auth-alt">Впервые здесь? <a onClick=${() => sw('register')}>Создать аккаунт</a> · <a onClick=${() => sw('recover')}>Забыли пароль?</a></p>`}
          ${mode === 'register' && html`<p class="auth-alt">Уже есть аккаунт? <a onClick=${() => sw('login')}>Войти</a></p><p class="hint">Номер телефона не нужен. Первый зарегистрированный аккаунт становится администратором сервиса.</p>`}
          ${mode === 'recover' && html`<p class="auth-alt"><a onClick=${() => sw('login')}>Вспомнил пароль</a></p><p class="hint">Коды восстановления выдаются при включении двухфакторной защиты. Без них пароль не сбросить — мы честно его не знаем.</p>`}`}
        ${S.adding && acc.length > 0 && html`<p class="auth-alt"><a onClick=${() => { S.adding = false; login(acc[0].token); }}>← Вернуться в аккаунт ${acc[0].name}</a></p>`}
      </form>
    </section></div>`;
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
  return html`<div class="welcome"><${Logo} s=${96} /><h2>Выберите, кому написать</h2><p>Или не пишите никому. Мы не осуждаем.</p>
    <div class="tip"><b>Подсказка дня</b><span>${fact}</span></div>
    <div class="row"><button class="btn ghost" onClick=${() => { const c = Object.values(S.chats).find(x => x.type === 'saved'); c ? openChat(c.id) : openUser(S.me.id); }}><${Icon} n="bookmark" s=${16} /> Избранное</button><button class="btn ghost" onClick=${() => { S.ui.boss = true; bump(); }}><${Icon} n="table" s=${16} /> Прикрыться</button></div></div>`;
}
function Toasts() { return html`<div class="toasts" aria-live="polite">${S.toasts.map(t => html`<div key=${t.id} class=${cx('toast', t.kind)}>${t.text}</div>`)}</div>`; }
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
  if (!S.token) return html`<${Auth} /><${Toasts} />`;
  if (!S.ready) return html`<div class="splash"><${Logo} s=${88} /><p>${S.offline ? 'Связь потеряна. Переподключаемся…' : 'Снимаем лишнее…'}</p></div><${Toasts} />`;
  const chat = S.chats[S.ui.chat];
  return html`<div class=${cx('shell', !S.ui.list && chat && 'in-chat', S.ui.panel && chat && 'with-panel')}>
    <${Rail} /><${Sidebar} />
    <main class="main">${S.offline && html`<div class="offline"><${Icon} n="refresh-cw" s=${15} /> Нет связи с сервером. Переподключаемся…</div>`}<${AudioBar} />${chat ? html`<${Main} key=${chat.id + (S.ui.thread || '')} chat=${chat} />` : html`<${Welcome} />`}</main>
    ${S.ui.panel && chat && html`<${InfoPanel} chat=${chat} />`}
  </div>
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
async function handleHash(first) {
  const h = location.hash.slice(1); if (!h) { if (first && innerWidth > 800) { const l = local.get('lastChat'); if (l && S.chats[l]) openChat(l); } return; }
  const p = new URLSearchParams(h);
  if (p.get('c') && S.chats[p.get('c')]) { if (S.ui.chat !== p.get('c')) openChat(p.get('c')); }
  else if (p.get('qr')) { history.replaceState(null, '', location.pathname); if (await confirmDlg({ title: 'Вход на новом устройстве', text: 'Разрешить вход в ваш аккаунт на устройстве, которое показало этот QR-код? Соглашайтесь, только если это вы.', ok: 'Разрешить вход' })) { if (await call('qr.approve', { id: p.get('qr') }) !== undefined) toast('Готово: новое устройство вошло в аккаунт'); } }
  else if (p.get('join')) { history.replaceState(null, '', location.pathname); openModal(JoinPreview, { q: p.get('join') }); }
  else if (p.get('u')) { history.replaceState(null, '', location.pathname); showProfile(null, p.get('u')); }
}
onReady(first => handleHash(first));
window.addEventListener('hashchange', () => S.ready && handleHash(false));
window.addEventListener('focus', () => bump());

applyTheme();
render(html`<${App} />`, document.getElementById('app'));
boot();
