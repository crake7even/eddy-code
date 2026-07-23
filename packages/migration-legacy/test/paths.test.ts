import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import * as paths from '../src/paths.js';

describe('paths', () => {
  it('sourceCredentialsDir joins ~/.eddy-code/credentials', () => {
    expect(paths.sourceCredentialsDir('/x/.eddy-code')).toBe(join('/x/.eddy-code', 'credentials'));
  });

  it('targetConfigFile and targetTuiFile', () => {
    expect(paths.targetConfigFile('/y')).toBe(join('/y', 'config.toml'));
    expect(paths.targetTuiFile('/y')).toBe(join('/y', 'tui.toml'));
  });

  it('targetSessionIndex', () => {
    expect(paths.targetSessionIndex('/y')).toBe(join('/y', 'session_index.jsonl'));
  });

  it('migratedMarker is under source', () => {
    expect(paths.migratedMarker('/x/.eddy-code')).toBe(join('/x/.eddy-code', '.migrated-to-eddy-code'));
  });

  it('skipMarker is under target', () => {
    expect(paths.skipMarker('/y/.eddy-code')).toBe(join('/y/.eddy-code', '.skip-migration-from-eddy-code'));
  });

  it('migrationReportFile is under target', () => {
    expect(paths.migrationReportFile('/y')).toBe(join('/y', 'migration-report.json'));
  });

  it('sourceSessionsDir / sourceUserHistoryDir / sourceEddyJson', () => {
    expect(paths.sourceSessionsDir('/x')).toBe(join('/x', 'sessions'));
    expect(paths.sourceUserHistoryDir('/x')).toBe(join('/x', 'user-history'));
    expect(paths.sourceEddyJson('/x')).toBe(join('/x', 'eddy.json'));
  });
});
