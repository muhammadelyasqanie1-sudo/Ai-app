"use client";

import React, { useEffect, useState } from "react";
import { Loader2, ShieldCheck, LogOut, Trash2, Globe, Palette, Mic, User, Info, MailCheck, MailWarning } from "lucide-react";
import { api, ApiClientError } from "./api-client";
import { useSession, useT, useLocale } from "./providers";
import { LOCALES, Locale } from "@/lib/afg/i18n";
import type { SafeUser } from "@/lib/afg/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTheme } from "next-themes";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export function SettingsView() {
  const t = useT();
  const { locale, setLocale } = useLocale();
  const { theme, setTheme } = useTheme();
  const { bootstrap, refresh } = useSession();
  const user = bootstrap?.user || null;

  if (!user) return null;

  return (
    <div className="h-full overflow-y-auto afg-scroll">
      <div className="max-w-2xl mx-auto p-4 sm:p-6 pb-16">
        <h1 className="text-2xl font-bold mb-6">{t.settings.title}</h1>
        <Tabs defaultValue="profile">
          <TabsList className="mb-4 flex-wrap h-auto">
            <TabsTrigger value="profile"><User className="h-4 w-4" /><span className="ms-1.5">{t.settings.profile}</span></TabsTrigger>
            <TabsTrigger value="appearance"><Palette className="h-4 w-4" /><span className="ms-1.5">{t.settings.appearance}</span></TabsTrigger>
            <TabsTrigger value="voice"><Mic className="h-4 w-4" /><span className="ms-1.5">{t.settings.voice}</span></TabsTrigger>
            <TabsTrigger value="account"><ShieldCheck className="h-4 w-4" /><span className="ms-1.5">{t.settings.account}</span></TabsTrigger>
            <TabsTrigger value="about"><Info className="h-4 w-4" /><span className="ms-1.5">{t.settings.about}</span></TabsTrigger>
          </TabsList>

          <ProfileTab user={user} onSaved={refresh} />
          <AppearanceTab theme={theme || "system"} setTheme={setTheme} locale={locale} setLocale={setLocale} />
          <VoiceTab user={user} onSaved={refresh} />
          <AccountTab user={user} />
          <AboutTab />
        </Tabs>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ProfileTab({ user, onSaved }: { user: SafeUser; onSaved: () => Promise<void> }) {
  const t = useT();
  const [name, setName] = useState(user.name || "");
  const [systemPrompt, setSystemPrompt] = useState(user.systemPrompt || "");
  const [memory, setMemory] = useState(user.memoryEnabled);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api.post("/api/auth/profile", { name: name.trim() || undefined, systemPrompt: systemPrompt || null, memoryEnabled: memory });
      await onSaved();
      toast({ title: t.settings.profileSaved });
    } catch {
      toast({ title: t.errors.generic, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <TabsContent value="profile" className="space-y-5 mt-0">
      {user.isGuest && (
        <GuestUpgradeCard />
      )}
      <div className="rounded-lg border bg-card p-4 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="set-name">{t.auth.name}</Label>
          <Input id="set-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="set-email">{t.auth.email}</Label>
          <div className="flex items-center gap-2">
            <Input id="set-email" value={user.email || "—"} disabled dir="ltr" />
            {user.emailVerified ? (
              <span className="flex items-center gap-1 text-xs text-emerald-600 shrink-0"><MailCheck className="h-3.5 w-3.5" />{t.settings.emailVerified}</span>
            ) : !user.isGuest ? (
              <span className="flex items-center gap-1 text-xs text-[var(--afg-amber)] shrink-0"><MailWarning className="h-3.5 w-3.5" />{t.settings.emailNotVerified}</span>
            ) : null}
          </div>
          {!user.emailVerified && !user.isGuest && <VerifyEmailCard />}
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="set-memory">{t.settings.memoryLabel}</Label>
            <Switch id="set-memory" checked={memory} onCheckedChange={setMemory} />
          </div>
          <p className="text-xs text-muted-foreground">{t.settings.memoryHint}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="set-sysprompt">{t.chat.systemPromptLabel}</Label>
          <Textarea id="set-sysprompt" value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} placeholder={t.chat.systemPromptPlaceholder} className="min-h-20" />
          <p className="text-xs text-muted-foreground">{t.settings.systemPromptHint}</p>
        </div>
        <Button onClick={save} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          <span className="ms-1.5">{t.settings.saveProfile}</span>
        </Button>
      </div>
    </TabsContent>
  );
}

function GuestUpgradeCard() {
  const t = useT();
  const { refresh } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const claim = async () => {
    setBusy(true); setError(null);
    try {
      await api.post("/api/auth/register", { email, password });
      await refresh();
      toast({ title: t.settings.guestUpgrade });
    } catch (err) {
      setError(err instanceof ApiClientError && err.code === "EMAIL_TAKEN" ? t.errors.emailTaken : t.errors.generic);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 space-y-3">
      <p className="text-sm font-medium">{t.settings.guestUpgrade}</p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="grid sm:grid-cols-2 gap-2">
        <Input type="email" dir="ltr" placeholder={t.auth.email} value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input type="password" dir="ltr" placeholder={t.auth.password} value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <Button size="sm" onClick={claim} disabled={busy || !email || password.length < 8}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        <span className="ms-1.5">{t.settings.upgrade}</span>
      </Button>
    </div>
  );
}

function VerifyEmailCard() {
  const t = useT();
  const { bootstrap, refresh } = useSession();
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    try {
      const res = await api.post<{ delivered: boolean; devCode?: string }>("/api/auth/verify-request", {});
      if (res.devCode) setDevCode(res.devCode);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    try {
      await api.post("/api/auth/verify-confirm", { email: bootstrap?.user?.email, code });
      await refresh();
      toast({ title: t.settings.emailVerifiedDone });
    } catch {
      toast({ title: t.errors.invalidCode, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {devCode && <span className="text-xs text-muted-foreground">{t.auth.devCodeNotice} <b className="font-mono">{devCode}</b></span>}
      <Input className="w-28" inputMode="numeric" dir="ltr" maxLength={6} placeholder="••••••" value={code} onChange={(e) => setCode(e.target.value)} aria-label={t.auth.verificationCode} />
      <Button size="sm" variant="outline" onClick={send} disabled={busy}>{t.settings.sendVerification}</Button>
      <Button size="sm" onClick={confirm} disabled={busy || code.length !== 6}>{t.auth.verifyNow}</Button>
    </div>
  );
}

// ---------------------------------------------------------------------------

function AppearanceTab({ theme, setTheme, locale, setLocale }: { theme: string; setTheme: (t: string) => void; locale: Locale; setLocale: (l: Locale) => void }) {
  const t = useT();
  const themes = [
    { id: "light", label: t.settings.themeLight },
    { id: "dark", label: t.settings.themeDark },
    { id: "system", label: t.settings.themeSystem },
  ];
  return (
    <TabsContent value="appearance" className="space-y-5 mt-0">
      <div className="rounded-lg border bg-card p-4 space-y-4">
        <div className="space-y-2">
          <Label>{t.settings.theme}</Label>
          <div className="flex gap-2" role="radiogroup" aria-label={t.settings.theme}>
            {themes.map((th) => (
              <button
                key={th.id}
                role="radio"
                aria-checked={theme === th.id}
                onClick={() => setTheme(th.id)}
                className={cn(
                  "flex-1 rounded-lg border p-3 text-sm transition-colors",
                  theme === th.id ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent"
                )}
              >
                {th.label}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Label><Globe className="h-3.5 w-3.5 inline me-1.5" />{t.settings.language}</Label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {LOCALES.map((l) => (
              <button
                key={l.id}
                onClick={() => setLocale(l.id)}
                aria-pressed={locale === l.id}
                className={cn(
                  "rounded-lg border p-3 text-sm transition-colors",
                  locale === l.id ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent"
                )}
              >
                <div className="font-medium">{l.native}</div>
                <div className="text-[11px] text-muted-foreground">{l.label}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </TabsContent>
  );
}

// ---------------------------------------------------------------------------

function VoiceTab({ user, onSaved }: { user: SafeUser; onSaved: () => Promise<void> }) {
  const t = useT();
  const [voiceEnabled, setVoiceEnabled] = useState(user.voiceEnabled);
  const [rate, setRate] = useState(user.voiceRate);
  const [pitch, setPitch] = useState(user.voicePitch);
  const [busy, setBusy] = useState(false);
  const [ttsAvailable, setTtsAvailable] = useState<boolean | null>(null);
  const [sttAvailable, setSttAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    // Browser capability probe — deferred to a microtask so no state is set
    // synchronously inside the effect body.
    queueMicrotask(() => {
      setTtsAvailable(typeof speechSynthesis !== "undefined" && speechSynthesis.getVoices().length >= 0);
      const W = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
      setSttAvailable(!!(W.SpeechRecognition || W.webkitSpeechRecognition));
    });
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      await api.post("/api/auth/profile", { voiceEnabled, voiceRate: rate, voicePitch: pitch });
      await onSaved();
      toast({ title: t.settings.profileSaved });
    } finally {
      setBusy(false);
    }
  };

  return (
    <TabsContent value="voice" className="space-y-5 mt-0">
      <div className="rounded-lg border bg-card p-4 space-y-5">
        <p className="text-sm text-muted-foreground">{t.settings.privacyNote}</p>
        {ttsAvailable === false && sttAvailable === false && (
          <p className="text-sm text-[var(--afg-amber)]">{t.voice.unavailable}</p>
        )}
        <div className="flex items-center justify-between">
          <Label htmlFor="voice-enabled">{t.voice.speakReplies}</Label>
          <Switch id="voice-enabled" checked={voiceEnabled} onCheckedChange={setVoiceEnabled} />
        </div>
        <div className="space-y-2">
          <Label>{t.voice.rate}: {rate.toFixed(1)}×</Label>
          <Slider value={[rate]} min={0.5} max={2} step={0.1} onValueChange={([v]) => setRate(v)} aria-label={t.voice.rate} />
        </div>
        <div className="space-y-2">
          <Label>{t.voice.pitch}: {pitch.toFixed(1)}</Label>
          <Slider value={[pitch]} min={0.5} max={2} step={0.1} onValueChange={([v]) => setPitch(v)} aria-label={t.voice.pitch} />
        </div>
        <Button onClick={save} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          <span className="ms-1.5">{t.settings.saveProfile}</span>
        </Button>
      </div>
    </TabsContent>
  );
}

// ---------------------------------------------------------------------------

function AccountTab({ user }: { user: SafeUser }) {
  const t = useT();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (user.isGuest) {
    return (
      <TabsContent value="account" className="mt-0">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">{t.auth.guestNotice}</p>
        </div>
      </TabsContent>
    );
  }

  const changePassword = async () => {
    setBusy(true);
    try {
      await api.post("/api/auth/password-change", { currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      toast({ title: t.settings.passwordChanged });
    } catch (err) {
      toast({
        title: err instanceof ApiClientError && err.code === "INVALID_CREDENTIALS" ? t.errors.invalidCredentials : t.errors.generic,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const signOutEverywhere = async () => {
    try {
      // Deleting the session server-side revokes all sessions except current is not
      // directly supported, so we re-sign-in is needed on other devices. Sign out here.
      await api.post("/api/auth/logout", {});
      // Intentional full-page navigation: signing out must wipe every in-memory
      // client state (caches, stores, open views) — a client-side route change
      // would not be sufficient.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/";
    } catch {
      toast({ title: t.errors.generic, variant: "destructive" });
    }
  };

  return (
    <TabsContent value="account" className="space-y-5 mt-0">
      <div className="rounded-lg border bg-card p-4 space-y-4">
        <h3 className="font-semibold">{t.settings.changePassword}</h3>
        <div className="grid sm:grid-cols-2 gap-2">
          <Input type="password" dir="ltr" placeholder={t.settings.currentPassword} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          <Input type="password" dir="ltr" placeholder={t.auth.newPassword} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </div>
        <Button onClick={changePassword} disabled={busy || !currentPassword || newPassword.length < 8}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          <span className="ms-1.5">{t.settings.changePassword}</span>
        </Button>
      </div>
      <div className="rounded-lg border border-destructive/40 p-4 space-y-3">
        <h3 className="font-semibold text-destructive">{t.settings.dangerZone}</h3>
        <Button variant="outline" onClick={signOutEverywhere}>
          <LogOut className="h-4 w-4" />
          <span className="ms-1.5">{t.settings.signOutEverywhere}</span>
        </Button>
      </div>
    </TabsContent>
  );
}

function AboutTab() {
  const t = useT();
  return (
    <TabsContent value="about" className="mt-0">
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="relative h-10 w-10 rounded-xl afg-glow-ring grid place-items-center overflow-hidden">
            <div className="absolute inset-0 afg-core" aria-hidden />
          </div>
          <div>
            <div className="font-bold afg-gradient-text text-lg">AFG AI</div>
            <div className="text-xs text-muted-foreground">{t.meta.tagline}</div>
          </div>
        </div>
        <div className="text-sm text-muted-foreground space-y-1">
          <p>{t.settings.version}: <span className="font-mono">1.0.0</span></p>
          <p>{t.settings.privacyNote}</p>
        </div>
      </div>
    </TabsContent>
  );
}
