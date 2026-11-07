import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../lib/apiClient";

import { readTasks, TASK_KEY, type LocalTask } from "./taskStorage";
export function useLocalTasks(userId?: string) {
  const storageKey = userId ? `${TASK_KEY}:account:${userId}` : TASK_KEY;
  const [loaded] = useState(() => {
    try {
      return { tasks: readTasks(localStorage, storageKey), error: "" };
    } catch {
      return {
        tasks: [] as LocalTask[],
        error:
          "Existing task storage cannot be read. It has been preserved; recover or clear this browser’s JARVIS task storage before adding tasks.",
      };
    }
  });
  const [error, setError] = useState(loaded.error);
  const [tasks, setTasks] = useState<LocalTask[]>(loaded.tasks);
  const update = (next: LocalTask[]) => {
    if (loaded.error) return false;
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setTasks(next);
      setError("");
      return true;
    } catch {
      setError("Device storage is unavailable. Your changes were not saved.");
      return false;
    }
  };
  return {
    tasks,
    error,
    add: (title: string) => {
      if (tasks.length >= 500) {
        setError("Task limit reached. Delete a task before adding another.");
        return;
      }
      if (title.trim())
        return update([
          {
            id: crypto.randomUUID(),
            title: title.trim().slice(0, 300),
            done: false,
            createdAt: Date.now(),
          },
          ...tasks,
        ]);
    },
    toggle: (id: string) =>
      update(tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t))),
    remove: (id: string) => update(tasks.filter((t) => t.id !== id)),
  };
}
export function useCommandStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  const [backend, setBackend] = useState<"checking" | "online" | "unavailable">(
    "checking",
  );
  const [database, setDatabase] = useState<
    "checking" | "online" | "configuration" | "unavailable"
  >("checking");
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const changed = () => {
      setOnline(navigator.onLine);
      setRefresh((v) => v + 1);
    };
    window.addEventListener("online", changed);
    window.addEventListener("offline", changed);
    return () => {
      window.removeEventListener("online", changed);
      window.removeEventListener("offline", changed);
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const check = async () => {
      const signal = AbortSignal.any([
        controller.signal,
        AbortSignal.timeout(8000),
      ]);
      await Promise.allSettled([
        apiFetch("/api/health", { signal, cache: "no-store" })
          .then((r) => r.json())
          .then((d) => {
            if (active)
              setBackend(d.status === "ok" ? "online" : "unavailable");
          })
          .catch(() => {
            if (active) setBackend("unavailable");
          }),
        apiFetch("/api/ready", { signal, cache: "no-store" })
          .then((r) => r.json())
          .then((d) => {
            if (active)
              setDatabase(d.database?.connected ? "online" : "unavailable");
          })
          .catch(() => {
            if (active) setDatabase("unavailable");
          }),
      ]);
      if (active) setCheckedAt(new Date());
    };
    void check();
    const interval = window.setInterval(() => {
      void check();
    }, 30000);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(interval);
    };
  }, [refresh]);
  return {
    online,
    backend,
    database,
    checkedAt,
    refresh: useCallback(() => setRefresh((v) => v + 1), []),
  };
}
