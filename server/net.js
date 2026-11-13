'use strict';
// Исходящие HTTP-запросы с защитой от SSRF: превью ссылок, вебхуки ботов, RSS.
const http = require('http'), https = require('https'), dns = require('dns'), net = require('net');

function isPrivate(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const s = ip.toLowerCase();
  if (s.startsWith('::ffff:')) return isPrivate(s.slice(7));
  return s === '::' || s === '::1' || s.startsWith('fc') || s.startsWith('fd') || s.startsWith('fe8') || s.startsWith('fe9') || s.startsWith('fea') || s.startsWith('feb');
}
const ALLOW_PRIVATE = process.env.ALLOW_PRIVATE_FETCH === '1';

function once(url, o) {
  return new Promise((resolve, reject) => {
    let u; try { u = new URL(url); } catch (e) { return reject(new Error('bad url')); }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return reject(new Error('bad protocol'));
    dns.lookup(u.hostname, { all: true }, (err, addrs) => {
      if (err || !addrs.length) return reject(new Error('dns'));
      if (!ALLOW_PRIVATE && addrs.some(a => isPrivate(a.address))) return reject(new Error('private address'));
      const pin = addrs[0];
      const mod = u.protocol === 'https:' ? https : http;
      const req = mod.request(u, { method: o.method || 'GET', headers: { 'user-agent': 'NudistBot/1.0 (+link preview)', accept: o.accept || '*/*', ...(o.headers || {}) }, timeout: o.timeout || 6000,
        lookup: (h, opts, cb) => (opts && opts.all ? cb(null, [{ address: pin.address, family: pin.family }]) : cb(null, pin.address, pin.family)) }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); return resolve({ redirect: new URL(res.headers.location, u).href }); }
        const chunks = []; let size = 0; const max = o.max || 400000;
        res.on('data', d => { size += d.length; if (size > max) { res.destroy(); resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks), url }); } else chunks.push(d); });
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks), url }));
        res.on('error', reject);
      });
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', reject);
      if (o.body) req.write(o.body);
      req.end();
    });
  });
}
async function safeFetch(url, o = {}) {
  for (let i = 0; i < 4; i++) {
    const r = await once(url, o);
    if (!r.redirect) return r;
    url = r.redirect; if (o.method && o.method !== 'GET') throw new Error('redirect on non-GET');
  }
  throw new Error('too many redirects');
}
function decode(buf, ct = '') {
  let cs = (ct.match(/charset=([\w-]+)/i) || [])[1];
  if (!cs) cs = (buf.slice(0, 2048).toString('latin1').match(/charset=["']?([\w-]+)/i) || [])[1];
  try { return new TextDecoder(cs || 'utf-8').decode(buf); } catch (e) { return buf.toString('utf8'); }
}
const ent = s => s.replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos|nbsp|laquo|raquo|mdash|ndash);/gi, (m, e) => {
  e = e.toLowerCase();
  if (e[0] === '#') { const n = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return n > 0 && n < 0x10ffff ? String.fromCodePoint(n) : ''; }
  return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', mdash: '—', ndash: '–' }[e];
});
const strip = s => ent(String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

async function linkPreview(url) {
  const r = await safeFetch(url, { accept: 'text/html', max: 300000 });
  if (r.status !== 200 || !/html/i.test(r.headers['content-type'] || '')) return null;
  const html = decode(r.body, r.headers['content-type']);
  const meta = n => { const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${n}["'][^>]*content=["']([^"']*)["']`, 'i')) || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${n}["']`, 'i')); return m ? strip(m[1]) : ''; };
  const title = meta('og:title') || strip((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
  if (!title) return null;
  let img = meta('og:image'); if (img) { try { img = new URL(img, r.url).href; if (!/^https:/.test(img)) img = ''; } catch (e) { img = ''; } }
  return { url, title: title.slice(0, 200), desc: (meta('og:description') || meta('description')).slice(0, 300), img: img || undefined, site: meta('og:site_name').slice(0, 60) || new URL(r.url).hostname.replace(/^www\./, '') };
}
// Ссылку на канал YouTube превращаем в его ленту: у каждого канала есть открытая лента последних видео.
// Понимаем youtube.com/channel/UC…, youtube.com/@имя, /c/имя и /user/имя; остальные адреса возвращаем как есть.
async function feedUrl(url) {
  let u; try { u = new URL(url); } catch (e) { return url; }
  if (!/(^|\.)youtube\.com$/i.test(u.hostname) || u.pathname.startsWith('/feeds/')) return url;
  const feed = id => 'https://www.youtube.com/feeds/videos.xml?channel_id=' + id;
  const direct = u.pathname.match(/^\/channel\/(UC[\w-]{22})/); if (direct) return feed(direct[1]);
  if (!/^\/(@[^/]+|c\/[^/]+|user\/[^/]+)/.test(u.pathname)) throw new Error('Нужна ссылка на канал YouTube: youtube.com/@имя или youtube.com/channel/UC…');
  const r = await safeFetch('https://www.youtube.com' + u.pathname.match(/^\/(@[^/]+|c\/[^/]+|user\/[^/]+)/)[0], { accept: 'text/html', max: 1500000 });
  const html = r.status === 200 ? decode(r.body, r.headers['content-type']) : '';
  const m = html.match(/feeds\/videos\.xml\?channel_id=(UC[\w-]{22})/) || html.match(/youtube\.com\/channel\/(UC[\w-]{22})/) || html.match(/"(?:externalId|channelId)":"(UC[\w-]{22})"/);
  if (!m) throw new Error('Не удалось узнать номер канала YouTube. Вставьте ссылку вида youtube.com/channel/UC…');
  return feed(m[1]);
}
async function rssItems(url) {
  const r = await safeFetch(url, { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml', max: 600000 });
  if (r.status !== 200) throw new Error('HTTP ' + r.status);
  const xml = decode(r.body, r.headers['content-type']);
  const items = [];
  for (const m of xml.matchAll(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi)) {
    const b = m[0];
    const title = strip((b.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
    const link = strip((b.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1]) || ((b.match(/<link[^>]+href=["']([^"']+)["']/i) || [])[1] || '');
    const guid = strip((b.match(/<(?:guid|id)[^>]*>([\s\S]*?)<\/(?:guid|id)>/i) || [])[1]) || link || title;
    if (title && /^https?:\/\//.test(link)) items.push({ title: title.slice(0, 300), link, guid });
  }
  return items;
}
module.exports = { safeFetch, linkPreview, rssItems, feedUrl, isPrivate };
