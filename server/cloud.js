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

// Перед стартом: скачать снимок базы на локальный диск. Бросает ошибку, если облако недоступно, —
// запускаться с пустой базой и затереть ею настоящую нельзя.
async function restoreOnce() {
  await ensureBucket();
  const packed = await readRow(ROW);
  if (packed === null) { console.log('[cloud] снимка базы ещё нет — чистый старт'); ready = true; return 'empty'; }
  const text = zlib.gunzipSync(Buffer.from(packed, 'base64')).toString('utf8');
  const data = JSON.parse(text);
  if (!data || typeof data !== 'object' || !data.users) throw new Error('снимок базы не похож на базу');
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(DB_FILE + '.tmp', text); fs.renameSync(DB_FILE + '.tmp', DB_FILE);
  ready = true; status.lastOk = Date.now();
  console.log(`[cloud] база восстановлена: ${Object.keys(data.users).length} пользователей, ${(text.length / 1024).toFixed(0)} КБ`);
  writeRow(`${ROW}-day-${String(new Date().getUTCDate()).padStart(2, '0')}`, packed).catch(e => console.error('[cloud] копия дня не записана:', e.message));
  return 'restored';
}
async function restore() {
  if (!enabled) return 'off';
  let err;
  for (let i = 0; i < 6; i++) {
    try { return await restoreOnce(); } catch (e) { err = e; console.error(`[cloud] попытка ${i + 1}: ${e.message}`); await sleep(1500 * (i + 1)); }
  }
  throw err;
}

// Запись снимка: не чаще раза в PUSH_EVERY, всегда самое свежее состояние, при ошибке — повтор.
async function drain() {
  timer = null;
  if (pushing || pending === null || !ready) return;
  pushing = true;
  const text = pending; pending = null; const t0 = Date.now();
  try {
    const body = await packAsync(text); status.bytes = body.length;
    await writeRow(ROW, body);
    lastPush = Date.now(); pushCost = lastPush - t0; failures = 0; status.lastOk = lastPush; status.lastError = ''; status.pushes++;
  } catch (e) {
    failures++; status.lastError = e.message; if (pending === null) pending = text;
    console.error('[cloud] снимок не записан:', e.message);
  }
  pushing = false;
  if (pending !== null && !timer) timer = setTimeout(drain, failures ? Math.min(60000, 3000 * failures) : pushGap());
}
function queue(text) {
  if (!enabled || !ready) return;
  pending = text;
  if (!timer && !pushing) timer = setTimeout(drain, Math.max(0, pushGap() - (Date.now() - lastPush)));
}
// При остановке: дождаться записи последнего состояния (хостинг даёт на это несколько секунд).
async function final(text, maxMs = 20000) {
  if (!enabled || !ready) return;
  if (timer) { clearTimeout(timer); timer = null; }
  const until = Date.now() + maxMs;
  while (pushing && Date.now() < until) await sleep(100);
  pending = text;
  for (let i = 0; pending !== null && Date.now() < until; i++) {
    if (i) await sleep(1000);
    await drain();
    if (timer) { clearTimeout(timer); timer = null; }
  }
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

module.exports = { enabled, files, status, restore, queue, final, putUpload, getUpload, dropUpload, usage, hasRoom, initFiles };
