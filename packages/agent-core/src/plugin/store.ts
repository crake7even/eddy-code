import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  PluginCapabilityState,
  PluginGithubMetadata,
  PluginSource,
} from './types';

const PLUGINS_DIR_REL = path.join('plugins');
const INSTALLED_REL = path.join(PLUGINS_DIR_REL, 'installed.json');

export interface InstalledRecord {
  readonly id: string;
  readonly root: string;
  readonly source: PluginSource;
  readonly enabled: boolean;
  readonly installedAt: string;
  readonly updatedAt?: string;
  readonly originalSource?: string;
  readonly capabilities?: PluginCapabilityState;
  readonly github?: PluginGithubMetadata;
}

export interface InstalledFile {
  readonly version: 1;
  readonly plugins: readonly InstalledRecord[];
}

const EMPTY: InstalledFile = { version: 1, plugins: [] };

export async function readInstalled(eddyHomeDir: string): Promise<InstalledFile> {
  const filePath = path.join(eddyHomeDir, INSTALLED_REL);
  let text: string;
  try {
    text = await readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return EMPTY;
    throw error;
  }
  try {
    const parsed = JSON.parse(text) as InstalledFile & { plugins?: unknown[] };
    if (typeof parsed !== 'object' || parsed === null || !Array.isArray(parsed.plugins)) {
      throw new Error('installed.json is not a valid InstalledFile object');
    }
    const plugins: InstalledRecord[] = [];
    for (const raw of parsed.plugins) {
      const migrated = await migrateInstalledRecord(eddyHomeDir, raw);
      if (migrated !== undefined) plugins.push(migrated);
    }
    return { version: 1, plugins };
  } catch (error) {
    throw new Error(
      `Failed to parse ${filePath}: ${(error as Error).message}`,
      { cause: error },
    );
  }
}
/**
 * Migrate legacy installed.json entries that used `name`/`path` instead of
 * `id`/`root`, and drop stale legacy entries whose plugin root no longer exists
 * on disk.
 */
async function migrateInstalledRecord(
  eddyHomeDir: string,
  raw: unknown,
): Promise<InstalledRecord | undefined> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const record = raw as Record<string, unknown>;

  const hasNewId = typeof record['id'] === 'string' && record['id'].length > 0;
  const hasNewRoot = typeof record['root'] === 'string' && record['root'].length > 0;
  const hasLegacyName = typeof record['name'] === 'string' && record['name'].length > 0;
  const hasLegacyPath = typeof record['path'] === 'string' && record['path'].length > 0;

  // Prefer the new `id`/`root` fields when present.
  const id: string | undefined = hasNewId
    ? (record['id'] as string)
    : hasLegacyName
      ? (record['name'] as string)
      : undefined;
  if (id === undefined) return undefined;

  let root: string | undefined;
  let isLegacyPath = false;
  if (hasNewRoot) {
    root = record['root'] as string;
  } else if (hasLegacyPath) {
    root = record['path'] as string;
    isLegacyPath = true;
  }
  if (root === undefined) return undefined;

  // Legacy `path` was relative to the plugins directory (e.g. "managed/foo").
  if (isLegacyPath && !path.isAbsolute(root)) {
    root = path.join(eddyHomeDir, PLUGINS_DIR_REL, root);
  }

  // Legacy entries sometimes outlive their plugin directory (e.g. user deleted
  // the folder manually). Drop those stale records; the next persist() will
  // rewrite installed.json without them.
  if (isLegacyPath) {
    try {
      const info = await stat(root);
      if (!info.isDirectory()) return undefined;
    } catch {
      return undefined;
    }
  }

  const source = (record['source'] as PluginSource | undefined) ?? 'local-path';
  const enabled = typeof record['enabled'] === 'boolean' ? record['enabled'] : true;
  const installedAt = typeof record['installedAt'] === 'string' && record['installedAt'].length > 0
    ? record['installedAt']
    : new Date().toISOString();

  return {
    id,
    root,
    source,
    enabled,
    installedAt,
    updatedAt: typeof record['updatedAt'] === 'string' ? record['updatedAt'] : undefined,
    originalSource: typeof record['originalSource'] === 'string' ? record['originalSource'] : undefined,
    capabilities: isCapabilityState(record['capabilities']) ? record['capabilities'] : undefined,
    github: isGithubMetadata(record['github']) ? record['github'] : undefined,
  };
}

function isCapabilityState(value: unknown): value is PluginCapabilityState {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isGithubMetadata(value: unknown): value is PluginGithubMetadata {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function writeInstalled(
  eddyHomeDir: string,
  data: InstalledFile,
): Promise<void> {
  const dir = path.join(eddyHomeDir, PLUGINS_DIR_REL);
  await mkdir(dir, { recursive: true });
  const final = path.join(dir, 'installed.json');
  const tmp = `${final}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await rename(tmp, final);
}
