// «Нудищево РП»: маленькая жизнь в провинциальном городе. Работа, еда, сон, транспорт, а на юге — пляж: шезлонги, ракушки, волейбол и дежурство спасателя.
// Одиночная игра, прогресс хранится на устройстве.
import { ready, share, $, store, earn, toast } from '/miniapps/kit.js';
import { stage, loop, emo, text, rnd, pick, clamp, dist, sticks, drawStick, axis, keys } from '/miniapps/game.js';
const W = 360, H = 460, T = 40, N = 30, WORLD = T * N, NY = 36, WH = T * NY, BY = 30 * T, SY = 33 * T,      // город 30×30 клеток; ниже три ряда песка (с BY) и три ряда моря (с SY)
   cv = $('#cv'), { ctx, pos } = stage(cv, W, H), [mv] = sticks(cv, pos, [() => true]);
const road = i => i % 6 === 2, at = (tx, ty) => ({ x: tx * T + T / 2, y: ty * T + T / 2 });
const POI = [
  { id: 'home', e: '🏠', n: 'Дом', ...at(10, 9) }, { id: 'food', e: '🥙', n: 'Шаурма', ...at(13, 9) }, { id: 'post', e: '📦', n: 'Почта', ...at(10, 13) }, { id: 'shop', e: '👕', n: 'Секонд-хенд', ...at(13, 13) },
  { id: 'plant', e: '🏭', n: 'Завод', ...at(16, 7) }, { id: 'cars', e: '🚗', n: 'Автосалон', ...at(17, 9) }, { id: 'hosp', e: '🏥', n: 'Больница', ...at(7, 10) },
  { id: 'tan', e: '🏖️', n: 'Шезлонг', ...at(7, 31) }, { id: 'ice', e: '🍦', n: 'Мороженое', ...at(11, 30) }, { id: 'guard', e: '🛟', n: 'Спасатели', ...at(16, 31) }, { id: 'volley', e: '🏐', n: 'Волейбол', ...at(22, 31) },
];
const ADDR = [['ул. Ленина, 1', 4, 3], ['пер. Голый, 7', 22, 3], ['ул. Банная, 12', 25, 9], ['пр. Листопадный, 3', 4, 15], ['ул. Пляжная, 40', 22, 15], ['Гаражи', 16, 21], ['Общага №2', 10, 21], ['Дача тёщи', 4, 25], ['ул. Комариная, 5', 25, 21], ['Рынок', 21, 13], ['ул. Веничная, 9', 3, 7], ['Конечная', 27, 27]].map(([n, x, y], i) => ({ id: 'a' + i, addr: true, e: pick(['🏢', '🏚️', '🏡', '🏬']), n, ...at(x, y) }));
const PLACES = [...POI, ...ADDR], RIDES = [{ n: 'Пешком', e: '', sp: 85, cost: 0 }, { n: 'Самокат', e: '🛴', sp: 135, cost: 1500 }, { n: '«Жигули»', e: '🚗', sp: 190, cost: 7000 }, { n: '«Бэха»', e: '🏎️', sp: 250, cost: 30000 }], HATS = ['', '🧢', '🎩', '🪖', '👑'];
const SAY = ['Слышь, семки есть?', 'Молодой человек, вы за кем занимали?', 'Когда уже дорогу починят…', 'А раньше шаурма была по сорок.', 'Э, братишка, дай позвонить.', 'Маршрутку не видел? Полчаса жду.', 'Чё без шапки? Простудишься.', 'В наше время по газонам не ходили!'];
const BSAY = ['Молодой человек, вы мне солнце загораживаете.', 'Кукуруза! Горячая кукуруза!', 'Вода — парное молоко. Градусов двенадцать.', 'Чурчхела, пахлава, раки!', 'Тут все свои: шапки в гардероб.', 'Кто последний на банан?', 'Мужчина, уберите машину с полотенца.'];
const palm = (x, y) => y >= 30 && y < 33 && (x * 5 + y * 11) % 7 === 0 && !PLACES.some(p => Math.abs(p.x - (x * T + 20)) < T && Math.abs(p.y - (y * T + 20)) < T);
const tree = (x, y) => y < 30 && !road(x) && !road(y) && (x * 7 + y * 13 + x * y) % 9 === 0 && !PLACES.some(p => Math.abs(p.x - (x * T + 20)) < T && Math.abs(p.y - (y * T + 20)) < T);
let G = null, S = null, saveT = 0;
const fresh = () => ({ money: 300, food: 80, en: 90, xp: 0, ride: 0, hat: 0, hats: [0], jobs: 0, x: at(11, 10).x, y: at(11, 10).y });
function reset(wipe) {
  S = wipe ? fresh() : { ...fresh(), ...store.get('rp.save', {}) }; if (!Array.isArray(S.hats)) S.hats = [0];
  G = { cars: [], folk: [], shells: [], quest: null, rescue: null, work: 0, vol: 0, tanCd: 0, shellT: 0, seen: false, safe: 2, msg: '', msgT: 0, tick: 0 };
  for (let i = 0; i < 9; i++) { const h = Math.random() < .5; G.cars.push({ h, line: pick([2, 8, 14, 20, 26]) * T + T / 2 + (Math.random() < .5 ? -8 : 8), p: rnd(0, WORLD), sp: rnd(90, 150) * (Math.random() < .5 ? 1 : -1), e: pick(['🚌', '🚕', '🚙', '🚚']) }); }
  for (let i = 0; i < 7; i++) G.folk.push({ x: rnd(8, 20) * T, y: rnd(6, 16) * T, tx: 0, ty: 0, t: 0, e: pick(['👵', '🧔', '👷', '🧑‍🦳', '👩‍🦰', '🧑‍🎓']), say: pick(SAY) });
  for (let i = 0; i < 5; i++) G.folk.push({ beach: true, x: rnd(2, 28) * T, y: BY + rnd(20, 100), tx: 0, ty: 0, t: 0, e: pick(['🧖', '🤽', '🧘', '👙', '🩳', '🧑‍🍳']), say: pick(BSAY) });
  for (let i = 0; i < 4; i++) shell();
  window.__g = G; window.__s = S; hud();
}
// Ракушки на песке: подобрал — сдал в сувенирную лавку. Иногда вместо ракушки попадается краб.
function shell() { if (G.shells.length < 6) G.shells.push({ x: rnd(30, WORLD - 30), y: BY + rnd(16, 108), e: Math.random() < .18 ? '🦀' : pick(['🐚', '🐚', '🪸', '⭐']) }); }
const onBeach = () => S.y > BY, swim = () => S.y > SY + 4;
const lvl = () => 1 + Math.floor(S.xp / 100), pay = n => Math.round(n * (1 + (lvl() - 1) * .1)), tired = () => S.food <= 0 || S.en <= 0;
const tell = (t, s = 2.4) => { G.msg = t; G.msgT = s; };
function hud() { $('#money').textContent = S.money; $('#food').textContent = Math.round(S.food); $('#en').textContent = Math.round(S.en); $('#lvl').textContent = lvl(); }
function save() { store.set('rp.save', S); }
const near = () => { let b = null, bd = 46; for (const p of PLACES) { const d = dist(S, p); if (d < bd) { bd = d; b = p; } } return b; };
// Что предлагает кнопка действия рядом со зданием: [надпись, что сделать]
function action() {
  if (G.work > 0) return [`🔩 Крутить гайку (осталось ${G.work})`, () => { G.work--; if (!G.work) { const m = pay(350); S.money += m; S.xp += 12; S.en = Math.max(0, S.en - 25); S.food = Math.max(0, S.food - 10); S.jobs++; earn('job'); tell(`Смена закрыта: +${m} ₽`); save(); } }];
  if (G.vol > 0) return [`🏐 Отбить мяч (осталось ${G.vol})`, () => { G.vol--; if (!G.vol) { S.xp += 20; S.en = Math.max(0, S.en - 12); S.games = (S.games || 0) + 1; tell(pick(['Партия! +20 опыта. Пляж вас уважает.', 'Победный удар прямо в чей-то арбуз. +20 опыта.'])); save(); } }];
  const p = near(); if (!p) return null;
  if (G.quest && p.id === G.quest.to.id) return [`📦 Отдать посылку: ${p.n}`, () => { const m = pay(G.quest.pay); S.money += m; S.xp += 15; S.en = Math.max(0, S.en - 10); S.jobs++; G.quest = null; earn('job'); tell(`Посылка доставлена: +${m} ₽`); save(); }];
  switch (p.id) {
    case 'home': return ['😴 Поспать', () => { S.en = 100; S.food = Math.max(0, S.food - 15); tell('Выспались. Энергия на максимуме.'); save(); }];
    case 'food': return ['🥙 Шаурма — 150 ₽', () => { if (S.money < 150) return tell('На шаурму не хватает. Идите работать.'); S.money -= 150; S.food = Math.min(100, S.food + 60); tell(pick(['Шаурма огонь. Сытость +60.', 'В лаваше что-то мяукнуло, но вкусно.'])); save(); }];
    case 'post': return G.quest ? [`📦 Посылка уже у вас: ${G.quest.to.n}`, () => tell('Сначала отнесите эту: ' + G.quest.to.n)] : ['📦 Взять посылку', () => { if (tired()) return tell('Сил нет. Поешьте и поспите.'); const to = pick(ADDR); G.quest = { to, pay: 220 + Math.round(dist(p, to) / 4) }; tell(`Несите на адрес: ${to.n}. Стрелка покажет дорогу.`, 3.5); }];
    case 'plant': return ['🏭 Смена на заводе', () => { if (tired()) return tell('Сил нет. Поешьте и поспите.'); if (S.en < 25) return tell('На смену нужно 25 энергии. Поспите дома.'); G.work = 12; tell('Закрутите 12 гаек: жмите кнопку.'); }];
    case 'cars': { const n = RIDES[S.ride + 1]; return n ? [`${n.e} ${n.n} — ${n.cost} ₽`, () => { if (S.money < n.cost) return tell(`Не хватает ${n.cost - S.money} ₽. Копите.`); S.money -= n.cost; S.ride++; tell(`Теперь у вас ${n.n}. Скорость выросла.`); save(); }] : ['🏎️ Лучше «бэхи» тут нет', () => tell('Вы и так король района.')]; }
    case 'shop': { const i = HATS.findIndex((h, k) => k > 0 && !S.hats.includes(k)); return i > 0 ? [`${HATS[i]} Обновка — 500 ₽`, () => { if (S.money < 500) return tell('На обновку не хватает.'); S.money -= 500; S.hats.push(i); S.hat = i; tell('Модный приговор: одобрено.'); save(); }] : ['👕 Сменить шапку', () => { S.hat = S.hats[(S.hats.indexOf(S.hat) + 1) % S.hats.length]; save(); }]; }
    case 'tan': return ['🏖️ Позагорать', () => { if (G.tanCd > 0) return tell(`Вы и так как рак. Остыньте ещё ${Math.ceil(G.tanCd)} с.`); G.tanCd = 45; S.en = Math.min(100, S.en + 35); S.food = Math.max(0, S.food - 8); S.tan = (S.tan || 0) + 1; tell(pick(['Загорели со всех сторон. Энергия +35.', 'Солнце, песок и ни одной гайки. Энергия +35.'])); save(); }];
    case 'ice': return ['🍦 Мороженое — 80 ₽', () => { if (S.money < 80) return tell('На мороженое не хватает. Соберите ракушки.'); S.money -= 80; S.food = Math.min(100, S.food + 25); tell(pick(['Пломбир как в детстве. Сытость +25.', 'Капнуло на живот. Сытость +25.'])); save(); }];
    case 'guard': return G.rescue ? ['🆘 Плывите к тонущему!', () => tell('Стрелка показывает, куда плыть.')] : ['🛟 Дежурство спасателя', () => { if (tired()) return tell('Сил нет. Мороженое и шезлонг — рядом.'); if (S.en < 20) return tell('На дежурство нужно 20 энергии. Позагорайте.'); G.rescue = { x: clamp(S.x + rnd(-260, 260), 40, WORLD - 40), y: SY + rnd(46, 100), t: 30 }; tell('Кто-то тонет! Плывите к 🆘 — стрелка покажет.', 3.5); }];
    case 'volley': return ['🏐 Сыграть в волейбол', () => { if (tired()) return tell('Сил нет даже на подачу.'); G.vol = 8; tell('Отбейте 8 мячей: жмите кнопку.'); }];
    case 'hosp': return ['🏥 Подлечиться — 100 ₽', () => { if (S.money < 100) return tell('Бесплатно только зелёнка.'); S.money -= 100; S.en = Math.min(100, S.en + 40); tell('Капельница бодрит. Энергия +40.'); save(); }];
    default: return [`🚪 ${p.n}: постучать`, () => tell(pick(['Никого нет дома.', '«Мы ничего не заказывали!»', 'За дверью лает собака.']))];
  }
}
let actFn = null;
function step(dt) {
  if (G && $('#ov').hidden) {
    const k = axis(); let dx = mv.x + k.x, dy = mv.y + k.y; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
    if (G.work > 0 && l > .3) { G.work = 0; tell('Ушли со смены. Гайки обиделись.'); }
    if (G.vol > 0 && l > .3) { G.vol = 0; tell('Ушли с площадки. Мяч улетел в море.'); }
    // на пляж — босиком: машина остаётся у бордюра, в море плывём медленно
    const sp = (swim() ? 60 : onBeach() ? 95 : RIDES[S.ride].sp) * (tired() ? .5 : 1); S.x = clamp(S.x + dx * sp * dt, 12, WORLD - 12); S.y = clamp(S.y + dy * sp * dt, 12, WH - 12);
    if (onBeach() && !G.seen) { G.seen = true; tell('Пляж Нудищево. Шапки и машины — в гардероб.', 3.2); }
    if (swim()) S.en = Math.max(0, S.en - dt / 3);      // плавать утомительно
    G.tanCd -= dt; G.shellT += dt; if (G.shellT > 7) { G.shellT = 0; shell(); }
    for (const sh of G.shells) if (Math.hypot(sh.x - S.x, sh.y - S.y) < 18) { G.shells.splice(G.shells.indexOf(sh), 1); if (sh.e === '🦀') { S.en = Math.max(0, S.en - 5); tell('Краб ущипнул за пятку: −5 энергии.'); } else { const m = Math.round(rnd(15, 45)); S.money += m; S.shells = (S.shells || 0) + 1; tell(`Ракушка: +${m} ₽ в сувенирной лавке.`); } hud(); save(); break; }
    if (G.rescue) { G.rescue.t -= dt;
      if (Math.hypot(G.rescue.x - S.x, G.rescue.y - S.y) < 24) { const m = pay(300); S.money += m; S.xp += 18; S.en = Math.max(0, S.en - 15); S.jobs++; S.saved = (S.saved || 0) + 1; G.rescue = null; earn('job'); tell(`Спасли! +${m} ₽ и уважение всего пляжа.`, 3); hud(); save(); }
      else if (G.rescue.t <= 0) { G.rescue = null; tell('Не успели: его вытащил дядя на «банане». Без премии.', 3); } }
    G.tick += dt; if (G.tick >= 1) { G.tick = 0; S.food = Math.max(0, S.food - 1 / 7); S.en = Math.max(0, S.en - 1 / 9); if (tired() && G.msgT <= 0) tell(S.food <= 0 ? 'Вы голодны: еле идёте. Нужна шаурма.' : 'Сил нет: еле идёте. Домой, спать.'); hud(); }
    G.safe -= dt; G.msgT -= dt;
    for (const c of G.cars) { c.p += c.sp * dt; if (c.p > WORLD + (c.h ? 40 : -14)) c.p = -40; if (c.p < -40) c.p = WORLD + (c.h ? 40 : -14); /* дороги кончаются у пляжа: на песок машины не выезжают */ const cx = c.h ? c.p : c.line, cy = c.h ? c.line : c.p;
      if (G.safe <= 0 && Math.hypot(cx - S.x, cy - S.y) < 19) { const fee = Math.min(S.money, 300), h = PLACES.find(p => p.id === 'hosp'); S.money -= fee; S.x = h.x + 30; S.y = h.y + 34; S.en = Math.max(20, S.en - 20); G.safe = 3; G.work = 0; tell(`Вас сбила маршрутка. Больница: −${fee} ₽.`, 3.5); save(); } }
    for (const f of G.folk) { f.t -= dt; if (f.t <= 0) { f.t = rnd(2, 5); const a = rnd(0, 6.28); f.tx = Math.cos(a) * 22; f.ty = Math.sin(a) * 22; if (Math.random() < .3) f.tx = f.ty = 0; } f.x = clamp(f.x + f.tx * dt, 20, WORLD - 20); f.y = f.beach ? clamp(f.y + f.ty * dt, BY + 14, SY - 10) : clamp(f.y + f.ty * dt, 20, WORLD - 20); }
    saveT += dt; if (saveT > 5) { saveT = 0; save(); }
    const a = action(), b = $('#act'); actFn = a ? a[1] : null; b.disabled = !a; const label = a ? a[0] : 'Подойдите к зданию'; if (b.textContent !== label) b.textContent = label;
    const q = G.rescue ? `🆘 Тонущий в ${Math.round(Math.hypot(G.rescue.x - S.x, G.rescue.y - S.y) / 10)} м · осталось ${Math.ceil(G.rescue.t)} с` : G.vol > 0 ? '🏐 Идёт партия: не уходите с площадки' : G.quest ? `📦 Посылка → ${G.quest.to.n} · ${Math.round(dist(S, G.quest.to) / 10)} м · ${pay(G.quest.pay)} ₽` : G.work > 0 ? '🏭 Идёт смена: не отходите от станка' : S.jobs ? `Работ сделано: ${S.jobs}. ${RIDES[S.ride + 1] ? 'До «' + RIDES[S.ride + 1].n.replace(/[«»]/g, '') + '»: ' + Math.max(0, RIDES[S.ride + 1].cost - S.money) + ' ₽' : 'Вы король района.'}` : 'Найдите работу: 📦 почта или 🏭 завод. Пляж — на юге 🏖️'; if ($('#quest').textContent !== q) $('#quest').textContent = q;
  }
  draw();
}
function doAct() { if (!actFn || !$('#ov').hidden) return; actFn(); hud(); }
function draw() {
  if (!G) { ctx.fillStyle = '#4c9a57'; ctx.fillRect(0, 0, W, H); return; }
  const cx = clamp(S.x - W / 2, 0, WORLD - W), cy = clamp(S.y - H / 2, 0, WH - H), x0 = Math.floor(cx / T), y0 = Math.floor(cy / T);
  ctx.save(); ctx.translate(-cx, -cy);
  const now = performance.now() / 1000;
  for (let ty = y0; ty <= y0 + Math.ceil(H / T) && ty < NY; ty++) for (let tx = x0; tx <= x0 + Math.ceil(W / T) && tx < N; tx++) { const x = tx * T, y = ty * T;
    if (ty >= 33) { ctx.fillStyle = ty === 33 ? '#49b3e6' : ty === 34 ? '#339fd8' : '#2488c4'; ctx.fillRect(x, y, T, T); ctx.fillStyle = 'rgba(255,255,255,.5)'; const o = Math.sin(now * 1.6 + tx * 1.3 + ty) * 5; ctx.fillRect(x + 6 + o, y + 12, 14, 2); ctx.fillRect(x + 20 - o, y + 28, 10, 2); if (ty === 33) { ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fillRect(x, y + Math.sin(now * 1.2 + tx) * 2, T, 3); } continue; }
    if (ty >= 30) { ctx.fillStyle = (tx + ty) % 2 ? '#ecd9a0' : '#e6d193'; ctx.fillRect(x, y, T, T); ctx.fillStyle = 'rgba(160,125,60,.35)'; ctx.fillRect(x + (tx * 13 + ty * 7) % 30 + 3, y + (tx * 5 + ty * 17) % 30 + 3, 2, 2); if (palm(tx, ty)) emo(ctx, (tx + ty) % 3 ? '🌴' : '⛱️', x + 20, y + 18, 26); continue; }
    const rx = road(tx), ry = road(ty);
    ctx.fillStyle = rx || ry ? '#565b63' : (tx + ty) % 2 ? '#57a862' : '#4f9f5a'; ctx.fillRect(x, y, T, T);
    if (rx !== ry) { ctx.fillStyle = '#d8d8d8'; rx ? ctx.fillRect(x + T / 2 - 1, y + 8, 2, 24) : ctx.fillRect(x + 8, y + T / 2 - 1, 24, 2); }
    else if (!rx && tree(tx, ty)) emo(ctx, (tx + ty) % 4 ? '🌳' : '🌲', x + 20, y + 20, 26); }
  for (const sh of G.shells) emo(ctx, sh.e, sh.x, sh.y, 15);
  if (G.rescue) { emo(ctx, '🆘', G.rescue.x, G.rescue.y + Math.sin(now * 5) * 3, 24); emo(ctx, '🙋', G.rescue.x, G.rescue.y + 14 + Math.sin(now * 5) * 3, 16); }
  for (const p of PLACES) { if (p.x < cx - 40 || p.x > cx + W + 40 || p.y < cy - 40 || p.y > cy + H + 40) continue; emo(ctx, p.e, p.x, p.y - 4, 32); const mine = G.quest && G.quest.to.id === p.id; if (!p.addr || mine) { ctx.font = '600 10px sans-serif'; const w = ctx.measureText(p.n).width + 8; ctx.fillStyle = mine ? '#d6402f' : 'rgba(0,0,0,.62)'; ctx.fillRect(p.x - w / 2, p.y + 14, w, 14); text(ctx, p.n, p.x, p.y + 21, 10); } }
  for (const f of G.folk) { emo(ctx, f.e, f.x, f.y, 22); if (dist(f, S) < 62) { ctx.font = '600 10px sans-serif'; const w = ctx.measureText(f.say).width + 10; ctx.fillStyle = '#fff'; ctx.fillRect(f.x - w / 2, f.y - 32, w, 16); text(ctx, f.say, f.x, f.y - 24, 10, '#111'); } }
  for (const c of G.cars) emo(ctx, c.e, c.h ? c.p : c.line, c.h ? c.line : c.p, 26);
  const ride = RIDES[S.ride]; if (!(G.safe > 0 && Math.floor(G.safe * 10) % 2)) { const bare = onBeach(), re = bare ? '' : ride.e; if (re) emo(ctx, re, S.x, S.y + 6, 26); emo(ctx, swim() ? '🏊' : '🧍', S.x, S.y - (re ? 8 : 0), 24); if (HATS[S.hat] && !bare) emo(ctx, HATS[S.hat], S.x, S.y - (re ? 22 : 14), 13); }
  ctx.restore();
  const tgt = G.rescue || (G.quest && G.quest.to);
  if (tgt) { const a = Math.atan2(tgt.y - S.y, tgt.x - S.x), px = S.x - cx, py = S.y - cy; ctx.save(); ctx.translate(px + Math.cos(a) * 34, py + Math.sin(a) * 34); ctx.rotate(a); ctx.fillStyle = '#d6402f'; ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-6, -8); ctx.lineTo(-6, 8); ctx.closePath(); ctx.fill(); ctx.restore(); }
  // мини-карта
  const M = 66, MH = M * NY / N, mx = W - M - 6, my = 6, k = M / WORLD; ctx.fillStyle = 'rgba(20,40,24,.78)'; ctx.fillRect(mx, my, M, M); ctx.fillStyle = '#e6d193'; ctx.fillRect(mx, my + BY * k, M, (SY - BY) * k); ctx.fillStyle = '#339fd8'; ctx.fillRect(mx, my + SY * k, M, MH - SY * k); ctx.fillStyle = '#8a8f96'; for (const i of [2, 8, 14, 20, 26]) { ctx.fillRect(mx + i * T * k, my, T * k, M); ctx.fillRect(mx, my + i * T * k, M, T * k); }
  for (const p of POI) { ctx.fillStyle = '#ffd24a'; ctx.fillRect(mx + p.x * k - 1.5, my + p.y * k - 1.5, 3, 3); } if (tgt) { ctx.fillStyle = '#ff5a45'; ctx.fillRect(mx + tgt.x * k - 2.5, my + tgt.y * k - 2.5, 5, 5); } ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(mx + S.x * k, my + S.y * k, 2.6, 0, 7); ctx.fill();
  if (G.msgT > 0) { ctx.font = '600 12px sans-serif'; const w = Math.min(W - 16, ctx.measureText(G.msg).width + 18); ctx.fillStyle = 'rgba(0,0,0,.78)'; ctx.fillRect((W - w) / 2, H - 40, w, 26); text(ctx, G.msg, W / 2, H - 27, 12); }
  drawStick(ctx, mv);
}
$('#act').onclick = doAct; addEventListener('keydown', e => { if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') { e.preventDefault(); doAct(); } });
$('#go').onclick = () => { if (!G) reset(false); $('#ov').hidden = true; }; $('#wipe').onclick = () => { reset(true); save(); $('#ov').hidden = true; toast('Новая жизнь: 300 ₽ и ни одной гайки'); };
$('#share').onclick = () => share(`🏘️ Нудищево РП: ${lvl()}-й уровень, ${S.money} ₽, транспорт: ${RIDES[S.ride].n.toLowerCase()}. Работ сделано: ${S.jobs}.` + (S.saved ? ` На пляже спасено: ${S.saved}.` : ''));
if (store.get('rp.save', null)) $('#wipe').hidden = false;
reset(false); ready(); loop(step);
