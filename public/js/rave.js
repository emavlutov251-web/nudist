// Рейв — комната, где вместе смотрят клипы и слушают музыку. Хозяин переключает — у остальных лента идёт следом.
// Сами видео и музыка идут с обычных адресов, поэтому плеер здесь самый обычный: сервер хранит только «что и с какой секунды».
import { html, useState, useEffect, useRef, S, bump, rpc, on, toast, Icon, Avatar, cx, userName, Spinner, Empty, addUsers } from './lib.js';
import { Vid } from './media.js';

export const RV = { cur: null, list: [], ev: null, voice: false, link: null, skew: 0 };      // voice — включён общий голосовой канал
// Часы комнаты: у кого-то телефон спешит на минуту — и он считал бы секунду клипа иначе, чем все.
// Спрашиваем у сервера время и запоминаем разницу (skew). Дальше время комнаты = местные часы + skew.
const roomNow = () => Date.now() + (RV.skew || 0);
async function syncClock() {
  try { const t0 = Date.now(), r = await rpc('rave.time'); const mid = (t0 + Date.now()) / 2; RV.skew = Number(r.now) - mid; } catch (e) { /* останутся местные часы */ }
}
const roomTime = n => { const x = n || (RV.cur && RV.cur.now); if (!x) return 0; return Math.max(0, (Number(x.at) || 0) + (x.paused ? 0 : (roomNow() - (Number(x.ts) || roomNow())) / 1000)); };
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
    if (typeof g.serverAt === 'number' && RV.cur.now) { RV.skew = g.serverAt - Date.now(); } else syncClock();
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
  // Подводим время к комнате: если отстали больше чем на секунду или ушли вперёд — выравниваем.
  // Раньше сравнивали с «сейчас» и получали отставание на время загрузки клипа: у гостя видео
  // только начинало грузиться, а хозяин уже был на третьей секунде. Теперь цель с запасом на загрузку.
  useEffect(() => {
    const v = vid.current; if (!v || !now || now.kind === 'link') return;      // ссылки крутит сам сервис/сам файл
    const want = now.at + (now.paused ? 0 : (roomNow() - now.ts) / 1000);
    if (now.paused) { v.pause(); if (Math.abs(v.currentTime - now.at) > 0.7) v.currentTime = now.at; return; }
    if (Math.abs(v.currentTime - want) > 1) v.currentTime = Math.max(0, want);
    v.play().catch(() => { /* браузер попросит нажать */ });
  }, [now && now.ts, now && now.paused]);
  // И раз в секунду подравниваем сами: связь у всех разная, без этого гости постепенно расходятся.
  useEffect(() => {
    const t = setInterval(() => {
      const v = vid.current; if (!v || !now || now.kind === 'link' || now.paused) return;
      const want = now.at + (roomNow() - now.ts) / 1000;
      if (Math.abs(v.currentTime - want) > 1.2) { try { v.currentTime = Math.max(0, want); } catch (e) { /* ещё грузится */ } }
    }, 1000);
    return () => clearInterval(t);
  }, [now && now.ts, now && now.paused, now && now.item]);
  if (now && now.kind === 'link') {
    const L = RV.link || {};
    if (!L.url) return html`<div class="rv-empty"><${Spinner} /></div>`;
    if (L.kind === 'file') return html`<div class="rv-stage"><${Vid} src=${L.url} preload="metadata" controls=${host} onClick=${e => { if (!host) { const w = e.target.closest ? e.target.closest('.vstage') : null; const v = w ? w.querySelector('video') : e.target; if (v && v.paused) { v.currentTime = roomTime(now); v.play().catch(() => {}); } } }} />
      <span class="rv-src">${L.title}</span></div>`;
    if (L.kind === 'embed') return html`<div class="rv-stage rv-embed"><iframe key=${L.url} src=${L.url} sandbox="allow-scripts allow-same-origin allow-forms allow-presentation allow-popups" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" title=${L.title}></iframe>
      ${L.warn === 'yt' && html`<p class="hint">YouTube в России без VPN не грузится. Если вместо видео пусто — включите VPN или откройте оригинал кнопкой ниже.</p>`}
      <a class="rv-open" href=${L.link} target="_blank" rel="noopener noreferrer">${L.title} · открыть в ${L.site || 'сервисе'}</a></div>`;
    return html`<div class="rv-empty"><${Empty} icon="film" title="Этот сервис не даёт встраивать видео" text=${'Откройте ссылку рядом и смотрите вместе — кнопка ниже. ' + (L.site || '')} /><a class="btn" href=${L.link} target="_blank" rel="noopener noreferrer">Открыть видео</a></div>`;
  }
  if (!now || !now.item) {
    return html`<div class="rv-empty"><${Empty} icon="music" title="Пока тишина" text=${host ? 'Выберите клип в очереди или музыку внизу — и все в комнате увидят то же самое.' : 'Хозяин ещё не включил клип. Поболтайте пока.'} /></div>`;
  }
  const pausedNote = now && now.paused && !host ? html`<p class="hint rv-paused">Хозяин поставил на паузу — включится у всех сразу.</p>` : '';
  if (cur && cur.music) return html`<div class="rv-music">
    <${Icon} n="music" s=${34} />
    <div class="rv-mt"><b>${cur.music.title}</b><small>${host ? 'Этот трек слышат все в комнате — одновременно' : 'Играет у всех в комнате одновременно'}${now.paused ? ' · на паузе' : ''}</small></div>
    ${host ? html`<div class="rv-mbtns">
        <button class="btn sm" onClick=${() => rpc('rave.pause', { id: room.id, paused: !now.paused, at: rvTime(now) }).catch(e => toast(e.message, 'err'))}>${now.paused ? 'Продолжить' : 'Пауза'}</button>
        <button class="ib sm" title="С начала — тоже у всех" aria-label="С начала" onClick=${() => rpc('rave.pause', { id: room.id, paused: now.paused, at: 0 }).catch(e => toast(e.message, 'err'))}><${Icon} n="rotate-ccw" s=${16} /></button>
      </div>`
      : html`<button class="btn sm" onClick=${resumeMusic}>${RS.blocked || (RS.audio && RS.audio.paused && !now.paused) ? 'Слушать' : (now.paused ? 'Пауза' : 'Слушаем')}</button>`}
    ${host && html`<input class="rv-mseek" type="range" min="0" max=${Math.max(1, Math.round(cur.music.dur || 600))} step="1" value=${Math.round(rvTime(now))}
      onChange=${e => { const at = Math.max(0, Number(e.target.value)); rpc('rave.pause', { id: room.id, paused: now.paused, at }).catch(err => toast(err.message, 'err')); }}
      title="Перемотка — у всех сразу" />`}
  </div>`;
  if (cur && cur.clip) {
    const c = cur.clip;
    return html`<div class="rv-stage">
      <${Vid} src=${c.url} preload="metadata" onClick=${e => { if (!host) { const v = e.target.closest('.vstage') ? e.target.closest('.vstage').querySelector('video') : e.target; if (v && v.paused) { v.currentTime = now.at; v.play().catch(() => {}); } } }} />
      ${host && html`<div class="rv-ctl">
        <button title=${now.paused ? 'Продолжить у всех' : 'Пауза у всех'} onClick=${() => rpc('rave.pause', { id: room.id, paused: !now.paused, at: (vid.current || {}).currentTime || 0 }).catch(e => toast(e.message, 'err'))}>${now.paused ? html`<${Icon} n="play" s=${20} />` : html`<${Icon} n="pause" s=${20} />`}</button>
        <input type="range" min="0" max=${Math.max(1, c.dur || 100)} step="0.5" value=${now.paused ? now.at : (vid.current ? vid.current.currentTime : now.at)} onChange=${e => { const at = Number(e.target.value); if (vid.current) vid.current.currentTime = at; rpc('rave.play', { id: room.id, kind: 'clip', item: c.id, at }).catch(() => {}); }} />
      </div>`}
    </div>`;
  }
  return html`<div class="rv-empty">${now && now.paused && !host ? html`<p class="hint">Хозяин поставил на паузу. Продолжит — и клип пойдёт у всех с той же секунды.</p>` : html`<${Spinner} />`}</div>`;
}

// ───────── музыка в комнате: у всех одна секунда
// Раньше трек просто включался у каждого с начала, пауза не доходила до гостей, а браузер запрещал
// звук без нажатия — поэтому «синхронного прослушивания» не получалось. Теперь секунду считаем по серверу:
// сервер помнит, какой трек, с какой секунды и когда включён (now.at + now.ts), а мы подгоняем свой плеер.
const RS = { audio: null, id: null, at: 0, playing: false, ready: false };      // что сейчас играем у нас
const rvTime = roomTime;      // одно и то же время комнаты — и для музыки, и для клипов

/** Подогнать свой звук под комнату: включить нужный трек, перемотать и поставить/снять паузу. */
function syncMusic(now, clips) {
  const o = RS.audio || (RS.audio = new Audio());
  o.preload = 'auto';
  if (!now || now.kind !== 'music') { try { o.pause(); } catch (e) { /* тихо */ } RS.id = null; return; }
  const t = (clips || []).find(x => x.id === now.item);
  if (!t || !t.url) return;
  if (RS.id !== t.id) { RS.id = t.id; RS.at = 0; o.src = t.url; RS.ready = false; }
  const at = rvTime(now);
  const go = () => {
    const d = Math.abs((o.currentTime || 0) - at);
    if (d > 0.6) { try { o.currentTime = at; } catch (e) { /* ещё не загрузился */ } }
    if (now.paused) { if (!o.paused) o.pause(); }
    else if (o.paused) o.play().catch(() => { RS.blocked = true; bump(); });      // браузер ждёт нажатия
  };
  if (o.readyState >= 1) go(); else { o.addEventListener('canplay', go, { once: true }); o.load(); }
}

/** Нажатие «Слушать»: снимает запрет автозапуска и сразу ставит нужную секунду. */
export function resumeMusic() {
  const now = RV.cur && RV.cur.now;
  if (!now || now.kind !== 'music') return;
  RS.blocked = false;
  const o = RS.audio || (RS.audio = new Audio());
  o.muted = false;
  const at = rvTime(now);
  if (Math.abs((o.currentTime || 0) - at) > 1.2) { try { o.currentTime = at; } catch (e) { /* пусть играет как есть */ } }
  if (now.paused) { if (!o.paused) o.pause(); bump(); return; }
  o.play().then(() => bump()).catch(() => toast('Не получилось включить звук. Нажмите ещё раз — телефон мог включить беззвучный режим.', 'err'));
}

/** Раз в 2 секунды подтягиваем отставание; если мы уехали больше чем на 2.5 с — ровняемся. */
function keepMusic(now, clips) {
  if (!now || now.kind !== 'music' || !RS.audio || !RS.id) return;
  const o = RS.audio;
  if (o.paused || !isFinite(o.duration)) return;
  const at = rvTime(now);
  if (Math.abs(o.currentTime - at) > 1.2) { try { o.currentTime = at; } catch (e) { /* пропустим такт */ } }
}
export const raveAudio = () => RS;

// ───────── комната
export function RaveRoom() {
  const room = RV.cur, [text, setText] = useState(''), [clips, setClips] = useState(null), [tab, setTab] = useState('queue'), [url, setUrl] = useState('');
  // Первый раз в комнате: хозяину — про управление, гостю — почему всё происходит само.
  useEffect(() => {
    let live = true;
    import('./hints.js').then(h => { if (!live) return; if (room.host) h.raveHostHint(); else h.raveGuestHint(); }).catch(() => {});
    return () => { live = false; };
  }, []);
  const chatEnd = useRef();
  useEffect(() => { chatEnd.current && chatEnd.current.scrollIntoView({ block: 'end' }); }, [(room.chat || []).length]);
  useEffect(() => { loadQueue(room.kind).then(l => { RV.q = l; setClips(l); }); }, [room.kind]);
  // Хозяин переключил трек, поставил паузу или перемотал — у всех звук встаёт на ту же секунду.
  useEffect(() => { if (clips) syncMusic(room.now, clips); }, [room.now && room.now.item, room.now && room.now.paused, room.now && room.now.at, room.now && room.now.ts, clips]);
  // Раз в 2 секунды ровняем отставание: у кого связь медленнее — догонит, у кого быстрее — подождёт.
  useEffect(() => {
    const t = setInterval(() => { if (RV.cur === room) keepMusic(room.now, clips); }, 2000);
    return () => { clearInterval(t); try { if (RS.audio) RS.audio.pause(); } catch (e) { /* тихо */ } RS.id = null; };
  }, [!!clips]);
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
    ${host ? html`<p class="hint rv-host">Вы хозяин: пауза, перемотка и новый клип видны всем сразу. Кнопка «ключ» — закрыть комнату от посторонних.</p>` : ''}
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
