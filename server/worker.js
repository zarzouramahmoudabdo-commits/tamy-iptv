/* TAMY IPTV — خادم خفيف على Cloudflare Workers (مجاني)
 * المميزات: مباريات، أوقات الصلاة، إعلانات، آخر إصدار، حسابات ومزامنة مشفّرة.
 *
 * الأمان:
 *  - كلمة المرور لا تغادر الجهاز أبداً: التطبيق يشتق منها مفتاحين (مفتاح دخول + مفتاح تشفير).
 *    السيرفر يستلم مفتاح الدخول فقط، ويخزّنه مجزّأً (PBKDF2 + salt).
 *  - بيانات المزامنة (فيها اشتراكاتك) تصل مشفّرة AES-GCM من الجهاز؛ السيرفر لا يملك مفتاح فكّها.
 *  - حدّ للمحاولات، حدّ لحجم الطلب، CORS لمواقع محددة فقط، رموز موقّعة HMAC بصلاحية 30 يوماً.
 *
 * المتطلبات (Settings → Bindings / Variables):
 *   KV namespace باسم  KV
 *   Secret  SECRET       (نص عشوائي طويل 32+ حرف)
 *   Secret  ADMIN_TOKEN  (لإدارة الإعلانات والمباريات اليدوية)
 *   اختياري: INVITE_CODE (لو وضعته، لا يستطيع أحد إنشاء حساب إلا بهذا الكود)
 *   اختياري: REPO (مثل owner/repo لقراءة آخر إصدار)  LEAGUES (كلمات مفصولة بفواصل)
 */

const MAX_BODY = 300 * 1024;          // 300KB
const TOKEN_DAYS = 30;
const PBKDF2_ITER = 100000;           // أقصى قيمة يدعمها Workers
const te = new TextEncoder();

/* ───────── أدوات ───────── */
const b64u = {
  enc: buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)),
};
const okOrigin = o => !!o && (/^https:\/\/[a-z0-9-]+\.github\.io$/i.test(o) || /^(https?|capacitor):\/\/localhost(:\d+)?$/i.test(o));

function headers(req, extra) {
  const h = {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Vary': 'Origin',
    ...extra,
  };
  const o = req.headers.get('Origin');
  if (okOrigin(o)) {
    h['Access-Control-Allow-Origin'] = o;
    h['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
    h['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
    h['Access-Control-Max-Age'] = '86400';
  }
  return h;
}
const send = (req, data, status = 200, extra) => new Response(JSON.stringify(data), { status, headers: headers(req, extra) });
const fail = (req, status, error) => send(req, { error }, status, { 'Cache-Control': 'no-store' });

function safeEq(a, b) {                         // مقارنة بزمن ثابت
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function hmac(secret, msg) {
  const k = await crypto.subtle.importKey('raw', te.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u.enc(await crypto.subtle.sign('HMAC', k, te.encode(msg)));
}
async function pbkdf2(secret, salt) {
  const k = await crypto.subtle.importKey('raw', te.encode(secret), 'PBKDF2', false, ['deriveBits']);
  return b64u.enc(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITER }, k, 256));
}
async function readJson(req) {
  const len = +req.headers.get('Content-Length') || 0;
  if (len > MAX_BODY) throw { status: 413, msg: 'too large' };
  const t = await req.text();
  if (t.length > MAX_BODY) throw { status: 413, msg: 'too large' };
  try { const j = JSON.parse(t); if (!j || typeof j !== 'object') throw 0; return j; } catch { throw { status: 400, msg: 'bad json' }; }
}
const ip = req => req.headers.get('CF-Connecting-IP') || 'x';

/* حدّ المحاولات (KV: تقريبي لكنه كافٍ لمنع التخمين) */
async function limited(env, key, max, ttl) {
  const n = +(await env.KV.get('rl:' + key)) || 0;
  if (n >= max) return true;
  await env.KV.put('rl:' + key, String(n + 1), { expirationTtl: Math.max(60, ttl) });
  return false;
}

/* ───────── الحسابات ───────── */
const validUser = u => typeof u === 'string' && /^[a-z0-9_.-]{3,32}$/.test(u);
const validKey = k => typeof k === 'string' && /^[A-Za-z0-9_-]{20,128}$/.test(k);

async function makeToken(env, user) {
  const p = b64u.enc(te.encode(JSON.stringify({ u: user, e: Date.now() + TOKEN_DAYS * 864e5 })));
  return p + '.' + await hmac(env.SECRET, p);
}
async function authUser(req, env) {
  const m = /^Bearer (.+)$/.exec(req.headers.get('Authorization') || ''); if (!m) return null;
  const [p, s] = m[1].split('.'); if (!p || !s) return null;
  if (!safeEq(s, await hmac(env.SECRET, p))) return null;
  try { const d = JSON.parse(new TextDecoder().decode(b64u.dec(p))); return d.e > Date.now() && validUser(d.u) ? d.u : null; } catch { return null; }
}

async function register(req, env) {
  const b = await readJson(req); const user = String(b.username || '').toLowerCase();
  if (!validUser(user) || !validKey(b.authKey)) return fail(req, 400, 'invalid input');
  if (env.INVITE_CODE && !safeEq(String(b.invite || ''), env.INVITE_CODE)) return fail(req, 403, 'invite required');
  if (await limited(env, 'reg:' + ip(req), 5, 3600)) return fail(req, 429, 'too many attempts');
  if (await env.KV.get('u:' + user)) return fail(req, 409, 'username taken');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  await env.KV.put('u:' + user, JSON.stringify({ salt: b64u.enc(salt), hash: await pbkdf2(b.authKey, salt), created: Date.now() }));
  return send(req, { token: await makeToken(env, user), username: user }, 201, { 'Cache-Control': 'no-store' });
}

async function login(req, env) {
  const b = await readJson(req); const user = String(b.username || '').toLowerCase();
  if (!validUser(user) || !validKey(b.authKey)) return fail(req, 400, 'invalid input');
  if (await limited(env, 'ipl:' + ip(req), 20, 900) || await limited(env, 'usr:' + user, 10, 900)) return fail(req, 429, 'too many attempts');
  const rec = JSON.parse((await env.KV.get('u:' + user)) || 'null');
  // نفس زمن الاستجابة سواء وُجد الحساب أم لا
  const salt = rec ? b64u.dec(rec.salt) : crypto.getRandomValues(new Uint8Array(16));
  const h = await pbkdf2(b.authKey, salt);
  if (!rec || !safeEq(h, rec.hash)) return fail(req, 401, 'wrong username or password');
  return send(req, { token: await makeToken(env, user), username: user }, 200, { 'Cache-Control': 'no-store' });
}

/* ───────── المزامنة (بيانات مشفّرة من الجهاز) ───────── */
async function sync(req, env, user) {
  const key = 'd:' + user;
  if (req.method === 'GET') {
    const d = JSON.parse((await env.KV.get(key)) || 'null');
    return send(req, d || { rev: 0, blob: '', updated: 0 }, 200, { 'Cache-Control': 'no-store' });
  }
  const b = await readJson(req);
  if (typeof b.blob !== 'string' || b.blob.length > 250 * 1024 || !/^[A-Za-z0-9+/=_-]*$/.test(b.blob)) return fail(req, 400, 'invalid blob');
  const cur = JSON.parse((await env.KV.get(key)) || 'null') || { rev: 0 };
  if ((+b.rev || 0) !== cur.rev) return send(req, { error: 'conflict', rev: cur.rev, updated: cur.updated || 0 }, 409, { 'Cache-Control': 'no-store' });
  const nd = { rev: cur.rev + 1, blob: b.blob, updated: Date.now() };
  await env.KV.put(key, JSON.stringify(nd));
  return send(req, { rev: nd.rev, updated: nd.updated }, 200, { 'Cache-Control': 'no-store' });
}

async function delAccount(req, env, user) {
  await env.KV.delete('u:' + user); await env.KV.delete('d:' + user);
  return send(req, { ok: true });
}

/* ───────── محتوى عام (مخزّن مؤقتاً) ───────── */
async function cached(env, key, ttlMs, make) {
  const raw = JSON.parse((await env.KV.get(key)) || 'null');
  if (raw && Date.now() - raw.t < ttlMs) return raw.v;
  try {
    const v = await make();
    await env.KV.put(key, JSON.stringify({ t: Date.now(), v }), { expirationTtl: 86400 });
    return v;
  } catch (e) { if (raw) return raw.v; throw e; }       // لو المصدر فشل نرجّع آخر نسخة
}

async function matches(req, env) {
  const v = await cached(env, 'c:matches', 15 * 60e3, async () => {
    const words = (env.LEAGUES || 'Egyptian,Premier League,La Liga,Champions League,Saudi,Serie A,Bundesliga,Ligue 1,CAF,World Cup').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
    const out = [];
    for (let d = 0; d < 2; d++) {
      const day = new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
      const r = await fetch(`https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=${day}&s=Soccer`, { headers: { 'User-Agent': 'tamy-iptv-worker' } });
      if (!r.ok) throw new Error('src ' + r.status);
      const j = await r.json();
      for (const e of (j.events || [])) {
        const lg = String(e.strLeague || ''); if (!words.some(w => lg.toLowerCase().includes(w))) continue;
        const ts = e.strTimestamp ? (e.strTimestamp.endsWith('Z') ? e.strTimestamp : e.strTimestamp + 'Z') : (e.dateEvent && e.strTime ? e.dateEvent + 'T' + e.strTime + 'Z' : null);
        out.push({ id: e.idEvent, league: lg, home: e.strHomeTeam, away: e.strAwayTeam, homeBadge: e.strHomeTeamBadge || '', awayBadge: e.strAwayTeamBadge || '', ts, score: e.intHomeScore != null ? e.intHomeScore + ' - ' + e.intAwayScore : '' });
      }
    }
    return out;
  }).catch(() => []);
  const manual = JSON.parse((await env.KV.get('matches:manual')) || '[]');
  const all = [...manual, ...v].filter(m => m.ts).sort((a, b) => a.ts.localeCompare(b.ts)).slice(0, 40);
  return send(req, { matches: all }, 200, { 'Cache-Control': 'public, max-age=300' });
}

async function announcements(req, env) {
  const list = JSON.parse((await env.KV.get('ann')) || '[]').filter(a => !a.until || a.until > Date.now());
  return send(req, { items: list }, 200, { 'Cache-Control': 'public, max-age=120' });
}

async function version(req, env) {
  if (!env.REPO) return send(req, { tag: '', url: '' });
  const v = await cached(env, 'c:ver', 10 * 60e3, async () => {
    const r = await fetch(`https://api.github.com/repos/${env.REPO}/releases/latest`, { headers: { 'User-Agent': 'tamy-iptv-worker', Accept: 'application/vnd.github+json' } });
    if (!r.ok) throw new Error('gh ' + r.status);
    const j = await r.json(); const a = (j.assets || []).find(x => /\.apk$/i.test(x.name));
    return { tag: j.tag_name, name: j.name, body: String(j.body || '').slice(0, 500), url: j.html_url, apk: a ? a.browser_download_url : '' };
  }).catch(() => ({ tag: '', url: '' }));
  return send(req, v, 200, { 'Cache-Control': 'public, max-age=300' });
}

async function prayer(req, env, url) {
  const lat = +url.searchParams.get('lat'), lng = +url.searchParams.get('lng'), method = +url.searchParams.get('method') || 5;
  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || method < 0 || method > 24) return fail(req, 400, 'invalid location');
  const key = `c:pr:${lat.toFixed(2)}:${lng.toFixed(2)}:${method}:${new Date().toISOString().slice(0, 10)}`;
  const v = await cached(env, key, 12 * 3600e3, async () => {
    const r = await fetch(`https://api.aladhan.com/v1/timings?latitude=${lat}&longitude=${lng}&method=${method}`, { headers: { 'User-Agent': 'tamy-iptv-worker' } });
    if (!r.ok) throw new Error('src ' + r.status);
    const j = await r.json(); return { timings: j.data.timings, hijri: j.data.date && j.data.date.hijri };
  });
  return send(req, v, 200, { 'Cache-Control': 'public, max-age=3600' });
}

/* ───────── الإدارة (بـ ADMIN_TOKEN) ───────── */
async function admin(req, env, path) {
  const t = (req.headers.get('Authorization') || '').replace(/^Bearer /, '');
  if (!env.ADMIN_TOKEN || !safeEq(t, env.ADMIN_TOKEN)) return fail(req, 401, 'unauthorized');
  const b = await readJson(req);
  if (path === '/api/admin/announcements' && Array.isArray(b.items)) {
    const items = b.items.slice(0, 10).map((a, i) => ({ id: String(a.id || i), title: String(a.title || '').slice(0, 80), body: String(a.body || '').slice(0, 300), url: /^https:\/\//.test(a.url || '') ? a.url : '', until: +a.until || 0 }));
    await env.KV.put('ann', JSON.stringify(items)); return send(req, { ok: true, count: items.length });
  }
  if (path === '/api/admin/matches' && Array.isArray(b.items)) {
    const items = b.items.slice(0, 30).map((m, i) => ({ id: 'm' + i, league: String(m.league || '').slice(0, 60), home: String(m.home || '').slice(0, 40), away: String(m.away || '').slice(0, 40), homeBadge: '', awayBadge: '', ts: String(m.ts || ''), score: '' }));
    await env.KV.put('matches:manual', JSON.stringify(items)); return send(req, { ok: true, count: items.length });
  }
  return fail(req, 400, 'bad request');
}

/* ───────── التوجيه ───────── */
export default {
  async fetch(req, env) {
    const url = new URL(req.url), path = url.pathname.replace(/\/+$/, '') || '/';
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(req) });
    try {
      if (!env.KV || !env.SECRET) return fail(req, 500, 'server not configured');
      if (path === '/api/health') return send(req, { ok: true });
      if (req.method === 'GET') {
        if (path === '/api/matches') return await matches(req, env);
        if (path === '/api/announcements') return await announcements(req, env);
        if (path === '/api/version') return await version(req, env);
        if (path === '/api/prayer') return await prayer(req, env, url);
      }
      if (req.method === 'POST' && path === '/api/auth/register') return await register(req, env);
      if (req.method === 'POST' && path === '/api/auth/login') return await login(req, env);
      if (req.method === 'POST' && path.startsWith('/api/admin/')) return await admin(req, env, path);
      if (path === '/api/sync' || path === '/api/account') {
        const user = await authUser(req, env); if (!user) return fail(req, 401, 'unauthorized');
        if (path === '/api/sync' && (req.method === 'GET' || req.method === 'PUT')) return await sync(req, env, user);
        if (path === '/api/account' && req.method === 'DELETE') return await delAccount(req, env, user);
      }
      return fail(req, 404, 'not found');
    } catch (e) {
      if (e && e.status) return fail(req, e.status, e.msg);
      return fail(req, 500, 'server error');            // لا نكشف تفاصيل داخلية
    }
  },
};
