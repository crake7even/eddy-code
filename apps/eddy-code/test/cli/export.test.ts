/**
 * `eddy export`
 *
 * Verifies the CLI layer: argument handling, previous-session confirmation,
 * error reporting, and delegation to the session export implementation.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { createEddyDeviceId as createEddyDeviceIdFn } from '@eddy-code/config';
import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { handleExport, registerExportCommand } from '#/cli/sub/export';
import type { ExportDeps } from '#/cli/sub/export';
import type {
  ExportSessionInput,
  ExportSessionManifest,
  ExportSessionResult,
  SessionSummary,
} from '@eddy-code/sdk';

let tmp: string;

type CreateEddyDeviceId = typeof createEddyDeviceIdFn;

const mocks = vi.hoisted(() => ({
  eddyCodeHarnessConstructor: vi.fn(),
  harnessEnsureConfigFile: vi.fn(),
  harnessGetConfig: vi.fn(async () => ({
    providers: {},
    defaultModel: 'k2',
  })),
  harnessGetCachedAccessToken: vi.fn(),
  harnessExportSession: vi.fn(),
  createEddyDeviceId: vi.fn<CreateEddyDeviceId>(() => 'device-1'),
  resolveEddyHome: vi.fn((homeDir?: string) => homeDir ?? '/tmp/eddy-export-home'),
  harnessCreatesDeviceIdOnConstruction: false,
}));

vi.mock('@eddy-code/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@eddy-code/sdk')>();
  return {
    ...actual,
    resolveEddyHome: mocks.resolveEddyHome,
    EddyHarness: class {
      homeDir: string;
      auth = {
        getCachedAccessToken: mocks.harnessGetCachedAccessToken,
      };
      ensureConfigFile = mocks.harnessEnsureConfigFile;
      getConfig = mocks.harnessGetConfig;
      constructor(...args: unknown[]) {
        const options = args[0] as { readonly homeDir?: string } | undefined;
        this.homeDir = options?.homeDir ?? '/tmp/eddy-export-home';
        if (mocks.harnessCreatesDeviceIdOnConstruction) {
          mocks.createEddyDeviceId(this.homeDir);
        }
        mocks.eddyCodeHarnessConstructor(...args);
      }

      exportSession = mocks.harnessExportSession;
    },
  };
});

vi.mock('@eddy-code/config', async () => {
  const actual = await vi.importActual<typeof import('@eddy-code/config')>(
    '@eddy-code/config',
  );
  return {
    ...actual,
    createEddyDeviceId: mocks.createEddyDeviceId,
    EDDY_CODE_PROVIDER_NAME: 'eddy-code',
  };
});



beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'eddy-export-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
  vi.clearAllMocks();
  mocks.harnessGetConfig.mockResolvedValue({
    providers: {},
    defaultModel: 'k2',
  });
  mocks.createEddyDeviceId.mockImplementation(() => 'device-1');
  mocks.resolveEddyHome.mockImplementation(
    (homeDir?: string) => homeDir ?? '/tmp/eddy-export-home',
  );
  mocks.harnessCreatesDeviceIdOnConstruction = false;
});

function makeSummary(id: string, overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id,
    workDir: tmp,
    sessionDir: join(tmp, 'sessions', id),
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  };
}

function makeResult(id: string, zipPath: string): ExportSessionResult {
  const manifest: ExportSessionManifest = {
    sessionId: id,
    exportedAt: '2026-04-18T12:00:00.000Z',
    eddyCodeVersion: '1.27.0',
    wireProtocolVersion: '1.0',
    os: 'test',
    nodejsVersion: '22.0.0',
    workspaceDir: tmp,
  };
  return {
    zipPath,
    entries: ['manifest.json', 'wire.jsonl'],
    sessionDir: join(tmp, 'sessions', id),
    manifest,
  };
}

function makeDeps(overrides: Partial<ExportDeps> = {}): {
  deps: ExportDeps;
  stdout: string[];
  stderr: string[];
  exitCodes: number[];
  exportInputs: ExportSessionInput[];
  listedWorkDirs: string[];
} {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCodes: number[] = [];
  const exportInputs: ExportSessionInput[] = [];
  const listedWorkDirs: string[] = [];
  const deps: ExportDeps = {
    listSessions: async (workDir) => {
      listedWorkDirs.push(workDir);
      return [];
    },
    exportSession: async (input) => {
      exportInputs.push(input);
      return makeResult(input.id, input.outputPath ?? join(tmp, `${input.id}.zip`));
    },
    confirmPreviousSession: async () => true,
    getInstallSource: async () => 'npm-global',
    getShellEnv: () => ({ term: 'xterm-256color', shell: '/bin/zsh' }),
    version: '1.0.0-test',
    cwd: () => tmp,
    stdout: {
      write: (chunk: string) => {
        stdout.push(chunk);
        return true;
      },
    },
    stderr: {
      write: (chunk: string) => {
        stderr.push(chunk);
        return true;
      },
    },
    exit: ((code: number) => {
      exitCodes.push(code);
      throw new ExitCalled(code);
    }) as ExportDeps['exit'],
    ...overrides,
  };
  return { deps, stdout, stderr, exitCodes, exportInputs, listedWorkDirs };
}

class ExitCalled extends Error {
  constructor(public readonly code: number) {
    super(`exit(${code})`);
  }
}

async function runExport(
  deps: ExportDeps,
  args: {
    sessionId?: string;
    output?: string;
    yes?: boolean;
    includeGlobalLog?: boolean;
  } = {},
): Promise<void> {
  try {
    await handleExport(deps, args.sessionId, args.output, {
      yes: args.yes ?? false,
      includeGlobalLog: args.includeGlobalLog ?? true,
    });
  } catch (error) {
    if (error instanceof ExitCalled) return;
    throw error;
  }
}

describe('eddy export', () => {
  it('delegates a named session export and prints the resulting zip path', async () => {
    const output = join(tmp, 'out.zip');
    const { deps, stdout, stderr, exitCodes, exportInputs, listedWorkDirs } = makeDeps();

    await runExport(deps, { sessionId: 'ses_test123456', output });

    expect(exitCodes).toEqual([]);
    expect(stderr).toEqual([]);
    expect(listedWorkDirs).toEqual([]);
    expect(exportInputs).toEqual([{ id: 'ses_test123456', outputPath: output, includeGlobalLog: true, version: '1.0.0-test', installSource: 'npm-global', shellEnv: { term: 'xterm-256color', shell: '/bin/zsh' } }]);
    expect(stdout.join('').trim()).toBe(output);
  });

  it('omits outputPath when the caller does not provide --output', async () => {
    const { deps, stdout, exportInputs } = makeDeps();

    await runExport(deps, { sessionId: 'session_default_output' });

    expect(exportInputs).toEqual([{ id: 'session_default_output', includeGlobalLog: true, version: '1.0.0-test', installSource: 'npm-global', shellEnv: { term: 'xterm-256color', shell: '/bin/zsh' } }]);
    expect(stdout.join('').trim()).toBe(join(tmp, 'session_default_output.zip'));
  });

  it('exits 1 when no session-id is provided and no previous session exists', async () => {
    const { deps, stderr, exitCodes, exportInputs, listedWorkDirs } = makeDeps();

    await runExport(deps);

    expect(listedWorkDirs).toEqual([tmp]);
    expect(exportInputs).toEqual([]);
    expect(exitCodes).toContain(1);
    expect(stderr.join('').toLowerCase()).toContain('no exportable previous session');
  });

  it('surfaces export errors for a named session', async () => {
    const { deps, stderr, exitCodes } = makeDeps({
      exportSession: async () => {
        throw new Error('Session "ses_does_not_exist" was not found');
      },
    });

    await runExport(deps, { sessionId: 'ses_does_not_exist' });

    expect(exitCodes).toContain(1);
    expect(stderr.join('').toLowerCase()).toContain('not found');
  });

  it('falls back to the most-recent session when no id is supplied', async () => {
    const previous = makeSummary('ses_fallback');
    const output = join(tmp, 'fallback.zip');
    const { deps, stdout, exitCodes, exportInputs } = makeDeps({
      listSessions: async () => [previous],
    });

    await runExport(deps, { output });

    expect(exitCodes).toEqual([]);
    expect(exportInputs).toEqual([{ id: 'ses_fallback', outputPath: output, includeGlobalLog: true, version: '1.0.0-test', installSource: 'npm-global', shellEnv: { term: 'xterm-256color', shell: '/bin/zsh' } }]);
    expect(stdout.join('').trim()).toBe(output);
  });

  it('confirms before exporting the previous session when no id is supplied', async () => {
    const previous = makeSummary('ses_confirm', { title: 'Prod debug' });
    const summaries: unknown[] = [];
    const { deps, stdout, exitCodes, exportInputs } = makeDeps({
      listSessions: async () => [previous],
      confirmPreviousSession: async (summary) => {
        summaries.push(summary);
        return false;
      },
    });

    await runExport(deps, { output: join(tmp, 'cancelled.zip') });

    expect(exitCodes).toEqual([]);
    expect(exportInputs).toEqual([]);
    expect(stdout.join('')).toContain('Export canceled.');
    expect(summaries).toEqual([
      {
        workDir: tmp,
        sessionId: 'ses_confirm',
        sessionDir: join(tmp, 'sessions', 'ses_confirm'),
        title: 'Prod debug',
      },
    ]);
  });

  it('skips previous-session confirmation with --yes', async () => {
    const previous = makeSummary('ses_yes');
    const { deps, exitCodes, exportInputs } = makeDeps({
      listSessions: async () => [previous],
      confirmPreviousSession: async () => {
        throw new Error('confirm should not be called');
      },
    });

    await runExport(deps, { output: join(tmp, 'yes.zip'), yes: true });

    expect(exitCodes).toEqual([]);
    expect(exportInputs).toEqual([{ id: 'ses_yes', outputPath: join(tmp, 'yes.zip'), includeGlobalLog: true, version: '1.0.0-test', installSource: 'npm-global', shellEnv: { term: 'xterm-256color', shell: '/bin/zsh' } }]);
  });

  it('describes the user-facing command without implementation details', () => {
    const program = new Command('eddy');
    const { deps } = makeDeps();

    registerExportCommand(program, deps);

    const command = program.commands.find((item) => item.name() === 'export');
    expect(command?.description()).toBe('Export a session as a ZIP archive.');
    expect(command?.description()).not.toMatch(/sdk/i);
  });

  it('parses --no-include-global-log as an option when no session id is given', async () => {
    const previous = makeSummary('ses_global_log');
    const { deps, stdout, exitCodes, exportInputs } = makeDeps({
      listSessions: async () => [previous],
      confirmPreviousSession: async () => true,
    });
    const program = new Command('eddy');
    registerExportCommand(program, deps);

    await program.parseAsync(['node', 'eddy', 'export', '--no-include-global-log', '-y']);

    expect(exitCodes).toEqual([]);
    expect(exportInputs).toEqual([{ id: 'ses_global_log', version: '1.0.0-test', installSource: 'npm-global', shellEnv: { term: 'xterm-256color', shell: '/bin/zsh' } }]);
    expect(stdout.join('').trim()).toBe(join(tmp, 'ses_global_log.zip'));
  });

  it('parses options after an explicit session id', async () => {
    const output = join(tmp, 'after-id.zip');
    const { deps, exitCodes, exportInputs } = makeDeps();
    const program = new Command('eddy');
    registerExportCommand(program, deps);

    await program.parseAsync([
      'node',
      'eddy',
      'export',
      'ses_after_id',
      '-o',
      output,
      '-y',
      '--no-include-global-log',
    ]);

    expect(exitCodes).toEqual([]);
    expect(exportInputs).toEqual([
      { id: 'ses_after_id', outputPath: output, version: '1.0.0-test', installSource: 'npm-global', shellEnv: { term: 'xterm-256color', shell: '/bin/zsh' } },
    ]);
  });

});
