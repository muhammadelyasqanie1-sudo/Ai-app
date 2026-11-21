# برنامه جامع تکمیل AFG AI (بر پایه ممیزی ۲۰۲۶-۱۱-۲۲)

اصل حاکم: **تکمیل پروژه موجود، نه بازسازی.** هیچ فریم‌ورکی عوض نمی‌شود؛ همه تغییرات روی
شاخه `feature/afg-ai-complete-product` و additive هستند.

## فاز ۱ — اصلاحات بحرانی P0 (همین اجرا)
| # | کار | فایل‌ها | معیار پذیرش |
|---|---|---|---|
| 1 | اصلاح regex rate-limit (`\\s`→`\s`) | `src/api/http.ts` | سیاست‌های user/tier واقعاً شمرده می‌شوند |
| 2 | حذف روت ادمین سایه‌شده | `src/api/adminHandler.ts` | یک `GET /api/admin/providers`؛ tsc پاس |
| 3 | اتصال ابزار مرورگر به abort signal | `src/api/chatHandler.ts`, `browserAutomation.ts` | لغو درخواست → لغو ابزار |
| 4 | وصل کردن صوت واقعی: پیاده‌سازی `transcribe`/`synthesize`/`voiceOptions`/`analyzeImage` روی آداپتر OpenAI-compatible از طریق `compatibleMedia` + ارسال model از voice.ts | `openAiCompatible.ts`, `providerTypes.ts`, `voice.ts` | `/api/voice/*` با provider پیکربندی‌شده کار می‌کند؛ گیت ادمین voice قابل عبور |
| 5 | ⌘K به پالت فرمان برگردد | `JarvisShell.tsx` | Ctrl/⌘+K پالت را باز می‌کند |
| 6 | `video_generate` برای تب ویدیو | `AfgVideoGenView.tsx` | استودیو با نوع تولید باز می‌شود |
| 7 | آواتار مهمان | `AfgChatView.tsx` | تصویر پیش‌فرض SVG، بدون img شکسته |
| 8 | CI ویندوز: lockfile + `npm ci` | `package-lock.json` | `npm ci` قابل اجرا |
| 9 | اسکریپت Needle | `scripts/download-needle-android.sh` | `huggingface_hub[hf_xet]>=0.34` + استفاده از `huggingface-cli` در دسترس |
| 10 | بهداشت ریپو: اسم پکیج، electron env URL، `.env.example` واقعی، حذف assetهای بی‌مرجع | چند فایل | build سبک‌تر، مستندات env صادقانه |

## فاز ۲ — کنسول ادمین واقعی (نیاز F)
- `AfgAdminConsole.tsx` جدید که از ~۴۰ روت زنده استفاده می‌کند:
  Overview (`/api/admin/overview`)، کاربران (`/api/admin/users` GET/PATCH)،
  فلگ‌ها (`/api/admin/feature-flags` GET/PATCH)، پروایدرها (`/api/admin/providers`)،
  مدل‌ها (`/api/admin/models` + bulk)، Audit (`/api/admin/audit`)،
  رویدادهای امنیتی (`/api/admin/security-events`)، سلامت سیستم (`/api/admin/system-health`).
- ورود فقط برای role≠user؛ مجوزها سمت سرور اعمال می‌شوند (client state مجوز نیست).
- ۴ زبان اصلی (en/dari/ps/ar) با الگوی copy درون‌کامپوننتی موجود.

## فاز ۳ — موارد مستندشده (نیازمند تصمیم مالک یا شرایط خارجی)
- ذخیره سمت سرور پیام دستیار (تغییر معنایی persistence؛ ریسک هم‌زمانی با ذخیره client-driven → طراحی جداگانه).
- پاک‌سازی ۳ هزار خط کد مرده (لیست کامل در گزارش ممیزی §۳.۱۰) — پس از تأیید مالک.
- شماره‌گذاری مجدد مایگریشن‌ها (فقط نصب تازه؛ نصب‌های موجود با ledger حفظ می‌شوند).
- تم روشن کامل، i18n عمیق، WebSocket چندنمونه‌ای، Dockerfile/render.yaml، CI با PostgreSQL.

## وضعیت اجرای فاز ۳ (۲۰۲۶-۱۱-۲۲، همین اجرا)
| کار | وضعیت | شاهد |
|---|---|---|
| ذخیره سمت سرور پیام دستیار | **انجام شد** | `4c956199`؛ `chatPersistence.ts` با درج idempotent و ارتقای cancelled→complete؛ رخداد SSE `persisted`؛ تست DB-free + تست integration با PostgreSQL واقعی |
| پاک‌سازی کد مرده | **انجام شد (تأییدشده)** | `b8aacdf7`؛ `src/workspace` (۱۷ فایل) + ۱۴ کامپوننت بی‌مصرف حذف شد؛ `AfgHomeView`/`AfgLanguageModal` بررسی و سالم تشخیص داده شد (ادعای ممیزی نادرست بود) |
| CI با PostgreSQL | **انجام شد** | `41466f8b`؛ تریگرهای خراب `branches: ain]` در ci.yml و i18n-build.yml اصلاح شد؛ jobهای integration با PostgreSQL 18 سرویس و ClamAV اضافه شد |
| Dockerfile/render.yaml | **انجام شد** | `ab6fc573`؛ تصویر چندمرحله‌ای non-root + Blueprint رندر؛ بوت واقعی runtime با `scripts/test-runtime-boot.sh` وریفای شد |
| generateImage/editImage روی آداپتر | **انجام شد** | `2ae6caa8`؛ مسیر compatibleMedia واقعی، فقط خروجی inline base64 (بدون fetch URL)؛ تست wire-level |
| بهداشت مایگریشن‌ها | **انجام شد (بدون تغییر مخرب)** | `959de4e6`؛ اثبات شد که جدول `system_config` زنده است (ادعای ممیزی نادرست بود)؛ شماره‌های تکراری فریز و مستند شد؛ گارد CI |

### اصلاحات مهم در گزارش ممیزی (نتیجه راستی‌آزمایی این اجرا)
1. «جدول 9999 هرگز استفاده نمی‌شود» نادرست بود — `system_config` توسط API ادمین و ۹Router فعالانه خوانده/نوشته می‌شود.
2. «AfgHomeView و AfgLanguageModal مرده‌اند» نادرست بود — هر دو در App.tsx سوار می‌شوند و حفظ شدند.
3. «تریگرهای CI سالم‌اند» نادرست بود — `ci.yml` و `i18n-build.yml` واقعاً `branches: ain]` خراب داشتند و هرگز اجرا نمی‌شدند؛ اصلاح شد.

### بلوکه‌های خارجی (صادقانه)
- ClamAV (`clamscan`) در این محیط نصب نمی‌شود (بدون دسترسی root) → `test:media-engine` fail-closed است؛ در CI نصب می‌شود.
- Push به GitHub اعتبار ندارد؛ همه commitها به‌صورت محلی روی شاخه ذخیره می‌شوند.
- تست‌های provider smoke به کلیدهای واقعی NINEROUTER/APINEX نیاز دارند (بدون جعل).

## معیار تکمیل فاز ۱ و ۲ در این اجرا
1. `npm run lint` (tsc --noEmit) پاس.
2. `npm run build` پاس.
3. اسکریپت‌های تست بدون-DB پاس (`offline-sha`, `osint`, `database-config`, `admin-rbac`, `jarvis-command`, `core-state`, `chat-stream`, `knowledge`).
4. `npm run i18n:check` پاس.
5. همه تغییرات با commitهای اتمی روی شاخه + changelog کامل.

**وضعیت اجرا (۲۰۲۶-۱۱-۲۲):** فاز ۱ و فاز ۲ کامل اجرا و تأیید شد (CHANGELOG.md).

## برآورد حجم کار باقی‌مانده (فاز ۳ به بعد)
| کار | حجم تقریبی | اولویت |
|---|---|---|
| ذخیره سمت سرور پیام دستیار (idempotent + سازگار با client-driven) | ۲–۳ روز مهندسی | بالا |
| پاک‌سازی ~۳k خط کد مرده (لیست ممیزی §۳.۱۰) + حذف `src/workspace` mock | ۱ روز | بالا |
| شماره‌گذاری مجدد ۸ جفت مایگریشن تکراری + حذف 9999 | ۱ روز | متوسط |
| تم روشن روی viewهای AFG (کلاس‌های تیره hardcode) | ۲–۳ روز | متوسط |
| عمق i18n (۱۴ زبان غیراصلی، یکپارچه‌سازی ۶ سیستم copy) | ۳–۴ روز | متوسط |
| CI با PostgreSQL سرویس + ۴ تست integration + vitest برای chatLogic | ۱ روز | متوسط |
| Dockerfile/render.yaml + پروژه Capacitor `android/` چک‌شده | ۱–۲ روز | متوسط |
| generateImage/editImage روی آداپترها + مسیر استودیوی قدیمی | ۱ روز | کم |
| WebSocket/صف مشترک برای حالت چندنمونه‌ای | ۳–۵ روز | کم |

## ترتیب اجرای پیشنهادی
فاز ۱ (بحرانی) → فاز ۲ (کنسول ادمین) → ذخیره پیام سرور → پاک‌سازی کد مرده → CI کامل → تم/i18n → استقرار → چندنمونه‌ای.
