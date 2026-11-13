// Поле ввода: текст, вложения, запись голоса и кружочков, эмодзи/стикеры/GIF, подсказки, отложенная отправка.
import { html, useState, useEffect, useRef, useLayoutEffect, useMemo, S, bump, rpc, call, toast, Icon, Avatar, ChatAvatar, cx, showMenu, openModal, closeModal, Modal, chatInfo, msgPreview, fmtFull, fmtDur, fmtSize, userName, promptDlg, addUsers, Empty, Spinner, plural, TTL_OPTS, setSetting, debounce, pickFile, upload, Toggle, kindIcon } from './lib.js';
import { msgKey, saveDraft, sendPayload, uploads, sendFiles, encryptFor, encryptFile, openChat } from './store.js';
import { Sticker, PACKS, stickerHints, SLASH, MemeModal } from './fun.js';
import { pickUsers, openMiniApp, shareLeaves } from './panels.js';
import { openGiftShop } from './gifts.js';

// ═════ Эмодзи / стикеры / GIF ═════
// Словарь эмодзи (200 КБ) не нужен, чтобы открыть чат: подгружаем его, когда человек тянется к смайликам.
let EMOJI = null, emoLoad = null;
export const loadEmoji = () => emoLoad || (emoLoad = import('./emoji-data.js').then(m => { EMOJI = m.EMOJI; bump(); }).catch(() => { emoLoad = null; }));
let EM = null; const emo = () => EM || (EMOJI ? (EM = EMOJI.map(g => g.map(s => { const [e, n, t] = s.split('|'); return { e, n, t: (n + ' ' + (t || '')).toLowerCase() }; }))) : (loadEmoji(), []));
const GROUPS = [['🕒', 'Недавние'], ['😀', 'Смайлы'], ['👋', 'Люди'], ['🐻', 'Природа'], ['🍔', 'Еда'], ['✈️', 'Путешествия'], ['⚽', 'Занятия'], ['💡', 'Предметы'], ['🔣', 'Символы'], ['🏳️', 'Флаги']];
export function EmojiPicker({ only, chat, onEmoji, onSticker, onGif }) {
  const [tab, setTab] = useState('emoji'), [g, setG] = useState(0), [q, setQ] = useState(''), [pack, setPack] = useState('leaf');
  const srv = chat && chat.server && S.servers[chat.server], custom = !only && srv ? srv.emojis || [] : [], prem = (S.me.premiumUntil || 0) > Date.now();
  const found = useMemo(() => { const s = q.trim().toLowerCase(); if (!s) return null; const out = []; for (const grp of emo()) for (const x of grp) { if (x.t.includes(s)) out.push(x); if (out.length >= 120) return out; } return out; }, [q, !!EMOJI]);
  const pickE = e => { const r = S.settings.recentEmoji || []; if (r[0] !== e) setSetting({ recentEmoji: [e, ...r.filter(x => x !== e)].slice(0, 24) }); onEmoji(e); };
  const grid = l => html`<div class="em-grid">${l.map(x => html`<button title=${x.n} onClick=${() => pickE(x.e)}>${x.e}</button>`)}</div>`;
  const mine = S.settings.stickers || [], gifs = S.settings.gifs || [];
  const newSticker = async () => { const f = await pickFile('image/*'); if (!f) return; try { const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Не картинка')); i.src = URL.createObjectURL(f); }); const c = document.createElement('canvas'), k = Math.min(1, 320 / Math.max(img.naturalWidth, img.naturalHeight)); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); const blob = await new Promise(r => c.toBlob(r, 'image/webp', 0.9)); const up = await upload(blob, { name: 'sticker.webp' }); setSetting({ stickers: [{ url: up.url, id: 'u' + Date.now(), pack: 'my' }, ...mine].slice(0, 40) }); setPack('my'); toast('Стикер готов'); } catch (e) { toast(e.message, 'err'); } };
  const newGif = async () => { const f = await pickFile('image/gif,image/webp,video/mp4'); if (!f) return; if (f.size > 15e6) return toast('GIF тяжелее 15 МБ — это уже кино', 'err'); try { const up = await upload(f); const d = await new Promise(res => { const i = new Image(); i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => res({}); i.src = up.url; }); setSetting({ gifs: [{ url: up.url, ...d }, ...gifs].slice(0, 60) }); } catch (e) { toast(e.message, 'err'); } };
  const packs = PACKS.filter(p => !(S.settings.hiddenPacks || []).includes(p.id)), cur = packs.find(p => p.id === pack);
  return html`<div class="picker" onMouseDown=${e => e.target.tagName !== 'INPUT' && e.preventDefault()}>
    ${tab === 'emoji' && html`<div class="pk-search"><${Icon} n="search" s=${15} /><input placeholder="Поиск эмодзи: кот, огонь, стыд…" value=${q} onInput=${e => setQ(e.target.value)} /></div>
      ${!found && html`<div class="pk-groups">${GROUPS.map(([e, n], i) => html`<button class=${cx(g === i && 'on')} title=${n} onClick=${() => setG(i)}>${e}</button>`)}</div>`}
      <div class="pk-body">${found ? (found.length ? grid(found) : html`<p class="hint center">Такого эмодзи нет. Изобразите словами.</p>`) : g === 0 ? html`${custom.length > 0 && html`<h5>Эмодзи сервера «${srv.name}»</h5><div class="em-grid">${custom.map(x => html`<button title=${':' + x.name + ':'} onClick=${() => onEmoji(':' + x.name + ':')}><img src=${x.url} alt=${x.name} /></button>`)}</div>`}<h5>Недавние</h5>${grid((S.settings.recentEmoji || []).map(e => ({ e, n: '' })))}<h5>Смайлы</h5>${grid((emo()[0] || []).slice(0, 64))}` : grid(emo()[g - 1] || [])}</div>`}
    ${tab === 'stickers' && html`<div class="pk-groups">${packs.map(p => html`<button class=${cx(pack === p.id && 'on')} title=${p.name} onClick=${() => setPack(p.id)}>${p.icon}</button>`)}<button class=${cx(pack === 'my' && 'on')} title="Мои стикеры" onClick=${() => setPack('my')}>⭐</button></div>
      <div class="pk-body">${pack === 'my' ? html`<h5>Мои стикеры</h5><div class="st-grid">${mine.map(s => html`<span class="st-my"><${Sticker} st=${s} size=${84} onClick=${() => onSticker(s)} /><button title="Удалить" onClick=${() => setSetting({ stickers: mine.filter(x => x !== s) })}>×</button></span>`)}<button class="st-add" onClick=${newSticker}><${Icon} n="plus" s=${22} /><span>Из картинки</span></button></div><p class="hint">Любое фото из чата тоже можно превратить в стикер: правый клик → «Сделать стикером».</p>`
        : cur && html`<h5>${cur.name}${cur.id === 'react' && !prem ? ' · только для Премиума' : ''}</h5><div class=${cx('st-grid', cur.id === 'react' && !prem && 'locked')}>${cur.items.map(s => html`<${Sticker} st=${s} size=${84} onClick=${() => cur.id === 'react' && !prem ? toast('Эксклюзивный набор. Премиум стоит 500 🍃 — их можно натапать в «Листопаде».') : onSticker({ ...s, pack: cur.id })} />`)}</div>`}</div>`}
    ${tab === 'gif' && html`<div class="pk-body"><h5>Моя коллекция GIF</h5><div class="gif-grid">${gifs.map(x => html`<span class="st-my"><img src=${x.url} alt="GIF" loading="lazy" onClick=${() => onGif(x)} /><button title="Убрать" onClick=${() => setSetting({ gifs: gifs.filter(y => y !== x) })}>×</button></span>`)}<button class="st-add" onClick=${newGif}><${Icon} n="plus" s=${22} /><span>Загрузить</span></button></div>
      <p class="hint">GIF из чатов сохраняются сюда правым кликом. Поиск по Tenor/Giphy требует API-ключа, поэтому пока коллекция своя, домашняя, проверенная.</p></div>`}
    ${!only && html`<div class="pk-tabs"><button class=${cx(tab === 'emoji' && 'on')} onClick=${() => setTab('emoji')}><${Icon} n="smile" s=${17} /> Эмодзи</button><button class=${cx(tab === 'stickers' && 'on')} onClick=${() => setTab('stickers')}><${Icon} n="sticker" s=${17} /> Стикеры</button><button class=${cx(tab === 'gif' && 'on')} onClick=${() => setTab('gif')}><${Icon} n="film" s=${17} /> GIF</button></div>`}
  </div>`;
}

// ═════ Модалки ═════
export function ForwardModal({ id, from, ids }) {
  const [q, setQ] = useState(''), [sel, setSel] = useState([]), [hide, setHide] = useState(false), [busy, setBusy] = useState(false);
  const chats = Object.values(S.chats).filter(c => c.type !== 'secret' && !(c.server && (c.kind === 'voice' || c.kind === 'stage')) && (!c.can || c.can.send !== false)).sort((a, b) => (b.type === 'saved') - (a.type === 'saved') || ((b.last || {}).ts || 0) - ((a.last || {}).ts || 0));
  const s = q.trim().toLowerCase(), list = chats.filter(c => !s || chatInfo(c).title.toLowerCase().includes(s)).slice(0, 80);
  const go = async () => { setBusy(true); const r = await call('msg.forward', { from, ids, to: sel, hide }); setBusy(false); if (r) { toast(`Переслано: ${r.n}`); closeModal(id); if (sel.length === 1) openChat(sel[0]); } };
  return html`<${Modal} id=${id} title=${`Переслать ${ids.length > 1 ? ids.length + ' ' + plural(ids.length, ['сообщение', 'сообщения', 'сообщений']) : 'сообщение'}`} icon="forward" footer=${html`<label class="check"><input type="checkbox" checked=${hide} onChange=${e => setHide(e.target.checked)} /> Скрыть автора</label><span class="sp"></span><button class="btn" disabled=${!sel.length || busy} onClick=${go}>Переслать${sel.length ? ' · ' + sel.length : ''}</button>`}>
    <div class="pk-search"><${Icon} n="search" s=${15} /><input autofocus placeholder="Куда пересылаем?" value=${q} onInput=${e => setQ(e.target.value)} /></div>
    <div class="pick-list tall">${list.map(c => { const i = chatInfo(c), on = sel.includes(c.id); return html`<button class=${cx('ci', on && 'on')} onClick=${() => setSel(on ? sel.filter(x => x !== c.id) : sel.length < 20 ? [...sel, c.id] : sel)}><${ChatAvatar} chat=${c} s=${38} online=${false} /><span class="ci-m"><span class="ci-t"><b>${i.title}</b></span><span class="ci-p"><span>${c.server ? 'сервер «' + ((S.servers[c.server] || {}).name || '') + '»' : c.type === 'saved' ? 'заметки себе' : c.type === 'dm' ? 'личный чат' : c.type === 'group' ? 'группа' : 'канал'}</span></span></span><${Icon} n=${on ? 'circle-check' : 'circle'} s=${20} cls=${on ? 'acc' : 'dim'} /></button>`; })}</div><//>`;
}
function PollModal({ id, onSend }) {
  const [p, setP] = useState({ q: '', opts: ['', ''], anon: true, multi: false, quiz: false, correct: 0, explain: '', timer: 0 });
  const set = x => setP(s => ({ ...s, ...x })), opts = p.opts.map(o => o.trim()).filter(Boolean), ok = p.q.trim() && opts.length >= 2;
  return html`<${Modal} id=${id} title="Новый опрос" icon="chart-column" footer=${html`<button class="btn" disabled=${!ok} onClick=${() => { onSend({ type: 'poll', poll: { q: p.q.trim(), opts, anon: p.anon, multi: p.multi, quiz: p.quiz, correct: Math.min(p.correct, opts.length - 1), explain: p.explain, timer: p.timer || undefined } }); closeModal(id); }}>Создать опрос</button>`}>
    <label class="fld"><span>Вопрос</span><input autofocus maxlength="300" value=${p.q} placeholder="Носки с сандалиями — это одежда?" onInput=${e => set({ q: e.target.value })} /></label>
    <div class="fld"><span>Варианты ответа${p.quiz ? ' — отметьте верный' : ''}</span>${p.opts.map((o, i) => html`<div class="row">${p.quiz && html`<input type="radio" name="correct" checked=${p.correct === i} onChange=${() => set({ correct: i })} aria-label="Верный ответ" />`}<input maxlength="100" value=${o} placeholder=${'Вариант ' + (i + 1)} onInput=${e => { const a = [...p.opts]; a[i] = e.target.value; if (i === a.length - 1 && e.target.value && a.length < 10) a.push(''); set({ opts: a }); }} />${p.opts.length > 2 && html`<button class="ib sm" onClick=${() => set({ opts: p.opts.filter((_, k) => k !== i), correct: 0 })} aria-label="Убрать вариант"><${Icon} n="x" s=${16} /></button>`}</div>`)}</div>
    <${Toggle} label="Анонимное голосование" on=${p.anon} onChange=${v => set({ anon: v })} />
    <${Toggle} label="Несколько ответов" on=${p.multi} disabled=${p.quiz} onChange=${v => set({ multi: v })} />
    <${Toggle} label="Режим викторины" hint="Один правильный ответ и пояснение" on=${p.quiz} onChange=${v => set({ quiz: v, multi: false })} />
    ${p.quiz && html`<label class="fld"><span>Пояснение после ответа</span><input maxlength="200" value=${p.explain} onInput=${e => set({ explain: e.target.value })} /></label>`}
    <label class="fld"><span>Закрыть автоматически</span><select value=${p.timer} onChange=${e => set({ timer: +e.target.value })}><option value="0">Не закрывать</option><option value="30">Через 30 секунд</option><option value="300">Через 5 минут</option><option value="3600">Через час</option><option value="86400">Через сутки</option><option value="604800">Через неделю</option></select></label><//>`;
}
const pad = n => String(n).padStart(2, '0'), toLocal = t => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
function ScheduleModal({ id, res }) {
  const [v, setV] = useState(toLocal(Date.now() + 3600e3)), done = x => { res(x); closeModal(id); };
  const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return +d; };
  return html`<${Modal} id=${id} title="Отложить отправку" icon="clock" cls="small" onClose=${() => res(null)} footer=${html`<button class="btn" onClick=${() => { const t = +new Date(v); if (!(t > Date.now() + 5000)) return toast('Время должно быть в будущем. Машину времени не завезли.', 'err'); done(t); }}>Запланировать</button>`}>
    <label class="fld"><span>Дата и время</span><input type="datetime-local" value=${v} min=${toLocal(Date.now())} onInput=${e => setV(e.target.value)} /></label>
    <div class="chips"><button class="chip" onClick=${() => done(Date.now() + 600e3)}>Через 10 минут</button><button class="chip" onClick=${() => done(Date.now() + 3600e3)}>Через час</button><button class="chip" onClick=${() => done(tomorrow())}>Завтра в 9:00</button></div><//>`;
}
function ScheduledModal({ id, chat }) {
  const [d, setD] = useState(null), load = () => rpc('msg.scheduled', { chat: chat.id }).then(setD).catch(e => toast(e.message, 'err'));
  useEffect(() => { load(); }, []);
  return html`<${Modal} id=${id} title="Отложенные сообщения" icon="clock" cls="small">${!d ? html`<${Spinner} />` : !d.length ? html`<${Empty} icon="clock" title="Ничего не запланировано" text="Правый клик по кнопке отправки → «Отложить»." />` : d.map(x => html`<div class="row-item"><div class="ri-m"><b>${fmtFull(x.at)}</b><span>${x.p.enc ? '🔒 зашифровано' : msgPreview({ ...x.p, from: S.me.id }) || 'сообщение'}</span></div><button class="ib sm" title="Отменить" onClick=${async () => { await call('msg.unschedule', { id: x.id }); load(); }}><${Icon} n="trash-2" s=${17} /></button></div>`)}<//>`;
}
function SendFiles({ id, chat, thread, files, reply, asFile: af }) {
  const [caption, setCaption] = useState(''), [asFile, setAsFile] = useState(!!af), [spoiler, setSpoiler] = useState(false), [once, setOnce] = useState(false), [list, setList] = useState(files);
  const canOnce = chat.type === 'dm' && !thread && !asFile && list.length > 0 && list.every(f => /^(image|video)\//.test(f.type) && f.type !== 'image/gif');
  const urls = useMemo(() => list.map(f => (f.type.startsWith('image/') ? URL.createObjectURL(f) : null)), [list]);
  const go = () => { closeModal(id); sendFiles(chat.id, list, { asFile, caption: caption.trim(), spoiler, reply, thread, once: canOnce && once }); };
  return html`<${Modal} id=${id} title=${`Отправить ${list.length} ${plural(list.length, ['файл', 'файла', 'файлов'])}`} icon="paperclip" footer=${html`<button class="btn" disabled=${!list.length} onClick=${go}><${Icon} n="send" s=${16} /> Отправить</button>`}>
    <div class="files-prev">${list.map((f, i) => html`<div class="fp">${urls[i] ? html`<img src=${urls[i]} alt="" />` : html`<span class="fp-i"><${Icon} n=${f.type.startsWith('video/') ? 'film' : f.type.startsWith('audio/') ? 'music' : 'file'} s=${26} /></span>`}<small title=${f.name}>${f.name}</small><small class="dim">${fmtSize(f.size)}</small><button title="Убрать" onClick=${() => setList(list.filter((_, k) => k !== i))}>×</button></div>`)}</div>
    <label class="fld"><span>Подпись</span><textarea rows="2" maxlength="1024" value=${caption} autofocus onInput=${e => setCaption(e.target.value)} onKeyDown=${e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(); } }}></textarea></label>
    <${Toggle} label="Отправить как файлы" hint="Без сжатия и предпросмотра" on=${asFile} onChange=${setAsFile} />
    <${Toggle} label="Прикрыть листком" hint="Фото и видео откроются по нажатию" on=${spoiler} onChange=${setSpoiler} />
    ${canOnce && html`<${Toggle} label="Одноразовое" hint="Откроется один раз, потом сотрётся с сервера. Без подписи и пересылки" on=${once} onChange=${setOnce} />`}
    ${chat.type === 'secret' && html`<p class="hint">🔒 Файлы будут зашифрованы в браузере до загрузки.</p>`}<//>`;
}

// ═════ Composer ═════
const SMILE = { ':)': '🙂', ':(': '🙁', ':D': '😄', ';)': '😉', ':P': '😛', '<3': '❤️', ':o': '😮', 'xD': '😆', ':*': '😘' };
const pickMime = l => l.find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
const memberCache = new Map();
async function membersFor(chat) {
  const key = chat.server || chat.id, c = memberCache.get(key); if (c && Date.now() - c.at < 60000) return c.list;
  let list = [];
  try { const r = chat.server ? await rpc('server.members', { id: chat.server }) : await rpc('chat.members', { id: chat.id }); list = r.members.map(m => m.user); for (const u of list) S.users[u.id] = { ...S.users[u.id], ...u }; } catch (e) { /* канал: список скрыт */ }
  memberCache.set(key, { at: Date.now(), list }); return list;
}
export function Composer({ chat, thread }) {
  const edit = S.ui.edit, reply = S.ui.reply, peer = chatInfo(chat).user, forumRoot = chat.kind === 'forum' && !thread;
  const [text, setTextRaw] = useState(() => (!thread && chat.draft) || ''), [title, setTitle] = useState(''), [pick, setPick] = useState(false), [sug, setSug] = useState(null), [fmt, setFmt] = useState(false), [, tick] = useState(0);
  const ta = useRef(), tref = useRef(text), rec = useRef(null), lastTyping = useRef(0), vref = useRef();
  const setText = v => { tref.current = v; setTextRaw(v); };
  const draftSave = useRef(debounce(v => saveDraft(chat.id, v), 700)).current;
  useEffect(() => () => { draftSave.cancel(); if (!thread && !S.ui.edit) saveDraft(chat.id, tref.current.trim() ? tref.current : ''); if (rec.current) stopRec(false); }, []);
  const wasEdit = useRef(false);
  useEffect(() => { if (edit) { wasEdit.current = true; setText(edit.text || ''); ta.current && ta.current.focus(); } else if (wasEdit.current) { wasEdit.current = false; setText(''); } }, [edit && edit.id]);
  useEffect(() => { if (reply && ta.current) ta.current.focus(); }, [reply && reply.m.id]);
  useEffect(() => { if (matchMedia('(min-width: 800px)').matches && ta.current) ta.current.focus(); }, []);
  useLayoutEffect(() => { const el = ta.current; if (!el) return; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 220) + 'px'; }, [text]);
  useEffect(() => { const f = e => stage(e.detail); addEventListener('nudist-files', f); return () => removeEventListener('nudist-files', f); }, [reply]);

  const stage = (files, asFile) => { if (files && files.length) openModal(SendFiles, { chat, thread, files: [...files].slice(0, 20), reply: reply && reply.m.id, asFile }); S.ui.reply = null; };
  const insert = (a, b) => { const el = ta.current, s = el.selectionStart, e = el.selectionEnd, v = tref.current; setText(b !== undefined ? v.slice(0, s) + a + v.slice(s, e) + b + v.slice(e) : v.slice(0, s) + a + v.slice(e)); requestAnimationFrame(() => { el.focus(); const p = b !== undefined ? (s === e ? s + a.length : e + a.length + b.length) : s + a.length; el.setSelectionRange(p, p); }); };
  const post = (p, o) => { const r = reply && reply.m.id; S.ui.reply = null; return sendPayload(chat.id, { ...p, reply: r, quote: (reply && reply.quote) || undefined }, { thread, ...o }); };

  // подсказки: /команды, @упоминания, inline-боты
  const inlineQ = useRef(debounce(async (bot, q) => { try { const items = await rpc('bot.inline', { bot, q }); setSug(s => (s && s.kind === 'inline' ? { ...s, items, i: 0 } : s)); } catch (e) { setSug(null); } }, 250)).current;
  const refreshSug = async (v, pos) => {
    let m = v.match(/^@([a-zA-Z0-9_]*bot)\s+([\s\S]*)$/i);
    if (m && !edit) { setSug(s => ({ kind: 'inline', bot: m[1], items: s && s.kind === 'inline' ? s.items : [], i: 0 })); inlineQ(m[1], m[2]); return; }
    m = v.match(/^\/([a-zA-Zа-яёА-ЯЁ0-9_]*)$/);
    if (m && !edit) { const q = m[1].toLowerCase(); const items = [...((peer && peer.bot && peer.cmds) || []).map(c => ({ c: c.c, d: c.d, bot: true })), ...SLASH].filter(x => x.c.startsWith(q)); setSug(items.length ? { kind: 'slash', items, i: 0 } : null); return; }
    m = v.slice(0, pos).match(/(?:^|\s)@([a-zA-Z0-9_]{0,32})$/);
    if (m && (chat.type === 'group' || chat.server || (chat.type === 'channel' && thread))) {
      const q = m[1].toLowerCase(), all = await membersFor(chat);
      const items = [...(('all'.startsWith(q) || 'here'.startsWith(q)) && (!chat.can || chat.can.mention || (chat.count || 99) <= 50) ? [{ special: 'all', d: 'позвать всех' }, chat.server && { special: 'here', d: 'позвать тех, кто в сети' }].filter(Boolean) : []), ...all.filter(u => u.username && u.id !== S.me.id && (u.username.toLowerCase().startsWith(q) || userName(u).toLowerCase().includes(q))).slice(0, 8)];
      if (tref.current === v) setSug(items.length ? { kind: 'mention', items, i: 0, start: pos - m[1].length - 1, end: pos } : null); return;
    }
    setSug(null);
  };
  const clearInput = () => { setText(''); setSug(null); draftSave.cancel(); if (!thread) saveDraft(chat.id, ''); };
  const applySug = it => {
    if (sug.kind === 'slash') { if (it.bot || it.server) { if (it.arg) { setText('/' + it.c + ' '); setSug(null); ta.current.focus(); } else { clearInput(); post({ text: '/' + it.c }); } } else if (it.arg) { setText('/' + it.c + ' '); setSug(null); ta.current.focus(); } else { setText('/' + it.c); setSug(null); send('/' + it.c); } }
    else if (sug.kind === 'mention') { const v = tref.current, name = '@' + (it.special || it.username) + ' '; setText(v.slice(0, sug.start) + name + v.slice(sug.end)); setSug(null); requestAnimationFrame(() => { ta.current.focus(); const p = sug.start + name.length; ta.current.setSelectionRange(p, p); }); }
    else if (sug.kind === 'inline') { clearInput(); post(it.send); }
  };

  const onInput = e => {
    let v = e.target.value;
    if (S.settings.emojiAuto && v.length > tref.current.length && /\s$/.test(v)) v = v.replace(/(^|\s)(:\)|:\(|:D|;\)|:P|<3|:o|xD|:\*)(\s)$/, (m, a, s, b) => a + SMILE[s] + b);
    setText(v); refreshSug(v, e.target.selectionStart);
    if (!thread && !edit) draftSave(v);
    const naked = S.settings.nakedTyping && chat.type === 'dm';
    if (v && chat.type !== 'channel' && chat.type !== 'saved' && Date.now() - lastTyping.current > (naked ? 900 : 3000)) { lastTyping.current = Date.now(); rpc('chat.typing', { id: chat.id, kind: 'text', thread, text: naked ? v.slice(-200) : undefined }).catch(() => {}); }
  };
  async function send(force, extra = {}) {
    let v = (typeof force === 'string' ? force : tref.current).trim();
    if (edit) {
      if (!v && !edit.media) return toast('Пустое сообщение проще удалить');
      const m = edit; S.ui.edit = null; setText(''); bump();
      if (v !== (m.text || '')) { if (chat.type === 'secret') await call('msg.edit', { chat: chat.id, id: m.id, enc: await encryptFor(chat, { type: m.type, text: v, media: m.media }) }); else await call('msg.edit', { chat: chat.id, id: m.id, text: v }); }
      return;
    }
    if (!v) return;
    if (forumRoot && !title.trim()) return toast('У поста на форуме должен быть заголовок');
    let fx;
    const cm = v.match(/^\/([a-zA-Z0-9_]+)(?:\s+([\s\S]*))?$/);
    if (cm) { const it = SLASH.find(s => s.c === cm[1].toLowerCase()); if (it) { if (it.action) { it.action(chat.id); clearInput(); return; } if (it.run) { if (it.arg && !cm[2]) return toast(`Нужен текст: /${it.c} ${it.arg}`); v = it.run(cm[2] || ''); fx = it.fx; } } }
    const tags = forumRoot ? [...title.matchAll(/#([\p{L}\p{N}_]{2,24})/gu)].map(x => x[1]) : undefined;
    setText(''); setSug(null); draftSave.cancel(); if (!thread) saveDraft(chat.id, '');
    const p = { text: v, fx, silent: extra.silent || undefined, ttl: extra.ttl || undefined, at: extra.at, title: forumRoot ? title.replace(/#[\p{L}\p{N}_]{2,24}/gu, '').trim() || title.trim() : undefined, tags: tags && tags.length ? tags : undefined };
    if (forumRoot) setTitle('');
    await post(p);
  }
  const onKey = e => {
    if (sug && sug.items.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = sug.items.length; setSug({ ...sug, i: (sug.i + (e.key === 'ArrowDown' ? 1 : n - 1)) % n }); return; }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); applySug(sug.items[sug.i]); return; }
      if (e.key === 'Escape') { e.stopPropagation(); setSug(null); return; }
    }
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.shiftKey && (e.key === 'b' || e.key === 'и')) { e.preventDefault(); return insert('**', '**'); }
    if (mod && !e.shiftKey && (e.key === 'i' || e.key === 'ш')) { e.preventDefault(); return insert('__', '__'); }
    if (mod && e.shiftKey && (e.key === 'X' || e.key === 'Ч')) { e.preventDefault(); return insert('~~', '~~'); }
    if (mod && e.shiftKey && (e.key === 'P' || e.key === 'З')) { e.preventDefault(); return insert('||', '||'); }
    if (mod && e.shiftKey && (e.key === 'M' || e.key === 'Ь')) { e.preventDefault(); return insert('`', '`'); }
    if (e.key === 'Enter' && !e.isComposing && (S.settings.enterSend ? !e.shiftKey && !mod : mod)) { e.preventDefault(); send(); return; }
    if (e.key === 'ArrowUp' && !tref.current && !edit) { const l = S.msgs[msgKey(chat.id, thread)] || []; for (let i = l.length - 1; i >= 0; i--) { const m = l[i]; if (m.from === S.me.id && !m.tmp && !m.fwd && ['text', 'photo', 'video', 'file', 'audio', 'gif'].includes(m.type) && !m.dice) { e.preventDefault(); S.ui.edit = m; S.ui.reply = null; bump(); break; } } }
  };
  const onPaste = e => { const fs = [...(e.clipboardData.files || [])]; if (fs.length) { e.preventDefault(); stage(fs); } };

  // запись голосовых и кружочков
  function stopRec(doSend) { const r = rec.current; if (!r) return; r.send = doSend; rec.current = null; clearInterval(r.timer); try { r.sr && r.sr.stop(); } catch (e) { /* уже остановлено */ } try { r.mr.stop(); } catch (e) { r.stream.getTracks().forEach(t => t.stop()); } tick(x => x + 1); }
  async function startRec(kind) {
    if (rec.current) return;
    if (!navigator.mediaDevices || !window.MediaRecorder) return toast('Браузер не умеет записывать. Придётся печатать.', 'err');
    try {
      const stream = await navigator.mediaDevices.getUserMedia(kind === 'round' ? { audio: true, video: { width: 384, height: 384, facingMode: 'user' } } : { audio: { noiseSuppression: !!S.settings.noise, echoCancellation: !!S.settings.echo } });
      const mime = kind === 'round' ? pickMime(['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']) : pickMime(['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']);
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined), chunks = [], wave = [], t0 = Date.now();
      const ac = new (window.AudioContext || window.webkitAudioContext)(), an = ac.createAnalyser(); an.fftSize = 256; ac.createMediaStreamSource(stream).connect(an); const buf = new Uint8Array(an.fftSize);
      const r = { kind, stream, mr, sec: 0, level: 0, heard: '' };
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (kind === 'voice' && SR && S.settings.transcribe && chat.type !== 'secret') { try { r.sr = new SR(); r.sr.lang = 'ru-RU'; r.sr.continuous = true; r.sr.onresult = ev => { let s = ''; for (const x of ev.results) if (x.isFinal) s += x[0].transcript + ' '; r.heard = s.trim(); }; r.sr.onerror = () => {}; r.sr.start(); } catch (e) { r.sr = null; } }
      mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop()); ac.close().catch(() => {});
        const dur = (Date.now() - t0) / 1000; if (!r.send) return;
        if (dur < 0.8) return toast('Слишком коротко. Даже «угу» длиннее.');
        const n = 48, w = Array.from({ length: n }, (_, i) => { const a = Math.floor(i * wave.length / n), b = Math.max(a + 1, Math.floor((i + 1) * wave.length / n)); return Math.min(31, Math.round(Math.max(0, ...wave.slice(a, b)) / 4)); });
        let blob = new Blob(chunks, { type: mr.mimeType || mime }), extra = {}; const size = blob.size, type = (blob.type || '').split(';')[0], ext = /mp4/.test(type) ? 'mp4' : /ogg/.test(type) ? 'ogg' : 'webm';
        const u = { id: 'r' + Date.now(), name: kind === 'round' ? 'Кружочек' : 'Голосовое', p: 0, ctl: new AbortController(), chat: chat.id }; uploads.push(u); bump();
        try {
          if (chat.type === 'secret') { const enc = await encryptFile(blob); extra = { ek: enc.k, eiv: enc.iv }; blob = enc.blob; }
          const up = await upload(blob, { name: chat.type === 'secret' ? 'secret.bin' : (kind === 'round' ? 'round.' : 'voice.') + ext, signal: u.ctl.signal, onProgress: x => { u.p = x; bump(); } });
          await post({ type: kind, text: r.heard || undefined, media: { url: up.url, size, mime: type, dur, wave: kind === 'voice' ? w : undefined, w: kind === 'round' ? 384 : undefined, h: kind === 'round' ? 384 : undefined, ...extra } });
        } catch (e) { toast(e.message, 'err'); }
        uploads.splice(uploads.indexOf(u), 1); bump();
      };
      r.timer = setInterval(() => { an.getByteTimeDomainData(buf); let pk = 0; for (const b of buf) pk = Math.max(pk, Math.abs(b - 128)); wave.push(pk); r.sec = (Date.now() - t0) / 1000; r.level = Math.min(1, pk / 90); if (r.sec > (kind === 'round' ? 60 : 900)) stopRec(true); if (Date.now() - lastTyping.current > 3000 && chat.type !== 'channel') { lastTyping.current = Date.now(); rpc('chat.typing', { id: chat.id, kind, thread }).catch(() => {}); } tick(x => x + 1); }, 100);
      mr.start(250); rec.current = r; tick(x => x + 1);
    } catch (e) { toast(e.name === 'NotAllowedError' ? 'Нет доступа к ' + (kind === 'round' ? 'камере и микрофону' : 'микрофону') + '. Разрешите его в настройках браузера.' : 'Не удалось начать запись: ' + e.message, 'err'); }
  }
  useEffect(() => { const r = rec.current; if (r && r.kind === 'round' && vref.current && vref.current.srcObject !== r.stream) vref.current.srcObject = r.stream; });

  const sticker = s => { setPick(false); post({ type: 'sticker', sticker: { pack: s.pack, id: s.id, e: s.e, t: s.t, bg: s.bg, anim: s.anim, snd: s.snd, url: s.url } }); };
  const geo = () => { const manual = async () => { const v = await promptDlg({ title: 'Геопозиция', label: 'Широта, долгота', placeholder: '56.8389, 60.6057', hint: 'Браузер не поделился координатами — введите вручную.' }); const m = v && v.match(/(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)/); if (m) post({ type: 'loc', loc: { lat: +m[1], lon: +m[2] } }); }; if (!navigator.geolocation) return manual(); navigator.geolocation.getCurrentPosition(p => post({ type: 'loc', loc: { lat: p.coords.latitude, lon: p.coords.longitude } }), manual, { timeout: 8000 }); };
  const attach = e => showMenu(e, [
    { icon: 'image', label: 'Фото или видео', run: async () => stage(await pickFile('image/*,video/*', true)) },
    { icon: 'file', label: 'Файл', run: async () => stage(await pickFile('', true), true) },
    { icon: 'layout-grid', label: 'Приложения', hint: 'игры и утилиты', run: () => import('./hub.js').then(h => h.openApps(chat.id)) },
    chat.type !== 'secret' && { icon: 'wand-sparkles', label: 'Мемогенератор', hint: 'и демотиваторы', run: () => openModal(MemeModal, { onSend: p => post(p) }) },
    chat.type !== 'secret' && { icon: 'chart-column', label: 'Опрос', run: () => openModal(PollModal, { onSend: p => post(p) }) },
    { icon: 'circle-dot', label: 'Кружочек', run: () => startRec('round') },
    { icon: 'map-pin', label: 'Геопозиция', run: geo },
    { icon: 'contact', label: 'Контакт', run: async () => { const ids = await pickUsers({ title: 'Поделиться контактом', ok: 'Отправить' }); if (ids && ids[0]) post({ type: 'contact', contact: { id: ids[0] } }); } },
    peer && !peer.bot && S.flags.stars && { emoji: '🎁', label: 'Подарок', hint: 'за листики', run: () => openGiftShop(peer.id) },
    peer && !peer.bot && S.flags.stars && { emoji: '🍃', label: 'Поделиться листиками', run: () => shareLeaves(peer.id) },
    '-', { icon: 'clock', label: 'Отложенные сообщения', run: () => openModal(ScheduledModal, { chat }) },
  ], { anchor: e.currentTarget });
  const sendMenu = e => showMenu(e, [
    { icon: 'bell-off', label: 'Отправить без звука', run: () => send(null, { silent: true }) },
    { icon: 'clock', label: 'Отложить…', run: async () => { if (!tref.current.trim()) return toast('Сначала напишите сообщение'); const at = await new Promise(res => openModal(ScheduleModal, { res })); if (at) send(null, { at }); } },
    { icon: 'flame', label: 'Сгорит после прочтения…', sub: TTL_OPTS.filter(o => o[0]).map(([s, l]) => ({ label: 'Через ' + l.replace(/^1 /, '').replace('секунда', '1 секунду').replace('минута', 'минуту').replace('неделя', 'неделю'), run: () => send(null, { ttl: s }) })) },
  ]);

  const r = rec.current, ups = uploads.filter(u => u.chat === chat.id), hints = !sug && !edit ? stickerHints(text) : [];
  const botStart = peer && peer.bot && !chat.last && !text;
  const ph = edit ? 'Исправляем сказанное…' : forumRoot ? 'Текст поста' : chat.type === 'channel' && !thread ? 'Пост в канал' : thread ? 'Ответить в треде' : chat.type === 'saved' ? 'Заметка себе любимому' : chat.type === 'secret' ? 'Секретное сообщение' : 'Сообщение';
  return html`<div class="composer">
    ${ups.length > 0 && html`<div class="ups">${ups.map(u => html`<div class="up"><${Icon} n="upload" s=${15} /><span>${u.name}</span><i><b style=${`width:${Math.round(u.p * 100)}%`}></b></i><small>${Math.round(u.p * 100)}%</small><button class="ib sm" title="Отменить загрузку" onClick=${() => u.ctl.abort()}><${Icon} n="x" s=${15} /></button></div>`)}</div>`}
    ${sug && sug.items.length > 0 && html`<div class="sug">${sug.kind === 'inline' && html`<h5>@${sug.bot} предлагает</h5>`}${sug.items.map((it, i) => html`<button class=${cx(i === sug.i && 'on')} onMouseDown=${e => { e.preventDefault(); applySug(it); }}>
      ${sug.kind === 'slash' ? html`<b>/${it.c}${it.arg ? html` <i>${it.arg}</i>` : ''}</b><span>${it.d}</span>${it.bot && html`<small>бот</small>`}` : sug.kind === 'mention' ? (it.special ? html`<span class="ava" style="width:26px;height:26px;background:var(--accent);color:#fff"><${Icon} n="megaphone" s=${14} /></span><b>@${it.special}</b><span>${it.d}</span>` : html`<${Avatar} src=${it.avatar} name=${userName(it)} color=${it.color} s=${26} /><b>${userName(it)}</b><span>@${it.username}</span>`) : html`<b>${it.title}</b><span>${it.desc}</span>`}</button>`)}</div>`}
    ${hints.length > 0 && html`<div class="st-hints">${hints.map(s => html`<${Sticker} st=${s} size=${64} onClick=${() => { setText(''); saveDraft(chat.id, ''); sticker(s); }} />`)}</div>`}
    ${(reply || edit) && html`<div class="c-ctx"><${Icon} n=${edit ? 'pencil' : 'reply'} s=${18} /><div><b>${edit ? 'Редактирование' : 'Ответ: ' + userName(S.users[reply.m.from])}</b><span>${edit ? msgPreview(edit) : reply.quote || msgPreview(reply.m) || 'сообщение'}</span></div><button class="ib sm" onClick=${() => { if (edit) setText(''); S.ui.reply = null; S.ui.edit = null; bump(); }} aria-label="Отмена"><${Icon} n="x" s=${17} /></button></div>`}
    ${forumRoot && html`<input class="c-title" maxlength="120" placeholder="Заголовок поста. Теги — через #решётку" value=${title} onInput=${e => setTitle(e.target.value)} />`}
    ${fmt && html`<div class="fmt"><button title="Жирный (Ctrl+B)" onClick=${() => insert('**', '**')}><b>Ж</b></button><button title="Курсив (Ctrl+I)" onClick=${() => insert('__', '__')}><i>К</i></button><button title="Зачёркнутый (Ctrl+Shift+X)" onClick=${() => insert('~~', '~~')}><s>З</s></button><button title="Спойлер-листок (Ctrl+Shift+P)" onClick=${() => insert('||', '||')}>🍃</button><button title="Моноширинный (Ctrl+Shift+M)" onClick=${() => insert('`', '`')}><code>{}</code></button><button title="Блок кода" onClick=${() => insert('```js\n', '\n```')}><${Icon} n="code" s=${15} /></button><button title="Цитата" onClick=${() => insert('> ')}><${Icon} n="quote" s=${15} /></button><button title="Список" onClick=${() => insert('- ')}><${Icon} n="list" s=${15} /></button><button title="Ссылка" onClick=${() => insert('[', '](https://)')}><${Icon} n="link" s=${15} /></button></div>`}
    ${r ? html`<div class="rec">${r.kind === 'round' && html`<video class="rec-round" ref=${vref} muted autoplay playsinline></video>`}
        <button class="ib" title="Отменить запись" onClick=${() => stopRec(false)}><${Icon} n="trash-2" /></button><span class="rec-dot" style=${`transform:scale(${1 + r.level * 0.9})`}></span><b>${fmtDur(r.sec)}</b>
        <span class="rec-t">${r.heard ? '«' + r.heard.slice(-70) + '»' : r.kind === 'round' ? 'Пишем кружочек. Улыбайтесь, вас снимают.' : 'Идёт запись. Говорите как есть — без прикрас.'}</span>
        <button class="send" title="Отправить" onClick=${() => stopRec(true)}><${Icon} n="send" /></button></div>`
      : botStart ? html`<button class="btn wide big" onClick=${() => post({ text: '/start' })}>ЗАПУСТИТЬ</button>`
      : html`<div class="c-row">
        ${!edit && html`<button class="ib" title="Прикрепить" onClick=${attach}><${Icon} n="paperclip" /></button>`}
        <textarea ref=${ta} rows="1" placeholder=${ph} value=${text} onInput=${onInput} onKeyDown=${onKey} onPaste=${onPaste} onBlur=${() => setTimeout(() => setSug(null), 150)} aria-label="Сообщение"></textarea>
        ${peer && peer.bot && (peer.cmds || []).length > 0 && !text && html`<button class="ib" title="Команды бота" onClick=${e => showMenu(e, [...peer.cmds.map(c => ({ label: '/' + c.c, hint: c.d, run: () => post({ text: '/' + c.c }) })), peer.app && '-', peer.app && { icon: 'app-window', label: 'Открыть приложение', run: () => openMiniApp(peer.id) }], { anchor: e.currentTarget, right: true })}><${Icon} n="square-slash" /></button>`}
        <button class=${cx('ib hide-s', fmt && 'act')} title="Форматирование" onClick=${() => setFmt(!fmt)}><${Icon} n="type" /></button>
        <button class=${cx('ib', pick && 'act')} title="Эмодзи, стикеры, GIF" onClick=${() => setPick(!pick)}><${Icon} n="smile" /></button>
        ${text.trim() || edit ? html`<button class="send" title=${edit ? 'Сохранить' : 'Отправить (правый клик — варианты)'} onClick=${() => send()} onContextMenu=${e => !edit && sendMenu(e)}><${Icon} n=${edit ? 'check' : 'send'} /></button>`
          : html`<button class="send ghost" title="Голосовое сообщение (правый клик — кружочек)" onClick=${() => startRec('voice')} onContextMenu=${e => { e.preventDefault(); startRec('round'); }}><${Icon} n="mic" /></button>`}
      </div>`}
    ${pick && html`<div class="picker-bg" onMouseDown=${() => setPick(false)}></div><div class="picker-pop"><${EmojiPicker} chat=${chat} onEmoji=${e => insert(e)} onSticker=${sticker} onGif=${g => { setPick(false); post({ type: 'gif', media: { url: g.url, w: g.w, h: g.h, mime: 'image/gif' } }); }} /></div>`}
  </div>`;
}
