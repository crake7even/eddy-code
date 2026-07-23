import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ensureCcConnectConfig } from '#/cli/cc-connect-config';
import {
  buildDirectWindowsStartCommand,
  buildPm2LifecycleCommand,
  buildPm2StartCommand,
  detectCcConnectCommandTarget,
} from '#/cli/cc-connect-daemon';
import {
  describePm2Status,
  formatProxyUrl,
} from '#/cli/cc-connect-preflight';

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

  it('preserves Telegram token settings and adds detected platform proxy', () => {
    const { dir, configPath } = tempConfig('eddy cc telegram ');
    writeFileSync(
      configPath,
      [
        '[[projects]]',
        'name = "default"',
        '',
        '[projects.agent]',
        'type = "claudecode"',
        '',
        '[[projects.platforms]]',
        'type = "telegram"',
        '',
        '[projects.platforms.options]',
        'token = "telegram-secret"',
        'allow_from = "*"',
        '',
      ].join('\n'),
      'utf-8',
    );

    const result = ensureCcConnectConfig({
      configPath,
      platform: { type: 'telegram', name: 'Telegram' },
      workDir: join(dir, 'project'),
      platformProxy: 'http://127.0.0.1:7897',
    });

    const content = readFileSync(configPath, 'utf-8');
    expect(content).toContain('token = "telegram-secret"');
    expect(content).toContain('allow_from = "*"');
    expect(content).toContain("proxy = 'http://127.0.0.1:7897'");
    expect(result.platformHadToken).toBe(true);
    expect(result.needsAuth).toBe(false);
    expect(result.proxy).toBe('http://127.0.0.1:7897');
    expect(result.changes).toContain('added-platform-proxy');
  });

  it('formats proxy and PM2 status diagnostics', () => {
    expect(formatProxyUrl(7897)).toBe('http://127.0.0.1:7897');
    expect(describePm2Status({ available: true, registered: false })).toContain(
      'not registered',
    );
    expect(describePm2Status({ available: true, registered: true, status: 'errored' })).toContain(
      'errored',
    );
  });

  it('builds a Windows PM2 command that avoids executing cc-connect.cmd as JavaScript', () => {
    if (process.platform !== 'win32') return;

    const target = detectCcConnectCommandTarget();
    const command = buildPm2StartCommand();

    expect(command).toContain('pm2 start');
    if (target.interpreterNone) {
      expect(command).toContain('--interpreter none');
    } else {
      expect(command.toLowerCase()).not.toContain('cc-connect.cmd');
    }
  });

  it('builds stable Windows lifecycle and direct fallback commands', () => {
    if (process.platform !== 'win32') return;

    const lifecycle = buildPm2LifecycleCommand('restart');
    expect(lifecycle).toContain('(pm2 describe cc-connect');
    expect(lifecycle).toContain('pm2 save');

    const fallback = buildDirectWindowsStartCommand('C:\\Users\\Yuzhao\\.cc-connect\\config.toml');
    expect(fallback).toContain('Start-Process');
    expect(fallback).toContain('-WindowStyle Hidden');
    expect(fallback).not.toContain('-FilePath "');
    expect(fallback).toContain("'C:\\Users\\Yuzhao\\.cc-connect\\config.toml'");
  });
});
