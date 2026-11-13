// Наборы стикеров из Telegram: список своих наборов, окно импорта по ссылке и окно набора (добавить, убрать, удалить).
import { html, useState, useEffect, S, bump, rpc, on, toast, Icon, cx, openModal, closeModal, Modal, Spinner, confirmDlg } from './lib.js';
import { Sticker } from './fun.js';

export const TG = { packs: null, loading: false, pending: 0 };
export function loadPacks(force) { if ((TG.packs && !force) || TG.loading) return; TG.loading = true; rpc('pack.list').then(r => { TG.packs = r.packs; }).catch(() => { TG.packs = TG.packs || []; }).finally(() => { TG.loading = false; bump(); }); }
const put = p => { TG.packs = [p, ...(TG.packs || []).filter(x => x.id !== p.id)]; bump(); };
const drop = id => { TG.packs = (TG.packs || []).filter(x => x.id !== id); bump(); };
on('init', () => { TG.packs = null; TG.pending = 0; });      // вошли в другой аккаунт — список свой
on('pack', d => { TG.pending = Math.max(0, TG.pending - 1); put(d.pack); toast(`Набор «${d.pack.title}» добавлен: стикеров — ${d.pack.n}`); });
on('pack.fail', d => { TG.pending = Math.max(0, TG.pending - 1); toast(d.error || 'Не получилось забрать набор', 'err'); bump(); });
// Картинка для кнопки набора и для сетки: неподвижная, чтобы сотня анимаций не грела телефон
export const packIcon = p => { const s = p.items[0] || {}; return s.thumb || (!s.kind && s.url) || ''; };

function ImportDlg({ id }) {
  const [link, setLink] = useState(''), [st, setSt] = useState(null), [tok, setTok] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { rpc('pack.status').then(setSt).catch(() => setSt({ ready: true })); }, []);
  const run = async f => { setBusy(true); try { await f(); } catch (e) { toast(e.message || 'Не получилось', 'err'); } finally { setBusy(false); } };
  const go = e => { e && e.preventDefault(); if (!link.trim()) return toast('Вставьте ссылку на набор', 'err'); run(async () => {
    const r = await rpc('pack.import', { link }); if (r.pack) { put(r.pack); toast(`Набор «${r.pack.title}» добавлен`); } else { TG.pending++; bump(); toast('Тащим набор из Telegram. Обычно это меньше минуты, окно можно закрыть.'); } closeModal(id); }); };
  const saveTok = () => run(async () => { const r = await rpc('pack.token', { token: tok }); toast('Бот @' + r.bot + ' подключён. Теперь вставьте ссылку на набор.'); setSt({ ...st, ready: true }); });
  return html`<${Modal} id=${id} title="Стикеры из Telegram" icon="sticker">
    <form class="form" onSubmit=${go}>
      ${!st ? html`<${Spinner} />` : !st.ready && st.owner ? html`<div class="note"><span>Чтобы забирать наборы, серверу нужен ключ любого бота Telegram. Это делается один раз: откройте в Telegram ${'@BotFather'}, отправьте ему /newbot, придумайте имя и вставьте сюда ключ, который он пришлёт.</span></div>
        <label class="fld"><span>Ключ бота</span><input value=${tok} onInput=${e => setTok(e.target.value)} placeholder="123456789:AAH…" autocomplete="off" /></label>
        <button type="button" class="btn" disabled=${busy || !tok.trim()} onClick=${saveTok}>Подключить бота</button>`
      : !st.ready ? html`<div class="note warn"><span>Импорт из Telegram ещё не настроен. Напишите владельцу: ему нужно один раз вставить ключ бота в этом окне. Наборы, которые уже кто-то добавил, можно забрать из чата: нажмите на стикер.</span></div>`
      : html`<p>Откройте набор в Telegram, нажмите «Поделиться» и скопируйте ссылку. Подходят обычные, анимированные и видеостикеры.</p>
        <label class="fld"><span>Ссылка на набор</span><input value=${link} onInput=${e => setLink(e.target.value)} placeholder="https://t.me/addstickers/…" autocomplete="off" autofocus /></label>
        <button class="btn" disabled=${busy}><${Icon} n="download" s=${16} /> Добавить набор</button>
        <p class="hint">В набор попадают первые 120 стикеров. Стикеры рисовали их авторы: добавляйте то, чем автор сам поделился в Telegram.</p>`}
    </form>
  <//>`;
}
export const openImport = () => openModal(ImportDlg);

function PackDlg({ id, pack }) {
  const [d, setD] = useState(null), [busy, setBusy] = useState(false);
  useEffect(() => { rpc('pack.get', { id: pack }).then(setD).catch(e => { toast(e.message, 'err'); closeModal(id); }); }, []);
  const run = async f => { setBusy(true); try { await f(); } catch (e) { toast(e.message || 'Не получилось', 'err'); } finally { setBusy(false); } };
  if (!d) return html`<${Modal} id=${id} title="Набор стикеров" icon="sticker"><${Spinner} /><//>`;
  const p = d.pack, canDrop = p.by === S.me.id || ['admin', 'superadmin'].includes(S.me.admin);
  const add = () => run(async () => { const r = await rpc('pack.add', { id: p.id }); put(r.pack); setD({ ...d, mine: true }); toast('Набор добавлен в ваши стикеры'); });
  const remove = () => run(async () => { await rpc('pack.remove', { id: p.id }); drop(p.id); setD({ ...d, mine: false }); toast('Набор убран'); });
  const kill = async () => { if (!await confirmDlg({ title: 'Удалить набор у всех?', text: 'Он пропадёт у каждого, кто его добавил. Уже отправленные стикеры в чатах перестанут показываться.', ok: 'Удалить', danger: true })) return; run(async () => { await rpc('pack.drop', { id: p.id }); drop(p.id); closeModal(id); toast('Набор удалён'); }); };
  return html`<${Modal} id=${id} title=${p.title} icon="sticker">
    <div class="form">
      <p class="hint">Набор из Telegram: t.me/addstickers/${p.tg} · стикеров: ${p.n}</p>
      <div class="st-grid pack-grid">${p.items.map(s => html`<${Sticker} st=${{ ...s, pack: p.id }} size=${72} onClick=${() => {}} />`)}</div>
      <div class="ask-btns">${d.mine ? html`<button class="btn ghost" disabled=${busy} onClick=${remove}>Убрать из моих</button>` : html`<button class="btn" disabled=${busy} onClick=${add}><${Icon} n="smile-plus" s=${16} /> Добавить себе</button>`}
        ${canDrop && html`<button class="btn danger" disabled=${busy} onClick=${kill}><${Icon} n="trash-2" s=${16} /> Удалить у всех</button>`}</div>
    </div>
  <//>`;
}
export const openPack = pack => openModal(PackDlg, { pack });
