import { lookup } from 'dns/promises';
import { isIP } from 'net';

/**
 * SSRF protection for outbound fetches whose URL is influenced by tenant/user
 * input (workflow http_request node, product/image URL fetches, etc.).
 *
 * Blocks loopback, private, link-local (incl. cloud metadata 169.254.169.254),
 * CGNAT and reserved ranges, restricts schemes to http/https, and re-validates
 * the host on every redirect hop.
 */

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true; // malformed → block
  const [a, b] = parts;
  if (a === 0) return true; // "this" network
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const l = ip.toLowerCase().split('%')[0]; // strip zone id
  if (l === '::1' || l === '::') return true; // loopback / unspecified
  if (l.startsWith('fe80')) return true; // link-local
  if (l.startsWith('fc') || l.startsWith('fd')) return true; // unique local
  // IPv4-mapped (::ffff:a.b.c.d) — validate the embedded v4
  const mapped = l.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return isPrivateIPv4(ip);
  if (v === 6) return isPrivateIPv6(ip);
  return true; // not a recognizable IP → block
}

async function assertHostAllowed(hostname: string): Promise<void> {
  // Strip brackets from IPv6 literals
  const host = hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) {
    if (isPrivateIp(host)) throw new Error(`Blocked request to private address: ${host}`);
    return;
  }
  // Resolve and reject if ANY resolved address is private.
  let addrs: { address: string }[];
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new Error(`Cannot resolve host: ${host}`);
  }
  if (!addrs.length) throw new Error(`Cannot resolve host: ${host}`);
  for (const a of addrs) {
    if (isPrivateIp(a.address)) {
      throw new Error(`Blocked request to host resolving to private address: ${host} -> ${a.address}`);
    }
  }
}

export async function assertSafeUrl(rawUrl: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`Blocked URL scheme: ${u.protocol}`);
  }
  await assertHostAllowed(u.hostname);
  return u;
}

export interface SafeFetchOptions extends RequestInit {
  /** Max redirect hops to follow (each re-validated). Default 3. */
  maxRedirects?: number;
  /** Abort after this many ms. Default 10000. */
  timeoutMs?: number;
}

/**
 * SSRF-hardened fetch: validates the URL (and every redirect target) against the
 * private-range denylist, follows redirects manually, and enforces a timeout.
 */
export async function safeFetch(rawUrl: string, options: SafeFetchOptions = {}): Promise<Response> {
  const { maxRedirects = 3, timeoutMs = 10000, ...init } = options;
  let currentUrl = rawUrl;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertSafeUrl(currentUrl);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(currentUrl, { ...init, redirect: 'manual', signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }

    // Manual redirect handling so we can re-validate each hop.
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) return res;
      if (hop === maxRedirects) throw new Error('Too many redirects');
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }
    return res;
  }
  throw new Error('Too many redirects');
}
