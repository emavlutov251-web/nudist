'use strict';
// Объектное хранилище с протоколом S3 для файлов (музыка, клипы, вложения): Cloud.ru Object Storage, Yandex, Backblaze B2, MinIO и т. п.
// Включается переменными S3_ENDPOINT, S3_BUCKET, S3_KEY_ID и S3_SECRET. Без зависимостей: подпись запросов (AWS SigV4) считается здесь.
// Файлы идут потоком с диска и на диск, поэтому большой клип не занимает память сервера.
const fs = require('fs');
const https = require('https');
const http = require('http');
const crypto = require('crypto');

const ENDPOINT = (process.env.S3_ENDPOINT || '').replace(/\/+$/, '');
const BUCKET = process.env.S3_BUCKET || '';
const KEY_ID = process.env.S3_KEY_ID || '';
const SECRET = process.env.S3_SECRET || '';
const REGION = process.env.S3_REGION || 'ru-central-1';
const PREFIX = (process.env.S3_PREFIX || 'uploads').replace(/^\/+|\/+$/g, '');
const enabled = !!(ENDPOINT && BUCKET && KEY_ID && SECRET);
const MAX_BYTES = Math.round((Number(process.env.S3_MAX_GB) || 14) * 1024 * 1024 * 1024);   // свой потолок ниже бесплатных 15 ГБ: сверх них хранение платное

const url = enabled ? new URL(ENDPOINT) : null;
const agent = enabled ? new (url.protocol === 'http:' ? http : https).Agent({ keepAlive: true, maxSockets: 16 }) : null;
const sha = d => crypto.createHash('sha256').update(d).digest('hex');
const hmac = (k, d) => crypto.createHmac('sha256', k).update(d).digest();
const enc = s => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
const EMPTY = sha('');

function sign(method, pathname, query, headers, payloadHash) {
  const now = new Date().toISOString().replace(/[-:]|\.\d{3}/g, '');           // 20261112T060000Z
  const day = now.slice(0, 8);
  const h = { host: url.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': now };
  for (const k in headers) h[k.toLowerCase()] = String(headers[k]);
  const names = Object.keys(h).sort();
  const qs = Object.keys(query).sort().map(k => enc(k) + '=' + enc(query[k])).join('&');
  const canonical = [method, pathname, qs, names.map(n => n + ':' + h[n].trim() + '\n').join(''), names.join(';'), payloadHash].join('\n');
  const scope = `${day}/${REGION}/s3/aws4_request`;
  const key = hmac(hmac(hmac(hmac('AWS4' + SECRET, day), REGION), 's3'), 'aws4_request');
  const sig = hmac(key, ['AWS4-HMAC-SHA256', now, scope, sha(canonical)].join('\n')).toString('hex');
  h.authorization = `AWS4-HMAC-SHA256 Credential=${KEY_ID}/${scope}, SignedHeaders=${names.join(';')}, Signature=${sig}`;
  return { headers: h, path: pathname + (qs ? '?' + qs : '') };
}

// Один запрос. body: Buffer | { file, size } | undefined. sink: путь, куда писать успешный ответ (иначе тело возвращается строкой).
function request(method, key, opt = {}) {
  return new Promise((resolve, reject) => {
    const pathname = '/' + enc(BUCKET) + (key ? '/' + key.split('/').map(enc).join('/') : '');
    const body = opt.body, isFile = body && body.file;
    const headers = { ...(opt.headers || {}) };
    if (body) headers['content-length'] = isFile ? body.size : body.length;
    const s = sign(method, pathname, opt.query || {}, headers, opt.hash || (body && !isFile ? sha(body) : EMPTY));
    const req = (url.protocol === 'http:' ? http : https).request({ agent, method, host: url.hostname, port: url.port || undefined, path: s.path, headers: s.headers, timeout: opt.timeout || 120000 }, res => {
      const ok = res.statusCode >= 200 && res.statusCode < 300;
      if (ok && opt.sink) {
        const out = fs.createWriteStream(opt.sink);
        res.pipe(out);
        out.on('finish', () => resolve({ status: res.statusCode, headers: res.headers, text: '' }));
        out.on('error', reject); res.on('error', reject);
        return;
      }
      const parts = []; let n = 0;
      res.on('data', d => { if (n < 1 << 22) { parts.push(d); n += d.length; } });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(parts).toString('utf8') }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('таймаут хранилища')));
    req.on('error', reject);
    if (isFile) { const rs = fs.createReadStream(body.file); rs.on('error', e => req.destroy(e)); rs.pipe(req); }
    else req.end(body || undefined);
  });
}
const fail = (what, r) => new Error(`${what}: HTTP ${r.status} ${(/<Code>([^<]+)/.exec(r.text) || [])[1] || r.text.slice(0, 120)}`);
const fileHash = file => new Promise((resolve, reject) => { const h = crypto.createHash('sha256'); fs.createReadStream(file).on('data', d => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject); });

// ───── учёт занятого места (в памяти; при запуске пересчитывается по списку бакета)
const usage = { bytes: 0, files: 0, known: false, max: MAX_BYTES };
const sizes = new Map();

async function list() {                       // все объекты под PREFIX: [{ name, size }]
  const out = []; let token = '';
  for (;;) {
    const query = { 'list-type': '2', prefix: PREFIX + '/', 'max-keys': '1000' };
    if (token) query['continuation-token'] = token;
    const r = await request('GET', '', { query, timeout: 60000 });
    if (r.status !== 200) throw fail('список файлов', r);
    const re = /<Contents>([\s\S]*?)<\/Contents>/g; let m;
    while ((m = re.exec(r.text))) {
      const k = /<Key>([^<]*)<\/Key>/.exec(m[1]), sz = /<Size>(\d+)<\/Size>/.exec(m[1]);
      if (k) out.push({ name: k[1].slice(PREFIX.length + 1), size: sz ? Number(sz[1]) : 0 });
    }
    const next = /<NextContinuationToken>([^<]+)</.exec(r.text);
    if (!/<IsTruncated>true</.test(r.text) || !next) break;
    token = next[1].replace(/&amp;/g, '&');
  }
  return out;
}
async function init() {
  if (!enabled) return;
  const all = await list();
  sizes.clear(); usage.bytes = 0;
  for (const f of all) { sizes.set(f.name, f.size); usage.bytes += f.size; }
  usage.files = sizes.size; usage.known = true;
  console.log(`[s3] бакет ${BUCKET}: файлов ${usage.files}, занято ${(usage.bytes / 1048576).toFixed(1)} МБ из ${(MAX_BYTES / 1073741824).toFixed(1)} ГБ`);
}
const hasRoom = bytes => !enabled || usage.bytes + bytes <= MAX_BYTES;

async function put(name, file) {
  const size = (await fs.promises.stat(file)).size;
  if (!hasRoom(size - (sizes.get(name) || 0))) { const e = new Error('хранилище заполнено'); e.full = true; throw e; }
  let r;
  for (let i = 0; i < 3; i++) {
    try { r = await request('PUT', PREFIX + '/' + name, { body: { file, size }, hash: await fileHash(file), headers: { 'content-type': 'application/octet-stream' }, timeout: 300000 }); }
    catch (e) { if (i === 2) throw e; await new Promise(z => setTimeout(z, 700 * (i + 1))); continue; }
    if (r.status < 500) break;
  }
  if (r.status !== 200) throw fail('запись файла', r);
  usage.bytes += size - (sizes.get(name) || 0); sizes.set(name, size); usage.files = sizes.size;
}
async function get(name, file) {             // true — скачан в file, false — такого объекта нет
  const tmp = file + '.part';
  const r = await request('GET', PREFIX + '/' + name, { sink: tmp, timeout: 300000 });
  if (r.status === 404 || r.status === 403 && /NoSuchKey/.test(r.text)) return false;
  if (r.status !== 200) throw fail('чтение файла', r);
  await fs.promises.rename(tmp, file);
  return true;
}
async function drop(name) {
  const r = await request('DELETE', PREFIX + '/' + name);
  if (r.status >= 300 && r.status !== 404) throw fail('удаление файла', r);
  if (sizes.has(name)) { usage.bytes -= sizes.get(name); sizes.delete(name); usage.files = sizes.size; }
}
const has = name => sizes.has(name);

module.exports = { enabled, usage, init, list, put, get, drop, has, hasRoom, request, bucket: BUCKET };
