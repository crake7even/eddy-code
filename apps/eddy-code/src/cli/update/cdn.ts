import { valid } from 'semver';

import { EDDY_CODE_CDN_LATEST_URL } from '#/constant/app';

/**
 * Fetch the latest published Eddy Code version from the GitHub Releases API.
 *
 * **Throws** on any failure (network error, non-2xx, empty body, non-semver
 * tag). Callers must catch — `refreshUpdateCache` deliberately lets the
 * error propagate so the existing cache stays intact instead of being
 * overwritten with a null `latest` on a transient blip.
 *
 * `fetchImpl` is injectable for tests; defaults to the global `fetch`.
 */
export async function fetchLatestVersionFromCdn(
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const response = await fetchImpl(EDDY_CODE_CDN_LATEST_URL);
  if (!response.ok) {
    throw new Error(`GitHub Releases API returned HTTP ${response.status}`);
  }
  const data = (await response.json()) as { tag_name?: string };
  const raw = data.tag_name?.replace(/^v/, '') ?? '';
  if (valid(raw) === null) {
    throw new Error(`GitHub Releases tag is not valid semver: ${JSON.stringify(data.tag_name)}`);
  }
  return raw;
}
