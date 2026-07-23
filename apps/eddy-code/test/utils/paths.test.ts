import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getDataDir, getInputHistoryFile, getLogDir, getUpdateStateFile } from '#/utils/paths';

const originalEnv = { ...process.env };

beforeEach(() => {
  delete process.env['EDDY_CODE_HOME'];
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('getDataDir', () => {
  it('returns ~/.eddy-code when EDDY_CODE_HOME is not set', () => {
    expect(getDataDir()).toBe(join(homedir(), '.eddy-code'));
  });

  it('returns EDDY_CODE_HOME when set', () => {
    process.env['EDDY_CODE_HOME'] = '/tmp/eddy-test-data';
    expect(getDataDir()).toBe('/tmp/eddy-test-data');
  });

  it('returns EDDY_CODE_HOME even if it is a relative path', () => {
    process.env['EDDY_CODE_HOME'] = 'relative/path';
    expect(getDataDir()).toBe('relative/path');
  });
});

describe('getLogDir', () => {
  it('returns <dataDir>/logs', () => {
    expect(getLogDir()).toBe(join(homedir(), '.eddy-code', 'logs'));
  });

  it('respects EDDY_CODE_HOME', () => {
    process.env['EDDY_CODE_HOME'] = '/z';
    expect(getLogDir()).toBe(join('/z', 'logs'));
  });
});

describe('getUpdateStateFile', () => {
  it('returns <dataDir>/updates/latest.json', () => {
    expect(getUpdateStateFile()).toBe(join(homedir(), '.eddy-code', 'updates', 'latest.json'));
  });

  it('respects EDDY_CODE_HOME', () => {
    process.env['EDDY_CODE_HOME'] = '/updates-home';
    expect(getUpdateStateFile()).toBe(join('/updates-home', 'updates', 'latest.json'));
  });
});

describe('getInputHistoryFile', () => {
  it('returns <dataDir>/user-history/<md5(workDir)>.jsonl', () => {
    const workDir = '/home/user/project';
    const hash = createHash('md5').update(workDir, 'utf-8').digest('hex');
    expect(getInputHistoryFile(workDir)).toBe(
      join(homedir(), '.eddy-code', 'user-history', `${hash}.jsonl`),
    );
  });

  it('respects EDDY_CODE_HOME', () => {
    process.env['EDDY_CODE_HOME'] = '/custom/data';
    const hash = createHash('md5').update('/proj', 'utf-8').digest('hex');
    expect(getInputHistoryFile('/proj')).toBe(
      join('/custom/data', 'user-history', `${hash}.jsonl`),
    );
  });
});
