// Мост между мини-приложением и «Нудистом». Приложение живёт во фрейме поверх чата и умеет:
// узнать имя пользователя и тему, отправить текст в открытый чат (с подтверждением), закрыться.
export const host = { name: '', chat: '', theme: 'light', canSend: false };
const subs = [];
const say = m => { try { parent.postMessage(m, location.origin); } catch (e) { /* открыли вне приложения */ } };
addEventListener('message', e => {
  if (e.source !== parent || !e.data) return; const d = e.data;
  if (d.nudist === 'init') { Object.assign(host, d); document.documentElement.dataset.theme = d.theme === 'dark' ? 'dark' : 'light'; subs.forEach(f => f(host)); }
  if (d.nudist === 'sent') toast('Отправлено в чат');
  if (d.nudist === 'error') toast(d.text);
});
export function ready(fn) { if (fn) subs.push(fn); say({ nudist: 'ready' }); }
export function share(text) { if (parent === window) return toast('Откройте приложение внутри «Нудиста»'); say({ nudist: 'send', text: String(text).slice(0, 2000) }); }
export function toast(text) {
  let t = document.getElementById('toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = text; t.className = 'on'; clearTimeout(toast.t); toast.t = setTimeout(() => { t.className = ''; }, 1800);
}
export const $ = s => document.querySelector(s);
export const store = { get(k, d) { try { const v = JSON.parse(localStorage.getItem('nudist.app.' + k)); return v == null ? d : v; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('nudist.app.' + k, JSON.stringify(v)); } catch (e) { /* без памяти */ } } };
export const close = () => say({ nudist: 'close' });
addEventListener('keydown', e => { if (e.key === 'Escape') close(); });      // Esc внутри фрейма иначе не дошёл бы до «Нудиста»
