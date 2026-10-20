/* ═══════════ هوش مصنوعی دوگانه (آفلاین + آنلاین) + قیمت لحظه‌ای واقعی طلا و دلار ═══════════ */
const AI = (() => {

  /* ─────────── دریافت قیمت لحظه‌ای واقعی ───────────
     منبع اصلی: TGJU (۶ آینه — server mirror list) | پشتیبان: نوبیتکس | پشتیبان دوم: مقادیر دستی کاربر
     همه قیمت‌ها ریال هستند و به تومان تبدیل می‌شوند (÷۱۰)؛ انس جهانی به دلار باقی می‌ماند. */
  const TGJU_MIRRORS = [
    'https://call1.tgju.org/ajax.json',
    'https://call2.tgju.org/ajax.json',
    'https://call3.tgju.org/ajax.json',
    'https://call4.tgju.org/ajax.json',
    'https://call5.tgju.org/ajax.json',
    'https://call6.tgju.org/ajax.json',
  ];
  const NUM = (s) => parseFloat(String(s == null ? '' : s).replace(/,/g, '')) || 0;

  /* استخراج کامل یک ردیف TGJU: قیمت + تغییر + درصد + سقف/کف + ساعت */
  function tgjuRow(it, toToman) {
    if (!it || NUM(it.p) <= 0) return null;
    const k = toToman ? 10 : 1;
    return {
      v: Math.round(NUM(it.p) / k),
      d: NUM(it.d) / k,
      dp: +it.dp || 0,
      up: (+it.dp || 0) >= 0,
      h: NUM(it.h) / k, l: NUM(it.l) / k,
      t: it.t_en || '',
    };
  }
  function parseTgju(items) {
    const out = {};
    const g18 = tgjuRow(items['geram18'], true);
    if (g18) out.gold18 = g18;
    const coin = tgjuRow(items['sekee'], true);
    if (coin) out.goldCoin = coin;
    const nim = tgjuRow(items['nim'], true);
    if (nim) out.nim = nim;
    const rob = tgjuRow(items['rob'], true);
    if (rob) out.rob = rob;
    const mes = tgjuRow(items['mesghal'], true);
    if (mes) out.mesghal = mes;
    const usd = tgjuRow(items['price_dollar_rl'], true);
    if (usd) out.usd = usd;
    const ons = tgjuRow(items['ons'], false); // انس جهانی به دلار — بدون تبدیل
    if (ons) out.ounce = ons;
    return out;
  }

  async function fetchRates() {
    const cached = await Store.get('rates', 'latest');
    const result = { usd: null, gold18: null, goldCoin: null, nim: null, rob: null, mesghal: null, ounce: null, ts: 0, source: '', stale: false, live: {} };

    // ۱) TGJU — تلاش روی آینه‌های متعدد تا اولین پاسخ سالم
    for (let i = 0; i < TGJU_MIRRORS.length; i++) {
      try {
        const r = await Bridge.http(TGJU_MIRRORS[i], 'GET', null, null, 9000);
        if (r.ok && r.body && r.body.length > 500) {
          const j = JSON.parse(r.body);
          const parsed = parseTgju((j && j.current) || {});
          if (parsed.gold18 || parsed.usd || parsed.goldCoin) {
            result.live = parsed; result.source = 'TGJU';
            break;
          }
        }
      } catch (e) { /* آینه بعدی */ }
    }
    const lv = result.live;
    if (lv.gold18) { result.gold18 = lv.gold18.v; result.ts = Date.now(); }
    if (lv.goldCoin) result.goldCoin = lv.goldCoin.v;
    if (lv.nim) result.nim = lv.nim.v;
    if (lv.rob) result.rob = lv.rob.v;
    if (lv.mesghal) result.mesghal = lv.mesghal.v;
    if (lv.usd) { result.usd = lv.usd.v; result.ts = Math.max(result.ts, Date.now()); }
    if (lv.ounce) result.ounce = lv.ounce.v;

    // ۲) نوبیتکس — پشتیبان دلار/تتر به ریال
    if (!result.usd) {
      try {
        const r = await Bridge.http('https://api.nobitex.ir/market/stats?srcCurrency=usdt,btc&dstCurrency=rls', 'GET', null, null, 12000);
        if (r.ok && r.body) {
          const j = JSON.parse(r.body);
          if (j && j.status === 'ok' && j.stats && j.stats.usdt) {
            const rls = parseFloat(j.stats.usdt.latest || j.stats.usdt.bestSell || 0);
            if (rls > 0) { result.usd = Math.round(rls / 10); result.ts = Date.now(); result.source = result.source ? result.source + '+نوبیتکس' : 'نوبیتکس'; }
          }
        }
      } catch (e) {}
    }
    // ۳) مقادیر دستی کاربر اگر API کار نکرد
    const st = App && App.state ? App.state : {};
    if (!result.usd && st.manualUSD) { result.usd = +st.manualUSD; result.source = 'دستی'; }
    if (!result.gold18 && st.manualGold) { result.gold18 = +st.manualGold; result.source = 'دستی'; }

    // ۴) کش: آخرین قیمت + تاریخچه روزانه + اسنپ‌شات زنده داخل‌روزی
    if (result.usd || result.gold18) {
      const val = { key: 'latest', ...result, savedAt: Date.now() };
      await Store.put('rates', val);            // keyPath inline ('key') — کلید صریح DataError می‌داد (رفع باگ قیمت‌ها)
      const day = jKey(jToday());
      await Store.put('rateHistory', { day, usd: result.usd, gold18: result.gold18, goldCoin: result.goldCoin, ounce: result.ounce, ts: Date.now() });
      // اسنپ‌شات زنده — حداکثر هر ۲ دقیقه یک‌بار، سقف ۵۰۰ رکورد (نمودار «زنده»)
      try {
        const snaps = ((await Store.all('rateSnap')) || []).sort((a, b) => a.ts - b.ts);
        const last = snaps[snaps.length - 1];
        if (!last || Date.now() - last.ts >= 120000) {
          const snap = { ts: Date.now(), usd: result.usd || 0, gold18: result.gold18 || 0, goldCoin: result.goldCoin || 0, ounce: result.ounce || 0 };
          await Store.put('rateSnap', snap);
          snaps.push(snap);
          const over = snaps.length - 500;
          for (let k = 0; k < over; k++) { try { await Store.del('rateSnap', snaps[k].ts); } catch (e2) {} }
        }
      } catch (e) {}
      return val;
    }
    if (cached) return { ...cached, stale: true, source: (cached.source || '') + ' (کش)' };
    return result;
  }
  async function rateHistory() {
    const rows = await Store.all('rateHistory');
    rows.sort((a, b) => a.day.localeCompare(b.day));
    return rows.slice(-120);
  }
  async function snapHistory() {
    const rows = await Store.all('rateSnap');
    rows.sort((a, b) => a.ts - b.ts);
    return rows.slice(-500);
  }

  /* ─────────── موتور آفلاین — تحلیلگر قاعده‌محور ─────────── */
  function offlineAnswer(question) {
    const d = collectData();
    const q = (question || '').replace(/\s+/g, ' ');
    const out = [];
    const pick = (...words) => words.some(w => q.includes(w));

    if (pick('قسط', 'اقساط', 'بدهی', 'وام')) out.push(installmentAdvice(d));
    if (pick('پس‌انداز', 'ذخیره', 'حساب')) out.push(savingAdvice(d));
    if (pick('بودجه', 'خرج', 'هزینه', 'مصرف')) out.push(budgetAdvice(d));
    if (pick('سرمایه‌گذاری', 'طلا', 'دلار', 'سکه', 'بورس', 'ارز')) out.push(investAdviceOffline(d));
    if (pick('درآمد', 'حقوق')) out.push(incomeAdvice(d));
    if (pick('سلامت', 'وضعیت', 'امتیاز')) out.push(healthAdvice(d));
    if (!out.length) out.push(summaryAdvice(d));
    return out.join('\n\n');
  }

  function collectData() {
    const s = App.state;
    const txs = App.txs || [];
    const month = jMonthKey(jToday());
    const thisMonth = txs.filter(t => t.jdate.startsWith(month));
    const income = thisMonth.filter(t => t.type === 'income' && t.status === 'paid').reduce((a, t) => a + t.amount * t.rate, 0);
    const expense = thisMonth.filter(t => t.type === 'expense' && t.status === 'paid').reduce((a, t) => a + t.amount * t.rate, 0);
    const installPaid = thisMonth.filter(t => t.type === 'installment' && t.status === 'paid').reduce((a, t) => a + t.amount * t.rate, 0);
    const pending = txs.filter(t => t.type === 'installment' && t.status === 'pending')
      .sort((a, b) => instPriority(b) - instPriority(a));
    const totalPending = pending.reduce((a, t) => a + t.amount * t.rate, 0);
    const balance = App.walletBalance();
    const rules = (App.rules || []).filter(r => r.active);
    const avg3 = avgExpense3m(txs);
    return { s, txs, month, income, expense, installPaid, pending, totalPending, balance, rules, avg3 };
  }
  function instPriority(t) { return (t.essential ? 100 : 0) + (10 - (+t.priority || 3) * 2) + (t.title.includes('اجاره') ? 50 : 0); }
  function avgExpense3m(txs) {
    const now = jToday();
    let sum = 0, n = 0;
    for (let i = 1; i <= 3; i++) {
      const mk = jMonthKey(addJMonths(now, -i));
      const e = txs.filter(t => t.jdate.startsWith(mk) && (t.type === 'expense') && t.status === 'paid').reduce((a, t) => a + t.amount * t.rate, 0);
      if (e > 0) { sum += e; n++; }
    }
    return n ? sum / n : 0;
  }

  function installmentAdvice(d) {
    if (!d.pending.length) return '✅ در حال حاضر هیچ قسط پرداخت‌نشده‌ای نداری. عالی!';
    const lines = ['📌 **اولویت‌بندی اقساط تو:**'];
    d.pending.slice(0, 6).forEach((t, i) => {
      const days = t.dueJdate ? daysUntilJ(t.dueJdate) : 99;
      const urgency = days < 0 ? '⚠️ معوق!' : days <= 3 ? '🔴 خیلی فوری' : days <= 7 ? '🟠 فوری' : '🟢 عادی';
      lines.push(`${i + 1}. ${t.title} — ${fmtToman(t.amount * t.rate)} ${t.dueJdate ? '(' + jDateLabel(t.dueJdate) + ')' : ''} ${urgency}`);
    });
    if (d.balance < d.totalPending)
      lines.push(`\n⚠️ موجودی تو (${fmtToman(d.balance)}) از مجموع اقساط (${fmtToman(d.totalPending)}) کمتر است! پیشنهاد: ${suggestCut(d)}`);
    else
      lines.push(`\n💡 بعد از پرداخت همه اقساط، ${fmtToman(d.balance - d.totalPending)} برای هزینه‌های ماه باقی می‌ماند.`);
    return lines.join('\n');
  }
  function suggestCut(d) {
    const cats = {};
    d.txs.filter(t => t.type === 'expense' && t.status === 'paid' && !t.essential).forEach(t => { cats[t.categoryId] = (cats[t.categoryId] || 0) + t.amount * t.rate; });
    const top = Object.entries(cats).sort((a, b) => b[1] - a[1])[0];
    if (!top) return 'کاهش هزینه‌های غیرضروری';
    const cat = (App.categories || []).find(c => c.id === top[0]);
    return `کم کردن هزینه‌های «${cat ? cat.name : 'متفرقه'}» که این ماه حدود ${fmtShort(top[1])} تومان بوده`;
  }
  function savingAdvice(d) {
    const rate = d.income > 0 ? Math.round(((d.income - d.expense - d.installPaid) / d.income) * 100) : 0;
    let msg = `💰 **وضعیت پس‌انداز:**\nنرخ پس‌انداز این ماه: ${faDigits(rate)}٪ `;
    msg += rate >= 20 ? '(عالی 👏)\n' : rate >= 10 ? '(قابل قبول — سعی کن به ۲۰٪ برسانی)\n' : rate >= 0 ? '(کم است! هدف: حداقل ۱۰ تا ۲۰٪ درآمد)\n' : '(منفی! داری بیشتر از درآمدت خرج می‌کنی 🚨)\n';
    if (d.income > 0) msg += `\nپیشنهاد: ${fmtToman(Math.round(d.income * 0.2))} را اول ماه جدا کن (قانون ۲۰٪).`;
    if (d.avg3 > 0) msg += `\nمیانگین هزینه ۳ ماه اخیر: ${fmtToman(d.avg3)} — پس یک صندوق اضطراری ۳ ماهه می‌شود ${fmtToman(Math.round(d.avg3 * 3))}.`;
    const goals = App.goals || [];
    if (goals.length) {
      const g = goals.sort((a, b) => (b.target - b.saved) - (a.target - a.saved))[0];
      msg += `\n🎯 نزدیک‌ترین هدف: «${g.title}» — مانده ${fmtShort(g.target - g.saved)} تومان. ماهی ${fmtToman(Math.ceil((g.target - g.saved) / Math.max(1, monthsLeft(g))))} کنار بگذاری به آن می‌رسی.`;
    }
    return msg;
  }
  function monthsLeft(g) {
    if (!g.deadlineJ) return 6;
    return Math.max(1, Math.round(daysUntilJ(g.deadlineJ) / 30));
  }
  function budgetAdvice(d) {
    const lines = ['🧾 **وضعیت بودجه این ماه:**'];
    const bs = (App.budgets || []).filter(b => b.jmonth === d.month);
    if (!bs.length) return 'هنوز بودجه‌ای تعیین نکرده‌ای. از بخش «بودجه‌بندی» برای هر دسته سقف خرج تعیین کن — اولین قدم نظم مالی!';
    bs.forEach(b => {
      const spent = d.txs.filter(t => t.type === 'expense' && t.status === 'paid' && t.jdate.startsWith(d.month) && t.categoryId === b.categoryId).reduce((a, t) => a + t.amount * t.rate, 0);
      const cat = (App.categories || []).find(c => c.id === b.categoryId);
      const pct = b.limit ? Math.round(spent / b.limit * 100) : 0;
      const icon = pct > 100 ? '🚨' : pct > 80 ? '⚠️' : '✅';
      lines.push(`${icon} ${cat ? cat.name : 'دسته'}: ${fmtShort(spent)} از ${fmtShort(b.limit)} (${faDigits(pct)}٪)`);
    });
    return lines.join('\n');
  }
  function incomeAdvice(d) {
    return `📈 **درآمد:**\nدرآمد ثبت‌شده این ماه: ${fmtToman(d.income)}\nهزینه + قسط: ${fmtToman(d.expense + d.installPaid)}\nخالص: ${d.income - d.expense - d.installPaid >= 0 ? '✅ +' : '🚨 '}${fmtToman(d.income - d.expense - d.installPaid)}\n\n${d.rules.filter(r => r.active).length ? 'منابع قسط فعال: ' + faDigits(d.rules.filter(r => r.active).length) + ' مورد' : ''}`;
  }
  function healthAdvice(d) {
    const sc = App.healthScore();
    const lbl = sc >= 75 ? 'وضعیتت خوب است 💪' : sc >= 50 ? 'متوسط — جای بهتر شدن هست' : 'نیاز به اقدام فوری 🚨';
    return `❤️ **امتیاز سلامت مالی: ${faDigits(sc)} از ۱۰۰**\n${lbl}\n\n` +
      (sc < 75 ? 'برای بهتر شدن:\n• نرخ پس‌انداز را به ۲۰٪ برسان\n• بودجه دسته‌های پرخرج را کاهش بده\n• اقساط را قبل از موعد پرداخت کن' : 'همین مسیر را ادامه بده! صندوق اضطراری‌ات را تا ۳ ماه هزینه زندگی کامل کن.');
  }
  function investAdviceOffline(d) {
    return `📊 **سرمایه‌گذاری (آفلاین):**\nبرای تحلیل لحظه‌ای طلا و دلار به تب «هوش مصنوعی آنلاین» یا «تحلیل سرمایه‌گذاری» برو (نیاز به اینترنت).\n\nاصول کلی:\n• طلا در بلندمدت سپر تورم است؛ دلار نوسان کوتاه‌مدت بیشتری دارد.\n• هرگز همه پس‌اندازت را یکجا وارد نکن — گام‌به‌گام (DCA) بخر.\n• اول صندوق اضطراری (۳ ماه خرج)، بعد سرمایه‌گذاری.`;
  }
  function summaryAdvice(d) {
    const parts = ['🤖 **خلاصه وضعیت مالی تو:**\n'];
    parts.push(`• موجودی کل: ${fmtToman(d.balance)}`);
    parts.push(`• درآمد ماه: ${fmtToman(d.income)} | هزینه: ${fmtToman(d.expense)}`);
    parts.push(`• اقساط مانده: ${faDigits(d.pending.length)} قسط به ارزش ${fmtToman(d.totalPending)}`);
    if (d.pending.length) parts.push(`• فوری‌ترین: «${d.pending[0].title}» ${d.pending[0].dueJdate ? '— ' + jDateLabel(d.pending[0].dueJdate) : ''}`);
    parts.push(`• امتیاز سلامت: ${faDigits(App.healthScore())}/۱۰۰`);
    parts.push('\nسؤال دقیق‌تری بپرس: «اقساطم را چطور مدیریت کنم؟»، «چطور پس‌انداز کنم؟»، «بودجه‌ام چطوره؟»');
    return parts.join('\n');
  }

  /* ─────────── موتور آنلاین — LLM واقعی، پیش‌فرض رایگان و بدون کلید ─────────── */
  const AI_DEFAULT_BASE = 'https://text.pollinations.ai/openai';
  const AI_DEFAULT_MODEL = 'openai';

  // سرویس‌هایی که بدون کلید API هرگز کار نمی‌کنند (تنظیمات خراب قدیمی → بازنشانی خودکار)
  const KEY_REQUIRED_HOSTS = ['api.openai.com', 'openrouter.ai', 'api.groq.com', 'api.anthropic.com', 'generativelanguage.googleapis.com', 'api.deepseek.com', 'api.x.ai', 'api.together.xyz', 'api.mistral.ai', 'api.cohere.ai', 'api.cohere.com'];

  function isKeyRequired(url) {
    try { const h = new URL(url).hostname.toLowerCase(); return KEY_REQUIRED_HOSTS.some(k => h === k || h.endsWith('.' + k)); }
    catch (e) { return /openai|openrouter|groq|anthropic|deepseek|mistral|cohere/i.test(url); }
  }

  function aiConfig() {
    const st = App.state || {};
    let customURL = st.aiBaseURL && String(st.aiBaseURL).trim() ? String(st.aiBaseURL).trim() : '';
    const apiKey = st.aiApiKey || '';
    // رفع خودکار تنظیمات خراب: سرویس شخصیِ نیازمند کلید بدون کلید → حذف و برگشت به سرویس رایگان
    if (customURL && !apiKey && isKeyRequired(customURL)) {
      customURL = '';
      st.aiBaseURL = ''; st.aiModel = '';
      if (App.saveState) App.saveState();
    }
    const custom = !!customURL;
    return {
      baseURL: (custom ? customURL : AI_DEFAULT_BASE).replace(/\/+$/, ''),
      apiKey: apiKey,
      model: (st.aiModel && String(st.aiModel).trim()) || AI_DEFAULT_MODEL,
      isDefault: !custom,
      label: custom ? 'سرویس شخصی' : 'سرویس رایگان فینوا',
      // وب پیش‌نمایش → همان‌مبدأ سرور فینوا (/api/ai/complete)؛ APK/سرویس شخصی → OpenAI-compatible
      transport: custom ? 'openai' : (Bridge.hasNative() ? 'openai' : 'server'),
    };
  }

  // تبدیل هر خطای خام (اغلب انگلیسی) به پیام فارسی قابل فهم
  function faError(status, rawBody, wasDefault) {
    const raw = String(rawBody || '').slice(0, 400);
    const low = raw.toLowerCase();
    let msg = '';
    if (status === 402 || low.includes('free_limit') || low.includes('rate limit') || low.includes('too many requests') || status === 429)
      msg = 'سرویس رایگان هوش مصنوعی الان شلوغ است (محدودیت هر ۳۰ ثانیه). ۳۰ ثانیه صبر کن و دوباره امتحان کن — یا از تنظیمات یک سرویس شخصی معرفی کن.';
    else if (status === 401 || status === 403 || low.includes('api key') || low.includes('unauthorized') || low.includes('forbidden'))
      msg = wasDefault ? 'دسترسی به سرویس رایگان موقتاً محدود شده. از تنظیمات می‌توانی سرویس شخصی (OpenAI/OpenRouter) معرفی کنی.' : 'کلید API معتبر نیست یا منقضی شده است. آن را در تنظیمات بررسی کن یا فیلدها را خالی بگذار تا سرویس رایگان فینوا فعال شود.';
    else if (status === 0 || low.includes('timeout') || low.includes('err:'))
      msg = 'اتصال به اینترنت برقرار نشد. اینترنت گوشی را بررسی کن و دوباره تلاش کن.';
    else if (status >= 500)
      msg = 'سرور هوش مصنوعی موقتاً در دسترس نیست. چند لحظه بعد دوباره امتحان کن.';
    else if (low.includes('insufficient') || low.includes('quota') || low.includes('billing') || status === 402)
      msg = 'اعتبار سرویس تمام شده است. از تنظیمات سرویس دیگری معرفی کن یا فیلدها را خالی کن تا سرویس رایگان فعال شود.';
    if (!msg) msg = 'خطای غیرمنتظره در ارتباط با هوش مصنوعی' + (status ? ' (کد ' + faDigits(status) + ')' : '') + '. دوباره تلاش کن.';
    return msg;
  }
  function buildContext() {
    const d = collectData();
    const cats = (App.categories || []).map(c => c.name).join('، ');
    const pend = d.pending.slice(0, 10).map(t => ({ عنوان: t.title, مبلغ: Math.round(t.amount * t.rate), موعد: t.dueJdate || 'نامشدد', اولویت: t.priority, ضروری: t.essential ? 'بله' : 'خیر' }));
    const rates = App.lastRates ? { دلار_تومان: App.lastRates.usd, طلا_۱۸_تومان: App.lastRates.gold18, سکه_تومان: App.lastRates.goldCoin } : null;
    return {
      ماه: jMonthLabel(d.month),
      موجودی_کل_تومان: d.balance,
      درآمد_ماه_تومان: d.income,
      هزینه_ماه_تومان: d.expense,
      اقساط_پرداخت_شده: d.installPaid,
      میانگین_هزینه_۳ماه: Math.round(d.avg3),
      اقساط_مانده: pend,
      مجموع_اقساط_مانده: d.totalPending,
      اهداف: (App.goals || []).map(g => ({ عنوان: g.title, هدف: g.target, پس‌انداز: g.saved, مهلت: g.deadlineJ || '-' })),
      بودجه‌ها: (App.budgets || []).filter(b => b.jmonth === d.month).map(b => {
        const spent = d.txs.filter(t => t.type === 'expense' && t.status === 'paid' && t.categoryId === b.categoryId).reduce((a, t) => a + t.amount * t.rate, 0);
        const cat = (App.categories || []).find(c => c.id === b.categoryId);
        return { دسته: cat ? cat.name : '?', سقف: b.limit, خرج‌شده: Math.round(spent) };
      }),
      دسته‌ها: cats,
      قیمت_لحظه‌ای: rates,
      امتیاز_سلامت: App.healthScore(),
    };
  }
  async function onlineAnswer(question, onProgress) {
    const cfg = aiConfig();
    if (onProgress) onProgress('در حال جمع‌آوری داده‌های مالی…');
    const ctx = buildContext();
    const sys = 'تو «دستیار مالی فینوا» هستی؛ یک مشاور مالی خبره برای کاربر ایرانی. همیشه فقط فارسی، روان و با لحن دوستانه و کاربردی جواب بده. از اعداد واقعی context استفاده کن و مبالغ را با تومان و جداکننده هزارگان بنویس. پاسخ را ساختارمند با تیترها (با ایموجی) و فهرست بده و از علامت ** برای پررنگ کردن استفاده کن. اگر کاربر درباره اولویت اقساط پرسید بر اساس ضروری بودن، موعد و مبلغ اولویت بده (اجاره بالاترین اولویت). اگر درباره سرمایه‌گذاری پرسید بر اساس قیمت‌های لحظه‌ای context و تحلیل روند طلا و دلار جواب بده و ریسک‌ها را بگو. اگر داده کافی نیست، محتاطانه و شفاف بگو.';
    const messages = [
      { role: 'system', content: sys },
      { role: 'user', content: 'داده‌های مالی من (JSON):\n' + JSON.stringify(ctx, null, 1) + '\n\nسؤال من: ' + question },
    ];
    if (onProgress) onProgress('در حال گفتگو با هوش مصنوعی…');
    let txt = null;
    if (cfg.transport === 'server') {
      // حالت وب: از سرور همان‌مبدأ فینوا (رایگان، بدون کلید، بدون مشکل CORS)
      const r = await Bridge.http('/api/ai/complete', 'POST', { 'Content-Type': 'application/json' }, JSON.stringify({ messages }), 110000);
      if (!r.ok) throw new Error(faError(r.status, r.body, true));
      try {
        const j = JSON.parse(r.body);
        txt = j.content || (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
        if (!txt) throw new Error('empty');
      } catch (e) { if (txt === null && String(e.message) === 'empty') throw new Error('پاسخ خالی از سرور دریافت شد — دوباره تلاش کن.'); }
      if (!txt) throw new Error('پاسخ نامعتبر از سرور فینوا');
    } else {
      // حالت بومی/سرویس شخصی: OpenAI-compatible (پیش‌فرض رایگان = pollinations)
      const callOpenAI = async (base, model, key) => {
        const headers = { 'Content-Type': 'application/json' };
        if (key) headers['Authorization'] = 'Bearer ' + key;
        const url = /\/chat\/completions$/.test(base) ? base : base + '/chat/completions';
        const body = JSON.stringify({ model: model, messages, temperature: 0.6, max_tokens: 1600 });
        return Bridge.http(url, 'POST', headers, body, 110000);
      };
      const parse = (r) => {
        if (!r.ok) throw { status: r.status, body: r.body };
        try {
          const j = JSON.parse(r.body);
          const t = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
          if (!t) throw { status: 0, body: '' };
          return t;
        } catch (e) { if (e && e.status !== undefined) throw e; throw { status: 0, body: String(r.body).slice(0, 200) }; }
      };
      try {
        txt = parse(await callOpenAI(cfg.baseURL, cfg.model, cfg.apiKey));
      } catch (err1) {
        // زنجیره جایگزین: اگر سرویس شخصی خراب بود → سرویس رایگان؛ اگر رایگان بود → یک تلاش مجدد بعد از ۳ ثانیه
        if (!cfg.isDefault) {
          if (onProgress) onProgress('سرویس شخصی پاسخ نداد — تلاش با سرویس رایگان فینوا…');
          try {
            txt = parse(await callOpenAI(AI_DEFAULT_BASE, AI_DEFAULT_MODEL, ''));
          } catch (err2) { throw new Error(faError(err2.status, err2.body, true)); }
        } else if (err1 && (err1.status === 402 || err1.status === 429 || String(err1.body || '').toLowerCase().includes('free_limit'))) {
          // محدودیت نرخ → یک تلاش مجدد با فاصله
          if (onProgress) onProgress('سرویس شلوغ است — تلاش مجدد…');
          await new Promise(r2 => setTimeout(r2, 4000));
          try { txt = parse(await callOpenAI(cfg.baseURL, cfg.model, cfg.apiKey)); }
          catch (err3) { throw new Error(faError(err3.status, err3.body, true)); }
        } else {
          throw new Error(faError(err1.status, err1.body, cfg.isDefault));
        }
      }
    }
    return txt.trim();
  }

  return { fetchRates, rateHistory, snapHistory, offlineAnswer, onlineAnswer, buildContext, aiConfig };
})();
