import { describe, expect, it } from 'vitest';

import { parseGoalCommand } from '#/tui/commands/goal';

describe('parseGoalCommand budget', () => {
  it.each([
    ['budget tokens 5000000', { value: 5_000_000, unit: 'tokens' }],
    ['budget tokens 500k', { value: 500_000, unit: 'tokens' }],
    ['budget tokens 1.5m', { value: 1_500_000, unit: 'tokens' }],
    ['budget turns 100', { value: 100, unit: 'turns' }],
    ['budget time 30m', { value: 30, unit: 'minutes' }],
    ['budget time 2h', { value: 2, unit: 'hours' }],
    ['budget time 90s', { value: 90, unit: 'seconds' }],
  ])('parses %s', (input, expected) => {
    expect(parseGoalCommand(input)).toEqual({ kind: 'budget', ...expected });
  });

  it.each([
    'budget',
    'budget tokens',
    'budget tokens 0',
    'budget tokens lots',
    'budget turns 5k',
    'budget time 30',
    'budget dollars 5',
    'budget tokens 5m extra',
  ])('rejects %s with a usage hint', (input) => {
    expect(parseGoalCommand(input)).toMatchObject({ kind: 'error', severity: 'hint' });
  });

  it('still lets an objective start with "budget" after --', () => {
    expect(parseGoalCommand('-- budget review')).toEqual({
      kind: 'create',
      objective: 'budget review',
      replace: false,
    });
  });
});
