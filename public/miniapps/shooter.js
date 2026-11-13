// «Комариный спецназ»: шутер с видом сверху. Волны насекомых, листья вместо пуль, бонусы с неба.
import { ready, share, $, store, earn } from '/miniapps/kit.js';
import { stage, loop, emo, text, rnd, pick, clamp, dist, sticks, drawStick, axis } from '/miniapps/game.js';
const W = 360, H = 520, cv = $('#cv'), { ctx, pos } = stage(cv, W, H), [mv, aim] = sticks(cv, pos, [p => p.x < W / 2, p => p.x >= W / 2]);
const KIND = { kom: { e: '🦟', hp: 1, sp: 58, r: 10 }, ovod: { e: '🪰', hp: 3, sp: 36, r: 13 }, osa: { e: '🐝', hp: 2, sp: 44, r: 11, shoot: true }, boss: { e: '🪲', hp: 26, sp: 26, r: 24, boss: true } };
let G = null, mouse = null;
cv.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') mouse = pos(e); }); cv.addEventListener('pointerleave', () => { mouse = null; });      // мышь — прицел; у пальца прицел свой, правым джойстиком
function reset() { G = { p: { x: W / 2, y: H / 2, hp: 5, inv: 0, cd: 0, rapid: 0, dir: -Math.PI / 2 }, foes: [], shots: [], stings: [], drops: [], fx: [], wave: 0, queue: [], spawn: 0, score: 0, over: false, pause: 1.2 }; window.__g = G; hud(); }
function nextWave() { G.wave++; const n = G.wave, q = []; for (let i = 0; i < 4 + n * 2; i++) q.push(n > 2 && Math.random() < .25 ? 'ovod' : n > 3 && Math.random() < .22 ? 'osa' : 'kom'); if (n % 5 === 0) q.push('boss'); G.queue = q; G.spawn = 0; G.banner = 1.6; if (n === 6) earn('w5'); if (n === 11) earn('w10'); hud(); }
function hud() { $('#hp').textContent = '❤️'.repeat(Math.max(0, G.p.hp)) + '🖤'.repeat(Math.max(0, 5 - G.p.hp)); $('#wave').textContent = Math.max(1, G.wave); $('#score').textContent = G.score; }
function edge() { const s = Math.floor(Math.random() * 4); return s === 0 ? { x: rnd(0, W), y: -20 } : s === 1 ? { x: W + 20, y: rnd(0, H) } : s === 2 ? { x: rnd(0, W), y: H + 20 } : { x: -20, y: rnd(0, H) }; }
function hurt() { const p = G.p; if (p.inv > 0) return; p.hp--; p.inv = 1.1; G.fx.push({ x: p.x, y: p.y, t: .4, e: '💢' }); hud(); if (p.hp <= 0) end(); }
function step(dt) {
  if (G && !G.over && $('#ov').hidden) {
    const p = G.p, k = axis(); let dx = mv.x + k.x, dy = mv.y + k.y; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
    p.x = clamp(p.x + dx * 150 * dt, 14, W - 14); p.y = clamp(p.y + dy * 150 * dt, 14, H - 14); p.inv -= dt; p.rapid -= dt; p.cd -= dt;
    // прицел: правый палец, мышь или ближайший враг
    let near = null, nd = 1e9; for (const f of G.foes) { const d = dist(p, f); if (d < nd) { nd = d; near = f; } }
    if (aim.on && (aim.x || aim.y)) p.dir = Math.atan2(aim.y, aim.x); else if (mouse) p.dir = Math.atan2(mouse.y - p.y, mouse.x - p.x); else if (near) p.dir = Math.atan2(near.y - p.y, near.x - p.x);
    if (p.cd <= 0 && (near || aim.on)) { p.cd = p.rapid > 0 ? .11 : .27; G.shots.push({ x: p.x, y: p.y, vx: Math.cos(p.dir) * 330, vy: Math.sin(p.dir) * 330, t: 1.2 }); }
    if (G.pause > 0) { G.pause -= dt; if (G.pause <= 0) nextWave(); }
    else { G.spawn -= dt; if (G.queue.length && G.spawn <= 0) { G.spawn = Math.max(.25, .9 - G.wave * .05); const id = G.queue.shift(), c = KIND[id]; G.foes.push({ ...c, id, ...edge(), max: c.hp + (c.boss ? G.wave : 0), hp: c.hp + (c.boss ? G.wave : 0), cd: rnd(1, 2.5), w: rnd(0, 6) }); } if (!G.queue.length && !G.foes.length) G.pause = 1.5; }
    for (const f of G.foes) { f.w += dt * 6; const d = dist(p, f) || 1, keep = f.shoot && d < 120 ? -0.4 : 1, sp = f.sp + G.wave * 1.5; f.x += ((p.x - f.x) / d * keep + Math.cos(f.w) * .35) * sp * dt; f.y += ((p.y - f.y) / d * keep + Math.sin(f.w) * .35) * sp * dt;
      if (f.shoot) { f.cd -= dt; if (f.cd <= 0 && d < 260) { f.cd = 2.2; G.stings.push({ x: f.x, y: f.y, vx: (p.x - f.x) / d * 140, vy: (p.y - f.y) / d * 140, t: 3 }); } }
      if (d < f.r + 11) hurt(); }
    for (const s of G.shots) { s.x += s.vx * dt; s.y += s.vy * dt; s.t -= dt; for (const f of G.foes) if (f.hp > 0 && Math.hypot(f.x - s.x, f.y - s.y) < f.r + 5) { f.hp--; s.t = 0; if (f.hp <= 0) { G.score += f.boss ? 10 : 1; G.fx.push({ x: f.x, y: f.y, t: .35, e: '💥' }); if (Math.random() < (f.boss ? 1 : .09)) G.drops.push({ x: f.x, y: f.y, t: 8, e: pick(['❤️', '⚡', '💣']) }); hud(); } break; } }
    for (const s of G.stings) { s.x += s.vx * dt; s.y += s.vy * dt; s.t -= dt; if (Math.hypot(p.x - s.x, p.y - s.y) < 13) { s.t = 0; hurt(); } }
    for (const d of G.drops) { d.t -= dt; if (dist(p, d) < 22) { d.t = 0; if (d.e === '❤️') p.hp = Math.min(5, p.hp + 1); else if (d.e === '⚡') p.rapid = 7; else { for (const f of G.foes) if (!f.boss) { f.hp = 0; G.score++; G.fx.push({ x: f.x, y: f.y, t: .35, e: '💥' }); } else f.hp -= 8; } hud(); } }
    G.foes = G.foes.filter(f => f.hp > 0); G.shots = G.shots.filter(s => s.t > 0 && s.x > -10 && s.x < W + 10 && s.y > -10 && s.y < H + 10); G.stings = G.stings.filter(s => s.t > 0); G.drops = G.drops.filter(d => d.t > 0);
    if (G.banner > 0) G.banner -= dt;
  }
  if (G) { for (const f of G.fx) f.t -= dt; G.fx = G.fx.filter(f => f.t > 0); } draw();
}
function end() { G.over = true; const best = Math.max(store.get('shooter.best', 0), G.score); store.set('shooter.best', best); $('#ovE').textContent = '🩹'; $('#ovT').textContent = 'Закусали'; $('#ovP').textContent = `Волна ${G.wave}, сбито: ${G.score}. Рекорд: ${best}.`; $('#go').textContent = 'Ещё раз'; $('#share').hidden = false; $('#ov').hidden = false; }
function draw() {
  ctx.fillStyle = '#e9d6a3'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#dfc98f'; for (let i = 0; i < 40; i++) ctx.fillRect((i * 97) % W, (i * 61) % H, 5, 3); ctx.fillStyle = '#58b7e0'; ctx.fillRect(0, 0, W, 26); ctx.fillStyle = '#8fd3ee'; ctx.fillRect(0, 22, W, 6); emo(ctx, '⛱️', 44, 92, 34); emo(ctx, '🌴', 318, 430, 38);
  if (!G) return; const p = G.p;
  for (const d of G.drops) { ctx.globalAlpha = d.t < 2 ? .5 : 1; emo(ctx, d.e, d.x, d.y, 20); ctx.globalAlpha = 1; }
  ctx.fillStyle = '#2e9d57'; for (const s of G.shots) { ctx.beginPath(); ctx.ellipse(s.x, s.y, 6, 3.4, Math.atan2(s.vy, s.vx), 0, 7); ctx.fill(); }
  ctx.fillStyle = '#7a4b00'; for (const s of G.stings) { ctx.beginPath(); ctx.arc(s.x, s.y, 3.5, 0, 7); ctx.fill(); }
  for (const f of G.foes) { emo(ctx, f.e, f.x, f.y + Math.sin(f.w) * 2, f.r * 2); if (f.max > 3) { ctx.fillStyle = '#222'; ctx.fillRect(f.x - 20, f.y - f.r - 9, 40, 4); ctx.fillStyle = '#ef5350'; ctx.fillRect(f.x - 20, f.y - f.r - 9, 40 * clamp(f.hp / f.max, 0, 1), 4); } }
  if (p.hp > 0 && !(p.inv > 0 && Math.floor(p.inv * 12) % 2)) { emo(ctx, '🧍', p.x, p.y, 28); emo(ctx, '🍃', p.x, p.y + 5, 11); ctx.strokeStyle = p.rapid > 0 ? '#f0a020' : '#1f7a45'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(p.x + Math.cos(p.dir) * 12, p.y + Math.sin(p.dir) * 12); ctx.lineTo(p.x + Math.cos(p.dir) * 22, p.y + Math.sin(p.dir) * 22); ctx.stroke(); }
  for (const f of G.fx) emo(ctx, f.e, f.x, f.y - (0.4 - f.t) * 30, 22);
  if (G.banner > 0) { ctx.globalAlpha = Math.min(1, G.banner); text(ctx, G.wave % 5 === 0 ? `Волна ${G.wave}: летит жук-начальник` : `Волна ${G.wave}`, W / 2, 150, 22, '#3a2a00'); ctx.globalAlpha = 1; }
  drawStick(ctx, mv); drawStick(ctx, aim);
}
$('#go').onclick = () => { reset(); $('#ov').hidden = true; };
$('#share').onclick = () => share(`🦟 Комариный спецназ: дошёл до волны ${G.wave}, сбил ${G.score}. Рекорд: ${store.get('shooter.best', 0)}. Кто больше?`);
ready(); loop(step);
