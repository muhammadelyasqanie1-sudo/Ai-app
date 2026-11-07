import assert from "node:assert/strict";
import {
  resolveCoreState,
  resolveGraphics,
  readExperience,
  EXPERIENCE_KEY,
} from "../src/components/jarvis/experience";
import { experienceCopy } from "../src/components/jarvis/experienceCopy";
const idle = {
  listening: false,
  active: false,
  streaming: false,
  online: true,
  failed: false,
  activities: [],
};
assert.equal(resolveCoreState(idle), "idle");
assert.equal(resolveCoreState({ ...idle, online: false }), "offline");
assert.equal(resolveCoreState({ ...idle, active: true }), "thinking");
assert.equal(
  resolveCoreState({ ...idle, active: true, streaming: true }),
  "generating",
);
assert.equal(
  resolveCoreState({
    ...idle,
    active: true,
    activities: [{ name: "web_search", label: "Search", status: "running" }],
  }),
  "searching",
);
assert.equal(
  resolveCoreState({
    ...idle,
    active: true,
    activities: [{ name: "file_analysis", label: "File", status: "running" }],
  }),
  "executing",
);
// Historical tools and partial cancelled text must not leave the core running.
assert.equal(
  resolveCoreState({
    ...idle,
    streaming: true,
    activities: [{ name: "web_search", label: "Search", status: "running" }],
  }),
  "idle",
);
assert.equal(
  resolveCoreState({
    ...idle,
    active: true,
    activities: [{ name: "web_search", label: "Search", status: "completed" }],
  }),
  "thinking",
);
assert.equal(resolveCoreState({ ...idle, failed: true }), "error");
assert.equal(
  resolveCoreState({ ...idle, listening: true, failed: true }),
  "listening",
);
assert.equal(resolveGraphics("auto", {}), "balanced");
assert.equal(resolveGraphics("auto", { memory: 4, cores: 8 }), "low");
assert.equal(resolveGraphics("auto", { saveData: true }), "low");
assert.equal(resolveGraphics("high", { memory: 2 }), "high");
const data = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  value: { getItem: (key: string) => data.get(key) || null },
  configurable: true,
});
data.set(EXPERIENCE_KEY, '{"graphics":"ultra","motion":"off","panel":"yes"}');
assert.deepEqual(readExperience(), {
  graphics: "auto",
  motion: "system",
  panel: true,
});
data.set(EXPERIENCE_KEY, "malformed");
assert.equal(readExperience().graphics, "auto");
data.set(EXPERIENCE_KEY, '{"graphics":"low","motion":"reduced","panel":false}');
assert.deepEqual(readExperience(), {
  graphics: "low",
  motion: "reduced",
  panel: false,
});
Object.defineProperty(globalThis, "localStorage", {
  get: () => {
    throw new Error("denied");
  },
  configurable: true,
});
assert.equal(readExperience().graphics, "auto");
assert.equal(
  resolveCoreState({ ...idle, cancelled: true, failed: true }),
  "cancelled",
);
const english = experienceCopy("english");
for (const language of ["dari", "pashto", "persian", "arabic"] as const) {
  const copy = experienceCopy(language);
  assert.deepEqual(Object.keys(copy).sort(), Object.keys(english).sort());
  assert.ok(Object.values(copy).every((value) => value.trim().length > 0));
}
console.log(
  "AFG experience: activity truth, cancellation, graphics policy, storage resilience and locale coverage passed.",
);
