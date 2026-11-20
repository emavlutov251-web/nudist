'use strict';
// Рейв: комната на несколько человек.
// Важное: переключать ленту может только хозяин; опоздавший видит, что играет и с какой секунды;
// чат общий; кто вышел — того нет в списке; закрытые комнаты не видны посторонним.
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const WS = require('../server/vendor/ws');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let bad = 0, total = 0, passed = 0;
const ck = (n, ok, x) => { total++; passed++; if (!ok) { bad++; console.log('  ✗ ПРОВАЛ:', n, x === undefined ? '' : JSON.stringify(x).slice(0, 240)); } else if (process.env.VERBOSE) console.log('  ✓', n); };

(async () => {
  const port = 3800 + Math.floor(Math.random() * 120), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nudist-rave-')), base = `http://127.0.0.1:${port}`;
  const env = { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dir, KEEP_AWAKE: 'off' };
  for (const k of Object.keys(env)) if (/^(SUPABASE_|S3_|OWNERS|LEAF_ADMINS|TG_|YOOKASSA|NODE_ENV|SITE_URL|MOVED_TO)/.test(k)) delete env[k];
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'boot.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  try {
    let up = false; for (let i = 0; i < 60 && !up; i++) { await sleep(250); try { up = (await fetch(base + '/api/health')).ok; } catch (e) {} }
    if (!up) throw new Error('сервер не поднялся:\n' + log.slice(-900));
    const post = async (p, b) => (await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })).json();
    const conn = tok => new Promise((res, rej) => { const ws = new WS(`ws://127.0.0.1:${port}/ws?token=${tok}`); let n = 0; const w = new Map(), c = { evs: [] };
      ws.on('error', rej);
      ws.on('message', d => { const q = JSON.parse(String(d)); if (q.ev === 'init') { c.me = q.d.me; return res(c); } if (q.ev) return c.evs.push(q); const x = w.get(q.id); if (x) { w.delete(q.id); q.e !== undefined ? x.no(new Error(q.e)) : x.ok(q.r); } });
      c.rpc = (m, p) => new Promise((ok, no) => { const i = ++n; w.set(i, { ok, no }); ws.send(JSON.stringify({ id: i, m, p: p || {} })); setTimeout(() => { if (w.has(i)) { w.delete(i); no(new Error('нет ответа на ' + m)); } }, 8000); });
      c.fail = (m, p) => c.rpc(m, p).then(() => null, e => e.message); c.close = () => ws.close(); });
    const reg = async u => { const r = await post('/api/register', { username: u, password: 'Rave-test-' + u, name: u, agree: true }); await sleep(150); return conn(r.token); };
    const a = await reg('rv_anya'), b = await reg('rv_boris'), c1 = await reg('rv_vika');

    const nw = await a.rpc('rave.new', { title: 'Пятничный рейв', kind: 'clips' });
    ck('комната создаётся', !!(nw.room && nw.room.id), nw);
    ck('создатель — хозяин', nw.room.host === true, nw.room && nw.room.host);
    const rid = nw.room.id;
    const j = await b.rpc('rave.join', { id: rid });
    ck('другой заходит в комнату', j.room && j.room.id === rid, j.room && j.room.id);
    ck('в комнате двое', j.room.n === 2, j.room.n);
    const pl = await a.rpc('rave.play', { id: rid, kind: 'clip', item: 'clip_test', at: 12 });
    ck('хозяин ставит клип с 12-й секунды', pl.now && pl.now.item === 'clip_test' && pl.now.at === 12, pl.now);
    const noHost = await b.fail('rave.play', { id: rid, kind: 'clip', item: 'x', at: 0 });
    ck('гость не может переключать ленту', /хозяин/i.test(noHost || ''), noHost);
    await sleep(300);
    const ev = b.evs.filter(e => e.ev === 'rave.play').pop();
    ck('гость получает событие о переключении', !!(ev && ev.d.now && ev.d.now.item === 'clip_test'), ev && ev.d);
    await a.rpc('rave.chat', { id: rid, text: 'привет, начинаем' });
    await sleep(300);
    const mev = b.evs.filter(e => e.ev === 'rave.msg').pop();
    ck('чат доходит до всех', !!(mev && mev.d.m.text === 'привет, начинаем'), mev && mev.d);
    const g = await c1.rpc('rave.get', { id: rid });
    ck('опоздавший видит, что играет', g.now && g.now.item === 'clip_test', g.now);
    ck('опоздавший не внутри, пока не зашёл', g.in === false, g.in);
    const before = await c1.rpc('rave.list');
    ck('в списке видна открытая комната', before.list.some(r => r.id === rid), before.list.length);
    await c1.rpc('rave.join', { id: rid });
    const after = await c1.rpc('rave.get', { id: rid });
    ck('после входа — трое', after.room.n === 3, after.room.n);
    ck('чат отдаётся при входе', (after.chat || []).some(m => /начинаем/.test(m.text)), (after.chat || []).length);
    await b.rpc('rave.leave', { id: rid });
    const less = await a.rpc('rave.get', { id: rid });
    ck('вышедший пропадает из комнаты', less.room.n === 2, less.room.n);
    // пауза хозяина
    await a.rpc('rave.pause', { id: rid, paused: true, at: 30 });
    const g2 = await c1.rpc('rave.get', { id: rid });
    ck('пауза фиксирует секунду', g2.now.paused === true && g2.now.at === 30, g2.now);
    // приватная комната
    const pv = await a.rpc('rave.new', { title: 'Только для своих', pub: false });
    const pvId = pv.room.id;
    const seen = await c1.rpc('rave.list');
    ck('закрытая комната не видна посторонним', !seen.list.some(r => r.id === pvId), seen.list.map(r => r.id));
    const joined = await c1.rpc('rave.get', { id: pvId });
    ck('но по прямой ссылке она открывается', joined.room && joined.room.id === pvId, joined.room && joined.room.title);
    // приглашение — сообщением в личный чат
    const inv = await a.rpc('rave.invite', { id: pvId, user: b.me.id });
    ck('приглашение уходит в личный чат', !!(inv && inv.chat), inv);
    const hist = await b.rpc('msg.history', { chat: inv.chat, limit: 5 });
    ck('в личном чате есть зов на рейв', (hist.msgs || []).some(m => m.rave === pvId), (hist.msgs || []).map(m => m.text).slice(0, 3));
    // уход всех закрывает комнату
    await a.rpc('rave.leave', { id: pvId }); await c1.rpc('rave.leave', { id: pvId });
    const goneMsg = await b.fail('rave.get', { id: pvId });
    ck('пустая комната закрывается', /не найдена|закрылась/i.test(goneMsg || ''), goneMsg);
    // хозяин вышел — комнату ведёт оставшийся
    await a.rpc('rave.leave', { id: rid });
    const g3 = await c1.rpc('rave.get', { id: rid });
    ck('после ухода хозяина комнату ведёт оставшийся', g3.room.host === true, g3.room && g3.room.by);

    if (process.env.VERBOSE) console.log('');
        // ── Ссылка на видео и голос: свежая комната, чтобы не мешал прежний состав
    const fresh = (await a.rpc('rave.new', { title: 'Кино вечером', kind: 'clips' })).room;
    const rid2 = fresh.id;
    await b.rpc('rave.join', { id: rid2 });
        // ── Ссылка на видео: вставляешь — у всех одно и то же
    for (const [name, url, site, kind] of [
      ['YouTube', 'https://youtu.be/dQw4w9WgXcQ', 'YouTube', 'embed'],
      ['VK', 'https://vk.com/video-123_456', 'VK', 'embed'],
      ['Rutube', 'https://rutube.ru/video/0123456789abcdef0123456789abcdef/', 'Rutube', 'embed'],
      ['свой файл', 'https://example.com/film.mp4', '', 'file'],
    ]) {
      const q = await a.rpc('rave.url', { id: rid2, url }).then(r => r.item, e => ({ err: e.message }));
      ck('ссылка ' + name + ' пускается', q && q.kind === kind && (!site || q.site === site), q);
    }
    const junk = await a.fail('rave.url', { id: rid2, url: 'https://example.com/about' });
    ck('неизвестный сервис отклоняется', !!junk, junk);
    const guestUrl = await b.fail('rave.url', { id: rid2, url: 'https://youtu.be/dQw4w9WgXcQ' });
    ck('ссылку ставит только хозяин', !!guestUrl, guestUrl);
    const st = await b.rpc('rave.get', { id: rid2 });
    ck('гость видит ссылку комнаты', st.now && st.now.kind === 'link' && st.link && st.link.url, st.link && st.link.url);
    // ── Голос в комнате: тот же WebRTC, что и в звонках, но комната остаётся на экране
    const vj = await a.rpc('rtc.join', { chat: 'rave:' + rid2, muted: true }).then(r => r, e => ({ err: e.message }));
    ck('голос в комнате включается', vj && vj.you && !vj.err, vj.err || 'на линии');
    const vs = await a.rpc('rtc.state', { chat: 'rave:' + rid2, muted: true }).then(() => true, e => e.message);
    ck('состояние микрофона меняется', vs === true, vs);
    const vg = await b.rpc('rtc.join', { chat: 'rave:' + rid2, muted: true }).then(r => r, e => ({ err: e.message }));
    ck('второй человек слышит первого', vg && vg.peers && vg.peers.length === 1, vg.err || (vg.peers || []).length);
    const out = await b.rpc('rtc.leave', { chat: 'rave:' + rid2 }).then(() => true, e => e.message);
    ck('из голоса можно выйти', out === true, out);
    const out2 = await a.rpc('rtc.leave', { chat: 'rave:' + rid2 }).then(() => true, e => e.message);
    ck('выход последнего не роняет сервер', out2 === true, out2);
    const still = await a.rpc('rave.get', { id: rid2 }).then(r => r.room && r.room.id === rid2, () => false);
    ck('комната жива после голоса', still === true, still);
    // ── Синхронное прослушивание: сервер помнит трек, секунду и момент включения — по ним все ровняются
    const mroom = await a.rpc('rave.new', { title: 'Слушаем вместе', kind: 'music' });
    const mid = mroom.room.id;
    await b.rpc('rave.join', { id: mid });
    const t0 = Date.now();
    const mp = await a.rpc('rave.play', { id: mid, kind: 'music', item: 'track_1', at: 37 });
    ck('хозяин включает трек с 37-й секунды', mp.now && mp.now.item === 'track_1' && mp.now.at === 37, mp.now);
    ck('сервер запомнил момент включения', Math.abs((mp.now.ts || 0) - t0) < 5000, { ts: mp.now.ts, t0 });
    const joinLate = await b.rpc('rave.get', { id: mid });
    const lateNow = joinLate.room.now;
    const latePos = (lateNow.at || 0) + (lateNow.paused ? 0 : (Date.now() - lateNow.ts) / 1000);
    ck('опоздавший встаёт на ту же секунду, а не с начала', latePos >= 37 && latePos < 45, Math.round(latePos));
    await a.rpc('rave.pause', { id: mid, paused: true, at: 41.5 });
    const paused = await b.rpc('rave.get', { id: mid });
    ck('пауза хозяина видна всем', paused.room.now.paused === true && paused.room.now.at === 41.5, paused.room.now);
    const pBoris = await b.fail('rave.pause', { id: mid, paused: false, at: 0 });
    ck('гость не может ставить паузу', /хозяин/i.test(pBoris || ''), pBoris);
    await a.rpc('rave.pause', { id: mid, paused: false, at: 42 });
    const resumed = await b.rpc('rave.get', { id: mid });
    ck('продолжили — идёт дальше с той же секунды', resumed.room.now.paused === false && resumed.room.now.at === 42, resumed.room.now);
    const seek = await a.rpc('rave.play', { id: mid, kind: 'music', item: 'track_1', at: 90 });
    ck('перемотка хозяина доходит до всех', seek.now.at === 90, seek.now.at);
console.log(`${passed - bad}/${passed} ✓`);
    if (bad) process.exitCode = 1;
  } catch (e) { console.log('  ✗ ИСКЛЮЧЕНИЕ:', e.message); process.exitCode = 1; }
  finally { srv.kill('SIGKILL'); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} }
  process.exit(process.exitCode || 0);
})();
