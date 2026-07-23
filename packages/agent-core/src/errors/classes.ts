import type { EddyErrorCode } from './codes';

export interface EddyErrorOptions {
  /** JSON-serializable structured details. */
  readonly details?: Record<string, unknown>;
  /** Original error or value. Local-only; never serialized to the wire. */
  readonly cause?: unknown;
}

/**
 * The single Eddy error class.
 *
 * Discrimination is always by `code`. Cross-process consumers receive
 * `EddyErrorPayload` and must branch on `code` rather than class identity.
 */
export class EddyError extends Error {
  readonly code: EddyErrorCode;
  readonly details?: Record<string, unknown>;
  override readonly cause?: unknown;

  constructor(code: EddyErrorCode, message: string, options: EddyErrorOptions = {}) {
    super(message);
    this.name = 'EddyError';
    this.code = code;
    this.details = options.details;
    this.cause = options.cause;
  }
}
