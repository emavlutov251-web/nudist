'use strict';
// Сквозная проверка «редакции сообщества» на временной базе: бут в пятницу вечером (старт мем-батла) →
// подкладываем «победный» мем с реакциями в базу → бут в воскресенье вечером (итоги недели) → проверяем выдачу 50 🍃.
// Запуск: node scripts/community-e2e.js
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.join(__dirname, '..');
const ck = (name, ok, extra) => { if (!ok) { console.error('  ✗ ПРОВАЛ:', name, extra === undefined ? '' : String(extra).slice(0, 300)); process.exitCode = 1; } else console.log('  ✓', name); };
const bootOnce = (dir, at) => new Promise((res, rej) => {
  const env = { ...process.env, PORT: '0', HOST: '127.0.0.1', DATA_DIR: dir, KEEP_AWAKE: 'off', EVENTS_NOW: at, COMMUNITY_CHAT: 'community' };
  for (const k of Object.keys(env)) if (/^(SUPABASE_|S3_|OWNERS|LEAF_ADMINS|TG_|YOOKASSA|NODE_ENV|SITE_URL|MOVED_TO)/.test(k)) delete env[k];
  const srv = spawn(process.execPath, [path.join(ROOT, 'server', 'boot.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  srv.on('exit', () => res(log)); const t0 = Date.now(); const kill = setInterval(() => { if (Date.now() - t0 > 4500) { clearInterval(kill); srv.kill('SIGTERM'); } }, 250);
  srv.on('error', rej);
});
const dbOf = dir => JSON.parse(fs.readFileSync(path.join(dir, 'db.json'), 'utf8'));
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nudist-comm-'));
  console.log('База:', dir);
  // ── фаза 1: пятница, 17:30 МСК — «вопрос дня» (catch-up) и старт мем-батла
  let log = await bootOnce(dir, '2026-11-20T14:30:00+00:00');
  let db = dbOf(dir);
  const cid = db.meta && db.chatNames ? null : null; // chatNames не лежит в db — ищем чат по username ниже
  const ch = Object.values(db.chats).find(c => c.username === 'nudist_community');
  ck('бут в пятницу: «Сообщество Нудист» создано', !!ch);
  const msgs = db.msgs[ch.id] || [];
  ck('бут в пятницу: вопрос дня размещён', msgs.some(m => /Вопрос дня/.test(m.text || '')));
  ck('бут в пятницу: пост о старте мем-батла размещён', msgs.some(m => /батл/i.test(m.text || '')));
  ck('посты редакции тихие (silent)', msgs.filter(m => /Вопрос дня|батл|Итог дня/i.test(m.text || '')).every(m => m.silent === true));
  ck('отметка мем-батла сохранена', !!(db.meta.community && db.meta.community.battle && db.meta.community.battle.since));
  const marks1 = (db.meta.community && db.meta.community.marks) || {};
  ck('метки дня записаны', Object.keys(marks1).some(k => k.startsWith('battle-')) && Object.keys(marks1).some(k => k.startsWith('q-')));
  // регистрируем человека «автором победного мема» через перезапись базы: бота-победителя создаём напрямую в db? нет — только люди.
  // Проще: регистрируем настоящего пользователя через HTTP до выключения… но сервер уже выключен — повторно не поднимаем,
  // вместо этого заводим «человека» как… нужны настоящие люди. Поэтому фаза 1 повторяется с регистрацией.
  fs.rmSync(dir, { recursive: true, force: true });
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'nudist-comm2-'));
  console.log('База (полная):', dir2);
  const env1 = { ...process.env, PORT: '39917', HOST: '127.0.0.1', DATA_DIR: dir2, KEEP_AWAKE: 'off', EVENTS_NOW: '2026-11-20T14:30:00+00:00', COMMUNITY_CHAT: 'community' };
  for (const k of Object.keys(env1)) if (/^(SUPABASE_|S3_|OWNERS|LEAF_ADMINS|TG_|YOOKASSA|NODE_ENV|SITE_URL|MOVED_TO)/.test(k)) delete env1[k];
  const srv1 = spawn(process.execPath, [path.join(ROOT, 'server', 'boot.js')], { env: env1, stdio: ['ignore', 'pipe', 'pipe'] });
  let log1 = ''; srv1.stdout.on('data', d => log1 += d); srv1.stderr.on('data', d => log1 += d);
  let up = false; for (let i = 0; i < 60 && !up; i++) { await sleep(250); try { up = (await fetch('http://127.0.0.1:39917/api/health')).ok; } catch (e) { /* ждём */ } }
  ck('сервер фазы 1 поднялся', up);
  const reg = async u => (await fetch('http://127.0.0.1:39917/api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: u, password: 'Comm-e2e-' + u, name: u, agree: true, adult: true }) })).json();
  const winner = await reg('e2e_winner');
  const idle = await reg('e2e_idle');
  await sleep(1200);
  srv1.kill('SIGTERM'); await new Promise(r => srv1.on('exit', r));
  // ── фаза 1.5: подкладываем мем с реакциями от winner за время батла
  const d2 = dbOf(dir2);
  const ch2 = Object.values(d2.chats).find(c => c.username === 'nudist_community');
  const wUid = Object.values(d2.users).find(u => u.username === 'e2e_winner').id;
  const idleUid = Object.values(d2.users).find(u => u.username === 'e2e_idle').id;
  const sys = d2.meta.sys;
  const friday1830 = Date.UTC(2026, 10, 20, 15, 30); // 18:30 МСК пятницы
  const arr = (d2.msgs[ch2.id] = d2.msgs[ch2.id] || []);
  const seq = arr.reduce((m, x) => Math.max(m, x.seq || 0), 0) + 1;
  arr.push({ id: 'e2e-meme-1', seq, chat: ch2.id, from: wUid, ts: friday1830, type: 'text', text: 'мы — мем, который умеет регистрироваться', rx: { '🍀': [sys, idleUid], '😂': [sys] } });
  ch2.seq = seq; fs.writeFileSync(path.join(dir2, 'db.json'), JSON.stringify(d2));
  // ── фаза 2: воскресенье, 20:30 МСК — итоги недели и вручение 50 🍃
  const log2 = await bootOnce(dir2, '2026-11-22T17:30:00+00:00');
  const d3 = dbOf(dir2);
  const ch3 = Object.values(d3.chats).find(c => c.username === 'nudist_community');
  const msgs3 = d3.msgs[ch3.id] || [];
  ck('воскресенье: пост «Итоги недели» размещён', msgs3.some(m => /Итоги недели/.test(m.text || '')));
  ck('воскресенье: победитель батла назван в посте', msgs3.some(m => /Мем-батл выиграл/.test(m.text || '')));
  const winnerRec = Object.values(d3.users).find(u => u.username === 'e2e_winner');
  ck('воскресенье: победителю начислены 50 🍃 (было 500 стартовых)', winnerRec.stars === 550, winnerRec.stars);
  const marks3 = (d3.meta.community && d3.meta.community.marks) || {};
  ck('воскресенье: метка итогов записана', Object.keys(marks3).some(k => k.startsWith('week-')));
  ck('воскресенье: батл доведён до конца и выгружен (pending пуст)', !d3.meta.community.battle);
  if (process.exitCode) console.log('--- журнал фазы 2 (хвост) ---\n' + log2.slice(-800));
  fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(dir2, { recursive: true, force: true });
  console.log(process.exitCode ? '[community-e2e] ПРОВАЛЕНО' : '[community-e2e] всё работает');
})().catch(e => { console.error('[community-e2e] ошибка:', e); process.exit(1); });
