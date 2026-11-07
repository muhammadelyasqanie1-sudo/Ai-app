import assert from "node:assert/strict";
import { readTasks } from "../src/components/jarvis/taskStorage.ts";
const from = (value: string | null) => ({ getItem: () => value });
assert.deepEqual(readTasks(from(null)), []);
const valid = [
  { id: "a", title: "Keep offline data", done: false, createdAt: 1000 },
];
assert.deepEqual(readTasks(from(JSON.stringify(valid))), valid);
for (const invalid of [
  "{broken",
  "{}",
  "null",
  JSON.stringify([{ ...valid[0], done: "yes" }]),
  JSON.stringify([valid[0], valid[0]]),
  JSON.stringify([{ ...valid[0], title: "x".repeat(301) }]),
  JSON.stringify(
    Array.from({ length: 501 }, (_, i) => ({ ...valid[0], id: String(i) })),
  ),
]) {
  assert.throws(() => readTasks(from(invalid)));
}
assert.throws(() =>
  readTasks({
    getItem: () => {
      throw new DOMException("Storage blocked", "SecurityError");
    },
  }),
);
console.log(
  "JARVIS task storage: valid persistence, malformed records, duplicates, limits, and denied storage passed.",
);

const scoped = { getItem: (key: string) => key.endsWith(":account:A") ? JSON.stringify([{id:"a",title:"Private",done:false,createdAt:1}]) : null };
assert.equal(readTasks(scoped, "jarvis-local-tasks-v1:account:A").length, 1);
assert.equal(readTasks(scoped, "jarvis-local-tasks-v1:account:B").length, 0);
