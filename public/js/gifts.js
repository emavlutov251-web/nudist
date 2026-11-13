// Подарки: витрина, карточка в чате, полка подарков в профиле.
import { html, useState, useEffect, S, bump, rpc, call, toast, Icon, Avatar, cx, openModal, closeModal, Modal, userName, fmtNum, fmtFull, confirmDlg, Empty, Spinner, plural } from './lib.js';
import { confetti, sfx } from './fun.js';

let CAT = null;      // витрина приходит с сервера один раз
const catalog = async () => CAT || (CAT = await rpc('gift.catalog'));
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
  return html`<${Modal} id=${id} title="Подарок" icon="gift" cls="small" footer=${html`<button class="btn ghost" onClick=${() => closeModal(id)}>Отмена</button><button class="btn" disabled=${!g || busy || g.price > have} onClick=${send}><${Icon} n="gift" s=${16} /> ${g ? `Подарить · ${g.price} 🍃` : 'Выберите подарок'}</button>`}>
    <div class="gift-to"><${Avatar} src=${u.avatar} name=${userName(u)} color=${u.color} s=${36} /><span>Подарок для <b>${userName(u)}</b></span><em>у вас ${fmtNum(have)} 🍃</em></div>
    ${!cat ? html`<${Spinner} />` : html`<div class="gift-grid" role="listbox" aria-label="Витрина подарков">${cat.gifts.map(x => html`<button role="option" aria-selected=${sel === x.id} class=${cx('gift-cell', sel === x.id && 'on', x.price > have && 'poor')} onClick=${() => setSel(x.id)} title=${x.name}><span class="gc-e">${x.e}</span><span class="gc-n">${x.name}</span><span class="gc-p">${x.price} 🍃</span></button>`)}</div>`}
    ${g && html`<label class="fld"><span>Открытка, если хочется</span><input maxlength="120" value=${text} placeholder="С днём рождения!" onInput=${e => setText(e.target.value)} onKeyDown=${e => e.key === 'Enter' && send()} /></label>
      <label class="check"><input type="checkbox" checked=${anon} onChange=${e => setAnon(e.target.checked)} /> Не показывать моё имя в профиле получателя</label>`}
    <p class=${cx('hint', g && g.price > have && 'err')}>${g && g.price > have ? `Не хватает ${g.price - have} 🍃. Листики дают ежедневный бонус и «Листопад».` : 'Подарок придёт карточкой в личный чат и останется в профиле получателя. Он сможет спрятать его или продать за 80% цены.'}</p><//>`;
}

// Карточка подарка в переписке
export function GiftCard({ m }) {
  const p = m.present, mine = m.from === S.me.id, who = userName(S.users[m.from]);
  return html`<div class="leafgift" data-mid=${m.id}><div class=${cx('pres-card', mine && 'mine')}>
    <span class="pres-e" aria-hidden="true">${p.e}</span><b>${p.name}</b><span class="pres-s">${mine ? 'Вы подарили' : 'Подарок от ' + who.split(' ')[0]} · ${p.price} 🍃</span>${m.note && html`<q>${m.note}</q>`}
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
    <div class="gift-shelf">${list.slice(0, 8).map(x => html`<button class=${cx('gs-i', x.hidden && 'hid')} title=${x.name + (x.hidden ? ' (спрятан, видите только вы)' : '')} onClick=${() => openModal(GiftView, { gift: x, onChange: load })}>${x.e}</button>`)}${d.total > 8 && html`<button class="gs-i more" title="Все подарки" onClick=${() => openGifts(user)}>+${d.total - 8}</button>`}${give && html`<button class="gs-i give" title="Подарить подарок" aria-label="Подарить подарок" onClick=${() => openGiftShop(user)}><${Icon} n="gift" s=${19} /></button>`}</div>
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
    <div class="gift-grid">${d.gifts.map(x => html`<button class=${cx('gift-cell', x.hidden && 'hid')} title=${x.hidden ? 'Спрятан: видите только вы' : x.name} onClick=${() => openModal(GiftView, { gift: x, onChange: load })}><span class="gc-e">${x.e}</span><span class="gc-n">${x.name}</span><span class="gc-p">${x.hidden ? 'скрыт' : x.from ? userName(S.users[x.from]).split(' ')[0] : 'аноним'}</span></button>`)}</div>${give}</div>`;
}
function GiftShelfModal({ id, user }) {
  const me = user === S.me.id, u = S.users[user] || S.me;
  return html`<${Modal} id=${id} title=${me ? 'Мои подарки' : 'Подарки: ' + userName(u)} icon="gift" cls="small"><${GiftGrid} user=${user} onGive=${() => closeModal(id)} /><//>`;
}
function GiftView({ id, gift, onChange }) {
  const [x, setX] = useState(gift), mine = x.to === S.me.id, from = x.from && S.users[x.from];
  const hide = async () => { const r = await call('gift.hide', { id: x.id, on: !x.hidden }); if (r) { setX(r); toast(r.hidden ? 'Подарок спрятан: в профиле его видите только вы' : 'Подарок снова виден в профиле'); onChange && onChange(); } };
  const sell = async () => { if (!(await confirmDlg({ title: `Продать «${x.name}»?`, text: `Вы получите ${x.sell} 🍃, подарок исчезнет из профиля насовсем. Дарителю об этом не сообщат, но совесть — сообщит.`, ok: `Продать за ${x.sell} 🍃`, danger: true }))) return; const r = await call('gift.sell', { id: x.id }); if (r) { toast(`+${r.n} 🍃 Подарок продан`); sfx('coin'); onChange && onChange(); closeModal(id); } };
  return html`<${Modal} id=${id} title="Подарок" icon="gift" cls="small">
    <div class="gift-view"><span class="gv-e">${x.e}</span><h3>${x.name}</h3><p class="dim">${x.price} 🍃 · ${fmtFull(x.ts)}</p>
      <p>${from ? html`От: <b>${userName(from)}</b>${x.anon ? ' (в профиле имя скрыто)' : ''}` : 'От: аноним'}</p>${x.text && html`<q>${x.text}</q>`}</div>
    ${mine && html`<div class="row wrap gv-a"><button class="btn ghost" onClick=${hide}><${Icon} n=${x.hidden ? 'eye' : 'eye-off'} s=${16} /> ${x.hidden ? 'Показывать в профиле' : 'Спрятать из профиля'}</button><button class="btn danger" onClick=${sell}><${Icon} n="coins" s=${16} /> Продать за ${x.sell} 🍃</button></div>`}<//>`;
}
