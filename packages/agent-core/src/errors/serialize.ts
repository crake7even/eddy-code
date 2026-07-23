import {
  APIConnectionError,
  APIStatusError,
  APITimeoutError,
  ChatProviderError,
} from '@eddy-code/ltod';

import { EddyError } from './classes';
import { ErrorCodes, EDDY_ERROR_INFO, type EddyErrorCode } from './codes';

/**
 * Wire-safe payload of a Eddy error.
 *
 * The structure passed across process / language boundaries (RPC, events,
 * SDK wrappers). Class identity does not survive the boundary; downstream
 * code must branch on `code` rather than `instanceof`.
 *
 * `details` is JSON-serialized. `cause` is intentionally absent -- it is
 * local-only diagnostic state and must not cross the boundary.
 */
export interface EddyErrorPayload {
  readonly code: EddyErrorCode;
  readonly message: string;
  readonly name?: string;
  readonly details?: Record<string, unknown>;
  readonly retryable: boolean;
}

/** Type guard for EddyError. */
export function isEddyError(error: unknown): error is EddyError {
  return error instanceof EddyError;
}

/**
 * Build a EddyErrorPayload directly from a code + message (no Error instance
 * needed). Use this for synthetic error events that are signaled, not thrown
 * -- e.g. "turn busy" or "compaction failed". `retryable` is filled from
 * EDDY_ERROR_INFO so callers cannot drift out of sync with the registry.
 */
export function makeErrorPayload(
  code: EddyErrorCode,
  message: string,
  options?: { readonly details?: Record<string, unknown>; readonly name?: string },
): EddyErrorPayload {
  return {
    code,
    message,
    name: options?.name,
    details: options?.details,
    retryable: EDDY_ERROR_INFO[code].retryable,
  };
}

/**
 * Normalize any value into a EddyErrorPayload.
 *
 * Recognized errors:
 * - `EddyError`: passthrough.
 * - `APIStatusError`: 429 -> rate_limit, 401 -> auth_error, otherwise -> api_error.
 * - `APIConnectionError` / `APITimeoutError`: connection_error.
 * - `ChatProviderError`: api_error.
 *
 * Anything else collapses to `internal`. We never echo `cause` or stack on
 * the wire.
 */
export function toEddyErrorPayload(error: unknown): EddyErrorPayload {
  if (isEddyError(error)) {
    return {
      code: error.code,
      message: error.message,
      name: error.name,
      details: error.details,
      retryable: EDDY_ERROR_INFO[error.code].retryable,
    };
  }

  if (error instanceof APIStatusError) {
    const code: EddyErrorCode =
      error.statusCode === 429
        ? ErrorCodes.PROVIDER_RATE_LIMIT
        : error.statusCode === 401
          ? ErrorCodes.PROVIDER_AUTH_ERROR
          : ErrorCodes.PROVIDER_API_ERROR;
    return {
      code,
      message: error.message,
      name: error.name,
      details: {
        statusCode: error.statusCode,
        requestId: error.requestId,
      },
      retryable: EDDY_ERROR_INFO[code].retryable,
    };
  }

  if (error instanceof APIConnectionError || error instanceof APITimeoutError) {
    return {
      code: ErrorCodes.PROVIDER_CONNECTION_ERROR,
      message: error.message,
      name: error.name,
      retryable: EDDY_ERROR_INFO[ErrorCodes.PROVIDER_CONNECTION_ERROR].retryable,
    };
  }

  if (error instanceof ChatProviderError) {
    return {
      code: ErrorCodes.PROVIDER_API_ERROR,
      message: error.message,
      name: error.name,
      retryable: EDDY_ERROR_INFO[ErrorCodes.PROVIDER_API_ERROR].retryable,
    };
  }

  if (error instanceof Error) {
    return {
      code: ErrorCodes.INTERNAL,
      message: error.message,
      name: error.name,
      retryable: EDDY_ERROR_INFO[ErrorCodes.INTERNAL].retryable,
    };
  }

  return {
    code: ErrorCodes.INTERNAL,
    message: String(error),
    retryable: EDDY_ERROR_INFO[ErrorCodes.INTERNAL].retryable,
  };
}

/**
 * Rehydrate a EddyErrorPayload into a EddyError. Used by SDK boundary code
 * receiving errors over RPC to re-surface them with a real class so
 * in-process consumers can still use `instanceof`.
 */
export function fromEddyErrorPayload(payload: EddyErrorPayload): EddyError {
  return new EddyError(payload.code, payload.message, {
    details: payload.details,
  });
}
