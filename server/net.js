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
const ent = s => s.replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos|nbsp|laquo|raquo|mdash|ndash|hellip|bdquo|ldquo|rdquo|lsquo|rsquo|shy|minus|times|thinsp|ensp|emsp|copy|deg|euro);/gi, (m, e) => {
  e = e.toLowerCase();
  if (e[0] === '#') { const n = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return n > 0 && n < 0x10ffff ? String.fromCodePoint(n) : ''; }
  return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', mdash: '—', ndash: '–', hellip: '…', bdquo: '„', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', shy: '', minus: '−', times: '×', thinsp: ' ', ensp: ' ', emsp: ' ', copy: '©', deg: '°', euro: '€' }[e];
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
// Текст записи из ленты: разметку сайта превращаем в простой текст с абзацами, списками, цитатами и жирными подзаголовками.
// Берём только то, что издание само положило в ленту, — страницу статьи не открываем и не переписываем.
function htmlText(src) {
  let s = String(src || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  if (!/<[a-z!/]/i.test(s) && /&lt;\/?[a-z]/i.test(s)) s = ent(s);      // разметка, спрятанная в &lt;p&gt;
  const inner = t => t.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  s = s.replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|figcaption|iframe|svg|noscript|form|button|video|audio|picture)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, (m, t) => { t = inner(t).replace(/\*/g, ''); return t ? `\n\n**${t}**\n\n` : '\n\n'; })
    .replace(/<(?:strong|b)\b[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi, (m, t) => { const x = inner(t); return x && !/[*<]/.test(x) && x.length < 300 ? `${/^\s/.test(t) ? ' ' : ''}**${x}**${/\s$/.test(t) ? ' ' : ''}` : t; })
    .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (m, t) => { const x = inner(t.replace(/<\/p>|<br\s*\/?>/gi, ' ')); return x ? `\n\n> ${x}\n\n` : '\n\n'; })
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|ul|ol|figure|section|article|tr|table|header|footer)>/gi, '\n\n')
    .replace(/<[^>]+>/g, '');
  s = ent(s).replace(/\]\]>|<!\[CDATA\[/g, ' ').replace(/[ \t\u00a0\u2028]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').replace(/\*\*\s*\*\*/g, ' ').replace(/(^|\n)Блок поддержки(?=\n|$)/g, '$1').replace(/\n{3,}/g, '\n\n').trim();
  if (!s.includes('\n\n') && s.includes('\n')) s = s.replace(/\n(?!• )/g, '\n\n');      // абзацы через одиночный перенос — раздвигаем
  return s.replace(/\n*(?:The post .{0,300} appeared first on .{0,120}|Запись .{0,300} впервые появилась .{0,120}|Сообщение .{0,300} появились сначала на .{0,120})\.?\s*$/i, '').replace(/\n*(?:Читать (?:далее|дальше|полностью)|Read more|Continue reading)[^\n]{0,80}$/i, '').trim();
}
const tagBody = (b, name) => { const m = b.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i')); return m ? m[1] : ''; };
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
    if (!title || !/^https?:\/\//.test(link)) continue;
    // текст: самый полный из того, что есть в ленте (content:encoded, content, description, summary)
    let body = ''; for (const n of ['content:encoded', 'content', 'description', 'summary', 'media:description']) { const t = htmlText(tagBody(b, n)); if (t.length > body.length) body = t; }
    if (body.toLowerCase().startsWith(title.toLowerCase())) body = body.slice(title.length).replace(/^[\s.:—-]+/, '');
    const raw = ent(b.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1'));
    const img = ((b.match(/<enclosure[^>]+url=["'](https:\/\/[^"']+)["'][^>]*type=["']image\//i) || b.match(/<enclosure[^>]+type=["']image\/[^>]+url=["'](https:\/\/[^"']+)["']/i) || b.match(/<media:(?:content|thumbnail)[^>]+url=["'](https:\/\/[^"']+\.(?:jpe?g|png|webp)[^"']*)["']/i) || raw.match(/<img[^>]+src=["'](https:\/\/[^"']+)["']/i) || [])[1] || '').replace(/&amp;/g, '&');
    const when = Date.parse(strip((b.match(/<(?:published|pubDate|dc:date|updated)[^>]*>([\s\S]*?)<\/(?:published|pubDate|dc:date|updated)>/i) || [])[1]));
    const author = strip((b.match(/<author[^>]*>\s*<name[^>]*>([\s\S]*?)<\/name>/i) || b.match(/<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/i) || [])[1]).slice(0, 80);
    items.push({ title: title.slice(0, 300), link, guid, body, img: img.length < 500 ? img : '', ts: when > 0 ? when : 0, author });
  }
  return items;
}
// Запасной путь для YouTube: его RSS-ленты временами отдают 404/500 сразу по всем каналам.
// Тогда читаем открытую страницу вкладки канала (/videos, /streams, /shorts) и берём из неё те же сведения, что были бы в ленте.
const YT_AGO = [[/^секунд/, 1e3], [/^минут/, 6e4], [/^час/, 36e5], [/^(дн|день)/, 864e5], [/^недел/, 6048e5], [/^месяц/, 2592e6], [/^(год|лет)/, 31536e6]];
function ytAgo(label) {
  const m = String(label || '').toLowerCase().match(/(\d+)\s+([а-яё]+)\s+назад/); if (!m) return 0;
  const u = YT_AGO.find(([re]) => re.test(m[2])); return u ? Date.now() - m[1] * u[1] : 0;
}
const walk = (o, key, out) => { if (Array.isArray(o)) for (const v of o) walk(v, key, out); else if (o && typeof o === 'object') for (const k in o) { if (k === key) out.push(o[k]); else walk(o[k], key, out); } return out; };
async function ytTab(id, tab) {
  const r = await safeFetch(`https://www.youtube.com/channel/${id}/${tab}`, { accept: 'text/html', max: 4000000, timeout: 15000,
    headers: { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', 'accept-language': 'ru', cookie: 'SOCS=CAI; CONSENT=YES+1' } });
  if (r.status !== 200) throw new Error('HTTP ' + r.status);
  const m = decode(r.body, r.headers['content-type']).match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/); if (!m) throw new Error('страница канала YouTube не прочиталась');
  let d; try { d = JSON.parse(m[1]); } catch (e) { throw new Error('страница канала YouTube не прочиталась'); }
  const author = String(((walk(d.metadata || {}, 'channelMetadataRenderer', [])[0] || {}).title) || '').slice(0, 80), items = [];
  // открыта ли именно та вкладка, что просили: у канала без неё YouTube молча показывает главную
  const sel = walk(d.contents || {}, 'tabRenderer', []).find(t => t.selected); if (!sel || !new RegExp('/' + tab + '$').test(((sel.endpoint || {}).commandMetadata || {}).webCommandMetadata ? sel.endpoint.commandMetadata.webCommandMetadata.url || '' : '')) return items;
  if (tab === 'shorts') {
    for (const o of walk(sel, 'shortsLockupViewModel', [])) {
      const vid = (walk(o.onTap || {}, 'reelWatchEndpoint', [])[0] || {}).videoId, title = (((o.overlayMetadata || {}).primaryText || {}).content || '').trim();
      if (/^[\w-]{11}$/.test(vid || '') && title) items.push({ title: title.slice(0, 300), link: 'https://www.youtube.com/shorts/' + vid, guid: 'yt:video:' + vid, body: '', img: '', ts: 0, author });
    }
    return items;
  }
  for (const o of walk(sel, 'lockupViewModel', [])) {
    const vid = o.contentId, md = (o.metadata || {}).lockupMetadataViewModel || {}, title = ((md.title || {}).content || '').trim();
    if (o.contentType !== 'LOCKUP_CONTENT_TYPE_VIDEO' || !/^[\w-]{11}$/.test(vid || '') || !title) continue;
    let ts = 0; for (const row of walk(md, 'metadataParts', [])) for (const p of row) ts = ts || ytAgo(p.accessibilityLabel) || ytAgo(((p.text || {}).content || '').replace(/(\d+)\s+ч\b/, '$1 час').replace(/(\d+)\s+мин\.?/, '$1 минут').replace(/(\d+)\s+дн\.?/, '$1 дн').replace(/(\d+)\s+нед\.?/, '$1 недел').replace(/(\d+)\s+мес\.?/, '$1 месяц').replace(/(\d+)\s+(г|л)\./, '$1 лет'));
    // без «… назад» запись либо идёт в эфире прямо сейчас, либо только запланирована — запланированные пропускаем до начала
    if (!ts) { if (walk(o.contentImage || {}, 'thumbnailBadgeViewModel', []).some(b => /LIVE/.test(b.badgeStyle || ''))) ts = Date.now(); else continue; }
    items.push({ title: title.slice(0, 300), link: 'https://www.youtube.com/watch?v=' + vid, guid: 'yt:video:' + vid, body: '', img: '', ts, author });
  }
  return items;
}
module.exports = { safeFetch, linkPreview, rssItems, feedUrl, htmlText, isPrivate, ytTab, ytAgo };
