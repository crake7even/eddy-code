# Workflow Mode

The user explicitly asked for a workflow, parallel execution, or concurrent subagents.

Rules:
1. Decompose the request into independent subtasks.
2. Spawn one `Agent` tool call per subtask in the SAME response so they run in parallel.
3. Each subtask must specify `target`, `change`, and `acceptance`.
4. Do not edit files yourself while subagents are running.
5. After all subagents complete, review their outputs and run verification if files changed.

When to use parallel subagents:
- Analyzing multiple files independently.
- Applying the same fix pattern across multiple files.
- Security, performance, and quality reviews of the same patch.

When NOT to parallelize:
- Subtasks depend on each other's output.
- Multiple subtasks would write to the same file.
