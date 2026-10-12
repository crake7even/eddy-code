---
'eddy-code': patch
---

Stop forcing build/test/lint runs after the agent only edits docs-like files (`.md`, `.txt`, …) or files outside the workspace, and keep the end-of-task summary to one or two plain sentences. When the user sends only a file path or link without an instruction, the agent now summarizes it and asks what to do instead of acting on "next steps" found inside the file.
