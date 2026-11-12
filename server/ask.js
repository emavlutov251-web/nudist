'use strict';
// «Голая правда»: анонимные вопросы по личной ссылке /q/<username>.
// Спрашивающему не нужен аккаунт; вопрос приходит получателю в чат с ботом @pravda.
// Сервер не хранит ни IP, ни имя спросившего — только солёный отпечаток, чтобы получатель мог запретить этому отправителю писать.
const crypto = require('crypto');
const C = require('./core');
const A = require('./auth');
const R = require('./rpc');
const { db, save, need, str, now } = C;
const H = R.H;

const BOT = 'pravda', MAX = 500, RECENT = 30, BLOCK_MAX = 300;
const bot = () => db.users[C.byName.get(BOT)];
const salt = () => db.meta.askSalt || (db.meta.askSalt = crypto.randomBytes(18).toString('hex'));
const srcOf = ip => crypto.createHmac('sha256', salt()).update(String(ip || '?')).digest('base64url').slice(0, 16);
const clean = t => String(t || '').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').replace(/(?:https?:\/\/|www\.)\S+/gi, '[ссылка скрыта]').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX);

function target(name) {
  const u = db.users[C.byName.get(String(name || '').replace(/^@/, '').toLowerCase())];
  need(u && !u.bot && !u.deleted && !u.banned, 'Такого человека здесь нет. Проверьте ссылку.');
  return u;
}
// Что видит гость на странице /q/<username>: имя и аватар (если владелец не скрыл его от всех) и принимает ли он вопросы.
function info(name, ip) {
  A.limit('askinfo:' + ip, 90, 60e3);
  const u = target(name), p = C.pubUser(u, null);
  return { username: u.username, name: [u.name, u.last].filter(Boolean).join(' '), avatar: p.avatar || undefined, color: u.color || 0, open: !u.askOff };
}
function send(b, ip) {
  const u = target(b && b.to);
  need(!u.askOff, 'Этот человек сейчас не принимает анонимные вопросы.');
  const text = clean(b.text);
  need(text.length >= 2, 'Напишите хотя бы пару слов.');
  A.limit('ask:' + ip, 6, 600e3);            // один отправитель: 6 вопросов за 10 минут…
  A.limit('askh:' + ip, 25, 3600e3);         // …и 25 за час
  A.limit('askto:' + u.id, 120, 3600e3);     // один получатель: не больше 120 в час от всех сразу
  const src = srcOf(ip);
  if ((u.askBlock || []).includes(src)) return { ok: true };      // заблокированный отправитель не узнаёт, что его не читают
  const b0 = bot(); need(b0, 'Сервис временно недоступен.');
  const m = C.postMessage(C.openDm(b0.id, u.id), b0.id, { text: '🍃 **Анонимный вопрос**\n\n' + text }, { quiet: true });
  m.src = src; m.ask = 1;
  u.askGot = (u.askGot || 0) + 1;
  save();
  return { ok: true };
}

const mine = u => { const b0 = bot(); return b0 ? (db.msgs['dm_' + [b0.id, u.id].sort().join('_')] || []).filter(m => m.ask && m.from === b0.id) : []; };
H['ask.info'] = c => {
  const u = db.users[c.uid], blocked = new Set(u.askBlock || []);
  return { username: u.username, open: !u.askOff, got: u.askGot || 0, blocked: blocked.size,
    recent: mine(u).slice(-RECENT).reverse().map(m => ({ id: m.id, ts: m.ts, text: String(m.text || '').replace(/^🍃 \*\*Анонимный вопрос\*\*\n\n/, '').slice(0, 160), blocked: blocked.has(m.src) })) };
};
H['ask.set'] = (c, p) => { const u = db.users[c.uid]; if (p.open) delete u.askOff; else u.askOff = 1; save(); return { open: !u.askOff }; };
// Запретить писать тому, кто прислал этот вопрос. Кто это — не узнаёт никто, включая получателя.
H['ask.block'] = (c, p) => {
  const u = db.users[c.uid], m = mine(u).find(x => x.id === str(p.id, 40));
  need(m && m.src, 'Вопрос не найден');
  u.askBlock = (u.askBlock || []).filter(s => s !== m.src);
  if (!p.undo) { u.askBlock.push(m.src); if (u.askBlock.length > BLOCK_MAX) u.askBlock.splice(0, u.askBlock.length - BLOCK_MAX); }
  save();
  return { blocked: !p.undo };
};
H['ask.unblockAll'] = c => { const u = db.users[c.uid]; delete u.askBlock; save(); return { ok: true }; };

module.exports = { info, send, BOT };
