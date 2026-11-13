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
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.RandomAccessFile;
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
    private static final int APP_VERSION = 15;      // 1.5: телевизор — встроенный браузер для сайтов каналов
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
        if (server == null) {
            // Адрес, вшитый при сборке (SERVER_URL=… ./build.sh). Пустой — спросить у человека.
            String builtIn = normalize(getString(R.string.default_server));
            if (builtIn != null) {
                server = builtIn;
                prefs.edit().putString("server", server).apply();
            }
        }
        if (server != null) open(server, chatFrom(getIntent()));
        if (server == null || ACTION_CHANGE_SERVER.equals(getIntent().getAction())) showSetup(null);
        clearShareDir();      // остатки с прошлого раза
        if (state == null) takeShare(getIntent());
    }

    @Override
    protected void onStart() {
        super.onStart();
        visible = true;
        PushService.clearShown(this);
        PushService.start(this);      // если систему пришлось перезапустить службу или она ещё не поднята
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
        if (chat != null && web != null) {
            // Нажали на уведомление, приложение уже открыто: просим мессенджер перейти в нужный чат.
            try {
                web.evaluateJavascript("(function(){try{var h='#c=" + chat + "';if(location.hash===h)window.dispatchEvent(new HashChangeEvent('hashchange'));else location.hash=h;}catch(e){}})()", null);
            } catch (Throwable e) { /* страница ещё не загрузилась */ }
        }
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

        /** Телевизор: открыть страницу эфира канала во встроенном браузере. list — JSON-массив { n, name, url }, i — с какого канала начать. */
        @JavascriptInterface
        public boolean tv(final String list, final int i) {
            if (list == null || list.length() > 20000 || !list.contains("https://")) return false;
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        startActivity(new Intent(MainActivity.this, TvActivity.class).putExtra(TvActivity.X_LIST, list).putExtra(TvActivity.X_INDEX, i));
                    } catch (Throwable e) {
                        toast("Телевизор не включился");
                    }
                }
            });
            return true;
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

    // ───── WebView

    private void createWebView() {
        web = new WebView(this);
        web.setBackgroundColor(C_BG);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportMultipleWindows(false);
        s.setUserAgentString(s.getUserAgentString() + " NudistAndroid/1.5");
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
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                mainFrameFailed = false;
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
                if (!mainFrameFailed && panel != null && ("error".equals(panel.getTag()) || "loading".equals(panel.getTag()))) hidePanel();
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
        root.addView(scroll, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        panel = scroll;
        return box;
    }

    private void hidePanel() {
        if (panel != null) {
            root.removeView(panel);
            panel = null;
        }
    }

    /** Открывает сервер и, пока страница грузится, показывает заставку: спящий сервер отвечает до минуты. */
    private void open(String server) {
        open(server, null);
    }

    private void open(String server, String chat) {
        LinearLayout box = newPanel("loading");
        box.addView(text("🍃 Нудист", 34, C_INK, true));
        box.addView(text("Открываю…\nЕсли сервер спал, первое открытие занимает до минуты.", 16, C_DIM, false));
        web.loadUrl(server + "/" + (chat == null ? "" : "#c=" + chat));
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
