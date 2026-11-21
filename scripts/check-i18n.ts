import { translations } from '../src/utils/afgTranslations';

const localeEntries = Object.entries(translations);
const referenceLocale = 'english';
const reference = translations[referenceLocale] as Record<string, string>;
const referenceKeys = Object.keys(reference).sort();
const failures: string[] = [];

for (const [locale, dictionary] of localeEntries) {
  const keys = Object.keys(dictionary).sort();
  for (const key of referenceKeys) {
    if (!(key in dictionary)) failures.push(`[${locale}] Missing key: ${key}`);
  }
  for (const key of keys) {
    if (!(key in reference)) failures.push(`[${locale}] Unexpected key: ${key}`);
    const value = dictionary[key as keyof typeof dictionary];
    if (typeof value !== 'string' || value.trim().length === 0) {
      failures.push(`[${locale}] Empty or non-string value: ${key}`);
    }
  }
  if (keys.length !== referenceKeys.length) {
    failures.push(`[${locale}] Key count ${keys.length} differs from ${referenceKeys.length}`);
  }
}

// Untranslated gate: a value identical to the English reference in a
// non-English locale means the English copy was never translated.
// brandName is the product mark and is legitimately identical everywhere.
// Loanwords that are the correct native term (verified per locale) are
// whitelisted explicitly and documented below.
const equalityWhitelist: Record<string, Set<string>> = {
  '*': new Set(['brandName']),
  // "Chat" and "Online" are the standard German/Portuguese terms
  // (Duden/Aulete usage); "Version 1.0.0" is native in French/German;
  // "Notifications" is the standard French term (same spelling as English).
  german: new Set(['navChat', 'online', 'aboutVersion']),
  french: new Set(['aboutVersion', 'notifications']),
  spanish: new Set(['navChat']),
  portuguese: new Set(['navChat', 'online']),
};

const untranslatedFailures: string[] = [];
let untranslatedTotal = 0;
for (const [locale, dictionaryRaw] of localeEntries) {
  const dictionary = dictionaryRaw as Record<string, string>;
  if (locale === referenceLocale) continue;
  const combined = new Set([...(equalityWhitelist['*'] || []), ...(equalityWhitelist[locale] || [])]);
  for (const key of referenceKeys) {
    if (combined.has(key)) continue;
    if (dictionary[key] === reference[key]) {
      untranslatedFailures.push(`[${locale}] Untranslated (English copy): ${key}`);
      untranslatedTotal++;
    }
  }
}

if (failures.length || untranslatedFailures.length) {
  process.stderr.write([...failures, ...untranslatedFailures].join('\n') + '\n');
  process.exit(1);
}
process.stdout.write(
  `i18n validation passed: ${localeEntries.length} locales, ${referenceKeys.length} keys each, ` +
  `${untranslatedTotal} untranslated English copies.\n`
);
