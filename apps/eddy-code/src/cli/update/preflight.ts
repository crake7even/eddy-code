import { spawn } from 'node:child_process';

import { readUpdateCache } from './cache';
import { promptForInstallConfirmation, type InstallPromptOptions } from './prompt';
import { refreshUpdateCache } from './refresh';
import { selectUpdateTarget } from './select';
import { getDefaultSourceInstallDir, getSourceInstallDir } from './source';
import {
  type InstallSource,
  type UpdateDecision,
  type UpdatePreflightResult,
  type UpdateTarget,
} from './types';

export type { UpdatePreflightResult } from './types';

export interface RunUpdatePreflightOptions {
  readonly stdout?: { write(chunk: string): boolean };
  readonly stderr?: { write(chunk: string): boolean };
  readonly isTTY?: boolean;
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function quotePathForCommand(path: string): string {
  return `"${path.replaceAll('"', '\\"')}"`;
}

function renderManualUpdateCommand(installDir: string): string {
  if (process.platform === 'win32') {
    return (
      `Set-Location -LiteralPath ${quotePathForCommand(installDir)}; ` +
      `git pull origin main; pnpm install; pnpm -r build`
    );
  }

  return (
    `cd ${quotePathForCommand(installDir)} && ` +
    `git pull origin main && pnpm install && pnpm -r build`
  );
}

function renderManualUpdateMessage(
  currentVersion: string,
  target: UpdateTarget,
  installDir: string,
): string {
  return (
    `Eddy Code 有新版本可用 ` +
    `(${currentVersion} -> ${target.version})。\n` +
    `自动更新失败，请手动执行：\n` +
    `  ${renderManualUpdateCommand(installDir)}\n`
  );
}

function renderInstallSuccessMessage(target: UpdateTarget): string {
  return `已更新至 ${target.version}。请重新启动 Eddy Code 以使用新版本。\n`;
}

function refreshInBackground(): void {
  void refreshUpdateCache().catch(() => {});
}

async function promptInstall(
  currentVersion: string,
  target: UpdateTarget,
  source: InstallSource,
  installCommand: string,
): Promise<boolean> {
  const options: InstallPromptOptions = {
    currentVersion,
    target,
    installCommand,
    installSource: source,
  };
  return promptForInstallConfirmation(options);
}

async function installUpdate(installDir: string): Promise<void> {
  const commands: readonly { readonly cmd: string; readonly args: readonly string[]; readonly cwd?: string }[] = [
    { cmd: 'git', args: ['pull', 'origin', 'main'], cwd: installDir },
    { cmd: 'pnpm', args: ['install'], cwd: installDir },
    { cmd: 'pnpm', args: ['-r', 'build'], cwd: installDir },
  ];

  for (const { cmd, args, cwd } of commands) {
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const child = spawn(cmd, args, { cwd, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${cmd} 失败（exit ${code ?? signal}）`));
    });
    await promise;
  }
}

export function decideUpdateAction(
  target: UpdateTarget | null,
  isInteractive: boolean,
): UpdateDecision {
  if (target === null) return 'none';
  if (!isInteractive) return 'manual-command';
  return 'prompt-install';
}

export async function runUpdatePreflight(
  currentVersion: string,
  options: RunUpdatePreflightOptions = {},
): Promise<UpdatePreflightResult> {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;

  try {
    const cache = await readUpdateCache().catch(() => null);
    const latest = cache?.latest ?? null;
    const target = selectUpdateTarget(currentVersion, latest);
    refreshInBackground();

    const isInteractive =
      options.isTTY ?? (process.stdin.isTTY && process.stdout.isTTY);
    const decision = decideUpdateAction(target, isInteractive);
    if (decision === 'none' || target === null) return 'continue';

    const installDir = isInteractive ? getSourceInstallDir() : null;
    const fallbackInstallDir = installDir ?? getDefaultSourceInstallDir();
    const installCommand = renderManualUpdateCommand(fallbackInstallDir);

    if (installDir === null) {
      stdout.write(renderManualUpdateMessage(currentVersion, target, fallbackInstallDir));
      return 'continue';
    }

    const confirmed = await promptInstall(currentVersion, target, 'source', installCommand);
    if (!confirmed) return 'continue';

    try {
      await installUpdate(installDir);
      stdout.write(renderInstallSuccessMessage(target));
      return 'exit';
    } catch (error) {
      stderr.write(
        `警告：更新失败：${formatErrorMessage(error)}\n`,
      );
      return 'continue';
    }
  } catch {
    return 'continue';
  }
}
