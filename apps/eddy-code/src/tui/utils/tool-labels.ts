import { decodeMcpToolName } from './mcp-tool-name';

// Plain-language Chinese verb phrases for tool calls, shared by the thinking
// summary line and the approval panel so both describe actions the same way.
const TOOL_ACTIONS: Record<string, string> = {
  Read: '读取文件',
  ReadGroup: '读取文件',
  ReadMediaFile: '读取文件',
  Write: '写入文件',
  Edit: '修改文件',
  Bash: '运行命令',
  Glob: '查找文件',
  Grep: '查找文件',
  LSP: '分析代码',
  FetchURL: '打开网址',
  WebSearch: '上网搜索',
  Agent: '派子助手',
  WolfPack: '派子助手',
  Skill: '调用技能',
  MakeSkillPlan: '设计技能',
  MakeSkillApply: '安装技能',
  MemoryWrite: '更新记忆',
  MemoryEdit: '更新记忆',
  MemoryLookup: '查找记忆',
  MemoryConsolidatePlan: '整理记忆',
  MemoryConsolidateApply: '整理记忆',
  TodoList: '更新待办',
  SetTodoList: '更新待办',
  AskUserQuestion: '向你提问',
  EnterPlanMode: '进入计划模式',
  ExitPlanMode: '提交计划',
  TaskStop: '停止任务',
  TaskList: '查看任务',
  TaskOutput: '查看任务',
  CreateGoal: '更新目标',
  UpdateGoal: '更新目标',
  GetGoal: '查看目标',
  SetGoalBudget: '更新目标',
  WriteGoalNote: '更新目标',
};

const MAX_LISTED_ACTIONS = 3;

export function toolActionLabel(toolName: string): string {
  const known = TOOL_ACTIONS[toolName];
  if (known !== undefined) return known;
  const mcp = decodeMcpToolName(toolName);
  return `使用 ${mcp?.toolName ?? toolName}`;
}

/** Dedupe action labels, keep first-seen order, and cap the list. */
export function summarizeToolActions(labels: readonly string[]): string {
  const unique = [...new Set(labels)];
  if (unique.length <= MAX_LISTED_ACTIONS) return unique.join('、');
  const shown = unique.slice(0, MAX_LISTED_ACTIONS).join('、');
  return `${shown}等 ${String(unique.length)} 项`;
}

const APPROVAL_QUESTIONS: Record<string, string> = {
  Bash: '要在终端运行这条命令，可以吗？',
  Read: '要读取这个文件，可以吗？',
  ReadMediaFile: '要读取这个文件，可以吗？',
  Write: '要写入（新建或覆盖）这个文件，可以吗？',
  Edit: '要修改这个文件，可以吗？',
  Glob: '要在这些位置查找文件，可以吗？',
  Grep: '要在这些位置查找文件，可以吗？',
  FetchURL: '要打开这个网址，可以吗？',
  WebSearch: '要上网搜索，可以吗？',
  Agent: '要派一个子助手去处理，可以吗？',
  WolfPack: '要派一组子助手去处理，可以吗？',
  MakeSkillApply: '要安装一个新技能（以后每次都会加载），可以吗？',
  MemoryWrite: '要修改记忆，可以吗？',
  MemoryEdit: '要修改记忆，可以吗？',
  MemoryConsolidateApply: '要修改记忆，可以吗？',
  TaskStop: '是否停止此任务？',
  ExitPlanMode: '是否按此计划构建？',
};

/** Plain-language question shown at the top of the approval panel. */
export function toolApprovalQuestion(toolName: string): string {
  const known = APPROVAL_QUESTIONS[toolName];
  if (known !== undefined) return known;
  const mcp = decodeMcpToolName(toolName);
  return `要使用工具 ${mcp?.toolName ?? toolName}，可以吗？`;
}

const SESSION_APPROVAL_LABELS: Record<string, string> = {
  FetchURL: '本会话都允许打开这个网站',
  WebSearch: '本会话都允许搜索',
  Bash: '本会话都允许这条命令',
  Read: '本会话都允许操作这个文件',
  ReadMediaFile: '本会话都允许操作这个文件',
  Write: '本会话都允许操作这个文件',
  Edit: '本会话都允许操作这个文件',
};

/** Label for the approve-for-session choice, matching each tool's rule scope. */
export function sessionApprovalLabel(toolName: string): string {
  return SESSION_APPROVAL_LABELS[toolName] ?? '本会话都允许这类操作';
}
