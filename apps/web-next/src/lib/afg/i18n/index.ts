import { en, Dictionary } from "./en";
import { fa } from "./fa";
import { ps } from "./ps";
import { ar } from "./ar";

export type Locale = "en" | "fa" | "ps" | "ar";

export const LOCALES: { id: Locale; label: string; native: string; dir: "ltr" | "rtl" }[] = [
  { id: "en", label: "English", native: "English", dir: "ltr" },
  { id: "fa", label: "Persian / Dari", native: "دری / فارسی", dir: "rtl" },
  { id: "ps", label: "Pashto", native: "پښتو", dir: "rtl" },
  { id: "ar", label: "Arabic", native: "العربية", dir: "rtl" },
];

const DICTS: Record<Locale, Dictionary> = { en, fa, ps, ar };

export function getDictionary(locale: Locale): Dictionary {
  return DICTS[locale] || en;
}

export function localeDir(locale: Locale): "ltr" | "rtl" {
  return LOCALES.find((l) => l.id === locale)?.dir || "ltr";
}

export function isRtl(locale: Locale): boolean {
  return localeDir(locale) === "rtl";
}

export type { Dictionary };
