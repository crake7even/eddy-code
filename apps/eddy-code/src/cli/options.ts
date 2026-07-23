export type UIMode = 'shell' | 'print';
export type PromptOutputFormat = 'text' | 'stream-json';

export interface CLIOptions {
  session: string | undefined;
  continue: boolean;
  yolo: boolean;
  auto: boolean;
  plan: boolean;
  model: string | undefined;
  outputFormat: PromptOutputFormat | undefined;
  prompt: string | undefined;
  skillsDirs: string[];
}

export interface ValidatedOptions {
  options: CLIOptions;
  uiMode: UIMode;
}

export class OptionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OptionConflictError';
  }
}

export function validateOptions(opts: CLIOptions): ValidatedOptions {
  const prompt = opts.prompt;
  const promptMode = prompt !== undefined;
  if (promptMode && prompt.trim().length === 0) {
    throw new OptionConflictError('Prompt cannot be empty.');
  }
  if (opts.model !== undefined && opts.model.trim().length === 0) {
    throw new OptionConflictError('Model cannot be empty.');
  }
  if (!promptMode && opts.outputFormat !== undefined) {
    throw new OptionConflictError('Output format is only supported in prompt mode.');
  }
  if (promptMode && opts.yolo) {
    throw new OptionConflictError('--prompt cannot be used with --yolo.');
  }
  if (promptMode && opts.auto) {
    throw new OptionConflictError('--prompt cannot be used with --auto.');
  }
  if (promptMode && opts.plan) {
    throw new OptionConflictError('--prompt cannot be used with --plan.');
  }
  if (promptMode && opts.session === '') {
    throw new OptionConflictError('Prompt mode cannot use --session without an id.');
  }
  if (opts.continue && opts.session !== undefined) {
    throw new OptionConflictError('--continue cannot be used with --session.');
  }
  if (opts.yolo && opts.auto) {
    throw new OptionConflictError('--yolo cannot be used with --auto.');
  }
  if (!promptMode && (opts.continue || opts.session !== undefined) && opts.yolo) {
    throw new OptionConflictError('--yolo cannot be used with --continue or --session.');
  }
  if (!promptMode && (opts.continue || opts.session !== undefined) && opts.auto) {
    throw new OptionConflictError('--auto cannot be used with --continue or --session.');
  }
  if (!promptMode && (opts.continue || opts.session !== undefined) && opts.plan) {
    throw new OptionConflictError('--plan cannot be used with --continue or --session.');
  }
  return { options: opts, uiMode: promptMode ? 'print' : 'shell' };
}
