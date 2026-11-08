import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

/**
 * Shared SSRF protection for server-side page reads (Browserbase and the
 * knowledge refresh worker). Rejects credentials, non-HTTP schemes, local
 * hostnames and private/reserved address families, including DNS results.
 */
const blockedAddresses = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blockedAddresses.addSubnet(address, prefix, 'ipv4');
for (const [address, prefix] of [
  ['::', 128], ['::1', 128], ['::ffff:0:0', 96], ['64:ff9b::', 96], ['100::', 64],
  ['2001:db8::', 32], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
] as const) blockedAddresses.addSubnet(address, prefix, 'ipv6');

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (!family) return false;
  if (family === 4) return !blockedAddresses.check(address, 'ipv4');
  const lower = address.toLowerCase();
  if (lower.startsWith('::ffff:')) {
    const mapped = lower.slice(7);
    if (isIP(mapped) === 4) return !blockedAddresses.check(mapped, 'ipv4');
  }
  return !blockedAddresses.check(address, 'ipv6');
}

export async function assertPublicHttpUrl(value: string): Promise<URL> {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Provide a valid public website URL.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.hostname === 'localhost' || url.hostname.endsWith('.localhost') ||
      url.hostname.endsWith('.local') || url.hostname.endsWith('.internal') ||
      url.hostname.endsWith('.test') || url.hostname.endsWith('.invalid')) {
    throw new Error('Navigation is limited to public HTTP or HTTPS websites.');
  }
  const family = isIP(url.hostname);
  if (family) {
    if (!isPublicAddress(url.hostname)) throw new Error('Private or reserved network addresses are blocked.');
  } else {
    const records = await lookup(url.hostname, { all: true, verbatim: true });
    if (!records.length || records.some((record) => !isPublicAddress(record.address))) {
      throw new Error('The website resolves to a private or reserved network address.');
    }
  }
  return url;
}
