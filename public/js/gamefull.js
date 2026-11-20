// Полноэкранный режим игры. Мини-приложения живут в рамке посреди экрана — на телефоне это узкая полоска,
// в которую неудобно играть. Здесь игра разворачивается на весь экран, а на телефоне ещё и просит повернуть
// телефон горизонтально: в карточных и «беговых» играх так видно втрое больше.
import { useState, useEffect, html, Icon } from './lib.js';

// Повернуть экран можно только из полноэкранного режима и только в приложении (в браузере — своими средствами).
export const rotate = async () => {
  try {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      if (screen.orientation && screen.orientation.lock) { await screen.orientation.lock('landscape').catch(() => {}); return; }
    }
    const el = document.documentElement;
    if (el.requestFullscreen) await el.requestFullscreen().catch(() => {});
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape').catch(() => {});
  } catch (e) { /* не получилось — игра всё равно откроется на весь экран */ }
};

// Кнопки в углу: свернуть в обычное окно и повернуть телефон. Показываем только в полноэкранном режиме.
export function GameButtons({ onShrink }) {
  const [portrait, setPortrait] = useState(false);
  useEffect(() => {
    const check = () => setPortrait(matchMedia('(orientation: portrait)').matches);
    check(); addEventListener('resize', check); addEventListener('orientationchange', check);
    return () => { removeEventListener('resize', check); removeEventListener('orientationchange', check); };
  }, []);
  return html`<div class="gf-btns">
    <button title="Свернуть" aria-label="Свернуть игру" onClick=${onShrink}><${Icon} n="minimize-2" s=${19} /></button>
    <button title=${portrait ? 'Повернуть телефон' : 'Повернуть обратно'} aria-label="Повернуть" onClick=${rotate}><${Icon} n="rotate-cw" s=${19} /></button>
  </div>`;
}
export function RotateHint() {
  return html`<div class="gf-rotate"><span><${Icon} n="smartphone" s=${15} /> Поверните телефон — играть удобнее</span></div>`;
}
