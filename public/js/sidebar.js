// Левая часть: рейка групп, список чатов с папками и историями, каналы группы, поиск.
import { html, useState, useEffect, useRef, useMemo, S, bump, rpc, call, toast, Icon, Logo, Avatar, ChatAvatar, Badges, cx, showMenu, openModal, chatInfo, msgPreview, fmtShort, isMuted, userName, lastSeen, kindIcon, setSetting, debounce, addUsers, Empty, Spinner, local, plural, fmtNum, md, confirmDlg, promptDlg, fmtFull, openAdmin, Modal, closeModal } from './lib.js';
import { openChat, openUser, logout, accounts, switchAccount, addAccount, totalUnread, myChannels, showChannel, channelUnread } from './store.js';
import { CreateChat, ContactsModal, showProfile, StatusDlg, BotsCatalog, StarsModal, chatActions, JoinPreview, CallsModal, FolderEditor } from './panels.js';
import { CreateServer, Discover, openServerSettings, ChannelDlg, EventsModal, InviteModal, RoleMsgDlg } from './guildui.js';
import { RTC, joinVoice, leaveVoice, toggleMute, toggleDeaf } from './rtc.js';
import { StoryEditor, AudioBar } from './media.js';
import { openSettings, PassStrip } from './settings.js';
import { openHub, openApps, openSupport } from './hub.js';
import { Streak, openInvite, openAsk, openPush, installApp, isStandalone, StartCards, PushStrip } from './growth.js';
import { Nm } from './lib.js';
import { openShop } from './shop.js';
import { EventStrip } from './events.js';
import { MoodAsk, openCalm, NearStrip } from './calm.js';
import { NearbyModal } from './nearby.js';
import { DatingModal, datingTip, datingTipDone } from './dating.js';
import { LobbyStrip } from './lobby.js';

// ═════ Рейка ═════
// Нижние вкладки вместо боковой панели серверов: чаты, лента, хаб, магазин, профиль. Группы (бывшие серверы) живут в списке чатов.
const goChats = () => { S.ui.server = null; S.ui.list = true; S.ui.hub = null; bump(); };
function accMenu(e) {
  const me = S.me, dark = document.documentElement.dataset.theme === 'dark';
  showMenu(e, [
    { icon: 'user', label: 'Мой профиль', run: () => showProfile(me.id) },
    { icon: 'smile', label: me.status ? 'Изменить статус' : 'Задать статус', run: () => openModal(StatusDlg) },
    { icon: 'leaf', label: 'Листики', hint: fmtNum(me.stars || 0) + ' 🍃', run: () => openModal(StarsModal) },
    { icon: 'user-plus', label: 'Позвать друзей', hint: '+100 🍃', run: openInvite },
    { icon: 'heart', label: 'Выдохнуть', hint: 'дыхание, настроение', run: openCalm },
    '-',
    { icon: dark ? 'sun' : 'moon', label: dark ? 'Дневной режим' : 'Ночное купание', run: () => setSetting({ theme: dark ? 'light' : 'dark' }) },
    { icon: 'settings', label: 'Настройки', run: () => openSettings() },
    { icon: 'table', label: 'Прикрыться', hint: 'Esc Esc', run: () => { S.ui.boss = true; bump(); } },
    { icon: 'life-buoy', label: 'Помощь и поддержка', run: () => openHub('help') },
    '-',
    ...accounts().filter(a => a.token !== S.token && a.name).map(a => ({ icon: 'circle-user', label: a.name, hint: a.username ? '@' + a.username : '', run: () => switchAccount(a.token) })),
    { icon: 'plus', label: 'Добавить аккаунт', run: addAccount },
    me.admin && { icon: 'shield', label: 'Админ-панель', run: openAdmin },
    '-',
    { icon: 'log-out', label: 'Выйти', danger: true, run: async () => { if (await confirmDlg({ title: 'Выйти из аккаунта?', text: 'Секретные чаты этого устройства после выхода прочитать не получится.', ok: 'Выйти', danger: true })) logout(); } },
  ], { head: html`<div class="menu-head"><${Avatar} u=${me} src=${me.avatar} name=${userName(me)} color=${me.color} s=${40} /><div><b>${userName(me)}</b><small>${me.username ? '@' + me.username : me.phone}</small></div></div>` });
}
export function NavBar() {
  // В приложении для Android такую же панель рисует сама оболочка (js/appnative.js):
  // веб-копию не показываем, иначе их будет две.
  if (window.NudistApp && window.NudistApp.nav) return null;
  const me = S.me, tab = S.ui.hub === 'feed' ? 'feed' : S.ui.hub ? 'hub' : 'chats';
  let n = totalUnread(); for (const c of Object.values(S.chats)) if (c.server && !isMuted(c)) n += c.unread || 0;
  const due = !!(S.flags || {}).stars && me.lastDaily !== new Date().toISOString().slice(0, 10);      // сегодняшний бонус ещё не собран
  const chN = channelUnread();      // непрочитанные каналы — точка на «Ленте»: каналы теперь живут там
  return html`<nav class="nav" aria-label="Разделы">
    <button class=${cx(tab === 'chats' && 'on')} onClick=${goChats} aria-label="Чаты"><span class="nav-i"><${Icon} n="message-circle" s=${22} />${n > 0 && html`<b class="rb">${n > 99 ? '99+' : n}</b>`}</span><small>Чаты</small></button>
    <button class=${cx(tab === 'feed' && 'on')} onClick=${() => openHub('feed')} aria-label=${'Лента: записи, каналы и видео' + (chN ? '. Новое в каналах: ' + chN : '')}><span class="nav-i"><${Icon} n="list" s=${22} />${chN > 0 && html`<b class="rb dot"></b>`}</span><small>Лента</small></button>
    <button class=${cx('nv-x', tab === 'hub' && 'on')} onClick=${() => openHub()} aria-label="Хаб: события, музыка, игры, поддержка"><span class="nav-i"><${Icon} n="layout-grid" s=${22} /></span><small>Хаб</small></button>
    <button class="nv-x" onClick=${() => openShop()} aria-label="Магазин"><span class="nav-i"><${Icon} n="store" s=${22} />${due && html`<b class="rb dot"></b>`}</span><small>Магазин</small></button>
    <button onClick=${accMenu} aria-label="Профиль и настройки"><span class="nav-i"><${Avatar} u=${me} src=${me.avatar} name=${userName(me)} color=${me.color} s=${24} /></span><small>Профиль</small></button>
  </nav>`;
}
// Строка группы в общем списке чатов
function ClubItem({ s, st }) {
  const open = () => { S.ui.server = s.id; S.ui.list = true; const last = local.get('srv.' + s.id); const c = S.chats[last] || Object.values(S.chats).filter(x => x.server === s.id && x.kind === 'text').sort((a, b) => a.pos - b.pos)[0]; if (c && innerWidth > 800) openChat(c.id); bump(); };
  return html`<button class="ci club" onClick=${open} onContextMenu=${e => showMenu(e, serverMenu(s))}>
    <${Avatar} src=${s.icon} name=${s.name} color=${s.color} s=${48} />
    <span class="ci-m"><span class="ci-t"><b>${s.name}</b>${s.verified && html`<${Badges} list=${['verified']} s=${14} />`}<time>${st.ts ? fmtShort(st.ts) : ''}</time></span>
      <span class="ci-p"><span><i class="who">Группа</i> · комнат: ${st.rooms}${s.boosts > 0 ? ` · 🚀 ${s.boosts}` : ''}</span>${st.m > 0 && html`<b class="cnt at">@</b>`}${st.n > 0 && html`<b class="cnt">${fmtNum(st.n)}</b>`}</span></span></button>`;
}
function serverMenu(s) {
  const p = s.me.perms || {}, adm = p.admin;
  return [
    (adm || p.invite) && { icon: 'user-plus', label: 'Пригласить людей', run: () => openModal(InviteModal, { server: s.id }) },
    (adm || p.channels) && { icon: 'settings', label: 'Настройки группы', run: () => openServerSettings(s.id) },
    (adm || p.channels) && { icon: 'plus', label: 'Создать канал', run: () => openModal(ChannelDlg, { server: s.id }) },
    (adm || p.channels) && { icon: 'folder', label: 'Создать категорию', run: async () => { const n = await promptDlg({ title: 'Новая категория', label: 'Название', max: 60 }); if (n) call('server.cat', { server: s.id, name: n }); } },
    { icon: 'calendar', label: 'События', hint: (s.events || []).length || '', run: () => openModal(EventsModal, { server: s.id }) },
    (adm || p.roles) && { icon: 'mouse-pointer-click', label: 'Роли по кнопке', run: () => openModal(RoleMsgDlg, { server: s.id }) },
    { icon: 'rocket', label: 'Бустануть группу', hint: (S.prices.boost || 200) + ' 🍃', run: async () => { if (await confirmDlg({ title: 'Буст группы', text: `Потратить ${S.prices.boost} листиков, чтобы у «${s.name}» стало больше слотов эмодзи и повод для гордости?`, ok: 'Бустануть' })) call('server.boost', { id: s.id }); } },
    (adm || p.audit) && { icon: 'history', label: 'Журнал аудита', run: () => openServerSettings(s.id, 'audit') },
    '-',
    { icon: 'flag', label: 'Пожаловаться', run: async () => { const t = await promptDlg({ title: 'Жалоба в группе', label: 'Что не так?', area: true, max: 500 }); if (t != null) { await call('report', { type: 'server', target: s.id, reason: 'other', text: t }); toast('Жалоба отправлена модераторам'); } } },
    s.owner !== S.me.id && { icon: 'log-out', label: 'Покинуть группу', danger: true, run: async () => { if (await confirmDlg({ title: 'Покинуть группу?', text: `Вы уйдёте из группы «${s.name}». Вернуться можно будет по приглашению.`, ok: 'Уйти', danger: true })) call('server.leave', { id: s.id }); } },
  ];
}

// ═════ Список чатов ═════
const BUILTIN = [['all', 'Все'], ['dm', 'Личные'], ['groups', 'Группы'], ['bots', 'Боты'], ['unread', 'Непрочитанные']];      // каналов здесь нет: они в ленте, историях и видео
function inFolder(c, f) {
  const bot = c.type === 'dm' && (S.users[c.peer] || {}).bot;
  switch (f) { case 'all': return true; case 'dm': return (c.type === 'dm' && !bot) || c.type === 'secret' || c.type === 'saved'; case 'groups': return c.type === 'group'; case 'channels': return c.type === 'channel'; case 'bots': return !!bot; case 'unread': return c.unread > 0 || c.mentions > 0; }
  const cf = (S.settings.folders || []).find(x => x.id === f); if (!cf) return true;
  if ((cf.exclude || []).includes(c.id)) return false;
  const ok = (cf.types || []).some(t => inFolder(c, t)) || (cf.chats || []).includes(c.id);
  return ok && (!cf.unread || c.unread > 0) && (!cf.noMuted || !isMuted(c));
}
function typingText(chat) {
  const t = S.typing[chat.id]; if (!t) return null; const ids = Object.keys(t); if (!ids.length) return null;
  const kinds = { text: 'печатает', voice: 'записывает голосовое', round: 'записывает кружочек', photo: 'отправляет фото', file: 'отправляет файл', video: 'отправляет видео', sticker: 'выбирает стикер' };
  const first = t[ids[0]]; const who = chat.type === 'dm' || chat.type === 'secret' ? '' : userName(S.users[ids[0]]).split(' ')[0] + ' ';
  if (ids.length > 1) return `${ids.length} ${plural(ids.length, ['человек', 'человека', 'человек'])} печатают`;
  return who + (kinds[first.kind] || 'печатает') + (first.text ? ': ' + first.text : '');
}
export { typingText };
function Ticks({ chat, m }) {
  if (!m || m.from !== S.me.id || chat.type === 'channel' || chat.type === 'saved' || m.type === 'service' || m.type === 'call') return null;
  const read = m.seq <= (chat.peerRead || 0), deliv = m.seq <= (chat.peerDeliv || 0);
  return html`<span class=${cx('ticks', read && 'read')} title=${read ? 'Прочитано' : deliv ? 'Доставлено' : 'Отправлено'}><${Icon} n=${read || deliv ? 'check-check' : 'check'} s=${15} /></span>`;
}
export { Ticks };
function ChatItem({ chat }) {
  const i = chatInfo(chat), m = chat.last, typing = typingText(chat), on = S.ui.chat === chat.id;
  const who = m && m.type !== 'service' && (chat.type === 'group') ? (m.from === S.me.id ? 'Вы' : userName(S.users[m.from]).split(' ')[0]) + ': ' : (m && m.from === S.me.id && chat.type === 'dm' && m.type !== 'service' ? '' : '');
  return html`<button class=${cx('ci', on && 'on', chat.pin && 'pinned')} data-chat=${chat.id} onClick=${() => openChat(chat.id)} onContextMenu=${e => showMenu(e, chatActions(chat, true))}>
    <${ChatAvatar} chat=${chat} s=${48} />
    <span class="ci-m">
      <span class="ci-t">${i.secret && html`<${Icon} n="lock" s=${13} cls="lock" />`}<b>${i.user ? html`<${Nm} u=${i.user} name=${i.title} />` : i.title}</b>${i.verified && html`<${Badges} list=${['verified']} s=${14} />`}${i.user && html`<${Badges} list=${(i.user.badges || []).filter(b => b !== 'verified')} s=${13} />`}${isMuted(chat) && html`<${Icon} n="bell-off" s=${13} cls="muted-i" />`}<${Streak} chat=${chat} />
        <time>${m ? fmtShort(m.ts) : ''}</time></span>
      <span class="ci-p">${typing ? html`<em class="typing">${typing}…</em>` : chat.draft && !on ? html`<span><i class="draft">Черновик:</i> ${chat.draft.slice(0, 80)}</span>` : html`<span>${m ? html`<${Ticks} chat=${chat} m=${m} />` : ''}${who && html`<i class="who">${who}</i>`}${m ? msgPreview(m, chat) : i.sub || (chat.type === 'secret' ? 'секретный чат' : 'Пока пусто')}</span>`}
        ${chat.mentions > 0 && html`<b class="cnt at">@</b>`}${chat.unread > 0 ? html`<b class=${cx('cnt', isMuted(chat) && 'mute')}>${fmtNum(chat.unread)}</b>` : chat.pin ? html`<${Icon} n="pin" s=${14} cls="pin-i" />` : ''}</span>
    </span></button>`;
}
function StoriesRow() {
  if (S.flags.stories === false) return null;
  const by = {}; for (const s of S.stories) (by[s.user] = by[s.user] || []).push(s);
  const mine = by[S.me.id] || [], others = Object.keys(by).filter(u => u !== S.me.id).sort((a, b) => (by[a].every(s => s.seen) - by[b].every(s => s.seen)) || by[b].at(-1).ts - by[a].at(-1).ts);
  const order = [...(mine.length ? [S.me.id] : []), ...others];
  const open = u => { S.storyView = { users: order, u, i: Math.max(0, by[u].findIndex(s => !s.seen)) }; bump(); };
  return html`<div class="stories" aria-label="Истории">
    <button class="story" onClick=${() => mine.length ? open(S.me.id) : openModal(StoryEditor)}><span class=${cx('ring', mine.length ? 'seen' : 'none')}><${Avatar} u=${S.me} src=${S.me.avatar} name=${userName(S.me)} color=${S.me.color} s=${46} /><i class="plus" onClick=${e => { e.stopPropagation(); openModal(StoryEditor); }}><${Icon} n="plus" s=${13} /></i></span><small>${mine.length ? 'Моя история' : 'Добавить'}</small></button>
    ${others.map(u => html`<button class="story" onClick=${() => open(u)}><span class=${cx('ring', by[u].every(s => s.seen) && 'seen')}><${Avatar} u=${S.users[u]} src=${(S.users[u] || {}).avatar} name=${userName(S.users[u])} color=${(S.users[u] || {}).color} s=${46} /></span><small>${userName(S.users[u]).split(' ')[0]}</small></button>`)}
    ${myChannels().slice(0, 20).map(c => html`<button class="story chan" key=${c.id} onClick=${() => showChannel(c.id)} title=${'Канал «' + c.title + '»'}><span class=${cx('ring sq', !(c.unread > 0) && 'seen')}><${Avatar} src=${c.avatar} name=${c.title} color=${c.color} s=${46} />${c.unread > 0 && html`<b class="chrow-n">${c.unread > 99 ? '99+' : c.unread}</b>`}</span><small>${c.title}</small></button>`)}
  </div>`;
}
function SearchView({ q }) {
  const [res, setRes] = useState(null); const [type, setType] = useState('all'); const [busy, setBusy] = useState(false);
  const run = useMemo(() => debounce(async (query, t) => {
    setBusy(true);
    try {
      const tag = query.startsWith('#'), mq = { q: query, type: t === 'all' || t === 'chats' ? undefined : t };
      const [g, m] = await Promise.all([tag || (t !== 'all' && t !== 'chats') ? null : rpc('search', { q: query }).catch(() => null), t === 'chats' ? null : rpc('msg.search', mq).catch(() => null)]);
      if (m) addUsers(m.users);
      setRes({ g, m });
    } finally { setBusy(false); }
  }, 250), []);
  useEffect(() => { run(q, type); }, [q, type]);
  const lq = q.toLowerCase().replace(/^@/, '');
  const localChats = type === 'all' || type === 'chats' ? Object.values(S.chats).filter(c => { const i = chatInfo(c); return i.title.toLowerCase().includes(lq) || (c.username || '').toLowerCase().startsWith(lq) || (i.user && (i.user.username || '').toLowerCase().startsWith(lq)); }).slice(0, 12) : [];
  const remember = () => { const h = [q, ...(S.settings.searchHistory || []).filter(x => x !== q)].slice(0, 10); setSetting({ searchHistory: h }); };
  const g = res && res.g, m = res && res.m;
  const localUserIds = new Set(localChats.map(c => c.peer));
  return html`<div class="search-res">
    <div class="chips pad">${[['all', 'Всё'], ['chats', 'Чаты'], ['media', 'Медиа'], ['link', 'Ссылки'], ['file', 'Файлы'], ['voice', 'Голосовые'], ['audio', 'Музыка']].map(([v, l]) => html`<button class=${cx('chip', type === v && 'on')} onClick=${() => setType(v)}>${l}</button>`)}</div>
    ${localChats.length > 0 && html`<h4>Ваши чаты</h4>${localChats.map(c => html`<${ChatItem} chat=${c} />`)}`}
    ${g && g.users.filter(u => !localUserIds.has(u.id)).length > 0 && html`<h4>Люди и боты</h4>${g.users.filter(u => !localUserIds.has(u.id)).map(u => html`<button class="ci" onClick=${() => { remember(); S.users[u.id] = u; openUser(u.id); }}><${Avatar} u=${u} src=${u.avatar} name=${userName(u)} color=${u.color} s=${44} online=${u.online && !u.bot} /><span class="ci-m"><span class="ci-t"><b>${userName(u)}</b><${Badges} list=${u.badges} s=${14} /></span><span class="ci-p"><span>${u.username ? '@' + u.username + ' · ' : ''}${lastSeen(u)}</span></span></span></button>`)}`}
    ${g && g.chats.length > 0 && html`<h4>Публичные группы и каналы</h4>${g.chats.map(c => html`<button class="ci" onClick=${() => { remember(); openModal(JoinPreview, { chat: c }); }}><${Avatar} src=${c.avatar} name=${c.title} color=${c.color} s=${44} /><span class="ci-m"><span class="ci-t"><b>${c.title}</b>${c.verified && html`<${Badges} list=${['verified']} s=${14} />`}</span><span class="ci-p"><span>${c.type === 'channel' ? 'канал' : 'группа'} · ${fmtNum(c.count)} ${plural(c.count, ['участник', 'участника', 'участников'])}</span></span></span></button>`)}`}
    ${g && g.servers.length > 0 && html`<h4>Группы</h4>${g.servers.map(s => html`<button class="ci" onClick=${() => openModal(JoinPreview, { server: s })}><${Avatar} src=${s.icon} name=${s.name} s=${44} square /><span class="ci-m"><span class="ci-t"><b>${s.name}</b></span><span class="ci-p"><span>группа · ${fmtNum(s.count)} ${plural(s.count, ['участник', 'участника', 'участников'])}</span></span></span></button>`)}`}
    ${m && m.msgs.length > 0 && html`<h4>Сообщения</h4>${m.msgs.map(x => { const c = S.chats[x.chat]; if (!c) return null; const i = chatInfo(c); return html`<button class="ci" onClick=${() => { remember(); openChat(c.id, { jump: x.thread ? undefined : x.id, thread: x.thread }); }}><${ChatAvatar} chat=${c} s=${44} online=${false} /><span class="ci-m"><span class="ci-t"><b>${c.server ? '#' : ''}${i.title}</b><time>${fmtShort(x.ts)}</time></span><span class="ci-p"><span><i class="who">${x.from === S.me.id ? 'Вы' : userName(S.users[x.from]).split(' ')[0]}: </i>${msgPreview(x)}</span></span></span></button>`; })}`}
    ${busy && !res && html`<${Spinner} />`}
    ${res && !busy && !localChats.length && !(g && (g.users.length || g.chats.length || g.servers.length)) && !(m && m.msgs.length) && html`<${Empty} icon="search" title="Ничего не нашлось" text="Поиск раздел всё догола — и пусто. Попробуйте другой запрос." />`}
  </div>`;
}
function HomeSidebar() {
  const [q, setQ] = useState(''); const [focus, setFocus] = useState(false);
  const all = Object.values(S.chats).filter(c => !c.server && c.type !== 'channel');      // каналы в список чатов не попадают
  const archived = all.filter(c => c.archived), live = all.filter(c => !c.archived);
  const folders = [...BUILTIN.map(([id, name]) => ({ id, name })), ...(S.settings.folders || [])];
  const fid = folders.some(f => f.id === S.ui.folder) ? S.ui.folder : 'all';
  const sort = l => l.sort((a, b) => (b.pin || 0) - (a.pin || 0) || ((b.last ? b.last.ts : b.created) || 0) - ((a.last ? a.last.ts : a.created) || 0));
  const list = sort((S.ui.archive ? archived : live).filter(c => S.ui.archive || inFolder(c, fid)));
  // Группы стоят в общем списке вместе с чатами и сортируются по последнему сообщению в любой из своих комнат
  const clubs = S.ui.archive || fid !== 'all' ? [] : Object.values(S.servers).map(sv => { const st = { club: sv, n: 0, m: 0, ts: 0, rooms: 0 }; for (const c of Object.values(S.chats)) if (c.server === sv.id) { st.rooms++; if (!isMuted(c)) st.n += c.unread || 0; st.m += c.mentions || 0; st.ts = Math.max(st.ts, (c.last ? c.last.ts : 0) || 0); } return st; });
  const rows = clubs.length ? [...list, ...clubs].sort((a, b) => (b.pin || 0) - (a.pin || 0) || ((b.club ? b.ts : (b.last ? b.last.ts : b.created)) || 0) - ((a.club ? a.ts : (a.last ? a.last.ts : a.created)) || 0)) : list;
  const count = f => live.filter(c => inFolder(c, f) && c.unread > 0 && !isMuted(c)).length;
  const menu = e => showMenu(e, S.settings.simple ? [      /* простой режим: короткое меню без редких функций */
    { icon: 'contact', label: 'Контакты', run: () => openModal(ContactsModal) },
    { icon: 'phone', label: 'Звонки', run: () => openModal(CallsModal) },
    { icon: 'users', label: 'Новая группа', run: () => openModal(CreateChat, { type: 'group' }) },
    '-',
    { icon: 'layout-grid', label: 'Хаб: музыка, игры, события', run: () => openHub() },
    { icon: 'store', label: 'Магазин', run: () => openShop() },
    { icon: 'life-buoy', label: 'Помощь и поддержка', run: () => openHub('help') },
    '-',
    { icon: 'settings', label: 'Настройки', run: () => openSettings() },
    { icon: 'accessibility', label: 'Выключить простой режим', run: () => { setSetting({ simple: false }); toast('Простой режим выключен'); } },
  ] : [
    { icon: 'venetian-mask', label: 'Голая правда', hint: 'анонимные вопросы', run: openAsk },
    { icon: 'heart', label: 'Выдохнуть', hint: 'дыхание, настроение, тишина', run: openCalm },
    { icon: 'bell', label: 'Уведомления', hint: 'когда приложение закрыто', run: openPush },
    { icon: 'store', label: 'Магазин и подписка', hint: 'рамки, темы, Plus', run: () => openShop() },
    { icon: 'user-plus', label: 'Позвать друзей', hint: '+100 🍃', run: openInvite },
    !isStandalone() && { icon: 'smartphone', label: 'Установить как приложение', run: installApp },
    '-',
    { icon: 'layout-grid', label: 'Приложения', run: () => openApps(S.ui.chat) },
    { icon: 'life-buoy', label: 'Помощь и поддержка', run: () => openHub('help') },
    '-',
    { icon: 'users', label: 'Новая группа', run: () => openModal(CreateChat, { type: 'group' }) },
    { icon: 'megaphone', label: 'Новый канал', run: () => openModal(CreateChat, { type: 'channel' }) },
    { icon: 'server', label: 'Группа с комнатами', hint: 'роли, голосовые', run: () => openModal(CreateServer) },
    { icon: 'lock', label: 'Секретный чат', run: () => openModal(ContactsModal, { secret: true }) },
    '-',
    { icon: 'bookmark', label: 'Избранное', run: () => openUser(S.me.id) },
    { icon: 'contact', label: 'Контакты', run: () => openModal(ContactsModal) },
    { icon: 'phone', label: 'Звонки', run: () => openModal(CallsModal) },
    { icon: 'bot', label: 'Каталог ботов', run: () => openModal(BotsCatalog) },
    { icon: 'leaf', label: 'Листики и Премиум', hint: fmtNum(S.me.stars || 0) + ' 🍃', run: () => openModal(StarsModal) },
    '-',
    { icon: 'link', label: 'Перейти по ссылке или @username', run: async () => { const v = await promptDlg({ title: 'Открыть по ссылке', label: 'Ссылка-приглашение или @username', placeholder: '@kurilka' }); if (v) openModal(JoinPreview, { q: v.trim() }); } },
    { icon: S.settings.theme === 'dark' ? 'sun' : 'moon', label: S.settings.theme === 'dark' ? 'Дневной режим' : 'Ночное купание', run: () => setSetting({ theme: S.settings.theme === 'dark' ? 'light' : 'dark' }) },
    { icon: 'settings', label: 'Настройки', run: () => openSettings() },
  ]);
  return html`<aside class="side">
    <header class="side-h">
      <button class="ib" onClick=${menu} aria-label="Меню"><${Icon} n="menu" /></button>
      <label class="search"><${Icon} n="search" s=${17} /><input id="search" value=${q} placeholder="Поиск (Ctrl+K)" onInput=${e => setQ(e.target.value)} onFocus=${() => setFocus(true)} onBlur=${() => setTimeout(() => setFocus(false), 200)} onKeyDown=${e => e.key === 'Escape' && (setQ(''), e.target.blur())} autocomplete="off" />${q && html`<button class="ib sm" onClick=${() => setQ('')} aria-label="Очистить"><${Icon} n="x" s=${15} /></button>`}</label>
      <button class="ib" title="Создать: чат, группу или канал" aria-label="Создать" onClick=${() => openModal(CreateMenu)}><${Icon} n="square-pen" /></button>
      <button class="ib" title="Знакомство — подбор людей по интересам" aria-label="Знакомство" onClick=${() => openModal(DatingModal)}><${Icon} n="heart" /></button>
      ${datingTip() && !S.ui.archive && html`<button class="dt-bubble" onClick=${() => { datingTipDone(); openModal(DatingModal); }}><b>Знакомство</b> — листайте анкеты, нравится — сердце. Только по интересам, не по лицу.</button>`}
      <button class="ib" title="Люди рядом" aria-label="Люди рядом" onClick=${() => openModal(NearbyModal)}><${Icon} n="map-pin" /></button>
    </header>
    ${q.trim() ? html`<div class="side-b"><${SearchView} q=${q.trim()} /></div>` : focus && (S.settings.searchHistory || []).length ? html`<div class="side-b"><h4 class="sh">Недавние запросы <a onClick=${() => setSetting({ searchHistory: [] })}>очистить</a></h4>${S.settings.searchHistory.map(h => html`<button class="hist-i" onMouseDown=${e => { e.preventDefault(); setQ(h); }}><${Icon} n="history" s=${16} />${h}</button>`)}</div>` : html`
      ${!S.ui.archive && html`<${StoriesRow} />`}
      ${!S.ui.archive && html`<${PassStrip} />`}
      ${!S.ui.archive && html`<${LobbyStrip} />`}
      ${!S.ui.archive && html`<${NearStrip} />`}
      ${!S.ui.archive && html`<${MoodAsk} />`}
      ${S.ui.archive ? html`<div class="arch-h"><button class="ib" onClick=${() => { S.ui.archive = false; bump(); }}><${Icon} n="arrow-left" /></button><b>Архив</b></div>` : html`<div class="folders" role="tablist">${folders.map(f => { const n = f.id === 'all' ? 0 : count(f.id); return html`<button role="tab" class=${cx(fid === f.id && 'on')} aria-selected=${fid === f.id} onClick=${() => { S.ui.folder = f.id; bump(); }} onContextMenu=${e => f.types && showMenu(e, [{ icon: 'pencil', label: 'Изменить папку', run: () => openModal(FolderEditor, { folder: f }) }, { icon: 'trash-2', label: 'Удалить папку', danger: true, run: () => setSetting({ folders: S.settings.folders.filter(x => x.id !== f.id) }) }])}>${f.icon ? f.icon + ' ' : ''}${f.name}${n > 0 && html`<b>${n}</b>`}</button>`; })}<button class="add" title="Создать папку" onClick=${() => openModal(FolderEditor, {})}><${Icon} n="plus" s=${15} /></button></div>`}
      <div class="side-b" role="list">
        ${!S.ui.archive && fid === 'all' && !S.ui.server && html`<${PushStrip} />`}
        ${!S.ui.archive && fid === 'all' && !S.ui.server && html`<${EventStrip} />`}
        ${!S.ui.archive && archived.length > 0 && fid === 'all' && html`<button class="ci arch" onClick=${() => { S.ui.archive = true; bump(); }}><span class="ava" style="width:48px;height:48px;background:var(--hover);color:var(--ink2)"><${Icon} n="archive" s=${22} /></span><span class="ci-m"><span class="ci-t"><b>Архив</b></span><span class="ci-p"><span>${archived.map(c => chatInfo(c).title).join(', ')}</span>${archived.reduce((a, c) => a + (c.unread || 0), 0) > 0 && html`<b class="cnt mute">${archived.reduce((a, c) => a + (c.unread || 0), 0)}</b>`}</span></span></button>`}
        ${rows.map(r => r.club ? html`<${ClubItem} key=${r.club.id} s=${r.club} st=${r} />` : html`<${ChatItem} key=${r.id} chat=${r} />`)}
        ${!S.ui.archive && fid === 'all' && !S.ui.server && html`<${StartCards} side=${true} />`}
        ${!rows.length && html`<${Empty} icon=${S.ui.archive ? 'archive' : 'message-circle'} title=${S.ui.archive ? 'Архив пуст' : 'Здесь пока голо'} text=${S.ui.archive ? 'Чаты из архива возвращаются сами, когда в них пишут.' : fid === 'all' ? 'Найдите людей через поиск или заведите свою группу или канал.' : 'В этой папке нет чатов.'}>${!S.ui.archive && fid === 'all' && html`<button class="btn" onClick=${() => openModal(CreateMenu)}><${Icon} n="plus" s=${16} /> Создать</button>`}<//>`}
      </div>`}
    <${AudioBar} side=${true} />
    <${MeBar} />
  </aside>`;
}

// ═════ Нижняя плашка: я и голос ═════
function MeBar() {
  const vc = RTC.chat && S.chats[RTC.chat]; if (!vc) return null;      // профиль и настройки теперь во вкладке «Профиль»; здесь остаётся только идущий голосовой разговор
  return html`<div class="mebar">
    <div class="vbar"><div class="vbar-i"><span class=${cx('sig', RTC.connected && 'ok')}><${Icon} n="signal" s=${16} /></span><div onClick=${() => openChat(vc.id)}><b>${RTC.connected ? 'Голос подключён' : 'Подключение…'}</b><small>${vc.server ? vc.title + ' · ' + (S.servers[vc.server] || {}).name : chatInfo(vc).title}</small></div></div>
      <button class=${cx('ib', RTC.muted && 'off')} title=${RTC.muted ? 'Включить микрофон' : 'Выключить микрофон'} onClick=${toggleMute}><${Icon} n=${RTC.muted ? 'mic-off' : 'mic'} s=${18} /></button>
      <button class="ib danger" title="Отключиться" onClick=${() => leaveVoice()}><${Icon} n="phone-off" s=${18} /></button></div></div>`;
}

// ═════ Каналы группы ═════
function ServerSidebar({ s }) {
  const [col, setCol] = useState(() => local.get('col.' + s.id, {}));
  const chans = Object.values(S.chats).filter(c => c.server === s.id).sort((a, b) => a.pos - b.pos);
  const p = s.me.perms || {}, canCh = p.admin || p.channels;
  const cats = [{ id: undefined, name: null }, ...s.cats].map(c => ({ ...c, list: chans.filter(x => (x.cat || undefined) === c.id || (!c.id && !s.cats.some(k => k.id === x.cat))) })).filter(c => c.list.length || (c.id && canCh));
  const toggle = id => { const n = { ...col, [id]: !col[id] }; setCol(n); local.set('col.' + s.id, n); };
  const next = (s.events || []).filter(e => e.at > Date.now() - 3600e3).sort((a, b) => a.at - b.at)[0];
  const chMenu = c => [
    canCh && { icon: 'pencil', label: 'Настроить канал', run: () => openModal(ChannelDlg, { server: s.id, chat: c }) },
    (p.admin || p.invite) && { icon: 'user-plus', label: 'Пригласить', run: () => openModal(InviteModal, { server: s.id }) },
    { icon: isMuted(c) ? 'bell' : 'bell-off', label: isMuted(c) ? 'Включить уведомления' : 'Заглушить канал', run: () => call('chat.state', { id: c.id, mute: isMuted(c) ? 0 : 1e15 }) },
    c.unread > 0 && { icon: 'check-check', label: 'Пометить прочитанным', run: () => call('chat.read', { id: c.id, seq: c.seq }) },
    canCh && { icon: 'trash-2', label: 'Удалить канал', danger: true, run: async () => { if (await confirmDlg({ title: 'Удалить канал?', text: `Канал «${c.title}» и вся его история исчезнут навсегда.`, ok: 'Удалить', danger: true })) call('server.channel.del', { id: c.id }); } },
  ];
  return html`<aside class="side srv">
    <header class=${cx('srv-h', s.banner && 'has-banner')} style=${s.banner ? `background-image:linear-gradient(transparent 30%,var(--panel)),url(${s.banner})` : ''} onClick=${e => showMenu(e, serverMenu(s), { anchor: e.currentTarget })}>
      <button class="ib srv-back" title="К списку чатов" aria-label="К списку чатов" onClick=${e => { e.stopPropagation(); goChats(); }}><${Icon} n="arrow-left" s=${19} /></button><b>${s.name}</b>${s.verified && html`<${Badges} list=${['verified']} />`}${s.boosts > 0 && html`<span class="boost" title="Бусты группы">🚀 ${s.boosts}</span>`}<${Icon} n="chevron-down" s=${18} />
    </header>
    <div class="side-b">
      ${next && html`<button class="event-chip" onClick=${() => openModal(EventsModal, { server: s.id })}><${Icon} n="calendar" s=${16} /><span><b>${next.title}</b><small>${fmtFull(next.at)} · идёт ${next.going.length}</small></span></button>`}
      ${cats.map(cat => html`<div class="cat" key=${cat.id || 'none'}>
        ${cat.name && html`<div class="cat-h" onContextMenu=${e => canCh && showMenu(e, [{ icon: 'pencil', label: 'Переименовать', run: async () => { const n = await promptDlg({ title: 'Категория', label: 'Название', value: cat.name, max: 60 }); if (n) call('server.cat', { server: s.id, id: cat.id, name: n }); } }, { icon: 'trash-2', label: 'Удалить категорию', danger: true, run: () => call('server.cat', { server: s.id, del: cat.id }) }])}><button onClick=${() => toggle(cat.id)} aria-expanded=${!col[cat.id]}><${Icon} n=${col[cat.id] ? 'chevron-right' : 'chevron-down'} s=${13} />${cat.name}</button>${canCh && html`<button class="ib sm" title="Создать канал" onClick=${() => openModal(ChannelDlg, { server: s.id, cat: cat.id })}><${Icon} n="plus" s=${15} /></button>`}</div>`}
        ${cat.list.filter(c => !col[cat.id] || c.id === S.ui.chat || c.unread > 0 || (S.rooms[c.id] || { peers: [] }).peers.length).map(c => {
          const voice = c.kind === 'voice' || c.kind === 'stage', room = S.rooms[c.id];
          return html`<div key=${c.id}><button class=${cx('ch', S.ui.chat === c.id && 'on', c.unread > 0 && !isMuted(c) && 'unread', isMuted(c) && 'muted')} data-chat=${c.id} onClick=${() => { local.set('srv.' + s.id, voice ? local.get('srv.' + s.id) : c.id); openChat(c.id); if (voice && RTC.chat !== c.id) joinVoice(c.id); }} onContextMenu=${e => showMenu(e, chMenu(c))}>
            <${Icon} n=${kindIcon(c.kind)} s=${18} /><span>${c.title}</span>${c.allow && c.allow.length ? html`<${Icon} n="lock" s=${12} cls="lock" />` : ''}${c.mentions > 0 ? html`<b class="cnt at">@${c.mentions}</b>` : c.unread > 0 && !isMuted(c) && !voice ? html`<b class="cnt">${fmtNum(c.unread)}</b>` : ''}</button>
            ${voice && room && room.peers.length > 0 && html`<div class="vpeers">${room.peers.map(pr => { const u = S.users[pr.user]; return html`<div class=${cx('vp', RTC.speaking[pr.id] && 'talk')} onClick=${() => showProfile(pr.user)}><${Avatar} u=${u} src=${u && u.avatar} name=${userName(u)} color=${u ? u.color : 0} s=${22} /><span>${userName(u)}</span>${pr.hand && html`<i>✋</i>`}${pr.screen && html`<${Icon} n="monitor-up" s=${13} />`}${pr.cam && html`<${Icon} n="video" s=${13} />`}${pr.muted && html`<${Icon} n="mic-off" s=${13} />`}${pr.deaf && html`<${Icon} n="headphone-off" s=${13} />`}</div>`; })}</div>`}</div>`; })}
      </div>`)}
      ${!chans.length && html`<${Empty} icon="hash" title="Каналов нет" text="Создайте первый канал через меню группы." />`}
    </div>
    <${AudioBar} side=${true} />
    <${MeBar} />
  </aside>`;
}
// ═════ «Создать»: любой человек может завести свою группу или канал — никаких особых прав не нужно ═════
const MAKE = [
  ['user', 'Написать человеку', 'Найти по имени или @username и начать личный чат', () => openModal(ContactsModal)],
  ['users', 'Своя группа', 'Общий чат для друзей, класса или двора. Вы — владелец: зовёте людей и назначаете админов', () => openModal(CreateChat, { type: 'group' })],
  ['megaphone', 'Свой канал', 'Вы пишете — подписчики читают. Можно сделать публичным, со ссылкой', () => openModal(CreateChat, { type: 'channel' })],
  ['server', 'Группа с комнатами', 'Как в Discord: текстовые и голосовые комнаты, роли, события', () => openModal(CreateServer)],
  ['lock', 'Секретный чат', 'Переписка со сквозным шифрованием для двоих', () => openModal(ContactsModal, { secret: true })],
];
export function CreateMenu({ id }) {
  return html`<${Modal} id=${id} title="Создать" icon="square-pen" cls="small">
    <div class="make-list">${MAKE.map(([ic, t, d, run]) => html`<button class="make-i" onClick=${() => { closeModal(id); run(); }}><span class="make-ic"><${Icon} n=${ic} s=${20} /></span><span class="make-m"><b>${t}</b><small>${d}</small></span><${Icon} n="chevron-right" s=${16} /></button>`)}</div>
    <p class="hint">Создавать может каждый, бесплатно и сколько угодно. Вы становитесь владельцем и сами решаете, кого пускать.</p><//>`;
}

export function Sidebar() { const s = S.servers[S.ui.server]; return s ? html`<${ServerSidebar} key=${s.id} s=${s} />` : html`<${HomeSidebar} />`; }
