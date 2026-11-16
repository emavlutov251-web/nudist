// «Ловец»: Листик бегает по берегу и ловит то, что падает с неба. Оформление зависит от события (?t=feb, may, aug, dec…).
import { stage, loop, text, rnd, pick, clamp, keys } from '/miniapps/game.js';
import { leafy, item, scene, burst, sparks } from '/miniapps/art.js';
import { TH, panel, milestones } from '/miniapps/play.js';
import { live } from '/miniapps/kit.js';
const NAMES = { beach: 'Пляжный ловец', feb: 'Сердцеед', may: 'Пляжный волейбол', aug: 'Последний урожай', dec: 'Мандариновый дождь' };
const W = 360, H = 560, GY = 470, cv = document.getElementById('cv'), { ctx, pos } = stage(cv, W, H);
const title = NAMES[TH.key] || 'Ловец: ' + TH.name, UI = panel('catch', title, 'Ведите пальцем или жмите ← →. Ловите всё хорошее, от плохого уворачивайтесь. Золотой листик — пять очков.');
const G = { on: false, t: 0, x: W / 2, tx: W / 2, dir: 1, run: 0, items: [], fx: [], score: 0, lives: 3, spawn: 0, mood: 'ok', moodT: 0, shake: 0 }; let mile = milestones([15, 40, 80]);
cv.addEventListener('pointerdown', e => { G.tx = pos(e).x; }); cv.addEventListener('pointermove', e => { if (e.buttons || e.pointerType === 'touch') G.tx = pos(e).x; });
live(() => G.score);
UI.start(() => { Object.assign(G, { on: true, t: 0, items: [], fx: [], score: 0, lives: 3, spawn: 0.4, mood: 'ok' }); mile = milestones([15, 40, 80]); });
function step(dt) {
  G.t += dt; G.moodT -= dt; if (G.moodT <= 0) G.mood = 'ok'; G.shake = Math.max(0, G.shake - dt);
  if (G.on) {
    const k = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0); if (k) G.tx = clamp(G.x + k * 60, 24, W - 24);
    const dx = clamp(G.tx, 24, W - 24) - G.x, mv = clamp(dx, -420 * dt, 420 * dt); G.x += mv; if (Math.abs(mv) > 0.4) { G.dir = Math.sign(mv); G.run += dt * 16; }
    const lvl = 1 + G.score / 25; G.spawn -= dt;
    if (G.spawn <= 0) { G.spawn = Math.max(0.32, 0.95 - lvl * 0.09) * rnd(0.7, 1.2); const r = Math.random(), bad = r < Math.min(0.42, 0.2 + lvl * 0.03), gold = !bad && r > 0.95; G.items.push({ n: gold ? 'gold' : pick(bad ? TH.bad : TH.good), bad, gold, x: rnd(26, W - 26), y: -24, vy: rnd(150, 200) + lvl * 22, rot: rnd(-1, 1), a: 0 }); }
    for (let i = G.items.length - 1; i >= 0; i--) {
      const it = G.items[i]; it.y += it.vy * dt; it.a += it.rot * dt * 2;
      if (it.y > GY - 76 && it.y < GY - 8 && Math.abs(it.x - G.x) < 34) {
        G.items.splice(i, 1);
        if (it.bad) { G.lives--; G.mood = 'hurt'; G.moodT = 0.7; G.shake = 0.25; burst(G.fx, it.x, it.y, '#E0244F'); if (G.lives <= 0) { G.on = false; UI.over(G.score, 'Поймано'); } }
        else { G.score += it.gold ? 5 : 1; G.mood = 'happy'; G.moodT = 0.35; burst(G.fx, it.x, it.y, it.gold ? '#F5B700' : '#3DB96A', it.gold ? 16 : 7); mile(G.score); }
      } else if (it.y > GY + 6) { G.items.splice(i, 1); if (!it.bad) burst(G.fx, it.x, GY, 'rgba(255,255,255,.7)', 4); }
    }
  }
  ctx.save(); if (G.shake > 0) ctx.translate(rnd(-4, 4), rnd(-4, 4));
  scene(ctx, W, H, TH, G.t, GY);
  for (const it of G.items) { ctx.save(); ctx.translate(it.x, it.y); ctx.rotate(it.a); item(ctx, it.n, 0, 0, 17, G.t); ctx.restore(); }
  leafy(ctx, G.x, GY - 40, 78, { t: G.t, dir: G.dir, run: G.run, mood: G.mood, hat: TH.hat });
  sparks(ctx, G.fx, dt); ctx.restore();
  const ink = TH.dark ? '#fff' : '#17324A'; text(ctx, String(G.score), 20, 30, 26, ink, 'left'); for (let i = 0; i < 3; i++) { ctx.globalAlpha = i < G.lives ? 1 : 0.22; item(ctx, 'heart', W - 24 - i * 26, 30, 10, 0); } ctx.globalAlpha = 1;
  if (UI.best() > 0) text(ctx, 'рекорд ' + UI.best(), 20, 54, 12, ink, 'left');
}
loop(step);
