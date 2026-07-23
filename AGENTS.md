# Eddy Code Development Notes

These notes are for AI coding agents and maintainers working in this repository.

## Project Shape

- `apps/eddy-code` is the CLI/TUI application published as `eddy-code`.
- `packages/agent-core` contains the agent runtime.
- `packages/node-sdk` exposes the TypeScript SDK.
- `packages/config`, `packages/ltod`, `packages/memory`, `packages/jian`, and `packages/migration-legacy` are workspace packages used by the app and SDK.
- The public CLI command is `eddy`.

## Commands

Use the pinned package manager version when possible:

```powershell
npx pnpm@10.33.0 install
npx pnpm@10.33.0 run build
npx pnpm@10.33.0 run typecheck
npx pnpm@10.33.0 run test
node apps\eddy-code\dist\main.mjs --version
node apps\eddy-code\dist\main.mjs --help
```

For local command linking:

```powershell
npx pnpm@10.33.0 run link:eddy
```

Open a new terminal after linking, then run:

```powershell
eddy
```

## Development Rules

- Keep edits scoped to the task.
- Prefer the existing package boundaries and local helper APIs.
- Do not hand-edit generated output such as `dist/`, coverage, cache folders, or build artifacts.
- Do not commit local runtime data, API keys, tokens, `.env` files, logs, screenshots, or private machine paths.
- TUI render paths should not use `console.log`, `console.warn`, or `console.error`; use the existing UI/status surfaces instead.
- When changing public copy, keep the product name as `Eddy Code`.
- When changing package metadata, keep the npm package name `eddy-code` and command name `eddy`.

## Verification

For broad code changes, run:

```powershell
npx pnpm@10.33.0 run typecheck
npx pnpm@10.33.0 --filter eddy-code run build
```

For narrow changes, run the smallest relevant package or test command that covers the touched area.
