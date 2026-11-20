// Рейв — комната, где вместе смотрят клипы и слушают музыку. Хозяин переключает — у остальных лента идёт следом.
// Сами видео и музыка идут с обычных адресов, поэтому плеер здесь самый обычный: сервер хранит только «что и с какой секунды».
import { html, useState, useEffect, useRef, S, bump, rpc, on, toast, Icon, Avatar, cx, userName, Spinner, Empty, addUsers } from './lib.js';
import { Vid } from './media.js';

export const RV = { cur: null, list: [], ev: null, voice: false, link: null };      // voice — включён общий голосовой канал
// Одна и та же комната — это и чат (для голосового канала), и место просмотра.
// Регистрируем его в S.chats — общий слой звонков иначе не найдёт, куда звонить.
function voiceChat(room) {
  const id = 'rave:' + room.id;
  const ch = S.chats[id] || (S.chats[id] = { id, title: room.title || 'Рейв', type: 'group', members: {}, pos: 0 });
  for (const u of room.users || []) ch.members[u] = { role: u === room.by ? 'owner' : 'member' };
  return ch;
}
export const queueForDebug = () => RV.q || null;

// ───────── общий источник событий
function rvOn() {
  if (RV.ev) return;
  RV.ev = true;
  on('rave', v => { if (!v || !RV.cur || v.id !== RV.cur.id) return; RV.cur = { ...RV.cur, ...v }; bump(); });
  on('rave.people', v => { if (RV.cur && v.id === RV.cur.id) { RV.cur.n = v.n; RV.cur.users = v.users; bump(); } });
  on('rave.play', v => { if (RV.cur && v.id === RV.cur.id) { RV.cur.now = v.now; if (v.link) RV.link = v.link; else if (v.now && v.now.kind !== 'link') RV.link = null; bump(); } });
  on('rave.msg', v => { if (RV.cur && v.id === RV.cur.id) { RV.cur.chat = [...(RV.cur.chat || []), v.m].slice(-200); if (v.user) S.users[v.m.by] = { ...S.users[v.m.by], ...v.user }; bump(); } });
  on('rave.upd', () => { bump(); });
  on('rave.invite', v => {
    toast(`🍃 ${userName(v.by)} зовёт на рейв «${v.title}»`);
    if (confirm(`Зайти в рейв «${v.title}»?`)) enterRave(v.id);
  });
}

// Клипы для очереди: те же, что в ленте «Видео», но без клипов с YouTube — их нельзя играть у нас.
async function loadQueue(kind) {
  if (kind === 'music') { try { const r = await rpc('music.list', { tab: 'all' }); return (r.tracks || []).map(t => ({ id: t.id, title: t.title, by: t.by, dur: t.dur, url: t.url, music: true })); } catch (e) { return []; } }
  try { const r = await rpc('clip.feed', { off: 0 }); addUsers(r.users); return (r.clips || []).filter(c => c.url); } catch (e) { return []; }
}

export async function loadRaves() {
  rvOn();
  try { const r = await rpc('rave.list'); RV.list = r.list || []; bump(); } catch (e) { /* тихо */ }
  return RV.list;
}
export async function enterRave(id) {
  rvOn();
  try {
    const r = await rpc('rave.get', { id });
    if (!r.in) { await rpc('rave.join', { id }); }
    const g = await rpc('rave.get', { id });
    RV.cur = { ...g.room, chat: g.chat || [] };
    RV.link = g.link || null;      // ссылка, которая уже стоит в комнате — видно сразу при входе
    bump();
  } catch (e) { toast(e.message, 'err'); }
}
export function leaveRave() { const r = RV.cur; RV.cur = null; if (r) rpc('rave.leave', { id: r.id }).catch(() => {}); bump(); }
export async function newRave(o = {}) {
  rvOn();
  try {
    const r = await rpc('rave.new', { title: o.title || 'Рейв', kind: o.kind || 'clips', pub: o.pub !== false });
    await enterRave(r.room.id);
    toast('Комната открыта. Позовите друзей или включите клип — все увидят то же самое');
  } catch (e) { toast(e.message, 'err'); }
}

// ───────── плеер клипа: обычное видео с адреса, синхронно с комнатой
function RavePlayer({ room }) {
  const vid = useRef(), now = room.now;
  const host = room.host;
  const [cur, setCur] = useState(null);
  useEffect(() => {
    let live = true;
    if (now && now.kind === 'link') { setCur(null); return; }      // ссылку показывает отдельная ветка ниже
    if (!now || !now.item) { setCur(null); return; }
    if (now.kind === 'music') {
      loadQueue('music').then(list => { const c = (list || []).find(x => x.id === now.item); if (live) setCur(c ? { music: c } : { wait: true }); });
      return;
    }
    loadQueue('clips').then(list => { const c = (list || []).find(x => x.id === now.item); if (live) setCur(c ? { clip: c } : { wait: true }); });
    return () => { live = false; };
  }, [now && now.item, now && now.kind]);
  // Подводим время к комнате: если отстали больше чем на две секунды или ушли вперёд — выравниваем.
  useEffect(() => {
    const v = vid.current; if (!v || !now || now.kind === 'link') return;      // ссылки крутит сам сервис/сам файл
    const want = now.at + (now.paused ? 0 : (Date.now() - now.ts) / 1000);
    if (now.paused) { v.pause(); if (Math.abs(v.currentTime - now.at) > 1) v.currentTime = now.at; return; }
    if (Math.abs(v.currentTime - want) > 2) v.currentTime = Math.max(0, want);
    v.play().catch(() => { /* браузер попросит нажать */ });
  }, [now && now.ts, now && now.paused]);
  if (now && now.kind === 'link') {
    const L = RV.link || {};
    if (!L.url) return html`<div class="rv-empty"><${Spinner} /></div>`;
    if (L.kind === 'file') return html`<div class="rv-stage"><${Vid} src=${L.url} preload="metadata" controls=${host} onClick=${e => { if (!host) { const w = e.target.closest ? e.target.closest('.vstage') : null; const v = w ? w.querySelector('video') : e.target; if (v && v.paused) { v.currentTime = now.at + (now.paused ? 0 : (Date.now() - now.ts) / 1000); v.play().catch(() => {}); } } }} />
      <span class="rv-src">${L.title}</span></div>`;
    if (L.kind === 'embed') return html`<div class="rv-stage rv-embed"><iframe key=${L.url} src=${L.url} sandbox="allow-scripts allow-same-origin allow-forms allow-presentation allow-popups" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" title=${L.title}></iframe>
      ${L.warn === 'yt' && html`<p class="hint">YouTube в России без VPN не грузится. Если вместо видео пусто — включите VPN или откройте оригинал кнопкой ниже.</p>`}
      <a class="rv-open" href=${L.link} target="_blank" rel="noopener noreferrer">${L.title} · открыть в ${L.site || 'сервисе'}</a></div>`;
    return html`<div class="rv-empty"><${Empty} icon="film" title="Этот сервис не даёт встраивать видео" text=${'Откройте ссылку рядом и смотрите вместе — кнопка ниже. ' + (L.site || '')} /><a class="btn" href=${L.link} target="_blank" rel="noopener noreferrer">Открыть видео</a></div>`;
  }
  if (!now || !now.item) {
    return html`<div class="rv-empty"><${Empty} icon="music" title="Пока тишина" text=${host ? 'Выберите клип в очереди или музыку внизу — и все в комнате увидят то же самое.' : 'Хозяин ещё не включил клип. Поболтайте пока.'} /></div>`;
  }
  if (cur && cur.music) return html`<div class="rv-music"><${Icon} n="music" s=${34} /><div><b>${cur.music.title}</b><small>${host ? 'Вы включили этот трек для всех' : 'Хозяин включил этот трек'}</small></div><button class="btn sm" onClick=${() => playRaveTrack(cur.music)}>${now.paused ? 'Пауза' : 'Слушать'}</button></div>`;
  if (cur && cur.clip) {
    const c = cur.clip;
    return html`<div class="rv-stage">
      <${Vid} src=${c.url} preload="metadata" onClick=${e => { if (!host) { const v = e.target.closest('.vstage') ? e.target.closest('.vstage').querySelector('video') : e.target; if (v && v.paused) { v.currentTime = now.at; v.play().catch(() => {}); } } }} />
      ${host && html`<div class="rv-ctl">
        <button title="Пауза" onClick=${() => rpc('rave.pause', { id: room.id, paused: !now.paused, at: (vid.current || {}).currentTime || 0 }).catch(e => toast(e.message, 'err'))}>${now.paused ? html`<${Icon} n="play" s=${20} />` : html`<${Icon} n="pause" s=${20} />`}</button>
        <input type="range" min="0" max=${Math.max(1, c.dur || 100)} step="0.5" value=${now.paused ? now.at : (vid.current ? vid.current.currentTime : now.at)} onChange=${e => { const at = Number(e.target.value); if (vid.current) vid.current.currentTime = at; rpc('rave.play', { id: room.id, kind: 'clip', item: c.id, at }).catch(() => {}); }} />
      </div>`}
    </div>`;
  }
  return html`<div class="rv-empty"><${Spinner} /></div>`;
}

// Музыку в комнате играет тот же плеер, что и в мессенджере: трек берём из общей волны.
let raveTrack = null;
function playRaveTrack(t) {
  if (!t || !t.url) return toast('Трек не найден', 'err');
  raveTrack = t;
  import('./media.js').then(M => M.playAudio({ id: 'rave.' + t.id, chat: 'rave', type: 'audio', media: { url: t.url, name: t.title, dur: t.dur || 0, by: t.by } }, [{ id: 'rave.' + t.id, type: 'audio', media: { url: t.url, name: t.title, dur: t.dur || 0 } }])).catch(() => toast('Не удалось включить трек', 'err'));
}

// ───────── комната
export function RaveRoom() {
  const room = RV.cur, [text, setText] = useState(''), [clips, setClips] = useState(null), [tab, setTab] = useState('queue'), [url, setUrl] = useState('');
  const chatEnd = useRef();
  useEffect(() => { chatEnd.current && chatEnd.current.scrollIntoView({ block: 'end' }); }, [(room.chat || []).length]);
  useEffect(() => { loadQueue(room.kind).then(l => { RV.q = l; setClips(l); }); }, [room.kind]);
  // Хозяин переключил музыку — у всех она включается сама (если браузер не против).
  useEffect(() => {
    const now = room.now;
    if (!now || now.kind !== 'music' || now.paused || !clips) return;
    const t = clips.find(x => x.id === now.item);
    if (t && (!raveTrack || raveTrack.id !== t.id)) playRaveTrack(t);
  }, [room.now && room.now.item, room.now && room.now.paused, clips]);
  if (!room) return null;
  const host = room.host;
  const send = () => { const t = text.trim(); if (!t) return; setText(''); rpc('rave.chat', { id: room.id, text: t }).catch(e => toast(e.message, 'err')); };
  const put = c => rpc('rave.play', { id: room.id, kind: c.music ? 'music' : 'clip', item: c.id, at: 0 }).catch(e => toast(e.message, 'err'));
  const playUrl = async () => {
    const u = url.trim(); if (!u) return;
    try { const r = await rpc('rave.url', { id: room.id, url: u }); RV.link = r.item; RV.cur.now = r.now; setUrl(''); bump(); }
    catch (e) { toast(e.message, 'err'); }
  };
  const voice = async () => {
    const { joinVoice, leaveVoice, RTC } = await import('./rtc.js');
    if (RV.voice) { try { await leaveVoice(true); } catch (e) { /* уже вышли */ } RV.voice = false; bump(); return; }
    RV.voice = true;
    try { voiceChat(room); await joinVoice('rave:' + room.id); } catch (e) { RV.voice = false; toast(e.message || 'Не удалось включить голос', 'err'); }
    bump();
  };
  const invite = async () => {
    const { pickUsers } = await import('./panels.js');
    const ids = await pickUsers({ title: 'Позвать на рейв' });
    for (const id of ids || []) { try { await rpc('rave.invite', { id: room.id, user: id }); } catch (e) { toast(e.message, 'err'); } }
    if ((ids || []).length) toast('Приглашение ушло в личные сообщения');
  };
  const list = (clips || []).slice(0, 40);
  return html`<div class="rv">
    <header class="rv-h">
      <button class="ib" title="Выйти из комнаты" aria-label="Назад" onClick=${() => leaveRave()}><${Icon} n="chevron-left" s=${22} /></button>
      <div class="rv-t"><b>${room.title}</b><small>${room.n} ${room.n === 1 ? 'человек' : 'в комнате'} · ${room.kind === 'music' ? 'музыка' : 'клипы'}</small></div>
      <button class=${cx('ib', RV.voice && 'on')} title=${RV.voice ? 'Выключить голос' : 'Говорить голосом, пока смотрим'} aria-label="Голос" onClick=${voice}><${Icon} n=${RV.voice ? 'mic' : 'mic-off'} s=${20} /></button>
      <button class="ib" title="Позвать друзей" aria-label="Позвать друзей" onClick=${invite}><${Icon} n="user-plus" s=${20} /></button>
      <button class="ib" title="Свернуть комнату" aria-label="Свернуть" onClick=${() => leaveRave()}><${Icon} n="x" s=${20} /></button>
    </header>
    <div class="rv-people">${(room.users || []).map(id => html`<${Avatar} key=${id} u=${S.users[id]} name=${userName(S.users[id] || {})} color=${(S.users[id] || {}).color} s=${26} title=${userName(S.users[id] || {})} />`)}</div>
    <${RavePlayer} room=${room} />
    <div class="rv-tabs"><button class=${cx(tab === 'queue' && 'on')} onClick=${() => setTab('queue')}>Очередь</button><button class=${cx(tab === 'chat' && 'on')} onClick=${() => setTab('chat')}>Чат${(room.chat || []).length ? html`<b>${room.chat.length}</b>` : ''}</button></div>
    ${tab === 'queue' ? html`<div class="rv-queue">
      ${host ? html`<div class="rv-url"><${Icon} n="link" s=${16} /><input placeholder="Ссылка на видео: youtube, vk, rutube, mp4" value=${url} onInput=${e => setUrl(e.target.value)} onKeyDown=${e => { if (e.key === 'Enter') playUrl(); }} /><button class="btn sm" disabled=${!url.trim()} onClick=${playUrl}>Включить</button></div>
        ${!clips || !clips.length ? html`<p class="hint">Скиньте ссылку — фильм или клип пойдёт у всех одновременно. Хотите обсуждение — включите микрофон вверху.</p>` : ''}`
        : html`<p class="hint">Видео ставит хозяин — ${userName(S.users[room.by] || {})}. Включите микрофон вверху, чтобы обсуждать по ходу.</p>`}
      ${host && (!list.length ? html`<${Empty} icon="film" title="Клипов пока нет" text="Выложите клип в ленте — и он появится здесь." />` : html`<div class="rv-list">${list.map(c => html`<button class=${cx('rv-item', room.now && room.now.item === c.id && 'on')} key=${c.id} onClick=${() => put(c)}>
        <span class="rv-thumb">${c.poster ? html`<img src=${c.poster} alt="" loading="lazy" />` : html`<${Icon} n="film" s=${20} />`}</span>
        <span class="rv-it"><b>${c.title || 'Клип'}</b><small>${userName(S.users[c.by] || {})} · ${c.dur ? Math.round(c.dur) + ' с' : ''}</small></span>
        <${Icon} n="play" s=${18} /></button>`)}</div>`)}
    </div>` : html`<div class="rv-chat">
      <div class="rv-msgs">${(room.chat || []).map(m => html`<div class=${cx('rv-m', m.by === S.me.id && 'my')} key=${m.id}><b>${userName(S.users[m.by] || {})}</b><span>${m.text}</span></div>`)}<div ref=${chatEnd}></div></div>
      <div class="rv-send"><input placeholder="Сказать что-нибудь…" value=${text} maxLength=${500} onInput=${e => setText(e.target.value)} onKeyDown=${e => { if (e.key === 'Enter') send(); }} /><button class="btn sm" onClick=${send} disabled=${!text.trim()}><${Icon} n="send" s=${17} /></button></div>
    </div>`}
  </div>`;
}

// ───────── карточка приглашения в переписке
export function RaveCard({ m }) {
  const mine = m.from === S.me.id;
  return html`<div class="rv-card"><b>🎬 Рейв</b><small>${mine ? 'Приглашение отправлено. Ждём, кто зайдёт.' : 'Смотреть и слушать вместе, одновременно'}</small>
    ${RV.cur && RV.cur.id === m.rave ? html`<button class="btn sm" onClick=${e => { e.stopPropagation(); bump(); }}>Вы уже внутри</button>`
      : html`<button class="btn sm" onClick=${e => { e.stopPropagation(); enterRave(m.rave); }}>Зайти в комнату</button>`}</div>`;
}

// ───────── список комнат (для «Видео»)
export function Raves() {
  useEffect(() => { rvOn(); loadRaves(); const t = setInterval(() => { if (!RV.cur) loadRaves(); }, 25000); return () => clearInterval(t); }, []);
  if (RV.cur) return html`<${RaveRoom} />`;
  return html`<div class="rv-lobby">
    <div class="rv-hero">
      <b>Смотреть вместе</b>
      <p>Комната, где одно и то же видео идёт у всех одновременно. Можно позвать друзей или найти компанию здесь же.</p>
      <div class="rv-hero-b"><button class="btn" onClick=${() => newRave({ kind: 'clips' })}><${Icon} n="plus" s=${16} /> Новая комната</button><button class="btn ghost" onClick=${() => newRave({ kind: 'music' })}><${Icon} n="music" s=${16} /> Слушать вместе</button></div>
    </div>
    ${!RV.list.length ? html`<${Empty} icon="music" title="Никто пока не собрался" text="Откройте комнату — друзья увидят её в этом списке и смогут зайти." />` : html`<div class="rv-rooms">${RV.list.map(r => html`<button class="rv-room" key=${r.id} onClick=${() => enterRave(r.id)}>
      <span class="rv-rb">${r.kind === 'music' ? '🎧' : '🎬'}</span>
      <span class="rv-rt"><b>${r.title}</b><small>${userName(S.users[r.by] || {})} · ${r.n} ${r.n === 1 ? 'человек' : 'человек'}${r.pub ? '' : ' · по ссылке'}</small></span>
      <span class="rv-rn"><${Icon} n="users" s=${14} /> ${r.n}</span>
    </button>`)}</div>`}
  </div>`;
}
