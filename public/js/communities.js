// Сообщества по интересам: готовые группы для айтишников и творческих. Вступаешь в один клик — и сразу
// попадаешь в группу с каналами. Если группы ещё не открылись на сервере, показываем, что будет, а не пустоту.
import { html, useState, useEffect, S, bump, rpc, toast, Icon, cx, Empty, Spinner, userName } from './lib.js';

const CO = { list: null, loading: false };
export async function loadCommunities(force) {
  if (CO.loading) return CO.list;
  CO.loading = true;
  try { const r = await rpc('guilds.seed'); CO.list = r.list || []; bump(); } catch (e) { CO.list = CO.list || []; }
  CO.loading = false;
  return CO.list;
}
export function Communities({ onOpen }) {
  useEffect(() => { loadCommunities(); }, []);
  const join = async tpl => {
    try { await rpc('guilds.join', { tpl }); toast('Вы вступили. Группа уже в списке чатов'); await loadCommunities(true); }
    catch (e) { toast(e.message, 'err'); }
  };
  if (!CO.list) return html`<div class="co-load"><${Spinner} /></div>`;
  if (!CO.list.length) return html`<${Empty} icon="users" title="Сообщества ещё не открылись" text="Загляните чуть позже — они появятся сами." />`;
  const groups = [['айти', 'Айтишникам', '⌨️'], ['творчество', 'Творческим', '🎨']];
  return html`<div class="co">
    <p class="co-lead">Готовые компании по интересам. Вступайте — внутри свой чат и каналы, без флуда и «привет, кто здесь».</p>
    ${groups.map(([cat, title, emoji]) => { const list = CO.list.filter(x => x.cat === cat); if (!list.length) return null;
      return html`<section class="co-sec"><h3>${emoji} ${title}</h3><div class="co-list">${list.map(c => html`<div class=${cx('co-card', c.joined && 'in')} key=${c.tpl}>
        <span class="co-e">${c.emoji}</span>
        <div class="co-t"><b>${c.name}</b><small>${c.about}</small><span class="co-n"><${Icon} n="users" s=${13} /> ${c.members + 1}</span></div>
        ${c.joined ? html`<button class="btn sm ghost" onClick=${() => onOpen && onOpen(c.id)}>Открыть</button>`
          : html`<button class="btn sm" disabled=${!c.exists} onClick=${() => join(c.tpl)}>${c.exists ? 'Вступить' : 'Скоро'}</button>`}
      </div>`)}</div></section>`; })}
  </div>`;
}
