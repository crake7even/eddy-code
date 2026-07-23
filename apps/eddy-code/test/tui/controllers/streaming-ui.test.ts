import { describe, expect, it, vi } from 'vitest';

import { StreamingUIController } from '#/tui/controllers/streaming-ui';
import type { StreamingUIHost } from '#/tui/controllers/streaming-ui';
import type { ToolCallBlockData } from '#/tui/types';

function createMockHost(): StreamingUIHost {
  return {
    state: {
      appState: {
        streamingPhase: 'idle',
        streamingStartTime: 0,
      },
    } as unknown as StreamingUIHost['state'],
    session: undefined,
    setAppState: vi.fn(),
    patchLivePane: vi.fn(),
    resetLivePane: vi.fn(),
    updateActivityPane: vi.fn(),
    updateQueueDisplay: vi.fn(),
    requireSession: vi.fn(),
    deferUserMessages: false,
    shiftQueuedMessage: vi.fn(),
    pushTranscriptEntry: vi.fn(),
    onTurnCompleted: vi.fn(),
    transcriptController: {} as unknown as StreamingUIHost['transcriptController'],
  };
}

describe('StreamingUIController', () => {
  it('markStepTruncated only affects matching, in-flight streaming tool calls', () => {
    const controller = new StreamingUIController(createMockHost());

    const calls: ToolCallBlockData[] = [
      {
        id: 'tc-1',
        name: 'Bash',
        args: {},
        streamingArguments: 'ls',
        turnId: 'turn-1',
        step: 1,
      },
      {
        id: 'tc-2',
        name: 'Bash',
        args: {},
        streamingArguments: 'cat',
        turnId: 'turn-1',
        step: 1,
      },
      {
        id: 'tc-3',
        name: 'Bash',
        args: {},
        streamingArguments: 'pwd',
        turnId: 'turn-2',
        step: 1,
      },
      {
        id: 'tc-4',
        name: 'Bash',
        args: {},
        // no streamingArguments
        turnId: 'turn-1',
        step: 1,
      },
      {
        id: 'tc-5',
        name: 'Bash',
        args: {},
        streamingArguments: 'echo',
        turnId: 'turn-1',
        step: 1,
        result: { tool_call_id: 'tc-5', output: 'done' },
      },
      {
        id: 'tc-6',
        name: 'Bash',
        args: {},
        streamingArguments: 'grep',
        turnId: 'turn-1',
        step: 2,
      },
    ];

    for (const toolCall of calls) {
      controller.setActiveToolCall(toolCall.id, toolCall);
    }

    const count = controller.markStepTruncated('turn-1', 1);

    expect(count).toBe(2);
    expect(controller.getActiveToolCall('tc-1')?.truncated).toBe(true);
    expect(controller.getActiveToolCall('tc-2')?.truncated).toBe(true);
    expect(controller.getActiveToolCall('tc-5')?.truncated).toBeUndefined();
    expect(controller.getActiveToolCall('tc-3')?.truncated).toBeUndefined();
    expect(controller.getActiveToolCall('tc-4')?.truncated).toBeUndefined();
    expect(controller.getActiveToolCall('tc-6')?.truncated).toBeUndefined();
  });

  it('turn context accessors track current turn id and step', () => {
    const controller = new StreamingUIController(createMockHost());

    expect(controller.getTurnContext()).toEqual({ turnId: undefined, step: 0 });

    controller.setTurnId('turn-42');
    controller.setStep(3);

    expect(controller.getTurnContext()).toEqual({ turnId: 'turn-42', step: 3 });
    expect(controller.hasActiveTurn()).toBe(true);
  });
});
