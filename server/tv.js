// «Нудист»: телевизор. Двадцать общедоступных федеральных каналов (первый и второй мультиплексы).
// Сами эфиры мы не ретранслируем и адреса потоков не трогаем: открывается официальная страница прямого эфира канала.
// Если сайт канала показывает эфир во вставке на чужой странице — он идёт прямо в приложении; если нет — открывается сайт канала.
// Список «можно во вставке» составлен руками по проверке в браузере 13.11.2026: «Смотрим» (Россия 1, Россия К, Россия 24) и общий плеер
// «Витрина ТВ» (Пятый, ТВ Центр, Домашний, Муз-ТВ) во вставке пишут «смотрите на сайте канала», Первый, Матч, Карусель, ОТР, СТС и ТНТ
// запрещают вставку заголовком. Обходить эти запреты мы не будем. Сервер раз в 12 часов перепроверяет заголовки и может только
// убрать канал из списка «во вставке» (если сайт ввёл запрет), но не добавить.
'use strict';
const R = require('./rpc');
const H = R.H;

// n — кнопка на пульте; frame — показывает ли сайт канала эфир во вставке (проверено в браузере, см. выше)
// lime — адрес канала на limehd.tv («Лайм HD ТВ», легальный онлайн-кинотеатр с эфирами). Сайт запрещает вставку в чужие страницы
// (X-Frame-Options: SAMEORIGIN), поэтому он открывается целиком: во встроенном браузере приложения для Android или в новой вкладке.
const LIME = 'https://limehd.tv/channel/';
const CHANNELS = [
  { n: 1, id: '1tv', lime: '1kanal', name: 'Первый канал', url: 'https://www.1tv.ru/live', frame: false, color: '#1B3A8C' },
  { n: 2, id: 'russia1', lime: 'rossia1', name: 'Россия 1', url: 'https://smotrim.ru/channel/1', frame: false, color: '#C4122F' },
  { n: 3, id: 'match', lime: 'match', name: 'Матч ТВ', url: 'https://matchtv.ru/on-air', frame: false, color: '#E4002B' },
  { n: 4, id: 'ntv', lime: 'ntv', name: 'НТВ', url: 'https://www.ntv.ru/air/', frame: true, color: '#00923F' },
  { n: 5, id: '5tv', lime: '5kanal', name: 'Пятый канал', url: 'https://www.5-tv.ru/live/', frame: false, color: '#F26522' },
  { n: 6, id: 'kultura', lime: 'russiak', name: 'Россия К', url: 'https://smotrim.ru/channel/4', frame: false, color: '#7A1F5C' },
  { n: 7, id: 'russia24', lime: 'rossia24', name: 'Россия 24', url: 'https://smotrim.ru/channel/3', frame: false, color: '#0B4EA2' },
  { n: 8, id: 'karusel', lime: 'karusel', name: 'Карусель', url: 'https://www.karusel-tv.ru/live', frame: false, color: '#F39200' },
  { n: 9, id: 'otr', lime: 'otr', name: 'ОТР', url: 'https://otr-online.ru/online/', frame: false, color: '#5B2D8E' },
  { n: 10, id: 'tvc', lime: 'tvc', name: 'ТВ Центр', url: 'https://www.tvc.ru/live', frame: false, color: '#B8002E' },
  { n: 11, id: 'ren', lime: 'rentv', name: 'РЕН ТВ', url: 'https://ren.tv/live', frame: false, color: '#D4691E' },
  { n: 12, id: 'spas', lime: 'spas', name: 'Спас', url: 'https://spastv.ru/efir/', frame: true, color: '#2E5E8C' },
  { n: 13, id: 'sts', lime: 'sts', name: 'СТС', url: 'https://ctc.ru/online/', frame: false, color: '#E6A400' },
  { n: 14, id: 'dom', lime: 'domashniy', name: 'Домашний', url: 'https://domashniy.ru/online', frame: false, color: '#C2185B' },
  { n: 15, id: 'tv3', lime: 'tv3', name: 'ТВ-3', url: 'https://tv3.ru/live', frame: true, color: '#4A148C' },
  { n: 16, id: 'friday', lime: 'pyatnica', name: 'Пятница!', url: 'https://friday.ru/live', frame: true, color: '#D81B60' },
  { n: 17, id: 'zvezda', lime: 'zvezda', name: 'Звезда', url: 'https://tvzvezda.ru/video', frame: true, color: '#B71C1C' },
  { n: 18, id: 'mir', lime: 'mir', name: 'Мир', url: 'https://mirtv.ru/live/', frame: false, color: '#1565C0' },
  { n: 19, id: 'tnt', lime: 'tnt', name: 'ТНТ', url: 'https://tnt-online.ru/live', frame: false, color: '#E53935' },
  { n: 20, id: 'muz', lime: 'muztv', name: 'Муз-ТВ', url: 'https://muz-tv.ru/online/', frame: false, color: '#00838F' },
];

const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const TTL = 12 * 3600e3, known = new Map();      // id → true/false: что сказал сам сайт
let checkedAt = 0, checking = false;
// Разрешает ли страница показывать себя во вставке на чужом сайте. null — сайт не ответил, вывода нет.
async function framable(url) {
  let r; try { r = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'ru-RU,ru', accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(9000) }); } catch (e) { return null; }
  try { if (r.body) await r.body.cancel(); } catch (e) { /* тело нам не нужно */ }
  if (!r.ok) return null;
  if (r.headers.get('x-frame-options')) return false;      // DENY, SAMEORIGIN и устаревший ALLOW-FROM — для нас всё «нельзя»
  const fa = /frame-ancestors([^;]*)/i.exec(r.headers.get('content-security-policy') || '');
  if (fa && !/(^|\s)(\*|https:)(\s|$)/.test(fa[1])) return false;
  return true;
}
async function recheck() {
  if (checking || process.env.TV_CHECK === 'off') return; checking = true;
  try { await Promise.all(CHANNELS.filter(c => c.frame).map(async c => { const v = await framable(c.url); if (v !== null) known.set(c.id, v); })); checkedAt = Date.now(); } finally { checking = false; }
}
H['tv.list'] = async () => {
  if (!checkedAt) await Promise.race([recheck(), new Promise(r => setTimeout(r, 4000))]).catch(() => {});      // первый раз ждём недолго, дальше обновляем в фоне
  else if (Date.now() - checkedAt > TTL) recheck().catch(() => {});
  return { channels: CHANNELS.map(c => ({ n: c.n, id: c.id, name: c.name, url: c.url, lime: LIME + c.lime, color: c.color, frame: c.frame && known.get(c.id) !== false })) };
};

module.exports = { CHANNELS, framable };
