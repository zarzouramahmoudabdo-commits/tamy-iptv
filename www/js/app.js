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

const UAS = { vlc: 'VLC/3.0.20 LibVLC/3.0.20', smarters: 'IPTVSmartersPro', android: 'Dalvik/2.1.0 (Linux; U; Android 13; Pixel 7 Build/TQ3A.230901.001)', chrome: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36', ffmpeg: 'Lavf/60.3.100', tivimate: 'TiviMate/4.7.0 (Linux; Android 13)' };
const curUA = () => UAS[(U && U.settings && U.settings.ua)] || UAS.vlc;
const isNative = () => { const C = window.Capacitor; if (!C) return false; try { if (C.isNativePlatform && C.isNativePlatform()) return true; return !!(C.getPlatform && C.getPlatform() === 'android'); } catch (e) { return false; } };
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
const DEF = () => ({ sources: [], favs: [], recent: {}, pos: {}, settings: { theme: 'morph', city: 'Cairo', country: 'Egypt', method: 5, lat: null, lng: null, adhan: true, adhanUrl: '', engine: 'auto', ua: 'vlc', fmt: 'm3u8', active: 'free', showFree: false, autoUpdate: true } });
function loadU() { U = LS.get('tamy:u:' + uid, null) || DEF(); U.settings = Object.assign(DEF().settings, U.settings || {}); U.pos = U.pos || {}; U.recent = U.recent || {}; U.recentL = U.recentL || {}; U.sources = U.sources || []; if (U.settings.active !== 'free' && !U.sources.some(x => x.id === U.settings.active)) U.settings.active = 'free'; if (U.settings.active === 'free' && U.settings.showFree === false && U.sources.length) U.settings.active = U.sources[0].id; applyTheme(); }
function saveU() { if (uid) LS.set('tamy:u:' + uid, U); if (typeof srvAuto === 'function') srvAuto(); }
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
      let u = l; const ym = l.match(/^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|live\/|embed\/)|youtu\.be\/)([\w-]{11})/i);
      if (ym) u = 'yt:' + ym[1]; else { const cm = l.match(/youtube\.com\/channel\/(UC[\w-]{22})/i); if (cm) u = 'ytc:' + cm[1]; }
      out.push({ id: kind + '|' + l, name: meta.name, logo: meta.logo, group: meta.group || '—', url: u, kind });
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
    return arr(l).map(x => ({ id: 'movie|' + s.id + '|' + x.stream_id, name: x.name, logo: x.stream_icon, group: m[x.category_id] || '—', url: `${b}/movie/${u}/${p}/${x.stream_id}.${x.container_extension || 'mp4'}`, kind: 'movie', vid: x.stream_id, srcId: s.id }));
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
/* ───────────── favorites / recent ───────────── */
const isFav = id => U.favs.some(f => f.id === id);
function toggleFav(item) {
  const i = U.favs.findIndex(f => f.id === item.id);
  if (i >= 0) U.favs.splice(i, 1); else U.favs.unshift({ id: item.id, name: item.name, logo: item.logo, url: item.url, kind: item.kind, group: item.group, sid: item.sid, vid: item.vid, srcId: item.srcId, src: item.src || U.settings.active });
  saveU(); return i < 0;
}
function saveRecent(item) {
  if (!['live', 'movie', 'series'].includes(item.kind)) return;
  const rec = { id: item.id, name: item.name, logo: item.logo, url: item.url, kind: item.kind, group: item.group, sid: item.sid, vid: item.vid, srcId: item.srcId, src: U.settings.active };
  U.recent[item.kind] = rec;
  const arr = (U.recentL[item.kind] = U.recentL[item.kind] || []); const k = arr.findIndex(x => x.id === rec.id); if (k >= 0) arr.splice(k, 1); arr.unshift(rec); if (arr.length > 60) arr.length = 60;
  saveU();
}

/* ───────────── router ───────────── */
const SCREENS = ['home', 'live', 'movies', 'series', 'favs', 'subs', 'radio', 'prayer', 'settings'];
let screen = 'home';
function nav(s, push = true) {
  if (!uid) return renderAuth();
  screen = s; { const S = ({ live: LV, movies: MV, series: SV })[s]; if (S) S.pane = 'cats'; }
  if (push) history.pushState({ s }, '');
  render();
  window.scrollTo(0, 0);
}
function render() {
  if (!uid) return renderAuth();
  renderTop();
  const v = $('#view'); v.classList.toggle('fix', ['home', 'live', 'movies', 'series'].includes(screen));
  ({ home: vHome, live: () => vList(LV), movies: () => vList(MV), series: () => vList(SV), favs: vFavs, subs: vSubs, radio: vRadio, prayer: vPrayer, settings: vSettings }[screen] || vHome)(v);
}
/* ───────────── icons ───────────── */
const IC = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 9.5V20h5v-6h4v6h5V9.5"/>',
  tv: '<rect x="3" y="7" width="18" height="12" rx="2.5"/><path d="M8 2.5l4 4 4-4"/>',
  film: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>',
  series: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M7 3.5h10"/><path d="M10.5 10.5l4.5 2.8-4.5 2.8z"/>',
  heart: '<path d="M20.8 5.6a5 5 0 00-7.1 0L12 7.3l-1.7-1.7a5 5 0 10-7.1 7.1L12 21l8.8-8.3a5 5 0 000-7.1z"/>',
  radio: '<rect x="3" y="9" width="18" height="12" rx="2"/><path d="M7 9l11-6"/><circle cx="8.5" cy="15" r="2.5"/><path d="M15 13h3M15 17h3"/>',
  moon: '<path d="M21 13a9 9 0 11-9.9-9 7 7 0 009.9 9z"/>',
  cast: '<circle cx="12" cy="12" r="2"/><path d="M16.2 7.8a6 6 0 010 8.4M7.8 16.2a6 6 0 010-8.4M19 5a10 10 0 010 14M5 19a10 10 0 010-14"/>',
  sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  back: '<path d="M5 12h14M13 6l6 6-6 6"/>'
};
const ic = (n, s = 22) => `<svg class="ic" viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n] || ''}</svg>`;
const flag = cc => cc.toUpperCase().replace(/./g, c => String.fromCodePoint(127397 + c.charCodeAt(0)));

function renderTop() {
  const lbl = { home: L('الرئيسية', 'Home'), live: L('بث مباشر', 'Live TV'), movies: L('أفلام', 'Movies'), series: L('مسلسلات', 'Series'), favs: L('المفضلة', 'Favorites'), radio: L('راديو', 'Radio'), prayer: L('مواقيت الصلاة', 'Prayer'), subs: L('اشتراكاتي', 'Subscriptions'), settings: L('الإعدادات', 'Settings'), search: L('بحث', 'Search') };
  const icn = { home: 'home', live: 'tv', movies: 'film', series: 'series', favs: 'heart', radio: 'radio', prayer: 'moon', subs: 'cast', settings: 'sliders' };
  const btn = s => `<button class="dk ${s === screen ? 'on' : ''}" data-act="go" data-to="${s}" data-l="${lbl[s]}" title="${lbl[s]}" aria-label="${lbl[s]}">${ic(icn[s])}${s === 'settings' && APK_NEW ? '<i class="rd"></i>' : ''}</button>`;
  $('#topbar').innerHTML = `<div class="hdr">
    <div class="hl">${screen !== 'home' ? `<button class="dk back" data-act="back" title="${L('رجوع', 'Back')}" aria-label="back"><span class="flip">${ic('back')}</span></button>` : ''}
      <div class="brand"><img src="icons/icon-192.png" alt=""><span>TAMY <b>IPTV</b></span></div></div>
    <div class="hm"><span class="hclk">--:--</span><small class="hdate"></small></div>
    <nav class="dock">${['home', 'live', 'movies', 'series', 'favs', 'radio', 'prayer', 'subs', 'settings'].map(btn).join('')}<button class="dk" data-act="search" data-l="${lbl.search}" title="${lbl.search}" aria-label="search">${ic('search')}</button></nav></div>`;
  tickHdr();
}
function tickHdr() {
  const c = $('.hclk'), d = $('.hdate'); if (!c) return; const n = new Date();
  c.textContent = n.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  d.textContent = n.toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

const M = { swallow: false };
window.addEventListener('popstate', e => {
  if (M.swallow) { M.swallow = false; return; }
  if (!$('#modal').classList.contains('hidden')) return closeModal(true);
  if (!$('#player').classList.contains('hidden')) return closePlayer(true);
  const st = e.state;
  if (st && st.o) return history.back();
  screen = (st && st.s) || 'home'; const S = stateOf(); if (S && !(st && st.pane)) S.pane = 'cats'; render();
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
  if (!fromPop) { M.swallow = true; try { history.back(); } catch { M.swallow = false; } }
}
function closeModalSilent() { const m = $('#modal'); m.classList.add('hidden'); m.innerHTML = ''; }

/* ───────────── auth ───────────── */
let authMode = 'in';
let selAcc = LS.get('tamy:last', null);
function renderAuth() {
  $('#topbar').innerHTML = ''; $('#view').classList.remove('fix');
  const real = users.filter(u => !u.guest);
  if (!real.length) authMode = 'up';
  if (!real.some(u => u.id === selAcc)) selAcc = real.length ? real[0].id : null;
  const up = authMode === 'up', pw = (id, ph, ac) => `<div class="pw"><input class="in" id="${id}" type="password" placeholder="${ph}" autocomplete="${ac}"><button type="button" class="eye" data-act="eye" aria-label="show">👁</button></div>`;
  $('#view').innerHTML = `<div class="auth"><img src="icons/icon-512.png" alt="">
    <h1>TAMY IPTV</h1><p>${L('تلفزيونك. عالمك.', 'Your TV. Your world.')}</p>
    <div class="seg atabs">${real.length ? `<button class="sg ${!up ? 'on' : ''}" data-act="authmode" data-m="in">${L('تسجيل الدخول', 'Sign in')}</button>` : ''}<button class="sg ${up ? 'on' : ''}" data-act="authmode" data-m="up">${L('حساب جديد', 'New account')}</button></div>
    ${!up ? `<div class="accs">${real.map(u => `<button class="acc ${u.id === selAcc ? 'on' : ''}" data-act="pickacc" data-id="${esc(u.id)}"><span class="av">${esc((u.name || '?')[0].toUpperCase())}</span><b>${esc(u.name)}</b></button>`).join('')}</div>` : `<input class="in" id="a-name" placeholder="${L('اسم المستخدم', 'Username')}" autocomplete="username" autocapitalize="off" maxlength="24">`}
    ${pw('a-pass', L('كلمة المرور', 'Password'), up ? 'new-password' : 'current-password')}
    ${up ? `${pw('a-pass2', L('تأكيد كلمة المرور', 'Confirm password'), 'new-password')}<div class="meter"><i id="a-meter"></i></div><small class="mt" id="a-mt">${L('4 أحرف على الأقل', 'At least 4 characters')}</small>` : ''}
    <div class="err" id="a-err" role="alert"></div>
    <button class="btn pri" data-act="${up ? 'signup' : 'login'}">${up ? L('إنشاء حساب', 'Create account') : L('دخول', 'Sign in')}</button>
    ${!up ? `<button class="lnk" data-act="forgot">${L('نسيت كلمة المرور؟', 'Forgot password?')}</button>` : ''}
    <div class="or"><span>${L('أو', 'or')}</span></div>
    <button class="btn" data-act="guest">${L('متابعة كضيف', 'Continue as guest')}</button>
    <p class="note">${L('الحسابات محفوظة على جهازك فقط، ولا تُرسل لأي سيرفر.', 'Accounts are stored on this device only and never sent to any server.')}</p>
    <button class="chip" data-act="lang">${lang === 'ar' ? 'English' : 'العربية'}</button></div>`;
  const pi = $('#a-pass'); if (up && pi) pi.addEventListener('input', () => strength(pi.value));
}
function strength(v) {
  let sc = 0; if (v.length >= 4) sc++; if (v.length >= 8) sc++; if (/[A-Za-z]/.test(v) && /\d/.test(v)) sc++; if (/[^A-Za-z0-9]/.test(v) || v.length >= 12) sc++;
  const m = $('#a-meter'), t = $('#a-mt'); if (!m) return;
  m.style.width = (v ? sc * 25 : 0) + '%'; m.style.background = ['#e5484d', '#e5484d', '#f5a524', '#46a758', '#2fbf71'][sc];
  t.textContent = !v ? L('4 أحرف على الأقل', 'At least 4 characters') : [L('ضعيفة جداً', 'Very weak'), L('ضعيفة', 'Weak'), L('متوسطة', 'Fair'), L('جيدة', 'Good'), L('قوية', 'Strong')][sc];
}
function authErr(m, id) {
  const e = $('#a-err'); if (e) { e.textContent = m; e.classList.remove('shake'); void e.offsetWidth; e.classList.add('shake'); }
  const f = id && $('#' + id); if (f) { f.classList.add('bad'); f.focus(); setTimeout(() => f.classList.remove('bad'), 1200); }
}
async function enter(id) { uid = id; LS.set('tamy:uid', id); LS.set('tamy:last', id); selAcc = id; authMode = 'in'; loadU(); startApp(); }

/* ───────────── home ───────────── */
function vHome(v) {
  const src = activeSrc(), sn = esc(src.name), r = U.recent;
  const cnt = k => { const a = xc.get(src.id + '|' + k); return a ? a.length + ' ' + L('عنصر', 'items') : (src.type === 'free' ? L('قنوات عالمية مجانية', 'Free world channels') : sn); };
  const info = src.info, exp = info && info.exp ? new Date(info.exp * 1000).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB') : '';
  const st = (n, label, act, to) => `<button class="stile" data-act="${act}" data-to="${to}">${ic(n, 30)}<span>${label}</span></button>`;
  v.innerHTML = `<div class="hwrap">${srcBar()}<div id="xtra" class="xtra hidden"></div>
    <div class="hgrid">
      <button class="htile live" data-act="go" data-to="live" style="--d:0ms"><span class="big">${ic('tv', 90)}</span><b>${L('تلفزيون مباشر', 'Live TV')}</b><small>${cnt('live')}</small></button>
      <button class="htile mov" data-act="go" data-to="movies" style="--d:80ms"><span class="big">${ic('film', 64)}</span><b>${L('أفلام', 'Movies')}</b><small>${src.type === 'free' ? L('من اشتراكك', 'From your subscription') : cnt('movie')}</small></button>
      <button class="htile ser" data-act="go" data-to="series" style="--d:160ms"><span class="big">${ic('series', 64)}</span><b>${L('مسلسلات', 'Series')}</b><small>${src.type === 'free' ? L('من اشتراكك', 'From your subscription') : cnt('series')}</small></button>
      <div class="smalls">${st('heart', L('المفضلة', 'Favorites'), 'go', 'favs')}${st('clock', L('آخر ما شاهدته', 'Recently watched'), 'recents', '')}${st('radio', L('راديو', 'Radio'), 'go', 'radio')}${st('moon', L('مواقيت الصلاة', 'Prayer times'), 'go', 'prayer')}</div>
    </div>
    <div class="hfoot"><span>${L('الاشتراك الحالي: ', 'Current: ')}<b>${sn}</b></span>${exp ? `<span>${L('ينتهي: ', 'Expires: ')}<b>${exp}</b></span>` : ''}<span class="mut">${L('TAMY IPTV مشغّل فقط — المحتوى من اشتراكك والمجاني من قوائم عامة', 'Player only — content from your subscription; free from public lists')}</span></div></div>`;
  setTimeout(loadXtra, 0);
}
function recentsModal() {
  const r = U.recent, row = (k, ic2, label) => r[k] ? `<div class="ep"><span>${ic2} ${label}: <b>${esc(r[k].name)}</b></span><button class="btn sm pri" data-act="resume" data-k="${k}">▶</button></div>` : '';
  const html = row('live', '📺', L('قناة', 'Channel')) + row('movie', '🎬', L('فيلم', 'Movie')) + row('series', '🎞️', L('مسلسل', 'Series'));
  modal(`<h3>${L('آخر ما شاهدته', 'Recently watched')}</h3>${html || `<p style="color:var(--mut)">${L('لم تشاهد شيئاً بعد', 'Nothing watched yet')}</p>`}<div class="acts"><button class="btn" data-act="mclose">${L('إغلاق', 'Close')}</button></div>`);
}

/* ───────────── sources (الاشتراكات) ───────────── */
const FREE = () => ({ id: 'free', name: L('مجاني', 'Free'), type: 'free' });
const freeOn = () => U.settings.showFree !== false || !U.sources.length;
const allSources = () => [...(freeOn() ? [FREE()] : []), ...U.sources];
const activeSrc = () => allSources().find(s => s.id === U.settings.active) || allSources()[0] || FREE();
const isFreeNow = () => activeSrc().type === 'free';
function srcBar() {
  const a = activeSrc();
  return `<div class="seg">${freeOn() ? `<button class="sg ${a.type === 'free' ? 'on' : ''}" data-act="usesrc" data-id="free">🌍 ${L('مجاني', 'Free')}</button>` : ''}${U.sources.map(s => `<button class="sg ${s.id === a.id ? 'on' : ''}" data-act="usesrc" data-id="${esc(s.id)}">📡 ${esc(s.name)}</button>`).join('')}<button class="sg add" data-act="addsrc" title="${L('إضافة اشتراك', 'Add subscription')}" aria-label="add">${ic('plus', 18)}</button></div>`;
}

/* ───────────── list screens (live / movies / series) ───────────── */
const mk = kind => ({ kind, srcId: null, cat: null, q: '', items: [], groups: [], fg: 'all', shown: 80, loading: false, err: '', loaded: false, pane: 'cats' });
const LV = mk('live'), MV = mk('movie'), SV = mk('series');
let curList = [];
const ICON = { live: '📺', movie: '🎬', series: '🎞️', radio: '📻' };
const wide = () => matchMedia('(min-width:700px)').matches;
const isFreeCat = c => /^(free|cat|lang):/.test(c || '');
const stateOf = () => ({ live: LV, movies: MV, series: SV }[screen]);
const FB = 'https://iptv-org.github.io/iptv/';
const freeUrls = id => id === 'free:EG' ? [FB + 'countries/eg.m3u', 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlists/playlist_egypt.m3u8']
  : id === 'free:world' ? [FB + 'index.m3u'] : id === 'lang:ara' ? [FB + 'languages/ara.m3u']
  : id.startsWith('cat:') ? [FB + 'categories/' + id.slice(4) + '.m3u'] : [FB + 'countries/' + id.slice(5).toLowerCase() + '.m3u'];

function syncState(S, src) {
  if (S.srcId !== src.id) Object.assign(S, { srcId: src.id, cat: null, q: '', items: [], groups: [], fg: 'all', loaded: false, loading: false, err: '', shown: 80, pane: 'cats' });
}
async function loadList(S) {
  const sid = S.srcId, src = activeSrc();
  S.loading = true; S.err = ''; repaint(S);
  try {
    S.items = await loadSource(src, S.kind);
    const g = new Map(); S.items.forEach(i => g.set(i.group, (g.get(i.group) || 0) + 1)); S.groups = [...g];
  } catch (e) { S.err = msg(e); }
  if (S.srcId !== sid) return;
  S.loading = false; S.loaded = !S.err; repaint(S);
}
async function loadFree(S, id) {
  const sid = S.srcId; S.items = []; S.groups = []; S.fg = 'all'; S.loading = true; S.err = ''; repaint(S);
  const rs = await Promise.allSettled(freeUrls(id).map(loadM3U));
  if (S.srcId !== sid || S.cat !== id) return;
  const seen = new Set(), items = []; let err = '';
  rs.forEach(r => { if (r.status === 'fulfilled') r.value.forEach(i => { if (!seen.has(i.url)) { seen.add(i.url); items.push(i); } }); else err = err || msg(r.reason); });
  if (items.length) err = ''; else err = err || L('لا توجد قنوات في هذه القائمة', 'No channels in this list');
  items.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
  const g = new Map(); items.forEach(i => g.set(i.group, (g.get(i.group) || 0) + 1));
  S.groups = [...g].sort((a, b) => b[1] - a[1]); S.items = items; S.err = err; S.loading = false; repaint(S);
}
const repaint = S => { if (S === stateOf()) render(); };
function recentOf(S) { return (U.recentL[S.kind] || []).filter(i => i.src === S.srcId); }
function favsOf(S) { return U.favs.filter(f => f.kind === S.kind && (!f.src || f.src === S.srcId)); }
function baseItems(S) {
  const c = S.cat;
  if (c === 'recent') return recentOf(S);
  if (c === 'favs') return favsOf(S);
  if (isFreeCat(c)) return S.fg && S.fg !== 'all' ? S.items.filter(i => i.group === S.fg) : S.items;
  if (c && c.startsWith('g:') && !S.q.trim()) return S.items.filter(i => i.group === c.slice(2));
  return S.items;
}
function filtered(S) {
  const q = S.q.trim().toLowerCase(); const l = baseItems(S);
  return q ? l.filter(i => (i.name || '').toLowerCase().includes(q)) : l;
}
function catName(S) {
  const c = S.cat;
  if (S.q.trim()) return L('نتائج البحث', 'Search results');
  if (c === 'recent') return L('شوهدت مؤخراً', 'Recently viewed');
  if (c === 'favs') return L('المفضلة', 'Favorites');
  if (c === 'all') return L('الكل', 'All');
  if (c === 'free:EG') return flag('EG') + ' ' + L('قنوات مصر', 'Egypt');
  if (c === 'free:world') return '🌍 ' + L('كل قنوات العالم', 'All world channels');
  if (c === 'lang:ara') return '🌐 ' + L('كل القنوات العربية', 'All Arabic channels');
  if (c && c.startsWith('g:')) return c.slice(2);
  const isCat = (c || '').startsWith('cat:'), k = (c || '').slice(isCat ? 4 : 5), f = (isCat ? CATS : COUNTRIES).find(x => x[0].toLowerCase() === k.toLowerCase());
  return f ? (isCat ? '' : flag(f[0]) + ' ') + f[lang === 'ar' ? 1 : 2] : '';
}
function catsHtml(S, src) {
  const e = (id, label, n, ic2) => `<button class="cat ${S.cat === id ? 'on' : ''}" data-act="cat" data-c="${esc(id)}"><span>${ic2 ? ic2 + ' ' : ''}${esc(label)}</span><i>${n == null ? '' : n}</i></button>`;
  const head = t => `<div class="cathead">${t}</div>`;
  let h = e('recent', L('شوهدت مؤخراً', 'Recently viewed'), recentOf(S).length, '🕘') + e('favs', L('المفضلة', 'Favorites'), favsOf(S).length, '★');
  if (src.type === 'free') {
    h += e('free:EG', L('قنوات مصر', 'Egypt'), null, flag('EG')) + e('free:world', L('كل قنوات العالم', 'All world channels'), null, '🌍') + e('lang:ara', L('كل القنوات العربية', 'All Arabic channels'), null, '🌐');
    h += head(L('اختر الدولة', 'COUNTRY')) + COUNTRIES.filter(c => c[0] !== 'EG').map(c => e('free:' + c[0], c[lang === 'ar' ? 1 : 2], null, flag(c[0]))).join('');
    h += head(L('حسب التصنيف', 'CATEGORY')) + CATS.map(c => e('cat:' + c[0], c[lang === 'ar' ? 1 : 2], null, '')).join('');
  } else {
    h += e('all', L('الكل', 'All'), S.items.length, '☰') + head(L('القوائم', 'CATEGORIES')) + S.groups.map(([g, n]) => e('g:' + g, g, n)).join('');
  }
  return h;
}
function cardHtml(i, idx) {
  const poster = i.kind === 'movie' || i.kind === 'series', free = isFreeNow() && screen !== 'favs';
  const ph = `<span class="ph">${ICON[i.kind] || '📺'}</span>`;
  return `<div class="card ${poster ? 'p' : 'l'}" tabindex="0" data-act="open" data-i="${idx}" style="--d:${Math.min(idx, 18) * 28}ms">
    ${free ? `<span class="fb">${L('مجاني', 'FREE')}</span>` : ''}
    <div class="im">${i.logo ? `<img loading="lazy" referrerpolicy="no-referrer" src="${esc(i.logo)}" alt="" onerror="this.outerHTML='${ph}'">` : ph}</div>
    <div class="nm">${esc(i.name)}</div>
    <button class="fv ${isFav(i.id) ? 'on' : ''}" data-act="fav" data-i="${idx}" aria-label="fav">${isFav(i.id) ? '★' : '☆'}</button></div>`;
}
function paintMain(S) {
  const g = $('#grid'); if (!g) return;
  const sp = $('.split'); if (sp) sp.dataset.pane = S.pane;
  $$('#cats .cat').forEach(b => b.classList.toggle('on', b.dataset.c === S.cat));
  const t = $('#mtitle'); if (t) t.textContent = catName(S);
  const cn = $('#cnt'), gc = $('#gchips');
  const spin = `<div class="empty"><div class="spin" style="position:static;margin:0 auto 14px"></div>${L('جارٍ التحميل…', 'Loading…')}</div>`;
  if (S.loading && isFreeCat(S.cat)) { g.innerHTML = spin; if (cn) cn.textContent = ''; if (gc) gc.innerHTML = ''; return; }
  if (S.err && isFreeCat(S.cat)) { g.innerHTML = `<div class="empty"><div class="big">⚠️</div><p>${esc(S.err)}</p><button class="btn" data-act="reload">${L('إعادة المحاولة', 'Retry')}</button></div>`; if (gc) gc.innerHTML = ''; return; }
  if (gc) gc.innerHTML = isFreeCat(S.cat) && S.groups.length > 1 ? `<button class="chip ${S.fg === 'all' ? 'on' : ''}" data-act="fgrp" data-g="all">${L('الكل', 'All')}</button>` + S.groups.slice(0, 14).map(([n, c]) => `<button class="chip ${S.fg === n ? 'on' : ''}" data-act="fgrp" data-g="${esc(n)}">${esc(n)} · ${c}</button>`).join('') : '';
  if (!S.cat && !S.q.trim()) { g.innerHTML = ''; return; }
  const list = curList = filtered(S); if (cn) cn.textContent = list.length;
  if (!list.length) { g.innerHTML = `<div class="empty"><div class="big">${S.cat === 'favs' ? '★' : S.cat === 'recent' ? '🕘' : '🔎'}</div><p>${L('لا توجد عناصر هنا', 'Nothing here')}</p></div>`; return; }
  const shown = list.slice(0, S.shown), poster = S.kind !== 'live';
  g.innerHTML = `<div class="grid ${poster ? 'poster' : ''}">${shown.map((i, n) => cardHtml(i, n)).join('')}</div>` +
    (list.length > shown.length ? `<button class="btn more" id="more" data-act="more">${L('عرض المزيد', 'Show more')} (${list.length - shown.length})</button>` : '');
  const m = $('#more'); if (m && 'IntersectionObserver' in window) { const io = new IntersectionObserver(en => { if (en[0].isIntersecting) { io.disconnect(); S.shown += 80; paintMain(S); } }, { rootMargin: '700px' }); io.observe(m); }
}
function selectCat(S, id) {
  S.cat = id; S.shown = 80; S.q = ''; S.fg = 'all'; const q = $('#q'); if (q) q.value = '';
  if (!wide() && S.pane !== 'items') { S.pane = 'items'; history.pushState({ s: screen, pane: 1 }, ''); }
  if (isFreeCat(id)) loadFree(S, id); else paintMain(S);
  const gr = $('#grid'); if (gr) gr.scrollTop = 0;
}
function vList(S) {
  const v = $('#view'), src = activeSrc(); syncState(S, src);
  const head = srcBar();
  if (src.type === 'free' && S.kind !== 'live') {
    v.innerHTML = `<div class="lwrap">${head}<div class="empty"><div class="big">${ICON[S.kind]}</div><h3>${S.kind === 'movie' ? L('الأفلام من اشتراكك', 'Movies from your subscription') : L('المسلسلات من اشتراكك', 'Series from your subscription')}</h3>
      <p>${L('اختر اشتراكك من الأعلى أو أضف اشتراك Xtream / M3U.', 'Pick your subscription above or add an Xtream / M3U one.')}</p><button class="btn pri" data-act="addsrc">＋ ${L('إضافة اشتراك', 'Add subscription')}</button></div></div>`; return;
  }
  if (src.type !== 'free' && !S.loaded) {
    if (!S.loading && !S.err) { loadList(S); }
    v.innerHTML = `<div class="lwrap">${head}` + (S.err ? `<div class="empty"><div class="big">⚠️</div><p>${esc(S.err)}</p><button class="btn" data-act="reload">${L('إعادة المحاولة', 'Retry')}</button></div>` : `<div class="empty"><div class="spin" style="position:static;margin:0 auto 14px"></div>${L('جارٍ تحميل ', 'Loading ')}${esc(src.name)}…</div>`) + '</div>';
    return;
  }
  if (!S.cat && !S.q.trim() && wide()) {
    S.cat = src.type === 'free' ? 'free:EG' : (recentOf(S).length ? 'recent' : 'all');
    if (isFreeCat(S.cat)) { loadFree(S, S.cat); return; }
  }
  v.innerHTML = `<div class="lwrap">${head}<div class="split" data-pane="${S.pane}">
    <aside class="side"><input class="in" id="q" type="search" placeholder="🔍 ${L('بحث في الكل…', 'Search all…')}" value="${esc(S.q)}"><div id="cats">${catsHtml(S, src)}</div></aside>
    <section class="main"><div class="mhead"><button class="btn sm backc" data-act="cats">${lang === 'ar' ? '→' : '←'} ${L('القوائم', 'Lists')}</button><b id="mtitle"></b>${src.type === 'free' ? `<span class="fbadge">${L('مجاني', 'FREE')}</span>` : ''}<span style="flex:1"></span><span id="cnt" class="cnt"></span></div><div id="gchips" class="chips"></div><div id="grid"></div></section></div></div>`;
  paintMain(S);
  const sc = $('#cats .cat.on'); if (sc) sc.scrollIntoView({ block: 'nearest' });
  const q = $('#q');
  q.addEventListener('input', () => {
    clearTimeout(q._t); q._t = setTimeout(() => {
      S.q = q.value; S.shown = 80;
      if (S.q.trim() && !S.cat) { S.cat = src.type === 'free' ? 'free:world' : 'all'; if (isFreeCat(S.cat)) loadFree(S, S.cat); }
      if (S.q.trim() && !wide() && S.pane !== 'items') { S.pane = 'items'; history.pushState({ s: screen, pane: 1 }, ''); }
      paintMain(S);
    }, 220);
  });
}

/* favorites */
let favTab = 'all';
const favItems = () => U.favs.filter(f => favTab === 'all' || f.kind === favTab);
function vFavs(v) {
  const tabs = [['all', L('الكل', 'All')], ['live', L('قنوات', 'Channels')], ['movie', L('أفلام', 'Movies')], ['series', L('مسلسلات', 'Series')], ['radio', L('راديو', 'Radio')]];
  const list = curList = favItems().slice(0, 400);
  v.innerHTML = `<div class="chips">${tabs.map(t => `<button class="chip ${favTab === t[0] ? 'on' : ''}" data-act="favtab" data-t="${t[0]}">${t[1]}</button>`).join('')}</div>` +
    (list.length ? `<div class="grid">${list.map((i, n) => cardHtml(i, n)).join('')}</div>` : `<div class="empty"><div class="big">♥</div><p>${L('لم تضف أي مفضلة بعد. اضغط ☆ على أي قناة أو فيلم.', 'No favorites yet. Tap ☆ on any channel or title.')}</p></div>`);
}

/* ───────────── subscriptions screen ───────────── */
function vSubs(v) {
  const act = activeSrc().id;
  v.innerHTML = `<div class="bar"><b style="font-size:20px">📡 ${L('اشتراكاتي', 'My subscriptions')}</b><span style="flex:1"></span><button class="btn pri" data-act="addsrc">＋ ${L('إضافة اشتراك', 'Add subscription')}</button></div>` +
    allSources().map(s => {
      const i = s.info, id = esc(s.id);
      const line = s.type === 'free' ? L('قنوات مجانية عامة (iptv-org) — بث مباشر فقط', 'Free public channels (iptv-org) — live only') : s.type === 'xtream' ? 'Xtream · ' + esc(s.url) : s.type === 'file' ? L('ملف M3U محلي', 'Local M3U file') : 'M3U · ' + esc(s.url);
      const inf = i ? `<small>${L('الحالة', 'Status')}: <b>${esc(i.status || '—')}</b> · ${L('ينتهي', 'Expires')}: <b>${i.exp ? new Date(i.exp * 1000).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB') : '∞'}</b> · ${L('الأجهزة', 'Devices')}: <b>${i.act ?? '—'}/${i.max ?? '—'}</b></small>` : '';
      return `<div class="sub ${s.id === act ? 'act' : ''}"><div class="sh"><b>${s.type === 'free' ? '🌍' : '📡'} ${esc(s.name)}</b>${s.id === act ? `<span class="tag">${L('نشط', 'Active')}</span>` : ''}</div><small>${line}</small>${inf}
        <div class="acts" style="justify-content:flex-start">${s.id === act ? `<button class="btn sm pri" data-act="go" data-to="live">📺 ${L('فتح', 'Open')}</button>` : `<button class="btn sm pri" data-act="usesrc" data-id="${id}" data-go="1">${L('استخدام', 'Use')}</button>`}
        ${s.type === 'free' ? '' : `${s.type === 'xtream' ? `<button class="btn sm" data-act="chksrc" data-id="${id}">🔍 ${L('فحص', 'Check')}</button>` : ''}<button class="btn sm" data-act="editsrc" data-id="${id}">✎ ${L('تعديل', 'Edit')}</button><button class="btn sm" data-act="refsrc" data-id="${id}">⟳ ${L('تحديث', 'Refresh')}</button><button class="btn sm dng" data-act="delsrc" data-id="${id}">🗑 ${L('حذف', 'Delete')}</button>`}</div></div>`;
    }).join('') + `<p class="note">${L('كل اشتراك له قنواته وأفلامه ومسلسلاته وقوائمه الخاصة. اختر الاشتراك النشط من أي شاشة.', 'Each subscription has its own channels, movies, series and categories. Switch the active one from any screen.')}</p>`;
}

/* ───────────── movie details ───────────── */
function detHtml(item, i) {
  i = i || {}; const bits = [i.rating && '⭐ ' + i.rating, i.releasedate || i.releaseDate || i.release_date, i.duration, i.genre].filter(Boolean).map(esc).join(' · ');
  const cover = i.movie_image || item.logo;
  return `<div class="det"><div class="dr">${cover ? `<img class="pst" referrerpolicy="no-referrer" src="${esc(cover)}" alt="" onerror="this.remove()">` : ''}<div style="min-width:0"><h3 style="margin:0 0 6px">${esc(item.name)}</h3><small style="color:var(--mut)">${bits}</small></div></div>
    ${i.plot || i.description ? `<p class="plot">${esc(i.plot || i.description)}</p>` : ''}
    ${i.director ? `<small>🎬 ${esc(i.director)}</small>` : ''}${i.cast || i.actors ? `<small>👥 ${esc(i.cast || i.actors)}</small>` : ''}
    <div class="acts"><button class="btn" data-act="mclose">${L('إغلاق', 'Close')}</button><button class="btn" data-act="dfav">${isFav(item.id) ? '★' : '☆'} ${L('مفضلة', 'Favorite')}</button><button class="btn pri" data-act="dplay">▶ ${L('تشغيل', 'Play')}</button></div></div>`;
}
async function openMovie(item) {
  window._det = item; window._detList = curList.filter(x => x.kind === 'movie');
  modal(`<div id="det">${detHtml(item, null)}</div>`);
  const s = U.sources.find(x => x.id === item.srcId);
  if (s && s.type === 'xtream' && item.vid) {
    try { const j = await apiJson(`${xBase(s.url)}/player_api.php?username=${enc(s.user)}&password=${enc(s.pass)}&action=get_vod_info&vod_id=${item.vid}`); const d = $('#det'); if (d && window._det === item) d.innerHTML = detHtml(item, Object.assign({}, j.info || {}, { movie_image: (j.info || {}).movie_image })); } catch {}
  }
}

/* ───────────── series modal ───────────── */
async function openSeries(item) {
  const s = U.sources.find(x => x.id === item.srcId); if (!s) return toast(L('المصدر غير موجود', 'Source not found'));
  modal(`<h3>${esc(item.name)}</h3><div class="empty"><div class="spin" style="position:static;margin:0 auto"></div></div>`);
  try {
    const b = xBase(s.url);
    const j = await apiJson(`${b}/player_api.php?username=${enc(s.user)}&password=${enc(s.pass)}&action=get_series_info&series_id=${item.sid}`);
    const eps = Array.isArray(j.episodes) ? Object.fromEntries(j.episodes.map((a, i) => [i + 1, a])) : (j.episodes || {});
    const seasons = Object.keys(eps).sort((a, b) => a - b); const inf = j.info || {};
    if (!seasons.length) throw new Error(L('لا توجد حلقات', 'No episodes'));
    const mk = sn => (eps[sn] || []).map(e => ({ id: 'series|' + s.id + '|ep' + e.id, name: `${item.name} — ${L('م', 'S')}${sn} ${L('ح', 'E')}${e.episode_num}`, url: `${b}/series/${enc(s.user)}/${enc(s.pass)}/${e.id}.${e.container_extension || 'mp4'}`, kind: 'series', logo: item.logo, group: item.group, title: e.title, srcId: s.id }));
    window._allEps = seasons.flatMap(mk);   // كل المواسم بالترتيب → الحلقة التالية تشتغل تلقائيًا حتى بعد آخر حلقة في الموسم
    const draw = sn => {
      const list = mk(sn);
      window._eps = list;
      $('#eps').innerHTML = list.map((e, n) => `<div class="ep"><span>${esc(e.title || e.name)}</span><button class="btn sm pri" data-act="ep" data-n="${n}">▶</button></div>`).join('');
      $$('#smod .chip').forEach(c => c.classList.toggle('on', c.dataset.sn === String(sn)));
    };
    $('#modal .mbox').innerHTML = `<div id="smod"><h3>${esc(item.name)}</h3><small style="color:var(--mut)">${[inf.rating && '⭐ ' + inf.rating, inf.releaseDate || inf.releasedate, inf.genre].filter(Boolean).map(esc).join(' · ')}</small>${inf.plot ? `<p class="plot">${esc(inf.plot)}</p>` : ''}
      <div class="chips">${seasons.map(sn => `<button class="chip" data-act="season" data-sn="${sn}">${L('الموسم', 'Season')} ${sn}</button>`).join('')}</div><div id="eps"></div>
      <div class="acts"><button class="btn" data-act="mclose">${L('إغلاق', 'Close')}</button></div></div>`;
    window._drawSeason = draw; draw(seasons[0]);
  } catch (e) { $('#modal .mbox').innerHTML = `<h3>${esc(item.name)}</h3><p>${esc(msg(e))}</p><div class="acts"><button class="btn" data-act="mclose">${L('إغلاق', 'Close')}</button></div>`; }
}

/* ───────────── player ───────────── */
const P = { open: false, item: null, list: [], idx: 0, hls: null, ctl: null, tPos: 0, wd: null, stages: [], si: 0, loops: 0, mediaRec: 0, playing: false, dbg: [], sid: 0 };
const vid = () => $('#vid');
function playerUI() {
  $('#pl-top').innerHTML = `<button class="ibtn" data-act="pclose">${lang === 'ar' ? '→' : '←'}</button><div class="t" id="pl-t"></div>
    <button class="ibtn" data-act="pchan">☰</button><button class="ibtn" data-act="pfav" id="pl-fav">☆</button><button class="ibtn" data-act="paspect">⤢</button>`;
  $('#pl-bot').innerHTML = `<div class="seek" id="pl-seek"><span id="pl-cur">0:00</span><input type="range" id="pl-rng" min="0" max="1000" value="0"><span id="pl-dur">0:00</span></div>
    <button class="ibtn" data-act="pprev">⏮</button><button class="ibtn" data-act="prew">⏪</button><button class="ibtn" data-act="pplay" id="pl-play">⏸</button>
    <button class="ibtn" data-act="pfwd">⏩</button><button class="ibtn" data-act="pnext">⏭</button><button class="ibtn" data-act="pmute" id="pl-mute">🔊</button>
    <button class="ibtn" data-act="pfs">⛶</button>`;
  const r = $('#pl-rng');
  r.addEventListener('input', () => { const v = vid(); if (isFinite(v.duration)) v.currentTime = v.duration * r.value / 1000; });
}
let NP = null;
const plug = () => { const C = window.Capacitor; if (!C) return null; if (C.Plugins && C.Plugins.TamyPlayer) return C.Plugins.TamyPlayer; if (typeof C.registerPlugin === 'function') { try { return C.registerPlugin('TamyPlayer'); } catch (e) {} } return null; };
const nativeAvail = () => isNative() && !!plug();
const capInfo = () => { const C = window.Capacitor; if (!C) return 'no Capacitor'; let pl = '?'; try { pl = C.getPlatform ? C.getPlatform() : '-'; } catch (e) {} return 'platform=' + pl + ' plugins=' + Object.keys(C.Plugins || {}).join(',') + ' reg=' + (typeof C.registerPlugin); };
function openPlayer(item, list) {
  if (nativeAvail() && U.settings.engine !== 'web' && U.settings.engine !== 'hls' && !/^ytc?:/.test(item.url)) return openNative(item, list);
  openWeb(item, list);
}
async function openNative(item, list) {
  stopRadio();
  const arr = (list && list.length ? list : [item]); let idx = Math.max(0, arr.findIndex(x => x.id === item.id));
  const lo = Math.max(0, idx - 400), win = arr.slice(lo, Math.min(arr.length, idx + 600)); idx -= lo;
  const live = item.kind === 'live'; saveRecent(item);
  try {
    NP = NP || plug();
    const pos = (!live && U.pos[item.id]) ? U.pos[item.id] * 1000 : 0;
    const ts = U.settings.fmt === 'ts'; const fu = x => (ts && x.kind === 'live' && /\/live\/[^/]+\/[^/]+\/[^/]+\.m3u8(\?.*)?$/i.test(x.url)) ? x.url.replace(/\.m3u8(\?.*)?$/i, '.ts$1') : x.url;
    const r = await NP.play({ urls: win.map(fu), titles: win.map(x => x.name), groups: win.map(x => x.group || ''), index: idx, live, pos, ua: curUA() });
    const last = r && typeof r.index === 'number' ? win[r.index] : null;
    if (last) { saveRecent(last); if (!live && r.pos > 0) { if (r.dur && r.pos > r.dur - 60000) delete U.pos[last.id]; else U.pos[last.id] = Math.floor(r.pos / 1000); saveU(); } }
  } catch (e) { toast(L('تعذّر المشغّل الأصلي، جارٍ استخدام المشغّل العادي', 'Native player failed, using web player')); openWeb(item, list); }
}
function openWeb(item, list) {
  if (!P.open) history.pushState({ o: 1 }, '');
  stopRadio();
  P.open = true; P.list = (list && list.length ? list : [item]); P.idx = Math.max(0, P.list.findIndex(x => x.id === item.id));
  $('#player').classList.remove('hidden'); playerUI(); bindVideo(); startPlay(P.list[P.idx]);
}
function bindVideo() {
  const v = vid(); if (v._b) return; v._b = true;
  v.addEventListener('playing', () => { clearTimeout(P.wd); P.playing = true; clearTimeout(P.vchk); P.vchk = setTimeout(() => { if (P.open && !v.paused && v.videoWidth === 0) { P.dbg.push('no-video-track'); toast(L('الصوت يعمل لكن الفيديو غير مدعوم في هذا المشغّل (غالباً H.265)', 'Audio plays but video is unsupported here (likely H.265)')); } }, 5000); $('#pl-spin').classList.add('hidden'); $('#pl-err').classList.add('hidden'); setPlayIcon(); });
  v.addEventListener('waiting', () => { $('#pl-spin').classList.remove('hidden'); if (P.playing && P.item && P.item.kind === 'live') armWatch(20000); });
  v.addEventListener('pause', setPlayIcon); v.addEventListener('play', setPlayIcon);
  v.addEventListener('error', () => { P.dbg.push('video error ' + (v.error ? v.error.code : '?')); nextStage(); });
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
  let ty = null, tx = 0; const pl = $('#player');
  pl.addEventListener('touchstart', e => { ty = e.touches[0].clientY; tx = e.touches[0].clientX; }, { passive: true });
  pl.addEventListener('touchend', e => { if (ty == null) return; const t = e.changedTouches[0], dy = t.clientY - ty, dx = t.clientX - tx; ty = null; if (Math.abs(dy) > 90 && Math.abs(dy) > Math.abs(dx) * 1.5 && !e.target.closest('.pl-bar,.pl-err')) stepList(dy < 0 ? 1 : -1); }, { passive: true });
}
const fmt = t => { t = Math.max(0, Math.floor(t || 0)); const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'); };
function setPlayIcon() { const b = $('#pl-play'); if (b) b.textContent = vid().paused ? '▶' : '⏸'; }
function showCtl() { $('#pl-top').classList.remove('off'); $('#pl-bot').classList.remove('off'); clearTimeout(P.ctl); P.ctl = setTimeout(() => { $('#pl-top').classList.add('off'); $('#pl-bot').classList.add('off'); }, 4500); }
function toggleCtl() { $('#pl-top').classList.contains('off') ? showCtl() : (clearTimeout(P.ctl), $('#pl-top').classList.add('off'), $('#pl-bot').classList.add('off')); }
function cleanup() { clearTimeout(P.wd); if (P.hls) { try { P.hls.destroy(); } catch {} P.hls = null; } const v = vid(); try { v.pause(); } catch {} v.removeAttribute('src'); v.load(); $('#yt').src = 'about:blank'; $('#yt').classList.add('hidden'); v.classList.remove('hidden'); }
const b64ToBuf = b => { const t = atob(b), n = t.length, u = new Uint8Array(n); for (let i = 0; i < n; i++) u[i] = t.charCodeAt(i); return u.buffer; };
const newStats = () => ({ aborted: false, loaded: 0, retry: 0, total: 0, chunkCount: 0, bwEstimate: 0, loading: { start: 0, first: 0, end: 0 }, parsing: { start: 0, end: 0 }, buffering: { start: 0, first: 0, end: 0 } });
/* محمّل hls.js يمرّ عبر شبكة أندرويد الأصلية: يتجاوز CORS ويرسل User-Agent مقبول عند سيرفرات IPTV */
class NativeLoader {
  constructor() { this.stats = newStats(); this.dead = false; }
  destroy() { this.dead = true; }
  abort() { this.dead = true; this.stats.aborted = true; }
  getCacheAge() { return null; }
  getResponseHeader() { return null; }
  load(context, config, cb) {
    this.context = context; const st = this.stats = newStats(); st.loading.start = performance.now();
    const bin = context.responseType === 'arraybuffer';
    const headers = Object.assign({ 'User-Agent': curUA(), 'Accept': '*/*' }, context.headers || {});
    if (context.rangeStart != null && context.rangeEnd != null) headers.Range = `bytes=${context.rangeStart}-${context.rangeEnd - 1}`;
    Capacitor.Plugins.CapacitorHttp.get({ url: context.url, headers, responseType: bin ? 'arraybuffer' : 'text', connectTimeout: 15000, readTimeout: 30000 }).then(r => {
      if (this.dead) return; st.loading.first = st.loading.end = performance.now();
      if (r.status < 200 || r.status >= 300) return cb.onError({ code: r.status, text: 'HTTP ' + r.status }, context, r, st);
      const data = bin ? b64ToBuf(r.data) : (typeof r.data === 'string' ? r.data : JSON.stringify(r.data));
      st.loaded = st.total = bin ? data.byteLength : data.length;
      cb.onSuccess({ url: r.url || context.url, data, code: r.status }, st, context, r);
    }).catch(e => { if (this.dead) return; cb.onError({ code: 0, text: msg(e) }, context, null, st); });
  }
}
function armWatch(ms, sid) { clearTimeout(P.wd); P.wd = setTimeout(() => { P.dbg.push('timeout ' + P.stages[P.si]); nextStage(sid); }, ms); }
function startPlay(item) {
  P.item = item; cleanup(); P.dbg = []; P.loops = 0; P.mediaRec = 0; P.playing = false;
  const v = vid(), url = item.url;
  $('#pl-t').textContent = (P.list.length > 1 ? (P.idx + 1) + '/' + P.list.length + '  ' : '') + item.name; $('#pl-fav').textContent = isFav(item.id) ? '★' : '☆';
  $('#pl-seek').style.display = item.kind === 'live' ? 'none' : 'flex';
  $('#pl-spin').classList.remove('hidden'); $('#pl-err').classList.add('hidden');
  saveRecent(item); showCtl();
  if (/^ytc?:/.test(url)) { v.classList.add('hidden'); const f = $('#yt'); f.classList.remove('hidden'); f.src = url.startsWith('ytc:') ? 'https://www.youtube.com/embed/live_stream?channel=' + url.slice(4) + '&autoplay=1' : 'https://www.youtube.com/embed/' + url.slice(3) + '?autoplay=1'; $('#pl-spin').classList.add('hidden'); return; }
  const eng = U.settings.engine, isHls = /\.m3u8(\?|$)/i.test(url) || (item.kind === 'live' && !/\.(mp4|mkv|ts|avi|flv)(\?|$)/i.test(url));
  const st = [];
  if (isHls && eng !== 'native' && window.Hls && Hls.isSupported()) st.push('hls');
  if (eng !== 'hls' || !st.length) st.push('native');
  if (item.kind === 'live' && /\.m3u8(\?|$)/i.test(url) && eng !== 'hls') st.push('ts');
  P.stages = st; P.si = 0; runStage();
}
function runStage() {
  const v = vid(), url = P.item.url, s = P.stages[P.si], sid = ++P.sid;
  if (P.hls) { try { P.hls.destroy(); } catch {} P.hls = null; }
  try { v.pause(); } catch {} v.removeAttribute('src'); v.load(); P.playing = false;
  $('#pl-spin').classList.remove('hidden'); $('#pl-err').classList.add('hidden');
  armWatch(s === 'hls' ? 20000 : 15000, sid);
  if (s === 'hls') {
    const cfg = { enableWorker: true, maxBufferLength: 30, manifestLoadingMaxRetry: 2, levelLoadingMaxRetry: 2, fragLoadingMaxRetry: 3, liveSyncDurationCount: 3 };
    if (isNative() && Capacitor.Plugins && Capacitor.Plugins.CapacitorHttp) cfg.loader = NativeLoader;
    const h = P.hls = new Hls(cfg);
    h.on(Hls.Events.ERROR, (_, d) => {
      P.dbg.push('hls ' + d.details + (d.response && d.response.code ? ' ' + d.response.code : ''));
      if (!d.fatal) return;
      if (d.type === Hls.ErrorTypes.MEDIA_ERROR && P.mediaRec < 2) { P.mediaRec++; h.recoverMediaError(); return; }
      nextStage(sid);
    });
    h.loadSource(url); h.attachMedia(v);
  } else if (s === 'ts') v.src = url.replace(/\.m3u8(\?.*)?$/i, '.ts$1');
  else v.src = url;
  v.play().catch(() => {});
}
function nextStage(sid) {
  if (!P.open || (sid != null && sid !== P.sid)) return;
  if (P.si < P.stages.length - 1) { P.si++; return runStage(); }
  if (P.loops < 1 && P.item.kind === 'live') { P.loops++; P.si = 0; P.dbg.push('retry'); return runStage(); }
  clearTimeout(P.wd); showErr();
}
function showErr() {
  $('#pl-spin').classList.add('hidden');
  const e = $('#pl-err'); e.classList.remove('hidden');
  e.innerHTML = `<h3>${L('تعذّر تشغيل هذا البث', 'Could not play this stream')}</h3><p>${L('قد يكون البث متوقفاً أو محجوباً، أو اشتراكك وصل للحد الأقصى من الأجهزة. جرّب قناة أخرى أو أعد المحاولة.', 'The stream may be offline or blocked, or your subscription hit its device limit. Try another or retry.')}</p><p dir="ltr" style="font-size:11px;word-break:break-all">${esc(P.dbg.slice(-6).join(' | '))}</p>
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
setInterval(() => { if (uid) { tick(); tickHdr(); } }, 1000);
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
function srcRowsUnused() {
  return U.sources.length ? U.sources.map(s => `<div class="row"><div style="min-width:0"><b>${esc(s.name)}</b><small>${s.type === 'xtream' ? 'Xtream · ' + esc(s.url) : s.type === 'file' ? L('ملف محلي', 'Local file') : 'M3U'}</small></div><button class="btn sm dng" data-act="delsrc" data-id="${s.id}">${L('حذف', 'Delete')}</button></div>`).join('')
    : `<div class="row"><small>${L('لا توجد اشتراكات. أضف اشتراكك لمشاهدة الأفلام والمسلسلات وقنواتك.', 'No subscriptions yet. Add yours to watch movies, series and your channels.')}</small></div>`;
}
function vSettings(v) {
  const s = U.settings, me = users.find(u => u.id === uid);
  v.innerHTML = `
  <div class="set"><h3>👤 ${L('الحساب', 'Account')}</h3><div class="row"><div><b>${esc(me ? me.name : L('ضيف', 'Guest'))}</b><small>${L('البيانات محفوظة على هذا الجهاز', 'Data is stored on this device')}</small></div><div class="acts" style="margin:0"><button class="btn sm" data-act="acct">${me && me.guest ? L('حوّل لحساب', 'Make account') : L('إدارة', 'Manage')}</button><button class="btn sm" data-act="logout">${L('تبديل الحساب', 'Switch account')}</button></div></div></div>
  <div class="set"><h3>📡 ${L('اشتراكاتي', 'My subscriptions')}</h3><div class="row"><div><b>${esc(activeSrc().name)}</b><small>${L('الاشتراك النشط · ', 'Active · ')}${U.sources.length} ${L('اشتراك مضاف', 'added')}</small></div><button class="btn sm pri" data-act="go" data-to="subs">${L('إدارة الاشتراكات', 'Manage')}</button></div></div>
  <div class="set"><h3>🎨 ${L('الثيمات', 'Themes')}</h3><div class="themes">${THEMES.map(t => `<button class="th ${s.theme === t[0] ? 'on' : ''}" data-act="theme" data-t="${t[0]}">${t[lang === 'ar' ? 1 : 2]}</button>`).join('')}</div></div>
  <div class="set"><h3>⚙ ${L('عام', 'General')}</h3>
    <div class="row"><div><b>${L('اللغة', 'Language')}</b></div><button class="btn sm" data-act="lang">${lang === 'ar' ? 'English' : 'العربية'}</button></div>
    <div class="row"><div><b>${L('هوية المشغّل (User-Agent)', 'Player identity (User-Agent)')}</b><small>${L('لو السيرفر بيرفض (HTTP 406) جرّب هوية تانية', 'If the server rejects (HTTP 406) try another')}</small></div>
      <select class="in" data-act="ua">${[['vlc', 'VLC'], ['smarters', 'IPTV Smarters'], ['tivimate', 'TiviMate'], ['android', 'Android'], ['chrome', 'Chrome'], ['ffmpeg', 'FFmpeg']].map(a => `<option value="${a[0]}" ${s.ua === a[0] ? 'selected' : ''}>${a[1]}</option>`).join('')}</select></div>
    <div class="row"><div><b>${L('صيغة البث المباشر', 'Live stream format')}</b><small>${L('لو بيقطع كل ثواني (HTTP 509/429) جرّب «TS مباشر» — اتصال واحد مستمر', 'If it cuts every few seconds (HTTP 509/429) try direct TS — one continuous connection')}</small></div>
      <select class="in" data-act="fmt"><option value="m3u8" ${s.fmt !== 'ts' ? 'selected' : ''}>HLS (m3u8)</option><option value="ts" ${s.fmt === 'ts' ? 'selected' : ''}>${L('TS مباشر', 'Direct TS')}</option></select></div>
    <div class="row"><div><b>${L('المشغّل الأصلي (ExoPlayer)', 'Native player (ExoPlayer)')}</b><small>${nativeAvail() ? '✅ ' + L('متاح — مطلوب لقنوات HEVC/H.265', 'Available — needed for HEVC/H.265') : '❌ ' + L('غير متاح — قنوات HEVC لن تعمل', 'Unavailable — HEVC will not play')}</small><small style="direction:ltr;display:block;opacity:.7">${esc(capInfo())}</small></div></div>
    <div class="row"><div><b>${L('محرك التشغيل', 'Player engine')}</b><small>${L('الأصلي يدعم H.265 ومعظم السيرفرات', 'Native supports H.265 and most servers')}</small></div>
      <select class="in" data-act="engine"><option value="auto" ${s.engine === 'auto' ? 'selected' : ''}>${L('تلقائي (الأصلي ExoPlayer إن وُجد)', 'Auto (native ExoPlayer if available)')}</option><option value="web" ${s.engine === 'web' ? 'selected' : ''}>${L('مشغّل الويب فقط', 'Web player only')}</option><option value="hls" ${s.engine === 'hls' ? 'selected' : ''}>hls.js</option><option value="native" ${s.engine === 'native' ? 'selected' : ''}>${L('أصلي', 'Native')}</option></select></div>
    <div class="row"><div><b>${L('تنبيه الأذان', 'Adhan alert')}</b><small>${L('أثناء فتح التطبيق', 'While the app is open')}</small></div><button class="sw ${s.adhan ? 'on' : ''}" data-act="adhan" aria-label="adhan"></button></div>
    <div class="row"><div style="flex:1"><b>${L('رابط صوت الأذان (اختياري)', 'Custom adhan audio URL (optional)')}</b><input class="in" style="width:100%;margin-top:6px" id="adhanUrl" placeholder="https://…mp3" value="${esc(s.adhanUrl)}"></div></div></div>
  <div class="set"><h3>📡 ${L('القنوات', 'Channels')}</h3>
    <div class="row"><div><b>${L('إظهار القنوات المجانية', 'Show free channels')}</b><small>${L('مخفية افتراضياً — التطبيق يفتح على اشتراكك مباشرة', 'Hidden by default — the app opens on your subscription')}</small></div><button class="sw ${s.showFree ? 'on' : ''}" data-act="freetog" aria-label="free"></button></div></div>
  <div class="set"><h3>🔄 ${L('التحديث', 'Updates')}</h3>
    <div class="row"><div><b>${L('الإصدار', 'Version')}</b><small>${esc(APPV)}</small></div><button class="btn sm" data-act="chkupd">${L('تحقق الآن', 'Check now')}</button></div>
    <div class="row"><div><b>${L('تحديث تلقائي', 'Auto update')}</b><small>${L('يحمّل آخر نسخة من الواجهة عند فتح التطبيق', 'Loads the latest UI when the app opens')}</small></div><button class="sw ${s.autoUpdate !== false ? 'on' : ''}" data-act="autoupd" aria-label="auto"></button></div>
    ${APK_NEW ? `<div class="row"><div><b>🔴 ${L('نسخة APK جديدة متاحة', 'New APK available')}</b><small>${L('تحديث للمكوّنات الأصلية (المشغّل/الأيقونة)', 'Native components update')}</small></div><button class="btn sm" data-act="apkdl">${L('تنزيل', 'Download')}</button></div>` : ''}</div>
  ${srvSection()}
  <div class="set"><h3>💾 ${L('نسخة احتياطية', 'Backup')}</h3><div class="acts" style="justify-content:flex-start"><button class="btn" data-act="export">${L('تصدير', 'Export')}</button><button class="btn" data-act="import">${L('استيراد', 'Import')}</button><button class="btn dng" data-act="wipe">${L('مسح بيانات الحساب', 'Clear account data')}</button></div>
    <input type="file" id="impf" accept=".json" class="hidden"></div>
  <div class="set"><h3>ℹ️ TAMY IPTV 1.0</h3><small style="color:var(--mut);line-height:1.8">${L('TAMY IPTV مشغّل فقط: يعرض المحتوى الذي تضيفه أنت من اشتراكك أو قوائمك، بالإضافة إلى قنوات مجانية عامة من قوائم iptv-org. لا يوفّر التطبيق قنوات مدفوعة ولا يتحمّل مسؤولية المحتوى.', 'TAMY IPTV is a player only: it shows content you add from your own subscription or playlists, plus free public channels from iptv-org lists. It does not supply paid channels.')}</small></div>`;
  srvBind();
  const au = $('#adhanUrl'); au && au.addEventListener('change', () => { U.settings.adhanUrl = au.value.trim(); saveU(); toast(L('تم الحفظ', 'Saved')); });
}
let sType = 'xtream', editId = null;
function srcModal(id) {
  editId = id || null; const e = id ? U.sources.find(x => x.id === id) : null; sType = e ? e.type : 'xtream';
  const h = t => (sType === t ? '' : 'hidden'), val = x => esc(e && e[x] || '');
  modal(`<h3>${e ? L('تعديل الاشتراك', 'Edit subscription') : L('إضافة اشتراك', 'Add subscription')}</h3>
    ${e ? '' : `<div class="chips"><button class="chip on" data-act="stype" data-v="xtream">Xtream Codes</button><button class="chip" data-act="stype" data-v="m3u">M3U ${L('رابط', 'URL')}</button><button class="chip" data-act="stype" data-v="file">${L('ملف M3U', 'M3U file')}</button></div>`}
    <label class="fld"><span>${L('اسم الاشتراك', 'Name')}</span><input class="in" id="s-name" placeholder="${L('مثال: إكستريم', 'e.g. Extreme')}" value="${val('name')}"></label>
    <div id="s-x" class="${h('xtream')}"><label class="fld"><span>${L('عنوان السيرفر', 'Server URL')}</span><input class="in" id="s-url" dir="ltr" placeholder="http://example.com:8080" value="${sType === 'xtream' ? val('url') : ''}"></label>
      <label class="fld"><span>${L('اسم المستخدم', 'Username')}</span><input class="in" id="s-user" dir="ltr" autocapitalize="off" value="${val('user')}"></label>
      <label class="fld"><span>${L('كلمة المرور', 'Password')}</span><input class="in" id="s-pass" dir="ltr" autocapitalize="off" value="${val('pass')}"></label></div>
    <div id="s-m" class="${h('m3u')}"><label class="fld"><span>${L('رابط قائمة M3U', 'M3U playlist URL')}</span><input class="in" id="s-m3u" dir="ltr" placeholder="http://…/playlist.m3u" value="${sType === 'm3u' ? val('url') : ''}"></label></div>
    <div id="s-f" class="${h('file')}"><label class="fld"><span>${L('اختر ملف .m3u', 'Choose .m3u file')}${e ? ' (' + L('اتركه فارغاً للإبقاء على الحالي', 'leave empty to keep current') + ')' : ''}</span><input class="in" id="s-file" type="file" accept=".m3u,.m3u8,.txt"></label></div>
    <div id="s-msg" style="color:var(--mut);min-height:20px"></div>
    <div class="acts"><button class="btn" data-act="mclose">${L('إلغاء', 'Cancel')}</button><button class="btn pri" data-act="srcsave">${L('اختبار وحفظ', 'Test & save')}</button></div>`);
}
async function saveSource() {
  const msgEl = $('#s-msg'), say = (t, bad) => { msgEl.textContent = t; msgEl.style.color = bad ? 'var(--bad)' : 'var(--mut)'; };
  const old = editId ? U.sources.find(x => x.id === editId) : null;
  const s = { id: old ? old.id : uidGen(), type: sType, name: ($('#s-name').value || '').trim() || L('اشتراكي', 'My IPTV') };
  if (old && old.info) s.info = old.info;
  try {
    say(L('جارٍ الاختبار…', 'Testing…'));
    let conv = null;
    if (sType === 'm3u') {   // رابط get.php?username&password = اشتراك Xtream: أسرع بكثير عبر الـAPI بدل تحميل القائمة كلها
      const raw = $('#s-m3u').value.trim(), mm = raw.match(/^(https?:\/\/[^/?#]+)(?:\/[^?#]*)?\/get\.php\?(.*)$/i);
      if (mm) { const q = new URLSearchParams(mm[2].replace(/#.*$/, '')); if (q.get('username') && q.get('password')) conv = { url: mm[1], user: q.get('username'), pass: q.get('password') }; }
    }
    if (sType === 'xtream' || conv) {
      if (conv) { s.type = 'xtream'; s.url = conv.url; s.user = conv.user; s.pass = conv.pass; say(L('تم التعرّف عليه كاشتراك Xtream — جارٍ الاختبار…', 'Detected as Xtream — testing…')); }
      else { s.url = $('#s-url').value.trim(); s.user = $('#s-user').value.trim(); s.pass = $('#s-pass').value.trim(); }
      if (!/^https?:\/\//i.test(s.url) || !s.user || !s.pass) return say(L('أكمل بيانات السيرفر', 'Fill in all server fields'), true);
      const j = await apiJson(`${xBase(s.url)}/player_api.php?username=${enc(s.user)}&password=${enc(s.pass)}`);
      const ui = j.user_info;
      if (!ui || String(ui.auth) !== '1') return say(L('بيانات الدخول غير صحيحة أو الاشتراك منتهي', 'Invalid login or expired subscription'), true);
      if (ui.status && ui.status !== 'Active') return say(L('حالة الاشتراك: ', 'Subscription status: ') + ui.status, true);
      s.info = { status: ui.status, exp: +ui.exp_date || 0, max: +ui.max_connections || 0, act: +ui.active_cons || 0 };
    } else if (sType === 'm3u') {
      s.url = $('#s-m3u').value.trim(); if (!/^https?:\/\//i.test(s.url)) return say(L('أدخل رابطاً صحيحاً', 'Enter a valid URL'), true);
      say(L('جارٍ تحميل القائمة… قد يستغرق حتى دقيقة للقوائم الكبيرة', 'Loading list… may take up to a minute for big lists')); cache.delete(s.url); const n = (await loadM3U(s.url)).length; say(n + ' ' + L('عنصر', 'items'));
    } else {
      const f = $('#s-file').files[0];
      if (!f && !old) return say(L('اختر ملفاً', 'Choose a file'), true);
      if (f) { const txt = await f.text(); if (!parseM3U(txt).length) return say(L('الملف غير صالح', 'Invalid file'), true); if (!LS.set('tamy:file:' + s.id, txt)) return say(L('الملف كبير جداً للتخزين المحلي؛ استخدم رابطاً بدلاً منه', 'File too large for local storage; use a URL instead'), true); }
    }
  } catch (e) { return say(L('فشل الاتصال: ', 'Connection failed: ') + msg(e), true); }
  if (old) U.sources[U.sources.indexOf(old)] = s; else { U.sources.push(s); U.settings.active = s.id; }
  [...xc.keys()].filter(k => k.startsWith(s.id + '|')).forEach(k => xc.delete(k)); [LV, MV, SV].forEach(S => { if (S.srcId === s.id) S.srcId = null; });
  saveU(); closeModal(); toast(old ? L('تم حفظ التعديل ✓', 'Saved ✓') : L('تمت إضافة الاشتراك ✓', 'Subscription added ✓')); render();
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
    if (i.vid) return openMovie(i);
    openPlayer(i, curList.filter(x => x.kind === i.kind && !x.sid));
  },
  fav: (el, e) => {
    e.stopPropagation(); const i = curList[+el.dataset.i]; if (!i) return; const on = toggleFav(i);
    el.textContent = on ? '★' : '☆'; el.classList.toggle('on', on); if (screen === 'favs' && !on) { render(); } else if (stateOf() && (stateOf().cat === 'favs')) { paintMain(stateOf()); } toast(on ? L('أضيفت للمفضلة', 'Added to favorites') : L('حُذفت من المفضلة', 'Removed'));
  },
  recents: () => recentsModal(),
  fgrp: el => { const S = stateOf(); if (S) { S.fg = el.dataset.g; S.shown = 80; paintMain(S); } },
  cat: el => { const S = stateOf(); if (S) selectCat(S, el.dataset.c); },
  cats: () => { const S = stateOf(); if (S && S.pane === 'items' && !wide()) history.back(); },
  more: () => { const S = stateOf(); if (S) { S.shown += 80; paintMain(S); } },
  reload: () => { const S = stateOf(); if (!S) return; if (isFreeCat(S.cat)) return loadFree(S, S.cat); [...xc.keys()].filter(k => k.startsWith(S.srcId + '|' + S.kind)).forEach(k => xc.delete(k)); S.err = ''; S.loaded = false; S.loading = false; render(); },
  usesrc: el => { U.settings.active = el.dataset.id; saveU(); if (el.dataset.go) nav('home'); else render(); },
  editsrc: el => srcModal(el.dataset.id),
  refsrc: el => { const id = el.dataset.id, so = U.sources.find(x => x.id === id); [...xc.keys()].filter(k => k.startsWith(id + '|')).forEach(k => xc.delete(k)); if (so && so.url) cache.delete(so.url); [LV, MV, SV].forEach(S => { if (S.srcId === id) S.srcId = null; }); toast(L('سيُعاد تحميل المحتوى عند فتحه', 'Content will reload when opened')); },
  chksrc: async el => { const so = U.sources.find(x => x.id === el.dataset.id); if (!so) return; toast(L('جارٍ الفحص…', 'Checking…')); try { const j = await apiJson(`${xBase(so.url)}/player_api.php?username=${enc(so.user)}&password=${enc(so.pass)}`), ui = j.user_info || {}; so.info = { status: ui.status || (String(ui.auth) === '1' ? 'Active' : 'Invalid'), exp: +ui.exp_date || 0, max: +ui.max_connections || 0, act: +ui.active_cons || 0 }; saveU(); render(); } catch (e) { toast(L('فشل الفحص: ', 'Check failed: ') + msg(e)); } },
  dplay: () => { const i = window._det; if (!i) return; closeModalSilent(); openPlayer(i, (window._detList && window._detList.length ? window._detList : [i])); },
  dfav: el => { const on = toggleFav(window._det); el.innerHTML = (on ? '★ ' : '☆ ') + L('مفضلة', 'Favorite'); },
  pchan: () => {
    modal(`<h3>${L('القائمة', 'List')} (${P.list.length})</h3><input class="in" id="pq" style="width:100%" type="search" placeholder="${L('بحث…', 'Search…')}"><div id="pls"></div><div class="acts"><button class="btn" data-act="mclose">${L('إغلاق', 'Close')}</button></div>`);
    const draw = () => { const q = $('#pq').value.trim().toLowerCase(); $('#pls').innerHTML = P.list.map((it, n) => [it, n]).filter(([it]) => !q || (it.name || '').toLowerCase().includes(q)).slice(0, 300).map(([it, n]) => `<div class="ep ${n === P.idx ? 'cur' : ''}" tabindex="0" data-act="pgo" data-n="${n}"><span>${n + 1}. ${esc(it.name)}</span></div>`).join(''); };
    draw(); $('#pq').addEventListener('input', draw); setTimeout(() => { const c = $('#pls .cur'); if (c) c.scrollIntoView({ block: 'center' }); }, 80);
  },
  pgo: el => { closeModal(); P.idx = +el.dataset.n; startPlay(P.list[P.idx]); },
  favtab: el => { favTab = el.dataset.t; render(); },
  resume: el => { const it = U.recent[el.dataset.k]; if (it) it.sid ? openSeries(it) : openPlayer(it, [it]); },
  addsrc: () => srcModal(null),
  stype: el => { sType = el.dataset.v; $$('#modal .chip').forEach(c => c.classList.toggle('on', c === el)); $('#s-x').classList.toggle('hidden', sType !== 'xtream'); $('#s-m').classList.toggle('hidden', sType !== 'm3u'); $('#s-f').classList.toggle('hidden', sType !== 'file'); },
  srcsave: () => saveSource(),
  delsrc: el => { if (!confirm(L('حذف هذا الاشتراك؟', 'Delete this subscription?'))) return; const id = el.dataset.id; U.sources = U.sources.filter(x => x.id !== id); LS.del('tamy:file:' + id); [...xc.keys()].filter(k => k.startsWith(id + '|')).forEach(k => xc.delete(k)); if (U.settings.active === id) U.settings.active = 'free'; [LV, MV, SV].forEach(S => { if (S.srcId === id) S.srcId = null; }); saveU(); render(); },
  theme: el => { U.settings.theme = el.dataset.t; saveU(); applyTheme(); render(); },
  freetog: () => { U.settings.showFree = !U.settings.showFree; if (!U.settings.showFree && U.settings.active === 'free' && U.sources.length) U.settings.active = U.sources[0].id; saveU(); LV.srcId = MV.srcId = SV.srcId = null; render(); },
  autoupd: () => { U.settings.autoUpdate = U.settings.autoUpdate === false; saveU(); render(); },
  chkupd: () => checkUpdate(true),
  apkdl: () => openUrl(APK_URL || 'https://github.com/' + REPO + '/releases/latest'),
  adhan: () => { U.settings.adhan = !U.settings.adhan; saveU(); render(); if (U.settings.adhan) chime(); },
  season: el => window._drawSeason(el.dataset.sn),
  ep: el => { const cur = window._eps[+el.dataset.n], all = window._allEps || window._eps, k = all.findIndex(x => x.id === cur.id); closeModalSilent(); openPlayer(all[k >= 0 ? k : 0], all); },
  sres: el => { const i = window._sr[+el.dataset.n]; closeModalSilent(); if (i.kind === 'radio') return playRadio(i); if (i.sid) return openSeries(i); if (i.vid) { curList = [i]; return openMovie(i); } openPlayer(i, [i]); },
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
  fmt: el => { U.settings.fmt = el.value; saveU(); toast('✓ ' + (el.value === 'ts' ? 'TS' : 'HLS')); },
  ua: el => { U.settings.ua = el.value; saveU(); toast('✓ ' + el.value); },
  engine: el => { U.settings.engine = el.value; saveU(); },
  /* auth */
  authmode: el => { authMode = (el && el.dataset && el.dataset.m) || (authMode === 'in' ? 'up' : 'in'); renderAuth(); },
  pickacc: el => { selAcc = el.dataset.id; renderAuth(); const p = $('#a-pass'); if (p) p.focus(); },
  eye: el => { const i = el.previousElementSibling; if (!i) return; const show = i.type === 'password'; i.type = show ? 'text' : 'password'; el.style.opacity = show ? 1 : .6; },
  guest: async () => { let g = users.find(u => u.guest); if (!g) { g = { id: uidGen(), name: L('ضيف', 'Guest'), guest: true }; users.push(g); LS.set('tamy:users', users); } enter(g.id); },
  signup: async () => {
    const name = ($('#a-name') ? $('#a-name').value : '').trim(), pass = $('#a-pass').value, p2 = $('#a-pass2') ? $('#a-pass2').value : pass;
    if (name.length < 2) return authErr(L('اكتب اسم المستخدم (حرفان على الأقل)', 'Enter a username (2+ chars)'), 'a-name');
    if (pass.length < 4) return authErr(L('كلمة المرور 4 أحرف على الأقل', 'Password must be 4+ characters'), 'a-pass');
    if (pass !== p2) return authErr(L('كلمتا المرور غير متطابقتين', 'Passwords do not match'), 'a-pass2');
    if (users.some(u => !u.guest && u.name.toLowerCase() === name.toLowerCase())) return authErr(L('هذا الاسم مستخدم بالفعل', 'This name is already taken'), 'a-name');
    const u = { id: uidGen(), name, hash: await sha(name.toLowerCase() + ':' + pass) }; users.push(u); LS.set('tamy:users', users); enter(u.id);
  },
  login: async () => {
    const u = users.find(x => x.id === selAcc), pass = $('#a-pass').value;
    if (!u) return authErr(L('اختر حساباً', 'Choose an account'));
    if (!pass) return authErr(L('اكتب كلمة المرور', 'Enter your password'), 'a-pass');
    if ((await sha(u.name.toLowerCase() + ':' + pass)) !== u.hash) { $('#a-pass').value = ''; return authErr(L('كلمة المرور غير صحيحة', 'Wrong password'), 'a-pass'); }
    enter(u.id);
  },
  forgot: () => {
    const u = users.find(x => x.id === selAcc); if (!u) return;
    modal(`<h3>${L('إعادة تعيين كلمة المرور', 'Reset password')}</h3><p style="color:var(--mut);margin:0 0 10px">${L('الحساب', 'Account')}: <b>${esc(u.name)}</b><br>${L('الحسابات محلية على هذا الجهاز فقط، لذلك تقدر تختار كلمة جديدة. بيانات الحساب (الاشتراكات والمفضلة) هتفضل زي ما هي.', 'Accounts are local to this device, so you can set a new password. Your data stays intact.')}</p>
      <label class="fld"><span>${L('كلمة المرور الجديدة', 'New password')}</span><input class="in" id="f-p1" type="password" autocomplete="new-password"></label>
      <label class="fld"><span>${L('تأكيد', 'Confirm')}</span><input class="in" id="f-p2" type="password" autocomplete="new-password"></label>
      <div class="err" id="f-err"></div>
      <div class="acts"><button class="btn" data-act="mclose">${L('إلغاء', 'Cancel')}</button><button class="btn pri" data-act="forgotsave">${L('حفظ', 'Save')}</button></div>`);
  },
  forgotsave: async () => {
    const u = users.find(x => x.id === selAcc), p1 = $('#f-p1').value, p2 = $('#f-p2').value, e = $('#f-err');
    if (p1.length < 4) { e.textContent = L('4 أحرف على الأقل', '4+ characters'); return; } if (p1 !== p2) { e.textContent = L('غير متطابقتين', 'Do not match'); return; }
    u.hash = await sha(u.name.toLowerCase() + ':' + p1); LS.set('tamy:users', users); closeModal(); toast(L('تم تغيير كلمة المرور ✓', 'Password changed ✓'));
  },
  /* account management (settings) */
  acct: () => {
    const me = users.find(u => u.id === uid); if (!me) return;
    modal(`<h3>${L('إدارة الحساب', 'Manage account')}</h3>
      <label class="fld"><span>${L('الاسم', 'Name')}</span><input class="in" id="m-name" value="${esc(me.guest ? '' : me.name)}" placeholder="${me.guest ? L('اختر اسماً لتحويل الضيف لحساب', 'Pick a name to turn this guest into an account') : ''}" maxlength="24"></label>
      ${me.guest ? '' : `<label class="fld"><span>${L('كلمة المرور الحالية', 'Current password')}</span><input class="in" id="m-old" type="password" autocomplete="current-password"></label>`}
      <label class="fld"><span>${me.guest ? L('كلمة المرور', 'Password') : L('كلمة مرور جديدة (اختياري)', 'New password (optional)')}</span><input class="in" id="m-new" type="password" autocomplete="new-password"></label>
      <div class="err" id="m-err"></div>
      <div class="acts"><button class="btn dng" data-act="acctdel">${L('حذف الحساب', 'Delete account')}</button><button class="btn" data-act="mclose">${L('إلغاء', 'Cancel')}</button><button class="btn pri" data-act="acctsave">${L('حفظ', 'Save')}</button></div>`);
  },
  acctsave: async () => {
    const me = users.find(u => u.id === uid), e = $('#m-err'), name = $('#m-name').value.trim(), np = $('#m-new').value;
    if (name.length < 2) { e.textContent = L('اكتب اسماً (حرفان على الأقل)', 'Enter a name (2+ chars)'); return; }
    if (users.some(u => u.id !== me.id && !u.guest && u.name.toLowerCase() === name.toLowerCase())) { e.textContent = L('الاسم مستخدم', 'Name already used'); return; }
    if (me.guest) { if (np.length < 4) { e.textContent = L('كلمة المرور 4 أحرف على الأقل', 'Password 4+ chars'); return; } delete me.guest; me.name = name; me.hash = await sha(name.toLowerCase() + ':' + np); }
    else {
      const old = $('#m-old').value; if ((await sha(me.name.toLowerCase() + ':' + old)) !== me.hash) { e.textContent = L('كلمة المرور الحالية غير صحيحة', 'Current password is wrong'); return; }
      if (np && np.length < 4) { e.textContent = L('كلمة المرور الجديدة 4 أحرف على الأقل', 'New password 4+ chars'); return; }
      me.hash = await sha(name.toLowerCase() + ':' + (np || old)); me.name = name;
    }
    LS.set('tamy:users', users); closeModal(); toast(L('تم الحفظ ✓', 'Saved ✓')); render();
  },
  acctdel: () => { if (!confirm(L('حذف هذا الحساب وكل بياناته نهائياً؟', 'Delete this account and all its data permanently?'))) return; users = users.filter(u => u.id !== uid); LS.set('tamy:users', users); LS.del('tamy:u:' + uid); LS.del('tamy:uid'); uid = null; U = null; closeModalSilent(); stopRadio(); renderAuth(); },
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
    if (/^[0-9]$/.test(k) && P.list.length > 1 && $('#modal').classList.contains('hidden')) {
      P.num = (P.num || '') + k; toast('# ' + P.num); clearTimeout(P.numT);
      P.numT = setTimeout(() => { const n = parseInt(P.num, 10); P.num = ''; if (n >= 1 && n <= P.list.length) { P.idx = n - 1; startPlay(P.list[P.idx]); } }, 1400);
      e.preventDefault(); return;
    }
    if (!$('#modal').classList.contains('hidden')) return;
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

/* ───────────── updates (live site + APK) ───────────── */
const APPV = window.TAMY_VERSION || 'dev';
const REPO = (() => { const m = location.hostname.match(/^([^.]+)\.github\.io$/), r = location.pathname.split('/')[1]; return m && r ? m[1] + '/' + r : 'zarzouramahmoudabdo-commits/tamy-iptv'; })();
let APK_NEW = false, APK_URL = '';
const openUrl = u => { const P = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.TamyPlayer; if (P && P.openExternal) P.openExternal({ url: u }).catch(() => { location.href = u; }); else window.open(u, '_blank') || (location.href = u); };
const playerOpen = () => !$('#player').classList.contains('hidden');
async function applyUpdate(v) {
  try { if (sessionStorage.getItem('tamy:upd') === v) return; sessionStorage.setItem('tamy:upd', v); } catch (e) {}
  try { if (window.caches) for (const k of await caches.keys()) await caches.delete(k); } catch (e) {}
  try { if (navigator.serviceWorker) for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); } catch (e) {}
  location.reload();
}
async function checkUpdate(manual) {
  if (!/^https?:/.test(location.protocol) || APPV === 'dev') { if (manual) toast(L('نسخة تجريبية محلية', 'Local dev build')); return; }
  if (!manual && U && U.settings.autoUpdate === false) return;
  if (playerOpen()) return;
  try {
    const j = await (await fetch('version.json?t=' + Date.now(), { cache: 'no-store' })).json();
    if (j.v && j.v !== APPV) { if (manual) toast(L('جاري تنزيل التحديث الجديد…', 'Downloading update…')); setTimeout(() => applyUpdate(j.v), manual ? 700 : 0); }
    else if (manual) toast(L('✓ أنت على أحدث إصدار', '✓ You are up to date') + ' (' + APPV + ')');
  } catch (e) { if (manual) toast(L('تعذّر التحقق — تأكد من الإنترنت', 'Check failed — are you online?')); }
}
async function checkApk() {
  if (!isNative()) return;
  try {
    const q = new URLSearchParams(location.search), nh = q.get('nh');
    if (nh) LS.set('tamy:inst', { nh, n: q.get('apk') });
    const inst = LS.get('tamy:inst', null);
    const r = await (await fetch('https://api.github.com/repos/' + REPO + '/releases/latest', { cache: 'no-store' })).json();
    const m = /build (\d+) native ([0-9a-f]+)/.exec(r.body || '');
    const a = (r.assets || []).find(x => /\.apk$/i.test(x.name));
    APK_URL = a ? a.browser_download_url : '';
    const nw = !!(m && inst && inst.nh && m[2] !== inst.nh);
    if (nw !== APK_NEW) { APK_NEW = nw; if (uid) renderTop(); }
  } catch (e) {}
}
function startUpdates() {
  setTimeout(() => { checkUpdate(false); checkApk(); }, 2500);
  setInterval(() => { checkUpdate(false); checkApk(); }, 20 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkUpdate(false); });
}

document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || !e.target.closest || e.target.tagName !== 'INPUT') return;
  const box = e.target.closest('.auth,.mbox'); if (!box) return;
  const b = box.querySelector('.btn.pri'); if (b) { e.preventDefault(); b.click(); }
}, true);

/* ───────────── boot ───────────── */
function startApp() {
  if (!allSources().some(s => s.id === U.settings.active)) U.settings.active = allSources()[0].id;
  history.replaceState({ s: 'home' }, ''); history.pushState({ s: 'live' }, ''); screen = 'live'; LV.srcId = null; render();
}
function boot() {
  history.replaceState({ s: 'home' }, '');
  if (uid && users.some(u => u.id === uid)) { loadU(); startApp(); } else { uid = null; renderAuth(); }
  setTimeout(() => { const sp = $('#splash'); if (sp) { sp.classList.add('out'); setTimeout(() => sp.remove(), 600); } }, 900);
  if ('serviceWorker' in navigator && location.protocol.startsWith('http') && (!isNative() || location.protocol === 'https:')) navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
  startUpdates();
}
/* ───────────── خادم TAMY: حساب + مزامنة مشفّرة + مباريات + إعلانات ───────────── */
const SV0 = { url: '', user: '', token: '', ek: '', rev: 0, auto: true };
const SRV = { cfg: Object.assign({}, SV0, LS.get('tamy:srv', {})), busy: false, t: null };
const srvSave = () => LS.set('tamy:srv', SRV.cfg);
const srvBase = () => { const u = (SRV.cfg.url || '').trim().replace(/\/+$/, ''); return /^(https:\/\/|http:\/\/localhost)[^\s/]+/i.test(u) ? u : ''; };
const b64e = u8 => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64d = s2 => Uint8Array.from(atob(s2.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
async function srvReq(path, o = {}) {
  const base = srvBase(); if (!base) throw new Error(L('أدخل رابط السيرفر', 'Enter server URL'));
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 15000);
  try {
    const h = { 'Content-Type': 'application/json' }; if (SRV.cfg.token && !o.noAuth) h.Authorization = 'Bearer ' + SRV.cfg.token;
    const r = await fetch(base + path, { method: o.method || 'GET', headers: h, body: o.body ? JSON.stringify(o.body) : undefined, signal: ctl.signal });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || 'HTTP ' + r.status); e.status = r.status; e.data = j; throw e; }
    return j;
  } finally { clearTimeout(to); }
}
// كلمة المرور تبقى على الجهاز: نشتق منها مفتاح دخول (يُرسل) ومفتاح تشفير (يبقى هنا)
async function srvDerive(user, pass) {
  const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode('tamy-iptv:' + user), iterations: 150000 }, km, 512));
  return { authKey: b64e(bits.slice(0, 32)), ek: b64e(bits.slice(32)) };
}
const srvKey = () => crypto.subtle.importKey('raw', b64d(SRV.cfg.ek), 'AES-GCM', false, ['encrypt', 'decrypt']);
async function srvEnc(obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12)), ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await srvKey(), new TextEncoder().encode(JSON.stringify(obj))));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12); return b64e(out);
}
async function srvDec(blob) {
  const u8 = b64d(blob);
  return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u8.slice(0, 12) }, await srvKey(), u8.slice(12))));
}
const srvSnap = () => ({ v: 1, sources: U.sources.filter(x => x.type !== 'file'), favs: U.favs, recent: U.recent, pos: U.pos, settings: Object.assign({}, U.settings) });
async function srvAuth(mode, user, pass, invite) {
  user = (user || '').trim().toLowerCase();
  if (!/^[a-z0-9_.-]{3,32}$/.test(user)) throw new Error(L('اسم المستخدم: 3–32 حرف إنجليزي/أرقام/._-', 'Username: 3–32 chars a-z 0-9 . _ -'));
  if ((pass || '').length < 6) throw new Error(L('كلمة المرور 6 أحرف على الأقل', 'Password: at least 6 characters'));
  const k = await srvDerive(user, pass);
  const j = await srvReq('/api/auth/' + (mode === 'up' ? 'register' : 'login'), { method: 'POST', noAuth: true, body: { username: user, authKey: k.authKey, invite } });
  SRV.cfg.user = j.username; SRV.cfg.token = j.token; SRV.cfg.ek = k.ek; SRV.cfg.rev = 0; srvSave();
}
async function srvPush(quiet) {
  if (!SRV.cfg.token || SRV.busy) return; SRV.busy = true;
  try {
    const j = await srvReq('/api/sync', { method: 'PUT', body: { blob: await srvEnc(srvSnap()), rev: SRV.cfg.rev } });
    SRV.cfg.rev = j.rev; srvSave(); if (!quiet) toast(L('☁ تم الرفع', '☁ Uploaded'));
  } catch (e) {
    if (e.status === 409) { SRV.cfg.rev = e.data.rev; srvSave(); toast(L('فيه نسخة أحدث على السيرفر — اضغط «سحب» أولًا', 'Newer copy on server — pull first')); }
    else if (e.status === 401) { SRV.cfg.token = ''; srvSave(); toast(L('انتهت الجلسة — سجّل الدخول من جديد', 'Session expired — sign in again')); }
    else if (!quiet) toast(L('تعذّر الرفع: ', 'Upload failed: ') + msg(e));
  } finally { SRV.busy = false; }
}
async function srvPull() {
  if (!SRV.cfg.token) return toast(L('سجّل الدخول أولًا', 'Sign in first'));
  try {
    const j = await srvReq('/api/sync'); if (!j.blob) { SRV.cfg.rev = j.rev || 0; srvSave(); return toast(L('لا توجد بيانات على السيرفر بعد', 'Nothing on the server yet')); }
    const d = await srvDec(j.blob);
    U.sources = d.sources || []; U.favs = d.favs || []; U.recent = d.recent || {}; U.pos = d.pos || {}; U.settings = Object.assign(DEF().settings, d.settings || {});
    if (!U.sources.find(x => x.id === U.settings.active) && U.settings.active !== 'free') U.settings.active = U.sources[0] ? U.sources[0].id : 'free';
    SRV.cfg.rev = j.rev; srvSave(); LS.set('tamy:u:' + uid, U); applyTheme(); toast(L('☁ تم السحب ✓', '☁ Pulled ✓')); render();
  } catch (e) { toast(e.name === 'OperationError' ? L('تعذّر فك التشفير — كلمة المرور مختلفة عن اللي رفعت بيها', 'Cannot decrypt — password differs from the uploader') : L('تعذّر السحب: ', 'Pull failed: ') + msg(e)); }
}
function srvAuto() { if (!SRV.cfg.token || SRV.cfg.auto === false) return; clearTimeout(SRV.t); SRV.t = setTimeout(() => srvPush(true), 6000); }

function srvSection() {
  const c = SRV.cfg, on = !!c.token;
  const acct = on ? `<div class="row"><div><b>☁ ${esc(c.user)}</b><small>${L('البيانات مشفّرة من جهازك قبل الرفع', 'Data is encrypted on your device before upload')}</small></div><button class="btn sm" data-act="srvout">${L('خروج', 'Sign out')}</button></div>
    <div class="row"><div><b>${L('مزامنة تلقائية', 'Auto sync')}</b></div><button class="sw ${c.auto !== false ? 'on' : ''}" data-act="srvauto"></button></div>
    <div class="acts" style="justify-content:flex-start"><button class="btn" data-act="srvpush">⬆ ${L('رفع الآن', 'Upload')}</button><button class="btn" data-act="srvpull">⬇ ${L('سحب', 'Pull')}</button><button class="btn dng" data-act="srvdel">${L('حذف الحساب', 'Delete account')}</button></div>`
    : `<div class="row" style="flex-wrap:wrap"><div style="flex:1;min-width:200px"><input class="in" style="width:100%;margin-bottom:6px" id="sv-u" placeholder="${L('اسم المستخدم', 'Username')}" autocapitalize="none" autocomplete="username"><input class="in" style="width:100%;margin-bottom:6px" id="sv-p" type="password" placeholder="${L('كلمة المرور (6+)', 'Password (6+)')}" autocomplete="current-password"><input class="in" style="width:100%" id="sv-i" placeholder="${L('كود الدعوة (إن وُجد)', 'Invite code (if any)')}"></div></div>
    <div class="acts" style="justify-content:flex-start"><button class="btn pri" data-act="srvin">${L('دخول', 'Sign in')}</button><button class="btn" data-act="srvup">${L('حساب جديد', 'Create account')}</button></div>`;
  return `<div class="set"><h3>☁ ${L('حسابي والمزامنة', 'Account & sync')}</h3>
    <div class="row"><div style="flex:1"><b>${L('رابط السيرفر', 'Server URL')}</b><input class="in" style="width:100%;margin-top:6px" id="sv-url" placeholder="https://tamy.xxx.workers.dev" value="${esc(c.url)}" autocapitalize="none"><small>${L('فعّل المباريات والإعلانات والمزامنة بين أجهزتك', 'Enables matches, announcements and cross-device sync')}</small></div></div>
    ${srvBase() ? acct : ''}</div>`;
}
function srvBind() {
  const u = $('#sv-url'); u && u.addEventListener('change', () => { SRV.cfg.url = u.value.trim(); srvSave(); XT.t = 0; render(); });
}

const XT = { t: 0, m: [], a: [] };
async function loadXtra() {
  const box = $('#xtra'); if (!box) return;
  if (!srvBase()) { box.remove(); return; }
  const draw = () => {
    const b = $('#xtra'); if (!b) return;
    const now = Date.now(), nx = nextPrayer(), loc = lang === 'ar' ? 'ar-EG' : 'en-GB';
    const ann = XT.a.slice(0, 2).map(a => `<div class="xc ann">📢 <b>${esc(a.title)}</b><small>${esc(a.body)}</small></div>`).join('');
    const pr = nx ? `<div class="xc"><small>${L('الصلاة القادمة', 'Next prayer')}</small><b>🌙 ${PRAYERS.find(p => p[0] === nx.k)[lang === 'ar' ? 1 : 2]} · ${nx.d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' })}</b></div>` : '';
    const ms = XT.m.filter(m => Date.parse(m.ts) > now - 2 * 3600e3).slice(0, 6).map(m => `<div class="xc"><small>${esc(m.league)}</small><b>${esc(m.home)} <span class="vs">${m.score ? esc(m.score) : 'vs'}</span> ${esc(m.away)}</b><small>${new Date(m.ts).toLocaleString(loc, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</small></div>`).join('');
    b.innerHTML = ann + pr + ms; b.classList.toggle('hidden', !b.innerHTML);
  };
  draw();
  if (Date.now() - XT.t < 5 * 60e3) return; XT.t = Date.now();
  try { const [m, a] = await Promise.all([srvReq('/api/matches', { noAuth: true }), srvReq('/api/announcements', { noAuth: true })]); XT.m = m.matches || []; XT.a = a.items || []; draw(); } catch (e) { /* السيرفر اختياري */ }
  if (!PR.t) loadPrayer(); 
}
Object.assign(A, {
  srvin: () => srvDo('in'), srvup: () => srvDo('up'),
  srvout: () => { SRV.cfg.token = ''; SRV.cfg.ek = ''; SRV.cfg.rev = 0; srvSave(); toast(L('تم تسجيل الخروج من السيرفر', 'Signed out')); render(); },
  srvauto: () => { SRV.cfg.auto = SRV.cfg.auto === false; srvSave(); render(); },
  srvpush: () => srvPush(false), srvpull: () => { if (confirm(L('سحب النسخة من السيرفر سيستبدل بياناتك الحالية على هذا الجهاز. متأكد؟', 'Pulling replaces the data on this device. Continue?'))) srvPull(); },
  srvdel: async () => { if (!confirm(L('حذف حسابك وبياناتك من السيرفر نهائيًا؟', 'Delete your account and data from the server permanently?'))) return; try { await srvReq('/api/account', { method: 'DELETE' }); SRV.cfg.token = ''; SRV.cfg.ek = ''; SRV.cfg.rev = 0; srvSave(); toast(L('تم الحذف', 'Deleted')); render(); } catch (e) { toast(msg(e)); } },
});
async function srvDo(mode) {
  const u = $('#sv-u').value, p = $('#sv-p').value, i = $('#sv-i').value.trim();
  try {
    toast(L('جارٍ الاتصال…', 'Connecting…')); await srvAuth(mode, u, p, i);
    if (mode === 'in') { await srvPull(); } else { await srvPush(false); }
    render();
  } catch (e) { toast(e.status === 429 ? L('محاولات كثيرة — جرّب بعد قليل', 'Too many attempts — try later') : e.status === 401 ? L('اسم المستخدم أو كلمة المرور غير صحيحة', 'Wrong username or password') : e.status === 409 ? L('الاسم مستخدم بالفعل', 'Username taken') : e.status === 403 ? L('كود الدعوة غير صحيح', 'Invalid invite code') : msg(e)); }
}

window.__tamy = { parseM3U, xBase };
boot();
})();
