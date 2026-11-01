import { translations } from './afgTranslations';
import type { Language } from '../types/afg';

type Dictionary = typeof translations.dari;
type TranslationKey = keyof Dictionary;

const dictionaries: Record<Language, Dictionary> = translations;
const supportedLocales: Record<Language, string> = { dari: 'fa-AF', english: 'en-US' };

export function translate<K extends TranslationKey>(language: Language, key: K): Dictionary[K] {
  const value = dictionaries[language]?.[key];
  if (typeof value !== 'string' || !value.trim()) {
    const message = `Missing translation: ${language}.${String(key)}`;
    if (import.meta.env.DEV) throw new Error(message);
    throw new Error(message);
  }
  return value;
}

export function getIntlLocale(language: Language): string {
  return supportedLocales[language];
}

export function formatLocalizedDate(value: Date | number, language: Language, options: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat(getIntlLocale(language), options).format(value);
}

export function formatLocalizedNumber(value: number, language: Language, options: Intl.NumberFormatOptions = {}): string {
  return new Intl.NumberFormat(getIntlLocale(language), options).format(value);
}

export function formatFileSize(bytes: number, language: Language): string {
  if (!Number.isFinite(bytes) || bytes < 0) throw new RangeError('File size must be a non-negative number.');
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit += 1; }
  return `${formatLocalizedNumber(Number(size.toFixed(unit === 0 ? 0 : 1)), language)} ${units[unit]}`;
}

export function applyDocumentLocale(language: Language): void {
  const locale = getIntlLocale(language);
  document.documentElement.lang = locale;
  document.documentElement.dir = language === 'dari' ? 'rtl' : 'ltr';
}
