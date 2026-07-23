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

describe('LocalFetchURLProvider content kind', () => {
  it('reports text/plain bodies as a verbatim passthrough', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(htmlResponse('plain body', 'text/plain; charset=utf-8'));
    const provider = new LocalFetchURLProvider({ fetchImpl });

    const result = await provider.fetch('https://example.com/file.txt');

    expect(result).toEqual({ content: 'plain body', kind: 'passthrough' });
  });

  it('reports text/markdown bodies as a verbatim passthrough', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(htmlResponse('# Title\n\nbody', 'text/markdown'));
    const provider = new LocalFetchURLProvider({ fetchImpl });

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
    const provider = new LocalFetchURLProvider({ fetchImpl });

    const result = await provider.fetch('https://example.com/page');

    expect(result.kind).toBe('extracted');
    expect(result.content).toContain('quick brown fox');
  });

  it('returns a cached result on the second fetch', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(htmlResponse('fresh', 'text/plain; charset=utf-8'));
    const cache = new FetchCache();
    const provider = new LocalFetchURLProvider({ fetchImpl, cache });

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
    const provider = new LocalFetchURLProvider({ fetchImpl, cache });

    await provider.fetch('https://example.com/a');
    await provider.fetch('https://example.com/b');

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
