import { describe, test, expect } from "bun:test";
import { encryptSecret, decryptSecret, maskSecret, hashPassword, verifyPassword, generateNumericCode, sha256Hex, safeEqual } from "../src/lib/afg/crypto";
import { evaluateMath, parseCSV, summarizeCSV, mathTool, formatToolContext } from "../src/lib/afg/tools";
import { signShareId, verifyShareId, toSafeUser } from "../src/lib/afg/auth";
import { rateLimit } from "../src/lib/afg/rate-limit";
import { en } from "../src/lib/afg/i18n/en";
import { fa } from "../src/lib/afg/i18n/fa";
import { ps } from "../src/lib/afg/i18n/ps";
import { ar } from "../src/lib/afg/i18n/ar";
import type { User } from "@prisma/client";

// ---------------------------------------------------------------------------
// Crypto vault & passwords
// ---------------------------------------------------------------------------

describe("crypto vault", () => {
  test("AES-256-GCM roundtrip", () => {
    const secret = "sk-test-9Router-key-1234567890abcdef";
    const stored = encryptSecret(secret);
    expect(stored.startsWith("v1:")).toBe(true);
    expect(decryptSecret(stored)).toBe(secret);
  });

  test("tampered ciphertext fails authentication", () => {
    const stored = encryptSecret("attack-at-dawn");
    const parts = stored.split(":");
    const cipher = Buffer.from(parts[3], "base64");
    cipher[0] = cipher[0] ^ 0xff;
    parts[3] = cipher.toString("base64");
    expect(decryptSecret(parts.join(":"))).toBeNull();
  });

  test("maskSecret never reveals more than 4 chars", () => {
    expect(maskSecret("abcdefghijklmnop")).toBe("••••••••mnop");
    expect(maskSecret("abc")).toBe("••••");
    expect(maskSecret("")).toBe("");
  });

  test("scrypt password hash & verify", () => {
    const hash = hashPassword("Correct-Horse-9");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("Correct-Horse-9", hash)).toBe(true);
    expect(verifyPassword("wrong-password", hash)).toBe(false);
    expect(verifyPassword("anything", null)).toBe(false);
  });

  test("numeric codes and constant-time compare", () => {
    expect(generateNumericCode(6)).toMatch(/^\d{6}$/);
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(sha256Hex("a")).toBe("ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb");
  });
});

// ---------------------------------------------------------------------------
// Math engine
// ---------------------------------------------------------------------------

describe("math engine (safe parser, no eval)", () => {
  test("arithmetic & precedence", () => {
    expect(evaluateMath("2+3*4")).toBe(14);
    expect(evaluateMath("(2+3)*4")).toBe(20);
    expect(evaluateMath("2^3^2")).toBe(512); // right-associative
    expect(evaluateMath("-5 + 3")).toBe(-2);
    expect(evaluateMath("10 % 3")).toBe(1);
    expect(evaluateMath("7/2")).toBe(3.5);
  });
  test("functions and constants", () => {
    expect(evaluateMath("sqrt(16)")).toBe(4);
    expect(evaluateMath("max(3, 7, 5)")).toBe(7);
    expect(evaluateMath("round(pi, )".replace(", )", ")"))).toBe(3);
    expect(evaluateMath("pow(2, 10)")).toBe(1024);
    expect(evaluateMath("2*pi")).toBeCloseTo(Math.PI * 2);
    expect(evaluateMath("abs(-9)")).toBe(9);
    expect(evaluateMath("ln(e)")).toBe(1);
  });
  test("rejects injection and errors", () => {
    expect(() => evaluateMath("process.exit(1)")).toThrow();
    expect(() => evaluateMath("1/0")).toThrow("Division by zero");
    expect(() => evaluateMath("alert(1)")).toThrow();
    expect(() => evaluateMath("__proto__")).toThrow();
    expect(() => evaluateMath("2 +")).toThrow();
  });
  test("mathTool wrapper", () => {
    const ok = mathTool("6*7");
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.data.value).toBe(42);
    const bad = mathTool("sqrt(");
    expect(bad.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CSV / data analysis
// ---------------------------------------------------------------------------

describe("data analysis", () => {
  test("parseCSV with quotes and newlines", () => {
    const parsed = parseCSV('name,age\n"Ali, Jr",30\nZahra,25');
    expect(parsed).not.toBeNull();
    expect(parsed!.headers).toEqual(["name", "age"]);
    expect(parsed!.rows[0]).toEqual(["Ali, Jr", "30"]);
    expect(parsed!.rows[1]).toEqual(["Zahra", "25"]);
  });
  test("summarizeCSV numeric stats", () => {
    const s = summarizeCSV("x,y\n1,10\n2,20\n3,30");
    expect(s).toContain("Rows: 3");
    expect(s).toContain("x: count=3");
    expect(s).toContain("max=3");
  });
  test("tool context formatting", () => {
    const frag = formatToolContext("math", { ok: true, tool: "math", data: { value: 42 }, summary: "" });
    expect(frag).toContain('Tool "math"');
    const fail = formatToolContext("math", { ok: false, tool: "math", error: "boom" });
    expect(fail).toContain("failed");
  });
});

// ---------------------------------------------------------------------------
// Share tokens (HMAC-signed)
// ---------------------------------------------------------------------------

describe("share tokens", () => {
  test("sign & verify roundtrip", () => {
    const token = signShareId("conv_123abc");
    expect(token.startsWith("conv_123abc.")).toBe(true);
    expect(verifyShareId(token)).toBe("conv_123abc");
  });
  test("forged tokens are rejected", () => {
    const token = signShareId("conv_123abc");
    expect(verifyShareId(token.replace("conv_123abc", "conv_999xyz"))).toBeNull();
    expect(verifyShareId(token.slice(0, -2) + "zz")).toBeNull();
    expect(verifyShareId("no-dot-here")).toBeNull();
    expect(verifyShareId("")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// RBAC safe user projection
// ---------------------------------------------------------------------------

describe("safe user projection", () => {
  test("never exposes passwordHash", () => {
    const user = {
      id: "u1", email: "a@b.c", emailVerifiedAt: null, passwordHash: "scrypt$secret",
      name: "Ali", role: "USER", permissions: "[]", status: "ACTIVE", isGuest: false,
      locale: "en", theme: "dark", voiceEnabled: true, voiceRate: 1, voicePitch: 1,
      memoryEnabled: true, systemPrompt: null, createdAt: new Date(), updatedAt: new Date(), lastSeenAt: null,
    } as unknown as User;
    const safe = toSafeUser(user) as unknown as Record<string, unknown>;
    expect("passwordHash" in safe).toBe(false);
    expect("sessions" in safe).toBe(false);
    expect(safe.role).toBe("USER");
  });
});

// ---------------------------------------------------------------------------
// Rate limiter (real DB-backed sliding window)
// ---------------------------------------------------------------------------

describe("rate limiter", () => {
  test("allows under limit and blocks over limit", async () => {
    const key = `test:${Date.now()}-${Math.random()}`;
    const r1 = await rateLimit(key, 2, 60_000);
    const r2 = await rateLimit(key, 2, 60_000);
    const r3 = await rateLimit(key, 2, 60_000);
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(false);
    expect(r3.remaining).toBe(0);
    expect(r3.resetAt).toBeGreaterThan(Date.now());
  });
});

// ---------------------------------------------------------------------------
// i18n parity (en as source of truth)
// ---------------------------------------------------------------------------

function flatten(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" ? flatten(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`]
  );
}

describe("i18n dictionaries", () => {
  const enKeys = flatten(en as unknown as Record<string, unknown>).sort();

  test("fa/ps/ar have exact key parity with en", () => {
    for (const [name, dict] of [["fa", fa], ["ps", ps], ["ar", ar]] as const) {
      const keys = flatten(dict as unknown as Record<string, unknown>).sort();
      expect(keys).toEqual(enKeys);
    }
  });

  test("interpolation placeholders are preserved", () => {
    expect((fa as unknown as Record<string, Record<string, string>>).chat.toolRunning).toContain("{tool}");
    expect((ps as unknown as Record<string, Record<string, string>>).chat.toolRunning).toContain("{tool}");
    expect((ar as unknown as Record<string, Record<string, string>>).chat.attachments).toContain("{count}");
  });
});
