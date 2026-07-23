import { ErrorCodes, EddyError } from '#/errors';
import {
  EddyConfigPatchSchema,
  formatConfigValidationError,
  type EddyConfig,
  type EddyConfigPatch,
  validateConfig,
} from '#/config/schema';

export function mergeConfigPatch(config: EddyConfig, patch: EddyConfigPatch): EddyConfig {
  const base = validateConfig(config);
  const parsedPatch = parsePatch(patch);
  const merged = deepMerge(base, parsedPatch);
  return validateConfig(merged);
}

function parsePatch(patch: EddyConfigPatch): EddyConfigPatch {
  try {
    return stripUndefinedDeep(EddyConfigPatchSchema.parse(patch)) as EddyConfigPatch;
  } catch (error) {
    throw new EddyError(ErrorCodes.CONFIG_INVALID, `Invalid configuration patch: ${formatConfigValidationError(error)}`, {
      cause: error,
    });
  }
}

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target };
  for (const [key, sourceValue] of Object.entries(source)) {
    if (sourceValue === undefined) continue;
    const targetValue = result[key];
    if (isPlainObject(targetValue) && isPlainObject(sourceValue)) {
      result[key] = deepMerge(targetValue, sourceValue);
    } else {
      result[key] = sourceValue;
    }
  }
  return result;
}

function stripUndefinedDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripUndefinedDeep);
  }
  if (!isPlainObject(value)) {
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [key, entryValue] of Object.entries(value)) {
    if (entryValue !== undefined) {
      out[key] = stripUndefinedDeep(entryValue);
    }
  }
  return out;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
