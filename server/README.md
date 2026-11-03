# سيرفر TAMY IPTV (Cloudflare Workers — مجاني)

الميزات: مباريات، صلاة، إعلانات، آخر إصدار، **حسابات ومزامنة مشفّرة** بين أجهزتك.

## الأمان باختصار
- كلمة المرور **لا تُرسل للسيرفر أبدًا**. التطبيق يشتق منها مفتاحين: مفتاح دخول (يُرسل ويُجزّأ على السيرفر) ومفتاح تشفير (يبقى على جهازك).
- اشتراكاتك تُرفع **مشفّرة AES-GCM**، والسيرفر لا يملك مفتاح فكّها. لو نسيت كلمة المرور لا يمكن استرجاع البيانات المرفوعة.
- حدّ للمحاولات (تخمين كلمة المرور)، وحدّ لحجم الطلب، وCORS لمواقع محددة فقط.
- **كود دعوة (`INVITE_CODE`)** يمنع الغرباء من إنشاء حسابات تستهلك حصتك المجانية — يُنصح به.

## الرفع من الموبايل (بدون أي أدوات)
1. ادخل على dash.cloudflare.com ← **Workers & Pages** ← **Create** ← **Start with Hello World** ← الاسم `tamy-iptv` ← **Deploy**.
2. اضغط **Edit code**، امسح الكود الموجود، والصق محتوى `worker.js` كله، ثم **Deploy**.
3. من القايمة: **Storage & Databases ← KV ← Create** باسم `tamy-kv`.
4. ارجع للـWorker ← **Settings ← Bindings ← Add ← KV namespace**: اسم المتغيّر **`KV`** واختر `tamy-kv`.
5. **Settings ← Variables and Secrets ← Add** (النوع **Secret**):
   - `SECRET` : نص عشوائي طويل. في Termux: `head -c 32 /dev/urandom | base64`
   - `ADMIN_TOKEN` : نص عشوائي آخر (لإدارة الإعلانات).
   - `INVITE_CODE` : كود تعطيه لنفسك ومن تثق فيه.
   - (نص عادي) `REPO` : `zarzouramahmoudabdo-commits/tamy-iptv`
6. افتح `https://tamy-iptv.<اسمك>.workers.dev/api/health` — لازم يظهر `{"ok":true}`.
7. في التطبيق: **الإعدادات ← حسابي والمزامنة ← رابط السيرفر**، الصق الرابط.

## إدارة الإعلانات والمباريات (من Termux)
```
curl -X POST https://tamy-iptv.XXX.workers.dev/api/admin/announcements \
  -H "Authorization: Bearer ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"items":[{"title":"تحديث جديد","body":"نسخة 13 متاحة"}]}'

curl -X POST https://tamy-iptv.XXX.workers.dev/api/admin/matches \
  -H "Authorization: Bearer ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"items":[{"league":"الدوري المصري","home":"الأهلي","away":"الزمالك","ts":"2026-11-10T17:00:00Z"}]}'
```
(`ts` بتوقيت UTC.) المباريات تُجلب تلقائيًا من TheSportsDB لو متاحة، وتُدمج معها اليدوية.

## الحدود المجانية
KV: 1000 كتابة/يوم و100 ألف قراءة/يوم — كافية جدًا لاستخدام شخصي. Workers: 100 ألف طلب/يوم.
