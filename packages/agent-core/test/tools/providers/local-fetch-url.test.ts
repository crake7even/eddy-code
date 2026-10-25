/**
 * Covers: LocalFetchURLProvider content-kind reporting.
 *
 * Verifies the provider tells callers whether the returned content is a
 * verbatim passthrough of the response body or the main text extracted
 * from an HTML page.
 */

import { describe, expect, it, vi } from 'vitest';
import { FetchCache } from '../../../src/tools/providers/fetch-cache';
import { LocalFetchURLProvider } from '../../../src/tools/providers/local-fetch-url';

function htmlResponse(body: string, contentType: string): Response {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': contentType },
  });
}

const publicLookup = vi.fn(async () => ['93.184.216.34']);

function redirectResponse(location: string): Response {
  return new Response(null, { status: 302, headers: { location } });
}

describe('LocalFetchURLProvider content kind', () => {
  it('reports text/plain bodies as a verbatim passthrough', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(htmlResponse('plain body', 'text/plain; charset=utf-8'));
    const provider = new LocalFetchURLProvider({ lookupImpl: publicLookup, fetchImpl });

    const result = await provider.fetch('https://example.com/file.txt');

    expect(result).toEqual({ content: 'plain body', kind: 'passthrough' });
  });

  it('reports text/markdown bodies as a verbatim passthrough', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(htmlResponse('# Title\n\nbody', 'text/markdown'));
    const provider = new LocalFetchURLProvider({ lookupImpl: publicLookup, fetchImpl });

    const result = await provider.fetch('https://example.com/readme.md');

    expect(result).toEqual({ content: '# Title\n\nbody', kind: 'passthrough' });
  });

  it('reports HTML bodies as extracted main content', async () => {
    const html =
      '<html><head><title>Doc</title></head><body><article>' +
      '<p>The quick brown fox jumps over the lazy dog. '.repeat(20) +
      '</p></article></body></html>';
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(htmlResponse(html, 'text/html; charset=utf-8'));
    const provider = new LocalFetchURLProvider({ lookupImpl: publicLookup, fetchImpl });

    const result = await provider.fetch('https://example.com/page');

    expect(result.kind).toBe('extracted');
    expect(result.content).toContain('quick brown fox');
  });

  it('returns a cached result on the second fetch', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(htmlResponse('fresh', 'text/plain; charset=utf-8'));
    const cache = new FetchCache();
    const provider = new LocalFetchURLProvider({ lookupImpl: publicLookup, fetchImpl, cache });

    const first = await provider.fetch('https://example.com/file.txt');
    const second = await provider.fetch('https://example.com/file.txt');

    expect(first).toEqual({ content: 'fresh', kind: 'passthrough' });
    expect(second).toBe(first);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('does not share cache across different URLs', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(htmlResponse('a', 'text/plain; charset=utf-8'))
      .mockResolvedValueOnce(htmlResponse('b', 'text/plain; charset=utf-8'));
    const cache = new FetchCache();
    const provider = new LocalFetchURLProvider({ lookupImpl: publicLookup, fetchImpl, cache });

    await provider.fetch('https://example.com/a');
    await provider.fetch('https://example.com/b');

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe('LocalFetchURLProvider SSRF guard', () => {
  it('rejects a redirect to a private address', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(redirectResponse('http://169.254.169.254/latest/meta-data/'));
    const provider = new LocalFetchURLProvider({ lookupImpl: publicLookup, fetchImpl });

    await expect(provider.fetch('https://example.com/r')).rejects.toThrow(
      'Refusing to fetch private address',
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual' });
  });

  it('follows a redirect to another public host', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(redirectResponse('/moved.txt'))
      .mockResolvedValueOnce(htmlResponse('moved', 'text/plain'));
    const provider = new LocalFetchURLProvider({ lookupImpl: publicLookup, fetchImpl });

    const result = await provider.fetch('https://example.com/r');

    expect(result.content).toBe('moved');
    expect(fetchImpl.mock.calls[1]?.[0]).toBe('https://example.com/moved.txt');
  });

  it('stops after too many redirects', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => redirectResponse('https://example.com/loop'));
    const provider = new LocalFetchURLProvider({ lookupImpl: publicLookup, fetchImpl });

    await expect(provider.fetch('https://example.com/loop')).rejects.toThrow('Too many redirects');
  });

  it.each(['10.0.0.5', '127.0.0.1', '::1', 'fd00::1', '::ffff:169.254.169.254'])(
    'rejects a hostname that resolves to %s',
    async (address) => {
      const fetchImpl = vi.fn<typeof fetch>();
      const provider = new LocalFetchURLProvider({
        lookupImpl: async () => [address],
        fetchImpl,
      });

      await expect(provider.fetch('https://internal.example.com/')).rejects.toThrow(
        'resolves to',
      );
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );

  it('does not treat domains starting with fd or fc as IPv6 literals', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(htmlResponse('ok', 'text/plain'));
    const provider = new LocalFetchURLProvider({ lookupImpl: publicLookup, fetchImpl });

    await expect(provider.fetch('https://fdroid.org/')).resolves.toMatchObject({ content: 'ok' });
  });
});
