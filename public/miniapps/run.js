// «Прыгун»: Листик бежит, прыгает через препятствия и собирает полезное. Касание или пробел — прыжок, в воздухе можно прыгнуть ещё раз.
import { stage, loop, text, rnd, pick } from '/miniapps/game.js';
import { leafy, item, scene, burst, sparks } from '/miniapps/art.js';
import { TH, panel, milestones } from '/miniapps/play.js';
const NAMES = { beach: 'Пляжная пробежка', jan: 'Зарядка на морозе', apr: 'Банановый забег', jul: 'Полоса выживания', sep: 'Не опоздай', oct: 'Ночь тыкв' };
const W = 360, H = 520, GY = 410, X = 84, cv = document.getElementById('cv'), { ctx } = stage(cv, W, H);
const title = NAMES[TH.key] || 'Прыгун: ' + TH.name, UI = panel('run', title, 'Нажимайте на экран или пробел, чтобы прыгнуть. В воздухе можно прыгнуть второй раз. Собирайте полезное, перепрыгивайте лишнее.');
const G = { on: false, t: 0, y: 0, vy: 0, jumps: 0, run: 0, obs: [], bon: [], fx: [], score: 0, lives: 3, next: 1, inv: 0, mood: 'ok', moodT: 0, off: 0 }; let mile = milestones([15, 40, 80]);
const jump = () => { if (!G.on || G.jumps >= 2) return; G.vy = G.jumps ? -470 : -560; G.jumps++; burst(G.fx, X, GY - G.y, 'rgba(255,255,255,.7)', 4); };
cv.addEventListener('pointerdown', e => { e.preventDefault(); jump(); }); addEventListener('keydown', e => { if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') { e.preventDefault(); jump(); } });
UI.start(() => { Object.assign(G, { on: true, t: 0, y: 0, vy: 0, jumps: 0, obs: [], bon: [], fx: [], score: 0, lives: 3, next: 1.2, inv: 0, mood: 'ok' }); mile = milestones([15, 40, 80]); });
function step(dt) {
  G.t += dt; G.moodT -= dt; if (G.moodT <= 0) G.mood = 'ok'; G.inv = Math.max(0, G.inv - dt);
  const sp = G.on ? 200 + Math.min(220, G.score * 4) : 40; G.off += sp * dt;
  if (G.on) {
    G.run += dt * (12 + sp / 40); G.vy += 1500 * dt; G.y -= G.vy * dt; if (G.y <= 0) { G.y = 0; G.vy = 0; G.jumps = 0; }
    G.next -= dt;
    if (G.next <= 0) { G.next = rnd(0.95, 1.7) * Math.max(0.6, 1 - G.score / 160); G.obs.push({ n: pick(TH.jump), x: W + 30, r: rnd(15, 20), ok: false }); if (Math.random() < 0.7) G.bon.push({ n: Math.random() < 0.08 ? 'gold' : pick(TH.good), x: W + 30 + rnd(70, 150), h: rnd(40, 150) }); }
    for (let i = G.obs.length - 1; i >= 0; i--) {
      const o = G.obs[i]; o.x -= sp * dt;
      if (!o.ok && o.x < X - 26) { o.ok = true; G.score++; mile(G.score); }
      if (!G.inv && Math.abs(o.x - X) < o.r + 15 && G.y < o.r * 1.5) { G.lives--; G.inv = 1.1; G.mood = 'hurt'; G.moodT = 0.8; burst(G.fx, X, GY - 20, '#E0244F', 10); if (G.lives <= 0) { G.on = false; UI.over(G.score, 'Очков'); } }
      if (o.x < -40) G.obs.splice(i, 1);
    }
    for (let i = G.bon.length - 1; i >= 0; i--) {
      const b = G.bon[i]; b.x -= sp * dt;
      if (Math.abs(b.x - X) < 28 && Math.abs(b.h - (G.y + 36)) < 44) { G.bon.splice(i, 1); G.score += b.n === 'gold' ? 5 : 1; G.mood = 'happy'; G.moodT = 0.3; burst(G.fx, b.x, GY - b.h, b.n === 'gold' ? '#F5B700' : '#3DB96A', 8); mile(G.score); continue; }
      if (b.x < -40) G.bon.splice(i, 1);
    }
  }
  scene(ctx, W, H, TH, G.t, GY);
  ctx.fillStyle = 'rgba(0,0,0,.08)'; for (let i = 0; i < 8; i++) { const x = ((i * 60 - G.off) % (W + 60) + W + 60) % (W + 60) - 30; ctx.fillRect(x, GY + 14, 26, 4); }
  for (const o of G.obs) item(ctx, o.n, o.x, GY - o.r * 0.9, o.r, G.t);
  for (const b of G.bon) item(ctx, b.n, b.x, GY - b.h + Math.sin(G.t * 4 + b.x * 0.05) * 4, 13, G.t);
  if (!(G.inv > 0 && Math.floor(G.inv * 12) % 2)) leafy(ctx, X, GY - 40 - G.y, 78, { t: G.t, dir: 1, run: G.run, mood: G.mood, hat: TH.hat, air: G.y > 2 });
  sparks(ctx, G.fx, dt);
  const ink = TH.dark ? '#fff' : '#17324A'; text(ctx, String(G.score), 20, 30, 26, ink, 'left'); for (let i = 0; i < 3; i++) { ctx.globalAlpha = i < G.lives ? 1 : 0.22; item(ctx, 'heart', W - 24 - i * 26, 30, 10, 0); } ctx.globalAlpha = 1;
  if (UI.best() > 0) text(ctx, 'рекорд ' + UI.best(), 20, 54, 12, ink, 'left');
}
loop(step);
