import { describe, expect, it } from 'vitest';

import { ProviderManager } from '../../src/session/provider-manager';
import { testAgent } from './harness';

describe('ConfigState model capabilities', () => {
  it('computes provider and model capabilities from ProviderManager metadata', () => {
    const ctx = testAgent({
      providerManager: new ProviderManager({
        config: {
          providers: {
            eddy: {
              type: 'eddy',
              apiKey: 'test-key',
            },
          },
          models: {
            'eddy-code/eddy-for-coding': {
              provider: 'eddy',
              model: 'eddy-for-coding',
              maxContextSize: 1_000_000,
              capabilities: ['image_in', 'video_in', 'thinking', 'tool_use'],
            },
          },
        },
      }),
    });
    const config = ctx.agent.config;

    config.update({ modelAlias: 'eddy-code/eddy-for-coding' });

    expect(config.model).toBe('eddy-code/eddy-for-coding');
    expect(config.providerConfig.model).toBe('eddy-for-coding');
    expect(config.modelCapabilities).toMatchObject({
      image_in: true,
      video_in: true,
      audio_in: false,
      thinking: true,
      tool_use: true,
      max_context_tokens: 1_000_000,
    });
  });

  it('does not infer Eddy capabilities from the provider catalogue', () => {
    const ctx = testAgent({
      providerManager: new ProviderManager({
        config: {
          providers: {
            eddy: {
              type: 'eddy',
              apiKey: 'test-key',
            },
          },
          models: {
            'eddy-code': {
              provider: 'eddy',
              model: 'eddy-code',
              maxContextSize: 128_000,
            },
          },
        },
      }),
    });
    const config = ctx.agent.config;

    config.update({ modelAlias: 'eddy-code' });

    expect(config.modelCapabilities).toMatchObject({
      image_in: false,
      video_in: false,
      audio_in: false,
      max_context_tokens: 128_000,
    });
  });

it('uses session id as a provider prompt cache hint without storing it on Agent', () => {
    const ctx = testAgent({
      providerManager: new ProviderManager({
        promptCacheKey: 'session-test',
        config: {
          providers: {
            eddy: {
              type: 'eddy',
              apiKey: 'test-key',
            },
          },
          models: {
            'eddy-code': {
              provider: 'eddy',
              model: 'eddy-code',
              maxContextSize: 128_000,
            },
          },
        },
      }),
    });
    const config = ctx.agent.config;

    config.update({ modelAlias: 'eddy-code' });

    expect(config.providerConfig).toMatchObject({
      type: 'eddy',
      generationKwargs: {
        prompt_cache_key: 'session-test',
      },
    });
    expect('sessionId' in ctx.agent).toBe(false);
  });
});
