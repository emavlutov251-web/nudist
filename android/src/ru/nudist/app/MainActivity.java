package ru.nudist.app;

import android.Manifest;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Color;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.PowerManager;
import android.provider.OpenableColumns;
import android.provider.Settings;
import android.app.NotificationManager;
import android.text.InputType;
import android.util.Base64;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.SslErrorHandler;
import android.webkit.URLUtil;
import android.webkit.MimeTypeMap;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ImageView;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.zip.GZIPOutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * «Нудист» для Android — тонкая оболочка над веб-версией.
 * Сама переписка живёт на сервере «Нудиста»; приложение спрашивает его адрес при первом запуске.
 */
public class MainActivity extends Activity {
    private static final String ACTION_CHANGE_SERVER = "ru.nudist.app.CHANGE_SERVER";
    private static final int REQ_FILE = 1, REQ_PERM = 2, REQ_NOTIFY = 3;
    private static final int APP_VERSION = 43;      // 4.3: «вышло обновление» — уведомление и в Telegram; просьба привязать Telegram
    private static final long SHARE_MAX = 100L * 1024 * 1024;      // больше сервер всё равно не примет
    private static final int SHARE_FILES = 10;
    /** Приложение сейчас на экране: служба уведомлений в это время молчит. */
    static volatile boolean visible;
    private static final int C_BG = 0xFF14251C, C_INK = 0xFFEAF3EC, C_DIM = 0xFF9DB8A8, C_LEAF = 0xFF2BB36A, C_WARN = 0xFFF0A04B;

    private SharedPreferences prefs;
    private FrameLayout root;
    private WebView web;
    private View panel;
    private ValueCallback<Uri[]> fileCallback;
    private PermissionRequest pendingRequest;
    private boolean mainFrameFailed;
    private String lastMainUrl;          // адрес главного документа (для проверки, что показали страницу, а не текст)
    private static final String UPD = "update.apk";       // скачанная новая сборка во внутреннем хранилище
    private volatile String updateState = "idle";
    private volatile int updatePercent;
    private volatile String updateUrl;
    private int mainChecks;               // сколько раз уже перерисовывали текст вместо страницы (защита от цикла)
    private int shownFixes;               // сколько раз показывали свою страницу вместо пустой (тоже защита от цикла)
    private boolean installAfterSettings;  // отправили человека включать «Установку неизвестных приложений»
    /** Переезд на новый адрес: пока true, ждём от страницы прежнего адреса её хранилище (см. migrate). */
    private boolean moving;
    private String moveServer, moveChat;

    /** Аудио, которым поделились с «Нудистом» из другой программы. Файл уже скопирован в кэш приложения. */
    private static final class Shared {
        File file;
        String name, type;
    }
    private final List<Shared> shared = new ArrayList<Shared>();
    /**
     * Пропуск к этим файлам. Мост window.NudistApp виден и посторонним вставкам на странице (плеер Яндекса, карта),
     * поэтому пропуск получает только главная страница — через evaluateJavascript, который во вставки не попадает.
     */
    private final String shareKey = randomKey();

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        prefs = getSharedPreferences("nudist", MODE_PRIVATE);
        root = new FrameLayout(this);
        root.setBackgroundColor(C_BG);
        setContentView(root);
        createWebView();
        String server = prefs.getString("server", null);
        // Адрес, вшитый при сборке (SERVER_URL=… ./build.sh). Пустой — спросить у человека.
        String builtIn = normalize(getString(R.string.default_server));
        // Сервер переехал: сборка знает прежние адреса (MIGRATE_FROM=… ./build.sh). Приложение, настроенное на один из них,
        // само переходит на новый адрес и переносит туда вход в аккаунт — заново входить не нужно.
        String old = server != null && builtIn != null && !server.equals(builtIn) && movedFrom(server) ? server : null;
        if (old != null || (server == null && builtIn != null)) {
            server = builtIn;
            prefs.edit().putString("server", server).apply();
        }
        if (old != null) migrate(old, server, chatFrom(getIntent()), updateFrom(getIntent()));
        else if (server != null) open(server, chatFrom(getIntent()), updateFrom(getIntent()));
        if (server == null || ACTION_CHANGE_SERVER.equals(getIntent().getAction())) showSetup(null);
        clearShareDir();      // остатки с прошлого раза
        if (state == null) takeShare(getIntent());
    }

    @Override
    protected void onResume() {
        super.onResume();
        // Вернулись с экрана разрешений — если установка теперь разрешена, сразу показываем её.
        if (installAfterSettings) {
            installAfterSettings = false;
            if (canInstall() && updateFile().isFile()) web.postDelayed(new Runnable() { @Override public void run() { installUpdate(); } }, 400);
        }
    }

    @Override
    protected void onStart() {
        super.onStart();
        visible = true;
        PushService.clearShown(this);
        PushService.start(this);      // если систему пришлось перезапустить службу или она ещё не поднята
        syncEmbedded();               // раз в сутки: нет ли на сервере интерфейса новее встроенного
    }

    @Override
    protected void onStop() {
        visible = false;
        syncSession();      // на случай, если страница не успела сообщить о входе
        super.onStop();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (ACTION_CHANGE_SERVER.equals(intent.getAction())) showSetup(null);
        takeShare(intent);
        final String chat = chatFrom(intent);
        if (updateFrom(intent) && web != null) {
            try { web.evaluateJavascript("(function(){try{location.hash='#update';}catch(e){}})()", null); } catch (Throwable e) { /* ещё не загрузилась */ }
            return;
        }
        if (chat != null && web != null) {
            // Нажали на уведомление, приложение уже открыто: просим мессенджер перейти в нужный чат.
            try {
                web.evaluateJavascript("(function(){try{var h='#c=" + chat + "';if(location.hash===h)window.dispatchEvent(new HashChangeEvent('hashchange'));else location.hash=h;}catch(e){}})()", null);
            } catch (Throwable e) { /* страница ещё не загрузилась */ }
        }
    }

    // ───── Обновление интерфейса без переустановки
    // Встроенная копия стареет: мы выкладываем новые версии каждую неделю. Поэтому раз в сутки приложение спрашивает
    // /api/version; если build на сервере другой, тихо скачивает все файлы интерфейса (список — из /api/web-list),
    // кладёт во внутреннее хранилище и со следующего запуска показывает их. Хранится одна версия; старая удаляется.
    private static final String WEB_MARK = "web-check";      // когда проверяли в последний раз

    private void syncEmbedded() {
        if (!embeddedReady) prepareEmbedded();
        if (System.currentTimeMillis() - prefs.getLong(WEB_MARK, 0) < 24 * 3600e3) return;      // раз в сутки достаточно
        final String server = prefs.getString("server", null);
        if (server == null) return;
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    String build = serverBuild(server);
                    if (build == null) return;
                    String have = currentWebBuild();
                    prefs.edit().putLong(WEB_MARK, System.currentTimeMillis()).apply();
                    if (build.equals(have) || build.equals(prefs.getString("webSkip", null))) return;      // уже эта версия (или она не скачалась — не долбим сервер)
                    String list = fetchText(server + "/api/web-list");
                    if (list == null || list.length() < 3) return;
                    org.json.JSONArray files = new org.json.JSONArray(list);
                    File dir = new File(getFilesDir(), "web/" + build);
                    File tmp = new File(getFilesDir(), "web/" + build + ".tmp");
                    deleteTree(tmp);
                    if (!tmp.mkdirs() && !tmp.isDirectory()) return;
                    for (int i = 0; i < files.length(); i++) {
                        String rel = files.getString(i);
                        if (rel == null || rel.contains("..") || rel.startsWith("/")) continue;
                        byte[] body = fetchBytes(server + "/" + rel);
                        if (body == null) { deleteTree(tmp); prefs.edit().putString("webSkip", build).apply(); return; }      // недокачали — попробуем завтра
                        if (!looksLikeText(rel, body)) {      // приехало сжатое или битое: такую версию не берём вовсе
                            deleteTree(tmp); prefs.edit().putString("webSkip", build).apply(); return;
                        }
                        File f = new File(tmp, rel);
                        File parent = f.getParentFile();
                        if (parent != null && !parent.isDirectory() && !parent.mkdirs()) { deleteTree(tmp); return; }
                        FileOutputStream out = new FileOutputStream(f);
                        try { out.write(body); } finally { try { out.close(); } catch (Throwable ignored) { } }
                    }
                    File dst = new File(getFilesDir(), "web/" + build);
                    deleteTree(dst);
                    if (!tmp.renameTo(dst)) { deleteTree(tmp); return; }
                    String old = prefs.getString("web", null);
                    prefs.edit().putString("web", build).remove("webSkip").apply();
                    if (old != null && !old.equals(build)) deleteTree(new File(getFilesDir(), "web/" + old));
                    embeddedReady = false;      // список файлов перечитаем при следующем обращении
                    assetCache.clear();
                } catch (Throwable e) {
                    prefs.edit().putLong(WEB_MARK, System.currentTimeMillis()).apply();      // сеть подвела — не чаще раза в сутки
                }
            }
        }).start();
    }

    /** Какая копия интерфейса сейчас главная: скачанная (её отпечаток) или встроенная. */
    private String currentWebBuild() {
        String v = prefs.getString("web", null);
        if (v != null) return v;
        return embeddedBuild();
    }

    private static String fetchText(String url) {
        byte[] b = fetchBytes(url);
        return b == null ? null : new String(b, StandardCharsets.UTF_8);
    }

    /**
     * Ответ прокси/VPN может прийти сжатым, а заголовок Content-Encoding по дороге теряется (так бывает у мобильных
     * операторов и в VPN). Тогда в кеш интерфейса попадают бинарные байты, и WebView показывает вместо страницы
     * абракадабру из значков — ровно то, на что жаловались друзья. Поэтому распознаём сжатие по первым байтам
     * и распаковываем сами, не надеясь на заголовок.
     */
    private static byte[] unpack(byte[] b) {
        if (b == null || b.length < 2) return b;
        try {
            if ((b[0] & 0xFF) == 0x1F && (b[1] & 0xFF) == 0x8B) {          // gzip
                java.util.zip.GZIPInputStream in = new java.util.zip.GZIPInputStream(new java.io.ByteArrayInputStream(b));
                java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream(Math.max(1024, b.length * 4));
                byte[] buf = new byte[16384]; int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                in.close();
                return out.toByteArray();
            }
            if ((b[0] & 0xFF) == 0x78 && ((b[0] & 0xFF) * 256 + (b[1] & 0xFF)) % 31 == 0) return inflateZlib(b);   // zlib
        } catch (Throwable e) { return b; }
        return b;
    }

    private static byte[] inflateZlib(byte[] b) throws java.io.IOException, java.util.zip.DataFormatException {
        java.util.zip.Inflater inf = new java.util.zip.Inflater(false);
        inf.setInput(b, 0, b.length);
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream(Math.max(1024, b.length * 4));
        byte[] buf = new byte[16384]; int n;
        while (!inf.finished()) { n = inf.inflate(buf); if (n == 0) { if (inf.needsInput() || inf.needsDictionary()) break; } else out.write(buf, 0, n); }
        inf.end();
        return out.toByteArray();
    }

    /** Интерфейс — это текст. Если из сети пришли двоичные данные (сжатие, ошибка прокси), такую копию брать нельзя. */
    private static boolean looksLikeText(String rel, byte[] b) {
        if (b == null || b.length == 0) return false;
        if (rel.endsWith(".woff2") || rel.endsWith(".png") || rel.endsWith(".jpg") || rel.endsWith(".jpeg")
                || rel.endsWith(".webp") || rel.endsWith(".gif") || rel.endsWith(".ico") || rel.endsWith(".avif")) return true;
        if ((b[0] & 0xFF) == 0x1F && b.length > 1 && (b[1] & 0xFF) == 0x8B) return false;      // нераспакованный gzip
        // Честная проверка: текст интерфейса — всегда корректный UTF-8. Бинарный файл, показанный как текст,
        // почти никогда не проходит эту проверку, а русские буквы проходят всегда.
        try {
            java.nio.charset.CharsetDecoder dec = java.nio.charset.StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(java.nio.charset.CodingErrorAction.REPORT)
                    .onUnmappableCharacter(java.nio.charset.CodingErrorAction.REPORT);
            dec.decode(java.nio.ByteBuffer.wrap(b));
            return true;
        } catch (Throwable e) { return false; }
    }

    /** GET без кеша. Приложение и так качает только интерфейс и только раз в сутки. */
    private static byte[] fetchBytes(String url) {
        java.net.HttpURLConnection c = null;
        try {
            c = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
            c.setConnectTimeout(15000); c.setReadTimeout(30000);
            c.setRequestProperty("Accept-Encoding", "identity");
            c.setRequestProperty("User-Agent", "NudistAndroid-web");
            if (c.getResponseCode() != 200) return null;
            InputStream in = c.getInputStream();
            try {
                java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream(Math.max(1024, c.getContentLength()));
                byte[] buf = new byte[16384]; int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                return unpack(out.toByteArray());
            } finally { try { in.close(); } catch (Throwable ignored) { } }
        } catch (Throwable e) {
            return null;
        } finally { if (c != null) c.disconnect(); }
    }

    private String serverBuild(String server) {
        try {
            String v = fetchText(server + "/api/version");
            if (v == null) return null;
            org.json.JSONObject j = new org.json.JSONObject(v);
            String b = j.optString("build", "");
            return b.matches("[0-9a-f]{6,64}") ? b : null;
        } catch (Throwable e) { return null; }
    }

    private static void deleteTree(File f) {
        if (f == null || !f.exists()) return;
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteTree(k);
        f.delete();
    }

    /** Нажали уведомление «Вышло обновление» — открываем приложение сразу на окне обновления. */
    private static boolean updateFrom(Intent intent) {
        if (intent == null) return false;
        if (PushService.ACTION_UPDATE.equals(intent.getAction())) return true;
        // Тот же смысл может прийти ссылкой: сервер шлёт push со ссылкой на /#update, телефон открывает её в «Нудисте».
        String d = intent.getDataString();
        return d != null && d.indexOf("#update") >= 0;
    }

    /** Чат из нажатого уведомления. Идентификатор проверяем: он попадает в адрес страницы. */
    private static String chatFrom(Intent intent) {
        if (intent == null || !PushService.ACTION_OPEN.equals(intent.getAction())) return null;
        String chat = intent.getStringExtra(PushService.EXTRA_CHAT);
        return chat != null && chat.matches("[A-Za-z0-9_-]{1,80}") ? chat : null;
    }

    // ───── мост для страницы: window.NudistApp

    /** Через этот объект мессенджер сообщает приложению, что человек вошёл или вышел, и просит разрешения. */
    private class Bridge {
        @JavascriptInterface
        public int version() {
            return APP_VERSION;
        }

        // ───── автообновление: приложение само скачивает новую сборку и ставит её одним нажатием
        /** Состояние: idle — ничего, downloading — качаем, ready — файл готов к установке, fail — не вышло. */
        @JavascriptInterface
        public String updateState() {
            return updateState;
        }

        /** Сколько уже скачано, в процентах (0…100). */
        @JavascriptInterface
        public int updateProgress() {
            return updatePercent;
        }

        /** Скачать новую сборку в фоне. Повторный вызов во время загрузки ничего не делает. */
        @JavascriptInterface
        public void updateFetch() {
            runOnUiThread(new Runnable() { @Override public void run() { fetchUpdate(); } });
        }

        /** Открыть установку уже скачанного файла. Телефон спросит разрешение на установку — это его защита. */
        @JavascriptInterface
        public void updateInstall() {
            runOnUiThread(new Runnable() { @Override public void run() { installUpdate(); } });
        }

        /** Страница собралась: заставка больше не нужна. Зовётся из интерфейса при каждом запуске. */
        @JavascriptInterface
        public void pageReady() {
            runOnUiThread(new Runnable() { @Override public void run() {
                if (panel != null && "loading".equals(panel.getTag())) hidePanel();
                mainChecks = 0;
                shownFixes = 0;
            } });
        }

        /** Скачать интерфейс заново, не дожидаясь суточной проверки. Помогает, когда страница не показалась. */
        @JavascriptInterface
        public void retryWeb() {
            runOnUiThread(new Runnable() { @Override public void run() {
                try { prefs.edit().remove("web").remove("webSkip").putLong(WEB_MARK, 0).apply(); } catch (Throwable e) { /* как есть */ }
                embeddedReady = false;
                try { assetCache.clear(); } catch (Throwable e) { /* кеш и так перечитается */ }
                syncEmbedded();
                showBuiltinPage(false);      // свежая страница подхватится при следующем открытии
            } });
        }

        /** Переезд: страница с прежнего адреса отдаёт то, что приложение хранило в браузере (ключ сеанса, настройки, ключи секретных чатов). Принимается только в момент переезда. */
        @JavascriptInterface
        public void moved(final String json) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (!moving) return;
                    moving = false;
                    if (json != null && json.length() > 2 && json.length() < 400000) prefs.edit().putString("move", json).apply();
                    open(moveServer, moveChat, false);
                }
            });
        }

        /** Страница загрузилась и спрашивает: не ждут ли файлы, которыми поделились. Ответ придёт событием nudist-share. */
        @JavascriptInterface
        public void shareAsk() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    announceShare();
                }
            });
        }

        /** Список ждущих файлов: [{i, name, size, type}]. Без верного пропуска — пусто. */
        @JavascriptInterface
        public String shared(String key) {
            JSONArray a = new JSONArray();
            if (!shareKey.equals(key)) return a.toString();
            synchronized (shared) {
                for (int i = 0; i < shared.size(); i++) {
                    Shared f = shared.get(i);
                    try {
                        JSONObject o = new JSONObject();
                        o.put("i", i);
                        o.put("name", f.name);
                        o.put("size", f.file.length());
                        o.put("type", f.type);
                        a.put(o);
                    } catch (Throwable e) { /* такого файла просто не будет в списке */ }
                }
            }
            return a.toString();
        }

        /** Кусок файла в base64: страница собирает из кусков файл и загружает его как обычно. */
        @JavascriptInterface
        public String sharedChunk(String key, int i, int off, int len) {
            if (!shareKey.equals(key) || off < 0 || len <= 0) return "";
            File file;
            synchronized (shared) {
                if (i < 0 || i >= shared.size()) return "";
                file = shared.get(i).file;
            }
            RandomAccessFile in = null;
            try {
                in = new RandomAccessFile(file, "r");
                if (off >= in.length()) return "";
                byte[] buf = new byte[(int) Math.min(Math.min(len, 1 << 20), in.length() - off)];
                in.seek(off);
                in.readFully(buf);
                return Base64.encodeToString(buf, Base64.NO_WRAP);
            } catch (Throwable e) {
                return "";
            } finally {
                try {
                    if (in != null) in.close();
                } catch (Throwable e) { /* уже закрыт */ }
            }
        }

        /** Страница всё забрала: копии можно стереть. */
        @JavascriptInterface
        public void sharedDone(String key) {
            if (!shareKey.equals(key)) return;
            synchronized (shared) {
                for (Shared f : shared) f.file.delete();
                shared.clear();
            }
        }

        /**
         * Страница сообщает: человек вошёл, вышел или переключил уведомления. Ключ сеанса сюда не передаётся:
         * приложение само читает его из главной страницы (см. syncSession). Так посторонняя вставка
         * (мини-приложение, карта) не может подсунуть чужой ключ.
         */
        /** Что происходит в мессенджере: {section, unread, authed}. Приложение показывает нижнюю панель и значок непрочитанного. */
        @JavascriptInterface
        public int navHeight() {
            return NAV_H;
        }

        @JavascriptInterface
        public void nav(final String json) {
            if (json == null || json.length() > 500) return;
            navState(json);
        }

        @JavascriptInterface
        public void sync() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    syncSession();
                }
            });
        }

        /** {"version":13,"allowed":true,"battery":false}: разрешены ли уведомления и снято ли ограничение батареи. */
        @JavascriptInterface
        public String state() {
            boolean allowed = true, battery = true;
            try {
                allowed = ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).areNotificationsEnabled();
                battery = ((PowerManager) getSystemService(POWER_SERVICE)).isIgnoringBatteryOptimizations(getPackageName());
            } catch (Throwable e) { /* считаем, что всё разрешено */ }
            return "{\"version\":" + APP_VERSION + ",\"allowed\":" + allowed + ",\"battery\":" + battery + ",\"on\":" + (prefs.getString(PushService.K_TOKEN, null) != null) + "}";
        }

        @JavascriptInterface
        public void askNotify() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    requestNotify(true);
                }
            });
        }

        /** Просит не усыплять приложение: иначе на спящем телефоне уведомления приходят с опозданием. */
        @JavascriptInterface
        public void askBattery() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getPackageName())));
                    } catch (Throwable e) {
                        try {
                            startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
                        } catch (Throwable e2) {
                            Toast.makeText(MainActivity.this, "Откройте настройки телефона → Батарея → Нудист → Без ограничений", Toast.LENGTH_LONG).show();
                        }
                    }
                }
            });
        }
    }

    // ───── «Поделиться» → «Нудист»: аудио из любой программы попадает в «Мою музыку»

    private static String randomKey() {
        byte[] b = new byte[16];
        new SecureRandom().nextBytes(b);
        StringBuilder sb = new StringBuilder();
        for (byte x : b) sb.append(String.format("%02x", x & 0xff));
        return sb.toString();
    }

    private File shareDir() {
        return new File(getCacheDir(), "share");
    }

    private void clearShareDir() {
        try {
            File[] old = shareDir().listFiles();
            if (old != null) for (File f : old) f.delete();
        } catch (Throwable e) { /* кэш почистит система */ }
    }

    /** Разбирает «Поделиться»: копирует аудио в кэш (пока действует разрешение на чтение) и зовёт страницу. */
    private void takeShare(Intent intent) {
        if (intent == null || (intent.getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0) return;
        final ArrayList<Uri> uris = new ArrayList<Uri>();
        try {
            String act = intent.getAction();
            if (Intent.ACTION_SEND.equals(act)) {
                Uri u = intent.getParcelableExtra(Intent.EXTRA_STREAM);
                if (u != null) uris.add(u);
            } else if (Intent.ACTION_SEND_MULTIPLE.equals(act)) {
                ArrayList<Uri> l = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
                if (l != null) for (Uri u : l) if (u != null) uris.add(u);
            }
        } catch (Throwable e) { /* чужая программа прислала что-то странное */ }
        if (uris.isEmpty()) return;
        Toast.makeText(this, "Забираю музыку…", Toast.LENGTH_SHORT).show();
        new Thread(new Runnable() {
            @Override
            public void run() {
                int ok = 0;
                for (Uri u : uris) {
                    synchronized (shared) {
                        if (shared.size() >= SHARE_FILES) break;
                    }
                    Shared f = copyShared(u);
                    if (f == null) continue;
                    synchronized (shared) {
                        shared.add(f);
                    }
                    ok++;
                }
                final int got = ok;
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        if (got == 0) Toast.makeText(MainActivity.this, "Не получилось прочитать файл. Нужен аудиофайл до 100 МБ.", Toast.LENGTH_LONG).show();
                        else announceShare();
                    }
                });
            }
        }, "nudist-share").start();
    }

    /** Копия одного файла. Принимаем только content://: адрес вида file:// мог бы указать на данные самого приложения. */
    private Shared copyShared(Uri u) {
        if (!"content".equals(u.getScheme())) return null;
        String name = null, type = null;
        Cursor c = null;
        try {
            type = getContentResolver().getType(u);
            c = getContentResolver().query(u, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null);
            if (c != null && c.moveToFirst() && !c.isNull(0)) name = c.getString(0);
        } catch (Throwable e) { /* имя придумаем сами */ } finally {
            if (c != null) c.close();
        }
        if (type == null) type = "audio/mpeg";
        if (name == null || name.trim().isEmpty()) name = "Трек";
        name = name.replaceAll("[\\\\/\\p{Cntrl}]", " ").trim();
        if (name.length() > 150) name = name.substring(name.length() - 150);
        if (!name.matches("(?i).*\\.(mp3|m4a|aac|ogg|oga|opus|wav|flac)$")) {
            String ext = type.contains("mp4") || type.contains("m4a") ? "m4a" : type.contains("ogg") ? "ogg" : type.contains("opus") ? "opus" : type.contains("flac") ? "flac"
                    : type.contains("wav") ? "wav" : type.contains("aac") ? "aac" : type.contains("mpeg") || type.contains("mp3") ? "mp3" : null;
            if (ext != null) name = name + "." + ext;
        }
        File dir = shareDir();
        dir.mkdirs();
        File out = new File(dir, "s" + System.nanoTime());
        InputStream in = null;
        FileOutputStream os = null;
        boolean good = false;
        try {
            in = getContentResolver().openInputStream(u);
            if (in == null) return null;
            os = new FileOutputStream(out);
            byte[] buf = new byte[65536];
            long total = 0;
            int n;
            while ((n = in.read(buf)) > 0) {
                total += n;
                if (total > SHARE_MAX) return null;
                os.write(buf, 0, n);
            }
            good = total > 0;
        } catch (Throwable e) {
            return null;
        } finally {
            try {
                if (in != null) in.close();
            } catch (Throwable e) { /* уже закрыт */ }
            try {
                if (os != null) os.close();
            } catch (Throwable e) { /* уже закрыт */ }
            if (!good) out.delete();
        }
        if (!good) return null;
        Shared f = new Shared();
        f.file = out;
        f.name = name;
        f.type = type;
        return f;
    }

    /** Сообщает главной странице мессенджера, что её ждут файлы, и передаёт пропуск. На чужой странице молчит. */
    private void announceShare() {
        synchronized (shared) {
            if (shared.isEmpty()) return;
        }
        final String server = prefs.getString("server", null);
        String at = web == null ? null : web.getUrl();
        if (server == null || at == null || !(at.equals(server) || at.startsWith(server + "/"))) return;
        try {
            web.evaluateJavascript("(function(){try{window.dispatchEvent(new CustomEvent('nudist-share',{detail:'" + shareKey + "'}));}catch(e){}})()", null);
        } catch (Throwable e) { /* страница ещё грузится: она сама спросит через shareAsk() */ }
    }

    /** Читает ключ сеанса из хранилища главной страницы и включает или выключает службу уведомлений. */
    private void syncSession() {
        final String server = prefs.getString("server", null);
        String at = web == null ? null : web.getUrl();
        if (server == null || at == null || !(at.equals(server) || at.startsWith(server + "/"))) return;      // открыта не страница мессенджера
        try {
            web.evaluateJavascript(
                "(function(){try{var t=JSON.parse(localStorage.getItem('nudist.token'));return JSON.stringify({t:typeof t==='string'?t:'',off:localStorage.getItem('nudist.app.push')==='false'})}catch(e){return ''}})()",
                new ValueCallback<String>() {
                    @Override
                    public void onReceiveValue(String v) {
                        try {
                            Object raw = new org.json.JSONTokener(v).nextValue();
                            if (!(raw instanceof String) || ((String) raw).length() == 0) return;
                            org.json.JSONObject o = new org.json.JSONObject((String) raw);
                            String token = o.optString("t", "");
                            if (!server.equals(prefs.getString("server", null))) return;
                            if (o.optBoolean("off", false) || token.length() < 8 || token.length() > 400) {
                                prefs.edit().remove(PushService.K_TOKEN).remove(PushService.K_SINCE).apply();
                                PushService.stop(MainActivity.this);
                                return;
                            }
                            if (!token.equals(prefs.getString(PushService.K_TOKEN, null))) {
                                prefs.edit().putString(PushService.K_TOKEN, token).remove(PushService.K_SINCE).apply();
                                PushService.stop(MainActivity.this);      // служба прежнего аккаунта, если была
                            }
                            PushService.channels(MainActivity.this);
                            if (!prefs.getBoolean("askedNotify", false)) {
                                prefs.edit().putBoolean("askedNotify", true).apply();
                                requestNotify(false);
                            }
                            PushService.start(MainActivity.this);
                        } catch (Throwable e) { /* страница ответила не тем: оставляем как было */ }
                    }
                });
        } catch (Throwable e) { /* страница ещё не готова */ }
    }

    /** Разрешение на уведомления (Android 13+). Если человек уже отказал насовсем, открываем настройки приложения. */
    private void requestNotify(boolean openSettings) {
        boolean allowed = ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).areNotificationsEnabled();
        if (allowed) return;
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED
                && (!openSettings || shouldShowRequestPermissionRationale("android.permission.POST_NOTIFICATIONS") || !prefs.getBoolean("notifyDenied", false))) {
            requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, REQ_NOTIFY);
            return;
        }
        if (!openSettings) return;
        try {
            startActivity(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName()));
        } catch (Throwable e) {
            Toast.makeText(this, "Откройте настройки телефона → Приложения → Нудист → Уведомления", Toast.LENGTH_LONG).show();
        }
    }

    // ───── Интерфейс внутри приложения
    // Мессенджер целиком лежит в APK (assets/public): код, стили, шрифты, значки. WebView не ходит за ними в сеть —
    // MainActivity отдаёт файлы из assets через shouldInterceptRequest, поэтому при медленном интернете интерфейс
    // открывается сразу, а не после загрузки мегабайта скриптов. Сеть нужна только данным: /api, /ws, /u (файлы) и /nudist.apk.
    // Встроенная копия привязана к номеру сборки: после каждого обновления сервера приложение забирает новый интерфейс
    // один раз и кладёт во внутреннее хранилище (это и есть «обновления без переустановки»).
    private static final String EMBEDDED_ROOT = "public/";
    private final Map<String, byte[]> assetCache = new HashMap<String, byte[]>();
    private java.util.Set<String> overlayFiles;          // список файлов скачанной новой версии
    private volatile boolean embeddedReady;

    /** Встроенная копия интерфейса: assets из APK плюс один раз скачанное обновление поверх. */
    private final class Embedded {
        String lang;              // язык системы: ru / en — от него зависит язык интерфейса (см. index.html)
        boolean ready() { return embeddedReady; }
    }

    /** Путь к файлу во внутреннем хранилище, где лежит скачанная новая версия интерфейса (или null). */
    private File overlayDir() {
        if (!embeddedReady) prepareEmbedded();
        String v = prefs.getString("web", null);
        if (v == null) return null;
        File d = new File(getFilesDir(), "web/" + v);
        return d.isDirectory() ? d : null;
    }

    /** Один раз при запуске: читаем список встроенных файлов, чтобы знать, что можно отдавать из APK. */
    private void prepareEmbedded() {
        if (embeddedReady) return;
        try {
            overlayFiles = new java.util.HashSet<String>();
            File ov = overlayDirNoList();
            if (ov != null) {
                // Проверяем главную страницу скачанной версии. Если она пришла сжатой или битой (так бывало при VPN
                // и у мобильных операторов), показывать её нельзя: человек видел вместо приложения экран с ромбиками.
                // Тогда стираем скачанную версию целиком — приложение вернётся к встроенной и завтра скачает заново.
                byte[] idx = null;
                File f = new File(ov, "index.html");
                if (f.isFile()) { try { idx = readFile(f); } catch (Throwable e) { idx = null; } }
                if (idx == null || !looksLikeText("index.html", idx)) {
                    deleteTree(ov);
                    prefs.edit().remove("web").remove("webSkip").apply();
                    assetCache.clear();
                    overlayFiles = new java.util.HashSet<String>();
                    embeddedReady = true;
                    return;
                }
                listFiles(ov, "", overlayFiles);        // рекурсивно: css/… и js/… лежат в подкаталогах
            }
        } catch (Throwable e) { overlayFiles = new java.util.HashSet<String>(); }
        embeddedReady = true;
    }

    /** Все файлы каталога и его подкаталогов — путями относительно него (js/app.js, css/base.css). */
    private static void listFiles(File dir, String prefix, java.util.Set<String> out) {
        File[] list = dir.listFiles();
        if (list == null) return;
        for (File f : list) {
            if (f.isDirectory()) listFiles(f, prefix + f.getName() + "/", out);
            else out.add(prefix + f.getName());
        }
    }

    private File overlayDirNoList() {
        String v = prefs.getString("web", null);
        if (v == null) return null;
        File d = new File(getFilesDir(), "web/" + v);
        return d.isDirectory() ? d : null;
    }

    /** Открытые текстовые ресурсы держим: модули грузятся пачками, и читать их из assets каждый раз медленно. */
    private static boolean textType(String mime) {
        return mime != null && (mime.startsWith("text/") || mime.endsWith("javascript") || mime.endsWith("json") || mime.endsWith("xml") || mime.endsWith("svg"));
    }

    private static String mimeOf(String path) {
        String p = path.toLowerCase(Locale.ROOT);
        // charset в самом типе: WebView без него угадывает кодировку по первым байтам и на сжатом ответе
        // (gzip начинается с 0x1F 0x8B) показывал вместо русских букв «иероглифы» — этим страдали друзья на Xiaomi/Redmi.
        if (p.endsWith(".html")) return "text/html; charset=utf-8";
        if (p.endsWith(".js") || p.endsWith(".mjs")) return "application/javascript; charset=utf-8";
        if (p.endsWith(".css")) return "text/css; charset=utf-8";
        if (p.endsWith(".json") || p.endsWith(".webmanifest")) return "application/manifest+json; charset=utf-8";
        if (p.endsWith(".svg")) return "image/svg+xml; charset=utf-8";
        String ext = MimeTypeMap.getFileExtensionFromUrl(p);
        String m = ext == null ? null : MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
        return m == null ? "application/octet-stream" : m;
    }

    /** Файл интерфейса из APK (assets) или null, если такого нет. */
    private byte[] assetFile(String path) {
        byte[] cached = assetCache.get(path);
        if (cached != null) return cached;
        InputStream in = null;
        try {
            in = getAssets().open(EMBEDDED_ROOT + path);
            java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream(Math.max(1024, in.available()));
            byte[] buf = new byte[16384]; int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            byte[] b = out.toByteArray();
            if (cachedStatic(path)) assetCache.put(path, b);
            return b;
        } catch (Throwable e) {
            return null;
        } finally { try { if (in != null) in.close(); } catch (Throwable ignored) { } }
    }

    /**
     * Своя страница вместо ответа сервера, когда интерфейса нет ни в APK, ни в скачанной копии.
     * Без неё WebView показывал ответ сервера как файл: человек видел разметку и стили простынёй.
     * Здесь всё своё, без единого запроса за файлами, а кнопки повторяют штатные методы оболочки.
     */
    private void showBuiltinPage(boolean offline) {
        if (web == null) return;
        String server;
        try { server = String.valueOf(prefs.getString("server", "")); } catch (Throwable e) { server = ""; }
        String html = "<!doctype html><html lang=\"ru\"><head><meta charset=\"utf-8\">"
                + "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">"
                + "<title>Нудист</title><style>"
                + "html,body{margin:0;height:100%;background:#14251C;color:#EAF3EE;font:16px/1.5 Roboto,system-ui,sans-serif}"
                + ".box{max-width:360px;margin:0 auto;padding:22vh 24px 0;text-align:center}"
                + "h1{font-size:22px;margin:0 0 10px}p{opacity:.75;margin:0 0 22px;font-size:15px}"
                + "button{display:block;width:100%;font:inherit;font-weight:600;padding:13px;border:0;border-radius:14px;margin:0 0 10px;background:#2BB36A;color:#fff}"
                + "button.ghost{background:rgba(255,255,255,.08);color:#EAF3EE}"
                + "</style></head><body><div class=\"box\"><h1>"
                + (offline ? "Интернета нет" : "Не получилось раздеться")
                + "</h1><p>" + (offline ? "Проверьте связь и попробуйте ещё раз." : "Приложение не смогло показать интерфейс. Обычно помогает повторить.") + "</p>"
                + "<button onclick=\"location.reload()\">Попробовать снова</button>"
                + "<button class=\"ghost\" onclick=\"try{window.NudistApp.retryWeb()}catch(e){location.reload()}\">Скачать интерфейс заново</button>"
                + "<p style=\"margin-top:18px;font-size:12px;opacity:.45;word-break:break-all\">" + server.replace("<", "&lt;") + "</p>"
                + "</div></body></html>";
        web.loadDataWithBaseURL(server + "/", html, "text/html", "utf-8", null);
    }

    /**
     * Проверка главной страницы после загрузки.
     * Бывает, что WebView получает наш index.html с типом «обычный текст» (так приходит кешированный документ
     * после перезагрузки, а VPN-прокси умеет испортить заголовок). Тогда человек видит вместо приложения
     * разметку файлом: теги и стили простынёй. Скрипты в такой странице не выполняются,
     * поэтому спасает только приложение: замечаем по содержимому и один раз перерисовываем из памяти.
     */
    private void checkMainFrame(final String url) {
        if (web == null) return;
        web.evaluateJavascript("(function(){try{"
                + "var b=document.body;if(!b)return 'x';"
                + "var t=(b.textContent||'');while(t.length&&t.charCodeAt(0)<33)t=t.slice(1);t=t.slice(0,40);"
                + "if(t.indexOf('<!doctype')===0||t.indexOf('<html')===0)return 'text';"      // нам показали файл, а не страницу
                + "if(document.getElementById('app')||document.getElementById('start'))return 'ok';"
                + "return t.length>0?'ok':'empty';"      // пустая главная — это экран загрузки или ошибки, не трогаем
                + "}catch(e){return \"ok\"}})()", new android.webkit.ValueCallback<String>() {
            @Override public void onReceiveValue(String v) {
                if (v == null || !v.contains("text")) return;
                // Сначала выбрасываем кеш движка: разметка пришла файлом именно из него (VPN, прокси, сбой загрузки).
                // Иначе при следующем запуске WebView достанет ту же испорченную копию, и всё повторится.
                try { web.clearCache(true); } catch (Throwable e) { /* не страшно */ }
                if (mainChecks >= 2) { showBuiltinPage(false); return; }      // два раза не вышло — показываем свою страницу
                mainChecks++;
                String server = prefs.getString("server", null);
                if (server == null) return;
                Uri u = Uri.parse(server + "/");
                WebResourceResponse r = embeddedResponse(u, server);      // берём свежую встроенную страницу
                if (r == null) { mainChecks = 0; showBuiltinPage(false); return; }      // интерфейса в памяти нет — не оставляем человеку разметку
                String html;
                try {
                    java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
                    byte[] buf = new byte[8192]; int n;
                    java.io.InputStream in = r.getData();
                    while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                    in.close();
                    html = new String(out.toByteArray(), StandardCharsets.UTF_8);
                } catch (Throwable e) { mainChecks = 0; return; }
                try { html = new String(personalizeIndex(html.getBytes(StandardCharsets.UTF_8)), StandardCharsets.UTF_8); } catch (Throwable e) { /* как есть */ }
                web.loadDataWithBaseURL(server + "/", html, "text/html", "utf-8", url);
            }
        });
    }

    /**
     * Короткая проверка после каждой загрузки: показала ли главная страница хоть что-то живое — приложение или заставку.
     * Если на экране пусто (сервер ответил, а файлы не дошли), человек видел белое окно. Тогда один раз показываем свою страницу.
     */
    private void checkShown(final String url) {
        if (web == null) return;
        final String u = String.valueOf(url);
        web.postDelayed(new Runnable() {
            @Override public void run() {
                if (web == null || u.equals("null") || u.startsWith("data:") || u.startsWith("about:")) return;
                String server = prefs.getString("server", "");
                if (server == null || !u.startsWith(server)) return;
                try {
                    web.evaluateJavascript("(function(){try{var b=document.body;if(!b)return 'empty';"
                            + "var t=(b.textContent||'').trim();while(t.length&&t.charCodeAt(0)<33)t=t.slice(1);"
                            + "if(t.indexOf('<!doctype')===0||t.indexOf('<html')===0)return 'text';"      // разметку показывает checkMainFrame
                            + "if(document.getElementById('app')||document.getElementById('start'))return 'ok';"
                            + "return t.length>0?'ok':'empty';}catch(e){return 'ok'}})()", new android.webkit.ValueCallback<String>() {
                        @Override public void onReceiveValue(String v) {
                            if (v == null || !v.contains("empty")) return;
                            if (shownFixes >= 1) return;
                            shownFixes++;
                            showBuiltinPage(!networkUp());
                        }
                    });
                } catch (Throwable e) { /* страница не отвечает — ничего не трогаем */ }
            }
        }, 1500);
    }

    /** Есть ли сейчас сеть (по мнению системы). */
    private boolean networkUp() {
        try {
            android.net.ConnectivityManager cm = (android.net.ConnectivityManager) getSystemService(android.content.Context.CONNECTIVITY_SERVICE);
            if (cm == null) return true;
            android.net.NetworkInfo ni = cm.getActiveNetworkInfo();
            return ni != null && ni.isConnected();
        } catch (Throwable e) { return true; }
    }

    // ───── автообновление сборки
    // Раньше человеку нужно было самому скачать APK и найти его в «Загрузках». Теперь приложение качает
    // новую сборку само (в фоне, по обычному Wi-Fi или мобильному интернету — файл меньше мегабайта)
    // и показывает в интерфейсе одну кнопку «Установить». Установку подтверждает человек — так требует Android.

    /** Где лежит готовая к установке сборка (во внутреннем хранилище приложения). */
    private File updateFile() { return new File(getFilesDir(), UPD); }

    /** Есть ли уже скачанная сборка, и не от другой ли она версии. */
    private boolean updateReady() {
        File f = updateFile();
        if (!f.isFile() || f.length() < 300 * 1024) return false;      // обрывок загрузки — не в счёт
        String seen = prefs.getString("updCode", "");
        if (seen != null && seen.length() > 0 && !seen.equals(String.valueOf(latestCode))) return false;
        return true;
    }

    private volatile int latestCode;      // версия, которую предложил сервер

    /** Скачать новую сборку. Вызывается со страницы, когда она увидела, что вышла новая версия. */
    private void fetchUpdate() {
        if ("downloading".equals(updateState)) return;
        String server = prefs.getString("server", null);
        if (server == null) return;
        latestCode = Math.max(latestCode, latestCodeFromPrefs());
        // адрес и версию уточняем у сервера: страница могла знать старое
        new Thread(new Runnable() {
            @Override public void run() {
                try {
                    String v = fetchText(server + "/api/version");
                    org.json.JSONObject o = new org.json.JSONObject(v);
                    org.json.JSONObject apk = o.optJSONObject("apk");
                    int code = apk == null ? 0 : apk.optInt("code", 0);
                    if (code > 0) latestCode = code;
                    prefs.edit().putString("updCode", String.valueOf(latestCode)).apply();
                    if (code <= APP_VERSION) { updateState = "idle"; return; }               // уже свежие
                    if (updateReady()) { updateState = "ready"; return; }
                    updateState = "downloading"; updatePercent = 0;
                    String url = server + "/nudist.apk";
                    java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
                    c.setConnectTimeout(15000); c.setReadTimeout(60000);
                    c.setRequestProperty("User-Agent", "NudistAndroid-update/" + APP_VERSION);
                    long total = c.getContentLength();
                    java.io.InputStream in = c.getInputStream();
                    File tmp = new File(getFilesDir(), UPD + ".part");
                    java.io.FileOutputStream out = new java.io.FileOutputStream(tmp);
                    byte[] buf = new byte[16384]; long got = 0; int n;
                    try {
                        while ((n = in.read(buf)) > 0) { out.write(buf, 0, n); got += n; if (total > 0) updatePercent = (int) (got * 100 / total); }
                    } finally { try { out.close(); } catch (Throwable ignored) { } try { in.close(); } catch (Throwable ignored) { } c.disconnect(); }
                    if (total > 0 && got < total) { tmp.delete(); updateState = "fail"; return; }      // обрыв — попробуем позже
                    File dst = updateFile();
                    dst.delete();
                    if (!tmp.renameTo(dst)) { tmp.delete(); updateState = "fail"; return; }
                    updatePercent = 100;
                    updateState = "ready";
                } catch (Throwable e) {
                    updateState = "fail";
                }
            }
        }).start();
    }

    private int latestCodeFromPrefs() { try { return Integer.parseInt(prefs.getString("updCode", "0")); } catch (Throwable e) { return 0; } }

    /** Открыть установщик Android для скачанного файла. */
    private void installUpdate() {
        File f = updateFile();
        if (!f.isFile()) { updateState = "idle"; return; }
        // Android 8+: пока для «Нудиста» не включено «Установка неизвестных приложений», система молча гасит
        // запрос на установку, и человек видел, что кнопка ничего не делает. Сначала сами открываем этот экран.
        if (!canInstall()) { openInstallSettings(); return; }
        launchInstaller();
    }

    /** Разрешена ли установка сборок из самого приложения. На старых Android такого разрешения нет — считаем, что да. */
    private boolean canInstall() {
        try {
            if (android.os.Build.VERSION.SDK_INT < 26) return true;
            return getPackageManager().canRequestPackageInstalls();
        } catch (Throwable e) { return true; }
    }

    /** Экран «Установка неизвестных приложений» с уже выбранным «Нудистом». Вернулись — установка продолжится сама. */
    private void openInstallSettings() {
        installAfterSettings = true;
        try {
            Intent i = new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName()));
            startActivity(i);
            toast("Разрешите установку — и вернитесь: сборка поставится сама");
        } catch (Throwable e) {
            installAfterSettings = false;
            launchInstaller();      // не вышло — пробуем обычным путём
        }
    }

    private void launchInstaller() {
        try {
            Uri apk = Uri.parse("content://" + UpdateProvider.AUTHORITY + "/" + UPD);
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(apk, "application/vnd.android.package-archive");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (Throwable e) {
            toast("Не получилось открыть установку. Скачайте файл со страницы /start в браузере.");
        }
    }

    /** Что кешируем в памяти: код и шрифты (их много и они мелкие), картинки читаем по мере надобности. */
    private static boolean cachedStatic(String p) {
        return p.endsWith(".js") || p.endsWith(".css") || p.endsWith(".woff2") || p.endsWith(".svg") || p.endsWith(".json") || p.endsWith(".webmanifest");
    }

    /**
     * Ответ на запрос страницы: главная — index.html из APK с подставленными адресами сайта,
     * остальное — файл из APK или из скачанного обновления. Данные (/api, /ws, /u, /bot, /hook) не перехватываем:
     * они идут на сервер как обычно.
     */
    private WebResourceResponse embeddedResponse(Uri uri, String server) {
        String path = uri.getPath() == null ? "/" : uri.getPath();
        if (path.startsWith("/api/") || path.startsWith("/ws") || path.startsWith("/u/") || path.startsWith("/bot/") || path.startsWith("/hook/") || path.startsWith("/p/")) return null;
        if (path.endsWith(".apk") || path.endsWith(".zip")) return null;      // сборки отдаёт сервер: в памяти интерфейса им не место
        prepareEmbedded();
        boolean main = path.equals("/") || path.equals("/index.html");
        String rel = main ? "index.html" : path.substring(1);
        byte[] body = null;
        File ov = overlayDirNoList();
        if (ov != null && overlayFiles != null && overlayFiles.contains(rel)) {
            try { body = readFile(new File(ov, rel)); } catch (Throwable e) { body = null; }
            // Файл мог испортиться ещё до этой сборки (сжатие, потерянный VPN-прокси заголовок). Тогда молча
            // показываем встроенную копию: лучше старая страница, чем экран с ромбиками.
            if (body != null && !looksLikeText(rel, body)) body = null;
        }
        if (body == null) body = assetFile(rel);
        if (body == null) return null;                       // нет в APK — пусть решает сервер (новые файлы, картинки, страницы)
        String mime = mimeOf(rel);
        Map<String, String> headers = new java.util.HashMap<String, String>();
        headers.put("Cache-Control", "no-cache");
        if (main) headers.put("X-Nudist-Build", String.valueOf(embeddedBuild()));     // страница сверит со сборкой сервера
        // Сжатие отдаём БЕЗ заголовка Content-Encoding: раньше здесь стоял gzip, и на части телефонов
        // (MIUI/HyperOS, WebView с VPN-прокси) заголовок терялся при перехвате — страница показывала
        // вместо русских букв ромбики с вопросами. Проверено по скриншотам друзей.
        // Экономия от gzip того не стоит: файлы и так мелкие и лежат внутри приложения.
        try { if (main) body = personalizeIndex(body); } catch (Throwable e) { /* отдадим как есть */ }
        return new WebResourceResponse(mime, textType(mime) || rel.endsWith(".woff2") ? "utf-8" : null, 200, "OK", headers, new ByteArrayInputStream(body));
    }

    private static byte[] readFile(File f) throws IOException {
        java.io.FileInputStream in = new java.io.FileInputStream(f);
        try {
            java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream((int) Math.max(1024, f.length()));
            byte[] buf = new byte[16384]; int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toByteArray();
        } finally { try { in.close(); } catch (Throwable ignored) { } }
    }

    /**
     * index.html из APK плюс то, что обычно подставляет сервер: полный адрес картинки для превью ссылок
     * и ключ обновления интерфейса. Ключ берём из встроенной копии — по нему приложение видит, что на сервере новее,
     * и один раз забирает новый интерфейс.
     */
    private byte[] personalizeIndex(byte[] raw) {
        String html = new String(raw, StandardCharsets.UTF_8);
        String server = prefs.getString("server", "");
        // в файле стоит относительный /og.png (в браузере его превращает сервер) — здесь подставляем полный адрес сайта
        html = html.replaceAll("(<meta property=\"og:image\" content=\")[^\"]*(\")", "$1" + server + "/og.png$2");
        String build = embeddedBuild();
        if (build != null) html = html.replace("</head>", "<meta name=\"nudist-build\" content=\"" + build + "\" />\n</head>");
        return html.getBytes(StandardCharsets.UTF_8);
    }

    /** Отпечаток встроенной копии интерфейса: совпадает с build сервера, если на сервере тот же код. */
    private String embeddedBuild() {
        try {
            byte[] idx = assetFile("index.html");
            if (idx == null) return null;
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            md.update(idx);
            byte[] h = md.digest();
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < 6; i++) sb.append(String.format("%02x", h[i]));
            return sb.toString();      // 12 символов — как у сервера
        } catch (Throwable e) { return null; }
    }

    // ───── WebView

    private void createWebView() {
        web = new WebView(this);
        web.setBackgroundColor(C_BG);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setGeolocationEnabled(true);      // «Я рядом»: страница просит координаты один раз по нажатию
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportMultipleWindows(false);
        s.setUserAgentString(s.getUserAgentString() + " NudistAndroid/" + APP_VERSION);
        web.setFocusable(true);          // без этого страница не получает высоту окна и рисует окна до самого низа

        CookieManager.getInstance().setAcceptCookie(true);
        web.addJavascriptInterface(new Bridge(), "NudistApp");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                String server = prefs.getString("server", "");
                String scheme = u.getScheme() == null ? "" : u.getScheme();
                if ((scheme.equals("http") || scheme.equals("https")) && sameOrigin(u, Uri.parse(server))) return false;
                // Вставка с другого сайта (официальный плеер Яндекс Музыки) остаётся внутри своей рамки
                if (!request.isForMainFrame() && scheme.equals("https")) return false;
                openExternal(u);
                return true;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                // Интерфейс — из APK (assets/public). Данные по-прежнему с сервера. Это не кеш браузера:
                // файлы лежат внутри приложения и работают даже при медленном интернете.
                try {
                    Uri u = request.getUrl();
                    String server = prefs.getString("server", null);
                    if (server == null || u == null) return null;
                    if (!sameOrigin(u, Uri.parse(server))) return null;
                    return embeddedResponse(u, server);
                } catch (Throwable e) {
                    return null;      // любая беда — пусть грузит сервер, приложение не должно ломаться
                }
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                mainFrameFailed = false;
                lastMainUrl = url;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (!request.isForMainFrame()) return;
                mainFrameFailed = true;
                showError("Сервер не отвечает", String.valueOf(error.getDescription()));
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (!request.isForMainFrame() || response.getStatusCode() < 500) return;
                mainFrameFailed = true;
                showError("Сервер просыпается или недоступен", "Ответ сервера: " + response.getStatusCode());
            }

            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                handler.cancel();
                mainFrameFailed = true;
                showError("Сертификат сервера не прошёл проверку", "Приложение не открывает сайты с недоверенным HTTPS-сертификатом. Проверьте адрес или используйте настоящий сертификат.");
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (!mainFrameFailed) applyMove(url);
                if (!mainFrameFailed && panel != null && ("error".equals(panel.getTag()) || "loading".equals(panel.getTag()))) hidePanel();
                if (!mainFrameFailed) checkMainFrame(url);
                if (!mainFrameFailed) checkShown(url);
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() { handlePermissionRequest(request); }
                });
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    Intent i = params.createIntent();
                    if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                    startActivityForResult(i, REQ_FILE);
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    callback.onReceiveValue(null);
                    toast("На устройстве нет приложения для выбора файлов");
                }
                return true;
            }
        });

        web.setDownloadListener(new android.webkit.DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String disposition, String mime, long length) {
                download(url, userAgent, disposition, mime);
            }
        });

        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        buildNavBar();      // панель поверх страницы: она остаётся на месте, даже когда сервер недоступен
        // Страница узнаёт высоту панели (navigator.nudistNavH) и не рисует окна и меню под неё.
        // Свойство снимается вместе с веб-представлением, поэтому закрываем им внимание: панель одна на всё приложение.
        web.addJavascriptInterface(new NavHeight(), "nudistNavH");
        web.setFocusableInTouchMode(true);
        web.requestFocus();
    }

    /** Высота нижней панели в пикселях — странице, чтобы окна и меню заканчивались выше неё. */
    private class NavHeight {
        @JavascriptInterface
        public int px() {
            return NAV_H;
        }
    }

    private static boolean sameOrigin(Uri a, Uri b) {
        if (a.getHost() == null || b.getHost() == null) return false;
        return a.getHost().equalsIgnoreCase(b.getHost()) && port(a) == port(b);
    }

    private static int port(Uri u) {
        if (u.getPort() != -1) return u.getPort();
        return "https".equals(u.getScheme()) ? 443 : 80;
    }

    private void openExternal(Uri u) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, u).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (Exception e) {
            toast("Нечем открыть ссылку");
        }
    }

    private void download(String url, String userAgent, String disposition, String mime) {
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            toast("Этот файл создаётся в браузере — в приложении его сохранить нельзя. Откройте «Нудист» в Chrome.");
            return;
        }
        try {
            DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
            String name = URLUtil.guessFileName(url, disposition, mime);
            String cookie = CookieManager.getInstance().getCookie(url);
            if (cookie != null) r.addRequestHeader("Cookie", cookie);
            if (userAgent != null) r.addRequestHeader("User-Agent", userAgent);
            if (mime != null && mime.length() > 0) r.setMimeType(mime);
            r.setTitle(name);
            r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
            ((DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE)).enqueue(r);
            toast("Скачиваем: " + name);
        } catch (Exception e) {
            // Android 8–9 не дают писать в «Загрузки» без отдельного разрешения — отдаём ссылку браузеру.
            openExternal(Uri.parse(url));
        }
    }

    // ───── разрешения на микрофон и камеру

    private void handlePermissionRequest(PermissionRequest request) {
        List<String> need = new ArrayList<String>();
        for (String res : request.getResources()) {
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(res)) need.add(Manifest.permission.RECORD_AUDIO);
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(res)) need.add(Manifest.permission.CAMERA);
            // Старый WebView присылает «android.webkit.resource.GEOLOCATION» строкой, новый — через GeolocationPermissions.
            if (res != null && res.toLowerCase(java.util.Locale.ROOT).contains("geolocation")) need.add(Manifest.permission.ACCESS_FINE_LOCATION);
        }
        List<String> missing = new ArrayList<String>();
        for (String p : need) if (checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) missing.add(p);
        if (missing.isEmpty()) {
            grant(request);
            return;
        }
        if (pendingRequest != null) pendingRequest.deny();
        pendingRequest = request;
        requestPermissions(missing.toArray(new String[0]), REQ_PERM);
    }

    private void grant(PermissionRequest request) {
        List<String> ok = new ArrayList<String>();
        for (String res : request.getResources()) {
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(res) && checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) ok.add(res);
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(res) && checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) ok.add(res);
            if (res != null && res.toLowerCase(java.util.Locale.ROOT).contains("geolocation") && checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) ok.add(res);
        }
        if (ok.isEmpty()) request.deny();
        else request.grant(ok.toArray(new String[0]));
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        if (code == REQ_NOTIFY) {
            boolean ok = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
            prefs.edit().putBoolean("notifyDenied", !ok).apply();
            return;
        }
        if (code != REQ_PERM || pendingRequest == null) return;
        PermissionRequest r = pendingRequest;
        pendingRequest = null;
        grant(r);
    }

    @Override
    protected void onActivityResult(int code, int result, Intent data) {
        super.onActivityResult(code, result, data);
        if (code != REQ_FILE || fileCallback == null) return;
        Uri[] uris = null;
        if (result == RESULT_OK && data != null) {
            ClipData clip = data.getClipData();
            if (clip != null && clip.getItemCount() > 0) {
                uris = new Uri[clip.getItemCount()];
                for (int i = 0; i < uris.length; i++) uris[i] = clip.getItemAt(i).getUri();
            } else {
                uris = WebChromeClient.FileChooserParams.parseResult(result, data);
            }
        }
        fileCallback.onReceiveValue(uris);
        fileCallback = null;
    }

    @Override
    public void onBackPressed() {
        if (panel != null && "setup".equals(panel.getTag()) && prefs.getString("server", null) != null) {
            hidePanel();
            return;
        }
        if (panel != null) {
            moveTaskToBack(true);
            return;
        }
        // Спрашиваем у самого мессенджера: он закрывает верхний экран (меню, окно, панель, чат, папку)
        // и отвечает 1. Ответ 0 — закрывать нечего, сворачиваемся. -1 — страница без обработчика (например, админка).
        try {
            web.evaluateJavascript(
                "(function(){try{return window.nudistBack?(window.nudistBack()?1:0):-1}catch(e){return -1}})()",
                new ValueCallback<String>() {
                    @Override
                    public void onReceiveValue(String v) {
                        if ("1".equals(v)) return;
                        if (!"0".equals(v) && web.canGoBack()) {
                            web.goBack();
                            return;
                        }
                        moveTaskToBack(true);
                    }
                });
        } catch (Throwable e) {
            moveTaskToBack(true);
        }
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            root.removeView(web);
            web.destroy();
        }
        super.onDestroy();
    }

    // ───── экраны «адрес сервера» и «ошибка»

    private int dp(int v) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics());
    }

    private TextView text(String s, int sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setPadding(0, 0, 0, dp(10));
        return t;
    }

    private Button button(String s, boolean primary) {
        Button b = new Button(this);
        b.setText(s);
        b.setAllCaps(false);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        b.setTextColor(primary ? Color.WHITE : C_INK);
        b.setBackgroundColor(primary ? C_LEAF : 0x33FFFFFF);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(50));
        lp.topMargin = dp(10);
        b.setLayoutParams(lp);
        return b;
    }

    private LinearLayout newPanel(String tag) {
        hidePanel();
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(C_BG);
        scroll.setFillViewport(true);
        scroll.setTag(tag);
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER_VERTICAL);
        box.setPadding(dp(26), dp(30), dp(26), dp(30));
        scroll.addView(box, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        FrameLayout.LayoutParams plp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
        plp.bottomMargin = (navBar != null && navBar.getVisibility() == View.VISIBLE) ? NAV_H : 0;
        root.addView(scroll, plp);
        panel = scroll;
        return box;
    }

    // ───── Нижняя панель приложения (родная часть Android-сборки, не копия сайта)
    // Пять разделов: Чаты · Лента · Хаб · Магазин · Профиль. Значок непрочитанного обновляет страница
    // (window.NudistApp.nav), нажатие уходит в неё же (window.nudistNavTap) — разделы открываются как обычно.
    // Панель живёт в приложении: видна поверх ошибок и заставки, не пропадает без интернета,
    // высота учитывает вырез экрана и полосу жестов.

    private static final String[] NAV_KEYS = { "chats", "feed", "hub", "shop", "profile" };
    private final int NAV_H = dpConst(56);      // высота панели; системная полоса жестов идёт ниже, окно не полноэкранное
    private static final int NAV_OFF = 0xFF8CA79A, NAV_ON = 0xFF2BB36A;
    private LinearLayout navBar;
    private final View[] navItems = new View[5];
    private final View[] navIcons = new View[5];
    private final TextView[] navUnread = new TextView[5];
    private String navSection = "";

    private void buildNavBar() {
        navBar = new LinearLayout(this);
        navBar.setOrientation(LinearLayout.HORIZONTAL);
        navBar.setGravity(Gravity.CENTER_VERTICAL);
        navBar.setBackgroundColor(C_BG);
        navBar.setVisibility(View.GONE);
        navBar.setElevation(dp(8));
        int pad = dp(4);
        navBar.setPadding(0, pad, 0, pad);
        String[] names = { "Чаты", "Лента", "Хаб", "Магазин", "Профиль" };
        for (int i = 0; i < 5; i++) {
            final String key = NAV_KEYS[i];
            LinearLayout item = new LinearLayout(this);
            item.setOrientation(LinearLayout.VERTICAL);
            item.setGravity(Gravity.CENTER_HORIZONTAL | Gravity.CENTER_VERTICAL);
            item.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f));

            FrameLayout box = new FrameLayout(this);
            LinearLayout.LayoutParams boxLp = new LinearLayout.LayoutParams(dp(26), dp(26));
            boxLp.gravity = Gravity.CENTER_HORIZONTAL;
            box.setLayoutParams(boxLp);
            ImageView icon = new ImageView(this);
            icon.setImageDrawable(new NavIcon(getApplicationContext(), key, false));
            box.addView(icon, new FrameLayout.LayoutParams(dp(24), dp(24), Gravity.CENTER));
            TextView badge = new TextView(this);
            badge.setTextColor(Color.WHITE);
            badge.setTextSize(TypedValue.COMPLEX_UNIT_SP, 9.5f);
            badge.setTypeface(Typeface.DEFAULT_BOLD);
            badge.setGravity(Gravity.CENTER);
            badge.setVisibility(View.GONE);
            FrameLayout.LayoutParams bLp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(16));
            bLp.gravity = Gravity.TOP | Gravity.END;
            bLp.rightMargin = dp(-4);
            bLp.topMargin = dp(-2);
            box.addView(badge, bLp);
            item.addView(box);

            TextView label = new TextView(this);
            label.setText(names[i]);
            label.setTextSize(TypedValue.COMPLEX_UNIT_SP, 10.5f);
            label.setGravity(Gravity.CENTER);
            label.setTextColor(NAV_OFF);
            LinearLayout.LayoutParams lLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            lLp.topMargin = dp(1);
            item.addView(label, lLp);

            final TextView text = label;
            item.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    v.performHapticFeedback(android.view.HapticFeedbackConstants.KEYBOARD_TAP);      // короткий отклик: панель ощущается своей
                    navTap(key);
                    setNavSection(key);
                }
            });
            item.setContentDescription(names[i]);
            navItems[i] = item;
            navIcons[i] = icon;
            navUnread[i] = badge;
            navBar.addView(item);
        }
        int sh = NAV_H;
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, sh, Gravity.BOTTOM);
        root.addView(navBar, lp);
    }

    /** Плотность экрана для констант, которые нужны до создания View. */
    private static int dpConst(int v) {
        return (int) (v * android.content.res.Resources.getSystem().getDisplayMetrics().density);
    }

    /** Панель показывается, когда человек вошёл в аккаунт. */
    private void setNavVisible(final boolean on) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (navBar == null) return;
                if (on == (navBar.getVisibility() == View.VISIBLE)) return;
                navBar.setVisibility(on ? View.VISIBLE : View.GONE);
                int bottom = on ? NAV_H : 0;
                FrameLayout.LayoutParams wl = (FrameLayout.LayoutParams) web.getLayoutParams();
                if (wl.bottomMargin != bottom) { wl.bottomMargin = bottom; web.setLayoutParams(wl); }
                if (panel != null) {
                    FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) panel.getLayoutParams();
                    lp.bottomMargin = bottom;
                    panel.setLayoutParams(lp);
                }
            }
        });
    }

    /** Раздел и число непрочитанных — присылает страница (см. public/js/appnative.js). */
    private void navState(final String json) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    JSONObject o = new JSONObject(json);
                    boolean authed = o.optBoolean("authed", false);
                    setNavVisible(authed);
                    if (!authed) { setNavSection(""); return; }
                    setNavSection(o.optString("section", ""));
                    int n = o.optInt("unread", 0);
                    showBadge(0, n);
                } catch (Throwable e) { /* мусор от страницы не должен ломать приложение */ }
            }
        });
    }

    private void showBadge(int i, int n) {
        TextView b = navUnread[i];
        if (b == null) return;
        if (n <= 0) { b.setVisibility(View.GONE); return; }
        b.setBackground(new NavBadge(getApplicationContext(), n >= 10 ? dp(16) : dp(8)));
        b.setText(n >= 10 ? (n > 99 ? "99+" : String.valueOf(n)) : "");
        b.setPadding(n >= 10 ? dp(3) : 0, 0, n >= 10 ? dp(3) : 0, 0);
        b.setVisibility(View.VISIBLE);
    }

    private void setNavSection(String key) {
        if (key == null || key.equals(navSection)) return;
        navSection = key;
        String active = "auth".equals(key) ? "" : key;
        for (int i = 0; i < 5; i++) {
            boolean on = NAV_KEYS[i].equals(active);
            ((ImageView) navIcons[i]).setImageDrawable(new NavIcon(getApplicationContext(), NAV_KEYS[i], on));
            LinearLayout item = (LinearLayout) navItems[i];
            ((TextView) item.getChildAt(1)).setTextColor(on ? NAV_ON : NAV_OFF);
        }
    }

    /** Нажатие на кнопку панели: просим страницу открыть раздел. */
    private void navTap(String key) {
        try { web.evaluateJavascript("(function(){try{return window.nudistNavTap?window.nudistNavTap(" + JSONObject.quote(key) + "):false}catch(e){return false}})()", null); } catch (Throwable e) { /* страница ещё грузится */ }
    }

    /** Значок раздела: рисуется кодом, без картинок и сторонних библиотек. */
    private static final class NavIcon extends android.graphics.drawable.Drawable {
        private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final String kind;
        private final int color;

        NavIcon(Context c, String kind, boolean active) {
            this.kind = kind;
            this.color = active ? NAV_ON : NAV_OFF;
            p.setStyle(Paint.Style.STROKE);
            p.setStrokeCap(Paint.Cap.ROUND);
            p.setStrokeJoin(Paint.Join.ROUND);
            p.setColor(color);
        }

        @Override public void setAlpha(int a) { p.setAlpha(a); }
        @Override public void setColorFilter(android.graphics.ColorFilter f) { p.setColorFilter(f); }
        @Override public int getOpacity() { return android.graphics.PixelFormat.TRANSLUCENT; }

        @Override public void draw(Canvas cv) {
            float w = getBounds().width(), h = getBounds().height(), s = Math.min(w, h);
            cv.save();
            cv.translate(getBounds().left, getBounds().top);
            float k = s / 24f;                      // сетка 24×24, как у обычных иконок
            p.setStrokeWidth(2f * k);
            if ("chats".equals(kind)) {
                Path path = new Path();
                path.addRoundRect(new RectF(3.5f * k, 4.5f * k, 20.5f * k, 17f * k), 4.5f * k, 4.5f * k, Path.Direction.CW);
                cv.drawPath(path, p);
                Path tail = new Path();
                tail.moveTo(8f * k, 17f * k); tail.lineTo(7f * k, 20.5f * k); tail.lineTo(11.5f * k, 17f * k);
                cv.drawPath(tail, p);
            } else if ("feed".equals(kind)) {
                for (int i = 0; i < 3; i++) {
                    float y = (6.5f + i * 5.5f) * k;
                    cv.drawLine(9f * k, y, 20f * k, y, p);
                    cv.drawCircle(5.5f * k, y, 1.15f * k, p);
                }
            } else if ("hub".equals(kind)) {
                float r = 3.1f * k, o = 5.4f * k, m = 12f * k;
                cv.drawRoundRect(new RectF(m - o - r, m - o - r, m - o + r, m - o + r), r * .8f, r * .8f, p);
                cv.drawRoundRect(new RectF(m + o - r, m - o - r, m + o + r, m - o + r), r * .8f, r * .8f, p);
                cv.drawRoundRect(new RectF(m - o - r, m + o - r, m - o + r, m + o + r), r * .8f, r * .8f, p);
                cv.drawRoundRect(new RectF(m + o - r, m + o - r, m + o + r, m + o + r), r * .8f, r * .8f, p);
            } else if ("shop".equals(kind)) {
                Path bag = new Path();
                bag.addRoundRect(new RectF(4f * k, 7.5f * k, 20f * k, 20.5f * k), 3f * k, 3f * k, Path.Direction.CW);
                cv.drawPath(bag, p);
                Path handle = new Path();
                handle.moveTo(8.5f * k, 7.5f * k);
                handle.lineTo(8.5f * k, 6f * k);
                handle.lineTo(15.5f * k, 6f * k);
                handle.lineTo(15.5f * k, 7.5f * k);
                cv.drawPath(handle, p);
            } else {                                 // profile
                cv.drawCircle(12f * k, 8.3f * k, 3.6f * k, p);
                Path body = new Path();
                body.moveTo(5f * k, 20.2f * k);
                body.cubicTo(5.6f * k, 15.6f * k, 18.4f * k, 15.6f * k, 19f * k, 20.2f * k);
                cv.drawPath(body, p);
            }
            cv.restore();
        }
    }

    /** Красная точка или кружок с числом для значка непрочитанного. */
    private static final class NavBadge extends android.graphics.drawable.Drawable {
        private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final int radius;
        private final int ring;

        NavBadge(Context c, int radius) {
            this.radius = radius;
            ring = (int) Math.round(1.5 * c.getResources().getDisplayMetrics().density);
            p.setColor(0xFFE2552D);
        }

        @Override public void setAlpha(int a) { p.setAlpha(a); }
        @Override public void setColorFilter(android.graphics.ColorFilter f) { p.setColorFilter(f); }
        @Override public int getOpacity() { return android.graphics.PixelFormat.TRANSLUCENT; }

        @Override public void draw(Canvas cv) {
            RectF r = new RectF(getBounds());
            p.setColor(C_BG);
            cv.drawRoundRect(new RectF(r.left - ring, r.top - ring, r.right + ring, r.bottom + ring), r.height() / 2 + ring, r.height() / 2 + ring, p);
            p.setColor(0xFFE2552D);
            cv.drawRoundRect(r, r.height() / 2, r.height() / 2, p);
        }
    }

    private void hidePanel() {
        if (panel != null) {
            root.removeView(panel);
            panel = null;
        }
    }

    /** Открывает сервер и, пока страница грузится, показывает заставку: спящий сервер отвечает до минуты. */
    private void open(String server) {
        open(server, null, false);
    }

    /** Был ли этот адрес прежним адресом сервера (список вшит при сборке). */
    private boolean movedFrom(String server) {
        for (String raw : getString(R.string.migrate_from).split(",")) {
            String a = normalize(raw.trim());
            if (a != null && a.equalsIgnoreCase(server)) return true;
        }
        return false;
    }

    /**
     * Переезд. Хранилище браузера привязано к адресу, поэтому сначала показываем пустую страницу «от имени» прежнего адреса
     * (в сеть при этом ничего не уходит): она читает своё хранилище и отдаёт его через мост moved(). Потом открываем новый адрес
     * и кладём туда прочитанное (applyMove). Не получилось прочитать — переносим хотя бы ключ сеанса, который приложение
     * и так хранит для уведомлений.
     */
    private void migrate(String old, final String server, final String chat, final boolean update) {
        moving = true;
        moveServer = server;
        moveChat = chat;
        prefs.edit().putBoolean("moveTok", true).apply();
        LinearLayout box = newPanel("loading");
        box.addView(text("🍃 Нудист", 34, C_INK, true));
        box.addView(text("Переезжаем на новый адрес…\nВход в аккаунт сохранится.", 16, C_DIM, false));
        try {
            web.loadDataWithBaseURL(old + "/", "<!doctype html><meta charset=\"utf-8\"><script>(function(){var d={},i,k,v;try{for(i=0;i<localStorage.length;i++){k=localStorage.key(i);if(k.indexOf('nudist.')!==0)continue;v=localStorage.getItem(k);if(v&&v.length<20000)d[k]=v}}catch(e){}try{NudistApp.moved(JSON.stringify(d))}catch(e){}})()</script>", "text/html", "utf-8", null);
        } catch (Throwable e) { /* перенос не обязателен: ниже откроется новый адрес */ }
        root.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (!moving) return;      // страница уже ответила
                moving = false;
                open(server, chat, update);
            }
        }, 4000);
    }

    /** Новый адрес открылся: кладём в его хранилище то, что перенесли со старого, и перезагружаем страницу уже вошедшей. Один раз. */
    private void applyMove(String url) {
        final String server = prefs.getString("server", null);
        if (server == null || url == null || !(url.equals(server) || url.startsWith(server + "/"))) return;
        String data = prefs.getString("move", null);
        boolean tok = prefs.getBoolean("moveTok", false);
        if (data == null && !tok) return;
        String token = tok ? prefs.getString(PushService.K_TOKEN, "") : "";
        prefs.edit().remove("move").remove("moveTok").apply();
        try {
            web.evaluateJavascript("(function(){try{if(localStorage.getItem('nudist.token'))return;var d=JSON.parse(" + JSONObject.quote(data == null ? "{}" : data) + "),k;"
                + "for(k in d)if(k.indexOf('nudist.')===0&&typeof d[k]==='string')localStorage.setItem(k,d[k]);"
                + "var t=" + JSONObject.quote(token == null ? "" : token) + ";if(!localStorage.getItem('nudist.token')&&t)localStorage.setItem('nudist.token',JSON.stringify(t));"
                + "if(localStorage.getItem('nudist.token'))location.reload()}catch(e){}})()", null);
        } catch (Throwable e) { /* не вышло — человек просто войдёт заново */ }
    }

    private void open(String server, final String chat, final boolean update) {
        LinearLayout box = newPanel("loading");
        // Знак «Нудиста» крупно и по центру: при запуске сразу видно, что открылось именно приложение,
        // а не пустое тёмное окно. На Android 12+ это уже рисует система (см. styles.xml), ниже — мы сами.
        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.splash_logo);
        LinearLayout.LayoutParams llp = new LinearLayout.LayoutParams(dp(96), dp(96));
        llp.gravity = Gravity.CENTER_HORIZONTAL;
        llp.bottomMargin = dp(18);
        box.addView(logo, llp);
        TextView name = text("Нудист", 30, C_INK, true);
        name.setGravity(Gravity.CENTER_HORIZONTAL);
        box.addView(name);
        TextView sub = text("Открываю…\nЕсли сервер спал, первое открытие занимает до минуты.", 15, C_DIM, false);
        sub.setGravity(Gravity.CENTER_HORIZONTAL);
        box.addView(sub);
        java.util.Random rnd = new java.util.Random();
        String[] tips = {
            "Нам нечего скрывать.",
            "Двойной Esc — и на экране скучный отчёт.",
            "Секретные чаты: без следов на сервере.",
            "Листики растут за хорошие дела.",
            "Звонки — групповые тоже.",
            "Истории живут сутки."
        };
        TextView tip = text(tips[rnd.nextInt(tips.length)], 13, C_LEAF, false);
        tip.setGravity(Gravity.CENTER_HORIZONTAL);
        tip.setPadding(0, dp(14), 0, 0);
        box.addView(tip);
        web.loadUrl(server + "/" + (update ? "#update" : chat == null ? "" : "#c=" + chat));
        // Заставку убираем по ответу страницы через мост (Bridge.pageReady). Если скрипты в этом WebView
        // не запустились, заставка так и висела бы до перезагрузки — через 12 секунд убираем её сами.
        web.postDelayed(new Runnable() {
            @Override public void run() {
                if (panel != null && "loading".equals(panel.getTag())) hidePanel();
            }
        }, 12000);
    }

    private void showSetup(String problem) {
        final LinearLayout box = newPanel("setup");
        box.addView(text("🍃 Нудист", 34, C_INK, true));
        box.addView(text("Приложение — окно в ваш сервер «Нудиста». Укажите его адрес: тот самый, который открывается в браузере.", 16, C_DIM, false));
        final EditText input = new EditText(this);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        input.setImeOptions(EditorInfo.IME_ACTION_GO);
        input.setSingleLine(true);
        input.setHint("https://nudist.example.com");
        input.setHintTextColor(0x809DB8A8);
        input.setTextColor(C_INK);
        input.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        input.setText(prefs.getString("server", ""));
        box.addView(input, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        final TextView status = text(problem == null ? "" : problem, 14, C_WARN, false);
        status.setPadding(0, dp(8), 0, 0);
        box.addView(status);
        final Button go = button("Подключиться", true);
        box.addView(go);
        box.addView(text("\nВ одной сети Wi-Fi подойдёт адрес вида http://192.168.1.5:3000. Звонки, микрофон и секретные чаты работают только по https.\n\nСменить адрес позже: долгое нажатие на значок приложения → «Сменить сервер».", 13, C_DIM, false));
        View.OnClickListener submit = new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                final String url = normalize(input.getText().toString());
                if (input.getText().toString().trim().length() == 0) {
                    status.setTextColor(C_WARN);
                    status.setText("Введите адрес сервера.");
                    return;
                }
                if (url == null) {
                    status.setTextColor(C_WARN);
                    status.setText("Это не похоже на адрес. Пример: https://nudist.example.com или 192.168.1.5:3000");
                    return;
                }
                go.setEnabled(false);
                status.setTextColor(C_DIM);
                status.setText("Стучимся на сервер… Если он спал, это займёт до минуты.");
                probe(url, new Probe() {
                    @Override
                    public void done(String error) {
                        go.setEnabled(true);
                        if (error != null) {
                            status.setTextColor(C_WARN);
                            status.setText(error);
                            return;
                        }
                        if (!url.equals(prefs.getString("server", null))) {      // другой сервер — ключ сеанса от прежнего ему не отдаём
                            prefs.edit().remove(PushService.K_TOKEN).remove(PushService.K_SINCE).apply();
                            PushService.stop(MainActivity.this);
                        }
                        prefs.edit().putString("server", url).apply();
                        hidePanel();
                        web.clearHistory();
                        open(url);
                    }
                });
            }
        };
        go.setOnClickListener(submit);
        input.setOnEditorActionListener(new TextView.OnEditorActionListener() {
            @Override
            public boolean onEditorAction(TextView v, int action, android.view.KeyEvent e) {
                if (action == EditorInfo.IME_ACTION_GO) {
                    go.performClick();
                    return true;
                }
                return false;
            }
        });
    }

    private void showError(String title, String details) {
        LinearLayout box = newPanel("error");
        box.addView(text("🙈 " + title, 24, C_INK, true));
        box.addView(text(prefs.getString("server", "") + "\n" + details, 14, C_DIM, false));
        box.addView(text("Проверьте интернет. Если сервер спал, подождите минуту и попробуйте снова.", 16, C_INK, false));
        Button retry = button("Попробовать снова", true);
        retry.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                open(prefs.getString("server", ""));
            }
        });
        box.addView(retry);
        Button change = button("Сменить адрес сервера", false);
        change.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) { showSetup(null); }
        });
        box.addView(change);
    }

    /** Приводит ввод к виду scheme://host[:port] или возвращает null. */
    static String normalize(String raw) {
        String s = raw == null ? "" : raw.trim();
        if (s.length() == 0 || s.contains(" ")) return null;
        if (!s.matches("(?i)^https?://.*")) {
            boolean local = s.matches("^(localhost|\\d{1,3}(\\.\\d{1,3}){3})(:\\d+)?(/.*)?$") || s.matches("^[^/]+:\\d+(/.*)?$");
            s = (local ? "http://" : "https://") + s;
        }
        Uri u = Uri.parse(s);
        if (u.getHost() == null || u.getHost().length() == 0) return null;
        String scheme = u.getScheme().toLowerCase();
        return scheme + "://" + u.getHost() + (u.getPort() == -1 ? "" : ":" + u.getPort());
    }

    private interface Probe {
        void done(String error);
    }

    /** Проверяет, что по адресу отвечает именно «Нудист»: у него есть /api/config. */
    private void probe(final String base, final Probe cb) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                String error = null;
                HttpURLConnection c = null;
                try {
                    c = (HttpURLConnection) new URL(base + "/api/config").openConnection();
                    c.setConnectTimeout(20000);
                    c.setReadTimeout(70000);
                    int code = c.getResponseCode();
                    String type = c.getContentType();
                    if (code != 200 || type == null || !type.contains("json")) error = "По этому адресу отвечает не «Нудист» (код " + code + "). Проверьте адрес и порт.";
                } catch (javax.net.ssl.SSLException e) {
                    error = "Не удалось установить защищённое соединение: " + e.getMessage();
                } catch (Exception e) {
                    error = "Сервер не отвечает: " + (e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage());
                } finally {
                    if (c != null) c.disconnect();
                }
                final String result = error;
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        if (!isFinishing() && !(Build.VERSION.SDK_INT >= 17 && isDestroyed())) cb.done(result);
                    }
                });
            }
        }).start();
    }

    private void toast(String s) {
        Toast.makeText(this, s, Toast.LENGTH_LONG).show();
    }
}
