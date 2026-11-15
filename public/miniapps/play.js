// Общее для рисованных игр: карточка старта и итога, портрет Листика, рекорд, листики за результат.
import { ready, share, earn, store, score as score_, onTop, $ } from '/miniapps/kit.js';
import { leafy, themeOf } from '/miniapps/art.js';
export const TH = themeOf();
export function face(mood) { const cv = $('#face'); if (!cv) return; const c = cv.getContext('2d'); c.clearRect(0, 0, cv.width, cv.height); leafy(c, cv.width / 2, cv.height * 0.56, cv.height * 0.62, { t: 1, mood, hat: TH.hat }); }
// Пороги очков, за которые сервер даёт листики (у каждой игры потолок на день)
export function milestones(steps) { const done = new Set(); return score => { for (const s of steps) if (score >= s && !done.has(s)) { done.add(s); earn('p' + s); } }; }
export function panel(game, title, how) {
  const P = $('#panel'), key = game + '.best.' + TH.key; let onGo = () => {};
  const show = (h, t, big, mood, shareText) => { $('#title').textContent = h; $('#text').textContent = t; $('#big').hidden = big == null; $('#big').textContent = big == null ? '' : big; $('#go').textContent = big == null ? 'Играть' : 'Ещё раз'; $('#share').hidden = !shareText; $('#share').onclick = () => share(shareText); face(mood || 'ok'); P.hidden = false; };
  $('#go').onclick = () => { P.hidden = true; onGo(); };
  onTop(d => { if (P.hidden || !d.place) return; $('#text').textContent = `${$('#text').textContent} · ${d.event ? 'в событии' : 'за неделю'} вы ${d.place}-й из ${d.n}` + (d.top && d.top[0] ? `. Первый: ${d.top[0].user.name} — ${d.top[0].n}` : ''); });
  show(title, how);
  return { start(f) { onGo = f; }, best: () => store.get(key, 0), over(score, word) { const best = Math.max(score, store.get(key, 0)); store.set(key, best); if (score > 0) score_(score); show(score >= best && score > 0 ? 'Новый рекорд!' : 'Игра окончена', `Рекорд: ${best}`, score, score >= 15 ? 'happy' : 'hurt', `${word}: ${score} в игре «${title}» 🍃 Кто больше?`); } };
}
{ const box = document.querySelector('.stagebox'); if (box) box.style.background = `linear-gradient(${TH.sky[0]} 0 50%, ${TH.ground[1]} 50% 100%)`; }      // поля вокруг холста — в цвет неба и земли
ready();
