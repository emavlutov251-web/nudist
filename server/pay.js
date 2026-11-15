// Платные услуги за рубли через ЮKassa: подписка «Нудист Премиум» (тарифы Plus, Pro, Max) и наборы листиков.
// Страницы для покупателя и для проверки ЮKassa: /pay (цены и получение), /offer (оферта), /contacts (контакты и реквизиты).
// Приём денег включается, когда заданы YOOKASSA_SHOP_ID и YOOKASSA_SECRET; до этого кнопки «Купить» честно говорят, что оплата подключается.
// Зачисление: ЮKassa присылает уведомление на /api/yookassa/hook, сервер сам переспрашивает у ЮKassa состояние платежа
// (телу уведомления не верим) и ровно один раз выдаёт купленное. То же самое происходит, когда покупатель возвращается на /pay?order=….
const crypto = require('crypto');
const C = require('./core');
const R = require('./rpc');
const Shop = require('./shop');
const { db, save, now, need, str, emit } = C;
const H = R.H;

db.orders = db.orders || {};      // заказы: id → { id, user, item, rub, status: pending | paid | canceled | refunded, ts, pid, paidAt }
const API = (process.env.YOOKASSA_API || 'https://api.yookassa.ru/v3').replace(/\/+$/, '');
const SHOP = process.env.YOOKASSA_SHOP_ID || '', SECRET = process.env.YOOKASSA_SECRET || '';
const enabled = () => !!(SHOP && SECRET);
const RECEIPT = /^(on|1|true)$/i.test(process.env.YOOKASSA_RECEIPT || '');      // чеки самозанятого через ЮKassa («Мой налог»): включать после подключения услуги в кабинете
const SITE = (process.env.SITE_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, '');

// ───── что продаём за рубли: тарифы подписки и наборы листиков. Состав — в server/shop.js. Цены можно поменять переменной PAY_PRICES="plan_plus=99,leaves_s=99".
const ITEMS = [
  ...Object.values(Shop.PLANS).map(p => ({ id: 'plan_' + p.id, kind: 'plan', tier: p.id, days: p.days, rub: p.rub, stars: p.stars, title: `Подписка «Нудист ${p.name}» — ${p.days} дней`, short: p.name, perks: p.perks })),
  ...Object.entries(Shop.PACKS).map(([k, s]) => ({ id: 'leaves_' + k, kind: 'leaves', n: s.stars, rub: s.rub, title: `Набор «${s.name}»: ${String(s.stars).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} листиков`, short: String(s.stars).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' 🍃' })),
];
for (const part of String(process.env.PAY_PRICES || '').split(',')) { const [k, v] = part.split('=').map(s => s.trim()); const it = ITEMS.find(i => i.id === k), n = Math.round(Number(v)); if (it && n >= 1 && n <= 100000) it.rub = n; }
const item = idv => ITEMS.find(i => i.id === idv);
const PERKS = Shop.PLANS.plus.perks.map(t => ['leaf', t]);      // для старых версий приложения
const seller = () => ({ name: (process.env.SELLER_NAME || '').trim(), inn: (process.env.SELLER_INN || '').replace(/\D/g, ''), email: (process.env.SELLER_EMAIL || '').trim(), phone: (process.env.SELLER_PHONE || '').trim(), tg: (process.env.SELLER_TG || '').trim() });
const rubText = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₽';

// ───── ЮKassa
async function yk(method, path, body, key) {
  const h = { authorization: 'Basic ' + Buffer.from(SHOP + ':' + SECRET).toString('base64') };
  if (body) { h['content-type'] = 'application/json'; h['idempotence-key'] = key || crypto.randomUUID(); }
  const r = await fetch(API + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error('ЮKassa: ' + (j.description || j.code || 'HTTP ' + r.status)); e.status = r.status; throw e; }
  return j;
}

// Выдать купленное. Вызывается сколько угодно раз — срабатывает один.
function fulfil(o) {
  if (o.status === 'paid' || o.status === 'refunded') return false;
  const u = db.users[o.user], it = item(o.item); if (!u || !it) { o.status = 'paid'; o.paidAt = now(); o.lost = 1; save(); return false; }
  o.status = 'paid'; o.paidAt = now();
  let text;
  if (it.kind === 'plan') { Shop.grantPlan(u, it.tier, it.days); Shop.cashback(u, it.stars); text = `✅ **Оплата получена: ${it.title}.**\nПодписка действует до ${new Date(u.premiumUntil + 3 * 3600e3).toISOString().slice(0, 10).split('-').reverse().join('.')}. Спасибо, что поддерживаете «Нудист»!`; }
  else { u.stars = (u.stars || 0) + it.n; Shop.cashback(u, it.n); text = `✅ **Оплата получена: ${it.title}.**\nНа счёт зачислено ${it.n} 🍃. Спасибо, что поддерживаете «Нудист»!`; }
  u.shopN = (u.shopN || 0) + 1;
  save();
  try { R.selfUpdate(u); C.broadcastUser(u); } catch (e) { console.warn('[pay]', e.message); }
  try { const sys = db.meta.sys; if (sys && db.users[sys]) C.postMessage(C.openDm(sys, u.id), sys, { text: text + `\nЗаказ № ${o.id}.` }, { quiet: true }); } catch (e) { console.warn('[pay]', e.message); }
  try { emit(u.id, 'pay.done', { order: o.id, item: it.id }); } catch (e) { /* человек не в сети */ }
  console.log('[pay] оплачен заказ', o.id, it.id, o.rub + ' ₽');
  return true;
}
// Возврат денег: забираем выданное, насколько это ещё возможно.
function revoke(o) {
  if (o.status !== 'paid') return; const u = db.users[o.user], it = item(o.item); o.status = 'refunded'; o.refAt = now();
  if (u && it) { if (it.kind === 'plan') u.premiumUntil = Math.max(now(), (u.premiumUntil || 0) - it.days * 864e5); else u.stars = Math.max(0, (u.stars || 0) - it.n); try { R.selfUpdate(u); C.broadcastUser(u); } catch (e) { /* не в сети */ } }
  save(); console.log('[pay] возврат по заказу', o.id);
}
// Спросить у ЮKassa, что с платежом заказа, и привести заказ в соответствие.
async function sync(o) {
  if (!o || !o.pid || !enabled() || o.status === 'refunded') return o;
  const p = await yk('GET', '/payments/' + encodeURIComponent(o.pid));
  if (!p || (p.metadata || {}).order !== o.id) return o;
  const sum = Number((p.amount || {}).value);
  if (p.status === 'succeeded' && p.paid && sum === o.rub && (p.amount || {}).currency === 'RUB') { if (Number((p.refunded_amount || {}).value) >= o.rub) { fulfil(o); revoke(o); } else fulfil(o); }
  else if (p.status === 'canceled' && o.status === 'pending') { o.status = 'canceled'; save(); }
  return o;
}

H['pay.info'] = c => ({ enabled: enabled(), receipt: RECEIPT, items: ITEMS.map(i => ({ id: i.id, kind: i.kind, title: i.title, short: i.short, rub: i.rub, days: i.days, n: i.n, tier: i.tier })), perks: PERKS, email: (db.users[c.uid] || {}).email || '' });
H['pay.create'] = async (c, p) => {
  const u = db.users[c.uid], it = item(str(p.item, 32)); need(it, 'Такого товара нет');
  need(enabled(), 'Оплата картой подключается: магазин проходит проверку в ЮKassa. Загляните чуть позже.');
  const email = str(p.email, 120).trim(); if (RECEIPT) need(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email), 'Укажите почту — на неё придёт чек');
  const fresh = Object.values(db.orders).filter(o => o.user === u.id && now() - o.ts < 3600e3).length; need(fresh < 20, 'Слишком много попыток оплаты за час. Передохните.');
  const origin = SITE || (/^https:\/\/[\w.-]+(:\d+)?$/.test(String(p.origin || '')) ? p.origin : ''); need(origin, 'Не удалось определить адрес сайта для возврата после оплаты');
  const o = { id: crypto.randomBytes(9).toString('base64url'), user: u.id, item: it.id, rub: it.rub, status: 'pending', ts: now() };
  const amount = { value: it.rub.toFixed(2), currency: 'RUB' };
  const body = { amount, capture: true, description: `${it.title}. Заказ ${o.id}`.slice(0, 128), confirmation: { type: 'redirect', return_url: origin + '/pay?order=' + o.id }, metadata: { order: o.id, user: u.id, item: it.id } };
  if (RECEIPT) body.receipt = { customer: { email }, items: [{ description: it.title.slice(0, 128), quantity: '1.00', amount, vat_code: 1, payment_subject: 'service', payment_mode: 'full_payment' }] };
  const pay = await yk('POST', '/payments', body, o.id).catch(e => { console.warn('[pay]', e.message); need(false, 'Платёжный сервис не ответил. Деньги не списаны, попробуйте ещё раз.'); });
  const url = pay && pay.confirmation && pay.confirmation.confirmation_url; need(pay.id && /^https:\/\//.test(url || '') || (API.startsWith('http://') && url), 'Платёжный сервис ответил непонятно. Деньги не списаны.');
  o.pid = pay.id; db.orders[o.id] = o;
  const all = Object.values(db.orders); if (all.length > 5000) for (const x of all.filter(x => x.status !== 'paid').sort((a, b) => a.ts - b.ts).slice(0, all.length - 5000)) delete db.orders[x.id];      // неоплаченное старьё не копим
  save();
  return { order: o.id, url };
};
H['pay.check'] = async (c, p) => { const o = db.orders[str(p.order, 32)]; need(o && o.user === c.uid, 'Заказ не найден'); await sync(o).catch(e => console.warn('[pay]', e.message)); return { status: o.status, item: o.item }; };
H['pay.orders'] = c => ({ list: Object.values(db.orders).filter(o => o.user === c.uid && o.status !== 'pending').sort((a, b) => b.ts - a.ts).slice(0, 30).map(o => ({ id: o.id, item: o.item, title: (item(o.item) || {}).title, rub: o.rub, status: o.status, ts: o.paidAt || o.ts })) });

// Уведомление от ЮKassa. Что бы ни было в теле, решение принимается только по ответу самой ЮKassa на наш запрос.
async function hook(b) {
  const ob = b && b.object; if (!ob || typeof ob !== 'object' || !enabled()) return { ok: true };
  const pid = String(b.event || '').startsWith('refund.') ? ob.payment_id : ob.id; if (typeof pid !== 'string' || !/^[\w-]{10,60}$/.test(pid)) return { ok: true };
  const o = Object.values(db.orders).find(x => x.pid === pid); if (!o) return { ok: true };
  await sync(o);
  return { ok: true };
}

// ───── страницы
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const CSS = `*{box-sizing:border-box;margin:0}html,body{min-height:100%}body{font:16px/1.55 "Segoe UI",system-ui,-apple-system,Roboto,Arial,sans-serif;color:#EAF3EE;background:#0E191B;background-image:radial-gradient(120% 60% at 50% -10%,#1F9D57 0%,rgba(31,157,87,.22) 36%,rgba(14,25,27,0) 68%);background-attachment:fixed;padding:20px 14px 40px}
main{width:100%;max-width:760px;margin:0 auto;display:flex;flex-direction:column;gap:16px}a{color:#6EE7A8}
.top{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.brand{display:flex;align-items:center;gap:8px;font-weight:600;color:inherit;text-decoration:none;margin-right:auto}.brand img{width:30px;height:30px}.top nav{display:flex;gap:14px;flex-wrap:wrap;font-size:14px}
h1{font-size:28px;line-height:1.15}h2{font-size:20px;line-height:1.25;margin-top:6px}h3{font-size:16px}p,li{color:#D5E3DC}.lead{font-size:17px}.muted{opacity:.72;font-size:14px}
.card{background:rgba(25,41,44,.92);border:1px solid rgba(255,255,255,.09);border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:10px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px}.good{background:rgba(0,0,0,.22);border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:6px}.good b{font-size:16px;line-height:1.25}.good .price{font-size:24px;font-weight:700;color:#fff}.good small{opacity:.75;font-size:13.5px;line-height:1.35}.perks{font-size:14px;gap:2px;padding-left:18px}.perks li{color:#C9D8D0}
.btn{font:inherit;border:0;border-radius:12px;min-height:46px;padding:0 16px;color:#fff;background:#1F9D57;font-weight:600;display:flex;align-items:center;justify-content:center;text-decoration:none;text-align:center;margin-top:auto}.btn:active{transform:scale(.98)}
ul,ol{padding-left:22px;display:flex;flex-direction:column;gap:4px}table{width:100%;border-collapse:collapse}td{padding:7px 8px;border-bottom:1px solid rgba(255,255,255,.08);vertical-align:top}td:first-child{opacity:.7;width:38%}
.note{border-left:3px solid #35C97A;padding:8px 12px;background:rgba(53,201,122,.09);border-radius:0 10px 10px 0}.warn{border-left-color:#F2B84B;background:rgba(242,184,75,.1)}.ok{font-size:18px;font-weight:600}
footer{max-width:760px;margin:22px auto 0;font-size:13.5px;opacity:.75;display:flex;flex-direction:column;gap:6px;text-align:center}footer nav{display:flex;gap:14px;justify-content:center;flex-wrap:wrap}`;
function rekv(short) {
  const s = seller();
  if (!s.name || !s.inn) return '<p class="note warn">Реквизиты продавца заполняются. Пока их нет, оплата на сайте не принимается.</p>';
  return short ? `${esc(s.name)}, плательщик налога на профессиональный доход (самозанятый), ИНН ${esc(s.inn)}${s.email ? `, <a href="mailto:${esc(s.email)}">${esc(s.email)}</a>` : ''}`
    : `<table><tr><td>Продавец</td><td>${esc(s.name)}</td></tr><tr><td>Статус</td><td>Плательщик налога на профессиональный доход (самозанятый)</td></tr><tr><td>ИНН</td><td>${esc(s.inn)}</td></tr>${s.email ? `<tr><td>Электронная почта</td><td><a href="mailto:${esc(s.email)}">${esc(s.email)}</a></td></tr>` : ''}${s.phone ? `<tr><td>Телефон</td><td>${esc(s.phone)}</td></tr>` : ''}${s.tg ? `<tr><td>Telegram</td><td>${esc(s.tg)}</td></tr>` : ''}<tr><td>Поддержка в сервисе</td><td>В приложении: «Хаб» → «Поддержка». Отвечаем обычно в течение суток.</td></tr></table>`;
}
function shell(title, desc, body) {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>${esc(title)} · Нудист</title><meta name="description" content="${esc(desc)}"><meta property="og:title" content="${esc(title)} · Нудист"><meta property="og:description" content="${esc(desc)}"><meta property="og:image" content="/og.png"><meta name="theme-color" content="#0E191B"><link rel="icon" href="/icon.svg"><style>${CSS}</style></head><body><main>
<div class="top"><a class="brand" href="/"><img src="/icon.svg" alt="">Нудист</a><nav><a href="/pay">Цены и оплата</a><a href="/offer">Оферта</a><a href="/contacts">Контакты и реквизиты</a><a href="/privacy">Конфиденциальность</a></nav></div>
${body}</main><footer><nav><a href="/">Открыть «Нудист»</a><a href="/pay">Цены и оплата</a><a href="/offer">Оферта</a><a href="/contacts">Контакты и реквизиты</a><a href="/privacy">Политика конфиденциальности</a></nav><span>${rekv(true).startsWith('<p') ? 'Мессенджер «Нудист»' : rekv(true)}</span></footer></body></html>`;
}
const good = i => `<div class="good"><b>${esc(i.title)}</b><span class="price">${rubText(i.rub)}</span>${i.kind === 'plan' ? `<ul class="perks">${i.perks.map(t => `<li>${esc(t)}</li>`).join('')}</ul><small>Разовый платёж за ${i.days} дней. Автоматического продления и повторных списаний нет.</small>` : `<small>${String(i.n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} листиков зачисляются на счёт аккаунта и тратятся внутри «Нудиста».</small>`}<a class="btn" href="/#buy=${i.id}">Купить</a></div>`;
const COSM = { frame: 'рамки для аватара', gradient: 'цветное имя', effect: 'эффекты сообщений', theme: 'темы оформления', stickers: 'наборы стикеров' };

async function payPage(orderId) {
  let status = '';
  if (orderId) {
    const o = db.orders[String(orderId).slice(0, 32)];
    if (o) { await sync(o).catch(e => console.warn('[pay]', e.message)); const it = item(o.item) || { title: 'Заказ' };
      status = o.status === 'paid' ? `<section class="card"><p class="ok">✅ Оплата прошла: ${esc(it.title)}</p><p>Заказ № ${esc(o.id)}. Купленное уже на вашем аккаунте — вернитесь в приложение. Подтверждение пришло сообщением от бота «Нудист».</p><a class="btn" href="/">Вернуться в «Нудист»</a></section>`
        : o.status === 'canceled' ? `<section class="card"><p class="ok">Оплата не прошла</p><p>Заказ № ${esc(o.id)} отменён, деньги не списаны. Можно попробовать ещё раз.</p><a class="btn" href="/#buy=${esc(o.item)}">Попробовать снова</a></section>`
        : o.status === 'refunded' ? `<section class="card"><p class="ok">Деньги возвращены</p><p>По заказу № ${esc(o.id)} оформлен возврат.</p></section>`
        : `<section class="card"><p class="ok">⏳ Ждём подтверждение оплаты</p><p>Заказ № ${esc(o.id)}. Обычно это занимает меньше минуты. Обновите страницу чуть позже; если деньги списались, а покупка не пришла за 15 минут — напишите нам, вернём или зачислим вручную.</p><a class="btn" href="/pay?order=${esc(o.id)}">Обновить</a></section>`;
    } else status = '<section class="card"><p class="ok">Заказ не найден</p><p>Проверьте ссылку или откройте покупки в приложении.</p></section>';
  }
  const prem = ITEMS.filter(i => i.kind === 'plan'), leaves = ITEMS.filter(i => i.kind === 'leaves'), cos = Object.values(Shop.CATALOG).filter(x => x.price > 0), cmin = Math.min(...cos.map(x => x.price)), cmax = Math.max(...cos.map(x => x.price));
  return shell('Цены и оплата', 'Платные услуги мессенджера «Нудист»: подписка Премиум трёх тарифов и наборы листиков. Цены, описание, порядок получения и возврата.', `${status}
<h1>Цены и оплата</h1>
<p class="lead">«Нудист» — мессенджер с чатами, каналами, лентой и играми. Пользоваться им можно бесплатно. За деньги продаются две цифровые услуги: подписка «Нудист Премиум» трёх тарифов и наборы листиков — внутренних значков, которые тратятся внутри сервиса.</p>
<section class="card"><h2>Подписка «Нудист Премиум»</h2><p>Три тарифа на ${prem[0].days} дней. Каждый следующий включает всё из предыдущего.</p><div class="grid">${prem.map(good).join('')}</div><p class="muted">Срок считается с момента оплаты. Тот же тариф продлевает срок. Если берёте тариф выше действующего, остаток прежнего пересчитывается в дни нового по цене; если ниже — купленные дни так же пересчитываются в дни действующего. Оплаченное не сгорает.</p></section>
<section class="card"><h2>Наборы листиков</h2><p>Листики 🍃 — внутренние значки «Нудиста». Их можно получить и бесплатно (ежедневный бонус, мини-игры, задания сезона, приглашения), а можно купить набором. На что они тратятся в магазине приложения:</p><ul><li>украшения профиля — ${Object.values(COSM).join(', ')}: ${cos.length} вещей по цене от ${cmin} до ${cmax} листиков;</li><li>наборы украшений со скидкой;</li><li>подписка «Нудист Премиум» любого тарифа — себе или в подарок;</li><li>пропуск сезона с наградами за активность;</li><li>подарки другим пользователям (в том числе лимитированные, которые можно перепродать другим пользователям за листики), чаевые авторам сообщений, буст клуба, подписка на платные каналы.</li></ul><div class="grid">${leaves.map(good).join('')}</div><p class="muted">Листики не являются деньгами или электронным средством платежа: их нельзя обменять обратно на рубли, вывести или продать.</p></section>
<section class="card" id="delivery"><h2>Как получить покупку</h2><ol><li>Войдите в свой аккаунт «Нудиста» (или зарегистрируйтесь — это бесплатно).</li><li>Нажмите «Купить» и оплатите на защищённой странице ЮKassa.</li><li>Покупка зачисляется на аккаунт автоматически, обычно в течение минуты после оплаты. Подтверждение приходит сообщением от бота «Нудист».</li></ol><p>Это цифровые услуги: доставка курьером, почтой и самовывоз не требуются и не производятся. Услуга оказывается через интернет, в любом месте, где открывается сайт или приложение.</p><p class="note">Если деньги списались, а покупка не появилась в течение 15 минут — напишите на почту из раздела «Контакты» или в поддержку в приложении и укажите номер заказа. Зачислим вручную или вернём деньги.</p></section>
<section class="card" id="payment"><h2>Способы оплаты</h2><p>Оплата проходит через платёжный сервис ЮKassa: банковские карты «Мир», Visa и Mastercard российских банков, СБП, SberPay, T‑Pay, ЮMoney — список зависит от того, что доступно на странице оплаты. Данные карты вводятся на стороне ЮKassa и нам не передаются. Цены указаны в рублях, НДС не облагается (продавец применяет налог на профессиональный доход). После оплаты формируется чек.</p></section>
<section class="card" id="refund"><h2>Возврат</h2><ul><li>Покупка не зачислилась — вернём деньги полностью или зачислим вручную, как вам удобнее.</li><li>Подписка: можно отказаться в любой момент. Вернём стоимость неиспользованных дней.</li><li>Листики: вернём деньги за неизрасходованные листики из купленного набора. Потраченные листики возврату не подлежат.</li><li>Заявку пишите на почту из раздела «Контакты» с адреса, указанного при оплате, или из своего аккаунта в поддержку. Рассматриваем до 10 дней, деньги возвращаются тем же способом, которым была оплата.</li></ul><p>Полные условия — в <a href="/offer">публичной оферте</a>.</p></section>
<section class="card" id="seller"><h2>Продавец</h2>${rekv(false)}</section>`);
}

function offerPage() {
  const s = seller(), who = s.name && s.inn ? `${esc(s.name)}, плательщик налога на профессиональный доход (самозанятый), ИНН ${esc(s.inn)}` : 'владелец сервиса (реквизиты заполняются)';
  const list = ITEMS.map(i => `<tr><td>${esc(i.title)}</td><td>${rubText(i.rub)}</td></tr>`).join('');
  return shell('Публичная оферта', 'Публичная оферта об оказании платных цифровых услуг в мессенджере «Нудист».', `
<h1>Публичная оферта</h1><p class="muted">об оказании платных цифровых услуг в мессенджере «Нудист» · редакция от 15 ноября 2026 года</p>
<section class="card"><h2>1. Общие положения</h2>
<p>1.1. Настоящий документ — официальное предложение (публичная оферта по статье 437 Гражданского кодекса РФ) заключить договор на условиях, изложенных ниже. Продавец (Исполнитель): ${who}.</p>
<p>1.2. Покупатель (Пользователь) — человек, который зарегистрирован в мессенджере «Нудист» и оплатил услугу.</p>
<p>1.3. Оплата услуги означает полное и безоговорочное согласие с офертой (акцепт). С этого момента договор считается заключённым.</p>
<p>1.4. Сервис — мессенджер «Нудист»: сайт, веб-приложение и приложение для Android. Основные возможности сервиса бесплатны; оферта касается только платных услуг из раздела 2.</p></section>
<section class="card"><h2>2. Предмет договора и цены</h2>
<p>2.1. Исполнитель оказывает Пользователю цифровые услуги внутри сервиса:</p>
<ul><li><b>Подписка «Нудист Премиум»</b> — доступ к дополнительным возможностям сервиса на оплаченный срок. Тарифы:<ul>${Object.values(Shop.PLANS).map(p => `<li><b>${esc(p.name)}</b>: ${p.perks.map(t => esc(t.charAt(0).toLowerCase() + t.slice(1))).join('; ')}.</li>`).join('')}</ul></li>
<li><b>Наборы листиков</b> — зачисление на счёт аккаунта внутренних значков «листики», которые используются только внутри сервиса: украшения профиля, подписка, пропуск сезона, подарки и чаевые другим пользователям, буст клуба, подписка на платные каналы. При передаче листиков между пользователями (чаевые, продажа лимитированных подарков) часть листиков списывается как комиссия сервиса; размер комиссии показывается до операции.</li></ul>
<p>2.2. Действующие цены:</p><table>${list}</table>
<p>2.3. Цены указаны в российских рублях. НДС не облагается: Исполнитель применяет специальный налоговый режим «Налог на профессиональный доход». Актуальные цены всегда опубликованы на странице <a href="/pay">«Цены и оплата»</a>; цена для Пользователя — та, что показана в момент оплаты.</p>
<p>2.4. Листики не являются денежными средствами, электронными денежными средствами, ценными бумагами или иным имуществом. Их нельзя обменять на деньги, вывести из сервиса или передать за плату. Листики, полученные бесплатно, и купленные листики используются одинаково.</p></section>
<section class="card"><h2>3. Оплата и получение услуги</h2>
<p>3.1. Оплата производится через платёжный сервис ЮKassa (ООО НКО «ЮМани») способами, доступными на странице оплаты. Данные банковской карты вводятся на стороне платёжного сервиса; Исполнитель их не получает и не хранит.</p>
<p>3.2. Платёж разовый. Автоматического продления и повторных списаний нет.</p>
<p>3.3. Услуга оказывается дистанционно: купленное зачисляется на аккаунт Пользователя автоматически после подтверждения оплаты, обычно в течение минуты и не позднее 24 часов. Доставка в физическом виде не производится.</p>
<p>3.4. Услуга считается оказанной: по подписке — по истечении оплаченного срока; по набору листиков — в момент зачисления листиков на счёт аккаунта.</p>
<p>3.5. После оплаты Исполнитель формирует чек в порядке, установленном для плательщиков налога на профессиональный доход.</p></section>
<section class="card"><h2>4. Отказ от услуги и возврат денег</h2>
<p>4.1. Если оплата прошла, а услуга не зачислена в течение 24 часов, Исполнитель по выбору Пользователя зачисляет её вручную или возвращает деньги полностью.</p>
<p>4.2. Пользователь вправе отказаться от подписки в любое время. Исполнитель возвращает стоимость неиспользованных дней (цена, делённая на число оплаченных дней и умноженная на число оставшихся).</p>
<p>4.3. По набору листиков возвращается стоимость неизрасходованных листиков из купленного набора. Израсходованные листики возврату не подлежат, поскольку услуга в этой части оказана.</p>
<p>4.4. Заявка на возврат направляется на электронную почту Исполнителя${s.email ? ` (${esc(s.email)})` : ''} или в поддержку в приложении с указанием номера заказа. Срок рассмотрения — до 10 дней. Деньги возвращаются тем же способом, которым была произведена оплата; срок поступления зависит от банка.</p>
<p>4.5. При возврате соответствующая услуга отключается: срок подписки сокращается, листики списываются.</p>
<p>4.6. Если Пользователь покупает тариф, отличный от действующего, оплаченный срок пересчитывается по соотношению цен тарифов, как описано на странице <a href="/pay">«Цены и оплата»</a>. Пробный период, если он предоставляется, бесплатен и оплаченный срок не уменьшает.</p></section>
<section class="card"><h2>5. Правила и ограничения</h2>
<p>5.1. Пользователь обязуется соблюдать правила сервиса и законодательство РФ. Пользователи младше 18 лет совершают покупки с согласия родителей или иных законных представителей, кроме сделок, которые закон разрешает им совершать самостоятельно.</p>
<p>5.2. Если аккаунт заблокирован за нарушение правил сервиса, оплаченная подписка и листики на этом аккаунте не переносятся; возврат производится по правилам раздела 4 в части неиспользованного.</p>
<p>5.3. Купленное привязано к аккаунту. При удалении аккаунта по желанию Пользователя неиспользованная подписка и листики аннулируются; до удаления Пользователь вправе запросить возврат по разделу 4.</p>
<p>5.4. Исполнитель вправе менять состав возможностей подписки и ассортимент украшений, не ухудшая положение Пользователя на уже оплаченный срок, а если это невозможно — возвращает стоимость неиспользованных дней.</p></section>
<section class="card"><h2>6. Ответственность</h2>
<p>6.1. Сервис предоставляется в текущем состоянии. Исполнитель не отвечает за перерывы в работе, вызванные причинами вне его контроля: сбоями у провайдеров связи и хостинга, ограничениями доступа к отдельным ресурсам, неисправностью устройства Пользователя.</p>
<p>6.2. Если перерыв в работе сервиса по вине Исполнителя длился более 24 часов подряд, срок подписки по обращению Пользователя продлевается на время перерыва.</p>
<p>6.3. Ответственность Исполнителя ограничена суммой, уплаченной Пользователем за соответствующую услугу. Это не ограничивает права потребителя, прямо установленные законом.</p></section>
<section class="card"><h2>7. Персональные данные</h2>
<p>7.1. Для оказания услуги обрабатываются: идентификатор аккаунта, состав и сумма заказа, время оплаты, статус платежа и адрес электронной почты, если Пользователь указал его для чека. Условия обработки — в <a href="/privacy">политике конфиденциальности</a>.</p></section>
<section class="card"><h2>8. Заключительные положения</h2>
<p>8.1. Оферта действует с момента публикации на этой странице и до её отзыва. Исполнитель вправе изменить оферту; новая редакция применяется к оплатам, совершённым после её публикации.</p>
<p>8.2. Споры решаются путём переговоров; срок ответа на претензию — 10 дней. Если договориться не удалось, спор рассматривается судом по правилам законодательства РФ.</p>
<p>8.3. К отношениям сторон применяется право Российской Федерации.</p></section>
<section class="card"><h2>9. Реквизиты Исполнителя</h2>${rekv(false)}</section>`);
}

function contactsPage() {
  return shell('Контакты и реквизиты', 'Контакты и реквизиты продавца платных услуг мессенджера «Нудист».', `
<h1>Контакты и реквизиты</h1>
<section class="card"><h2>Реквизиты продавца</h2>${rekv(false)}</section>
<section class="card"><h2>Как с нами связаться</h2><ul><li>По вопросам оплаты, возврата и работы сервиса пишите на электронную почту, указанную выше. В письме укажите номер заказа или username в «Нудисте».</li><li>В приложении: «Хаб» → «Поддержка» — обращение попадёт к администрации сервиса.</li></ul><p>Отвечаем обычно в течение суток, на претензии — не позднее 10 дней.</p></section>
<section class="card"><h2>О сервисе</h2><p>«Нудист» — мессенджер: личные и групповые чаты, каналы, лента, истории, мини-игры. Регистрация и основные возможности бесплатны. Платные услуги — подписка «Нудист Премиум» (тарифы Plus, Pro, Max) и наборы листиков — описаны на странице <a href="/pay">«Цены и оплата»</a>, условия их оказания — в <a href="/offer">публичной оферте</a>.</p></section>`);
}

module.exports = { hook, payPage, offerPage, contactsPage, enabled, ITEMS, PERKS, fulfil, sync };
