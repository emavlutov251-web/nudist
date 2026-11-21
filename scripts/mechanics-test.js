'use strict';
// Проверка механик без браузера: экономика, энергия, настроение, капсулы, подарки, чаевые, рекорды, дуэль, лобби, лента, истории,
// инкогнито, «побыть рядом», стирание без следа, счётчик сообщений, сброс пароля. Сама поднимает сервер на временной базе.
// Запуск: node scripts/mechanics-test.js   (код выхода 0 — всё работает)
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const WS = require('../server/vendor/ws');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let bad = 0, total = 0;
const ck = (name, ok, extra) => { total++; if (!ok) { bad++; console.log('  ✗ ПРОВАЛ:', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 300)); } else if (process.env.VERBOSE) console.log('  ✓', name); };

(async () => {
  const port = 3300 + Math.floor(Math.random() * 180), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nudist-mech-')), base = `http://127.0.0.1:${port}`;
  const env = { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dir, KEEP_AWAKE: 'off', ENERGY_MAX: '3' };
  for (const k of Object.keys(env)) if (/^(SUPABASE_|S3_|OWNERS|LEAF_ADMINS|TG_|YOOKASSA|NODE_ENV|SITE_URL|MOVED_TO)/.test(k)) delete env[k];
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'boot.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] }); let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  try {
    let up = false; for (let i = 0; i < 60 && !up; i++) { await sleep(250); try { up = (await fetch(base + '/api/health')).ok; } catch (e) { /* ждём */ } }
    if (!up) throw new Error('сервер не поднялся:\n' + log.slice(-1200));
    const post = async (p, b) => (await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })).json();
    const conn = tok => new Promise((res, rej) => { const ws = new WS(`ws://127.0.0.1:${port}/ws?token=${tok}`); let n = 0; const w = new Map(), c = { evs: [], tok }; ws.on('error', rej);
      ws.on('message', d => { const q = JSON.parse(String(d)); if (q.ev === 'init') { c.me = q.d.me; return res(c); } if (q.ev) return c.evs.push(q); const x = w.get(q.id); if (x) { w.delete(q.id); q.e !== undefined ? x.no(new Error(q.e)) : x.ok(q.r); } });
      c.rpc = (m, p) => new Promise((ok, no) => { const i = ++n; w.set(i, { ok, no }); ws.send(JSON.stringify({ id: i, m, p: p || {} })); setTimeout(() => { if (w.has(i)) { w.delete(i); no(new Error('нет ответа на ' + m)); } }, 6000); });
      c.fail = (m, p) => c.rpc(m, p).then(() => null, e => e.message); c.close = () => ws.close(); });
    const reg = async u => { const r = await post('/api/register', { username: u, password: 'Mech-test-' + u, name: u, agree: true, adult: true }); await sleep(200); return conn(r.token); };
    const own = await reg('mech_owner'), a = await reg('mech_anna'), b = await reg('mech_boris');
    const give = (who, n) => own.rpc('admin.user.set', { id: who.me.id, stars: n });
    const dm = (await a.rpc('dm.open', { user: b.me.id })).chat.id;

    // ── листики
    ck('у нового аккаунта стартовые листики', a.me.stars === 500, a.me.stars);
    const d1 = await a.rpc('stars.daily'); ck('ежедневный бонус начисляется один раз в день', d1.n > 0 && d1.stars === 500 + d1.n && !!(await a.fail('stars.daily')), d1);
    const info = await a.rpc('stars.info'); ck('сводка по листикам сходится с балансом', info.stars === d1.stars && info.daily === false, info);
    await give(a, 5000); await give(b, 5000); await sleep(200);
    // ── магазин
    const cat = await a.rpc('shop.catalog'); ck('каталог магазина отдаётся', JSON.stringify(cat).length > 500);
    const b1 = await a.rpc('shop.buy', { id: 'frame_leaf' }).then(r => r, e => ({ err: e.message })); ck('украшение покупается, листики списываются', !b1.err && (await a.rpc('stars.info')).stars < 5000, b1);
    ck('второй раз то же украшение не продаётся', !!(await a.fail('shop.buy', { id: 'frame_leaf' })));
    ck('на несуществующий товар — отказ', !!(await a.fail('shop.buy', { id: 'net_takogo' })));
    ck('бесплатная проба — только Plus, без Pro/Max', cat.trial.tier === 'plus' && cat.trial.days === 3 && cat.trial.can);
    const trial = await a.rpc('shop.trial'), afterTrial = await a.rpc('shop.catalog');
    ck('пробная подписка выдаёт Plus и доступна один раз', trial.tier === 'plus' && trial.days === 3 && afterTrial.tier === 'plus' && !afterTrial.trial.can && !!(await a.fail('shop.trial')));
    // ── энергия
    const e0 = await b.rpc('energy.get'); ck('энергия: запас из настроек', e0.max === 3 && e0.n === 3, e0);
    for (let i = 0; i < 3; i++) await b.rpc('energy.use', { app: 'beer' });
    const e3 = await b.rpc('energy.use', { app: 'beer' }); ck('энергия кончается и не уходит в минус', e3.ok === false && e3.n === 0, e3);
    const rf = await b.rpc('energy.refill'); ck('энергия восполняется за листики', rf.ok && rf.n === 3 && rf.stars === 5000 - rf.price, rf);
    ck('утилиты энергию не тратят', (await b.rpc('energy.use', { app: 'lot' })).n === 3);
    // ── настроение
    const day = new Date().toISOString().slice(0, 10); const m1 = await a.rpc('mood.set', { day, v: 'storm' }); ck('настроение дня записывается', m1.days[day] === 'storm', m1);
    ck('дневник настроения читается только своим', Object.keys((await b.rpc('mood.get')).days).length === 0 && (await a.rpc('mood.get')).days[day] === 'storm');
    ck('дневник настроения очищается', Object.keys((await a.rpc('mood.clear')).days).length === 0 && Object.keys((await a.rpc('mood.get')).days).length === 0);
    // ── капсула времени
    await a.rpc('capsule.new', { to: b.me.id, text: 'секрет из прошлого', at: Date.now() + 2 * 3600e3 }); const cl = await a.rpc('capsule.list');
    ck('капсула запечатана и видна в «моих капсулах» без текста', cl.list.length === 1 && cl.list[0].to === b.me.id && !JSON.stringify(cl).includes('секрет'), cl);
    ck('до срока текст капсулы не отдаётся никому', !JSON.stringify(await b.rpc('msg.history', { chat: dm })).includes('секрет из прошлого') && !JSON.stringify(await a.rpc('msg.history', { chat: dm })).includes('секрет из прошлого'));
    ck('чужую капсулу отменить нельзя', !!(await b.fail('capsule.cancel', { chat: cl.list[0].chat, id: cl.list[0].id })));
    await a.rpc('capsule.cancel', { chat: cl.list[0].chat, id: cl.list[0].id }); ck('свою капсулу можно отменить', (await a.rpc('capsule.list')).list.length === 0);
    // ── чаевые (новичкам делиться листиками нельзя сутки, поэтому платит главный админ)
    const dm2 = (await own.rpc('dm.open', { user: b.me.id })).chat.id; const ti = await own.rpc('tip.info'); const mb = (await b.rpc('msg.send', { chat: dm2, text: 'шутка дня' })).msg; const bal0 = (await b.rpc('stars.info')).stars;
    ck('новичку чаевые оставить нельзя: сутки после регистрации', /24 ч/.test(await a.fail('tip.send', { chat: dm, id: (await b.rpc('msg.send', { chat: dm, text: 'ещё шутка' })).msg.id, n: 100 }) || ''));
    const tp = await own.rpc('tip.send', { chat: dm2, id: mb.id, n: 100 }); ck('чаевые: автор получает сумму за вычетом комиссии из tip.info', tp.got === 100 - Math.ceil(100 * ti.fee / 100) && ti.fee > 0 && ti.fee < 50 && (await b.rpc('stars.info')).stars === bal0 + tp.got, [ti, tp]);
    ck('чаевые меньше минимума и самому себе не проходят', !!(await own.fail('tip.send', { chat: dm2, id: mb.id, n: ti.min - 1 })) && !!(await b.fail('tip.send', { chat: dm2, id: mb.id, n: 100 })));
    // ── подарки
    const gc = await a.rpc('gift.catalog'); const cheap = (gc.gifts || gc.list || []).filter(g => !g.lim).sort((x, y) => x.price - y.price)[0];
    if (cheap) { const g = await a.rpc('gift.send', { to: b.me.id, gift: cheap.id }).then(r => r, e => ({ err: e.message })); ck('подарок дарится (или честно отказано новичку)', !g.err || /сутк|24|новы/i.test(g.err), g); }
    // ── рекорды и дуэль
    const s1 = await a.rpc('apps.score', { app: 'catch', score: 40 }), s2 = await b.rpc('apps.score', { app: 'catch', score: 25 }); const top = await b.rpc('apps.top', { app: 'catch' });
    ck('таблица рекордов: порядок, место и лучший результат', s1.place === 1 && s2.place === 2 && top.top[0].n === 40 && top.place === 2 && top.best === 25, top);
    ck('невозможный результат в таблицу не попадает', !!(await a.fail('apps.score', { app: 'catch', score: 999999 })));
    const du = await a.rpc('duel.new', { app: 'beer', to: b.me.id, score: 5 }); const dd = await b.rpc('duel.done', { id: du.id, score: 7 });
    ck('дуэль: вызов, ответ, итог, вторая попытка запрещена', dd.done && dd.sa === 5 && dd.sb === 7 && !!(await b.fail('duel.done', { id: du.id, score: 9 })), dd);
    // ── лобби
    const lob = await a.rpc('lobby.new', { app: 'catch' }); await a.rpc('lobby.invite', { id: lob.id, to: b.me.id }); await b.rpc('lobby.join', { id: lob.id });
    await a.rpc('lobby.ready', { id: lob.id }); const st = await b.rpc('lobby.ready', { id: lob.id });
    ck('лобби: оба готовы — общий старт', st.state === 'play' && st.round === 1 && st.seed > 0, st);
    await a.rpc('lobby.done', { id: lob.id, n: 12 }); const fin = await b.rpc('lobby.done', { id: lob.id, n: 9 });
    ck('лобби: итог раунда и счёт побед', fin.state === 'idle' && fin.last.win === a.me.id && fin.players.find(p => p.id === a.me.id).wins === 1, fin.last);
    await a.rpc('lobby.leave'); await b.rpc('lobby.leave');
    // ── лента и истории
    await a.rpc('feed.post', { text: 'запись для проверки механик' }); const fl = await b.rpc('feed.list', { tab: 'feed' });
    ck('запись появляется в ленте у других', JSON.stringify(fl).includes('запись для проверки механик'));
    await a.rpc('story.post', { kind: 'text', text: 'история дня', bg: '1' }); const sl = await b.rpc('story.list', {});
    ck('история видна другим', JSON.stringify(sl).includes('история дня'));
    // ── тишина: инкогнито, «побыть рядом», стирание, счётчик
    await a.rpc('me.incog', { on: true }); const ua = (await b.rpc('user.get', { id: a.me.id })).user; ck('инкогнито прячет «в сети»', ua.online === undefined && ua.hidden === true, ua); await a.rpc('me.incog', { on: false });
    await b.rpc('me.update', { status: { e: '🪫', t: 'Нет сил' } }); const nr = await a.rpc('near.send', { to: b.me.id }).then(r => r, e => ({ err: e.message })); ck('«побыть рядом» отправляется человеку без сил', !nr.err, nr);
    const cnt = await a.rpc('chat.count', { id: dm, since: 0 }); ck('счётчик сообщений чата сходится', cnt.total >= 2 && cnt.total === cnt.mine + cnt.theirs, cnt);
    await a.rpc('chat.wipe', { id: dm }); await sleep(200); ck('стёртый без следа чат пропал у обоих', !!(await b.fail('msg.history', { chat: dm })) && !!(await a.fail('msg.history', { chat: dm })));
    // ── сброс пароля
    const codes = (await a.rpc('me.recovery.new', { password: 'Mech-test-mech_anna' })).recovery; const rc = await post('/api/recover', { username: 'mech_anna', code: codes[0], password: 'Novyi-parol-1' });
    ck('забытый пароль меняется по коду восстановления', !!rc.token && !!(await post('/api/login', { username: 'mech_anna', password: 'Novyi-parol-1' })).token);
    const link = await own.rpc('admin.user.reset', { id: b.me.id }); const rs = await post('/api/reset', { token: link.token, password: 'Novyi-parol-2' });
    ck('и по одноразовой ссылке от главного админа', !!rs.token && rs.recovery.length === 8 && !!(await post('/api/reset', { token: link.token, password: 'x'.repeat(8) })).error);
    const dump = JSON.parse(fs.readFileSync(path.join(dir, 'db.json'), 'utf8'));
    const commonId = dump.meta.common, tf = Object.values(dump.chats).find(c => c.username === 'istinnie_druzya');
    ck('«Весь Нудист» заводится сам даже без OWNERS, и зарегистрированные уже внутри', !!commonId && !!dump.chats[commonId] && ['mech_owner', 'mech_anna', 'mech_boris'].every(n => { const u = Object.values(dump.users).find(x => x.username === n); return u && dump.chats[commonId].members[u.id]; }), dump.meta.common);
    ck('«Истинные друзья» не найдены в поиске, вход — только по ссылке и заявке', !!tf && tf.pub === false && tf.approval === true, tf && { pub: tf.pub, approval: tf.approval });
    // ── одна и та же ошибка ломала вход: «Я рядом» пишет в поле near координаты, а функция «рядом с вами» ждала там массив.
    // Ловим регрессию на живом входе: у b включены координаты — сервер обязан отдать полноценные данные, а не упасть.
    // Причина аварии 20.11: «Я рядом» пишет в поле near объект координат, а функция «рядом с вами» ждала там массив,
    // и вход в аккаунт падал целиком. Проверяем на живых данных: две формы поля не должны мешать друг другу.
    await a.rpc('near.send', { to: b.me.id }).catch(() => null);      // у b появился массив отметок
    const C = require('../server/core.js');
    const rawA = Object.values(dump.users).find(x => x.username === 'mech_anna'), rawB = Object.values(dump.users).find(x => x.username === 'mech_boris');
    const withGeo = C.selfUser({ ...rawA, near: { lat: 55.75, lon: 37.61, ts: Date.now() } });
    ck('координаты «Я рядом» не ломают данные человека', !!withGeo && withGeo.near === undefined, withGeo && withGeo.near);
    const withList = C.selfUser({ ...rawB, near: [{ u: rawA.id, ts: Date.now() }] });
    ck('отметки «побыть рядом» по-прежнему доходят', Array.isArray(withList.near) && withList.near.length === 1, withList.near);
    const h = await (await fetch(base + '/api/health')).json(); ck('состояние сервера: размер базы и время сохранения видны', h.ok && h.db && typeof h.db.saveMs === 'number' && typeof h.db.unsavedMs === 'number', h.db);
    const idx = await (await fetch(base + '/')).text(); ck('картинка для ссылок берётся с адреса, по которому открыли сайт', idx.includes(`og:image" content="${base}/og.png"`), (/og:image[^>]*/.exec(idx) || [])[0]);
  } finally { srv.kill(); await sleep(300); fs.rmSync(dir, { recursive: true, force: true }); }
  console.log(bad ? `ПРОВАЛОВ: ${bad} из ${total}` : `Механики работают: ${total} проверок.`);
})().then(() => process.exit(bad ? 1 : 0), e => { console.error('✗ ' + (e.stack || e.message)); process.exit(1); });
