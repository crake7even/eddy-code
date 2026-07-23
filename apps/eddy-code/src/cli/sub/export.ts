/**
 * `eddy export` sub-command.
 *
 * CLI glue only: session lookup, previous-session confirmation, and output.
 * The actual ZIP/manifest export is owned by the SDK.
 */

import { createInterface } from 'node:readline/promises';

import {
  EddyHarness,
  resolveEddyHome,
  type ExportSessionInput,
  type ExportSessionResult,
  type SessionSummary,
  type ShellEnvironment,
} from '@eddy-code/sdk';
import type { Command } from 'commander';

import { detectInstallSource } from '#/cli/update/source';
import { createEddyCodeHostIdentity } from '#/cli/version';
import { detectShellEnvironment } from '#/utils/process/shell-env';

interface WritableLike {
  write(chunk: string): boolean;
}

export interface PreviousSessionSummary {
  readonly workDir: string;
  readonly sessionId: string;
  readonly sessionDir: string;
  readonly title?: string | undefined;
}

export interface ExportDeps {
  readonly listSessions: (workDir: string) => Promise<readonly SessionSummary[]>;
  readonly exportSession: (input: ExportSessionInput) => Promise<ExportSessionResult>;
  readonly confirmPreviousSession: (summary: PreviousSessionSummary) => Promise<boolean>;
  readonly getInstallSource: () => Promise<string>;
  readonly getShellEnv: () => ShellEnvironment;
  readonly version: string;
  readonly cwd: () => string;
  readonly stdout: WritableLike;
  readonly stderr: WritableLike;
  readonly exit: (code: number) => never;
}

export interface ExportOptions {
  readonly yes: boolean;
  readonly includeGlobalLog: boolean;
}

export async function handleExport(
  deps: ExportDeps,
  sessionId: string | undefined,
  output: string | undefined,
  opts: ExportOptions,
): Promise<void> {
  const requestedId = normalizeOptionalSessionId(sessionId);
  const previousSummary = requestedId === undefined ? await findPreviousSession(deps) : undefined;

  let resolvedId: string;
  if (requestedId !== undefined) {
    resolvedId = requestedId;
  } else {
    if (previousSummary === undefined) {
      deps.stderr.write('No exportable previous session was found.\n');
      deps.exit(1);
    }
    resolvedId = previousSummary.id;
    if (!opts.yes) {
      const confirmed = await deps.confirmPreviousSession(toPreviousSessionSummary(previousSummary));
      if (!confirmed) {
        deps.stdout.write('Export canceled.\n');
        return;
      }
    }
  }

  try {
    const installSource = await deps.getInstallSource();
    const shellEnv = deps.getShellEnv();
    const result = await deps.exportSession({
      id: resolvedId,
      version: deps.version,
      installSource,
      shellEnv,
      ...(output === undefined ? {} : { outputPath: output }),
      ...(opts.includeGlobalLog ? { includeGlobalLog: true } : {}),
    });
    deps.stdout.write(`${result.zipPath}\n`);
  } catch (error) {
    deps.stderr.write(`${errorMessage(error)}\n`);
    deps.exit(1);
  }
}

export function registerExportCommand(parent: Command, deps?: Partial<ExportDeps>): void {
  parent
    .command('export')
    .description('Export a session as a ZIP archive.')
    .option('-o, --output <path>', 'Output ZIP path.')
    .option('-y, --yes', 'Skip previous-session confirmation.')
    .option('--no-include-global-log', 'Do not include the global diagnostic log.')
    .argument('[sessionId]', 'Session ID to export. Defaults to the most recent session.')
    .action(
      async (
        sessionId: string | undefined,
        options: { output?: string; yes?: boolean; includeGlobalLog?: boolean },
      ) => {
        await handleExport(createDefaultExportDeps(deps), sessionId, options.output, {
          yes: options.yes === true,
          includeGlobalLog: options.includeGlobalLog !== false,
        });
      },
    );
}

function createDefaultExportDeps(overrides: Partial<ExportDeps> = {}): ExportDeps {
  let harness: EddyHarness | undefined;
  const identity = createEddyCodeHostIdentity();
  const getHarness = (): EddyHarness => {
    harness ??= new EddyHarness({
      homeDir: resolveEddyHome(),
      identity,
    });
    return harness;
  };
  return {
    listSessions:
      overrides.listSessions ??
      ((workDir: string) =>
        getHarness().listSessions({
          workDir,
        })),
    exportSession:
      overrides.exportSession ??
      (async (input: ExportSessionInput) => getHarness().exportSession(input)),
    confirmPreviousSession: overrides.confirmPreviousSession ?? confirmPreviousSession,
    getInstallSource: overrides.getInstallSource ?? (async () => detectInstallSource()),
    getShellEnv: overrides.getShellEnv ?? detectShellEnvironment,
    version: overrides.version ?? identity.version,
    cwd: overrides.cwd ?? (() => process.cwd()),
    stdout: overrides.stdout ?? process.stdout,
    stderr: overrides.stderr ?? process.stderr,
    exit:
      overrides.exit ??
      ((code: number): never => {
        process.exit(code);
      }),
  };
}

async function findPreviousSession(deps: ExportDeps): Promise<SessionSummary | undefined> {
  const sessions = await deps.listSessions(deps.cwd());
  return sessions[0];
}

function normalizeOptionalSessionId(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}

function toPreviousSessionSummary(summary: SessionSummary): PreviousSessionSummary {
  return {
    workDir: summary.workDir,
    sessionId: summary.id,
    sessionDir: summary.sessionDir,
    ...(summary.title === undefined ? {} : { title: summary.title }),
  };
}

async function confirmPreviousSession(summary: PreviousSessionSummary): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const label = summary.title ?? summary.sessionId;
    const answer = await rl.question(`Export previous session "${label}"? [y/N] `);
    return answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes';
  } finally {
    rl.close();
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
