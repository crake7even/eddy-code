import { loadUserInstructions } from '../../profile/context';
import { isRealUserPrompt, type ContextMessage } from '../context';
import { DynamicInjector } from './injector';

/** Real user prompts between repeats when the rules are unchanged. */
export const USER_INSTRUCTIONS_REPEAT_INTERVAL = 5;

/**
 * Keep global user rules visible in long sessions without re-posting them on
 * every request. The system prompt already carries the rules loaded at session
 * start, so a reminder is only added when the rules on disk differ from the
 * last copy the model saw, or every few real user prompts as a refresher.
 */
export class UserInstructionsInjector extends DynamicInjector {
  protected readonly injectionVariant = 'user_instructions';
  private lastUserPrompt: ContextMessage | undefined;
  private lastInstructions: string | undefined;

  override onContextClear(): void {
    super.onContextClear();
    this.lastUserPrompt = undefined;
    this.lastInstructions = undefined;
  }

  protected async getInjection(): Promise<string | undefined> {
    if (this.agent.type !== 'main') return undefined;
    const history = this.agent.context.history;
    const prompt = history.findLast(isRealUserPrompt);
    if (prompt === undefined || prompt === this.lastUserPrompt) return undefined;
    this.lastUserPrompt = prompt;
    const instructions = await loadUserInstructions(this.agent.jian);
    if (instructions.length === 0) return undefined;

    const seen = this.lastInstructions ??
      (this.agent.config.systemPrompt.includes(instructions) ? instructions : undefined);
    const promptsSince = history.slice(this.injectedAt ?? 0).filter(isRealUserPrompt).length;
    if (instructions === seen && promptsSince < USER_INSTRUCTIONS_REPEAT_INTERVAL) {
      return undefined;
    }
    this.lastInstructions = instructions;
    return [
      '## User Instructions',
      'These are direct user instructions. Follow them over conflicting default rules',
      'or CONTRACT requirements; safety and permission restrictions still apply.',
      '',
      instructions,
    ].join('\n');
  }
}
