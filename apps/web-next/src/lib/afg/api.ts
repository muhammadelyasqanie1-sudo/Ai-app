import { NextResponse } from "next/server";
import { AuthError } from "./auth";
import { logError } from "./logs";

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(code: string, message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: { code, message, ...(extra || {}) } }, { status });
}

/**
 * Wrap a route handler with uniform error handling.
 * Internal error details are logged server-side; clients receive sanitized codes.
 */
export function handler<T extends unknown[]>(
  fn: (...args: T) => Promise<Response>
): (...args: T) => Promise<Response> {
  return async (...args: T) => {
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
