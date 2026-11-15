// Подарки: витрина, карточка в чате, полка подарков в профиле.
import { html, useState, useEffect, S, bump, rpc, call, toast, Icon, Avatar, cx, openModal, closeModal, Modal, userName, fmtNum, fmtFull, confirmDlg, promptDlg, Empty, Spinner, plural } from './lib.js';
import { confetti, sfx } from './fun.js';

let CAT = null;      // витрина приходит с сервера один раз
const catalog = async () => (CAT = await rpc('gift.catalog'));      // каждый раз заново: у лимитированных меняется остаток
const num = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const giftWord = n => plural(n, ['подарок', 'подарка', 'подарков']);
const learn = users => { for (const k in users || {}) S.users[k] = { ...S.users[k], ...users[k] }; };

export const openGiftShop = to => { if (!S.flags.stars) return toast('Подарки временно отключены', 'err'); openModal(GiftShop, { to }); };
export const openGifts = user => openModal(GiftShelfModal, { user });

function GiftShop({ id, to }) {
  const [cat, setCat] = useState(CAT), [sel, setSel] = useState(null), [text, setText] = useState(''), [anon, setAnon] = useState(false), [busy, setBusy] = useState(false);
  const u = S.users[to] || {}, have = S.me.stars || 0, g = cat && cat.gifts.find(x => x.id === sel);
  useEffect(() => { catalog().then(setCat).catch(e => { toast(e.message, 'err'); closeModal(id); }); }, []);
  const send = async () => {
    if (!g || busy) return; setBusy(true); const r = await call('gift.send', { to, gift: g.id, text: text.trim(), anon }); setBusy(false); if (!r) return;
    closeModal(id); confetti(); sfx('fanfare'); toast(`${g.e} ${g.name} — подарок отправлен: ${userName(u)}`);
  };
  return html`<${Modal} id=${id} title="Подарок" icon="gift" cls="small" footer=${html`<button class="btn ghost" onClick=${() => closeModal(id)}>Отмена</button><button class="btn" disabled=${!g || busy || g.price > have} onClick=${send}><${Icon} n="gift" s=${16} /> ${g ? `Подарить · ${num(g.price)} 🍃` : 'Выберите подарок'}</button>`}>
    <div class="gift-to"><${Avatar} u=${u} src=${u.avatar} name=${userName(u)} color=${u.color} s=${36} /><span>Подарок для <b>${userName(u)}</b></span><em>у вас ${fmtNum(have)} 🍃</em></div>
    ${!cat ? html`<${Spinner} />` : html`<div class="gift-grid" role="listbox" aria-label="Витрина подарков">${cat.gifts.map(x => html`<button role="option" aria-selected=${sel === x.id} class=${cx('gift-cell', sel === x.id && 'on', (x.price > have || x.left === 0) && 'poor', x.lim && 'lim')} disabled=${x.left === 0} onClick=${() => setSel(x.id)} title=${x.name}>${x.lim && html`<i class="gc-l">${x.left ? `${x.left} из ${x.lim}` : 'разошёлся'}</i>`}<span class="gc-e">${x.e}</span><span class="gc-n">${x.name}</span><span class="gc-p">${num(x.price)} 🍃</span></button>`)}</div>`}
    ${g && html`<label class="fld"><span>Открытка, если хочется</span><input maxlength="120" value=${text} placeholder="С днём рождения!" onInput=${e => setText(e.target.value)} onKeyDown=${e => e.key === 'Enter' && send()} /></label>
      <label class="check"><input type="checkbox" checked=${anon} onChange=${e => setAnon(e.target.checked)} /> Не показывать моё имя в профиле получателя</label>`}
    <p class=${cx('hint', g && g.price > have && 'err')}>${g && g.price > have ? `Не хватает ${num(g.price - have)} 🍃. Листики дают ежедневный бонус и «Листопад», их можно докупить в магазине.` : g && g.lim ? `Лимитированный подарок: всего ${g.lim} штук на всё приложение, у каждого свой номер. В магазин он не сдаётся — владелец может продать его другим на рынке.` : 'Подарок придёт карточкой в личный чат и останется в профиле получателя. Он сможет спрятать его или продать за 80% цены.'}</p><//>`;
}

// Карточка подарка в переписке
export function GiftCard({ m }) {
  const p = m.present, mine = m.from === S.me.id, who = userName(S.users[m.from]);
  return html`<div class="leafgift" data-mid=${m.id}><div class=${cx('pres-card', mine && 'mine')}>
    <span class="pres-e" aria-hidden="true">${p.e}</span><b>${p.name}</b>${p.no && html`<span class="pres-no">№ ${p.no} из ${p.lim}</span>`}<span class="pres-s">${mine ? 'Вы подарили' : 'Подарок от ' + who.split(' ')[0]} · ${num(p.price)} 🍃</span>${m.note && html`<q>${m.note}</q>`}
    <div class="pres-a">${mine ? html`<button class="btn sm" onClick=${() => openGiftShop((S.chats[m.chat] || {}).peer)}>Подарить ещё</button>` : html`<button class="btn sm" onClick=${() => openGifts(S.me.id)}>Мои подарки</button><button class="btn sm ghost" onClick=${() => openGiftShop(m.from)}>Подарить в ответ</button>`}</div></div></div>`;
}

function useGifts(user, tick) {
  const [d, setD] = useState(null);
  const load = () => rpc('gift.list', { user }).then(r => { learn(r.users); setD(r); }).catch(() => setD({ gifts: [], total: 0 }));
  useEffect(() => { setD(null); }, [user]);
  useEffect(() => { load(); }, [user, tick]);
  return [d, load];
}
// Полка в профиле. Видна всем: свои подарки, чужие подарки и кнопка «подарить». Спрятанные подарки видит только хозяин.
export function GiftShelf({ user }) {
  const me = user === S.me.id, [d, load] = useGifts(user, me ? 0 : S.me.stars);      // подарил из профиля — полка обновится сама
  if (!d) return null;
  const list = me ? d.gifts : d.gifts.filter(x => !x.hidden), give = !me && S.flags.stars;
  return html`<div class="pf-row gifts"><small>Подарки${d.total ? ' · ' + d.total : ''}</small>
    <div class="gift-shelf">${list.slice(0, 8).map(x => html`<button class=${cx('gs-i', x.hidden && 'hid')} title=${x.name + (x.hidden ? ' (спрятан, видите только вы)' : '')} onClick=${() => openModal(GiftView, { gift: x, onChange: load })}>${x.e}${x.no && html`<i class="gs-no">№${x.no}</i>`}</button>`)}${d.total > 8 && html`<button class="gs-i more" title="Все подарки" onClick=${() => openGifts(user)}>+${d.total - 8}</button>`}${give && html`<button class="gs-i give" title="Подарить подарок" aria-label="Подарить подарок" onClick=${() => openGiftShop(user)}><${Icon} n="gift" s=${19} /></button>`}</div>
    ${!d.total && html`<p class="dim">${me ? 'Пока пусто. Подарки от друзей появятся здесь, и их увидят все, кто откроет ваш профиль.' : 'Пока пусто. Можно стать первым.'}</p>`}</div>`;
}
// Все подарки человека сеткой: вкладка «Подарки» в профиле и окно «Мои подарки». Чужие подарки видны всем, спрятанные — только хозяину.
export function GiftGrid({ user, onTotal, onGive }) {
  const me = user === S.me.id, [d, load] = useGifts(user, me ? 0 : S.me.stars), total = d ? d.total : null;
  useEffect(() => { if (total !== null && onTotal) onTotal(total); }, [total]);
  if (!d) return html`<${Spinner} />`;
  const give = !me && S.flags.stars && html`<button class="btn wide" style="margin-top:12px" onClick=${() => { onGive && onGive(); openGiftShop(user); }}><${Icon} n="gift" s=${16} /> Подарить подарок</button>`;
  if (!d.total) return html`<div class="gift-tab"><${Empty} icon="gift" title="Подарков пока нет" text=${me ? 'Когда кто-нибудь вам что-то подарит, оно появится здесь, и это увидят все.' : 'Можно стать первым.'} />${give}</div>`;
  return html`<div class="gift-tab"><p class="hint">${d.total} ${giftWord(d.total)}${me ? '. Их видят все. Нажмите на подарок, чтобы спрятать его или продать.' : ''}</p>
    <div class="gift-grid">${d.gifts.map(x => html`<button class=${cx('gift-cell', x.hidden && 'hid')} title=${x.hidden ? 'Спрятан: видите только вы' : x.name} onClick=${() => openModal(GiftView, { gift: x, onChange: load })}><span class="gc-e">${x.e}</span><span class="gc-n">${x.name}</span><span class="gc-p">${x.ask ? `продаётся · ${num(x.ask)} 🍃` : x.no ? `№ ${x.no} из ${x.lim}` : x.hidden ? 'скрыт' : x.from ? userName(S.users[x.from]).split(' ')[0] : 'аноним'}</span></button>`)}</div>${give}</div>`;
}
function GiftShelfModal({ id, user }) {
  const me = user === S.me.id, u = S.users[user] || S.me;
  return html`<${Modal} id=${id} title=${me ? 'Мои подарки' : 'Подарки: ' + userName(u)} icon="gift" cls="small"><${GiftGrid} user=${user} onGive=${() => closeModal(id)} /><//>`;
}
function GiftView({ id, gift, onChange }) {
  const [x, setX] = useState(gift), mine = x.to === S.me.id, from = x.from && S.users[x.from];
  const hide = async () => { const r = await call('gift.hide', { id: x.id, on: !x.hidden }); if (r) { setX(r); toast(r.hidden ? 'Подарок спрятан: в профиле его видите только вы' : 'Подарок снова виден в профиле'); onChange && onChange(); } };
  const sell = async () => { if (!(await confirmDlg({ title: `Продать «${x.name}»?`, text: `Вы получите ${x.sell} 🍃, подарок исчезнет из профиля насовсем. Дарителю об этом не сообщат, но совесть — сообщит.`, ok: `Продать за ${x.sell} 🍃`, danger: true }))) return; const r = await call('gift.sell', { id: x.id }); if (r) { toast(`+${r.n} 🍃 Подарок продан`); sfx('coin'); onChange && onChange(); closeModal(id); } };
  const offer = async () => {
    const min = Math.ceil(x.price * 0.3), v = await promptDlg({ title: 'Выставить на рынок', label: 'Цена в листиках', value: String(x.ask || x.price), type: 'number', ok: 'Выставить', hint: `Не ниже ${num(min)} 🍃. С продажи спишется комиссия 10 %: при цене ${num(x.price)} вы получите ${num(x.price - Math.ceil(x.price * 0.1))} 🍃.` });
    if (v === null) return; const r = await call('gift.offer', { id: x.id, price: Math.floor(Number(v) || 0) }); if (r) { setX(r); toast(r.ask ? `Выставлено за ${num(r.ask)} 🍃` : 'Снято с продажи'); onChange && onChange(); }
  };
  const unoffer = async () => { const r = await call('gift.offer', { id: x.id, price: 0 }); if (r) { setX(r); toast('Снято с продажи'); onChange && onChange(); } };
  return html`<${Modal} id=${id} title="Подарок" icon="gift" cls="small">
    <div class="gift-view"><span class="gv-e">${x.e}</span><h3>${x.name}</h3>${x.no && html`<p class="gv-no">№ ${x.no} из ${x.lim} · лимитированный</p>`}<p class="dim">${num(x.price)} 🍃 · ${fmtFull(x.ts)}</p>${x.ask && html`<p class="gv-ask">Продаётся на рынке за ${num(x.ask)} 🍃</p>`}
      <p>${from ? html`От: <b>${userName(from)}</b>${x.anon ? ' (в профиле имя скрыто)' : ''}` : 'От: аноним'}</p>${x.text && html`<q>${x.text}</q>`}</div>
    ${mine && html`<div class="row wrap gv-a"><button class="btn ghost" onClick=${hide}><${Icon} n=${x.hidden ? 'eye' : 'eye-off'} s=${16} /> ${x.hidden ? 'Показывать в профиле' : 'Спрятать из профиля'}</button>${x.lim ? (x.ask ? html`<button class="btn ghost" onClick=${offer}>Изменить цену</button><button class="btn danger" onClick=${unoffer}>Снять с продажи</button>` : html`<button class="btn" onClick=${offer}><${Icon} n="tag" s=${16} /> Выставить на рынок</button>`) : html`<button class="btn danger" onClick=${sell}><${Icon} n="coins" s=${16} /> Продать за ${x.sell} 🍃</button>`}</div>`}<//>`;
}

// Лимитированные подарки и рынок: что ещё осталось в выпуске и что продают владельцы. Встроено во вкладку «Подарки» магазина.
export function GiftMarket() {
  const [d, setD] = useState(null), [busy, setBusy] = useState(false), have = S.me.stars || 0;
  const load = () => rpc('gift.market').then(r => { learn(r.users); setD(r); }).catch(e => { toast(e.message, 'err'); setD({ list: [], editions: [], fee: 10 }); });
  useEffect(() => { load(); }, []);
  if (!d) return html`<${Spinner} />`;
  const take = async g => {
    if (g.price > have) return toast(`Не хватает ${num(g.price - have)} 🍃`);
    if (!(await confirmDlg({ title: `${g.e} ${g.name}`, text: `Взять себе в коллекцию за ${num(g.price)} 🍃? Осталось ${g.left} из ${g.lim}. В магазин лимитированный подарок не сдаётся — потом его можно только продать другим на рынке.`, ok: 'Взять себе' }))) return;
    setBusy(true); const r = await call('gift.send', { to: S.me.id, gift: g.id }); setBusy(false); if (r) { toast(`${g.e} ${g.name} № ${r.no} — в вашей коллекции`); confetti(); sfx('fanfare'); load(); }
  };
  const buy = async x => {
    if (x.ask > have) return toast(`Не хватает ${num(x.ask - have)} 🍃`);
    if (!(await confirmDlg({ title: `${x.e} ${x.name} № ${x.no}`, text: `Купить у ${userName(S.users[x.to])} за ${num(x.ask)} 🍃?`, ok: 'Купить' }))) return;
    setBusy(true); const r = await call('gift.buy', { id: x.id, price: x.ask }); setBusy(false); if (r) { toast(`${x.e} ${x.name} № ${x.no} теперь ваш`); confetti(); sfx('coin'); load(); }
  };
  return html`<div class="gmk">
    <h4 class="shop-h">Лимитированные подарки<small>тираж на всё приложение</small></h4>
    <div class="gmk-ed">${d.editions.map(g => html`<div class=${cx('gmk-e', !g.left && 'out')} key=${g.id}><span class="gmk-em">${g.e}</span><div><b>${g.name}</b><small>${g.left ? `осталось ${g.left} из ${g.lim}` : `все ${g.lim} разошлись`}</small></div><button class="btn sm" disabled=${busy || !g.left} onClick=${() => take(g)}>${g.left ? num(g.price) + ' 🍃' : 'только с рук'}</button></div>`)}</div>
    <p class="hint">Подарить лимитированный подарок другу можно из его профиля или из чата — кнопкой «Подарить».</p>
    <h4 class="shop-h">Рынок<small>продают владельцы, комиссия ${d.fee} %</small></h4>
    ${d.list.length ? html`<div class="gmk-list">${d.list.map(x => { const o = S.users[x.to] || {}, mine = x.to === S.me.id; return html`<div class="gmk-i" key=${x.id}><span class="gmk-em">${x.e}</span><div><b>${x.name} № ${x.no}</b><small>из ${x.lim} · ${mine ? 'ваш' : userName(o)}</small></div>${mine ? html`<button class="btn sm ghost" onClick=${() => openModal(GiftView, { gift: x, onChange: load })}>${num(x.ask)} 🍃 · изменить</button>` : html`<button class="btn sm" disabled=${busy} onClick=${() => buy(x)}>${num(x.ask)} 🍃</button>`}</div>`; })}</div>` : html`<p class="dim">Пока никто ничего не продаёт. Свой лимитированный подарок можно выставить из окна «Мои подарки».</p>`}
    <button class="btn ghost" onClick=${() => openGifts(S.me.id)}><${Icon} n="gift" s=${16} /> Мои подарки</button></div>`;
}
