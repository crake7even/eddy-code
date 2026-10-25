/**
 * Shell command risk classification.
 *
 * Used where nobody is available to approve a command (auto permission
 * mode). It is a heuristic over the literal command text: it catches the
 * common ways a prompt-injected agent would exfiltrate credentials or
 * destroy data, not deliberately obfuscated commands built from variables.
 */

import { isSensitiveFile } from './sensitive';

export type ShellRiskCategory =
  | 'privilege-escalation'
  | 'destructive'
  | 'network-egress'
  | 'remote-code'
  | 'sensitive-access';

export interface ShellCommandRisk {
  readonly category: ShellRiskCategory;
  readonly detail: string;
}

const WRAPPERS = new Set(['command', 'builtin', 'exec', 'nohup', 'time', 'xargs', 'env']);
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh', 'fish']);
const REMOTE_TOOLS = new Set(['nc', 'ncat', 'netcat', 'socat', 'telnet', 'ssh', 'scp', 'sftp', 'ftp']);
const CURL_UPLOAD_FLAGS = new Set(['-d', '-F', '-T', '--form', '--upload-file', '--json']);
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SENSITIVE_PATH_FRAGMENTS = [
  '.ssh/',
  '.aws/',
  '.gnupg/',
  '.kube/config',
  '.docker/config.json',
  '.git-credentials',
  '.netrc',
  '.npmrc',
  '.pypirc',
  '.eddy-code/config.toml',
];

export function classifyShellCommandRisk(command: string): ShellCommandRisk | undefined {
  if (/\|\s*(?:sudo\s+)?(?:sh|bash|zsh|dash|ksh|fish)\b/.test(command)) {
    return { category: 'remote-code', detail: 'pipes output into a shell' };
  }
  for (const segment of splitSegments(command)) {
    const risk = classifySegment(segment);
    if (risk !== undefined) return risk;
  }
  return undefined;
}

function splitSegments(command: string): string[][] {
  return command
    .split(/\|\||&&|[;|&\n]|\$\(|[`()]/)
    .map((segment) => segment.trim().split(/\s+/).filter(Boolean).map(unquote))
    .filter((tokens) => tokens.length > 0);
}

function unquote(token: string): string {
  return token.replaceAll(/^['"]+|['"]+$/g, '');
}

function classifySegment(tokens: string[]): ShellCommandRisk | undefined {
  for (const token of tokens) {
    if (isSensitiveToken(token)) {
      return { category: 'sensitive-access', detail: `touches sensitive path ${token}` };
    }
  }

  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index]!;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) {
      index += 1;
      continue;
    }
    if (token === 'sudo' || token === 'doas') {
      return { category: 'privilege-escalation', detail: `runs ${token}` };
    }
    if (WRAPPERS.has(token)) {
      index += 1;
      continue;
    }
    break;
  }
  const program = basename(tokens[index] ?? '');
  const args = tokens.slice(index + 1);

  if (program === '' && tokens[0] === 'env') {
    return { category: 'sensitive-access', detail: 'dumps environment variables' };
  }
  if (program === 'printenv' && args.length === 0) {
    return { category: 'sensitive-access', detail: 'dumps environment variables' };
  }
  if (program === 'eval') return { category: 'remote-code', detail: 'runs eval' };
  if (SHELLS.has(program) && args.includes('-c')) {
    return classifyShellCommandRisk(args.slice(args.indexOf('-c') + 1).join(' '));
  }
  if (REMOTE_TOOLS.has(program)) {
    return { category: 'network-egress', detail: `runs ${program}` };
  }
  if (program === 'rsync' && args.some((arg) => /^[^/-][^/]*:/.test(arg))) {
    return { category: 'network-egress', detail: 'rsync to a remote host' };
  }
  if (program === 'curl' && curlUploads(args)) {
    return { category: 'network-egress', detail: 'curl sends data' };
  }
  if (program === 'wget' && args.some((arg) => /^--(post|body)-(data|file)/.test(arg))) {
    return { category: 'network-egress', detail: 'wget sends data' };
  }
  if (program === 'rm' && rmIsDangerous(args)) {
    return { category: 'destructive', detail: 'recursive rm outside the working directory' };
  }
  if (program === 'git') return classifyGit(args);
  if (program === 'dd' && args.some((arg) => arg.startsWith('of='))) {
    return { category: 'destructive', detail: 'dd writes to a target' };
  }
  if (program.startsWith('mkfs') || program === 'shred') {
    return { category: 'destructive', detail: `runs ${program}` };
  }
  return undefined;
}

function isSensitiveToken(token: string): boolean {
  const value = token.replace(/^[<>]+/, '').replace(/^[A-Za-z0-9_-]*=/, '');
  if (value === '' || value.startsWith('-')) return false;
  if (isSensitiveFile(value)) return true;
  const normalized = value.replace(/^~|^\$HOME|^\$\{HOME\}/, '');
  return SENSITIVE_PATH_FRAGMENTS.some(
    (fragment) =>
      normalized.includes(`/${fragment}`) ||
      normalized.startsWith(fragment) ||
      normalized.endsWith(`/${fragment.replace(/\/$/, '')}`),
  );
}

function basename(token: string): string {
  const slash = token.lastIndexOf('/');
  return slash === -1 ? token : token.slice(slash + 1);
}

function curlUploads(args: string[]): boolean {
  return args.some((arg, i) => {
    if (CURL_UPLOAD_FLAGS.has(arg) || arg.startsWith('--data') || arg.startsWith('--form')) return true;
    if (/^-[a-zA-Z]*[dFT]/.test(arg) && !arg.startsWith('--')) return true;
    if (arg === '-X' || arg === '--request') {
      return WRITE_METHODS.has((args[i + 1] ?? '').toUpperCase());
    }
    const inline = /^(?:-X|--request=)(\w+)$/.exec(arg);
    return inline !== null && WRITE_METHODS.has(inline[1]!.toUpperCase());
  });
}

function rmIsDangerous(args: string[]): boolean {
  const flags = args.filter((arg) => arg.startsWith('-'));
  const recursive = flags.some((flag) => flag === '--recursive' || /^-[a-zA-Z]*[rR]/.test(flag));
  if (!recursive) return false;
  return args
    .filter((arg) => !arg.startsWith('-'))
    .some(
      (target) =>
        target.startsWith('/') ||
        target.startsWith('~') ||
        target.startsWith('$') ||
        target === '.' ||
        target === '*' ||
        target === '..' ||
        target.startsWith('../'),
    );
}

function classifyGit(args: string[]): ShellCommandRisk | undefined {
  const sub = args.find((arg) => !arg.startsWith('-'));
  if (sub === 'push') {
    const force = args.some(
      (arg) =>
        arg === '-f' ||
        arg.startsWith('--force') ||
        arg === '--mirror' ||
        arg === '--delete' ||
        arg.startsWith('+'),
    );
    if (force) return { category: 'destructive', detail: 'git force push' };
  }
  if (sub === 'reset' && args.includes('--hard')) {
    return { category: 'destructive', detail: 'git reset --hard' };
  }
  if (sub === 'clean' && args.some((arg) => /^-[a-zA-Z]*f/.test(arg) || arg === '--force')) {
    return { category: 'destructive', detail: 'git clean -f' };
  }
  return undefined;
}
