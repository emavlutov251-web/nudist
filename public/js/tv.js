// «Нудист»: телевизор. Двадцать федеральных каналов. Эфир показывает не «Нудист», а один из двух источников на выбор:
// «Лайм HD ТВ» (limehd.tv — все каналы в одном плеере) или сайт самого канала. Потоки мы не трогаем и не пересылаем.
// В приложении для Android 1.5+ страница источника открывается во встроенном браузере — так работают все 20 каналов.
// В обычном браузере сайты, запретившие вставку в чужие страницы, открываются в новой вкладке.
import { html, useState, useEffect, rpc, Icon, cx, Empty, Spinner, local, plural } from './lib.js';
import { openDock, oldShell } from './dock.js';

const SOURCES = [['lime', 'Лайм HD ТВ'], ['sites', 'Сайты каналов']];
export function TV() {
  const [d, setD] = useState(null), [e, setE] = useState(''), [, redraw] = useState(0), last = local.get('tv.last') || '';      // последний канал мог смениться кнопками в самом плеере
  const load = () => { setE(''); setD(null); rpc('tv.list').then(setD).catch(x => setE(x.message || 'Не удалось получить список каналов')); };
  useEffect(load, []);
  if (e) return html`<div class="hub-pad"><${Empty} icon="tv" title="Телевизор не включился" text=${e} /><p class="center"><button class="btn" onClick=${load}>Попробовать ещё раз</button></p></div>`;
  if (!d) return html`<div class="hub-pad"><${Spinner} /></div>`;
  const app = (() => { try { return !!(window.NudistApp && window.NudistApp.tv && Number(window.NudistApp.version()) >= 15); } catch (x) { return false; } })();      // встроенный браузер приложения
  const shell = / NudistAndroid\//.test(navigator.userAgent), old = oldShell();
  const src = SOURCES.some(s => s[0] === local.get('tv.src')) ? local.get('tv.src') : (app ? 'lime' : 'sites'), lime = src === 'lime';
  const url = c => (lime && c.lime) || c.url;
  const here = c => app || (!lime && c.frame && !old);      // limehd.tv вставку в чужие страницы запрещает — во вставке его не показываем
  const asDock = c => ({ kind: 'tv', key: 'tv:' + c.id, id: c.id, n: c.n, title: c.name, src: c.url, link: c.url });
  const mark = c => { local.set('tv.last', c.id); redraw(x => x + 1); };
  const watch = c => {
    mark(c);
    if (!app) return openDock({ ...asDock(c), list: d.channels.filter(here).map(asDock) });
    let ok = false; try { ok = window.NudistApp.tv(JSON.stringify(d.channels.map(x => ({ n: x.n, name: x.name, url: url(x) }))), d.channels.indexOf(c)); } catch (x) { /* ниже откроем сайт */ }
    if (ok === false) window.open(url(c), '_blank', 'noopener');
  };
  const n = d.channels.filter(here).length, where = lime ? 'на Лайм HD ТВ' : 'на сайте канала';
  const body = c => html`<span class="tv-n" style=${`background:${c.color}`}>${c.n}</span><span class="tv-m"><b>${c.name}</b><small>${here(c) ? 'смотреть здесь' : where}</small></span><${Icon} n=${here(c) ? 'play' : 'external-link'} s=${16} />`;
  return html`<div class="hub-pad tv">
    <div class="hub-bar"><h2 class="hub-t">Телевизор</h2><span class="grow"></span><span class="tv-live"><i></i>прямой эфир</span></div>
    <div class="hub-bar"><span class="hint">Источник:</span><div class="seg tv-src" role="tablist">${SOURCES.map(([k, name]) => html`<button role="tab" aria-selected=${src === k} class=${cx(src === k && 'on')} onClick=${() => { local.set('tv.src', k); redraw(x => x + 1); }}>${name}</button>`)}</div></div>
    <p class="hint">${app
      ? (lime ? 'Все 20 каналов открываются прямо в приложении — на сайте «Лайм HD ТВ», в одном плеере. Не показывает или просит проверку «я не робот» слишком часто — переключите источник на «Сайты каналов».'
        : 'Все 20 каналов открываются прямо в приложении — на странице прямого эфира самого канала. Какой-то канал не показывает — переключите источник на «Лайм HD ТВ».') + ' Стрелки вверху переключают каналы, видео разворачивается на весь экран кнопкой в плеере.'
      : lime ? '«Лайм HD ТВ» показывает все 20 каналов в одном плеере, но только на своём сайте: канал откроется в отдельной вкладке.'
        : `Эфир показывает сайт самого канала. ${n ? n + ' ' + plural(n, ['канал открывается', 'канала открываются', 'каналов открываются']) + ' прямо здесь (подписаны «смотреть здесь»), остальные' : 'Каналы'} разрешают смотреть эфир только на своём сайте — он откроется отдельно, в один тап.`}</p>
    ${!app && shell && html`<p class="note warn tv-upd"><span>В приложении версии 1.5 все 20 каналов открываются прямо внутри, без перехода в браузер.</span><a class="btn sm" href="/nudist.apk" download="nudist.apk">Обновить</a></p>`}
    <div class="tv-grid">${d.channels.map(c => here(c)
      ? html`<button key=${c.id} class=${cx('tv-ch', last === c.id && 'on')} onClick=${() => watch(c)} title=${'Смотреть: ' + c.name}>${body(c)}</button>`
      : html`<a key=${c.id} class=${cx('tv-ch out', last === c.id && 'on')} href=${url(c)} target="_blank" rel="noopener noreferrer" onClick=${() => mark(c)} title=${'Открыть эфир: ' + c.name}>${body(c)}</a>`)}</div>
    <p class="hint">Эфиры, плееры и реклама в них принадлежат телекомпаниям и «Лайм HD ТВ»: «Нудист» только открывает их страницы. Многие эфиры показывают только в России — с VPN они могут не работать.</p>
  </div>`;
}
