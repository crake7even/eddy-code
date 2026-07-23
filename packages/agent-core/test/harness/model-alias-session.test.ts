import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'pathe';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createRPC,
  EddyCore,
  type CoreAPI,
  type SDKAPI,
} from '../../src';

const CONFIG = `
default_model = "eddy-code/eddy-for-coding"

[providers."managed:eddy-code"]
type = "eddy"
api_key = "test-key"
base_url = "https://api.example/v1"

[models."eddy-code/eddy-for-coding"]
provider = "managed:eddy-code"
model = "eddy-for-coding"
max_context_size = 1000000
`;

describe('HarnessAPI session model aliases', () => {
  let tmp: string;
  let homeDir: string;
  let workDir: string;
  let configPath: string;
  const cores: EddyCore[] = [];

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'eddy-model-alias-'));
    homeDir = join(tmp, 'home');
    workDir = join(tmp, 'work');
    configPath = join(tmp, 'config.toml');
    cores.length = 0;
    await mkdir(workDir, { recursive: true });
    await writeFile(configPath, CONFIG);
  });

  afterEach(async () => {
    for (const core of cores) {
      for (const session of core.sessions.values()) {
        await session.close().catch(() => {});
      }
    }
    await rm(tmp, { recursive: true, force: true });
  });

  it('keeps the configured alias separate from the provider model across create, setModel, and resume', async () => {
    const rpc = await createTestRpc();
    const created = await rpc.createSession({
      workDir,
      model: 'eddy-code/eddy-for-coding',
    });

    expect(await rpc.getModel({ sessionId: created.id, agentId: 'main' })).toBe(
      'eddy-code/eddy-for-coding',
    );

    const config = await rpc.getConfig({ sessionId: created.id, agentId: 'main' });
    expect(config.modelAlias).toBe('eddy-code/eddy-for-coding');
    expect(config.provider?.model).toBe('eddy-for-coding');
    expect(config.modelCapabilities?.max_context_tokens).toBe(1_000_000);

    await rpc.setModel({
      sessionId: created.id,
      agentId: 'main',
      model: 'eddy-code/eddy-for-coding',
    });

    const freshRpc = await createTestRpc();
    await freshRpc.resumeSession({ sessionId: created.id });

    expect(await freshRpc.getModel({ sessionId: created.id, agentId: 'main' })).toBe(
      'eddy-code/eddy-for-coding',
    );
  });

  it('re-bootstraps profile and model when resuming a session whose wire has no config.update', async () => {
    // A migrated session ships a wire.jsonl with only `metadata` and message
    // records 鈥?none of the `config.update` / `tools.set_active_tools`
    // bootstrap events a natively-created session writes. Resuming it must
    // still yield a usable agent (model + system prompt), not an empty config.
    const rpc = await createTestRpc();
    const created = await rpc.createSession({
      workDir,
      model: 'eddy-code/eddy-for-coding',
    });
    await rpc.closeSession({ sessionId: created.id });

    const wirePath = await findWireFile(homeDir);
    const kept = (await readFile(wirePath, 'utf-8'))
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .filter((line) => {
        const type = (JSON.parse(line) as { type?: string }).type;
        return type !== 'config.update' && type !== 'tools.set_active_tools';
      });
    await writeFile(wirePath, `${kept.join('\n')}\n`);

    const freshRpc = await createTestRpc();
    await freshRpc.resumeSession({ sessionId: created.id });

    expect(await freshRpc.getModel({ sessionId: created.id, agentId: 'main' })).toBe(
      'eddy-code/eddy-for-coding',
    );
    const config = await freshRpc.getConfig({ sessionId: created.id, agentId: 'main' });
    expect(config.modelAlias).toBe('eddy-code/eddy-for-coding');
    expect(config.systemPrompt.length).toBeGreaterThan(0);
  });

  it('applies RPC config updates to later agent model changes', async () => {
    const rpc = await createTestRpc();
    const created = await rpc.createSession({
      workDir,
      model: 'eddy-code/eddy-for-coding',
    });

    const updatedConfig = await rpc.setEddyConfig({
      defaultModel: 'gpt-alias',
      providers: {
        openai: {
          type: 'openai',
          apiKey: 'sk-openai',
          baseUrl: 'https://openai.example/v1',
        },
      },
      models: {
        'gpt-alias': {
          provider: 'openai',
          model: 'gpt-runtime',
          maxContextSize: 200000,
          capabilities: ['tool_use'],
        },
      },
    });
    expect(updatedConfig.defaultModel).toBe('gpt-alias');

    await expect(
      rpc.setModel({
        sessionId: created.id,
        agentId: 'main',
        model: 'gpt-alias',
      }),
    ).resolves.toEqual({
      model: 'gpt-alias',
      providerName: 'openai',
    });

    const config = await rpc.getConfig({ sessionId: created.id, agentId: 'main' });
    expect(config.modelAlias).toBe('gpt-alias');
    expect(config.provider).toMatchObject({
      type: 'openai',
      model: 'gpt-runtime',
      apiKey: 'sk-openai',
      baseUrl: 'https://openai.example/v1',
    });
    expect(config.modelCapabilities).toMatchObject({
      tool_use: true,
      max_context_tokens: 200000,
    });
  });

  it('can create an unconfigured session when no model is selected', async () => {
    await writeFile(configPath, '');
    const rpc = await createTestRpc();

    const created = await rpc.createSession({ workDir });

    expect(created.id.startsWith('session_')).toBe(true);
    expect(await rpc.getModel({ sessionId: created.id, agentId: 'main' })).toBe('');
  });

  it('loads configured permission rules into created and resumed sessions', async () => {
    await writeFile(
      configPath,
      `${CONFIG}

[[permission.deny]]
tool = "Bash"
match = "rm *"
reason = "no rm"
`,
    );
    const rpc = await createTestRpc();
    const created = await rpc.createSession({ workDir });

    await expect(rpc.getPermission({ sessionId: created.id, agentId: 'main' })).resolves.toEqual({
      mode: 'manual',
      rules: [
        {
          decision: 'deny',
          scope: 'user',
          pattern: 'Bash(rm *)',
          reason: 'no rm',
        },
      ],
    });

    const freshRpc = await createTestRpc();
    await freshRpc.resumeSession({ sessionId: created.id });
    await expect(
      freshRpc.getPermission({ sessionId: created.id, agentId: 'main' }),
    ).resolves.toEqual({
      mode: 'manual',
      rules: [
        {
          decision: 'deny',
          scope: 'user',
          pattern: 'Bash(rm *)',
          reason: 'no rm',
        },
      ],
    });
  });

  it('uses configured default permission mode for fresh sessions', async () => {
    await writeFile(
      configPath,
      CONFIG.replace(
        'default_model = "eddy-code/eddy-for-coding"',
        'default_model = "eddy-code/eddy-for-coding"\ndefault_permission_mode = "auto"',
      ),
    );
    const rpc = await createTestRpc();
    const created = await rpc.createSession({ workDir });

    await expect(rpc.getPermission({ sessionId: created.id, agentId: 'main' })).resolves.toEqual({
      mode: 'auto',
      rules: [],
    });

    const explicit = await rpc.createSession({ workDir, permission: 'manual' });
    await expect(rpc.getPermission({ sessionId: explicit.id, agentId: 'main' })).resolves.toEqual({
      mode: 'manual',
      rules: [],
    });
  });

  it('does not expose raw provider switching through the core RPC surface', async () => {
    const rpc = (await createTestRpc()) as unknown as Record<string, unknown>;

    expect(rpc['setProvider']).toBeUndefined();
  });

  it('exposes the core package version as read-only metadata', async () => {
    const rpc = await createTestRpc();
    const pkg = JSON.parse(
      await readFile(new URL('../../package.json', import.meta.url), 'utf-8'),
    ) as { version: string };

    await expect(rpc.getCoreInfo({})).resolves.toEqual({
      version: pkg.version,
    });
    expect((rpc as unknown as Record<string, unknown>)['setVersion']).toBeUndefined();
  });

  it('keeps the resumed model alias visible when it no longer resolves', async () => {
    const rpc = await createTestRpc();
    const created = await rpc.createSession({ workDir, model: 'eddy-code/eddy-for-coding' });
    await rpc.closeSession({ sessionId: created.id });

    // The config now has no models and no default model 鈥?the alias replayed
    // from the session is invalid and there is no fallback to resolve.
    await writeFile(configPath, '');

    const freshRpc = await createTestRpc();
    await freshRpc.resumeSession({ sessionId: created.id });

    // The stale alias stays visible so the UI can surface which model the
    // user had selected. The next prompt will raise MODEL_NOT_CONFIGURED.
    expect(await freshRpc.getModel({ sessionId: created.id, agentId: 'main' })).toBe(
      'eddy-code/eddy-for-coding',
    );
  });

  it('surfaces a config error when a resumed model is configured but unresolvable', async () => {
    const rpc = await createTestRpc();
    const created = await rpc.createSession({ workDir, model: 'eddy-code/eddy-for-coding' });
    await rpc.closeSession({ sessionId: created.id });

    // The model alias is still in config, but it now references a provider
    // that does not exist. That is an actionable config error 鈥?resume must
    // surface it, not silently fall back to another model or clear it.
    await writeFile(
      configPath,
      `
default_model = "eddy-code/eddy-for-coding"

[providers."managed:eddy-code"]
type = "eddy"
api_key = "test-key"
base_url = "https://api.example/v1"

[models."eddy-code/eddy-for-coding"]
provider = "ghost-provider"
model = "eddy-for-coding"
max_context_size = 1000000
`,
    );

    const freshRpc = await createTestRpc();
    await expect(freshRpc.resumeSession({ sessionId: created.id })).rejects.toThrow();
  });



  async function findWireFile(root: string): Promise<string> {
    const suffix = join('agents', 'main', 'wire.jsonl');
    const entries = await readdir(root, { recursive: true });
    const match = entries.find((entry) => entry.endsWith(suffix));
    if (match === undefined) {
      throw new Error('wire.jsonl not found under session home');
    }
    return join(root, match);
  }

  async function createTestRpc() {
    const [coreRpc, sdkRpc] = createRPC<CoreAPI, SDKAPI>();
    const core = new EddyCore(coreRpc, {
      homeDir,
      configPath,
    });
    cores.push(core);
    return sdkRpc({
      emitEvent: vi.fn(),
      requestApproval: vi.fn(async () => ({ decision: 'rejected' as const })),
      requestQuestion: vi.fn(async () => null),
      toolCall: vi.fn(async () => ({ output: '' })),
    });
  }
});
