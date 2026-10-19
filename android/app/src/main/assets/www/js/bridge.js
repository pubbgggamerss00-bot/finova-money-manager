/* ═══════════ پل ارتباط با اندروید (اعلان، بیومتریک، شبکه، اشتراک) ═══════════ */
const Bridge = (() => {
  const native = window.Finova || null; // addJavascriptInterface در MainActivity
  let reqSeq = 0;
  const pendingNet = {};

  if (native) {
    // callbacks از سمت جاوا
    window.__netCb = (id, ok, status, body) => {
      const cb = pendingNet[id];
      if (!cb) return;
      delete pendingNet[id];
      clearTimeout(cb.timer);
      ok ? cb.resolve({ ok: true, status, body }) : cb.resolve({ ok: false, status, body });
    };
    window.__bioCb = (ok, msg) => {
      if (window.__bioHandler) { window.__bioHandler(ok, msg); }
    };
    window.__notifPermCb = (granted) => { if (window.__notifPermHandler) window.__notifPermHandler(granted); };
    window.__androidBack = () => { if (window.__backHandler) window.__backHandler(); };
  }

  function hasNative() { return !!native; }

  function http(url, method, headers, body, timeoutMs) {
    return new Promise((resolve) => {
      if (native && native.http) {
        const id = 'n' + (++reqSeq);
        pendingNet[id] = { resolve, timer: setTimeout(() => resolve({ ok: false, status: 0, body: 'timeout' }), timeoutMs || 25000) };
        try { native.http(id, url, method, headers ? JSON.stringify(headers) : '{}', body || ''); }
        catch (e) { delete pendingNet[id]; resolve({ ok: false, status: 0, body: String(e) }); }
      } else {
        // حالت وب (پیش‌نمایش مرورگر)
        const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const t = setTimeout(() => ctrl && ctrl.abort(), timeoutMs || 25000);
        fetch(url, {
          method: method || 'GET',
          headers: headers || undefined,
          body: body || undefined,
          signal: ctrl ? ctrl.signal : undefined,
        }).then(async r => {
          clearTimeout(t);
          const text = await r.text();
          resolve({ ok: r.ok, status: r.status, body: text });
        }).catch(e => { clearTimeout(t); resolve({ ok: false, status: 0, body: String(e && e.message || e) }); });
      }
    });
  }

  function showNotification(title, body, id, tag) {
    if (native && native.showNotification) {
      try { native.showNotification(String(title || ''), String(body || ''), String(id || Date.now()), String(tag || 'finova')); } catch (e) {}
      return;
    }
    // حالت وب: Notification API مرورگر (رفع نبود اعلان در پیش‌نمایش)
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(String(title || 'فینوا'), { body: String(body || ''), tag: String(tag || 'finova') });
      }
    } catch (e) {}
  }
  function requestNotifPermission() {
    return new Promise(res => {
      if (!native || !native.requestNotifPermission) {
        // مرورگر: درخواست مجوز Notification
        try {
          if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
            Notification.requestPermission().then(g => { window.__notifPermHandler && window.__notifPermHandler(g === 'granted'); res(g === 'granted'); }).catch(() => res(false));
            return;
          }
          res(typeof Notification !== 'undefined' && Notification.permission === 'granted');
        } catch (e) { res(false); }
        return;
      }
      window.__notifPermHandler = (g) => res(!!g);
      try { native.requestNotifPermission(); } catch (e) { res(false); }
      setTimeout(() => res(true), 15000);
    });
  }
  function hasNotifPermission() {
    if (!native || !native.hasNotifPermission) return Promise.resolve(true);
    try { return Promise.resolve(!!native.hasNotifPermission()); } catch (e) { return Promise.resolve(true); }
  }
  function biometricAuth() {
    return new Promise(res => {
      if (!native || !native.biometricAuth) return res({ ok: false, msg: 'no-native' });
      window.__bioHandler = (ok, msg) => res({ ok: !!ok, msg: msg || '' });
      try { native.biometricAuth(); } catch (e) { res({ ok: false, msg: String(e) }); }
      setTimeout(() => res({ ok: false, msg: 'timeout' }), 120000);
    });
  }
  function canBiometric() {
    if (!native || !native.canBiometric) return Promise.resolve(false);
    try { return Promise.resolve(!!native.canBiometric()); } catch (e) { return Promise.resolve(false); }
  }
  function saveFile(name, mime, base64) {
    if (!native || !native.saveFile) {
      // مرورگر: دانلود مستقیم
      try {
        const a = document.createElement('a');
        a.href = 'data:' + mime + ';base64,' + base64;
        a.download = name; document.body.appendChild(a); a.click(); a.remove();
        return Promise.resolve(true);
      } catch (e) { return Promise.resolve(false); }
    }
    try { return Promise.resolve(!!native.saveFile(String(name), String(mime), String(base64))); } catch (e) { return Promise.resolve(false); }
  }
  function shareFile(name, mime, base64) {
    if (!native || !native.shareFile) return saveFile(name, mime, base64);
    try { native.shareFile(String(name), String(mime), String(base64)); return Promise.resolve(true); }
    catch (e) { return Promise.resolve(false); }
  }
  function shareText(text) {
    if (native && native.shareText) { try { native.shareText(String(text)); return; } catch (e) {} }
    if (navigator.share) navigator.share({ text }).catch(() => {});
  }
  function vibrate(ms) {
    try { if (native && native.vibrate) native.vibrate(+ms || 40); else if (navigator.vibrate) navigator.vibrate(+ms || 40); } catch (e) {}
  }
  function toast(msg) {
    if (native && native.toast) { try { native.toast(String(msg)); return; } catch (e) {} }
    UI && UI.toast && UI.toast(msg);
  }
  function updateWidget(balance, l1, l2, stamp) {
    if (native && native.updateWidget) {
      try { native.updateWidget(String(balance || ''), String(l1 || ''), String(l2 || ''), String(stamp || '')); } catch (e) {}
    }
  }
  function version() {
    if (native && native.appVersion) { try { return String(native.appVersion()); } catch (e) {} }
    return 'web';
  }
  function exitApp() {
    if (native && native.exitApp) { try { native.exitApp(); } catch (e) {} }
  }

  /* ── بروزرسانی: دانلود APK با نوار پیشرفت + نصب ── */
  function downloadApk(url, onProgress) {
    return new Promise(resolve => {
      if (!native || !native.downloadApk) {
        // حالت وب: باز کردن مستقیم لینک (فقط پیش‌نمایش مرورگر)
        try {
          const a = document.createElement('a');
          a.href = String(url); a.target = '_blank'; a.rel = 'noopener';
          document.body.appendChild(a); a.click(); a.remove();
          resolve({ ok: true, web: true });
        } catch (e) { resolve({ ok: false, msg: String(e) }); }
        return;
      }
      const id = 'dl' + (++reqSeq);
      window.__dlCb = (cbId, phase, a, b) => {
        if (String(cbId) !== id) return;
        if (phase === 'progress') { try { onProgress && onProgress(+a || 0, +b || 0); } catch (e) {} }
        else if (phase === 'done') resolve({ ok: true, path: String(a || '') });
        else resolve({ ok: false, msg: String(a || 'download-failed') });
      };
      try { native.downloadApk(id, String(url)); }
      catch (e) { resolve({ ok: false, msg: String(e) }); }
      // تایماوت ایمنی (۱۰ دقیقه)
      setTimeout(() => resolve({ ok: false, msg: 'timeout' }), 600000);
    });
  }
  function installApk(path) {
    return new Promise(resolve => {
      if (!native || !native.installApk) { resolve({ ok: false, status: 'no-native' }); return; }
      let done = false;
      window.__installCb = st => { done = true; resolve({ ok: st === 'started', status: String(st) }); };
      try { native.installApk(String(path)); }
      catch (e) { resolve({ ok: false, status: 'error:' + String(e) }); return; }
      // اگر جاوا callback نداد (بعضی رابط‌ها)، بعد از ۵ ثانیه فرض کن باز شده
      setTimeout(() => { if (!done) resolve({ ok: true, status: 'started' }); }, 5000);
    });
  }

  return { hasNative, http, showNotification, requestNotifPermission, hasNotifPermission, biometricAuth, canBiometric, saveFile, shareFile, shareText, vibrate, toast, updateWidget, version, exitApp, downloadApk, installApk };
})();
