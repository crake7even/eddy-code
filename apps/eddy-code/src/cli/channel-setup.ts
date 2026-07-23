/**
 * `eddy channel setup` - interactive cc-connect platform configuration.
 *
 * Guides the user through:
 *   1. Check cc-connect is installed.
 *   2. Select a platform.
 *   3. Auto-generate ~/.cc-connect/config.toml.
 *   4. Print the next command.
 */

import { execSync } from 'node:child_process';
import { createInterface } from 'node:readline';

import {
  ensureCcConnectConfig,
  resolveDefaultCcConnectConfigPath,
} from './cc-connect-config';
import { getDaemonInstructions } from './cc-connect-daemon';

interface PlatformDef {
  type: string;
  name: string;
  desc: string;
  setupCmd: string;
  note?: string;
}

const PLATFORMS: PlatformDef[] = [
  {
    type: 'weixin',
    name: 'Weixin',
    desc: 'Personal WeChat via ilink bot protocol.',
    setupCmd: 'weixin setup',
  },
  {
    type: 'feishu',
    name: 'Feishu',
    desc: 'Feishu/Lark enterprise chat.',
    setupCmd: 'feishu setup',
  },
  {
    type: 'telegram',
    name: 'Telegram',
    desc: 'Telegram bot. Create one with @BotFather first.',
    setupCmd: 'telegram setup',
  },
  {
    type: 'dingtalk',
    name: 'DingTalk',
    desc: 'DingTalk enterprise chat.',
    setupCmd: 'dingtalk setup',
  },
  {
    type: 'discord',
    name: 'Discord',
    desc: 'Discord community platform.',
    setupCmd: 'discord setup',
  },
  {
    type: 'slack',
    name: 'Slack',
    desc: 'Slack workspace chat.',
    setupCmd: 'slack setup',
  },
  {
    type: 'qq',
    name: 'QQ',
    desc: 'QQ via NapCat/OneBot.',
    setupCmd: 'qq setup',
    note: 'Install NapCat or a OneBot bridge first.',
  },
  {
    type: 'qqbot',
    name: 'QQ Bot',
    desc: 'Official QQ Bot API.',
    setupCmd: 'qqbot setup',
  },
  {
    type: 'wecom',
    name: 'WeCom',
    desc: 'WeChat Work. Public URL is usually required.',
    setupCmd: 'wecom setup',
    note: 'Requires a public URL or ngrok.',
  },
  {
    type: 'line',
    name: 'LINE',
    desc: 'LINE messaging platform. Public URL is usually required.',
    setupCmd: 'line setup',
    note: 'Requires a public URL.',
  },
  {
    type: 'weibo',
    name: 'Weibo',
    desc: 'Weibo message channel.',
    setupCmd: 'weibo setup',
  },
  {
    type: 'wps-xiezuo',
    name: 'WPS',
    desc: 'WPS collaboration channel.',
    setupCmd: 'wps-xiezuo setup',
  },
];

async function question(rl: ReturnType<typeof createInterface>, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => resolve(answer.trim()));
  });
}

function checkCcConnect(): { installed: boolean; version?: string } {
  try {
    const out = execSync('cc-connect --version 2>&1', {
      encoding: 'utf-8',
      timeout: 5000,
    });
    const match = out.match(/v(\d+\.\d+\.\d+)/);
    return { installed: true, version: match?.[1] ?? out.trim().split('\n')[0] };
  } catch {
    return { installed: false };
  }
}

function resolveWorkDir(): string {
  return process.cwd();
}

function platformSetupCommand(platform: PlatformDef): string {
  const base = `cc-connect ${platform.setupCmd} --project default`;
  if (platform.type !== 'weixin') return base;
  const qrPath = process.platform === 'win32'
    ? '$env:USERPROFILE\\Desktop\\cc-connect-weixin-qr.png'
    : '$HOME/Desktop/cc-connect-weixin-qr.png';
  return `${base} --qr-image "${qrPath}"`;
}

export async function runChannelSetup(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  console.log('');
  console.log('cc-connect quick channel setup');
  console.log('-'.repeat(50));
  console.log('');

  const cc = checkCcConnect();
  if (cc.installed) {
    console.log(`  OK cc-connect installed (${cc.version})`);
  } else {
    console.log('  cc-connect is not installed.');
    console.log('');
    console.log('  Install it first:');
    console.log('    npm install -g cc-connect');
    console.log('');
    console.log('  Then run:');
    console.log('    eddy channel setup');
    console.log('');
    rl.close();
    process.exit(1);
  }
  console.log('');

  console.log('  Select a platform:');
  console.log('');
  PLATFORMS.forEach((p, i) => {
    const num = String(i + 1).padStart(2, ' ');
    console.log(`  ${num}. ${p.name.padEnd(12)} - ${p.desc}`);
  });
  console.log('');

  const answer = await question(rl, `  Enter number (1-${PLATFORMS.length}): `);
  const index = parseInt(answer, 10) - 1;
  const platform = PLATFORMS[index];
  if (!platform) {
    console.log('');
    console.log(`  Invalid selection: "${answer}". Enter 1-${PLATFORMS.length}.`);
    console.log('');
    rl.close();
    process.exit(1);
  }
  console.log('');
  console.log(`  Selected: ${platform.name}`);
  console.log('');

  const configPath = resolveDefaultCcConnectConfigPath();
  const result = ensureCcConnectConfig({
    configPath,
    platform,
    workDir: resolveWorkDir(),
  });
  console.log(`  Config checked: ${configPath}`);
  if (result.wrapperPath) console.log(`  Eddy wrapper: ${result.wrapperPath}`);
  if (result.changes.length > 0) console.log(`  Changes: ${result.changes.join(', ')}`);
  if (result.needsAuth) console.log('  Platform authentication is still required.');
  console.log('');

  const daemon = getDaemonInstructions(configPath.replace(/[\\/]config\.toml$/i, ''));

  console.log('-'.repeat(50));
  console.log('');
  console.log('  Setup steps:');
  console.log('');
  console.log('  Step 1 - platform login (once)');
  console.log('');
  console.log(`    ${platformSetupCommand(platform)}`);
  console.log('');
  if (platform.type === 'weixin') {
    console.log('    The terminal shows a QR code; the Desktop PNG is a backup for easier scanning.');
    console.log('');
  }

  if (platform.note) {
    console.log(`    Note: ${platform.note}`);
    console.log('');
  }

  if (daemon.warning) {
    console.log(`  Warning: ${daemon.warning}`);
    console.log('');
  }

  let stepNum = 2;
  for (const step of daemon.steps) {
    const onceTag = step.once ? ' (once)' : '';
    console.log(`  Step ${stepNum} - ${step.label}${onceTag}`);
    console.log('');
    console.log(`    ${step.command}`);
    console.log('');
    stepNum++;
  }

  console.log('  ' + '-'.repeat(50));
  console.log('');
  console.log(`  Management commands (${daemon.method}):`);
  console.log('');
  for (const cmd of daemon.helpCommands) {
    console.log(`    ${cmd}`);
  }
  console.log('');

  console.log('  To enable attachment return in chat:');
  console.log('');
  console.log('    Send /bind setup in the chat window.');
  console.log('');

  rl.close();
}
