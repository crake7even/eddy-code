import { ErrorCodes } from '@eddy-code/sdk';

export const PRODUCT_NAME = 'Eddy Code';
export const CLI_COMMAND_NAME = 'eddy';
// Product constants used in HTTP User-Agent headers.
export const CLI_USER_AGENT_PRODUCT = 'eddy-code-cli';
export const CLI_UI_MODE = 'shell';
// Give graceful shutdown a short window without making CLI exit feel stuck.
export const CLI_SHUTDOWN_TIMEOUT_MS = 3000;

// App-owned data paths. SDK/core runtime config is intentionally not routed here.

export const EDDY_CODE_HOME_ENV = 'EDDY_CODE_HOME';
export const EDDY_CODE_DATA_DIR_NAME = '.eddy-code';
export const EDDY_CODE_LOG_DIR_NAME = 'logs';
export const EDDY_CODE_UPDATE_DIR_NAME = 'updates';
export const EDDY_CODE_UPDATE_STATE_FILE_NAME = 'latest.json';
export const EDDY_CODE_INPUT_HISTORY_DIR_NAME = 'user-history';

// Managed Eddy auth provider key shared with OAuth/SDK config.
export const DEFAULT_OAUTH_PROVIDER_NAME = 'managed:eddy-code';

// SDK/core error code that tells the TUI to show a login-required startup
// notice. Derived from sdk's ErrorCodes so a future rename in core
// auto-propagates instead of silently breaking the startup recovery path.
export const OAUTH_LOGIN_REQUIRED_CODE = ErrorCodes.AUTH_LOGIN_REQUIRED;

export const FEEDBACK_ISSUE_URL = 'https://github.com/crake7even/eddy-code/issues';

// Sent in the feedback `version` field so the backend can distinguish this
// TypeScript client from clients that send a bare version.
export const FEEDBACK_VERSION_PREFIX = 'eddy-code-';


// GitHub — sole source of truth for the project.
export const EDDY_CODE_GITHUB_REPO = 'https://github.com/crake7even/eddy-code';
export const EDDY_CODE_CDN_LATEST_URL =
  'https://api.github.com/repos/crake7even/eddy-code/releases/latest';
export const EDDY_CODE_PLUGIN_MARKETPLACE_URL =
  'https://raw.githubusercontent.com/crake7even/eddy-code/main/plugins/marketplace.json';
export const EDDY_CODE_PLUGIN_MARKETPLACE_URL_ENV = 'EDDY_CODE_PLUGIN_MARKETPLACE_URL';
