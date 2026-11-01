import { translations } from '../src/utils/afgTranslations';

const localeEntries = Object.entries(translations);
const referenceLocale = 'english';
const reference = translations[referenceLocale];
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

if (failures.length) {
  process.stderr.write(failures.join('\n') + '\n');
  process.exit(1);
}
process.stdout.write(`i18n validation passed: ${localeEntries.length} locales, ${referenceKeys.length} keys each.\n`);
