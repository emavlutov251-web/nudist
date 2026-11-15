// Наборы стикеров из Telegram: список своих наборов, окно импорта по ссылке и окно набора (добавить, убрать, удалить).
import { html, useState, useEffect, S, bump, rpc, on, toast, Icon, cx, openModal, closeModal, Modal, Spinner, confirmDlg } from './lib.js';
import { Sticker } from './fun.js';

export const TG = { packs: null, loading: false, pending: 0 };
export function loadPacks(force) { if ((TG.packs && !force) || TG.loading) return; TG.loading = true; rpc('pack.list').then(r => { TG.packs = r.packs; }).catch(() => { TG.packs = TG.packs || []; }).finally(() => { TG.loading = false; bump(); }); }
const put = p => { TG.packs = [p, ...(TG.packs || []).filter(x => x.id !== p.id)]; bump(); };
const drop = id => { TG.packs = (TG.packs || []).filter(x => x.id !== id); bump(); };
on('init', () => { TG.packs = null; TG.pending = 0; });      // вошли в другой аккаунт — список свой
on('pack', d => { TG.pending = Math.max(0, TG.pending - 1); put(d.pack); toast(`Набор «${d.pack.title}» добавлен: стикеров — ${d.pack.n}`); });
// Хозяину набора: кто-то просит набор. Ответить можно в сообщении от бота или в окне «Добавить стикеры».
export const ASKS = { n: 0 };
on('pack.ask', d => { ASKS.n++; bump(); toast(`${d.user.name} просит ваш набор «${d.pack.title}». Ответьте в чате с ботом «Нудист» или в окне «Добавить стикеры».`); });
on('pack.asks', () => { ASKS.n = Math.max(0, ASKS.n - 1); bump(); });
on('pack.fail', d => { TG.pending = Math.max(0, TG.pending - 1); toast(d.error || 'Не получилось забрать набор', 'err'); bump(); });
// Картинка для кнопки набора и для сетки: неподвижная, чтобы сотня анимаций не грела телефон
export const packIcon = p => { const s = p.items[0] || {}; return s.thumb || (!s.kind && s.url) || ''; };

// Забрать набор по ссылке: общий путь для окна, кнопки под ссылкой в чате и адреса #stickers=Имя
export async function importLink(link) {
  const r = await rpc('pack.import', { link });
  if (r.asked) toast(`Набор «${r.title}» уже принёс(ла) ${r.owner}. Мы отправили запрос — набор появится у вас, когда его разрешат.`);
  else if (r.pack) { put(r.pack); toast(`Набор «${r.pack.title}» добавлен. Он уже в ваших стикерах.`); }
  else { TG.pending++; bump(); toast('Забираем набор из Telegram. Он появится в стикерах примерно через минуту.'); }
  return r;
}
// Окно «Добавить стикеры»: готовые наборы в одно касание, свой набор из Telegram по шагам, стикер из картинки
function ImportDlg({ id, link: link0, toMy }) {
  const [link, setLink] = useState(link0 || ''), [st, setSt] = useState(null), [tok, setTok] = useState(''), [busy, setBusy] = useState(false), [pop, setPop] = useState(null);
  const [asks, setAsks] = useState([]);
  useEffect(() => { rpc('pack.status').then(setSt).catch(() => setSt({ ready: true })); rpc('pack.popular').then(r => setPop(r.packs)).catch(() => setPop([])); rpc('pack.asks').then(r => { setAsks(r.asks); ASKS.n = r.asks.length; bump(); }).catch(() => {}); }, []);
  const reply = (a, ok) => run(async () => { await rpc('pack.answer', { id: a.pack.id, user: a.user.id, ok }); setAsks(asks.filter(x => x !== a)); toast(ok ? `Разрешили: набор уже у ${a.user.name}` : 'Отказали'); });
  const run = async f => { setBusy(true); try { await f(); } catch (e) { toast(e.message || 'Не получилось', 'err'); } finally { setBusy(false); } };
  const go = e => { e && e.preventDefault(); if (!link.trim()) return toast('Вставьте ссылку на набор', 'err'); run(async () => { await importLink(link); closeModal(id); }); };
  const paste = async () => { try { const t = (await navigator.clipboard.readText()).trim(); if (!t) return toast('В буфере пусто. Сначала скопируйте ссылку на набор в Telegram.'); setLink(t.slice(0, 200)); } catch (e) { toast('Браузер не дал прочитать буфер. Нажмите на поле и подержите — появится «Вставить».'); } };
  const take = p => run(async () => { const r = await rpc('pack.ask', { id: p.id }); if (r.pack) { put(r.pack); setPop(pop.map(x => x.id === p.id ? { ...x, mine: true, state: 'mine' } : x)); toast(`Набор «${p.title}» добавлен`); } else { setPop(pop.map(x => x.id === p.id ? { ...x, state: 'asked' } : x)); toast(`Запрос отправлен: ${r.owner} получит сообщение. Набор появится у вас, когда его разрешат.`); } });
  const saveTok = () => run(async () => { const r = await rpc('pack.token', { token: tok }); toast('Бот @' + r.bot + ' подключён. Теперь вставьте ссылку на набор.'); setSt({ ...st, ready: true }); });
  const ready = st && st.ready;
  return html`<${Modal} id=${id} title="Добавить стикеры" icon="sticker">
    <div class="form add-st">
      ${asks.length > 0 && html`<h4 class="add-h"><i>!</i> Просят ваши наборы</h4>
        <div class="pop-list">${asks.map(a => html`<div class="pop-i" key=${a.pack.id + a.user.id}><span class="pop-ic">${a.pack.icon ? html`<img src=${a.pack.icon} alt="" />` : html`<span>${a.pack.e || '🙂'}</span>`}</span><div class="pop-t"><b>${a.user.name}</b><small>просит «${a.pack.title}»</small></div><button type="button" class="btn sm" disabled=${busy} onClick=${() => reply(a, true)}>Разрешить</button><button type="button" class="btn sm ghost" disabled=${busy} onClick=${() => reply(a, false)}>Нет</button></div>`)}</div>`}
      ${pop && pop.length > 0 && html`<h4 class="add-h"><i>1</i> Готовые наборы <small>чужие — с разрешения хозяина</small></h4>
        <div class="pop-list">${pop.map(p => html`<div class="pop-i" key=${p.id}>
          <button type="button" class="pop-ic" title="Посмотреть набор" onClick=${() => openPack(p.id)}>${p.icons.length ? p.icons.map(u => html`<img src=${u} alt="" loading="lazy" />`) : html`<span>${p.e || '🙂'}</span>`}</button>
          <div class="pop-t"><b>${p.title}</b><small>${p.n} шт.${p.owner ? ` · принёс(ла) ${p.owner}` : p.users > 1 ? ` · у ${p.users} чел.` : ''}</small></div>
          ${p.mine ? html`<span class="pop-ok"><${Icon} n="check" s=${15} /> Добавлен</span>` : p.state === 'asked' ? html`<span class="pop-ok"><${Icon} n="clock" s=${15} /> Ждём ответа</span>` : html`<button type="button" class="btn sm" disabled=${busy} onClick=${() => take(p)}>${p.state === 'ask' ? 'Попросить' : 'Добавить'}</button>`}
        </div>`)}</div>`}
      <h4 class="add-h"><i>${pop && pop.length ? 2 : 1}</i> Свой набор из Telegram</h4>
      ${!st ? html`<${Spinner} />` : !ready && st.owner ? html`<div class="note"><span>Чтобы забирать наборы, серверу нужен ключ любого бота Telegram. Это делается один раз: откройте в Telegram ${'@BotFather'}, отправьте ему /newbot, придумайте имя и вставьте сюда ключ, который он пришлёт.</span></div>
        <label class="fld"><span>Ключ бота</span><input value=${tok} onInput=${e => setTok(e.target.value)} placeholder="123456789:AAH…" autocomplete="off" /></label>
        <button type="button" class="btn" disabled=${busy || !tok.trim()} onClick=${saveTok}>Подключить бота</button>`
      : !ready ? html`<div class="note warn"><span>Импорт из Telegram ещё не настроен: владельцу нужно один раз вставить ключ бота в этом окне. Готовые наборы выше можно брать уже сейчас.</span></div>`
      : html`<ol class="how">
          <li>В Telegram нажмите на любой стикер из набора, который хотите забрать.</li>
          <li>В открывшемся окне набора нажмите <b>⋮</b> или значок «Поделиться» и выберите <b>«Копировать ссылку»</b>.</li>
          <li>Вернитесь сюда и нажмите <b>«Вставить»</b>, затем «Добавить набор».</li>
        </ol>
        <form class="add-row" onSubmit=${go}><input value=${link} onInput=${e => setLink(e.target.value)} placeholder="https://t.me/addstickers/…" autocomplete="off" aria-label="Ссылка на набор" /><button type="button" class="btn ghost" onClick=${paste}>Вставить</button></form>
        <button type="button" class="btn" disabled=${busy || !link.trim()} onClick=${go}><${Icon} n="download" s=${16} /> Добавить набор</button>
        <p class="hint">Подходят обычные, анимированные и видеостикеры. Набор загружается около минуты и сам появится в стикерах — окно можно закрыть. Берутся первые 120 стикеров.</p>`}
      ${toMy && html`<h4 class="add-h"><i>${pop && pop.length ? 3 : 2}</i> Стикер из своей картинки</h4>
        <p class="hint">Любое фото или картинка с телефона станет стикером. В чате можно и так: нажмите на фото → «Сделать стикером».</p>
        <button type="button" class="btn ghost" onClick=${() => { closeModal(id); toMy(); }}><${Icon} n="image" s=${16} /> Сделать из картинки</button>`}
      <details class="add-faq"><summary>Чужие наборы, разрешения и как убрать набор</summary><p class="hint">У каждого набора есть хозяин — тот, кто принёс его из Telegram. Чтобы взять чужой набор, нажмите «Попросить»: хозяин получит сообщение и разрешит одним касанием. Свой набор можно открыть для всех: стикеры → название набора → «набор» → «Разрешать всем». Там же кнопка «Убрать из моих».</p></details>
    </div>
  <//>`;
}
export const openImport = props => openModal(ImportDlg, props && !props.type ? props : {});

function PackDlg({ id, pack }) {
  const [d, setD] = useState(null), [busy, setBusy] = useState(false);
  useEffect(() => { rpc('pack.get', { id: pack }).then(setD).catch(e => { toast(e.message, 'err'); closeModal(id); }); }, []);
  const run = async f => { setBusy(true); try { await f(); } catch (e) { toast(e.message || 'Не получилось', 'err'); } finally { setBusy(false); } };
  if (!d) return html`<${Modal} id=${id} title="Набор стикеров" icon="sticker"><${Spinner} /><//>`;
  const p = d.pack, canDrop = p.by === S.me.id || ['admin', 'superadmin'].includes(S.me.admin);
  const add = () => run(async () => { const r = await rpc('pack.ask', { id: p.id }); if (r.pack) { put(r.pack); setD({ ...d, mine: true, state: 'mine' }); toast('Набор добавлен в ваши стикеры'); } else { setD({ ...d, state: 'asked' }); toast(`Запрос отправлен: ${r.owner} получит сообщение. Набор появится у вас, когда его разрешат.`); } });
  const setOpen = on => run(async () => { const r = await rpc('pack.open', { id: p.id, on }); setD({ ...d, open: r.open, asks: r.open ? [] : d.asks }); toast(r.open ? 'Теперь набор может взять любой, без запроса' : 'Теперь набор дают только с вашего разрешения'); });
  const reply = (a, ok) => run(async () => { await rpc('pack.answer', { id: p.id, user: a.user.id, ok }); setD({ ...d, asks: d.asks.filter(x => x !== a) }); });
  const remove = () => run(async () => { await rpc('pack.remove', { id: p.id }); drop(p.id); setD({ ...d, mine: false }); toast('Набор убран'); });
  const kill = async () => { if (!await confirmDlg({ title: 'Удалить набор у всех?', text: 'Он пропадёт у каждого, кто его добавил. Уже отправленные стикеры в чатах перестанут показываться.', ok: 'Удалить', danger: true })) return; run(async () => { await rpc('pack.drop', { id: p.id }); drop(p.id); closeModal(id); toast('Набор удалён'); }); };
  return html`<${Modal} id=${id} title=${p.title} icon="sticker">
    <div class="form">
      <p class="hint">Набор из Telegram · стикеров: ${p.n}${d.owner && d.owner.id !== S.me.id ? ` · принёс(ла) ${d.owner.name}` : d.owner ? ' · это ваш набор' : ''}</p>
      ${p.by === S.me.id && (d.asks || []).length > 0 && html`<div class="pop-list">${d.asks.map(a => html`<div class="pop-i" key=${a.user.id}><div class="pop-t"><b>${a.user.name}</b><small>просит этот набор</small></div><button class="btn sm" disabled=${busy} onClick=${() => reply(a, true)}>Разрешить</button><button class="btn sm ghost" disabled=${busy} onClick=${() => reply(a, false)}>Нет</button></div>`)}</div>`}
      <div class="st-grid pack-grid">${p.items.map(s => html`<${Sticker} st=${{ ...s, pack: p.id }} size=${72} onClick=${() => {}} />`)}</div>
      <div class="ask-btns">${d.mine ? html`<button class="btn ghost" disabled=${busy} onClick=${remove}>Убрать из моих</button>` : d.state === 'asked' ? html`<button class="btn ghost" disabled=${true}><${Icon} n="clock" s=${16} /> Запрос отправлен, ждём ответа</button>` : html`<button class="btn" disabled=${busy} onClick=${add}><${Icon} n="smile-plus" s=${16} /> ${d.state === 'ask' ? `Попросить у ${d.owner ? d.owner.name.split(' ')[0] : 'хозяина'}` : 'Добавить себе'}</button>`}
        ${p.by === S.me.id && html`<label class="chk"><input type="checkbox" checked=${!!d.open} disabled=${busy} onChange=${e => setOpen(e.target.checked)} /> <span>Разрешать всем без запроса</span></label>`}
        ${canDrop && html`<button class="btn danger" disabled=${busy} onClick=${kill}><${Icon} n="trash-2" s=${16} /> Удалить у всех</button>`}</div>
    </div>
  <//>`;
}
export const openPack = pack => openModal(PackDlg, { pack });
