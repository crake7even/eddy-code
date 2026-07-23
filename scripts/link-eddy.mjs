import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mainEntry = join(repoRoot, 'apps', 'eddy-code', 'dist', 'main.mjs');

if (!existsSync(mainEntry)) {
  console.error('Eddy Code has not been built yet.');
  console.error('Run: npx pnpm@10.33.0 --filter eddy-code run build');
  process.exit(1);
}

const binDir = resolve(
  process.env.EDDY_BIN_DIR ||
    (process.platform === 'win32'
      ? join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'EddyCode', 'bin')
      : join(homedir(), '.local', 'bin')),
);

mkdirSync(binDir, { recursive: true });

if (process.platform === 'win32') {
  const eddyCmd = join(binDir, 'eddy.cmd');
  writeFileSync(
    eddyCmd,
    [
      '@echo off',
      `set "EDDY_HOME=${repoRoot}"`,
      `cd /d "${repoRoot}"`,
      `"${process.execPath}" "${mainEntry}" %*`,
      '',
    ].join('\r\n'),
    'ascii',
  );
  addWindowsUserPath(binDir);
  console.log(`Created ${eddyCmd}`);
} else {
  const eddy = join(binDir, 'eddy');
  writeFileSync(
    eddy,
    [
      '#!/usr/bin/env sh',
      `EDDY_HOME='${repoRoot.replaceAll("'", "'\\''")}'`,
      'cd "$EDDY_HOME" || exit 1',
      `exec '${process.execPath.replaceAll("'", "'\\''")}' '${mainEntry.replaceAll("'", "'\\''")}' "$@"`,
      '',
    ].join('\n'),
    'utf8',
  );
  chmodSync(eddy, 0o755);
  addShellPath(binDir);
  console.log(`Created ${eddy}`);
}

console.log('');
console.log('Restart your terminal, then run: eddy');
console.log('For this terminal only, add this directory to PATH:');
console.log(`  ${binDir}`);

function addWindowsUserPath(dir) {
  const userPath = process.env.Path || process.env.PATH || '';
  if (pathContains(userPath, dir)) return;

  const script = `
$dir = ${JSON.stringify(dir)}
$path = [Environment]::GetEnvironmentVariable('PATH', 'User')
if (-not $path) { $path = '' }
$parts = $path -split ';' | Where-Object { $_ }
if ($parts -notcontains $dir) {
  $newPath = if ($path) { "$path;$dir" } else { $dir }
  [Environment]::SetEnvironmentVariable('PATH', $newPath, 'User')
}
`;

  execFileSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { stdio: 'inherit' },
  );
}

function addShellPath(dir) {
  const currentPath = process.env.PATH || '';
  if (pathContains(currentPath, dir)) return;

  const shell = process.env.SHELL || '';
  const rc = shell.endsWith('zsh') ? join(homedir(), '.zshrc') : join(homedir(), '.bashrc');
  const line = `export PATH="${dir}:$PATH"`;

  if (!existsSync(rc)) {
    console.log(`Add this to your shell profile: ${line}`);
    return;
  }

  const content = readFileSync(rc, 'utf8');
  if (!content.includes(line)) {
    writeFileSync(rc, `${content.trimEnd()}\n${line}\n`, 'utf8');
  }
}

function pathContains(pathValue, dir) {
  const needle = process.platform === 'win32' ? dir.toLowerCase() : dir;
  return pathValue
    .split(process.platform === 'win32' ? ';' : ':')
    .filter(Boolean)
    .some((part) => {
      const normalized = resolve(part);
      return (process.platform === 'win32' ? normalized.toLowerCase() : normalized) === needle;
    });
}
