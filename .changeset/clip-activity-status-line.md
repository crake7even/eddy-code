---
'eddy-code': patch
---

Fix the TUI freezing when the live status line is wider than the terminal, for example "等待你批准：运行命令 …" with a long command in a narrow window. The line is now clipped to the terminal width, so the approval panel shows and input keeps working.
