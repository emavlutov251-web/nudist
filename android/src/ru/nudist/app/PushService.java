package ru.nudist.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.IBinder;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Фоновая служба уведомлений. Сервисов Google здесь нет, поэтому служба сама держит долгий запрос к серверу
 * (GET /api/notify?since=N): сервер отвечает, как только появилось событие, или пустым ответом через 40 секунд.
 * Пока приложение открыто на экране, уведомления не показываются: человек и так всё видит.
 */
public class PushService extends Service {
    static final String PREFS = "nudist", K_TOKEN = "pushToken", K_SINCE = "pushSince";
    static final String CH_MSG = "messages", CH_BG = "background";
    static final String ACTION_OPEN = "ru.nudist.app.OPEN_CHAT", EXTRA_CHAT = "chat";
    private static final int ID_BG = 1;
    private static final int TYPE_REMOTE_MESSAGING = 1 << 9;      // ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING (API 34)

    private static final Map<String, List<String>> shown = new HashMap<String, List<String>>();      // чат → последние строки
    private volatile boolean running, destroyed;
    private Thread worker;
    private volatile HttpURLConnection current;

    /** Запускает службу, если человек вошёл в аккаунт. Вызывать можно сколько угодно раз. */
    static void start(Context c) {
        SharedPreferences p = c.getSharedPreferences(PREFS, MODE_PRIVATE);
        if (p.getString(K_TOKEN, null) == null || p.getString("server", null) == null) return;
        try {
            Intent i = new Intent(c, PushService.class);
            if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i);
            else c.startService(i);
        } catch (Throwable e) {
            // Android 12+ не даёт поднять службу из фона. Поднимется при следующем открытии приложения.
        }
    }

    static void stop(Context c) {
        try {
            c.stopService(new Intent(c, PushService.class));
        } catch (Throwable e) { /* уже остановлена */ }
    }

    /** Убирает показанные уведомления о сообщениях: человек открыл приложение. */
    static void clearShown(Context c) {
        NotificationManager nm = (NotificationManager) c.getSystemService(NOTIFICATION_SERVICE);
        synchronized (shown) {
            for (String tag : shown.keySet()) nm.cancel(idOf(tag));
            shown.clear();
        }
    }

    static void channels(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(NOTIFICATION_SERVICE);
        NotificationChannel msg = new NotificationChannel(CH_MSG, "Сообщения", NotificationManager.IMPORTANCE_HIGH);
        msg.setDescription("Новые сообщения, подарки и звонки");
        msg.enableVibration(true);
        msg.setShowBadge(true);
        nm.createNotificationChannel(msg);
        NotificationChannel bg = new NotificationChannel(CH_BG, "Связь с сервером", NotificationManager.IMPORTANCE_MIN);
        bg.setDescription("Постоянная строка: приложение на связи и ждёт сообщений. Её можно скрыть в настройках уведомлений.");
        bg.setShowBadge(false);
        nm.createNotificationChannel(bg);
    }

    private static int idOf(String tag) {
        int h = tag.hashCode();
        return h == ID_BG ? ID_BG + 1 : h;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        channels(this);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        try {
            Notification n = builder(CH_BG)
                    .setContentTitle("Нудист на связи")
                    .setContentText("Ждёт новых сообщений")
                    .setOngoing(true)
                    .setContentIntent(openIntent(null))
                    .build();
            if (Build.VERSION.SDK_INT >= 34) startForeground(ID_BG, n, TYPE_REMOTE_MESSAGING);
            else startForeground(ID_BG, n);
        } catch (Throwable e) {
            stopSelf();
            return START_NOT_STICKY;
        }
        SharedPreferences p = getSharedPreferences(PREFS, MODE_PRIVATE);
        if (p.getString(K_TOKEN, null) == null) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (worker == null || !worker.isAlive()) {
            running = true;
            worker = new Thread(new Runnable() {
                @Override
                public void run() {
                    loop();
                }
            }, "nudist-push");
            worker.start();
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        destroyed = true;
        running = false;
        HttpURLConnection c = current;
        if (c != null) {
            try {
                c.disconnect();
            } catch (Throwable e) { /* соединение уже закрыто */ }
        }
        if (worker != null) worker.interrupt();
        super.onDestroy();
    }

    // ───── долгий опрос сервера

    private void loop() {
        SharedPreferences p = getSharedPreferences(PREFS, MODE_PRIVATE);
        long wait = 5000;
        while (running) {
            String token = p.getString(K_TOKEN, null), server = p.getString("server", null);
            if (token == null || server == null) break;
            long since = p.getLong(K_SINCE, 0);
            try {
                int code = poll(server, token, since, p);
                if (code == 401) {      // сеанс завершён (вышли, сменили пароль, забанили): ключ больше не годится
                    p.edit().remove(K_TOKEN).remove(K_SINCE).apply();
                    break;
                }
                if (code == 200) {
                    wait = 5000;
                    continue;
                }
            } catch (Throwable e) {
                if (!running) break;
            }
            try {      // сервер не ответил или ответил ошибкой: пробуем реже, но не реже раза в пять минут
                Thread.sleep(wait);
            } catch (InterruptedException e) {
                break;
            }
            wait = Math.min(wait * 2, 300000);
        }
        running = false;
        if (destroyed) return;      // службу уже остановили снаружи
        stopForeground(true);
        stopSelf();
    }

    private int poll(String server, String token, long since, SharedPreferences p) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(server + "/api/notify?tz=" + (java.util.TimeZone.getDefault().getOffset(System.currentTimeMillis()) / 60000) + (since > 0 ? "&since=" + since : "")).openConnection();
        current = c;
        try {
            c.setConnectTimeout(20000);
            c.setReadTimeout(75000);
            c.setUseCaches(false);
            c.setRequestProperty("Authorization", "Bearer " + token);
            c.setRequestProperty("Accept", "application/json");
            c.setRequestProperty("User-Agent", "NudistAndroid-push/1.4");
            int code = c.getResponseCode();
            if (code != 200) return code;
            JSONObject o = new JSONObject(read(c.getInputStream()));
            // Пока шёл запрос, человек мог выйти из аккаунта или войти в другой: чужое не показываем.
            if (!running || !token.equals(p.getString(K_TOKEN, null))) return 200;
            JSONArray items = o.optJSONArray("items");
            boolean quiet = MainActivity.visible;
            if (items != null && !quiet) {
                for (int i = 0; i < items.length(); i++) {
                    JSONObject it = items.getJSONObject(i);
                    show(it.optString("tag", ""), it.optString("title", "Нудист"), it.optString("body", ""));
                }
            }
            long last = o.optLong("last", since);
            if (last > 0 && last != since) p.edit().putLong(K_SINCE, last).apply();
            return 200;
        } finally {
            current = null;
            c.disconnect();
        }
    }

    private static String read(InputStream in) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[4096];
        int n;
        while ((n = in.read(buf)) > 0) {
            out.write(buf, 0, n);
            if (out.size() > 262144) break;
        }
        in.close();
        return out.toString("UTF-8");
    }

    // ───── показ

    private Notification.Builder builder(String channel) {
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, channel) : new Notification.Builder(this);
        b.setSmallIcon(R.drawable.ic_stat_leaf).setColor(0xFF2BB36A).setShowWhen(CH_MSG.equals(channel));
        return b;
    }

    private PendingIntent openIntent(String chat) {
        Intent i = new Intent(this, MainActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (chat != null) {
            i.setAction(ACTION_OPEN);
            i.putExtra(EXTRA_CHAT, chat);
            i.setData(new android.net.Uri.Builder().scheme("nudist").authority("chat").appendPath(chat).build());      // у каждого чата свой PendingIntent
        }
        return PendingIntent.getActivity(this, 0, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private void show(String tag, String title, String body) {
        if (tag.length() == 0) tag = "misc";
        List<String> lines;
        synchronized (shown) {
            lines = shown.get(tag);
            if (lines == null) {
                lines = new ArrayList<String>();
                shown.put(tag, lines);
            }
            lines.add(body);
            while (lines.size() > 6) lines.remove(0);
            lines = new ArrayList<String>(lines);
        }
        Notification.Builder b = builder(CH_MSG)
                .setContentTitle(title)
                .setContentText(body)
                .setAutoCancel(true)
                .setCategory("call".equals(tag) ? Notification.CATEGORY_CALL : Notification.CATEGORY_MESSAGE)
                .setVisibility(Notification.VISIBILITY_PRIVATE)
                .setContentIntent(openIntent("call".equals(tag) || "misc".equals(tag) || "test".equals(tag) ? null : tag));
        if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_HIGH).setDefaults(Notification.DEFAULT_ALL);
        if (lines.size() > 1) {
            Notification.InboxStyle st = new Notification.InboxStyle().setBigContentTitle(title);
            for (String l : lines) st.addLine(l);
            b.setStyle(st).setNumber(lines.size());
        } else {
            b.setStyle(new Notification.BigTextStyle().bigText(body));
        }
        try {
            ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(idOf(tag), b.build());
        } catch (Throwable e) { /* уведомления запрещены в настройках телефона */ }
    }
}
