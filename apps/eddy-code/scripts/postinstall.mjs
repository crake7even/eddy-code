#!/usr/bin/env node
/**
 * Postinstall hook for eddy-code.
 *
 * Only global installs create the optional Windows desktop shortcut.
 * Local project installs and workspace bootstraps are silent no-ops.
 */

import { createDesktopShortcut } from './postinstall/shortcut.mjs';

function isGlobalInstall() {
  return (
    process.env['npm_config_global'] === 'true' ||
    process.env['pnpm_config_global'] === 'true' ||
    process.env['npm_config_location'] === 'global'
  );
}

async function main() {
  if (!isGlobalInstall()) return;

  try {
    createDesktopShortcut();
  } catch {
    // Never fail the install over a shortcut.
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.warn(`[eddy-code] postinstall warning: ${message}`);
});
