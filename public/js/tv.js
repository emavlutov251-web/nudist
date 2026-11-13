// «Нудист»: телевизор. Двадцать федеральных каналов; эфир показывает сайт самого канала — во вставке или в отдельной вкладке.
import { html, useState, useEffect, rpc, Icon, cx, Empty, Spinner, local, plural } from './lib.js';
import { openDock, oldShell } from './dock.js';

const asDock = c => ({ kind: 'tv', key: 'tv:' + c.id, id: c.id, n: c.n, title: c.name, src: c.url, link: c.url });
export function TV() {
  const [d, setD] = useState(null), [e, setE] = useState(''), [, setLast] = useState(''), last = local.get('tv.last') || '';      // последний канал мог смениться кнопками в самом плеере
  const load = () => { setE(''); setD(null); rpc('tv.list').then(setD).catch(x => setE(x.message || 'Не удалось получить список каналов')); };
  useEffect(load, []);
  if (e) return html`<div class="hub-pad"><${Empty} icon="tv" title="Телевизор не включился" text=${e} /><p class="center"><button class="btn" onClick=${load}>Попробовать ещё раз</button></p></div>`;
  if (!d) return html`<div class="hub-pad"><${Spinner} /></div>`;
  const old = oldShell(), inside = d.channels.filter(c => c.frame && !old), list = inside.map(asDock);
  const watch = c => { local.set('tv.last', c.id); setLast(c.id); openDock({ ...asDock(c), list }); };
  const body = c => html`<span class="tv-n" style=${`background:${c.color}`}>${c.n}</span><span class="tv-m"><b>${c.name}</b><small>${c.frame && !old ? 'смотреть здесь' : 'на сайте канала'}</small></span><${Icon} n=${c.frame && !old ? 'play' : 'external-link'} s=${16} />`;
  return html`<div class="hub-pad tv">
    <div class="hub-bar"><h2 class="hub-t">Телевизор</h2><span class="grow"></span><span class="tv-live"><i></i>прямой эфир</span></div>
    <p class="hint">Двадцать федеральных каналов. Эфир показывает сайт самого канала. ${inside.length ? inside.length + ' ' + plural(inside.length, ['канал открывается', 'канала открываются', 'каналов открываются']) + ' прямо здесь (подписаны «смотреть здесь»), остальные' : 'Каналы'} разрешают смотреть эфир только на своём сайте — он откроется отдельно, в один тап.${old ? ' В этой версии приложения все каналы открываются отдельно: обновите «Нудист».' : ''}</p>
    <div class="tv-grid">${d.channels.map(c => c.frame && !old
      ? html`<button key=${c.id} class=${cx('tv-ch', last === c.id && 'on')} onClick=${() => watch(c)} title=${'Смотреть: ' + c.name}>${body(c)}</button>`
      : html`<a key=${c.id} class=${cx('tv-ch out', last === c.id && 'on')} href=${c.url} target="_blank" rel="noopener noreferrer" onClick=${() => { local.set('tv.last', c.id); setLast(c.id); }} title=${'Открыть эфир на сайте: ' + c.name}>${body(c)}</a>`)}</div>
    <p class="hint">Каналы и их плееры принадлежат самим телекомпаниям: реклама, качество и перерывы в вещании — на их стороне. Некоторые эфиры показывают только в России.</p>
  </div>`;
}
