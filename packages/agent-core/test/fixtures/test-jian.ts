import { tmpdir } from 'node:os';

import { LocalJian, type Environment } from '@eddy-code/jan';
import { join } from 'pathe';

export const TEST_OS_ENV: Environment = {
  osKind: 'Linux',
  osArch: 'x86_64',
  osVersion: 'test',
  shellName: 'bash',
  shellPath: '/bin/bash',
};

// `LocalJian`'s constructor is `private` at the TS level only — at runtime
// it's just a function. Skip the singleton/async detection path and build a
// fresh instance with a stub `osEnv` so test helpers can hand a real Jian
// directly to `RuntimeConfig`.
type LocalJianCtor = new (osEnv: Environment) => LocalJian;
export const testJian: LocalJian = new (LocalJian as unknown as LocalJianCtor)(TEST_OS_ENV);
// Unit tests must not load the developer's real global instructions.
testJian.gethome = () => join(tmpdir(), 'eddy-test-home');
