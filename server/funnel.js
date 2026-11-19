'use strict';
// Воронка привлечения: визит на посадочную (/start) → скачивание APK → открытие в браузере → регистрация → первое сообщение.
// Метки кампаний (utm_source / utm_medium / utm_campaign) и реферальная ссылка (?ref=) приезжают с посадочной;
// регистрация связывает метку с аккаунтом, первое сообщение засчитывается как активация.
// Хранится всё агрегатами в db.funnel: счётчики по кампаниям и по дням, без персональных данных и списков людей.
const C = require('./core');
const { db, save, now, today } = C;
const KEEP_DAYS = 120;

// Метка кампании: только безопасные символы, в нижнем регистре, коротко. Иначе в базу приедет что угодно.
const clean = (v, n = 48) => String(v || '').toLowerCase().replace(/[^a-z0-9_.\-]/g, '').slice(0, n);
function cleanUtm(b) {
  if (!b || typeof b !== 'object') return null;
  const u = { src: clean(b.utm_source), med: clean(b.utm_medium), cam: clean(b.utm_campaign), cnt: clean(b.utm_content) };
  if (!u.src && !u.med && !u.cam && !u.cnt) return null;
  return u;
}
// Короткое имя кампании для отчёта: то, что человек положил в utm_campaign (или источник), иначе «реферал» или «напрямую».
function keyOf(utm, ref) {
  if (utm && (utm.cam || utm.src)) return [utm.src || '—', utm.med || '—', utm.cam || '—'].join(' / ');
  if (ref) return 'реферал';
  return 'напрямую';
}
const EV = { visit: 'visits', apk: 'apk', open: 'open' };
function store() { if (!db.funnel) db.funnel = { camps: {}, days: {} }; return db.funnel; }
function campBucket(k) { const s = store(); return (s.camps[k] = s.camps[k] || { visits: 0, apk: 0, open: 0, regs: 0, acts: 0, refs: 0 }); }
function dayBucket(off = 0) { const s = store(), k = today(now() - off * 864e5); return s.days[k] = s.days[k] || { visits: 0, apk: 0, open: 0, regs: 0, acts: 0 }; }
function prune() {
  const s = store(), keep = new Set(); for (let i = 0; i < KEEP_DAYS; i++) keep.add(today(now() - i * 864e5));
  for (const k of Object.keys(s.days)) if (!keep.has(k)) delete s.days[k];
}
// Одно событие с одного адреса в одну кампанию в течение минуты считается один раз: рекламные счётчики не должны раздуваться двойными тапами.
const seen = new Map();
function track(event, utm, ref, ip) {
  const f = EV[event]; if (!f) return { ok: false };
  const k = keyOf(utm, clean(ref, 32));
  const t = now(), sig = event + '|' + ip + '|' + k, prev = seen.get(sig);
  if (prev && prev > t - 60e3) return { ok: true, dup: true };
  seen.set(sig, t);
  if (seen.size > 8000) for (const [s, ts] of seen) if (ts < t - 120e3) seen.delete(s);
  campBucket(k)[f]++; dayBucket()[f]++;
  if (Math.random() < 0.02) prune();
  save();
  return { ok: true };
}
// Регистрация: привязываем метку к аккаунту (нужна для активации) и пополняем счётчики. refStr — сырой username из ссылки.
function register(u, utm, refStr) {
  if (!u) return;
  const k = keyOf(utm, clean(refStr, 32));
  if (utm) u.utm = utm;
  u.camp = k;
  const c = campBucket(k); c.regs++; if (refStr) c.refs++;
  dayBucket().regs++;
  save();
}
// Активация: первое сообщение человека. Считаем один раз и только у тех, кто пришёл с посадочной с меткой (у аккаунтов без метки кампании нет).
function activate(uid) {
  const u = db.users[uid]; if (!u || u.bot || !u.camp || u.act) return;
  u.act = 1;
  campBucket(u.camp).acts++; dayBucket().acts++;
  save();
}
// Отчёт для админки: воронка за всё время по кампаниям + последние 30 дней по дням + топ приглашающих.
function stats() {
  const s = store();
  const days = []; for (let i = 29; i >= 0; i--) { const d = dayBucket(i); if (i > 0) { /* данные уже лежат в s.days */ } days.push({ d: today(now() - i * 864e5), ...d }); }
  const camps = Object.entries(s.camps).map(([k, v]) => ({ k, ...v, conv: v.visits ? Math.round((v.regs / v.visits) * 1000) / 10 : null }))
    .sort((a, b) => (b.regs - a.regs) || (b.visits - a.visits)).slice(0, 60);
  const tot = camps.reduce((a, c) => ({ visits: a.visits + c.visits, apk: a.apk + c.apk, open: a.open + c.open, regs: a.regs + c.regs, acts: a.acts + c.acts, refs: a.refs + c.refs }), { visits: 0, apk: 0, open: 0, regs: 0, acts: 0, refs: 0 });
  const refs = Object.values(db.users).filter(u => !u.deleted && !u.bot && u.invited).map(u => ({ id: u.id, name: u.name, username: u.username, invited: u.invited | 0 }))
    .sort((a, b) => b.invited - a.invited).slice(0, 10);
  const referred = Object.values(db.users).filter(u => !u.deleted && !u.bot && u.camp === 'реферал').length;
  return { days, camps, totals: tot, referred, refs };
}
module.exports = { track, register, activate, stats, cleanUtm, keyOf };
