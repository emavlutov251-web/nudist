'use strict';
// Push в Android-приложение через FCM HTTP v1. Включается переменной FCM_SERVICE_ACCOUNT:
//   - содержимое JSON сервисного аккаунта Firebase целиком (в одну строку), либо
//   - путь к файлу с этим JSON.
// Если переменной нет — модуль молчит, и в панели так и написано. На iOS push не ходит вовсе (APNs требует отдельного сертификата).
const crypto = require('crypto');
const fs = require('fs');
const C = require('./core');
const R = require('./rpc');
const { db, save, now, need, str } = C;
const H = R.H;

function sa() {
  const raw = process.env.FCM_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    const direct = raw.trim();
    const s = direct.startsWith('{') ? direct : fs.readFileSync(direct, 'utf8');
    const j = JSON.parse(s);
    return j && j.project_id && j.private_key && j.client_email ? j : null;
  } catch (e) { console.warn('[fcm] FCM_SERVICE_ACCOUNT повреждён:', e.message); return null; }
}
const on = () => !!sa();

const cache = { at: 0, token: '' };
async function accessToken() {
  if (cache.token && now() - cache.at < 50 * 60e3) return cache.token;
  const a = sa();
  if (!a) throw new Error('FCM не настроен');
  const iat = Math.floor(Date.now() / 1000), exp = iat + 3600;
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = b64({ alg: 'RS256', typ: 'JWT' });
  const body = b64({ iss: a.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat, exp });
  const sign = crypto.createSign('RSA-SHA256').update(head + '.' + body).end();
  const jwt = head + '.' + body + '.' + sign.sign(a.private_key, 'base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=' + jwt, signal: AbortSignal.timeout(15000) });
  const j = await r.json().catch(() => null);
  if (!j || !j.access_token) throw new Error('FCM: не выдан access token');
  cache.at = now(); cache.token = j.access_token;
  return j.access_token;
}

// Отправка на все FCM-токены человека. Токены, которые служба отвергла (UNREGISTERED), выкидываем сразу.
async function send(u, { title, body, url, tag }) {
  const a = sa(); if (!a || !u || u.deleted) return 0;
  const tokens = (u.fcm || []).slice(); if (!tokens.length) return 0;
  const tok = await accessToken(), api = 'https://fcm.googleapis.com/v1/projects/' + a.project_id + '/messages:send';
  let sent = 0;
  for (const t of tokens) {
    const payload = { message: { token: t, notification: { title: String(title || 'Нудист').slice(0, 60), body: String(body || '').slice(0, 200) }, data: { url: url || '/', tag: String(tag || '') }, android: { priority: 'high' } } };
    try {
      const r = await fetch(api, { method: 'POST', headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15000) });
      if (r.ok) { sent++; continue; }
      const j = await r.json().catch(() => null), det = j && j.error && Array.isArray(j.error.details) ? j.error.details.map(d => d.errorCode).join(',') : '';
      if (r.status === 404 || /UNREGISTERED|NOT_FOUND/.test(det)) { u.fcm = (u.fcm || []).filter(x => x !== t); save(); }
      else console.warn('[fcm] ответ', r.status, det || JSON.stringify(j).slice(0, 200));
    } catch (e) { console.warn('[fcm] отправка:', e.message); }
  }
  return sent;
}

H['fcm.register'] = (c, p) => {
  const t = str(p.token, 300); need(t && /^[\w:%.-]{20,}$/.test(t), 'Некорректный FCM-токен');
  const u = db.users[c.uid]; u.fcm = [t, ...(u.fcm || []).filter(x => x !== t)].slice(0, 5);
  save(); return { devices: u.fcm.length, active: on() };
};
H['fcm.unregister'] = (c, p) => {
  const t = str(p.token, 300), u = db.users[c.uid]; u.fcm = (u.fcm || []).filter(x => x !== t); save(); return { devices: u.fcm.length };
};

module.exports = { on, send };
