'use strict';
// Знакомства и музыка. Проверяем то, что ломалось у людей:
//  • «Моя музыка» показывает свои треки, даже если они не выложены в общую волну;
//  • загруженный файл доходит до диска целым, пустой файл не принимается;
//  • знакомство подбирает по общим интересам, кого пропустили — не показываем снова,
//    взаимное «нравится» открывает чат и создаёт совпадение у обоих.
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const WS = require('../server/vendor/ws');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let bad = 0, total = 0;
const ck = (n, ok, x) => { total++; if (!ok) { bad++; console.log('  ✗ ПРОВАЛ:', n, x === undefined ? '' : JSON.stringify(x).slice(0, 240)); } else if (process.env.VERBOSE) console.log('  ✓', n); };
// настоящий короткий WAV: 0.2 с, 8 кГц, моно
const wav = (() => { const n = 1600, buf = Buffer.alloc(44 + n * 2); buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(8000, 24); buf.writeUInt32LE(16000, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40); for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(9000 * Math.sin(2 * Math.PI * 440 * i / 8000)), 44 + i * 2); return buf; })();

(async () => {
  const port = 3650 + Math.floor(Math.random() * 120), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nudist-dm-')), base = `http://127.0.0.1:${port}`;
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
    const reg = async u => { const r = await post('/api/register', { username: u, password: 'Dm-test-' + u, name: u, agree: true, adult: true }); await sleep(150); const c = await conn(r.token); c.tok = r.token; return c; };

    // ───── знакомства
    const a = await reg('dm_anna'), b = await reg('dm_boris'), c1 = await reg('dm_vika');
    ck('без анкеты подбор не работает', !!(await a.fail('dating.next')));
    ck('слишком юный год рождения отклоняется', !!(await a.fail('dating.save', { year: new Date().getFullYear() - 10 })));
    await a.rpc('dating.save', { year: 1996, city: 'Пермь', tags: ['пляж', 'музыка', 'код'], about: 'люблю пляж', play: 'Друзья' });
    await b.rpc('dating.save', { year: 1995, city: 'Пермь', tags: ['пляж', 'код', 'книги'], about: 'код и пляж', play: 'Друзья' });
    await c1.rpc('dating.save', { year: 2005, city: 'Сочи', tags: ['аниме'], about: 'аниме', play: 'Общение' });
    const nx = await a.rpc('dating.next');
    ck('подбор отдаёт человека', !!(nx && nx.user && nx.user.id), nx);
    ck('лучшее совпадение — из своего города и с общими интересами', nx.user.username === 'dm_boris', nx.user && nx.user.username);
    ck('общие интересы посчитаны', (nx.common || []).sort().join(',') === 'код,пляж', nx.common);
    ck('возраст, а не дата рождения', nx.user.age === new Date().getFullYear() - 1995, nx.user.age);
    await a.rpc('dating.skip', { id: b.me.id });
    const nx2 = await a.rpc('dating.next');
    ck('пропущенный больше не показывается', !nx2.user || nx2.user.id !== b.me.id, nx2.user && nx2.user.username);
    // чтобы проверить взаимность, Борис тоже должен увидеть Анну: он её ещё не пропускал
    const bn = await b.rpc('dating.next');
    ck('второй видит первого', bn.user && bn.user.id === a.me.id, bn.user && bn.user.username);
    const bl = await b.rpc('dating.like', { id: a.me.id });
    ck('первый лайк не взаимный', !bl.mutual, bl);
    await a.rpc('dating.skip', { id: c1.me.id }).catch(() => {});
    // Анна уже пропустила Бориса — лайк всё равно должен работать: пропуск не запрещает ответить взаимно
    const al = await a.rpc('dating.like', { id: b.me.id });
    ck('ответный лайк даёт совпадение', al.mutual === true, al);
    const am = await a.rpc('dating.list'), bm = await b.rpc('dating.list');
    ck('совпадение видно обоим', am.length === 1 && bm.length === 1, { am: am.length, bm: bm.length });
    ck('совпадение сразу открывает чат', !!(am[0] && am[0].chat) && am[0].chat === bm[0].chat, am[0] && am[0].chat);
    const hist = await a.rpc('msg.history', { chat: am[0].chat, limit: 10 });
    ck('в чате есть сообщение о совпадении', (hist.msgs || []).some(m => /понравились друг другу/i.test(m.text || '')), (hist.msgs || []).length);
    const dme = await a.rpc('dating.me');
    ck('лайки считаются', dme.likes >= 1 && dme.matches === 1, dme);
    ck('в анкете не отдаётся год рождения', dme.year === 1996 && nx.user.year === undefined, { y: nx.user && nx.user.year });
    await b.rpc('dating.off');
    const boff = await b.fail('dating.next');
    ck('выключивший знакомство больше не подбирает', /включите знакомство/i.test(boff || ''), boff);
    const an = await a.rpc('dating.next');
    ck('выключенного не показывают другим', !an.user || an.user.id !== b.me.id, an.user && an.user.username);

    // ───── музыка
    const upl = await fetch(base + '/api/upload', { method: 'POST', headers: { authorization: 'Bearer ' + a.tok, 'x-name': encodeURIComponent('тон.wav'), 'content-type': 'audio/wav' }, body: wav });
    const upj = await upl.json();
    ck('файл загружается', upl.status === 200 && upj.url, { s: upl.status, upj });
    const got = Buffer.from(await (await fetch(base + upj.url)).arrayBuffer());
    ck('файл на месте и целый', got.equals(wav), { было: wav.length, стало: got.length });
    const empty = await fetch(base + '/api/upload', { method: 'POST', headers: { authorization: 'Bearer ' + a.tok, 'x-name': 'empty.wav', 'content-type': 'audio/wav' }, body: Buffer.alloc(0) });
    ck('пустой файл не принимается', empty.status === 400, empty.status);
    const tr = await a.rpc('music.add', { media: { url: upj.url, size: wav.length, dur: 0.2, name: 'тон.wav' }, pub: false });
    ck('трек добавляется закрытым', tr && tr.id && tr.pub === false, tr && tr.pub);
    const my = await a.rpc('music.list', { tab: 'my' });
    ck('закрытый трек виден в «Моей музыке»', my.tracks.length === 1 && my.tracks[0].id === tr.id, my.tracks.length);
    const others = await b.rpc('music.list', { tab: 'all' });
    ck('закрытый трек не виден в общей волне', !others.tracks.some(t => t.id === tr.id), others.tracks.length);
    await a.rpc('music.edit', { id: tr.id, pub: true });
    const all2 = await b.rpc('music.list', { tab: 'all' });
    ck('выложенный трек появляется в общей волне', all2.tracks.some(t => t.id === tr.id), all2.tracks.length);
    await a.rpc('music.del', { id: tr.id });
    const my2 = await a.rpc('music.list', { tab: 'my' });
    ck('удалённый трек исчезает из библиотеки', !my2.tracks.some(t => t.id === tr.id), my2.tracks.length);

    if (process.env.VERBOSE) console.log('');
    console.log(`${total - bad}/${total} ✓`);
    if (bad) process.exitCode = 1;
  } catch (e) { console.log('  ✗ ИСКЛЮЧЕНИЕ:', e.message); process.exitCode = 1; }
  finally { srv.kill('SIGKILL'); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} }
  process.exit(process.exitCode || 0);
})();
