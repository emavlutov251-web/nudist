// «Банный рояль»: карточная битва на две дорожки против компьютера. Свои внизу, чужие сверху, пар — валюта.
import { ready, share, $, earn } from '/miniapps/kit.js';
import { stage, loop, emo, text, rnd, pick, clamp, dist } from '/miniapps/game.js';
const W = 360, H = 470, RIVER = 235, LANES = [80, 280], { ctx, pos } = stage($('#cv'), W, H);
const CARDS = {
  ban: { n: 'Банщик', e: '🧖', cost: 3, hp: 520, dmg: 70, rate: 1, range: 6, sp: 38, r: 12 },
  ven: { n: 'Веничник', e: '🌿', cost: 3, hp: 190, dmg: 40, rate: .9, range: 92, sp: 36, r: 10 },
  mor: { n: 'Морж', e: '🦭', cost: 5, hp: 1400, dmg: 115, rate: 1.5, range: 6, sp: 23, r: 16, tw: true },
  kom: { n: 'Комары', e: '🦟', cost: 2, hp: 55, dmg: 22, rate: .6, range: 4, sp: 64, r: 8, k: 3 },
  utk: { n: 'Утка', e: '🦆', cost: 2, hp: 190, dmg: 46, rate: .7, range: 5, sp: 58, r: 10 },
  kip: { n: 'Кипяток', e: '♨️', cost: 4, spell: true, dmg: 230, rad: 46 },
};
let G = null, sel = null, ai = 0;
const tower = (side, x, y, king) => ({ tower: true, side, x, y, king, hp: king ? 2400 : 1400, max: king ? 2400 : 1400, r: king ? 24 : 19, range: king ? 105 : 115, dmg: king ? 55 : 45, rate: .85, cd: 0 });
function reset() {
  G = { t: 120, over: false, steam: [5, 5], units: [], fx: [], hand: [], deck: Object.keys(CARDS).sort(() => Math.random() - .5),
    towers: [tower(0, 80, 385), tower(0, 280, 385), tower(0, 180, 430, true), tower(1, 80, 85), tower(1, 280, 85), tower(1, 180, 40, true)] };
  for (let i = 0; i < 4; i++) G.hand.push(G.deck.shift()); sel = null; ai = 2; drawHand(); window.__g = G;
}
function spawn(side, id, x, y) {
  const c = CARDS[id];
  if (c.spell) { G.fx.push({ boom: true, x, y, r: c.rad, t: .45 }); for (const o of [...G.units, ...G.towers]) if (o.side !== side && o.hp > 0 && Math.hypot(o.x - x, o.y - y) < c.rad + o.r) o.hp -= o.tower ? c.dmg * .4 : c.dmg; return; }
  for (let i = 0; i < (c.k || 1); i++) G.units.push({ ...c, id, side, x: x + (c.k ? rnd(-14, 14) : 0), y: y + (c.k ? rnd(-10, 10) : 0), max: c.hp, cd: rnd(0, .3), lane: x < W / 2 ? 0 : 1 });
}
function play(i, p) {
  const id = G.hand[i], c = CARDS[id]; if (!c || G.over) return;
  if (G.steam[0] < c.cost) return;
  if (!c.spell && p.y < RIVER + 16) return flash('Бойцов можно ставить только на своей половине');
  G.steam[0] -= c.cost; spawn(0, id, clamp(p.x, 14, W - 14), clamp(p.y, 14, H - 14)); G.deck.push(id); G.hand[i] = G.deck.shift(); sel = null; drawHand();
}
let note = '', noteT = 0; const flash = t => { note = t; noteT = 1.6; };
function target(u) {
  let best = null, bd = 1e9;
  if (!u.tw) for (const o of G.units) if (o.side !== u.side && o.hp > 0) { const d = dist(u, o); if (d < 95 && d < bd) { bd = d; best = o; } }
  if (best) return best;
  for (const o of G.towers) if (o.side !== u.side && o.hp > 0) { const d = dist(u, o) + (o.king ? 60 : 0); if (d < bd) { bd = d; best = o; } }
  return best;
}
function hit(a, o) { o.hp -= a.dmg; G.fx.push({ x1: a.x, y1: a.y, x2: o.x, y2: o.y, t: .12, c: a.side ? '#ff8a65' : '#9be7a8' }); }
function step(dt) {
  if (G && !G.over && $('#ov').hidden) {
    G.t -= dt; const rate = (G.t < 30 ? 2 : 1) / 1.35; G.steam = G.steam.map(s => Math.min(10, s + dt * rate));
    for (const u of G.units) { if (u.hp <= 0) continue; u.cd -= dt; const o = target(u); if (!o) continue;
      const d = dist(u, o), reach = u.range + u.r + o.r;
      if (d <= reach) { if (u.cd <= 0) { u.cd = u.rate; hit(u, o); } continue; }
      let tx = o.x, ty = o.y; const lx = LANES[u.lane];      // через реку только по мосту своей дорожки
      if ((u.y - RIVER) * (o.y - RIVER) < 0 && Math.abs(u.y - RIVER) > 4) { tx = lx; ty = RIVER; if (Math.abs(u.x - lx) > 6 && Math.abs(u.y - RIVER) < 26) ty = u.y; }
      const l = Math.hypot(tx - u.x, ty - u.y) || 1; u.x += (tx - u.x) / l * u.sp * dt; u.y += (ty - u.y) / l * u.sp * dt; }
    for (const t of G.towers) { if (t.hp <= 0) continue; t.cd -= dt; if (t.cd > 0) continue; let best = null, bd = t.range; for (const u of G.units) if (u.side !== t.side && u.hp > 0) { const d = dist(t, u); if (d < bd) { bd = d; best = u; } } if (best) { t.cd = t.rate; hit(t, best); } }
    G.units = G.units.filter(u => u.hp > 0);
    // компьютер: копит пар до случайного порога, защищает дорожку, где на него идут, изредка льёт кипяток в толпу
    ai -= dt; if (ai <= 0) { ai = rnd(.6, 1.4); const mine = G.units.filter(u => u.side === 0), crowd = mine.find(u => mine.filter(o => dist(u, o) < 40).length >= 3);
      if (crowd && G.steam[1] >= 4 && Math.random() < .7) { G.steam[1] -= 4; spawn(1, 'kip', crowd.x, crowd.y); }
      else if (G.steam[1] >= rnd(4, 9)) { const can = Object.keys(CARDS).filter(k => !CARDS[k].spell && CARDS[k].cost <= G.steam[1]), id = pick(can), danger = mine.filter(u => u.y < RIVER + 40); const lane = danger.length ? danger[0].lane : Math.random() < .5 ? 0 : 1; if (id) { G.steam[1] -= CARDS[id].cost; spawn(1, id, LANES[lane] + rnd(-16, 16), danger.length ? rnd(110, 150) : rnd(120, 200)); } } }
    const king = s => G.towers.find(t => t.side === s && t.king), alive = s => G.towers.filter(t => t.side === s && t.hp > 0).length;
    $('#mine').textContent = 3 - alive(1); $('#his').textContent = 3 - alive(0); const sec = Math.max(0, Math.ceil(G.t)); $('#time').textContent = Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0') + (G.t < 30 ? ' · пар ×2' : '');
    if (king(0).hp <= 0) end(-1); else if (king(1).hp <= 0) end(1); else if (G.t <= 0) { const d = alive(0) - alive(1) || Math.sign(G.towers.filter(t => t.side === 0).reduce((a, t) => a + Math.max(0, t.hp), 0) - G.towers.filter(t => t.side === 1).reduce((a, t) => a + Math.max(0, t.hp), 0)); end(Math.sign(d)); }
    $('#steam i').style.width = G.steam[0] * 10 + '%'; $('#steam b').textContent = Math.floor(G.steam[0]) + ' ♨️';
    document.querySelectorAll('#hand button').forEach((b, i) => b.classList.toggle('poor', G.steam[0] < CARDS[G.hand[i]].cost));
  }
  if (G) { for (const f of G.fx) f.t -= dt; G.fx = G.fx.filter(f => f.t > 0); } noteT -= dt; draw();
}
function end(r) {
  G.over = true; G.result = r; if (r > 0) earn('win');
  $('#ovE').textContent = r > 0 ? '🏆' : r < 0 ? '🥶' : '🤝'; $('#ovT').textContent = r > 0 ? 'Победа!' : r < 0 ? 'Вас выгнали из бани' : 'Ничья';
  $('#ovP').textContent = `Башни: ${$('#mine').textContent} : ${$('#his').textContent}. ` + (r > 0 ? 'С лёгким паром.' : r < 0 ? 'Веник отобрали, тазик тоже.' : 'Разошлись по парилкам.');
  $('#go').textContent = 'Ещё раз'; $('#share').hidden = false; $('#ov').hidden = false;
}
function draw() {
  ctx.fillStyle = '#3f8f52'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#48a05d'; for (let y = 0; y < H; y += 40) for (let x = (y / 40 % 2) * 40; x < W; x += 80) ctx.fillRect(x, y, 40, 40);
  ctx.fillStyle = '#2b7bb8'; ctx.fillRect(0, RIVER - 11, W, 22); ctx.fillStyle = '#b98a57'; for (const x of LANES) ctx.fillRect(x - 22, RIVER - 14, 44, 28);
  if (!G) return;
  if (sel != null && !G.over) { ctx.fillStyle = 'rgba(255,255,255,.13)'; CARDS[G.hand[sel]].spell ? ctx.fillRect(0, 0, W, H) : ctx.fillRect(0, RIVER + 16, W, H - RIVER - 16); }
  for (const t of G.towers) { if (t.hp <= 0) { emo(ctx, '🪵', t.x, t.y, 22); continue; } ctx.fillStyle = t.side ? '#b5483b' : '#2f6fb1'; ctx.fillRect(t.x - t.r, t.y - t.r, t.r * 2, t.r * 2); emo(ctx, t.king ? '👑' : '🛖', t.x, t.y, t.r * 1.2); bar(t); }
  for (const u of G.units) { ctx.fillStyle = u.side ? 'rgba(214,72,56,.85)' : 'rgba(47,111,177,.85)'; ctx.beginPath(); ctx.arc(u.x, u.y, u.r, 0, 7); ctx.fill(); emo(ctx, u.e, u.x, u.y, u.r * 1.5); if (u.hp < u.max) bar(u); }
  for (const f of G.fx) { if (f.boom) { ctx.globalAlpha = f.t * 1.6; ctx.fillStyle = '#ffd9a0'; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 7); ctx.fill(); ctx.globalAlpha = 1; emo(ctx, '♨️', f.x, f.y, 30); } else { ctx.strokeStyle = f.c; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke(); } }
  if (noteT > 0) { ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(10, RIVER + 30, W - 20, 26); text(ctx, note, W / 2, RIVER + 43, 12); }
}
function bar(o) { const w = o.r * 2, k = clamp(o.hp / o.max, 0, 1); ctx.fillStyle = '#222'; ctx.fillRect(o.x - o.r, o.y - o.r - 7, w, 4); ctx.fillStyle = k > .5 ? '#6ddc7b' : k > .25 ? '#f0c040' : '#ef5350'; ctx.fillRect(o.x - o.r, o.y - o.r - 7, w * k, 4); }
function drawHand() { const h = $('#hand'); h.textContent = ''; G.hand.forEach((id, i) => { const c = CARDS[id], b = document.createElement('button'); b.type = 'button'; b.className = sel === i ? 'on' : ''; b.innerHTML = `<em>${c.cost}</em><span>${c.e}</span><small>${c.n}</small>`; b.onclick = () => { sel = sel === i ? null : i; drawHand(); }; h.appendChild(b); }); }
$('#cv').addEventListener('pointerdown', e => { if (!G || G.over || !$('#ov').hidden) return; if (sel == null) return flash('Сначала выберите карту внизу'); const c = CARDS[G.hand[sel]]; if (G.steam[0] < c.cost) return flash('Не хватает пара: нужно ' + c.cost); play(sel, pos(e)); });
$('#go').onclick = () => { reset(); $('#ov').hidden = true; }; $('#again').onclick = () => { reset(); $('#ov').hidden = true; };
$('#share').onclick = () => share(G.result > 0 ? `♨️ Банный рояль: победа ${$('#mine').textContent}:${$('#his').textContent}. С лёгким паром!` : G.result < 0 ? `♨️ Банный рояль: меня выгнали из бани со счётом ${$('#mine').textContent}:${$('#his').textContent}. Кто отомстит?` : `♨️ Банный рояль: ничья ${$('#mine').textContent}:${$('#his').textContent}.`);
ready(); loop(step);
