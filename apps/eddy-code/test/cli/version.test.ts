import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildEddyDefaultHeaders,
  getHostPackageJsonPath,
  getHostPackageRoot,
  getVersion,
} from '#/cli/version';

describe('cli version helpers', () => {
  it('resolves the host package manifest near apps/eddy-code and reads its version', () => {
    const pkgPath = getHostPackageJsonPath();
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string };

    expect(pkgPath.replace(/\\/g, '/').endsWith('/apps/eddy-code/package.json')).toBe(true);
    expect(getHostPackageRoot()).toBe(dirname(pkgPath));
    expect(getVersion()).toBe(pkg.version);
  });

  it('builds default headers with the eddy-code-cli user-agent', () => {
    const headers = buildEddyDefaultHeaders('1.2.3');

    expect(headers['User-Agent']).toBe('eddy-code-cli/1.2.3');
  });
});
