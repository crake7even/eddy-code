import { describe, expect, it, vi } from 'vitest';

import { FetchCache } from '../../../src/tools/providers/fetch-cache';

describe('FetchCache', () => {
  it('returns undefined on a cold cache', () => {
    const cache = new FetchCache();
    expect(cache.get('https://example.com')).toBeUndefined();
  });

  it('returns a cached result within the hard TTL', () => {
    const cache = new FetchCache();
    const result = { content: 'hello', kind: 'passthrough' as const };
    cache.set('https://example.com', result);
    expect(cache.get('https://example.com')).toEqual(result);
  });

  it('evicts entries older than the hard TTL', () => {
    const now = Date.now();
    vi.setSystemTime(now);

    const cache = new FetchCache({ hardTtlMs: 1000 });
    cache.set('https://example.com', { content: 'hello', kind: 'passthrough' });

    vi.setSystemTime(now + 1001);
    expect(cache.get('https://example.com')).toBeUndefined();

    vi.useRealTimers();
  });

  it('keeps entries younger than the hard TTL', () => {
    const now = Date.now();
    vi.setSystemTime(now);

    const cache = new FetchCache({ hardTtlMs: 1000 });
    const result = { content: 'hello', kind: 'passthrough' as const };
    cache.set('https://example.com', result);

    vi.setSystemTime(now + 999);
    expect(cache.get('https://example.com')).toEqual(result);

    vi.useRealTimers();
  });

  it('evicts the least-recently-used entry when capacity is exceeded', () => {
    const cache = new FetchCache({ maxSize: 2 });
    cache.set('a', { content: 'a', kind: 'passthrough' });
    cache.set('b', { content: 'b', kind: 'passthrough' });

    // Access 'a' so it becomes more recently used than 'b'.
    expect(cache.get('a')).toBeDefined();

    cache.set('c', { content: 'c', kind: 'passthrough' });

    expect(cache.get('a')).toBeDefined();
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBeDefined();
  });

  it('updates LRU order on every hit', () => {
    const cache = new FetchCache({ maxSize: 2 });
    cache.set('a', { content: 'a', kind: 'passthrough' });
    cache.set('b', { content: 'b', kind: 'passthrough' });
    cache.get('a');
    cache.set('c', { content: 'c', kind: 'passthrough' });

    expect(cache.get('a')).toBeDefined();
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBeDefined();
  });
});
