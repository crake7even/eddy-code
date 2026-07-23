import type {
  ApprovalRequest,
  ApprovalResponse,
  QuestionRequest,
  QuestionResult,
} from '@eddy-code/agent-core';

// Event union plus shared fields/payloads used across event families.
export type { EddyErrorPayload, Event } from '@eddy-code/agent-core';

export { MCP_OAUTH_AUTHORIZATION_URL_TOOL_UPDATE } from '@eddy-code/agent-core';

// Session lifecycle/status events and their status payload.
export type {
  AgentStatusUpdatedEvent,
  SessionMetaUpdatedEvent,
  SkillActivatedEvent,
  ErrorEvent,
  WarningEvent,
  UsageStatus,
} from '@eddy-code/agent-core';

// Turn and step lifecycle events plus the turn-ending reason enum.
export type {
  TurnStartedEvent,
  TurnEndedEvent,
  TurnStepStartedEvent,
  TurnStepCompletedEvent,
  TurnStepRetryingEvent,
  TurnStepInterruptedEvent,
  TurnEndReason,
} from '@eddy-code/agent-core';

// Streaming content and hook-result events.
export type {
  AssistantDeltaEvent,
  HookResultEvent,
  ThinkingDeltaEvent,
} from '@eddy-code/agent-core';

// Tool-call events and incremental progress payloads.
export type {
  ToolCallStartedEvent,
  ToolCallDeltaEvent,
  ToolProgressEvent,
  ToolResultEvent,
  ToolCallRequest,
  ToolCallResponse,
  ToolUpdate,
  McpOAuthAuthorizationUrlUpdateData,
} from '@eddy-code/agent-core';

// MCP tool-list and server status events.
export type {
  ToolListUpdatedEvent,
  ToolListUpdatedReason,
  McpServerStatusEvent,
  McpServerStatusPayload,
} from '@eddy-code/agent-core';

// Approval reverse-RPC request and response/display payloads.
export type {
  ApprovalRequest,
  ApprovalDecision,
  ApprovalScope,
  ApprovalResponse,
  ToolInputDisplay,
} from '@eddy-code/agent-core';

// Question reverse-RPC request and answer payloads.
export type {
  QuestionRequest,
  QuestionItem,
  QuestionOption,
  QuestionAnswerMethod,
  QuestionAnswers,
  QuestionResponse,
  QuestionResult,
} from '@eddy-code/agent-core';

// Subagent lifecycle events.
export type {
  SubagentSpawnedEvent,
  SubagentCompletedEvent,
  SubagentFailedEvent,
} from '@eddy-code/agent-core';

// Compaction lifecycle events and compaction result payload.
export type {
  CompactionStartedEvent,
  CompactionBlockedEvent,
  CompactionCancelledEvent,
  CompactionCompletedEvent,
  CompactionResult,
} from '@eddy-code/agent-core';

// Background task lifecycle events emitted by the BPM. Covers both
// bash (`bash-*`) and agent (`agent-*`) tasks under one wire format.
export type {
  BackgroundTaskStartedEvent,
  BackgroundTaskUpdatedEvent,
  BackgroundTaskTerminatedEvent,
} from '@eddy-code/agent-core';

export type { CronFiredEvent, CronJobOrigin, CronMissedOrigin } from '@eddy-code/agent-core';
export type { GoalUpdatedEvent } from '@eddy-code/agent-core';

export type MaybePromise<T> = T | Promise<T>;

export type ApprovalHandler = (request: ApprovalRequest) => MaybePromise<ApprovalResponse>;

export type QuestionHandler = (request: QuestionRequest) => MaybePromise<QuestionResult>;
