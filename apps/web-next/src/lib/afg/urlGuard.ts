import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

/**
 * SSRF protection for every server-side outbound URL fetch (page_reader tool,
 * admin provider base URLs). Rejects credentials, non-HTTP schemes, local
 * hostnames and private/reserved address families, including DNS results.
 *
 * Bun quirk: BlockList.check() can misclassify addresses when IPv4 and IPv6
 * subnets share a single list, so the two families are built separately.
 */
const blockedV4 = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blockedV4.addSubnet(address, prefix, "ipv4");

const blockedV6 = new BlockList();
for (const [address, prefix] of [
  ["::", 128], ["::1", 128], ["::ffff:0:0", 96], ["64:ff9b::", 96], ["100::", 64],
  ["2001:db8::", 32], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8],
] as const) blockedV6.addSubnet(address, prefix, "ipv6");

/** True only for a public, unreserved IPv4/IPv6 address (brackets stripped). */
export function isPublicAddress(address: string): boolean {
  const cleaned = address.trim().replace(/^\[/, "").replace(/\]$/, "");
  const family = isIP(cleaned);
  if (!family) return false;
  if (family === 4) return !blockedV4.check(cleaned, "ipv4");
  const lower = cleaned.toLowerCase();
  if (lower.startsWith("::ffff:")) {
    // IPv4-mapped IPv6: validate the embedded IPv4 address.
    const mapped = lower.slice(7);
    if (isIP(mapped) === 4) return !blockedV4.check(mapped, "ipv4");
  }
  return !blockedV6.check(cleaned, "ipv6");
}

/**
 * Validate that a URL points at a public HTTP(S) origin. Returns the parsed
 * URL or throws with a client-safe message. Resolves DNS and rejects when any
 * record lands in a private or reserved range.
 */
export async function assertPublicHttpUrl(value: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Provide a valid public website URL.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) || url.username || url.password ||
    url.hostname === "localhost" || url.hostname.endsWith(".localhost") ||
    url.hostname.endsWith(".local") || url.hostname.endsWith(".internal") ||
    url.hostname.endsWith(".test") || url.hostname.endsWith(".invalid")
  ) {
    throw new Error("Navigation is limited to public HTTP or HTTPS websites.");
  }
  const hostname = url.hostname.replace(/^\[/, "").replace(/\]$/, "");
  const family = isIP(hostname);
  if (family) {
    if (!isPublicAddress(hostname)) throw new Error("Private or reserved network addresses are blocked.");
  } else {
    const records = await lookup(hostname, { all: true, verbatim: true }).catch(() => []);
    if (!records.length || records.some((record) => !isPublicAddress(record.address))) {
      throw new Error("The website resolves to a private or reserved network address.");
    }
  }
  return url;
}
