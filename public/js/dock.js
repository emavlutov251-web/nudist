// «Нудист»: закреплённый плеер — вставка с чужого сайта (официальный плеер Яндекс Музыки, прямой эфир телеканала).
// Плеер живёт вне окон и вкладок: музыку можно свернуть в полоску внизу, и она продолжит играть, пока вы ходите по чатам.
// Вставка сидит в «песочнице»: ей нельзя листать историю страницы (иначе её «Назад» закрывал бы наши экраны) и уводить приложение на другой сайт.
import { html, useEffect, S, bump, Icon, cx, toast, local } from './lib.js';
import { stopAudio } from './media.js';

const SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation';
/** Старая Android-оболочка (до 1.4) открывала вставки во внешнем браузере — в ней плеер не показываем. */
export const oldShell = () => { try { return / NudistAndroid\//.test(navigator.userAgent) && !(window.NudistApp && window.NudistApp.version && Number(window.NudistApp.version()) >= 14); } catch (e) { return true; } };

/** Открыть плеер. d: { kind: 'ym' | 'tv', key, title, src, link, h?, list?, n? }. Тот же самый плеер просто разворачивается, не перезапускаясь. */
export function openDock(d) {
  const cur = S.dock;
  if (cur && cur.key === d.key) { cur.open = true; bump(); return; }
  if (S.player) stopAudio();      // своя музыка и вставка одновременно не играют
  S.dock = { ...d, open: true }; bump();
}
/** Убрать окно плеера с экрана. Музыка сворачивается в полоску и играет дальше; телевизор выключается. */
export function foldDock() {
  const d = S.dock; if (!d || !d.open) return;
  if (d.kind !== 'ym' || oldShell()) { closeDock(); return; }
  d.open = false;
  if (!local.get('dock.hint')) { local.set('dock.hint', 1); toast('Плеер свёрнут, музыка играет дальше. Выключить — крестик на полоске внизу'); }
  bump();
}
export function closeDock() { if (!S.dock) return; S.dock = null; bump(); }
function zap(step) {
  const d = S.dock; if (!d || !d.list || d.list.length < 2) return;
  const i = d.list.findIndex(c => c.key === d.key), c = d.list[(i + step + d.list.length) % d.list.length];
  local.set('tv.last', c.id); S.dock = { ...c, list: d.list, open: true }; bump();
}

export function Dock() {
  const d = S.dock, mini = !!(d && !d.open);
  useEffect(() => { document.documentElement.classList.toggle('has-dock', mini); }, [mini]);
  if (!d) return null;
  const tv = d.kind === 'tv', old = oldShell();
  return html`<div class=${cx('dock', 'dock-' + d.kind, d.open ? 'open' : 'mini')}>
    <div class="dock-win" role="dialog" aria-label=${d.title} aria-hidden=${mini ? 'true' : 'false'}>
      <div class="dock-shade" onClick=${foldDock}></div>
      <div class="dock-card">
        <header class="dock-h">
          <${Icon} n=${tv ? 'tv' : 'music'} />
          ${tv && d.list && d.list.length > 1 && html`<button class="ib sm" onClick=${() => zap(-1)} title="Предыдущий канал" aria-label="Предыдущий канал"><${Icon} n="chevron-left" s=${18} /></button>`}
          <h2>${tv && html`<i class="dock-n">${d.n}</i>`}${d.title}</h2>
          ${tv && d.list && d.list.length > 1 && html`<button class="ib sm" onClick=${() => zap(1)} title="Следующий канал" aria-label="Следующий канал"><${Icon} n="chevron-right" s=${18} /></button>`}
          ${tv ? html`<button class="ib" onClick=${closeDock} title="Выключить телевизор" aria-label="Выключить телевизор"><${Icon} n="x" /></button>`
            : html`<button class="ib" onClick=${foldDock} title="Свернуть — музыка будет играть дальше" aria-label="Свернуть плеер"><${Icon} n="chevron-down" /></button>`}
        </header>
        <div class="dock-b">
          ${old ? html`<p class="note warn">В старой версии приложения вставки с других сайтов не открываются. Обновите «Нудист» или нажмите кнопку ниже.</p>`
            : html`<iframe key=${d.key} class="dock-frame" style=${tv ? '' : `height:${d.h || 450}px`} src=${d.src} sandbox=${SANDBOX} allow="autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" title=${tv ? 'Прямой эфир: ' + d.title : 'Плеер Яндекс Музыки'}></iframe>`}
          ${!tv && html`<p class="hint">Это официальный плеер Яндекс Музыки. Что играть целиком, а что отрывком — решает Яндекс: полные треки он обычно даёт тем, кто вошёл к нему с подпиской. Окно можно свернуть — музыка не остановится.</p>`}
        </div>
        <footer class="dock-f">
          ${tv && html`<span class="hint">Это страница эфира на сайте канала. Не показывает — откройте её отдельно.</span>`}
          ${!tv && !old && html`<button class="btn ghost" onClick=${closeDock}><${Icon} n="square" s=${15} /> Выключить</button>`}
          <a class="btn ghost" href=${d.link} target="_blank" rel="noopener noreferrer"><${Icon} n="external-link" s=${16} /> ${tv ? 'На сайте канала' : 'Открыть в Яндекс Музыке'}</a>
        </footer>
      </div>
    </div>
    ${mini && html`<div class="dock-mini">
      <button class="dock-mini-m" onClick=${() => { d.open = true; bump(); }} title="Развернуть плеер"><span class="dock-eq"><i></i><i></i><i></i></span><span class="dock-mini-t"><b>${d.title}</b><small>Плеер Яндекс Музыки свёрнут · нажмите, чтобы развернуть</small></span><${Icon} n="chevron-up" s=${18} /></button>
      <button class="ib" onClick=${closeDock} title="Выключить музыку" aria-label="Выключить музыку"><${Icon} n="x" /></button>
    </div>`}
  </div>`;
}
