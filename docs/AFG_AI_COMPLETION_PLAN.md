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

## معیار تکمیل فاز ۱ و ۲ در این اجرا
1. `npm run lint` (tsc --noEmit) پاس.
2. `npm run build` پاس.
3. اسکریپت‌های تست بدون-DB پاس (`offline-sha`, `osint`, `database-config`, `admin-rbac`, `jarvis-command`, `core-state`, `chat-stream`, `knowledge`).
4. `npm run i18n:check` پاس.
5. همه تغییرات با commitهای اتمی روی شاخه + changelog کامل.
