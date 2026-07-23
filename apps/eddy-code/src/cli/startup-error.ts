import { EDDY_ERROR_INFO, isEddyError } from '@eddy-code/sdk';
import { chalkStderr } from 'chalk';

import { STARTUP_ERROR_COLOR } from '#/constant/startup-error';

export interface StartupErrorFormatOptions {
  readonly errorStyle?: (text: string) => string;
  readonly operation?: string;
}

function formatUnknownErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function formatStartupError(
  error: unknown,
  options: StartupErrorFormatOptions = {},
): string {
  const errorStyle = options.errorStyle ?? chalkStderr.hex(STARTUP_ERROR_COLOR);

  if (!isEddyError(error)) {
    const operation = options.operation ?? 'start shell';
    return `${errorStyle(`错误：${operation} 失败：${formatUnknownErrorMessage(error)}`)}\n`;
  }

  const info = EDDY_ERROR_INFO[error.code];
  const lines = [
    errorStyle(`错误：${info.title}`),
    '',
    errorStyle('消息：'),
    errorStyle(error.message),
  ];

  return `${lines.join('\n')}\n`;
}
