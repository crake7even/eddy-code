import type { Component } from '@earendil-works/pi-tui';
import type { Session } from '@eddy-code/sdk';
import { PRODUCT_NAME } from '#/constant/app';

import { collapseInTranscript } from '../components/chrome/transcript-container';
import { ActivityGroupComponent } from '../components/messages/activity-group';
import { AgentGroupComponent } from '../components/messages/agent-group';
import { AssistantMessageComponent } from '../components/messages/assistant-message';
import { CompactionComponent } from '../components/dialogs/compaction';
import { ReadGroupComponent, parseReadGroupOutput } from '../components/messages/read-group';
import { ThinkingComponent } from '../components/messages/thinking';
import { ToolCallComponent, extractKeyArgument } from '../components/messages/tool-call';
import { STREAMING_UI_FLUSH_MS } from '../constant/streaming';
import { hasDispose } from '../utils/component-capabilities';
import { appendStreamingArgsPreview, parseStreamingArgs } from '../utils/event-payload';
import { notifyTerminalOnce } from '../utils/terminal-notification';
import { describeToolAction } from '../utils/approval-notice';
import { toolActionLabel } from '../utils/tool-labels';
import { nextTranscriptId } from '../utils/transcript-id';
import type { TodoItem } from '../components/chrome/todo-panel';
import type { TranscriptController } from './transcript-controller';
import type {
  AppState,
  LivePaneState,
  QueuedMessage,
  ThinkingFollowUp,
  ToolCallBlockData,
  ToolResultBlockData,
  TranscriptEntry,
} from '../types';
import type { TUIState } from '../tui-state';

export interface StreamingUIHost {
  state: TUIState;
  session: Session | undefined;
  setAppState(patch: Partial<AppState>): void;
  patchLivePane(patch: Partial<LivePaneState>): void;
  resetLivePane(): void;
  updateActivityPane(): void;
  updateQueueDisplay(): void;
  requireSession(): Session;
  deferUserMessages: boolean;
  shiftQueuedMessage(): QueuedMessage | undefined;
  pushTranscriptEntry(entry: TranscriptEntry): void;
  onTurnCompleted(): void;
  readonly transcriptController: TranscriptController;
}

export class StreamingUIController {
  private flushTimer: ReturnType<typeof setTimeout> | undefined;
  private lastFlushAt: number | undefined;
  private pendingAssistantFlush = false;
  private pendingThinkingFlush = false;
  readonly pendingToolCallFlushIds = new Set<string>();

  // ---------------------------------------------------------------------------
  // Streaming runtime state (private — accessed via semantic methods below)
  // ---------------------------------------------------------------------------

  private _currentTurnId: string | undefined = undefined;
  private _currentStep = 0;
  private _assistantDraft = '';
  private _thinkingDraft = '';
  private _thinkingEntry: TranscriptEntry | undefined = undefined;
  private _compactionEntry: TranscriptEntry | undefined = undefined;
  private _streamingBlock: { component: AssistantMessageComponent; entry: TranscriptEntry } | null = null;
  private _activeThinkingComponent: ThinkingComponent | undefined = undefined;
  // Most recent thinking block whose follow-up is still open; its one-line
  // summary reflects the tool calls or answer after it. Closed once a tool
  // result arrives, since the next LLM step starts after results.
  private _lastThinking: { component: ThinkingComponent; entry: TranscriptEntry } | undefined;
  // Header of the current run of thinking/tool activity. Members are hidden
  // behind it in the transcript; text output or turn end finishes the run.
  private _activity: { header: ActivityGroupComponent; entry: TranscriptEntry } | null = null;
  private _activityLabelBeforeApproval: string | undefined;
  // Id of the most recently started tool in the current activity run; its live
  // label follows the args as they stream in.
  private _activityToolCallId: string | undefined;
  private _activeCompactionBlock: CompactionComponent | undefined = undefined;
  private _activeToolCalls = new Map<string, ToolCallBlockData>();
  private _streamingToolCallArguments = new Map<
    string,
    { name?: string; argumentsText: string; startedAtMs: number }
  >();
  private _pendingToolComponents = new Map<string, ToolCallComponent>();
  private _pendingReadGroupComponents = new Map<string, ReadGroupComponent>();
  private _pendingAgentGroup: {
    readonly turnId: string | undefined;
    readonly step: number;
    solo?: ToolCallComponent;
    group?: AgentGroupComponent;
  } | null = null;
  private _pendingReadGroup: {
    readonly turnId: string | undefined;
    readonly step: number;
    solo?: ToolCallComponent;
    group?: ReadGroupComponent;
  } | null = null;

  constructor(private readonly host: StreamingUIHost) {}

  // ---------------------------------------------------------------------------
  // Turn context — read/write accessors
  // ---------------------------------------------------------------------------

  getTurnContext(): { turnId: string | undefined; step: number } {
    return { turnId: this._currentTurnId, step: this._currentStep };
  }

  setTurnId(turnId: string | undefined): void {
    this._currentTurnId = turnId;
  }

  setStep(step: number): void {
    this._currentStep = step;
  }

  hasActiveTurn(): boolean {
    return this._currentTurnId !== undefined;
  }

  // ---------------------------------------------------------------------------
  // Text streaming — semantic write accessors
  // ---------------------------------------------------------------------------

  appendThinkingDelta(delta: string): void {
    this._thinkingDraft += delta;
    this.pendingThinkingFlush = true;
  }

  appendAssistantDelta(delta: string): void {
    if (this._streamingBlock === null) {
      this.onStreamingTextStart();
    }
    this._assistantDraft += delta;
    this.pendingAssistantFlush = true;
  }

  hasThinkingDraft(): boolean {
    return this._thinkingDraft.length > 0;
  }

  hasActiveThinkingComponent(): boolean {
    return this._activeThinkingComponent !== undefined;
  }

  hasStreamingBlock(): boolean {
    return this._streamingBlock !== null;
  }

  getStreamingBlockComponent(): AssistantMessageComponent | undefined {
    return this._streamingBlock?.component;
  }

  clearAssistantDraft(): void {
    this._assistantDraft = '';
  }

  // ---------------------------------------------------------------------------
  // Tool call state — semantic accessors
  // ---------------------------------------------------------------------------

  getActiveToolCall(id: string): ToolCallBlockData | undefined {
    return this._activeToolCalls.get(id);
  }

  hasActiveToolCall(id: string): boolean {
    return this._activeToolCalls.has(id);
  }

  setActiveToolCall(id: string, toolCall: ToolCallBlockData): void {
    this._activeToolCalls.set(id, toolCall);
  }

  removeActiveToolCall(id: string): void {
    this._activeToolCalls.delete(id);
  }

  getToolComponent(id: string): ToolCallComponent | undefined {
    return this._pendingToolComponents.get(id);
  }

  removeToolComponent(id: string): void {
    this._pendingToolComponents.delete(id);
  }

  hasPendingAgentGroup(): boolean {
    return this._pendingAgentGroup !== null;
  }

  hasPendingReadGroup(): boolean {
    return this._pendingReadGroup !== null;
  }

  removeToolComponentIfInactive(toolCallId: string): void {
    if (!this._activeToolCalls.has(toolCallId)) {
      this._pendingToolComponents.delete(toolCallId);
    }
  }

  /**
   * Push the actual terminal status of a background agent task into the
   * matching `Agent` tool call component so its snapshot phase no longer
   * trusts the spawn-success ToolResult (which would otherwise label every
   * terminated bg agent — including `lost` ones — as `✓ Completed`).
   *
   * Resolution policy: an `args.agentId` is treated as authoritative — we
   * either find a card whose `getSubagentAgentId()` returns the same id
   * (in-memory metadata for live foreground, parsed from the spawn-success
   * `agent_id: ...` line for live backgrounded and replayed cards) or we
   * skip. We deliberately do NOT fall back to description match when
   * `agentId` is provided, because:
   *   - On resume, `applyTerminalBackgroundAgentStatuses` iterates every
   *     persisted terminal task, including ones whose tool calls fell
   *     outside the `REPLAY_TURN_LIMIT` window. A description fallback
   *     would let an old `lost` task stamp its status onto an unrelated
   *     recent Agent card that happens to share `args.description`.
   *   - During a live spawn / terminate race, the same card can briefly
   *     appear in both `_pendingToolComponents` and `transcriptContainer`,
   *     so a description match could double-visit the same component and
   *     mark itself ambiguous. agentId match short-circuits on the first
   *     hit and is immune.
   *
   * Description fallback is kept as a best-effort path only when
   * `agentId` is unknown — that is, on resume of pre-PR sessions whose
   * disk records pre-date `agent_id` persistence.
   *
   * Search scope includes both in-flight components and already-mounted
   * cards (some live in `transcriptContainer` standalone, others are
   * borrowed by an `AgentGroupComponent` and reachable only via
   * `getToolComponents()`).
   *
   * Returns true iff a component was found and updated.
   */
  applyBackgroundTaskTerminalStatus(args: {
    agentId?: string | undefined;
    description: string;
    status: 'completed' | 'failed' | 'killed' | 'lost';
    /**
     * Real failure message to surface on the card. Pass the `subagent.failed`
     * event's `error` for live crashes — it is far more useful than the
     * friendly generic the card falls back to. Omit on the resume / terminate
     * path where no real error is available.
     */
    errorText?: string | undefined;
  }): boolean {
    const useAgentIdOnly = args.agentId !== undefined;
    let agentIdMatch: ToolCallComponent | undefined;
    let descMatch: ToolCallComponent | undefined;
    let descAmbiguous = false;
    const visit = (tc: ToolCallComponent): void => {
      if (agentIdMatch !== undefined) return;
      if (useAgentIdOnly) {
        if (tc.getSubagentAgentId() === args.agentId) agentIdMatch = tc;
        return;
      }
      if (tc.getAgentToolDescription() !== args.description) return;
      if (descMatch !== undefined) {
        descAmbiguous = true;
        return;
      }
      descMatch = tc;
    };

    for (const tc of this._pendingToolComponents.values()) {
      visit(tc);
      if (agentIdMatch !== undefined) break;
    }
    if (agentIdMatch === undefined) {
      for (const child of this.host.state.transcriptContainer.children) {
        if (child instanceof ToolCallComponent) {
          visit(child);
        } else if (child instanceof AgentGroupComponent) {
          for (const tc of child.getToolComponents()) {
            visit(tc);
            if (agentIdMatch !== undefined) break;
          }
        }
        if (agentIdMatch !== undefined) break;
      }
    }
    const target = useAgentIdOnly
      ? agentIdMatch
      : descAmbiguous
        ? undefined
        : descMatch;
    if (target === undefined) return false;
    target.setBackgroundTaskTerminalStatus(args.status, { errorText: args.errorText });
    return true;
  }

  /** Registers a tool call that arrived via tool.call.started.
   *  Clears any pending streaming state for this id, updates or creates the
   *  component, and returns whether the call was new (no previous entry). */
  registerToolCall(toolCall: ToolCallBlockData): boolean {
    const existing = this._activeToolCalls.get(toolCall.id);
    this._activeToolCalls.set(toolCall.id, toolCall);
    this.pendingToolCallFlushIds.delete(toolCall.id);
    this._streamingToolCallArguments.delete(toolCall.id);
    const existingComponent = this._pendingToolComponents.get(toolCall.id);
    if (existingComponent !== undefined) {
      existingComponent.updateToolCall(toolCall);
    } else if (existing === undefined) {
      this.finalizeLiveTextBuffers('tool');
      if (toolCall.name !== 'Agent') {
        this.onToolCallStart(toolCall);
      }
    }
    this.refreshActivityToolLabel(toolCall);
    return existing === undefined;
  }

  /** Accumulates a streaming tool-call argument delta. */
  accumulateToolCallDelta(
    id: string,
    eventName: string | undefined,
    argumentsPart: string | null | undefined,
  ): void {
    const existing = this._streamingToolCallArguments.get(id);
    const argumentsText = appendStreamingArgsPreview(existing?.argumentsText, argumentsPart);
    const name = eventName ?? existing?.name ?? this._activeToolCalls.get(id)?.name ?? 'Tool';
    const startedAtMs = existing?.startedAtMs ?? Date.now();
    this._streamingToolCallArguments.set(id, { name, argumentsText, startedAtMs });
    this.pendingToolCallFlushIds.add(id);
  }

  /** Completes a tool call: delivers the result and removes tracking state.
   *  Returns the matched ToolCallBlockData, or undefined if no call was tracked. */
  completeToolResult(toolCallId: string, result: ToolResultBlockData): ToolCallBlockData | undefined {
    const matchedCall = this._activeToolCalls.get(toolCallId);
    if (matchedCall !== undefined) {
      this.onToolCallEnd(toolCallId, result);
    }
    this._activeToolCalls.delete(toolCallId);
    this._streamingToolCallArguments.delete(toolCallId);
    return matchedCall;
  }

  /** Marks in-flight tool calls as truncated when a step hits max_tokens.
   *  Returns the count of tool calls that were truncated. */
  markStepTruncated(turnId: string, step: number): number {
    let count = 0;
    for (const toolCall of this._activeToolCalls.values()) {
      if (toolCall.result !== undefined) continue;
      if (toolCall.streamingArguments === undefined) continue;
      if (toolCall.turnId !== turnId) continue;
      if (toolCall.step !== step) continue;
      toolCall.truncated = true;
      const component = this._pendingToolComponents.get(toolCall.id);
      if (component !== undefined) {
        component.updateToolCall(toolCall);
      }
      count += 1;
    }
    this._streamingToolCallArguments.clear();
    return count;
  }

  /** Tears down replay-specific state after session history has been rendered. */
  cleanupAfterReplay(completedToolCallIds: Set<string>): void {
    this.finishActivity();
    this._activeToolCalls.clear();
    for (const toolCallId of completedToolCallIds) {
      this._pendingToolComponents.delete(toolCallId);
    }
    this._pendingAgentGroup = null;
    this._pendingReadGroup = null;
    this._pendingReadGroupComponents.clear();
    this._currentTurnId = undefined;
    this._currentStep = 0;
    this._streamingToolCallArguments.clear();
    this.pendingToolCallFlushIds.clear();
    this.host.state.ui.requestRender();
  }

  // ---------------------------------------------------------------------------
  // Dispose helpers (moved from EddyTUI)
  // ---------------------------------------------------------------------------

  disposeActiveThinkingComponent(): void {
    if (this._activeThinkingComponent !== undefined) {
      this._activeThinkingComponent.dispose();
      this._activeThinkingComponent = undefined;
    }
  }

  disposeAndClearPendingToolComponents(): void {
    for (const component of this._pendingToolComponents.values()) {
      if (hasDispose(component)) component.dispose();
    }
    this._pendingToolComponents.clear();
  }

  disposeActiveCompactionBlock(): void {
    if (this._activeCompactionBlock !== undefined) {
      this._activeCompactionBlock.dispose();
      this._activeCompactionBlock = undefined;
    }
  }

  // ---------------------------------------------------------------------------
  // Flush control
  // ---------------------------------------------------------------------------

  hasPending(): boolean {
    return (
      this.pendingAssistantFlush ||
      this.pendingThinkingFlush ||
      this.pendingToolCallFlushIds.size > 0
    );
  }

  clearFlushTimer(): void {
    if (this.flushTimer === undefined) return;
    clearTimeout(this.flushTimer);
    this.flushTimer = undefined;
  }

  private clearFlushTimerIfIdle(): void {
    if (this.hasPending()) return;
    this.clearFlushTimer();
  }

  discardPending(): void {
    this.clearFlushTimer();
    this.pendingAssistantFlush = false;
    this.pendingThinkingFlush = false;
    this.pendingToolCallFlushIds.clear();
  }

  scheduleFlush(): void {
    if (!this.hasPending()) return;
    if (this.flushTimer !== undefined) return;
    const delay =
      this.lastFlushAt === undefined
        ? 0
        : Math.max(0, STREAMING_UI_FLUSH_MS - (Date.now() - this.lastFlushAt));
    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined;
      this.flush();
    }, delay);
  }

  flushNow(): void {
    this.clearFlushTimer();
    this.flush();
  }

  private flush(): void {
    if (!this.hasPending()) return;
    this.lastFlushAt = Date.now();
    const shouldFlushThinking = this.pendingThinkingFlush;
    const shouldFlushAssistant = this.pendingAssistantFlush;
    const toolCallIds = [...this.pendingToolCallFlushIds];
    this.pendingThinkingFlush = false;
    this.pendingAssistantFlush = false;
    this.pendingToolCallFlushIds.clear();

    if (shouldFlushThinking && this._thinkingDraft.length > 0) {
      this.onThinkingUpdate(this._thinkingDraft);
    }
    if (shouldFlushAssistant) {
      this.onStreamingTextUpdate(this._assistantDraft);
    }
    for (const id of toolCallIds) {
      this.flushToolCallPreview(id);
    }
  }

  markAssistantDirty(): void {
    this.pendingAssistantFlush = true;
  }

  markThinkingDirty(): void {
    this.pendingThinkingFlush = true;
  }

  // ---------------------------------------------------------------------------
  // Text streaming
  // ---------------------------------------------------------------------------

  flushThinkingToTranscript(nextMode: LivePaneState['mode'] = 'idle'): void {
    this.flushNow();
    this._thinkingDraft = '';
    this.onThinkingEnd();
    this.host.patchLivePane({ mode: nextMode });
  }

  finalizeAssistantStream(): void {
    this.flushNow();
    if (this._streamingBlock !== null) {
      this.onStreamingTextEnd();
    }
    this._assistantDraft = '';
    this.host.updateActivityPane();
    this.host.state.ui.requestRender();
  }

  resetLiveText(): void {
    this.pendingAssistantFlush = false;
    this.pendingThinkingFlush = false;
    this.clearFlushTimerIfIdle();
    this._assistantDraft = '';
    this._streamingBlock = null;
    this._thinkingDraft = '';
    this.disposeActiveThinkingComponent();
  }

  resetToolUi(): void {
    this.pendingToolCallFlushIds.clear();
    this.clearFlushTimerIfIdle();
    this._streamingToolCallArguments.clear();
    this.disposeAndClearPendingToolComponents();
    this._pendingAgentGroup = null;
    this._pendingReadGroup = null;
  }

  resetToolCallState(): void {
    this._activeToolCalls.clear();
  }

  finalizeLiveTextBuffers(nextMode: LivePaneState['mode'] = 'idle'): void {
    this.flushThinkingToTranscript(nextMode);
    this.finalizeAssistantStream();
  }

  finalizeTurn(sendQueued: (item: QueuedMessage) => void): void {
    const { state } = this.host;
    if (state.appState.streamingPhase === 'idle') return;
    this.host.deferUserMessages = false;
    const completedTurnKey =
      this._currentTurnId ?? `local:${String(state.appState.streamingStartTime)}`;
    this.finalizeLiveTextBuffers('idle');
    this.resetToolCallState();
    this._currentTurnId = undefined;
    this._lastThinking = undefined;
    this.finishActivity();

    const next = this.host.shiftQueuedMessage();
    if (next !== undefined) {
      this.host.setAppState({ streamingPhase: 'idle' });
      this.host.resetLivePane();
      setTimeout(() => {
        sendQueued(next);
      }, 0);
      return;
    }

    this.host.setAppState({ streamingPhase: 'idle' });
    this.host.resetLivePane();
    this.host.onTurnCompleted();
    this.host.transcriptController.commit();
    notifyTerminalOnce(state, `turn-complete:${completedTurnKey}`, {
      title: `${PRODUCT_NAME} 任务完成`,
      body: state.appState.sessionTitle ?? undefined,
    });
  }

  // ---------------------------------------------------------------------------
  // Live Render Hooks
  // ---------------------------------------------------------------------------

  onStreamingTextStart(): void {
    this.noteThinkingAnswer();
    this.finishActivity();
    const { state } = this.host;
    this._pendingAgentGroup = null;
    this._pendingReadGroup = null;
    const entry = {
      id: nextTranscriptId(),
      kind: 'assistant' as const,
      turnId: this._currentTurnId,
      renderMode: 'markdown' as const,
      content: '',
    };
    const component = new AssistantMessageComponent(
      state.theme.markdownTheme,
      state.theme.colors,
    );
    this._streamingBlock = { component, entry };
    this.host.pushTranscriptEntry(entry);
    this.host.transcriptController.registerLiveComponent(component, entry);
    this.host.transcriptController.markPending(component);
    state.transcriptContainer.addChild(component);
    state.ui.requestRender();
  }

  onStreamingTextUpdate(fullText: string): void {
    const block = this._streamingBlock;
    if (block !== null) {
      block.entry.content = fullText;
      block.component.updateContent(fullText);
      this.host.state.ui.requestRender();
    }
  }

  onStreamingTextEnd(): void {
    const block = this._streamingBlock;
    this._streamingBlock = null;
    if (block !== null) {
      this.host.transcriptController.unmarkPending(block.component);
      this.host.transcriptController.commit();
    }
  }

  onThinkingUpdate(fullText: string): void {
    if (fullText.length === 0 && this._activeThinkingComponent === undefined) return;
    const { state } = this.host;
    if (this._activeThinkingComponent === undefined) {
      this._pendingAgentGroup = null;
      this._pendingReadGroup = null;
      const component = new ThinkingComponent(
        fullText,
        state.theme.colors,
        true,
        'live',
        state.ui,
      );
      const entry: TranscriptEntry = {
        id: nextTranscriptId(),
        kind: 'thinking',
        turnId: this._currentTurnId,
        renderMode: 'plain',
        content: fullText,
      };
      this._activeThinkingComponent = component;
      this._thinkingEntry = entry;
      this._lastThinking = { component, entry };
      this.host.pushTranscriptEntry(entry);
      this.host.transcriptController.registerLiveComponent(component, entry);
      this.host.transcriptController.markPending(component);
      if (state.toolOutputExpanded) component.setExpanded(true);
      this.addActivityChild(component);
      this.setActivityLabel('思考中…');
    } else {
      this._activeThinkingComponent.setText(fullText);
      if (this._thinkingEntry !== undefined) {
        this._thinkingEntry.content = fullText;
      }
    }
    state.ui.requestRender();
  }

  /** Add a thinking/tool component to the transcript, hidden behind the run header. */
  private addActivityChild(component: Component): void {
    const { state } = this.host;
    this.ensureActivity();
    state.transcriptContainer.addChild(component);
    collapseInTranscript(state.transcriptContainer, component);
  }

  private ensureActivity(): ActivityGroupComponent {
    if (this._activity !== null) return this._activity.header;
    const { state, transcriptController } = this.host;
    const header = new ActivityGroupComponent(state.theme.colors, state.ui);
    if (state.toolOutputExpanded) header.setExpanded(true);
    const entry: TranscriptEntry = {
      id: nextTranscriptId(),
      kind: 'status',
      turnId: this._currentTurnId,
      renderMode: 'notice',
      content: '',
    };
    this.host.pushTranscriptEntry(entry);
    transcriptController.registerLiveComponent(header, entry);
    transcriptController.markPending(header);
    state.transcriptContainer.addChild(header);
    this._activity = { header, entry };
    this.host.updateActivityPane();
    return header;
  }

  private setActivityLabel(label: string): void {
    this._activity?.header.setLiveLabel(label);
    this.host.state.ui.requestRender();
  }

  private noteActivityToolStart(toolCall: ToolCallBlockData): void {
    if (toolCall.name === 'ExitPlanMode') return;
    // Tools without their own component (e.g. AskUserQuestion) still open a run.
    this.ensureActivity().addTool();
    this._activityToolCallId = toolCall.id;
    this.setActivityLabel(activityToolLabel(toolCall, this.host.state.appState.workDir));
  }

  /** Re-derive the live label when the latest tool's streamed args change (e.g. the pattern arrives after the start). */
  private refreshActivityToolLabel(toolCall: ToolCallBlockData): void {
    const activity = this._activity;
    if (activity === null || toolCall.id !== this._activityToolCallId) return;
    const label = activityToolLabel(toolCall, this.host.state.appState.workDir);
    if (this._activityLabelBeforeApproval !== undefined) {
      this._activityLabelBeforeApproval = label;
      return;
    }
    if (label !== activity.header.currentLabel) this.setActivityLabel(label);
  }

  /** Whether an activity run (thinking/tool header) is currently live. */
  hasLiveActivity(): boolean {
    return this._activity !== null;
  }

  /** Show that the run is waiting on the user's approval for a tool call. */
  noteActivityApprovalPending(toolName: string, fields: object | undefined): void {
    const header = this._activity?.header;
    if (header === undefined) return;
    this._activityLabelBeforeApproval ??= header.currentLabel;
    this.setActivityLabel(`等待你批准：${describeToolAction(toolName, fields)}`);
  }

  noteActivityApprovalDone(): void {
    const previous = this._activityLabelBeforeApproval;
    this._activityLabelBeforeApproval = undefined;
    if (previous !== undefined) this.setActivityLabel(previous);
  }

  /** Drop the current run without finalizing it (its header was cleared away). */
  discardActivity(): void {
    this._activity?.header.dispose();
    this._activity = null;
    this._activityToolCallId = undefined;
    this._activityLabelBeforeApproval = undefined;
    this.host.updateActivityPane();
  }

  finishActivity(): void {
    const activity = this._activity;
    if (activity === null) return;
    this._activity = null;
    this._activityToolCallId = undefined;
    this._activityLabelBeforeApproval = undefined;
    activity.header.finish();
    // A thinking-only run has nothing worth a summary line; keep it behind ctrl+o.
    if (!activity.header.hasTools) {
      collapseInTranscript(this.host.state.transcriptContainer, activity.header);
    }
    activity.entry.content = activity.header.summary();
    this.host.transcriptController.unmarkPending(activity.header);
    this.host.updateActivityPane();
    this.host.state.ui.requestRender();
  }

  private noteThinkingToolCall(toolName: string): void {
    const last = this._lastThinking;
    if (last === undefined) return;
    const current = last.entry.thinkingFollowUp;
    const labels = current?.kind === 'tools' ? current.labels : [];
    this.setThinkingFollowUp(last, { kind: 'tools', labels: [...labels, toolActionLabel(toolName)] });
  }

  private noteThinkingAnswer(): void {
    const last = this._lastThinking;
    if (last === undefined || last.entry.thinkingFollowUp !== undefined) return;
    this.setThinkingFollowUp(last, { kind: 'answer' });
  }

  private setThinkingFollowUp(
    target: { component: ThinkingComponent; entry: TranscriptEntry },
    followUp: ThinkingFollowUp,
  ): void {
    target.entry.thinkingFollowUp = followUp;
    target.component.setFollowUp(followUp);
    this.host.state.ui.requestRender();
  }

  onThinkingEnd(): void {
    if (this._activeThinkingComponent === undefined) return;
    this._activeThinkingComponent.finalize();
    this.host.transcriptController.unmarkPending(this._activeThinkingComponent);
    this.host.transcriptController.commit();
    this._activeThinkingComponent = undefined;
    this._thinkingEntry = undefined;
    this.host.state.ui.requestRender();
  }

  onToolCallStart(toolCall: ToolCallBlockData): void {
    this.noteThinkingToolCall(toolCall.name);
    this.noteActivityToolStart(toolCall);
    if (toolCall.name === 'AskUserQuestion') return;
    if (toolCall.name === 'ReadGroup') {
      this.startReadGroupToolCall(toolCall);
      return;
    }

    const { state } = this.host;
    const tc = new ToolCallComponent(
      toolCall,
      undefined,
      state.theme.colors,
      state.ui,
      state.theme.markdownTheme,
      state.appState.workDir,
    );
    const entry: TranscriptEntry = {
      id: nextTranscriptId(),
      kind: 'tool_call',
      turnId: toolCall.turnId ?? this._currentTurnId,
      renderMode: 'plain',
      content: toolCall.name,
      toolCallData: toolCall,
    };
    this._pendingToolComponents.set(toolCall.id, tc);
    this.host.pushTranscriptEntry(entry);
    this.host.transcriptController.registerLiveComponent(tc, entry);
    this.host.transcriptController.markPending(tc);

    if (state.toolOutputExpanded) tc.setExpanded(true);
    if (state.planExpanded) tc.setPlanExpanded(true);

    if (toolCall.name !== 'Agent') this._pendingAgentGroup = null;
    if (toolCall.name !== 'Read') this._pendingReadGroup = null;

    let handled = this.tryAttachAgentToolCall(toolCall, tc);
    if (!handled) handled = this.tryAttachReadToolCall(toolCall, tc);
    if (!handled) {
      // The plan card is content the user reviews, so it stays visible.
      if (toolCall.name === 'ExitPlanMode') state.transcriptContainer.addChild(tc);
      else this.addActivityChild(tc);
      state.ui.requestRender();
    }

    if (toolCall.name === 'ExitPlanMode' && typeof toolCall.args['plan'] !== 'string') {
      const session = this.host.requireSession();
      void (async () => {
        try {
          const plan = await session.getPlan();
          tc.setPlanInfo(plan === null ? {} : { plan: plan.content, path: plan.path });
        } catch {
          tc.setPlanInfo({});
        }
      })();
    }
  }

  private startReadGroupToolCall(toolCall: ToolCallBlockData): void {
    const { state, transcriptController } = this.host;
    const rgc = new ReadGroupComponent(state.theme.colors, state.ui);
    const entry: TranscriptEntry = {
      id: nextTranscriptId(),
      kind: 'tool_call',
      turnId: toolCall.turnId ?? this._currentTurnId,
      renderMode: 'plain',
      content: toolCall.name,
      toolCallData: toolCall,
    };
    this._pendingReadGroupComponents.set(toolCall.id, rgc);
    this._pendingReadGroup = null;
    this._pendingAgentGroup = null;
    this.host.pushTranscriptEntry(entry);
    transcriptController.registerLiveComponent(rgc, entry);
    transcriptController.markPending(rgc);
    this.addActivityChild(rgc);
    state.ui.requestRender();
  }

  onToolCallEnd(toolCallId: string, result: ToolResultBlockData): void {
    this._lastThinking = undefined;
    if (result.is_error === true) this._activity?.header.addFailure();
    const { state } = this.host;

    const rgc = this._pendingReadGroupComponents.get(toolCallId);
    if (rgc !== undefined) {
      rgc.setResults(parseReadGroupOutput(result.output));
      this.host.transcriptController.unmarkPending(rgc);
      this._pendingReadGroupComponents.delete(toolCallId);
      const entry = this.host.state.transcriptEntries.find((e) => e.toolCallData?.id === toolCallId);
      if (entry?.toolCallData !== undefined) {
        entry.toolCallData.result = result;
      }
      this.host.transcriptController.commit();
      state.ui.requestRender();
      return;
    }

    const matchedCall = this._activeToolCalls.get(toolCallId);
    const tc = this._pendingToolComponents.get(toolCallId);
    if (tc) {
      tc.setResult(result);
      tc.dispose();
      this.host.transcriptController.unmarkPending(tc);
      this._pendingToolComponents.delete(toolCallId);
      const entry = this.host.state.transcriptEntries.find((e) => e.toolCallData?.id === toolCallId);
      if (entry?.toolCallData !== undefined) {
        entry.toolCallData.result = result;
      }
      this.host.transcriptController.commit();
      state.ui.requestRender();
      return;
    }

    if (matchedCall?.name === 'AskUserQuestion') {
      const completed = new ToolCallComponent(
        matchedCall,
        result,
        state.theme.colors,
        state.ui,
        state.theme.markdownTheme,
        state.appState.workDir,
      );
      if (state.toolOutputExpanded) completed.setExpanded(true);
      if (state.planExpanded) completed.setPlanExpanded(true);
      this.addActivityChild(completed);
      state.ui.requestRender();
    }
  }

  setTodoList(todos: readonly TodoItem[]): void {
    const { state } = this.host;
    state.todoPanel.setTodos(todos);
    state.todoPanelContainer.clear();
    if (!state.todoPanel.isEmpty()) {
      state.todoPanelContainer.addChild(state.todoPanel);
    }
    state.ui.requestRender();
  }

  beginCompaction(instruction?: string): void {
    const { state } = this.host;
    if (this._activeCompactionBlock !== undefined) {
      this._activeCompactionBlock.markDone();
      this.host.transcriptController.unmarkPending(this._activeCompactionBlock);
      this._activeCompactionBlock = undefined;
      this._compactionEntry = undefined;
    }
    const block = new CompactionComponent(state.theme.colors, state.ui, instruction);
    const entry: TranscriptEntry = {
      id: nextTranscriptId(),
      kind: 'tool_call',
      turnId: this._currentTurnId,
      renderMode: 'plain',
      content: instruction ?? '压缩上下文',
      compactionData: {},
    };
    this._activeCompactionBlock = block;
    this._compactionEntry = entry;
    this.host.pushTranscriptEntry(entry);
    this.host.transcriptController.registerLiveComponent(block, entry);
    this.host.transcriptController.markPending(block);
    state.transcriptContainer.addChild(block);
    state.ui.requestRender();
  }

  endCompaction(tokensBefore?: number, tokensAfter?: number): void {
    const block = this._activeCompactionBlock;
    const entry = this._compactionEntry;
    if (block === undefined) return;
    block.markDone(tokensBefore, tokensAfter);
    this.host.transcriptController.unmarkPending(block);
    if (entry !== undefined) {
      entry.compactionData = {
        tokensBefore,
        tokensAfter,
        instruction: entry.content,
      };
    }
    this._activeCompactionBlock = undefined;
    this._compactionEntry = undefined;
    this.host.transcriptController.commit();
    this.host.state.ui.requestRender();
  }

  cancelCompaction(): void {
    const block = this._activeCompactionBlock;
    if (block === undefined) return;
    block.markCanceled();
    this.host.transcriptController.unmarkPending(block);
    this._activeCompactionBlock = undefined;
    this._compactionEntry = undefined;
    this.host.transcriptController.commit();
    this.host.state.ui.requestRender();
  }

  // ---------------------------------------------------------------------------
  // Tool call grouping
  // ---------------------------------------------------------------------------

  private flushToolCallPreview(id: string): void {
    const streaming = this._streamingToolCallArguments.get(id);
    if (streaming === undefined) return;
    const toolCall: ToolCallBlockData = {
      id,
      name: streaming.name ?? this._activeToolCalls.get(id)?.name ?? 'Tool',
      args: parseStreamingArgs(streaming.argumentsText),
      streamingArguments: streaming.argumentsText,
      streamingStartedAtMs: streaming.startedAtMs,
      step: this._currentStep,
      turnId: this._currentTurnId,
    };
    this._activeToolCalls.set(id, toolCall);

    if (this._thinkingDraft.length > 0 || this._streamingBlock !== null) {
      this.finalizeLiveTextBuffers('tool');
    }

    const existingComponent = this._pendingToolComponents.get(id);
    if (existingComponent !== undefined) {
      existingComponent.updateToolCall(toolCall);
    } else if (toolCall.name !== 'Agent') {
      this.onToolCallStart(toolCall);
    }
    this.refreshActivityToolLabel(toolCall);
  }

  private tryAttachAgentToolCall(toolCall: ToolCallBlockData, tc: ToolCallComponent): boolean {
    const { state } = this.host;
    if (toolCall.name !== 'Agent') {
      this._pendingAgentGroup = null;
      return false;
    }

    const step = toolCall.step ?? this._currentStep;
    const turnId = toolCall.turnId ?? this._currentTurnId;
    const pending = this._pendingAgentGroup;

    if (pending !== null && (pending.step !== step || pending.turnId !== turnId)) {
      this._pendingAgentGroup = null;
    }

    const cur = this._pendingAgentGroup;
    if (cur === null) {
      this._pendingAgentGroup = { step, turnId, solo: tc };
      this.addActivityChild(tc);
      state.ui.requestRender();
      return true;
    }

    if (cur.group !== undefined) {
      cur.group.attach(toolCall.id, tc);
      return true;
    }

    const solo = cur.solo;
    if (solo === undefined) {
      this._pendingAgentGroup = { step, turnId, solo: tc };
      this.addActivityChild(tc);
      state.ui.requestRender();
      return true;
    }
    const group = this.upgradeSoloAgentToGroup(solo);
    group.attach(toolCall.id, tc);
    this._pendingAgentGroup = { step, turnId, group };
    state.ui.requestRender();
    return true;
  }

  private upgradeSoloAgentToGroup(solo: ToolCallComponent): AgentGroupComponent {
    const { state, transcriptController } = this.host;
    const group = new AgentGroupComponent(state.theme.colors, state.ui);
    const children = state.transcriptContainer.children;
    const idx = children.indexOf(solo);
    if (idx >= 0) {
      children[idx] = group;
      collapseInTranscript(state.transcriptContainer, group);
      state.transcriptContainer.invalidate();
    } else {
      this.addActivityChild(group);
    }
    group.attach(solo.toolCallView.id, solo);
    const entry = transcriptController.findEntryForComponent(solo);
    if (entry !== undefined) {
      transcriptController.registerLiveComponent(group, entry);
      transcriptController.unmarkPending(solo);
    }
    return group;
  }

  private tryAttachReadToolCall(toolCall: ToolCallBlockData, tc: ToolCallComponent): boolean {
    const { state } = this.host;
    if (toolCall.name !== 'Read') {
      this._pendingReadGroup = null;
      return false;
    }

    const step = toolCall.step ?? this._currentStep;
    const turnId = toolCall.turnId ?? this._currentTurnId;
    const pending = this._pendingReadGroup;

    if (pending !== null && (pending.step !== step || pending.turnId !== turnId)) {
      this._pendingReadGroup = null;
    }

    const cur = this._pendingReadGroup;
    if (cur === null) {
      this._pendingReadGroup = { step, turnId, solo: tc };
      this.addActivityChild(tc);
      state.ui.requestRender();
      return true;
    }

    if (cur.group !== undefined) {
      cur.group.attach(toolCall.id, tc);
      return true;
    }

    const solo = cur.solo;
    if (solo === undefined) {
      this._pendingReadGroup = { step, turnId, solo: tc };
      this.addActivityChild(tc);
      state.ui.requestRender();
      return true;
    }
    const group = this.upgradeSoloReadToGroup(solo);
    group.attach(toolCall.id, tc);
    this._pendingReadGroup = { step, turnId, group };
    state.ui.requestRender();
    return true;
  }

  private upgradeSoloReadToGroup(solo: ToolCallComponent): ReadGroupComponent {
    const { state, transcriptController } = this.host;
    const group = new ReadGroupComponent(state.theme.colors, state.ui);
    const children = state.transcriptContainer.children;
    const idx = children.indexOf(solo);
    if (idx >= 0) {
      children[idx] = group;
      collapseInTranscript(state.transcriptContainer, group);
      state.transcriptContainer.invalidate();
    } else {
      this.addActivityChild(group);
    }
    group.attach(solo.toolCallView.id, solo);
    const entry = transcriptController.findEntryForComponent(solo);
    if (entry !== undefined) {
      transcriptController.registerLiveComponent(group, entry);
      transcriptController.unmarkPending(solo);
    }
    return group;
  }
}

function activityToolLabel(toolCall: ToolCallBlockData, workDir: string | undefined): string {
  const action = toolActionLabel(toolCall.name);
  const arg = extractKeyArgument(toolCall.name, toolCall.args, workDir);
  if (arg === null) return `正在${action}…`;
  const short = arg.length > 40 ? `${arg.slice(0, 40)}…` : arg;
  return `正在${action} ${short}…`;
}
