import { describe, test, expect } from "bun:test";
import { isPublicAddress, assertPublicHttpUrl } from "../src/lib/afg/urlGuard";
import { registerSchema, codeConfirmSchema, passwordChangeSchema, adminModelUpdateSchema } from "../src/lib/afg/validate";

// ---------------------------------------------------------------------------
// urlGuard: private/reserved address table (SSRF protection)
// ---------------------------------------------------------------------------

describe("urlGuard isPublicAddress", () => {
  test("public addresses are allowed", () => {
    expect(isPublicAddress("8.8.8.8")).toBe(true);
    expect(isPublicAddress("1.1.1.1")).toBe(true);
    expect(isPublicAddress("172.15.255.255")).toBe(true); // just below 172.16/12
    expect(isPublicAddress("172.32.0.1")).toBe(true); // just above 172.16/12
    expect(isPublicAddress("192.169.0.1")).toBe(true);
    expect(isPublicAddress("2606:4700::1111")).toBe(true);
  });

  test("private / loopback / link-local / CGNAT / TEST-NET / reserved ranges are blocked", () => {
    const blocked = [
      "0.0.0.0", "0.1.2.3", // this-network
      "10.0.0.1", "10.255.255.255", // RFC1918
      "100.64.0.1", "100.127.255.255", // CGNAT
      "127.0.0.1", "127.255.0.1", // loopback
      "169.254.1.1", // link-local
      "172.16.0.1", "172.31.255.255", // RFC1918
      "192.0.0.1", // IETF protocol assignments
      "192.0.2.1", // TEST-NET-1
      "192.168.1.1", // RFC1918
      "198.18.0.1", "198.19.255.255", // benchmarking
      "198.51.100.7", // TEST-NET-2
      "203.0.113.9", // TEST-NET-3
      "224.0.0.1", "239.255.255.255", // multicast
      "240.0.0.1", "255.255.255.255", // reserved / broadcast
      "::", "::1", // unspecified / loopback
      "::ffff:10.0.0.1", "::ffff:127.0.0.1", // IPv4-mapped (embedded v4 blocked)
      "64:ff9b::10.0.0.1", // NAT64 well-known prefix
      "100::1", // discard-only
      "2001:db8::1", // documentation
      "fc00::1", "fd12:3456::1", // ULA
      "fe80::1", // link-local
      "ff02::1", // multicast
      "[::1]", "[fe80::1]", // bracketed IPv6 literals are handled
    ];
    for (const addr of blocked) {
      expect(isPublicAddress(addr)).toBe(false);
    }
  });

  test("non-IP strings and garbage are rejected", () => {
    expect(isPublicAddress("localhost")).toBe(false);
    expect(isPublicAddress("example.com")).toBe(false);
    expect(isPublicAddress("")).toBe(false);
    expect(isPublicAddress("999.999.999.999")).toBe(false);
  });

  test("assertPublicHttpUrl blocks local and non-HTTP targets", async () => {
    for (const bad of [
      "http://127.0.0.1:8080/x",
      "http://[::1]/",
      "http://10.1.2.3/",
      "http://192.168.1.4/admin",
      "http://169.254.169.254/latest/meta-data", // cloud metadata endpoint
      "http://100.64.0.1/",
      "http://localhost:3000/",
      "http://box.local/",
      "http://svc.internal/",
      "http://demo.test/",
      "http://web.invalid/",
      "file:///etc/passwd",
      "ftp://example.com/",
      "http://user:pass@example.com/",
      "not a url",
    ]) {
      await expect(assertPublicHttpUrl(bad)).rejects.toThrow();
    }
  });

  test("assertPublicHttpUrl accepts public http(s) URLs", async () => {
    const ok = await assertPublicHttpUrl("https://example.com/page?q=1");
    expect(ok.protocol).toBe("https:");
    expect(ok.hostname).toBe("example.com");
    await expect(assertPublicHttpUrl("http://8.8.8.8/dns-query")).resolves.toBeInstanceOf(URL);
  });
});

// ---------------------------------------------------------------------------
// Password policy: minimum length 12
// ---------------------------------------------------------------------------

describe("password minimum length 12", () => {
  test("registerSchema rejects short passwords", () => {
    expect(registerSchema.safeParse({ email: "a@b.co", password: "short12" }).success).toBe(false); // 7 chars
    expect(registerSchema.safeParse({ email: "a@b.co", password: "abcdefghijk" }).success).toBe(false); // 11 chars
    expect(registerSchema.safeParse({ email: "a@b.co", password: "abcdefghijkl" }).success).toBe(true); // 12 chars
  });

  test("reset and change schemas enforce 12 too", () => {
    expect(codeConfirmSchema.safeParse({ email: "a@b.co", code: "123456", newPassword: "abcdefghijk" }).success).toBe(false);
    expect(codeConfirmSchema.safeParse({ email: "a@b.co", code: "123456", newPassword: "abcdefghijkl" }).success).toBe(true);
    expect(passwordChangeSchema.safeParse({ currentPassword: "x", newPassword: "short-pw" }).success).toBe(false);
  });

  test("adminModelUpdateSchema shape", () => {
    expect(adminModelUpdateSchema.safeParse({ enabled: true, contextWindow: 32768 }).success).toBe(true);
    expect(adminModelUpdateSchema.safeParse({ contextWindow: 4 }).success).toBe(false);
    expect(adminModelUpdateSchema.safeParse({ capabilities: ["chat", "bogus"] }).success).toBe(false);
  });
});
