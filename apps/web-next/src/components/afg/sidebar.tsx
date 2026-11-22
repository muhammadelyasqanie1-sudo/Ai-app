"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, Archive, ArchiveRestore, Pencil, Trash2, MessageSquare, Loader2, Share2, LinkIcon, Download } from "lucide-react";
import { api, ApiClientError } from "./api-client";
import { useT, useSession } from "./providers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export type ConversationSummary = {
  id: string;
  title: string;
  modelSlug: string;
  archived: boolean;
  shareId: string | null;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
  preview: string;
};

type SidebarProps = {
  activeId: string | null;
  onActivate: (id: string) => void;
  onCreated: (id: string) => void;
  listVersion: number;
  archiveMode: boolean;
  flat?: boolean;
};

function groupByDate(items: ConversationSummary[]): { label: string; items: ConversationSummary[] }[] {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86400_000;
  const groups: Record<string, ConversationSummary[]> = { today: [], yesterday: [], earlier: [] };
  for (const c of items) {
    const ts = new Date(c.updatedAt).getTime();
    if (ts >= startOfToday) groups.today.push(c);
    else if (ts >= startOfYesterday) groups.yesterday.push(c);
    else groups.earlier.push(c);
  }
  return [
    { label: "today", items: groups.today },
    { label: "yesterday", items: groups.yesterday },
    { label: "earlier", items: groups.earlier },
  ].filter((g) => g.items.length > 0);
}

export function Sidebar({ activeId, onActivate, onCreated, listVersion, archiveMode, flat }: SidebarProps) {
  const t = useT();
  const { refresh } = useSession();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const debouncedQuery = useDebounce(query, 250);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ conversations: ConversationSummary[] }>(
        `/api/conversations?archived=${archiveMode}${debouncedQuery ? `&q=${encodeURIComponent(debouncedQuery)}` : ""}`
      );
      setConversations(res.conversations);
    } catch {
      // keep previous list on transient errors
    } finally {
      setLoading(false);
    }
  }, [archiveMode, debouncedQuery]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load, listVersion]);

  const newChat = async () => {
    try {
      const res = await api.post<{ conversation: ConversationSummary }>("/api/conversations", {});
      onCreated(res.conversation.id);
    } catch {
      toast({ title: t.errors.generic, variant: "destructive" });
    }
  };

  const rename = async (id: string) => {
    const title = renameValue.trim();
    setRenamingId(null);
    if (!title) return;
    try {
      await api.patch(`/api/conversations/${id}`, { title });
      toast({ title: t.chat.renamed });
      load();
    } catch {
      toast({ title: t.errors.generic, variant: "destructive" });
    }
  };

  const toggleArchive = async (c: ConversationSummary) => {
    try {
      await api.patch(`/api/conversations/${c.id}`, { archived: !c.archived });
      toast({ title: c.archived ? t.chat.unarchivedDone : t.chat.archivedDone });
      load();
    } catch {
      toast({ title: t.errors.generic, variant: "destructive" });
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm(t.nav.deleteConfirm)) return;
    try {
      await api.delete(`/api/conversations/${id}`);
      toast({ title: t.chat.deleted });
      load();
    } catch {
      toast({ title: t.errors.generic, variant: "destructive" });
    }
  };

  const share = async (c: ConversationSummary) => {
    try {
      if (c.shareId) {
        await api.patch(`/api/conversations/${c.id}`, { share: "disable" });
        toast({ title: t.nav.shareDisabled });
      } else {
        await api.patch(`/api/conversations/${c.id}`, { share: "enable" });
        const res = await api.get<{ conversation: { shareId: string | null } }>(`/api/conversations/${c.id}`);
        if (res.conversation.shareId) {
          const url = `${window.location.origin}/?share=${encodeURIComponent(res.conversation.shareId)}`;
          await navigator.clipboard.writeText(url).catch(() => null);
          toast({ title: t.nav.linkCopied, description: url });
        }
      }
      load();
    } catch {
      toast({ title: t.errors.generic, variant: "destructive" });
    }
  };

  const exportChat = async (c: ConversationSummary, format: "md" | "json") => {
    try {
      const detail = await api.get<{ conversation: ConversationSummary & { systemPrompt?: string }; messages: { role: string; content: string; modelSlug?: string; createdAt: string; toolName?: string }[] }>(`/api/conversations/${c.id}`);
      let blob: Blob;
      if (format === "json") {
        blob = new Blob([JSON.stringify(detail, null, 2)], { type: "application/json" });
      } else {
        const md = [
          `# ${detail.conversation.title}`,
          ``,
          `_${new Date(detail.conversation.createdAt).toLocaleString()} — AFG AI_`,
          ``,
          ...detail.messages.map((m) => `## ${m.role === "user" ? t.chat.you : t.chat.assistantLabel}\n\n${m.content}\n`),
        ].join("\n");
        blob = new Blob([md], { type: "text/markdown" });
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${c.title.replace(/[^\w\- ]+/g, "_").slice(0, 60) || "conversation"}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: t.chat.exported });
    } catch {
      toast({ title: t.errors.generic, variant: "destructive" });
    }
  };

  const groups = useMemo(() => groupByDate(conversations), [conversations]);

  return (
    <div className={cn("flex flex-col min-h-0 flex-1", flat && "border rounded-lg bg-card")}>
      <div className="p-3 space-y-2">
        <Button className="w-full justify-start" onClick={newChat}>
          <Plus className="h-4 w-4" />
          <span className="ms-2">{t.nav.newChat}</span>
        </Button>
        <div className="relative">
          <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.nav.searchChats}
            className="ps-8 h-9"
            aria-label={t.nav.searchChats}
          />
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0 px-2 pb-3 afg-scroll">
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : conversations.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8 px-2">
            {archiveMode ? t.nav.emptyArchive : debouncedQuery ? t.nav.noResults : t.nav.emptyChats}
          </p>
        ) : (
          <nav className="space-y-4" aria-label={t.nav.chats}>
            {groups.map((g) => (
              <div key={g.label}>
                <div className="px-2 py-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {g.label === "today" ? t.common.today : g.label === "yesterday" ? t.common.yesterday : t.common.all}
                </div>
                <ul className="space-y-0.5">
                  {g.items.map((c) => (
                    <li key={c.id}>
                      {renamingId === c.id ? (
                        <Input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={() => rename(c.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") rename(c.id);
                            if (e.key === "Escape") setRenamingId(null);
                          }}
                          className="h-8"
                          aria-label={t.nav.rename}
                        />
                      ) : (
                        <div
                          className={cn(
                            "group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm cursor-pointer",
                            activeId === c.id && !archiveMode
                              ? "bg-primary/12 text-primary"
                              : "hover:bg-accent text-foreground/90"
                          )}
                          role="button"
                          tabIndex={0}
                          onClick={() => onActivate(c.id)}
                          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onActivate(c.id)}
                        >
                          <MessageSquare className="h-4 w-4 shrink-0 opacity-70" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium leading-tight">{c.title}</div>
                            {c.preview && <div className="truncate text-xs text-muted-foreground leading-tight mt-0.5">{c.preview}</div>}
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100"
                                aria-label={t.common.more}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <span className="text-lg leading-none">⋯</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                              <DropdownMenuItem onClick={() => { setRenamingId(c.id); setRenameValue(c.title); }}>
                                <Pencil className="h-4 w-4" /> {t.nav.rename}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => toggleArchive(c)}>
                                {c.archived ? <><ArchiveRestore className="h-4 w-4" /> {t.chat.unarchivedDone.split(" ").slice(0, 2).join(" ")}</> : <><Archive className="h-4 w-4" /> {t.nav.archive}</>}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => exportChat(c, "md")}>
                                <Download className="h-4 w-4" /> {t.chat.exportMd}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => exportChat(c, "json")}>
                                <Download className="h-4 w-4" /> {t.chat.exportJson}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => share(c)}>
                                {c.shareId ? <><LinkIcon className="h-4 w-4" /> {t.nav.shareDisabled}</> : <><Share2 className="h-4 w-4" /> {t.nav.shareChat}</>}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => remove(c.id)}>
                                <Trash2 className="h-4 w-4" /> {t.nav.deleteChat}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        )}
      </ScrollArea>
    </div>
  );
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDebounced(value), delay);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [value, delay]);
  return debounced;
}
