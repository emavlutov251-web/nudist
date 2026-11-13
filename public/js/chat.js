// Окно чата: шапка, закрепы, поиск, лента сообщений, треды, форум.
import { svcText, html, useState, useEffect, useRef, useLayoutEffect, S, bump, rpc, call, toast, Icon, Avatar, ChatAvatar, Badges, cx, showMenu, closeMenu, openModal, closeModal, Modal, chatInfo, msgPreview, fmtTime, fmtDay, fmtFull, fmtShort, sameDay, userName, lastSeen, kindIcon, md, copyText, confirmDlg, promptDlg, addUsers, Empty, Spinner, plural, fmtNum, fmtDur, ttlLabel, isMuted, setSetting, debounce } from './lib.js';
import { msgKey, loadHistory, openChat, closeChat, openUser, markRead, retryMsg, secretIssue, ensureKey } from './store.js';
import { Sticker, sfx } from './fun.js';
import { OnceMsg, Streak } from './growth.js';
import { Photo, Gif, VideoMsg, RoundMsg, VoiceMsg, AudioMsg, FileMsg, LocMsg } from './media.js';
import { showProfile, chatActions, openMiniApp, JoinPreview, shareLeaves } from './panels.js';
import { Composer, EmojiPicker, ForwardModal } from './composer.js';
import { GiftCard } from './gifts.js';
import { memberOf } from './guildui.js';
import { startCall, VoiceRoom, joinVoice, RTC } from './rtc.js';
import { openDock, ytFind, ytDock, oldShell } from './dock.js';

const KIND_LABEL = { text: 'текстовый канал', announce: 'объявления', rules: 'правила', forum: 'форум', voice: 'голосовой канал', stage: 'трибуна' };
const TYPING = { text: 'печатает', voice: 'записывает голосовое', round: 'записывает кружочек', file: 'отправляет файл', sticker: 'выбирает стикер' };
function typingLine(k) {
  const t = S.typing[k]; if (!t) return null; const ids = Object.keys(t).filter(u => u !== S.me.id); if (!ids.length) return null;
  const first = t[ids[0]], n = userName(S.users[ids[0]]).split(' ')[0];
  if (ids.length === 1) return first.text ? `${n} печатает: «${first.text.slice(-60)}»` : `${n} ${TYPING[first.kind] || TYPING.text}`;
  return ids.length === 2 ? `${n} и ${userName(S.users[ids[1]]).split(' ')[0]} печатают` : `${ids.length} ${plural(ids.length, ['человек', 'человека', 'человек'])} печатают`;
}
const translit = s => { const m = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: "'", э: 'e', ю: 'yu', я: 'ya' }; return [...s].map(c => { const l = c.toLowerCase(), r = m[l]; return r === undefined ? c : l === c ? r : r.charAt(0).toUpperCase() + r.slice(1); }).join(''); };
const olban = s => s.replace(/тся|ться/g, 'цца').replace(/его\b/g, 'ево').replace(/ого\b/g, 'ова').replace(/\bпривет/gi, 'превед').replace(/в\b/g, 'ф').replace(/жи/g, 'жы').replace(/ши/g, 'шы').replace(/что/g, 'чо').replace(/ик\b/g, 'ег').replace(/я\b/g, 'йа') + ' !!1';

// ═════ Шапка ═════
function Header({ chat, thread, onSearch }) {
  const i = chatInfo(chat), u = i.user, room = S.rooms[chat.id], live = room && room.peers.length > 0;
  const typing = typingLine(msgKey(chat.id, thread));
  let sub;
  if (thread) sub = chat.type === 'channel' ? 'комментарии к посту' : chat.kind === 'forum' ? 'пост на форуме' : 'тред';
  else if (chat.type === 'saved') sub = i.sub;
  else if (u) sub = (chat.type === 'secret' ? '🔒 секретный чат · ' : '') + (u.playing && u.online ? 'играет в ' + u.playing : lastSeen(u));
  else if (chat.server) sub = chat.topic || KIND_LABEL[chat.kind] || '';
  else sub = `${fmtNum(chat.count || 0)} ${chat.type === 'channel' ? plural(chat.count || 0, ['подписчик', 'подписчика', 'подписчиков']) : plural(chat.count || 0, ['участник', 'участника', 'участников'])}`;
  const back = () => { if (thread) { S.ui.thread = null; openChat(chat.id, { keepServer: true }); } else if (chat.server) { S.ui.list = true; bump(); } else closeChat(); };
  const canCall = S.flags.calls && ((chat.type === 'dm' && u && !u.bot && !u.deleted) || chat.type === 'group');
  return html`<header class="chat-h">
    <button class=${cx('ib back', thread && 'show')} onClick=${back} aria-label="Назад"><${Icon} n="arrow-left" /></button>
    <button class="ch-main" onClick=${() => { S.ui.panel = !S.ui.panel; bump(); }} title="Информация о чате">
      ${!thread && html`<${ChatAvatar} chat=${chat} s=${40} />`}
      <span class="ch-t"><b>${thread ? (chat.type === 'channel' ? 'Комментарии' : 'Тред') : html`${chat.server && html`<${Icon} n=${kindIcon(chat.kind)} s=${17} /> `}${i.title}`}${!thread && u && html`<${Badges} list=${u.badges} />`}${!thread && i.verified && !u && html`<${Badges} list=${['verified']} />`}${isMuted(chat) && html`<${Icon} n="bell-off" s=${14} cls="dim" />`}${!thread && html`<${Streak} chat=${chat} big />`}${chat.ttl ? html`<span class="ttl-chip" title="Автоудаление сообщений"><${Icon} n="timer" s=${12} /> ${ttlLabel(chat.ttl)}</span>` : ''}</b>
        <small class=${cx(typing && 'typing')}>${typing ? typing + '…' : sub}</small></span>
    </button>
    ${live && !thread && RTC.chat !== chat.id && html`<button class="btn sm pulse" onClick=${() => joinVoice(chat.id)}><${Icon} n="phone-incoming" s=${15} /> Идёт звонок · войти</button>`}
    ${canCall && !live && !thread && html`<button class="ib" title="Позвонить" onClick=${() => startCall(chat.id, false)}><${Icon} n="phone" /></button><button class="ib hide-s" title="Видеозвонок" onClick=${() => startCall(chat.id, true)}><${Icon} n="video" /></button>`}
    <button class="ib" title="Поиск по чату" onClick=${onSearch}><${Icon} n="search" /></button>
    <button class=${cx('ib hide-s', S.ui.panel && 'act')} title="Информация" onClick=${() => { S.ui.panel = !S.ui.panel; bump(); }}><${Icon} n="panel-right" /></button>
    ${!chat.server && html`<button class="ib" title="Ещё" onClick=${e => showMenu(e, chatActions(chat, false), { right: true })}><${Icon} n="ellipsis-vertical" /></button>`}
  </header>`;
}

// Секретный чат привязан к ключам двух конкретных устройств. Если ключ сменился, честно говорим об этом, а не молча показываем абракадабру.
function SecretNote({ chat }) {
  const why = secretIssue(chat); if (!why) return null;
  const again = async () => { try { await ensureKey(); const c = await rpc('secret.open', { user: chat.peer }); if (c) { S.chats[c.id] = c; openChat(c.id); } } catch (e) { toast(e.message, 'err'); } };
  return html`<div class="secret-note" role="status"><${Icon} n="triangle-alert" s=${18} />
    <p>${why === 'mine' ? 'Этот секретный чат создан на другом вашем устройстве. Здесь его не прочитать и в него не написать: ключ остался там.' : 'Ключ собеседника изменился: он зашёл с другого устройства или переустановил приложение. Там этот чат не расшифруется. Если смена неожиданная, сверьте код безопасности в новом чате.'}</p>
    <button class="btn sm" onClick=${again}>Новый секретный чат</button></div>`;
}
function PinBar({ chat, onJump }) {
  const ids = chat.pinned || [], [d, setD] = useState(null), [i, setI] = useState(0);
  useEffect(() => { if (!ids.length) { setD(null); return; } let live = true; rpc('msg.pinned', { chat: chat.id }).then(r => { addUsers(r.users); if (live) setD(r.msgs); }).catch(() => {}); return () => { live = false; }; }, [ids.join()]);
  if (!ids.length || !d || !d.length) return null;
  const m = d[d.length - 1 - (i % d.length)], can = !chat.can || chat.can.pin;
  const all = () => openModal(PinnedModal, { chat, msgs: d, onJump });
  return html`<div class="pinbar"><div class="pin-n">${d.slice(-4).map((x, n, a) => html`<i class=${cx(a.length - 1 - n === i % d.length && 'on')}></i>`)}</div>
    <button class="pin-m" onClick=${() => { onJump(m.id); setI(i + 1); }}><b>Закреплённое${d.length > 1 ? ` #${d.length - (i % d.length)}` : ''}</b><span>${msgPreview(m, chat) || 'сообщение'}</span></button>
    ${d.length > 1 && html`<button class="ib sm" title="Все закреплённые" onClick=${all}><${Icon} n="list" s=${17} /></button>`}
    ${can && html`<button class="ib sm" title="Открепить" onClick=${() => call('msg.pin', { chat: chat.id, id: m.id, on: false })}><${Icon} n="x" s=${17} /></button>`}</div>`;
}
function PinnedModal({ id, chat, msgs, onJump }) {
  return html`<${Modal} id=${id} title=${'Закреплённые: ' + msgs.length} icon="pin" cls="small">${[...msgs].reverse().map(m => html`<div class="row-item"><button class="ri-m" onClick=${() => { closeModal(id); onJump(m.id); }}><b>${userName(S.users[m.from])}</b><span>${msgPreview(m, chat)}</span><small>${fmtFull(m.ts)}</small></button>${(!chat.can || chat.can.pin) && html`<button class="ib sm" title="Открепить" onClick=${() => { call('msg.pin', { chat: chat.id, id: m.id, on: false }); closeModal(id); }}><${Icon} n="pin-off" s=${17} /></button>`}</div>`)}<//>`;
}

function SearchBar({ chat, onClose }) {
  const [f, setF] = useState({ q: '', type: '', since: '', from: '' }), [res, setRes] = useState(null), [busy, setBusy] = useState(false);
  const run = useRef(debounce(async x => { if (!x.q.trim() && !x.type && !x.since && !x.from) { setRes(null); return; } setBusy(true); try { const r = await rpc('msg.search', { chat: chat.id, q: x.q.trim(), type: x.type || undefined, since: x.since || undefined, from: x.from || undefined }); addUsers(r.users); setRes(r.msgs); } catch (e) { setRes([]); } setBusy(false); }, 280)).current;
  const set = p => { const n = { ...f, ...p }; setF(n); run(n); };
  return html`<div class="chat-search"><div class="cs-bar"><${Icon} n="search" s=${17} /><input autofocus placeholder=${chat.type === 'secret' ? 'В секретном чате сервер искать не умеет' : 'Поиск по этому чату'} disabled=${chat.type === 'secret'} value=${f.q} onInput=${e => set({ q: e.target.value })} onKeyDown=${e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }} />
      <select value=${f.type} onChange=${e => set({ type: e.target.value })} aria-label="Тип"><option value="">Всё</option><option value="media">Фото и видео</option><option value="file">Файлы</option><option value="link">Ссылки</option><option value="voice">Голосовые</option><option value="audio">Музыка</option><option value="gif">GIF</option></select>
      <select value=${f.from} onChange=${e => set({ from: e.target.value })} aria-label="Автор"><option value="">От всех</option><option value=${S.me.id}>Мои</option>${chat.peer && chat.peer !== S.me.id && html`<option value=${chat.peer}>Собеседника</option>`}</select>
      <input type="date" value=${f.since} onChange=${e => set({ since: e.target.value })} title="Начиная с даты" />
      <button class="ib sm" onClick=${onClose} aria-label="Закрыть поиск"><${Icon} n="x" s=${17} /></button></div>
    ${busy && !res && html`<${Spinner} />`}
    ${res && html`<div class="cs-res">${res.length ? res.map(m => html`<button class="ci" onClick=${() => { openChat(chat.id, { jump: m.id, thread: m.thread, keepServer: true }); }}><${Avatar} src=${(S.users[m.from] || {}).avatar} name=${userName(S.users[m.from])} color=${(S.users[m.from] || {}).color} s=${36} /><span class="ci-m"><span class="ci-t"><b>${userName(S.users[m.from])}</b><time>${fmtShort(m.ts)}</time></span><span class="ci-p"><span>${msgPreview(m, chat)}</span></span></span></button>`) : html`<p class="hint center">Ничего не найдено. Чат чист, как нудист.</p>`}</div>`}</div>`;
}

// ═════ Части сообщения ═════
function Poll({ m, chat }) {
  const p = m.poll, voted = !!(p.mine && p.mine.length), show = voted || p.closed, [pick, setPick] = useState([]);
  const vote = opts => call('msg.vote', { chat: chat.id, id: m.id, opts });
  const left = p.closeAt && !p.closed ? Math.max(0, Math.round((p.closeAt - Date.now()) / 1000)) : 0;
  return html`<div class="poll"><b class="poll-q">${p.q}</b><small>${p.quiz ? 'Викторина' : p.anon ? 'Анонимный опрос' : 'Публичный опрос'}${p.multi ? ' · несколько ответов' : ''}${p.closed ? ' · завершён' : left ? ` · осталось ${left > 3600 ? Math.round(left / 3600) + ' ч' : left > 60 ? Math.round(left / 60) + ' мин' : left + ' сек'}` : ''}</small>
    ${p.opts.map((o, i) => { const pc = p.total ? Math.round(p.counts[i] / p.total * 100) : 0, my = voted && p.mine.includes(i), right = p.quiz && p.correct === i, who = p.voters && p.voters[i].map(x => userName(S.users[x])).join(', ');
      return show ? html`<div class=${cx('poll-o res', my && 'my', p.quiz && show && (right ? 'ok' : my ? 'bad' : ''))} title=${who || ''}><span class="po-p">${pc}%</span><span class="po-t">${o}${my ? ' ✓' : ''}${right ? ' ✔' : ''}</span><i style=${`width:${pc}%`}></i></div>`
        : html`<button class=${cx('poll-o', pick.includes(i) && 'my')} onClick=${() => p.multi ? setPick(pick.includes(i) ? pick.filter(x => x !== i) : [...pick, i]) : vote([i])}><span class="po-c">${p.multi ? (pick.includes(i) ? '☑' : '☐') : '○'}</span><span class="po-t">${o}</span></button>`; })}
    ${p.quiz && show && p.explain && html`<p class="poll-ex">💡 ${p.explain}</p>`}
    <div class="poll-f"><span>${p.total} ${plural(p.total, ['голос', 'голоса', 'голосов'])}</span>${!show && p.multi && html`<button class="btn sm" disabled=${!pick.length} onClick=${() => vote(pick)}>Голосовать</button>`}${voted && !p.closed && !p.quiz && html`<button class="link" onClick=${() => vote([])}>Отменить голос</button>`}</div></div>`;
}
function Buttons({ m, chat }) {
  const [busy, setBusy] = useState(null);
  const click = async b => {
    if (b.u) { rpc('msg.click', { chat: chat.id, id: m.id }).catch(() => {}); if (await confirmDlg({ title: 'Открыть ссылку?', text: b.u, ok: 'Открыть' })) window.open(b.u, '_blank', 'noopener,noreferrer'); return; }
    if (b.app) return openMiniApp(m.from);
    if (b.d) { setBusy(b.d); const r = await call('msg.cb', { chat: chat.id, id: m.id, d: b.d }); setBusy(null); if (r && r.toast) toast(r.toast); }
  };
  return html`<div class="kbd">${m.btn.map(row => html`<div>${row.map(b => html`<button disabled=${busy === b.d && !!b.d} onClick=${e => { e.stopPropagation(); click(b); }}>${b.t}${b.u ? html`<${Icon} n="arrow-up-right" s=${12} />` : b.app ? html`<${Icon} n="app-window" s=${12} />` : ''}</button>`)}</div>`)}</div>`;
}
function Body({ m, chat, list }) {
  switch (m.type) {
    case 'once': return html`<${OnceMsg} m=${m} />`;
    case 'photo': return m.once ? html`<${OnceMsg} m=${{ ...m, kind: 'photo', once: 'new' }} />` : html`<${Photo} m=${m} list=${list} />`;
    case 'gif': return html`<${Gif} m=${m} />`;
    case 'video': return m.once ? html`<${OnceMsg} m=${{ ...m, kind: 'video', once: 'new' }} />` : html`<${VideoMsg} m=${m} />`;
    case 'round': return html`<${RoundMsg} m=${m} />`;
    case 'voice': return html`<${VoiceMsg} m=${m} list=${list} />`;
    case 'audio': return html`<${AudioMsg} m=${m} list=${list} />`;
    case 'file': return html`<${FileMsg} m=${m} />`;
    case 'sticker': return html`<${Sticker} st=${m.sticker} size=${S.settings.stickerSize || 160} />`;
    case 'loc': return html`<${LocMsg} m=${m} />`;
    case 'poll': return html`<${Poll} m=${m} chat=${chat} />`;
    case 'contact': { const c = m.contact || {}; return html`<div class="contact-card"><${Avatar} name=${c.name} color=${3} s=${42} /><div><b>${c.name}</b><small>${c.username ? '@' + c.username : ''}${c.phone ? ' ' + c.phone : ''}</small></div>${c.id && html`<button class="btn sm ghost" onClick=${() => showProfile(c.id)}>Профиль</button>`}</div>`; }
    case 'call': { const c = m.call || {}; return html`<div class="call-card"><span class=${cx('cc-i', c.missed && 'miss')}><${Icon} n=${c.missed ? 'phone-missed' : c.video ? 'video' : 'phone'} s=${20} /></span><div><b>${c.missed ? (m.from === S.me.id ? 'Вызов без ответа' : 'Пропущенный звонок') : c.video ? 'Видеозвонок' : 'Звонок'}</b><small>${c.missed ? 'Абонент был занят. Или одевался.' : fmtDur(c.dur)}</small></div><button class="ib sm" title="Перезвонить" onClick=${() => startCall(chat.id, !!c.video)}><${Icon} n="phone-outgoing" s=${17} /></button></div>`; }
    default: return null;
  }
}
const mdOpt = chat => { const s = chat.server && S.servers[chat.server]; return { me: (S.me.username || '').toLowerCase(), emojis: s && s.emojis && s.emojis.length ? s.emojis : undefined, key: chat.server }; };

function react(chat, m, e) { call('msg.react', { chat: chat.id, id: m.id, e }); const r = S.settings.recentEmoji || []; if (r[0] !== e) setSetting({ recentEmoji: [e, ...r.filter(x => x !== e)].slice(0, 24) }); }
async function deleteMsgs(chat, msgs) {
  const priv = ['dm', 'secret', 'saved'].includes(chat.type), canAll = msgs.every(m => m.from === S.me.id) || priv || (chat.can && chat.can.del);
  const forced = chat.type === 'channel' || chat.server || chat.type === 'saved';
  const r = await confirmDlg({ title: msgs.length > 1 ? `Удалить ${msgs.length} ${plural(msgs.length, ['сообщение', 'сообщения', 'сообщений'])}?` : 'Удалить сообщение?', text: forced ? 'Сообщение исчезнет у всех. Навсегда. Как совесть.' : 'Можно убрать только у себя или у всех сразу.', ok: 'Удалить', danger: true, check: canAll && !forced ? 'Удалить у всех' : undefined });
  if (!r) return false;
  await call('msg.del', { chat: chat.id, ids: msgs.map(m => m.id), all: forced ? true : !!r.check });
  return true;
}
function msgMenu(e, m, chat, { thread, onJump }) {
  if (m.tmp) return showMenu(e, [m.failed && { icon: 'refresh-cw', label: 'Отправить ещё раз', run: () => retryMsg(chat.id, m) }, { icon: 'trash-2', label: 'Убрать', danger: true, run: () => { const k = msgKey(chat.id, m.thread); S.msgs[k] = (S.msgs[k] || []).filter(x => x.id !== m.id); bump(); } }]);
  const mine = m.from === S.me.id, priv = ['dm', 'secret', 'saved'].includes(chat.type), can = chat.can || {}, text = m.text || '';
  const sel = String(window.getSelection() || '').trim(), quote = sel && text.includes(sel) ? sel.slice(0, 500) : null;
  const canEdit = mine && !m.fwd && !['service', 'poll', 'sticker', 'call', 'loc', 'contact'].includes(m.type) && !m.dice;
  const canThread = !thread && !m.thread && (chat.type === 'group' || chat.type === 'channel' || chat.server) && m.type !== 'call';
  const head = html`<div class="rx-quick">${(S.settings.recentEmoji || []).slice(0, 7).map(x => html`<button onClick=${() => { closeMenu(); react(chat, m, x); }}>${x}</button>`)}<button title="Другая реакция" onClick=${() => { closeMenu(); openModal(EmojiModal, { onPick: x => react(chat, m, x), chat }); }}><${Icon} n="plus" s=${18} /></button></div>`;
  showMenu(e, [
    (priv || can.send !== false || chat.type === 'channel' && thread) && { icon: 'reply', label: quote ? 'Ответить с цитатой' : 'Ответить', run: () => { S.ui.reply = { m, quote }; S.ui.edit = null; bump(); } },
    canThread && { icon: 'message-square-text', label: chat.type === 'channel' ? 'Комментарии' : m.tcount ? 'Открыть тред' : 'Начать тред', run: () => openChat(chat.id, { thread: m.id, keepServer: true }) },
    canEdit && { icon: 'pencil', label: 'Изменить', run: () => { S.ui.edit = m; S.ui.reply = null; bump(); } },
    text && { icon: 'copy', label: quote ? 'Копировать выделенное' : 'Копировать текст', run: () => { copyText(quote || text); toast('Скопировано'); } },
    (priv || can.pin) && !m.thread && { icon: (chat.pinned || []).includes(m.id) ? 'pin-off' : 'pin', label: (chat.pinned || []).includes(m.id) ? 'Открепить' : 'Закрепить', run: () => call('msg.pin', { chat: chat.id, id: m.id, on: !(chat.pinned || []).includes(m.id) }) },
    chat.type !== 'secret' && m.type !== 'call' && { icon: 'forward', label: 'Переслать', run: () => openModal(ForwardModal, { from: chat.id, ids: [m.id] }) },
    text && chat.type !== 'secret' && { icon: 'send', label: 'Поделиться в Telegram', run: () => { const link = (text.match(/https?:\/\/[^\s<>"]+/) || [])[0] || '', rest = (link ? text.replace(link, '') : text).replace(/\*\*|__|~~|`/g, '').trim().slice(0, 900); window.open('https://t.me/share/url?url=' + encodeURIComponent(link || rest) + (link && rest ? '&text=' + encodeURIComponent(rest) : ''), '_blank', 'noopener'); } },
    { icon: 'circle-check', label: 'Выбрать', run: () => { S.ui.sel = [m.id]; bump(); } },
    '-',
    text && { icon: 'languages', label: 'Перевести', sub: [{ emoji: '🔤', label: 'На транслит', run: () => { m._tr = translit(text); bump(); } }, { emoji: '🐸', label: 'На олбанский', run: () => { m._tr = olban(text); bump(); } }, m._tr && { icon: 'x', label: 'Убрать перевод', run: () => { delete m._tr; bump(); } }] },
    m.edited && (mine || can.del) && chat.type !== 'secret' && { icon: 'history', label: 'История правок', run: () => openModal(EditHistory, { chat, m }) },
    m.poll && !m.poll.closed && (mine || can.del) && { icon: 'circle-stop', label: 'Завершить опрос', run: () => call('msg.pollclose', { chat: chat.id, id: m.id }) },
    m.type === 'photo' && !(m.media || {}).ek && { icon: 'sticker', label: 'Сделать стикером', run: () => { const l = S.settings.stickers || []; if (!l.some(s => s.url === m.media.url)) setSetting({ stickers: [{ url: m.media.url, id: 'u' + Date.now(), pack: 'my' }, ...l].slice(0, 40) }); toast('Стикер добавлен в «Мои»'); } },
    !mine && { icon: 'flag', label: 'Пожаловаться', run: async () => { const t = await promptDlg({ title: 'Жалоба на сообщение', label: 'Что не так?', placeholder: 'Спам, грубость, слишком одет…', ok: 'Отправить' }); if (t !== null) { const r = await call('report', { type: 'msg', target: m.id, chat: chat.id, reason: 'other', text: t }); if (r) toast('Жалоба ушла модераторам'); } } },
    { icon: 'trash-2', label: 'Удалить', danger: true, run: () => deleteMsgs(chat, [m]) },
  ], { head });
}
function EmojiModal({ id, onPick, chat }) { return html`<${Modal} id=${id} title="Реакция" cls="small nopad"><${EmojiPicker} only="emoji" chat=${chat} onEmoji=${e => { closeModal(id); onPick(e); }} /><//>`; }
function EditHistory({ id, chat, m }) {
  const [d, setD] = useState(null);
  useEffect(() => { rpc('msg.hist', { chat: chat.id, id: m.id }).then(setD).catch(e => { toast(e.message, 'err'); closeModal(id); }); }, []);
  return html`<${Modal} id=${id} title="История правок" icon="history" cls="small">${!d ? html`<${Spinner} />` : html`${d.map(h => html`<div class="hist-i"><small>${fmtFull(h.ts)}</small><p>${h.text || html`<i>без текста</i>`}</p></div>`)}<div class="hist-i cur"><small>${fmtFull(m.edited)} · сейчас</small><p>${m.text}</p></div>`}<//>`;
}

// Начало длинного текста: режем по границе абзаца, чтобы не рвать разметку посреди строки
const clipText = t => { const cut = t.lastIndexOf('\n', 1100); return t.slice(0, cut > 500 ? cut : 1000).replace(/[\s.…,;:]+$/, '') + '…'; };
const readMin = t => { const n = Math.max(1, Math.round(t.length / 1200)); return n + ' мин чтения'; };
// Название ролика для окна плеера: первая строка сообщения без разметки и самой ссылки
const ytTitle = text => String(text || '').split('\n').map(l => l.replace(/https?:\/\/\S+/g, '').replace(/\*\*|__|~~|`/g, '').replace(/^(?:▶️|🔴|⚡)\s*/, '').trim()).find(Boolean) || 'Видео с YouTube';
function Msg({ m, prev, chat, list, flat, thread, onJump, root }) {
  const u = S.users[m.from], mine = m.from === S.me.id, sel = S.ui.sel;
  if (m.type === 'service' && m.present) return html`<${GiftCard} m=${m} />`;
  if (m.type === 'service' && m.gift) { const mine = m.from === S.me.id, who = userName(S.users[m.from]); return html`<div class="leafgift" data-mid=${m.id}><div class=${cx('lg-card', mine && 'mine')}>
    <span class="lg-e" aria-hidden="true">🍃</span><div class="lg-m"><b>${mine ? '−' : '+'}${fmtNum(m.gift)} ${plural(m.gift, ['листик', 'листика', 'листиков'])}</b><span>${mine ? 'Вы поделились листиками' : who + ' делится с вами'} · ${fmtTime(m.ts)}</span>${m.note && html`<q>${m.note}</q>`}</div>
    ${!mine && S.flags.stars && html`<button class="btn sm" onClick=${() => shareLeaves(m.from)}>Ответить тем же</button>`}</div></div>`; }
  if (m.type === 'service') return html`<div class="svc" data-mid=${m.id}><span>${svcText(m)}</span></div>`;
  const chan = m.as === 'chan', out = mine && !flat && !chan && chat.type !== 'channel';
  const grouped = !root && prev && prev.type !== 'service' && prev.from === m.from && !prev.hook === !m.hook && prev.as === m.as && m.ts - prev.ts < 300e3 && sameDay(m.ts, prev.ts);
  const sm = chat.server ? memberOf(chat.server, m.from) : null;
  const name = m.hook || (chan ? chat.title : (sm && sm.nick) || userName(u));
  const multi = chat.type === 'group' || !!chat.server || (chat.type === 'channel' && thread);
  const showAva = !chan || flat ? (flat ? !grouped : multi && !out && !grouped) : false, showName = !grouped && (flat || (multi && !out) || m.hook);
  const bare = (m.type === 'sticker' || m.type === 'round') && !m.reply && !m.fwd;
  const rx = m.rx ? Object.entries(m.rx) : [], text = m.type !== 'sticker' && m.type !== 'call' ? m.text : '';
  const long = !!text && text.length > 1600;      // длинный текст (новость целиком) показываем началом, остальное — по кнопке
  const yt = text && chat.type !== 'secret' && !oldShell() ? ytFind(text) : null;      // ролик YouTube играет прямо здесь, в окне плеера
  const onClick = e => { if (!sel) return; e.preventDefault(); e.stopPropagation(); S.ui.sel = sel.includes(m.id) ? sel.filter(x => x !== m.id) : [...sel, m.id]; bump(); };
  const menu = e => { if (e.target.closest('a[href],input,textarea') && !e.shiftKey) return; msgMenu(e, m, chat, { thread, onJump }); };
  const canThread = !thread && !m.tmp && (chat.type === 'channel' || m.tcount > 0);
  const meta = html`<span class="meta">${m.sig && html`<i>${m.sig}</i>`}${m.views ? html`<i title="Просмотры"><${Icon} n="eye" s=${12} /> ${fmtNum(m.views)}</i>` : ''}${m.silent && html`<${Icon} n="bell-off" s=${11} />`}${m.exp && html`<i title=${'Исчезнет ' + fmtFull(m.exp)}><${Icon} n="flame" s=${11} /></i>`}${m.edited && html`<i>изм.</i>`}<time title=${fmtFull(m.ts)}>${fmtTime(m.ts)}</time>${out && html`<${TicksInline} chat=${chat} m=${m} />`}</span>`;
  return html`<div class=${cx('msg', out && 'out', grouped && 'grp', bare && 'bare', sel && 'selmode', sel && sel.includes(m.id) && 'sel', m.tmp && 'tmp', m.failed && 'failed', root && 'root')} data-mid=${m.id} onClick=${onClick} onContextMenu=${menu} onDblClick=${e => { if (!sel && !m.tmp && !e.target.closest('.ph,.voice,.kbd,.poll,video,a')) { S.ui.reply = { m }; S.ui.edit = null; bump(); } }}>
    ${sel && html`<span class="msg-chk"><${Icon} n=${sel.includes(m.id) ? 'circle-check' : 'circle'} s=${20} /></span>`}
    ${(flat || (multi && !out)) && html`<span class="msg-ava">${showAva && (m.hook ? html`<span class="ava" style="width:36px;height:36px;background:var(--sea);color:#fff"><${Icon} n="webhook" s=${18} /></span>` : chan ? html`<${ChatAvatar} chat=${chat} s=${36} />` : html`<${Avatar} src=${u && u.avatar} name=${userName(u)} color=${u ? u.color : 0} s=${36} deleted=${u && u.deleted} onClick=${() => !sel && showProfile(m.from)} />`)}${flat && grouped && html`<time>${fmtTime(m.ts)}</time>`}</span>`}
    <div class="bubble">
      ${showName && html`<div class="msg-n"><b style=${sm && sm.color ? 'color:' + sm.color : !flat && u ? `color:var(--n${u.color % 8})` : ''} onClick=${() => !m.hook && !chan && !sel && showProfile(m.from)}>${sm && sm.icon ? sm.icon + ' ' : ''}${name}</b>${m.hook && html`<i class="tagx">вебхук</i>`}${u && !m.hook && !chan && html`<${Badges} list=${u.badges} s=${13} />`}${flat && html`<time title=${fmtFull(m.ts)}>${fmtShort(m.ts)}${sameDay(m.ts, Date.now()) ? '' : ' ' + fmtTime(m.ts)}</time>`}${flat && m.edited && html`<i class="dim">изм.</i>`}</div>`}
      ${m.fwd && html`<button class="fwd" onClick=${() => m.fwd.chat && S.chats[m.fwd.chat] ? openChat(m.fwd.chat) : m.fwd.username ? openModal(JoinPreview, { q: '@' + m.fwd.username }) : m.fwd.from && showProfile(m.fwd.from)}><${Icon} n="forward" s=${13} /> Переслано от <b>${m.fwd.name || userName(S.users[m.fwd.from])}</b></button>`}
      ${m.title && html`<h4 class="post-t">${m.title}</h4>`}
      ${(m.rq || m.quote) && html`<button class="rq" onClick=${e => { e.stopPropagation(); m.reply && onJump(m.reply); }}><b>${m.rq ? m.rq.name : 'Цитата'}</b><span>${m.quote || (m.rq && (m.rq.text || msgPreview({ type: m.rq.type, text: '' }))) || 'сообщение'}</span></button>`}
      <${Body} m=${m} chat=${chat} list=${list} />
      ${text && html`<div class="txt" dangerouslySetInnerHTML=${{ __html: md(long && !m._open ? clipText(text) : text, mdOpt(chat)) }}></div>`}
      ${long && html`<button class="txt-more" onClick=${e => { e.stopPropagation(); const el = e.currentTarget.closest('.msg'); m._open = !m._open; bump(); if (!m._open && el) setTimeout(() => el.scrollIntoView({ block: 'nearest' }), 30); }}>${m._open ? 'Свернуть' : `Читать полностью · ${readMin(text)}`}</button>`}
      ${m.bad && html`<small class="dim">Откройте чат на устройстве, где он был создан.</small>`}
      ${m._tr && html`<div class="tr"><small>шуточный перевод</small>${m._tr}</div>`}
      ${yt && html`<button class=${cx('ytc', yt.short && 'short')} onClick=${e => { e.stopPropagation(); openDock(ytDock(yt, ytTitle(text))); }} title="Смотреть здесь, не уходя из «Нудиста»"><img src=${`https://i.ytimg.com/vi/${yt.id}/mqdefault.jpg`} alt="" loading="lazy" referrerpolicy="no-referrer" /><span class="ytc-play"><${Icon} n="play" s=${26} /></span><span class="ytc-l">Смотреть здесь</span></button>`}
      ${m.link && !yt && html`<a class="lp" href=${m.link.url} target="_blank" rel="noopener noreferrer">${m.link.img && html`<img src=${m.link.img} alt="" loading="lazy" referrerpolicy="no-referrer" />`}<span><small>${m.link.site}</small><b>${m.link.title}</b>${m.link.desc && html`<i>${m.link.desc}</i>`}</span></a>`}
      ${m.btn && html`<${Buttons} m=${m} chat=${chat} />`}
      ${!flat && !bare && meta}${!flat && bare && html`<span class="meta float">${meta}</span>`}
      ${rx.length > 0 && html`<div class="rxs">${rx.map(([e, us]) => html`<button class=${cx(us.includes(S.me.id) && 'my')} title=${us.slice(0, 12).map(x => userName(S.users[x])).join(', ')} onClick=${ev => { ev.stopPropagation(); react(chat, m, e); }}>${e}<b>${us.length}</b></button>`)}</div>`}
      ${canThread && html`<button class="thr" onClick=${e => { e.stopPropagation(); openChat(chat.id, { thread: m.id, keepServer: true }); }}><${Icon} n="message-square-text" s=${15} /> ${m.tcount ? `${m.tcount} ${chat.type === 'channel' ? plural(m.tcount, ['комментарий', 'комментария', 'комментариев']) : plural(m.tcount, ['ответ', 'ответа', 'ответов'])}` : 'Прокомментировать'}<${Icon} n="chevron-right" s=${15} /></button>`}
      ${m.failed && html`<button class="retry" onClick=${() => retryMsg(chat.id, m)}><${Icon} n="circle-alert" s=${14} /> Не отправлено: ${m.failed}. Повторить</button>`}
    </div>
    ${!sel && !m.tmp && html`<span class="msg-act"><button title="Реакция" onClick=${e => { e.stopPropagation(); react(chat, m, (S.settings.recentEmoji || ['👍'])[0]); }}>${(S.settings.recentEmoji || ['👍'])[0]}</button><button title="Ответить" onClick=${e => { e.stopPropagation(); S.ui.reply = { m }; S.ui.edit = null; bump(); }}><${Icon} n="reply" s=${16} /></button><button title="Ещё" onClick=${e => { e.stopPropagation(); msgMenu(e, m, chat, { thread, onJump }); }}><${Icon} n="ellipsis" s=${16} /></button></span>`}
  </div>`;
}
function TicksInline({ chat, m }) {
  if (m.failed) return html`<${Icon} n="circle-alert" s=${14} cls="tick err" />`;
  if (m.tmp) return html`<${Icon} n="clock" s=${13} cls="tick" />`;
  if (chat.type === 'saved' || chat.type === 'channel') return html`<${Icon} n="check" s=${14} cls="tick" />`;
  const read = (chat.peerRead || 0) >= m.seq, del = (chat.peerDeliv || 0) >= m.seq;
  return html`<${Icon} n=${read || del ? 'check-check' : 'check'} s=${15} cls=${cx('tick', read && 'read')} />`;
}

// ═════ Лента ═════
function MsgList({ chat, thread, flat }) {
  const k = msgKey(chat.id, thread), h = S.hist[k] || {}, list = S.msgs[k] || [];
  const sc = useRef(), stick = useRef(true), lastSeen = useRef(null), anchor = useRef(null), inited = useRef(false), [far, setFar] = useState(false);
  const real = list.filter(m => !m.tmp), firstId = list[0] && list[0].id, lastId = list.length ? list[list.length - 1].id : null;
  const flash = el => { el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1700); };
  const onJump = mid => { const el = sc.current && sc.current.querySelector(`[data-mid="${mid}"]`); if (el) { stick.current = false; flash(el); } else openChat(chat.id, { thread, jump: mid, keepServer: true }); };
  useLayoutEffect(() => {
    const el = sc.current; if (!el) return;
    if (S.ui.jump && !h.loading && h.loaded) { const t = el.querySelector(`[data-mid="${S.ui.jump}"]`); S.ui.jump = null; inited.current = true; if (t) { stick.current = false; flash(t); return; } }
    if (anchor.current) { if (anchor.current.first !== firstId) { el.scrollTop = el.scrollHeight - anchor.current.h + anchor.current.t; anchor.current = null; } return; }
    if (!inited.current) { if (!h.loaded) return; inited.current = true; lastSeen.current = lastId; const d = el.querySelector('.unread-div'); if (d) { el.scrollTop = Math.max(0, d.offsetTop - 12); stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90; } else el.scrollTop = el.scrollHeight; return; }
    if (lastSeen.current !== lastId) { lastSeen.current = lastId; const lm = list[list.length - 1]; if (lm && lm.from === S.me.id && !h.moreAfter) stick.current = true; }
    if (stick.current) el.scrollTop = el.scrollHeight;
  });
  useEffect(() => { const el = sc.current; if (!el || !window.ResizeObserver) return; const ro = new ResizeObserver(() => { if (stick.current && inited.current) el.scrollTop = el.scrollHeight; }); ro.observe(el); if (el.firstElementChild) ro.observe(el.firstElementChild); return () => ro.disconnect(); }, []);
  useEffect(() => { if (!thread && stick.current && !h.moreAfter) markRead(chat.id); }, [lastId, chat.unread]);
  useEffect(() => { const f = () => { if (!thread && stick.current) markRead(chat.id); }; addEventListener('focus', f); document.addEventListener('visibilitychange', f); return () => { removeEventListener('focus', f); document.removeEventListener('visibilitychange', f); }; }, []);
  useEffect(() => { if (chat.type !== 'channel' || thread) return; const ids = real.filter(m => !m._v).map(m => m.id); if (!ids.length) return; real.forEach(m => { m._v = 1; }); rpc('msg.view', { chat: chat.id, ids }).then(r => { for (const m of S.msgs[k] || []) if (r[m.id]) m.views = r[m.id]; bump(); }).catch(() => {}); }, [firstId, lastId]);
  const onScroll = () => {
    const el = sc.current, fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stick.current = fromBottom < 90 && !h.moreAfter; if ((fromBottom > 500 || !!h.moreAfter) !== far) setFar(!far);
    if (el.scrollTop < 250 && h.more && !h.loading && real.length && !anchor.current) { anchor.current = { h: el.scrollHeight, t: el.scrollTop, first: firstId }; loadHistory(chat.id, { thread, before: real[0].seq }).then(() => { setTimeout(() => { anchor.current = null; }, 50); }); }
    if (fromBottom < 250 && h.moreAfter && !h.loading && real.length) loadHistory(chat.id, { thread, after: real[real.length - 1].seq });
    if (stick.current && !thread) markRead(chat.id);
  };
  const down = async () => { if (h.moreAfter) await loadHistory(chat.id, { thread }); stick.current = true; const el = sc.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: S.settings.anim ? 'smooth' : 'auto' }); setFar(false); if (!thread) markRead(chat.id); };
  const click = e => {
    const t = e.target.closest('[data-spoiler],[data-copy],[data-copyable],[data-mention],[data-tag]'); if (!t || S.ui.sel) return;
    const d = t.dataset;
    if ('spoiler' in d) { t.classList.toggle('open'); if (t.classList.contains('open') && S.settings.sound) sfx('whoosh'); }
    else if ('copy' in d) { copyText(t.closest('pre').querySelector('code').textContent); toast('Код скопирован'); }
    else if ('copyable' in d) { copyText(t.textContent); toast('Скопировано'); }
    else if (d.mention) { if (!/^(all|everyone|here)$/.test(d.mention)) showProfile(null, d.mention); }
    else if (d.tag) { S.ui.server = null; S.ui.q = '#' + d.tag; S.ui.list = true; bump(); }
  };
  const rows = []; let prev = null, divided = false;
  if (thread && h.root) { rows.push(html`<${Msg} key=${'root' + h.root.id} m=${{ ...h.root, tcount: 0 }} chat=${chat} list=${[h.root]} flat=${flat} thread=${thread} onJump=${onJump} root />`); rows.push(html`<div class="day"><span>${list.length ? `${real.length}${h.more ? '+' : ''} ${plural(real.length, ['ответ', 'ответа', 'ответов'])}` : 'Ответов пока нет. Будьте первым, кто обнажит мнение.'}</span></div>`); }
  for (const m of list) {
    if (!prev || !sameDay(prev.ts, m.ts)) rows.push(html`<div class="day" key=${'d' + m.id}><span>${fmtDay(m.ts)}</span></div>`);
    if (!divided && h.unreadFrom != null && m.seq > h.unreadFrom && m.from !== S.me.id && !m.tmp) { divided = true; rows.push(html`<div class="unread-div" key="unread"><span>Непрочитанные сообщения</span></div>`); prev = null; }
    rows.push(html`<${Msg} key=${m.id} m=${m} prev=${prev} chat=${chat} list=${list} flat=${flat} thread=${thread} onJump=${onJump} />`);
    prev = m;
  }
  const empty = h.loaded && !list.length && !thread;
  return html`<div class="msgs-wrap"><div class="msgs" ref=${sc} onScroll=${onScroll} onClick=${click}>
      ${h.more && html`<div class="more"><${Spinner} /></div>`}${!h.loaded && !list.length && html`<div class="more"><${Spinner} /></div>`}
      ${empty && html`<${Empty} icon=${chat.type === 'saved' ? 'bookmark' : chat.type === 'secret' ? 'lock' : 'leaf'} title=${chat.type === 'saved' ? 'Избранное' : chat.type === 'secret' ? 'Секретный чат' : 'Здесь пока голо'} text=${chat.type === 'saved' ? 'Пересылайте сюда сообщения, файлы и мысли, которые стыдно забыть.' : chat.type === 'secret' ? 'Сообщения шифруются на устройствах. Сервер видит только абракадабру.' : chat.type === 'channel' ? 'В канале ещё нет постов.' : 'Напишите первое сообщение. Или отправьте стикер — он скажет всё за вас.'} />`}
      ${rows}<div class="msgs-end"></div></div>
    ${far && html`<button class="fab-down" onClick=${down} aria-label="К последним сообщениям">${chat.unread > 0 && !thread && html`<b>${chat.unread > 99 ? '99+' : chat.unread}</b>`}<${Icon} n="chevron-down" /></button>`}</div>`;
}

function Forum({ chat }) {
  const k = msgKey(chat.id), h = S.hist[k] || {}, list = [...(S.msgs[k] || [])].filter(m => m.type !== 'service').reverse(), [tag, setTag] = useState('');
  const tags = [...new Set(list.flatMap(m => m.tags || []))];
  useEffect(() => { markRead(chat.id); }, [list.length]);
  return html`<div class="msgs-wrap"><div class="msgs forum">
    ${tags.length > 0 && html`<div class="chips">${['', ...tags].map(t => html`<button class=${cx('chip', tag === t && 'on')} onClick=${() => setTag(t)}>${t ? '#' + t : 'Все посты'}</button>`)}</div>`}
    ${!h.loaded && html`<${Spinner} />`}${h.loaded && !list.length && html`<${Empty} icon="messages-square" title="Форум пуст" text="Создайте первый пост: заголовок и текст — в поле внизу." />`}
    ${list.filter(m => !tag || (m.tags || []).includes(tag)).map(m => { const u = S.users[m.from]; return html`<button class="post" key=${m.id} onClick=${() => openChat(chat.id, { thread: m.id, keepServer: true })} onContextMenu=${e => msgMenu(e, m, chat, { onJump: () => {} })}>
      <h4>${m.title || 'Без заголовка'}</h4><p>${msgPreview({ ...m, title: '' }, chat)}</p>
      <footer><${Avatar} src=${u && u.avatar} name=${userName(u)} color=${u ? u.color : 0} s=${20} /><span>${userName(u)}</span><span>· ${fmtShort(m.ts)}</span>${(m.tags || []).map(t => html`<i class="tagx">#${t}</i>`)}<b><${Icon} n="message-square" s=${14} /> ${m.tcount || 0}</b></footer></button>`; })}
    ${h.more && html`<button class="btn ghost" onClick=${() => loadHistory(chat.id, { before: (S.msgs[k] || [])[0].seq })}>Показать ещё</button>`}
  </div></div>`;
}

function SelBar({ chat, thread }) {
  const k = msgKey(chat.id, thread), ids = S.ui.sel, msgs = (S.msgs[k] || []).filter(m => ids.includes(m.id)), done = () => { S.ui.sel = null; bump(); };
  return html`<div class="selbar"><button class="ib" onClick=${done} aria-label="Отменить выбор"><${Icon} n="x" /></button><b>${ids.length} ${plural(ids.length, ['сообщение', 'сообщения', 'сообщений'])}</b><span class="sp"></span>
    <button class="btn ghost" disabled=${!msgs.length} onClick=${() => { copyText(msgs.map(m => `${userName(S.users[m.from])}: ${m.text || msgPreview(m)}`).join('\n')); toast('Скопировано'); done(); }}><${Icon} n="copy" s=${16} /><span class="hide-s"> Копировать</span></button>
    ${chat.type !== 'secret' && html`<button class="btn ghost" disabled=${!msgs.length} onClick=${() => { openModal(ForwardModal, { from: chat.id, ids }); done(); }}><${Icon} n="forward" s=${16} /><span class="hide-s"> Переслать</span></button>`}
    <button class="btn danger" disabled=${!msgs.length} onClick=${async () => { if (await deleteMsgs(chat, msgs)) done(); }}><${Icon} n="trash-2" s=${16} /><span class="hide-s"> Удалить</span></button></div>`;
}

function Footer({ chat, thread }) {
  const can = chat.can || {}, u = chatInfo(chat).user, note = (icon, text, btn) => html`<div class="foot-note"><${Icon} n=${icon} s=${17} /><span>${text}</span>${btn}</div>`;
  if (chat.pending) return note('leaf', 'Сначала пройдите проверку: нажмите на фиговый листок в сообщении выше.');
  if (S.me.muted > Date.now() && chat.type !== 'saved') return note('volume-x', `Администрация выдала вам мут до ${fmtFull(S.me.muted)}. Читать можно, писать — нет.`);
  if (chat.muted > Date.now() && (chat.type === 'group' || thread)) return note('volume-x', chat.muted - Date.now() > 50 * 365 * 864e5 ? 'Администраторы запретили вам писать в этом чате.' : `Администраторы запретили вам писать в этом чате до ${fmtFull(chat.muted)}.`);
  if (chat.type === 'channel' && !thread && !can.send) return html`<div class="foot-note"><button class="btn ghost wide" onClick=${() => call('chat.state', { id: chat.id, mute: isMuted(chat) ? 0 : 1e15 })}><${Icon} n=${isMuted(chat) ? 'bell' : 'bell-off'} s=${16} /> ${isMuted(chat) ? 'Включить уведомления' : 'Отключить уведомления'}</button></div>`;
  if (chat.server && !can.send && !(chat.kind === 'voice' || chat.kind === 'stage')) return note('lock', chat.kind === 'rules' || chat.kind === 'announce' ? 'Писать сюда могут только модераторы. Остальные читают и кивают.' : 'У вас нет права писать в этот канал.');
  if (chat.type === 'group' && !can.send) return note('lock', 'Администраторы запретили участникам писать в эту группу.');
  if (u && u.deleted) return note('ghost', 'Аккаунт удалён. Писать больше некому.');
  if (u && (S.me.blocked || []).includes(u.id)) return note('ban', 'Вы заблокировали этого пользователя.', html`<button class="btn sm" onClick=${() => call('me.block', { id: u.id, on: false })}>Разблокировать</button>`);
  return html`<${Composer} key=${chat.id + (thread || '')} chat=${chat} thread=${thread} />`;
}

export function Main({ chat }) {
  const thread = S.ui.thread, k = msgKey(chat.id, thread), h = S.hist[k] || {};
  const [search, setSearch] = useState(false), [hid, setHid] = useState(false);
  const voice = chat.server && (chat.kind === 'voice' || chat.kind === 'stage'), forum = chat.kind === 'forum' && !thread;
  const flat = S.settings.flat === 'auto' ? !!chat.server : !!S.settings.flat;
  useEffect(() => { if (!h.loaded && !h.loading) loadHistory(chat.id, { thread }); }, []);
  useEffect(() => {
    if (chat.type !== 'secret') return;
    const blur = () => setHid(true), focus = () => setHid(false), key = e => { if (e.key === 'PrintScreen') { setHid(true); try { navigator.clipboard.writeText('Скриншоты секретного чата — моветон.'); } catch (x) { /* нет доступа */ } toast('Скриншот? В секретном чате? Мы всё видели.', 'err'); setTimeout(() => setHid(false), 1500); } };
    addEventListener('blur', blur); addEventListener('focus', focus); addEventListener('keyup', key);
    return () => { removeEventListener('blur', blur); removeEventListener('focus', focus); removeEventListener('keyup', key); };
  }, []);
  const drop = e => { e.preventDefault(); e.currentTarget.classList.remove('drag'); const fs = [...(e.dataTransfer.files || [])]; if (fs.length) window.dispatchEvent(new CustomEvent('nudist-files', { detail: fs })); };
  return html`<section class=${cx('chat', flat ? 'flat' : 'bub', hid && 'shield', voice && 'has-voice')} onDragOver=${e => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); e.currentTarget.classList.add('drag'); } }} onDragLeave=${e => { if (e.target === e.currentTarget) e.currentTarget.classList.remove('drag'); }} onDrop=${drop}>
    <${Header} chat=${chat} thread=${thread} onSearch=${() => setSearch(!search)} />
    ${!thread && !forum && html`<${PinBar} chat=${chat} onJump=${mid => openChat(chat.id, { jump: mid, keepServer: true })} />`}
    ${chat.type === 'secret' && html`<${SecretNote} chat=${chat} />`}
    ${search && html`<${SearchBar} chat=${chat} onClose=${() => setSearch(false)} />`}
    ${voice && !thread && html`<${VoiceRoom} chat=${chat} />`}
    ${forum ? html`<${Forum} chat=${chat} />` : html`<${MsgList} chat=${chat} thread=${thread} flat=${flat} />`}
    ${S.ui.sel ? html`<${SelBar} chat=${chat} thread=${thread} />` : html`<${Footer} chat=${chat} thread=${thread} />`}
    <div class="drop-hint"><${Icon} n="upload" s=${40} /><b>Бросайте файлы сюда</b><span>Поймаем и аккуратно разденем от лишних мегабайт</span></div>
    ${hid && html`<div class="shield-msg"><${Icon} n="eye-off" s=${40} /><b>Секретный чат прикрыт</b><span>Вернитесь в окно, чтобы снять листок</span></div>`}
  </section>`;
}
