/**
 * Per-provider `getCapability(model?)` table tests.
 *
 * For every provider:
 *   - Known models return the capabilities the table declares for them.
 *   - Unknown models return UNKNOWN_CAPABILITY (no throw) so the capability
 *     gate stays non-fatal when the operator uses a model the provider has
 *     not catalogued yet.
 *
 * Assertions stick to individual fields (image_in / video_in / 鈥? rather
 * than matching the whole object so future additions (e.g. new fields in
 * `ModelCapability`) do not churn every row.
 */

import { UNKNOWN_CAPABILITY } from '#/capability';
import { AnthropicChatProvider } from '#/providers/anthropic';
import { GoogleGenAIChatProvider } from '#/providers/google-genai';
import { EddyChatProvider } from '#/providers/eddy';
import { OpenAILegacyChatProvider } from '#/providers/openai-legacy';
import { OpenAIResponsesChatProvider } from '#/providers/openai-responses';
import { describe, expect, it } from 'vitest';
describe('EddyChatProvider.getCapability', () => {
  function make(model: string): EddyChatProvider {
    return new EddyChatProvider({ model, apiKey: 'test-key' });
  }

  it('does not infer capabilities from Eddy model names', () => {
    for (const model of [
      'eddy-for-coding',
      'eddy-code',
      'eddy-k2-turbo-preview',
      'eddy-k2.5',
      'eddy-thinking-preview',
    ]) {
      expect(make(model).getCapability()).toEqual(UNKNOWN_CAPABILITY);
    }
  });

  it('explicit model arg overrides this.modelName', () => {
    const provider = make('eddy-k2-turbo-preview');
    expect(provider.getCapability('eddy-for-coding')).toEqual(UNKNOWN_CAPABILITY);
  });

  it('unknown Eddy model 鈫?UNKNOWN_CAPABILITY (no throw)', () => {
    const cap = make('some-fake-model').getCapability();
    expect(cap).toEqual(UNKNOWN_CAPABILITY);
  });
});
describe('GoogleGenAIChatProvider.getCapability', () => {
  function make(model: string): GoogleGenAIChatProvider {
    return new GoogleGenAIChatProvider({ model, apiKey: 'test-key' });
  }

  it('gemini-1.5-pro 鈫?image_in + video_in + audio_in + tool_use', () => {
    const cap = make('gemini-1.5-pro').getCapability();
    expect(cap.image_in).toBe(true);
    expect(cap.video_in).toBe(true);
    expect(cap.audio_in).toBe(true);
    expect(cap.tool_use).toBe(true);
  });

  it('gemini-1.5-flash 鈫?image_in + video_in + audio_in + tool_use', () => {
    const cap = make('gemini-1.5-flash').getCapability();
    expect(cap.image_in).toBe(true);
    expect(cap.video_in).toBe(true);
    expect(cap.audio_in).toBe(true);
    expect(cap.tool_use).toBe(true);
  });

  it('gemini-2.0-flash 鈫?image_in + video_in + audio_in + tool_use', () => {
    const cap = make('gemini-2.0-flash').getCapability();
    expect(cap.image_in).toBe(true);
    expect(cap.video_in).toBe(true);
    expect(cap.audio_in).toBe(true);
    expect(cap.tool_use).toBe(true);
  });

  it('unknown Gemini model 鈫?UNKNOWN_CAPABILITY (no throw)', () => {
    const cap = make('gemini-not-real-xyz').getCapability();
    expect(cap).toEqual(UNKNOWN_CAPABILITY);
  });

  it('non-gemini model name 鈫?UNKNOWN_CAPABILITY', () => {
    const cap = make('claude-3-5-sonnet').getCapability();
    expect(cap).toEqual(UNKNOWN_CAPABILITY);
  });
});
describe('AnthropicChatProvider.getCapability', () => {
  function make(model: string): AnthropicChatProvider {
    return new AnthropicChatProvider({ model, apiKey: 'test-key', stream: false });
  }

  it('claude-3-5-sonnet 鈫?image_in + tool_use, audio_in=false', () => {
    const cap = make('claude-3-5-sonnet').getCapability();
    expect(cap.image_in).toBe(true);
    expect(cap.tool_use).toBe(true);
    expect(cap.audio_in).toBe(false);
  });

  it('claude-3-haiku 鈫?image_in + tool_use, audio_in=false, thinking=false', () => {
    // Claude 3 Haiku supports vision (all Claude 3.x share vision support);
    // Anthropic has no audio models; thinking is a Claude 4 feature.
    const cap = make('claude-3-haiku').getCapability();
    expect(cap.image_in).toBe(true);
    expect(cap.tool_use).toBe(true);
    expect(cap.audio_in).toBe(false);
    expect(cap.thinking).toBe(false);
  });

  it('claude-opus-4 鈫?image_in + thinking + tool_use', () => {
    const cap = make('claude-opus-4').getCapability();
    expect(cap.image_in).toBe(true);
    expect(cap.thinking).toBe(true);
    expect(cap.tool_use).toBe(true);
  });

  it('no Anthropic model supports audio_in', () => {
    // Sanity: Anthropic has no audio-input models today. If one ships later
    // and this fails, update the table 鈥?but make it a conscious decision.
    for (const m of ['claude-3-5-sonnet', 'claude-3-haiku', 'claude-opus-4']) {
      expect(make(m).getCapability().audio_in).toBe(false);
    }
  });

  it('unknown Anthropic model 鈫?UNKNOWN_CAPABILITY', () => {
    const cap = make('claude-not-real').getCapability();
    expect(cap).toEqual(UNKNOWN_CAPABILITY);
  });
});
describe('OpenAILegacyChatProvider.getCapability', () => {
  function make(model: string): OpenAILegacyChatProvider {
    return new OpenAILegacyChatProvider({ model, apiKey: 'test-key' });
  }

  it('gpt-4o 鈫?image_in + tool_use', () => {
    const cap = make('gpt-4o').getCapability();
    expect(cap.image_in).toBe(true);
    expect(cap.tool_use).toBe(true);
  });

  it('gpt-3.5-turbo 鈫?image_in=false, tool_use=true', () => {
    const cap = make('gpt-3.5-turbo').getCapability();
    expect(cap.image_in).toBe(false);
    expect(cap.tool_use).toBe(true);
  });

  it('o1 鈫?thinking=true, tool_use=true', () => {
    const cap = make('o1').getCapability();
    expect(cap.thinking).toBe(true);
    expect(cap.tool_use).toBe(true);
  });

  it('unknown OpenAI-legacy model 鈫?UNKNOWN_CAPABILITY', () => {
    const cap = make('gpt-mystery').getCapability();
    expect(cap).toEqual(UNKNOWN_CAPABILITY);
  });
});
describe('OpenAIResponsesChatProvider.getCapability', () => {
  function make(model: string): OpenAIResponsesChatProvider {
    return new OpenAIResponsesChatProvider({ model, apiKey: 'test-key' });
  }

  it('gpt-4.1 鈫?image_in + tool_use (Responses flagship)', () => {
    const cap = make('gpt-4.1').getCapability();
    expect(cap.image_in).toBe(true);
    expect(cap.tool_use).toBe(true);
  });

  it('o1 鈫?thinking=true, tool_use=true', () => {
    const cap = make('o1').getCapability();
    expect(cap.thinking).toBe(true);
    expect(cap.tool_use).toBe(true);
  });

  it('o3-mini 鈫?thinking=true', () => {
    const cap = make('o3-mini').getCapability();
    expect(cap.thinking).toBe(true);
  });

  it('unknown Responses model 鈫?UNKNOWN_CAPABILITY', () => {
    const cap = make('gpt-mystery').getCapability();
    expect(cap).toEqual(UNKNOWN_CAPABILITY);
  });
});
