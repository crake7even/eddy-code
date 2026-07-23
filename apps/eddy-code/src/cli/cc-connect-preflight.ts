import { execSync } from "node:child_process";

export const TELEGRAM_PROXY_PORTS = [7897, 7890, 10808, 10809] as const;

export interface Pm2CcConnectStatus {
  available: boolean;
  registered: boolean;
  status?: string;
}

export function formatProxyUrl(port: number): string {
  return `http://127.0.0.1:${port}`;
}

function parsePorts(output: string): Set<number> {
  const ports = new Set<number>();
  for (const match of output.matchAll(/(?:127\.0\.0\.1|0\.0\.0\.0|\[::\]|::1)?[:\s](\d{2,5})\s/g)) {
    const port = Number.parseInt(match[1] ?? "", 10);
    if (Number.isFinite(port)) ports.add(port);
  }
  return ports;
}

export function detectLocalProxyPort(
  candidates: readonly number[] = TELEGRAM_PROXY_PORTS,
): number | undefined {
  if (candidates.length === 0) return undefined;

  try {
    const ports = candidates.join(",");
    const command = process.platform === "win32"
      ? [
          "powershell",
          "-NoProfile",
          "-Command",
          `"Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { @(${ports}) -contains $_.LocalPort } | Select-Object -ExpandProperty LocalPort -Unique"`,
        ].join(" ")
      : `netstat -an 2>/dev/null | grep LISTEN`;
    const output = execSync(command, {
      encoding: "utf-8",
      timeout: 3000,
      windowsHide: true,
    });
    const listening = process.platform === "win32"
      ? new Set(
          output
            .split(/\r?\n/)
            .map((line) => Number.parseInt(line.trim(), 10))
            .filter((port) => Number.isFinite(port)),
        )
      : parsePorts(output);
    return candidates.find((port) => listening.has(port));
  } catch {
    try {
      const output = execSync("netstat -ano", {
        encoding: "utf-8",
        timeout: 3000,
        windowsHide: true,
      });
      const listening = parsePorts(output);
      return candidates.find((port) => listening.has(port));
    } catch {
      return undefined;
    }
  }
}

export function readPm2CcConnectStatus(): Pm2CcConnectStatus {
  if (process.platform !== "win32") {
    return { available: false, registered: false };
  }

  try {
    const out = execSync("pm2 jlist 2>nul", {
      encoding: "utf-8",
      timeout: 3000,
      windowsHide: true,
    }).trim();
    const list = JSON.parse(out || "[]") as Array<{
      name?: string;
      pm2_env?: { status?: string };
    }>;
    const cc = list.find((entry) => entry.name === "cc-connect");
    if (!cc) return { available: true, registered: false };
    return {
      available: true,
      registered: true,
      status: cc.pm2_env?.status ?? "unknown",
    };
  } catch {
    return { available: false, registered: false };
  }
}

export function describePm2Status(status: Pm2CcConnectStatus): string {
  if (!status.available) {
    return "PM2 status: pm2 is not available or not running. Use the direct Windows fallback if PM2 keeps failing.";
  }
  if (!status.registered) {
    return "PM2 status: cc-connect is not registered yet. Use /cc to start it.";
  }
  if (status.status === "online") return "PM2 status: cc-connect is online.";
  if (status.status === "stopped") {
    return "PM2 status: cc-connect is stopped. Use /cc to restart it.";
  }
  if (status.status === "errored") {
    return "PM2 status: cc-connect is errored. Run pm2 logs cc-connect, or use the direct Windows fallback.";
  }
  return `PM2 status: cc-connect is ${status.status ?? "unknown"}.`;
}
