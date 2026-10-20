/* ═══════════════════════════════════════════════════════════════
   فینوا — مولد توکن فعال‌سازی نسخه پرو
   ─────────────────────────────────────────────────────────────
   استفاده:
     bun tools/gen-tokens.js 10          → ساخت ۱۰ توکن ۳۰ روزه
     bun tools/gen-tokens.js --check PXXX-XXXX-XXXX-XXXX   → اعتبارسنجی

   قالب توکن:  PXXXX-XXXX-XXXX-XXXX  (۱۶ نویسه از الفبای ۳۱تایی
   بدون I,L,O,0,1) — نویسه اول P (نشان پلن پرو) و نویسه آخر
   رقم کنترل = Σ (مقدار نویسه × وزن موقعیت) mod 31
   هر توکن ۳۰ روز اشتراک پرو اضافه می‌کند و یک‌بارمصرف است.
   ═══════════════════════════════════════════════════════════════ */
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 31 chars

function tokenCheck(body15) {
  let s = 0;
  for (let i = 0; i < body15.length; i++) s += (ALPHA.indexOf(body15[i]) + 1) * (i + 1);
  return ALPHA[s % ALPHA.length];
}

function genToken() {
  let body = 'P';
  const buf = crypto.getRandomValues(new Uint8Array(14));
  for (let i = 0; i < 14; i++) body += ALPHA[buf[i] % ALPHA.length];
  return body + tokenCheck(body);
}

function fmt(tok) { return tok.slice(0, 4) + '-' + tok.slice(4, 8) + '-' + tok.slice(8, 12) + '-' + tok.slice(12, 16); }

function validToken(raw) {
  const s = String(raw || '').toUpperCase().split('').filter(c => ALPHA.includes(c)).join('');
  return s.length === 16 && s[0] === 'P' && tokenCheck(s.slice(0, 15)) === s[15];
}

const args = process.argv.slice(2);
if (args[0] === '--check') {
  const t = args[1] || '';
  console.log(validToken(t) ? '✅ VALID' : '❌ INVALID');
  process.exit(0);
}
const n = Math.max(1, parseInt(args[0], 10) || 10);
console.log(`-- ${n} توکن پرو فینوا (هر توکن ۳۰ روز — یک‌بارمصرف) --\n`);
const used = new Set();
const out = [];
while (out.length < n) {
  const t = genToken();
  if (used.has(t)) continue;
  used.add(t);
  out.push(fmt(t));
}
out.forEach((t, i) => console.log(`${String(i + 1).padStart(3, ' ')}. ${t}`));
console.log('\n(اعتبارسنجی: bun tools/gen-tokens.js --check <TOKEN>)');
