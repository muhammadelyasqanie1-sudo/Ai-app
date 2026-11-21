"use client";

import React, { useEffect, useState } from "react";
import { WifiOff, HardDrive, Trash2, Download, Cloud, Package, RefreshCw } from "lucide-react";
import { useT } from "./providers";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

type CachedChat = { id: string; title: string; savedAt: string; messages: number };

/** Cache recent chats into localStorage so they survive offline reloads. */
export function cacheConversationOffline(id: string, title: string, messages: unknown[]) {
  try {
    const store = getOfflineStore();
    store[id] = { title, savedAt: new Date().toISOString(), messages: messages.slice(-40) };
    // Cap store at 20 conversations
    const keys = Object.keys(store);
    if (keys.length > 20) {
      keys.sort((a, b) => (store[a].savedAt < store[b].savedAt ? -1 : 1));
      delete store[keys[0]];
    }
    localStorage.setItem("afg_offline_chats", JSON.stringify(store));
  } catch { /* storage full or unavailable */ }
}

type OfflineEntry = { title: string; savedAt: string; messages: unknown[] };

function getOfflineStore(): Record<string, OfflineEntry> {
  try {
    return JSON.parse(localStorage.getItem("afg_offline_chats") || "{}");
  } catch {
    return {};
  }
}

export function OfflineView() {
  const t = useT();
  const [chats, setChats] = useState<CachedChat[]>([]);
  const [bytes, setBytes] = useState<number | null>(null);
  const [quota, setQuota] = useState<{ usage: number; quota: number } | null>(null);
  const [online, setOnline] = useState(true);
  const [installable, setInstallable] = useState(false);

  useEffect(() => {
    (async () => {
      const store = getOfflineStore();
      setChats(Object.entries(store).map(([id, v]) => ({ id, title: v.title, savedAt: v.savedAt, messages: v.messages.length })));
      setBytes(localStorage.getItem("afg_offline_chats")?.length || 0);
      if (navigator.storage?.estimate) {
        navigator.storage.estimate().then((est) => setQuota({ usage: est.usage || 0, quota: est.quota || 0 })).catch(() => undefined);
      }
      setOnline(navigator.onLine);
    })();
    const on = () => { setOnline(true); toast({ title: t.offline.sync }); };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    (async () => {
      setInstallable(!!(window as unknown as { deferredPrompt?: unknown }).deferredPrompt);
    })();
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [t.offline.sync]);

  const clearCache = () => {
    localStorage.removeItem("afg_offline_chats");
    setChats([]);
    setBytes(0);
    toast({ title: t.offline.cacheCleared });
  };

  const fmtBytes = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

  return (
    <div className="h-full overflow-y-auto afg-scroll">
      <div className="max-w-2xl mx-auto p-4 sm:p-6 pb-16 space-y-5">
        <div className="flex items-center gap-3">
          <div className={online ? "h-10 w-10 rounded-xl bg-primary/10 grid place-items-center border border-primary/30" : "h-10 w-10 rounded-xl bg-destructive/10 grid place-items-center border border-destructive/30"}>
            <WifiOff className={online ? "h-5 w-5 text-primary" : "h-5 w-5 text-destructive"} />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{t.offline.title}</h1>
            <p className="text-sm text-muted-foreground">{t.offline.subtitle}</p>
          </div>
        </div>

        {!online && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {t.offline.airplaneMode}
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2 text-sm font-medium"><Cloud className="h-4 w-4 text-primary" />{t.offline.cachedChats}</div>
            <div className="text-2xl font-bold tabular-nums mt-1">{chats.length}</div>
            <div className="text-xs text-muted-foreground">{fmtBytes(bytes || 0)}</div>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2 text-sm font-medium"><HardDrive className="h-4 w-4 text-primary" />{t.offline.storageUsed}</div>
            <div className="text-2xl font-bold tabular-nums mt-1">{quota ? fmtBytes(quota.usage) : "—"}</div>
            <div className="text-xs text-muted-foreground">{quota ? `${t.common.all}: ${fmtBytes(quota.quota)}` : ""}</div>
          </div>
        </div>

        <div className="rounded-lg border bg-card divide-y">
          {chats.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">{t.offline.cacheHint}</div>
          ) : chats.map((c) => (
            <div key={c.id} className="flex items-center justify-between p-3 text-sm">
              <div className="min-w-0">
                <div className="font-medium truncate">{c.title}</div>
                <div className="text-xs text-muted-foreground">{c.messages} messages · {new Date(c.savedAt).toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={clearCache} disabled={chats.length === 0}>
            <Trash2 className="h-4 w-4" /><span className="ms-1.5">{t.offline.clearCache}</span>
          </Button>
          {installable && (
            <Button onClick={() => (window as unknown as { deferredPrompt?: { prompt: () => void } }).deferredPrompt?.prompt()}>
              <Download className="h-4 w-4" /><span className="ms-1.5">{t.offline.installPwa}</span>
            </Button>
          )}
        </div>

        <div className="rounded-lg border bg-card p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium"><Package className="h-4 w-4 text-primary" />{t.offline.modelCatalog}</div>
          <p className="text-sm text-muted-foreground">{t.offline.modelCatalogHint}</p>
          <p className="text-xs text-[var(--afg-amber)] flex items-center gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />{t.offline.noOfflineSupport}
          </p>
        </div>
      </div>
    </div>
  );
}
