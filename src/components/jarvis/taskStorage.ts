export type LocalTask = {
  id: string;
  title: string;
  done: boolean;
  createdAt: number;
};
export const TASK_KEY = "jarvis-local-tasks-v1";
export function readTasks(storage: Pick<Storage, "getItem">, key = TASK_KEY): LocalTask[] {
  const value: unknown = JSON.parse(storage.getItem(key) || "[]");
  if (
    !Array.isArray(value) ||
    value.length > 500 ||
    !value.every(
      (t) =>
        t &&
        typeof t.id === "string" &&
        t.id.length > 0 &&
        typeof t.title === "string" &&
        t.title.trim().length > 0 &&
        t.title.length <= 300 &&
        typeof t.done === "boolean" &&
        typeof t.createdAt === "number" &&
        Number.isFinite(t.createdAt),
    ) ||
    new Set(value.map((t) => t.id)).size !== value.length
  )
    throw new Error("Invalid task storage");
  return value;
}
