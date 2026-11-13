// «Лента»: записи людей и каналов. Текст и до четырёх картинок, лайки, комментарии, подписки на авторов.
import { html, useState, useEffect, S, bump, rpc, toast, Icon, Avatar, Badges, cx, userName, fmtShort, fmtNum, confirmDlg, pickFile, upload, Empty, Spinner } from './lib.js';
import { openChat } from './store.js';

const TABS = [['all', 'Все'], ['subs', 'Подписки'], ['user', 'Мои записи']];

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
  const [open, setOpen] = useState(false), [full, setFull] = useState(false), ch = p.kind === 'channel', u = users[p.by];
  const lines = (p.text || '').split('\n'), long = !full && ((p.text || '').length > 700 || lines.length > 14);      // длинное сворачиваем, чтобы лента листалась
  const shown = long ? lines.slice(0, 10).join('\n').slice(0, 500).trimEnd() + '…' : p.text;
  const like = async () => { const on = !p.liked; onChange({ ...p, liked: on, likes: p.likes + (on ? 1 : -1) }); try { const r = await rpc('feed.like', { id: p.id, on }); onChange({ ...p, ...r }); } catch (e) { onChange(p); toast(e.message, 'err'); } };
  const del = async () => { if (!await confirmDlg({ title: 'Удалить запись?', text: 'Вместе с лайками и комментариями. Вернуть не получится.', ok: 'Удалить', danger: true })) return; try { await rpc('feed.del', { id: p.id }); onDel(p); } catch (e) { toast(e.message, 'err'); } };
  const mine = p.by === S.me.id, fol = follows.includes(p.by);
  return html`<article class="post">
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
        <button class=${cx('post-a', open && 'on')} aria-expanded=${open} title="Комментарии" onClick=${() => setOpen(!open)}><${Icon} n="message-circle" s=${18} /> ${p.comments ? fmtNum(p.comments) : ''}</button>`}</footer>
    ${open && !ch && html`<${Comments} post=${p} users=${users} onCount=${n => onChange({ ...p, comments: n })} />`}
  </article>`;
}

export function Feed() {
  const [tab, setTab] = useState('all'), [d, setD] = useState(null), [more, setMore] = useState(false);
  const load = async reset => {
    try {
      const off = reset || !d ? 0 : d.items.length, r = await rpc('feed.list', { tab, off });
      setD(x => reset || !x ? { items: r.items, users: r.users, follows: r.follows } : { items: x.items.concat(r.items.filter(i => !x.items.some(q => q.id === i.id))), users: { ...x.users, ...r.users }, follows: r.follows }); setMore(r.more);
    } catch (e) { toast(e.message, 'err'); setD(x => x || { items: [], users: {}, follows: [] }); }
  };
  useEffect(() => { setD(null); load(true); }, [tab]);
  const change = p => setD(x => ({ ...x, items: x.items.map(q => q.id === p.id ? p : q) }));
  const follow = async (user, on) => { try { const r = await rpc('feed.follow', { user, on }); setD(x => ({ ...x, follows: r.follows })); toast(on ? 'Подписались. Записи этого человека появятся во вкладке «Подписки».' : 'Отписались'); } catch (e) { toast(e.message, 'err'); } };
  return html`<div class="hub-pad feed">
    <div class="seg feed-tabs" role="tablist">${TABS.map(([k, name]) => html`<button role="tab" aria-selected=${tab === k} class=${cx(tab === k && 'on')} onClick=${() => setTab(k)}>${name}</button>`)}</div>
    <${Composer} onPost=${p => setD(x => ({ ...x, items: [p].concat(x ? x.items : []), users: { ...(x ? x.users : {}), [S.me.id]: S.me } }))} />
    ${!d ? html`<${Spinner} />` : !d.items.length
      ? html`<${Empty} icon="list" title=${tab === 'subs' ? 'Подписок пока нет' : tab === 'user' ? 'Вы ещё ничего не писали' : 'Лента пока пустая'} text=${tab === 'subs' ? 'Нажмите «Подписаться» у записи во вкладке «Все», и автор появится здесь.' : 'Напишите первую запись. Кто-то же должен начать.'} />`
      : d.items.map(p => html`<${Post} key=${p.id} p=${p} users=${d.users} follows=${d.follows} onChange=${change} onDel=${x => setD(s => ({ ...s, items: s.items.filter(q => q.id !== x.id) }))} onFollow=${follow} />`)}
    ${d && more && html`<button class="btn ghost feed-more" onClick=${() => load(false)}>Показать ещё</button>`}
  </div>`;
}
