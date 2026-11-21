// Покупки за рубли (ЮKassa): блок в окне «Листики и Премиум» и окно подтверждения. Серверная часть — server/pay.js.
import { html, useState, useEffect, S, rpc, toast, Icon, cx, openModal, closeModal, Modal, on, local, Spinner } from './lib.js';
import { sfx, confetti } from './fun.js';

const rub = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₽';
let cache = null;
export const payInfo = async () => (cache = await rpc('pay.info'));

// Окно перед оплатой: что покупаем, сколько стоит, почта для чека, ссылка на оферту.
function BuyDlg({ id, item, info }) {
  const [email, setEmail] = useState(info.email || local.get('pay.email') || ''), [busy, setBusy] = useState(false);
  const go = async () => {
    if (info.storeBuild) return toast('В приложении из RuStore покупки за рубли не проводятся. Оформите подписку на сайте — там доступна оплата картой.');
    if (!info.enabled) return toast('Оплата картой подключается: магазин проходит проверку в ЮKassa. Загляните чуть позже.');
    setBusy(true);
    try { if (email) local.set('pay.email', email.trim()); const r = await rpc('pay.create', { item: item.id, email: email.trim(), origin: location.origin }); local.set('pay.order', r.order); location.assign(r.url); }
    catch (e) { toast(e.message, 'err'); setBusy(false); }
  };
  return html`<${Modal} id=${id} title="Покупка" icon="credit-card" footer=${html`<button class="btn ghost" onClick=${() => closeModal(id)}>Отмена</button><button class="btn" disabled=${busy} onClick=${go}>${busy ? 'Открываем оплату…' : `Оплатить ${rub(item.rub)}`}</button>`}>
    <div class="buy">
      <div class="buy-i"><b>${item.title}</b><span class="buy-p">${rub(item.rub)}</span></div>
      <p>${item.kind === 'plan' ? `Подписка на ${item.days} дней. Разовый платёж: само ничего не продлевается и повторно не списывается.` : `${item.n} листиков зачислятся на ваш счёт. Листики тратятся только внутри «Нудиста» и обратно на рубли не меняются.`}</p>
      <label class="fld"><span>Почта для чека${info.receipt ? '' : ' (необязательно)'}</span><input type="email" inputmode="email" autocomplete="email" placeholder="you@example.com" value=${email} onInput=${e => setEmail(e.target.value)} /></label>
      <p class="hint">Оплата проходит на защищённой странице ЮKassa — данные карты мы не видим. Покупка зачисляется автоматически, обычно за минуту. Нажимая «Оплатить», вы принимаете <a href="/offer" target="_blank" rel="noopener">оферту</a>. Вопросы и возврат — <a href="/contacts" target="_blank" rel="noopener">контакты</a>.</p>
      ${!info.enabled && html`<p class="hint buy-off">Оплата картой пока подключается. Как только ЮKassa закончит проверку, кнопка заработает.</p>`}
    </div><//>`;
}
export async function buyItem(itemId) {
  try { const info = cache || await payInfo(), item = info.items.find(i => i.id === itemId); if (!item) return toast('Такого товара нет', 'err'); openModal(BuyDlg, { item, info }); }
  catch (e) { toast(e.message, 'err'); }
}

// Блок «Купить за рубли» в окне «Листики и Премиум».
export function PayBlock() {
  const [d, setD] = useState(cache);
  useEffect(() => { let live = true; payInfo().then(r => live && setD(r)).catch(() => {}); return () => { live = false; }; }, []);
  if (!d) return html`<div class="payb"><${Spinner} /></div>`;
  // Приложение из RuStore: покупки за рубли — через магазин. Блок ЮKassa не показываем (правило 9.1),
  // премиум и листики там выдаются за активности и за просмотр рекламы.
  if (d.storeBuild) return html`<div class="payb"><h3><${Icon} n="credit-card" s=${17} /> Подписка и листики</h3>
    <p class="hint">В приложении из RuStore покупки за рубли не проводятся — так требуют правила магазина. Премиум и листики выдаются за активности, конкурсы и приглашённых друзей. Оформить подписку можно <a href="https://95-174-95-148.sslip.io" target="_blank" rel="noopener">на сайте «Нудиста»</a>.</p></div>`;
  const prem = d.items.filter(i => i.kind === 'plan'), leaves = d.items.filter(i => i.kind === 'leaves');
  const Row = ({ list }) => html`<div class="payb-g">${list.map(i => html`<button class="payb-i" onClick=${() => openModal(BuyDlg, { item: i, info: d })}><b>${i.short}</b><span>${rub(i.rub)}</span></button>`)}</div>`;
  return html`<div class="payb"><h3><${Icon} n="credit-card" s=${17} /> Купить за рубли</h3>
    <h5>Подписка на 30 дней</h5><${Row} list=${prem} /><h5>Листики</h5><${Row} list=${leaves} />
    <p class="hint">Оплата через ЮKassa: карты, СБП. <a href="/pay" target="_blank" rel="noopener">Цены и условия</a> · <a href="/offer" target="_blank" rel="noopener">Оферта</a> · <a href="/contacts" target="_blank" rel="noopener">Реквизиты</a></p></div>`;
}

// Оплата подтверждена, пока приложение открыто
on('pay.done', () => { local.set('pay.order', ''); toast('Оплата получена — покупка уже у вас. Спасибо!'); try { confetti(); sfx('fanfare'); } catch (e) { /* без фанфар */ } });
// Вернулись в приложение после оплаты в браузере: переспросим сервер, не пришла ли покупка
const recheck = () => { const o = local.get('pay.order'); if (!o || !S.ready) return; rpc('pay.check', { order: o }).then(r => { if (r.status !== 'pending') local.set('pay.order', ''); }).catch(() => local.set('pay.order', '')); };
on('init', () => setTimeout(recheck, 1500));
document.addEventListener('visibilitychange', () => { if (!document.hidden) recheck(); });
