/* TAMY IPTV — مشغّل IPTV (M3U / Xtream) + راديو + مواقيت الصلاة
   المحتوى من اشتراك المستخدم؛ التطبيق لا يوفّر قنوات مدفوعة. */
(() => {
'use strict';

/* ───────────── helpers ───────────── */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const enc = encodeURIComponent;
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch {} }
};
const uidGen = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const msg = e => String((e && e.message) || e || 'Error');
let lang = LS.get('tamy:lang', 'ar');
const L = (ar, en) => (lang === 'ar' ? ar : en);

async function sha(s) {
  try {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  } catch { let h = 5381; for (const c of s) h = ((h << 5) + h + c.charCodeAt(0)) | 0; return 'x' + h; }
}

const isNative = () => !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform());
async function apiText(url) {
  if (isNative() && Capacitor.Plugins && Capacitor.Plugins.CapacitorHttp) {
    try {
      const r = await Capacitor.Plugins.CapacitorHttp.get({ url, responseType: 'text', connectTimeout: 20000, readTimeout: 90000 });
      if (r.status >= 400) throw new Error('HTTP ' + r.status);
      return typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
    } catch (e) { if (/HTTP/.test(msg(e))) throw e; }
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.text();
}
const apiJson = async u => JSON.parse(await apiText(u));

/* ───────────── data ───────────── */
const COUNTRIES = [['EG', 'مصر', 'Egypt'], ['SA', 'السعودية', 'Saudi Arabia'], ['AE', 'الإمارات', 'UAE'], ['KW', 'الكويت', 'Kuwait'], ['QA', 'قطر', 'Qatar'], ['BH', 'البحرين', 'Bahrain'], ['OM', 'عُمان', 'Oman'], ['JO', 'الأردن', 'Jordan'], ['LB', 'لبنان', 'Lebanon'], ['SY', 'سوريا', 'Syria'], ['IQ', 'العراق', 'Iraq'], ['PS', 'فلسطين', 'Palestine'], ['YE', 'اليمن', 'Yemen'], ['LY', 'ليبيا', 'Libya'], ['TN', 'تونس', 'Tunisia'], ['DZ', 'الجزائر', 'Algeria'], ['MA', 'المغرب', 'Morocco'], ['SD', 'السودان', 'Sudan'], ['TR', 'تركيا', 'Turkey'], ['IR', 'إيران', 'Iran'], ['US', 'أمريكا', 'USA'], ['GB', 'بريطانيا', 'UK'], ['CA', 'كندا', 'Canada'], ['FR', 'فرنسا', 'France'], ['DE', 'ألمانيا', 'Germany'], ['ES', 'إسبانيا', 'Spain'], ['IT', 'إيطاليا', 'Italy'], ['PT', 'البرتغال', 'Portugal'], ['NL', 'هولندا', 'Netherlands'], ['BE', 'بلجيكا', 'Belgium'], ['CH', 'سويسرا', 'Switzerland'], ['AT', 'النمسا', 'Austria'], ['SE', 'السويد', 'Sweden'], ['NO', 'النرويج', 'Norway'], ['DK', 'الدنمارك', 'Denmark'], ['FI', 'فنلندا', 'Finland'], ['PL', 'بولندا', 'Poland'], ['RU', 'روسيا', 'Russia'], ['UA', 'أوكرانيا', 'Ukraine'], ['GR', 'اليونان', 'Greece'], ['RO', 'رومانيا', 'Romania'], ['IN', 'الهند', 'India'], ['PK', 'باكستان', 'Pakistan'], ['BD', 'بنغلاديش', 'Bangladesh'], ['ID', 'إندونيسيا', 'Indonesia'], ['MY', 'ماليزيا', 'Malaysia'], ['CN', 'الصين', 'China'], ['JP', 'اليابان', 'Japan'], ['KR', 'كوريا الجنوبية', 'South Korea'], ['AU', 'أستراليا', 'Australia'], ['BR', 'البرازيل', 'Brazil'], ['AR', 'الأرجنتين', 'Argentina'], ['MX', 'المكسيك', 'Mexico'], ['ZA', 'جنوب أفريقيا', 'South Africa'], ['NG', 'نيجيريا', 'Nigeria'], ['KE', 'كينيا', 'Kenya'], ['ET', 'إثيوبيا', 'Ethiopia']];
const CATS = [['news', 'أخبار', 'News'], ['sports', 'رياضة', 'Sports'], ['movies', 'أفلام', 'Movies'], ['series', 'مسلسلات', 'Series'], ['kids', 'أطفال', 'Kids'], ['animation', 'كرتون', 'Animation'], ['music', 'موسيقى', 'Music'], ['entertainment', 'ترفيه', 'Entertainment'], ['religious', 'دينية', 'Religious'], ['documentary', 'وثائقي', 'Documentary'], ['comedy', 'كوميديا', 'Comedy'], ['culture', 'ثقافة', 'Culture'], ['education', 'تعليم', 'Education'], ['family', 'عائلة', 'Family'], ['lifestyle', 'أسلوب حياة', 'Lifestyle'], ['cooking', 'طبخ', 'Cooking'], ['travel', 'سفر', 'Travel'], ['science', 'علوم', 'Science'], ['business', 'أعمال', 'Business'], ['weather', 'طقس', 'Weather'], ['general', 'عام', 'General']];
const THEMES = [['morph', 'TAMY', 'TAMY'], ['ahly', 'الأهلي', 'Ahly'], ['zamalek', 'الزمالك', 'Zamalek'], ['real', 'Real Madrid', 'Real Madrid'], ['barca', 'Barcelona', 'Barcelona']];
const PRAYERS = [['Fajr', 'الفجر', 'Fajr'], ['Sunrise', 'الشروق', 'Sunrise'], ['Dhuhr', 'الظهر', 'Dhuhr'], ['Asr', 'العصر', 'Asr'], ['Maghrib', 'المغرب', 'Maghrib'], ['Isha', 'العشاء', 'Isha']];
const ADHKAR = [
  ['اللَّهُمَّ بِكَ أَصْبَحْنَا، وَبِكَ أَمْسَيْنَا، وَبِكَ نَحْيَا، وَبِكَ نَمُوتُ، وَإِلَيْكَ النُّشُورُ', 'O Allah, by You we reach the morning and by You we reach the evening, by You we live and die, and to You is the resurrection.', 'morning'],
  ['اللَّهُمَّ بِكَ أَمْسَيْنَا، وَبِكَ أَصْبَحْنَا، وَبِكَ نَحْيَا، وَبِكَ نَمُوتُ، وَإِلَيْكَ الْمَصِيرُ', 'O Allah, by You we reach the evening and by You we reach the morning, by You we live and die, and to You is the final return.', 'evening'],
  ['سُبْحَانَ اللَّهِ وَبِحَمْدِهِ، سُبْحَانَ اللَّهِ الْعَظِيمِ', 'Glory and praise be to Allah, glory be to Allah the Magnificent.', 'any'],
  ['لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ', 'There is no god but Allah alone, with no partner; His is the dominion and His is the praise, and He is able to do all things.', 'any']
];
const QURAN_FALLBACK = [{ id: 'radio|https://stream.radiojar.com/8s5u5tpdtwzuv', name: 'إذاعة القرآن الكريم - القاهرة', url: 'https://stream.radiojar.com/8s5u5tpdtwzuv', kind: 'radio', group: 'quran', logo: '' }];

/* ───────────── state ───────────── */
let users = LS.get('tamy:users', []);
let uid = LS.get('tamy:uid', null);
let U = null;
const DEF = () => ({ sources: [], favs: [], recent: {}, pos: {}, settings: { theme: 'morph', city: 'Cairo', country: 'Egypt', method: 5, lat: null, lng: null, adhan: true, adhanUrl: '', engine: 'auto' } });
function loadU() { U = LS.get('tamy:u:' + uid, null) || DEF(); U.settings = Object.assign(DEF().settings, U.settings || {}); U.pos = U.pos || {}; U.recent = U.recent || {}; applyTheme(); }
function saveU() { if (uid) LS.set('tamy:u:' + uid, U); }
function applyTheme() {
  document.documentElement.dataset.theme = (U && U.settings.theme) || 'morph';
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
}
let toastT;
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.remove('hidden'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), 2600); }

/* ───────────── playlists ───────────── */
const cache = new Map();
function parseM3U(txt) {
  const out = []; let meta = null;
  for (const raw of txt.split(/\r?\n/)) {
    const l = raw.trim(); if (!l) continue;
    if (l.startsWith('#EXTINF')) {
      const q = l.lastIndexOf('"'); const c = l.indexOf(',', q > 0 ? q : 0);
      const name = c >= 0 ? l.slice(c + 1).trim() : '';
      const g = a => { const m = l.match(new RegExp(a + '="([^"]*)"', 'i')); return m ? m[1] : ''; };
      meta = { name: name || g('tvg-name') || '—', logo: g('tvg-logo'), group: g('group-title') };
    } else if (l[0] !== '#' && /^(https?|rtmp|rtsp):/i.test(l)) {
      if (!meta) meta = { name: l.split('/').pop(), logo: '', group: '' };
      const kind = /\/series\//i.test(l) ? 'series' : (/\/movie\//i.test(l) || /\.(mp4|mkv|avi)(\?|$)/i.test(l)) ? 'movie' : 'live';
      out.push({ id: kind + '|' + l, name: meta.name, logo: meta.logo, group: meta.group || '—', url: l, kind });
      meta = null;
    }
  }
  return out;
}
async function loadM3U(url) {
  if (cache.has(url)) return cache.get(url);
  const items = parseM3U(await apiText(url));
  if (!items.length) throw new Error(L('القائمة فارغة أو غير صالحة', 'Empty or invalid playlist'));
  cache.set(url, items); return items;
}
const xBase = u => u.trim().replace(/\/+$/, '').replace(/\/(player_api|get|panel_api)\.php.*$/i, '');
const catMap = c => Object.fromEntries((Array.isArray(c) ? c : []).map(x => [x.category_id, x.category_name]));
async function xLoad(s, kind) {
  const b = xBase(s.url), u = enc(s.user), p = enc(s.pass);
  const call = a => apiJson(`${b}/player_api.php?username=${u}&password=${p}&action=${a}`);
  const arr = x => (Array.isArray(x) ? x : []);
  if (kind === 'live') {
    const [c, l] = await Promise.all([call('get_live_categories'), call('get_live_streams')]); const m = catMap(c);
    return arr(l).map(x => ({ id: 'live|' + s.id + '|' + x.stream_id, name: x.name, logo: x.stream_icon, group: m[x.category_id] || '—', url: `${b}/live/${u}/${p}/${x.stream_id}.m3u8`, kind: 'live' }));
  }
  if (kind === 'movie') {
    const [c, l] = await Promise.all([call('get_vod_categories'), call('get_vod_streams')]); const m = catMap(c);
    return arr(l).map(x => ({ id: 'movie|' + s.id + '|' + x.stream_id, name: x.name, logo: x.stream_icon, group: m[x.category_id] || '—', url: `${b}/movie/${u}/${p}/${x.stream_id}.${x.container_extension || 'mp4'}`, kind: 'movie' }));
  }
  const [c, l] = await Promise.all([call('get_series_categories'), call('get_series')]); const m = catMap(c);
  return arr(l).map(x => ({ id: 'series|' + s.id + '|' + x.series_id, name: x.name, logo: x.cover, group: m[x.category_id] || '—', kind: 'series', sid: x.series_id, srcId: s.id }));
}
const xc = new Map();
async function loadSource(s, kind) {
  const key = s.id + '|' + kind; if (xc.has(key)) return xc.get(key);
  let items;
  if (s.type === 'xtream') items = await xLoad(s, kind);
  else {
    const all = s.type === 'file' ? parseM3U(LS.get('tamy:file:' + s.id, '')) : await loadM3U(s.url);
    items = all.filter(i => i.kind === kind);
  }
  xc.set(key, items); return items;
}
async function getItems(src, kind) {
  if (src.startsWith('free:')) {
    const cc = src.slice(5);
    return loadM3U(cc === 'world' ? 'https://iptv-org.github.io/iptv/index.m3u' : `https://iptv-org.github.io/iptv/countries/${cc.toLowerCase()}.m3u`);
  }
  if (src.startsWith('cat:')) return loadM3U(`https://iptv-org.github.io/iptv/categories/${src.slice(4)}.m3u`);
  const s = U.sources.find(x => 'src:' + x.id === src);
  if (!s) throw new Error(L('المصدر غير موجود', 'Source not found'));
  return loadSource(s, kind);
}

/* ───────────── favorites / recent ───────────── */
const isFav = id => U.favs.some(f => f.id === id);
function toggleFav(item) {
  const i = U.favs.findIndex(f => f.id === item.id);
  if (i >= 0) U.favs.splice(i, 1); else U.favs.unshift({ id: item.id, name: item.name, logo: item.logo, url: item.url, kind: item.kind, group: item.group, sid: item.sid, srcId: item.srcId });
  saveU(); return i < 0;
}
function saveRecent(item) {
  if (!['live', 'movie', 'series'].includes(item.kind)) return;
  U.recent[item.kind] = { id: item.id, name: item.name, logo: item.logo, url: item.url, kind: item.kind, group: item.group };
  saveU();
}

/* ───────────── router ───────────── */
const SCREENS = ['home', 'live', 'movies', 'series', 'favs', 'radio', 'prayer', 'settings'];
let screen = 'home';
function nav(s, push = true) {
  if (!uid) return renderAuth();
  screen = s;
  if (push) history.pushState({ s }, '');
  render();
  window.scrollTo(0, 0);
}
function render() {
  if (!uid) return renderAuth();
  renderTop();
  const v = $('#view');
  ({ home: vHome, live: () => vList(LV), movies: () => vList(MV), series: () => vList(SV), favs: vFavs, radio: vRadio, prayer: vPrayer, settings: vSettings }[screen] || vHome)(v);
}
function renderTop() {
  const lbl = { home: L('الهوم', 'Home'), live: L('البث المباشر', 'Live TV'), movies: L('أفلام', 'Movies'), series: L('مسلسلات', 'Series'), favs: L('المفضلة', 'Favorites'), radio: L('الراديو', 'Radio'), prayer: L('مواقيت الصلاة', 'Prayer'), settings: L('الإعدادات', 'Settings') };
  $('#topbar').innerHTML = `
  <div class="tb-row"><div class="brand"><img src="icons/icon-192.png" alt=""><span>TAMY <b>IPTV</b></span></div><div class="sp"></div>
    <button class="ibtn" data-act="search" aria-label="search">🔍</button>
    <button class="ibtn" data-act="back" aria-label="back">${lang === 'ar' ? '→' : '←'}</button></div>
  <div class="pills">${SCREENS.map(s => `<button class="pill ${s === screen ? 'on' : ''}" data-act="go" data-to="${s}">${lbl[s]}</button>`).join('')}</div>`;
}
window.addEventListener('popstate', e => {
  if (!$('#player').classList.contains('hidden')) return closePlayer(true);
  if (!$('#modal').classList.contains('hidden')) return closeModal(true);
  const st = e.state;
  if (st && st.o) return history.back();
  screen = (st && st.s) || 'home'; render();
});

/* ───────────── modal ───────────── */
function modal(html) {
  const m = $('#modal');
  if (m.classList.contains('hidden')) history.pushState({ o: 1 }, '');
  m.innerHTML = `<div class="mbox" role="dialog">${html}</div>`; m.classList.remove('hidden');
  const f = $('input,button,select', m); if (f) setTimeout(() => f.focus(), 50);
}
function closeModal(fromPop) {
  const m = $('#modal'); if (m.classList.contains('hidden')) return;
  m.classList.add('hidden'); m.innerHTML = '';
  if (!fromPop) { try { history.back(); } catch {} }
}
function closeModalSilent() { const m = $('#modal'); m.classList.add('hidden'); m.innerHTML = ''; }

/* ───────────── auth ───────────── */
let authMode = 'in';
function renderAuth() {
  $('#topbar').innerHTML = '';
  $('#view').innerHTML = `<div class="auth"><img src="icons/icon-512.png" alt="">
    <h1>TAMY IPTV</h1><p>${L('تلفزيونك. عالمك.', 'Your TV. Your world.')}</p>
    ${users.length && authMode === 'in' ? `<select class="in" id="a-user">${users.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select>` : ''}
    ${authMode === 'up' ? `<input class="in" id="a-name" placeholder="${L('الاسم', 'Name')}" autocomplete="username">` : ''}
    <input class="in" id="a-pass" type="password" placeholder="${L('كلمة المرور', 'Password')}" autocomplete="current-password">
    ${authMode === 'in' && users.length ? `<button class="btn pri" data-act="login">${L('تسجيل الدخول', 'Sign in')}</button>` : ''}
    ${authMode === 'up' || !users.length ? `<button class="btn pri" data-act="signup">${L('إنشاء حساب', 'Create account')}</button>` : ''}
    <button class="btn" data-act="authmode">${authMode === 'in' && users.length ? L('حساب جديد', 'New account') : users.length ? L('لدي حساب', 'I have an account') : ''}</button>
    <button class="btn" data-act="guest">${L('متابعة كضيف', 'Continue as guest')}</button>
    <p class="note">${L('الحسابات محفوظة على جهازك فقط.', 'Accounts are stored on this device only.')}</p>
    <button class="chip" data-act="lang">${lang === 'ar' ? 'English' : 'العربية'}</button></div>`;
}
async function enter(id) { uid = id; LS.set('tamy:uid', id); loadU(); history.replaceState({ s: 'home' }, ''); screen = 'home'; render(); }

/* ───────────── home ───────────── */
function vHome(v) {
  const r = U.recent;
  const cc = (k, ic, label, it) => `<div class="cc"><div style="min-width:0"><small>${label}</small><b>${it ? esc(it.name) : (k === 'live' ? L('لا قناة بعد', 'No channel yet') : k === 'movie' ? L('لا فيلم بعد', 'No movie yet') : L('لا مسلسل بعد', 'No series yet'))}</b>
    <button class="btn sm" data-act="${it ? 'resume' : 'go'}" data-k="${k}" data-to="${k === 'live' ? 'live' : k === 'movie' ? 'movies' : 'series'}">${it ? L('تشغيل', 'Play') : L('تصفّح', 'Browse')}</button></div><span style="font-size:34px">${ic}</span></div>`;
  v.innerHTML = `
  <section class="hero"><small>TAMY · IPTV</small><h1>${L('تلفزيونك. عالمك.', 'Your TV. Your world.')}</h1>
    <p>${L('قنوات مباشرة وأفلام ومسلسلات واشتراكك كله في مكان واحد.', 'Live TV, movies and series — all your entertainment in one place.')}</p>
    <button class="btn pri" data-act="go" data-to="live">▶ ${L('شاهد الآن', 'Watch now')}</button></section>
  <div class="tiles">
    <button class="tile t1" data-act="go" data-to="live"><span class="ic">📺</span><b>${L('بث مباشر', 'Live TV')}</b><span>${L('قنوات مصر والعالم', 'Egypt & world channels')}</span></button>
    <button class="tile t2" data-act="go" data-to="movies"><span class="ic">🎬</span><b>${L('أفلام', 'Movies')}</b><span>${L('فيلمك القادم', 'Find your next movie')}</span></button>
    <button class="tile t3" data-act="go" data-to="series"><span class="ic">🎞️</span><b>${L('مسلسلات', 'Series')}</b><span>${L('حلقة بعد حلقة', 'One episode after another')}</span></button>
    <button class="tile t4" data-act="go" data-to="favs"><span class="ic">♥</span><b>${L('المفضلة', 'Favorites')}</b><span>${L('محفوظاتك', 'Your saved titles')}</span></button>
    <button class="tile t5" data-act="go" data-to="radio"><span class="ic">🎵</span><b>${L('راديو', 'Music & Radio')}</b><span>${L('قرآن و FM', 'Quran & FM')}</span></button>
    <button class="tile t6" data-act="go" data-to="prayer"><span class="ic">🕌</span><b>${L('مواقيت الصلاة', 'Prayer times')}</b><span>${L('الأذان والمواقيت', 'Adhan & times')}</span></button>
  </div>
  <h2 class="sec">${L('كمّل المشاهدة', 'Continue watching')}</h2>
  <div class="cont">${cc('live', '📺', L('آخر قناة', 'Last channel'), r.live)}${cc('movie', '🎬', L('آخر فيلم', 'Last movie'), r.movie)}${cc('series', '🎞️', L('آخر مسلسل', 'Last series'), r.series)}</div>
  <p class="note">${L('المحتوى من اشتراكك — TAMY IPTV لا يوفّر قنوات مدفوعة. القنوات المجانية المعروضة من قوائم عامة (iptv-org).', 'Content comes from your subscription — TAMY IPTV does not supply paid channels. Free channels come from public lists (iptv-org).')}</p>`;
}

/* ───────────── list screens (live / movies / series / favs) ───────────── */
const mk = kind => ({ kind, src: null, group: 'all', q: '', items: [], shown: 60, loading: false, err: '', loaded: false });
const LV = mk('live'), MV = mk('movie'), SV = mk('series'), FV = Object.assign(mk('fav'), { loaded: true });
LV.src = 'free:EG';
let curList = [];
const ICON = { live: '📺', movie: '🎬', series: '🎞️', radio: '📻' };

async function loadList(S) {
  S.loading = true; S.err = ''; S.items = []; repaint(S);
  try { S.items = await getItems(S.src, S.kind); } catch (e) { S.err = msg(e); }
  S.loading = false; S.loaded = true; S.group = 'all'; S.shown = 60; repaint(S);
}
const repaint = S => { if ((S === LV && screen === 'live') || (S === MV && screen === 'movies') || (S === SV && screen === 'series')) render(); };
function filt(S) {
  const q = S.q.trim().toLowerCase();
  return S.items.filter(i => (S.group === 'all' || i.group === S.group) && (!q || (i.name || '').toLowerCase().includes(q)));
}
function cardHtml(i, idx) {
  const poster = i.kind === 'movie' || i.kind === 'series';
  const ph = `<span class="ph">${ICON[i.kind] || '📺'}</span>`;
  return `<div class="card ${poster ? 'p' : ''}" tabindex="0" data-act="open" data-i="${idx}">
    <div class="im">${i.logo ? `<img loading="lazy" referrerpolicy="no-referrer" src="${esc(i.logo)}" alt="" onerror="this.outerHTML='${ph}'">` : ph}</div>
    <div class="nm">${esc(i.name)}</div>
    <button class="fv ${isFav(i.id) ? 'on' : ''}" data-act="fav" data-i="${idx}" aria-label="fav">${isFav(i.id) ? '★' : '☆'}</button></div>`;
}
function gridHtml(S) {
  curList = S === FV ? favItems() : filt(S);
  const shown = curList.slice(0, S.shown), poster = S.kind === 'movie' || S.kind === 'series';
  if (!curList.length) return `<div class="empty"><div class="big">🔎</div><p>${L('لا توجد نتائج', 'No results')}</p></div>`;
  return `<div class="grid ${poster ? 'poster' : ''}">${shown.map((i, n) => cardHtml(i, n)).join('')}</div>` +
    (curList.length > shown.length ? `<button class="btn more" id="more" data-act="more">${L('عرض المزيد', 'Show more')} (${curList.length - shown.length})</button>` : '');
}
function refreshGrid(S) {
  const g = $('#grid'); if (!g) return; g.innerHTML = gridHtml(S);
  const c = $('#cnt'); if (c) c.textContent = curList.length;
  const m = $('#more'); if (m && 'IntersectionObserver' in window) { const io = new IntersectionObserver(en => { if (en[0].isIntersecting) { io.disconnect(); S.shown += 60; refreshGrid(S); } }, { rootMargin: '600px' }); io.observe(m); }
}
function srcSelect(S) {
  const mine = U.sources.map(s => `<option value="src:${s.id}" ${S.src === 'src:' + s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
  if (S.kind !== 'live') return `<select class="in" data-act="src">${mine}</select>`;
  const o = (v, t) => `<option value="${v}" ${S.src === v ? 'selected' : ''}>${t}</option>`;
  return `<select class="in" data-act="src">
    <optgroup label="${L('مجاني', 'Free')}">${o('free:EG', '🇪🇬 ' + L('قنوات مصر', 'Egypt channels'))}${o('free:world', '🌍 ' + L('كل قنوات العالم (المجانية)', 'World (free)'))}</optgroup>
    <optgroup label="${L('حسب الدولة', 'By country')}">${COUNTRIES.map(c => o('free:' + c[0], c[lang === 'ar' ? 1 : 2])).join('')}</optgroup>
    <optgroup label="${L('حسب التصنيف', 'By category')}">${CATS.map(c => o('cat:' + c[0], c[lang === 'ar' ? 1 : 2])).join('')}</optgroup>
    ${mine ? `<optgroup label="${L('اشتراكاتي', 'My subscriptions')}">${mine}</optgroup>` : ''}</select>`;
}
function vList(S) {
  const v = $('#view');
  if (S.kind !== 'live' && !U.sources.length) {
    v.innerHTML = `<div class="empty"><div class="big">${ICON[S.kind]}</div><h3>${S.kind === 'movie' ? L('الأفلام من اشتراكك', 'Movies from your subscription') : L('المسلسلات من اشتراكك', 'Series from your subscription')}</h3>
      <p>${L('أضف اشتراك Xtream Codes أو رابط M3U لعرض المحتوى هنا.', 'Add an Xtream Codes login or an M3U link to see content here.')}</p>
      <button class="btn pri" data-act="addsrc">＋ ${L('إضافة اشتراك', 'Add subscription')}</button></div>`; return;
  }
  if (S.kind !== 'live' && (!S.src || !U.sources.some(s => 'src:' + s.id === S.src))) { S.src = 'src:' + U.sources[0].id; S.loaded = false; }
  if (!S.loaded && !S.loading) { loadList(S); return; }
  const groups = {}; S.items.forEach(i => groups[i.group] = (groups[i.group] || 0) + 1);
  const gl = Object.entries(groups).sort((a, b) => b[1] - a[1]).slice(0, 40);
  v.innerHTML = `<div class="bar">${srcSelect(S)}<input class="in grow" id="q" type="search" placeholder="${L('ابحث…', 'Search…')}" value="${esc(S.q)}">
    <span style="color:var(--mut);font-size:13px"><b id="cnt">0</b></span></div>
    ${gl.length > 1 ? `<div class="chips"><button class="chip ${S.group === 'all' ? 'on' : ''}" data-act="grp" data-g="all">${L('الكل', 'All')}</button>${gl.map(([g, n]) => `<button class="chip ${S.group === g ? 'on' : ''}" data-act="grp" data-g="${esc(g)}">${esc(g)} · ${n}</button>`).join('')}</div>` : ''}
    <div id="grid">${S.loading ? '' : ''}</div>`;
  if (S.loading) { $('#grid').innerHTML = `<div class="empty"><div class="spin" style="position:static;margin:0 auto 14px"></div>${L('جارٍ التحميل…', 'Loading…')}</div>`; return; }
  if (S.err) { $('#grid').innerHTML = `<div class="empty"><div class="big">⚠️</div><p>${esc(S.err)}</p><button class="btn" data-act="reload">${L('إعادة المحاولة', 'Retry')}</button></div>`; return; }
  refreshGrid(S);
  const q = $('#q'); q.addEventListener('input', () => { S.q = q.value; S.shown = 60; clearTimeout(q._t); q._t = setTimeout(() => refreshGrid(S), 180); });
}
const stateOf = () => ({ live: LV, movies: MV, series: SV, favs: FV }[screen]);

/* favorites */
let favTab = 'all';
const favItems = () => U.favs.filter(f => favTab === 'all' || f.kind === favTab);
function vFavs(v) {
  const tabs = [['all', L('الكل', 'All')], ['live', L('قنوات', 'Channels')], ['movie', L('أفلام', 'Movies')], ['series', L('مسلسلات', 'Series')], ['radio', L('راديو', 'Radio')]];
  v.innerHTML = `<div class="chips">${tabs.map(t => `<button class="chip ${favTab === t[0] ? 'on' : ''}" data-act="favtab" data-t="${t[0]}">${t[1]}</button>`).join('')}</div>
    <div id="grid"></div>`;
  $('#grid').innerHTML = U.favs.length ? gridHtml(FV) : `<div class="empty"><div class="big">♥</div><p>${L('لم تضف أي مفضلة بعد. اضغط ☆ على أي قناة أو فيلم.', 'No favorites yet. Tap ☆ on any channel or title.')}</p></div>`;
}

/* ───────────── series modal ───────────── */
async function openSeries(item) {
  const s = U.sources.find(x => x.id === item.srcId); if (!s) return toast(L('المصدر غير موجود', 'Source not found'));
  modal(`<h3>${esc(item.name)}</h3><div class="empty"><div class="spin" style="position:static;margin:0 auto"></div></div>`);
  try {
    const b = xBase(s.url);
    const j = await apiJson(`${b}/player_api.php?username=${enc(s.user)}&password=${enc(s.pass)}&action=get_series_info&series_id=${item.sid}`);
    const eps = Array.isArray(j.episodes) ? Object.fromEntries(j.episodes.map((a, i) => [i + 1, a])) : (j.episodes || {});
    const seasons = Object.keys(eps).sort((a, b) => a - b);
    if (!seasons.length) throw new Error(L('لا توجد حلقات', 'No episodes'));
    const draw = sn => {
      const list = (eps[sn] || []).map(e => ({ id: 'series|' + s.id + '|ep' + e.id, name: `${item.name} — ${L('م', 'S')}${sn} ${L('ح', 'E')}${e.episode_num}`, url: `${b}/series/${enc(s.user)}/${enc(s.pass)}/${e.id}.${e.container_extension || 'mp4'}`, kind: 'series', logo: item.logo, group: item.group, title: e.title }));
      window._eps = list;
      $('#eps').innerHTML = list.map((e, n) => `<div class="ep"><span>${esc(e.title || e.name)}</span><button class="btn sm pri" data-act="ep" data-n="${n}">▶</button></div>`).join('');
      $$('#smod .chip').forEach(c => c.classList.toggle('on', c.dataset.sn === String(sn)));
    };
    $('#modal .mbox').innerHTML = `<div id="smod"><h3>${esc(item.name)}</h3>
      <div class="chips">${seasons.map(sn => `<button class="chip" data-act="season" data-sn="${sn}">${L('الموسم', 'Season')} ${sn}</button>`).join('')}</div><div id="eps"></div>
      <div class="acts"><button class="btn" data-act="mclose">${L('إغلاق', 'Close')}</button></div></div>`;
    window._drawSeason = draw; draw(seasons[0]);
  } catch (e) { $('#modal .mbox').innerHTML = `<h3>${esc(item.name)}</h3><p>${esc(msg(e))}</p><div class="acts"><button class="btn" data-act="mclose">${L('إغلاق', 'Close')}</button></div>`; }
}

/* ───────────── player ───────────── */
const P = { open: false, item: null, list: [], idx: 0, hls: null, triedNative: false, ctl: null, tPos: 0 };
const vid = () => $('#vid');
function playerUI() {
  $('#pl-top').innerHTML = `<button class="ibtn" data-act="pclose">${lang === 'ar' ? '→' : '←'}</button><div class="t" id="pl-t"></div>
    <button class="ibtn" data-act="pfav" id="pl-fav">☆</button><button class="ibtn" data-act="paspect">⤢</button>`;
  $('#pl-bot').innerHTML = `<div class="seek" id="pl-seek"><span id="pl-cur">0:00</span><input type="range" id="pl-rng" min="0" max="1000" value="0"><span id="pl-dur">0:00</span></div>
    <button class="ibtn" data-act="pprev">⏮</button><button class="ibtn" data-act="prew">⏪</button><button class="ibtn" data-act="pplay" id="pl-play">⏸</button>
    <button class="ibtn" data-act="pfwd">⏩</button><button class="ibtn" data-act="pnext">⏭</button><button class="ibtn" data-act="pmute" id="pl-mute">🔊</button>
    <button class="ibtn" data-act="pfs">⛶</button>`;
  const r = $('#pl-rng');
  r.addEventListener('input', () => { const v = vid(); if (isFinite(v.duration)) v.currentTime = v.duration * r.value / 1000; });
}
function openPlayer(item, list) {
  if (!P.open) history.pushState({ o: 1 }, '');
  stopRadio();
  P.open = true; P.list = (list && list.length ? list : [item]); P.idx = Math.max(0, P.list.findIndex(x => x.id === item.id));
  $('#player').classList.remove('hidden'); playerUI(); bindVideo(); startPlay(P.list[P.idx]);
}
function bindVideo() {
  const v = vid(); if (v._b) return; v._b = true;
  v.addEventListener('playing', () => { $('#pl-spin').classList.add('hidden'); $('#pl-err').classList.add('hidden'); setPlayIcon(); });
  v.addEventListener('waiting', () => $('#pl-spin').classList.remove('hidden'));
  v.addEventListener('pause', setPlayIcon); v.addEventListener('play', setPlayIcon);
  v.addEventListener('error', () => { if (P.item && !P.triedNative && P.hls) fallbackNative(); else showErr(); });
  v.addEventListener('loadedmetadata', () => {
    if (P.item && P.item.kind !== 'live') { const p = U.pos[P.item.id]; if (p && p > 30 && isFinite(v.duration) && p < v.duration - 60) v.currentTime = p; }
  });
  v.addEventListener('timeupdate', () => {
    if (!isFinite(v.duration) || P.item.kind === 'live') return;
    $('#pl-cur').textContent = fmt(v.currentTime); $('#pl-dur').textContent = fmt(v.duration);
    $('#pl-rng').value = Math.round(v.currentTime / v.duration * 1000);
    if (Date.now() - P.tPos > 10000) { P.tPos = Date.now(); U.pos[P.item.id] = Math.floor(v.currentTime); const k = Object.keys(U.pos); if (k.length > 300) delete U.pos[k[0]]; saveU(); }
  });
  v.addEventListener('ended', () => { if (P.item.kind !== 'live') { delete U.pos[P.item.id]; saveU(); } if (P.list.length > 1 && P.item.kind !== 'live') stepList(1); });
  $('#player').addEventListener('click', e => { if (e.target.closest('.pl-bar,.pl-err')) return; toggleCtl(); });
}
const fmt = t => { t = Math.max(0, Math.floor(t || 0)); const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'); };
function setPlayIcon() { const b = $('#pl-play'); if (b) b.textContent = vid().paused ? '▶' : '⏸'; }
function showCtl() { $('#pl-top').classList.remove('off'); $('#pl-bot').classList.remove('off'); clearTimeout(P.ctl); P.ctl = setTimeout(() => { $('#pl-top').classList.add('off'); $('#pl-bot').classList.add('off'); }, 4500); }
function toggleCtl() { $('#pl-top').classList.contains('off') ? showCtl() : (clearTimeout(P.ctl), $('#pl-top').classList.add('off'), $('#pl-bot').classList.add('off')); }
function cleanup() { if (P.hls) { try { P.hls.destroy(); } catch {} P.hls = null; } const v = vid(); try { v.pause(); } catch {} v.removeAttribute('src'); v.load(); $('#yt').src = 'about:blank'; $('#yt').classList.add('hidden'); v.classList.remove('hidden'); }
function startPlay(item) {
  P.item = item; P.triedNative = false; cleanup();
  const v = vid(), url = item.url;
  $('#pl-t').textContent = item.name; $('#pl-fav').textContent = isFav(item.id) ? '★' : '☆';
  $('#pl-seek').style.display = item.kind === 'live' ? 'none' : 'flex';
  $('#pl-spin').classList.remove('hidden'); $('#pl-err').classList.add('hidden');
  saveRecent(item); showCtl();
  if (/^yt:/.test(url)) { v.classList.add('hidden'); const f = $('#yt'); f.classList.remove('hidden'); f.src = 'https://www.youtube.com/embed/' + url.slice(3) + '?autoplay=1'; $('#pl-spin').classList.add('hidden'); return; }
  const eng = U.settings.engine, isHls = /\.m3u8(\?|$)/i.test(url) || (item.kind === 'live' && !/\.(mp4|mkv|ts|avi|flv)(\?|$)/i.test(url));
  if (isHls && eng !== 'native' && window.Hls && Hls.isSupported()) {
    const h = P.hls = new Hls({ enableWorker: true, maxBufferLength: 30, manifestLoadingMaxRetry: 2, levelLoadingMaxRetry: 2, fragLoadingMaxRetry: 3 });
    h.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) { if (eng === 'auto' && !P.triedNative) fallbackNative(); else showErr(); } });
    h.loadSource(url); h.attachMedia(v);
  } else v.src = url;
  v.play().catch(() => {});
}
function fallbackNative() {
  P.triedNative = true; const v = vid(), url = P.item.url;
  if (P.hls) { try { P.hls.destroy(); } catch {} P.hls = null; }
  v.src = url; v.play().catch(() => {});
}
function showErr() {
  $('#pl-spin').classList.add('hidden');
  const e = $('#pl-err'); e.classList.remove('hidden');
  e.innerHTML = `<h3>${L('تعذّر تشغيل هذا البث', 'Could not play this stream')}</h3><p>${L('قد يكون البث متوقفاً أو محجوباً. جرّب قناة أخرى أو أعد المحاولة.', 'The stream may be offline or blocked. Try another or retry.')}</p>
    <div class="acts" style="justify-content:center"><button class="btn pri" data-act="pretry">${L('إعادة المحاولة', 'Retry')}</button>${P.list.length > 1 ? `<button class="btn" data-act="pnext">${L('التالي', 'Next')}</button>` : ''}<button class="btn" data-act="pclose">${L('إغلاق', 'Close')}</button></div>`;
  showCtl();
}
function stepList(d) { if (P.list.length < 2) return; P.idx = (P.idx + d + P.list.length) % P.list.length; startPlay(P.list[P.idx]); }
function closePlayer(fromPop) {
  if (!P.open) return; P.open = false; cleanup(); clearTimeout(P.ctl);
  $('#player').classList.add('hidden');
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  if (!fromPop) { try { history.back(); } catch {} }
}
function playerAct(a) {
  const v = vid();
  ({
    pclose: () => closePlayer(), pretry: () => startPlay(P.item), pprev: () => stepList(-1), pnext: () => stepList(1),
    pplay: () => { v.paused ? v.play() : v.pause(); showCtl(); },
    prew: () => { v.currentTime = Math.max(0, v.currentTime - 10); showCtl(); }, pfwd: () => { v.currentTime += 10; showCtl(); },
    pmute: () => { v.muted = !v.muted; $('#pl-mute').textContent = v.muted ? '🔇' : '🔊'; showCtl(); },
    paspect: () => { v.classList.toggle('fill'); showCtl(); },
    pfs: () => { const p = $('#player'); document.fullscreenElement ? document.exitFullscreen() : p.requestFullscreen?.().catch(() => {}); },
    pfav: () => { const on = toggleFav(P.item); $('#pl-fav').textContent = on ? '★' : '☆'; toast(on ? L('أضيفت للمفضلة', 'Added to favorites') : L('حُذفت من المفضلة', 'Removed')); showCtl(); }
  }[a] || (() => {}))();
}

/* ───────────── radio ───────────── */
const RD = { items: [], filter: 'all', q: '', loaded: false, loading: false, shown: 60 };
const RP = { item: null };
const aud = () => $('#aud');
async function loadRadio() {
  RD.loading = true; if (screen === 'radio') render();
  const jobs = [
    apiJson('https://mp3quran.net/api/v3/radios?language=ar').then(j => (j.radios || []).map(r => ({ id: 'radio|' + r.url, name: r.name, url: r.url, kind: 'radio', group: 'quran', logo: '' }))),
    apiJson('https://de1.api.radio-browser.info/json/stations/search?countrycode=EG&hidebroken=true&order=clickcount&reverse=true&limit=80').then(a => a.map(s => ({ id: 'radio|' + (s.url_resolved || s.url), name: (s.name || '').trim() || '—', url: s.url_resolved || s.url, kind: 'radio', group: 'fm', logo: s.favicon || '' })))
  ];
  const res = await Promise.allSettled(jobs); const seen = new Set(); const out = [];
  [QURAN_FALLBACK, ...res.map(r => r.status === 'fulfilled' ? r.value : [])].forEach(a => a.forEach(i => { if (i.url && !seen.has(i.id)) { seen.add(i.id); out.push(i); } }));
  RD.items = out; RD.loaded = true; RD.loading = false; if (screen === 'radio') render();
}
function vRadio(v) {
  if (!RD.loaded && !RD.loading) loadRadio();
  const q = RD.q.trim().toLowerCase();
  const list = RD.items.filter(i => (RD.filter === 'all' || (RD.filter === 'fav' ? isFav(i.id) : i.group === RD.filter)) && (!q || i.name.toLowerCase().includes(q)));
  curList = list;
  const tabs = [['all', L('كل المحطات', 'All stations')], ['quran', L('القرآن', 'Quran')], ['fm', 'FM'], ['fav', L('المفضلة', 'Favorites')]];
  v.innerHTML = `<div class="hero" style="min-height:0;padding:18px"><small>RADIO LIBRARY</small><h1 style="font-size:26px">${L('صوت يومك', 'A soundtrack to your day')}</h1><p style="margin:0">${L('محطات القرآن و FM مع البحث والمفضلة.', 'Quran and FM stations with search and favorites.')}</p></div>
    <div class="bar"><input class="in grow" id="rq" type="search" placeholder="${L('ابحث عن محطة…', 'Search stations…')}" value="${esc(RD.q)}"><span style="color:var(--mut)">${list.length} ${L('محطة', 'stations')}</span></div>
    <div class="chips">${tabs.map(t => `<button class="chip ${RD.filter === t[0] ? 'on' : ''}" data-act="rtab" data-t="${t[0]}">${t[1]}</button>`).join('')}</div>
    ${RD.loading ? `<div class="empty"><div class="spin" style="position:static;margin:0 auto 14px"></div>${L('جارٍ التحميل…', 'Loading…')}</div>` :
      `<div class="rgrid">${list.slice(0, RD.shown).map((i, n) => `<div class="rc ${RP.item && RP.item.id === i.id ? 'now' : ''}" tabindex="0" data-act="radio" data-i="${n}">
        <div class="ri">${i.logo ? `<img src="${esc(i.logo)}" referrerpolicy="no-referrer" alt="" onerror="this.outerHTML='${i.group === 'quran' ? '📖' : '📻'}'">` : (i.group === 'quran' ? '📖' : '📻')}</div>
        <b>${esc(i.name)}</b><small>${i.group === 'quran' ? L('قرآن · مباشر', 'QURAN · LIVE') : 'FM · LIVE'}</small>
        <button class="fv ${isFav(i.id) ? 'on' : ''}" data-act="fav" data-i="${n}" style="position:absolute;top:6px;inset-inline-end:6px;background:none;font-size:16px">${isFav(i.id) ? '★' : '☆'}</button></div>`).join('')}</div>
        ${list.length > RD.shown ? `<button class="btn more" data-act="rmore">${L('عرض المزيد', 'Show more')}</button>` : ''}`}`;
  const rq = $('#rq'); rq && rq.addEventListener('input', () => { RD.q = rq.value; clearTimeout(rq._t); rq._t = setTimeout(() => { render(); const n = $('#rq'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); });
}
function playRadio(item) {
  if (P.open) closePlayer();
  RP.item = item; const a = aud(); a.src = item.url; a.play().catch(() => {});
  drawMini('loading'); if (screen === 'radio') render();
}
function stopRadio() { if (!RP.item) return; const a = aud(); a.pause(); a.removeAttribute('src'); a.load(); RP.item = null; $('#miniradio').classList.add('hidden'); if (screen === 'radio') render(); }
function drawMini(state) {
  const m = $('#miniradio'); if (!RP.item) return m.classList.add('hidden');
  const st = { loading: L('جارٍ الاتصال…', 'Connecting…'), playing: L('يعمل الآن', 'Now playing'), paused: L('متوقف مؤقتاً', 'Paused'), error: L('تعذّر التشغيل', 'Stream error') }[state] || '';
  m.classList.remove('hidden');
  m.innerHTML = `<div class="ri" style="width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:linear-gradient(135deg,var(--a),var(--a2))">📻</div>
    <div class="mt"><b>${esc(RP.item.name)}</b><small>${st}</small></div>
    <button class="ibtn" data-act="mplay">${state === 'playing' || state === 'loading' ? '⏸' : '▶'}</button><button class="ibtn" data-act="mstop">⏹</button>`;
}
['playing', 'pause', 'waiting', 'error'].forEach(ev => document.addEventListener('DOMContentLoaded', () => aud().addEventListener(ev, () => drawMini({ playing: 'playing', pause: 'paused', waiting: 'loading', error: 'error' }[ev]))));

/* ───────────── prayer ───────────── */
const PR = { t: null, hijri: '', loading: false, err: '', firedKey: '' };
async function loadPrayer(force) {
  const s = U.settings, key = `tamy:pr:${new Date().toDateString()}:${s.lat || s.city}:${s.method}`;
  if (!force) { const c = LS.get(key, null); if (c) { PR.t = c.t; PR.hijri = c.hijri; if (screen === 'prayer') render(); return; } }
  PR.loading = true; PR.err = ''; if (screen === 'prayer') render();
  try {
    const url = s.lat != null ? `https://api.aladhan.com/v1/timings?latitude=${s.lat}&longitude=${s.lng}&method=${s.method}` : `https://api.aladhan.com/v1/timingsByCity?city=${enc(s.city)}&country=${enc(s.country)}&method=${s.method}`;
    const j = await apiJson(url);
    PR.t = j.data.timings; const h = j.data.date.hijri; PR.hijri = `${h.day} ${lang === 'ar' ? h.month.ar : h.month.en} ${h.year}`;
    LS.set(key, { t: PR.t, hijri: PR.hijri });
  } catch (e) { PR.err = msg(e); }
  PR.loading = false; if (screen === 'prayer') render();
}
const hm = x => String(x).slice(0, 5);
function nextPrayer() {
  if (!PR.t) return null; const now = new Date(); const base = new Date(now); let best = null;
  for (const [k] of PRAYERS) {
    if (k === 'Sunrise') continue; const [h, m] = hm(PR.t[k]).split(':').map(Number);
    const d = new Date(base); d.setHours(h, m, 0, 0); if (d > now) { best = { k, d }; break; }
  }
  if (!best) { const [h, m] = hm(PR.t.Fajr).split(':').map(Number); const d = new Date(base); d.setDate(d.getDate() + 1); d.setHours(h, m, 0, 0); best = { k: 'Fajr', d }; }
  return best;
}
function vPrayer(v) {
  if (!PR.t && !PR.loading && !PR.err) loadPrayer();
  const nx = nextPrayer(), now = new Date();
  const hr = now.getHours(), dh = hr < 12 ? ADHKAR[0] : hr < 17 ? ADHKAR[2] : ADHKAR[1];
  const ex = dh;
  v.innerHTML = `<div class="bar"><b style="font-size:20px">${L('مواقيت الصلاة', 'Prayer times')}</b><span style="color:var(--mut)">· ${esc(U.settings.lat != null ? L('موقعي', 'My location') : U.settings.city)}</span><div class="sp" style="flex:1"></div>
    <button class="btn sm" data-act="geoloc">📍 ${L('موقعي', 'My location')}</button><button class="btn sm" data-act="prefresh">⟳ ${L('تحديث', 'Refresh')}</button><button class="btn sm" data-act="pset">⚙ ${L('إعداد المدينة', 'City')}</button></div>
    ${PR.loading ? `<div class="empty"><div class="spin" style="position:static;margin:0 auto 14px"></div></div>` : PR.err ? `<div class="empty"><div class="big">⚠️</div><p>${esc(PR.err)}</p><button class="btn" data-act="prefresh">${L('إعادة المحاولة', 'Retry')}</button></div>` : PR.t ? `
    <div class="pgrid"><div class="pbox"><div style="font-size:40px">🕌</div><div style="color:var(--mut)">${esc(PR.hijri)}</div></div>
      <div class="pbox"><div class="clock" id="clk">--:--</div><div style="color:var(--mut);font-size:13px">${now.toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
      <div class="nx">${L('الصلاة القادمة', 'Next prayer')} · ${nx ? PRAYERS.find(p => p[0] === nx.k)[lang === 'ar' ? 1 : 2] : ''} <b id="cd">--:--:--</b></div></div></div>
    <div class="times">${PRAYERS.map(p => `<div class="tm ${nx && nx.k === p[0] ? 'nxt' : ''}"><small>${p[lang === 'ar' ? 1 : 2]}</small><b>${hm(PR.t[p[0]])}</b></div>`).join('')}</div>
    <div class="dhikr"><small>${hr < 12 ? L('أذكار الصباح', 'Morning remembrance') : hr < 17 ? L('ذكر', 'Remembrance') : L('أذكار المساء', 'Evening remembrance')}</small><div class="ar">${ex[0]}</div><small>${lang === 'ar' ? '' : ex[1]}</small></div>
    <p class="note">${L('الأذان يعمل أثناء فتح التطبيق فقط. المواقيت من AlAdhan — قارنها بتقويم مسجدك المحلي.', 'Adhan plays only while TAMY IPTV is open. Times from AlAdhan — compare with your local mosque calendar.')}</p>` : ''}`;
  tick();
}
function tick() {
  const c = $('#clk'), cd = $('#cd'), now = new Date();
  if (c) c.textContent = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const nx = nextPrayer();
  if (cd && nx) { const d = Math.max(0, Math.floor((nx.d - now) / 1000)); cd.textContent = [Math.floor(d / 3600), Math.floor(d % 3600 / 60), d % 60].map(x => String(x).padStart(2, '0')).join(':'); }
  if (PR.t && U && U.settings.adhan) {
    for (const [k] of PRAYERS) {
      if (k === 'Sunrise') continue; const key = new Date().toDateString() + k;
      if (hm(PR.t[k]) === now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) && PR.firedKey !== key) { PR.firedKey = key; playAdhan(k); }
    }
  }
}
setInterval(() => { if (uid) tick(); }, 1000);
function playAdhan(k) {
  toast('🕌 ' + L('حان الآن موعد صلاة ', 'It is time for ') + PRAYERS.find(p => p[0] === k)[lang === 'ar' ? 1 : 2]);
  if (U.settings.adhanUrl) { const a = new Audio(U.settings.adhanUrl); a.play().catch(() => chime()); return; }
  chime();
}
function chime() {
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)(); [523, 659, 784, 1047].forEach((f, i) => {
      const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = f; o.connect(g); g.connect(ac.destination);
      const t = ac.currentTime + i * .45; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.25, t + .05); g.gain.exponentialRampToValueAtTime(.001, t + .9); o.start(t); o.stop(t + 1);
    });
  } catch {}
}
function prayerSettings() {
  const s = U.settings;
  modal(`<h3>${L('إعداد المدينة', 'City setup')}</h3>
    <label class="fld"><span>${L('المدينة', 'City')}</span><input class="in" id="p-city" value="${esc(s.city)}"></label>
    <label class="fld"><span>${L('الدولة (بالإنجليزية)', 'Country')}</span><input class="in" id="p-country" value="${esc(s.country)}"></label>
    <label class="fld"><span>${L('طريقة الحساب', 'Method')}</span><select class="in" id="p-method">${[[5, L('الهيئة المصرية للمساحة', 'Egyptian General Authority of Survey')], [4, L('أم القرى (مكة)', 'Umm Al-Qura')], [3, L('رابطة العالم الإسلامي', 'Muslim World League')], [2, 'ISNA'], [1, L('كراتشي', 'Karachi')], [8, L('الخليج', 'Gulf')], [9, L('الكويت', 'Kuwait')], [10, L('قطر', 'Qatar')]].map(m => `<option value="${m[0]}" ${s.method == m[0] ? 'selected' : ''}>${m[1]}</option>`).join('')}</select></label>
    <div class="acts"><button class="btn" data-act="mclose">${L('إلغاء', 'Cancel')}</button><button class="btn pri" data-act="psave">${L('حفظ', 'Save')}</button></div>`);
}

/* ───────────── settings ───────────── */
function srcRows() {
  return U.sources.length ? U.sources.map(s => `<div class="row"><div style="min-width:0"><b>${esc(s.name)}</b><small>${s.type === 'xtream' ? 'Xtream · ' + esc(s.url) : s.type === 'file' ? L('ملف محلي', 'Local file') : 'M3U'}</small></div><button class="btn sm dng" data-act="delsrc" data-id="${s.id}">${L('حذف', 'Delete')}</button></div>`).join('')
    : `<div class="row"><small>${L('لا توجد اشتراكات. أضف اشتراكك لمشاهدة الأفلام والمسلسلات وقنواتك.', 'No subscriptions yet. Add yours to watch movies, series and your channels.')}</small></div>`;
}
function vSettings(v) {
  const s = U.settings, me = users.find(u => u.id === uid);
  v.innerHTML = `
  <div class="set"><h3>👤 ${L('الحساب', 'Account')}</h3><div class="row"><div><b>${esc(me ? me.name : L('ضيف', 'Guest'))}</b><small>${L('البيانات محفوظة على هذا الجهاز', 'Data is stored on this device')}</small></div><button class="btn sm" data-act="logout">${L('تبديل الحساب', 'Switch account')}</button></div></div>
  <div class="set"><h3>📡 ${L('اشتراكاتي', 'My subscriptions')}</h3>${srcRows()}<div class="acts" style="justify-content:flex-start"><button class="btn pri" data-act="addsrc">＋ ${L('إضافة اشتراك', 'Add subscription')}</button></div></div>
  <div class="set"><h3>🎨 ${L('الثيمات', 'Themes')}</h3><div class="themes">${THEMES.map(t => `<button class="th ${s.theme === t[0] ? 'on' : ''}" data-act="theme" data-t="${t[0]}">${t[lang === 'ar' ? 1 : 2]}</button>`).join('')}</div></div>
  <div class="set"><h3>⚙ ${L('عام', 'General')}</h3>
    <div class="row"><div><b>${L('اللغة', 'Language')}</b></div><button class="btn sm" data-act="lang">${lang === 'ar' ? 'English' : 'العربية'}</button></div>
    <div class="row"><div><b>${L('محرك التشغيل', 'Player engine')}</b><small>${L('تلقائي = hls.js ثم المشغّل الأصلي', 'Auto = hls.js then native')}</small></div>
      <select class="in" data-act="engine"><option value="auto" ${s.engine === 'auto' ? 'selected' : ''}>${L('تلقائي', 'Auto')}</option><option value="hls" ${s.engine === 'hls' ? 'selected' : ''}>hls.js</option><option value="native" ${s.engine === 'native' ? 'selected' : ''}>${L('أصلي', 'Native')}</option></select></div>
    <div class="row"><div><b>${L('تنبيه الأذان', 'Adhan alert')}</b><small>${L('أثناء فتح التطبيق', 'While the app is open')}</small></div><button class="sw ${s.adhan ? 'on' : ''}" data-act="adhan" aria-label="adhan"></button></div>
    <div class="row"><div style="flex:1"><b>${L('رابط صوت الأذان (اختياري)', 'Custom adhan audio URL (optional)')}</b><input class="in" style="width:100%;margin-top:6px" id="adhanUrl" placeholder="https://…mp3" value="${esc(s.adhanUrl)}"></div></div></div>
  <div class="set"><h3>💾 ${L('نسخة احتياطية', 'Backup')}</h3><div class="acts" style="justify-content:flex-start"><button class="btn" data-act="export">${L('تصدير', 'Export')}</button><button class="btn" data-act="import">${L('استيراد', 'Import')}</button><button class="btn dng" data-act="wipe">${L('مسح بيانات الحساب', 'Clear account data')}</button></div>
    <input type="file" id="impf" accept=".json" class="hidden"></div>
  <div class="set"><h3>ℹ️ TAMY IPTV 1.0</h3><small style="color:var(--mut);line-height:1.8">${L('TAMY IPTV مشغّل فقط: يعرض المحتوى الذي تضيفه أنت من اشتراكك أو قوائمك، بالإضافة إلى قنوات مجانية عامة من قوائم iptv-org. لا يوفّر التطبيق قنوات مدفوعة ولا يتحمّل مسؤولية المحتوى.', 'TAMY IPTV is a player only: it shows content you add from your own subscription or playlists, plus free public channels from iptv-org lists. It does not supply paid channels.')}</small></div>`;
  const au = $('#adhanUrl'); au && au.addEventListener('change', () => { U.settings.adhanUrl = au.value.trim(); saveU(); toast(L('تم الحفظ', 'Saved')); });
}
let sType = 'xtream';
function srcModal() {
  sType = 'xtream';
  modal(`<h3>${L('إضافة اشتراك', 'Add subscription')}</h3>
    <div class="chips"><button class="chip on" data-act="stype" data-v="xtream">Xtream Codes</button><button class="chip" data-act="stype" data-v="m3u">M3U ${L('رابط', 'URL')}</button><button class="chip" data-act="stype" data-v="file">${L('ملف M3U', 'M3U file')}</button></div>
    <label class="fld"><span>${L('اسم الاشتراك', 'Name')}</span><input class="in" id="s-name" placeholder="${L('اشتراكي', 'My IPTV')}"></label>
    <div id="s-x"><label class="fld"><span>${L('عنوان السيرفر', 'Server URL')}</span><input class="in" id="s-url" dir="ltr" placeholder="http://example.com:8080"></label>
      <label class="fld"><span>${L('اسم المستخدم', 'Username')}</span><input class="in" id="s-user" dir="ltr" autocapitalize="off"></label>
      <label class="fld"><span>${L('كلمة المرور', 'Password')}</span><input class="in" id="s-pass" dir="ltr" autocapitalize="off"></label></div>
    <div id="s-m" class="hidden"><label class="fld"><span>${L('رابط قائمة M3U', 'M3U playlist URL')}</span><input class="in" id="s-m3u" dir="ltr" placeholder="http://…/playlist.m3u"></label></div>
    <div id="s-f" class="hidden"><label class="fld"><span>${L('اختر ملف .m3u', 'Choose .m3u file')}</span><input class="in" id="s-file" type="file" accept=".m3u,.m3u8,.txt"></label></div>
    <div id="s-msg" style="color:var(--mut);min-height:20px"></div>
    <div class="acts"><button class="btn" data-act="mclose">${L('إلغاء', 'Cancel')}</button><button class="btn pri" data-act="srcsave">${L('اختبار وحفظ', 'Test & save')}</button></div>`);
}
async function saveSource() {
  const msgEl = $('#s-msg'), say = (t, bad) => { msgEl.textContent = t; msgEl.style.color = bad ? 'var(--bad)' : 'var(--mut)'; };
  const s = { id: uidGen(), type: sType, name: ($('#s-name').value || '').trim() || L('اشتراكي', 'My IPTV') };
  try {
    say(L('جارٍ الاختبار…', 'Testing…'));
    if (sType === 'xtream') {
      s.url = $('#s-url').value.trim(); s.user = $('#s-user').value.trim(); s.pass = $('#s-pass').value.trim();
      if (!/^https?:\/\//i.test(s.url) || !s.user || !s.pass) return say(L('أكمل بيانات السيرفر', 'Fill in all server fields'), true);
      const j = await apiJson(`${xBase(s.url)}/player_api.php?username=${enc(s.user)}&password=${enc(s.pass)}`);
      if (!j.user_info || String(j.user_info.auth) !== '1') return say(L('بيانات الدخول غير صحيحة أو الاشتراك منتهي', 'Invalid login or expired subscription'), true);
      if (j.user_info.status && j.user_info.status !== 'Active') return say(L('حالة الاشتراك: ', 'Subscription status: ') + j.user_info.status, true);
    } else if (sType === 'm3u') {
      s.url = $('#s-m3u').value.trim(); if (!/^https?:\/\//i.test(s.url)) return say(L('أدخل رابطاً صحيحاً', 'Enter a valid URL'), true);
      const n = (await loadM3U(s.url)).length; say(n + ' ' + L('عنصر', 'items'));
    } else {
      const f = $('#s-file').files[0]; if (!f) return say(L('اختر ملفاً', 'Choose a file'), true);
      const txt = await f.text(); const n = parseM3U(txt).length; if (!n) return say(L('الملف غير صالح', 'Invalid file'), true);
      if (!LS.set('tamy:file:' + s.id, txt)) return say(L('الملف كبير جداً للتخزين المحلي؛ استخدم رابطاً بدلاً منه', 'File too large for local storage; use a URL instead'), true);
    }
  } catch (e) { return say(L('فشل الاتصال: ', 'Connection failed: ') + msg(e), true); }
  U.sources.push(s); saveU(); closeModal(); toast(L('تمت إضافة الاشتراك ✓', 'Subscription added ✓'));
  [MV, SV].forEach(S => { S.loaded = false; S.src = null; }); if (screen === 'settings' || screen === 'movies' || screen === 'series') render();
}

/* ───────────── global search ───────────── */
function searchModal() {
  modal(`<h3>${L('بحث في كل شيء', 'Search everything')}</h3><input class="in" style="width:100%" id="gs" type="search" placeholder="${L('اسم قناة أو فيلم أو محطة…', 'Channel, movie or station…')}"><div id="gr" style="margin-top:10px"></div>
    <div class="acts"><button class="btn" data-act="mclose">${L('إغلاق', 'Close')}</button></div>`);
  const gs = $('#gs');
  gs.addEventListener('input', () => {
    const q = gs.value.trim().toLowerCase(); if (q.length < 2) { $('#gr').innerHTML = ''; return; }
    const pool = [...cache.values(), ...xc.values(), RD.items].flat(); const seen = new Set(); const res = [];
    for (const i of pool) { if (res.length >= 40) break; if (!seen.has(i.id) && (i.name || '').toLowerCase().includes(q)) { seen.add(i.id); res.push(i); } }
    window._sr = res;
    $('#gr').innerHTML = res.length ? res.map((i, n) => `<div class="ep" tabindex="0" data-act="sres" data-n="${n}"><span>${ICON[i.kind] || ''} ${esc(i.name)}</span><small style="color:var(--mut)">${esc(i.group || '')}</small></div>`).join('') : `<p style="color:var(--mut)">${L('لا نتائج في المحتوى المحمّل. افتح الأقسام أولاً.', 'No results in loaded content. Open the sections first.')}</p>`;
  });
}

/* ───────────── actions ───────────── */
const A = {
  go: el => nav(el.dataset.to),
  back: () => { if (history.length > 1) history.back(); else nav('home'); },
  lang: () => { lang = lang === 'ar' ? 'en' : 'ar'; LS.set('tamy:lang', lang); applyTheme(); render(); },
  search: () => searchModal(),
  mclose: () => closeModal(),
  open: el => {
    const i = curList[+el.dataset.i]; if (!i) return;
    if (i.kind === 'radio') return playRadio(i);
    if (i.sid) return openSeries(i);
    openPlayer(i, curList.filter(x => x.kind === i.kind && !x.sid));
  },
  fav: (el, e) => {
    e.stopPropagation(); const i = curList[+el.dataset.i]; if (!i) return; const on = toggleFav(i);
    el.textContent = on ? '★' : '☆'; el.classList.toggle('on', on); if (screen === 'favs' && !on) { render(); } toast(on ? L('أضيفت للمفضلة', 'Added to favorites') : L('حُذفت من المفضلة', 'Removed'));
  },
  grp: el => { const S = stateOf(); S.group = el.dataset.g; S.shown = 60; render(); },
  more: () => { const S = stateOf(); if (S) { S.shown += 60; refreshGrid(S); } },
  reload: () => { const S = stateOf(); if (S) { S.loaded = false; render(); } },
  favtab: el => { favTab = el.dataset.t; FV.shown = 60; render(); },
  resume: el => { const it = U.recent[el.dataset.k]; if (it) it.sid ? openSeries(it) : openPlayer(it, [it]); },
  addsrc: () => srcModal(),
  stype: el => { sType = el.dataset.v; $$('#modal .chip').forEach(c => c.classList.toggle('on', c === el)); $('#s-x').classList.toggle('hidden', sType !== 'xtream'); $('#s-m').classList.toggle('hidden', sType !== 'm3u'); $('#s-f').classList.toggle('hidden', sType !== 'file'); },
  srcsave: () => saveSource(),
  delsrc: el => { if (!confirm(L('حذف هذا الاشتراك؟', 'Delete this subscription?'))) return; const id = el.dataset.id; U.sources = U.sources.filter(s => s.id !== id); LS.del('tamy:file:' + id); [...xc.keys()].filter(k => k.startsWith(id + '|')).forEach(k => xc.delete(k)); [LV, MV, SV].forEach(S => { if (S.src === 'src:' + id) { S.src = S === LV ? 'free:EG' : null; S.loaded = false; } }); saveU(); render(); },
  theme: el => { U.settings.theme = el.dataset.t; saveU(); applyTheme(); render(); },
  adhan: () => { U.settings.adhan = !U.settings.adhan; saveU(); render(); if (U.settings.adhan) chime(); },
  season: el => window._drawSeason(el.dataset.sn),
  ep: el => { const list = window._eps, i = list[+el.dataset.n]; closeModalSilent(); openPlayer(i, list); },
  sres: el => { const i = window._sr[+el.dataset.n]; closeModalSilent(); if (i.kind === 'radio') return playRadio(i); if (i.sid) return openSeries(i); openPlayer(i, [i]); },
  rtab: el => { RD.filter = el.dataset.t; RD.shown = 60; render(); },
  rmore: () => { RD.shown += 60; render(); },
  radio: el => { const i = curList[+el.dataset.i]; if (i) playRadio(i); },
  mplay: () => { const a = aud(); a.paused ? a.play() : a.pause(); },
  mstop: () => stopRadio(),
  prefresh: () => loadPrayer(true),
  pset: () => prayerSettings(),
  psave: () => { const s = U.settings; s.city = $('#p-city').value.trim() || 'Cairo'; s.country = $('#p-country').value.trim() || 'Egypt'; s.method = +$('#p-method').value; s.lat = s.lng = null; saveU(); closeModal(); loadPrayer(true); },
  geoloc: () => { if (!navigator.geolocation) return toast(L('الموقع غير متاح', 'Location unavailable')); navigator.geolocation.getCurrentPosition(p => { U.settings.lat = +p.coords.latitude.toFixed(4); U.settings.lng = +p.coords.longitude.toFixed(4); saveU(); loadPrayer(true); }, () => toast(L('لم يتم السماح بالوصول للموقع', 'Location permission denied')), { timeout: 15000 }); },
  logout: () => { LS.del('tamy:uid'); uid = null; U = null; stopRadio(); renderAuth(); },
  export: () => { const b = new Blob([JSON.stringify({ app: 'tamy-iptv', user: U }, null, 1)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'tamy-iptv-backup.json'; a.click(); },
  import: () => $('#impf').click(),
  wipe: () => { if (confirm(L('مسح كل بيانات هذا الحساب؟', 'Clear all data for this account?'))) { U = DEF(); saveU(); applyTheme(); render(); } },
  src: (el) => { const S = stateOf(); S.src = el.value; S.loaded = false; render(); },
  engine: el => { U.settings.engine = el.value; saveU(); },
  /* auth */
  authmode: () => { authMode = authMode === 'in' ? 'up' : 'in'; renderAuth(); },
  guest: async () => { let g = users.find(u => u.guest); if (!g) { g = { id: uidGen(), name: L('ضيف', 'Guest'), guest: true }; users.push(g); LS.set('tamy:users', users); } enter(g.id); },
  signup: async () => {
    const name = ($('#a-name') ? $('#a-name').value : '').trim() || ($('#a-name') ? '' : 'TAMY'), pass = $('#a-pass').value;
    if (!name) return toast(L('اكتب اسمك', 'Enter a name')); if (pass.length < 4) return toast(L('كلمة المرور 4 أحرف على الأقل', 'Password must be 4+ characters'));
    if (users.some(u => u.name.toLowerCase() === name.toLowerCase())) return toast(L('الاسم مستخدم', 'Name already used'));
    const u = { id: uidGen(), name, hash: await sha(name.toLowerCase() + ':' + pass) }; users.push(u); LS.set('tamy:users', users); enter(u.id);
  },
  login: async () => {
    const id = $('#a-user').value, u = users.find(x => x.id === id), pass = $('#a-pass').value;
    if (!u) return; if (u.guest) return enter(u.id);
    if ((await sha(u.name.toLowerCase() + ':' + pass)) !== u.hash) return toast(L('كلمة المرور غير صحيحة', 'Wrong password')); enter(u.id);
  }
};
['pclose', 'pretry', 'pprev', 'pnext', 'pplay', 'prew', 'pfwd', 'pmute', 'paspect', 'pfs', 'pfav'].forEach(k => A[k] = () => playerAct(k));

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el || el.tagName === 'SELECT') return;
  const f = A[el.dataset.act]; if (f) f(el, e);
});
document.addEventListener('change', e => { const el = e.target; if (el.tagName === 'SELECT' && el.dataset.act && A[el.dataset.act]) A[el.dataset.act](el, e); if (el.id === 'impf' && el.files[0]) el.files[0].text().then(t => { try { const j = JSON.parse(t); if (j.app !== 'tamy-iptv') throw 0; U = Object.assign(DEF(), j.user); saveU(); applyTheme(); render(); toast(L('تم الاستيراد ✓', 'Imported ✓')); } catch { toast(L('ملف غير صالح', 'Invalid file')); } }); });
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

/* ───────────── keyboard / TV remote ───────────── */
function focusables() {
  const root = P.open ? $('#player') : !$('#modal').classList.contains('hidden') ? $('#modal') : document.body;
  return $$('button,input,select,[tabindex="0"],a[href]', root).filter(e => { if (e.disabled) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; });
}
function moveFocus(dir) {
  const els = focusables(); if (!els.length) return;
  let cur = document.activeElement; if (!els.includes(cur)) { cur = els.find(e => e.closest('#view')) || els[0]; cur.focus(); cur.scrollIntoView({ block: 'center' }); return; }
  const c = cur.getBoundingClientRect(), cx = c.left + c.width / 2, cy = c.top + c.height / 2; let best = null, bs = Infinity;
  for (const e of els) {
    if (e === cur) continue; const r = e.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, dx = x - cx, dy = y - cy;
    const ok = dir === 'ArrowRight' ? dx > 4 && Math.abs(dy) < Math.abs(dx) * 3 : dir === 'ArrowLeft' ? dx < -4 && Math.abs(dy) < Math.abs(dx) * 3 : dir === 'ArrowDown' ? dy > 4 && Math.abs(dx) < Math.abs(dy) * 3 : dy < -4 && Math.abs(dx) < Math.abs(dy) * 3;
    if (!ok) continue; const sc = (dir === 'ArrowLeft' || dir === 'ArrowRight') ? Math.abs(dx) + Math.abs(dy) * 2.5 : Math.abs(dy) + Math.abs(dx) * 2.5;
    if (sc < bs) { bs = sc; best = e; }
  }
  if (best) { best.focus(); best.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
}
document.addEventListener('keydown', e => {
  const k = e.key, tag = (e.target.tagName || '');
  if (P.open) {
    const v = vid(); const live = P.item && P.item.kind === 'live';
    const map = {
      ArrowUp: () => live ? stepList(-1) : showCtl(), ArrowDown: () => live ? stepList(1) : showCtl(), ChannelUp: () => stepList(-1), ChannelDown: () => stepList(1),
      ArrowLeft: () => live ? showCtl() : playerAct('prew'), ArrowRight: () => live ? showCtl() : playerAct('pfwd'),
      MediaPlayPause: () => playerAct('pplay'), MediaTrackNext: () => stepList(1), MediaTrackPrevious: () => stepList(-1),
      ' ': () => playerAct('pplay'), m: () => playerAct('pmute'), f: () => playerAct('pfs'),
      Escape: () => closePlayer(), Backspace: () => closePlayer(), GoBack: () => closePlayer(), BrowserBack: () => closePlayer(),
      Enter: () => { if (tag === 'BUTTON') return 'native'; playerAct('pplay'); }
    };
    if (map[k]) { const r = map[k](); if (r !== 'native') e.preventDefault(); }
    return;
  }
  if (!uid) return;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) {
    if (tag === 'INPUT' && ['ArrowLeft', 'ArrowRight'].includes(k) && e.target.type !== 'range') return;
    e.preventDefault(); moveFocus(k);
  } else if (k === 'Enter' && e.target.getAttribute && e.target.getAttribute('tabindex') === '0' && !['BUTTON', 'INPUT', 'SELECT'].includes(tag)) { e.preventDefault(); e.target.click(); }
  else if ((k === 'Escape' || k === 'GoBack' || k === 'BrowserBack' || (k === 'Backspace' && tag !== 'INPUT')) && !$('#modal').classList.contains('hidden')) { e.preventDefault(); closeModal(); }
  else if ((k === 'Escape' || k === 'GoBack' || (k === 'Backspace' && tag !== 'INPUT'))) { e.preventDefault(); A.back(); }
});

/* ───────────── boot ───────────── */
function boot() {
  history.replaceState({ s: 'home' }, '');
  if (uid && users.some(u => u.id === uid)) { loadU(); render(); } else { uid = null; renderAuth(); }
  if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !isNative()) navigator.serviceWorker.register('sw.js').catch(() => {});
}
window.__tamy = { parseM3U, xBase };
boot();
})();
