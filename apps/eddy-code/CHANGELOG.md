# eddy-code

## 0.6.9

### Patch Changes

- [`baccde3`](https://github.com/crake7even/eddy-code/commit/baccde3591d6d46186859bd5c7fc8bfb68f304c5) - Fix the TUI freezing when the live status line is wider than the terminal, for example "等待你批准：运行命令 …" with a long command in a narrow window. The line is now clipped to the terminal width, so the approval panel shows and input keeps working.

- [`a201eb0`](https://github.com/crake7even/eddy-code/commit/a201eb0b18ada7ae72ff5726d8f120cb5bad91e7) - Add `/goal budget` to set a stop condition for the current goal from the TUI: `/goal budget tokens 5m`, `/goal budget turns 100`, or `/goal budget time 30m`. It works while the goal is running; after a goal stops on its budget, raise the budget and run `/goal resume`.

- [`e85e7fc`](https://github.com/crake7even/eddy-code/commit/e85e7fcfe2ddd2ea6be3d5c11507176f587a6842) - More credential files are now treated as sensitive: `.netrc`, `.git-credentials`, `.pypirc`, `~/.npmrc`, `.kube/config`, `.docker/config.json`, Eddy Code's own `config.toml`, and everything under `.ssh/` and `.gnupg/` except public keys. A project's own `.npmrc` stays readable.

## 0.6.8

### Patch Changes

- [`d818a41`](https://github.com/crake7even/eddy-code/commit/d818a4172ff31be31403a4d0cb99887857fe2434) - Auto permission mode no longer approves every Bash command: commands that read credentials or dump the environment, send data over the network (`curl -d`, `nc`, `scp`, …), pipe into a shell, run `sudo`, or destroy data (`rm -rf` outside the project, `git push --force`, `git reset --hard`) are now denied. Web fetches also follow redirects hop by hop and refuse hosts that resolve to private addresses.

## 0.6.7

### Patch Changes

- Auto permission mode no longer silently approves risky file access: reading or writing sensitive files (`.env`, SSH keys, credentials), writing into `.git` control paths, and writing outside the working directory are now denied, since auto mode has nobody to ask. Reads elsewhere stay approved.

- When a tool call needs approval but no approval channel is available, the call is now blocked instead of silently approved. In the default (manual) permission mode, `FetchURL`, `WebSearch` and `MakeSkillApply` now ask before running instead of being approved automatically. Approving `FetchURL` for the session covers the same website only; approving `WebSearch` for the session covers all searches.

- Stop re-posting global user instructions after every user message: they are re-injected only when the rules file changes or every few real user prompts as a refresher, since the system prompt already carries them.

- Keep the TUI transcript short while the agent works. A run of thinking and tool calls now shows a single live line describing the current action in plain Chinese (e.g. "正在读取文件 config.toml…", "等待你批准：运行命令 ls"), and collapses to "已使用 N 个工具 ›" once the agent starts answering; ctrl+o expands everything. Approval prompts ask in plain Chinese for every tool, explain why they are asking (sensitive file, git internals, outside the project), and label the "allow for this session" choice by its real scope. Approval results read like "已批准：运行命令 ls" and sit under the tool call they belong to.

- Stop forcing build/test/lint runs after the agent only edits docs-like files (`.md`, `.txt`, …) or files outside the workspace, and keep the end-of-task summary to one or two plain sentences. When the user sends only a file path or link without an instruction, the agent now summarizes it and asks what to do instead of acting on "next steps" found inside the file.

  Reduce completion-loop noise: clear recovered tool failures, exclude permission-denied calls and read-only query failures from failure gates, remind each stop reason once per turn, throttle working-set/session-memory reminders, and suggest TodoList only after a successful edit or write. Load global user instructions separately and refresh them after real user messages; preserve plan-mode and permission restrictions while making verification and review optional for non-development tasks.

- Stop waiting forever on a stalled model stream: if the provider sends no data for 120 seconds, the request now fails with a retryable timeout and is retried automatically instead of leaving the session spinning.

- Fix the transcript being duplicated in terminal scrollback. Full redraws (resize, theme switch, approval preview, off-screen updates) now repaint only the viewport instead of re-printing the whole history; resuming a session replays its history once into a cleared scrollback. The welcome panel's "recent sessions" times no longer tick and trigger redraws.

## 0.6.6

### Patch Changes

- Fix Windows Terminal startup scrollback behavior. After launching Eddy Code, scrolling no longer reveals the PowerShell prompt and command output from before startup, while normal scrolling through Eddy Code's own terminal content remains available.

## 0.6.5

### Patch Changes

- Improve Windows cc-connect onboarding and service handling. Eddy Code now uses a safer PM2 command path for cc-connect, preserves Telegram platform tokens while adding detected proxy settings, reports PM2/proxy diagnostics more clearly, and avoids terminal scrollback jumps during TUI full redraws.

## 0.6.4

### Patch Changes

- Improve cc-connect setup for Eddy Code. The stream-json compatibility layer now accepts `--append-system-prompt-file`, Windows setup uses a no-space wrapper command instead of deprecated `cli_path`, existing Weixin tokens are preserved during config repair, and setup guidance now explains QR authentication and PM2 status more clearly.
