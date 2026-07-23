import { execSync } from 'node:child_process';

import type { createEddyDeviceId as createEddyDeviceIdFn } from '@eddy-code/config';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { runShell } from '#/cli/run-shell';

import { captureProcessWrite, ExitCalled, mockProcessExit } from '../helpers/process';

type CreateEddyDeviceId = typeof createEddyDeviceIdFn;

const mocks = vi.hoisted(() => {
  type TuiConfigFallback = {
    theme: 'dark' | 'light' | 'auto';
    editorCommand: string | null;
    notifications: { enabled: boolean; condition: 'unfocused' | 'always' };
  };

  class TuiConfigParseError extends Error {
    readonly fallback: TuiConfigFallback;

    constructor(fallback: TuiConfigFallback) {
      super('Invalid TUI config in ~/.eddy-code/tui.toml; using defaults.');
      this.fallback = fallback;
    }
  }

  return {
    loadTuiConfig: vi.fn(),
    detectTerminalTheme: vi.fn(),
    eddyCodeHarnessConstructor: vi.fn(),
    harnessEnsureConfigFile: vi.fn(),
    harnessPreflight: vi.fn(),
    harnessGetConfig: vi.fn(async () => ({
      providers: {},
      defaultModel: 'k2',
    })),
    harnessGetCachedAccessToken: vi.fn(),
    harnessClose: vi.fn(),
    eddyCodeTuiConstructor: vi.fn(),
    tuiStart: vi.fn(),
    tuiGetStartupMcpMs: vi.fn(async () => 0),
    tuiGetCurrentSessionId: vi.fn(() => ''),
    tuiHasSessionContent: vi.fn(() => false),
    createEddyDeviceId: vi.fn<CreateEddyDeviceId>(() => 'device-1'),
    resolveEddyHome: vi.fn((homeDir?: string) => homeDir ?? '/tmp/eddy-code-test-home'),
    harnessCreatesDeviceIdOnConstruction: false,
    execSync: vi.fn(),
    TuiConfigParseError,
  };
});

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
      preflight = mocks.harnessPreflight;
      getConfig = mocks.harnessGetConfig;
      close = mocks.harnessClose;

      constructor(...args: unknown[]) {
        const options = args[0] as { readonly homeDir?: string } | undefined;
        this.homeDir = options?.homeDir ?? '/tmp/eddy-code-test-home';
        if (mocks.harnessCreatesDeviceIdOnConstruction) {
          mocks.createEddyDeviceId(this.homeDir);
        }
        mocks.eddyCodeHarnessConstructor(...args);
      }
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


vi.mock('../../src/tui/config', () => ({
  loadTuiConfig: mocks.loadTuiConfig,
  TuiConfigParseError: mocks.TuiConfigParseError,
}));

vi.mock('../../src/tui/index', () => ({
  EddyTUI: class {
    onExit?: () => Promise<void>;

    constructor(...args: unknown[]) {
      mocks.eddyCodeTuiConstructor(this, ...args);
    }

    start = mocks.tuiStart;
    getStartupMcpMs = mocks.tuiGetStartupMcpMs;
    getCurrentSessionId = mocks.tuiGetCurrentSessionId;
    hasSessionContent = mocks.tuiHasSessionContent;
  },
}));

vi.mock('../../src/tui/theme/detect', () => ({
  detectTerminalTheme: mocks.detectTerminalTheme,
}));

vi.mock('node:child_process', () => ({
  execSync: mocks.execSync,
}));

vi.mock('../../src/tui/components/chrome/loading', () => ({
  runLoadingAnimation: vi.fn(() => Promise.resolve()),
}));

describe('runShell', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mocks.harnessGetConfig.mockResolvedValue({
      providers: {},
      defaultModel: 'k2',
    });
    mocks.tuiGetStartupMcpMs.mockResolvedValue(0);
    mocks.tuiGetCurrentSessionId.mockReturnValue('');
    mocks.tuiHasSessionContent.mockReturnValue(false);
    mocks.createEddyDeviceId.mockImplementation(() => 'device-1');
    mocks.resolveEddyHome.mockImplementation(
      (homeDir?: string) => homeDir ?? '/tmp/eddy-code-test-home',
    );
    mocks.harnessCreatesDeviceIdOnConstruction = false;
  });

  it('constructs EddyHarness and EddyTUI with startup input', async () => {
    mocks.loadTuiConfig.mockResolvedValue({
      theme: 'dark',
      editorCommand: null,
      notifications: { enabled: true, condition: 'unfocused' },
    });
    mocks.tuiStart.mockResolvedValue(undefined);
    mocks.tuiGetStartupMcpMs.mockResolvedValue(47);
    mocks.tuiGetCurrentSessionId.mockReturnValue('ses-startup');

    const cliOptions = {
      session: undefined,
      continue: false,
      yolo: true,
      auto: false,
      plan: true,
      model: undefined,
      outputFormat: undefined,
      prompt: undefined,
      skillsDirs: [],
    };

    await runShell(cliOptions, '1.2.3-test');

    expect(mocks.eddyCodeHarnessConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        identity: expect.objectContaining({
          userAgentProduct: 'eddy-code-cli',
          version: '1.2.3-test',
        }),
      }),
    );
    expect(mocks.harnessEnsureConfigFile).toHaveBeenCalledOnce();
    expect(mocks.harnessPreflight.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.harnessEnsureConfigFile.mock.invocationCallOrder[0]!,
    );
    expect(execSync).toHaveBeenCalledWith('stty -ixon', { stdio: 'ignore' });
    expect(mocks.eddyCodeTuiConstructor).toHaveBeenCalledTimes(1);

    const [, harness, startupInput] = mocks.eddyCodeTuiConstructor.mock.calls[0]!;
    expect(harness).toBeTypeOf('object');
    expect(startupInput).toMatchObject({
      cliOptions,
      tuiConfig: {
        theme: 'dark',
        editorCommand: null,
        notifications: { enabled: true, condition: 'unfocused' },
      },
      version: '1.2.3-test',
      workDir: process.cwd(),
      resolvedTheme: 'dark',
    });
    expect(mocks.tuiStart).toHaveBeenCalledOnce();
  });


  it('detects auto theme and forwards config parse warnings as startup notice', async () => {
    mocks.loadTuiConfig.mockRejectedValue(
      new mocks.TuiConfigParseError({
        theme: 'auto',
        editorCommand: 'vim',
        notifications: { enabled: true, condition: 'always' },
      }),
    );
    mocks.detectTerminalTheme.mockResolvedValue('light');
    mocks.tuiStart.mockResolvedValue(undefined);

    await runShell(
      {
        session: '',
        continue: false,
        yolo: false,
        auto: false,
        plan: false,
        model: undefined,
        outputFormat: undefined,
        prompt: undefined,
        skillsDirs: [],
      },
      '1.2.3-test',
    );

    expect(mocks.detectTerminalTheme).toHaveBeenCalledOnce();
    const [, , startupInput] = mocks.eddyCodeTuiConstructor.mock.calls[0]!;
    expect(startupInput).toMatchObject({
      startupNotice: 'Invalid TUI config in ~/.eddy-code/tui.toml; using defaults.',
      resolvedTheme: 'light',
      tuiConfig: {
        theme: 'auto',
        editorCommand: 'vim',
        notifications: { enabled: true, condition: 'always' },
      },
    });
  });

  it('closes the harness when TUI startup fails', async () => {
    mocks.loadTuiConfig.mockResolvedValue({
      theme: 'dark',
      editorCommand: null,
      notifications: { enabled: true, condition: 'unfocused' },
    });
    mocks.tuiStart.mockRejectedValue(new Error('boom'));

    await expect(
      runShell(
        {
          session: undefined,
          continue: false,
          yolo: false,
        auto: false,
          plan: false,
          model: undefined,
          outputFormat: undefined,
          prompt: undefined,
          skillsDirs: [],
        },
        '1.2.3-test',
      ),
    ).rejects.toThrow('boom');
    expect(mocks.harnessClose).toHaveBeenCalledOnce();
  });

  it('tracks exit and prints resume instructions from the TUI exit handler', async () => {
    mocks.loadTuiConfig.mockResolvedValue({
      theme: 'dark',
      editorCommand: null,
      notifications: { enabled: true, condition: 'unfocused' },
    });
    mocks.tuiStart.mockResolvedValue(undefined);
    mocks.tuiGetCurrentSessionId.mockReturnValue('ses-1');
    mocks.tuiHasSessionContent.mockReturnValue(true);

    const stdout = captureProcessWrite('stdout');
    const stderr = captureProcessWrite('stderr');
    const exitSpy = mockProcessExit();

    try {
      await runShell(
        {
          session: undefined,
          continue: false,
          yolo: false,
        auto: false,
          plan: false,
          model: undefined,
          outputFormat: undefined,
          prompt: undefined,
          skillsDirs: [],
        },
        '1.2.3-test',
      );
      const [tui] = mocks.eddyCodeTuiConstructor.mock.calls[0]!;

      await expect((tui as { onExit: () => Promise<void> }).onExit()).rejects.toBeInstanceOf(
        ExitCalled,
      );
      expect(stdout.text()).toBe(' 再见！\n');
      expect(stderr.text()).toContain(' 恢复此会话：eddy -r ses-1');
    } finally {
      exitSpy.mockRestore();
      stdout.restore();
      stderr.restore();
    }
  });

});
