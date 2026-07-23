import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { EddyConfig } from '@eddy-code/agent-core';
import { createEddyDefaultHeaders, EDDY_CODE_PLATFORM } from '@eddy-code/config';

import { ProviderManager } from '../../agent-core/src/session/provider-manager';
import { TEST_IDENTITY } from './test-identity';

const tempDirs: string[] = [];

function resolveRuntimeProvider(options: {
  readonly config: EddyConfig;
  readonly model?: string;
  readonly eddyRequestHeaders?: Record<string, string>;
}) {
  const manager = new ProviderManager({
    config: options.config,
    eddyRequestHeaders: options.eddyRequestHeaders,
  });
  const model = options.model ?? options.config.defaultModel;
  if (model === undefined) {
    throw new Error('No model selected');
  }
  return manager.resolveProviderConfig(model);
}

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'eddy-sdk-provider-identity-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

describe('runtime provider identity headers', () => {
  it('adds eddy-code-cli User-Agent and complete X-Msh headers to the default Eddy provider', async () => {
    const homeDir = await makeTempDir();
    const eddyRequestHeaders = createEddyDefaultHeaders({ homeDir, ...TEST_IDENTITY });
    const resolved = resolveRuntimeProvider({
      config: {
        defaultModel: 'eddy-model',
        providers: {
          eddy: {
            type: 'eddy',
            apiKey: 'test-key',
          },
        },
        models: {
          'eddy-model': {
            provider: 'eddy',
            model: 'eddy-model',
            maxContextSize: 1000,
          },
        },
      },
      eddyRequestHeaders,
    });

    expect(resolved.provider).toMatchObject({
      type: 'eddy',
      defaultHeaders: expect.objectContaining({
        'User-Agent': 'eddy-code-cli/0.0.0-test',
        'X-Msh-Platform': EDDY_CODE_PLATFORM,
        'X-Msh-Version': '0.0.0-test',
        'X-Msh-Device-Name': expect.any(String),
        'X-Msh-Device-Model': expect.any(String),
        'X-Msh-Os-Version': expect.any(String),
        'X-Msh-Device-Id': expect.stringMatching(/^[0-9a-f-]+$/),
      }),
    });
  });

  it('lets Eddy provider customHeaders override default identity headers', async () => {
    const homeDir = await makeTempDir();
    const eddyRequestHeaders = createEddyDefaultHeaders({ homeDir, ...TEST_IDENTITY });
    const config: EddyConfig = {
      providers: {
        eddy: {
          type: 'eddy',
          apiKey: 'test-key',
          customHeaders: {
            'User-Agent': 'Custom/1',
            'X-Msh-Version': 'override-version',
          },
        },
      },
      defaultProvider: 'eddy',
      defaultModel: 'eddy-model',
      models: {
        'eddy-model': {
          provider: 'eddy',
          model: 'eddy-model',
          maxContextSize: 1000,
        },
      },
    };

    const resolved = resolveRuntimeProvider({
      config,
      eddyRequestHeaders,
    });

    expect(resolved.provider).toMatchObject({
      type: 'eddy',
      defaultHeaders: expect.objectContaining({
        'User-Agent': 'Custom/1',
        'X-Msh-Version': 'override-version',
        'X-Msh-Platform': EDDY_CODE_PLATFORM,
      }),
    });
  });

  it('does not add Eddy identity headers to non-Eddy providers', async () => {
    const homeDir = await makeTempDir();
    const eddyRequestHeaders = createEddyDefaultHeaders({ homeDir, ...TEST_IDENTITY });
    const config: EddyConfig = {
      providers: {
        openai: {
          type: 'openai',
          baseUrl: 'https://example.test/v1',
          apiKey: 'sk-test',
        },
      },
      defaultProvider: 'openai',
      defaultModel: 'gpt-test',
      models: {
        'gpt-test': {
          provider: 'openai',
          model: 'gpt-test',
          maxContextSize: 1000,
        },
      },
    };

    const resolved = resolveRuntimeProvider({
      config,
      eddyRequestHeaders,
    });

    expect(resolved.provider).toMatchObject({
      type: 'openai',
      model: 'gpt-test',
    });
    expect(resolved.provider).not.toHaveProperty('defaultHeaders');
  });
});
