import { describe, expect, it, vi } from 'vitest';

import { EddyTUI, type EddyTUIStartupInput, type TUIState } from '#/tui/eddy-tui';
import type { StreamingUIController } from '#/tui/controllers/streaming-ui';

interface ActivityDriver {
  state: TUIState;
  readonly streamingUI: StreamingUIController;
  updateActivityPane(): void;
}

function makeStartupInput(): EddyTUIStartupInput {
  return {
    cliOptions: {
      session: undefined,
      continue: false,
      yolo: false,
      auto: false,
      plan: false,
      model: undefined,
      outputFormat: undefined,
      prompt: undefined,
      skillsDirs: [],
    },
    tuiConfig: {
      theme: 'dark',
      editorCommand: null,
      notifications: { enabled: true, condition: 'unfocused' },
    },
    version: '0.0.0-test',
    workDir: '/tmp/proj-a',
    resolvedTheme: 'dark',
  };
}

function makeDriverWithTerminalProgress(): {
  driver: ActivityDriver;
  state: TUIState;
  setProgress: ReturnType<typeof vi.fn<(active: boolean) => void>>;
} {
  const setProgress = vi.fn<(active: boolean) => void>();
  const driver = new EddyTUI({} as never, makeStartupInput()) as unknown as ActivityDriver;
  vi.spyOn(driver.state.ui, 'requestRender').mockImplementation(() => {});
  driver.state.terminal = { columns: 80, setProgress } as unknown as TUIState['terminal'];
  return { driver, state: driver.state, setProgress };
}

describe('updateActivityPane terminal progress', () => {
  it('toggles terminal progress when the activity pane enters and leaves work mode', () => {
    vi.useFakeTimers();
    try {
      const { driver, state, setProgress } = makeDriverWithTerminalProgress();

      state.livePane = { ...state.livePane, mode: 'waiting' };
      driver.updateActivityPane();

      expect(setProgress).toHaveBeenCalledTimes(1);
      expect(setProgress).toHaveBeenLastCalledWith(true);
      expect(state.terminalState.progressActive).toBe(true);

      state.livePane = { ...state.livePane, mode: 'idle' };
      driver.updateActivityPane();

      expect(setProgress).toHaveBeenCalledTimes(2);
      expect(setProgress).toHaveBeenLastCalledWith(false);
      expect(state.terminalState.progressActive).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps compaction visible as terminal progress even though the pane is hidden', () => {
    const { driver, state, setProgress } = makeDriverWithTerminalProgress();
    state.appState.isCompacting = true;
    state.appState.streamingPhase = 'waiting';

    driver.updateActivityPane();
    driver.updateActivityPane();

    expect(setProgress).toHaveBeenCalledTimes(1);
    expect(setProgress).toHaveBeenLastCalledWith(true);

    state.appState.isCompacting = false;
    state.appState.streamingPhase = 'idle';
    driver.updateActivityPane();

    expect(setProgress).toHaveBeenCalledTimes(2);
    expect(setProgress).toHaveBeenLastCalledWith(false);
  });

  it('hides the pane loader while an activity run is live but keeps terminal progress', () => {
    vi.useFakeTimers();
    try {
      const { driver, state, setProgress } = makeDriverWithTerminalProgress();
      state.livePane = { ...state.livePane, mode: 'waiting' };
      driver.updateActivityPane();
      expect(state.activityContainer.children).toHaveLength(1);

      driver.streamingUI.setTurnId('live');
      driver.streamingUI.registerToolCall({ id: 'g1', name: 'Grep', args: {}, turnId: 'live', step: 1 });
      driver.updateActivityPane();
      expect(state.activityContainer.children).toHaveLength(0);
      expect(setProgress).toHaveBeenLastCalledWith(true);

      driver.streamingUI.finishActivity();
      driver.updateActivityPane();
      expect(state.activityContainer.children).toHaveLength(1);
      expect(setProgress).toHaveBeenLastCalledWith(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps terminal progress active without showing a thinking spinner', () => {
    vi.useFakeTimers();
    try {
      const { driver, state, setProgress } = makeDriverWithTerminalProgress();
      state.livePane = { ...state.livePane, mode: 'idle' };
      state.appState.streamingPhase = 'thinking';

      driver.updateActivityPane();

      expect(setProgress).toHaveBeenCalledTimes(1);
      expect(setProgress).toHaveBeenLastCalledWith(true);
      expect(state.activitySpinner).toBeNull();
      expect(state.activityContainer.children).toHaveLength(0);

      state.appState.streamingPhase = 'idle';
      driver.updateActivityPane();

      expect(setProgress).toHaveBeenCalledTimes(2);
      expect(setProgress).toHaveBeenLastCalledWith(false);
      expect(state.activitySpinner).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
