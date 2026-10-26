import type { Component } from '@earendil-works/pi-tui';

import type { SlashCommandHost } from './dispatch';
import { GoalStatusMessageComponent } from '../components/messages/goal-panel';

// The status panel stays until the user submits their next input.
let activeGoalPanel: { readonly panel: Component; readonly host: SlashCommandHost } | undefined;

// ── Parsing ─────────────────────────────────────────────────────────────

const CONTROL_SUBCOMMANDS = new Set(['pause', 'resume', 'off']);

export type GoalBudgetUnit = 'tokens' | 'turns' | 'seconds' | 'minutes' | 'hours';

const BUDGET_USAGE =
  '用法：`/goal budget tokens 5m`、`/goal budget turns 100` 或 `/goal budget time 30m`。';

const TOKEN_SUFFIX: Record<string, number> = { '': 1, k: 1_000, m: 1_000_000 };
const TIME_SUFFIX: Record<string, GoalBudgetUnit> = { s: 'seconds', m: 'minutes', h: 'hours' };

export type ParsedGoalCommand =
  | { readonly kind: 'status' }
  | { readonly kind: 'pause' }
  | { readonly kind: 'resume' }
  | { readonly kind: 'off' }
  | { readonly kind: 'create'; readonly objective: string; readonly replace: boolean }
  | { readonly kind: 'budget'; readonly value: number; readonly unit: GoalBudgetUnit }
  | { readonly kind: 'error'; readonly message: string; readonly severity?: 'error' | 'hint' };

/**
 * Parse the `/goal` command.
 *
 * Reserved subcommands (`pause`/`resume`/`status`/`replace`/`budget`) are honored
 * as the first token.  Use `/goal -- <objective>` to start a goal whose
 * text begins with a reserved word.  Use `/goaloff` to cancel.
 */
export function parseGoalCommand(rawArgs: string): ParsedGoalCommand {
  const args = rawArgs.trim();
  if (args.length === 0 || args === 'status') return { kind: 'status' };

  const tokens = args.split(/\s+/);
  const first = tokens[0];
  if (first !== undefined && CONTROL_SUBCOMMANDS.has(first) && tokens.length === 1) {
    return { kind: first as 'pause' | 'resume' | 'off' };
  }
  if (first === 'budget') return parseBudget(tokens.slice(1));

  let index = 0;
  let replace = false;
  if (tokens[index] === 'replace') {
    replace = true;
    index += 1;
  }
  // `--` ends subcommand parsing so an objective can begin with a reserved word
  if (tokens[index] === '--') {
    index += 1;
  }

  const objective = tokens.slice(index).join(' ').trim();
  if (objective.length === 0) {
    return {
      kind: 'error',
      severity: 'hint',
      message: '请提供目标描述，例如 `/goal 实现登录功能`。',
    };
  }
  return { kind: 'create', objective, replace };
}

function parseBudget(tokens: readonly string[]): ParsedGoalCommand {
  const [kind, raw] = tokens;
  if (tokens.length !== 2 || kind === undefined || raw === undefined) {
    return { kind: 'error', severity: 'hint', message: BUDGET_USAGE };
  }
  const match = /^(\d+(?:\.\d+)?)([a-z]*)$/i.exec(raw);
  const amount = match === null ? Number.NaN : Number(match[1]);
  const suffix = (match?.[2] ?? '').toLowerCase();

  if (kind === 'tokens' || kind === 'turns') {
    const multiplier = kind === 'tokens' ? TOKEN_SUFFIX[suffix] : suffix === '' ? 1 : undefined;
    const value = multiplier === undefined ? Number.NaN : Math.round(amount * multiplier);
    if (Number.isSafeInteger(value) && value > 0) return { kind: 'budget', value, unit: kind };
  } else if (kind === 'time') {
    const unit = TIME_SUFFIX[suffix];
    if (unit !== undefined && amount > 0) return { kind: 'budget', value: amount, unit };
  }
  return { kind: 'error', severity: 'hint', message: BUDGET_USAGE };
}

// ── Command handler ─────────────────────────────────────────────────────

export async function handleGoalCommand(host: SlashCommandHost, args: string): Promise<void> {
  const parsed = parseGoalCommand(args);
  switch (parsed.kind) {
    case 'error':
      if (parsed.severity === 'hint') host.showStatus(parsed.message);
      else host.showError(parsed.message);
      return;
    case 'status':
      await showGoalStatus(host);
      return;
    case 'pause':
      await pauseGoal(host);
      return;
    case 'resume':
      await resumeGoal(host);
      return;
    case 'off':
      await handleGoalOffCommand(host);
      return;
    case 'create':
      await createGoal(host, parsed);
      return;
    case 'budget':
      await setGoalBudget(host, parsed);
      return;
  }
}

// ── Subcommand implementations ──────────────────────────────────────────

async function createGoal(host: SlashCommandHost, parsed: ParsedGoalCommand & { kind: 'create' }): Promise<void> {
  const session = host.session;
  if (session === undefined) {
    host.showError('没有活跃的会话。');
    return;
  }

  try {
    await session.createGoal(parsed.objective, { replace: parsed.replace });
    host.showStatus(`🎯 目标已设置：${parsed.objective}`);

    // Auto-start: send the objective as user input to begin execution
    if (host.state.appState.streamingPhase === 'idle') {
      host.sendQueuedMessage(session, { text: parsed.objective, agentId: undefined });
    } else {
      host.state.queuedMessages.push({ text: parsed.objective, agentId: undefined });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    host.showError(`创建目标失败：${message}`);
  }
}

async function setGoalBudget(
  host: SlashCommandHost,
  parsed: ParsedGoalCommand & { kind: 'budget' },
): Promise<void> {
  const session = host.session;
  if (session === undefined) {
    host.showError('没有活跃的会话。');
    return;
  }

  try {
    const result = await session.getGoal();
    if (result.goal === null) {
      host.showStatus('🎯 当前没有目标。先用 `/goal <目标描述>` 设置目标，再设置预算。');
      return;
    }

    await session.setGoalBudget(parsed.value, parsed.unit);
    const hint = result.goal.status === 'blocked' ? '使用 `/goal resume` 继续。' : '';
    host.showStatus(`🎯 预算已更新。${hint}`);
    await showGoalStatus(host);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    host.showError(`设置预算失败：${message}`);
  }
}

async function pauseGoal(host: SlashCommandHost): Promise<void> {
  const session = host.session;
  if (session === undefined) {
    host.showError('没有活跃的会话。');
    return;
  }

  try {
    const result = await session.getGoal();
    if (result.goal === null) {
      host.showStatus('🎯 当前没有激活的目标。');
      return;
    }

    await session.updateGoalStatus('paused');
    host.showStatus('🎯 目标已暂停。使用 `/goal resume` 恢复。');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    host.showError(`暂停目标失败：${message}`);
  }
}

async function resumeGoal(host: SlashCommandHost): Promise<void> {
  const session = host.session;
  if (session === undefined) {
    host.showError('没有活跃的会话。');
    return;
  }

  try {
    const result = await session.getGoal();
    if (result.goal === null) {
      host.showStatus('🎯 没有可恢复的目标。使用 `/goal <指令>` 设置新目标。');
      return;
    }

    await session.updateGoalStatus('active');
    host.showStatus('🎯 目标已恢复。');

    // Resume execution
    if (host.state.appState.streamingPhase === 'idle') {
      host.sendQueuedMessage(session, { text: '继续执行当前目标。', agentId: undefined });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    host.showError(`恢复目标失败：${message}`);
  }
}

export async function handleGoalOffCommand(host: SlashCommandHost): Promise<void> {
  const session = host.session;
  if (session === undefined) {
    host.showError('没有活跃的会话。');
    return;
  }

  try {
    const result = await session.getGoal();
    if (result.goal === null) {
      host.showStatus('🎯 当前没有激活的目标。');
      return;
    }

    await session.cancelGoal();
    host.showStatus('🎯 目标已取消。');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    host.showError(`取消目标失败：${message}`);
  }
}

async function showGoalStatus(host: SlashCommandHost): Promise<void> {
  const session = host.session;
  if (session === undefined) {
    host.showStatus('🎯 当前没有活跃的会话。');
    return;
  }

  try {
    const result = await session.getGoal();
    dismissGoalStatusPanel();

    const panel = new GoalStatusMessageComponent(result.goal, host.state.theme.colors);
    host.state.transcriptContainer.addChild(panel);
    activeGoalPanel = { panel, host };
    host.state.ui.requestRender();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    host.showError(`获取目标状态失败：${message}`);
  }
}

/** Removes the `/goal` status panel, if one is showing. Called on every input submit. */
export function dismissGoalStatusPanel(): void {
  if (activeGoalPanel === undefined) return;
  const { panel, host } = activeGoalPanel;
  activeGoalPanel = undefined;
  host.state.transcriptContainer.removeChild(panel);
  host.state.ui.requestRender();
}
