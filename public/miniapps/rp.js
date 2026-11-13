// «Нудищево РП»: маленькая жизнь в провинциальном городе. Работа, еда, сон, транспорт. Одиночная игра, прогресс хранится на устройстве.
import { ready, share, $, store, earn, toast } from '/miniapps/kit.js';
import { stage, loop, emo, text, rnd, pick, clamp, dist, sticks, drawStick, axis, keys } from '/miniapps/game.js';
const W = 360, H = 460, T = 40, N = 30, WORLD = T * N, cv = $('#cv'), { ctx, pos } = stage(cv, W, H), [mv] = sticks(cv, pos, [() => true]);
const road = i => i % 6 === 2, at = (tx, ty) => ({ x: tx * T + T / 2, y: ty * T + T / 2 });
const POI = [
  { id: 'home', e: '🏠', n: 'Дом', ...at(10, 9) }, { id: 'food', e: '🥙', n: 'Шаурма', ...at(13, 9) }, { id: 'post', e: '📦', n: 'Почта', ...at(10, 13) }, { id: 'shop', e: '👕', n: 'Секонд-хенд', ...at(13, 13) },
  { id: 'plant', e: '🏭', n: 'Завод', ...at(16, 7) }, { id: 'cars', e: '🚗', n: 'Автосалон', ...at(17, 9) }, { id: 'hosp', e: '🏥', n: 'Больница', ...at(7, 10) },
];
const ADDR = [['ул. Ленина, 1', 4, 3], ['пер. Голый, 7', 22, 3], ['ул. Банная, 12', 25, 9], ['пр. Листопадный, 3', 4, 15], ['ул. Пляжная, 40', 22, 15], ['Гаражи', 16, 21], ['Общага №2', 10, 21], ['Дача тёщи', 4, 25], ['ул. Комариная, 5', 25, 21], ['Рынок', 21, 13], ['ул. Веничная, 9', 3, 7], ['Конечная', 27, 27]].map(([n, x, y], i) => ({ id: 'a' + i, addr: true, e: pick(['🏢', '🏚️', '🏡', '🏬']), n, ...at(x, y) }));
const PLACES = [...POI, ...ADDR], RIDES = [{ n: 'Пешком', e: '', sp: 85, cost: 0 }, { n: 'Самокат', e: '🛴', sp: 135, cost: 1500 }, { n: '«Жигули»', e: '🚗', sp: 190, cost: 7000 }, { n: '«Бэха»', e: '🏎️', sp: 250, cost: 30000 }], HATS = ['', '🧢', '🎩', '🪖', '👑'];
const SAY = ['Слышь, семки есть?', 'Молодой человек, вы за кем занимали?', 'Когда уже дорогу починят…', 'А раньше шаурма была по сорок.', 'Э, братишка, дай позвонить.', 'Маршрутку не видел? Полчаса жду.', 'Чё без шапки? Простудишься.', 'В наше время по газонам не ходили!'];
const tree = (x, y) => !road(x) && !road(y) && (x * 7 + y * 13 + x * y) % 9 === 0 && !PLACES.some(p => Math.abs(p.x - (x * T + 20)) < T && Math.abs(p.y - (y * T + 20)) < T);
let G = null, S = null, saveT = 0;
const fresh = () => ({ money: 300, food: 80, en: 90, xp: 0, ride: 0, hat: 0, hats: [0], jobs: 0, x: at(11, 10).x, y: at(11, 10).y });
function reset(wipe) {
  S = wipe ? fresh() : { ...fresh(), ...store.get('rp.save', {}) }; if (!Array.isArray(S.hats)) S.hats = [0];
  G = { cars: [], folk: [], quest: null, work: 0, safe: 2, msg: '', msgT: 0, tick: 0 };
  for (let i = 0; i < 9; i++) { const h = Math.random() < .5; G.cars.push({ h, line: pick([2, 8, 14, 20, 26]) * T + T / 2 + (Math.random() < .5 ? -8 : 8), p: rnd(0, WORLD), sp: rnd(90, 150) * (Math.random() < .5 ? 1 : -1), e: pick(['🚌', '🚕', '🚙', '🚚']) }); }
  for (let i = 0; i < 7; i++) G.folk.push({ x: rnd(8, 20) * T, y: rnd(6, 16) * T, tx: 0, ty: 0, t: 0, e: pick(['👵', '🧔', '👷', '🧑‍🦳', '👩‍🦰', '🧑‍🎓']), say: pick(SAY) });
  window.__g = G; window.__s = S; hud();
}
const lvl = () => 1 + Math.floor(S.xp / 100), pay = n => Math.round(n * (1 + (lvl() - 1) * .1)), tired = () => S.food <= 0 || S.en <= 0;
const tell = (t, s = 2.4) => { G.msg = t; G.msgT = s; };
function hud() { $('#money').textContent = S.money; $('#food').textContent = Math.round(S.food); $('#en').textContent = Math.round(S.en); $('#lvl').textContent = lvl(); }
function save() { store.set('rp.save', S); }
const near = () => { let b = null, bd = 46; for (const p of PLACES) { const d = dist(S, p); if (d < bd) { bd = d; b = p; } } return b; };
// Что предлагает кнопка действия рядом со зданием: [надпись, что сделать]
function action() {
  if (G.work > 0) return [`🔩 Крутить гайку (осталось ${G.work})`, () => { G.work--; if (!G.work) { const m = pay(350); S.money += m; S.xp += 12; S.en = Math.max(0, S.en - 25); S.food = Math.max(0, S.food - 10); S.jobs++; earn('job'); tell(`Смена закрыта: +${m} ₽`); save(); } }];
  const p = near(); if (!p) return null;
  if (G.quest && p.id === G.quest.to.id) return [`📦 Отдать посылку: ${p.n}`, () => { const m = pay(G.quest.pay); S.money += m; S.xp += 15; S.en = Math.max(0, S.en - 10); S.jobs++; G.quest = null; earn('job'); tell(`Посылка доставлена: +${m} ₽`); save(); }];
  switch (p.id) {
    case 'home': return ['😴 Поспать', () => { S.en = 100; S.food = Math.max(0, S.food - 15); tell('Выспались. Энергия на максимуме.'); save(); }];
    case 'food': return ['🥙 Шаурма — 150 ₽', () => { if (S.money < 150) return tell('На шаурму не хватает. Идите работать.'); S.money -= 150; S.food = Math.min(100, S.food + 60); tell(pick(['Шаурма огонь. Сытость +60.', 'В лаваше что-то мяукнуло, но вкусно.'])); save(); }];
    case 'post': return G.quest ? [`📦 Посылка уже у вас: ${G.quest.to.n}`, () => tell('Сначала отнесите эту: ' + G.quest.to.n)] : ['📦 Взять посылку', () => { if (tired()) return tell('Сил нет. Поешьте и поспите.'); const to = pick(ADDR); G.quest = { to, pay: 220 + Math.round(dist(p, to) / 4) }; tell(`Несите на адрес: ${to.n}. Стрелка покажет дорогу.`, 3.5); }];
    case 'plant': return ['🏭 Смена на заводе', () => { if (tired()) return tell('Сил нет. Поешьте и поспите.'); if (S.en < 25) return tell('На смену нужно 25 энергии. Поспите дома.'); G.work = 12; tell('Закрутите 12 гаек: жмите кнопку.'); }];
    case 'cars': { const n = RIDES[S.ride + 1]; return n ? [`${n.e} ${n.n} — ${n.cost} ₽`, () => { if (S.money < n.cost) return tell(`Не хватает ${n.cost - S.money} ₽. Копите.`); S.money -= n.cost; S.ride++; tell(`Теперь у вас ${n.n}. Скорость выросла.`); save(); }] : ['🏎️ Лучше «бэхи» тут нет', () => tell('Вы и так король района.')]; }
    case 'shop': { const i = HATS.findIndex((h, k) => k > 0 && !S.hats.includes(k)); return i > 0 ? [`${HATS[i]} Обновка — 500 ₽`, () => { if (S.money < 500) return tell('На обновку не хватает.'); S.money -= 500; S.hats.push(i); S.hat = i; tell('Модный приговор: одобрено.'); save(); }] : ['👕 Сменить шапку', () => { S.hat = S.hats[(S.hats.indexOf(S.hat) + 1) % S.hats.length]; save(); }]; }
    case 'hosp': return ['🏥 Подлечиться — 100 ₽', () => { if (S.money < 100) return tell('Бесплатно только зелёнка.'); S.money -= 100; S.en = Math.min(100, S.en + 40); tell('Капельница бодрит. Энергия +40.'); save(); }];
    default: return [`🚪 ${p.n}: постучать`, () => tell(pick(['Никого нет дома.', '«Мы ничего не заказывали!»', 'За дверью лает собака.']))];
  }
}
let actFn = null;
function step(dt) {
  if (G && $('#ov').hidden) {
    const k = axis(); let dx = mv.x + k.x, dy = mv.y + k.y; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
    if (G.work > 0 && l > .3) { G.work = 0; tell('Ушли со смены. Гайки обиделись.'); }
    const sp = RIDES[S.ride].sp * (tired() ? .5 : 1); S.x = clamp(S.x + dx * sp * dt, 12, WORLD - 12); S.y = clamp(S.y + dy * sp * dt, 12, WORLD - 12);
    G.tick += dt; if (G.tick >= 1) { G.tick = 0; S.food = Math.max(0, S.food - 1 / 7); S.en = Math.max(0, S.en - 1 / 9); if (tired() && G.msgT <= 0) tell(S.food <= 0 ? 'Вы голодны: еле идёте. Нужна шаурма.' : 'Сил нет: еле идёте. Домой, спать.'); hud(); }
    G.safe -= dt; G.msgT -= dt;
    for (const c of G.cars) { c.p += c.sp * dt; if (c.p > WORLD + 40) c.p = -40; if (c.p < -40) c.p = WORLD + 40; const cx = c.h ? c.p : c.line, cy = c.h ? c.line : c.p;
      if (G.safe <= 0 && Math.hypot(cx - S.x, cy - S.y) < 19) { const fee = Math.min(S.money, 300), h = PLACES.find(p => p.id === 'hosp'); S.money -= fee; S.x = h.x + 30; S.y = h.y + 34; S.en = Math.max(20, S.en - 20); G.safe = 3; G.work = 0; tell(`Вас сбила маршрутка. Больница: −${fee} ₽.`, 3.5); save(); } }
    for (const f of G.folk) { f.t -= dt; if (f.t <= 0) { f.t = rnd(2, 5); const a = rnd(0, 6.28); f.tx = Math.cos(a) * 22; f.ty = Math.sin(a) * 22; if (Math.random() < .3) f.tx = f.ty = 0; } f.x = clamp(f.x + f.tx * dt, 20, WORLD - 20); f.y = clamp(f.y + f.ty * dt, 20, WORLD - 20); }
    saveT += dt; if (saveT > 5) { saveT = 0; save(); }
    const a = action(), b = $('#act'); actFn = a ? a[1] : null; b.disabled = !a; const label = a ? a[0] : 'Подойдите к зданию'; if (b.textContent !== label) b.textContent = label;
    const q = G.quest ? `📦 Посылка → ${G.quest.to.n} · ${Math.round(dist(S, G.quest.to) / 10)} м · ${pay(G.quest.pay)} ₽` : G.work > 0 ? '🏭 Идёт смена: не отходите от станка' : S.jobs ? `Работ сделано: ${S.jobs}. ${RIDES[S.ride + 1] ? 'До «' + RIDES[S.ride + 1].n.replace(/[«»]/g, '') + '»: ' + Math.max(0, RIDES[S.ride + 1].cost - S.money) + ' ₽' : 'Вы король района.'}` : 'Найдите работу: 📦 почта или 🏭 завод.'; if ($('#quest').textContent !== q) $('#quest').textContent = q;
  }
  draw();
}
function doAct() { if (!actFn || !$('#ov').hidden) return; actFn(); hud(); }
function draw() {
  if (!G) { ctx.fillStyle = '#4c9a57'; ctx.fillRect(0, 0, W, H); return; }
  const cx = clamp(S.x - W / 2, 0, WORLD - W), cy = clamp(S.y - H / 2, 0, WORLD - H), x0 = Math.floor(cx / T), y0 = Math.floor(cy / T);
  ctx.save(); ctx.translate(-cx, -cy);
  for (let ty = y0; ty <= y0 + Math.ceil(H / T) && ty < N; ty++) for (let tx = x0; tx <= x0 + Math.ceil(W / T) && tx < N; tx++) { const rx = road(tx), ry = road(ty), x = tx * T, y = ty * T;
    ctx.fillStyle = rx || ry ? '#565b63' : (tx + ty) % 2 ? '#57a862' : '#4f9f5a'; ctx.fillRect(x, y, T, T);
    if (rx !== ry) { ctx.fillStyle = '#d8d8d8'; rx ? ctx.fillRect(x + T / 2 - 1, y + 8, 2, 24) : ctx.fillRect(x + 8, y + T / 2 - 1, 24, 2); }
    else if (!rx && tree(tx, ty)) emo(ctx, (tx + ty) % 4 ? '🌳' : '🌲', x + 20, y + 20, 26); }
  for (const p of PLACES) { if (p.x < cx - 40 || p.x > cx + W + 40 || p.y < cy - 40 || p.y > cy + H + 40) continue; emo(ctx, p.e, p.x, p.y - 4, 32); const mine = G.quest && G.quest.to.id === p.id; if (!p.addr || mine) { ctx.font = '600 10px sans-serif'; const w = ctx.measureText(p.n).width + 8; ctx.fillStyle = mine ? '#d6402f' : 'rgba(0,0,0,.62)'; ctx.fillRect(p.x - w / 2, p.y + 14, w, 14); text(ctx, p.n, p.x, p.y + 21, 10); } }
  for (const f of G.folk) { emo(ctx, f.e, f.x, f.y, 22); if (dist(f, S) < 62) { ctx.font = '600 10px sans-serif'; const w = ctx.measureText(f.say).width + 10; ctx.fillStyle = '#fff'; ctx.fillRect(f.x - w / 2, f.y - 32, w, 16); text(ctx, f.say, f.x, f.y - 24, 10, '#111'); } }
  for (const c of G.cars) emo(ctx, c.e, c.h ? c.p : c.line, c.h ? c.line : c.p, 26);
  const ride = RIDES[S.ride]; if (!(G.safe > 0 && Math.floor(G.safe * 10) % 2)) { if (ride.e) emo(ctx, ride.e, S.x, S.y + 6, 26); emo(ctx, '🧍', S.x, S.y - (ride.e ? 8 : 0), 24); if (HATS[S.hat]) emo(ctx, HATS[S.hat], S.x, S.y - (ride.e ? 22 : 14), 13); }
  ctx.restore();
  if (G.quest) { const a = Math.atan2(G.quest.to.y - S.y, G.quest.to.x - S.x), px = S.x - cx, py = S.y - cy; ctx.save(); ctx.translate(px + Math.cos(a) * 34, py + Math.sin(a) * 34); ctx.rotate(a); ctx.fillStyle = '#d6402f'; ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-6, -8); ctx.lineTo(-6, 8); ctx.closePath(); ctx.fill(); ctx.restore(); }
  // мини-карта
  const M = 66, mx = W - M - 6, my = 6, k = M / WORLD; ctx.fillStyle = 'rgba(20,40,24,.78)'; ctx.fillRect(mx, my, M, M); ctx.fillStyle = '#8a8f96'; for (const i of [2, 8, 14, 20, 26]) { ctx.fillRect(mx + i * T * k, my, T * k, M); ctx.fillRect(mx, my + i * T * k, M, T * k); }
  for (const p of POI) { ctx.fillStyle = '#ffd24a'; ctx.fillRect(mx + p.x * k - 1.5, my + p.y * k - 1.5, 3, 3); } if (G.quest) { ctx.fillStyle = '#ff5a45'; ctx.fillRect(mx + G.quest.to.x * k - 2.5, my + G.quest.to.y * k - 2.5, 5, 5); } ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(mx + S.x * k, my + S.y * k, 2.6, 0, 7); ctx.fill();
  if (G.msgT > 0) { ctx.font = '600 12px sans-serif'; const w = Math.min(W - 16, ctx.measureText(G.msg).width + 18); ctx.fillStyle = 'rgba(0,0,0,.78)'; ctx.fillRect((W - w) / 2, H - 40, w, 26); text(ctx, G.msg, W / 2, H - 27, 12); }
  drawStick(ctx, mv);
}
$('#act').onclick = doAct; addEventListener('keydown', e => { if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') { e.preventDefault(); doAct(); } });
$('#go').onclick = () => { if (!G) reset(false); $('#ov').hidden = true; }; $('#wipe').onclick = () => { reset(true); save(); $('#ov').hidden = true; toast('Новая жизнь: 300 ₽ и ни одной гайки'); };
$('#share').onclick = () => share(`🏘️ Нудищево РП: ${lvl()}-й уровень, ${S.money} ₽, транспорт: ${RIDES[S.ride].n.toLowerCase()}. Работ сделано: ${S.jobs}.`);
if (store.get('rp.save', null)) $('#wipe').hidden = false;
reset(false); ready(); loop(step);
