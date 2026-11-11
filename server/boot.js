'use strict';
// Точка входа. Если задано облачное хранилище, сначала скачивает оттуда базу, и только потом запускает сервер.
const Cloud = require('./cloud');
(async () => {
  if (Cloud.enabled) {
    try { await Cloud.restore(); }
    catch (e) { console.error('[fatal] облачное хранилище недоступно, сервер не запущен, чтобы не затереть базу пустой:', e.message); process.exit(1); }
  }
  require('./index.js');
})();
