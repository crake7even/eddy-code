import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'pathe';

export function resolveEddyHome(homeDir?: string | undefined): string {
  return homeDir ?? process.env['EDDY_CODE_HOME'] ?? join(homedir(), '.eddy-code');
}

export function resolveConfigPath(input: {
  readonly homeDir?: string | undefined;
  readonly configPath?: string | undefined;
}): string {
  return input.configPath ?? join(resolveEddyHome(input.homeDir), 'config.toml');
}

export function ensureEddyHome(homeDir: string): void {
  mkdirSync(homeDir, { recursive: true, mode: 0o700 });
}
