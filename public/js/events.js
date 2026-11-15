// События: «Чёрная пятница», зимняя коллекция, адвент-календарь, «Тайный Санта», «Снежный ком», «Голый Новый год».
// Экран «События» в хабе, тонкая полоска над списком чатов и снег зимой. Серверная часть — server/events.js.
import { html, useState, useEffect, S, bump, rpc, toast, Icon, Avatar, cx, userName, confirmDlg, Spinner, local, plural, openModal, closeModal, Modal } from './lib.js';
import { sfx, confetti } from './fun.js';

const num = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const MSK = 3 * 3600e3;
const day = t => new Date(t + MSK).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' });
const err = e => toast(e.message || String(e), 'err');
// Сколько осталось: «3 дня», «5 ч», «12 мин»
function left(ms) {
  if (ms <= 0) return 'сейчас'; const m = Math.ceil(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  return d >= 1 ? `${d} ${plural(d, ['день', 'дня', 'дней'])}` : h >= 1 ? `${h} ч` : `${m} мин`;
}
const EV = { list: null, at: 0, diff: 0 };      // diff — насколько часы событий на сервере отличаются от часов устройства
export const evNow = () => Date.now() + EV.diff;
export function loadEvents(force) {
  if (!force && EV.list && Date.now() - EV.at < 10 * 60000) return Promise.resolve(EV.list);
  return rpc('event.list').then(r => { EV.list = r.list; EV.at = Date.now(); EV.diff = r.now - Date.now(); bump(); return r.list; }).catch(() => EV.list || []);
}
export const openEvents = id => { if (id) local.set('ev.open', id); import('./hub.js').then(h => h.openHub('events')); };

// ───── полоска над списком чатов: одно событие, которое идёт сейчас или начнётся в ближайшую неделю. Не окно: закрывается крестиком и больше не возвращается.
export function EventStrip() {
  useEffect(() => { loadEvents(); }, []);
  const off = local.get('ev.off') || {}, t = evNow();
  const PRI = ['ny', 'bf', 'advent', 'santa', 'snow', 'winter', 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct'], rank = x => (x.state === 'on' ? 0 : 10) + PRI.indexOf(x.id);      // сначала то, где есть чем заняться сегодня
  const e = (EV.list || []).filter(x => !off[x.id + x.from] && (x.state === 'on' || (x.state === 'soon' && x.from - t < 7 * 864e5))).sort((a, b) => rank(a) - rank(b))[0]; if (!e) return null;
  return html`<div class="ev-strip" role="button" tabIndex="0" onClick=${() => openEvents(e.id)} onKeyDown=${k => { if (k.key === 'Enter') openEvents(e.id); }}>
    <span class="ev-strip-e">${e.e}</span>
    <span class="ev-strip-t"><b>${e.name}</b><small>${e.state === 'on' ? `идёт, осталось ${left(e.to - t)}` : `начнётся через ${left(e.from - t)}`}</small></span>
    <button class="ib sm" title="Скрыть" aria-label="Скрыть" onClick=${k => { k.stopPropagation(); local.set('ev.off', { ...off, [e.id + e.from]: 1 }); bump(); }}><${Icon} n="x" s=${15} /></button>
  </div>`;
}

// ───── адвент-календарь
function Advent() {
  const [v, setV] = useState(null), [busy, setBusy] = useState(false);
  useEffect(() => { rpc('advent.get').then(setV).catch(err); }, []);
  if (!v) return html`<${Spinner} />`;
  const open = async d => {
    if (busy) return; setBusy(true);
    try {
      const r = await rpc('advent.open', { day: d.d }); setV(r.advent); sfx('coin'); confetti();
      toast([r.n ? `+${num(r.n)} 🍃` : '', r.item ? `рамка «${r.item}» — уже в магазине, вкладка «Украшения»` : '', r.plan ? `Pro на ${r.plan} дня включён` : '', r.gift ? `подарок ${r.gift} — в вашем профиле` : ''].filter(Boolean).join(' · '));
    } catch (e) { err(e); } finally { setBusy(false); }
  };
  const ticket = async () => {
    if ((S.me.stars || 0) < v.price) return toast(`Не хватает ${num(v.price - (S.me.stars || 0))} 🍃`);
    if (!(await confirmDlg({ title: 'Золотой билет', text: `Спишется ${num(v.price)} 🍃. С билетом можно открыть пропущенные окошки, а листики из каждого окошка, открытого после покупки, удваиваются.`, ok: 'Купить' }))) return;
    try { const r = await rpc('advent.ticket'); setV(r.advent); toast('Золотой билет ваш.'); sfx('coin'); } catch (e) { err(e); }
  };
  const tap = d => d.state === 'today' || d.state === 'late' ? open(d) : toast(d.state === 'got' ? `Уже открыто: ${d.prize}` : d.state === 'missed' ? 'День пропущен. Открыть его можно с «Золотым билетом».' : `Откроется ${d.d} декабря${d.prize ? ': ' + d.prize : ''}`);
  return html`<div class="adv">
    ${!v.today && !v.over && html`<p class="ev-note">Календарь откроется ${day(v.from)}. Заходите каждый день — окошко живёт сутки.</p>`}
    <div class="adv-g">${v.days.map(d => html`<button key=${d.d} class=${cx('adv-d', 's-' + d.state, d.special && 'sp')} disabled=${busy} onClick=${() => tap(d)} aria-label=${`${d.d} декабря`}>
      <b>${d.d}</b><small>${d.state === 'got' ? '✓' : d.d === 7 ? '❄️' : d.d === 14 ? '🔥' : d.d === 25 ? '🎄' : d.state === 'today' || d.state === 'late' ? '🎁' : d.state === 'missed' ? '·' : '🍃'}</small></button>`)}</div>
    ${(v.today > 0 || v.ticket) && html`<div class="ev-row">${v.ticket ? html`<span class="ev-pill gold">🎫 Золотой билет: листики ×2, пропущенные дни открыты</span>` : html`<span>Пропустили день? <b>Золотой билет</b> открывает пропущенные окошки и удваивает листики.</span><button class="btn sm" onClick=${ticket}>${num(v.price)} 🍃</button>`}</div>`}
  </div>`;
}

// ───── Тайный Санта
function Santa() {
  const [v, setV] = useState(null), [busy, setBusy] = useState(false);
  useEffect(() => { rpc('santa.get').then(setV).catch(err); }, []);
  if (!v) return html`<${Spinner} />`;
  const act = async (m, p, ok) => { if (busy) return; setBusy(true); try { const r = await rpc(m, p); setV(r.santa || r); if (ok) toast(ok); return r; } catch (e) { err(e); } finally { setBusy(false); } };
  const give = async g => {
    if ((S.me.stars || 0) < g.price) return toast(`Не хватает ${num(g.price - (S.me.stars || 0))} 🍃`);
    if (!(await confirmDlg({ title: `${g.e} ${g.name}`, text: `Подарить подопечному за ${num(g.price)} 🍃? Он увидит подарок от Тайного Санты, без вашего имени.`, ok: 'Подарить' }))) return;
    if (await act('santa.give', { gift: g.id }, 'Подарок вручён. Хо-хо-хо.')) { confetti(); sfx('fanfare'); }
  };
  if (v.state === 'soon') return html`<p class="ev-note">Запись откроется ${day(v.from)}. Пока копите листики: подарок стоит ${v.min}–${v.max} 🍃.</p>`;
  if (v.state === 'signup') return html`<div class="ev-row"><span>${v.joined ? html`Вы в игре. Участников: <b>${v.n}</b>. Жеребьёвка — ${day(v.draw)}.` : html`Участников уже: <b>${v.n}</b>. Жеребьёвка — ${day(v.draw)}. Нужно хотя бы ${v.need}.`}</span>
    ${v.joined ? html`<button class="btn sm ghost" disabled=${busy} onClick=${() => act('santa.leave', {}, 'Вы вышли из игры')}>Передумал(а)</button>` : html`<button class="btn sm" disabled=${busy} onClick=${() => act('santa.join', {}, 'Вы в игре. Жеребьёвка — 25 декабря.')}>Участвую 🎅</button>`}</div>`;
  if (v.state === 'give') {
    if (v.few) return html`<p class="ev-note">В этом году записалось слишком мало людей, жеребьёвки не было. Листики целы.</p>`;
    if (!v.ward) return html`<p class="ev-note">Жеребьёвка уже прошла. Запишитесь в следующем декабре.</p>`;
    return html`<div class="santa">
      <div class="ev-row"><span class="santa-w"><${Avatar} u=${v.ward} src=${v.ward.avatar} name=${userName(v.ward)} color=${v.ward.color} s=${40} /><span><small>Ваш подопечный</small><b>${userName(v.ward)}</b></span></span>${v.done && html`<span class="ev-pill">🎁 Подарок вручён</span>`}</div>
      ${!v.done && html`<p class="ev-note">Выберите подарок на ${v.min}–${v.max} 🍃. Дарить можно до ${day(v.to - 1)}.</p><div class="santa-g">${(v.gifts || []).map(g => html`<button key=${g.id} class="santa-i" disabled=${busy} onClick=${() => give(g)}><i>${g.e}</i><b>${g.name}</b><small>${num(g.price)} 🍃</small></button>`)}</div>`}
    </div>`;
  }
  return html`<p class="ev-note">Санта отдыхает до следующего декабря.</p>`;
}

// ───── Снежный ком
function Snow() {
  const [v, setV] = useState(null);
  useEffect(() => { rpc('snow.get').then(setV).catch(err); }, []);
  if (!v) return html`<${Spinner} />`;
  return html`<div class="snowb">
    <div class="ev-row"><span>У вас <b>${v.me} ❄️</b>${v.place ? html` · место <b>${v.place}</b>` : ''}${v.awarded ? ' · итоги подведены' : ''}</span>${v.on && html`<button class="btn sm" onClick=${() => import('./growth.js').then(g => g.openInvite())}><${Icon} n="user-plus" s=${15} /> Позвать друга</button>`}</div>
    <div class="ev-prizes">${v.prizes.map(p => html`<span class="ev-pill">${p.from}–${p.to} место · ${p.name} на месяц</span>`)}<span class="ev-pill">нужно от ${v.min} ❄️</span></div>
    ${v.top.length ? html`<ol class="snow-top">${v.top.slice(0, 20).map((r, i) => html`<li key=${r.user.id} class=${cx(r.user.id === S.me.id && 'me')}><i>${i + 1}</i><${Avatar} u=${r.user} src=${r.user.avatar} name=${userName(r.user)} color=${r.user.color} s=${28} /><b>${userName(r.user)}</b><span>${r.n} ❄️</span></li>`)}</ol>`
      : html`<p class="ev-note">${v.on ? 'Таблица пока пустая. Первая снежинка — и вы на первом месте.' : `Гонка идёт с ${day(v.from)} по ${day(v.to - 1)}.`}</p>`}
  </div>`;
}

// ───── календарь года: игра события, три задания, таблица рекордов
const play = g => import('./hub.js').then(h => h.launchApp({ id: g.app, title: g.title, url: g.url, emoji: '🍃', art: g.app }));
function Quest({ e }) {
  const [v, setV] = useState(null), [busy, setBusy] = useState(false);
  const load = () => rpc('year.get', { id: e.id }).then(setV).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 6000); return () => clearInterval(t); }, [e.id]);      // после партии и сообщений прогресс подтягивается сам
  if (!v) return html`<${Spinner} />`;
  const skip = async () => { if (!(await confirmDlg(`Пропустить испытание за ${num(v.skip)} 🍃? Листики за него не начислятся.`, { ok: 'Пропустить' }))) return; setBusy(true); try { setV(await rpc('year.skip', { id: e.id })); } catch (x) { err(x); } finally { setBusy(false); } };
  return html`<div class="yq">
    <div class="yq-game"><span class="yq-game-t"><b>${v.game.title}</b><small>${v.best ? `ваш рекорд: ${v.best}${v.place ? ` · место ${v.place} из ${v.n}` : ''}` : 'игра события'}${v.topPrize ? ` · трём лучшим — ${v.topPrize}` : ''}</small></span><button class="btn sm" onClick=${() => play(v.game)}>Играть</button></div>
    <ul class="yq-tasks">${v.tasks.map((t, i) => html`<li key=${i} class=${cx(t.done && 'done', t.locked && 'locked')}>
      <span class="yq-n">${t.done ? html`<${Icon} n="check" s=${15} />` : t.locked ? html`<${Icon} n="lock" s=${14} />` : i + 1}</span>
      <span class="yq-t"><b>${t.text}</b><i><u style=${`width:${Math.round(t.have / t.n * 100)}%`}></u></i></span>
      <span class="yq-p">${t.done ? 'готово' : `${t.have}/${t.n}`}${t.prize && !t.done ? html`<small>${t.prize}</small>` : ''}</span></li>`)}</ul>
    <div class="ev-row"><span>${v.done ? html`<b>Событие пройдено.</b> Марка в альбоме.` : html`За все задания — марка в альбом и <b>${v.prize}</b>.`}</span>${v.skip > 0 && !v.done && html`<button class="btn sm ghost" disabled=${busy} onClick=${skip}>Пропустить · ${num(v.skip)} 🍃</button>`}</div>
    ${!v.on && !v.done && html`<p class="ev-note">Задания считаются, только пока событие идёт.</p>`}
    ${v.race && html`<div><b>Гонка клубов</b>${v.race.length ? html`<ol class="snow-top">${v.race.map((r, i) => html`<li key=${r.id}><i>${i + 1}</i><b>${r.name}</b><span>${num(r.n)}</span></li>`)}</ol>` : html`<p class="ev-note">Считаются сообщения в клубах по субботам и воскресеньям, не больше 40 от человека в день. Первым трём клубам — 5, 3 и 1 буст.</p>`}</div>`}
    ${v.top.length > 0 && html`<div><b>Рекорды события</b><ol class="snow-top">${v.top.map((r, i) => html`<li key=${r.user.id} class=${cx(r.user.id === S.me.id && 'me')}><i>${i + 1}</i><${Avatar} u=${r.user} src=${r.user.avatar} name=${userName(r.user)} color=${r.user.color} s=${28} /><b>${userName(r.user)}</b><span>${r.n}</span></li>`)}</ol></div>`}
  </div>`;
}
// ───── анонимные валентинки
export const VAL_CARDS = ['Ты мне нравишься', 'С тобой весело', 'Ты красиво молчишь в чате', 'Пиши мне чаще', 'Ты — мой любимый контакт', 'Будь моим соседом по шезлонгу'];
const Heart = () => html`<svg viewBox="0 0 24 22" width="22" height="20" aria-hidden="true"><path d="M12 21C-6 9 4-5 12 4c8-9 18 5 0 17z" fill="currentColor"/></svg>`;
function ValDlg({ id, user }) {
  const [card, setCard] = useState(0), [busy, setBusy] = useState(false);
  const send = async () => { setBusy(true); try { const r = await rpc('val.send', { to: user.id, card }); closeModal(id); toast(r.mutual ? 'Взаимно! Имена открыты обоим 💞' : 'Валентинка отправлена анонимно'); if (r.mutual) confetti(); } catch (x) { err(x); setBusy(false); } };
  return html`<${Modal} id=${id} title="Валентинка" icon="heart">
    <div class="ask"><p>Для <b>${userName(user)}</b>. Он или она не увидит, от кого. Имя откроется, если вам ответят тем же, — или если получатель заплатит 5 000 🍃 за разгадку.</p>
      <div class="val-cards">${VAL_CARDS.map((t, i) => html`<button key=${i} class=${cx('val-card', 'vc' + i, card === i && 'on')} onClick=${() => setCard(i)}><${Heart} /><span>${t}</span></button>`)}</div>
      <div class="ask-btns"><button class="btn" disabled=${busy} onClick=${send}>Отправить анонимно</button></div></div>
  <//>`;
}
export const valentineOn = () => (EV.list || []).some(x => x.id === 'feb' && x.state === 'on');
export const sendValentine = user => openModal(ValDlg, { user });
function Valentines() {
  const [v, setV] = useState(null); const load = () => rpc('val.get').then(setV).catch(() => {}); useEffect(() => { load(); }, []);
  if (!v) return html`<${Spinner} />`;
  const reveal = async x => { if (!(await confirmDlg(`Узнать отправителя за ${num(v.reveal)} 🍃? Бесплатный способ — отправить валентинку тому, на кого думаете: если угадали, имена откроются.`, { ok: 'Узнать' }))) return; try { await rpc('val.reveal', { id: x.id }); load(); } catch (e) { err(e); } };
  return html`<div class="val">
    <p class="ev-note">${v.on ? 'Чтобы отправить: откройте профиль человека → «Отправить валентинку». Не больше пяти в день, одному человеку — одна.' : 'Отправлять валентинки можно с 10 по 16 февраля.'}</p>
    ${v.got.length > 0 && html`<b>Вам прислали · ${v.got.length}</b><div class="val-list">${v.got.map(x => html`<div key=${x.id} class=${cx('val-card', 'vc' + x.card)}><${Heart} /><span>${VAL_CARDS[x.card]}</span>
      <small>${x.open ? html`от <b>${userName(x.from)}</b>${x.mutual ? ' · взаимно' : ''}` : html`<button class="btn sm" onClick=${() => reveal(x)}>Кто это? · ${num(v.reveal)} 🍃</button>`}</small></div>`)}</div>`}
    ${v.sent.length > 0 && html`<b>Вы отправили · ${v.sent.length}</b><ul class="val-sent">${v.sent.map(x => html`<li key=${x.id}><${Avatar} u=${x.to} src=${x.to.avatar} name=${userName(x.to)} color=${x.to.color} s=${26} /><span>${userName(x.to)}</span><small>${x.mutual ? 'взаимно 💞' : x.open ? 'вас раскрыли' : 'анонимно'}</small></li>`)}</ul>`}
    ${!v.got.length && !v.sent.length && html`<p class="ev-note">Пока пусто. Кто-то должен сделать первый шаг.</p>`}
  </div>`;
}
// ───── альбом марок: по одной за каждое пройденное событие года
function Album() {
  const [a, setA] = useState(null); useEffect(() => { rpc('year.album').then(setA).catch(() => {}); }, []);
  if (!a) return null; const n = a.stamps.filter(s => s.got).length;
  return html`<section class="album"><div class="album-h"><b>Альбом ${a.y}</b><span>${n} из ${a.stamps.length} марок</span></div>
    <div class="album-g">${a.stamps.map(s => html`<span key=${s.id} class=${cx('stamp', s.got && 'got')} title=${s.name}><i>${s.e}</i><small>${new Date(s.from + MSK).toLocaleDateString('ru-RU', { month: 'short', timeZone: 'UTC' }).replace('.', '')}</small></span>`)}</div>
    <div class="album-goals" hidden=${!a.goals.length}>${a.goals.map(g => html`<span key=${g.n} class=${cx(g.got && 'got')}>${g.n} ${g.n < 5 ? 'марки' : 'марок'} — ${g.prize}</span>`)}</div>
    <small class="album-hint">${a.goals.length ? 'Марку дают за три задания события. Пропустили месяц — марка останется пустой до следующего года.' : 'Марку дают за три задания события. Большой альбом на 12 марок с наградами начнётся с «Голого января».'}</small></section>`;
}

const BODY = { advent: Advent, santa: Santa, snow: Snow, feb: Valentines };
export function Events() {
  const [list, setList] = useState(EV.list), [open, setOpen] = useState(() => { const k = local.get('ev.open'); local.set('ev.open', null); return k || null; });
  useEffect(() => { loadEvents(true).then(l => { setList(l); if (!open) { const e = l.find(x => x.state === 'on' && (BODY[x.id] || x.quest)) || l.find(x => BODY[x.id] || x.quest); if (e) setOpen(e.id); } }); }, []);
  if (!list) return html`<div class="hub-pad"><${Spinner} /></div>`;
  const t = evNow();
  return html`<div class="hub-pad evs">
    <${Album} />
    ${!list.length && html`<div class="ev-empty"><span>🏖️</span><b>Сейчас событий нет</b><small>Следующее появится здесь заранее. Отдыхаем.</small></div>`}
    ${list.map(e => { const Body = BODY[e.id], isOpen = open === e.id; return html`<section key=${e.id} class=${cx('ev', 'ev-' + e.id, 'st-' + e.state, isOpen && 'open')}>
      <button class="ev-h" aria-expanded=${isOpen} onClick=${() => setOpen(isOpen ? null : e.id)}>
        <span class="ev-e">${e.e}</span>
        <span class="ev-t"><b>${e.name}</b><small>${e.state === 'on' ? `идёт · осталось ${left(e.to - t)}` : e.state === 'soon' ? `с ${day(e.from)} · через ${left(e.from - t)}` : `закончилось ${day(e.to - 1)}`}</small></span>
        <span class=${cx('ev-st', e.state)}>${e.state === 'on' ? 'идёт' : e.state === 'soon' ? 'скоро' : 'итоги'}</span>
      </button>
      ${isOpen && html`<div class="ev-b"><p class="ev-about">${e.about}</p>
        ${Body && html`<${Body} />`}
        ${e.quest && html`<${Quest} e=${e} />`}
        ${e.go === 'shop' && e.state === 'on' && html`<div class="ev-row"><span></span><span class="ev-btns"><button class="btn sm" onClick=${() => import('./shop.js').then(m => m.openShop('cosmetics'))}>Украшения</button><button class="btn sm ghost" onClick=${() => import('./shop.js').then(m => m.openShop('gifts'))}>Подарки</button></span></div>`}
      </div>`}
    </section>`; })}
  </div>`;
}

// ───── снег: с 1 декабря по 14 января, выключается в «Настройки → Оформление». Только CSS, 16 снежинок.
export const snowSeason = () => { const d = new Date(evNow() + MSK), m = d.getUTCMonth(), n = d.getUTCDate(); return m === 11 || (m === 0 && n < 15); };
export function SnowFx() {
  if (S.settings.snow === false || S.settings.anim === false || !snowSeason()) return null;
  return html`<div class="snowfx" aria-hidden="true">${Array.from({ length: 16 }, (_, i) => html`<i key=${i} style=${`left:${(i * 6.3 + 2) % 100}%;animation-duration:${9 + (i * 7) % 9}s;animation-delay:-${(i * 13) % 17}s;font-size:${9 + (i * 5) % 8}px;opacity:${0.35 + ((i * 3) % 5) / 12}`}>❄</i>`)}</div>`;
}
