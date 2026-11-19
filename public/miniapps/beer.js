// «Пивная битва»: кто больше выпьет и не уснёт. Каждая кружка поднимает градус, а с ним и шанс на бесславный финал.
import { ready, share, $, store, earn, host, result, match, net, onGo, live } from '/miniapps/kit.js';
import { MI, FACES, FACE_VOMIT, FACE_HIC } from '/miniapps/mini-icons.js';
const BOTS = [{ n: 'Дядя Толя', nerve: .22, say: 'Я своё отпил ещё в девяностых.' }, { n: 'Сосед Валера', nerve: .4, say: 'Наливай, чё ты как неродной.' }, { n: 'Баба Зина', nerve: .55, say: 'Милок, я на свадьбах троих таких перепивала.' }, { n: 'Студент Гоша', nerve: .7, say: 'У меня завтра пара в восемь, так что по-быстрому.' }];
const FINE = ['Тебе ничего не было.', 'Пошло как по маслу.', 'Только румянец на щеках.', 'Даже не поморщился.', 'Организм сказал «спасибо» и попросил ещё.'];
const risk = d => Math.min(.72, .02 + .012 * d * d);      // шанс уснуть после следующей кружки при градусе d
let me, bot, who, over, last;
const mk = n => ({ n, mugs: 0, deg: 0, done: false, out: false, hic: false, snacks: 0 });
function start() { if (PVP) return startPvp(); who = BOTS[Math.floor(Math.random() * BOTS.length)]; me = mk(host.name || 'Вы'); bot = mk(who.n); over = false; last = null; say(`<b>Против вас ${who.n}.</b><span>«${who.say}»</span>`); draw(); }
const say = h => { $('#log').innerHTML = h; };      // сюда попадают только строки из этого файла, имя игрока — нет
function gulp(p, el) {      // одна кружка: что случилось
  p.mugs++; const r = Math.random(), pr = risk(p.deg); p.deg++; el.querySelector('.face').classList.remove('gulp'); void el.offsetWidth; el.querySelector('.face').classList.add('gulp');
  if (r < pr) { p.out = true; return 'out'; }
  if (r < pr + .13) { p.hic = true; return 'hic'; }
  return 'fine';
}
function botTurn() {
  if (bot.done || bot.out) return '';
  if (bot.hic) { bot.hic = false; return `${bot.n} икает и пропускает круг.`; }
  const lead = bot.mugs - me.mugs;
  if ((me.done || me.out) && lead > 0) { bot.done = true; return `${bot.n} ставит кружку: «Мне хватит, я и так впереди».`; }
  if (risk(bot.deg) > who.nerve && lead >= 0 && !me.done) { if (bot.snacks < 2 && Math.random() < .5) { bot.snacks++; bot.deg = Math.max(0, bot.deg - 1.3); return `${bot.n} закусывает огурцом.`; } bot.done = true; return `${bot.n} говорит «хватит» на ${bot.mugs}-й кружке.`; }
  const r = gulp(bot, $('#bot')); return r === 'out' ? `${bot.n} уснул и облевал всё.` : r === 'hic' ? `${bot.n} выпил и начал икать.` : `${bot.n} выпил ${bot.mugs}-ю. Ему ничего не было.`;
}
function turn(act) {
  if (PVP) return pvpAct(act);
  if (over) return; let mine = '';
  if (me.hic) { me.hic = false; mine = 'Икота: этот круг вы пропускаете.'; }
  else if (act === 'drink') { const r = gulp(me, $('#me')); mine = r === 'out' ? 'Ты уснул и облевал всё.' : r === 'hic' ? 'Кружка зашла, но напала икота: следующий круг пропускаешь.' : FINE[Math.floor(Math.random() * FINE.length)]; }
  else if (act === 'snack') { me.snacks++; me.deg = Math.max(0, me.deg - 1.3); mine = 'Огурчик. Градус немного отпустил.'; }
  else { me.done = true; mine = `Вы сказали «хватит» на ${me.mugs}-й кружке.`; }
  let his = botTurn();
  while (!me.out && me.done && !bot.done && !bot.out) his = botTurn();      // вы остановились — соперник допивает сам
  say(`<b>${mine}</b><span>${his}</span>`); finish(); draw();
}
function finish() {
  const r = me.out && bot.out ? 0 : me.out ? -1 : bot.out ? 1 : me.done && bot.done ? Math.sign(me.mugs - bot.mugs) : null; if (r == null) return;
  over = true; last = r; const best = Math.max(store.get('beer.best', 0), r > 0 && !PVP ? me.mugs : 0); store.set('beer.best', best); if (r > 0 && !PVP) earn('win'); result(me.out ? 0 : me.mugs);      // для дуэли: сколько кружек выпито на своих ногах; уснул — ноль
  $('#log').innerHTML += `<b>${r > 0 ? (bot.out ? 'Победа! Соперник под столом, а вы на ногах.' : `Победа! ${me.mugs} против ${bot.mugs}.`) : r < 0 ? (me.out ? 'Поражение. Проснётесь — будет стыдно.' : `Поражение: ${me.mugs} против ${bot.mugs}.`) : me.out ? 'Ничья: оба под столом.' : 'Ничья. Расходимся друзьями.'}</b>`;
}
function draw() {
  for (const [p, el] of [[me, $('#me')], [bot, $('#bot')]]) { el.querySelector('.nm').textContent = p.n; el.querySelector('.deg i').style.width = Math.min(100, p.deg * 12.5) + '%'; el.querySelector('.face').innerHTML = p.out ? FACE_VOMIT : FACES[Math.min(FACES.length - 1, Math.floor(p.deg / 1.6))](); el.classList.toggle('out', p.out); el.classList.toggle('done', p.done && !p.out); }
  const wait = PVP && (!started || !!myMv);      /* вдвоём: до старта и пока соперник думает кнопки молчат */
  $('#drink').disabled = $('#stop').disabled = over || me.done || wait; $('#snack').disabled = over || me.done || wait || me.snacks >= 3; $('#snack').innerHTML = `${MI.pickle} Закусить (${3 - me.snacks})`; $('#drink').innerHTML = me.hic && !over ? `${FACE_HIC} Икать` : `${MI.mug} Пить`;
  document.querySelectorAll('.mugs').forEach(el => el.innerHTML = MI.mug + ' × <b>' + (el.closest('#me') ? me.mugs : bot.mugs) + '</b>');
  $('#risk').textContent = over ? `Ваш рекорд: кружек в победной партии — ${store.get("beer.best", 0)}` : `Шанс уснуть после следующей кружки: ${Math.round(risk(me.deg) * 100)}%`;
  window.__g = { me, bot, over, last };
}
// ───── вдвоём, из лобби: вместо бота — живой соперник. Оба выбирают ход втёмную; когда выбрали оба, ходы открываются разом.
// Свою удачу каждый бросает сам и сообщает сопернику итог: проверить его нельзя, на кону только честь.
const PVP = match.on && match.pvp; let started = false, rnd = 1, myMv = null, foeMv = null;
function startPvp() { who = { n: match.foe || 'Соперник' }; me = mk(host.name || 'Вы'); bot = mk(who.n); over = false; last = null; rnd = 1; myMv = foeMv = null; if (!started) say(`<b>Против вас ${esc(who.n)}.</b><span>Ждём общего старта…</span>`); draw(); }
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function pvpAct(act) {
  if (over || !started || myMv || me.done || me.out) return;
  let res = '';
  if (me.hic) act = 'hic';
  else if (act === 'drink') { const r = Math.random(), pr = risk(me.deg); res = r < pr ? 'out' : r < pr + .13 ? 'hic' : 'fine'; }
  myMv = { t: 'mv', r: rnd, act, res }; net.send(myMv);
  say(`<b>Ход сделан.</b><span>Ждём, что выберет ${esc(bot.n)}…</span>`); draw(); resolve();
}
function applyMv(p, el, mv, mine) {      // что случилось с игроком за этот круг — и строка для журнала
  const n = mine ? 'Вы' : esc(p.n);
  if (mv.act === 'pass') return '';
  if (mv.act === 'hic') { p.hic = false; return mine ? 'Икота: этот круг вы пропустили.' : `${n} икает и пропускает круг.`; }
  if (mv.act === 'snack') { p.snacks++; p.deg = Math.max(0, p.deg - 1.3); return mine ? 'Огурчик. Градус немного отпустил.' : `${n} закусывает огурцом.`; }
  if (mv.act === 'stop') { p.done = true; return mine ? (p.mugs ? `Вы сказали «хватит» на ${p.mugs}-й кружке.` : 'Вы сказали «хватит», не выпив ни одной.') : (p.mugs ? `${n} говорит «хватит» на ${p.mugs}-й кружке.` : `${n} говорит «хватит», не выпив ни одной.`); }
  p.mugs++; p.deg++; const f = el.querySelector('.face'); f.classList.remove('gulp'); void el.offsetWidth; f.classList.add('gulp');
  /* про живого человека пишем без «он/она»: имя и что случилось */
  if (mv.res === 'out') { p.out = true; return mine ? 'Эта кружка была лишней: вы спите лицом в стол.' : `${n}: кружка оказалась лишней — сон лицом в стол.`; }
  if (mv.res === 'hic') { p.hic = true; return mine ? 'Кружка зашла, но напала икота: следующий круг пропускаете.' : `${n}: кружка зашла, но напала икота.`; }
  return mine ? `${p.mugs}-я кружка зашла без последствий.` : `${n}: ${p.mugs}-я кружка — без последствий.`;
}
function resolve() {
  if (!myMv || !foeMv || myMv.r !== rnd || foeMv.r !== rnd) return;
  const a = applyMv(me, $('#me'), myMv, true), b = applyMv(bot, $('#bot'), foeMv, false);
  myMv = foeMv = null; rnd++;
  say(`<b>${a || 'Вы уже не пьёте.'}</b><span>${b || esc(bot.n) + ' уже не пьёт.'}</span>`); finish(); draw();
  if (!over && (me.done || me.out)) { myMv = { t: 'mv', r: rnd, act: 'pass', res: '' }; net.send(myMv); draw(); resolve(); }      /* я закончил — соперник допивает сам, мои круги пропускаются */
}
net.on(d => { if (!PVP || !d || d.t !== 'mv' || over) return; const act = ['drink', 'snack', 'stop', 'hic', 'pass'].includes(d.act) ? d.act : 'pass', res = ['out', 'hic', 'fine'].includes(d.res) ? d.res : 'fine'; if (Number(d.r) === rnd && !foeMv) { foeMv = { r: rnd, act, res }; resolve(); } });
onGo(() => { if (!PVP) return; started = true; say('<b>Поехали!</b><span>Выбирайте ход. Соперник увидит его, только когда сделает свой.</span>'); draw(); });
live(() => (me && !me.out ? me.mugs : 0));
$('#drink').onclick = () => turn('drink'); $('#snack').onclick = () => turn('snack'); $('#stop').onclick = () => turn('stop'); $('#new').onclick = start;
$('#share').onclick = () => share(!over ? `🍺 Пивная битва: сижу против «${bot.n}», счёт ${me.mugs}:${bot.mugs}.` : last > 0 ? `🍺 Пивная битва: перепил «${bot.n}», ${me.mugs}:${bot.mugs}${bot.out ? ' — соперник уснул под столом' : ''}.` : last < 0 ? `🍺 Пивная битва: «${bot.n}» меня уделал, ${me.mugs}:${bot.mugs}.${me.out ? ' Я уснул и облевал всё.' : ''}` : `🍺 Пивная битва: ничья с «${bot.n}», ${me.mugs}:${bot.mugs}.`);
ready(start); start();
