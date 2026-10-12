# Eddy Code Development Notes

These notes are for AI coding agents and maintainers working in this repository.
Examples use macOS/Linux (bash). See [Windows notes](#windows-notes) for platform differences.

## Project Shape

pnpm monorepo. Workspaces are `packages/*` and `apps/*` (see `pnpm-workspace.yaml`).
The root package is the private workspace root `@eddy-code/monorepo`.

- `apps/eddy-code` — the CLI/TUI application, published to npm as `eddy-code`.
  The `eddy` bin points at `dist/main.mjs`. Source layout:
  `src/main.ts`, `src/app.ts`, `src/cli/`, `src/tui/`, `src/constant/`,
  `src/migration/`, `src/utils/`, `src/built-in-catalog.ts`.
  Tests live in `apps/eddy-code/test/` (`cli/`, `tui/`, `e2e/`, `migration/`,
  `helpers/`, `scripts/`, `utils/`).
- `packages/agent-core` (`@eddy-code/agent-core`) — the agent runtime:
  `agent/`, `loop/`, `session/`, `tools/`, `skill/`, `plugin/`, `mcp/`, `lsp/`,
  `rpc/`, `config/`, `flags/`, `logging/`, `profile/`, `errors/`, `utils/`.
- `packages/node-sdk` — directory name and package name differ: it publishes as
  `@eddy-code/sdk`. This is the TypeScript SDK that the CLI consumes as a
  workspace dependency; it is `private: true` and built inline into the CLI
  bundle rather than installed by end users.
- `packages/config` (`@eddy-code/config`), `packages/Yc` (`@eddy-code/yc`),
  `packages/memory` (`@eddy-code/memory`), `packages/JAN` (`@eddy-code/jan`),
  and `packages/migration-legacy` (`@eddy-code/migration-legacy`) are workspace
  packages used by the app and SDK.

All workspace packages except `eddy-code` are `private: true`. The app tracks its
own version independently of the `packages/*` version line.

## Environment

- Node: `.nvmrc` pins `24.15.0` and CI uses `node-version-file: .nvmrc`.
  The declared floor is Node 22: root `engines.node` is `>=22.0.0` and
  `apps/eddy-code` requires `>=22.19.0`.
- Package manager: pnpm `10.33.0`, pinned via the root `packageManager` field.
  Prefer `corepack enable`, or prefix commands with `npx pnpm@10.33.0` when pnpm
  is not on PATH.
- TypeScript is pinned (`typescript@6.0.2`). Do not upgrade it as a side effect.

## Commands

Run from the repo root unless a `-C`/`--filter` flag says otherwise.

```bash
pnpm install              # CI uses: pnpm install --frozen-lockfile
pnpm run build            # build everything (all workspaces, recursive)
pnpm run build:packages   # build only ./packages/* — prerequisite for tests
pnpm run typecheck        # builds packages, then typechecks packages + app
pnpm run lint             # oxlint --type-aware
pnpm run lint:fix
pnpm run sherif           # monorepo consistency check
pnpm run lint:pkg         # publint + attw on publishable packages
pnpm run test             # vitest run across packages/* and apps/eddy-code
pnpm run test:watch
pnpm run test:coverage
pnpm run clean
pnpm run changeset
```

App-level commands:

```bash
pnpm -C apps/eddy-code run build        # tsdown
pnpm -C apps/eddy-code run dev          # scripts/dev.mjs
pnpm -C apps/eddy-code run dev:cli-only # tsx + raw-text loader, no TUI build
pnpm -C apps/eddy-code run smoke        # node dist/main.mjs --version
pnpm -C apps/eddy-code run e2e          # EDDY_E2E=1 vitest run test/e2e
pnpm -C apps/eddy-code run e2e:real     # EDDY_E2E_REAL=1, hits a real LLM
```

Narrow changes — run the smallest command that covers the touched package:

```bash
pnpm -C apps/eddy-code run typecheck
pnpm --filter @eddy-code/agent-core run typecheck
pnpm --filter @eddy-code/agent-core run test
```

Inspect the built CLI:

```bash
node apps/eddy-code/dist/main.mjs --version
node apps/eddy-code/dist/main.mjs --help
```

For local command linking (writes an `eddy` launcher and adds a PATH entry):

```bash
pnpm run link:eddy
```

Then open a new terminal and run `eddy`. The launcher sets `EDDY_HOME` to the
repo root and executes `apps/eddy-code/dist/main.mjs`, so build first.

## Build and Bundling

- `apps/eddy-code/tsdown.config.ts`: entry `src/main.ts` → `dist/main.mjs`. It
  prepends the shebang and CJS shims, aliases `@` → `apps/eddy-code/src` and
  `@eddy-code/memory` → `packages/memory/src/index.ts`, injects the built-in
  catalog via `define`, and sets `deps.alwaysBundle: [/^@eddy-./]` — so every
  `@eddy-code/*` workspace import is inlined into the CLI bundle.
- `packages/agent-core/tsdown.config.ts`: entry `src/index.ts`, emits types
  (`dts: true`), and overrides bundling with `alwaysBundle: ['picomatch']` and
  `neverBundle: ['@eddy-code/yc', '@eddy-code/jan']`. Do not assume the
  app-wide `alwaysBundle` rule generalizes to other packages; check each
  package's own config.
- Consequently, workspace packages used by the CLI belong in
  `apps/eddy-code/devDependencies` (inlined), while third-party runtime
  packages belong in `dependencies` (left external). Adding a third-party
  runtime import means adding it to `dependencies` and rebuilding.
- Because the app resolves workspace packages through their built `dist/`,
  tests and app builds must run `pnpm run build:packages` first. That is why
  root `test` and the app's own `test` script both chain it.
- Vitest project names are `cli` (app) and `eddy-core` (agent-core). The root
  config runs `projects: ['packages/*', 'apps/eddy-code']`.
- Prompt and config assets are imported as raw strings: `build/raw-text-plugin.mjs`
  inlines `.md` and `.yaml` imports (`import description from './grep.md'`) at
  build time, so they never ship separately in `dist`. It is registered in both
  configs of `apps/eddy-code`, `packages/agent-core`, and `packages/node-sdk`,
  plus `packages/migration-legacy/vitest.config.ts`;
  `build/register-raw-text-loader.mjs` wires the same thing into `tsx` via
  `--import`. If you add a build or test config for a package that imports
  `.md`/`.yaml`, you must register the plugin there too.

## Development Rules

- Keep edits scoped to the task.
- Prefer the existing package boundaries and local helper APIs.
- Cross-package imports use the workspace names (`@eddy-code/agent-core`), not
  relative paths into another package's `src/`.
- Within a package, use the `#/*` subpath alias, which resolves to `./src/*.ts`
  and `./src/*/index.ts` (declared in each package's `imports` field). Inside
  `apps/eddy-code`, `@/*` is the established alias for `src/*` — keep using the
  alias style already present in the file you are editing.
- Add tests in the `test/` directory of the package you changed. The app's
  vitest picks up `test/**/*.test.ts(x)`; agent-core picks up
  `test/**/*.{test,e2e}.ts`.
- `zod` is a pnpm catalog entry. Declare it as `"zod": "catalog:"` in workspace
  packages rather than pinning a literal range.
- Do not hand-edit generated output such as `dist/`, `dist-native/`,
  `.tmp-api-extractor/`, coverage, cache folders, or build artifacts.
- Do not commit local runtime data, API keys, tokens, `.env` files, logs,
  screenshots, or private machine paths. `.gitignore` already excludes `.eddy-code`,
  `docs/`, `.claude`, `.codex-memory/`, `plugins/cdn/`, and `*.tsbuildinfo`.
- Do not modify `patches/@earendil-works__pi-tui@0.78.1.patch` or the
  `patchedDependencies` entry without checking upstream first.
- TUI render paths should not use `console.log`, `console.warn`, or `console.error`;
  use the existing UI/status surfaces instead.
- Linting is oxlint, configured by `.oxlintrc.json` — not ESLint. Type-aware
  rules are enabled (`typescript/no-misused-promises`, `typescript/return-await`,
  `typescript/only-throw-error`, `import/no-cycle`), so run `pnpm run lint`,
  which passes `--type-aware`; a bare `oxlint` run silently skips them.
- Code style is declared in `.oxfmtrc.json` (100-column width, single quotes,
  trailing commas, sorted import groups). There is no `format` script and
  `oxfmt` is not a declared dependency, so match that style by hand rather than
  reaching for a formatter.
- `lint-staged` is configured in the root `package.json` to run
  `oxlint --fix --quiet` then `oxlint --type-aware --quiet` on staged files, and
  `scripts/prepare.mjs` calls `simple-git-hooks` when `.git` exists. But
  `simple-git-hooks` is currently an empty object and `.git/hooks` holds only
  samples, so no hook is actually installed — do not assume staged files were
  linted for you. Run `pnpm run lint` yourself.
- Generate a changeset for any change that affects a published package.
- When changing public copy, keep the product name as `Eddy Code`.
- When changing package metadata, keep the npm package name `eddy-code` and
  command name `eddy`.

## Verification

CI (`.github/workflows/ci.yml`) runs four independent jobs. Reproduce the
relevant one locally before considering a change done.

Broad code changes:

```bash
pnpm run typecheck
pnpm run build
pnpm -C apps/eddy-code run smoke
```

Test and lint jobs:

```bash
pnpm run build:packages && pnpm run test
pnpm run build:packages && pnpm run lint && pnpm run sherif
```

Note the typecheck difference: `pnpm run typecheck` shells out to `tsc -p
tsconfig.json --noEmit` inside each package, while CI invokes
`tsgo` (`@typescript/native-preview@beta`) against every
`packages/*/tsconfig.json` and `apps/eddy-code/tsconfig.json`. `pnpm run
typecheck` is the practical local equivalent; if CI reports a type error that
local `tsc` misses, reproduce it with `tsgo`.

For narrow changes, run the smallest relevant package or test command that
covers the touched area (see [Commands](#commands)).

## Release

Changesets drives releases. Merging to `main` opens a "ci: release packages"
PR via `.github/workflows/release.yml`, which runs `pnpm run version:release`.
The full gate before publishing is:

```bash
pnpm run publish
```

which chains `typecheck`, `lint`, `sherif`, `test`, `build`, `lint:pkg`, and
finally `changeset publish`.

## Windows Notes

Development on Windows works; the differences are:

- Build a launcher with `pnpm run link:eddy`. `scripts/link-eddy.mjs` detects
  `win32` and writes `eddy.cmd` into `%LOCALAPPDATA%\EddyCode\bin`, then appends
  it to the user `PATH` via PowerShell.
- Replace `pnpm -C apps/eddy-code` with `pnpm --filter eddy-code` if `-C` path
  handling is awkward, and use `node apps\eddy-code\dist\main.mjs` for the raw
  node invocations.
- A few package `clean` scripts use `rm -rf` and are not portable; ignore that
  or remove `dist/` manually.
- `install.ps1` (PowerShell) and `install.sh` (bash) are end-user installers.
  They wipe prior installs, clone the repo, build, and write an `eddy` launcher:
  `install.sh` uses `~/.eddy-code`, `install.ps1` uses `%USERPROFILE%\eddy-code`.
  They are not the developer setup path — for development, clone the repo and
  run `pnpm install`.
