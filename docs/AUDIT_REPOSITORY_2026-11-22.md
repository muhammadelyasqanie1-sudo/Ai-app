# گزارش ممیزی کامل مخزن AFG AI — ۲۰۲۶-۱۱-۲۲

**دامنه:** تمام مخزن (۲٬۶۴۲ فایل git-tracked، ۱۲۰MB، ۱۹۰+ شاخه) با ممیزی موازی چهار لایه:
فرانت‌اند، بک‌اند، دیتابیس/CI/استقرار، و پلتفرم‌ها (اندروید/آفلاین/دسکتاپ/CLI/vendor).
**روش:** خواندن مستقیم کد، نه اتکا به مستندات. ادعاهای هر ایجنت با جست‌وجوی مستقیم در کد راستی‌آزمایی شد.

## ۱. معماری واقعی فعلی

- **کلاینت:** React 19 + Vite 8 + Tailwind 4 (`index.html` → `src/main.tsx` → `src/App.tsx`). مسیریابی URL وجود ندارد؛ ناوبری با state (`TabType`) در `App.tsx` و شِل فعلی `src/components/jarvis/JarvisShell.tsx` است.
- **سرور:** Express واحد (`server.ts`) + روتر واحد `src/api/http.ts` + ۲۷ هندلر در `src/api/*`.
- **دیتابیس:** PostgreSQL با ۶۲ فایل مایگریشن مرتب (۵۴ شماره یکتا + ۸ شماره تکراری + 9999).
- **پروایدرها:** `src/services/providerGateway.ts` → آداپترهای 9Router و APInex (هر دو روی `createOpenAICompatibleAdapter`) و Ollama (DB-driven، فقط loopback).
- **پلتفرم‌ها:** Capacitor 8 اندروید (بدون دایرکتوری `android/` در ریپو — در CI تولید می‌شود)، Electron (وب‌ویو URL راه‌آهن)، CLI مستقل، PWA دستی (`public/sw.js`).
- **دو اپ موازی:** `src/workspace/*` (۱۷ فایل، mock کامل، ساخته نمی‌شود و سرو نمی‌شود — اسکلت بی‌استفاده) و `vendor/OpenJarvis` (۸۳٪ کل فایل‌های ریپو؛ فقط ۳ روت پروکسی به سایدکار در `src/api/openjarvis.ts` از آن استفاده می‌کند).

## ۲. نقشه وضعیت قابلیت‌ها (خلاصه)

| قابلیت | وضعیت | شواهد |
|---|---|---|
| احراز هویت (ایمیل/Google/بازیابی/CSRF/سشن) | **کامل و واقعی** | `src/api/auth.ts` — argon2id، کد ۶رقمی، توت‌فرحت زمان‌مقایسه‌ای |
| چت استریمینگ SSE | **کامل و واقعی** | `chatHandler.ts` (events: meta/content/activity/tool_status/error/done) |
| تاریخچه گفتگو | **واقعی ولی client-driven** | `conversations.ts`؛ هندلر چت خودش پیام ذخیره نمی‌کند؛ مهمان تاریخچه ندارند |
| ابزارهای چت (جست‌وجو/OSINT/GitHub/MCP/مرورگر/API) | **واقعی** | `chatHandler.ts:650-672` |
| مدیریت Provider/Model (کشف/سلامت/fallback) | **واقعی** | `providerGateway.ts` + `chatService.ts` |
| صوت STT/TTS سمت سرور | **خراب (مسیر مُرده)** | `voice.ts:98,125` آداپتر `transcribe`/`synthesize` می‌خواهد که هیچ آداپتری پیاده نکرده → همیشه 503 |
| Media Studio (تصویر/OCR/TTS/فایل) | **واقعی** | `media/engine.ts` + `compatibleMedia.ts` (صفحه job واقعی) |
| پنل ادمین UI | **حذف‌شده؛ فقط API زنده است** | ~۴۰ روت `/api/admin/*` واقعی در `adminHandler.ts`؛ صفر مصرف‌کننده در `src/components` |
| فایل‌ها | **کوارنتین فقط** | `files.ts`؛ دانلود فقط بعد از اسکن ClamAV (`media/storage.ts:35`) |
| آفلاین (WebLLM/دانلود GGUF/Needle اندروید/Vosk) | **واقعی** (وب: دانلود+WebGPU؛ اندروید: اجرای GGUF) | `AfgOfflineHubView.tsx`، پلاگین‌های Capacitor |
| JARVIS اندروید | **واقعی (محدود)** | پلاگین accessibility + سیاست ۳۴ قابلیت (`jarvis-capability-policy.ts`) |
| دسکتاپ ویندوز | **نمی‌سازد** | `windows-desktop.yml` اجرای `npm ci` بدون lockfile → شکست قطعی |
| Terminal | **نمایشی** | فقط ۵ دستور read-only؛ `terminal_exec_enabled` عمداً قفل است |
| `src/workspace` | **Mock کامل، بدون استقرار** | `workspace/api.ts:4` خودش اذعان دارد |
| vendor/OpenJarvis | **۹۵٪ وزن مرده** | صفر import در src؛ باینری ۷۷MB macOS در گیت |

## ۳. مشکلات تأییدشده (با شواهد مستقیم)

### بحرانی (P0)
1. **باگ regex → کل سیاست‌های rate-limit کاربر/سطح بلااستفاده‌اند** — `src/api/http.ts:74` در regex literal از `\\s` استفاده کرده (مطابق `\\s` literal)؛ نسخه درست در خط 150 است. نتیجه: هیچ سیاست `user/tier` اعمال نمی‌شود.
2. **روت ادمین تکراری سایه‌شده** — `adminHandler.ts:938-956` نسخه دوم `GET /api/admin/providers` که هرگز اجرا نمی‌شود (خط 217 می‌برد).
3. **صوت سمت سرور همیشه 503** — آداپترها `transcribe`/`synthesize` ندارند؛ پیاده‌سازی واقعی در `compatibleMedia.ts` هست ولی وصله نیست؛ گیت ادمین (`adminHandler.ts:640-647`) هرگز رد نمی‌شود.
4. **ابزار مرورگر به سیگنال abort وصل نیست** — `chatHandler.ts:662`؛ درخواست لغوشده تا ۱۸۰ثانیه ادامه می‌یابد.
5. **دسکتاپ ویندوز CI می‌شکند** — `npm ci` بدون `package-lock.json`.
6. **اسکریپت Needle خراب** — `scripts/download-needle-android.sh:31` پکیج `huggingface_hubf_xet]>=0.34` (spec خراب) + CLI نصب‌نشده.
7. **مصدومیت دوباره‌کاری CI** — ادعای «تریگر `ain]`» توسط ایجنت، در راستی‌آزمایی مستقیم **رد شد**؛ تریگرها سالم‌اند `[main]`.

### مهم (P1)
8. پیام دستیار در سمت سرور ذخیره نمی‌شود (مهمان = صفر تاریخچه؛ قطع کلاینت = از دست رفتن پاسخ).
9. UI ادمین وجود ندارد (~۴۰ روت زنده بی‌مصرف).
10. `AfgHomeView`، `AfgLanguageModal`، `AfgHeader`، `AfgNavigation`، `AfgLlmApiCatalogPanel` و ۱۰ کامپوننت قدیمی ChatGPT-clone مرده‌اند (~۳k خط)؛ `AfgHomeView` ساخته می‌شود ولی JarvisShell هرگز آن را روی تب home سوار نمی‌کند.
11. ⌘K توسط JarvisShell (capture + `stopImmediatePropagation`، خط 260-267) ربوده می‌شود → پالت فرمان با شورت‌کات باز نمی‌شود.
12. `AfgVideoGenView` به‌جای تولید ویدیو، `video_analyze` باز می‌کند.
13. آواتار مهمان خراب (`AfgChatView.tsx:327` با `avatar:''`).
14. تم روشن ناقص: viewهای AFG رنگ تیره hardcode دارند.
15. i18n: ۱۸ زبان × ۱۱۳ کلید سالم؛ ولی ۱۴ زبان غیراصلی ~۷۰٪ انگلیسی‌مانند و ~۶ سیستم copy جداگانه.
16. مایگریشن‌های شماره‌تکراری (۸ جفت) + `9999` جدولی می‌سازد که هرگز ساخته نمی‌شود (کد از شکل 0001 استفاده می‌کند).
17. `.env.example` ۱۲ متغیر استفاده‌شده را ندارد و متغیرهای مرده (Cloudflare/TERMINAL_*/PACK_*) را تبلیغ می‌کند.
18. اسم پکیج هنوز `chatgpt-clone` است؛ electron URL راه‌آهن hardcode است.
19. زباله‌های ریپو: باینری ۷۷MB macOS، ۷.۲MB PNG بی‌مرجع در `public/assets/aistudio`، ۱۰ فایل temp `.aistudio`.
20. تست‌های integration چهارگانه (agent/conversation/media/redaction) هیچ‌جا در CI اجرا نمی‌شوند (PostgreSQL provisioning ندارد)؛ `chatLogic.test.ts` یتیم است.

## ۴. نقاط قوت (حفظ شود)
- انضباط امنیتی نادر: CSRF دو-سویه، SSRF-guard، audit_logs append-only، رمزنگاری AES-GCM اعتبارنامه‌ها، redaction کنسول.
- عدم ساختگی: هیچ mock در اپ تولیدی؛ قابلیت‌ها فقط بعد از health-check واقعی فعال می‌شوند.
- استریم چت، RTL (۴ زبان اصلی کامل)، reduced-motion و fallback صحیح در UI.

## ۵. موانع خارجی (صادقانه)
- **بدون دسترسی push به گیت‌هاب از این محیط** (اعتبارنامه موجود نیست) → تحویل با ZIP کامل + پچ + راهنمای اعمال.
- بدون `NINEROUTER_BASE_URL`/`APINEX_API_KEYS`/`DATABASE_URL` واقعی، صحت runtime providerها از اینجا قابل اثبات نیست؛ همه تغییرات با tsc/build/تست‌های بدون-DB تأیید می‌شوند.
