"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ThemeProvider } from "next-themes";
import { Locale, Dictionary, getDictionary, localeDir, LOCALES } from "@/lib/afg/i18n";
import type { SafeUser } from "@/lib/afg/auth";

// ---------------------------------------------------------------------------
// Session context — bootstrapped from /api/auth/session
// ---------------------------------------------------------------------------

export type Announcement = { id: string; title: string; body: string; level: string; createdAt: string };
export type PlatformFlags = Record<string, boolean>;

export type SessionBootstrap = {
  user: SafeUser | null;
  announcements: Announcement[];
  flags: PlatformFlags;
  googleEnabled: boolean;
  devCodes: boolean;
};

type SessionContextValue = {
  bootstrap: SessionBootstrap | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue>({
  bootstrap: null,
  loading: true,
  refresh: async () => undefined,
});

export const useSession = () => useContext(SessionContext);

// ---------------------------------------------------------------------------
// Locale & i18n context (RTL-aware)
// ---------------------------------------------------------------------------

type LocaleContextValue = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: Dictionary;
  dir: "ltr" | "rtl";
};

const LocaleContext = createContext<LocaleContextValue>({
  locale: "en",
  setLocale: () => undefined,
  t: getDictionary("en"),
  dir: "ltr",
});

export const useLocale = () => useContext(LocaleContext);

export function useT(): Dictionary {
  return useContext(LocaleContext).t;
}

// ---------------------------------------------------------------------------
// Combined provider
// ---------------------------------------------------------------------------

export function AfgProviders({ children }: { children: React.ReactNode }) {
  const [bootstrap, setBootstrap] = useState<SessionBootstrap | null>(null);
  const [loading, setLoading] = useState(true);
  const [locale, setLocaleState] = useState<Locale>("en");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      if (res.ok) setBootstrap(await res.json());
    } catch {
      // offline: keep previous bootstrap if any
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await refresh();
    })();
    queueMicrotask(() => {
      // Locale restore runs after mount so no state is set synchronously inside
      // the effect body (hydration-safe: server rendered with the default).
      const stored = (localStorage.getItem("afg_locale") as Locale) || null;
      if (stored && LOCALES.some((l) => l.id === stored)) setLocaleState(stored);
    });
    // PWA service worker (offline shell)
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, [refresh]);

  // Apply user's saved locale once session loads (signed-in preference wins over
  // localStorage). Render-time guard per react.dev/learn/you-might-not-need-an-effect.
  const sessionLocale = bootstrap?.user?.locale;
  const [prevSessionLocale, setPrevSessionLocale] = useState<string | undefined>(undefined);
  if (sessionLocale !== prevSessionLocale) {
    setPrevSessionLocale(sessionLocale);
    if (sessionLocale && LOCALES.some((l) => l.id === sessionLocale)) {
      setLocaleState(sessionLocale as Locale);
    }
  }

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem("afg_locale", l);
    fetch("/api/auth/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: l }),
    }).catch(() => undefined);
  }, []);

  const dir = localeDir(locale);

  // Apply direction + language to the document
  useEffect(() => {
    document.documentElement.dir = dir;
    document.documentElement.lang = locale;
  }, [dir, locale]);

  const sessionValue = useMemo(() => ({ bootstrap, loading, refresh }), [bootstrap, loading, refresh]);
  const localeValue = useMemo(
    () => ({ locale, setLocale, t: getDictionary(locale), dir }),
    [locale, setLocale, dir]
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <SessionContext.Provider value={sessionValue}>
        <LocaleContext.Provider value={localeValue}>{children}</LocaleContext.Provider>
      </SessionContext.Provider>
    </ThemeProvider>
  );
}
