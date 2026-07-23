import { describe, expect, it } from 'vitest';

import { pathToUri } from '../../src/lsp/client';

describe('pathToUri', () => {
  it('returns an existing file URI unchanged', () => {
    expect(pathToUri('file:///tmp/a.ts')).toBe('file:///tmp/a.ts');
  });

  it('converts POSIX absolute paths', () => {
    expect(pathToUri('/tmp/a.ts')).toBe('file:///tmp/a.ts');
    expect(pathToUri('/home/user/project/src/index.ts')).toBe(
      'file:///home/user/project/src/index.ts',
    );
  });

  it('converts Windows backslash paths', () => {
    expect(pathToUri('C:\\project\\a.ts')).toBe('file:///C:/project/a.ts');
    expect(pathToUri('c:\\project\\a.ts')).toBe('file:///C:/project/a.ts');
    expect(pathToUri('C:\\')).toBe('file:///C:/');
  });

  it('converts Windows forward-slash paths', () => {
    expect(pathToUri('D:/project/a.ts')).toBe('file:///D:/project/a.ts');
  });

  it('prepends a leading slash to relative paths', () => {
    expect(pathToUri('relative/path.ts')).toBe('file:///relative/path.ts');
  });
});
