// «Нудист»: музыка, клипы, прямые эфиры, каталог мини-приложений и поддержка. Один экран с вкладками поверх чатов.
import { html, useState, useEffect, useRef, S, bump, rpc, on, toast, Icon, Avatar, cx, openModal, closeModal, Modal, userName, fmtDur, fmtNum, fmtSize, fmtShort, confirmDlg, promptDlg, pickFile, upload, addUsers, Empty, Spinner, local, plural, showMenu, Toggle, md } from './lib.js';
import { openChat, sendPayload } from './store.js';
import { playAudio, AudioBar } from './media.js';
import { openMiniApp } from './panels.js';
import { Feed, Viewers } from './feed.js';

const TABS = [['feed', 'list', 'Лента'], ['music', 'music', 'Музыка'], ['clips', 'film', 'Клипы'], ['live', 'radio', 'Эфиры'], ['apps', 'layout-grid', 'Приложения'], ['help', 'life-buoy', 'Поддержка']];
const isStaff = () => ['moderator', 'admin', 'superadmin'].includes((S.me || {}).admin);
const err = e => toast(e.message || String(e), 'err');
let MB = 45;      // предел размера файла, сервер уточняет
const who = id => S.users[id] || { name: 'Кто-то', color: 0 };

export function openHub(tab) { S.ui.hub = tab || local.get('hub.tab') || 'music'; local.set('hub.tab', S.ui.hub); S.ui.boss = false; bump(); }
export function closeHub() { if (LV.cur && !leaveGuard()) return; S.ui.hub = null; bump(); }
// Не даём случайно уронить эфир переключением вкладки.
function leaveGuard() { if (!LV.cur) return true; if (LV.role === 'host' && !confirm('Эфир идёт. Завершить его?')) return false; leaveLive(); return true; }
function setTab(t) { if (t !== 'live' && !leaveGuard()) return; openHub(t); }

export function Hub() {
  const tab = S.ui.hub; if (!tab) return null;
  return html`<section class=${cx('hub', 'hub-' + tab)} aria-label="Развлечения">
    <header class="hub-h">
      <nav class="hub-tabs" role="tablist">${TABS.map(([k, ic, name]) => html`<button role="tab" aria-selected=${tab === k} class=${cx(tab === k && 'on')} onClick=${() => setTab(k)} title=${name}><${Icon} n=${ic} s=${19} /><span>${name}</span>${k === 'live' && LIVE.n > 0 && html`<b class="hub-dot">${LIVE.n}</b>`}</button>`)}</nav>
      <button class="ib" onClick=${closeHub} title="Закрыть и вернуться к чатам"><${Icon} n="x" /></button>
    </header>
    <div class="hub-b">${tab === 'feed' ? html`<${Feed} />` : tab === 'music' ? html`<${Music} />` : tab === 'clips' ? html`<${Clips} />` : tab === 'live' ? html`<${Live} />` : tab === 'apps' ? html`<div class="hub-pad"><${AppsCatalog} /></div>` : html`<${Help} />`}</div>
    ${tab !== 'clips' && !(tab === 'live' && LV.cur) && html`<${AudioBar} />`}
  </section>`;
}

// ───────────────────────────── музыка
const trackMsg = t => ({ id: 'trk_' + t.id, chat: null, type: 'audio', from: t.by, media: { url: t.url, name: (t.artist && t.artist !== 'Неизвестный исполнитель' ? t.artist + ' — ' : '') + t.title, dur: t.dur } });
const audioDur = f => new Promise(res => { const a = new Audio(); a.preload = 'metadata'; a.onloadedmetadata = () => res(isFinite(a.duration) ? a.duration : 0); a.onerror = () => res(0); setTimeout(() => res(0), 6000); a.src = URL.createObjectURL(f); });
const AUDIO_RE = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac)$/i;
const ups = [];      // идущие загрузки: { name, p }
let musicReload = null;      // открыта вкладка «Музыка» — после загрузки со стороны (например, «Поделиться» на телефоне) список обновится сам
const extMsg = it => ({ id: 'ext_' + it.key, chat: null, type: 'audio', from: S.me.id, media: { url: it.url, name: (it.s === 'rb' ? '📻 ' : it.artist ? it.artist + ' — ' : '') + it.title, dur: it.dur } });
const GENRES = [['рок', 'rock'], ['электроника', 'electronic'], ['лоу-фай', 'lofi'], ['джаз', 'jazz'], ['хип-хоп', 'hiphop'], ['эмбиент', 'ambient'], ['классика', 'classical'], ['пианино', 'piano'], ['фолк', 'folk'], ['метал', 'metal']];
const WAVES = [['все', ''], ['поп', 'pop'], ['рок', 'rock'], ['танцевальное', 'dance'], ['хип-хоп', 'hip-hop'], ['ретро', 'retro'], ['шансон', 'chanson'], ['джаз', 'jazz'], ['чилл', 'chillout'], ['новости', 'news']];
// Загрузка аудиофайлов в «Мою музыку»: и из кнопки «Загрузить», и из «Поделиться» в приложении на телефоне
export async function uploadTracks(files, pub) {
  let ok = 0;
  for (const f of files) {
    if (!AUDIO_RE.test(f.name)) { toast(`«${f.name}» — не аудио. Нужен mp3, m4a, ogg, wav или flac.`, 'err'); continue; }
    if (f.size > MB * 1048576) { toast(`«${f.name}» весит ${fmtSize(f.size)}, а предел — ${MB} МБ.`, 'err'); continue; }
    const u = { name: f.name, p: 0 }; ups.push(u); bump();
    try { const dur = await audioDur(f), up = await upload(f, { name: f.name, onProgress: p => { u.p = p; bump(); } }); await rpc('music.add', { media: { url: up.url, size: f.size, dur, name: f.name }, pub }); ok++; } catch (e) { err(e); }
    ups.splice(ups.indexOf(u), 1); bump();
  }
  if (ok) toast(`Загружено: ${ok} ${plural(ok, ['трек', 'трека', 'треков'])}`);
  return ok;
}
// Приложение на телефоне: в «Нудист» поделились аудио из другой программы. Забираем файлы у оболочки по кусочкам и кладём в «Мою музыку».
let sharing = false, shareKey = '';
export async function takeShared(key) {
  const app = window.NudistApp; if (key) shareKey = key;
  if (sharing || !app || !app.shared || !shareKey || !S.me) return;
  let list = []; try { list = JSON.parse(app.shared(shareKey) || '[]'); } catch (e) { return; }
  if (!list.length) return; sharing = true;
  try {
    openHub('music'); const files = [];
    for (const it of list) {
      const parts = []; let off = 0;
      while (off < it.size) { const b = atob(app.sharedChunk(shareKey, it.i, off, 262144) || ''); if (!b.length) break; const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); parts.push(a); off += a.length; await new Promise(r => setTimeout(r, 0)); }
      if (off >= it.size && it.size > 0) files.push(new File(parts, it.name || 'track.mp3', { type: it.type || 'audio/mpeg' })); else toast(`«${it.name}» не удалось прочитать`, 'err');
    }
    try { app.sharedDone(shareKey); } catch (e) { /* не страшно */ }
    if (files.length && await uploadTracks(files, !!local.get('music.pub'))) { local.set('music.tab', 'my'); if (musicReload) musicReload(); }
  } finally { sharing = false; }
}
// Оболочка присылает событие с пропуском к файлам; пропуск получает только главная страница, вставкам с других сайтов он недоступен
window.addEventListener('nudist-share', e => { takeShared(typeof e.detail === 'string' ? e.detail : ''); });
on('init', () => { setTimeout(() => { try { if (window.NudistApp && window.NudistApp.shareAsk) window.NudistApp.shareAsk(); } catch (e) { /* старая сборка */ } }, 1200); });
function YandexFrame({ id, t }) {
  const x = t.ext, old = / NudistAndroid\//.test(navigator.userAgent) && !(window.NudistApp && window.NudistApp.version && Number(window.NudistApp.version()) >= 14);
  return html`<${Modal} id=${id} title=${t.title} icon="music" cls="small" footer=${html`<a class="btn ghost" href=${x.page} target="_blank" rel="noopener noreferrer"><${Icon} n="external-link" s=${16} /> Открыть в Яндекс Музыке</a>`}>
    ${old ? html`<p class="note warn">В старой версии приложения плеер Яндекса не открывается. Обновите «Нудист» или нажмите кнопку ниже — трек откроется в Яндекс Музыке.</p>`
      : html`<iframe class="ym-frame" style=${`height:${x.kind === 'track' ? 180 : 450}px`} src=${x.frame} allow="autoplay; encrypted-media; clipboard-write" title="Плеер Яндекс Музыки"></iframe>`}
    <p class="hint">Это официальный плеер Яндекс Музыки. Что играть целиком, а что отрывком — решает Яндекс: полные треки он обычно даёт тем, кто вошёл к нему с подпиской.</p><//>`;
}

function Music() {
  const [tab, setTabM] = useState(local.get('music.tab') || 'my'), [q, setQ] = useState(''), [d, setD] = useState(null), [pub, setPub] = useState(!!local.get('music.pub'));
  const [net, setNet] = useState(null), [wave, setWave] = useState(''), [world, setWorld] = useState(false), [page, setPage] = useState(1), [busy, setBusy] = useState(false);
  const outer = tab === 'find' || tab === 'radio';      // «Каталог» и «Радио» — музыка с чужих сайтов, а не наша библиотека
  const go = t => { setQ(''); setPage(1); setTabM(t); local.set('music.tab', t); };
  const load = () => rpc('music.list', { tab, q }).then(r => { addUsers(r.users); if (r.mb) MB = r.mb; if (tab === 'my' && !q && !r.tracks.length && !local.get('music.tab')) return setTabM('all'); setD(r); }).catch(err);      // своей музыки ещё нет — показываем общую, а не пустой экран
  const loadNet = () => { const ask = tab === 'find' ? rpc('tunes.find', { q: q.trim() || 'rock', page }) : rpc('tunes.radio', { q: q.trim(), tag: wave, world }); setBusy(true);
    return ask.then(r => setNet(o => (tab === 'find' && page > 1 && o && !o.error ? { ...r, items: o.items.concat(r.items.filter(i => !o.items.some(j => j.key === i.key))) } : r))).catch(e => { if (page > 1) err(e); else setNet({ items: [], error: e.message }); }).then(() => setBusy(false)); };
  useEffect(() => { if (outer) return; setD(null); const t = setTimeout(load, q ? 250 : 0); return () => clearTimeout(t); }, [tab, q]);
  useEffect(() => { if (!outer || (tab === 'find' && q.trim().length === 1)) return; if (page === 1) setNet(null); const t = setTimeout(loadNet, q ? 900 : 0); return () => clearTimeout(t); }, [tab, q, wave, world, page]);
  useEffect(() => { musicReload = () => { if (tab !== 'my') setTabM('my'); else load(); }; return () => { musicReload = null; }; });
  const cur = S.player && String(S.player.id).startsWith('trk_') ? S.player.id.slice(4) : null;
  useEffect(() => { if (cur) rpc('music.play', { id: cur }).catch(() => {}); }, [cur]);
  const play = t => (t.ext && t.ext.s === 'ym' ? openModal(YandexFrame, { t }) : playAudio(trackMsg(t), d.tracks.filter(x => x.url).map(trackMsg)));
  const playNet = it => playAudio(extMsg(it), net.items.map(extMsg));
  const keepNet = it => rpc('tunes.keep', { key: it.key }).then(() => { setNet(o => ({ ...o, items: o.items.map(i => (i.key === it.key ? { ...i, mine: true } : i)) })); toast(it.s === 'rb' ? 'Станция добавлена в вашу музыку' : 'Добавлено в вашу музыку'); }).catch(err);
  const yandex = async () => {
    const link = await promptDlg({ title: 'Ссылка из Яндекс Музыки', label: 'Трек, альбом или плейлист', placeholder: 'https://music.yandex.ru/album/…/track/…', hint: 'В Яндекс Музыке нажмите «Поделиться» → «Скопировать ссылку» и вставьте её сюда. В «Нудисте» появится официальный плеер Яндекса: сам файл мы не копируем.' }); if (!link) return;
    const title = await promptDlg({ title: 'Как подписать', label: 'Название (можно оставить пустым)', placeholder: 'Исполнитель — трек' });
    rpc('tunes.yandex', { link, title: title || '' }).then(() => { toast('Добавлено в вашу музыку'); if (tab !== 'my') go('my'); else load(); }).catch(err);
  };
  const add = async () => { const files = (await pickFile('audio/*,.mp3,.m4a,.aac,.ogg,.opus,.wav,.flac', true)) || []; if (await uploadTracks(files, pub)) { if (tab !== 'my') go('my'); else load(); } };
  const patch = (t, x) => setD(o => ({ ...o, tracks: o.tracks.map(i => (i.id === t.id ? { ...i, ...x } : i)) }));
  const menu = (e, t) => showMenu(e, [
    t.ext && t.ext.page && { icon: 'external-link', label: t.ext.s === 'ym' ? 'Открыть в Яндекс Музыке' : t.ext.s === 'rb' ? 'Сайт станции' : 'Страница трека у автора', run: () => window.open(t.ext.page, '_blank', 'noopener') },
    t.ext && S.ui.chat && S.chats[S.ui.chat] && S.chats[S.ui.chat].type !== 'secret' && { icon: 'send', label: 'Отправить ссылку в открытый чат', run: () => sendPayload(S.ui.chat, { type: 'text', text: '🎵 ' + trackMsg(t).media.name + '\n' + (t.ext.page || t.url) }).then(() => toast('Ссылка отправлена в чат')).catch(err) },
    !t.ext && S.ui.chat && S.chats[S.ui.chat] && S.chats[S.ui.chat].type !== 'secret' && { icon: 'send', label: 'Отправить в открытый чат', run: () => sendPayload(S.ui.chat, { type: 'audio', media: { url: t.url, size: t.size, dur: t.dur, name: trackMsg(t).media.name + '.' + t.url.split('.').pop(), mime: 'audio/mpeg' } }).then(() => toast('Трек отправлен в чат')).catch(err) },
    !t.own && (t.mine ? { icon: 'x', label: 'Убрать из моей музыки', run: () => rpc('music.save', { id: t.id, on: false }).then(() => (tab === 'my' ? load() : patch(t, { mine: false }))).catch(err) } : { icon: 'plus', label: 'Добавить в мою музыку', run: () => rpc('music.save', { id: t.id }).then(() => { patch(t, { mine: true }); toast('Добавлено в вашу музыку'); }).catch(err) }),
    t.own && { icon: 'pencil', label: 'Название и исполнитель', run: async () => { const title = await promptDlg({ title: 'Название трека', label: 'Название', value: t.title }); if (!title) return; const artist = await promptDlg({ title: 'Исполнитель', label: 'Исполнитель', value: t.artist }); rpc('music.edit', { id: t.id, title, artist: artist == null ? t.artist : artist }).then(r => patch(t, r)).catch(err); } },
    t.own && { icon: 'eye', label: 'Кто слушал', run: () => openModal(Viewers, { title: 'Кто слушал трек', method: 'music.listeners', target: t.id, none: 'Пока никто не слушал. Выложите трек в «Общую волну», если он ещё не там.' }) },
    t.own && { icon: t.pub ? 'lock' : 'globe', label: t.pub ? 'Скрыть из общей волны' : 'Выложить в общую волну', run: () => rpc('music.edit', { id: t.id, pub: !t.pub }).then(r => patch(t, r)).catch(err) },
    (t.own || isStaff()) && '-', (t.own || isStaff()) && { icon: 'trash-2', label: 'Удалить трек', danger: true, run: async () => { if (await confirmDlg({ title: 'Удалить трек?', text: t.ext ? `«${t.title}» исчезнет из вашей музыки и у всех, кто добавил его у вас.` : `«${t.title}» исчезнет у всех, кто его добавил, а файл сотрётся с сервера.`, ok: 'Удалить', danger: true })) rpc('music.del', { id: t.id }).then(load).catch(err); } },
  ].filter(Boolean), { anchor: e.currentTarget });
  return html`<div class="hub-pad music">
    <div class="hub-bar">
      <div class="seg mus-seg"><button class=${cx(tab === 'my' && 'on')} onClick=${() => go('my')}>Моя музыка</button><button class=${cx(tab === 'all' && 'on')} onClick=${() => go('all')}>Общая волна</button><button class=${cx(tab === 'find' && 'on')} onClick=${() => go('find')}>Каталог</button><button class=${cx(tab === 'radio' && 'on')} onClick=${() => go('radio')}>Радио</button></div>
      <label class="search"><${Icon} n="search" s=${16} /><input value=${q} placeholder=${tab === 'find' ? 'Жанр или исполнитель, лучше по-английски' : tab === 'radio' ? 'Название станции' : 'Трек или исполнитель'} onInput=${e => { setPage(1); setQ(e.target.value); }} /></label>
      <button class="btn" onClick=${add}><${Icon} n="upload" s=${16} /> Загрузить</button>
      <button class="btn ghost" onClick=${yandex} title="Добавить трек, альбом или плейлист по ссылке из Яндекс Музыки"><${Icon} n="link" s=${16} /> Из Яндекса</button>
    </div>
    ${!outer && html`<${Toggle} label="Новые треки сразу выкладывать в «Общую волну»" hint="Выключено — трек слышите только вы. Меняется потом в меню трека" on=${pub} onChange=${v => { setPub(v); local.set('music.pub', v); }} />`}
    ${ups.map(u => html`<div class="up-row"><${Icon} n="upload" s=${15} /><span>${u.name}</span><i><b style=${`width:${Math.round(u.p * 100)}%`}></b></i><small>${Math.round(u.p * 100)}%</small></div>`)}
    ${outer && html`
      <div class="chips mus-chips">${tab === 'find' ? GENRES.map(([n, v]) => html`<button class=${cx('chip', (q.trim() || 'rock') === v && 'on')} onClick=${() => { setPage(1); setQ(v); }}>${n}</button>`)
        : html`${WAVES.map(([n, v]) => html`<button class=${cx('chip', wave === v && 'on')} onClick=${() => setWave(v)}>${n}</button>`)}<button class=${cx('chip', world && 'on')} onClick=${() => setWorld(!world)} title="Искать станции не только в России"><${Icon} n="globe" s=${13} /> весь мир</button>`}</div>
      ${!net ? html`<${Spinner} />` : net.error ? html`<${Empty} icon="refresh-cw" title="Не получилось" text=${net.error}><button class="btn" onClick=${loadNet}>Повторить</button><//>` : !net.items.length ? html`<${Empty} icon=${tab === 'find' ? 'music' : 'radio'} title="Ничего не нашлось" text=${tab === 'find' ? 'В каталоге музыка независимых авторов со свободными лицензиями. Попробуйте жанр по-английски: rock, lofi, piano.' : 'Попробуйте другое название или включите «весь мир».'} />` : html`
        <div class="trk-list" role="list">${net.items.map((it, i) => { const on = S.player && S.player.id === 'ext_' + it.key; return html`<div role="listitem" key=${it.key} class=${cx('trk', on && 'on')} onDblClick=${() => playNet(it)}>
          <button class="trk-p" onClick=${() => playNet(it)} title=${on && S.player.on ? 'Пауза' : 'Слушать'}>${on ? html`<${Icon} n=${S.player.on ? 'pause' : 'play'} s=${17} />` : html`<span class="trk-n">${i + 1}</span><${Icon} n="play" s=${17} />`}</button>
          <div class="trk-m" onClick=${() => playNet(it)}><b>${it.title}</b><small>${it.artist}${it.s === 'ov' ? ` · ${it.from}${it.lic ? ' · ' + it.lic : ''}` : it.kbps ? ` · ${it.kbps} кбит/с` : ''}</small></div>
          ${it.page && html`<a class="ib sm" href=${it.page} target="_blank" rel="noopener noreferrer" title=${it.s === 'ov' ? 'Страница трека у автора' : 'Сайт станции'}><${Icon} n="external-link" s=${16} /></a>`}
          <span class="trk-d">${it.dur ? fmtDur(it.dur) : it.s === 'rb' ? 'эфир' : '—'}</span>
          ${it.mine ? html`<span class="ib sm" title="Уже в вашей музыке"><${Icon} n="check" s=${17} /></span>` : html`<button class="ib sm" title="Добавить в мою музыку" onClick=${() => keepNet(it)}><${Icon} n="plus" s=${17} /></button>`}</div>`; })}</div>
        ${tab === 'find' && net.more && html`<div class="center"><button class="btn ghost" disabled=${busy} onClick=${() => setPage(page + 1)}>Показать ещё</button></div>`}
        <p class="hint center">${tab === 'find' ? 'Музыка играет прямо с сайтов авторов (Jamendo, Wikimedia Commons) по свободным лицензиям — у каждого трека указаны автор, лицензия и ссылка. Поиск через Openverse.' : 'Станции из открытого справочника Radio Browser. Звук идёт напрямую со станции; если молчит — станция легла, попробуйте другую.'}</p>`}`}
    ${outer ? null : !d ? html`<${Spinner} />` : !d.tracks.length ? html`<${Empty} icon="music" title=${q ? 'Ничего не нашлось' : tab === 'my' ? 'Тут пока тихо' : 'В общей волне пусто'} text=${q ? 'Попробуйте другое слово.' : tab === 'my' ? `Загрузите свои mp3 — и слушайте их с любого устройства. Подходят ещё m4a, ogg, wav и flac, до ${MB} МБ каждый. А можно ничего не загружать: найдите музыку в каталоге или включите радио.` : 'Никто ещё ничего не выложил. Станьте первым диджеем пляжа.'}>${!q && html`<button class="btn" onClick=${add}><${Icon} n="upload" s=${16} /> Загрузить музыку</button><button class="btn ghost" onClick=${() => go('find')}><${Icon} n="search" s=${16} /> Каталог</button><button class="btn ghost" onClick=${() => go('radio')}><${Icon} n="radio" s=${16} /> Радио</button>`}<//>` : html`
      <div class="trk-list" role="list">${d.tracks.map((t, i) => { const on = cur === t.id; return html`<div role="listitem" key=${t.id} class=${cx('trk', on && 'on')} onDblClick=${() => play(t)}>
        <button class="trk-p" onClick=${() => play(t)} title=${on && S.player.on ? 'Пауза' : 'Слушать'}>${on ? html`<${Icon} n=${S.player.on ? 'pause' : 'play'} s=${17} />` : html`<span class="trk-n">${i + 1}</span><${Icon} n="play" s=${17} />`}</button>
        <div class="trk-m" onClick=${() => play(t)}><b>${t.ext && t.ext.s === 'rb' ? '📻 ' : ''}${t.title}</b><small>${t.artist}${t.ext && t.ext.s === 'ov' ? ` · ${t.ext.from}${t.ext.lic ? ' · ' + t.ext.lic : ''}` : ''}${tab === 'all' && !t.own ? (t.ext ? ' · добавил(а) ' : ' · загрузил(а) ') + userName(who(t.by)) : ''}</small></div>
        ${t.pub ? html`<span class="trk-tag" title="Трек в общей волне"><${Icon} n="globe" s=${13} /> ${fmtNum(t.plays)}</span>` : html`<span class="trk-tag" title="Трек виден только вам"><${Icon} n="lock" s=${13} /></span>`}
        <span class="trk-d">${t.dur ? fmtDur(t.dur) : t.ext && t.ext.s === 'rb' ? 'эфир' : t.ext && t.ext.s === 'ym' ? 'Яндекс' : '—'}</span>
        ${!t.own && !t.mine && html`<button class="ib sm" title="Добавить в мою музыку" onClick=${() => rpc('music.save', { id: t.id }).then(() => { patch(t, { mine: true }); toast('Добавлено в вашу музыку'); }).catch(err)}><${Icon} n="plus" s=${17} /></button>`}
        <button class="ib sm" title="Ещё" onClick=${e => menu(e, t)}><${Icon} n="ellipsis" s=${17} /></button></div>`; })}</div>
      <p class="hint center">${d.total} ${plural(d.total, ['трек', 'трека', 'треков'])}${tab === 'my' ? ` из ${d.max} возможных` : ''}. Загружайте только то, на что у вас есть права.</p>`}
  </div>`;
}

// ───────────────────────────── клипы
const videoMeta = f => new Promise(res => { const v = document.createElement('video'); v.preload = 'metadata'; v.onloadedmetadata = () => res({ w: v.videoWidth, h: v.videoHeight, dur: isFinite(v.duration) ? v.duration : 0 }); v.onerror = () => res({}); setTimeout(() => res({}), 8000); v.src = URL.createObjectURL(f); });
const CL = { list: null, more: false, sound: true, seen: new Set() };      // лента живёт между открытиями вкладки

function Clips() {
  const [act, setAct] = useState(0), [busy, setBusy] = useState(null), box = useRef(), [paused, setPaused] = useState(false), loading = useRef(false);
  const load = async reset => { if (loading.current) return; loading.current = true; try { const r = await rpc('clip.feed', { off: reset ? 0 : CL.next || (CL.list || []).length }); CL.next = r.next != null ? r.next : (reset ? 0 : CL.next || 0) + r.clips.length; addUsers(r.users); if (r.mb) MB = r.mb; CL.list = reset ? r.clips : (CL.list || []).concat(r.clips.filter(k => !CL.list.some(x => x.id === k.id))); CL.more = r.more; bump(); } catch (e) { err(e); if (!CL.list) { CL.list = []; bump(); } } loading.current = false; };
  useEffect(() => { load(true); }, []);
  const list = CL.list || [];
  // Какой клип сейчас на экране: тот, чья середина ближе всего к середине ленты.
  const onScroll = () => { const el = box.current; if (!el) return; const i = Math.round(el.scrollTop / (el.clientHeight || 1)); if (i !== act) { setAct(i); setPaused(false); } if (CL.more && i >= list.length - 3) load(); };
  useEffect(() => {      // играет только активный; остальные стоят на паузе в начале
    const el = box.current; if (!el) return;
    el.querySelectorAll('video').forEach((v, i) => { if (i === act && !paused) { v.muted = !CL.sound; const p = v.play(); if (p && p.catch) p.catch(() => { v.muted = true; CL.sound = false; v.play().catch(() => {}); bump(); }); } else { v.pause(); if (i !== act) try { v.currentTime = 0; } catch (e) { /* ещё не загружено */ } } });
    const k = list[act]; if (!k || CL.seen.has(k.id)) return;
    const t = setTimeout(() => { CL.seen.add(k.id); k.views++; rpc('clip.view', { id: k.id }).catch(() => {}); }, 2000); return () => clearTimeout(t);
  }, [act, paused, list.length, CL.sound]);
  const add = async () => {
    const f = await pickFile('video/mp4,video/webm,video/quicktime,video/*', false); if (!f) return;
    if (f.size > MB * 1048576) return toast(`Видео весит ${fmtSize(f.size)}, а предел — ${MB} МБ. Сожмите его или обрежьте.`, 'err');
    const m = await videoMeta(f); if (m.dur > 180) return toast('Клип — это до 3 минут. Обрежьте видео.', 'err');
    const text = await promptDlg({ title: 'Новый клип', label: 'Подпись (можно пустую)', placeholder: 'Что тут происходит?', hint: m.w > m.h ? 'Видео горизонтальное: в ленте оно будет с полями. Вертикальное смотрится лучше.' : `${fmtSize(f.size)}${m.dur ? ', ' + fmtDur(m.dur) : ''}`, ok: 'Выложить', allowEmpty: true });
    if (text == null) return;
    setBusy(0);
    try { const up = await upload(f, { name: f.name, onProgress: p => setBusy(p) }); await rpc('clip.add', { media: { url: up.url, size: f.size, ...m }, text }); toast('Клип выложен'); await load(true); if (box.current) box.current.scrollTop = 0; setAct(0); } catch (e) { err(e); }
    setBusy(null);
  };
  const like = k => { const on = !k.liked; k.liked = on; k.likes += on ? 1 : -1; bump(); rpc('clip.like', { id: k.id, on }).then(r => { Object.assign(k, r); bump(); }).catch(err); };
  const del = async k => { if (await confirmDlg({ title: 'Удалить клип?', text: 'Видео и комментарии исчезнут насовсем.', ok: 'Удалить', danger: true })) rpc('clip.del', { id: k.id }).then(() => { CL.list = CL.list.filter(x => x !== k); bump(); }).catch(err); };
  return html`<div class="clips-wrap">
    <div class="clips-top"><button class="btn" disabled=${busy != null} onClick=${add}><${Icon} n=${busy != null ? 'upload' : 'plus'} s=${16} /> ${busy != null ? `Загрузка ${Math.round(busy * 100)}%` : 'Выложить клип'}</button></div>
    ${!CL.list ? html`<${Spinner} />` : !list.length ? html`<${Empty} icon="film" title="Клипов пока нет" text="Выложите первое вертикальное видео до 3 минут — и лента оживёт.">${html`<button class="btn" onClick=${add}><${Icon} n="plus" s=${16} /> Выложить клип</button>`}<//>` : html`
    <div class="clips" ref=${box} onScroll=${onScroll}>${list.map((k, i) => { const u = who(k.by); return html`<article class="clip" key=${k.id}>
      <div class="clip-v" onClick=${() => i === act && setPaused(!paused)}>
        <video src=${Math.abs(i - act) <= 1 ? k.url : undefined} loop playsinline disableRemotePlayback preload=${i === act ? 'auto' : 'metadata'}></video>
        ${i === act && paused && html`<span class="clip-pause"><${Icon} n="play" s=${44} /></span>`}
        <div class="clip-info"><button class="clip-au" onClick=${e => { e.stopPropagation(); import('./panels.js').then(P => P.showProfile(k.by)); }}><${Avatar} src=${u.avatar} name=${userName(u)} color=${u.color} s=${34} /><b>${userName(u)}</b><small>${fmtShort(k.ts)}</small></button>${k.text && html`<p>${k.text}</p>`}</div>
      </div>
      <div class="clip-act">
        <button class=${cx(k.liked && 'on')} onClick=${() => like(k)} title="Нравится"><${Icon} n="heart" s=${26} /><small>${fmtNum(k.likes)}</small></button>
        <button onClick=${() => openModal(ClipComments, { clip: k })} title="Комментарии"><${Icon} n="message-circle" s=${26} /><small>${fmtNum(k.comments)}</small></button>
        <button title=${k.own ? 'Кто посмотрел' : 'Просмотры'} disabled=${!k.own} onClick=${() => k.own && openModal(Viewers, { title: 'Кто посмотрел клип', method: 'clip.viewers', target: k.id })}><${Icon} n="eye" s=${24} /><small>${fmtNum(k.views)}</small></button>
        <button onClick=${() => { CL.sound = !CL.sound; bump(); }} title=${CL.sound ? 'Выключить звук' : 'Включить звук'}><${Icon} n=${CL.sound ? 'volume-2' : 'volume-x'} s=${24} /></button>
        ${(k.own || isStaff()) && html`<button onClick=${() => del(k)} title="Удалить клип"><${Icon} n="trash-2" s=${22} /></button>`}
      </div></article>`; })}</div>`}
  </div>`;
}
function ClipComments({ id, clip }) {
  const [list, setList] = useState(null), [text, setText] = useState(''), end = useRef();
  useEffect(() => { rpc('clip.comments', { id: clip.id }).then(r => { addUsers(r.users); setList(r.list); }).catch(err); }, []);
  useEffect(() => { if (end.current) end.current.scrollIntoView({ block: 'end' }); }, [list && list.length]);
  const send = async e => { e && e.preventDefault(); const t = text.trim(); if (!t) return; setText(''); try { const r = await rpc('clip.comment', { id: clip.id, text: t }); addUsers(r.users); setList(l => (l || []).concat(r.item)); clip.comments = r.comments; bump(); } catch (x) { err(x); setText(t); } };
  const del = c => rpc('clip.uncomment', { id: clip.id, cid: c.id }).then(r => { setList(l => l.filter(x => x !== c)); clip.comments = r.comments; bump(); }).catch(err);
  return html`<${Modal} id=${id} title=${'Комментарии' + (list ? ` · ${list.length}` : '')} icon="message-circle" footer=${html`<form class="cm-form" onSubmit=${send}><input value=${text} maxlength="500" placeholder="Скажите что-нибудь доброе" onInput=${e => setText(e.target.value)} autofocus /><button class="btn" disabled=${!text.trim()}><${Icon} n="send" s=${16} /></button></form>`}>
    ${!list ? html`<${Spinner} />` : !list.length ? html`<${Empty} icon="message-circle" text="Комментариев нет. Тишина как на диком пляже." />` : html`<div class="cm-list">${list.map(c => { const u = who(c.by); return html`<div class="cm" key=${c.id}><${Avatar} src=${u.avatar} name=${userName(u)} color=${u.color} s=${32} /><div><b>${userName(u)}</b> <small>${fmtShort(c.ts)}</small><p>${c.text}</p></div>${(c.by === S.me.id || clip.own || isStaff()) && html`<button class="ib sm" title="Удалить" onClick=${() => del(c)}><${Icon} n="x" s=${15} /></button>`}</div>`; })}<span ref=${end}></span></div>`}<//>`;
}

// ───────────────────────────── прямые эфиры
// Ведущий отдаёт видео каждому зрителю напрямую (WebRTC). Сервер знакомит их и ведёт чат.
const LIVE = { list: null, n: 0, max: 30 };
const LV = { cur: null, role: null, stream: null, remote: null, pcs: new Map(), ice: [], chat: [], n: 0, host: null, pending: [], hearts: [], muted: false, state: '' };
const sig = (to, data) => rpc('live.signal', { id: LV.cur.id, to, data }).catch(() => {});
function loadLives() { return rpc('live.list').then(r => { addUsers(r.users); LIVE.list = r.list; LIVE.n = r.list.length; LIVE.max = r.max; bump(); }).catch(() => {}); }
function resetLive() { for (const pc of LV.pcs.values()) try { pc.close(); } catch (e) { /* уже закрыт */ } LV.pcs.clear(); if (LV.stream) LV.stream.getTracks().forEach(t => t.stop()); Object.assign(LV, { cur: null, role: null, stream: null, remote: null, chat: [], n: 0, host: null, pending: [], hearts: [], muted: false, state: '' }); bump(); }
function leaveLive() { const l = LV.cur; if (!l) return; rpc(LV.role === 'host' ? 'live.stop' : 'live.leave', { id: l.id }).catch(() => {}); resetLive(); loadLives(); }
async function startLive(title, kind) {
  let stream;
  try {
    if (kind === 'screen') { stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true }); try { const mic = await navigator.mediaDevices.getUserMedia({ audio: true }); mic.getAudioTracks().forEach(t => stream.addTrack(t)); } catch (e) { /* без микрофона тоже эфир */ } }
    else stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }, audio: { echoCancellation: true, noiseSuppression: true } });
  } catch (e) { return toast(kind === 'screen' ? 'Не получилось захватить экран. На телефонах браузер этого обычно не умеет — выберите камеру.' : 'Нет доступа к камере и микрофону. Разрешите их в настройках браузера.', 'err'); }
  try { const r = await rpc('live.start', { title, kind }); Object.assign(LV, { cur: r.live, role: 'host', stream, ice: r.ice, chat: [], n: 0, state: 'on' }); stream.getVideoTracks().forEach(t => { t.onended = () => { toast('Источник видео отключился — эфир завершён'); leaveLive(); }; }); openHub('live'); }
  catch (e) { stream.getTracks().forEach(t => t.stop()); err(e); }
}
async function joinLive(l) {
  try { const r = await rpc('live.join', { id: l.id }); addUsers(r.users); Object.assign(LV, { cur: r.live, role: 'viewer', ice: r.ice, chat: r.chat || [], n: r.live.viewers, state: 'wait' }); bump(); setTimeout(() => { if (LV.cur && LV.cur.id === l.id && LV.state === 'wait') { LV.state = 'fail'; bump(); } }, 15000); }
  catch (e) { err(e); loadLives(); }
}
on('live.upd', () => { if (S.ui.hub === 'live' || LIVE.list) loadLives(); else rpc('live.list').then(r => { LIVE.n = r.list.length; bump(); }).catch(() => {}); });
on('live.viewer', async d => {      // ведущему: пришёл зритель — отдаём ему дорожки
  if (!LV.cur || LV.role !== 'host' || d.id !== LV.cur.id) return;
  const pc = new RTCPeerConnection({ iceServers: LV.ice }); LV.pcs.set(d.conn, pc);
  LV.stream.getTracks().forEach(t => pc.addTrack(t, LV.stream));
  pc.onicecandidate = e => { if (e.candidate) sig(d.conn, { ice: e.candidate }); };
  try { await pc.setLocalDescription(await pc.createOffer()); sig(d.conn, { sdp: pc.localDescription }); } catch (e) { /* зритель ушёл */ }
});
on('live.gone', d => { const pc = LV.pcs.get(d.conn); if (pc) { try { pc.close(); } catch (e) { /* закрыт */ } LV.pcs.delete(d.conn); } });
on('live.signal', async d => {
  if (!LV.cur || d.id !== LV.cur.id) return; const x = d.data || {};
  try {
    if (LV.role === 'host') { const pc = LV.pcs.get(d.from); if (!pc) return; if (x.sdp) await pc.setRemoteDescription(x.sdp); else if (x.ice) await pc.addIceCandidate(x.ice); return; }
    if (x.sdp) {
      LV.host = d.from; let pc = LV.pcs.get('host'); if (pc) try { pc.close(); } catch (e) { /* закрыт */ }
      pc = new RTCPeerConnection({ iceServers: LV.ice }); LV.pcs.set('host', pc);
      pc.ontrack = e => { LV.remote = e.streams[0] || new MediaStream([e.track]); LV.state = 'on'; bump(); };
      pc.onicecandidate = e => { if (e.candidate) sig(d.from, { ice: e.candidate }); };
      pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed' && LV.pcs.get('host') === pc) { LV.state = 'fail'; bump(); } };
      await pc.setRemoteDescription(x.sdp); await pc.setLocalDescription(await pc.createAnswer()); sig(d.from, { sdp: pc.localDescription });
      for (const c of LV.pending.splice(0)) await pc.addIceCandidate(c).catch(() => {});
    } else if (x.ice) { const pc = LV.pcs.get('host'); if (pc && pc.remoteDescription) await pc.addIceCandidate(x.ice); else LV.pending.push(x.ice); }
  } catch (e) { console.warn('[live]', e); }
});
on('live.count', d => { if (LV.cur && d.id === LV.cur.id) { LV.n = d.n; bump(); } });
on('live.msg', d => { if (LV.cur && d.id === LV.cur.id) { if (d.user) S.users[d.user.id] = { ...S.users[d.user.id], ...d.user }; LV.chat.push(d.m); if (LV.chat.length > 200) LV.chat.shift(); bump(); } });
on('live.react', d => { if (LV.cur && d.id === LV.cur.id) { const h = { k: Math.random(), e: d.e, x: 10 + Math.random() * 60 }; LV.hearts.push(h); bump(); setTimeout(() => { LV.hearts = LV.hearts.filter(i => i !== h); bump(); }, 2200); } });
on('live.end', d => { if (LV.cur && d.id === LV.cur.id) { toast(d.why || 'Эфир завершён'); resetLive(); loadLives(); } });

function StartLive({ id }) {
  const [title, setTitle] = useState(''), [kind, setKind] = useState('cam'), [busy, setBusy] = useState(false), can = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia), canScreen = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
  const go = async () => { setBusy(true); await startLive(title.trim(), kind); setBusy(false); if (LV.cur) closeModal(id); };
  return html`<${Modal} id=${id} title="Начать эфир" icon="radio" footer=${html`<button class="btn" disabled=${busy || !can} onClick=${go}><${Icon} n="radio" s=${16} /> ${busy ? 'Запускаем…' : 'В эфир'}</button>`}>
    <label class="fld"><span>Название</span><input value=${title} maxlength="120" placeholder="Играю, болтаю, показываю кота" onInput=${e => setTitle(e.target.value)} autofocus /></label>
    <label class="fld"><span>Что показываем</span><div class="seg"><button type="button" class=${cx(kind === 'cam' && 'on')} onClick=${() => setKind('cam')}><${Icon} n="camera" s=${15} /> Камера</button><button type="button" disabled=${!canScreen} class=${cx(kind === 'screen' && 'on')} onClick=${() => setKind('screen')}><${Icon} n="monitor" s=${15} /> Экран</button></div></label>
    ${!can && html`<p class="hint">Этот браузер не даёт доступ к камере. Нужен обычный Chrome, Edge, Safari или Firefox и адрес с https.</p>`}
    <p class="hint">Видео идёт напрямую от вас каждому зрителю, поэтому зал небольшой: до ${LIVE.max} человек, и всё упирается в ваш интернет. Записи эфира не будет. Вкладку с эфиром не закрывайте.</p><//>`;
}
function LiveVideo({ stream, muted }) { const v = useRef(); useEffect(() => { const el = v.current; if (!el) return; if (el.srcObject !== stream) el.srcObject = stream || null; el.muted = !!muted; if (stream) { const p = el.play(); if (p && p.catch) p.catch(() => { el.muted = true; el.play().catch(() => {}); }); } }, [stream, muted]); return html`<video ref=${v} autoplay playsinline disableRemotePlayback></video>`; }
function LiveRoom() {
  const l = LV.cur, host = LV.role === 'host', u = who(l.by), [text, setText] = useState(''), end = useRef(), [mic, setMic] = useState(true), stage = useRef();
  useEffect(() => { if (end.current) end.current.scrollIntoView({ block: 'end' }); }, [LV.chat.length]);
  const send = e => { e.preventDefault(); const t = text.trim(); if (!t) return; setText(''); rpc('live.chat', { id: l.id, text: t }).catch(err); };
  const toggleMic = () => { const on = !mic; setMic(on); LV.stream.getAudioTracks().forEach(t => { t.enabled = on; }); };
  const full = () => { const el = stage.current; if (!el) return; if (document.fullscreenElement) document.exitFullscreen(); else if (el.requestFullscreen) el.requestFullscreen().catch(() => {}); };
  return html`<div class="live-room">
    <div class="live-stage" ref=${stage}>
      <${LiveVideo} stream=${host ? LV.stream : LV.remote} muted=${host || LV.muted} />
      ${!host && LV.state !== 'on' && html`<div class="live-wait">${LV.state === 'fail' ? html`<${Icon} n="refresh-cw" s=${30} /><p>Не удалось соединиться с ведущим. Так бывает между некоторыми мобильными сетями — попробуйте через Wi‑Fi.</p><button class="btn" onClick=${() => { const x = l; resetLive(); rpc('live.leave', { id: x.id }).catch(() => {}); joinLive(x); }}>Попробовать ещё раз</button>` : html`<${Spinner} /><p>Подключаемся к эфиру…</p>`}</div>`}
      <div class="live-badges"><b class="live-on">В ЭФИРЕ</b><span><${Icon} n="eye" s=${14} /> ${LV.n}</span></div>
      <div class="live-hearts">${LV.hearts.map(h => html`<i key=${h.k} style=${`left:${h.x}%`}>${h.e}</i>`)}</div>
      <div class="live-ctl">
        ${host ? html`<button class=${cx('ib', !mic && 'off')} onClick=${toggleMic} title=${mic ? 'Выключить микрофон' : 'Включить микрофон'}><${Icon} n=${mic ? 'mic' : 'mic-off'} /></button>` : html`<button class="ib" onClick=${() => { LV.muted = !LV.muted; bump(); }} title=${LV.muted ? 'Включить звук' : 'Выключить звук'}><${Icon} n=${LV.muted ? 'volume-x' : 'volume-2'} /></button>`}
        <button class="ib" onClick=${full} title="На весь экран"><${Icon} n="maximize" /></button>
        <button class="btn danger" onClick=${() => { if (!host || confirm('Завершить эфир?')) leaveLive(); }}>${host ? 'Завершить эфир' : 'Выйти'}</button>
      </div>
    </div>
    <aside class="live-side">
      <div class="live-head"><${Avatar} src=${u.avatar} name=${userName(u)} color=${u.color} s=${38} /><div><b>${l.title}</b><small>${userName(u)} · ${l.kind === 'screen' ? 'экран' : 'камера'}</small></div></div>
      <div class="live-chat">${!LV.chat.length && html`<p class="hint center">Чат эфира. Первое сообщение — самое смелое.</p>`}${LV.chat.map(m => { const a = who(m.by); return html`<p key=${m.id}><b class=${cx(m.by === l.by && 'host')}>${userName(a)}</b> ${m.text}</p>`; })}<span ref=${end}></span></div>
      <form class="live-form" onSubmit=${send}><input value=${text} maxlength="300" placeholder="Написать в чат эфира" onInput=${e => setText(e.target.value)} /><button type="button" class="ib" title="Сердечко" onClick=${() => rpc('live.react', { id: l.id, e: '❤️' }).catch(() => {})}><${Icon} n="heart" /></button><button class="ib" disabled=${!text.trim()} title="Отправить"><${Icon} n="send" /></button></form>
    </aside></div>`;
}
function Live() {
  useEffect(() => { loadLives(); const t = setInterval(() => { if (!LV.cur) loadLives(); }, 20000); return () => clearInterval(t); }, []);
  if (LV.cur) return html`<${LiveRoom} />`;
  const list = LIVE.list;
  return html`<div class="hub-pad">
    <div class="hub-bar"><h2 class="hub-t">Прямые эфиры</h2><span class="grow"></span><button class="btn" onClick=${() => openModal(StartLive)}><${Icon} n="radio" s=${16} /> Начать эфир</button></div>
    ${!list ? html`<${Spinner} />` : !list.length ? html`<${Empty} icon="radio" title="Сейчас никто не в эфире" text="Включите камеру или покажите экран — зрители увидят вас вживую и смогут писать в чат.">${html`<button class="btn" onClick=${() => openModal(StartLive)}><${Icon} n="radio" s=${16} /> Начать эфир</button>`}<//>` : html`
      <div class="live-grid">${list.map(l => { const u = who(l.by); return html`<button class="live-card" key=${l.id} onClick=${() => (l.by === S.me.id ? toast('Это ваш эфир с другого устройства') : joinLive(l))}>
        <span class="live-thumb" style=${`--c:${u.color || 0}`}><${Avatar} src=${u.avatar} name=${userName(u)} color=${u.color} s=${72} /><b class="live-on">В ЭФИРЕ</b><em><${Icon} n="eye" s=${13} /> ${l.viewers}</em></span>
        <span class="live-meta"><b>${l.title}</b><small>${userName(u)} · ${l.kind === 'screen' ? 'экран' : 'камера'} · с ${fmtShort(l.started)}</small></span>${isStaff() && l.by !== S.me.id && html`<span class="live-mod" role="button" tabindex="0" onClick=${async e => { e.stopPropagation(); if (await confirmDlg({ title: 'Остановить эфир?', text: `Эфир «${l.title}» прервётся у всех зрителей.`, ok: 'Остановить', danger: true })) rpc('live.stop', { id: l.id }).then(loadLives).catch(err); }}><${Icon} n="x" s=${14} /> Остановить как модератор</span>`}</button>`; })}</div>`}
  </div>`;
}

// ───────────────────────────── мини-приложения
let APPS = null;
const CATS = [['games', 'Игры', 'gamepad-2'], ['tools', 'Утилиты', 'wrench'], ['bots', 'От ботов', 'bot']];
const TILE = { listopad: '#107C10', g2048: '#0078D7', saper: '#5C2D91', lot: '#E3008C', split: '#008272', royale: '#B146C2', beer: '#CA5010', shooter: '#498205', rp: '#0063B1' };
export function launchApp(app, chatId) {
  const rec = [app.id].concat((local.get('apps.recent') || []).filter(i => i !== app.id)).slice(0, 6); local.set('apps.recent', rec);
  if (app.url) openModal(AppFrame, { app, chat: chatId || null }); else if (app.bot) openMiniApp(app.bot);
}
function AppFrame({ id, app, chat }) {
  const fr = useRef();
  useEffect(() => {
    const onMsg = async e => {
      if (!fr.current || e.source !== fr.current.contentWindow || e.origin !== location.origin || !e.data) return;
      const d = e.data, reply = x => fr.current && fr.current.contentWindow.postMessage(x, location.origin), cid = chat || S.ui.chat, c = S.chats[cid];
      if (d.nudist === 'ready') { const th = document.documentElement.dataset.theme; reply({ nudist: 'init', name: userName(S.me), theme: th === 'dark' || (th !== 'light' && th !== 'tan' && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light', canSend: !!c }); }
      if (d.nudist === 'send') {
        const text = String(d.text || '').slice(0, 2000); if (!text) return;
        if (!c) return reply({ nudist: 'error', text: 'Сначала откройте чат' });
        if (!(await confirmDlg({ title: `Отправить в чат?`, text, ok: 'Отправить' }))) return;
        try { await sendPayload(cid, { text }); reply({ nudist: 'sent' }); } catch (x) { reply({ nudist: 'error', text: x.message }); }
      }
      if (d.nudist === 'earn') { try { reply({ nudist: 'earned', ...(await rpc('apps.earn', { app: app.id, what: String(d.what) })) }); } catch (x) { reply({ nudist: 'error', text: x.message }); } }
      if (d.nudist === 'close') closeModal(id);
    };
    addEventListener('message', onMsg); return () => removeEventListener('message', onMsg);
  }, []);
  return html`<${Modal} id=${id} title=${app.title} icon="app-window" cls="miniapp nopad"><iframe ref=${fr} title=${app.title} src=${app.url} sandbox="allow-scripts allow-same-origin" referrerpolicy="no-referrer"></iframe><//>`;
}
// Каталог: и вкладка, и окно из «скрепки» в чате.
export function AppsCatalog({ chat, onPick }) {
  const [list, setList] = useState(APPS), [q, setQ] = useState('');
  useEffect(() => { rpc('apps.list').then(r => { APPS = r.apps; setList(r.apps); }).catch(err); }, []);
  if (!list) return html`<${Spinner} />`;
  const s = q.trim().toLowerCase(), found = s ? list.filter(a => (a.title + ' ' + a.about).toLowerCase().includes(s)) : list, recent = s ? [] : (local.get('apps.recent') || []).map(i => list.find(a => a.id === i)).filter(Boolean);
  const run = a => { if (onPick) onPick(); launchApp(a, chat); };
  const tile = a => html`<button class="app-tile" key=${a.id} onClick=${() => run(a)}><span class="app-ic" style=${a.emoji ? `background:${TILE[a.id] || '#0078D7'}` : ''}>${a.emoji || html`<${Avatar} src=${a.avatar} name=${a.title} color=${a.color} s=${52} square />`}</span><span class="app-m"><b>${a.title}</b><small>${a.about}</small></span></button>`;
  return html`<div class="apps">
    <div class="hub-bar"><h2 class="hub-t">Приложения</h2><label class="search"><${Icon} n="search" s=${16} /><input value=${q} placeholder="Игра или утилита" onInput=${e => setQ(e.target.value)} /></label></div>
    ${recent.length > 0 && html`<h5>Недавние</h5><div class="app-grid">${recent.map(tile)}</div>`}
    ${CATS.map(([k, name, ic]) => { const l = found.filter(a => a.cat === k); return l.length > 0 && html`<h5><${Icon} n=${ic} s=${14} /> ${name}</h5><div class="app-grid">${l.map(tile)}</div>`; })}
    ${!found.length && html`<${Empty} icon="layout-grid" text="Такого приложения нет. Пока." />`}
    <p class="hint">Приложения открываются поверх чата и умеют отправлять в него результат — после вашего подтверждения. Своё приложение подключается через @botbatya: /setapp.</p></div>`;
}
export function AppsModal({ id, chat }) { return html`<${Modal} id=${id} title="Приложения" icon="layout-grid" wide><${AppsCatalog} chat=${chat} onPick=${() => closeModal(id)} /><//>`; }
export const openApps = chat => openModal(AppsModal, { chat });

// ───────────────────────────── поддержка
const FAQ = [
  ['Как позвать друга?', 'Меню ☰ → «Позвать друзей». Там личная ссылка и QR-код. Друг открывает ссылку в браузере, регистрируется — и вы сразу друг у друга в контактах, обоим по 50 🍃.'],
  ['Сайт не открывается или грузится вечно', 'Сервер стоит на зарубежном хостинге, и у части российских операторов без VPN он работает с перебоями. Попробуйте другую сеть. Если приложение зависло на заставке, нажмите «Повторить».'],
  ['Как загрузить музыку?', 'Вкладка «Музыка» → «Загрузить». Подходят mp3, m4a, ogg, wav и flac. Трек по умолчанию слышите только вы; в меню трека его можно выложить в «Общую волну».'],
  ['Как выложить клип и начать эфир?', 'Клип: вкладка «Клипы» → «Выложить клип», вертикальное видео до 3 минут. Эфир: вкладка «Эфиры» → «Начать эфир», нужны камера или экран. В зале помещается до 30 зрителей.'],
  ['Где мини-приложения?', 'В чате нажмите на скрепку → «Приложения», или откройте вкладку «Приложения» здесь. Игры и утилиты запускаются поверх чата и умеют отправлять в него результат.'],
  ['Не приходят уведомления', 'Уведомления работают, пока приложение или вкладка открыты. Проверьте «Настройки → Уведомления» и разрешение в браузере. При закрытом приложении уведомлений пока нет.'],
  ['Звонок или эфир не соединяется', 'Разрешите браузеру камеру и микрофон. Между некоторыми мобильными сетями прямое соединение не устанавливается — помогает Wi‑Fi хотя бы с одной стороны.'],
  ['Забыл пароль', 'На экране входа есть «Забыли пароль?» — нужен код восстановления из «Настройки → Аккаунт». Кодов нет — напишите в поддержку свой username.'],
  ['Как пожаловаться на человека или сообщение?', 'Нажмите на сообщение или откройте профиль → «Пожаловаться». Жалобу увидят модераторы.'],
];
async function writeSupport() {
  try { const r = await rpc('support.open'); addUsers({ [r.user.id]: r.user }); for (let i = 0; i < 20 && !S.chats[r.chat]; i++) await new Promise(x => setTimeout(x, 100)); S.ui.hub = null; openChat(r.chat); } catch (e) { err(e); }
}
export const openSupport = writeSupport;
const SUP = { list: null, open: 0 };
on('support.upd', d => { if (d.user) S.users[d.user.id] = { ...S.users[d.user.id], ...d.user }; const t = d.ticket; if (SUP.list) { SUP.list = SUP.list.filter(x => x.user !== t.user); if (t.open) SUP.list.unshift(t); SUP.open = SUP.list.length; } if (t.open && t.unread && S.ui.hub !== 'help') toast(`Поддержка: пишет ${t.name}`); bump(); });
function Help() {
  const staff = isStaff(), [tab, setTabH] = useState(staff ? 'queue' : 'faq'), [openQ, setOpenQ] = useState(0);
  return html`<div class="hub-pad help">
    ${staff && html`<div class="hub-bar"><div class="seg"><button class=${cx(tab === 'queue' && 'on')} onClick=${() => setTabH('queue')}>Обращения${SUP.open ? ` · ${SUP.open}` : ''}</button><button class=${cx(tab === 'faq' && 'on')} onClick=${() => setTabH('faq')}>Помощь</button></div></div>`}
    ${tab === 'queue' && staff ? html`<${Queue} />` : html`
      <div class="help-hero"><${Icon} n="life-buoy" s=${40} /><div><h2 class="hub-t">Чем помочь?</h2><p>Сначала загляните в частые вопросы. Не нашли ответ — напишите, разберёмся.</p></div><button class="btn" onClick=${writeSupport}><${Icon} n="message-circle" s=${16} /> Написать в поддержку</button></div>
      <div class="faq">${FAQ.map(([qn, a], i) => html`<div class=${cx('faq-i', openQ === i && 'on')} key=${i}><button onClick=${() => setOpenQ(openQ === i ? -1 : i)} aria-expanded=${openQ === i}><span>${qn}</span><${Icon} n=${openQ === i ? 'chevron-up' : 'chevron-down'} s=${17} /></button>${openQ === i && html`<p>${a}</p>`}</div>`)}</div>
      <p class="hint">В чате с поддержкой на частые вопросы сразу отвечает бот. Остальное попадает к администраторам этого «Нудиста» — они отвечают в том же чате.</p>`}
  </div>`;
}
function Queue() {
  const [sel, setSel] = useState(null), [th, setTh] = useState(null), [text, setText] = useState(''), [closed, setClosed] = useState(false), end = useRef();
  const load = () => rpc('support.list', { closed }).then(r => { addUsers(r.users); SUP.list = r.list; SUP.open = r.open; bump(); }).catch(err);
  useEffect(() => { SUP.list = null; load(); }, [closed]);
  const openT = uid => { setSel(uid); setTh(null); rpc('support.thread', { user: uid }).then(r => { addUsers(r.users); setTh(r); const t = (SUP.list || []).find(x => x.user === uid); if (t) t.unread = 0; bump(); }).catch(err); };
  const stamp = sel && SUP.list && (SUP.list.find(x => x.user === sel) || {}).last;
  useEffect(() => { if (sel && th && stamp && stamp > th.ticket.last) rpc('support.thread', { user: sel }).then(r => { addUsers(r.users); setTh(r); }).catch(() => {}); }, [stamp]);
  useEffect(() => { if (end.current) end.current.scrollIntoView({ block: 'end' }); }, [th && th.msgs.length]);
  const reply = async e => { e.preventDefault(); const t = text.trim(); if (!t) return; setText(''); try { const r = await rpc('support.reply', { user: sel, text: t }); setTh(o => ({ ...o, msgs: o.msgs.concat(r.msg), ticket: { ...o.ticket, last: Date.now(), open: true } })); } catch (x) { err(x); setText(t); } };
  const close = () => rpc('support.close', { user: sel }).then(() => { toast('Обращение закрыто'); setSel(null); setTh(null); load(); }).catch(err);
  const list = SUP.list;
  return html`<div class=${cx('sup', sel && 'in')}>
    <div class="sup-list">
      <div class="seg sm"><button class=${cx(!closed && 'on')} onClick=${() => setClosed(false)}>Открытые</button><button class=${cx(closed && 'on')} onClick=${() => setClosed(true)}>Закрытые</button></div>
      ${!list ? html`<${Spinner} />` : !list.length ? html`<${Empty} icon="life-buoy" text=${closed ? 'Закрытых обращений нет.' : 'Открытых обращений нет. Все довольны или стесняются.'} />` : list.map(t => { const u = who(t.user); return html`<button key=${t.user} class=${cx('sup-i', sel === t.user && 'on')} onClick=${() => openT(t.user)}><${Avatar} src=${u.avatar} name=${t.name} color=${u.color} s=${40} /><span><b>№${t.n} · ${t.name}</b><small>${t.text}</small></span><em>${fmtShort(t.last)}${t.unread > 0 && html`<b class="rb">${t.unread}</b>`}</em></button>`; })}
    </div>
    <div class="sup-th">${!sel ? html`<${Empty} icon="message-circle" text="Выберите обращение слева." />` : !th ? html`<${Spinner} />` : html`
      <div class="sup-h"><button class="ib sup-back" onClick=${() => { setSel(null); setTh(null); }} title="К списку"><${Icon} n="arrow-left" /></button><b>№${th.ticket.n} · ${th.ticket.name}</b><span class="grow"></span>${th.ticket.open && html`<button class="btn ghost sm" onClick=${close}><${Icon} n="check" s=${15} /> Закрыть</button>`}</div>
      <div class="sup-msgs">${th.msgs.map(m => html`<div key=${m.id} class=${cx('sup-m', m.from === th.bot && 'out')}><div>${m.text ? md(m.text) : m.type === 'once' ? 'Одноразовое вложение' : m.media ? html`<a href=${m.media.url} target="_blank" rel="noopener">Вложение: ${m.media.name || m.type}</a>` : m.type}</div><small>${m.from === th.bot ? (m.sig || 'бот') : th.ticket.name} · ${fmtShort(m.ts)}</small></div>`)}<span ref=${end}></span></div>
      <form class="sup-form" onSubmit=${reply}><textarea rows="2" value=${text} maxlength="4000" placeholder="Ответ от имени поддержки" onInput=${e => setText(e.target.value)} onKeyDown=${e => { if (e.key === 'Enter' && !e.shiftKey) reply(e); }}></textarea><button class="btn" disabled=${!text.trim()}><${Icon} n="send" s=${16} /> Ответить</button></form>`}
    </div></div>`;
}
