'use strict';
// Люди рядом. Осознанное включение: координаты округляются до ~111 м (3 знака), живут 30 минут,
// показываются только тем, кто тоже включил «Я рядом». Точное место никогда не отдаётся, радиус поиска — 50 км.
const C = require('./core');
const R = require('./rpc');
const { db, save, now, fail, need } = C;

const TTL = 30 * 60e3, MAX = 60, MAX_KM = 50;
const num = (v, min, max) => { const n = Number(v); return Number.isFinite(n) && n >= min && n <= max ? n : null; };
const rad = d => d * Math.PI / 180;
function km(a, b) {
  const R_ = 6371, dLa = rad(b.lat - a.lat), dLo = rad(b.lon - a.lon);
  const s = Math.sin(dLa / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLo / 2) ** 2;
  return 2 * R_ * Math.asin(Math.sqrt(s));
}
const H = R.H;
H['near.set'] = (c, p) => {
  const u = db.users[c.uid]; if (!u) fail('Вход не выполнен');
  const lat = num(p.lat, -90, 90), lon = num(p.lon, -180, 180);
  if (lat === null || lon === null) fail('Не пришли координаты');
  u.near = { lat: Math.round(lat * 1000) / 1000, lon: Math.round(lon * 1000) / 1000, ts: now() };
  save(); return { ok: true, until: u.near.ts + TTL };
};
H['near.off'] = c => { const u = db.users[c.uid]; if (u) { delete u.near; save(); } return { ok: true }; };
H['near.list'] = c => {
  const me = db.users[c.uid];
  const mine = me && me.near && now() - me.near.ts < TTL ? me.near : null;
  if (!mine) fail('Сначала включите «Я рядом» — иначе и человеку рядом показываться некому');
  const t = now() - TTL, rows = [];
  for (const u of Object.values(db.users)) {
    if (u.id === c.uid || !u.near || u.near.ts < t || u.deleted || u.bot) continue;
    const d = km(mine, u.near); if (d > MAX_KM) continue;
    rows.push({ u, d: Math.round(d * 10) / 10 });
  }
  rows.sort((a, b) => a.d - b.d);
  const take = rows.slice(0, MAX);
  return { users: take.map(x => C.pubUser(x.u, c.uid)), km: take.map(x => x.d), until: mine.ts + TTL };
};
module.exports = {};
