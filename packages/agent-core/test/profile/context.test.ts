import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'pathe';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadAgentsMd, loadUserInstructions } from '../../src/profile/context';
import { testJian } from '../fixtures/test-jian';

let homeDir: string;
let workDir: string;

beforeEach(async () => {
  homeDir = await mkdtemp(join(tmpdir(), 'eddy-agents-home-'));
  workDir = await mkdtemp(join(tmpdir(), 'eddy-agents-work-'));
  vi.spyOn(testJian, 'gethome').mockReturnValue(homeDir);
  vi.spyOn(testJian, 'getcwd').mockReturnValue(workDir);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(homeDir, { recursive: true, force: true });
  await rm(workDir, { recursive: true, force: true });
});

describe('loadAgentsMd user-level discovery', () => {
  it('separates user-level rules from project-level instructions', async () => {
    await mkdir(join(homeDir, '.eddy-code'), { recursive: true });
    await writeFile(join(homeDir, '.eddy-code', 'AGENTS.md'), 'user branded', 'utf-8');
    await mkdir(join(homeDir, '.agents'), { recursive: true });
    await writeFile(join(homeDir, '.agents', 'AGENTS.md'), 'user generic', 'utf-8');
    await writeFile(join(workDir, 'AGENTS.md'), 'project instructions', 'utf-8');

    const result = await loadAgentsMd(testJian);

    expect(result).not.toContain('user branded');
    expect(result).not.toContain('user generic');
    expect(result).toContain('project instructions');
    const user = await loadUserInstructions(testJian);
    expect(user).toContain('user branded');
    expect(user).toContain('user generic');
    expect(user).not.toContain('project instructions');
  });

  it('loads generic user-level .agents/AGENTS.md', async () => {
    await mkdir(join(homeDir, '.agents'), { recursive: true });
    await writeFile(join(homeDir, '.agents', 'AGENTS.md'), 'dot-agents generic', 'utf-8');

    const result = await loadUserInstructions(testJian);

    expect(result).toContain('dot-agents generic');
  });

  it('falls back to project-level only when no user-level files exist', async () => {
    await writeFile(join(workDir, 'AGENTS.md'), 'project only', 'utf-8');

    const result = await loadAgentsMd(testJian);

    expect(result).toContain('project only');
    expect(result).not.toContain(homeDir);
  });

  it('does not load the same file twice when the work dir is the home dir', async () => {
    vi.spyOn(testJian, 'getcwd').mockReturnValue(homeDir);
    await mkdir(join(homeDir, '.eddy-code'), { recursive: true });
    await writeFile(join(homeDir, '.eddy-code', 'AGENTS.md'), 'home branded', 'utf-8');

    const result = await loadAgentsMd(testJian);

    expect(result).not.toContain('home branded');
    expect((await loadUserInstructions(testJian)).split('home branded').length - 1).toBe(1);
  });
});


describe('global instruction budget and discovery', () => {
  it('loads lowercase generic rules as fallback and leaves project rules separate', async () => {
    await mkdir(join(homeDir, '.agents'), { recursive: true });
    await writeFile(join(homeDir, '.agents', 'agents.md'), 'lowercase user rules');
    await mkdir(join(workDir, '.eddy-code'), { recursive: true });
    await writeFile(join(workDir, '.eddy-code', 'AGENTS.md'), 'project-local rules');
    expect(await loadUserInstructions(testJian)).toContain('lowercase user rules');
    expect(await loadAgentsMd(testJian)).toContain('project-local rules');
    expect(await loadAgentsMd(testJian)).not.toContain('lowercase user rules');
  });

  it('bounds global rules to 32KB without truncating project instructions', async () => {
    await mkdir(join(homeDir, '.eddy-code'), { recursive: true });
    await writeFile(join(homeDir, '.eddy-code', 'AGENTS.md'), '中文'.repeat(20_000));
    await writeFile(join(workDir, 'AGENTS.md'), 'project instructions');
    const user = await loadUserInstructions(testJian);
    expect(Buffer.byteLength(user, 'utf8')).toBeLessThanOrEqual(32 * 1024);
    expect(user).not.toContain('�');
    expect(await loadAgentsMd(testJian)).toContain('project instructions');
  });
});
