// «Выдохнуть»: тихий угол приложения. Дыхание, дневник настроения (виден только вам), кнопка «написать близкому», телефоны доверия,
// режим без счётчиков и капсулы времени. Здесь ничего не продаётся и ничего не считается.
import { html, useState, useEffect, S, bump, rpc, toast, Icon, Avatar, cx, openModal, closeModal, Modal, userName, confirmDlg, setSetting, Toggle, local, showMenu, fmtShort, plural } from './lib.js';
import { sendPayload } from './store.js';

export const MOODS = [['sun', '☀️', 'Солнечно'], ['cloud', '⛅', 'Облачно'], ['fog', '🌫️', 'Туман'], ['rain', '🌧️', 'Дождь'], ['storm', '⛈️', 'Гроза']];
const EM = Object.fromEntries(MOODS.map(m => [m[0], m[1]]));
const pad = n => String(n).padStart(2, '0'), dayKey = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()), today = () => dayKey(new Date());
const M = { days: null, loading: false };
function loadMood() { if (M.days || M.loading) return; M.loading = true; rpc('mood.get').then(r => { M.days = r.days || {}; M.loading = false; bump(); }).catch(() => { M.loading = false; }); }
async function setMood(v) { try { const r = await rpc('mood.set', { day: today(), v }); M.days = r.days; bump(); return true; } catch (e) { toast(e.message, 'err'); return false; } }
// несколько тяжёлых дней подряд — мягко напоминаем, что есть с кем поговорить
const heavy = days => { const ks = Object.keys(days || {}).sort().slice(-4); return ks.length >= 4 && ks.every(k => days[k] === 'rain' || days[k] === 'storm'); };

/** Полоска «Как ты сегодня?» над списком чатов: раз в день, ничего не перекрывает, выключается в один тап. */
export function MoodAsk() {
  const off = S.settings.moodAsk === false;
  useEffect(() => { if (!off) loadMood(); }, [off]);
  if (off || !M.days || M.days[today()] || local.get('mood.skip') === today()) return null;
  const pick = async v => { if (await setMood(v)) toast(v === 'rain' || v === 'storm' ? 'Отметила. Если тяжело — в меню есть «Выдохнуть».' : 'Отметила. Это видите только вы.'); };
  return html`<div class="mood-ask" role="group" aria-label="Как ты сегодня?"><span>Как ты сегодня?</span>
    <div class="mood-btns">${MOODS.map(([v, e, n]) => html`<button key=${v} title=${n} aria-label=${n} onClick=${() => pick(v)}>${e}</button>`)}</div>
    <button class="ib sm" title="Скрыть" aria-label="Скрыть" onClick=${e => showMenu(e, [{ icon: 'x', label: 'Скрыть на сегодня', run: () => { local.set('mood.skip', today()); bump(); } }, { icon: 'eye-off', label: 'Больше не спрашивать', hint: 'вернуть можно в «Выдохнуть»', run: () => setSetting({ moodAsk: false }) }], { anchor: e.currentTarget })}><${Icon} n="x" s=${15} /></button></div>`;
}

function MoodCal() {
  const days = M.days || {}, cells = [], now = new Date(), start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 34);
  for (let i = 0; i < 35; i++) { const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i), k = dayKey(d); cells.push({ k, n: d.getDate(), v: days[k], t: k === today() }); }
  const marked = Object.keys(days).length;
  return html`<div class="mood-cal">${cells.map(c => html`<span key=${c.k} class=${cx(c.t && 'now', c.v && 'has')} title=${c.k.split('-').reverse().join('.')}>${c.v ? EM[c.v] : c.n}</span>`)}</div>
    <p class="hint">Последние пять недель. ${marked ? `Отмечено дней: ${marked}.` : 'Пока пусто — отметьте сегодняшний день.'} Дневник видите только вы: ни друзьям, ни администрации он не показывается.</p>`;
}

function Calm({ id }) {
  const [, re] = useState(0), s = S.settings, sos = s.sosContact && S.users[s.sosContact] && !S.users[s.sosContact].deleted ? S.users[s.sosContact] : null;
  useEffect(() => { loadMood(); }, []);
  const cur = (M.days || {})[today()];
  const breathe = async () => { const H = await import('./hub.js'); H.launchApp({ id: 'breath', title: 'Подышать', url: '/miniapps/breath.html' }); };
  const choose = async () => { const { pickUsers } = await import('./panels.js'); const ids = await pickUsers({ title: 'Кому написать, когда тяжело?' }); if (ids && ids[0]) { setSetting({ sosContact: ids[0] }); re(x => x + 1); } };
  const write = async () => {
    if (!(await confirmDlg({ title: `Написать: ${userName(sos)}?`, text: 'Отправим в личку: «Мне сейчас нелегко. Напиши или позвони, когда сможешь 🙏»', ok: 'Отправить' }))) return;
    try { const r = await rpc('dm.open', { user: sos.id }); const cid = (r.chat || r).id; if (r.chat || r.id) S.chats[cid] = { ...S.chats[cid], ...(r.chat || r) }; await sendPayload(cid, { text: 'Мне сейчас нелегко. Напиши или позвони, когда сможешь 🙏' }); toast('Отправлено. Вы не один.'); }
    catch (e) { toast(e.message, 'err'); }
  };
  return html`<${Modal} id=${id} title="Выдохнуть" icon="heart" cls="small calm">
    <button class="calm-big" onClick=${breathe}><span aria-hidden="true">🌬️</span><b>Подышать минуту</b><small>Три спокойных ритма. Помогает, когда тревожно</small></button>
    <h5>Как ты сегодня?</h5>
    <div class="mood-row">${MOODS.map(([v, e, n]) => html`<button key=${v} class=${cx(cur === v && 'on')} onClick=${() => setMood(cur === v ? '' : v)}><span>${e}</span><small>${n}</small></button>`)}</div>
    ${heavy(M.days) && html`<p class="note">Несколько тяжёлых дней подряд. Так бывает, и это не слабость. Если хочется поговорить — ниже есть, с кем.</p>`}
    <${MoodCal} />
    <h5>Когда совсем тяжело</h5>
    ${sos ? html`<div class="calm-sos"><${Avatar} u=${sos} src=${sos.avatar} name=${userName(sos)} color=${sos.color} s=${40} /><div><b>${userName(sos)}</b><small>близкий человек</small></div><button class="btn" onClick=${write}>Написать</button><button class="ib" title="Выбрать другого" aria-label="Выбрать другого" onClick=${choose}><${Icon} n="pencil" s=${16} /></button></div>`
      : html`<button class="btn ghost wide" onClick=${choose}><${Icon} n="user-plus" s=${16} /> Выбрать близкого человека</button><p class="hint">Одной кнопкой ему уйдёт сообщение «мне сейчас нелегко».</p>`}
    <div class="calm-tel"><a class="btn ghost" href="tel:124"><${Icon} n="phone" s=${16} /> 124</a><a class="btn ghost" href="tel:88002000122"><${Icon} n="phone" s=${16} /> 8-800-2000-122</a></div>
    <p class="hint">Детский телефон доверия (для детей, подростков и родителей): бесплатно, анонимно, круглосуточно. 124 — с мобильного. Если есть опасность для жизни — <a href="tel:112">112</a>.</p>
    <h5>Тишина</h5>
    <${Toggle} label="Режим дзен" hint="Убрать все счётчики непрочитанного. Сообщения никуда не денутся" on=${!!s.zen} onChange=${v => setSetting({ zen: v })} />
    <${Toggle} label="Спрашивать «Как ты сегодня?»" hint="Раз в день, маленькой полоской над чатами" on=${s.moodAsk !== false} onChange=${v => setSetting({ moodAsk: v })} />
    <p class="hint">Тихие часы для уведомлений — в «Настройки → Уведомления». Это место не заменяет врача или психолога, но иногда минуты тишины достаточно.</p><//>`;
}
export const openCalm = () => openModal(Calm);

// ───── Капсула времени
function CapsuleDlg({ id, chat }) {
  const peer = S.users[chat.peer] || {}, [text, setText] = useState(''), [busy, setBusy] = useState(false);
  const iso = d => dayKey(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()), plus = (y, m, d) => { const x = new Date(); x.setFullYear(x.getFullYear() + y, x.getMonth() + m, x.getDate() + d); x.setHours(12, 0, 0, 0); return x; };
  const ny = () => { const x = new Date(); return new Date(x.getFullYear() + 1, 0, 1, 0, 5); };
  const [at, setAt] = useState(iso(plus(1, 0, 0)));
  const PRE = [['Через неделю', plus(0, 0, 7)], ['Через месяц', plus(0, 1, 0)], ['Через год', plus(1, 0, 0)], ['На Новый год', ny()]];
  const send = async () => {
    const t = new Date(at).getTime(); if (!text.trim()) return toast('Напишите, что будет внутри', 'err'); if (!(t > 0)) return toast('Выберите день', 'err');
    setBusy(true);
    try { await rpc('capsule.new', { to: chat.peer, text, at: t }); closeModal(id); toast('Капсула запечатана. До срока её не прочитает никто — даже вы.'); } catch (e) { toast(e.message, 'err'); }
    setBusy(false);
  };
  return html`<${Modal} id=${id} title="Капсула времени" icon="timer" cls="small" footer=${html`<button class="btn ghost" onClick=${() => closeModal(id)}>Отмена</button><button class="btn" disabled=${busy} onClick=${send}><${Icon} n="lock" s=${16} /> Запечатать</button>`}>
    <p class="hint">Сообщение для <b>${userName(peer)}</b>, которое откроется само в выбранный день. До этого в чате будет лежать закрытая капсула. Бесплатно; открыть раньше срока нельзя.</p>
    <label class="fld"><span>Что внутри</span><textarea rows="5" maxlength="2000" value=${text} placeholder="Надеюсь, ты сейчас счастлив…" onInput=${e => setText(e.target.value)}></textarea></label>
    <div class="chips">${PRE.map(([n, d]) => html`<button key=${n} class=${cx('chip', iso(d) === at && 'on')} onClick=${() => setAt(iso(d))}>${n}</button>`)}</div>
    <label class="fld"><span>Когда откроется</span><input type="datetime-local" value=${at} onInput=${e => setAt(e.target.value)} /></label><//>`;
}
export const openCapsule = chat => openModal(CapsuleDlg, { chat });
/** Карточка под сообщением-капсулой: сколько осталось и отмена для автора. */
export function CapCard({ m, chat }) {
  const c = m.cap, mine = m.from === S.me.id;
  if (c.open) return html`<div class="cap-card open">💌 Капсула времени · запечатана ${fmtShort(c.made)}</div>`;
  const d = Math.max(0, Math.ceil((c.at - Date.now()) / 864e5));
  const cancel = async e => { e.stopPropagation(); if (await confirmDlg({ title: 'Распечатать и выбросить?', text: 'Капсула исчезнет у обоих, её текст никто не увидит.', ok: 'Выбросить', danger: true })) { try { await rpc('capsule.cancel', { chat: chat.id, id: m.id }); } catch (x) { toast(x.message, 'err'); } } };
  const when = new Date(c.at).toLocaleString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(' г.', '');
  return html`<div class="cap-card"><span>Откроется ${when}<small>${d <= 1 ? 'уже совсем скоро' : `осталось ${d} ${plural(d, ['день', 'дня', 'дней'])}`} · до срока текст не видит никто</small></span>${mine && html`<button class="btn sm ghost" onClick=${cancel}>Отменить</button>`}</div>`;
}
