import { test, expect } from 'vitest';
import { toInputJsonSchema } from '../../src/tools/support/input-schema';

test('input-schema import', () => {
  expect(typeof toInputJsonSchema).toBe('function');
});
