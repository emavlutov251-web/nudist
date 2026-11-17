// Люди рядом. Осознанное включение: координаты округляются на сервере до ~111 м и живут 30 минут.
// Видят — только те, кто тоже включил «Я рядом». Никакого фона, ничего не считаем в сторонних картах.
import { html, useState, useEffect, S, bump, rpc, call, toast, Icon, Avatar, Badges, userName, Modal, closeModal, Spinner } from './lib.js';
import { openUser } from './store.js';

export function NearbyModal({ id }) {
  const [on, setOn] = useState(!!S.ui.nearOn), [d, setD] = useState(null), [busy, setBusy] = useState(false), [until, setUntil] = useState(0);
  const load = async () => {
    setBusy(true);
    try {
      const r = await rpc('near.list', {});
      setD({ users: r.users, km: r.km }); setUntil(r.until || 0);
      for (const u of r.users) S.users[u.id] = { ...S.users[u.id], ...u }; bump();
    } catch (e) { setD({ users: [], km: [] }); toast(e.message, 'err'); }
    setBusy(false);
  };
  const toggle = () => {
    if (on) { rpc('near.off', {}).then(() => { S.ui.nearOn = false; setOn(false); setD(null); toast('Больше никому не видны'); }).catch(e => toast(e.message, 'err')); return; }
    if (!navigator.geolocation) return toast('Геолокация недоступна в этом браузере', 'err');
    setBusy(true);
    navigator.geolocation.getCurrentPosition(async pos => {
      try { const r = await rpc('near.set', { lat: pos.coords.latitude, lon: pos.coords.longitude }); S.ui.nearOn = true; setOn(true); setUntil(r.until || 0); toast('Вы видны только тем, кто тоже включил «Я рядом»'); load(); }
      catch (e) { toast(e.message, 'err'); setBusy(false); }
    }, () => { setBusy(false); toast('Браузер не дал геолокацию. Разрешите её для этого сайта и попробуйте снова', 'err'); }, { enableHighAccuracy: false, maximumAge: 60000, timeout: 10000 });
  };
  useEffect(() => { if (on) load(); }, []);
  const fmtKm = k => k == null ? '' : k < 1 ? Math.max(1, Math.round(k * 1000)) + ' м' : (Math.round(k * 10) / 10).toFixed(1) + ' км';
  return html`<${Modal} id=${id} title="Люди рядом" icon="map-pin" cls="small" footer=${html`<button class="btn ghost" onClick=${() => closeModal(id)}>Закрыть</button><button class="btn" onClick=${toggle} disabled=${busy}>${on ? 'Выключить «Я рядом»' : busy ? 'Ищу вас на карте…' : 'Я рядом'}</button>`}>
    <p class="hint">Видят <b>только</b> те, у кого тоже включён «Я рядом». Координаты округляются до ~100 м и живут 30 минут. Радиус поиска — 50 км. Точное место не передаётся никому, даже администрации.</p>
    ${!on && html`<div class="empty"><${Icon} n="map-pin" s=${40} /><b>Вы сейчас невидимы</b><p>Нажмите «Я рядом» — иначе на карте никого не увидеть и вас тоже не увидят.</p></div>`}
    ${on && !d && html`<${Spinner} />`}
    ${on && d && d.users.length === 0 && html`<div class="empty"><${Icon} n="users" s=${40} /><b>Пока пусто</b><p>В радиусе 50 км ещё никто из «Нудиста» не включил «Я рядом». Возможно, это первый прецедент. Позовите друзей.</p></div>`}
    ${on && d && d.users.length > 0 && html`<div class="near-list">${d.users.map((u, i) => html`<button class="ci" key=${u.id} onClick=${() => { closeModal(id); openUser(u.id); }}>
        <${Avatar} u=${u} src=${u.avatar} name=${userName(u)} color=${u.color} s=${46} online=${u.online && !u.bot} />
        <span class="ci-m"><span class="ci-t"><b>${userName(u)}</b> <${Badges} list=${u.badges} s=${13} /></span><span class="ci-p"><span>${u.username ? '@' + u.username : ''} · ${fmtKm(d.km[i])}</span></span></span>
        <${Icon} n="chevron-right" s=${17} /></button>`)}</div><p class="hint">Список обновляется при открытии окна${until ? ' · видимость до ' + new Date(until).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : ''}.</p>`}
  <//>`;
}
