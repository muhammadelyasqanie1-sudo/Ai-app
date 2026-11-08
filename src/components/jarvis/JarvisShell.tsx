import AgentWorkspace from "./AgentWorkspace";
import { apiFetch } from "../../lib/apiClient";
import React, { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUp,
  AudioLines,
  Bell,
  BookOpen,
  Bot,
  BrainCircuit,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  Code2,
  Command,
  Cpu,
  FileText,
  FolderOpen,
  Globe,
  HardDrive,
  Image,
  LayoutDashboard,
  ListTodo,
  Menu,
  MessageSquare,
  Mic,
  Network,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  Video,
  Wifi,
  WifiOff,
  X,
  Zap,
} from "lucide-react";
import type {
  AfgCapabilitySnapshot,
  AfgModelOption,
  Language,
  TabType,
  Theme,
  UserProfile,
} from "../../types/afg";
import { navigationCopy } from "./copy";
import { useCommandStatus, useLocalTasks } from "./useCommandCenter";
import { LocalFiles } from "./LocalFiles";
import {
  resolveCoreState,
  useExperience,
  type ToolActivity,
} from "./experience";
import { workspaceCopy } from "./workspaceCopy";
import { experienceCopy } from "./experienceCopy";
import { cinematicCopy } from "../cinematic/copy";
import { CinematicField } from "../cinematic/CinematicField";
import { IntelligenceCoreScreen } from "./IntelligenceCoreScreen";
import { formatLocalizedNumber, getIntlLocale } from "../../utils/i18n";
import "./jarvis.css";
import "./intelligence.css";
const IntelligenceCore = lazy(() => import("./IntelligenceCore"));
const ExperiencePanel = lazy(() => import("./ExperiencePanel"));
const BrandMark = () => (
  <svg className="afg-brand-symbol" viewBox="0 0 32 32" aria-hidden="true">
    <ellipse cx="16" cy="16" rx="14" ry="6" transform="rotate(-32 16 16)" />
    <ellipse cx="16" cy="16" rx="14" ry="6" transform="rotate(60 16 16)" />
    <circle cx="16" cy="16" r="4" />
    <path d="M12 16h8M16 12v8" />
  </svg>
);

type Props = {
  children: React.ReactNode;
  tab: TabType;
  onTab: (tab: TabType) => void;
  language: Language;
  user: UserProfile;
  capabilities: AfgCapabilitySnapshot;
  models: AfgModelOption[];
  selectedModel: string;
  onModel: (model: string) => void;
  onPrompt: (prompt: string) => void;
  onNewChat: () => void;
  onStop: () => void;
  onSignIn: () => void;
  theme: Theme;
  onTheme: () => void;
  activeTasks: number;
  activities: ToolActivity[];
  streaming: boolean;
  recording: boolean;
  failed: boolean;
  cancelled: boolean;
  onSetTheme: (theme: Theme) => void;
  onLanguage: (language: Language) => void;
};
const navItems = [
  ["home", LayoutDashboard],
  ["intelligence", BrainCircuit],
  ["chat", MessageSquare],
  ["voice", AudioLines],
  ["automation", Network],
  ["browser", Globe],
  ["terminal", Code2],
  ["files", FolderOpen],
  ["image-gen", Image],
  ["video-gen", Video],
  ["knowledge", BookOpen],
  ["memory", Cpu],
  ["jarvis", HardDrive],
  ["tasks", ListTodo],
  ["history", Activity],
] as const;
const localTabs = [
  "home",
  "intelligence",
  "tasks",
  "files",
  "automation",
  "browser",
  "knowledge",
  "memory",
  "voice",
];

export function JarvisShell(p: Props) {
  const labels = navigationCopy(p.language);
  const visual = experienceCopy(p.language);
  const cinematic = cinematicCopy(p.language);
  const w = workspaceCopy(p.language);
  const n = (value: number) => formatLocalizedNumber(value, p.language);
  const experience = useExperience();
  const [experienceMode, setExperienceMode] = useState<
    "intro" | "settings" | null
  >(() => {
    try {
      return localStorage.getItem("afg_intro_seen") === "true" ? null : "intro";
    } catch {
      return null;
    }
  });
  const closeExperience = () => {
    setExperienceMode(null);
    try {
      localStorage.setItem("afg_intro_seen", "true");
    } catch {
      /* In-memory dismissal remains available. */
    }
  };
  const status = useCommandStatus();
  const taskStore = useLocalTasks(p.user.id);
  const [recentChats, setRecentChats] = useState<
    Array<{ id: string; title: string; lastMessage: string; timestamp: number }>
  >([]);
  useEffect(() => {
    let alive = true;
    const readGuest = () => {
      try {
        const saved = JSON.parse(localStorage.getItem("afg_sessions") || "[]");
        if (!alive || !Array.isArray(saved)) return;
        setRecentChats(
          saved
            .filter(
              (item: any) =>
                typeof item?.id === "string" && item.id.startsWith("chat-"),
            )
            .sort((a: any, b: any) => Number(b.timestamp || 0) - Number(a.timestamp || 0))
            .slice(0, 3)
            .map((item: any) => ({
              id: item.id,
              title: String(item.title || ""),
              lastMessage: String(item.lastMessage || ""),
              timestamp: Number(item.timestamp || 0),
            })),
        );
      } catch {
        if (alive) setRecentChats([]);
      }
    };
    if (!p.user.email) {
      readGuest();
      window.addEventListener("storage", readGuest);
      return () => {
        alive = false;
        window.removeEventListener("storage", readGuest);
      };
    }
    void apiFetch("/api/conversations?limit=3")
      .then((response) => response.json())
      .then((payload: any) => {
        if (!alive) return;
        const rows = Array.isArray(payload.conversations)
          ? payload.conversations
          : [];
        setRecentChats(
          rows.slice(0, 3).map((row: any) => ({
            id: String(row.id),
            title: String(row.title || ""),
            lastMessage: String(row.lastMessage || ""),
            timestamp: new Date(
              row.updatedAt || row.createdAt || Date.now(),
            ).getTime(),
          })),
        );
      })
      .catch(() => {
        if (alive) setRecentChats([]);
      });
    return () => {
      alive = false;
    };
  }, [p.user.email, p.user.id]);
  const [drawer, setDrawer] = useState(false);
  const [mobile, setMobile] = useState(
    () => matchMedia("(max-width: 760px)").matches,
  );
  useEffect(() => {
    const media = matchMedia("(max-width: 760px)");
    const changed = () => setMobile(media.matches);
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);
  const intelligence = experience.preferences.panel;
  const setIntelligence = (panel: boolean) => experience.update({ panel });
  const [prompt, setPrompt] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [agentRunning, setAgentRunning] = useState(false);
  useEffect(() => {
    if (!p.user.email) {
      setAgentRunning(false);
      return;
    }
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const res = await apiFetch("/api/agents/tasks");
        const data = await res.json();
        if (alive)
          setAgentRunning(data.tasks.some((t: any) => t.status === "running"));
      } catch {
        if (alive) setAgentRunning(false);
      } finally {
        if (alive) timer = setTimeout(load, 3000);
      }
    };
    void load();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [p.user.id, p.user.email]);
  const [notice, setNotice] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const coreState = resolveCoreState({
    listening: listening || p.recording,
    active: p.activeTasks > 0 || agentRunning,
    streaming: p.streaming,
    online: status.online,
    failed: p.failed,
    cancelled: p.cancelled,
    activities: agentRunning
      ? [
          ...p.activities,
          { name: "agent_execute", label: "", status: "running" },
        ]
      : p.activities,
  });
  const currentTool = p.activeTasks
    ? p.activities.find((item) => item.status === "running")
    : undefined;
  const core = (compact = false) => (
    <Suspense
      fallback={
        <div
          className={compact ? "afg-core is-compact" : "afg-core-placeholder"}
        />
      }
    >
      <IntelligenceCore
        state={coreState}
        profile={experience.profile}
        reduced={experience.reduced}
        compact={compact}
      />
    </Suspense>
  );
  const recognition = useRef<any>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const available = p.models.filter((m) => m.selectable);
  const pending = taskStore.tasks.filter((t) => !t.done);
  const modelLabel =
    p.selectedModel === "auto"
      ? w("Auto · verified models")
      : p.models.find((m) => `${m.providerId}::${m.id}` === p.selectedModel)
          ?.displayName || p.selectedModel;
  const speechSupported =
    typeof window !== "undefined" &&
    !!(
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition
    );
  const go = (tab: TabType) => {
    recognition.current?.abort();
    setListening(false);
    p.onTab(tab);
    setDrawer(false);
  };
  useEffect(() => {
    recognition.current?.abort();
    setListening(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [p.tab]);
  useEffect(() => () => recognition.current?.abort(), []);
  useEffect(() => {
    const shortcut = (e: KeyboardEvent) => {
      if (document.querySelector(".afg-experience-dialog[open]")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        e.stopImmediatePropagation();
        p.onTab("home");
        window.setTimeout(() => composer.current?.focus(), 50);
      }
      if (e.key === "Escape") {
        setDrawer(false);
        setNotice(false);
        recognition.current?.abort();
      }
    };
    window.addEventListener("keydown", shortcut, true);
    return () => window.removeEventListener("keydown", shortcut, true);
  }, [p.onTab]);
  const voice = () => {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const Speech =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!Speech) return;
    const instance = new Speech();
    recognition.current = instance;
    instance.lang =
      (
        {
          dari: "fa-AF",
          persian: "fa-IR",
          pashto: "ps-AF",
          arabic: "ar-SA",
        } as Record<string, string>
      )[p.language] || "en-US";
    instance.continuous = false;
    instance.interimResults = false;
    instance.onstart = () => setListening(true);
    instance.onend = () => setListening(false);
    instance.onerror = () => {
      setVoiceError(
        w(
          "Speech input could not start. Check microphone permission and browser support.",
        ),
      );
      setListening(false);
    };
    instance.onresult = (event: any) =>
      setPrompt((current) =>
        `${current} ${event.results[0][0].transcript}`.trim(),
      );
    setVoiceError("");
    try {
      instance.start();
    } catch {
      setVoiceError(w("Speech input is unavailable."));
    }
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || p.activeTasks) return;
    recognition.current?.abort();
    p.onPrompt(prompt.trim());
    setPrompt("");
  };
  const exportTasks = () => {
    const url = URL.createObjectURL(
      new Blob(
        [JSON.stringify({ version: 1, tasks: taskStore.tasks }, null, 2)],
        { type: "application/json" },
      ),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "jarvis-tasks.json";
    link.click();
    URL.revokeObjectURL(url);
  };
  const statusText = (state: string) =>
    ({
      online: w("Connected"),
      unavailable: w("Unavailable"),
      configuration: w("Requires configuration"),
      checking: w("Checking…"),
    })[state] || state;
  const composerView = (
    <form className="j-composer" onSubmit={submit}>
      <div className="j-composer-input">
        <Sparkles size={20} />
        <textarea
          ref={composer}
          aria-label={w("Message AFG AI")}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={w("Ask AFG AI anything, or describe a task…")}
          rows={2}
          maxLength={16000}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              if (prompt.trim() && !p.activeTasks) {
                recognition.current?.abort();
                p.onPrompt(prompt.trim());
                setPrompt("");
              }
            }
          }}
        />
      </div>
      <div className="j-composer-bottom">
        <div className="j-composer-tools">
          <button
            type="button"
            title={w("Open a local document")}
            aria-label={w("Open a local document")}
            onClick={() => go("files")}
          >
            <Plus size={18} />
          </button>
          <span className="j-divider" />
          <label className="j-model-select">
            <Cpu size={14} />
            <select
              aria-label={w("AI model")}
              value={p.selectedModel}
              onChange={(e) => p.onModel(e.target.value)}
            >
              <option value="auto">
                {w("Auto ·")}{" "}
                {available.length
                  ? w("verified models")
                  : w("no model connected")}
              </option>
              {p.models.map((m) => (
                <option
                  key={`${m.providerId}::${m.id}`}
                  value={`${m.providerId}::${m.id}`}
                  disabled={!m.selectable}
                >
                  {m.displayName}
                  {!m.selectable ? " · " + w("unavailable") : ""}
                </option>
              ))}
            </select>
            <ChevronDown size={12} />
          </label>
        </div>
        <div className="j-composer-tools">
          <button
            type="button"
            onClick={voice}
            disabled={!speechSupported}
            aria-label={
              listening ? w("Stop microphone") : w("Start voice input")
            }
            title={
              speechSupported
                ? w(
                    "Browser speech input; audio may be processed by your browser provider",
                  )
                : "Speech recognition is unavailable in this browser"
            }
            className={listening ? "j-listening" : ""}
          >
            {listening ? <Square size={17} /> : <Mic size={18} />}
          </button>
          <button
            className="j-send"
            type={p.activeTasks ? "button" : "submit"}
            onClick={p.activeTasks ? p.onStop : undefined}
            aria-label={
              p.activeTasks ? w("Stop generation") : w("Send message")
            }
            disabled={!p.activeTasks && !prompt.trim()}
          >
            {p.activeTasks ? <Square size={16} /> : <ArrowUp size={18} />}
          </button>
        </div>
      </div>
      {voiceError && (
        <p role="alert" className="j-error">
          {voiceError}
        </p>
      )}
    </form>
  );
  return (
    <div
      className="jarvis-app"
      data-theme={p.theme}
      data-reduced={experience.reduced}
      data-graphics={experience.profile}
      data-tab={p.tab}
    >
      {drawer && (
        <button
          className="j-drawer-overlay"
          aria-label={w("Close navigation")}
          onClick={() => setDrawer(false)}
        />
      )}
      <aside
        className={`j-sidebar ${drawer ? "is-open" : ""}`}
        aria-label={w("Main navigation")}
        inert={mobile && !drawer}
      >
        <a
          className="j-brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            go("home");
          }}
        >
          <span className="j-brand-mark">
            <BrandMark />
          </span>
          <span>
            AFG <b>AI</b>
            <small>{w("INTELLIGENT WORKSPACE")}</small>
          </span>
        </a>
        <button
          className="j-new-chat"
          onClick={() => {
            p.onNewChat();
            setDrawer(false);
          }}
        >
          <Plus size={17} /> {w("New conversation")} <span>＋</span>
        </button>
        <div className="j-nav-label">{w("WORKSPACE")}</div>
        <nav>
          {navItems.map(([id, Icon], index) => (
            <React.Fragment key={id}>
              {index === 10 && (
                <div className="j-nav-label j-nav-space">{w("PERSONAL")}</div>
              )}
              <button
                aria-current={p.tab === id ? "page" : undefined}
                className={p.tab === id ? "active" : ""}
                onClick={() => go(id)}
              >
                <Icon size={17} />
                <span>{labels[id]}</span>
                {id === "tasks" && pending.length > 0 && (
                  <i>{n(pending.length)}</i>
                )}
                {id === "home" && <span className="j-nav-dot" />}
              </button>
            </React.Fragment>
          ))}
        </nav>
        <div className="j-sidebar-footer">
          <button className="j-local-link" onClick={() => go("offline-models")}>
            <span className="j-local-icon">
              <Cpu size={18} />
            </span>
            <span>
              {w("Make it local")}
              <small>{w("Explore offline AI models")}</small>
            </span>
            <ChevronRight size={15} />
          </button>
          <button className="j-settings" onClick={() => go("settings")}>
            <Settings2 size={17} />
            {labels.settings}
          </button>
          <button
            className="j-profile"
            onClick={() => (p.user.email ? go("settings") : p.onSignIn())}
          >
            <span className="j-avatar">
              {p.user.email ? p.user.nameEn.slice(0, 2).toUpperCase() : "YO"}
            </span>
            <span>
              {p.user.email ? p.user.nameEn : w("Your workspace")}
              <small>
                {p.user.email
                  ? w("Account settings")
                  : w("Local workspace · Sign in")}
              </small>
            </span>
            <ChevronDown size={14} />
          </button>
        </div>
      </aside>
      <div className="j-body">
        <header className="j-topbar">
          <div>
            <button
              className="j-mobile-menu"
              onClick={() => setDrawer(true)}
              aria-label={w("Open navigation")}
            >
              <Menu size={20} />
            </button>
            <span className="afg-mobile-wordmark">
              AFG <b>AI</b>
            </span>
            <span className="j-breadcrumb">{w("Workspace")}</span>
            <ChevronRight size={13} />
            <strong>
              {labels[p.tab as keyof typeof labels] || w("Workspace")}
            </strong>
          </div>
          <div className="j-top-actions">
            <span className="j-connection">
              <span
                className={
                  status.backend === "online" ? "j-green-dot" : "j-amber-dot"
                }
              />
              {status.backend === "online"
                ? w("System connected")
                : w("System unavailable")}
            </span>
            <button
              aria-label={w("Focus command input")}
              title={w("Command input · Ctrl/⌘ K")}
              onClick={() => {
                go("home");
                setTimeout(() => composer.current?.focus(), 50);
              }}
            >
              <Search size={18} />
            </button>
            <button
              className="j-notifications-button"
              aria-label={w("System notifications")}
              onClick={() => setNotice(!notice)}
            >
              <Bell size={18} />
              {status.database === w("unavailable") && (
                <span className="j-notification-dot" />
              )}
            </button>
            <button
              aria-label={visual.appearance}
              title={visual.appearance}
              onClick={() => setExperienceMode("settings")}
            >
              <Sparkles size={18} />
            </button>
            <span className="j-top-divider" />
            <button
              className="j-intelligence-toggle"
              aria-label={w("Toggle intelligence panel")}
              aria-pressed={intelligence}
              onClick={() => setIntelligence(!intelligence)}
            >
              <Settings2 size={18} />
            </button>
          </div>
        </header>
        {notice && (
          <div className="j-notice" role="status">
            <strong>{w("System notifications")}</strong>
            <p>
              {status.database === "online"
                ? w("Database connection verified.")
                : w(
                    "Account and synchronization features require a connected PostgreSQL database.",
                  )}
            </p>
            <button
              onClick={() => {
                go("settings");
                setNotice(false);
              }}
            >
              {w("Open settings")} <ArrowRight size={13} />
            </button>
          </div>
        )}
        <div className="j-content-row">
          <div
            className="j-workspace"
            role={localTabs.includes(p.tab) ? "main" : undefined}
          >
            {p.tab === "chat" && (
              <div
                className="afg-live-strip"
                role="region"
                aria-label={visual.core}
              >
                {core(true)}
                <div>
                  <strong>{visual.core}</strong>
                  <span role="status" aria-live="polite">
                    {currentTool?.label || visual[coreState]}
                  </span>
                </div>
                {p.activeTasks > 0 && (
                  <button
                    type="button"
                    onClick={p.onStop}
                    aria-label={w("Stop generation")}
                  >
                    <Square size={15} />
                  </button>
                )}
              </div>
            )}
            {p.tab === "intelligence" && (
              <IntelligenceCoreScreen
                language={p.language}
                state={coreState}
                profile={experience.profile}
                reduced={experience.reduced}
                activities={p.activities}
                models={p.models}
                activeTasks={p.activeTasks}
                openTasks={pending}
                backend={status.backend}
                database={status.database}
                onChat={() => go("chat")}
                onSettings={() => go("settings")}
                onHistory={() => go("history")}
              />
            )}
            {p.tab === "home" ? (
              <div className="j-dashboard">
                <div className="j-page-heading">
                  <div className="j-eyebrow">
                    <span /> {visual.workspace}
                  </div>
                  <span className="j-date">
                    {new Intl.DateTimeFormat(getIntlLocale(p.language), {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    }).format(new Date())}
                  </span>
                </div>
                {!status.online && (
                  <div className="j-offline-banner" role="status">
                    <WifiOff size={15} />
                    <span>
                      {w(
                        "Network signal is offline. Local tasks and files remain available; cloud features may be unreachable.",
                      )}
                    </span>
                    <button onClick={() => go("offline-models")}>
                      {w("Local models")} <ArrowRight size={13} />
                    </button>
                  </div>
                )}
                <section className="j-hero">
                  <CinematicField
                    variant="ambient"
                    profile={experience.profile}
                    reduced={experience.reduced}
                    className="j-hero-field"
                  />
                  <div className="j-hero-copy">
                    <span className="j-hero-kicker">{visual.design}</span>
                    <h1>
                      {visual.heroA}
                      <br />
                      <em>{visual.heroB}</em>
                    </h1>
                    <p>{visual.heroBody}</p>
                    <button onClick={() => go("chat")}>
                      {visual.start} <ArrowRight size={15} />
                    </button>
                  </div>
                  <div className="afg-core-stage">
                    {core()}
                    <div
                      className="afg-core-label"
                      data-state={coreState}
                      role="status"
                      aria-live="polite"
                    >
                      <span className="afg-state-dot" />
                      {visual[coreState]}
                    </div>
                  </div>
                </section>
                <div className="j-summary-grid">
                  <button onClick={() => go("offline-models")}>
                    <span className="j-summary-icon cyan">
                      <Cpu size={19} />
                    </span>
                    <span>
                      <strong>
                        {n(available.length)} {w("verified models")}
                      </strong>
                      <small>
                        {available.length
                          ? w("Ready for your next idea")
                          : w("Connect a provider to begin")}
                      </small>
                    </span>
                    <ChevronRight size={15} />
                  </button>
                  <button onClick={() => go("tasks")}>
                    <span className="j-summary-icon violet">
                      <ListTodo size={19} />
                    </span>
                    <span>
                      <strong>
                        {n(pending.length)} {w("open tasks")}
                      </strong>
                      <small>{w("Your focus, in one place")}</small>
                    </span>
                    <ChevronRight size={15} />
                  </button>
                  <button onClick={() => go("files")}>
                    <span className="j-summary-icon blue">
                      <ShieldCheck size={19} />
                    </span>
                    <span>
                      <strong>{w("A local-first workspace")}</strong>
                      <small>{w("Files stay on your device")}</small>
                    </span>
                    <ChevronRight size={15} />
                  </button>
                </div>
                <div className="j-cinematic-grid">
                  <section className="j-cinematic-card j-live-activity-card">
                    <header>
                      <span className="j-cinematic-icon cyan">
                        <Activity size={17} />
                      </span>
                      <div>
                        <h2>{cinematic.dashboardLive}</h2>
                        <small>
                          {p.activities.length
                            ? `${n(p.activities.length)} · ${visual.core}`
                            : cinematic.dashboardLiveEmpty}
                        </small>
                      </div>
                      <span
                        className="j-cinematic-pulse"
                        data-active={p.activities.some(
                          (item) => item.status === "running",
                        )}
                        aria-hidden="true"
                      />
                    </header>
                    {p.activities.length ? (
                      <ol className="j-cinematic-events">
                        {p.activities
                          .slice(-4)
                          .reverse()
                          .map((item, index) => (
                            <li key={`${item.name}-${index}`} data-status={item.status}>
                              <span className="j-cinematic-event-dot" />
                              <span>
                                <strong>{item.label || item.name}</strong>
                                <small>
                                  {item.status === "running"
                                    ? visual.executing
                                    : item.status === "completed"
                                      ? w("Completed")
                                      : visual.error}
                                </small>
                              </span>
                            </li>
                          ))}
                      </ol>
                    ) : (
                      <p className="j-cinematic-empty">
                        {cinematic.dashboardLiveEmpty}
                      </p>
                    )}
                    <button
                      type="button"
                      className="j-cinematic-link"
                      onClick={() => go("tasks")}
                    >
                      {w("View tasks")} <ArrowRight size={13} />
                    </button>
                  </section>
                  <section className="j-cinematic-card j-provider-card">
                    <header>
                      <span className="j-cinematic-icon violet">
                        <Cpu size={17} />
                      </span>
                      <div>
                        <h2>{cinematic.dashboardProviders}</h2>
                        <small>
                          {available.length
                            ? w("Ready for your next idea")
                            : cinematic.dashboardProvidersEmpty}
                        </small>
                      </div>
                      <span className="j-cinematic-count">
                        {n(available.length)}
                      </span>
                    </header>
                    {p.models.length ? (
                      <ul className="j-provider-list">
                        {p.models.slice(0, 4).map((model) => (
                          <li
                            key={`${model.providerId}::${model.id}`}
                            data-selectable={model.selectable}
                          >
                            <span className="j-provider-orbit" aria-hidden="true" />
                            <span>
                              <strong>{model.displayName}</strong>
                              <small>{model.providerId}</small>
                            </span>
                            <span className="j-provider-state">
                              {model.selectable
                                ? cinematic.dashboardSelectable
                                : cinematic.dashboardUnavailable}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="j-cinematic-empty">
                        {cinematic.dashboardProvidersEmpty}
                      </p>
                    )}
                    <button
                      type="button"
                      className="j-cinematic-link"
                      onClick={() => go("settings")}
                    >
                      {cinematic.coreSettings} <ArrowRight size={13} />
                    </button>
                  </section>
                </div>
                <div className="j-section-title j-recent-title">
                  <h2>
                    {cinematic.dashboardRecent}{" "}
                    <span>{n(recentChats.length)}</span>
                  </h2>
                  <button onClick={() => go("history")}>
                    {cinematic.dashboardViewAll} <ArrowRight size={13} />
                  </button>
                </div>
                <div className="j-recent-chat-list">
                  {recentChats.length ? (
                    recentChats.map((chat) => (
                      <button
                        key={chat.id}
                        type="button"
                        onClick={() => go("history")}
                      >
                        <span className="j-recent-chat-icon">
                          <MessageSquare size={15} />
                        </span>
                        <span>
                          <strong>{chat.title || w("New conversation")}</strong>
                          <small>
                            {chat.lastMessage ||
                              new Intl.DateTimeFormat(getIntlLocale(p.language), {
                                month: "short",
                                day: "numeric",
                              }).format(new Date(chat.timestamp || Date.now()))}
                          </small>
                        </span>
                        <ArrowRight size={13} />
                      </button>
                    ))
                  ) : (
                    <div className="j-cinematic-empty j-recent-empty">
                      <MessageSquare size={16} />
                      <span>{cinematic.dashboardRecentEmpty}</span>
                    </div>
                  )}
                </div>
                <div className="j-section-title">
                  <h2>{w("What’s on your mind?")}</h2>
                  <span>{w("A place to start")}</span>
                </div>
                <div className="j-quick-grid">
                  {[
                    {
                      icon: Globe,
                      color: "cyan",
                      title: w("Explore an idea"),
                      text: w("Go deeper. Connect the dots."),
                      prompt:
                        "Help me explore a new idea. Ask me what I would like to research and explain which research tools are available.",
                    },
                    {
                      icon: Code2,
                      color: "violet",
                      title: w("Build something"),
                      text: w("From first thought to first line."),
                      prompt:
                        "Help me plan a coding project. Ask about the project and available tools before suggesting implementation steps.",
                    },
                    {
                      icon: FileText,
                      color: "blue",
                      title: w("Bring your context"),
                      text: w("Your documents, a little clearer."),
                      tab: "files" as TabType,
                    },
                    {
                      icon: Zap,
                      color: "amber",
                      title: w("Find your focus"),
                      text: w("Make room for what matters."),
                      tab: "tasks" as TabType,
                    },
                  ].map((item) => (
                    <button
                      key={item.title}
                      disabled={!!item.prompt && p.activeTasks > 0}
                      onClick={() =>
                        item.tab ? go(item.tab) : p.onPrompt(item.prompt!)
                      }
                    >
                      <span className={`j-quick-icon ${item.color}`}>
                        <item.icon size={20} />
                      </span>
                      <ArrowRight className="j-quick-arrow" size={15} />
                      <strong>{item.title}</strong>
                      <p>{item.text}</p>
                    </button>
                  ))}
                </div>
                <div className="j-section-title j-recent-title">
                  <h2>
                    {w("Your workspace activity")}{" "}
                    <span>{n(taskStore.tasks.length)}</span>
                  </h2>
                  <button onClick={() => go("tasks")}>
                    {w("View tasks")} <ArrowRight size={13} />
                  </button>
                </div>
                <div className="j-activity-list">
                  {taskStore.tasks.length ? (
                    taskStore.tasks.slice(0, 2).map((t) => (
                      <button key={t.id} onClick={() => go("tasks")}>
                        <span className="j-activity-icon">
                          {t.done ? (
                            <Check size={16} />
                          ) : (
                            <ListTodo size={16} />
                          )}
                        </span>
                        <div>
                          <strong>{t.title}</strong>
                          <small>
                            {t.done ? w("Completed") : w("Open task")} ·{" "}
                            {w("Saved on this device")}
                          </small>
                        </div>
                        <ChevronRight size={14} />
                      </button>
                    ))
                  ) : (
                    <div className="j-activity-empty">
                      <span className="j-activity-icon">
                        <Activity size={17} />
                      </span>
                      <div>
                        <strong>
                          {w("A fresh start, with room to grow.")}
                        </strong>
                        <small>
                          {w(
                            "Your local tasks will appear here as you create them.",
                          )}
                        </small>
                      </div>
                      <button onClick={() => go("tasks")}>
                        {w("Create a task")} <Plus size={14} />
                      </button>
                    </div>
                  )}
                </div>
                <div className="j-home-composer">
                  {composerView}
                  <div className="j-composer-note">
                    <ShieldCheck size={12} />{" "}
                    {w(
                      "You’re in control. Sensitive actions require your approval.",
                    )}
                    <span>{w("⌘ K to focus")}</span>
                  </div>
                </div>
              </div>
            ) : p.tab === "tasks" ? (
              <section className="j-local-page">
                <div className="j-eyebrow">{w("PERSONAL WORKSPACE")}</div>
                <div className="j-section-title">
                  <h1>{w("A little more focused.")}</h1>
                  <button
                    onClick={exportTasks}
                    disabled={!taskStore.tasks.length}
                  >
                    <ArrowDownToLine size={15} /> {w("Export")}
                  </button>
                </div>
                <p className="j-muted">
                  {w(
                    "A private task list, stored on this browser. Tasks do not execute automatically.",
                  )}
                </p>
                <form
                  className="j-task-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (taskStore.add(taskTitle)) setTaskTitle("");
                  }}
                >
                  <input
                    aria-label={w("Task title")}
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    placeholder={w("What would you like to get done?")}
                    maxLength={300}
                    required
                  />
                  <button type="submit" className="j-primary">
                    <Plus size={17} /> {w("Add task")}
                  </button>
                </form>
                {taskStore.error && (
                  <p role="alert" className="j-error">
                    {w(taskStore.error)}
                  </p>
                )}
                <div className="j-task-list">
                  {taskStore.tasks.map((t) => (
                    <div key={t.id} className={t.done ? "done" : ""}>
                      <button
                        aria-label={`${t.done ? w("Reopen") : w("Complete")} ${t.title}`}
                        onClick={() => taskStore.toggle(t.id)}
                      >
                        {t.done ? <Check size={19} /> : <Circle size={19} />}
                      </button>
                      <span>{t.title}</span>
                      <button
                        aria-label={`${w("Delete")} ${t.title}`}
                        onClick={() => taskStore.remove(t.id)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
                {!taskStore.tasks.length && (
                  <div className="j-empty">
                    <ListTodo size={36} />
                    <h3>{w("Clear space for your next step.")}</h3>
                    <p>{w("Add your first task above.")}</p>
                  </div>
                )}
              </section>
            ) : p.tab === "files" ? (
              <LocalFiles language={p.language} />
            ) : p.tab === "voice" ? (
              <section className="j-local-page j-voice-page">
                <div className="j-eyebrow">{w("VOICE WORKSPACE")}</div>
                <div className="afg-voice-core">{core()}</div>
                <div
                  className="afg-core-label"
                  data-state={coreState}
                  role="status"
                >
                  {visual[coreState]}
                </div>
                <h1>
                  {listening
                    ? w("Listening to you…")
                    : w("A conversation starts with you.")}
                </h1>
                <p className="j-muted">
                  {speechSupported
                    ? w(
                        "Tap the microphone to dictate. Your browser may send audio to its speech service. Review the transcript before sending.",
                      )
                    : w(
                        "This browser does not provide speech recognition. You can continue with text chat.",
                      )}
                </p>
                {composerView}
                <small className="j-muted">
                  {w("No background listening. Stop recording at any time.")}
                </small>
              </section>
            ) : p.tab === "automation" ? (
              <AgentWorkspace
                key={p.user.id || "guest"}
                language={p.language}
                model={p.selectedModel}
                onActivity={setAgentRunning}
              />
            ) : localTabs.includes(p.tab) && p.tab !== "intelligence" ? (
              <section className="j-local-page">
                <div className="j-eyebrow">
                  {labels[p.tab as keyof typeof labels]}
                </div>
                <h1>
                  {p.tab === "browser"
                    ? "A wider world of context."
                    : p.tab === "memory"
                      ? "Memory, on your terms."
                      : "Build a world of knowledge."}
                </h1>
                <div className="j-configuration">
                  <span className="j-summary-icon violet">
                    {p.tab === "browser" ? (
                      <Globe size={24} />
                    ) : (
                      <Network size={24} />
                    )}
                  </span>
                  <h3>
                    {p.tab === "browser"
                      ? p.capabilities.capabilities.research
                        ? "Research capability detected"
                        : "Research requires configuration"
                      : p.tab === "memory"
                        ? "Manage your saved memories in account settings"
                        : "Start with your documents"}
                  </h3>
                  <p>
                    {p.tab === "browser"
                      ? "The existing research tool uses configured search providers. Browser automation requires an authenticated session and an authorized backend. Web pages are untrusted sources."
                      : p.tab === "memory"
                        ? "Signed-in memory uses the existing account service. You can review, edit, and delete memories in Settings. No memories are saved by this command center automatically."
                        : "Inspect and search text documents locally. Semantic collections and vector indexing are not connected to this workspace."}
                  </p>
                  <button
                    className="j-primary"
                    onClick={() =>
                      go(
                        p.tab === "memory"
                          ? "settings"
                          : p.tab === "knowledge"
                            ? "files"
                            : "tools",
                      )
                    }
                  >
                    {p.tab === "memory"
                      ? w("Open settings")
                      : p.tab === "knowledge"
                        ? "Open local files"
                        : "Open tools center"}
                    <ArrowRight size={15} />
                  </button>
                </div>
              </section>
            ) : p.tab === "intelligence" ? null : (
              <div className="j-existing-view">{p.children}</div>
            )}
          </div>
          {intelligence && (
            <aside className="j-intelligence" aria-label="Intelligence panel">
              <div className="j-panel-title">
                <span>
                  <Activity size={15} /> {w("Intelligence")}
                </span>
                <button
                  aria-label={w("Hide intelligence panel")}
                  onClick={() => setIntelligence(false)}
                >
                  <X size={14} />
                </button>
              </div>
              <div className="j-model-card">
                <div className="j-eyebrow">{w("AI ENGINE")}</div>
                <div className="j-engine-mark">
                  <Sparkles size={20} />
                </div>
                <h3>
                  {available.length ? modelLabel : w("Ready when you are.")}
                </h3>
                <p>
                  {available.length
                    ? `${n(available.length)} ${w("verified text models available")}`
                    : w(
                        "Connect your preferred AI provider to unlock your assistant.",
                      )}
                </p>
                <button onClick={() => go("settings")}>
                  {available.length
                    ? w("Manage providers")
                    : w("Connect a provider")}
                  <ArrowRight size={13} />
                </button>
              </div>
              <div className="j-panel-section">
                <div className="j-panel-subtitle">
                  {w("SYSTEM STATUS")}
                  <button
                    aria-label={w("Refresh system status")}
                    onClick={status.refresh}
                  >
                    <Activity size={13} />
                  </button>
                </div>
                {[
                  {
                    icon: Globe,
                    name: w("Network signal"),
                    state: status.online ? w("Online") : w("Offline"),
                    ok: status.online,
                  },
                  {
                    icon: Cpu,
                    name: w("Backend API"),
                    state: statusText(status.backend),
                    ok: status.backend === "online",
                  },
                  {
                    icon: HardDrive,
                    name: w("Database"),
                    state: statusText(status.database),
                    ok: status.database === "online",
                  },
                  {
                    icon: Bot,
                    name: w("AI models"),
                    state: available.length
                      ? w("Available")
                      : w("Not connected"),
                    ok: available.length > 0,
                  },
                ].map((s) => (
                  <div className="j-status-row" key={s.name}>
                    <s.icon size={14} />
                    <span>{s.name}</span>
                    <small className={s.ok ? "good" : "muted"}>{s.state}</small>
                  </div>
                ))}
                <p className="j-status-time">
                  {status.checkedAt
                    ? `${w("Checked")} ${status.checkedAt.toLocaleTimeString(getIntlLocale(p.language), { hour: "2-digit", minute: "2-digit" })}`
                    : w("Checking live services…")}
                </p>
              </div>
              <div className="j-panel-section">
                <div className="j-panel-subtitle">
                  {w("YOUR DEVICE")}
                  <ShieldCheck size={13} />
                </div>
                <div className="j-device-card">
                  <div>
                    <Command size={18} />
                    <span>
                      {w("Browser workspace")}
                      <small>{w("This device")}</small>
                    </span>
                    <span className="j-green-dot" />
                  </div>
                  <p>
                    {w(
                      "Local files and tasks stay here. OS controls require the native Android bridge.",
                    )}
                  </p>
                </div>
              </div>
              <div className="j-panel-section">
                <div className="j-panel-subtitle">
                  {w("IN PROGRESS")}
                  <span>{n(p.activeTasks)}</span>
                </div>
                <div className="j-running">
                  <span
                    className={p.activeTasks ? "j-green-dot" : "j-idle-dot"}
                  />
                  {currentTool?.label || visual[coreState]}
                </div>
              </div>
              <div className="j-privacy-card">
                <ShieldCheck size={19} />
                <strong>{w("Designed around your privacy.")}</strong>
                <p>
                  {w(
                    "Provider keys stay on the server. You choose what to share.",
                  )}
                </p>
                <button onClick={() => go("settings")}>
                  {w("Your preferences")} <ArrowRight size={13} />
                </button>
              </div>
              <div className="j-panel-footer">
                <span className="j-small-mark">✳</span>{" "}
                {w("ONE ASSISTANT. MORE POSSIBILITY.")}
              </div>
            </aside>
          )}
        </div>
        <footer className="j-statusbar">
          <span>
            <span
              className={
                status.backend === "online" ? "j-green-dot" : "j-amber-dot"
              }
            />
            {status.backend === "online"
              ? w("Connected to workspace")
              : w("Backend unavailable")}
          </span>
          <span>
            <ShieldCheck size={11} /> {w("Local task storage")}{" "}
            <span className="j-footer-separator">/</span> AFG AI
          </span>
        </footer>
      </div>
      {experienceMode && (
        <Suspense fallback={null}>
          <ExperiencePanel
            key={experienceMode}
            intro={experienceMode === "intro"}
            onClose={closeExperience}
            language={p.language}
            onLanguage={p.onLanguage}
            theme={p.theme}
            onTheme={p.onSetTheme}
            preferences={experience.preferences}
            update={experience.update}
            profile={experience.profile}
            reduced={experience.reduced}
            storageError={experience.storageError}
            models={available.length}
            signedIn={!!p.user.email}
            onNavigate={go}
            onSignIn={p.onSignIn}
          />
        </Suspense>
      )}
      <nav className="j-mobile-bottom" aria-label={w("Mobile navigation")}>
        {([
          "home",
          "intelligence",
          "chat",
          "voice",
          "tasks",
          "settings",
        ] as const).map((id) => {
          const Icon =
            id === "settings"
              ? Settings2
              : navItems.find((n) => n[0] === id)![1];
          return (
            <button
              key={id}
              className={p.tab === id ? "active" : ""}
              onClick={() => go(id)}
            >
              <Icon size={20} />
              <span>{labels[id]}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
