// Покупки за рубли (ЮKassa): блок в окне «Листики и Премиум» и окно подтверждения. Серверная часть — server/pay.js.
import { html, useState, useEffect, S, rpc, toast, Icon, cx, openModal, closeModal, Modal, on, local, Spinner } from './lib.js';
import { sfx, confetti } from './fun.js';

// Открыть ссылку в браузере телефона: из приложения — через мост (там уже есть такое действие),
// в обычном браузере — обычным переходом.
const openBrowser = url => {
  try { const a = window.NudistApp; if (a && typeof a.openBrowser === 'function') { a.openBrowser(url); return; } } catch (e) { /* старые сборки */ }
  location.assign(url);
};

const rub = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₽';
let cache = null;
export const payInfo = async () => (cache = await rpc('pay.info'));

// Окно перед оплатой: что покупаем, сколько стоит, почта для чека, ссылка на оферту.
function BuyDlg({ id, item, info }) {
  const [email, setEmail] = useState(info.email || local.get('pay.email') || ''), [busy, setBusy] = useState(false);
  const go = async () => {
    if (info.storeBuild) {
      // Из магазинной сборки: одноразовая ссылка на оплату в браузере (правило RuStore 9.1).
      setBusy(true);
      try {
        const r = await rpc('pay.link', { item: item.id });
        if (r && r.url) { openBrowser(r.url); closeModal(id); return; }
      } catch (e) { toast(e.message, 'err'); }
      setBusy(false); return;
    }
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
  const [d, setD] = useState(cache), [busy, setBusy] = useState('');
  useEffect(() => { let live = true; payInfo().then(r => live && setD(r)).catch(() => {}); return () => { live = false; }; }, []);
  if (!d) return html`<div class="payb"><${Spinner} /></div>`;
  // Приложение из RuStore: цифровые покупки идут через сайт, но не картой внутри приложения.
  // Нажатие открывает браузер телефона с одноразовой ссылкой — платить там удобно и безопасно.
  if (d.storeBuild) {
    const buyInBrowser = it => {
      setBusy(it.id);
      rpc('pay.link', { item: it.id })
        .then(r => { if (r && r.url) { openBrowser(r.url); } else toast('Не удалось открыть оплату', 'err'); })
        .catch(e => toast(e.message, 'err'))
        .then(() => setBusy(''));
    };
    return html`<div class="payb"><h3><${Icon} n="credit-card" s=${17} /> Подписка и листики</h3>
      <p class="hint">Оплата откроется в браузере на защищённой странице — это одна кнопка, входить заново не нужно. Так требуют правила RuStore для приложений из магазина.</p>
      <h5>Подписка на 30 дней</h5><div class="payb-g">${prem.map(i => html`<button class="payb-i" disabled=${busy === i.id} onClick=${() => buyInBrowser(i)}><b>${i.short}</b><span>${busy === i.id ? '…' : rub(i.rub)}</span></button>`)}</div>
      <h5>Листики</h5><div class="payb-g">${leaves.map(i => html`<button class="payb-i" disabled=${busy === i.id} onClick=${() => buyInBrowser(i)}><b>${i.short}</b><span>${busy === i.id ? '…' : rub(i.rub)}</span></button>`)}</div>
      <p class="hint">Купить можно только в приложении из магазина — в том числе из RuStore. <a href="/pay" target="_blank" rel="noopener">Цены и условия</a> · <a href="/offer" target="_blank" rel="noopener">Оферта</a></p></div>`;
  }
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
