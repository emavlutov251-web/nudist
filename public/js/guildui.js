// Серверы (как в Discord): создание, каталог, настройки, роли, каналы, события, участники.
import { html, useState, useEffect, useRef, S, bump, on, rpc, call, toast, Icon, Avatar, Badges, cx, showMenu, openModal, closeModal, Modal, fmtFull, fmtNum, userName, lastSeen, copyText, confirmDlg, promptDlg, Empty, Spinner, plural, Toggle, Tabs, uploadAvatar, upload, pickFile, kindIcon, debounce } from './lib.js';
import { openUser } from './store.js';
import { showProfile, JoinPreview, Invites, AuditLog } from './panels.js';

const can = (s, k) => !!(s && s.me && s.me.perms && (s.me.perms.admin || s.me.perms[k]));
const PERM_L = { admin: ['Администратор', 'Может всё. Вообще всё. Выдавайте с умом.'], channels: ['Управлять сервером', 'Каналы, категории, эмодзи, вебхуки, события'], roles: ['Управлять ролями', 'Создавать роли и выдавать их участникам'], kick: ['Выгонять и глушить', 'Кик, серверный мут, смена ников'], ban: ['Банить', 'Бан с очисткой сообщений'], msgs: ['Управлять сообщениями', 'Удалять чужое, закреплять, писать в объявления'], send: ['Писать сообщения', ''], mention: ['Упоминать @everyone и @here', ''], voice: ['Модерировать голос', 'Глушить, перемещать, выпускать на трибуну'], invite: ['Приглашать людей', ''], audit: ['Смотреть журнал аудита', ''] };
const KINDS = [['text', 'Текстовый', 'Обычный чат с тредами'], ['voice', 'Голосовой', 'Заходи и говори. Камера и демонстрация экрана'], ['forum', 'Форум', 'Посты с заголовками и обсуждениями'], ['announce', 'Объявления', 'Пишут модераторы, читают все'], ['rules', 'Правила', 'Скрижали сервера'], ['stage', 'Трибуна', 'Спикеры и слушатели с поднятой рукой']];

// ───── участники (кэш для цветов ников и правой панели)
const MEM = {};
export function loadMembers(sid, force) {
  const c = (MEM[sid] = MEM[sid] || { map: {}, list: [], at: 0 });
  if (c.loading || (!force && !c.stale && c.at)) return; c.loading = true;
  rpc('server.members', { id: sid }).then(r => { c.list = r.members; c.banned = r.banned; c.map = {}; for (const m of r.members) { c.map[m.user.id] = m; S.users[m.user.id] = { ...S.users[m.user.id], ...m.user }; } c.at = Date.now(); c.stale = false; bump(); }).catch(() => {}).finally(() => { c.loading = false; });
}
export function memberOf(sid, uid) {
  const c = MEM[sid]; if (!c || !c.at || c.stale) { setTimeout(() => loadMembers(sid), 0); if (!c || !c.at) return null; }
  const m = c.map[uid], s = S.servers[sid]; if (!m || !s) return null;
  const top = s.roles.find(r => r.id !== 'everyone' && m.roles.includes(r.id)), col = s.roles.find(r => r.color && m.roles.includes(r.id));
  return { nick: m.nick, roles: m.roles, color: col ? col.color : '', icon: top && top.icon, muted: m.muted, owner: m.owner };
}
const stale = sid => { if (MEM[sid]) MEM[sid].stale = true; };
on('server', d => stale(d.id)); on('server.count', d => stale(d.id)); on('server.channels', d => stale(d.server));

function memberMenu(e, s, m) {
  const u = m.user, me = u.id === S.me.id, roles = s.roles.filter(r => r.id !== 'everyone'), reload = () => loadMembers(s.id, true);
  showMenu(e, [
    { icon: 'user', label: 'Профиль', run: () => showProfile(u.id) }, !me && { icon: 'message-circle', label: 'Написать', run: () => openUser(u.id) },
    (me || can(s, 'kick')) && { icon: 'pencil', label: 'Ник на сервере', run: async () => { const v = await promptDlg({ title: 'Ник на сервере', label: 'Как называть ' + userName(u) + ' здесь?', value: m.nick || '', max: 40 }); if (v !== null) { await call('server.member', { server: s.id, user: u.id, nick: v }); reload(); } } },
    can(s, 'roles') && roles.length > 0 && { icon: 'shield', label: 'Роли', sub: roles.map(r => ({ emoji: r.icon || '●', label: r.name, on: m.roles.includes(r.id), run: async () => { await call('server.member', { server: s.id, user: u.id, roles: m.roles.includes(r.id) ? m.roles.filter(x => x !== r.id) : [...m.roles, r.id] }); reload(); } })) },
    !me && can(s, 'kick') && !m.owner && '-',
    !me && can(s, 'kick') && !m.owner && { icon: m.muted ? 'mic' : 'mic-off', label: m.muted ? 'Снять серверный мут' : 'Заглушить на сервере', run: async () => { await call('server.member', { server: s.id, user: u.id, muted: !m.muted }); reload(); } },
    !me && can(s, 'kick') && !m.owner && { icon: 'user-x', label: 'Выгнать', danger: true, run: async () => { if (await confirmDlg({ title: 'Выгнать ' + userName(u) + '?', text: 'Сможет вернуться по приглашению.', ok: 'Выгнать', danger: true })) { await call('server.kick', { server: s.id, user: u.id }); reload(); } } },
    !me && can(s, 'ban') && !m.owner && { icon: 'gavel', label: 'Забанить', danger: true, run: async () => { const r = await confirmDlg({ title: 'Забанить ' + userName(u) + '?', text: 'Без права на возвращение. Листок изымается.', ok: 'Забанить', danger: true, check: 'Удалить все сообщения' }); if (r) { await call('server.kick', { server: s.id, user: u.id, ban: true, purge: !!r.check }); reload(); } } },
    s.owner === S.me.id && !me && { icon: 'crown', label: 'Передать сервер', danger: true, run: async () => { if (await confirmDlg({ title: 'Передать владение сервером?', text: userName(u) + ' станет владельцем. Назад дороги нет.', ok: 'Передать', danger: true })) call('server.transfer', { id: s.id, user: u.id }); } },
  ]);
}
function MemberRow({ s, m }) {
  const u = S.users[m.user.id] || m.user, info = memberOf(s.id, u.id) || {};
  return html`<button class=${cx('ci', !u.online && 'off')} onClick=${e => memberMenu(e, s, m)} onContextMenu=${e => memberMenu(e, s, m)}><${Avatar} src=${u.avatar} name=${userName(u)} color=${u.color} s=${34} online=${u.online && !u.bot} /><span class="ci-m"><span class="ci-t"><b style=${info.color ? 'color:' + info.color : ''}>${info.icon ? info.icon + ' ' : ''}${m.nick || userName(u)}</b>${m.owner && html`<${Icon} n="crown" s=${13} cls="warn" />`}<${Badges} list=${u.badges} s=${13} />${m.muted && html`<${Icon} n="mic-off" s=${12} cls="dim" />`}</span><span class="ci-p"><span>${u.playing && u.online ? 'играет в ' + u.playing : u.status && u.status.t ? (u.status.e || '') + ' ' + u.status.t : lastSeen(u)}</span></span></span></button>`;
}
export function ServerPanel({ chat }) {
  const s = S.servers[chat.server], c = MEM[chat.server], [q, setQ] = useState('');
  useEffect(() => { loadMembers(chat.server, true); }, [chat.server]);
  if (!s) return null;
  const close = () => { S.ui.panel = false; bump(); }, f = q.trim().toLowerCase();
  let list = c ? c.list : []; if (chat.allow && chat.allow.length) list = list.filter(m => m.owner || m.roles.some(r => chat.allow.includes(r)) || m.roles.some(r => ((s.roles.find(x => x.id === r) || {}).perms || {}).admin));
  if (f) list = list.filter(m => (userName(m.user) + ' ' + (m.nick || '') + ' ' + (m.user.username || '')).toLowerCase().includes(f));
  const isOn = m => (S.users[m.user.id] || m.user).online, groups = [], used = new Set();
  for (const r of s.roles) if (r.hoist && r.id !== 'everyone') { const g = list.filter(m => !used.has(m.user.id) && isOn(m) && m.roles.includes(r.id)); if (g.length) { g.forEach(m => used.add(m.user.id)); groups.push([`${r.icon ? r.icon + ' ' : ''}${r.name}`, g, r.color]); } }
  const onl = list.filter(m => !used.has(m.user.id) && isOn(m)), off = list.filter(m => !isOn(m));
  if (onl.length) groups.push(['В сети', onl]); if (off.length) groups.push(['Не в сети', off]);
  return html`<aside class="panel"><header class="panel-h"><button class="ib" onClick=${close} aria-label="Закрыть панель"><${Icon} n="x" /></button><b>Участники · ${s.count}</b>${can(s, 'invite') && html`<button class="ib" title="Пригласить" onClick=${() => openModal(InviteModal, { server: s.id })}><${Icon} n="user-plus" /></button>`}</header>
    <div class="panel-b">${chat.topic && html`<div class="pf-row"><small><${Icon} n=${kindIcon(chat.kind)} s=${12} /> ${chat.title}</small><p>${chat.topic}</p></div>`}
      <div class="pk-search"><${Icon} n="search" s=${15} /><input placeholder="Поиск участников" value=${q} onInput=${e => setQ(e.target.value)} /></div>
      ${!c || !c.at ? html`<${Spinner} />` : groups.map(([name, g, col]) => html`<h5 style=${col ? 'color:' + col : ''}>${name} — ${g.length}</h5>${g.map(m => html`<${MemberRow} key=${m.user.id} s=${s} m=${m} />`)}`)}</div></aside>`;
}

// ───── создание и каталог
const TPL = [['basic', '🏝', 'С нуля', 'Один чат и один голосовой. Остальное нарастёт.'], ['gaming', '🎮', 'Игровой', 'Лобби, катки, поиск тимы и клипы'], ['study', '📚', 'Учебный', 'Деканат, домашка, форум вопросов и лекции'], ['memes', '🤡', 'Мемный', 'Болталка, мемы, кринж и срач по расписанию']];
export function CreateServer({ id }) {
  const [f, setF] = useState({ name: '', icon: '', tpl: 'memes' }), [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); const s = await call('server.create', { name: f.name.trim(), template: f.tpl, icon: f.icon || undefined }); setBusy(false); if (s) { S.servers[s.id] = s; S.ui.server = s.id; S.ui.chat = null; S.ui.list = true; closeModal(id); toast('Сервер создан. Вы тут главный — не зазнавайтесь.'); bump(); } };
  return html`<${Modal} id=${id} title="Создать сервер" icon="server" footer=${html`<button class="btn ghost" onClick=${async () => { const v = await promptDlg({ title: 'Войти по приглашению', label: 'Ссылка или код', placeholder: location.origin + '/#join=…' }); if (v) { closeModal(id); openModal(JoinPreview, { q: v.trim() }); } }}>У меня есть приглашение</button><span class="sp"></span><button class="btn" disabled=${!f.name.trim() || busy} onClick=${go}>Создать</button>`}>
    <div class="row top"><button class="ava-pick sq" onClick=${async () => { const u = await uploadAvatar(); if (u) setF({ ...f, icon: u }); }} title="Иконка сервера">${f.icon ? html`<img src=${f.icon} alt="" />` : html`<${Icon} n="camera" s=${24} />`}</button><div class="grow"><label class="fld"><span>Название сервера</span><input autofocus maxlength="60" value=${f.name} placeholder="Дикий пляж" onInput=${e => setF({ ...f, name: e.target.value })} /></label></div></div>
    <div class="fld"><span>Шаблон</span><div class="tpls">${TPL.map(([k, e, n, d]) => html`<button class=${cx(f.tpl === k && 'on')} onClick=${() => setF({ ...f, tpl: k })}><span>${e}</span><b>${n}</b><small>${d}</small></button>`)}</div></div><//>`;
}
export function Discover({ id }) {
  const [q, setQ] = useState(''), [d, setD] = useState(null);
  const load = useRef(debounce(s => rpc('server.discover', { q: s }).then(setD).catch(e => { toast(e.message, 'err'); setD([]); }), 250)).current;
  useEffect(() => { load(q.trim()); }, [q]);
  return html`<${Modal} id=${id} title="Каталог серверов" icon="compass" wide>
    <div class="pk-search big"><${Icon} n="search" s=${17} /><input autofocus placeholder="Найти сообщество: игры, учёба, мемы…" value=${q} onInput=${e => setQ(e.target.value)} /></div>
    ${!d ? html`<${Spinner} />` : !d.length ? html`<${Empty} icon="compass" title="Публичных серверов не нашлось" text="Создайте свой и откройте его в настройках сервера — он появится здесь." />` : html`<div class="cards">${d.map(s => html`<button class="card srv" onClick=${() => { if (s.member) { closeModal(id); S.ui.server = s.id; S.ui.chat = null; S.ui.list = true; bump(); } else openModal(JoinPreview, { server: s }); }}>
      <span class="card-b" style=${s.banner ? `background-image:url(${s.banner})` : ''}></span><${Avatar} src=${s.icon} name=${s.name} color=${2} s=${52} square />
      <b>${s.name} ${s.verified && html`<${Badges} list=${['verified']} s=${14} />`}</b><p>${s.about || 'Без описания. Заходите — узнаете.'}</p><small><i class="dot-on"></i> ${s.online} в сети · ${fmtNum(s.count)} ${plural(s.count, ['участник', 'участника', 'участников'])}${s.boosts ? ' · 🚀 ' + s.boosts : ''}${s.member ? ' · вы здесь' : ''}</small></button>`)}</div>`}<//>`;
}
export function InviteModal({ id, server }) { const s = S.servers[server]; return html`<${Modal} id=${id} title=${'Пригласить на «' + (s ? s.name : '') + '»'} icon="user-plus"><${Invites} target=${{ server }} /><//>`; }

// ───── каналы
export function ChannelDlg({ id, server, chat, cat }) {
  const s = S.servers[server], [f, setF] = useState({ kind: chat ? chat.kind : 'text', name: chat ? chat.title : '', topic: chat ? chat.topic || '' : '', cat: chat ? chat.cat || '' : cat || '', slow: chat ? chat.slow || 0 : 0, allow: chat ? chat.allow || [] : [] }), set = p => setF(x => ({ ...x, ...p }));
  if (!s) return null;
  const save = async () => { const r = chat ? await call('server.channel.update', { id: chat.id, name: f.name, topic: f.topic, cat: f.cat, slow: +f.slow, allow: f.allow }) : await call('server.channel.new', { server, kind: f.kind, name: f.name, topic: f.topic, cat: f.cat || undefined, allow: f.allow.length ? f.allow : undefined }); if (r !== undefined) closeModal(id); };
  const del = async () => { if (await confirmDlg({ title: 'Удалить канал?', text: `#${chat.title} и вся его история исчезнут навсегда.`, ok: 'Удалить', danger: true })) { await call('server.channel.del', { id: chat.id }); closeModal(id); } };
  return html`<${Modal} id=${id} title=${chat ? 'Настройки канала' : 'Новый канал'} icon="hash" cls="small" footer=${html`${chat && html`<button class="btn danger" onClick=${del}>Удалить</button>`}<span class="sp"></span><button class="btn" disabled=${!f.name.trim()} onClick=${save}>${chat ? 'Сохранить' : 'Создать'}</button>`}>
    ${!chat && html`<div class="kinds">${KINDS.map(([k, n, d]) => html`<button class=${cx(f.kind === k && 'on')} onClick=${() => set({ kind: k })}><${Icon} n=${kindIcon(k)} s=${20} /><span><b>${n}</b><small>${d}</small></span></button>`)}</div>`}
    <label class="fld"><span>Название</span><input autofocus maxlength="60" value=${f.name} placeholder=${f.kind === 'voice' ? 'Курилка' : 'флудилка'} onInput=${e => set({ name: e.target.value })} /></label>
    <label class="fld"><span>Тема канала</span><input maxlength="300" value=${f.topic} placeholder="О чём тут говорят" onInput=${e => set({ topic: e.target.value })} /></label>
    <label class="fld"><span>Категория</span><select value=${f.cat} onChange=${e => set({ cat: e.target.value })}><option value="">Без категории</option>${s.cats.map(c => html`<option value=${c.id}>${c.name}</option>`)}</select></label>
    ${chat && chat.kind !== 'voice' && chat.kind !== 'stage' && html`<label class="fld"><span>Медленный режим</span><select value=${f.slow} onChange=${e => set({ slow: e.target.value })}>${[[0, 'Выключен'], [5, '5 секунд'], [30, '30 секунд'], [120, '2 минуты'], [600, '10 минут']].map(([v, l]) => html`<option value=${v}>${l}</option>`)}</select></label>`}
    <div class="fld"><span>Приватный канал: виден только ролям</span><div class="chips">${s.roles.filter(r => r.id !== 'everyone').map(r => html`<button class=${cx('chip', f.allow.includes(r.id) && 'on')} onClick=${() => set({ allow: f.allow.includes(r.id) ? f.allow.filter(x => x !== r.id) : [...f.allow, r.id] })}>${r.icon || ''} ${r.name}</button>`)}${s.roles.length < 2 && html`<small class="dim">Сначала создайте роли в настройках сервера</small>`}</div><small class="dim">${f.allow.length ? 'Канал увидят только выбранные роли и администраторы.' : 'Ничего не выбрано — канал виден всем.'}</small></div><//>`;
}

// ───── события
const pad = n => String(n).padStart(2, '0'), toLocal = t => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export function EventsModal({ id, server }) {
  const s = S.servers[server], [f, setF] = useState(null);
  if (!s) return null;
  const ev = [...(s.events || [])].sort((a, b) => a.at - b.at), chans = Object.values(S.chats).filter(c => c.server === server);
  const create = async () => { const at = +new Date(f.at); if (!(at > Date.now())) return toast('Событие должно быть в будущем', 'err'); await call('server.event', { server, title: f.title, about: f.about, at, chat: f.chat || undefined }); setF(null); };
  return html`<${Modal} id=${id} title=${'События · ' + s.name} icon="calendar-days" footer=${can(s, 'channels') && !f && html`<button class="btn" onClick=${() => setF({ title: '', about: '', at: toLocal(Date.now() + 864e5), chat: '' })}><${Icon} n="plus" s=${16} /> Новое событие</button>`}>
    ${f && html`<div class="form boxed"><label class="fld"><span>Название</span><input autofocus maxlength="100" value=${f.title} placeholder="Ночь голых фактов" onInput=${e => setF({ ...f, title: e.target.value })} /></label><label class="fld"><span>Описание</span><textarea rows="2" maxlength="500" value=${f.about} onInput=${e => setF({ ...f, about: e.target.value })}></textarea></label>
      <div class="row wrap"><label class="fld grow"><span>Когда</span><input type="datetime-local" value=${f.at} onInput=${e => setF({ ...f, at: e.target.value })} /></label><label class="fld grow"><span>Где</span><select value=${f.chat} onChange=${e => setF({ ...f, chat: e.target.value })}><option value="">Не привязывать</option>${chans.map(c => html`<option value=${c.id}>${c.kind === 'voice' || c.kind === 'stage' ? '🔊' : '#'} ${c.title}</option>`)}</select></label></div>
      <div class="row"><button class="btn ghost" onClick=${() => setF(null)}>Отмена</button><button class="btn" disabled=${!f.title.trim()} onClick=${create}>Создать</button></div></div>`}
    ${!ev.length && !f ? html`<${Empty} icon="calendar-days" title="Событий нет" text="Запланируйте созвон, турнир или вечер мемов — участники получат напоминание." />` : ev.map(e => { const going = e.going.includes(S.me.id), d = new Date(e.at), c = S.chats[e.chat]; return html`<div class="event"><div class="ev-d"><b>${d.getDate()}</b><small>${d.toLocaleDateString('ru-RU', { month: 'short' })}</small></div><div class="ev-m"><b>${e.title}</b><small>${fmtFull(e.at)}${c ? ' · ' + (c.kind === 'voice' || c.kind === 'stage' ? '🔊 ' : '#') + c.title : ''} · идут: ${e.going.length}</small>${e.about && html`<p>${e.about}</p>`}</div>
      <button class=${cx('btn sm', going && 'ghost')} onClick=${() => call('server.event', { server, rsvp: e.id })}>${going ? '✓ Иду' : 'Пойду'}</button>${can(s, 'channels') && html`<button class="ib sm" title="Удалить" onClick=${() => call('server.event', { server, del: e.id })}><${Icon} n="trash-2" s=${16} /></button>`}</div>`; })}<//>`;
}
export function RoleMsgDlg({ id, server }) {
  const s = S.servers[server], chans = Object.values(S.chats).filter(c => c.server === server && (c.kind === 'text' || c.kind === 'rules' || c.kind === 'announce')), [f, setF] = useState({ chat: (chans[0] || {}).id, text: '', roles: [] });
  if (!s) return null; const roles = s.roles.filter(r => r.id !== 'everyone' && !r.perms.admin);
  return html`<${Modal} id=${id} title="Роли по кнопке" icon="mouse-pointer-click" cls="small" footer=${html`<button class="btn" disabled=${!f.roles.length || !f.chat} onClick=${async () => { const r = await call('server.rolemsg', f); if (r !== undefined) { closeModal(id); toast('Сообщение с кнопками отправлено'); } }}>Отправить в канал</button>`}>
    <p class="hint">Бот опубликует сообщение с кнопками: участник нажимает — получает роль, нажимает ещё раз — снимает.</p>
    <label class="fld"><span>Канал</span><select value=${f.chat} onChange=${e => setF({ ...f, chat: e.target.value })}>${chans.map(c => html`<option value=${c.id}># ${c.title}</option>`)}</select></label>
    <label class="fld"><span>Текст</span><textarea rows="2" maxlength="500" value=${f.text} placeholder="Выберите, кто вы на этом пляже" onInput=${e => setF({ ...f, text: e.target.value })}></textarea></label>
    <div class="fld"><span>Роли (до 10)</span>${roles.length ? html`<div class="chips">${roles.map(r => html`<button class=${cx('chip', f.roles.includes(r.id) && 'on')} onClick=${() => setF({ ...f, roles: f.roles.includes(r.id) ? f.roles.filter(x => x !== r.id) : [...f.roles, r.id] })}>${r.icon || ''} ${r.name}</button>`)}</div>` : html`<small class="dim">Нет подходящих ролей. Создайте их в настройках сервера.</small>`}</div><//>`;
}

// ───── настройки сервера
export function openServerSettings(server, tab) { openModal(ServerSettings, { server, tab }); }
function ServerSettings({ id, server, tab: t0 }) {
  const s = S.servers[server], [tab, setTab] = useState(t0 || 'main');
  if (!s) { setTimeout(() => closeModal(id)); return null; }
  const tabs = [['main', 'Обзор'], can(s, 'roles') && ['roles', 'Роли'], ['members', 'Участники'], can(s, 'channels') && ['emoji', 'Эмодзи'], can(s, 'invite') && ['inv', 'Приглашения'], can(s, 'channels') && ['hooks', 'Вебхуки'], can(s, 'channels') && ['mod', 'Автомодерация'], can(s, 'audit') && ['audit', 'Журнал'], ['boost', 'Бусты']].filter(Boolean);
  return html`<${Modal} id=${id} title=${'Сервер «' + s.name + '»'} icon="settings" wide><${Tabs} tabs=${tabs} value=${tab} onChange=${setTab} />
    ${tab === 'main' && html`<${SsMain} s=${s} onClose=${() => closeModal(id)} />`}${tab === 'roles' && html`<${SsRoles} s=${s} />`}${tab === 'members' && html`<${SsMembers} s=${s} />`}${tab === 'emoji' && html`<${SsEmoji} s=${s} />`}${tab === 'inv' && html`<${Invites} target=${{ server }} />`}${tab === 'hooks' && html`<${SsHooks} s=${s} />`}${tab === 'mod' && html`<${SsMod} s=${s} />`}${tab === 'audit' && html`<${AuditLog} load=${() => rpc('server.audit', { id: server })} />`}${tab === 'boost' && html`<${SsBoost} s=${s} />`}<//>`;
}
function SsMain({ s, onClose }) {
  const edit = can(s, 'channels'), [f, setF] = useState({ name: s.name, about: s.about || '', pub: !!s.pub, afk: s.afk || '' }), voice = Object.values(S.chats).filter(c => c.server === s.id && c.kind === 'voice');
  const img = async k => { const f2 = await pickFile('image/*'); if (!f2) return; try { const up = await upload(f2); await call('server.update', { id: s.id, [k]: up.url }); } catch (e) { toast(e.message, 'err'); } };
  return html`<div class="form">
    <div class="srv-banner" style=${s.banner ? `background-image:url(${s.banner})` : ''}>${edit && html`<button class="btn sm ghost" onClick=${() => img('banner')}><${Icon} n="image" s=${15} /> Баннер</button>`}<span class=${cx('ava-pick sq', !edit && 'ro')} onClick=${async () => { if (!edit) return; const u = await uploadAvatar(); if (u) call('server.update', { id: s.id, icon: u }); }}>${s.icon ? html`<img src=${s.icon} alt="" />` : html`<${Icon} n="camera" s=${24} />`}</span></div>
    <label class="fld"><span>Название</span><input disabled=${!edit} maxlength="60" value=${f.name} onInput=${e => setF({ ...f, name: e.target.value })} /></label>
    <label class="fld"><span>Описание</span><textarea disabled=${!edit} rows="2" maxlength="500" value=${f.about} onInput=${e => setF({ ...f, about: e.target.value })}></textarea></label>
    ${edit && html`<${Toggle} label="Показывать в каталоге серверов" hint="Любой сможет найти и зайти без приглашения" on=${f.pub} onChange=${v => setF({ ...f, pub: v })} />
      <label class="fld"><span>AFK-канал: туда уносит молчунов через 5 минут тишины</span><select value=${f.afk} onChange=${e => setF({ ...f, afk: e.target.value })}><option value="">Не использовать</option>${voice.map(c => html`<option value=${c.id}>🔊 ${c.title}</option>`)}</select></label>
      <button class="btn" onClick=${async () => { const r = await call('server.update', { id: s.id, name: f.name, about: f.about, pub: f.pub, afk: f.afk || null }); if (r !== undefined) toast('Сохранено'); }}>Сохранить</button>`}
    <h5>Опасная зона</h5><div class="row wrap">${s.owner !== S.me.id && html`<button class="btn danger" onClick=${async () => { if (await confirmDlg({ title: 'Покинуть сервер?', text: 'Вернуться можно по приглашению.', ok: 'Покинуть', danger: true })) { await call('server.leave', { id: s.id }); onClose(); } }}>Покинуть сервер</button>`}
      ${s.owner === S.me.id && html`<button class="btn danger" onClick=${async () => { const v = await promptDlg({ title: 'Удалить сервер?', label: `Введите «${s.name}», чтобы снести всё`, ok: 'Удалить' }); if (v === s.name) { await call('server.delete', { id: s.id }); onClose(); } else if (v !== null) toast('Название не совпало. Сервер выдохнул.'); }}>Удалить сервер</button>`}</div></div>`;
}
function SsRoles({ s }) {
  const [sel, setSel] = useState(s.roles[0].id), r = s.roles.find(x => x.id === sel) || s.roles[0], owner = s.owner === S.me.id;
  const upd = p => call('server.role', { server: s.id, id: r.id, ...p }), idx = s.roles.indexOf(r);
  return html`<div class="roles"><div class="roles-l">${s.roles.map(x => html`<button class=${cx(x.id === r.id && 'on')} onClick=${() => setSel(x.id)}><i style=${'background:' + (x.color || 'var(--ink3)')}></i>${x.icon || ''} ${x.name}</button>`)}<button class="add" onClick=${async () => { await call('server.role', { server: s.id, name: 'новая роль' }); }}><${Icon} n="plus" s=${15} /> Создать роль</button><p class="hint">Чем выше роль, тем она главнее. Цвет ника берётся у самой верхней цветной.</p></div>
    <div class="roles-e" key=${r.id}>${r.id !== 'everyone' ? html`<div class="row wrap"><label class="fld grow"><span>Название</span><input maxlength="40" defaultValue=${r.name} onChange=${e => upd({ name: e.target.value })} /></label><label class="fld"><span>Значок</span><input class="emoji-in" maxlength="4" defaultValue=${r.icon || ''} placeholder="🛟" onChange=${e => upd({ icon: e.target.value })} /></label><label class="fld"><span>Цвет</span><input type="color" value=${r.color || '#1f9d57'} onChange=${e => upd({ color: e.target.value })} /></label></div>
        <div class="row wrap"><button class="btn sm ghost" disabled=${idx <= 0} onClick=${() => upd({ pos: idx - 1 })}><${Icon} n="arrow-up" s=${14} /> Выше</button><button class="btn sm ghost" disabled=${idx >= s.roles.length - 2} onClick=${() => upd({ pos: idx + 1 })}><${Icon} n="arrow-down" s=${14} /> Ниже</button>${r.color && html`<button class="btn sm ghost" onClick=${() => upd({ color: '' })}>Без цвета</button>`}<span class="sp"></span><button class="btn sm danger" onClick=${async () => { if (await confirmDlg({ title: 'Удалить роль «' + r.name + '»?', text: 'У всех участников она пропадёт.', ok: 'Удалить', danger: true })) { await call('server.role', { server: s.id, del: r.id }); setSel('everyone'); } }}>Удалить роль</button></div>
        <${Toggle} label="Показывать отдельной группой в списке участников" on=${!!r.hoist} onChange=${v => upd({ hoist: v })} />` : html`<p class="hint">@everyone — права по умолчанию для каждого участника сервера.</p>`}
      <h5>Права</h5>${Object.entries(PERM_L).map(([k, [l, h]]) => html`<${Toggle} label=${l} hint=${h} on=${!!r.perms[k]} disabled=${k === 'admin' && (!owner || r.id === 'everyone')} onChange=${v => upd({ perms: { [k]: v } })} />`)}</div></div>`;
}
function SsMembers({ s }) {
  const c = MEM[s.id], [q, setQ] = useState(''); useEffect(() => { loadMembers(s.id, true); }, []);
  const f = q.trim().toLowerCase(), list = (c ? c.list : []).filter(m => !f || (userName(m.user) + ' ' + (m.nick || '') + ' ' + (m.user.username || '')).toLowerCase().includes(f));
  return html`<div class="form"><div class="pk-search"><${Icon} n="search" s=${15} /><input placeholder="Поиск по участникам" value=${q} onInput=${e => setQ(e.target.value)} /></div>
    ${!c || !c.at ? html`<${Spinner} />` : list.map(m => html`<div class="row-item"><${Avatar} src=${m.user.avatar} name=${userName(m.user)} color=${m.user.color} s=${34} /><div class="ri-m"><b>${m.nick || userName(m.user)} ${m.owner ? '👑' : ''}</b><span>${m.roles.map(r => (s.roles.find(x => x.id === r) || {}).name).filter(Boolean).join(', ') || 'без ролей'} · с ${new Date(m.at).toLocaleDateString('ru-RU')}</span></div><button class="ib sm" title="Действия" onClick=${e => memberMenu(e, s, m)}><${Icon} n="ellipsis" s=${17} /></button></div>`)}
    ${c && c.banned && c.banned.length > 0 && html`<h5>Забанены · ${c.banned.length}</h5>${c.banned.map(u => html`<div class="row-item"><${Avatar} src=${u.avatar} name=${userName(u)} color=${u.color} s=${30} /><div class="ri-m"><b>${userName(u)}</b></div><button class="btn sm ghost" onClick=${async () => { await call('server.unban', { server: s.id, user: u.id }); loadMembers(s.id, true); }}>Разбанить</button></div>`)}`}</div>`;
}
function SsEmoji({ s }) {
  const add = async () => { const f = await pickFile('image/*'); if (!f) return; if (f.size > 512e3) return toast('Эмодзи до 512 КБ. Это же эмодзи, а не постер.', 'err'); const name = await promptDlg({ title: 'Имя эмодзи', label: 'Латиница, цифры и _', value: f.name.replace(/\.\w+$/, '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24) || 'emoji', hint: 'В сообщениях пишется как :имя:' }); if (!name) return; try { const up = await upload(f); await call('server.emoji', { server: s.id, name, url: up.url }); } catch (e) { toast(e.message, 'err'); } };
  return html`<div class="form"><p class="hint">Свои эмодзи сервера: ${s.emojis.length} из ${50 + (s.boosts || 0) * 10}. Каждый буст добавляет 10 слотов.</p><div class="emoji-list">${s.emojis.map(e => html`<div><img src=${e.url} alt=${e.name} /><code class="mono">:${e.name}:</code><button class="ib sm" title="Удалить" onClick=${() => call('server.emoji', { server: s.id, del: e.name })}><${Icon} n="x" s=${15} /></button></div>`)}<button class="st-add" onClick=${add}><${Icon} n="plus" s=${22} /><span>Загрузить</span></button></div></div>`;
}
function SsHooks({ s }) {
  const [d, setD] = useState(null), chans = Object.values(S.chats).filter(c => c.server === s.id && c.kind !== 'voice' && c.kind !== 'stage' && c.kind !== 'forum'), [ch, setCh] = useState((chans[0] || {}).id);
  const load = () => rpc('hook.list', { server: s.id }).then(setD).catch(() => setD([])); useEffect(() => { load(); }, []);
  const url = h => `${location.origin}/hook/${h.id}/${h.token}`;
  return html`<div class="form"><p class="hint">Входящие вебхуки принимают JSON в формате Discord и Slack: <code class="mono">{"content":"текст"}</code> или <code class="mono">{"text":"текст","username":"CI"}</code>. Годятся для GitHub Actions, мониторинга и напоминалок.</p>
    <div class="row wrap"><select value=${ch} onChange=${e => setCh(e.target.value)}>${chans.map(c => html`<option value=${c.id}># ${c.title}</option>`)}</select><button class="btn" onClick=${async () => { const name = await promptDlg({ title: 'Новый вебхук', label: 'Имя отправителя', value: 'Вебхук', max: 40 }); if (name === null) return; await call('hook.new', { chat: ch, name }); load(); }}><${Icon} n="webhook" s=${16} /> Создать вебхук</button></div>
    ${!d ? html`<${Spinner} />` : d.map(h => html`<div class="row-item"><div class="ri-m"><b>${h.name} → #${(S.chats[h.chat] || {}).title || '?'}</b><span class="mono">${url(h)}</span></div><button class="ib sm" title="Копировать URL" onClick=${() => { copyText(url(h)); toast('URL скопирован'); }}><${Icon} n="copy" s=${17} /></button><button class="ib sm" title="Копировать пример curl" onClick=${() => { copyText(`curl -X POST -H 'Content-Type: application/json' -d '{"content":"Привет из вебхука!"}' ${url(h)}`); toast('Команда curl скопирована'); }}><${Icon} n="terminal" s=${17} /></button><button class="ib sm" title="Удалить" onClick=${async () => { await call('hook.del', { id: h.id }); load(); }}><${Icon} n="trash-2" s=${17} /></button></div>`)}</div>`;
}
function SsMod({ s }) {
  const a = s.automod || {}, [words, setWords] = useState((a.words || []).join(', ')), [flood, setFlood] = useState(!!a.flood), [links, setLinks] = useState(!!a.links);
  return html`<div class="form"><label class="fld"><span>Стоп-слова через запятую</span><textarea rows="3" value=${words} onInput=${e => setWords(e.target.value)}></textarea></label><${Toggle} label="Антифлуд" hint="Не больше 5 сообщений за 5 секунд" on=${flood} onChange=${setFlood} /><${Toggle} label="Запретить ссылки" on=${links} onChange=${setLinks} />
    <button class="btn" onClick=${async () => { const r = await call('server.update', { id: s.id, automod: { words: words.split(/[,\n]/).map(x => x.trim()).filter(Boolean), flood, links } }); if (r !== undefined) toast('Автомодерация обновлена'); }}>Сохранить</button></div>`;
}
function SsBoost({ s }) {
  const price = (S.prices || {}).boost || 200, lvl = s.boosts >= 14 ? 3 : s.boosts >= 7 ? 2 : s.boosts >= 2 ? 1 : 0, next = [2, 7, 14][lvl];
  return html`<div class="form boost"><div class="boost-h"><span>🚀</span><div><h3>Уровень ${lvl}</h3><p>Бустов: ${s.boosts || 0}${next ? ` · до следующего уровня: ${next - (s.boosts || 0)}` : ' · максимум, дальше только космос'}</p></div></div><div class="boost-bar"><i style=${`width:${Math.min(100, (s.boosts || 0) / 14 * 100)}%`}></i></div>
    <ul><li>+10 слотов своих эмодзи за каждый буст</li><li>Строчка «🚀» в каталоге серверов</li><li>Торжественное сообщение в общий чат. Все узнают, кто тут меценат.</li></ul>
    <button class="btn warn" onClick=${async () => { if (!(await confirmDlg({ title: 'Бустануть сервер?', text: `Спишется ${price} 🍃. У вас ${S.me.stars || 0}.`, ok: 'Бустануть' }))) return; const r = await call('server.boost', { id: s.id }); if (r !== undefined) toast('Сервер бустанут! 🚀'); }}>Бустануть за ${price} 🍃</button></div>`;
}
