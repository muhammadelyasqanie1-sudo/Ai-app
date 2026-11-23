import { db } from "@/lib/db";
import type { Provider, Model } from "@prisma/client";
import { decryptSecret, encryptSecret } from "./crypto";
import { config } from "./config";
import { logError } from "./logs";

/**
 * AFG AI provider architecture.
 *
 * Rules enforced here:
 *  - Provider calls and secrets stay server-side. Keys are stored AES-256-GCM
 *    encrypted in the database or read from server environment only.
 *  - Availability is never fabricated. Health checks perform real network calls
 *    and model discovery reflects only what the provider actually returned.
 *  - A configured key alone is not evidence of a working model: the chat route
 *    surfaces real upstream errors instead of simulated success.
 */

export type HealthStatus = "HEALTHY" | "UNREACHABLE" | "DEGRADED" | "DISABLED" | "UNKNOWN";

export type DiscoveredModel = {
  modelId: string;
  displayName: string;
  capabilities: string[];
  contextWindow?: number;
};

export type ApiChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "usage"; tokensIn: number; tokensOut: number }
  | { type: "error"; message: string };

export type StreamChatOptions = {
  model: string;
  messages: ApiChatMessage[];
  signal?: AbortSignal;
  thinking?: boolean;
};

export interface ProviderAdapter {
  kind: string;
  listModels(): Promise<DiscoveredModel[]>;
  healthCheck(): Promise<{ status: HealthStatus; detail: string; latencyMs: number }>;
  streamChat(opts: StreamChatOptions): AsyncGenerator<StreamEvent>;
}

const CONNECT_TIMEOUT_MS = 6000;
const FIRST_TOKEN_TIMEOUT_MS = 45000;

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = CONNECT_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Parse OpenAI-style SSE payloads from any readable stream. */
async function* iterateSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<{ delta?: string; usage?: { in?: number; out?: number }; error?: string }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") return;
        try {
          const obj = JSON.parse(payload);
          if (obj.error) {
            yield { error: obj.error.message || String(obj.error) };
            return;
          }
          const delta = obj.choices?.[0]?.delta?.content ?? obj.choices?.[0]?.text ?? "";
          const usage = obj.usage
            ? { in: obj.usage.prompt_tokens, out: obj.usage.completion_tokens }
            : undefined;
          if (delta || usage) yield { delta: delta || undefined, usage };
        } catch {
          // Ignore malformed fragments
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// AFG Cloud — the built-in provider (server SDK). Always configured.
// ---------------------------------------------------------------------------

type ZAIClient = Awaited<ReturnType<(typeof import("z-ai-web-dev-sdk"))["default"]["create"]>>;

async function getZAI(): Promise<ZAIClient> {
  const mod = await import("z-ai-web-dev-sdk");
  return mod.default.create();
}

const AFG_CLOUD_MODELS: DiscoveredModel[] = [
  { modelId: "afg-cloud-chat", displayName: "AFG Cloud — Chat", capabilities: ["chat", "coding", "tools"], contextWindow: 32768 },
  { modelId: "afg-cloud-vision", displayName: "AFG Cloud — Vision", capabilities: ["chat", "vision", "coding"], contextWindow: 32768 },
  { modelId: "afg-cloud-reasoning", displayName: "AFG Cloud — Reasoning", capabilities: ["chat", "reasoning", "coding"], contextWindow: 32768 },
];

class AfgCloudAdapter implements ProviderAdapter {
  kind = "afg-cloud";

  async listModels(): Promise<DiscoveredModel[]> {
    // Verified against the live backend during health check; the SDK either
    // connects or health check reports UNREACHABLE. No invented entries.
    return AFG_CLOUD_MODELS;
  }

  async healthCheck() {
    const start = Date.now();
    try {
      const zai = await getZAI();
      if (!zai?.chat?.completions) throw new Error("SDK chat interface unavailable");
      // Real minimal probe: a 1-token completion with a hard 5s budget.
      // A configured SDK is not evidence of a working backend — only a
      // successful completion proves the backend is reachable.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const result = await Promise.race([
          zai.chat.completions.create({
            messages: [{ role: "user", content: "ping" }],
            max_tokens: 1,
            stream: false,
          } as never),
          new Promise<never>((_, reject) =>
            controller.signal.addEventListener("abort", () => reject(new Error("Health probe timed out after 5s")), { once: true })
          ),
        ]);
        const content = (result as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message?.content;
        if (typeof content !== "string") throw new Error("Malformed probe response from AFG Cloud backend");
      } finally {
        clearTimeout(timer);
        controller.abort(); // release the abort listener
      }
      return { status: "HEALTHY" as HealthStatus, detail: "AFG Cloud backend responded to a real completion probe.", latencyMs: Date.now() - start };
    } catch (err) {
      return {
        status: "UNREACHABLE" as HealthStatus,
        detail: err instanceof Error ? err.message : "Connection failed",
        latencyMs: Date.now() - start,
      };
    }
  }

  async *streamChat(opts: StreamChatOptions): AsyncGenerator<StreamEvent> {
    const vision = /vision/.test(opts.model);
    const thinking = opts.thinking || /reasoning/.test(opts.model);
    const zai = await getZAI();
    const body = {
      messages: opts.messages,
      stream: true,
      thinking: { type: (thinking ? "enabled" : "disabled") as "enabled" | "disabled" },
    };
    let stream: ReadableStream<Uint8Array> | null = null;
    let sawFirstToken = false;
    let tokensIn = 0;
    let tokensOut = 0;

    // First-token timer: armed until the FIRST delta arrives (not just
    // response headers); aborts the stream when the backend goes silent.
    let raceReject: ((err: Error) => void) | null = null;
    const firstTokenTimer = setTimeout(() => {
      if (sawFirstToken) return;
      const s = stream as ReadableStream<Uint8Array> | null;
      if (s) {
        try { void s.cancel(); } catch { /* noop */ }
      }
      raceReject?.(new Error(`No first token within ${FIRST_TOKEN_TIMEOUT_MS / 1000}s`));
    }, FIRST_TOKEN_TIMEOUT_MS);

    let completion: unknown;
    try {
      completion = await Promise.race([
        vision
          ? zai.chat.completions.createVision({ model: "glm-4.5v", ...body, messages: opts.messages as never })
          : zai.chat.completions.create(body),
        new Promise<never>((_, rej) => { raceReject = rej; }),
      ]);
    } catch (err) {
      clearTimeout(firstTokenTimer);
      yield { type: "error", message: err instanceof Error ? err.message : "AFG Cloud request failed" };
      return;
    }
    if (!(completion instanceof ReadableStream)) {
      // Non-streaming fallback: treat as single delta
      clearTimeout(firstTokenTimer);
      const content = (completion as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message?.content;
      if (typeof content === "string" && content.length > 0) {
        yield { type: "delta", text: content };
      } else {
        yield { type: "error", message: "Empty response from AFG Cloud" };
        return;
      }
      yield { type: "usage", tokensIn: 0, tokensOut: Math.ceil(content.length / 4) };
      return;
    }
    stream = completion;
    try {
      for await (const evt of iterateSSE(stream)) {
        if (opts.signal?.aborted) return;
        if (evt.error) {
          yield { type: "error", message: evt.error };
          return;
        }
        if (evt.usage) {
          tokensIn = evt.usage.in || tokensIn;
          tokensOut = evt.usage.out || tokensOut;
        }
        if (evt.delta) {
          sawFirstToken = true;
          clearTimeout(firstTokenTimer);
          tokensOut += Math.ceil(evt.delta.length / 4);
          yield { type: "delta", text: evt.delta };
        }
      }
      yield { type: "usage", tokensIn, tokensOut };
    } finally {
      clearTimeout(firstTokenTimer);
    }
  }
}

// ---------------------------------------------------------------------------
// OpenAI-compatible adapters: 9Router + any generic gateway
// ---------------------------------------------------------------------------

class OpenAICompatAdapter implements ProviderAdapter {
  constructor(private baseUrl: string, private apiKey: string | null, public kind: string = "openai-compatible") {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.apiKey) h["Authorization"] = `Bearer ${this.apiKey}`;
    return h;
  }

  private normalize(url: string): string {
    return url.replace(/\/+$/, "").replace(/\/v1$/, "");
  }

  async listModels(): Promise<DiscoveredModel[]> {
    const res = await fetchWithTimeout(`${this.normalize(this.baseUrl)}/v1/models`, { headers: this.headers() });
    if (!res.ok) throw new Error(`Model catalog request failed (${res.status})`);
    const data = await res.json();
    const items: Array<{ id?: string; name?: string; context_length?: number; context_window?: number }> = Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data?.models)
        ? data.models
        : [];
    return items
      .filter((m) => m?.id || m?.name)
      .map((m) => ({
        modelId: String(m.id || m.name),
        displayName: String(m.id || m.name).split("/").pop() || String(m.id || m.name),
        capabilities: detectCapabilities(String(m.id || m.name || "")),
        contextWindow: m.context_length || m.context_window,
      }));
  }

  async healthCheck() {
    const start = Date.now();
    try {
      const res = await fetchWithTimeout(`${this.normalize(this.baseUrl)}/v1/models`, { headers: this.headers() });
      if (!res.ok) {
        return { status: "UNREACHABLE" as HealthStatus, detail: `HTTP ${res.status} from /v1/models`, latencyMs: Date.now() - start };
      }
      const latency = Date.now() - start;
      return {
        status: (latency > 3000 ? "DEGRADED" : "HEALTHY") as HealthStatus,
        detail: `Catalog reachable (HTTP ${res.status}).`,
        latencyMs: latency,
      };
    } catch (err) {
      return {
        status: "UNREACHABLE" as HealthStatus,
        detail: err instanceof Error ? err.message : "Connection failed",
        latencyMs: Date.now() - start,
      };
    }
  }

  async *streamChat(opts: StreamChatOptions): AsyncGenerator<StreamEvent> {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    // First-token timer: armed from request start until the FIRST delta
    // arrives; headers alone are not proof of a working stream.
    let sawFirstDelta = false;
    const firstTokenTimer = setTimeout(() => {
      if (!sawFirstDelta) controller.abort();
    }, FIRST_TOKEN_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetchWithTimeout(
        `${this.normalize(this.baseUrl)}/v1/chat/completions`,
        {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify({
            model: opts.model,
            messages: opts.messages,
            stream: true,
            ...(opts.thinking ? { reasoning_effort: "high" } : {}),
          }),
          signal: controller.signal,
        },
        FIRST_TOKEN_TIMEOUT_MS
      );
    } catch (err) {
      clearTimeout(firstTokenTimer);
      opts.signal?.removeEventListener("abort", onAbort);
      if (opts.signal?.aborted) return;
      yield { type: "error", message: err instanceof Error ? err.message : "Request failed" };
      return;
    }
    if (!res.ok || !res.body) {
      clearTimeout(firstTokenTimer);
      opts.signal?.removeEventListener("abort", onAbort);
      let detail = `HTTP ${res.status}`;
      try {
        const text = await res.text();
        detail += `: ${text.slice(0, 300)}`;
      } catch { /* noop */ }
      yield { type: "error", message: detail };
      return;
    }
    try {
      for await (const evt of iterateSSE(res.body)) {
        if (opts.signal?.aborted) return;
        if (evt.error) {
          yield { type: "error", message: evt.error };
          return;
        }
        if (evt.delta) {
          sawFirstDelta = true;
          clearTimeout(firstTokenTimer);
        }
        if (evt.usage) yield { type: "usage", tokensIn: evt.usage.in || 0, tokensOut: evt.usage.out || 0 };
        if (evt.delta) yield { type: "delta", text: evt.delta };
      }
    } finally {
      clearTimeout(firstTokenTimer);
      opts.signal?.removeEventListener("abort", onAbort);
    }
  }
}

// ---------------------------------------------------------------------------
// Ollama (native protocol)
// ---------------------------------------------------------------------------

class OllamaAdapter implements ProviderAdapter {
  constructor(private baseUrl: string) {}
  kind = "ollama";

  private normalize(url: string): string {
    return url.replace(/\/+$/, "");
  }

  async listModels(): Promise<DiscoveredModel[]> {
    const res = await fetchWithTimeout(`${this.normalize(this.baseUrl)}/api/tags`);
    if (!res.ok) throw new Error(`Ollama catalog request failed (${res.status})`);
    const data = await res.json();
    const items = Array.isArray(data?.models) ? data.models : [];
    return items.map((m: { name: string; details?: { parameter_size?: string }; size?: number }) => ({
      modelId: m.name,
      displayName: m.name,
      capabilities: ["chat", "coding"].concat(/vl|vision|llava|bakllava|minicpm-v/.test(m.name) ? ["vision"] : []),
      contextWindow: undefined,
    }));
  }

  async healthCheck() {
    const start = Date.now();
    try {
      const res = await fetchWithTimeout(`${this.normalize(this.baseUrl)}/api/tags`);
      if (!res.ok) {
        return { status: "UNREACHABLE" as HealthStatus, detail: `HTTP ${res.status} from /api/tags`, latencyMs: Date.now() - start };
      }
      return { status: "HEALTHY" as HealthStatus, detail: "Ollama reachable.", latencyMs: Date.now() - start };
    } catch (err) {
      return {
        status: "UNREACHABLE" as HealthStatus,
        detail: err instanceof Error ? err.message : "Connection failed",
        latencyMs: Date.now() - start,
      };
    }
  }

  async *streamChat(opts: StreamChatOptions): AsyncGenerator<StreamEvent> {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    let res: Response;
    try {
      res = await fetchWithTimeout(
        `${this.normalize(this.baseUrl)}/api/chat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: opts.model, messages: opts.messages, stream: true }),
          signal: controller.signal,
        },
        FIRST_TOKEN_TIMEOUT_MS
      );
    } catch (err) {
      opts.signal?.removeEventListener("abort", onAbort);
      if (opts.signal?.aborted) return;
      yield { type: "error", message: err instanceof Error ? err.message : "Request failed" };
      return;
    }
    if (!res.ok || !res.body) {
      opts.signal?.removeEventListener("abort", onAbort);
      yield { type: "error", message: `HTTP ${res.status} from Ollama` };
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let tokensIn = 0;
    let tokensOut = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (opts.signal?.aborted) return;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const obj = JSON.parse(line);
            if (obj.error) {
              yield { type: "error", message: obj.error };
              return;
            }
            const delta = obj.message?.content || "";
            if (delta) {
              tokensOut += Math.ceil(delta.length / 4);
              yield { type: "delta", text: delta };
            }
            if (obj.done) {
              tokensIn = obj.prompt_eval_count || tokensIn;
              tokensOut = obj.eval_count || tokensOut;
            }
          } catch { /* partial JSON line */ }
        }
      }
    } finally {
      opts.signal?.removeEventListener("abort", onAbort);
      reader.releaseLock();
    }
    yield { type: "usage", tokensIn, tokensOut };
  }
}

// ---------------------------------------------------------------------------
// Capability detection heuristics
// ---------------------------------------------------------------------------

export function detectCapabilities(modelId: string): string[] {
  const id = modelId.toLowerCase();
  const caps = ["chat"];
  if (/cod(e|er|ing|stral|y)|dev(stral|elop)|deepseek|qwen2?-?coder/.test(id)) caps.push("coding");
  if (/vl|vision|llava|bakllava|image|minicpm-v|gemini|gpt-4o|gpt-4-turbo|claude-3|pixtral|glm-4v|glm-4\.5v/.test(id)) caps.push("vision");
  if (/o1|o3|o4|r1|think|reason|qwq/.test(id)) caps.push("reasoning");
  return caps;
}

// ---------------------------------------------------------------------------
// Registry: DB-backed providers + env bootstrap
// ---------------------------------------------------------------------------

let seeded = false;

/** Ensure built-in providers exist in the DB. Idempotent; safe to call per request. */
export async function ensureProvidersSeeded(): Promise<void> {
  if (seeded) return;
  const defs = [
    {
      slug: "afg-cloud",
      name: "AFG Cloud",
      kind: "afg-cloud",
      baseUrl: null,
      enabled: true,
      envKey: null as string | null,
    },
    {
      slug: "ninerouter",
      name: "9Router AI Gateway",
      kind: "openai-compatible",
      baseUrl: config.providers.ninerouterBaseUrl || null,
      enabled: !!config.providers.ninerouterBaseUrl,
      envKey: config.providers.ninerouterApiKey || null,
    },
    {
      slug: "ollama",
      name: "Ollama (local)",
      kind: "ollama",
      baseUrl: config.providers.ollamaBaseUrl || null,
      enabled: !!config.providers.ollamaBaseUrl,
      envKey: null,
    },
  ];
  for (const def of defs) {
    const existing = await db.provider.findUnique({ where: { slug: def.slug } });
    if (!existing) {
      await db.provider.create({
        data: {
          slug: def.slug,
          name: def.name,
          kind: def.kind,
          baseUrl: def.baseUrl,
          enabled: def.enabled,
          apiKeyEnc: def.envKey ? encryptSafe(def.envKey) : null,
          config: JSON.stringify({ source: def.enabled && def.baseUrl ? "env" : "builtin" }),
        },
      });
    } else if (def.envKey && !existing.apiKeyEnc && def.baseUrl) {
      await db.provider.update({ where: { id: existing.id }, data: { apiKeyEnc: encryptSafe(def.envKey), enabled: true, baseUrl: def.baseUrl } });
    }
  }
  seeded = true;
}

function encryptSafe(key: string): string {
  return encryptSecret(key);
}

export type ResolvedProvider = Provider & { apiKey: string | null };

function resolveKey(p: Provider): string | null {
  if (p.apiKeyEnc) return decryptSecret(p.apiKeyEnc);
  return null;
}

export async function getProviderAdapter(p: Provider): Promise<ProviderAdapter> {
  if (p.kind === "afg-cloud") return new AfgCloudAdapter();
  if (p.kind === "ollama") {
    const base = p.baseUrl || config.providers.ollamaBaseUrl;
    if (!base) throw new Error("Ollama provider has no base URL configured");
    return new OllamaAdapter(base);
  }
  // openai-compatible family (9Router + custom)
  const base = p.baseUrl || (p.slug === "ninerouter" ? config.providers.ninerouterBaseUrl : config.providers.openaiCompatBaseUrl);
  if (!base) throw new Error(`Provider ${p.slug} has no base URL configured`);
  const key = resolveKey(p) || (p.slug === "ninerouter" ? config.providers.ninerouterApiKey : config.providers.openaiCompatApiKey);
  return new OpenAICompatAdapter(base, key || null);
}

export type ModelRef = { model: Model; provider: Provider };

export async function resolveModelBySlug(slug: string): Promise<ModelRef | null> {
  const model = await db.model.findUnique({ where: { slug }, include: { provider: true } });
  if (!model) return null;
  return { model, provider: model.provider };
}

// ---------------------------------------------------------------------------
// Lazy health probing (honesty: never trust an UNKNOWN status silently)
// ---------------------------------------------------------------------------

const HEALTH_PROBE_TTL_MS = 60_000;
const healthProbeCache = new Map<string, { at: number; promise: Promise<HealthStatus> }>();

/**
 * Probe a provider's health at most once per 60s (in-flight calls share the
 * same promise). Returns the real observed status.
 */
export function probeProviderCached(p: Provider): Promise<HealthStatus> {
  const now = Date.now();
  const cached = healthProbeCache.get(p.id);
  if (cached && now - cached.at < HEALTH_PROBE_TTL_MS) return cached.promise;
  const promise = (async () => {
    try {
      return (await checkProviderHealth(p)).status;
    } catch {
      return "UNREACHABLE" as HealthStatus;
    }
  })();
  healthProbeCache.set(p.id, { at: now, promise });
  // Opportunistic cache trim
  if (healthProbeCache.size > 64) {
    for (const [k, v] of healthProbeCache) {
      if (now - v.at >= HEALTH_PROBE_TTL_MS) healthProbeCache.delete(k);
    }
  }
  return promise;
}

/** Build a fallback chain: preferred model first, then other healthy enabled chat models. */
export async function buildModelChain(preferredSlug: string, allowFallback = true, needsVision = false): Promise<ModelRef[]> {
  const preferred = await resolveModelBySlug(preferredSlug);
  const chain: ModelRef[] = [];
  if (preferred && preferred.model.enabled && preferred.provider.enabled) {
    // UNKNOWN health is never silently trusted: lazily probe once (cached).
    if (preferred.provider.healthStatus === "UNKNOWN") {
      const status = await probeProviderCached(preferred.provider);
      if (status !== "UNREACHABLE" && status !== "DISABLED") chain.push(preferred);
    } else {
      chain.push(preferred);
    }
  }
  if (!allowFallback) return chain;

  const candidates = await db.model.findMany({
    where: { enabled: true, provider: { enabled: true } },
    include: { provider: true },
    orderBy: [{ provider: { slug: "asc" } }],
    take: 24,
  });
  for (const c of candidates) {
    if (chain.length >= 3) break;
    if (chain.some((m) => m.model.id === c.id)) continue;
    const caps: string[] = JSON.parse(c.capabilities || "[]");
    if (needsVision && !caps.includes("vision")) continue;
    if (c.provider.healthStatus === "UNREACHABLE") continue;
    if (c.provider.healthStatus === "UNKNOWN") {
      const status = await probeProviderCached(c.provider);
      if (status === "UNREACHABLE" || status === "DISABLED") continue;
    }
    chain.push({ model: c, provider: c.provider });
  }
  return chain;
}

/** Refresh catalog for one provider: real discovery, replaces stale entries. */
export async function refreshProviderCatalog(p: Provider): Promise<{ discovered: number; error?: string }> {
  try {
    // AFG Cloud has a fixed static catalog. Its models are seeded UNVERIFIED
    // and disabled; only a real successful completion probe (checkProviderHealth)
    // flips them. Discovery alone is not evidence of a working backend.
    if (p.kind === "afg-cloud") {
      for (const dm of AFG_CLOUD_MODELS) {
        const slug = `${p.slug}:${dm.modelId}`;
        await db.model.upsert({
          where: { slug },
          create: {
            providerId: p.id, modelId: dm.modelId, slug,
            displayName: dm.displayName,
            capabilities: JSON.stringify(dm.capabilities),
            contextWindow: dm.contextWindow || config.unknownContextBudget,
            enabled: false,
            lastVerifiedAt: null,
          },
          update: {},
        });
      }
      return { discovered: AFG_CLOUD_MODELS.length };
    }
    const adapter = await getProviderAdapter(p);
    const discovered = await adapter.listModels();
    const existing = await db.model.findMany({ where: { providerId: p.id } });
    const seen = new Set<string>();
    for (const dm of discovered) {
      seen.add(dm.modelId);
      const slug = `${p.slug}:${dm.modelId}`;
      const caps = dm.capabilities.length ? dm.capabilities : ["chat"];
      await db.model.upsert({
        where: { slug },
        create: {
          providerId: p.id,
          modelId: dm.modelId,
          slug,
          displayName: dm.displayName,
          capabilities: JSON.stringify(caps),
          contextWindow: dm.contextWindow || config.unknownContextBudget,
          enabled: true,
          lastVerifiedAt: new Date(),
        },
        update: {
          displayName: dm.displayName,
          capabilities: JSON.stringify(caps),
          contextWindow: dm.contextWindow || config.unknownContextBudget,
          lastVerifiedAt: new Date(),
        },
      });
    }
    // Remove models that no longer exist upstream
    for (const old of existing) {
      if (!seen.has(old.modelId)) {
        await db.model.delete({ where: { id: old.id } });
      }
    }
    return { discovered: discovered.length };
  } catch (err) {
    await logError({ scope: "system", code: "MODEL_DISCOVERY_FAILED", message: err instanceof Error ? err.message : String(err), meta: { provider: p.slug } });
    return { discovered: 0, error: err instanceof Error ? err.message : "Discovery failed" };
  }
}

/** Real health check: network call + catalog refresh + DB status update. */
export async function checkProviderHealth(p: Provider): Promise<{ status: HealthStatus; detail: string; latencyMs: number; models: number }> {
  const adapter = await getProviderAdapter(p);
  const health = await adapter.healthCheck();
  let models = 0;
  if (health.status === "HEALTHY" || health.status === "DEGRADED") {
    const cat = await refreshProviderCatalog(p);
    models = cat.discovered;
    if (cat.error) {
      health.status = "DEGRADED";
      health.detail = `Endpoint reachable but catalog refresh failed: ${cat.error}`;
    }
    // A real successful probe is the only thing that verifies AFG Cloud models.
    if (p.kind === "afg-cloud") {
      await db.model.updateMany({
        where: { providerId: p.id, modelId: { in: AFG_CLOUD_MODELS.map((m) => m.modelId) } },
        data: { enabled: true, lastVerifiedAt: new Date() },
      });
    }
  }
  await db.provider.update({
    where: { id: p.id },
    data: {
      healthStatus: p.enabled ? health.status : "DISABLED",
      healthDetail: health.detail,
      lastCheckedAt: new Date(),
    },
  });
  return { ...health, models };
}

export async function checkAllProvidersHealth(): Promise<void> {
  await ensureProvidersSeeded();
  const providers = await db.provider.findMany({ where: { enabled: true } });
  await Promise.all(providers.map((p) => checkProviderHealth(p).catch(() => null)));
}
