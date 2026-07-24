import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  type Listener = (...args: unknown[]) => void;

  function createEmitter() {
    const listeners = new Map<string, Set<Listener>>();
    const emitter = {
      on: vi.fn((event: string, listener: Listener) => {
        const eventListeners = listeners.get(event) ?? new Set<Listener>();
        eventListeners.add(listener);
        listeners.set(event, eventListeners);
        return emitter;
      }),
      off: vi.fn((event: string, listener: Listener) => {
        listeners.get(event)?.delete(listener);
        return emitter;
      }),
      emit(event: string, ...args: unknown[]) {
        for (const listener of listeners.get(event) ?? []) listener(...args);
      },
      reset() {
        listeners.clear();
      },
    };
    return emitter;
  }

  const stdin = Object.assign(createEmitter(), {
    setRawMode: vi.fn(),
  });
  const processEvents = createEmitter();
  const stdout = {
    columns: 80,
    rows: 24,
    isTTY: true,
    write: vi.fn(),
  };

  return {
    stdin,
    stdout,
    processEvents,
    process: {
      stdin,
      stdout,
      env: { FORCE_COLOR: '1' },
      platform: 'win32',
      on: processEvents.on,
      off: processEvents.off,
      exit: vi.fn(),
    },
  };
});

vi.mock('node:process', () => ({ default: mocks.process }));

import { runLoadingAnimation } from '#/tui/components/chrome/loading';
import {
  CLEAR_SCREEN,
  CLEAR_SCREEN_AND_SCROLLBACK,
} from '#/tui/constant/terminal';

describe('runLoadingAnimation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.stdin.reset();
    mocks.processEvents.reset();
    mocks.stdin.setRawMode.mockClear();
    mocks.stdout.write.mockClear();
    mocks.process.exit.mockClear();
    mocks.stdout.columns = 80;
    mocks.stdout.rows = 24;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('erases every row when repainting after a terminal resize', async () => {
    const loading = runLoadingAnimation();

    expect(mocks.stdout.write).not.toHaveBeenCalledWith('\x1b[?1049h');
    expect(mocks.stdout.write).toHaveBeenCalledWith(CLEAR_SCREEN);

    mocks.stdout.rows = 36;
    await vi.advanceTimersByTimeAsync(150);

    const frame = String(mocks.stdout.write.mock.calls.at(-1)?.[0]);
    const renderedRows = frame.split('\n');
    expect(renderedRows).toHaveLength(36);
    expect(renderedRows.every((line) => line.startsWith('\x1b[2K\r'))).toBe(true);

    await vi.advanceTimersByTimeAsync(1_350);
    mocks.stdin.emit('data', Buffer.from('\r'));
    await loading;

    expect(mocks.stdout.write).toHaveBeenCalledWith(CLEAR_SCREEN_AND_SCROLLBACK);
    expect(mocks.stdout.write).not.toHaveBeenCalledWith('\x1b[?1049l');
  });

  it('does not use alternate screen when interrupted during Windows loading', async () => {
    runLoadingAnimation();

    mocks.stdin.emit('data', Buffer.from('\x03'));

    expect(mocks.stdout.write).not.toHaveBeenCalledWith('\x1b[?1049h');
    expect(mocks.stdout.write).not.toHaveBeenCalledWith('\x1b[?1049l');
    expect(mocks.process.exit).toHaveBeenCalledWith(0);
  });
});
