/**
 * /cc-connect slash command for configuring cc-connect platform channels.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

import {
  ensureCcConnectConfig,
  getConfiguredPlatformInfo,
  resolveDefaultCcConnectConfigPath,
  type EnsureCcConnectConfigResult,
} from "../../cli/cc-connect-config";
import {
  buildDirectWindowsStartCommand,
  getDaemonInstructions,
} from "../../cli/cc-connect-daemon";
import {
  describePm2Status,
  detectLocalProxyPort,
  formatProxyUrl,
  readPm2CcConnectStatus,
} from "../../cli/cc-connect-preflight";
import { ChoicePickerComponent, type ChoiceOption } from "../components/dialogs/choice-picker";
import type { SlashCommandHost } from "./dispatch";

interface PlatformDef {
  name: string;
  type: string;
  setupCmd: string;
  note?: string;
}

const PLATFORMS: PlatformDef[] = [
  { name: "WeChat", type: "weixin", setupCmd: "weixin setup --project default" },
  { name: "Feishu", type: "feishu", setupCmd: "feishu setup --project default" },
  {
    name: "Telegram",
    type: "telegram",
    setupCmd: "telegram setup --project default",
    note: "Create a bot with @BotFather first",
  },
  { name: "DingTalk", type: "dingtalk", setupCmd: "dingtalk setup --project default" },
  { name: "Discord", type: "discord", setupCmd: "discord setup --project default" },
  { name: "Slack", type: "slack", setupCmd: "slack setup --project default" },
  {
    name: "QQ",
    type: "qq",
    setupCmd: "qq setup --project default",
    note: "Requires NapCat/OneBot",
  },
  {
    name: "WeCom",
    type: "wecom",
    setupCmd: "wecom setup --project default",
    note: "Requires a public network IP",
  },
];

const CONFIG_PATH = resolveDefaultCcConnectConfigPath();
const SEP = "-".repeat(48);

function checkCcConnect(): { installed: boolean; version?: string } {
  try {
    const out = execSync("cc-connect --version 2>&1", {
      encoding: "utf-8",
      timeout: 5000,
      windowsHide: true,
    });
    const match = out.match(/v(\d+\.\d+\.\d+)/);
    return { installed: true, version: match?.[1] ?? "" };
  } catch {
    return { installed: false };
  }
}

function readConfiguredType(): string | undefined {
  if (!existsSync(CONFIG_PATH)) return undefined;
  try {
    return getConfiguredPlatformInfo(readFileSync(CONFIG_PATH, "utf-8"), "").configuredType;
  } catch {
    return undefined;
  }
}

function platformSetupCommand(platform: PlatformDef): string {
  if (platform.type !== "weixin") return `cc-connect ${platform.setupCmd}`;
  const qrPath = process.platform === "win32"
    ? "$env:USERPROFILE\\Desktop\\cc-connect-weixin-qr.png"
    : "$HOME/Desktop/cc-connect-weixin-qr.png";
  return `cc-connect ${platform.setupCmd} --qr-image "${qrPath}"`;
}

function readPm2Status(): string {
  if (process.platform !== "win32") return "Use cc-connect daemon status to check the service.";
  return describePm2Status(readPm2CcConnectStatus());
}

function buildNoticeText(platform: PlatformDef, result: EnsureCcConnectConfigResult): string {
  const configDir = dirname(CONFIG_PATH);
  const daemon = getDaemonInstructions(configDir);
  const parts: string[] = [];

  if (result.changes.length > 0) {
    parts.push(`${platform.name} cc-connect configuration updated.`);
    parts.push("");
    parts.push(`Changes: ${result.changes.join(", ")}`);
  } else if (result.platformConfigured) {
    parts.push(`${platform.name} is already configured. Agent settings look current.`);
  } else {
    parts.push(`${platform.name} channel configured.`);
  }

  parts.push("");
  parts.push(`Config file: ${CONFIG_PATH}`);
  if (result.wrapperPath) {
    parts.push(`Eddy wrapper: ${result.wrapperPath}`);
  }

  if (result.needsAuth) {
    parts.push("");
    parts.push("Platform authentication is still required.");
    if (platform.type === "weixin") {
      parts.push("The terminal will show a QR code; the PNG copy is saved to Desktop as a backup.");
    }
    if (platform.type === "telegram") {
      parts.push("Create a bot with @BotFather and paste the Telegram bot token when cc-connect asks.");
    }
    parts.push("");
    parts.push(`  ${platformSetupCommand(platform)}`);
  }

  if (platform.type === "telegram") {
    parts.push("");
    if (result.proxy) {
      parts.push(`Telegram proxy: ${result.proxy}`);
    } else if (result.platformHadProxy) {
      parts.push("Telegram proxy: already configured.");
    } else {
      parts.push("Telegram proxy: no local proxy port detected. If Telegram API is unreachable, start your proxy and run /cc-connect again.");
    }
  }

  parts.push("");
  parts.push(readPm2Status());

  parts.push("");
  parts.push("Common management commands:");
  parts.push("");
  parts.push("  pm2 status                         Show service status");
  parts.push("  pm2 restart cc-connect             Restart service");
  parts.push("  pm2 stop cc-connect                Stop service");
  parts.push("  pm2 logs cc-connect                Show logs");
  parts.push("  pm2 delete cc-connect              Remove service");

  parts.push("");
  parts.push(SEP);
  parts.push("");
  parts.push("Initial setup steps:");
  parts.push("");

  const noteTag = platform.note ? ` (${platform.note})` : "";
  parts.push(`  Step 1: Platform authentication${noteTag}`);
  parts.push(`    ${platformSetupCommand(platform)}`);
  parts.push("");

  if (daemon.warning) {
    parts.push(`  Note: ${daemon.warning}`);
    parts.push("");
  }

  let stepNum = 2;
  for (const step of daemon.steps) {
    const onceTag = step.once ? " (one time)" : "";
    const isAutoDone = step.command.includes("cc-connect-startup.bat");
    parts.push(`  Step ${stepNum}: ${step.label}${onceTag}`);
    if (isAutoDone) {
      parts.push(`    Already handled automatically: ${step.command}`);
    } else {
      parts.push(`    ${step.command}`);
    }
    stepNum++;
  }

  parts.push("");
  parts.push(SEP);
  parts.push("");
  parts.push(`More commands (${daemon.method}):`);
  for (const cmd of daemon.helpCommands) {
    parts.push(`  ${cmd}`);
  }

  parts.push("");
  parts.push("Enable attachment forwarding:");
  parts.push("  Send /bind setup in the chat window.");
  parts.push("");
  parts.push("Auto-start is handled by the generated cc-connect-startup.bat when available.");
  parts.push("To restart manually: pm2 resurrect");
  if (process.platform === "win32") {
    parts.push("");
    parts.push("Windows direct fallback when PM2 keeps failing:");
    parts.push(`  ${buildDirectWindowsStartCommand(CONFIG_PATH)}`);
  }

  return parts.join("\n");
}

export async function handleChannelCommand(host: SlashCommandHost, _args: string): Promise<void> {
  const cc = checkCcConnect();
  if (!cc.installed) {
    host.showNotice(
      "cc-connect is not installed",
      "Run this in a terminal first:\n\n  npm install -g cc-connect\n\nThen enter /cc-connect again.",
    );
    return;
  }

  const configuredType = readConfiguredType();
  const options: ChoiceOption[] = PLATFORMS.map((platform) => {
    const isConfigured = configuredType === platform.type;
    return {
      value: platform.type,
      label: isConfigured ? `${platform.name} (configured)` : platform.name,
      description: platform.note,
    };
  });

  const picker = new ChoicePickerComponent({
    title: "cc-connect channel setup",
    hint: "Select a platform. The config will be written to ~/.cc-connect/config.toml.",
    options,
    currentValue: configuredType,
    colors: host.state.theme.colors,
    onSelect: (value: string) => {
      host.restoreEditor();

      const platform = PLATFORMS.find((entry) => entry.type === value);
      if (!platform) {
        host.showError("Internal error: unknown platform.");
        return;
      }

      const proxyPort = platform.type === "telegram" ? detectLocalProxyPort() : undefined;
      const result = ensureCcConnectConfig({
        configPath: CONFIG_PATH,
        platform,
        workDir: process.cwd(),
        platformProxy: proxyPort !== undefined ? formatProxyUrl(proxyPort) : undefined,
      });
      const title = result.needsAuth
        ? `${platform.name} needs authentication`
        : `${platform.name} channel ready`;
      host.showNotice(title, buildNoticeText(platform, result));
    },
    onCancel: () => {
      host.restoreEditor();
    },
  });

  host.mountEditorReplacement(picker);
}
