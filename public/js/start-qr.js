// Страница /start на компьютере: QR-код, чтобы открыть эту же страницу на телефоне. Старые браузеры модуль просто не загрузят.
import qrcode from '/vendor/qrcode.js';

const box = document.getElementById('qr');
if (box && document.documentElement.getAttribute('data-os') === 'desktop') {
  try {
    const ref = (new URLSearchParams(location.search).get('ref') || '').replace(/[^\w]/g, '').slice(0, 32);
    const q = qrcode(0, 'M'); q.addData(location.origin + '/start' + (ref ? '?ref=' + ref : '')); q.make();
    const n = q.getModuleCount(); let p = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) p += `M${c} ${r}h1v1h-1z`;
    box.innerHTML = `<svg viewBox="-2 -2 ${n + 4} ${n + 4}" shape-rendering="crispEdges" role="img" aria-label="QR-код этой страницы"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/><path d="${p}" fill="#10231A"/></svg>`;
    document.getElementById('desk').hidden = false;
  } catch (e) { /* без кода страница тоже понятна */ }
}
