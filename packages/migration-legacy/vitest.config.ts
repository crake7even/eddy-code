import { defineConfig } from 'vitest/config';

import { rawTextPlugin } from '../../build/raw-text-plugin.mjs';

export default defineConfig({
  // `resume.integration.test.ts` imports real eddy-core (`Session`), which
  // transitively imports `.md` / `.yaml` prompt sources as raw strings.
  // Reuse the same plugin eddy-core uses so those imports resolve identically.
  plugins: [rawTextPlugin()],
  test: {
    name: 'migration-legacy',
    include: ['test/**/*.test.ts'],
  },
});
