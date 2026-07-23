import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { detectInstallSource, getDefaultSourceInstallDir, getSourceInstallDir } from '#/cli/update/source';

describe('detectInstallSource', () => {
  it('returns source when the current source tree contains a .git directory', () => {
    const installDir = resolve('/home/user', '.eddy-code');
    expect(
      detectInstallSource({
        cwd: () => installDir,
        homeDir: () => '/home/user',
        mainModulePath: () => undefined,
        platform: 'linux',
        existsSync: (path: string) => path === join(installDir, '.git'),
      }),
    ).toBe('source');
  });

  it('returns source for the default ~/.eddy-code path even when EDDY_CODE_HOME points elsewhere', () => {
    const defaultGitDir = resolve('/home/user', '.eddy-code', '.git');

    expect(
      detectInstallSource({
        cwd: () => '/custom/path',
        homeDir: () => '/home/user',
        mainModulePath: () => undefined,
        platform: 'linux',
        existsSync: (path: string) => path === defaultGitDir,
      }),
    ).toBe('source');
  });

  it('uses ~/eddy-code as the default source install directory on Windows', () => {
    const installDir = getDefaultSourceInstallDir('win32', '/home/user');
    expect(installDir).toContain('eddy-code');
    expect(installDir).not.toContain('.eddy-code');
  });

  it('returns source for the legacy ~/.eddy-code path even when EDDY_CODE_HOME points elsewhere', () => {
    const legacyGitDir = resolve('/home/user', '.eddy-code', '.git');

    expect(
      detectInstallSource({
        cwd: () => '/custom/path',
        homeDir: () => '/home/user',
        mainModulePath: () => undefined,
        platform: 'linux',
        existsSync: (path: string) => path === legacyGitDir,
      }),
    ).toBe('source');
  });

  it('returns the nearest source tree from the running main module path', () => {
    const installDir = resolve('/home/user', '.eddy-code');
    expect(
      getSourceInstallDir({
        cwd: () => '/tmp',
        homeDir: () => '/home/user',
        mainModulePath: () => join(installDir, 'apps', 'eddy-code', 'dist', 'main.mjs'),
        platform: 'linux',
        existsSync: (path: string) => path === join(installDir, '.git'),
      }),
    ).toBe(installDir);
  });

  it('returns unsupported when no .git directory is found', () => {
    expect(
      detectInstallSource({
        cwd: () => resolve('/home/user', '.eddy-code'),
        homeDir: () => '/home/user',
        mainModulePath: () => undefined,
        platform: 'linux',
        existsSync: () => false,
      }),
    ).toBe('unsupported');
  });

  it('returns unsupported when only the install dir exists without .git', () => {
    const installDir = join('/home/user', '.eddy-code');
    expect(
      detectInstallSource({
        cwd: () => installDir,
        homeDir: () => '/home/user',
        mainModulePath: () => undefined,
        platform: 'linux',
        existsSync: (path: string) => path === installDir,
      }),
    ).toBe('unsupported');
  });
});
