---
'eddy-code': patch
---

Keep the TUI transcript short while the agent works. A run of thinking and tool calls now shows a single live line describing the current action in plain Chinese (e.g. "正在读取文件 config.toml…", "等待你批准：运行命令 ls"), and collapses to "已使用 N 个工具 ›" once the agent starts answering; ctrl+o expands everything. Approval prompts ask in plain Chinese for every tool, explain why they are asking (sensitive file, git internals, outside the project), and label the "allow for this session" choice by its real scope. Approval results read like "已批准：运行命令 ls" and sit under the tool call they belong to.
