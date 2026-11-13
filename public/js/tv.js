// «Нудист»: телевизор. Двадцать федеральных каналов. Эфир показывает не «Нудист», а один из трёх источников на выбор:
// Rutube (раздел «ТВ онлайн»: эфиры выложены самими каналами, многие идут и с VPN), «Лайм HD ТВ» (limehd.tv) или сайт самого канала.
// Потоки мы не трогаем и не пересылаем. В приложении для Android 1.5+ страница источника открывается во встроенном браузере —
// так работают все 20 каналов. В обычном браузере то, что источник разрешает показывать во вставке, идёт прямо здесь, остальное — в новой вкладке.
import { html, useState, useEffect, rpc, Icon, cx, Empty, Spinner, local, plural } from './lib.js';
import { openDock, oldShell } from './dock.js';

const SOURCES = [['rutube', 'Rutube'], ['lime', 'Лайм'], ['sites', 'Сайты каналов']];
export function TV() {
  const [d, setD] = useState(null), [e, setE] = useState(''), [, redraw] = useState(0), last = local.get('tv.last') || '';      // последний канал мог смениться кнопками в самом плеере
  const load = () => { setE(''); setD(null); rpc('tv.list').then(setD).catch(x => setE(x.message || 'Не удалось получить список каналов')); };
  useEffect(load, []);
  // Откуда человек заходит: с включённым VPN «Лайм» и большинство каналов пишут «не доступен в вашем регионе» — предупреждаем заранее.
  // Спрашиваем у сервера заново при каждом возвращении в приложение: VPN могли выключить.
  const [cc, setCc] = useState('');
  useEffect(() => {
    let dead = false;
    const ask = () => { if (document.visibilityState === 'hidden') return; fetch('/api/version', { cache: 'no-store' }).then(r => r.json()).then(v => { if (!dead) setCc(/^[A-Z]{2}$/.test(v && v.cc) ? v.cc : ''); }).catch(() => {}); };
    ask(); document.addEventListener('visibilitychange', ask); window.addEventListener('focus', ask); window.addEventListener('online', ask);
    return () => { dead = true; document.removeEventListener('visibilitychange', ask); window.removeEventListener('focus', ask); window.removeEventListener('online', ask); };
  }, []);
  if (e) return html`<div class="hub-pad"><${Empty} icon="tv" title="Телевизор не включился" text=${e} /><p class="center"><button class="btn" onClick=${load}>Попробовать ещё раз</button></p></div>`;
  if (!d) return html`<div class="hub-pad"><${Spinner} /></div>`;
  const app = (() => { try { return !!(window.NudistApp && window.NudistApp.tv && Number(window.NudistApp.version()) >= 15); } catch (x) { return false; } })();      // встроенный браузер приложения
  const shell = / NudistAndroid\//.test(navigator.userAgent), old = oldShell();
  const vpn = !!cc && cc !== 'RU', land = (() => { try { return new Intl.DisplayNames(['ru'], { type: 'region' }).of(cc) || cc; } catch (x) { return cc; } })();
  const src = SOURCES.some(s => s[0] === local.get('tv.source')) ? local.get('tv.source') : 'rutube', lime = src === 'lime', rt = src === 'rutube';
  const onRt = c => rt && !!c.rt;      // у трёх каналов эфира на Rutube нет — для них остаётся сайт канала
  const url = c => onRt(c) ? c.rt : (lime && c.lime) || c.url;      // страница целиком: для встроенного браузера приложения и для новой вкладки
  const embed = c => old || lime ? '' : onRt(c) ? c.rtEmbed : c.frame ? c.url : '';      // что источник сам разрешает показывать во вставке; запреты не обходим
  const here = c => app || !!embed(c);
  const asDock = c => ({ kind: 'tv', key: 'tv:' + src + ':' + c.id, id: c.id, n: c.n, title: c.name, src: embed(c), link: url(c), site: onRt(c) ? 'Rutube' : '' });
  const mark = c => { local.set('tv.last', c.id); redraw(x => x + 1); };
  const watch = c => {
    mark(c);
    if (!app) return openDock({ ...asDock(c), list: d.channels.filter(here).map(asDock) });
    let ok = false; try { ok = window.NudistApp.tv(JSON.stringify(d.channels.map(x => ({ n: x.n, name: x.name, url: url(x) }))), d.channels.indexOf(c)); } catch (x) { /* ниже откроем сайт */ }
    if (ok === false) window.open(url(c), '_blank', 'noopener');
  };
  const n = d.channels.filter(here).length, noRt = d.channels.filter(c => !c.rt).map(c => c.name), okVpn = c => vpn && (onRt(c) ? c.rtAbroad : !lime && c.abroad);
  const where = c => onRt(c) ? 'на Rutube' : lime ? 'на Лайм HD ТВ' : 'на сайте канала';
  const sub = c => okVpn(c) ? 'идёт и с VPN' : here(c) ? (rt && !c.rt ? 'сайт канала' : 'смотреть здесь') : where(c);
  const body = c => html`<span class="tv-n" style=${`background:${c.color}`}>${c.n}</span><span class="tv-m"><b>${c.name}</b><small class=${cx(okVpn(c) && 'tv-ok')}>${sub(c)}</small></span><${Icon} n=${here(c) ? 'play' : 'external-link'} s=${16} />`;
  const rest = noRt.length ? ` ${noRt.join(', ')} на Rutube эфир не ведут — они открываются на своих сайтах.` : '';
  const hint = rt
    ? (app ? 'Каналы открываются прямо в приложении — на страницах прямого эфира Rutube, куда их выкладывают сами телекомпании.' : `Эфиры каналов на Rutube: их выкладывают сами телекомпании. ${n} ${plural(n, ['канал открывается', 'канала открываются', 'каналов открываются'])} прямо здесь, остальные Rutube разрешает смотреть только у себя — они откроются в новой вкладке.`) + rest + ' Какой-то канал не показывает — переключите источник.'
    : lime
      ? (app ? 'Все 20 каналов открываются прямо в приложении — на сайте «Лайм HD ТВ», в одном плеере. Пишет «Канал не доступен в вашем регионе» — значит, включён VPN: выключите его и нажмите ↻ или переключите источник на Rutube.' : '«Лайм HD ТВ» показывает все 20 каналов в одном плеере, но только на своём сайте: канал откроется в отдельной вкладке. С VPN не работает.')
      : (app ? 'Все 20 каналов открываются прямо в приложении — на странице прямого эфира самого канала. Какой-то канал не показывает — переключите источник.' : `Эфир показывает сайт самого канала. ${n ? n + ' ' + plural(n, ['канал открывается', 'канала открываются', 'каналов открываются']) + ' прямо здесь (подписаны «смотреть здесь»), остальные' : 'Каналы'} разрешают смотреть эфир только на своём сайте — они откроются в новой вкладке.`);
  return html`<div class="hub-pad tv">
    <div class="hub-bar"><h2 class="hub-t">Телевизор</h2><span class="grow"></span><span class="tv-live"><i></i>прямой эфир</span></div>
    <div class="hub-bar tv-bar"><span class="hint">Источник:</span><div class="seg tv-src" role="tablist">${SOURCES.map(([k, name]) => html`<button role="tab" aria-selected=${src === k} class=${cx(src === k && 'on')} onClick=${() => { local.set('tv.source', k); redraw(x => x + 1); }}>${name}</button>`)}</div></div>
    ${vpn && html`<div class="note warn tv-vpn"><span><b>Похоже, включён VPN: вы заходите не из России (${land}).</b>
      ${rt ? ' Каналы с зелёной пометкой «идёт и с VPN» на Rutube показывают и так. Остальные с VPN пишут «видео недоступно в вашей стране»:' : ' «Лайм HD ТВ» и сайты большинства каналов с VPN пишут «Канал не доступен в вашем регионе». Переключите источник на Rutube — там больше каналов идёт и с VPN — или'}
      ${app ? ' откройте канал, выключите VPN и нажмите ↻ вверху.' : ' выключите VPN и откройте канал заново.'}</span></div>`}
    <p class="hint">${hint}${app ? ' Стрелки вверху переключают каналы, видео разворачивается на весь экран кнопкой в плеере.' : ''}</p>
    ${!app && shell && html`<p class="note warn tv-upd"><span>В приложении версии 1.5 все 20 каналов открываются прямо внутри, без перехода в браузер.</span><a class="btn sm" href="/nudist.apk" download="nudist.apk">Обновить</a></p>`}
    <div class="tv-grid">${d.channels.map(c => here(c)
      ? html`<button key=${c.id} class=${cx('tv-ch', last === c.id && 'on')} onClick=${() => watch(c)} title=${'Смотреть: ' + c.name}>${body(c)}</button>`
      : html`<a key=${c.id} class=${cx('tv-ch out', last === c.id && 'on')} href=${url(c)} target="_blank" rel="noopener noreferrer" onClick=${() => mark(c)} title=${'Открыть эфир: ' + c.name}>${body(c)}</a>`)}</div>
    <p class="hint">Эфиры, плееры и реклама в них принадлежат телекомпаниям, Rutube и «Лайм HD ТВ»: «Нудист» только открывает их страницы. Часть эфиров показывают только в России — с VPN они могут не работать.</p>
  </div>`;
}
