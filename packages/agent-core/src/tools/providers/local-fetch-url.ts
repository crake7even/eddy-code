/**
 * LocalFetchURLProvider — host-side URL fetcher.
 *
 * Flow:
 *   1. GET the URL with a Chrome-like UA.
 *   2. Reject HTTP >= 400 with the status code in the message.
 *   3. Reject responses larger than `maxBytes` (content-length first,
 *      then measured body length as a defensive second check).
 *   4. `text/plain` / `text/markdown` → passthrough verbatim.
 *   5. Otherwise (assumed HTML) → run Readability over a linkedom
 *      document. Return `# ${title}\n\n${text}` (title omitted when
 *      absent). If extraction yields no meaningful text, fall back to
 *      common content containers (`<article>` / `<main>` / `<body>`)
 *      before throwing a "meaningful content" error.
 */

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import { Readability } from '@mozilla/readability';
import { parseHTML as rawParseHTML } from 'linkedom';

import { HttpFetchError, type UrlFetcher, type UrlFetchResult } from '../builtin';
import { FetchCache } from './fetch-cache';

export interface LocalFetchURLProviderOptions {
  readonly userAgent?: string;
  readonly fetchImpl?: typeof fetch;
  readonly maxBytes?: number;
  readonly allowPrivateAddresses?: boolean;
  readonly cache?: FetchCache;
  /** Resolves a hostname to its addresses; injectable for tests. */
  readonly lookupImpl?: (hostname: string) => Promise<readonly string[]>;
}

const MAX_REDIRECTS = 5;

async function defaultLookup(hostname: string): Promise<readonly string[]> {
  const results = await lookup(hostname, { all: true, verbatim: true });
  return results.map((result) => result.address);
}

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;

// Readability's .d.ts references the global `Document` type, but this
// package compiles with `lib: ES2023` (no DOM). Extracting the
// constructor parameter type keeps us off the global `Document` name
// while still accepting whatever Readability wants.
type ReadabilityDocument = ConstructorParameters<typeof Readability>[0];

// linkedom's published types depend on DOM libs we don't load. Declare
// the minimal surface we actually use so the rest of the file stays
// type-safe without pulling lib.dom.d.ts into the host build.
interface DomElementLike {
  querySelector(selectors: string): { textContent: string | null } | null;
  textContent: string | null;
}
interface DomParseResult {
  document: DomElementLike;
}
const parseHTML = rawParseHTML as unknown as (html: string) => DomParseResult;

/**
 * SSRF guard — reject non-http(s) schemes and (by default) any hostname
 * that is, or parses as, a private / loopback / link-local / ULA IP
 * literal, then resolves the hostname and rejects it when any resolved
 * address is private. Redirects are followed manually so every hop goes
 * through this check. A DNS answer that changes between this lookup and
 * the connection (rebinding) is still not caught.
 */
async function assertSafeFetchTarget(
  url: string,
  allowPrivate: boolean,
  lookupImpl: (hostname: string) => Promise<readonly string[]>,
): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: "${url}"`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Unsupported URL scheme "${parsed.protocol}" — only http(s) allowed.`);
  }
  if (allowPrivate) return parsed;
  // URL hostname preserves surrounding `[ ]` for IPv6 literals on some
  // Node versions (and not others). Strip them for uniform comparison.
  const hostRaw = parsed.hostname.toLowerCase();
  const host = hostRaw.startsWith('[') && hostRaw.endsWith(']') ? hostRaw.slice(1, -1) : hostRaw;
  assertPublicHost(host, host);
  if (isIP(host) === 0) {
    let addresses: readonly string[];
    try {
      addresses = await lookupImpl(host);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to resolve host "${host}": ${msg}`, { cause: error });
    }
    for (const address of addresses) assertPublicHost(address.toLowerCase(), host);
  }
  return parsed;
}

function assertPublicHost(host: string, label: string): void {
  // IPv4-mapped IPv6 (`::ffff:127.0.0.1`) is checked as the IPv4 it maps to.
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(host);
  if (mapped !== null) {
    assertPublicHost(mapped[1]!, label);
    return;
  }
  // Literal "localhost" / loopback aliases.
  if (host === 'localhost' || host.endsWith('.localhost')) {
    throw privateTargetError(host, label);
  }
  // IPv6 loopback / ULA / link-local. Check after bracket strip; only IPv6
  // literals contain `:`, so domains like `fdroid.org` are not caught.
  if (
    host.includes(':') &&
    (host === '::1' ||
      host === '::' ||
      host.startsWith('fe80:') ||
      host.startsWith('fc') ||
      host.startsWith('fd'))
  ) {
    throw privateTargetError(host, label);
  }
  // IPv4 literal — only check when the hostname is a dotted-quad; normal
  // domains will never match.
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4 !== null) {
    const octets = [v4[1], v4[2], v4[3], v4[4]].map(Number);
    if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
      throw new Error(`Invalid IPv4 literal: "${label}"`);
    }
    const [a, b] = octets as [number, number, number, number];
    // 127.0.0.0/8 loopback, 10.0.0.0/8, 192.168.0.0/16,
    // 172.16.0.0/12, 169.254.0.0/16 link-local / AWS metadata,
    // 0.0.0.0/8 "this network", 100.64.0.0/10 CGNAT.
    const isLoopback = a === 127;
    const isPrivate10 = a === 10;
    const isPrivate192 = a === 192 && b === 168;
    const isPrivate172 = a === 172 && b >= 16 && b <= 31;
    const isLinkLocal = a === 169 && b === 254;
    const isZero = a === 0;
    const isCgnat = a === 100 && b >= 64 && b <= 127;
    if (
      isLoopback ||
      isPrivate10 ||
      isPrivate192 ||
      isPrivate172 ||
      isLinkLocal ||
      isZero ||
      isCgnat
    ) {
      throw privateTargetError(host, label);
    }
  }
}

function privateTargetError(host: string, label: string): Error {
  return new Error(
    host === label
      ? `Refusing to fetch private address: "${host}"`
      : `Refusing to fetch private address: "${label}" resolves to ${host}`,
  );
}

function cacheKey(url: string, allowPrivate: boolean, maxBytes: number, userAgent: string): string {
  return `local:${url}:${String(allowPrivate)}:${String(maxBytes)}:${userAgent}`;
}

export class LocalFetchURLProvider implements UrlFetcher {
  private readonly userAgent: string;
  private readonly fetchImpl: typeof fetch;
  private readonly maxBytes: number;
  private readonly allowPrivateAddresses: boolean;
  private readonly cache: FetchCache;
  private readonly lookupImpl: (hostname: string) => Promise<readonly string[]>;

  constructor(options: LocalFetchURLProviderOptions = {}) {
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.allowPrivateAddresses = options.allowPrivateAddresses ?? false;
    this.cache = options.cache ?? new FetchCache();
    this.lookupImpl = options.lookupImpl ?? defaultLookup;
  }

  async fetch(url: string, _options?: { toolCallId?: string }): Promise<UrlFetchResult> {
    await assertSafeFetchTarget(url, this.allowPrivateAddresses, this.lookupImpl);

    const key = cacheKey(url, this.allowPrivateAddresses, this.maxBytes, this.userAgent);
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const result = await this.fetchFresh(url);
    this.cache.set(key, result);
    return result;
  }

  private async fetchFresh(url: string): Promise<UrlFetchResult> {
    const response = await this.fetchFollowingSafeRedirects(url);

    if (response.status >= 400) {
      // Drain the unused body so undici can release the socket back to
      // the keep-alive pool instead of leaking it on error paths.
      await response.body?.cancel().catch(() => {
        /* already closed */
      });
      throw new HttpFetchError(
        response.status,
        `HTTP ${String(response.status)} ${response.statusText}`,
      );
    }

    // Reject oversized responses before buffering the full body.
    const contentLengthRaw = response.headers.get('content-length');
    if (contentLengthRaw !== null) {
      const cl = Number(contentLengthRaw);
      if (Number.isFinite(cl) && cl > this.maxBytes) {
        throw new Error(
          `Response body too large: ${String(cl)} bytes exceeds maxBytes (${String(this.maxBytes)}).`,
        );
      }
    }

    const body = await response.text();

    // Servers may omit content-length — measure again defensively.
    const actualBytes = Buffer.byteLength(body, 'utf8');
    if (actualBytes > this.maxBytes) {
      throw new Error(
        `Response body too large: ${String(actualBytes)} bytes exceeds maxBytes (${String(this.maxBytes)}).`,
      );
    }

    const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
    if (contentType.startsWith('text/plain') || contentType.startsWith('text/markdown')) {
      return { content: body, kind: 'passthrough' };
    }

    return { content: this.extractMainContent(body), kind: 'extracted' };
  }

  /** Follows redirects by hand so each hop is re-checked against the SSRF guard. */
  private async fetchFollowingSafeRedirects(url: string): Promise<Response> {
    let current = url;
    for (let hop = 0; ; hop += 1) {
      const response = await this.fetchImpl(current, {
        method: 'GET',
        headers: { 'User-Agent': this.userAgent },
        redirect: 'manual',
      });
      const location = response.headers.get('location');
      if (response.status < 300 || response.status >= 400 || location === null) return response;

      await response.body?.cancel().catch(() => {
        /* already closed */
      });
      if (hop >= MAX_REDIRECTS) {
        throw new Error(`Too many redirects (more than ${String(MAX_REDIRECTS)}).`);
      }
      current = new URL(location, current).toString();
      await assertSafeFetchTarget(current, this.allowPrivateAddresses, this.lookupImpl);
    }
  }

  private extractMainContent(html: string): string {
    // Readability mutates the DOM it parses, so parse twice — once for
    // the primary extractor and once for the fallback path.
    const primary = parseHTML(html);
    try {
      const reader = new Readability(primary.document as unknown as ReadabilityDocument, {
        charThreshold: 0,
      });
      const article = reader.parse();
      if (article !== null) {
        const text = (article.textContent ?? '').trim();
        if (text.length > 0) {
          const title = (article.title ?? '').trim();
          return title.length > 0 ? `# ${title}\n\n${text}` : text;
        }
      }
    } catch {
      // Fall through to the container-based fallback.
    }

    const { document } = parseHTML(html);
    const titleText = (document.querySelector('title')?.textContent ?? '').trim();
    const container =
      document.querySelector('article') ??
      document.querySelector('main') ??
      document.querySelector('body');
    const fallbackText = (container?.textContent ?? '').trim();

    if (fallbackText.length === 0) {
      throw new Error(
        'Failed to extract meaningful content from the page. The page may require JavaScript to render.',
      );
    }

    return titleText.length > 0 ? `# ${titleText}\n\n${fallbackText}` : fallbackText;
  }
}
