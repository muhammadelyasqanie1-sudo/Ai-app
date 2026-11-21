"use client";

import React, { useState } from "react";
import { Bot, Loader2, Mail, AlertCircle, Chrome } from "lucide-react";
import { useSession, useT } from "./providers";
import { api, ApiClientError } from "./api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";

type Mode = "signin" | "signup" | "reset";

export function AuthView({ onAuthed }: { onAuthed: () => void }) {
  const t = useT();
  const { bootstrap, refresh } = useSession();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);

  const friendly = (err: unknown): string => {
    if (err instanceof ApiClientError) {
      switch (err.code) {
        case "EMAIL_TAKEN": return t.errors.emailTaken;
        case "INVALID_CREDENTIALS": return t.errors.invalidCredentials;
        case "INVALID_CODE": return t.errors.invalidCode;
        case "SUSPENDED": return t.auth.accountSuspended;
        case "RATE_LIMITED": return t.errors.rateLimited;
        case "INVALID_INPUT": return err.message;
        case "EMAIL_SEND_FAILED": return t.errors.generic;
        default: return t.errors.generic;
      }
    }
    return t.errors.network;
  };

  const doSignIn = async () => {
    setBusy("signin"); setError(null);
    try {
      await api.post("/api/auth/login", { email, password });
      await refresh();
      onAuthed();
    } catch (err) {
      setError(friendly(err));
    } finally {
      setBusy(null);
    }
  };

  const doSignUp = async () => {
    if (password.length < 8) { setError(t.auth.weakPassword); return; }
    setBusy("signup"); setError(null);
    try {
      const res = await api.post<{ devCode?: string }>("/api/auth/register", { email, password, name: name || undefined });
      if (res.devCode) setDevCode(res.devCode);
      await refresh();
      onAuthed();
    } catch (err) {
      setError(friendly(err));
    } finally {
      setBusy(null);
    }
  };

  const doGuest = async () => {
    setBusy("guest"); setError(null);
    try {
      await api.post("/api/auth/guest", {});
      await refresh();
      onAuthed();
    } catch (err) {
      setError(friendly(err));
    } finally {
      setBusy(null);
    }
  };

  const doResetRequest = async () => {
    setBusy("reset"); setError(null);
    try {
      const res = await api.post<{ delivered: boolean; devCode?: string }>("/api/auth/reset-request", { email });
      if (res.devCode) { setDevCode(res.devCode); setInfo(t.auth.resetCodeSent); }
      else setInfo(t.auth.resetCodeSent);
      setMode("reset");
    } catch (err) {
      setError(friendly(err));
    } finally {
      setBusy(null);
    }
  };

  const doResetConfirm = async () => {
    setBusy("resetConfirm"); setError(null);
    try {
      await api.post("/api/auth/reset-confirm", { email, code, newPassword });
      setInfo(t.settings.passwordChanged + " — " + t.auth.signIn);
      setMode("signin");
    } catch (err) {
      setError(friendly(err));
    } finally {
      setBusy(null);
    }
  };

  const googleEnabled = bootstrap?.googleEnabled;

  return (
    <div className="min-h-screen flex afg-grid-bg bg-background" dir="ltr">
      {/* Cinematic left panel */}
      <div className="hidden lg:flex flex-1 flex-col justify-center items-center relative overflow-hidden border-e">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,var(--afg-glow),transparent_65%)]" aria-hidden />
        <div className="relative flex flex-col items-center gap-8 afg-fade-up" aria-hidden>
          <div className="relative h-44 w-44">
            <div className="absolute inset-0 rounded-full border border-primary/25 afg-orbit" style={{ borderTopColor: "var(--afg-cyan)", borderInlineStartColor: "var(--afg-violet)" }} />
            <div className="absolute inset-0 rounded-full border border-primary/10 afg-orbit" style={{ animationDirection: "reverse", borderBottomColor: "var(--afg-amber)", animationDuration: "22s" }} />
            <div className="absolute inset-6 rounded-3xl afg-core" />
            <div className="absolute inset-0 grid place-items-center"><Bot className="h-10 w-10 text-primary" /></div>
          </div>
          <div className="text-center max-w-md">
            <h1 className="text-5xl font-bold tracking-tight afg-gradient-text">AFG AI</h1>
            <p className="mt-3 text-muted-foreground text-lg">{t.meta.tagline}</p>
          </div>
        </div>
        <div className="absolute bottom-6 text-xs text-muted-foreground/70" aria-hidden>
          {t.auth.googleNotConfigured && !googleEnabled ? "" : ""}
        </div>
      </div>

      {/* Auth panel */}
      <div className="w-full lg:w-[520px] flex flex-col justify-center px-6 sm:px-12 py-10">
        <div className="lg:hidden flex justify-center mb-8 afg-fade-up">
          <div className="flex flex-col items-center gap-3">
            <div className="relative h-20 w-20">
              <div className="absolute inset-0 rounded-full border border-primary/25 afg-orbit" style={{ borderTopColor: "var(--afg-cyan)" }} />
              <div className="absolute inset-2 rounded-2xl afg-core" />
              <div className="absolute inset-0 grid place-items-center"><Bot className="h-5 w-5 text-primary" /></div>
            </div>
            <div className="text-3xl font-bold afg-gradient-text">AFG AI</div>
          </div>
        </div>

        {mode === "reset" ? (
          <div className="space-y-4 afg-fade-up">
            <h2 className="text-2xl font-bold">{t.auth.resetTitle}</h2>
            <p className="text-sm text-muted-foreground">{devCode ? t.auth.resetCodeSent : t.auth.resetInstructions}</p>
            {devCode && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{t.auth.devCodeNotice} <b className="font-mono">{devCode}</b></AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="reset-email">{t.auth.email}</Label>
              <Input id="reset-email" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </div>
            {devCode && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="reset-code">{t.auth.verificationCode}</Label>
                  <Input id="reset-code" inputMode="numeric" dir="ltr" value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reset-pass">{t.auth.newPassword}</Label>
                  <Input id="reset-pass" type="password" dir="ltr" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                </div>
                <Button className="w-full" onClick={doResetConfirm} disabled={busy === "resetConfirm"}>
                  {busy === "resetConfirm" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {t.auth.verifyAndReset}
                </Button>
              </>
            )}
            {!devCode && (
              <Button className="w-full" onClick={doResetRequest} disabled={busy === "reset" || !email}>
                {busy === "reset" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t.auth.sendCode}
              </Button>
            )}
            <Button variant="ghost" className="w-full" onClick={() => { setMode("signin"); setDevCode(null); setError(null); }}>
              {t.common.back}
            </Button>
          </div>
        ) : (
          <Tabs value={mode} onValueChange={(v) => { setMode(v as Mode); setError(null); }} className="afg-fade-up">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">{t.auth.signIn}</TabsTrigger>
              <TabsTrigger value="signup">{t.auth.signUp}</TabsTrigger>
            </TabsList>
            <div className="mt-6 space-y-4">
              {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
              {info && <Alert><AlertDescription>{info}</AlertDescription></Alert>}

              <TabsContent value="signin" className="space-y-4 mt-0">
                <div className="space-y-2">
                  <Label htmlFor="in-email">{t.auth.email}</Label>
                  <Input id="in-email" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && email && password && doSignIn()} autoComplete="email" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="in-pass">{t.auth.password}</Label>
                    <button type="button" className="text-xs text-primary hover:underline" onClick={() => { setMode("reset"); setDevCode(null); }}>
                      {t.auth.forgotPassword}
                    </button>
                  </div>
                  <Input id="in-pass" type="password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && email && password && doSignIn()} autoComplete="current-password" />
                </div>
                <Button className="w-full" onClick={doSignIn} disabled={busy !== null || !email || !password}>
                  {busy === "signin" ? <><Loader2 className="h-4 w-4 animate-spin" /><span className="ms-2">{t.auth.signingIn}</span></> : t.auth.signIn}
                </Button>
              </TabsContent>

              <TabsContent value="signup" className="space-y-4 mt-0">
                <div className="space-y-2">
                  <Label htmlFor="up-name">{t.auth.name} <span className="text-muted-foreground">({t.common.optional})</span></Label>
                  <Input id="up-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="up-email">{t.auth.email}</Label>
                  <Input id="up-email" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="up-pass">{t.auth.password}</Label>
                  <Input id="up-pass" type="password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
                </div>
                <Button className="w-full" onClick={doSignUp} disabled={busy !== null || !email || password.length < 8}>
                  {busy === "signup" ? <><Loader2 className="h-4 w-4 animate-spin" /><span className="ms-2">{t.auth.creatingAccount}</span></> : t.auth.signUp}
                </Button>
                <p className="text-xs text-muted-foreground">{t.auth.guestNotice}</p>
              </TabsContent>
            </div>
          </Tabs>
        )}

        <div className="mt-6 space-y-3">
          <div className="relative">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
            <div className="relative flex justify-center text-xs"><span className="bg-background px-2 text-muted-foreground">or</span></div>
          </div>
          <Button variant="outline" className="w-full" onClick={doGuest} disabled={busy !== null}>
            {busy === "guest" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            <span className="ms-2">{t.auth.continueAsGuest}</span>
          </Button>
          <Button
            variant="outline"
            className="w-full"
            disabled={busy !== null}
            title={googleEnabled ? t.auth.googleSignIn : t.auth.googleNotConfigured}
            onClick={() => { window.location.href = "/api/auth/google-start"; }}
          >
            <Chrome className="h-4 w-4" />
            <span className="ms-2">{t.auth.googleSignIn}</span>
            {!googleEnabled && <span className="ms-2 text-xs text-muted-foreground">({t.common.disabled})</span>}
          </Button>
        </div>
      </div>
    </div>
  );
}
