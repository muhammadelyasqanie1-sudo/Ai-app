import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

export type AppLanguageCode = 'en' | 'fa';
export type AppThemePreference = 'dark' | 'light' | 'neon' | 'system';

const LANGUAGE_KEY = 'afg_language';
const THEME_KEY = 'afg_theme';

export function toLanguageCode(language: 'english' | 'dari'): AppLanguageCode {
  return language === 'english' ? 'en' : 'fa';
}

export function fromLanguageCode(value: string | null | undefined): 'english' | 'dari' | null {
  if (value === 'en' || value === 'english') return 'english';
  if (value === 'fa' || value === 'dari') return 'dari';
  return null;
}

export async function getSavedLanguage(): Promise<'english' | 'dari' | null> {
  try {
    const value = Capacitor.isNativePlatform()
      ? (await Preferences.get({ key: LANGUAGE_KEY })).value
      : localStorage.getItem(LANGUAGE_KEY);
    return fromLanguageCode(value) || fromLanguageCode(localStorage.getItem(LANGUAGE_KEY));
  } catch {
    return fromLanguageCode(typeof localStorage === 'undefined' ? null : localStorage.getItem(LANGUAGE_KEY));
  }
}

export async function saveLanguage(language: 'english' | 'dari'): Promise<void> {
  const code = toLanguageCode(language);
  localStorage.setItem(LANGUAGE_KEY, code);
  if (Capacitor.isNativePlatform()) await Preferences.set({ key: LANGUAGE_KEY, value: code });
}

export async function getSavedTheme(): Promise<AppThemePreference | null> {
  try {
    const value = Capacitor.isNativePlatform()
      ? (await Preferences.get({ key: THEME_KEY })).value
      : localStorage.getItem(THEME_KEY);
    const stored = value || localStorage.getItem(THEME_KEY);
    return stored === 'dark' || stored === 'light' || stored === 'neon' || stored === 'system' ? stored : null;
  } catch {
    const value = typeof localStorage === 'undefined' ? null : localStorage.getItem(THEME_KEY);
    return value === 'dark' || value === 'light' || value === 'neon' || value === 'system' ? value : null;
  }
}

export async function saveTheme(theme: AppThemePreference): Promise<void> {
  localStorage.setItem(THEME_KEY, theme);
  if (Capacitor.isNativePlatform()) await Preferences.set({ key: THEME_KEY, value: theme });
}
