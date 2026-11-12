// Рост и удержание: приглашения друзей, «огонёк» серии переписки, одноразовые фото и видео, установка как приложения.
import { html, useState, useEffect, S, bump, rpc, toast, Icon, Avatar, cx, openModal, closeModal, Modal, userName, copyText, local, Spinner, plural, fmtNum } from './lib.js';
import { QR } from './panels.js';

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
