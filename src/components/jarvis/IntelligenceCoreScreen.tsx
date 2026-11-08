import React, { lazy, Suspense } from "react";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Circle,
  Cpu,
  Database,
  ListTodo,
  Settings2,
  Sparkles,
} from "lucide-react";
import type { AfgModelOption, Language } from "../../types/afg";
import { formatLocalizedNumber } from "../../utils/i18n";
import { CinematicField } from "../cinematic/CinematicField";
import { cinematicCopy } from "../cinematic/copy";
import {
  type CoreState,
  type GraphicsProfile,
  type ToolActivity,
} from "./experience";
import { experienceCopy } from "./experienceCopy";
import "./IntelligenceCoreScreen.css";

const IntelligenceCore = lazy(() => import("./IntelligenceCore"));

type Task = { id: string; title: string; done: boolean };

export function IntelligenceCoreScreen({
  language,
  state,
  profile,
  reduced,
  activities,
  models,
  activeTasks,
  openTasks,
  backend,
  database,
  onChat,
  onSettings,
  onHistory,
}: {
  language: Language;
  state: CoreState;
  profile: Exclude<GraphicsProfile, "auto">;
  reduced: boolean;
  activities: ToolActivity[];
  models: AfgModelOption[];
  activeTasks: number;
  openTasks: Task[];
  backend: "checking" | "online" | "unavailable";
  database: "checking" | "online" | "configuration" | "unavailable";
  onChat: () => void;
  onSettings: () => void;
  onHistory: () => void;
}) {
  const t = cinematicCopy(language);
  const e = experienceCopy(language);
  const n = (value: number) => formatLocalizedNumber(value, language);
  const verified = models.filter((model) => model.selectable);
  const running = activities.filter((item) => item.status === "running");
  const statusLabel =
    database === "online"
      ? t.statusOnline
      : database === "checking"
        ? t.statusChecking
        : t.statusUnavailable;
  const backendLabel =
    backend === "online"
      ? t.statusOnline
      : backend === "checking"
        ? t.statusChecking
        : t.statusUnavailable;

  return (
    <section className="afg-core-screen" aria-labelledby="afg-core-screen-title">
      <CinematicField
        variant="core"
        profile={profile}
        reduced={reduced}
        className="afg-core-screen-field"
      />
      <div className="afg-core-screen-layout">
        <div className="afg-core-screen-stage">
          <div className="afg-core-screen-kicker">
            <span
              className={`afg-core-live-dot ${running.length ? "is-active" : ""}`}
              aria-hidden="true"
            />
            {t.coreSignal}
            <span className="afg-core-screen-state">{e[state]}</span>
          </div>
          <Suspense fallback={<div className="afg-core-placeholder" aria-hidden="true" />}>
            <IntelligenceCore
              state={state}
              profile={profile}
              reduced={reduced}
              variant="cinematic"
            />
          </Suspense>
          <div
            className="afg-core-screen-status"
            data-state={state}
            role="status"
            aria-live="polite"
          >
            <span className="afg-core-screen-aperture" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span>
              <small>{t.coreCurrent}</small>
              <strong>{running[0]?.label || e[state]}</strong>
            </span>
            {activeTasks > 0 && (
              <span className="afg-core-screen-active">
                {t.coreLive} · {n(activeTasks)}
              </span>
            )}
          </div>
        </div>

        <aside className="afg-core-screen-panel">
          <header className="afg-core-screen-heading">
            <span className="afg-core-screen-eyebrow">
              <Sparkles size={14} aria-hidden="true" />
              AFG AI
            </span>
            <h1 id="afg-core-screen-title">{t.coreTitle}</h1>
            <p>{t.coreSubtitle}</p>
          </header>

          <div className="afg-core-screen-metrics">
            <div>
              <Cpu size={16} aria-hidden="true" />
              <strong>{n(verified.length)}</strong>
              <small>{t.coreVerified}</small>
            </div>
            <div>
              <ListTodo size={16} aria-hidden="true" />
              <strong>{n(openTasks.length)}</strong>
              <small>{t.coreOpenTasks}</small>
            </div>
            <div>
              <Activity size={16} aria-hidden="true" />
              <strong>{n(activities.length)}</strong>
              <small>{t.coreEvents}</small>
            </div>
            <div>
              <Database size={16} aria-hidden="true" />
              <strong className="afg-core-screen-word">{statusLabel}</strong>
              <small>{t.coreDatabase}</small>
            </div>
          </div>

          <section className="afg-core-screen-section" aria-labelledby="afg-core-events">
            <div className="afg-core-screen-section-head">
              <h2 id="afg-core-events">{t.coreEvents}</h2>
              <button type="button" onClick={onHistory}>
                {t.dashboardViewAll} <ArrowRight size={13} aria-hidden="true" />
              </button>
            </div>
            {activities.length ? (
              <ol className="afg-core-event-list">
                {activities.slice(-5).reverse().map((item, index) => (
                  <li key={`${item.name}-${index}`} data-status={item.status}>
                    <span className="afg-core-event-mark" aria-hidden="true">
                      {item.status === "running" ? (
                        <Activity size={13} />
                      ) : item.status === "completed" ? (
                        <CheckCircle2 size={13} />
                      ) : (
                        <Circle size={13} />
                      )}
                    </span>
                    <span>
                      <strong>{item.label || item.name}</strong>
                      <small>
                        {item.status === "running"
                          ? e.executing
                          : item.status === "completed"
                            ? e.idle
                            : e.error}
                      </small>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="afg-core-screen-empty">{t.coreNoEvents}</p>
            )}
          </section>

          <section className="afg-core-screen-section" aria-labelledby="afg-core-models">
            <div className="afg-core-screen-section-head">
              <h2 id="afg-core-models">{t.coreModels}</h2>
              <span className="afg-core-screen-count">{n(verified.length)}</span>
            </div>
            {verified.length ? (
              <ul className="afg-core-model-list">
                {verified.slice(0, 4).map((model) => (
                  <li key={`${model.providerId}::${model.id}`}>
                    <span className="afg-core-model-orbit" aria-hidden="true" />
                    <span>
                      <strong>{model.displayName}</strong>
                      <small>{model.providerId}</small>
                    </span>
                    <CheckCircle2 size={14} aria-label={t.dashboardSelectable} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="afg-core-screen-empty">{t.coreNoModels}</p>
            )}
          </section>

          <div className="afg-core-screen-actions">
            <button type="button" className="afg-core-screen-primary" onClick={onChat}>
              {t.coreChat} <ArrowRight size={15} aria-hidden="true" />
            </button>
            <button type="button" onClick={onSettings}>
              <Settings2 size={15} aria-hidden="true" />
              {t.coreSettings}
            </button>
          </div>
          <p className="afg-core-screen-footnote">
            {t.coreBackend}: {backendLabel}
          </p>
        </aside>
      </div>
    </section>
  );
}
