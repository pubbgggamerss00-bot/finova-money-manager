/* ═══════════ بروزرسان فینوا — بررسی نسخه از گیت‌هاب + دانلود و نصب APK ═══════════
   جریان: releases/latest API → مقایسه نسخه → نمایش قابلیت‌های جدید (Changelog)
   → دانلود با پل بومی downloadApk (نوار پیشرفت) → نصب با installApk (Intent + FileProvider)
   فلگ بروزرسانی اجباری: خط `<!-- mandatory: true -->` یا `mandatory: true` یا `[اجباری]` در متن Release
   این فایل باید بعد از app.js لود شود (به App/UI/Bridge/faDigits وابسته است) */
const Updater = (() => {

  const REPO = 'pubbgggamerss00-bot/finova-money-manager';
  const API_URL = 'https://api.github.com/repos/' + REPO + '/releases/latest';
  const CHECK_INTERVAL = 12 * 3600 * 1000; // چک خودکار هر ۱۲ ساعت

  /* ── وضعیت داخلی ── */
  let areaState = 'idle';   // idle | checking | uptodate | available | error | downloading | downloaded
  let lastInfo = null;      // نتیجه آخرین بررسی موفق
  let lastError = '';
  let dlPath = null;        // مسیر APK دانلودشده (بومی)
  let dlProg = { rec: 0, tot: 0 };
  let lastCheckedAt = 0;

  /* ── ابزار ── */
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function fa(s) { try { return faDigits(String(s)); } catch (e) { return String(s); } }
  function fmtSize(b) {
    b = +b || 0;
    if (b >= 1048576) return fa((b / 1048576).toFixed(1)) + ' مگابایت';
    if (b >= 1024) return fa(Math.round(b / 1024)) + ' کیلوبایت';
    return fa(b) + ' بایت';
  }

  /** مقایسه نسخه معنایی: -1 یعنی a کوچکتر، 1 بزرگتر، 0 برابر */
  function cmpVer(a, b) {
    const norm = v => String(v || '').trim().replace(/^v/i, '').split(/[.\-_]/).map(p => /^\d+$/.test(p) ? parseInt(p, 10) : p);
    const pa = norm(a), pb = norm(b);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
      const x = pa[i], y = pb[i];
      if (x === undefined && y === undefined) return 0;
      if (x === undefined) return typeof y === 'number' ? -1 : 1;   // 1.0 در برابر 1.0.1
      if (y === undefined) return typeof x === 'number' ? 1 : -1;
      if (x === y) continue;
      if (typeof x === 'number' && typeof y === 'number') return x < y ? -1 : 1;
      return String(x) < String(y) ? -1 : 1;
    }
    return 0;
  }

  function currentVersion() {
    try {
      if (Bridge.hasNative() && Bridge.version() && Bridge.version() !== 'web') return Bridge.version();
    } catch (e) {}
    return (window.__APP_VERSION || '0.0.0');
  }

  /** استخراج بخش «تازه‌ها» از متن Release */
  function parseChangelog(body) {
    const lines = String(body || '').replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/);
    // ۱) بخش هدشدار مخصوص تازه‌ها
    let start = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^#{1,4}\s/.test(lines[i]) && /تازه|قابلیت|جدید|امکان|چنگ‌لوج|changelog|feature|بهبود/i.test(lines[i])) { start = i + 1; break; }
    }
    if (start >= 0) {
      const out = [];
      for (let i = start; i < lines.length && out.length < 24; i++) {
        if (/^#{1,4}\s/.test(lines[i])) break;
        if (lines[i].trim()) out.push(lines[i].trim());
      }
      if (out.length) return out.join('\n');
    }
    // ۲) فال‌بک: همه بندهای لیستی
    const bullets = lines.map(l => l.trim()).filter(l => /^([-*•]|[✨✅🔧⭐🚀🎉]\s)/.test(l) && l.length > 2).slice(0, 14);
    return bullets.join('\n');
  }

  /** رندر کوچک مارک‌داون (بولد + لیست) */
  function mdList(md) {
    let h = esc(md);
    h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/^[-*•]\s+(.+)$/gm, '<li>$1</li>');
    h = h.replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, '<ul>$1</ul>');
    h = h.replace(/^(?!<[ul])(.+)$/gm, '<div class="upd-line">$1</div>');
    return h;
  }

  /* ── بررسی نسخه ── */
  async function check(forceVer) {
    const cur = forceVer || currentVersion();
    try {
      const r = await Bridge.http(API_URL, 'GET', { 'Accept': 'application/vnd.github+json' }, '', 20000);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = JSON.parse(r.body);
      if (!j || !j.tag_name) throw new Error('bad-payload');
      const ver = String(j.tag_name).replace(/^v/i, '').trim();
      let body = String(j.body || '');
      const mandatory = /<!--\s*mandatory\s*:\s*true\s*-->/i.test(body) || /^\s*mandatory\s*:\s*true\s*$/im.test(body) || body.includes('[اجباری]');
      const changelogMd = parseChangelog(body) || 'بهبودهای عمومی و رفع اشکال';
      let apk = null, size = 0;
      (j.assets || []).forEach(a => {
        if (/\.apk$/i.test(a.name || '')) { apk = a.browser_download_url; size = a.size || 0; }
      });
      const info = {
        version: ver,
        current: cur,
        isNew: cmpVer(ver, cur) > 0,
        mandatory,
        changelogMd,
        url: apk,
        size,
        htmlUrl: j.html_url || ('https://github.com/' + REPO + '/releases'),
        date: j.published_at ? new Date(j.published_at).getTime() : 0,
      };
      lastInfo = info; lastCheckedAt = Date.now();
      if (typeof forceVer === 'undefined') markChecked();
      return info;
    } catch (e) {
      lastError = faErr(e && e.message || String(e));
      throw new Error(lastError);
    }
  }

  function faErr(msg) {
    if (/HTTP 403|rate limit/i.test(msg)) return 'محدودیت موقت گیت‌هاب — چند دقیقه دیگر دوباره تلاش کن';
    if (/HTTP 404/i.test(msg)) return 'ریلیزی در گیت‌هاب پیدا نشد';
    if (/timeout|AbortError/i.test(msg)) return 'زمان بررسی به پایان رسید — اتصال اینترنت را چک کن';
    if (/bad-payload|JSON/i.test(msg)) return 'پاسخ نامعتبر از گیت‌هاب';
    return 'اتصال به گیت‌هاب برقرار نشد — اینترنت را چک کن';
  }

  /* ── ذخیره زمان آخرین بررسی (ضد ناراحتی تکرار) ── */
  function markChecked() {
    try {
      const st = App.state;
      if (!st) return;
      if (!st.upd) st.upd = { lastCheck: 0, dismissed: '' };
      st.upd.lastCheck = Date.now();
      App.saveState();
    } catch (e) {}
  }
  function getUpdState() {
    try {
      const st = App.state;
      if (!st.upd) st.upd = { lastCheck: 0, dismissed: '' };
      return st.upd;
    } catch (e) { return { lastCheck: 0, dismissed: '' }; }
  }

  /* ═══ UI — کارت تنظیمات ═══ */
  function progressHTML(rec, tot) {
    const pct = tot > 0 ? Math.min(100, Math.round(rec * 100 / tot)) : 0;
    return `
      <div class="dl-progress"><div class="dl-fill" style="width:${pct}%"></div></div>
      <div class="dl-meta"><span class="dl-pct">${fa(pct)}٪</span><span>${tot > 0 ? fa((rec / 1048576).toFixed(1)) + ' از ' + fa((tot / 1048576).toFixed(1)) + ' مگابایت' : fa((rec / 1024).toFixed(0)) + ' کیلوبایت'}</span></div>`;
  }
  function tickProgress() {
    const rec = dlProg.rec, tot = dlProg.tot;
    const pct = tot > 0 ? Math.min(100, Math.round(rec * 100 / tot)) : 0;
    document.querySelectorAll('.dl-fill').forEach(el => el.style.width = pct + '%');
    document.querySelectorAll('.dl-pct').forEach(el => el.textContent = fa(pct) + '٪');
    document.querySelectorAll('.dl-bytes').forEach(el => { el.textContent = tot > 0 ? fa((rec / 1048576).toFixed(1)) + ' از ' + fa((tot / 1048576).toFixed(1)) + ' مگابایت' : fa((rec / 1024).toFixed(0)) + ' کیلوبایت'; });
  }

  function settingsAreaHTML() {
    const ver = currentVersion();
    switch (areaState) {
      case 'checking':
        return `<div class="upd-loading"><div class="spin"></div><span>در حال بررسی آخرین نسخه در گیت‌هاب…</span></div>`;
      case 'available':
        return `
          <div class="upd-avail">
            <div class="upd-vers">
              <div class="uv-box cur"><small>نسخه فعلی</small><b>${fa(ver)}</b></div>
              <div class="uv-arrow">⬅</div>
              <div class="uv-box new"><small>نسخه جدید</small><b>${fa(lastInfo.version)}</b></div>
            </div>
            <div class="upd-log">${mdList(lastInfo.changelogMd)}</div>
            <button class="btn full" id="updDlBtn">⬇ دانلود و نصب ${lastInfo.size ? '(' + fmtSize(lastInfo.size) + ')' : ''}</button>
            <button class="btn ghost full" id="updOpenBtn" style="margin-top:8px">مشاهده در گیت‌هاب ↗</button>
          </div>`;
      case 'downloading':
        return `<div class="upd-dling"><div class="upd-loading"><div class="spin"></div><span>در حال دانلود نسخه ${fa(lastInfo ? lastInfo.version : '')}…</span></div>${progressHTML(dlProg.rec, dlProg.tot)}</div>`;
      case 'downloaded':
        return `<div class="upd-done"><div class="upd-ok">✅ دانلود کامل شد</div><button class="btn full" id="updInstBtn">📥 نصب برنامه</button><div class="hint" style="text-align:center;margin-top:8px">💡 اگر Play Protect هشدار داد، روی <b>Install anyway</b> بزن</div></div>`;
      case 'error':
        return `<div class="upd-err">⚠️ ${esc(lastError)}</div><button class="btn full" id="checkUpdBtn" style="margin-top:8px">تلاش مجدد</button>`;
      case 'uptodate':
        return `<div class="upd-ok">✅ فینوا به‌روز است — نسخه ${fa(ver)} جدیدترین نسخه است</div><button class="btn ghost full" id="checkUpdBtn" style="margin-top:8px">بررسی مجدد</button>`;
      default:
        return `<button class="btn full" id="checkUpdBtn">🔄 بررسی بروزرسانی</button>
          <div class="hint" style="text-align:center;margin-top:8px">آخرین نسخه از گیت‌هاب چک می‌شود ${lastCheckedAt ? '• آخرین بررسی: ' + fa(new Date(lastCheckedAt).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })) : ''}</div>`;
    }
  }

  function renderSettingsArea() {
    const el = document.getElementById('updArea');
    if (!el) return;
    el.innerHTML = settingsAreaHTML();
    const bind = (id, fn) => { const b = el.querySelector('#' + id); if (b) b.onclick = fn; };
    bind('checkUpdBtn', () => checkFromSettings());
    bind('updDlBtn', () => startDownload(lastInfo, { area: true }));
    bind('updInstBtn', () => installFlow(lastInfo, { area: true }));
    bind('updOpenBtn', () => { try { window.open(lastInfo.htmlUrl, '_blank'); } catch (e) {} });
  }

  async function checkFromSettings() {
    areaState = 'checking'; renderSettingsArea();
    try {
      const info = await check();
      areaState = info.isNew ? 'available' : 'uptodate';
      if (info.isNew && !info.url) lastError = 'فایل APK در ریلیز گیت‌هاب پیوست نشده';
    } catch (e) { areaState = 'error'; }
    renderSettingsArea();
  }

  /* ═══ UI — دیالوگ بروزرسانی (چک خودکار هنگام ورود) ═══ */
  function showUpdateDialog(info) {
    closeDialog();
    const bd = document.createElement('div');
    bd.className = 'modal-backdrop upd-dialog';
    bd.id = 'updDialog';
    bd.innerHTML = `
      <div class="modal upd-modal">
        <div class="upd-hero">
          <div class="upd-hero-ico">🚀</div>
          <h3>نسخه جدید فینوا رسید!</h3>
          <div class="upd-vers">
            <div class="uv-box cur"><small>نسخه فعلی</small><b>${fa(info.current)}</b></div>
            <div class="uv-arrow">⬅</div>
            <div class="uv-box new"><small>نسخه جدید</small><b>${fa(info.version)}</b></div>
          </div>
        </div>
        <div class="card-title" style="margin-top:14px">✨ قابلیت‌های جدید</div>
        <div class="upd-log">${mdList(info.changelogMd)}</div>
        <div class="upd-dl-zone" id="updDlZone" style="margin-top:12px">
          <button class="btn full" id="udDlBtn">⬇ دانلود و نصب ${info.size ? '(' + fmtSize(info.size) + ')' : ''}</button>
          <button class="btn ghost full" id="udLater" style="margin-top:8px">بعداً</button>
        </div>
      </div>`;
    document.getElementById('modalRoot').appendChild(bd);
    bd.querySelector('#udLater').onclick = () => {
      try { const u = getUpdState(); u.dismissed = info.version; App.saveState(); } catch (e) {}
      closeDialog();
    };
    bd.querySelector('#udDlBtn').onclick = () => startDownload(info, { zone: bd.querySelector('#updDlZone'), dialog: bd });
    return bd;
  }
  function closeDialog() { const d = document.getElementById('updDialog'); if (d) d.remove(); }

  /* ═══ اورلی بروزرسانی اجباری (بدون دکمه بعداً — تا نصب، اپ قفل است) ═══ */
  function showForceOverlay(info) {
    let ov = document.getElementById('forceUpd');
    if (ov) ov.remove();
    ov = document.createElement('div');
    ov.className = 'force-upd';
    ov.id = 'forceUpd';
    ov.innerHTML = `
      <div class="force-card">
        <div class="upd-hero">
          <div class="upd-hero-ico">🛡️</div>
          <h3>بروزرسانی اجباری فینوا</h3>
        </div>
        <p class="fu-text">نسخه <b>${fa(info.version)}</b> با قابلیت‌های جدید منتشر شده و برای ادامه باید نصب شود.<br><small>نسخه فعلی تو: ${fa(info.current)}</small></p>
        <div class="upd-log">${mdList(info.changelogMd)}</div>
        <div class="upd-dl-zone" id="fuZone" style="margin-top:12px">
          <button class="btn full" id="fuBtn">⬇ دانلود و نصب ${info.size ? '(' + fmtSize(info.size) + ')' : ''}</button>
          <div class="hint" style="text-align:center;margin-top:8px">این بروزرسانی اجباری است و تا نصب کامل، اپلیکیشن قابل استفاده نیست</div>
        </div>
      </div>`;
    document.body.appendChild(ov);
    ov.querySelector('#fuBtn').onclick = () => startDownload(info, { zone: ov.querySelector('#fuZone') });
    return ov;
  }

  /* ═══ جریان دانلود → نصب ═══ */
  async function startDownload(info, ctx) {
    ctx = ctx || {};
    // حالت وب (پیش‌نمایش مرورگر): باز کردن مستقیم لینک گیت‌هاب
    if (!Bridge.hasNative()) {
      try { window.open(info.url || info.htmlUrl, '_blank'); } catch (e) {}
      UI.toast('لینک دانلود از گیت‌هاب باز شد — روی گوشی، دانلود و نصب خودکار انجام می‌شود', 'ok');
      return;
    }
    if (!info.url) { UI.toast('فایل APK در ریلیز گیت‌هاب پیوست نشده است', 'bad'); return; }
    setBusyUI(ctx, 'downloading');
    areaState = 'downloading'; if (ctx.area) renderSettingsArea();
    const res = await Bridge.downloadApk(info.url, (rec, tot) => { dlProg = { rec, tot }; tickProgress(); });
    if (res.ok) {
      dlPath = res.path;
      areaState = 'downloaded'; if (ctx.area) renderSettingsArea();
      setBusyUI(ctx, 'downloaded');
      installFlow(info, ctx);
    } else {
      areaState = 'error'; lastError = faErr(res.msg || 'download-failed'); if (ctx.area) renderSettingsArea();
      setBusyUI(ctx, 'error', lastError);
    }
  }

  async function installFlow(info, ctx) {
    ctx = ctx || {};
    if (!Bridge.hasNative()) { try { window.open(info.url || info.htmlUrl, '_blank'); } catch (e) {} return; }
    if (!dlPath) { // فایل از جلسه قبلی نیست — دوباره دانلود کن
      return startDownload(info, ctx);
    }
    setBusyUI(ctx, 'installing');
    const r = await Bridge.installApk(dlPath);
    if (r.status === 'need-permission') {
      setBusyUI(ctx, 'need-permission');
      return;
    }
    if (!r.ok) setBusyUI(ctx, 'error', 'اجرای نصب‌کننده ناموفق بود — دوباره تلاش کن');
    // started → صفحه نصب اندروید باز شده؛ هیچ کاری لازم نیست
  }

  /* تغییر ظاهر ناحیه دانلود داخل دیالوگ/اورلی */
  function setBusyUI(ctx, state, errMsg) {
    const zone = ctx.zone || document.getElementById('updDlZone');
    if (!zone) return;
    if (state === 'downloading') {
      zone.innerHTML = `
        <div class="upd-loading"><div class="spin"></div><span>در حال دانلود نسخه ${fa(lastInfo ? lastInfo.version : '')}…</span></div>
        ${progressHTML(dlProg.rec, dlProg.tot)}`;
    } else if (state === 'downloaded') {
      zone.innerHTML = `<div class="upd-ok">✅ دانلود کامل شد — در حال باز کردن نصب…</div>`;
    } else if (state === 'installing') {
      zone.innerHTML = `<div class="upd-loading"><div class="spin"></div><span>در حال باز کردن صفحه نصب…</span></div>
        <div class="hint" style="text-align:center;margin-top:10px">💡 اگر Google Play Protect هشدار «App blocked» داد، روی <b>Install anyway</b> بزن</div>`;
    } else if (state === 'need-permission') {
      zone.innerHTML = `
        <div class="upd-perm">
          <b>🔐 یک قدم مانده!</b>
          <div class="upd-perm-steps">
            <div>۱. در صفحه‌ای که باز شد، اجازه «نصب از منابع ناشناس» را به فینوا بده</div>
            <div>۲. برگرد و دکمه زیر را دوباره بزن</div>
          </div>
          <button class="btn full" id="retryInstBtn">📥 نصب برنامه</button>
        </div>`;
      const rb = zone.querySelector('#retryInstBtn');
      if (rb) rb.onclick = () => installFlow(lastInfo || { url: '', htmlUrl: '' }, ctx);
    } else if (state === 'error') {
      zone.innerHTML = `<div class="upd-err">⚠️ ${esc(errMsg || 'خطای نامشخص')}</div>
        <button class="btn full" id="retryDlBtn" style="margin-top:8px">تلاش مجدد</button>`;
      const rb = zone.querySelector('#retryDlBtn');
      if (rb) rb.onclick = () => { dlPath = null; startDownload(lastInfo || { url: '', htmlUrl: '' }, ctx); };
    }
  }

  /* ═══ چک خودکار هنگام شروع (ساکت، هر ۱۲ ساعت) ═══ */
  async function autoCheck() {
    try {
      const u = getUpdState();
      if (Date.now() - (u.lastCheck || 0) < CHECK_INTERVAL) return;
      const info = await check();
      if (!info.isNew) return;
      if (info.mandatory) { showForceOverlay(info); return; }
      if (u.dismissed === info.version) return; // قبلاً «بعداً» زده
      showUpdateDialog(info);
    } catch (e) { /* ساکت — چک خودکار نباید مزاحم شود */ }
  }

  return {
    check, autoCheck, cmpVer, currentVersion,
    renderSettingsArea, checkFromSettings, showUpdateDialog, showForceOverlay, startDownload,
    get lastInfo() { return lastInfo; }, get areaState() { return areaState; },
    setTestVer: v => { window.__APP_VERSION = v; }, // فقط برای تست
  };
})();
