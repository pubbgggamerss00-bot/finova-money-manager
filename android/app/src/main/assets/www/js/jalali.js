/* ═══════════ تقویم جلالی — الگوریتم دقیق (بر پایه jalaali-js) ═══════════ */
const Jalali = (() => {
  const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];

  function jalCal(jy) {
    let bl = breaks.length, gy = jy + 621, leapJ = -14, jp = breaks[0], jm, jump = 0, n, i;
    if (jy < jp || jy >= breaks[bl - 1]) throw new Error('Invalid Jalaali year ' + jy);
    for (i = 1; i < bl; i += 1) {
      jm = breaks[i]; jump = jm - jp;
      if (jy < jm) break;
      leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
      jp = jm;
    }
    n = jy - jp;
    leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
    if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
    const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
    const march = 20 + leapJ - leapG;
    if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
    let leap = mod(mod(n + 1, 33) - 1, 4);
    if (leap === -1) leap = 4;
    return { leap, gy, march };
  }
  function j2d(jy, jm, jd) {
    const r = jalCal(jy);
    return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
  }
  function d2j(jdn) {
    let gy = d2g(jdn).gy, jy = gy - 621, jdn1f, k;
    const r = jalCal(jy);
    jdn1f = g2d(gy, 3, r.march);
    k = jdn - jdn1f;
    if (k >= 0) {
      if (k <= 185) return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 };
      k -= 186;
    } else {
      jy -= 1; k += 179;
      if (r.leap === 1) k += 1;
    }
    return { jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 };
  }
  function g2d(gy, gm, gd) {
    let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
    d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
    return d;
  }
  function d2g(jdn) {
    let j = 4 * jdn + 139361631;
    j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
    const i = div(mod(j, 1461), 4) * 5 + 308;
    const gd = div(mod(i, 153), 5) + 1;
    const gm = mod(div(i, 153), 12) + 1;
    const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
    return { gy, gm, gd };
  }
  function div(a, b) { return ~~(a / b); }
  function mod(a, b) { return a - ~~(a / b) * b; }

  return {
    toJalali: (date) => d2j(g2d(date.getFullYear(), date.getMonth() + 1, date.getDate())),
    toGregorian: (jy, jm, jd) => { const g = d2g(j2d(jy, jm, jd)); return new Date(g.gy, g.gm - 1, g.gd); },
    isLeapJalaliYear: (jy) => jalCal(jy).leap === 0,
    monthLength: (jy, jm) => { if (jm <= 6) return 31; if (jm <= 11) return 30; return jalCal(jy).leap === 0 ? 30 : 29; },
  };
})();

const FA_MONTHS = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
const FA_WEEKDAYS = ['شنبه','یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه'];

function faDigits(s) {
  return String(s).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
}
function enDigits(s) {
  return String(s).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
                  .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
}
function fmtNum(n) {
  if (n === null || n === undefined || isNaN(n)) return '۰';
  return faDigits(Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','));
}
function fmtToman(n) { return fmtNum(n) + ' تومان'; }
function fmtShort(n) {
  const abs = Math.abs(n);
  if (abs >= 1e9) return faDigits((n / 1e9).toFixed(1)) + ' میلیارد';
  if (abs >= 1e6) return faDigits((n / 1e6).toFixed(1)) + ' میلیون';
  if (abs >= 1e3) return faDigits(Math.round(n / 1e3)) + ' هزار';
  return fmtNum(n);
}
function jToday() { return Jalali.toJalali(new Date()); } // {jy,jm,jd}
function jKey(t) { return t ? `${t.jy}/${String(t.jm).padStart(2,'0')}/${String(t.jd).padStart(2,'0')}` : ''; }
function jMonthKey(t) { return t ? `${t.jy}/${String(t.jm).padStart(2,'0')}` : ''; }
function parseJKey(k) { const p = enDigits(k).split('/').map(Number); return { jy: p[0], jm: p[1], jd: p[2] || 1 }; }
function jDateLabel(k) {
  if (!k) return '—';
  const t = parseJKey(k);
  return faDigits(String(t.jd)) + ' ' + FA_MONTHS[t.jm - 1] + ' ' + faDigits(t.jy);
}
function jMonthLabel(mk) {
  mk = mk || jMonthKey(jToday()); // بدون آرگومان = ماه جاری (رفع باگ نمایش «—» در عنوان کارت‌ها)
  if (!mk) return '—';
  const t = parseJKey(mk);
  return FA_MONTHS[t.jm - 1] + ' ' + faDigits(t.jy);
}
function todayLabel() {
  const now = new Date(), t = jToday();
  const wd = FA_WEEKDAYS[(now.getDay() + 1) % 7];
  return wd + '، ' + jDateLabel(jKey(t));
}
// فاصله روزها تا تاریخ جلالی (مثبت = آینده)
function daysUntilJ(jk) {
  const target = Jalali.toGregorian(parseJKey(jk).jy, parseJKey(jk).jm, parseJKey(jk).jd);
  const now = new Date();
  const a = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((a - b) / 86400000);
}
// جلالی n روز بعد
function jAddDays(n) {
  const d = new Date(); d.setDate(d.getDate() + n);
  return Jalali.toJalali(d);
}
function addJMonths(t, n) {
  let jm = t.jm + n, jy = t.jy;
  while (jm > 12) { jm -= 12; jy += 1; }
  while (jm < 1) { jm += 12; jy -= 1; }
  const maxD = Jalali.monthLength(jy, jm);
  return { jy, jm, jd: Math.min(t.jd, maxD) };
}
