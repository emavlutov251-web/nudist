// «Лента»: записи людей и каналов. Текст и до четырёх картинок, лайки, комментарии, подписки на авторов.
// Вкладка «Для вас» — рекомендации, «Новое» — всё подряд по времени. Лента догружается сама при прокрутке
// и сама обновляется раз в две с половиной минуты. Автор записи видит, кто её посмотрел.
import { html, useState, useEffect, useRef, S, bump, rpc, toast, Icon, Avatar, Badges, cx, userName, fmtShort, fmtNum, confirmDlg, pickFile, upload, Empty, Spinner, Modal, openModal, closeModal, local } from './lib.js';
import { openChat } from './store.js';

const TABS = [['rec', 'Для вас'], ['all', 'Новое'], ['subs', 'Подписки'], ['user', 'Мои']];
const REFRESH_MS = 150e3;      // лента сама обновляется раз в 2,5 минуты

// Просмотры. Запись считается увиденной, если секунду провисела на экране хотя бы наполовину (или заняла пол-экрана).
// Отправляем пачками, чтобы не дёргать сервер на каждую запись.
const seenSent = new Set(), seenQ = new Set(), seenWait = new Map(); let seenTimer = null;
function flushSeen() { seenTimer = null; const ids = [...seenQ].slice(0, 40); if (!ids.length) return; ids.forEach(i => seenQ.delete(i)); rpc('feed.seen', { ids }).catch(() => ids.forEach(i => seenSent.delete(i))); if (seenQ.size) seenTimer = setTimeout(flushSeen, 3000); }
function markSeen(id) { if (seenSent.has(id)) return; seenSent.add(id); seenQ.add(id); if (!seenTimer) seenTimer = setTimeout(flushSeen, 3000); }
const watcher = typeof IntersectionObserver === 'function' ? new IntersectionObserver(es => {
  for (const e of es) {
    const id = e.target.dataset.pid, half = e.isIntersecting && (e.intersectionRatio >= 0.5 || (e.rootBounds && e.intersectionRect.height >= e.rootBounds.height * 0.5));
    if (half) { if (!seenWait.has(id)) seenWait.set(id, setTimeout(() => { seenWait.delete(id); markSeen(id); }, 1000)); }
    else if (seenWait.has(id)) { clearTimeout(seenWait.get(id)); seenWait.delete(id); }
  }
}, { threshold: [0, 0.25, 0.5, 0.75] }) : null;

// Окно «кто посмотрел»: общее для записей, клипов и треков. Список видит только автор.
export function Viewers({ id, title, method, target, none }) {
  const [d, setD] = useState(null);
  useEffect(() => { rpc(method, { id: target }).then(setD).catch(e => { toast(e.message, 'err'); closeModal(id); }); }, []);
  const open = u => { closeModal(id); import('./panels.js').then(P => P.showProfile(u)); };
  return html`<${Modal} id=${id} title=${title + (d && d.total ? ' · ' + fmtNum(d.total) : '')} icon="eye">
    ${!d ? html`<${Spinner} />` : !d.list.length ? html`<${Empty} icon="eye" text=${none || 'Пока никто не заглядывал. Всё впереди.'} />` : html`
      <div class="vw-list">${d.list.map(v => { const u = d.users[v.u]; return html`<button class="vw" key=${v.u} onClick=${() => open(v.u)}><${Avatar} src=${u && u.avatar} name=${userName(u)} color=${u ? u.color : 0} s=${36} /><b>${userName(u)} ${u && html`<${Badges} list=${u.badges} s=${14} />`}</b><small>${fmtShort(v.ts)}</small></button>`; })}</div>
      <p class="hint center">${d.total > d.list.length ? `Показаны последние ${d.list.length} из ${fmtNum(d.total)}. ` : ''}Этот список видите только вы.</p>`}
  <//>`;
}

function Composer({ onPost }) {
  const [text, setText] = useState(''), [pics, setPics] = useState([]), [busy, setBusy] = useState(false);
  const attach = async () => {
    const files = (await pickFile('image/*', true) || []).filter(f => /^image\//.test(f.type)).slice(0, 4 - pics.length); if (!files.length) return;
    setBusy(true);
    try { const added = []; for (const f of files) { const r = await upload(f, { name: f.name }); added.push(r.url); } setPics(p => p.concat(added).slice(0, 4)); }
    catch (e) { toast(e.message || 'Картинка не загрузилась', 'err'); } finally { setBusy(false); }
  };
  const send = async () => {
    if (busy || !(text.trim() || pics.length)) return; setBusy(true);
    try { const p = await rpc('feed.post', { text, media: pics }); setText(''); setPics([]); onPost(p); } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  return html`<div class="post feed-new">
    <div class="feed-new-r"><${Avatar} src=${S.me.avatar} name=${userName(S.me)} color=${S.me.color} s=${40} />
      <textarea rows="2" maxlength="2000" placeholder="Что нового? Расскажите всем." value=${text} onInput=${e => setText(e.target.value)}></textarea></div>
    ${pics.length > 0 && html`<div class="feed-pre">${pics.map(u => html`<span key=${u}><img src=${u} alt="" /><button title="Убрать" aria-label="Убрать картинку" onClick=${() => setPics(p => p.filter(x => x !== u))}><${Icon} n="x" s=${13} /></button></span>`)}</div>`}
    <div class="feed-new-f"><button class="btn ghost" disabled=${busy || pics.length >= 4} onClick=${attach}><${Icon} n="image" s=${16} /> Картинка</button>
      <button class="btn" disabled=${busy || !(text.trim() || pics.length)} onClick=${send}><${Icon} n="send" s=${16} /> Опубликовать</button></div>
  </div>`;
}

function Comments({ post, users, onCount }) {
  const [d, setD] = useState(null), [text, setText] = useState('');
  useEffect(() => { rpc('feed.comments', { id: post.id }).then(setD).catch(e => toast(e.message, 'err')); }, [post.id]);
  const send = async () => {
    const t = text.trim(); if (!t) return;
    try { const r = await rpc('feed.comment', { id: post.id, text: t }); setText(''); setD(x => ({ list: (x ? x.list : []).concat(r.item), users: { ...(x ? x.users : {}), ...r.users } })); onCount(r.comments); } catch (e) { toast(e.message, 'err'); }
  };
  const del = async k => { try { const r = await rpc('feed.uncomment', { id: post.id, cid: k.id }); setD(x => ({ ...x, list: x.list.filter(q => q.id !== k.id) })); onCount(r.comments); } catch (e) { toast(e.message, 'err'); } };
  return html`<div class="post-cm">
    ${!d ? html`<${Spinner} />` : d.list.map(k => { const u = d.users[k.by] || users[k.by]; return html`<div class="post-c" key=${k.id}><${Avatar} src=${u && u.avatar} name=${userName(u)} color=${u ? u.color : 0} s=${28} />
      <div><b>${userName(u)}</b><small>${fmtShort(k.ts)}</small><p>${k.text}</p></div>
      ${(k.by === S.me.id || post.own) && html`<button class="ib" title="Удалить комментарий" aria-label="Удалить комментарий" onClick=${() => del(k)}><${Icon} n="trash-2" s=${14} /></button>`}</div>`; })}
    <div class="post-ci"><input maxlength="500" placeholder="Комментарий" value=${text} onInput=${e => setText(e.target.value)} onKeyDown=${e => { if (e.key === 'Enter') send(); }} />
      <button class="ib" title="Отправить" aria-label="Отправить комментарий" disabled=${!text.trim()} onClick=${send}><${Icon} n="send" s=${17} /></button></div>
  </div>`;
}

function Post({ p, users, follows, onChange, onDel, onFollow }) {
  const [open, setOpen] = useState(false), [full, setFull] = useState(false), ch = p.kind === 'channel', u = users[p.by], box = useRef();
  useEffect(() => { const el = box.current; if (!watcher || !el || ch || p.by === S.me.id) return; watcher.observe(el); return () => watcher.unobserve(el); }, [p.id]);
  const lines = (p.text || '').split('\n'), long = !full && ((p.text || '').length > 700 || lines.length > 14);      // длинное сворачиваем, чтобы лента листалась
  const shown = long ? lines.slice(0, 10).join('\n').slice(0, 500).trimEnd() + '…' : p.text;
  const like = async () => { const on = !p.liked; onChange({ ...p, liked: on, likes: p.likes + (on ? 1 : -1) }); try { const r = await rpc('feed.like', { id: p.id, on }); onChange({ ...p, ...r }); } catch (e) { onChange(p); toast(e.message, 'err'); } };
  const del = async () => { if (!await confirmDlg({ title: 'Удалить запись?', text: 'Вместе с лайками и комментариями. Вернуть не получится.', ok: 'Удалить', danger: true })) return; try { await rpc('feed.del', { id: p.id }); onDel(p); } catch (e) { toast(e.message, 'err'); } };
  const mine = p.by === S.me.id, fol = follows.includes(p.by);
  return html`<article class="post" ref=${box} data-pid=${p.id}>
    <header class="post-h"><${Avatar} src=${ch ? p.avatar : u && u.avatar} name=${ch ? p.title : userName(u)} color=${ch ? p.color : u ? u.color : 0} s=${40} />
      <div class="post-who"><b>${ch ? p.title : userName(u)} ${!ch && u && html`<${Badges} list=${u.badges} s=${14} />`}</b><small>${ch ? 'канал · ' : ''}${fmtShort(p.ts)}</small></div>
      ${!ch && !mine && html`<button class=${cx('btn ghost post-fol', fol && 'on')} onClick=${() => onFollow(p.by, !fol)}><${Icon} n=${fol ? 'user-check' : 'user-plus'} s=${15} /> ${fol ? 'Вы подписаны' : 'Подписаться'}</button>`}
      ${!ch && p.own && html`<button class="ib" title="Удалить запись" aria-label="Удалить запись" onClick=${del}><${Icon} n="trash-2" s=${16} /></button>`}</header>
    ${p.text && html`<p class="post-t">${shown}</p>`}
    ${long && html`<button class="post-more" onClick=${() => setFull(true)}>Показать полностью</button>`}
    ${p.media && p.media.length > 0 && html`<div class=${'post-m n' + Math.min(p.media.length, 5)}>${p.media.map(m => /\.(mp4|webm|mov)$/i.test(m) ? html`<video key=${m} src=${m + '#t=0.1'} controls playsinline preload="metadata"></video>` : /\.(m4a|mp3|ogg|oga|opus|aac|wav)$/i.test(m) ? html`<audio key=${m} src=${m} controls preload="none"></audio>` : html`<img key=${m} src=${m} alt="" loading="lazy" />`)}</div>`}
    <footer class="post-f">${ch
      ? html`<button class="post-a" onClick=${() => { S.ui.hub = null; openChat(p.chat); bump(); }}><${Icon} n="megaphone" s=${17} /> Открыть канал</button>`
      : html`<button class=${cx('post-a', p.liked && 'on')} aria-pressed=${!!p.liked} title="Нравится" onClick=${like}><${Icon} n="heart" s=${18} /> ${p.likes ? fmtNum(p.likes) : ''}</button>
        <button class=${cx('post-a', open && 'on')} aria-expanded=${open} title="Комментарии" onClick=${() => setOpen(!open)}><${Icon} n="message-circle" s=${18} /> ${p.comments ? fmtNum(p.comments) : ''}</button>
        ${mine
          ? html`<button class="post-a post-v" title="Кто посмотрел" onClick=${() => openModal(Viewers, { title: 'Кто посмотрел запись', method: 'feed.viewers', target: p.id })}><${Icon} n="eye" s=${17} /> ${fmtNum(p.views || 0)}</button>`
          : p.views > 0 && html`<span class="post-v" title="Просмотры"><${Icon} n="eye" s=${16} /> ${fmtNum(p.views)}</span>`}`}</footer>
    ${open && !ch && html`<${Comments} post=${p} users=${users} onCount=${n => onChange({ ...p, comments: n })} />`}
  </article>`;
}

export function Feed() {
  const [tab, setTabS] = useState(() => (TABS.some(t => t[0] === local.get('feed.tab')) ? local.get('feed.tab') : 'rec')), [d, setD] = useState(null), [more, setMore] = useState(false), [fresh, setFresh] = useState([]);
  const root = useRef(), tail = useRef(), z = useRef({ next: 0, stamp: 0, busy: false, gen: 0 }), live = useRef({}); live.current = { d, more, tab, fresh };
  const setTab = t => { local.set('feed.tab', t); setTabS(t); };
  const scroller = () => { let e = root.current; while (e && !/(auto|scroll)/.test(getComputedStyle(e).overflowY)) e = e.parentElement; return e; };
  const load = async reset => {
    const q = z.current; if (q.busy && !reset) return; q.busy = true; const gen = reset ? ++q.gen : q.gen;
    try {
      const r = await rpc('feed.list', { tab, off: reset ? 0 : q.next }); if (gen !== q.gen) return;
      q.next = r.next != null ? r.next : (reset ? 0 : q.next) + r.items.length; if (reset) { q.stamp = r.now || Date.now(); setFresh([]); }
      setD(x => reset || !x ? { items: r.items, users: r.users, follows: r.follows } : { items: x.items.concat(r.items.filter(i => !x.items.some(k => k.id === i.id))), users: { ...x.users, ...r.users }, follows: r.follows }); setMore(r.more);
    } catch (e) { if (gen === q.gen) { toast(e.message, 'err'); setMore(false); setD(x => x || { items: [], users: {}, follows: [] }); } }
    finally { if (gen === q.gen) q.busy = false; }
  };
  useEffect(() => { setD(null); setMore(false); load(true); }, [tab]);
  // Бесконечная лента: как только до конца остаётся меньше полутора экранов, догружаем следующую порцию. Кнопки нет.
  const nearEnd = () => { const el = tail.current; return !!el && el.getBoundingClientRect().top < window.innerHeight * 2.5; };
  useEffect(() => {
    const el = tail.current; if (!el || typeof IntersectionObserver !== 'function') return;
    const o = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting) && live.current.more) load(false); }, { rootMargin: '0px 0px 1200px 0px' });
    o.observe(el); return () => o.disconnect();
  }, [tab, !!d]);
  useEffect(() => { if (d && more && nearEnd()) load(false); }, [d && d.items.length, more]);      // порция оказалась короче экрана — берём следующую сразу
  // Живое обновление: раз в 2,5 минуты и при возвращении на вкладку спрашиваем, что нового и что изменилось у загруженного.
  const showFresh = (list, users) => setD(x => (x ? { ...x, items: list.filter(i => !x.items.some(k => k.id === i.id)).concat(x.items), users: { ...x.users, ...users } } : x));
  const refresh = async () => {
    const cur = live.current, q = z.current; if (!cur.d || q.busy || document.hidden) return;
    try {
      const r = await rpc('feed.fresh', { tab: cur.tab, after: q.stamp, ids: cur.d.items.filter(i => i.kind !== 'channel').slice(0, 100).map(i => i.id) }); if (live.current.tab !== cur.tab) return;
      q.stamp = r.now || q.stamp;
      setD(x => (x ? { ...x, items: x.items.filter(i => !r.gone.includes(i.id)).map(i => (r.stats[i.id] ? { ...i, ...r.stats[i.id] } : i)) } : x));
      if (!r.items.length) return;
      const sc = scroller();
      if (!sc || sc.scrollTop < 240) showFresh(r.items, r.users);      // человек наверху — новое просто появляется
      else setFresh(f => r.items.filter(i => !f.some(k => k.it.id === i.id)).map(it => ({ it, users: r.users })).concat(f));      // читает ниже — не дёргаем ленту, показываем кнопку
    } catch (e) { /* связь пропала — попробуем в следующий раз */ }
  };
  useEffect(() => {
    const t = setInterval(refresh, REFRESH_MS); let last = Date.now();
    const vis = () => { if (!document.hidden && Date.now() - last > 60e3) { last = Date.now(); refresh(); } };
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); };
  }, []);
  const applyFresh = () => { const f = live.current.fresh; setFresh([]); showFresh(f.map(x => x.it), Object.assign({}, ...f.map(x => x.users))); const sc = scroller(); if (sc) sc.scrollTo({ top: 0, behavior: 'smooth' }); };
  const change = p => setD(x => ({ ...x, items: x.items.map(q => q.id === p.id ? p : q) }));
  const follow = async (user, on) => { try { const r = await rpc('feed.follow', { user, on }); setD(x => ({ ...x, follows: r.follows })); toast(on ? 'Подписались. Записи этого человека появятся во вкладке «Подписки».' : 'Отписались'); } catch (e) { toast(e.message, 'err'); } };
  return html`<div class="hub-pad feed" ref=${root}>
    <div class="seg feed-tabs" role="tablist">${TABS.map(([k, name]) => html`<button role="tab" aria-selected=${tab === k} class=${cx(tab === k && 'on')} onClick=${() => setTab(k)}>${name}</button>`)}</div>
    ${fresh.length > 0 && html`<button class="feed-fresh" onClick=${applyFresh}><${Icon} n="arrow-up" s=${15} /> Новые записи: ${fresh.length}</button>`}
    <${Composer} onPost=${p => setD(x => ({ ...x, items: [p].concat(x ? x.items : []), users: { ...(x ? x.users : {}), [S.me.id]: S.me } }))} />
    ${!d ? html`<${Spinner} />` : !d.items.length
      ? html`<${Empty} icon="list" title=${tab === 'subs' ? 'Подписок пока нет' : tab === 'user' ? 'Вы ещё ничего не писали' : 'Лента пока пустая'} text=${tab === 'subs' ? 'Нажмите «Подписаться» у записи во вкладке «Для вас», и автор появится здесь.' : 'Напишите первую запись. Кто-то же должен начать.'} />`
      : d.items.map(p => html`<${Post} key=${p.id} p=${p} users=${d.users} follows=${d.follows} onChange=${change} onDel=${x => setD(s => ({ ...s, items: s.items.filter(q => q.id !== x.id) }))} onFollow=${follow} />`)}
    <div class="feed-tail" ref=${tail}>${d && more ? html`<${Spinner} />` : d && d.items.length > 8 ? html`<p class="hint center">Вы долистали до конца. Дальше только то, что напишете вы.</p>` : null}</div>
  </div>`;
}
