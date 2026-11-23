"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard, Users, Plug, Boxes, Activity, Bug, ScrollText, ToggleLeft,
  Megaphone, HeartPulse, Loader2, RefreshCw, Plus, Trash2, Search, CheckCircle2,
  XCircle, AlertTriangle, Sparkles, Lock, Globe,
} from "lucide-react";
import { api, ApiClientError } from "../api-client";
import { useT } from "../providers";
import type { SafeUser } from "@/lib/afg/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type ProviderRow = {
  id: string; slug: string; name: string; kind: string; baseUrl: string | null;
  enabled: boolean; healthStatus: string; healthDetail: string | null;
  lastCheckedAt: string | null; hasKey: boolean; keyMask: string | null;
  models: { id: string; slug: string; displayName: string; capabilities: string[]; enabled: boolean; contextWindow: number }[];
};

const HEALTH_STYLES: Record<string, string> = {
  HEALTHY: "text-emerald-600 dark:text-emerald-400",
  DEGRADED: "text-[var(--afg-amber)]",
  UNREACHABLE: "text-destructive",
  DISABLED: "text-muted-foreground",
  UNKNOWN: "text-muted-foreground",
};

function HealthDot({ status }: { status: string }) {
  return (
    <span className="inline-flex items-center gap-1.5" title={status}>
      {status === "HEALTHY" ? <CheckCircle2 className={cn("h-4 w-4", HEALTH_STYLES[status])} />
        : status === "DEGRADED" ? <AlertTriangle className={cn("h-4 w-4", HEALTH_STYLES[status])} />
        : status === "UNREACHABLE" ? <XCircle className={cn("h-4 w-4", HEALTH_STYLES[status])} />
        : <span className={cn("h-2 w-2 rounded-full bg-current opacity-50", HEALTH_STYLES[status])} />}
      <span className="text-xs">{status}</span>
    </span>
  );
}

export function AdminView({ user }: { user: SafeUser }) {
  const t = useT();
  const isAdmin = user.role === "ADMIN";
  const perms = new Set(user.permissions);

  const can = (section: string, write = false) => {
    if (isAdmin) return true;
    const map: Record<string, [string, string]> = {
      stats: ["usage.read", "usage.read"],
      users: ["users.read", "users.write"],
      providers: ["providers.read", "providers.write"],
      models: ["providers.read", "models.write"],
      usage: ["usage.read", "usage.read"],
      errors: ["errors.read", "errors.read"],
      audit: ["audit.read", "audit.read"],
      flags: ["flags.write", "flags.write"],
      announcements: ["announcements.write", "announcements.write"],
      health: ["health.read", "health.read"],
    };
    const [read, write2] = map[section] || ["", ""];
    return write ? perms.has(write2) : perms.has(read);
  };

  const visibleTabs = [
    { id: "dashboard", label: t.admin.dashboard, icon: <LayoutDashboard className="h-4 w-4" />, visible: can("stats") },
    { id: "users", label: t.admin.users, icon: <Users className="h-4 w-4" />, visible: can("users") },
    { id: "providers", label: t.admin.providers, icon: <Plug className="h-4 w-4" />, visible: can("providers") },
    { id: "models", label: t.admin.models, icon: <Boxes className="h-4 w-4" />, visible: can("models") },
    { id: "usage", label: t.admin.usage, icon: <Activity className="h-4 w-4" />, visible: can("usage") },
    { id: "errors", label: t.admin.errors, icon: <Bug className="h-4 w-4" />, visible: can("errors") },
    { id: "audit", label: t.admin.audit, icon: <ScrollText className="h-4 w-4" />, visible: can("audit") },
    { id: "flags", label: t.admin.flags, icon: <ToggleLeft className="h-4 w-4" />, visible: can("flags") },
    { id: "announcements", label: t.admin.announcements, icon: <Megaphone className="h-4 w-4" />, visible: can("announcements") },
    { id: "health", label: t.admin.health, icon: <HeartPulse className="h-4 w-4" />, visible: can("health") },
  ].filter((x) => x.visible);

  return (
    <div className="h-full overflow-y-auto afg-scroll">
      <div className="max-w-6xl mx-auto p-4 sm:p-6 pb-16">
        <div className="flex items-center gap-3 mb-5">
          <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/30 grid place-items-center">
            <Lock className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{t.admin.title}</h1>
            <p className="text-sm text-muted-foreground">{user.role === "ADMIN" ? "Administrator" : "Staff"} · {user.email || user.name}</p>
          </div>
        </div>

        {visibleTabs.length === 0 ? (
          <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">{t.admin.noAccess}</div>
        ) : (
          <Tabs defaultValue={visibleTabs[0].id}>
            <TabsList className="mb-4 flex-wrap h-auto">
              {visibleTabs.map((x) => (
                <TabsTrigger key={x.id} value={x.id}>
                  {x.icon}<span className="ms-1.5">{x.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
            {can("stats") && <DashboardTab />}
            {can("users") && <UsersTab canWrite={can("users", true)} />}
            {can("providers") && <ProvidersTab canWrite={can("providers", true)} />}
            {can("models") && <ModelsTab canWrite={can("models", true)} />}
            {can("usage") && <UsageTab />}
            {can("errors") && <ErrorsTab />}
            {can("audit") && <AuditTab />}
            {can("flags") && <FlagsTab />}
            {can("announcements") && <AnnouncementsTab />}
            {can("health") && <HealthTab isAdmin={isAdmin} />}
          </Tabs>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

function DashboardTab() {
  const t = useT();
  const [stats, setStats] = useState<{
    totals: Record<string, number>;
    usageByDay: { kind: string; count: number; tokensIn: number; tokensOut: number }[];
    topModels: { model: string; count: number }[];
    providers: { slug: string; name: string; enabled: boolean; healthStatus: string }[];
  } | null>(null);

  const load = useCallback(() => {
    api.get<NonNullable<typeof stats>>("/api/admin/stats").then(setStats).catch(() => undefined);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!stats) return <Spinner />;
  const cards = [
    { label: t.admin.totalUsers, value: stats.totals.totalUsers },
    { label: t.admin.activeUsers, value: stats.totals.activeUsers },
    { label: t.admin.guests, value: stats.totals.guests },
    { label: t.admin.conversations, value: stats.totals.conversations },
    { label: t.admin.messages, value: stats.totals.messages },
    { label: t.admin.chatsToday, value: stats.totals.chatToday },
    { label: t.admin.errorsToday, value: stats.totals.errorsToday },
    { label: t.admin.activeModels, value: stats.totals.activeModels },
  ];
  return (
    <TabsContent value="dashboard" className="mt-0 space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg border bg-card p-4">
            <div className="text-2xl font-bold tabular-nums">{c.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{c.label}</div>
          </div>
        ))}
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-lg border bg-card p-4">
          <h3 className="font-semibold mb-3 text-sm">{t.admin.usage} (7d)</h3>
          {stats.usageByDay.length === 0 ? <p className="text-sm text-muted-foreground">{t.tools.noResults}</p> : (
            <ul className="space-y-2">
              {stats.usageByDay.map((u) => (
                <li key={u.kind} className="flex items-center justify-between text-sm">
                  <span className="capitalize">{u.kind}</span>
                  <span className="tabular-nums text-muted-foreground">{u.count} · {(u.tokensIn + u.tokensOut).toLocaleString()} tok</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-lg border bg-card p-4">
          <h3 className="font-semibold mb-3 text-sm">{t.admin.model} — top</h3>
          {stats.topModels.length === 0 ? <p className="text-sm text-muted-foreground">{t.tools.noResults}</p> : (
            <ul className="space-y-2">
              {stats.topModels.map((m) => (
                <li key={m.model} className="flex items-center justify-between text-sm gap-2" dir="ltr">
                  <span className="truncate font-mono text-xs">{m.model}</span>
                  <span className="tabular-nums text-muted-foreground">{m.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="rounded-lg border bg-card p-4">
        <h3 className="font-semibold mb-3 text-sm">{t.admin.providers}</h3>
        <div className="space-y-2">
          {stats.providers.map((p) => (
            <div key={p.slug} className="flex items-center justify-between text-sm">
              <span className="font-medium">{p.name}</span>
              <HealthDot status={p.enabled ? p.healthStatus : "DISABLED"} />
            </div>
          ))}
        </div>
      </div>
    </TabsContent>
  );
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

function UsersTab({ canWrite }: { canWrite: boolean }) {
  const t = useT();
  const [users, setUsers] = useState<(SafeUser & { lastSeenAt: string | null })[]>([]);
  const [catalog, setCatalog] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.get<{ users: (SafeUser & { lastSeenAt: string | null })[]; permissionsCatalog: string[] }>(`/api/admin/users${q ? `?q=${encodeURIComponent(q)}` : ""}`)
      .then((res) => { setUsers(res.users); setCatalog(res.permissionsCatalog); })
      .finally(() => setLoading(false));
  }, [q]);
  useEffect(() => { const id = setTimeout(load, q ? 300 : 0); return () => clearTimeout(id); }, [load, q]);

  const update = async (id: string, patch: Record<string, unknown>, successMsg: string) => {
    try {
      await api.patch(`/api/admin/users/${id}`, patch);
      toast({ title: successMsg });
      load();
    } catch (err) {
      toast({ title: err instanceof ApiClientError ? err.message : t.errors.generic, variant: "destructive" });
    }
  };

  const removeUser = async (id: string) => {
    if (!window.confirm(t.admin.deleteUserConfirm)) return;
    try {
      await api.delete(`/api/admin/users/${id}`);
      toast({ title: t.common.success });
      load();
    } catch (err) {
      toast({ title: err instanceof ApiClientError ? err.message : t.errors.generic, variant: "destructive" });
    }
  };

  return (
    <TabsContent value="users" className="mt-0 space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.common.search} className="ps-8" />
      </div>
      <div className="rounded-lg border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.admin.actor}</TableHead>
              <TableHead>{t.admin.role}</TableHead>
              <TableHead>{t.admin.status}</TableHead>
              <TableHead className="hidden md:table-cell">{t.admin.lastSeen}</TableHead>
              <TableHead className="hidden lg:table-cell">{t.admin.joined}</TableHead>
              {canWrite && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6}><Spinner /></TableCell></TableRow>
            ) : users.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <div className="font-medium">{u.name || "—"}</div>
                  <div className="text-xs text-muted-foreground" dir="ltr">{u.email || (u.isGuest ? "guest" : "—")}</div>
                </TableCell>
                <TableCell>
                  <Select disabled={!canWrite} value={u.role} onValueChange={(v) => update(u.id, { role: v }, t.admin.roleChanged)}>
                    <SelectTrigger size="sm" className="h-8 w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USER">USER</SelectItem>
                      <SelectItem value="STAFF">STAFF</SelectItem>
                      <SelectItem value="ADMIN">ADMIN</SelectItem>
                    </SelectContent>
                  </Select>
                  {u.role === "STAFF" && u.permissions.length > 0 && (
                    <div className="text-[10px] text-muted-foreground mt-1">{u.permissions.length} perms</div>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={u.status === "ACTIVE" ? "secondary" : "destructive"}>{u.status}</Badge>
                </TableCell>
                <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                  {u.lastSeenAt ? new Date(u.lastSeenAt).toLocaleString() : t.common.never}
                </TableCell>
                <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">{new Date(u.createdAt).toLocaleDateString()}</TableCell>
                {canWrite && (
                  <TableCell className="text-end">
                    <div className="flex gap-1 justify-end">
                      {u.role === "STAFF" && (
                        <PermissionsPopover catalog={catalog} value={u.permissions}
                          onSave={(perms2) => update(u.id, { permissions: perms2 }, t.admin.roleChanged)} />
                      )}
                      {u.status === "ACTIVE" ? (
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => update(u.id, { status: "SUSPENDED" }, t.admin.statusChanged)}>
                          {t.admin.suspend}
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => update(u.id, { status: "ACTIVE" }, t.admin.statusChanged)}>
                          {t.admin.activate}
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeUser(u.id)} aria-label={t.admin.deleteUser}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </TabsContent>
  );
}

function PermissionsPopover({ catalog, value, onSave }: { catalog: string[]; value: string[]; onSave: (perms: string[]) => void }) {
  const t = useT();
  const [perms, setPerms] = useState<string[]>(value);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 text-xs">{t.admin.permissions}</Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 max-h-80 overflow-y-auto afg-scroll" align="end">
        <div className="space-y-2">
          {catalog.map((p) => (
            <label key={p} className="flex items-center justify-between text-xs" dir="ltr">
              <span className="font-mono">{p}</span>
              <Switch checked={perms.includes(p)} onCheckedChange={(v) => setPerms((prev) => (v ? [...prev, p] : prev.filter((x) => x !== p)))} />
            </label>
          ))}
          <Button size="sm" className="w-full" onClick={() => onSave(perms)}>{t.common.save}</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

function ProvidersTab({ canWrite }: { canWrite: boolean }) {
  const t = useT();
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", slug: "", kind: "openai-compatible", baseUrl: "", apiKey: "" });

  const load = useCallback(() => {
    api.get<{ providers: ProviderRow[] }>("/api/admin/providers").then((r) => setProviders(r.providers)).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (id: string, action: "health" | "refresh") => {
    try {
      const res = await api.post<{ ok: boolean; health?: { status: string; detail: string; latencyMs: number }; discovered?: number; catalogError?: string | null }>(`/api/admin/providers/${id}/${action}`);
      if (action === "health") toast({ title: `${t.admin.healthChecked}: ${res.health?.status}`, description: res.health?.detail });
      else toast({ title: t.admin.discovered.replace("{count}", String(res.discovered ?? 0)), description: res.catalogError || undefined });
      load();
    } catch (err) {
      toast({ title: err instanceof ApiClientError ? err.message : t.errors.generic, variant: "destructive" });
    }
  };

  const saveNew = async () => {
    try {
      await api.post("/api/admin/providers", form);
      toast({ title: t.admin.providerSaved });
      setAdding(false);
      setForm({ name: "", slug: "", kind: "openai-compatible", baseUrl: "", apiKey: "" });
      load();
    } catch (err) {
      toast({ title: err instanceof ApiClientError ? err.message : t.errors.generic, variant: "destructive" });
    }
  };

  const updateProvider = async (id: string, patch: Record<string, unknown>) => {
    try {
      await api.patch(`/api/admin/providers/${id}`, patch);
      toast({ title: t.admin.providerSaved });
      load();
    } catch (err) {
      toast({ title: err instanceof ApiClientError ? err.message : t.errors.generic, variant: "destructive" });
    }
  };

  const removeProvider = async (id: string) => {
    try {
      await api.delete(`/api/admin/providers/${id}`);
      toast({ title: t.admin.providerDeleted });
      load();
    } catch (err) {
      toast({ title: err instanceof ApiClientError ? err.message : t.errors.generic, variant: "destructive" });
    }
  };

  if (loading) return <Spinner />;

  return (
    <TabsContent value="providers" className="mt-0 space-y-4">
      {canWrite && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setAdding((v) => !v)}>
            <Plus className="h-4 w-4" /><span className="ms-1.5">{t.admin.addProvider}</span>
          </Button>
        </div>
      )}
      {adding && canWrite && (
        <div className="rounded-lg border bg-card p-4 space-y-3 afg-fade-up">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>{t.admin.providerName}</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>{t.admin.providerSlug}</Label><Input dir="ltr" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })} placeholder="my-gateway" /></div>
            <div className="space-y-1.5">
              <Label>{t.admin.providerKind}</Label>
              <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai-compatible">OpenAI-compatible</SelectItem>
                  <SelectItem value="ollama">Ollama</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>{t.admin.providerBaseUrl}</Label><Input dir="ltr" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="https://gateway.example.com/v1" /></div>
          </div>
          <div className="space-y-1.5">
            <Label>{t.admin.providerApiKey} <span className="text-muted-foreground">({t.common.optional})</span></Label>
            <Input dir="ltr" type="password" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} />
            <p className="text-xs text-muted-foreground">{t.admin.providerApiKeyHint}</p>
          </div>
          <Button size="sm" onClick={saveNew} disabled={!form.name || !form.slug || !form.baseUrl}>{t.common.save}</Button>
        </div>
      )}

      <div className="space-y-3">
        {providers.map((p) => (
          <div key={p.id} className="rounded-lg border bg-card p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="font-semibold" dir="ltr">{p.name}</div>
              <Badge variant="outline" className="font-mono text-[10px]" dir="ltr">{p.slug}</Badge>
              <Badge variant="secondary" className="text-[10px]">{p.kind}</Badge>
              <HealthDot status={p.enabled ? p.healthStatus : "DISABLED"} />
              <div className="flex-1" />
              {canWrite && (
                <div className="flex gap-1.5 flex-wrap">
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => act(p.id, "health")}>
                    <HeartPulse className="h-3.5 w-3.5" /><span className="ms-1">{t.admin.checkHealth}</span>
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => act(p.id, "refresh")}>
                    <RefreshCw className="h-3.5 w-3.5" /><span className="ms-1">{t.admin.refreshCatalog}</span>
                  </Button>
                  <Switch checked={p.enabled} onCheckedChange={(v) => updateProvider(p.id, { enabled: v })} aria-label={t.common.enabled} />
                  {p.slug !== "afg-cloud" && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeProvider(p.id)} aria-label={t.admin.providerDeleted}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              )}
            </div>
            <div className="text-xs text-muted-foreground space-y-1" dir="ltr">
              {p.baseUrl && <div className="font-mono truncate">{p.baseUrl}</div>}
              <div className="flex items-center gap-1.5">
                <span>{p.hasKey ? `API key ${p.keyMask}` : "No API key stored"}</span>
              </div>
              {p.healthDetail && <div className="opacity-80">{p.healthDetail}</div>}
              {p.lastCheckedAt && <div>{t.common.loading.replace("…", "")}: — · checked {new Date(p.lastCheckedAt).toLocaleString()}</div>}
            </div>
            <div className="text-xs">
              <span className="text-muted-foreground">{t.admin.discovered.replace("{count}", String(p.models.length))}</span>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {p.models.slice(0, 12).map((m) => (
                  <Badge key={m.slug} variant="outline" className="font-mono text-[10px] font-normal" dir="ltr">{m.displayName}</Badge>
                ))}
                {p.models.length === 0 && <span className="text-muted-foreground">{t.admin.noModels}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </TabsContent>
  );
}

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

function ModelsTab({ canWrite }: { canWrite: boolean }) {
  const t = useT();
  const [models, setModels] = useState<{ id: string; slug: string; displayName: string; providerName: string; capabilities: string[]; enabled: boolean; contextWindow: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    api.get<{ models: typeof models }>("/api/admin/models").then((r) => setModels(r.models)).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const update = async (id: string, patch: Record<string, unknown>) => {
    try {
      await api.patch(`/api/admin/models/${id}`, patch);
      toast({ title: t.admin.modelSaved });
      load();
    } catch {
      toast({ title: t.errors.generic, variant: "destructive" });
    }
  };

  if (loading) return <Spinner />;

  return (
    <TabsContent value="models" className="mt-0">
      <div className="rounded-lg border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.common.displayName}</TableHead>
              <TableHead className="hidden md:table-cell">{t.admin.provider}</TableHead>
              <TableHead>{t.admin.makeDefault}</TableHead>
              <TableHead className="hidden sm:table-cell">ctx</TableHead>
              <TableHead>{t.admin.enabledModels}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {models.map((m) => (
              <TableRow key={m.id}>
                <TableCell>
                  <div className="font-medium text-sm" dir="ltr">{m.displayName}</div>
                  <div className="text-[11px] text-muted-foreground font-mono" dir="ltr">{m.slug}</div>
                </TableCell>
                <TableCell className="hidden md:table-cell text-xs">{m.providerName}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {["chat", "coding", "vision", "reasoning"].map((cap) => {
                      const on = m.capabilities.includes(cap);
                      return canWrite ? (
                        <button key={cap}
                          onClick={() => update(m.id, { capabilities: on ? m.capabilities.filter((c) => c !== cap) : [...m.capabilities, cap] })}
                          className={cn("rounded border px-1.5 py-0.5 text-[10px] font-mono transition-colors", on ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent")}
                          aria-pressed={on}>
                          {cap}
                        </button>
                      ) : (
                        <Badge key={cap} variant="outline" className={cn("text-[10px]", on && "text-primary")}>{cap}</Badge>
                      );
                    })}
                  </div>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  {canWrite ? (
                    <Input className="h-7 w-20 text-xs" type="number" defaultValue={m.contextWindow}
                      onBlur={(e) => { const v = Number(e.target.value); if (v && v !== m.contextWindow) update(m.id, { contextWindow: v }); }} />
                  ) : <span className="text-xs tabular-nums">{m.contextWindow}</span>}
                </TableCell>
                <TableCell>{canWrite ? <Switch checked={m.enabled} onCheckedChange={(v) => update(m.id, { enabled: v })} /> : <Badge variant={m.enabled ? "secondary" : "outline"}>{m.enabled ? t.common.enabled : t.common.disabled}</Badge>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </TabsContent>
  );
}

// ---------------------------------------------------------------------------
// Usage / Errors / Audit (read-only tables)
// ---------------------------------------------------------------------------

function UsageTab() {
  const t = useT();
  const [rows, setRows] = useState<{ id: string; user: string; provider: string; model: string; kind: string; tokensIn: number; tokensOut: number; latencyMs: number; success: boolean; createdAt: string }[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get<{ usage: typeof rows }>("/api/admin/usage").then((r) => setRows(r.usage)).finally(() => setLoading(false));
  }, []);
  if (loading) return <Spinner />;
  return (
    <TabsContent value="usage" className="mt-0">
      <div className="rounded-lg border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.admin.time}</TableHead>
              <TableHead>{t.admin.actor}</TableHead>
              <TableHead>{t.admin.model}</TableHead>
              <TableHead>{t.admin.tokens}</TableHead>
              <TableHead>{t.admin.latency}</TableHead>
              <TableHead>{t.admin.result}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs whitespace-nowrap">{new Date(r.createdAt).toLocaleString()}</TableCell>
                <TableCell className="text-xs" dir="ltr">{r.user}</TableCell>
                <TableCell className="text-xs font-mono" dir="ltr">{r.model}</TableCell>
                <TableCell className="text-xs tabular-nums">{r.tokensIn + r.tokensOut}</TableCell>
                <TableCell className="text-xs tabular-nums">{r.latencyMs}ms</TableCell>
                <TableCell>{r.success ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-destructive" />}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-sm text-muted-foreground text-center py-6">{t.tools.noResults}</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </TabsContent>
  );
}

function ErrorsTab() {
  const t = useT();
  const [rows, setRows] = useState<{ id: string; scope: string; code: string; message: string; createdAt: string }[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get<{ errors: typeof rows }>("/api/admin/errors").then((r) => setRows(r.errors)).finally(() => setLoading(false));
  }, []);
  if (loading) return <Spinner />;
  return (
    <TabsContent value="errors" className="mt-0">
      <div className="rounded-lg border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.admin.time}</TableHead>
              <TableHead>{t.admin.scope}</TableHead>
              <TableHead>{t.admin.code}</TableHead>
              <TableHead>{t.admin.meta}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs whitespace-nowrap">{new Date(r.createdAt).toLocaleString()}</TableCell>
                <TableCell><Badge variant="outline">{r.scope}</Badge></TableCell>
                <TableCell className="text-xs font-mono" dir="ltr">{r.code}</TableCell>
                <TableCell className="text-xs max-w-md"><span className="line-clamp-2">{r.message}</span></TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && <TableRow><TableCell colSpan={4} className="text-sm text-muted-foreground text-center py-6">{t.tools.noResults}</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </TabsContent>
  );
}

function AuditTab() {
  const t = useT();
  const [rows, setRows] = useState<{ id: string; actorEmail: string | null; action: string; target: string | null; ip: string | null; createdAt: string }[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get<{ audit: typeof rows }>("/api/admin/audit").then((r) => setRows(r.audit)).finally(() => setLoading(false));
  }, []);
  if (loading) return <Spinner />;
  return (
    <TabsContent value="audit" className="mt-0">
      <div className="rounded-lg border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.admin.time}</TableHead>
              <TableHead>{t.admin.actor}</TableHead>
              <TableHead>{t.admin.action}</TableHead>
              <TableHead>{t.admin.target}</TableHead>
              <TableHead className="hidden md:table-cell">{t.admin.ip}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs whitespace-nowrap">{new Date(r.createdAt).toLocaleString()}</TableCell>
                <TableCell className="text-xs" dir="ltr">{r.actorEmail || "—"}</TableCell>
                <TableCell className="text-xs font-mono" dir="ltr">{r.action}</TableCell>
                <TableCell className="text-xs font-mono max-w-40 truncate" dir="ltr">{r.target || "—"}</TableCell>
                <TableCell className="hidden md:table-cell text-xs" dir="ltr">{r.ip || "—"}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && <TableRow><TableCell colSpan={5} className="text-sm text-muted-foreground text-center py-6">{t.tools.noResults}</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </TabsContent>
  );
}

// ---------------------------------------------------------------------------
// Flags / Announcements / Health
// ---------------------------------------------------------------------------

function FlagsTab() {
  const t = useT();
  const [flags, setFlags] = useState<{ key: string; enabled: boolean; description: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    api.get<{ flags: typeof flags }>("/api/admin/flags").then((r) => setFlags(r.flags)).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = async (key: string, enabled: boolean) => {
    try {
      await api.patch(`/api/admin/flags/${key}`, { enabled });
      toast({ title: t.admin.flagSaved });
      load();
    } catch {
      toast({ title: t.errors.generic, variant: "destructive" });
    }
  };

  if (loading) return <Spinner />;
  return (
    <TabsContent value="flags" className="mt-0">
      <div className="rounded-lg border bg-card divide-y">
        {flags.map((f) => (
          <div key={f.key} className="flex items-center justify-between p-4 gap-3">
            <div>
              <div className="font-mono text-sm" dir="ltr">{f.key}</div>
              {f.description && <div className="text-xs text-muted-foreground mt-0.5">{f.description}</div>}
            </div>
            <Switch checked={f.enabled} onCheckedChange={(v) => toggle(f.key, v)} />
          </div>
        ))}
        {flags.length === 0 && <div className="p-6 text-sm text-muted-foreground text-center">{t.tools.noResults}</div>}
      </div>
    </TabsContent>
  );
}

function AnnouncementsTab() {
  const t = useT();
  const [items, setItems] = useState<{ id: string; title: string; body: string; level: string; active: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [level, setLevel] = useState("info");

  const load = useCallback(() => {
    api.get<{ announcements: typeof items }>("/api/admin/announcements").then((r) => setItems(r.announcements)).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const publish = async () => {
    try {
      await api.post("/api/admin/announcements", { title, body, level, active: true });
      setTitle(""); setBody("");
      toast({ title: t.admin.published });
      load();
    } catch (err) {
      toast({ title: err instanceof ApiClientError ? err.message : t.errors.generic, variant: "destructive" });
    }
  };

  const toggleActive = async (id: string, active: boolean) => {
    await api.patch(`/api/admin/announcements/${id}`, { active }).catch(() => null);
    load();
  };

  const remove = async (id: string) => {
    await api.delete(`/api/admin/announcements/${id}`).catch(() => null);
    load();
  };

  if (loading) return <Spinner />;
  return (
    <TabsContent value="announcements" className="mt-0 space-y-4">
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <h3 className="font-semibold text-sm">{t.admin.newAnnouncement}</h3>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t.admin.announcementTitle} />
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={t.admin.announcementBody} className="min-h-16" />
        <div className="flex gap-2 items-end">
          <Select value={level} onValueChange={setLevel}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="info">{t.admin.levelInfo}</SelectItem>
              <SelectItem value="warning">{t.admin.levelWarning}</SelectItem>
              <SelectItem value="critical">{t.admin.levelCritical}</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={publish} disabled={!title || !body}><Megaphone className="h-4 w-4" /><span className="ms-1.5">{t.common.send}</span></Button>
        </div>
      </div>
      <div className="space-y-2">
        {items.map((a) => (
          <div key={a.id} className="rounded-lg border bg-card p-3 flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{a.title}</span>
                <Badge variant={a.level === "critical" ? "destructive" : a.level === "warning" ? "secondary" : "outline"}>{a.level}</Badge>
                {!a.active && <Badge variant="outline">{t.common.disabled}</Badge>}
              </div>
              <p className="text-sm text-muted-foreground mt-1">{a.body}</p>
            </div>
            <Switch checked={a.active} onCheckedChange={(v) => toggleActive(a.id, v)} aria-label={t.common.enabled} />
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => remove(a.id)} aria-label={t.common.delete}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">{t.tools.noResults}</p>}
      </div>
    </TabsContent>
  );
}

function HealthTab({ isAdmin }: { isAdmin: boolean }) {
  const t = useT();
  const [health, setHealth] = useState<{
    database: { ok: boolean; latencyMs: number };
    uptimeSeconds: number; memoryMb: number; nodeVersion: string;
    providers: { slug: string; healthStatus: string; enabled: boolean; lastCheckedAt: string | null }[];
    expiredSessions: number; emailConfigured: boolean; googleConfigured: boolean; devCodes: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get<NonNullable<typeof health>>("/api/admin/system-health").then(setHealth).catch(() => undefined);
  }, []);
  useEffect(() => { load(); }, [load]);

  const prune = async () => {
    setBusy(true);
    try {
      await api.post("/api/admin/system-health/prune");
      toast({ title: t.admin.pruned });
      load();
    } finally {
      setBusy(false);
    }
  };

  if (!health) return <Spinner />;
  return (
    <TabsContent value="health" className="mt-0 space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border bg-card p-4">
          <div className={cn("text-lg font-bold", health.database.ok ? "text-emerald-600" : "text-destructive")}>
            {health.database.ok ? t.common.healthy : t.common.unreachable}
          </div>
          <div className="text-xs text-muted-foreground mt-1">{t.admin.dbLatency}: {health.database.latencyMs}ms</div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-lg font-bold tabular-nums">{Math.floor(health.uptimeSeconds / 3600)}h {Math.floor((health.uptimeSeconds % 3600) / 60)}m</div>
          <div className="text-xs text-muted-foreground mt-1">{t.admin.uptime}</div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-lg font-bold tabular-nums">{health.memoryMb} MB</div>
          <div className="text-xs text-muted-foreground mt-1">{t.admin.memory}</div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-lg font-bold font-mono" dir="ltr">{health.nodeVersion}</div>
          <div className="text-xs text-muted-foreground mt-1">Node.js</div>
        </div>
      </div>

      <div className="rounded-lg border bg-card divide-y">
        {health.providers.map((p) => (
          <div key={p.slug} className="flex items-center justify-between p-3 text-sm">
            <span className="font-mono" dir="ltr">{p.slug}</span>
            <HealthDot status={p.enabled ? p.healthStatus : "DISABLED"} />
          </div>
        ))}
      </div>

      <div className="rounded-lg border bg-card p-4 space-y-2 text-sm">
        <div className="flex items-center gap-2"><Globe className="h-4 w-4 text-muted-foreground" />
          Email delivery: {health.emailConfigured ? t.common.enabled : t.common.disabled}
        </div>
        <div className="flex items-center gap-2"><Users className="h-4 w-4 text-muted-foreground" />
          Google sign-in: {health.googleConfigured ? t.common.enabled : t.common.disabled}
        </div>
        {health.devCodes && (
          <div className="flex items-center gap-2 text-[var(--afg-amber)]"><AlertTriangle className="h-4 w-4" />
            {t.admin.emailDeliveryNote}
          </div>
        )}
        <div>Expired sessions: {health.expiredSessions}</div>
        {isAdmin && (
          <Button size="sm" variant="outline" onClick={prune} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            <span className="ms-1.5">{t.admin.runPrune}</span>
          </Button>
        )}
      </div>
    </TabsContent>
  );
}

function Spinner() {
  return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
}
