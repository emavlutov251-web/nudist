// «Знакомство» — подбор людей, с которыми есть о чём поговорить. Как в Дайвинчике, но по-нашему:
// сначала общее (город, интересы, возраст рядом), а не только лицо. Совпало взаимно — сразу открывается чат.
// Всё решает сервер (server/dating.js): клиент не знает, кто его лайкнул, и не может подкрутить подбор.
import { html, useState, useEffect, rpc, toast, Icon, Avatar, cx, closeModal, Modal, userName, Toggle, Spinner, Empty } from './lib.js';
import { openChat } from './store.js';

const INTERESTS = [
  'пляж', 'музыка', 'кино', 'игры', 'книги', 'спорт', 'йога', 'бег', 'велик', 'походы',
  'фотография', 'рисование', 'код', 'дизайн', 'наука', 'кулинария', 'кофе', 'вино', 'питомцы', 'путешествия',
  'танцы', 'театр', 'аниме', 'тату', 'психология', 'медитация', 'велопрогулки', 'рыбалка', 'сауна', 'плавание',
];
const LOOK = [['', 'не важно'], ['Спокойный', 'спокойный'], ['Активный', 'активный'], ['Загадочный', 'загадочный'], ['Смешной', 'смешной']];
const PLAY = [['', 'всё равно'], ['Общение', 'общение'], ['Друзья', 'друзья'], ['Отношения', 'отношения'], ['Компания для игр', 'компания для игр']];
const HUE = n => ['#FFD166', '#8FE08A', '#7BB8FF', '#FF9C8F', '#C7A6FF'][(n || 0) % 5];

// ───── анкета
function Form({ d, onDone, id }) {
  const [year, setYear] = useState(d.year || ''), [city, setCity] = useState(d.city || ''), [aboutT, setAboutT] = useState(d.about || '');
  const [tags, setTags] = useState(d.tags || []), [look, setLook] = useState(d.look || ''), [play, setPlay] = useState(d.play || ''), [busy, setBusy] = useState(false);
  const toggle = t => setTags(l => l.includes(t) ? l.filter(x => x !== t) : (l.length >= d.tagsMax ? (toast(`Максимум ${d.tagsMax} интересов`, 'err'), l) : l.concat(t)));
  const save = async () => {
    setBusy(true);
    try { await rpc('dating.save', { year, city, about: aboutT, tags, look, play }); toast('Анкета сохранена'); onDone(); }
    catch (e) { toast(e.message, 'err'); }
    setBusy(false);
  };
  return html`<${Modal} id=${id} title="Знакомство" icon="heart" footer=${html`<button class="btn ghost" onClick=${() => closeModal(id)}>Позже</button><button class="btn" disabled=${busy} onClick=${save}>${busy ? 'Сохраняем…' : 'Сохранить'}</button>`}>
    <p class="hint">Анкету видят <b>только</b> те, кто тоже включил знакомство. Год рождения нужен для подбора — другим показывается только возраст. Город можно не указывать: напишите район или просто «рядом с пляжем».</p>
    <div class="fld"><label>Год рождения</label><input type="number" inputmode="numeric" placeholder=${String(new Date().getFullYear() - 25)} value=${year} onInput=${e => setYear(e.target.value)} /></div>
    <div class="fld"><label>Город или район</label><input placeholder="Например, Екатеринбург" value=${city} onInput=${e => setCity(e.target.value)} maxLength=${40} /></div>
    <div class="fld"><label>О себе</label><textarea rows="3" maxLength=${d.aboutMax} placeholder="Пара слов: чем живёте, что любите" value=${aboutT} onInput=${e => setAboutT(e.target.value.slice(0, d.aboutMax))} /></div>
    <label class="lbl">Интересы <small>${tags.length} из ${d.tagsMax} — по ним и подбираем</small></label>
    <div class="chips">${INTERESTS.map(t => html`<button class=${cx('chip', tags.includes(t) && 'on')} onClick=${() => toggle(t)}>${t}</button>`)}</div>
    <label class="lbl">Что ищете</label>
    <div class="chips">${PLAY.map(([v, l]) => html`<button class=${cx('chip', play === v && 'on')} onClick=${() => setPlay(v)}>${l}</button>`)}</div>
    <label class="lbl">Настроение</label>
    <div class="chips">${LOOK.map(([v, l]) => html`<button class=${cx('chip', look === v && 'on')} onClick=${() => setLook(v)}>${l}</button>`)}</div>
  <//>`;
}

// ───── карточка человека
function Card({ v, onLike, onSkip, busy }) {
  if (!v) return html`<${Empty} icon="heart" title="Пока никого" text="Всех посмотрели. Загляните позже — люди приходят." />`;
  return html`<div class="dt-card">
    <div class="dt-ava" style=${`background:linear-gradient(150deg,${HUE(v.color)},${HUE((v.color || 0) + 2)})`}>
      ${v.avatar ? html`<img src=${v.avatar} alt="" loading="lazy" />` : html`<span>${(v.name || '?').slice(0, 1).toUpperCase()}</span>`}
      ${v.online && html`<i class="dt-on" title="Сейчас в сети"></i>`}
    </div>
    <h3>${v.name}${v.age ? html`<small>, ${v.age}</small>` : ''}</h3>
    <div class="dt-meta">${v.username && html`<span>@${v.username}</span>`}${v.city && html`<span>${v.city}</span>`}${v.play && html`<span>${v.play.toLowerCase()}</span>`}</div>
    ${v.about && html`<p class="dt-about">${v.about}</p>`}
    ${(v.tags || []).length > 0 && html`<div class="chips dt-tags">${v.tags.map(t => html`<span class="chip">${t}</span>`)}</div>`}
  </div>`;
}

// ───── сам экран
export function DatingModal({ id }) {
  const [d, setD] = useState(null), [card, setCard] = useState(null), [busy, setBusy] = useState(false), [matches, setMatches] = useState(null), [edit, setEdit] = useState(false);
  const loadMe = () => rpc('dating.me').then(v => { setD(v); return v; }).catch(e => { toast(e.message, 'err'); return null; });
  const next = async () => { try { const r = await rpc('dating.next'); setCard(r.none ? null : r); } catch (e) { toast(e.message, 'err'); setCard(null); } };
  // d в замыкании здесь всегда null: сначала читаем анкету, и уже по её ответу решаем, показывать ли карточку
  useEffect(() => { loadMe().then(v => { if (v && v.on) next(); }); }, []);
  const like = async () => {
    if (!card || !card.user) return; setBusy(true);
    try { const r = await rpc('dating.like', { id: card.user.id }); if (r.mutual) { toast('Взаимно! Чат уже открыт 🍃'); loadMe(); } next(); }
    catch (e) { toast(e.message, 'err'); }
    setBusy(false);
  };
  const skip = async () => { if (card && card.user) rpc('dating.skip', { id: card.user.id }).catch(() => {}); next(); };
  const toggleOn = async on => {
    if (on && !d.year) { setEdit(true); return toast('Заполните анкету — и знакомство включится', 'err'); }
    try { await rpc('dating.save', { ...d, on }); loadMe().then(v => { if (on && v && v.on) next(); }); toast(on ? 'Знакомство включено' : 'Больше никому не показываемся'); }
    catch (e) { toast(e.message, 'err'); }
  };
  if (edit) return html`<${Form} id=${id} d=${d || { tagsMax: 8, aboutMax: 300 }} onDone=${() => { setEdit(false); loadMe().then(v => { if (v && v.on) next(); }); }} />`;
  return html`<${Modal} id=${id} title="Знакомство" icon="heart" footer=${html`<button class="btn ghost" onClick=${() => closeModal(id)}>Закрыть</button>${d && d.on && html`<button class="btn ghost" onClick=${() => setEdit(true)}>Анкета</button>`}`}>
    ${!d ? html`<${Spinner} />` : html`
      <${Toggle} label="Участвовать в знакомстве" hint="Видят только те, кто тоже участвует. Кого вы пропустили, не узнает об этом никогда" on=${d.on} onChange=${toggleOn} />
      ${!d.on && html`<${Empty} icon="heart" title="Знакомство выключено" text="Заполните анкету — и мы будем показывать вас тем, с кем есть общие интересы."><button class="btn" onClick=${() => setEdit(true)}>Заполнить анкету</button><//>`}
      ${d.on && html`
        <div class="dt-stats"><span><b>${d.likes}</b> ваших «нравится»</span><span><b>${d.matches}</b> совпадений</span></div>
        ${card && card.common && card.common.length > 0 && html`<p class="dt-common"><${Icon} n="sparkles" s=${14} /> Общее: <b>${card.common.join(', ')}</b></p>`}
        <${Card} v=${card && card.user} busy=${busy} />
        ${card && card.user && html`<div class="dt-btns">
          <button class="dt-no" onClick=${skip} aria-label="Дальше" title="Дальше"><${Icon} n="x" s=${24} /></button>
          <button class="dt-yes" disabled=${busy} onClick=${like} aria-label="Нравится" title="Нравится"><${Icon} n="heart" s=${26} /></button>
        </div>`}
        <button class="link dt-matches" onClick=${() => rpc('dating.list').then(setMatches).catch(e => toast(e.message, 'err'))}>Совпадения${d.matches ? ' · ' + d.matches : ''}</button>
        ${matches && matches.length > 0 && html`<div class="dt-list">${matches.map(m => html`<button class="ci" key=${m.user.id} onClick=${() => { closeModal(id); openChat(m.chat); }}>
          <${Avatar} u=${m.user} src=${m.user.avatar} name=${userName(m.user)} color=${m.user.color} s=${40} online=${m.user.online} />
          <span class="ci-m"><span class="ci-t"><b>${userName(m.user)}</b></span><span class="ci-p"><span>совпало ${new Date(m.at).toLocaleDateString('ru-RU')}</span></span></span>
          <${Icon} n="message-circle" s=${17} /></button>`)}</div>`}
        ${matches && matches.length === 0 && html`<p class="hint">Совпадений пока нет. Когда кто-то ответит взаимно — здесь появится чат.</p>`}
      `}
    `}
  <//>`;
}
