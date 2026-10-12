import { describe, expect, it } from 'vitest';

import { DEFAULT_AGENT_PROFILES, loadAgentProfilesFromSources } from '../../src/profile';

const promptContext = {
  osEnv: {
    osKind: 'macOS',
    osArch: 'arm64',
    osVersion: '0',
    shellName: 'bash',
    shellPath: '/bin/bash',
  },
  cwd: '/workspace',
  now: '2026-05-09T00:00:00.000Z',
} as const;

describe('default agent profiles', () => {
  it('loads the bundled default system prompt from embedded sources', () => {
    const prompt = DEFAULT_AGENT_PROFILES['agent']?.systemPrompt(promptContext);

    expect(prompt).toContain('You are Eddy Code');
    expect(prompt).toContain('Available skills');
    expect(prompt).toContain('/workspace');
  });

  it('fails loudly when an embedded system prompt source is missing', () => {
    expect(() =>
      loadAgentProfilesFromSources(['profile/default/agent.yaml'], {
        'profile/default/agent.yaml': 'name: agent\nsystemPromptPath: ./missing.md\n',
      }),
    ).toThrow(/Embedded agent profile source missing: profile\/default\/missing\.md/);
  });
});


describe('shared prompt priorities', () => {
  it.each(['agent', 'coder', 'explore', 'plan', 'verify', 'reviewer', 'oracle', 'writer'])
  ('keeps user instructions just before CONTRACT for %s', (name) => {
    const prompt = DEFAULT_AGENT_PROFILES[name]?.systemPrompt({ ...promptContext, userInstructions: 'Keep answers concise.' });
    expect(prompt).toBeDefined();
    expect(prompt).toContain('Keep answers concise.');
    expect(prompt!.indexOf('# User Instructions')).toBeLessThan(prompt!.indexOf('# CONTRACT'));
    expect(prompt).toContain('If you are a subagent, do not stop to ask the user directly');
    expect(prompt).toContain('Restrictions for plan mode (including read-only actions)');
    expect(prompt).toContain('Verification is **optional by default**');
    expect(prompt).toContain('Code review is **optional by default**');
    expect(prompt).toContain('If the message is only a file path');
    expect(prompt).not.toContain('Fusion Plan');
    expect(prompt).not.toContain('Scream Code');
  });
});
