import { homedir } from 'node:os';

import { join } from 'pathe';
import { describe, expect, it } from 'vitest';

import { isSensitiveFile } from '../../../src/tools/policies/sensitive';

describe('isSensitiveFile', () => {
  it('flags base .env files in any directory', () => {
    for (const path of ['.env', '/app/.env', 'project/.env']) {
      expect(isSensitiveFile(path), path).toBe(true);
    }
  });

  it('flags .env.<environment> variants', () => {
    for (const path of ['.env.local', '.env.production', '/app/.env.staging']) {
      expect(isSensitiveFile(path), path).toBe(true);
    }
  });

  it('flags cloud credential file locations', () => {
    for (const path of [
      '/home/user/.aws/credentials',
      '/home/user/.gcp/credentials',
      '.aws/credentials',
      '.gcp/credentials',
      'credentials',
    ]) {
      expect(isSensitiveFile(path), path).toBe(true);
    }
  });

  it('matches sensitive patterns case-insensitively on posix paths', () => {
    for (const path of [
      '.ENV',
      '/app/.Env.Local',
      '/home/user/.AWS/Credentials',
      '/home/user/.GCP/CREDENTIALS',
      '/home/user/.ssh/ID_RSA',
      '/home/user/.ssh/ID_ED25519.OLD',
    ]) {
      expect(isSensitiveFile(path), path).toBe(true);
    }
  });

  it('does not flag normal source / config files or env exemplars', () => {
    // Mirrors the py parametrization exactly. `.envrc`, `environment.py`,
    // `.env_example`, `server.key.example`, `id_rsa.pub`, `credentials.json`
    // (basename is `credentials.json`, not the bare `credentials` token) must
    // all pass through.
    for (const path of [
      'app.py',
      'config.yml',
      'README.md',
      'package.json',
      'server.key.example',
      'id_rsa.pub',
      'credentials.json',
      '.envrc',
      'environment.py',
      '.env_example',
      '.env.example',
      '.ENV.EXAMPLE',
      '.env.sample',
      '.ENV.SAMPLE',
      '.env.template',
      '.ENV.TEMPLATE',
      '/app/.env.example',
      '/app/.ENV.EXAMPLE',
    ]) {
      expect(isSensitiveFile(path), path).toBe(false);
    }
  });

  it('flags other credential stores', () => {
    for (const path of [
      '/home/user/.netrc',
      '/repo/.git-credentials',
      '/home/user/.pypirc',
      '/home/user/.kube/config',
      '/home/user/.docker/config.json',
      '/home/user/.eddy-code/config.toml',
      '/home/user/.ssh/deploy_key',
      '/home/user/.ssh/config',
      '/home/user/.gnupg/private-keys-v1.d/abc.key',
      '.ssh/github_key',
      join(homedir(), '.npmrc'),
    ]) {
      expect(isSensitiveFile(path), path).toBe(true);
    }
  });

  it('keeps public keys, project .npmrc, and look-alike configs readable', () => {
    for (const path of [
      '/home/user/.ssh/deploy_key.pub',
      '/repo/.npmrc',
      '/repo/k8s/config',
      '/repo/docker/config.json',
      '/repo/.eddy-code/settings.toml',
    ]) {
      expect(isSensitiveFile(path), path).toBe(false);
    }
  });

  it('still flags .env variants that end in .pub', () => {
    expect(isSensitiveFile('/app/.env.pub')).toBe(true);
  });
});
