import { toolActionLabel } from './tool-labels';

const SUBJECT_KEYS = ['command', 'path', 'file_path', 'url', 'query', 'pattern'] as const;
const MAX_SUBJECT_LENGTH = 80;

interface ApprovalOutcome {
  readonly decision: 'approved' | 'rejected' | 'cancelled';
  readonly scope?: 'session' | undefined;
  readonly feedback?: string | undefined;
}

/**
 * One-line transcript notice for an approval decision, in plain Chinese,
 * e.g. `已批准：运行命令 ls -la`. `fields` is the tool's input display (live)
 * or its call arguments (replay); both carry the same subject keys.
 */
export function approvalNoticeText(
  toolName: string,
  fields: object | undefined,
  outcome: ApprovalOutcome,
): string {
  const verdict =
    outcome.decision === 'approved'
      ? outcome.scope === 'session'
        ? '已批准（当前会话）'
        : '已批准'
      : outcome.decision === 'rejected'
        ? '已拒绝'
        : '已取消';
  let text = `${verdict}：${describeToolAction(toolName, fields)}`;
  if (outcome.feedback !== undefined && outcome.feedback.length > 0) {
    text += ` — "${outcome.feedback}"`;
  }
  return text;
}

/** Plain phrase for a tool call, e.g. `运行命令 ls -la`. */
export function describeToolAction(toolName: string, fields: object | undefined): string {
  const subject = approvalSubject(fields);
  const action = toolActionLabel(toolName);
  return subject === undefined ? action : `${action} ${subject}`;
}

function approvalSubject(fields: object | undefined): string | undefined {
  if (fields === undefined) return undefined;
  const record = fields as Record<string, unknown>;
  for (const key of SUBJECT_KEYS) {
    const value = record[key];
    if (typeof value !== 'string' || value.trim().length === 0) continue;
    const oneLine = value.replaceAll(/\s+/g, ' ').trim();
    return oneLine.length > MAX_SUBJECT_LENGTH
      ? `${oneLine.slice(0, MAX_SUBJECT_LENGTH)}…`
      : oneLine;
  }
  return undefined;
}
