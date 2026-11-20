// ───── версия: что стоит на телефоне, что выложено на сервере и что нового
// Экран нужен по двум причинам: человек видит, какая у него сборка (это первое, о чём спрашивают
// при обращении в поддержку), и может сам проверить обновления, не дожидаясь окна.
import { html, useState, useEffect, S, toast, Icon, Spinner, copyText } from './lib.js';
import { nativeNav } from './appnative.js';

// Сборка приложения: мост есть только у настоящего приложения, в браузере — 0.
export const apkCode = () => { try { return window.NudistApp && window.NudistApp.version ? Number(window.NudistApp.version()) || 0 : 0; } catch (e) { return 0; } };
export const apkName = c => c ? `${Math.floor(c / 10)}.${c % 10}` : '';
const fmtDate = ts => { try { return new Date(ts).toLocaleString('ru-RU', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };

// Сборка интерфейса: сервер считает её сам и присылает в каждом ответе (/api/version).
// В приложении код может быть встроен в APK, поэтому локальная копия может отставать — это нормально, и это видно.
const SERVER_BUILD = (() => { try { return String((document.querySelector('meta[name="nudist-build"]') || {}).content || ''); } catch (e) { return ''; } })();
export const embeddedBuild = () => SERVER_BUILD;

// Сведения о сборке интерфейса и приложения. Сервер отвечает одним запросом, кеш — на минуту.
let cache = null;
export async function versionInfo() {
  if (cache && Date.now() - cache.at < 60e3) return cache.value;
  const v = await (await fetch('/api/version', { cache: 'no-store' })).json();
  const value = { build: v.build || '', apk: v.apk || null, at: Date.now() };
  cache = { at: Date.now(), value };
  return value;
}
export const versionState = v => {
  const mine = apkCode(), latest = Number(v.apk && v.apk.code) || 0;
  if (!mine) return 'web';                       // браузер: обновлять нечего, страница всегда свежая
  if (!latest) return 'unknown';
  if (mine < latest) return 'outdated';
  if (mine > latest) return 'ahead';             // сборка новее выложенной: так бывает на тестах
  return 'ok';
};

export function Version({ wide }) {
  const [v, setV] = useState(cache ? cache.value : null), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const load = async (manual) => {
    setBusy(true); setErr('');
    try { cache = null; setV(await versionInfo()); if (manual) toast('Проверено: данные свежие'); }
    catch (e) { setErr(e.message || 'Сервер не ответил'); }
    setBusy(false);
  };
  useEffect(() => { load(false); }, []);

  const mine = apkCode(), latest = Number(v && v.apk && v.apk.code) || 0;
  const st = v ? versionState(v) : 'unknown';
  const from = v && v.apk && v.apk.name ? '«Нудист» ' + v.apk.name + ' для Android' : '';
  const news = (v && v.apk && (v.apk.news || [])) || [];

  return html`<div class="form ver">
    <div class="ver-hero">
      <div class="ver-leaf"><${Icon} n="leaf" s=${26} /></div>
      <div><b>«Нудист»</b><small>${st === 'web' ? 'в браузере' : mine ? 'приложение для Android · ' + apkName(mine) : 'приложение для Android'}</small></div>
      ${st === 'ok' && html`<span class="ver-tag ok">Свежая версия</span>`}
      ${st === 'outdated' && html`<span class="ver-tag warn">Есть новее</span>`}
      ${st === 'ahead' && html`<span class="ver-tag test">Сборка новее выложенной</span>`}
    </div>

    <div class="list">
      <div class="li ver-row"><${Icon} n="smartphone" /><span><b>Сборка приложения</b><small>${mine ? `${apkName(mine)} · номер ${mine}` : 'не приложение — открыто в браузере'}</small></span></div>
      <div class="li ver-row"><${Icon} n="refresh-cw" /><span><b>Интерфейс на сервере</b><small>${(v && v.build ? v.build.slice(0, 12) : '…')}${v ? ' · проверено ' + fmtDate(v.at) : ''}</small></span></div>
      <div class="li ver-row"><${Icon} n="database" /><span><b>Интерфейс внутри приложения</b><small>${(mine && embeddedBuild()) ? embeddedBuild() : mine ? 'грузится с сервера' : 'не приложение — берётся с сервера'}</small></span></div>
      <div class="li ver-row"><${Icon} n="download" /><span><b>Что выложено для Android</b><small>${from || (busy ? 'спрашиваем сервер…' : err || 'нет данных')}</small></span></div>
    </div>

    ${st === 'outdated' && html`<div class="note warn ver-more">
      <b>Вышла свежая сборка — ${from}.</b>
      <p>Скачайте и поставьте поверх: вход и переписка сохранятся.</p>
      <a class="btn" href="/nudist.apk" download="nudist.apk" onClick=${() => toast('Файл скачивается — откройте его из шторки')}><${Icon} n="download" s=${16} /> Скачать ${v.apk.name}</a>
    </div>`}
    ${st === 'ok' && html`<p class="hint">У вас самая свежая сборка: обновляться не нужно. Мы проверим ещё раз при следующем заходе — окно появится само, если что-то выйдет.</p>`}
    ${st === 'ahead' && html`<p class="hint">Ваша сборка новее той, что лежит на сервере. Обычно так бывает на проверке перед выкладкой — ничего делать не нужно.</p>`}
    ${st === 'web' && html`<p class="hint">Вы в браузере: страница обновляется сама, скачивать ничего не нужно. Приложение для Android ставится с <a href="/start">этой страницы</a> — с ним приходят уведомления в шторку.</p>`}

    ${news.length > 0 && html`<h5>Что нового ${v.apk.name}</h5><ul class="ver-news">${news.map(n => html`<li>${n}</li>`)}</ul>`}

    <div class="row wrap ver-actions">
      <button class="btn ghost" disabled=${busy} onClick=${() => load(true)}>${busy ? html`<${Spinner} /> Проверяем…` : html`<${Icon} n="refresh-cw" s=${16} /> Проверить обновления`}</button>
      <button class="btn ghost" onClick=${() => { copyText(`Нудист ${mine ? apkName(mine) + ' (сборка ' + mine + ')' : 'веб'}, интерфейс ${v && v.build ? v.build.slice(0, 12) : '—'}, устройство: ${navigator.userAgent}`); toast('Сведения о версии скопированы — вставьте в письмо в поддержку'); }}><${Icon} n="copy" s=${16} /> Скопировать для поддержки</button>
    </div>
    ${err && html`<p class="hint err">${err}. Проверьте связь и попробуйте ещё раз — на сборку это не влияет.</p>`}
  </div>`;
}
