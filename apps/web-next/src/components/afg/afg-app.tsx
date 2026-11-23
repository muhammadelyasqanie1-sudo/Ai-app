"use client";

import React, { useCallback, useEffect, useState } from "react";
import { MessageSquare, History, Settings, ShieldCheck, WifiOff, Bot, Menu, X, Loader2 } from "lucide-react";
import { useSession, useT } from "./providers";
import { AuthView } from "./auth-view";
import { ChatView } from "./chat/chat-view";
import { Sidebar } from "./sidebar";
import { SettingsView } from "./settings-view";
import { AdminView } from "./admin/admin-view";
import { OfflineView } from "./offline-view";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type AppView = "chat" | "history" | "admin" | "settings" | "offline";

export function AfgApp() {
  const { bootstrap, loading, refresh } = useSession();
  const t = useT();
  const [view, setView] = useState<AppView>("chat");
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [listVersion, setListVersion] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [dismissedAnnouncements, setDismissedAnnouncements] = useState<string[]>([]);

  const user = bootstrap?.user || null;
  const isAdmin = user ? user.role === "ADMIN" || user.role === "STAFF" : false;
  // View permission is derived (not effect-gated): non-admins never see admin view
  const effectiveView: AppView = view === "admin" && !isAdmin ? "chat" : view;

  const bumpList = useCallback(() => setListVersion((v) => v + 1), []);

  if (loading) {
    return <BootScreen tagline={t.meta.tagline} appName={t.meta.appName} />;
  }

  if (!user) {
    return <AuthView onAuthed={() => refresh()} />;
  }

  const visibleAnnouncements = (bootstrap?.announcements || []).filter(
    (a) => !dismissedAnnouncements.includes(a.id)
  );

  const navItems: { id: AppView; label: string; icon: React.ReactNode; adminOnly?: boolean }[] = [
    { id: "chat", label: t.nav.chats, icon: <MessageSquare className="h-4.5 w-4.5" /> },
    { id: "history", label: t.nav.history, icon: <History className="h-4.5 w-4.5" /> },
    { id: "offline", label: t.nav.offlineHub, icon: <WifiOff className="h-4.5 w-4.5" /> },
    { id: "admin", label: t.nav.adminPanel, icon: <ShieldCheck className="h-4.5 w-4.5" />, adminOnly: true },
    { id: "settings", label: t.nav.settings, icon: <Settings className="h-4.5 w-4.5" /> },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background" dir={undefined}>
      {/* Announcement banner */}
      {visibleAnnouncements.length > 0 && (
        <div className={cn(
          "px-4 py-2 text-sm flex items-center justify-between gap-3 border-b",
          visibleAnnouncements[0].level === "critical" && "bg-destructive/15 text-destructive border-destructive/30",
          visibleAnnouncements[0].level === "warning" && "bg-[var(--afg-amber)]/10 text-[var(--afg-amber)] border-[var(--afg-amber)]/30",
          visibleAnnouncements[0].level === "info" && "bg-primary/10 text-primary border-primary/25"
        )} role="status">
          <div className="min-w-0">
            <span className="font-semibold me-2">{visibleAnnouncements[0].title}</span>
            <span className="text-foreground/80">{visibleAnnouncements[0].body}</span>
          </div>
          <button
            className="shrink-0 rounded p-1 hover:bg-background/40"
            aria-label={t.announcement.dismiss}
            onClick={() => setDismissedAnnouncements((d) => [...d, visibleAnnouncements[0].id])}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex w-72 shrink-0 flex-col border-e bg-sidebar text-sidebar-foreground">
          <Sidebar
            activeId={activeConversationId}
            onActivate={(id) => { setActiveConversationId(id); setView("chat"); }}
            onCreated={(id) => { setActiveConversationId(id); setView("chat"); bumpList(); }}
            listVersion={listVersion}
            archiveMode={false}
          />
        </aside>

        {/* Mobile drawer */}
        {mobileNavOpen && (
          <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/60" onClick={() => setMobileNavOpen(false)} />
            <aside className="absolute inset-y-0 start-0 w-80 max-w-[85vw] bg-sidebar border-e flex flex-col afg-fade-up">
              <div className="flex items-center justify-between px-3 py-2 border-b">
                <BrandMark compact />
                <Button variant="ghost" size="icon" aria-label={t.common.close} onClick={() => setMobileNavOpen(false)}>
                  <X className="h-5 w-5" />
                </Button>
              </div>
              <Sidebar
                activeId={activeConversationId}
                onActivate={(id) => { setActiveConversationId(id); setView("chat"); setMobileNavOpen(false); }}
                onCreated={(id) => { setActiveConversationId(id); setView("chat"); bumpList(); setMobileNavOpen(false); }}
                listVersion={listVersion}
                archiveMode={false}
              />
            </aside>
          </div>
        )}

        {/* Main */}
        <main className="flex-1 min-w-0 flex flex-col">
          <header className="h-14 flex items-center gap-2 px-3 border-b bg-background/95 backdrop-blur sticky top-0 z-30">
            <Button variant="ghost" size="icon" className="md:hidden" aria-label={t.nav.chats} onClick={() => setMobileNavOpen(true)}>
              <Menu className="h-5 w-5" />
            </Button>
            <BrandMark compact />
            <div className="flex-1" />
            <div className="flex items-center gap-1" role="navigation" aria-label={t.nav.settings}>
              {navItems.filter((n) => !n.adminOnly || isAdmin).map((n) => (
                <Button
                  key={n.id}
                  variant={effectiveView === n.id ? "secondary" : "ghost"}
                  size="sm"
                  className={cn("hidden sm:inline-flex", effectiveView === n.id && "font-medium")}
                  onClick={() => setView(n.id)}
                >
                  {n.icon}
                  <span className="ms-1.5">{n.label}</span>
                </Button>
              ))}
              {/* Mobile icon-only nav */}
              {navItems.filter((n) => !n.adminOnly || isAdmin).map((n) => (
                <Button
                  key={`m-${n.id}`}
                  variant={effectiveView === n.id ? "secondary" : "ghost"}
                  size="icon"
                  className="sm:hidden"
                  aria-label={n.label}
                  onClick={() => setView(n.id)}
                >
                  {n.icon}
                </Button>
              ))}
            </div>
          </header>

          <div className="flex-1 min-h-0">
            {effectiveView === "chat" && (
              <ChatView
                conversationId={activeConversationId}
                onConversationCreated={(id) => { setActiveConversationId(id); bumpList(); }}
                onConversationsChanged={bumpList}
                onArchive={() => { setActiveConversationId(null); bumpList(); }}
              />
            )}
            {effectiveView === "history" && (
              <div className="h-full overflow-y-auto afg-scroll">
                <div className="max-w-4xl mx-auto p-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <section aria-label={t.nav.history}>
                      <Sidebar
                        activeId={activeConversationId}
                        onActivate={(id) => { setActiveConversationId(id); setView("chat"); }}
                        onCreated={(id) => { setActiveConversationId(id); setView("chat"); bumpList(); }}
                        listVersion={listVersion}
                        archiveMode={false}
                        flat
                      />
                    </section>
                    <section aria-label={t.nav.archive}>
                      <Sidebar
                        activeId={activeConversationId}
                        onActivate={(id) => { setActiveConversationId(id); setView("chat"); }}
                        onCreated={(id) => { setActiveConversationId(id); setView("chat"); bumpList(); }}
                        listVersion={listVersion}
                        archiveMode
                        flat
                      />
                    </section>
                  </div>
                </div>
              </div>
            )}
            {effectiveView === "settings" && <SettingsView />}
            {effectiveView === "offline" && <OfflineView />}
            {effectiveView === "admin" && isAdmin && <AdminView user={user} />}
          </div>
        </main>
      </div>
    </div>
  );
}

export function BrandMark({ compact }: { compact?: boolean }) {
  const t = useT();
  return (
    <div className="flex items-center gap-2.5 select-none">
      <div className="relative h-8 w-8 rounded-lg bg-card afg-glow-ring grid place-items-center overflow-hidden">
        <div className="absolute inset-0 afg-core" aria-hidden />
        <Bot className="relative h-4.5 w-4.5 text-primary" aria-hidden />
      </div>
      {!compact && (
        <div className="leading-tight">
          <div className="font-bold tracking-tight afg-gradient-text text-lg">{t.meta.appName}</div>
          <div className="text-[11px] text-muted-foreground">{t.meta.tagline}</div>
        </div>
      )}
      {compact && <div className="font-bold tracking-tight afg-gradient-text">{t.meta.appName}</div>}
    </div>
  );
}

function BootScreen({ appName, tagline }: { appName: string; tagline: string }) {
  return (
    <div className="min-h-screen grid place-items-center bg-background afg-grid-bg">
      <div className="flex flex-col items-center gap-6" role="status" aria-live="polite">
        <div className="relative h-28 w-28">
          <div className="absolute inset-0 rounded-full border border-primary/25 afg-orbit" style={{ borderTopColor: "var(--afg-cyan)" }} />
          <div className="absolute inset-3 rounded-full afg-core" aria-hidden />
          <div className="absolute inset-0 grid place-items-center">
            <Loader2 className="h-6 w-6 text-primary afg-orbit" style={{ animationDuration: "2.5s" }} />
          </div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold afg-gradient-text tracking-tight">{appName}</div>
          <div className="text-sm text-muted-foreground mt-1">{tagline}</div>
        </div>
      </div>
    </div>
  );
}
