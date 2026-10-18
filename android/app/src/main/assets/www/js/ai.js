/* ═══════════ هوش مصنوعی دوگانه (آفلاین + آنلاین) + قیمت لحظه‌ای طلا و دلار ═══════════ */
const AI = (() => {

  /* ─────────── دریافت قیمت لحظه‌ای ─────────── */
  async function fetchRates() {
    const cached = await Store.get('rates', 'latest');
    const hist = await Store.all('rateHistory');
    const result = { usd: null, gold18: null, goldCoin: null, mesghal: null, ts: 0, source: '', stale: false };
    // ۱) نوبیتکس — دلار/تتر به ریال
    try {
      const r = await Bridge.http('https://api.nobitex.ir/market/stats?srcCurrency=usdt,btc&dstCurrency=rls', 'GET', null, null, 12000);
      if (r.ok && r.body) {
        const j = JSON.parse(r.body);
        if (j && j.status === 'ok' && j.stats && j.stats.usdt) {
          const rls = parseFloat(j.stats.usdt.latest || j.stats.usdt.bestSell || 0);
          if (rls > 0) { result.usd = Math.round(rls / 10); result.ts = Date.now(); result.source = 'نوبیتکس'; }
        }
      }
    } catch (e) {}
    // ۲) TGJU — طلا
    try {
      const r2 = await Bridge.http('https://call5.tgju.org/ajax.json', 'GET', null, null, 15000);
      if (r2.ok && r2.body) {
        const j2 = JSON.parse(r2.body);
        const items = j2 && j2.current || {};
        const g18 = items['geram18'] && parseFloat(String(items['geram18'].p).replace(/,/g, ''));
        const coin = items['sekee'] && parseFloat(String(items['sekee'].p).replace(/,/g, ''));
        const mes = items['mesghal'] && parseFloat(String(items['mesghal'].p).replace(/,/g, ''));
        if (g18 > 0) result.gold18 = Math.round(g18 / 10);
        if (coin > 0) result.goldCoin = Math.round(coin / 10);
        if (mes > 0) result.mesghal = Math.round(mes / 10);
        if (g18 > 0) { result.ts = Math.max(result.ts, Date.now()); result.source = result.source ? result.source + '+TGJU' : 'TGJU'; }
      }
    } catch (e) {}
    // دستی‌های کاربر اگر API کار نکرد
    const st = App && App.state ? App.state : {};
    if (!result.usd && st.manualUSD) { result.usd = +st.manualUSD; result.source = 'دستی'; }
    if (!result.gold18 && st.manualGold) { result.gold18 = +st.manualGold; result.source = 'دستی'; }
    // کش
    if (result.usd || result.gold18) {
      const val = { key: 'latest', ...result, savedAt: Date.now() };
      await Store.put('rates', val, 'latest');
      const day = jKey(jToday());
      await Store.put('rateHistory', { day, usd: result.usd, gold18: result.gold18, ts: Date.now() }, day);
      return val;
    }
    if (cached) return { ...cached, stale: true, source: (cached.source || '') + ' (کش)' };
    return result;
  }
  async function rateHistory() {
    const rows = await Store.all('rateHistory');
    rows.sort((a, b) => a.day.localeCompare(b.day));
    return rows.slice(-30);
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

  /* ─────────── موتور آنلاین — LLM واقعی (OpenAI-compatible) ─────────── */
  function aiConfig() {
    const st = App.state || {};
    return {
      baseURL: (st.aiBaseURL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
      apiKey: st.aiApiKey || '',
      model: st.aiModel || 'gpt-4o-mini',
    };
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
    if (!cfg.apiKey) throw new Error('کلید API تنظیم نشده است. از ⚙️ تنظیمات → هوش مصنوعی آنلاین، آدرس سرویس و کلید API را وارد کن.');
    if (onProgress) onProgress('در حال جمع‌آوری داده‌های مالی…');
    const ctx = buildContext();
    const sys = 'تو «دستیار مالی فینوا» هستی؛ یک مشاور مالی خبره برای کاربر ایرانی. همیشه فقط فارسی، روان و با لحن دوستانه و کاربردی جواب بده. از اعداد واقعی context استفاده کن و مبالغ را با تومان و جداکننده هزارگان بنویس. پاسخ را ساختارمند با تیترها (با ایموجی) و فهرست بده. اگر کاربر درباره اولویت اقساط پرسید بر اساس ضروری بودن، موعد و مبلغ اولویت بده (اجاره بالاترین اولویت). اگر درباره سرمایه‌گذاری پرسید بر اساس قیمت‌های لحظه‌ای context و تحلیل روند طلا و دلار جواب بده و ریسک‌ها را بگو. اگر داده کافی نیست، محتاطانه و شفاف بگو.';
    const body = JSON.stringify({
      model: cfg.model,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: 'داده‌های مالی من (JSON):\n' + JSON.stringify(ctx, null, 1) + '\n\nسؤال من: ' + question },
      ],
      temperature: 0.6,
      max_tokens: 1400,
    });
    if (onProgress) onProgress('در حال گفتگو با هوش مصنوعی…');
    const r = await Bridge.http(cfg.baseURL + '/chat/completions', 'POST', { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.apiKey }, body, 60000);
    if (!r.ok) {
      let msg = 'خطای سرویس (' + r.status + ')';
      try { const j = JSON.parse(r.body); msg = j.error && j.error.message ? j.error.message : msg; } catch (e) {}
      throw new Error(msg);
    }
    try {
      const j = JSON.parse(r.body);
      const txt = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
      if (!txt) throw new Error('پاسخ نامعتبر از سرویس');
      return txt.trim();
    } catch (e) { throw new Error('پارس پاسخ ناموفق بود: ' + r.body.slice(0, 200)); }
  }

  return { fetchRates, rateHistory, offlineAnswer, onlineAnswer, buildContext, aiConfig };
})();
