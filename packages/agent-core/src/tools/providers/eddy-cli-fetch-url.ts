/**
 * EddyCliFetchURLProvider — host-side UrlFetcher.
 *
 * Flow:
 *   1. Try EddyCli coding-fetch service (POST {url}, Bearer token from a
 *      narrow token provider, Accept: text/markdown, host-provided headers).
 *   2. EddyCli 200 → return the body as `extracted` content (the
 *      service has already extracted the main page text on its side).
 *   3. Any EddyCli failure — non-200, network error, or token
 *      refresh failure — → delegate to `localFallback`, forwarding its
 *      content kind, so the LLM still gets *something* when the service
 *      is down.
 *   4. If localFallback also throws → propagate that error.
 */

import { HttpFetchError, type UrlFetcher, type UrlFetchResult } from '../builtin';
import { FetchCache } from './fetch-cache';

export interface BearerTokenProvider {
  getAccessToken(options?: { readonly force?: boolean | undefined }): Promise<string>;
}

export interface EddyCliFetchURLProviderOptions {
  readonly tokenProvider?: BearerTokenProvider;
  readonly apiKey?: string;
  readonly baseUrl: string;
  readonly defaultHeaders?: Record<string, string>;
  readonly customHeaders?: Record<string, string>;
  readonly localFallback: UrlFetcher;
  readonly fetchImpl?: typeof fetch;
  readonly cache?: FetchCache;
}

function cacheKey(baseUrl: string, url: string): string {
  return `cli:${baseUrl}:${url}`;
}

export class EddyCliFetchURLProvider implements UrlFetcher {
  private readonly tokenProvider: BearerTokenProvider | undefined;
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly defaultHeaders: Record<string, string>;
  private readonly customHeaders: Record<string, string>;
  private readonly localFallback: UrlFetcher;
  private readonly fetchImpl: typeof fetch;
  private readonly cache: FetchCache;

  constructor(options: EddyCliFetchURLProviderOptions) {
    this.tokenProvider = options.tokenProvider;
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl;
    this.defaultHeaders = options.defaultHeaders ?? {};
    this.customHeaders = options.customHeaders ?? {};
    this.localFallback = options.localFallback;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.cache = options.cache ?? new FetchCache();
  }

  async fetch(url: string, options?: { toolCallId?: string }): Promise<UrlFetchResult> {
    const key = cacheKey(this.baseUrl, url);
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const result = await this.fetchFresh(url, options?.toolCallId);
    this.cache.set(key, result);
    return result;
  }

  private async fetchFresh(
    url: string,
    toolCallId: string | undefined,
  ): Promise<UrlFetchResult> {
    try {
      const content = await this.fetchViaEddyCli(url, toolCallId);
      // The service returns text it has already extracted from the page.
      return { content, kind: 'extracted' };
    } catch {
      return this.localFallback.fetch(url, { toolCallId });
    }
  }

  private async fetchViaEddyCli(
    url: string,
    toolCallId: string | undefined,
  ): Promise<string> {
    const bodyJson = JSON.stringify({ url });

    const response = await this.post(bodyJson, toolCallId);

    if (response.status !== 200) {
      let detail = '';
      try {
        detail = await response.text();
      } catch {
        // ignore — status code alone is informative enough for the
        // fallback path that catches this.
      }
      throw new HttpFetchError(
        response.status,
        `EddyCli fetch request failed: HTTP ${String(response.status)}. ${detail}`.trim(),
      );
    }

    return response.text();
  }

  private async post(bodyJson: string, toolCallId: string | undefined): Promise<Response> {
    const accessToken = await this.resolveApiKey();
    return this.fetchImpl(this.baseUrl, {
      method: 'POST',
      headers: {
        ...this.defaultHeaders,
        Authorization: `Bearer ${accessToken}`,
        Accept: 'text/markdown',
        'Content-Type': 'application/json',
        ...(toolCallId !== undefined && toolCallId.length > 0
          ? { 'X-Msh-Tool-Call-Id': toolCallId }
          : {}),
        ...this.customHeaders,
      },
      body: bodyJson,
    });
  }

  private async resolveApiKey(): Promise<string> {
    if (this.tokenProvider !== undefined) {
      try {
        const token = await this.tokenProvider.getAccessToken();
        if (token.trim().length > 0) {
          return token;
        }
        if (this.apiKey !== undefined && this.apiKey.length > 0) {
          return this.apiKey;
        }
      } catch (error) {
        if (this.apiKey !== undefined && this.apiKey.length > 0) {
          return this.apiKey;
        }
        throw error;
      }
    }
    if (this.apiKey !== undefined && this.apiKey.length > 0) {
      return this.apiKey;
    }
    throw new Error('EddyCli fetch service is not configured: missing API key or token provider.');
  }
}
