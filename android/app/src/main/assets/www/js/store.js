/* ═══════════ لایه ذخیره‌سازی — IndexedDB با مهاجرت و پاک‌سازی واقعی ═══════════ */
const Store = (() => {
  const DB_NAME = 'finova-db';
  const DB_VER = 4;
  let _db = null;

  function openOnce(timeoutMs) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const done = (fn, arg) => { if (!settled) { settled = true; fn(arg); } };
      const timer = setTimeout(() => done(reject, new Error('open-timeout')), timeoutMs || 3000);
      try {
        const req = indexedDB.open(DB_NAME, DB_VER);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          const oldV = e.oldVersion || 0;
          // --- مهاجرت از نسخه‌های قدیمی (localStorage finova-storage-v1 → IDB) ---
          try {
            if (oldV < 1) {
              db.createObjectStore('kv');
              db.createObjectStore('transactions', { keyPath: 'id' });
              db.createObjectStore('rules', { keyPath: 'id' });
              db.createObjectStore('budgets', { keyPath: 'id' });
              db.createObjectStore('goals', { keyPath: 'id' });
              db.createObjectStore('wallets', { keyPath: 'id' });
              db.createObjectStore('categories', { keyPath: 'id' });
              db.createObjectStore('receipts', { keyPath: 'id' });
              db.createObjectStore('backups', { keyPath: 'id' });
              db.createObjectStore('rates', { keyPath: 'key' });
            }
            // v2+: تاریخچه قیمت‌ها — همیشه بررسی می‌شود تا نصب تازه و دیتابیس‌های ناقص هم ساخته شوند (رفع باگ)
            if (!db.objectStoreNames.contains('rateHistory')) db.createObjectStore('rateHistory', { keyPath: 'day' });
            // v4+: اسنپ‌شات زنده قیمت‌ها داخل‌روزی (نمودار «زنده» تحلیل سرمایه‌گذاری)
            if (!db.objectStoreNames.contains('rateSnap')) db.createObjectStore('rateSnap', { keyPath: 'ts' });
          } catch (err) { console.error('migrate err', err); }
        };
        req.onsuccess = () => { clearTimeout(timer); done(resolve, req.result); };
        req.onerror = () => { clearTimeout(timer); done(reject, req.error || new Error('open-failed')); };
        req.onblocked = () => { /* صبر می‌کنیم؛ timeout خودش می‌گیرد */ };
      } catch (err) { clearTimeout(timer); done(reject, err); }
    });
  }

  async function open() {
    // تلاش مجدد با فاصله — برخی مرورگرها در اولین open بعد از لود خطای گذرا می‌دهند
    const delays = [0, 250, 700, 1500];
    let lastErr = null;
    for (let i = 0; i < delays.length; i++) {
      if (delays[i]) await new Promise(r => setTimeout(r, delays[i]));
      try {
        const db = await openOnce(3000);
        _db = db;
        db.onversionchange = () => { try { db.close(); } catch (e) {} };
        return db;
      } catch (e) { lastErr = e; console.warn('IDB open attempt', i + 1, 'failed:', e); }
    }
    throw lastErr || new Error('idb-unavailable');
  }

  function tx(store, mode) { return _db.transaction(store, mode).objectStore(store); }
  function prom(req) {
    return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
  }

  return {
    open,
    async get(store, key) { return prom(tx(store, 'readonly').get(key)); },
    async put(store, val, key) { return key !== undefined ? prom(tx(store, 'readwrite').put(val, key)) : prom(tx(store, 'readwrite').put(val)); },
    async del(store, key) { return prom(tx(store, 'readwrite').delete(key)); },
    async all(store) { return prom(tx(store, 'readonly').getAll()); },
    async allKeys(store) { return prom(tx(store, 'readonly').getAllKeys()); },
    async clear(store) { return prom(tx(store, 'readwrite').clear()); },
    async bulkPut(store, arr) {
      return new Promise((res, rej) => {
        const t = _db.transaction(store, 'readwrite');
        const os = t.objectStore(store);
        arr.forEach(v => os.put(v));
        t.oncomplete = () => res(true); t.onerror = () => rej(t.error);
      });
    },
    // پاک‌سازی کامل و واقعی همه داده‌ها (رفع باگ «پاک نشدن با ری‌استارت»)
    async wipeAll() {
      const stores = ['kv','transactions','rules','budgets','goals','wallets','categories','receipts','backups','rates','rateHistory','rateSnap'];
      for (const s of stores) { try { await this.clear(s); } catch (e) { console.warn('wipe', s, e); } }
      try { localStorage.removeItem('finova-storage-v1'); localStorage.clear(); } catch (e) {}
      try { sessionStorage.clear(); } catch (e) {}
      try { indexedDB.deleteDatabase('finova'); } catch (e) {} // نسخه قدیمی اگر بود
      return true;
    },
    // درآوردن داده‌های قدیمی localStorage و انتقال به IDB
    async migrateLegacyLocalStorage() {
      try {
        const raw = localStorage.getItem('finova-storage-v1');
        if (!raw) return false;
        const data = JSON.parse(raw);
        if (data && data.state) {
          const s = data.state;
          if (Array.isArray(s.transactions) && s.transactions.length && (await this.all('transactions')).length === 0)
            await this.bulkPut('transactions', s.transactions.map(normTx));
          if (Array.isArray(s.wallets) && s.wallets.length && (await this.all('wallets')).length === 0)
            await this.bulkPut('wallets', s.wallets.map(normWallet));
          if (Array.isArray(s.goals) && s.goals.length && (await this.all('goals')).length === 0)
            await this.bulkPut('goals', s.goals.map(normGoal));
          if (s.settings) await this.put('kv', s.settings, 'legacySettings');
          await this.put('kv', true, 'legacyMigrated');
          return true;
        }
      } catch (e) { console.warn('legacy migrate skip', e); }
      return false;
    },
  };
})();

function uid(p) { return (p || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function normTx(t) {
  const base = {
    id: t.id || uid('tx'), type: t.type || 'expense', title: t.title || '',
    amount: +(t.amount) || 0, currency: t.currency || 'TMN', rate: +(t.rate) || 1,
    categoryId: t.categoryId === undefined ? null : t.categoryId, walletId: t.walletId === undefined ? null : t.walletId,
    jdate: t.jdate || jKey(jToday()), priority: +(t.priority) || 3,
    essential: !!t.essential, tags: Array.isArray(t.tags) ? t.tags : [],
    note: t.note || '', status: t.status || 'paid',
    dueJdate: t.dueJdate || null, ruleId: t.ruleId || null, seq: +(t.seq) || 0,
    createdAt: t.createdAt || Date.now(),
  };
  const r = Object.assign(base, t || {});
  if (!r.jdate) r.jdate = jKey(jToday()); // رفع باگ: تراکنش بدون تاریخ باعث کرش فیلتر ماه می‌شد
  r.amount = +(r.amount) || 0; r.rate = +(r.rate) || 1; r.priority = +(r.priority) || 3;
  if (!Array.isArray(r.tags)) r.tags = [];
  return r;
}
function normWallet(w) { return Object.assign({ id: w.id || uid('w'), name: w.name || 'کیف پول', kind: w.kind || 'cash', initial: +w.initial || 0 }, w); }
function normGoal(g) { return Object.assign({ id: g.id || uid('g'), title: g.title || 'هدف', target: +g.target || 0, saved: +g.saved || 0, deadlineJ: g.deadlineJ || null, note: g.note || '', createdJ: g.createdJ || jKey(jToday()) }, g); }
function normRule(r) { return Object.assign({ id: r.id || uid('r'), title: r.title || 'قسط', amount: +(r.amount) || 0, variable: !!r.variable, day: +(r.day) || 1, priority: +(r.priority) || 3, essential: !!r.essential, categoryId: r.categoryId === undefined ? null : r.categoryId, walletId: r.walletId === undefined ? null : r.walletId, active: r.active !== false, remainingMonths: +(r.remainingMonths) || 0, lastKey: r.lastKey || '', createdMk: r.createdMk || jMonthKey(jToday()), createdD: +(r.createdD) || 1, note: r.note || '' }, r); }
