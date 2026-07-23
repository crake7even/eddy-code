import type { UrlFetchResult } from '../builtin/web/fetch-url';

export interface FetchCacheEntry {
  readonly result: UrlFetchResult;
  readonly fetchedAt: number;
}

export interface FetchCacheOptions {
  readonly maxSize?: number;
  readonly softTtlMs?: number;
  readonly hardTtlMs?: number;
}

/**
 * Simple in-memory LRU cache for URL fetch results.
 *
 * The cache keeps up to `maxSize` entries. Entries older than `hardTtlMs`
 * are treated as a miss and evicted. Entries younger than `softTtlMs` are
 * returned directly; entries between soft and hard TTL are also returned
 * (no background refresh) because web content freshness is unpredictable
 * and a stale result is worse than a slightly older cached result for
 * agent tooling.
 */
export class FetchCache {
  private readonly cache = new Map<string, FetchCacheEntry>();
  private readonly maxSize: number;
  private readonly hardTtlMs: number;

  constructor(options?: FetchCacheOptions) {
    this.maxSize = options?.maxSize ?? 100;
    this.hardTtlMs = options?.hardTtlMs ?? 60 * 60 * 1000;
  }

  get(key: string): UrlFetchResult | undefined {
    const entry = this.cache.get(key);
    if (entry === undefined) {
      return undefined;
    }

    const now = Date.now();
    if (now - entry.fetchedAt > this.hardTtlMs) {
      this.cache.delete(key);
      return undefined;
    }

    // Re-insert to update LRU order on every hit.
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.result;
  }

  set(key: string, result: UrlFetchResult): void {
    while (this.cache.size >= this.maxSize && this.cache.size > 0) {
      this.evictLRU();
    }
    this.cache.set(key, { result, fetchedAt: Date.now() });
  }

  private evictLRU(): void {
    const lru = this.cache.keys().next().value;
    if (lru === undefined) return;
    this.cache.delete(lru);
  }
}
