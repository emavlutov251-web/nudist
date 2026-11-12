// Настройки: профиль, аккаунт, приватность и 2FA, устройства, уведомления, оформление, чаты, папки, звонки, данные.
import { html, useState, useEffect, useRef, S, bump, rpc, call, toast, Icon, Avatar, Badges, cx, openModal, closeModal, Modal, userName, fmtFull, fmtSize, fmtNum, copyText, download, confirmDlg, promptDlg, Spinner, Toggle, uploadAvatar, upload, pickFile, setSetting, local, useAsync, AV_COLORS, DEFAULT_SETTINGS, openAdmin } from './lib.js';
import { sfx, NOTIF_SOUNDS, PACKS, Sticker } from './fun.js';
import { logout, accounts, switchAccount, addAccount, sendPayload } from './store.js';
import { QR, StarsModal, StatusDlg, FolderEditor, showProfile } from './panels.js';
import { backHooks } from './back.js';

const TABS = [['profile', 'user', 'Профиль'], ['account', 'key-round', 'Аккаунт'], ['privacy', 'lock', 'Приватность'], ['devices', 'monitor-smartphone', 'Устройства'], ['notif', 'bell', 'Уведомления'], ['look', 'palette', 'Оформление'], ['chats', 'message-circle', 'Чаты и медиа'], ['folders', 'folder', 'Папки'], ['calls', 'phone', 'Звонки'], ['data', 'database', 'Данные'], ['adv', 'flask-conical', 'Продвинутые'], ['admins', 'shield', 'Администраторы']];
export function openSettings(tab) { openModal(Settings, { tab }); }
function Settings({ id, tab: t0 }) {
  const [tab, setTab] = useState(t0 || (window.innerWidth < 720 ? '' : 'profile')), me = S.me, cur = TABS.find(t => t[0] === tab);
  useEffect(() => {
    const inTab = () => !!tab && window.innerWidth <= 720, h = () => { if (!inTab()) return false; setTab(''); return true; };
    h.depth = inTab; backHooks.set(id, h); bump();
    return () => backHooks.delete(id);
  }, [tab]);
  const Body = { profile: Profile, account: Account, privacy: Privacy, devices: Devices, notif: Notif, look: Look, chats: Chats, folders: Folders, calls: Calls, data: Data, adv: Adv, admins: Admins }[tab];
  return html`<${Modal} id=${id} title=${cur ? cur[2] : 'Настройки'} icon="settings" wide cls=${cx('settings', tab && 'in-tab')}>
    <div class="set"><nav class="set-nav" aria-label="Разделы настроек">
      <button class="set-me" onClick=${() => setTab('profile')}><${Avatar} src=${me.avatar} name=${userName(me)} color=${me.color} s=${44} /><span><b>${userName(me)} <${Badges} list=${me.badges} s=${13} /></b><small>${me.username ? '@' + me.username : me.phone || ''}</small></span></button>
      ${TABS.filter(t => t[0] !== 'admins' || me.admin).map(([k, ic, l]) => html`<button class=${cx(tab === k && 'on')} onClick=${() => setTab(k)}><${Icon} n=${ic} s=${18} />${l}</button>`)}
      <button onClick=${() => openModal(StarsModal)}><${Icon} n="leaf" s=${18} />Листики и Премиум<small>${fmtNum(me.stars || 0)} 🍃</small></button>
      <button class="danger" onClick=${async () => { if (await confirmDlg({ title: 'Выйти из аккаунта?', text: 'Секретные чаты на этом устройстве станут нечитаемыми.', ok: 'Выйти', danger: true })) logout(); }}><${Icon} n="log-out" s=${18} />Выйти</button>
      <p class="hint">Нудист · веб-версия<br/>Нам нечего скрывать. Вам — есть что: загляните в «Приватность».</p></nav>
      <div class="set-body">${tab && html`<button class="btn sm ghost set-back" onClick=${() => setTab('')}><${Icon} n="arrow-left" s=${15} /> Разделы</button>`}${Body && html`<${Body} close=${() => closeModal(id)} />`}</div></div><//>`;
}
const Sel = ({ label, value, opts, onChange, hint }) => html`<label class="fld row-sel"><span>${label}${hint && html`<small>${hint}</small>`}</span><select value=${value} onChange=${e => onChange(e.target.value)}>${opts.map(([v, l]) => html`<option value=${v}>${l}</option>`)}</select></label>`;
const Set = ({ k, label, hint, inv }) => html`<${Toggle} label=${label} hint=${hint} on=${inv ? !S.settings[k] : !!S.settings[k]} onChange=${v => setSetting({ [k]: inv ? !v : v })} />`;

// ───── профиль
function Profile() {
  const me = S.me, [f, setF] = useState(() => ({ name: me.name || '', last: me.last || '', username: me.username || '', bio: me.bio || '', city: me.city || '', birthday: me.birthday || '', tz: me.tz || Intl.DateTimeFormat().resolvedOptions().timeZone || '', playing: me.playing || '', links: (me.links || []).map(l => ({ ...l })), color: me.color || 0, pc: (me.profile || {}).color || '', pe: (me.profile || {}).emoji || '' })), set = p => setF(x => ({ ...x, ...p }));
  const [busy, setBusy] = useState(false), prem = me.premiumUntil > Date.now();
  const save = async () => { setBusy(true); const r = await call('me.update', { name: f.name, last: f.last, username: f.username, bio: f.bio, city: f.city, birthday: f.birthday, tz: f.tz, playing: f.playing, color: f.color, links: f.links.filter(l => l.u.trim()).map(l => ({ t: l.t.trim() || l.u.replace(/^https?:\/\//, '').slice(0, 40), u: /^https?:\/\//i.test(l.u.trim()) ? l.u.trim() : 'https://' + l.u.trim() })), profile: f.pc || f.pe ? { color: f.pc, emoji: f.pe } : null }); setBusy(false); if (r) toast('Профиль сохранён'); };
  const ava = async () => { const u = await uploadAvatar(); if (u) call('me.update', { avatar: u }); };
  const vid = async () => { if (!prem) return toast('Анимированный аватар — фишка «Голого Премиума»'); const file = await pickFile('video/mp4,video/webm,image/gif'); if (!file) return; if (file.size > 8e6) return toast('Видеоаватар до 8 МБ', 'err'); try { const up = await upload(file); await call('me.update', { avatar: up.url }); } catch (e) { toast(e.message, 'err'); } };
  return html`<div class="form">
    <div class="prof-top" style=${f.pc ? `--pc:${f.pc}` : ''}><button class="ava-pick" onClick=${ava} title="Сменить фото"><${Avatar} src=${me.avatar} name=${userName(me)} color=${f.color} s=${88} /><i><${Icon} n="camera" s=${16} /></i></button>
      <div><b>${[f.name, f.last].filter(Boolean).join(' ') || 'Безымянный'} ${f.pe}</b><small>${f.username ? '@' + f.username : 'без username'}</small><div class="row wrap"><button class="btn sm ghost" onClick=${ava}>Фото</button><button class="btn sm ghost" onClick=${vid}>Видео ${!prem && '★'}</button><button class="btn sm ghost" onClick=${() => openModal(StatusDlg)}>Статус</button><button class="btn sm ghost" onClick=${() => showProfile(me.id)}>Как видят другие</button></div></div></div>
    ${(me.avatars || []).length > 1 && html`<div class="ava-hist">${me.avatars.map(a => html`<span class=${cx(a === me.avatar && 'on')}>${/\.(mp4|webm)$/.test(a) ? html`<video src=${a} muted loop autoplay playsinline></video>` : html`<img src=${a} alt="" onClick=${() => call('me.update', { avatar: a })} />`}<button class="ib sm" title="Удалить из истории" onClick=${() => call('me.update', { delAvatar: a })}><${Icon} n="x" s=${12} /></button></span>`)}</div>`}
    <div class="row wrap"><label class="fld grow"><span>Имя</span><input maxlength="64" value=${f.name} onInput=${e => set({ name: e.target.value })} /></label><label class="fld grow"><span>Фамилия</span><input maxlength="64" value=${f.last} onInput=${e => set({ last: e.target.value })} /></label></div>
    <label class="fld"><span>Username</span><input maxlength="32" value=${f.username} placeholder="golyj_korol" onInput=${e => set({ username: e.target.value.replace(/[^\w]/g, '') })} /><small class="dim">Ссылка на вас: ${location.origin}/#u=${f.username || '…'}</small></label>
    <label class="fld"><span>О себе <i>${f.bio.length}/300</i></span><textarea rows="2" maxlength="300" value=${f.bio} placeholder="Пара голых фактов о себе" onInput=${e => set({ bio: e.target.value })}></textarea></label>
    <div class="row wrap"><label class="fld grow"><span>Город</span><input maxlength="64" value=${f.city} onInput=${e => set({ city: e.target.value })} /></label><label class="fld"><span>День рождения</span><input type="date" value=${f.birthday} onInput=${e => set({ birthday: e.target.value })} /></label></div>
    <div class="row wrap"><label class="fld grow"><span>Часовой пояс</span><input maxlength="64" value=${f.tz} onInput=${e => set({ tz: e.target.value })} /></label><label class="fld grow"><span>Сейчас играю в…</span><input maxlength="64" value=${f.playing} placeholder="Сапёр на эксперте" onInput=${e => set({ playing: e.target.value })} /></label></div>
    <div class="fld"><span>Ссылки (до 5)</span>${f.links.map((l, i) => html`<div class="row"><input class="w30" placeholder="Подпись" maxlength="40" value=${l.t} onInput=${e => { l.t = e.target.value; set({ links: [...f.links] }); }} /><input class="grow" placeholder="https://…" maxlength="200" value=${l.u} onInput=${e => { l.u = e.target.value; set({ links: [...f.links] }); }} /><button class="ib sm" aria-label="Удалить ссылку" onClick=${() => set({ links: f.links.filter(x => x !== l) })}><${Icon} n="x" s=${16} /></button></div>`)}${f.links.length < 5 && html`<button class="btn sm ghost" onClick=${() => set({ links: [...f.links, { t: '', u: '' }] })}><${Icon} n="plus" s=${14} /> Добавить ссылку</button>`}</div>
    <div class="fld"><span>Цвет имени и аватара</span><div class="swatches">${AV_COLORS.map((c, i) => html`<button class=${cx(f.color === i && 'on')} style=${'background:' + c} aria-label=${'Цвет ' + (i + 1)} onClick=${() => set({ color: i })}></button>`)}</div></div>
    <div class="row wrap"><label class="fld"><span>Тема профиля</span><input type="color" value=${f.pc || '#1f9d57'} onInput=${e => set({ pc: e.target.value })} /></label><label class="fld"><span>Эмодзи профиля</span><input class="emoji-in" maxlength="4" value=${f.pe} placeholder="🍃" onInput=${e => set({ pe: e.target.value })} /></label>${f.pc && html`<button class="btn sm ghost" onClick=${() => set({ pc: '' })}>Сбросить тему</button>`}</div>
    <div class="row"><button class="btn" disabled=${busy || !f.name.trim()} onClick=${save}>Сохранить профиль</button></div>
    ${me.username && html`<div class="qr-box"><${QR} text=${location.origin + '/#u=' + me.username} size=${132} /><div><b>QR вашего профиля</b><p class="hint">Покажите — и вас найдут без единого слова.</p><button class="btn sm ghost" onClick=${() => { copyText(location.origin + '/#u=' + me.username); toast('Ссылка скопирована'); }}><${Icon} n="copy" s=${14} /> Скопировать ссылку</button></div></div>`}</div>`;
}

// ───── аккаунт
function Account() {
  const me = S.me, acc = accounts();
  const phone = async () => {
    const p = await promptDlg({ title: me.phone ? 'Сменить номер' : 'Привязать номер', label: 'Новый номер телефона', placeholder: '+7 900 000-00-00', type: 'tel' }); if (!p) return;
    const r = await call('me.phone.start', { phone: p }); if (!r) return;
    const code = await promptDlg({ title: 'Код из SMS', label: 'Введите код', hint: r.demoCode ? `Демо-режим: SMS-шлюза нет, ваш код — ${r.demoCode}` : 'Мы отправили код на новый номер', placeholder: '000000' }); if (!code) return;
    if (await call('me.phone.verify', { phone: p, code })) toast('Номер обновлён');
  };
  const email = async () => { const v = await promptDlg({ title: 'Почта для восстановления', label: 'Email', type: 'email', value: me.email || '', hint: 'Нужна, чтобы вернуть доступ, если забудете пароль. Оставьте пустым, чтобы отвязать.' }); if (v !== null && await call('me.update', { email: v })) toast(v ? 'Почта сохранена' : 'Почта отвязана'); };
  const pass = () => openModal(PassDlg);
  const del = async () => {
    const v = await promptDlg({ title: 'Удалить аккаунт навсегда?', label: me.hasPassword ? 'Введите пароль' : 'Напишите слово УДАЛИТЬ', type: me.hasPassword ? 'password' : 'text', hint: 'Профиль, сессии и личные данные исчезнут. Сообщения в общих чатах останутся с пометкой «Удалённый аккаунт».', ok: 'Удалить аккаунт' }); if (!v) return;
    if (await call('me.delete', me.hasPassword ? { password: v } : { confirm: v })) logout();
  };
  return html`<div class="form">
    <div class="list">
      <button class="li" onClick=${phone}><${Icon} n="smartphone" /><span><b>Телефон</b><small>${me.phone || 'не привязан'}</small></span><${Icon} n="chevron-right" s=${16} /></button>
      <button class="li" onClick=${email}><${Icon} n="mail" /><span><b>Почта для восстановления</b><small>${me.email || 'не указана'}</small></span><${Icon} n="chevron-right" s=${16} /></button>
      <button class="li" onClick=${pass}><${Icon} n="key-round" /><span><b>Пароль</b><small>${me.hasPassword ? 'установлен' : 'не задан — вход только по SMS'}</small></span><${Icon} n="chevron-right" s=${16} /></button></div>
    <${Sel} label="Удалить аккаунт, если я не захожу" hint="Таймер самоуничтожения. Сбрасывается при каждом входе." value=${me.autodelete || 6} opts=${[[1, '1 месяц'], [3, '3 месяца'], [6, '6 месяцев'], [12, '1 год'], [24, '2 года']]} onChange=${v => call('me.autodelete', { months: +v })} />
    <h5>Аккаунты на этом устройстве</h5>
    <div class="list">${acc.map(a => html`<button class="li" disabled=${a.token === S.token} onClick=${() => switchAccount(a.token)}><${Icon} n="circle-user" /><span><b>${a.name || 'Аккаунт'}</b><small>${a.token === S.token ? 'сейчас активен' : a.username ? '@' + a.username : 'переключиться'}</small></span></button>`)}
      ${acc.length < 5 && html`<button class="li" onClick=${addAccount}><${Icon} n="plus" /><span><b>Добавить аккаунт</b><small>До 5 аккаунтов с быстрым переключением</small></span></button>`}</div>
    <h5>Опасная зона</h5><button class="btn danger" onClick=${del}><${Icon} n="trash-2" s=${16} /> Удалить аккаунт</button></div>`;
}
function PassDlg({ id }) {
  const [f, setF] = useState({ old: '', a: '', b: '' }), has = S.me.hasPassword, ok = f.a.length >= 6 && f.a === f.b && (!has || f.old);
  return html`<${Modal} id=${id} title=${has ? 'Сменить пароль' : 'Задать пароль'} icon="key-round" cls="small" footer=${html`<button class="btn" disabled=${!ok} onClick=${async () => { if (await call('me.password', { old: f.old, new: f.a })) { toast('Пароль обновлён'); closeModal(id); } }}>Сохранить</button>`}>
    ${has && html`<label class="fld"><span>Текущий пароль</span><input type="password" autocomplete="current-password" value=${f.old} onInput=${e => setF({ ...f, old: e.target.value })} /></label>`}
    <label class="fld"><span>Новый пароль</span><input type="password" autocomplete="new-password" value=${f.a} onInput=${e => setF({ ...f, a: e.target.value })} /><small class="dim">Минимум 6 символов. «qwerty» и «123456» знает даже наш уборщик.</small></label>
    <label class="fld"><span>Ещё раз</span><input type="password" autocomplete="new-password" value=${f.b} onInput=${e => setF({ ...f, b: e.target.value })} />${f.b && f.a !== f.b && html`<small class="err">Пароли не совпадают</small>`}</label><//>`;
}

// ───── приватность и 2FA
const PRIV = [['phone', 'Номер телефона'], ['lastSeen', 'Время захода и «в сети»'], ['avatar', 'Фото профиля'], ['bio', 'О себе, город, ссылки'], ['calls', 'Кто может звонить'], ['msgs', 'Кто может писать первым'], ['invites', 'Кто может добавлять в группы'], ['stories', 'Кто видит истории по умолчанию']];
function Privacy() {
  const me = S.me, p = me.privacy || {}, blocked = (me.blocked || []).map(id => S.users[id] || { id });
  return html`<div class="form">
    <p class="hint">В «Нудисте» все на виду — кроме того, что вы решите прикрыть.</p>
    ${PRIV.map(([k, l]) => html`<${Sel} label=${l} value=${p[k] || 'all'} opts=${[['all', 'Все'], ['contacts', 'Мои контакты'], ['none', 'Никто']]} onChange=${v => call('me.privacy', { [k]: v })} />`)}
    <${Toggle} label="Закрытый профиль" hint="«О себе», ссылки и город видны только вашим контактам" on=${!!me.private} onChange=${v => call('me.update', { private: v })} />
    <h5>Двухфакторная защита</h5>
    <div class="list"><button class="li" onClick=${() => openModal(TotpDlg)}><${Icon} n="shield-check" /><span><b>Код из приложения (TOTP)</b><small>${me.totp ? `включена · резервных кодов: ${me.recoveryLeft}` : 'выключена — пароль плюс код из Google Authenticator, Aegis и т. п.'}</small></span><${Icon} n="chevron-right" s=${16} /></button>
      ${me.totp && html`<button class="li" onClick=${async () => { const code = await promptDlg({ title: 'Новые резервные коды', label: 'Код из аутентификатора', placeholder: '000000', hint: 'Старые коды перестанут работать.' }); if (!code) return; const r = await call('me.recovery.new', { code }); if (r) openModal(Codes, { codes: r.recovery }); }}><${Icon} n="life-buoy" /><span><b>Перевыпустить резервные коды</b><small>На случай потери телефона</small></span></button>`}</div>
    <h5>Шифрование</h5><p class="hint">Секретные чаты шифруются в браузере: ECDH P-256 → AES-256-GCM, ключ не покидает устройство. Сверить ключи с собеседником можно в панели секретного чата — по эмодзи или коду. Обычные чаты хранятся на сервере, чтобы работала синхронизация между устройствами.</p>
    <h5>Чёрный список · ${blocked.length}</h5>
    ${!blocked.length ? html`<p class="hint">Пусто. Вы со всеми в ладах — редкость для интернета.</p>` : blocked.map(u => html`<div class="row-item"><${Avatar} src=${u.avatar} name=${userName(u)} color=${u.color} s=${34} /><div class="ri-m"><b>${userName(u)}</b><span>${u.username ? '@' + u.username : ''}</span></div><button class="btn sm ghost" onClick=${() => call('me.block', { id: u.id, on: false })}>Разблокировать</button></div>`)}</div>`;
}
function Codes({ id, codes }) {
  return html`<${Modal} id=${id} title="Резервные коды" icon="life-buoy" cls="small" footer=${html`<button class="btn ghost" onClick=${() => { copyText(codes.join('\n')); toast('Коды скопированы'); }}>Скопировать</button><button class="btn ghost" onClick=${() => download('nudist-recovery-codes.txt', 'Резервные коды «Нудист»\n\n' + codes.join('\n') + '\n', 'text/plain')}>Скачать</button><button class="btn" onClick=${() => closeModal(id)}>Я сохранил</button>`}>
    <p class="hint">Каждый код сработает один раз вместо кода из приложения. Храните их там, где не найдут посторонние. И да, не в «Избранном».</p><div class="codes mono">${codes.map(c => html`<span>${c}</span>`)}</div><//>`;
}
function TotpDlg({ id }) {
  const on = S.me.totp, [st, setSt] = useState(null), [code, setCode] = useState('');
  useEffect(() => { if (!on) rpc('me.totp.setup').then(setSt).catch(e => { toast(e.message, 'err'); closeModal(id); }); }, []);
  const enable = async () => { const r = await call('me.totp.enable', { code }); if (r) { closeModal(id); toast('Двухфакторная защита включена'); openModal(Codes, { codes: r.recovery }); } };
  const disable = async () => { if (await call('me.totp.disable', { code })) { closeModal(id); toast('Двухфакторная защита выключена'); } };
  return html`<${Modal} id=${id} title="Двухфакторная защита" icon="shield-check" cls="small" footer=${html`<button class=${cx('btn', on && 'danger')} disabled=${code.trim().length < 6} onClick=${on ? disable : enable}>${on ? 'Выключить' : 'Включить'}</button>`}>
    ${on ? html`<p class="hint">Защита включена. Чтобы выключить, введите код из приложения или один из резервных.</p>` : !st ? html`<${Spinner} />` : html`<ol class="steps"><li>Откройте приложение-аутентификатор и отсканируйте QR.</li><li>Или введите ключ вручную: <code class="mono copy" onClick=${() => { copyText(st.secret); toast('Ключ скопирован'); }}>${st.secret}</code></li><li>Введите шестизначный код из приложения.</li></ol><div class="center"><${QR} text=${st.uri} size=${176} /></div>`}
    <label class="fld"><span>Код</span><input class="code-in" inputmode="numeric" autocomplete="one-time-code" maxlength="12" placeholder="000000" value=${code} onInput=${e => setCode(e.target.value)} onKeyDown=${e => e.key === 'Enter' && code.trim().length >= 6 && (on ? disable() : enable())} /></label><//>`;
}

// ───── устройства
const uaName = ua => { ua = ua || ''; const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Неизвестная система'; const br = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /YaBrowser/.test(ua) ? 'Яндекс Браузер' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /bot|curl|node/i.test(ua) ? 'Скрипт' : 'Браузер'; return [br, os, /Mobile|Android|iPhone/.test(ua)]; };
function Devices() {
  const a = useAsync(() => rpc('me.sessions'), []), list = a.data || [];
  const link = async () => {
    const v = await promptDlg({ title: 'Подключить устройство', label: 'Ссылка или код с экрана входа', placeholder: location.origin + '/#qr=…', hint: 'На новом устройстве выберите «Войти по QR». Отсканируйте код камерой телефона, где вы уже вошли, либо вставьте сюда ссылку из-под QR.' }); if (!v) return;
    const qid = (v.match(/qr=([\w-]+)/) || [0, v.trim()])[1];
    if (await call('qr.approve', { id: qid })) { toast('Устройство подключено'); setTimeout(a.reload, 1500); }
  };
  return html`<div class="form"><button class="btn" onClick=${link}><${Icon} n="qr-code" s=${16} /> Подключить устройство</button>
    ${a.loading && !a.data ? html`<${Spinner} />` : list.map(s => { const [br, os, mob] = uaName(s.ua); return html`<div class=${cx('row-item sess', s.current && 'cur')}><span class="sess-i"><${Icon} n=${mob ? 'smartphone' : 'monitor'} s=${22} /></span><div class="ri-m"><b>${br} · ${os}${s.current ? ' — это устройство' : ''}</b><span>${s.ip || 'IP скрыт'} · ${s.online ? 'сейчас в сети' : 'был активен ' + fmtFull(s.seen)} · вход ${fmtFull(s.at)}</span></div>${!s.current && html`<button class="btn sm danger" onClick=${async () => { await call('me.session.kill', { id: s.id }); a.reload(); }}>Завершить</button>`}</div>`; })}
    ${list.length > 1 && html`<button class="btn danger" onClick=${async () => { if (await confirmDlg({ title: 'Завершить все другие сеансы?', text: 'На остальных устройствах придётся войти заново.', ok: 'Завершить все', danger: true })) { await call('me.session.kill', { all: true }); a.reload(); } }}>Завершить все сеансы, кроме этого</button>`}
    <p class="hint">Видите незнакомое устройство — завершайте сеанс и меняйте пароль. Паранойя — тоже одежда.</p></div>`;
}

// ───── уведомления
function Notif() {
  const s = S.settings, perm = 'Notification' in window ? Notification.permission : 'unsupported', dnd = s.dnd || {};
  return html`<div class="form">
    ${perm === 'unsupported' ? html`<div class="note warn">Браузер не поддерживает системные уведомления. Звуки и счётчики будут работать.</div>` : perm === 'denied' ? html`<div class="note warn">Уведомления запрещены в настройках браузера для этого сайта. Разрешите их в адресной строке (значок слева от адреса).</div>` : perm !== 'granted' && html`<div class="note"><span>Разрешите уведомления, чтобы не пропускать сообщения, когда вкладка в фоне.</span><button class="btn sm" onClick=${() => Notification.requestPermission().then(() => bump())}>Разрешить</button></div>`}
    <${Set} k="notif" label="Системные уведомления" hint="Показывать, когда вкладка неактивна" /><${Set} k="preview" label="Показывать текст сообщения" hint="Выключите, если рядом любопытные" /><${Set} k="sound" label="Звук" />
    <div class="fld"><span>Звук уведомления</span><div class="chips">${NOTIF_SOUNDS.map(([k, l]) => html`<button class=${cx('chip', s.notifSound === k && 'on')} onClick=${() => { setSetting({ notifSound: k }); sfx(k); }}>${l}</button>`)}</div></div>
    <h5>О чём уведомлять</h5><${Set} k="notifDm" label="Личные сообщения" /><${Set} k="notifGroup" label="Группы" /><${Set} k="notifChannel" label="Каналы" /><${Set} k="notifServer" label="Каналы серверов" hint="Упоминания приходят всегда. Тонкая настройка каждого чата — в его меню «Уведомления»." />
    <h5>Не беспокоить</h5><${Toggle} label="Тихие часы" hint="В это время — ни звуков, ни уведомлений" on=${!!dnd.on} onChange=${v => setSetting({ dnd: { ...dnd, on: v } })} />
    ${dnd.on && html`<div class="row"><label class="fld"><span>С</span><input type="time" value=${dnd.from} onInput=${e => setSetting({ dnd: { ...dnd, from: e.target.value } })} /></label><label class="fld"><span>До</span><input type="time" value=${dnd.to} onInput=${e => setSetting({ dnd: { ...dnd, to: e.target.value } })} /></label></div>`}
    <button class="btn ghost" onClick=${() => { sfx(s.notifSound); if (perm === 'granted') try { new Notification('Нудист', { body: 'Проверка связи. Вы пропустили 47 сообщений. Шутка. Пока что.', icon: '/icon.svg' }); } catch (e) { toast('Браузер не дал показать уведомление', 'err'); } else toast('Так звучит уведомление. Системные пока не разрешены.'); }}>Проверить уведомление</button></div>`;
}

// ───── оформление
const ACCENTS = ['', '#E2552D', '#C7822F', '#0D7C8C', '#3F6FD8', '#8B55D9', '#D1468C'], WALLS = [['leaves', 'Листва'], ['plain', 'Чистый'], ['sand', 'Песок'], ['sea', 'Море'], ['dots', 'Горошек'], ['grid', 'Тетрадь']];
function Look() {
  const s = S.settings, prem = S.me.premiumUntil > Date.now();
  const themes = [['system', 'Как в системе', 'monitor'], ['light', 'Светлая', 'sun'], ['dark', 'Тёмная', 'moon'], ['tan', 'Загар ★', 'flame']];
  return html`<div class="form">
    <div class="fld"><span>Стиль</span><div class="seg">${[['fluent', 'Fluent · Windows 10'], ['classic', 'Классический']].map(([k, l]) => html`<button class=${cx((s.style === 'classic' ? 'classic' : 'fluent') === k && 'on')} onClick=${() => setSetting({ style: k })}>${l}</button>`)}</div></div>
    ${s.style !== 'classic' && html`<${Sel} label="Прозрачность и размытие" value=${s.acrylic === true ? 'on' : s.acrylic === false ? 'off' : 'auto'} opts=${[['auto', 'Авто: выключать на слабых телефонах'], ['on', 'Включены'], ['off', 'Выключены']]} onChange=${v => setSetting({ acrylic: v === 'on' ? true : v === 'off' ? false : 'auto' })} />`}
    <div class="fld"><span>Тема</span><div class="themes">${themes.map(([k, l, ic]) => html`<button class=${cx('th', 'th-' + k, s.theme === k && 'on')} onClick=${() => { if (k === 'tan' && !prem && s.theme !== 'tan' && !local.get('konami')) return toast('«Загар» — премиум-тема. Или введите секретный код с приставки Dendy: ↑↑↓↓←→←→BA'); setSetting({ theme: k }); }}><i><${Icon} n=${ic} s=${18} /></i>${l}</button>`)}</div></div>
    <div class="fld"><span>Цвет акцента</span><div class="swatches">${ACCENTS.map(c => html`<button class=${cx((s.accent || '') === c && 'on')} style=${'background:' + (c || (s.style === 'classic' ? '#1F9D57' : '#0078D7'))} aria-label=${c || (s.style === 'classic' ? 'Зелёный лист' : 'Синий Windows')} onClick=${() => setSetting({ accent: c })}></button>`)}<label class="sw-custom" title="Свой цвет"><input type="color" value=${s.accent || '#1f9d57'} onInput=${e => setSetting({ accent: e.target.value })} /><${Icon} n="pipette" s=${15} /></label></div></div>
    <div class="fld"><span>Фон чата</span><div class="walls">${WALLS.map(([k, l]) => html`<button class=${cx('wall', s.wallpaper === k && 'on')} data-w=${k} onClick=${() => setSetting({ wallpaper: k })}><i></i>${l}</button>`)}</div></div>
    <label class="fld"><span>Размер текста: ${s.fontSize}px</span><input type="range" min="12" max="22" step="1" value=${s.fontSize} onInput=${e => setSetting({ fontSize: +e.target.value })} /></label>
    <label class="fld"><span>Масштаб интерфейса: ${Math.round((s.scale || 1) * 100)}%</span><input type="range" min="0.8" max="1.3" step="0.05" value=${s.scale || 1} onChange=${e => setSetting({ scale: +e.target.value })} /></label>
    <${Sel} label="Вид сообщений" value=${s.flat === 'auto' ? 'auto' : s.flat ? 'on' : 'off'} opts=${[['auto', 'Авто: пузыри в чатах, лента на серверах'], ['off', 'Всегда пузыри'], ['on', 'Всегда лента']]} onChange=${v => setSetting({ flat: v === 'auto' ? 'auto' : v === 'on' })} />
    <${Sel} label="Формат времени" value=${s.timeFmt} opts=${[[24, '24 часа'], [12, '12 часов']]} onChange=${v => setSetting({ timeFmt: +v })} />
    <${Sel} label="Язык" value="ru" opts=${[['ru', 'Русский'], ['olb', 'Олбанский (в разработке, учите)']]} onChange=${() => toast('Превед! Олбанский пока только в переводе сообщений: меню сообщения → «Перевести».')} />
    <${Set} k="anim" label="Анимации" hint="Конфетти, тряска, подпрыгивающие стикеры" /><${Set} k="contrast" label="Высокая контрастность" hint="Жирнее границы, темнее текст" />
    <button class="btn ghost" onClick=${() => { setSetting({ theme: 'system', style: 'fluent', acrylic: 'auto', accent: '', wallpaper: 'leaves', fontSize: 15, scale: 1, flat: 'auto', anim: true, contrast: false }); toast('Оформление сброшено'); }}>Сбросить оформление</button></div>`;
}

// ───── чаты и медиа
function Chats() {
  const s = S.settings, dl = s.autoDl || {}, hidden = s.hiddenPacks || [], SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  return html`<div class="form">
    <${Set} k="enterSend" label="Enter отправляет сообщение" hint="Выключено — отправка по Ctrl+Enter" /><${Set} k="emojiAuto" label="Заменять :) на эмодзи" />
    <${Set} k="nakedTyping" label="Голый набор" hint="Собеседник видит текст, пока вы его печатаете. Со всеми опечатками и сомнениями." />
    <${Set} k="transcribe" label="Расшифровывать мои голосовые" hint=${SR ? 'Текст распознаёт браузер во время записи и прикладывает к сообщению' : 'Этот браузер не умеет распознавать речь — нужен Chrome или Edge'} />
    <${Set} k="autoArchive" label="Автоархив новых чатов от незнакомцев" hint="Вернутся из архива, если вас упомянут или ответят" />
    <h5>Медиа</h5><${Sel} label="Сжатие фото при отправке" value=${s.compress} opts=${[['high', 'Высокое качество (до 2560 px)'], ['medium', 'Экономия трафика (до 1280 px)'], ['original', 'Не сжимать']]} onChange=${v => setSetting({ compress: v })} />
    ${[['photo', 'Автозагрузка фото'], ['video', 'Автозагрузка видео'], ['gif', 'Автовоспроизведение GIF']].map(([k, l]) => html`<${Toggle} label=${l} on=${dl[k] !== false} onChange=${v => setSetting({ autoDl: { ...dl, [k]: v } })} />`)}
    <h5>Стикеры</h5><label class="fld"><span>Размер стикеров: ${s.stickerSize}px</span><input type="range" min="96" max="224" step="16" value=${s.stickerSize} onInput=${e => setSetting({ stickerSize: +e.target.value })} /></label>
    ${PACKS.map(p => html`<div class="row-item"><${Sticker} st=${p.items[0]} size=${40} /><div class="ri-m"><b>${p.name}</b><span>${p.items.length} стикеров</span></div><${Toggle} on=${!hidden.includes(p.id)} onChange=${v => setSetting({ hiddenPacks: v ? hidden.filter(x => x !== p.id) : [...hidden, p.id] })} /></div>`)}
    <div class="row-item"><span class="sess-i"><${Icon} n="sticker" s=${22} /></span><div class="ri-m"><b>Мои стикеры</b><span>${(s.stickers || []).length} шт. · добавляются из фото: меню сообщения → «В стикеры»</span></div>${(s.stickers || []).length > 0 && html`<button class="btn sm ghost" onClick=${async () => { if (await confirmDlg({ title: 'Удалить все свои стикеры?', ok: 'Удалить', danger: true })) setSetting({ stickers: [] }); }}>Очистить</button>`}</div>
    ${(s.stickers || []).length > 0 && html`<div class="my-st">${s.stickers.map(st => html`<span><img src=${st.url} alt="" /><button class="ib sm" aria-label="Удалить стикер" onClick=${() => setSetting({ stickers: s.stickers.filter(x => x !== st) })}><${Icon} n="x" s=${12} /></button></span>`)}</div>`}
    <div class="row-item"><span class="sess-i"><${Icon} n="image-play" s=${22} /></span><div class="ri-m"><b>Сохранённые GIF</b><span>${(s.gifs || []).length} шт.</span></div>${(s.gifs || []).length > 0 && html`<button class="btn sm ghost" onClick=${() => setSetting({ gifs: [] })}>Очистить</button>`}</div></div>`;
}
function Folders() {
  const fs = S.settings.folders || [], move = (i, d) => { const a = [...fs], j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; setSetting({ folders: a }); };
  return html`<div class="form"><p class="hint">Папки раскладывают чаты по вкладкам над списком. «Все», «Личные», «Группы», «Каналы», «Боты» и «Непрочитанные» есть всегда.</p>
    ${fs.map((f, i) => html`<div class="row-item"><span class="sess-i">${f.icon || '📁'}</span><div class="ri-m"><b>${f.name}</b><span>${[(f.types || []).length && 'типов: ' + f.types.length, (f.chats || []).length && 'чатов: ' + f.chats.length, f.unread && 'только непрочитанные', f.noMuted && 'без заглушённых'].filter(Boolean).join(' · ') || 'пустая'}</span></div><button class="ib sm" disabled=${!i} aria-label="Выше" onClick=${() => move(i, -1)}><${Icon} n="arrow-up" s=${16} /></button><button class="ib sm" disabled=${i === fs.length - 1} aria-label="Ниже" onClick=${() => move(i, 1)}><${Icon} n="arrow-down" s=${16} /></button><button class="ib sm" aria-label="Изменить" onClick=${() => openModal(FolderEditor, { folder: f })}><${Icon} n="pencil" s=${16} /></button><button class="ib sm" aria-label="Удалить" onClick=${() => { setSetting({ folders: fs.filter(x => x !== f) }); if (S.ui.folder === f.id) S.ui.folder = 'all'; }}><${Icon} n="trash-2" s=${16} /></button></div>`)}
    <button class="btn" disabled=${fs.length >= 10} onClick=${() => openModal(FolderEditor, {})}><${Icon} n="folder-plus" s=${16} /> Новая папка</button></div>`;
}

// ───── звонки
function Calls() {
  const [lvl, setLvl] = useState(null), ref = useRef(null);
  const stop = () => { const r = ref.current; if (r) { clearInterval(r.t); r.s.getTracks().forEach(t => t.stop()); r.c.close(); ref.current = null; setLvl(null); } };
  useEffect(() => stop, []);
  const test = async () => {
    if (ref.current) return stop();
    try { const s = await navigator.mediaDevices.getUserMedia({ audio: { noiseSuppression: !!S.settings.noise, echoCancellation: !!S.settings.echo } }), c = new (window.AudioContext || window.webkitAudioContext)(), an = c.createAnalyser(), buf = new Uint8Array(512); an.fftSize = 512; c.createMediaStreamSource(s).connect(an);
      ref.current = { s, c, t: setInterval(() => { an.getByteTimeDomainData(buf); let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v - 128)); setLvl(Math.min(100, Math.round(m / 128 * 220))); }, 80) };
    } catch (e) { toast('Микрофон недоступен: проверьте разрешения браузера', 'err'); }
  };
  return html`<div class="form">
    <${Set} k="noise" label="Шумоподавление" hint="Глушит клавиатуру, вентилятор и соседа с перфоратором" /><${Set} k="echo" label="Эхоподавление" />
    <${Set} k="ptt" label="Режим рации" hint="Микрофон работает, только пока зажат Пробел. Без него микрофон включается по голосу." />
    <div class="fld"><span>Проверка микрофона</span><div class="row"><button class="btn ghost" onClick=${test}><${Icon} n=${lvl === null ? 'mic' : 'square'} s=${16} /> ${lvl === null ? 'Проверить' : 'Остановить'}</button><div class="meter" role="meter" aria-valuenow=${lvl || 0} aria-valuemin="0" aria-valuemax="100"><i style=${`width:${lvl || 0}%`}></i></div></div>${lvl !== null && html`<small class="dim">Скажите «раз-раз». Полоска должна прыгать.</small>`}</div>
    <h5>Как это устроено</h5><p class="hint">Звонки идут напрямую между браузерами (WebRTC, сеть «каждый с каждым»), поэтому в комнате помещается до 12 человек. Камеру, микрофон, эффекты и запись можно переключить во время звонка кнопкой с ползунками.</p></div>`;
}

// ───── данные и хранилище
const enc = new TextEncoder(), b64 = b => btoa(String.fromCharCode(...new Uint8Array(b))), unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function keyFrom(pass, salt) { const k = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']); return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' }, k, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']); }
function Data() {
  const [est, setEst] = useState(null), [busy, setBusy] = useState('');
  const lsSize = () => { let n = 0; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('nudist.')) n += (k.length + (localStorage.getItem(k) || '').length) * 2; } return n; };
  useEffect(() => { if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(setEst).catch(() => {}); }, []);
  const run = async (k, fn) => { setBusy(k); try { await fn(); } catch (e) { toast(e.message || 'Не получилось', 'err'); } setBusy(''); };
  const exportAll = () => run('exp', async () => { const d = await rpc('me.export'); download(`nudist-moi-dannye-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(d, null, 2), 'application/json'); toast('Архив с вашими данными скачан'); });
  const backup = () => run('bak', async () => {
    if (!crypto.subtle) throw new Error('Шифрование доступно только по HTTPS или на localhost');
    const pass = await promptDlg({ title: 'Пароль для резервной копии', label: 'Придумайте пароль', type: 'password', hint: 'Копия шифруется AES-256 прямо в браузере. Без пароля её не откроет никто — включая вас.' }); if (!pass) return; if (pass.length < 6) throw new Error('Пароль копии — минимум 6 символов');
    const keys = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('nudist.ecdh.') || k.startsWith('nudist.settings.')) keys[k] = localStorage.getItem(k); }
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)), data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyFrom(pass, salt), enc.encode(JSON.stringify({ v: 1, user: S.me.id, settings: S.settings, keys, at: Date.now() })));
    download(`nudist-backup-${new Date().toISOString().slice(0, 10)}.nudist`, JSON.stringify({ nudistBackup: 1, salt: b64(salt), iv: b64(iv), data: b64(data) }), 'application/json'); toast('Зашифрованная копия скачана');
  });
  const restore = () => run('res', async () => {
    const f = await pickFile('.nudist,application/json'); if (!f) return; const j = JSON.parse(await f.text()); if (!j.nudistBackup) throw new Error('Это не резервная копия «Нудиста»');
    const pass = await promptDlg({ title: 'Пароль от копии', label: 'Пароль', type: 'password' }); if (!pass) return;
    let d; try { d = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(j.iv) }, await keyFrom(pass, unb64(j.salt)), unb64(j.data)))); } catch (e) { throw new Error('Пароль не подошёл или файл повреждён'); }
    if (d.user !== S.me.id && !(await confirmDlg({ title: 'Копия от другого аккаунта', text: 'Восстановить из неё только настройки оформления?', ok: 'Восстановить настройки' }))) return;
    if (d.user === S.me.id) for (const k in d.keys) localStorage.setItem(k, d.keys[k]);
    setSetting({ ...DEFAULT_SETTINGS, ...d.settings }); toast('Восстановлено. Ключи секретных чатов подхватятся после перезагрузки страницы.');
  });
  const imp = () => run('imp', async () => {
    const f = await pickFile('.json,.txt'); if (!f) return; const txt = await f.text(); let rows = [];
    if (/^\s*\{/.test(txt)) { const j = JSON.parse(txt), ms = j.messages || (j.chats && j.chats.list && j.chats.list.flatMap(c => c.messages)) || []; rows = ms.filter(m => m && m.type === 'message').map(m => ({ who: m.from || 'Кто-то', at: m.date || '', text: Array.isArray(m.text) ? m.text.map(x => (typeof x === 'string' ? x : x.text)).join('') : m.text || '' })); }
    else for (const line of txt.split(/\r?\n/)) { const m = line.match(/^\[?(\d{1,2}[./]\d{1,2}[./]\d{2,4},? \d{1,2}:\d{2}(?::\d{2})?)\]?(?: -)? ([^:]{1,60}): (.*)$/); if (m) rows.push({ at: m[1], who: m[2], text: m[3] }); else if (rows.length && line) rows[rows.length - 1].text += '\n' + line; }
    rows = rows.filter(r => r.text); if (!rows.length) throw new Error('Не нашли сообщений. Нужен result.json из Telegram или .txt-экспорт WhatsApp.');
    const saved = Object.values(S.chats).find(c => c.type === 'saved'); if (!saved) throw new Error('Не найдено «Избранное»');
    const total = rows.length; rows = rows.slice(-600); if (!(await confirmDlg({ title: 'Импортировать переписку?', text: `Нашли сообщений: ${total}. ${total > rows.length ? `Перенесём последние ${rows.length}. ` : ''}Они лягут в «Избранное» пачками, с именами и датами.`, ok: 'Импортировать' }))) return;
    let chunk = `📥 **Импорт: ${f.name}**\n`; const out = []; for (const r of rows) { const l = `**${r.who}** · ${String(r.at).replace('T', ' ').slice(0, 16)}\n${r.text}\n\n`; if (chunk.length + l.length > 3500) { out.push(chunk); chunk = ''; } chunk += l.slice(0, 3500); } out.push(chunk);
    for (const c of out) { await sendPayload(saved.id, { text: c.trim() }); await new Promise(r => setTimeout(r, 120)); } toast(`Импортировано сообщений: ${rows.length}. Ищите в «Избранном».`);
  });
  const clear = async () => { if (!(await confirmDlg({ title: 'Очистить локальный кэш?', text: 'Сотрём историю поиска, недавние эмодзи и запомненные раскрытые категории. Аккаунты, настройки и ключи секретных чатов останутся.', ok: 'Очистить' }))) return; for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (/^nudist\.(srv|col|lastChat|askedNotif)/.test(k)) localStorage.removeItem(k); } setSetting({ searchHistory: [], recentEmoji: DEFAULT_SETTINGS.recentEmoji }); if (window.caches) for (const k of await caches.keys()) await caches.delete(k); toast('Кэш очищен. Стало легче дышать.'); };
  return html`<div class="form">
    <div class="stor"><div><b>${fmtSize(lsSize())}</b><small>настройки и ключи в браузере</small></div>${est && html`<div><b>${fmtSize(est.usage || 0)}</b><small>всего занято сайтом из ${fmtSize(est.quota || 0)}</small></div>`}<div><b>${Object.keys(S.chats).length}</b><small>чатов синхронизировано</small></div></div>
    <div class="list">
      <button class="li" disabled=${!!busy} onClick=${exportAll}><${Icon} n="download" /><span><b>Скачать все мои данные</b><small>Профиль, настройки, сеансы и ваши сообщения в JSON</small></span>${busy === 'exp' && html`<${Spinner} />`}</button>
      <button class="li" disabled=${!!busy} onClick=${backup}><${Icon} n="shield" /><span><b>Зашифрованная резервная копия</b><small>Настройки и ключи секретных чатов под паролем</small></span></button>
      <button class="li" disabled=${!!busy} onClick=${restore}><${Icon} n="upload" /><span><b>Восстановить из копии</b><small>На новом устройстве или после переустановки браузера</small></span></button>
      <button class="li" disabled=${!!busy} onClick=${imp}><${Icon} n="import" /><span><b>Импорт из Telegram или WhatsApp</b><small>result.json или .txt-экспорт чата → в «Избранное»</small></span>${busy === 'imp' && html`<${Spinner} />`}</button>
      <button class="li" onClick=${clear}><${Icon} n="eraser" /><span><b>Очистить локальный кэш</b><small>История поиска, недавние эмодзи, мелочи интерфейса</small></span></button></div>
    <p class="hint">Экспорт отдельного чата в JSON или HTML — в меню чата → «Экспорт истории». Удаление аккаунта — в разделе «Аккаунт».</p></div>`;
}

// ───── продвинутые
const KEYS = [['Ctrl + K', 'Поиск'], ['Ctrl + ,', 'Настройки'], ['Alt + ↑ / ↓', 'Соседний чат'], ['↑ в пустом поле', 'Править последнее сообщение'], ['Ctrl + B / I / U', 'Жирный, курсив, подчёркнутый'], ['Ctrl + Shift + X / M', 'Зачёркнутый, моноширинный'], ['Esc', 'Закрыть, отменить, выйти из чата'], ['Esc Esc', '«Прикрыться»: экран для начальника'], ['Пробел (в рации)', 'Говорить в голосовом канале'], ['/', 'Меню команд в поле ввода'], ['↑↑↓↓←→←→BA', 'Не скажем']];
function Adv() {
  return html`<div class="form">
    <${Set} k="beta" label="Бета-функции" hint="Включает экспериментальное. Сейчас там пусто, но галочка греет душу." />
    <label class="fld"><span>Заголовок экрана «Прикрыться»</span><input maxlength="60" value=${S.settings.bossTitle} onInput=${e => setSetting({ bossTitle: e.target.value })} /><small class="dim">Двойной Esc прячет мессенджер за скучной таблицей. Заголовок вкладки тоже меняется.</small></label>
    <h5>Горячие клавиши</h5><div class="keys">${KEYS.map(([k, l]) => html`<div><kbd>${k}</kbd><span>${l}</span></div>`)}</div>
    <h5>Разработчикам</h5>
    <p class="hint">Бота создаёт @botbatya: команда <code class="mono">/newbot</code> выдаст токен. Дальше — HTTP Bot API, совместимое по духу с Telegram:</p>
    <pre class="code mono">${`curl ${location.origin}/bot<ТОКЕН>/getMe\ncurl ${location.origin}/bot<ТОКЕН>/getUpdates?timeout=25\ncurl -H 'Content-Type: application/json' \\\n  -d '{"chat_id":"<ID>","text":"Привет, голые люди!"}' \\\n  ${location.origin}/bot<ТОКЕН>/sendMessage`}</pre>
    <p class="hint">Входящие вебхуки для каналов сервера: Настройки сервера → «Вебхуки». Ключи интеграционного API сервиса выдаются в админ-панели.</p>
    <div class="row wrap"><button class="btn ghost" onClick=${() => { copyText(JSON.stringify({ ua: navigator.userAgent, me: S.me.id, conn: S.conn, chats: Object.keys(S.chats).length, servers: Object.keys(S.servers).length, flags: S.flags, settings: { ...S.settings, folders: undefined, stickers: undefined, gifs: undefined }, time: new Date().toISOString() }, null, 2)); toast('Отладочная сводка скопирована'); }}><${Icon} n="bug" s=${16} /> Скопировать отладочную сводку</button>
      ${S.me.admin && html`<button class="btn ghost" onClick=${openAdmin}><${Icon} n="shield" s=${16} /> Админ-панель</button>`}</div></div>`;
}

// ───── администраторы сервиса
const ADMIN_ROLES = [['viewer', 'Наблюдатель', 'видит статистику и списки, ничего не меняет'], ['moderator', 'Модератор', 'разбирает жалобы, банит и отключает звук'], ['admin', 'Админ', 'ещё управляет чатами, бейджами, функциями и видит журнал'], ['superadmin', 'Главный админ', 'может всё, включая назначение админов']];
const roleName = r => (ADMIN_ROLES.find(x => x[0] === r) || [0, 'Без роли'])[1];
const RoleSelect = ({ value, onChange, none }) => html`<select class="role-sel" aria-label="Роль" value=${value || ''} onChange=${e => onChange(e.target.value)}>${none && html`<option value="">${none}</option>`}${ADMIN_ROLES.map(([v, l]) => html`<option value=${v}>${l}</option>`)}</select>`;
async function setAdminRole(u, role) {
  if (!role && !(await confirmDlg({ title: 'Снять роль администратора?', text: `${u.name} потеряет доступ к админ-панели.`, ok: 'Снять роль', danger: true }))) return false;
  const r = await call('admin.role.set', { id: u.id, role: role || null }); if (!r) return false;
  toast(role ? `${u.name}: ${roleName(role).toLowerCase()}` : `${u.name} больше не администратор`); return true;
}
function Admins() {
  const a = useAsync(() => rpc('admin.staff'), []), d = a.data;
  const [q, setQ] = useState(''), [found, setFound] = useState(null), [pick, setPick] = useState({});
  const boss = d && d.me.role === 'superadmin';
  useEffect(() => {
    if (!boss || !q.trim()) { setFound(null); return; }
    let live = true; const t = setTimeout(() => rpc('admin.staff.find', { q }).then(r => live && setFound(r.users), () => live && setFound([])), 250);
    return () => { live = false; clearTimeout(t); };
  }, [q, boss]);
  const change = async (u, role) => { if (await setAdminRole(u, role)) { setQ(''); setFound(null); } a.reload(); };
  const Row = (u, right) => html`<div class="row-item adm-row"><${Avatar} src=${u.avatar} name=${u.name} color=${u.color} s=${40} /><div class="ri-m"><b>${u.name}${u.id === d.me.id ? ' — это вы' : ''}</b><span>${u.username ? '@' + u.username + ' · ' : ''}${u.owner ? 'владелец сервиса' : u.role ? roleName(u.role).toLowerCase() : 'без роли'}${u.online ? ' · в сети' : ''}</span></div>${right}</div>`;
  if (a.error) return html`<div class="form"><p class="hint">${a.error}</p></div>`;
  if (!d) return html`<${Spinner} />`;
  return html`<div class="form">
    <p class="hint">Администраторы следят за порядком во всём «Нудисте»: жалобы, баны, функции сервиса. ${boss ? 'Вы можете назначать и снимать их.' : 'Назначать и снимать их может только главный админ.'}</p>
    <h5>Команда</h5>
    ${d.staff.map(u => Row(u, u.can ? html`<${RoleSelect} value=${u.role} none="Снять роль" onChange=${v => change(u, v)} />` : null))}
    ${boss && html`<h5>Добавить администратора</h5>
      <label class="fld"><span>Кого назначить</span><input type="text" class="adm-q" autocomplete="off" autocapitalize="off" value=${q} placeholder="Имя или @username" onInput=${e => setQ(e.target.value)} /></label>
      ${found && !found.length && html`<p class="hint">Никого не нашли. Человек должен быть зарегистрирован в «Нудисте».</p>`}
      ${found && found.map(u => Row(u, u.can ? html`<${RoleSelect} value=${pick[u.id] || u.role || 'admin'} onChange=${v => setPick({ ...pick, [u.id]: v })} /><button class="btn sm" disabled=${(pick[u.id] || u.role || 'admin') === u.role} onClick=${() => change(u, pick[u.id] || u.role || 'admin')}>Назначить</button>` : html`<small class="hint">нельзя изменить</small>`))}
      <h5>Что может каждая роль</h5>
      ${ADMIN_ROLES.map(([, l, t]) => html`<p class="hint"><b>${l}</b> — ${t}.</p>`)}`}
    <button class="btn ghost" onClick=${openAdmin}><${Icon} n="shield" s=${16} /> Открыть админ-панель</button></div>`;
}
// Роль администратора из профиля человека
export function AdminRoleDlg({ id, user }) {
  const a = useAsync(() => rpc('admin.staff.find', { id: user.id }), []), u = a.data && a.data.users[0];
  const [role, setRole] = useState(null), cur = role === null ? (u && u.role) || 'admin' : role;
  return html`<${Modal} id=${id} title="Роль администратора" icon="shield">
    ${a.error ? html`<p class="hint">${a.error}</p>` : !u ? html`<${Spinner} />` : !u.can ? html`<p class="hint">Роль этого человека изменить нельзя${u.owner ? ': он владелец сервиса' : ''}.</p>` : html`<div class="form">
      <p class="hint">${u.name}${u.username ? ' (@' + u.username + ')' : ''} сейчас: ${u.role ? roleName(u.role).toLowerCase() : 'без роли'}.</p>
      <label class="fld"><span>Новая роль</span><${RoleSelect} value=${cur} onChange=${setRole} /></label>
      <p class="hint">${roleName(cur)} ${(ADMIN_ROLES.find(x => x[0] === cur) || [])[2]}.</p>
      <div class="row wrap"><button class="btn" disabled=${cur === u.role} onClick=${async () => { if (await setAdminRole(u, cur)) closeModal(id); }}>Назначить</button>
        ${u.role && html`<button class="btn danger" onClick=${async () => { if (await setAdminRole(u, null)) closeModal(id); }}>Снять роль</button>`}</div></div>`}<//>`;
}
