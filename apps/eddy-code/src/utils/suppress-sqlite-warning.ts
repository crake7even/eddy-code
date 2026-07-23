/**
 * Suppress Node's ExperimentalWarning for the built-in `node:sqlite` module.
 *
 * Node emits this warning while `node:sqlite` is loaded as a transitive
 * dependency during ESM module evaluation, before any app code can intercept
 * it via `process.emitWarning` or `process.on('warning')`. We filter the known
 * warning text from stderr to keep startup output clean.
 */

const originalWrite = process.stderr.write.bind(process.stderr);
let expectingTraceSuggestion = false;

function isSQLiteExperimentalWarning(line: string): boolean {
  return /^\(node:\d+\) ExperimentalWarning: SQLite is an experimental feature/.test(line);
}

function isTraceSuggestion(line: string): boolean {
  return line.startsWith('(Use `node --trace-warnings');
}

process.stderr.write = (
  chunk: string | Uint8Array,
  ...args: unknown[]
): boolean => {
  const text = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');

  const lines = text.split('\n');
  let changed = false;
  const kept: string[] = [];

  for (const line of lines) {
    if (isSQLiteExperimentalWarning(line)) {
      expectingTraceSuggestion = true;
      changed = true;
      continue;
    }
    if (expectingTraceSuggestion && isTraceSuggestion(line)) {
      expectingTraceSuggestion = false;
      changed = true;
      continue;
    }
    expectingTraceSuggestion = false;
    kept.push(line);
  }

  if (changed) {
    const filtered = kept.join('\n');
    if (filtered.length === 0) {
      const callback = args.find((a) => typeof a === 'function') as
        | ((err?: Error | null) => void)
        | undefined;
      callback?.();
      return true;
    }
    return originalWrite(filtered, ...(args as never[]));
  }

  return originalWrite(chunk, ...(args as never[]));
};
