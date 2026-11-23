import { NextResponse } from "next/server";
import { AuthError } from "./auth";
import { logError } from "./logs";

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(code: string, message: string, status = 400, extra?: Record<string, unknown>) {
  // Nested envelope plus a flat `message` so simple clients can read the error
  // without unwrapping the nested shape.
  return NextResponse.json({ error: { code, message, ...(extra || {}) }, message }, { status });
}

/**
 * Same-origin guard for state-changing requests: when an Origin header is
 * present its host must match the Host header (CSRF defense for cookie auth).
 */
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser clients and GETs without Origin
  const host = req.headers.get("host");
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * Wrap a route handler with uniform error handling.
 * Internal error details are logged server-side; clients receive sanitized codes.
 */
export function handler<T extends unknown[]>(
  fn: (...args: T) => Promise<Response>
): (...args: T) => Promise<Response> {
  return async (...args: T) => {
    const req = args[0] as Request | undefined;
    if (req && typeof req.method === "string" && req.method !== "GET" && req.method !== "HEAD" && !sameOrigin(req)) {
      return fail("CROSS_ORIGIN", "Cross-origin request blocked.", 403);
    }
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof AuthError) {
        return fail(err.code, err.code, err.status);
      }
      const scope = "system";
      await logError({
        scope,
        code: "INTERNAL",
        message: err instanceof Error ? err.message : String(err),
        meta: { stack: err instanceof Error ? err.stack?.slice(0, 800) : undefined },
      });
      return fail("INTERNAL_ERROR", "An internal error occurred.", 500);
    }
  };
}

export async function readJson<T = unknown>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new AuthError("INVALID_BODY", 400);
  }
}
