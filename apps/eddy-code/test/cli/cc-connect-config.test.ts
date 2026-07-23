import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ensureCcConnectConfig } from '#/cli/cc-connect-config';

const platform = { type: 'weixin', name: 'Weixin' };

function tempConfig(prefix: string): { dir: string; configPath: string } {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return { dir, configPath: join(dir, 'config.toml') };
}

describe('cc-connect config generation', () => {
  it('creates a cmd-based config and wrapper instead of deprecated cli_path', () => {
    const { dir, configPath } = tempConfig('eddy cc connect ');
    const result = ensureCcConnectConfig({
      configPath,
      platform,
      workDir: join(dir, 'project with spaces'),
    });

    const content = readFileSync(configPath, 'utf-8');
    expect(content).toContain('[projects.agent.options]');
    expect(content).toContain('cmd = ');
    expect(content).not.toContain('cli_path');
    expect(content).toContain('work_dir = ');
    expect(result.needsAuth).toBe(true);
    expect(result.wrapperPath).toBeDefined();
    expect(existsSync(result.wrapperPath!)).toBe(true);
    expect(readFileSync(result.wrapperPath!, 'utf-8')).toContain('stream-json');
    if (process.platform === 'win32') {
      expect(result.wrapperPath).not.toMatch(/\s/);
    }
  });

  it('migrates old cli_path while preserving existing Weixin token settings', () => {
    const { dir, configPath } = tempConfig('eddy cc migrate ');
    writeFileSync(
      configPath,
      [
        'attachment_send = "on"',
        '',
        '[[projects]]',
        'name = "default"',
        '',
        '[projects.agent]',
        'type = "claudecode"',
        '',
        '[projects.agent.options]',
        "cli_path = 'E:\\.Eddy Code\\bin\\eddy.cmd stream-json'",
        "work_dir = 'E:\\.Eddy Code\\eddy-code'",
        'mode = "default"',
        '',
        '[[projects.platforms]]',
        'type = "weixin"',
        '',
        '[projects.platforms.options]',
        'token = "secret-token"',
        'base_url = "https://ilinkai.weixin.qq.com"',
        'account_id = "bot-id"',
        '',
      ].join('\n'),
      'utf-8',
    );

    const result = ensureCcConnectConfig({
      configPath,
      platform,
      workDir: join(dir, 'project'),
    });

    const content = readFileSync(configPath, 'utf-8');
    expect(content).not.toContain('cli_path');
    expect(content).toContain('cmd = ');
    expect(content).toContain('token = "secret-token"');
    expect(content).toContain('base_url = "https://ilinkai.weixin.qq.com"');
    expect(content).toContain('account_id = "bot-id"');
    expect(result.platformConfigured).toBe(true);
    expect(result.platformHadToken).toBe(true);
    expect(result.needsAuth).toBe(false);
    expect(result.changes).toContain('migrated-cli-path');
  });

  it('repairs a stale agent type when migrating an existing config', () => {
    const { dir, configPath } = tempConfig('eddy cc agent type ');
    writeFileSync(
      configPath,
      [
        '[[projects]]',
        'name = "default"',
        '',
        '[projects.agent]',
        'type = "codex"',
        '',
        '[[projects.platforms]]',
        'type = "weixin"',
        '',
      ].join('\n'),
      'utf-8',
    );

    const result = ensureCcConnectConfig({
      configPath,
      platform,
      workDir: join(dir, 'project'),
    });

    const content = readFileSync(configPath, 'utf-8');
    expect(content).toContain('[projects.agent]');
    expect(content).toContain('type = "claudecode"');
    expect(result.changes).toContain('updated-agent-type');
  });
});
