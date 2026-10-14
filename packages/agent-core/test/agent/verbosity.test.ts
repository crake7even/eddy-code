import { join } from 'pathe';
import { describe, expect, it, vi } from 'vitest';
import type { StatResult } from '@eddy-code/jan';
import type { ToolCall } from '@eddy-code/yc';

import { USER_INSTRUCTIONS_REPEAT_INTERVAL } from '../../src/agent/injection/user-instructions';
import { WorkingSetInjector } from '../../src/agent/injection/working-set';
import { loadUserInstructions } from '../../src/profile/context';
import { createFakeJian } from '../tools/fixtures/fake-jian';
import { createCommandJian, testAgent, type TestAgentContext } from './harness/agent';

const ANSWER = 'The requested operation is complete; the result and any remaining limitations are described here.';
function call(name: string, id: string, args: object): ToolCall {
  return { type: 'function', name, id, arguments: JSON.stringify(args) };
}
function reminders(ctx: TestAgentContext, name: string): string[] {
  return ctx.agent.context.history.filter((message) => {
    const origin = message.origin;
    return (origin?.kind === 'injection' && origin.variant === name) ||
      (origin?.kind === 'system_trigger' && origin.name === name);
  }).map((message) => message.content.map((part) => part.type === 'text' ? part.text : '').join(''));
}
function writeJian() {
  return createFakeJian({
    stat: vi.fn().mockResolvedValue({ stMode: 0o040755 }),
    writeText: vi.fn().mockResolvedValue(1),
  });
}

async function prompt(ctx: TestAgentContext) {
  await ctx.rpc.prompt({ input: [{ type: 'text', text: 'Do the requested task' }] });
  return ctx.untilTurnEnd();
}

describe('quiet turn completion', () => {
  it('clears a Write failure after a successful retry', async () => {
    const jian = writeJian();
    vi.mocked(jian.writeText).mockRejectedValueOnce(new Error('temporary write failure'));
    const ctx = testAgent({ jian });
    ctx.configure({ tools: ['Write'] });
    await ctx.rpc.setPermission({ mode: 'yolo' });
    const path = join(ctx.agent.config.cwd, 'notes.md');
    ctx.mockNextResponse(call('Write', 'write_1', { path, content: 'first' }));
    ctx.mockNextResponse(call('Write', 'write_2', { path, content: 'retry' }));
    ctx.mockNextResponse({ type: 'text', text: ANSWER });
    await prompt(ctx);
    expect(ctx.llmCalls).toHaveLength(3);
    expect(reminders(ctx, 'convergence_gate').join('')).not.toContain('A required tool');
  });

  it.each(['Edit', 'Agent'])('clears a %s failure after the same tool succeeds', async (name) => {
    const ctx = testAgent();
    ctx.configure({ tools: [name] });
    await ctx.rpc.setPermission({ mode: 'yolo' });
    let attempts = 0;
    vi.spyOn(ctx.agent.tools, 'loopTools', 'get').mockReturnValue([{
      name,
      description: 'Scripted tool for retry handling',
      parameters: { type: 'object' },
      resolveExecution: () => ({
        approvalRule: name,
        execute: async () => ++attempts === 1
          ? { isError: true, output: 'temporary failure' }
          : { output: 'success' },
      }),
    }]);
    const args = { path: join(ctx.agent.config.cwd, 'notes.md'), subagent_type: 'verify' };
    ctx.mockNextResponse(call(name, 'retry_1', args));
    ctx.mockNextResponse(call(name, 'retry_2', args));
    ctx.mockNextResponse({ type: 'text', text: ANSWER });
    await prompt(ctx);
    expect(ctx.llmCalls).toHaveLength(3);
    expect(reminders(ctx, 'convergence_gate').join('')).not.toContain('A required tool');
  });

  it.each(['git status', 'git diff', 'git log -1', 'rg missing', 'grep missing file',
    'wc missing', 'stat missing', 'diff missing other', 'du missing'])
  ('does not block on a failed read-only query: %s', async (command) => {
    const jian = createCommandJian('');
    vi.mocked(jian.execWithEnv).mockRejectedValue(new Error('query failed'));
    const ctx = testAgent({ jian });
    ctx.configure({ tools: ['Bash'] });
    await ctx.rpc.setPermission({ mode: 'yolo' });
    ctx.mockNextResponse(call('Bash', 'query', { command }));
    ctx.mockNextResponse({ type: 'text', text: ANSWER });
    await prompt(ctx);
    expect(ctx.llmCalls).toHaveLength(2);
    expect(reminders(ctx, 'convergence_gate')).toEqual([]);
  });

  it('reminds about unverified changes only once per turn', async () => {
    const ctx = testAgent();
    ctx.configure();
    ctx.agent.workingSet.touch('src/example.ts', 0);
    for (let i = 0; i < 8; i++) ctx.mockNextResponse({ type: 'text', text: ANSWER });
    await prompt(ctx);
    expect(ctx.llmCalls).toHaveLength(2);
    expect(reminders(ctx, 'convergence_gate').filter((text) => text.includes('unverified changes'))).toHaveLength(1);
  });

  it('reminds about a blocking tool failure only once per turn', async () => {
    const jian = createCommandJian('');
    vi.mocked(jian.execWithEnv).mockRejectedValue(new Error('operation failed'));
    const ctx = testAgent({ jian });
    ctx.configure({ tools: ['Bash'] });
    await ctx.rpc.setPermission({ mode: 'yolo' });
    ctx.mockNextResponse(call('Bash', 'operation', { command: 'run-operation' }));
    for (let i = 0; i < 8; i++) ctx.mockNextResponse({ type: 'text', text: ANSWER });
    await prompt(ctx);
    expect(ctx.llmCalls).toHaveLength(3);
    expect(reminders(ctx, 'convergence_gate').filter((text) => text.includes('A required tool'))).toHaveLength(1);
  });

  it('still retries empty replies, bounded by the existing five reminders', async () => {
    const ctx = testAgent();
    ctx.configure();
    for (let i = 0; i < 8; i++) ctx.mockNextResponse();
    await prompt(ctx);
    expect(ctx.llmCalls).toHaveLength(6);
    expect(reminders(ctx, 'convergence_gate')).toHaveLength(5);
  });

  it('does not treat a failed build followed by a query as exploratory', async () => {
    const jian = createCommandJian('');
    vi.mocked(jian.execWithEnv).mockRejectedValue(new Error('build failed'));
    const ctx = testAgent({ jian });
    ctx.configure({ tools: ['Bash'] });
    await ctx.rpc.setPermission({ mode: 'yolo' });
    ctx.mockNextResponse(call('Bash', 'build_query', { command: 'pnpm run build && git diff' }));
    for (let i = 0; i < 8; i++) ctx.mockNextResponse({ type: 'text', text: ANSWER });
    await prompt(ctx);
    expect(reminders(ctx, 'convergence_gate').join('')).toContain('A required tool');
  });

  it('reminds about failed verification only once per turn', async () => {
    const ctx = testAgent();
    ctx.configure();
    ctx.agent.workingSet.recordVerification('pnpm test', '.', 1, 'failed', 0);
    for (let i = 0; i < 8; i++) ctx.mockNextResponse({ type: 'text', text: ANSWER });
    await prompt(ctx);
    expect(ctx.llmCalls).toHaveLength(2);
    expect(reminders(ctx, 'convergence_gate').filter((text) => text.includes('last verification command failed'))).toHaveLength(1);
  });

  it('reminds about a missing goal TodoList only once per turn', async () => {
    const ctx = testAgent();
    ctx.configure();
    await ctx.agent.goal.createGoal({ objective: 'Do the requested task' });
    // Introduce the goal after the driver selects an ordinary turn, so this
    // test exercises the stop gate rather than the outer autonomous loop.
    vi.spyOn(ctx.agent.goal, 'getGoal').mockReturnValueOnce({ goal: null });
    for (let i = 0; i < 8; i++) ctx.mockNextResponse({ type: 'text', text: ANSWER });
    await prompt(ctx);
    expect(ctx.llmCalls).toHaveLength(2);
    expect(reminders(ctx, 'convergence_gate').filter((text) => text.includes('no TodoList update'))).toHaveLength(1);
  });

  it('resets gate reminder limits on the next user turn', async () => {
    const ctx = testAgent();
    ctx.configure();
    ctx.agent.workingSet.touch('src/example.ts', 0);
    for (let i = 0; i < 4; i++) ctx.mockNextResponse({ type: 'text', text: ANSWER });
    await prompt(ctx);
    await prompt(ctx);
    expect(reminders(ctx, 'convergence_gate').filter((text) => text.includes('unverified changes'))).toHaveLength(2);
  });

  it('does not classify permission rejection as failed verification or a changed file', async () => {
    const ctx = testAgent({ jian: writeJian() });
    ctx.configure({ tools: ['Write'] });
    const path = '/outside/example.ts';
    ctx.mockNextResponse(call('Write', 'rejected', { path, content: 'export {};' }));
    ctx.mockNextResponse({ type: 'text', text: 'I respected the rejected request and left the file unchanged.' });
    await ctx.rpc.prompt({ input: [{ type: 'text', text: 'Write the file' }] });
    await ctx.untilApproval(false);
    await ctx.untilTurnEnd();
    expect(ctx.llmCalls).toHaveLength(2);
    expect(ctx.agent.workingSet.getPaths()).not.toContain(path);
    expect(reminders(ctx, 'convergence_gate')).toEqual([]);
  });

  it('does not record a rejected test command as failed verification', async () => {
    const ctx = testAgent({ jian: createCommandJian('') });
    ctx.configure({ tools: ['Bash'] });
    ctx.mockNextResponse(call('Bash', 'rejected_test', { command: 'pnpm test' }));
    ctx.mockNextResponse({ type: 'text', text: ANSWER });
    await ctx.rpc.prompt({ input: [{ type: 'text', text: 'Run tests' }] });
    await ctx.untilApproval(false);
    await ctx.untilTurnEnd();
    expect(ctx.llmCalls).toHaveLength(2);
    expect(ctx.agent.workingSet.getVerificationCount()).toBe(0);
    expect(reminders(ctx, 'convergence_gate')).toEqual([]);
  });

  it('does not count deduplicated rejected calls as execution failures', async () => {
    const ctx = testAgent({ jian: createCommandJian('') });
    ctx.configure({ tools: ['Bash'] });
    ctx.mockNextResponse(
      call('Bash', 'reject_original', { command: 'pnpm test' }),
      call('Bash', 'reject_duplicate', { command: 'pnpm test' }),
    );
    ctx.mockNextResponse({ type: 'text', text: ANSWER });
    await ctx.rpc.prompt({ input: [{ type: 'text', text: 'Run tests' }] });
    await ctx.untilApproval(false);
    await ctx.untilTurnEnd();
    expect(ctx.llmCalls).toHaveLength(2);
    expect(ctx.agent.workingSet.getVerificationCount()).toBe(0);
    expect(reminders(ctx, 'convergence_gate')).toEqual([]);
  });

  it('injects session memory once at the start rather than on every step', async () => {
    const ctx = testAgent({ jian: createCommandJian('query result') });
    ctx.configure({ tools: ['Bash'] });
    await ctx.rpc.setPermission({ mode: 'yolo' });
    ctx.agent.sessionMemory.recordToolExecution('Read', 'notes.md', false, 1);
    ctx.mockNextResponse(call('Bash', 'query_1', { command: 'git status' }));
    ctx.mockNextResponse(call('Bash', 'query_2', { command: 'git diff' }));
    ctx.mockNextResponse({ type: 'text', text: ANSWER });
    await prompt(ctx);
    expect(reminders(ctx, 'session_memory')).toHaveLength(1);
    expect(reminders(ctx, 'todo_suggested')).toEqual([]);
  });

  it('suggests TodoList only after the first successful write, once per turn', async () => {
    const jian = writeJian();
    const ctx = testAgent({ jian });
    ctx.configure({ tools: ['Write'] });
    await ctx.rpc.setPermission({ mode: 'yolo' });
    ctx.mockNextResponse(call('Write', 'first', { path: join(ctx.agent.config.cwd, 'one.md'), content: 'one' }));
    ctx.mockNextResponse(call('Write', 'second', { path: join(ctx.agent.config.cwd, 'two.md'), content: 'two' }));
    ctx.mockNextResponse({ type: 'text', text: ANSWER });
    await prompt(ctx);
    expect(reminders(ctx, 'todo_suggested')).toHaveLength(1);
  });

  it('does not suggest TodoList after a failed write', async () => {
    const jian = writeJian();
    vi.mocked(jian.writeText).mockRejectedValue(new Error('write failed'));
    const ctx = testAgent({ jian });
    ctx.configure({ tools: ['Write'] });
    await ctx.rpc.setPermission({ mode: 'yolo' });
    ctx.mockNextResponse(call('Write', 'failed', { path: join(ctx.agent.config.cwd, 'notes.md'), content: 'one' }));
    for (let i = 0; i < 8; i++) ctx.mockNextResponse({ type: 'text', text: ANSWER });
    await prompt(ctx);
    expect(reminders(ctx, 'todo_suggested')).toEqual([]);
    expect(ctx.agent.workingSet.getPaths()).toEqual([]);
  });

  it('waits three assistant replies before repeating working-set information', async () => {
    const ctx = testAgent();
    ctx.configure();
    ctx.agent.workingSet.markRead('example.ts', 0);
    const injector = new WorkingSetInjector(ctx.agent);
    await injector.inject();
    for (let i = 0; i < 2; i++) {
      ctx.agent.context.appendMessage({ role: 'assistant', content: [{ type: 'text', text: ANSWER }], toolCalls: [] });
      await injector.inject();
    }
    expect(reminders(ctx, 'working-set')).toHaveLength(1);
    ctx.agent.context.appendMessage({ role: 'assistant', content: [{ type: 'text', text: ANSWER }], toolCalls: [] });
    await injector.inject();
    expect(reminders(ctx, 'working-set')).toHaveLength(2);
  });

  it('reinjects session memory once after successful compaction', async () => {
    const ctx = testAgent();
    ctx.configure();
    ctx.appendExchange(1, 'old one', 'answer one', 20);
    ctx.appendExchange(2, 'old two', 'answer two', 40);
    ctx.appendExchange(3, 'recent', 'recent answer', 120);
    const consume = () => ctx.agent.fullCompaction.shouldInjectSessionSummary();
    expect(consume()).toBe(false);
    const compacted = new Promise<void>((resolve) => ctx.emitter.once('context.apply_compaction', resolve));
    ctx.mockNextResponse({ type: 'text', text: 'Compacted summary.' });
    await ctx.rpc.beginCompaction({ instruction: 'Keep the facts.' });
    await compacted;
    await vi.waitFor(() => expect(consume()).toBe(true));
    expect(consume()).toBe(false);
  });
});


describe('user instruction reminders', () => {
  function instructionAgent(type: 'main' | 'sub' = 'main') {
    const jian = createFakeJian({
      stat: vi.fn(async (path) => {
        if (path === '/home/test/.eddy-code/AGENTS.md') return { stMode: 0o100644 } as StatResult;
        throw new Error('missing');
      }),
      readText: vi.fn().mockResolvedValue('Reply briefly in Chinese.'),
    });
    const ctx = testAgent({ jian, type });
    ctx.configure();
    return ctx;
  }

  async function useRulesInSystemPrompt(ctx: TestAgentContext) {
    const rules = await loadUserInstructions(ctx.agent.jian);
    ctx.agent.config.update({ systemPrompt: `# User Instructions\n\n${rules}` });
  }

  async function userPrompt(ctx: TestAgentContext, text: string) {
    ctx.agent.context.appendUserMessage([{ type: 'text', text }]);
    await ctx.agent.injection.inject();
  }

  it('injects rules missing from the system prompt once, then only after real user prompts', async () => {
    const ctx = instructionAgent();
    await ctx.agent.injection.inject();
    expect(reminders(ctx, 'user_instructions')).toEqual([]);
    await userPrompt(ctx, 'first request');
    await ctx.agent.injection.inject();
    expect(reminders(ctx, 'user_instructions')).toHaveLength(1);
    expect(reminders(ctx, 'user_instructions')[0]).toContain('Reply briefly in Chinese.');
    ctx.agent.context.appendUserMessage([{ type: 'text', text: 'background completion' }], { kind: 'system_trigger', name: 'background' });
    await ctx.agent.injection.inject();
    await userPrompt(ctx, 'keep it brief');
    expect(reminders(ctx, 'user_instructions')).toHaveLength(1);
  });

  it('does not repeat rules already in the system prompt until the refresh interval', async () => {
    const ctx = instructionAgent();
    await useRulesInSystemPrompt(ctx);
    for (let i = 1; i < USER_INSTRUCTIONS_REPEAT_INTERVAL; i++) {
      await userPrompt(ctx, `request ${i}`);
    }
    expect(reminders(ctx, 'user_instructions')).toEqual([]);
    await userPrompt(ctx, 'refresh due');
    expect(reminders(ctx, 'user_instructions')).toHaveLength(1);
    for (let i = 1; i < USER_INSTRUCTIONS_REPEAT_INTERVAL; i++) {
      await userPrompt(ctx, `later ${i}`);
    }
    expect(reminders(ctx, 'user_instructions')).toHaveLength(1);
    await userPrompt(ctx, 'second refresh');
    expect(reminders(ctx, 'user_instructions')).toHaveLength(2);
  });

  it('re-injects immediately when the rules file changes', async () => {
    const ctx = instructionAgent();
    await useRulesInSystemPrompt(ctx);
    await userPrompt(ctx, 'first request');
    expect(reminders(ctx, 'user_instructions')).toEqual([]);
    vi.mocked(ctx.agent.jian.readText).mockResolvedValue('Reply in English.');
    await userPrompt(ctx, 'second request');
    expect(reminders(ctx, 'user_instructions')).toHaveLength(1);
    expect(reminders(ctx, 'user_instructions')[0]).toContain('Reply in English.');
    await userPrompt(ctx, 'third request');
    expect(reminders(ctx, 'user_instructions')).toHaveLength(1);
  });

  it('does not inject user reminders into subagents', async () => {
    const ctx = instructionAgent('sub');
    ctx.agent.context.appendUserMessage([{ type: 'text', text: 'delegated task' }]);
    await ctx.agent.injection.inject();
    expect(reminders(ctx, 'user_instructions')).toEqual([]);
    expect(ctx.agent.jian.readText).not.toHaveBeenCalled();
  });
});
