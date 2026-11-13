package ru.nudist.app;

import android.app.Activity;
import android.content.pm.ActivityInfo;
import android.graphics.Bitmap;
import android.graphics.Typeface;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Bundle;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Телевизор: встроенный браузер, который открывает официальную страницу прямого эфира канала.
 * Это обычная страница сайта канала целиком (со всем, что канал на ней показывает), а не вставка в чужую страницу,
 * поэтому каналы, запрещающие вставку, здесь работают как в любом браузере. Потоки мы не трогаем и не пересылаем.
 * Моста window.NudistApp у этого браузера нет: сайты каналов к мессенджеру доступа не получают.
 */
public class TvActivity extends Activity {
    static final String X_LIST = "list", X_INDEX = "i";
    private static final int C_BG = 0xFF14251C, C_INK = 0xFFEAF3EC, C_DIM = 0xFF9DB8A8, C_LEAF = 0xFF2BB36A;

    private final java.util.ArrayList<String[]> channels = new java.util.ArrayList<String[]>();      // { номер, название, адрес }
    private int index;
    private WebView web;
    private LinearLayout bar;
    private TextView title, note;
    private View progress;
    private FrameLayout stage, full;
    private View customView;
    private WebChromeClient.CustomViewCallback customCallback;
    private boolean clearHistory, failed, loaded;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        try {
            JSONArray a = new JSONArray(String.valueOf(getIntent().getStringExtra(X_LIST)));
            for (int k = 0; k < a.length() && k < 40; k++) {
                JSONObject o = a.getJSONObject(k);
                String url = o.optString("url", "");
                if (!url.startsWith("https://")) continue;
                channels.add(new String[] { o.optString("n", ""), o.optString("name", "Канал"), url });
            }
        } catch (Throwable e) {
            // пустой список — закроемся ниже
        }
        if (channels.isEmpty()) {
            finish();
            return;
        }
        index = Math.max(0, Math.min(channels.size() - 1, saved != null ? saved.getInt(X_INDEX, 0) : getIntent().getIntExtra(X_INDEX, 0)));
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(0xFF000000);
        root.setFitsSystemWindows(true);

        bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setBackgroundColor(C_BG);
        bar.addView(key("‹", "Предыдущий канал", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                zap(-1);
            }
        }));
        title = new TextView(this);
        title.setTextColor(C_INK);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setSingleLine(true);
        title.setEllipsize(TextUtils.TruncateAt.END);
        title.setGravity(Gravity.CENTER);
        bar.addView(title, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        bar.addView(key("›", "Следующий канал", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                zap(1);
            }
        }));
        bar.addView(key("↻", "Обновить страницу", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                open();
            }
        }));
        bar.addView(key("✕", "Выключить телевизор", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                finish();
            }
        }));
        root.addView(bar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(46)));

        FrameLayout line = new FrameLayout(this);
        line.setBackgroundColor(C_BG);
        progress = new View(this);
        progress.setBackgroundColor(C_LEAF);
        line.addView(progress, new FrameLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT));
        root.addView(line, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(2)));

        stage = new FrameLayout(this);
        root.addView(stage, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        createWeb();
        stage.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        note = new TextView(this);
        note.setTextColor(C_INK);
        note.setBackgroundColor(C_BG);
        note.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        note.setGravity(Gravity.CENTER);
        note.setPadding(dp(28), dp(28), dp(28), dp(28));
        note.setVisibility(View.GONE);
        note.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                open();
            }
        });
        stage.addView(note, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        full = new FrameLayout(this);
        full.setBackgroundColor(0xFF000000);
        full.setVisibility(View.GONE);
        FrameLayout all = new FrameLayout(this);
        all.addView(root, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        all.addView(full, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(all);
        open();
    }

    private int dp(int v) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics());
    }

    private TextView key(String sign, String hint, View.OnClickListener run) {
        TextView b = new TextView(this);
        b.setText(sign);
        b.setContentDescription(hint);
        b.setTextColor(C_INK);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 22);
        b.setGravity(Gravity.CENTER);
        b.setMinimumWidth(dp(48));
        b.setLayoutParams(new LinearLayout.LayoutParams(dp(48), ViewGroup.LayoutParams.MATCH_PARENT));
        b.setClickable(true);
        b.setFocusable(true);
        TypedValue tv = new TypedValue();
        if (getTheme().resolveAttribute(android.R.attr.selectableItemBackgroundBorderless, tv, true)) b.setBackgroundResource(tv.resourceId);
        b.setOnClickListener(run);
        return b;
    }

    private void createWeb() {
        web = new WebView(this);
        web.setBackgroundColor(0xFF000000);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportMultipleWindows(false);      // всплывающие окна отдельными вкладками не открываем
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        // Обычная строка мобильного Chrome: без пометки встроенного окна сайты каналов отдают ту же страницу, что и браузеру
        s.setUserAgentString(s.getUserAgentString().replace("; wv)", ")").replaceAll(" Version/\\d+\\.\\d+", ""));
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);      // плееры каналов живут на соседних адресах

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                String scheme = u.getScheme() == null ? "" : u.getScheme();
                if (!scheme.equals("https") && !scheme.equals("http")) return true;      // intent:, market:, tg: и прочие — никуда не уходим
                if (!request.isForMainFrame()) return false;
                // Страницу целиком меняет сам человек (нажал ссылку) или сайт, пока загружается (перенаправления).
                // Когда страница уже открыта, увести её на чужой сайт без нажатия нельзя: так делает навязчивая реклама.
                if (request.hasGesture() || request.isRedirect() || !loaded) return false;
                return !site(u.getHost()).equals(site(Uri.parse(String.valueOf(view.getUrl())).getHost()));
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                failed = false;
                loaded = false;
                note.setVisibility(View.GONE);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (clearHistory) {
                    clearHistory = false;
                    view.clearHistory();
                }
                setProgressWidth(0);
                loaded = true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (!request.isForMainFrame()) return;
                failed = true;
                note.setText("Сайт канала не открылся.\n\nПроверьте интернет. Некоторые каналы показывают эфир только в России — с VPN они могут не работать.\n\nНажмите, чтобы попробовать ещё раз.");
                note.setVisibility(View.VISIBLE);
            }

            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                handler.cancel();
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int p) {
                setProgressWidth(p >= 100 ? 0 : p);
            }

            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (customView != null) {
                    callback.onCustomViewHidden();
                    return;
                }
                customView = view;
                customCallback = callback;
                full.addView(view, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                full.setVisibility(View.VISIBLE);
                immersive(true);
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
            }

            @Override
            public void onHideCustomView() {
                leaveFull(false);
            }

            @Override
            public void onPermissionRequest(PermissionRequest request) {
                // Камеру и микрофон сайтам каналов не даём; разрешаем только защищённое видео (без него часть эфиров не играет)
                for (String r : request.getResources()) {
                    if (PermissionRequest.RESOURCE_PROTECTED_MEDIA_ID.equals(r)) {
                        request.grant(new String[] { PermissionRequest.RESOURCE_PROTECTED_MEDIA_ID });
                        return;
                    }
                }
                request.deny();
            }

            @Override
            public Bitmap getDefaultVideoPoster() {
                return Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888);      // вместо серой заглушки с треугольником
            }
        });
    }

    /** Сайт без поддоменов: m.5-tv.ru и www.5-tv.ru — один сайт. */
    private static String site(String host) {
        if (host == null) return "";
        String[] p = host.toLowerCase(java.util.Locale.ROOT).split("\\.");
        return p.length <= 2 ? host.toLowerCase(java.util.Locale.ROOT) : p[p.length - 2] + "." + p[p.length - 1];
    }

    private void setProgressWidth(int percent) {
        ViewGroup.LayoutParams lp = progress.getLayoutParams();
        lp.width = ((View) progress.getParent()).getWidth() * percent / 100;
        progress.setLayoutParams(lp);
    }

    private void open() {
        String[] c = channels.get(index);
        title.setText(c[0].length() > 0 ? c[0] + " · " + c[1] : c[1]);
        note.setVisibility(View.GONE);
        clearHistory = true;
        loaded = false;
        web.loadUrl(c[2]);
    }

    private void zap(int step) {
        if (channels.size() < 2) return;
        index = (index + step + channels.size()) % channels.size();
        open();
    }

    private void immersive(boolean on) {
        View d = getWindow().getDecorView();
        d.setSystemUiVisibility(on
            ? View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            : View.SYSTEM_UI_FLAG_VISIBLE);
    }

    /** Выйти из полноэкранного видео. tell — сообщить плееру, что это сделали мы (кнопкой «Назад»). */
    private void leaveFull(boolean tell) {
        if (customView == null) return;
        full.removeView(customView);
        full.setVisibility(View.GONE);
        customView = null;
        WebChromeClient.CustomViewCallback cb = customCallback;
        customCallback = null;
        immersive(false);
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        if (tell && cb != null) cb.onCustomViewHidden();
    }

    @Override
    public void onWindowFocusChanged(boolean has) {
        super.onWindowFocusChanged(has);
        if (has && customView != null) immersive(true);
    }

    @Override
    public void onBackPressed() {
        if (customView != null) {
            leaveFull(true);
            return;
        }
        if (!failed && web != null && web.canGoBack()) {
            web.goBack();
            return;
        }
        finish();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        out.putInt(X_INDEX, index);
    }

    @Override
    protected void onPause() {
        if (web != null) web.onPause();      // ушли с экрана — эфир замолкает
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            leaveFull(true);
            stage.removeView(web);
            web.loadUrl("about:blank");
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
