import React, { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUp,
  AudioLines,
  Bell,
  BookOpen,
  Bot,
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
import "./jarvis.css";

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
};
const navItems = [
  ["home", LayoutDashboard],
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
  const status = useCommandStatus();
  const taskStore = useLocalTasks(p.user.id);
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
  const [intelligence, setIntelligence] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [notice, setNotice] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const recognition = useRef<any>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const available = p.models.filter((m) => m.selectable);
  const pending = taskStore.tasks.filter((t) => !t.done);
  const modelLabel =
    p.selectedModel === "auto"
      ? "Auto · verified models"
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
  }, [p.tab]);
  useEffect(() => () => recognition.current?.abort(), []);
  useEffect(() => {
    const shortcut = (e: KeyboardEvent) => {
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
        "Speech input could not start. Check microphone permission and browser support.",
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
      setVoiceError("Speech input is unavailable.");
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
      online: "Connected",
      unavailable: "Unavailable",
      configuration: "Requires configuration",
      checking: "Checking…",
    })[state] || state;
  const composerView = (
    <form className="j-composer" onSubmit={submit}>
      <div className="j-composer-input">
        <Sparkles size={20} />
        <textarea
          ref={composer}
          aria-label="Message JARVIS"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ask JARVIS anything, or describe a task…"
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
            title="Open a local document"
            aria-label="Open a local document"
            onClick={() => go("files")}
          >
            <Plus size={18} />
          </button>
          <span className="j-divider" />
          <label className="j-model-select">
            <Cpu size={14} />
            <select
              aria-label="AI model"
              value={p.selectedModel}
              onChange={(e) => p.onModel(e.target.value)}
            >
              <option value="auto">
                Auto ·{" "}
                {available.length ? "verified models" : "no model connected"}
              </option>
              {p.models.map((m) => (
                <option
                  key={`${m.providerId}::${m.id}`}
                  value={`${m.providerId}::${m.id}`}
                  disabled={!m.selectable}
                >
                  {m.displayName}
                  {!m.selectable ? " · unavailable" : ""}
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
            aria-label={listening ? "Stop microphone" : "Start voice input"}
            title={
              speechSupported
                ? "Browser speech input; audio may be processed by your browser provider"
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
            aria-label={p.activeTasks ? "Stop generation" : "Send message"}
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
    <div className="jarvis-app" data-theme={p.theme}>
      {drawer && (
        <button
          className="j-drawer-overlay"
          aria-label="Close navigation"
          onClick={() => setDrawer(false)}
        />
      )}
      <aside
        className={`j-sidebar ${drawer ? "is-open" : ""}`}
        aria-label="Main navigation"
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
            <AudioLines size={25} />
          </span>
          <span>
            JARVIS<small>PERSONAL AI SYSTEM</small>
          </span>
          <span className="j-version">1.0</span>
        </a>
        <button
          className="j-new-chat"
          onClick={() => {
            p.onNewChat();
            setDrawer(false);
          }}
        >
          <Plus size={17} /> New conversation <span>＋</span>
        </button>
        <div className="j-nav-label">WORKSPACE</div>
        <nav>
          {navItems.map(([id, Icon], index) => (
            <React.Fragment key={id}>
              {index === 9 && (
                <div className="j-nav-label j-nav-space">PERSONAL</div>
              )}
              <button
                aria-current={p.tab === id ? "page" : undefined}
                className={p.tab === id ? "active" : ""}
                onClick={() => go(id)}
              >
                <Icon size={17} />
                <span>{labels[id]}</span>
                {id === "tasks" && pending.length > 0 && (
                  <i>{pending.length}</i>
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
              Make it local<small>Explore offline AI models</small>
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
              {p.user.email ? p.user.nameEn : "Your workspace"}
              <small>
                {p.user.email
                  ? "Account settings"
                  : "Local workspace · Sign in"}
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
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </button>
            <span className="j-breadcrumb">Workspace</span>
            <ChevronRight size={13} />
            <strong>
              {labels[p.tab as keyof typeof labels] || "Workspace"}
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
                ? "System connected"
                : "System unavailable"}
            </span>
            <button
              aria-label="Focus command input"
              title="Command input · Ctrl/⌘ K"
              onClick={() => {
                go("home");
                setTimeout(() => composer.current?.focus(), 50);
              }}
            >
              <Search size={18} />
            </button>
            <button
              aria-label="System notifications"
              onClick={() => setNotice(!notice)}
            >
              <Bell size={18} />
              {status.database === "unavailable" && (
                <span className="j-notification-dot" />
              )}
            </button>
            <span className="j-top-divider" />
            <button
              className="j-intelligence-toggle"
              aria-label="Toggle intelligence panel"
              aria-pressed={intelligence}
              onClick={() => setIntelligence(!intelligence)}
            >
              <Settings2 size={18} />
            </button>
          </div>
        </header>
        {notice && (
          <div className="j-notice" role="status">
            <strong>System notifications</strong>
            <p>
              {status.database === "online"
                ? "Database connection verified."
                : "Account and synchronization features require a connected PostgreSQL database."}
            </p>
            <button
              onClick={() => {
                go("settings");
                setNotice(false);
              }}
            >
              Open settings <ArrowRight size={13} />
            </button>
          </div>
        )}
        <div className="j-content-row">
          <div
            className="j-workspace"
            role={localTabs.includes(p.tab) ? "main" : undefined}
          >
            {p.tab === "home" ? (
              <div className="j-dashboard">
                <div className="j-page-heading">
                  <div className="j-eyebrow">
                    <span /> YOUR INTELLIGENCE, CONNECTED
                  </div>
                  <span className="j-date">
                    {new Intl.DateTimeFormat(
                      p.language === "english" ? "en" : undefined,
                      { weekday: "short", month: "short", day: "numeric" },
                    ).format(new Date())}
                  </span>
                </div>
                {!status.online && (
                  <div className="j-offline-banner" role="status">
                    <WifiOff size={15} />
                    <span>
                      Network signal is offline. Local tasks and files remain
                      available; cloud features may be unreachable.
                    </span>
                    <button onClick={() => go("offline-models")}>
                      Local models <ArrowRight size={13} />
                    </button>
                  </div>
                )}
                <section className="j-hero">
                  <div className="j-hero-copy">
                    <span className="j-hero-kicker">
                      A little less busy. A lot more possible.
                    </span>
                    <h1>
                      Your world.
                      <br />
                      Working <em>together.</em>
                    </h1>
                    <p>
                      Think, create, and get things done.
                      <br />
                      One intelligent workspace, built around you.
                    </p>
                    <button onClick={() => go("chat")}>
                      Let’s get started <ArrowRight size={15} />
                    </button>
                  </div>
                  <div className="j-orb-scene" aria-hidden="true">
                    <div className="j-orbit orbit-one" />
                    <div className="j-orbit orbit-two" />
                    <div className="j-orb">
                      <div className="j-orb-core" />
                      <div className="j-orb-grid" />
                    </div>
                    <div className="j-orb-caption">
                      <span /> J A R V I S <small>YOUR PERSONAL AI</small>
                    </div>
                    <span className="j-star star-one" />
                    <span className="j-star star-two" />
                    <span className="j-star star-three" />
                  </div>
                </section>
                <div className="j-summary-grid">
                  <button onClick={() => go("offline-models")}>
                    <span className="j-summary-icon cyan">
                      <Cpu size={19} />
                    </span>
                    <span>
                      <strong>{available.length} verified models</strong>
                      <small>
                        {available.length
                          ? "Ready for your next idea"
                          : "Connect a provider to begin"}
                      </small>
                    </span>
                    <ChevronRight size={15} />
                  </button>
                  <button onClick={() => go("tasks")}>
                    <span className="j-summary-icon violet">
                      <ListTodo size={19} />
                    </span>
                    <span>
                      <strong>{pending.length} open tasks</strong>
                      <small>Your focus, in one place</small>
                    </span>
                    <ChevronRight size={15} />
                  </button>
                  <button onClick={() => go("files")}>
                    <span className="j-summary-icon blue">
                      <ShieldCheck size={19} />
                    </span>
                    <span>
                      <strong>A local-first workspace</strong>
                      <small>Files stay on your device</small>
                    </span>
                    <ChevronRight size={15} />
                  </button>
                </div>
                <div className="j-section-title">
                  <h2>What’s on your mind?</h2>
                  <span>A place to start</span>
                </div>
                <div className="j-quick-grid">
                  {[
                    {
                      icon: Globe,
                      color: "cyan",
                      title: "Explore an idea",
                      text: "Go deeper. Connect the dots.",
                      prompt:
                        "Help me explore a new idea. Ask me what I would like to research and explain which research tools are available.",
                    },
                    {
                      icon: Code2,
                      color: "violet",
                      title: "Build something",
                      text: "From first thought to first line.",
                      prompt:
                        "Help me plan a coding project. Ask about the project and available tools before suggesting implementation steps.",
                    },
                    {
                      icon: FileText,
                      color: "blue",
                      title: "Bring your context",
                      text: "Your documents, a little clearer.",
                      tab: "files" as TabType,
                    },
                    {
                      icon: Zap,
                      color: "amber",
                      title: "Find your focus",
                      text: "Make room for what matters.",
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
                    Your workspace activity{" "}
                    <span>{taskStore.tasks.length}</span>
                  </h2>
                  <button onClick={() => go("tasks")}>
                    View tasks <ArrowRight size={13} />
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
                            {t.done ? "Completed" : "Open task"} · Saved on this
                            device
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
                        <strong>A fresh start, with room to grow.</strong>
                        <small>
                          Your local tasks will appear here as you create them.
                        </small>
                      </div>
                      <button onClick={() => go("tasks")}>
                        Create a task <Plus size={14} />
                      </button>
                    </div>
                  )}
                </div>
                <div className="j-home-composer">
                  {composerView}
                  <div className="j-composer-note">
                    <ShieldCheck size={12} /> You’re in control. Sensitive
                    actions require your approval.<span>⌘ K to focus</span>
                  </div>
                </div>
              </div>
            ) : p.tab === "tasks" ? (
              <section className="j-local-page">
                <div className="j-eyebrow">PERSONAL WORKSPACE</div>
                <div className="j-section-title">
                  <h1>A little more focused.</h1>
                  <button
                    onClick={exportTasks}
                    disabled={!taskStore.tasks.length}
                  >
                    <ArrowDownToLine size={15} /> Export
                  </button>
                </div>
                <p className="j-muted">
                  A private task list, stored on this browser. Tasks do not
                  execute automatically.
                </p>
                <form
                  className="j-task-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (taskStore.add(taskTitle)) setTaskTitle("");
                  }}
                >
                  <input
                    aria-label="Task title"
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    placeholder="What would you like to get done?"
                    maxLength={300}
                    required
                  />
                  <button type="submit" className="j-primary">
                    <Plus size={17} /> Add task
                  </button>
                </form>
                {taskStore.error && (
                  <p role="alert" className="j-error">
                    {taskStore.error}
                  </p>
                )}
                <div className="j-task-list">
                  {taskStore.tasks.map((t) => (
                    <div key={t.id} className={t.done ? "done" : ""}>
                      <button
                        aria-label={`${t.done ? "Reopen" : "Complete"} ${t.title}`}
                        onClick={() => taskStore.toggle(t.id)}
                      >
                        {t.done ? <Check size={19} /> : <Circle size={19} />}
                      </button>
                      <span>{t.title}</span>
                      <button
                        aria-label={`Delete ${t.title}`}
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
                    <h3>Clear space for your next step.</h3>
                    <p>Add your first task above.</p>
                  </div>
                )}
              </section>
            ) : p.tab === "files" ? (
              <LocalFiles />
            ) : p.tab === "voice" ? (
              <section className="j-local-page j-voice-page">
                <div className="j-eyebrow">VOICE WORKSPACE</div>
                <div className={`j-voice-orb ${listening ? "listening" : ""}`}>
                  <AudioLines size={50} />
                </div>
                <h1>
                  {listening
                    ? "Listening to you…"
                    : "A conversation starts with you."}
                </h1>
                <p className="j-muted">
                  {speechSupported
                    ? "Tap the microphone to dictate. Your browser may send audio to its speech service. Review the transcript before sending."
                    : "This browser does not provide speech recognition. You can continue with text chat."}
                </p>
                {composerView}
                <small className="j-muted">
                  No background listening. Stop recording at any time.
                </small>
              </section>
            ) : localTabs.includes(p.tab) ? (
              <section className="j-local-page">
                <div className="j-eyebrow">
                  {labels[p.tab as keyof typeof labels]}
                </div>
                <h1>
                  {p.tab === "automation"
                    ? "Good workflows need real connections."
                    : p.tab === "browser"
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
                    {p.tab === "automation"
                      ? "Workflow execution is not connected"
                      : p.tab === "browser"
                        ? p.capabilities.capabilities.research
                          ? "Research capability detected"
                          : "Research requires configuration"
                        : p.tab === "memory"
                          ? "Manage your saved memories in account settings"
                          : "Start with your documents"}
                  </h3>
                  <p>
                    {p.tab === "automation"
                      ? "The existing tools center provides individual actions. A visual workflow editor, scheduler, and resumable execution engine are not implemented."
                      : p.tab === "browser"
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
                      ? "Open settings"
                      : p.tab === "knowledge"
                        ? "Open local files"
                        : "Open tools center"}
                    <ArrowRight size={15} />
                  </button>
                </div>
              </section>
            ) : (
              <div className="j-existing-view">{p.children}</div>
            )}
          </div>
          {intelligence && (
            <aside className="j-intelligence" aria-label="Intelligence panel">
              <div className="j-panel-title">
                <span>
                  <Activity size={15} /> Intelligence
                </span>
                <button
                  aria-label="Hide intelligence panel"
                  onClick={() => setIntelligence(false)}
                >
                  <X size={14} />
                </button>
              </div>
              <div className="j-model-card">
                <div className="j-eyebrow">AI ENGINE</div>
                <div className="j-engine-mark">
                  <Sparkles size={20} />
                </div>
                <h3>{available.length ? modelLabel : "Ready when you are."}</h3>
                <p>
                  {available.length
                    ? `${available.length} verified text models available`
                    : "Connect your preferred AI provider to unlock your assistant."}
                </p>
                <button onClick={() => go("settings")}>
                  {available.length ? "Manage providers" : "Connect a provider"}
                  <ArrowRight size={13} />
                </button>
              </div>
              <div className="j-panel-section">
                <div className="j-panel-subtitle">
                  SYSTEM STATUS
                  <button
                    aria-label="Refresh system status"
                    onClick={status.refresh}
                  >
                    <Activity size={13} />
                  </button>
                </div>
                {[
                  {
                    icon: Globe,
                    name: "Network signal",
                    state: status.online ? "Online" : "Offline",
                    ok: status.online,
                  },
                  {
                    icon: Cpu,
                    name: "Backend API",
                    state: statusText(status.backend),
                    ok: status.backend === "online",
                  },
                  {
                    icon: HardDrive,
                    name: "Database",
                    state: statusText(status.database),
                    ok: status.database === "online",
                  },
                  {
                    icon: Bot,
                    name: "AI models",
                    state: available.length ? "Available" : "Not connected",
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
                    ? `Checked ${status.checkedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                    : "Checking live services…"}
                </p>
              </div>
              <div className="j-panel-section">
                <div className="j-panel-subtitle">
                  YOUR DEVICE
                  <ShieldCheck size={13} />
                </div>
                <div className="j-device-card">
                  <div>
                    <Command size={18} />
                    <span>
                      Browser workspace<small>This device</small>
                    </span>
                    <span className="j-green-dot" />
                  </div>
                  <p>
                    Local files and tasks stay here. OS controls require the
                    native Android bridge.
                  </p>
                </div>
              </div>
              <div className="j-panel-section">
                <div className="j-panel-subtitle">
                  IN PROGRESS<span>{p.activeTasks}</span>
                </div>
                <div className="j-running">
                  <span
                    className={p.activeTasks ? "j-green-dot" : "j-idle-dot"}
                  />
                  {p.activeTasks
                    ? "Assistant is working"
                    : "All clear. Space to think."}
                </div>
              </div>
              <div className="j-privacy-card">
                <ShieldCheck size={19} />
                <strong>Designed around your privacy.</strong>
                <p>
                  Provider keys stay on the server. You choose what to share.
                </p>
                <button onClick={() => go("settings")}>
                  Your preferences <ArrowRight size={13} />
                </button>
              </div>
              <div className="j-panel-footer">
                <span className="j-small-mark">✳</span> ONE ASSISTANT. MORE
                POSSIBILITY.
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
              ? "Connected to workspace"
              : "Backend unavailable"}
          </span>
          <span>
            <ShieldCheck size={11} /> Local task storage{" "}
            <span className="j-footer-separator">/</span> JARVIS v1.0
          </span>
        </footer>
      </div>
      <nav className="j-mobile-bottom" aria-label="Mobile navigation">
        {(["home", "chat", "voice", "tasks", "settings"] as const).map((id) => {
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
