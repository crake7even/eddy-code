import type {
  AgentReplayRecord,
  BackgroundTaskInfo,
  ContentPart,
  PromptOrigin,
  ResumedAgentState,
  Role,
  Session,
  ToolCall,
} from '@eddy-code/sdk';
import { describe, expect, it, vi } from 'vitest';

import { EddyTUI, type EddyTUIStartupInput, type TUIState } from '#/tui/eddy-tui';
import type { SessionEventHandler } from '#/tui/controllers/session-event-handler';
import type { StreamingUIController } from '#/tui/controllers/streaming-ui';
import { AgentGroupComponent } from '#/tui/components/messages/agent-group';
import { ReadGroupComponent } from '#/tui/components/messages/read-group';
import { ThinkingComponent } from '#/tui/components/messages/thinking';
import { TranscriptContainer } from '#/tui/components/chrome/transcript-container';

vi.mock('#/tui/utils/open-url', () => ({ openUrl: vi.fn() }));

interface ReplayDriver {
  readonly state: TUIState;
  readonly streamingUI: StreamingUIController;
  readonly sessionEventHandler: SessionEventHandler;
  init(): Promise<boolean>;
  switchToSession(session: Session, statusMessage: string): Promise<void>;
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

function message(
  role: Role,
  content: readonly ContentPart[],
  extra: {
    readonly toolCalls?: readonly ToolCall[];
    readonly toolCallId?: string;
    readonly origin?: PromptOrigin;
    readonly isError?: boolean;
  } = {},
): AgentReplayRecord {
  return {
    type: 'message',
    message: {
      role,
      content: [...content],
      toolCalls: [...(extra.toolCalls ?? [])],
      toolCallId: extra.toolCallId,
      origin: extra.origin,
      isError: extra.isError,
    },
  };
}

function toolCall(id: string, name: string, args: Record<string, unknown>): ToolCall {
  return {
    type: 'function',
    id,
    name,
    arguments: JSON.stringify(args),
  };
}

function baseAgentState(
  replay: readonly AgentReplayRecord[],
  overrides: Partial<ResumedAgentState> = {},
): ResumedAgentState {
  return {
    type: 'main',
    config: {
      cwd: '/tmp/proj-a',
      modelAlias: 'k2',
      provider: undefined,
      modelCapabilities: {
        image_in: false,
        video_in: false,
        audio_in: false,
        thinking: false,
        tool_use: true,
        max_context_tokens: 100,
      },
      thinkingLevel: 'off',
      systemPrompt: '',
    },
    context: { history: [], tokenCount: 0 },
    replay,
    permission: { mode: 'manual', rules: [] },
    plan: null,
    usage: {},
    tools: [],
    toolStore: {},
    background: [],
    ...overrides,
  };
}

function makeSession(
  replay: readonly AgentReplayRecord[],
  overrides: Partial<ResumedAgentState> = {},
): Session {
  const agent = baseAgentState(replay, overrides);
  return {
    id: 'ses-replay',
    model: 'k2',
    summary: { title: null },
    getStatus: vi.fn(async () => ({
      model: 'k2',
      thinkingLevel: 'off',
      permission: 'manual',
      planMode: false,
      contextTokens: 0,
      maxContextTokens: 100,
      contextUsage: 0,
    })),
    setApprovalHandler: vi.fn(),
    setQuestionHandler: vi.fn(),
    setModel: vi.fn(async () => {}),
    setThinking: vi.fn(async () => {}),
    setPermission: vi.fn(async () => {}),
    setPlanMode: vi.fn(async () => {}),
    getGoal: vi.fn(async () => ({ goal: null })),
    onEvent: vi.fn(() => vi.fn()),
    listMcpServers: vi.fn(async () => []),
    listSkills: vi.fn(async () => []),
    getResumeState: vi.fn(() => ({
      sessionMetadata: {},
      agents: { main: agent },
    })),
    close: vi.fn(async () => {}),
  } as unknown as Session;
}

function makeHarness(initialSession: Session) {
  return {
    getConfig: vi.fn(async () => ({
      models: {
        k2: { model: 'eddy-code-v1', maxContextSize: 100 },
      },
    })),
    setConfig: vi.fn(async () => ({ providers: {} })),
    createSession: vi.fn(async () => initialSession),
    resumeSession: vi.fn(async () => initialSession),
    forkSession: vi.fn(async () => initialSession),
    listSessions: vi.fn(async () => []),
    close: vi.fn(async () => {}),
    interactiveAgentId: 'main',
    auth: {
      status: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
      getManagedUsage: vi.fn(),
      submitFeedback: vi.fn(async () => ({ kind: 'ok' })),
    },
  };
}

async function makeDriver(initialSession: Session): Promise<ReplayDriver> {
  const driver = new EddyTUI(
    makeHarness(initialSession) as never,
    makeStartupInput(),
  ) as unknown as ReplayDriver;
  vi.spyOn(driver.state.ui, 'requestRender').mockImplementation(() => {});
  vi.spyOn(driver.state.terminal, 'setProgress').mockImplementation(() => {});
  await driver.init();
  return driver;
}

async function replayIntoDriver(
  replay: readonly AgentReplayRecord[],
  overrides: Partial<ResumedAgentState> = {},
): Promise<ReplayDriver> {
  const initial = makeSession([]);
  const resumed = makeSession(replay, overrides);
  const driver = await makeDriver(initial);
  await driver.switchToSession(resumed, 'Resumed session (ses-replay).');
  return driver;
}

function renderPlain(driver: ReplayDriver): string {
  return driver.state.transcriptContainer
    .render(120)
    .join('\n')
    .replaceAll(/\u001B\[[0-9;]*m/g, '');
}

function backgroundTask(
  taskId: string,
  description: string,
  status: BackgroundTaskInfo['status'] = 'running',
): BackgroundTaskInfo {
  return {
    taskId,
    command: `[agent] ${description}`,
    description,
    status,
    pid: 0,
    exitCode: status === 'completed' ? 0 : null,
    startedAt: 1,
    endedAt: status === 'running' || status === 'awaiting_approval' ? null : 2,
  };
}

describe('EddyTUI resume message replay', () => {
  it('groups replayed Agent calls from one assistant message using live grouping', async () => {
    const replay: AgentReplayRecord[] = [
      message('user', [{ type: 'text', text: 'run two agents' }]),
      message('assistant', [], {
        toolCalls: [
          toolCall('call_agent_1', 'Agent', {
            description: 'Review API',
            subagent_type: 'reviewer',
          }),
          toolCall('call_agent_2', 'Agent', {
            description: 'Review tests',
            subagent_type: 'reviewer',
          }),
        ],
      }),
      message('tool', [{ type: 'text', text: 'agent one done' }], {
        toolCallId: 'call_agent_1',
      }),
      message('tool', [{ type: 'text', text: 'agent two done' }], {
        toolCallId: 'call_agent_2',
      }),
    ];

    const driver = await replayIntoDriver(replay);
    const group = driver.state.transcriptContainer.children.find(
      (child) => child instanceof AgentGroupComponent,
    );

    expect(group).toBeInstanceOf(AgentGroupComponent);
    expect((group as AgentGroupComponent).size()).toBe(2);
    expect(driver.streamingUI.hasPendingAgentGroup()).toBe(false);
    expect(driver.streamingUI.getToolComponent('call_agent_1')).toBeUndefined();
    expect(driver.streamingUI.getToolComponent('call_agent_2')).toBeUndefined();
  });

  it('groups replayed Read calls from one assistant message using live grouping', async () => {
    const replay: AgentReplayRecord[] = [
      message('user', [{ type: 'text', text: 'read files' }]),
      message('assistant', [], {
        toolCalls: [
          toolCall('call_read_1', 'Read', { file_path: '/tmp/proj-a/src/a.ts' }),
          toolCall('call_read_2', 'Read', { file_path: '/tmp/proj-a/src/b.ts' }),
        ],
      }),
      message('tool', [{ type: 'text', text: 'line a\nline b\n' }], {
        toolCallId: 'call_read_1',
      }),
      message('tool', [{ type: 'text', text: 'line c\n' }], {
        toolCallId: 'call_read_2',
      }),
    ];

    const driver = await replayIntoDriver(replay);
    const group = driver.state.transcriptContainer.children.find(
      (child) => child instanceof ReadGroupComponent,
    );

    expect(group).toBeInstanceOf(ReadGroupComponent);
    expect((group as ReadGroupComponent).size()).toBe(2);
    expect(driver.streamingUI.hasPendingReadGroup()).toBe(false);
    expect(driver.streamingUI.getToolComponent('call_read_1')).toBeUndefined();
    expect(driver.streamingUI.getToolComponent('call_read_2')).toBeUndefined();
  });

  it('summarizes replayed thinking by the actions that followed it', async () => {
    const replay: AgentReplayRecord[] = [
      message('user', [{ type: 'text', text: 'show my config' }]),
      message('assistant', [{ type: 'think', think: 'The user asks about config.' }], {
        toolCalls: [
          toolCall('call_bash', 'Bash', { command: 'ls' }),
          toolCall('call_read', 'Read', { file_path: '/tmp/proj-a/a.md' }),
        ],
      }),
      message('tool', [{ type: 'text', text: 'a.md' }], { toolCallId: 'call_bash' }),
      message('tool', [{ type: 'text', text: 'content' }], { toolCallId: 'call_read' }),
      message('assistant', [
        { type: 'think', think: 'Summarize it.' },
        { type: 'text', text: 'Here it is.' },
      ]),
    ];

    const driver = await replayIntoDriver(replay);
    const lines = driver.state.transcriptContainer.children
      .filter((child) => child instanceof ThinkingComponent)
      .map((child) => child.render(80).join('').replaceAll(/\u001B\[[0-9;]*m/g, ''));

    expect(lines).toEqual([
      '● 思考后：运行命令、读取文件 · ctrl+o 查看',
      '● 思考后：整理回答 · ctrl+o 查看',
    ]);
  });

  it('hydrates todo and background snapshot state from resumed main agent', async () => {
    const driver = await replayIntoDriver([], {
      toolStore: {
        todo: [
          { title: 'Review resume snapshot', status: 'done' },
          { title: 'Render replay transcript', status: 'in_progress' },
          { title: '', status: 'pending' },
        ],
      },
      background: [
        backgroundTask('agent-bg1', 'Review long-running work', 'running'),
        backgroundTask('bash-bg1', 'Build package', 'completed'),
      ],
    });

    expect(driver.state.todoPanel.getTodos()).toEqual([
      { title: 'Review resume snapshot', status: 'done' },
      { title: 'Render replay transcript', status: 'in_progress' },
    ]);
    expect(driver.sessionEventHandler.backgroundTasks.has('agent-bg1')).toBe(true);
    expect(driver.sessionEventHandler.backgroundTasks.has('bash-bg1')).toBe(true);
    expect(driver.sessionEventHandler.backgroundTaskTranscriptedTerminal.has('bash-bg1')).toBe(true);
  });

  it('renders replayed bash background notifications as bash tasks', async () => {
    const driver = await replayIntoDriver(
      [
        message('user', [{ type: 'text', text: 'Background task lost.' }], {
          origin: {
            kind: 'background_task',
            taskId: 'bash-lost0000',
            status: 'lost',
            notificationId: 'task:bash-lost0000:lost',
          },
        }),
      ],
      {
        background: [backgroundTask('bash-lost0000', 'Background timestamp logger', 'lost')],
      },
    );

    const status = driver.state.transcriptEntries.find(
      (entry) => entry.backgroundAgentStatus !== undefined,
    );

    expect(status?.backgroundAgentStatus?.headline).toBe('bash 任务 已丢失');
    expect(status?.backgroundAgentStatus?.detail).toContain('Background timestamp logger');
    expect(status?.backgroundAgentStatus?.headline).not.toContain('agent');
  });

  it('renders only the most recent ten visible user turns', async () => {
    const replay = Array.from({ length: 12 }, (_, index) => [
      message('user', [{ type: 'text', text: `prompt ${index}` }]),
      message('assistant', [{ type: 'text', text: `answer ${index}` }]),
    ]).flat();

    const driver = await replayIntoDriver(replay);

    expect(
      driver.state.transcriptEntries
        .filter((entry) => entry.kind === 'user')
        .map((entry) => entry.content),
    ).toEqual([
      'prompt 2',
      'prompt 3',
      'prompt 4',
      'prompt 5',
      'prompt 6',
      'prompt 7',
      'prompt 8',
      'prompt 9',
      'prompt 10',
      'prompt 11',
    ]);
    expect(
      driver.state.transcriptEntries
        .filter((entry) => entry.kind === 'assistant')
        .map((entry) => entry.content),
    ).toEqual([
      'answer 2',
      'answer 3',
      'answer 4',
      'answer 5',
      'answer 6',
      'answer 7',
      'answer 8',
      'answer 9',
      'answer 10',
      'answer 11',
    ]);
  });

  it('skips cron_job origin records during replay', async () => {
    const cronFire =
      '<cron-fire jobId="job-1" cron="*/5 * * * *" recurring="true" coalescedCount="1">\nrun nightly\n</cron-fire>';
    const driver = await replayIntoDriver([
      message('user', [{ type: 'text', text: 'real prompt' }]),
      message('assistant', [{ type: 'text', text: 'real answer' }]),
      message('user', [{ type: 'text', text: cronFire }], {
        origin: {
          kind: 'cron_job',
          jobId: 'job-1',
          cron: '*/5 * * * *',
          recurring: true,
          coalescedCount: 1,
          stale: false,
        },
      }),
    ]);

    const transcript = driver.state.transcriptContainer.render(120).join('\n');
    expect(transcript).not.toContain('<cron-fire');
    expect(
      driver.state.transcriptEntries
        .filter((entry) => entry.kind === 'user')
        .map((entry) => entry.content),
    ).toEqual(['real prompt']);
  });

  it('skips cron_missed origin records during replay', async () => {
    const cronMissed =
      '<cron-fire jobId="job-2" missed="true" count="3">\n3 one-shot tasks missed while offline\n</cron-fire>';
    const driver = await replayIntoDriver([
      message('user', [{ type: 'text', text: 'real prompt' }]),
      message('assistant', [{ type: 'text', text: 'real answer' }]),
      message('user', [{ type: 'text', text: cronMissed }], {
        origin: { kind: 'cron_missed', count: 3 },
      }),
    ]);

    const transcript = driver.state.transcriptContainer.render(120).join('\n');
    expect(transcript).not.toContain('<cron-fire');
    expect(transcript).not.toContain('missed while offline');
    expect(
      driver.state.transcriptEntries
        .filter((entry) => entry.kind === 'user')
        .map((entry) => entry.content),
    ).toEqual(['real prompt']);
  });

  it('renders user-slash skill activation once without exposing injected prompt text', async () => {
    const activation = message(
      'user',
      [{ type: 'text', text: 'Review the requested file.\n\nUser request:\nsrc/app.ts' }],
      {
        origin: {
          kind: 'skill_activation',
          activationId: 'act-review',
          skillName: 'review',
          skillArgs: 'src/app.ts',
          trigger: 'user-slash',
        },
      },
    );

    const driver = await replayIntoDriver([activation, activation]);
    const transcript = driver.state.transcriptContainer.render(120).join('\n');

    expect(transcript).toContain('review');
    expect(transcript).toContain('src/app.ts');
    expect(transcript).not.toContain('Review the requested file');
    expect(driver.sessionEventHandler.renderedSkillActivationIds.has('act-review')).toBe(true);
  });

  it('renders replayed hook results as assistant transcript entries', async () => {
    const hookResult =
      '<hook_result hook_event="UserPromptSubmit">\nhook response 1\n</hook_result>\n' +
      '<hook_result hook_event="UserPromptSubmit">\nhook response 2\n</hook_result>';
    const driver = await replayIntoDriver([
      message('user', [{ type: 'text', text: 'prompt' }]),
      message('user', [{ type: 'text', text: hookResult }], {
        origin: { kind: 'hook_result', event: 'UserPromptSubmit' },
      }),
    ]);

    const transcript = driver.state.transcriptContainer.render(120).join('\n');

    expect(transcript).toContain('UserPromptSubmit hook');
    expect(transcript).toContain('hook response 1');
    expect(transcript).toContain('hook response 2');
  });

  it('renders plan permission and approval replay notices', async () => {
    const driver = await replayIntoDriver([
      { type: 'plan_updated', enabled: true },
      { type: 'permission_updated', mode: 'auto' },
      { type: 'permission_updated', mode: 'yolo' },
      { type: 'permission_updated', mode: 'manual' },
      {
        type: 'approval_result',
        record: {
          turnId: 0,
          toolCallId: 'call_bash',
          action: 'run command',
          toolName: 'Bash',
          result: {
            decision: 'approved',
            scope: 'session',
            selectedLabel: 'Approve for this session',
          },
        },
      },
      { type: 'plan_updated', enabled: false },
    ]);

    const transcript = driver.state.transcriptContainer.render(120).join('\n');

    expect(transcript).toContain('Plan mode: ON');
    expect(transcript).toContain('权限模式： auto');
    expect(transcript).toContain('YES 模式：开启');
    expect(transcript).toContain('YES 模式：关闭');
    expect(transcript).toContain('已批准（当前会话）：运行命令');
    expect(transcript).not.toContain('run command');
    expect(transcript).toContain('Plan mode: OFF');
  });

  it('places a replayed approval notice right under its own tool call', async () => {
    const driver = await replayIntoDriver([
      message('user', [{ type: 'text', text: 'look around' }]),
      message('assistant', [], {
        toolCalls: [
          toolCall('call_bash', 'Bash', { command: 'ls -la ~/.eddy-code/' }),
          toolCall('call_read', 'Read', { path: '/tmp/proj-a/AGENTS.md' }),
        ],
      }),
      {
        type: 'approval_result',
        record: {
          turnId: 0,
          toolCallId: 'call_bash',
          action: 'Running: ls -la ~/.eddy-code/',
          toolName: 'Bash',
          result: { decision: 'approved' },
        },
      },
      message('tool', [{ type: 'text', text: 'total 0' }], { toolCallId: 'call_bash' }),
      message('tool', [{ type: 'text', text: 'rules' }], { toolCallId: 'call_read' }),
    ]);

    (driver.state.transcriptContainer as TranscriptContainer).setShowCollapsed(true);
    const transcript = renderPlain(driver);
    const notice = transcript.indexOf('已批准：运行命令 ls -la ~/.eddy-code/');
    expect(notice).toBeGreaterThan(transcript.indexOf('Bash'));
    expect(notice).toBeLessThan(transcript.indexOf('Read'));
    expect(transcript).not.toContain('Running:');
  });

  it('collapses a finished run of activity into one line before the answer', async () => {
    const driver = await replayIntoDriver([
      message('user', [{ type: 'text', text: 'show my config' }]),
      message('assistant', [{ type: 'think', think: 'Look at the files.' }], {
        toolCalls: [
          toolCall('call_bash', 'Bash', { command: 'ls -la' }),
          toolCall('call_read', 'Read', { path: '/tmp/proj-a/AGENTS.md' }),
        ],
      }),
      {
        type: 'approval_result',
        record: {
          turnId: 0,
          toolCallId: 'call_bash',
          action: 'Running: ls -la',
          toolName: 'Bash',
          result: { decision: 'approved' },
        },
      },
      message('tool', [{ type: 'text', text: 'total 0' }], { toolCallId: 'call_bash' }),
      message('tool', [{ type: 'text', text: 'rules' }], { toolCallId: 'call_read' }),
      message('assistant', [{ type: 'text', text: 'Your config lives in ~/.eddy-code.' }]),
    ]);

    const collapsed = renderPlain(driver);
    expect(collapsed).toContain('已使用 2 个工具 ›');
    expect(collapsed).toContain('Your config lives in ~/.eddy-code.');
    expect(collapsed).not.toContain('Bash');
    expect(collapsed).not.toContain('已批准');
    expect(collapsed).not.toContain('思考');

    (driver.state.transcriptContainer as TranscriptContainer).setShowCollapsed(true);
    const expanded = renderPlain(driver);
    expect(expanded).toContain('Bash');
    expect(expanded).toContain('已批准：运行命令 ls -la');
  });

  it('splits activity runs around intermediate assistant text', async () => {
    const driver = await replayIntoDriver([
      message('user', [{ type: 'text', text: 'check two things' }]),
      message('assistant', [], { toolCalls: [toolCall('call_a', 'Bash', { command: 'pwd' })] }),
      message('tool', [{ type: 'text', text: '/tmp' }], { toolCallId: 'call_a' }),
      message('assistant', [{ type: 'text', text: 'First done, now the second.' }], {
        toolCalls: [toolCall('call_b', 'Bash', { command: 'ls' })],
      }),
      message('tool', [{ type: 'text', text: 'a' }], { toolCallId: 'call_b' }),
      message('assistant', [{ type: 'text', text: 'All done.' }]),
    ]);

    const transcript = renderPlain(driver);
    const first = transcript.indexOf('已使用 1 个工具 ›');
    const middle = transcript.indexOf('First done, now the second.');
    const second = transcript.indexOf('已使用 1 个工具 ›', first + 1);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(middle).toBeGreaterThan(first);
    expect(second).toBeGreaterThan(middle);
    expect(transcript.indexOf('All done.')).toBeGreaterThan(second);
  });

  it('updates the live activity line as the agent works', async () => {
    const driver = await replayIntoDriver([]);
    const ui = driver.streamingUI;
    ui.setTurnId('live');
    ui.onThinkingUpdate('planning');
    expect(renderPlain(driver)).toContain('思考中…');

    ui.onThinkingEnd();
    ui.registerToolCall({ id: 'b1', name: 'Bash', args: { command: 'ls -la' }, turnId: 'live', step: 1 });
    expect(renderPlain(driver)).toContain('正在运行命令 ls -la…');
    expect(renderPlain(driver)).not.toContain('planning');

    ui.noteActivityApprovalPending('Bash', { command: 'ls -la' });
    expect(renderPlain(driver)).toContain('等待你批准：运行命令 ls -la');
    ui.noteActivityApprovalDone();
    expect(renderPlain(driver)).toContain('正在运行命令 ls -la…');

    ui.completeToolResult('b1', { tool_call_id: 'b1', output: 'boom', is_error: true });
    ui.appendAssistantDelta('Done.');
    ui.flushNow();
    const finished = renderPlain(driver);
    expect(finished).toContain('已使用 1 个工具 › · 1 个失败');
    expect(finished).toContain('Done.');
  });

  it('refreshes the live label once streamed tool args arrive', async () => {
    const driver = await replayIntoDriver([]);
    const ui = driver.streamingUI;
    ui.setTurnId('live');
    ui.registerToolCall({ id: 'g1', name: 'Grep', args: {}, turnId: 'live', step: 1 });
    expect(renderPlain(driver)).toContain('正在查找文件…');

    ui.registerToolCall({ id: 'g1', name: 'Grep', args: { pattern: 'contact' }, turnId: 'live', step: 1 });
    expect(renderPlain(driver)).toContain('正在查找文件 contact…');
  });

  it('hides a thinking-only run without a summary line once text follows', async () => {
    const driver = await replayIntoDriver([]);
    const ui = driver.streamingUI;
    ui.setTurnId('live');
    ui.onThinkingUpdate('planning');
    ui.onThinkingEnd();
    ui.appendAssistantDelta('Hello.');
    ui.flushNow();
    const rendered = renderPlain(driver);
    expect(rendered).not.toContain('已思考 ›');
    expect(rendered).toContain('Hello.');
  });

  it('keeps only the final approved plan card after rejected plan reviews', async () => {
    const driver = await replayIntoDriver([
      message('assistant', [], {
        toolCalls: [toolCall('call_exit_reject', 'ExitPlanMode', {})],
      }),
      {
        type: 'approval_result',
        record: {
          turnId: 0,
          toolCallId: 'call_exit_reject',
          action: 'Review plan',
          toolName: 'ExitPlanMode',
          result: { decision: 'rejected', selectedLabel: 'Reject' },
        },
      },
      message('tool', [{ type: 'text', text: 'Plan rejected by user. Plan mode remains active.' }], {
        toolCallId: 'call_exit_reject',
        isError: true,
      }),
      message('assistant', [], {
        toolCalls: [toolCall('call_exit_final', 'ExitPlanMode', {})],
      }),
      {
        type: 'approval_result',
        record: {
          turnId: 1,
          toolCallId: 'call_exit_final',
          action: 'Review plan',
          toolName: 'ExitPlanMode',
          result: { decision: 'approved', selectedLabel: 'Approve' },
        },
      },
      message(
        'tool',
        [
          {
            type: 'text',
            text:
              'Exited plan mode. Plan mode deactivated. All tools are now available.\n' +
              'Plan saved to: /tmp/plans/final-plan.md\n\n' +
              '## Approved Plan:\n# Final Plan\n\n- replay final approved plan',
          },
        ],
        { toolCallId: 'call_exit_final' },
      ),
      { type: 'plan_updated', enabled: false },
    ]);

    const transcript = driver.state.transcriptContainer.render(120).join('\n');

    expect(transcript).toContain('计划审查已拒绝');
    expect(transcript).toContain('Final Plan');
    expect(transcript).toContain('replay final approved plan');
    expect(transcript).not.toContain('Plan rejected by user.');
    expect(transcript).not.toContain('Plan mode: OFF');
  });
});
