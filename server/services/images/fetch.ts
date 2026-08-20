/**
 * Safe remote image download.
 *
 * Three modules used to pull bytes off a remote URL with bare `fetch(url)` and
 * `await response.arrayBuffer()`. That is unsafe in three separate ways, and
 * every one of them was reachable from a user-supplied value (an article's
 * `imageUrl` / `instagramImageUrl`, or a URL posted to the ImgBB endpoints):
 *
 *   1. SSRF. `fetch` will happily connect to `http://169.254.169.254/`,
 *      `http://127.0.0.1:5432/` or any RFC1918 host, so a URL field became a
 *      probe into the deploy's private network and cloud metadata service.
 *   2. No timeout. A remote host that accepts the connection and then stalls
 *      pinned an Express request — and its DB pool slot — open indefinitely.
 *   3. No size cap. `arrayBuffer()` buffers whatever arrives, so a URL serving
 *      an endless stream was a one-request OOM.
 *
 * Everything that reads a remote image now goes through `fetchRemoteImage`,
 * which resolves the host, refuses non-public addresses, revalidates on every
 * redirect hop, bounds the transfer in both time and bytes, and confirms the
 * response actually looks like an image.
 */

import dns from 'dns/promises';
import net from 'net';
import fsp from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { env } from '../../lib/env';
import { createLogger } from '../../lib/logger';

const log = createLogger('images:fetch');

/** Where `downloadImage` parks files that are then served from `/uploads`. */
const INSTAGRAM_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'instagram');

const DEFAULT_TIMEOUT_MS = 20_000;

/** Redirect chains longer than this are a loop or an attempt to wear down the guard. */
const MAX_REDIRECTS = 5;

/** Raised for every rejection in this module so callers can tell it apart. */
export class ImageFetchError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ImageFetchError';
    this.status = status;
  }
}

export interface FetchRemoteImageOptions {
  /** Whole-transfer budget, not just time-to-first-byte. */
  timeoutMs?: number;
  /** Hard ceiling on bytes read; defaults to the app-wide image limit. */
  maxBytes?: number;
  /**
   * Require an `image/*` response. On by default; the ImgBB re-host path leaves
   * it on, since anything else is a redirect to an error page.
   */
  requireImageContentType?: boolean;
}

export interface FetchedImage {
  buffer: Buffer;
  /** Declared content type, lowercased, without parameters. */
  contentType: string;
  /** The URL actually served, after any redirects. */
  finalUrl: string;
  bytes: number;
}

// ---------------------------------------------------------------------------
// Address classification
//
// The guard works on resolved IP addresses rather than hostnames: a hostname
// blocklist is trivially bypassed by an attacker who controls DNS and points
// `evil.example.com` at 127.0.0.1.
// ---------------------------------------------------------------------------

type AddressClass = 'public' | 'loopback' | 'blocked';

/** IPv4 ranges that must never be reachable from a user-supplied URL. */
const BLOCKED_V4_RANGES: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // RFC1918
  ['100.64.0.0', 10], // CGNAT
  ['169.254.0.0', 16], // link-local — includes the 169.254.169.254 metadata service
  ['172.16.0.0', 12], // RFC1918
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.88.99.0', 24], // 6to4 relay anycast
  ['192.168.0.0', 16], // RFC1918
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, includes 255.255.255.255
];

function ipv4ToOctets(value: string): [number, number, number, number] | null {
  const parts = value.split('.');
  if (parts.length !== 4) return null;

  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number.parseInt(part, 10);
    if (n > 255) return null;
    octets.push(n);
  }
  return octets as [number, number, number, number];
}

function ipv4ToInt(octets: readonly number[]): number {
  // `>>> 0` keeps the result unsigned; the top octet would otherwise go negative.
  return ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
}

function classifyIPv4(octets: readonly number[]): AddressClass {
  if (octets[0] === 127) return 'loopback';

  const address = ipv4ToInt(octets);
  for (const [base, prefix] of BLOCKED_V4_RANGES) {
    const baseOctets = ipv4ToOctets(base);
    if (!baseOctets) continue;
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    if ((address & mask) === (ipv4ToInt(baseOctets) & mask)) return 'blocked';
  }
  return 'public';
}

/** Expands any IPv6 literal — including `::` and trailing-IPv4 forms — to 8 hextets. */
function ipv6ToHextets(input: string): number[] | null {
  const address = input.split('%')[0]; // drop any zone id
  const halves = address.split('::');
  if (halves.length > 2) return null;

  const toGroups = (segment: string): number[] | null => {
    if (!segment) return [];
    const out: number[] = [];
    for (const piece of segment.split(':')) {
      if (piece.includes('.')) {
        // Trailing IPv4 form, e.g. ::ffff:192.168.0.1
        const octets = ipv4ToOctets(piece);
        if (!octets) return null;
        out.push((octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]);
        continue;
      }
      if (!/^[0-9a-fA-F]{1,4}$/.test(piece)) return null;
      out.push(Number.parseInt(piece, 16));
    }
    return out;
  };

  const head = toGroups(halves[0]);
  const tail = halves.length === 2 ? toGroups(halves[1]) : [];
  if (!head || !tail) return null;

  if (halves.length === 1) return head.length === 8 ? head : null;

  const fill = 8 - head.length - tail.length;
  if (fill < 0) return null;
  return [...head, ...new Array<number>(fill).fill(0), ...tail];
}

function hextetsToV4(high: number, low: number): number[] {
  return [high >> 8, high & 0xff, low >> 8, low & 0xff];
}

function classifyIPv6(hextets: readonly number[]): AddressClass {
  const leadingZero = hextets.slice(0, 5).every((h) => h === 0);

  if (leadingZero && hextets[5] === 0 && hextets[6] === 0) {
    if (hextets[7] === 1) return 'loopback'; // ::1
    if (hextets[7] === 0) return 'blocked'; // :: (unspecified)
  }

  // IPv4-mapped (::ffff:a.b.c.d) — reachable as IPv4, so judge it as IPv4.
  if (leadingZero && hextets[5] === 0xffff) {
    return classifyIPv4(hextetsToV4(hextets[6], hextets[7]));
  }

  // NAT64 (64:ff9b::/96) and 6to4 (2002::/16) both smuggle an IPv4 destination
  // inside an IPv6 literal, so unwrap rather than trust the outer form.
  if (hextets[0] === 0x0064 && hextets[1] === 0xff9b && hextets.slice(2, 6).every((h) => h === 0)) {
    return classifyIPv4(hextetsToV4(hextets[6], hextets[7]));
  }
  if (hextets[0] === 0x2002) {
    return classifyIPv4(hextetsToV4(hextets[1], hextets[2]));
  }

  if ((hextets[0] & 0xfe00) === 0xfc00) return 'blocked'; // unique local
  if ((hextets[0] & 0xffc0) === 0xfe80) return 'blocked'; // link-local
  if ((hextets[0] & 0xff00) === 0xff00) return 'blocked'; // multicast

  return 'public';
}

export function classifyAddress(address: string): AddressClass {
  if (net.isIPv4(address)) {
    const octets = ipv4ToOctets(address);
    return octets ? classifyIPv4(octets) : 'blocked';
  }
  if (net.isIPv6(address)) {
    const hextets = ipv6ToHextets(address);
    return hextets ? classifyIPv6(hextets) : 'blocked';
  }
  // Not an address at all — fail closed.
  return 'blocked';
}

/**
 * Loopback is permitted in development only.
 *
 * Local flows legitimately point at the dev server's own `/uploads` path, and
 * there is no private network worth protecting on a laptop. In production this
 * stays shut: 127.0.0.1 is where the database and the admin surface live.
 */
function isAllowed(addressClass: AddressClass): boolean {
  return addressClass === 'public' || (addressClass === 'loopback' && !env.isProduction);
}

/**
 * Validates one URL and returns it parsed.
 *
 * Exported so callers can pre-screen a URL before storing it, not only at the
 * moment it is fetched.
 */
export async function assertFetchableImageUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ImageFetchError(`Not a valid URL: ${rawUrl.slice(0, 120)}`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    // `file:`, `ftp:`, `gopher:` and friends are the classic SSRF escalations.
    throw new ImageFetchError(`Unsupported URL scheme "${url.protocol}"; only http and https are allowed`);
  }

  if (url.username || url.password) {
    // Embedded credentials would be forwarded to whatever the host resolves to.
    throw new ImageFetchError('URLs with embedded credentials are not allowed');
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets

  const addresses = net.isIP(hostname)
    ? [hostname]
    : await resolveHost(hostname);

  if (addresses.length === 0) {
    throw new ImageFetchError(`Could not resolve host "${hostname}"`);
  }

  // Every A/AAAA record must be acceptable. Checking only the first would let a
  // host publish one public address alongside an internal one.
  for (const address of addresses) {
    if (!isAllowed(classifyAddress(address))) {
      throw new ImageFetchError(`Host "${hostname}" resolves to a non-public address`);
    }
  }

  return url;
}

async function resolveHost(hostname: string): Promise<string[]> {
  try {
    const records = await dns.lookup(hostname, { all: true, verbatim: true });
    return records.map((record) => record.address);
  } catch {
    throw new ImageFetchError(`Could not resolve host "${hostname}"`);
  }
}

// ---------------------------------------------------------------------------
// Transfer
// ---------------------------------------------------------------------------

function normalizeContentType(header: string | null): string {
  return (header ?? '').split(';')[0].trim().toLowerCase();
}

async function readCappedBody(
  response: Response,
  maxBytes: number,
  sourceUrl: string,
): Promise<Buffer> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new ImageFetchError(
      `Image at ${sourceUrl} declares ${declared} bytes, over the ${maxBytes} byte limit`,
      413,
    );
  }

  const body = response.body;
  if (!body) return Buffer.alloc(0);

  // Read incrementally rather than via arrayBuffer() so the limit is enforced
  // against what actually arrives, not against a header the server may lie about.
  const reader = body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      total += value.byteLength;
      if (total > maxBytes) {
        throw new ImageFetchError(
          `Image at ${sourceUrl} exceeds the ${maxBytes} byte limit`,
          413,
        );
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    // Releases the socket immediately when we bail out early.
    await reader.cancel().catch(() => undefined);
  }

  return Buffer.concat(chunks, total);
}

/**
 * Downloads a remote image into memory.
 *
 * Redirects are followed by hand (`redirect: 'manual'`) so each hop passes the
 * same address check — automatic following would let a public host bounce us to
 * `http://169.254.169.254/` after the first check had already passed.
 */
export async function fetchRemoteImage(
  rawUrl: string,
  options: FetchRemoteImageOptions = {},
): Promise<FetchedImage> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxBytes = env.uploads.maxImageBytes,
    requireImageContentType = true,
  } = options;

  const controller = new AbortController();
  // One timer for the whole operation, redirects and body read included.
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let target = await assertFetchableImageUrl(rawUrl);

    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const response = await fetch(target, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { accept: 'image/*,*/*;q=0.8' },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        await response.body?.cancel().catch(() => undefined);

        if (!location) {
          throw new ImageFetchError(`Redirect from ${target.href} had no Location header`, response.status);
        }
        if (hop === MAX_REDIRECTS) {
          throw new ImageFetchError(`Too many redirects fetching ${rawUrl}`);
        }

        target = await assertFetchableImageUrl(new URL(location, target).href);
        continue;
      }

      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw new ImageFetchError(
          `Failed to fetch image: ${response.status} ${response.statusText}`,
          response.status,
        );
      }

      const contentType = normalizeContentType(response.headers.get('content-type'));
      if (requireImageContentType && !contentType.startsWith('image/')) {
        await response.body?.cancel().catch(() => undefined);
        throw new ImageFetchError(`Expected an image, got content type "${contentType || 'none'}"`);
      }

      const buffer = await readCappedBody(response, maxBytes, target.href);

      log.debug('Fetched remote image', {
        url: target.href,
        bytes: buffer.length,
        contentType,
      });

      return {
        buffer,
        contentType: contentType || 'application/octet-stream',
        finalUrl: target.href,
        bytes: buffer.length,
      };
    }

    throw new ImageFetchError(`Too many redirects fetching ${rawUrl}`);
  } catch (error) {
    if (error instanceof ImageFetchError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ImageFetchError(`Timed out after ${timeoutMs}ms fetching image`, 504);
    }
    throw new ImageFetchError(
      `Failed to fetch image: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Disk-backed download
// ---------------------------------------------------------------------------

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

/** Extension from the URL path, used only when the content type is unhelpful. */
function extensionFromUrl(url: string): string | undefined {
  const candidate = url.split('?')[0].split('#')[0].split('.').pop()?.toLowerCase();
  if (candidate && ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(candidate)) {
    return `.${candidate === 'jpeg' ? 'jpg' : candidate}`;
  }
  return undefined;
}

export interface DownloadedImage {
  filePath: string;
  /** Path the file is served from, assuming `/uploads` is mounted statically. */
  fileUrl: string;
}

/**
 * Downloads an image and writes it under `uploads/instagram`.
 *
 * The directory is created on demand rather than at import time: the old module
 * ran `mkdirSync` as a side effect of being imported, which meant merely
 * touching the module wrote to disk, and did so synchronously during boot.
 */
export async function downloadImage(imageUrl: string): Promise<DownloadedImage> {
  const image = await fetchRemoteImage(imageUrl);

  const extension =
    EXTENSION_BY_CONTENT_TYPE[image.contentType] ?? extensionFromUrl(imageUrl) ?? '.jpg';

  // The hash keeps the name deterministic per URL; the timestamp keeps repeat
  // downloads of the same URL from clobbering a file that is still being served.
  const urlHash = crypto.createHash('sha256').update(imageUrl).digest('hex').slice(0, 32);
  const filename = `${urlHash}-${Date.now()}${extension}`;
  const filePath = path.join(INSTAGRAM_UPLOAD_DIR, filename);

  await fsp.mkdir(INSTAGRAM_UPLOAD_DIR, { recursive: true });
  await fsp.writeFile(filePath, image.buffer);

  log.info('Downloaded image to disk', { filePath, bytes: image.bytes });

  return { filePath, fileUrl: `/uploads/instagram/${filename}` };
}

/**
 * Turns a site-relative path into an absolute URL.
 *
 * Reads the validated `env` rather than `process.env.HOST`, which was unset in
 * every deployment and silently produced `http://localhost:3001/...` links.
 */
export function getFullImageUrl(relativeUrl: string): string {
  if (/^https?:\/\//i.test(relativeUrl)) return relativeUrl;

  const configured = env.baseUrl ?? (env.publicDomain ? `https://${env.publicDomain}` : undefined);
  const origin = (configured ?? `http://localhost:${env.port ?? 3000}`).replace(/\/+$/, '');
  const suffix = relativeUrl.startsWith('/') ? relativeUrl : `/${relativeUrl}`;

  return `${origin}${suffix}`;
}
