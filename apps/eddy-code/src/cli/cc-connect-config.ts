import { execSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, parse } from "node:path";

export interface CcConnectPlatform {
  type: string;
  name: string;
}

export interface EnsureCcConnectConfigOptions {
  configPath: string;
  platform: CcConnectPlatform;
  workDir: string;
}

export interface EnsureCcConnectConfigResult {
  configPath: string;
  wrapperPath?: string;
  platformConfigured: boolean;
  platformHadToken: boolean;
  needsAuth: boolean;
  changes: string[];
}

interface AgentCommandInfo {
  batchInvocation: string;
  shellInvocation: string;
  sourcePath: string;
}

export function resolveDefaultCcConnectConfigPath(): string {
  return join(homedir(), ".cc-connect", "config.toml");
}

function hasWhitespace(value: string): boolean {
  return /\s/.test(value);
}

function tomlString(value: string): string {
  return value.includes("'") || value.includes("\n")
    ? JSON.stringify(value)
    : `'${value}'`;
}

function quoteBatchArg(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function quoteShellArg(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function resolveWhereEddy(): string | undefined {
  try {
    const command = process.platform === "win32" ? "where eddy" : "which eddy 2>/dev/null";
    const found = execSync(command, {
      encoding: "utf-8",
      timeout: 3000,
      windowsHide: true,
    })
      .trim()
      .split(/[\r\n]+/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (process.platform === "win32") {
      return found.find((path) => path.toLowerCase().endsWith(".cmd")) ?? found[0];
    }
    return found[0];
  } catch {
    return undefined;
  }
}

function resolveEddyCommandInfo(): AgentCommandInfo {
  const argvScript = process.argv[1];
  const execName = basename(process.execPath).toLowerCase();

  if (execName === "eddy" || execName === "eddy.exe") {
    return {
      batchInvocation: quoteBatchArg(process.execPath),
      shellInvocation: quoteShellArg(process.execPath),
      sourcePath: process.execPath,
    };
  }

  if (argvScript && (argvScript.includes("eddy-code") || argvScript.includes("eddy"))) {
    return {
      batchInvocation: `${quoteBatchArg(process.execPath)} ${quoteBatchArg(argvScript)}`,
      shellInvocation: `${quoteShellArg(process.execPath)} ${quoteShellArg(argvScript)}`,
      sourcePath: argvScript,
    };
  }

  const discovered = resolveWhereEddy();
  if (discovered) {
    return {
      batchInvocation: quoteBatchArg(discovered),
      shellInvocation: quoteShellArg(discovered),
      sourcePath: discovered,
    };
  }

  return {
    batchInvocation: "eddy",
    shellInvocation: "eddy",
    sourcePath: "eddy",
  };
}

function resolveWrapperCandidates(configPath: string, workDir: string): string[] {
  const configDir = dirname(configPath);
  const publicDir = process.env["PUBLIC"];
  const systemDrive = process.env["SystemDrive"];
  const workDrive = parse(workDir).root;
  const scriptName = process.platform === "win32" ? "eddy-stream-json.cmd" : "eddy-stream-json";
  const candidates = [
    join(configDir, scriptName),
    publicDir ? join(publicDir, "EddyCode", scriptName) : undefined,
    systemDrive ? join(systemDrive, "EddyCode", scriptName) : undefined,
    workDrive ? join(workDrive, scriptName) : undefined,
  ].filter((path): path is string => path !== undefined);

  const seen = new Set<string>();
  return candidates.filter((path) => {
    const key = path.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function writeWrapper(
  configPath: string,
  workDir: string,
): { path: string; changed: boolean } | undefined {
  const command = resolveEddyCommandInfo();
  const content = process.platform === "win32"
    ? `@echo off\r\ncall ${command.batchInvocation} stream-json %*\r\n`
    : `#!/bin/sh\nexec ${command.shellInvocation} stream-json "$@"\n`;
  const candidates = resolveWrapperCandidates(configPath, workDir);
  const preferred = process.platform === "win32"
    ? candidates.find((path) => !hasWhitespace(path)) ?? candidates[0]
    : candidates[0];
  if (!preferred) return undefined;

  for (const candidate of [preferred, ...candidates.filter((path) => path !== preferred)]) {
    try {
      mkdirSync(dirname(candidate), { recursive: true });
      if (existsSync(candidate) && readFileSync(candidate, "utf-8") === content) {
        return { path: candidate, changed: false };
      }
      writeFileSync(candidate, content, "utf-8");
      if (process.platform !== "win32") chmodSync(candidate, 0o755);
      return { path: candidate, changed: true };
    } catch {
      // Try the next candidate.
    }
  }

  return undefined;
}

export function getConfiguredPlatformInfo(
  content: string,
  platformType: string,
): { configuredType?: string; platformConfigured: boolean; platformHadToken: boolean } {
  const lines = content.split(/\r?\n/);
  let inPlatform = false;
  let blockType: string | undefined;
  let blockHadToken = false;
  let configuredType: string | undefined;
  let platformConfigured = false;
  let platformHadToken = false;

  const flush = () => {
    if (!blockType) return;
    configuredType ??= blockType;
    if (blockType === platformType) {
      platformConfigured = true;
      platformHadToken = blockHadToken;
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "[[projects.platforms]]") {
      flush();
      inPlatform = true;
      blockType = undefined;
      blockHadToken = false;
      continue;
    }
    if (trimmed.startsWith("[[") && trimmed !== "[[projects.platforms]]") {
      flush();
      inPlatform = false;
      blockType = undefined;
      blockHadToken = false;
      continue;
    }
    if (!inPlatform) continue;

    const typeMatch = trimmed.match(/^type\s*=\s*["']([^"']+)["']/);
    if (typeMatch) {
      blockType = typeMatch[1];
      continue;
    }
    const tokenMatch = trimmed.match(/^token\s*=\s*["']([^"']*)["']/);
    const token = tokenMatch?.[1];
    if (token !== undefined && token.trim().length > 0) {
      blockHadToken = true;
    }
  }
  flush();

  return { configuredType, platformConfigured, platformHadToken };
}

function generateNewConfig(platform: CcConnectPlatform, cmd: string, workDir: string): string {
  return [
    "# Global attachment forwarding: on/off",
    'attachment_send = "on"',
    "",
    'language = "zh"',
    "",
    "[[projects]]",
    'name = "default"',
    "",
    "[projects.agent]",
    'type = "claudecode"',
    "",
    "[projects.agent.options]",
    `cmd = ${tomlString(cmd)}`,
    `work_dir = ${tomlString(workDir)}`,
    'mode = "default"',
    "",
    "[[projects.platforms]]",
    `type = "${platform.type}"`,
    "",
  ].join("\n");
}

function findTableRange(lines: string[], header: string): { start: number; end: number } | undefined {
  const start = lines.findIndex((line) => line.trim() === header);
  if (start < 0) return undefined;

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const trimmed = lines[i]?.trim() ?? "";
    if (trimmed.startsWith("[") && trimmed !== header) {
      end = i;
      break;
    }
  }

  return { start, end };
}

function ensureAgentType(content: string): { content: string; changes: string[] } {
  const changes: string[] = [];
  const lines = content.split(/\r?\n/);
  const range = findTableRange(lines, "[projects.agent]");

  if (!range) {
    const insertAt = lines.findIndex((line) => line.trim() === "[[projects.platforms]]");
    const safeInsertAt = insertAt >= 0 ? insertAt : lines.length;
    lines.splice(safeInsertAt, 0, "", "[projects.agent]", 'type = "claudecode"');
    changes.push("added-agent");
    return { content: lines.join("\n"), changes };
  }

  const body = lines.slice(range.start + 1, range.end);
  const kept = body.filter((line) => !/^type\s*=/.test(line.trim()));
  const nextBlock = ["[projects.agent]", 'type = "claudecode"', ...kept].join("\n");
  const existingText = lines.slice(range.start, range.end).join("\n");

  if (existingText !== nextBlock) {
    lines.splice(range.start, range.end - range.start, ...nextBlock.split("\n"));
    changes.push("updated-agent-type");
  }

  return { content: lines.join("\n"), changes };
}

function ensureAgentOptions(content: string, cmd: string, workDir: string): { content: string; changes: string[] } {
  const changes: string[] = [];
  const lines = content.split(/\r?\n/);
  const desired = [
    "[projects.agent.options]",
    `cmd = ${tomlString(cmd)}`,
    `work_dir = ${tomlString(workDir)}`,
    'mode = "default"',
  ];
  const range = findTableRange(lines, "[projects.agent.options]");

  if (!range) {
    const projectAgentIndex = lines.findIndex((line) => line.trim() === "[projects.agent]");
    const insertAt = projectAgentIndex >= 0
      ? lines.findIndex((line, index) => index > projectAgentIndex && line.trim().startsWith("["))
      : lines.findIndex((line) => line.trim() === "[[projects.platforms]]");
    const safeInsertAt = insertAt >= 0 ? insertAt : lines.length;
    const block = projectAgentIndex >= 0 ? ["", ...desired] : ["", ...desired];
    lines.splice(safeInsertAt, 0, ...block);
    changes.push("added-agent-options");
    return { content: lines.join("\n"), changes };
  }

  const existingBody = lines.slice(range.start + 1, range.end);
  const kept = existingBody.filter((line) => {
    const trimmed = line.trim();
    return !/^(cli_path|cmd|work_dir|mode)\s*=/.test(trimmed);
  });
  const existingText = lines.slice(range.start, range.end).join("\n");
  const nextBlock = [desired[0], ...desired.slice(1), ...kept].join("\n");

  if (existingText !== nextBlock) {
    lines.splice(range.start, range.end - range.start, ...nextBlock.split("\n"));
    if (/^\s*cli_path\s*=/m.test(existingText)) changes.push("migrated-cli-path");
    changes.push("updated-agent-options");
  }

  return { content: lines.join("\n"), changes };
}

function ensurePlatformBlock(
  content: string,
  platform: CcConnectPlatform,
): { content: string; platformConfigured: boolean; platformHadToken: boolean; changes: string[] } {
  const info = getConfiguredPlatformInfo(content, platform.type);
  if (info.platformConfigured) {
    return {
      content,
      platformConfigured: true,
      platformHadToken: info.platformHadToken,
      changes: [],
    };
  }

  const separator = content.endsWith("\n") ? "" : "\n";
  return {
    content: `${content}${separator}\n[[projects.platforms]]\ntype = "${platform.type}"\n`,
    platformConfigured: false,
    platformHadToken: false,
    changes: ["added-platform"],
  };
}

export function ensureCcConnectConfig(
  options: EnsureCcConnectConfigOptions,
): EnsureCcConnectConfigResult {
  const wrapper = writeWrapper(options.configPath, options.workDir);
  const command = wrapper?.path ?? resolveEddyCommandInfo().sourcePath;

  mkdirSync(dirname(options.configPath), { recursive: true });

  if (!existsSync(options.configPath)) {
    const content = generateNewConfig(options.platform, command, options.workDir);
    writeFileSync(options.configPath, content, "utf-8");
    return {
      configPath: options.configPath,
      wrapperPath: wrapper?.path,
      platformConfigured: false,
      platformHadToken: false,
      needsAuth: options.platform.type === "weixin",
      changes: ["created-config", ...(wrapper?.changed ? ["created-wrapper"] : [])],
    };
  }

  const original = readFileSync(options.configPath, "utf-8");
  const agentTypeResult = ensureAgentType(original);
  const agentResult = ensureAgentOptions(agentTypeResult.content, command, options.workDir);
  const platformResult = ensurePlatformBlock(agentResult.content, options.platform);
  const finalContent = platformResult.content;
  const changes = [
    ...agentTypeResult.changes,
    ...agentResult.changes,
    ...platformResult.changes,
    ...(wrapper?.changed ? ["created-wrapper"] : []),
  ];

  if (finalContent !== original) {
    writeFileSync(options.configPath, finalContent, "utf-8");
  }

  return {
    configPath: options.configPath,
    wrapperPath: wrapper?.path,
    platformConfigured: platformResult.platformConfigured,
    platformHadToken: platformResult.platformHadToken,
    needsAuth: options.platform.type === "weixin" && !platformResult.platformHadToken,
    changes,
  };
}
