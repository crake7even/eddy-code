import { loadUserInstructions } from '../../profile/context';
import { isRealUserPrompt, type ContextMessage } from '../context';
import { DynamicInjector } from './injector';

/** Keep global user rules visible after each real user request, including steer. */
export class UserInstructionsInjector extends DynamicInjector {
  protected readonly injectionVariant = 'user_instructions';
  private lastUserPrompt: ContextMessage | undefined;

  override onContextClear(): void {
    super.onContextClear();
    this.lastUserPrompt = undefined;
  }

  protected async getInjection(): Promise<string | undefined> {
    if (this.agent.type !== 'main') return undefined;
    const prompt = this.agent.context.history.findLast(isRealUserPrompt);
    if (prompt === undefined || prompt === this.lastUserPrompt) return undefined;
    this.lastUserPrompt = prompt;
    const instructions = await loadUserInstructions(this.agent.jian);
    if (instructions.length === 0) return undefined;
    return [
      '## User Instructions',
      'These are direct user instructions. Follow them over conflicting default rules',
      'or CONTRACT requirements; safety and permission restrictions still apply.',
      '',
      instructions,
    ].join('\n');
  }
}
