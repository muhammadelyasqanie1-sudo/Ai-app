import { agentCopy as copy } from "./agentCopy";
import React, { useEffect, useState } from "react";
import { apiFetch, getCsrfToken } from "../../lib/apiClient";
import type { Language } from "../../types/afg";
import "./agents.css";
export default function AgentWorkspace({
  language,
  model,
  onActivity,
}: {
  language: Language;
  model: string;
  onActivity: (active: boolean) => void;
}) {
  const col =
    language === "english"
      ? 0
      : language === "pashto"
        ? 2
        : language === "arabic"
          ? 3
          : 1;
  const t = (k: keyof typeof copy) => copy[k][col];
  const [tasks, setTasks] = useState<any[]>([]),
    [selected, setSelected] = useState<string | null>(null),
    [detail, setDetail] = useState<any>(null),
    [objective, setObjective] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [tools, setTools] = useState<string[]>([]);
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  async function request(path: string, body?: unknown) {
    const res = await apiFetch(
      "/api/agents/" + path,
      body
        ? {
            method: "POST",
            headers: { "X-CSRF-Token": getCsrfToken() },
            body: JSON.stringify(body),
          }
        : {},
    );
    const data = await res.json();
    if (!res.ok)
      throw new Error(`${t("error")} (${res.status}; ${data.requestId || ""})`);
    return data;
  }
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    void request("tools")
      .then((catalog) => {
        if (alive) setTools(catalog.tools.map((x: any) => x.tool));
      })
      .catch(() => {});
    const load = async () => {
      try {
        const list = await request("tasks");
        if (!alive) return;
        setTasks(list.tasks);
        onActivity(list.tasks.some((task: any) => task.status === "running"));
        if (selected) {
          const d = await request("tasks/" + selected);
          if (alive) {
            setDetail(d);
          }
        }
        const catalog = await request("tools");
        if (alive) setTools(catalog.tools.map((x: any) => x.tool));
      } catch (e) {
        if (alive)
          setError(
            t("error") +
              ((e as any)?.requestId ? " · " + (e as any).requestId : ""),
          );
      } finally {
        if (alive) timer = setTimeout(load, 5000);
      }
    };
    void load();
    return () => {
      alive = false;
      clearTimeout(timer);
      onActivity(false);
    };
  }, [selected, language]);
  async function action(path: string, body: unknown = {}) {
    setBusy(true);
    setError("");
    try {
      const d = await request(path, body);
      if (d.task) {
        setSelected(d.task.id);
        setObjective("");
        setRequestKey(crypto.randomUUID());
      }
      if (selected) setDetail(await request("tasks/" + selected));
      setTasks((await request("tasks")).tasks);
    } catch (e) {
      setError(
        t("error") +
          ((e as any)?.requestId ? " · " + (e as any).requestId : ""),
      );
    } finally {
      setBusy(false);
    }
  }
  const status = (s: string) => (s in copy ? t(s as keyof typeof copy) : s);
  return (
    <section className="j-local-page afg-agents">
      <h1>{t("title")}</h1>
      <p>{t("intro")}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void action("tasks", { objective, model, requestKey });
        }}
      >
        <label htmlFor="agent-objective">{t("objective")}</label>
        <textarea
          id="agent-objective"
          required
          maxLength={4000}
          value={objective}
          onChange={(e) => {
            setObjective(e.target.value);
            setRequestKey(crypto.randomUUID());
          }}
        />
        <small>
          {t("model")}: {model}
        </small>
        <button disabled={busy || !objective.trim()}>{t("create")}</button>
      </form>
      {error && <p role="alert">{error}</p>}
      <details>
        <summary>
          {t("tools")} ({tools.length})
        </summary>
        <p>{tools.join(", ")}</p>
      </details>
      <div className="afg-agent-grid">
        <nav aria-label={t("history")}>
          {tasks.length ? (
            tasks.map((task) => (
              <button
                key={task.id}
                aria-current={selected === task.id ? "true" : undefined}
                onClick={() => {
                  setSelected(task.id);
                  setDetail(null);
                }}
              >
                <strong>{task.objective}</strong>
                <span>{status(task.status)}</span>
              </button>
            ))
          ) : (
            <p>{t("empty")}</p>
          )}
        </nav>
        {detail && detail.task.id === selected && (
          <article>
            <h2>{detail.task.objective}</h2>
            <p role="status">{status(detail.task.status)}</p>
            {detail.task.error && <p role="alert">{t("error")}</p>}
            <div className="afg-agent-actions">
              {detail.task.status === "draft" && (
                <button
                  disabled={busy}
                  onClick={() => action("tasks/" + selected + "/start")}
                >
                  {t("start")}
                </button>
              )}
              {["failed", "running"].includes(detail.task.status) && (
                <button
                  disabled={busy}
                  onClick={() => action("tasks/" + selected + "/resume")}
                >
                  {t("resume")}
                </button>
              )}
              {!["completed", "cancelled"].includes(detail.task.status) && (
                <button
                  disabled={busy}
                  onClick={() => action("tasks/" + selected + "/cancel")}
                >
                  {t("cancel")}
                </button>
              )}
            </div>
            <ol>
              {detail.steps.map((step: any) => (
                <li key={step.id}>
                  <strong>
                    {step.position + 1}. {step.agent} · {step.tool}
                  </strong>
                  <p>
                    {status(step.status)} · {step.attempts}
                  </p>
                  <details open={step.status === "waiting_for_approval"}>
                    <summary>{t("details")}</summary>
                    <pre>
                      {JSON.stringify(
                        { input: step.input, output: step.output },
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                  {step.status === "waiting_for_approval" && (
                    <div>
                      <p>{t("inspect")}</p>
                      <button
                        disabled={busy}
                        onClick={() =>
                          action("tasks/" + selected + "/approve", {
                            stepId: step.id,
                            approved: true,
                          })
                        }
                      >
                        {t("approve")}
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ol>
            <details>
              <summary>{t("history")}</summary>
              <ol>
                {detail.events.map((event: any) => (
                  <li key={event.id}>
                    <time>
                      {new Date(event.created_at).toLocaleString(
                        language === "english"
                          ? "en"
                          : language === "arabic"
                            ? "ar"
                            : language === "pashto"
                              ? "ps"
                              : "fa",
                      )}
                    </time>{" "}
                    · {event.kind}
                  </li>
                ))}
              </ol>
            </details>
          </article>
        )}
      </div>
    </section>
  );
}
