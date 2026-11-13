#!/usr/bin/env node
// Перенос записей из СВОЕГО публичного Telegram-канала в «Ленту» и «Клипы».
// Читает открытую веб-страницу канала (t.me/s/<канал>), скачивает фото, видео и голосовые и публикует их от имени аккаунта,
// чей токен передан. Аккаунт должен быть в переменной сервера IMPORTERS (или владельцем), иначе сработают дневные лимиты.
//
//   TG=канал SITE=https://сайт TOKEN=<токен сессии> STATE=./tg-state.json node scripts/tg-import.js
//
// Необязательно: LIMIT=20 (сколько записей обработать за запуск), CLIPS=0 (не добавлять видео в клипы), DRY=1 (ничего не публиковать).
// Место бережём: видео пережимается (длинная сторона до 960, H.264), а в ленте и в клипах стоит один и тот же файл.
// Повторный запуск продолжает с места остановки: что уже перенесено, записано в STATE. Нужен ffmpeg (ffprobe).
// Что не переносится: пересланное из чужих каналов, опросы, стикеры, музыка и файлы (на веб-странице на них нет ссылок),
// видео, которые Telegram не отдаёт в браузер из-за размера.
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const WS = require(path.join(__dirname, '..', 'server', 'vendor', 'ws'));
const TG = process.env.TG, SITE = (process.env.SITE || '').replace(/\/$/, ''), TOKEN = process.env.TOKEN, STATE = process.env.STATE || './tg-import-state.json';
const LIMIT = Number(process.env.LIMIT) || Infinity, DRY = !!process.env.DRY, CLIPS = process.env.CLIPS !== '0', CLIP_MAX = 180;
if (!TG || !SITE || !TOKEN) { console.error('Нужны переменные TG, SITE и TOKEN'); process.exit(2); }
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tgimp-'));
const UA = { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36' };
const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : { posts: {}, skip: {} };
const saveState = () => fs.writeFileSync(STATE, JSON.stringify(state, null, 1));
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function retry(fn, n = 4) { let err; for (let i = 0; i < n; i++) { try { return await fn(); } catch (e) { err = e; await sleep(1500 * (i + 1)); } } throw err; }
const getText = url => retry(async () => { const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) }); if (!r.ok) throw new Error(url + ' → ' + r.status); return r.text(); });

// ───── разбор страницы
const unesc = s => s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');
function plain(h) {
  h = h.replace(/<br\s*\/?>/g, '\n').replace(/<\/?(blockquote|pre)[^>]*>/g, '\n')
    .replace(/<a [^>]*?href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g, (_, href, t) => { const tt = t.replace(/<[^>]+>/g, ''), u = unesc(href), shown = unesc(tt).trim(); return !/^https?:/.test(u) || /^(https?:\/\/|@|#|\S+\.\S+\/)/.test(shown) || shown.startsWith('@') ? tt : tt + ' (' + u + ')'; })
    .replace(/<[^>]+>/g, '');
  return unesc(h).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
function textOf(b) {
  const k = b.indexOf('<div class="tgme_widget_message_text js-message_text"'); if (k < 0) return '';
  const start = b.indexOf('>', k) + 1, re = /<(\/?)div\b/g; re.lastIndex = start; let depth = 1, end = b.length, m;
  while ((m = re.exec(b))) { depth += m[1] ? -1 : 1; if (!depth) { end = m.index; break; } }
  return plain(b.slice(start, end));
}
function parse(b) {
  const id = (new RegExp('data-post="' + TG + '/(\\d+)"', 'i').exec(b) || [])[1]; if (!id) return null;
  const date = (/<time datetime="([^"]+)"/.exec(b) || [])[1], media = [];
  const re = /<a class="tgme_widget_message_photo_wrap[^"]*"[^>]*?background-image:url\('([^']+)'\)|<video src="([^"]+)" class="tgme_widget_message_video js-message_video"|<video class="tgme_widget_message_roundvideo js-message_roundvideo" src="([^"]+)"|<audio class="tgme_widget_message_voice js-message_voice" src="([^"]+)"/g; let m;
  while ((m = re.exec(b))) media.push(m[1] ? { type: 'photo', url: unesc(m[1]) } : m[2] ? { type: 'video', url: unesc(m[2]) } : m[3] ? { type: 'round', url: unesc(m[3]) } : { type: 'voice', url: unesc(m[4]) });
  const players = (b.match(/class="tgme_widget_message_video_player/g) || []).length;
  return { id: +id, ts: date ? Date.parse(date) : 0, text: textOf(b), media: media.slice(0, 10), big: Math.max(0, players - media.filter(x => x.type === 'video').length),
    fwd: b.includes('tgme_widget_message_forwarded_from'), service: b.includes('service_message'), doc: b.includes('tgme_widget_message_document'), poll: b.includes('tgme_widget_message_poll'), sticker: b.includes('tgme_widget_message_sticker') };
}
const blocks = html => html.split(/(?=<div class="tgme_widget_message_wrap)/).slice(1).map(parse).filter(Boolean);

// ───── файлы
async function download(url, file) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(180000) }); if (!r.ok) throw new Error('файл → ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer()); if (buf.length < 200) throw new Error('файл пустой'); fs.writeFileSync(file, buf); return buf.length;
}
function probe(file) {
  const j = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:stream_side_data=rotation:format=duration', '-of', 'json', file], { encoding: 'utf8' }));
  const s = (j.streams || [])[0] || {}, rot = Math.abs(Number(((s.side_data_list || [])[0] || {}).rotation) || 0) % 180 === 90;
  return { w: (rot ? s.height : s.width) || 0, h: (rot ? s.width : s.height) || 0, dur: Number((j.format || {}).duration) || 0 };
}
const MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', m4a: 'audio/mp4' };
// Пережать видео: телефонные ролики после этого весят в несколько раз меньше. Если выигрыша нет, остаётся исходник.
function shrink(file) {
  const out = file.replace(/\.mp4$/, '.s.mp4');
  try {
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-vf', "scale=w='if(gt(iw,ih),min(960,iw),-2)':h='if(gt(iw,ih),-2,min(960,ih))',format=yuv420p", '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', out], { stdio: ['ignore', 'ignore', 'pipe'] });
    if (fs.statSync(out).size < fs.statSync(file).size * 0.85) return out;
  } catch (e) { /* не получилось пережать: берём как есть */ }
  fs.rmSync(out, { force: true }); return file;
}
const upload = (file, name) => retry(async () => {
  const buf = fs.readFileSync(file), ext = name.split('.').pop();
  const r = await fetch(SITE + '/api/upload', { method: 'POST', headers: { authorization: 'Bearer ' + TOKEN, 'content-type': MIME[ext] || 'application/octet-stream', 'x-name': encodeURIComponent(name) }, body: buf, signal: AbortSignal.timeout(600000) });
  const j = await r.json().catch(() => ({})); if (!r.ok || !j.url) throw new Error('загрузка → ' + r.status + ' ' + (j.error || '')); return j.url;
}, 3);

// ───── связь с сервером
let ws = null, seq = 0, bytes = 0; const waiting = new Map();
function connect() {
  return new Promise((ok, no) => {
    const s = new WS(SITE.replace(/^http/, 'ws') + '/ws?token=' + encodeURIComponent(TOKEN));
    s.on('open', () => { ws = s; setTimeout(ok, 300); });
    s.on('message', d => { let q; try { q = JSON.parse(d.toString()); } catch (e) { return; } const w = q && q.id && waiting.get(q.id); if (w) { waiting.delete(q.id); q.e ? w.no(new Error(q.e)) : w.ok(q.r); } });
    s.on('close', () => { if (ws === s) ws = null; for (const w of waiting.values()) w.no(new Error('связь оборвалась')); waiting.clear(); });
    s.on('error', e => no(e));
  });
}
const rpc = (m, p) => retry(async () => {
  if (!ws || ws.readyState !== 1) await connect();
  return new Promise((ok, no) => { const id = ++seq; waiting.set(id, { ok, no }); ws.send(JSON.stringify({ id, m, p })); setTimeout(() => { if (waiting.delete(id)) no(new Error(m + ': нет ответа')); }, 30000); });
}, 3);

// ───── перенос одной записи
async function fresh(p) { const one = blocks('<div class="tgme_widget_message_wrap">' + await getText(`https://t.me/${TG}/${p.id}?embed=1&mode=tme`))[0]; if (one && one.media.length === p.media.length) p.media = one.media; }
async function handle(p) {
  const skip = why => { state.skip[p.id] = why; saveState(); console.log(`#${p.id} пропуск: ${why}`); };
  if (p.service) return skip('служебное сообщение');
  if (p.fwd) return skip('пересланное из другого канала');
  if (!p.text && !p.media.length) return skip(p.doc ? 'музыка или файл (на странице нет ссылки)' : p.poll ? 'опрос' : p.sticker ? 'стикер' : p.big ? 'видео слишком большое, Telegram не отдаёт его в браузер' : 'нет содержимого');
  const urls = [], clips = [], files = [];
  try {
    for (const [n, m] of p.media.entries()) {
      const ext = m.type === 'photo' ? ((/\.(jpe?g|png|webp|gif)(\?|$)/i.exec(m.url) || [])[1] || 'jpg').toLowerCase().replace('jpeg', 'jpg') : m.type === 'voice' ? 'ogg' : 'mp4';
      let file = path.join(TMP, `${p.id}-${n}.${ext}`); files.push(file);
      try { await download(m.url, file); } catch (e) { await fresh(p); await retry(() => download(p.media[n].url, file), 2); }
      if (m.type === 'voice') { const out = file.replace(/ogg$/, 'm4a'); execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-vn', '-c:a', 'aac', '-b:a', '64k', out]); files.push(out); file = out; }
      if (ext === 'mp4') { const s = shrink(file); if (s !== file) { files.push(s); file = s; } }
      const name = `tg-${TG}-${p.id}-${n}.${file.split('.').pop()}`; bytes += fs.statSync(file).size;
      if (DRY) { urls.push('/u/dry.' + name.split('.').pop()); continue; }
      const url = await upload(file, name); urls.push(url);
      if (m.type === 'video' && CLIPS) { const v = probe(file); if (v.dur > 0 && v.dur <= CLIP_MAX) clips.push({ url, name, size: fs.statSync(file).size, ...v }); }   // тот же файл, что и в записи: сервер сотрёт его, только когда он не нужен ни там, ни там
    }
    const rec = { ts: p.ts, clips: [] };
    if (!DRY) {
      rec.post = (await rpc('feed.post', { text: p.text, media: urls, ts: p.ts })).id;
      for (const c of clips) rec.clips.push((await rpc('clip.add', { media: { url: c.url, name: c.name, size: c.size, w: c.w, h: c.h, dur: c.dur }, text: p.text.slice(0, 300), ts: p.ts })).id);
    }
    if (p.big) rec.note = 'без видео: Telegram не отдаёт его в браузер';
    if (!DRY) { state.posts[p.id] = rec; saveState(); }
    console.log(`#${p.id} ${new Date(p.ts).toISOString().slice(0, 10)} ок: текст ${p.text.length}, вложений ${urls.length}, клипов ${clips.length}${p.big ? ', большое видео пропущено' : ''}`);
  } finally { for (const f of files) fs.rmSync(f, { force: true }); }
}

(async () => {
  let before = 0, done = 0, failed = 0, pages = 0;
  while (done < LIMIT && pages < 200) {
    const list = blocks(await getText(`https://t.me/s/${TG}` + (before ? `?before=${before}` : ''))); pages++;
    if (!list.length) break;
    for (const p of list.sort((a, b) => b.id - a.id)) {
      if (state.posts[p.id] || state.skip[p.id]) continue;
      if (done >= LIMIT) break;
      try { await handle(p); done++; } catch (e) { failed++; console.log(`#${p.id} ОШИБКА: ${e.message}`); if (failed > 15) throw new Error('слишком много ошибок подряд, останавливаюсь'); }
    }
    const min = Math.min(...list.map(p => p.id)); if (min <= 1 || (before && min >= before)) break; before = min; await sleep(400);
  }
  console.log(`ГОТОВО: перенесено записей ${Object.keys(state.posts).length}, пропущено ${Object.keys(state.skip).length}, ошибок за запуск ${failed}, файлов за запуск на ${(bytes / 1048576).toFixed(1)} МБ`);
  fs.rmSync(TMP, { recursive: true, force: true }); process.exit(failed ? 1 : 0);
})().catch(e => { console.error('ОСТАНОВКА:', e.message); fs.rmSync(TMP, { recursive: true, force: true }); process.exit(1); });
