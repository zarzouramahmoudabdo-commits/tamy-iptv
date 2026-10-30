# TAMY IPTV 📺

مشغّل IPTV بواجهة عربية/إنجليزية: بث مباشر، أفلام، مسلسلات، مفضلة، راديو (قرآن + FM)، ومواقيت صلاة بالأذان. يعمل على الموبايل وAndroid TV (بالريموت).

> **مهم:** التطبيق **مشغّل فقط**. المحتوى المدفوع يجي من اشتراكك أنت (Xtream Codes أو M3U). القنوات المجانية المدمجة (مصر + العالم) بتتحمّل من قوائم iptv-org العامة.

## المميزات
- **بث مباشر**: قنوات مصر، كل العالم (المجانية)، حسب الدولة (55 دولة)، حسب التصنيف، + قنواتك من اشتراكك.
- **اشتراكك**: Xtream Codes (سيرفر/يوزر/باسورد) أو رابط M3U أو ملف M3U — مع اختبار الاتصال قبل الحفظ.
- **أفلام ومسلسلات** من اشتراكك (المسلسلات بمواسم وحلقات).
- **مشغّل**: hls.js + مشغّل أندرويد الأصلي كاحتياطي، تبديل قنوات بالأسهم، تقديم/تأخير 10 ثواني، حفظ مكان المشاهدة.
- **المفضلة** و**كمّل المشاهدة** و**بحث** عام.
- **راديو**: محطات القرآن (mp3quran) و FM مصرية (radio-browser).
- **مواقيت الصلاة** (AlAdhan) مع عدّاد الصلاة القادمة وتنبيه الأذان وأذكار.
- **حسابات** محلية + ضيف، **ثيمات** (TAMY، الأهلي، الزمالك، Real Madrid، Barcelona)، نسخ احتياطي.
- دعم **ريموت التلفزيون** (أسهم + OK + رجوع) وأيقونة Android TV.

## بناء الـAPK من Termux + GitHub (من غير Android Studio)

```bash
# 1) تجهيز Termux (مرة واحدة)
pkg update -y && pkg install -y git unzip
termux-setup-storage

# 2) فك الملف (غيّر المسار لو الملف في مكان تاني)
cd ~
cp ~/storage/downloads/tamy-iptv.zip .
unzip tamy-iptv.zip && cd tamy-iptv

# 3) ارفع على GitHub (أنشئ مستودع فاضي باسم tamy-iptv الأول من موقع GitHub)
git init -b main
git add .
git commit -m "TAMY IPTV"
git remote add origin https://github.com/USERNAME/tamy-iptv.git
git push -u origin main
```
> عند الـpush اكتب اسم المستخدم، وكـ"password" استخدم **Personal Access Token** (GitHub → Settings → Developer settings → Tokens، صلاحية `repo` و`workflow`).

بعد الـpush:
1. افتح المستودع ← **Actions** ← هتلاقي "Build TAMY IPTV APK" شغّال (5–10 دقايق).
2. لما يخلص: صفحة **Releases** ← نزّل `TAMY-IPTV.apk` وثبّته (فعّل "تثبيت من مصادر غير معروفة").

## تجربة سريعة في المتصفح
```bash
npm install && npm run prepare:www && npm run serve   # ثم افتح http://localhost:8080
```

## ملاحظات
- APK الناتج **debug** (قابل للتثبيت مباشرة). لنشره على Google Play محتاج توقيع release.
- بعض سيرفرات البث بتحجب المتصفحات؛ التطبيق بيجرّب hls.js ثم المشغّل الأصلي تلقائياً. من الإعدادات تقدر تختار المحرك يدوياً.
- ملفات MKV قد لا تعمل على بعض الأجهزة (قيد WebView).
- الحسابات محلية على الجهاز (مفيش سيرفر).
