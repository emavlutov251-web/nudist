// Панель информации, профили, создание чатов, контакты, листики, папки и прочие диалоги.
import { html, useState, useEffect, useRef, useMemo, S, bump, rpc, call, toast, Icon, Avatar, ChatAvatar, Badges, UserLabel, userLabel, LABEL_COLORS, cx, showMenu, openModal, closeModal, Modal, chatInfo, msgPreview, fmtFull, fmtShort, fmtDur, fmtNum, fmtSize, userName, lastSeen, copyText, download, confirmDlg, promptDlg, addUsers, Empty, Spinner, plural, TTL_OPTS, ttlLabel, isMuted, setSetting, debounce, Toggle, Tabs, uploadAvatar, esc } from './lib.js';
import { openChat, openUser, safetyCode, e2eeAvailable, ensureKey } from './store.js';
import { NOTIF_SOUNDS, sfx, confetti } from './fun.js';
import { GiftShelf, GiftGrid, openGiftShop } from './gifts.js';
import qrcode from '/vendor/qrcode.js';
import { ServerPanel } from './guildui.js';
import { startCall } from './rtc.js';
import { openSettings, AdminRoleDlg } from './settings.js';

// ═════ QR ═════
export function QR({ text, size = 180 }) {
  const d = useMemo(() => { try { const q = qrcode(0, 'M'); q.addData(text || ' '); q.make(); const n = q.getModuleCount(); let p = ''; for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) p += `M${c} ${r}h1v1h-1z`; return { n, p }; } catch (e) { return null; } }, [text]);
  if (!d) return html`<p class="hint">Слишком длинный текст для QR</p>`;
  return html`<svg class="qr" width=${size} height=${size} viewBox=${`-2 -2 ${d.n + 4} ${d.n + 4}`} shape-rendering="crispEdges" role="img" aria-label="QR-код"><rect x="-2" y="-2" width=${d.n + 4} height=${d.n + 4} fill="#fff" /><path d=${d.p} fill="#10231A" /></svg>`;
}
const link = h => location.origin + '/#' + h;
function QrModal({ id, title, text, hint }) { return html`<${Modal} id=${id} title=${title} icon="qr-code" cls="small"><div class="qr-box"><${QR} text=${text} size=${220} /></div><p class="hint center">${hint}</p><div class="copy-row"><input readonly value=${text} onFocus=${e => e.target.select()} /><button class="btn" onClick=${() => { copyText(text); toast('Ссылка скопирована'); }}>Копировать</button></div><//>`; }

// ═════ Выбор пользователей ═════
function UserPicker({ id, title, ok = 'Готово', multi, res, exclude = [] }) {
  const [q, setQ] = useState(''), [sel, setSel] = useState([]), [found, setFound] = useState(null);
  const base = useMemo(() => { const ids = new Set(S.me.contacts || []); for (const c of Object.values(S.chats)) if (c.type === 'dm' && c.peer) ids.add(c.peer); return [...ids].map(i => S.users[i]).filter(u => u && !u.deleted && !exclude.includes(u.id)); }, []);
  const search = useRef(debounce(async s => { if (s.length < 2) return setFound(null); try { const r = await rpc('search', { q: s }); for (const u of r.users) S.users[u.id] = { ...S.users[u.id], ...u }; setFound(r.users.filter(u => !exclude.includes(u.id))); } catch (e) { setFound([]); } }, 250)).current;
  const s = q.trim().toLowerCase(), list = found || base.filter(u => !s || (userName(u) + ' ' + (u.username || '')).toLowerCase().includes(s));
  const done = v => { res(v); closeModal(id); };
  return html`<${Modal} id=${id} title=${title} icon="users" cls="small" onClose=${() => res(null)} footer=${multi && html`<button class="btn" disabled=${!sel.length} onClick=${() => done(sel)}>${ok}${sel.length ? ' · ' + sel.length : ''}</button>`}>
    <div class="pk-search"><${Icon} n="search" s=${15} /><input autofocus placeholder="Имя или @username" value=${q} onInput=${e => { setQ(e.target.value); search(e.target.value.trim()); }} /></div>
    <div class="pick-list tall">${list.length ? list.map(u => { const on = sel.includes(u.id); return html`<button class=${cx('ci', on && 'on')} onClick=${() => multi ? setSel(on ? sel.filter(x => x !== u.id) : [...sel, u.id]) : done([u.id])}><${Avatar} src=${u.avatar} name=${userName(u)} color=${u.color} s=${38} online=${u.online && !u.bot} /><span class="ci-m"><span class="ci-t"><b>${userName(u)}</b><${Badges} list=${u.badges} s=${13} /></span><span class="ci-p"><span>${u.username ? '@' + u.username : lastSeen(u)}</span></span></span>${multi && html`<${Icon} n=${on ? 'circle-check' : 'circle'} s=${20} cls=${on ? 'acc' : 'dim'} />`}</button>`; }) : html`<p class="hint center">${s.length < 2 ? 'Контактов пока нет. Найдите людей по @username.' : 'Никого не нашли. Все оделись и ушли.'}</p>`}</div><//>`;
}
export const pickUsers = o => new Promise(res => openModal(UserPicker, { ...o, res }));

// ═════ Профиль ═════
export function showProfile(userId, username, tab) { openModal(Profile, { userId, username, tab }); }
function Profile({ id, userId, username, tab: tab0 }) {
  const [d, setD] = useState(null), [tab, setTab] = useState(tab0 === 'gifts' ? 'gifts' : 'info'), [gn, setGn] = useState(0);
  useEffect(() => { rpc('user.get', userId ? { id: userId } : { username }).then(r => { S.users[r.user.id] = { ...S.users[r.user.id], ...r.user }; setGn(r.gifts || 0); setD(r); }).catch(e => { toast(e.message, 'err'); closeModal(id); }); }, []);
  if (!d) return html`<${Modal} id=${id} title="Профиль" cls="small"><${Spinner} /><//>`;
  const u = S.users[d.user.id] || d.user, me = u.id === S.me.id, contact = (S.me.contacts || []).includes(u.id), blocked = (S.me.blocked || []).includes(u.id), pr = u.profile || {};
  const go = f => { closeModal(id); f(); };
  const avatars = (u.avatars || []).filter(Boolean);
  const local = u.tz ? (() => { try { return new Date().toLocaleTimeString('ru-RU', { timeZone: u.tz, hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } })() : '';
  const secret = async () => { if (!e2eeAvailable()) return toast('Этот браузер не умеет в шифрование', 'err'); await ensureKey(); const c = await call('secret.open', { user: u.id }); if (c) { S.chats[c.id] = c; go(() => openChat(c.id)); } };
  return html`<${Modal} id=${id} cls="small profile nopad">
    <div class="pf-head" style=${pr.color ? `background:linear-gradient(160deg,${pr.color},${pr.color}99)` : ''}><button class="ib pf-x" onClick=${() => closeModal(id)} aria-label="Закрыть"><${Icon} n="x" /></button>
      ${pr.emoji && html`<span class="pf-deco">${pr.emoji.repeat(1)}</span>`}
      <${Avatar} src=${u.avatar} name=${userName(u)} color=${u.color} s=${104} deleted=${u.deleted} onClick=${avatars.length ? () => { S.viewer = { items: avatars.map(a => ({ id: a, type: /\.(mp4|webm)$/.test(a) ? 'video' : 'photo', media: { url: a }, from: u.id })), i: 0 }; bump(); } : undefined} />
      <h2>${userName(u)} <${Badges} list=${u.badges} s=${18} /></h2>
      <p>${u.status && (u.status.e || u.status.t) ? html`<span class="pf-st">${u.status.e} ${u.status.t}</span>` : ''}${lastSeen(u)}</p>
      ${u.playing && html`<p class="pf-play"><${Icon} n="gamepad-2" s=${14} /> играет в ${u.playing}</p>`}</div>
    <div class="pf-body">
      ${!me && !u.deleted && html`<div class="pf-acts"><button onClick=${() => go(() => openUser(u.id))}><${Icon} n="message-circle" /><span>Написать</span></button>${!u.bot && html`<button onClick=${async () => { await openUser(u.id); const c = Object.values(S.chats).find(x => x.type === 'dm' && x.peer === u.id); if (c) go(() => startCall(c.id, false)); }}><${Icon} n="phone" /><span>Позвонить</span></button><button onClick=${secret}><${Icon} n="lock" /><span>Секретный чат</span></button>`}<button onClick=${e => showMenu(e, [
        { icon: contact ? 'user-minus' : 'user-plus', label: contact ? 'Убрать из контактов' : 'В контакты', run: () => call('me.contact', { id: u.id, on: !contact }) },
        S.flags.stars && !u.bot && { emoji: '🎁', label: 'Подарить подарок', run: () => openGiftShop(u.id) },
        S.flags.stars && !u.bot && { emoji: '🍃', label: 'Поделиться листиками', run: () => shareLeaves(u.id) },
        u.username && { icon: 'qr-code', label: 'QR-код профиля', run: () => openModal(QrModal, { title: 'QR профиля', text: link('u=' + u.username), hint: 'Наведите камеру — откроется профиль @' + u.username }) },
        S.me.admin === 'superadmin' && !u.bot && { icon: 'shield', label: 'Роль администратора…', run: () => openModal(AdminRoleDlg, { user: u }) },
        ['admin', 'superadmin'].includes(S.me.admin) && { icon: 'tag', label: userLabel(u) ? 'Изменить особый статус…' : 'Выдать особый статус…', run: () => openModal(LabelDlg, { user: u.id }) },
        '-', { icon: 'ban', label: blocked ? 'Разблокировать' : 'Заблокировать', danger: !blocked, run: () => call('me.block', { id: u.id, on: !blocked }) },
        { icon: 'flag', label: 'Пожаловаться', danger: true, run: async () => { const t = await promptDlg({ title: 'Жалоба на пользователя', label: 'Что случилось?', area: true, ok: 'Отправить' }); if (t !== null) { const r = await call('report', { type: 'user', target: u.id, reason: 'other', text: t }); if (r) toast('Жалоба отправлена модераторам'); } } },
      ], { anchor: e.currentTarget })}><${Icon} n="ellipsis" /><span>Ещё</span></button></div>`}
      ${me && html`<div class="pf-acts"><button onClick=${() => go(() => openSettings('profile'))}><${Icon} n="pencil" /><span>Изменить</span></button><button onClick=${() => go(() => openModal(StatusDlg))}><${Icon} n="smile" /><span>Статус</span></button>${['admin', 'superadmin'].includes(S.me.admin) && html`<button onClick=${() => openModal(LabelDlg, { user: u.id })} title="Особый статус: плашка рядом с именем, выдаёт администрация"><${Icon} n="tag" /><span>Плашка</span></button>`}${u.username && html`<button onClick=${() => openModal(QrModal, { title: 'Мой QR', text: link('u=' + u.username), hint: 'Покажите этот код — и вас найдут. Даже если вы прикрылись.' })}><${Icon} n="qr-code" /><span>Мой QR</span></button>`}</div>`}
      ${!u.bot && !u.deleted && html`<div class="tabs pf-tabs" role="tablist"><button role="tab" aria-selected=${tab === 'info'} class=${cx(tab === 'info' && 'on')} onClick=${() => setTab('info')}>Профиль</button><button role="tab" aria-selected=${tab === 'gifts'} class=${cx(tab === 'gifts' && 'on')} onClick=${() => setTab('gifts')}>🎁 Подарки${gn > 0 && html`<b>${gn}</b>`}</button></div>`}
      ${tab === 'gifts' && !u.bot && !u.deleted ? html`<${GiftGrid} user=${u.id} onTotal=${setGn} />` : html`
      ${u.private && html`<p class="hint">🔒 Закрытый профиль: подробности видят только контакты.</p>`}
      ${u.bio && html`<div class="pf-row"><small>О себе</small><p>${u.bio}</p></div>`}
      ${u.username && html`<button class="pf-row click" onClick=${() => { copyText('@' + u.username); toast('Username скопирован'); }}><small>Username</small><p>@${u.username}</p></button>`}
      ${u.phone && html`<div class="pf-row"><small>Телефон</small><p>${u.phone}</p></div>`}
      ${(u.city || local) && html`<div class="pf-row"><small>Город и время</small><p>${[u.city, local && 'местное время ' + local].filter(Boolean).join(' · ')}</p></div>`}
      ${u.birthday && html`<div class="pf-row"><small>День рождения</small><p>🎂 ${new Date(u.birthday).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</p></div>`}
      ${(u.links || []).length > 0 && html`<div class="pf-row"><small>Ссылки</small>${u.links.map(l => html`<a href=${l.u} target="_blank" rel="noopener noreferrer">${l.t || l.u}</a>`)}</div>`}
      ${u.bot && (u.cmds || []).length > 0 && html`<div class="pf-row"><small>Команды бота</small>${u.cmds.map(c => html`<p><code class="mono">/${c.c}</code> — ${c.d}</p>`)}</div>`}
      ${(d.common || []).length > 0 && html`<div class="pf-row"><small>Общие группы</small>${d.common.map(c => html`<button class="link" onClick=${() => go(() => openChat(c.id))}>${c.title}</button>`)}</div>`}`}
    </div><//>`;
}
// Особый статус: выдаёт администратор, виден всем рядом с именем человека
export function LabelDlg({ id, user }) {
  const u = S.users[user] || (S.me.id === user ? S.me : null) || { id: user, name: 'Человек', color: 0 }, cur = userLabel(u);
  const [t, setT] = useState(cur ? cur.t : ''), [e, setE] = useState(cur ? cur.e : ''), [c, setC] = useState(cur ? cur.c | 0 : 0), [busy, setBusy] = useState(false);
  const PRE = [['👑', 'Легенда', 6], ['🔥', 'Старожил', 5], ['🛡', 'Хранитель', 1], ['🎨', 'Творец', 2], ['🤡', 'Главный клоун', 3], ['🍃', 'Первый лист', 0], ['💀', 'Душнила', 7], ['⭐', 'Звезда чата', 4]];
  const send = async clear => { if (busy) return; setBusy(true); const r = await call('admin.user.label', clear ? { id: user, text: '', emoji: '' } : { id: user, text: t, emoji: e, color: c }); setBusy(false); if (r) { toast(clear ? 'Особый статус снят' : 'Особый статус выдан'); closeModal(id); } };
  const empty = !t.trim() && !e.trim();
  return html`<${Modal} id=${id} title="Особый статус" icon="tag" cls="small" footer=${html`${cur && html`<button class="btn ghost danger" disabled=${busy} onClick=${() => send(true)}>Снять</button>`}<button class="btn" disabled=${busy || empty} onClick=${() => send(false)}>${cur ? 'Сохранить' : 'Выдать'}</button>`}>
    <div class="lbl-prev"><${Avatar} src=${u.avatar} name=${userName(u)} color=${u.color} s=${40} /><b>${userName(u)}</b>${empty ? html`<span class="hint">плашки нет</span>` : html`<${UserLabel} l=${{ t: t.trim(), e: e.trim(), c }} s=${15} />`}</div>
    <div class="row"><input class="emoji-in" maxlength="8" value=${e} placeholder="👑" onInput=${x => setE(x.target.value)} aria-label="Эмодзи особого статуса" /><input maxlength="24" value=${t} placeholder="Например: Легенда" onInput=${x => setT(x.target.value)} aria-label="Текст особого статуса" autofocus /></div>
    <div class="lbl-colors" role="radiogroup" aria-label="Цвет плашки">${LABEL_COLORS.map((name, i) => html`<button role="radio" aria-checked=${c === i} class=${cx('utag-sw utag' + i, c === i && 'on')} title=${name} aria-label=${name} onClick=${() => setC(i)}></button>`)}</div>
    <div class="chips">${PRE.map(([a, b, col]) => html`<button class=${cx('chip', e === a && t === b && 'on')} onClick=${() => { setE(a); setT(b); setC(col); }}>${a} ${b}</button>`)}</div>
    <p class="hint">Плашку видят все: рядом с именем в чатах, списках и профиле. До 24 знаков. Человеку придёт сообщение, кто её выдал. Свой обычный статус («На пляже») каждый по-прежнему ставит себе сам.</p><//>`;
}
export function StatusDlg({ id }) {
  const u = S.me, [e, setE] = useState((u.status || {}).e || ''), [t, setT] = useState((u.status || {}).t || ''), [play, setPlay] = useState(u.playing || '');
  const PRE = [['🏖', 'На пляже'], ['🍃', 'Прикрыт листком'], ['💼', 'На работе (в одежде)'], ['😴', 'Сплю без пижамы'], ['🚿', 'В душе'], ['🎮', 'Играю'], ['🤐', 'Не беспокоить'], ['🌞', 'Загораю']];
  const save = async (clear) => { const r = await call('me.update', { status: clear ? null : { e, t }, playing: clear ? '' : play }); if (r) closeModal(id); };
  return html`<${Modal} id=${id} title="Статус" icon="smile" cls="small" footer=${html`<button class="btn ghost" onClick=${() => save(true)}>Сбросить</button><button class="btn" onClick=${() => save(false)}>Сохранить</button>`}>
    <div class="row"><input class="emoji-in" maxlength="4" value=${e} placeholder="🙂" onInput=${x => setE(x.target.value)} aria-label="Эмодзи статуса" /><input maxlength="80" value=${t} placeholder="Что вы сейчас делаете?" onInput=${x => setT(x.target.value)} autofocus /></div>
    <div class="chips">${PRE.map(([a, b]) => html`<button class=${cx('chip', e === a && t === b && 'on')} onClick=${() => { setE(a); setT(b); }}>${a} ${b}</button>`)}</div>
    <label class="fld"><span>Играет в… (видят все, как в Discord)</span><input maxlength="64" value=${play} placeholder="Сапёр, Косынка, «Листопад»" onInput=${x => setPlay(x.target.value)} /></label><//>`;
}

// ═════ Мини-приложения ═════
export async function openMiniApp(botId) { const r = await call('bot.appdata', { bot: botId }); if (r) openModal(MiniApp, { bot: botId, ...r }); }
function MiniApp({ id, bot, url, initData, builtin }) {
  const fr = useRef(), b = S.users[bot] || {};
  useEffect(() => {
    const on = async e => {
      if (!fr.current || e.source !== fr.current.contentWindow || !e.data || !builtin) return; const d = e.data, reply = x => fr.current && fr.current.contentWindow.postMessage(x, location.origin);
      if (d.nudist === 'ready') { try { const r = await rpc('stars.info'); reply({ nudist: 'balance', ...r, name: userName(S.me) }); } catch (x) { reply({ nudist: 'error', text: x.message }); } }
      if (d.nudist === 'tap') { try { const r = await rpc('stars.tap', { n: d.n }); reply({ nudist: 'balance', ...r, ack: true }); } catch (x) { reply({ nudist: 'error', text: x.message, ack: true }); } }
      if (d.nudist === 'daily') { try { const r = await rpc('stars.daily'); reply({ nudist: 'bonus', n: r.n, stars: r.stars }); } catch (x) { reply({ nudist: 'error', text: x.message }); } }
    };
    addEventListener('message', on); return () => removeEventListener('message', on);
  }, []);
  return html`<${Modal} id=${id} title=${userName(b) || 'Мини-приложение'} icon="app-window" cls="miniapp nopad"><iframe ref=${fr} title="Мини-приложение" src=${url + (url.includes('#') ? '&' : '#') + 'tgWebAppData=' + encodeURIComponent(initData)} sandbox=${builtin ? 'allow-scripts allow-same-origin' : 'allow-scripts allow-forms allow-popups'} referrerpolicy="no-referrer"></iframe><//>`;
}

// ═════ Листики и Премиум ═════
export function StarsModal({ id }) {
  const u = S.me, prem = (u.premiumUntil || 0) > Date.now(), price = (S.prices || {}).premium || 500, [busy, setBusy] = useState(false), lf = { per: 10, limit: 150, dailyMin: 10, dailyMax: 50, ...((S.prices || {}).leaf || {}) };
  const daily = async () => { setBusy(true); const r = await call('stars.daily'); setBusy(false); if (r) { toast(r.run > 1 ? `+${r.n} 🍃 День ${r.run} подряд. Завтра будет +${r.next}` : `+${r.n} 🍃 Ежедневный урожай собран. Завтра будет +${r.next || r.n}`); confetti(); sfx('coin'); } };
  const game = async () => { try { const r = await rpc('user.get', { username: 'listopad' }); S.users[r.user.id] = r.user; openMiniApp(r.user.id); } catch (e) { toast(e.message, 'err'); } };
  const buy = async () => { if (!(await confirmDlg({ title: 'Нудист Голый Премиум', text: `Спишется ${price} 🍃 за 30 дней. Настоящие деньги не нужны и не принимаются.`, ok: 'Оформить' }))) return; const r = await call('premium.buy'); if (r) { toast('Премиум активирован. Теперь вы голый, но с привилегиями.'); confetti(); sfx('fanfare'); } };
  const PERKS = [['sticker', 'Набор стикеров «Мемные реакции»'], ['smile-plus', 'До 3 реакций на одно сообщение'], ['film', 'Анимированный аватар (видео или GIF)'], ['upload', 'Файлы до 400 МБ вместо 100'], ['leaf', 'Золотой листок рядом с именем'], ['megaphone-off', 'Без рекламы (её и так нет, но приятно)']];
  return html`<${Modal} id=${id} title="Листики и Премиум" icon="leaf">
    <div class="stars-hero"><span class="sh-n">${fmtNum(u.stars || 0)} 🍃</span><p>Листики — внутренняя валюта «Нудиста». Игрушечная: купить за деньги нельзя, зато можно заработать, подарить и потратить.</p>
      <div class="row"><button class="btn" disabled=${busy || u.lastDaily === new Date().toISOString().slice(0, 10)} onClick=${daily}><${Icon} n="gift" s=${16} /> ${u.lastDaily === new Date().toISOString().slice(0, 10) ? 'Бонус уже собран' : 'Ежедневный бонус'}${u.dailyRun > 1 ? ` · ${u.dailyRun} дн.` : ''}</button><button class="btn ghost" onClick=${game}><${Icon} n="gamepad-2" s=${16} /> Играть в «Листопад»</button><button class="btn ghost" onClick=${() => shareLeaves()}><${Icon} n="send" s=${16} /> Поделиться</button></div></div>
    <${LeafHistory} />
    <div class=${cx('prem', prem && 'on')}><h3><${Icon} n="leaf" /> Нудист Голый Премиум</h3>${prem ? html`<p>Активен до ${new Date(u.premiumUntil).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}.</p>` : html`<p>Всё то же самое, только с позолотой. ${price} 🍃 за 30 дней.</p>`}
      <ul>${PERKS.map(([i, t]) => html`<li><${Icon} n=${i} s=${16} /> ${t}</li>`)}</ul>
      <button class="btn warn" onClick=${buy}>${prem ? 'Продлить на 30 дней' : 'Оформить'} · ${price} 🍃</button></div>
    <p class="hint">Откуда берутся листики: ежедневный бонус ${lf.dailyMin === lf.dailyMax ? lf.dailyMin : `от ${lf.dailyMin} до ${lf.dailyMax}`} 🍃 (растёт на 5 за каждый день подряд, пропуск начинает заново), «Листопад» — листик за каждые ${lf.per} тапов, не больше ${lf.limit} 🍃 в день, листики за игры «2048» и «Сапёр» (до 60 и 50 🍃 в день) и 50 🍃 за приглашённого друга. Деревья не резиновые.</p>
    <p class="hint">На что ещё тратить: буст сервера (${(S.prices || {}).boost || 200} 🍃), платные каналы, подарки друзьям.</p><//>`;
}

// ═════ Поделиться листиками ═════
export const shareLeaves = to => { if (!S.flags.stars) return toast('Листики временно отключены', 'err'); openModal(ShareLeaves, { to }); };
const leafWord = n => plural(n, ['листик', 'листика', 'листиков']);
function LeafHistory() {
  const [d, setD] = useState(null), stars = S.me.stars || 0;
  useEffect(() => { let live = true; rpc('stars.history').then(r => { if (!live) return; for (const k in r.users) S.users[k] = { ...S.users[k], ...r.users[k] }; setD(r.list); }).catch(() => live && setD([])); return () => { live = false; }; }, [stars]);
  if (!d || !d.length) return null;
  return html`<div class="leaf-hist"><h3><${Icon} n="history" s=${16} /> Кому и от кого</h3><div class="lh-list">
    ${d.map(r => { const out = !!r.to, o = S.users[r.to || r.from] || {}, gone = !o.id || o.deleted; return html`<button class="ci" disabled=${gone} title=${gone ? '' : 'Поделиться с этим человеком'} onClick=${() => shareLeaves(o.id)}>
      <${Avatar} src=${o.avatar} name=${userName(o)} color=${o.color} s=${36} deleted=${o.deleted} /><span class="ci-m"><span class="ci-t"><b>${out ? 'Вы → ' + userName(o) : userName(o) + ' → вам'}</b><time>${fmtShort(r.ts)}</time></span><span class="ci-p"><span>${r.note || (out ? 'Поделились листиками' : 'Поделился с вами')}</span></span></span>
      <b class=${cx('lh-n', out ? 'out' : 'in')}>${out ? '−' : '+'}${fmtNum(r.n)} 🍃</b></button>`; })}</div></div>`;
}
function ShareLeaves({ id, to }) {
  const [peer, setPeer] = useState(to || null), [q, setQ] = useState(''), [res, setRes] = useState(null), [n, setN] = useState('10'), [note, setNote] = useState(''), [busy, setBusy] = useState(false);
  const have = S.me.stars || 0, u = peer && S.users[peer], v = /^\d+$/.test(n.trim()) ? +n : 0, bad = !v ? 'Введите целое число' : v > have ? `Не хватает: у вас ${have} 🍃` : '';
  const search = useRef(debounce(async t => { if (!t) return setRes(null); try { const r = await rpc('search', { q: t }); for (const x of r.users) S.users[x.id] = { ...S.users[x.id], ...x }; setRes(r.users); } catch (e) { setRes([]); } }, 250)).current;
  useEffect(() => { if (peer && !S.users[peer]) rpc('user.get', { id: peer }).then(r => { S.users[r.user.id] = r.user; bump(); }).catch(() => setPeer(null)); }, [peer]);
  const known = [...new Set([...Object.values(S.chats).filter(c => c.type === 'dm' && c.peer).sort((a, b) => ((b.last || {}).ts || 0) - ((a.last || {}).ts || 0)).map(c => c.peer), ...(S.me.contacts || [])])].map(i => S.users[i]).filter(Boolean);
  const list = (res || known).filter(x => x && !x.deleted && !x.bot && x.id !== S.me.id);
  const send = async () => {
    if (bad || busy) return; setBusy(true); const r = await call('stars.send', { to: peer, n: v, note: note.trim() }); setBusy(false); if (!r) return;
    closeModal(id); confetti(); sfx('coin'); toast(`${v} 🍃 улетели: ${userName(u)}`);
  };
  if (!peer) return html`<${Modal} id=${id} title="Поделиться листиками" icon="leaf" cls="small">
    <p class="hint">С кем делимся? У вас ${fmtNum(have)} 🍃.</p>
    <div class="pk-search"><${Icon} n="search" s=${15} /><input autofocus placeholder="Имя или @username" value=${q} onInput=${e => { setQ(e.target.value); search(e.target.value.trim()); }} /></div>
    <div class="pick-list tall">${list.length ? list.map(x => html`<button class="ci" onClick=${() => setPeer(x.id)}><${Avatar} src=${x.avatar} name=${userName(x)} color=${x.color} s=${40} online=${x.online} /><span class="ci-m"><span class="ci-t"><b>${userName(x)}</b><${Badges} list=${x.badges} s=${13} /></span><span class="ci-p"><span>${x.username ? '@' + x.username + ' · ' : ''}${lastSeen(x)}</span></span></span></button>`)
      : html`<${Empty} icon="users" title=${res ? 'Никого не нашли' : 'Пока не с кем'} text=${res ? 'Проверьте имя или username.' : 'Найдите человека через поиск выше.'} />`}</div><//>`;
  return html`<${Modal} id=${id} title="Поделиться листиками" icon="leaf" cls="small" footer=${html`<button class="btn ghost" onClick=${() => closeModal(id)}>Отмена</button><button class="btn" disabled=${!!bad || busy || !u} onClick=${send}><${Icon} n="send" s=${16} /> ${v ? `Поделиться · ${fmtNum(v)} 🍃` : 'Поделиться'}</button>`}>
    <button class="ci share-to" onClick=${() => { setPeer(null); setQ(''); setRes(null); }} title="Выбрать другого человека">${u ? html`<${Avatar} src=${u.avatar} name=${userName(u)} color=${u.color} s=${40} /><span class="ci-m"><span class="ci-t"><b>${userName(u)}</b></span><span class="ci-p"><span>${u.username ? '@' + u.username : 'получатель'}</span></span></span>` : html`<${Spinner} />`}<${Icon} n="pencil" s=${16} /></button>
    <label class="fld"><span>Сколько <em>у вас ${fmtNum(have)} 🍃</em></span><input class="share-n" type="text" inputmode="numeric" maxlength="7" value=${n} onInput=${e => setN(e.target.value.replace(/\D/g, ''))} onKeyDown=${e => e.key === 'Enter' && send()} ref=${el => el && !el.dataset.f && (el.dataset.f = 1, el.focus(), el.select())} aria-label="Сколько листиков" /></label>
    <div class="chips">${[10, 50, 100, 500].filter(x => x <= have).map(x => html`<button class=${cx('chip', v === x && 'on')} onClick=${() => setN(String(x))}>${x}</button>`)}${have > 0 && html`<button class=${cx('chip', v === have && 'on')} onClick=${() => setN(String(have))}>Всё (${fmtNum(have)})</button>`}</div>
    <label class="fld"><span>Подпись, если хочется</span><input maxlength="120" value=${note} placeholder="На мороженое" onInput=${e => setNote(e.target.value)} onKeyDown=${e => e.key === 'Enter' && send()} /></label>
    <p class=${cx('hint', n && bad && 'err')}>${n && bad ? bad : have ? `После перевода у вас останется ${fmtNum(have - v)} 🍃. Вернуть можно, только если получатель поделится в ответ.` : 'Листиков пока нет: соберите ежедневный бонус или сыграйте в «Листопад».'}</p><//>`;
}

// ═════ Контакты, боты, звонки ═════
export function ContactsModal({ id, secret }) {
  const [q, setQ] = useState(''), [res, setRes] = useState(null);
  const search = useRef(debounce(async s => { if (!s) return setRes(null); try { const r = await rpc('search', { q: s }); for (const u of r.users) S.users[u.id] = { ...S.users[u.id], ...u }; setRes(r.users); } catch (e) { setRes([]); } }, 250)).current;
  const contacts = [...new Set([...(S.me.contacts || []), ...Object.values(S.chats).filter(c => c.type === 'dm' && c.peer).map(c => c.peer)])].map(i => S.users[i]).filter(u => u && !u.deleted && !(secret && u.bot) && u.id !== S.me.id).sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0) || userName(a).localeCompare(userName(b)));
  const pick = async u => { if (secret) { if (!e2eeAvailable()) return toast('Этот браузер не умеет в шифрование', 'err'); await ensureKey(); const c = await call('secret.open', { user: u.id }); if (c) { S.chats[c.id] = c; closeModal(id); openChat(c.id); } } else { closeModal(id); openUser(u.id); } };
  const list = res || contacts;
  return html`<${Modal} id=${id} title=${secret ? 'Новый секретный чат' : 'Контакты'} icon=${secret ? 'lock' : 'users'} cls="small">
    ${secret && html`<p class="hint">Сквозное шифрование: ключи живут только на двух устройствах. Сервер хранит абракадабру и ничего не понимает.</p>`}
    <div class="pk-search"><${Icon} n="search" s=${15} /><input autofocus placeholder="Поиск людей по имени или @username" value=${q} onInput=${e => { setQ(e.target.value); search(e.target.value.trim()); }} /></div>
    <div class="pick-list tall">${list.length ? list.map(u => html`<button class="ci" onClick=${() => pick(u)} onContextMenu=${e => showMenu(e, [{ icon: 'user', label: 'Профиль', run: () => showProfile(u.id) }, (S.me.contacts || []).includes(u.id) && { icon: 'user-minus', label: 'Убрать из контактов', danger: true, run: () => call('me.contact', { id: u.id, on: false }) }])}><${Avatar} src=${u.avatar} name=${userName(u)} color=${u.color} s=${40} online=${u.online && !u.bot} /><span class="ci-m"><span class="ci-t"><b>${userName(u)}</b><${Badges} list=${u.badges} s=${13} /></span><span class="ci-p"><span>${u.username ? '@' + u.username + ' · ' : ''}${lastSeen(u)}</span></span></span>${res && !(S.me.contacts || []).includes(u.id) && !u.bot && html`<span class="ib sm" title="В контакты" onClick=${e => { e.stopPropagation(); call('me.contact', { id: u.id }); toast('Добавлен в контакты'); }}><${Icon} n="user-plus" s=${17} /></span>`}</button>`)
      : html`<${Empty} icon="users" title=${res ? 'Никого не нашли' : 'Контактов пока нет'} text=${res ? 'Проверьте username. Возможно, человек стесняется и закрыл профиль.' : 'Найдите людей через поиск выше или поделитесь своим QR из профиля.'} />`}</div><//>`;
}
export function BotsCatalog({ id }) {
  const [d, setD] = useState(null);
  useEffect(() => { rpc('bot.catalog').then(l => { for (const u of l) S.users[u.id] = { ...S.users[u.id], ...u }; setD(l); }).catch(e => toast(e.message, 'err')); }, []);
  return html`<${Modal} id=${id} title="Каталог ботов" icon="bot">
    <p class="hint">Боты живут по Bot API, совместимому по духу с Telegram: <code class="mono">${location.origin}/bot${"<токен>"}/sendMessage</code>. Своего бота выдаёт @botbatya.</p>
    ${!d ? html`<${Spinner} />` : html`<div class="cards">${d.map(b => html`<button class="card" onClick=${() => { closeModal(id); openUser(b.id); }}><${Avatar} src=${b.avatar} name=${userName(b)} color=${b.color} s=${48} /><b>${userName(b)} <${Badges} list=${b.badges} s=${13} /></b><small>@${b.username}</small><p>${b.bio || 'Бот без описания. Загадочный.'}</p>${b.app && html`<i class="tagx">мини-приложение</i>`}</button>`)}</div>`}<//>`;
}
export function CallsModal({ id }) {
  const [d, setD] = useState(null);
  useEffect(() => { rpc('calls.history').then(setD).catch(e => { toast(e.message, 'err'); setD([]); }); }, []);
  return html`<${Modal} id=${id} title="Звонки" icon="phone" cls="small">${!d ? html`<${Spinner} />` : !d.length ? html`<${Empty} icon="phone-off" title="Звонков не было" text="Позвоните кому-нибудь. Голосом. Как в старину." />` : d.map(m => { const c = S.chats[m.chat], i = chatInfo(c), k = m.call || {}; return html`<div class="row-item"><${ChatAvatar} chat=${c} s=${38} /><div class="ri-m"><b>${i.title}</b><span class=${cx(k.missed && 'err')}><${Icon} n=${k.missed ? 'phone-missed' : m.from === S.me.id ? 'phone-outgoing' : 'phone-incoming'} s=${13} /> ${k.missed ? 'без ответа' : fmtDur(k.dur)}${k.video ? ' · видео' : ''} · ${fmtFull(m.ts)}</span></div>${c && html`<button class="ib sm" title="Перезвонить" onClick=${() => { closeModal(id); startCall(c.id, !!k.video); }}><${Icon} n="phone" s=${17} /></button>`}</div>`; })}<//>`;
}

// ═════ Создание группы/канала ═════
export function CreateChat({ id, type }) {
  const ch = type === 'channel', [f, setF] = useState({ title: '', about: '', avatar: '', pub: false, username: '', members: [] }), [busy, setBusy] = useState(false), set = p => setF(s => ({ ...s, ...p }));
  const go = async () => { setBusy(true); const c = await call('chat.create', { type, title: f.title.trim(), about: f.about, avatar: f.avatar || undefined, pub: f.pub, username: f.pub ? f.username : undefined, members: f.members }); setBusy(false); if (c) { S.chats[c.id] = c; closeModal(id); openChat(c.id); toast(ch ? 'Канал создан. Вещайте!' : 'Группа создана'); } };
  return html`<${Modal} id=${id} title=${ch ? 'Новый канал' : 'Новая группа'} icon=${ch ? 'megaphone' : 'users'} cls="small" footer=${html`<button class="btn" disabled=${!f.title.trim() || busy} onClick=${go}>Создать</button>`}>
    <div class="row top"><button class="ava-pick" onClick=${async () => { const u = await uploadAvatar(); if (u) set({ avatar: u }); }} title="Выбрать аватар">${f.avatar ? html`<img src=${f.avatar} alt="" />` : html`<${Icon} n="camera" s=${24} />`}</button><div class="grow"><label class="fld"><span>Название</span><input autofocus maxlength="100" value=${f.title} placeholder=${ch ? 'Вестник голой правды' : 'Клуб любителей листьев'} onInput=${e => set({ title: e.target.value })} /></label></div></div>
    <label class="fld"><span>Описание</span><textarea rows="2" maxlength="500" value=${f.about} onInput=${e => set({ about: e.target.value })}></textarea></label>
    <${Toggle} label=${ch ? 'Публичный канал' : 'Публичная группа'} hint="Можно найти в поиске и вступить по ссылке" on=${f.pub} onChange=${v => set({ pub: v })} />
    ${f.pub && html`<label class="fld"><span>Ссылка</span><div class="row"><span class="dim">@</span><input maxlength="32" value=${f.username} placeholder="golye_novosti" onInput=${e => set({ username: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })} /></div></label>`}
    <div class="fld"><span>${ch ? 'Первые подписчики' : 'Участники'}</span><button class="btn ghost" onClick=${async () => { const ids = await pickUsers({ title: 'Кого добавить', multi: true, ok: 'Добавить' }); if (ids) set({ members: [...new Set([...f.members, ...ids])] }); }}><${Icon} n="user-plus" s=${16} /> Добавить людей</button>
      <div class="chips">${f.members.map(u => html`<button class="chip" title="Убрать" onClick=${() => set({ members: f.members.filter(x => x !== u) })}>${userName(S.users[u])} ×</button>`)}</div></div><//>`;
}

// ═════ Вступление по ссылке ═════
export function JoinPreview({ id, q, chat, server }) {
  const [d, setD] = useState(chat ? { chat } : server ? { server } : null), [busy, setBusy] = useState(false);
  useEffect(() => { if (d) return; rpc('resolve', { q }).then(r => { if (r.user) { closeModal(id); S.users[r.user.id] = { ...S.users[r.user.id], ...r.user }; showProfile(r.user.id); } else setD(r); }).catch(e => { toast(e.message, 'err'); closeModal(id); }); }, []);
  if (!d) return html`<${Modal} id=${id} title="Приглашение" cls="small"><${Spinner} /><//>`;
  const c = d.chat, s = d.server, title = c ? c.title : s.name;
  const join = async () => {
    setBusy(true);
    if (c) { if (d.member || S.chats[c.id]) { closeModal(id); return openChat(c.id); } const r = await call('chat.join', d.invite ? { invite: d.invite } : { id: c.id }); setBusy(false); if (!r) return; closeModal(id); if (r.requested) return toast('Заявка отправлена. Ждём, пока админы оденутся и одобрят.'); S.chats[r.id] = r; openChat(r.id); }
    else { const r = await call('server.join', d.invite ? { invite: d.invite } : { id: s.id }); setBusy(false); if (!r) return; S.servers[r.id] = r; closeModal(id); S.ui.server = r.id; S.ui.chat = null; S.ui.list = true; bump(); toast(`Вы на сервере «${r.name}»`); }
  };
  return html`<${Modal} id=${id} title=${c ? (c.type === 'channel' ? 'Канал' : 'Группа') : 'Сервер'} cls="small" footer=${html`<button class="btn wide" disabled=${busy} onClick=${join}>${d.member || (c && S.chats[c.id]) || (s && S.servers[s.id]) ? 'Открыть' : c && c.approval && !d.invite ? 'Подать заявку' : c && c.price ? `Подписаться за ${c.price} 🍃 в месяц` : c && c.type === 'channel' ? 'Подписаться' : 'Вступить'}</button>`}>
    <div class="join">${s && s.banner && html`<img class="join-b" src=${s.banner} alt="" />`}<${Avatar} src=${c ? c.avatar : s.icon} name=${title} color=${c ? c.color : 2} s=${84} square=${!!s} />
      <h3>${title} ${(c || s).verified && html`<${Badges} list=${['verified']} s=${17} />`}</h3>
      <small>${c && c.username ? '@' + c.username + ' · ' : ''}${fmtNum((c || s).count)} ${plural((c || s).count, c && c.type === 'channel' ? ['подписчик', 'подписчика', 'подписчиков'] : ['участник', 'участника', 'участников'])}${s ? ` · ${s.online} в сети${s.boosts ? ' · 🚀 ' + s.boosts : ''}` : ''}</small>
      <p>${(c || s).about || 'Описания нет. Интрига.'}</p></div><//>`;
}

// ═════ Папки ═════
export function FolderEditor({ id, folder }) {
  const [f, setF] = useState(() => folder ? structuredClone(folder) : { id: 'f' + Date.now().toString(36), name: '', icon: '📁', types: [], chats: [], exclude: [], unread: false, noMuted: false }), set = p => setF(s => ({ ...s, ...p }));
  const TYPES = [['dm', 'Личные'], ['group', 'Группы'], ['channel', 'Каналы'], ['bot', 'Боты']];
  const save = () => { const l = S.settings.folders || []; setSetting({ folders: folder ? l.map(x => (x.id === f.id ? f : x)) : [...l, f].slice(0, 12) }); closeModal(id); };
  const chats = Object.values(S.chats).filter(c => !c.server).sort((a, b) => chatInfo(a).title.localeCompare(chatInfo(b).title));
  const pickChats = (key, title) => openModal(ChatPicker, { title, chats, value: f[key], onDone: v => set({ [key]: v }) });
  return html`<${Modal} id=${id} title=${folder ? 'Папка' : 'Новая папка'} icon="folder" cls="small" footer=${html`${folder && html`<button class="btn danger" onClick=${() => { setSetting({ folders: (S.settings.folders || []).filter(x => x.id !== f.id) }); if (S.ui.folder === f.id) S.ui.folder = 'all'; closeModal(id); }}>Удалить</button>`}<span class="sp"></span><button class="btn" disabled=${!f.name.trim()} onClick=${save}>Сохранить</button>`}>
    <div class="row"><input class="emoji-in" maxlength="4" value=${f.icon} onInput=${e => set({ icon: e.target.value })} aria-label="Иконка" /><input autofocus maxlength="24" value=${f.name} placeholder="Работа, Семья, Мемы…" onInput=${e => set({ name: e.target.value })} /></div>
    <div class="chips">${['📁', '💼', '🏠', '❤️', '🎮', '📚', '😂', '🍃', '⭐', '🔥'].map(e => html`<button class=${cx('chip', f.icon === e && 'on')} onClick=${() => set({ icon: e })}>${e}</button>`)}</div>
    <div class="fld"><span>Включать типы чатов</span><div class="chips">${TYPES.map(([k, l]) => html`<button class=${cx('chip', f.types.includes(k) && 'on')} onClick=${() => set({ types: f.types.includes(k) ? f.types.filter(x => x !== k) : [...f.types, k] })}>${l}</button>`)}</div></div>
    <div class="row"><button class="btn ghost grow" onClick=${() => pickChats('chats', 'Добавить чаты')}>Добавленные чаты: ${f.chats.length}</button><button class="btn ghost grow" onClick=${() => pickChats('exclude', 'Исключить чаты')}>Исключённые: ${f.exclude.length}</button></div>
    <${Toggle} label="Только непрочитанные" on=${f.unread} onChange=${v => set({ unread: v })} /><${Toggle} label="Без чатов с выключенным звуком" on=${f.noMuted} onChange=${v => set({ noMuted: v })} /><//>`;
}
function ChatPicker({ id, title, chats, value, onDone }) {
  const [sel, setSel] = useState(value || []), [q, setQ] = useState(''), s = q.trim().toLowerCase();
  return html`<${Modal} id=${id} title=${title} cls="small" footer=${html`<button class="btn" onClick=${() => { onDone(sel); closeModal(id); }}>Готово · ${sel.length}</button>`}>
    <div class="pk-search"><${Icon} n="search" s=${15} /><input autofocus placeholder="Поиск" value=${q} onInput=${e => setQ(e.target.value)} /></div>
    <div class="pick-list tall">${chats.filter(c => !s || chatInfo(c).title.toLowerCase().includes(s)).map(c => { const on = sel.includes(c.id); return html`<button class=${cx('ci', on && 'on')} onClick=${() => setSel(on ? sel.filter(x => x !== c.id) : [...sel, c.id])}><${ChatAvatar} chat=${c} s=${34} online=${false} /><span class="ci-m"><span class="ci-t"><b>${chatInfo(c).title}</b></span></span><${Icon} n=${on ? 'circle-check' : 'circle'} s=${20} cls=${on ? 'acc' : 'dim'} /></button>`; })}</div><//>`;
}

// ═════ Действия над чатом (меню) ═════
async function exportChat(chat, fmt) {
  const r = await call('chat.export', { id: chat.id }); if (!r) return; const title = chatInfo(chat).title, name = 'nudist-' + title.replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 40);
  if (fmt === 'json') return download(name + '.json', JSON.stringify(r, null, 2), 'application/json');
  const rows = r.msgs.map(m => `<div class="m"><b>${esc(userName(r.users[m.from]))}</b> <time>${esc(new Date(m.ts).toLocaleString('ru-RU'))}</time><p>${m.enc ? '🔒 зашифровано' : esc(m.type === 'text' || m.type === 'service' ? m.text || '' : msgPreview(m))}</p>${m.media && !m.media.ek ? `<a href="${esc(location.origin + m.media.url)}">${esc(m.media.name || 'вложение')}</a>` : ''}</div>`).join('\n');
  download(name + '.html', `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title><style>body{font:15px/1.5 system-ui;max-width:760px;margin:40px auto;padding:0 16px;color:#10231a;background:#f6f1e7}.m{padding:8px 0;border-bottom:1px solid #e3dccb}time{color:#789;font-size:12px}p{margin:2px 0;white-space:pre-wrap}</style><h1>${esc(title)}</h1><p>Экспорт из «Нудиста» · ${esc(new Date().toLocaleString('ru-RU'))} · ${r.msgs.length} сообщений</p>${rows}`, 'text/html');
}
export function chatActions(chat, inList) {
  const i = chatInfo(chat), u = i.user, muted = isMuted(chat), priv = chat.type === 'dm' || chat.type === 'secret', folders = S.settings.folders || [];
  const mute = t => call('chat.state', { id: chat.id, mute: t });
  const leave = async () => {
    if (chat.type === 'saved') return;
    if (priv) { const r = await confirmDlg({ title: 'Удалить чат?', text: `Чат с «${i.title}» исчезнет из списка.`, ok: 'Удалить', danger: true, check: chat.type === 'dm' ? 'Также удалить у собеседника' : undefined }); if (r) call('chat.delete', { id: chat.id, all: !!r.check }); return; }
    if (await confirmDlg({ title: chat.type === 'channel' ? 'Отписаться от канала?' : 'Покинуть группу?', text: `«${i.title}» переживёт. Наверное.`, ok: chat.type === 'channel' ? 'Отписаться' : 'Покинуть', danger: true })) call('chat.leave', { id: chat.id });
  };
  return [
    inList && { icon: 'pin', label: chat.pin ? 'Открепить' : 'Закрепить наверху', run: () => call('chat.state', { id: chat.id, pin: !chat.pin }) },
    chat.type !== 'saved' && (muted ? { icon: 'bell', label: 'Включить уведомления', run: () => mute(0) } : { icon: 'bell-off', label: 'Без звука', sub: [['На 1 час', 3600e3], ['На 8 часов', 8 * 3600e3], ['На сутки', 864e5], ['На неделю', 7 * 864e5]].map(([l, t]) => ({ label: l, run: () => mute(Date.now() + t) })).concat([{ label: 'Навсегда', run: () => mute(1e15) }]) }),
    chat.type !== 'saved' && { icon: 'bell-ring', label: 'Звук уведомлений', sub: [{ label: 'Как у всех', on: !chat.notif, run: () => call('chat.state', { id: chat.id, notif: null }) }, ...NOTIF_SOUNDS.map(([k, l]) => ({ label: l, on: chat.notif && chat.notif.sound === k, run: () => { sfx(k); call('chat.state', { id: chat.id, notif: { sound: k, preview: !chat.notif || chat.notif.preview !== false } }); } })), '-', { label: 'Скрывать текст в уведомлениях', on: chat.notif && chat.notif.preview === false, run: () => call('chat.state', { id: chat.id, notif: { sound: (chat.notif || {}).sound || S.settings.notifSound, preview: !!(chat.notif && chat.notif.preview === false) } }) }] },
    { icon: chat.archived ? 'archive-restore' : 'archive', label: chat.archived ? 'Вернуть из архива' : 'В архив', run: () => call('chat.state', { id: chat.id, archived: !chat.archived }) },
    chat.unread > 0 && { icon: 'check-check', label: 'Пометить прочитанным', run: () => call('chat.read', { id: chat.id, seq: chat.seq || 0 }) },
    folders.length > 0 && { icon: 'folder', label: 'В папку', sub: folders.map(f => ({ emoji: f.icon, label: f.name, on: (f.chats || []).includes(chat.id), run: () => setSetting({ folders: folders.map(x => x.id === f.id ? { ...x, chats: (x.chats || []).includes(chat.id) ? x.chats.filter(c => c !== chat.id) : [...(x.chats || []), chat.id] } : x) }) })) },
    '-',
    (priv || (chat.can && chat.can.info)) && { icon: 'timer', label: 'Автоудаление', hint: chat.ttl ? ttlLabel(chat.ttl) : 'выкл', sub: TTL_OPTS.map(([s, l]) => ({ label: l, on: (chat.ttl || 0) === s, run: () => call('chat.update', { id: chat.id, ttl: s }) })) },
    chat.type !== 'secret' && { icon: 'download', label: 'Экспорт истории', sub: [{ icon: 'braces', label: 'JSON', run: () => exportChat(chat, 'json') }, { icon: 'file-text', label: 'HTML', run: () => exportChat(chat, 'html') }] },
    u && !u.bot && { icon: 'user', label: 'Профиль', run: () => showProfile(u.id) },
    u && !u.deleted && { icon: 'ban', label: (S.me.blocked || []).includes(u.id) ? 'Разблокировать' : 'Заблокировать', run: () => call('me.block', { id: u.id, on: !(S.me.blocked || []).includes(u.id) }) },
    (chat.type === 'group' || chat.type === 'channel') && { icon: 'flag', label: 'Пожаловаться', run: async () => { const t = await promptDlg({ title: 'Жалоба', label: 'Что не так с этим чатом?', area: true, ok: 'Отправить' }); if (t !== null) { const r = await call('report', { type: 'chat', target: chat.id, reason: 'other', text: t }); if (r) toast('Жалоба отправлена'); } } },
    { icon: 'eraser', label: 'Очистить историю', danger: true, run: async () => { const canAll = priv || chat.type === 'saved' || chat.role === 'owner'; const r = await confirmDlg({ title: 'Очистить историю?', text: 'Сообщения исчезнут. Скриншоты у собеседника — нет.', ok: 'Очистить', danger: true, check: canAll && chat.type !== 'saved' ? 'Очистить у всех' : undefined }); if (r) call('chat.clear', { id: chat.id, all: chat.type === 'saved' ? true : !!r.check }); } },
    chat.type !== 'saved' && { icon: priv ? 'trash-2' : 'log-out', label: priv ? 'Удалить чат' : chat.type === 'channel' ? 'Отписаться' : 'Покинуть группу', danger: true, run: leave },
  ];
}

// ═════ Правая панель ═════
const ROLE = { owner: 'владелец', admin: 'админ', mod: 'модератор', member: '' };
function SharedMedia({ chat }) {
  const [tab, setTab] = useState('media'), [d, setD] = useState(null);
  useEffect(() => { if (chat.type === 'secret') return setD([]); let live = true; setD(null); rpc('msg.search', { chat: chat.id, type: tab, limit: 60 }).then(r => { addUsers(r.users); if (live) setD(r.msgs); }).catch(() => live && setD([])); return () => { live = false; }; }, [tab, chat.id, chat.seq]);
  const jump = m => openChat(chat.id, { jump: m.id, thread: m.thread, keepServer: true });
  return html`<div class="shared"><${Tabs} cls="sm" tabs=${[['media', 'Медиа'], ['file', 'Файлы'], ['link', 'Ссылки'], ['voice', 'Голос'], ['audio', 'Музыка']]} value=${tab} onChange=${setTab} />
    ${!d ? html`<${Spinner} />` : !d.length ? html`<p class="hint center">${chat.type === 'secret' ? 'В секретном чате сервер не видит вложений — и показать тут нечего.' : 'Пусто. Чисто. Голо.'}</p>` : tab === 'media' ? html`<div class="sh-grid">${d.map((m, i) => html`<button onClick=${() => { S.viewer = { items: d.filter(x => x.type !== 'gif' || true), i }; bump(); }} onContextMenu=${e => showMenu(e, [{ icon: 'message-square', label: 'Показать в чате', run: () => jump(m) }])}>${m.type === 'video' ? html`<video src=${m.media.url} preload="metadata" muted></video><i><${Icon} n="play" s=${14} /></i>` : html`<img src=${m.media.url} alt="" loading="lazy" />`}</button>`)}</div>`
      : d.map(m => html`<button class="row-item click" onClick=${() => jump(m)}><span class="fp-i sm"><${Icon} n=${tab === 'link' ? 'link' : tab === 'voice' ? 'mic' : tab === 'audio' ? 'music' : 'file'} s=${17} /></span><div class="ri-m"><b>${tab === 'link' ? ((m.text || '').match(/https?:\/\/\S+/) || [''])[0].slice(0, 60) : (m.media || {}).name || (tab === 'voice' ? 'Голосовое ' + fmtDur((m.media || {}).dur) : 'Файл')}</b><span>${userName(S.users[m.from])} · ${fmtShort(m.ts)}${m.media && m.media.size ? ' · ' + fmtSize(m.media.size) : ''}</span></div></button>`)}</div>`;
}
function Members({ chat }) {
  const [q, setQ] = useState(''), [d, setD] = useState(null), can = chat.can || {};
  const load = useRef(debounce(s => rpc('chat.members', { id: chat.id, q: s }).then(r => { for (const m of r.members) S.users[m.user.id] = { ...S.users[m.user.id], ...m.user }; setD(r); }).catch(() => setD({ members: [], total: 0, hidden: true })), 200)).current;
  useEffect(() => { load(q.trim()); }, [q, chat.count, chat.id]);
  const mute = async (u, hours) => { const r = await call('chat.mute', { id: chat.id, user: u.id, hours }); if (r) { toast(hours ? `${userName(u)}: писать запрещено` : `${userName(u)} снова может писать`); load(q); } };
  const act = (m) => e => { const u = m.user, me = u.id === S.me.id, owner = chat.role === 'owner'; const setRole = (role, extra) => call('chat.role', { id: chat.id, user: u.id, role, ...extra }).then(() => load(q)); showMenu(e, [
    { icon: 'user', label: 'Профиль', run: () => showProfile(u.id) }, !me && { icon: 'message-circle', label: 'Написать', run: () => openUser(u.id) },
    !me && can.promote && m.role !== 'owner' && '-',
    !me && can.promote && m.role !== 'owner' && { icon: 'shield', label: 'Роль', hint: ROLE[m.role] || 'участник', sub: [{ label: 'Админ', on: m.role === 'admin', run: () => setRole('admin') }, { label: 'Модератор', on: m.role === 'mod', run: () => setRole('mod') }, { label: 'Участник', on: m.role === 'member', run: () => setRole('member') }, owner && '-', owner && { icon: 'crown', label: 'Передать владение', danger: true, run: async () => { if (await confirmDlg({ title: 'Передать владение?', text: `${userName(u)} станет владельцем, вы — админом. Обратно только по доброй воле.`, ok: 'Передать', danger: true })) setRole('owner'); } }] },
    !me && can.promote && m.role !== 'owner' && m.role !== 'member' && { icon: 'tag', label: 'Титул', run: async () => { const t = await promptDlg({ title: 'Титул администратора', label: 'Например: Хранитель листка', value: m.title || '', max: 24 }); if (t !== null) setRole(m.role, { title: t }); } },
    !me && can.ban && m.role !== 'owner' && (m.muted > Date.now() ? { icon: 'volume-2', label: 'Вернуть право писать', hint: m.muted - Date.now() > 50 * 365 * 864e5 ? 'мут бессрочный' : 'мут до ' + fmtFull(m.muted), run: () => mute(u, 0) }
      : { icon: 'volume-x', label: 'Запретить писать', sub: [{ label: 'На 1 час', run: () => mute(u, 1) }, { label: 'На 24 часа', run: () => mute(u, 24) }, { label: 'На 7 дней', run: () => mute(u, 168) }, { label: 'Пока не верну', run: () => mute(u, -1) }] }),
    !me && can.ban && m.role !== 'owner' && { icon: 'user-x', label: 'Исключить', danger: true, run: () => call('chat.kick', { id: chat.id, user: u.id }).then(() => load(q)) },
    !me && can.ban && m.role !== 'owner' && { icon: 'gavel', label: 'Забанить', danger: true, run: async () => { const r = await confirmDlg({ title: `Забанить: ${userName(u)}?`, text: 'Вернуться по ссылке не получится.', ok: 'Забанить', danger: true, check: 'Удалить все его сообщения' }); if (r) call('chat.kick', { id: chat.id, user: u.id, ban: true, purge: !!r.check }).then(() => load(q)); } },
  ]); };
  if (d && d.hidden) return html`<p class="hint">Список подписчиков виден только администраторам канала.</p>`;
  return html`<div class="members"><div class="mem-h"><b>${chat.type === 'channel' ? 'Подписчики' : 'Участники'} · ${d ? d.total : '…'}</b>${can.invite && html`<button class="ib sm" title="Добавить" onClick=${async () => { const ids = await pickUsers({ title: 'Добавить в чат', multi: true, ok: 'Добавить' }); if (ids) { const r = await call('chat.add', { id: chat.id, users: ids }); if (r && r.skipped.length) toast('Не добавлены (настройки приватности): ' + r.skipped.join(', ')); load(q); } }}><${Icon} n="user-plus" s=${17} /></button>`}</div>
    ${(chat.count || 0) > 8 && html`<div class="pk-search"><${Icon} n="search" s=${15} /><input placeholder="Поиск участников" value=${q} onInput=${e => setQ(e.target.value)} /></div>`}
    ${!d ? html`<${Spinner} />` : d.members.map(m => html`<button class="ci" onClick=${act(m)} onContextMenu=${act(m)}><${Avatar} src=${m.user.avatar} name=${userName(m.user)} color=${m.user.color} s=${36} online=${m.user.online && !m.user.bot} /><span class="ci-m"><span class="ci-t"><b>${userName(m.user)}</b><${Badges} list=${m.user.badges} s=${13} />${(m.title || ROLE[m.role]) && html`<i class="tagx">${m.title || ROLE[m.role]}</i>`}${m.muted > Date.now() && html`<i class="tagx mute">мут</i>`}</span><span class="ci-p"><span>${m.pending ? 'проходит проверку листком' : lastSeen(m.user)}</span></span></span></button>`)}
    ${d && d.banned && d.banned.length > 0 && html`<h5>Забанены · ${d.banned.length}</h5>${d.banned.map(u => html`<div class="row-item"><${Avatar} src=${u.avatar} name=${userName(u)} color=${u.color} s=${30} /><div class="ri-m"><b>${userName(u)}</b></div><button class="btn sm ghost" onClick=${async () => { await call('chat.unban', { id: chat.id, user: u.id }); toast(`${userName(u)} разбанен: может вернуться по ссылке или приглашению`); load(q); }}>Разбанить</button></div>`)}`}</div>`;
}
function SafetyCode({ chat }) {
  const [c, setC] = useState(null); useEffect(() => { safetyCode(chat).then(setC).catch(() => {}); }, [chat.id]);
  if (!c) return null;
  return html`<div class="safety"><h5><${Icon} n="shield-check" s=${15} /> Код безопасности</h5><div class="sf-e">${c.emoji}</div><code class="mono">${c.hex}</code><div class="qr-box sm"><${QR} text=${'nudist-safety:' + c.hex.replace(/ /g, '')} size=${120} /></div><p class="hint">Сравните эмодзи и цифры с собеседником — лично или по звонку. Совпали — значит, между вами никого нет. Даже нас.</p></div>`;
}
// Простое объяснение сквозного шифрования — по нажатию на значок «E2EE» в шапке секретного чата.
export function E2eeInfo({ id, chat }) {
  const ch = S.chats[chat]; if (!ch) return null;
  return html`<${Modal} id=${id} title="Этот чат зашифрован" icon="lock" footer=${html`<button class="btn" onClick=${() => closeModal(id)}>Понятно</button>`}>
    <div class="e2ee-info">
      <p><b>Сообщения шифруются на вашем устройстве</b> и расшифровываются только на устройстве собеседника. На сервере лежит набор символов — прочитать его не можем даже мы.</p>
      <p><b>Ключ хранится только у вас.</b> Поэтому на другом телефоне или после переустановки приложения старые сообщения этого чата не откроются — это плата за секретность.</p>
      <p><b>Что сервер всё же видит:</b> кто с кем переписывается и когда. Текст, фото и файлы — нет.</p>
      <${SafetyCode} chat=${ch} />
    </div><//>`;
}
export function InfoPanel({ chat }) {
  if (chat.server) return html`<${ServerPanel} chat=${chat} />`;
  const i = chatInfo(chat), u = i.user, can = chat.can || {}, grp = chat.type === 'group' || chat.type === 'channel', close = () => { S.ui.panel = false; bump(); };
  const name = chat.username ? link('join=@' + chat.username) : null;
  return html`<aside class="panel"><header class="panel-h"><button class="ib" onClick=${close} aria-label="Закрыть панель"><${Icon} n="x" /></button><b>Информация</b>${grp && can.info && html`<button class="ib" title="Управление" onClick=${() => openModal(ChatSettings, { chat: chat.id })}><${Icon} n="settings" /></button>`}</header>
    <div class="panel-b">
      <div class="pn-top"><span onClick=${() => u && showProfile(u.id)} class=${cx(u && 'click')}><${ChatAvatar} chat=${chat} s=${96} /></span><h3>${i.title} ${u ? html`<${Badges} list=${u.badges} s=${17} />` : i.verified ? html`<${Badges} list=${['verified']} s=${17} />` : ''}</h3>
        <small>${u ? lastSeen(u) : chat.type === 'saved' ? 'только вы и ваши мысли' : `${fmtNum(chat.count || 0)} ${plural(chat.count || 0, chat.type === 'channel' ? ['подписчик', 'подписчика', 'подписчиков'] : ['участник', 'участника', 'участников'])}${chat.pub ? ' · публичн' + (chat.type === 'channel' ? 'ый' : 'ая') : ''}`}</small></div>
      ${u && u.status && (u.status.e || u.status.t) && html`<div class="pf-row"><small>Статус</small><p>${u.status.e} ${u.status.t}</p></div>`}
      ${u && u.bio && html`<div class="pf-row"><small>О себе</small><p>${u.bio}</p></div>`}
      ${u && u.username && html`<button class="pf-row click" onClick=${() => { copyText('@' + u.username); toast('Скопировано'); }}><small>Username</small><p>@${u.username}</p></button>`}
      ${u && chat.type === 'dm' && !u.bot && !u.deleted && html`<${GiftShelf} user=${u.id} />`}
      ${grp && chat.about && html`<div class="pf-row"><small>Описание</small><p>${chat.about}</p></div>`}
      ${grp && chat.rules && html`<div class="pf-row"><small>Правила</small><p class="pre">${chat.rules}</p></div>`}
      ${name && html`<button class="pf-row click" onClick=${() => openModal(QrModal, { title: 'Ссылка и QR', text: name, hint: 'Ссылка-приглашение в «' + i.title + '»' })}><small>Ссылка</small><p>@${chat.username} <${Icon} n="qr-code" s=${14} /></p></button>`}
      ${grp && (chat.slow || chat.price || chat.ttl) && html`<div class="pf-row"><small>Режим</small><p>${[chat.slow && `медленный режим: ${chat.slow} сек`, chat.price && `подписка ${chat.price} 🍃/мес`, chat.ttl && 'автоудаление: ' + ttlLabel(chat.ttl)].filter(Boolean).join(' · ')}</p></div>`}
      ${grp && can.info && chat.reqs > 0 && html`<button class="btn ghost wide" onClick=${() => openModal(ChatSettings, { chat: chat.id, tab: 'reqs' })}><${Icon} n="user-check" s=${16} /> Заявки на вступление: ${chat.reqs}</button>`}
      ${chat.type === 'secret' && html`<${SafetyCode} chat=${chat} />`}
      <div class="pn-acts">${chat.type !== 'saved' && html`<button onClick=${() => call('chat.state', { id: chat.id, mute: isMuted(chat) ? 0 : 1e15 })}><${Icon} n=${isMuted(chat) ? 'bell-off' : 'bell'} /><span>${isMuted(chat) ? 'Без звука' : 'Звук вкл.'}</span></button>`}${grp && can.invite && html`<button onClick=${() => openModal(ChatSettings, { chat: chat.id, tab: 'inv' })}><${Icon} n="link" /><span>Пригласить</span></button>`}<button onClick=${e => showMenu(e, chatActions(chat, false), { anchor: e.currentTarget })}><${Icon} n="ellipsis" /><span>Ещё</span></button></div>
      <${SharedMedia} chat=${chat} />
      ${grp && html`<${Members} chat=${chat} />`}
    </div></aside>`;
}

// ═════ Управление группой/каналом ═════
function ChatSettings({ id, chat: cid, tab: t0 }) {
  const chat = S.chats[cid], [tab, setTab] = useState(t0 || 'main');
  if (!chat) { setTimeout(() => closeModal(id)); return null; }
  const ch = chat.type === 'channel', can = chat.can || {};
  const tabs = [can.info && ['main', 'Основное'], can.info && !ch && ['perms', 'Права'], can.invite && ['inv', 'Приглашения'], can.info && ['reqs', 'Заявки', chat.reqs], can.info && ['mod', 'Автомодерация'], can.info && ['stats', 'Статистика'], can.audit && ['audit', 'Журнал'], can.del && ['tools', 'Инструменты']].filter(Boolean);
  return html`<${Modal} id=${id} title=${'Управление: ' + chat.title} icon="settings" wide><${Tabs} tabs=${tabs} value=${tab} onChange=${setTab} />
    ${tab === 'main' && html`<${CsMain} chat=${chat} />`}${tab === 'perms' && html`<${CsPerms} chat=${chat} />`}${tab === 'inv' && html`<${Invites} target=${{ chat: chat.id }} />`}${tab === 'reqs' && html`<${CsReqs} chat=${chat} />`}${tab === 'mod' && html`<${CsMod} chat=${chat} />`}${tab === 'stats' && html`<${CsStats} chat=${chat} />`}${tab === 'audit' && html`<${AuditLog} load=${() => rpc('chat.audit', { id: chat.id })} />`}${tab === 'tools' && html`<${CsTools} chat=${chat} onClose=${() => closeModal(id)} />`}<//>`;
}
function CsMain({ chat }) {
  const ch = chat.type === 'channel', [f, setF] = useState({ title: chat.title, about: chat.about || '', rules: chat.rules || '', pub: !!chat.pub, username: chat.username || '', slow: chat.slow || 0, sign: !!chat.sign, price: chat.price || 0, approval: !!chat.approval, rss: (chat.rss || []).map(r => r.url).join('\n') }), set = p => setF(s => ({ ...s, ...p }));
  const save = async () => { const r = await call('chat.update', { id: chat.id, title: f.title, about: f.about, rules: f.rules, pub: f.pub, username: f.pub ? f.username : '', slow: +f.slow, approval: f.approval, ...(ch ? { sign: f.sign, price: +f.price, rss: f.rss.split('\n').map(s => s.trim()).filter(Boolean) } : {}) }); if (r) toast('Сохранено'); };
  return html`<div class="form"><div class="row top"><button class="ava-pick" onClick=${async () => { const u = await uploadAvatar(); if (u) call('chat.update', { id: chat.id, avatar: u }); }} title="Сменить аватар">${chat.avatar ? html`<img src=${chat.avatar} alt="" />` : html`<${Icon} n="camera" s=${24} />`}</button><div class="grow"><label class="fld"><span>Название</span><input maxlength="100" value=${f.title} onInput=${e => set({ title: e.target.value })} /></label></div></div>
    <label class="fld"><span>Описание</span><textarea rows="2" maxlength="500" value=${f.about} onInput=${e => set({ about: e.target.value })}></textarea></label>
    <label class="fld"><span>Правила</span><textarea rows="3" maxlength="2000" value=${f.rules} placeholder="1. Не одеваться без спроса. 2. Не спамить." onInput=${e => set({ rules: e.target.value })}></textarea></label>
    <${Toggle} label="Публичный" hint="Виден в поиске, вход по ссылке @username" on=${f.pub} onChange=${v => set({ pub: v })} />
    ${f.pub && html`<label class="fld"><span>Ссылка @</span><input maxlength="32" value=${f.username} onInput=${e => set({ username: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })} /></label>`}
    <${Toggle} label="Вступление по заявкам" hint="Админы одобряют каждого вручную" on=${f.approval} onChange=${v => set({ approval: v })} />
    ${!ch && html`<label class="fld"><span>Медленный режим</span><select value=${f.slow} onChange=${e => set({ slow: e.target.value })}>${[[0, 'Выключен'], [5, '5 секунд'], [15, '15 секунд'], [60, '1 минута'], [300, '5 минут'], [3600, '1 час']].map(([v, l]) => html`<option value=${v}>${l}</option>`)}</select></label>`}
    ${ch && html`<${Toggle} label="Подписывать посты" hint="Имя автора под каждым постом" on=${f.sign} onChange=${v => set({ sign: v })} />
      <label class="fld"><span>Платная подписка, 🍃 в месяц (0 — бесплатно)</span><input type="number" min="0" max="100000" value=${f.price} onInput=${e => set({ price: e.target.value })} /></label>
      <label class="fld"><span>Автопостинг: ленты RSS и каналы YouTube (по одной ссылке в строке, до 8)</span><textarea rows="4" value=${f.rss} placeholder=${"https://example.com/feed.xml\nhttps://www.youtube.com/@имя_канала"} onInput=${e => set({ rss: e.target.value })}></textarea></label>`}
    <button class="btn" onClick=${save}>Сохранить</button></div>`;
}
function CsPerms({ chat }) {
  const p = chat.perms || {}, set = (k, v) => call('chat.update', { id: chat.id, perms: { ...p, [k]: v } });
  return html`<div class="form"><p class="hint">Что могут обычные участники. Админы и модераторы настраиваются ролями в списке участников.</p>
    <${Toggle} label="Писать сообщения" on=${p.send !== false} onChange=${v => set('send', v)} /><${Toggle} label="Приглашать людей" on=${!!p.invite} onChange=${v => set('invite', v)} /><${Toggle} label="Закреплять сообщения" on=${!!p.pin} onChange=${v => set('pin', v)} /><${Toggle} label="Менять название и аватар" on=${!!p.info} onChange=${v => set('info', v)} /></div>`;
}
export function Invites({ target }) {
  const [d, setD] = useState(null), [f, setF] = useState({ ttl: 0, max: 0 }), s = target.server && S.servers[target.server], [role, setRole] = useState('');
  const load = () => rpc('invite.list', target).then(setD).catch(e => { toast(e.message, 'err'); setD([]); });
  useEffect(() => { load(); }, []);
  const make = async () => { const r = await call('invite.new', { ...target, ttl: +f.ttl || undefined, max: +f.max || undefined, role: role || undefined }); if (r) { copyText(link('join=' + r.code)); toast('Ссылка создана и скопирована'); load(); } };
  return html`<div class="form"><div class="row wrap"><label class="fld grow"><span>Срок действия</span><select value=${f.ttl} onChange=${e => setF({ ...f, ttl: e.target.value })}><option value="0">Бессрочно</option><option value="1800">30 минут</option><option value="3600">1 час</option><option value="86400">1 день</option><option value="604800">7 дней</option></select></label><label class="fld grow"><span>Лимит использований</span><select value=${f.max} onChange=${e => setF({ ...f, max: e.target.value })}><option value="0">Без лимита</option><option value="1">1</option><option value="5">5</option><option value="25">25</option><option value="100">100</option></select></label>
      ${s && html`<label class="fld grow"><span>Роль при входе</span><select value=${role} onChange=${e => setRole(e.target.value)}><option value="">Без роли</option>${s.roles.filter(r => r.id !== 'everyone' && !r.perms.admin).map(r => html`<option value=${r.id}>${r.name}</option>`)}</select></label>`}</div>
    <button class="btn" onClick=${make}><${Icon} n="link" s=${16} /> Создать ссылку-приглашение</button>
    ${!d ? html`<${Spinner} />` : !d.length ? html`<p class="hint">Активных приглашений нет.</p>` : d.map(i => html`<div class="row-item"><div class="ri-m"><b class="mono">${link('join=' + i.code)}</b><span>использований: ${i.uses || 0}${i.max ? ' из ' + i.max : ''} · ${i.exp ? 'до ' + fmtFull(i.exp) : 'бессрочно'}${i.role && s ? ' · роль ' + ((s.roles.find(r => r.id === i.role) || {}).name || '') : ''}</span></div><button class="ib sm" title="Копировать" onClick=${() => { copyText(link('join=' + i.code)); toast('Скопировано'); }}><${Icon} n="copy" s=${17} /></button><button class="ib sm" title="QR-код" onClick=${() => openModal(QrModal, { title: 'QR приглашения', text: link('join=' + i.code), hint: 'Сканируйте, чтобы вступить' })}><${Icon} n="qr-code" s=${17} /></button><button class="ib sm" title="Отозвать" onClick=${async () => { await call('invite.del', { code: i.code }); load(); }}><${Icon} n="trash-2" s=${17} /></button></div>`)}</div>`;
}
function CsReqs({ chat }) {
  const [d, setD] = useState(null), load = () => rpc('chat.requests', { id: chat.id }).then(setD).catch(() => setD([]));
  useEffect(() => { load(); }, [chat.reqs]);
  const ans = async (u, ok) => { await call('chat.request', { id: chat.id, user: u.id, ok }); load(); };
  return html`<div class="form">${!d ? html`<${Spinner} />` : !d.length ? html`<${Empty} icon="user-check" title="Заявок нет" text="Никто не ломится. Пока." />` : d.map(u => html`<div class="row-item"><${Avatar} src=${u.avatar} name=${userName(u)} color=${u.color} s=${36} onClick=${() => showProfile(u.id)} /><div class="ri-m"><b>${userName(u)}</b><span>${u.username ? '@' + u.username : ''}</span></div><button class="btn sm" onClick=${() => ans(u, true)}>Принять</button><button class="btn sm ghost" onClick=${() => ans(u, false)}>Отклонить</button></div>`)}</div>`;
}
function CsMod({ chat }) {
  const a = chat.automod || {}, [words, setWords] = useState((a.words || []).join(', ')), [flood, setFlood] = useState(!!a.flood), [links, setLinks] = useState(!!a.links), [cap, setCap] = useState(!!chat.captcha);
  const save = async () => { const r = await call('chat.update', { id: chat.id, captcha: cap, automod: { words: words.split(/[,\n]/).map(s => s.trim()).filter(Boolean), flood, links } }); if (r) toast('Автомодерация настроена'); };
  return html`<div class="form"><label class="fld"><span>Стоп-слова через запятую</span><textarea rows="3" value=${words} placeholder="крипта, казино, одежда" onInput=${e => setWords(e.target.value)}></textarea></label>
    <${Toggle} label="Антифлуд" hint="Не больше 5 сообщений за 5 секунд" on=${flood} onChange=${setFlood} /><${Toggle} label="Запретить ссылки" on=${links} onChange=${setLinks} />
    ${chat.type === 'group' && html`<${Toggle} label="Капча для новичков" hint="Бот попросит найти фиговый листок среди носков" on=${cap} onChange=${setCap} />`}
    <p class="hint">Админов и модераторов автомодерация не трогает. Срабатывания пишутся в журнал.</p><button class="btn" onClick=${save}>Сохранить</button></div>`;
}
function CsStats({ chat }) {
  const [d, setD] = useState(null); useEffect(() => { rpc('chat.stats', { id: chat.id }).then(setD).catch(e => toast(e.message, 'err')); }, []);
  if (!d) return html`<${Spinner} />`; const max = Math.max(1, ...d.days.map(x => Math.max(x.posts, x.joins)));
  return html`<div class="form"><div class="kpis"><div><b>${fmtNum(d.members)}</b><span>${chat.type === 'channel' ? 'подписчиков' : 'участников'}</span></div><div><b>${fmtNum(d.posts)}</b><span>сообщений</span></div><div><b>${d.avgViews}</b><span>просмотров на пост</span></div><div><b>${d.er}%</b><span>вовлечённость</span></div><div><b>${d.clicks}</b><span>кликов по кнопкам</span></div></div>
    <h5>Последние 14 дней: посты и вступления</h5><div class="bars">${d.days.map(x => html`<div title=${`${x.d}: постов ${x.posts}, вступлений ${x.joins}`}><i style=${`height:${x.posts / max * 100}%`}></i><i class="b2" style=${`height:${x.joins / max * 100}%`}></i><small>${x.d.slice(8)}</small></div>`)}</div>
    <h5>Лучшее за последнее время</h5>${d.top.length ? d.top.map(m => html`<button class="row-item click" onClick=${() => openChat(chat.id, { jump: m.id })}><div class="ri-m"><b>${m.text}</b><span><${Icon} n="eye" s=${12} /> ${m.views} · реакций ${m.rx || 0}</span></div></button>`) : html`<p class="hint">Пока нечем гордиться.</p>`}</div>`;
}
export function AuditLog({ load }) {
  const [d, setD] = useState(null); useEffect(() => { load().then(r => { addUsers(r.users); setD(r.log); }).catch(e => { toast(e.message, 'err'); setD([]); }); }, []);
  return html`<div class="form">${!d ? html`<${Spinner} />` : !d.length ? html`<${Empty} icon="scroll-text" title="Журнал пуст" text="Никто ничего не натворил. Подозрительно." />` : html`<div class="audit">${d.map(a => html`<div><time>${fmtFull(a.ts)}</time><b>${userName(S.users[a.by])}</b><code class="mono">${a.act}</code><span>${a.info || ''}</span></div>`)}</div>`}</div>`;
}
function CsTools({ chat, onClose }) {
  const [f, setF] = useState({ q: '', hours: '' });
  const purge = async () => { if (!f.q && !f.hours) return toast('Задайте фильтр: слово или период'); if (!(await confirmDlg({ title: 'Массовое удаление', text: `Удалить все сообщения${f.q ? ' со словом «' + f.q + '»' : ''}${f.hours ? ' за последние ' + f.hours + ' ч' : ''}? Отменить нельзя.`, ok: 'Удалить', danger: true }))) return; const r = await call('chat.purge', { id: chat.id, q: f.q, hours: +f.hours || undefined }); if (r) toast(`Удалено сообщений: ${r.n}`); };
  const wave = async () => { const ids = await pickUsers({ title: 'Волна банов: кого выгоняем', multi: true, ok: 'Забанить' }); if (!ids) return; const r = await call('chat.kick', { id: chat.id, users: ids, ban: true, purge: true }); if (r) toast(`Забанено: ${r.n}`); };
  return html`<div class="form"><h5>Удаление по фильтру</h5><div class="row wrap"><label class="fld grow"><span>Содержит текст</span><input value=${f.q} onInput=${e => setF({ ...f, q: e.target.value })} /></label><label class="fld"><span>За последние, часов</span><input type="number" min="1" value=${f.hours} onInput=${e => setF({ ...f, hours: e.target.value })} /></label></div><button class="btn danger" onClick=${purge}><${Icon} n="eraser" s=${16} /> Удалить подходящие</button>
    <h5>Волна банов</h5><p class="hint">Выберите нескольких — забаним разом и вычистим их сообщения.</p><button class="btn danger" onClick=${wave}><${Icon} n="gavel" s=${16} /> Выбрать и забанить</button>
    ${chat.role === 'owner' && html`<h5>Опасная зона</h5><button class="btn danger" onClick=${async () => { const v = await promptDlg({ title: 'Удалить навсегда?', label: `Введите название «${chat.title}» для подтверждения`, ok: 'Удалить' }); if (v === chat.title) { await call('chat.delete', { id: chat.id }); onClose(); } else if (v !== null) toast('Название не совпало. Чат спасён.'); }}><${Icon} n="trash-2" s=${16} /> Удалить ${chat.type === 'channel' ? 'канал' : 'группу'}</button>`}</div>`;
}
