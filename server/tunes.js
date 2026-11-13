// «Нудист»: музыка из сети. Ничего не копируем к себе — трек играет прямо с сайта, где его выложил автор.
//   • каталог — Openverse (свободные лицензии: Jamendo, Wikimedia Commons), у каждого трека автор, лицензия и ссылка на источник;
//   • радио — Radio Browser, открытый справочник интернет-станций;
//   • Яндекс Музыка — только официальный встраиваемый плеер по ссылке: что и сколько играть, решает сам Яндекс.
'use strict';
const C = require('./core');
const R = require('./rpc');
const Hub = require('./hub');
const { db, save, now, id, need, str, int } = C;
const H = R.H;

const OV = (process.env.OPENVERSE_API || 'https://api.openverse.org/v1').replace(/\/$/, '');
const RADIO = (process.env.RADIO_API || 'https://de1.api.radio-browser.info,https://de2.api.radio-browser.info,https://fi1.api.radio-browser.info').split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean);
const UA = 'NudistMessenger/1.0 (+https://github.com/emavlutov251-web/nudist)';
const fail = msg => { throw new C.PubError(msg); };

// ───── память: одинаковые запросы не ходят в сеть дважды (у Openverse без ключа всего 200 запросов в сутки)
const cache = new Map(), seen = new Map();      // запрос → { t, v };  ключ трека → карточка
const TTL = { ov: 12 * 3600e3, rb: 3600e3 };
const remember = it => { seen.delete(it.key); seen.set(it.key, it); if (seen.size > 4000) seen.delete(seen.keys().next().value); return it; };
async function cached(kind, key, make) {
  const k = kind + '|' + key, hit = cache.get(k);
  if (hit && now() - hit.t < TTL[kind]) return hit.v;
  const v = await make(); cache.set(k, { t: now(), v });
  if (cache.size > 600) cache.delete(cache.keys().next().value);
  return v;
}
async function getJson(url, what) {
  let r; try { r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(12000) }); } catch (e) { fail(`${what} не отвечает. Попробуйте чуть позже.`); }
  if (r.status === 429) fail(`${what} просит передышку: слишком много запросов за сегодня. Попробуйте позже.`);
  if (r.status === 404) return null;
  if (!r.ok) fail(`${what} ответил ошибкой ${r.status}. Попробуйте чуть позже.`);
  try { return await r.json(); } catch (e) { fail(`${what} прислал что-то непонятное.`); }
}
// не чаще запроса в секунду и не больше 150 поисков в сутки на человека
function throttle(u) {
  const t = now(), d = new Date(t).toISOString().slice(0, 10), l = u.lim = u.lim || {};
  if (!l.tunes || l.tunes.d !== d) l.tunes = { d, n: 0, at: 0 };
  need(t - (l.tunes.at || 0) > 900, 'Не так быстро: один поиск в секунду.'); need(l.tunes.n < 150, 'На сегодня поисков хватит. Послушайте то, что уже нашли.');
  l.tunes.at = t; l.tunes.n++;
}
const https = u => typeof u === 'string' && /^https:\/\/[^\s"'<>]{4,600}$/.test(u);

// ───── каталог со свободными лицензиями
const SRC = { jamendo: 'Jamendo', wikimedia_audio: 'Wikimedia Commons', ccmixter: 'ccMixter', freesound: 'Freesound' };
const PLAYABLE = new Set(['mp3', 'mp32', 'ogg', 'oga', 'ogx', 'wav', 'flac', 'm4a', 'aac', 'opus']);
const licName = (l, v) => (l === 'cc0' ? 'CC0' : l === 'pdm' ? 'Общественное достояние' : 'CC ' + String(l || '').toUpperCase() + (v ? ' ' + v : ''));
function ovItem(r) {
  if (!r || r.mature || !https(r.url) || (r.filetype && !PLAYABLE.has(String(r.filetype).toLowerCase()))) return null;
  return remember({ key: 'ov:' + r.id, s: 'ov', title: str(r.title, 120) || 'Без названия', artist: str(r.creator, 120) || 'Неизвестный исполнитель', url: r.url, dur: Math.round((Number(r.duration) || 0) / 1000),
    lic: licName(r.license, r.license_version), licUrl: https(r.license_url) ? r.license_url : undefined, page: https(r.foreign_landing_url) ? r.foreign_landing_url : undefined, from: SRC[r.source] || str(r.source, 40) });
}
const mark = (u, items) => { const mine = new Set(); for (const i of u.music || []) { const t = db.tracks[i]; if (t && t.ext && t.by === u.id) mine.add(t.ext.ref); } return items.map(it => ({ ...it, mine: mine.has(it.key) })); };

H['tunes.find'] = async (c, p) => {
  const u = db.users[c.uid], q = str(p.q, 80).toLowerCase(), page = int(p.page, 1, 12) || 1; need(q.length >= 2, 'Напишите, что искать: жанр, настроение или исполнителя');
  const key = q + '|' + page, k = 'ov|' + key; if (!(cache.has(k) && now() - cache.get(k).t < TTL.ov)) throttle(u);
  const v = await cached('ov', key, async () => {
    const d = await getJson(`${OV}/audio/?` + new URLSearchParams({ q, page: String(page), page_size: '20', category: 'music', filter_dead: 'true' }), 'Каталог');
    return { items: ((d && d.results) || []).map(ovItem).filter(Boolean), more: !!d && page < Math.min(12, d.page_count || 1), total: (d && d.result_count) || 0 };
  });
  return { ...v, items: mark(u, v.items) };
};

// ───── радио
const CODECS = new Set(['MP3', 'AAC', 'AAC+', 'OGG']);
function rbItem(r) {
  const url = r && (r.url_resolved || r.url); if (!r || !https(url) || Number(r.hls) || !CODECS.has(String(r.codec || '').toUpperCase()) || r.lastcheckok === 0) return null;
  const tags = String(r.tags || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 3).join(', ');
  return remember({ key: 'rb:' + r.stationuuid, s: 'rb', title: str(String(r.name || '').replace(/\s+/g, ' '), 100) || 'Радио', artist: [r.countrycode === 'RU' ? 'Россия' : str(r.country, 40), tags].filter(Boolean).join(' · ') || 'Радио', url, dur: 0,
    page: https(r.homepage) ? r.homepage : undefined, from: 'Radio Browser', kbps: int(r.bitrate, 0, 2000) || undefined });
}
async function radio(path) { let last; for (const base of RADIO) { try { return await getJson(base + path, 'Справочник радио'); } catch (e) { last = e; } } throw last; }
H['tunes.radio'] = async (c, p) => {
  const u = db.users[c.uid], q = str(p.q, 60).toLowerCase(), tag = str(p.tag, 30).toLowerCase().replace(/[^a-zа-яё0-9 +\-]/g, ''), world = !!p.world;
  const key = [q, tag, world ? 'w' : 'ru'].join('|'), k = 'rb|' + key; if (!(cache.has(k) && now() - cache.get(k).t < TTL.rb)) throttle(u);
  const v = await cached('rb', key, async () => {
    const a = { limit: '80', order: 'clickcount', reverse: 'true', hidebroken: 'true', is_https: 'true' }; if (q) a.name = q; if (tag) a.tag = tag; if (!world) a.countrycode = 'RU';
    const d = await radio('/json/stations/search?' + new URLSearchParams(a)), out = [], names = new Set();
    for (const r of Array.isArray(d) ? d : []) { const it = rbItem(r); if (!it || names.has(it.title.toLowerCase())) continue; names.add(it.title.toLowerCase()); out.push(it); if (out.length >= 50) break; }
    return { items: out };
  });
  return { items: mark(u, v.items) };
};

// ───── «в мою музыку»: сервер сам спрашивает источник по ключу, так что подсунуть произвольный адрес нельзя
async function resolve(key) {
  if (seen.has(key)) return seen.get(key);
  const m = /^(ov|rb):([0-9a-f-]{36})$/.exec(key); need(m, 'Трек не найден');
  if (m[1] === 'ov') return ovItem(await getJson(`${OV}/audio/${m[2]}/`, 'Каталог'));
  const d = await radio('/json/stations/byuuid/' + m[2]); return rbItem(Array.isArray(d) ? d[0] : null);
}
function keep(u, it, extra) {
  const lib = Hub.cleanLib(u), old = lib.map(i => db.tracks[i]).find(t => t.ext && t.by === u.id && t.ext.ref === it.key); if (old) return Hub.trackView(old, u);
  need(lib.length < Hub.MUSIC_MAX, `В библиотеке уже ${Hub.MUSIC_MAX} треков. Удалите что-нибудь из старого.`);
  const t = { id: id(), by: u.id, title: it.title, artist: it.artist, url: it.url || '', size: 0, dur: it.dur || 0, ts: now(), pub: false, plays: 0,
    ext: { s: it.s, ref: it.key, lic: it.lic, licUrl: it.licUrl, page: it.page, from: it.from, ...extra } };
  db.tracks[t.id] = t; u.music.unshift(t.id); save(); return Hub.trackView(t, u);
}
H['tunes.keep'] = async (c, p) => {
  const u = db.users[c.uid], it = await resolve(str(p.key, 60)); need(it, 'Источник больше не отдаёт этот трек');
  return keep(u, it);
};

// ───── Яндекс Музыка: из ссылки делаем адрес официального плеера; сам звук к нам не попадает
function ymRef(link) {
  let u; try { u = new URL(String(link).trim().replace(/^(?!https?:\/\/)/, 'https://')); } catch (e) { return null; }
  if (!/^music\.yandex\.(ru|com|by|kz|uz)$/.test(u.hostname)) return null;
  const path = u.pathname.replace(/^\/iframe/, ''); let m;
  if ((m = /^\/album\/(\d{1,12})\/track\/(\d{1,12})\/?$/.exec(path))) return { ref: `album/${m[1]}/track/${m[2]}`, kind: 'track' };
  if ((m = /^\/track\/(\d{1,12})\/(\d{1,12})\/?$/.exec(path))) return { ref: `album/${m[2]}/track/${m[1]}`, kind: 'track' };
  if ((m = /^\/track\/(\d{1,12})\/?$/.exec(path))) return { ref: `track/${m[1]}`, kind: 'track' };
  if ((m = /^\/album\/(\d{1,12})\/?$/.exec(path))) return { ref: `album/${m[1]}`, kind: 'album' };
  if ((m = /^\/users\/([\w.\-@]{1,60})\/playlists\/(\d{1,12})\/?$/.exec(path))) return { ref: `playlist/${m[1]}/${m[2]}`, kind: 'list' };
  return null;
}
const YM_NAME = { track: 'Трек', album: 'Альбом', list: 'Плейлист' };
H['tunes.yandex'] = (c, p) => {
  const u = db.users[c.uid], y = ymRef(str(p.link, 400)); need(y, 'Нужна ссылка на трек, альбом или плейлист из Яндекс Музыки: music.yandex.ru/album/…');
  const title = str(p.title, 120) || YM_NAME[y.kind] + ' из Яндекс Музыки';
  return keep(u, { key: 'ym:' + y.ref, s: 'ym', title, artist: 'Яндекс Музыка', url: '', dur: 0, page: 'https://music.yandex.ru/' + (y.kind === 'list' ? y.ref.replace(/^playlist\/([^/]+)\//, 'users/$1/playlists/') : y.ref), from: 'Яндекс Музыка' }, { frame: 'https://music.yandex.ru/iframe/' + y.ref, kind: y.kind });
};

module.exports = { ymRef };
