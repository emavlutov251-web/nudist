// «Банный рояль»: карточная битва на две дорожки против компьютера. Свои внизу, чужие сверху, пар — валюта.
import { ready, share, $, earn, result, live } from '/miniapps/kit.js';
import { stage, loop, text, rnd, pick, clamp, dist } from '/miniapps/game.js';
import { MI } from '/miniapps/mini-icons.js';
const W = 360, H = 470, RIVER = 235, LANES = [80, 280], { ctx, pos } = stage($('#cv'), W, H);

// ───── Рисованные спрайты (вместо эмодзи): тот же дуотон, что в иконках приложения
const IN = '#173F2C', LF = '#3DB96A', MN = '#7BE0A8', SF = '#DFF5E6', GD = '#F2C14E', GD2 = '#C8891A', CO = '#E0704F', PC = '#F2C09A', BR = '#8A5A3B', WT = '#FBF3E2', GR = '#9AA5B1', DK = '#2B2B33';
const lw = s => Math.max(1.4, s * 0.085);
const circ = (c, x, y, r, fill, stroke, w) => { c.beginPath(); c.arc(x, y, r, 0, 7); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke !== false) { c.lineWidth = w || lw(r * 2); c.strokeStyle = IN; c.stroke(); } };
const ell = (c, x, y, rx, ry, fill, stroke) => { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, 7); c.fillStyle = fill; c.fill(); if (stroke !== false) { c.lineWidth = lw(rx * 2); c.strokeStyle = IN; c.stroke(); } };
const line = (c, pts, w, col) => { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.lineWidth = w; c.strokeStyle = col; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke(); };
const poly = (c, pts, fill) => { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); c.fillStyle = fill; c.fill(); c.lineWidth = 2.2; c.strokeStyle = IN; c.lineJoin = 'round'; c.stroke(); };
const SPRITES = {
  ban(c, s) {           // банщик: спокойный дед с веником
    ell(c, 0, s * .28, s * .52, s * .42, PC);
    circ(c, 0, -s * .3, s * .44, PC);
    c.lineWidth = lw(s) * .8; c.strokeStyle = IN;
    c.beginPath(); c.arc(-s * .16, -s * .34, s * .09, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
    c.beginPath(); c.arc(s * .16, -s * .34, s * .09, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
    c.beginPath(); c.arc(0, -s * .16, s * .15, Math.PI * .18, Math.PI * .82); c.stroke();
    c.save(); c.translate(s * .42, s * .1); c.rotate(-.6); line(c, [0, 0, s * .1, -s * .62], s * .11, BR);
    for (let i = -1.5; i <= 1.5; i++) line(c, [s * .1, -s * .58, s * .1 + i * s * .16, -s * 1.05], s * .09, MN);
    c.restore();
    ell(c, 0, s * .42, s * .4, s * .13, SF);
  },
  ven(c, s) {           // веничник: человек-веник
    c.save(); c.rotate(-.18);
    poly(c, [0, -s, s * .78, s * .1, s * .38, s * .95, -s * .38, s * .95, -s * .78, s * .1], LF);
    line(c, [0, -s * .72, 0, s * .78], s * .09, '#1F7A43');
    line(c, [0, -s * .28, s * .34, -s * .52], s * .07, MN);
    line(c, [0, -s * .28, -s * .34, -s * .52], s * .07, MN);
    c.restore();
    circ(c, -s * .18, -s * .05, s * .09, DK, false); circ(c, s * .22, -s * .05, s * .09, DK, false);
    c.beginPath(); c.arc(s * .02, s * .3, s * .18, Math.PI * .2, Math.PI * .8); c.strokeStyle = IN; c.lineWidth = s * .08; c.stroke();
  },
  mor(c, s) {           // морж с клыками
    ell(c, 0, s * .18, s * .92, s * .66, GR);
    circ(c, 0, -s * .3, s * .5, GR);
    ell(c, 0, s * .02, s * .3, s * .2, '#B9C3CD');
    line(c, [-s * .16, s * .08, -s * .22, s * .42], s * .1, WT);
    line(c, [s * .16, s * .08, s * .22, s * .42], s * .1, WT);
    circ(c, -s * .2, -s * .36, s * .075, DK, false); circ(c, s * .2, -s * .36, s * .075, DK, false);
    c.strokeStyle = IN; c.lineWidth = s * .12; c.beginPath(); c.arc(0, -s * .78, s * .3, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
  },
  kom(c, s) {           // рой комаров
    for (const [dx, dy, k] of [[-s * .5, s * .3, .72], [s * .45, s * .42, .62], [0, -s * .35, .88]]) {
      c.save(); c.translate(dx, dy); c.scale(k, k);
      ell(c, -s * .3, -s * .3, s * .34, s * .2, SF, false); ell(c, s * .3, -s * .3, s * .34, s * .2, SF, false);
      ell(c, 0, 0, s * .17, s * .38, DK);
      line(c, [0, s * .3, -s * .3, s * .7], s * .07, DK); line(c, [0, s * .3, s * .3, s * .7], s * .07, DK); line(c, [0, s * .3, 0, s * .74], s * .07, DK);
      c.restore();
    }
  },
  utk(c, s) {           // утка
    ell(c, 0, s * .3, s * .72, s * .48, GD);
    circ(c, s * .42, -s * .18, s * .4, GD);
    poly(c, [s * .72, -s * .28, s * 1.24, -s * .14, s * .72, s * .06], CO);
    circ(c, s * .5, -s * .28, s * .06, DK, false);
    line(c, [-s * .5, s * .42, -s * .1, s * .42], s * .09, GD2);
  },
  kip(c, s) {           // кипяток: пар над чаном
    line(c, [-s * .8, s * .4, s * .8, s * .4], s * .3, BR);
    line(c, [-s * .62, s * .66, s * .62, s * .66], s * .18, BR);
    for (const [dx, h, k] of [[-s * .45, .5, .8], [0, .95, 1], [s * .45, .5, .8]]) {
      c.save(); c.translate(dx, -s * .05); c.scale(k, k);
      c.beginPath(); c.moveTo(0, s * .3); c.bezierCurveTo(-s * .3, s * .1, s * .3, -s * .12, 0, -s * .32); c.bezierCurveTo(-s * .26, -s * .5, s * .2, -s * .62, 0, -s * .78);
      c.lineWidth = s * .2; c.strokeStyle = SF; c.globalAlpha = .95; c.stroke(); c.globalAlpha = 1; c.restore();
    }
  },
};
function drawTower(c, t) {
  const s = t.r;
  if (t.hp <= 0) {
    line(c, [t.x - s * .9, t.y + s * .5, t.x + s * .9, t.y + s * .5], s * .35, BR);
    line(c, [t.x - s * .7, t.y, t.x + s * .75, t.y + s * .05], s * .3, BR);
    line(c, [t.x - s * .35, t.y - s * .35, t.x + s * .2, t.y - s * .1], s * .26, BR);
    circ(c, t.x - s * .95, t.y + s * .45, s * .12, DK, false); circ(c, t.x + s * .95, t.y + s * .5, s * .12, DK, false);
    return;
  }
  c.fillStyle = t.side ? '#B5483B' : '#2F6FB1';
  c.strokeStyle = IN; c.lineWidth = 2.4;
  c.fillRect(t.x - s, t.y - s * .55, s * 2, s * 1.35); c.strokeRect(t.x - s, t.y - s * .55, s * 2, s * 1.35);
  poly(c, [t.x - s * 1.18, t.y - s * .5, t.x, t.y - s * 1.45, t.x + s * 1.18, t.y - s * .5], BR);
  if (t.king) {
    poly(c, [t.x - s * .52, t.y - s * 1.62, t.x - s * .62, t.y - s * 2.14, t.x - s * .28, t.y - s * 1.8, t.x, t.y - s * 2.3, t.x + s * .28, t.y - s * 1.8, t.x + s * .62, t.y - s * 2.14, t.x + s * .52, t.y - s * 1.62], GD);
    circ(c, t.x, t.y - s * 1.86, s * .13, CO, false);
  } else {
    circ(c, t.x, t.y - s * 1.75, s * .16, GD, true);
  }
  c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(t.x - s, t.y - s * .55, s * 2, s * .28);
}
const drawSprite = (c, id, x, y, s) => { c.save(); c.translate(x, y); (SPRITES[id] || SPRITES.utk)(c, s); c.restore(); };
const CARDS = {
  ban: { n: 'Банщик', cost: 3, hp: 520, dmg: 70, rate: 1, range: 6, sp: 38, r: 12 },
  ven: { n: 'Веничник', cost: 3, hp: 190, dmg: 40, rate: .9, range: 92, sp: 36, r: 10 },
  mor: { n: 'Морж', cost: 5, hp: 1400, dmg: 115, rate: 1.5, range: 6, sp: 23, r: 16, tw: true },
  kom: { n: 'Комары', cost: 2, hp: 55, dmg: 22, rate: .6, range: 4, sp: 64, r: 8, k: 3 },
  utk: { n: 'Утка', cost: 2, hp: 190, dmg: 46, rate: .7, range: 5, sp: 58, r: 10 },
  kip: { n: 'Кипяток', cost: 4, spell: true, dmg: 230, rad: 46 },
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
    $('#steam i').style.width = G.steam[0] * 10 + '%'; $('#steam b').innerHTML = Math.floor(G.steam[0]) + ' ' + MI.steam;
    document.querySelectorAll('#hand button').forEach((b, i) => b.classList.toggle('poor', G.steam[0] < CARDS[G.hand[i]].cost));
  }
  if (G) { for (const f of G.fx) f.t -= dt; G.fx = G.fx.filter(f => f.t > 0); } noteT -= dt; draw();
}
function end(r) {
  G.over = true; G.result = r; if (r > 0) earn('win');
  { const down = G.towers.filter(t => t.side !== 0 && t.hp <= 0).length, kept = G.towers.filter(t => t.side === 0 && t.hp > 0).length; result(down * 10 + kept * 3 + (r > 0 ? 1 : 0)); }      // дуэль на бананах: 10 за снесённую башню, 3 за свою уцелевшую, 1 за победу
  $('#ovE').innerHTML = r > 0 ? MI.trophy : r < 0 ? MI.cold : MI.deal; $('#ovT').textContent = r > 0 ? 'Победа!' : r < 0 ? 'Вас выгнали из бани' : 'Ничья';
  $('#ovP').textContent = `Башни: ${$('#mine').textContent} : ${$('#his').textContent}. ` + (r > 0 ? 'С лёгким паром.' : r < 0 ? 'Веник отобрали, тазик тоже.' : 'Разошлись по парилкам.');
  $('#go').textContent = 'Ещё раз'; $('#share').hidden = false; $('#ov').hidden = false;
}
function draw() {
  ctx.fillStyle = '#3f8f52'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#48a05d'; for (let y = 0; y < H; y += 40) for (let x = (y / 40 % 2) * 40; x < W; x += 80) ctx.fillRect(x, y, 40, 40);
  ctx.fillStyle = '#2b7bb8'; ctx.fillRect(0, RIVER - 11, W, 22); ctx.fillStyle = '#b98a57'; for (const x of LANES) ctx.fillRect(x - 22, RIVER - 14, 44, 28);
  if (!G) return;
  if (sel != null && !G.over) { ctx.fillStyle = 'rgba(255,255,255,.13)'; CARDS[G.hand[sel]].spell ? ctx.fillRect(0, 0, W, H) : ctx.fillRect(0, RIVER + 16, W, H - RIVER - 16); }
  for (const t of G.towers) { ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.beginPath(); ctx.ellipse(t.x, t.y + t.r + 2, t.r * 1.05, 4, 0, 0, 7); ctx.fill(); drawTower(ctx, t); bar(t); }
  for (const u of G.units) { ctx.fillStyle = u.side ? 'rgba(214,72,56,.85)' : 'rgba(47,111,177,.85)'; ctx.beginPath(); ctx.arc(u.x, u.y, u.r, 0, 7); ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.stroke(); drawSprite(ctx, u.id, u.x, u.y, u.r * .88); if (u.hp < u.max) bar(u); }
  for (const f of G.fx) { if (f.boom) { ctx.globalAlpha = Math.max(0, f.t * 1.6); ctx.fillStyle = '#ffd9a0'; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 7); ctx.fill(); ctx.globalAlpha = 1; drawSprite(ctx, 'kip', f.x, f.y, 26); } else { ctx.strokeStyle = f.c; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke(); } }
  if (noteT > 0) { ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(10, RIVER + 30, W - 20, 26); text(ctx, note, W / 2, RIVER + 43, 12); }
}
function bar(o) { const w = o.r * 2, k = clamp(o.hp / o.max, 0, 1); ctx.fillStyle = '#222'; ctx.fillRect(o.x - o.r, o.y - o.r - 7, w, 4); ctx.fillStyle = k > .5 ? '#6ddc7b' : k > .25 ? '#f0c040' : '#ef5350'; ctx.fillRect(o.x - o.r, o.y - o.r - 7, w * k, 4); }
function drawHand() { const h = $('#hand'); h.textContent = ''; G.hand.forEach((id, i) => { const c = CARDS[id], b = document.createElement('button'); b.type = 'button'; b.className = sel === i ? 'on' : ''; b.innerHTML = `<em>${c.cost}</em><canvas width="46" height="46" aria-hidden="true"></canvas><small>${c.n}</small>`; const cx2 = b.querySelector('canvas').getContext('2d'); drawSprite(cx2, id, 23, 25, 14.5); b.onclick = () => { sel = sel === i ? null : i; drawHand(); }; h.appendChild(b); }); }
$('#cv').addEventListener('pointerdown', e => { if (!G || G.over || !$('#ov').hidden) return; if (sel == null) return flash('Сначала выберите карту внизу'); const c = CARDS[G.hand[sel]]; if (G.steam[0] < c.cost) return flash('Не хватает пара: нужно ' + c.cost); play(sel, pos(e)); });
$('#go').onclick = () => { reset(); $('#ov').hidden = true; }; $('#again').onclick = () => { reset(); $('#ov').hidden = true; };
$('#share').onclick = () => share(G.result > 0 ? `♨️ Банный рояль: победа ${$('#mine').textContent}:${$('#his').textContent}. С лёгким паром!` : G.result < 0 ? `♨️ Банный рояль: меня выгнали из бани со счётом ${$('#mine').textContent}:${$('#his').textContent}. Кто отомстит?` : `♨️ Банный рояль: ничья ${$('#mine').textContent}:${$('#his').textContent}.`);
live(() => (G ? G.towers.filter(t => t.side !== 0 && t.hp <= 0).length * 10 + G.towers.filter(t => t.side === 0 && t.hp > 0).length * 3 + (G.result > 0 ? 1 : 0) : 0));
{ const hc = document.querySelector('.hud-crown'); if (hc) hc.insertAdjacentHTML('afterbegin', MI.crown); const ov = $('#ovE'); if (ov && !ov.innerHTML) ov.innerHTML = MI.bath; }
ready(); loop(step);
