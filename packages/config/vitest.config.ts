import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'eddy-oauth',
    include: ['test/**/*.test.ts'],
  },
});
