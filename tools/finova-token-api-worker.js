/**
 * فینوا — API (Cloudflare Worker) v6
 * Variables: ADMIN_SECRET (Secret)
 * Bindings: TOKENS (KV Namespace)
 *
 * توکن: /admin/* , /activate , /check
 * احراز هویت: /auth/register , /auth/login , /auth/lookup
 * سلامت: /health
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Secret',
};

const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const ALLOWED_DAYS = [7, 15, 30, 0];

function tokenCheck(body15) {
  let s = 0;
  for (let i = 0; i < body15.length; i++) s += (ALPHA.indexOf(body15[i]) + 1) * (i + 1);
  return ALPHA[s % ALPHA.length];
}
function genTokenRaw() {
  let body = 'P';
  const buf = new Uint8Array(14);
  crypto.getRandomValues(buf);
  for (let i = 0; i < 14; i++) body += ALPHA[buf[i] % ALPHA.length];
  return body + tokenCheck(body);
}
function fmt(tok) {
  return tok.slice(0, 4) + '-' + tok.slice(4, 8) + '-' + tok.slice(8, 12) + '-' + tok.slice(12, 16);
}
function normalizeToken(raw) {
  return String(raw || '').toUpperCase().split('').filter(c => ALPHA.includes(c)).join('');
}
function validFormat(raw) {
  const s = normalizeToken(raw);
  return s.length === 16 && s[0] === 'P' && tokenCheck(s.slice(0, 15)) === s[15];
}
function daysLabel(d) {
  if (d === 0 || d === null || d === undefined) return 'نامحدود';
  return d + ' روز';
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
  });
}
function simpleHash(s) {
  let h = 5381;
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) + str.charCodeAt(i) | 0;
  return String(h >>> 0);
}

async function listAllTokens(env) {
  const list = [];
  let cursor;
  do {
    const page = await env.TOKENS.list({ prefix: 'tok:', cursor, limit: 100 });
    for (const k of page.keys) {
      const v = await env.TOKENS.get(k.name);
      if (v) { try { list.push(JSON.parse(v)); } catch (e) {} }
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return list;
}

async function getTokenRecord(env, rawOrFmt) {
  const raw = normalizeToken(rawOrFmt);
  if (!validFormat(raw)) return { error: 'فرمت نامعتبر' };
  const existing = await env.TOKENS.get('tok:' + raw);
  if (!existing) return { error: 'توکن در سیستم یافت نشد' };
  try { return { raw, record: JSON.parse(existing) }; }
  catch (e) { return { error: 'خطای داخلی توکن' }; }
}

async function findUserByName(env, name) {
  const nameLower = String(name || '').trim().toLowerCase();
  if (!nameLower) return null;
  const idx = await env.TOKENS.get('useridx:' + nameLower);
  if (!idx) return null;
  const raw = await env.TOKENS.get('user:' + idx);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

async function findUserByCode(env, code) {
  const c = String(code || '').trim().toUpperCase();
  if (!c) return null;
  const raw = await env.TOKENS.get('user:' + c);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (path === '/' || path === '/health') {
      return json({ ok: true, service: 'finova-token-api', version: 6 });
    }

    let body = {};
    if (request.method === 'POST') {
      try { body = await request.json(); } catch (e) { body = {}; }
    }
    const adminSecret = request.headers.get('X-Admin-Secret') || '';
    const isAdmin = env.ADMIN_SECRET && adminSecret === env.ADMIN_SECRET;

    if (path === '/auth/register' && request.method === 'POST') {
      const name = String(body.name || '').trim();
      const code = String(body.code || '').trim().toUpperCase();
      const salt = String(body.salt || '');
      const passHash = String(body.passHash || '');
      if (name.length < 2) return json({ ok: false, msg: 'نام نامعتبر است' });
      if (!code || code.length < 4) return json({ ok: false, msg: 'کد حساب نامعتبر است' });
      if (!salt || !passHash) return json({ ok: false, msg: 'اطلاعات رمز ناقص است' });

      const nameLower = name.toLowerCase();
      if (await env.TOKENS.get('useridx:' + nameLower)) {
        return json({ ok: false, msg: 'این نام کاربری قبلاً ثبت شده است' });
      }
      if (await env.TOKENS.get('user:' + code)) {
        return json({ ok: false, msg: 'این کد حساب قبلاً ثبت شده است' });
      }

      const user = {
        name, nameLower, code, salt, passHash,
        createdAt: body.createdAt || Date.now(),
        proSnapshot: null, trialStart: 0, quotaSnapshot: null,
      };
      await env.TOKENS.put('user:' + code, JSON.stringify(user));
      await env.TOKENS.put('useridx:' + nameLower, code);
      return json({ ok: true, msg: 'ثبت‌نام انجام شد', account: { name, code, createdAt: user.createdAt } });
    }

    if (path === '/auth/login' && request.method === 'POST') {
      const name = String(body.name || '').trim();
      const pass = String(body.pass || '');
      if (!name || !pass) return json({ ok: false, msg: 'نام و رمز را وارد کن' });
      const user = await findUserByName(env, name);
      if (!user) return json({ ok: false, msg: 'حسابی با این نام پیدا نشد' });
      if (simpleHash(pass + user.salt) !== user.passHash) {
        return json({ ok: false, msg: 'رمز حساب اشتباه است' });
      }
      return json({
        ok: true,
        account: {
          name: user.name, code: user.code, salt: user.salt, passHash: user.passHash,
          createdAt: user.createdAt,
          proSnapshot: user.proSnapshot || null,
          trialStart: user.trialStart || 0,
          quotaSnapshot: user.quotaSnapshot || null,
        },
      });
    }

    if (path === '/auth/lookup' && request.method === 'POST') {
      if (!isAdmin) return json({ ok: false, msg: 'دسترسی غیرمجاز' }, 401);
      let user = null;
      if (body.code) user = await findUserByCode(env, body.code);
      else if (body.name) user = await findUserByName(env, body.name);
      if (!user) return json({ ok: false, msg: 'حساب یافت نشد' });
      return json({ ok: true, account: { name: user.name, code: user.code, createdAt: user.createdAt } });
    }

    if (path === '/admin/create' && request.method === 'POST') {
      if (!isAdmin) return json({ ok: false, msg: 'دسترسی غیرمجاز' }, 401);
      const account = String(body.account || '').trim().toUpperCase();
      if (!account || account.length < 4) return json({ ok: false, msg: 'کد حساب الزامی است' });
      let days = parseInt(body.days, 10);
      if (Number.isNaN(days)) days = 30;
      if (!ALLOWED_DAYS.includes(days)) return json({ ok: false, msg: 'مدت نامعتبر' });
      const count = Math.min(50, Math.max(1, parseInt(body.count, 10) || 1));
      const note = String(body.note || '').trim();
      const tokens = [];
      for (let i = 0; i < count; i++) {
        const raw = genTokenRaw();
        const token = fmt(raw);
        const record = {
          token, raw, account, days, daysLabel: daysLabel(days),
          note: note || null, createdAt: Date.now(), usedAt: null, usedBy: null,
          disabled: false, disabledAt: null,
        };
        await env.TOKENS.put('tok:' + raw, JSON.stringify(record));
        tokens.push({ token, days, daysLabel: daysLabel(days), account });
      }
      return json({ ok: true, tokens, count: tokens.length });
    }

    if (path === '/admin/list' && request.method === 'POST') {
      if (!isAdmin) return json({ ok: false, msg: 'دسترسی غیرمجاز' }, 401);
      let list = await listAllTokens(env);
      const filter = String(body.filter || 'all');
      if (filter === 'free') list = list.filter(t => !t.usedAt && !t.disabled);
      if (filter === 'used') list = list.filter(t => !!t.usedAt);
      if (filter === 'disabled') list = list.filter(t => !!t.disabled);
      return json({ ok: true, tokens: list, total: list.length });
    }

    if (path === '/admin/disable' && request.method === 'POST') {
      if (!isAdmin) return json({ ok: false, msg: 'دسترسی غیرمجاز' }, 401);
      const got = await getTokenRecord(env, body.token);
      if (got.error) return json({ ok: false, msg: got.error });
      const { raw, record } = got;
      if (record.disabled) return json({ ok: false, msg: 'از قبل غیرفعال است' });
      record.disabled = true; record.disabledAt = Date.now();
      await env.TOKENS.put('tok:' + raw, JSON.stringify(record));
      return json({ ok: true, msg: 'توکن غیرفعال شد', token: record.token });
    }

    if (path === '/admin/enable' && request.method === 'POST') {
      if (!isAdmin) return json({ ok: false, msg: 'دسترسی غیرمجاز' }, 401);
      const got = await getTokenRecord(env, body.token);
      if (got.error) return json({ ok: false, msg: got.error });
      const { raw, record } = got;
      if (record.usedAt) return json({ ok: false, msg: 'توکن استفاده‌شده را نمی‌توان فعال کرد' });
      if (!record.disabled) return json({ ok: false, msg: 'از قبل فعال است' });
      record.disabled = false; record.disabledAt = null;
      await env.TOKENS.put('tok:' + raw, JSON.stringify(record));
      return json({ ok: true, msg: 'توکن فعال شد', token: record.token });
    }

    if (path === '/admin/delete' && request.method === 'POST') {
      if (!isAdmin) return json({ ok: false, msg: 'دسترسی غیرمجاز' }, 401);
      const got = await getTokenRecord(env, body.token);
      if (got.error) return json({ ok: false, msg: got.error });
      await env.TOKENS.delete('tok:' + got.raw);
      return json({ ok: true, msg: 'توکن حذف شد', token: got.record.token });
    }

    if (path === '/admin/account' && request.method === 'POST') {
      if (!isAdmin) return json({ ok: false, msg: 'دسترسی غیرمجاز' }, 401);
      const account = String(body.account || '').trim().toUpperCase();
      if (!account) return json({ ok: false, msg: 'کد حساب را وارد کن' });
      const all = await listAllTokens(env);
      const related = all.filter(t => (t.account || '') === account || (t.usedBy || '') === account);
      const issued = related.filter(t => (t.account || '') === account);
      const activated = related.filter(t => t.usedAt);
      const free = issued.filter(t => !t.usedAt && !t.disabled);
      const used = issued.filter(t => !!t.usedAt);
      const disabled = issued.filter(t => !!t.disabled);
      let lastActivate = null, totalDaysGranted = 0, hasUnlimited = false;
      for (const t of activated) {
        if (!lastActivate || t.usedAt > lastActivate) lastActivate = t.usedAt;
        if (t.days === 0) hasUnlimited = true;
        else totalDaysGranted += (t.days || 30);
      }
      const cloudUser = await findUserByCode(env, account);
      return json({
        ok: true, account,
        cloudUser: cloudUser ? { name: cloudUser.name, code: cloudUser.code, createdAt: cloudUser.createdAt } : null,
        stats: {
          issued: issued.length, free: free.length, used: used.length, disabled: disabled.length,
          activated: activated.length,
          totalDaysGranted: hasUnlimited ? -1 : totalDaysGranted,
          hasUnlimited, lastActivate,
        },
        tokens: related,
      });
    }

    if (path === '/admin/pro' && request.method === 'POST') {
      if (!isAdmin) return json({ ok: false, msg: 'دسترسی غیرمجاز' }, 401);
      const all = await listAllTokens(env);
      const usedList = all.filter(t => t.usedAt);
      const byAcc = {};
      for (const t of usedList) {
        const acc = (t.usedBy || t.account || 'نامشخص').toUpperCase();
        if (!byAcc[acc]) {
          byAcc[acc] = { account: acc, activations: 0, tokens: [], totalDays: 0, hasUnlimited: false, firstAt: t.usedAt, lastAt: t.usedAt };
        }
        const g = byAcc[acc];
        g.activations += 1; g.tokens.push(t.token);
        if (t.days === 0) g.hasUnlimited = true; else g.totalDays += (t.days || 30);
        if (t.usedAt < g.firstAt) g.firstAt = t.usedAt;
        if (t.usedAt > g.lastAt) g.lastAt = t.usedAt;
      }
      const accounts = Object.values(byAcc).sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
      return json({ ok: true, accounts, total: accounts.length });
    }

    if (path === '/activate' && request.method === 'POST') {
      const raw = normalizeToken(body.token);
      if (!validFormat(raw)) return json({ ok: false, msg: 'توکن نامعتبر است — فرمت یا رقم کنترل اشتباه است' });
      const key = 'tok:' + raw;
      const existing = await env.TOKENS.get(key);
      if (!existing) return json({ ok: false, msg: 'این توکن در سیستم ثبت نشده است' });
      let record;
      try { record = JSON.parse(existing); } catch (e) { return json({ ok: false, msg: 'خطای داخلی توکن' }); }
      if (record.disabled) return json({ ok: false, msg: 'این توکن توسط ادمین غیرفعال شده است' });
      if (record.usedAt) return json({ ok: false, msg: 'این توکن قبلاً استفاده شده است' });
      const reqAccount = String(body.account || '').trim().toUpperCase();
      if (record.account) {
        if (!reqAccount) return json({ ok: false, msg: 'کد حساب لازم است' });
        if (record.account !== reqAccount) return json({ ok: false, msg: 'این توکن برای حساب دیگری صادر شده است' });
      }
      record.usedAt = Date.now();
      record.usedBy = reqAccount || record.account || null;
      await env.TOKENS.put(key, JSON.stringify(record));
      const days = (record.days === 0) ? 0 : (record.days || 30);
      return json({ ok: true, msg: 'توکن با موفقیت فعال شد', days, daysLabel: daysLabel(days), unlimited: days === 0, account: record.account || null });
    }

    if (path === '/check' && request.method === 'POST') {
      const raw = normalizeToken(body.token);
      if (!validFormat(raw)) return json({ ok: false, valid: false, msg: 'فرمت نامعتبر' });
      const existing = await env.TOKENS.get('tok:' + raw);
      if (!existing) return json({ ok: false, valid: false, msg: 'در سیستم ثبت نشده' });
      let record;
      try { record = JSON.parse(existing); } catch (e) { return json({ ok: false, valid: false, msg: 'خطا' }); }
      if (record.disabled) return json({ ok: false, valid: false, disabled: true, msg: 'غیرفعال شده توسط ادمین', account: record.account || null, days: record.days });
      if (record.usedAt) return json({ ok: false, valid: false, used: true, msg: 'قبلاً استفاده شده', account: record.account || null, days: record.days });
      return json({ ok: true, valid: true, used: false, disabled: false, msg: 'آزاد و معتبر', account: record.account || null, days: record.days, daysLabel: daysLabel(record.days) });
    }


    // ═══════════ SYNC داده حساب ═══════════
    if (path === '/sync/upload' && request.method === 'POST') {
      const code = String(body.code || '').trim().toUpperCase();
      const passHash = String(body.passHash || '');
      if (!code || !passHash) return json({ ok: false, msg: 'کد حساب یا رمز ناقص است' });
      const user = await findUserByCode(env, code);
      if (!user) return json({ ok: false, msg: 'حساب در سرور ثبت نشده — یک‌بار با اینترنت ثبت‌نام/ورود کن' });
      if (user.passHash !== passHash) return json({ ok: false, msg: 'احراز هویت ناموفق' });
      const blob = body.blob;
      if (!blob || typeof blob !== 'object') return json({ ok: false, msg: 'داده نامعتبر است' });
      const savedAt = body.savedAt || blob.savedAt || Date.now();
      // محدودیت تقریبی حجم (KV)
      const packed = JSON.stringify({ savedAt, blob });
      if (packed.length > 20 * 1024 * 1024) {
        return json({ ok: false, msg: 'حجم داده بیش از حد مجاز است' });
      }
      await env.TOKENS.put('blob:' + code, packed);
      // اسنپ‌شات پرو روی پروفایل کاربر
      try {
        if (blob.state && blob.state.pro) {
          user.proSnapshot = blob.state.pro;
          user.trialStart = blob.state.trialStart || 0;
          user.quotaSnapshot = blob.state.quota || null;
          await env.TOKENS.put('user:' + code, JSON.stringify(user));
        }
      } catch (e) {}
      return json({ ok: true, msg: 'همگام‌سازی شد', savedAt });
    }

    if (path === '/sync/download' && request.method === 'POST') {
      const code = String(body.code || '').trim().toUpperCase();
      const passHash = String(body.passHash || '');
      if (!code || !passHash) return json({ ok: false, msg: 'کد حساب یا رمز ناقص است' });
      const user = await findUserByCode(env, code);
      if (!user) return json({ ok: false, msg: 'حساب در سرور یافت نشد' });
      if (user.passHash !== passHash) return json({ ok: false, msg: 'احراز هویت ناموفق' });
      const raw = await env.TOKENS.get('blob:' + code);
      if (!raw) return json({ ok: true, empty: true, msg: 'هنوز داده‌ای در ابر نیست' });
      try {
        const parsed = JSON.parse(raw);
        return json({ ok: true, savedAt: parsed.savedAt || 0, blob: parsed.blob });
      } catch (e) {
        return json({ ok: false, msg: 'خطا در خواندن داده ابری' });
      }
    }


    // ═══════════ SUPPORT — چت و تیکت ═══════════
    const SUPPORT_CATS = {
      technical: 'مشکلات فنی',
      payment: 'خرید و اشتراک پرو',
      account: 'حساب کاربری',
      data: 'پشتیبان و داده',
      feature: 'پیشنهاد و انتقاد',
      other: 'سایر',
    };

    function uid(prefix) {
      const b = new Uint8Array(8);
      crypto.getRandomValues(b);
      return (prefix || 'id') + '_' + Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
    }

    async function authUser(env, body) {
      const code = String(body.code || '').trim().toUpperCase();
      const passHash = String(body.passHash || '');
      if (!code || !passHash) return { error: 'احراز هویت ناقص است' };
      const user = await findUserByCode(env, code);
      if (!user) return { error: 'حساب در سرور یافت نشد' };
      if (user.passHash !== passHash) return { error: 'احراز هویت ناموفق' };
      return { user, code };
    }

    async function listByPrefix(env, prefix) {
      const out = [];
      let cursor;
      do {
        const page = await env.TOKENS.list({ prefix, cursor, limit: 100 });
        for (const k of page.keys) {
          const v = await env.TOKENS.get(k.name);
          if (v) { try { out.push(JSON.parse(v)); } catch (e) {} }
        }
        cursor = page.list_complete ? null : page.cursor;
      } while (cursor);
      return out;
    }

    function proInfo(user) {
      const pro = (user && user.proSnapshot) || {};
      const exp = pro.expiresAt || 0;
      const active = exp > Date.now() || exp > 8e15;
      return {
        isPro: !!active,
        expiresAt: exp || null,
        lastActivated: pro.lastActivated || null,
        unlimited: exp > 8e15,
      };
    }

    // کاربر: شروع چت
    if (path === '/support/chat/start' && request.method === 'POST') {
      const auth = await authUser(env, body);
      if (auth.error) return json({ ok: false, msg: auth.error });
      const category = String(body.category || 'other');
      if (!SUPPORT_CATS[category]) return json({ ok: false, msg: 'دسته نامعتبر است' });

      // اگر چت باز/در حال بررسی دارد همان را برگردان
      const all = await listByPrefix(env, 'schat:');
      let existing = all
        .filter(c => c.userCode === auth.code && (c.status === 'open' || c.status === 'reviewing'))
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];

      if (existing) {
        return json({ ok: true, chat: existing, resumed: true });
      }

      const id = uid('chat');
      const now = Date.now();
      const welcome = {
        id: uid('m'),
        role: 'support',
        text: 'سلام 👋 به پشتیبانی فینوا خوش آمدید.\\nدر بخش «' + SUPPORT_CATS[category] + '» چطور می‌توانیم کمکتان کنیم؟',
        at: now,
        auto: true,
      };
      const chat = {
        id,
        userCode: auth.code,
        userName: auth.user.name || body.name || auth.code,
        category,
        categoryLabel: SUPPORT_CATS[category],
        status: 'open', // open | reviewing | closed
        messages: [welcome],
        createdAt: now,
        updatedAt: now,
        lastUserAt: null,
        lastSupportAt: now,
        unreadAdmin: 0,
      };
      await env.TOKENS.put('schat:' + id, JSON.stringify(chat));
      return json({ ok: true, chat, resumed: false });
    }

    // کاربر: ارسال پیام
    if (path === '/support/chat/send' && request.method === 'POST') {
      const auth = await authUser(env, body);
      if (auth.error) return json({ ok: false, msg: auth.error });
      const chatId = String(body.chatId || '');
      const text = String(body.text || '').trim().slice(0, 2000);
      if (!chatId || !text) return json({ ok: false, msg: 'پیام خالی است' });
      const raw = await env.TOKENS.get('schat:' + chatId);
      if (!raw) return json({ ok: false, msg: 'گفتگو یافت نشد' });
      let chat;
      try { chat = JSON.parse(raw); } catch (e) { return json({ ok: false, msg: 'خطا' }); }
      if (chat.userCode !== auth.code) return json({ ok: false, msg: 'دسترسی غیرمجاز' });
      if (chat.status === 'closed') return json({ ok: false, msg: 'این گفتگو بسته شده است' });

      // فقط وقتی مجاز است که منتظر پاسخ ادمین نباشد
      const msgs = chat.messages || [];
      const lastUserIdx = [...msgs].reverse().findIndex(m => m.role === 'user');
      const lastSupportAfterUser = lastUserIdx >= 0
        ? msgs.slice(msgs.length - lastUserIdx).some(m => m.role === 'support' && !m.auto)
        : true;
      // اگر آخرین پیام واقعی کاربر بوده و هنوز ادمین جواب نداده
      let canSend = true;
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'user') { canSend = false; break; }
        if (msgs[i].role === 'support' && !msgs[i].system) { canSend = true; break; }
        if (msgs[i].role === 'support' && msgs[i].auto && msgs[i].system) continue;
      }
      // ساده‌تر: اگر status === reviewing و آخرین پیام غیرسیستم از user باشد
      const lastReal = [...msgs].reverse().find(m => !m.system);
      if (lastReal && lastReal.role === 'user' && chat.status === 'reviewing') {
        return json({ ok: false, msg: 'پیام قبلی‌ات در حال بررسی است. تا پاسخ پشتیبان صبر کن.' });
      }

      const now = Date.now();
      chat.messages.push({ id: uid('m'), role: 'user', text, at: now });
      chat.messages.push({
        id: uid('m'), role: 'support', system: true, auto: true,
        text: '✅ پیام شما دریافت شد و در حال بررسی است. به‌محض پاسخ پشتیبان به شما اطلاع می‌دهیم.',
        at: now + 1,
      });
      chat.status = 'reviewing';
      chat.updatedAt = now;
      chat.lastUserAt = now;
      chat.unreadAdmin = (chat.unreadAdmin || 0) + 1;
      chat.userName = auth.user.name || chat.userName;
      await env.TOKENS.put('schat:' + chatId, JSON.stringify(chat));
      return json({ ok: true, chat });
    }

    // کاربر: دریافت پیام‌ها
    if (path === '/support/chat/get' && request.method === 'POST') {
      const auth = await authUser(env, body);
      if (auth.error) return json({ ok: false, msg: auth.error });
      const chatId = String(body.chatId || '');
      const raw = await env.TOKENS.get('schat:' + chatId);
      if (!raw) return json({ ok: false, msg: 'گفتگو یافت نشد' });
      let chat;
      try { chat = JSON.parse(raw); } catch (e) { return json({ ok: false, msg: 'خطا' }); }
      if (chat.userCode !== auth.code) return json({ ok: false, msg: 'دسترسی غیرمجاز' });
      return json({ ok: true, chat });
    }

    // کاربر: لیست چت‌هایش
    if (path === '/support/chat/mine' && request.method === 'POST') {
      const auth = await authUser(env, body);
      if (auth.error) return json({ ok: false, msg: auth.error });
      const all = await listByPrefix(env, 'schat:');
      const mine = all.filter(c => c.userCode === auth.code)
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      return json({ ok: true, chats: mine });
    }

    // کاربر: ثبت تیکت
    if (path === '/support/ticket/create' && request.method === 'POST') {
      const auth = await authUser(env, body);
      if (auth.error) return json({ ok: false, msg: auth.error });
      const category = String(body.category || 'other');
      const subject = String(body.subject || '').trim().slice(0, 120);
      const bodyText = String(body.body || '').trim().slice(0, 4000);
      const priority = ['low', 'normal', 'high'].includes(body.priority) ? body.priority : 'normal';
      if (!SUPPORT_CATS[category]) return json({ ok: false, msg: 'دسته نامعتبر' });
      if (subject.length < 3) return json({ ok: false, msg: 'موضوع خیلی کوتاه است' });
      if (bodyText.length < 10) return json({ ok: false, msg: 'متن تیکت را کامل‌تر بنویس' });
      const id = uid('tkt');
      const now = Date.now();
      const ticket = {
        id,
        userCode: auth.code,
        userName: auth.user.name || body.name || auth.code,
        category,
        categoryLabel: SUPPORT_CATS[category],
        subject,
        body: bodyText,
        priority,
        status: 'open', // open | reviewing | answered | closed
        replies: [],
        createdAt: now,
        updatedAt: now,
      };
      await env.TOKENS.put('stkt:' + id, JSON.stringify(ticket));
      return json({ ok: true, ticket });
    }

    if (path === '/support/ticket/mine' && request.method === 'POST') {
      const auth = await authUser(env, body);
      if (auth.error) return json({ ok: false, msg: auth.error });
      const all = await listByPrefix(env, 'stkt:');
      const mine = all.filter(t => t.userCode === auth.code)
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      return json({ ok: true, tickets: mine });
    }

    if (path === '/support/ticket/get' && request.method === 'POST') {
      const auth = await authUser(env, body);
      if (auth.error) return json({ ok: false, msg: auth.error });
      const id = String(body.ticketId || '');
      const raw = await env.TOKENS.get('stkt:' + id);
      if (!raw) return json({ ok: false, msg: 'تیکت یافت نشد' });
      let ticket;
      try { ticket = JSON.parse(raw); } catch (e) { return json({ ok: false, msg: 'خطا' }); }
      if (ticket.userCode !== auth.code) return json({ ok: false, msg: 'دسترسی غیرمجاز' });
      return json({ ok: true, ticket });
    }

    // —— ادمین: لیست چت‌ها ——
    if (path === '/admin/support/chats' && request.method === 'POST') {
      if (!isAdmin) return json({ ok: false, msg: 'دسترسی غیرمجاز' }, 401);
      let list = await listByPrefix(env, 'schat:');
      const filter = String(body.filter || 'all');
      if (filter !== 'all') list = list.filter(c => c.status === filter);
      list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      // غنی‌سازی با اطلاعات کاربر
      const enriched = [];
      for (const c of list) {
        const user = await findUserByCode(env, c.userCode);
        enriched.push({
          ...c,
          messagesPreview: (c.messages || []).slice(-3),
          messageCount: (c.messages || []).length,
          user: user ? {
            name: user.name,
            code: user.code,
            createdAt: user.createdAt,
            pro: proInfo(user),
          } : { name: c.userName, code: c.userCode, pro: { isPro: false } },
        });
      }
      return json({ ok: true, chats: enriched, total: enriched.length });
    }

    if (path === '/admin/support/chat/get' && request.method === 'POST') {
      if (!isAdmin) return json({ ok: false, msg: 'دسترسی غیرمجاز' }, 401);
      const chatId = String(body.chatId || '');
      const raw = await env.TOKENS.get('schat:' + chatId);
      if (!raw) return json({ ok: false, msg: 'گفتگو یافت نشد' });
      let chat;
      try { chat = JSON.parse(raw); } catch (e) { return json({ ok: false, msg: 'خطا' }); }
      const user = await findUserByCode(env, chat.userCode);
      // علامت خوانده‌شده
      chat.unreadAdmin = 0;
      await env.TOKENS.put('schat:' + chatId, JSON.stringify(chat));
      return json({
        ok: true,
        chat,
        user: user ? { name: user.name, code: user.code, createdAt: user.createdAt, pro: proInfo(user) }
          : { name: chat.userName, code: chat.userCode, pro: { isPro: false } },
      });
    }

    if (path === '/admin/support/chat/reply' && request.method === 'POST') {
      if (!isAdmin) return json({ ok: false, msg: 'دسترسی غیرمجاز' }, 401);
      const chatId = String(body.chatId || '');
      const text = String(body.text || '').trim().slice(0, 4000);
      if (!text) return json({ ok: false, msg: 'پیام خالی است' });
      const raw = await env.TOKENS.get('schat:' + chatId);
      if (!raw) return json({ ok: false, msg: 'گفتگو یافت نشد' });
      let chat;
      try { chat = JSON.parse(raw); } catch (e) { return json({ ok: false, msg: 'خطا' }); }
      if (chat.status === 'closed') return json({ ok: false, msg: 'گفتگو بسته است — اول بازش کن' });
      const now = Date.now();
      chat.messages.push({ id: uid('m'), role: 'support', text, at: now, auto: false });
      chat.status = 'open'; // کاربر می‌تواند دوباره پیام بدهد
      chat.updatedAt = now;
      chat.lastSupportAt = now;
      chat.unreadAdmin = 0;
      await env.TOKENS.put('schat:' + chatId, JSON.stringify(chat));
      return json({ ok: true, chat });
    }

    if (path === '/admin/support/chat/status' && request.method === 'POST') {
      if (!isAdmin) return json({ ok: false, msg: 'دسترسی غیرمجاز' }, 401);
      const chatId = String(body.chatId || '');
      const status = String(body.status || '');
      if (!['open', 'reviewing', 'closed'].includes(status)) return json({ ok: false, msg: 'وضعیت نامعتبر' });
      const raw = await env.TOKENS.get('schat:' + chatId);
      if (!raw) return json({ ok: false, msg: 'گفتگو یافت نشد' });
      let chat;
      try { chat = JSON.parse(raw); } catch (e) { return json({ ok: false, msg: 'خطا' }); }
      chat.status = status;
      chat.updatedAt = Date.now();
      if (status === 'closed') {
        chat.messages.push({
          id: uid('m'), role: 'support', system: true, auto: true,
          text: 'این گفتگو توسط پشتیبانی بسته شد. در صورت نیاز گفتگوی جدید شروع کنید.',
          at: Date.now(),
        });
      }
      await env.TOKENS.put('schat:' + chatId, JSON.stringify(chat));
      return json({ ok: true, chat });
    }

    // ادمین: تیکت‌ها
    if (path === '/admin/support/tickets' && request.method === 'POST') {
      if (!isAdmin) return json({ ok: false, msg: 'دسترسی غیرمجاز' }, 401);
      let list = await listByPrefix(env, 'stkt:');
      const filter = String(body.filter || 'all');
      if (filter !== 'all') list = list.filter(t => t.status === filter);
      list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      const enriched = [];
      for (const t of list) {
        const user = await findUserByCode(env, t.userCode);
        enriched.push({
          ...t,
          user: user ? { name: user.name, code: user.code, createdAt: user.createdAt, pro: proInfo(user) }
            : { name: t.userName, code: t.userCode, pro: { isPro: false } },
        });
      }
      return json({ ok: true, tickets: enriched, total: enriched.length });
    }

    if (path === '/admin/support/ticket/reply' && request.method === 'POST') {
      if (!isAdmin) return json({ ok: false, msg: 'دسترسی غیرمجاز' }, 401);
      const id = String(body.ticketId || '');
      const text = String(body.text || '').trim().slice(0, 4000);
      if (!text) return json({ ok: false, msg: 'پاسخ خالی است' });
      const raw = await env.TOKENS.get('stkt:' + id);
      if (!raw) return json({ ok: false, msg: 'تیکت یافت نشد' });
      let ticket;
      try { ticket = JSON.parse(raw); } catch (e) { return json({ ok: false, msg: 'خطا' }); }
      const now = Date.now();
      ticket.replies = ticket.replies || [];
      ticket.replies.push({ id: uid('r'), role: 'support', text, at: now });
      ticket.status = 'answered';
      ticket.updatedAt = now;
      await env.TOKENS.put('stkt:' + id, JSON.stringify(ticket));
      return json({ ok: true, ticket });
    }

    if (path === '/admin/support/ticket/status' && request.method === 'POST') {
      if (!isAdmin) return json({ ok: false, msg: 'دسترسی غیرمجاز' }, 401);
      const id = String(body.ticketId || '');
      const status = String(body.status || '');
      if (!['open', 'reviewing', 'answered', 'closed'].includes(status)) return json({ ok: false, msg: 'وضعیت نامعتبر' });
      const raw = await env.TOKENS.get('stkt:' + id);
      if (!raw) return json({ ok: false, msg: 'تیکت یافت نشد' });
      let ticket;
      try { ticket = JSON.parse(raw); } catch (e) { return json({ ok: false, msg: 'خطا' }); }
      ticket.status = status;
      ticket.updatedAt = Date.now();
      await env.TOKENS.put('stkt:' + id, JSON.stringify(ticket));
      return json({ ok: true, ticket });
    }


    return json({ ok: false, msg: 'مسیر نامعتبر' }, 404);

  },
};
