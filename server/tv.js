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

// abroad — эфир на сайте канала шёл и при заходе не из России (проверено 13.11.2026): клиент помечает такие каналы, когда у человека включён VPN
// n — кнопка на пульте; frame — показывает ли сайт канала эфир во вставке (проверено в браузере, см. выше)
// lime — адрес канала на limehd.tv («Лайм HD ТВ», легальный онлайн-кинотеатр с эфирами). Сайт запрещает вставку в чужие страницы
// (X-Frame-Options: SAMEORIGIN), поэтому он открывается целиком: во встроенном браузере приложения для Android или в новой вкладке.
// rt — прямой эфир канала на Rutube (раздел «ТВ онлайн», rutube.ru/feeds/live): эфир выложен там самим каналом, страница открывается как есть.
//   Номера эфиров постоянные, взяты из открытого списка Rutube 13.11.2026. У РЕН ТВ, Домашнего и Карусели эфира на Rutube нет — для них остаётся сайт канала.
//   rtFrame — Rutube разрешает показывать этот эфир во вставке на чужом сайте (проверено в браузере: Пятый, Россия К, ОТР, Спас, Звезда).
//     Первый отвечает во вставке «Видео можно посмотреть только на RUTUBE», остальные — «недоступно»; такие открываем страницей Rutube, запрет не обходим.
//   rtAbroad — страница эфира показывала и при заходе не из России (то есть и с VPN), проверено 13.11.2026.
const RT = 'https://rutube.ru/live/video/', RT_EMBED = 'https://rutube.ru/play/embed/';
const LIME = 'https://limehd.tv/channel/';
const CHANNELS = [
  { n: 1, id: '1tv', rt: 'c58f502c7bb34a8fcdd976b221fca292', rtAbroad: true, lime: '1kanal', name: 'Первый канал', url: 'https://www.1tv.ru/live', frame: false, color: '#1B3A8C' },
  { n: 2, id: 'russia1', rt: '2742a3c42be661ea732705f80adb7bdd', rtAbroad: true, lime: 'rossia1', name: 'Россия 1', url: 'https://smotrim.ru/channel/1', frame: false, color: '#C4122F' },
  { n: 3, id: 'match', rt: '11bbbec75a2ceb8cf446ad16813c6eec', lime: 'match', name: 'Матч ТВ', url: 'https://matchtv.ru/on-air', frame: false, color: '#E4002B' },
  { n: 4, id: 'ntv', rt: 'c37cd74192c6bc3d6cd6077c0c4fd686', rtAbroad: true, abroad: true, lime: 'ntv', name: 'НТВ', url: 'https://www.ntv.ru/air/', frame: true, color: '#00923F' },
  { n: 5, id: '5tv', rt: 'ac99df0130b4620480528efc6aa22ad6', rtFrame: true, rtAbroad: true, lime: '5kanal', name: 'Пятый канал', url: 'https://www.5-tv.ru/live/', frame: false, color: '#F26522' },
  { n: 6, id: 'kultura', rt: 'd0c0d69362edfbe706cb82d973439bb5', rtFrame: true, rtAbroad: true, lime: 'russiak', name: 'Россия К', url: 'https://smotrim.ru/channel/4', frame: false, color: '#7A1F5C' },
  { n: 7, id: 'russia24', rt: 'ad6ba2e9e587406b29978b861b7b7dd1', lime: 'rossia24', name: 'Россия 24', url: 'https://smotrim.ru/channel/3', frame: false, color: '#0B4EA2' },
  { n: 8, id: 'karusel', lime: 'karusel', name: 'Карусель', url: 'https://www.karusel-tv.ru/live', frame: false, color: '#F39200' },
  { n: 9, id: 'otr', rt: 'faa934385b83f9e8a92f5484defae5fa', rtFrame: true, rtAbroad: true, lime: 'otr', name: 'ОТР', url: 'https://otr-online.ru/online/', frame: false, color: '#5B2D8E' },
  { n: 10, id: 'tvc', rt: '7015ad3690d4ef70d75a6e26d0e58565', lime: 'tvc', name: 'ТВ Центр', url: 'https://www.tvc.ru/live', frame: false, color: '#B8002E' },
  { n: 11, id: 'ren', lime: 'rentv', name: 'РЕН ТВ', url: 'https://ren.tv/live', frame: false, color: '#D4691E' },
  { n: 12, id: 'spas', rt: '2bbfa9ebf9d79ade480d7281fcef1008', rtFrame: true, rtAbroad: true, abroad: true, lime: 'spas', name: 'Спас', url: 'https://spastv.ru/efir/', frame: true, color: '#2E5E8C' },
  { n: 13, id: 'sts', rt: '895f3379ab9fee679eb088215263b8d7', lime: 'sts', name: 'СТС', url: 'https://ctc.ru/online/', frame: false, color: '#E6A400' },
  { n: 14, id: 'dom', lime: 'domashniy', name: 'Домашний', url: 'https://domashniy.ru/online', frame: false, color: '#C2185B' },
  { n: 15, id: 'tv3', rt: '7bf12d9c050f9a7ef3728db5730432ae', lime: 'tv3', name: 'ТВ-3', url: 'https://tv3.ru/live', frame: true, color: '#4A148C' },
  { n: 16, id: 'friday', rt: '9f87a9a0cecbe773be6fddcbd93585ac', lime: 'pyatnica', name: 'Пятница!', url: 'https://friday.ru/live', frame: true, color: '#D81B60' },
  { n: 17, id: 'zvezda', rt: '5ab908fccfac5bb43ef2b1e4182256b0', rtFrame: true, rtAbroad: true, abroad: true, lime: 'zvezda', name: 'Звезда', url: 'https://tvzvezda.ru/video', frame: true, color: '#B71C1C' },
  { n: 18, id: 'mir', rt: 'afef67d151b5a607dee1ef0aa299a52c', lime: 'mir', name: 'Мир', url: 'https://mirtv.ru/live/', frame: false, color: '#1565C0' },
  { n: 19, id: 'tnt', rt: '546602986e6a424d74d594876ddb3f04', lime: 'tnt', name: 'ТНТ', url: 'https://tnt-online.ru/live', frame: false, color: '#E53935' },
  { n: 20, id: 'muz', rt: 'df6fe73494a26f74da51573fd97b9baa', lime: 'muztv', name: 'Муз-ТВ', url: 'https://muz-tv.ru/online/', frame: false, color: '#00838F' },
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
  return { channels: CHANNELS.map(c => ({ n: c.n, id: c.id, name: c.name, url: c.url, lime: LIME + c.lime, color: c.color, frame: c.frame && known.get(c.id) !== false, abroad: !!c.abroad,
    rt: c.rt ? RT + c.rt + '/' : '', rtEmbed: c.rt && c.rtFrame ? RT_EMBED + c.rt : '', rtAbroad: !!c.rtAbroad })) };
};

module.exports = { CHANNELS, framable };
