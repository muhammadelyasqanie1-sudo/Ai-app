"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Send, Square, Paperclip, Mic, MicOff, Globe, BrainCircuit, RotateCcw, Pencil, Copy,
  Volume2, VolumeX, X, ChevronDown, Sparkles, ImageIcon, TableIcon, Calculator, FileText, Loader2, Check, CircleAlert,
} from "lucide-react";
import { api, streamChat, ChatStreamEvent, ApiClientError } from "../api-client";
import { useT, useSession } from "../providers";
import { Markdown } from "../markdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type ChatModel = {
  slug: string;
  displayName: string;
  providerSlug: string;
  providerName: string;
  providerKind: string;
  providerHealth: string;
  capabilities: string[];
  contextWindow: number;
};

type AttachmentMeta = { id: string; filename: string; mimetype: string; size: number; kind: string };

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  modelSlug?: string | null;
  status?: string;
  error?: string | null;
  toolName?: string | null;
  toolPayload?: { tool?: string; imageBase64?: string; prompt?: string; results?: { title: string; url: string; snippet: string; host?: string; date?: string }[] } | null;
  attachments?: AttachmentMeta[];
  createdAt: string;
  streaming?: boolean;
};

export function ChatView({
  conversationId,
  onConversationCreated,
  onConversationsChanged,
  onArchive,
}: {
  conversationId: string | null;
  onConversationCreated: (id: string) => void;
  onConversationsChanged: () => void;
  onArchive: () => void;
}) {
  const t = useT();
  const { bootstrap } = useSession();
  const flags = bootstrap?.flags || {};
  const userLocale = bootstrap?.user?.locale || (typeof localStorage !== "undefined" ? localStorage.getItem("afg_locale") : null) || "en";
  const speechLang = ({ en: "en-US", fa: "fa-IR", ps: "ps-AF", ar: "ar-SA" } as Record<string, string>)[userLocale] || "en-US";

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [convTitle, setConvTitle] = useState("");
  const [convSystemPrompt, setConvSystemPrompt] = useState<string | null>(null);
  const [convMemory, setConvMemory] = useState(true);
  const [convModel, setConvModel] = useState("afg-cloud-chat");
  const [models, setModels] = useState<ChatModel[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [statusNote, setStatusNote] = useState<{ kind: "tool" | "fallback" | "error"; text: string; tool?: string } | null>(null);
  const [webSearchOn, setWebSearchOn] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentMeta[]>([]);
  const [uploading, setUploading] = useState(false);
  const [listening, setListening] = useState(false);
  const [ttsOn, setTtsOn] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [loadingConv, setLoadingConv] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Load models
  useEffect(() => {
    api.get<{ models: ChatModel[] }>("/api/models")
      .then((res) => {
        setModels(res.models);
        setConvModel((cur) => (res.models.some((m) => m.slug === cur) ? cur : res.models[0]?.slug || cur));
      })
      .catch(() => undefined);
  }, []);

  // Load conversation
  const loadConversation = useCallback(async (id: string) => {
    setLoadingConv(true);
    setLastError(null);
    try {
      const res = await api.get<{
        conversation: { id: string; title: string; modelSlug: string; systemPrompt: string | null; memoryEnabled: boolean; archived: boolean };
        messages: ChatMessage[];
      }>(`/api/conversations/${id}`);
      setConvTitle(res.conversation.title);
      setConvSystemPrompt(res.conversation.systemPrompt);
      setConvMemory(res.conversation.memoryEnabled);
      if (res.conversation.archived) {
        await api.patch(`/api/conversations/${id}`, { archived: false });
      }
      setMessages(res.messages.map((m) => ({ ...m, toolPayload: m.toolPayload || undefined })));
    } catch {
      setMessages([]);
    } finally {
      setLoadingConv(false);
    }
  }, []);

  // Reset transient chat state when leaving a conversation. This is a render-time
  // guard (react.dev/learn/you-might-not-need-an-effect) so no state is set
  // synchronously inside an effect body.
  const [prevConvId, setPrevConvId] = useState<string | null>(conversationId);
  if (conversationId !== prevConvId) {
    setPrevConvId(conversationId);
    if (!conversationId) {
      setMessages([]);
      setConvTitle("");
    }
  }

  useEffect(() => {
    if (!conversationId) return;
    void (async () => {
      await loadConversation(conversationId);
    })();
  }, [conversationId, loadConversation]);

  // Auto-scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, statusNote]);

  const groupedModels: Record<string, ChatModel[]> = useMemo(() => {
    const groups: Record<string, ChatModel[]> = {};
    for (const m of models) (groups[m.providerName] ||= []).push(m);
    return groups;
  }, [models]);

  const ensureConversation = useCallback(async (): Promise<string> => {
    if (conversationId) return conversationId;
    const res = await api.post<{ conversation: { id: string } }>("/api/conversations", {});
    onConversationCreated(res.conversation.id);
    return res.conversation.id;
  }, [conversationId, onConversationCreated]);

  // ------------------------------------------------------------------
  // TTS (server voice first, browser fallback) — declared before send()
  // because send() speaks completed replies.
  // ------------------------------------------------------------------
  const speak = async (text: string) => {
    try {
      const res = await api.post<{ ok: boolean; audioBase64?: string; format?: string; error?: string }>("/api/voice", { text });
      if (res.ok && res.audioBase64) {
        const audio = new Audio(`data:audio/${res.format || "wav"};base64,${res.audioBase64}`);
        audioRef.current = audio;
        audio.play().catch(() => browserSpeak(text));
        return;
      }
      browserSpeak(text);
    } catch {
      browserSpeak(text);
    }
  };

  const browserSpeak = (text: string) => {
    if (typeof speechSynthesis === "undefined") return;
    speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = speechLang;
    utter.rate = 1;
    speechSynthesis.speak(utter);
  };

  // ------------------------------------------------------------------
  // Send / stream
  // ------------------------------------------------------------------
  const send = useCallback(async (payload: { content?: string; regenerate?: boolean; resendMessageId?: string }) => {
    setLastError(null);
    let convId: string;
    try {
      convId = await ensureConversation();
    } catch {
      toast({ title: t.errors.unauthorized, variant: "destructive" });
      return;
    }

    const content = payload.content;
    if (!payload.regenerate && !payload.resendMessageId) {
      const userMsg: ChatMessage = {
        id: `local-${Date.now()}`,
        role: "user",
        content: content || "",
        createdAt: new Date().toISOString(),
        attachments,
      };
      setMessages((prev) => [...prev, userMsg]);
    }
    setInput("");
    const sentAttachments = attachments;
    setAttachments([]);
    setStreaming(true);
    setStatusNote(null);

    const assistantId = `stream-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "", createdAt: new Date().toISOString(), streaming: true, toolPayload: undefined },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;

    const patchAssistant = (fn: (m: ChatMessage) => ChatMessage) =>
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? fn(m) : m)));

    let spoke = "";
    try {
      await streamChat(
        {
          conversationId: convId,
          ...(content ? { content } : {}),
          ...(payload.resendMessageId ? { resendMessageId: payload.resendMessageId } : {}),
          ...(payload.regenerate ? { regenerate: true } : {}),
          modelSlug: convModel,
          webSearch: webSearchOn,
          attachmentIds: sentAttachments.map((a) => a.id),
          allowFallback: true,
        },
        (evt: ChatStreamEvent) => {
          switch (evt.type) {
            case "meta":
              patchAssistant((m) => ({ ...m, modelSlug: evt.model }));
              break;
            case "delta":
              spoke += evt.text;
              patchAssistant((m) => ({ ...m, content: m.content + evt.text }));
              break;
            case "tool":
              if (evt.status === "running") setStatusNote({ kind: "tool", text: t.chat.toolRunning.replace("{tool}", evt.tool), tool: evt.tool });
              else {
                setStatusNote(null);
                patchAssistant((m) => ({
                  ...m,
                  toolPayload: evt.status === "done"
                    ? ({ tool: evt.tool, results: evt.results as ChatMessage["toolPayload"] extends infer P ? P extends { results?: infer R } ? R : never : never } as ChatMessage["toolPayload"])
                    : undefined,
                }));
                if (evt.status === "error") setStatusNote({ kind: "error", text: t.chat.toolFailed.replace("{tool}", evt.tool) + (evt.summary ? `: ${evt.summary}` : "") });
              }
              break;
            case "fallback":
              setStatusNote({ kind: "fallback", text: `${t.chat.fallbackNotice} ${evt.to}` });
              break;
            case "done":
            case "stopped":
              patchAssistant((m) => ({ ...m, streaming: false, id: evt.messageId }));
              break;
            case "error":
              setLastError(evt.message);
              patchAssistant((m) => ({ ...m, streaming: false, error: evt.message }));
              break;
          }
        },
        controller.signal
      );
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, streaming: false } : m)));
      if (ttsOn && spoke) speak(spoke.slice(0, 2000));
      onConversationsChanged();
    } catch (err) {
      patchAssistant((m) => ({ ...m, streaming: false }));
      if (err instanceof ApiClientError && err.code === "RATE_LIMITED") {
        toast({ title: t.errors.rateLimited, variant: "destructive" });
      } else if (!(err instanceof DOMException && err.name === "AbortError")) {
        setLastError(err instanceof Error ? err.message : t.errors.chatFailed);
      }
    } finally {
      setStreaming(false);
      setStatusNote(null);
      abortRef.current = null;
    }
  }, [convModel, webSearchOn, attachments, ensureConversation, onConversationCreated, onConversationsChanged, t, ttsOn]);

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
    setMessages((prev) => prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)));
  };

  // ------------------------------------------------------------------
  // Attachments
  // ------------------------------------------------------------------
  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files).slice(0, 4)) {
        if (file.size > 15 * 1024 * 1024) {
          toast({ title: `${file.name}: ${t.chat.fileTooLarge}`, variant: "destructive" });
          continue;
        }
        const form = new FormData();
        form.append("file", file);
        try {
          const res = await api.upload<{ attachment: AttachmentMeta }>("/api/files", form);
          setAttachments((prev) => [...prev, res.attachment]);
        } catch (err) {
          const msg = err instanceof ApiClientError && err.code === "UNSUPPORTED_TYPE" ? t.chat.unsupportedFile : t.chat.uploadFailed;
          toast({ title: `${file.name}: ${msg}`, variant: "destructive" });
        }
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ------------------------------------------------------------------
  // Voice input (Web Speech API with graceful fallback)
  // ------------------------------------------------------------------
  const toggleListening = () => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const W = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Ctor = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!Ctor) {
      toast({ title: t.tools.speechUnavailable });
      return;
    }
    try {
      const rec = new Ctor();
      rec.lang = speechLang;
      rec.interimResults = false;
      rec.continuous = false;
      rec.onresult = (e: { results: { isFinal: boolean; 0: { transcript: string } }[] }) => {
        for (let i = e.results.length - 1; i >= 0; i--) {
          if (e.results[i].isFinal) {
            setInput((prev) => (prev ? prev + " " : "") + e.results[i][0].transcript);
            break;
          }
        }
        setListening(false);
      };
      rec.onerror = () => { setListening(false); toast({ title: t.voice.micDenied, variant: "destructive" }); };
      rec.onend = () => setListening(false);
      rec.start();
      recognitionRef.current = rec;
      setListening(true);
    } catch {
      toast({ title: t.tools.speechUnavailable });
    }
  };

  const stopSpeaking = () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
  };

  // ------------------------------------------------------------------
  // Edit & resend
  // ------------------------------------------------------------------
  const startEdit = (m: ChatMessage) => {
    setEditingId(m.id);
    setEditValue(m.content);
  };

  const submitEdit = async () => {
    const id = editingId;
    setEditingId(null);
    if (!id || !conversationId) return;
    await send({ content: editValue, resendMessageId: id });
  };

  const updateConversation = async (patch: Record<string, unknown>) => {
    if (!conversationId) return;
    try {
      await api.patch(`/api/conversations/${conversationId}`, patch);
    } catch {
      toast({ title: t.errors.generic, variant: "destructive" });
    }
  };

  const lastAssistantId = [...messages].reverse().find((m) => m.role === "assistant")?.id;
  const selectedModel = models.find((m) => m.slug === convModel);
  const imageAttachments = attachments.filter((a) => a.kind === "image");
  const visionNeeded = imageAttachments.length > 0 && selectedModel && !selectedModel.capabilities.includes("vision");

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Conversation header */}
      {conversationId && (
        <div className="flex items-center gap-2 px-4 py-2 border-b text-sm">
          <span className="font-medium truncate flex-1">{convTitle}</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5">
                <BrainCircuit className="h-4 w-4" />
                {convMemory ? t.chat.contextOn : t.chat.contextOff}
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm">{t.chat.contextOn}</Label>
                  <p className="text-xs text-muted-foreground">{t.settings.memoryHint}</p>
                </div>
                <Switch checked={convMemory} onCheckedChange={(v) => { setConvMemory(v); updateConversation({ memoryEnabled: v }); }} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">{t.chat.systemPromptLabel}</Label>
                <Textarea
                  value={convSystemPrompt || ""}
                  placeholder={t.chat.systemPromptPlaceholder}
                  onChange={(e) => setConvSystemPrompt(e.target.value)}
                  className="min-h-20 text-sm"
                />
                <Button size="sm" onClick={() => updateConversation({ systemPrompt: convSystemPrompt })}>
                  <Check className="h-3.5 w-3.5" />
                  <span className="ms-1.5">{t.common.save}</span>
                </Button>
              </div>
            </PopoverContent>
          </Popover>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => { await updateConversation({ archived: true }); onArchive(); }}
            title={t.nav.archive}
          >
            {t.nav.archive}
          </Button>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto afg-scroll" role="log" aria-live="polite">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
          {loadingConv && <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}

          {!loadingConv && messages.length === 0 && <EmptyState />}

          {messages.map((m) => (
            <MessageRow
              key={m.id}
              m={m}
              t={t}
              onCopy={() => navigator.clipboard.writeText(m.content).catch(() => null)}
              onRegenerate={m.role === "assistant" && m.id === lastAssistantId && !streaming ? () => send({ regenerate: true }) : undefined}
              onEdit={m.role === "user" && !streaming ? () => startEdit(m) : undefined}
              onSpeak={ttsOn ? () => speak(m.content.slice(0, 2000)) : undefined}
            />
          ))}

          {statusNote && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground afg-fade-up" role="status">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              {statusNote.text}
            </div>
          )}

          {lastError && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 text-destructive text-sm p-3 flex items-start gap-2">
              <CircleAlert className="h-4 w-4 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="break-words">{lastError}</p>
                <div className="flex gap-2 mt-2">
                  <Button size="sm" variant="outline" className="h-7" onClick={() => send({ regenerate: true })}>{t.common.retry}</Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="border-t bg-background/95 backdrop-blur px-3 sm:px-4 py-3">
        <div className="max-w-3xl mx-auto space-y-2">
          {visionNeeded && (
            <div className="text-xs text-[var(--afg-amber)] flex items-center gap-1.5">
              <CircleAlert className="h-3.5 w-3.5" /> {t.chat.visionRequired}
            </div>
          )}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {attachments.map((a) => (
                <div key={a.id} className="flex items-center gap-1.5 rounded-md border bg-muted/60 px-2 py-1 text-xs">
                  {a.kind === "image" ? <ImageIcon className="h-3.5 w-3.5 text-primary" /> : <FileText className="h-3.5 w-3.5 text-muted-foreground" />}
                  <span className="max-w-40 truncate">{a.filename}</span>
                  <button aria-label={t.common.delete} onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}>
                    <X className="h-3.5 w-3.5 hover:text-destructive" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {editingId !== null && (
            <div className="rounded-lg border border-primary/40 p-2 space-y-2 afg-fade-up">
              <Textarea autoFocus value={editValue} onChange={(e) => setEditValue(e.target.value)} className="min-h-16" aria-label={t.chat.editMessage} />
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>{t.common.cancel}</Button>
                <Button size="sm" onClick={submitEdit}><Send className="h-3.5 w-3.5" /><span className="ms-1.5">{t.chat.editMessage}</span></Button>
              </div>
            </div>
          )}

          <div className="rounded-xl border bg-card afg-glow-ring p-2 focus-within:ring-1 focus-within:ring-ring">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (input.trim() && !streaming) send({ content: input.trim() });
                }
              }}
              placeholder={t.chat.placeholder}
              className="min-h-11 max-h-48 resize-none border-0 bg-transparent focus-visible:ring-0 text-[15px] px-2"
              aria-label={t.chat.placeholder}
            />
            <div className="flex items-center gap-1 px-1 pt-1 flex-wrap">
              {/* Model selector */}
              <Select value={convModel} onValueChange={(v) => { setConvModel(v); updateConversation({ modelSlug: v }); }}>
                <SelectTrigger size="sm" className="h-8 gap-1.5 border-0 bg-muted/60 text-xs" aria-label={t.chat.modelSelector}>
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(groupedModels).map(([provider, list]) => (
                    <SelectGroup key={provider}>
                      <SelectLabel className="text-xs">{provider}</SelectLabel>
                      {list.map((m) => (
                        <SelectItem key={m.slug} value={m.slug} className="text-sm">
                          <span className="inline-flex items-center gap-1.5">
                            {m.displayName}
                            {m.capabilities.filter((c) => c !== "chat").slice(0, 2).map((c) => (
                              <Badge key={c} variant="outline" className="text-[9px] px-1 py-0 h-4">{c}</Badge>
                            ))}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>

              {/* Web search toggle */}
              {flags.web_search !== false && (
                <Button
                  variant={webSearchOn ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setWebSearchOn((v) => !v)}
                  title={webSearchOn ? t.chat.webSearchOn : t.chat.webSearch}
                  aria-pressed={webSearchOn}
                >
                  <Globe className={cn("h-3.5 w-3.5", webSearchOn && "text-primary")} />
                  <span className="ms-1.5 hidden sm:inline">{t.chat.webSearch}</span>
                </Button>
              )}

              {/* Attach */}
              <input ref={fileInputRef} type="file" multiple hidden accept="image/*,.txt,.md,.csv,.json,.pdf,.py,.js,.ts,.yaml,.yml,.html" onChange={(e) => onFiles(e.target.files)} aria-hidden />
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => fileInputRef.current?.click()} disabled={uploading} title={t.chat.attachHint}>
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                <span className="ms-1.5 hidden sm:inline">{uploading ? t.chat.uploading : t.chat.attachFile}</span>
              </Button>

              {/* Voice input */}
              <Button variant={listening ? "secondary" : "ghost"} size="sm" className="h-8 text-xs" onClick={toggleListening} aria-pressed={listening} title={t.chat.voiceInput}>
                {listening ? <Mic className="h-3.5 w-3.5 animate-pulse text-primary" /> : <MicOff className="h-3.5 w-3.5" />}
                <span className="ms-1.5 hidden sm:inline">{listening ? t.chat.listening : t.chat.voiceInput}</span>
              </Button>

              {/* TTS toggle */}
              <Button
                variant={ttsOn ? "secondary" : "ghost"}
                size="sm"
                className="h-8 text-xs"
                onClick={() => { setTtsOn((v) => !v); if (ttsOn) stopSpeaking(); }}
                aria-pressed={ttsOn}
                title={t.voice.speakReplies}
              >
                {ttsOn ? <Volume2 className="h-3.5 w-3.5 text-primary" /> : <VolumeX className="h-3.5 w-3.5" />}
                <span className="ms-1.5 hidden sm:inline">{ttsOn ? t.common.enabled : t.common.disabled}</span>
              </Button>

              <div className="flex-1" />

              {streaming ? (
                <Button size="sm" variant="destructive" className="h-8" onClick={stop}>
                  <Square className="h-3.5 w-3.5" />
                  <span className="ms-1.5">{t.common.stop}</span>
                </Button>
              ) : (
                <Button size="sm" className="h-8" onClick={() => input.trim() && send({ content: input.trim() })} disabled={!input.trim()}>
                  <Send className="h-3.5 w-3.5" />
                  <span className="ms-1.5">{t.common.send}</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function EmptyState() {
  const t = useT();
  const suggestions = [
    { icon: <FileText className="h-4 w-4" />, label: t.chat.suggestionWork },
    { icon: <Calculator className="h-4 w-4" />, label: t.chat.suggestionMath },
    { icon: <Globe className="h-4 w-4" />, label: t.chat.suggestionResearch },
    { icon: <TableIcon className="h-4 w-4" />, label: t.chat.suggestionCode },
  ];
  return (
    <div className="flex flex-col items-center justify-center py-14 gap-6 afg-fade-up">
      <div className="relative h-24 w-24">
        <div className="absolute inset-0 rounded-full border border-primary/20 afg-orbit" style={{ borderTopColor: "var(--afg-cyan)" }} />
        <div className="absolute inset-3 rounded-2xl afg-core" aria-hidden />
      </div>
      <div className="text-center">
        <h2 className="text-2xl font-semibold">{t.chat.emptyTitle}</h2>
        <p className="text-muted-foreground mt-1">{t.chat.emptySubtitle}</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-2 w-full max-w-md">
        {suggestions.map((s) => (
          <div key={s.label} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2.5 text-sm text-muted-foreground">
            <span className="text-primary">{s.icon}</span>
            {s.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function ToolResult({ m }: { m: ChatMessage }) {
  const payload = m.toolPayload;
  if (!payload) return null;
  if (payload.imageBase64) {
    return (
      <div className="mt-2 rounded-lg overflow-hidden border max-w-sm">
        <img src={`data:image/png;base64,${payload.imageBase64}`} alt={payload.prompt || "Generated image"} className="w-full" />
        {payload.prompt && <div className="px-3 py-2 text-xs text-muted-foreground border-t">{payload.prompt}</div>}
      </div>
    );
  }
  if (payload.results?.length) {
    return (
      <div className="mt-2 space-y-1.5 border rounded-lg p-3 bg-muted/40">
        {payload.results.slice(0, 6).map((r, i) => (
          <a key={i} href={r.url} target="_blank" rel="noopener noreferrer" className="block text-sm hover:bg-accent rounded p-1.5 -mx-1.5 px-1.5 transition-colors">
            <span className="font-medium text-primary">{r.title}</span>
            <span className="block text-xs text-muted-foreground mt-0.5 line-clamp-2">{r.snippet}</span>
            <span className="block text-[11px] text-muted-foreground/70 mt-0.5">{r.host}{r.date ? ` · ${r.date}` : ""}</span>
          </a>
        ))}
      </div>
    );
  }
  return null;
}

function MessageRow({
  m, t, onCopy, onRegenerate, onEdit, onSpeak,
}: {
  m: ChatMessage;
  t: ReturnType<typeof useT>;
  onCopy: () => void;
  onRegenerate?: () => void;
  onEdit?: () => void;
  onSpeak?: () => void;
}) {
  const isUser = m.role === "user";
  return (
    <div className={cn("group flex gap-3", isUser && "flex-row-reverse")} data-role={m.role}>
      <div className={cn(
        "h-8 w-8 rounded-lg shrink-0 grid place-items-center border",
        isUser ? "bg-secondary" : "bg-card afg-glow-ring"
      )} aria-hidden>
        {isUser ? <span className="text-xs font-bold">{t.chat.you.slice(0, 2)}</span> : <Sparkles className="h-4 w-4 text-primary" />}
      </div>
      <div className={cn("min-w-0 max-w-[85%]", isUser && "flex flex-col items-end")}>
        <div className={cn(
          "rounded-2xl px-4 py-3 text-[15px]",
          isUser ? "bg-secondary rounded-ee-sm" : "bg-card border rounded-es-sm",
          m.status === "ERROR" && "border-destructive/50"
        )}>
          {m.content ? (
            isUser ? <p className="whitespace-pre-wrap break-words">{m.content}</p> : <Markdown content={m.content} />
          ) : m.streaming ? (
            <span className="inline-flex gap-1 items-center" aria-label="streaming">
              <span className="h-2 w-2 rounded-full bg-primary animate-bounce [animation-delay:0ms]" />
              <span className="h-2 w-2 rounded-full bg-primary animate-bounce [animation-delay:150ms]" />
              <span className="h-2 w-2 rounded-full bg-primary animate-bounce [animation-delay:300ms]" />
            </span>
          ) : (
            <span className="text-muted-foreground text-sm italic">{t.common.none}</span>
          )}
          {!isUser && <ToolResult m={m} />}
          {m.error && <p className="text-destructive text-sm mt-1">{m.error}</p>}
          {m.attachments && m.attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {m.attachments.map((a) => (
                <a key={a.id} href={`/api/files/${a.id}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 rounded border bg-muted/60 px-1.5 py-0.5 text-xs hover:border-primary">
                  {a.kind === "image" ? <img src={`/api/files/${a.id}`} alt={a.filename} className="h-8 w-8 object-cover rounded" /> : <FileText className="h-3.5 w-3.5" />}
                  <span className="max-w-32 truncate">{a.filename}</span>
                </a>
              ))}
            </div>
          )}
        </div>
        <div className={cn("flex gap-1 mt-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity", isUser && "flex-row-reverse")}>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onCopy} aria-label={t.chat.copyMessage} title={t.chat.copyMessage}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
          {onRegenerate && (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onRegenerate} aria-label={t.chat.regenerateLast} title={t.chat.regenerateLast}>
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          )}
          {onEdit && (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onEdit} aria-label={t.chat.editMessage} title={t.chat.editMessage}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          {onSpeak && (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onSpeak} aria-label={t.voice.speakReplies} title={t.voice.speakReplies}>
              <Volume2 className="h-3.5 w-3.5" />
            </Button>
          )}
          {m.modelSlug && !isUser && (
            <span className="text-[10px] text-muted-foreground/60 self-center ms-1" dir="ltr">{m.modelSlug.split(":").pop()}</span>
          )}
        </div>
      </div>
    </div>
  );
}

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: { isFinal: boolean; 0: { transcript: string } }[] }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};
