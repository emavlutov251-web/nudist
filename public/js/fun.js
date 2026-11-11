// Приколы: звуки (синтез WebAudio), стикеры, слэш-команды, листопад-конфетти, «Прикрыться», мемогенератор.
import { html, useState, useEffect, useRef, S, bump, toast, Modal, closeModal, Icon, pickFile, upload, rpc, call, setSetting, userName, cx } from './lib.js';

// ───── звук
let ac = null;
const actx = () => { if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); return ac; };
function tone(f, t, d, { type = 'sine', g = 0.18, to } = {}) {
  const a = actx(), o = a.createOscillator(), gn = a.createGain(), t0 = a.currentTime + t;
  o.type = type; o.frequency.setValueAtTime(f, t0); if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + d);
  gn.gain.setValueAtTime(0.0001, t0); gn.gain.linearRampToValueAtTime(g, t0 + 0.012); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
  o.connect(gn).connect(a.destination); o.start(t0); o.stop(t0 + d + 0.05);
}
function noise(t, d, { g = 0.15, hp = 800, lp = 12000 } = {}) {
  const a = actx(), n = Math.ceil(a.sampleRate * d), buf = a.createBuffer(1, n, a.sampleRate), ch = buf.getChannelData(0);
  for (let i = 0; i < n; i++) ch[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource(), gn = a.createGain(), h = a.createBiquadFilter(), l = a.createBiquadFilter(), t0 = a.currentTime + t;
  src.buffer = buf; h.type = 'highpass'; h.frequency.value = hp; l.type = 'lowpass'; l.frequency.value = lp;
  gn.gain.setValueAtTime(g, t0); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
  src.connect(h).connect(l).connect(gn).connect(a.destination); src.start(t0);
}
const SFX = {
  ding: () => { tone(880, 0, 0.12); tone(1320, 0.09, 0.28); },
  drop: () => { tone(660, 0, 0.1, { to: 440 }); tone(990, 0.1, 0.2, { g: 0.1 }); },
  knock: () => { tone(200, 0, 0.07, { type: 'square', g: 0.12 }); tone(200, 0.12, 0.07, { type: 'square', g: 0.12 }); },
  pop: () => tone(520, 0, 0.09, { to: 900, g: 0.08 }),
  ring: () => { for (let i = 0; i < 2; i++) { tone(784, i * 0.5, 0.18, { g: 0.14 }); tone(988, i * 0.5 + 0.18, 0.22, { g: 0.14 }); } },
  hang: () => { tone(440, 0, 0.15, { to: 300 }); tone(300, 0.15, 0.25, { to: 180 }); },
  join: () => { tone(523, 0, 0.1); tone(784, 0.1, 0.18); },
  leave: () => { tone(784, 0, 0.1); tone(523, 0.1, 0.18); },
  badum: () => { tone(120, 0, 0.16, { type: 'triangle', g: 0.4, to: 70 }); tone(120, 0.2, 0.16, { type: 'triangle', g: 0.4, to: 70 }); noise(0.45, 0.6, { hp: 5000, g: 0.2 }); },
  trombone: () => { [294, 277, 262].forEach((f, i) => tone(f, i * 0.32, 0.3, { type: 'sawtooth', g: 0.12, to: f * 0.97 })); tone(247, 0.96, 0.9, { type: 'sawtooth', g: 0.12, to: 220 }); },
  crickets: () => { for (let k = 0; k < 4; k++) for (let i = 0; i < 6; i++) tone(4300 + (i % 2) * 150, k * 0.45 + i * 0.045, 0.03, { g: 0.05 }); },
  applause: () => { for (let i = 0; i < 60; i++) noise(Math.random() * 1.6, 0.05 + Math.random() * 0.05, { hp: 1500, lp: 6000, g: 0.12 }); },
  fanfare: () => { [523, 659, 784].forEach((f, i) => tone(f, i * 0.13, 0.13, { type: 'square', g: 0.09 })); tone(1047, 0.39, 0.5, { type: 'square', g: 0.09 }); },
  quack: () => { tone(620, 0, 0.11, { type: 'sawtooth', to: 380, g: 0.15 }); tone(560, 0.16, 0.14, { type: 'sawtooth', to: 320, g: 0.15 }); },
  horn: () => { [440, 466, 554].forEach(f => tone(f, 0, 0.7, { type: 'sawtooth', g: 0.08 })); },
  fail: () => { tone(330, 0, 0.16, { type: 'square', g: 0.09 }); tone(233, 0.17, 0.35, { type: 'square', g: 0.09 }); },
  whoosh: () => noise(0, 0.5, { hp: 300, lp: 3000, g: 0.25 }),
  bonk: () => tone(190, 0, 0.14, { type: 'square', to: 70, g: 0.2 }),
  coin: () => { tone(988, 0, 0.08, { type: 'square', g: 0.08 }); tone(1319, 0.08, 0.35, { type: 'square', g: 0.08 }); },
  meow: () => { tone(700, 0, 0.18, { type: 'triangle', to: 1000, g: 0.14 }); tone(1000, 0.18, 0.3, { type: 'triangle', to: 600, g: 0.14 }); },
  buzz: () => { for (let i = 0; i < 5; i++) tone(90, i * 0.07, 0.06, { type: 'sawtooth', g: 0.2 }); },
};
export function sfx(name) { try { (SFX[name] || SFX.ding)(); } catch (e) { /* звук недоступен до первого клика */ } }
export const SOUNDBOARD = [['badum', '🥁', 'Ба-дум-тсс'], ['trombone', '🎺', 'Грустный тромбон'], ['crickets', '🦗', 'Сверчки'], ['applause', '👏', 'Аплодисменты'], ['fanfare', '🎉', 'Фанфары'], ['quack', '🦆', 'Кря'], ['horn', '📯', 'Гудок'], ['fail', '🪟', 'Ошибка'], ['whoosh', '💨', 'Вжух'], ['bonk', '🔨', 'Бонк'], ['coin', '🪙', 'Монетка'], ['meow', '🐈', 'Мяу']];
export const NOTIF_SOUNDS = [['ding', 'Дзынь'], ['drop', 'Капля'], ['knock', 'Тук-тук'], ['quack', 'Кря'], ['meow', 'Мяу'], ['coin', 'Монетка']];

// ───── стикеры
const P = (id, e, t, bg, anim, snd) => ({ id, e, t, bg, anim, snd });
export const PACKS = [
  { id: 'leaf', name: 'Фиговый листок', icon: '🍃', items: [P('l1', '🍃', 'Прикройся', 'leaf', 'wobble', 'whoosh'), P('l2', '🙈', 'Не смотрю', 'sand', 'bounce'), P('l3', '🫣', 'Одним глазком', 'sun', 'pulse'), P('l4', '🩳', 'А дресс-код?', 'sea', 'wobble'), P('l5', '🧦', 'Только носки', 'night', 'bounce'), P('l6', '🏖', 'Я на пляже', 'sun', 'pulse'), P('l7', '🌞', 'Загораю', 'sand', 'spin'), P('l8', '🚿', 'Чист как слеза', 'sea', 'bounce')] },
  { id: 'office', name: 'Офисный планктон', icon: '☕', items: [P('o1', '☕', 'Не будить', 'sand', 'pulse'), P('o2', '📅', 'Созвон мог быть письмом', 'night', 'wobble'), P('o3', '🔥', 'Горит дедлайн', 'sun', 'pulse', 'fail'), P('o4', '🫠', 'Я в ресурсе (нет)', 'sea', 'wobble'), P('o5', '💼', 'Ушёл в закат', 'sun', 'bounce'), P('o6', '🧾', 'Согласовано', 'leaf', 'bounce', 'coin'), P('o7', '🐌', 'Уже делаю', 'sand', 'wobble'), P('o8', '🤝', 'Давай после праздников', 'night', 'pulse')] },
  { id: 'cats', name: 'Котики', icon: '😺', items: [P('c1', '😺', 'Мур', 'sand', 'bounce', 'meow'), P('c2', '😹', 'Ору', 'sun', 'wobble', 'meow'), P('c3', '🙀', 'Что?!', 'night', 'pulse', 'meow'), P('c4', '😿', 'Грустненько', 'sea', 'wobble', 'trombone'), P('c5', '😼', 'Есть план', 'leaf', 'pulse'), P('c6', '😻', 'Обожаю', 'sun', 'bounce'), P('c7', '🐈', 'Мимо проходил', 'sand', 'wobble'), P('c8', '🐈‍⬛', 'К удаче', 'night', 'spin')] },
  { id: 'react', name: 'Мемные реакции', icon: '🗿', items: [P('r1', '🗿', 'Ъ', 'night', 'pulse', 'bonk'), P('r2', '🤡', 'Это я', 'sun', 'spin', 'horn'), P('r3', '💀', 'Умер со смеху', 'night', 'wobble', 'badum'), P('r4', '🫡', 'Так точно', 'leaf', 'bounce', 'fanfare'), P('r5', '🤌', 'Белиссимо', 'sand', 'wobble'), P('r6', '🦆', 'Кря', 'sea', 'bounce', 'quack'), P('r7', '🦗', 'Тишина…', 'night', 'pulse', 'crickets'), P('r8', '👏', 'Браво', 'sun', 'bounce', 'applause')] },
];
export function Sticker({ st, size = 160, onClick, play }) {
  const [k, setK] = useState(0);
  if (!st) return null;
  const click = e => { if (onClick) return onClick(e); setK(x => x + 1); if (st.snd) sfx(st.snd); };
  if (st.url) return html`<img class="sticker-img" src=${st.url} style=${`width:${size}px;height:${size}px`} alt="стикер" onClick=${click} />`;
  const lines = (st.t || '').split('\n');
  return html`<div class=${cx('sticker', 'bg-' + (st.bg || 'leaf'))} style=${`width:${size}px;height:${size}px;font-size:${size / 160}em`} onClick=${click} title=${st.snd ? 'Со звуком — нажмите' : st.t}>
    <span key=${k} class=${cx('st-e', (play || k > 0 || true) && 'an-' + (st.anim || 'bounce'))}>${st.e}</span>
    ${st.t && html`<span class="st-t">${lines.map(l => html`<span>${l}</span>`)}</span>`}${st.snd && html`<i class="st-snd">♪</i>`}</div>`;
}
const HINTS = [[/привет|здрав|хай|ку\b/i, ['l6', 'c1']], [/спасибо|благодар/i, ['r4', 'c6']], [/ха+|лол|ору|ржу/i, ['c2', 'r3']], [/груст|печал|жаль|увы/i, ['c4']], [/ок|хорошо|договор|согласен/i, ['o6', 'r4']], [/дедлайн|работ|созвон|митинг/i, ['o3', 'o2']], [/кот|мяу/i, ['c1', 'c7']], [/что\?|чего|шок/i, ['c3', 'r1']], [/браво|молодец|круто|супер/i, ['r8', 'r5']], [/тишина|алло|ау/i, ['r7']], [/голый|разде|прикр/i, ['l1', 'l2']]];
export function stickerHints(text) { if (!text || text.length > 40) return []; const all = PACKS.flatMap(p => p.items.map(i => ({ ...i, pack: p.id }))); for (const [re, ids] of HINTS) if (re.test(text)) return ids.map(i => all.find(s => s.id === i)).filter(Boolean); return []; }

// ───── слэш-команды
const mock = s => [...s].map((c, i) => (i % 2 ? c.toUpperCase() : c.toLowerCase())).join('');
const uwu = s => s.replace(/[рл]/g, 'в').replace(/[РЛ]/g, 'В').replace(/н([аеиоуюя])/g, 'нь$1') + ' ' + ['UwU', 'OwO', '>w<', '(◕ᴗ◕✿)', 'ня~'][Math.floor(Math.random() * 5)];
export const SLASH = [
  { c: 'shrug', d: 'пожать плечами ¯\\_(ツ)_/¯', run: a => (a ? a + ' ' : '') + '¯\\_(ツ)_/¯' },
  { c: 'tableflip', d: 'перевернуть стол', run: a => (a ? a + ' ' : '') + '(╯°□°)╯︵ ┻━┻' },
  { c: 'unflip', d: 'поставить стол на место', run: a => (a ? a + ' ' : '') + '┬─┬ ノ( ゜-゜ノ)' },
  { c: 'lenny', d: '( ͡° ͜ʖ ͡°)', run: a => (a ? a + ' ' : '') + '( ͡° ͜ʖ ͡°)' },
  { c: 'mock', d: 'сПоНжБоБ-регистр', arg: 'текст', run: a => mock(a) },
  { c: 'uwu', d: 'сделать текст няшным', arg: 'текст', run: a => uwu(a) },
  { c: 'gol', d: 'раздеть текст: снять форматирование и знаки', arg: 'текст', run: a => a.replace(/[*_~`|>#]/g, '').replace(/[.,!?;:"«»()—–-]/g, '').replace(/\s+/g, ' ').toLowerCase() },
  { c: 'clap', d: 'расставить 👏 между 👏 словами', arg: 'текст', run: a => a.split(/\s+/).join(' 👏 ') },
  { c: 'spoiler', d: 'прикрыть текст листком', arg: 'текст', run: a => '||' + a + '||' },
  { c: 'me', d: 'действие от третьего лица', arg: 'что делает', run: a => `__${userName(S.me)} ${a}__` },
  { c: 'roll', d: 'бросить кубик (сервер честно считает)', arg: '[граней]', server: true },
  { c: 'coin', d: 'подбросить монетку', server: true },
  { c: '8ball', d: 'спросить шар судьбы', arg: 'вопрос', server: true },
  { c: 'buzz', d: 'пнуть собеседника: у него затрясётся окно', action: chat => call('fun.buzz', { chat }) },
  { c: 'party', d: 'устроить листопад всем в чате', fx: 'confetti', run: a => a || '🎉' },
];

// ───── листопад (конфетти)
export function confetti() {
  if (S.settings.anim === false) return;
  const c = document.createElement('canvas'); c.className = 'confetti'; c.width = innerWidth; c.height = innerHeight; document.body.append(c);
  const g = c.getContext('2d'), cols = ['#1F9D57', '#45C97F', '#FFD9BE', '#E2552D', '#F0A04B', '#0D7C8C'];
  const ps = Array.from({ length: 110 }, () => ({ x: Math.random() * c.width, y: -20 - Math.random() * c.height * 0.5, vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 4, s: 6 + Math.random() * 8, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, col: cols[Math.floor(Math.random() * cols.length)], leaf: Math.random() < 0.25 }));
  const t0 = performance.now();
  (function frame(t) {
    g.clearRect(0, 0, c.width, c.height);
    for (const p of ps) { p.x += p.vx + Math.sin((t + p.s * 100) / 400); p.y += p.vy; p.r += p.vr; g.save(); g.translate(p.x, p.y); g.rotate(p.r); if (p.leaf) { g.font = p.s * 2.2 + 'px serif'; g.fillText('🍃', 0, 0); } else { g.fillStyle = p.col; g.fillRect(-p.s / 2, -p.s / 2, p.s, p.s); } g.restore(); }
    if (t - t0 < 3200) requestAnimationFrame(frame); else c.remove();
  })(t0);
}
export function shake() { const el = document.getElementById('app'); el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); sfx('buzz'); setTimeout(() => el.classList.remove('shake'), 700); }

// ───── «Прикрыться»: фальшивая таблица на случай начальника
const ROWS = [['Статья', 'План', 'Факт', 'Откл., %', 'Комментарий'], ['Выручка, тыс. ₽', 12400, 11870, -4.3, 'сезонность'], ['Себестоимость', 7300, 7415, 1.6, ''], ['Валовая прибыль', 5100, 4455, -12.6, 'см. п. 2'], ['Коммерческие расходы', 1200, 1340, 11.7, 'маркетинг'], ['Управленческие расходы', 980, 975, -0.5, ''], ['ФОТ', 2100, 2100, 0, 'без изменений'], ['Аренда', 450, 450, 0, ''], ['Командировки', 120, 86, -28.3, 'экономия'], ['Канцтовары и листья', 15, 47, 213.3, 'уточнить'], ['EBITDA', 1820, 1404, -22.9, ''], ['Налоги', 364, 281, -22.8, ''], ['Чистая прибыль', 1456, 1123, -22.9, 'на согласовании'], ['', '', '', '', ''], ['Итого по кварталу', 33305, 31546, -5.3, '']];
export function BossScreen() {
  const [sel, setSel] = useState('C4');
  useEffect(() => { const t = document.title; document.title = S.settings.bossTitle; return () => { document.title = t; }; }, []);
  const cols = 'ABCDEFGHIJ'.split('');
  const val = id => { const r = ROWS[+id.slice(1) - 1]; const v = r && r[cols.indexOf(id[0])]; return v == null ? '' : v; };
  return html`<div class="boss" role="document" aria-label="Электронная таблица">
    <div class="boss-top"><b>▦</b><span>${S.settings.bossTitle}</span><em>— только чтение</em><i>Esc Esc — вернуться</i></div>
    <div class="boss-menu">${['Файл', 'Главная', 'Вставка', 'Разметка страницы', 'Формулы', 'Данные', 'Рецензирование', 'Вид'].map(m => html`<span>${m}</span>`)}</div>
    <div class="boss-fx"><span class="cell-id">${sel}</span><span class="fx">fx</span><span class="fx-v">${typeof val(sel) === 'number' && sel[0] === 'D' ? `=(C${sel.slice(1)}-B${sel.slice(1)})/B${sel.slice(1)}*100` : val(sel)}</span></div>
    <div class="boss-grid"><table><thead><tr><th></th>${cols.map(c => html`<th>${c}</th>`)}</tr></thead><tbody>
      ${Array.from({ length: 40 }, (_, r) => html`<tr><th>${r + 1}</th>${cols.map((c, ci) => { const v = (ROWS[r] || [])[ci]; const id = c + (r + 1); return html`<td class=${cx(r === 0 && 'hd', typeof v === 'number' && 'num', typeof v === 'number' && ci === 3 && v < 0 && 'neg', sel === id && 'sel', (r === 10 || r === 12 || r === 14) && 'bold')} onClick=${() => setSel(id)}>${typeof v === 'number' ? v.toLocaleString('ru-RU') : v}</td>`; })}</tr>`)}
    </tbody></table></div>
    <div class="boss-tabs"><span class="on">Сводная</span><span>Q1</span><span>Q2</span><span>Q3</span><span>Черновик (не открывать)</span></div></div>`;
}
let lastEsc = 0, konami = 0; const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
export function funKeys(e) {
  if (e.key === 'Escape') { const t = Date.now(); if (t - lastEsc < 450) { S.ui.boss = !S.ui.boss; bump(); lastEsc = 0; return true; } lastEsc = t; }
  konami = e.key === KONAMI[konami] || e.key.toLowerCase() === KONAMI[konami] ? konami + 1 : (e.key === KONAMI[0] ? 1 : 0);
  if (konami === KONAMI.length) { konami = 0; try { localStorage.setItem('nudist.konami', '1'); } catch (x) {} setSetting({ theme: S.settings.theme === 'tan' ? 'system' : 'tan' }); confetti(); sfx('fanfare'); toast(S.settings.theme === 'tan' ? '☀️ Секретный режим «Загар» включён' : 'Загар смыт'); }
  return false;
}

// ───── мемогенератор и демотиватор
const BG = { sun: ['#FFB36B', '#E2552D'], leaf: ['#45C97F', '#178A4A'], sea: ['#5CC6D4', '#0D5C8C'], sand: ['#F3D9B1', '#C7822F'], night: ['#34415E', '#141B2D'] };
function wrap(g, text, maxW) { const out = []; for (const para of text.split('\n')) { let line = ''; for (const w of para.split(/\s+/)) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; } out.push(line); } return out; }
export function drawMeme(cv, { img, emoji, bg, top, bottom, mode }) {
  const g = cv.getContext('2d'); const W = 800;
  const iw = img ? img.naturalWidth : 800, ih = img ? img.naturalHeight : 600, k = Math.min(1, W / iw), pw = Math.round(iw * k), ph = Math.round(ih * k);
  const drawPic = (x, y, w, h) => {
    if (img) return g.drawImage(img, x, y, w, h);
    const gr = g.createLinearGradient(x, y, x + w, y + h), c = BG[bg] || BG.leaf; gr.addColorStop(0, c[0]); gr.addColorStop(1, c[1]); g.fillStyle = gr; g.fillRect(x, y, w, h);
    g.font = Math.round(h * 0.5) + 'px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(emoji || '🍃', x + w / 2, y + h / 2 + h * 0.03);
  };
  if (mode === 'demo') {
    const pad = 60, fw = pw + pad * 2; g.font = '56px "Times New Roman", Times, serif';
    const tl = top ? wrap(g, top, pw) : []; g.font = '28px Arial, sans-serif'; const bl = bottom ? wrap(g, bottom, pw) : [];
    const fh = pad + ph + 40 + tl.length * 64 + bl.length * 36 + 50;
    cv.width = fw; cv.height = fh; g.fillStyle = '#000'; g.fillRect(0, 0, fw, fh);
    g.strokeStyle = '#fff'; g.lineWidth = 3; g.strokeRect(pad - 8, pad - 8, pw + 16, ph + 16); drawPic(pad, pad, pw, ph);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'top'; let y = pad + ph + 36;
    g.font = '56px "Times New Roman", Times, serif'; for (const l of tl) { g.fillText(l, fw / 2, y); y += 64; }
    g.font = '28px Arial, sans-serif'; y += 6; for (const l of bl) { g.fillText(l, fw / 2, y); y += 36; }
  } else {
    cv.width = pw; cv.height = ph; drawPic(0, 0, pw, ph);
    const fs = Math.max(28, Math.round(pw / 11)); g.font = `900 ${fs}px Impact, "Arial Black", "Golos Text", sans-serif`; g.textAlign = 'center'; g.lineJoin = 'round'; g.lineWidth = fs / 6; g.strokeStyle = '#000'; g.fillStyle = '#fff';
    const put = (text, fromTop) => { const ls = wrap(g, text.toUpperCase(), pw - 40); g.textBaseline = fromTop ? 'top' : 'bottom'; ls.forEach((l, i) => { const y = fromTop ? 16 + i * fs * 1.08 : ph - 16 - (ls.length - 1 - i) * fs * 1.08; g.strokeText(l, pw / 2, y); g.fillText(l, pw / 2, y); }); };
    if (top) put(top, true); if (bottom) put(bottom, false);
  }
}
export function MemeModal({ id, onSend }) {
  const [st, setSt] = useState({ mode: 'meme', top: 'Когда сказал «скрывать нечего»', bottom: 'а тебе открыли историю браузера', emoji: '🫣', bg: 'sun', img: null });
  const [busy, setBusy] = useState(false); const cv = useRef();
  useEffect(() => { if (cv.current) drawMeme(cv.current, st); }, [st]);
  const set = p => setSt(s => ({ ...s, ...p }));
  const pick = async () => { const f = await pickFile('image/*'); if (!f) return; const img = new Image(); img.onload = () => set({ img }); img.src = URL.createObjectURL(f); };
  const send = async () => { setBusy(true); try { const blob = await new Promise(r => cv.current.toBlob(r, 'image/jpeg', 0.9)); const up = await upload(blob, { name: st.mode === 'demo' ? 'demotivator.jpg' : 'meme.jpg' }); await onSend({ type: 'photo', media: { ...up, w: cv.current.width, h: cv.current.height } }); closeModal(id); } catch (e) { toast(e.message, 'err'); } setBusy(false); };
  return html`<${Modal} id=${id} title="Мемогенератор" icon="wand-sparkles" wide footer=${html`<button class="btn ghost" onClick=${() => { const a = document.createElement('a'); a.download = 'meme.jpg'; a.href = cv.current.toDataURL('image/jpeg', 0.9); a.click(); }}><${Icon} n="download" s=${16} /> Скачать</button><button class="btn" disabled=${busy} onClick=${send}><${Icon} n="send" s=${16} /> ${busy ? 'Отправляю…' : 'Отправить в чат'}</button>`}>
    <div class="meme">
      <div class="meme-prev"><canvas ref=${cv}></canvas></div>
      <div class="meme-ctl">
        <div class="seg"><button class=${cx(st.mode === 'meme' && 'on')} onClick=${() => set({ mode: 'meme' })}>Мем</button><button class=${cx(st.mode === 'demo' && 'on')} onClick=${() => set({ mode: 'demo', top: st.top || 'БЕЗЫСХОДНОСТЬ' })}>Демотиватор</button></div>
        <label class="fld"><span>${st.mode === 'demo' ? 'Заголовок' : 'Текст сверху'}</span><textarea rows="2" value=${st.top} onInput=${e => set({ top: e.target.value })}></textarea></label>
        <label class="fld"><span>${st.mode === 'demo' ? 'Подпись' : 'Текст снизу'}</span><textarea rows="2" value=${st.bottom} onInput=${e => set({ bottom: e.target.value })}></textarea></label>
        <div class="fld"><span>Картинка</span><div class="row"><button class="btn ghost" onClick=${pick}><${Icon} n="image" s=${16} /> Своя картинка</button>${st.img && html`<button class="btn ghost" onClick=${() => set({ img: null })}>Убрать</button>`}</div></div>
        ${!st.img && html`<div class="fld"><span>Или соберите из эмодзи</span><div class="chips">${['🫣', '🗿', '🐸', '🐈', '🦆', '🧠', '🍃', '🤡', '💀', '🐹', '🦥', '🫠'].map(e => html`<button class=${cx('chip', st.emoji === e && 'on')} onClick=${() => set({ emoji: e })}>${e}</button>`)}</div>
          <div class="chips">${Object.keys(BG).map(b => html`<button class=${cx('swatch', st.bg === b && 'on')} style=${`background:linear-gradient(135deg,${BG[b][0]},${BG[b][1]})`} onClick=${() => set({ bg: b })} aria-label=${'Фон ' + b}></button>`)}</div></div>`}
      </div></div><//>`;
}
export const DAILY_FACTS = ['Спойлер прикрывается листком: ||вот так||', 'Esc Esc — и на экране квартальный отчёт. Начальник доволен.', 'Команда /gol снимает с текста всё лишнее.', 'Удерживайте пробел в голосовом канале — режим рации.', 'В настройках чата есть «Голый набор»: собеседник видит текст, пока вы печатаете.', 'Листики 🍃 растут в мини-игре @listopad.', '/buzz в личке трясёт окно собеседника. Не злоупотребляйте.', 'Мемогенератор прячется под скрепкой.'];
