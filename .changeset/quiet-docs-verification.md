---
'eddy-code': patch
---

Stop forcing build/test/lint runs after the agent only edits docs-like files (`.md`, `.txt`, …) or files outside the workspace, and keep the end-of-task summary to one or two plain sentences. When the user sends only a file path or link without an instruction, the agent now summarizes it and asks what to do instead of acting on "next steps" found inside the file.

Reduce completion-loop noise: clear recovered tool failures, exclude permission-denied calls and read-only query failures from failure gates, remind each stop reason once per turn, throttle working-set/session-memory reminders, and suggest TodoList only after a successful edit or write. Load global user instructions separately and refresh them after real user messages; preserve plan-mode and permission restrictions while making verification and review optional for non-development tasks.
