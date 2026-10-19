package com.finova.money;

import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.AssetManager;
import android.hardware.biometrics.BiometricManager;
import android.hardware.biometrics.BiometricPrompt;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * فینوا — پوسته اندروید با WebView امن + پل بومی
 * (سرور محلی 127.0.0.1 برای Secure Context → IndexedDB و crypto.subtle کار می‌کنند)
 */
public class MainActivity extends Activity {

    private static final String CHANNEL_ID = "finova_reminders";
    private WebView web;
    private AssetServer server;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService pool = Executors.newCachedThreadPool();
    private int serverPort = 18080;
    private ValueCallback<Uri[]> fileCallback;
    private static final int REQ_FILE_CHOOSER = 5150;
    private static final int REQ_BACKUP_PICK = 6161;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        createChannel();
        server = new AssetServer(getAssets(), "www");
        serverPort = server.start(18080, 18200);

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);          // امنیت: دسترسی فایل بسته
        s.setAllowContentAccess(false);
        s.setAllowFileAccessFromFileURLs(false);
        s.setAllowUniversalAccessFromFileURLs(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setTextZoom(100);
        web.setBackgroundColor(0xFF070C18); // هم‌رنگ اسپلش → بدون پرش رنگی هنگام پینت اول
        web.addJavascriptInterface(new Bridge(), "Finova");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                String scheme = u.getScheme() == null ? "" : u.getScheme();
                if (u.getHost() != null && u.getHost().equals("127.0.0.1")) return false;
                // لینک خارجی → مرورگر
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) {}
                return true;
            }
        });
        // بدون این WebChromeClient، <input type="file"> در WebView هیچ‌کاری نمی‌کند
        // (ریشه باگ «بازیابی از فایل»)
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView wv, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (fileCallback != null) { try { fileCallback.onReceiveValue(null); } catch (Exception ignored) {} }
                fileCallback = cb;
                try {
                    Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    i.setType("*/*"); // هر فایل پشتیبانی (.json / .enc) قابل انتخاب باشد
                    startActivityForResult(Intent.createChooser(i, "انتخاب فایل پشتیبان"), REQ_FILE_CHOOSER);
                    return true;
                } catch (Exception e) { fileCallback = null; return false; }
            }
        });
        setContentView(web);
        web.loadUrl("http://127.0.0.1:" + serverPort + "/index.html");
    }

    @Override
    public void onBackPressed() {
        main.post(() -> web.evaluateJavascript("window.__androidBack && window.__androidBack();", null));
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE_CHOOSER) {
            Uri[] res = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null) res = new Uri[]{ data.getData() };
            if (fileCallback != null) { try { fileCallback.onReceiveValue(res); } catch (Exception ignored) {} fileCallback = null; }
            return;
        }
        if (requestCode == REQ_BACKUP_PICK) {
            final Uri uri = (resultCode == RESULT_OK && data != null) ? data.getData() : null;
            if (uri == null) { js("window.__fileCb && window.__fileCb(null)"); return; }
            pool.execute(() -> {
                String text = "";
                try { text = readAll(getContentResolver().openInputStream(uri)); } catch (Exception ignored) { text = ""; }
                final String out = text;
                js("window.__fileCb && window.__fileCb(" + org.json.JSONObject.quote(out) + ")");
            });
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == 4242) {
            boolean g = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            main.post(() -> web.evaluateJavascript("window.__notifPermCb && window.__notifPermCb(" + g + ");", null));
        }
    }

    @Override
    protected void onDestroy() {
        if (server != null) server.stop();
        if (web != null) web.destroy();
        super.onDestroy();
    }

    /* ═════════ پل JS ↔ جاوا ═════════ */
    public class Bridge {

        /** درخواست HTTP بومی (بدون محدودیت CORS) — پاسخ: __netCb(id, ok, status, body) */
        @JavascriptInterface
        public void http(final String id, final String urlStr, final String method,
                         final String headersJson, final String body) {
            pool.execute(() -> {
                boolean ok = false; int status = 0; String out = "";
                try {
                    HttpURLConnection c = (HttpURLConnection) new URL(urlStr).openConnection();
                    c.setRequestMethod(method == null ? "GET" : method);
                    c.setConnectTimeout(15000);
                    c.setReadTimeout(90000);
                    c.setRequestProperty("User-Agent", "Finova/1.0 (Android)");
                    org.json.JSONObject hs = new org.json.JSONObject(headersJson == null ? "{}" : headersJson);
                    java.util.Iterator<String> it = hs.keys();
                    while (it.hasNext()) {
                        String k = it.next();
                        if (!"Content-Type".equalsIgnoreCase(k) && !"Authorization".equalsIgnoreCase(k)) continue;
                        c.setRequestProperty(k, hs.getString(k));
                    }
                    if (body != null && body.length() > 0 && !"GET".equalsIgnoreCase(method)) {
                        c.setDoOutput(true);
                        OutputStream os = c.getOutputStream();
                        os.write(body.getBytes(StandardCharsets.UTF_8));
                        os.close();
                    }
                    status = c.getResponseCode();
                    InputStream is = status >= 400 ? c.getErrorStream() : c.getInputStream();
                    out = readAll(is);
                    ok = status < 400;
                } catch (Exception e) {
                    out = "ERR: " + e.getMessage();
                }
                final boolean fok = ok; final int fstatus = status; final String fout = out;
                main.post(() -> web.evaluateJavascript(
                        "window.__netCb && window.__netCb(" + org.json.JSONObject.quote(id) + "," + fok + "," + fstatus + "," + org.json.JSONObject.quote(fout) + ");", null));
            });
        }

        @JavascriptInterface
        public void showNotification(String title, String body, String idStr, String tag) {
            try {
                NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
                if (Build.VERSION.SDK_INT >= 33 &&
                        checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) return;
                int id = 0;
                try { id = Integer.parseInt(idStr); } catch (Exception ignored) {}
                Intent open = new Intent(MainActivity.this, MainActivity.class);
                open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                PendingIntent pi = PendingIntent.getActivity(MainActivity.this, id, open,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                Notification n = new Notification.Builder(MainActivity.this, CHANNEL_ID)
                        .setSmallIcon(R.drawable.ic_notif)
                        .setContentTitle(title)
                        .setContentText(body)
                        .setStyle(new Notification.BigTextStyle().bigText(body))
                        .setContentIntent(pi)
                        .setAutoCancel(true)
                        .build();
                nm.notify(tag == null ? id : (tag + id).hashCode(), n);
            } catch (Exception ignored) {}
        }

        @JavascriptInterface
        public boolean hasNotifPermission() {
            if (Build.VERSION.SDK_INT >= 33)
                return checkSelfPermission("android.permission.POST_NOTIFICATIONS") == PackageManager.PERMISSION_GRANTED;
            return true;
        }

        @JavascriptInterface
        public void requestNotifPermission() {
            if (Build.VERSION.SDK_INT >= 33 &&
                    checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 4242);
            }
        }

        @JavascriptInterface
        public boolean canBiometric() {
            try {
                if (Build.VERSION.SDK_INT >= 30) return true;
                android.hardware.fingerprint.FingerprintManager fm =
                        (android.hardware.fingerprint.FingerprintManager) getSystemService(FINGERPRINT_SERVICE);
                if (fm != null && fm.isHardwareDetected() && fm.hasEnrolledFingerprints()) return true;
                android.app.KeyguardManager km = (android.app.KeyguardManager) getSystemService(KEYGUARD_SERVICE);
                return km != null && km.isDeviceSecure();
            } catch (Exception ignored) {}
            return false;
        }

        @JavascriptInterface
        public void biometricAuth() {
            main.post(() -> {
                if (Build.VERSION.SDK_INT >= 30) {
                    try {
                        ExecutorService ex = pool;
                        BiometricPrompt prompt = new BiometricPrompt.Builder(MainActivity.this)
                                .setTitle("ورود به فینوا")
                                .setSubtitle("احراز هویت لازم است")
                                .setDescription("اثر انگشت یا قفل دستگاه خود را استفاده کنید")
                                .setAllowedAuthenticators(
                                        BiometricManager.Authenticators.BIOMETRIC_WEAK |
                                        BiometricManager.Authenticators.DEVICE_CREDENTIAL)
                                .build();
                        prompt.authenticate(new CancellationSignal(), ex, new BiometricPrompt.AuthenticationCallback() {
                            @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                                js("__bioCb(true,'ok')");
                            }
                            @Override public void onAuthenticationError(int code, CharSequence err) {
                                js("__bioCb(false," + org.json.JSONObject.quote(String.valueOf(err)) + ")");
                            }
                        });
                        return;
                    } catch (Exception ignored) {}
                }
                js("__bioCb(false,'unsupported')");
            });
        }

        /** انتخابگر بومی فایل پشتیبان — پاسخ: __fileCb(text) | __fileCb(null) لغو */
        @JavascriptInterface
        public void pickBackupFile() {
            main.post(() -> {
                try {
                    Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    i.setType("*/*");
                    startActivityForResult(i, REQ_BACKUP_PICK);
                } catch (Exception e) { js("window.__fileCb && window.__fileCb(null)"); }
            });
        }

        @JavascriptInterface
        public boolean saveFile(String name, String mime, String b64) {
            try {
                byte[] data = Base64.decode(b64, Base64.DEFAULT);
                if (Build.VERSION.SDK_INT >= 29) {
                    android.content.ContentValues cv = new android.content.ContentValues();
                    cv.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                    cv.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                    cv.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Finova");
                    Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                    if (uri == null) return false;
                    OutputStream os = getContentResolver().openOutputStream(uri);
                    os.write(data); os.close();
                    toastMain("ذخیره شد: Downloads/Finova/" + name);
                    return true;
                }
                File dir = new File(getExternalFilesDir(null), "Finova");
                dir.mkdirs();
                FileOutputStream fo = new FileOutputStream(new File(dir, name));
                fo.write(data); fo.close();
                return true;
            } catch (Exception e) { toastMain("خطا در ذخیره: " + e.getMessage()); return false; }
        }

        @JavascriptInterface
        public void shareFile(String name, String mime, String b64) {
            try {
                byte[] data = Base64.decode(b64, Base64.DEFAULT);
                File dir = new File(getCacheDir(), "share");
                dir.mkdirs();
                File f = new File(dir, name);
                FileOutputStream fo = new FileOutputStream(f);
                fo.write(data); fo.close();
                // از FileProvider بدون کتابخانه: ذخیره در MediaStore سپس اشتراک
                if (Build.VERSION.SDK_INT >= 29) {
                    android.content.ContentValues cv = new android.content.ContentValues();
                    cv.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                    cv.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                    cv.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Finova");
                    cv.put(MediaStore.MediaColumns.IS_PENDING, 1);
                    Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                    if (uri != null) {
                        OutputStream os = getContentResolver().openOutputStream(uri);
                        os.write(data); os.close();
                        android.content.ContentValues done = new android.content.ContentValues();
                        done.put(MediaStore.MediaColumns.IS_PENDING, 0);
                        getContentResolver().update(uri, done, null, null);
                        Intent send = new Intent(Intent.ACTION_SEND);
                        send.setType(mime);
                        send.putExtra(Intent.EXTRA_STREAM, uri);
                        send.setClipData(android.content.ClipData.newRawUri("file", uri));
                        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        startActivity(Intent.createChooser(send, "اشتراک‌گذاری"));
                        return;
                    }
                }
                // fallback: اشتراک متنی
                Intent t = new Intent(Intent.ACTION_SEND);
                t.setType("text/plain");
                t.putExtra(Intent.EXTRA_TEXT, "فایل گزارش فینوا ذخیره شد: " + name);
                startActivity(Intent.createChooser(t, "اشتراک‌گذاری"));
            } catch (Exception e) { toastMain("خطا در اشتراک: " + e.getMessage()); }
        }

        @JavascriptInterface
        public void shareText(String text) {
            Intent t = new Intent(Intent.ACTION_SEND);
            t.setType("text/plain");
            t.putExtra(Intent.EXTRA_TEXT, text);
            t.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(Intent.createChooser(t, "اشتراک‌گذاری"));
        }

        @JavascriptInterface
        public void vibrate(int ms) {
            try {
                Vibrator v;
                if (Build.VERSION.SDK_INT >= 31) {
                    VibratorManager vm = (VibratorManager) getSystemService(VIBRATOR_MANAGER_SERVICE);
                    v = vm.getDefaultVibrator();
                } else {
                    v = (Vibrator) getSystemService(VIBRATOR_SERVICE);
                }
                if (v != null) v.vibrate(VibrationEffect.createOneShot(Math.max(10, ms), VibrationEffect.DEFAULT_AMPLITUDE));
            } catch (Exception ignored) {}
        }

        @JavascriptInterface
        public void toast(String msg) { toastMain(msg); }

        @JavascriptInterface
        public void updateWidget(String balance, String l1, String l2, String stamp) {
            getSharedPreferences("finova_widget", MODE_PRIVATE).edit()
                    .putString("balance", balance).putString("l1", l1)
                    .putString("l2", l2).putString("stamp", stamp).apply();
            FinovaWidget.pushAll(MainActivity.this);
        }

        @JavascriptInterface
        public String appVersion() {
            try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; }
            catch (Exception e) { return "1.0.0"; }
        }

        @JavascriptInterface
        public void exitApp() { main.postDelayed(() -> finishAndRemoveTask(), 100); }

        /* ═══ بروزرسانی: دانلود APK با پیشرفت + نصب با FileProvider ═══ */

        /** دانلود APK در پوشه اختصاصی برنامه — پاسخ‌ها: __dlCb(id, phase, a, b)
         *  phase: progress(received,total) | done(path) | error(msg) */
        @JavascriptInterface
        public void downloadApk(final String id, final String urlStr) {
            pool.execute(() -> {
                File dir = new File(getExternalFilesDir(null), "update");
                if (!dir.exists()) dir.mkdirs();
                File part = new File(dir, "Finova-update.apk.part");
                File out = new File(dir, "Finova-update.apk");
                try {
                    HttpURLConnection c = (HttpURLConnection) new URL(urlStr).openConnection();
                    c.setRequestMethod("GET");
                    c.setConnectTimeout(15000);
                    c.setReadTimeout(60000);
                    c.setInstanceFollowRedirects(true);
                    c.setRequestProperty("User-Agent", "Finova/1.0 (Android)");
                    int code = c.getResponseCode();
                    if (code >= 400) throw new Exception("HTTP " + code);
                    long total = c.getContentLength();
                    InputStream is = c.getInputStream();
                    FileOutputStream fo = new FileOutputStream(part);
                    byte[] buf = new byte[16384];
                    long received = 0, lastTick = -1;
                    int r;
                    while ((r = is.read(buf)) > 0) {
                        fo.write(buf, 0, r);
                        received += r;
                        // هر ۱٪ یا هر ۶۴ کیلوبایت یک بار پیشرفت را بفرست
                        long tick = total > 0 ? received * 100 / total : received / 65536;
                        if (tick != lastTick) { lastTick = tick; dlCb(id, "progress", received, Math.max(total, 0)); }
                    }
                    fo.close(); is.close();
                    if (out.exists()) out.delete();
                    if (!part.renameTo(out) || out.length() == 0) throw new Exception("finalize failed");
                    dlDone(id, "done", out.getAbsolutePath());
                } catch (Exception e) {
                    try { part.delete(); } catch (Exception ignored) {}
                    dlDone(id, "error", "خطا در دانلود: " + e.getMessage());
                }
            });
        }

        private void dlCb(String id, String phase, long a, long b) {
            final String call = "window.__dlCb && window.__dlCb(" + org.json.JSONObject.quote(id) + "," +
                    org.json.JSONObject.quote(phase) + "," + a + "," + b + ");";
            main.post(() -> web.evaluateJavascript(call, null));
        }
        private void dlDone(String id, String phase, String s) {
            final String call = "window.__dlCb && window.__dlCb(" + org.json.JSONObject.quote(id) + "," +
                    org.json.JSONObject.quote(phase) + "," + org.json.JSONObject.quote(s) + ",0);";
            main.post(() -> web.evaluateJavascript(call, null));
        }

        /** باز کردن Intent نصب — اگر مجوز «منابع ناشناس» نبود، صفحه تنظیمات باز می‌شود
         *  پاسخ: __installCb(status) → started | need-permission | missing-file | error:... */
        @JavascriptInterface
        public void installApk(final String path) {
            main.post(() -> {
                try {
                    if (!getPackageManager().canRequestPackageInstalls()) {
                        try {
                            startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                    Uri.parse("package:" + getPackageName())));
                            toastMain("به فینوا اجازه «نصب از منابع ناشناس» بده و دوباره تلاش کن");
                        } catch (Exception e2) {
                            try { startActivity(new Intent(Settings.ACTION_APPLICATION_SETTINGS)); } catch (Exception ignored) {}
                        }
                        js("window.__installCb && window.__installCb('need-permission')");
                        return;
                    }
                    File f = new File(path);
                    if (!f.exists() || f.length() == 0) {
                        js("window.__installCb && window.__installCb('missing-file')");
                        return;
                    }
                    // راهنمای Play Protect — فقط بار اول (بعد از آن مستقیم نصب)
                    android.content.SharedPreferences sp = getSharedPreferences("finova_prefs", MODE_PRIVATE);
                    if (!sp.getBoolean("pp_tip_shown", false)) {
                        sp.edit().putBoolean("pp_tip_shown", true).apply();
                        new android.app.AlertDialog.Builder(MainActivity.this)
                                .setTitle("نکته مهم برای نصب")
                                .setMessage("پیش از باز شدن نصب‌کننده، این را بدان:\n\nاگر Google Play Protect پیام \"App blocked to protect your device\" نشان داد، روی Install anyway بزنید.\n\nاین هشدار برای همه اپ‌های نصب‌شده از خارج از گوگل‌پلی است، نه به‌خاطر خطرناک بودن فینوا. فینوا کاملاً محلی است و هیچ داده‌ای از گوشی شما ارسال نمی‌کند.")
                                .setPositiveButton("ادامه نصب", (d, w) -> launchInstaller(f))
                                .setNegativeButton("انصراف", (d, w) -> js("window.__installCb && window.__installCb('cancelled')"))
                                .setOnCancelListener(d -> js("window.__installCb && window.__installCb('cancelled')"))
                                .show();
                        return;
                    }
                    launchInstaller(f);
                } catch (Exception e) {
                    js("window.__installCb && window.__installCb(" + org.json.JSONObject.quote("error:" + e.getMessage()) + ")");
                }
            });
        }

        private void launchInstaller(File f) {
            try {
                Uri uri = Uri.parse("content://com.finova.money.files/" + Uri.encode(f.getName()));
                Intent i = new Intent(Intent.ACTION_VIEW);
                i.setDataAndType(uri, "application/vnd.android.package-archive");
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(i);
                js("window.__installCb && window.__installCb('started')");
            } catch (Exception e) {
                js("window.__installCb && window.__installCb(" + org.json.JSONObject.quote("error:" + e.getMessage()) + ")");
            }
        }

        private void js(String call) {
            main.post(() -> web.evaluateJavascript(call, null));
        }
        private void toastMain(String msg) {
            main.post(() -> Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show());
        }
    }

    private void createChannel() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "یادآوری‌های فینوا", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("یادآوری اقساط، بودجه و هشدارها");
        nm.createNotificationChannel(ch);
    }

    /* ═════════ سرور محلی assets (secure context برای IndexedDB) ═════════ */
    static class AssetServer {
        private final AssetManager assets;
        private final String root;
        private ServerSocket socket;
        private final ExecutorService workers = Executors.newCachedThreadPool();
        private volatile boolean running;

        AssetServer(AssetManager assets, String root) { this.assets = assets; this.root = root; }

        int start(int from, int to) {
            for (int p = from; p <= to; p++) {
                try {
                    socket = new ServerSocket(p, 50, java.net.InetAddress.getByName("127.0.0.1"));
                    socket.setReuseAddress(true);
                    running = true;
                    final int port = p;
                    workers.execute(() -> acceptLoop());
                    return p;
                } catch (Exception ignored) {}
            }
            return from;
        }

        private void acceptLoop() {
            while (running) {
                try {
                    Socket s = socket.accept();
                    workers.execute(() -> handle(s));
                } catch (Exception e) { if (running) try { Thread.sleep(100); } catch (Exception ignored) {} }
            }
        }

        private void handle(Socket s) {
            try {
                s.setSoTimeout(5000);
                byte[] buf = new byte[8192];
                int n = s.getInputStream().read(buf);
                if (n <= 0) { s.close(); return; }
                String req = new String(buf, 0, n, StandardCharsets.UTF_8);
                String path = req.split(" ")[1];
                if (path.contains("?")) path = path.substring(0, path.indexOf('?'));
                if (path.endsWith("/")) path += "index.html";
                path = path.replace("..", "").replace("\\", "");
                byte[] data = readAsset(root + path);
                String mime = mime(path);
                String head = "HTTP/1.1 " + (data == null ? "404 Not Found" : "200 OK") + "\r\n" +
                        "Content-Type: " + mime + "; charset=utf-8\r\n" +
                        "Content-Length: " + (data == null ? 0 : data.length) + "\r\n" +
                        "Access-Control-Allow-Origin: *\r\n" +
                        "Cache-Control: no-cache\r\nConnection: close\r\n\r\n";
                OutputStream os = s.getOutputStream();
                os.write(head.getBytes(StandardCharsets.UTF_8));
                if (data != null) os.write(data);
                os.flush();
                s.close();
            } catch (Exception ignored) {
                try { s.close(); } catch (Exception ignored2) {}
            }
        }

        private byte[] readAsset(String path) {
            try (InputStream is = assets.open(path.startsWith("/") ? path.substring(1) : path)) {
                java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
                byte[] b = new byte[16384];
                int r;
                while ((r = is.read(b)) > 0) bos.write(b, 0, r);
                return bos.toByteArray();
            } catch (Exception e) { return null; }
        }

        private String mime(String p) {
            String l = p.toLowerCase();
            if (l.endsWith(".html") || l.endsWith(".htm")) return "text/html";
            if (l.endsWith(".css")) return "text/css";
            if (l.endsWith(".js") || l.endsWith(".mjs")) return "application/javascript";
            if (l.endsWith(".json")) return "application/json";
            if (l.endsWith(".png")) return "image/png";
            if (l.endsWith(".jpg") || l.endsWith(".jpeg")) return "image/jpeg";
            if (l.endsWith(".svg")) return "image/svg+xml";
            if (l.endsWith(".woff2")) return "font/woff2";
            if (l.endsWith(".woff")) return "font/woff";
            if (l.endsWith(".ttf")) return "font/ttf";
            if (l.endsWith(".ico")) return "image/x-icon";
            return "application/octet-stream";
        }

        void stop() { running = false; try { socket.close(); } catch (Exception ignored) {} }
    }

    /** ارسال JS از خود اکتیویتی (نسخه کلاس داخلی Bridge جداگانه دارد) */
    private void js(String call) {
        main.post(() -> web.evaluateJavascript(call, null));
    }

    private String readAll(InputStream is) {
        try {
            java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
            byte[] b = new byte[16384];
            int r;
            while (is != null && (r = is.read(b)) > 0) bos.write(b, 0, r);
            return bos.toString("UTF-8");
        } catch (Exception e) { return ""; }
    }
}
