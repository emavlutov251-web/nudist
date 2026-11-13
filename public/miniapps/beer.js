// «Пивная битва»: кто больше выпьет и не уснёт. Каждая кружка поднимает градус, а с ним и шанс на бесславный финал.
import { ready, share, $, store, earn, host } from '/miniapps/kit.js';
const BOTS = [{ n: 'Дядя Толя', nerve: .22, say: 'Я своё отпил ещё в девяностых.' }, { n: 'Сосед Валера', nerve: .4, say: 'Наливай, чё ты как неродной.' }, { n: 'Баба Зина', nerve: .55, say: 'Милок, я на свадьбах троих таких перепивала.' }, { n: 'Студент Гоша', nerve: .7, say: 'У меня завтра пара в восемь, так что по-быстрому.' }];
const FINE = ['Тебе ничего не было.', 'Пошло как по маслу.', 'Только румянец на щеках.', 'Даже не поморщился.', 'Организм сказал «спасибо» и попросил ещё.'];
const FACES = ['🙂', '😊', '😄', '🥴', '😵‍💫', '🫠'];
const risk = d => Math.min(.72, .02 + .012 * d * d);      // шанс уснуть после следующей кружки при градусе d
let me, bot, who, over, last;
const mk = n => ({ n, mugs: 0, deg: 0, done: false, out: false, hic: false, snacks: 0 });
function start() { who = BOTS[Math.floor(Math.random() * BOTS.length)]; me = mk(host.name || 'Вы'); bot = mk(who.n); over = false; last = null; say(`<b>Против вас ${who.n}.</b><span>«${who.say}»</span>`); draw(); }
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
  over = true; last = r; const best = Math.max(store.get('beer.best', 0), r > 0 ? me.mugs : 0); store.set('beer.best', best); if (r > 0) earn('win');
  $('#log').innerHTML += `<b>${r > 0 ? (bot.out ? 'Победа! Соперник под столом, а вы на ногах.' : `Победа! ${me.mugs} против ${bot.mugs}.`) : r < 0 ? (me.out ? 'Поражение. Проснётесь — будет стыдно.' : `Поражение: ${me.mugs} против ${bot.mugs}.`) : me.out ? 'Ничья: оба под столом.' : 'Ничья. Расходимся друзьями.'}</b>`;
}
function draw() {
  for (const [p, el] of [[me, $('#me')], [bot, $('#bot')]]) { el.querySelector('.nm').textContent = p.n; el.querySelector('.mugs b').textContent = p.mugs; el.querySelector('.deg i').style.width = Math.min(100, p.deg * 12.5) + '%'; el.querySelector('.face').textContent = p.out ? '🤮' : FACES[Math.min(FACES.length - 1, Math.floor(p.deg / 1.6))]; el.classList.toggle('out', p.out); el.classList.toggle('done', p.done && !p.out); }
  $('#drink').disabled = $('#stop').disabled = over || me.done; $('#snack').disabled = over || me.done || me.snacks >= 3; $('#snack').textContent = `🥒 Закусить (${3 - me.snacks})`; $('#drink').textContent = me.hic && !over ? '🫢 Икать' : '🍺 Пить';
  $('#risk').textContent = over ? `Ваш рекорд: кружек в победной партии — ${store.get("beer.best", 0)}` : `Шанс уснуть после следующей кружки: ${Math.round(risk(me.deg) * 100)}%`;
  window.__g = { me, bot, over, last };
}
$('#drink').onclick = () => turn('drink'); $('#snack').onclick = () => turn('snack'); $('#stop').onclick = () => turn('stop'); $('#new').onclick = start;
$('#share').onclick = () => share(!over ? `🍺 Пивная битва: сижу против «${bot.n}», счёт ${me.mugs}:${bot.mugs}.` : last > 0 ? `🍺 Пивная битва: перепил «${bot.n}», ${me.mugs}:${bot.mugs}${bot.out ? ' — соперник уснул под столом' : ''}.` : last < 0 ? `🍺 Пивная битва: «${bot.n}» меня уделал, ${me.mugs}:${bot.mugs}.${me.out ? ' Я уснул и облевал всё.' : ''}` : `🍺 Пивная битва: ничья с «${bot.n}», ${me.mugs}:${bot.mugs}.`);
ready(start); start();
