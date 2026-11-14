// Открытая страница одной записи: /p/<id>. Нужна, чтобы записью из «Нудиста» можно было поделиться в Telegram, ВК или где угодно —
// человек без аккаунта видит запись и кнопку «Открыть в Нудисте». Скриптов на странице нет, только разметка.
// Показываем лишь то, что и так открыто всем вошедшим: записи ленты (если автор не закрыл профиль) и посты открытых бесплатных каналов.
// Длинный текст обрезаем: целиком он читается уже в мессенджере. Поисковикам страницу индексировать запрещаем.
const C = require('./core');
const { db, isUpload } = C;

const MAX_TEXT = 1200;
const IMG = /\.(jpe?g|png|gif|webp)$/i, VID = /\.(mp4|webm|mov)$/i;
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const COLORS = ['#1F9D57', '#0D7C8C', '#7B4DDB', '#E8590C', '#C2255C', '#1971C2', '#5C940D', '#495057'];
const ytId = t => { const m = String(t || '').match(/(?:youtube\.com\/(?:watch\?(?:[^\s#]*&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([\w-]{11})/); return m ? m[1] : ''; };
const plain = t => String(t || '').replace(/\*\*|__|~~|\|\||`/g, '');

// Текст записи → безопасная разметка: жирный, ссылки, абзацы. Всё остальное экранируется.
function rich(text) {
  let cut = false, t = String(text || '');
  if (t.length > MAX_TEXT) { t = t.slice(0, MAX_TEXT); const sp = t.lastIndexOf(' '); if (sp > MAX_TEXT * 0.7) t = t.slice(0, sp); t = t.trimEnd() + '…'; cut = true; }
  const html = esc(t)
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>').replace(/\*\*|__|~~|\|\||`/g, '')
    .replace(/https?:\/\/[^\s<]+/g, u => { const clean = u.replace(/[.,;:!?)]+$/, ''), tail = u.slice(clean.length); let host = clean; try { host = new URL(clean.replace(/&amp;/g, '&')).hostname.replace(/^www\./, ''); } catch (e) { /* покажем как есть */ } return `<a href="${clean}" rel="nofollow noopener noreferrer" target="_blank">${esc(host)}</a>${tail}`; })
    .split(/\n{2,}/).map(p => '<p>' + p.replace(/\n/g, '<br>') + '</p>').join('');
  return { html, cut };
}

// id записи → что показывать. Возвращает null, если записи нет или она не для всех.
function find(pid) {
  const cm = /^ch\.([\w-]{1,40})\.([\w-]{1,40})$/.exec(pid);
  if (cm) {
    const ch = db.chats[cm[1]]; if (!ch || ch.type !== 'channel' || !ch.pub || ch.server || ch.price) return null;
    const m = (db.msgs[ch.id] || []).find(x => String(x.id) === cm[2]); if (!m || m.type === 'service' || m.enc || m.once || m.thread || m.deleted) return null;
    const url = m.media && m.media.url, media = url && isUpload(url) && (IMG.test(url) || VID.test(url)) ? [url] : [];
    if (!m.text && !media.length) return null;
    return { kind: 'channel', name: ch.title, sub: 'канал' + (ch.username ? ' · @' + ch.username : ''), avatar: isUpload(ch.avatar) ? ch.avatar : '', color: ch.color || 0, ts: m.ts, text: m.text || '', media, open: ch.username ? '#join=' + encodeURIComponent(ch.username) : '' };
  }
  if (!/^[\w-]{1,32}$/.test(pid)) return null;
  const p = (db.posts || {})[pid]; if (!p || p.ts > Date.now()) return null;
  const a = db.users[p.by]; if (!a || a.deleted || a.private || a.banned) return null;
  const media = (p.media || []).filter(u => isUpload(u) && (IMG.test(u) || VID.test(u)));
  if (!p.text && !media.length) return null;
  return { kind: 'post', name: [a.name, a.last].filter(Boolean).join(' ') || 'Нудист', sub: a.username ? '@' + a.username : '', avatar: isUpload(a.avatar) && IMG.test(a.avatar) ? a.avatar : '', color: a.color || 0, ts: p.ts, text: p.text || '', media, open: '#hub=feed' };
}

const date = ts => new Date(ts + 3 * 3600e3).toISOString().replace(/^(\d+)-(\d+)-(\d+)T(\d+:\d+).*/, '$3.$2.$1 $4') + ' мск';

function page(pid, origin, ref) {
  const x = find(pid);
  const r = /^[\w]{1,32}$/.test(ref || '') ? ref : '';
  const home = '/' + (r ? '?ref=' + r : '');
  const css = `*{box-sizing:border-box;margin:0}html,body{min-height:100%}body{font:16px/1.5 "Segoe UI",system-ui,-apple-system,Roboto,Arial,sans-serif;color:#EAF3EE;background:#0E191B;background-image:radial-gradient(120% 70% at 50% -10%,#1F9D57 0%,rgba(31,157,87,.25) 38%,rgba(14,25,27,0) 70%);background-attachment:fixed;display:flex;flex-direction:column;align-items:center;padding:20px 14px calc(96px + env(safe-area-inset-bottom))}
main{width:100%;max-width:560px;display:flex;flex-direction:column;gap:14px}.brand{display:flex;align-items:center;gap:8px;font-weight:600;color:inherit;text-decoration:none;opacity:.9}.brand img{width:28px;height:28px}
.card{background:rgba(25,41,44,.9);border:1px solid rgba(255,255,255,.09);border-radius:18px;padding:16px;display:flex;flex-direction:column;gap:12px}
.who{display:flex;align-items:center;gap:10px}.ava{flex:none;width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:18px;color:#fff;background-size:cover;background-position:center}.who b{display:block;line-height:1.2}.who small{opacity:.65;font-size:13px}
.text{font-size:16.5px;overflow-wrap:anywhere}.text p+p{margin-top:.7em}.text a{color:#6EE7A8}.more{font-size:14px;opacity:.75}
.media{display:grid;gap:6px}.media img,.media video{width:100%;max-height:70vh;object-fit:contain;border-radius:12px;background:#000;display:block}
.yt{position:relative;display:block;border-radius:12px;overflow:hidden;background:#000;color:#fff;text-decoration:none}.yt img{width:100%;display:block;aspect-ratio:16/9;object-fit:cover;opacity:.85}.yt span{position:absolute;left:10px;bottom:10px;padding:6px 12px;border-radius:999px;background:rgba(0,0,0,.72);font-size:14px;font-weight:600}
.btn{font:inherit;border:0;border-radius:14px;min-height:52px;padding:0 18px;color:#fff;background:#1F9D57;font-weight:600;display:flex;align-items:center;justify-content:center;text-decoration:none;text-align:center}.btn:active{transform:scale(.98)}.ghost{background:rgba(255,255,255,.1);font-weight:500;min-height:44px}
.promo{background:linear-gradient(135deg,#1F9D57,#0D7C8C);border:0}.promo p{font-size:14px;opacity:.95}.promo .btn{background:#fff;color:#0E191B}
.bar{position:fixed;left:0;right:0;bottom:0;padding:10px 14px calc(10px + env(safe-area-inset-bottom));background:rgba(14,25,27,.92);border-top:1px solid rgba(255,255,255,.1);display:flex;justify-content:center}.bar .btn{width:100%;max-width:560px}
footer{margin-top:18px;font-size:13px;opacity:.6;text-align:center}footer a{color:inherit}`;
  const head = (title, desc, img) => `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>${esc(title)} · Нудист</title><meta name="robots" content="noindex, nofollow"><meta name="description" content="${esc(desc)}"><meta property="og:type" content="article"><meta property="og:site_name" content="Нудист"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:image" content="${esc(img)}"><meta name="twitter:card" content="summary_large_image"><meta name="theme-color" content="#0E191B"><link rel="icon" href="/icon.svg"><style>${css}</style></head><body><main><a class="brand" href="${home}"><img src="/icon.svg" alt="">Нудист</a>`;
  const foot = `</main><footer><a href="${home}">Нудист</a> — мессенджер, которому нечего скрывать · <a href="/privacy">Политика</a></footer>`;
  if (!x) return { code: 404, html: head('Запись не найдена', 'Запись удалена или закрыта автором.', origin + '/og.png') + `<section class="card"><b>Запись не найдена</b><p class="more">Её удалили или автор закрыл профиль. Зато в «Нудисте» есть лента, каналы и анонимные вопросы.</p><a class="btn" href="${home}">Открыть Нудист</a></section>` + foot + '</body></html>' };
  const yt = ytId(x.text), t = rich(yt ? x.text.replace(/\n?https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/\S+\s*$/, '') : x.text), first = x.media.find(u => IMG.test(u));
  const lines = plain(x.text).split('\n').map(s => s.trim()).filter(Boolean);
  const title = x.kind === 'channel' && lines[0] ? lines[0].slice(0, 110) : x.name, desc = (x.kind === 'channel' ? lines.slice(1).join(' ') || x.name : lines.join(' ')).slice(0, 200) || 'Запись в «Нудисте»';
  const img = first ? origin + first : yt ? `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` : origin + '/og.png';
  const open = home + x.open, initial = esc((x.name.trim()[0] || 'Н').toUpperCase());
  const ava = x.avatar ? `<span class="ava" style="background-image:url('${esc(x.avatar)}')"></span>` : `<span class="ava" style="background:${COLORS[x.color % COLORS.length] || COLORS[0]}">${initial}</span>`;
  const media = x.media.length ? `<div class="media">${x.media.map(u => VID.test(u) ? `<video src="${esc(u)}#t=0.1" controls playsinline preload="metadata"></video>` : `<img src="${esc(u)}" alt="" loading="lazy">`).join('')}</div>` : '';
  const ytCard = yt ? `<a class="yt" href="${open}"><img src="https://i.ytimg.com/vi/${yt}/hqdefault.jpg" alt="" referrerpolicy="no-referrer"><span>▶ Смотреть в Нудисте</span></a>` : '';
  const body = `<article class="card"><div class="who">${ava}<div><b>${esc(x.name)}</b><small>${esc([x.sub, date(x.ts)].filter(Boolean).join(' · '))}</small></div></div>${t.html ? `<div class="text">${t.html}</div>` : ''}${t.cut ? `<p class="more">Это начало. Целиком запись читается в «Нудисте».</p>` : ''}${media}${ytCard}</article>
<section class="card promo"><b>${x.kind === 'channel' ? 'Новости и видео без перехода по сайтам' : 'Здесь можно ответить'}</b><p>«Нудист» — мессенджер с лентой, каналами, анонимными вопросами и огоньками за переписку. Регистрация — полминуты${r ? ', по этой ссылке дают 100 листиков' : ''}.</p><a class="btn" href="${open}">${x.kind === 'channel' ? 'Открыть канал в Нудисте' : 'Ответить в Нудисте'}</a></section>`;
  return { code: 200, html: head(title, desc, img) + body + foot + `<div class="bar"><a class="btn" href="${open}">${x.kind === 'channel' ? 'Открыть в Нудисте' : 'Ответить в Нудисте'}</a></div></body></html>` };
}

module.exports = { page, find };
