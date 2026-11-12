# برنامهٔ اندروید سرپرست کارگاه

پوستهٔ اندرویدی (Capacitor) برای پوشهٔ `sarparast/`. فایل APK را GitHub Actions می‌سازد
(`.github/workflows/sarparast-apk.yml`) و در بخش Releases مخزن می‌گذارد:
https://github.com/ehsanrahimi086/daftar/releases/latest/download/sarparast.apk

- هر تغییری در `sarparast/` یا این پوشه که روی `main` برود، نسخهٔ تازهٔ APK می‌سازد.
- بعد از تغییر دفترها (karkard، anbar، resid، notes) اول `python3 tools/build_sarparast.py` را اجرا کنید.
- امضا: اگر رازهای مخزن `SV_KEYSTORE_B64` (فایل کلید به base64) و `SV_KEYSTORE_PASS` تعریف شده باشند، همهٔ نسخه‌ها با یک کلید امضا می‌شوند و نسخهٔ تازه روی قبلی نصب می‌شود. بدون آن‌ها APK آزمایشی (debug) است و برای نصب نسخهٔ تازه باید اول از داخل برنامه پشتیبان گرفت، برنامه را پاک کرد، نسخهٔ تازه را نصب و پشتیبان را بازگرداند.
- `res/` آیکن برنامه در اندازه‌های مختلف است.
