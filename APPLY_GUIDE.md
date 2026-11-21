# راهنمای اعمال تغییرات AFG AI (شاخه feature/afg-ai-complete-product)

این بسته شامل **تمام کارهای انجام‌شده روی مخزن واقعی** است. شاخه از
`main @ 23c82be0` ساخته شده و معماری موجود حفظ شده است.

## محتوای بسته

| فایل/پوشه | توضیح |
|---|---|
| `changed-files/` | کل درخت فایل‌های تغییر یافته/جدید (مسیرها نسبت به ریشه مخزن حفظ شده) |
| `patches/0001-*.patch … 0006-*.patch` | سری پچ git (format-patch) از main تا HEAD |
| `afg-ai-complete-product.patch` | دیف واحد کل تغییرات (برای `git apply`) |
| `CHANGELOG.md` | گزارش کامل تغییرات + لیست تست‌های اجراشده |
| `docs/AUDIT_REPOSITORY_2026-11-22.md` | گزارش ممیزی کامل مخزن |
| `docs/AFG_AI_COMPLETION_PLAN.md` | برنامه جامع تکمیل |

## روش اعمال — حالت A (مخزن کامل دارید)

```bash
git checkout main
git pull
git checkout -b feature/afg-ai-complete-product
git am patches/0001-*.patch patches/0002-*.patch patches/0003-*.patch \
        patches/0004-*.patch patches/0005-*.patch patches/0006-*.patch
npm install
npm run lint && npm run build
```

## روش اعمال — حالت B (فایل‌ها را کپی می‌کنید)

1. محتوای `changed-files/` را روی ریشه مخزن کپی کنید (فایل‌های حذف‌شده:
   `.aistudio/**` و `public/assets/aistudio/**` را دستی حذف کنید).
2. `git add -A && git commit`
3. `npm install && npm run lint && npm run build`

## تایید نهایی

```bash
npm run i18n:check
npx tsx scripts/test-offline-sha.ts
npx tsx scripts/test-database-config.ts
npx tsx scripts/test-admin-rbac.ts
npx tsx scripts/test-osint-engine.ts
npx tsx scripts/test-jarvis-command-engine.ts
npx tsx scripts/test-chat-stream.ts
npx tsx scripts/test-knowledge-engine.ts
npx tsx scripts/test-core-state.ts
npx tsx src/utils/chatLogic.test.ts
```

## آنچه پس از استقرار لازم است (شرایط خارجی — صادقانه)

- `NINEROUTER_BASE_URL` (+ `NINEROUTER_API_KEY` در صورت requireApiKey) برای چت/جست‌وجو/صوت ابری.
- `APINEX_API_KEYS` برای کاتالوگ دوم.
- `DATABASE_URL` + `npm run db:migrate`.
- پس از بالا آمدن سرور: ورود ادمین با `AFG_ADMIN_BOOTSTRAP_TOKEN`، سپس کنسول ادمین جدید در ناوبری «Admin Console» ظاهر می‌شود.
- صوت: تنها وقتی کاتالوگ 9Router مدل tts/stt تأییدشده داشته باشد، فلگ voice توسط ادمین قابل فعال‌سازی است (گیت واقعی، نه ساختگی).

## محدودیت‌های ثبت‌شده

- این محیط **دسترسی push به گیت‌هاب ندارد**؛ برای انتشار، پچ‌ها را با `git am` اعمال و شاخه را push کنید.
- تست‌های integration نیازمند PostgreSQL (خدمت 127.0.0.1:55432) هستند و در این اجرا اجرا نشدند؛ اجرای آن‌ها در CI نیازمند provisioning است (در برنامه فاز ۳).
