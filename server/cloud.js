'use strict';
// Облачное хранилище для хостингов без постоянного диска (Render Free и подобные).
// Включается переменными SUPABASE_URL и SUPABASE_KEY (секретный ключ проекта). Без них модуль ничего не делает.
// База: таблица nudist_state в Postgres (строка «main» — текущий снимок, «main-day-NN» — копия на каждый день месяца).
// Снимок нельзя держать файлом в Storage: его чтение идёт через CDN, и после перезапуска можно получить устаревшую версию.
// Файлы: бакет Storage, uploads/<файл>; имена не повторяются, так что кеш CDN им не вредит. Локальный диск служит кешем.
// Таблицу нужно создать один раз (SQL есть в README), бакет сервер создаёт сам.
// Если заданы переменные S3_* (см. s3.js), файлы хранятся в S3, а Supabase держит только базу.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const S3 = require('./s3');

const BASE = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = process.env.SUPABASE_KEY || '';
const BUCKET = process.env.SUPABASE_BUCKET || 'nudist';
const ROW = process.env.SUPABASE_ROW || 'main';
const TABLE = '/rest/v1/nudist_state';
const enabled = !!(BASE && KEY);
const DATA = process.env.DATA_DIR || path.join(path.resolve(__dirname, '..'), 'data');
const DB_FILE = path.join(DATA, 'db.json');
const PUSH_EVERY = 4000;
// Чем тяжелее снимок, тем реже его отправляем: отправка не должна занимать больше ~1/8 времени.
let pushCost = 0;
const pushGap = () => Math.min(120000, Math.max(PUSH_EVERY, pushCost * 8));

let ready = false;            // снимок прочитан (или его ещё нет) — только после этого можно писать в облако
let pending = null, pushing = false, timer = null, lastPush = 0, failures = 0;
const status = { enabled, lastOk: 0, lastError: '', pushes: 0 };

const sleep = ms => new Promise(r => setTimeout(r, ms));
function call(method, url, opt = {}) {
  return fetch(BASE + url, { method, body: opt.body, headers: { apikey: KEY, authorization: 'Bearer ' + KEY, ...(opt.headers || {}) }, signal: AbortSignal.timeout(opt.timeout || 30000) });
}
async function readRow(id) {             // null — строки нет
  const r = await call('GET', `${TABLE}?id=eq.${encodeURIComponent(id)}&select=data`, { headers: { 'cache-control': 'no-cache' }, timeout: 60000 });
  if (!r.ok) throw new Error(`чтение базы: HTTP ${r.status} ${(await r.text().catch(() => '')).slice(0, 200)}`);
  const rows = await r.json();
  return rows.length ? rows[0].data : null;
}
async function writeRow(id, data) {
  const r = await call('POST', TABLE + '?on_conflict=id', { body: JSON.stringify({ id, data, updated_at: new Date().toISOString() }), headers: { 'content-type': 'application/json', prefer: 'resolution=merge-duplicates,return=minimal' }, timeout: 120000 });
  if (!r.ok) throw new Error(`запись базы: HTTP ${r.status} ${(await r.text().catch(() => '')).slice(0, 200)}`);
}
const pack = text => zlib.gzipSync(text).toString('base64');
const packAsync = text => new Promise((res, rej) => zlib.gzip(text, (e, b) => (e ? rej(e) : res(b.toString('base64')))));
function api(method, p, opt = {}) {
  return fetch(BASE + '/storage/v1' + p, { method, body: opt.body, headers: { apikey: KEY, authorization: 'Bearer ' + KEY, ...(opt.headers || {}) }, signal: AbortSignal.timeout(opt.timeout || 30000) });
}
const obj = name => '/object/' + BUCKET + '/' + name.split('/').map(encodeURIComponent).join('/');
async function missing(r) {            // Supabase отвечает на отсутствующий объект 404 или 400 с кодом внутри
  if (r.status === 404) return true;
  if (r.status !== 400) return false;
  const t = await r.clone().text().catch(() => '');
  return /not.?found|"statusCode":\s*"?404/i.test(t);
}
async function put(name, body, type) {
  const r = await api('POST', obj(name), { body, headers: { 'content-type': type, 'x-upsert': 'true', 'cache-control': 'no-store' }, timeout: 120000 });
  if (!r.ok) throw new Error(`запись ${name}: HTTP ${r.status} ${(await r.text().catch(() => '')).slice(0, 200)}`);
}

async function ensureBucket() {
  const r = await api('GET', '/bucket/' + BUCKET);
  if (r.ok) return;
  if (!(await missing(r))) throw new Error(`бакет: HTTP ${r.status} ${(await r.text().catch(() => '')).slice(0, 200)}`);
  const c = await api('POST', '/bucket', { body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }), headers: { 'content-type': 'application/json' } });
  if (!c.ok && c.status !== 409) throw new Error(`создание бакета: HTTP ${c.status} ${(await c.text().catch(() => '')).slice(0, 200)}`);
  console.log('[cloud] создан бакет', BUCKET);
}

// ───── Вторая, независимая копия базы в S3 (если заданы S3_*): db/<строка>.gz — свежая, обновляется раз в две минуты;
// db/<строка>-ГГГГ-ММ-ДД.gz — копия на каждый день (хранится 35 дней, копии за первое число месяца остаются навсегда).
// Зачем: бесплатный проект Supabase могут приостановить или удалить. Тогда сервер при запуске поднимется из копии в S3
// и продолжит работать на ней, а не остановится навсегда. На своём сервере без Supabase это просто резервная копия вне диска.
const MIRROR = S3.enabled && process.env.DB_MIRROR !== 'off';
const MKEY = 'db/' + ROW;
const mirror = { lastOk: 0, lastError: '', at: 0, day: '', busy: false, primary: false, pending: null, timer: null, pushes: 0, localId: '', remoteId: undefined };      // remoteId: номер базы, чья копия лежит в S3 (undefined — ещё не смотрели, '' — копии нет)
const idOf = data => (data && data.meta && data.meta.dbId) || '';
const setDbId = v => { mirror.localId = v || ''; };
const mirrorGap = () => (mirror.primary ? 45e3 : 120e3);
const dayKey = d => `${MKEY}-${d.toISOString().slice(0, 10)}.gz`;
const gz = text => new Promise((res, rej) => zlib.gzip(text, (e, buf) => (e ? rej(e) : res(buf))));
async function s3put(key, buf) {
  let r, err;
  for (let i = 0; i < 3; i++) {
    try { r = await S3.request('PUT', key, { body: buf, headers: { 'content-type': 'application/gzip' }, timeout: 120000 }); err = null; if (r.status < 500) break; }
    catch (e) { err = e; }
    await sleep(800 * (i + 1));
  }
  if (err) throw err;
  if (r.status !== 200) throw new Error(`копия в S3: HTTP ${r.status} ${r.text.slice(0, 120)}`);
}
async function mirrorRead() {              // текст снимка из S3 или null, если копии ещё нет
  fs.mkdirSync(DATA, { recursive: true });
  const tmp = path.join(DATA, 'mirror.gz.part');
  const r = await S3.request('GET', MKEY + '.gz', { sink: tmp, timeout: 120000 });
  if (r.status === 404 || (r.status === 403 && /NoSuchKey/.test(r.text))) return null;
  if (r.status !== 200) throw new Error(`чтение копии из S3: HTTP ${r.status} ${r.text.slice(0, 120)}`);
  const text = zlib.gunzipSync(fs.readFileSync(tmp)).toString('utf8'); fs.unlink(tmp, () => {});
  return text;
}
async function mirrorDrain() {
  if (mirror.timer) { clearTimeout(mirror.timer); mirror.timer = null; }
  if (mirror.busy || mirror.pending === null) return;
  mirror.busy = true; const text = mirror.pending; mirror.pending = null;
  try {
    if (mirror.remoteId === undefined) { const cur = await mirrorRead(); mirror.remoteId = cur ? idOf(JSON.parse(cur)) : ''; }
    if (mirror.remoteId && mirror.localId && mirror.remoteId !== mirror.localId && process.env.DB_MIRROR !== 'force') {      // в бакете копия другой базы: не затираем
      mirror.lastError = 'в S3 лежит копия другой базы (db/' + ROW + '.gz); чтобы заменить её этой, запустите один раз с DB_MIRROR=force';
      if (!mirror.warned) { mirror.warned = true; console.error('[mirror]', mirror.lastError); }
      mirror.busy = false; return;
    }
    const buf = await gz(text);
    await s3put(MKEY + '.gz', buf);
    const d = new Date(), day = d.toISOString().slice(0, 10);
    if (mirror.day !== day) {
      await s3put(dayKey(d), buf); mirror.day = day;
      const old = new Date(d.getTime() - 36 * 864e5);
      if (old.getUTCDate() !== 1) S3.request('DELETE', dayKey(old)).catch(() => {});      // первое число месяца оставляем как архив
    }
    mirror.at = mirror.lastOk = Date.now(); mirror.lastError = ''; mirror.pushes++; mirror.remoteId = mirror.localId;
  } catch (e) {
    mirror.lastError = e.message; mirror.at = Date.now() - mirrorGap() + 30000; if (mirror.pending === null) mirror.pending = text;
    console.error('[mirror] копия в S3 не записана:', e.message);
  }
  mirror.busy = false;
  if (mirror.pending !== null) mirrorArm();
}
function mirrorArm() { if (!mirror.timer && !mirror.busy) { mirror.timer = setTimeout(mirrorDrain, Math.max(0, mirrorGap() - (Date.now() - mirror.at))); mirror.timer.unref(); } }
function mirrorQueue(text) { if (!MIRROR || !ready) return; mirror.pending = text; mirrorArm(); }
const mirrorStatus = () => (MIRROR ? { ok: !mirror.lastError, savedAgo: mirror.lastOk ? Math.round((Date.now() - mirror.lastOk) / 1000) : null, primary: mirror.primary || undefined } : undefined);

// Перед стартом: скачать снимок базы на локальный диск. Источников два: Supabase (основной) и копия в S3.
// Берётся более свежий (метка meta.savedAt). Если Supabase недоступен, а копия есть — поднимаемся из копии.
// Ошибка бросается, только когда базу взять совсем неоткуда: запускаться с пустой и затереть ею настоящую нельзя.
const stamp = data => (data && data.meta && Number(data.meta.savedAt)) || 0;
const parse = (text, what) => { const data = JSON.parse(text); if (!data || typeof data !== 'object' || !data.users) throw new Error(what + ' не похож(а) на базу'); return data; };
async function readSupabase() {            // { packed, text, data } или null, если строки ещё нет
  await ensureBucket();
  const packed = await readRow(ROW);
  if (packed === null) return null;
  const text = zlib.gunzipSync(Buffer.from(packed, 'base64')).toString('utf8');
  return { packed, text, data: parse(text, 'снимок базы') };
}
async function readMirror() {
  if (!MIRROR) return null;
  try { const text = await mirrorRead(); if (!text) { mirror.remoteId = ''; return null; } const data = parse(text, 'копия в S3'); mirror.remoteId = idOf(data); return { text, data }; }
  catch (e) { mirror.lastError = e.message; console.error('[mirror] копия не прочитана:', e.message); return null; }
}
function adopt(x, from) {
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(DB_FILE + '.tmp', x.text); fs.renameSync(DB_FILE + '.tmp', DB_FILE);
  ready = true; status.lastOk = Date.now();
  console.log(`[cloud] база восстановлена (${from}): ${Object.keys(x.data.users).length} пользователей, ${(x.text.length / 1024).toFixed(0)} КБ`);
}
const dayRow = () => `${ROW}-day-${String(new Date().getUTCDate()).padStart(2, '0')}`;
async function restore() {
  if (!enabled) {                          // свой сервер с диском: копия из S3 нужна, только если диск пуст (новая машина)
    if (MIRROR && !fs.existsSync(DB_FILE) && !fs.existsSync(DB_FILE + '.bak')) { const m = await readMirror(); if (m) adopt(m, 'из копии в S3: на диске базы нет'); }
    ready = true; return 'off';
  }
  let sup, err;
  for (let i = 0; i < 6; i++) {
    try { sup = await readSupabase(); err = null; break; }
    catch (e) { err = e; console.error(`[cloud] попытка ${i + 1}: ${e.message}`); await sleep(1500 * (i + 1)); }
  }
  let mir = await readMirror();
  if (mir && sup && idOf(mir.data) && idOf(sup.data) && idOf(mir.data) !== idOf(sup.data)) {
    console.error('[mirror] в S3 лежит копия другой базы — при запуске она не используется');
    mir = null;
  }
  if (err) {
    if (!mir) throw err;
    mirror.primary = true; status.lastError = err.message;
    adopt(mir, 'из копии в S3, потому что Supabase недоступен: ' + err.message);
    queue(mir.text);                       // как только Supabase оживёт, он получит актуальное состояние
    return 'mirror';
  }
  if (sup === null) {
    if (!mir) { console.log('[cloud] снимка базы ещё нет — чистый старт'); ready = true; return 'empty'; }
    adopt(mir, 'из копии в S3: в Supabase снимка нет'); queue(mir.text);
    return 'mirror';
  }
  if (mir && stamp(mir.data) > stamp(sup.data) + 60000) {
    adopt(mir, `из копии в S3: она новее на ${Math.round((stamp(mir.data) - stamp(sup.data)) / 1000)} с`); queue(mir.text);
    return 'mirror';
  }
  adopt(sup, 'Supabase'); lastBody = sup.packed;
  writeRow(dayRow(), sup.packed).catch(e => console.error('[cloud] копия дня не записана:', e.message));
  if (MIRROR && (!mir || stamp(mir.data) < stamp(sup.data))) mirrorQueue(sup.text);
  return 'restored';
}
// Раз в шесть часов: свежая копия дня в Supabase. Заодно это обращение к проекту, чтобы его не сочли заброшенным.
let lastBody = null;
if (enabled) setInterval(() => {
  if (!ready) return;
  (lastBody ? writeRow(dayRow(), lastBody) : readRow(ROW + '-ping')).catch(e => console.error('[cloud] копия дня не записана:', e.message));
}, 6 * 36e5).unref();

// Запись снимка: не чаще раза в PUSH_EVERY, всегда самое свежее состояние, при ошибке — повтор.
async function drain() {
  timer = null;
  if (pushing || pending === null || !ready) return;
  pushing = true;
  const text = pending; pending = null; const t0 = Date.now();
  try {
    const body = await packAsync(text); status.bytes = body.length;
    await writeRow(ROW, body); lastBody = body;
    lastPush = Date.now(); pushCost = lastPush - t0; failures = 0; status.lastOk = lastPush; status.lastError = ''; status.pushes++;
  } catch (e) {
    failures++; status.lastError = e.message; if (pending === null) pending = text;
    console.error('[cloud] снимок не записан:', e.message);
  }
  pushing = false;
  if (pending !== null && !timer) timer = setTimeout(drain, failures ? Math.min(60000, 3000 * failures) : pushGap());
}
function queue(text) {
  mirrorQueue(text);
  if (!enabled || !ready) return;
  pending = text;
  if (!timer && !pushing) timer = setTimeout(drain, Math.max(0, pushGap() - (Date.now() - lastPush)));
}
// При остановке: дождаться записи последнего состояния (хостинг даёт на это несколько секунд).
async function final(text, maxMs = 20000) {
  if (!ready) return;
  const side = MIRROR ? (async () => { const until = Date.now() + 9000; while (mirror.busy && Date.now() < until) await sleep(100); mirror.pending = text; mirror.at = 0; await Promise.race([mirrorDrain(), sleep(9000)]); })().catch(() => {}) : null;
  if (!enabled) { await side; return; }
  if (timer) { clearTimeout(timer); timer = null; }
  const until = Date.now() + maxMs;
  while (pushing && Date.now() < until) await sleep(100);
  pending = text;
  for (let i = 0; pending !== null && Date.now() < until; i++) {
    if (i) await sleep(1000);
    await drain();
    if (timer) { clearTimeout(timer); timer = null; }
  }
  await side;
}

// Файлы. Если задано S3-хранилище (server/s3.js), файлы живут там, а Supabase остаётся только для базы
// и для старых файлов: их отдаём оттуда и при первом обращении переносим в S3.
const files = enabled || S3.enabled;
async function putUpload(name, file) {
  if (S3.enabled) { await S3.put(name, file); trim(); return; }
  if (!enabled) return;
  await put('uploads/' + name, await fs.promises.readFile(file), 'application/octet-stream');
  trim();
}
const fetching = new Map();
function getUpload(name, file) {          // true — файл скачан в локальный кеш, false — в облаке его нет
  if (!files) return Promise.resolve(false);
  if (fetching.has(name)) return fetching.get(name);
  const p = (async () => {
    if (S3.enabled) {
      try { if (await S3.get(name, file)) { trim(); return true; } }
      catch (e) { console.error('[s3] файл', name, e.message); if (!enabled) return false; }
    }
    if (!enabled) return false;
    const r = await api('GET', obj('uploads/' + name), { timeout: 120000 });
    if (!r.ok) { if (!(await missing(r))) console.error('[cloud] файл', name, 'HTTP', r.status); return false; }
    const tmp = file + '.part';
    await fs.promises.writeFile(tmp, Buffer.from(await r.arrayBuffer()));
    await fs.promises.rename(tmp, file);
    if (S3.enabled) S3.put(name, file).then(() => console.log('[s3] перенесён старый файл', name)).catch(e => console.error('[s3] перенос', name, e.message));
    trim();
    return true;
  })().catch(e => { console.error('[cloud] файл', name, e.message); return false; }).finally(() => fetching.delete(name));
  fetching.set(name, p);
  return p;
}

async function dropUpload(name) {
  if (S3.enabled) { try { await S3.drop(name); } catch (e) { console.error('[s3] файл не удалён:', name, e.message); } }
  if (enabled) { try { await api('DELETE', obj('uploads/' + name)); } catch (e) { console.error('[cloud] файл не удалён:', name, e.message); } }
}

// Локальный диск при облачном хранилище — только кеш. Держим его в пределах CACHE_MB: давно не открывавшиеся файлы удаляем,
// при следующем обращении они снова скачаются из облака. Без облака ничего не трогаем — там диск и есть хранилище.
const CACHE_BYTES = (Number(process.env.CACHE_MB) || 700) * 1024 * 1024;
const UP_DIR = path.join(DATA, 'uploads');
let trimTimer = null;
function trim() {
  if (!files || trimTimer) return;
  trimTimer = setTimeout(async () => {
    trimTimer = null;
    try {
      const list = [];
      let total = 0;
      for (const f of await fs.promises.readdir(UP_DIR)) {
        if (f.endsWith('.part') || fetching.has(f)) continue;
        const st = await fs.promises.stat(path.join(UP_DIR, f)).catch(() => null);
        if (!st || !st.isFile()) continue;
        list.push({ f, size: st.size, at: Math.max(st.atimeMs, st.mtimeMs) }); total += st.size;
      }
      if (total <= CACHE_BYTES) return;
      list.sort((a, b) => a.at - b.at);
      const fresh = Date.now() - 120000;          // только что загруженный файл может ещё отправляться в облако
      for (const x of list) {
        if (total <= CACHE_BYTES * 0.8) break;
        if (x.at > fresh) continue;
        if (S3.enabled && S3.usage.known && !S3.has(x.f) && !enabled) continue;   // в облаке его нет — единственная копия
        await fs.promises.unlink(path.join(UP_DIR, x.f)).catch(() => {});
        total -= x.size;
      }
    } catch (e) { console.error('[cloud] чистка кеша:', e.message); }
  }, 5000);
  trimTimer.unref();
}

// Занятое место в хранилище файлов (для /api/health и админки). null — облака для файлов нет.
function usage() {
  if (S3.enabled) return { kind: 's3', bytes: S3.usage.bytes, files: S3.usage.files, max: S3.usage.max, known: S3.usage.known };
  return null;
}
const hasRoom = bytes => S3.hasRoom(bytes);
let initTries = 0;
async function initFiles() {              // подсчёт занятого места; при неудаче повторяем, сервер при этом работает
  if (!S3.enabled) return;
  try { await S3.init(); trim(); }
  catch (e) { const wait = Math.min(300, 15 * 2 ** initTries++); console.error('[s3]', e.message, `— повтор через ${wait} с`); setTimeout(initFiles, wait * 1000).unref(); }
}

module.exports = { enabled, files, status, mirrorStatus, setDbId, restore, queue, final, putUpload, getUpload, dropUpload, usage, hasRoom, initFiles };
