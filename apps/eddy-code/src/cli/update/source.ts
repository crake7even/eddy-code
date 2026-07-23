/**
 * Detect whether the running CLI is installed from source (git clone).
 *
 * The only supported install method is `git clone` into the Eddy Code source
 * install directory followed by `pnpm install && pnpm -r build`. All other
 * layouts are treated as "unsupported" for automatic updates.
 */

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, parse, resolve } from 'node:path';

import { type InstallSource } from './types';

export interface DetectInstallSourceDeps {
  readonly cwd: () => string;
  readonly existsSync: (path: string) => boolean;
  readonly homeDir: () => string;
  readonly mainModulePath: () => string | undefined;
  readonly platform: NodeJS.Platform;
}

const POSIX_EDDY_CODE_INSTALL_DIR_NAME = '.eddy-code';
const WINDOWS_EDDY_CODE_INSTALL_DIR_NAME = 'eddy-code';
const LEGACY_SOURCE_INSTALL_DIR_NAME = '.eddy-code';

function unique(paths: readonly (string | undefined)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const path of paths) {
    if (path === undefined || path.length === 0) continue;
    const resolved = resolve(path);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    result.push(resolved);
  }
  return result;
}

function findNearestGitRoot(
  startDir: string | undefined,
  pathExists: (path: string) => boolean,
): string | null {
  if (startDir === undefined || startDir.length === 0) return null;

  let current = resolve(startDir);
  const root = parse(current).root;

  while (true) {
    if (pathExists(join(current, '.git'))) return current;
    if (current === root) return null;
    current = dirname(current);
  }
}

export function getDefaultSourceInstallDir(
  platform: NodeJS.Platform = process.platform,
  homeDir: string = homedir(),
): string {
  return join(
    homeDir,
    platform === 'win32'
      ? WINDOWS_EDDY_CODE_INSTALL_DIR_NAME
      : POSIX_EDDY_CODE_INSTALL_DIR_NAME,
  );
}

function getFallbackSourceInstallDirs(
  platform: NodeJS.Platform,
  homeDir: string,
): readonly string[] {
  return unique([
    getDefaultSourceInstallDir(platform, homeDir),
    join(homeDir, POSIX_EDDY_CODE_INSTALL_DIR_NAME),
    join(homeDir, LEGACY_SOURCE_INSTALL_DIR_NAME),
  ]);
}

export function getSourceInstallDir(
  deps: Partial<DetectInstallSourceDeps> = {},
): string | null {
  const resolved: DetectInstallSourceDeps = {
    cwd: deps.cwd ?? (() => process.cwd()),
    existsSync: deps.existsSync ?? existsSync,
    homeDir: deps.homeDir ?? homedir,
    mainModulePath: deps.mainModulePath ?? (() => process.argv[1]),
    platform: deps.platform ?? process.platform,
  };

  const mainModulePath = resolved.mainModulePath();
  const fromMain = findNearestGitRoot(
    mainModulePath === undefined ? undefined : dirname(mainModulePath),
    resolved.existsSync,
  );
  if (fromMain !== null) return fromMain;

  const fromCwd = findNearestGitRoot(resolved.cwd(), resolved.existsSync);
  if (fromCwd !== null) return fromCwd;

  for (const installDir of getFallbackSourceInstallDirs(
    resolved.platform,
    resolved.homeDir(),
  )) {
    if (resolved.existsSync(join(installDir, '.git'))) return installDir;
  }

  return null;
}

export function detectInstallSource(
  deps: Partial<DetectInstallSourceDeps> = {},
): InstallSource {
  return getSourceInstallDir(deps) === null ? 'unsupported' : 'source';
}
