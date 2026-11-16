// Мост между Telegram и сервером «Нудиста» — функция Supabase Edge Functions (Deno), имя функции: tg, проверка JWT выключена.
// Нужен, когда сервер стоит там, откуда Telegram недоступен (сейчас так из России):
//   POST /tg/api/tg/hook               — сообщение боту от Telegram пересылается серверу (секрет в заголовке проверяет сам сервер);
//   ANY  /tg/relay/<ключ>/bot<токен>/… — запрос сервера к Telegram пересылается как есть (ключ — RELAY_KEY).
// Секреты проекта Supabase: RELAY_KEY (общий с сервером ключ), NUDIST_SITE (адрес сервера, https://…).
// На сервере: TG_API=https://<проект>.supabase.co/functions/v1/tg/relay/<RELAY_KEY>, TG_HOOK_URL=https://<проект>.supabase.co/functions/v1/tg
const KEY = Deno.env.get("RELAY_KEY") ?? "";
const SITE = (Deno.env.get("NUDIST_SITE") ?? "").replace(/\/+$/, "");
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

Deno.serve(async (req) => {
  const u = new URL(req.url);
  const p = u.pathname.replace(/^\/functions\/v1/, "").replace(/^\/tg/, "");
  try {
    if (p === "/api/tg/hook" && req.method === "POST") {
      if (!SITE) return json({ ok: false }, 503);
      const r = await fetch(SITE + "/api/tg/hook", { method: "POST", headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": req.headers.get("x-telegram-bot-api-secret-token") ?? "" }, body: await req.arrayBuffer() });
      return json({ ok: r.ok }, r.ok ? 200 : r.status === 403 ? 403 : 502);
    }
    const m = p.match(/^\/relay\/([\w-]{16,})(\/(?:file\/)?bot[^/]+\/.+)$/);
    if (m) {
      if (!KEY || m[1] !== KEY) return json({ ok: false, description: "forbidden" }, 403);
      const init: RequestInit = { method: req.method, headers: req.headers.get("content-type") ? { "content-type": req.headers.get("content-type")! } : {} };
      if (req.method !== "GET" && req.method !== "HEAD") init.body = await req.arrayBuffer();
      const r = await fetch("https://api.telegram.org" + m[2] + u.search, init);
      return new Response(r.body, { status: r.status, headers: { "content-type": r.headers.get("content-type") ?? "application/octet-stream", "cache-control": "no-store" } });
    }
    if (p === "" || p === "/") return json({ ok: true, bridge: "telegram", site: SITE ? "set" : "unset" });
    return json({ ok: false }, 404);
  } catch (e) {
    return json({ ok: false, description: String(e) }, 502);
  }
});
