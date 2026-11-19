// Лобби: играть с другом одновременно. Зовём человека, выбираем игру, оба жмут «Готов» — партия стартует у обоих сразу.
// Состояние лобби лежит в S.lobby, приглашения, на которые ещё не ответили, — в S.lobbyInv. Сервер: server/lobby.js.
import { html, useState, useEffect, useRef, S, bump, rpc, call, toast, Icon, Avatar, cx, openModal, closeModal, Modal, userName, on, addUsers, plural, local, Spinner } from './lib.js';
import { onReady } from './store.js';

let GAMES = null;
const loadGames = async () => GAMES || (GAMES = (await rpc('lobby.games')).games);
const gameOf = id => (GAMES || []).find(g => g.id === id) || { id, name: 'Игра', e: '🎮', unit: ['очко', 'очка', 'очков'], cap: 300, how: '' };
const short = u => (u ? userName(u).split(' ')[0] : 'Соперник');
const mmss = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

// ───── состояние
function setLobby(v) {
  if (!v) { S.lobby = null; bump(); return; }
  addUsers(v.users);
  const live = (S.lobby && S.lobby.id === v.id && S.lobby.round === v.round && S.lobby.live) || {};
  for (const p of v.players) if (v.state !== 'play' || p.done || live[p.id] == null) live[p.id] = p.score || 0;
  S.lobby = { ...v, off: v.now - Date.now(), live };      // off — насколько часы сервера впереди наших: общий старт считается по серверу
  S.lobbyInv = (S.lobbyInv || []).filter(x => x.id !== v.id);
  const foe = v.players.find(p => p.id !== S.me.id); if (foe) local.set('lobby.last', foe.id);
  bump();
}
const isOpen = () => S.modals.some(m => m.c === LobbyModal);
const show = () => { if (!isOpen()) openModal(LobbyModal); };
on('lobby', v => { if (S.lobby && S.lobby.id === v.id) setLobby(v); });      // лобби открыто на этом устройстве — обновляем; на других устройствах того же аккаунта молчим
on('lobby.score', d => { const L = S.lobby; if (L && L.id === d.id) { L.live[d.u] = d.n; bump(); } });
on('lobby.msg', d => { const L = S.lobby; if (L && L.id === d.id && L.onNet) L.onNet(d.d); });
on('lobby.invite', d => { if (S.lobby && S.lobby.id === d.id) return; S.lobbyInv = [d, ...(S.lobbyInv || []).filter(x => x.id !== d.id)].slice(0, 3); bump(); });
on('lobby.closed', d => { S.lobbyInv = (S.lobbyInv || []).filter(x => x.id !== d.id); if (S.lobby && S.lobby.id === d.id) { S.lobby = null; toast(d.why === 'idle' ? 'Лобби закрылось: в нём давно никто не играл' : 'Лобби закрыто'); } bump(); });
onReady(() => { const L = S.lobby; if (L) rpc('lobby.get', { id: L.id }).then(setLobby, () => { S.lobby = null; bump(); }); });      // связь вернулась — сверяемся с сервером

// ───── вход
/** Открыть лобби: своё уже есть — показать его; иначе создать новое с этой игрой. suggest — кого предложить позвать одним нажатием. */
export async function openLobby(app, suggest) {
  try {
    await loadGames();
    if (!S.lobby) setLobby(await rpc('lobby.new', { app: app || local.get('lobby.app') || 'beer' }));
    else if (app && S.lobby.app !== app && S.lobby.host === S.me.id && S.lobby.state === 'idle') setLobby(await rpc('lobby.set', { id: S.lobby.id, app }));
    if (suggest && S.users[suggest] && !S.users[suggest].bot) S.lobby.suggest = suggest;
    show();
  } catch (e) { toast(e.message, 'err'); }
}
/** Войти по приглашению (из карточки в чате или из полоски над чатами). */
export async function joinLobby(inv) {
  try {
    await loadGames();
    if (S.lobby && S.lobby.id !== inv.id && S.lobby.players.length > 1 && S.lobby.state === 'play') return toast('Сначала доиграйте раунд в своём лобби', 'err');
    setLobby(await rpc('lobby.join', { id: inv.id, chat: inv.chat, mid: inv.mid })); show();
  } catch (e) { S.lobbyInv = (S.lobbyInv || []).filter(x => x.id !== inv.id); bump(); toast(e.message, 'err'); }
}
async function leaveLobby() { const L = S.lobby; S.lobby = null; bump(); if (L) await rpc('lobby.leave', { id: L.id }).catch(() => {}); }

// ───── полоска над списком чатов: приглашение или «вы в лобби». Одна строка, не окно: её можно закрыть.
export function LobbyStrip() {
  const inv = (S.lobbyInv || []).filter(x => Date.now() - x.at < 30 * 60e3)[0], L = S.lobby;
  if (inv) return html`<div class="lobby-strip" role="status"><${Icon} n="gamepad-2" s=${18} aria-hidden="true" /><span><b>${inv.fromName}</b> зовёт в «${inv.name}»</span>
    <button class="btn sm" onClick=${() => joinLobby(inv)}>Войти</button><button class="ib sm" title="Скрыть" aria-label="Скрыть" onClick=${() => { S.lobbyInv = S.lobbyInv.filter(x => x.id !== inv.id); bump(); }}><${Icon} n="x" s=${15} /></button></div>`;
  if (L && !isOpen()) return html`<div class="lobby-strip" role="status"><${Icon} n="gamepad-2" s=${18} aria-hidden="true" /><span><b>Вы в лобби</b> · ${gameOf(L.app).name}</span><button class="btn sm" onClick=${show}>Вернуться</button></div>`;
  return null;
}
/** Карточка приглашения в сообщении. */
export function LobbyCard({ m, chat }) {
  const d = m.lobby, mine = m.from === S.me.id, here = S.lobby && S.lobby.id === d.id;
  return html`<div class=${cx('duel-card lobby-card', d.over && 'done')}><b>🎮 Лобби: ${d.name} ${d.e}</b>
    ${d.over ? html`<small>Лобби закрыто</small>` : here ? html`<small>Вы в этом лобби</small><button class="btn sm" onClick=${e => { e.stopPropagation(); show(); }}>Вернуться</button>`
      : mine ? html`<small>Приглашение отправлено. Ждём, пока зайдёт.</small>` : html`<small>Играем одновременно, а не по очереди</small><button class="btn sm" onClick=${e => { e.stopPropagation(); joinLobby({ id: d.id, chat: chat.id, mid: m.id }); }}>Войти в лобби</button>`}</div>`;
}

// ───── окно лобби
function LobbyModal({ id }) {
  const L = S.lobby;
  useEffect(() => { if (!S.lobby) closeModal(id); });
  if (!L) return null;
  const g = gameOf(L.app);
  return html`<${Modal} id=${id} title=${L.state === 'play' ? g.name : 'Лобби'} icon="gamepad-2" cls="miniapp nopad lobby">
    ${L.state === 'play' ? html`<${Match} key=${L.id + ':' + L.round} L=${L} g=${g} />` : html`<${Room} L=${L} g=${g} close=${() => closeModal(id)} />`}<//>`;
}

function Room({ L, g, close }) {
  const me = L.players.find(p => p.id === S.me.id) || {}, foe = L.players.find(p => p.id !== S.me.id), host = L.host === S.me.id, [busy, setBusy] = useState(false);
  const fu = foe && S.users[foe.id], waiting = L.invited.map(i => S.users[i]).filter(Boolean), sug = !foe && L.suggest || (!foe && local.get('lobby.last')), su = sug && S.users[sug] && !L.invited.includes(sug) ? S.users[sug] : null;
  const act = async (m, p) => { if (busy) return null; setBusy(true); const r = await call(m, { id: L.id, ...p }); setBusy(false); if (r && r.id) setLobby(r); return r; };
  const invite = async to => {
    if (!to) { const { pickUsers } = await import('./panels.js'); const ids = await pickUsers({ title: 'Кого позвать в игру?', noBots: true, exclude: [S.me.id] }); if (!ids || !ids[0]) return; to = ids[0]; }
    if (await act('lobby.invite', { to })) toast('Приглашение отправлено. Друг увидит его в чате и над списком чатов.');
  };
  const pick = a => { if (!host) return toast(`Игру выбирает ${short(S.users[L.host])}`); if (a.id !== L.app) { local.set('lobby.app', a.id); act('lobby.set', { app: a.id }); } };
  const ready = async () => { const r = await act('lobby.ready', { on: !me.ready }); if (r && r.energy === false) { const { openEnergy } = await import('./perks.js'); toast('На раунд не хватает энергии', 'err'); openEnergy(); } };
  const quit = async () => { await leaveLobby(); close(); };
  const last = L.last, lg = last && gameOf(last.app), my = last && last.scores[S.me.id], his = last && foe && last.scores[foe.id];
  const slot = (p, u, mine) => html`<div class=${cx('lb-p', p && p.ready && 'ready')}>
    <${Avatar} u=${u} src=${u && u.avatar} name=${u ? userName(u) : '?'} color=${u ? u.color : 0} s=${48} />
    <b>${mine ? 'Вы' : short(u)}</b><small>${p.ready ? 'готов' : p.online === false ? 'пропала связь' : 'не готов'}${p.wins ? ` · побед: ${p.wins}` : ''}</small></div>`;
  return html`<div class="lobby-room">
    <div class="lb-scroll">
      <h5>Игра${!host ? html` <small>выбирает ${short(S.users[L.host])}</small>` : ''}</h5>
      <div class="lb-games" role="radiogroup" aria-label="Игра">${(GAMES || []).map(a => html`<button key=${a.id} role="radio" aria-checked=${a.id === L.app} class=${cx('lb-g', a.id === L.app && 'on', !host && 'ro')} onClick=${() => pick(a)}><span>${a.e}</span><b>${a.name}</b>${a.pvp && html`<i>один стол</i>`}</button>`)}</div>
      <p class="hint lb-how">${g.how}</p>
      <h5>Игроки</h5>
      <div class="lb-players">
        ${slot(me, S.me, true)}
        <span class="lb-vs">VS</span>
        ${foe ? slot(foe, fu, false) : html`<div class="lb-p empty"><span class="lb-q">?</span>
          ${waiting.length ? html`<b>${short(waiting[0])}</b><small>ещё не зашёл(ла)</small>` : html`<b>Никого</b><small>позовите друга</small>`}</div>`}
      </div>
      ${!foe && html`<div class="lb-inv">
        ${su && html`<button class="btn wide" disabled=${busy} onClick=${() => invite(su.id)}><${Icon} n="user-plus" s=${16} /> Позвать: ${short(su)}</button>`}
        <button class=${cx('btn wide', su && 'ghost')} disabled=${busy} onClick=${() => invite(null)}><${Icon} n="user-plus" s=${16} /> ${su ? 'Позвать другого' : waiting.length ? 'Позвать ещё кого-то' : 'Позвать друга'}</button>
        ${waiting.length > 0 && html`<p class="hint">Приглашение ушло в личный чат. Как только ${short(waiting[0])} нажмёт «Войти», вы окажетесь здесь вдвоём.</p>`}</div>`}
      ${last && foe && html`<div class=${cx('lb-last', last.win === S.me.id ? 'win' : last.win ? 'lose' : '')}>
        <b>${last.why === 'left' ? 'Раунд прерван: соперник вышел' : last.win === S.me.id ? '🏆 Раунд за вами' : last.win ? `Раунд за ${short(fu)}` : '🤝 Ничья'}</b>
        ${last.why !== 'left' && html`<span>${lg.name}: ${my} против ${his} ${lg.e}${last.why === 'time' ? ' · время вышло' : ''}</span>`}
        <span>По раундам: ${me.wins || 0} : ${foe.wins || 0}</span></div>`}
      ${last && !foe && last.why === 'left' && html`<div class="lb-last"><b>Соперник вышел из лобби</b><span>Позовите его снова или кого-то другого.</span></div>`}
    </div>
    <div class="lb-foot"><button class="btn ghost" onClick=${quit}><${Icon} n="log-out" s=${16} /> Выйти</button>
      <button class=${cx('btn big', me.ready && 'ghost')} disabled=${!foe || busy} onClick=${ready}>${!foe ? 'Ждём друга' : me.ready ? (foe.ready ? 'Стартуем…' : `Ждём ${short(fu)} · отмена`) : 'Готов'}</button></div>
  </div>`;
}

// Партия: игра во фрейме, сверху счёт обоих и время. До общего старта — отсчёт, после своего финиша — ожидание соперника.
function Match({ L, g }) {
  const meP = L.players.find(p => p.id === S.me.id) || {};      /* вернулись в окно посреди раунда, который уже закончили, — второй попытки нет */
  const fr = useRef(), st = useRef({ ready: false, go: false, done: !!meP.done, sent: 0, last: meP.score || 0 }), [, tick] = useState(0), [mine, setMine] = useState(meP.score || 0), [fin, setFin] = useState(meP.done ? meP.score || 0 : null);
  const foe = L.players.find(p => p.id !== S.me.id), fu = foe && S.users[foe.id], sv = () => Date.now() + (S.lobby ? S.lobby.off : L.off);
  const post = x => { try { fr.current && fr.current.contentWindow.postMessage(x, location.origin); } catch (e) { /* фрейм уже закрыт */ } };
  const tryGo = () => { const s = st.current; if (s.ready && !s.go && sv() >= L.startAt) { s.go = true; post({ nudist: 'go' }); } };
  const finish = (n, quit) => { const s = st.current; if (s.done) return; s.done = true; setFin(quit && g.pvp ? 0 : n); rpc('lobby.done', { id: L.id, n, quit: !!quit }).then(v => { if (S.lobby && S.lobby.id === v.id) setLobby(v); }).catch(() => {}); };
  useEffect(() => {
    const s = st.current, t = setInterval(() => { tryGo(); tick(x => x + 1); }, 200);
    const onMsg = async e => {
      if (!fr.current || e.source !== fr.current.contentWindow || e.origin !== location.origin || !e.data) return; const d = e.data;
      if (d.nudist === 'ready') { const th = document.documentElement.dataset.theme; post({ nudist: 'init', name: short(S.me), theme: th === 'dark' || (th !== 'light' && th !== 'tan' && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light', canSend: false, match: { foe: short(fu) } }); s.ready = true; tryGo(); }
      if (d.nudist === 'live' && !s.done) { const n = Math.max(0, Math.floor(Number(d.score) || 0)); s.last = n; setMine(n); if (Date.now() - s.sent > 900) { s.sent = Date.now(); rpc('lobby.score', { id: L.id, n }).catch(() => {}); } }
      if (d.nudist === 'result') finish(Math.max(0, Math.floor(Number(d.score) || 0)));
      if (d.nudist === 'net') rpc('lobby.msg', { id: L.id, d: d.d }).catch(x => toast(x.message, 'err'));
      if (d.nudist === 'score') rpc('apps.score', { app: g.id, t: String(d.t || ''), score: d.score }).catch(() => {});      /* рекорд в общую таблицу идёт и из лобби */
    };
    addEventListener('message', onMsg);
    const cur = S.lobby; if (cur) cur.onNet = x => post({ nudist: 'net', d: x });
    return () => { clearInterval(t); removeEventListener('message', onMsg); if (S.lobby) S.lobby.onNet = null; if (!s.done && S.lobby && S.lobby.id === L.id && S.lobby.state === 'play' && S.lobby.round === L.round) { s.done = true; rpc('lobby.done', { id: L.id, n: s.last, quit: true }).catch(() => {}); } };      /* закрыл окно посреди раунда — засчитывается то, что успел */
  }, []);
  const now = sv(), before = L.startAt - now, left = L.endAt - now, his = foe ? (S.lobby && S.lobby.live[foe.id]) || 0 : 0, me = fin != null ? fin : mine, foeDone = foe && foe.done;
  const u = new URL(g.url, location.origin); u.searchParams.set('m', '1'); if (g.pvp) u.searchParams.set('pvp', '1'); else if (L.seed) u.searchParams.set('seed', String(L.seed));
  return html`<div class="miniapp-col lobby-match">
    <div class="lm-top"><span class=${cx('lm-s', me > his && 'lead')}><small>Вы</small><b>${me}</b></span>
      <span class="lm-mid"><i>${g.e}</i><small>${before > 0 ? 'старт' : mmss(left)}</small></span>
      <span class=${cx('lm-s r', his > me && 'lead')}><small>${short(fu)}${foeDone ? ' · финиш' : ''}</small><b>${his}</b></span></div>
    <div class="lm-stage"><iframe ref=${fr} title=${g.name} src=${u.pathname + u.search} sandbox="allow-scripts allow-same-origin" referrerpolicy="no-referrer"></iframe>
      ${before > 0 && html`<div class="lm-over count" role="status"><b>${Math.max(1, Math.ceil(before / 1000))}</b><span>Приготовьтесь: старт у обоих одновременно</span></div>`}
      ${fin != null && html`<div class="lm-over" role="status"><b>${fin}</b><span>${plural(fin, g.unit)} — ваш результат</span><p>${foeDone ? 'Подводим итог…' : `${short(fu)} ещё играет: ${his}. Итог будет, когда закончит.`}</p></div>`}</div>
    ${fin == null && before <= 0 && html`<div class="duel-bar dim lm-bar"><span>${g.pvp ? 'Ходите одновременно: соперник видит ваш ход, только когда сделает свой' : 'У каждого своё поле. Побеждает тот, у кого больше.'}</span><button class="btn sm ghost" onClick=${() => finish(st.current.last, true)}>${g.pvp ? 'Сдаться' : 'Закончить'}</button></div>`}
  </div>`;
}
