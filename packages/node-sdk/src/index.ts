export { EddyHarness } from '#/eddy-harness';
export { Session } from '#/session';
export { EddyAuthFacade } from '#/auth';

export {
  applyCatalogProvider,
  catalogBaseUrl,
  catalogCachePath,
  catalogModelToAlias,
  catalogProviderModels,
  CatalogFetchError,
  DEFAULT_CATALOG_URL,
  fetchCatalog,
  inferWireType,
  loadBuiltInCatalog,
  loadCatalogCache,
  saveCatalogCache,
} from '#/catalog';
export type {
  ApplyCatalogProviderOptions,
  Catalog,
  CatalogModel,
  CatalogProviderEntry,
} from '#/catalog';

export {
  ErrorCodes,
  EddyError,
  type EddyErrorCode,
  type EddyErrorInfo,
  type EddyErrorOptions,
  type EddyErrorPayload,
  EDDY_ERROR_INFO,
  fromEddyErrorPayload,
  isEddyError,
  toEddyErrorPayload,
} from '@eddy-code/agent-core';

// Diagnostic logging — public surface only.
// RootLogger / getRootLogger / LoggingConfig stay inside agent-core.
export {
  flushDiagnosticLogs,
  log,
  redact,
  resolveGlobalLogPath,
  resolveEddyHome,
} from '@eddy-code/agent-core';
export type { LogContext, LogLevel, LogPayload, Logger } from '@eddy-code/agent-core';

// Experimental feature flags — types only. Resolved values come from
// `EddyHarness.getExperimentalFlags()` over RPC, not from a re-exported runtime value.
export type {
  ExperimentalFlagMap,
  FlagDefinition,
  FlagDefinitionInput,
  FlagId,
  FlagSurface,
} from '@eddy-code/agent-core';
export type { GoalSnapshotData } from '@eddy-code/agent-core';

export * from '#/events';
export type * from '#/types';
