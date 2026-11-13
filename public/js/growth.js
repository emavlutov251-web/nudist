// Рост и удержание: приглашения друзей, «огонёк» серии переписки, одноразовые фото и видео, установка как приложения.
import { html, useState, useEffect, S, bump, rpc, on, toast, Icon, Avatar, cx, openModal, closeModal, Modal, userName, copyText, local, Spinner, plural, fmtNum, Toggle, upload, download, fmtShort } from './lib.js';
import { QR } from './panels.js';
import { nativeApp, nativePush } from './store.js';

// ───── приглашения
// Ссылка вида https://…/?ref=username. Открыл не вошедший человек — запоминаем, кто позвал, и показываем регистрацию.
export function takeRef() {
  try {
    const q = new URLSearchParams(location.search), r = (q.get('ref') || '').replace(/[^\w]/g, '').slice(0, 32);
    if (!r) return;
    local.set('ref', r);
    history.replaceState(history.state, '', location.pathname + location.hash);
  } catch (e) { /* адрес без параметров */ }
}
export const pendingRef = () => local.get('ref') || '';
export const clearRef = () => local.set('ref', null);
export const inviteLink = () => location.origin + '/?ref=' + ((S.me && S.me.username) || '');

export function InviteFriends({ id }) {
  const [d, setD] = useState(null), me = S.me, link = inviteLink();
  useEffect(() => { rpc('ref.info').then(setD).catch(e => toast(e.message, 'err')); }, []);
  const text = 'Заходи в «Нудист» — мессенджер, которому нечего скрывать. По моей ссылке обоим дадут листики 🍃';
  const share = async () => {
    if (navigator.share) { try { await navigator.share({ title: 'Нудист', text, url: link }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    copyText(text + '\n' + link); toast('Ссылка и текст скопированы. Вставьте в любой чат.');
  };
  if (!me.username) return html`<${Modal} id=${id} title="Позвать друзей" icon="user-plus">
    <p class="hint">Личная ссылка строится на вашем username, а его пока нет. Задайте его в «Настройки → Профиль» и возвращайтесь.</p><//>`;
  return html`<${Modal} id=${id} title="Позвать друзей" icon="user-plus" footer=${html`<button class="btn ghost" onClick=${() => { copyText(link); toast('Ссылка скопирована'); }}><${Icon} n="copy" s=${16} /> Скопировать</button><button class="btn" onClick=${share}><${Icon} n="share-2" s=${16} /> Поделиться</button>`}>
    <div class="inv">
      <div class="inv-qr"><${QR} text=${link} size=${148} /></div>
      <div class="inv-m">
        <b>Ваша ссылка</b>
        <button class="inv-link mono" title="Скопировать" onClick=${() => { copyText(link); toast('Ссылка скопирована'); }}>${link.replace(/^https?:\/\//, '')}</button>
        <p class="hint">Друг открывает её в любом браузере, регистрируется — и вы сразу друг у друга в контактах. Обоим по ${d ? d.bonus : 50} 🍃.</p>
        <div class="inv-stat"><span><b>${d ? fmtNum(d.invited) : '…'}</b><small>${d ? plural(d.invited, ['друг пришёл', 'друга пришли', 'друзей пришли']) : 'считаем'}</small></span><span><b>${d ? fmtNum(d.earned) : '…'} 🍃</b><small>заработано</small></span></div>
      </div>
    </div>
    ${!d ? html`<${Spinner} />` : d.top.length > 0 && html`<h5 class="inv-h">Доска почёта: кто раздел больше всех</h5>
      <div class="inv-top">${d.top.map((t, i) => html`<div class=${cx('inv-row', t.user.id === me.id && 'me')}><i>${i + 1}</i><${Avatar} src=${t.user.avatar} name=${userName(t.user)} color=${t.user.color} s=${28} /><b>${userName(t.user)}</b><span>${fmtNum(t.n)}</span></div>`)}</div>`}
    ${d && d.by && html`<p class="hint">Вас сюда привёл(а) ${userName(d.by)}. Скажите спасибо.</p>`}<//>`;
}
export const openInvite = () => openModal(InviteFriends);

// ───── «Голая правда»: анонимные вопросы по личной ссылке /q/username
// Ссылку выкладывают в историях других соцсетей; гость спрашивает без регистрации, вопрос приходит в чат с ботом @pravda.
export const askLink = () => location.origin + '/q/' + ((S.me && S.me.username) || '');
// Картинка 1080×1920 для истории: рисуется на устройстве, на сервер не уходит (кроме приложения для Android — там иначе файл не сохранить).
function storyCard(link) {
  const W = 1080, Ht = 1920, c = document.createElement('canvas'); c.width = W; c.height = Ht;
  const x = c.getContext('2d'), F = '"Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif';
  const g = x.createLinearGradient(0, 0, W * 0.5, Ht); g.addColorStop(0, '#27B869'); g.addColorStop(0.5, '#0D7C8C'); g.addColorStop(1, '#0E191B'); x.fillStyle = g; x.fillRect(0, 0, W, Ht);
  x.fillStyle = 'rgba(255,255,255,.08)'; for (const [cx0, cy0, r] of [[940, 220, 260], [120, 1500, 320], [980, 1240, 140]]) { x.beginPath(); x.arc(cx0, cy0, r, 0, 7); x.fill(); }
  const rr = (X, Y, w, h, r) => { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); };
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#fff';
  x.font = '150px ' + F; x.fillText('🍃', W / 2, 430);
  x.font = '700 112px ' + F; ['Задай мне', 'анонимный', 'вопрос'].forEach((t, i) => x.fillText(t, W / 2, 660 + i * 132));
  x.font = '400 46px ' + F; x.fillStyle = 'rgba(255,255,255,.88)'; x.fillText('Спроси что угодно.', W / 2, 1090); x.fillText('Кто спросил — не узнает никто.', W / 2, 1152);
  x.shadowColor = 'rgba(0,0,0,.28)'; x.shadowBlur = 40; x.shadowOffsetY = 14; x.fillStyle = '#fff'; rr(90, 1270, W - 180, 170, 44); x.fill(); x.shadowColor = 'transparent';
  let fs = 52; x.fillStyle = '#0E191B'; do { x.font = '600 ' + fs + 'px ' + F; fs -= 2; } while (x.measureText(link).width > W - 260 && fs > 24); x.fillText(link, W / 2, 1356);
  x.fillStyle = 'rgba(255,255,255,.9)'; x.font = '500 42px ' + F; x.fillText('👆 жми на ссылку', W / 2, 1520);
  x.fillStyle = 'rgba(255,255,255,.6)'; x.font = '500 38px ' + F; x.fillText('Нудист — мессенджер, которому нечего скрывать', W / 2, 1780);
  return new Promise(ok => c.toBlob(ok, 'image/png'));
}
export function AskLink({ id }) {
  const [d, setD] = useState(null), [busy, setBusy] = useState(false), me = S.me, link = askLink(), short = link.replace(/^https?:\/\//, '');
  const load = () => rpc('ask.info').then(setD).catch(e => toast(e.message, 'err'));
  useEffect(() => { load(); }, []);
  const text = 'Задай мне анонимный вопрос — отвечу честно 🍃';
  const copy = () => { copyText(link); toast('Ссылка скопирована. Вставьте её в историю или в описание профиля.'); };
  const share = async () => {
    if (navigator.share) { try { await navigator.share({ title: 'Анонимный вопрос', text, url: link }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    copyText(text + '\n' + link); toast('Текст и ссылка скопированы. Вставьте в любую соцсеть.');
  };
  const story = async () => {
    if (busy) return; setBusy(true);
    try {
      const blob = await storyCard(short), name = 'nudist-vopros.png';
      let shared = false;
      try { const f = new File([blob], name, { type: 'image/png' }); if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], text: text + '\n' + link }); shared = true; } }
      catch (e) { if (e && e.name === 'AbortError') shared = true; }
      if (!shared) {
        if (/NudistAndroid/.test(navigator.userAgent)) { const up = await upload(new File([blob], name, { type: 'image/png' })); download(name, up.url); }      // приложение не умеет сохранять файлы из памяти, только по адресу
        else download(name, blob, 'image/png');
        copyText(link); toast('Картинка сохранена, ссылка скопирована. Выложите картинку в историю и прикрепите ссылку.');
      }
    } catch (e) { toast(e.message || 'Не получилось сделать картинку', 'err'); }
    setBusy(false);
  };
  const toggle = async on => { try { const r = await rpc('ask.set', { open: on }); setD({ ...d, open: r.open }); toast(r.open ? 'Вопросы открыты' : 'Вопросы закрыты. Ссылка покажет, что вы не принимаете вопросы.'); } catch (e) { toast(e.message, 'err'); } };
  const block = async q => { try { await rpc('ask.block', { id: q.id, undo: q.blocked }); toast(q.blocked ? 'Отправитель разблокирован' : 'Этот отправитель больше не сможет вам писать. Кто он — останется тайной.'); load(); } catch (e) { toast(e.message, 'err'); } };
  return html`<${Modal} id=${id} title="Голая правда" icon="venetian-mask" footer=${html`<button class="btn ghost" onClick=${copy}><${Icon} n="copy" s=${16} /> Скопировать</button><button class="btn ghost" onClick=${share}><${Icon} n="share-2" s=${16} /> Поделиться</button><button class="btn" disabled=${busy} onClick=${story}><${Icon} n="image" s=${16} /> Картинка для истории</button>`}>
    <div class="ask">
      <p class="ask-lead">Выложите ссылку в истории или в профиле любой соцсети. Друзья задают вопросы <b>анонимно и без регистрации</b>, а вы читаете их здесь, в чате с ботом «Голая правда».</p>
      <button class="inv-link mono" title="Скопировать" onClick=${copy}>${short}</button>
      <div class="inv-stat"><span><b>${d ? fmtNum(d.got) : '…'}</b><small>${d ? plural(d.got, ['вопрос получен', 'вопроса получено', 'вопросов получено']) : 'считаем'}</small></span><span><b>${d ? fmtNum(d.blocked) : '…'}</b><small>${d ? plural(d.blocked, ['отправитель заблокирован', 'отправителя заблокировано', 'отправителей заблокировано']) : 'считаем'}</small></span></div>
      ${d && html`<${Toggle} on=${d.open} onChange=${toggle} label="Принимать анонимные вопросы" hint="Выключите, если надоело. Ссылка останется той же." />`}
      ${!d ? html`<${Spinner} />` : d.recent.length > 0 && html`<h5 class="inv-h">Последние вопросы</h5>
        <div class="ask-list">${d.recent.map(q => html`<div class=${cx('ask-q', q.blocked && 'off')} key=${q.id}><div><p>${q.text}</p><small>${fmtShort(q.ts)}${q.blocked ? ' · отправитель заблокирован' : ''}</small></div><button class="btn ghost sm" title=${q.blocked ? 'Разблокировать отправителя' : 'Заблокировать отправителя'} onClick=${() => block(q)}><${Icon} n=${q.blocked ? 'eye' : 'ban'} s=${15} /></button></div>`)}</div>`}
      <p class="hint">Мы не показываем вам, кто спросил, и сами этого не знаем: сервер хранит только обезличенную метку, чтобы работала кнопка блокировки. Ссылки из вопросов вырезаются.</p>
    </div><//>`;
}
export const openAsk = () => openModal(AskLink);

// ───── серия переписки
export function Streak({ chat, big }) {
  const k = chat && chat.streak; if (!k) return null;
  return html`<span class=${cx('streak', !k.hot && 'cold', big && 'big')} title=${k.hot ? `Серия: ${k.n} ${plural(k.n, ['день', 'дня', 'дней'])} подряд вы пишете друг другу` : `Серия ${k.n} ${plural(k.n, ['день', 'дня', 'дней'])} сгорит в полночь по Москве. Напишите оба, чтобы продлить`}><${Icon} n="flame" s=${big ? 15 : 13} />${k.n}</span>`;
}

// ───── одноразовые фото и видео
function OnceView({ id, media, type }) {
  const [left, setLeft] = useState(type === 'video' ? 0 : 20);
  useEffect(() => { if (!left) return; const t = setTimeout(() => (left <= 1 ? closeModal(id) : setLeft(left - 1)), 1000); return () => clearTimeout(t); }, [left]);
  const no = e => e.preventDefault();
  return html`<${Modal} id=${id} title=${'Одноразовое ' + (type === 'video' ? 'видео' : 'фото')} icon="flame" cls="once-view" wide>
    <div class="once-stage" onContextMenu=${no} onDragStart=${no}>
      ${type === 'video' ? html`<video src=${media.url} autoplay playsinline controls controlsList="nodownload noplaybackrate" disablePictureInPicture onEnded=${() => closeModal(id)}></video>` : html`<img src=${media.url} alt="" draggable="false" />`}
    </div>
    <p class="hint center">${left ? `Закроется через ${left} с. ` : ''}После закрытия файл стирается с сервера. Второго раза не будет.</p><//>`;
}
export function OnceMsg({ m }) {
  const mine = m.from === S.me.id, seen = m.once === 'seen', what = m.kind === 'video' ? 'видео' : 'фото', [busy, setBusy] = useState(false);
  const open = async () => {
    if (busy) return; setBusy(true);
    try { const r = await rpc('msg.once.open', { chat: m.chat, id: m.id }); openModal(OnceView, { media: r.media, type: r.type }); } catch (e) { toast(e.message, 'err'); }
    setBusy(false);
  };
  const sub = seen ? (mine ? 'Просмотрено и стёрто' : 'Вы посмотрели. Файл стёрт') : mine ? 'Ещё не открыто' : 'Нажмите — откроется один раз';
  return html`<button class=${cx('once', seen && 'seen')} disabled=${mine || seen || busy} onClick=${open}>
    <span class="once-i"><${Icon} n=${seen ? 'eye-off' : 'flame'} s=${22} /></span><span class="once-t"><b>Одноразовое ${what}</b><small>${sub}</small></span></button>`;
}

// ───── приложение на экран (PWA)
let installEvt = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; bump(); });
addEventListener('appinstalled', () => { installEvt = null; bump(); });
export const isStandalone = () => { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true || /NudistAndroid/.test(navigator.userAgent); } catch (e) { return false; } };
export const canInstall = () => !!installEvt;
export async function installApp() {
  if (installEvt) { const e = installEvt; installEvt = null; e.prompt(); try { await e.userChoice; } catch (x) { /* отказ */ } bump(); return; }
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  openModal(({ id }) => html`<${Modal} id=${id} title="Установить как приложение" icon="smartphone">
    ${ios ? html`<ol class="steps"><li>Откройте сайт в Safari.</li><li>Нажмите «Поделиться» (квадрат со стрелкой вверх).</li><li>Выберите «На экран „Домой“».</li></ol><p class="hint">Появится значок «Нудиста», откроется без адресной строки, как обычное приложение.</p>`
      : html`<ol class="steps"><li>Откройте меню браузера (три точки справа вверху).</li><li>Выберите «Установить приложение» или «Добавить на главный экран».</li></ol><p class="hint">На компьютере в Chrome и Edge значок установки есть прямо в адресной строке. На Android можно ещё скачать APK в «Настройки → Продвинутые».</p>`}<//>`);
}

// ───── уведомления при закрытом приложении (Web Push)
// Работают в браузере и в приложении, установленном из браузера. В APK на WebView механизма push нет.
const pushOk = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const keyBytes = k => { const t = atob(k.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - k.length % 4) % 4)), a = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) a[i] = t.charCodeAt(i); return a; };
const withTimeout = (p, ms, msg) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error(msg)), ms))]);
async function pushSub() {
  const reg = await withTimeout(navigator.serviceWorker.ready, 8000, 'Приложение ещё не готово. Обновите страницу и попробуйте снова.'), { key } = await rpc('push.key');
  let sub = await reg.pushManager.getSubscription();
  if (sub && sub.options && sub.options.applicationServerKey && btoa(String.fromCharCode.apply(null, new Uint8Array(sub.options.applicationServerKey))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') !== key) { await sub.unsubscribe(); sub = null; } // ключ сервера сменился
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
  await rpc('push.sub', { sub: sub.toJSON() }); local.set('push.on', true); return sub;
}
async function pushOff() {
  local.set('push.on', null);
  const reg = await withTimeout(navigator.serviceWorker.ready, 8000, 'Приложение ещё не готово'), sub = await reg.pushManager.getSubscription();
  if (sub) { await rpc('push.unsub', { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe(); }
}
// После входа молча обновляем подписку, если человек её уже включал на этом устройстве
on('init', () => { setTimeout(() => { if (pushOk() && Notification.permission === 'granted' && local.get('push.on')) pushSub().catch(() => {}); }, 4000); });
// Приложение для Android: уведомления показывает само приложение (фоновая служба), браузерный механизм не нужен
function AppPush({ id, app }) {
  const read = () => { try { return JSON.parse(app.state()); } catch (e) { return { allowed: true, battery: true, on: false }; } };
  const [st, setSt] = useState(read), [busy, setBusy] = useState(false), enabled = local.get('app.push') !== false;
  useEffect(() => { const t = setInterval(() => setSt(read()), 1500); return () => clearInterval(t); }, []);      // человек возвращается из настроек телефона — статус обновится сам
  const sw = v => { local.set('app.push', v ? null : false); nativePush(); setTimeout(() => setSt(read()), 400); toast(v ? 'Уведомления включены' : 'Уведомления выключены'); };
  const test = async () => { setBusy(true); try { await rpc('push.test', { app: true }); toast('Сверните приложение. Уведомление придёт через 10 секунд.'); } catch (e) { toast(e.message || 'Не получилось', 'err'); } finally { setBusy(false); } };
  return html`<${Modal} id=${id} title="Уведомления" icon="bell">
    <div class="ask">
      <p>Когда «Нудист» свёрнут или закрыт, новые личные сообщения, сообщения в группах, подарки и звонки приходят в шторку телефона. Каналы и серверы присылают только упоминания, чаты с выключенным звуком молчат.</p>
      <${Toggle} label="Уведомления в шторке" hint="На этом телефоне" on=${enabled} onChange=${sw} />
      ${enabled && !st.allowed && html`<div class="note warn"><span>Телефон запрещает «Нудисту» показывать уведомления.</span><button class="btn sm" onClick=${() => app.askNotify()}>Разрешить</button></div>`}
      ${enabled && !st.battery && html`<div class="note"><span>Телефон экономит батарею и может усыплять приложение: уведомления будут опаздывать. Снимите ограничение.</span><button class="btn sm" onClick=${() => app.askBattery()}>Снять</button></div>`}
      ${enabled && html`<p class="hint">Пока уведомления включены, в шторке висит тихая строка «Нудист на связи»: так Android разрешает приложению ждать сообщения. Её можно скрыть: долгое нажатие на неё → выключить «Связь с сервером». На Xiaomi, Huawei, Honor и Samsung дополнительно включите приложению «Автозапуск» в настройках телефона.</p>
        <div class="ask-btns"><button class="btn" disabled=${busy || !st.allowed} onClick=${test}><${Icon} n="bell-ring" s=${16} /> Проверить</button></div>`}
    </div>
  <//>`;
}
export function PushSetup({ id }) {
  const app = nativeApp(); if (app) return html`<${AppPush} id=${id} app=${app} />`;
  const oldApk = / NudistAndroid\//.test(navigator.userAgent);
  const [st, setSt] = useState(!pushOk() ? 'none' : Notification.permission === 'denied' ? 'denied' : Notification.permission === 'granted' && local.get('push.on') ? 'on' : 'off'), [busy, setBusy] = useState(false);
  const run = async f => { setBusy(true); try { await f(); } catch (e) { toast(e.message || 'Не получилось', 'err'); } finally { setBusy(false); } };
  const enable = () => run(async () => {
    const perm = await Notification.requestPermission(); if (perm !== 'granted') { setSt(perm === 'denied' ? 'denied' : 'off'); return toast('Без разрешения браузера уведомления не придут', 'err'); }
    await pushSub(); setSt('on'); toast('Уведомления включены на этом устройстве');
  });
  const disable = () => run(async () => { await pushOff(); setSt('off'); toast('Уведомления на этом устройстве выключены'); });
  const test = () => run(async () => { const r = await rpc('push.test'); toast(r.sent ? 'Отправили. Уведомление придёт через пару секунд.' : 'Служба доставки не приняла уведомление. Выключите и включите заново.', r.sent ? undefined : 'err'); });
  return html`<${Modal} id=${id} title="Уведомления" icon="bell">
    <div class="ask">
      <p>Когда «Нудист» закрыт, новые личные сообщения, сообщения в группах, анонимные вопросы и звонки будут приходить уведомлениями. Каналы и серверы присылают только упоминания, чаты с выключенным звуком молчат.</p>
      ${st === 'none' && (oldApk ? html`<p><b>Нужна новая версия приложения.</b> Уведомления в шторке появились в версии 1.3. Скачайте её и установите поверх старой: переписка и вход сохранятся.</p><a class="btn" href="/nudist.apk" download="nudist.apk"><${Icon} n="download" s=${16} /> Скачать версию 1.3</a>` : html`<p><b>Здесь уведомления недоступны.</b> Этот браузер их не поддерживает. Откройте сайт в Chrome или Яндекс Браузере, нажмите в меню «Установить приложение» и включите уведомления там. На Android проще поставить приложение со страницы /start.</p>`)}
      ${st === 'denied' && html`<p><b>Браузер запретил уведомления для этого сайта.</b> Откройте настройки сайта (значок слева от адреса) и разрешите уведомления, потом вернитесь сюда.</p>`}
      ${st === 'off' && html`<button class="btn" disabled=${busy} onClick=${enable}><${Icon} n="bell-ring" s=${16} /> Включить уведомления</button>`}
      ${st === 'on' && html`<p><b>На этом устройстве включено.</b> На каждом телефоне и компьютере уведомления включаются отдельно.</p>
        <div class="ask-btns"><button class="btn" disabled=${busy} onClick=${test}><${Icon} n="bell-ring" s=${16} /> Проверить</button><button class="btn ghost" disabled=${busy} onClick=${disable}><${Icon} n="bell-off" s=${16} /> Выключить</button></div>`}
    </div>
  <//>`;
}
export const openPush = () => openModal(PushSetup);
