'use strict';
// Точка входа. Если задано облачное хранилище, сначала скачивает оттуда базу, и только потом запускает сервер.
const Cloud = require('./cloud');
(async () => {
  try { await Cloud.restore(); }      // без облака ничего не делает; если основное хранилище недоступно, берёт копию из S3
  catch (e) { console.error('[fatal] базу взять неоткуда (ни Supabase, ни копия в S3 не ответили), сервер не запущен, чтобы не затереть её пустой:', e.message); process.exit(1); }
  Cloud.initFiles();
  require('./index.js');
})();
