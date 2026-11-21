'use strict';
// Карточный стол: партия на 2–4 человек, правила проверяет сервер.
// Ловим то, что важнее всего: чужой рукой играть нельзя, не свою карту положить нельзя, партия доходит до победы.
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const WS = require('../server/vendor/ws');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let bad = 0, total = 0;
const ck = (n, ok, x) => { total++; if (!ok) { bad++; console.log('  ✗ ПРОВАЛ:', n, x === undefined ? '' : JSON.stringify(x).slice(0, 240)); } else if (process.env.VERBOSE) console.log('  ✓', n); };

(async () => {
  const port = 3500 + Math.floor(Math.random() * 150), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nudist-cards-')), base = `http://127.0.0.1:${port}`;
  const env = { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dir, KEEP_AWAKE: 'off' };
  for (const k of Object.keys(env)) if (/^(SUPABASE_|S3_|OWNERS|LEAF_ADMINS|TG_|YOOKASSA|NODE_ENV|SITE_URL|MOVED_TO)/.test(k)) delete env[k];
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'boot.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  try {
    let up = false; for (let i = 0; i < 60 && !up; i++) { await sleep(250); try { up = (await fetch(base + '/api/health')).ok; } catch (e) {} }
    if (!up) throw new Error('сервер не поднялся:\n' + log.slice(-900));
    const post = async (p, b) => (await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })).json();
    const conn = tok => new Promise((res, rej) => { const ws = new WS(`ws://127.0.0.1:${port}/ws?token=${tok}`); let n = 0; const w = new Map(), c = { evs: [], tok };
      ws.on('error', rej);
      ws.on('message', d => { const q = JSON.parse(String(d)); if (q.ev === 'init') { c.me = q.d.me; return res(c); } if (q.ev === 'cards') { c.last = q.d; c.evs.push(q); return; } if (q.ev) return c.evs.push(q); const x = w.get(q.id); if (x) { w.delete(q.id); q.e !== undefined ? x.no(new Error(q.e)) : x.ok(q.r); } });
      c.rpc = (m, p) => new Promise((ok, no) => { const i = ++n; w.set(i, { ok, no }); ws.send(JSON.stringify({ id: i, m, p: p || {} })); setTimeout(() => { if (w.has(i)) { w.delete(i); no(new Error('нет ответа на ' + m)); } }, 8000); });
      c.fail = (m, p) => c.rpc(m, p).then(() => null, e => e.message); c.close = () => ws.close(); });
    const reg = async u => { const r = await post('/api/register', { username: u, password: 'Cards-test-' + u, name: u, agree: true, adult: true }); await sleep(150); return conn(r.token); };
    const a = await reg('card_anna'), b = await reg('card_boris'), c1 = await reg('card_vika'), d1 = await reg('card_gleb');

    const g = await a.rpc('cards.new', { seats: 4 });
    ck('стол на четверых создаётся', g && g.seats === 4 && g.state === 'lobby', g && { seats: g.seats, st: g.state });
    for (const x of [b, c1, d1]) { await a.rpc('cards.invite', { id: g.id, to: x.me.id }).catch(() => {}); }
    await b.rpc('cards.join', { id: g.id }); await c1.rpc('cards.join', { id: g.id }); await d1.rpc('cards.join', { id: g.id });
    const st = await a.rpc('cards.get', { id: g.id });
    ck('за столом четыре человека', st.players.length === 4, st.players.length);
    ck('пятый не влезает', !!(await (await reg('card_petr')).fail('cards.join', { id: g.id })));
    ck('чужому вход закрыт', !!(await (await reg('card_stranger')).fail('cards.join', { id: g.id })));

    await a.rpc('cards.start', { id: g.id });
    const s1 = await a.rpc('cards.get', { id: g.id });
    ck('раздача: по семь карт каждому', s1.players.every(p => p.n === 7), s1.players.map(p => p.n));
    ck('своя рука видна, чужая — только числом', s1.hand.length === 7 && !('hand' in (s1.players[1] || {})), true);
    ck('первая карта — не «дикая»', !!(s1.top && s1.top.k !== 'wild' && s1.top.k !== 'wild4'), s1.top);

    // играем: всегда ходит тот, чей сейчас ход. Каждое соединение — своё, как у живых людей;
    // при переполнении лимита тест переподключается, чтобы проверять игру, а не защиту от флуда.
    const who = { [a.me.id]: a, [b.me.id]: b, [c1.me.id]: c1, [d1.me.id]: d1 };
    let moves = 0, over = null;
    for (let k = 0; k < 400; k++) {
      const v = await a.rpc('cards.get', { id: g.id }).catch(() => null); if (!v || v.state === 'over') { over = v; break; }
      const cur = v.turn, me = who[cur]; if (!me) break;
      const mine = await me.rpc('cards.get', { id: g.id }).catch(e => /Слишком много/.test(e.message) ? null : Promise.reject(e));
      if (!mine) { await sleep(1500); continue; }
      const okIdx = mine.playable.filter(x => x.ok).map(x => x.i);
      if (okIdx.length) {
        const card = mine.hand[okIdx[0]];
        await me.rpc('cards.play', { id: g.id, i: okIdx[0], color: card.k === 'wild' || card.k === 'wild4' ? 'r' : undefined, said: true }).catch(() => {});
      } else await me.rpc('cards.draw', { id: g.id }).catch(() => {});
      moves++;
    }
    ck('партия доходит до победы за разумное число ходов', !!(over && over.state === 'over' && over.winner), over && { st: over.state, win: over.winner, moves });
    ck('победитель — участник стола', !!(over && over.players.some(p => p.id === over.winner)), over && over.winner);

    // честность: не своей рукой играть нельзя
    const g2 = await a.rpc('cards.new', { seats: 2 }); await a.rpc('cards.invite', { id: g2.id, to: b.me.id }); await b.rpc('cards.join', { id: g2.id }); await a.rpc('cards.start', { id: g2.id });
    const cur2 = (await a.rpc('cards.get', { id: g2.id })).turn, other = cur2 === a.me.id ? b : a, self = cur2 === a.me.id ? a : b;
    ck('не в свой ход карту положить нельзя', !!(await other.fail('cards.play', { id: g2.id, i: 0 })));
    const selfView = await self.rpc('cards.get', { id: g2.id });
    const bad1 = selfView.hand.findIndex((c, i) => !selfView.playable[i].ok);
    if (bad1 >= 0) ck('неподходящую карту положить нельзя', !!(await self.fail('cards.play', { id: g2.id, i: bad1 })));
    ck('карту, которой нет в руке, не положить', !!(await self.fail('cards.play', { id: g2.id, i: 99 })));
  } finally { srv.kill(); await sleep(300); fs.rmSync(dir, { recursive: true, force: true }); }
  console.log(bad ? `ПРОВАЛОВ: ${bad} из ${total}` : `Карточный стол работает: ${total} проверок.`);
})().then(() => process.exit(bad ? 1 : 0), e => { console.error('✗ ' + (e.stack || e.message)); process.exit(1); });
