// «Вышка спасателя» — отдельное приложение владельца сервиса. Работает через тот же WebSocket RPC (методы admin.*).
import { html, render, useState, useEffect, useRef } from '/vendor/preact.js';
import { ICONS } from './icons.js';

const LS = 'nudist.token';
const getToken = () => { try { return JSON.parse(localStorage.getItem(LS)); } catch (e) { return null; } };
const RANK = { viewer: 1, moderator: 2, admin: 3, superadmin: 4 };
const ROLE_NAMES = { viewer: 'Наблюдатель', moderator: 'Модератор', admin: 'Админ', superadmin: 'Суперадмин' };
const FLAG_NAMES = { registration: ['Регистрация', 'Новые аккаунты. Выключите — и пляж станет закрытым.'], phoneAuth: ['Вход по телефону', 'Демо-SMS: код показывается на экране.'], stories: ['Истории', 'Кружочки с жизнью на 24 часа.'], calls: ['Звонки и голосовые каналы', 'WebRTC, mesh до 12 человек.'], bots: ['Боты и Bot API', 'Включая @botbatya и вебхуки.'], stars: ['Листики', 'Внутренняя валюта, премиум и бусты.'], linkPreview: ['Превью ссылок', 'Сервер ходит по ссылкам за заголовком и картинкой.'], discovery: ['Каталог серверов', 'Публичные серверы в «Обзоре».'], uploads: ['Загрузка файлов', 'Фото, видео, голосовые, документы.'] };
const REASONS = { spam: 'Спам', abuse: 'Оскорбления', nsfw: 'Слишком голо', scam: 'Мошенничество', violence: 'Насилие', other: 'Другое' };

const Icon = ({ n, s = 18 }) => html`<svg class="ic" width=${s} height=${s} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" dangerouslySetInnerHTML=${{ __html: ICONS[n] || '' }}></svg>`;
const fmtDate = t => t ? new Date(t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
const fmtSize = b => b > 1e9 ? (b / 1e9).toFixed(1) + ' ГБ' : b > 1e6 ? (b / 1e6).toFixed(1) + ' МБ' : b > 1e3 ? (b / 1e3).toFixed(0) + ' КБ' : (b || 0) + ' Б';
const fmtUp = s => s > 86400 ? Math.floor(s / 86400) + ' д ' + Math.floor(s % 86400 / 3600) + ' ч' : s > 3600 ? Math.floor(s / 3600) + ' ч ' + Math.floor(s % 3600 / 60) + ' мин' : Math.floor(s / 60) + ' мин ' + s % 60 + ' с';
const num = n => (n || 0).toLocaleString('ru-RU');

// ───── транспорт
let ws, seq = 0, ready; const pend = new Map(); let onDead = () => {};
function connect(token) {
  ready = new Promise((ok, no) => {
    ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws?token=' + encodeURIComponent(token));
    ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (x) { return; }
      if (m.ev === 'init') ok(m.d); else if (m.ev === 'session.killed') { no(new Error('Сессия недействительна')); onDead(); }
      else if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.e ? p.no(new Error(m.e)) : p.ok(m.r); } };
    ws.onclose = () => { for (const p of pend.values()) p.no(new Error('Соединение потеряно')); pend.clear(); no(new Error('Соединение потеряно')); onDead(true); };
  });
  return ready;
}
const rpc = (m, p = {}) => new Promise((ok, no) => { if (!ws || ws.readyState !== 1) return no(new Error('Нет соединения')); const id = ++seq; pend.set(id, { ok, no }); ws.send(JSON.stringify({ id, m, p })); });

let setToast = () => {};
const toast = (text, err) => setToast({ text, err, k: Date.now() });
const run = async (fn, okText) => { try { const r = await fn(); if (okText) toast(okText); return r === undefined ? true : r; } catch (e) { toast(e.message, true); return null; } };
function useLoad(fn, deps = [], every) {
  const [d, setD] = useState(null), [n, setN] = useState(0);
  useEffect(() => { let live = true; fn().then(r => live && setD(r)).catch(e => live && toast(e.message, true)); return () => { live = false; }; }, [...deps, n]);
  useEffect(() => { if (!every) return; const t = setInterval(() => setN(x => x + 1), every); return () => clearInterval(t); }, []);
  return [d, () => setN(x => x + 1)];
}
const Spin = () => html`<div class="spin" role="status" aria-label="Загрузка"></div>`;
const Bars = ({ days, k, cls }) => { const max = Math.max(1, ...days.map(d => d[k])); return html`<div class="abars">${days.map(d => html`<div title=${d.d + ': ' + d[k]}><i class=${cls} style=${`height:${Math.max(2, d[k] / max * 100)}%`}></i><small>${d.d.slice(8)}</small></div>`)}</div>`; };

// ───── вход
function Login({ onToken, note }) {
  const [u, setU] = useState(''), [p, setP] = useState(''), [t, setT] = useState(''), [need, setNeed] = useState(false), [err, setErr] = useState(note || ''), [busy, setBusy] = useState(false);
  const go = async e => { e.preventDefault(); setBusy(true); setErr('');
    try { const r = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: u.trim().replace(/^@/, ''), password: p, totp: t.trim() || undefined }) }); const j = await r.json();
      if (j.need === 'totp') { setNeed(true); setErr(need ? 'Код не подошёл' : ''); } else if (j.token) { localStorage.setItem(LS, JSON.stringify(j.token)); onToken(j.token); } else setErr(j.error || 'Не получилось войти'); }
    catch (x) { setErr('Сервер не отвечает'); }
    setBusy(false); };
  return html`<div class="alogin"><form class="acard" onSubmit=${go}>
    <h1><${Icon} n="life-buoy" s=${26} /> Вышка спасателя</h1>
    <p class="hint">Админ-панель «Нудиста». Вход — тем же аккаунтом, что и в мессенджере, но только если у него есть роль персонала.</p>
    <label class="fld"><span>Username</span><input value=${u} onInput=${e => setU(e.target.value)} autocomplete="username" autofocus required /></label>
    <label class="fld"><span>Пароль</span><input type="password" value=${p} onInput=${e => setP(e.target.value)} autocomplete="current-password" required /></label>
    ${need && html`<label class="fld"><span>Код из приложения-аутентификатора (или резервный)</span><input value=${t} onInput=${e => setT(e.target.value)} inputmode="numeric" autocomplete="one-time-code" autofocus /></label>`}
    ${err && html`<p class="err">${err}</p>`}
    <button class="btn wide" disabled=${busy}>${busy ? 'Проверяем пропуск…' : 'Подняться на вышку'}</button>
    <a href="/" class="back">← в мессенджер</a></form></div>`;
}

// ───── разделы
function Dash() {
  const [s] = useLoad(() => rpc('admin.stats'), [], 15000);
  if (!s) return html`<${Spin} />`;
  const K = (v, l, i) => html`<div class="kpi"><${Icon} n=${i} /><b>${v}</b><span>${l}</span></div>`;
  return html`<div>
    <div class="akpis">${K(num(s.online), 'сейчас онлайн', 'wifi')}${K(num(s.dau), 'DAU — сегодня', 'sun')}${K(num(s.wau), 'WAU — за неделю', 'calendar')}${K(num(s.mau), 'MAU — за месяц', 'calendar-days')}${K(num(s.users), 'людей всего', 'users')}${K(num(s.bots), 'ботов', 'bot')}${K(num(s.msgsToday), 'сообщений сегодня', 'message-circle')}${K(num(s.msgs), 'сообщений всего', 'messages-square')}</div>
    <div class="acols"><section class="apanel"><h3>Активные пользователи, 14 дней</h3><${Bars} days=${s.days} k="dau" /></section>
      <section class="apanel"><h3>Сообщения, 14 дней</h3><${Bars} days=${s.days} k="msgs" cls="b2" /></section>
      <section class="apanel"><h3>Регистрации, 14 дней</h3><${Bars} days=${s.days} k="regs" cls="b3" /></section></div>
    <div class="akpis small">${K(num(s.groups), 'групп', 'users-round')}${K(num(s.channels), 'каналов', 'megaphone')}${K(num(s.servers), 'серверов', 'server')}${K(num(s.dms), 'личных чатов', 'user')}${K(num(s.secrets), 'секретных', 'lock')}${K(num(s.stories), 'историй за сутки', 'circle-dashed')}${K(num(s.premium), 'с премиумом', 'crown')}${K(num(s.starsTotal) + ' 🍃', 'листиков в обороте', 'leaf')}${K(num(s.banned), 'забанено', 'ban')}${K(num(s.reportsOpen), 'жалоб в очереди', 'flag')}${K(fmtSize(s.uploads), num(s.uploadFiles) + ' файлов', 'hard-drive')}</div></div>`;
}

function Users({ role }) {
  const [q, setQ] = useState(''), [f, setF] = useState(''), [off, setOff] = useState(0), [sel, setSel] = useState(null);
  const [d, reload] = useLoad(() => rpc('admin.users', { q, filter: f, offset: off }), [q, f, off]);
  const can = r => RANK[role] >= RANK[r];
  const act = async (fn, ok) => { if (await run(fn, ok)) { reload(); } };
  const u = sel && d && d.users.find(x => x.id === sel);
  return html`<div>
    <div class="abar"><div class="asearch"><${Icon} n="search" s=${16} /><input placeholder="Имя, @username, телефон или id" value=${q} onInput=${e => { setQ(e.target.value); setOff(0); }} /></div>
      <select value=${f} onChange=${e => { setF(e.target.value); setOff(0); }} aria-label="Фильтр"><option value="">Все</option><option value="online">Онлайн</option><option value="banned">Забаненные</option><option value="premium">Премиум</option><option value="staff">Персонал</option><option value="bots">Боты</option></select>
      <span class="hint">${d ? num(d.total) + ' найдено' : ''}</span></div>
    ${!d ? html`<${Spin} />` : html`<div class="atable-wrap"><table class="atable"><thead><tr><th>Пользователь</th><th>Статус</th><th>Был(а)</th><th>Сессии</th><th>Чаты</th><th>🍃</th><th>Регистрация</th></tr></thead><tbody>
      ${d.users.map(x => html`<tr class=${sel === x.id ? 'on' : ''} onClick=${() => setSel(sel === x.id ? null : x.id)} tabindex="0" onKeyDown=${e => e.key === 'Enter' && setSel(x.id)}>
        <td><b>${x.name}</b> ${x.bot && html`<i class="tg">бот</i>`}${x.admin && html`<i class="tg st">${ROLE_NAMES[x.admin]}</i>`}${x.premiumUntil > Date.now() && html`<i class="tg pr">премиум</i>`}<small>${x.username ? '@' + x.username : x.id}${x.phone ? ' · ' + x.phone : ''}</small></td>
        <td>${x.banned ? html`<i class="tg bad">бан</i>` : x.muted ? html`<i class="tg warn">мут</i>` : x.online ? html`<i class="tg ok">онлайн</i>` : html`<span class="dim">—</span>`}</td>
        <td>${fmtDate(x.seen)}</td><td>${x.sessions}${x.totp ? ' · 2FA' : ''}</td><td>${x.chats}${x.servers ? ' + ' + x.servers + ' срв' : ''}</td><td>${num(x.stars)}</td><td>${fmtDate(x.created)}</td></tr>`)}
      ${!d.users.length && html`<tr><td colspan="7" class="dim">Никого. Пляж пуст.</td></tr>`}</tbody></table></div>
      <div class="abar"><button class="btn ghost sm" disabled=${!off} onClick=${() => setOff(Math.max(0, off - 50))}>← Назад</button><span class="hint">${off + 1}–${Math.min(off + 50, d.total)} из ${d.total}</span><button class="btn ghost sm" disabled=${off + 50 >= d.total} onClick=${() => setOff(off + 50)}>Дальше →</button></div>`}
    ${u && html`<aside class="adrawer" role="dialog" aria-label="Карточка пользователя"><header><b>${u.name}</b><button class="ib" onClick=${() => setSel(null)} aria-label="Закрыть"><${Icon} n="x" /></button></header>
      <dl><dt>ID</dt><dd><code>${u.id}</code></dd><dt>Username</dt><dd>${u.username ? '@' + u.username : '—'}</dd><dt>Телефон</dt><dd>${u.phone || '—'}</dd><dt>Последний IP</dt><dd>${u.ip || '—'}</dd><dt>Активных сессий</dt><dd>${u.sessions}</dd><dt>2FA</dt><dd>${u.totp ? 'включена' : 'нет'}</dd><dt>Бейджи</dt><dd>${u.badges.join(', ') || '—'}</dd><dt>Премиум</dt><dd>${u.premiumUntil > Date.now() ? 'до ' + fmtDate(u.premiumUntil) : 'нет'}</dd>${u.banned && html`<dt>Причина бана</dt><dd>${u.banReason || 'не указана'}</dd>`}${u.muted ? html`<dt>Мут до</dt><dd>${fmtDate(u.muted)}</dd>` : null}${u.owner && html`<dt>Владелец бота</dt><dd><code>${u.owner}</code></dd>`}</dl>
      ${can('moderator') ? html`<h4>Модерация</h4><div class="acts">
        <button class=${'btn sm ' + (u.banned ? 'ghost' : 'danger')} onClick=${() => { const reason = u.banned ? '' : prompt('Причина бана (увидит только персонал):', 'нарушение правил пляжа'); if (!u.banned && reason === null) return; act(() => rpc('admin.user.ban', { id: u.id, on: !u.banned, reason }), u.banned ? 'Разбанен. Листок возвращён.' : 'Забанен, все сессии завершены'); }}>${u.banned ? 'Разбанить' : 'Забанить'}</button>
        <button class="btn sm ghost" onClick=${() => act(() => rpc('admin.user.mute', { id: u.id, hours: u.muted ? 0 : 24 }), u.muted ? 'Мут снят' : 'Мут на 24 часа')}>${u.muted ? 'Снять мут' : 'Мут на 24 ч'}</button>
        <button class="btn sm ghost" onClick=${() => act(() => rpc('admin.user.logout', { id: u.id }), 'Все сессии завершены')}>Разлогинить везде</button></div>` : html`<p class="hint">Роль «Наблюдатель» только смотрит. Руками не трогать.</p>`}
      ${can('admin') && html`<h4>Аккаунт</h4><div class="acts">
        ${['verified', 'developer', 'staff'].map(b => html`<button class=${'btn sm ' + (u.badges.includes(b) ? '' : 'ghost')} onClick=${() => act(() => rpc('admin.user.set', { id: u.id, badges: u.badges.includes(b) ? u.badges.filter(x => x !== b) : [...u.badges.filter(x => ['verified', 'developer', 'staff'].includes(x)), b] }), 'Бейджи обновлены')}>${{ verified: '✔ Верификация', developer: '🛠 Разработчик', staff: '🛟 Персонал' }[b]}</button>`)}
        <button class="btn sm ghost" onClick=${() => { const v = prompt('Премиум на сколько дней? 0 — снять.', '30'); if (v !== null) act(() => rpc('admin.user.set', { id: u.id, premiumDays: +v || 0 }), 'Премиум обновлён'); }}>Премиум…</button>
        <button class="btn sm ghost" onClick=${() => { const v = prompt('Баланс листиков:', u.stars); if (v !== null) act(() => rpc('admin.user.set', { id: u.id, stars: +v || 0 }), 'Баланс обновлён'); }}>Листики…</button>
        ${u.bot && html`<button class="btn sm ghost" onClick=${() => act(() => rpc('admin.user.set', { id: u.id, listed: true }), 'Бот добавлен в каталог')}>В каталог ботов</button>`}</div>`}
      ${can('superadmin') && !u.bot && html`<h4>Роль в админке (RBAC)</h4><div class="acts"><select value=${u.admin || ''} onChange=${e => act(() => rpc('admin.user.set', { id: u.id, admin: e.target.value || null }), 'Роль изменена')}><option value="">Нет доступа</option>${Object.keys(ROLE_NAMES).map(r => html`<option value=${r}>${ROLE_NAMES[r]}</option>`)}</select></div>`}</aside>`}</div>`;
}

function Reports() {
  const [st, setSt] = useState('open'); const [d, reload] = useLoad(() => rpc('admin.reports', { status: st }), [st]);
  const res = async (r, action) => { const note = action === 'dismiss' ? '' : prompt('Комментарий к решению (необязательно):', '') ; if (note === null) return; if (await run(() => rpc('admin.report.resolve', { id: r.id, action, note }), { dismiss: 'Отклонено', delete: 'Сообщение удалено', ban: 'Нарушитель забанен', mute: 'Мут на сутки' }[action])) reload(); };
  return html`<div><div class="abar"><div class="aseg">${[['open', 'В очереди'], ['resolved', 'Закрытые'], ['all', 'Все']].map(([k, l]) => html`<button class=${st === k ? 'on' : ''} onClick=${() => setSt(k)}>${l}</button>`)}</div></div>
    ${!d ? html`<${Spin} />` : !d.length ? html`<div class="aempty"><${Icon} n="party-popper" s=${34} /><b>Жалоб нет</b><p>Все ведут себя прилично. Подозрительно прилично.</p></div>` : html`<div class="areports">${d.map(r => html`<article class="apanel">
      <header><i class="tg warn">${REASONS[r.reason] || r.reason}</i><b>${{ user: 'На пользователя', msg: 'На сообщение', chat: 'На чат', server: 'На сервер' }[r.type]}: ${r.targetName || r.target}</b><time>${fmtDate(r.ts)}</time></header>
      ${r.snap && html`<blockquote>${r.snap.text || '[' + r.snap.type + ']'}${r.snap.media && html` <a href=${r.snap.media} target="_blank" rel="noopener">вложение</a>`}</blockquote>`}
      ${r.text && html`<p>«${r.text}»</p>`}
      <small>Пожаловался: ${r.byName}${r.chatTitle ? ' · чат «' + r.chatTitle + '»' : ''}</small>
      ${r.status === 'open' ? html`<div class="acts"><button class="btn sm ghost" onClick=${() => res(r, 'dismiss')}>Отклонить</button>${r.type === 'msg' && html`<button class="btn sm ghost" onClick=${() => res(r, 'delete')}>Удалить сообщение</button>`}${(r.type === 'msg' || r.type === 'user') && html`<button class="btn sm ghost" onClick=${() => res(r, 'mute')}>Мут 24 ч</button><button class="btn sm danger" onClick=${() => res(r, 'ban')}>Забанить</button>`}</div>`
        : html`<small class="dim">Решение: ${{ dismiss: 'отклонено', delete: 'сообщение удалено', ban: 'бан', mute: 'мут' }[r.resolution]} · ${r.resolvedByName} · ${fmtDate(r.resolvedAt)}${r.note ? ' · ' + r.note : ''}</small>`}</article>`)}</div>`}</div>`;
}

function Chats({ role }) {
  const [q, setQ] = useState(''); const [d, reload] = useLoad(() => rpc('admin.chats', { q }), [q]); const can = RANK[role] >= RANK.admin;
  return html`<div><div class="abar"><div class="asearch"><${Icon} n="search" s=${16} /><input placeholder="Название или @username" value=${q} onInput=${e => setQ(e.target.value)} /></div></div>
    ${!d ? html`<${Spin} />` : html`<div class="atable-wrap"><table class="atable"><thead><tr><th>Сообщество</th><th>Тип</th><th>Участники</th><th>Сообщения</th><th>Создано</th><th></th></tr></thead><tbody>${d.map(x => html`<tr>
      <td><b>${x.title}</b> ${x.verified && html`<i class="tg ok">✔</i>`}<small>${x.username ? '@' + x.username : x.id}${x.boosts ? ' · 🚀 ' + x.boosts : ''}</small></td><td>${{ server: 'сервер', group: 'группа', channel: 'канал' }[x.kind]}${x.pub ? ' · публичный' : ''}</td><td>${num(x.members)}</td><td>${num(x.msgs)}</td><td>${fmtDate(x.created)}</td>
      <td class="r">${can && html`<button class="btn sm ghost" onClick=${async () => { if (await run(() => rpc('admin.chat.set', { kind: x.kind, id: x.id, verified: !x.verified }), x.verified ? 'Галочка снята' : 'Верифицировано')) reload(); }}>${x.verified ? 'Снять галочку' : 'Верифицировать'}</button> <button class="btn sm danger" onClick=${async () => { if (confirm(`Удалить «${x.title}» глобально? Это навсегда, и это увидят все участники.`) && await run(() => rpc('admin.chat.set', { kind: x.kind, id: x.id, del: true }), 'Удалено')) reload(); }}>Снести</button>`}</td></tr>`)}
      ${!d.length && html`<tr><td colspan="6" class="dim">Ничего не нашлось.</td></tr>`}</tbody></table></div>`}</div>`;
}

function Monitor() {
  const [m] = useLoad(() => rpc('admin.monitor'), [], 5000);
  if (!m) return html`<${Spin} />`;
  const max = Math.max(1, ...m.rpcPerMin);
  return html`<div><div class="akpis">${[[fmtUp(m.uptime), 'аптайм', 'timer'], [m.connections, 'WS-соединений', 'plug'], [m.voiceRooms + ' / ' + m.voicePeers, 'голосовых комнат / участников', 'headphones'], [num(m.rpcTotal), 'RPC-запросов', 'activity'], [num(m.rpcErrors), 'ошибок RPC', 'triangle-alert'], [fmtSize(m.rss), 'память процесса', 'cpu'], [m.load.map(x => x.toFixed(2)).join(' · '), 'load average (' + m.cpus + ' CPU)', 'gauge'], [fmtSize(m.dbSize), 'база данных', 'database']].map(([v, l, i]) => html`<div class="kpi"><${Icon} n=${i} /><b>${v}</b><span>${l}</span></div>`)}</div>
    <div class="acols"><section class="apanel"><h3>Нагрузка: RPC в минуту (последние 30 мин)</h3><div class="abars thin">${m.rpcPerMin.map(v => html`<div title=${v}><i style=${`height:${Math.max(2, v / max * 100)}%`}></i></div>`)}${!m.rpcPerMin.length && html`<p class="dim">Данные копятся…</p>`}</div><p class="hint">${m.node} · отложенных сообщений в очереди: ${m.scheduled}</p></section>
      <section class="apanel"><h3>Компоненты</h3><ul class="comps">${m.components.map(c => html`<li><i class=${c.ok ? 'dot ok' : 'dot off'}></i><b>${c.name}</b><span>${c.note}</span></li>`)}</ul><p class="hint">Серым помечено то, чего в этой сборке честно нет: один процесс Node.js вместо кластера с Kafka и SFU.</p></section></div></div>`;
}

function Flags({ role }) {
  const [f, reload] = useLoad(() => rpc('admin.flags')); const can = RANK[role] >= RANK.admin; const [text, setText] = useState('');
  if (!f) return html`<${Spin} />`;
  return html`<div class="acols"><section class="apanel"><h3>Фича-флаги</h3><p class="hint">Переключаются на лету, без перезапуска: клиенты узнают об изменении мгновенно.</p>
    ${Object.keys(f).map(k => html`<label class="aflag"><span><b>${(FLAG_NAMES[k] || [k])[0]}</b><small>${(FLAG_NAMES[k] || [])[1] || k}</small></span><input type="checkbox" role="switch" checked=${f[k]} disabled=${!can} onChange=${async e => { await run(() => rpc('admin.flags', { set: { [k]: e.target.checked } }), `${(FLAG_NAMES[k] || [k])[0]}: ${e.target.checked ? 'включено' : 'выключено'}`); reload(); }} /></label>`)}</section>
    <section class="apanel"><h3>Объявление всем</h3><p class="hint">Придёт каждому в личку от бота @nudist. Единственный вид «рекламы» в сервисе — пользуйтесь совестливо.</p>
      <textarea rows="5" maxlength="2000" placeholder="Завтра с 3:00 до 3:05 технические работы: меняем песок." value=${text} onInput=${e => setText(e.target.value)} disabled=${!can}></textarea>
      <button class="btn" disabled=${!can || !text.trim()} onClick=${async () => { if (!confirm('Разослать объявление всем пользователям?')) return; const r = await run(() => rpc('admin.broadcast', { text })); if (r) { toast('Отправлено: ' + r.n); setText(''); } }}><${Icon} n="megaphone" s=${16} /> Разослать</button>
      <h3 class="mt">Премиум и листики</h3><p class="hint">Премиум, баланс и бейджи выдаются в карточке пользователя (раздел «Пользователи»). Цены: премиум — 500 🍃 на 30 дней, буст сервера — 200 🍃.</p></section></div>`;
}

function Audit() {
  const [d] = useLoad(() => rpc('admin.audit')); const [q, setQ] = useState('');
  if (!d) return html`<${Spin} />`;
  const l = d.filter(a => !q || (a.act + ' ' + a.byName + ' ' + (a.d || '')).toLowerCase().includes(q.toLowerCase()));
  return html`<div><div class="abar"><div class="asearch"><${Icon} n="search" s=${16} /><input placeholder="Действие, админ или детали" value=${q} onInput=${e => setQ(e.target.value)} /></div><span class="hint">последние ${d.length} записей</span></div>
    <div class="atable-wrap"><table class="atable"><thead><tr><th>Когда</th><th>Кто</th><th>Действие</th><th>Детали</th></tr></thead><tbody>${l.map(a => html`<tr><td>${fmtDate(a.ts)}</td><td><b>${a.byName}</b></td><td><code>${a.act}</code></td><td>${a.d || ''}</td></tr>`)}${!l.length && html`<tr><td colspan="4" class="dim">Пусто. Никто ничего не трогал.</td></tr>`}</tbody></table></div></div>`;
}

function Api() {
  const [d, setD] = useState(null), [fresh, setFresh] = useState(null);
  useEffect(() => { rpc('admin.apikeys').then(setD).catch(e => toast(e.message, true)); }, []);
  if (!d) return html`<${Spin} />`;
  return html`<div class="acols"><section class="apanel"><h3>Ключи интеграционного API</h3><p class="hint">Для дашбордов и алертов: Grafana, скрипты, что угодно. Ключ показывается один раз.</p>
    ${fresh && html`<div class="akey"><b>Новый ключ — сохраните сейчас:</b><code>${fresh}</code><button class="btn sm" onClick=${() => { navigator.clipboard && navigator.clipboard.writeText(fresh); toast('Скопировано'); }}>Копировать</button></div>`}
    <ul class="comps">${d.list.map(k => html`<li><i class="dot ok"></i><b>${k.name}</b><span>создан ${fmtDate(k.at)}</span><button class="btn sm danger" onClick=${async () => { if (!confirm('Отозвать ключ «' + k.name + '»?')) return; const r = await run(() => rpc('admin.apikeys', { del: k.id }), 'Ключ отозван'); if (r) setD(r); }}>Отозвать</button></li>`)}${!d.list.length && html`<li class="dim">Ключей нет.</li>`}</ul>
    <button class="btn" onClick=${async () => { const name = prompt('Название ключа:', 'grafana'); if (!name) return; const r = await run(() => rpc('admin.apikeys', { new: name })); if (r) { setFresh(r.key); setD(r); } }}><${Icon} n="key-round" s=${16} /> Выпустить ключ</button></section>
    <section class="apanel"><h3>Как пользоваться</h3><pre>${`curl -H "Authorization: Bearer nud_…" \\\n  ${location.origin}/api/admin/stats\n\nGET /api/admin/stats    — пользователи, DAU/MAU, сообщения\nGET /api/admin/monitor  — аптайм, память, соединения\nGET /api/admin/flags    — фича-флаги`}</pre></section></div>`;
}

const TABS = [['dash', 'Сводка', 'layout-dashboard', 'viewer', Dash], ['users', 'Пользователи', 'users', 'viewer', Users], ['reports', 'Жалобы', 'flag', 'moderator', Reports], ['chats', 'Сообщества', 'messages-square', 'viewer', Chats], ['monitor', 'Мониторинг', 'activity', 'viewer', Monitor], ['flags', 'Флаги и объявления', 'toggle-right', 'viewer', Flags], ['audit', 'Журнал действий', 'scroll-text', 'admin', Audit], ['api', 'API-ключи', 'key-round', 'superadmin', Api]];

function App() {
  const [st, setSt] = useState({ phase: getToken() ? 'load' : 'login' }), [tab, setTab] = useState((location.hash.slice(1) || 'dash')), [t, setT] = useState(null); const timer = useRef();
  setToast = v => { setT(v); clearTimeout(timer.current); timer.current = setTimeout(() => setT(null), 3500); };
  const enter = async token => { setSt({ phase: 'load' });
    try { const init = await connect(token); const me = await rpc('admin.me'); setSt({ phase: 'in', role: me.role, me: init.me }); }
    catch (e) { try { ws && ws.close(); } catch (x) { /* пусто */ } setSt({ phase: /прав/.test(e.message) ? 'denied' : 'login', note: /прав/.test(e.message) ? '' : e.message }); } };
  useEffect(() => { onDead = lost => setSt(s => s.phase === 'in' ? { phase: 'login', note: lost ? 'Соединение потеряно. Войдите снова.' : 'Сессия завершена.' } : s); const tk = getToken(); if (tk) enter(tk); }, []);
  useEffect(() => { history.replaceState(history.state, '', '#' + tab); }, [tab]);   // без новых записей в истории: «Назад» сразу возвращает в мессенджер
  if (st.phase === 'load') return html`<div class="alogin"><${Spin} /></div>`;
  if (st.phase === 'login') return html`<${Login} onToken=${enter} note=${st.note} />`;
  if (st.phase === 'denied') return html`<div class="alogin"><div class="acard"><h1><${Icon} n="shield-x" s=${26} /> Сюда нельзя</h1><p>У этого аккаунта нет роли персонала. На вышку пускают только спасателей.</p><p class="hint">Роль выдаёт суперадмин: первый зарегистрированный пользователь сервиса становится им автоматически.</p><a class="btn wide" href="/">Вернуться в мессенджер</a><button class="btn ghost wide" onClick=${() => { localStorage.removeItem(LS); setSt({ phase: 'login' }); }}>Войти другим аккаунтом</button></div></div>`;
  const tabs = TABS.filter(x => RANK[st.role] >= RANK[x[3]]), cur = tabs.find(x => x[0] === tab) || tabs[0], View = cur[4];
  return html`<div class="admin"><nav class="anav" aria-label="Разделы"><a class="abrand" href="/"><${Icon} n="life-buoy" s=${22} /><span>Вышка<small>админка «Нудиста»</small></span></a>
      ${tabs.map(x => html`<button class=${cur[0] === x[0] ? 'on' : ''} onClick=${() => setTab(x[0])}><${Icon} n=${x[2]} /> <span>${x[1]}</span></button>`)}
      <div class="awho"><b>${[st.me.name, st.me.last].filter(Boolean).join(' ')}</b><small>${ROLE_NAMES[st.role]}</small>${!st.me.totp && html`<small class="warnx">2FA выключена — включите в мессенджере: Настройки → Приватность</small>`}</div></nav>
    <main class="amain"><h2>${cur[1]}</h2><${View} role=${st.role} /></main>
    ${t && html`<div class=${'atoast' + (t.err ? ' err' : '')} role="status" key=${t.k}>${t.text}</div>`}</div>`;
}
render(html`<${App} />`, document.getElementById('admin'));
