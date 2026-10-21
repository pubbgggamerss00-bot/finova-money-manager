/* ═══════════════════ فینوا — منطق اصلی اپلیکیشن ═══════════════════ */
const App = (() => {
  let state = {};        // تنظیمات
  let txs = [], rules = [], budgets = [], goals = [], wallets = [], categories = [];
  let curTab = 'dashboard';
  let lastRates = null;
  let unlocked = false;
  const APP_VERSION = '1.7.0';

  const DEF_CATEGORIES = [
    { id: 'c_rent', name: 'اجاره خانه', icon: '🏠', essential: true, type: 'installment', color: '#f472b6' },
    { id: 'c_inst', name: 'قسط وام', icon: '🏦', essential: true, type: 'installment', color: '#38bdf8' },
    { id: 'c_food', name: 'خوراک', icon: '🍚', essential: true, type: 'expense', color: '#34d399' },
    { id: 'c_util', name: 'قبض و خدمات', icon: '💡', essential: true, type: 'expense', color: '#fbbf24' },
    { id: 'c_transport', name: 'حمل‌ونقل', icon: '🚌', essential: true, type: 'expense', color: '#22d3ee' },
    { id: 'c_health', name: 'درمان', icon: '💊', essential: true, type: 'expense', color: '#f87171' },
    { id: 'c_edu', name: 'آموزش', icon: '📚', essential: false, type: 'expense', color: '#a78bfa' },
    { id: 'c_fun', name: 'تفریح', icon: '🎮', essential: false, type: 'expense', color: '#e879f9' },
    { id: 'c_cloth', name: 'پوشاک', icon: '👕', essential: false, type: 'expense', color: '#fb923c' },
    { id: 'c_shop', name: 'خرید متفرقه', icon: '🛍️', essential: false, type: 'expense', color: '#4ade80' },
    { id: 'c_salary', name: 'حقوق', icon: '💼', type: 'income', color: '#34d399' },
    { id: 'c_side', name: 'درآمد جانبی', icon: '🧰', type: 'income', color: '#22d3ee' },
  ];
  const DEF_WALLETS = [
    { id: 'w_main', name: 'کیف پول اصلی', kind: 'cash' },
    { id: 'w_bank', name: 'حساب بانکی', kind: 'bank' },
  ];
  const CURR = { TMN: { name: 'تومان', sign: 'ت', rate: 1 }, USD: { name: 'دلار', sign: '$', rate: 100 }, USDT: { name: 'تتر', sign: '₮', rate: 100 }, EUR: { name: 'یورو', sign: '€', rate: 110 } };

  /* ───────── راه‌اندازی ───────── */
  async function boot() {
    bindChrome();
    try { Splash.step(8, 'راه‌اندازی فینوا…'); } catch (e) {}
    try {
      await Store.open();
    } catch (e) {
      console.error('DB open failed:', e);
      try { Splash.done(); } catch (e2) {}
      document.getElementById('view').innerHTML =
        '<div class="empty" style="margin-top:60px"><div class="big">⚠️</div><b>خطا در باز کردن پایگاه داده</b><br><br>' +
        '<button class="btn" onclick="location.reload()">تلاش مجدد</button></div>';
      return;
    }
    try { Splash.step(32, 'باز کردن پایگاه داده…'); } catch (e) {}
    try { await Store.migrateLegacyLocalStorage(); } catch (e) { console.warn('legacy migrate', e); }
    try { state = (await Store.get('kv', 'settings')) || {}; } catch (e) { state = {}; }
    // همیشه با مقادیر پیش‌فرض ادغام کن — فیلدهای جدید نسخه‌ها برای کاربران قدیمی هم ساخته شوند
    state = Object.assign(defaultState(), state, { v: 2 });
    state.rateAsk = Object.assign({ done: false, laterAt: 0, never: false }, state.rateAsk || {});
    // تم برنامه — برای کاربران قدیمی و مقدار نامعتبر → نئون
    if (!['neon', 'classic', 'pop'].includes(state.theme)) state.theme = 'neon';
    state.themeChanges = +(state.themeChanges || 0) || 0;
    // فیلدهای حساب/اشتراک — برای کاربران قدیمی هم ساخته شوند
    state.account = state.account || null;
    state.trialStart = +state.trialStart || 0;
    state.pro = Object.assign({ expiresAt: 0, used: [] }, state.pro || {});
    if (!Array.isArray(state.pro.used)) state.pro.used = [];
    state.quota = Object.assign({ aiFree: 0, smartFree: 0, calcFree: 0, rateDay: '', rateCount: 0, aiDay: '', aiDayCount: 0 }, state.quota || {});
    state.openCount = +(state.openCount || 0) + 1;   // شمارش باز شدن برای دیالوگ امتیاز
    try { saveState(); } catch (e) {}
    try { Splash.step(56, 'بارگذاری تراکنش‌ها…'); } catch (e) {}
    try { categories = (await Store.all('categories')) || []; } catch (e) { categories = []; }
    if (!categories.length) { categories = DEF_CATEGORIES.slice(); try { await Store.bulkPut('categories', categories); } catch (e) {} }
    try { wallets = (await Store.all('wallets')) || []; } catch (e) { wallets = []; }
    if (!wallets.length) { wallets = DEF_WALLETS.slice(); try { await Store.bulkPut('wallets', wallets); } catch (e) {} }
    try { txs = ((await Store.all('transactions')) || []).map(normTx); } catch (e) { txs = []; }
    try { rules = ((await Store.all('rules')) || []).map(normRule); } catch (e) { rules = []; }
    try { budgets = (await Store.all('budgets')) || []; } catch (e) { budgets = []; }
    try { goals = ((await Store.all('goals')) || []).map(normGoal); } catch (e) { goals = []; }

    try { Splash.step(86, 'آماده‌سازی رابط کاربری…'); } catch (e) {}
    applyTheme();
    document.getElementById('topDate').textContent = todayLabel();
    try { const vEl = document.getElementById('spVer'); if (vEl) vEl.textContent = 'نسخه ' + faDigits(APP_VERSION).replace('.', '٫'); } catch (e) {}
    try { Splash.done(); } catch (e) {}

    /* ═══ v1.6.0 — نشست کاربر: مهاجرت کاربران ۱.۵ + ورود خودکار با نشست معتبر ═══ */
    let regs = getRegistry();
    let sessCode = getSession();
    if (!regs.length && state.account && state.account.code) {
      // مهاجرت از نسخه ۱.۵: حساب موجود → رجیستری + نشست خودکار (کاربر متوجه چیزی نمی‌شود)
      regs.push({
        code: state.account.code, name: state.account.name, nameLower: String(state.account.name || '').toLowerCase(),
        salt: state.account.salt || '', passHash: state.account.passHash || '', createdAt: state.account.createdAt || Date.now(), logoutUsed: 0,
      });
      setRegistry(regs);
      sessCode = state.account.code; setSession(sessCode);
    }
    if (sessCode) {
      const me = regs.find(r => r.code === sessCode);
      if (!me) { sessCode = ''; setSession(''); }
      else if (!state.account || state.account.code !== sessCode) {
        // نشست معتبر است ولی داده‌ی استورها مال حساب دیگری است (مثلاً پاک‌شدن localStorage)
        // → داده‌های همان حساب از سندیک بازیابی می‌شود تا داده‌ی کاربران قاطی نشود
        await loadAccSession(me, false);
        categories = (await Store.all('categories')) || [];
        wallets = (await Store.all('wallets')) || [];
      }
    }
    // سندیک داده حساب — اگر نشست هست ولی سندیک قدیمی‌تر از استورهاست، سندیک تازه می‌شود
    if (!sessCode || !state.account || !state.account.code) { showAuth(); return; }
    await saveAccBlob();
    setInterval(() => { try { if (unlocked) saveAccBlob(); } catch (e) {} }, 90000);   // سندیک دوره‌ای
    window.addEventListener('pagehide', () => { try { saveAccBlob(); } catch (e) {} });
    // قفل
    if (state.lock && state.lock.enabled) { showLock(); } else { unlocked = true; afterUnlock(); }
  }

  function defaultState() {
    return {
      v: 2, dark: true, fontScale: 1,
      theme: 'neon', themeChanges: 0,          // شخصی‌سازی: تم فعال + تعداد تغییر رایگان
      lock: { enabled: false, pinHash: '', salt: '' },
      strict: { enabled: false, pct: 20 },
      notify: { days: [7, 3, 1], budgetAlert: true, balanceAlert: true },
      aiBaseURL: '', aiApiKey: '', aiModel: '',   // خالی = سرویس رایگان پیش‌فرض فینوا (بدون کلید)
      manualUSD: '', manualGold: '',
      backup: { auto: true, lastAt: 0 },
      account: null,                                  // { name, code, salt, passHash, createdAt } — حساب شخصی کاربر
      trialStart: 0,                                  // شروع دوره تست ۲۴ ساعته پرو
      pro: { expiresAt: 0, used: [] },                // اشتراک پرو (توکن‌ها تجمعی هستند)
      quota: { aiFree: 0, smartFree: 0, calcFree: 0, rateDay: '', rateCount: 0, aiDay: '', aiDayCount: 0 },
      openCount: 0,                                   // چند بار برنامه باز شده (شرط دیالوگ امتیاز)
      rateAsk: { done: false, laterAt: 0, never: false }, // دیالوگ امتیاز در مایکت
      seedDone: false, notifShown: {},
    };
  }
  async function saveState() { state.notifShown = state.notifShown || {}; await Store.put('kv', state, 'settings'); markBlobDirty(); }
  /* — سندیک تاخیری: هر تغییر داده، سندیک حساب را ۴ ثانیه بعد تازه می‌کند
     (چون در اندروید هنگام کشتن پروسه، رویداد pagehide اجرا نمی‌شود) — */
  let blobTimer = null;
  function markBlobDirty() {
    if (!state.account || !state.account.code || blobTimer) return;
    blobTimer = setTimeout(() => { blobTimer = null; try { saveAccBlob(); } catch (e) {} }, 4000);
  }

  /* ═══════════ حساب کاربری، اشتراک پرو، توکن و کوارتا ═══════════ */
  const LIC_DAY = 864e5;
  const TOK_ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // ۳۱ نویسه بدون I,L,O,0,1
  const PRO_FEATURES = [
    { ico: '🌐', t: 'هوش مصنوعی آنلاین روزی ۱۰ پیام', s: 'نسخه رایگان فقط ۲ پیام — پرو ۱۰ پیام در روز برای دستیار و تحلیل سرمایه‌گذاری' },
    { ico: '📈', t: 'تحلیل سرمایه‌گذاری کامل', s: 'بروزرسانی نامحدود قیمت‌های واقعی + بروزرسانی خودکار هر ۶۰ ثانیه' },
    { ico: '📊', t: 'نمودار رشد دارایی‌ها در همه بازه‌ها', s: 'بازه‌های زنده، ۳ ماهه و ۶ ماهه — رایگان فقط ۱ ماهه' },
    { ico: '🧮', t: 'حساب‌گر سود بدون محدودیت', s: 'نسخه رایگان فقط ۲ بار محاسبه دارد' },
    { ico: '🧾', t: 'گزارش PDF ماه جاری + کارت اشتراکی', s: 'خروجی PDF حرفه‌ای و کارت قابل اشتراک‌گذاری' },
    { ico: '🔐', t: 'پشتیبان رمزنگاری‌شده نامحدود', s: 'پشتیبان AES-256 با رمز دلخواه — بدون سقف' },
    { ico: '🎨', t: 'شخصی‌سازی کامل با تم‌های حرفه‌ای', s: 'تم کلاسیک طلایی، مدرن پاپ و نئون + تغییر نامحدود ظاهر برنامه' },
  ];
  const PRO_REASONS = {
    ai: 'پیام‌های رایگان هوش مصنوعی آنلاین تمام شد (۲ پیام).',
    smart: 'تحلیل هوشمند رایگان (۱ بار) استفاده شده است.',
    calc: 'حساب‌گر سود رایگان (۲ بار) تمام شد.',
    rate: 'بروزرسانی قیمت امروز استفاده شد — نسخه رایگان روزی ۱ بار.',
    chart: 'این بازه از نمودار مخصوص نسخه پرو است.',
    pdf: 'خروجی PDF مخصوص نسخه پرو است.',
    card: 'کارت اشتراکی مخصوص نسخه پرو است.',
    backup: 'پشتیبان رمزنگاری‌شده مخصوص نسخه پرو است (نامحدود).',
    personalization: 'فرصت تغییر تم رایگان (۱ بار) استفاده شده — شخصی‌سازی کامل مخصوص نسخه پرو است.',
    trial: 'برای ادامه استفاده کامل، نسخه پرو را فعال کن.',
    home: 'با ارتقا، همه قابلیت‌های حرفه‌ای فعال می‌شود.',
  };
  function newAccCode() {
    const buf = new Uint8Array(6); crypto.getRandomValues(buf);
    return 'FN-' + Array.from(buf, b => TOK_ALPHA[b % TOK_ALPHA.length]).join('');
  }
  function isPro() {
    // ⚠ دوره تست ۲۴ ساعته فقط قابلیت‌های رایگان دارد (نه پرو) — فقط اشتراک واقعی پرو را باز می‌کند
    return !!(state.pro && state.pro.expiresAt > Date.now());
  }
  function proExpiresAt() { return state.pro && state.pro.expiresAt > Date.now() ? state.pro.expiresAt : 0; }
  function trialLeftMs() { return state.trialStart ? Math.max(0, state.trialStart + LIC_DAY - Date.now()) : 0; }
  function trialActive() { return trialLeftMs() > 0; }
  function todayKey() { return jKey(jToday()); }
  function jTsLabel(ts) { try { return jDateLabel(jKey(Jalali.toJalali(new Date(ts)))); } catch (e) { return '—'; } }
  /* — کوارتای هوش مصنوعی: رایگان ۲ پیام کل | پرو ۱۰ پیام در روز — */
  function aiQuotaReset() {
    const q = state.quota, tk = todayKey();
    if (q.aiDay !== tk) { q.aiDay = tk; q.aiDayCount = 0; }
  }
  function aiLeft() {
    aiQuotaReset();
    if (isPro()) return Math.max(0, 10 - (state.quota.aiDayCount || 0));
    return Math.max(0, 2 - (state.quota.aiFree || 0));
  }
  function consumeAI() {
    aiQuotaReset();
    if (isPro()) state.quota.aiDayCount = (state.quota.aiDayCount || 0) + 1;
    else state.quota.aiFree = (state.quota.aiFree || 0) + 1;
    saveState();
  }
  /* — تحلیل هوشمند سرمایه‌گذاری: رایگان ۱ بار | پرو از سهمیه ۱۰تایی روز — */
  function smartLeft() { return isPro() ? aiLeft() : Math.max(0, 1 - (state.quota.smartFree || 0)); }
  function consumeSmart() {
    if (isPro()) { consumeAI(); return; }
    state.quota.smartFree = (state.quota.smartFree || 0) + 1; saveState();
  }
  /* — حساب‌گر سود: رایگان ۲ بار | پرو نامحدود — */
  function calcLeft() { return isPro() ? Infinity : Math.max(0, 2 - (state.quota.calcFree || 0)); }
  function consumeCalc() { if (!isPro()) { state.quota.calcFree = (state.quota.calcFree || 0) + 1; saveState(); } }
  /* — بروزرسانی دستی قیمت: رایگان روزی ۱ بار | پرو نامحدود — */
  function rateLeftToday() {
    if (isPro()) return Infinity;
    return (state.quota.rateDay === todayKey()) ? Math.max(0, 1 - (state.quota.rateCount || 0)) : 1;
  }
  function consumeRate() {
    if (isPro()) return;
    const tk = todayKey();
    if (state.quota.rateDay !== tk) { state.quota.rateDay = tk; state.quota.rateCount = 0; }
    state.quota.rateCount = (state.quota.rateCount || 0) + 1; saveState();
  }
  /* — توکن فعال‌سازی PXXXX-XXXX-XXXX-XXXX با رقم کنترل — */
  function normalizeToken(raw) {
    return String(raw || '').toUpperCase().split('').filter(c => TOK_ALPHA.includes(c)).join('');
  }
  function tokenCheck(body15) {
    let s = 0;
    for (let i = 0; i < body15.length; i++) s += (TOK_ALPHA.indexOf(body15[i]) + 1) * (i + 1);
    return TOK_ALPHA[s % TOK_ALPHA.length];
  }
  function validToken(raw) {
    const s = normalizeToken(raw);
    if (s.length !== 16 || s[0] !== 'P') return false;
    return tokenCheck(s.slice(0, 15)) === s[15];
  }
  async function activateToken(raw) {
    const tok = normalizeToken(raw);
    if (!validToken(tok)) return { ok: false, msg: 'توکن نامعتبر است — ۱۶ نویسه به شکل PXXXX-XXXX-XXXX-XXXX' };
    if ((state.pro.used || []).includes(tok)) return { ok: false, msg: 'این توکن قبلاً روی این حساب استفاده شده است' };
    const base = Math.max(Date.now(), state.pro.expiresAt || 0);
    state.pro.expiresAt = base + 30 * LIC_DAY;
    state.pro.used = (state.pro.used || []).concat([tok]);
    state.pro.lastActivated = Date.now();
    await saveState();
    // سندیک اشتراک در رجیستری گوشی هم ثبت می‌شود (ایمنی بیشتر برای بازیابی حساب)
    try {
      const regs = getRegistry(); const me = regs.find(r => r.code === (state.account && state.account.code));
      if (me) { me.proSnapshot = state.pro; me.trialStart = state.trialStart || 0; me.quotaSnapshot = state.quota; setRegistry(regs); }
    } catch (e) {}
    removeTrialTimer();
    return { ok: true };
  }
  function copyText(s) {
    try { navigator.clipboard.writeText(s); } catch (e) {
      const ta = document.createElement('textarea'); ta.value = s; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (e2) {} ta.remove();
    }
    UI.toast('کپی شد ✅', 'ok');
  }
  /* ═══ v1.6.0 — رجیستری حساب‌ها، نشست و سندیک داده هر حساب (localStorage + kv-blob) ═══ */
  const REG_KEY = 'finova_accounts_v1', SESS_KEY = 'finova_session', LLOG_KEY = 'finova_logout_log';
  function getRegistry() { try { const r = JSON.parse(localStorage.getItem(REG_KEY) || '[]'); return Array.isArray(r) ? r : []; } catch (e) { return []; } }
  function setRegistry(r) { try { localStorage.setItem(REG_KEY, JSON.stringify(r)); } catch (e) {} }
  function getSession() { try { return localStorage.getItem(SESS_KEY) || ''; } catch (e) { return ''; } }
  function setSession(code) { try { code ? localStorage.setItem(SESS_KEY, code) : localStorage.removeItem(SESS_KEY); } catch (e) {} }
  function getLogoutLog() { try { const r = JSON.parse(localStorage.getItem(LLOG_KEY) || '[]'); return Array.isArray(r) ? r : []; } catch (e) { return []; } }
  function saveLogoutLog(l) { try { localStorage.setItem(LLOG_KEY, JSON.stringify(l)); } catch (e) {} }
  function accDataKey(code) { return 'accdata:' + code; }
  /* — سندیک کامل داده‌های حساب فعلی در kv — برای جداسازی داده‌ی هر حساب کاربری — */
  async function saveAccBlob() {
    if (!state.account || !state.account.code) return;
    try {
      await Store.put('kv', {
        state: JSON.parse(JSON.stringify(state)), txs, rules, budgets, goals, wallets, categories,
        savedAt: Date.now(),
      }, accDataKey(state.account.code));
    } catch (e) { console.warn('accblob save fail', e); }
  }
  /* — بازگرداندن داده‌های یک حساب از سندیک (یا شروع تازه) + همگام‌سازی حافظه — */
  async function loadAccSession(reg, fresh) {
    const blob = fresh ? null : await Store.get('kv', accDataKey(reg.code));
    if (blob && blob.state && blob.state.account) {
      // پاک‌سازی استورها و بازگردانی کامل از سندیک
      for (const s of ['transactions', 'rules', 'budgets', 'goals', 'wallets', 'categories']) { try { await Store.clear(s); } catch (e) {} }
      txs = (blob.txs || []).map(normTx); rules = (blob.rules || []).map(normRule);
      budgets = blob.budgets || []; goals = (blob.goals || []).map(normGoal);
      wallets = blob.wallets && blob.wallets.length ? blob.wallets : DEF_WALLETS.slice();
      categories = blob.categories && blob.categories.length ? blob.categories : DEF_CATEGORIES.slice();
      await Store.bulkPut('transactions', txs); await Store.bulkPut('rules', rules);
      await Store.bulkPut('budgets', budgets); await Store.bulkPut('goals', goals);
      await Store.bulkPut('wallets', wallets); await Store.bulkPut('categories', categories);
      state = Object.assign(defaultState(), blob.state, { v: 2 });
    } else {
      // شروع تازه: اگر حساب دیگری قبلاً داده گذاشته، پاک می‌شود — داده‌ی هر حساب شخصی است
      for (const s of ['transactions', 'rules', 'budgets', 'goals', 'wallets', 'categories']) { try { await Store.clear(s); } catch (e) {} }
      txs = []; rules = []; budgets = []; goals = [];
      wallets = DEF_WALLETS.slice(); categories = DEF_CATEGORIES.slice();
      await Store.bulkPut('wallets', wallets); await Store.bulkPut('categories', categories);
      state = defaultState();
      state.account = { name: reg.name, code: reg.code, createdAt: reg.createdAt || Date.now() };
      // اشتراک/کوارتای قبلی همین حساب (اگر در رجیستری ثبت شده) حفظ می‌شود
      if (reg.proSnapshot) { state.pro = reg.proSnapshot; state.trialStart = reg.trialStart || 0; state.quota = reg.quotaSnapshot || state.quota; }
    }
    if (!state.account.code) state.account.code = reg.code;
    await saveState();
    await saveAccBlob();
  }
  /* — صفحه ورود / ثبت‌نام (دو تب) — */
  function showAuth() {
    unlocked = false;
    const sc = document.getElementById('authScreen');
    if (!sc) return;
    sc.classList.remove('hidden');
    const err = document.getElementById('authErr');
    const showErr = (t) => { err.textContent = t || ''; if (t) { Bridge.vibrate(60); try { sc.classList.remove('shake'); void sc.offsetWidth; sc.classList.add('shake'); } catch (e) {} } };
    // تب‌ها
    const tabReg = document.getElementById('tabReg'), tabLogin = document.getElementById('tabLogin');
    const paneReg = document.getElementById('authRegPane'), paneLogin = document.getElementById('authLoginPane');
    const setTab = (login) => {
      tabReg.classList.toggle('on', !login); tabLogin.classList.toggle('on', login);
      tabReg.setAttribute('aria-selected', String(!login)); tabLogin.setAttribute('aria-selected', String(login));
      paneReg.classList.toggle('hidden', login); paneLogin.classList.toggle('hidden', !login);
      err.textContent = '';
      setTimeout(() => { try { (login ? document.getElementById('loginName') : document.getElementById('authName')).focus(); } catch (e) {} }, 120);
    };
    tabReg.onclick = () => setTab(false);
    tabLogin.onclick = () => setTab(true);
    /* — ثبت‌نام: ساخت حساب شخصی جدید + ۲۴ ساعت دوره تست + کد حساب — */
    const submit = async () => {
      const name = document.getElementById('authName').value.trim();
      const p1 = document.getElementById('authPass').value;
      const p2 = document.getElementById('authPass2').value;
      if (name.length < 2) { showErr('نام باید حداقل ۲ حرف باشد'); return; }
      if (p1.length < 4) { showErr('رمز باید حداقل ۴ کاراکتر باشد'); return; }
      if (p1 !== p2) { showErr('تکرار رمز مطابقت ندارد'); return; }
      const regs = getRegistry();
      if (regs.some(r => (r.nameLower || r.name.toLowerCase()) === name.toLowerCase())) { showErr('حسابی با این نام قبلاً ساخته شده — از تب «ورود به حساب کاربری» وارد شو'); return; }
      err.textContent = '';
      const salt = String(Math.random()).slice(2, 10);
      const code = newAccCode();
      const reg = { code, name, nameLower: name.toLowerCase(), salt, passHash: simpleHash(p1 + salt), createdAt: Date.now(), logoutUsed: 0 };
      regs.push(reg); setRegistry(regs);
      setSession(code);
      await loadAccSession(reg, true);
      state.trialStart = Date.now();                // 🎁 ۲۴ ساعت دوره تست (فقط قابلیت‌های رایگان)
      state.account = { name, code, createdAt: reg.createdAt };
      await saveState(); await saveAccBlob();
      sc.classList.add('hidden');
      unlocked = true;
      const m = UI.modal('🎉 خوش آمدی ' + esc(name) + '!', `
        <div style="text-align:center">
          <p style="font-size:12.5px;line-height:2;color:var(--txt2);margin:0 0 10px">حساب شخصی‌ات ساخته شد و <b style="color:var(--warn2)">۲۴ ساعت دوره تست</b> فعال است 🎁<br><small style="color:var(--txt3)">در دوره تست همه قابلیت‌های رایگان در دسترس است؛ برای قابلیت‌های حرفه‌ای، پرو را فعال کن.</small></p>
          <div class="acc-code-row"><div><div class="acc-code-lbl">کد حساب تو — هنگام خرید توکن لازم می‌شود</div><div class="acc-code-val">${esc(state.account.code)}</div></div><button class="copy-code-btn" id="copyAccBtn1">📋 کپی</button></div>
          <p class="tok-hint" style="text-align:center">این کد در <b>تنظیمات ← حساب کاربری</b> همیشه در دسترس است</p>
        </div>
        <div class="btn-row" style="margin-top:12px"><button class="btn full" id="accOkBtn">شروع می‌کنم 🚀</button></div>`);
      m.querySelector('#copyAccBtn1').onclick = () => copyText(state.account.code);
      m.querySelector('#accOkBtn').onclick = () => { m.remove(); };
      if (state.lock && state.lock.enabled) showLock(); else afterUnlock();
    };
    document.getElementById('authGoBtn').onclick = submit;
    ['authName', 'authPass', 'authPass2'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.onkeydown = e => { if (e.key === 'Enter') submit(); };
    });
    /* — ورود به حساب کاربری موجود (روی همین گوشی) — */
    const doLogin = async () => {
      const name = document.getElementById('loginName').value.trim();
      const pass = document.getElementById('loginPass').value;
      if (!name || !pass) { showErr('نام حساب و رمز را وارد کن'); return; }
      const regs = getRegistry();
      const reg = regs.find(r => (r.nameLower || r.name.toLowerCase()) === name.toLowerCase());
      if (!reg) { showErr('حسابی با این نام روی این گوشی پیدا نشد — اول ثبت‌نام کن'); return; }
      if (simpleHash(pass + reg.salt) !== reg.passHash) { showErr('رمز حساب اشتباه است'); return; }
      err.textContent = '';
      setSession(reg.code);
      await loadAccSession(reg, false);
      if (!state.account) state.account = { name: reg.name, code: reg.code, createdAt: reg.createdAt || Date.now() };
      state.account.name = reg.name;
      await saveState(); await saveAccBlob();
      sc.classList.add('hidden');
      unlocked = true;
      UI.toast('خوش برگشتی ' + esc(reg.name) + ' 👋', 'ok');
      if (state.lock && state.lock.enabled) showLock(); else afterUnlock();
    };
    document.getElementById('loginGoBtn').onclick = doLogin;
    ['loginName', 'loginPass'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.onkeydown = e => { if (e.key === 'Enter') doLogin(); };
    });
    setTimeout(() => { try { document.getElementById('authName').focus(); } catch (e) {} }, 300);
  }
  /* — خروج از حساب با لیمیت: هر حساب فقط ۱ بار | هر گوشی فقط ۲ بار | فاصله ۲۴ ساعته — */
  function logoutLimits() {
    const regs = getRegistry(), code = state.account ? state.account.code : '';
    const me = regs.find(r => r.code === code) || { logoutUsed: 0 };
    const log = getLogoutLog();
    const lastTs = log.length ? log[log.length - 1].ts : 0;
    return {
      accLeft: Math.max(0, 1 - (me.logoutUsed || 0)),
      devLeft: Math.max(0, 2 - log.length),
      coolLeft: lastTs ? Math.max(0, lastTs + LIC_DAY - Date.now()) : 0,
    };
  }
  function logoutBlockMsg() {
    const L = logoutLimits();
    if (L.accLeft <= 0) return 'این حساب قبلاً یک بار از آن خارج شده‌اید — هر حساب فقط یک بار امکان خروج دارد.';
    if (L.devLeft <= 0) return 'لیمیت خروج روی این گوشی پر شده — روی هر گوشی فقط ۲ بار می‌توان از حساب خارج شد.';
    if (L.coolLeft > 0) return 'لیمیت خروج ۲۴ ساعته است — ' + faDigits(Math.max(1, Math.ceil(L.coolLeft / 3600000))) + ' ساعت دیگر می‌توانی خارج شوی.';
    return '';
  }
  async function performLogout() {
    Bridge.vibrate(40);
    await saveAccBlob();
    const regs = getRegistry(), code = state.account ? state.account.code : '';
    const me = regs.find(r => r.code === code);
    if (me) { me.logoutUsed = (me.logoutUsed || 0) + 1; setRegistry(regs); }
    const log = getLogoutLog(); log.push({ ts: Date.now(), code }); saveLogoutLog(log);
    setSession('');
    // پاک‌سازی حافظه و نمایش صفحه ورود
    txs = []; rules = []; budgets = []; goals = []; wallets = []; categories = [];
    state = defaultState();
    lastRates = null;
    removeTrialTimer();
    unlocked = false;
    document.querySelectorAll('#modalRoot .modal-backdrop').forEach(x => x.remove());
    const ms = document.getElementById('menuSheet'); if (ms) ms.classList.add('hidden');
    UI.toast('از حساب خارج شدی ✅', 'ok');
    showAuth();
  }
  function logoutConfirm() {
    const block = logoutBlockMsg();
    if (block) { UI.toast('⛔ ' + block, 'warn'); Bridge.vibrate(80); return; }
    const L = logoutLimits();
    UI.confirm('خروج از حساب؟',
      `پس از خروج، برای ورود دوباره باید نام و رمز حساب را بزنی. داده‌های این حساب امن نگه داشته می‌شود.<br><br>` +
      `<small style="color:var(--txt3);line-height:2">لیمیت خروج: هر حساب فقط <b>۱ بار</b> • هر گوشی فقط <b>۲ بار</b> • فاصله بین خروج‌ها <b>۲۴ ساعت</b><br>` +
      `باقی‌مانده برای این حساب: ${faDigits(L.accLeft)} بار • برای این گوشی: ${faDigits(L.devLeft)} بار</small>`,
      async () => { await performLogout(); });
  }
  /* — تایمر نئونی قرمز دوره تست ۲۴ ساعته — */
  let trialInt = null;
  function removeTrialTimer() {
    if (trialInt) { clearInterval(trialInt); trialInt = null; }
    document.body.classList.remove('trial-on');
    const el = document.getElementById('trialTimer');
    if (el) el.remove();
  }
  function startTrialTimer() {
    if (!trialActive() || proExpiresAt()) { removeTrialTimer(); return; }  // پرو خریداری شده → تایمر معنا ندارد
    document.body.classList.add('trial-on');
    let el = document.getElementById('trialTimer');
    if (!el) {
      el = document.createElement('button');
      el.id = 'trialTimer'; el.className = 'trial-timer'; el.type = 'button';
      el.setAttribute('aria-label', 'زمان باقی‌مانده دوره تست پرو — برای ارتقا لمس کنید');
      el.onclick = () => showProModal('trial');
      document.body.appendChild(el);
    }
    const pad = n => String(n).padStart(2, '0');
    const tick = () => {
      const left = trialLeftMs();
      if (left <= 0) { removeTrialTimer(); return; }
      const h = Math.floor(left / 3600000), mi = Math.floor((left % 3600000) / 60000), s = Math.floor((left % 60000) / 1000);
      el.innerHTML = '⏳ ' + faDigits(pad(h) + ':' + pad(mi) + ':' + pad(s)) + ' <small>پایان دوره تست</small>';
    };
    tick();
    if (trialInt) clearInterval(trialInt);
    trialInt = setInterval(tick, 1000);
  }
  /* — SVG قفل کوچک با ستاره طلایی داخلش (نشانه اشتراک پرو) — */
  const LOCK_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 10.2V7.9a4.5 4.5 0 0 1 9 0v2.3" fill="none" stroke="#fbbf24" stroke-width="2" stroke-linecap="round"/><rect x="4.6" y="10.2" width="14.8" height="10.4" rx="3" fill="rgba(251,191,36,.16)" stroke="#fbbf24" stroke-width="1.9"/><path d="M12 12.4l1.05 2.13 2.35.34-1.7 1.66.4 2.34L12 17.75l-2.1 1.11.4-2.34-1.7-1.66 2.35-.34z" fill="#fde68a"/></svg>`;
  /* — صفحه طلایی پرو + دو روش خرید + انیمیشن‌های رنگی — */
  function showProModal(reason) {
    const why = PRO_REASONS[reason] ? `<p style="font-size:11.5px;color:var(--warn2);text-align:center;margin:0 0 4px;font-weight:700">⚠ ${esc(PRO_REASONS[reason])}</p>` : '';
    const trialNote = trialActive() ? `<div class="pro-trial-note">🎁 دوره تست فعال است — در تست فقط قابلیت‌های رایگان در دسترس‌اند (${faDigits(Math.max(1, Math.ceil(trialLeftMs() / 3600000)))} ساعت باقی‌مانده)</div>` : '';
    const m = UI.modal('⭐ فینوا پرو', `
      <div class="pro-modal">
        <div class="pro-head">
          <div class="pro-badge">⭐ نسخه پرو</div>
          <div class="pro-title">با ارتقا، ${faDigits(PRO_FEATURES.length)} قابلیت فعال می‌شود</div>
          ${trialNote}
        </div>
        ${why}
        <div class="pro-feats">${PRO_FEATURES.map(f => `<div class="pro-feat"><div class="pf-lock" title="نیازمند اشتراک پرو">${LOCK_SVG}</div><div><div class="pf-t">${f.t}</div><div class="pf-s">${f.s}</div></div></div>`).join('')}</div>
        <div class="pro-sep">روش خرید</div>
        <div class="pro-methods">
          <button class="btn-gold" id="buyMyketBtn">🛒 خرید درون‌برنامه‌ای مایکت</button>
          <button class="btn-token" id="buyTokenBtn">🔑 فعال‌سازی با توکن</button>
        </div>
        <p class="pro-method-hint">پس از خرید در مایکت، توکن فعال‌سازی را دریافت و در «فعال‌سازی با توکن» وارد می‌کنی • هر توکن ۳۰ روز اعتبار پرو اضافه می‌کند و روی هم جمع می‌شود</p>
      </div>`);
    m.querySelector('#buyMyketBtn').onclick = () => {
      try { if (Bridge.openMyketApp) { Bridge.openMyketApp(); return; } } catch (e) {}
      try { window.open('https://myket.ir/app/com.finova.money', '_blank', 'noopener'); } catch (e) {}
    };
    m.querySelector('#buyTokenBtn').onclick = () => tokenModal();
  }
  function tokenModal() {
    const m = UI.modal('🔑 فعال‌سازی با توکن', `
      <p style="font-size:12px;color:var(--txt2);line-height:1.9;margin:0 0 10px">هنگام خرید توکن، <b>کد حساب</b> زیر را ارائه کن تا توکن به حساب تو وصل شود:</p>
      <div class="acc-code-row"><div><div class="acc-code-lbl">کد حساب تو</div><div class="acc-code-val">${esc(state.account ? state.account.code : '—')}</div></div><button class="copy-code-btn" id="copyAccBtn2">📋 کپی</button></div>
      <div style="height:12px"></div>
      <input id="tokInp" class="tok-input" placeholder="PXXXX-XXXX-XXXX-XXXX" maxlength="19" autocomplete="off">
      <p class="tok-hint">هر توکن ۳۰ روز اشتراک پرو اضافه می‌کند و توکن‌های بعدی روی هم جمع می‌شوند • توکن یک‌بارمصرف است</p>
      <p id="tokErr" style="font-size:11.5px;color:var(--bad2);font-weight:700;min-height:16px;margin:4px 0 0"></p>
      <div class="btn-row"><button class="btn full" id="tokGoBtn">فعال‌سازی پرو ✨</button><button class="btn ghost" id="tokXBtn">بستن</button></div>`);
    const inp = m.querySelector('#tokInp');
    inp.oninput = () => { inp.value = inp.value.toUpperCase(); };
    m.querySelector('#copyAccBtn2').onclick = () => copyText(state.account ? state.account.code : '');
    m.querySelector('#tokXBtn').onclick = () => m.remove();
    m.querySelector('#tokGoBtn').onclick = async () => {
      const v = inp.value.trim();
      if (!v) { m.querySelector('#tokErr').textContent = 'توکن را وارد کن'; return; }
      const r = await activateToken(v);
      if (!r.ok) { m.querySelector('#tokErr').textContent = r.msg; return; }
      m.remove();
      Bridge.vibrate(80);
      UI.toast('🎉 اشتراک پرو فعال شد تا ' + jTsLabel(state.pro.expiresAt), 'ok');
      Bridge.showNotification('⭐ فینوا پرو فعال شد', 'اشتراک پرو تا ' + jTsLabel(state.pro.expiresAt) + ' فعال است. همه قابلیت‌ها آزاد شدند!', 9901, 'proOn');
      render(curTab);
    };
    setTimeout(() => { try { inp.focus(); } catch (e) {} }, 150);
  }
  function subStatusHTML() {
    const pe = proExpiresAt();
    if (pe) return `<div><span class="sub-status pro">⭐ پرو فعال تا ${jTsLabel(pe)}</span></div>`;
    if (trialActive()) return `<div><span class="sub-status trial">🎁 دوره تست — ${faDigits(Math.max(1, Math.ceil(trialLeftMs() / 3600000)))} ساعت باقی‌مانده (فقط قابلیت‌های رایگان)</span></div>`;
    return `<div><span class="sub-status free">نسخه رایگان</span></div>`;
  }

  function afterUnlock() {
    generateRecurring();
    startTrialTimer();
    render(curTab);
    scheduleNotifications();
    Bridge.updateWidget(
      fmtShort(walletBalance()) + ' تومان',
      nextInstallmentLine(0), nextInstallmentLine(1),
      jDateLabel(jKey(jToday()))
    );
    autoBackup();
    // قیمت‌ها در پس‌زمینه — داشبورد و تب AI پس از رسیدن رفرش شوند
    AI.fetchRates().then(r => { lastRates = r; App.lastRates = r; if (curTab === 'ai' || curTab === 'dashboard') render(curTab); }).catch(() => {});
    // بروزرسانی خودکار و واقعی قیمت‌ها — هر ۶۰ ثانیه (فقط وقتی صفحه دیده می‌شود)
    setInterval(() => { try { autoRefreshRates(); } catch (e) {} }, 60000);
    // دیالوگ امتیاز مایکت — بعد از ۷ ثانیه، با شرایط (بار سوم به بعد + حداقل ۵ تراکنش)
    setTimeout(() => { try { maybeAskRating(); } catch (e) {} }, 7000);
  }

  /* ───────── قیمت‌های زنده: بروزرسانی خودکار + پچ نرم DOM ───────── */
  let fetchingRates = false;
  async function autoRefreshRates() {
    if (!isPro()) return;   // بروزرسانی خودکار هر ۶۰ ثانیه مخصوص نسخه پرو — رایگان فقط بروزرسانی اولیه و روزی ۱ بار دستی
    if (fetchingRates || document.visibilityState !== 'visible') return;
    if (lastRates && lastRates.ts && Date.now() - lastRates.ts < 50000) return;
    fetchingRates = true;
    try {
      const r = await AI.fetchRates();
      if (r && (r.usd || r.gold18)) { lastRates = r; App.lastRates = r; patchRateDOM(r); }
    } catch (e) {}
    fetchingRates = false;
  }
  function relTime(ts) {
    const d = Date.now() - ts;
    if (d < 65000) return 'همین حالا';
    if (d < 3600000) return faDigits(Math.floor(d / 60000)) + ' دقیقه پیش';
    return faDigits(Math.floor(d / 3600000)) + ' ساعت پیش';
  }
  function faN(x) { return faDigits(String(x).replace(/\./g, '٫')); } // عدد با ممیز فارسی
  /* بج تغییر قیمت (٪ امروز) از داده زنده TGJU */
  function rateDeltaHTML(key) {
    const lv = lastRates && lastRates.live && lastRates.live[key];
    if (!lv || !lv.dp) return '';
    return lv.dp >= 0
      ? `<div class="d up">▲ ${faN(lv.dp.toFixed(2))}٪</div>`
      : `<div class="d down">▼ ${faN(Math.abs(lv.dp).toFixed(2))}٪</div>`;
  }
  /* پچ نرم قیمت‌ها در DOM بدون رندر مجدد کل صفحه (تا ورودی کاربر پاک نشود) */
  function patchRateDOM(r) {
    if (!r) return;
    const map = { gold18: r.gold18, goldCoin: r.goldCoin, usd: r.usd, ounce: r.ounce };
    Object.keys(map).forEach(k => {
      const el = document.getElementById('rv_' + k);
      if (el && map[k]) el.textContent = fmtShort(map[k]);
      const dEl = document.getElementById('rd_' + k);
      if (dEl) dEl.innerHTML = rateDeltaHTMLFor(r, k);
    });
    const st = document.getElementById('rateStamp');
    if (st && r.ts) st.innerHTML = '🗓 آخرین بروزرسانی: <b>' + relTime(r.ts) + '</b>' + (r.source ? ' • منبع: ' + esc(r.source) : '');
  }
  function rateDeltaHTMLFor(r, key) {
    const lv = r && r.live && r.live[key];
    if (!lv || !lv.dp) return '';
    return lv.dp >= 0
      ? `<div class="d up">▲ ${faN(lv.dp.toFixed(2))}٪</div>`
      : `<div class="d down">▼ ${faN(Math.abs(lv.dp).toFixed(2))}٪</div>`;
  }

  /* ───────── محاسبات ───────── */
  function walletBalance() {
    return wallets.reduce((acc, w) => {
      const delta = txs.reduce((a, t) => {
        if (t.walletId !== w.id || t.status !== 'paid') return a;
        if (t.type === 'income') return a + t.amount * t.rate;
        return a - t.amount * t.rate;
      }, 0);
      return acc + (+w.initial || 0) + delta;
    }, 0);
  }
  function monthStats(mk) {
    mk = mk || jMonthKey(jToday());
    const m = txs.filter(t => t.jdate.startsWith(mk));
    const sum = (type, st) => m.filter(t => t.type === type && (st ? t.status === st : true)).reduce((a, t) => a + t.amount * t.rate, 0);
    return {
      income: sum('income', 'paid'), expense: sum('expense', 'paid'),
      installPaid: sum('installment', 'paid'),
      installPending: m.filter(t => t.type === 'installment' && t.status === 'pending').reduce((a, t) => a + t.amount * t.rate, 0),
    };
  }
  function healthScore() {
    const s = monthStats();
    const rate = s.income > 0 ? (s.income - s.expense - s.installPaid) / s.income : 0;
    const sc1 = Math.max(0, Math.min(1, rate / 0.2)) * 30;                       // نرخ پس‌انداز
    const bs = budgets.filter(b => b.jmonth === jMonthKey(jToday()));
    let sc2 = 12.5;
    if (bs.length) {
      const ok = bs.filter(b => {
        const spent = txs.filter(t => t.type === 'expense' && t.status === 'paid' && t.jdate.startsWith(jMonthKey(jToday())) && t.categoryId === b.categoryId).reduce((a, t) => a + t.amount * t.rate, 0);
        return spent <= b.limit;
      }).length;
      sc2 = (ok / bs.length) * 25;
    }
    const allInst = txs.filter(t => t.type === 'installment' && t.status === 'paid');
    const overdue = txs.filter(t => t.type === 'installment' && t.status === 'pending' && t.dueJdate && daysUntilJ(t.dueJdate) < 0);
    const sc3 = overdue.length ? 0 : (allInst.length ? 20 : 10);                 // بدهی معوق
    const months = s.income > 0 ? (walletBalance() / Math.max(1, s.expense + s.installPaid)) : 0;
    const sc4 = Math.max(0, Math.min(1, months / 3)) * 25;                       // صندوق اضطراری
    return Math.round(sc1 + sc2 + sc3 + sc4);
  }
  function nextInstallmentLine(i) {
    const p = txs.filter(t => t.type === 'installment' && t.status === 'pending')
      .sort((a, b) => instSort(a) - instSort(b))[i];
    if (!p) return i === 0 ? 'قسط پرداخت‌نشده ندارید' : '';
    return `${p.title}: ${fmtShort(p.amount * p.rate)} (${p.dueJdate ? jDateLabel(p.dueJdate) : '—'})`;
  }
  function instSort(t) {
    const d = t.dueJdate ? daysUntilJ(t.dueJdate) : 999;
    return d * 10 + (t.essential ? -100 : 0) + (+t.priority || 3);
  }

  /* ───────── تولید خودکار اقساط تکرارشونده (ضدتکرار + احترام به تعداد قسط مانده) ───────── */
  function generateRecurring() {
    const t = jToday();
    let created = 0;
    rules.filter(r => r.active).forEach(r => {
      const createdMk = r.createdMk || jMonthKey(t);
      const createdD = r.createdD || 1;
      const cnt0 = txs.filter(x => x.ruleId === r.id).length;
      let made = 0;
      // ماه قبل + این ماه + ماه بعد (پوشش غیبت + نمایش اقساط پیش‌رو)
      for (let off = 1; off >= -1; off--) {
        const mm = addJMonths(t, -off);
        if (jMonthKey(mm) < createdMk) continue; // قبل از ساخت قانون تولید نشود
        const mk = jMonthKey(mm);
        const key = r.id + '@' + mk;
        // یک ماه هرگز دوبار تولید نمی‌شود (حتی اگر تراکنشش حذف شده باشد)
        if (r.lastKey && key <= r.lastKey) continue;
        if (r.remainingMonths > 0 && cnt0 + made >= r.remainingMonths) break; // سقف تعداد قسط
        const exists = txs.some(x => x.ruleId === r.id && x.jdate.startsWith(mk));
        if (exists) { r.lastKey = key; continue; }
        // قسطی که روزش قبل از روزِ ساختِ قانون است تولید نمی‌شود (رفع باگ «قسط معوق لحظه ساخت»)
        const maxD = Jalali.monthLength(mm.jy, mm.jm);
        const day = Math.min(r.day, maxD);
        if (mk === createdMk && day < createdD) { r.lastKey = key; continue; }
        const due = `${mk}/${String(day).padStart(2, '0')}`;
        txs.push(normTx({
          id: uid('tx'), type: 'installment', title: r.title,
          amount: r.variable ? 0 : r.amount, currency: 'TMN', rate: 1,
          categoryId: r.categoryId, walletId: r.walletId,
          jdate: due, dueJdate: due, status: 'pending',
          priority: r.priority, essential: r.essential, ruleId: r.id, seq: (r.seq || 0) + 1,
        }));
        r.lastKey = key; r.seq = (r.seq || 0) + 1; made++; created++;
      }
    });
    if (created) { persist('rules'); persist('transactions'); }
  }

  async function persist(kind) {
    markBlobDirty();
    if (kind === 'transactions') await Store.bulkPut('transactions', txs);
    if (kind === 'rules') await Store.bulkPut('rules', rules);
    if (kind === 'budgets') await Store.bulkPut('budgets', budgets);
    if (kind === 'goals') await Store.bulkPut('goals', goals);
    if (kind === 'wallets') await Store.bulkPut('wallets', wallets);
    if (kind === 'categories') await Store.bulkPut('categories', categories);
  }

  /* ───────── اعلان‌ها (بومی + وب) ───────── */
  async function scheduleNotifications() {
    if (Bridge.hasNative()) {
      const perm = await Bridge.hasNotifPermission();
      if (!perm) { await Bridge.requestNotifPermission(); }
    } else {
      Bridge.requestNotifPermission(); // مرورگر: درخواست مجوز Notification (بی‌صدا اگر مجاز نباشد)
    }
    const days = (state.notify && state.notify.days) || [7, 3, 1];
    const shown = state.notifShown || {};
    const now = Date.now();
    txs.filter(t => t.type === 'installment' && t.status === 'pending' && t.dueJdate).forEach(t => {
      const d = daysUntilJ(t.dueJdate);
      let level = null, msg = '';
      if (d < 0) { level = 'over'; msg = `قسط «${t.title}» به ارزش ${fmtToman(t.amount * t.rate)} معوق شده است!`; }
      else if (d === 0) { level = 'd0'; msg = `امروز موعد قسط «${t.title}» است (${fmtToman(t.amount * t.rate)}).`; }
      else if (days.includes(d)) { level = 'd' + d; msg = `قسط «${t.title}» ${faDigits(d)} روز دیگر موعد می‌شود (${fmtToman(t.amount * t.rate)}).`; }
      if (!level) return;
      const key = t.id + ':' + level;
      if (shown[key] && now - shown[key] < 86400000 * 1.5) return;
      Bridge.showNotification(level === 'over' ? '⚠️ قسط معوق — فینوا' : '📅 یادآوری قسط — فینوا', msg, Math.abs(hashCode(key)) % 30000, key);
      shown[key] = now;
    });
    // هشدار بودجه
    if (state.notify && state.notify.budgetAlert) {
      const mk = jMonthKey(jToday());
      budgets.filter(b => b.jmonth === mk).forEach(b => {
        const spent = txs.filter(t => t.type === 'expense' && t.status === 'paid' && t.jdate.startsWith(mk) && t.categoryId === b.categoryId).reduce((a, t) => a + t.amount * t.rate, 0);
        if (spent > b.limit) {
          const key = 'budget:' + b.id + ':' + mk;
          if (!shown[key] || now - shown[key] > 86400000 * 2) {
            const cat = categories.find(c => c.id === b.categoryId);
            Bridge.showNotification('🚨 اتمام بودجه — فینوا', `بودجه «${cat ? cat.name : ''}» تمام شد. خرج: ${fmtToman(spent)} از ${fmtToman(b.limit)}`, Math.abs(hashCode(key)) % 30000, key);
            shown[key] = now;
          }
        }
      });
    }
    state.notifShown = shown;
    await saveState();
  }
  function hashCode(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; } return h; }

  /* ───────── قفل ───────── */
  async function showLock() {
    const ls = document.getElementById('lockScreen');
    ls.classList.remove('hidden');
    document.getElementById('lockHint').textContent = 'برای ورود رمز خود را وارد کنید';
    const dots = document.getElementById('lockDots');
    const pad = document.getElementById('pinPad');
    dots.innerHTML = '<span></span><span></span><span></span><span></span>';
    let buf = '';
    const layout = ['۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹', 'پاک', '۰', 'ورود'];
    pad.innerHTML = layout.map(k => `<button data-k="${k}">${k}</button>`).join('');
    pad.onclick = (e) => {
      const k = e.target.getAttribute('data-k'); if (!k) return;
      Bridge.vibrate(20);
      if (k === 'پاک') { buf = buf.slice(0, -1); }
      else if (k === 'ورود') { verify(buf); buf = ''; }
      else if (buf.length < 4) buf += k;
      [...dots.children].forEach((s, i) => s.classList.toggle('f', i < buf.length));
      if (buf.length >= 4 && k !== 'ورود') verify(buf);
    };
    const canBio = await Bridge.canBiometric();
    const bioBtn = document.getElementById('bioBtn');
    if (canBio) {
      bioBtn.classList.remove('hidden');
      bioBtn.onclick = async () => {
        const r = await Bridge.biometricAuth();
        if (r.ok) unlockNow();
        else if (r.msg && r.msg !== 'timeout') UI.toast('احراز هویت ناموفق: ' + r.msg, 'bad');
      };
    }
    function verify(code) {
      const h = simpleHash(enDigits(code) + (state.lock.salt || ''));
      if (h === state.lock.pinHash) unlockNow();
      else {
        dots.classList.add('shake'); Bridge.vibrate([60, 40, 60]);
        setTimeout(() => dots.classList.remove('shake'), 450);
        buf = ''; [...dots.children].forEach(s => s.classList.remove('f'));
      }
    }
    async function unlockNow() {
      unlocked = true; ls.classList.add('hidden');
      await Bridge.vibrate(30);
      afterUnlock();
    }
  }
  function simpleHash(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h) + s.charCodeAt(i) | 0;
    return String(h >>> 0);
  }

  /* ───────── پشتیبان‌گیری ───────── */
  function exportPayload() {
    return JSON.stringify({ app: 'finova', v: 2, at: new Date().toISOString(), data: { state, txs, rules, budgets, goals, wallets, categories } });
  }
  async function importPayload(text) {
    try {
      const j = JSON.parse(text);
      if (!j || j.app !== 'finova' || !j.data) return UI.toast('فایل پشتیبان نامعتبر است', 'bad');
      if (Array.isArray(j.data.txs)) { txs = j.data.txs.map(normTx); await Store.clear('transactions'); await Store.bulkPut('transactions', txs); }
      if (Array.isArray(j.data.rules)) { rules = j.data.rules.map(normRule); await Store.clear('rules'); await Store.bulkPut('rules', rules); }
      if (Array.isArray(j.data.budgets)) { budgets = j.data.budgets; await Store.clear('budgets'); await Store.bulkPut('budgets', budgets); }
      if (Array.isArray(j.data.goals)) { goals = j.data.goals.map(normGoal); await Store.clear('goals'); await Store.bulkPut('goals', goals); }
      if (Array.isArray(j.data.wallets)) { wallets = j.data.wallets.map(normWallet); await Store.clear('wallets'); await Store.bulkPut('wallets', wallets); }
      if (Array.isArray(j.data.categories)) { categories = j.data.categories; await Store.clear('categories'); await Store.bulkPut('categories', categories); }
      if (j.data.state) { state = Object.assign(defaultState(), j.data.state); await saveState(); }
      UI.toast('بازیابی با موفقیت انجام شد ✅', 'ok');
      render(curTab);
    } catch (e) { UI.toast('خطا در بازیابی: ' + e.message, 'bad'); }
  }
  async function backupFile(encrypted) {
    let payload = exportPayload();
    let name = 'finova-backup-' + jKey(jToday()).replace(/\//g, '-') + '.json';
    let mime = 'application/json';
    if (encrypted) {
      try {
        const pass = await UI.prompt('رمز پشتیبان', 'یک رمز برای رمزنگاری فایل پشتیبان وارد کنید (حداقل ۶ کاراکتر):', 'password');
        if (!pass) return;
        payload = await encryptText(payload, pass);
        name += '.enc'; mime = 'application/octet-stream';
      } catch (e) { return UI.toast('خطا در رمزنگاری: ' + e.message, 'bad'); }
    }
    const b64 = Charts.bufToB64(new TextEncoder().encode(payload).buffer);
    await Bridge.saveFile(name, mime, b64);
    UI.toast('فایل پشتیبان ذخیره شد در Downloads ✅', 'ok');
  }
  async function encryptText(text, pass) {
    const enc = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const keyMat = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' }, keyMat, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text));
    const out = new Uint8Array(16 + 12 + ct.byteLength);
    out.set(salt); out.set(iv, 16); out.set(new Uint8Array(ct), 28);
    return 'FENC1:' + btoa(String.fromCharCode(...out));
  }
  async function decryptText(payload, pass) {
    const raw = Uint8Array.from(atob(payload.replace('FENC1:', '')), c => c.charCodeAt(0));
    const salt = raw.slice(0, 16), iv = raw.slice(16, 28), ct = raw.slice(28);
    const keyMat = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' }, keyMat, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    return new TextDecoder().decode(pt);
  }
  async function autoBackup() {
    if (!state.backup || !state.backup.auto) return;
    if (Date.now() - (state.backup.lastAt || 0) < 86400000) return;
    const snap = { id: uid('bk'), at: Date.now(), day: jKey(jToday()), payload: exportPayload() };
    await Store.put('backups', snap); // keyPath inline ('id') — کلید صریح DataError می‌داد (رفع باگ پشتیبان خودکار)
    const all = await Store.all('backups');
    all.sort((a, b) => b.at - a.at);
    for (const old of all.slice(7)) await Store.del('backups', old.id);
    state.backup.lastAt = Date.now();
    await saveState();
  }

  /* ───────── حالت سختگیرانه ───────── */
  function strictCheck(amount) {
    if (!state.strict || !state.strict.enabled) return null;
    const s = monthStats();
    const upcoming = txs.filter(t => t.type === 'installment' && t.status === 'pending' && t.dueJdate && daysUntilJ(t.dueJdate) <= 30)
      .reduce((a, t) => a + t.amount * t.rate, 0);
    const limit = s.income * (state.strict.pct / 100);
    const remainAfter = walletBalance() - amount - upcoming;
    if (amount > limit || remainAfter < 0) {
      return {
        amount, limit, upcoming, remainAfter,
        why: (amount > limit ? `این خرید (${fmtToman(amount)}) از سقف هزینه غیرضروری (${fmtToman(limit)}) بیشتر است.\n` : '') +
             (remainAfter < 0 ? `اگر این خرید را انجام دهی و اقساط پیش‌رو (${fmtToman(upcoming)}) را بپردازی، موجودی ${fmtToman(remainAfter)} (منفی!) می‌شود.\n` : ''),
      };
    }
    return null;
  }

  /* ═══════════ رندر صفحات ═══════════ */
  function render(tab) {
    curTab = tab;
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    const fab = document.getElementById('fab');
    fab.classList.toggle('hidden', tab === 'settings');
    const v = document.getElementById('view');
    document.getElementById('topTitle').textContent = ({ dashboard: 'فینوا', transactions: 'تراکنش‌ها', installments: 'اقساط', analytics: 'گزارش‌ها', ai: 'دستیار هوشمند', budgets: 'بودجه‌بندی', goals: 'اهداف مالی', challenge: 'چالش پس‌انداز', settings: 'تنظیمات' })[tab] || 'فینوا';
    if (tab === 'dashboard') v.innerHTML = dashboardHTML();
    if (tab === 'transactions') v.innerHTML = transactionsHTML();
    if (tab === 'installments') v.innerHTML = installmentsHTML();
    if (tab === 'analytics') v.innerHTML = analyticsHTML();
    if (tab === 'ai') v.innerHTML = aiHTML();
    if (tab === 'budgets') v.innerHTML = budgetsHTML();
    if (tab === 'goals') v.innerHTML = goalsHTML();
    if (tab === 'challenge') v.innerHTML = challengeHTML();
    if (tab === 'settings') v.innerHTML = settingsHTML();
    afterRender(tab);
    window.scrollTo(0, 0);
  }
  function afterRender(tab) {
    if (tab === 'dashboard') {
      const g = document.getElementById('healthGauge');
      if (g) Charts.gauge(g, healthScore(), false); // عدد کنار گیج در HTML نمایش داده می‌شود — جلوگیری از تکرار
      const c = document.getElementById('dashTrend');
      if (c) {
        const data = [];
        const now = jToday();
        for (let i = 5; i >= 0; i--) {
          const mk = jMonthKey(addJMonths(now, -i));
          const s = monthStats(mk);
          data.push({ label: FA_MONTHS[parseJKey(mk).jm - 1].slice(0, 4), in: s.income, out: s.expense + s.installPaid });
        }
        Charts.trend(c, data);
      }
    }
    if (tab === 'analytics') renderAnalyticsCharts();
    if (tab === 'ai') bindAIScreen();
    if (tab === 'challenge') bindChallenge();
  }

  /* ── داشبورد ── */
  function dashboardHTML() {
    const s = monthStats();
    const bal = walletBalance();
    const hs = healthScore();
    const pend = txs.filter(t => t.type === 'installment' && t.status === 'pending').sort((a, b) => instSort(a) - instSort(b)).slice(0, 4);
    const overdue = txs.filter(t => t.type === 'installment' && t.status === 'pending' && t.dueJdate && daysUntilJ(t.dueJdate) < 0).length;
    const rates = lastRates;
    return `
    <div class="hero">
      <div class="hero-label">موجودی کل</div>
      <div class="hero-amount">${fmtNum(bal)}<span class="cur">تومان</span></div>
      <div class="hero-row">
        <div class="hero-chip up"><div class="k">درآمد ${jMonthLabel()}</div><div class="v">${fmtShort(s.income)}</div></div>
        <div class="hero-chip down"><div class="k">هزینه + قسط</div><div class="v">${fmtShort(s.expense + s.installPaid)}</div></div>
      </div>
    </div>

    <div class="card glow">
      <div class="card-title">❤️ سلامت مالی <span class="lnk" data-go-tab="analytics">جزئیات ›</span></div>
      <div class="score-wrap">
        <div id="healthGauge" style="width:130px"></div>
        <div>
          <div class="score-num" style="color:${hs >= 75 ? 'var(--ok2)' : hs >= 50 ? 'var(--warn2)' : 'var(--bad2)'}">${faDigits(hs)}<small style="font-size:14px;color:var(--txt3)">/۱۰۰</small></div>
          <div class="score-lbl">${hs >= 75 ? 'عالی! مسیر درست است' : hs >= 50 ? 'متوسط — قابل بهبود' : 'نیاز به اقدام فوری'}</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">📅 اقساط پیش‌رو ${overdue ? `<span class="badge red">${faDigits(overdue)} معوق!</span>` : ''} <span class="lnk" data-go-tab="installments">همه ›</span></div>
      ${pend.length ? `<div class="list">${pend.map(t => {
        const d = t.dueJdate ? daysUntilJ(t.dueJdate) : 99;
        const bd = d < 0 ? '<span class="badge red">معوق</span>' : d <= 3 ? '<span class="badge amber">فوری</span>' : '<span class="badge cyan">' + faDigits(d) + ' روز</span>';
        return `<div class="row-item">
          <div class="row-ico">${t.title.includes('اجاره') ? '🏠' : '🏦'}</div>
          <div class="row-main"><div class="t">${esc(t.title)}</div><div class="s">${t.dueJdate ? jDateLabel(t.dueJdate) : '—'} ${t.essential ? '<span class="badge violet">ضروری</span>' : ''}</div></div>
          <div style="text-align:left"><div class="row-amount amt-pend">${fmtShort(t.amount * t.rate)}</div><div style="margin-top:5px">${bd}</div></div>
        </div>`;
      }).join('')}</div>` : '<div class="empty"><div class="big">✅</div>همه اقساط پرداخت شده‌اند</div>'}
    </div>

    ${rates && (rates.usd || rates.gold18) ? `
    <div class="card">
      <div class="card-title">📈 قیمت لحظه‌ای <span class="live-pill"><i class="live-dot"></i>زنده</span> <small style="font-weight:400;color:var(--txt3)">${rates.source || ''}</small></div>
      <div class="grid2">
        <div class="rate-card" style="margin:0"><div class="rate-ico gold">🪙</div><div class="rate-main"><div class="t">طلا ۱۸ عیار</div><div class="s">هر گرم</div></div><div class="rate-val"><div class="v" id="rv_gold18">${rates.gold18 ? fmtShort(rates.gold18) : '—'}</div><div id="rd_gold18">${rateDeltaHTML('gold18')}</div></div></div>
        <div class="rate-card" style="margin:0"><div class="rate-ico usd">💵</div><div class="rate-main"><div class="t">دلار آمریکا</div><div class="s">آزاد</div></div><div class="rate-val"><div class="v" id="rv_usd">${rates.usd ? fmtShort(rates.usd) : '—'}</div><div id="rd_usd">${rateDeltaHTML('usd')}</div></div></div>
      </div>
    </div>` : ''}

    <div class="card">
      <div class="card-title">📊 روند ۶ ماه <span class="lnk" data-go-tab="analytics">گزارش کامل ›</span></div>
      <div class="chart-box" id="dashTrend"></div>
      <div class="legend"><span><i style="background:var(--ok2)"></i>درآمد</span><span><i style="background:var(--acc)"></i>هزینه و قسط</span></div>
    </div>

    ${!proExpiresAt() ? `
    <button class="pro-cta" id="proCta" aria-label="ارتقا به نسخه پرو — ${faDigits(PRO_FEATURES.length)} قابلیت فعال می‌شود">
      <img class="pro-cta-img" src="img/pro-upgrade.png" alt="ارتقا به نسخه پرو — دسترسی نامحدود به همه امکانات ویژه">
    </button>` : `<div class="pro-active-strip">⭐ اشتراک پرو فعال است${proExpiresAt() ? ' تا ' + jTsLabel(proExpiresAt()) : ''} — همه قابلیت‌ها آزادند ✨</div>`}`;
  }

  /* ── تراکنش‌ها ── */
  let searchQ = '', filterType = 'all', filterCat = 'all', filterFrom = '', filterTo = '';
  function transactionsHTML() {
    const list = filteredTxs();
    return `
    <div class="card">
      <div class="field" style="margin:0"><input id="searchInp" placeholder="🔍 جستجو در عنوان، یادداشت، برچسب…" value="${esc(searchQ)}"></div>
      <div class="chips" style="margin-top:10px">
        ${['all|همه', 'income|درآمد', 'expense|هزینه', 'installment|قسط'].map(x => { const [k, l] = x.split('|'); return `<button class="chip ${filterType === k ? 'on' : ''}" data-ft="${k}">${l}</button>`; }).join('')}
      </div>
      <div class="field-inline" style="margin-top:10px">
        <div class="field" style="margin:0"><label>از تاریخ</label><input id="fFrom" type="text" placeholder="۱۴۰۳/۰۹/۰۱" value="${esc(filterFrom)}"></div>
        <div class="field" style="margin:0"><label>تا تاریخ</label><input id="fTo" type="text" placeholder="۱۴۰۳/۰۹/۳۰" value="${esc(filterTo)}"></div>
      </div>
      <div class="field" style="margin-top:10px"><label>دسته‌بندی</label>
        <select id="fCat"><option value="all">همه دسته‌ها</option>${categories.map(c => `<option value="${c.id}" ${filterCat === c.id ? 'selected' : ''}>${c.icon} ${esc(c.name)}</option>`).join('')}</select>
      </div>
    </div>
    <div class="card">
      <div class="card-title">نتایج (${faDigits(list.length)}) <small style="font-weight:400;color:var(--txt3)">مجموع: ${fmtShort(list.filter(t => t.status === 'paid').reduce((a, t) => a + (t.type === 'income' ? t.amount * t.rate : -(t.amount * t.rate)), 0))} ت</small></div>
      ${list.length ? `<div class="list">${list.slice(0, 80).map(txRowHTML).join('')}</div>` : '<div class="empty"><div class="big">🔍</div>تراکنشی پیدا نشد</div>'}
    </div>`;
  }
  function filteredTxs() {
    let l = txs.slice().sort((a, b) => (b.jdate || '').localeCompare(a.jdate || '') || b.createdAt - a.createdAt);
    const q = enDigits(searchQ).trim().toLowerCase();
    if (q) l = l.filter(t => (t.title || '').toLowerCase().includes(q) || (t.note || '').toLowerCase().includes(q) || (t.tags || []).some(g => g.toLowerCase().includes(q)) || String(t.amount).includes(q));
    if (filterType !== 'all') l = l.filter(t => t.type === filterType);
    if (filterCat !== 'all') l = l.filter(t => t.categoryId === filterCat);
    if (filterFrom) { const f = enDigits(filterFrom).replace(/[^0-9/]/g, ''); l = l.filter(t => t.jdate >= f); }
    if (filterTo) { const t2 = enDigits(filterTo).replace(/[^0-9/]/g, ''); l = l.filter(t => t.jdate <= t2); }
    return l;
  }
  function txRowHTML(t) {
    const cat = categories.find(c => c.id === t.categoryId);
    const isIn = t.type === 'income';
    const amtCls = t.status !== 'paid' ? 'amt-pend' : isIn ? 'amt-in' : 'amt-out';
    const sign = t.status !== 'paid' ? '' : isIn ? '+' : '−';
    return `<div class="row-item" data-tx="${t.id}">
      <div class="row-ico" style="background:${cat && cat.color ? 'color-mix(in srgb,' + cat.color + ',transparent)' : ''}">${cat ? cat.icon : t.type === 'income' ? '💰' : t.type === 'installment' ? '🏦' : '🧾'}</div>
      <div class="row-main">
        <div class="t">${esc(t.title)}${t.essential ? ' <span class="badge violet">ضروری</span>' : ''}</div>
        <div class="s">${jDateLabel(t.jdate)}${cat ? ' • ' + esc(cat.name) : ''}${t.currency !== 'TMN' ? ' • ' + t.currency : ''}${(t.tags || []).map(g => `<span class="tag">#${esc(g)}</span>`).join('')}</div>
      </div>
      <div style="text-align:left">
        <div class="row-amount ${amtCls}">${sign}${fmtShort(t.amount * t.rate)}</div>
        <div style="margin-top:5px">${t.status === 'pending' ? '<span class="badge amber">در انتظار</span>' : t.status === 'planned' ? '<span class="badge cyan">برنامه‌ریزی</span>' : '<span class="badge green">پرداخت شده</span>'}</div>
      </div>
    </div>`;
  }

  /* ── اقساط ── */
  let instTab = 'pending';
  function installmentsHTML() {
    const mk = jMonthKey(jToday());
    const all = txs.filter(t => t.type === 'installment');
    const pending = all.filter(t => t.status === 'pending').sort((a, b) => instSort(a) - instSort(b));
    const paid = all.filter(t => t.status === 'paid' && t.jdate.startsWith(mk)).sort((a, b) => (b.jdate || '').localeCompare(a.jdate || ''));
    const rulesActive = rules.filter(r => r.active);
    return `
    <div class="subtabs">
      <button class="chip ${instTab === 'pending' ? 'on' : ''}" data-it="pending">⏳ پرداخت‌نشده (${faDigits(pending.length)})</button>
      <button class="chip ${instTab === 'paid' ? 'on' : ''}" data-it="paid">✅ پرداخت‌شده (${faDigits(paid.length)})</button>
      <button class="chip ${instTab === 'rules' ? 'on' : ''}" data-it="rules">🔁 اقساط ماهانه (${faDigits(rulesActive.length)})</button>
    </div>
    ${instTab === 'pending' ? (pending.length ? `<div class="list">${pending.map(t => {
      const d = t.dueJdate ? daysUntilJ(t.dueJdate) : 99;
      const bd = d < 0 ? '<span class="badge red">معوق ' + faDigits(-d) + ' روز</span>' : d === 0 ? '<span class="badge amber">امروز</span>' : d <= 7 ? '<span class="badge amber">' + faDigits(d) + ' روز دیگر</span>' : '<span class="badge cyan">' + jDateLabel(t.dueJdate) + '</span>';
      return `<div class="row-item" data-tx="${t.id}">
        <div class="row-ico">${t.title.includes('اجاره') ? '🏠' : '🏦'}</div>
        <div class="row-main"><div class="t">${esc(t.title)}</div><div class="s">اولویت ${faDigits(t.priority)} ${t.essential ? '• <span class="badge violet">ضروری</span>' : ''}</div></div>
        <div style="text-align:left"><div class="row-amount amt-pend">${fmtShort(t.amount * t.rate)}</div><div style="margin-top:5px">${bd}</div></div>
      </div>`;
    }).join('')}</div>` : '<div class="empty"><div class="big">🎉</div>قسط پرداخت‌نشده نداری!</div>') : ''}
    ${instTab === 'paid' ? (paid.length ? `<div class="list">${paid.map(t => `<div class="row-item"><div class="row-ico" style="background:rgba(16,185,129,.12)">✅</div><div class="row-main"><div class="t">${esc(t.title)}</div><div class="s">${jDateLabel(t.jdate)}</div></div><div class="row-amount amt-in">−${fmtShort(t.amount * t.rate)}</div></div>`).join('')}</div>` : '<div class="empty"><div class="big">🗓️</div>این ماه قسطی پرداخت نشده</div>') : ''}
    ${instTab === 'rules' ? `
      <button class="btn full" id="addRuleBtn">＋ قسط ماهانه جدید</button>
      <div style="height:12px"></div>
      ${rulesActive.length ? `<div class="list">${rulesActive.map(r => `<div class="row-item" data-rule="${r.id}">
        <div class="row-ico">🔁</div>
        <div class="row-main"><div class="t">${esc(r.title)}</div><div class="s">هر ماه روز ${faDigits(r.day)} • اولویت ${faDigits(r.priority)}${r.remainingMonths ? ' • ' + faDigits(r.remainingMonths) + ' قسط مانده' : ''}</div></div>
        <div class="row-amount">${fmtShort(r.amount)}<div style="margin-top:6px"><button class="btn sm ghost" data-stop-rule="${r.id}">توقف</button></div></div>
      </div>`).join('')}</div>` : '<div class="empty"><div class="big">🔁</div>قسط ماهانه‌ای تعریف نکرده‌ای — با دکمه بالا اجاره و اقساطت را خودکار کن</div>'}` : ''}`;
  }

  /* ── گزارش‌ها ── */
  function analyticsHTML() {
    const now = jToday();
    const s = monthStats();
    return `
    <div class="card glow">
      <div class="card-title">❤️ امتیاز سلامت مالی</div>
      <div class="score-wrap"><div id="healthGauge2" style="width:150px"></div>
        <div style="flex:1;min-width:0">
          <div class="stat" style="margin-bottom:8px"><div class="k">نرخ پس‌انداز</div><div class="v" style="color:var(--ok2)">${s.income > 0 ? faDigits(Math.round((s.income - s.expense - s.installPaid) / s.income * 100)) + '٪' : '—'}</div></div>
          <div class="stat"><div class="k">پوشش اقساط با موجودی</div><div class="v">${s.installPending > 0 ? faDigits(Math.round(walletBalance() / s.installPending * 100)) + '٪' : '<span style="color:var(--ok2)">کامل ✓</span>'}</div></div>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-title">📊 روند ۶ ماهه</div>
      <div class="chart-box" id="chartTrend"></div>
      <div class="legend"><span><i style="background:var(--ok2)"></i>درآمد</span><span><i style="background:var(--acc)"></i>هزینه و قسط</span></div>
    </div>
    <div class="card">
      <div class="card-title">🧩 سهم دسته‌ها (${jMonthLabel()})</div>
      <div class="chart-box" id="chartDonut"></div>
      <div class="legend" id="donutLegend"></div>
    </div>
    <div class="card">
      <div class="card-title">🔮 پیش‌بینی ۳ ماه آینده</div>
      <div class="chart-box" id="chartForecast"></div>
      <div class="legend"><span><i style="background:var(--pri)"></i>برآورد مانده</span><span><i style="background:var(--acc)"></i>پیش‌بینی</span></div>
      <div id="forecastTable" style="margin-top:10px"></div>
    </div>
    <div class="card">
      <div class="card-title">📤 خروجی گزارش</div>
      <div class="btn-row">
        <button class="btn" id="pdfBtn">🧾 PDF ماه جاری${isPro() ? '' : ' ⭐'}</button>
        <button class="btn ghost" id="shareBtn">🖼️ کارت اشتراکی${isPro() ? '' : ' ⭐'}</button>
      </div>
      <div class="btn-row">
        <button class="btn ghost" id="csvBtn">📑 خروجی Excel/CSV</button>
        <button class="btn ghost" id="shareTextBtn">📋 اشتراک متنی</button>
      </div>
    </div>`;
  }
  function renderAnalyticsCharts() {
    const now = jToday();
    const data = [];
    for (let i = 5; i >= 0; i--) {
      const mk = jMonthKey(addJMonths(now, -i));
      const s = monthStats(mk);
      data.push({ label: FA_MONTHS[parseJKey(mk).jm - 1].slice(0, 4), in: s.income, out: s.expense + s.installPaid });
    }
    Charts.trend(document.getElementById('chartTrend'), data);
    Charts.gauge(document.getElementById('healthGauge2'), healthScore());
    // دونات
    const mk = jMonthKey(now);
    const byCat = {};
    txs.filter(t => t.type !== 'income' && t.status === 'paid' && t.jdate.startsWith(mk)).forEach(t => { byCat[t.categoryId] = (byCat[t.categoryId] || 0) + t.amount * t.rate; });
    const palette = ['#22d3ee', '#d946ef', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16', '#e879f9'];
    const items = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 9).map((e, i) => {
      const cat = categories.find(c => c.id === e[0]);
      return { label: cat ? cat.name : 'متفرقه', value: e[1], color: (cat && cat.color) || palette[i] };
    });
    Charts.donut(document.getElementById('chartDonut'), items);
    document.getElementById('donutLegend').innerHTML = items.map(i => `<span><i style="background:${i.color}"></i>${esc(i.label)} — ${fmtShort(i.value)}</span>`).join('');
    // پیش‌بینی
    const m1 = monthStats(jMonthKey(addJMonths(now, -1))), m2 = monthStats(jMonthKey(addJMonths(now, -2))), m3 = monthStats(jMonthKey(addJMonths(now, -3)));
    const avgOut = (m1.expense + m1.installPaid + m2.expense + m2.installPaid + m3.expense + m3.installPaid) / 3;
    const avgIn = (m1.income + m2.income + m3.income) / 3;
    const upcomingInst = txs.filter(t => t.type === 'installment' && t.status === 'pending' && t.dueJdate && daysUntilJ(t.dueJdate) >= 0).reduce((a, t) => a + t.amount * t.rate, 0);
    let bal = walletBalance();
    const fData = [{ label: 'اکنون', value: bal }];
    const rows = [];
    for (let i = 1; i <= 3; i++) {
      // ماه اول: اقساط واقعی پیش‌رو؛ ماه‌های بعد: میانگین
      const net = avgIn - avgOut - (i === 1 ? upcomingInst : 0);
      bal += net;
      const mk = addJMonths(now, i);
      fData.push({ label: FA_MONTHS[mk.jm - 1].slice(0, 4), value: Math.round(bal), projected: true });
      rows.push({ month: jMonthLabel(jMonthKey(mk)), in: avgIn, out: avgOut + (i === 1 ? upcomingInst : 0), bal: Math.round(bal) });
    }
    Charts.forecast(document.getElementById('chartForecast'), fData);
    document.getElementById('forecastTable').innerHTML = `<table class="tbl"><tr><th>ماه</th><th>ورودی</th><th>خروجی</th><th>مانده</th></tr>${rows.map(r => `<tr><td>${r.month}</td><td>${fmtShort(r.in)}</td><td>${fmtShort(r.out)}</td><td style="color:${r.bal >= 0 ? 'var(--ok2)' : 'var(--bad2)'}">${fmtShort(r.bal)}</td></tr>`).join('')}</table>`;
  }

  /* ── AI ── */
  let aiTab = 'offline';
  function aiHTML() {
    const r = lastRates;
    const cfg = AI.aiConfig();
    return `
    <div class="subtabs">
      <button class="chip ${aiTab === 'offline' ? 'on' : ''}" data-ait="offline">🤖 دستیار آفلاین</button>
      <button class="chip ${aiTab === 'online' ? 'on' : ''}" data-ait="online">🌐 هوش مصنوعی آنلاین</button>
      <button class="chip ${aiTab === 'invest' ? 'on' : ''}" data-ait="invest">📈 تحلیل سرمایه‌گذاری</button>
    </div>
    ${aiTab === 'offline' ? `
      <div class="card">
        <div class="card-title">دستیار مالی آفلاین <span class="ai-badge on">بدون اینترنت</span></div>
        <div class="chips" style="margin-bottom:12px">
          ${['اقساطم را چطور مدیریت کنم؟', 'چطور پس‌انداز کنم؟', 'بودجه‌ام چطوره؟', 'وضعیت مالی من؟', 'سرمایه‌گذاری چی بخرم؟'].map(q => `<button class="chip" data-q="${esc(q)}">${q}</button>`).join('')}
        </div>
        <div class="field"><input id="aiInp" placeholder="سؤال مالی خود را بپرسید…"></div>
        <button class="btn full" id="aiAskBtn">پرسیدن از دستیار</button>
      </div>
      <div id="aiOut"></div>` : ''}
    ${aiTab === 'online' ? `
      <div class="card">
        <div class="card-title">هوش مصنوعی آنلاین <span class="ai-badge on">✓ ${esc(cfg.label || 'سرویس رایگان فینوا')} — فعال</span></div>
        <div style="margin:0 0 10px">${isPro()
          ? `<span class="quota-badge" id="aiQuotaBadge">⭐ امروز: ${faDigits(aiLeft())} از ۱۰ پیام</span>`
          : `<span class="quota-badge ${aiLeft() ? '' : 'warn'}" id="aiQuotaBadge">رایگان: ${faDigits(aiLeft())} از ۲ پیام${aiLeft() ? '' : ' — تمام شد'}</span>`}</div>
        <p style="font-size:12px;color:var(--txt2);line-height:1.9;margin:0 0 12px">تمام داده‌های مالی تو (اقساط، بودجه، اهداف، موجودی و قیمت لحظه‌ای) برای تحلیل به مدل هوش مصنوعی ارسال می‌شود و تحلیل کامل و شخصی‌سازی‌شده می‌گیری. ${cfg.isDefault ? 'سرویس پیش‌فرض <b>رایگان</b> است و به هیچ کلید API نیاز ندارد' : 'از سرویس شخصی خودت استفاده می‌شود'}؛ برای تغییر به <b data-go-tab="settings">تنظیمات</b> برو.</p>
        <div class="chips" style="margin-bottom:12px">
          ${['کدام قسط مهم‌تر است و چرا؟', 'چقدر می‌توانم پس‌انداز کنم و چطور؟', 'با موجودی من چه چیزی بخرم؟', 'برنامه مالی یک‌ماهه برایم بساز'].map(q => `<button class="chip" data-qo="${esc(q)}">${q}</button>`).join('')}
        </div>
        <div class="field"><input id="aiOnInp" placeholder="هر سؤالی درباره وضعیت مالی‌ات بپرس…"></div>
        <button class="btn full" id="aiOnBtn">🌐 تحلیل آنلاین</button>
      </div>
      <div id="aiOnOut"></div>` : ''}
    ${aiTab === 'invest' ? `
      <div class="card glow">
        <div class="card-title">💰 قیمت لحظه‌ای واقعی <span class="live-pill"><i class="live-dot"></i>زنده</span> ${r && r.ts ? `<small style="font-weight:400;color:var(--txt3)">${esc(r.source || '')}${r.stale ? ' • کش قدیمی' : ''}</small>` : '<small style="font-weight:400;color:var(--txt3)">در حال دریافت…</small>'}</div>
        <div class="rate-card"><div class="rate-ico gold">🥇</div><div class="rate-main"><div class="t">طلا ۱۸ عیار</div><div class="s">هر گرم • بازار تهران</div></div><div class="rate-val"><div class="v" id="rv_gold18">${r && r.gold18 ? fmtNum(r.gold18) : '—'}</div><div id="rd_gold18">${rateDeltaHTML('gold18')}</div></div></div>
        <div class="rate-card"><div class="rate-ico gold">🪙</div><div class="rate-main"><div class="t">سکه تمام امامی</div><div class="s">یک عدد</div></div><div class="rate-val"><div class="v" id="rv_goldCoin">${r && r.goldCoin ? fmtNum(r.goldCoin) : '—'}</div><div id="rd_goldCoin">${rateDeltaHTML('goldCoin')}</div></div></div>
        <div class="rate-card"><div class="rate-ico usd">💵</div><div class="rate-main"><div class="t">دلار آمریکا</div><div class="s">بازار آزاد</div></div><div class="rate-val"><div class="v" id="rv_usd">${r && r.usd ? fmtNum(r.usd) : '—'}</div><div id="rd_usd">${rateDeltaHTML('usd')}</div></div></div>
        <div class="rate-card" style="margin-bottom:0"><div class="rate-ico usd">🌐</div><div class="rate-main"><div class="t">انس جهانی طلا</div><div class="s">XAU/USD</div></div><div class="rate-val"><div class="v" id="rv_ounce">${r && r.ounce ? '$' + fmtNum(Math.round(r.ounce)) : '—'}</div><div id="rd_ounce">${rateDeltaHTML('ounce')}</div></div></div>
        <div class="rate-stamp" id="rateStamp">${r && r.ts ? '🗓 آخرین بروزرسانی: <b>' + relTime(r.ts) + '</b>' + (r.source ? ' • منبع: ' + esc(r.source) : '') : 'هنوز قیمتی دریافت نشده'}</div>
        <button class="btn ghost full" id="refreshRates" style="margin-top:10px">🔄 بروزرسانی قیمت‌ها</button>
        <div class="hint" style="text-align:center;margin-top:7px">${isPro() ? 'قیمت‌ها هر ۶۰ ثانیه خودکار بروز می‌شوند • منبع: TGJU' : 'نسخه رایگان: روزی یک بروزرسانی دستی • بروزرسانی خودکار و نامحدود مخصوص پرو است ⭐'}</div>
      </div>
      <div class="card">
        <div class="card-title">📊 مقایسه روند رشد دارایی‌ها</div>
        <div class="chips" style="margin-bottom:10px">
          <button class="chip ${investRange === 'live' ? 'on' : ''}" data-ir="live">زنده${isPro() ? '' : '<span class="lock-ico">🔒</span>'}</button>
          <button class="chip ${investRange === '1m' ? 'on' : ''}" data-ir="1m">۱ ماه</button>
          <button class="chip ${investRange === '3m' ? 'on' : ''}" data-ir="3m">۳ ماه${isPro() ? '' : '<span class="lock-ico">🔒</span>'}</button>
          <button class="chip ${investRange === '6m' ? 'on' : ''}" data-ir="6m">۶ ماه${isPro() ? '' : '<span class="lock-ico">🔒</span>'}</button>
        </div>
        <div class="chart-box" id="rateChart"></div>
        <div class="legend" id="rateLegend"></div>
        <div class="hint" style="margin-top:8px">نمودار «رشد» هر دارایی نسبت به ابتدای بازه (٪) نشان می‌دهد — هرچه خط بالاتر، سود بیشتر.</div>
      </div>
      <div class="card">
        <div class="card-title">🧮 اگر قبلاً می‌خریدی؟ (حساب‌گر سود)</div>
        <div class="field-inline">
          <div class="field"><label>مبلغ (تومان)</label><input id="wfAmt" type="number" dir="ltr" placeholder="۵۰۰۰۰۰۰" value="5000000"></div>
          <div class="field"><label>فاصله زمانی</label>
            <select id="wfDays"><option value="7">۷ روز قبل</option><option value="30" selected>۳۰ روز قبل</option><option value="90">۹۰ روز قبل</option></select></div>
          <div class="field"><label>دارایی</label>
            <select id="wfAsset"><option value="gold18">طلا ۱۸ عیار</option><option value="goldCoin">سکه امامی</option><option value="usd">دلار</option></select></div>
        </div>
        <button class="btn full" id="wfBtn">محاسبه سود / زیان</button>
        <div id="wfOut" style="margin-top:12px"></div>
      </div>
      <div class="card">
        <div class="card-title">🧠 تحلیل سریع: طلا یا دلار؟</div>
        <div id="quickInvest"></div>
        <div id="investInsights" style="margin-top:12px"></div>
        <button class="btn full" id="investAIBtn" style="margin-top:12px">🤖 تحلیل هوشمند با هوش مصنوعی آنلاین</button>
      </div>
      <div id="aiInvestOut"></div>` : ''}`;
  }
  function bindAIScreen() {
    if (aiTab === 'offline') {
      const out = document.getElementById('aiOut');
      document.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { document.getElementById('aiInp').value = b.dataset.q; askOffline(); });
      document.getElementById('aiAskBtn').onclick = askOffline;
      document.getElementById('aiInp').onkeydown = e => { if (e.key === 'Enter') askOffline(); };
      function askOffline() {
        const q = document.getElementById('aiInp').value.trim();
        if (!q) return UI.toast('سؤال خود را بنویس', 'warn');
        out.innerHTML = `<div class="ai-bubble user">${esc(q)}</div><div class="ai-think">دستیار فینوا در حال تحلیل <span class="dots-anim"><span>•</span><span>•</span><span>•</span></span></div>`;
        setTimeout(() => { out.innerHTML += `<div class="ai-bubble">${mdLite(AI.offlineAnswer(q))}</div>`; out.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, 500);
      }
    }
    if (aiTab === 'online') {
      const out = document.getElementById('aiOnOut');
      document.querySelectorAll('[data-qo]').forEach(b => b.onclick = () => { document.getElementById('aiOnInp').value = b.dataset.qo; askOnline(); });
      document.getElementById('aiOnBtn').onclick = askOnline;
      document.getElementById('aiOnInp').onkeydown = e => { if (e.key === 'Enter') askOnline(); };
      async function askOnline() {
        if (aiLeft() <= 0) { showProModal('ai'); return; }
        const q = document.getElementById('aiOnInp').value.trim() || 'وضعیت مالی من را کامل تحلیل کن و پیشنهاد بده';
        out.innerHTML = `<div class="ai-bubble user">${esc(q)}</div><div class="ai-think" id="thinkRow">🧠 آماده‌سازی داده‌ها <span class="dots-anim"><span>•</span><span>•</span><span>•</span></span></div>`;
        out.scrollIntoView({ behavior: 'smooth', block: 'end' });
        try {
          const ans = await AI.onlineAnswer(q, s => { const t = document.getElementById('thinkRow'); if (t) t.innerHTML = '⏳ ' + s + ' <span class="dots-anim"><span>•</span><span>•</span><span>•</span></span>'; });
          consumeAI(); updateAIBadge();
          out.innerHTML = out.innerHTML.replace(/<div class="ai-think".*?<\/div>/s, '') + `<div class="ai-bubble">${mdLite(ans)}</div><div class="btn-row"><button class="btn ghost sm" id="copyAns">📋 کپی پاسخ</button></div>`;
          document.getElementById('copyAns').onclick = () => { navigator.clipboard && navigator.clipboard.writeText(ans); UI.toast('کپی شد', 'ok'); };
        } catch (e) {
          out.innerHTML = out.innerHTML.replace(/<div class="ai-think".*?<\/div>/s, '') + `<div class="ai-bubble" style="border-color:var(--bad)">❌ ${esc(e.message)}</div>`;
        }
        out.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    }
    if (aiTab === 'invest') {
      drawInvestChart();
      quickInvest();
      renderInsights();
      document.getElementById('refreshRates').onclick = async (e) => {
        if (rateLeftToday() <= 0) { showProModal('rate'); return; }   // رایگان: روزی ۱ بار | پرو نامحدود
        const btn = e.target;
        btn.disabled = true; btn.textContent = '⏳ در حال دریافت قیمت‌های واقعی…';
        try {
          const r = await AI.fetchRates();
          if (r && (r.usd || r.gold18 || r.goldCoin)) {
            consumeRate();
            lastRates = r; App.lastRates = r;
            btn.textContent = '🔄 بروزرسانی قیمت‌ها';
            patchRateDOM(r); quickInvest(); renderInsights(); drawInvestChart();
            UI.toast('قیمت‌های واقعی بروزرسانی شد ✅', 'ok');
          } else {
            btn.textContent = '🔄 بروزرسانی قیمت‌ها';
            UI.toast('دریافت قیمت ناموفق بود — اتصال اینترنت را بررسی کن', 'bad');
          }
        } catch (err) { btn.textContent = '🔄 بروزرسانی قیمت‌ها'; UI.toast('خطا در دریافت قیمت', 'bad'); }
        btn.disabled = false;
      };
      document.querySelectorAll('[data-ir]').forEach(b => b.onclick = () => {
        const rg = b.dataset.ir;
        if (rg !== '1m' && !isPro()) { showProModal('chart'); return; }   // رایگان فقط بازه ۱ ماهه
        investRange = rg; render('ai');
      });
      document.getElementById('wfBtn').onclick = async () => {
        if (calcLeft() <= 0) { showProModal('calc'); return; }   // رایگان: ۲ بار | پرو نامحدود
        const ok = await whatIfCalc();
        if (ok) consumeCalc();
      };
      document.getElementById('investAIBtn').onclick = async () => {
        if (smartLeft() <= 0) { showProModal('smart'); return; }   // رایگان: ۱ بار | پرو از سهمیه ۱۰تایی روز
        const out = document.getElementById('aiInvestOut');
        out.innerHTML = `<div class="ai-think">🧠 تحلیل طلا و دلار <span class="dots-anim"><span>•</span><span>•</span><span>•</span></span></div>`;
        out.scrollIntoView({ behavior: 'smooth', block: 'end' });
        try {
          const ans = await AI.onlineAnswer('با توجه به قیمت لحظه‌ای طلا و دلار و روند ۳۰ روزه و موجودی و پس‌انداز من، کدام برای نگهداری ارزش پول من بهتر است؟ طلا بخرم یا دلار؟ تحلیل کامل سود/ریسک با اعداد بده و مقدار پیشنهادی را هم بگو.');
          consumeSmart();
          out.innerHTML = `<div class="ai-bubble">${mdLite(ans)}</div>`;
        } catch (e) { out.innerHTML = `<div class="ai-bubble" style="border-color:var(--bad)">❌ ${esc(e.message)}</div>`; }
        out.scrollIntoView({ behavior: 'smooth', block: 'end' });
      };
    }
  }
  /* ───────── نمودار مقایسه رشد دارایی‌ها (٪ نسبت به ابتدای بازه) ───────── */
  let investRange = '';   // خالی = هنوز انتخاب نشده — رایگان فقط ۱ ماهه، پرو زنده/۱/۳/۶ ماهه
  function updateAIBadge() {
    const el = document.getElementById('aiQuotaBadge');
    if (!el) return;
    el.outerHTML = isPro()
      ? `<span class="quota-badge" id="aiQuotaBadge">⭐ امروز: ${faDigits(aiLeft())} از ۱۰ پیام</span>`
      : `<span class="quota-badge ${aiLeft() ? '' : 'warn'}" id="aiQuotaBadge">رایگان: ${faDigits(aiLeft())} از ۲ پیام${aiLeft() ? '' : ' — تمام شد'}</span>`;
  }
  async function drawInvestChart() {
    const el = document.getElementById('rateChart');
    if (!el) return;
    if (!investRange) investRange = isPro() ? 'live' : '1m';
    let hist;
    if (investRange === 'live') hist = await AI.snapHistory();
    else {
      const daily = await AI.rateHistory();
      hist = (investRange === '1m' ? daily.slice(-30) : investRange === '6m' ? daily.slice(-180) : daily.slice(-90)).map(d => ({ ts: d.ts, day: d.day, usd: d.usd, gold18: d.gold18, goldCoin: d.goldCoin }));
    }
    if (!hist || hist.length < 2) {
      el.innerHTML = `<div class="empty"><div class="big">📈</div>${investRange === 'live' ? 'داده زنده در حال جمع شدن است — چند دقیقه صبر کن یا «بروزرسانی قیمت‌ها» را بزن' : 'با هر بار باز کردن اپ، قیمت‌ها ذخیره می‌شوند و روند اینجا ساخته می‌شود'}</div>`;
      const lg = document.getElementById('rateLegend'); if (lg) lg.innerHTML = '';
      return;
    }
    const W = Math.max(120, Math.min(el.clientWidth || 340, 800)), H = 210;
    const dpr = window.devicePixelRatio || 1;
    const c = document.createElement('canvas'); c.width = W * dpr; c.height = H * dpr;
    c.style.width = W + 'px'; c.style.height = H + 'px';
    const ctx = c.getContext('2d'); ctx.scale(dpr, dpr);
    const pad = { t: 14, b: 24, l: 8, r: 8 };
    const series = [
      { key: 'gold18', color: cssv('--gold') || '#eab308', label: 'طلا ۱۸' },
      { key: 'goldCoin', color: '#f59e0b', label: 'سکه' },
      { key: 'usd', color: cssv('--usd') || '#38bdf8', label: 'دلار' },
    ];
    const n = hist.length;
    const growth = {}; // کلید → [٪ رشد هر نقطه]
    const changes = {};
    series.forEach(s => {
      const vals = hist.map(h => +(h[s.key]) || 0);
      const i0 = vals.findIndex(v => v > 0);
      if (i0 < 0) return;
      const base = vals[i0];
      growth[s.key] = vals.map((v, i) => i < i0 ? null : (v > 0 ? (v / base - 1) * 100 : null));
      changes[s.key] = (vals[n - 1] / base - 1) * 100;
    });
    const all = [];
    Object.keys(growth).forEach(k => growth[k].forEach(v => { if (v !== null) all.push(v); }));
    if (!all.length) { el.innerHTML = '<div class="empty">داده کافی نیست</div>'; return; }
    let maxV = Math.max(0.5, ...all) * 1.12, minV = Math.min(-0.5, ...all) * 1.12;
    const X = (i) => pad.l + (W - pad.l - pad.r) * (i / (n - 1));
    const Y = (v) => pad.t + (H - pad.t - pad.b) * (1 - (v - minV) / (maxV - minV));
    // خط صفر + خطوط راهنما
    ctx.setLineDash([4, 5]); ctx.lineWidth = 1; ctx.strokeStyle = cssv('--line') || 'rgba(255,255,255,.14)';
    ctx.beginPath(); ctx.moveTo(pad.l, Y(0)); ctx.lineTo(W - pad.r, Y(0)); ctx.stroke();
    [0.5, 1].forEach(f => { const v = minV + (maxV - minV) * f; ctx.beginPath(); ctx.moveTo(pad.l, Y(v)); ctx.lineTo(W - pad.r, Y(v)); ctx.stroke(); });
    ctx.setLineDash([]);
    // خطوط سری‌ها
    const legendParts = [];
    series.forEach(s => {
      const g = growth[s.key];
      if (!g) return;
      ctx.strokeStyle = s.color; ctx.lineWidth = 2.2; ctx.lineJoin = 'round';
      ctx.beginPath();
      let started = false;
      g.forEach((v, i) => {
        if (v === null) return;
        if (!started) { ctx.moveTo(X(i), Y(v)); started = true; } else ctx.lineTo(X(i), Y(v));
      });
      ctx.stroke();
      const lastI = (() => { for (let i = g.length - 1; i >= 0; i--) if (g[i] !== null) return i; return -1; })();
      if (lastI >= 0) {
        ctx.beginPath(); ctx.arc(X(lastI), Y(g[lastI]), 3.5, 0, 7); ctx.fillStyle = s.color; ctx.fill();
      }
      legendParts.push(`<span><i style="background:${s.color}"></i>${s.label} <b style="color:${changes[s.key] >= 0 ? 'var(--ok2)' : 'var(--bad2)'}">${changes[s.key] >= 0 ? '+' : '−'}${faN(Math.abs(changes[s.key]).toFixed(1))}٪</b></span>`);
    });
    // برچسب‌های محور افقی
    ctx.fillStyle = cssv('--txt3') || '#5f7396'; ctx.font = '9px Vazirmatn,Tahoma'; ctx.textAlign = 'center';
    [0, Math.floor(n / 2), n - 1].forEach(i => {
      const lbl = investRange === 'live'
        ? new Date(hist[i].ts).toTimeString().slice(0, 5)
        : faDigits((hist[i].day || '').split('/')[1] + '/' + (hist[i].day || '').split('/')[2]);
      ctx.fillText(faDigits(lbl), X(i), H - 6);
    });
    el.innerHTML = ''; el.appendChild(c);
    const lg = document.getElementById('rateLegend');
    if (lg) lg.innerHTML = legendParts.join('');
  }
  /* ───────── حساب‌گر «اگر قبلاً می‌خریدی؟» — خروجی true = محاسبه انجام شد (برای کوارتا) ───────── */
  async function whatIfCalc() {
    const el = document.getElementById('wfOut');
    if (!el) return false;
    const amt = Math.max(0, +(document.getElementById('wfAmt').value || 0));
    const days = +(document.getElementById('wfDays').value || 30);
    const asset = document.getElementById('wfAsset').value;
    const names = { gold18: 'طلا ۱۸ عیار (گرم)', goldCoin: 'سکه امامی (عدد)', usd: 'دلار ( عدد)' };
    const units = { gold18: 'گرم', goldCoin: 'سکه', usd: 'دلار' };
    if (!amt) { el.innerHTML = '<div class="hint">مبلغ را وارد کن</div>'; return false; }
    const r = lastRates;
    const nowP = r && { gold18: r.gold18, goldCoin: r.goldCoin, usd: r.usd }[asset];
    if (!nowP) { el.innerHTML = '<div class="hint">قیمت فعلی در دسترس نیست — دکمه بروزرسانی را بزن</div>'; return false; }
    // قیمت گذشته از تاریخچه روزانه — نزدیک‌ترین رکورد به فاصله درخواستی
    const hist = await AI.rateHistory();
    let pastP = 0, pastLabel = '';
    if (hist.length >= 2) {
      const target = hist[Math.max(0, hist.length - 1 - days)];
      const src = target[asset] > 0 ? target : hist.find(h => h[asset] > 0);
      if (src) { pastP = src[asset]; pastLabel = jDateLabel(src.day); }
    }
    if (!pastP) {
      el.innerHTML = `<div class="hint">برای محاسبه دقیق، تاریخچه ${faDigits(days)} روز لازم است — تاریخچه با هر بروزرسانی قیمت کامل‌تر می‌شود. 📈</div>`;
      return false;
    }
    const qty = amt / pastP;
    const nowVal = qty * nowP;
    const profit = nowVal - amt;
    const pct = profit / amt * 100;
    const good = profit >= 0;
    el.innerHTML = `
      <div class="grid2" style="margin-bottom:10px">
        <div class="stat"><div class="k">قیمت ${pastLabel}</div><div class="v" style="font-size:15px">${fmtShort(pastP)}</div><div class="sub">تومان</div></div>
        <div class="stat"><div class="k">قیمت امروز</div><div class="v" style="font-size:15px">${fmtShort(nowP)}</div><div class="sub">تومان</div></div>
      </div>
      <div class="stat" style="margin-bottom:10px"><div class="k">امروز می‌داشتی</div>
        <div class="v" style="color:${good ? 'var(--ok2)' : 'var(--bad2)'}">${good ? '+' : '−'}${fmtShort(Math.abs(profit))} <small>تومان</small></div>
        <div class="sub">${faN(pct.toFixed(1))}٪ ${good ? 'سود ✅' : 'زیان'} در ${faDigits(days)} روز • معادل ${faN(qty >= 100 ? Math.round(qty) : qty.toFixed(2))} ${units[asset]}</div></div>
      <p class="hint" style="margin:0">${good ? 'این دارایی در این بازه از تورم عقب نمانده.' : 'این دارایی در این بازه عملکرد ضعیف‌تری داشته — مقایسه با دارایی‌های دیگر را در نمودار ببین.'}</p>`;
    return true;
  }
  /* ───────── بینش‌های خودکار تحلیل سرمایه‌گذاری ───────── */
  async function renderInsights() {
    const el = document.getElementById('investInsights');
    if (!el) return;
    const r = lastRates;
    if (!r || !(r.usd || r.gold18)) { el.innerHTML = ''; return; }
    const lines = [];
    const hist = await AI.rateHistory();
    if (hist.length >= 3) {
      const first = hist[0], last = hist[hist.length - 1];
      const rows = [['gold18', 'طلا ۱۸', '🥇'], ['goldCoin', 'سکه', '🪙'], ['usd', 'دلار', '💵']];
      let best = null;
      rows.forEach(([k, name, ico]) => {
        if (first[k] && last[k]) {
          const ch = (last[k] / first[k] - 1) * 100;
          lines.push(`${ch >= 0 ? '📈' : '📉'} <b>${name}</b> در ${faDigits(hist.length)} روز اخیر: ${ch >= 0 ? '+' : '−'}${faN(Math.abs(ch).toFixed(1))}٪`);
          if (!best || Math.abs(ch) > Math.abs(best.ch)) best = { name, ch, ico };
        }
      });
      if (best) lines.push(`${best.ch >= 0 ? '🏆' : '🛡'} بهترین عملکرد بازه: <b>${best.name}</b> (${best.ch >= 0 ? '+' : '−'}${faN(Math.abs(best.ch).toFixed(1))}٪)`);
    }
    // اختلاف طلای ایران با قیمت جهانی (انس × دلار)
    if (r.ounce && r.usd && r.gold18) {
      const worldG24 = r.ounce / 31.1035 * r.usd;
      const impliedG18 = worldG24 * 0.916 * 1.07; // عیار ۱۸ + اجرت ~۷٪
      const prem = (r.gold18 / impliedG18 - 1) * 100;
      lines.push(prem >= 0
        ? `🌐 طلای ایران حدود <b>${faN(prem.toFixed(1))}٪</b> گران‌تر از معادل جهانی معامله می‌شود (حباب بازار داخلی)`
        : `🌐 طلای ایران حدود <b>${faN(Math.abs(prem).toFixed(1))}٪</b> ارزان‌تر از معادل جهانی است`);
    }
    lines.push('💡 راهبرد: خرید پله‌ای (DCA) — مبلغ را به ۳ قسمت تقسیم کن و در افت‌ها بخر، نه یکجا در قله.');
    el.innerHTML = `<div class="insight-box">${lines.map(l => `<div class="ins-row">${l}</div>`).join('')}</div>`;
  }
  function cssv(v) { return getComputedStyle(document.body).getPropertyValue(v).trim(); }
  function quickInvest() {
    const el = document.getElementById('quickInvest');
    if (!el) return;
    const r = lastRates;
    if (!r || !r.usd || !r.gold18) { el.innerHTML = '<div class="empty">ابتدا قیمت‌ها را بروزرسانی کنید 🔄</div>'; return; }
    const bal = walletBalance();
    const investable = Math.max(0, bal - txs.filter(t => t.type === 'installment' && t.status === 'pending').reduce((a, t) => a + t.amount * t.rate, 0));
    const goldGr = Math.floor(investable / r.gold18 * 100) / 100;
    const usdN = Math.floor(investable / r.usd * 10) / 10;
    const coinN = r.goldCoin ? Math.floor(investable / r.goldCoin) : 0;
    el.innerHTML = `
      <div class="grid2" style="margin-bottom:12px">
        <div class="stat"><div class="k">قابل سرمایه‌گذاری</div><div class="v">${fmtShort(investable)} ت</div><div class="sub">بعد از کسر اقساط</div></div>
        <div class="stat"><div class="k">قدرت خرید</div><div class="v">${faN(goldGr)} گرم طلا</div><div class="sub">یا ${faN(usdN)} دلار${coinN ? ' یا ' + faDigits(coinN) + ' سکه' : ''}</div></div>
      </div>
      <p style="font-size:12.5px;color:var(--txt2);line-height:2;margin:0">
      • طلا ۱۸ عیار: <b style="color:var(--gold)">${fmtToman(r.gold18)}</b> — تاریخی‌ترین سپر تورم در ایران، نقدشوندگی بالا در صرافی‌ها.<br>
      • دلار: <b style="color:var(--usd)">${fmtToman(r.usd)}</b> — نوسان سیاسی/اخباری شدیدتر، ریسک مقرراتی بیشتر.<br>
      • راهبرد پیشنهادی: تقسیم گام‌به‌گام (مثلاً ۷۰٪ طلا / ۳۰٪ دلار در ۳ مرحله) و پرهیز از خرید یکجایی در قله قیمت.
      </p>`;
  }

  /* ═══ امتیاز در مایکت — دیالوگ رضایت + اینتنت myket://comment?id=com.finova.money ═══ */
  function maybeAskRating() {
    if (!unlocked || document.hidden) { setTimeout(() => { try { maybeAskRating(); } catch (e) {} }, 20000); return; }
    const ra = state.rateAsk || {};
    if (ra.done || ra.never) return;                       // قبلاً امتیاز داده یا انصراف قطعی
    if (ra.laterAt && Date.now() < ra.laterAt) return;     // در دوره «بعداً»
    if ((state.openCount || 0) < 3) return;                // حداقل بار سوم باز شدن
    if ((txs || []).length < 5) return;                    // حداقل کمی از اپ استفاده کرده باشد
    showRatingDialog('auto');
  }
  function showRatingDialog(source) {
    const m = UI.modal('⭐ نظرت درباره فینوا چیه؟', `
      <div style="text-align:center">
        <div style="font-size:40px;line-height:1.3;letter-spacing:4px">⭐⭐⭐⭐⭐</div>
        <p style="font-size:13px;color:var(--txt2);line-height:2;margin:12px 0 4px">${source === 'auto' ? 'از اینکه فینوا را انتخاب کردی ممنونیم 💙<br>' : ''}اگر از برنامه راضی هستی، با ثبت <b>امتیاز و تجربه‌ات در مایکت</b> به بهتر شدن فینوا و انتخاب کاربران دیگر کمک کن.</p>
      </div>
      <div class="btn-row" style="margin-top:14px"><button class="btn full" id="mkYes">⭐ ثبت امتیاز در مایکت</button></div>
      <div class="btn-row" style="margin-top:9px"><button class="btn ghost" id="mkLater">بعداً یادآوری کن</button><button class="btn ghost" id="mkNever">نه، ممنون</button></div>`);
    m.querySelector('#mkYes').onclick = () => {
      state.rateAsk = Object.assign(state.rateAsk || {}, { done: true, laterAt: 0 });
      saveState();
      m.remove();
      openMyket();
    };
    m.querySelector('#mkLater').onclick = () => {
      state.rateAsk = Object.assign(state.rateAsk || {}, { laterAt: Date.now() + 14 * 864e5 });
      saveState(); m.remove();
      UI.toast('۱۴ روز دیگر یادت می‌اندازیم 🙌', 'ok');
    };
    m.querySelector('#mkNever').onclick = () => {
      state.rateAsk = Object.assign(state.rateAsk || {}, { never: true });
      saveState(); m.remove();
    };
  }
  function openMyket() {
    try { if (Bridge.openMyketRating) { Bridge.openMyketRating(); UI.toast('ممنون از حمایتت 🌟', 'ok'); return; } } catch (e) {}
    try { window.open('https://myket.ir/app/com.finova.money', '_blank', 'noopener'); } catch (e) {}
  }

  /* ── بودجه ── */
  function budgetsHTML() {
    const mk = jMonthKey(jToday());
    const bs = budgets.filter(b => b.jmonth === mk);
    const spentByCat = {};
    txs.filter(t => t.type === 'expense' && t.status === 'paid' && t.jdate.startsWith(mk)).forEach(t => { spentByCat[t.categoryId] = (spentByCat[t.categoryId] || 0) + t.amount * t.rate; });
    const totalLimit = bs.reduce((a, b) => a + b.limit, 0);
    const totalSpent = bs.reduce((a, b) => a + (spentByCat[b.categoryId] || 0), 0);
    const expCats = categories.filter(c => c.type !== 'income');
    return `
    <div class="card glow">
      <div class="card-title">بودجه ${jMonthLabel()}</div>
      <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:8px"><span>خرج‌شده: <b style="color:var(--bad2)">${fmtShort(totalSpent)}</b></span><span>سقف کل: <b>${fmtShort(totalLimit)}</b></span></div>
      <div class="pbar ${totalSpent > totalLimit ? 'bad' : totalSpent > totalLimit * 0.8 ? 'warn' : 'ok'}"><div style="width:${totalLimit ? Math.min(100, totalSpent / totalLimit * 100) : 0}%"></div></div>
      ${totalSpent > totalLimit ? `<p style="color:var(--bad2);font-size:12px;margin:10px 0 0">🚨 ${fmtShort(totalSpent - totalLimit)} تومان از بودجه عبور کرده‌ای!</p>` : ''}
    </div>
    <button class="btn full" id="addBudgetBtn">＋ تعیین بودجه برای دسته</button>
    <div style="height:12px"></div>
    ${bs.length ? `<div class="list">${bs.map(b => {
      const cat = categories.find(c => c.id === b.categoryId);
      const spent = spentByCat[b.categoryId] || 0;
      const pct = b.limit ? Math.round(spent / b.limit * 100) : 0;
      return `<div class="card" style="margin-bottom:10px;padding:13px 15px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:9px">
          <div style="display:flex;gap:9px;align-items:center"><span style="font-size:19px">${cat ? cat.icon : '🧾'}</span><b style="font-size:13.5px">${cat ? esc(cat.name) : 'دسته'}</b></div>
          <div style="display:flex;gap:6px;align-items:center"><span style="font-size:12px;color:${pct > 100 ? 'var(--bad2)' : 'var(--txt2)'}">${fmtShort(spent)} / ${fmtShort(b.limit)}</span><button class="btn sm ghost" data-del-budget="${b.id}">🗑</button></div>
        </div>
        <div class="pbar ${pct > 100 ? 'bad' : pct > 80 ? 'warn' : 'ok'}"><div style="width:${Math.min(100, pct)}%"></div></div>
        <div style="font-size:10.5px;color:var(--txt3);margin-top:5px">${pct > 100 ? '🚨 ' + faDigits(pct - 100) + '٪ بیشتر از سقف' : faDigits(pct) + '٪ استفاده شده • باقی: ' + fmtShort(Math.max(0, b.limit - spent))}</div>
      </div>`;
    }).join('')}</div>` : '<div class="empty"><div class="big">🎯</div>برای این ماه بودجه تعیین نکرده‌ای.<br>سقف خرج برای هر دسته بگذار تا کنترل داشته باشی.</div>'}`;
  }

  /* ── اهداف + بدهی ── */
  function goalsHTML() {
    const debts = rules.filter(r => r.active && r.amount > 0);
    return `
    <button class="btn full" id="addGoalBtn">＋ هدف مالی جدید</button>
    <div style="height:12px"></div>
    ${goals.length ? goals.map(g => {
      const pct = g.target ? Math.round(g.saved / g.target * 100) : 0;
      const months = g.deadlineJ ? Math.max(1, Math.ceil(daysUntilJ(g.deadlineJ) / 30)) : 6;
      const perMonth = Math.ceil(Math.max(0, g.target - g.saved) / months);
      return `<div class="card" style="padding:15px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:9px">
          <b style="font-size:14px">${esc(g.title)}</b>
          <div style="display:flex;gap:6px"><button class="btn sm" data-goal-add="${g.id}">＋ پس‌انداز</button><button class="btn sm ghost" data-del-goal="${g.id}">🗑</button></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:7px">
          <span>${fmtShort(g.saved)} از ${fmtShort(g.target)} تومان</span><span style="color:${pct >= 100 ? 'var(--ok2)' : 'var(--pri2)'};font-weight:800">${faDigits(pct)}٪</span>
        </div>
        <div class="pbar ${pct >= 100 ? 'ok' : ''}"><div style="width:${Math.min(100, pct)}%"></div></div>
        <div style="display:flex;gap:6px;margin-top:9px;flex-wrap:wrap">
          ${[25, 50, 75, 100].map(m => `<span class="badge ${pct >= m ? 'green' : ''}" style="opacity:${pct >= m ? 1 : .45}">milestone ${faDigits(m)}٪ ${pct >= m ? '✓' : ''}</span>`).join('')}
        </div>
        ${pct < 100 ? `<p style="font-size:11.5px;color:var(--txt2);margin:9px 0 0">💡 ماهی <b>${fmtToman(perMonth)}</b> کنار بگذاری تا ${g.deadlineJ ? jDateLabel(g.deadlineJ) : faDigits(months) + ' ماه بعد'} به هدف می‌رسی.</p>` : '<p style="font-size:12px;color:var(--ok2);margin:9px 0 0">🎉 تبریک! هدف محقق شد!</p>'}
      </div>`;
    }).join('') : '<div class="empty"><div class="big">🏆</div>هدفی ثبت نشده — اولین هدف مالی‌ات را بساز</div>'}

    <div class="sec-label">❄️🏹 راهبرد بدهی: برفی vs بهمنی</div>
    <div class="card">
      ${debts.length ? debtStrategyHTML(debts) : '<div class="empty">بدهی فعالی (قسط ماهانه) نداری 🎉</div>'}
    </div>`;
  }
  function debtStrategyHTML(debts) {
    const surplus = monthStats().income ? Math.max(0, monthStats().income - monthStats().expense - monthStats().installPaid) : Math.round(walletBalance() * 0.1);
    const snow = debts.map(d => ({ ...d, amount: d.amount })).sort((a, b) => a.amount - b.amount);
    const aval = debts.slice().sort((a, b) => b.amount - a.amount);
    const totalDebt = debts.reduce((a, d) => a + d.amount, 0);
    const monthsSnow = Math.max(...debts.map(d => d.remainingMonths || 12));
    const monthsAval = monthsSnow; // بدون نرخ بهره، ترتیب اثر یکسان دارد؛ نمایش تحلیلی
    return `
      <p style="font-size:12px;color:var(--txt2);line-height:1.9;margin:0 0 12px">مجموع اقساط ماهانه فعال: <b>${fmtToman(debts.reduce((a, d) => a + d.amount, 0))}</b> • مازاد ماهانه برآوردی: <b style="color:var(--ok2)">${fmtToman(surplus)}</b></p>
      <div class="grid2">
        <div class="strategy-col ${surplus > totalDebt ? 'best' : ''}">
          <h4>❄️ برفی (Snowball)</h4>
          <p style="font-size:11.5px;color:var(--txt2);line-height:1.8;margin:0">کوچک‌ترین بدهی اول کامل تسویه → انگیزه روانی بالا<br><b>ترتیب:</b> ${snow.map(d => esc(d.title)).join(' → ')}</p>
        </div>
        <div class="strategy-col">
          <h4>🏹 بهمنی (Avalanche)</h4>
          <p style="font-size:11.5px;color:var(--txt2);line-height:1.8;margin:0">گران‌ترین/بزرگ‌ترین بدهی اول → حداقل کارمزد در بلندمدت<br><b>ترتیب:</b> ${aval.map(d => esc(d.title)).join(' → ')}</p>
        </div>
      </div>
      <p style="font-size:11.5px;color:var(--txt3);margin:12px 0 0">💡 اگر بدهی‌ها کارمزد/جریمه متفاوت دارند، روش بهمنی کمتر هزینه می‌دهد؛ اگر نیاز به انگیزه داری، روش برفی بهتر جواب می‌دهد. با مازاد ماهانه ${fmtShort(surplus)} ت، می‌توانی هر ماه یک قسط اضافه به بدهی هدف بپردازی.</p>`;
  }

  /* ── چالش ۳۰ روزه ── */
  function challengeHTML() {
    const ch = state.challenge || {};
    const today = jKey(jToday());
    const active = ch.active && ch.startedJ;
    let day = 0, saved = 0, streak = 0;
    if (active) {
      day = Math.min(30, Math.floor((new Date() - Jalali.toGregorian(parseJKey(ch.startedJ).jy, parseJKey(ch.startedJ).jm, parseJKey(ch.startedJ).jd)) / 86400000) + 1);
      const log = ch.log || {};
      saved = Object.values(log).reduce((a, b) => a + (+b || 0), 0);
      for (let i = 0; i < 30; i++) { if (log[jKey(jAddDays(-i))]) streak++; else if (i > 0) break; }
    }
    const target = 30 * (ch.daily || 50000);
    return `
    <div class="card glow">
      <div class="card-title">🔥 چالش ۳۰ روزه پس‌انداز</div>
      ${active ? `
        <div style="text-align:center;margin:6px 0 14px">
          <div style="font-size:34px;font-weight:900;color:var(--pri2)">روز ${faDigits(day)} از ۳۰</div>
          <div class="score-lbl">پشت‌سرهم: ${faDigits(streak)} روز • مجموع: ${fmtToman(saved)} از ${fmtShort(target)}</div>
        </div>
        <div class="pbar ok"><div style="width:${Math.min(100, saved / target * 100)}%"></div></div>
        <div class="btn-row">
          <button class="btn ok" id="checkinBtn">✅ ثبت پس‌انداز امروز (${fmtShort(ch.daily || 50000)})</button>
          <button class="btn ghost" id="endChBtn">پایان چالش</button>
        </div>` : `
        <p style="font-size:12.5px;color:var(--txt2);line-height:2">هر روز مبلغی ثابت پس‌انداز کن و اینجا ثبت کن. ۳۰ روز پیوسته = عادت طلایی! مبلغ روزانه را تعیین کن:</p>
        <div class="field"><label>مبلغ روزانه (تومان)</label><input id="chDaily" type="number" value="50000"></div>
        <button class="btn full" id="startChBtn">🚀 شروع چالش</button>`}
    </div>`;
  }
  function bindChallenge() {
    const start = document.getElementById('startChBtn');
    if (start) start.onclick = async () => {
      const daily = +document.getElementById('chDaily').value || 50000;
      state.challenge = { active: true, startedJ: jKey(jToday()), daily, log: {} };
      await saveState(); UI.toast('چالش شروع شد! 🔥', 'ok'); render('challenge');
    };
    const checkin = document.getElementById('checkinBtn');
    if (checkin) checkin.onclick = async () => {
      const ch = state.challenge;
      ch.log = ch.log || {};
      const today = jKey(jToday());
      if (ch.log[today]) return UI.toast('امروز قبلاً ثبت کرده‌ای ✅', 'warn');
      ch.log[today] = ch.daily;
      // توجه: پس‌انداز یک هزینه نیست — فقط در ثبت چالش ثبت می‌شود تا موجودی و گزارش‌ها خراب نشود (رفع باگ)
      const saved = Object.values(ch.log).reduce((a, b) => a + (+b || 0), 0);
      if (Object.keys(ch.log).length >= 30) { UI.toast('🎉 چالش کامل شد! مجموع: ' + fmtToman(saved), 'ok'); Bridge.showNotification('🏆 فینوا', 'چالش ۳۰ روزه را کامل کردی! آفرین!', 7777, 'chDone'); }
      else UI.toast('ثبت شد! ادامه بده 🔥', 'ok');
      await saveState(); render('challenge');
    };
    const end = document.getElementById('endChBtn');
    if (end) end.onclick = async () => { state.challenge = {}; await saveState(); render('challenge'); };
  }

  /* ── تنظیمات ── */
  function settingsHTML() {
    const cfg = AI.aiConfig();
    const acc = state.account;
    return `
    ${acc ? `
    <div class="card">
      <div class="card-title">👤 حساب کاربری</div>
      <div style="display:flex;align-items:center;gap:11px">
        <div style="width:44px;height:44px;border-radius:50%;background:var(--grad-neon);display:grid;place-items:center;font-size:18px;font-weight:900;color:#fff;flex:0 0 auto">${esc((acc.name || '؟').slice(0, 1))}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:900">${esc(acc.name)}</div>
          <div style="font-size:10.5px;color:var(--txt3);margin-top:2px">ساخت حساب: ${jTsLabel(acc.createdAt || Date.now())}</div>
        </div>
        ${subStatusHTML()}
      </div>
      <div class="acc-code-row">
        <div><div class="acc-code-lbl">کد حساب — هنگام خرید توکن پرو ارائه کن</div><div class="acc-code-val">${esc(acc.code)}</div></div>
        <button class="copy-code-btn" id="copyAccBtn">📋 کپی</button>
      </div>
      ${!isPro() ? '<button class="btn-gold" id="proUpBtn" style="margin-top:12px">⭐ ارتقا به نسخه پرو</button>' : ''}
    </div>` : ''}
    ${acc ? `
    <div class="card logout-card">
      <div class="card-title">🚪 خروج از حساب</div>
      <p class="logout-limits">لیمیت خروج: هر حساب فقط <b>۱ بار</b> • روی هر گوشی فقط <b>۲ بار</b> • فاصله بین خروج‌ها <b>۲۴ ساعت</b><br>باقی‌مانده این حساب: <b>${faDigits(logoutLimits().accLeft)}</b> بار • باقی‌مانده این گوشی: <b>${faDigits(logoutLimits().devLeft)}</b> بار${logoutLimits().coolLeft > 0 ? '<br>زمان انتظار تا خروج بعدی: <b>' + faDigits(Math.max(1, Math.ceil(logoutLimits().coolLeft / 3600000))) + ' ساعت</b>' : ''}</p>
      <button class="btn-logout" id="logoutBtn">🚪 خروج از حساب کاربری</button>
    </div>` : ''}
    <div class="card">
      <div class="card-title">🎨 شخصی‌سازی ${isPro() ? '<span class="pers-badge" style="background:rgba(16,185,129,.14);color:var(--ok2);border-color:rgba(16,185,129,.4)">پرو — نامحدود</span>' : `<span class="pers-badge">${isPro() ? '' : 'فرصت رایگان: ' + faDigits(Math.max(0, 1 - (state.themeChanges || 0)))} بار</span>`}</div>
      <p style="font-size:11.5px;color:var(--txt2);line-height:1.9;margin:0 0 6px">ظاهر فینوا را به سلیقه خودت عوض کن — با هر تم، رنگ‌ها، فونت اعداد و انیمیشن‌های برنامه عوض می‌شود.</p>
      <div class="theme-grid">
        ${Object.keys(THEMES).map(k => {
          const locked = !isPro() && (state.themeChanges || 0) >= 1 && state.theme !== k;
          return `<button class="theme-opt ${state.theme === k ? 'on' : ''}" data-theme-opt="${k}" aria-label="تم ${THEMES[k].name}" aria-pressed="${state.theme === k}">
            ${locked ? `<span class="t-lock">${LOCK_SVG}</span>` : ''}
            <span class="tp tp-${k}">${k === 'classic' ? '<i></i><b>۸۵</b><u></u><s></s>' : k === 'pop' ? '<i></i><b></b><u></u>' : '<i></i><b></b><u></u>'}</span>
            <span class="theme-name">${THEMES[k].name}<small>${state.theme === k ? '✓ فعال' : THEMES[k].desc}</small></span>
          </button>`;
        }).join('')}
      </div>
      ${!isPro() ? `<p class="hint" style="margin-top:9px">🎨 شخصی‌سازی کامل مخصوص <b>نسخه پرو</b> است — نسخه رایگان فقط <b>${faDigits(1)}</b> بار می‌تواند تم را تغییر دهد.${(state.themeChanges || 0) >= 1 ? '<br>فرصت رایگانت تمام شده؛ برای تغییر تم‌های دیگر نسخه پرو را فعال کن ⭐' : ''}</p>` : ''}
    </div>
    <div class="card">
      <div class="card-title">🔐 قفل و امنیت</div>
      <div class="switch-row"><span>قفل با رمز (PIN ۴ رقمی)</span><label class="switch"><input type="checkbox" id="swLock" ${state.lock && state.lock.enabled ? 'checked' : ''}><span class="sw"></span></label></div>
      <div class="switch-row"><span>حالت سختگیرانه (هشدار قبل از خرید غیرضروری)</span><label class="switch"><input type="checkbox" id="swStrict" ${state.strict && state.strict.enabled ? 'checked' : ''}><span class="sw"></span></label></div>
      ${state.strict && state.strict.enabled ? `<div class="field" style="margin-top:8px"><label>سقف خرید غیرضروری (٪ درآمد ماه): ${faDigits(state.strict.pct)}</label><input type="range" id="strictPct" min="5" max="60" step="5" value="${state.strict.pct}" style="width:100%"></div>` : ''}
    </div>
    <div class="card">
      <div class="card-title">🔔 یادآوری‌ها</div>
      <div class="field"><label>یادآوری قسط چند روز قبل؟</label>
        <div class="chips">
          ${[7, 3, 1].map(d => `<button class="chip ${((state.notify && state.notify.days) || []).includes(d) ? 'on' : ''}" data-nday="${d}">${faDigits(d)} روز قبل</button>`).join('')}
        </div></div>
      <div class="switch-row"><span>هشدار اتمام بودجه</span><label class="switch"><input type="checkbox" id="swBudgetAlert" ${state.notify && state.notify.budgetAlert ? 'checked' : ''}><span class="sw"></span></label></div>
      <button class="btn ghost full" id="testNotifBtn">🔔 تست اعلان سیستم</button>
    </div>
    <div class="card">
      <div class="card-title">🌐 هوش مصنوعی آنلاین <span class="ai-badge ${cfg.isDefault ? 'on' : 'off'}">${cfg.isDefault ? 'رایگان — بدون کلید' : 'سرویس شخصی'}</span></div>
      <p style="font-size:11.5px;color:var(--txt2);line-height:1.9;margin:0 0 10px">سرویس فعال الان: <b>${esc(cfg.label || '')}</b>${cfg.isDefault ? ' — رایگان و بدون نیاز به کلید API کار می‌کند.' : '.'} اگر سرویس شخصی داری (OpenAI، OpenRouter یا هر سرویس سازگار)، مقادیر زیر را پر کن؛ برای بازگشت به حالت رایگان، فیلدها را خالی کن و ذخیره بزن.</p>
      <div class="field"><label>آدرس سرویس (اختیاری)</label>
        <input id="aiBase" dir="ltr" value="${esc(cfg.isDefault ? '' : cfg.baseURL)}" placeholder="خالی = سرویس رایگان فینوا">
        <div class="hint">مثال: https://api.openai.com/v1 یا https://openrouter.ai/api/v1 — هر سرویس نیازمند کلید، باید کلید هم داشته باشد.</div>
      </div>
      <div class="field"><label>کلید API (اختیاری)</label><input id="aiKey" dir="ltr" type="password" value="${esc(cfg.apiKey)}" placeholder="sk-..."></div>
      <div class="field"><label>نام مدل (اختیاری)</label><input id="aiModel" dir="ltr" value="${esc(cfg.isDefault && cfg.model === 'openai' ? '' : cfg.model)}" placeholder="openai"></div>
      <button class="btn full" id="saveAIBtn">ذخیره تنظیمات AI</button>
      ${!cfg.isDefault ? '<button class="btn ghost full" id="resetAIBtn" style="margin-top:8px">↩ بازگشت به سرویس رایگان فینوا</button>' : ''}
    </div>
    <div class="card">
      <div class="card-title">💱 قیمت دستی (اگر API در دسترس نبود)</div>
      <div class="field-inline">
        <div class="field"><label>دلار (تومان)</label><input id="mUSD" type="number" value="${esc(state.manualUSD || '')}"></div>
        <div class="field"><label>طلا ۱۸ (تومان)</label><input id="mGold" type="number" value="${esc(state.manualGold || '')}"></div>
      </div>
      <button class="btn ghost full" id="saveRatesBtn">ذخیره قیمت‌های دستی</button>
    </div>
    <div class="card">
      <div class="card-title">💾 داده و پشتیبان</div>
      <div class="switch-row"><span>پشتیبان‌گیری خودکار روزانه</span><label class="switch"><input type="checkbox" id="swAutoBk" ${state.backup && state.backup.auto ? 'checked' : ''}><span class="sw"></span></label></div>
      <div class="btn-row"><button class="btn" id="bkEncBtn">🔐 پشتیبان رمزنگاری‌شده${isPro() ? '' : ' ⭐'}</button><button class="btn ghost" id="bkPlainBtn">📤 پشتیبان ساده</button></div>
      <div class="btn-row"><button class="btn ghost" id="restoreBtn">📥 بازیابی از فایل</button><button class="btn ghost" id="exportDataBtn">📋 نمایش داده JSON</button></div>
      <div class="btn-row"><button class="btn danger" id="wipeBtn">🗑 پاک‌سازی کامل داده‌ها</button></div>
      <p class="hint" style="text-align:center;margin-top:8px">پاک‌سازی، همه دیتابیس (IndexedDB و حافظه‌های قبلی) را واقعاً حذف می‌کند.</p>
    </div>
    <div class="card">
      <div class="card-title">🏷️ دسته‌ها و کیف پول‌ها</div>
      <div class="btn-row"><button class="btn ghost" id="addCatBtn">＋ دسته جدید</button><button class="btn ghost" id="addWalletBtn">＋ کیف پول جدید</button></div>
      <div class="list" style="margin-top:10px">${categories.map(c => `<div class="row-item"><div class="row-ico">${c.icon}</div><div class="row-main"><div class="t">${esc(c.name)}</div><div class="s">${c.type === 'income' ? 'درآمد' : c.essential ? 'هزینه ضروری' : 'هزینه'} </div></div></div>`).join('')}</div>
    </div>
    <div class="card">
      <div class="card-title">⭐ حمایت از فینوا</div>
      <p style="font-size:12.5px;color:var(--txt2);line-height:2;margin:0 0 10px">اگر فینوا مدیریت مالی‌ات را بهتر کرده، با یک <b>امتیاز و نظر در مایکت</b> به بهتر شدن برنامه و انتخاب کاربران دیگر کمک کن 🙏</p>
      <button class="btn full" id="rateMyketBtn">⭐ امتیاز و نظر در مایکت</button>
    </div>
    <div class="card">
      <img src="img/logo.png" alt="فینوا" style="display:block;width:64px;height:64px;margin:2px auto 10px;filter:drop-shadow(0 0 14px rgba(34,211,238,.35))">
      <div class="card-title" style="text-align:center">ℹ️ درباره فینوا</div>
      <p style="font-size:12.5px;color:var(--txt2);line-height:2;margin:0">فینوا نسخه ${faDigits(APP_VERSION)} (${esc(Bridge.version())}) — مدیریت مالی هوشمند، کاملاً آفلاین و محلی.<br>داده‌هایت فقط روی همین گوشی ذخیره می‌شوند. 🔒<br>تقویم جلالی • تومان • RTL کامل</p>
    </div>`;
  }

  /* ═══ تعاملات عمومی ═══ */
  function bindChrome() {
    document.querySelectorAll('.nav-btn').forEach(b => b.onclick = () => render(b.dataset.tab));
    document.getElementById('themeBtn').onclick = async () => { state.dark = !state.dark; applyTheme(); await saveState(); render(curTab); };
    document.getElementById('menuBtn').onclick = () => document.getElementById('menuSheet').classList.remove('hidden');
    document.getElementById('menuSheet').addEventListener('click', e => {
      if (e.target.classList.contains('sheet-backdrop') || e.target.classList.contains('sheet-cancel')) document.getElementById('menuSheet').classList.add('hidden');
      const go = e.target.closest('[data-go]');
      if (go) { document.getElementById('menuSheet').classList.add('hidden'); render(go.dataset.go); }
    });
    document.getElementById('fab').onclick = showAddSheet;
    document.getElementById('view').addEventListener('click', viewClickHandler);
    document.getElementById('view').addEventListener('input', viewInputHandler);
    document.getElementById('view').addEventListener('change', viewChangeHandler);
    window.__backHandler = () => {
      const open = document.querySelector('.modal-backdrop, .sheet-backdrop:not(.hidden)');
      if (open) { if (!open.classList.contains('hidden')) open.classList.add('hidden'); else open.remove(); }
      else if (curTab !== 'dashboard') render('dashboard');
      else Bridge.exitApp();
    };
  }
  /* ── تم روز/شب + تم‌های شخصی‌سازی (نئون / کلاسیک / پاپ) ── */
  const THEMES = {
    neon: { name: 'نئون', desc: 'پیش‌فرض فینوا' },
    classic: { name: 'کلاسیک', desc: 'طلایی سلطنتی' },
    pop: { name: 'مدرن پاپ', desc: 'پرانرژی و رنگی' },
  };
  const THEME_META_COLOR = {
    neon: { dark: '#0b1120', light: '#eef2f9' },
    classic: { dark: '#070a14', light: '#f2ead4' },
    pop: { dark: '#0c0c1d', light: '#eef0fa' },
  };
  function applyTheme() {
    const th = THEMES[state.theme] ? state.theme : 'neon';
    document.body.dataset.theme = th;
    document.body.classList.toggle('light', !state.dark);
    const mc = THEME_META_COLOR[th];
    document.querySelector('meta[name=theme-color]').setAttribute('content', state.dark ? mc.dark : mc.light);
    document.getElementById('themeBtn').textContent = state.dark ? '🌙' : '☀️';
  }
  /* — فلش رنگی هنگام تعویض تم — */
  function themeFlash() {
    try {
      const grads = {
        neon: 'linear-gradient(135deg,#06b6d4,#d946ef)',
        classic: 'linear-gradient(135deg,#fff1c2,#b8902b 45%,#6e5216)',
        pop: 'linear-gradient(120deg,#6a3dff,#ff3d8b,#ff9a3d)',
      };
      const f = document.createElement('div');
      f.className = 'theme-flash';
      f.style.background = grads[state.theme] || grads.neon;
      document.body.appendChild(f);
      setTimeout(() => { try { f.remove(); } catch (e) {} }, 780);
      document.body.classList.add('theme-swap');
      setTimeout(() => document.body.classList.remove('theme-swap'), 680);
    } catch (e) {}
  }
  /* — انتخاب تم از بخش شخصی‌سازی (پرو نامحدود، رایگان ۱ بار) — */
  async function applyAppTheme(t) {
    if (!THEMES[t]) return;
    if (state.theme === t) { UI.toast('این تم همین حالا فعال است ✨', 'ok'); return; }
    if (!isPro()) {
      if ((state.themeChanges || 0) >= 1) return showProModal('personalization');
    }
    state.theme = t;
    if (!isPro()) state.themeChanges = (state.themeChanges || 0) + 1;
    applyTheme();
    themeFlash();
    await saveState();
    UI.toast(`تم «${THEMES[t].name}» فعال شد 🎨`, 'ok');
    if (curTab === 'settings') render('settings');
  }
  function viewClickHandler(e) {
    const t = e.target;
    // ناوبری‌ها
    const goTab = t.closest('[data-go-tab]'); if (goTab) return render(goTab.dataset.goTab);
    const it = t.closest('[data-it]'); if (it) { instTab = it.dataset.it; return render('installments'); }
    const ait = t.closest('[data-ait]'); if (ait) { aiTab = ait.dataset.ait; return render('ai'); }
    const ft = t.closest('[data-ft]'); if (ft) { filterType = ft.dataset.ft; return render('transactions'); }
    // تراکنش
    const tx = t.closest('[data-tx]'); if (tx) return txModal(txs.find(x => x.id === tx.dataset.tx));
    // قسط ماهانه
    const stopRule = t.closest('[data-stop-rule]'); if (stopRule) return stopRuleConfirm(stopRule.dataset.stopRule);
    const addRule = t.closest('#addRuleBtn'); if (addRule) return ruleForm();
    // بودجه
    const addB = t.closest('#addBudgetBtn'); if (addB) return budgetForm();
    const delB = t.closest('[data-del-budget]'); if (delB) { budgets = budgets.filter(b => b.id !== delB.dataset.delBudget); persist('budgets'); UI.toast('بودجه حذف شد', 'ok'); return render('budgets'); }
    // هدف
    const addG = t.closest('#addGoalBtn'); if (addG) return goalForm();
    const delG = t.closest('[data-del-goal]'); if (delG) { goals = goals.filter(g => g.id !== delG.dataset.delGoal); persist('goals'); return render('goals'); }
    const addGs = t.closest('[data-goal-add]'); if (addGs) return goalDeposit(addGs.dataset.goalAdd);
    // تنظیمات
    if (t.closest('#testNotifBtn')) { Bridge.showNotification('✅ اعلان فینوا فعال است', 'یادآوری اقساط و بودجه به‌موقع می‌رسد.', 1, 'test'); return UI.toast('اعلان ارسال شد', 'ok'); }
    if (t.closest('#saveAIBtn')) {
      state.aiBaseURL = document.getElementById('aiBase').value.trim();
      state.aiApiKey = document.getElementById('aiKey').value.trim();
      state.aiModel = document.getElementById('aiModel').value.trim();
      if (state.aiBaseURL && !state.aiApiKey && /openai|openrouter|groq|anthropic|deepseek/i.test(state.aiBaseURL)) {
        UI.toast('این سرویس بدون کلید API کار نمی‌کند — کلید را وارد کن یا فیلد آدرس را خالی بگذار', 'warn');
        return;
      }
      saveState().then(() => {
        UI.toast(state.aiBaseURL ? 'سرویس شخصی AI ذخیره شد ✅' : 'حالت رایگان پیش‌فرض فینوا فعال شد ✅', 'ok');
        if (curTab === 'settings') render('settings');
      });
      return;
    }
    if (t.closest('#resetAIBtn')) {
      state.aiBaseURL = ''; state.aiApiKey = ''; state.aiModel = '';
      saveState().then(() => { UI.toast('سرویس رایگان فینوا فعال شد ✅', 'ok'); render('settings'); });
      return;
    }
    if (t.closest('#saveRatesBtn')) { state.manualUSD = document.getElementById('mUSD').value; state.manualGold = document.getElementById('mGold').value; saveState(); return UI.toast('ذخیره شد', 'ok'); }
    if (t.closest('#rateMyketBtn')) return showRatingDialog('settings');
    // پرو و حساب
    if (t.closest('#proCta') || t.closest('#proUpBtn')) return showProModal('home');
    if (t.closest('#logoutBtn')) return logoutConfirm();
    if (t.closest('#copyAccBtn')) return copyText(state.account ? state.account.code : '');
    // شخصی‌سازی — انتخاب تم
    const thOpt = t.closest('[data-theme-opt]');
    if (thOpt) return applyAppTheme(thOpt.dataset.themeOpt);
    if (t.closest('#bkEncBtn')) { if (!isPro()) return showProModal('backup'); return backupFile(true); }   // پشتیبان رمزنگاری‌شده: پرو (نامحدود)
    if (t.closest('#bkPlainBtn')) return backupFile(false);
    if (t.closest('#restoreBtn')) return pickFileAndRestore();
    if (t.closest('#exportDataBtn')) return UI.modal('داده JSON', `<textarea style="width:100%;height:220px;background:var(--bg2);color:var(--txt);border:1px solid var(--line);border-radius:10px;padding:10px" readonly>${esc(exportPayload())}</textarea>`);
    if (t.closest('#wipeBtn')) return wipeConfirm();
    if (t.closest('#addCatBtn')) return catForm();
    if (t.closest('#addWalletBtn')) return walletForm();
    // گزارش‌ها — PDF و کارت اشتراکی: مخصوص پرو | CSV و اشتراک متنی: رایگان
    if (t.closest('#pdfBtn')) { if (!isPro()) return showProModal('pdf'); return exportPDF(); }
    if (t.closest('#shareBtn')) { if (!isPro()) return showProModal('card'); return shareCard(); }
    if (t.closest('#csvBtn')) return exportCSV();
    if (t.closest('#shareTextBtn')) return shareTextReport();
  }
  function viewInputHandler(e) {
    const t = e.target;
    if (t.id === 'searchInp') { searchQ = t.value; const l = filteredTxs(); refreshTxList(l); }
    if (t.id === 'fFrom') { filterFrom = t.value; refreshTxList(filteredTxs()); }
    if (t.id === 'fTo') { filterTo = t.value; refreshTxList(filteredTxs()); }
    if (t.id === 'strictPct') { state.strict.pct = +t.value; saveState(); }
  }
  function viewChangeHandler(e) {
    const t = e.target;
    if (t.id === 'fCat') { filterCat = t.value; refreshTxList(filteredTxs()); }
    if (t.id === 'swLock') return toggleLock(t.checked);
    if (t.id === 'swStrict') { state.strict.enabled = t.checked; saveState(); render('settings'); }
    if (t.id === 'swBudgetAlert') { state.notify.budgetAlert = t.checked; saveState(); }
    if (t.id === 'swAutoBk') { state.backup.auto = t.checked; saveState(); }
  }
  function refreshTxList(list) {
    const card = document.querySelectorAll('#view .card')[1];
    if (card && curTab === 'transactions') {
      card.querySelector('.card-title').innerHTML = `نتایج (${faDigits(list.length)}) <small style="font-weight:400;color:var(--txt3)">مجموع: ${fmtShort(list.filter(t => t.status === 'paid').reduce((a, t) => a + (t.type === 'income' ? t.amount * t.rate : -(t.amount * t.rate)), 0))} ت</small>`;
      const listEl = card.querySelector('.list') || card;
      listEl.innerHTML = list.length ? list.slice(0, 80).map(txRowHTML).join('') : '<div class="empty"><div class="big">🔍</div>تراکنشی پیدا نشد</div>';
    }
  }

  async function toggleLock(on) {
    if (on) {
      const pin = enDigits(await UI.prompt('تنظیم رمز ورود', 'یک رمز ۴ رقمی وارد کنید:', 'password')) || '';
      if (!pin || pin.length < 4) { UI.toast('رمز باید حداقل ۴ رقم باشد', 'bad'); render('settings'); return; }
      const salt = String(Math.random()).slice(2, 10);
      state.lock = { enabled: true, pinHash: simpleHash(pin + salt), salt };
      UI.toast('قفل فعال شد ✅', 'ok');
    } else {
      state.lock = { enabled: false, pinHash: '', salt: '' };
      UI.toast('قفل غیرفعال شد', 'ok');
    }
    await saveState();
  }
  function stopRuleConfirm(id) {
    UI.confirm('توقف قسط ماهانه', 'این قسط ماهانه متوقف می‌شود (اقساط ثبت‌شده قبلی باقی می‌مانند). ادامه؟', async () => {
      const r = rules.find(x => x.id === id); if (r) r.active = false;
      await persist('rules'); UI.toast('متوقف شد', 'ok'); render('installments');
    });
  }
  function wipeConfirm() {
    UI.confirm('پاک‌سازی کامل!', 'همه داده‌ها برای همیشه حذف می‌شوند و قابل بازگشت نیستند. حساب کاربری، اشتراک پرو و توکن‌های فعال‌شده حفظ می‌شوند. مطمئنی؟', async () => {
      // حساب و اشتراک حفظ می‌شود تا توکن‌های خریداری‌شده از بین نرود
      const keep = { account: state.account, trialStart: state.trialStart, pro: state.pro, quota: state.quota, openCount: state.openCount, rateAsk: state.rateAsk };
      // رجیستری حساب‌ها، نشست و لیمیت خروج هم باید از پاک‌شدن محافظت شوند
      const regs = getRegistry(), sess = getSession(), llog = getLogoutLog();
      await Store.wipeAll();
      setRegistry(regs); setSession(sess); saveLogoutLog(llog);
      txs = []; rules = []; budgets = []; goals = []; wallets = DEF_WALLETS.slice(); categories = DEF_CATEGORIES.slice();
      state = defaultState();
      Object.assign(state, keep);
      await Store.bulkPut('categories', categories); await Store.bulkPut('wallets', wallets);
      await saveState();
      await saveAccBlob();
      UI.toast('همه داده‌ها واقعاً پاک شد ✅', 'ok');
      startTrialTimer();
      render('dashboard');
    });
  }
  function pickFileAndRestore() {
    // در اپ اندروید: انتخابگر بومی SAF (مطمئن‌ترین راه در WebView)
    if (Bridge.hasNative() && typeof Bridge.pickBackupFile === 'function') {
      Bridge.pickBackupFile().then(text => {
        if (!text) { UI.toast('فایلی انتخاب نشد', 'bad'); return; }
        handleBackupText(String(text));
      });
      return;
    }
    // مرورگر / پیش‌نمایش
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,.enc,application/json';
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return;
      handleBackupText(await f.text());
    };
    inp.click();
  }
  async function handleBackupText(text) {
    try {
      if (text.startsWith('FENC1:')) {
        const pass = await UI.prompt('رمز فایل', 'رمز پشتیبان را وارد کنید:', 'password');
        if (!pass) return;
        text = await decryptText(text, pass);
      }
      await importPayload(text);
    } catch (e) { UI.toast('بازگشایی ناموفق: رمز اشتباه یا فایل خراب است', 'bad'); }
  }

  /* ── شیت ثبت جدید ── */
  function showAddSheet() {
    const m = UI.sheet(`
      <h3>ثبت جدید</h3>
      <button class="sheet-item" data-add="income"><span class="si-ico">💰</span><span>درآمد</span></button>
      <button class="sheet-item" data-add="expense"><span class="si-ico">🧾</span><span>هزینه</span></button>
      <button class="sheet-item" data-add="installment"><span class="si-ico">📅</span><span>قسط / پرداخت دوره‌ای</span></button>
      <button class="sheet-item" data-add="budget"><span class="si-ico">🎯</span><span>بودجه دسته</span></button>
      <button class="sheet-item" data-add="goal"><span class="si-ico">🏆</span><span>هدف مالی</span></button>
    `);
    m.addEventListener('click', e => {
      const a = e.target.closest('[data-add]');
      if (!a) return;
      m.remove();
      const kind = a.dataset.add;
      if (kind === 'income') txForm('income');
      if (kind === 'expense') txForm('expense');
      if (kind === 'installment') ruleForm();
      if (kind === 'budget') budgetForm();
      if (kind === 'goal') goalForm();
    });
  }

  /* ── فرم تراکنش (با حالت سختگیرانه) ── */
  function txForm(type, preset) {
    const t = jToday();
    const isInc = type === 'income';
    const cats = categories.filter(c => isInc ? c.type === 'income' : c.type !== 'income');
    UI.modal(isInc ? '💰 ثبت درآمد' : '🧾 ثبت هزینه', `
      <div class="field"><label>عنوان</label><input id="txTitle" placeholder="${isInc ? 'مثلاً حقوق آبان' : 'مثلاً خرید هفتگی'}" value="${preset && preset.title || ''}"></div>
      <div class="field"><label>مبلغ (تومان)</label><input id="txAmount" type="number" dir="ltr" placeholder="0" value="${preset && preset.amount || ''}"></div>
      <div class="field"><label>تاریخ (جلالی — سال/ماه/روز)</label><input id="txDate" dir="ltr" value="${jKey(preset && preset.date || t)}"></div>
      <div class="field-inline">
        <div class="field"><label>دسته</label><select id="txCat">${cats.map(c => `<option value="${c.id}" ${preset && preset.categoryId === c.id ? 'selected' : ''}>${c.icon} ${esc(c.name)}</option>`).join('')}</select></div>
        <div class="field"><label>کیف پول</label><select id="txWallet">${wallets.map(w => `<option value="${w.id}">${esc(w.name)}</option>`).join('')}</select></div>
      </div>
      ${!isInc ? `<div class="field"><label>اولویت (۱ = مهم‌ترین)</label><div class="seg" id="txPri">${[1,2,3,4,5].map(p => `<button data-p="${p}" class="${(preset && preset.priority || 3) === p ? 'on' : ''}">${faDigits(p)}</button>`).join('')}</div></div>
      <div class="switch-row"><span>هزینه ضروری (مسکن، خوراک، قبض…)</span><label class="switch"><input type="checkbox" id="txEss" ${preset && preset.essential ? 'checked' : ''}><span class="sw"></span></label></div>` : ''}
      <div class="field"><label>برچسب‌ها (با ویرگول)</label><input id="txTags" placeholder="مثلاً ضروری، خانه"></div>
      <div class="field"><label>یادداشت</label><textarea id="txNote" rows="2" placeholder="اختیاری"></textarea></div>
      ${!isInc ? `<div class="field"><label>📎 تصویر رسید (اختیاری)</label><input id="txReceipt" type="file" accept="image/*"></div>` : ''}
      <button class="btn full" id="txSaveBtn">${isInc ? 'ثبت درآمد' : 'ثبت هزینه'}</button>
    `);
    let pri = (preset && preset.priority) || 3;
    const priEl = document.getElementById('txPri');
    if (priEl) priEl.onclick = e => { const b = e.target.closest('[data-p]'); if (!b) return; pri = +b.dataset.p; [...priEl.children].forEach(x => x.classList.toggle('on', x === b)); };
    document.getElementById('txSaveBtn').onclick = async () => {
      const title = document.getElementById('txTitle').value.trim();
      const amount = +enDigits(document.getElementById('txAmount').value);
      const jdate = enDigits(document.getElementById('txDate').value).replace(/[^0-9/]/g, '');
      if (!title) return UI.toast('عنوان را وارد کنید', 'warn');
      if (!amount || amount <= 0) return UI.toast('مبلغ معتبر وارد کنید', 'warn');
      if (!/^\d{4}\/\d{2}(\/\d{2})?$/.test(jdate)) return UI.toast('تاریخ را به شکل ۱۴۰۳/۰۹/۱۵ وارد کنید', 'warn');
      // حالت سختگیرانه برای هزینه غیرضروری
      if (!isInc) {
        const ess = document.getElementById('txEss') && document.getElementById('txEss').checked;
        if (!ess) {
          const warn = strictCheck(amount);
          if (warn) {
            return UI.confirm('⚠️ هشدار حالت سختگیرانه', warn.why + '\nآیا مطمئنی که این هزینه را ثبت می‌کنی؟', () => doSave(false), () => {});
          }
        }
      }
      doSave(true);
      async function doSave(skip) {
        const receiptEl = document.getElementById('txReceipt');
        let receiptId = null;
        if (receiptEl && receiptEl.files[0]) {
          try {
            const f = receiptEl.files[0];
            const b64 = await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.readAsDataURL(f); });
            receiptId = uid('rc');
            await Store.put('receipts', { id: receiptId, mime: f.type, data: b64 }); // keyPath inline ('id')
          } catch (e) { console.warn('receipt', e); }
        }
        const tags = document.getElementById('txTags').value.split(/[,،]/).map(s => s.trim()).filter(Boolean);
        txs.push(normTx({
          type, title, amount, jdate,
          categoryId: document.getElementById('txCat').value,
          walletId: document.getElementById('txWallet').value,
          priority: pri, essential: document.getElementById('txEss') ? document.getElementById('txEss').checked : false,
          tags, note: document.getElementById('txNote').value, status: 'paid', receiptId,
        }));
        await persist('transactions');
        UI.closeModal();
        UI.toast(isInc ? 'درآمد ثبت شد ✅' : 'هزینه ثبت شد ✅', 'ok');
        Bridge.vibrate(30);
        scheduleNotifications();
        render(curTab);
      }
    };
  }

  /* ── مودال تراکنش (مشاهده/پرداخت/حذف) ── */
  function txModal(t) {
    if (!t) return;
    const cat = categories.find(c => c.id === t.categoryId);
    const canPay = t.type === 'installment' && t.status === 'pending';
    const bal = walletBalance();
    const enough = bal >= t.amount * t.rate;
    UI.modal('جزئیات ' + (t.type === 'income' ? 'درآمد' : t.type === 'installment' ? 'قسط' : 'هزینه'), `
      <div style="text-align:center;padding:8px 0 16px">
        <div style="font-size:26px;font-weight:900;color:${t.status === 'paid' ? (t.type === 'income' ? 'var(--ok2)' : 'var(--bad2)') : 'var(--warn2)'}">${fmtNum(t.amount * t.rate)} <small style="font-size:13px;color:var(--txt3)">تومان</small></div>
        <div style="margin-top:6px;font-size:14px">${esc(t.title)} ${t.essential ? '<span class="badge violet">ضروری</span>' : ''}</div>
        <div style="margin-top:4px;font-size:11.5px;color:var(--txt3)">${jDateLabel(t.jdate)} ${t.dueJdate && t.dueJdate !== t.jdate ? '• موعد: ' + jDateLabel(t.dueJdate) : ''} ${cat ? '• ' + cat.icon + ' ' + esc(cat.name) : ''}</div>
        ${t.note ? `<div style="margin-top:8px;font-size:12px;color:var(--txt2)">${esc(t.note)}</div>` : ''}
        ${(t.tags || []).length ? `<div style="margin-top:6px">${t.tags.map(g => `<span class="tag">#${esc(g)}</span>`).join(' ')}</div>` : ''}
      </div>
      ${canPay ? `<div class="ai-bubble" style="margin-bottom:12px;font-size:12px">${enough ? '✅ موجودی کافی داری.' : `⚠️ موجودی (${fmtToman(bal)}) کافی نیست — کسری: ${fmtToman(t.amount * t.rate - bal)}`}</div>` : ''}
      ${canPay ? `<button class="btn ok full" id="payBtn">✅ پرداخت شد (${fmtShort(t.amount * t.rate)})</button><div style="height:9px"></div>` : ''}
      ${canPay && t.amount <= 0 ? `<button class="btn ghost full" id="editAmtBtn">✏️ تعیین مبلغ این قسط</button><div style="height:9px"></div>` : ''}
      ${t.type === 'expense' && t.status === 'paid' ? `<button class="btn ghost full" id="editAmtBtn">✏️ تغییر مبلغ</button><div style="height:9px"></div>` : ''}
      <button class="btn danger full" id="delTxBtn">🗑 حذف تراکنش</button>
    `);
    const pay = document.getElementById('payBtn');
    if (pay) pay.onclick = async () => {
      // قسط با مبلغ متغیر (۰): قبل از پرداخت، مبلغ پرسیده شود (رفع باگ قسط ۰ تومانی)
      if (t.amount <= 0) {
        const v = await UI.prompt('مبلغ این قسط', 'مبلغ پرداخت‌شده این ماه را وارد کن (تومان):', 'number');
        if (!v || !(+v > 0)) return;
        t.amount = +v;
      }
      t.status = 'paid'; t.jdate = jKey(jToday()); // ماه گزارش = ماه واقعی پرداخت
      await persist('transactions');
      // کاهش «تعداد قسط مانده» و پایان خودکار قانون (رفع باگ نادیده‌گرفتن تعداد قسط)
      if (t.ruleId) {
        const r = rules.find(x => x.id === t.ruleId);
        if (r && r.remainingMonths > 0) {
          r.remainingMonths--;
          if (r.remainingMonths === 0) { r.active = false; UI.toast('🎉 همه اقساط این بدهی پرداخت شد!', 'ok'); }
          await persist('rules');
        }
      }
      UI.closeModal(); UI.toast('قسط پرداخت شد ✅', 'ok'); Bridge.vibrate(40);
      Bridge.updateWidget(fmtShort(walletBalance()) + ' تومان', nextInstallmentLine(0), nextInstallmentLine(1), jDateLabel(jKey(jToday())));
      scheduleNotifications();
      render(curTab);
    };
    const edit = document.getElementById('editAmtBtn');
    if (edit) edit.onclick = async () => {
      const v = await UI.prompt('مبلغ جدید', 'مبلغ جدید به تومان:', 'number', String(t.amount));
      if (v && +v > 0) { t.amount = +v; await persist('transactions'); UI.closeModal(); render(curTab); }
    };
    document.getElementById('delTxBtn').onclick = () => {
      UI.confirm('حذف تراکنش', 'این تراکنش حذف شود؟', async () => {
        txs = txs.filter(x => x.id !== t.id);
        await persist('transactions');
        UI.closeModal(); UI.toast('حذف شد', 'ok'); render(curTab);
      });
    };
  }

  /* ── فرم قسط ماهانه (قانون) ── */
  function ruleForm() {
    const cats = categories.filter(c => c.type !== 'income');
    UI.modal('📅 قسط / پرداخت ماهانه', `
      <p style="font-size:11.5px;color:var(--txt2);margin:0 0 12px">هر ماه به‌صورت خودکار و بدون تکرار ساخته می‌شود (اجاره بالاترین اولویت را بگیرد).</p>
      <div class="field"><label>عنوان</label><input id="rTitle" placeholder="مثلاً اجاره خانه / قسط وام"></div>
      <div class="field"><label>مبلغ هر قسط (تومان)</label><input id="rAmount" type="number" dir="ltr" placeholder="0"></div>
      <div class="switch-row"><span>مبلغ متغیر است (هر ماه دستی وارد می‌کنم)</span><label class="switch"><input type="checkbox" id="rVar"><span class="sw"></span></label></div>
      <div class="field-inline">
        <div class="field"><label>روز ماه (جلالی)</label><input id="rDay" type="number" dir="ltr" value="1" min="1" max="31"></div>
        <div class="field"><label>تعداد قسط مانده (۰ = بی‌پایان)</label><input id="rRem" type="number" dir="ltr" value="0" min="0"></div>
      </div>
      <div class="field"><label>اولویت (۱ = مهم‌ترین)</label><div class="seg" id="rPri">${[1,2,3,4,5].map(p => `<button data-p="${p}" class="${p === 1 ? 'on' : ''}">${faDigits(p)}</button>`).join('')}</div></div>
      <div class="switch-row"><span>قسط ضروری</span><label class="switch"><input type="checkbox" id="rEss" checked><span class="sw"></span></label></div>
      <div class="field-inline">
        <div class="field"><label>دسته</label><select id="rCat">${cats.map(c => `<option value="${c.id}">${c.icon} ${esc(c.name)}</option>`).join('')}</select></div>
        <div class="field"><label>کیف پول</label><select id="rWallet">${wallets.map(w => `<option value="${w.id}">${esc(w.name)}</option>`).join('')}</select></div>
      </div>
      <button class="btn full" id="rSaveBtn">ثبت قسط ماهانه</button>
    `);
    let pri = 1;
    document.getElementById('rPri').onclick = e => { const b = e.target.closest('[data-p]'); if (!b) return; pri = +b.dataset.p; [...document.getElementById('rPri').children].forEach(x => x.classList.toggle('on', x === b)); };
    document.getElementById('rSaveBtn').onclick = async () => {
      const title = document.getElementById('rTitle').value.trim();
      const amount = +enDigits(document.getElementById('rAmount').value) || 0;
      const day = Math.min(31, Math.max(1, +document.getElementById('rDay').value || 1));
      if (!title) return UI.toast('عنوان را وارد کنید', 'warn');
      if (!document.getElementById('rVar').checked && amount <= 0) return UI.toast('مبلغ معتبر وارد کنید', 'warn');
      const isRent = title.includes('اجاره');
      const tj = jToday();
      rules.push(normRule({
        title, amount, day, priority: isRent ? 1 : pri, essential: isRent ? true : document.getElementById('rEss').checked,
        variable: document.getElementById('rVar').checked,
        categoryId: document.getElementById('rCat').value, walletId: document.getElementById('rWallet').value,
        remainingMonths: +document.getElementById('rRem').value || 0, active: true, lastKey: '',
        createdMk: jMonthKey(tj), createdD: tj.jd,
      }));
      await persist('rules');
      generateRecurring();
      UI.closeModal(); UI.toast('قسط ماهانه ثبت شد ✅', 'ok');
      scheduleNotifications();
      render(curTab === 'installments' ? 'installments' : curTab);
    };
  }

  /* ── فرم بودجه / هدف / دسته / کیف ── */
  function budgetForm() {
    const mk = jMonthKey(jToday());
    const expCats = categories.filter(c => c.type !== 'income');
    UI.modal('🎯 بودجه دسته — ' + jMonthLabel(mk), `
      <div class="field"><label>دسته</label><select id="bCat">${expCats.map(c => `<option value="${c.id}">${c.icon} ${esc(c.name)}</option>`).join('')}</select></div>
      <div class="field"><label>سقف ماهانه (تومان)</label><input id="bLimit" type="number" dir="ltr" placeholder="0"></div>
      <button class="btn full" id="bSaveBtn">ثبت بودجه</button>
    `);
    document.getElementById('bSaveBtn').onclick = async () => {
      const cid = document.getElementById('bCat').value;
      const limit = +enDigits(document.getElementById('bLimit').value) || 0;
      if (limit <= 0) return UI.toast('سقف معتبر وارد کنید', 'warn');
      const ex = budgets.find(b => b.jmonth === mk && b.categoryId === cid);
      if (ex) ex.limit = limit; else budgets.push({ id: uid('b'), jmonth: mk, categoryId: cid, limit });
      await persist('budgets');
      UI.closeModal(); UI.toast('بودجه ثبت شد ✅', 'ok'); render(curTab === 'budgets' ? 'budgets' : curTab);
    };
  }
  function goalForm() {
    UI.modal('🏆 هدف مالی جدید', `
      <div class="field"><label>عنوان</label><input id="gTitle" placeholder="مثلاً سفر شمال / لپ‌تاپ"></div>
      <div class="field-inline">
        <div class="field"><label>مبلغ هدف (تومان)</label><input id="gTarget" type="number" dir="ltr"></div>
        <div class="field"><label>پس‌انداز فعلی</label><input id="gSaved" type="number" dir="ltr" value="0"></div>
      </div>
      <div class="field"><label>مهلت (جلالی) — اختیاری</label><input id="gDead" dir="ltr" placeholder="۱۴۰۴/۰۶/۰۱"></div>
      <button class="btn full" id="gSaveBtn">ثبت هدف</button>
    `);
    document.getElementById('gSaveBtn').onclick = async () => {
      const title = document.getElementById('gTitle').value.trim();
      const target = +enDigits(document.getElementById('gTarget').value) || 0;
      if (!title || target <= 0) return UI.toast('عنوان و مبلغ هدف را وارد کنید', 'warn');
      let deadlineJ = enDigits(document.getElementById('gDead').value).replace(/[^0-9/]/g, '');
      goals.push(normGoal({ title, target, saved: +enDigits(document.getElementById('gSaved').value) || 0, deadlineJ: /^\d{4}\/\d{2}(\/\d{2})?$/.test(deadlineJ) ? deadlineJ : null }));
      await persist('goals');
      UI.closeModal(); UI.toast('هدف ثبت شد 🏆', 'ok'); render(curTab === 'goals' ? 'goals' : curTab);
    };
  }
  function goalDeposit(id) {
    UI.prompt('پس‌انداز برای هدف', 'چقدر به این هدف اضافه می‌کنی؟ (تومان)', 'number', '', async (v) => {
      const g = goals.find(x => x.id === id); if (!g || !(+v > 0)) return;
      const before = g.target ? Math.round(g.saved / g.target * 100) : 0;
      g.saved += +v;
      await persist('goals');
      const after = g.target ? Math.round(g.saved / g.target * 100) : 0;
      [25, 50, 75, 100].forEach(m => { if (before < m && after >= m) { UI.toast(m === 100 ? '🎉 هدف کامل شد!' : `🎉 ${faDigits(m)}٪ هدف گذشت!`, 'ok'); Bridge.vibrate(60); } });
      render('goals');
    });
  }
  function catForm() {
    UI.modal('＋ دسته جدید', `
      <div class="field"><label>نام</label><input id="cName" placeholder="مثلاً ورزش"></div>
      <div class="field"><label>آیکون (ایموجی)</label><input id="cIcon" value="🧾"></div>
      <div class="field"><label>نوع</label><div class="seg" id="cType"><button data-p="expense" class="on">هزینه</button><button data-p="income">درآمد</button></div></div>
      <div class="switch-row"><span>ضروری (در حالت سختگیرانه مستثنی)</span><label class="switch"><input type="checkbox" id="cEss"><span class="sw"></span></label></div>
      <button class="btn full" id="cSaveBtn">ثبت</button>
    `);
    let type = 'expense';
    document.getElementById('cType').onclick = e => { const b = e.target.closest('[data-p]'); if (!b) return; type = b.dataset.p; [...document.getElementById('cType').children].forEach(x => x.classList.toggle('on', x === b)); };
    document.getElementById('cSaveBtn').onclick = async () => {
      const name = document.getElementById('cName').value.trim();
      if (!name) return UI.toast('نام را وارد کنید', 'warn');
      categories.push({ id: uid('c'), name, icon: document.getElementById('cIcon').value || '🧾', type, essential: document.getElementById('cEss').checked, color: '#22d3ee' });
      await persist('categories');
      UI.closeModal(); UI.toast('دسته اضافه شد ✅', 'ok'); render('settings');
    };
  }
  function walletForm() {
    UI.modal('＋ کیف پول جدید', `
      <div class="field"><label>نام</label><input id="wName" placeholder="مثلاً کارت بانک ملت"></div>
      <div class="field"><label>موجودی اولیه (تومان)</label><input id="wInit" type="number" dir="ltr" value="0"></div>
      <button class="btn full" id="wSaveBtn">ثبت</button>
    `);
    document.getElementById('wSaveBtn').onclick = async () => {
      const name = document.getElementById('wName').value.trim();
      if (!name) return UI.toast('نام را وارد کنید', 'warn');
      wallets.push(normWallet({ name, initial: +document.getElementById('wInit').value || 0 }));
      await persist('wallets');
      UI.closeModal(); UI.toast('کیف پول اضافه شد ✅', 'ok'); render('settings');
    };
  }

  /* ── خروجی‌ها ── */
  async function exportPDF() {
    UI.toast('در حال ساخت PDF…', 'ok');
    try { await document.fonts.ready; } catch (e) {} // اطمینان از بارگذاری فونت فارسی روی بوم
    const mk = jMonthKey(jToday());
    const s = monthStats();
    const c = document.createElement('canvas');
    const W = 1000; c.width = W;
    const x = c.getContext('2d');
    const rows = txs.filter(t => t.jdate.startsWith(mk)).sort((a, b) => (a.jdate || '').localeCompare(b.jdate || ''));
    const H = 340 + Math.max(1, rows.length) * 44 + 140;
    c.height = H;
    // پس‌زمینه روشن برای چاپ
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#0b1120'; x.fillRect(0, 0, W, 120);
    x.fillStyle = '#00e5ff'; x.font = '900 40px Vazirmatn,Tahoma'; x.textAlign = 'center';
    x.fillText('◈ فینوا — گزارش مالی ' + jMonthLabel(mk), W / 2, 75);
    let y = 180;
    x.textAlign = 'right'; x.fillStyle = '#0f1b33'; x.font = '800 26px Vazirmatn,Tahoma';
    x.fillText('خلاصه ماه', W - 60, y); y += 24;
    x.font = '22px Vazirmatn,Tahoma';
    [['درآمد', s.income, '#059669'], ['هزینه', s.expense, '#dc2626'], ['اقساط پرداخت‌شده', s.installPaid, '#0891b2'], ['اقساط مانده', s.installPending, '#d97706'], ['موجودی کل', walletBalance(), '#0f1b33']].forEach(r => {
      x.fillStyle = '#334155'; x.fillText(r[0], W - 60, y + 24);
      x.textAlign = 'left'; x.fillStyle = r[2]; x.fillText(fmtNum(r[1]) + ' تومان', 60, y + 24); x.textAlign = 'right';
      y += 44;
    });
    y += 16; x.fillStyle = '#0f1b33'; x.font = '800 26px Vazirmatn,Tahoma';
    x.fillText('تراکنش‌های ماه (' + faDigits(rows.length) + ')', W - 60, y); y += 34;
    x.font = '20px Vazirmatn,Tahoma';
    x.fillStyle = '#64748b'; x.fillText('عنوان', W - 60, y); x.fillText('تاریخ', W - 420, y); x.textAlign = 'left'; x.fillText('مبلغ', 60, y); x.textAlign = 'right';
    y += 16;
    x.strokeStyle = '#e2e8f0'; x.beginPath(); x.moveTo(50, y); x.lineTo(W - 50, y); x.stroke(); y += 30;
    rows.forEach(t => {
      x.fillStyle = '#1e293b'; x.fillText(t.title.slice(0, 24), W - 60, y);
      x.fillStyle = '#64748b'; x.fillText(faDigits(t.jdate), W - 420, y);
      x.textAlign = 'left'; x.fillStyle = t.type === 'income' ? '#059669' : '#dc2626';
      x.fillText((t.type === 'income' ? '+ ' : '− ') + fmtNum(t.amount * t.rate), 60, y); x.textAlign = 'right';
      y += 40;
    });
    x.fillStyle = '#94a3b8'; x.font = '16px Vazirmatn,Tahoma'; x.textAlign = 'center';
    x.fillText('تولید شده در ' + todayLabel() + ' — اپلیکیشن فینوا', W / 2, H - 40);
    const { b64 } = await Charts.canvasToPdf([c]);
    await Bridge.saveFile('finova-report-' + mk.replace('/', '-') + '.pdf', 'application/pdf', b64);
    UI.toast('PDF ذخیره شد در Downloads ✅', 'ok');
  }
  async function shareCard() {
    try { await document.fonts.ready; } catch (e) {}
    const s = monthStats();
    const c = Charts.reportCardCanvas({ month: jMonthKey(jToday()), balance: walletBalance(), income: s.income, expense: s.expense, installPaid: s.installPaid, installUpcoming: s.installPending, health: healthScore() });
    const b64 = c.toDataURL('image/png').split(',')[1];
    await Bridge.shareFile('finova-card-' + jKey(jToday()).replace(/\//g, '-') + '.png', 'image/png', b64);
  }
  function exportCSV() {
    const head = 'date,type,title,category,amount_toman,wallet,status,tags\n';
    const lines = txs.map(t => {
      const cat = categories.find(c => c.id === t.categoryId);
      const w = wallets.find(w => w.id === t.walletId);
      return [t.jdate, t.type, '"' + (t.title || '').replace(/"/g, '""') + '"', cat ? cat.name : '', Math.round(t.amount * t.rate), w ? w.name : '', t.status, '"' + (t.tags || []).join('|') + '"'].join(',');
    }).join('\n');
    const b64 = Charts.bufToB64(new TextEncoder().encode('\uFEFF' + head + lines).buffer);
    Bridge.saveFile('finova-transactions.csv', 'text/csv', b64);
    UI.toast('CSV ذخیره شد (قابل باز کردن در Excel) ✅', 'ok');
  }
  function shareTextReport() {
    const s = monthStats();
    const txt = `◈ گزارش مالی ${jMonthLabel()} — فینوا\n\nموجودی کل: ${fmtToman(walletBalance())}\nدرآمد: ${fmtToman(s.income)}\nهزینه: ${fmtToman(s.expense)}\nاقساط پرداختی: ${fmtToman(s.installPaid)}\nاقساط مانده: ${fmtToman(s.installPending)}\nامتیاز سلامت: ${faDigits(healthScore())}/۱۰۰\n\n${jDateLabel(jKey(jToday()))}`;
    Bridge.shareText(txt);
  }

  /* ═══ ابزارها ═══ */
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function mdLite(s) {
    let h = esc(s);
    h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/^#{1,4} (.+)$/gm, '<h4>$1</h4>');
    h = h.replace(/^[-•] (.+)$/gm, '<li>$1</li>').replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, '<ul>$1</ul>');
    return h;
  }

  return {
    boot, render, get state() { return state; }, get txs() { return txs; }, get rules() { return rules; },
    get budgets() { return budgets; }, get goals() { return goals; }, get wallets() { return wallets; },
    get categories() { return categories; }, get lastRates() { return lastRates; }, set lastRates(v) { lastRates = v; },
    walletBalance, monthStats, healthScore, scheduleNotifications, generateRecurring, saveState,
    exportPayload, importPayload, backupFile, encryptText, decryptText, strictCheck, persist,
  };
})();

/* ═══ UI — Toast / Modal / Sheet / Prompt ═══ */
const UI = (() => {
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function toast(msg, kind) {
    const w = document.getElementById('toastWrap');
    const t = document.createElement('div');
    t.className = 'toast ' + (kind || '');
    t.textContent = msg;
    w.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = '.4s'; setTimeout(() => t.remove(), 400); }, 2600);
  }
  function modal(title, html) {
    const root = document.getElementById('modalRoot');
    const bd = document.createElement('div');
    bd.className = 'modal-backdrop';
    bd.innerHTML = `<div class="modal"><h3>${title}</h3>${html}</div>`;
    bd.addEventListener('click', e => { if (e.target === bd) bd.remove(); });
    root.appendChild(bd);
    return bd;
  }
  function closeModal() { const m = document.querySelector('#modalRoot .modal-backdrop'); if (m) m.remove(); }
  function sheet(html) {
    const root = document.getElementById('modalRoot');
    const bd = document.createElement('div');
    bd.className = 'sheet-backdrop';
    bd.innerHTML = `<div class="sheet"><div class="sheet-handle"></div>${html}</div>`;
    bd.addEventListener('click', e => { if (e.target === bd) bd.remove(); });
    root.appendChild(bd);
    return bd;
  }
  function confirm(title, text, onYes, onNo) {
    const m = modal('⚠️ ' + title, `
      <p style="font-size:13.5px;line-height:2;white-space:pre-wrap">${text}</p>
      <div class="btn-row"><button class="btn danger" id="cfY">بله، ادامه</button><button class="btn ghost" id="cfN">انصراف</button></div>`);
    m.querySelector('#cfY').onclick = () => { m.remove(); onYes && onYes(); };
    m.querySelector('#cfN').onclick = () => { m.remove(); onNo && onNo(); };
  }
  function prompt(title, text, inputType, preset, cb) {
    return new Promise(res => {
      const m = modal(title, `
        <p style="font-size:12.5px;color:var(--txt2);line-height:1.9">${text}</p>
        <div class="field"><input id="prInp" type="${inputType || 'text'}" dir="${inputType === 'password' || inputType === 'number' ? 'ltr' : 'auto'}" value="${esc(preset || '')}"></div>
        <div class="btn-row"><button class="btn" id="prY">تأیید</button><button class="btn ghost" id="prN">انصراف</button></div>`);
      const inp = m.querySelector('#prInp');
      setTimeout(() => inp.focus(), 120);
      const done = (v) => { m.remove(); cb && cb(v); res(v); };
      m.querySelector('#prY').onclick = () => done(inp.value);
      m.querySelector('#prN').onclick = () => done(null);
      inp.onkeydown = e => { if (e.key === 'Enter') done(inp.value); };
    });
  }
  return { toast, modal, closeModal, sheet, confirm, prompt };
})();

/* ═══ شروع ═══ */
document.addEventListener('DOMContentLoaded', () => App.boot());
