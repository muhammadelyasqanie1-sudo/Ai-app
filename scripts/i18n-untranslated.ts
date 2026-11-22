// Measures untranslated (English-copy) keys in every supported locale.
// A key counts as "untranslated" when the resolved value is string-identical
// to the English value and the key is not on the allowed-equality whitelist.
import { translations } from '../src/utils/afgTranslations';

const referenceLocale = 'english';
const reference = translations[referenceLocale] as Record<string, string>;
const referenceKeys = Object.keys(reference).sort();

// Keys allowed to be identical to English in every locale (brand marks).
const equalityWhitelist = new Set(['brandName']);

const report: string[] = [];
let totalUntranslated = 0;

for (const [locale, dictionaryRaw] of Object.entries(translations)) {
  if (locale === referenceLocale) continue;
  const dictionary = dictionaryRaw as Record<string, string>;
  const untranslated: string[] = [];
  for (const key of referenceKeys) {
    if (equalityWhitelist.has(key)) continue;
    if (dictionary[key] === reference[key]) untranslated.push(key);
  }
  totalUntranslated += untranslated.length;
  report.push(`[${locale}] ${untranslated.length}/${referenceKeys.length} untranslated`);
  if (process.argv.includes('--keys')) {
    report.push(`  ${untranslated.join(', ')}`);
  }
}

report.push(`TOTAL: ${totalUntranslated} untranslated keys across ${Object.keys(translations).length - 1} non-English locales`);
process.stdout.write(report.join('\n') + '\n');
