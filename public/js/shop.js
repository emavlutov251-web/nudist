// Магазин: украшения за листики, подписка Plus / Pro / Max, наборы, листики за рубли, сезон. Серверная часть — server/shop.js.
import { html, useState, useEffect, S, rpc, toast, Icon, Avatar, cx, openModal, Modal, userName, confirmDlg, promptDlg, setSetting, Spinner, on, Nm } from './lib.js';
import { sfx, confetti, Sticker, PACKS } from './fun.js';
import { buyItem } from './pay.js';

const num = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const TIER = { plus: 'Plus', pro: 'Pro', max: 'Max' };
const INCLUDED = { plus: ['common'], pro: ['common', 'rare'], max: ['common', 'rare', 'epic', 'legendary'] };
const RARITY = { common: 'обычная', rare: 'редкая', epic: 'эпическая', legendary: 'легендарная' };
// Редкость вещей: нужна, чтобы без запроса к серверу понять, входит ли вещь в тариф (стикеры в панели, темы в настройках).
const ITEM_TIER = { stickers_space: 'common', stickers_party: 'common', stickers_memes: 'rare', stickers_anime: 'epic', theme_sand: 'common', theme_forest: 'rare', theme_neon: 'epic', theme_void: 'epic' };
export const SHOP_THEMES = [['sand', 'Песок'], ['forest', 'Лес'], ['neon', 'Неон'], ['void', 'Пустота']];
export const hasItem = id => { const me = S.me || {}; return (me.owned || []).includes(id) || !!(me.tier && ITEM_TIER[id] && INCLUDED[me.tier].includes(ITEM_TIER[id])); };
export const openShop = tab => openModal(ShopModal, { tab });

// ───── эффект сообщения: короткая вспышка над пузырём, когда сообщение только что пришло
const FX = { sparkle: ['✨', '⭐', '💫'], hearts: ['💕', '❤️', '💖'], confetti: ['🎉', '🎊', '✨'], lightning: ['⚡', '💥', '⚡'] };
const played = new Set();
export function fxBurst(el, kind) {
  const set = FX[kind]; if (!el || !set || S.settings.anim === false || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
  const box = document.createElement('span'); box.className = 'fxb'; box.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 9; i++) { const s = document.createElement('i'); s.textContent = set[i % set.length]; s.style.cssText = `left:${6 + Math.random() * 88}%;--dx:${Math.round(Math.random() * 60 - 30)}px;--dy:${-30 - Math.round(Math.random() * 50)}px;--r:${Math.round(Math.random() * 80 - 40)}deg;animation-delay:${Math.round(Math.random() * 260)}ms;font-size:${13 + Math.round(Math.random() * 9)}px`; box.appendChild(s); }
  el.appendChild(box); setTimeout(() => box.remove(), 1900);
}
export function MsgFx({ m }) {
  const ref = n => { if (!n || played.has(m.id)) return; played.add(m.id); if (played.size > 400) played.clear(); if (Date.now() - m.ts < 9000) fxBurst(n.parentNode, m.fx); };
  return html`<i class="fx-anchor" ref=${ref}></i>`;
}

// ───── окно магазина
const KINDS = [['frame', 'Рамки аватара', 'видны всем'], ['gradient', 'Цвет имени', 'виден всем'], ['effect', 'Эффекты сообщений', 'видят собеседники'], ['theme', 'Темы оформления', 'видны только вам'], ['stickers', 'Наборы стикеров', '']];
const SLOT = { frame: 'frame', gradient: 'grad', effect: 'fx' };
function Preview({ it }) {
  const me = S.me;
  if (it.kind === 'frame') return html`<${Avatar} u=${{ cos: { f: it.id.slice(6) } }} src=${me.avatar} name=${userName(me)} color=${me.color} s=${52} />`;
  if (it.kind === 'gradient') return html`<b class="shop-nm"><${Nm} u=${{ cos: { g: it.colors } }} name=${userName(me)} /></b>`;
  if (it.kind === 'theme') return html`<span class=${'shop-sw sw-' + it.id.slice(6)}><i></i><i></i><i></i></span>`;
  if (it.kind === 'stickers') { const p = PACKS.find(x => x.id === it.pack); return p ? html`<${Sticker} st=${p.items[0]} size=${56} onClick=${() => {}} />` : html`<span class="shop-em">${it.emoji}</span>`; }
  return html`<span class="shop-em">${it.emoji}</span>`;
}
function ShopModal({ id, tab: tab0 }) {
  const [tab, setTab] = useState(tab0 || 'cosmetics'), [d, setD] = useState(null), [season, setSeason] = useState(null), [busy, setBusy] = useState(false);
  const me = S.me, worn = me.worn || {};
  const load = () => rpc('shop.catalog').then(setD).catch(e => toast(e.message, 'err'));
  useEffect(() => { load(); }, [me.stars, me.tier, (me.owned || []).length]);
  useEffect(() => { if (tab === 'season') rpc('season.get').then(setSeason).catch(e => toast(e.message, 'err')); }, [tab]);
  const run = async (fn, okText) => { if (busy) return null; setBusy(true); try { const r = await fn(); if (okText) toast(okText); await load(); return r; } catch (e) { toast(e.message, 'err'); return null; } finally { setBusy(false); } };
  const need = n => (me.stars || 0) < n ? (toast(`Не хватает ${num(n - (me.stars || 0))} 🍃. Листики можно докупить на вкладке «Листики».`), true) : false;
  const buy = async it => {
    if (need(it.price)) return;
    if (!(await confirmDlg({ title: it.name, text: `Купить за ${num(it.price)} 🍃?${it.off ? ` Скидка ${it.off} %${it.deal ? ' — сегодняшняя' : ' на первую покупку'}.` : ''} Вещь останется у вас навсегда.`, ok: 'Купить' }))) return;
    const r = await run(() => rpc('shop.buy', { id: it.id })); if (!r) return;
    sfx('coin'); confetti();
    if (it.kind === 'theme') setSetting({ theme: it.id.slice(6) });
    toast(it.kind === 'stickers' ? 'Набор куплен — он уже в панели стикеров.' : it.kind === 'theme' ? 'Тема куплена и включена. Сменить можно в «Настройки → Оформление».' : 'Куплено и надето.');
  };
  const wear = it => {
    if (it.kind === 'theme') { const k = it.id.slice(6), onNow = S.settings.theme === k; setSetting({ theme: onNow ? 'system' : k }); return toast(onNow ? 'Тема выключена' : 'Тема включена'); }
    if (it.kind === 'stickers') return toast('Набор уже в панели стикеров.');
    const onNow = worn[SLOT[it.kind]] === it.id;
    run(() => rpc('shop.equip', onNow ? { kind: it.kind } : { id: it.id }), onNow ? 'Снято' : 'Надето');
  };
  const isOn = it => it.kind === 'theme' ? S.settings.theme === it.id.slice(6) : worn[SLOT[it.kind]] === it.id;
  const buyPlanLeaves = async p => {
    if (need(p.stars)) return;
    if (!(await confirmDlg({ title: 'Нудист ' + p.name, text: `Спишется ${num(p.stars)} 🍃 за ${p.days} дней. Рубли при этом не списываются, само ничего не продлевается.`, ok: 'Оформить' }))) return;
    if (await run(() => rpc('shop.buyPlan', { id: p.id }))) { toast(`Тариф ${p.name} включён.`); confetti(); sfx('fanfare'); }
  };
  const giftPlan = async p => {
    const name = await promptDlg({ title: `Подарить «Нудист ${p.name}»`, label: 'Кому: username друга', placeholder: '@username', ok: 'Дальше', hint: `С вас спишется ${num(p.stars)} 🍃, друг получит ${p.days} дней подписки и сообщение от вас.` });
    if (!name || !name.trim()) return;
    try {
      const r = await rpc('user.get', { username: name.trim().replace(/^@/, '') }); S.users[r.user.id] = { ...S.users[r.user.id], ...r.user };
      if (need(p.stars)) return;
      if (!(await confirmDlg({ title: 'Подарок', text: `Подарить «Нудист ${p.name}» на ${p.days} дней — ${userName(r.user)}? Спишется ${num(p.stars)} 🍃.`, ok: 'Подарить' }))) return;
      if (await run(() => rpc('shop.giftPlan', { to: r.user.id, id: p.id }))) { toast('Подарок отправлен.'); confetti(); }
    } catch (e) { toast(e.message, 'err'); }
  };
  const trial = async () => { if (await run(() => rpc('shop.trial'))) { toast(`Pro включён на ${d.trial.days} дня. Ничего оплачивать не нужно, по окончании он просто выключится.`); confetti(); } };
  const buyBundle = async b => {
    if (need(b.price)) return;
    if (!(await confirmDlg({ title: 'Набор «' + b.name + '»', text: `Купить за ${num(b.price)} 🍃? По отдельности эти вещи стоят ${num(b.full)} 🍃.${b.fresh < b.items.length ? ' Часть уже есть у вас — за неё не берём.' : ''}`, ok: 'Купить' }))) return;
    if (await run(() => rpc('shop.buyBundle', { id: b.id }))) { toast('Набор куплен.'); confetti(); sfx('coin'); }
  };
  const claim = async t => { try { const r = await rpc('season.claim', { id: t.id }); setSeason(r.season); toast(`+${num(r.n)} 🍃 за задание`); sfx('coin'); } catch (e) { toast(e.message, 'err'); } };
  const TABS = [['cosmetics', 'Украшения'], ['plans', 'Подписка'], ['bundles', 'Наборы'], ['leaves', 'Листики'], ['season', 'Сезон']];
  const byName = idx => (d.items.find(i => i.id === idx) || {}).name;
  return html`<${Modal} id=${id} title="Магазин" icon="store" wide cls="shop">
    <div class="shop-top"><span class="shop-bal"><b>${num(me.stars || 0)} 🍃</b>${me.tier && html`<i class=${'shop-tier t-' + me.tier}>${TIER[me.tier]}${me.trialUntil && !me.paidTier ? ' · пробный' : ''}</i>`}</span>
      <div class="shop-tabs" role="tablist">${TABS.map(([k, l]) => html`<button role="tab" aria-selected=${tab === k} class=${cx(tab === k && 'on')} onClick=${() => setTab(k)}>${l}</button>`)}</div></div>
    ${!d ? html`<${Spinner} />` : html`<div class="shop-body">
      ${tab === 'cosmetics' && html`
        ${d.first > 0 && html`<p class="shop-note">Первая покупка украшения — со скидкой ${d.first} %.</p>`}
        ${KINDS.map(([k, title, sub]) => html`<h4 class="shop-h">${title}${sub && html`<small>${sub}</small>`}</h4>
          <div class="shop-grid">${d.items.filter(i => i.kind === k).map(it => { const mine = it.owned || it.included, onNow = mine && isOn(it); return html`<div class=${cx('shop-card', 'r-' + it.tier, mine && 'mine', onNow && 'worn')} key=${it.id}>
            ${it.deal && !mine && html`<i class="shop-deal" title="Скидка дня: только сегодня">−${it.off} %</i>`}
            <div class="shop-pv"><${Preview} it=${it} /></div>
            <b>${it.name}</b><small class="shop-r">${RARITY[it.tier]}${it.count ? ` · ${it.count} шт.` : ''}</small>
            ${mine ? html`<button class=${cx('btn sm', onNow ? 'ghost' : '')} disabled=${busy || it.kind === 'stickers'} onClick=${() => wear(it)}>${it.kind === 'stickers' ? 'В панели стикеров' : onNow ? (it.kind === 'theme' ? 'Выключить' : 'Снять') : (it.kind === 'theme' ? 'Включить' : 'Надеть')}</button>${!it.owned && html`<small class="shop-inc">входит в тариф</small>`}`
              : html`<button class="btn sm" disabled=${busy} onClick=${() => buy(it)}>${it.off ? html`<s>${num(it.base)}</s> ` : ''}${num(it.price)} 🍃</button>`}
          </div>`; })}</div>`)}`}
      ${tab === 'plans' && html`
        ${me.tier ? html`<p class="shop-note">Ваш тариф — ${TIER[me.tier]}${me.paidUntil ? `, оплачен до ${new Date(me.paidUntil).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}` : ''}${me.trialUntil ? `${me.paidUntil ? '; ' : ', '}пробный Pro до ${new Date(me.trialUntil).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}` : ''}.</p>` : d.trial.can && html`<div class="shop-trial"><div><b>Pro на ${d.trial.days} дня бесплатно</b><small>Один раз на аккаунт. Карта не нужна, потом ничего не спишется.</small></div><button class="btn" disabled=${busy} onClick=${trial}>Попробовать</button></div>`}
        ${me.tier && d.trial.can && html`<div class="shop-trial"><div><b>Pro на ${d.trial.days} дня бесплатно</b><small>Один раз на аккаунт. Оплаченный срок не тратится.</small></div><button class="btn" disabled=${busy} onClick=${trial}>Попробовать</button></div>`}
        <div class="shop-plans">${d.plans.map(p => html`<div class=${cx('shop-plan', 'p-' + p.id, me.tier === p.id && 'cur')} key=${p.id}>
          <h3><span>${p.emoji}</span> ${p.name}${me.tier === p.id && html`<i>ваш</i>`}</h3>
          <ul>${p.perks.map(x => html`<li><${Icon} n="check" s=${14} /> ${x}</li>`)}</ul>
          <div class="shop-plan-b"><button class="btn" disabled=${busy} onClick=${() => buyPlanLeaves(p)}>${num(p.stars)} 🍃</button><button class="btn ghost" onClick=${() => buyItem('plan_' + p.id)}>${p.rub} ₽</button></div>
          <a class="shop-gift" onClick=${() => giftPlan(p)}><${Icon} n="gift" s=${14} /> Подарить другу</a>
          <small>${p.days} дней, разовый платёж</small></div>`)}</div>
        <p class="hint">Тот же тариф продлевает срок. Если взять тариф выше, остаток прежнего пересчитается в дни нового по цене — оплаченное не сгорает. Автопродления нет.</p>`}
      ${tab === 'bundles' && html`<div class="shop-bundles">${d.bundles.map(b => html`<div class=${cx('shop-bundle', !b.fresh && 'mine')} key=${b.id}>
          <h3><span>${b.emoji}</span> ${b.name}</h3>
          <p>${b.items.map(byName).join(' · ')}</p>
          ${b.fresh ? html`<div class="shop-plan-b"><button class="btn" disabled=${busy} onClick=${() => buyBundle(b)}>${b.price < b.full ? html`<s>${num(b.full)}</s> ` : ''}${num(b.price)} 🍃</button>${b.price < b.full && html`<i class="shop-save">выгода ${Math.round(100 - b.price * 100 / b.full)} %</i>`}</div>` : html`<small class="shop-inc">всё уже есть</small>`}
        </div>`)}</div><p class="hint">Вещи из набора остаются навсегда. За то, что у вас уже есть, второй раз не берём.</p>`}
      ${tab === 'leaves' && html`
        <div class="shop-packs">${d.packs.map(p => html`<button class="shop-pack" key=${p.id} onClick=${() => buyItem(p.id)}><b>${num(p.stars)} 🍃</b><span>${p.rub} ₽</span>${p.bonus > 0 && html`<i>+${p.bonus} %</i>`}</button>`)}</div>
        <p class="hint">Оплата через ЮKassa: карты, СБП. Листики тратятся только внутри «Нудиста» и обратно на рубли не меняются. <a href="/pay" target="_blank" rel="noopener">Цены и условия</a> · <a href="/offer" target="_blank" rel="noopener">Оферта</a></p>
        <h4 class="shop-h">Бесплатно</h4>
        <ul class="shop-free"><li>Ежедневный бонус и «Листопад» — в окне «Листики».</li><li>Задания сезона — на соседней вкладке.</li><li>Позовите друга: 100 🍃 обоим и ${d.cashback.pct} % листиками с его покупок в магазине${d.cashback.got ? ` (уже вернулось ${num(d.cashback.got)} 🍃)` : ''}.</li></ul>`}
      ${tab === 'season' && (!season ? html`<${Spinner} />` : html`
        <p class="shop-note">Сезон — это месяц. Задания считаются сами, награду забираете кнопкой. До конца сезона ${Math.max(1, Math.ceil((season.end - Date.now()) / 864e5))} дн.${season.mult > 1 ? ` С вашим тарифом награды ×${String(season.mult).replace('.', ',')}.` : ' С тарифом Pro награды в полтора раза больше, с Max — вдвое.'}</p>
        <div class="shop-tasks">${season.tasks.map(t => html`<div class=${cx('shop-task', t.done && 'done', t.claimed && 'got')} key=${t.id}>
          <div class="st-m"><b>${t.text}</b><div class="st-bar"><i style=${`width:${Math.round(t.progress * 100 / t.n)}%`}></i></div><small>${num(t.progress)} из ${num(t.n)}</small></div>
          ${t.claimed ? html`<span class="st-ok"><${Icon} n="check" s=${16} /> получено</span>` : html`<button class="btn sm" disabled=${!t.done} onClick=${() => claim(t)}>+${num(t.stars)} 🍃</button>`}</div>`)}</div>
        <p class="hint">В зачёт идёт не больше 100 сообщений и 40 реакций в день, переписка с ботами не считается — так задания не превращаются в спам.</p>`)}
    </div>`}<//>`;
}
// Задание сезона выполнено, пока приложение открыто
on('season.done', () => toast('Задание сезона выполнено — награда ждёт в магазине, вкладка «Сезон».'));
