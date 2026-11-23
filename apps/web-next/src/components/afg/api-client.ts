"use client";

/** Typed API client for AFG AI frontend. All requests are same-origin. */

export type ApiError = { code: string; message: string };

export class ApiClientError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err = (data as { error?: ApiError })?.error;
    throw new ApiClientError(err?.code || "REQUEST_FAILED", err?.message || res.statusText || "Request failed", res.status);
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>(url, { cache: "no-store" }),
  post: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: "PATCH", body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: <T>(url: string) => request<T>(url, { method: "DELETE" }),
  upload: <T>(url: string, form: FormData) => request<T>(url, { method: "POST", body: form }),
};

// ---------------------------------------------------------------------------
// Streaming chat reader (SSE over fetch, supports AbortController stop)
// ---------------------------------------------------------------------------

export type ChatStreamEvent =
  | { type: "meta"; messageId: string; conversationId: string; model: string; modelLabel: string; provider: string; chain: string[] }
  | { type: "delta"; text: string }
  | { type: "tool"; tool: string; status: "running" | "done" | "error"; summary?: string; results?: unknown }
  | { type: "fallback"; from: string; to: string; reason?: string }
  | { type: "done"; messageId: string; model: string; tokensIn: number; tokensOut: number; latencyMs: number }
  | { type: "stopped"; messageId: string; model: string; tokensIn: number; tokensOut: number }
  | { type: "error"; message: string };

export async function streamChat(
  body: Record<string, unknown>,
  onEvent: (evt: ChatStreamEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    let message = "Chat request failed";
    try {
      const data = await res.json();
      message = data?.error?.message || message;
    } catch { /* noop */ }
    throw new ApiClientError("STREAM_FAILED", message, res.status);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() || "";
      for (const part of parts) {
        for (const line of part.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          try {
            onEvent(JSON.parse(trimmed.slice(5).trim()) as ChatStreamEvent);
          } catch { /* malformed chunk */ }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
