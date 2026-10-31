#!/usr/bin/env python3
"""يعدّل AndroidManifest.xml: يسمح بالروابط http، ويضيف دعم Android TV (Leanback)."""
import re, sys, pathlib

p = pathlib.Path("android/app/src/main/AndroidManifest.xml")
if not p.exists():
    sys.exit("AndroidManifest.xml not found - run `npx cap add android` first")

s = p.read_text(encoding="utf-8")

# 1) السماح بالبث عبر http
if "usesCleartextTraffic" not in s:
    s = s.replace("<application", '<application\n        android:usesCleartextTraffic="true"', 1)

# 2) Android TV: أيقونة في شاشة التلفزيون + عدم اشتراط الشاشة اللمسية
tv_features = (
    '    <uses-feature android:name="android.hardware.touchscreen" android:required="false" />\n'
    '    <uses-feature android:name="android.software.leanback" android:required="false" />\n'
)
if "software.leanback" not in s:
    s = s.replace("<application", tv_features + "    <application", 1)

leanback_filter = (
    "            <intent-filter>\n"
    '                <action android:name="android.intent.action.MAIN" />\n'
    '                <category android:name="android.intent.category.LEANBACK_LAUNCHER" />\n'
    "            </intent-filter>\n"
)
if "LEANBACK_LAUNCHER" not in s:
    # نضيفها قبل إغلاق أول <activity>
    s = re.sub(r"(</activity>)", leanback_filter + r"        \1", s, count=1)

# 3) منع إعادة تحميل الـ Activity عند تغيير الاتجاه (حتى لا يتوقف البث)
if "orientation" not in s.split("<activity", 1)[1].split(">", 1)[0]:
    s = s.replace("<activity", '<activity\n            android:configChanges="orientation|screenSize|keyboardHidden|smallestScreenSize|screenLayout|uiMode"', 1)

# 4) الوضع الأفقي دائماً
if "screenOrientation" not in s.split("<activity", 1)[1].split(">", 1)[0]:
    s = s.replace("<activity", '<activity\n            android:screenOrientation="sensorLandscape"', 1)

p.write_text(s, encoding="utf-8")
print("AndroidManifest.xml patched")

# 5) إخفاء شريط الحالة (fullscreen) حتى لا يغطي الأيقونات العلوية
st = pathlib.Path("android/app/src/main/res/values/styles.xml")
if st.exists():
    t = st.read_text(encoding="utf-8")
    if "windowFullscreen" not in t:
        t = re.sub(r'(<style name="AppTheme\.NoActionBar"[^>]*>)', r'\1\n        <item name="android:windowFullscreen">true</item>', t, count=1)
        st.write_text(t, encoding="utf-8")
        print("styles.xml patched (fullscreen)")
