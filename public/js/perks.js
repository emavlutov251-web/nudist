// Примерка и подарок вещи из магазина, коллекция в профиле, энергия в играх, обложки треков.
import { html, useState, useEffect, useRef, S, bump, rpc, toast, Icon, Avatar, Badges, Nm, cx, openModal, closeModal, Modal, userName, confirmDlg, applyTheme, SKINS, plural } from './lib.js';

const num = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const mins = ms => { const m = Math.max(1, Math.ceil(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)} ч ${m % 60} мин` : `${m} мин`; };

// ───── обложки. Есть картинка (значок станции, обложка из каталога или из тегов файла) — показываем её, нет — рисуем цветную плитку по названию.
const hue = s => { let h = 7; for (const ch of String(s || '')) h = (h * 31 + ch.codePointAt(0)) % 360; return h; };
export function Cover({ src, seed, s = 40, radio }) {
  const [bad, setBad] = useState(null), h = hue(seed), ok = src && bad !== src;
  return html`<span class=${cx('cov', ok && 'pic')} style=${`width:${s}px;height:${s}px;background:linear-gradient(135deg,hsl(${h} 62% 52%),hsl(${(h + 48) % 360} 68% 36%))`}>${ok ? html`<img src=${src} alt="" loading="lazy" referrerpolicy="no-referrer" onError=${() => setBad(src)} />` : html`<${Icon} n=${radio ? 'radio' : 'music'} s=${Math.round(s * 0.46)} />`}</span>`;
}
// Картинка из тегов mp3 (ID3v2.3 и 2.4, кадр APIC). Читаем только начало файла; не получилось — трек просто останется с цветной плиткой.
const be32 = (b, i) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0, safe32 = (b, i) => ((b[i] & 127) << 21) | ((b[i + 1] & 127) << 14) | ((b[i + 2] & 127) << 7) | (b[i + 3] & 127);
async function shrink(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = url; });
    const k = Math.min(1, 320 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const out = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.82)); return out ? new File([out], 'cover.jpg', { type: 'image/jpeg' }) : null;
  } finally { URL.revokeObjectURL(url); }
}
export async function tagCover(file) {
  try {
    if (!/\.mp3$/i.test(file.name)) return null;
    const h = new Uint8Array(await file.slice(0, 10).arrayBuffer()); if (h[0] !== 0x49 || h[1] !== 0x44 || h[2] !== 0x33) return null;
    const ver = h[3], size = safe32(h, 6); if (ver < 3 || ver > 4 || size < 20 || size > 12e6) return null;
    const b = new Uint8Array(await file.slice(10, 10 + size).arrayBuffer()); let i = 0;
    if (h[5] & 0x40) i = ver === 4 ? safe32(b, 0) : be32(b, 0) + 4;      // расширенный заголовок пропускаем
    while (i + 10 <= b.length) {
      const id = String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]); if (!/^[A-Z0-9]{4}$/.test(id)) break;
      const n = ver === 4 ? safe32(b, i + 4) : be32(b, i + 4), body = i + 10, end = body + n; if (n <= 0 || end > b.length) break;
      if (id === 'APIC') {
        let j = body; const enc = b[j++]; let mime = ''; while (j < end && b[j]) mime += String.fromCharCode(b[j++]); j += 2;      // конец типа и байт «вид картинки»
        if (enc === 1 || enc === 2) { while (j + 1 < end && (b[j] || b[j + 1])) j += 2; j += 2; } else { while (j < end && b[j]) j++; j++; }
        if (j >= end) return null;
        return await shrink(new Blob([b.subarray(j, end)], { type: /png/i.test(mime) ? 'image/png' : 'image/jpeg' }));
      }
      i = end;
    }
  } catch (e) { /* без обложки */ }
  return null;
}

// ───── энергия в играх
export const EN = { d: null };
const keep = r => { EN.d = { ...r, at: Date.now() }; bump(); return EN.d; };
export const loadEnergy = () => rpc('energy.get').then(keep).catch(() => null);
const nextIn = d => Math.max(0, d.next - (Date.now() - d.at));
/** Перед запуском игры: true — играем. Если энергии нет, окно предложит подождать или восполнить. Сервер не ответил — не мешаем играть. */
export async function spendEnergy(app) {
  let r; try { r = keep(await rpc('energy.use', { app: app.id })); } catch (e) { return true; }
  if (r.ok) return true;
  return new Promise(res => openModal(EnergyDlg, { app, res }));
}
function EnergyDlg({ id, app, res }) {
  const d = EN.d, done = useRef(false), [busy, setBusy] = useState(false), [, tick] = useState(0);
  useEffect(() => { if (!d) loadEnergy(); const t = setInterval(() => { tick(x => x + 1); if (EN.d && !EN.d.inf && EN.d.n < EN.d.max && nextIn(EN.d) <= 0) loadEnergy(); }, 5000); return () => { clearInterval(t); if (!done.current && res) res(false); }; }, []);
  const finish = ok => { done.current = true; if (res) res(ok); closeModal(id); };
  const refill = async () => {
    if ((S.me.stars || 0) < d.price) return toast(`Не хватает ${num(d.price - (S.me.stars || 0))} 🍃. Листики можно докупить в магазине.`, 'err');
    setBusy(true);
    try { keep(await rpc('energy.refill')); toast('Энергия полная ⚡'); if (app) { const r = keep(await rpc('energy.use', { app: app.id })); return finish(!!r.ok); } }
    catch (e) { toast(e.message, 'err'); }
    setBusy(false);
  };
  const play = async () => { const r = keep(await rpc('energy.use', { app: app.id }).catch(() => ({ ...d, ok: true }))); if (r.ok) finish(true); };
  if (!d) return html`<${Modal} id=${id} title="Энергия" icon="zap" cls="small"><p class="hint">Загружаем…</p><//>`;
  const full = d.inf || d.n >= d.max;
  return html`<${Modal} id=${id} title="Энергия" icon="zap" cls="small energy" footer=${html`<button class="btn ghost" onClick=${() => finish(false)}>${app && !full && d.n < 1 ? 'Подожду' : 'Закрыть'}</button>${!full && html`<button class="btn" disabled=${busy} onClick=${refill}><${Icon} n="zap" s=${16} /> Восполнить · ${num(d.price)} 🍃</button>`}${app && d.n > 0 && html`<button class="btn" onClick=${play}>Играть</button>`}`}>
    ${d.inf ? html`<p class="en-big">⚡ ∞</p><p class="hint center">С вашим тарифом энергия в играх не тратится.</p>` : html`
      <p class="en-big">⚡ ${d.n} <small>из ${d.max}</small></p>
      <div class="en-bar">${Array.from({ length: d.max }, (_, i) => html`<i key=${i} class=${cx(i < d.n && 'on')}></i>`)}</div>
      ${app && d.n < 1 && html`<p class="note">На «${app.title}» энергии не хватило. Она восстановится сама — или её можно восполнить листиками.</p>`}
      <p class="hint">${full ? 'Запас полный.' : `Следующая единица — через ${mins(nextIn(d))}.`} Один запуск игры тратит одну единицу, новая появляется каждые ${Math.round(d.step / 60000)} минут. Утилиты, игры событий и ответ на дуэль энергию не тратят.</p>
      <p class="hint">С тарифом Plus запас вдвое больше, с Pro и Max энергия не тратится совсем.</p>`}<//>`;
}
export const openEnergy = () => openModal(EnergyDlg, {});
/** Кнопка-счётчик над списком игр. */
export function EnergyPill() {
  const d = EN.d; useEffect(() => { loadEnergy(); }, []);
  if (!d || !d.on) return null;
  return html`<button class="en-pill" onClick=${openEnergy} title="Энергия для игр" aria-label=${d.inf ? 'Энергия: без ограничений' : `Энергия: ${d.n} из ${d.max}`}><${Icon} n="zap" s=${15} /> ${d.inf ? '∞' : html`${d.n}<small>/${d.max}</small>`}</button>`;
}

// ───── примерка: как вещь будет выглядеть на вас, до покупки
function TryOn({ id, it, mine, onBuy, onWear, onGift, stickers }) {
  const me = S.me, cos = { ...(me.cos || {}) }, box = useRef();
  if (it.kind === 'frame') cos.f = it.id.slice(6); if (it.kind === 'gradient') cos.g = it.colors;
  const u = { ...me, cos }, badges = it.kind === 'badge' ? (me.badges || []).filter(b => typeof b !== 'string' || !b.startsWith('shop_')).concat('shop_' + it.id.slice(6)) : me.badges;
  // тема примеряется на всё приложение, пока окно открыто; закрыли — вернулась прежняя
  useEffect(() => { if (it.kind !== 'theme') return; const r = document.documentElement, k = it.id.slice(6); r.dataset.theme = SKINS[k] || 'dark'; r.dataset.skin = k; return () => applyTheme(); }, []);
  const burst = () => import('./shop.js').then(M => M.fxBurst(box.current, it.id.slice(3)));
  useEffect(() => { if (it.kind === 'effect') { const t = setTimeout(burst, 350); return () => clearTimeout(t); } }, []);
  const what = { frame: 'Рамку видят все — в чатах, списках и профиле.', gradient: 'Цвет имени видят все.', effect: 'Эффект играет у собеседника, когда приходит ваше сообщение.', theme: 'Тема меняет оформление только у вас. Сейчас она включена для примерки — оглядитесь.', stickers: 'Набор появится в панели стикеров.', badge: 'Значок стоит рядом с именем. Это украшение: в подсказке так и написано, что он из магазина.' }[it.kind];
  return html`<${Modal} id=${id} title=${'Примерка: ' + it.name} icon="eye" cls="small tryon" footer=${html`${onGift && html`<button class="btn ghost" onClick=${() => { closeModal(id); onGift(it); }}><${Icon} n="gift" s=${16} /> Подарить</button>`}${mine ? (onWear && html`<button class="btn" onClick=${() => { closeModal(id); onWear(it); }}>Надеть</button>`) : onBuy && html`<button class="btn" onClick=${() => { closeModal(id); onBuy(it); }}>Купить · ${num(it.price)} 🍃</button>`}`}>
    <div class="try-card"><${Avatar} u=${u} src=${me.avatar} name=${userName(me)} color=${me.color} s=${84} /><h3><${Nm} u=${u} /> <${Badges} list=${badges} s=${18} /></h3><small>так вас увидят в профиле</small></div>
    <div class="try-chat" ref=${box}><div class="try-row"><${Avatar} u=${u} src=${me.avatar} name=${userName(me)} color=${me.color} s=${34} /><div class="try-b"><b><${Nm} u=${u} /> <${Badges} list=${badges} s=${14} /></b><span>Ну как я вам?</span></div></div></div>
    ${it.kind === 'effect' && html`<button class="btn ghost wide" onClick=${burst}><${Icon} n="sparkles" s=${16} /> Показать эффект ещё раз</button>`}
    ${it.kind === 'stickers' && stickers}
    <p class="hint">${what}${!mine && it.price > 0 ? ' Купленное остаётся навсегда.' : ''}</p><//>`;
}
export const openTryOn = o => openModal(TryOn, o);
/** Подарить вещь: выбираем человека, подтверждаем, листики списываются у дарителя. true — подарено. */
export async function giftItem(it, to) {
  let uid = to;
  if (!uid) { const { pickUsers } = await import('./panels.js'); const ids = await pickUsers({ title: `Кому подарить «${it.name}»?`, noBots: true, exclude: [S.me.id] }); if (!ids || !ids[0]) return false; uid = ids[0]; }
  const ids = [uid], o = S.users[uid] || { name: 'другу' };
  if ((S.me.stars || 0) < it.price) { toast(`Не хватает ${num(it.price - (S.me.stars || 0))} 🍃.`, 'err'); return false; }
  if (!(await confirmDlg({ title: 'Подарок', text: `Подарить «${it.name}» — ${userName(o)}? С вас спишется ${num(it.price)} 🍃, вещь останется у человека навсегда, а в личку придёт сообщение от вас.`, ok: 'Подарить' }))) return false;
  try { await rpc('shop.gift', { to: ids[0], id: it.id }); toast('Подарок отправлен 🎁'); return true; } catch (e) { toast(e.message, 'err'); return false; }
}

/** Из профиля: выбрать украшение в подарок этому человеку. */
function GiftItems({ id, user }) {
  const [d, setD] = useState(null);
  useEffect(() => { rpc('shop.catalog').then(setD).catch(e => { toast(e.message, 'err'); closeModal(id); }); }, []);
  const list = d ? d.items.filter(x => x.price > 0 && x.tier !== 'season' && x.kind !== 'theme').sort((a, b) => a.price - b.price) : [];
  const give = async it => { if (await giftItem(it, user.id)) closeModal(id); };
  return html`<${Modal} id=${id} title=${'Украшение для ' + userName(user)} icon="gift" cls="small giftitems">
    ${!d ? html`<p class="hint">Загружаем…</p>` : html`<p class="hint">У вас ${num(d.stars)} 🍃. Вещь останется у человека навсегда. Если такая у него уже есть, сервер подарок не примет и листики не спишет.</p>
      <div class="col-grid">${list.map(x => html`<button class=${'col-i gi r-' + x.tier} key=${x.id} onClick=${() => give(x)}>
        <span class="col-pv">${x.kind === 'frame' ? html`<${Avatar} u=${{ cos: { f: x.id.slice(6) } }} src=${user.avatar} name=${userName(user)} color=${user.color} s=${40} />` : x.kind === 'gradient' ? html`<b class="col-g" style=${'--g:linear-gradient(90deg,' + (x.colors || []).join(',') + ')'}>Аа</b>` : x.kind === 'badge' ? html`<${Badges} list=${['shop_' + x.id.slice(6)]} s=${26} />` : x.emoji}</span>
        <b>${x.name}</b><small>${num(x.price)} 🍃</small></button>`)}</div>`}<//>`;
}
export const openGiftItems = user => openModal(GiftItems, { user });

// ───── коллекция в профиле: вещи из магазина, событий и пропуска сезона, которые у человека есть насовсем
const RAR = { common: 'обычная', rare: 'редкая', epic: 'эпическая', legendary: 'легендарная', season: 'пропуск сезона', event: 'событие', badge: 'значок', secret: 'тайная витрина' };
const KIND = { frame: 'рамка', gradient: 'цвет имени', effect: 'эффект', theme: 'тема', stickers: 'стикеры', badge: 'значок' };
export function Collection({ list, user, mine }) {
  if (!list || !list.length) return html`<div class="empty sm"><p>${mine ? 'Здесь появятся ваши украшения: рамки, цвета имени, эффекты и значки. Заглядывайте в магазин.' : 'Коллекция пуста или скрыта.'}</p></div>`;
  const order = ['secret', 'legendary', 'epic', 'event', 'season', 'badge', 'rare', 'common'], sorted = [...list].sort((a, b) => order.indexOf(a.tier) - order.indexOf(b.tier));
  return html`<p class="hint">${list.length} ${plural(list.length, ['вещь', 'вещи', 'вещей'])}${mine ? '. Скрыть этот раздел от других можно в «Настройки → Приватность».' : ''}</p>
    <div class="col-grid">${sorted.map(x => html`<div class=${'col-i r-' + x.tier} key=${x.id} title=${`${x.name} · ${KIND[x.kind] || ''} · ${RAR[x.tier] || ''}`}>
      <span class="col-pv">${x.kind === 'frame' ? html`<${Avatar} u=${{ cos: { f: x.id.slice(6) } }} src=${user.avatar} name=${userName(user)} color=${user.color} s=${40} />` : x.kind === 'gradient' ? html`<b class="col-g" style=${'--g:linear-gradient(90deg,' + (x.colors || []).join(',') + ')'}>Аа</b>` : x.kind === 'badge' ? html`<${Badges} list=${['shop_' + x.id.slice(6)]} s=${26} />` : x.emoji}</span>
      <b>${x.name}</b><small>${KIND[x.kind] || ''}</small></div>`)}</div>`;
}
