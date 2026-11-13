// Медиа: фото/видео/кружочки/голосовые/аудио/файлы, просмотрщик, плеер, истории.
import { html, useState, useEffect, useRef, S, bump, rpc, call, toast, Icon, Avatar, cx, fmtDur, fmtSize, download, Modal, closeModal, openModal, userName, fmtShort, pickFile, upload, compressImage, addUsers, confirmDlg, Spinner, Empty, lastSeen, plural, showMenu } from './lib.js';
import { mediaUrl, openUser } from './store.js';

export function useMediaUrl(media) {
  const [u, setU] = useState(media && !media.ek ? media.url : null);
  useEffect(() => { let live = true; if (media && media.ek) mediaUrl(media).then(x => live && setU(x)).catch(() => live && setU(null)); else setU(media ? media.url : null); return () => { live = false; }; }, [media && media.url]);
  return u;
}
const fit = (w, h, max = 420, maxH = 420) => { if (!w || !h) return { width: 280, height: 200 }; const k = Math.min(max / w, maxH / h, 1); return { width: Math.max(120, Math.round(w * k)), height: Math.max(80, Math.round(h * k)) }; };

export function Photo({ m, list }) {
  const auto = (S.settings.autoDl || {}).photo !== false || m.from === S.me.id, u = useMediaUrl(m.media), [open, setOpen] = useState(!m.media.spoiler && auto), d = fit(m.media.w, m.media.h);
  const view = () => { if (!open) return setOpen(true); const items = (list || [m]).filter(x => x.type === 'photo' || x.type === 'video' || x.type === 'gif'); S.viewer = { items: items.length ? items : [m], i: Math.max(0, items.findIndex(x => x.id === m.id)) }; bump(); };
  return html`<div class=${cx('ph', !open && 'covered')} style=${`width:${d.width}px;aspect-ratio:${d.width}/${d.height}`} onClick=${view}>
    ${!open && !m.media.spoiler ? '' : u ? html`<img src=${u} alt=${m.text || 'Фото'} loading="lazy" />` : html`<${Spinner} />`}
    ${!open && html`<div class="leafcover"><span>${m.media.spoiler ? '🍃' : '⬇️'}</span><b>${m.media.spoiler ? 'Снять листок' : 'Загрузить фото' + (m.media.size ? ' · ' + fmtSize(m.media.size) : '')}</b></div>`}</div>`;
}
export function Gif({ m }) { const u = useMediaUrl(m.media), d = fit(m.media.w, m.media.h, 320, 320), [play, setPlay] = useState((S.settings.autoDl || {}).gif !== false); if (!play) return html`<button class="ph gif paused" style=${`width:${d.width}px;aspect-ratio:${d.width}/${d.height}`} onClick=${() => setPlay(true)}><b>▶ GIF</b></button>`; return html`<div class="ph gif" style=${`width:${d.width}px;aspect-ratio:${d.width}/${d.height}`} onContextMenu=${e => showMenu(e, [{ icon: 'bookmark', label: 'Сохранить в мои GIF', run: () => saveGif(m.media) }])}>${u && html`<img src=${u} alt="GIF" loading="lazy" />`}<i class="tag-gif">GIF</i></div>`; }
export function saveGif(media) { import('./lib.js').then(L => { const l = S.settings.gifs || []; if (!l.some(g => g.url === media.url)) L.setSetting({ gifs: [{ url: media.url, w: media.w, h: media.h }, ...l].slice(0, 60) }); toast('GIF сохранена в вашу коллекцию'); }); }
export function VideoMsg({ m }) {
  const u = useMediaUrl(m.media), d = fit(m.media.w || 16, m.media.h || 9, 420, 360), [open, setOpen] = useState(!m.media.spoiler);
  return html`<div class=${cx('ph vid', !open && 'covered')} style=${`width:${d.width}px;aspect-ratio:${d.width}/${d.height}`}>
    ${u && html`<video src=${u} controls=${open} preload=${(S.settings.autoDl || {}).video !== false ? 'metadata' : 'none'} playsinline></video>`}
    ${!open && html`<div class="leafcover" onClick=${() => setOpen(true)}><span>🍃</span><b>Снять листок</b></div>`}
    ${m.media.dur ? html`<i class="tag-gif">${fmtDur(m.media.dur)}</i>` : ''}</div>`;
}
export function RoundMsg({ m }) {
  const u = useMediaUrl(m.media), ref = useRef(), [st, setSt] = useState({ p: 0, on: false });
  const tog = () => { const v = ref.current; if (!v) return; if (v.paused) { v.muted = false; v.currentTime = st.on ? v.currentTime : 0; v.play(); } else v.pause(); };
  return html`<div class=${cx('round', st.on && 'on')} onClick=${tog} title="Кружочек: нажмите, чтобы включить звук">
    ${u && html`<video ref=${ref} src=${u} playsinline loop=${false} preload="metadata" onPlay=${() => setSt(s => ({ ...s, on: true }))} onPause=${() => setSt(s => ({ ...s, on: false }))} onEnded=${() => setSt({ p: 0, on: false })} onTimeUpdate=${e => setSt(s => ({ ...s, p: e.target.currentTime / ((m.media.dur || e.target.duration) || 1) }))}></video>`}
    <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="48.5" pathLength="100" stroke-dasharray=${`${Math.min(100, st.p * 100)} 100`} /></svg>
    ${!st.on && html`<i class="round-play"><${Icon} n="play" s=${26} /></i>`}<i class="tag-gif">${fmtDur(m.media.dur)}</i></div>`;
}

// ───── общий аудиоплеер
const audio = new Audio(); audio.preload = 'metadata';
const P = () => S.player;
audio.ontimeupdate = () => { if (P()) { P().t = audio.currentTime; bump(); } };
audio.onplay = () => { if (P()) { P().on = true; bump(); } };
audio.onpause = () => { if (P()) { P().on = false; bump(); } };
audio.onended = () => { const p = P(); if (!p) return; if (p.repeat) { audio.currentTime = 0; audio.play(); return; } step(1, true); };
export async function playAudio(m, queue) {
  const p = P();
  if (p && p.id === m.id) { audio.paused ? audio.play() : audio.pause(); return; }
  if (S.dock) S.dock = null;      // вставка с чужого сайта (Яндекс Музыка, телевизор) выключается: два звука сразу не нужны
  S.player = { id: m.id, chat: m.chat, kind: m.type, title: m.type === 'voice' ? 'Голосовое · ' + userName(S.users[m.from]) : (m.media.name || 'Аудио'), dur: m.media.dur || 0, t: 0, on: false, rate: (p && p.kind === 'voice' && m.type === 'voice' && p.rate) || 1, repeat: p ? p.repeat : false, shuffle: p ? p.shuffle : false, queue: (queue || [m]).filter(x => x.type === m.type), m };
  try { audio.src = await mediaUrl(m.media); audio.playbackRate = S.player.rate; await audio.play(); } catch (e) { toast('Не удалось воспроизвести', 'err'); }
  bump();
}
function step(d, auto) { const p = P(); if (!p) return; const q = p.queue; let i = q.findIndex(x => x.id === p.id); if (p.shuffle && q.length > 1) { let j; do j = Math.floor(Math.random() * q.length); while (j === i); i = j; } else i += d; if (i < 0 || i >= q.length) { if (auto) { p.on = false; p.t = 0; bump(); } return; } const keep = { repeat: p.repeat, shuffle: p.shuffle, queue: q }; playAudio(q[i], q).then(() => Object.assign(S.player, keep)); }
export const seekAudio = f => { const p = P(); if (p) { audio.currentTime = f * (audio.duration && isFinite(audio.duration) ? audio.duration : p.dur); } };
export const cycleRate = () => { const p = P(); if (!p) return; p.rate = p.rate === 1 ? 1.5 : p.rate === 1.5 ? 2 : 1; audio.playbackRate = p.rate; bump(); };
export const stopAudio = () => { audio.pause(); S.player = null; bump(); };
export function VoiceMsg({ m, list }) {
  const p = P(), cur = p && p.id === m.id, wave = m.media.wave && m.media.wave.length ? m.media.wave : Array.from({ length: 40 }, (_, i) => 6 + ((i * 37) % 17)), dur = m.media.dur || 0, prog = cur ? Math.min(1, p.t / (dur || 1)) : 0;
  return html`<div class="voice">
    <button class="play" onClick=${() => playAudio(m, list)} aria-label=${cur && p.on ? 'Пауза' : 'Слушать'}><${Icon} n=${cur && p.on ? 'pause' : 'play'} s=${20} /></button>
    <div class="v-m"><div class="wave" onClick=${e => { const r = e.currentTarget.getBoundingClientRect(); const f = (e.clientX - r.left) / r.width; cur ? seekAudio(f) : playAudio(m, list).then(() => seekAudio(f)); }}>${wave.map((v, i) => html`<i style=${`height:${4 + v * 0.75}px`} class=${cx(i / wave.length < prog && 'on')}></i>`)}</div>
      <span class="v-t">${fmtDur(cur ? p.t : dur)}${m.media.size ? ' · ' + fmtSize(m.media.size) : ''}</span></div>
    <button class="rate" onClick=${() => cur ? cycleRate() : playAudio(m, list)} title="Скорость воспроизведения">${cur ? p.rate + 'x' : '1x'}</button></div>`;
}
export function AudioMsg({ m, list }) {
  const p = P(), cur = p && p.id === m.id;
  return html`<div class="filecard"><button class="play" onClick=${() => playAudio(m, list)}><${Icon} n=${cur && p.on ? 'pause' : 'music'} s=${20} /></button><div class="fc-m"><b>${m.media.name || 'Аудио'}</b><small>${cur ? fmtDur(p.t) + ' / ' : ''}${fmtDur(m.media.dur)} · ${fmtSize(m.media.size || 0)}</small></div><button class="ib sm" title="Скачать" onClick=${() => download(m.media.name || 'audio', m.media.url)}><${Icon} n="download" s=${17} /></button></div>`;
}
export function AudioBar() {
  const p = P(); if (!p) return null;
  return html`<div class="audiobar"><button class="ib sm" onClick=${() => step(-1)} title="Предыдущий"><${Icon} n="skip-back" s=${16} /></button><button class="ib sm" onClick=${() => audio.paused ? audio.play() : audio.pause()}><${Icon} n=${p.on ? 'pause' : 'play'} s=${18} /></button><button class="ib sm" onClick=${() => step(1)} title="Следующий"><${Icon} n="skip-forward" s=${16} /></button>
    <div class="ab-m"><b>${p.title}</b><div class="ab-seek" onClick=${e => { const r = e.currentTarget.getBoundingClientRect(); seekAudio((e.clientX - r.left) / r.width); }}><i style=${`width:${Math.min(100, p.t / (p.dur || audio.duration || 1) * 100)}%`}></i></div></div>
    <span class="ab-t">${fmtDur(p.t)}</span>
    ${p.kind === 'voice' ? html`<button class="rate" onClick=${cycleRate}>${p.rate}x</button>` : html`<button class=${cx('ib sm', p.repeat && 'act')} onClick=${() => { p.repeat = !p.repeat; bump(); }} title="Повтор"><${Icon} n="repeat" s=${16} /></button><button class=${cx('ib sm', p.shuffle && 'act')} onClick=${() => { p.shuffle = !p.shuffle; bump(); }} title="Перемешать"><${Icon} n="shuffle" s=${16} /></button>`}
    <button class="ib sm" onClick=${stopAudio} title="Закрыть плеер"><${Icon} n="x" s=${16} /></button></div>`;
}
const EXT_ICON = { pdf: 'file-text', doc: 'file-text', docx: 'file-text', txt: 'file-text', xls: 'table', xlsx: 'table', csv: 'table', zip: 'archive', rar: 'archive', '7z': 'archive', mp3: 'music', js: 'code', py: 'code', json: 'code', html: 'code' };
export function FileMsg({ m }) {
  const md = m.media, ext = (md.name || '').split('.').pop().toLowerCase(), canPrev = !md.ek && (ext === 'pdf' || ext === 'txt');
  const dl = async () => { if (md.ek) { const u = await mediaUrl(md); const a = document.createElement('a'); a.href = u; a.download = md.name || 'file'; a.click(); } else download(md.name || 'file', md.url); };
  return html`<div class="filecard"><button class="play" onClick=${() => canPrev ? (S.viewer = { items: [{ ...m, type: 'doc' }], i: 0 }, bump()) : dl()} title=${canPrev ? 'Предпросмотр' : 'Скачать'}><${Icon} n=${EXT_ICON[ext] || 'file'} s=${20} /></button><div class="fc-m"><b title=${md.name}>${md.name || 'Файл'}</b><small>${fmtSize(md.size || 0)}${ext ? ' · ' + ext.toUpperCase() : ''}${md.ek ? ' · зашифрован' : ''}</small></div><button class="ib sm" title="Скачать" onClick=${dl}><${Icon} n="download" s=${17} /></button></div>`;
}
export function LocMsg({ m }) {
  const { lat, lon, title } = m.loc, d = 0.006, [map, setMap] = useState(false);
  return html`<div class="loc">${map ? html`<iframe title="Карта" loading="lazy" referrerpolicy="no-referrer" src=${`https://www.openstreetmap.org/export/embed.html?bbox=${lon - d},${lat - d},${lon + d},${lat + d}&layer=mapnik&marker=${lat},${lon}`}></iframe>` : html`<button class="loc-ph" onClick=${() => setMap(true)}><span>📍</span><b>Показать карту</b><small>загрузится с openstreetmap.org</small></button>`}
    <div class="loc-f"><div><b>${title || 'Геопозиция'}</b><small>${lat.toFixed(5)}, ${lon.toFixed(5)}</small></div><a class="btn ghost sm" href=${`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`} target="_blank" rel="noopener noreferrer">Открыть</a></div></div>`;
}

// ───── просмотрщик
export function MediaViewer() {
  const v = S.viewer, m = v.items[v.i], u = useMediaUrl(m.media), [z, setZ] = useState({ k: 1, x: 0, y: 0 }), drag = useRef(null);
  const go = d => { const i = v.i + d; if (i >= 0 && i < v.items.length) { v.i = i; setZ({ k: 1, x: 0, y: 0 }); bump(); } };
  useEffect(() => { const k = e => { if (e.key === 'ArrowLeft') go(-1); if (e.key === 'ArrowRight') go(1); if (e.key === '+' || e.key === '=') setZ(s => ({ ...s, k: Math.min(6, s.k * 1.3) })); if (e.key === '-') setZ(s => ({ ...s, k: Math.max(1, s.k / 1.3) })); }; addEventListener('keydown', k); return () => removeEventListener('keydown', k); });
  const close = () => { S.viewer = null; bump(); };
  const wheel = e => { e.preventDefault(); setZ(s => { const k = Math.min(6, Math.max(1, s.k * (e.deltaY < 0 ? 1.15 : 0.87))); return k === 1 ? { k, x: 0, y: 0 } : { ...s, k }; }); };
  const down = e => { if (z.k > 1) drag.current = { x: e.clientX - z.x, y: e.clientY - z.y }; else drag.current = { sx: e.clientX }; };
  const move = e => { if (drag.current && z.k > 1 && drag.current.x !== undefined) setZ(s => ({ ...s, x: e.clientX - drag.current.x, y: e.clientY - drag.current.y })); };
  const up = e => { const d = drag.current; drag.current = null; if (d && d.sx !== undefined && Math.abs(e.clientX - d.sx) > 70) go(e.clientX < d.sx ? 1 : -1); };
  const from = S.users[m.from];
  return html`<div class="viewer" onMouseDown=${e => e.target === e.currentTarget && close()}>
    <header><div class="vw-i">${from && html`<${Avatar} src=${from.avatar} name=${userName(from)} color=${from.color} s=${34} />`}<div><b>${from ? userName(from) : ''}</b><small>${m.ts ? fmtShort(m.ts) : ''}${v.items.length > 1 ? ` · ${v.i + 1} из ${v.items.length}` : ''}</small></div></div>
      ${m.type === 'photo' && html`<button class="ib" onClick=${() => setZ(s => ({ ...s, k: Math.min(6, s.k * 1.4) }))} title="Увеличить (+)"><${Icon} n="plus" /></button><button class="ib" onClick=${() => setZ({ k: 1, x: 0, y: 0 })} title="Сбросить масштаб"><${Icon} n="maximize" /></button>`}
      <button class="ib" onClick=${async () => { const x = await mediaUrl(m.media); const a = document.createElement('a'); a.href = m.media.ek ? x : m.media.url + '?n=' + encodeURIComponent(m.media.name || 'media'); a.download = m.media.name || 'media'; a.click(); }} title="Сохранить"><${Icon} n="download" /></button>
      <button class="ib" onClick=${close} title="Закрыть (Esc)"><${Icon} n="x" /></button></header>
    <div class="vw-stage" onWheel=${wheel} onMouseDown=${down} onMouseMove=${move} onMouseUp=${up} onDblClick=${() => setZ(s => (s.k > 1 ? { k: 1, x: 0, y: 0 } : { k: 2.5, x: 0, y: 0 }))} onClick=${e => e.target === e.currentTarget && close()}>
      ${!u ? html`<${Spinner} />` : m.type === 'video' ? html`<video src=${u} controls autoplay playsinline></video>` : m.type === 'doc' ? html`<iframe title=${m.media.name} src=${u} sandbox=""></iframe>` : html`<img src=${u} alt="" draggable="false" style=${`transform:translate(${z.x}px,${z.y}px) scale(${z.k});cursor:${z.k > 1 ? 'grab' : 'zoom-in'}`} />`}
    </div>
    ${v.i > 0 && html`<button class="vw-nav l" onClick=${() => go(-1)} aria-label="Назад"><${Icon} n="chevron-left" s=${30} /></button>`}${v.i < v.items.length - 1 && html`<button class="vw-nav r" onClick=${() => go(1)} aria-label="Вперёд"><${Icon} n="chevron-right" s=${30} /></button>`}
    ${m.text && m.type !== 'doc' && html`<footer>${m.text}</footer>`}</div>`;
}

// ───── истории
export const STORY_BG = { leaf: 'linear-gradient(160deg,#45C97F,#0F6B3A)', sun: 'linear-gradient(160deg,#FFC078,#E2552D)', sea: 'linear-gradient(160deg,#6FD3E0,#0D5C8C)', sand: 'linear-gradient(160deg,#F6E2C0,#C7822F)', night: 'linear-gradient(160deg,#3B4A6B,#10162A)', skin: 'linear-gradient(160deg,#FFE3CF,#E8A27C)' };
export function StoryViewer() {
  const v = S.storyView, list = S.stories.filter(s => s.user === v.u).sort((a, b) => a.ts - b.ts), s = list[Math.min(v.i, list.length - 1)], u = S.users[v.u];
  const [p, setP] = useState(0), [pause, setPause] = useState(false), [reply, setReply] = useState(''), vid = useRef();
  const close = () => { S.storyView = null; bump(); };
  const go = d => { let i = v.i + d; if (i >= 0 && i < list.length) { v.i = i; setP(0); return bump(); } const ui = v.users.indexOf(v.u) + d; if (ui < 0 || ui >= v.users.length) return close(); v.u = v.users[ui]; v.i = d > 0 ? 0 : S.stories.filter(x => x.user === v.u).length - 1; setP(0); bump(); };
  useEffect(() => { if (s && !s.seen && s.user !== S.me.id) { s.seen = true; rpc('story.view', { id: s.id }).catch(() => {}); } }, [s && s.id]);
  useEffect(() => { if (!s || pause) return; const dur = s.kind === 'video' ? (s.media.dur || 15) * 1000 : 6000, t0 = Date.now() - p * dur; const t = setInterval(() => { const x = (Date.now() - t0) / dur; if (x >= 1) { clearInterval(t); go(1); } else setP(x); }, 50); return () => clearInterval(t); }, [s && s.id, pause]);
  useEffect(() => { if (vid.current) pause ? vid.current.pause() : vid.current.play().catch(() => {}); }, [pause, s && s.id]);
  if (!s) { setTimeout(close); return null; }
  const mine = s.user === S.me.id;
  const send = async (e, text) => { await call('story.react', { id: s.id, e, text }); toast(e ? 'Реакция отправлена' : 'Ответ отправлен в личку'); setReply(''); setPause(false); };
  return html`<div class="story-view" onMouseDown=${e => e.target === e.currentTarget && close()}>
    <div class="sv-card" style=${s.kind === 'text' ? 'background:' + (STORY_BG[s.bg] || STORY_BG.leaf) : ''}>
      <div class="sv-bars">${list.map((x, i) => html`<i><b style=${`width:${i < v.i ? 100 : i === v.i ? p * 100 : 0}%`}></b></i>`)}</div>
      <header><${Avatar} src=${u && u.avatar} name=${userName(u)} color=${u ? u.color : 0} s=${36} /><div><b>${mine ? 'Моя история' : userName(u)}</b><small>${fmtShort(s.ts)}${mine ? ' · ' + ({ all: 'все', contacts: 'контакты', close: 'близкие', selected: 'выбранные', except: 'все, кроме…' }[s.aud] || '') : ''}</small></div>
        <button class="ib" onClick=${() => setPause(x => !x)} aria-label="Пауза"><${Icon} n=${pause ? 'play' : 'pause'} s=${18} /></button>
        ${mine && html`<button class="ib" title="Удалить историю" onClick=${async () => { setPause(true); if (await confirmDlg({ title: 'Удалить историю?', text: 'Она исчезнет у всех.', ok: 'Удалить', danger: true })) { await call('story.del', { id: s.id }); } setPause(false); }}><${Icon} n="trash-2" s=${18} /></button>`}
        <button class="ib" onClick=${close} aria-label="Закрыть"><${Icon} n="x" /></button></header>
      <div class="sv-body" onMouseDown=${() => setPause(true)} onMouseUp=${e => { setPause(false); const r = e.currentTarget.getBoundingClientRect(); const f = (e.clientX - r.left) / r.width; if (f < 0.3) go(-1); else if (f > 0.7) go(1); }}>
        ${s.kind === 'photo' && html`<img src=${s.media.url} alt="" />`}${s.kind === 'video' && html`<video ref=${vid} src=${s.media.url} autoplay playsinline></video>`}
        ${s.text && html`<p class=${cx('sv-text', s.kind !== 'text' && 'cap')}>${s.text}</p>`}
        ${(s.items || []).map(i => html`<span class="sv-item" style=${`left:${i.x}%;top:${i.y}%;font-size:${i.s}px;color:${i.c || '#fff'}`}>${i.v}</span>`)}
      </div>
      ${mine ? html`<footer><button class="btn ghost" onClick=${() => { setPause(true); openModal(StoryViewers, { story: s, onClose: () => setPause(false) }); }}><${Icon} n="eye" s=${16} /> ${s.views || 0} ${plural(s.views || 0, ['просмотр', 'просмотра', 'просмотров'])}</button><button class="btn ghost" onClick=${() => { close(); openModal(StoryEditor); }}><${Icon} n="plus" s=${16} /> Ещё одну</button></footer>`
        : html`<footer><div class="sv-rx">${['❤️', '😂', '🔥', '😮', '🍃'].map(e => html`<button onClick=${() => send(e)}>${e}</button>`)}</div><input value=${reply} placeholder="Ответить в личку…" onFocus=${() => setPause(true)} onBlur=${() => !reply && setPause(false)} onInput=${e => setReply(e.target.value)} onKeyDown=${e => { e.stopPropagation(); if (e.key === 'Enter' && reply.trim()) send(undefined, reply.trim()); }} /></footer>`}
    </div>
    <button class="vw-nav l" onClick=${() => go(-1)} aria-label="Предыдущая"><${Icon} n="chevron-left" s=${30} /></button><button class="vw-nav r" onClick=${() => go(1)} aria-label="Следующая"><${Icon} n="chevron-right" s=${30} /></button></div>`;
}
function StoryViewers({ id, story, onClose }) {
  const [d, setD] = useState(null);
  useEffect(() => { rpc('story.viewers', { id: story.id }).then(r => { addUsers(r.users); setD(r.views); }).catch(e => toast(e.message, 'err')); }, []);
  return html`<${Modal} id=${id} title="Кто смотрел" cls="small" onClose=${onClose}>${!d ? html`<${Spinner} />` : !d.length ? html`<${Empty} icon="eye-off" title="Пока никто" text="История лежит, сохнет на солнце." />` : d.map(v => { const u = S.users[v.u]; return html`<button class="ci" onClick=${() => { closeModal(id); S.storyView = null; openUser(v.u); }}><${Avatar} src=${u && u.avatar} name=${userName(u)} color=${u ? u.color : 0} s=${40} /><span class="ci-m"><span class="ci-t"><b>${userName(u)}</b><time>${v.e || ''}</time></span><span class="ci-p"><span>${fmtShort(v.ts)}</span></span></span></button>`; })}<//>`;
}
export function StoryEditor({ id }) {
  const [st, setSt] = useState({ kind: 'text', text: '', bg: 'leaf', aud: 'all', list: [], file: null, url: null, items: [], color: '#ffffff' });
  const [busy, setBusy] = useState(false), cv = useRef(), drawing = useRef(null), dirty = useRef(false);
  const set = p => setSt(s => ({ ...s, ...p }));
  const pick = async () => { const f = await pickFile('image/*,video/*'); if (!f) return; set({ kind: f.type.startsWith('video/') ? 'video' : 'photo', file: f, url: URL.createObjectURL(f) }); dirty.current = false; };
  const pos = e => { const r = cv.current.getBoundingClientRect(); return [(e.clientX - r.left) * cv.current.width / r.width, (e.clientY - r.top) * cv.current.height / r.height]; };
  const start = e => { if (st.kind !== 'photo') return; drawing.current = pos(e); };
  const draw = e => { if (!drawing.current) return; const g = cv.current.getContext('2d'), [x, y] = pos(e); g.strokeStyle = st.color; g.lineWidth = cv.current.width / 90; g.lineCap = 'round'; g.beginPath(); g.moveTo(...drawing.current); g.lineTo(x, y); g.stroke(); drawing.current = [x, y]; dirty.current = true; };
  const addEmoji = e => set({ items: [...st.items, { k: 'emoji', v: e, x: 20 + Math.random() * 50, y: 20 + Math.random() * 50, s: 56 }].slice(0, 12) });
  const post = async () => {
    setBusy(true);
    try {
      let media;
      if (st.kind === 'photo') {
        const img = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = st.url; });
        const c = document.createElement('canvas'), k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight)); c.width = img.naturalWidth * k; c.height = img.naturalHeight * k; const g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height); if (dirty.current) g.drawImage(cv.current, 0, 0, c.width, c.height);
        const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.88)); const up = await upload(blob, { name: 'story.jpg' }); media = { url: up.url, w: c.width, h: c.height };
      } else if (st.kind === 'video') { if (st.file.size > 60e6) throw new Error('Видео для истории — до 60 МБ'); const v = document.createElement('video'); v.src = st.url; await new Promise(r => { v.onloadedmetadata = r; v.onerror = r; }); const up = await upload(st.file); media = { url: up.url, w: v.videoWidth, h: v.videoHeight, dur: Math.min(60, v.duration || 15) }; }
      await rpc('story.post', { kind: st.kind, text: st.text, bg: st.bg, aud: st.aud, list: st.list, media, items: st.items });
      toast('История опубликована на 24 часа'); closeModal(id);
    } catch (e) { toast(e.message, 'err'); }
    setBusy(false);
  };
  const contacts = (S.me.contacts || []).map(i => S.users[i]).filter(Boolean);
  return html`<${Modal} id=${id} title="Новая история" icon="circle-dot" wide footer=${html`<button class="btn" disabled=${busy || (st.kind === 'text' && !st.text.trim())} onClick=${post}>${busy ? 'Публикую…' : 'Опубликовать на 24 часа'}</button>`}>
    <div class="story-ed">
      <div class="se-prev" style=${st.kind === 'text' ? 'background:' + STORY_BG[st.bg] : 'background:#000'}>
        ${st.kind === 'photo' && html`<img src=${st.url} alt="" onLoad=${e => { cv.current.width = e.target.naturalWidth; cv.current.height = e.target.naturalHeight; }} /><canvas ref=${cv} onMouseDown=${start} onMouseMove=${draw} onMouseUp=${() => { drawing.current = null; }} onMouseLeave=${() => { drawing.current = null; }}></canvas>`}
        ${st.kind === 'video' && html`<video src=${st.url} muted autoplay loop playsinline></video>`}
        ${st.text && html`<p class=${cx('sv-text', st.kind !== 'text' && 'cap')}>${st.text}</p>`}
        ${st.items.map((i, n) => html`<span class="sv-item" style=${`left:${i.x}%;top:${i.y}%;font-size:${i.s * 0.6}px`} title="Нажмите, чтобы убрать" onClick=${() => set({ items: st.items.filter((_, k) => k !== n) })}>${i.v}</span>`)}
      </div>
      <div class="se-ctl">
        <div class="seg"><button class=${cx(st.kind === 'text' && 'on')} onClick=${() => set({ kind: 'text' })}>Текст</button><button class=${cx(st.kind !== 'text' && 'on')} onClick=${pick}>Фото или видео</button></div>
        <label class="fld"><span>${st.kind === 'text' ? 'Текст истории' : 'Подпись'}</span><textarea rows="3" maxlength="500" value=${st.text} placeholder="Что у вас нового? Только честно." onInput=${e => set({ text: e.target.value })}></textarea></label>
        ${st.kind === 'text' && html`<div class="fld"><span>Фон</span><div class="chips">${Object.keys(STORY_BG).map(b => html`<button class=${cx('swatch', st.bg === b && 'on')} style=${'background:' + STORY_BG[b]} onClick=${() => set({ bg: b })} aria-label=${'Фон ' + b}></button>`)}</div></div>`}
        ${st.kind === 'photo' && html`<div class="fld"><span>Рисунок поверх фото — водите мышью по картинке</span><div class="chips">${['#ffffff', '#111111', '#E2552D', '#F0A04B', '#45C97F', '#5CC6D4'].map(c => html`<button class=${cx('swatch', st.color === c && 'on')} style=${'background:' + c} onClick=${() => set({ color: c })} aria-label="Цвет кисти"></button>`)}</div></div>`}
        <div class="fld"><span>Стикеры-эмодзи</span><div class="chips">${['🍃', '🔥', '😂', '❤️', '🏖', '🌞', '🎉', '👀'].map(e => html`<button class="chip" onClick=${() => addEmoji(e)}>${e}</button>`)}</div></div>
        <label class="fld"><span>Кто увидит</span><select value=${st.aud} onChange=${e => set({ aud: e.target.value })}><option value="all">Все, с кем я общаюсь</option><option value="contacts">Только контакты</option><option value="close">Близкие (выбрать)</option><option value="except">Все, кроме…</option></select></label>
        ${(st.aud === 'close' || st.aud === 'except') && html`<div class="pick-list">${contacts.length ? contacts.map(u => html`<label class="check"><input type="checkbox" checked=${st.list.includes(u.id)} onChange=${e => set({ list: e.target.checked ? [...st.list, u.id] : st.list.filter(x => x !== u.id) })} /> ${userName(u)}</label>`) : html`<p class="hint">Сначала добавьте людей в контакты.</p>`}</div>`}
      </div></div><//>`;
}
