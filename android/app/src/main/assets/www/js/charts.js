/* ═══════════ نمودارهای Canvas + کارت گزارش + خروجی PDF (بدون کتابخانه خارجی) ═══════════ */
const Charts = (() => {
  const css = (v) => getComputedStyle(document.body).getPropertyValue(v).trim() || '#888';
  const line = (ctx, pts, color, fill, w) => {
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = w || 2.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    if (fill) { ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].b); ctx.lineTo(pts[0].x, pts[0].b); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); }
    ctx.stroke(); ctx.restore();
  };

  function makeCanvas(h, el) {
    const dpr = window.devicePixelRatio || 1;
    // عرض را از خودِ ظرف عنصر بگیر (رفع باگ سرریز کانواس گیج و چارت‌ها در ظرف‌های کوچک)
    let W = 0;
    if (el && el.clientWidth > 40) W = el.clientWidth;
    else W = Math.min(document.getElementById('view') ? document.getElementById('view').clientWidth - 34 : 340, 800);
    W = Math.max(60, Math.min(W, 800));
    const c = document.createElement('canvas');
    c.width = W * dpr; c.height = h * dpr;
    c.style.width = W + 'px'; c.style.height = h + 'px';   // اندازه صریح — دیگر سرریز نمی‌کند
    const ctx = c.getContext('2d'); ctx.scale(dpr, dpr);
    return { c, ctx, W, h };
  }

  // ── نمودار خطی/ستونی درآمد و هزینه ──
  function trend(el, data) { // data: [{label, in, out}]
    const { c, ctx, W, h } = makeCanvas(200, el);
    const pad = { t: 16, b: 26, l: 8, r: 8 };
    const hasData = data.some(d => d.in > 0 || d.out > 0);
    const maxV = Math.max(1, ...data.map(d => Math.max(d.in, d.out)));
    const iw = (W - pad.l - pad.r) / data.length;
    const bh = h - pad.t - pad.b;
    // خطوط راهنما
    ctx.strokeStyle = css('--line'); ctx.lineWidth = 1;
    [0.25, 0.5, 0.75, 1].forEach(f => { const y = pad.t + bh * (1 - f); ctx.setLineDash([3, 5]); ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke(); ctx.setLineDash([]); });
    data.forEach((d, i) => {
      const x = pad.l + iw * i + iw * 0.18;
      const bw = iw * 0.28;
      const hIn = (d.in / maxV) * bh, hOut = (d.out / maxV) * bh;
      const g1 = ctx.createLinearGradient(0, pad.t + bh - hIn, 0, pad.t + bh); g1.addColorStop(0, css('--ok2')); g1.addColorStop(1, 'rgba(16,185,129,.25)');
      const g2 = ctx.createLinearGradient(0, pad.t + bh - hOut, 0, pad.t + bh); g2.addColorStop(0, css('--acc')); g2.addColorStop(1, 'rgba(217,70,239,.25)');
      ctx.fillStyle = g1; roundRect(ctx, x, pad.t + bh - hIn, bw, hIn, 4); ctx.fill();
      ctx.fillStyle = g2; roundRect(ctx, x + bw + 3, pad.t + bh - hOut, bw, hOut, 4); ctx.fill();
      ctx.fillStyle = css('--txt3'); ctx.font = '10px Vazirmatn,Tahoma'; ctx.textAlign = 'center';
      ctx.fillText(d.label, pad.l + iw * i + iw / 2, h - 8);
    });
    // حالت خالی — پیام دوستانه به‌جای چارت خالی
    if (!hasData) {
      ctx.fillStyle = css('--txt3'); ctx.font = '12px Vazirmatn,Tahoma'; ctx.textAlign = 'center';
      ctx.fillText('هنوز تراکنشی ثبت نشده', W / 2, pad.t + bh * 0.42);
      ctx.font = '10.5px Vazirmatn,Tahoma';
      ctx.fillText('اولین درآمد و هزینه‌ات را ثبت کن تا روند اینجا ساخته شود', W / 2, pad.t + bh * 0.42 + 20);
    }
    el.innerHTML = ''; el.appendChild(c);
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2); if (h <= 0) h = 1;
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  // ── دونات دسته‌بندی‌ها ──
  function donut(el, items) { // [{label, value, color}]
    const { c, ctx, W, h } = makeCanvas(190, el);
    const cx = W / 2, cy = h / 2, R = Math.min(W, h) / 2 - 12, r = R * 0.62;
    const total = items.reduce((s, i) => s + i.value, 0) || 1;
    let ang = -Math.PI / 2;
    if (!items.length) { ctx.fillStyle = css('--txt3'); ctx.font = '12px Vazirmatn,Tahoma'; ctx.textAlign = 'center'; ctx.fillText('داده‌ای نیست', cx, cy); }
    items.forEach(it => {
      const a = (it.value / total) * Math.PI * 2;
      ctx.beginPath(); ctx.arc(cx, cy, R, ang, ang + a); ctx.arc(cx, cy, r, ang + a, ang, true); ctx.closePath();
      ctx.fillStyle = it.color; ctx.shadowColor = it.color; ctx.shadowBlur = 10; ctx.fill(); ctx.shadowBlur = 0;
      ang += a;
    });
    ctx.fillStyle = css('--txt'); ctx.font = '800 15px Vazirmatn,Tahoma'; ctx.textAlign = 'center';
    ctx.fillText(fmtShort(total), cx, cy - 2);
    ctx.fillStyle = css('--txt3'); ctx.font = '10px Vazirmatn,Tahoma';
    ctx.fillText('تومان', cx, cy + 15);
    el.innerHTML = ''; el.appendChild(c);
  }

  // ── نمودار پیش‌بینی (خطی) ──
  function forecast(el, data) { // [{label, value, projected}]
    const { c, ctx, W, h } = makeCanvas(190, el);
    const pad = { t: 20, b: 28, l: 10, r: 10 };
    const vals = data.map(d => Math.max(0, d.value));
    const maxV = Math.max(1, ...vals) * 1.15;
    const pts = data.map((d, i) => ({
      x: pad.l + (W - pad.l - pad.r) * (i / (data.length - 1 || 1)),
      y: pad.t + (h - pad.t - pad.b) * (1 - Math.max(0, d.value) / maxV),
      b: h - pad.b,
    }));
    // شبکه
    ctx.strokeStyle = css('--line'); ctx.setLineDash([3, 5]); ctx.lineWidth = 1;
    [0.33, 0.66, 1].forEach(f => { const y = pad.t + (h - pad.t - pad.b) * (1 - f); ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke(); });
    ctx.setLineDash([]);
    line(ctx, pts, css('--pri2'), 'rgba(34,211,238,.12)');
    pts.forEach((p, i) => {
      ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, 7);
      ctx.fillStyle = data[i].projected ? css('--acc') : css('--pri'); ctx.fill();
      if (data[i].projected) { ctx.strokeStyle = css('--acc2'); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, 7); ctx.stroke(); }
      ctx.fillStyle = css('--txt3'); ctx.font = '10px Vazirmatn,Tahoma'; ctx.textAlign = 'center';
      ctx.fillText(data[i].label, p.x, h - 8);
      ctx.fillStyle = css('--txt2'); ctx.font = '9px Vazirmatn,Tahoma';
      ctx.fillText(fmtShort(data[i].value), p.x, p.y - 12);
    });
    el.innerHTML = ''; el.appendChild(c);
  }

  // ── گیج امتیاز سلامت ──
  function gauge(el, score, showNum) {
    // عرض کانواس = عرض ظرف (۱۳۰/۱۵۰px) — رفع باگ همپوشانی متن روی گیج
    const { c, ctx, W, h } = makeCanvas(130, el);
    const cx = W / 2, cy = h - 14, R = Math.min(W / 2, h - 20) - 4;
    const start = Math.PI, end = 2 * Math.PI;
    ctx.lineWidth = 13; ctx.lineCap = 'round';
    ctx.strokeStyle = css('--line'); ctx.beginPath(); ctx.arc(cx, cy, R - 8, start, end); ctx.stroke();
    const col = score >= 75 ? css('--ok2') : score >= 50 ? css('--warn2') : css('--bad2');
    const grad = ctx.createLinearGradient(0, 0, W, 0); grad.addColorStop(0, css('--pri')); grad.addColorStop(1, col);
    ctx.strokeStyle = grad; ctx.shadowColor = col; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.arc(cx, cy, R - 8, start, start + Math.PI * (score / 100)); ctx.stroke(); ctx.shadowBlur = 0;
    if (showNum !== false) {
      ctx.fillStyle = css('--txt'); ctx.font = '900 26px Vazirmatn,Tahoma'; ctx.textAlign = 'center';
      ctx.fillText(faDigits(score), cx, cy - 10);
    }
    el.innerHTML = ''; el.appendChild(c);
  }

  // ═══ کارت گزارش قابل اشتراک (PNG) ═══
  function reportCardCanvas(stats) {
    const W = 1080, H = 1350;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    // پس‌زمینه
    const bg = x.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#0b1120'); bg.addColorStop(1, '#141e38');
    x.fillStyle = bg; x.fillRect(0, 0, W, H);
    x.fillStyle = 'rgba(34,211,238,.08)'; x.beginPath(); x.arc(W - 120, 140, 300, 0, 7); x.fill();
    x.fillStyle = 'rgba(217,70,239,.08)'; x.beginPath(); x.arc(120, H - 140, 320, 0, 7); x.fill();
    // هدر
    x.textAlign = 'center';
    x.fillStyle = '#00e5ff'; x.font = '900 56px Vazirmatn,Tahoma'; x.shadowColor = '#00e5ff'; x.shadowBlur = 30;
    x.fillText('◈ فینوا', W / 2, 130); x.shadowBlur = 0;
    x.fillStyle = '#94a7c4'; x.font = '28px Vazirmatn,Tahoma';
    x.fillText('گزارش مالی ' + jMonthLabel(stats.month), W / 2, 185);
    // موجودی
    x.fillStyle = '#e6edf7'; x.font = '900 96px Vazirmatn,Tahoma';
    x.fillText(fmtNum(stats.balance), W / 2, 350);
    x.fillStyle = '#5f7396'; x.font = '30px Vazirmatn,Tahoma';
    x.fillText('موجودی کل (تومان)', W / 2, 405);
    // آمار
    const rows = [
      ['درآمد این ماه', fmtNum(stats.income), '#34d399'],
      ['هزینه این ماه', fmtNum(stats.expense), '#f87171'],
      ['اقساط پرداخت‌شده', fmtNum(stats.installPaid), '#22d3ee'],
      ['اقساط پیش‌رو', fmtNum(stats.installUpcoming), '#fbbf24'],
      ['امتیاز سلامت مالی', faDigits(stats.health) + ' از ۱۰۰', '#f0abfc'],
    ];
    let y = 500;
    rows.forEach(r => {
      x.fillStyle = 'rgba(255,255,255,.04)'; roundRect(x, 90, y, W - 180, 108, 24); x.fill();
      x.strokeStyle = 'rgba(255,255,255,.09)'; x.lineWidth = 2; roundRect(x, 90, y, W - 180, 108, 24); x.stroke();
      x.textAlign = 'right'; x.fillStyle = '#94a7c4'; x.font = '30px Vazirmatn,Tahoma';
      x.fillText(r[0], W - 150, y + 68);
      x.textAlign = 'left'; x.fillStyle = r[2]; x.font = '800 40px Vazirmatn,Tahoma';
      x.fillText(r[1], 150, y + 70);
      y += 128;
    });
    // فوتر
    x.textAlign = 'center'; x.fillStyle = '#3d4f73'; x.font = '24px Vazirmatn,Tahoma';
    x.fillText(jDateLabel(jKey(jToday())) + ' — ساخته‌شده با اپلیکیشن فینوا', W / 2, H - 60);
    return c;
  }

  // ═══ تولید PDF از Canvas (PNG→JPEG embed) — سبک و آفلاین ═══
  async function canvasToPdf(canvasList, fileName) {
    const A4W = 595.28, A4H = 841.89;
    const pages = [];
    for (const c of canvasList) {
      const dataUrl = c.toDataURL('image/jpeg', 0.9);
      const bin = atob(dataUrl.split(',')[1]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const iw = c.width, ih = c.height;
      const scale = Math.min((A4W - 40) / iw, (A4H - 40) / ih);
      pages.push({ bytes, iw, ih, w: iw * scale, h: ih * scale });
    }
    // ساخت PDF
    let out = '%PDF-1.4\n';
    const offsets = [];
    const nObj = pages.length * 3 + 4;
    let objN = 1;
    const addObj = (s) => { offsets[objN] = out.length; out += `${objN} 0 obj\n${s}\nendobj\n`; objN++; };
    // 1: catalog, 2: pages
    const catalogId = 1, pagesId = 2;
    offsets[1] = out.length; out += `1 0 obj\n<< /Type /Catalog /Pages ${pagesId} 0 R >>\nendobj\n`; objN = 3;
    const kidsArr = pages.map((p, i) => `${4 + i * 3} 0 R`).join(' ');
    offsets[2] = out.length; out += `2 0 obj\n<< /Type /Pages /Kids [${kidsArr}] /Count ${pages.length} >>\nendobj\n`; objN = 3;
    pages.forEach((p, i) => {
      const pageId = 4 + i * 3, contentId = 5 + i * 3, imgId = 6 + i * 3;
      offsets[pageId] = out.length;
      out += `${pageId} 0 obj\n<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${A4W} ${A4H}] /Resources << /XObject << /Im${i} ${imgId} 0 R >> /ProcSet [/PDF /ImageC] >> /Contents ${contentId} 0 R >>\nendobj\n`;
      objN = contentId;
      const content = `q ${p.w.toFixed(2)} 0 0 ${p.h.toFixed(2)} 20.00 ${(A4H - p.h - 20).toFixed(2)} cm /Im${i} Do Q`;
      offsets[contentId] = out.length;
      out += `${contentId} 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`;
      objN = imgId;
      offsets[imgId] = out.length;
      let binStr = '';
      const chunk = 8192;
      for (let k = 0; k < p.bytes.length; k += chunk) binStr += String.fromCharCode.apply(null, p.bytes.subarray(k, k + chunk));
      out += `${imgId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${p.iw} /Height ${p.ih} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.bytes.length} >>\nstream\n${binStr}\nendstream\nendobj\n`;
      objN = imgId + 1;
    });
    const xrefPos = out.length;
    out += `xref\n0 ${objN}\n0000000000 65535 f \n`;
    for (let i = 1; i < objN; i++) out += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    out += `trailer\n<< /Size ${objN} /Root ${catalogId} 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
    const ab = new ArrayBuffer(out.length);
    const view = new Uint8Array(ab);
    for (let i = 0; i < out.length; i++) view[i] = out.charCodeAt(i) & 0xff;
    return { blob: new Blob([ab], { type: 'application/pdf' }), b64: bufToB64(ab) };
  }

  function bufToB64(buf) {
    const bytes = new Uint8Array(buf); let bin = '';
    const chunk = 8192;
    for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    return btoa(bin);
  }
  function blobToB64(blob) {
    return new Promise(res => {
      const r = new FileReader();
      r.onload = () => res(r.result.split(',')[1]);
      r.readAsDataURL(blob);
    });
  }

  return { trend, donut, forecast, gauge, reportCardCanvas, canvasToPdf, bufToB64, blobToB64 };
})();
